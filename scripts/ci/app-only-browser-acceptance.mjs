import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertCanonicalContext } from './prepare-app-only-release.mjs';
import { captureServingWorkers } from './capture-app-only-worker-state.mjs';
import { assertCapturedWorkersUnchanged } from '../release/app-only-eligibility.mjs';
import { assertAppOnlyKeeperRun } from '../release/app-only-acceptance.mjs';
import { runAppOnlyAuthBrowser } from './app-only-auth-browser.mjs';

function capture() {
  const startedAt = new Date().toISOString();
  const workers = captureServingWorkers();
  return { schemaVersion: 1, startedAt, capturedAt: new Date().toISOString(), workers };
}

/** This is a real test-account login, refresh and all-session logout. It is
 * only for the protected canonical release after independent acceptance. */
export async function runProtectedAppBrowser(env = process.env) {
  assertCanonicalContext(env);
  if (!env.CODEX_TEST_EMAIL || !env.CODEX_TEST_PASSWORD) throw new Error('authorized production test account is unavailable');
  const directory = path.join(env.RUNNER_TEMP, 'app-only-release');
  const prepared = JSON.parse(readFileSync(path.join(directory, 'preparation.json'), 'utf8'));
  if (prepared?.schemaVersion !== 'lythaus-app-only-preparation-v1' || prepared.releaseSha !== env.RELEASE_SHA
    || prepared.artifact?.releaseSha !== env.RELEASE_SHA || prepared.artifact?.ciRunId !== env.CI_RUN_ID) {
    throw new Error('app-only browser preparation is not bound to this release');
  }
  assertAppOnlyKeeperRun({ run: { ...prepared.keeper, candidateDependencies: prepared.keeper.dependencies },
    context: prepared.context, requireCompleted: true });
  const before = capture();
  const workers = assertCapturedWorkersUnchanged(prepared.workerCapture, before);
  const { chromium } = await import('playwright');
  const browser = await runAppOnlyAuthBrowser({ chromium, artifactDir: path.join(env.RUNNER_TEMP, 'verified-app-only-artifact'),
    email: env.CODEX_TEST_EMAIL, password: env.CODEX_TEST_PASSWORD });
  const after = capture();
  assertCapturedWorkersUnchanged(before, after);
  const receipt = { ...browser, releaseSha: env.RELEASE_SHA, artifactId: prepared.artifact.artifactId,
    archiveDigest: prepared.artifact.archiveDigest,
    workerVersions: Object.fromEntries(Object.entries(workers).map(([component, worker]) => [component, worker.versionId])) };
  writeFileSync(path.join(directory, 'browser.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runProtectedAppBrowser())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
