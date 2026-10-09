import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { withOwnedContainers } from './canonical-sdk-containers.mjs';
import { candidateIdentity, projectGit, gitFiles, inventory, readRegular, sha256, suites, mutations, completedBehavior, rejectedMutation, validateRuntimeGraph, validateFrozenGraph, approvedLicenseClassification } from './canonical-sdk-contract.mjs';

export const isolationImage = 'postgres@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f';
export const generatorHash = '3a757276c31d249a4f06a14651b1ff1f1a5cf46e110a70adcc4a6a2834f85561';
const mount = (source, target, readOnly = true) => ['--mount', `type=bind,source=${resolve(source)},target=${target}${readOnly ? ',readonly' : ''}`];

export function containerArguments({ tools, inputs, work, recipe, npm, cache, fixtureDirectory, command, user, name }) {
  if (!/^\d+:\d+$/.test(user) || user.split(':')[0] === '0') throw new Error('NONPRIVILEGED_CONTAINER_USER_REQUIRED');
  const args = ['run', '--rm', '--name', name, '--network', 'none', '--read-only', '--user', user, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '4g', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m', '--tmpfs', '/pub-cache:rw,nosuid,nodev,size=512m,mode=1777', '--workdir', '/work', ...mount(tools.flutter, '/tools/flutter'), ...mount(tools.node, '/tools/node'), ...mount(tools.java, '/tools/java'), ...mount(tools.generator, '/tools/generator.jar'), ...mount(recipe, '/recipe'), ...mount(inputs, '/inputs'), ...mount(join(cache, 'hosted'), '/pub-cache/hosted'), ...mount(join(cache, 'hosted-hashes'), '/pub-cache/hosted-hashes'), ...mount(work, '/work', false)];
  if (npm) args.push(...mount(npm, '/recipe/node_modules'));
  if (fixtureDirectory) args.push(...mount(fixtureDirectory, '/work/test'));
  args.push('--entrypoint', '/usr/bin/env', isolationImage, '-i', 'PATH=/tools/node/bin:/tools/flutter/bin/cache/dart-sdk/bin:/tools/java/bin:/usr/bin:/bin', 'LANG=C.UTF-8', 'TZ=UTC', 'HOME=/tmp/lythaus-sdk-home', 'CI=true', 'FLUTTER_ROOT=/tools/flutter', 'PUB_CACHE=/pub-cache', 'LYTHAUS_ADMIN_MUTATION_GUARD=/recipe/scripts/ci/sdk-verifier/admin-mutation-sdk-guard.mjs', '/tools/node/bin/node', ...command);
  return args;
}

export function hostedClosure(locks) {
  const packages = new Map();
  for (const lock of locks) for (const [name, entry] of Object.entries(lock.packages ?? {})) {
    if (entry.source === 'sdk' || (name === 'lythaus_api_client' && entry.source === 'path')) continue;
    if (entry.source !== 'hosted' || !/^[a-z_][a-z0-9_]*$/.test(name) || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+(?:[+-][a-zA-Z0-9.]+)?$/.test(entry.version) || entry.description?.url !== 'https://pub.dev' || !/^[a-f0-9]{64}$/.test(entry.description?.sha256 ?? '')) throw new Error(`HOSTED_CLOSURE_UNSUPPORTED:${name}`);
    const key = `${name}@${entry.version}`;
    const record = { name, version: entry.version, integrity: entry.description.sha256 };
    if (packages.has(key) && !isDeepStrictEqual(packages.get(key), record)) throw new Error('HOSTED_CLOSURE_INTEGRITY_CONFLICT');
    packages.set(key, record);
  }
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function compareRegenerated(identity, directory) {
  const actual = inventory(directory).filter(file => file.path !== '.openapi-generator/FILES');
  const expected = identity.files.filter(file => file.path !== 'lib/generated/api_client/.openapi-generator/FILES').map(file => ({ path: file.path.slice('lib/generated/api_client/'.length), blob: file.blob }));
  if (!isDeepStrictEqual(actual.map(({ path, blob }) => ({ path, blob })).sort((a, b) => a.path.localeCompare(b.path)), expected.sort((a, b) => a.path.localeCompare(b.path)))) throw new Error('REGENERATED_SDK_MISMATCH');
  return { comparedFiles: actual.length, inventorySha256: sha256(JSON.stringify(actual)), excludedFile: '.openapi-generator/FILES' };
}

function comparePrepared(identity, directory) {
  const files = inventory(directory);
  for (const original of identity.files.filter(file => file.path.endsWith('/pubspec.yaml') || file.path.startsWith('lib/generated/api_client/lib/'))) {
    const relative = original.path.slice('lib/generated/api_client/'.length);
    if (files.find(file => file.path === relative)?.blob !== original.blob) throw new Error('PREPARED_SDK_SOURCE_MISMATCH');
  }
  return { files: files.length, inventorySha256: sha256(JSON.stringify(files)) };
}

export async function runSourceVerification({ repository, candidateSha, recipe, tools, directory, trustedContext = null, archiveCache = null }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return await withOwnedContainers(directory, async owner => {
    const result = await verifySource({ repository, candidateSha, recipe, tools, directory, trustedContext, archiveCache }, owner);
    return { ...result, containerCleanup: { runId: owner.runId, recordedIds: owner.records.map(record => record.id), complete: owner.records.every(record => record.state === 'removed'), budgetMilliseconds: 30000 } };
  });
}

async function verifySource({ repository, candidateSha, recipe, tools, directory, trustedContext, archiveCache }, owner) {
  const identity = candidateIdentity(repository, candidateSha);
  const inputs = join(directory, 'inputs'), work = join(directory, 'work'), cache = join(directory, 'cache');
  for (const path of [directory, inputs, work, cache]) fs.mkdirSync(path, { recursive: true, mode: 0o700 });
  const paths = ['pubspec.yaml', 'pubspec.lock', '.fvmrc', 'lib/generated/api_client', ...gitFiles(repository, candidateSha, ['api/openapi']).filter(file => /\.(yaml|json)$/.test(file.path) && !file.path.endsWith('redocly.yaml')).map(file => file.path)];
  const projection = projectGit(repository, candidateSha, paths, inputs);
  if (JSON.parse(readRegular(join(inputs, '.fvmrc'))).flutter !== '3.41.1') throw new Error('TRUSTED_FLUTTER_VERSION_MISMATCH');
  if (sha256(readRegular(tools.generator, 128 * 1024 * 1024)) !== generatorHash) throw new Error('GENERATOR_INTEGRITY_MISMATCH');
  const recipeDirectory = join(recipe, 'scripts/ci/sdk-verifier');
  const toolManifest = parse(readRegular(join(recipeDirectory, 'toolchain.pubspec.yaml')).toString());
  const toolLock = parse(readRegular(join(recipeDirectory, 'toolchain.pubspec.lock')).toString());
  if (toolManifest.name !== identity.name || toolManifest.version !== identity.version || !isDeepStrictEqual(Object.keys(toolManifest.dependencies).sort(), identity.directDependencies) || identity.directDependencies.some(name => toolManifest.dependencies[name] !== identity.rootLock.packages[name]?.version)) throw new Error('FROZEN_TOOLCHAIN_RUNTIME_MISMATCH');
  const packages = hostedClosure([toolLock, identity.rootLock]);
  if (archiveCache) {
    fs.mkdirSync(join(cache, 'archives'));
    for (const package_ of packages) {
      const path = join(archiveCache, `${package_.integrity}.tar.gz`);
      if (fs.existsSync(path)) fs.writeFileSync(join(cache, 'archives', `${package_.integrity}.tar.gz`), readRegular(path, 32 * 1024 * 1024));
    }
  }
  fs.writeFileSync(join(directory, 'packages.json'), JSON.stringify(packages));
  process.stdout.write('Verifying complete hosted archive closure.\n');
  const archives = spawnSync('python3', [join(recipeDirectory, 'cache-hosted-packages.py'), join(directory, 'packages.json'), cache, join(directory, 'archives.json')], { encoding: 'utf8', timeout: 600000, maxBuffer: 1024 * 1024 });
  if (archives.error || archives.status !== 0) throw new Error(`HOSTED_ARCHIVE_PREPARATION_FAILED:${archives.status}:${String(archives.stderr).slice(-2000)}`);
  const containerRecipe = join(directory, 'container-recipe');
  fs.mkdirSync(join(containerRecipe, 'scripts/ci/sdk-verifier'), { recursive: true });
  fs.mkdirSync(join(containerRecipe, 'node_modules'));
  const isolatedFiles = [...suites, 'monthly_rewards_preparation_wire.json', 'toolchain.pubspec.yaml', 'toolchain.pubspec.lock', 'prepare.mjs', 'behavior.mjs', 'analyze.mjs', 'analysis_options.yaml', 'redocly.yaml', 'admin-cors-policy.ts', 'admin-mutation-sdk-guard.mjs'];
  for (const file of isolatedFiles) fs.writeFileSync(join(containerRecipe, 'scripts/ci/sdk-verifier', file), readRegular(join(recipeDirectory, file)));
  for (const file of ['fix-openapi-dart-nested-builder-assignment.mjs', 'remove-openapi-oauth-support.mjs', 'trim-trailing-whitespace.js']) fs.writeFileSync(join(containerRecipe, 'scripts', file), readRegular(join(recipe, 'scripts', file)));
  fs.writeFileSync(join(containerRecipe, 'package.json'), '{"private":true}\n');
  const options = { tools, inputs, work, recipe: containerRecipe, npm: join(recipe, 'node_modules'), cache, user: `${process.getuid()}:${process.getgid()}`, name: `lythaus-sdk-${process.pid}` };
  process.stdout.write('Regenerating SDK in disposable isolation.\n');
  const regenerationRun = await owner.run(containerArguments({ ...options, command: ['/recipe/scripts/ci/sdk-verifier/prepare.mjs', '--regenerate-only'] }));
  fs.writeFileSync(join(directory, 'regeneration.stdout.txt'), regenerationRun.stdout);
  fs.writeFileSync(join(directory, 'regeneration.stderr.txt'), regenerationRun.stderr);
  if (regenerationRun.status !== 0) throw new Error(`ISOLATED_REGENERATION_FAILED:${regenerationRun.status}`);
  const regeneration = compareRegenerated(identity, join(work, 'regenerated'));
  if (!readRegular(join(work, 'bundled.json')).equals(readRegular(join(inputs, 'api/openapi/dist/openapi.json')))) throw new Error('REGENERATED_OPENAPI_BUNDLE_MISMATCH');
  process.stdout.write('Preparing matched SDK with frozen locks in disposable isolation.\n');
  const preparation = await owner.run(containerArguments({ ...options, command: ['/recipe/scripts/ci/sdk-verifier/prepare.mjs', '--prepare-only'] }));
  fs.writeFileSync(join(directory, 'preparation.stdout.txt'), preparation.stdout);
  fs.writeFileSync(join(directory, 'preparation.stderr.txt'), preparation.stderr);
  if (preparation.status !== 0) throw new Error(`ISOLATED_PREPARATION_FAILED:${preparation.status}`);
  const prepared = comparePrepared(identity, join(work, 'prepared'));
  if (!readRegular(join(work, 'pubspec.lock')).equals(readRegular(join(inputs, 'pubspec.lock'))) || !readRegular(join(work, 'sdk/pubspec.lock')).equals(readRegular(join(recipeDirectory, 'toolchain.pubspec.lock')))) throw new Error('FROZEN_LOCK_CHANGED');
  const appGraph = JSON.parse(readRegular(join(work, 'runtime-graph.json')));
  const appGraphSummary = validateFrozenGraph(appGraph, identity.rootLock, parse(readRegular(join(inputs, 'pubspec.yaml')).toString()));
  const runtime = validateRuntimeGraph(appGraph, identity.rootLock, identity);
  const toolGraph = JSON.parse(readRegular(join(work, 'toolchain-graph.json')));
  const toolGraphSummary = validateFrozenGraph(toolGraph, toolLock, toolManifest);
  const fixtureDirectory = join(directory, 'fixtures');
  fs.mkdirSync(fixtureDirectory);
  for (const file of [...suites, 'monthly_rewards_preparation_wire.json']) fs.copyFileSync(join(recipeDirectory, file), join(fixtureDirectory, file));
  fs.copyFileSync(join(recipeDirectory, 'analysis_options.yaml'), join(work, 'analysis_options.yaml'));
  const analysis = await owner.run(containerArguments({ ...options, fixtureDirectory, command: ['/recipe/scripts/ci/sdk-verifier/analyze.mjs'] }));
  fs.writeFileSync(join(directory, 'analysis.stdout.txt'), analysis.stdout);
  fs.writeFileSync(join(directory, 'analysis.stderr.txt'), analysis.stderr);
  if (analysis.status !== 0) throw new Error('TRUSTED_FIXTURE_ANALYSIS_FAILED');
  process.stdout.write('Running trusted synthetic behavior fixtures and assertion mutants.\n');
  const before = inventory(join(work, 'build/api_client/lib'));
  const baseline = await owner.run(containerArguments({ ...options, fixtureDirectory, command: ['/recipe/scripts/ci/sdk-verifier/behavior.mjs'] }));
  fs.writeFileSync(join(directory, 'baseline.jsonl'), baseline.stdout);
  if (baseline.status !== 0 || !isDeepStrictEqual(before, inventory(join(work, 'build/api_client/lib')))) throw new Error('BASELINE_BEHAVIOR_FAILED');
  const behavior = completedBehavior(baseline.stdout, JSON.parse(readRegular(join(recipeDirectory, 'behavior-cases.json'))));
  const rejected = [];
  for (const mutation of mutations) {
    const file = join(work, 'build/api_client', mutation.file), original = readRegular(file).toString();
    if (original.split(mutation.before).length !== 2) throw new Error('MUTATION_SOURCE_POINT_REQUIRED');
    fs.writeFileSync(file, original.replace(mutation.before, mutation.after));
    const result = await owner.run(containerArguments({ ...options, fixtureDirectory, command: ['/recipe/scripts/ci/sdk-verifier/behavior.mjs'] }));
    fs.writeFileSync(join(directory, `${mutation.id}.jsonl`), result.stdout);
    fs.writeFileSync(file, original);
    if (!Number.isInteger(result.status) || result.status <= 0 || !isDeepStrictEqual(before, inventory(join(work, 'build/api_client/lib')))) throw new Error('MUTATION_NOT_REJECTED');
    rejected.push(rejectedMutation(result.stdout, mutation));
  }
  if (!isDeepStrictEqual(projection, gitFiles(repository, candidateSha, paths))) throw new Error('EXACT_GIT_INPUT_CHANGED');
  const archiveEvidence = JSON.parse(readRegular(join(directory, 'archives.json'), 4 * 1024 * 1024));
  const classification = approvedLicenseClassification({ ...identity, runtimeNames: runtime.map(value => value.name) }, trustedContext?.ownerClassification, trustedContext?.runtimeLicenses, archiveEvidence);
  if (classification.state === 'approved') {
    const evidence = gitFiles(repository, candidateSha, [classification.ownerRecord.licenseEvidencePath]);
    if (evidence.length !== 1 || evidence[0].path !== classification.ownerRecord.licenseEvidencePath || evidence[0].blob !== classification.ownerRecord.licenseEvidenceBlobSha) throw new Error('OWNER_LICENSE_EVIDENCE_MISMATCH');
  }
  const coverageEligible = Boolean(trustedContext && classification.state === 'approved');
  return { schemaVersion: 'lythaus-isolated-sdk-verification-v1', packageName: identity.name, version: identity.version, localPath: identity.localPath, candidateSha, verifierSha: trustedContext?.verifierSha ?? null, sourceTreeSha: identity.sourceTreeSha, fixtures: 'synthetic-only', nativeIndexing: 'NOT_CLAIMED', verification: 'fresh-isolated-source-verification', regeneration, prepared, behavior, mutations: rejected, appGraph: appGraphSummary, toolchainGraph: toolGraphSummary, runtimePackages: runtime, hostedArchiveClosure: archiveEvidence, toolchainLockSha256: sha256(readRegular(join(recipeDirectory, 'toolchain.pubspec.lock'))), classification: classification.state, coverageEligible, reason: !trustedContext ? 'TRUSTED_VERIFIER_BOOTSTRAP_REQUIRED' : classification.reason ?? 'VERIFIED_WITH_APPROVED_CLASSIFICATION' };
}
