import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAppOnlyPriorRelease } from '../release/app-only-prior-release.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';

const previousSha = 'a'.repeat(40), sourceSha = 'b'.repeat(40);
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const page = (project, id) => ({ project, branch: 'main', projectId: ids[0], deploymentId: id, commitSha: sourceSha,
  deploymentUrl: `https://snapshot.${project}.pages.dev` });
function fixture() {
  const workers = Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], i) => [component,
    { workerName, versionId: ids[i], sourceSha, createdAt: '2026-10-28T12:00:00.000Z', percentage: 100 }]));
  const workerCapture = { schemaVersion: 1, startedAt: '2026-10-29T12:00:00.000Z', capturedAt: '2026-10-29T12:01:00.000Z', workers };
  const appPage = page('lythaus-web', ids[0]);
  const reusedPages = { marketing: page('lythaus-marketing', ids[1]), 'control-panel': page('lythaus-admin', ids[2]) };
  const priorWorker = component => ({ name: workers[component].workerName, versionId: workers[component].versionId,
    sourceSha: workers[component].sourceSha, status: 'REUSED_PRODUCTION' });
  const priorPage = value => ({ ...value, deployedSha: value.commitSha, status: 'ACTIVATED' });
  const manifest = { schemaVersion: 'lythaus-release-manifest-v2', releaseSha: previousSha, status: 'GO', productionStatus: 'GO', state: 'VERIFIED',
    repository: { releaseSha: previousSha }, surfaces: { web: priorPage(appPage), marketing: priorPage(reusedPages.marketing),
      admin: priorPage(reusedPages['control-panel']), workers: { publicApi: priorWorker('public'), adminApi: priorWorker('admin'),
        jobs: priorWorker('jobs'), acceptanceCoordinator: priorWorker('coordinator') } } };
  return { manifest, previousSha, workerCapture, appPage, reusedPages };
}

test('all reused live components match their prior verified canonical identities', () => {
  const input = fixture(), result = assertAppOnlyPriorRelease(input);
  assert.equal(result.workers.public.versionId, ids[0]);
  assert.equal(result.appPage.deploymentId, ids[0]);
});

test('a non-GO, mismatched or stale prior component cannot establish known-good reuse', () => {
  for (const mutate of [
    value => { value.manifest.productionStatus = 'NO-GO'; },
    value => { value.manifest.state = 'BLOCKED'; },
    value => { value.manifest.releaseSha = sourceSha; },
    value => { value.manifest.surfaces.workers.jobs.versionId = ids[0]; },
    value => { value.manifest.surfaces.workers.acceptanceCoordinator.sourceSha = previousSha; },
    value => { value.manifest.surfaces.admin.deploymentId = ids[0]; },
    value => { value.manifest.surfaces.web.deployedSha = previousSha; },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => assertAppOnlyPriorRelease(value));
  }
});
