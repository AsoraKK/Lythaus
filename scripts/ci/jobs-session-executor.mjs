#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { ACCOUNT, TARGETS, UUID, prepare, execute, recover, validateRecord, fail } from '../release/jobs-session-lifecycle.mjs';

export const WORKFLOW = 'jobs-session-one-shot.yml';
export const RECOVERY_WORKFLOW = 'jobs-session-recovery.yml';
export const REPO = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const CF = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers`;
const GH = `https://api.github.com/repos/${REPO}`;
// Complete documented GET Worker fields: retain configuration, identity and
// routing/reference guards; omit only provider-maintained read timestamps.
const WORKER_SETTINGS = ['id', 'name', 'logpush', 'observability', 'references',
  'subdomain', 'tags', 'tail_consumers', 'previews_base_config'];
const WORKER_READ_METADATA = ['created_on', 'updated_on', 'deployed_on'];
export function workerSettingsProjection(value) {
  const object = entry => entry && typeof entry === 'object' && !Array.isArray(entry);
  if (!object(value) || Object.keys(value).some(key => ![...WORKER_SETTINGS, ...WORKER_READ_METADATA].includes(key))
    || WORKER_SETTINGS.filter(key => key !== 'previews_base_config').some(key => !(key in value))
    || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name
    || typeof value.logpush !== 'boolean' || !object(value.observability) || !object(value.references)
    || !object(value.subdomain) || !Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== 'string')
    || !Array.isArray(value.tail_consumers) || value.tail_consumers.some(entry => !object(entry) || typeof entry.name !== 'string')
    || ('previews_base_config' in value && !object(value.previews_base_config))) fail('settings_capability_unavailable');
  // Keep complete nested values: security, binding and future nested setting
  // changes must change the hash. Unknown top-level fields fail closed.
  return Object.fromEntries(WORKER_SETTINGS.filter(key => key in value).map(key => [key, value[key]]));
}
export async function boundedJson(fetchImpl, url, init, { timeoutMs = 10_000, maxBytes = 16_777_216, missing = false, statuses = [200, 201] } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  let reader;
  let timer;
  try {
    return await Promise.race([new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('request_timeout')); }, timeoutMs);
    }), (async () => {
      const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal });
      if (controller.signal.aborted) fail('request_timeout');
      if (missing && response.status === 404) return null;
      if (!statuses.includes(response.status) || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') fail('request_unavailable');
      if (!response.body) fail('response_invalid');
      reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (controller.signal.aborted) fail('request_timeout');
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBytes) fail('response_oversized');
        chunks.push(chunk.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    })()]);
  } catch { fail('request_unavailable'); }
  finally { clearTimeout(timer); controller.abort(); init.signal?.removeEventListener('abort', abort); void reader?.cancel().catch(() => undefined); }
}
export function createApi({ cloudflareToken, githubToken, readinessToken, runId, fetchImpl = fetch }) {
  if (!cloudflareToken || !githubToken) fail('protected_credentials_missing');
  const cf = async (route, method = 'GET', body, missing = false) => {
    if (method === 'POST' || method === 'DELETE') assertSharedWorkerLock();
    const value = await boundedJson(fetchImpl, CF + route, { method,
      headers: { authorization: `Bearer ${cloudflareToken}`, accept: 'application/json', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { missing });
    if (missing && value === null) return null;
    if (value?.success !== true || (method !== 'DELETE' && !('result' in value))) fail('provider_result_unavailable');
    return value.result;
  };
  const gh = route => boundedJson(fetchImpl, GH + route, { method: 'GET',
    headers: { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } }, { maxBytes: 1_048_576 });
  const worker = component => {
    if (!(component in TARGETS)) fail('target_invalid');
    return TARGETS[component];
  };
  const getVersion = (component, id) => {
    if (!UUID.test(id)) fail('version_invalid');
    return cf(`/workers/${worker(component)}/versions/${id}?include=modules`);
  };
  return {
    gh,
    async releaseGuard() {
      const runs = await gh('/actions/runs?status=in_progress&per_page=100');
      if (!Array.isArray(runs.workflow_runs) || runs.total_count > 100) fail('release_guard_unavailable');
      const mutators = new Set(['production-release.yml', 'native-workers-deploy.yml', 'deploy-public-waitlist.yml']);
      if (runs.workflow_runs.some(run => String(run.id) !== runId && mutators.has(run.path?.split('/').at(-1)))) fail('concurrent_release');
    },
    async snapshot(component, versionId) {
      const name = worker(component);
      const deployments = await cf(`/scripts/${name}/deployments`);
      if (!Array.isArray(deployments?.deployments) || !deployments.deployments.length) fail('deployment_unavailable');
      const settings = await cf(`/workers/${name}`);
      if (settings.name !== name || settings.subdomain?.enabled !== false || settings.subdomain?.previews_enabled !== false) fail('settings_unavailable');
      return { deployment: deployments.deployments[0], settings: workerSettingsProjection(settings), version: await getVersion(component, versionId) };
    },
    getVersion,
    createCandidate: (component, payload) => cf(`/workers/${worker(component)}/versions?deploy=false`, 'POST', payload),
    deploy: (component, versions) => cf(`/scripts/${worker(component)}/deployments`, 'POST', { strategy: 'percentage', versions }),
    async findCandidates(component, marker) {
      const found = [];
      for (let page = 1; page <= 5; page++) {
        const envelope = await boundedJson(fetchImpl, CF + `/workers/${worker(component)}/versions?page=${page}&per_page=100`, {
          method: 'GET', headers: { authorization: `Bearer ${cloudflareToken}`, accept: 'application/json' },
        });
        if (envelope?.success !== true || !Array.isArray(envelope.result) || !Number.isInteger(envelope.result_info?.total_pages)) fail('candidate_inventory_unavailable');
        for (const entry of envelope.result) {
          if (entry.annotations?.['workers/message'] === marker) found.push(await getVersion(component, entry.id));
        }
        if (envelope.result_info.total_pages <= page) return found;
      }
      fail('candidate_inventory_unavailable');
    },
    async deleteCandidate(component, id) {
      if (!UUID.test(id)) fail('version_invalid');
      await cf(`/workers/${worker(component)}/versions/${id}`, 'DELETE');
    },
    async versionExists(component, id) {
      if (!UUID.test(id)) fail('version_invalid');
      return await cf(`/workers/${worker(component)}/versions/${id}`, 'GET', undefined, true) !== null;
    },
    async probe(candidates, signal) {
      if (!readinessToken || Object.values(candidates).some(id => !UUID.test(id))) fail('readiness_credential_missing');
      return boundedJson(fetchImpl, 'https://api.lythaus.co/internal/readiness/jobs-reputation-session', { method: 'GET', signal,
        headers: { authorization: `Bearer ${readinessToken}`, accept: 'application/json',
          'Cloudflare-Workers-Version-Overrides': `${TARGETS.public}="${candidates.public}", ${TARGETS.jobs}="${candidates.jobs}"` } },
      { timeoutMs: 9_000, maxBytes: 4096, statuses: [200, 503] });
    },
  };
}
export function assertSharedWorkerLock(readFile = name => fs.readFileSync(name, 'utf8')) {
  const locked = value => value?.group === 'lythaus-production-workers' && value?.['cancel-in-progress'] === false;
  const canonical = value => value?.group === 'lythaus-canonical-production-release' && value?.['cancel-in-progress'] === false;
  const native = parse(readFile('.github/workflows/native-workers-deploy.yml'));
  const release = parse(readFile('.github/workflows/production-release.yml'));
  const diagnostic = parse(readFile(`.github/workflows/${WORKFLOW}`));
  const recovery = parse(readFile(`.github/workflows/${RECOVERY_WORKFLOW}`));
  const waitlist = parse(readFile('.github/workflows/deploy-public-waitlist.yml'));
  // Parent must coordinate the existing rollback writer before this can mutate.
  // A check immediately before POST cannot provide atomic provider isolation.
  if (!locked(native.concurrency) || !locked(release.jobs?.rollback?.concurrency)
    || !locked(waitlist.concurrency) || !locked(diagnostic.jobs?.diagnose?.concurrency) || !locked(recovery.jobs?.recover?.concurrency)
    || !canonical(release.concurrency) || !canonical(diagnostic.concurrency) || !canonical(recovery.concurrency)) fail('shared_worker_lock_unavailable');
}
export async function workflowGate(api, env, { recovery = false } = {}) {
  const runId = recovery ? env.RECOVER_RUN_ID : env.GITHUB_RUN_ID;
  if (env.GITHUB_REPOSITORY !== REPO || env.GITHUB_REF !== 'refs/heads/main' || env.REF_PROTECTED !== 'true'
    || env.GITHUB_RUN_ATTEMPT !== '1' || !/^[1-9][0-9]*$/.test(runId ?? '')
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) fail('protected_source_unavailable');
  const run = await api.gh(`/actions/runs/${runId}`);
  if (run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.path !== `.github/workflows/${WORKFLOW}`
    || String(run.run_attempt) !== '1' || run.repository?.full_name !== REPO
    || (!recovery && (run.head_sha !== env.GITHUB_SHA || run.status !== 'in_progress'))
    || (recovery && run.status !== 'completed')) fail('protected_run_unavailable');
  const recoveryWorkflow = await api.gh(`/actions/workflows/${RECOVERY_WORKFLOW}`);
  if (recoveryWorkflow.state !== 'active' || recoveryWorkflow.path !== `.github/workflows/${RECOVERY_WORKFLOW}`) fail('recovery_workflow_unavailable');
  if (!recovery) {
    const runs = await api.gh(`/actions/workflows/${WORKFLOW}/runs?per_page=100`);
    if (!Array.isArray(runs.workflow_runs) || runs.total_count > 100) fail('one_shot_history_unavailable');
    // Run/step history survives the seven-day receipt artifact. A known skipped
    // executor permits a new preflight; an attempted or unknown executor must
    // never silently replay a possibly completed SQL request.
    for (const previous of runs.workflow_runs.filter(value => String(value.id) !== runId)) {
      const jobs = await api.gh(`/actions/runs/${previous.id}/jobs?filter=all&per_page=100`);
      if (!Array.isArray(jobs.jobs) || !jobs.jobs.length || jobs.total_count > 100) fail('one_shot_history_unavailable');
      const executions = jobs.jobs.flatMap(job => job.steps ?? []).filter(step => step.name === 'Execute one diagnostic and verify restoration');
      if (!executions.length) fail('one_shot_history_unavailable');
      if (executions.some(step => step.conclusion !== 'skipped')) fail('one_shot_already_requested');
    }
  }
  return run;
}
const FILE = '.artifacts/jobs-session/recovery.json';
function write(name, value) {
  fs.mkdirSync('.artifacts/jobs-session', { recursive: true });
  fs.writeFileSync(`.artifacts/jobs-session/${name}.json`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export async function main(env = process.env) {
  const mode = process.argv[2];
  if (!['prepare', 'execute', 'recover'].includes(mode)) fail('action_invalid');
  const recovery = mode === 'recover';
  const api = createApi({ cloudflareToken: env.CLOUDFLARE_API_TOKEN, githubToken: env.GITHUB_TOKEN,
    readinessToken: env.DATABASE_READINESS_TOKEN, runId: recovery ? env.RECOVER_RUN_ID : env.GITHUB_RUN_ID });
  const run = await workflowGate(api, env, { recovery });
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== env.GITHUB_SHA) fail('checkout_mismatch');
  assertSharedWorkerLock();
  if (mode === 'prepare') {
    if (!env.DATABASE_READINESS_TOKEN || !/^[a-f0-9]{40}$/.test(env.SOURCE_SHA ?? '')) fail('prerequisites_unavailable');
    execFileSync('git', ['merge-base', '--is-ancestor', env.SOURCE_SHA, 'HEAD'], { stdio: 'ignore' });
    await api.releaseGuard();
    const record = await prepare({ api, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
      executorSha: env.GITHUB_SHA, sourceSha: env.SOURCE_SHA, expected: {
        public: { versionId: env.PUBLIC_VERSION, deploymentId: env.PUBLIC_DEPLOYMENT },
        jobs: { versionId: env.JOBS_VERSION, deploymentId: env.JOBS_DEPLOYMENT },
      } });
    write('recovery', record);
    return { status: 'prepared', runId: record.runId };
  }
  const record = validateRecord(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  if (record.runId !== String(run.id) || record.executorSha !== run.head_sha
    || (!recovery && record.executorSha !== env.GITHUB_SHA)) fail('record_provenance_unavailable');
  if (recovery) {
    const result = await recover({ api, record });
    write('restoration', result);
    if (result.status !== 'restored_verified') process.exitCode = 1;
    return result;
  }
  const artifact = await api.gh(`/actions/artifacts/${env.BASELINE_ARTIFACT_ID}`);
  const artifactDigest = /^([a-f0-9]{64})$/.test(env.BASELINE_ARTIFACT_DIGEST ?? '')
    ? `sha256:${env.BASELINE_ARTIFACT_DIGEST}` : env.BASELINE_ARTIFACT_DIGEST;
  if (artifact.name !== `jobs-session-recovery-${record.runId}` || artifact.expired !== false
    || String(artifact.workflow_run?.id) !== record.runId || artifact.digest !== artifactDigest) fail('durable_recovery_unavailable');
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const result = await execute({ api, record, signal: controller.signal,
      durable: { artifactId: env.BASELINE_ARTIFACT_ID, artifactDigest } });
    write('execution', result);
    if (!['observed', 'unavailable'].includes(result.status)) process.exitCode = 1;
    return { status: result.status, restoration: result.restoration?.status ?? 'restoration_unverified' };
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await main())); }
  catch (error) {
    const codes = ['shared_worker_lock_unavailable', 'protected_source_unavailable', 'protected_run_unavailable',
      'protected_credentials_missing', 'recovery_workflow_unavailable', 'one_shot_already_requested',
      'one_shot_history_unavailable', 'durable_recovery_unavailable', 'record_provenance_unavailable',
      'prerequisites_unavailable', 'baseline_mismatch', 'baseline_race', 'version_capability_unavailable',
      'binding_capability_unavailable', 'settings_capability_unavailable', 'private_target_unavailable', 'preview_exposure_unavailable'];
    console.error(JSON.stringify({ status: 'failed', diagnosticCode: codes.includes(error?.message) ? error.message : 'executor_unavailable',
      restoration: 'restoration_unverified' }));
    process.exitCode = 1;
  }
}
