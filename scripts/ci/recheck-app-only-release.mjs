import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertCanonicalContext, captureRoutes } from './prepare-app-only-release.mjs';
import { captureServingWorkers } from './capture-app-only-worker-state.mjs';
import { captureAppPages, captureReusedPages } from './capture-app-only-pages-state.mjs';
import { assertAppPagesBaselineUnchanged, assertCapturedWorkersUnchanged } from '../release/app-only-eligibility.mjs';
import { createAppOnlyAcceptanceContext } from '../release/app-only-acceptance.mjs';
import { prepareAppOnlyKeeperRun } from './app-only-keeper.mjs';
import { verifyAppPagesServingProofReceipt } from '../release/app-pages-serving-proof.mjs';

/** Re-read every captured surface immediately before handing the locked
 * transaction to the existing Pages helper. */
export async function recheckPreparedAppOnlyRelease(env = process.env) {
  assertCanonicalContext(env);
  const directory = path.join(env.RUNNER_TEMP, 'app-only-release');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const prepared = env.APP_ONLY_PREPARATION_JSON ? JSON.parse(env.APP_ONLY_PREPARATION_JSON)
    : JSON.parse(readFileSync(path.join(directory, 'preparation.json'), 'utf8'));
  if (prepared?.schemaVersion !== 'lythaus-app-only-preparation-v1' || prepared.releaseSha !== env.RELEASE_SHA
    || prepared.previousProductionSha !== env.PREVIOUS_PRODUCTION_SHA || prepared.previousRunId !== env.PREVIOUS_PRODUCTION_RUN_ID
    || prepared.artifact?.ciRunId !== env.CI_RUN_ID) {
    throw new Error('app-only preparation is bound to a different release');
  }
  const startedAt = new Date().toISOString();
  const workers = captureServingWorkers();
  const after = { schemaVersion: 1, startedAt, capturedAt: new Date().toISOString(), workers };
  assertCapturedWorkersUnchanged(prepared.workerCapture, after);
  const routes = captureRoutes(directory);
  const afterContext = createAppOnlyAcceptanceContext({ releaseSha: env.RELEASE_SHA, capture: after, routeSnapshots: routes });
  if (!isDeepStrictEqual(prepared.context.rollbackSnapshot, afterContext.rollbackSnapshot)) throw new Error('app-only route or Worker state changed');
  const app = await captureAppPages({ token: env.CLOUDFLARE_API_TOKEN, branch: env.LYTHAUS_WEB_PAGES_BRANCH });
  assertAppPagesBaselineUnchanged(prepared.appPage, app);
  verifyAppPagesServingProofReceipt({ receipt: prepared.servingProof, snapshot: app, priorRelease: prepared.priorRelease,
    releaseSha: env.RELEASE_SHA, previousSha: env.PREVIOUS_PRODUCTION_SHA,
    previousRunId: env.PREVIOUS_PRODUCTION_RUN_ID, actor: env.GITHUB_ACTOR, now: Date.now(), requireFreshNow: true });
  const reused = await captureReusedPages({ token: env.CLOUDFLARE_API_TOKEN, adminProject: env.LYTHAUS_ADMIN_PAGES_PROJECT });
  if (!isDeepStrictEqual(prepared.reusedPages, reused)) throw new Error('app-only reused Pages state changed');
  const keeper = await prepareAppOnlyKeeperRun({ context: afterContext, acceptanceRunId: prepared.keeper.acceptanceRunId,
    readinessToken: env.DATABASE_READINESS_TOKEN, accessClientId: env.CF_ACCESS_CLIENT_ID, accessClientSecret: env.CF_ACCESS_CLIENT_SECRET });
  if (keeper.status !== 'completed' || keeper.expiresAt !== prepared.keeper.expiresAt
    || !isDeepStrictEqual(keeper.candidate, prepared.keeper.candidate)) throw new Error('app-only completed Keeper acceptance changed');
  return Object.freeze({ status: 'RECHECKED', releaseSha: env.RELEASE_SHA });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await recheckPreparedAppOnlyRelease())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
