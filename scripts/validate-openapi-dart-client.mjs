import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve('lib/generated/api_client');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'lythaus-openapi-dart-'));
const validationPackage = join(temporaryRoot, 'api_client');
const dart = process.platform === 'win32' ? 'dart.bat' : 'dart';
const prepareForFlutter = process.argv.includes('--prepare-for-flutter');

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
  writeFileSync(manifestPath, manifest.replace(/^  build_runner: any$/m,
    '  build_runner: 2.16.1\n  analyzer: 14.4.0'));
  run(['pub', 'get']);
  run(['run', 'build_runner', 'build']);
  if (prepareForFlutter) {
    const destination = resolve('build/api_client');
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    cpSync(join(source, 'pubspec.yaml'), join(destination, 'pubspec.yaml'));
    cpSync(join(validationPackage, 'lib'), join(destination, 'lib'), { recursive: true });
  } else {
    run(['format', '--output=none', '--set-exit-if-changed', 'test/community_appeal_serialization_test.dart', 'test/admin_mutation_admission_test.dart', 'test/support_feedback_serialization_test.dart', 'test/activity_measurement_serialization_test.dart', 'test/monthly_rewards_preparation_serialization_test.dart']);
    run(['analyze', '--no-fatal-warnings']);
    run(['test', '--reporter', 'compact']);
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
