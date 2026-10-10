const PERIODS = ['today', 'mtd', 'ytd'];

const unavailable = reason => ({ value: null, availability: 'unavailable', reason });

export function overviewCalendarStart(period, at) {
  const date = new Date(at);
  date.setUTCHours(0, 0, 0, 0);
  if (period === 'mtd') date.setUTCDate(1);
  if (period === 'ytd') date.setUTCMonth(0, 1);
  return date.getTime();
}

export function overviewSnapshotFresh(community, period, expired, now = Date.now()) {
  const age = now - Date.parse(community?.sampledAt);
  return !expired && community?.period === period && Number.isFinite(age) && age >= -5000 && age <= 65000
    && community.cacheTtlSeconds === 60 && Date.parse(community.current?.start) === overviewCalendarStart(period, now);
}

export function overviewActivityEvidence(community, fresh, period) {
  const windowStart = Date.parse(community?.current?.start);
  const windowEnd = Date.parse(community?.current?.end);
  const verifiedWindow = fresh === true && community?.contractVersion === 'overview-v1'
    && community.timezone === 'UTC' && community.coverage === 'retained_current_state'
    && PERIODS.includes(period) && community.period === period
    && community.cacheTtlSeconds === 60 && community.rowLimit === 5000
    && Number.isFinite(windowStart) && Number.isFinite(windowEnd) && windowStart <= windowEnd
    && windowEnd === Date.parse(community.sampledAt);
  const contributors = community?.metrics?.uniqueContributors;
  const counted = verifiedWindow && contributors?.availability === 'available'
    && contributors.unit === 'count' && contributors.reason === null
    && Number.isSafeInteger(contributors.value) && contributors.value >= 0
    && contributors.value <= community.rowLimit * 2;
  const knownActiveLowerBound = counted ? {
    value: contributors.value,
    availability: 'lower_bound',
    reason: contributors.value === 0
      ? 'No contributors observed in retained public posts and comments. Readers remain unmeasured.'
      : 'Distinct contributors in retained public posts and comments. Active readers can increase this count.',
  } : unavailable(!verifiedWindow ? 'No fresh verified sample for this report window.'
    : contributors?.reason === 'snapshot_row_limit' ? 'Snapshot capacity exceeded; contributor evidence is unavailable.'
      : 'A verified distinct-contributor count is unavailable.');

  return {
    knownActiveLowerBound,
    activeMembers: unavailable('Complete signed-in app-use evidence, including readers, is unavailable.'),
    contributorActiveRatio: unavailable('A complete active-member denominator is required. The lower bound cannot establish this share.'),
    quietMembers: unavailable('No complete app-use history and approved inactivity window. Absence of a contribution cannot establish quiet membership.'),
  };
}
