import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const account = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const worker = 'lythaus-admin-api-development';
const provider = 'https://api.cloudflare.com/client/v4';
const dataset = 'logs.workersLogs';
const path = '/api/admin/health';
const hour = 60 * 60 * 1000;
// Canonical release 40576668956 and authenticated Cloudflare inventory 44719053793.
const deploymentId = '620ceda7-a4d8-4c20-99cb-b3f58ff18e20';
const versionId = '14f1b832-5f0e-45a3-a031-7fe775d53109';

function observation(inputs, now) {
  if (!inputs || !Number.isFinite(now)) return null;
  const id = inputs.health_denial_correlation;
  const end = inputs.health_observed_before_utc;
  if (inputs.inspect_subject_recovery === true || inputs.inspect_subject_recovery === 'true'
    || typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)
    || typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(end)) return null;
  const until = Date.parse(end);
  const from = until - hour;
  if (!Number.isFinite(until) || new Date(until).toISOString() !== end.replace('Z', '.000Z')
    || until > now || from < now - 7 * 24 * hour) return null;
  return { id, from, until };
}

function coveredWindow(payload, window) {
  const deployments = payload?.result?.deployments;
  if (payload?.success !== true || payload.errors?.length || !Array.isArray(deployments) || !deployments.length) return false;
  const times = deployments.map(row => Date.parse(row?.created_on));
  if (!times.every(Number.isFinite)) return false;
  // The API returns the latest deployments. Require the newest to predate the entire window.
  const latest = Math.max(...times);
  const active = deployments[times.indexOf(latest)];
  return latest < window.from && times.filter(time => time === latest).length === 1
    && active.id === deploymentId && active.versions?.length === 1
    && active.versions[0]?.version_id === versionId && active.versions[0]?.percentage === 100;
}

function countQuery(metadata, window) {
  if (metadata?.errors?.length || metadata?.success === false || metadata?.datasets?.length !== 1
    || metadata.datasets[0]?.name !== dataset) return null;
  const columns = metadata.datasets[0].columns;
  if (!Array.isArray(columns)) return null;
  const types = new Map(columns.map(column => [column?.name, column?.data_type]));
  if (types.size !== columns.length || types.get('accountTag') !== 'String' || types.get('scriptName') !== 'String'
    || !['DateTime', 'DateTime64(3)'].includes(types.get('timestamp'))) return null;
  const predicates = [];
  const params = { account, worker, start: new Date(window.from).toISOString(), end: new Date(window.until).toISOString() };
  if (types.get('attributes') === 'Json') {
    predicates.push("(attributes['correlationId'] = $reference AND attributes['route'] = $route AND attributes['service'] = $service AND attributes['errorCode'] = $error)");
    Object.assign(params, { reference: window.id, route: path, service: 'lythaus-admin-api', error: 'admin_role_required' });
  }
  for (const column of ['message', 'body']) {
    if (types.get(column) !== 'String') continue;
    // Match the serialized fields as well as structured logs. Only the surrounding % are wildcards.
    predicates.push(`(${column} LIKE $referenceFragment AND ${column} LIKE $routeFragment AND ${column} LIKE $serviceFragment)`);
    params.referenceFragment = `%"correlationId":"${window.id}"%`;
    params.routeFragment = `%"route":"${path}"%`;
    params.serviceFragment = '%"service":"lythaus-admin-api"%';
  }
  if (!predicates.length) return null;
  return {
    query: `SELECT COUNT(*) AS matched FROM logs.workersLogs
WHERE accountTag = $account AND scriptName = $worker AND timestamp >= $start AND timestamp <= $end
AND (${predicates.join(' OR ')})`,
    params,
  };
}

async function readJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status !== 200) {
    await response.body?.cancel();
    return { status: response.status };
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > 256 * 1024) throw new Error('response_too_large');
    chunks.push(chunk);
  }
  return { status: 200, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}

export async function traceAdminHealth({ env, inputs, fetchImpl = fetch, now = Date.now() }) {
  const receipt = { status: 'input_unavailable', pinnedDeploymentCoveredWindow: false, sampledHealthEventMatched: null };
  const window = observation(inputs, now);
  if (!window || env.GITHUB_REPOSITORY_ID !== '1010752912' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REF_PROTECTED !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_RUN_ATTEMPT !== '1' || !env.CLOUDFLARE_API_TOKEN) return receipt;
  const headers = { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, accept: 'application/json' };
  let stage = 'deployments';
  try {
    const deployments = await readJson(fetchImpl, `${provider}/accounts/${account}/workers/scripts/${worker}/deployments`, { method: 'GET', headers });
    if (deployments.status !== 200) return { ...receipt, status: 'deployments_http_error', httpStatus: deployments.status };
    if (!coveredWindow(deployments.data, window)) return { ...receipt, status: 'serving_window_unverified' };
    receipt.pinnedDeploymentCoveredWindow = true;

    stage = 'dataset';
    const catalog = new URL(`${provider}/analytics/sql/introspection`);
    catalog.search = new URLSearchParams({ account_tag: account, dataset_name: dataset, include_columns: 'true' });
    const metadata = await readJson(fetchImpl, catalog.href, { method: 'GET', headers });
    if (metadata.status !== 200) return { ...receipt, status: 'dataset_http_error', httpStatus: metadata.status };
    const query = countQuery(metadata.data, window);
    if (!query) return { ...receipt, status: 'dataset_columns_unavailable' };

    stage = 'aggregate';
    const result = await readJson(fetchImpl, `${provider}/analytics/sql`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(query),
    });
    if (result.status !== 200) return { ...receipt, status: 'aggregate_http_error', httpStatus: result.status };
    const rows = result.data?.data;
    if (result.data?.errors?.length || result.data?.success === false || !Array.isArray(rows)
      || rows.length !== 1 || Object.keys(rows[0] ?? {}).join() !== 'matched') {
      return { ...receipt, status: 'aggregate_result_unverified' };
    }
    const value = rows[0].matched;
    const matched = typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value) ? Number(value) : value;
    if (!Number.isFinite(matched) || matched < 0) return { ...receipt, status: 'aggregate_result_unverified' };
    return { ...receipt, status: matched > 0 ? 'sampled_health_event_observed' : 'no_sampled_match', sampledHealthEventMatched: matched > 0 };
  } catch {
    return { ...receipt, status: `${stage}_read_unverified` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let receipt = { status: 'input_unavailable' };
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    receipt = await traceAdminHealth({ env: process.env, inputs: event.inputs ?? {} });
  } catch { /* Keep private inputs and provider errors out of logs. */ }
  console.log(JSON.stringify(receipt));
  if (receipt.status !== 'sampled_health_event_observed') process.exitCode = 1;
}
