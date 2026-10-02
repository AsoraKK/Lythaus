import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  calculateMonthlyReputation, MONTHLY_REPUTATION_BANDS, MONTHLY_REPUTATION_LIMITS,
  MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, nextReputationMonth, reputationLevelForMonthlyScore,
} from '../src/monthly-reputation-policy.ts';
import {
  MONTHLY_REPUTATION_ACTIVATION, proposedClosingSundayWeek, proposedClosingSundayWeeks,
  proposedQuarterlyEmailComponent, proposedQuarterlyEmailExpiry,
} from '../src/monthly-reputation-decisions.ts';

const rawCatalogue = readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Action_Catalogue_v2.json', import.meta.url));
const catalogue = JSON.parse(rawCatalogue);
const now = '2026-10-05T00:00:00.000Z';
const id = (index) => `01990000-0000-7000-8000-${String(index).padStart(12, '0')}`;

export function monthlyInput(totals = [2200, 1800, 2450, 900, 2000], sourceMonth = '2026-08') {
  return {
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    periodPolicyVersion: 'closing-sunday-utc-proposal-v1',
    sourceMonth,
    sourceCutoff: `${nextReputationMonth(sourceMonth)}-01T00:00:00.000Z`,
    weeks: proposedClosingSundayWeeks(sourceMonth).slice(0, totals.length).map((week, index) => ({
      weekId: id(index + 1), revision: 1, ownerMonth: week.ownerMonth,
      startsAt: week.startsAt, endsAt: week.endsAt, lockedAt: week.endsAt,
      state: 'locked', points: totals[index],
    })),
    monthlyPoints: 2250,
    quarterlyPoints: 1000,
  };
}

test('original catalogue has 22 unique actions and coherent shared caps; activation stays prohibited', () => {
  assert.equal(createHash('sha256').update(rawCatalogue).digest('hex'), MONTHLY_REPUTATION_CATALOGUE_HASH);
  assert.equal(catalogue.actions.length, 22);
  assert.equal(new Set(catalogue.actions.map(action => action.id)).size, 22);
  assert.equal(catalogue.policy_version, MONTHLY_REPUTATION_POLICY_VERSION);
  assert.equal(catalogue.runtime_activation_allowed, false);
  assert.equal(MONTHLY_REPUTATION_ACTIVATION.state, 'blocked');
  assert.equal(MONTHLY_REPUTATION_ACTIVATION.pendingDecisions.length, 13);
  for (const [cadence, expected] of [['weekly', 2500], ['monthly', 2500], ['quarterly', 1000]]) {
    const groups = catalogue[`${cadence}_cap_groups`];
    assert.equal(groups.reduce((sum, group) => sum + group.max_points, 0), expected);
    for (const action of catalogue.actions.filter(action => action.cadence === cadence)) {
      const group = groups.find(item => item.id === action.cap_group);
      assert.ok(group, action.id);
      assert.ok(action.max_points_before_shared_cap <= group.max_points, action.id);
      assert.equal(action.approval, 'agreed_budget_proposed_operational_rule');
    }
  }
  assert.deepEqual(MONTHLY_REPUTATION_BANDS, catalogue.levels.map(band => ({
    level: band.level, minimum: band.min_points, maximum: band.max_points,
  })));
  assert.equal(catalogue.score.maximum, MONTHLY_REPUTATION_LIMITS.sourceMonth);
  assert.equal(catalogue.score.carries_across_source_months, false);
  assert.equal(catalogue.score.level_age_gates, false);
  assert.equal(catalogue.reference_validation.application_tests_run, false);
});

for (const scenario of catalogue.reference_scenarios) {
  test(`CAL-10/11/13, PTS-20: owner fixture ${scenario.id}`, () => {
    const input = { ...monthlyInput(scenario.weekly_totals), monthlyPoints: scenario.monthly_points, quarterlyPoints: scenario.quarterly_points };
    const result = calculateMonthlyReputation(input, now);
    assert.equal(result.sourceScore, scenario.expected_source_score);
    assert.equal(result.level, scenario.expected_next_level);
    assert.equal(result.effectiveMonth, '2026-09');
    if (scenario.expected_selected_totals) {
      assert.deepEqual(result.selectedWeekIds.map(weekId => result.weeks.find(week => week.weekId === weekId).points), scenario.expected_selected_totals);
      assert.equal(result.weeklyPoints, scenario.expected_selected_weekly_points);
    }
  });
}

test('CAL-01/02/03/09: selects whole weeks, retains omitted results, never fills missing weeks or carries balances', () => {
  const input = monthlyInput();
  const frozenInput = JSON.stringify(input);
  const result = calculateMonthlyReputation(input, now);
  assert.equal(result.weeks.length, 5);
  assert.equal(result.weeks[3].selectionReason, 'not_selected_best_four');
  assert.equal(JSON.stringify(input), frozenInput);
  assert.ok(Object.isFrozen(result.weeks[0]));
  const partial = calculateMonthlyReputation({ ...monthlyInput([100]), monthlyPoints: 0, quarterlyPoints: 0, previousScore: 13500 }, now);
  assert.equal(partial.sourceScore, 100);
  assert.equal(partial.weeks.length, 1);
  const empty = calculateMonthlyReputation({ ...monthlyInput([]), monthlyPoints: 0, quarterlyPoints: 0 }, now);
  assert.equal(empty.sourceScore, 0);
  assert.equal(empty.level, 1);
  assert.deepEqual(empty.weeks, []);
});

test('CAL-04/05/06/07: all 480 months have four or five complete uniquely owned candidate weeks', () => {
  const seen = new Set();
  for (let year = 2000; year < 2040; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const sourceMonth = `${year}-${String(month).padStart(2, '0')}`;
      const weeks = proposedClosingSundayWeeks(sourceMonth);
      assert.ok([4, 5].includes(weeks.length));
      for (const week of weeks) {
        assert.equal(week.ownerMonth, sourceMonth);
        assert.equal(new Date(week.startsAt).getUTCDay(), 1);
        assert.equal(Date.parse(week.endsAt) - Date.parse(week.startsAt), 604800000);
        assert.equal(seen.has(week.startsAt), false);
        seen.add(week.startsAt);
        assert.deepEqual(proposedClosingSundayWeek(new Date(Date.parse(week.endsAt) - 1).toISOString()), week);
      }
    }
  }
  assert.deepEqual(proposedClosingSundayWeeks('2026-08').map(week => new Date(Date.parse(week.endsAt) - 1).getUTCDate()), [2, 9, 16, 23, 30]);
  assert.equal(proposedClosingSundayWeek('2026-08-31T00:00:00.000Z').ownerMonth, '2026-09');
  assert.equal(proposedClosingSundayWeek('2026-07-27T00:00:00.000Z').ownerMonth, '2026-08');
  assert.equal(nextReputationMonth('2026-12'), '2027-01');
});

test('CAL-08/18: ties are stable across input order and corrections reselect the entire set', () => {
  const input = monthlyInput([2000, 2000, 2000, 2000, 2000]);
  const result = calculateMonthlyReputation(input, now);
  assert.deepEqual(result.selectedWeekIds, [id(1), id(2), id(3), id(4)]);
  assert.deepEqual(calculateMonthlyReputation({ ...input, weeks: [...input.weeks].reverse() }, now), result);
  const corrected = structuredClone(input);
  Object.assign(corrected.weeks[0], { points: 500, revision: 2, state: 'corrected' });
  const updated = calculateMonthlyReputation(corrected, now);
  assert.equal(updated.weeks[0].selectionReason, 'not_selected_best_four');
  assert.equal(updated.weeks[4].selected, true);
  assert.equal(result.weeks[0].points, 2000);
});

test('CAL-13/14/15: all scores map exactly and no age, plan, World or pillar input affects them', () => {
  for (let score = 0; score <= 13500; score += 1) {
    const expected = score < 1000 ? 1 : score < 3000 ? 2 : score < 6000 ? 3 : score < 10000 ? 4 : 5;
    assert.equal(reputationLevelForMonthlyScore(score), expected);
  }
  for (const score of [-1, 13501, 0.5, NaN, Infinity, '1000', null]) assert.throws(() => reputationLevelForMonthlyScore(score));
  const input = monthlyInput([2500, 2500, 2500, 2500]);
  for (const tier of ['free', 'premium', 'black']) {
    assert.equal(calculateMonthlyReputation({ ...input, tier, accountAgeDays: 0, worldVerified: false, pillars: {} }, now).level, 5);
  }
});

test('CAL-13/19: rejects malformed, duplicate, partial, future or incorrectly assigned results', () => {
  const invalidInputs = [
    { policyVersion: 'reputation-v2.0.0' }, { sourceMonth: '2026-13' },
    { periodPolicyVersion: '' }, { sourceCutoff: '2026-09-02T00:00:00.000Z' },
    { monthlyPoints: 2501 }, { monthlyPoints: -1 }, { monthlyPoints: 0.1 },
    { quarterlyPoints: 500 }, { weeks: null }, { weeks: Array(6).fill(monthlyInput().weeks[0]) },
  ];
  for (const patch of invalidInputs) assert.throws(() => calculateMonthlyReputation({ ...monthlyInput(), ...patch }, now));
  for (const patch of [
    { weekId: '1' }, { revision: 0 }, { revision: 1.5 }, { ownerMonth: '2026-09' },
    { state: 'open' }, { points: 2501 }, { points: -1 }, { points: Infinity },
    { startsAt: '2026-07-28T00:00:00.000Z' }, { endsAt: '2026-07-26T00:00:00.000Z' },
    { lockedAt: '2026-07-26T00:00:00.000Z' }, { lockedAt: '2027-01-01T00:00:00.000Z' },
    { startsAt: '2026-02-30T00:00:00.000Z' }, { startsAt: '2026-07-27' },
  ]) {
    const input = monthlyInput();
    Object.assign(input.weeks[0], patch);
    assert.throws(() => calculateMonthlyReputation(input, now), JSON.stringify(patch));
  }
  const overlap = monthlyInput();
  overlap.weeks[1] = { ...overlap.weeks[0], weekId: id(10) };
  assert.throws(() => calculateMonthlyReputation(overlap, now), /overlapping/);
  const duplicate = monthlyInput();
  duplicate.weeks[1].weekId = duplicate.weeks[0].weekId;
  assert.throws(() => calculateMonthlyReputation(duplicate, now), /duplicate/);
  assert.throws(() => calculateMonthlyReputation(monthlyInput(), '2026-08-31T23:59:59.999Z'), /not_closed/);
  assert.throws(() => nextReputationMonth('9999-12'));
  const delayed = monthlyInput();
  delayed.weeks[0].lockedAt = '2026-10-01T00:00:00.000Z';
  assert.equal(calculateMonthlyReputation(delayed, now).weeks[0].ownerMonth, '2026-08');
});

test('CAL-16/17: proposed D08 uses calendar months and the instant immediately before cutoff', () => {
  for (const [from, to] of [
    ['2026-01-31T12:34:56.789Z', '2026-04-30T12:34:56.789Z'],
    ['2023-11-30T12:34:56.789Z', '2024-02-29T12:34:56.789Z'],
    ['2024-11-30T12:34:56.789Z', '2025-02-28T12:34:56.789Z'],
    ['2026-12-31T12:34:56.789Z', '2027-03-31T12:34:56.789Z'],
  ]) assert.equal(proposedQuarterlyEmailExpiry(from), to);
  const proof = { subjectUserId: id(7), emailVersion: id(8), verifiedAt: '2026-06-01T00:00:00.000Z', revokedAt: null };
  const input = { subjectUserId: id(7), emailVersion: id(8), sourceCutoff: '2026-09-01T00:00:00.000Z', proof };
  assert.equal(proposedQuarterlyEmailComponent(input).points, 1000);
  assert.equal(proposedQuarterlyEmailComponent({ ...input, sourceCutoff: '2026-09-01T00:00:00.001Z' }).reason, 'expired');
  assert.equal(proposedQuarterlyEmailComponent({ ...input, proof: { ...proof, verifiedAt: input.sourceCutoff } }).reason, 'verified_after_cutoff');
  assert.equal(proposedQuarterlyEmailComponent({ ...input, proof: null }).points, 0);
  assert.equal(proposedQuarterlyEmailComponent({ ...input, emailVersion: id(9) }).points, 0);
  assert.equal(proposedQuarterlyEmailComponent({ ...input, subjectUserId: id(10) }).points, 0);
  assert.equal(proposedQuarterlyEmailComponent({ ...input, proof: { ...proof, revokedAt: '2026-08-31T23:59:59.999Z' } }).reason, 'revoked');
  assert.equal(proposedQuarterlyEmailComponent({ ...input, proof: { ...proof, revokedAt: input.sourceCutoff } }).points, 1000);
});
