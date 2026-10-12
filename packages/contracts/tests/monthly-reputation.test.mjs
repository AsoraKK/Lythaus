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
import {
  SUGGESTION_CALENDAR_AMENDMENT_VERSION, SUGGESTION_CALENDAR_APPROVED_AT, SUGGESTION_PREVIEW_CONFIGURATION,
  previewUtcSuggestionWindow, previewSuggestionQualification,
} from '../src/monthly-suggestion-policy.ts';
import {
  QUARTERLY_CALENDAR_AMENDMENT_VERSION, QUARTERLY_CALENDAR_APPROVED_AT, QUARTERLY_PREVIEW_CONFIGURATION,
  QUARTERLY_ALLOCATION_GATE, quarterlyPreviewReady, previewUtcQuarterlyWindow,
  previewQuarterlyCompletion, previewQuarterlyEmailQualification,
} from '../src/monthly-quarterly-policy.ts';
import {
  PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
  PROSPECTIVE_REPUTATION_ALLOCATION_VERSION, PROSPECTIVE_REPUTATION_ALLOCATION_APPROVED_AT,
  PROSPECTIVE_REPUTATION_REPORT_LIMITS, PROSPECTIVE_REPUTATION_BANDS, PROSPECTIVE_REPUTATION_CONFIGURATION,
  prospectiveReputationLevelForScore, previewProspectiveMonthlyReputation,
} from '../src/monthly-reputation-prospective.ts';

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

test('F01: confirmed suggestion value stays outside scoring until budget placement is approved', () => {
  const amendment = JSON.parse(readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v1.json', import.meta.url)));
  assert.equal(amendment.base_policy_version, MONTHLY_REPUTATION_POLICY_VERSION);
  assert.equal(amendment.base_catalogue_sha256, MONTHLY_REPUTATION_CATALOGUE_HASH);
  assert.equal(amendment.confirmed.points_per_accepted_suggestion, 150);
  assert.equal(amendment.confirmed.maximum_awarded_suggestions_per_quarter, 1);
  assert.equal(amendment.confirmed.cadence, 'quarterly');
  assert.equal(amendment.confirmed.participation_required, false);
  assert.equal(amendment.confirmed.submission_earns_points, false);
  assert.equal(amendment.runtime_activation_allowed, false);
  assert.equal(amendment.unresolved.cap_group, null);
  assert.equal(amendment.unresolved.source_month_assignment, null);
  assert.equal(amendment.integration.runtime_action_id, null);
  assert.deepEqual(MONTHLY_REPUTATION_ACTIVATION.pendingAmendments, ['F01']);
  const extraFields = { quarterlySuggestionPoints: amendment.confirmed.points_per_accepted_suggestion };
  const empty = calculateMonthlyReputation({ ...monthlyInput([]), monthlyPoints: 0, quarterlyPoints: 0, ...extraFields }, now);
  assert.equal(empty.sourceScore, 0);
  const maximum = calculateMonthlyReputation({ ...monthlyInput([2500, 2500, 2500, 2500]), monthlyPoints: 2500, ...extraFields }, now);
  assert.equal(maximum.sourceScore, amendment.constraints.source_month_maximum_unchanged);
  assert.equal(maximum.sourceScore, 13500);
  assert.equal(Object.hasOwn(maximum, 'quarterlySuggestionPoints'), false);
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

const suggestionConfiguration = { ...SUGGESTION_PREVIEW_CONFIGURATION, prospectiveFrom: '2027-01-01T00:00:00.000Z',
  rubricVersion: 'synthetic-rubric-v1', authorityVersion: 'synthetic-authority-v1' };
const suggestionRevision = (patch = {}) => ({
  eventId: id(101), contributionId: id(102), subjectUserId: id(103), reviewerUserId: id(104),
  privateEvidenceId: id(105), amendmentVersion: SUGGESTION_CALENDAR_AMENDMENT_VERSION,
  rubricVersion: suggestionConfiguration.rubricVersion, authorityVersion: suggestionConfiguration.authorityVersion,
  revision: 1, predecessorEventId: null, decision: 'accepted', performedAt: '2027-01-15T00:00:00.000Z',
  decidedAt: '2027-01-20T00:00:00.000Z', useful: true, independentlyReviewed: true,
  manipulationScreened: true, competingAward: 'none', ...patch,
});
const suggestionPreview = (revisions = [suggestionRevision()], patch = {}, evaluatedAt = '2030-01-01T00:00:00.000Z') =>
  previewSuggestionQualification({ subjectUserId: id(103), sourceMonth: '2027-01', revisions,
    configuration: suggestionConfiguration, ...patch }, evaluatedAt);
const suggestionReversal = (patch = {}) => suggestionRevision({ eventId: id(106), revision: 2,
  predecessorEventId: id(101), decision: 'reversed', decidedAt: '2027-02-15T00:00:00.000Z', ...patch });

test('F01-Q01: historical v2 records the earlier suggestion-only scope without rewriting v1', () => {
  const amendment = JSON.parse(readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v2.json', import.meta.url)));
  assert.equal(amendment.amendment_id, 'accepted-useful-suggestion-calendar-quarter-2026-10-07-v2');
  assert.ok(amendment.source_authority.includes('2026-10-07T18:15:47.000Z'));
  assert.equal(amendment.base_policy_version, MONTHLY_REPUTATION_POLICY_VERSION);
  assert.equal(amendment.base_catalogue_sha256, createHash('sha256').update(rawCatalogue).digest('hex'));
  assert.equal(amendment.previous_amendment_id, 'accepted-useful-suggestion-2026-10-02-v1');
  assert.deepEqual(amendment.confirmed.quarter_start_months, [1, 4, 7, 10]);
  assert.equal(amendment.confirmed.points_per_accepted_suggestion, 150);
  assert.equal(amendment.confirmed.maximum_awarded_suggestions_per_quarter, 1);
  assert.equal(amendment.constraints.source_month_maximum_unchanged, 13500);
  assert.equal(amendment.constraints.email_scoring_and_sensitive_action_proof_unchanged, true);
  assert.equal(amendment.runtime_activation_allowed, false);
  assert.equal(amendment.integration.consumer_wired, false);
  assert.equal(amendment.integration.applied_points, 0);
  for (const decision of ['cap_group', 'prospective_cutover', 'calendar_boundary_timezone',
    'acceptance_rubric', 'reviewer_authority', 'calendar_rule_application_to_email_scoring']) {
    assert.equal(amendment.unresolved[decision], null);
  }
});

test('F01-Q02: every Jan/Apr/Jul/Oct quarter projects only remaining source months and next-month levels', () => {
  for (const year of [2023, 2024, 2027]) for (const firstMonth of [1, 4, 7, 10]) {
    for (let offset = 0; offset < 3; offset += 1) {
      const completionMonth = `${year}-${String(firstMonth + offset).padStart(2, '0')}`;
      const window = previewUtcSuggestionWindow(`${completionMonth}-15T12:00:00.000Z`);
      assert.equal(window.calendarBasis, 'UTC-preview');
      assert.equal(window.quarterStartsAt, `${year}-${String(firstMonth).padStart(2, '0')}-01T00:00:00.000Z`);
      assert.equal(window.quarterEndsAt, `${nextReputationMonth(`${year}-${String(firstMonth + 2).padStart(2, '0')}`)}-01T00:00:00.000Z`);
      assert.equal(window.sourceMonths.length, 3 - offset);
      assert.equal(window.sourceMonths[0].sourceMonth, completionMonth);
      for (const projection of window.sourceMonths) assert.equal(projection.effectiveMonth, nextReputationMonth(projection.sourceMonth));
      assert.ok(Object.isFrozen(window.sourceMonths[0]));
    }
  }
  assert.equal(previewUtcSuggestionWindow('2024-02-29T23:59:59.999Z').sourceMonths.length, 2);
  assert.equal(previewUtcSuggestionWindow('2027-03-31T23:59:59.999Z').sourceMonths.length, 1);
  assert.equal(previewUtcSuggestionWindow('2027-04-01T00:00:00.000Z').sourceMonths.length, 3);
  assert.equal(previewUtcSuggestionWindow('2027-12-31T23:59:59.999Z').sourceMonths[0].effectiveMonth, '2028-01');
  for (const bad of ['2027-02-29T00:00:00.000Z', '2027-01-01', '9999-12-01T00:00:00.000Z']) {
    assert.throws(() => previewUtcSuggestionWindow(bad));
  }
});

test('F01-Q03: late acceptance owns its completion month; expiry never withdraws the prior fixed snapshot', () => {
  const accepted = suggestionRevision({ performedAt: '2026-12-20T00:00:00.000Z', decidedAt: '2027-02-28T23:59:59.999Z' });
  for (const [month, qualifies] of [['2026-12', false], ['2027-01', false], ['2027-02', true], ['2027-03', true], ['2027-04', false]]) {
    const before = suggestionPreview([accepted], { sourceMonth: month });
    assert.equal(before.qualifies, qualifies);
    assert.equal(before.effectiveMonth, nextReputationMonth(month));
    assert.equal(before.appliedPoints, 0);
    assert.equal(before.runtimeActivationAllowed, false);
    assert.deepEqual(suggestionPreview([accepted], { sourceMonth: month }, '2031-01-01T00:00:00.000Z'), before);
  }
  const atBoundary = suggestionRevision({ decidedAt: '2027-04-01T00:00:00.000Z' });
  assert.equal(suggestionPreview([atBoundary], { sourceMonth: '2027-03' }).qualifies, false);
  assert.equal(suggestionPreview([atBoundary], { sourceMonth: '2027-04' }).qualifies, true);
  const frozenSnapshot = calculateMonthlyReputation(monthlyInput([], '2027-03'), '2027-04-01T00:00:00.000Z');
  assert.deepEqual(calculateMonthlyReputation(monthlyInput([], '2027-03'), '2027-08-01T00:00:00.000Z'), frozenSnapshot);
  assert.equal(frozenSnapshot.effectiveMonth, '2027-04');
});

test('F01-Q04: explicit preview configuration is prospective; default and scoring activation fail closed', () => {
  assert.equal(suggestionPreview([], { configuration: SUGGESTION_PREVIEW_CONFIGURATION }).reason, 'configuration_pending');
  assert.equal(suggestionPreview([], {}, '2026-12-31T23:59:59.999Z').reason, 'configuration_pending');
  for (const patch of [{ rubricVersion: '' }, { authorityVersion: null }]) {
    assert.equal(suggestionPreview([], { configuration: { ...suggestionConfiguration, ...patch } }).reason, 'configuration_pending');
  }
  for (const patch of [{ runtimeActivationAllowed: true }, { policyVersion: 'other' }, { catalogueHash: 'other' },
    { amendmentVersion: 'other' }, { prospectiveFrom: '2026-10-07T18:15:46.999Z' }]) {
    assert.throws(() => suggestionPreview([], { configuration: { ...suggestionConfiguration, ...patch } }));
  }
  const beforeCutover = suggestionRevision({ performedAt: SUGGESTION_CALENDAR_APPROVED_AT, decidedAt: SUGGESTION_CALENDAR_APPROVED_AT });
  assert.equal(suggestionPreview([beforeCutover]).qualifies, false);
  assert.equal(suggestionPreview([]).reason, 'no_accepted_evidence');
  assert.throws(() => suggestionPreview(null));
});

test('F01-Q05: retry/reordering are idempotent; concurrent choices and correction timing remain pending', () => {
  const accepted = suggestionRevision();
  const frozen = JSON.stringify(accepted);
  const reorderedKeys = Object.fromEntries(Object.entries(accepted).reverse());
  assert.deepEqual(suggestionPreview([accepted, reorderedKeys, accepted]), suggestionPreview([accepted]));
  assert.equal(JSON.stringify(accepted), frozen);
  const reversed = suggestionReversal();
  assert.deepEqual(suggestionPreview([reversed, accepted]), suggestionPreview([accepted, reversed, accepted]));
  assert.equal(suggestionPreview([accepted, reversed]).reason, 'correction_timing_pending');
  assert.equal(suggestionPreview([accepted, reversed], { sourceMonth: '2027-02' }).reason, 'reversed');
  assert.equal(suggestionPreview([reversed]).reason, 'evidence_pending');
  assert.equal(suggestionPreview([accepted, { ...reversed, revision: 3 }]).reason, 'evidence_pending');
  assert.equal(suggestionPreview([accepted, { ...reversed, predecessorEventId: id(999) }]).reason, 'evidence_pending');
  const another = suggestionRevision({ eventId: id(107), contributionId: id(108) });
  const concurrent = suggestionPreview([accepted, another]);
  assert.equal(concurrent.reason, 'concurrent_selection_pending');
  assert.equal(concurrent.qualifies, false);
  assert.equal(concurrent.appliedPoints, 0);
  assert.deepEqual(suggestionPreview([another, accepted]), concurrent);
  assert.equal(suggestionPreview([accepted, reversed, another], { sourceMonth: '2027-02' }).reason, 'concurrent_selection_pending');
  const incomplete = suggestionReversal({ eventId: id(109), contributionId: id(110) });
  assert.deepEqual(suggestionPreview([incomplete, accepted, reversed]), suggestionPreview([reversed, accepted, incomplete]));
  assert.throws(() => suggestionPreview([accepted, { ...accepted, decidedAt: '2027-01-21T00:00:00.000Z' }]), /event_conflict/);
  assert.throws(() => suggestionPreview([accepted, { ...accepted, eventId: id(111) }]), /revision_conflict/);
});

test('F01-Q06: a new quarter needs new qualified work; reaccepting old work cannot reset the quarter', () => {
  const accepted = suggestionRevision();
  const reversal = suggestionReversal();
  const reaccepted = suggestionRevision({ eventId: id(112), revision: 3, predecessorEventId: reversal.eventId,
    decidedAt: '2027-03-01T00:00:00.000Z' });
  assert.equal(suggestionPreview([reaccepted, accepted, reversal], { sourceMonth: '2027-03' }).reason, 'correction_timing_pending');
  assert.equal(suggestionPreview([accepted, reversal, { ...reaccepted, decidedAt: '2027-04-01T00:00:00.000Z' }],
    { sourceMonth: '2027-04' }).qualifies, false);
  const newWork = suggestionRevision({ eventId: id(113), contributionId: id(114), performedAt: '2027-04-01T00:00:00.000Z',
    decidedAt: '2027-04-02T00:00:00.000Z' });
  assert.equal(suggestionPreview([accepted, newWork], { sourceMonth: '2027-04' }).qualifies, true);
});

test('F01-Q07: wrong subjects, self review, client points, malformed and causally impossible evidence are rejected', () => {
  for (const patch of [{ subjectUserId: id(999) }, { reviewerUserId: id(103) }, { eventId: 'bad' },
    { predecessorEventId: 'bad' }, { amendmentVersion: 'v1' }, { rubricVersion: 'other' }, { authorityVersion: 'other' },
    { revision: 0 }, { revision: 1.5 }, { decision: 'closed' }, { useful: 'true' }, { competingAward: 'invented' },
    { decidedAt: '2031-01-01T00:00:00.000Z' }, { performedAt: '2027-01-21T00:00:00.000Z' },
    { points: 150 }, { ticketBody: 'private text' }]) {
    assert.throws(() => suggestionPreview([suggestionRevision(patch)]), JSON.stringify(patch));
  }
  assert.throws(() => suggestionPreview([null]));
  assert.throws(() => suggestionPreview([suggestionRevision(), suggestionReversal({ performedAt: '2027-01-16T00:00:00.000Z' })]), /causality/);
  assert.throws(() => suggestionPreview([suggestionRevision(), suggestionReversal({ decidedAt: '2027-01-19T00:00:00.000Z' })]), /causality/);
  assert.throws(() => suggestionPreview([], { subjectUserId: 'bad' }));
  for (const patch of [{ useful: false }, { independentlyReviewed: false }, { manipulationScreened: false },
    { competingAward: 'weekly.accepted_help' }, { competingAward: 'weekly.accepted_accessibility' }]) {
    assert.equal(suggestionPreview([suggestionRevision(patch)]).reason, 'evidence_pending');
  }
  assert.equal(Object.hasOwn(suggestionPreview(), 'privateEvidenceId'), false);
  assert.equal(Object.hasOwn(suggestionPreview(), 'reviewerUserId'), false);
  assert.equal(Object.hasOwn(suggestionPreview(), 'contributionId'), false);
});

const quarterlyConfiguration = { ...QUARTERLY_PREVIEW_CONFIGURATION, prospectiveFrom: '2027-01-01T00:00:00.000Z' };
const quarterlyCompletion = (completedAt, sourceMonth, patch = {}, evaluatedAt = '2030-01-01T00:00:00.000Z') =>
  previewQuarterlyCompletion({ sourceMonth, completion: { completedAt, revokedAt: null }, configuration: quarterlyConfiguration, ...patch }, evaluatedAt);
const emailReceipt = (patch = {}) => ({ id: id(201), subjectUserId: id(103), performedAt: '2027-03-31T23:59:59.999Z',
  revokedAt: null, facts: { kind: 'email_control', emailVersion: id(202) }, ...patch });
const emailPreview = (evidence = [emailReceipt()], sourceMonth = '2027-03', patch = {}, evaluatedAt = '2030-01-01T00:00:00.000Z') =>
  previewQuarterlyEmailQualification({ subjectUserId: id(103), sourceMonth, evidence, configuration: quarterlyConfiguration, ...patch }, evaluatedAt);

test('QALL-01: v3 preserves its timing-only checkpoint; current allocation is confirmed but activation stays blocked', () => {
  const amendment = JSON.parse(readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Quarterly_Amendment_v3.json', import.meta.url)));
  assert.equal(amendment.amendment_id, QUARTERLY_CALENDAR_AMENDMENT_VERSION);
  assert.equal(SUGGESTION_CALENDAR_AMENDMENT_VERSION, QUARTERLY_CALENDAR_AMENDMENT_VERSION);
  assert.equal(SUGGESTION_CALENDAR_APPROVED_AT, QUARTERLY_CALENDAR_APPROVED_AT);
  assert.ok(amendment.source_authority.includes(QUARTERLY_CALENDAR_APPROVED_AT));
  assert.equal(amendment.confirmed.scope, 'every_quarterly_scoring_component');
  assert.deepEqual(amendment.confirmed.remaining_months_by_completion_position, [3, 2, 1]);
  assert.equal(amendment.constraints.old_proofs_and_reports_rewritten, false);
  assert.equal(amendment.constraints.security_proof_freshness_and_sensitive_action_authorization_unchanged, true);
  assert.equal(amendment.runtime_activation_allowed, false);
  assert.equal(amendment.integration.consumer_wired, false);
  assert.equal(amendment.unresolved.quarterly_allowance_allocation, null);
  assert.equal(amendment.incentive_assessment.proven_optimality, false);
  assert.equal(amendment.incentive_assessment.cap_change_approved, false);
  assert.equal(QUARTERLY_ALLOCATION_GATE.combinedNominalAllowance, 1150);
  assert.equal(QUARTERLY_ALLOCATION_GATE.unresolvedExcess, 0);
  assert.equal(QUARTERLY_ALLOCATION_GATE.approvedQuarterlyMaximum, 1150);
  assert.equal(QUARTERLY_ALLOCATION_GATE.approvedSourceMaximum, 13650);
  assert.equal(QUARTERLY_ALLOCATION_GATE.existingSourceMaximum, 13500);
  assert.throws(() => calculateMonthlyReputation({ ...monthlyInput(), quarterlyPoints: 1150 }, now), /quarterly/);
  assert.equal(calculateMonthlyReputation({ ...monthlyInput([2500, 2500, 2500, 2500]), monthlyPoints: 2500 }, now).sourceScore, 13500);
  assert.equal(suggestionPreview().appliedPoints, 0);
  assert.equal(emailPreview().appliedPoints, 0);
});

test('QALL-02: email and suggestion use one window for each completion position in every calendar quarter', () => {
  for (const year of [2027, 2028]) for (const first of [1, 4, 7, 10]) for (let position = 0; position < 3; position += 1) {
    const completedAt = `${year}-${String(first + position).padStart(2, '0')}-15T12:34:56.789Z`;
    const common = previewUtcQuarterlyWindow(completedAt);
    assert.deepEqual(previewUtcSuggestionWindow(completedAt), common);
    assert.equal(common.sourceMonths.length, 3 - position);
    for (const month of common.sourceMonths) {
      const completed = quarterlyCompletion(completedAt, month.sourceMonth);
      const email = emailPreview([emailReceipt({ performedAt: completedAt })], month.sourceMonth);
      const suggestion = suggestionPreview([suggestionRevision({ performedAt: completedAt, decidedAt: completedAt })],
        { sourceMonth: month.sourceMonth });
      assert.equal(completed.qualifies, true);
      assert.equal(email.qualifies, true);
      assert.equal(suggestion.qualifies, true);
      assert.equal(email.validUntil, common.quarterEndsAt);
      assert.equal(email.effectiveMonth, month.effectiveMonth);
      assert.equal(email.confirmedAllowance, 1000);
      assert.equal(email.appliedPoints, 0);
    }
    const nextQuarterMonth = common.quarterEndsAt.slice(0, 7);
    assert.equal(quarterlyCompletion(completedAt, nextQuarterMonth).reason, 'scoring_quarter_expired');
    assert.equal(emailPreview([emailReceipt({ performedAt: completedAt })], nextQuarterMonth).renewalRequired, true);
  }
  assert.equal(quarterlyCompletion('2028-02-29T23:59:59.999Z', '2028-02').validUntil, '2028-04-01T00:00:00.000Z');
  assert.equal(quarterlyCompletion('2027-03-31T23:59:59.999Z', '2027-03').qualifies, true);
  assert.equal(quarterlyCompletion('2027-04-01T00:00:00.000Z', '2027-03').reason, 'completed_after_source_cutoff');
  assert.equal(quarterlyCompletion('2027-04-01T00:00:00.000Z', '2027-04').qualifies, true);
});

test('QALL-03: a still-valid old email proof cannot qualify a new scoring quarter or earlier month', () => {
  const receipt = emailReceipt();
  const legacy = { subjectUserId: receipt.subjectUserId, emailVersion: receipt.facts.emailVersion,
    verifiedAt: receipt.performedAt, revokedAt: null };
  assert.equal(proposedQuarterlyEmailComponent({ subjectUserId: id(103), emailVersion: id(202),
    sourceCutoff: '2027-05-01T00:00:00.000Z', proof: legacy }).points, 1000);
  const newQuarter = emailPreview([receipt], '2027-04');
  assert.equal(newQuarter.qualifies, false);
  assert.equal(newQuarter.reason, 'scoring_quarter_expired');
  assert.equal(newQuarter.validUntil, '2027-04-01T00:00:00.000Z');
  assert.equal(newQuarter.renewalRequired, true);
  assert.equal(emailPreview([receipt], '2027-02').reason, 'completion_required');
  assert.equal(emailPreview([], '2027-04', { securityCredentialVerified: true, securityVerifiedAt: receipt.performedAt }).qualifies, false);
  const renewed = emailReceipt({ id: id(203), performedAt: '2027-05-15T00:00:00.000Z', facts: { kind: 'email_control', emailVersion: id(204) } });
  for (const [month, expected] of [['2027-04', false], ['2027-05', true], ['2027-06', true], ['2027-07', false]]) {
    assert.equal(emailPreview([renewed, receipt], month).qualifies, expected);
  }
  const previousSnapshot = emailPreview([receipt], '2027-03', {}, '2027-04-01T00:00:00.000Z');
  assert.equal(previousSnapshot.effectiveMonth, '2027-04');
  assert.deepEqual(emailPreview([renewed, receipt], '2027-03'), previousSnapshot);
  assert.deepEqual(legacy, { subjectUserId: id(103), emailVersion: id(202), verifiedAt: receipt.performedAt, revokedAt: null });
});

test('QALL-04: common scoring respects prospective cutover, closing cutoff and causal revocations', () => {
  assert.equal(quarterlyPreviewReady(QUARTERLY_PREVIEW_CONFIGURATION, now), false);
  assert.equal(quarterlyCompletion('2027-01-15T00:00:00.000Z', '2027-01', {}, '2027-01-20T00:00:00.000Z').reason, 'source_not_closed');
  assert.equal(suggestionPreview(undefined, {}, '2027-01-20T00:00:00.000Z').reason, 'source_not_closed');
  assert.equal(quarterlyCompletion('2027-01-15T00:00:00.000Z', '2027-01', {}, '2027-02-01T00:00:00.000Z').qualifies, true);
  assert.equal(quarterlyCompletion(QUARTERLY_CALENDAR_APPROVED_AT, '2026-10').reason, 'completion_before_cutover');
  assert.equal(quarterlyCompletion('2027-01-15T00:00:00.000Z', '2027-01', {
    completion: { completedAt: '2027-01-15T00:00:00.000Z', revokedAt: '2027-01-31T23:59:59.999Z' } }).reason, 'revoked_at_source_cutoff');
  assert.equal(quarterlyCompletion('2027-01-15T00:00:00.000Z', '2027-01', {
    completion: { completedAt: '2027-01-15T00:00:00.000Z', revokedAt: '2027-02-01T00:00:00.000Z' } }).qualifies, true);
  for (const patch of [{ runtimeActivationAllowed: true }, { policyVersion: 'old' }, { catalogueHash: 'wrong' },
    { amendmentVersion: 'accepted-useful-suggestion-calendar-quarter-2026-10-07-v2' },
    { prospectiveFrom: '2026-10-07T20:00:02.999Z' }]) {
    assert.throws(() => quarterlyPreviewReady({ ...quarterlyConfiguration, ...patch }, '2030-01-01T00:00:00.000Z'));
  }
  assert.throws(() => quarterlyPreviewReady(null, now));
  for (const completion of [{ completedAt: '2031-01-01T00:00:00.000Z', revokedAt: null },
    { completedAt: '2027-01-15T00:00:00.000Z', revokedAt: '2027-01-14T00:00:00.000Z' },
    { completedAt: '2027-01-15T00:00:00.000Z', revokedAt: '2031-01-01T00:00:00.000Z' }]) {
    assert.throws(() => quarterlyCompletion(completion.completedAt, '2027-01', { completion }), /causality/);
  }
  assert.equal(emailPreview([], '2027-01', { configuration: QUARTERLY_PREVIEW_CONFIGURATION }).reason, 'configuration_pending');
  assert.equal(emailPreview([emailReceipt({ performedAt: QUARTERLY_CALENDAR_APPROVED_AT })], '2027-01').renewalRequired, true);
});

test('QALL-05: private canonical receipt adapter dedupes retries, filters later completions and rejects forgery', () => {
  const receipt = emailReceipt();
  const renewal = emailReceipt({ id: id(203), performedAt: '2027-05-01T00:00:00.000Z', facts: { kind: 'email_control', emailVersion: id(204) } });
  const inputBefore = JSON.stringify([receipt, renewal]);
  assert.deepEqual(emailPreview([receipt, receipt]), emailPreview([receipt]));
  assert.deepEqual(emailPreview([receipt, renewal], '2027-03'), emailPreview([renewal, receipt], '2027-03'));
  assert.equal(JSON.stringify([receipt, renewal]), inputBefore);
  assert.equal(emailPreview([{ ...receipt, facts: { kind: 'policy_refresher', policyVersion: 'synthetic' } }]).reason, 'completion_required');
  for (const patch of [{ subjectUserId: id(999) }, { id: 'bad' }, { performedAt: '2031-01-01T00:00:00.000Z' },
    { revokedAt: '2027-03-01T00:00:00.000Z' }, { revokedAt: '2031-01-01T00:00:00.000Z' },
    { facts: { kind: 'email_control', emailVersion: 'bad' } },
    { facts: { kind: 'email_control', emailVersion: id(202), points: 1000 } }]) {
    assert.throws(() => emailPreview([emailReceipt(patch)]));
  }
  assert.throws(() => emailPreview([receipt, { ...receipt, performedAt: '2027-03-30T00:00:00.000Z' }]), /conflict/);
  assert.throws(() => emailPreview([null]));
  assert.throws(() => emailPreview(null));
  assert.throws(() => emailPreview([], '2027-01', { subjectUserId: 'bad' }));
  for (const privateKey of ['id', 'emailVersion', 'subjectUserId', 'emailBindingDigest', 'tokenHash']) assert.equal(Object.hasOwn(emailPreview(), privateKey), false);
});

const prospectiveConfiguration = { ...PROSPECTIVE_REPUTATION_CONFIGURATION, ...suggestionConfiguration, firstSourceMonth: '2027-01' };
const prospectivePreview = (sourceMonth = '2027-01', patch = {}, evaluatedAt = '2030-01-01T00:00:00.000Z') =>
  previewProspectiveMonthlyReputation({ subjectUserId: id(103), source: monthlyInput([2500, 2500, 2500, 2500], sourceMonth),
    emailEvidence: [emailReceipt({ performedAt: '2027-01-20T00:00:00.000Z' })], suggestionRevisions: [suggestionRevision()],
    configuration: prospectiveConfiguration, ...patch }, evaluatedAt);

test('V2-01: approved additive catalogue delta pins immutable v1 and extends only prospective maxima', () => {
  const bytes = readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Action_Catalogue_v3.json', import.meta.url));
  const delta = JSON.parse(bytes);
  const allocation = JSON.parse(readFileSync(new URL('../policies/Lythaus_Monthly_Rewards_Allocation_Amendment_v4.json', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), PROSPECTIVE_REPUTATION_CATALOGUE_HASH);
  assert.equal(delta.inherited_catalogue_sha256, MONTHLY_REPUTATION_CATALOGUE_HASH);
  assert.equal(delta.inherited_action_count, catalogue.actions.length);
  assert.equal(delta.total_action_count, 23);
  assert.equal(delta.additional_actions.length, 1);
  assert.equal(delta.additional_actions[0].id, 'quarterly.accepted_suggestion');
  assert.equal(delta.additional_actions[0].optional, true);
  assert.equal(delta.existing_action_awards_unchanged, true);
  assert.equal(delta.policy_version, PROSPECTIVE_REPUTATION_POLICY_VERSION);
  assert.equal(allocation.amendment_id, PROSPECTIVE_REPUTATION_ALLOCATION_VERSION);
  assert.ok(allocation.source_authority.includes(PROSPECTIVE_REPUTATION_ALLOCATION_APPROVED_AT));
  assert.equal(allocation.confirmed.quarterly_maximum, 1150);
  assert.equal(allocation.confirmed.source_month_maximum, 13650);
  assert.equal(allocation.runtime_activation_allowed, false);
  assert.equal(allocation.constraints.incentive_optimality_empirically_proven, false);
  assert.equal(delta.quarterly_cap_groups.reduce((sum, group) => sum + group.max_points, 0), 1150);
  assert.deepEqual(PROSPECTIVE_REPUTATION_BANDS, delta.levels.map(level => ({ level: level.level, minimum: level.min_points, maximum: level.max_points })));
  assert.deepEqual(PROSPECTIVE_REPUTATION_BANDS.slice(0, 4), MONTHLY_REPUTATION_BANDS.slice(0, 4));
  assert.equal(MONTHLY_REPUTATION_BANDS[4].maximum, 13500);
  assert.equal(PROSPECTIVE_REPUTATION_REPORT_LIMITS.maximumSourceMonth, delta.source_month_maximum);
});

test('V2-02: reuse whole-week selection and unchanged awards; max 13650 is a disabled versioned report preview', () => {
  const source = { ...monthlyInput([2500, 2500, 2500, 2500], '2027-01'), monthlyPoints: 2500 };
  const result = prospectivePreview('2027-01', { source });
  const calculation = result.proposedCalculation;
  assert.equal(result.policyVersion, PROSPECTIVE_REPUTATION_POLICY_VERSION);
  assert.equal(result.inheritedValidationPolicyVersion, MONTHLY_REPUTATION_POLICY_VERSION);
  assert.equal(result.mode, 'proposal_preview');
  assert.equal(result.appliedPoints, 0);
  assert.equal(result.runtimeActivationAllowed, false);
  assert.equal(calculation.weeklyPoints, 10000);
  assert.equal(calculation.monthlyPoints, 2500);
  assert.equal(calculation.emailPoints, 1000);
  assert.equal(calculation.suggestionPoints, 150);
  assert.equal(calculation.quarterlyPoints, 1150);
  assert.equal(calculation.sourceScore, 13650);
  assert.equal(calculation.level, 5);
  assert.equal(calculation.effectiveMonth, '2027-02');
  assert.equal(result.reportLimits.quarterlyMaximumPoints, 1150);
  assert.equal(result.reportLimits.maximumSourceMonth, 13650);
  assert.equal(calculateMonthlyReputation(source, '2030-01-01T00:00:00.000Z').sourceScore, 13500);
  assert.ok(Object.isFrozen(calculation));
  for (const plan of ['free', 'premium', 'black']) {
    assert.deepEqual(prospectivePreview('2027-01', { source: { ...source, plan, accountAgeDays: 0 } }), result);
  }
});

test('V2-03: quarterly recurrence once per eligible source month; optional feedback and new-quarter renewal do not stack', () => {
  for (const month of ['2027-01', '2027-02', '2027-03']) {
    const result = prospectivePreview(month);
    assert.equal(result.proposedCalculation.quarterlyPoints, 1150);
    assert.equal(result.proposedCalculation.effectiveMonth, nextReputationMonth(month));
  }
  const expired = prospectivePreview('2027-04');
  assert.equal(expired.proposedCalculation.quarterlyPoints, 0);
  assert.equal(expired.proposedCalculation.level, 5);
  assert.equal(prospectivePreview('2027-01', { suggestionRevisions: [] }).proposedCalculation.quarterlyPoints, 1000);
  assert.equal(prospectivePreview('2027-01', { emailEvidence: [] }).proposedCalculation.quarterlyPoints, 150);
  assert.equal(prospectivePreview('2027-01', { emailEvidence: [], suggestionRevisions: [] }).proposedCalculation.quarterlyPoints, 0);
  const retried = prospectivePreview('2027-01', { suggestionRevisions: [suggestionRevision(), suggestionRevision()] });
  assert.equal(retried.proposedCalculation.suggestionPoints, 150);
  const conflict = prospectivePreview('2027-01', { suggestionRevisions: [suggestionRevision(), suggestionRevision({ eventId: id(301), contributionId: id(302) })] });
  assert.equal(conflict.reason, 'quarterly_evidence_pending');
  assert.equal(conflict.proposedCalculation, null);
  const snapshot = prospectivePreview('2027-03', {}, '2027-04-01T00:00:00.000Z');
  assert.deepEqual(prospectivePreview('2027-03'), snapshot);
  const late = prospectivePreview('2027-02', { suggestionRevisions: [suggestionRevision({ decidedAt: '2027-03-01T00:00:00.000Z' })] });
  assert.equal(late.proposedCalculation.suggestionPoints, 0);
});

test('V2-04: inherited deterministic ties/correction reselection and causal reversal remain enforced', () => {
  const source = monthlyInput([2000, 2000, 2000, 2000, 2000], '2027-01');
  const result = prospectivePreview('2027-01', { source });
  assert.deepEqual(result.proposedCalculation.selectedWeekIds, [id(1), id(2), id(3), id(4)]);
  assert.deepEqual(prospectivePreview('2027-01', { source: { ...source, weeks: [...source.weeks].reverse() } }), result);
  const corrected = structuredClone(source); Object.assign(corrected.weeks[0], { revision: 2, points: 500, state: 'corrected' });
  assert.deepEqual(prospectivePreview('2027-01', { source: corrected }).proposedCalculation.selectedWeekIds, [id(2), id(3), id(4), id(5)]);
  assert.equal(result.proposedCalculation.weeks[0].points, 2000);
  const reversed = prospectivePreview('2027-02', { suggestionRevisions: [suggestionRevision(), suggestionReversal()] });
  assert.equal(reversed.proposedCalculation.suggestionPoints, 0);
  assert.equal(prospectivePreview('2027-01', { suggestionRevisions: [suggestionRevision(), suggestionReversal()] }).proposedCalculation, null);
  assert.throws(() => prospectivePreview('2027-01', { suggestionRevisions: [suggestionRevision(), suggestionReversal({ decidedAt: '2027-01-19T00:00:00.000Z' })] }), /causality/);
  assert.throws(() => prospectivePreview('2027-01', { emailEvidence: [emailReceipt({ subjectUserId: id(999) })] }), /scope/);
});

test('V2-05: default/unsupported/retroactive configuration cannot produce a scored or active snapshot', () => {
  assert.equal(prospectivePreview('2027-01', { configuration: PROSPECTIVE_REPUTATION_CONFIGURATION }).reason, 'configuration_pending');
  for (const patch of [{ prospectiveFrom: null }, { firstSourceMonth: null }, { rubricVersion: null }, { authorityVersion: null }]) {
    assert.equal(prospectivePreview('2027-01', { configuration: { ...prospectiveConfiguration, ...patch } }).proposedCalculation, null);
  }
  assert.equal(prospectivePreview('2026-12').reason, 'policy_not_effective_for_source_month');
  for (const patch of [{ runtimeActivationAllowed: true }, { scoringPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION },
    { scoringCatalogueHash: MONTHLY_REPUTATION_CATALOGUE_HASH }, { scoringAmendmentVersion: 'v3' },
    { prospectiveFrom: '2026-10-07T20:12:30.999Z' }, { firstSourceMonth: '2026-12' }, { firstSourceMonth: 'bad' }]) {
    assert.throws(() => prospectivePreview('2027-01', { configuration: { ...prospectiveConfiguration, ...patch } }));
  }
  assert.throws(() => prospectivePreview('2027-01', { configuration: null }));
  assert.throws(() => prospectivePreview('2027-01', { source: { ...monthlyInput([], '2027-01'), monthlyPoints: 2501 } }));
  assert.throws(() => prospectivePreview('2027-01', {}, '2027-01-31T23:59:59.999Z'), /not_closed/);
  assert.equal(prospectivePreview('2027-01', { configuration: { ...prospectiveConfiguration, prospectiveFrom: '2031-01-01T00:00:00.000Z', firstSourceMonth: '2031-01' } }).proposedCalculation, null);
});

test('V2-06: all prospective score thresholds hold through 13650; old validator still stops at 13500', () => {
  for (let score = 0; score <= 13650; score += 1) {
    assert.equal(prospectiveReputationLevelForScore(score), score < 1000 ? 1 : score < 3000 ? 2 : score < 6000 ? 3 : score < 10000 ? 4 : 5);
  }
  for (const score of [-1, 13651, 0.5, NaN, Infinity, '1000']) assert.throws(() => prospectiveReputationLevelForScore(score));
  assert.throws(() => reputationLevelForMonthlyScore(13501));
});
