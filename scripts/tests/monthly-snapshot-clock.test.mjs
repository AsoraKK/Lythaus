import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CLOCK_TEST_PINS, DisposableContainers, localDatabaseUrl, validateEnvironment,
  validatePositiveTap, verifyCheckout, publicDownloadEnvironment, command } from '../ci/validate-monthly-snapshot-clock.mjs';

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
  for (const env of [{ DOCKER_HOST: 'tcp://127.0.0.1:2375' }, { DOCKER_HOST: 'ssh://database.example.invalid' }, { DOCKER_CONTEXT: 'production' }])
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
    await first.removeAll(); assert.deepEqual(fake.removed, [owned]); assert.ok(fake.containers.has(sentinel));
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
test('Cleanup refuses a foreign ownership label instead of removing an unrelated container', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-clock-unit-'));
  try {
    const fake = fakeDocker(), owner = new DisposableContainers(directory, 'unix:///var/run/docker.sock', fake.execute);
    const id = await owner.create('tampered'); fake.containers.get(id).Config.Labels = {};
    await assert.rejects(owner.removeAll(), /cleanup_failed/); assert.deepEqual(fake.removed, []);
    assert.ok(fake.containers.has(id)); assert.equal(owner.records[0].state, 'cleanup_failed');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
