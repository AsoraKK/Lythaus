import type { Client } from 'pg';
import { prepareMonthlyReputationReportResponse, prepareMonthlyRewardsResponse } from '../../contracts/src/monthly-rewards-response-preparation.ts';
import { disposablePreparationAllowed, type MonthlyReputationDisposablePreparation } from './monthly-reputation.ts';
import { readOwnMonthlyReputationReport } from './monthly-reputation-report.ts';
import { readOwnMonthlyRewardSnapshot } from './monthly-reward-snapshots.ts';

async function requirePreparation(client: Client, context: MonthlyReputationDisposablePreparation) {
  if (!context || !await disposablePreparationAllowed(client, context))
    throw new Error('monthly_rewards_response_preparation_requires_disposable_context');
}

export async function readOwnMonthlyReputationReportResponsePreparation(client: Client, input: {
  subjectId: string; sourceMonth: string; snapshotRulesVersion?: string;
}, context: MonthlyReputationDisposablePreparation) {
  await requirePreparation(client, context);
  return prepareMonthlyReputationReportResponse(await readOwnMonthlyReputationReport(client, input, context));
}

export async function readOwnMonthlyRewardsResponsePreparation(client: Client, input: {
  subjectId: string; effectiveMonth: string; snapshotRulesVersion?: string;
}, context: MonthlyReputationDisposablePreparation) {
  await requirePreparation(client, context);
  return prepareMonthlyRewardsResponse(await readOwnMonthlyRewardSnapshot(client, {
    subjectId: input.subjectId, effectiveMonth: input.effectiveMonth, rulesVersion: input.snapshotRulesVersion,
  }, context));
}
