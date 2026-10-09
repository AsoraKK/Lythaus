import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classificationPath, completedBehaviorReport, contractSuites, evidenceSchema, localDartClassification, localDartIdentity, lockedRuntimePackages, lockedVersionSatisfies, preparedDartIdentity, rejectedMutationReport, requiredBehaviorCases, sourceMutations, verifyLocalDartReceipt } from '../ci/local-dart-package-evidence.mjs';

function withSourceFixture(run) {
  const original = process.cwd();
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-dart-source-contract-'));
  const write = (file, content) => { fs.mkdirSync(join(directory, file, '..'), { recursive: true }); fs.writeFileSync(join(directory, file), content); };
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=Synthetic contract fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic source binding'); return git('rev-parse', 'HEAD'); };
  const recipe = ['pubspec.yaml', 'pubspec.lock', '.fvmrc', 'lib/generated/api_client/pubspec.yaml', 'api/openapi/dist/openapi.json', 'scripts/validate-openapi-dart-client.mjs', 'scripts/ci/dependency-review-native.mjs', 'scripts/ci/local-dart-package-evidence.mjs', 'scripts/tests/admin-mutation-sdk-guard.mjs', 'scripts/tests/fixtures/privacy-status-serialization.dart.txt', 'tests/contract/fixtures/monthly-rewards-preparation-wire.mjs', ...contractSuites.slice(1).map(file => `tests/contract/dart/${file}.fixture`)];
  for (const file of recipe) write(file, fs.readFileSync(join(original, file)));
  write('lib/generated/api_client/lib/synthetic.dart', 'class SyntheticSource {}\n');
  write('build/api_client/pubspec.yaml', fs.readFileSync('lib/generated/api_client/pubspec.yaml'));
  write('build/api_client/lib/synthetic.dart', 'class SyntheticSource {}\n');
  try {
    process.chdir(directory);
    git('init', '-q');
    const baseIdentity = localDartIdentity(commit());
    assert.equal(localDartClassification(baseIdentity).state, 'unapproved');
    const approval = { state: 'approved', packageName: 'lythaus_api_client', version: baseIdentity.version, ownership: 'Lythaus-first-party', licenseExpression: 'MIT', approvalEvidenceRef: 'synthetic-unit-fixture-only', sourceTreeSha: baseIdentity.sourceTreeSha, canonicalManifestBlobSha: baseIdentity.recipeBlobs[baseIdentity.canonicalManifest], licenseEvidencePath: 'api/openapi/dist/openapi.json', licenseEvidenceBlobSha: baseIdentity.recipeBlobs['api/openapi/dist/openapi.json'] };
    write(classificationPath, JSON.stringify(approval));
    const identity = localDartIdentity(commit());
    const preparation = preparedDartIdentity(identity);
    const classification = localDartClassification(identity);
    const receipt = { schemaVersion: evidenceSchema, identity, preparation, verification: 'behavior-verified',
      behavior: { suites: contractSuites, cases: requiredBehaviorCases.map(name => ({ name, result: 'success', skipped: false })), reportSha256: 'a'.repeat(64) },
      mutations: sourceMutations.map(value => ({ id: value.id, file: value.file, testName: value.testName, rejected: true, reportSha256: 'b'.repeat(64) })), classification, nativeIndexing: 'NOT_CLAIMED', fixtures: 'synthetic-only', toolchainLockSha256: 'c'.repeat(64),
      runtimePackages: identity.dependencies.map(value => ({ name: value.name, version: value.version, integrity: value.integrity, dependencies: [] })).sort((left, right) => left.name.localeCompare(right.name)),
    };
    return run({ identity, preparation, classification, receipt, write, git, commit });
  } finally { process.chdir(original); fs.rmSync(directory, { recursive: true, force: true }); }
}

test('current canonical Dart constraint forms require the actual locked version', () => {
  for (const [constraint, version] of [['^5.2.0', '5.12.0'], ['>=1.5.0 <2.0.0', '1.5.0'], ['>=8.4.0 <9.0.0', '8.12.0'], ['5.2.0', '5.2.0'], ['^0.2.3', '0.2.9'], ['^0.0.3', '0.0.3'], ['^0.0.3', '0.0.4']]) assert.equal(lockedVersionSatisfies(constraint, version), true, `${constraint}: ${version}`);
  for (const [constraint, version] of [['^900.0.0', '5.2.0'], ['^5.2.0', '5.1.9'], ['^5.2.0', '6.0.0'], ['>=1.5.0 <2.0.0', '2.0.0'], ['>=1.5.0 <2.0.0', '1.4.9'], ['^0.2.3', '0.3.0'], ['^0.0.3', '0.1.0'], ['any', '5.2.0'], ['>=1.0.0 || <9.0.0', '5.2.0'], ['^5.2.0', '5.2.0-beta'], ['', '5.2.0']]) assert.equal(lockedVersionSatisfies(constraint, version), false, `${constraint}: ${version}`);
});

test('actual runtime dependency closure must match root locked versions and artifacts', () => {
  const graph = { packages: [{ name: 'dio', version: '5.2.0', dependencies: ['collection'] }, { name: 'collection', version: '1.19.1', dependencies: [] }] };
  const lock = { packages: { dio: { source: 'hosted', version: '5.2.0', description: { sha256: 'a'.repeat(64) } }, collection: { source: 'hosted', version: '1.19.1', description: { sha256: 'b'.repeat(64) } } } };
  assert.equal(lockedRuntimePackages(graph, lock, lock, [{ name: 'dio' }]).length, 2);
  assert.throws(() => lockedRuntimePackages(graph, { packages: { ...lock.packages, dio: { ...lock.packages.dio, version: '5.3.0' } } }, lock, [{ name: 'dio' }]), /RUNTIME_LOCK_MISMATCH/);
  assert.throws(() => lockedRuntimePackages(graph, { packages: { ...lock.packages, collection: { ...lock.packages.collection, description: { sha256: 'f'.repeat(64) } } } }, lock, [{ name: 'dio' }]), /RUNTIME_LOCK_MISMATCH/);
  assert.throws(() => lockedRuntimePackages({ packages: graph.packages.slice(0, 1) }, lock, lock, [{ name: 'dio' }]), /RUNTIME_LOCK_MISMATCH/);
});

test('source receipt protocol is separate from native indexing and needs independent classification', () => withSourceFixture(({ identity, preparation, classification, receipt }) => {
  assert.deepEqual(verifyLocalDartReceipt(receipt, identity, preparation, classification), { sourceVerification: 'VERIFIED_CANONICAL_COMPONENT', nativeIndexing: 'NOT_CLAIMED', packageName: 'lythaus_api_client', version: '1.0.0' });
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, classification: { state: 'unapproved' } }, identity, preparation, classification), /OWNER_LICENSE_CLASSIFICATION_REQUIRED/);
}));

test('approval must exist in the compared Git revision and respect license policy', () => withSourceFixture(({ identity, preparation, receipt, write, commit }) => {
  const approval = JSON.parse(fs.readFileSync(classificationPath));
  fs.rmSync(classificationPath);
  const missing = localDartIdentity(commit());
  write(classificationPath, JSON.stringify(approval));
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, identity: missing }, missing, preparation), /OWNER_LICENSE_CLASSIFICATION_REQUIRED/);
  for (const licenseExpression of ['GPL-3.0', 'GPL-3.0-only', 'AGPL-3.0-or-later', 'MIT OR AGPL-3.0']) {
    write(classificationPath, JSON.stringify({ ...approval, licenseExpression }));
    assert.throws(() => localDartClassification(localDartIdentity(commit())), /LICENSE_POLICY_FAILURE/);
  }
  write(classificationPath, JSON.stringify({ ...approval, sourceTreeSha: 'f'.repeat(40) }));
  assert.throws(() => localDartClassification(localDartIdentity(commit())), /OWNER_LICENSE_CLASSIFICATION_REQUIRED/);
  write(classificationPath, JSON.stringify({ ...approval, licenseExpression: 'Apache-2.0' }));
  assert.throws(() => localDartClassification(localDartIdentity(commit())), /LICENSE_EVIDENCE_MISMATCH/);
}));

test('missing stale or same-version altered-source receipts never satisfy the source contract', () => withSourceFixture(({ identity, preparation, classification, receipt, write, commit }) => {
  assert.throws(() => verifyLocalDartReceipt(undefined, identity, preparation, classification), /RECEIPT_REQUIRED/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, identity: { ...identity, headSha: 'f'.repeat(40) } }, identity, preparation, classification), /STALE_RECEIPT/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, identity: { ...identity, sourceTreeSha: 'f'.repeat(40) } }, identity, preparation, classification), /IDENTITY_MISMATCH/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, identity: { ...identity, recipeBlobs: { ...identity.recipeBlobs, 'scripts/validate-openapi-dart-client.mjs': 'f'.repeat(40) } } }, identity, preparation, classification), /IDENTITY_MISMATCH/);
  write('lib/generated/api_client/lib/synthetic.dart', 'class SyntheticSource { final changed = true; }\n');
  const changed = localDartIdentity(commit());
  assert.equal(changed.version, identity.version);
  assert.notEqual(changed.sourceTreeSha, identity.sourceTreeSha);
  assert.throws(() => verifyLocalDartReceipt(receipt, changed, preparation, classification), /STALE_RECEIPT/);
}));

test('prepared package cannot redirect or substitute source while retaining its version', () => withSourceFixture(({ identity, preparation, classification, receipt, write }) => {
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, preparation: { ...preparation, librarySha256: 'f'.repeat(64) } }, identity, preparation, classification), /PREPARATION_MISMATCH/);
  write('build/api_client/lib/synthetic.dart', 'class SyntheticSubstitute {}\n');
  assert.throws(() => preparedDartIdentity(identity), /PREPARATION_MISMATCH/);
  write('build/api_client/lib/synthetic.dart', 'class SyntheticSource {}\n');
  fs.renameSync('build/api_client/lib', 'build/api_client/synthetic-lib-target');
  fs.symlinkSync('synthetic-lib-target', 'build/api_client/lib');
  assert.throws(() => preparedDartIdentity(identity), /PREPARATION_SYMLINK/);
}));

test('Git-bound source identity rejects a canonical constraint mismatch and source symlinks', () => withSourceFixture(({ write, commit }) => {
  const source = fs.readFileSync('lib/generated/api_client/pubspec.yaml', 'utf8');
  write('lib/generated/api_client/pubspec.yaml', source.replace("dio: '^5.2.0'", "dio: '^900.0.0'"));
  assert.throws(() => localDartIdentity(commit()), /CONSTRAINT_MISMATCH/);
  write('lib/generated/api_client/pubspec.yaml', source);
  fs.renameSync('lib/generated/api_client/lib/synthetic.dart', 'lib/generated/api_client/lib/synthetic-target.dart');
  fs.symlinkSync('synthetic-target.dart', 'lib/generated/api_client/lib/synthetic.dart');
  assert.throws(() => localDartIdentity(commit()), /NON_CANONICAL_DART_LIBRARY_ENTRY/);
}));

test('JSON reporting rejects placeholder-only, skipped or failing behavior cases', () => {
  const events = requiredBehaviorCases.flatMap((name, id) => [{ type: 'testStart', test: { id, name } }, { type: 'testDone', testID: id, result: 'success', skipped: false, hidden: false }]);
  const encode = value => value.map(row => JSON.stringify(row)).join('\n');
  assert.equal(completedBehaviorReport(encode([...events, { type: 'done', success: true }])).cases.length, requiredBehaviorCases.length);
  assert.throws(() => completedBehaviorReport(encode([{ type: 'testStart', test: { id: 1, name: 'test getMyMonthlyRewards' } }, { type: 'testDone', testID: 1, result: 'success', skipped: false }, { type: 'done', success: true }])), /BEHAVIOR_INCOMPLETE/);
  assert.throws(() => completedBehaviorReport(encode([...events.slice(0, -1), { type: 'testDone', testID: requiredBehaviorCases.length - 1, result: 'success', skipped: true }, { type: 'done', success: true }])), /BEHAVIOR_INCOMPLETE/);
  assert.throws(() => completedBehaviorReport(encode([...events, { type: 'done', success: false }])), /BEHAVIOR_INCOMPLETE/);
});

test('mutation evidence requires a named assertion failure rather than compile or process failure', () => {
  const mutation = sourceMutations[0];
  const encode = events => events.map(value => JSON.stringify(value)).join('\n');
  const start = { type: 'testStart', test: { id: 1, name: mutation.testName } };
  const error = { type: 'error', testID: 1, isFailure: true, error: "Expected: 'Bearer synthetic-jwt'\nActual: null" };
  const end = { type: 'testDone', testID: 1, result: 'failure', skipped: false };
  const done = { type: 'done', success: false };
  assert.equal(rejectedMutationReport(encode([start, error, end, done]), mutation).rejected, true);
  assert.throws(() => rejectedMutationReport(encode([start, { ...error, error: 'Could not compile the source', isFailure: false }, end, done]), mutation), /MUTATION_NOT_DEMONSTRATED/);
  assert.throws(() => rejectedMutationReport(encode([start, { ...error, isFailure: false }, end, done]), mutation), /MUTATION_NOT_DEMONSTRATED/);
  assert.throws(() => rejectedMutationReport(encode([start, error, { ...end, result: 'error' }, done]), mutation), /MUTATION_NOT_DEMONSTRATED/);
  assert.throws(() => rejectedMutationReport(encode([start, error, { ...end, skipped: true }, done]), mutation), /MUTATION_NOT_DEMONSTRATED/);
  assert.throws(() => rejectedMutationReport(encode([start, error, end]), mutation), /MUTATION_NOT_DEMONSTRATED/);
  assert.throws(() => rejectedMutationReport(encode([{ type: 'error', error: 'Process exited 1' }]), mutation), /MUTATION_NOT_DEMONSTRATED/);
});

test('source receipt never substitutes missing behaviors or mutation checks for approval', () => withSourceFixture(({ identity, preparation, classification, receipt }) => {
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, behavior: { ...receipt.behavior, cases: [] } }, identity, preparation, classification), /BEHAVIOR_INCOMPLETE/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, mutations: [] }, identity, preparation, classification), /MUTATION_INCOMPLETE/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, classification: { ...classification, ownership: 'third-party' } }, identity, preparation, classification), /OWNER_LICENSE_CLASSIFICATION_REQUIRED/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, runtimePackages: [] }, identity, preparation, classification), /RUNTIME_LOCK_MISMATCH/);
}));
