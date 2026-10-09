import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CLOCK_TEST_PINS, DisposableContainers, localDatabaseUrl, validateEnvironment,
  validatePositiveTap, verifyCheckout, publicDownloadEnvironment, command, createEvidenceRun,
  cleanupEvidenceRun, restoreOwner, resumeInterruptionEvidenceRun, runInterruptionControls } from '../ci/validate-monthly-snapshot-clock.mjs';

const expectedSha = '1'.repeat(40);
const ok = stdout => ({ code: 0, stdout, stderr: '' });
test('Expected checkout SHA is mandatory and mismatch refuses execution before preparation', async () => {
  for (const sha of [undefined, '', 'main', '1'.repeat(39), 'A'.repeat(40)])
    await assert.rejects(verifyCheckout(sha), /expected_sha_required/);
  const commands = [];
  await assert.rejects(verifyCheckout(expectedSha, { env: {}, version: CLOCK_TEST_PINS.node,
    execute: async (executable, args) => { commands.push([executable, args]); return ok('2'.repeat(40)); } }), /checkout_sha_mismatch/);
  assert.deepEqual(commands, [['git', ['rev-parse', 'HEAD']]]);
});
test('Exact clean checkout and pinned Node are required', async () => {
  await assert.rejects(verifyCheckout(expectedSha, { env: {}, version: 'v24.0.0' }), /node_version_mismatch/);
  await assert.rejects(verifyCheckout(expectedSha, { env: {}, version: CLOCK_TEST_PINS.node,
    execute: async (_executable, args) => args[0] === 'rev-parse' ? ok(expectedSha) : { code: 1, stderr: '' } }), /dirty_checkout/);
  assert.equal((await verifyCheckout(expectedSha, { env: {}, version: CLOCK_TEST_PINS.node,
    execute: async (_executable, args) => ok(args[0] === 'rev-parse' ? expectedSha : '') })).head, expectedSha);
});
test('Inherited database targets, client clock injection and remote Docker are refused without logging values', () => {
  for (const key of ['PLANETSCALE_PG17_TEST_DATABASE_URL', 'DATABASE_URL', 'PGHOST', 'PGPASSWORD', 'PGSERVICE',
    'NODE_OPTIONS', 'LD_PRELOAD', 'FAKETIME', 'FAKETIME_NO_CACHE'])
    assert.throws(() => validateEnvironment({ [key]: 'synthetic-forbidden-value' }), /inherited_environment_refused/);
  for (const env of [{ DOCKER_HOST: 'tcp://127.0.0.1:2375' }, { DOCKER_HOST: 'ssh://database.example.invalid' },
    { DOCKER_HOST: 'unix:///run/production.sock' }, { DOCKER_CONTEXT: 'production' }])
    assert.throws(() => validateEnvironment(env), /remote_docker_refused/);
  assert.equal(validateEnvironment({}), 'unix:///var/run/docker.sock');
});
test('Database URL is constructed exclusively from an owned loopback Docker port', () => {
  assert.equal(localDatabaseUrl('127.0.0.1:32768\n'), 'postgresql://postgres@127.0.0.1:32768/lythaus_monthly_test?sslmode=disable');
  for (const port of ['0.0.0.0:5432', 'database.example.invalid:5432', '[::]:5432', '127.0.0.1:5432\n0.0.0.0:5432', '127.0.0.1:1', '127.0.0.1:65536'])
    assert.throws(() => localDatabaseUrl(port), /nonlocal_port_refused/);
});
test('Public dependency fetch cannot forward credentials, tokens or host clock injection', () => {
  for (const proxy of ['http://user:synthetic@proxy.example.invalid', 'file:///tmp/proxy', 'http://proxy.example.invalid/?token=synthetic'])
    assert.throws(() => publicDownloadEnvironment({ HTTPS_PROXY: proxy }), /credentialed_proxy_refused/);
  const env = publicDownloadEnvironment({ HTTPS_PROXY: 'http://127.0.0.1:8080', GITHUB_TOKEN: 'synthetic', LD_PRELOAD: 'synthetic' });
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:8080');
  assert.equal(env.GITHUB_TOKEN, undefined); assert.equal(env.LD_PRELOAD, undefined);
});
test('Successful empty-output commands still produce checksumable stdout and stderr evidence', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const stdoutFile = path.join(directory, 'stdout.log'), stderrFile = path.join(directory, 'stderr.log');
    assert.equal((await command(process.execPath, ['-e', 'process.exit(0)'], { stdoutFile, stderrFile })).code, 0);
    assert.equal(readFileSync(stdoutFile, 'utf8'), ''); assert.equal(readFileSync(stderrFile, 'utf8'), '');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('Positive evidence requires every expected test, all six named positive cases and zero skips', () => {
  const tap = `${Array.from({ length: 6 }, (_, index) => `ok ${index + 1} - V2 case POSITIVE: ${index}`).join('\n')}\n# tests 32\n# pass 32\n# fail 0\n# skipped 0\n`;
  assert.equal(validatePositiveTap(tap).positiveCases, 6);
  for (const altered of [tap.replace('# skipped 0', '# skipped 6'), tap.replace('# pass 32', '# pass 26'),
    tap.replace('ok 1 -', 'not ok 1 -'), tap.replace('POSITIVE: 0', 'OTHER: 0'), tap.replace('POSITIVE: 0', 'POSITIVE: 0 # SKIP')])
    assert.throws(() => validatePositiveTap(altered), /positive_/);
});

function fakeDocker() {
  const containers = new Map(), removed = [], calls = [];
  let next = 1, failCreate = false;
  const execute = async (executable, args, options) => {
    assert.equal(executable, 'docker'); calls.push({ args, env: options.env });
    if (args[0] === 'create') {
      const id = (next++).toString(16).padStart(64, '0');
      const label = args[args.indexOf('--label') + 1], split = label.indexOf('=');
      containers.set(id, { Id: id, Config: { Labels: { [label.slice(0, split)]: label.slice(split + 1) } } });
      writeFileSync(args[args.indexOf('--cidfile') + 1], id);
      return failCreate ? { code: 1, stderr: 'synthetic interrupted create' } : ok(id);
    }
    if (args[0] === 'container') return containers.has(args[2]) ? ok(JSON.stringify([containers.get(args[2])])) : { code: 1, stderr: 'No such container' };
    if (args[0] === 'rm') { removed.push(args.at(-1)); containers.delete(args.at(-1)); return ok(args.at(-1)); }
    throw new Error(`Unexpected Docker operation ${args[0]}`);
  };
  return { execute, containers, removed, calls, interruptCreate: () => { failCreate = true; } };
}
test('Random owners record container IDs and cleanup preserves another run even in the same directory', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const fake = fakeDocker(), first = new DisposableContainers(directory, 'unix:///var/run/docker.sock', fake.execute);
    const second = new DisposableContainers(directory, 'unix:///var/run/docker.sock', fake.execute);
    assert.notEqual(first.runId, second.runId);
    const owned = await first.create('failure'), sentinel = await second.create('failure');
    const command = fake.calls[0];
    assert.ok(command.args.includes('--read-only')); assert.ok(command.args.includes('no-new-privileges'));
    assert.equal(command.args[command.args.indexOf('--user') + 1], 'postgres');
    assert.equal(command.args[command.args.indexOf('--cap-drop') + 1], 'ALL');
    assert.ok(!command.args.includes('--privileged'));
    assert.equal(command.env.LD_PRELOAD, undefined); assert.equal(command.env.PGPASSWORD, undefined);
    assert.equal(JSON.parse(readFileSync(path.join(directory, `resources-${first.runId}.json`))).containers[0].id, owned);
    await first.removeAll(); await first.removeAll(); assert.deepEqual(fake.removed, [owned]); assert.ok(fake.containers.has(sentinel));
    await second.removeAll(); assert.equal(fake.containers.size, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('A failed create still records its cidfile and permits ID-only cleanup', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const fake = fakeDocker(), owner = new DisposableContainers(directory, 'unix:///var/run/docker.sock', fake.execute);
    fake.interruptCreate(); await assert.rejects(owner.create('interrupted'), /interrupted create/);
    assert.equal(owner.records.length, 1); await owner.removeAll();
    assert.deepEqual(fake.removed, [owner.records[0].id]); assert.equal(fake.containers.size, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('Cleanup reports an unresolved create without guessing a container name or scanning Docker', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const calls = [], owner = new DisposableContainers(directory, 'unix:///var/run/docker.sock', async (_executable, args) => {
      calls.push(args); return { code: 1, stderr: 'synthetic create without a persisted ID' };
    });
    await assert.rejects(owner.create('unknown'), /without a persisted ID/);
    await assert.rejects(owner.removeAll(), error => error.errors.some(cause => /unrecorded_creation/.test(cause.message)));
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'create');
    assert.equal(owner.records.length, 0); assert.equal(owner.creations.length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('Cleanup refuses a foreign ownership label instead of removing an unrelated container', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const fake = fakeDocker(), owner = new DisposableContainers(directory, 'unix:///var/run/docker.sock', fake.execute);
    const id = await owner.create('tampered'); fake.containers.get(id).Config.Labels = {};
    await assert.rejects(owner.removeAll(), /cleanup_failed/); assert.deepEqual(fake.removed, []);
    assert.ok(fake.containers.has(id)); assert.equal(owner.records[0].state, 'cleanup_failed');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('An expired cleanup deadline preserves recorded IDs for a later bounded retry', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const fake = fakeDocker(), owner = new DisposableContainers(directory, 'unix:///var/run/docker.sock', fake.execute);
    const id = await owner.create('deadline');
    await assert.rejects(owner.removeAll({ deadline: Date.now() - 1 }), /cleanup_failed/);
    assert.deepEqual(fake.removed, []); assert.equal(owner.records[0].state, 'cleanup_failed');
    await owner.removeAll(); assert.deepEqual(fake.removed, [id]); assert.equal(owner.records[0].state, 'removed');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Fallback restores only SHA-bound registered journals and recovers an interrupted create cidfile', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const scope = createEvidenceRun({ expectedSha, head: expectedSha, endpoint: 'unix:///var/run/docker.sock' }, temporary, { publishOutput: false });
    const fake = fakeDocker(); scope.owner.execute = fake.execute;
    const id = await scope.owner.create('partial');
    const file = path.join(scope.directory, `resources-${scope.owner.runId}.json`);
    const journal = JSON.parse(readFileSync(file)); journal.containers = []; writeFileSync(file, JSON.stringify(journal));
    const restored = restoreOwner(scope.directory, scope.owner.env.DOCKER_HOST, expectedSha, scope.owner.runId, fake.execute);
    await restored.removeAll(); await restored.removeAll(); assert.deepEqual(fake.removed, [id]);
    assert.throws(() => restoreOwner(scope.directory, scope.owner.env.DOCKER_HOST, '2'.repeat(40), scope.owner.runId), /cleanup_target_invalid/);
    assert.throws(() => restoreOwner(scope.directory, scope.owner.env.DOCKER_HOST, expectedSha, '00000000-0000-4000-8000-000000000000'), /owner_unregistered/);
    const invalid = JSON.parse(readFileSync(file)); invalid.creations[0].cidfile = '../foreign.cid'; writeFileSync(file, JSON.stringify(invalid));
    assert.throws(() => restoreOwner(scope.directory, scope.owner.env.DOCKER_HOST, expectedSha, scope.owner.runId), /journal_invalid/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('Aborting an active command drains its process group with bounded escalation', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const controller = new AbortController(), log = path.join(directory, 'ready.log');
    const work = command(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"],
      { signal: controller.signal, stdoutFile: log });
    const rejected = assert.rejects(work, /synthetic_interruption/);
    await waitUntil(() => existsSync(log) && readFileSync(log, 'utf8').includes('ready'), 5000);
    const started = Date.now(); controller.abort(new Error('synthetic_interruption')); await rejected;
    assert.ok(Date.now() - started < 3000);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

async function waitUntil(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('monthly_clock_interruption_checkpoint_timeout');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

test('Standalone controls finalizer cleans only its published journal after child interruption', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const fake = fakeDocker(), controller = new AbortController();
    const interruption = { signal: controller.signal, received: undefined, exitCode: undefined };
    const checkout = { expectedSha, head: expectedSha, endpoint: 'unix:///var/run/docker.sock' };
    const unrelated = new DisposableContainers(temporary, checkout.endpoint, fake.execute);
    const sentinel = await unrelated.create('outside');
    let directory, owned;
    const execute = async (executable, args, options) => {
      if (executable === 'docker') return await fake.execute(executable, args, options);
      assert.equal(executable, process.execPath); assert.equal(options.killGraceMilliseconds, 4000);
      directory = options.env.LYTHAUS_MONTHLY_CLOCK_CONTROL_DIRECTORY;
      const scope = resumeInterruptionEvidenceRun(checkout, directory, fake.execute);
      owned = await scope.owner.create('interrupted-suite');
      writeFileSync(options.stdoutFile, 'TAP version 13\n'); writeFileSync(options.stderrFile, '');
      interruption.received = 'SIGTERM'; interruption.exitCode = 143;
      const reason = new Error('monthly_clock_interrupted:SIGTERM'); reason.cleanupDeadline = Date.now() + 30000;
      controller.abort(reason); throw reason;
    };
    await assert.rejects(runInterruptionControls(checkout, temporary, interruption, execute, false), /interrupted:SIGTERM/);
    const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json')));
    assert.equal(manifest.outcome, 'interrupted'); assert.equal(manifest.interruption.exitCode, 143);
    assert.equal(manifest.cleanupComplete, true); assert.deepEqual(fake.removed, [owned]); assert.ok(fake.containers.has(sentinel));
    await cleanupEvidenceRun(directory, expectedSha, checkout.endpoint, undefined, fake.execute);
    assert.deepEqual(fake.removed, [owned]); assert.throws(() => resumeInterruptionEvidenceRun(checkout, directory), /resume_invalid/);
    await unrelated.removeAll();
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('Real helper SIGINT/SIGTERM during startup and running preserve failure status and remove only owned IDs',
  { skip: process.env.LYTHAUS_MONTHLY_CLOCK_INTERRUPTION_TESTS !== '1', timeout: 180000 }, async () => {
    const checkout = await verifyCheckout(process.env.LYTHAUS_EXPECTED_CHECKOUT_SHA);
    const scope = process.env.LYTHAUS_MONTHLY_CLOCK_CONTROL_DIRECTORY
      ? resumeInterruptionEvidenceRun(checkout, process.env.LYTHAUS_MONTHLY_CLOCK_CONTROL_DIRECTORY)
      : createEvidenceRun(checkout, '.artifacts/monthly-snapshot-clock', { mode: 'interruption-regression' });
    const { directory, owner, manifest, save, register } = scope;
    manifest.interruptionControls = []; save();
    let failure;
    try {
      const sentinel = await owner.create('regression-sentinel', ['--network', 'none', '--entrypoint', '/bin/true']);
      for (const phase of ['startup', 'running']) for (const signal of ['SIGINT', 'SIGTERM']) {
        const probeOwner = new DisposableContainers(directory, checkout.endpoint, command, { expectedSha: checkout.expectedSha, register });
        const child = spawn(process.execPath, ['scripts/ci/validate-monthly-snapshot-clock.mjs', '--expected-sha', checkout.expectedSha,
          '--interruption-probe', phase, '--probe-directory', directory, '--probe-owner-id', probeOwner.runId],
        { env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '', exited = false;
        child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
        const exit = new Promise((resolve, reject) => {
          child.on('error', reject); child.on('close', (code, received) => { exited = true; resolve({ code, signal: received }); });
        });
        try {
          const log = path.join(directory, `${phase}-${probeOwner.runId}-probe.log`);
          await waitUntil(() => {
            assert.equal(exited, false, output);
            return existsSync(log) && readFileSync(log, 'utf8').includes('interruptible_child_ready');
          }, 90000);
          const active = restoreOwner(directory, checkout.endpoint, checkout.expectedSha, probeOwner.runId);
          assert.equal(active.records.length, 1); assert.equal((await active.inspect(active.records[0].id)).State.Running, true);
          const started = Date.now(); assert.equal(child.kill(signal), true);
          const result = await exit;
          assert.equal(result.code, signal === 'SIGINT' ? 130 : 143, output); assert.equal(result.signal, null);
          assert.ok(Date.now() - started < 35000, 'Signal cleanup must have a bounded deadline');
          const cleaned = restoreOwner(directory, checkout.endpoint, checkout.expectedSha, probeOwner.runId);
          assert.equal(cleaned.interruption.received, signal); assert.equal(cleaned.interruption.cleanupComplete, true);
          assert.equal(await cleaned.inspect(cleaned.records[0].id), null);
          await cleaned.removeAll(); await cleaned.removeAll();
          assert.ok(await owner.inspect(sentinel), 'A probe must preserve a different recorded owner');
          manifest.interruptionControls.push({ phase, signal, exitCode: result.code, containers: cleaned.records,
            sentinelPreserved: true, repeatedCleanupPassed: true, durationMilliseconds: Date.now() - started }); save();
        } finally {
          if (!exited) { child.kill('SIGTERM'); await exit; }
          writeFileSync(path.join(directory, `${phase}-${probeOwner.runId}-helper.log`), output);
        }
      }
      const fallbackOwner = new DisposableContainers(directory, checkout.endpoint, command, { expectedSha: checkout.expectedSha, register });
      const fallbackId = await fallbackOwner.create('fallback', ['--network', 'none', '--entrypoint', '/bin/sleep'], ['120']);
      assert.equal((await fallbackOwner.docker(['start', fallbackId])).code, 0);
      const args = ['scripts/ci/validate-monthly-snapshot-clock.mjs', '--expected-sha', checkout.expectedSha, '--cleanup-run', directory];
      assert.equal((await command(process.execPath, args)).code, 0);
      assert.equal((await command(process.execPath, args)).code, 0);
      assert.equal(await fallbackOwner.inspect(fallbackId), null);
      manifest.fallbackControls = { runningContainerRemoved: true, repeatedCleanupPassed: true }; manifest.outcome = 'passed';
    } catch (error) { failure = error; manifest.outcome = 'failed'; manifest.error = error.message; }
    finally {
      save();
      try { await cleanupEvidenceRun(directory, checkout.expectedSha, checkout.endpoint); }
      catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  });
