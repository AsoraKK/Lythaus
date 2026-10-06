import assert from 'node:assert/strict';
import test from 'node:test';
import { countValue, overviewMetric, overviewScope } from '../src/overview-policy.ts';
import { overviewSnapshot } from '../src/overview-runtime.ts';

test('UTC day, MTD and YTD compare matching elapsed half-open windows', () => {
  const now = new Date('2026-10-02T12:34:56Z');
  for (const [period, start, prior] of [['today', '2026-10-02', '2026-10-01'], ['mtd', '2026-10-01', '2026-09-01'], ['ytd', '2026-01-01', '2025-01-01']]) {
    const scope = overviewScope(period, now);
    assert.equal(scope.current.start, `${start}T00:00:00.000Z`);
    assert.equal(scope.previous.start, `${prior}T00:00:00.000Z`);
    assert.equal(Date.parse(scope.current.end) - Date.parse(scope.current.start), Date.parse(scope.previous.end) - Date.parse(scope.previous.start));
    assert.equal(scope.comparable, true);
  }
});

test('calendar boundaries, offset input and leap years do not invent prior elapsed coverage', () => {
  const january = overviewScope('mtd', new Date('2026-01-02T00:00:00Z'));
  assert.equal(january.previous.start, '2025-12-01T00:00:00.000Z');
  const shorter = overviewScope('mtd', new Date('2026-03-31T10:00:00Z'));
  assert.equal(shorter.previous.end, '2026-03-01T00:00:00.000Z');
  assert.equal(shorter.comparable, false);
  assert.equal(overviewScope('ytd', new Date('2024-12-31T23:00:00Z')).comparable, false);
  assert.equal(overviewScope('today', new Date('2026-10-02T00:30:00+02:00')).current.start, '2026-10-01T00:00:00.000Z');
  const midnight = overviewScope('today', new Date('2026-10-02T00:00:00Z'));
  assert.equal(midnight.current.start, midnight.current.end);
  for (const period of ['', 'last30', 'TODAY']) assert.throws(() => overviewScope(period, new Date()), /overview_invalid_period/);
  assert.throws(() => overviewScope('today', new Date(NaN)), /overview_invalid_period/);
});

test('missing, malformed and empty values do not become zero', () => {
  for (const value of [null, undefined, '', ' ', [], {}, true, false, NaN, Infinity, -1, 1.5, 'unknown', Number.MAX_SAFE_INTEGER + 1]) assert.equal(countValue(value), null);
  assert.equal(countValue('0'), 0);
  assert.equal(countValue(3), 3);
  assert.equal(overviewMetric(0, 0, 'source', 'definition').changePercent, null);
  assert.equal(overviewMetric(null, null, 'source', 'definition').availability, 'unavailable');
  assert.equal(overviewMetric(2, 4, 'source', 'definition').changePercent, -50);
});

const row = { post_rows: 4, comment_rows: 8, user_rows: 10, posts: 2, comments: 5, cohort_comments: 3,
  unanswered_posts: 1, unique_contributors: 3, new_registrations: 2, subscriptions_free: 8, subscriptions_premium: 1, subscriptions_black: 1 };
const scope = () => overviewScope('today', new Date('2026-10-02T12:00:00Z'));
const rows = changes => [{ ...row, window: 'current', ...changes }, { ...row, window: 'previous', posts: 1, cohort_comments: 1 }];

test('metric ratios use comments on the new-post cohort and tier counts do not claim historical payment', () => {
  const data = overviewSnapshot(scope(), rows());
  assert.equal(data.metrics.comments.value, 5);
  assert.equal(data.metrics.commentsPerPost.value, 1.5);
  assert.equal(data.metrics.commentsPerPost.previous, 1);
  assert.equal(data.metrics.subscriptionsPremium.value, 1);
  assert.equal(data.metrics.subscriptionsPremium.previous, null);
  assert.equal(data.providers.cloudflare.accruedCost, null);
  assert.equal(data.providers.planetscale.currency, null);
  assert.ok(data.gaps.newVerifiedUsers && data.gaps.revenue && data.gaps.retentionRate);
});

test('empty cohorts, capped populations and incomparable periods return unavailable', () => {
  assert.equal(overviewSnapshot(scope(), rows({ posts: 0, cohort_comments: 0 })).metrics.commentsPerPost.value, null);
  const capped = overviewSnapshot(scope(), rows({ post_rows: 5001 }));
  assert.equal(capped.metrics.posts.value, null);
  assert.equal(capped.metrics.posts.reason, 'snapshot_row_limit');
  assert.equal(capped.metrics.newRegistrations.value, 2);
  assert.equal(overviewSnapshot(scope(), rows({ user_rows: 5001 })).metrics.subscriptionsFree.value, null);
  const shorter = overviewSnapshot(overviewScope('mtd', new Date('2026-03-31T12:00:00Z')), rows());
  assert.equal(shorter.metrics.posts.previous, null);
  assert.equal(shorter.metrics.posts.changePercent, null);
  assert.throws(() => overviewSnapshot(scope(), []), /overview_unavailable/);
});
