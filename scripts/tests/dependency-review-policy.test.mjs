import assert from 'node:assert/strict';
import test from 'node:test';
import { dependencyGraphChanged, dependencyGraphMetadata, shouldRunLocalAudit } from '../ci/dependency-review-policy.mjs';

test('dependency review ignores package scripts and normalizes dependency ordering', () => {
  const before = { scripts: { test: 'node --test' }, dependencies: { astro: '7.1.6', zod: '4.0.0' } };
  const after = { scripts: { test: 'node --test tests/*.mjs' }, dependencies: { zod: '4.0.0', astro: '7.1.6' } };
  assert.equal(dependencyGraphChanged(before, after), false);
  assert.deepEqual(dependencyGraphMetadata(after).dependencies, { astro: '7.1.6', zod: '4.0.0' });
});

test('dependency review requires a lockfile for resolved dependency metadata changes', () => {
  const before = { dependencies: { astro: '7.1.6' }, overrides: { nanoid: '3.3.18' } };
  const after = { dependencies: { astro: '7.2.0' }, overrides: { nanoid: '3.3.18' } };
  assert.equal(dependencyGraphChanged(before, after), true);
});

test('local dependency review skips duplicate audits when the dependency graph is unchanged', () => {
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: [], changedNpmLocks: [] }), false);
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: ['package.json'], changedNpmLocks: [] }), true);
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: [], changedNpmLocks: ['package-lock.json'] }), true);
});
