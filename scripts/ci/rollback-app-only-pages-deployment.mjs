#!/usr/bin/env node
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { normalizePagesSnapshot } from '../release/app-only-eligibility.mjs';
import { assertMainDispatchAccountContext } from './capture-app-only-worker-state.mjs';
import { APP_PAGES_ACCOUNT_ID, validateAppPagesServingProof, verifyAppPagesServingProofReceipt } from '../release/app-pages-serving-proof.mjs';
import { productionReleaseResumeContextFromEvent } from '../release/production-release-resume-context.mjs';

export function assertRollbackProviderResponse({ response, payload, before }) {
  const wrapped = { success: true, result: { id: before.projectId, name: before.project,
    production_branch: before.branch, canonical_deployment: payload?.result } };
  if (!response.ok || response.redirected || payload?.success !== true
    || !isDeepStrictEqual(normalizePagesSnapshot(wrapped, before.project, before.branch), before)) {
    throw new Error('Pages rollback response is unverified');
  }
}

/** One provider mutation at most. A failed response or readback is uncertain. */
async function rollbackPagesDeploymentCore({ accountId, token, before, candidate, fetchImpl = fetch,
  appOnlyServingProofContext, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!/^[0-9a-f]{32}$/i.test(accountId ?? '') || !token || !before || !candidate
    || before.project !== candidate.project || before.projectId !== candidate.projectId
    || before.branch !== candidate.branch || before.deploymentId === candidate.deploymentId
    || before.deploymentUrl === candidate.deploymentUrl) {
    throw new Error('Pages rollback identities are invalid');
  }
  const project = before.project;
  if (!/^lythaus-[a-z0-9-]+$/.test(project ?? '')) throw new Error('Pages rollback project is invalid');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const readJson = async url => {
    const response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || response.redirected) throw new Error('Pages provider read failed');
    return response.json();
  };
  const normalize = payload => normalizePagesSnapshot(payload, project, before.branch);
  const readCurrent = async () => normalize(await readJson(endpoint));
  const asProject = deployment => ({ success: true, result: { id: before.projectId, name: project,
    production_branch: before.branch, canonical_deployment: deployment } });
  // Validate captured records before constructing URLs or attempting a mutation.
  const stored = value => normalize(asProject({ id: value.deploymentId, project_id: value.projectId,
    project_name: value.project, environment: 'production', is_skipped: false, latest_stage: { name: 'deploy', status: 'success' }, url: value.deploymentUrl,
    deployment_trigger: { metadata: { branch: value.branch, commit_hash: value.commitSha, commit_dirty: false } } }));
  if (!isDeepStrictEqual(stored(before), before) || !isDeepStrictEqual(stored(candidate), candidate)) {
    throw new Error('Pages rollback identity is malformed');
  }
  const target = await readJson(`${endpoint}/deployments/${before.deploymentId}`);
  if (target?.success !== true || !isDeepStrictEqual(normalize(asProject(target.result)), before)) {
    throw new Error('Pages rollback baseline deployment differs');
  }
  if (!isDeepStrictEqual(await readCurrent(), candidate)) throw new Error('Pages rollback canonical candidate record differs');
  const verifyAppOnlyProof = snapshot => {
    const context = appOnlyServingProofContext;
    if (!context || context.schemaVersion !== 'lythaus-app-only-pages-rollback-proof-context-v1'
      || context.releaseSha !== candidate.commitSha || context.actor !== context.servingProof?.capturedBy
      || !context.priorRelease || context.previousProductionSha !== context.priorRelease.previousSha
      || context.previousRunId !== context.priorRelease.previousRunId) throw new Error('app-only rollback serving proof context invalid');
    const verified = verifyAppPagesServingProofReceipt({ receipt: context.servingProof, snapshot,
      priorRelease: context.priorRelease, releaseSha: context.releaseSha,
      previousSha: context.previousProductionSha, previousRunId: context.previousRunId,
      actor: context.actor, now: Date.now(), requireFreshNow: false });
    return verified;
  };
  if (appOnlyServingProofContext) verifyAppOnlyProof(before);
  let response, payload;
  try {
    response = await fetchImpl(`${endpoint}/deployments/${before.deploymentId}/rollback`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    payload = await response.json();
    assertRollbackProviderResponse({ response, payload, before });
  } catch { throw new Error('Pages rollback outcome is uncertain; inspect provider state'); }
  for (let attempt = 0; attempt < 6; attempt++) {
    let current;
    try { current = await readCurrent(); } catch { throw new Error('Pages rollback outcome is uncertain; inspect provider state'); }
    if (isDeepStrictEqual(current, before)) {
      const proof = appOnlyServingProofContext ? verifyAppOnlyProof(current) : null;
      return Object.freeze({ schemaVersion: 1, status: 'ROLLED_BACK',
      project, deploymentId: before.deploymentId, restoredCommitSha: before.commitSha,
      ...(proof ? { servingProofDigest: proof.proofDigest } : {}), completedAt: new Date().toISOString() });
    }
    if (!isDeepStrictEqual(current, candidate)) throw new Error('Pages rollback outcome is uncertain; inspect provider state');
    if (attempt < 5) await delay(2000);
  }
  throw new Error('Pages rollback outcome is uncertain; inspect provider state');
}

function parseObject(raw, message) {
  if (typeof raw !== 'string' || raw.length > 200000) throw new Error(message);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error(message); }
}

/** The only app-only rollback entrypoint. It binds the receipt to the exact
 * protected dispatch and retained preparation output before any provider read
 * or write. The shared CLI below never accepts this context. */
export async function rollbackAppOnlyPagesDeployment({ env = process.env, preparation, accountId, token,
  before, candidate, fetchImpl = fetch, delay } = {}) {
  assertMainDispatchAccountContext(env);
  if (env.APP_ONLY_CANONICAL !== 'true' || env.GITHUB_REF_PROTECTED !== 'true' || env.RELEASE_MODE !== 'app_only'
    || env.CLOUDFLARE_ACCOUNT_ID !== APP_PAGES_ACCOUNT_ID || env.APP_ONLY_DEPLOYMENT_STATUS !== 'success'
    || !/^[0-9a-f]{40}$/.test(env.RELEASE_SHA ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') || !/^[1-9][0-9]*$/.test(env.CI_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.PREVIOUS_PRODUCTION_RUN_ID ?? '')
    || !/^[0-9a-f]{40}$/.test(env.PREVIOUS_PRODUCTION_SHA ?? '') || accountId !== APP_PAGES_ACCOUNT_ID
    || token !== env.CLOUDFLARE_API_TOKEN || !isDeepStrictEqual(before, preparation?.appPage)) {
    throw new Error('app-only rollback requires the protected canonical preparation');
  }
  const retainedPreparation = parseObject(env.APP_ONLY_PREPARATION_JSON, 'app-only rollback preparation unavailable');
  if (!isDeepStrictEqual(retainedPreparation, preparation) || preparation?.schemaVersion !== 'lythaus-app-only-preparation-v1'
    || preparation.releaseSha !== env.RELEASE_SHA || preparation.previousProductionSha !== env.PREVIOUS_PRODUCTION_SHA
    || preparation.previousRunId !== env.PREVIOUS_PRODUCTION_RUN_ID || preparation.runId !== env.GITHUB_RUN_ID
    || preparation.runAttempt !== env.GITHUB_RUN_ATTEMPT || preparation.artifact?.ciRunId !== env.CI_RUN_ID) {
    throw new Error('app-only rollback preparation provenance differs');
  }
  const expectedCandidate = { project: env.APP_ONLY_DEPLOYMENT_PROJECT, branch: env.APP_ONLY_DEPLOYMENT_BRANCH,
    deploymentId: env.APP_ONLY_DEPLOYMENT_ID, commitSha: env.APP_ONLY_DEPLOYMENT_SHA,
    deploymentUrl: env.APP_ONLY_DEPLOYMENT_URL };
  if (env.APP_ONLY_DEPLOYMENT_PROJECT !== 'lythaus-web' || candidate?.project !== expectedCandidate.project
    || candidate?.branch !== expectedCandidate.branch || candidate?.deploymentId !== expectedCandidate.deploymentId
    || candidate?.commitSha !== expectedCandidate.commitSha || candidate?.deploymentUrl !== expectedCandidate.deploymentUrl
    || candidate?.commitSha !== env.RELEASE_SHA) throw new Error('app-only rollback candidate differs from the protected deployment');

  let event;
  try { event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); }
  catch { throw new Error('app-only rollback dispatch event unavailable'); }
  const dispatch = productionReleaseResumeContextFromEvent(event);
  if (dispatch.releaseMode !== 'app_only' || dispatch.releaseSha !== env.RELEASE_SHA
    || dispatch.previousProductionSha !== env.PREVIOUS_PRODUCTION_SHA
    || dispatch.ciRunId !== env.CI_RUN_ID || ![true, 'true'].includes(dispatch.confirmProduction)
    || dispatch.appPagesServingProofJson === '') {
    throw new Error('app-only rollback dispatch does not match the protected preparation');
  }
  let rawProof;
  try { rawProof = JSON.parse(dispatch.appPagesServingProofJson); }
  catch { throw new Error('app-only rollback dashboard receipt is invalid'); }
  const proof = validateAppPagesServingProof({ proof: rawProof, snapshot: preparation.appPage,
    priorRelease: preparation.priorRelease, releaseSha: env.RELEASE_SHA,
    previousSha: env.PREVIOUS_PRODUCTION_SHA, previousRunId: env.PREVIOUS_PRODUCTION_RUN_ID,
    actor: env.GITHUB_ACTOR, now: Date.parse(preparation.servingProof?.verifiedAt) });
  if (proof.proofDigest !== preparation.servingProof?.proofDigest) {
    throw new Error('app-only rollback dashboard receipt differs from the protected preparation');
  }
  const context = { schemaVersion: 'lythaus-app-only-pages-rollback-proof-context-v1',
    servingProof: preparation.servingProof, priorRelease: preparation.priorRelease, releaseSha: preparation.releaseSha,
    previousProductionSha: preparation.previousProductionSha, previousRunId: preparation.previousRunId,
    actor: env.GITHUB_ACTOR };
  return rollbackPagesDeploymentCore({ accountId, token, before, candidate, fetchImpl,
    ...(typeof delay === 'function' ? { delay } : {}), appOnlyServingProofContext: context });
}
