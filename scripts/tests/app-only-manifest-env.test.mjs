import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appOnlyManifestEnvironment } from '../ci/prepare-app-only-manifest-env.mjs';
import { prepareAppOnlyKeeperRun } from '../ci/app-only-keeper.mjs';
import { resolveAppOnlyFailureDomain } from '../ci/resolve-app-only-failure-domain.mjs';
import { createAppOnlyAcceptanceContext } from '../release/app-only-acceptance.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';
import { transitionReleaseState } from '../ci/transition-release-state.mjs';
import { classifyRelease } from '../release/release-classification.mjs';
import { createAppPagesPriorReleaseBinding, validateAppPagesServingProof } from '../release/app-pages-serving-proof.mjs';

const releaseSha = 'a'.repeat(40), previousSha = 'b'.repeat(40), digest = `sha256:${'c'.repeat(64)}`;
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const page = (project, id, sha = previousSha, branch = 'main') => ({ project, branch,
  projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deploymentId: id, commitSha: sha,
  deploymentUrl: `https://${id.slice(0, 8)}.${project}.pages.dev` });
function fixture() {
  const workers = Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], i) => [component,
    { workerName, versionId: ids[i], sourceSha: previousSha, createdAt: '2026-10-28T12:00:00.000Z', percentage: 100 }]));
  const workerCapture = { schemaVersion: 1, startedAt: '2026-10-29T12:00:00.000Z', capturedAt: '2026-10-29T12:01:00.000Z', workers };
  const workerAfter = { ...structuredClone(workerCapture), startedAt: '2026-10-29T12:02:00.000Z', capturedAt: '2026-10-29T12:03:00.000Z' };
  const routeSnapshots = { adminApi: { route: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: REUSED_WORKER_NAMES.admin } },
    coordinator: { route: { id: 'keeper-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: REUSED_WORKER_NAMES.coordinator } } };
  const now = Date.parse('2026-10-29T12:04:00.000Z');
  const context = createAppOnlyAcceptanceContext({ releaseSha, capture: workerCapture, routeSnapshots, now });
  const keeper = { acceptanceRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'completed', expiresAt: '2026-10-29T13:00:00.000Z',
    candidate: structuredClone(context.candidate), dependencies: structuredClone(context.dependencies), rollbackSnapshot: structuredClone(context.rollbackSnapshot), releaseSha };
  const appPage = page('lythaus-web', ids[0], previousSha, 'production'), appCandidate = page('lythaus-web', ids[1], releaseSha, 'production');
  const reusedPages = { marketing: page('lythaus-marketing', ids[2]), 'control-panel': page('lythaus-admin', ids[3]) };
  const artifact = { artifactId: 123, ciRunId: '456', releaseSha, archiveDigest: digest };
  const priorManifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: previousSha, status: 'GO', productionStatus: 'GO', state: 'VERIFIED',
    capturedAt: '2026-10-29T12:00:00.000Z', repository: { releaseSha: previousSha },
    surfaces: { web: { ...appPage, deployedSha: previousSha, status: 'ACTIVATED' } } };
  const priorRelease = createAppPagesPriorReleaseBinding({ prior: { manifest: priorManifest, previousRunId: '789', artifactId: 321, archiveDigest: digest },
    previousSha, previousRunId: '789', appPage });
  const servingProof = validateAppPagesServingProof({ proof: { schemaVersion: 'lythaus-app-pages-serving-proof-v1',
    proofId: '55555555-5555-4555-8555-555555555555', source: 'cloudflare-dashboard-production-panel',
    sourceUrl: `https://dash.cloudflare.com/e5b7ae46e04698f507b7e4b3d4ef1af0/pages/view/lythaus-web/${appPage.deploymentId}`,
    observedAt: '2026-10-29T12:03:00.000Z', capturedBy: 'tester', accountId: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
    hostname: 'app.lythaus.co', project: appPage.project, projectId: appPage.projectId, branch: appPage.branch,
    deploymentId: appPage.deploymentId, deploymentUrl: appPage.deploymentUrl, commitSha: previousSha,
    environment: 'production', status: 'success', releaseSha, previousProductionSha: previousSha,
    previousProductionRunId: '789', previousManifestArtifactId: '321', previousManifestDigest: digest },
  snapshot: appPage, priorRelease, releaseSha, previousSha, previousRunId: '789', actor: 'tester', now });
  const browser = { status: 'PASSED', journey: 'LOGIN_REFRESH_LOGOUT', viewport: '390x1000', releaseSha, artifactId: 123, archiveDigest: digest,
    workerVersions: Object.fromEntries(Object.entries(workers).map(([component, worker]) => [component, worker.versionId])) };
  const preparation = { schemaVersion: 'lythaus-app-only-preparation-v1', releaseSha, previousProductionSha: previousSha, previousRunId: '789',
    priorManifestArtifactId: 321, priorManifestDigest: digest, artifact, appPage, reusedPages, routeSnapshots, workerCapture, context, keeper,
    priorRelease, servingProof };
  const evidence = { schemaVersion: 'lythaus-app-only-release-evidence-v1', artifact, priorRelease, servingProof, browser,
    prior: { previousSha, previousRunId: '789', artifactId: 321, archiveDigest: digest }, workerBefore: workerCapture, workerAfter,
    routeBefore: routeSnapshots, routeAfter: structuredClone(routeSnapshots), appBefore: appPage, appCandidate, appCurrent: structuredClone(appCandidate),
    reusedBefore: reusedPages, reusedAfter: structuredClone(reusedPages), keeperVerifiedAt: '2026-10-29T12:04:00.000Z' };
  const smoke = { marketing: 'PASS', www: 'PASS', flutter_web: 'PASS', public_api: 'PASS', admin_api: 'PASS', admin_ui: 'PASS',
    jobs: 'PASS', jobsEvidence: 'CAPTURED_VERSION_NO_PUBLIC_HEALTH_ROUTE' };
  let history = [];
  for (const state of ['PREFLIGHT', 'INFRASTRUCTURE_VERIFIED', 'CANDIDATE_READY', 'PRODUCT_ACCEPTANCE_REQUIRED',
    'PRODUCT_ACCEPTANCE_PASSED', 'ACTIVATED', 'VERIFIED']) history = transitionReleaseState(history, state, '2026-10-29T12:03:30.000Z');
  return { result: 'success', status: 'VERIFIED', preparation, evidence, smoke, history, releaseSha, previousSha,
    previousRunId: '789', ciRunId: '456', adminProject: 'lythaus-admin', now };
}

test('validated app-only transaction records the new app and exact reused versions', () => {
  const values = appOnlyManifestEnvironment(fixture());
  assert.equal(values.WEB_DEPLOYMENT_STATUS, 'ACTIVATED');
  assert.equal(values.PUBLIC_API_WORKER_VERSION, ids[0]);
  assert.equal(values.PUBLIC_API_WORKER_STATUS, 'REUSED_PRODUCTION');
  assert.equal(values.AUTH_ACCEPTANCE_STATUS, 'PASSED');
  assert.equal(values.ROLLBACK_COMPONENTS_JSON, '["flutter-web"]');
});

test('a real Keeper adapter result can be consumed by the manifest binding without invented fields', async () => {
  const value = fixture();
  const existing = value.preparation.keeper;
  const summary = { ...existing, candidateDependencies: existing.dependencies };
  delete summary.dependencies;
  value.preparation.keeper = await prepareAppOnlyKeeperRun({ context: value.preparation.context,
    acceptanceRunId: existing.acceptanceRunId, readinessToken: 'synthetic', accessClientId: 'synthetic', accessClientSecret: 'synthetic',
    now: value.now, fetchImpl: async () => ({ status: 200, redirected: false, json: async () => summary }) });
  assert.equal(appOnlyManifestEnvironment(value).AUTH_ACCEPTANCE_STATUS, 'PASSED');
});

test('no failed or mismatched transaction can generate affirmative manifest values', () => {
  assert.deepEqual(appOnlyManifestEnvironment({ result: 'failure', status: 'VERIFIED' }), {});
  for (const mutate of [
    value => { value.preparation.keeper.status = 'pending'; },
    value => { value.evidence.browser.artifactId = 999; },
    value => { value.preparation.priorManifestDigest = `sha256:${'f'.repeat(64)}`; },
    value => { value.smoke.jobs = 'PASS'; value.smoke.jobsEvidence = 'not_checked'; },
    value => { value.history = []; },
  ]) { const value = fixture(); mutate(value); assert.throws(() => appOnlyManifestEnvironment(value)); }
});

test('app-only failures are recorded instead of silently treating skipped ordinary jobs as success', () => {
  assert.deepEqual(resolveAppOnlyFailureDomain({ preflightResult: 'success', providerResult: 'success', transactionResult: 'success', transactionStatus: 'VERIFIED' }), []);
  for (const value of [
    { preflightResult: 'failure', providerResult: 'skipped' },
    { preflightResult: 'success', providerResult: 'failure' },
    { preflightResult: 'success', providerResult: 'success', transactionResult: 'failure' },
    { preflightResult: 'success', providerResult: 'success', transactionResult: 'success', transactionStatus: 'BLOCKED' },
  ]) assert.equal(resolveAppOnlyFailureDomain(value).length, 1);
});

test('app-only transaction remains full-release NO-GO without fresh database recovery and retains source changes', t => {
  const value = fixture(), values = appOnlyManifestEnvironment(value);
  const classification = classifyRelease({ changedFiles: ['lib/main.dart', 'apps/lythaus-public-api/src/index.ts'],
    baseSha: previousSha, forceAuthCritical: true });
  const directory = mkdtempSync(path.join(tmpdir(), 'app-only-manifest-integration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'manifest.json');
  const env = { ...process.env, ...values, RELEASE_SHA: releaseSha, PREVIOUS_PRODUCTION_SHA: previousSha,
    PREVIOUS_PRODUCTION_RUN_ID: '789', CI_RUN_ID: '456', APP_ONLY_RELEASE: 'true', RELEASE_CLASS: classification.releaseClass,
    FORCE_AUTH_CRITICAL: 'true', CHANGED_FILES_JSON: JSON.stringify(classification.changedFiles),
    CHANGED_COMPONENTS_JSON: JSON.stringify(classification.changedComponents), REUSED_COMPONENTS_JSON: JSON.stringify(classification.reusedComponents),
    RELEASE_GOVERNANCE_COMPENSATING_CONTROLS: 'VERIFIED', CANDIDATE_MERGED_PR_VERIFIED: 'true',
    UNRESOLVED_REVIEW_CONVERSATIONS_VERIFIED: 'true', LINEAR_HISTORY_VERIFIED: 'true', PREVIOUS_RELEASE_ANCESTRY_VERIFIED: 'true',
    HISTORICAL_BRANCHES_RECONCILED: 'true', SECURITY_CHECKS_VERIFIED: 'true', CLOUDFLARE_INVENTORY_STATUS: 'VERIFIED',
    CLOUDFLARE_PAGES_INVENTORY_VERIFIED: 'true', CLOUDFLARE_LEGACY_BRAND_ACTIVE_RESOURCES: '0', PLANETSCALE_INVENTORY_STATUS: 'VERIFIED',
    PLANETSCALE_SCHEMA_FINGERPRINT: 'd'.repeat(64), PLANETSCALE_RELATION_COUNT: '123', PLANETSCALE_SERVER_VERSION: '17.6',
    PLANETSCALE_MIGRATION_SET_SHA256: 'e'.repeat(64), PLANETSCALE_GRANTS_VERIFIED: 'true',
    PROVIDER_EVIDENCE_RUN_URL: 'https://github.com/AsoraKK/Lythaus/actions/runs/1234',
    INDEPENDENT_RECOVERY_STATUS: 'BLOCKED', RECOVERY_READINESS_STATUS: 'BLOCKED', CREDENTIAL_ROTATION_COMPLETED: 'true',
    RELEASE_STATE: 'VERIFIED', RELEASE_STATE_HISTORY_JSON: JSON.stringify(value.history), FAILURE_DOMAIN_EVIDENCE_JSON: '[]',
    LYTHAUS_TEST_ALLOW_WORKTREE_MIGRATIONS: 'true', CI: 'false' };
  const build = () => {
    execFileSync(process.execPath, ['scripts/ci/build-release-manifest.mjs', '--output', output], { env, stdio: 'pipe' });
    return JSON.parse(readFileSync(output, 'utf8'));
  };
  const manifest = build();
  assert.equal(manifest.state, 'VERIFIED', 'the scoped app transaction itself completed');
  assert.equal(manifest.productionStatus, 'NO-GO', 'app-only evidence does not certify the full-stack release');
  assert.equal(manifest.deployment.pagesServingProof.proofDigest, value.preparation.servingProof.proofDigest);
  assert.equal(manifest.deployment.pagesServingProof.deploymentId, value.preparation.appPage.deploymentId);
  assert.equal(manifest.recovery.readinessStatus, 'BLOCKED');
  assert.equal(manifest.recovery.independentRecoveryStatus, 'BLOCKED');
  assert.deepEqual(manifest.recovery.publicReleaseBlockers, ['independent_recovery_destination']);
  assert.deepEqual(manifest.changedComponents, classification.changedComponents);
  assert.deepEqual(manifest.deployment.changedComponents, ['flutter-web']);
  assert.ok(manifest.deployment.sourceChangesNotDeployed.includes('public'));
  assert.equal(manifest.components.public.versionId, ids[0]);
  assert.equal(manifest.components.public.status, 'REUSED_PRODUCTION');
  const changed = JSON.parse(env.APP_ONLY_EVIDENCE_JSON); changed.workerAfter.workers.jobs.sourceSha = releaseSha;
  env.APP_ONLY_EVIDENCE_JSON = JSON.stringify(changed);
  assert.ok(build().evidence.unknowns.includes('App-only artifact, real-browser or unchanged production component evidence is unavailable or mismatched'));
});
