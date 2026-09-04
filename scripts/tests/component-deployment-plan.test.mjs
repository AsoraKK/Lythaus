import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPONENT_DISPOSITIONS,
  componentDisposition,
  createComponentDeploymentPlan,
  markActivated,
  rollbackComponents,
} from '../release/component-deployment-plan.mjs';

const sha = '2'.repeat(40);
const id = (digit) => `${digit}`.repeat(8) + '-1111-4111-8111-' + `${digit}`.repeat(12);
const allKnownGood = Object.fromEntries(['public', 'admin', 'jobs', 'coordinator', 'marketing', 'flutter-web', 'control-panel'].map((component, index) => [component, { versionId: id(index + 1), sourceSha: '3'.repeat(40) }]));

test('only changed components receive new candidates and exact release provenance', () => {
  const plan = createComponentDeploymentPlan({ releaseSha: sha, changedComponents: ['public'], knownGoodVersions: allKnownGood });
  assert.equal(plan.components.public.status, COMPONENT_DISPOSITIONS.NEW_CANDIDATE);
  assert.equal(plan.components.public.provenance, 'BUILT_FROM_RELEASE_SHA');
  assert.equal(plan.components.public.sourceSha, sha);
  assert.equal(plan.components.jobs.status, COMPONENT_DISPOSITIONS.REUSED_PRODUCTION);
  assert.equal(plan.components.jobs.versionId, allKnownGood.jobs.versionId);
  assert.equal(plan.components.jobs.provenance, 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION');
  assert.deepEqual(rollbackComponents(plan), ['public']);
});

test('public-only, jobs-only, admin-only, and coordinator-only plans are isolated', () => {
  for (const component of ['public', 'jobs', 'admin', 'coordinator']) {
    const plan = createComponentDeploymentPlan({ releaseSha: sha, changedComponents: [component], knownGoodVersions: allKnownGood });
    assert.deepEqual(plan.changedComponents, [component]);
    assert.deepEqual(rollbackComponents(plan), [component]);
    assert.equal(Object.values(plan.components).filter(({ status }) => status === COMPONENT_DISPOSITIONS.NEW_CANDIDATE).length, 1);
  }
});

test('reused components require a known-good production version and cannot overlap candidates', () => {
  assert.throws(
    () => createComponentDeploymentPlan({ releaseSha: sha, changedComponents: ['public'], knownGoodVersions: {} }),
    /known-good production version is required for reused component admin/,
  );
  assert.throws(
    () => createComponentDeploymentPlan({ releaseSha: sha, changedComponents: ['public'], reusedComponents: ['public'], knownGoodVersions: allKnownGood }),
    /partition release components/,
  );
  assert.throws(
    () => createComponentDeploymentPlan({
      releaseSha: sha,
      changedComponents: ['public'],
      knownGoodVersions: { ...allKnownGood, admin: { versionId: 'not a safe version id', sourceSha: '3'.repeat(40) } },
    }),
    /known-good production version is required for reused component admin/,
  );
  assert.throws(
    () => createComponentDeploymentPlan({
      releaseSha: sha,
      changedComponents: ['public'],
      knownGoodVersions: { ...allKnownGood, admin: { versionId: allKnownGood.admin.versionId } },
    }),
    /known-good production source SHA is invalid for reused component admin/,
  );
});

test('component disposition is the single changed-versus-reused partition', () => {
  assert.deepEqual(componentDisposition(['public', 'jobs']), {
    public: 'NEW_CANDIDATE',
    admin: 'REUSED_PRODUCTION',
    jobs: 'NEW_CANDIDATE',
    coordinator: 'REUSED_PRODUCTION',
    marketing: 'REUSED_PRODUCTION',
    'flutter-web': 'REUSED_PRODUCTION',
    'control-panel': 'REUSED_PRODUCTION',
  });
});

test('activation status changes only the components actually activated', () => {
  const plan = createComponentDeploymentPlan({ releaseSha: sha, changedComponents: ['public', 'jobs'], knownGoodVersions: allKnownGood });
  const activated = markActivated(plan, ['public']);
  assert.equal(activated.components.public.status, COMPONENT_DISPOSITIONS.ACTIVATED);
  assert.equal(activated.components.jobs.status, COMPONENT_DISPOSITIONS.NEW_CANDIDATE);
  assert.equal(activated.components.admin.status, COMPONENT_DISPOSITIONS.REUSED_PRODUCTION);
  assert.throws(() => markActivated(plan, ['admin']), /cannot activate unchanged component admin/);
});

test('zero-traffic candidates are valid production state while rollback uses positive serving versions', async () => {
  const { parseProductionDeploymentState } = await import('../ci/resolve-production-version-state.mjs');
  const releaseSha = '4'.repeat(40);
  const servingId = id(4);
  const candidateId = id(5);
  const state = parseProductionDeploymentState({ versions: [
    { version_id: servingId, percentage: 100 },
    { version_id: candidateId, percentage: 0 },
  ] }, [
    { id: servingId, annotations: { 'workers/tag': '3'.repeat(40) }, metadata: { created_on: '2026-09-02T23:59:59Z' } },
    { id: candidateId, annotations: { 'workers/tag': releaseSha }, metadata: { created_on: '2026-09-03T00:00:00Z' } },
  ]);
  assert.deepEqual(state.reusedVersionIds, [servingId]);
  assert.deepEqual(state.zeroTraffic.map(({ versionId }) => versionId), [candidateId]);
  assert.equal(state.rollbackSpecs, `${servingId}@100`);
  assert.deepEqual(state.versions.map(({ sourceSha }) => sourceSha), ['3'.repeat(40), releaseSha]);
  assert.deepEqual(state.versions.map(({ createdAt }) => createdAt), ['2026-09-02T23:59:59.000Z', '2026-09-03T00:00:00.000Z']);
});

test('reuse provenance validates every positive serving version in a split deployment', async () => {
  const { parseProductionDeploymentState } = await import('../ci/resolve-production-version-state.mjs');
  const state = parseProductionDeploymentState({ versions: [
    { version_id: id(6), percentage: 80 },
    { version_id: id(7), percentage: 20 },
    { version_id: id(8), percentage: 0 },
  ] }, [
    { id: id(6), annotations: { 'workers/tag': '5'.repeat(40) }, metadata: { created_on: '2026-09-01T00:00:00Z' } },
    { id: id(7), annotations: { 'workers/tag': '6'.repeat(40) }, metadata: { created_on: '2026-09-02T00:00:00Z' } },
    { id: id(8), annotations: { 'workers/tag': '7'.repeat(40) }, metadata: { created_on: '2026-09-03T00:00:00Z' } },
  ]);
  assert.deepEqual(state.reusedVersionIds, [id(6), id(7)]);
  assert.deepEqual(state.reusedSourceShas, ['5'.repeat(40), '6'.repeat(40)]);
  assert.deepEqual(state.reusedCreatedAts, ['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z']);
  assert.equal(state.rollbackSpecs, `${id(6)}@80 ${id(7)}@20`);
});
