import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { stringify } from 'yaml';
import { coverageLedger, aggregateReview, completedBehavior, rejectedMutation, requiredCases, mutations, readRegular, inventory, projectGit, validateRuntimeGraph, validateFrozenGraph, approvedLicenseClassification } from '../ci/canonical-sdk-contract.mjs';
import { validateTrust, validateRunContext, materializeVerifier, anchoredContext } from '../ci/canonical-sdk-bootstrap.mjs';
import { containerArguments, hostedClosure } from '../ci/canonical-sdk-isolation.mjs';
import { expectedChanges } from '../ci/dependency-review-native.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const sdk = { ecosystem: 'pub', name: 'lythaus_api_client', version: '1.0.0', manifest: 'pubspec.lock', source: 'path', localPath: 'build/api_client', canonicalManifest: 'lib/generated/api_client/pubspec.yaml' };
const hosted = { ecosystem: 'pub', name: 'dio', version: '5.9.0', manifest: 'pubspec.lock', source: 'hosted' };
const comparison = { reason: 'NATIVE_API_AVAILABLE', baseSha: a, reviewedHeadSha: b, expected: [sdk, hosted], missing: [sdk], snapshotWarnings: false };
const source = { coverageEligible: true, packageName: sdk.name, version: sdk.version, localPath: sdk.localPath, sourceTreeSha: a, candidateSha: b, verifierSha: c, nativeIndexing: 'NOT_CLAIMED', classification: 'approved', verification: 'fresh-isolated-source-verification' };
const success = { native: 'success', licenses: 'success' };
const trust = { schemaVersion: 'lythaus-sdk-verifier-trust-v1', state: 'approved', repository: 'AsoraKK/Lythaus', protectedRef: 'refs/heads/main', workflowPath: '.github/workflows/dependency-review.yml', job: 'dependency-review', verifierSha: a, verifierTreeSha: b, workflowBlobSha: c, approvalEvidenceRef: 'synthetic independent review' };
const context = () => ({ environment: { GITHUB_REPOSITORY: trust.repository, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: `${trust.repository}/${trust.workflowPath}@refs/heads/main`, GITHUB_WORKFLOW_SHA: b, GITHUB_REF: trust.protectedRef, GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: trust.job }, workflowBlobSha: c, run: { repository: { full_name: trust.repository }, head_repository: { full_name: trust.repository }, id: 12, run_attempt: 2, event: 'workflow_dispatch', head_branch: 'main', head_sha: b, workflow_id: 7 }, workflow: { id: 7, path: trust.workflowPath }, jobs: [{ name: trust.job, id: 25, run_id: 12, run_attempt: 2, head_sha: b, status: 'in_progress' }] });

test('category accounting keeps raw SDK omission and every other native obligation', () => {
  const ledger = coverageLedger(comparison.expected, comparison.missing);
  assert.equal(ledger.rawNativeCoverage, 'INCOMPLETE_INDEXING_OR_UNRECOGNIZED_MANIFEST');
  assert.equal(ledger.nativeRequiredCoverage, 'COMPLETE');
  assert.equal(ledger.nativeIndexing, 'NOT_CLAIMED');
  assert.deepEqual(ledger.sourceRequired, [sdk]);
  assert.equal(aggregateReview(comparison, source, success).conclusion, 'success');
  for (const other of [hosted, { ...sdk, localPath: '../other' }, { ...sdk, name: 'other' }, { ...sdk, manifest: 'nested/pubspec.lock' }, { ...sdk, ecosystem: 'npm' }, { ...sdk, source: 'git' }]) assert.equal(coverageLedger([other], [other]).nativeRequiredCoverage, 'INCOMPLETE');
});

test('no receipt, stale identity, self-selected verifier, classification and all policy failures block', () => {
  for (const candidate of [null, { ...source, candidateSha: a }, { ...source, verifierSha: b }, { ...source, verifierSha: null }, { ...source, packageName: 'other' }, { ...source, version: '2.0.0' }, { ...source, sourceTreeSha: null }, { ...source, coverageEligible: false }, { ...source, classification: 'unapproved' }, { ...source, nativeIndexing: 'INDEXED' }, { ...source, verification: 'LOCAL_CONSISTENCY_ONLY' }]) assert.equal(aggregateReview(comparison, candidate, success).conclusion, 'failure');
  for (const candidate of [{ ...comparison, reason: 'TOKEN_PERMISSION_DENIED' }, { ...comparison, snapshotWarnings: true }, { ...comparison, missing: [sdk, hosted] }, { ...comparison, baseSha: b }, { ...comparison, reviewedHeadSha: 'main' }, {}]) assert.equal(aggregateReview(candidate, source, success).conclusion, 'failure');
  for (const outcomes of [{ ...success, native: 'failure' }, { ...success, licenses: 'failure' }, { ...success, native: 'skipped' }]) assert.equal(aggregateReview(comparison, source, outcomes).conclusion, 'failure');
});

test('bootstrap rejects unreviewed, incomplete and candidate-selected pins', () => {
  assert.equal(validateTrust(trust, c), trust);
  for (const record of [null, { ...trust, state: 'pending-independent-review' }, { ...trust, verifierSha: 'main' }, { ...trust, verifierTreeSha: null }, { ...trust, workflowBlobSha: null }, { ...trust, approvalEvidenceRef: null }, { ...trust, repository: 'other/repository' }, { ...trust, protectedRef: 'refs/heads/candidate' }, { ...trust, workflowPath: 'fake.yml' }]) assert.throws(() => validateTrust(record, c));
  assert.throws(() => validateTrust(trust, a), /INDEPENDENT_VERIFIER_REQUIRED/);
  assert.throws(() => validateTrust(JSON.parse(fs.readFileSync(new URL('../ci/canonical-sdk-trust.json', import.meta.url))), c), /TRUSTED_VERIFIER_BOOTSTRAP_REQUIRED/);
});

test('run provenance binds repository, workflow Git blob, exact revision, run attempt and actual job', () => {
  assert.equal(validateRunContext(trust, context()).jobId, 25);
  const attacks = [
    value => value.environment.GITHUB_EVENT_NAME = 'pull_request',
    value => value.environment.GITHUB_WORKFLOW_REF = `${trust.repository}/${trust.workflowPath}@refs/heads/candidate`,
    value => value.environment.GITHUB_WORKFLOW_SHA = a,
    value => value.environment.GITHUB_REF = 'refs/heads/candidate',
    value => value.run.repository.full_name = 'other/repository',
    value => value.run.head_repository.full_name = 'fork/repository',
    value => value.run.id = 13,
    value => value.run.run_attempt = 1,
    value => value.run.event = 'pull_request',
    value => value.run.head_branch = 'candidate',
    value => value.workflow.id = 8,
    value => value.workflow.path = 'fake.yml',
    value => value.workflowBlobSha = a,
    value => value.jobs[0].run_id = 13,
    value => value.jobs[0].run_attempt = 1,
    value => value.jobs[0].head_sha = a,
    value => value.jobs[0].status = 'completed',
    value => value.jobs.push({ ...value.jobs[0], id: 26 }),
  ];
  for (const attack of attacks) { const value = context(); attack(value); assert.throws(() => validateRunContext(trust, value)); }
});

const report = events => events.map(value => JSON.stringify(value)).join('\n') + '\n';
const baselineEvents = requiredCases.flatMap((name, id) => [{ type: 'testStart', test: { id, name } }, { type: 'testDone', testID: id, result: 'success', skipped: false, hidden: false }]);
test('behavior requires named successful cases and exactly one completion', () => {
  assert.equal(completedBehavior(report([...baselineEvents, { type: 'done', success: true }])).cases.length, requiredCases.length);
  for (const events of [baselineEvents, [...baselineEvents, { type: 'done', success: false }], [...baselineEvents.slice(2), { type: 'done', success: true }], [...baselineEvents, { type: 'done', success: true }, { type: 'done', success: true }], [...baselineEvents, baselineEvents[0], { type: 'done', success: true }]]) assert.throws(() => completedBehavior(report(events)));
  assert.throws(() => completedBehavior('::set-output name=gate::success\n'));
  assert.throws(() => completedBehavior('x'.repeat(8 * 1024 * 1024 + 1)), /REPORT_LIMIT/);
});

test('mutations need a real named assertion failure, never a compile or process failure', () => {
  const mutation = mutations[0];
  const events = [{ type: 'testStart', test: { id: 1, name: mutation.testName } }, { type: 'error', testID: 1, isFailure: true, error: 'Expected: synthetic bearer header' }, { type: 'testDone', testID: 1, result: 'failure', skipped: false }, { type: 'done', success: false }];
  assert.equal(rejectedMutation(report(events), mutation).rejected, true);
  for (const replace of [value => value[1].isFailure = false, value => value[1].error = 'Compile error', value => value[2].skipped = true, value => value[2].result = 'success', value => value[3].success = true, value => value[0].test.name = 'unrelated']) { const copy = structuredClone(events); replace(copy); assert.throws(() => rejectedMutation(report(copy), mutation)); }
});

test('bounded host reads reject symlink, hardlink, directory, oversized and special outputs', () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-verifier-read-'));
  try {
    const file = join(directory, 'data'); fs.writeFileSync(file, 'synthetic');
    assert.equal(readRegular(file).toString(), 'synthetic');
    fs.symlinkSync(file, join(directory, 'link')); assert.throws(() => readRegular(join(directory, 'link')));
    assert.throws(() => inventory(directory), /SYMLINK/);
    fs.linkSync(file, join(directory, 'hardlink')); assert.throws(() => readRegular(file), /REGULAR_BOUNDED/);
    assert.throws(() => readRegular(directory), /REGULAR_BOUNDED/);
    assert.throws(() => readRegular('/dev/null'), /REGULAR_BOUNDED/);
    fs.writeFileSync(join(directory, 'large'), '12345'); assert.throws(() => readRegular(join(directory, 'large'), 4));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('runtime closure follows all edges and rejects missing or unlocked transitive nodes', () => {
  const entry = name => ({ source: 'hosted', version: '1.0.0', description: { url: 'https://pub.dev', sha256: name.repeat(64) } });
  const lock = { packages: { first: entry('a'), second: entry('b') } };
  const identity = { name: sdk.name, version: '1.0.0', directDependencies: ['first'] };
  const graph = { packages: [{ name: sdk.name, version: '1.0.0', source: 'path', dependencies: ['first'] }, { name: 'first', version: '1.0.0', source: 'hosted', dependencies: ['second'] }, { name: 'second', version: '1.0.0', source: 'hosted', dependencies: [] }] };
  assert.equal(validateRuntimeGraph(graph, lock, identity).length, 2);
  for (const attack of [value => value.packages.pop(), value => value.packages[2].version = '2.0.0', value => value.packages[2].source = 'git', value => value.packages[2].dependencies = ['hidden'], value => value.packages.push(value.packages[2])]) { const copy = structuredClone(graph); attack(copy); assert.throws(() => validateRuntimeGraph(copy, lock, identity)); }
  assert.equal(hostedClosure([lock, lock]).length, 2);
  for (const field of [{ source: 'git' }, { description: { url: 'https://other.invalid', sha256: 'a'.repeat(64) } }, { description: { url: 'https://pub.dev', sha256: 'bad' } }]) assert.throws(() => hostedClosure([{ packages: { first: { ...entry('a'), ...field } } }]));
  assert.throws(() => hostedClosure([lock, { packages: { first: entry('b') } }]), /INTEGRITY_CONFLICT/);
});

test('license approvals bind the SDK source and exact archive/license hashes without assuming MIT', () => {
  const identity = { name: sdk.name, version: sdk.version, sourceTreeSha: a, files: [{ path: 'lib/generated/api_client/pubspec.yaml', blob: b }], rootLock: { packages: { dio: { version: '5.9.0', description: { sha256: 'd'.repeat(64) } } } }, runtimeNames: ['dio'] };
  const owner = { state: 'approved', ownership: 'Lythaus-first-party', packageName: sdk.name, version: sdk.version, sourceTreeSha: a, canonicalManifestBlobSha: b, approvalEvidenceRef: 'synthetic owner decision', licenseExpression: 'LicenseRef-Synthetic', licenseEvidencePath: 'LICENSE', licenseEvidenceBlobSha: c };
  const runtime = { state: 'approved', packages: [{ name: 'dio', version: '5.9.0', archiveSha256: 'd'.repeat(64), licenseSha256: 'e'.repeat(64), licenseExpression: 'BSD-3-Clause', approvalEvidenceRef: 'synthetic archive review' }] };
  const archives = [{ name: 'dio', version: '5.9.0', licenseFiles: [{ path: 'LICENSE', sha256: 'e'.repeat(64) }] }];
  assert.equal(approvedLicenseClassification(identity, owner, runtime, archives).state, 'approved');
  for (const record of [null, { ...owner, sourceTreeSha: b }, { ...owner, canonicalManifestBlobSha: a }, { ...owner, approvalEvidenceRef: '' }]) assert.equal(approvedLicenseClassification(identity, record, runtime, archives).state, 'unapproved');
  for (const record of [null, { ...runtime, state: 'pending' }, { state: 'approved', packages: [] }]) assert.equal(approvedLicenseClassification(identity, owner, record, archives).state, 'unapproved');
  assert.equal(approvedLicenseClassification(identity, owner, runtime, []).state, 'unapproved');
  assert.throws(() => approvedLicenseClassification(identity, { ...owner, licenseExpression: 'AGPL-3.0-only' }, runtime, archives), /POLICY_FAILURE/);
});

test('frozen app and generator graphs require every lock node, root and dependency edge', () => {
  const manifest = { name: 'synthetic', dependencies: { first: '^1.0.0' }, dev_dependencies: { second: '^2.0.0' } };
  const lock = { packages: { first: { source: 'hosted', version: '1.0.0' }, second: { source: 'hosted', version: '2.0.0' } } };
  const graph = { root: 'synthetic', packages: [{ name: 'synthetic', source: 'root', dependencies: ['first', 'second'] }, { name: 'first', source: 'hosted', version: '1.0.0', dependencies: [] }, { name: 'second', source: 'hosted', version: '2.0.0', dependencies: ['first'] }] };
  assert.equal(validateFrozenGraph(graph, lock, manifest).lockedPackages, 2);
  for (const attack of [value => value.root = 'other', value => value.packages.pop(), value => value.packages[2] = value.packages[1], value => value.packages[2].dependencies = ['hidden'], value => value.packages[2].version = '2.1.0', value => value.packages[0].dependencies.pop()]) { const copy = structuredClone(graph); attack(copy); assert.throws(() => validateFrozenGraph(copy, lock, manifest)); }
});

test('exact Git data ignores checkout edits and same-version SDK changes stay expected', () => {
  const original = process.cwd(), directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-verifier-git-'));
  const write = (path, data) => { fs.mkdirSync(join(directory, path, '..'), { recursive: true }); fs.writeFileSync(join(directory, path), typeof data === 'string' ? data : stringify(data)); };
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=Synthetic verifier', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic fixture'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q');
    write('pubspec.yaml', { name: 'synthetic', dependencies: { lythaus_api_client: { path: 'build/api_client' } } });
    write('pubspec.lock', { packages: { lythaus_api_client: { dependency: 'direct main', source: 'path', version: '1.0.0', description: { path: 'build/api_client', relative: true } }, dio: { source: 'hosted', version: '5.9.0' } } });
    write('lib/generated/api_client/pubspec.yaml', { name: sdk.name, version: sdk.version, dependencies: { dio: '^5.2.0' } });
    write('lib/generated/api_client/lib/data.dart', 'const synthetic = 1;\n');
    const base = commit(); write('lib/generated/api_client/lib/data.dart', 'const synthetic = 2;\n'); const head = commit();
    write('lib/generated/api_client/lib/data.dart', 'uncommitted ignored data');
    process.chdir(directory);
    assert.deepEqual(expectedChanges(base, head), [{ ...sdk, relationship: 'direct', sourceChanged: true }]);
    const projection = join(directory, 'projection'); projectGit(directory, head, ['lib/generated/api_client'], projection);
    assert.equal(fs.readFileSync(join(projection, 'lib/generated/api_client/lib/data.dart'), 'utf8'), 'const synthetic = 2;\n');
    assert.throws(() => projectGit(directory, 'HEAD', ['lib/generated/api_client'], join(directory, 'bad')));
    write('linked-target', 'synthetic'); fs.symlinkSync('../linked-target', join(directory, 'unsafe')); const unsafe = commit();
    assert.throws(() => projectGit(directory, unsafe, ['unsafe'], join(directory, 'bad')), /NON_REGULAR/);
  } finally { process.chdir(original); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('container arguments isolate candidate code from environment, gates, credentials and host processes', () => {
  const options = { tools: { flutter: '/tmp/tools/flutter', node: '/tmp/tools/node', java: '/tmp/tools/java', generator: '/tmp/tools/generator.jar' }, inputs: '/tmp/inputs', work: '/tmp/work', recipe: '/tmp/isolated-recipe', npm: '/tmp/npm', cache: '/tmp/cache', fixtureDirectory: '/tmp/fixtures', command: ['-e', 'process.stdout.write("synthetic")'], user: '1000:1000', name: 'synthetic-isolation' };
  const args = containerArguments(options);
  assert.ok(args.includes('none') && args.includes('--read-only') && args.includes('ALL') && args.includes('no-new-privileges'));
  assert.ok(!args.some(value => /docker.sock|GITHUB_|--privileged|--pid=|\.git/.test(value)));
  assert.ok(!args.includes('--pid'));
  assert.ok(args.includes('-i'));
  assert.throws(() => containerArguments({ ...options, user: '0:0' }));
  assert.throws(() => containerArguments({ ...options, user: '1000:1000 --privileged' }));
});

test('candidate stdout is never forwarded into GitHub workflow command channels', () => {
  const runner = fs.readFileSync(new URL('../ci/canonical-sdk-isolation.mjs', import.meta.url), 'utf8');
  assert.ok(!runner.includes('process.stdout.write(baseline.stdout)'));
  assert.ok(!runner.includes('stdio: \'inherit\''));
  assert.ok(!runner.includes('monthly-rewards-preparation-wire.mjs'));
});

test('serialized bootstrap binds real Git objects and materializes pinned recipe/npm closure', async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-bootstrap-'));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, data) => { fs.mkdirSync(join(directory, path, '..'), { recursive: true }); fs.writeFileSync(join(directory, path), data); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Synthetic verifier', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic bootstrap'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q');
    write('package.json', JSON.stringify({ workspaces: ['packages/synthetic'] }));
    write('package-lock.json', '{"lockfileVersion":3}');
    write('packages/synthetic/package.json', '{"name":"synthetic"}');
    write('.github/workflows/dependency-review.yml', 'name: synthetic trusted workflow\n');
    write('.github/actions/flutter-setup/action.yml', 'name: synthetic trusted setup\n');
    write('scripts/ci/canonical-sdk-isolation.mjs', 'export const synthetic = true;\n');
    write('scripts/ci/sdk-verifier/prepare.mjs', 'synthetic recipe\n');
    write('tools/openapi/spectral-glob/package.json', '{"name":"synthetic-glob"}');
    write('unrelated.txt', 'excluded candidate data');
    const verifierSha = commit();
    const approved = { ...trust, verifierSha, verifierTreeSha: git('rev-parse', `${verifierSha}^{tree}`), workflowBlobSha: git('rev-parse', `${verifierSha}:.github/workflows/dependency-review.yml`) };
    write('scripts/ci/canonical-sdk-trust.json', JSON.stringify(approved)); const anchorSha = commit();
    const value = context();
    value.run.head_sha = anchorSha; value.jobs[0].head_sha = anchorSha; value.environment.GITHUB_WORKFLOW_SHA = anchorSha; value.environment.HEAD_SHA = c;
    const requests = [], fetched = [];
    const request = async path => {
      requests.push(path);
      if (path === 'git/ref/heads/main') return { ref: 'refs/heads/main', object: { sha: anchorSha } };
      if (path === 'actions/runs/12') return value.run;
      if (path === 'actions/workflows/7') return value.workflow;
      if (path.startsWith('actions/runs/12/attempts/2/jobs?')) return { jobs: value.jobs, total_count: 1 };
      throw new Error('unexpected synthetic API request');
    };
    const bound = await anchoredContext(directory, directory, { request, fetchRevision: sha => fetched.push(sha), environment: value.environment });
    assert.equal(bound.verifierSha, verifierSha); assert.equal(bound.anchorSha, anchorSha); assert.equal(bound.jobId, 25);
    assert.deepEqual(fetched, [verifierSha, anchorSha]); assert.equal(requests.length, 4);
    const materialized = join(directory, 'materialized');
    const files = materializeVerifier(directory, bound, materialized);
    for (const path of ['package.json', 'package-lock.json', 'packages/synthetic/package.json', '.github/actions/flutter-setup/action.yml', 'scripts/ci/canonical-sdk-isolation.mjs', 'scripts/ci/sdk-verifier/prepare.mjs', 'tools/openapi/spectral-glob/package.json']) assert.ok(files.some(file => file.path === path));
    assert.ok(!fs.existsSync(join(materialized, 'unrelated.txt')));
    await assert.rejects(anchoredContext(directory, directory, { request: async () => ({ ref: 'refs/heads/main', object: { sha: a } }), environment: value.environment }), /PROTECTED_MAIN_ANCHOR_MISMATCH/);
    assert.throws(() => materializeVerifier(directory, { verifierSha: 'main' }, join(directory, 'invalid')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
