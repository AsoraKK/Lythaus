import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeAppOnlyRelease } from '../release/app-only-finalize.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';
import { createAppPagesPriorReleaseBinding, validateAppPagesServingProof } from '../release/app-pages-serving-proof.mjs';

const releaseSha = 'a'.repeat(40), oldSha = 'b'.repeat(40), digest = `sha256:${'c'.repeat(64)}`;
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const page = (project, id, sha = oldSha, branch = 'main') => ({ project, branch,
  projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deploymentId: id, commitSha: sha,
  deploymentUrl: `https://${id.slice(0, 8)}.${project}.pages.dev` });
function fixture() {
  const workers = Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], i) => [component,
    { workerName, versionId: ids[i], sourceSha: oldSha, createdAt: '2026-10-28T12:00:00.000Z', percentage: 100 }]));
  const workerCapture = { schemaVersion: 1, startedAt: '2026-10-29T12:00:00.000Z', capturedAt: '2026-10-29T12:01:00.000Z', workers };
  const workerAfter = { ...structuredClone(workerCapture), startedAt: '2026-10-29T12:02:00.000Z', capturedAt: '2026-10-29T12:03:00.000Z' };
  const appPage = page('lythaus-web', ids[0], oldSha, 'production'), candidate = page('lythaus-web', ids[1], releaseSha, 'production');
  const reusedPages = { marketing: page('lythaus-marketing', ids[2]), 'control-panel': page('lythaus-admin', ids[3]) };
  const routeSnapshots = { adminApi: { route: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: REUSED_WORKER_NAMES.admin } },
    coordinator: { route: { id: 'keeper-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: REUSED_WORKER_NAMES.coordinator } } };
  const artifact = { artifactId: 123, ciRunId: '456', releaseSha, archiveDigest: digest };
  const priorManifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: oldSha, status: 'GO', productionStatus: 'GO', state: 'VERIFIED',
    capturedAt: '2026-10-29T12:00:00.000Z', repository: { releaseSha: oldSha },
    surfaces: { web: { ...appPage, deployedSha: oldSha, status: 'ACTIVATED' } } };
  const priorRelease = createAppPagesPriorReleaseBinding({ prior: { manifest: priorManifest, previousRunId: '789', artifactId: 321, archiveDigest: digest },
    previousSha: oldSha, previousRunId: '789', appPage });
  const proofNow = Date.parse('2026-10-29T12:04:00.000Z');
  const servingProof = validateAppPagesServingProof({ proof: { schemaVersion: 'lythaus-app-pages-serving-proof-v1',
    proofId: '55555555-5555-4555-8555-555555555555', source: 'cloudflare-dashboard-production-panel',
    sourceUrl: `https://dash.cloudflare.com/e5b7ae46e04698f507b7e4b3d4ef1af0/pages/view/lythaus-web/${appPage.deploymentId}`,
    observedAt: '2026-10-29T12:03:00.000Z', capturedBy: 'tester', accountId: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
    hostname: 'app.lythaus.co', project: appPage.project, projectId: appPage.projectId, branch: appPage.branch,
    deploymentId: appPage.deploymentId, deploymentUrl: appPage.deploymentUrl, commitSha: oldSha,
    environment: 'production', status: 'success', releaseSha, previousProductionSha: oldSha,
    previousProductionRunId: '789', previousManifestArtifactId: '321', previousManifestDigest: digest },
  snapshot: appPage, priorRelease, releaseSha, previousSha: oldSha, previousRunId: '789', actor: 'tester', now: proofNow });
  const browser = { status: 'PASSED', journey: 'LOGIN_REFRESH_LOGOUT', viewport: '390x1000', releaseSha, artifactId: 123, archiveDigest: digest,
    workerVersions: Object.fromEntries(Object.entries(workers).map(([component, worker]) => [component, worker.versionId])) };
  const preparation = { schemaVersion: 'lythaus-app-only-preparation-v1', releaseSha, artifact, appPage, reusedPages, routeSnapshots, workerCapture,
    previousProductionSha: oldSha, previousRunId: '789', priorManifestArtifactId: 321, priorManifestDigest: digest,
    priorRelease, servingProof,
    keeper: { status: 'completed', acceptanceRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: '2026-10-29T13:00:00.000Z', candidate: { sourceReleaseSha: oldSha } } };
  const deployment = { status: 'success', project: candidate.project, branch: candidate.branch, deployedSha: releaseSha,
    deploymentId: candidate.deploymentId, deploymentUrl: candidate.deploymentUrl };
  const smoke = async () => ({ marketing: 'PASS', www: 'PASS', flutter_web: 'PASS', public_api: 'PASS', admin_api: 'PASS', admin_ui: 'PASS',
    jobs: 'PASS', jobsEvidence: 'CAPTURED_VERSION_NO_PUBLIC_HEALTH_ROUTE' });
  return { preparation, browser, deployment, candidate, workerAfter, reusedPages, routeSnapshots, smoke };
}
function call(fixture, overrides = {}) {
  return finalizeAppOnlyRelease({ ...fixture, adminProject: 'lythaus-admin', readApp: async () => fixture.candidate,
    readWorkers: async () => fixture.workerAfter, readRoutes: async () => fixture.routeSnapshots,
    readReusedPages: async () => fixture.reusedPages, verifyKeeper: async () => fixture.preparation.keeper,
    now: () => Date.parse('2026-10-29T12:04:00.000Z'), smoke: fixture.smoke, restore: async () => {}, delay: async () => {}, ...overrides });
}

test('a bound deployment succeeds only after smoke and unchanged production evidence', async () => {
  const value = fixture(), result = await call(value);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.evidence.appCandidate.deploymentId, value.candidate.deploymentId);
  assert.equal(result.rollback.status, 'READY');
});

test('failed smoke restores only the exact captured app baseline once and requires readback', async () => {
  const value = fixture(); let current = value.candidate, restores = 0;
  const result = await call(value, { readApp: async () => current, smoke: async () => { throw new Error('synthetic failure'); },
    restore: async input => { restores++; assert.deepEqual(input, { before: value.preparation.appPage, candidate: value.candidate }); current = value.preparation.appPage; } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.rollback.status, 'ROLLED_BACK_PROVIDER_READBACK');
  assert.equal(restores, 1);
});

test('an unbound or uncertain deployment is never overwritten', async () => {
  const value = fixture(); let restores = 0;
  await assert.rejects(() => call(value, { deployment: { status: 'failure' }, restore: async () => { restores++; } }), /outcome is uncertain/);
  await assert.rejects(() => call(value, { deployment: { ...value.deployment, deploymentId: ids[2] }, restore: async () => { restores++; } }), /candidate is unbound/);
  assert.equal(restores, 0);
  await assert.rejects(() => call(value, { deployment: { status: 'failure' }, readApp: async () => value.preparation.appPage }), /outcome is uncertain/);
});

test('post-verification drift does not roll back an unrelated current deployment', async () => {
  const value = fixture(); let calls = 0, restores = 0;
  const unrelated = page('lythaus-web', ids[2], releaseSha, 'production');
  await assert.rejects(() => call(value, { readApp: async () => ++calls === 1 ? value.candidate : unrelated,
    smoke: async () => { throw new Error('synthetic failure'); }, restore: async () => { restores++; } }), /rollback is unverified/);
  assert.equal(restores, 0);
});

test('an acceptance run that expires during activation causes scoped rollback', async () => {
  const value = fixture(); let current = value.candidate, restores = 0;
  const result = await call(value, { readApp: async () => current, now: () => Date.parse('2026-10-29T13:01:00.000Z'),
    restore: async () => { restores++; current = value.preparation.appPage; } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.rollback.status, 'ROLLED_BACK_PROVIDER_READBACK');
  assert.equal(restores, 1);
});
