import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { lockedVersionSatisfies } from './dependency-review-native.mjs';
export { lockedVersionSatisfies };

export const evidenceSchema = 'lythaus-canonical-dart-source-evidence-v2';
export const inputBundleSchema = 'lythaus-canonical-dart-inputs-v1';
export const inputBundlePath = '.artifacts/canonical-sdk-contract/evidence.json';
export const classificationPath = 'infrastructure/canonical-dart-package-approval.json';
export const contractSuites = [
  'privacy_status_serialization_test.dart', 'community_appeal_serialization_test.dart',
  'admin_mutation_admission_test.dart', 'support_feedback_serialization_test.dart',
  'activity_measurement_serialization_test.dart', 'monthly_rewards_preparation_serialization_test.dart',
  'canonical_local_package_behavior_test.dart',
];
export const requiredBehaviorCases = [
  'generated clients retain own-member paths and bearer auth without selectors',
  'generated caller cannot override origin past the real guard',
  'missing or plain-text media stays rejected by the real guard: text/plain',
  'canonical SDK rejects unauthorized monthly replies without returning authority',
  'canonical SDK rejects forbidden monthly replies without retry',
  'canonical SDK refuses malformed monthly authority',
  'canonical SDK cancels a request before transport',
  'canonical SDK preserves CSV bytes and private response headers',
];
export const sourceMutations = [
  { id: 'bearer-header-omission', file: 'lib/src/auth/bearer_auth.dart', before: "options.headers['Authorization'] = 'Bearer ${token}';", after: "options.headers.remove('Authorization');", testName: requiredBehaviorCases[0] },
  { id: 'monthly-own-route-change', file: 'lib/src/api/rewards_api.dart', before: "r'/rewards/me/monthly'", after: "r'/rewards/synthetic-other/monthly'", testName: requiredBehaviorCases[0] },
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const blobSha = value => createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function lockedRuntimePackages(graph, temporaryLock, rootLock, directDependencies) {
  if (!Array.isArray(graph.packages) || graph.packages.length > 2000) throw new Error('SOURCE_EVIDENCE_RUNTIME_GRAPH_REQUIRED');
  const packages = new Map(graph.packages.map(value => [value.name, value]));
  if (packages.size !== graph.packages.length) throw new Error('SOURCE_EVIDENCE_RUNTIME_GRAPH_REQUIRED');
  const pending = directDependencies.map(value => value.name);
  const visited = new Set();
  const verified = [];
  while (pending.length) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const node = packages.get(name);
    const actual = temporaryLock.packages?.[name];
    const expected = rootLock.packages?.[name];
    if (!node || !Array.isArray(node.dependencies) || node.version !== expected?.version || actual?.source !== 'hosted' || expected?.source !== 'hosted' || actual.version !== expected.version || !/^[a-f0-9]{64}$/.test(expected.description?.sha256 ?? '') || actual.description?.sha256 !== expected.description.sha256) throw new Error(`SOURCE_EVIDENCE_RUNTIME_LOCK_MISMATCH:${name}`);
    verified.push({ name, version: expected.version, integrity: expected.description.sha256, dependencies: node.dependencies });
    pending.push(...node.dependencies);
  }
  return verified.sort((left, right) => left.name.localeCompare(right.name));
}

const recipePaths = [
  'pubspec.yaml', 'pubspec.lock', '.fvmrc', 'lib/generated/api_client/pubspec.yaml',
  'api/openapi/dist/openapi.json', 'scripts/validate-openapi-dart-client.mjs',
  'scripts/ci/dependency-review-native.mjs', 'scripts/ci/local-dart-package-evidence.mjs',
  'scripts/tests/admin-mutation-sdk-guard.mjs', 'scripts/tests/fixtures/privacy-status-serialization.dart.txt',
  'tests/contract/fixtures/monthly-rewards-preparation-wire.mjs',
  ...contractSuites.slice(1).map(file => `tests/contract/dart/${file}.fixture`),
];

export function localDartIdentity(headSha) {
  if (!/^[a-f0-9]{40}$/.test(headSha ?? '')) throw new Error('EXACT_SOURCE_EVIDENCE_SHA_REQUIRED');
  const recipeBlobs = {};
  for (const file of recipePaths) {
    const entry = git(['ls-tree', headSha, '--', file]);
    if (!entry.startsWith('100644 blob ')) throw new Error(`SOURCE_EVIDENCE_FILE_REQUIRED:${file}`);
    recipeBlobs[file] = entry.split(/\s+/)[2];
  }
  const directory = 'lib/generated/api_client/lib';
  const tree = git(['ls-tree', headSha, '--', directory]);
  if (!tree.startsWith('040000 tree ')) throw new Error('CANONICAL_DART_LIBRARY_TREE_REQUIRED');
  const sourceFiles = {};
  for (const entry of git(['ls-tree', '-r', '-z', headSha, '--', directory]).split('\0').filter(Boolean)) {
    const [metadata, file] = entry.split('\t');
    if (!metadata.startsWith('100644 blob ') || !file.startsWith(`${directory}/`)) throw new Error('NON_CANONICAL_DART_LIBRARY_ENTRY');
    sourceFiles[file.slice(directory.length + 1)] = metadata.split(' ')[2];
  }
  if (!Object.keys(sourceFiles).length || Object.keys(sourceFiles).length > 2000) throw new Error('CANONICAL_DART_LIBRARY_FILE_LIMIT');
  const manifest = parse(git(['show', `${headSha}:lib/generated/api_client/pubspec.yaml`]));
  const lock = parse(git(['show', `${headSha}:pubspec.lock`]));
  if (manifest.name !== 'lythaus_api_client' || manifest.version !== lock.packages?.lythaus_api_client?.version) throw new Error('CANONICAL_DART_PACKAGE_IDENTITY_REQUIRED');
  const dependencies = Object.entries(manifest.dependencies ?? {}).map(([name, constraint]) => {
    const locked = lock.packages?.[name];
    if (locked?.source !== 'hosted' || !lockedVersionSatisfies(constraint, locked.version)) throw new Error(`CANONICAL_LOCAL_PACKAGE_CONSTRAINT_MISMATCH:${name}`);
    return { name, constraint, version: locked.version, integrity: locked.description?.sha256 };
  });
  const classification = git(['ls-tree', headSha, '--', classificationPath]);
  if (classification && !classification.startsWith('100644 blob ')) throw new Error('NON_CANONICAL_DART_CLASSIFICATION_FILE');
  return { headSha, packageName: manifest.name, version: manifest.version, localPath: 'build/api_client', canonicalManifest: 'lib/generated/api_client/pubspec.yaml', sourceTreeSha: tree.split(/\s+/)[2], sourceFiles, recipeBlobs, dependencies, classificationBlobSha: classification ? classification.split(/\s+/)[2] : null };
}

export function localDartClassification(identity) {
  if (!/^[a-f0-9]{40}$/.test(identity.headSha ?? '')) throw new Error('EXACT_SOURCE_EVIDENCE_SHA_REQUIRED');
  if (!identity.classificationBlobSha) return { state: 'unapproved', reason: 'OWNER_LICENSE_CLASSIFICATION_REQUIRED' };
  const classification = JSON.parse(git(['show', `${identity.headSha}:${classificationPath}`]));
  if (classification.state !== 'approved' || classification.packageName !== identity.packageName || classification.version !== identity.version || classification.ownership !== 'Lythaus-first-party' || classification.sourceTreeSha !== identity.sourceTreeSha || classification.canonicalManifestBlobSha !== identity.recipeBlobs[identity.canonicalManifest] || typeof classification.approvalEvidenceRef !== 'string' || !classification.approvalEvidenceRef || typeof classification.licenseExpression !== 'string' || !classification.licenseExpression || !classification.licenseEvidenceBlobSha || classification.licenseEvidenceBlobSha !== identity.recipeBlobs[classification.licenseEvidencePath]) throw new Error('OWNER_LICENSE_CLASSIFICATION_REQUIRED');
  if (/(?:^|[^A-Za-z0-9])(?:A?GPL)-3\.0(?:-only|-or-later)?(?:$|[^A-Za-z0-9])/.test(classification.licenseExpression)) throw new Error('LOCAL_DART_LICENSE_POLICY_FAILURE');
  if (classification.licenseEvidencePath !== 'api/openapi/dist/openapi.json' || JSON.parse(git(['show', `${identity.headSha}:api/openapi/dist/openapi.json`])).info?.license?.name !== classification.licenseExpression) throw new Error('LOCAL_DART_LICENSE_EVIDENCE_MISMATCH');
  return { ...classification, evidencePath: classificationPath, evidenceBlobSha: identity.classificationBlobSha };
}

export function preparedDartIdentity(identity, directory = 'build/api_client') {
  if (directory !== 'build/api_client') throw new Error('CANONICAL_DART_PREPARATION_PATH_REQUIRED');
  for (const prefix of ['build', directory]) {
    const entry = fs.lstatSync(prefix);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('SOURCE_EVIDENCE_PREPARATION_SYMLINK');
  }
  const files = [];
  let totalBytes = 0;
  function visit(relative) {
    const absolute = join(directory, relative);
    const entry = fs.lstatSync(absolute);
    if (entry.isSymbolicLink()) throw new Error('SOURCE_EVIDENCE_PREPARATION_SYMLINK');
    if (entry.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(join(relative, name));
    } else {
      if (!entry.isFile() || entry.size > 1024 * 1024 || files.length >= 2000) throw new Error('SOURCE_EVIDENCE_PREPARATION_FILE_LIMIT');
      const data = fs.readFileSync(absolute);
      totalBytes += data.length;
      if (totalBytes > 64 * 1024 * 1024) throw new Error('SOURCE_EVIDENCE_PREPARATION_BYTE_LIMIT');
      const source = identity.sourceFiles[relative.replace(/^lib\//, '')];
      if (source && blobSha(data) !== source) throw new Error(`SOURCE_EVIDENCE_PREPARATION_MISMATCH:${relative}`);
      files.push({ path: relative, blobSha: blobSha(data), sha256: sha256(data) });
    }
  }
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('SOURCE_EVIDENCE_PREPARATION_SYMLINK');
  visit('pubspec.yaml');
  visit('lib');
  const manifest = files.find(file => file.path === 'pubspec.yaml');
  if (manifest.blobSha !== identity.recipeBlobs[identity.canonicalManifest] || Object.keys(identity.sourceFiles).some(file => !files.some(prepared => prepared.path === `lib/${file}`))) throw new Error('SOURCE_EVIDENCE_PREPARATION_MISMATCH');
  return { canonicalSourceFiles: Object.keys(identity.sourceFiles).length, preparedFiles: files.length, manifestBlobSha: manifest.blobSha, librarySha256: sha256(JSON.stringify(files)) };
}

export function completedBehaviorReport(output) {
  const events = output.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const names = new Map(events.filter(event => event.type === 'testStart').map(event => [event.test.id, event.test.name]));
  const cases = events.filter(event => event.type === 'testDone' && !event.hidden).map(event => ({ name: names.get(event.testID), result: event.result, skipped: event.skipped }));
  if (!events.some(event => event.type === 'done' && event.success === true) || cases.some(value => value.result !== 'success' || value.skipped) || !requiredBehaviorCases.every(name => cases.some(value => value.name === name))) throw new Error('SOURCE_EVIDENCE_BEHAVIOR_INCOMPLETE');
  return { suites: contractSuites, cases, reportSha256: sha256(output) };
}

export function rejectedMutationReport(output, mutation) {
  const events = output.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const target = events.find(event => event.type === 'testStart' && event.test.name === mutation.testName)?.test.id;
  if (target === undefined || !events.some(event => event.type === 'done' && event.success === false) || !events.some(event => event.type === 'testDone' && event.testID === target && event.result === 'failure' && event.skipped === false) || !events.some(event => event.type === 'error' && event.testID === target && event.isFailure === true && typeof event.error === 'string' && event.error.includes('Expected:'))) throw new Error(`SOURCE_EVIDENCE_MUTATION_NOT_DEMONSTRATED:${mutation.id}`);
  return { id: mutation.id, file: mutation.file, testName: mutation.testName, rejected: true, reportSha256: sha256(output) };
}

export function assertSourceSnapshotUnchanged(identity) {
  if (git(['rev-parse', 'HEAD']) !== identity.headSha) throw new Error('SOURCE_EVIDENCE_HEAD_CHANGED');
  if (git(['diff', '--name-only', identity.headSha, '--'])) throw new Error('SOURCE_EVIDENCE_CHECKOUT_CHANGED');
  if (git(['ls-files', '--others', '--', 'lib/generated/api_client', 'pubspec_overrides.yaml', ...recipePaths])) throw new Error('SOURCE_EVIDENCE_UNTRACKED_INPUT');
  if (!isDeepStrictEqual(localDartIdentity(identity.headSha), identity)) throw new Error('SOURCE_EVIDENCE_IDENTITY_MISMATCH');
}

function readInputBundle(receipt) {
  for (const prefix of ['.artifacts', '.artifacts/canonical-sdk-contract', inputBundlePath]) {
    const entry = fs.lstatSync(prefix, { throwIfNoEntry: false });
    if (!entry || entry.isSymbolicLink() || !(prefix === inputBundlePath ? entry.isFile() : entry.isDirectory())) throw new Error('SOURCE_EVIDENCE_INPUT_BUNDLE_REQUIRED');
    if (prefix === inputBundlePath && entry.size > 16 * 1024 * 1024) throw new Error('SOURCE_EVIDENCE_INPUT_BUNDLE_LIMIT');
  }
  const raw = fs.readFileSync(inputBundlePath, 'utf8');
  if (sha256(raw) !== receipt.inputBundleSha256) throw new Error('SOURCE_EVIDENCE_INPUT_BUNDLE_MISMATCH');
  const bundle = JSON.parse(raw);
  if (bundle.schemaVersion !== inputBundleSchema || bundle.headSha !== receipt.identity.headSha || bundle.provenance !== 'unattested-local') throw new Error('SOURCE_EVIDENCE_INPUT_BUNDLE_IDENTITY_MISMATCH');
  return bundle;
}

function validateToolchain(bundle, receipt, identity) {
  const toolchain = bundle.toolchain;
  if (!toolchain || typeof toolchain.manifest !== 'string' || typeof toolchain.lock !== 'string' || typeof toolchain.graph !== 'string' || sha256(toolchain.lock) !== receipt.toolchainLockSha256) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
  const expected = parse(git(['show', `${identity.headSha}:${identity.canonicalManifest}`]));
  expected.dependencies = Object.fromEntries(identity.dependencies.map(value => [value.name, value.version]));
  expected.dev_dependencies.build_runner = '2.16.1';
  expected.dev_dependencies.analyzer = '14.4.0';
  const lock = parse(toolchain.lock);
  const graph = JSON.parse(toolchain.graph);
  if (!isDeepStrictEqual(parse(toolchain.manifest), expected) || graph.root !== identity.packageName || !Array.isArray(graph.packages) || graph.packages.length > 2000) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
  const nodes = new Map(graph.packages.map(value => [value.name, value]));
  const lockedNames = Object.keys(lock.packages ?? {}).sort();
  if (nodes.size !== graph.packages.length || !isDeepStrictEqual([...nodes.keys()].filter(name => name !== graph.root).sort(), lockedNames)) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
  for (const name of lockedNames) {
    const node = nodes.get(name);
    const entry = lock.packages[name];
    if (entry.source !== 'hosted' || typeof entry.version !== 'string' || !/^[a-f0-9]{64}$/.test(entry.description?.sha256 ?? '') || node.version !== entry.version || node.source !== 'hosted' || !Array.isArray(node.dependencies) || node.dependencies.some(dependency => !nodes.has(dependency))) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
  }
  for (const [name, constraint] of Object.entries({ ...expected.dependencies, ...expected.dev_dependencies })) {
    if (!lockedVersionSatisfies(constraint, lock.packages[name]?.version)) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
  }
  const root = nodes.get(graph.root);
  const direct = Object.keys({ ...expected.dependencies, ...expected.dev_dependencies }).sort();
  if (!root || root.source !== 'root' || !Array.isArray(root.dependencies) || !isDeepStrictEqual([...root.dependencies].sort(), direct)) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
  const flutter = JSON.parse(git(['show', `${identity.headSha}:.fvmrc`])).flutter;
  if (toolchain.flutter?.frameworkVersion !== flutter || toolchain.flutter.channel !== 'stable' || typeof toolchain.flutter.dartSdkVersion !== 'string' || !lockedVersionSatisfies(parse(git(['show', `${identity.headSha}:pubspec.lock`])).sdks.dart, toolchain.flutter.dartSdkVersion)) throw new Error('SOURCE_EVIDENCE_TOOLCHAIN_MISMATCH');
}

export function validateLocalDartReceiptEvidence(receipt, identity, preparation) {
  if (identity.packageName !== 'lythaus_api_client' || identity.localPath !== 'build/api_client' || identity.canonicalManifest !== 'lib/generated/api_client/pubspec.yaml') throw new Error('CANONICAL_DART_PACKAGE_IDENTITY_REQUIRED');
  if (!receipt || receipt.schemaVersion !== evidenceSchema) throw new Error('SOURCE_EVIDENCE_RECEIPT_REQUIRED');
  if (receipt.identity?.headSha !== identity.headSha) throw new Error('SOURCE_EVIDENCE_STALE_RECEIPT');
  if (!isDeepStrictEqual(receipt.identity, identity)) throw new Error('SOURCE_EVIDENCE_IDENTITY_MISMATCH');
  if (!isDeepStrictEqual(receipt.preparation, preparation)) throw new Error('SOURCE_EVIDENCE_PREPARATION_MISMATCH');
  if (receipt.verification !== 'behavior-verified' || !isDeepStrictEqual(receipt.behavior?.suites, contractSuites) || !requiredBehaviorCases.every(name => receipt.behavior.cases?.some(value => value.name === name && value.result === 'success' && value.skipped === false)) || receipt.behavior.cases.some(value => value.result !== 'success' || value.skipped) || !/^[a-f0-9]{64}$/.test(receipt.behavior.reportSha256 ?? '')) throw new Error('SOURCE_EVIDENCE_BEHAVIOR_INCOMPLETE');
  if (!sourceMutations.every(mutation => receipt.mutations?.some(value => value.id === mutation.id && value.file === mutation.file && value.testName === mutation.testName && value.rejected === true && /^[a-f0-9]{64}$/.test(value.reportSha256 ?? '')))) throw new Error('SOURCE_EVIDENCE_MUTATION_INCOMPLETE');
  if (receipt.nativeIndexing !== 'NOT_CLAIMED' || receipt.fixtures !== 'synthetic-only' || !/^[a-f0-9]{64}$/.test(receipt.toolchainLockSha256 ?? '')) throw new Error('SOURCE_EVIDENCE_SCOPE_OR_TOOLCHAIN_MISSING');
  if (!Array.isArray(receipt.runtimePackages)) throw new Error('SOURCE_EVIDENCE_RUNTIME_GRAPH_REQUIRED');
  const bundle = readInputBundle(receipt);
  if (bundle.baseline?.exitCode !== 0 || typeof bundle.baseline.stdout !== 'string' || !isDeepStrictEqual(completedBehaviorReport(bundle.baseline.stdout), receipt.behavior)) throw new Error('SOURCE_EVIDENCE_BEHAVIOR_TRACE_MISMATCH');
  if (!Array.isArray(bundle.mutations) || bundle.mutations.length !== sourceMutations.length || receipt.mutations.length !== sourceMutations.length) throw new Error('SOURCE_EVIDENCE_MUTATION_INCOMPLETE');
  for (const mutation of sourceMutations) {
    const raw = bundle.mutations.find(value => value.id === mutation.id);
    if (!raw || !Number.isInteger(raw.exitCode) || raw.exitCode <= 0 || typeof raw.stdout !== 'string' || !isDeepStrictEqual(rejectedMutationReport(raw.stdout, mutation), receipt.mutations.find(value => value.id === mutation.id))) throw new Error('SOURCE_EVIDENCE_MUTATION_TRACE_MISMATCH');
  }
  const rootLock = parse(git(['show', `${identity.headSha}:pubspec.lock`]));
  if (typeof bundle.runtimeGraph !== 'string') throw new Error('SOURCE_EVIDENCE_RUNTIME_GRAPH_REQUIRED');
  const graph = JSON.parse(bundle.runtimeGraph);
  const sdk = graph.packages?.find(value => value.name === identity.packageName);
  if (graph.root !== parse(git(['show', `${identity.headSha}:pubspec.yaml`])).name || sdk?.source !== 'path' || sdk.version !== identity.version || !Array.isArray(sdk.dependencies) || !isDeepStrictEqual([...sdk.dependencies].sort(), identity.dependencies.map(value => value.name).sort())) throw new Error('SOURCE_EVIDENCE_RUNTIME_GRAPH_REQUIRED');
  const runtime = lockedRuntimePackages(graph, rootLock, rootLock, identity.dependencies);
  if (!isDeepStrictEqual(runtime, receipt.runtimePackages)) throw new Error('SOURCE_EVIDENCE_RUNTIME_LOCK_MISMATCH');
  validateToolchain(bundle, receipt, identity);
  return { sourceVerification: 'LOCAL_CONSISTENCY_ONLY', coverageEligible: false, nativeIndexing: 'NOT_CLAIMED', packageName: identity.packageName, version: identity.version };
}

export function verifyLocalDartReceipt(receipt, identity, preparation) {
  validateLocalDartReceiptEvidence(receipt, identity, preparation);
  const approvedClassification = localDartClassification(identity);
  if (!approvedClassification || approvedClassification.state !== 'approved' || approvedClassification.packageName !== 'lythaus_api_client' || approvedClassification.ownership !== 'Lythaus-first-party' || !approvedClassification.licenseExpression || !approvedClassification.approvalEvidenceRef || !isDeepStrictEqual(receipt.classification, approvedClassification)) throw new Error('OWNER_LICENSE_CLASSIFICATION_REQUIRED');
  throw new Error('SOURCE_EVIDENCE_TRUSTED_PRODUCER_REQUIRED');
}
