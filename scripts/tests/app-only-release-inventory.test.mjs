import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRelease, RELEASE_COMPONENTS } from '../release/release-classification.mjs';
import { createAppOnlyReleaseInventory } from '../release/app-only-release-inventory.mjs';

const releaseSha = 'b'.repeat(40), baseSha = 'a'.repeat(40);
function sourcePlan() {
  const classification = classifyRelease({ changedFiles: ['lib/main.dart', 'apps/lythaus-public-api/src/index.ts'],
    baseSha, forceAuthCritical: true, rootPackageDependencyChanged: false });
  return { schemaVersion: 'lythaus-release-plan-v1', releaseSha, baseSha, ...classification };
}
function versions() {
  return Object.fromEntries(RELEASE_COMPONENTS.filter(component => component !== 'flutter-web')
    .map((component, index) => [component, { versionId: `known-good-${index}`, sourceSha: baseSha }]));
}

test('source classification remains visible while only the app is a deployment candidate', () => {
  const inventory = createAppOnlyReleaseInventory({ sourcePlan: sourcePlan(), knownGoodVersions: versions() });
  assert.equal(inventory.status, 'PROVISIONAL_NOT_RELEASE_AUTHORIZATION');
  assert.deepEqual(inventory.source.changedComponents, ['flutter-web', 'public']);
  assert.equal(inventory.source.rulesVersion, 'release-classification-v2');
  assert.ok(inventory.source.criticalReasons.some(reason => reason.rule === 'public-auth-runtime'));
  assert.deepEqual(inventory.sourceChangesNotDeployed, ['public']);
  assert.deepEqual(inventory.deployment.changedComponents, ['flutter-web']);
  assert.equal(inventory.deployment.components.public.status, 'REUSED_PRODUCTION');
  assert.equal(inventory.deployment.components.public.sourceSha, baseSha);
  assert.equal(inventory.deployment.components['flutter-web'].status, 'NEW_CANDIDATE');
});

test('source plans cannot hide changed components or downgrade authentication classification', () => {
  for (const mutate of [
    value => { value.changedComponents = ['flutter-web']; },
    value => { value.releaseClass = 'STANDARD_RELEASE'; },
    value => { value.rulesVersion = 'unknown'; },
    value => { value.forceAuthCritical = false; },
    value => { value.changedFiles = [...value.changedFiles, 'lib/main.dart']; },
    value => { value.baseSha = 'NONE'; },
    value => { value.reusedComponents = []; },
  ]) {
    const plan = structuredClone(sourcePlan()); mutate(plan);
    assert.throws(() => createAppOnlyReleaseInventory({ sourcePlan: plan, knownGoodVersions: versions() }), /source plan/);
  }
});

test('all reused components require exact version and source provenance', () => {
  const missing = versions(); delete missing.public;
  assert.throws(() => createAppOnlyReleaseInventory({ sourcePlan: sourcePlan(), knownGoodVersions: missing }), /known-good production version/);
  const invalid = versions(); invalid.jobs.sourceSha = 'main';
  assert.throws(() => createAppOnlyReleaseInventory({ sourcePlan: sourcePlan(), knownGoodVersions: invalid }), /source SHA is invalid/);
});
