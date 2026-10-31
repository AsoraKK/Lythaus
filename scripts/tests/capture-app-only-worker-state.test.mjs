import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { captureServingPublicWorker, captureServingWorkers } from '../ci/capture-app-only-worker-state.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';

const ids = [
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
];
const workerIds = Object.fromEntries(Object.values(REUSED_WORKER_NAMES).map((name, index) => [name, ids[index]]));

function runner({ mutate = value => value, fail = false } = {}) {
  const calls = [];
  const execute = (binary, args, options) => {
    calls.push({ binary, args, options });
    if (fail) throw new Error('sensitive provider diagnostic should never escape');
    const nameIndex = args.indexOf('--name'), name = args[nameIndex + 1], id = workerIds[name];
    assert.equal(binary, 'npx');
    assert.ok(id);
    assert.deepEqual(args.slice(0, 2), ['--yes', 'wrangler@4.123.0']);
    assert.equal(args.at(-1), '--json');
    let payload;
    if (args[2] === 'deployments' && args[3] === 'status') payload = { versions: [{ version_id: id, percentage: 100 }] };
    else if (args[2] === 'versions' && args[3] === 'list') payload = [];
    else if (args[2] === 'versions' && args[3] === 'view') {
      assert.equal(args[4], id);
      payload = { id, annotations: { 'workers/tag': 'a'.repeat(40) }, created_on: '2026-10-29T10:00:00.000Z' };
    } else throw new Error('unexpected provider command');
    return JSON.stringify(mutate(payload, { args, name }));
  };
  return { calls, execute };
}

test('capture queries only exact read-only status, list, and version-view commands', () => {
  const mock = runner();
  const workers = captureServingWorkers({ execute: mock.execute });
  assert.equal(mock.calls.length, 12);
  assert.deepEqual(Object.keys(workers).sort(), Object.keys(REUSED_WORKER_NAMES).sort());
  assert.equal(workers.public.versionId, ids[0]);
  for (const call of mock.calls) {
    assert.equal(call.options.stdio[0], 'ignore');
    assert.equal(call.options.stdio[2], 'pipe');
    assert.ok(!call.args.some(value => ['deploy', 'delete', 'secret', 'publish'].includes(value)));
  }
});

test('Public-only capture does not require a coordinator or other Worker', () => {
  const mock = runner();
  const worker = captureServingPublicWorker({ execute: mock.execute });
  assert.equal(worker.versionId, ids[0]);
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls.every(call => call.args[call.args.indexOf('--name') + 1] === REUSED_WORKER_NAMES.public));
});

test('capture rejects split traffic before asking for version metadata', () => {
  const mock = runner({ mutate: (payload, { args }) => args[2] === 'deployments'
    ? { versions: [{ version_id: ids[0], percentage: 99 }, { version_id: ids[1], percentage: 1 }] } : payload });
  assert.throws(() => captureServingWorkers({ execute: mock.execute }), /one 100% serving version/);
  assert.equal(mock.calls.length, 1);
});

test('invalid provider version IDs never become command arguments', () => {
  const mock = runner({ mutate: (payload, { args }) => args[2] === 'deployments'
    ? { versions: [{ version_id: 'not-a-version', percentage: 100 }] } : payload });
  assert.throws(() => captureServingWorkers({ execute: mock.execute }), /invalid version/);
  assert.equal(mock.calls.length, 1);
});

test('capture rejects an exact-view response for another version or missing source provenance', () => {
  for (const mutate of [
    (payload, { args }) => args[3] === 'view' ? { ...payload, id: ids[1] } : payload,
    (payload, { args }) => args[3] === 'view' ? { ...payload, annotations: {} } : payload,
  ]) {
    const mock = runner({ mutate });
    assert.throws(() => captureServingWorkers({ execute: mock.execute }), /did not match|provenance/);
  }
});

test('provider errors are sanitized and are not retried', () => {
  const mock = runner({ fail: true });
  assert.throws(() => captureServingWorkers({ execute: mock.execute }), error => {
    assert.equal(error.message, 'read-only Worker provider request failed');
    return true;
  });
  assert.equal(mock.calls.length, 1);
});

test('the executable refuses an unprotected or incomplete environment before contacting a provider', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/capture-app-only-worker-state.mjs'], {
    encoding: 'utf8', env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires the exact main-dispatch Actions account context/);
  assert.doesNotMatch(result.stderr, /sensitive|Bearer/);
});
