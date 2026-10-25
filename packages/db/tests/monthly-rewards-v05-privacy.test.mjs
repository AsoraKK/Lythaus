import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readMonthlyRewardsV05ForPassport } from '../src/monthly-rewards-v05-privacy.ts';
import { calculateMonthlyRewardsV05, REWARDS_V05_CONFIGURATION } from '../../contracts/src/monthly-rewards-v05.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES } from '../../contracts/src/monthly-maintenance-policy.ts';

const owner = '01900000-0000-7000-8000-000000000001';
const configuration = { ...REWARDS_V05_CONFIGURATION, firstSourceMonth: '2026-08', prospectiveFrom: '2026-08-01T00:00:00.000Z' };
const report = sourceMonth => calculateMonthlyRewardsV05({ subjectUserId: owner, sourceMonth,
  evaluatedAt: '2026-12-04T00:00:00.000Z', configuration, weeks: [], maintenanceRules: PROPOSED_MONTHLY_MAINTENANCE_RULES,
  evidence: [], securityCoverage: [], suggestionRevisions: [], ingestionComplete: false });
function client({ oversized = false, invalid = false, many = false } = {}) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('to_regclass')) return { rows: [{ available: true }] };
    if (sql.includes('FROM trust.monthly_rewards_v05_candidates')) return { rows: Array.from({ length: many ? 129 : 2 }, (_, index) => ({
      id: `candidate-${index}`, source_month: index ? '2026-09' : '2026-08', revision: 1,
      rules_version: configuration.version, recorded_at: new Date('2026-10-10T00:00:00.000Z'),
      report: oversized ? null : { ...report(index ? '2026-09' : '2026-08'), security: { privateEvidenceId: 'third-party' },
        ...(invalid ? { redeemable: true } : {}) },
    })) };
    if (sql.includes('FROM trust.monthly_rewards_v05_reconciliation_attempts')) return { rows: [{
      id: 'attempt', source_month: '2026-08', rules_version: configuration.version,
      attempted_at: new Date('2026-10-10T00:00:00.000Z'), attempt_count: '2',
    }] };
    assert.fail(`unexpected query ${sql}`);
  } };
}
test('candidate-only privacy export includes all recorded months and attempts even while collection is paused', async () => {
  const db = client(); const value = await readMonthlyRewardsV05ForPassport(db, owner);
  assert.equal(value.state, 'included'); assert.equal(value.candidates.length, 2);
  assert.equal(value.reconciliationAttempts[0].attemptCount, '2');
  assert.ok(!JSON.stringify(value).includes('third-party'));
  assert.ok(db.calls.filter(call => call.sql.includes('FROM trust.')).every(call => call.values[0] === owner));
  assert.ok(db.calls.every(call => !/feature_flags|lock_monthly|clock_timestamp/.test(call.sql)));
});
test('privacy export rejects malformed authority and overflow instead of returning a partial passport', async () => {
  await assert.rejects(readMonthlyRewardsV05ForPassport(client({ invalid: true }), owner), /projection_invalid/);
  for (const options of [{ oversized: true }, { many: true }]) {
    await assert.rejects(readMonthlyRewardsV05ForPassport(client(options), owner), /resource_limit_exceeded/);
  }
  await assert.rejects(readMonthlyRewardsV05ForPassport(client(), 'invalid'), /subject_invalid/);
});
test('Jobs integrates optional inventory in both workflows and exports without snapshot configuration', () => {
  const source = readFileSync(new URL('../../../apps/lythaus-jobs/src/index.ts', import.meta.url), 'utf8');
  assert.equal(source.match(/await reconcileMonthlyReputationDataLocations\(this\.env\.DB_PRIVACY_FRESH, subjectId\)/g)?.length, 2);
  assert.match(source, /transaction\(db, client => reconcileMonthlyRewardsV05DataLocations\(client, subjectId\)\)/);
  assert.match(source, /const monthlyRewardsV05 = await transaction\(this\.env\.DB_PRIVACY_FRESH,/);
  assert.match(source, /Object\.freeze\(\{ \.\.\.passport, monthlyRewardsV05,/);
});
