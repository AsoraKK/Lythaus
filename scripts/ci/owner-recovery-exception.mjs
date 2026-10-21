export const INDEPENDENT_RECOVERY_SCOPE = 'independent_recovery_destination';
export const OWNER_RECOVERY_EXCEPTION_STATUS = 'DEFERRED_BY_OWNER_EXCEPTION';
export const OWNER_RECOVERY_EXCEPTION_SCHEMA = 'lythaus-owner-recovery-exception-v1';
export const MAX_OWNER_RECOVERY_EXCEPTION_MS = 24 * 60 * 60 * 1000;

export function parseOwnerRecoveryException(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function ownerRecoveryContextFromEnvironment(env = process.env, purpose = 'release') {
  return {
    record: parseOwnerRecoveryException(env.PLANETSCALE_OWNER_RECOVERY_EXCEPTION_JSON),
    requested: env.OWNER_TESTING_RECOVERY_EXCEPTION === 'true',
    ownerTestingDeployment: env.OWNER_TESTING_DEPLOYMENT === 'true',
    releaseSha: env.RELEASE_SHA,
    workflowRunId: env.GITHUB_RUN_ID,
    workflowRunAttempt: env.GITHUB_RUN_ATTEMPT,
    purpose,
  };
}

export function assessOwnerRecoveryException({ record, requested = false, ownerTestingDeployment = false,
  releaseSha, workflowRunId, workflowRunAttempt, purpose, now = Date.now() } = {}) {
  const blockers = [];
  const safe = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  const validRun = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
  const validTime = value => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
  const approvedAt = validTime(safe.approvedAt) ? Date.parse(safe.approvedAt) : null;
  const expiresAt = validTime(safe.expiresAt) ? Date.parse(safe.expiresAt) : null;
  const approvalReference = typeof safe.approvalReference === 'string' ? safe.approvalReference.trim() : '';
  if (!requested) return { ok: false, requested: false, status: 'NOT_REQUESTED', blockers: [] };
  if (!ownerTestingDeployment) blockers.push('owner_recovery_exception_requires_owner_testing');
  if (safe.schemaVersion !== OWNER_RECOVERY_EXCEPTION_SCHEMA) blockers.push('owner_recovery_exception_schema_invalid');
  if (safe.scope !== INDEPENDENT_RECOVERY_SCOPE || safe.ownerTestingOnly !== true) blockers.push('owner_recovery_exception_scope_invalid');
  if (!validSha(releaseSha) || !validSha(safe.releaseSha) || safe.releaseSha !== releaseSha) blockers.push('owner_recovery_exception_exact_sha_mismatch');
  if (!approvalReference) blockers.push('owner_recovery_exception_approval_reference_missing');
  if (approvedAt === null || approvedAt > now || expiresAt === null || expiresAt <= now
    || expiresAt <= approvedAt || expiresAt - approvedAt > MAX_OWNER_RECOVERY_EXCEPTION_MS) blockers.push('owner_recovery_exception_expired_or_window_invalid');
  if (!validRun(safe.releaseRunId) || !validRun(safe.migrationRunId)
    || safe.releaseRunId === safe.migrationRunId) blockers.push('owner_recovery_exception_run_bindings_invalid');
  const boundRun = purpose === 'release' ? safe.releaseRunId : purpose === 'migration' ? safe.migrationRunId : null;
  if (!validRun(workflowRunId) || workflowRunId !== boundRun) blockers.push('owner_recovery_exception_run_binding_mismatch');
  if (workflowRunAttempt !== '1') blockers.push('owner_recovery_exception_already_consumed_or_attempt_invalid');
  return {
    ok: blockers.length === 0,
    requested: true,
    status: blockers.length === 0 ? OWNER_RECOVERY_EXCEPTION_STATUS : 'BLOCKED',
    blockers,
    scope: INDEPENDENT_RECOVERY_SCOPE,
    releaseSha: validSha(safe.releaseSha) ? safe.releaseSha : null,
    releaseRunId: validRun(safe.releaseRunId) ? safe.releaseRunId : null,
    migrationRunId: validRun(safe.migrationRunId) ? safe.migrationRunId : null,
    approvedAt: approvedAt === null ? null : new Date(approvedAt).toISOString(),
    expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
    approvalReference: approvalReference || null,
    publicReleaseBlockers: [INDEPENDENT_RECOVERY_SCOPE],
    consumptionBoundary: 'Only the first attempt of the named migration and canonical owner-testing release runs; no later run, commit or rerun is authorized.',
  };
}
