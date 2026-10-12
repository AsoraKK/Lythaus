// Synthetic unit-test contract fixture. Browser evidence uses captured local PG17 output.
export function pilotSnapshot(sampledAt = '2026-10-07T12:00:00.000Z') {
  const end = new Date(sampledAt); end.setUTCHours(0, 0, 0, 0);
  const metrics = {};
  for (const [key, days, value] of [['dau', 1, 2], ['wau', 7, 2], ['mau', 30, 3], ['quiet', 60, 1]]) {
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - days);
    metrics[key] = { state: 'available', value, observedLowerBound: null, cohortSize: 4, reason: null, since: start.toISOString(), until: end.toISOString() };
  }
  return { contractVersion: 'activity-pilot-v1', enabled: true, sampledAt, timezone: 'UTC', source: 'privacy.account_active_days', windowBasis: 'completed_utc_days', retentionDays: 61, accountLimit: 5000, population: 'Synthetic continuously consenting local PostgreSQL fixture; not production data.', metrics };
}
