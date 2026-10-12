import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ACTIVITY_NOTICE, ACTIVITY_NOTICE_VERSION, activityConsentInput, activityRenderInput, activityWindows, activityMetric } from '../src/activity-measurement.ts';

const scope = 'a'.repeat(43) + '=';
const consent = { enabled: true, expectedRevision: 0, expectedEpoch: null, accountScope: scope, noticeVersion: ACTIVITY_NOTICE_VERSION };
const render = { signal: 'foreground_app_render', consentRevision: 1, consentEpoch: '019a0f00-0000-7000-8000-000000000001', accountScope: scope, noticeVersion: ACTIVITY_NOTICE_VERSION };

test('Flutter presents the exact account-linked notice required by the server', () => {
  const dart = fs.readFileSync(new URL('../../../lib/core/analytics/activity_measurement_client.dart', import.meta.url), 'utf8');
  const notice = dart.match(/const activityMeasurementNotice\s*=\s*'([^']+)';/);
  assert.equal(notice?.[1], ACTIVITY_NOTICE);
});

test('new purpose requires the exact notice and explicit account consent', () => {
  assert.deepEqual(activityConsentInput(consent), consent);
  for (const patch of [{ enabled: 'true' }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { expectedRevision: 1 }, { expectedEpoch: render.consentEpoch }, { accountScope: 'other' }, { noticeVersion: 'anonymous-v1' }, { userId: 'other-account' }]) {
    assert.throws(() => activityConsentInput({ ...consent, ...patch }), /activity_invalid_request/);
  }
  for (const value of [null, [], true, {}, { ...consent, enabled: undefined }]) assert.throws(() => activityConsentInput(value));
});

test('foreground signals reject timestamps, identity, URLs, content and background event kinds', () => {
  assert.deepEqual(activityRenderInput(render), render);
  for (const patch of [{ signal: 'heartbeat' }, { signal: 'background_refresh' }, { signal: 'screen_view' }, { consentRevision: 0 }, { consentEpoch: null }, { consentEpoch: 'other' }, { accountScope: 'other' }, { noticeVersion: 'anonymous-v1' }, { accountId: 'other' }, { url: '/private' }, { content: 'private' }, { timestamp: '2026-01-01' }]) {
    assert.throws(() => activityRenderInput({ ...render, ...patch }), /activity_invalid_request/);
  }
});

test('parsers reject getters, symbols and inherited fields without invoking them', () => {
  let calls = 0;
  assert.throws(() => activityConsentInput({ ...consent, get enabled() { calls++; return true; } }));
  assert.equal(calls, 0);
  assert.throws(() => activityConsentInput({ ...consent, [Symbol('extra')]: true }));
  assert.throws(() => activityConsentInput(Object.create(consent)));
});

test('sealed UTC windows handle midnight, leap day, year and timezone boundaries', () => {
  const windows = activityWindows('2026-01-01T00:00:00.000Z');
  assert.deepEqual(windows.dau, { since: '2025-12-31T00:00:00.000Z', until: '2026-01-01T00:00:00.000Z' });
  assert.equal(windows.previousQuiet.until, windows.recentQuiet.since);
  assert.equal(windows.quiet.since, windows.previousQuiet.since);
  assert.equal(activityWindows('2024-03-01T00:00:00.000Z').dau.since, '2024-02-29T00:00:00.000Z');
  assert.deepEqual(activityWindows('2026-01-01T23:59:59.999Z'), windows);
  assert.equal(activityWindows('2026-01-02T00:00:00.000Z').dau.since, '2026-01-01T00:00:00.000Z');
  assert.throws(() => activityWindows('2026-02-30T00:00:00.000Z'));
});

test('zero, unknown, partial coverage, disabled, empty cohort and quiet remain distinct', () => {
  const base = { observed: 0, cohortSize: 5, covered: true, enabled: true, window: activityWindows('2026-10-07T12:00:00.000Z').dau };
  assert.equal(activityMetric(base).value, 0);
  assert.equal(activityMetric({ ...base, covered: false }).state, 'unavailable');
  assert.equal(activityMetric({ ...base, observed: 2, covered: false }).observedLowerBound, 2);
  assert.equal(activityMetric({ ...base, observed: 2, covered: false, quiet: true }).observedLowerBound, null);
  for (const patch of [{ observed: undefined }, { observed: -1 }, { observed: 6 }, { observed: 0.5 }, { observed: NaN }, { observed: 5001 }, { cohortSize: 0 }, { capacityExceeded: true }, { enabled: false }]) {
    const metric = activityMetric({ ...base, ...patch });
    assert.equal(metric.value, null);
    assert.equal(metric.observedLowerBound, null);
  }
});
