import { isDeepStrictEqual } from 'node:util';
import { assertAppPagesCandidateBound } from './app-only-eligibility.mjs';
import { rollbackAppPages } from './app-only-pages-rollback.mjs';
import { verifyAppOnlyReleaseEvidence } from './app-only-release-evidence.mjs';
import { verifyAppPagesServingProofReceipt } from './app-pages-serving-proof.mjs';

/** The protected caller holds the canonical production lock and provides fixed provider adapters.
 * No deployment ID is inferred from a SHA or from a failed deployment job. */
export async function finalizeAppOnlyRelease({ preparation, browser, jobsProbe, deployment, adminProject,
  readApp, readWorkers, readRoutes, readReusedPages, verifyKeeper, smoke, restore, delay, now = () => Date.now() } = {}) {
  if (preparation?.schemaVersion !== 'lythaus-app-only-preparation-v1' || typeof readApp !== 'function'
    || typeof readWorkers !== 'function' || typeof readRoutes !== 'function' || typeof readReusedPages !== 'function'
    || typeof verifyKeeper !== 'function' || typeof now !== 'function' || typeof smoke !== 'function' || typeof restore !== 'function') throw new Error('app-only finalization inputs invalid');
  const before = preparation.appPage;
  const servingProof = verifyAppPagesServingProofReceipt({ receipt: preparation.servingProof, snapshot: before,
    priorRelease: preparation.priorRelease, releaseSha: preparation.releaseSha,
    previousSha: preparation.previousProductionSha, previousRunId: preparation.previousRunId,
    actor: preparation.servingProof?.capturedBy, now: Date.now(), requireFreshNow: false });
  if (deployment?.status !== 'success') {
    throw new Error('app-only deployment outcome is uncertain; inspect provider state before another action');
  }
  let candidate = null;
  try {
    const current = await readApp();
    if (deployment.project !== 'lythaus-web' || deployment.project !== current.project
      || deployment.branch !== current.branch || deployment.deployedSha !== current.commitSha
      || deployment.deploymentId !== current.deploymentId || deployment.deploymentUrl !== current.deploymentUrl) {
      throw new Error('app-only deployment evidence does not bind the current Pages deployment');
    }
    assertAppPagesCandidateBound(before, current, current, preparation.releaseSha);
    candidate = current;
    const smokeResult = await smoke({ jobsProbe, workers: preparation.workerCapture.workers, releaseSha: preparation.releaseSha });
    if (!smokeResult || ['marketing', 'www', 'flutter_web', 'public_api', 'admin_api', 'admin_ui', 'jobs']
      .some(name => smokeResult[name] !== 'PASS') || smokeResult.jobsEvidence !== 'CAPTURED_VERSION_NO_PUBLIC_HEALTH_ROUTE') {
      throw new Error('app-only production smoke is incomplete');
    }
    const workerAfter = await readWorkers();
    const routeAfter = await readRoutes();
    const reusedAfter = await readReusedPages();
    const appCurrent = await readApp();
    const keeper = await verifyKeeper(preparation);
    if (keeper?.status !== 'completed' || keeper.acceptanceRunId !== preparation.keeper?.acceptanceRunId
      || keeper.expiresAt !== preparation.keeper?.expiresAt || !isDeepStrictEqual(keeper.candidate, preparation.keeper?.candidate)) {
      throw new Error('app-only final Keeper acceptance differs');
    }
    const keeperVerifiedAt = new Date(now()).toISOString();
    if (Date.parse(keeper.expiresAt) <= Date.parse(keeperVerifiedAt)) throw new Error('app-only Keeper acceptance expired during activation');
    const evidence = { schemaVersion: 'lythaus-app-only-release-evidence-v1', artifact: preparation.artifact, browser,
      prior: { previousSha: preparation.previousProductionSha, previousRunId: preparation.previousRunId,
        artifactId: preparation.priorManifestArtifactId, archiveDigest: preparation.priorManifestDigest },
      priorRelease: preparation.priorRelease, servingProof,
      workerBefore: preparation.workerCapture, workerAfter, routeBefore: preparation.routeSnapshots, routeAfter,
      appBefore: before, appCandidate: candidate, appCurrent, reusedBefore: preparation.reusedPages, reusedAfter, keeperVerifiedAt };
    verifyAppOnlyReleaseEvidence({ evidence, releaseSha: preparation.releaseSha,
      ciRunId: preparation.artifact.ciRunId, previousSha: preparation.previousProductionSha,
      previousRunId: preparation.previousRunId, adminProject, now: Date.parse(keeperVerifiedAt) });
    return Object.freeze({ status: 'VERIFIED', smoke: smokeResult, evidence, rollback: { status: 'READY', baseline: before } });
  } catch {
    if (!candidate) throw new Error('app-only candidate is unbound; inspect provider state before any rollback');
    let rollback;
    try { rollback = await rollbackAppPages({ before, candidate, releaseSha: preparation.releaseSha, readCurrent: readApp, restore,
      verifyBaseline: current => verifyAppPagesServingProofReceipt({ receipt: servingProof, snapshot: current,
        priorRelease: preparation.priorRelease, releaseSha: preparation.releaseSha,
        previousSha: preparation.previousProductionSha, previousRunId: preparation.previousRunId,
        actor: servingProof.capturedBy, now: Date.now(), requireFreshNow: false }), ...(delay ? { delay } : {}) }); }
    catch { throw new Error('app-only post-deployment verification failed and rollback is unverified; inspect provider state'); }
    return Object.freeze({ status: 'BLOCKED', rollback });
  }
}
