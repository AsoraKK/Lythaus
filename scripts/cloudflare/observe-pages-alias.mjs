import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { reducePagesAliasEvidence } from './reduce-pages-alias-evidence.mjs';

const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/lythaus-web`;
const MAX_RESPONSE = 8 * 1024 * 1024;
const MAX_OBSERVATION = 32 * 1024 * 1024;
const MAX_PAGES = 100;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

class ObservationFailure extends Error {
  constructor(code, httpStatus) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function string(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new ObservationFailure('provider_response_invalid');
  return value;
}

function boolean(value) {
  if (typeof value !== 'boolean') throw new ObservationFailure('provider_response_invalid');
  return value;
}

function optionalString(value) {
  return value == null ? null : string(value);
}

function optionalBoolean(value) {
  return value == null ? null : boolean(value);
}

function integer(value) {
  if (!Number.isSafeInteger(value)) throw new ObservationFailure('provider_response_invalid');
  return value;
}

async function readJson(response, budget) {
  if (!response.body) throw new ObservationFailure('provider_response_invalid');
  const chunks = [];
  let size = 0;
  try {
    for await (const value of response.body) {
      const chunk = Buffer.from(value);
      size += chunk.length;
      budget.bytes += chunk.length;
      chunks.push(chunk);
      if (size > MAX_RESPONSE) throw new ObservationFailure('provider_response_invalid');
      if (budget.bytes > MAX_OBSERVATION) throw new ObservationFailure('observation_limit_exceeded');
    }
    const bytes = Buffer.concat(chunks, size);
    try { return JSON.parse(bytes.toString('utf8')); }
    finally { bytes.fill(0); }
  } catch (error) {
    if (error instanceof ObservationFailure && error.code === 'observation_limit_exceeded') throw error;
    throw new ObservationFailure('provider_response_invalid');
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function projectResult(data) {
  const project = data?.result;
  return { accountId: ACCOUNT_ID, id: string(project?.id), name: string(project?.name),
    productionBranch: string(project?.production_branch), subdomain: string(project?.subdomain) };
}

function domainResult(item) {
  return { name: string(item?.name), status: string(item?.status) };
}

function deploymentResult(item) {
  const metadata = item?.deployment_trigger?.metadata, stage = item?.latest_stage;
  if (!Array.isArray(item?.aliases) || item.aliases.length > 1000) throw new ObservationFailure('provider_response_invalid');
  return { id: string(item?.id), projectId: string(item?.project_id), projectName: string(item?.project_name),
    environment: string(item?.environment), isSkipped: optionalBoolean(item?.is_skipped), stageName: optionalString(stage?.name),
    stageStatus: optionalString(stage?.status), branch: optionalString(metadata?.branch), commitSha: optionalString(metadata?.commit_hash),
    commitDirty: optionalBoolean(metadata?.commit_dirty), url: string(item?.url), aliases: item.aliases.map(string) };
}

function pageResult(data, projectItem) {
  const info = data?.result_info;
  if (info == null) throw new ObservationFailure('pagination_metadata_missing');
  if (!Array.isArray(data?.result) || data.result.length > 100) throw new ObservationFailure('provider_response_invalid');
  if (info.count !== undefined && (!Number.isSafeInteger(info.count) || info.count !== data.result.length)) {
    throw new ObservationFailure('provider_response_invalid');
  }
  return { page: integer(info?.page), perPage: integer(info?.per_page), totalPages: integer(info?.total_pages),
    totalCount: integer(info?.total_count), records: data.result.map(projectItem) };
}

async function request(url, token, fetchImpl, project, budget) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch { throw new ObservationFailure('provider_read_failed'); }
  if (!response?.ok || response.status !== 200 || response.redirected) {
    const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599
      ? response.status : undefined;
    throw new ObservationFailure('provider_read_failed', status);
  }
  let payload;
  try {
    payload = await readJson(response, budget);
    if (payload?.success !== true) throw new ObservationFailure('provider_response_invalid');
    return project(payload);
  } catch (error) {
    if (error instanceof ObservationFailure && ['pagination_metadata_missing', 'observation_limit_exceeded'].includes(error.code)) throw error;
    throw new ObservationFailure('provider_response_invalid');
  }
  finally { payload = undefined; }
}

async function pages(endpoint, token, fetchImpl, projectItem, budget) {
  const collected = [];
  let totalPages = 1, perPage = 100, totalCount;
  for (let page = 1; page <= totalPages; page++) {
    const url = `${API}/${endpoint}?page=${page}&per_page=${perPage}`;
    const item = await request(url, token, fetchImpl, data => pageResult(data, projectItem), budget);
    if (item.page !== page || item.perPage < 1 || item.perPage > 100
      || item.totalPages < 1 || item.totalPages > MAX_PAGES || item.totalCount < 0
      || (page > 1 && (item.totalPages !== totalPages || item.totalCount !== totalCount || item.perPage !== perPage))) {
      throw new ObservationFailure('pagination_incomplete');
    }
    totalPages = item.totalPages;
    totalCount = item.totalCount;
    perPage = item.perPage;
    collected.push(item);
  }
  return collected;
}

async function snapshot(token, fetchImpl, now, budget) {
  const project = await request(API, token, fetchImpl, projectResult, budget);
  const domain = await request(`${API}/domains/app.lythaus.co`, token, fetchImpl, data => domainResult(data?.result), budget);
  const deploymentPages = await pages('deployments', token, fetchImpl, deploymentResult, budget);
  return { at: now(), project, domain, deploymentPages };
}

/** Fixed GETs; raw provider data remains transient and is never reported. */
export async function collectPagesAliasEvidence({ token, sourceSha, runId, runAttempt, fetchImpl = fetch,
  now = () => new Date().toISOString() } = {}) {
  if (typeof token !== 'string' || !token || typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha)
    || typeof runId !== 'string' || !/^[1-9][0-9]*$/.test(runId)
    || typeof runAttempt !== 'string' || !/^[1-9][0-9]*$/.test(runAttempt)
    || typeof fetchImpl !== 'function' || typeof now !== 'function') throw new ObservationFailure('diagnostic_context_invalid');
  const startedAt = now();
  const budget = { bytes: 0 };
  const first = await snapshot(token, fetchImpl, now, budget);
  const second = await snapshot(token, fetchImpl, now, budget);
  const completedAt = now();
  let observation;
  try { observation = reducePagesAliasEvidence({ first, second }); }
  catch { throw new ObservationFailure('evidence_invalid'); }
  if (typeof startedAt !== 'string' || !ISO_UTC.test(startedAt) || !Number.isFinite(Date.parse(startedAt))
    || new Date(startedAt).toISOString() !== startedAt
    || typeof completedAt !== 'string' || !ISO_UTC.test(completedAt) || !Number.isFinite(Date.parse(completedAt))
    || new Date(completedAt).toISOString() !== completedAt
    || Date.parse(startedAt) > Date.parse(first.at) || Date.parse(second.at) > Date.parse(completedAt)) {
    throw new ObservationFailure('diagnostic_context_invalid');
  }
  return Object.freeze({ ...observation, acquisitionStartedAt: startedAt, acquisitionCompletedAt: completedAt,
    sourceSha, workflowRunId: runId, workflowRunAttempt: runAttempt });
}

function assertContext(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY_ID !== '1010752912'
    || typeof env.GITHUB_REPOSITORY !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY)
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REF_PROTECTED !== 'true'
    || env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/.github/workflows/cloudflare-domain-audit.yml@refs/heads/main`
    || env.RUNNER_DEBUG === '1' || env.ACTIONS_STEP_DEBUG === 'true') {
    throw new ObservationFailure('diagnostic_context_invalid');
  }
}

async function main() {
  try {
    assertContext(process.env);
    const result = await collectPagesAliasEvidence({ token: process.env.CLOUDFLARE_API_TOKEN,
      sourceSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
    console.log(JSON.stringify(result));
  } catch (error) {
    const allowed = new Set(['diagnostic_context_invalid', 'provider_read_failed', 'provider_response_invalid',
      'pagination_metadata_missing', 'pagination_incomplete', 'observation_limit_exceeded', 'evidence_invalid']);
    const reason = error instanceof ObservationFailure && allowed.has(error.code) ? error.code : 'diagnostic_failed';
    const output = { status: 'BLOCKED', authorization: 'NONE', reason };
    if (error instanceof ObservationFailure && Number.isInteger(error.httpStatus)) output.httpStatus = error.httpStatus;
    console.error(JSON.stringify(output));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
