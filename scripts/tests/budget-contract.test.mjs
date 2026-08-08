import assert from 'node:assert/strict';
import test from 'node:test';
import { isBudgetOperationAdmitted } from '../../packages/db/src/budget.ts';

const config = {
  limitUsd: 100,
  warningUsd: 70,
  optionalAnalysisUsd: 80,
  essentialOnlyUsd: 90,
  deepScanStopUsd: 95,
};

function decision(operation, operationClass, projectedSpendUsd) {
  return isBudgetOperationAdmitted({ operation, operationClass, config }, projectedSpendUsd);
}

test('budget thresholds degrade work in the documented order', () => {
  assert.equal(decision('model_experiment', 'experiment', 69.99), true);
  assert.equal(decision('model_experiment', 'experiment', 70), false);
  assert.equal(decision('semantic_analysis', 'optional', 79.99), true);
  assert.equal(decision('semantic_analysis', 'optional', 80), false);
  assert.equal(decision('moderation_text_scan', 'essential', 90), true);
  assert.equal(decision('semantic_analysis', 'optional', 90), false);
  assert.equal(decision('moderation_text_scan', 'essential', 94.99), true);
  assert.equal(decision('moderation_image_scan', 'essential', 95), false);
});

test('the simulated hard stop rejects paid work at exactly the limit', () => {
  assert.equal(decision('moderation_text_scan', 'essential', 99.99), true);
  assert.equal(decision('moderation_text_scan', 'essential', 100), false);
  assert.equal(decision('moderation_text_scan', 'essential', 100.01), false);
});

test('budget reservations use the six-state lifecycle', async () => {
  const source = await import('../../packages/db/src/budget.ts');
  assert.deepEqual(source.BUDGET_RESERVATION_STATUSES, ['reserved', 'committed', 'released', 'expired', 'rejected', 'reconciled']);
  assert.equal(typeof source.expireBudgetReservations, 'function');
  assert.equal(typeof source.reconcileBudgetReservation, 'function');
});
