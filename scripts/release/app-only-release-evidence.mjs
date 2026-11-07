import { isDeepStrictEqual } from 'node:util';
import { assertAppPagesCandidateBound, assertCapturedWorkersUnchanged } from './app-only-eligibility.mjs';
import { createAppOnlyAcceptanceContext } from './app-only-acceptance.mjs';
import { verifyAppPagesServingProofReceipt } from './app-pages-serving-proof.mjs';

const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function reusedPage(value, project, branch) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), ['branch', 'commitSha', 'deploymentId', 'deploymentUrl', 'project', 'projectId'].sort())
    || value.project !== project || value.branch !== branch || !UUID.test(value.projectId ?? '')
    || !UUID.test(value.deploymentId ?? '') || !SHA.test(value.commitSha ?? '')) throw new Error(`app-only reused ${project} Pages identity invalid`);
  let url;
  try { url = new URL(value.deploymentUrl); } catch { throw new Error(`app-only reused ${project} Pages URL invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/'
    || !url.hostname.endsWith(`.${project}.pages.dev`) || !/^[a-z0-9-]+$/.test(url.hostname.slice(0, -`.${project}.pages.dev`.length))) {
    throw new Error(`app-only reused ${project} Pages URL invalid`);
  }
}

/**
 * Evaluate actual protected-job observations; this does not authenticate their
 * source. The canonical workflow must capture them under the release locks.
 */
export function verifyAppOnlyReleaseEvidence({ evidence, releaseSha, ciRunId, previousSha, previousRunId, adminProject, now = Date.now() } = {}) {
  if (!SHA.test(releaseSha ?? '') || !/^[1-9][0-9]*$/.test(String(ciRunId ?? ''))
    || !SHA.test(previousSha ?? '') || !/^[1-9][0-9]*$/.test(String(previousRunId ?? ''))
    || !/^lythaus-[a-z0-9-]+$/.test(adminProject ?? '') || adminProject === 'lythaus-web' || adminProject === 'lythaus-marketing'
    || !evidence || evidence.schemaVersion !== 'lythaus-app-only-release-evidence-v1') throw new Error('app-only release evidence inputs invalid');
  const { artifact, prior, priorRelease, servingProof, browser, workerBefore, workerAfter, routeBefore, routeAfter,
    appBefore, appCandidate, appCurrent, reusedBefore, reusedAfter, keeperVerifiedAt } = evidence;
  if (!artifact || !Number.isSafeInteger(artifact.artifactId) || artifact.artifactId < 1 || artifact.releaseSha !== releaseSha
    || artifact.ciRunId !== String(ciRunId) || !DIGEST.test(artifact.archiveDigest ?? '')) throw new Error('app-only artifact evidence invalid');
  if (!prior || prior.previousSha !== previousSha || prior.previousRunId !== String(previousRunId)
    || !Number.isSafeInteger(prior.artifactId) || prior.artifactId < 1 || !DIGEST.test(prior.archiveDigest ?? '')) {
    throw new Error('app-only prior canonical manifest evidence invalid');
  }
  if (!priorRelease || priorRelease.previousSha !== prior.previousSha
    || priorRelease.previousRunId !== prior.previousRunId || priorRelease.artifactId !== prior.artifactId
    || priorRelease.archiveDigest !== prior.archiveDigest) throw new Error('app-only prior Pages proof binding differs');
  const verifiedServingProof = verifyAppPagesServingProofReceipt({ receipt: servingProof, snapshot: appBefore,
    priorRelease, releaseSha, previousSha, previousRunId, actor: servingProof?.capturedBy,
    now, requireFreshNow: false });
  const workers = assertCapturedWorkersUnchanged(workerBefore, workerAfter);
  if (typeof keeperVerifiedAt !== 'string' || !Number.isFinite(Date.parse(keeperVerifiedAt))
    || new Date(keeperVerifiedAt).toISOString() !== keeperVerifiedAt || !Number.isFinite(now)
    || Date.parse(keeperVerifiedAt) < Date.parse(workerAfter.capturedAt) || Date.parse(keeperVerifiedAt) > now) {
    throw new Error('app-only final Keeper verification time is invalid');
  }
  const beforeContext = createAppOnlyAcceptanceContext({ releaseSha, capture: workerBefore, routeSnapshots: routeBefore,
    now: Date.parse(workerBefore.capturedAt) });
  const afterContext = createAppOnlyAcceptanceContext({ releaseSha, capture: workerAfter, routeSnapshots: routeAfter,
    now: Date.parse(workerAfter.capturedAt) });
  if (!isDeepStrictEqual(beforeContext.rollbackSnapshot, afterContext.rollbackSnapshot)) throw new Error('app-only Worker route snapshot changed');
  assertAppPagesCandidateBound(appBefore, appCandidate, appCurrent, releaseSha);
  if (!reusedBefore || !reusedAfter || !isDeepStrictEqual(Object.keys(reusedBefore).sort(), ['control-panel', 'marketing'])
    || !isDeepStrictEqual(Object.keys(reusedAfter).sort(), ['control-panel', 'marketing'])
    || !isDeepStrictEqual(reusedBefore, reusedAfter)) throw new Error('app-only reused Pages changed');
  reusedPage(reusedBefore.marketing, 'lythaus-marketing', 'main');
  reusedPage(reusedBefore['control-panel'], adminProject, 'main');
  const workerVersions = Object.fromEntries(Object.entries(workers).map(([component, worker]) => [component, worker.versionId]));
  if (!browser || browser.status !== 'PASSED' || browser.journey !== 'LOGIN_REFRESH_LOGOUT' || browser.viewport !== '390x1000'
    || browser.releaseSha !== releaseSha || browser.artifactId !== artifact.artifactId || browser.archiveDigest !== artifact.archiveDigest
    || !isDeepStrictEqual(browser.workerVersions, workerVersions)) throw new Error('app-only real browser evidence is unbound');
  return Object.freeze({ artifact, prior, priorRelease, servingProof: verifiedServingProof, browser, keeperVerifiedAt, workers,
    rollbackSnapshot: beforeContext.rollbackSnapshot, appBefore, appCandidate, reusedPages: reusedBefore });
}
