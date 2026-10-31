import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureAppPages } from './capture-app-only-pages-state.mjs';
import { assertAppPagesBaselineUnchanged } from '../release/app-only-eligibility.mjs';
import { APP_PAGES_ACCOUNT_ID, validateAppPagesServingProof } from '../release/app-pages-serving-proof.mjs';
import { productionReleaseResumeContextFromEvent } from '../release/production-release-resume-context.mjs';

function readPreparation(env) {
  const raw = env.APP_ONLY_PREPARATION_JSON;
  if (typeof raw !== 'string' || raw.length > 200000) throw new Error('app-only serving proof preparation unavailable');
  try { return JSON.parse(raw); } catch { throw new Error('app-only serving proof preparation invalid'); }
}

/** Called immediately before the immutable app Pages write. The dashboard
 * receipt must still be fresh and its full identity must match current API and
 * the integrity-checked prior manifest binding captured by preparation. */
export async function recheckAppOnlyServingProof(env = process.env, capture = captureAppPages, now = Date.now()) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'AsoraKK/Lythaus'
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.APP_ONLY_CANONICAL !== 'true' || env.RELEASE_MODE !== 'app_only'
    || env.CLOUDFLARE_ACCOUNT_ID !== APP_PAGES_ACCOUNT_ID
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
    || !/^[0-9a-f]{40}$/.test(env.RELEASE_SHA ?? '') || typeof env.GITHUB_ACTOR !== 'string') {
    throw new Error('app-only serving proof requires the protected canonical release context');
  }
  let event;
  try { event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); }
  catch { throw new Error('app-only serving proof dispatch event unavailable'); }
  const dispatch = productionReleaseResumeContextFromEvent(event);
  if (dispatch.releaseMode !== 'app_only' || dispatch.releaseSha !== env.RELEASE_SHA
    || dispatch.appPagesServingProofJson === '') {
    throw new Error('app-only serving proof dispatch inputs differ');
  }
  const prepared = readPreparation(env);
  if (prepared?.schemaVersion !== 'lythaus-app-only-preparation-v1' || prepared.releaseSha !== env.RELEASE_SHA
    || prepared.runId !== env.GITHUB_RUN_ID || prepared.runAttempt !== env.GITHUB_RUN_ATTEMPT
    || prepared.previousProductionSha !== dispatch.previousProductionSha
    || !/^[1-9][0-9]*$/.test(prepared.previousRunId ?? '') || !prepared.priorRelease || !prepared.servingProof) {
    throw new Error('app-only serving proof preparation is bound to a different release');
  }
  const current = await capture({ token: env.CLOUDFLARE_API_TOKEN, branch: env.LYTHAUS_WEB_PAGES_BRANCH });
  assertAppPagesBaselineUnchanged(prepared.appPage, current);
  let rawProof;
  try { rawProof = JSON.parse(dispatch.appPagesServingProofJson); }
  catch { throw new Error('app-only serving proof dispatch input invalid'); }
  const receipt = validateAppPagesServingProof({ proof: rawProof, snapshot: current,
    priorRelease: prepared.priorRelease, releaseSha: env.RELEASE_SHA, previousSha: prepared.previousProductionSha,
    previousRunId: prepared.previousRunId, actor: env.GITHUB_ACTOR, now });
  if (receipt.proofDigest !== prepared.servingProof.proofDigest) throw new Error('app-only serving proof receipt differs from dispatch input');
  return Object.freeze({ status: 'APP_ONLY_SERVING_PROOF_RECHECKED', proofDigest: receipt.proofDigest,
    deploymentId: receipt.deploymentId, observedAt: receipt.observedAt, apiCapturedAt: new Date().toISOString() });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await recheckAppOnlyServingProof())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
