import assert from 'node:assert/strict';
import test from 'node:test';
import { dependencyGraphChanged, dependencyGraphMetadata, shouldRunLocalAudit } from '../ci/dependency-review-policy.mjs';
import { comparison, apiFailure, resolvedDependencies, missingCoverage, npmManifestLock } from '../ci/dependency-review-native.mjs';
import fs from 'node:fs';

test('native comparison requires distinct exact commits and classifies actual API errors', () => {
  assert.deepEqual(comparison('a'.repeat(40), 'b'.repeat(40)), { baseSha: 'a'.repeat(40), reviewedHeadSha: 'b'.repeat(40) });
  for (const pair of [['main', 'HEAD'], ['a'.repeat(40), 'a'.repeat(40)], ['0'.repeat(40), 'b'.repeat(40)]]) assert.throws(() => comparison(...pair));
  assert.equal(apiFailure(503), 'TRANSIENT_API_FAILURE');
  assert.equal(apiFailure(403, 'Resource not accessible by integration'), 'TOKEN_PERMISSION_DENIED');
  assert.equal(apiFailure(403, 'Dependency graph is not enabled'), 'CONFIGURATION_DISABLED');
  assert.equal(apiFailure(403), 'API_FAILURE_UNCLASSIFIED');
  assert.equal(apiFailure(404), 'REF_OR_REPOSITORY_NOT_ACCESSIBLE');
});

test('coverage includes direct and transitive Dart, runtime Node and every pinned Python wheel', () => {
  const dart = resolvedDependencies('pubspec.lock', fs.readFileSync('pubspec.lock', 'utf8'));
  assert.equal(dart.find(value => value.name === 'file_selector').relationship, 'direct');
  assert.equal(dart.find(value => value.name === 'file_selector_web').relationship, 'transitive');
  const python = resolvedDependencies('requirements.txt', fs.readFileSync('apps/lythaus-authenticity-runtime/container/requirements.txt', 'utf8'));
  assert.equal(python.length, 19);
  assert.equal(python.find(value => value.name === 'torch').version, '2.14.0+cpu');
  assert.equal(resolvedDependencies('package-lock.json', fs.readFileSync('apps/lythaus-authenticity-runtime/package-lock.json', 'utf8')).length, 2);
  const expected = dart.filter(value => value.name.startsWith('file_selector')).map(value => ({ ...value, manifest: 'pubspec.lock' }));
  const native = expected.map(value => ({ ...value, ecosystem: 'PUB', change_type: 'added' }));
  assert.deepEqual(missingCoverage(expected, native), []);
  assert.equal(missingCoverage(expected, native.slice(1)).length, 1);
  assert.equal(missingCoverage(expected, native.map(value => ({ ...value, manifest: 'pubspec.yaml' }))).length, 8);
  assert.throws(() => resolvedDependencies('requirements.txt', 'torch>=2'));
});

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

test('workspace manifests use the root lock only when membership and locked dependency metadata match', () => {
  const file = 'packages/security/package.json';
  const manifest = { name: '@lythaus/security', version: '0.1.0', dependencies: { example: '1.0.0' } };
  const root = { workspaces: ['packages/security'] };
  const lock = { packages: { 'packages/security': structuredClone(manifest) } };
  assert.equal(npmManifestLock(file, manifest, root, lock), 'package-lock.json');
  assert.equal(npmManifestLock(file, manifest, {}, lock), 'packages/security/package-lock.json');
  assert.equal(npmManifestLock('apps/standalone/package.json', manifest, root, lock), 'apps/standalone/package-lock.json');
  for (const broken of [
    { packages: {} },
    { packages: { 'packages/security': { ...manifest, name: 'another-package' } } },
    { packages: { 'packages/security': { ...manifest, version: '0.2.0' } } },
    { packages: { 'packages/security': { ...manifest, dependencies: { example: '2.0.0' } } } },
    { packages: { 'packages/security': { ...manifest, optionalDependencies: { unreviewed: '1.0.0' } } } },
  ]) assert.throws(() => npmManifestLock(file, manifest, root, broken), /WORKSPACE_MANIFEST_LOCK_MISMATCH/);
});

test('local dependency review skips duplicate audits when the dependency graph is unchanged', () => {
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: [], changedNpmLocks: [] }), false);
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: ['package.json'], changedNpmLocks: [] }), true);
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: [], changedNpmLocks: ['package-lock.json'] }), true);
});
