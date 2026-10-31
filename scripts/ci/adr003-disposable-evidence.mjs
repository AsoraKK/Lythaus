const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASES = ['A11', 'A12', 'A13'];

export function hasDisposableReceipt(env) {
  if (env.ADR003_CONTENT_EVIDENCE_PATH) return true;
  if (env.GITHUB_ACTIONS === 'true') throw new Error('disposable_content_evidence_required');
  return false;
}

export async function prepareFixtureBoundKeeper({ raw, releaseSha, worker, runId, runAttempt, start } = {}) {
  if (typeof start !== 'function') throw new Error('Keeper adapter missing');
  let receipt;
  try { receipt = JSON.parse(raw); } catch { throw new Error('disposable_content_evidence_invalid'); }
  if (receipt?.binding !== 'version') throw new Error('disposable_content_evidence_invalid');
  validateDisposableContentEvidence(receipt, { releaseSha, sourceSha: worker?.sourceSha,
    versionId: worker?.versionId, runId, runAttempt });
  return start();
}

/** The protected workflow supplies this receipt from its isolated fixture job. */
export function validateDisposableContentEvidence(value, { releaseSha, sourceSha, versionId, runId, runAttempt } = {}) {
  const boundVersion = value?.binding === 'version' && UUID.test(versionId ?? '') && value.workerVersionId === versionId;
  const boundReleaseSource = value?.binding === 'release-source' && sourceSha === releaseSha
    && (versionId === undefined || UUID.test(versionId)) && value.workerVersionId === null;
  if (!value || value.schema !== 'lythaus-adr003-disposable-content-v1' || value.status !== 'PASSED'
    || value.runtime !== 'workerd-pg17' || value.target !== 'disposable-loopback'
    || !SHA.test(releaseSha ?? '') || value.releaseSha !== releaseSha
    || !SHA.test(sourceSha ?? '') || value.workerSourceSha !== sourceSha
    || !(boundVersion || boundReleaseSource)
    || !/^[1-9][0-9]*$/.test(String(runId ?? '')) || value.runId !== String(runId)
    || !/^[1-9][0-9]*$/.test(String(runAttempt ?? '')) || value.runAttempt !== String(runAttempt)
    || !Array.isArray(value.cases) || value.cases.length !== CASES.length
    || CASES.some(id => value.cases.filter(item => item?.id === id && item?.outcome === 'passed').length !== 1)) {
    throw new Error('disposable_content_evidence_invalid');
  }
  return Object.freeze({ schema: value.schema, status: value.status, runtime: value.runtime, target: value.target,
    releaseSha, workerSourceSha: sourceSha, binding: value.binding, workerVersionId: value.workerVersionId,
    runId: String(runId), runAttempt: String(runAttempt),
    cases: CASES.map(id => Object.freeze({ id, outcome: 'passed' })) });
}
