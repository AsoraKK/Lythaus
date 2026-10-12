import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/ci/setup-flutter-sdk.sh');
const action = readFileSync(path.join(root, '.github/actions/flutter-setup/action.yml'), 'utf8');

function fixture(t, version = '3.41.1') {
  const directory = mkdtempSync(path.join(tmpdir(), 'lythaus-flutter-sdk-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, 'bin');
  const source = path.join(directory, 'source');
  mkdirSync(bin);
  mkdirSync(path.join(source, 'flutter/bin/cache/dart-sdk/bin'), { recursive: true });
  writeFileSync(path.join(source, 'flutter/bin/flutter'), `#!/usr/bin/env node
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['--version', '--machine'])) process.exit(3);
process.stdout.write(JSON.stringify({frameworkVersion: ${JSON.stringify(version)}, channel: 'stable'}));
`);
  chmodSync(path.join(source, 'flutter/bin/flutter'), 0o755);
  const archive = path.join(directory, 'fixture.tar.xz');
  const packed = spawnSync('tar', ['-cJf', archive, '-C', source, 'flutter'], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_DOWNLOAD_LOG, JSON.stringify(args) + '\\n');
if (process.env.FIXTURE_DOWNLOAD_FAIL === 'true') process.exit(22);
fs.copyFileSync(process.env.FIXTURE_ARCHIVE, args[args.indexOf('--output') + 1]);
`);
  chmodSync(path.join(bin, 'curl'), 0o755);
  const versionFile = path.join(directory, '.fvmrc');
  writeFileSync(versionFile, JSON.stringify({ flutter: version }));
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    RUNNER_TOOL_CACHE: path.join(directory, 'tool-cache'),
    RUNNER_TEMP: directory,
    GITHUB_OUTPUT: path.join(directory, 'outputs'),
    GITHUB_PATH: path.join(directory, 'path'),
    FLUTTER_VERSION_FILE: versionFile,
    FLUTTER_CHANNEL: 'stable',
    FLUTTER_CACHE: 'true',
    FIXTURE_ARCHIVE: archive,
    FIXTURE_DOWNLOAD_LOG: path.join(directory, 'downloads'),
  };
  const sdkRoot = path.join(env.RUNNER_TOOL_CACHE, `lythaus-flutter/${version}/stable/flutter`);
  return {
    directory, env, sdkRoot, versionFile, source,
    run: (mode, overrides = {}) => spawnSync('bash', [script, mode], { cwd: root, env: { ...env, ...overrides }, encoding: 'utf8' }),
  };
}

test('cold cache downloads the canonical exact SDK and verifies before exposing PATH', t => {
  const f = fixture(t);
  assert.equal(f.run('resolve').status, 0);
  assert.equal(readFileSync(f.env.GITHUB_OUTPUT, 'utf8'), `version=3.41.1\nroot=${f.sdkRoot}\n`);
  const installed = f.run('install');
  assert.equal(installed.status, 0, installed.stderr);
  const [args] = readFileSync(f.env.FIXTURE_DOWNLOAD_LOG, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(args.at(-1), 'https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.41.1-stable.tar.xz');
  assert.ok(args.includes('--fail'));
  assert.equal(args[args.indexOf('--retry') + 1], '4');
  assert.equal(readFileSync(f.env.GITHUB_PATH, 'utf8'), `${f.sdkRoot}/bin\n${f.sdkRoot}/bin/cache/dart-sdk/bin\n`);
  assert.equal(existsSync(path.join(f.directory, 'flutter_linux_3.41.1-stable.tar.xz')), false);
});

test('warm SDK runs exact version verification without downloading again', t => {
  const f = fixture(t);
  assert.equal(f.run('install').status, 0);
  const downloads = readFileSync(f.env.FIXTURE_DOWNLOAD_LOG, 'utf8');
  assert.equal(f.run('install', { FIXTURE_DOWNLOAD_FAIL: 'true' }).status, 0);
  assert.equal(readFileSync(f.env.FIXTURE_DOWNLOAD_LOG, 'utf8'), downloads);
});

test('disabled caching retains the cold download and version verification', t => {
  const f = fixture(t);
  const installed = f.run('install', { FLUTTER_CACHE: 'false' });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(existsSync(f.env.FIXTURE_DOWNLOAD_LOG), true);
});

test('download failure fails closed and an ordinary retry can recover', t => {
  const f = fixture(t);
  assert.notEqual(f.run('install', { FIXTURE_DOWNLOAD_FAIL: 'true' }).status, 0);
  assert.equal(existsSync(f.env.GITHUB_PATH), false);
  assert.equal(f.run('install').status, 0);
});

test('incomplete restored SDK falls back to the canonical download', t => {
  const f = fixture(t);
  mkdirSync(f.sdkRoot, { recursive: true });
  writeFileSync(path.join(f.sdkRoot, 'incomplete-fixture'), 'synthetic');
  assert.equal(f.run('install').status, 0);
  assert.equal(existsSync(f.env.FIXTURE_DOWNLOAD_LOG), true);
});

for (const metadata of [
  { frameworkVersion: '3.40.0', channel: 'stable' },
  { frameworkVersion: '3.41.1', channel: 'beta' },
  {},
]) {
  test(`stale or invalid restored SDK fails closed: ${JSON.stringify(metadata)}`, t => {
    const f = fixture(t);
    mkdirSync(path.join(f.sdkRoot, 'bin'), { recursive: true });
    const flutter = path.join(f.sdkRoot, 'bin/flutter');
    writeFileSync(flutter, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(metadata))});\n`);
    chmodSync(flutter, 0o755);
    const installed = f.run('install');
    assert.notEqual(installed.status, 0);
    assert.match(installed.stderr, /does not match the requested version and channel/);
    assert.equal(existsSync(f.env.GITHUB_PATH), false);
  });
}

test('version changes select a separate SDK directory', t => {
  const f = fixture(t);
  assert.equal(f.run('install').status, 0);
  writeFileSync(f.versionFile, JSON.stringify({ flutter: '3.42.0' }));
  assert.equal(f.run('resolve').status, 0);
  assert.match(readFileSync(f.env.GITHUB_OUTPUT, 'utf8'), /lythaus-flutter\/3\.42\.0\/stable\/flutter/);
  const changed = f.run('install');
  assert.notEqual(changed.status, 0, 'The old synthetic archive must not satisfy the new version');
  assert.equal(readFileSync(f.env.FIXTURE_DOWNLOAD_LOG, 'utf8').trim().split('\n').length, 2);
});

test('invalid configuration is rejected before cache lookup or download', t => {
  const f = fixture(t);
  for (const overrides of [
    { RUNNER_OS: 'Windows' }, { RUNNER_ARCH: 'ARM64' }, { FLUTTER_CHANNEL: 'beta' }, { FLUTTER_CACHE: 'yes' },
  ]) assert.notEqual(f.run('resolve', overrides).status, 0);
  for (const flutter of ['../escape', '3.41.1\nroot=/tmp/escape', 3411, null]) {
    writeFileSync(f.versionFile, JSON.stringify({ flutter }));
    assert.notEqual(f.run('resolve').status, 0);
  }
  writeFileSync(f.versionFile, '{');
  assert.notEqual(f.run('resolve').status, 0);
  assert.equal(existsSync(f.env.GITHUB_OUTPUT), false);
  assert.equal(existsSync(f.env.FIXTURE_DOWNLOAD_LOG), false);
});

test('cache policy pins actions, isolates SDK identity, and saves only on main push before application commands', () => {
  assert.match(action, /uses: actions\/cache\/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9/);
  assert.match(action, /uses: actions\/cache\/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9/);
  assert.match(action, /key: lythaus-flutter-sdk-v1-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.sdk\.outputs\.version \}\}-\$\{\{ inputs\.channel \}\}-\$\{\{ hashFiles\('\.github\/actions\/flutter-setup\/action\.yml', 'scripts\/ci\/setup-flutter-sdk\.sh'\) \}\}/);
  assert.match(action, /if: inputs\.cache == 'true' && steps\.sdk_cache\.outputs\.cache-hit != 'true' && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.equal((action.match(/path: \$\{\{ steps\.sdk\.outputs\.root \}\}/g) ?? []).length, 2);
  assert.ok(action.indexOf('install\n') < action.indexOf('uses: actions/cache/save@'));
  assert.doesNotMatch(action, /restore-keys:|enableCrossOsArchive:|secrets\.|permissions:|node_modules|\.pub-cache|build\/|post:/);
});
