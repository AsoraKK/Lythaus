import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMonthlyRewards } from '../src/monthly-reputation-projection.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy } from '../../../packages/contracts/src/monthly-reputation-policy.ts';

const selection = { state: 'pending', reasonCode: 'confirmed_month_unavailable', effectiveMonth: '2026-10' };
const assessed = { state: 'confirmed', reasonCode: 'source_month_assessed', effectiveMonth: '2026-10',
  sourceMonth: '2026-09', sourceScore: 11700, level: 5, policyVersion: policy, snapshotId: 'snapshot',
  sourceRevision: 1, revision: 1 };

test('unassessed default level remains pending without a confirmed score or source month', () => {
  const snapshot = { state: 'pending', reasonCode: 'no_previous_assessment', effectiveMonth: '2026-10',
    level: 1, levelKind: 'unassessed_default', sourceMonth: null, sourceScore: null, revision: 0, policyVersion: policy };
  const result = projectMonthlyRewards(snapshot, selection);
  assert.equal(result.state, 'pending');
  assert.equal(result.reasonCode, 'no_previous_assessment');
  assert.equal(result.currentLevel, null);
  assert.equal(result.sourceMonth, null);
  assert.equal(result.sourceScore, null);
  assert.equal(result.snapshot, snapshot);
});

test('shadow calculations remain inspectable without becoming current-month authority', () => {
  const snapshot = { ...assessed, state: 'shadow' };
  const original = structuredClone(snapshot);
  const result = projectMonthlyRewards(snapshot, { ...selection, state: 'ready' });
  assert.equal(result.state, 'pending');
  assert.equal(result.currentLevel, null);
  assert.equal(result.sourceMonth, null);
  assert.equal(result.sourceScore, null);
  assert.equal(result.snapshot.level, 5);
  assert.equal(result.snapshot.sourceScore, 11700);
  assert.deepEqual(snapshot, original);
});

test('confirmed level persists independently of pending paid-tier reward selection', () => {
  for (const tier of ['free', 'premium', 'black']) {
    const result = projectMonthlyRewards(assessed, { ...selection, tier, reasonCode: 'selection_required' });
    assert.equal(result.state, 'pending');
    assert.equal(result.reasonCode, 'selection_required');
    assert.equal(result.currentLevel, 5);
    assert.equal(result.sourceMonth, '2026-09');
    assert.equal(result.sourceScore, 11700);
    assert.equal(result.snapshot.policyVersion, policy);
  }
  assert.equal(projectMonthlyRewards(assessed, { ...selection, state: 'ready' }).state, 'ready');
});

test('preparation metadata cannot confer confirmed authority even with a numeric candidate', () => {
  const snapshot = { ...assessed, preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0 };
  const result = projectMonthlyRewards(snapshot, { ...selection, state: 'ready' });
  assert.equal(result.state, 'pending');
  assert.equal(result.currentLevel, null);
  assert.equal(result.sourceScore, null);
  assert.equal(result.snapshot.appliedPoints, 0);
});

test('future, unsettled, unavailable and policy-review states retain their server reason', () => {
  for (const [state, reasonCode] of [['pending', 'future_month_unconfirmed'], ['pending', 'settlement_pending'],
    ['unavailable', 'before_policy_cutover'], ['pending', 'snapshot_policy_requires_review']]) {
    const result = projectMonthlyRewards({ ...assessed, state, reasonCode }, selection);
    assert.equal(result.state, 'pending');
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(result.currentLevel, null);
    assert.equal(result.sourceScore, null);
  }
});

test('fresh account projections never retain another account confirmed fields', () => {
  const first = projectMonthlyRewards(assessed, { ...selection, state: 'ready' });
  const second = projectMonthlyRewards({ state: 'pending', reasonCode: 'no_previous_assessment', effectiveMonth: '2026-10',
    level: 1, levelKind: 'unassessed_default' }, selection);
  assert.equal(first.currentLevel, 5);
  assert.equal(second.currentLevel, null);
  assert.equal(second.sourceMonth, null);
  assert.equal(second.sourceScore, null);
  assert.equal(projectMonthlyRewards(assessed, { ...selection, state: 'ready' }).currentLevel, 5);
});
