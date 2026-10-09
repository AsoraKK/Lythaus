const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) ? Date.parse(value) : NaN;
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 5000;
export const pilotLabels = { dau: 'Pilot DAU', wau: 'Pilot WAU', mau: 'Pilot rolling 30-day MAU', quiet: 'Pilot quiet accounts' };
export function activityPilotEvidence(snapshot, now = Date.now()) {
  const sampled = timestamp(snapshot?.sampledAt);
  if (snapshot?.contractVersion !== 'activity-pilot-v1' || snapshot.timezone !== 'UTC'
      || snapshot.source !== 'privacy.account_active_days' || snapshot.windowBasis !== 'completed_utc_days'
      || snapshot.retentionDays !== 61 || snapshot.accountLimit !== 5000 || typeof snapshot.enabled !== 'boolean'
      || typeof snapshot.population !== 'string' || !Number.isFinite(sampled)) throw new Error('Pilot source contract is unavailable.');
  const end = new Date(sampled); end.setUTCHours(0, 0, 0, 0);
  const fresh = now >= sampled && now - sampled < 60000 && now < end.getTime() + 86400000;
  const metrics = {};
  for (const [key, days] of Object.entries({ dau: 1, wau: 7, mau: 30, quiet: 60 })) {
    const metric = snapshot.metrics?.[key];
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - days);
    if (!metric || timestamp(metric.since) !== start.getTime() || timestamp(metric.until) !== end.getTime()
        || !['available', 'partial', 'unavailable'].includes(metric.state)
        || (metric.cohortSize !== null && !count(metric.cohortSize))
        || (metric.state === 'available' ? !snapshot.enabled || !count(metric.value) || !count(metric.cohortSize)
          || metric.cohortSize === 0 || metric.value > metric.cohortSize || metric.observedLowerBound !== null || metric.reason !== null
          : metric.value !== null || typeof metric.reason !== 'string')
        || (metric.state === 'partial' ? key === 'quiet' || !snapshot.enabled || !count(metric.observedLowerBound)
          || metric.observedLowerBound === 0 || !count(metric.cohortSize) || metric.observedLowerBound > metric.cohortSize
          || metric.reason !== 'incomplete_measurement_coverage' : metric.observedLowerBound !== null)) throw new Error('Pilot source contract is unavailable.');
    const value = fresh && metric.state === 'available' ? metric.value : null;
    const lower = fresh && metric.state === 'partial' ? metric.observedLowerBound : null;
    metrics[key] = { ...metric, text: value !== null ? value.toLocaleString('en-GB') : lower !== null ? `At least ${lower.toLocaleString('en-GB')}` : 'Unavailable',
      explanation: !fresh ? 'No fresh sample. Refresh to verify this UTC window.'
        : metric.state === 'partial' ? 'Observed lower bound within this consenting cohort; measurement coverage is incomplete.'
        : metric.reason === 'pilot_disabled' ? 'Pilot collection is disabled.'
        : metric.reason === 'no_observable_cohort' ? 'No continuously consenting cohort covers this complete window.'
        : metric.reason === 'incomplete_measurement_coverage' ? 'Missing coverage prevents a measured value. Missing activity does not prove quiet.'
        : metric.reason === 'snapshot_capacity_exceeded' ? 'The bounded snapshot capacity was exceeded.'
        : metric.state === 'available' ? `Complete observed coverage of ${metric.cohortSize.toLocaleString('en-GB')} continuously consenting accounts.`
        : 'The source is unavailable.' };
  }
  return { fresh, metrics, population: snapshot.population, sampledAt: snapshot.sampledAt,
    expiresAt: Math.min(sampled + 60000, end.getTime() + 86400000) };
}
