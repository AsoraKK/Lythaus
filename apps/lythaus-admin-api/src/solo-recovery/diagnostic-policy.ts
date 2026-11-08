export const SUBJECT_DIAGNOSTIC_PATH = '/api/admin/recovery/subject-diagnostic';

export interface SubjectDiagnosticPolicy {
  origin: string;
  accessIssuer: string;
  accessAudience: string;
  notBefore: number;
  expiresAt: number;
  databaseTarget: {
    branchId: string;
    databaseName: string;
    originFingerprint: string;
    roleFingerprint: string;
  };
}

// Deliberately null. There is no environment-variable or request-input fallback.
export const COMPILED_SUBJECT_DIAGNOSTIC_POLICY: SubjectDiagnosticPolicy | null = null;

export function validateSubjectDiagnosticPolicy(value: unknown): SubjectDiagnosticPolicy {
  const policy = value as SubjectDiagnosticPolicy;
  if (!policy || typeof policy !== 'object'
    || Object.keys(policy).sort().join(',') !== 'accessAudience,accessIssuer,databaseTarget,expiresAt,notBefore,origin'
    || typeof policy.databaseTarget !== 'object' || policy.databaseTarget === null
    || Object.keys(policy.databaseTarget).sort().join(',') !== 'branchId,databaseName,originFingerprint,roleFingerprint'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(policy.accessAudience)
    || !Number.isSafeInteger(policy.notBefore) || !Number.isSafeInteger(policy.expiresAt)
    || policy.expiresAt <= policy.notBefore || policy.expiresAt - policy.notBefore > 600
    || !/^[a-z0-9]+$/.test(policy.databaseTarget.branchId)
    || policy.databaseTarget.databaseName !== 'postgres'
    || !/^[a-f0-9]{64}$/.test(policy.databaseTarget.originFingerprint)
    || !/^[a-f0-9]{64}$/.test(policy.databaseTarget.roleFingerprint)) {
    throw new Error('subject_diagnostic_policy_invalid');
  }
  for (const raw of [policy.origin, policy.accessIssuer]) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.origin !== raw || url.pathname !== '/'
      || url.username || url.password || url.port || url.search || url.hash) {
      throw new Error('subject_diagnostic_policy_invalid');
    }
  }
  return Object.freeze({ ...policy, databaseTarget: Object.freeze({ ...policy.databaseTarget }) });
}

export function subjectDiagnosticPolicyLive(policy: SubjectDiagnosticPolicy, now = Date.now()): boolean {
  return policy.notBefore * 1000 <= now && now < policy.expiresAt * 1000;
}
