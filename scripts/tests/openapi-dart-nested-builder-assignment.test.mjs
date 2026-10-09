import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { normalizeLevelAuthorityBuilderAssignment } from '../fix-openapi-dart-nested-builder-assignment.mjs';
import './local-dart-package-evidence.test.mjs';

const generatedSerializer = `
        case r'levelAuthority':
          final valueDes = serializers.deserialize(value) as MonthlyReputationReportResponseLevelAuthority;
          result.levelAuthority = valueDes;
          break;
        case r'corrections':
          final valueDes = serializers.deserialize(value) as MonthlyReputationReportResponseCorrections;
          result.corrections.replace(valueDes);
          break;
`;

test('normalizes the generated nested builder assignment and leaves other fields alone', () => {
  const normalized = normalizeLevelAuthorityBuilderAssignment(generatedSerializer);
  assert.match(normalized, /result\.levelAuthority\.replace\(valueDes\);/u);
  assert.match(normalized, /result\.corrections\.replace\(valueDes\);/u);
  assert.doesNotMatch(normalized, /result\.levelAuthority\s*=\s*valueDes/u);
});

test('the post-generation normalization is repeatable', () => {
  const once = normalizeLevelAuthorityBuilderAssignment(generatedSerializer);
  assert.equal(normalizeLevelAuthorityBuilderAssignment(once), once);
});

test('fails closed if the pinned generator output changes shape', () => {
  assert.throws(
    () => normalizeLevelAuthorityBuilderAssignment("case r'levelAuthority':\n          result.levelAuthority = decoded;\n"),
    /monthly_report_level_authority_generator_shape_unexpected/u,
  );
  assert.throws(
    () => normalizeLevelAuthorityBuilderAssignment('no matching generated property'),
    /monthly_report_level_authority_case_missing/u,
  );
});

test('temporary Dart validation resolves the compatible toolchain and preserves every check', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-dart-toolchain-fixture-'));
  const calls = join(directory, 'calls.jsonl');
  const originalManifest = readFileSync('lib/generated/api_client/pubspec.yaml', 'utf8');
  const fakeDart = `#!/usr/bin/env node
import fs from 'node:fs';
const manifest=fs.readFileSync('pubspec.yaml','utf8');
const compatible=/^  build_runner: 2\\.16\\.1$/m.test(manifest)
  && /^  analyzer: 14\\.4\\.0$/m.test(manifest)
  && !/dependency_overrides:/.test(manifest);
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),compatible})+'\\n');
if (!compatible) process.exit(1);
`;
  try {
    writeFileSync(join(directory, 'dart'), fakeDart, { mode: 0o700 });
    const result = spawnSync(process.execPath, ['scripts/validate-openapi-dart-client.mjs'], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    const requests = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(requests.map(request => request.args), [
      ['pub', 'get'], ['run', 'build_runner', 'build'],
      ['format', '--output=none', '--set-exit-if-changed', 'test/community_appeal_serialization_test.dart', 'test/admin_mutation_admission_test.dart', 'test/support_feedback_serialization_test.dart', 'test/activity_measurement_serialization_test.dart', 'test/monthly_rewards_preparation_serialization_test.dart', 'test/canonical_local_package_behavior_test.dart'],
      ['analyze', '--no-fatal-warnings'], ['test', '--reporter', 'compact'],
    ]);
    assert.ok(requests.every(request => request.compatible));
    assert.ok(requests.every(request => request.cwd !== resolve('lib/generated/api_client')));
    assert.ok(requests.every(request => !existsSync(request.cwd)), 'Temporary validation package is removed');
    assert.equal(readFileSync('lib/generated/api_client/pubspec.yaml', 'utf8'), originalManifest);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Flutter preparation bootstraps without npm packages or source evidence modules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-dart-bootstrap-fixture-'));
  const calls = join(directory, 'calls.jsonl');
  const manifest = readFileSync('lib/generated/api_client/pubspec.yaml', 'utf8');
  try {
    mkdirSync(join(directory, 'scripts/tests/fixtures'), { recursive: true });
    mkdirSync(join(directory, 'lib/generated'), { recursive: true });
    mkdirSync(join(directory, 'tests/contract/fixtures'), { recursive: true });
    cpSync('scripts/validate-openapi-dart-client.mjs', join(directory, 'scripts/validate-openapi-dart-client.mjs'));
    cpSync('scripts/tests/fixtures/privacy-status-serialization.dart.txt', join(directory, 'scripts/tests/fixtures/privacy-status-serialization.dart.txt'));
    cpSync('tests/contract/dart', join(directory, 'tests/contract/dart'), { recursive: true });
    cpSync('lib/generated/api_client', join(directory, 'lib/generated/api_client'), { recursive: true });
    writeFileSync(join(directory, 'tests/contract/fixtures/monthly-rewards-preparation-wire.mjs'), "process.stdout.write(JSON.stringify({syntheticBootstrapFixture:true}));\n");
    writeFileSync(join(directory, 'dart'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2))+'\\n');
if(process.argv[2]==='run') fs.writeFileSync('lib/synthetic_bootstrap.g.dart','// synthetic CLI bootstrap output\\n');
`, { mode: 0o700 });
    assert.equal(existsSync(join(directory, 'node_modules')), false);
    assert.equal(existsSync(join(directory, 'scripts/ci')), false);
    const result = spawnSync(process.execPath, ['scripts/validate-openapi-dart-client.mjs', '--prepare-for-flutter'], {
      cwd: directory, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse), [['pub', 'get'], ['run', 'build_runner', 'build']]);
    assert.equal(readFileSync(join(directory, 'build/api_client/pubspec.yaml'), 'utf8'), manifest);
    assert.equal(readFileSync(join(directory, 'build/api_client/lib/synthetic_bootstrap.g.dart'), 'utf8'), '// synthetic CLI bootstrap output\n');
    assert.equal(existsSync(join(directory, '.artifacts/security-run-evidence/local-dart-package.json')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
