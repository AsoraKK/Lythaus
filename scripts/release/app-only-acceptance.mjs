import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { createAcceptanceRollbackSnapshot, validateAcceptanceRollbackSnapshot } from './acceptance-rollback-snapshot.mjs';
import { normalizeCapturedWorkers, REUSED_WORKER_NAMES } from './app-only-eligibility.mjs';

const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTES = Object.freeze({
  adminApi: ['admin.lythaus.co/api/admin/*', REUSED_WORKER_NAMES.admin],
  coordinator: ['admin.lythaus.co/api/admin/production-auth-acceptance/*', REUSED_WORKER_NAMES.coordinator],
});
const MAX_CAPTURE_AGE_MS = 5 * 60 * 1000;
const MAX_CAPTURE_DURATION_MS = 10 * 60 * 1000;

function instant(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be an exact UTC timestamp`);
  }
  return Date.parse(value);
}

/**
 * Bind a freshly captured, single-serving-version state to Keeper's existing
 * dependency and rollback contracts. Provider authenticity, the protected
 * environment, and both deployment locks are the caller's responsibility.
 */
export function createAppOnlyAcceptanceContext({ releaseSha, capture, routeSnapshots, now = Date.now() } = {}) {
  if (!SHA.test(releaseSha ?? '') || !Number.isFinite(now)) throw new Error('app-only acceptance release or clock invalid');
  const workers = normalizeCapturedWorkers(capture);
  const started = instant(capture.startedAt, 'capture start');
  const captured = instant(capture.capturedAt, 'capture completion');
  if (started > captured || captured > now || captured - started > MAX_CAPTURE_DURATION_MS || now - captured > MAX_CAPTURE_AGE_MS) {
    throw new Error('app-only Worker capture is stale or out of order');
  }
  if (!routeSnapshots || typeof routeSnapshots !== 'object' || Array.isArray(routeSnapshots)
    || !isDeepStrictEqual(Object.keys(routeSnapshots).sort(), Object.keys(ROUTES).sort())) {
    throw new Error('app-only route snapshot inventory invalid');
  }
  for (const [component, [pattern, script]] of Object.entries(ROUTES)) {
    const route = routeSnapshots[component]?.route;
    if (!route || route.pattern !== pattern || route.script !== script) throw new Error(`app-only ${component} route is not bound to the serving Worker`);
  }
  const dependencies = {};
  const workerDeployments = {};
  for (const [component, worker] of Object.entries(workers)) {
    if (instant(worker.createdAt, `${component} version creation`) > started) throw new Error(`app-only ${component} version postdates capture`);
    dependencies[component] = { workerName: worker.workerName, versionId: worker.versionId,
      sourceSha: worker.sourceSha, status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' };
    workerDeployments[component] = { versions: [{ version_id: worker.versionId, percentage: 100 }] };
  }
  const rollbackSnapshot = createAcceptanceRollbackSnapshot({ workerDeployments, routeSnapshots });
  validateAcceptanceRollbackSnapshot(rollbackSnapshot, { candidateDependencies: dependencies });
  return Object.freeze({ releaseSha, dependencies: Object.freeze(dependencies), rollbackSnapshot,
    candidate: Object.freeze({ workerName: workers.public.workerName, workerVersionId: workers.public.versionId,
      sourceReleaseSha: workers.public.sourceSha, uploadedAt: workers.public.createdAt, stagedAt: capture.capturedAt }) });
}

/** Require every reused version's source to be an available ancestor of the merged release. */
export function assertAppOnlyWorkerSourcesAncestral(repositoryRoot, releaseSha, dependencies) {
  if (!SHA.test(releaseSha ?? '') || !dependencies || typeof dependencies !== 'object'
    || !isDeepStrictEqual(Object.keys(dependencies).sort(), Object.keys(REUSED_WORKER_NAMES).sort())) throw new Error('app-only source inventory invalid');
  try {
    execFileSync('git', ['cat-file', '-e', `${releaseSha}^{commit}`], { cwd: repositoryRoot, stdio: 'ignore' });
    for (const component of Object.keys(REUSED_WORKER_NAMES)) {
      const source = dependencies[component]?.sourceSha;
      if (!SHA.test(source ?? '')) throw new Error('invalid source');
      execFileSync('git', ['cat-file', '-e', `${source}^{commit}`], { cwd: repositoryRoot, stdio: 'ignore' });
      execFileSync('git', ['merge-base', '--is-ancestor', source, releaseSha], { cwd: repositoryRoot, stdio: 'ignore' });
    }
  } catch {
    throw new Error('a reused Worker source is not an available ancestor of the release');
  }
}

/**
 * Validate a protected Keeper summary against a newly captured live context.
 * A pending summary can be presented to a human; activation additionally
 * requires a completed, unexpired run plus the independent observer and ADR003.
 */
export function assertAppOnlyKeeperRun({ run, context, now = Date.now(), requireCompleted = false } = {}) {
  if (!run || !context || !Number.isFinite(now) || !UUID.test(run.acceptanceRunId ?? '')
    || run.releaseSha !== context.releaseSha
    || !['pending', 'in_progress', 'completed'].includes(run.status)
    || (requireCompleted && run.status !== 'completed')) throw new Error('app-only Keeper run identity or status invalid');
  const expires = instant(run.expiresAt, 'Keeper expiry');
  const candidate = run.candidate;
  if (!candidate || candidate.workerName !== context.candidate.workerName
    || candidate.workerVersionId !== context.candidate.workerVersionId
    || candidate.sourceReleaseSha !== context.candidate.sourceReleaseSha
    || instant(candidate.uploadedAt, 'candidate upload') !== instant(context.candidate.uploadedAt, 'serving version creation')) {
    throw new Error('app-only Keeper candidate differs from the serving Public Worker');
  }
  const staged = instant(candidate.stagedAt, 'candidate stage');
  if (expires <= now || staged < Date.parse(candidate.uploadedAt) || staged > now || expires <= staged) {
    throw new Error('app-only Keeper run is expired or has invalid timing');
  }
  if (!isDeepStrictEqual(run.candidateDependencies, context.dependencies)) throw new Error('app-only Keeper dependencies changed');
  const storedSnapshot = validateAcceptanceRollbackSnapshot(run.rollbackSnapshot, { candidateDependencies: context.dependencies });
  if (!isDeepStrictEqual(storedSnapshot, context.rollbackSnapshot)) throw new Error('app-only Keeper rollback snapshot changed');
  return Object.freeze({ releaseSha: run.releaseSha, acceptanceRunId: run.acceptanceRunId, expiresAt: run.expiresAt,
    status: run.status, candidate: Object.freeze({ ...candidate }), dependencies: context.dependencies,
    rollbackSnapshot: storedSnapshot });
}
