import { assertAppOnlyKeeperRun } from '../release/app-only-acceptance.mjs';

const BASE = 'https://admin.lythaus.co/api/admin/production-auth-acceptance';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Use the existing protected coordinator. A create is attempted once only;
 * an ambiguous result is surfaced for reconciliation, never retried. */
export async function prepareAppOnlyKeeperRun({ context, acceptanceRunId = '', readinessToken, accessClientId,
  accessClientSecret, now = Date.now(), fetchImpl = fetch } = {}) {
  if (!context || typeof readinessToken !== 'string' || !readinessToken
    || typeof accessClientId !== 'string' || !accessClientId || typeof accessClientSecret !== 'string' || !accessClientSecret
    || (acceptanceRunId && !UUID.test(acceptanceRunId))) throw new Error('app-only Keeper inputs invalid');
  const headers = { accept: 'application/json', 'x-lythaus-readiness-token': readinessToken,
    'CF-Access-Client-Id': accessClientId, 'CF-Access-Client-Secret': accessClientSecret };
  let runId = acceptanceRunId;
  if (!runId) {
    const payload = { releaseSha: context.releaseSha, candidateSourceSha: context.candidate.sourceReleaseSha,
      candidateWorker: context.candidate.workerName, candidateVersion: context.candidate.workerVersionId,
      candidateUploadedAt: context.candidate.uploadedAt, candidateStagedAt: context.candidate.stagedAt,
      candidateDependencies: context.dependencies, rollbackSnapshot: context.rollbackSnapshot };
    let created;
    try {
      const response = await fetchImpl(`${BASE}/runs`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.status !== 201 || response.redirected) throw new Error('unverified create');
      created = await response.json();
    } catch {
      throw new Error('app-only Keeper creation outcome is unverified; reconcile before another attempt');
    }
    if (!UUID.test(created?.acceptanceRunId ?? '')
      || created.keeperUrl !== `https://admin.lythaus.co/production-auth-acceptance?run=${created.acceptanceRunId}`) {
      throw new Error('app-only Keeper creation response is unverified; reconcile before another attempt');
    }
    runId = created.acceptanceRunId;
  }
  let summary;
  try {
    const response = await fetchImpl(`${BASE}/runs/${runId}`, { method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(30000), headers });
    if (response.status !== 200 || response.redirected) throw new Error('unverified summary');
    summary = await response.json();
  } catch {
    // A new run may have been created even if this read fails. The caller must
    // reconcile it before issuing another create request.
    throw new Error(`app-only Keeper summary unavailable; reconcile run ${runId} before another attempt`);
  }
  try {
    if (summary?.acceptanceRunId !== runId) throw new Error('summary ID differs');
    return assertAppOnlyKeeperRun({ run: summary, context, now });
  } catch {
    throw new Error(`app-only Keeper summary or live binding invalid; reconcile run ${runId} before another attempt`);
  }
}
