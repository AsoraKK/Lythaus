import { pathToFileURL } from 'node:url';

// The activation job can run for 35 minutes; retain five minutes of slack.
export const SUBJECT_DIAGNOSTIC_MIN_ACTIVATION_REMAINING_SECONDS = 40 * 60;

export function verifySubjectDiagnosticExpiry({
  enabled = false,
  expiresAt = '',
  candidateDependenciesJson = '',
  adminWorkerVersion = '',
  adminWorkerSourceSha = '',
  releaseSha = '',
  nowMs = Date.now(),
} = {}) {
  let dependencies = null;
  if (candidateDependenciesJson) {
    try {
      dependencies = JSON.parse(candidateDependenciesJson);
    } catch {
      throw new Error('subject_diagnostic_acceptance_dependencies_invalid');
    }
  }
  if (enabled !== true) {
    if (expiresAt || dependencies?.subjectDiagnosticExpiresAt) throw new Error('subject_diagnostic_unrequested_policy_present');
    return { status: 'disabled' };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(expiresAt)
    || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= nowMs) {
    throw new Error('subject_diagnostic_expired_before_activation');
  }
  if (Date.parse(expiresAt) - nowMs < SUBJECT_DIAGNOSTIC_MIN_ACTIVATION_REMAINING_SECONDS * 1000) {
    throw new Error('subject_diagnostic_activation_runway_insufficient');
  }
  if (!dependencies || dependencies.subjectDiagnosticExpiresAt !== expiresAt
    || dependencies.admin?.status !== 'NEW_CANDIDATE'
    || dependencies.admin?.workerName !== 'lythaus-admin-api-development'
    || dependencies.admin?.versionId !== adminWorkerVersion
    || dependencies.admin?.sourceSha !== releaseSha
    || adminWorkerSourceSha !== releaseSha) {
    throw new Error('subject_diagnostic_candidate_binding_mismatch');
  }
  return { status: 'live', expiresAt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifySubjectDiagnosticExpiry({
    enabled: process.env.ENABLE_SUBJECT_DIAGNOSTIC === 'true',
    expiresAt: process.env.SUBJECT_DIAGNOSTIC_EXPIRES_AT ?? '',
    candidateDependenciesJson: process.env.AUTH_ACCEPTANCE_DEPENDENCIES_JSON ?? '',
    adminWorkerVersion: process.env.ADMIN_WORKER_VERSION_ID ?? '',
    adminWorkerSourceSha: process.env.ADMIN_WORKER_SOURCE_SHA ?? '',
    releaseSha: process.env.RELEASE_SHA ?? '',
  });
  if (result.status === 'live') console.log('Subject diagnostic candidate expiry verified.');
}
