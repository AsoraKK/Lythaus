import { appendFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertAppOnlyKeeperRun } from '../release/app-only-acceptance.mjs';
import { verifyAppOnlyReleaseEvidence } from '../release/app-only-release-evidence.mjs';
import { transitionReleaseState } from './transition-release-state.mjs';

/** Map only the complete, validated child transaction into the canonical
 * manifest. Missing or failed jobs provide no affirmative evidence. */
export function appOnlyManifestEnvironment({ result, status, preparation, evidence, smoke, history,
  releaseSha, previousSha, previousRunId, ciRunId, adminProject, now = Date.now() } = {}) {
  if (result !== 'success' || status !== 'VERIFIED') return Object.freeze({});
  if (preparation?.schemaVersion !== 'lythaus-app-only-preparation-v1' || preparation.releaseSha !== releaseSha
    || preparation.previousProductionSha !== previousSha || preparation.previousRunId !== String(previousRunId)
    || preparation.artifact?.ciRunId !== String(ciRunId)) throw new Error('app-only manifest preparation differs');
  const verified = verifyAppOnlyReleaseEvidence({ evidence, releaseSha, ciRunId, previousSha, previousRunId, adminProject, now });
  const keeper = assertAppOnlyKeeperRun({ run: { ...preparation.keeper, candidateDependencies: preparation.keeper?.dependencies },
    context: preparation.context, now: Date.parse(verified.keeperVerifiedAt), requireCompleted: true });
  if (!isDeepStrictEqual(preparation.artifact, evidence.artifact) || !isDeepStrictEqual(preparation.workerCapture, evidence.workerBefore)
    || !isDeepStrictEqual(preparation.routeSnapshots, evidence.routeBefore) || !isDeepStrictEqual(preparation.appPage, evidence.appBefore)
    || !isDeepStrictEqual(preparation.reusedPages, evidence.reusedBefore)
    || !isDeepStrictEqual(preparation.priorRelease, evidence.priorRelease)
    || !isDeepStrictEqual(preparation.servingProof, evidence.servingProof)
    || evidence.prior.artifactId !== preparation.priorManifestArtifactId || evidence.prior.archiveDigest !== preparation.priorManifestDigest) {
    throw new Error('app-only manifest evidence differs from preparation');
  }
  if (!smoke || ['marketing', 'www', 'flutter_web', 'public_api', 'admin_api', 'admin_ui', 'jobs'].some(name => smoke[name] !== 'PASS')
    || smoke.jobsEvidence !== 'CAPTURED_VERSION_NO_PUBLIC_HEALTH_ROUTE') throw new Error('app-only smoke evidence incomplete');
  if (!Array.isArray(history) || history[0]?.state !== 'PREFLIGHT' || history.at(-1)?.state !== 'VERIFIED') throw new Error('app-only release history incomplete');
  let reconstructed = [];
  for (const entry of history) reconstructed = transitionReleaseState(reconstructed, entry.state, entry.at);
  if (!isDeepStrictEqual(reconstructed, history)) throw new Error('app-only release history invalid');
  const vars = { APP_ONLY_EVIDENCE_JSON: JSON.stringify(evidence), REUSED_PAGES_STATE_JSON: JSON.stringify(verified.reusedPages),
    LYTHAUS_ADMIN_PAGES_PROJECT: adminProject, WEB_PAGES_PROJECT: 'lythaus-web', WEB_PAGES_BRANCH: verified.appCandidate.branch,
    WEB_DEPLOYMENT_SHA: verified.appCandidate.commitSha, WEB_DEPLOYMENT_ID: verified.appCandidate.deploymentId,
    WEB_DEPLOYMENT_URL: verified.appCandidate.deploymentUrl, WEB_DEPLOYMENT_STATUS: 'ACTIVATED',
    HYPERDRIVE_VERIFIED_MAIN: 'true', DATABASE_IDENTITY_VERIFIED: 'true', BUDGET_ENFORCEMENT_VERIFIED: 'true',
    AUTHENTICATED_ACCEPTANCE_PROVEN: 'true', AUTH_ACCEPTANCE_STATUS: 'PASSED', AUTH_ACCEPTANCE_RUN_ID: keeper.acceptanceRunId,
    AUTH_ACCEPTANCE_EXPIRES_AT: keeper.expiresAt, AUTH_ACCEPTANCE_DEPENDENCIES_JSON: JSON.stringify(keeper.dependencies),
    AUTH_ACCEPTANCE_EVIDENCE_PATH: `app-only-preparation-${releaseSha}/auth-acceptance-observation.json`,
    ACTIVATION_STATE: 'ACTIVATED', ROLLBACK_ARTIFACTS_PROVEN: 'true', ROLLBACK_STATE: 'READY',
    ROLLBACK_COMPONENTS_JSON: '["flutter-web"]',
    PRODUCTION_SMOKE_MARKETING: smoke.marketing, PRODUCTION_SMOKE_WWW: smoke.www, PRODUCTION_SMOKE_FLUTTER_WEB: smoke.flutter_web,
    PRODUCTION_SMOKE_PUBLIC_API: smoke.public_api, PRODUCTION_SMOKE_ADMIN_API: smoke.admin_api,
    PRODUCTION_SMOKE_ADMIN_UI: smoke.admin_ui, PRODUCTION_SMOKE_JOBS: smoke.jobs };
  for (const [component, prefix] of [['public', 'PUBLIC_API'], ['admin', 'ADMIN_API'], ['jobs', 'JOBS'], ['coordinator', 'COORDINATOR']]) {
    const worker = verified.workers[component];
    vars[`${prefix}_WORKER_VERSION`] = worker.versionId;
    vars[`${prefix}_WORKER_SOURCE_SHA`] = worker.sourceSha;
    vars[`${prefix}_WORKER_STATUS`] = 'REUSED_PRODUCTION';
    vars[`${prefix}_WORKER_PROVENANCE`] = 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION';
  }
  return Object.freeze(vars);
}

function readJson(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length > 200000) throw new Error(`app-only ${name} unavailable`);
  return JSON.parse(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required');
    const result = process.env.APP_ONLY_RESULT, status = process.env.APP_ONLY_STATUS;
    if (result === 'success' && status === 'VERIFIED') {
      const values = appOnlyManifestEnvironment({ result, status, preparation: readJson('APP_ONLY_PREPARATION_JSON'),
        evidence: readJson('APP_ONLY_EVIDENCE_JSON'), smoke: readJson('APP_ONLY_SMOKE_JSON'), history: readJson('APP_ONLY_HISTORY_JSON'),
        releaseSha: process.env.RELEASE_SHA, previousSha: process.env.PREVIOUS_PRODUCTION_SHA,
        previousRunId: process.env.PREVIOUS_PRODUCTION_RUN_ID, ciRunId: process.env.CI_RUN_ID, adminProject: process.env.APP_ONLY_ADMIN_PROJECT });
      appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(''));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
