import assert from 'node:assert/strict';
import test from 'node:test';
import { handleActivityMeasurementSummary } from '../src/activity-measurement-handler.ts';
import { activitySummary } from '../../../packages/db/src/activity-measurement.ts';

const actor = { userId: '019a0f00-0000-7000-8000-000000000001', role: 'owner' };
const correlation = '019a0f00-0000-7000-8000-000000000002';
const request = new Request('https://admin.lythaus.co/api/admin/activity-measurement');
const snapshot = { enabled: true, sampledAt: '2026-10-07T12:00:00.000Z', accountRows: 5,
  periods: Object.fromEntries(['1', '7', '30', '60'].map(span => [span, { observed: 0, cohortSize: 5, covered: true }])) };
function runner(reads, result = snapshot, fail = null) {
  return async (_binding, work) => work({ query: async (sql, values) => {
    reads.push({ sql, values });
    if (fail) throw new Error(fail);
    return { rows: [{ result }], rowCount: 1 };
  } });
}

test('owner-only no-store summary contains bounded aggregates and safe audit metadata', async () => {
  const reads = [];
  const response = await handleActivityMeasurementSummary(request, { DB_ADMIN_FRESH: {} }, actor, correlation, runner(reads));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.metrics.dau.value, 0);
  assert.equal(body.windowBasis, 'completed_utc_days');
  assert.equal(body.metrics.quiet.since, '2026-08-08T00:00:00.000Z');
  assert.equal(JSON.stringify(body).includes(actor.userId), false);
  const audit = reads.find(read => read.sql.includes('INSERT INTO system.audit_events'));
  assert.deepEqual(JSON.parse(audit.values[2]), { contractVersion: 'activity-pilot-v1', pilotEnabled: true });
  assert.equal(reads.some(read => /SELECT .*FROM privacy\.account_active_days/.test(read.sql)), false);
});

test('nonowners and stale owner membership fail without aggregate disclosure', async () => {
  for (const role of ['administrator', 'moderator', 'privacy_operator']) {
    const reads = [];
    assert.equal((await handleActivityMeasurementSummary(request, { DB_ADMIN_FRESH: {} }, { ...actor, role }, correlation, runner(reads))).status, 403);
    assert.equal(reads.length, 0);
  }
  assert.equal((await handleActivityMeasurementSummary(request, { DB_ADMIN_FRESH: {} }, actor, correlation, runner([], snapshot, 'activity_owner_required'))).status, 403);
});

test('disabled, capacity, partial and quiet gaps never become invented zeroes', () => {
  assert.equal(activitySummary({ enabled: false, sampledAt: snapshot.sampledAt }).metrics.dau.reason, 'pilot_disabled');
  assert.equal(activitySummary({ ...snapshot, accountRows: 5001 }).metrics.mau.reason, 'snapshot_capacity_exceeded');
  const partial = activitySummary({ ...snapshot, periods: { ...snapshot.periods, '1': { observed: 2, cohortSize: 5, covered: false }, '60': { observed: 2, cohortSize: 5, covered: false } } });
  assert.equal(partial.metrics.dau.observedLowerBound, 2);
  assert.equal(partial.metrics.quiet.value, null);
  assert.equal(partial.metrics.quiet.observedLowerBound, null);
});

test('source timeout and audit failure return unavailable without private error text', async () => {
  for (const result of [{}, { ...snapshot, sampledAt: 'bad' }]) {
    const response = await handleActivityMeasurementSummary(request, { DB_ADMIN_FRESH: {} }, actor, correlation, runner([], result));
    assert.equal(response.status, 503);
  }
  const response = await handleActivityMeasurementSummary(request, { DB_ADMIN_FRESH: {} }, actor, correlation, runner([], snapshot, 'Synthetic private content'));
  assert.deepEqual(await response.json(), { error: 'activity_source_unavailable' });
});
