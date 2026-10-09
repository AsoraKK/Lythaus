import assert from 'node:assert/strict';
import test from 'node:test';
import { dependencyGraphChanged, dependencyGraphMetadata, shouldRunLocalAudit } from '../ci/dependency-review-policy.mjs';
import { comparison, apiFailure, resolvedDependencies, missingCoverage, expectedChanges } from '../ci/dependency-review-native.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';

function withLocalSdkFixture(run) {
  const original = process.cwd();
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-local-sdk-policy-'));
  const root = { name: 'synthetic_app', dependencies: { lythaus_api_client: { path: 'build/api_client' } } };
  const source = { name: 'lythaus_api_client', version: '1.0.0', dependencies: { dio: '^5.2.0' } };
  const local = { dependency: 'direct main', description: { path: 'build/api_client', relative: true }, source: 'path', version: '1.0.0' };
  const lock = { packages: { lythaus_api_client: local, dio: { dependency: 'transitive', source: 'hosted', version: '5.2.0' } } };
  const write = (file, content) => {
    fs.mkdirSync(join(directory, file, '..'), { recursive: true });
    fs.writeFileSync(join(directory, file), typeof content === 'string' ? content : stringify(content));
  };
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = message => { git('add', '.'); git('-c', 'user.name=Synthetic policy fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  write('pubspec.yaml', root);
  write('lib/generated/api_client/pubspec.yaml', source);
  write('pubspec.lock', lock);
  try {
    process.chdir(directory);
    return run({ directory, root, source, local, lock, write, git, commit });
  } finally {
    process.chdir(original);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

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

test('canonical generated Dart package is explicit and still requires native coverage', () => withLocalSdkFixture(({ lock, source, write }) => {
  const expected = resolvedDependencies('pubspec.lock', stringify(lock)).map(value => ({ ...value, manifest: 'pubspec.lock' }));
  assert.deepEqual(expected[0], { ecosystem: 'pub', name: 'lythaus_api_client', version: '1.0.0', relationship: 'direct', source: 'path', localPath: 'build/api_client', canonicalManifest: 'lib/generated/api_client/pubspec.yaml', manifest: 'pubspec.lock' });
  const native = expected.map(value => ({ ...value, ecosystem: 'PUB', change_type: 'added' }));
  assert.deepEqual(missingCoverage(expected, native), []);
  assert.deepEqual(missingCoverage(expected, native.slice(1)).map(value => value.name), ['lythaus_api_client']);
  assert.deepEqual(missingCoverage(expected, native.slice(0, 1)).map(value => value.name), ['dio']);
  assert.equal(missingCoverage(expected, native.map(value => ({ ...value, manifest: 'pubspec.yaml' }))).length, 2);
  assert.equal(missingCoverage(expected, native.map(value => ({ ...value, version: '0.0.0' }))).length, 2);
  write('build/api_client/pubspec.yaml', source);
  assert.deepEqual(resolvedDependencies('pubspec.lock', stringify(lock)), expected.map(({ manifest, ...value }) => value));
}));

test('local Dart recognition rejects alternate paths, sources, names and lock representations', () => withLocalSdkFixture(({ lock, local }) => {
  for (const path of ['../api_client', '/tmp/api_client', 'build/../build/api_client', './build/api_client', 'build/api_client/', 'lib/generated/api_client', 'build\\api_client', 'https://example.invalid/api_client']) {
    assert.throws(() => resolvedDependencies('pubspec.lock', stringify({ packages: { ...lock.packages, lythaus_api_client: { ...local, description: { ...local.description, path } } } })), /UNSUPPORTED_DEPENDENCY_SOURCE/);
  }
  for (const value of [
    { ...local, source: 'git' }, { ...local, source: 'unknown' }, { ...local, source: 'sdk' }, { ...local, source: 'hosted' }, { ...local, dependency: 'transitive' }, { ...local, dependency: 'direct dev' },
    { ...local, description: { ...local.description, relative: false } }, { ...local, description: { ...local.description, relative: 'true' } },
    { ...local, description: { ...local.description, url: 'https://example.invalid' } },
  ]) assert.throws(() => resolvedDependencies('pubspec.lock', stringify({ packages: { ...lock.packages, lythaus_api_client: value } })), /UNSUPPORTED_DEPENDENCY_SOURCE/);
  assert.throws(() => resolvedDependencies('nested/pubspec.lock', stringify(lock)), /UNSUPPORTED_DEPENDENCY_SOURCE/);
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify({ packages: { unknown_package: local } })), /UNSUPPORTED_DEPENDENCY_SOURCE/);
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock), { revision: 'HEAD' }), /EXACT_LOCAL_PACKAGE_REVISION_REQUIRED/);
}));

test('canonical Dart source and root declaration must match the locked identity', () => withLocalSdkFixture(({ lock, root, source, write }) => {
  for (const replacement of [
    { ...root, dependencies: { lythaus_api_client: { path: '../outside' } } },
    { ...root, dependencies: { lythaus_api_client: { path: 'build/api_client', git: 'https://example.invalid' } } },
    { ...root, dependency_overrides: { lythaus_api_client: { path: 'build/api_client' } } },
    { ...root, dev_dependencies: { lythaus_api_client: { path: 'build/api_client' } } },
    { ...root, dependency_overrides: { lythaus_api_client: null } },
    { ...root, dev_dependencies: { lythaus_api_client: null } },
  ]) {
    write('pubspec.yaml', replacement);
    assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /IDENTITY_MISMATCH/);
  }
  write('pubspec.yaml', root);
  for (const replacement of [{ ...source, name: 'unknown_package' }, { ...source, version: '2.0.0' }, { ...source, version: 1 }, { ...source, version: 'unversioned' }]) {
    write('lib/generated/api_client/pubspec.yaml', replacement);
    assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /IDENTITY_MISMATCH/);
  }
  for (const replacement of [
    { ...source, dependencies: { unknown: '^1.0.0' } }, { ...source, dependencies: { dio: { path: '../dio' } } },
    { ...source, dependencies: { dio: { git: 'https://example.invalid' } } }, { ...source, dependency_overrides: { dio: '^6.0.0' } },
  ]) {
    write('lib/generated/api_client/pubspec.yaml', replacement);
    assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /UNLOCKED_DEPENDENCY/);
  }
  write('lib/generated/api_client/pubspec.yaml', source);
  write('lib/generated/api_client/pubspec.yaml', { ...source, dependencies: { dio: '^900.0.0' } });
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /CONSTRAINT_MISMATCH/);
  write('lib/generated/api_client/pubspec.yaml', source);
  write('build/api_client/pubspec.yaml', { ...source, dependencies: { unknown: '^1.0.0' } });
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /PREPARATION_MISMATCH/);
  write('build/api_client/pubspec.yaml', '');
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /PREPARATION_MISMATCH/);
  fs.rmSync('lib/generated/api_client/pubspec.yaml');
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /SOURCE_REQUIRED/);
}));

test('canonical local Dart rejects every effective overrides file including null and empty files', () => withLocalSdkFixture(({ lock, write }) => {
  for (const overrides of [
    { dependency_overrides: { lythaus_api_client: null } },
    { dependency_overrides: { lythaus_api_client: { path: '../outside' } } },
    { dependency_overrides: { lythaus_api_client: { git: 'https://example.invalid' } } },
    { dependency_overrides: { dio: null } }, {}, '',
  ]) {
    write('pubspec_overrides.yaml', overrides);
    assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /OVERRIDES_FILE_UNSUPPORTED/);
  }
  fs.renameSync('pubspec_overrides.yaml', 'synthetic-override-target');
  fs.symlinkSync('synthetic-override-target', 'pubspec_overrides.yaml');
  assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /NON_CANONICAL_LOCAL_PACKAGE_FILE/);
}));

test('native comparison rejects null root keys and effective override changes at their exact SHA', () => {
  for (const field of ['dependency_overrides', 'dev_dependencies']) withLocalSdkFixture(({ root, write, git, commit }) => {
    git('init', '-q');
    const base = commit('Canonical generated package');
    write('pubspec.yaml', { ...root, [field]: { lythaus_api_client: null } });
    const head = commit('Synthetic null SDK declaration');
    write('pubspec.yaml', root);
    assert.throws(() => expectedChanges(base, head), /IDENTITY_MISMATCH/);
  });
  for (const overrides of [{ dependency_overrides: { lythaus_api_client: null } }, {}]) withLocalSdkFixture(({ write, git, commit }) => {
    git('init', '-q');
    const base = commit('Canonical generated package');
    write('pubspec_overrides.yaml', overrides);
    const head = commit('Synthetic effective overrides file without lock change');
    fs.rmSync('pubspec_overrides.yaml');
    assert.throws(() => expectedChanges(base, head), /OVERRIDES_FILE_UNSUPPORTED/);
  });
  withLocalSdkFixture(({ write, git, commit }) => {
    git('init', '-q');
    const base = commit('Canonical generated package');
    write('synthetic-override-target', {});
    fs.symlinkSync('synthetic-override-target', 'pubspec_overrides.yaml');
    const head = commit('Synthetic effective overrides symlink');
    assert.throws(() => expectedChanges(base, head), /NON_CANONICAL_LOCAL_PACKAGE_FILE/);
  });
});

test('canonical local Dart source rejects filesystem symlinks at every source or build boundary', () => {
  for (const target of ['pubspec.yaml', 'lib', 'lib/generated', 'lib/generated/api_client', 'lib/generated/api_client/pubspec.yaml', 'build', 'build/api_client', 'build/api_client/pubspec.yaml']) {
    withLocalSdkFixture(({ lock, source, write }) => {
      write('build/api_client/pubspec.yaml', source);
      fs.renameSync(target, `${target}.synthetic-target`);
      fs.symlinkSync(join(process.cwd(), `${target}.synthetic-target`), target);
      assert.throws(() => resolvedDependencies('pubspec.lock', stringify(lock)), /NON_CANONICAL_LOCAL_PACKAGE_FILE/, target);
    });
  }
});

test('native comparison verifies each Git revision rather than the current checkout', () => withLocalSdkFixture(({ lock, root, source, write, git, commit }) => {
  git('init', '-q');
  write('pubspec.yaml', { ...root, dependencies: {} });
  write('pubspec.lock', { packages: { dio: lock.packages.dio } });
  const base = commit('Synthetic hosted base');
  write('pubspec.yaml', root);
  write('pubspec.lock', lock);
  const head = commit('Canonical generated package');
  write('pubspec.yaml', { ...root, dependencies: { lythaus_api_client: { path: '../outside' } } });
  assert.deepEqual(expectedChanges(base, head).map(value => [value.name, value.localPath]), [['lythaus_api_client', 'build/api_client']]);
  const invalidRoot = commit('Synthetic root mismatch without lock change');
  assert.throws(() => expectedChanges(head, invalidRoot), /IDENTITY_MISMATCH/);
  write('pubspec.yaml', root);
  write('lib/generated/api_client/pubspec.yaml', { ...source, name: 'unknown_package' });
  const invalidSource = commit('Synthetic canonical identity mismatch');
  write('lib/generated/api_client/pubspec.yaml', source);
  assert.throws(() => expectedChanges(head, invalidSource), /IDENTITY_MISMATCH/);
  const restored = commit('Restore canonical package');
  fs.renameSync('lib/generated/api_client/pubspec.yaml', 'lib/generated/api_client/source.yaml');
  fs.symlinkSync('source.yaml', 'lib/generated/api_client/pubspec.yaml');
  const symlink = commit('Synthetic tracked source symlink');
  assert.throws(() => expectedChanges(restored, symlink), /NON_CANONICAL_LOCAL_PACKAGE_FILE/);
}));

test('native comparison rejects absent local lock entries and tracked lock symlinks', () => withLocalSdkFixture(({ lock, write, git, commit }) => {
  git('init', '-q');
  const base = commit('Canonical generated package');
  write('pubspec.lock', { packages: { dio: lock.packages.dio } });
  const missing = commit('Synthetic missing local lock entry');
  assert.throws(() => expectedChanges(base, missing), /UNSUPPORTED_DEPENDENCY_SOURCE:pubspec.lock:lythaus_api_client/);
  write('pubspec.lock', lock);
  const restored = commit('Restore local lock entry');
  fs.renameSync('pubspec.lock', 'synthetic-pubspec-lock-target');
  fs.symlinkSync('synthetic-pubspec-lock-target', 'pubspec.lock');
  const symlink = commit('Synthetic tracked lock symlink');
  assert.throws(() => expectedChanges(restored, symlink), /NON_CANONICAL_LOCAL_PACKAGE_FILE/);
}));

test('Dart dependency declaration changes require the root lock to change', () => withLocalSdkFixture(({ root, write, git, commit }) => {
  git('init', '-q');
  const base = commit('Canonical generated package');
  write('pubspec.yaml', { ...root, dependencies: { ...root.dependencies, unknown: '^1.0.0' } });
  const head = commit('Synthetic dependency without lock');
  assert.throws(() => expectedChanges(base, head), /CHANGED_MANIFEST_WITHOUT_LOCK:pubspec.yaml/);
}));

test('dependency review ignores package scripts and normalizes dependency ordering', () => {
  const before = { scripts: { test: 'node --test' }, dependencies: { astro: '7.1.6', zod: '4.0.0' } };
  const after = { scripts: { test: 'node --test tests/*.mjs' }, dependencies: { zod: '4.0.0', astro: '7.1.6' } };
  assert.equal(dependencyGraphChanged(before, after), false);
  assert.deepEqual(dependencyGraphMetadata(after).dependencies, { astro: '7.1.6', zod: '4.0.0' });
});

test('native coverage matches linked local identities while still requiring local and registry entries', () => {
  const expected = resolvedDependencies('package-lock.json', JSON.stringify({ packages: {
    '': { name: 'synthetic-root', version: '1.0.0' },
    'node_modules/fast-glob': { resolved: 'tools/openapi/spectral-glob', link: true },
    'tools/openapi/spectral-glob': { name: 'fast-glob', version: '1.0.0', dev: true },
    'node_modules/glob': { version: '13.0.6', resolved: 'https://registry.npmjs.org/glob/-/glob-13.0.6.tgz' },
  } })).map(value => ({ ...value, manifest: 'package-lock.json' }));
  assert.deepEqual(expected.map(value => [value.name, value.version]), [['tools/openapi/spectral-glob', '1.0.0'], ['glob', '13.0.6']]);
  const native = expected.map(value => ({ ...value, change_type: 'added' }));
  assert.deepEqual(missingCoverage(expected, native), []);
  assert.equal(missingCoverage(expected, native.slice(1)).length, 1, 'The local source must still have native coverage');
  assert.equal(missingCoverage(expected, native.slice(0, 1)).length, 1, 'Registry dependencies must still have native coverage');
  assert.equal(missingCoverage(expected, native.map(value => ({ ...value, name: 'unrelated' }))).length, 2);
});

test('dependency review requires a lockfile for resolved dependency metadata changes', () => {
  const before = { dependencies: { astro: '7.1.6' }, overrides: { nanoid: '3.3.18' } };
  const after = { dependencies: { astro: '7.2.0' }, overrides: { nanoid: '3.3.18' } };
  assert.equal(dependencyGraphChanged(before, after), true);
});

test('marketing linked policy requires native coverage alongside every registry entry', () => {
  const lock = fs.readFileSync('apps/marketing-site/package-lock.json', 'utf8');
  const expected = resolvedDependencies('apps/marketing-site/package-lock.json', lock).map(value => ({ ...value, manifest: 'apps/marketing-site/package-lock.json' }));
  const local = expected.find(value => value.name === '../../tools/marketing/astro-cache-policy');
  assert.equal(local.version, '1.0.0');
  assert.equal(expected.some(value => value.name === 'http-cache-semantics'), false);
  const native = expected.map(value => ({ ...value, change_type: 'added' }));
  assert.deepEqual(missingCoverage(expected, native), []);
  assert.equal(missingCoverage(expected, native.filter(value => value.name !== local.name)).length, 1);
  assert.equal(missingCoverage(expected, native.filter(value => value.name === local.name)).length, expected.length - 1);
});

test('local dependency review skips duplicate audits when the dependency graph is unchanged', () => {
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: [], changedNpmLocks: [] }), false);
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: ['package.json'], changedNpmLocks: [] }), true);
  assert.equal(shouldRunLocalAudit({ changedNpmDependencyManifests: [], changedNpmLocks: ['package-lock.json'] }), true);
});
