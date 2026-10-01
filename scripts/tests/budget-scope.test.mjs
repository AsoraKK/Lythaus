import assert from 'node:assert/strict';
import test from 'node:test';
import { reserveBudgetInTransaction } from '../../packages/db/src/budget.ts';

const config = {
  limitUsd: 10,
  warningUsd: 7,
  optionalAnalysisUsd: 8,
  essentialOnlyUsd: 9,
  deepScanStopUsd: 9.5,
};

function client({ globalUsage = '0', globalReserved = '0', scopedUsage = '0', scopedReserved = '0', switches = [] } = {}) {
  const queries = [];
  return {
    queries,
    query: async (sql, values = []) => {
      queries.push({ sql, values });
      if (sql.includes('WHERE idempotency_key')) return { rows: [], rowCount: 0 };
      if (sql.includes('cost_kill_switches')) return { rows: switches.map((key) => ({ key })), rowCount: switches.length };
      if (sql.includes('cost_usage_events') && sql.includes('operation = ANY')) return { rows: [{ total: scopedUsage }], rowCount: 1 };
      if (sql.includes('cost_budget_reservations') && sql.includes('operation = ANY')) return { rows: [{ total: scopedReserved }], rowCount: 1 };
      if (sql.includes('cost_usage_events')) return { rows: [{ total: globalUsage }], rowCount: 1 };
      if (sql.includes('cost_budget_reservations')) return { rows: [{ total: globalReserved }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

function input(overrides = {}) {
  return {
    period: '2026-09',
    operation: 'authenticity_alpha_case',
    operationClass: 'experiment',
    estimatedCostUsd: 0.05,
    idempotencyKey: 'scope-test',
    provider: 'lythaus-authenticity-alpha',
    scope: {
      operationNames: ['authenticity_alpha_case', 'authenticity_beta_case', 'authenticity_alpha_advice'],
      limitUsd: 1.6,
    },
    config,
    ...overrides,
  };
}

test('shared alpha and legacy-beta commitments reject the exact scoped ceiling', async () => {
  const fake = client({ scopedReserved: '1.55' });
  const result = await reserveBudgetInTransaction(fake, input());
  assert.equal(result.status, 'rejected');
  assert.equal(result.projectedSpendUsd, 0.05);
  assert.deepEqual(fake.queries.find(({ sql }) => sql.includes('operation = ANY'))?.values[1], input().scope.operationNames);
});

test('measured scoped admission stays below the shared ceiling when global budget is available', async () => {
  const fake = client({ scopedReserved: '1.40' });
  const result = await reserveBudgetInTransaction(fake, input({ idempotencyKey: 'scope-accepted' }));
  assert.equal(result.status, 'reserved');
});

test('kill switches reject scoped optional work without treating it as free', async () => {
  const fake = client({ switches: ['provider:lythaus-authenticity-alpha'] });
  const result = await reserveBudgetInTransaction(fake, input({ idempotencyKey: 'scope-killed' }));
  assert.equal(result.status, 'rejected');
});
