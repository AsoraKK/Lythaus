import assert from 'node:assert/strict';
import test from 'node:test';
import { handleActivityMeasurement, activityAccountScope, isActivityMeasurementPath } from '../src/activity-measurement-handler.ts';
import { ACTIVITY_NOTICE_VERSION } from '../../../packages/contracts/src/activity-measurement.ts';

const actor = { userId: '019a0f00-0000-7000-8000-000000000001' };
const other = { userId: '019a0f00-0000-7000-8000-000000000002' };
const epoch = '019a0f00-0000-7000-8000-000000000003';
const env = { DB_APP_FRESH: {}, PII_HMAC_KEY_V1: 'Synthetic purpose scope key only' };
const state = { pilotEnabled: true, granted: true, revision: 1, epoch, continuousSince: '2026-10-07T00:00:00.000Z' };
const accountScope = activityAccountScope(actor.userId, env.PII_HMAC_KEY_V1);
const consent = { enabled: true, expectedRevision: 0, expectedEpoch: null, accountScope, noticeVersion: ACTIVITY_NOTICE_VERSION };
const render = { signal: 'foreground_app_render', consentRevision: 1, consentEpoch: epoch, accountScope, noticeVersion: ACTIVITY_NOTICE_VERSION };
const request = (path, method = 'GET', body) => new Request('https://lythaus.co/api/analytics/' + path, {
  method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
function runner(reads, result = state, fail = null) {
  return async (_binding, work) => work({ query: async (sql, values) => {
    reads.push({ sql, values });
    if (fail) throw new Error(fail);
    return { rows: [{ state: result, result }], rowCount: 1 };
  } });
}

test('authenticated status exposes the new purpose and no-store response', async () => {
  const reads = [];
  const response = await handleActivityMeasurement(request('activity-consent'), env, actor, runner(reads));
  const value = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(value.accountScope, accountScope);
  assert.equal(value.noticeVersion, ACTIVITY_NOTICE_VERSION);
  assert.match(value.notice, /account-linked/);
  assert.equal(value.retentionDays, 61);
  assert.deepEqual(reads[1].values, [actor.userId]);
  assert.equal(Object.hasOwn(value, 'userId'), false);
});

test('consent and render execute canonical parameterized operations only', async () => {
  const reads = [];
  assert.equal((await handleActivityMeasurement(request('activity-consent', 'PUT', consent), env, actor, runner(reads))).status, 200);
  const write = reads.find(r => r.sql.includes('set_activity_measurement_consent'));
  assert.equal(write.values[1], true);
  assert.deepEqual(write.values.slice(2), [0, null, ACTIVITY_NOTICE_VERSION]);
  reads.length = 0;
  const response = await handleActivityMeasurement(request('activity', 'POST', render), env, actor,
    runner(reads, { activeDay: '2026-10-07', inserted: false }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { activeDay: '2026-10-07', inserted: false });
  assert.deepEqual(reads.at(-1).values, [1, epoch]);
});

test('account switches reject old scope before opening a transaction, even matching revision', async () => {
  for (const [path, method, body] of [['activity-consent', 'PUT', consent], ['activity', 'POST', render]]) {
    const reads = [];
    const response = await handleActivityMeasurement(request(path, method, body), env, other, runner(reads));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'activity_account_scope_changed' });
    assert.equal(reads.length, 0);
  }
});

test('spoofed identity, history, background kinds and old anonymous notice perform no queries', async () => {
  for (const patch of [{ userId: other.userId }, { url: '/private' }, { signal: 'heartbeat' }, { signal: 'background_refresh' }, { timestamp: '2026-01-01' }, { noticeVersion: 'anonymous-v1' }]) {
    const reads = [];
    const response = await handleActivityMeasurement(request('activity', 'POST', { ...render, ...patch }), env, actor, runner(reads));
    assert.equal(response.status, 400);
    assert.equal(reads.length, 0);
  }
});

test('revision conflicts, withdrawal races and disabled signals have explicit safe errors', async () => {
  for (const code of ['activity_consent_revision_conflict', 'activity_consent_required', 'activity_pilot_disabled']) {
    const response = await handleActivityMeasurement(request('activity', 'POST', render), env, actor, runner([], state, code));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: code });
  }
});

test('unavailable database, malformed source and oversized body never disclose error content', async () => {
  for (const [config, result, fail] of [[{}, state, null], [env, {}, null], [env, state, 'Synthetic private body and identity must not escape']]) {
    const response = await handleActivityMeasurement(request('activity-consent'), config, actor, runner([], result, fail));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'activity_source_unavailable' });
  }
  const response = await handleActivityMeasurement(request('activity', 'POST', { ...render, history: 'x'.repeat(2000) }), env, actor, runner([]));
  assert.equal(response.status, 413);
});

test('route and method guard preserves the separate anonymous path', async () => {
  assert.equal(isActivityMeasurementPath('/api/analytics/events'), false);
  assert.equal((await handleActivityMeasurement(request('events'), env, actor, runner([]))).status, 404);
  for (const [path, method] of [['activity', 'GET'], ['activity-consent', 'POST'], ['activity-consent?userId=other', 'GET']]) {
    assert.equal((await handleActivityMeasurement(request(path, method), env, actor, runner([]))).status, 400);
  }
});
