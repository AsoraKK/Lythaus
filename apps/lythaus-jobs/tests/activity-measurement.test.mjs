import assert from 'node:assert/strict';
import test from 'node:test';
import { activityMeasurementPrivacyExport, activityMeasurementPrivacyDelete, activityMeasurementPrivacyReconcile, activityMeasurementRetentionBatch, activityMeasurementRetentionCleanup } from '../src/activity-measurement.ts';
import { activityPrivacyReadiness, expireActivityMeasurement } from '../../../packages/db/src/activity-measurement-privacy.ts';

const subject = '019a0f00-0000-7000-8000-000000000001';
const requestId = '019a0f00-0000-7000-8000-000000000002';
const reads = [];
const run = async (_binding, work) => work({ query: async (sql, values) => {
  reads.push({ sql, values });
  return { rows: [{ objects: 8, declared: true, result: { consent: null, activeDates: [] }, removed: 0 }], rowCount: 1 };
} });

test('privacy hooks use only subject-bound purpose functions, not profile/support data', async () => {
  reads.length = 0;
  assert.deepEqual(await activityMeasurementPrivacyExport({}, requestId, subject, run), { consent: null, activeDates: [] });
  assert.equal(await activityMeasurementPrivacyDelete({}, requestId, subject, run), 0);
  assert.deepEqual(reads.filter(read => read.values).map(read => read.values), [[requestId, subject], [requestId, subject]]);
  assert.equal(reads.some(read => /support\.|social\./.test(read.sql)), false);
});

test('retention is a bounded existing-workflow hook with no new scheduler or scan', async () => {
  reads.length = 0;
  assert.equal(await activityMeasurementRetentionBatch({}, run), 0);
  assert.deepEqual(reads[2].values, [500]);
  assert.match(reads[2].sql, /expire_activity_measurement/);
  assert.equal(reads[0].sql, "SET LOCAL statement_timeout = '1500ms'");
  for (const limit of [0, 501, 1.5]) await assert.rejects(() => expireActivityMeasurement({}, limit), /activity_invalid_batch/);
});

test('optional pilot absence is explicit; partial schema and rollback fail closed', async () => {
  const absent = async (_binding, work) => work({ query: async () => ({ rows: [{ objects: 0, declared: false }] }) });
  assert.deepEqual(await activityMeasurementPrivacyExport({}, requestId, subject, absent), { status: 'not_collected', noticeVersion: 'activity-account-day-v1' });
  assert.equal(await activityMeasurementPrivacyDelete({}, requestId, subject, absent), 0);
  for (const row of [{ objects: 0, declared: true }, { objects: 7, declared: true }, { objects: 8, declared: false }]) {
    await assert.rejects(() => activityPrivacyReadiness({ query: async () => ({ rows: [row] }) }), /schema_incomplete/);
  }
});

test('bounded cleanup drains committed batches and signals backlog or contention for retry', async () => {
  let calls = 0;
  assert.equal(await activityMeasurementRetentionCleanup({}, async () => ++calls === 3 ? 2 : 500), 1002);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(() => activityMeasurementRetentionCleanup({}, async () => { calls++; return 500; }), /activity_retention_backlog/);
  assert.equal(calls, 20);
  await assert.rejects(() => activityMeasurementRetentionCleanup({}, async () => { throw new Error('55P03'); }), /55P03/);
});

test('privacy hook errors propagate rather than silently claiming complete export/delete', async () => {
  await assert.rejects(() => activityMeasurementPrivacyExport({}, requestId, subject, async () => { throw new Error('unavailable'); }), /unavailable/);
  await assert.rejects(() => activityMeasurementPrivacyDelete({}, requestId, 'other', run), /activity_privacy_subject_invalid/);
});

test('reconciliation is purpose-local and malformed retention results fail closed', async () => {
  reads.length = 0;
  await activityMeasurementPrivacyReconcile({}, subject, run);
  assert.deepEqual(reads[2].values, [subject]);
  assert.match(reads[2].sql, /reconcile_activity_measurement_locations/);
  for (const removed of [-1, 501, 1.5, null]) await assert.rejects(() => expireActivityMeasurement({ query: async () => ({ rows: [{ removed }] }) }), /activity_privacy_unavailable/);
});
