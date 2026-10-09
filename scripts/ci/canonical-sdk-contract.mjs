import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { resolvedDependencies } from './dependency-review-native.mjs';

export const sdkPath = 'lib/generated/api_client';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const blobSha = value => createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
export const suites = ['privacy_status_serialization_test.dart', 'community_appeal_serialization_test.dart', 'admin_mutation_admission_test.dart', 'support_feedback_serialization_test.dart', 'activity_measurement_serialization_test.dart', 'monthly_rewards_preparation_serialization_test.dart', 'canonical_local_package_behavior_test.dart'];
export const requiredCases = ['generated clients retain own-member paths and bearer auth without selectors', 'canonical SDK rejects unauthorized monthly replies without returning authority', 'canonical SDK rejects forbidden monthly replies without retry', 'canonical SDK refuses malformed monthly authority', 'canonical SDK cancels a request before transport', 'canonical SDK preserves CSV bytes and private response headers'];
export const mutations = [
  { id: 'bearer-header-omission', file: 'lib/src/auth/bearer_auth.dart', before: "options.headers['Authorization'] = 'Bearer ${token}';", after: "options.headers.remove('Authorization');", testName: requiredCases[0] },
  { id: 'monthly-own-route-change', file: 'lib/src/api/rewards_api.dart', before: "r'/rewards/me/monthly'", after: "r'/rewards/synthetic-other/monthly'", testName: requiredCases[0] },
];

export function exactSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value) || /^0+$/.test(value)) throw new Error('EXACT_GIT_SHA_REQUIRED');
  return value;
}

export function git(repository, args, binary = false) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: binary ? null : 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function gitFiles(repository, revision, paths) {
  exactSha(revision);
  if (git(repository, ['rev-parse', `${revision}^{commit}`]).trim() !== revision) throw new Error('EXACT_COMMIT_REQUIRED');
  const entries = git(repository, ['ls-tree', '-r', '-z', revision, '--', ...paths]).split('\0').filter(Boolean);
  if (!entries.length || entries.length > 10000) throw new Error('GIT_INPUT_FILE_LIMIT');
  return entries.map(entry => {
    const [metadata, path] = entry.split('\t');
    if (!metadata.startsWith('100644 blob ') || !/^[a-zA-Z0-9_./@+-]+$/.test(path) || path.split('/').includes('..')) throw new Error('NON_REGULAR_GIT_INPUT');
    return { path, blob: metadata.split(' ')[2] };
  });
}

export function projectGit(repository, revision, paths, destination) {
  const files = gitFiles(repository, revision, paths);
  let bytes = 0;
  for (const file of files) {
    const data = git(repository, ['cat-file', 'blob', file.blob], true);
    bytes += data.length;
    if (data.length > 4 * 1024 * 1024 || bytes > 64 * 1024 * 1024) throw new Error('GIT_INPUT_BYTE_LIMIT');
    if (blobSha(data) !== file.blob) throw new Error('GIT_INPUT_HASH_MISMATCH');
    fs.mkdirSync(join(destination, file.path, '..'), { recursive: true });
    fs.writeFileSync(join(destination, file.path), data, { flag: 'wx', mode: 0o644 });
  }
  return files;
}

export function readRegular(file, limit = 4 * 1024 * 1024) {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw new Error('REGULAR_BOUNDED_OUTPUT_REQUIRED');
    const result = fs.readFileSync(descriptor);
    if (result.length !== stat.size) throw new Error('OUTPUT_CHANGED_DURING_READ');
    return result;
  } finally { fs.closeSync(descriptor); }
}

export function inventory(directory) {
  const files = [];
  let bytes = 0;
  function visit(relative) {
    const absolute = join(directory, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('OUTPUT_SYMLINK_REJECTED');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(join(relative, name));
    } else {
      if (files.length >= 2000) throw new Error('OUTPUT_FILE_LIMIT');
      const data = readRegular(absolute);
      bytes += data.length;
      if (bytes > 64 * 1024 * 1024) throw new Error('OUTPUT_BYTE_LIMIT');
      files.push({ path: relative, blob: blobSha(data), sha256: sha256(data) });
    }
  }
  visit('');
  return files;
}

export function candidateIdentity(repository, revision) {
  const original = process.cwd();
  let dependencies;
  try {
    process.chdir(repository);
    dependencies = resolvedDependencies('pubspec.lock', git(repository, ['show', `${exactSha(revision)}:pubspec.lock`]), { revision });
  } finally { process.chdir(original); }
  const sdk = dependencies.find(value => value.name === 'lythaus_api_client');
  if (!sdk || sdk.source !== 'path') throw new Error('CANONICAL_LOCAL_PACKAGE_REQUIRED');
  const files = gitFiles(repository, revision, [sdkPath]);
  const sourceTreeSha = git(repository, ['rev-parse', `${revision}:${sdkPath}/lib`]).trim();
  const manifest = parse(git(repository, ['show', `${revision}:${sdkPath}/pubspec.yaml`]));
  const rootLock = parse(git(repository, ['show', `${revision}:pubspec.lock`]));
  return { candidateSha: revision, ...sdk, sourceTreeSha, files, manifest, rootLock, directDependencies: Object.keys(manifest.dependencies).sort() };
}

export function validateRuntimeGraph(graph, lock, identity) {
  if (!graph || !Array.isArray(graph.packages) || graph.packages.length > 2000) throw new Error('RUNTIME_GRAPH_REQUIRED');
  const nodes = new Map(graph.packages.map(value => [value.name, value]));
  if (nodes.size !== graph.packages.length) throw new Error('DUPLICATE_RUNTIME_NODE');
  const sdk = nodes.get(identity.name);
  if (!sdk || sdk.version !== identity.version || sdk.source !== 'path' || !isDeepStrictEqual([...sdk.dependencies].sort(), identity.directDependencies)) throw new Error('RUNTIME_SDK_GRAPH_MISMATCH');
  const pending = [...sdk.dependencies], seen = new Set(), verified = [];
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const node = nodes.get(name), entry = lock.packages?.[name];
    if (!node || !Array.isArray(node.dependencies) || entry?.source !== 'hosted' || node.source !== 'hosted' || node.version !== entry.version || !/^[a-f0-9]{64}$/.test(entry.description?.sha256 ?? '')) throw new Error(`RUNTIME_CLOSURE_MISMATCH:${name}`);
    verified.push({ name, version: entry.version, integrity: entry.description.sha256, dependencies: node.dependencies });
    pending.push(...node.dependencies);
  }
  return verified.sort((a, b) => a.name.localeCompare(b.name));
}

export function validateFrozenGraph(graph, lock, manifest) {
  if (graph?.root !== manifest.name || !Array.isArray(graph.packages) || graph.packages.length > 2000) throw new Error('FROZEN_GRAPH_ROOT_MISMATCH');
  const nodes = new Map(graph.packages.map(value => [value.name, value]));
  const expectedNames = Object.keys(lock.packages).sort();
  if (nodes.size !== graph.packages.length || !isDeepStrictEqual([...nodes.keys()].filter(name => name !== manifest.name).sort(), expectedNames)) throw new Error('FROZEN_GRAPH_NODE_MISMATCH');
  for (const name of expectedNames) {
    const node = nodes.get(name), entry = lock.packages[name];
    if (node.source !== entry.source || node.version !== entry.version || !Array.isArray(node.dependencies) || node.dependencies.some(dependency => !nodes.has(dependency))) throw new Error('FROZEN_GRAPH_EDGE_MISMATCH');
  }
  const root = nodes.get(manifest.name);
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.dev_dependencies }).sort();
  if (root?.source !== 'root' || !Array.isArray(root.dependencies) || !isDeepStrictEqual([...root.dependencies].sort(), dependencies)) throw new Error('FROZEN_GRAPH_DIRECT_DEPENDENCIES_MISMATCH');
  return { root: manifest.name, nodes: nodes.size, lockedPackages: expectedNames.length };
}

function reportEvents(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 8 * 1024 * 1024) throw new Error('BEHAVIOR_REPORT_LIMIT');
  const events = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
  if (events.length > 10000 || events.filter(value => value.type === 'done').length !== 1) throw new Error('BEHAVIOR_REPORT_INVALID');
  return events;
}

export function completedBehavior(output, expectedNames) {
  const events = reportEvents(output);
  const starts = events.filter(value => value.type === 'testStart');
  const names = new Map(starts.map(value => [value.test.id, value.test.name]));
  if (names.size !== starts.length) throw new Error('DUPLICATE_BEHAVIOR_TEST');
  const cases = events.filter(value => value.type === 'testDone' && !value.hidden).map(value => ({ name: names.get(value.testID), result: value.result, skipped: value.skipped }));
  if (!events.some(value => value.type === 'done' && value.success === true) || cases.some(value => value.result !== 'success' || value.skipped !== false) || !requiredCases.every(name => cases.some(value => value.name === name)) || (expectedNames && !isDeepStrictEqual(cases.map(value => value.name).sort(), [...expectedNames].sort()))) throw new Error('BEHAVIOR_INCOMPLETE');
  return { suites, cases, reportSha256: sha256(output) };
}

export function rejectedMutation(output, mutation) {
  const events = reportEvents(output);
  const targets = events.filter(value => value.type === 'testStart' && value.test.name === mutation.testName);
  if (targets.length !== 1) throw new Error('MUTATION_ASSERTION_REQUIRED');
  const id = targets[0].test.id;
  if (!events.some(value => value.type === 'done' && value.success === false) || !events.some(value => value.type === 'testDone' && value.testID === id && value.result === 'failure' && value.skipped === false) || !events.some(value => value.type === 'error' && value.testID === id && value.isFailure === true && value.error?.includes('Expected:'))) throw new Error('MUTATION_ASSERTION_REQUIRED');
  return { id: mutation.id, rejected: true, reportSha256: sha256(output) };
}

export function coverageLedger(expected, missing, snapshotWarnings = false) {
  const canonical = value => value.ecosystem === 'pub' && value.name === 'lythaus_api_client' && value.manifest === 'pubspec.lock' && value.source === 'path' && value.localPath === 'build/api_client' && value.canonicalManifest === `${sdkPath}/pubspec.yaml`;
  const sourceRequired = expected.filter(canonical);
  const nativeMissing = missing.filter(value => !canonical(value));
  return { sourceRequired, nativeMissing, rawNativeCoverage: snapshotWarnings || missing.length ? 'INCOMPLETE_INDEXING_OR_UNRECOGNIZED_MANIFEST' : 'COMPLETE', nativeRequiredCoverage: snapshotWarnings || nativeMissing.length ? 'INCOMPLETE' : 'COMPLETE', nativeIndexing: sourceRequired.length ? 'NOT_CLAIMED' : 'NOT_APPLICABLE' };
}

export function aggregateReview(comparison, source, outcomes) {
  const ledger = coverageLedger(comparison.expected ?? [], comparison.missing ?? [], comparison.snapshotWarnings);
  const comparisonValid = comparison.reason === 'NATIVE_API_AVAILABLE' && /^[a-f0-9]{40}$/.test(comparison.baseSha ?? '') && /^[a-f0-9]{40}$/.test(comparison.reviewedHeadSha ?? '') && comparison.baseSha !== comparison.reviewedHeadSha && Array.isArray(comparison.expected) && Array.isArray(comparison.missing) && typeof comparison.snapshotWarnings === 'boolean';
  const sourceEligible = !ledger.sourceRequired.length || (source?.coverageEligible === true && source.candidateSha === comparison.reviewedHeadSha && /^[a-f0-9]{40}$/.test(source.verifierSha ?? '') && source.verifierSha !== source.candidateSha && /^[a-f0-9]{40}$/.test(source.sourceTreeSha ?? '') && ledger.sourceRequired.every(value => source.packageName === value.name && source.version === value.version && source.localPath === value.localPath) && source.nativeIndexing === 'NOT_CLAIMED' && source.classification === 'approved' && source.verification === 'fresh-isolated-source-verification');
  return { ...ledger, comparisonValid, sourceEligible, conclusion: comparisonValid && ledger.nativeRequiredCoverage === 'COMPLETE' && sourceEligible && outcomes.native === 'success' && outcomes.licenses === 'success' ? 'success' : 'failure' };
}

export function approvedLicenseClassification(identity, ownerRecord, runtimeRecord, archiveEvidence) {
  const manifestBlob = identity.files.find(value => value.path === `${sdkPath}/pubspec.yaml`)?.blob;
  if (ownerRecord?.state !== 'approved' || ownerRecord.ownership !== 'Lythaus-first-party' || ownerRecord.packageName !== identity.name || ownerRecord.version !== identity.version || ownerRecord.sourceTreeSha !== identity.sourceTreeSha || ownerRecord.canonicalManifestBlobSha !== manifestBlob || typeof ownerRecord.approvalEvidenceRef !== 'string' || !ownerRecord.approvalEvidenceRef || typeof ownerRecord.licenseExpression !== 'string' || !ownerRecord.licenseExpression || !/^[a-zA-Z0-9_./-]+$/.test(ownerRecord.licenseEvidencePath ?? '') || ownerRecord.licenseEvidencePath.split('/').includes('..') || !/^[a-f0-9]{40}$/.test(ownerRecord.licenseEvidenceBlobSha ?? '')) return { state: 'unapproved', reason: 'OWNER_LICENSE_CLASSIFICATION_REQUIRED' };
  if (/(?:A?GPL)-3\.0/i.test(ownerRecord.licenseExpression)) throw new Error('FIRST_PARTY_LICENSE_POLICY_FAILURE');
  if (runtimeRecord?.state !== 'approved' || !Array.isArray(runtimeRecord.packages)) return { state: 'unapproved', reason: 'HOSTED_RUNTIME_LICENSE_EVIDENCE_REQUIRED' };
  for (const name of identity.runtimeNames) {
    const entry = identity.rootLock.packages[name];
    const approval = runtimeRecord.packages.find(value => value.name === name && value.version === entry.version);
    const archive = archiveEvidence.find(value => value.name === name && value.version === entry.version);
    if (!approval?.approvalEvidenceRef || approval.archiveSha256 !== entry.description.sha256 || !archive?.licenseFiles.some(value => value.sha256 === approval.licenseSha256) || typeof approval.licenseExpression !== 'string' || !approval.licenseExpression) return { state: 'unapproved', reason: `HOSTED_RUNTIME_LICENSE_EVIDENCE_REQUIRED:${name}` };
    if (/(?:A?GPL)-3\.0/i.test(approval.licenseExpression)) throw new Error('HOSTED_RUNTIME_LICENSE_POLICY_FAILURE');
  }
  return { state: 'approved', ownerRecord, runtimeRecord };
}
