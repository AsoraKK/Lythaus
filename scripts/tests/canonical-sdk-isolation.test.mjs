import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { containerArguments } from '../ci/canonical-sdk-isolation.mjs';
import { SdkContainers, SdkInterruption, dockerCommand, withOwnedContainers } from '../ci/canonical-sdk-containers.mjs';

const realTests = process.env.LYTHAUS_RUN_ISOLATION_TEST === '1';
const tools = () => process.env.LYTHAUS_ISOLATION_TOOLS ? JSON.parse(fs.readFileSync(process.env.LYTHAUS_ISOLATION_TOOLS, 'utf8')) : { node: resolve(dirname(process.execPath), '..'), flutter: '/workspace/.lythaus-tools/flutter-sdk/flutter', java: '/workspace/.lythaus-tools/java17', generator: '/workspace/.lythaus-tools/openapi-generator-cli-7.7.0.jar' };
const fixture = directory => {
  for (const path of ['recipe/node_modules', 'inputs', 'work/sdk', 'cache/hosted', 'cache/hosted-hashes', 'fixtures']) fs.mkdirSync(join(directory, path), { recursive: true });
  return { tools: tools(), inputs: join(directory, 'inputs'), recipe: join(directory, 'recipe'), work: join(directory, 'work'), cache: join(directory, 'cache'), fixtureDirectory: join(directory, 'fixtures'), user: `${process.getuid()}:${process.getgid()}`, name: `lythaus-boundary-test-${process.pid}` };
};
const waitFor = async predicate => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Synthetic interruption checkpoint not reached');
};

test('signal ownership preserves cancellation codes and removes only its own listeners', () => {
  const previous = process.listenerCount('SIGTERM');
  const interruption = new SdkInterruption();
  try {
    assert.equal(process.listenerCount('SIGTERM'), previous + 1);
    interruption.handlers.get('SIGINT')(); interruption.handlers.get('SIGTERM')();
    assert.equal(interruption.signal.reason.exitCode, 130);
    assert.match(interruption.signal.reason.message, /SIGINT/);
    assert.ok(interruption.signal.reason.cleanupDeadline <= Date.now() + 30000);
  } finally { interruption.dispose(); }
  assert.equal(process.listenerCount('SIGTERM'), previous);
});

test('cleanup refuses a recorded ID bearing another ownership label', async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-owner-unit-'));
  const id = 'a'.repeat(64), calls = [];
  try {
    const owner = new SdkContainers(directory, { execute: async args => {
      calls.push(args); return { status: 0, stdout: JSON.stringify([{ Id: id, Config: { Labels: { 'co.lythaus.sdk-verifier-run': 'different-owner' } } }]), stderr: '' };
    } });
    owner.records.push({ id, state: 'created' });
    await assert.rejects(owner.removeAll(), /OWNED_CONTAINER_CLEANUP_FAILED/);
    assert.equal(owner.records[0].error, 'OWNED_CONTAINER_LABEL_MISMATCH');
    assert.ok(calls.every(args => args[0] === 'container' && args[1] === 'inspect' && args[2] === id));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cid recovery rejects symlinks, malformed IDs and changed recorded IDs', () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-cid-unit-'));
  try {
    const owner = new SdkContainers(directory), cidfile = 'synthetic.cid';
    owner.creations.push({ cidfile });
    fs.writeFileSync(join(directory, cidfile), 'container-name');
    assert.throws(() => owner.recover(), /OWNED_CONTAINER_ID_INVALID/);
    fs.writeFileSync(join(directory, cidfile), 'a'.repeat(64)); owner.recover();
    for (const changed of ['b'.repeat(64), '', 'a'.repeat(32), 'b'.repeat(32)]) {
      fs.writeFileSync(join(directory, cidfile), changed);
      assert.throws(() => owner.recover(), /OWNED_CONTAINER_ID_MISMATCH/);
    }
    fs.unlinkSync(join(directory, cidfile)); fs.symlinkSync('target', join(directory, cidfile));
    assert.throws(() => owner.recover(), /OWNED_CONTAINER_CIDFILE_INVALID/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('empty and partial normal cidfiles defer ID recovery without accepting malformed data', () => {
  for (const incomplete of ['', 'a'.repeat(32)]) {
    const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-partial-unit-'));
    try {
      const owner = new SdkContainers(directory), cidfile = 'synthetic.cid';
      owner.creations.push({ cidfile });
      fs.writeFileSync(join(directory, cidfile), incomplete); owner.recover();
      assert.equal(owner.records.length, 0);
      assert.equal(owner.creations[0].cidfilePrefix, incomplete);
      owner.records.push({ id: 'a'.repeat(64), cidfile, state: 'created', recoveredFrom: 'owned-name' });
      owner.recover();
      fs.writeFileSync(join(directory, cidfile), 'a'.repeat(64)); owner.recover();
      fs.writeFileSync(join(directory, cidfile), incomplete);
      assert.throws(() => owner.recover(), /OWNED_CONTAINER_ID_MISMATCH/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('partial cidfile with a different ID prefix cannot recover or remove a name-matched container', async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-prefix-unit-'));
  const calls = [];
  try {
    let owner;
    owner = new SdkContainers(directory, { execute: async args => {
      calls.push(args);
      return { status: 0, stdout: JSON.stringify([{ Id: 'b'.repeat(64), Name: `/${owner.creations[0].name}`, Config: { Labels: { 'co.lythaus.sdk-verifier-run': owner.runId } } }]), stderr: '' };
    } });
    owner.creations.push({ cidfile: 'partial.cid', name: `lythaus-sdk-${owner.runId}-0`, state: 'requested' });
    fs.writeFileSync(join(directory, 'partial.cid'), 'a'.repeat(32));
    await assert.rejects(owner.removeAll(), error => error.errors.some(value => value.message === 'OWNED_CONTAINER_ID_MISMATCH'));
    assert.equal(owner.records.length, 0);
    assert.deepEqual(calls, [['container', 'inspect', owner.creations[0].name]]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('missing and incomplete cid recovery reject arbitrary names and mismatched ownership before recording an ID', async () => {
  for (const [arbitraryName, contents] of [false, true].flatMap(arbitraryName => [null, '', 'a'.repeat(32)].map(contents => [arbitraryName, contents]))) {
    const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-name-unit-'));
    const calls = [];
    try {
      let owner;
      owner = new SdkContainers(directory, { execute: async args => {
        calls.push(args);
        return { status: 0, stdout: JSON.stringify([{ Id: 'a'.repeat(64), Name: `/${owner.creations[0].name}`, Config: { Labels: { 'co.lythaus.sdk-verifier-run': 'different-owner' } } }]), stderr: '' };
      } });
      owner.creations.push({ cidfile: 'missing.cid', name: arbitraryName ? 'unrelated-name' : `lythaus-sdk-${owner.runId}-0`, state: 'requested' });
      if (contents !== null) fs.writeFileSync(join(directory, 'missing.cid'), contents);
      await assert.rejects(owner.removeAll(), /OWNED_CONTAINER_CLEANUP_FAILED/);
      assert.equal(owner.records.length, 0);
      if (arbitraryName) assert.equal(calls.length, 0);
      else assert.deepEqual(calls, [['container', 'inspect', owner.creations[0].name]]);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('cleanup ignores aborted work signal and refuses an expired deadline', async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-deadline-unit-'));
  const controller = new AbortController(), reason = new Error('synthetic cancellation'), id = 'a'.repeat(64), calls = [];
  reason.cleanupDeadline = Date.now() - 1; controller.abort(reason);
  try {
    const owner = new SdkContainers(directory, { signal: controller.signal, execute: async (args, options) => { calls.push(options); return { status: 1, stdout: '', stderr: 'No such container' }; } });
    owner.records.push({ id, state: 'created' });
    await assert.rejects(owner.removeAll(), /OWNED_CONTAINER_CLEANUP_FAILED/);
    assert.equal(calls.length, 0);
    reason.cleanupDeadline = Date.now() + 10000;
    await owner.removeAll();
    assert.ok(calls.every(options => options.signal === null && options.timeout <= 5000));
    assert.equal(owner.records[0].state, 'removed');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cancellation retains its exit code when owned cleanup fails closed', async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-cancel-failure-unit-'));
  try {
    await assert.rejects(withOwnedContainers(directory, async owner => {
      const id = 'a'.repeat(64);
      owner.records.push({ id, state: 'created' });
      owner.execute = async () => ({ status: 0, stdout: JSON.stringify([{ Id: id, Config: { Labels: {} } }]), stderr: '' });
      process.emit('SIGTERM');
      owner.signal.throwIfAborted();
    }), error => error.exitCode === 143 && error.message === 'SDK_VERIFICATION_INTERRUPTED:SIGTERM' && error.cleanupError === 'OWNED_CONTAINER_CLEANUP_FAILED');
    assert.equal(process.listenerCount('SIGTERM'), 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('real disposable container denies candidate access to gates, commandfiles, credentials and host processes', { skip: !realTests }, async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-isolation-test-'));
  try {
    const options = fixture(directory);
    fs.writeFileSync(join(directory, 'recipe', 'fixed.txt'), 'synthetic trusted fixture');
    fs.writeFileSync(join(directory, 'inputs', 'data.txt'), 'synthetic candidate data');
    fs.writeFileSync(join(directory, 'fixtures', 'fixed.txt'), 'synthetic trusted fixture');
    const command = `
      const fs = require('node:fs');
      const assert = require('node:assert/strict');
      assert.notEqual(process.getuid(), 0);
      assert.equal(process.env.HOME, '/tmp/lythaus-sdk-home');
      for (const name of ['GITHUB_TOKEN', 'GITHUB_ENV', 'GITHUB_OUTPUT', 'GITHUB_PATH', 'SSH_AUTH_SOCK', 'AWS_ACCESS_KEY_ID']) assert.equal(process.env[name], undefined);
      for (const file of ['/recipe/fixed.txt', '/inputs/data.txt', '/work/test/fixed.txt']) assert.throws(() => fs.writeFileSync(file, 'synthetic tamper'), { code: 'EROFS' });
      for (const file of ['/var/run/docker.sock', '/recipe/.git', '/recipe/scripts/ci/canonical-sdk-contract.mjs', '/recipe/scripts/ci/canonical-sdk-bootstrap.mjs']) assert.equal(fs.existsSync(file), false);
      assert.deepEqual(fs.readdirSync('/sys/class/net'), ['lo']);
      assert.ok(fs.readFileSync('/proc/1/cmdline', 'utf8').includes('/tools/node/bin/node'));
      assert.equal(fs.existsSync('/proc/${process.pid}/cmdline'), false);
      fs.writeFileSync('/pub-cache/active_roots', 'synthetic disposable metadata');
      fs.writeFileSync('/work/output.txt', 'synthetic bounded output');
      process.stdout.write('ISOLATION_BOUNDARIES_VERIFIED');
    `;
    const args = containerArguments({ ...options, command: ['-e', command] });
    const result = await withOwnedContainers(directory, owner => owner.run(args));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'ISOLATION_BOUNDARIES_VERIFIED');
    assert.equal(fs.readFileSync(join(directory, 'fixtures', 'fixed.txt'), 'utf8'), 'synthetic trusted fixture');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const [signal, stage] of [['SIGINT', 'running'], ['SIGTERM', 'running'], ['SIGTERM', 'after-create'], ['SIGINT', 'missing-cid'], ['SIGTERM', 'missing-cid'], ['SIGINT', 'empty-cid'], ['SIGTERM', 'empty-cid'], ['SIGINT', 'partial-cid'], ['SIGTERM', 'partial-cid']]) {
  test(`real ${signal} cancellation at ${stage} cleans recorded IDs and preserves another owner`, { skip: !realTests, timeout: 45000 }, async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-cancel-test-'));
    const sentinelDirectory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-sentinel-'));
    const sentinel = new SdkContainers(sentinelDirectory);
    let child, closed, output = '';
    try {
      const options = fixture(directory);
      const sentinelArgs = containerArguments({ ...options, command: ['-e', 'setInterval(() => {}, 1000)'] });
      const cidfile = 'sentinel.cid'; sentinel.creations.push({ cidfile }); sentinel.save();
      const result = await sentinel.docker(['create', '--cidfile', join(sentinelDirectory, cidfile), '--label', `co.lythaus.sdk-verifier-run=${sentinel.runId}`, ...sentinelArgs.slice(1)]);
      assert.equal(result.status, 0, result.stderr); sentinel.recover();
      const sentinelId = sentinel.records[0].id;
      const moduleUrl = new URL('../ci/canonical-sdk-containers.mjs', import.meta.url).href;
      const args = containerArguments({ ...options, command: ['-e', 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync("/work/ready", "synthetic"); setInterval(() => {}, 1000)'] });
      const probe = `
        import fs from 'node:fs';
        import { withOwnedContainers, dockerCommand } from ${JSON.stringify(moduleUrl)};
        try {
          await withOwnedContainers(${JSON.stringify(directory)}, async owner => {
            if (${JSON.stringify(stage)} !== 'running') owner.execute = async (args, options) => {
              const cidIndex = args.indexOf('--cidfile');
              const actualArgs = ${JSON.stringify(stage)} === 'missing-cid' && cidIndex !== -1 ? args.filter((_, index) => index !== cidIndex && index !== cidIndex + 1) : args;
              const result = await dockerCommand(actualArgs, options);
              if (args[0] === 'create' && result.status === 0) {
                if (['empty-cid', 'partial-cid'].includes(${JSON.stringify(stage)})) {
                  if (cidIndex === -1) throw new Error('Actual Docker cidfile flag required');
                  const id = fs.readFileSync(args[cidIndex + 1], 'utf8').trim();
                  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Actual Docker full ID required before fault injection');
                  fs.writeFileSync(args[cidIndex + 1], ${JSON.stringify(stage)} === 'empty-cid' ? '' : id.slice(0, 32));
                }
                process.stdout.write('CREATED\\n');
                await new Promise((resolve, reject) => {
                  const timer = setInterval(() => {}, 1000);
                  const stop = () => { clearInterval(timer); reject(options.signal.reason); };
                  options.signal.addEventListener('abort', stop, { once: true });
                  if (options.signal.aborted) stop();
                });
              }
              return result;
            };
            await owner.run(${JSON.stringify(args)});
          });
          process.exitCode = 1;
        } catch (error) { process.stdout.write(error.message + '\\n'); process.exitCode = error.exitCode ?? 1; }
      `;
      child = spawn(process.execPath, ['--input-type=module', '--eval', probe], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
      const completion = new Promise(resolve => child.on('close', (code, childSignal) => { closed = { code, signal: childSignal }; resolve(closed); }));
      child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
      await waitFor(() => stage !== 'running' ? output.includes('CREATED') : fs.existsSync(join(directory, 'work/ready')));
      const creationJournal = JSON.parse(fs.readFileSync(join(directory, fs.readdirSync(directory).find(file => /^containers-.*\.json$/.test(file))), 'utf8'));
      const creation = creationJournal.creations[0], cidPath = join(directory, creation.cidfile);
      assert.equal(fs.existsSync(cidPath), stage !== 'missing-cid');
      const nameInspection = await sentinel.docker(['container', 'inspect', creation.name], { signal: null, timeout: 5000 });
      assert.equal(nameInspection.status, 0, nameInspection.stderr);
      const createdId = JSON.parse(nameInspection.stdout)[0].Id;
      if (stage !== 'missing-cid') {
        assert.ok(fs.lstatSync(cidPath).isFile());
        const contents = fs.readFileSync(cidPath, 'utf8').trim();
        assert.equal(contents, stage === 'empty-cid' ? '' : stage === 'partial-cid' ? createdId.slice(0, 32) : createdId);
      }
      const beforeCancellation = await sentinel.inspect(createdId, { signal: null, timeout: 5000 });
      assert.equal(beforeCancellation.State.Running, stage === 'running');
      assert.equal(beforeCancellation.Config.Labels['co.lythaus.sdk-verifier-run'], creationJournal.runId);
      const interrupted = Date.now(); child.kill(signal);
      await waitFor(() => Boolean(closed)); await completion;
      assert.equal(closed.code, signal === 'SIGINT' ? 130 : 143, output);
      assert.equal(closed.signal, null);
      assert.match(output, new RegExp(`SDK_VERIFICATION_INTERRUPTED:${signal}`));
      assert.ok(Date.now() - interrupted < 15000, 'cleanup must be bounded');
      const journals = fs.readdirSync(directory).filter(file => /^containers-.*\.json$/.test(file)).map(file => JSON.parse(fs.readFileSync(join(directory, file), 'utf8')));
      assert.equal(journals.length, 1); assert.equal(journals[0].containers.length, 1);
      for (const record of journals[0].containers) {
        assert.equal(record.state, 'removed', output);
        assert.equal(record.id, createdId);
        if (['missing-cid', 'empty-cid', 'partial-cid'].includes(stage)) assert.equal(record.recoveredFrom, 'owned-name');
        assert.equal(await sentinel.inspect(record.id, { signal: null, timeout: 5000 }), null);
      }
      assert.ok(await sentinel.inspect(sentinelId, { signal: null, timeout: 5000 }), 'another owner survives cancellation');
    } finally {
      if (child && !closed) { child.kill('SIGTERM'); await waitFor(() => Boolean(closed)); }
      const journals = fs.readdirSync(directory).filter(file => /^containers-.*\.json$/.test(file)).map(file => JSON.parse(fs.readFileSync(join(directory, file), 'utf8')));
      for (const journal of journals) {
        const fallback = new SdkContainers(directory);
        fallback.runId = journal.runId; fallback.records = journal.containers; fallback.creations = journal.creations;
        await fallback.removeAll();
      }
      await sentinel.removeAll();
      fs.rmSync(directory, { recursive: true, force: true }); fs.rmSync(sentinelDirectory, { recursive: true, force: true });
    }
  });
}

for (const mode of ['timeout', 'output-limit']) {
  test(`real ${mode} failure cleans owned container IDs`, { skip: !realTests, timeout: 20000 }, async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), 'lythaus-sdk-failure-test-'));
    try {
      const options = fixture(directory);
      const command = mode === 'timeout' ? 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)' : 'process.on("SIGTERM", () => {}); process.stdout.write("synthetic".repeat(100000)); setInterval(() => {}, 1000)';
      await assert.rejects(withOwnedContainers(directory, async owner => {
        owner.execute = (args, settings) => dockerCommand(args, args[0] === 'start' ? { ...settings, timeout: 1500, maxBuffer: mode === 'output-limit' ? 1024 : settings.maxBuffer } : settings);
        await owner.run(containerArguments({ ...options, command: ['-e', command] }));
      }), new RegExp(mode === 'timeout' ? 'ISOLATION_EXECUTION_TIMEOUT' : 'ISOLATION_OUTPUT_LIMIT'));
      const journals = fs.readdirSync(directory).filter(file => /^containers-.*\.json$/.test(file)).map(file => JSON.parse(fs.readFileSync(join(directory, file), 'utf8')));
      assert.equal(journals.length, 1); assert.equal(journals[0].containers.length, 1);
      for (const record of journals[0].containers) {
        assert.equal(record.state, 'removed');
        const result = await dockerCommand(['container', 'inspect', record.id], { env: { PATH: '/usr/local/bin:/usr/bin:/bin' }, timeout: 5000 });
        assert.notEqual(result.status, 0); assert.match(result.stderr, /No such (?:container|object)/i);
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
