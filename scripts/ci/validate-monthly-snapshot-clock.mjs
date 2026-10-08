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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const cleanupMilliseconds = 30000;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safeEnvironment = () => ({ PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' });

export class Interruption {
  constructor() {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.handlers = new Map(['SIGINT', 'SIGTERM'].map(name => [name, () => {
      this.received ??= name;
      const error = new Error(`monthly_clock_interrupted:${this.received}`);
      error.cleanupDeadline = Date.now() + cleanupMilliseconds;
      this.controller.abort(error);
    }]));
    for (const [name, handler] of this.handlers) process.on(name, handler);
  }
  dispose() { for (const [name, handler] of this.handlers) process.removeListener(name, handler); }
  get exitCode() { return this.received === 'SIGINT' ? 130 : this.received === 'SIGTERM' ? 143 : undefined; }
}

export async function command(executable, args, { cwd = root, env = safeEnvironment(), stdoutFile, stderrFile, timeout = 180000, signal } = {}) {
  signal?.throwIfAborted();
  for (const file of [stdoutFile, stderrFile]) if (file && !existsSync(file)) writeFileSync(file, '');
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, stopping = false, closed, escalation;
    const kill = name => {
      if (!child.pid) return;
      try { process.kill(-child.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    const finish = () => {
      if (!closed || escalation) return;
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (signal?.aborted) reject(signal.reason);
      else if (timedOut) reject(new Error('monthly_clock_command_timeout'));
      else resolve(closed);
    };
    const stop = () => {
      if (stopping) return;
      stopping = true; kill('SIGTERM');
      escalation = setTimeout(() => { kill('SIGKILL'); escalation = undefined; finish(); }, 1000);
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout.on('data', bytes => { if (stdoutFile) appendFileSync(stdoutFile, bytes); else stdout += bytes; });
    child.stderr.on('data', bytes => { if (stderrFile) appendFileSync(stderrFile, bytes); else stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); clearTimeout(escalation); signal?.removeEventListener('abort', stop); reject(error); });
    child.on('close', (code, signal) => {
      closed = { code, signal, stdout: stdout.trim(), stderr: stderr.trim() }; finish();
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
  if (endpoint !== 'unix:///var/run/docker.sock') throw new Error('monthly_clock_remote_docker_refused');
  return endpoint;
}
export function publicDownloadEnvironment(env) {
  const result = safeEnvironment();
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
    if (!env[key]) continue;
    const proxy = new URL(env[key]);
    if (!['http:', 'https:'].includes(proxy.protocol) || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== '/')
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
  constructor(directory, endpoint, execute = command, { runId = randomUUID(), expectedSha = null, signal, register, journal } = {}) {
    this.directory = directory;
    this.runId = runId;
    this.expectedSha = expectedSha;
    this.signal = signal;
    this.execute = execute;
    this.records = journal?.containers ?? [];
    this.creations = journal?.creations ?? [];
    this.interruption = journal?.interruption;
    this.env = { ...safeEnvironment(), DOCKER_HOST: endpoint, DOCKER_CONFIG: path.join(directory, 'docker-config') };
    mkdirSync(this.env.DOCKER_CONFIG, { recursive: true });
    if (!journal) this.save(); register?.(this);
  }
  async docker(args, options = {}) { return await this.execute('docker', args, { signal: this.signal, ...options, env: this.env }); }
  save() { writeFileSync(path.join(this.directory, `resources-${this.runId}.json`), `${JSON.stringify({ expectedSha: this.expectedSha,
    runId: this.runId, containers: this.records, creations: this.creations, interruption: this.interruption }, null, 2)}\n`); }
  recoverCidfiles() {
    for (const creation of this.creations) {
      const cidfile = path.join(this.directory, creation.cidfile);
      if (!existsSync(cidfile)) continue;
      const id = readFileSync(cidfile, 'utf8').trim();
      if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('monthly_clock_container_id_invalid');
      const previous = this.records.find(record => record.profile === creation.profile);
      if (previous && previous.id !== id) throw new Error('monthly_clock_container_id_mismatch');
      if (!previous) this.records.push({ id, name: creation.name, profile: creation.profile, state: 'created' });
    }
    this.save();
  }
  async create(profile, extras = [], commandArgs = []) {
    this.signal?.throwIfAborted();
    if (!/^[a-z][a-z0-9_-]*$/.test(profile) || this.creations.some(item => item.profile === profile))
      throw new Error('monthly_clock_container_profile_invalid');
    const name = `lythaus-monthly-clock-${profile}-${this.runId}`;
    const cidfile = path.join(this.directory, `${profile}-${this.runId}.cid`);
    this.creations.push({ profile, name, cidfile: path.basename(cidfile) }); this.save();
    try {
      requireSuccess(await this.docker(['create', '--cidfile', cidfile, '--name', name,
        '--label', `${labelKey}=${this.runId}`, '--platform', 'linux/amd64', '--user', 'postgres',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
        '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777,size=256m', ...extras, CLOCK_TEST_PINS.image, ...commandArgs]), 'monthly_clock_container_create');
    } finally {
      this.recoverCidfiles();
    }
    return this.records.at(-1).id;
  }
  async inspect(id, options = {}) {
    const result = await this.docker(['container', 'inspect', id], options);
    if (result.code !== 0 && /No such (?:container|object)/i.test(result.stderr)) return null;
    return JSON.parse(requireSuccess(result, 'monthly_clock_container_inspect'))[0];
  }
  async removeAll({ deadline = this.signal?.reason?.cleanupDeadline ?? Date.now() + cleanupMilliseconds } = {}) {
    this.recoverCidfiles();
    const failures = [];
    const options = () => {
      if (Date.now() >= deadline) throw new Error('monthly_clock_cleanup_deadline');
      return { signal: null, timeout: Math.min(5000, deadline - Date.now()) };
    };
    for (const record of [...this.records].reverse()) {
      try {
        const container = await this.inspect(record.id, options());
        if (container && container.Config.Labels?.[labelKey] !== this.runId) throw new Error('monthly_clock_cleanup_ownership_mismatch');
        if (container) requireSuccess(await this.docker(['rm', '--force', '--volumes', record.id], options()), 'monthly_clock_container_cleanup');
        assert.equal(await this.inspect(record.id, options()), null);
        record.state = 'removed'; delete record.error;
      } catch (error) { record.state = 'cleanup_failed'; record.error = error.message; failures.push(error); }
      this.save();
    }
    if (failures.length) throw new AggregateError(failures, 'monthly_clock_cleanup_failed');
  }
}

async function failureCleanupControls(owner, manifest, register) {
  const sentinel = await owner.create('sentinel', ['--network', 'none', '--entrypoint', '/bin/true']);
  manifest.cleanupControls = [];
  for (const stage of ['after_create', 'after_start']) {
    const nested = new DisposableContainers(owner.directory, owner.env.DOCKER_HOST, command,
      { expectedSha: owner.expectedSha, signal: owner.signal, register });
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
async function postgres(owner, profile, library, checkpoint) {
  const extras = ['--publish', '127.0.0.1::5432', '--env', 'TZ=UTC', '--env', 'POSTGRES_DB=lythaus_monthly_test',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'PGDATA=/tmp/pgdata',
    '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,uid=999,gid=999,mode=3775'];
  if (profile !== 'control') extras.push('--mount', `type=bind,src=${library},dst=/opt/lythaus-libfaketime.so.1,readonly`,
    '--env', 'LD_PRELOAD=/opt/lythaus-libfaketime.so.1', '--env', `FAKETIME=@${CLOCK_TEST_PINS[profile]}`,
    '--env', 'FAKETIME_DONT_FAKE_MONOTONIC=1', '--env', 'FAKETIME_DISABLE_SHM=1', '--env', 'FAKETIME_NO_CACHE=1');
  const id = await owner.create(profile, extras, ['postgres']);
  requireSuccess(await owner.docker(['start', id]), 'monthly_clock_postgres_start');
  await checkpoint?.('startup', id);
  const container = await owner.inspect(id);
  assert.equal(container.HostConfig.Privileged, false);
  assert.equal(container.HostConfig.ReadonlyRootfs, true);
  assert.equal(container.Config.User, 'postgres');
  assert.deepEqual(container.HostConfig.CapDrop, ['ALL']);
  assert.ok(container.HostConfig.SecurityOpt.includes('no-new-privileges'));
  owner.records.find(record => record.id === id).safety = { user: container.Config.User, privileged: false,
    readonlyRootfs: true, capabilitiesDropped: container.HostConfig.CapDrop, image: container.Config.Image, imageId: container.Image };
  owner.save();
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await owner.docker(['exec', id, 'env', '-u', 'LD_PRELOAD', '-u', 'FAKETIME',
      'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'lythaus_monthly_test', '-At', '-c', 'SELECT 1'])).code === 0)
      {
        await checkpoint?.('running', id);
        return { id, url: localDatabaseUrl(requireSuccess(await owner.docker(['port', id, '5432/tcp']), 'monthly_clock_published_port')) };
      }
    if (!(await owner.inspect(id)).State.Running) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await owner.docker(['logs', id], { stdoutFile: path.join(owner.directory, `${profile}-startup.log`),
    stderrFile: path.join(owner.directory, `${profile}-startup.stderr.log`) });
  throw new Error('monthly_clock_postgres_not_ready');
}
async function sql(owner, id, text) {
  return requireSuccess(await owner.docker(['exec', id, 'env', '-u', 'LD_PRELOAD', '-u', 'FAKETIME',
    'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'lythaus_monthly_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text]), 'monthly_clock_sql_control');
}
async function library(owner, directory) {
  const archive = path.join(directory, 'libfaketime.deb');
  const stdoutFile = path.join(directory, 'library-install.log'), stderrFile = path.join(directory, 'library-install.stderr.log');
  requireSuccess(await command('curl', ['--disable', '--fail', '--location', '--silent', '--show-error',
    '--proto', '=https', '--proto-redir', '=https', '--max-time', '60', '--output', archive, CLOCK_TEST_PINS.libraryUrl],
  { env: publicDownloadEnvironment(process.env), stdoutFile, stderrFile, signal: owner.signal }), 'monthly_clock_library_download');
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
async function nodeFixture(directory, expectedSha, profile, url, args, signal, execute = command) {
  const stdoutFile = path.join(directory, `${profile}.${profile.endsWith('-baseline') ? 'log' : 'tap'}`), stderrFile = path.join(directory, `${profile}.stderr.log`);
  const result = await execute(process.execPath, args, { stdoutFile, stderrFile, signal,
    env: { ...safeEnvironment(), PLANETSCALE_PG17_TEST_DATABASE_URL: url,
      LYTHAUS_MONTHLY_SNAPSHOT_CLOCK_PROFILE: profile === 'premature' || profile === 'settled' ? 'settled' : 'auto' } });
  appendFileSync(stdoutFile, `\n# expected_checkout_sha ${expectedSha}\n# isolated_clock_profile ${profile}\n`);
  return { result, tap: readFileSync(stdoutFile, 'utf8') };
}
function artifactChecksums(directory) {
  const files = readdirSync(directory).filter(name => /\.(json|tap|log|mjs)$/.test(name)).sort();
  writeFileSync(path.join(directory, 'SHA256SUMS'), files.map(name => `${sha256(readFileSync(path.join(directory, name)))}  ${name}`).join('\n') + '\n');
}

export function createEvidenceRun(checkout, artifactRoot, { mode = 'validation', signal, publishOutput = true } = {}) {
  const directory = path.join(path.resolve(artifactRoot), `${checkout.expectedSha}-${randomUUID()}`);
  if (/[\r\n]/.test(directory)) throw new Error('monthly_clock_evidence_path_invalid');
  mkdirSync(directory, { recursive: true });
  const owner = new DisposableContainers(directory, checkout.endpoint, command, { expectedSha: checkout.expectedSha, signal });
  const manifest = { ...checkout, runId: owner.runId, pins: CLOCK_TEST_PINS, nodeVersion: process.version, mode,
    syntheticOnly: true, preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0,
    hostClockBefore: new Date().toISOString(), profiles: [], outcome: 'running', sourceFiles: {}, resourceOwners: [owner.runId],
    cleanupBudgetMilliseconds: cleanupMilliseconds,
    interruptionLimits: ['SIGKILL cannot be caught', 'Runner or Docker daemon loss can prevent cleanup',
      'An ID lost before Docker persists its cidfile cannot be safely discovered by a global scan'] };
  const save = () => writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const register = nested => { manifest.resourceOwners.push(nested.runId); save(); };
  save();
  if (publishOutput && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `evidence_directory=${directory}\n`);
  return { directory, owner, manifest, save, register };
}

function readEvidenceRun(directory, expectedSha) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha ?? '') || !path.isAbsolute(directory)) throw new Error('monthly_clock_cleanup_target_invalid');
  const suffix = path.basename(directory).slice(expectedSha.length + 1);
  if (path.basename(directory) !== `${expectedSha}-${suffix}` || !uuidPattern.test(suffix)) throw new Error('monthly_clock_cleanup_target_invalid');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.expectedSha !== expectedSha || manifest.head !== expectedSha || !uuidPattern.test(manifest.runId)
    || !Array.isArray(manifest.resourceOwners) || !manifest.resourceOwners.includes(manifest.runId)
    || new Set(manifest.resourceOwners).size !== manifest.resourceOwners.length || manifest.resourceOwners.some(id => !uuidPattern.test(id)))
    throw new Error('monthly_clock_cleanup_manifest_invalid');
  return manifest;
}
export function restoreOwner(directory, endpoint, expectedSha, runId, execute = command) {
  const manifest = readEvidenceRun(directory, expectedSha);
  if (!manifest.resourceOwners.includes(runId)) throw new Error('monthly_clock_cleanup_owner_unregistered');
  const journal = JSON.parse(readFileSync(path.join(directory, `resources-${runId}.json`), 'utf8'));
  if (journal.expectedSha !== expectedSha || journal.runId !== runId || !Array.isArray(journal.containers) || !Array.isArray(journal.creations))
    throw new Error('monthly_clock_cleanup_journal_invalid');
  for (const creation of journal.creations) {
    if (!/^[a-z][a-z0-9_-]*$/.test(creation.profile) || creation.name !== `lythaus-monthly-clock-${creation.profile}-${runId}`
      || creation.cidfile !== `${creation.profile}-${runId}.cid`) throw new Error('monthly_clock_cleanup_journal_invalid');
  }
  if (new Set(journal.creations.map(item => item.profile)).size !== journal.creations.length)
    throw new Error('monthly_clock_cleanup_journal_invalid');
  for (const record of journal.containers) {
    if (!/^[0-9a-f]{64}$/.test(record.id) || !journal.creations.some(item => item.profile === record.profile && item.name === record.name))
      throw new Error('monthly_clock_cleanup_journal_invalid');
  }
  if (new Set(journal.containers.map(item => item.id)).size !== journal.containers.length
    || new Set(journal.containers.map(item => item.profile)).size !== journal.containers.length)
    throw new Error('monthly_clock_cleanup_journal_invalid');
  return new DisposableContainers(directory, endpoint, execute, { runId, expectedSha, journal });
}
export async function cleanupEvidenceRun(directory, expectedSha, endpoint = validateEnvironment(process.env), deadline = Date.now() + cleanupMilliseconds) {
  const manifest = readEvidenceRun(directory, expectedSha), failures = [], owners = [];
  for (const runId of [...manifest.resourceOwners].reverse()) {
    try {
      const owner = restoreOwner(directory, endpoint, expectedSha, runId);
      await owner.removeAll({ deadline }); owners.push({ runId, containers: owner.records });
    } catch (error) { failures.push(error); }
  }
  manifest.cleanupFallback = { complete: failures.length === 0, owners, clock: new Date().toISOString(),
    errors: failures.map(error => error.message) };
  writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`); artifactChecksums(directory);
  if (failures.length) throw new AggregateError(failures, 'monthly_clock_fallback_cleanup_failed');
  return manifest.cleanupFallback;
}

export async function runInterruptionProbe(expectedSha, directory, runId, phase, interruption) {
  const checkout = await verifyCheckout(expectedSha, { execute: (executable, args, options) => command(executable, args, { ...options, signal: interruption.signal }) });
  if (!['startup', 'running'].includes(phase)) throw new Error('monthly_clock_interruption_phase_invalid');
  const owner = restoreOwner(directory, checkout.endpoint, expectedSha, runId);
  if (owner.records.length || owner.creations.length) throw new Error('monthly_clock_probe_owner_already_used');
  owner.signal = interruption.signal;
  let failure;
  try {
    await postgres(owner, 'control', undefined, async stage => {
      if (stage !== phase) return;
      owner.interruption = { phase, ready: true, clientClock: new Date().toISOString() }; owner.save();
      await command(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('interruptible_child_ready'); setInterval(() => {}, 1000)"],
        { signal: interruption.signal, timeout: 60000, stdoutFile: path.join(directory, `${phase}-${runId}-probe.log`) });
    });
    throw new Error('monthly_clock_interruption_probe_not_interrupted');
  } catch (error) { failure = error; }
  finally {
    try { await owner.removeAll(); }
    catch (error) { failure ??= error; }
    owner.interruption = { ...owner.interruption, received: interruption.received, exitCode: interruption.exitCode ?? 1,
      cleanupComplete: owner.records.every(record => record.state === 'removed'), error: failure?.message }; owner.save();
  }
  throw failure;
}

export async function runClockValidation(expectedSha, artifactRoot, interruption) {
  const execute = (executable, args, options) => command(executable, args, { ...options, signal: interruption?.signal });
  const checkout = await verifyCheckout(expectedSha, { execute });
  interruption?.signal.throwIfAborted();
  const { directory, owner, manifest, save, register } = createEvidenceRun(checkout, artifactRoot, { signal: interruption?.signal });
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
    await failureCleanupControls(owner, manifest, register); save();
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
      const baseline = await nodeFixture(directory, expectedSha, `${profile}-baseline`, target.url, ['scripts/ci/validate-planetscale-postgres17.mjs'], owner.signal);
      requireSuccess(baseline.result, 'monthly_clock_baseline');
      const recorded = JSON.parse(await sql(owner, target.id, `SELECT json_agg(json_build_object('name',version,'checksum',checksum) ORDER BY version) FROM system.schema_migrations`));
      assert.deepEqual(recorded, migrations.map(migration => ({ name: migration.name, checksum: migration.checksum })));
      evidence.baseline = { validated: true, count: recorded.length, sha256: sha256(JSON.stringify(recorded)) };
      const args = ['--experimental-strip-types', '--experimental-test-module-mocks', '--test-reporter=tap'];
      if (profile === 'premature') {
        const before = await sql(owner, target.id, `SELECT json_build_object('users',(SELECT count(*) FROM identity.users),
          'sources',to_regclass('trust.monthly_reputation_sources'),'snapshots',to_regclass('trust.monthly_reward_snapshots'))`);
        const refused = await nodeFixture(directory, expectedSha, profile, target.url, [...args, '--test', fixture], owner.signal);
        assert.notEqual(refused.result.code, 0);
        assert.match(readFileSync(path.join(directory, `${profile}.stderr.log`), 'utf8') + refused.tap,
          /snapshot_positive_profile_requires_actual_postgresql_settlement_clock/);
        const after = await sql(owner, target.id, `SELECT json_build_object('users',(SELECT count(*) FROM identity.users),
          'sources',to_regclass('trust.monthly_reputation_sources'),'snapshots',to_regclass('trust.monthly_reward_snapshots'))`);
        assert.equal(after, before); evidence.prematureProfileRefused = true; evidence.fixtureWrites = false; evidence.fixtureState = JSON.parse(after);
      } else if (profile === 'settled') {
        const positive = await nodeFixture(directory, expectedSha, profile, target.url, [...args, '--experimental-test-coverage',
          '--test-coverage-include=packages/db/src/monthly-reward-snapshots.ts', '--test-coverage-include=apps/lythaus-jobs/src/monthly-reward-snapshots.ts',
          '--test-coverage-lines=80', '--test-coverage-branches=80', '--test', fixture], owner.signal);
        requireSuccess(positive.result, 'monthly_clock_positive_tests'); evidence.tests = validatePositiveTap(positive.tap);
      }
      manifest.profiles.push(evidence); save();
      requireSuccess(await owner.docker(['logs', target.id], { stdoutFile: path.join(directory, `${profile}-postgres.log`),
        stderrFile: path.join(directory, `${profile}-postgres.stderr.log`) }), 'monthly_clock_server_logs');
    }
    await verifyCheckout(expectedSha, { execute }); manifest.outcome = 'passed';
  } catch (error) { failure = error; manifest.outcome = 'failed'; manifest.error = error.message; }
  finally {
    save();
    try { await cleanupEvidenceRun(directory, expectedSha, checkout.endpoint, interruption?.signal.reason?.cleanupDeadline); manifest.cleanupComplete = true; }
    catch (error) { failure ??= error; manifest.outcome = 'failed'; manifest.cleanupComplete = false; manifest.cleanupError = error.message; }
    manifest.cleanupFallback = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')).cleanupFallback;
    manifest.containers = restoreOwner(directory, checkout.endpoint, expectedSha, owner.runId).records;
    if (interruption?.received) {
      manifest.interruption = { signal: interruption.received, exitCode: interruption.exitCode };
      manifest.outcome = 'interrupted'; failure ??= interruption.signal.reason;
    }
    manifest.hostClockAfter = new Date().toISOString(); save(); artifactChecksums(directory);
  }
  if (failure) throw failure;
  process.stdout.write(`Validated ${expectedSha}: premature refusal, baseline controls, 32 positive-profile tests / zero skips, ID-only cleanup\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const interruption = new Interruption();
  try {
    const { values } = parseArgs({ options: { 'expected-sha': { type: 'string' }, 'artifacts-dir': { type: 'string', default: '.artifacts/monthly-snapshot-clock' },
      'cleanup-run': { type: 'string' }, 'interruption-probe': { type: 'string' }, 'probe-directory': { type: 'string' }, 'probe-owner-id': { type: 'string' } } });
    if (values['cleanup-run'] && values['interruption-probe']) throw new Error('monthly_clock_cli_mode_conflict');
    if (values['cleanup-run']) {
      const checkout = await verifyCheckout(values['expected-sha']);
      await cleanupEvidenceRun(values['cleanup-run'], checkout.expectedSha, checkout.endpoint);
    } else if (values['interruption-probe']) {
      await runInterruptionProbe(values['expected-sha'], values['probe-directory'], values['probe-owner-id'], values['interruption-probe'], interruption);
    } else await runClockValidation(values['expected-sha'], values['artifacts-dir'], interruption);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = interruption.exitCode ?? 1; }
  finally { process.exitCode = interruption.exitCode ?? process.exitCode; interruption.dispose(); }
}
