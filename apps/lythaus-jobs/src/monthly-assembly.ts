import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import { logEvent } from '@lythaus/observability';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { loadMonthlyEarningConfiguration } from '../../../packages/db/src/monthly-earning.ts';
import { loadMonthlyMaintenanceConfiguration } from '../../../packages/db/src/monthly-maintenance.ts';
import { assembleMonthlyReputation, assembleProspectiveMonthlyRewards } from '../../../packages/db/src/monthly-assembly.ts';
import { monthlyRewardsV05Configuration, rewardsV05ReconciliationCandidates,
  recordRewardsV05ReconciliationAttempt } from '../../../packages/db/src/monthly-rewards-v05.ts';

export interface MonthlyAssemblyEnv {
  DB_JOBS_FRESH: HyperdriveBinding;
  MONTHLY_REPUTATION_SHADOW_RULES?: string;
  MONTHLY_REPUTATION_MAINTENANCE_RULES?: string;
  MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES?: string;
  MONTHLY_REPUTATION_CONTEXT_RULES?: string;
  MONTHLY_REWARDS_V05_RULES?: string;
}

export async function reconcileMonthlyAssembly(env: MonthlyAssemblyEnv): Promise<{ processed: number }> {
  let prospective = 0;
  try { prospective = await reconcileProspectiveMonthlyRewards(env); }
  catch { logEvent({ service: 'lythaus-jobs', event: 'monthly_rewards_v05_reconciliation_failed' }); }
  const weeklyVersion = env.MONTHLY_REPUTATION_SHADOW_RULES, maintenanceVersion = env.MONTHLY_REPUTATION_MAINTENANCE_RULES;
  if (!weeklyVersion || !maintenanceVersion) return { processed: prospective };
  const configuration = await transaction(env.DB_JOBS_FRESH, async client => ({
    weekly: await loadMonthlyEarningConfiguration(client, weeklyVersion),
    maintenance: await loadMonthlyMaintenanceConfiguration(client, maintenanceVersion),
  }));
  if (!configuration.weekly || !configuration.maintenance) return { processed: prospective };
  const candidates = await query<{ subject_user_id: string; source_month: string }>(env.DB_JOBS_FRESH,
    `WITH periods AS (
       SELECT month FROM generate_series(date_trunc('month', greatest($2::timestamptz, $3::timestamptz) AT TIME ZONE 'UTC'),
         date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 month', interval '1 month') month
     ) SELECT account.id AS subject_user_id, to_char(period.month, 'YYYY-MM') AS source_month
     FROM identity.users account CROSS JOIN periods period
     LEFT JOIN LATERAL (SELECT id FROM trust.monthly_reputation_sources
       WHERE subject_user_id = account.id AND source_month = period.month::date AND policy_version = $1
       ORDER BY revision DESC LIMIT 1) latest ON true
     LEFT JOIN trust.monthly_reputation_assemblies assembly ON assembly.source_id = latest.id
     WHERE account.status <> 'deleted' AND account.deleted_at IS NULL AND account.is_production_acceptance = false
       AND account.created_at < (period.month + interval '1 month') AT TIME ZONE 'UTC'
       AND now() >= (period.month + interval '1 month' + $4::integer * interval '1 hour') AT TIME ZONE 'UTC'
       AND (latest.id IS NULL OR (assembly.rules_version = $5 AND assembly.weekly_rules_version = $6 AND (
         EXISTS (SELECT 1 FROM trust.monthly_earning_week_revisions week
           WHERE week.subject_user_id = account.id AND week.policy_version = $1
             AND week.calculation ->> 'ownerMonth' = to_char(period.month, 'YYYY-MM')
             AND NOT week.id = ANY(assembly.week_revision_ids)
             AND NOT EXISTS (SELECT 1 FROM trust.monthly_earning_week_revisions newer
               WHERE newer.week_id = week.week_id AND newer.revision > week.revision))
         OR EXISTS (SELECT 1 FROM trust.monthly_maintenance_observations observation
           LEFT JOIN trust.monthly_maintenance_revocations revoked ON revoked.observation_id = observation.id
           WHERE observation.subject_user_id = account.id
             AND (observation.performed_at < (period.month + interval '1 month') AT TIME ZONE 'UTC' OR observation.kind = 'integrity_assessment')
             AND (NOT observation.id = ANY(assembly.observation_ids)
               OR (revoked.observation_id IS NOT NULL AND NOT observation.id = ANY(assembly.revocation_ids))))
       ))) ORDER BY period.month, account.id LIMIT 50`,
    [MONTHLY_REPUTATION_POLICY_VERSION, configuration.weekly.collectFrom, configuration.maintenance.collectFrom,
      configuration.maintenance.rules.monthSettlementHours, maintenanceVersion, weeklyVersion]);
  let processed = prospective;
  for (const row of candidates.rows) {
    try {
      const result = await transaction(env.DB_JOBS_FRESH, client => assembleMonthlyReputation(client, {
        subjectUserId: row.subject_user_id, sourceMonth: row.source_month, weeklyRulesVersion: weeklyVersion,
        peerRulesVersion: env.MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES,
        contextRulesVersion: env.MONTHLY_REPUTATION_CONTEXT_RULES,
        maintenanceRulesVersion: maintenanceVersion, evaluatedAt: new Date().toISOString(),
      }));
      if (result?.created) processed++;
    } catch {
      logEvent({ service: 'lythaus-jobs', event: 'monthly_assembly_reconciliation_failed' });
    }
  }
  return { processed };
}

async function reconcileProspectiveMonthlyRewards(env: MonthlyAssemblyEnv): Promise<number> {
  if (!env.MONTHLY_REWARDS_V05_RULES) return 0;
  const configuration = await transaction(env.DB_JOBS_FRESH, client => monthlyRewardsV05Configuration(client, env.MONTHLY_REWARDS_V05_RULES));
  if (!configuration?.firstSourceMonth) return 0;
  const candidates = await transaction(env.DB_JOBS_FRESH, client => rewardsV05ReconciliationCandidates(client, configuration));
  let processed = 0;
  for (const candidate of candidates) {
    try {
      const attempted = await transaction(env.DB_JOBS_FRESH, client => recordRewardsV05ReconciliationAttempt(client, {
        subjectUserId: candidate.subject_user_id, sourceMonth: candidate.source_month, rulesVersion: configuration.version,
      }));
      if (!attempted) continue;
      const result = await transaction(env.DB_JOBS_FRESH, client => assembleProspectiveMonthlyRewards(client, {
        subjectUserId: candidate.subject_user_id, sourceMonth: candidate.source_month,
        rulesVersion: env.MONTHLY_REWARDS_V05_RULES, peerRulesVersion: env.MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES,
        contextRulesVersion: env.MONTHLY_REPUTATION_CONTEXT_RULES,
      }));
      if (result?.created) processed++;
    } catch { logEvent({ service: 'lythaus-jobs', event: 'monthly_rewards_v05_reconciliation_failed' }); }
  }
  return processed;
}
