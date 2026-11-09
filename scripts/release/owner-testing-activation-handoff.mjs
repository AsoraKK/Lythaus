import {
  validateAcceptanceRollbackSnapshot,
} from './acceptance-rollback-snapshot.mjs';

export const OWNER_TESTING_ACTIVATION_HANDOFF_SCHEMA = 'lythaus-owner-testing-activation-v1';
export const OWNER_TESTING_DIAGNOSTIC_MAX_WINDOW_MS = 3 * 60 * 60 * 1000;
export const OWNER_TESTING_ACTIVATION_RUNWAY_MS = 40 * 60 * 1000;

const SHA = /^[0-9a-f]{40}$/i;
const RUN_ID = /^[0-9]{1,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const components = ['admin', 'coordinator', 'jobs', 'public'];

function assertIso(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}

function assertDependencies(dependencies, releaseSha, diagnosticExpiresAt, versions) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)
    || Object.keys(dependencies).sort().join(',') !== [...components, 'subjectDiagnosticExpiresAt'].sort().join(',')) {
    throw new Error('owner_testing_activation_dependencies_invalid');
  }
  if (dependencies.subjectDiagnosticExpiresAt !== diagnosticExpiresAt) {
    throw new Error('owner_testing_activation_diagnostic_expiry_mismatch');
  }
  const expectedWorkerNames = {
    public: 'lythaus-public-api-development',
    admin: 'lythaus-admin-api-development',
    jobs: 'lythaus-jobs-development',
    coordinator: 'lythaus-auth-acceptance-coordinator-development',
  };
  for (const component of components) {
    const dependency = dependencies[component];
    if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)
      || dependency.workerName !== expectedWorkerNames[component]
      || typeof dependency.versionId !== 'string' || !UUID.test(dependency.versionId)
      || typeof dependency.sourceSha !== 'string' || !SHA.test(dependency.sourceSha)) {
      throw new Error(`owner_testing_activation_${component}_dependency_invalid`);
    }
    if (dependency.versionId !== versions[component].versionId
      || dependency.sourceSha.toLowerCase() !== versions[component].sourceSha.toLowerCase()
      || dependency.status !== versions[component].status
      || dependency.provenance !== versions[component].provenance) {
      throw new Error(`owner_testing_activation_${component}_dependency_binding_mismatch`);
    }
  }
  for (const component of ['admin', 'coordinator']) {
    const dependency = dependencies[component];
    if (dependency.versionId !== versions[component].versionId
      || dependency.sourceSha.toLowerCase() !== releaseSha.toLowerCase()
      || dependency.status !== 'NEW_CANDIDATE'
      || dependency.provenance !== 'BUILT_FROM_RELEASE_SHA') {
      throw new Error(`owner_testing_activation_${component}_candidate_mismatch`);
    }
  }
  for (const component of ['public', 'jobs']) {
    if (dependencies[component].status !== 'REUSED_PRODUCTION'
      || dependencies[component].provenance !== 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION') {
      throw new Error(`owner_testing_activation_${component}_reuse_mismatch`);
    }
  }
}

export function createOwnerTestingActivationHandoff(input) {
  const releaseSha = input?.releaseSha;
  if (typeof releaseSha !== 'string' || !SHA.test(releaseSha)) throw new Error('owner_testing_activation_release_sha_invalid');
  if (typeof input.runId !== 'string' || !RUN_ID.test(input.runId)) throw new Error('owner_testing_activation_run_id_invalid');
  if (input.runAttempt !== 1) throw new Error('owner_testing_activation_first_attempt_required');
  if (input.ownerTesting !== true || input.recoveryException !== true || input.subjectDiagnostic !== true
    || input.releaseClass !== 'AUTH_CRITICAL_RELEASE' || input.acceptanceStatus !== 'PASSED') {
    throw new Error('owner_testing_activation_mode_or_acceptance_invalid');
  }
  if (!Array.isArray(input.changedComponents) || [...input.changedComponents].sort().join(',') !== 'admin,coordinator') {
    throw new Error('owner_testing_activation_component_scope_invalid');
  }
  if (typeof input.acceptanceRunId !== 'string' || !UUID.test(input.acceptanceRunId)) {
    throw new Error('owner_testing_activation_acceptance_run_invalid');
  }
  const notBefore = input.diagnosticNotBefore;
  if (!Number.isSafeInteger(notBefore) || notBefore <= 0) throw new Error('owner_testing_activation_diagnostic_start_invalid');
  const diagnosticExpiresAt = assertIso(input.diagnosticExpiresAt, 'owner_testing_activation_diagnostic_expiry_invalid');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(diagnosticExpiresAt)) {
    throw new Error('owner_testing_activation_diagnostic_expiry_invalid');
  }
  const diagnosticExpiryMs = Date.parse(diagnosticExpiresAt);
  if (diagnosticExpiryMs <= notBefore * 1000 || diagnosticExpiryMs - notBefore * 1000 > OWNER_TESTING_DIAGNOSTIC_MAX_WINDOW_MS) {
    throw new Error('owner_testing_activation_diagnostic_window_invalid');
  }
  const acceptanceExpiresAt = assertIso(input.acceptanceExpiresAt, 'owner_testing_activation_acceptance_expiry_invalid');
  const candidateDependencies = input.candidateDependencies;
  const workerVersions = input.workerVersions;
  if (!workerVersions || typeof workerVersions !== 'object') throw new Error('owner_testing_activation_worker_versions_invalid');
  for (const component of components) {
    if (typeof workerVersions[component]?.versionId !== 'string' || !UUID.test(workerVersions[component].versionId)
      || typeof workerVersions[component]?.sourceSha !== 'string' || !SHA.test(workerVersions[component].sourceSha)
      || typeof workerVersions[component]?.status !== 'string' || typeof workerVersions[component]?.provenance !== 'string') {
      throw new Error(`owner_testing_activation_${component}_version_invalid`);
    }
  }
  assertDependencies(candidateDependencies, releaseSha, diagnosticExpiresAt, workerVersions);
  const rollbackSnapshot = validateAcceptanceRollbackSnapshot(input.rollbackSnapshot);
  if (rollbackSnapshot.deferredComponents?.length) throw new Error('owner_testing_activation_rollback_snapshot_deferred');
  if (!Array.isArray(input.releaseStateHistory) || input.releaseStateHistory.length === 0
    || input.releaseStateHistory.at(-1)?.state !== 'PRODUCT_ACCEPTANCE_PASSED'
    || input.releaseStateHistory.some(entry => !entry || typeof entry !== 'object'
      || typeof entry.state !== 'string' || typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)))) {
    throw new Error('owner_testing_activation_release_history_invalid');
  }
  const infrastructure = input.infrastructure;
  if (!infrastructure || typeof infrastructure !== 'object'
    || ['hyperdriveVerifiedMain', 'databaseIdentityVerified', 'budgetEnforcementVerified', 'planetscaleGrantsVerified']
      .some(key => infrastructure[key] !== true)) {
    throw new Error('owner_testing_activation_infrastructure_evidence_invalid');
  }

  return Object.freeze({
    schemaVersion: OWNER_TESTING_ACTIVATION_HANDOFF_SCHEMA,
    runId: input.runId,
    runAttempt: input.runAttempt,
    releaseSha: releaseSha.toLowerCase(),
    releaseClass: input.releaseClass,
    changedComponents: Object.freeze(['admin', 'coordinator']),
    workerVersions: Object.freeze(Object.fromEntries(components.map(component => [component, Object.freeze({
      versionId: workerVersions[component].versionId,
      sourceSha: workerVersions[component].sourceSha,
      status: workerVersions[component].status,
      provenance: workerVersions[component].provenance,
    })]))),
    acceptance: Object.freeze({
      status: input.acceptanceStatus,
      runId: input.acceptanceRunId,
      expiresAt: acceptanceExpiresAt,
      candidateDependencies: Object.freeze(candidateDependencies),
    }),
    diagnostic: Object.freeze({ notBefore, expiresAt: diagnosticExpiresAt }),
    rollbackSnapshot,
    infrastructure: Object.freeze({ ...infrastructure }),
    releaseStateHistory: Object.freeze(input.releaseStateHistory),
  });
}

export function validateOwnerTestingActivationHandoff(value, {
  expectedRunId,
  expectedRunAttempt,
  expectedReleaseSha,
  nowMs = Date.now(),
} = {}) {
  const exactKeys = (target, keys) => target && typeof target === 'object' && !Array.isArray(target)
    && Object.keys(target).sort().join(',') === [...keys].sort().join(',');
  if (!exactKeys(value, ['schemaVersion', 'runId', 'runAttempt', 'releaseSha', 'releaseClass', 'changedComponents', 'workerVersions', 'acceptance', 'diagnostic', 'rollbackSnapshot', 'infrastructure', 'releaseStateHistory'])
    || value.schemaVersion !== OWNER_TESTING_ACTIVATION_HANDOFF_SCHEMA
    || !exactKeys(value.acceptance, ['status', 'runId', 'expiresAt', 'candidateDependencies'])
    || !exactKeys(value.diagnostic, ['notBefore', 'expiresAt'])
    || !exactKeys(value.workerVersions, components)
    || !exactKeys(value.infrastructure, ['hyperdriveVerifiedMain', 'databaseIdentityVerified', 'budgetEnforcementVerified', 'planetscaleGrantsVerified'])) {
    throw new Error('owner_testing_activation_handoff_invalid');
  }
  if (value.runId !== expectedRunId || value.runAttempt !== expectedRunAttempt || value.runAttempt !== 1) {
    throw new Error('owner_testing_activation_run_binding_mismatch');
  }
  if (typeof expectedReleaseSha !== 'string' || value.releaseSha !== expectedReleaseSha.toLowerCase()) {
    throw new Error('owner_testing_activation_release_binding_mismatch');
  }
  const checked = createOwnerTestingActivationHandoff({
    runId: value.runId,
    runAttempt: value.runAttempt,
    releaseSha: value.releaseSha,
    ownerTesting: true,
    recoveryException: true,
    subjectDiagnostic: true,
    releaseClass: value.releaseClass,
    changedComponents: value.changedComponents,
    workerVersions: value.workerVersions,
    acceptanceStatus: value.acceptance?.status,
    acceptanceRunId: value.acceptance?.runId,
    acceptanceExpiresAt: value.acceptance?.expiresAt,
    candidateDependencies: value.acceptance?.candidateDependencies,
    diagnosticNotBefore: value.diagnostic?.notBefore,
    diagnosticExpiresAt: value.diagnostic?.expiresAt,
    rollbackSnapshot: value.rollbackSnapshot,
    infrastructure: value.infrastructure,
    releaseStateHistory: value.releaseStateHistory,
  });
  const diagnosticExpiresAtMs = Date.parse(checked.diagnostic.expiresAt);
  if (!Number.isFinite(nowMs) || checked.diagnostic.notBefore * 1000 > nowMs
    || diagnosticExpiresAtMs - nowMs < OWNER_TESTING_ACTIVATION_RUNWAY_MS) {
    throw new Error('owner_testing_activation_expired_or_runway_insufficient');
  }
  return checked;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isExactCandidateVersion(snapshot, component, candidateVersionId) {
  return snapshot.workers[component].versions.length === 1
    && snapshot.workers[component].versions[0].versionId.toLowerCase() === candidateVersionId.toLowerCase()
    && snapshot.workers[component].versions[0].percentage === 100;
}

export function assertRollbackStateMatchesBaseline(expected, current) {
  const before = validateAcceptanceRollbackSnapshot(expected);
  const live = validateAcceptanceRollbackSnapshot(current);
  if (canonical(before) !== canonical(live)) throw new Error('owner_testing_live_state_drift_before_activation');
  return true;
}

export function assertAdminCandidateStagedAtZero(deployment, candidateVersionId) {
  if (!deployment || !Array.isArray(deployment.versions) || !UUID.test(candidateVersionId ?? '')) {
    throw new Error('owner_testing_admin_candidate_staging_invalid');
  }
  const matches = deployment.versions.filter(entry => {
    const versionId = entry?.version_id ?? entry?.versionId;
    return typeof versionId === 'string' && versionId.toLowerCase() === candidateVersionId.toLowerCase();
  });
  if (matches.length !== 1) throw new Error('owner_testing_admin_candidate_staging_version_missing_or_ambiguous');
  const percentage = Number(matches[0].percentage);
  if (!Number.isFinite(percentage) || percentage !== 0) throw new Error('owner_testing_admin_candidate_received_traffic_before_approval');
  return true;
}

export async function waitForAdminCandidateStagedAtZero({
  candidateVersionId,
  readDeployment,
  now = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  timeoutMs = 60_000,
  pollIntervalMs = 3_000,
} = {}) {
  if (!UUID.test(candidateVersionId ?? '') || typeof readDeployment !== 'function'
    || typeof now !== 'function' || typeof sleep !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new Error('owner_testing_admin_zero_traffic_wait_configuration_invalid');
  }
  const deadline = now() + timeoutMs;
  if (!Number.isFinite(deadline)) throw new Error('owner_testing_admin_zero_traffic_wait_clock_invalid');
  let attempts = 0;
  while (true) {
    const deployment = await readDeployment();
    attempts += 1;
    if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)
      || !Array.isArray(deployment.versions)) {
      throw new Error('owner_testing_admin_candidate_staging_invalid');
    }
    const matches = deployment.versions.filter(entry => {
      const versionId = entry?.version_id ?? entry?.versionId;
      return typeof versionId === 'string' && versionId.toLowerCase() === candidateVersionId.toLowerCase();
    });
    if (matches.length > 1) throw new Error('owner_testing_admin_candidate_staging_version_ambiguous');
    if (matches.length === 1) {
      const percentage = Number(matches[0].percentage);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        throw new Error('owner_testing_admin_candidate_staging_percentage_invalid');
      }
      if (percentage !== 0) throw new Error('owner_testing_admin_candidate_received_traffic_before_approval');
      return { status: 'ZERO_TRAFFIC', attempts };
    }
    const remaining = deadline - now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw new Error('owner_testing_admin_candidate_version_missing_after_timeout');
    }
    await sleep(Math.min(pollIntervalMs, remaining));
  }
}

export function assertRollbackSafeAfterPartialActivation(expected, current, {
  attemptedComponents = [],
  candidateVersions = {},
  attemptedRoutes = [],
  candidateRouteTargets = {},
} = {}) {
  const before = validateAcceptanceRollbackSnapshot(expected);
  const live = validateAcceptanceRollbackSnapshot(current);
  const attempted = new Set(attemptedComponents);
  const routeAttempts = new Set(attemptedRoutes);
  for (const component of ['public', 'admin', 'jobs', 'coordinator']) {
    const unchanged = canonical(before.workers[component]) === canonical(live.workers[component]);
    const versionId = candidateVersions[component];
    const authorizedCandidate = attempted.has(component) && typeof versionId === 'string'
      && UUID.test(versionId) && isExactCandidateVersion(live, component, versionId);
    if (!unchanged && !authorizedCandidate) throw new Error(`owner_testing_rollback_external_drift_${component}`);
  }
  for (const component of ['adminApi', 'coordinator']) {
    const unchanged = canonical(before.routes[component]) === canonical(live.routes[component]);
    const target = candidateRouteTargets[component];
    const route = live.routes[component];
    const authorizedRoute = routeAttempts.has(component) && target && route !== null
      && route.pattern === target.pattern && route.script === target.script;
    if (!unchanged && !authorizedRoute) throw new Error(`owner_testing_rollback_external_route_drift_${component}`);
  }
  return true;
}
