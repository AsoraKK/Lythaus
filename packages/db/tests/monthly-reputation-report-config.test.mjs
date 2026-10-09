import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readOwnMonthlyReputationReport } from '../src/monthly-reputation-report.ts';
import { readOwnMonthlyRewardSnapshot } from '../src/monthly-reward-snapshots.ts';
import { serializeMonthlyReputationReportCsv } from '../../../apps/lythaus-public-api/src/monthly-reputation-report-export.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as v1 } from '../../contracts/src/monthly-reputation-policy.ts';
import { PROSPECTIVE_REPUTATION_POLICY_VERSION as v2, PROSPECTIVE_REPUTATION_CATALOGUE_HASH as hash } from '../../contracts/src/monthly-reputation-prospective.ts';

const subjectId = '01900000-0000-7000-8000-000000000099';

function clientWith(queryResult) {
  const statements = [];
  return {
    statements,
    query: async (statement) => {
      statements.push(statement);
      return queryResult(statement);
    },
  };
}

test('an absent snapshot provider returns a server-side pending projection without database reads', async () => {
  const client = clientWith(() => assert.fail('unconfigured report must not query a database'));
  const report = await readOwnMonthlyReputationReport(client, { subjectId, sourceMonth: '2026-08' });

  assert.equal(report.reportState, 'pending');
  assert.equal(report.reasonCode, 'report_unavailable');
  assert.equal(report.report, null);
  assert.equal(report.levelAuthority.state, 'unavailable');
  assert.deepEqual(client.statements, []);
  assert.equal(createHash('sha256').update(serializeMonthlyReputationReportCsv(report)).digest('hex'),
    '2f4839fcf19ed16e25e7b105f81e7d741363458d1ef5c42209ff84bb230cd84b', 'historical v1 CSV bytes');
});

test('a feature-off report checks only the existing feature flag before returning pending', async () => {
  const client = clientWith(statement => {
    if (statement.includes('to_regclass(')) return { rows: [{ available: true }], rowCount: 1 };
    if (statement.includes('system.feature_flags')) return { rows: [], rowCount: 0 };
    assert.fail(`monthly data query should be gated: ${statement}`);
  });
  const report = await readOwnMonthlyReputationReport(client, {
    subjectId, sourceMonth: '2026-08', snapshotRulesVersion: 'synthetic-disabled-rules',
  });

  assert.equal(report.reportState, 'pending');
  assert.equal(report.reasonCode, 'report_unavailable');
  assert.equal(report.report, null);
  assert.equal(report.levelAuthority.reasonCode, 'approval_unavailable');
  assert.equal(client.statements.length, 2);
  assert.ok(client.statements[0].includes('to_regclass('));
  assert.equal(client.statements[1], 'SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2');
});

const disposable = { mode: 'disposable_local_pg17' };
const input = { subjectId, sourceMonth: '2026-12', snapshotRulesVersion: 'synthetic-prepared-rules' };
function preparedClient({ settled = true, mutate = () => {}, snapshotPolicy = v2 } = {}) {
  const calculation = { policyVersion: v2, preparationOnly: true, sourceMonth: '2026-12', effectiveMonth: '2027-01',
    weeklyPoints: 10000, monthlyPoints: 2500, emailPoints: 1000, suggestionPoints: 150, quarterlyPoints: 1150, sourceScore: 13650, level: 5,
    weeks: Array.from({ length: 5 }, (_, index) => ({ weekId: `synthetic-${index}`, points: 2500, selected: index < 4,
      selectionReason: index < 4 ? 'selected_best_four' : 'not_selected_best_four' })) };
  const assembly = { policyVersion: v2, preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0,
    catalogueHash: hash, sourceMonth: '2026-12', weeklyRulesVersion: 'synthetic-weekly', rulesVersion: 'synthetic-maintenance',
    weeks: calculation.weeks.map(week => ({ ...week, calculation: { policyVersion: v1, points: 2500, actions: [] } })),
    maintenance: { monthlyPoints: 2500, actions: [] },
    quarterly: { emailPoints: 1000, suggestionPoints: 150, quarterlyPoints: 1150,
      qualification: { email: { qualifies: true, reason: 'qualified_at_source_cutoff_activation_pending',
        validFrom: '2026-12-31T12:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z' },
        suggestion: { qualifies: true, reason: 'qualified_at_source_cutoff_activation_pending' } } } };
  const row = { revision: 2, reason_code: 'source_evidence_corrected', recorded_at: new Date('2027-01-04T00:00:00Z'),
    catalogue_hash: hash, input_digest: 'a'.repeat(64), assembly_policy: v2, assembly_digest: 'b'.repeat(64),
    preparation_matches: true, report: assembly, assessment_policy: v2, assessment_mode: 'shadow', calculation,
    weekly_points: 10000, monthly_points: 2500, quarterly_points: 1150, source_score: 13650, level: 5 };
  mutate(row);
  const client = clientWith((statement) => {
    if (statement.includes('current_database()')) return { rows: [{ database: 'lythaus_monthly_test', version: 170011 }] };
    if (statement.includes('AS available')) return { rows: [{ available: true }], rowCount: 1 };
    if (statement.includes('system.feature_flags')) return { rows: [{}], rowCount: 1 };
    if (statement.includes('trust.lock_monthly_reward_configuration')) return { rows: [
      { enabled: true, policy_version: v1 }, { enabled: true, policy_version: v1 }], rowCount: 2 };
    if (statement.includes('SELECT version,mode,first_source_month')) return { rows: [{ version: input.snapshotRulesVersion,
      mode: 'shadow', policy_version: v2, first_source_month: new Date('2026-10-01'), weekly_rules_version: 'synthetic-weekly',
      maintenance_rules_version: 'synthetic-maintenance', preparation_configuration: {}, decision_approvals: {} }] };
    if (statement.includes('to_char(clock_timestamp()')) return { rows: [{ month: '2027-01' }] };
    if (statement.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (statement.includes('trust.lock_monthly_reward_subject')) return { rows: [{ allowed: true }] };
    if (statement.includes('SELECT * FROM trust.monthly_reward_snapshots')) return { rows: [{ id: subjectId,
      source_month: new Date('2026-12-01'), rules_version: input.snapshotRulesVersion, policy_version: snapshotPolicy,
      source_revision: 1, revision: 1, source_score: 0, level: 1, preparation_only: true, mode: 'shadow' }] };
    if (statement.includes('AS settled')) return { rows: [{ settled }] };
    if (statement.includes('FROM trust.monthly_reputation_sources source')) return { rows: [row] };
    if (statement.includes('SELECT revision, mode')) {
      assert.ok(statement.includes('policy_version = $3'));
      return { rows: [] };
    }
    assert.fail(`Unexpected prepared query: ${statement}`);
  });
  client.connectionParameters = { host: '127.0.0.1', database: 'lythaus_monthly_test' };
  return client;
}

test('disabled prepared reports retain whole-week selection, 13650 components and December-to-January immutable authority', async () => {
  const report = await readOwnMonthlyReputationReport(preparedClient(), input, disposable);
  assert.equal(report.dataVersion, 2); assert.equal(report.policyVersion, v2); assert.equal(report.runtimeActivationAllowed, false);
  assert.equal(report.effectiveMonth, '2027-01'); assert.equal(report.report.total.sourceScore, 13650);
  assert.equal(report.report.total.maximumSourceMonth, 13650); assert.equal(report.report.total.calculatedLevel, 5);
  assert.equal(report.report.weekly.selectedWeeks.length, 4); assert.equal(report.report.weekly.omittedWeeks.length, 1);
  assert.equal(report.report.quarterlyEmail.points, 1000); assert.equal(report.report.quarterlySuggestion.points, 150);
  assert.equal(report.report.quarterlyTotal.maximumPoints, 1150);
  assert.equal(report.levelAuthority.sourceScore, 0); assert.equal(report.levelAuthority.sourceRevision, 1);
  assert.equal(report.report.sourceRevision, 2); assert.equal(report.corrections.sourceRevisions[0].policyVersion, v2);
  assert.throws(() => serializeMonthlyReputationReportCsv(report), /preparation_required/);
  const csv = serializeMonthlyReputationReportCsv(report, { mode: 'disabled_v2_preparation' });
  assert.ok(csv.includes('emailMaximumPoints,suggestionMaximumPoints')); assert.ok(csv.includes('"13650"'));
  const injection = structuredClone(report); injection.report.sourceReasonCode = ' \t=synthetic()';
  assert.ok(serializeMonthlyReputationReportCsv(injection, { mode: 'disabled_v2_preparation' }).includes("' \t=synthetic()"));
  assert.throws(() => serializeMonthlyReputationReportCsv({ ...report, runtimeActivationAllowed: true }, { mode: 'disabled_v2_preparation' }), /preparation_required/);
});

test('prepared projection refuses fractional, mixed-policy, rebound or malformed stored evidence', async () => {
  for (const mutate of [row => { row.calculation.weeklyPoints = 10000.5; }, row => { row.calculation.suggestionPoints = 149; },
    row => { row.assessment_policy = v1; }, row => { row.calculation.effectiveMonth = '2027-02'; },
    row => { row.calculation.level = 4; row.level = 4; }, row => { row.preparation_matches = false; },
    row => { row.assembly_digest = 'missing'; }, row => { row.report.quarterly.emailPoints = 1150; },
    row => { row.report.weeks[0].calculation.points = 0.5; }]) {
    await assert.rejects(readOwnMonthlyReputationReport(preparedClient({ mutate }), input, disposable), /integrity_failed/);
  }
  const collision = await readOwnMonthlyReputationReport(preparedClient({ snapshotPolicy: v1 }), input, disposable);
  assert.equal(collision.levelAuthority.reasonCode, 'snapshot_policy_requires_review');
  assert.equal(collision.levelAuthority.sourceScore, null);
});

test('prepared snapshot readers reuse the SQL settlement clock and never trust client time or latest progress', async () => {
  const client = preparedClient({ settled: false });
  const read = await readOwnMonthlyRewardSnapshot(client, { subjectId, effectiveMonth: '2027-01', rulesVersion: input.snapshotRulesVersion }, disposable);
  assert.equal(read.reasonCode, 'settlement_pending'); assert.equal(read.sourceScore, undefined);
  assert.ok(client.statements.some(statement => statement.includes('clock_timestamp() AS settled')));
  assert.ok(!client.statements.some(statement => statement.includes('ORDER BY source.revision')));
  const report = await readOwnMonthlyReputationReport(preparedClient({ settled: false }), input, disposable);
  assert.equal(report.levelAuthority.sourceScore, null); assert.equal(report.report.total.sourceScore, 13650);
});

test('prepared readers reject non-disposable targets before reading member data', async () => {
  const client = preparedClient(); client.connectionParameters.host = 'production.invalid';
  await assert.rejects(readOwnMonthlyReputationReport(client, input, disposable), /requires_disposable_local_target/);
  assert.deepEqual(client.statements, []);
});
