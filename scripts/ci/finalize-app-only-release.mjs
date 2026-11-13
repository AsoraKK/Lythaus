import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertCanonicalContext, captureRoutes } from './prepare-app-only-release.mjs';
import { captureServingWorkers } from './capture-app-only-worker-state.mjs';
import { captureAppPages, captureReusedPages } from './capture-app-only-pages-state.mjs';
import { finalizeAppOnlyRelease } from '../release/app-only-finalize.mjs';
import { smokeAppOnlyProduction } from '../release/app-only-production-smoke.mjs';
import { transitionReleaseState } from './transition-release-state.mjs';
import { prepareAppOnlyKeeperRun } from './app-only-keeper.mjs';
import { rollbackAppOnlyPagesDeployment } from './rollback-app-only-pages-deployment.mjs';

function parse(name, env) {
  const raw = env[name];
  if (typeof raw !== 'string' || raw.length > 200000) throw new Error(`app-only ${name} evidence missing`);
  try { return JSON.parse(raw); } catch { throw new Error(`app-only ${name} evidence invalid`); }
}
function workerCapture() {
  const startedAt = new Date().toISOString();
  const workers = captureServingWorkers();
  return { schemaVersion: 1, startedAt, capturedAt: new Date().toISOString(), workers };
}

/** Fixed adapters used only after protected, locked canonical preflight. */
export async function finalizeProtectedAppOnlyRelease(env = process.env) {
  assertCanonicalContext(env);
  if (!env.GITHUB_OUTPUT) throw new Error('protected app-only output is missing');
  const preparation = parse('APP_ONLY_PREPARATION_JSON', env), browser = parse('APP_ONLY_BROWSER_JSON', env);
  const deployment = { status: env.APP_ONLY_DEPLOYMENT_STATUS, project: env.APP_ONLY_DEPLOYMENT_PROJECT,
    branch: env.APP_ONLY_DEPLOYMENT_BRANCH, deployedSha: env.APP_ONLY_DEPLOYMENT_SHA,
    deploymentId: env.APP_ONLY_DEPLOYMENT_ID, deploymentUrl: env.APP_ONLY_DEPLOYMENT_URL };
  const jobsProbe = parse('APP_ONLY_JOBS_PROBE_JSON', env);
  let history = parse('APP_ONLY_HISTORY_JSON', env);
  if (!Array.isArray(history) || history.at(-1)?.state !== 'PRODUCT_ACCEPTANCE_PASSED') throw new Error('app-only acceptance state history is incomplete');
  if (preparation.releaseSha !== env.RELEASE_SHA || preparation.previousProductionSha !== env.PREVIOUS_PRODUCTION_SHA
    || preparation.artifact?.ciRunId !== env.CI_RUN_ID || preparation.previousRunId !== env.PREVIOUS_PRODUCTION_RUN_ID) {
    throw new Error('app-only finalization evidence is bound to a different release');
  }
  const directory = path.join(env.RUNNER_TEMP, 'app-only-finalization');
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const readApp = () => captureAppPages({ token: env.CLOUDFLARE_API_TOKEN, branch: env.LYTHAUS_WEB_PAGES_BRANCH });
  const restore = async ({ before, candidate }) => {
    const evidence = await rollbackAppOnlyPagesDeployment({ env, preparation,
      accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, before, candidate });
    writeFileSync(path.join(directory, 'pages-rollback.json'), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    return evidence;
  };
  const result = await finalizeAppOnlyRelease({ preparation, browser, jobsProbe, deployment,
    adminProject: env.LYTHAUS_ADMIN_PAGES_PROJECT, readApp, readWorkers: workerCapture,
    readRoutes: async () => captureRoutes(directory),
    readReusedPages: () => captureReusedPages({ token: env.CLOUDFLARE_API_TOKEN, adminProject: env.LYTHAUS_ADMIN_PAGES_PROJECT }),
    verifyKeeper: prepared => prepareAppOnlyKeeperRun({ context: prepared.context, acceptanceRunId: prepared.keeper.acceptanceRunId,
      readinessToken: env.DATABASE_READINESS_TOKEN, accessClientId: env.CF_ACCESS_CLIENT_ID, accessClientSecret: env.CF_ACCESS_CLIENT_SECRET }),
    smoke: data => smokeAppOnlyProduction({ ...data, accessClientId: env.CF_ACCESS_CLIENT_ID, accessClientSecret: env.CF_ACCESS_CLIENT_SECRET }),
    restore });
  writeFileSync(path.join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  if (result.status === 'VERIFIED' || result.status === 'BLOCKED') history = transitionReleaseState(history, 'ACTIVATED');
  history = transitionReleaseState(history, result.status === 'VERIFIED' ? 'VERIFIED' : 'BLOCKED');
  if (result.rollback.status === 'ROLLED_BACK_PROVIDER_READBACK') history = transitionReleaseState(history, 'ROLLED_BACK');
  const lines = [`status=${result.status}`, `rollback_status=${result.rollback.status}`,
    `release_state=${history.at(-1).state}`, `history_json=${JSON.stringify(history)}`];
  if (result.status === 'VERIFIED') lines.push(`evidence_json=${JSON.stringify(result.evidence)}`, `smoke_json=${JSON.stringify(result.smoke)}`);
  appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await finalizeProtectedAppOnlyRelease();
    console.log(JSON.stringify({ status: result.status, rollbackStatus: result.rollback.status }));
    if (result.status !== 'VERIFIED') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
