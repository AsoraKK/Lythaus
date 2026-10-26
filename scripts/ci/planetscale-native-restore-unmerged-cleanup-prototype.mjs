import { RestoreFailure } from './planetscale-native-restore-contract.mjs';
import { proveReviewedCleanupContext, unmergedCleanupAttestation } from './planetscale-native-restore-reviewed-cleanup-evidence.mjs';

export const CLEANUP_PROTOTYPE_STATUS = 'OWNER_APPROVAL_REQUIRED';
export const CLEANUP_PROTOTYPE_ACTIVE = false;
export { unmergedCleanupAttestation };

function prototypeFailure(error) {
  if (error instanceof RestoreFailure && error.code.startsWith('reviewed_')) {
    return new RestoreFailure(error.code.replace(/^reviewed_/, 'prototype_'), error.outcome, error.safeDiagnostic);
  }
  return error;
}

export async function proveUnmergedCleanupContext(options) {
  try {
    const context = await proveReviewedCleanupContext(options), historical = { ...context };
    delete historical.policyStatus;
    const assertEvidenceUnchanged = async () => {
      try { await context.assertEvidenceUnchanged(); } catch (error) { throw prototypeFailure(error); }
    };
    return { ...historical, assertEvidenceUnchanged, prototypeStatus: CLEANUP_PROTOTYPE_STATUS };
  } catch (error) { throw prototypeFailure(error); }
}
