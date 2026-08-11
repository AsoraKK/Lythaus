import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AUTHENTICITY_FEATURE_FLAGS,
  DEFAULT_COST_CONTROL_CONFIG,
  AuthenticityCostController,
  InMemoryCostCounterStore,
  assertAuthenticityFeatureFlags,
  assertCostControlConfig,
} from '../src/cost-control.ts';

function request(period, overrides = {}) {
  return {
    period,
    operation: 'text-review',
    operationClass: 'essential',
    estimatedCostUsd: 1,
    ...overrides,
  };
}

test('cost admission is fail-closed at each budget threshold', async () => {
  const store = new InMemoryCostCounterStore();
  const controller = new AuthenticityCostController(store);

  const invalid = await controller.admit(request('invalid', { estimatedCostUsd: Number.NaN }));
  assert.equal(invalid.admitted, false);
  assert.equal(invalid.reason, 'INVALID_COST');
  assert.equal(Number.isNaN(invalid.projectedSpendUsd), true);

  await store.disable('disabled-store');
  assert.equal((await controller.admit(request('disabled-store'))).reason, 'EMERGENCY_DISABLED');
  assert.equal((await controller.admit(request('hard-stop', { estimatedCostUsd: 10 }))).reason, 'HARD_STOP');
  assert.equal((await controller.admit(request('deep-stop', { operation: 'deep image review', estimatedCostUsd: 9 }))).reason, 'DEEP_SCAN_STOP');
  assert.equal((await controller.admit(request('essential-only', { operationClass: 'optional', estimatedCostUsd: 8 }))).reason, 'ESSENTIAL_ONLY');
  assert.equal((await controller.admit(request('optional-stop', { operationClass: 'optional', estimatedCostUsd: 7 }))).reason, 'OPTIONAL_STOP');
  assert.equal((await controller.admit(request('experiment-stop', { operationClass: 'experiment', estimatedCostUsd: 5 }))).reason, 'EXPERIMENT_STOP');

  const admitted = await controller.admit(request('allowed'));
  assert.deepEqual(admitted, { admitted: true, projectedSpendUsd: 1, reason: 'ADMITTED' });
  await controller.settle('allowed', 1, 0.25);
  assert.deepEqual(await store.read('allowed'), {
    period: 'allowed',
    reservedUsd: 0,
    committedUsd: 0.25,
    emergencyDisabled: false,
  });
  await assert.rejects(controller.settle('allowed', -1, 0), /actual_cost_invalid/);
  await assert.rejects(controller.settle('allowed', 0, Number.NaN), /actual_cost_invalid/);
  await assert.rejects(controller.settle('allowed', 0, 11), /actual_cost_invalid/);
});

test('cost stores reject invalid reservations and preserve emergency disablement', async () => {
  const store = new InMemoryCostCounterStore();
  const original = await store.read('copy-check');
  original.committedUsd = 99;
  assert.equal((await store.read('copy-check')).committedUsd, 0);
  assert.equal(await store.reserve('reserve-check', Number.NaN), false);
  assert.equal(await store.reserve('reserve-check', -1), false);
  assert.equal(await store.reserve('reserve-check', 2, 2), false);
  assert.equal(await store.reserve('reserve-check', 1, 2), true);
  await store.commit('reserve-check', 5, 0.5);
  assert.deepEqual(await store.read('reserve-check'), {
    period: 'reserve-check',
    reservedUsd: 0,
    committedUsd: 0.5,
    emergencyDisabled: false,
  });
  await store.commit('implicit-commit', 1, 2);
  assert.equal((await store.read('implicit-commit')).committedUsd, 2);
  await store.disable('reserve-check');
  assert.equal(await store.reserve('reserve-check', 0.1), false);
});

test('policy configuration refuses unsafe budgets, enforcement, and unattended training', async () => {
  assert.throws(
    () => assertCostControlConfig({ ...DEFAULT_COST_CONTROL_CONFIG, monthlyLimitUsd: 11 }),
    /experimental_budget_exceeded/,
  );
  assert.throws(
    () => assertCostControlConfig({ ...DEFAULT_COST_CONTROL_CONFIG, warningUsd: 7 }),
    /cost_control_thresholds_invalid/,
  );
  assert.throws(
    () => assertAuthenticityFeatureFlags({ ...DEFAULT_AUTHENTICITY_FEATURE_FLAGS, authenticityEnforcementEnabled: true }),
    /authenticity_enforcement_flag_must_remain_disabled/,
  );
  assert.throws(
    () => assertAuthenticityFeatureFlags({ ...DEFAULT_AUTHENTICITY_FEATURE_FLAGS, unattendedEcoTrainEnabled: true }),
    /unattended_eco_train_flag_must_remain_disabled/,
  );

  const emergencyController = new AuthenticityCostController(
    new InMemoryCostCounterStore(),
    DEFAULT_COST_CONTROL_CONFIG,
    { ...DEFAULT_AUTHENTICITY_FEATURE_FLAGS, emergencyDisabled: true },
  );
  assert.equal((await emergencyController.admit(request('flag-disabled'))).reason, 'EMERGENCY_DISABLED');

  const refusingStore = {
    read: async (period) => ({ period, reservedUsd: 0, committedUsd: 0, emergencyDisabled: false }),
    reserve: async () => false,
    commit: async () => {},
    disable: async () => {},
  };
  const refusingController = new AuthenticityCostController(refusingStore);
  assert.equal((await refusingController.admit(request('reserve-refused'))).reason, 'HARD_STOP');
});
