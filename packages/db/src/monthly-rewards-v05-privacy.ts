import type { Client } from 'pg';
import { projectRewardsV05Candidate, type MonthlyRewardsV05Candidate } from '../../contracts/src/monthly-rewards-v05.ts';
import { requireSourceMonth } from '../../contracts/src/monthly-reputation-policy.ts';
import { monthlyReputationReportBounds, assertMonthlyReputationReportValueBounded } from './monthly-reputation-report.ts';

export async function reconcileMonthlyRewardsV05DataLocations(client: Client, subjectId: string) {
  const installed = (await client.query<{ available: boolean }>(
    `SELECT to_regprocedure('privacy.reconcile_monthly_rewards_v05_data_locations(uuid)') IS NOT NULL AS available`,
  )).rows[0];
  if (installed?.available) await client.query('SELECT privacy.reconcile_monthly_rewards_v05_data_locations($1)', [subjectId]);
}

export async function readMonthlyRewardsV05ForPassport(client: Client, subjectId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId)) {
    throw new Error('monthly_report_subject_invalid');
  }
  const installed = (await client.query<{ available: boolean }>(`SELECT
    to_regclass('trust.monthly_rewards_v05_candidates') IS NOT NULL
    AND to_regclass('trust.monthly_rewards_v05_reconciliation_attempts') IS NOT NULL AS available`)).rows[0];
  if (!installed?.available) return { state: 'unavailable' as const, reasonCode: 'not_collected', candidates: [], reconciliationAttempts: [] };
  const bounds = monthlyReputationReportBounds();
  const rows = (await client.query<{ id: string; source_month: string; revision: number; rules_version: string;
    recorded_at: Date; report: MonthlyRewardsV05Candidate | null }>(
    `SELECT id, to_char(source_month,'YYYY-MM') AS source_month, revision, rules_version, recorded_at,
      CASE WHEN pg_column_size(report) <= $2 THEN report ELSE NULL END AS report
     FROM trust.monthly_rewards_v05_candidates WHERE subject_user_id = $1
     ORDER BY source_month, revision, id LIMIT $3`,
    [subjectId, bounds.maximumSourceRowBytes, bounds.maximumSourceRevisions + 1])).rows;
  const attempts = (await client.query<{ id: string; source_month: string; rules_version: string; attempted_at: Date; attempt_count: string }>(
    `SELECT id, to_char(source_month,'YYYY-MM') AS source_month, rules_version, attempted_at, attempt_count::text
     FROM trust.monthly_rewards_v05_reconciliation_attempts WHERE subject_user_id = $1
     ORDER BY source_month, rules_version, id LIMIT $2`, [subjectId, bounds.maximumArrayItems + 1])).rows;
  if (rows.length > bounds.maximumSourceRevisions || attempts.length > bounds.maximumArrayItems || rows.some(row => !row.report)) {
    throw new Error('monthly_report_resource_limit_exceeded');
  }
  const candidates = rows.map(row => {
    if (row.report!.sourceMonth !== row.source_month || row.report!.configurationVersion !== row.rules_version
      || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('monthly_rewards_v05_projection_invalid');
    return { id: row.id, revision: row.revision, rulesVersion: row.rules_version,
      recordedAt: row.recorded_at.toISOString(), ...projectRewardsV05Candidate(row.report!) };
  });
  const reconciliationAttempts = attempts.map(row => {
    requireSourceMonth(row.source_month);
    if (!/^[1-9]\d{0,18}$/.test(row.attempt_count)) throw new Error('monthly_rewards_v05_attempt_invalid');
    return { id: row.id, sourceMonth: row.source_month, rulesVersion: row.rules_version,
      attemptedAt: row.attempted_at.toISOString(), attemptCount: row.attempt_count };
  });
  const result = { state: 'included' as const, reasonCode: null, candidates, reconciliationAttempts };
  assertMonthlyReputationReportValueBounded(result, bounds);
  return result;
}
