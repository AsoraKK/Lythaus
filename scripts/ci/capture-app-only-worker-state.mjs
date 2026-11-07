import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeWorkerVersionMetadata } from './merge-worker-version-metadata.mjs';
import { WORKER_VERSION_ID } from './resolve-production-version-state.mjs';
import { normalizeServingWorker, normalizeServingWorkers, REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';

const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';

export function assertMainDispatchAccountContext(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'AsoraKK/Lythaus'
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN
    || !path.isAbsolute(env.RUNNER_TEMP ?? '')) throw new Error('app-only provider capture requires the exact main-dispatch Actions account context');
}

function callWrangler(args, execute) {
  let output;
  try {
    output = execute('npx', ['--yes', 'wrangler@4.123.0', ...args, '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024, timeout: 120000,
    });
  } catch {
    // Do not expose provider errors or inherited environment values in logs.
    throw new Error('read-only Worker provider request failed');
  }
  try { return JSON.parse(output); } catch { throw new Error('read-only Worker provider response was not JSON'); }
}

function servingId(deployment) {
  if (!Array.isArray(deployment?.versions) || deployment.versions.length === 0) throw new Error('Worker deployment versions are missing');
  const seen = new Set();
  const serving = [];
  for (const entry of deployment.versions) {
    const id = entry?.version_id;
    const value = entry?.percentage;
    const percentage = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
    if (!WORKER_VERSION_ID.test(id ?? '') || seen.has(id.toLowerCase()) || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error('Worker deployment contains an invalid version');
    }
    seen.add(id.toLowerCase());
    if (percentage > 0) serving.push({ id, percentage });
  }
  if (serving.length !== 1 || serving[0].percentage !== 100) throw new Error('Worker deployment must have one 100% serving version');
  return serving[0].id;
}

function exactVersion(payload, expectedId) {
  const item = payload?.result && !Array.isArray(payload.result) ? payload.result : payload;
  if (typeof item !== 'object' || Array.isArray(item)
    || String(item?.id ?? item?.version_id ?? '').toLowerCase() !== expectedId.toLowerCase()) {
    throw new Error('exact Worker version metadata did not match the serving version');
  }
  return item;
}

/**
 * Only the three fixed read-only Wrangler commands below are permitted. The
 * caller must hold the shared deployment lock and compare fresh captures.
 */
export function captureServingWorkers({ execute = execFileSync } = {}) {
  const observations = {};
  for (const [component, workerName] of Object.entries(REUSED_WORKER_NAMES)) {
    const deployment = callWrangler(['deployments', 'status', '--name', workerName], execute);
    const versionId = servingId(deployment);
    const listed = callWrangler(['versions', 'list', '--name', workerName], execute);
    const exact = exactVersion(callWrangler(['versions', 'view', versionId, '--name', workerName], execute), versionId);
    observations[component] = { workerName, deployment, versions: mergeWorkerVersionMetadata(listed, exact) };
  }
  return normalizeServingWorkers(observations);
}

export function captureServingPublicWorker({ execute = execFileSync } = {}) {
  const workerName = REUSED_WORKER_NAMES.public;
  const deployment = callWrangler(['deployments', 'status', '--name', workerName], execute);
  const versionId = servingId(deployment);
  const listed = callWrangler(['versions', 'list', '--name', workerName], execute);
  const exact = exactVersion(callWrangler(['versions', 'view', versionId, '--name', workerName], execute), versionId);
  return normalizeServingWorker('public', { workerName, deployment, versions: mergeWorkerVersionMetadata(listed, exact) });
}

function main() {
  assertMainDispatchAccountContext(process.env);
  const startedAt = new Date().toISOString();
  const workers = captureServingWorkers();
  const capturedAt = new Date().toISOString();
  const directory = path.join(process.env.RUNNER_TEMP, 'app-only-provider-evidence');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const output = path.join(directory, 'serving-workers.json');
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, startedAt, capturedAt, workers }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'READ_ONLY_CAPTURED', output, components: Object.keys(workers) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
