import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const source = resolve('lib/generated/api_client');
const dart = process.platform === 'win32' ? 'dart.bat' : 'dart';
const prepareForFlutter = process.argv.includes('--prepare-for-flutter');
const sourceEvidence = process.argv.includes('--source-evidence');
let identity;
let evidence;
let yaml;
let resolvedDependencies;
if (sourceEvidence) {
  rmSync('.artifacts/security-run-evidence/local-dart-package.json', { force: true });
  if (prepareForFlutter) throw new Error('source evidence runs the behavioral contracts before preparation');
  evidence = await import('./ci/local-dart-package-evidence.mjs');
  yaml = await import('yaml');
  ({ resolvedDependencies } = await import('./ci/dependency-review-native.mjs'));
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { stdio: 'ignore' });
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  resolvedDependencies('pubspec.lock', readFileSync('pubspec.lock', 'utf8'));
  resolvedDependencies('pubspec.lock', readFileSync('pubspec.lock', 'utf8'), { revision: headSha });
  identity = evidence.localDartIdentity(headSha);
  evidence.assertSourceSnapshotUnchanged(identity);
}
const temporaryRoot = mkdtempSync(join(tmpdir(), 'lythaus-openapi-dart-'));
const validationPackage = join(temporaryRoot, 'api_client');

function run(arguments_) {
  const result = spawnSync(dart, arguments_, {
    cwd: validationPackage,
    env: { ...process.env, LYTHAUS_ADMIN_MUTATION_GUARD: resolve('scripts/tests/admin-mutation-sdk-guard.mjs') },
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`dart ${arguments_.join(' ')} failed`);
  }
}

function capture(arguments_, cwd = validationPackage) {
  const result = spawnSync(dart, arguments_, {
    cwd,
    env: { ...process.env, LYTHAUS_ADMIN_MUTATION_GUARD: resolve('scripts/tests/admin-mutation-sdk-guard.mjs') },
    encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    shell: process.platform === 'win32', windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function preparePackage() {
  const destination = resolve('build/api_client');
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(join(source, 'pubspec.yaml'), join(destination, 'pubspec.yaml'));
  cpSync(join(validationPackage, 'lib'), join(destination, 'lib'), { recursive: true });
}

function prepareLockedConsumer() {
  preparePackage();
  const root = process.cwd();
  const flutter = process.platform === 'win32' ? 'flutter.bat' : 'flutter';
  const result = spawnSync(flutter, ['pub', 'get', '--enforce-lockfile'], {
    cwd: root, encoding: 'utf8', stdio: 'inherit',
    shell: process.platform === 'win32', windowsHide: true,
  });
  if (result.error || result.status !== 0) throw result.error ?? new Error('locked SDK consumer could not be resolved');
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'pubspec.yaml', 'pubspec.lock'], { stdio: 'ignore' });
  const graph = capture(['pub', 'deps', '--json'], root);
  if (graph.status !== 0) throw new Error(`canonical runtime graph could not be resolved: ${graph.stderr}`);
  const rootLock = yaml.parse(readFileSync('pubspec.lock', 'utf8'));
  const runtimePackages = evidence.lockedRuntimePackages(JSON.parse(graph.stdout), rootLock, rootLock, identity.dependencies);
  const directory = resolve('.artifacts/canonical-sdk-contract/test');
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const file of evidence.contractSuites) cpSync(join(validationPackage, 'test', file), join(directory, file));
  const wire = join(directory, 'monthly_rewards_preparation_wire.json');
  cpSync(join(validationPackage, 'test/monthly_rewards_preparation_wire.json'), wire);
  const monthlyTest = join(directory, 'monthly_rewards_preparation_serialization_test.dart');
  const content = readFileSync(monthlyTest, 'utf8');
  if (content.split("'test/monthly_rewards_preparation_wire.json'").length !== 2) throw new Error('monthly wire fixture path changed');
  writeFileSync(monthlyTest, content.replace("'test/monthly_rewards_preparation_wire.json'", JSON.stringify(wire)));
  return { root, directory, runtimePackages, runtimeGraph: graph.stdout };
}

try {
  cpSync(source, validationPackage, { recursive: true });
  cpSync(resolve('scripts/tests/fixtures/privacy-status-serialization.dart.txt'), join(validationPackage, 'test/privacy_status_serialization_test.dart'));
  cpSync(resolve('tests/contract/dart/community_appeal_serialization_test.dart.fixture'),
    join(validationPackage, 'test/community_appeal_serialization_test.dart'));
  cpSync(resolve('tests/contract/dart/admin_mutation_admission_test.dart.fixture'),
    join(validationPackage, 'test/admin_mutation_admission_test.dart'));
  cpSync(resolve('tests/contract/dart/support_feedback_serialization_test.dart.fixture'),
    join(validationPackage, 'test/support_feedback_serialization_test.dart'));
  cpSync(resolve('tests/contract/dart/activity_measurement_serialization_test.dart.fixture'),
    join(validationPackage, 'test/activity_measurement_serialization_test.dart'));
  cpSync(resolve('tests/contract/dart/monthly_rewards_preparation_serialization_test.dart.fixture'),
    join(validationPackage, 'test/monthly_rewards_preparation_serialization_test.dart'));
  cpSync(resolve('tests/contract/dart/canonical_local_package_behavior_test.dart.fixture'),
    join(validationPackage, 'test/canonical_local_package_behavior_test.dart'));
  const monthlyFixtures = spawnSync(process.execPath, ['--experimental-strip-types',
    resolve('tests/contract/fixtures/monthly-rewards-preparation-wire.mjs')], { encoding: 'utf8' });
  if (monthlyFixtures.error || monthlyFixtures.status !== 0)
    throw monthlyFixtures.error ?? new Error(monthlyFixtures.stderr);
  writeFileSync(join(validationPackage, 'test/monthly_rewards_preparation_wire.json'), monthlyFixtures.stdout);
  // Keep the temporary validator on the verified compatible build toolchain.
  // analyzer 14.5 removed the contextFeatures setter used by build_runner 2.16.1.
  const manifestPath = join(validationPackage, 'pubspec.yaml');
  const manifest = readFileSync(manifestPath, 'utf8');
  if (!/^  build_runner: any$/m.test(manifest)) {
    throw new Error('generated Dart validation build_runner declaration changed');
  }
  let validationManifest = manifest.replace(/^  build_runner: any$/m,
    '  build_runner: 2.16.1\n  analyzer: 14.4.0');
  if (sourceEvidence) {
    const pinned = yaml.parse(validationManifest);
    pinned.dependencies = Object.fromEntries(identity.dependencies.map(value => [value.name, value.version]));
    validationManifest = yaml.stringify(pinned);
  }
  writeFileSync(manifestPath, validationManifest);
  run(['pub', 'get']);
  run(['run', 'build_runner', 'build']);
  if (prepareForFlutter) {
    preparePackage();
  } else {
    run(['format', '--output=none', '--set-exit-if-changed', 'test/community_appeal_serialization_test.dart', 'test/admin_mutation_admission_test.dart', 'test/support_feedback_serialization_test.dart', 'test/activity_measurement_serialization_test.dart', 'test/monthly_rewards_preparation_serialization_test.dart', 'test/canonical_local_package_behavior_test.dart']);
    run(['analyze', '--no-fatal-warnings']);
    if (!sourceEvidence) {
      run(['test', '--reporter', 'compact']);
    } else {
      const consumer = prepareLockedConsumer();
      const reports = resolve('.artifacts/canonical-sdk-contract/reports');
      rmSync(reports, { recursive: true, force: true });
      mkdirSync(reports, { recursive: true });
      const baseline = capture(['test', '--reporter', 'json', ...evidence.contractSuites.map(file => join(consumer.directory, file))], consumer.root);
      writeFileSync(join(reports, 'baseline.jsonl'), baseline.stdout);
      if (baseline.status !== 0) throw new Error(`canonical Dart contracts failed: ${baseline.stderr}`);
      const behavior = evidence.completedBehaviorReport(baseline.stdout);
      const mutations = [];
      const rawMutations = [];
      for (const mutation of evidence.sourceMutations) {
        const path = resolve('build/api_client', mutation.file);
        const original = readFileSync(path, 'utf8');
        if (original.split(mutation.before).length !== 2) throw new Error(`source evidence mutation shape changed: ${mutation.id}`);
        try {
          writeFileSync(path, original.replace(mutation.before, mutation.after));
          const result = capture(['test', '--reporter', 'json', join(consumer.directory, 'monthly_rewards_preparation_serialization_test.dart'), '--plain-name', mutation.testName], consumer.root);
          writeFileSync(join(reports, `${mutation.id}.jsonl`), result.stdout);
          if (result.status === 0) throw new Error(`source evidence mutation unexpectedly passed: ${mutation.id}`);
          mutations.push(evidence.rejectedMutationReport(result.stdout, mutation));
          rawMutations.push({ id: mutation.id, exitCode: result.status, stdout: result.stdout });
        } finally {
          writeFileSync(path, original);
        }
      }
      preparePackage();
      const toolchainGraph = capture(['pub', 'deps', '--json']);
      if (toolchainGraph.status !== 0) throw new Error('source evidence toolchain graph failed');
      const flutter = spawnSync(process.platform === 'win32' ? 'flutter.bat' : 'flutter', ['--version', '--machine'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
      if (flutter.error || flutter.status !== 0) throw flutter.error ?? new Error('source evidence Flutter identity failed');
      const bundle = {
        schemaVersion: evidence.inputBundleSchema, headSha: identity.headSha, provenance: 'unattested-local',
        baseline: { exitCode: baseline.status, stdout: baseline.stdout }, mutations: rawMutations,
        runtimeGraph: consumer.runtimeGraph,
        toolchain: { manifest: readFileSync(join(validationPackage, 'pubspec.yaml'), 'utf8'), lock: readFileSync(join(validationPackage, 'pubspec.lock'), 'utf8'), graph: toolchainGraph.stdout, flutter: JSON.parse(flutter.stdout) },
      };
      const bundleText = JSON.stringify(bundle, null, 2) + '\n';
      const directory = '.artifacts/security-run-evidence';
      mkdirSync(directory, { recursive: true });
      const receipt = {
        schemaVersion: evidence.evidenceSchema, observedAt: new Date().toISOString(), identity,
        preparation: evidence.preparedDartIdentity(identity), verification: 'behavior-verified',
        behavior, mutations, runtimePackages: consumer.runtimePackages, fixtures: 'synthetic-only', nativeIndexing: 'NOT_CLAIMED',
        toolchainLockSha256: createHash('sha256').update(readFileSync(join(validationPackage, 'pubspec.lock'))).digest('hex'),
        inputBundleSha256: createHash('sha256').update(bundleText).digest('hex'),
        classification: evidence.localDartClassification(identity),
      };
      evidence.assertSourceSnapshotUnchanged(identity);
      resolvedDependencies('pubspec.lock', readFileSync('pubspec.lock', 'utf8'));
      writeFileSync(evidence.inputBundlePath, bundleText);
      evidence.validateLocalDartReceiptEvidence(receipt, identity, receipt.preparation);
      evidence.assertSourceSnapshotUnchanged(identity);
      writeFileSync(join(directory, 'local-dart-package.json'), JSON.stringify(receipt, null, 2) + '\n');
      process.stdout.write(`Checked ${behavior.cases.length} explicit canonical SDK behavior cases and ${mutations.length} mutation rejections locally; ownership/license approval and trusted producer provenance remain required.\n`);
    }
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
