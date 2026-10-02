import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarRewardMonths, calendarRewardQuarter, quarterlyRewardTaskValidity, rewardCalendarInstant, rewardCalendarMonthAt, shiftRewardCalendarMonth } from '../src/reward-calendar.ts';
import { projectMonthlyReputationActivity } from '../src/reward-monthly-activity.ts';

const USER = 'synthetic-member';
const AS_OF = '2026-10-02T12:00:00Z';

function event(overrides = {}) {
  return {
    id: 'synthetic-event-1', subjectUserId: USER, eventType: 'qualifying_human_contribution',
    sourceEventId: 'synthetic-source-1', policyVersion: 'reputation-v2.0.0',
    occurredAt: '2026-09-30T23:59:59.999Z', recordedAt: '2026-10-01T00:01:00Z',
    impact: 10, status: 'effective', reversalReference: null, ...overrides,
  };
}

function project(events, asOf = AS_OF, timeZone = 'UTC') {
  return projectMonthlyReputationActivity(events, USER, asOf, timeZone);
}

test('calendar months separate current reward qualification from next-month progress', () => {
  assert.deepEqual(calendarRewardMonths(AS_OF, 'UTC'), {
    timeZone: 'UTC', currentRewardMonth: '2026-10', qualificationMonth: '2026-09',
    currentActivityMonth: '2026-10', nextRewardMonth: '2026-11',
  });
  const result = project([event(), event({ id: 'current', sourceEventId: 'current', occurredAt: '2026-10-01T00:00:00Z' })]);
  assert.equal(result.qualificationActivity.positiveImpact, 10);
  assert.equal(result.qualificationActivity.followingRewardMonth, '2026-10');
  assert.equal(result.currentActivity.positiveImpact, 10);
  assert.equal(result.currentActivity.followingRewardMonth, '2026-11');
  assert.equal(result.status, 'monthly_policy_pending');
  assert.equal(result.rewardLevel, null);
  assert.equal(result.nextRewardLevel, null);
});

test('calendar month changes at exact boundaries and across year and leap-day transitions', () => {
  for (const [instant, month] of [
    ['2026-09-30T23:59:59.999Z', '2026-09'], ['2026-10-01T00:00:00Z', '2026-10'],
    ['2026-12-31T23:59:59.999Z', '2026-12'], ['2027-01-01T00:00:00Z', '2027-01'],
    ['2024-02-29T23:59:59.999Z', '2024-02'], ['2024-03-01T00:00:00Z', '2024-03'],
  ]) assert.equal(rewardCalendarMonthAt(instant, 'UTC'), month);
  assert.equal(calendarRewardMonths('2027-01-01T00:00:00Z', 'UTC').qualificationMonth, '2026-12');
  assert.equal(shiftRewardCalendarMonth('2024-01', 1), '2024-02');
  assert.equal(shiftRewardCalendarMonth('2024-02', 1), '2024-03');
  assert.equal(shiftRewardCalendarMonth('2026-12', 1), '2027-01');
});

test('timezone is explicit and offset-equivalent instants and DST agree', () => {
  assert.throws(() => calendarRewardMonths(AS_OF), /timezone_required/);
  assert.throws(() => calendarRewardMonths(AS_OF, ''), /timezone_required/);
  assert.throws(() => calendarRewardMonths(AS_OF, 'Mars/Colony'), /timezone_invalid/);
  assert.equal(rewardCalendarMonthAt('2026-10-01T00:30:00Z', 'UTC'), '2026-10');
  assert.equal(rewardCalendarMonthAt('2026-10-01T00:30:00Z', 'America/New_York'), '2026-09');
  assert.equal(rewardCalendarMonthAt('2026-09-30T20:30:00-04:00', 'America/New_York'), '2026-09');
  assert.equal(rewardCalendarMonthAt('2026-11-01T03:59:59.999Z', 'America/New_York'), '2026-10');
  assert.equal(rewardCalendarMonthAt('2026-11-01T04:00:00Z', 'America/New_York'), '2026-11');
  assert.equal(rewardCalendarMonthAt('2026-11-01T01:30:00-04:00', 'America/New_York'), '2026-11');
  assert.equal(rewardCalendarMonthAt('2026-11-01T01:30:00-05:00', 'America/New_York'), '2026-11');
});

test('invalid or timezone-free timestamps never use the device timezone', () => {
  for (const value of ['2026-10-01', '2026-10-01T00:00:00', 'invalid', '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01T24:00:00Z', '0000-01-01T00:00:00Z']) {
    assert.throws(() => rewardCalendarInstant(value), /timestamp_invalid/);
  }
  assert.equal(rewardCalendarInstant('2024-02-29T00:00:00Z').toISOString(), '2024-02-29T00:00:00.000Z');
  for (const value of ['2026-00', '2026-13', '26-01', '0000-01']) assert.throws(() => calendarRewardQuarter(value), /month_invalid/);
  assert.throws(() => shiftRewardCalendarMonth('2026-01', 0.5), /increment_invalid/);
  assert.throws(() => shiftRewardCalendarMonth('9999-12', 1), /month_invalid/);
});

test('all four calendar quarters repeat each year including leap years and Q4 rollover', () => {
  for (const year of [2024, 2025, 2026, 2027]) {
    for (let month = 1; month <= 12; month += 1) {
      const q = Math.floor((month - 1) / 3) + 1;
      const first = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}`;
      assert.deepEqual(calendarRewardQuarter(`${year}-${String(month).padStart(2, '0')}`), {
        key: `${year}-Q${q}`, firstMonth: first,
        lastMonth: `${year}-${String(q * 3).padStart(2, '0')}`,
        expiresInMonth: q === 4 ? `${year + 1}-01` : `${year}-${String(q * 3 + 1).padStart(2, '0')}`,
      });
    }
  }
});

test('quarterly completion becomes valid at completion and expires each next quarter', () => {
  for (const [completion, beforeEnd, afterEnd] of [
    ['2026-01-15T12:00:00Z', '2026-03-31T23:59:59.999Z', '2026-04-01T00:00:00Z'],
    ['2026-04-15T12:00:00Z', '2026-06-30T23:59:59.999Z', '2026-07-01T00:00:00Z'],
    ['2026-07-15T12:00:00Z', '2026-09-30T23:59:59.999Z', '2026-10-01T00:00:00Z'],
    ['2026-10-15T12:00:00Z', '2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00Z'],
  ]) {
    assert.equal(quarterlyRewardTaskValidity(completion, completion, 'UTC').valid, true);
    assert.equal(quarterlyRewardTaskValidity(completion, beforeEnd, 'UTC').valid, true);
    assert.equal(quarterlyRewardTaskValidity(completion, afterEnd, 'UTC').valid, false);
  }
  const completion = '2026-03-31T23:59:59Z';
  const result = quarterlyRewardTaskValidity(completion, completion, 'UTC');
  assert.equal(result.firstFollowingRewardMonth, '2026-04');
  assert.equal(result.quarter.expiresInMonth, '2026-04');
  assert.equal(quarterlyRewardTaskValidity(completion, '2026-03-01T00:00:00Z', 'UTC').valid, false);
  assert.equal(result.validFrom, '2026-03-31T23:59:59.000Z');
  assert.equal('points' in result, false);
});

test('quarter expiry follows the configured zone rather than UTC or account anniversary', () => {
  const completedAt = '2026-01-31T12:00:00Z';
  assert.equal(quarterlyRewardTaskValidity(completedAt, '2026-04-01T03:59:59Z', 'America/New_York').valid, true);
  assert.equal(quarterlyRewardTaskValidity(completedAt, '2026-04-01T04:00:00Z', 'America/New_York').valid, false);
  assert.equal(quarterlyRewardTaskValidity('2024-02-29T12:00:00Z', '2024-03-31T23:59:59Z', 'UTC').valid, true);
});

test('replay is idempotent and contradictory identities fail closed', () => {
  const original = event();
  assert.deepEqual(project([original, original]), project([original]));
  assert.deepEqual(project([original, { ...original, occurredAt: '2026-10-01T01:59:59.999+02:00' }]), project([original]));
  assert.throws(() => project([original, { ...original, impact: 20 }]), /replay_conflict/);
  assert.throws(() => project([original, { ...original, id: 'different-id' }]), /duplicate_source/);
  const legacy = event({ sourceEventId: null });
  assert.deepEqual(project([legacy, legacy]), project([legacy]));
});

test('late recording stays in the original month and never promotes a reward level', () => {
  const result = project([event({ recordedAt: '2026-10-02T11:59:59Z' })]);
  assert.equal(result.qualificationActivity.positiveImpact, 10);
  assert.equal(result.currentActivity.positiveImpact, 0);
  assert.equal(result.rewardLevel, null);
  assert.equal(project([event({ recordedAt: '2026-10-03T00:00:00Z' })]).qualificationActivity.positiveImpact, 0);
  assert.equal(project([event({ occurredAt: '2026-10-03T00:00:00Z' })]).currentActivity.positiveImpact, 0);
});

test('reversals correct the original month without awarding inverse points in a later month', () => {
  const original = event({ status: 'reversed' });
  const reversal = event({ id: 'reversal', sourceEventId: 'reversal-source', eventType: 'reputation_event_reversal',
    occurredAt: '2026-10-02T10:00:00Z', recordedAt: '2026-10-02T10:00:00Z', impact: -10,
    status: 'reversed', reversalReference: original.id });
  const result = project([original, reversal, reversal]);
  assert.equal(result.qualificationActivity.positiveImpact, 0);
  assert.equal(result.qualificationActivity.reversedEvents, 1);
  assert.equal(result.currentActivity.negativeImpact, 0);
  assert.equal(result.currentActivity.effectiveEvents, 0);
  const reversedPenalty = event({ eventType: 'confirmed_spam', impact: -20, status: 'reversed' });
  const refund = { ...reversal, impact: 20, reversalReference: reversedPenalty.id };
  assert.equal(project([reversedPenalty, refund]).currentActivity.positiveImpact, 0);
  assert.throws(() => project([event({ eventType: 'reputation_event_reversal', reversalReference: null })]), /reversal_invalid/);
});

test('observed impacts retain upstream diminishing returns and keep deductions separate', () => {
  const entries = [10, 5, 2.5, 0].map((impact, index) => event({ id: `earned-${index}`, sourceEventId: `source-${index}`, impact }));
  entries.push(event({ id: 'deduction', sourceEventId: 'deduction', eventType: 'confirmed_spam', impact: -20 }));
  const before = structuredClone(entries);
  const activity = project(entries).qualificationActivity;
  assert.equal(activity.positiveImpact, 17.5);
  assert.equal(activity.negativeImpact, 20);
  assert.equal(activity.effectiveEvents, 5);
  assert.deepEqual(entries, before);
});

test('withheld, expired, reversed, old, and zero-impact activity does not invent rewards', () => {
  const entries = [
    event({ id: 'withheld', sourceEventId: 'withheld', status: 'withheld', impact: 0 }),
    event({ id: 'expired', sourceEventId: 'expired', status: 'expired' }),
    event({ id: 'zero', sourceEventId: 'zero', eventType: 'raw_reaction_received', impact: 0 }),
    event({ id: 'old', sourceEventId: 'old', occurredAt: '2026-08-01T00:00:00Z' }),
  ];
  const result = project(entries);
  assert.equal(result.qualificationActivity.positiveImpact, 0);
  assert.equal(result.qualificationActivity.withheldEvents, 1);
  assert.equal(result.qualificationActivity.expiredEvents, 1);
  assert.equal(result.qualificationActivity.effectiveEvents, 1);
  assert.equal(result.rewardLevel, null);
  assert.equal(project([]).qualificationActivity.positiveImpact, 0);
});

test('purchases, invented positive reactions, unsupported policies, and cross-user input fail closed', () => {
  assert.throws(() => project([event({ eventType: 'subscription_purchase', impact: 1000 })]), /event_invalid/);
  assert.throws(() => project([event({ eventType: 'raw_reaction_received', impact: 1000 })]), /impact_invalid/);
  assert.throws(() => project([event({ eventType: 'confirmed_spam', impact: 1000 })]), /impact_invalid/);
  assert.throws(() => project([event({ impact: -10 })]), /impact_invalid/);
  assert.throws(() => project([event({ impact: Infinity })]), /event_invalid/);
  assert.throws(() => project([event({ sourceEventId: '' })]), /event_invalid/);
  assert.throws(() => project([event({ policyVersion: 'unreviewed-monthly-targets' })]), /policy_unsupported/);
  assert.throws(() => project([event({ subjectUserId: 'another-member' })]), /subject_mismatch/);
  assert.throws(() => projectMonthlyReputationActivity([], '', AS_OF, 'UTC'), /subject_required/);
  assert.throws(() => project([event({ reversalReference: 'unlinked-original' })]), /reversal_invalid/);
});
