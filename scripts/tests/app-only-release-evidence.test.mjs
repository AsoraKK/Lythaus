import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAppOnlyReleaseEvidence } from '../release/app-only-release-evidence.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';
import { createAppPagesPriorReleaseBinding, validateAppPagesServingProof } from '../release/app-pages-serving-proof.mjs';

const releaseSha = 'a'.repeat(40), oldSha = 'b'.repeat(40), digest = `sha256:${'c'.repeat(64)}`;
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const page = (project, id, sha = oldSha, branch = 'main') => ({ project, branch,
  projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deploymentId: id, commitSha: sha,
  deploymentUrl: `https://snapshot.${project}.pages.dev` });
function fixture() {
  const workers = Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], i) => [component,
    { workerName, versionId: ids[i], sourceSha: oldSha, createdAt: '2026-10-28T12:00:00.000Z', percentage: 100 }]));
  const workerBefore = { schemaVersion: 1, startedAt: '2026-10-29T12:00:00.000Z', capturedAt: '2026-10-29T12:01:00.000Z', workers };
  const workerAfter = { ...structuredClone(workerBefore), startedAt: '2026-10-29T12:02:00.000Z', capturedAt: '2026-10-29T12:03:00.000Z' };
  const appBefore = page('lythaus-web', ids[0], oldSha, 'production');
  const priorManifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: oldSha, status: 'GO', productionStatus: 'GO', state: 'VERIFIED',
    capturedAt: '2026-10-29T12:00:00.000Z', repository: { releaseSha: oldSha },
    surfaces: { web: { ...appBefore, deployedSha: oldSha, status: 'ACTIVATED' } } };
  const priorRelease = createAppPagesPriorReleaseBinding({ prior: { manifest: priorManifest, previousRunId: '789', artifactId: 321, archiveDigest: digest },
    previousSha: oldSha, previousRunId: '789', appPage: appBefore });
  const proofNow = Date.parse('2026-10-29T12:04:00.000Z');
  const servingProof = validateAppPagesServingProof({ proof: { schemaVersion: 'lythaus-app-pages-serving-proof-v1',
    proofId: '55555555-5555-4555-8555-555555555555', source: 'cloudflare-dashboard-production-panel',
    sourceUrl: `https://dash.cloudflare.com/e5b7ae46e04698f507b7e4b3d4ef1af0/pages/view/lythaus-web/${appBefore.deploymentId}`,
    observedAt: '2026-10-29T12:03:00.000Z', capturedBy: 'tester', accountId: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
    hostname: 'app.lythaus.co', project: appBefore.project, projectId: appBefore.projectId, branch: appBefore.branch,
    deploymentId: appBefore.deploymentId, deploymentUrl: appBefore.deploymentUrl, commitSha: oldSha,
    environment: 'production', status: 'success', releaseSha, previousProductionSha: oldSha,
    previousProductionRunId: '789', previousManifestArtifactId: '321', previousManifestDigest: digest },
  snapshot: appBefore, priorRelease, releaseSha, previousSha: oldSha, previousRunId: '789', actor: 'tester', now: proofNow });
  const appCandidate = { ...page('lythaus-web', ids[1], releaseSha, 'production'), deploymentUrl: 'https://candidate.lythaus-web.pages.dev' };
  const reusedBefore = { marketing: page('lythaus-marketing', ids[2]), 'control-panel': page('lythaus-admin', ids[3]) };
  const artifact = { artifactId: 123, ciRunId: '456', releaseSha, archiveDigest: digest };
  const prior = { previousSha: oldSha, previousRunId: '789', artifactId: 321, archiveDigest: digest };
  const routeBefore = { adminApi: { route: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: REUSED_WORKER_NAMES.admin } },
    coordinator: { route: { id: 'keeper-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: REUSED_WORKER_NAMES.coordinator } } };
  const browser = { status: 'PASSED', journey: 'LOGIN_REFRESH_LOGOUT', viewport: '390x1000', releaseSha, artifactId: 123, archiveDigest: digest,
    workerVersions: Object.fromEntries(Object.entries(workers).map(([component, worker]) => [component, worker.versionId])) };
  return { schemaVersion: 'lythaus-app-only-release-evidence-v1', artifact, prior, priorRelease, servingProof, browser, workerBefore, workerAfter, routeBefore, routeAfter: structuredClone(routeBefore),
    appBefore, appCandidate, appCurrent: structuredClone(appCandidate), reusedBefore, reusedAfter: structuredClone(reusedBefore),
    keeperVerifiedAt: '2026-10-29T12:04:00.000Z' };
}
const verify = evidence => verifyAppOnlyReleaseEvidence({ evidence, releaseSha, ciRunId: '456', previousSha: oldSha, previousRunId: '789', adminProject: 'lythaus-admin' });

test('exact artifact, live browser, unchanged reused components and bound app candidate form the deployment evidence', () => {
  const evidence = fixture(), result = verify(evidence);
  assert.equal(result.artifact.artifactId, 123);
  assert.equal(result.workers.public.versionId, ids[0]);
  assert.deepEqual(result.reusedPages, evidence.reusedBefore);
});

test('mismatched artifacts, browsers, serving Workers, Pages or reused components cannot certify release', () => {
  for (const mutate of [
    value => { value.artifact.releaseSha = oldSha; },
    value => { value.artifact.archiveDigest = `sha256:${'d'.repeat(64)}`; },
    value => { value.prior.previousRunId = '999'; },
    value => { value.keeperVerifiedAt = '2026-10-29T12:02:00.000Z'; },
    value => { value.browser.status = 'SKIPPED'; },
    value => { value.browser.workerVersions.jobs = ids[0]; },
    value => { value.workerAfter.workers.admin.versionId = ids[0]; },
    value => { value.routeAfter.coordinator.route.id = 'different-route'; },
    value => { value.appCurrent.deploymentId = ids[2]; },
    value => { value.reusedAfter.marketing.commitSha = releaseSha; },
    value => { value.reusedAfter['control-panel'].deploymentUrl = 'https://example.com/'; value.reusedBefore['control-panel'].deploymentUrl = 'https://example.com/'; },
    value => { delete value.reusedBefore.marketing; },
  ]) {
    const evidence = fixture(); mutate(evidence);
    assert.throws(() => verify(evidence));
  }
});
