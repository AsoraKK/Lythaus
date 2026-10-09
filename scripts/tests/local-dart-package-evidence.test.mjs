import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { assertSourceSnapshotUnchanged, classificationPath, completedBehaviorReport, contractSuites, evidenceSchema, inputBundlePath, inputBundleSchema, localDartClassification, localDartIdentity, lockedRuntimePackages, lockedVersionSatisfies, preparedDartIdentity, rejectedMutationReport, requiredBehaviorCases, sourceMutations, validateLocalDartReceiptEvidence, verifyLocalDartReceipt } from '../ci/local-dart-package-evidence.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const jsonl = events => events.map(value => JSON.stringify(value)).join('\n');

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
    const rootLock = parse(fs.readFileSync('pubspec.lock', 'utf8'));
    const runtimeNodes = [...identity.dependencies.map(value => ({ name: value.name, version: value.version, source: 'hosted', dependencies: value.name === 'dio' ? ['meta'] : [] })), { name: 'meta', version: rootLock.packages.meta.version, source: 'hosted', dependencies: [] }];
    const runtimeGraph = { root: parse(fs.readFileSync('pubspec.yaml', 'utf8')).name, packages: [{ name: identity.packageName, version: identity.version, source: 'path', dependencies: identity.dependencies.map(value => value.name) }, ...runtimeNodes] };
    const manifest = parse(fs.readFileSync('lib/generated/api_client/pubspec.yaml', 'utf8'));
    manifest.dependencies = Object.fromEntries(identity.dependencies.map(value => [value.name, value.version]));
    manifest.dev_dependencies.build_runner = '2.16.1';
    manifest.dev_dependencies.analyzer = '14.4.0';
    const versions = { ...Object.fromEntries(runtimeNodes.map(value => [value.name, value.version])), built_value_generator: '8.12.0', build_runner: '2.16.1', analyzer: '14.4.0', test: '1.26.3' };
    const toolchainLock = { packages: Object.fromEntries(Object.entries(versions).map(([name, version]) => [name, { source: 'hosted', version, description: { sha256: rootLock.packages[name]?.description.sha256 ?? 'd'.repeat(64) } }])) };
    const toolchainGraph = { root: identity.packageName, packages: [{ name: identity.packageName, source: 'root', dependencies: Object.keys({ ...manifest.dependencies, ...manifest.dev_dependencies }) }, ...Object.entries(versions).map(([name, version]) => ({ name, version, source: 'hosted', dependencies: name === 'dio' ? ['meta'] : [] }))] };
    const baseline = jsonl([...requiredBehaviorCases.flatMap((name, id) => [{ type: 'testStart', test: { id, name } }, { type: 'testDone', testID: id, result: 'success', skipped: false, hidden: false }]), { type: 'done', success: true }]);
    const bundle = { schemaVersion: inputBundleSchema, headSha: identity.headSha, provenance: 'unattested-local', baseline: { exitCode: 0, stdout: baseline }, runtimeGraph: JSON.stringify(runtimeGraph),
      mutations: sourceMutations.map(value => ({ id: value.id, exitCode: 1, stdout: jsonl([{ type: 'testStart', test: { id: 1, name: value.testName } }, { type: 'error', testID: 1, isFailure: true, error: 'Expected: synthetic assertion\nActual: synthetic mismatch' }, { type: 'testDone', testID: 1, result: 'failure', skipped: false }, { type: 'done', success: false }]) })),
      toolchain: { manifest: stringify(manifest), lock: stringify(toolchainLock), graph: JSON.stringify(toolchainGraph), flutter: { frameworkVersion: JSON.parse(fs.readFileSync('.fvmrc')).flutter, channel: 'stable', dartSdkVersion: '3.11.0' } },
    };
    const receipt = { schemaVersion: evidenceSchema, identity, preparation, verification: 'behavior-verified', behavior: completedBehaviorReport(baseline),
      mutations: sourceMutations.map(value => rejectedMutationReport(bundle.mutations.find(raw => raw.id === value.id).stdout, value)), classification, nativeIndexing: 'NOT_CLAIMED', fixtures: 'synthetic-only', toolchainLockSha256: digest(bundle.toolchain.lock),
      runtimePackages: lockedRuntimePackages(runtimeGraph, rootLock, rootLock, identity.dependencies),
    };
    const saveBundle = () => { const raw = JSON.stringify(bundle); write(inputBundlePath, raw); receipt.inputBundleSha256 = digest(raw); };
    saveBundle();
    return run({ identity, preparation, classification, receipt, bundle, saveBundle, write, git, commit });
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

test('consistent raw evidence and classification cannot grant coverage without a trusted producer', () => withSourceFixture(({ identity, preparation, classification, receipt }) => {
  assert.deepEqual(validateLocalDartReceiptEvidence(receipt, identity, preparation), { sourceVerification: 'LOCAL_CONSISTENCY_ONLY', coverageEligible: false, nativeIndexing: 'NOT_CLAIMED', packageName: 'lythaus_api_client', version: '1.0.0' });
  assert.throws(() => verifyLocalDartReceipt(receipt, identity, preparation), /TRUSTED_PRODUCER_REQUIRED/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, classification: { state: 'unapproved' } }, identity, preparation, classification), /OWNER_LICENSE_CLASSIFICATION_REQUIRED/);
}));

test('approval must exist in the compared Git revision and respect license policy', () => withSourceFixture(({ identity, preparation, receipt, bundle, saveBundle, write, commit }) => {
  const approval = JSON.parse(fs.readFileSync(classificationPath));
  fs.rmSync(classificationPath);
  const missing = localDartIdentity(commit());
  write(classificationPath, JSON.stringify(approval));
  bundle.headSha = missing.headSha;
  saveBundle();
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

test('fabricated well-formed hashes cannot substitute for reloaded raw evidence', () => withSourceFixture(({ identity, preparation, receipt }) => {
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, behavior: { ...receipt.behavior, reportSha256: 'a'.repeat(64) } }, identity, preparation), /BEHAVIOR_TRACE_MISMATCH/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, mutations: receipt.mutations.map(value => ({ ...value, reportSha256: 'b'.repeat(64) })) }, identity, preparation), /MUTATION_TRACE_MISMATCH/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, toolchainLockSha256: 'c'.repeat(64) }, identity, preparation), /TOOLCHAIN_MISMATCH/);
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, inputBundleSha256: 'f'.repeat(64) }, identity, preparation), /INPUT_BUNDLE_MISMATCH/);
}));

test('altered raw traces fail even when their bundle hash is updated', () => withSourceFixture(({ identity, preparation, receipt, bundle, saveBundle, write }) => {
  write(inputBundlePath, JSON.stringify({ ...bundle, baseline: { ...bundle.baseline, exitCode: 1 } }));
  assert.throws(() => verifyLocalDartReceipt(receipt, identity, preparation), /INPUT_BUNDLE_MISMATCH/);
  bundle.baseline.stdout = bundle.baseline.stdout.replace('"success":true', '"success":false');
  saveBundle();
  assert.throws(() => verifyLocalDartReceipt(receipt, identity, preparation), /BEHAVIOR_INCOMPLETE/);
}));

test('runtime closure comes from the raw graph and self-consistent fabricated graphs still cannot grant coverage', () => withSourceFixture(({ identity, preparation, receipt, bundle, saveBundle }) => {
  const truncated = receipt.runtimePackages.filter(value => value.name !== 'meta').map(value => ({ ...value, dependencies: [] }));
  assert.throws(() => verifyLocalDartReceipt({ ...receipt, runtimePackages: truncated }, identity, preparation), /RUNTIME_LOCK_MISMATCH/);
  const graph = JSON.parse(bundle.runtimeGraph);
  graph.packages.find(value => value.name === 'dio').dependencies = [];
  bundle.runtimeGraph = JSON.stringify(graph);
  receipt.runtimePackages = truncated;
  saveBundle();
  assert.equal(validateLocalDartReceiptEvidence(receipt, identity, preparation).coverageEligible, false);
  assert.throws(() => verifyLocalDartReceipt(receipt, identity, preparation), /TRUSTED_PRODUCER_REQUIRED/);
}));

test('generator lock, manifest, graph and pinned Flutter identity are checked independently of receipt summaries', () => withSourceFixture(({ identity, preparation, receipt, bundle, saveBundle }) => {
  const original = structuredClone(bundle.toolchain);
  for (const change of [
    value => { value.lock = value.lock.replace('14.4.0', '14.3.0'); },
    value => { value.manifest = value.manifest.replace('14.4.0', '14.3.0'); },
    value => { const graph = JSON.parse(value.graph); graph.packages = graph.packages.filter(node => node.name !== 'meta'); value.graph = JSON.stringify(graph); },
    value => { value.flutter.frameworkVersion = '0.0.0'; },
  ]) {
    bundle.toolchain = structuredClone(original);
    change(bundle.toolchain);
    receipt.toolchainLockSha256 = digest(bundle.toolchain.lock);
    saveBundle();
    assert.throws(() => verifyLocalDartReceipt(receipt, identity, preparation), /TOOLCHAIN_MISMATCH/);
  }
}));

test('reloaded mutation traces must demonstrate assertion failure and not compiler/process failure', () => withSourceFixture(({ identity, preparation, receipt, bundle, saveBundle }) => {
  for (const stdout of [
    jsonl([{ type: 'testStart', test: { id: 1, name: sourceMutations[0].testName } }, { type: 'error', testID: 1, isFailure: false, error: 'Expected: failed to compile source' }, { type: 'testDone', testID: 1, result: 'error', skipped: false }, { type: 'done', success: false }]),
    jsonl([{ type: 'error', error: 'Process exited 1' }, { type: 'done', success: false }]),
  ]) {
    bundle.mutations[0].stdout = stdout;
    saveBundle();
    assert.throws(() => verifyLocalDartReceipt(receipt, identity, preparation), /MUTATION_NOT_DEMONSTRATED/);
  }
}));

test('publication snapshot rejects changed HEAD, canonical source, recipe and untracked source inputs', () => withSourceFixture(({ identity, write, commit }) => {
  assertSourceSnapshotUnchanged(identity);
  write('pubspec_overrides.yaml', '');
  assert.throws(() => assertSourceSnapshotUnchanged(identity), /UNTRACKED_INPUT/);
  fs.rmSync('pubspec_overrides.yaml');
  for (const file of ['lib/generated/api_client/lib/synthetic.dart', 'tests/contract/dart/canonical_local_package_behavior_test.dart.fixture', 'scripts/validate-openapi-dart-client.mjs']) {
    const original = fs.readFileSync(file);
    write(file, Buffer.concat([original, Buffer.from('\nsynthetic concurrent change\n')]));
    assert.throws(() => assertSourceSnapshotUnchanged(identity), /CHECKOUT_CHANGED/);
    write(file, original);
  }
  write('.gitignore', '*.g.dart\n');
  write('lib/generated/api_client/lib/synthetic_untracked.g.dart', '// synthetic ignored input\n');
  assert.throws(() => assertSourceSnapshotUnchanged(identity), /UNTRACKED_INPUT/);
  fs.rmSync('lib/generated/api_client/lib/synthetic_untracked.g.dart');
  commit();
  assert.throws(() => assertSourceSnapshotUnchanged(identity), /HEAD_CHANGED/);
}));
