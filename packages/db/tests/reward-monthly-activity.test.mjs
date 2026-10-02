import assert from 'node:assert/strict';
import test from 'node:test';
import { readMonthlyReputationActivity } from '../src/reward-monthly-activity.ts';

const AS_OF = '2026-10-02T12:00:00Z';
const USER = 'synthetic-member';
const ledgerEvent = {
  id: 'synthetic-event', subjectUserId: USER, eventType: 'qualifying_human_contribution',
  sourceEventId: 'synthetic-source', policyVersion: 'reputation-v2.0.0', occurredAt: '2026-09-30T23:59:59.999Z',
  recordedAt: '2026-10-01T00:00:01Z', impact: 5, status: 'effective', reversalReference: null,
};

test('read-only adapter scopes the existing ledger to owner and calendar months with explicit database timezone', async () => {
  const queries = [];
  const lifetimeProfile = { currentLevel: 5, totalScore: 10000 };
  const before = structuredClone(lifetimeProfile);
  const client = { async query(sql, parameters) { queries.push({ sql, parameters }); return { rows: [ledgerEvent] }; } };
  const result = await readMonthlyReputationActivity(client, USER, AS_OF, 'UTC');
  assert.equal(queries.length, 1);
  const [{ sql, parameters }] = queries;
  assert.match(sql, /FROM trust\.reputation_events/);
  assert.match(sql, /subject_user_id = \$1/);
  assert.match(sql, /effective_at AT TIME ZONE \$2/);
  assert.match(sql, /effective_at <= \$4::timestamptz AND created_at <= \$4::timestamptz/);
  assert.match(sql, /effective_at AT TIME ZONE 'UTC'/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
  assert.deepEqual(parameters, [USER, 'UTC', ['2026-09', '2026-10'], '2026-10-02T12:00:00.000Z']);
  assert.equal(result.qualificationActivity.positiveImpact, 5);
  assert.equal(result.currentActivity.positiveImpact, 0);
  assert.equal(result.rewardLevel, null);
  assert.deepEqual(lifetimeProfile, before);
});

test('same ledger snapshot replays without writes and reversals remove original impact', async () => {
  let reads = 0;
  const original = { ...ledgerEvent, status: 'reversed' };
  const client = { async query() { reads += 1; return { rows: [original] }; } };
  const first = await readMonthlyReputationActivity(client, USER, AS_OF, 'UTC');
  const replay = await readMonthlyReputationActivity(client, USER, AS_OF, 'UTC');
  assert.deepEqual(first, replay);
  assert.equal(reads, 2);
  assert.equal(first.qualificationActivity.positiveImpact, 0);
  assert.equal(first.qualificationActivity.reversedEvents, 1);
});

test('calendar selection uses configured timezone and rejects missing policy input before querying', async () => {
  const queries = [];
  const client = { async query(sql, parameters) { queries.push(parameters); return { rows: [] }; } };
  await assert.rejects(readMonthlyReputationActivity(client, USER, AS_OF), /timezone_required/);
  await assert.rejects(readMonthlyReputationActivity(client, '', AS_OF, 'UTC'), /subject_required/);
  assert.equal(queries.length, 0);
  const result = await readMonthlyReputationActivity(client, USER, '2026-10-01T00:30:00Z', 'America/New_York');
  assert.deepEqual(queries[0], [USER, 'America/New_York', ['2026-08', '2026-09'], '2026-10-01T00:30:00.000Z']);
  assert.equal(result.currentRewardMonth, '2026-09');
  assert.equal(result.nextRewardMonth, '2026-10');
});

test('database failures and mismatched ownership are surfaced without a fallback level', async () => {
  await assert.rejects(readMonthlyReputationActivity({ async query() { throw new Error('database unavailable'); } }, USER, AS_OF, 'UTC'), /database unavailable/);
  await assert.rejects(readMonthlyReputationActivity({ async query() { return { rows: [{ ...ledgerEvent, subjectUserId: 'other-member' }] }; } }, USER, AS_OF, 'UTC'), /subject_mismatch/);
});
