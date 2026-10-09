import { describe, expect, it } from 'vitest';
import { overviewActivityEvidence } from './overview-activity.js';

const sampledAt = '2026-10-07T07:00:00.000Z';
function snapshot(count = 3, overrides = {}) {
  return { contractVersion: 'overview-v1', timezone: 'UTC', coverage: 'retained_current_state',
    period: 'today', sampledAt, cacheTtlSeconds: 60, rowLimit: 5000,
    current: { start: '2026-10-07T00:00:00.000Z', end: sampledAt },
    metrics: { uniqueContributors: { value: count, unit: 'count', availability: 'available', reason: null } }, ...overrides };
}
const known = (data, fresh = true, period = 'today') => overviewActivityEvidence(data, fresh, period).knownActiveLowerBound;
const assertUnknown = data => {
  const result = overviewActivityEvidence(data, true, data?.period ?? 'today');
  for (const key of ['activeMembers', 'contributorActiveRatio', 'quietMembers']) {
    expect(result[key].value).toBeNull();
    expect(result[key].availability).toBe('unavailable');
  }
};

describe('contributor-backed activity evidence', () => {
  it.each([0, 1, 3, 5000, 10000])('includes every counted contributor in the known-active minimum: %s', count => {
    const data = snapshot(count);
    expect(known(data)).toMatchObject({ value: count, availability: 'lower_bound' });
    assertUnknown(data);
  });

  it('keeps zero contribution evidence separate from reader-inclusive active, share and quiet totals', () => {
    const data = snapshot(0);
    expect(known(data).reason).toContain('Readers remain unmeasured');
    assertUnknown(data);
  });

  it('uses the canonical distinct-author measure without adding posts, comments or account status counts', () => {
    const data = snapshot(2);
    data.metrics.posts = { value: 99, availability: 'available' };
    data.metrics.comments = { value: 123, availability: 'available' };
    data.metrics.activeMembers = { value: 999, availability: 'available' };
    data.accounts = { active: 0 };
    expect(known(data).value).toBe(2);
    assertUnknown(data);
    delete data.metrics.uniqueContributors;
    expect(known(data).value).toBeNull();
  });

  it.each(['today', 'mtd', 'ytd'])('keeps evidence in the existing %s report window without introducing rolling metrics', period => {
    const data = snapshot(4, { period, current: { start: period === 'ytd' ? '2026-01-01T00:00:00.000Z' : period === 'mtd' ? '2026-10-01T00:00:00.000Z' : '2026-10-07T00:00:00.000Z', end: sampledAt } });
    expect(known(data, true, period).value).toBe(4);
    expect(known(data, true, period === 'today' ? 'mtd' : 'today').value).toBeNull();
  });

  it.each([null, -1, 1.5, '3', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 10001])('withholds an invalid distinct-contributor count: %s', count => {
    expect(known(snapshot(count))).toMatchObject({ value: null, availability: 'unavailable' });
  });

  it('withholds unavailable/capped/contradictory source values even when a positive value is present', () => {
    for (const extra of [{ availability: 'unavailable' }, { reason: 'snapshot_row_limit' }, { unit: 'ratio' }]) {
      const data = snapshot(); Object.assign(data.metrics.uniqueContributors, extra);
      expect(known(data).value).toBeNull();
    }
    const capped = snapshot(); Object.assign(capped.metrics.uniqueContributors, { value: null, availability: 'unavailable', reason: 'snapshot_row_limit' });
    expect(known(capped).reason).toContain('Snapshot capacity exceeded');
  });

  it.each([null, {}, snapshot(3, { contractVersion: 'wrong' }), snapshot(3, { timezone: 'Europe/London' }),
    snapshot(3, { coverage: 'partial' }), snapshot(3, { cacheTtlSeconds: 600 }), snapshot(3, { rowLimit: 1 }),
    snapshot(3, { current: { start: 'invalid', end: sampledAt } }),
    snapshot(3, { current: { start: sampledAt, end: '2026-10-07T06:59:00Z' } }),
    snapshot(3, { current: { start: '2026-10-07T00:00:00Z', end: '2026-10-07T06:59:00Z' } }),
  ])('withholds evidence from an unverified snapshot/window: %j', data => {
    expect(known(data).value).toBeNull();
  });

  it('withholds a previously available lower bound on expiry, loading or owner denial', () => {
    const data = snapshot(3);
    expect(known(data, false).value).toBeNull();
    expect(known(null, false).value).toBeNull();
    assertUnknown(data);
  });

  it('does not mutate or expose account identity or private content fields', () => {
    const data = snapshot(3); data.private = { accountId: 'synthetic-private-id', content: 'synthetic-private-body' };
    const before = JSON.stringify(data);
    const result = overviewActivityEvidence(data, true, 'today');
    expect(JSON.stringify(data)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('synthetic-private');
  });
});
