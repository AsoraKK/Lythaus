const MAX_CONTEXT_LENGTH = 24_000;
const MAX_SERVING_PROOF_LENGTH = 20_000;
const ALLOWED_KEYS = new Set(['acceptance_run_id', 'app_pages_serving_proof_json']);

/** Read the optional values grouped into the canonical production dispatch's
 * single continuation field. Grouping these mutually exclusive resume inputs
 * keeps the workflow_dispatch contract within GitHub's ten-input limit. */
export function productionReleaseResumeContextFromEvent(event) {
  const inputs = event?.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new Error('production release dispatch inputs unavailable');
  }
  const raw = inputs.release_resume_context_json ?? '{}';
  if (typeof raw !== 'string' || raw.length > MAX_CONTEXT_LENGTH) {
    throw new Error('production release continuation context invalid');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('production release continuation context invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !ALLOWED_KEYS.has(key))) {
    throw new Error('production release continuation context fields invalid');
  }
  const acceptanceRunId = value.acceptance_run_id ?? '';
  const appPagesServingProofJson = value.app_pages_serving_proof_json ?? '';
  if (typeof acceptanceRunId !== 'string'
    || (acceptanceRunId !== '' && !/^[1-9][0-9]*$/.test(acceptanceRunId))) {
    throw new Error('production release acceptance run identifier invalid');
  }
  if (typeof appPagesServingProofJson !== 'string' || appPagesServingProofJson.length > MAX_SERVING_PROOF_LENGTH) {
    throw new Error('production release Pages proof input invalid');
  }
  if (appPagesServingProofJson !== '') {
    let proof;
    try { proof = JSON.parse(appPagesServingProofJson); } catch { throw new Error('production release Pages proof input invalid'); }
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
      throw new Error('production release Pages proof input invalid');
    }
  }
  return Object.freeze({
    releaseMode: typeof inputs.release_mode === 'string' ? inputs.release_mode : '',
    releaseSha: typeof inputs.release_sha === 'string' ? inputs.release_sha : '',
    previousProductionSha: typeof inputs.previous_production_sha === 'string' ? inputs.previous_production_sha : '',
    ciRunId: typeof inputs.ci_run_id === 'string' ? inputs.ci_run_id : '',
    confirmProduction: inputs.confirm_production,
    acceptanceRunId,
    appPagesServingProofJson,
  });
}
