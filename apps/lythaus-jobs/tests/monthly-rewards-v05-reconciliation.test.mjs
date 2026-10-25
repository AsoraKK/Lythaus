import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

let records, attempts, assembled, calls, failure, legacy, tick;
const reset = () => { records = []; attempts = new Map(); assembled = []; calls = []; failure = undefined; legacy = false; tick = 0; };
reset();
mock.module('@lythaus/db', { namedExports: {
  query: async () => ({ rows: legacy ? [{ subject_user_id: 'legacy', source_month: '2026-08' }] : [] }),
  transaction: async (_binding, work) => {
    const client = { writes: [], id: ++tick };
    const result = await work(client);
    for (const row of client.writes) attempts.set(row.subject, row);
    return result;
  },
} });
mock.module('@lythaus/observability', { namedExports: { logEvent: value => calls.push(value) } });
mock.module('../../../packages/db/src/monthly-rewards-v05.ts', { namedExports: {
  monthlyRewardsV05Configuration: async () => {
    if (failure === 'configuration') throw new Error('private configuration detail');
    return { firstSourceMonth: '2026-08', version: 'candidate' };
  },
  rewardsV05ReconciliationCandidates: async () => {
    if (failure === 'query') throw new Error('private database detail');
    return [...records].sort((a, b) => (attempts.get(a.subject_user_id)?.at ?? 0) - (attempts.get(b.subject_user_id)?.at ?? 0)
      || a.subject_user_id.localeCompare(b.subject_user_id)).slice(0, 50);
  },
  recordRewardsV05ReconciliationAttempt: async (client, input) => {
    if (failure === 'attempt') throw new Error('private attempt detail');
    client.writes.push({ subject: input.subjectUserId, at: client.id }); return true;
  },
} });
mock.module('../../../packages/db/src/monthly-assembly.ts', { namedExports: {
  assembleProspectiveMonthlyRewards: async (client, input) => {
    const recorded = attempts.get(input.subjectUserId);
    assert.ok(recorded, 'attempt must already be committed');
    assert.notEqual(recorded.at, client.id, 'assembly must have its own transaction');
    assembled.push(input.subjectUserId);
    const row = records.find(row => row.subject_user_id === input.subjectUserId);
    if (row.outcome === 'failure') throw new Error('monthly_rewards_v05_week_policy_mismatch');
    if (row.outcome === 'interrupted') throw new Error('interrupted');
    return row.outcome === 'null' ? null : { created: true };
  },
  assembleMonthlyReputation: async () => ({ created: true }),
} });
mock.module('../../../packages/db/src/monthly-earning.ts', { namedExports: {
  loadMonthlyEarningConfiguration: async () => ({ collectFrom: '2026-08-01', rules: {} }),
} });
mock.module('../../../packages/db/src/monthly-maintenance.ts', { namedExports: {
  loadMonthlyMaintenanceConfiguration: async () => ({ collectFrom: '2026-08-01', rules: { monthSettlementHours: 72 } }),
} });
const { reconcileMonthlyAssembly } = await import('../src/monthly-assembly.ts');
const env = { DB_JOBS_FRESH: {}, MONTHLY_REWARDS_V05_RULES: 'candidate' };
test('more than 50 null and failed pairs cannot starve later eligible accounts', async () => {
  reset();
  records = Array.from({ length: 61 }, (_, index) => ({ subject_user_id: String(index).padStart(3, '0'), source_month: '2026-08',
    outcome: index < 25 ? 'null' : index < 50 ? 'failure' : 'success' }));
  assert.deepEqual(await reconcileMonthlyAssembly(env), { processed: 0 });
  assert.equal(attempts.size, 50); assert.equal(assembled.length, 50);
  assert.deepEqual(await reconcileMonthlyAssembly(env), { processed: 11 });
  assert.equal(attempts.size, 61); assert.equal(assembled.length, 100);
  assert.ok(calls.every(value => !JSON.stringify(value).includes('private')));
});
test('interruption after the committed attempt preserves retry progress without manufacturing a candidate', async () => {
  reset(); records = [{ subject_user_id: 'owner', source_month: '2026-08', outcome: 'interrupted' }];
  assert.deepEqual(await reconcileMonthlyAssembly(env), { processed: 0 });
  const first = attempts.get('owner').at;
  records[0].outcome = 'success';
  assert.deepEqual(await reconcileMonthlyAssembly(env), { processed: 1 });
  assert.ok(attempts.get('owner').at > first);
});
test('optional configuration, list and attempt failures do not block legacy monthly work', async () => {
  for (const phase of ['configuration', 'query', 'attempt']) {
    reset(); legacy = true; failure = phase;
    records = [{ subject_user_id: 'owner', source_month: '2026-08' }];
    assert.deepEqual(await reconcileMonthlyAssembly({ ...env, MONTHLY_REPUTATION_SHADOW_RULES: 'weekly',
      MONTHLY_REPUTATION_MAINTENANCE_RULES: 'maintenance' }), { processed: 1 });
    assert.equal(assembled.length, 0);
    assert.ok(calls.every(value => !JSON.stringify(value).includes('private')));
  }
});
