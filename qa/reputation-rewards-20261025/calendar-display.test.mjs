import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMonthlyReputation, nextReputationMonth, MONTHLY_REPUTATION_POLICY_VERSION as policy } from '../../packages/contracts/src/monthly-reputation-policy.ts';
import { proposedClosingSundayWeek, proposedClosingSundayWeeks } from '../../packages/contracts/src/monthly-reputation-decisions.ts';
import { calculateProposedWeeklyEarning, PROPOSED_HUMAN_CONTRIBUTION_RULES as rules } from '../../packages/contracts/src/monthly-earning-policy.ts';
import { projectMonthlyRewards } from '../../apps/lythaus-public-api/src/monthly-reputation-projection.ts';
import { requireUnchanged } from './pinned-source.mjs';

for (const path of ['packages/contracts/src/monthly-reputation-policy.ts', 'packages/contracts/src/monthly-reputation-decisions.ts',
  'packages/contracts/src/monthly-earning-policy.ts', 'apps/lythaus-public-api/src/monthly-reputation-projection.ts']) requireUnchanged(path);
const id = n => `019a0000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const weeks = proposedClosingSundayWeeks('2026-08').map((week, i) => ({ ...week, weekId: id(i + 1), revision: 1,
  lockedAt: '2026-09-03T00:00:00.000Z', state: 'locked', points: [500, 2500, 1000, 2000, 1500][i] }));
const input = { policyVersion: policy, sourceMonth: '2026-08', sourceCutoff: '2026-09-01T00:00:00.000Z',
  periodPolicyVersion: 'closing-sunday-utc-proposal-v1', weeks, monthlyPoints: 0, quarterlyPoints: 0 };
const calculate = overrides => calculateMonthlyReputation({ ...input, ...overrides }, '2026-09-04T00:00:00.000Z');
test('C01 best four of five weeks are selected deterministically under input rotations', () => {
  const result = calculate({}); assert.equal(result.weeklyPoints, 7000);
  assert.deepEqual(result.selectedWeekIds, [id(2), id(4), id(5), id(3)]);
  for (let i = 0; i < 5; i++) assert.deepEqual(calculate({ weeks: [...weeks.slice(i), ...weeks.slice(0, i)] }), result);
});
test('C02 tied weeks use earliest closing time consistently', () => {
  const tied = weeks.map(week => ({ ...week, points: 1000 }));
  assert.deepEqual(calculate({ weeks: tied.toReversed() }).selectedWeekIds, tied.slice(0, 4).map(week => week.weekId));
});
test('C03 a week spanning months belongs only to its closing-Sunday month', () => {
  const week = proposedClosingSundayWeek('2026-08-31T00:00:00.000Z');
  assert.equal(week.ownerMonth, '2026-09'); assert.equal(week.endsAt, '2026-09-07T00:00:00.000Z');
  assert.equal(proposedClosingSundayWeeks('2026-08').some(w => w.startsAt === week.startsAt), false);
});
test('C04 each week has one owner across 28/29/30/31-day and year-end calendars', () => {
  for (const month of ['2027-02', '2028-02', '2026-11', '2026-10', '2026-12']) {
    const selected = proposedClosingSundayWeeks(month);
    assert.ok(selected.length === 4 || selected.length === 5);
    for (const week of selected) {
      assert.equal(week.ownerMonth, month);
      assert.equal(Date.parse(week.endsAt) - Date.parse(week.startsAt), 7 * 86400000);
    }
    const following = new Set(proposedClosingSundayWeeks(nextReputationMonth(month)).map(w => w.startsAt));
    assert.ok(selected.every(w => !following.has(w.startsAt)));
  }
  assert.equal(nextReputationMonth('2026-12'), '2027-01');
});
test('C05 duplicate identifiers and overlapping windows are rejected instead of counted twice', () => {
  assert.throws(() => calculate({ weeks: [weeks[0], weeks[0]] }), /duplicate_week/);
  assert.throws(() => calculate({ weeks: [weeks[0], { ...weeks[0], weekId: id(90) }] }), /overlapping_weeks/);
});
test('C06 month closes exactly at cutoff; weekly settlement opens at its exact candidate boundary', () => {
  const closed = { ...input, weeks: weeks.map(w => ({ ...w, lockedAt: '2026-09-01T00:00:00.000Z' })) };
  assert.throws(() => calculateMonthlyReputation(closed, '2026-08-31T23:59:59.999Z'), /source_not_closed/);
  assert.equal(calculateMonthlyReputation(closed, '2026-09-01T00:00:00.000Z').weeklyPoints, 7000);
  const weekly = evaluatedAt => calculateProposedWeeklyEarning({ subjectUserId: 'synthetic', rules,
    startsAt: '2026-08-03T00:00:00.000Z', evaluatedAt, contributions: [], reception: [] });
  assert.equal(weekly('2026-08-09T23:59:59.999Z').state, 'open');
  assert.equal(weekly('2026-08-10T00:00:00.000Z').state, 'settling');
  assert.equal(weekly('2026-08-12T23:59:59.999Z').state, 'settling');
  assert.equal(weekly('2026-08-13T00:00:00.000Z').state, 'locked');
});
test('C07 UTC representation and source-month ownership are explicit input contracts', () => {
  assert.throws(() => calculate({ sourceCutoff: '2026-09-01T02:00:00.000+02:00' }), /timestamp_invalid/);
  assert.throws(() => calculate({ weeks: [{ ...weeks[0], ownerMonth: '2026-07' }] }), /owner_mismatch/);
});
test('C08 correction changes best-four selection without duplicating the week', () => {
  const changed = weeks.map((w, i) => i ? w : { ...w, revision: 2, state: 'corrected', points: 2500 });
  const result = calculate({ weeks: changed });
  assert.equal(result.weeklyPoints, 8500); assert.equal(new Set(result.selectedWeekIds).size, 4);
  assert.ok(result.selectedWeekIds.includes(id(1))); assert.ok(!result.selectedWeekIds.includes(id(3)));
});

const snapshot = { state: 'confirmed', reasonCode: 'source_month_assessed', effectiveMonth: '2026-09',
  sourceMonth: '2026-08', sourceScore: 7000, level: 4, policyVersion: policy, snapshotId: 'synthetic-snapshot',
  sourceRevision: 1, revision: 1 };
test('D01 an unassessed default remains pending without a confirmed score', () => {
  const result = projectMonthlyRewards({ ...snapshot, state: 'pending', level: 1, levelKind: 'unassessed_default',
    sourceMonth: null, sourceScore: null }, { state: 'ready' });
  assert.equal(result.state, 'pending'); assert.equal(result.currentLevel, null); assert.equal(result.sourceScore, null);
});
test('D02 a shadow calculation is inspectable but never confirmed', () => {
  const result = projectMonthlyRewards({ ...snapshot, state: 'shadow' }, { state: 'ready' });
  assert.equal(result.state, 'pending'); assert.equal(result.currentLevel, null);
  assert.equal(result.snapshot.sourceScore, 7000);
});
test('D03 confirmed level and pending reward selection remain separate', () => {
  const result = projectMonthlyRewards(snapshot, { state: 'pending', reasonCode: 'selection_required' });
  assert.equal(result.currentLevel, 4); assert.equal(result.state, 'pending'); assert.equal(result.reasonCode, 'selection_required');
  assert.equal(projectMonthlyRewards(snapshot, { state: 'ready' }).state, 'ready');
});
test('D04 proposal/preparation values do not become entitlements', () => {
  const result = projectMonthlyRewards({ ...snapshot, preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0 }, { state: 'ready' });
  assert.equal(result.currentLevel, null); assert.equal(result.sourceScore, null); assert.equal(result.state, 'pending');
});
test('D05 a later pending/unavailable projection retains no prior confirmed values', () => {
  assert.equal(projectMonthlyRewards(snapshot, { state: 'ready' }).currentLevel, 4);
  for (const state of ['pending', 'unavailable']) {
    const result = projectMonthlyRewards({ ...snapshot, state, reasonCode: 'settlement_pending' }, { state: 'ready' });
    assert.equal(result.currentLevel, null); assert.equal(result.sourceMonth, null); assert.equal(result.sourceScore, null);
  }
});
