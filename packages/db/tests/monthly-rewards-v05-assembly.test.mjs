import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { REWARDS_V05_CONFIGURATION } from '../../contracts/src/monthly-rewards-v05.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as maintenance } from '../../contracts/src/monthly-maintenance-policy.ts';
import { PROPOSED_WEEKLY_EARNING_RULES as weekly } from '../../contracts/src/monthly-earning-policy.ts';

let peerError, contextError;
mock.module('../src/monthly-peer-participation.ts', { namedExports: {
  requireMonthlyPeerIngestionDrained: async () => { if (peerError) throw new Error(peerError); },
} });
mock.module('../src/monthly-context-review.ts', { namedExports: {
  requireMonthlyContextIngestionDrained: async () => { if (contextError) throw new Error(contextError); },
} });
mock.module('../src/monthly-earning.ts', { namedExports: {
  loadMonthlyEarningConfiguration: async () => ({ rules: weekly, collectFrom: '2026-10-01T00:00:00.000Z' }),
  monthlyEarningSourceEvents: () => ['content.post.created'],
} });
mock.module('../src/monthly-maintenance.ts', { namedExports: {
  loadMonthlyMaintenanceConfiguration: async () => ({ rules: maintenance, collectFrom: '2026-10-01T00:00:00.000Z' }),
  readMonthlyMaintenanceEvidence: async () => ({ evidence: [] }),
} });
const { assembleRewardsV05Candidate } = await import('../src/monthly-rewards-v05.ts');
const configuration = { ...REWARDS_V05_CONFIGURATION, firstSourceMonth: '2026-11', prospectiveFrom: '2026-11-01T00:00:00.000Z',
  weeklyRulesVersion: weekly.version, maintenanceRulesVersion: maintenance.version };
function client({ wrongRules = false } = {}) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('to_regclass')) return { rows: [{ available: true }], rowCount: 1 };
    if (sql.includes('lock_monthly_rewards_v05_configuration')) return { rows: [{ configuration }], rowCount: 1 };
    if (sql.includes('SELECT clock_timestamp()')) return { rows: [{ evaluated_at: new Date('2026-12-04T00:00:00.000Z') }], rowCount: 1 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('lock_monthly_reputation_subject')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM system.outbox_events')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM trust.monthly_earning_week_revisions')) return { rows: [{
      week_id: '01900000-0000-7000-8000-000000000002', revision: 1, state: 'locked', points: 250,
      week_start: new Date('2026-11-02T00:00:00.000Z'), recorded_at: new Date('2026-11-12T00:00:00.000Z'),
      rules_version: wrongRules ? 'other' : weekly.version,
    }], rowCount: 1 };
    if (sql.includes('SELECT id, revision, evidence_digest')) return { rows: [], rowCount: 0 };
    if (sql.includes('INSERT INTO trust.monthly_rewards_v05_candidates')) return { rows: [], rowCount: 1 };
    assert.fail(`unexpected query ${sql}`);
  } };
}
const assemble = db => assembleRewardsV05Candidate(db, { subjectUserId: '01900000-0000-7000-8000-000000000001',
  sourceMonth: '2026-11', version: configuration.version });
test('actual peer and context pending error codes retain unrelated credit and distinguish backlog from missing producers', async () => {
  peerError = 'monthly_assembly_peer_ingestion_pending';
  contextError = 'monthly_assembly_context_ingestion_pending';
  const result = await assemble(client());
  assert.equal(result.report.weeklyPoints, 250); assert.equal(result.report.sourceScore, 250);
  assert.equal(result.report.canonicalIngestionComplete, false);
  assert.equal(result.report.inheritance.weeklyRulesVersion, weekly.version);
  assert.equal(result.report.inheritance.contributionEligibilityVersion, null);
  assert.ok(result.report.finalisationBlockers.includes('prospective_weekly_eligibility_pending'));
  for (const code of [peerError, contextError, 'suggestion_evidence_producer_unavailable']) assert.ok(result.report.finalisationBlockers.includes(code));
});
test('configuration, source and recorded-version failures are never swallowed as backlog', async () => {
  peerError = 'monthly_assembly_peer_policy_requires_review'; contextError = undefined;
  await assert.rejects(assemble(client()), /peer_policy_requires_review/);
  peerError = undefined; contextError = 'monthly_assembly_context_policy_requires_review';
  await assert.rejects(assemble(client()), /context_policy_requires_review/);
  contextError = undefined;
  await assert.rejects(assemble(client({ wrongRules: true })), /week_policy_mismatch/);
});
