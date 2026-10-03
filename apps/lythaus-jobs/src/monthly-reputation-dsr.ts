import type { Client } from 'pg';
import { readOwnMonthlyReputationReport } from '../../../packages/db/src/monthly-reputation-report.ts';
import { monthlyRewardSnapshotConfiguration } from '../../../packages/db/src/monthly-reward-snapshots.ts';

const unavailable = () => ({ state: 'unavailable' as const, reasonCode: 'approval_unavailable', reports: [] });

export async function readMonthlyReputationReportsForPassport(client: Client, subjectId: string,
  snapshotRulesVersion?: string) {
  if (!snapshotRulesVersion) return unavailable();
  if (!(await monthlyRewardSnapshotConfiguration(client, snapshotRulesVersion))) return unavailable();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId)) {
    throw new Error('monthly_report_subject_invalid');
  }
  const months = await client.query<{ source_month: string }>(`SELECT to_char(source_month, 'YYYY-MM') AS source_month
    FROM trust.monthly_reputation_sources WHERE subject_user_id = $1
    GROUP BY source_month ORDER BY source_month`, [subjectId]);
  const reports = [];
  for (const row of months.rows) {
    reports.push(await readOwnMonthlyReputationReport(client, {
      subjectId, sourceMonth: row.source_month, snapshotRulesVersion,
    }));
  }
  return { state: 'included' as const, reasonCode: null, reports };
}
