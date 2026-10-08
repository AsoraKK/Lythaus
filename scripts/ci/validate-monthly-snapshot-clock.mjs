import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const CLOCK_TEST_PINS = Object.freeze({
  node: 'v22.23.3',
  image: 'postgres@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f',
  libraryPackage: 'libfaketime=0.9.10+2024-06-05+gba9ed5b2-0.6',
  libraryUrl: 'https://deb.debian.org/debian/pool/main/f/faketime/libfaketime_0.9.10+2024-06-05+gba9ed5b2-0.6_amd64.deb',
  packageSha256: '4ecb98d7f6149e4c297a5946c4fa231a1b794d203053962e295dd3a18a47f269',
  librarySha256: 'f38066cb0a4a0bb6a8955c7cb48704ae3aec1b28a8e1ad45ba3db3429050cc40',
  premature: '2026-10-08 12:00:00',
  settled: '2026-11-22 12:00:00',
});
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const fixture = 'apps/lythaus-jobs/tests/monthly-reward-snapshots.postgres.mjs';
const labelKey = 'co.lythaus.monthly-snapshot-clock-run';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safeEnvironment = () => ({ PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' });

export async function command(executable, args, { cwd = root, env = safeEnvironment(), stdoutFile, stderrFile, timeout = 180000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.stdout.on('data', bytes => { if (stdoutFile) appendFileSync(stdoutFile, bytes); else stdout += bytes; });
    child.stderr.on('data', bytes => { if (stderrFile) appendFileSync(stderrFile, bytes); else stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = { code, signal, stdout: stdout.trim(), stderr: stderr.trim() };
      if (timedOut) reject(new Error('monthly_clock_command_timeout'));
      else resolve(result);
    });
  });
}
function requireSuccess(result, operation) {
  if (result.code !== 0) throw new Error(`${operation}: ${result.stderr || result.signal || result.code}`);
  return result.stdout;
}
export function validateEnvironment(env) {
  const forbidden = ['PLANETSCALE_PG17_TEST_DATABASE_URL', 'DATABASE_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER',
    'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'NODE_OPTIONS', 'LD_PRELOAD'];
  for (const key of [...forbidden, ...Object.keys(env).filter(key => key.startsWith('FAKETIME'))])
    if (env[key]) throw new Error(`monthly_clock_inherited_environment_refused:${key}`);
  if (env.DOCKER_CONTEXT && env.DOCKER_CONTEXT !== 'default') throw new Error('monthly_clock_remote_docker_refused');
  const endpoint = env.DOCKER_HOST || 'unix:///var/run/docker.sock';
  if (!/^unix:\/\/\/(?:var\/run|run)\/[A-Za-z0-9_./-]+\.sock$/.test(endpoint)) throw new Error('monthly_clock_remote_docker_refused');
  return endpoint;
}
export function publicDownloadEnvironment(env) {
  const result = safeEnvironment();
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
    if (!env[key]) continue;
    const proxy = new URL(env[key]);
    if (!['http:', 'https:'].includes(proxy.protocol) || proxy.username || proxy.password)
      throw new Error('monthly_clock_credentialed_proxy_refused');
    result[key] = env[key];
  }
  return result;
}
export async function verifyCheckout(expectedSha, { directory = root, env = process.env, version = process.version, execute = command } = {}) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha ?? '')) throw new Error('monthly_clock_expected_sha_required');
  if (version !== CLOCK_TEST_PINS.node) throw new Error('monthly_clock_node_version_mismatch');
  const endpoint = validateEnvironment(env);
  const head = requireSuccess(await execute('git', ['rev-parse', 'HEAD'], { cwd: directory }), 'monthly_clock_git_head');
  if (head !== expectedSha) throw new Error('monthly_clock_checkout_sha_mismatch');
  requireSuccess(await execute('git', ['diff', '--quiet'], { cwd: directory }), 'monthly_clock_dirty_checkout');
  requireSuccess(await execute('git', ['diff', '--cached', '--quiet'], { cwd: directory }), 'monthly_clock_dirty_index');
  return { expectedSha, head, endpoint };
}
export function localDatabaseUrl(publishedPort) {
  const match = /^127\.0\.0\.1:([0-9]+)$/.exec(publishedPort.trim());
  if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535) throw new Error('monthly_clock_nonlocal_port_refused');
  return `postgresql://postgres@127.0.0.1:${match[1]}/lythaus_monthly_test?sslmode=disable`;
}
export function validatePositiveTap(tap) {
  for (const [name, expected] of [['tests', 32], ['pass', 32], ['fail', 0], ['skipped', 0]])
    if (!new RegExp(`^# ${name} ${expected}$`, 'm').test(tap)) throw new Error('monthly_clock_positive_tap_incomplete');
  const positives = tap.split('\n').filter(line => /^ok [0-9]+ - .* POSITIVE:/.test(line));
  if (positives.length !== 6 || positives.some(line => /# SKIP/.test(line))) throw new Error('monthly_clock_positive_cases_missing');
  if (/^not ok /m.test(tap)) throw new Error('monthly_clock_positive_tap_failed');
  return { tests: 32, passed: 32, failed: 0, skipped: 0, positiveCases: positives.length };
}

export class DisposableContainers {
  constructor(directory, endpoint, execute = command) {
    this.directory = directory;
    this.runId = randomUUID();
    this.execute = execute;
    this.records = [];
    this.env = { ...safeEnvironment(), DOCKER_HOST: endpoint, DOCKER_CONFIG: path.join(directory, 'docker-config') };
    mkdirSync(this.env.DOCKER_CONFIG, { recursive: true });
  }
  async docker(args, options = {}) { return await this.execute('docker', args, { ...options, env: this.env }); }
  save() { writeFileSync(path.join(this.directory, `resources-${this.runId}.json`), `${JSON.stringify({ runId: this.runId, containers: this.records }, null, 2)}\n`); }
  async create(profile, extras = [], commandArgs = []) {
    const name = `lythaus-monthly-clock-${profile}-${this.runId}`;
    const cidfile = path.join(this.directory, `${profile}-${this.runId}.cid`);
    try {
      requireSuccess(await this.docker(['create', '--cidfile', cidfile, '--name', name,
        '--label', `${labelKey}=${this.runId}`, '--platform', 'linux/amd64', '--user', 'postgres',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
        '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777,size=256m', ...extras, CLOCK_TEST_PINS.image, ...commandArgs]), 'monthly_clock_container_create');
    } finally {
      if (existsSync(cidfile)) {
        const id = readFileSync(cidfile, 'utf8').trim();
        if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('monthly_clock_container_id_invalid');
        this.records.push({ id, name, profile, state: 'created' });
        this.save();
      }
    }
    return this.records.at(-1).id;
  }
  async inspect(id) {
    const result = await this.docker(['container', 'inspect', id]);
    if (result.code !== 0 && /No such (?:container|object)/i.test(result.stderr)) return null;
    return JSON.parse(requireSuccess(result, 'monthly_clock_container_inspect'))[0];
  }
  async removeAll() {
    const failures = [];
    for (const record of [...this.records].reverse()) {
      try {
        const container = await this.inspect(record.id);
        if (container && container.Config.Labels?.[labelKey] !== this.runId) throw new Error('monthly_clock_cleanup_ownership_mismatch');
        if (container) requireSuccess(await this.docker(['rm', '--force', '--volumes', record.id]), 'monthly_clock_container_cleanup');
        assert.equal(await this.inspect(record.id), null);
        record.state = 'removed';
      } catch (error) { record.state = 'cleanup_failed'; record.error = error.message; failures.push(error); }
      this.save();
    }
    if (failures.length) throw new AggregateError(failures, 'monthly_clock_cleanup_failed');
  }
}

async function failureCleanupControls(owner, manifest) {
  const sentinel = await owner.create('sentinel', ['--network', 'none', '--entrypoint', '/bin/true']);
  manifest.cleanupControls = [];
  for (const stage of ['after_create', 'after_start']) {
    const nested = new DisposableContainers(owner.directory, owner.env.DOCKER_HOST);
    let injected = false;
    try {
      const id = await nested.create(stage, ['--network', 'none', '--entrypoint', '/bin/sleep'], ['120']);
      if (stage === 'after_start') requireSuccess(await nested.docker(['start', id]), 'monthly_clock_failure_control_start');
      injected = true;
      throw new Error('monthly_clock_expected_cleanup_failure');
    } catch (error) {
      if (error.message !== 'monthly_clock_expected_cleanup_failure') throw error;
    } finally { await nested.removeAll(); }
    assert.ok(injected && nested.records.every(record => record.state === 'removed'));
    assert.ok(await owner.inspect(sentinel), 'Cleanup must preserve another run owner’s container');
    manifest.cleanupControls.push({ stage, injected, sentinelPreserved: true, runId: nested.runId, containers: nested.records });
  }
}
async function postgres(owner, profile, library) {
  const extras = ['--publish', '127.0.0.1::5432', '--env', 'TZ=UTC', '--env', 'POSTGRES_DB=lythaus_monthly_test',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'PGDATA=/tmp/pgdata', '--env', 'PGHOST=/tmp'];
  if (profile !== 'control') extras.push('--mount', `type=bind,src=${library},dst=/opt/lythaus-libfaketime.so.1,readonly`,
    '--env', 'LD_PRELOAD=/opt/lythaus-libfaketime.so.1', '--env', `FAKETIME=@${CLOCK_TEST_PINS[profile]}`,
    '--env', 'FAKETIME_DONT_FAKE_MONOTONIC=1', '--env', 'FAKETIME_DISABLE_SHM=1', '--env', 'FAKETIME_NO_CACHE=1');
  const id = await owner.create(profile, extras, ['postgres', '-c', 'unix_socket_directories=/tmp']);
  requireSuccess(await owner.docker(['start', id]), 'monthly_clock_postgres_start');
  const container = await owner.inspect(id);
  assert.equal(container.HostConfig.Privileged, false);
  assert.equal(container.Config.User, 'postgres');
  assert.deepEqual(container.HostConfig.CapDrop, ['ALL']);
  assert.ok(container.HostConfig.SecurityOpt.includes('no-new-privileges'));
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await owner.docker(['exec', id, 'env', '-u', 'LD_PRELOAD', '-u', 'FAKETIME', 'pg_isready', '-h', '/tmp', '-U', 'postgres', '-d', 'lythaus_monthly_test'])).code === 0)
      return { id, url: localDatabaseUrl(requireSuccess(await owner.docker(['port', id, '5432/tcp']), 'monthly_clock_published_port')) };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('monthly_clock_postgres_not_ready');
}
async function sql(owner, id, text) {
  return requireSuccess(await owner.docker(['exec', id, 'env', '-u', 'LD_PRELOAD', '-u', 'FAKETIME',
    'psql', '-h', '/tmp', '-U', 'postgres', '-d', 'lythaus_monthly_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text]), 'monthly_clock_sql_control');
}
async function library(owner, directory) {
  const archive = path.join(directory, 'libfaketime.deb');
  const stdoutFile = path.join(directory, 'library-install.log'), stderrFile = path.join(directory, 'library-install.stderr.log');
  requireSuccess(await command('curl', ['--disable', '--fail', '--location', '--silent', '--show-error',
    '--proto', '=https', '--proto-redir', '=https', '--max-time', '60', '--output', archive, CLOCK_TEST_PINS.libraryUrl],
  { env: publicDownloadEnvironment(process.env), stdoutFile, stderrFile }), 'monthly_clock_library_download');
  assert.equal(sha256(readFileSync(archive)), CLOCK_TEST_PINS.packageSha256);
  chmodSync(archive, 0o444);
  const destination = path.join(directory, 'libfaketime.so.1');
  const id = await owner.create('library', ['--network', 'none', '--mount', `type=bind,src=${archive},dst=/opt/libfaketime.deb,readonly`,
    '--entrypoint', '/bin/sh'], ['-ec', 'dpkg-deb --fsys-tarfile /opt/libfaketime.deb | tar -xOf - ./usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1']);
  requireSuccess(await owner.docker(['start', '--attach', id], { stdoutFile: destination, stderrFile }), 'monthly_clock_library_extract');
  assert.equal(sha256(readFileSync(destination)), CLOCK_TEST_PINS.librarySha256);
  chmodSync(destination, 0o444);
  return destination;
}
async function nodeFixture(directory, expectedSha, profile, url, args, execute = command) {
  const stdoutFile = path.join(directory, `${profile}.${profile.endsWith('-baseline') ? 'log' : 'tap'}`), stderrFile = path.join(directory, `${profile}.stderr.log`);
  const result = await execute(process.execPath, args, { stdoutFile, stderrFile,
    env: { ...safeEnvironment(), PLANETSCALE_PG17_TEST_DATABASE_URL: url,
      LYTHAUS_MONTHLY_SNAPSHOT_CLOCK_PROFILE: profile === 'premature' || profile === 'settled' ? 'settled' : 'auto' } });
  appendFileSync(stdoutFile, `\n# expected_checkout_sha ${expectedSha}\n# isolated_clock_profile ${profile}\n`);
  return { result, tap: readFileSync(stdoutFile, 'utf8') };
}
function artifactChecksums(directory) {
  const files = readdirSync(directory).filter(name => /\.(json|tap|log|mjs)$/.test(name)).sort();
  writeFileSync(path.join(directory, 'SHA256SUMS'), files.map(name => `${sha256(readFileSync(path.join(directory, name)))}  ${name}`).join('\n') + '\n');
}

export async function runClockValidation(expectedSha, artifactRoot) {
  const checkout = await verifyCheckout(expectedSha);
  const directory = path.join(path.resolve(artifactRoot), `${expectedSha}-${randomUUID()}`);
  mkdirSync(directory, { recursive: true });
  const owner = new DisposableContainers(directory, checkout.endpoint);
  const manifest = { ...checkout, runId: owner.runId, pins: CLOCK_TEST_PINS, nodeVersion: process.version,
    syntheticOnly: true, preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0,
    hostClockBefore: new Date().toISOString(), profiles: [], outcome: 'running', sourceFiles: {} };
  const manifestFile = path.join(directory, 'manifest.json');
  const save = () => writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Monthly snapshot clock evidence: ${directory}\n`);
  const files = ['scripts/ci/validate-monthly-snapshot-clock.mjs', 'scripts/tests/monthly-snapshot-clock.test.mjs', 'package-lock.json',
    'scripts/ci/validate-planetscale-postgres17.mjs',
    'scripts/ci/planetscale-migration-manifest.mjs', fixture, 'packages/db/src/monthly-reward-snapshots.ts',
    'packages/db/src/monthly-reputation.ts', 'database/planetscale/proposals/monthly_reward_snapshots.sql', '.github/workflows/native-planetscale-ci.yml'];
  for (const file of files) manifest.sourceFiles[file] = sha256(readFileSync(path.join(root, file)));
  writeFileSync(path.join(directory, 'test-helper.mjs'), readFileSync(fileURLToPath(import.meta.url)));
  save();
  let failure;
  try {
    await failureCleanupControls(owner, manifest); save();
    const shim = await library(owner, directory);
    const { loadApprovedMigrations } = await import('./planetscale-migration-manifest.mjs');
    const { migrations } = loadApprovedMigrations({ root });
    for (const profile of ['control', 'premature', 'settled']) {
      const target = await postgres(owner, profile, shim);
      const evidence = JSON.parse(await sql(owner, target.id, `SELECT json_build_object('serverClock',clock_timestamp(),
        'serverVersion',current_setting('server_version_num'),'database',current_database(),
        'settled',clock_timestamp() >= '2026-11-04T00:00:00Z'::timestamptz)`));
      assert.equal(evidence.database, 'lythaus_monthly_test'); assert.equal(evidence.serverVersion, '170011');
      evidence.profile = profile; evidence.containerId = target.id; evidence.clientClock = new Date().toISOString();
      if (profile === 'control') assert.ok(Math.abs(Date.parse(evidence.serverClock) - Date.now()) < 30000, 'Node/client and ordinary PG clocks must agree');
      else assert.equal(evidence.settled, profile === 'settled');
      const baseline = await nodeFixture(directory, expectedSha, `${profile}-baseline`, target.url, ['scripts/ci/validate-planetscale-postgres17.mjs']);
      requireSuccess(baseline.result, 'monthly_clock_baseline');
      const recorded = JSON.parse(await sql(owner, target.id, `SELECT json_agg(json_build_object('name',version,'checksum',checksum) ORDER BY version) FROM system.schema_migrations`));
      assert.deepEqual(recorded, migrations.map(migration => ({ name: migration.name, checksum: migration.checksum })));
      evidence.baseline = { validated: true, count: recorded.length, sha256: sha256(JSON.stringify(recorded)) };
      const args = ['--experimental-strip-types', '--experimental-test-module-mocks', '--test-reporter=tap'];
      if (profile === 'premature') {
        const before = await sql(owner, target.id, `SELECT json_build_object('users',(SELECT count(*) FROM identity.users),
          'sources',to_regclass('trust.monthly_reputation_sources'),'snapshots',to_regclass('trust.monthly_reward_snapshots'))`);
        const refused = await nodeFixture(directory, expectedSha, profile, target.url, [...args, '--test', fixture]);
        assert.notEqual(refused.result.code, 0);
        assert.match(readFileSync(path.join(directory, `${profile}.stderr.log`), 'utf8') + refused.tap,
          /snapshot_positive_profile_requires_actual_postgresql_settlement_clock/);
        const after = await sql(owner, target.id, `SELECT json_build_object('users',(SELECT count(*) FROM identity.users),
          'sources',to_regclass('trust.monthly_reputation_sources'),'snapshots',to_regclass('trust.monthly_reward_snapshots'))`);
        assert.equal(after, before); evidence.prematureProfileRefused = true; evidence.fixtureWrites = false;
      } else if (profile === 'settled') {
        const positive = await nodeFixture(directory, expectedSha, profile, target.url, [...args, '--experimental-test-coverage',
          '--test-coverage-include=packages/db/src/monthly-reward-snapshots.ts', '--test-coverage-include=apps/lythaus-jobs/src/monthly-reward-snapshots.ts',
          '--test-coverage-lines=80', '--test-coverage-branches=80', '--test', fixture]);
        requireSuccess(positive.result, 'monthly_clock_positive_tests'); evidence.tests = validatePositiveTap(positive.tap);
      }
      manifest.profiles.push(evidence); save();
      requireSuccess(await owner.docker(['logs', target.id], { stdoutFile: path.join(directory, `${profile}-postgres.log`),
        stderrFile: path.join(directory, `${profile}-postgres.stderr.log`) }), 'monthly_clock_server_logs');
    }
    await verifyCheckout(expectedSha); manifest.outcome = 'passed';
  } catch (error) { failure = error; manifest.outcome = 'failed'; manifest.error = error.message; }
  finally {
    try { await owner.removeAll(); manifest.cleanupComplete = true; }
    catch (error) { failure ??= error; manifest.outcome = 'failed'; manifest.cleanupComplete = false; manifest.cleanupError = error.message; }
    manifest.containers = owner.records; manifest.hostClockAfter = new Date().toISOString(); save(); artifactChecksums(directory);
  }
  if (failure) throw failure;
  process.stdout.write(`Validated ${expectedSha}: premature refusal, baseline controls, 32 positive-profile tests / zero skips, ID-only cleanup\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { 'expected-sha': { type: 'string' }, 'artifacts-dir': { type: 'string', default: '.artifacts/monthly-snapshot-clock' } } });
    await runClockValidation(values['expected-sha'], values['artifacts-dir']);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
