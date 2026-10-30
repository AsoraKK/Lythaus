import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { diagnosePagesAliasEvidence, reducePagesAliasEvidence } from './reduce-pages-alias-evidence.mjs';

const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/lythaus-web`;
const MAX_RESPONSE = 8 * 1024 * 1024;
const MAX_OBSERVATION = 32 * 1024 * 1024;
const MAX_PAGES = 100;
const DEPLOYMENTS_PER_PAGE = 25;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUEST_STAGES = new Set(['project', 'domain', 'deployments']);
const RESPONSE_DETAILS = new Set([
  'body_missing', 'body_too_large', 'body_invalid_json', 'body_unreadable', 'envelope_invalid',
  'project_id_invalid', 'project_name_invalid', 'project_branch_invalid', 'project_subdomain_invalid', 'project_subdomain_missing',
  'domain_name_invalid', 'domain_status_invalid', 'result_invalid', 'result_too_large',
  'pagination_info_missing', 'pagination_info_invalid', 'pagination_page_missing', 'pagination_page_invalid',
  'pagination_per_page_missing', 'pagination_per_page_invalid', 'pagination_total_count_missing',
  'pagination_total_count_invalid', 'pagination_total_pages_invalid', 'pagination_count_invalid',
  'deployment_id_invalid', 'deployment_project_id_invalid', 'deployment_project_name_invalid',
  'deployment_environment_invalid', 'deployment_is_skipped_invalid', 'deployment_stage_name_invalid',
  'deployment_stage_status_invalid', 'deployment_branch_invalid', 'deployment_commit_sha_invalid',
  'deployment_commit_dirty_invalid', 'deployment_url_invalid', 'deployment_aliases_invalid',
  'deployment_fields_invalid', 'deployment_aliases_missing', 'deployment_aliases_type_invalid',
  'deployment_aliases_limit_exceeded', 'deployment_alias_type_invalid', 'deployment_alias_too_long',
  'deployment_record_invalid', 'deployment_id_format_invalid', 'deployment_id_duplicate', 'deployment_project_binding_invalid',
  'deployment_environment_value_invalid', 'deployment_stage_name_value_invalid', 'deployment_stage_status_value_invalid',
  'deployment_branch_format_invalid', 'deployment_commit_sha_format_invalid', 'deployment_url_format_invalid',
  'deployment_url_duplicate', 'deployment_alias_duplicate', 'deployment_alias_url_invalid',
  'unexpected_or_sensitive_input_field', 'pagination_incomplete', 'aliases_invalid', 'target_alias_ambiguous',
  'deployment_invalid', 'timestamp_invalid', 'project_binding_invalid', 'domain_binding_invalid', 'domain_inactive',
  'alias_match_invalid', 'alias_match_ambiguous', 'observation_changed',
]);

class ObservationFailure extends Error {
  constructor(code, httpStatus, requestStage, detail, issues) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
    this.requestStage = REQUEST_STAGES.has(requestStage) ? requestStage : undefined;
    this.detail = RESPONSE_DETAILS.has(detail) ? detail : undefined;
    this.issues = Array.isArray(issues) ? [...new Set(issues.filter(issue => RESPONSE_DETAILS.has(issue)))].sort() : undefined;
  }
}

function string(value, detail) {
  if (typeof value !== 'string' || value.length > 2048) throw new ObservationFailure('provider_response_invalid', undefined, undefined, detail);
  return value;
}

function boolean(value, detail) {
  if (typeof value !== 'boolean') throw new ObservationFailure('provider_response_invalid', undefined, undefined, detail);
  return value;
}

function optionalString(value, detail) {
  return value == null ? null : string(value, detail);
}

function optionalBoolean(value, detail) {
  return value == null ? null : boolean(value, detail);
}

function integer(value, detail) {
  if (!Number.isSafeInteger(value)) throw new ObservationFailure('provider_response_invalid', undefined, undefined, detail);
  return value;
}

async function readJson(response, budget) {
  if (!response.body) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'body_missing');
  const chunks = [];
  let size = 0;
  try {
    for await (const value of response.body) {
      const chunk = Buffer.from(value);
      size += chunk.length;
      budget.bytes += chunk.length;
      chunks.push(chunk);
      if (size > MAX_RESPONSE) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'body_too_large');
      if (budget.bytes > MAX_OBSERVATION) throw new ObservationFailure('observation_limit_exceeded');
    }
    const bytes = Buffer.concat(chunks, size);
    try {
      try { return JSON.parse(bytes.toString('utf8')); }
      catch { throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'body_invalid_json'); }
    }
    finally { bytes.fill(0); }
  } catch (error) {
    if (error instanceof ObservationFailure) throw error;
    throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'body_unreadable');
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function projectResult(data) {
  const project = data?.result;
  if (project?.subdomain === undefined) throw new ObservationFailure('project_metadata_missing', undefined, undefined, 'project_subdomain_missing');
  return { accountId: ACCOUNT_ID, id: string(project?.id, 'project_id_invalid'), name: string(project?.name, 'project_name_invalid'),
    productionBranch: string(project?.production_branch, 'project_branch_invalid'), subdomain: string(project?.subdomain, 'project_subdomain_invalid') };
}

function domainResult(item) {
  return { name: string(item?.name, 'domain_name_invalid'), status: string(item?.status, 'domain_status_invalid') };
}

function deploymentResult(item, issues) {
  const metadata = item?.deployment_trigger?.metadata, stage = item?.latest_stage;
  let invalid = false;
  function field(fn) {
    try { return fn(); }
    catch (error) {
      if (!(error instanceof ObservationFailure) || !RESPONSE_DETAILS.has(error.detail)) throw error;
      issues.add(error.detail);
      invalid = true;
      return null;
    }
  }
  const aliases = field(() => {
    if (item?.aliases === null) return null;
    if (item?.aliases === undefined) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'deployment_aliases_missing');
    if (!Array.isArray(item.aliases)) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'deployment_aliases_type_invalid');
    if (item.aliases.length > 1000) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'deployment_aliases_limit_exceeded');
    let aliasInvalid = false;
    for (const value of item.aliases) {
      if (typeof value !== 'string') { issues.add('deployment_alias_type_invalid'); aliasInvalid = true; }
      else if (value.length > 2048) { issues.add('deployment_alias_too_long'); aliasInvalid = true; }
    }
    if (aliasInvalid) { invalid = true; return null; }
    return item.aliases;
  });
  const result = { id: field(() => string(item?.id, 'deployment_id_invalid')),
    projectId: field(() => string(item?.project_id, 'deployment_project_id_invalid')),
    projectName: field(() => string(item?.project_name, 'deployment_project_name_invalid')),
    environment: field(() => string(item?.environment, 'deployment_environment_invalid')),
    isSkipped: field(() => optionalBoolean(item?.is_skipped, 'deployment_is_skipped_invalid')),
    stageName: field(() => optionalString(stage?.name, 'deployment_stage_name_invalid')),
    stageStatus: field(() => optionalString(stage?.status, 'deployment_stage_status_invalid')),
    branch: field(() => optionalString(metadata?.branch, 'deployment_branch_invalid')),
    commitSha: field(() => optionalString(metadata?.commit_hash, 'deployment_commit_sha_invalid')),
    commitDirty: field(() => optionalBoolean(metadata?.commit_dirty, 'deployment_commit_dirty_invalid')),
    url: field(() => string(item?.url, 'deployment_url_invalid')), aliases };
  return invalid ? null : result;
}

function pageResult(data, projectItem) {
  const info = data?.result_info;
  if (info == null) throw new ObservationFailure('pagination_metadata_missing', undefined, undefined, 'pagination_info_missing');
  if (typeof info !== 'object' || Array.isArray(info)) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'pagination_info_invalid');
  if (!Array.isArray(data?.result)) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'result_invalid');
  if (data.result.length > DEPLOYMENTS_PER_PAGE) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'result_too_large');
  if (info.count !== undefined && (!Number.isSafeInteger(info.count) || info.count !== data.result.length)) {
    throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'pagination_count_invalid');
  }
  for (const [key, detail] of [['page', 'pagination_page_missing'], ['per_page', 'pagination_per_page_missing'],
    ['total_count', 'pagination_total_count_missing']]) {
    if (info[key] === undefined) throw new ObservationFailure('pagination_metadata_missing', undefined, undefined, detail);
  }
  const page = integer(info.page, 'pagination_page_invalid');
  const perPage = integer(info.per_page, 'pagination_per_page_invalid');
  const totalCount = integer(info.total_count, 'pagination_total_count_invalid');
  if (perPage < 1 || totalCount < 0) throw new ObservationFailure('pagination_incomplete');
  // Cloudflare documents total_pages as optional; the reducer independently checks
  // this derived count against every returned page and record.
  const expectedPages = Math.max(1, Math.ceil(totalCount / perPage));
  const totalPages = info.total_pages === undefined ? expectedPages : integer(info.total_pages, 'pagination_total_pages_invalid');
  if (totalPages !== expectedPages) throw new ObservationFailure('pagination_incomplete');
  return { page, perPage, totalPages, totalCount, records: data.result.map(projectItem) };
}

async function request(url, token, fetchImpl, project, budget, requestStage) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch { throw new ObservationFailure('provider_read_failed', undefined, requestStage); }
  if (!response?.ok || response.status !== 200 || response.redirected) {
    const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599
      ? response.status : undefined;
    throw new ObservationFailure('provider_read_failed', status, requestStage);
  }
  let payload;
  try {
    payload = await readJson(response, budget);
    if (payload?.success !== true) throw new ObservationFailure('provider_response_invalid', undefined, undefined, 'envelope_invalid');
    return project(payload);
  } catch (error) {
    if (error instanceof ObservationFailure && ['provider_response_invalid', 'project_metadata_missing', 'pagination_metadata_missing',
      'pagination_incomplete', 'observation_limit_exceeded'].includes(error.code)) {
      throw new ObservationFailure(error.code, undefined, requestStage, error.detail);
    }
    throw new ObservationFailure('provider_response_invalid', undefined, requestStage);
  }
  finally { payload = undefined; }
}

async function pages(endpoint, token, fetchImpl, projectItem, budget) {
  const collected = [];
  const issues = new Set();
  let totalPages = 1, perPage = DEPLOYMENTS_PER_PAGE, totalCount;
  try {
    for (let page = 1; page <= totalPages; page++) {
      const url = `${API}/${endpoint}?page=${page}&per_page=${perPage}`;
      const item = await request(url, token, fetchImpl, data => pageResult(data, value => projectItem(value, issues)), budget, 'deployments');
      if (item.page !== page || item.perPage < 1 || item.perPage > DEPLOYMENTS_PER_PAGE
        || item.totalPages < 1 || item.totalPages > MAX_PAGES || item.totalCount < 0
        || (page > 1 && (item.totalPages !== totalPages || item.totalCount !== totalCount || item.perPage !== perPage))) {
        throw new ObservationFailure('pagination_incomplete', undefined, 'deployments');
      }
      totalPages = item.totalPages;
      totalCount = item.totalCount;
      perPage = item.perPage;
      collected.push(item);
    }
  } catch (error) {
    if (error instanceof ObservationFailure && issues.size) {
      throw new ObservationFailure(error.code, error.httpStatus, error.requestStage, error.detail, [...issues]);
    }
    throw error;
  }
  if (issues.size) throw new ObservationFailure('provider_response_invalid', undefined, 'deployments', 'deployment_fields_invalid', [...issues]);
  return collected;
}

async function snapshot(token, fetchImpl, now, budget) {
  const project = await request(API, token, fetchImpl, projectResult, budget, 'project');
  const domain = await request(`${API}/domains/app.lythaus.co`, token, fetchImpl, data => domainResult(data?.result), budget, 'domain');
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
  catch (error) {
    let issues;
    try { issues = diagnosePagesAliasEvidence({ first, second }); } catch { /* remain blocked without diagnostics */ }
    throw new ObservationFailure('evidence_invalid', undefined, undefined, error?.message, issues);
  }
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
    const allowed = new Set(['diagnostic_context_invalid', 'provider_read_failed', 'provider_response_invalid', 'project_metadata_missing',
      'pagination_metadata_missing', 'pagination_incomplete', 'observation_limit_exceeded', 'evidence_invalid']);
    const reason = error instanceof ObservationFailure && allowed.has(error.code) ? error.code : 'diagnostic_failed';
    const output = { status: 'BLOCKED', authorization: 'NONE', reason };
    if (error instanceof ObservationFailure && Number.isInteger(error.httpStatus)) output.httpStatus = error.httpStatus;
    if (error instanceof ObservationFailure && REQUEST_STAGES.has(error.requestStage)) output.requestStage = error.requestStage;
    if (error instanceof ObservationFailure && RESPONSE_DETAILS.has(error.detail)) output.detail = error.detail;
    if (error instanceof ObservationFailure && error.issues?.length) output.issues = error.issues;
    console.error(JSON.stringify(output));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
