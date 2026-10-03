import assert from 'node:assert/strict';
import test from 'node:test';
import { readMonthlyReputationReportsForPassport } from '../src/monthly-reputation-dsr.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';

const owner = '01900000-0000-7000-8000-000000000001';
const version = 'synthetic-rules';

function configuredClient({ installed = true, enabled = true, sourceRows = [] } = {}) {
  const calls = [];
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('to_regclass(')) return { rows: [{ available: installed }], rowCount: 1 };
    if (sql.includes('SELECT 1 FROM system.feature_flags')) return enabled
      ? { rows: [{}], rowCount: 1 }
      : { rows: [], rowCount: 0 };
    if (sql.includes('trust.lock_monthly_reward_configuration')) return {
      rows: [
        { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
        { enabled: true, policy_version: MONTHLY_REPUTATION_POLICY_VERSION },
      ], rowCount: 2,
    };
    if (sql.includes('FROM trust.monthly_reward_snapshot_rule_sets')) return {
      rows: [{ version, mode: 'shadow', first_source_month: new Date('2026-07-01T00:00:00.000Z'),
        weekly_rules_version: 'synthetic-weekly', maintenance_rules_version: 'synthetic-maintenance', decision_approvals: {} }],
      rowCount: 1,
    };
    if (sql.includes('FROM trust.monthly_reputation_sources')) return { rows: sourceRows, rowCount: sourceRows.length };
    assert.fail(`unexpected monthly DSR query: ${sql}`);
  } };
  return { client, calls };
}

test('Data Passport report adapter fails closed without snapshot approval and reads no monthly tables', async () => {
  const calls = [];
  const client = { async query(sql, values) { calls.push({ sql, values }); assert.fail('unconfigured Data Passport must not query monthly data'); } };
  assert.deepEqual(await readMonthlyReputationReportsForPassport(client, owner), {
    state: 'unavailable', reasonCode: 'approval_unavailable', reports: [],
  });
  assert.equal(calls.length, 0);
});

test('Data Passport stays unavailable when monthly proposal tables are not installed', async () => {
  const { client, calls } = configuredClient({ installed: false });
  assert.deepEqual(await readMonthlyReputationReportsForPassport(client, owner, version), {
    state: 'unavailable', reasonCode: 'approval_unavailable', reports: [],
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].sql.includes('to_regclass('));
  assert.equal(calls.some(call => call.sql.includes('FROM trust.monthly_reputation_sources')), false);
});

test('Data Passport does not discover report months when the approved snapshot feature is off', async () => {
  const { client, calls } = configuredClient({ enabled: false });
  assert.deepEqual(await readMonthlyReputationReportsForPassport(client, owner, version), {
    state: 'unavailable', reasonCode: 'approval_unavailable', reports: [],
  });
  assert.equal(calls.some(call => call.sql.includes('FROM trust.monthly_reputation_sources')), false);
  assert.equal(calls.some(call => call.sql.includes('SELECT * FROM trust.lock_monthly_reward_configuration')), false);
});

test('Data Passport report month discovery is bound to the authorized owner', async () => {
  const { client, calls } = configuredClient();
  assert.deepEqual(await readMonthlyReputationReportsForPassport(client, owner, version), {
    state: 'included', reasonCode: null, reports: [],
  });
  const discovery = calls.find(call => call.sql.includes('FROM trust.monthly_reputation_sources'));
  assert.ok(discovery);
  assert.match(discovery.sql, /WHERE subject_user_id = \$1/);
  assert.deepEqual(discovery.values, [owner]);
});

test('Data Passport report adapter rejects malformed internal subject ids', async () => {
  const { client, calls } = configuredClient();
  await assert.rejects(() => readMonthlyReputationReportsForPassport(client, 'not-a-uuid', version), /monthly_report_subject_invalid/);
  assert.equal(calls.some(call => call.sql.includes('FROM trust.monthly_reputation_sources')), false);
});
