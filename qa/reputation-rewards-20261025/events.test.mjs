import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { EventEmitter } from 'node:events';
import { recordReputationSignal } from '../../packages/db/src/reputation.ts';
import { refreshMonthlyEarningWeek } from '../../packages/db/src/monthly-earning.ts';
import { PROPOSED_HUMAN_CONTRIBUTION_RULES as rules } from '../../packages/contracts/src/monthly-earning-policy.ts';
import { loadTransactionCandidate } from '../../packages/db/tests/helpers/reputation-transaction-candidate.mjs';
import { requireUnchanged, reputationFixtureClass } from './pinned-source.mjs';

for (const path of ['packages/db/src/reputation.ts', 'packages/db/src/index.ts', 'packages/db/src/monthly-earning.ts',
  'packages/db/tests/helpers/reputation-transaction-candidate.mjs', 'packages/contracts/src/monthly-earning-policy.ts']) requireUnchanged(path);
const FakeClient = reputationFixtureClass();
const id = n => `019a0000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const signal = (n = 1, overrides = {}) => ({ id: id(n), subjectUserId: id(100), contentId: id(200),
  sourceEventId: id(1000 + n), signalType: 'qualifying_human_contribution',
  occurredAt: '2026-08-04T12:00:00.000Z', ...overrides });

test('E01 sequential delivery of one event persists one contribution', async () => {
  const client = new FakeClient();
  const first = await recordReputationSignal(client, signal());
  const repeated = await recordReputationSignal(client, signal());
  assert.equal(first.created, true); assert.equal(repeated.created, false);
  assert.equal(repeated.profile.totalScore, 10); assert.equal(client.events.length, 1);
});
test('E02 independent events on separate dates have the same total in either delivery order', async () => {
  const a = signal(1), b = signal(2, { occurredAt: '2026-08-05T12:00:00.000Z', contentId: id(201) });
  const totals = [];
  for (const events of [[a, b], [b, a]]) {
    const client = new FakeClient(); let result;
    for (const event of events) result = await recordReputationSignal(client, event);
    totals.push(result.profile.totalScore);
  }
  assert.deepEqual(totals, [20, 20]);
});
test('E03 reversing counted work removes its points and repeated delivery has no extra effect', async () => {
  const client = new FakeClient();
  await recordReputationSignal(client, signal());
  const reversal = signal(2, { signalType: 'reputation_event_reversal', reversalReference: id(1) });
  const reversed = await recordReputationSignal(client, reversal);
  assert.equal(reversed.profile.totalScore, 0); assert.equal(reversed.event.impact, -10);
  assert.equal(client.events[0].status, 'reversed');
  const repeat = await recordReputationSignal(client, reversal);
  assert.equal(repeat.created, false); assert.equal(repeat.profile.totalScore, 0);
  assert.equal(client.events.length, 2);
});
test('E04 reversal delivered before its contribution can retry after the contribution arrives', async () => {
  const client = new FakeClient();
  const reversal = signal(2, { signalType: 'reputation_event_reversal', reversalReference: id(1) });
  await assert.rejects(recordReputationSignal(client, reversal), /reputation_reversal_reference_invalid/);
  assert.equal(client.events.length, 0);
  await recordReputationSignal(client, signal());
  assert.equal((await recordReputationSignal(client, reversal)).profile.totalScore, 0);
});
test('E05 original event redelivery after reversal does not restore the old points', async () => {
  const client = new FakeClient();
  await recordReputationSignal(client, signal());
  await recordReputationSignal(client, signal(2, { signalType: 'reputation_event_reversal', reversalReference: id(1) }));
  const replay = await recordReputationSignal(client, signal());
  assert.equal(replay.created, false); assert.equal(replay.event.status, 'reversed');
  assert.equal(replay.profile.totalScore, 0);
});
test('E06 two delivery identifiers for one reversal cannot apply two inverse entries', async () => {
  const client = new FakeClient();
  await recordReputationSignal(client, signal());
  await recordReputationSignal(client, signal(2, { signalType: 'reputation_event_reversal', reversalReference: id(1) }));
  await assert.rejects(recordReputationSignal(client, signal(3, {
    signalType: 'reputation_event_reversal', reversalReference: id(1),
  })), /reputation_event_not_reversible/);
  assert.equal(client.events.length, 2);
});

class MonthlyReadFake {
  evidence = [];
  revisions = [];
  outbox = [];
  async query(text, values = []) {
    const result = rows => ({ rows, rowCount: rows.length });
    if (text.startsWith('SELECT pg_advisory_xact_lock')) return result([]);
    if (text.includes('SELECT id, week_id, revision, state, input_digest, rules_version')) {
      return result(this.revisions.length ? [this.revisions.at(-1)] : []);
    }
    if (text.includes('SELECT evidence.input')) return result(this.evidence.map(input => ({ input })));
    if (text.includes('INSERT INTO trust.monthly_earning_week_revisions')) {
      this.revisions.push({ id: values[0], week_id: values[1], rules_version: values[5], revision: values[6],
        state: values[7], points: values[8], calculation: JSON.parse(values[9]), input_digest: values[10] });
      return result([]);
    }
    if (text.includes('INSERT INTO system.outbox_events')) { this.outbox.push(values); return result([]); }
    throw new Error('unexpected mocked SQL');
  }
}
const weekInput = { subjectUserId: id(100), startsAt: '2026-08-03T00:00:00.000Z',
  evaluatedAt: '2026-08-14T00:00:00.000Z', configuration: { rules, collectFrom: '2026-08-01T00:00:00.000Z' } };
const evidence = (state = 'accepted') => ({ id: id(1), workId: id(200), kind: 'post',
  performedAt: '2026-08-04T12:00:00.000Z', state, creationMode: 'human', declarationValid: true,
  contentFingerprint: 'synthetic-fingerprint', sourceRevisionId: id(500), decisionId: id(600), reasonCode: 'fixture' });
test('W01 identical current evidence recomputation creates one weekly revision and outbox row', async () => {
  const client = new MonthlyReadFake(); client.evidence = [evidence()];
  const first = await refreshMonthlyEarningWeek(client, weekInput);
  const repeated = await refreshMonthlyEarningWeek(client, weekInput);
  assert.equal(first.created, true); assert.equal(repeated.created, false);
  assert.equal(client.revisions.length, 1); assert.equal(client.outbox.length, 1);
  assert.equal(repeated.calculation.points, 250);
});
test('W02 latest reversed evidence corrects a settled week and correction replay is stable', async () => {
  const client = new MonthlyReadFake(); client.evidence = [evidence()];
  await refreshMonthlyEarningWeek(client, weekInput);
  client.evidence = [evidence('reversed')];
  const correction = await refreshMonthlyEarningWeek(client, weekInput);
  assert.equal(correction.calculation.points, 0);
  assert.equal(client.revisions.at(-1).state, 'corrected');
  assert.equal(client.revisions.at(-1).revision, 2);
  assert.equal((await refreshMonthlyEarningWeek(client, weekInput)).created, false);
  assert.equal(client.revisions.length, 2);
});
test('W03 pending-to-accepted transition credits the original week once', async () => {
  const client = new MonthlyReadFake(); client.evidence = [evidence('pending_review')];
  assert.equal((await refreshMonthlyEarningWeek(client, weekInput)).calculation.points, 0);
  client.evidence = [evidence()];
  const accepted = await refreshMonthlyEarningWeek(client, weekInput);
  assert.equal(accepted.calculation.points, 250); assert.equal(accepted.calculation.ownerMonth, '2026-08');
  assert.equal(client.revisions[0].week_id, client.revisions[1].week_id);
});

const binding = { connectionString: 'postgresql://qa.invalid/synthetic?sslmode=verify-full' };
let durable = [], mode = 'normal', calls = [];
class MemoryDriver extends EventEmitter {
  constructor() { super(); this.db = new FakeClient({ events: structuredClone(durable) }); }
  async connect() { calls.push('connect'); }
  async end() { calls.push('end'); }
  async query(text, values) {
    if (text === 'BEGIN') { calls.push(text); return { command: 'BEGIN' }; }
    if (text === 'COMMIT') {
      calls.push(text); durable = structuredClone(this.db.events);
      if (mode === 'lose-commit-response') { mode = 'normal'; throw new Error('synthetic response interruption'); }
      return { command: 'COMMIT' };
    }
    if (text === 'ROLLBACK') {
      calls.push(text);
      if (mode === 'rollback-response-failure') throw new Error('synthetic rollback response interruption');
      return { command: 'ROLLBACK' };
    }
    return this.db.query(text, values);
  }
}
const loaded = await loadTransactionCandidate({ proposed: true, createClient: config => {
  assert.equal(config.connectionString, binding.connectionString); return new MemoryDriver();
} });
after(() => loaded.dispose());
const api = loaded.module;
test('T01 a work failure rolls back local state; retry commits one contribution', async () => {
  durable = []; mode = 'normal'; calls = [];
  const failure = new Error('synthetic downstream activity failure');
  await assert.rejects(api.transactionWithVerifiedFailureCleanup(binding, async client => {
    await recordReputationSignal(client, signal()); throw failure;
  }), error => api.verifiedTransactionFailureCause(error)?.cause === failure);
  assert.equal(durable.length, 0); assert.deepEqual(calls, ['connect', 'BEGIN', 'ROLLBACK', 'end']);
  await api.transactionWithVerifiedFailureCleanup(binding, client => recordReputationSignal(client, signal()));
  assert.equal(durable.length, 1);
});
test('T02 lost COMMIT response stays unknown; an ordinary replay observes one committed event', async () => {
  durable = []; mode = 'lose-commit-response'; calls = [];
  await assert.rejects(api.transactionWithVerifiedFailureCleanup(binding, client => recordReputationSignal(client, signal())),
    error => error.outcome === 'unknown' && error.name === 'DatabaseCommitUncertainError');
  assert.equal(durable.length, 1);
  const replay = await api.transactionWithVerifiedFailureCleanup(binding, client => recordReputationSignal(client, signal()));
  assert.equal(replay.created, false); assert.equal(durable.length, 1);
});
test('T03 failed rollback acknowledgement does not claim a known no-effect outcome', async () => {
  durable = []; mode = 'rollback-response-failure'; calls = [];
  await assert.rejects(api.transactionWithVerifiedFailureCleanup(binding, async () => { throw new Error('synthetic work interruption'); }),
    error => error.outcome === 'unknown' && api.verifiedTransactionFailureCause(error) === undefined);
  mode = 'normal';
});
