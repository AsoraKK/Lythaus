import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertMainDispatchAccountContext, captureServingWorkers } from './capture-app-only-worker-state.mjs';
import { captureAppPages, captureReusedPages } from './capture-app-only-pages-state.mjs';
import { fetchVerifiedAppArtifact, fetchVerifiedPriorReleaseManifest } from './verify-extract-app-artifact.mjs';
import { prepareAppOnlyKeeperRun } from './app-only-keeper.mjs';
import { assertReviewedAppSource, assertReviewedPublicContract } from '../release/app-only-eligibility.mjs';
import { assertAppOnlyWorkerSourcesAncestral, createAppOnlyAcceptanceContext } from '../release/app-only-acceptance.mjs';
import { assertAppOnlyPriorRelease } from '../release/app-only-prior-release.mjs';
import { prepareFixtureBoundKeeper } from './adr003-disposable-evidence.mjs';
import { assertAppPagesServingProofNotReplayed, createAppPagesPriorReleaseBinding,
  validateAppPagesServingProof, writeAppPagesServingProofConsumption } from '../release/app-pages-serving-proof.mjs';

export function assertCanonicalContext(env) {
  assertMainDispatchAccountContext(env);
  if (env.GITHUB_WORKFLOW_REF !== 'AsoraKK/Lythaus/.github/workflows/production-release.yml@refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.RELEASE_MODE !== 'app_only'
    || !/^[0-9a-f]{40}$/.test(env.RELEASE_SHA ?? '') || !/^[0-9a-f]{40}$/.test(env.PREVIOUS_PRODUCTION_SHA ?? '')
    || !/^[1-9][0-9]*$/.test(env.CI_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.PREVIOUS_PRODUCTION_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
    || !env.GH_TOKEN || !env.DATABASE_READINESS_TOKEN || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) {
    throw new Error('app-only preparation requires the canonical protected main-dispatch context');
  }
  let event;
  try { event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); }
  catch { throw new Error('app-only dispatch event is unavailable'); }
  if (env.GITHUB_REF_PROTECTED !== 'true' || event?.inputs?.release_mode !== 'app_only'
    || event.inputs.release_sha !== env.RELEASE_SHA || event.inputs.previous_production_sha !== env.PREVIOUS_PRODUCTION_SHA
    || event.inputs.ci_run_id !== env.CI_RUN_ID
    || event.inputs.app_pages_serving_proof_json !== env.APP_PAGES_SERVING_PROOF_JSON
    || ![true, 'true'].includes(event.inputs.confirm_production)) {
    throw new Error('app-only dispatch is not the confirmed protected release');
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== env.RELEASE_SHA) throw new Error('app-only preparation checkout differs from release SHA');
}

export function captureRoutes(directory) {
  const specs = [['adminApi', 'admin.lythaus.co/api/admin/*'], ['coordinator', 'admin.lythaus.co/api/admin/production-auth-acceptance/*']];
  const result = {};
  for (const [component, pattern] of specs) {
    const output = path.join(directory, `${component}-route.json`);
    try {
      execFileSync(process.execPath, ['scripts/ci/manage-cloudflare-worker-route.mjs', 'snapshot', output, pattern],
        { stdio: 'pipe', timeout: 30000 });
      result[component] = JSON.parse(readFileSync(output, 'utf8'));
    } catch { throw new Error(`app-only ${component} route capture failed`); }
  }
  return result;
}

/** Only called by the locked canonical job after its ordinary governance,
 * Cloudflare-provider, security and app-Pages rollback preflight. */
export async function prepareAppOnlyRelease(env = process.env) {
  assertCanonicalContext(env);
  const directory = path.join(env.RUNNER_TEMP, 'app-only-release');
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  assertReviewedAppSource(process.cwd(), env.RELEASE_SHA);
  const startedAt = new Date().toISOString();
  const workers = captureServingWorkers();
  const workerCapture = { schemaVersion: 1, startedAt, capturedAt: new Date().toISOString(), workers };
  const routeSnapshots = captureRoutes(directory);
  const appPage = await captureAppPages({ token: env.CLOUDFLARE_API_TOKEN, branch: env.LYTHAUS_WEB_PAGES_BRANCH });
  const reusedPages = await captureReusedPages({ token: env.CLOUDFLARE_API_TOKEN, adminProject: env.LYTHAUS_ADMIN_PAGES_PROJECT });
  const context = createAppOnlyAcceptanceContext({ releaseSha: env.RELEASE_SHA, capture: workerCapture, routeSnapshots });
  assertAppOnlyWorkerSourcesAncestral(process.cwd(), env.RELEASE_SHA, context.dependencies);
  assertReviewedPublicContract(process.cwd(), env.RELEASE_SHA, workers.public.sourceSha);
  const prior = fetchVerifiedPriorReleaseManifest({ previousSha: env.PREVIOUS_PRODUCTION_SHA, previousRunId: env.PREVIOUS_PRODUCTION_RUN_ID });
  assertAppOnlyPriorRelease({ manifest: prior.manifest, previousSha: env.PREVIOUS_PRODUCTION_SHA, workerCapture, appPage, reusedPages });
  let rawServingProof;
  try {
    if (typeof env.APP_PAGES_SERVING_PROOF_JSON !== 'string' || env.APP_PAGES_SERVING_PROOF_JSON.length > 20000) throw new Error();
    rawServingProof = JSON.parse(env.APP_PAGES_SERVING_PROOF_JSON);
  } catch { throw new Error('app Pages dashboard serving proof is missing or invalid'); }
  const priorRelease = createAppPagesPriorReleaseBinding({ prior, previousSha: env.PREVIOUS_PRODUCTION_SHA,
    previousRunId: env.PREVIOUS_PRODUCTION_RUN_ID, appPage });
  const servingProof = validateAppPagesServingProof({ proof: rawServingProof, snapshot: appPage, priorRelease,
    releaseSha: env.RELEASE_SHA, previousRunId: env.PREVIOUS_PRODUCTION_RUN_ID, actor: env.GITHUB_ACTOR });
  const replay = assertAppPagesServingProofNotReplayed({ proofDigest: servingProof.proofDigest, runId: env.GITHUB_RUN_ID });
  const proofConsumptionPath = path.join(directory, 'serving-proof-consumption.json');
  writeAppPagesServingProofConsumption({ path: proofConsumptionPath, proof: servingProof, releaseSha: env.RELEASE_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, previousRunId: env.PREVIOUS_PRODUCTION_RUN_ID });
  if (env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(env.GITHUB_STEP_SUMMARY, [
      '## App-only Pages serving evidence', '',
      `- Source: [Cloudflare Pages production deployment](${servingProof.sourceUrl})`,
      `- Observed: ${servingProof.observedAt} by ${servingProof.capturedBy}`,
      `- Host and deployment: ${servingProof.hostname} → ${servingProof.deploymentId} (${servingProof.commitSha})`,
      `- Matched project/API record: ${appPage.project} / ${appPage.projectId} / ${appPage.deploymentUrl}`,
      `- Prior manifest: run ${priorRelease.previousRunId}, artifact ${priorRelease.artifactId}, ${priorRelease.archiveDigest}`,
      `- One-use proof receipt: ${replay.artifactName}`, '',
      'The protected production reviewer must inspect the source record and these exact identities before approving deployment.', '',
    ].join('\n'));
  }
  const artifact = fetchVerifiedAppArtifact({ releaseSha: env.RELEASE_SHA, ciRunId: env.CI_RUN_ID,
    destination: path.join(env.RUNNER_TEMP, 'verified-app-only-artifact') });
  // Do not start a human window based on an observation that aged during the
  // prior-manifest or artifact reads.
  createAppOnlyAcceptanceContext({ releaseSha: env.RELEASE_SHA, capture: workerCapture, routeSnapshots });
  const keeper = await prepareFixtureBoundKeeper({ raw: env.ADR003_CONTENT_RECEIPT, releaseSha: env.RELEASE_SHA,
    worker: workers.public, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    start: () => prepareAppOnlyKeeperRun({ context, acceptanceRunId: env.ACCEPTANCE_RUN_ID ?? '',
      readinessToken: env.DATABASE_READINESS_TOKEN, accessClientId: env.CF_ACCESS_CLIENT_ID, accessClientSecret: env.CF_ACCESS_CLIENT_SECRET }) });
  const receipt = { schemaVersion: 'lythaus-app-only-preparation-v1', releaseSha: env.RELEASE_SHA,
    runId: String(env.GITHUB_RUN_ID), runAttempt: String(env.GITHUB_RUN_ATTEMPT),
    previousProductionSha: env.PREVIOUS_PRODUCTION_SHA, previousRunId: prior.previousRunId,
    priorManifestArtifactId: prior.artifactId, priorManifestDigest: prior.archiveDigest,
    artifact, workerCapture, routeSnapshots, appPage, reusedPages, priorRelease, servingProof, context, keeper,
    proofConsumptionPath, proofArtifactName: replay.artifactName };
  writeFileSync(path.join(directory, 'preparation.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const receipt = await prepareAppOnlyRelease();
    console.log(JSON.stringify({ status: receipt.keeper.status === 'completed' ? 'KEEPER_COMPLETE_OBSERVER_STILL_REQUIRED' : 'HUMAN_ACCEPTANCE_REQUIRED',
      acceptanceRunId: receipt.keeper.acceptanceRunId, proofArtifactName: receipt.proofArtifactName,
      output: path.join(process.env.RUNNER_TEMP, 'app-only-release', 'preparation.json') }));
    if (receipt.keeper.status !== 'completed') {
      console.log(`Complete the existing protected Keeper flow for run ${receipt.keeper.acceptanceRunId}, then resume that exact run.`);
      process.exitCode = 2;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
