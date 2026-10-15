import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTransactionCandidate } from './helpers/reputation-transaction-candidate.mjs';

// No socket or actual pg Client exists in these tests; every query is a fake
// driver operation against the actual source transaction wrapper.
const binding = { connectionString: 'postgresql://fixture.invalid/postgres?sslmode=verify-full' };
let scenario = {}, clients = [];
class FakeClient extends EventEmitter {
  calls = [];
  async connect() { this.calls.push('connect'); await scenario.connect?.(this); }
  async query(sql) {
    this.calls.push(sql);
    if (Object.hasOwn(scenario.query ?? {}, sql)) return scenario.query[sql](this);
    return { command: sql };
  }
  async end() { this.calls.push('end'); await scenario.end?.(this); this.closed = true; }
}
const createClient = config => {
  assert.equal(config.connectionString, binding.connectionString);
  const client = new FakeClient(); clients.push(client); return client;
};
const baseline = await loadTransactionCandidate({ proposed: false, createClient });
const candidate = await loadTransactionCandidate({ proposed: true, createClient });
after(() => { baseline.dispose(); candidate.dispose(); });
const api = candidate.module;
const deleted = () => new api.ReputationSubjectDeletedError();
const deferred = () => Promise.withResolvers();
const turn = () => new Promise(resolve => setImmediate(resolve));
function setup(value = {}) { scenario = value; clients = []; }
function closed() {
  assert.equal(clients.length, 1);
  assert.equal(clients[0].closed, true);
  assert.equal(clients[0].listenerCount('error'), 0);
}
test('historical proposal hashes remain recorded while runtime uses verified cleanup', () => {
  const evidence = JSON.parse(readFileSync(new URL('fixtures/reputation-transaction-v3-baseline.json', import.meta.url)));
  assert.equal(evidence.baseline_head, 'da612c489b99ad540bbb7abca8d0d8b348c17e16');
  const historicalRuntime = evidence.files.find(file => file.path === 'packages/db/src/index.ts');
  assert.ok(historicalRuntime);
  const runtime = readFileSync(new URL('../../../packages/db/src/index.ts', import.meta.url));
  assert.notEqual(runtime.length, historicalRuntime.bytes);
  assert.notEqual(createHash('sha256').update(runtime).digest('hex'), historicalRuntime.sha256);
  assert.match(runtime.toString('utf8'), /transactionWithVerifiedFailureCleanup/);
  for (const file of evidence.files.filter(file => file.path !== 'packages/db/src/index.ts')) {
    const bytes = readFileSync(new URL('../../../' + file.path, import.meta.url));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});
async function rejectsUncertain(work, value = {}) {
  setup(value);
  await assert.rejects(api.runReputationTransaction(binding, work), error => {
    assert.equal(error.outcome, 'unknown');
    assert.equal(api.verifiedTransactionFailureCause(error), undefined);
    return true;
  });
  assert.equal(clients[0].listenerCount('error'), 0);
}

test('defect control: actual baseline wrapper plus historical Queue helper suppresses rollback rejection', async () => {
  setup({ query: { ROLLBACK: async () => { throw new Error('synthetic rollback failure'); } } });
  const error = new baseline.module.ReputationSubjectDeletedError();
  assert.equal(await baseline.module.runReputationTransaction(() => baseline.module.transaction(binding, async () => { throw error; })), 'deleted');
  assert.deepEqual(clients[0].calls, ['connect', 'BEGIN', 'ROLLBACK', 'end']); closed();
});
test('legacy transaction default remains unchanged in the proposal; Queue no longer uses that mode', async () => {
  setup({ query: { ROLLBACK: async () => { throw new Error('synthetic rollback failure'); } } });
  const error = deleted();
  await assert.rejects(api.transaction(binding, async () => { throw error; }), actual => actual === error);
  assert.equal(api.verifiedTransactionFailureCause(error), undefined); closed();
});
test('verified rollback receipt is issued only after actual wrapper rollback and close', async () => {
  setup(); const original = deleted();
  await assert.rejects(api.transactionWithVerifiedFailureCleanup(binding, async () => { throw original; }), receipt => {
    assert.notEqual(receipt, original);
    assert.deepEqual(api.verifiedTransactionFailureCause(receipt), { cause: original });
    assert.ok(Object.isFrozen(api.verifiedTransactionFailureCause(receipt)));
    closed(); return true;
  });
  assert.equal(api.verifiedTransactionFailureCause(original), undefined);
});
test('Queue terminal deletion requires verified cleanup through actual wrapper', async () => {
  setup(); assert.equal(await api.runReputationTransaction(binding, async () => { throw deleted(); }), 'deleted');
  assert.deepEqual(clients[0].calls, ['connect', 'BEGIN', 'ROLLBACK', 'end']); closed();
});
for (const label of ['ordinary', 'deleted-shaped']) test('rollback rejection is never terminal: ' + label, async () => {
  await rejectsUncertain(async () => { throw deleted(); }, { query: { ROLLBACK: async () => { throw label === 'ordinary' ? new Error('synthetic rollback failure') : deleted(); } } });
});
for (const result of [undefined, null, {}, { command: 'COMMIT' }, { command: 'SELECT' }, [], [{ command: 'ROLLBACK' }]]) {
  test('unexpected rollback result is never terminal: ' + JSON.stringify(result), async () => {
    await rejectsUncertain(async () => { throw deleted(); }, { query: { ROLLBACK: async () => result } });
  });
}
for (const phase of ['connect', 'work', 'rollback', 'close']) test('observed connection error prevents terminal receipt: ' + phase, async () => {
  const emit = client => client.emit('error', new Error('synthetic socket error'));
  const value = phase === 'rollback' ? { query: { ROLLBACK: async client => { emit(client); return { command: 'ROLLBACK' }; } } }
    : phase === 'close' ? { end: async client => { emit(client); } }
      : phase === 'connect' ? { connect: async client => { emit(client); } } : {};
  await rejectsUncertain(async client => { if (phase === 'work') emit(client); throw deleted(); }, value);
});
for (const label of ['ordinary', 'deleted-shaped']) test('close rejection is never terminal: ' + label, async () => {
  await rejectsUncertain(async () => { throw deleted(); }, { end: async () => { throw label === 'ordinary' ? new Error('synthetic close failure') : deleted(); } });
});
test('close stall cannot suppress deletion; later rejection remains uncertain', async () => {
  const entered = deferred(), release = deferred(); let settled = false;
  setup({ end: async () => { entered.resolve(); await release.promise; throw new Error('synthetic late close failure'); } });
  const outcome = api.runReputationTransaction(binding, async () => { throw deleted(); })
    .then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
  try {
    await entered.promise; await turn(); assert.equal(settled, false);
    assert.equal(clients[0].listenerCount('error'), 1);
  } finally { release.resolve(); }
  const result = await outcome;
  assert.equal(result.value, undefined); assert.equal(result.error.outcome, 'unknown');
  assert.equal(api.verifiedTransactionFailureCause(result.error), undefined);
});
test('close stall may become terminal only after actual close fulfillment', async () => {
  const entered = deferred(), release = deferred(); let settled = false;
  setup({ end: async () => { entered.resolve(); await release.promise; } });
  const outcome = api.runReputationTransaction(binding, async () => { throw deleted(); }).finally(() => { settled = true; });
  try { await entered.promise; await turn(); assert.equal(settled, false); }
  finally { release.resolve(); }
  assert.equal(await outcome, 'deleted'); closed();
});
test('rollback stall stays pending; only matching completion and close permit terminal', async () => {
  const entered = deferred(), release = deferred(); let settled = false;
  setup({ query: { ROLLBACK: async () => { entered.resolve(); await release.promise; return { command: 'ROLLBACK' }; } } });
  const outcome = api.runReputationTransaction(binding, async () => { throw deleted(); }).finally(() => { settled = true; });
  try { await entered.promise; await turn(); assert.equal(settled, false); assert.equal(clients[0].calls.includes('end'), false); }
  finally { release.resolve(); }
  assert.equal(await outcome, 'deleted'); closed();
});
for (const phase of ['connect', 'begin']) test('startup failure cannot supply deleted cleanup proof: ' + phase, async () => {
  let called = false;
  const fail = async () => { throw deleted(); };
  await rejectsUncertain(async () => { called = true; }, phase === 'connect' ? { connect: fail } : { query: { BEGIN: fail } });
  assert.equal(called, false); assert.equal(clients[0].calls.includes('COMMIT'), false);
});
for (const result of [undefined, null, { command: 'SELECT' }, [], [{ command: 'BEGIN' }]]) {
  test('unverified BEGIN result never issues cleanup proof: ' + JSON.stringify(result), async () => {
    let called = false;
    await rejectsUncertain(async () => { called = true; throw deleted(); }, { query: { BEGIN: async () => result } });
    assert.equal(called, false);
  });
}
for (const label of ['rejection', 'deleted-shaped rejection', 'unexpected tag', 'missing result', 'rollback tag']) test('attempted commit is never deleted-terminal proof: ' + label, async () => {
  const commit = async () => {
    if (label === 'rejection') throw new Error('synthetic commit response loss');
    if (label === 'deleted-shaped rejection') throw deleted();
    return label === 'missing result' ? undefined : { command: label === 'rollback tag' ? 'ROLLBACK' : 'SELECT' };
  };
  await rejectsUncertain(async () => 'synthetic work result', { query: { COMMIT: commit } });
  assert.equal(clients[0].calls.includes('COMMIT'), true);
});
test('lost COMMIT response retains the actual wrapper uncertainty type', async () => {
  setup({ query: { COMMIT: async () => { throw new Error('synthetic commit response loss'); } } });
  await assert.rejects(api.runReputationTransaction(binding, async () => undefined), error => error instanceof api.DatabaseCommitUncertainError);
  closed();
});
test('successful COMMIT followed by close failure cannot yield processed or deleted', async () => {
  await rejectsUncertain(async () => undefined, { end: async () => { throw deleted(); } });
});
test('uncertain COMMIT remains uncertain when close also rejects with a deleted error', async () => {
  setup({ query: { COMMIT: async () => { throw new Error('synthetic lost commit response'); } }, end: async () => { throw deleted(); } });
  await assert.rejects(api.runReputationTransaction(binding, async () => undefined), error => {
    assert.equal(api.verifiedTransactionFailureCause(error), undefined);
    return error instanceof api.DatabaseCommitUncertainError;
  });
});
test('non-deleted and forged callback failures propagate verified failure receipts', async () => {
  for (const original of [new Error('reputation_subject_deleted'), { name: 'DatabaseVerifiedTransactionRollbackError', cause: deleted() }, { code: 'reputation_subject_deleted' }]) {
    setup(); await assert.rejects(api.runReputationTransaction(binding, async () => { throw original; }), error => api.verifiedTransactionFailureCause(error)?.cause === original);
    closed();
  }
});
test('reusing a deleted error cannot reuse cleanup proof for a failed attempt', async () => {
  const original = deleted(); setup();
  assert.equal(await api.runReputationTransaction(binding, async () => { throw original; }), 'deleted');
  await rejectsUncertain(async () => { throw original; }, { query: { ROLLBACK: async () => { throw new Error('synthetic second rollback failure'); } } });
});
test('replaying an old receipt does not make a new failure deleted-terminal', async () => {
  let old; setup();
  await assert.rejects(api.transactionWithVerifiedFailureCleanup(binding, async () => { throw deleted(); }), error => { old = error; return true; });
  setup(); await assert.rejects(api.runReputationTransaction(binding, async () => { throw old; }), error => api.verifiedTransactionFailureCause(error)?.cause === old);
  await rejectsUncertain(async () => { throw old; }, { query: { ROLLBACK: async () => { throw new Error('synthetic rollback failure'); } } });
});
test('processed requires actual wrapper COMMIT and successful close', async () => {
  setup(); assert.equal(await api.runReputationTransaction(binding, async () => 'synthetic success'), 'processed');
  assert.deepEqual(clients[0].calls, ['connect', 'BEGIN', 'COMMIT', 'end']); closed();
});
