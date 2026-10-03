import { query,transaction,type HyperdriveBinding } from '@lythaus/db';
import { logEvent } from '@lythaus/observability';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { monthlyRewardSnapshotConfiguration,publishMonthlyRewardSnapshot,applyMonthlyRewardSnapshotCorrection,
  MONTHLY_REWARD_CORRECTION_EVENT } from '../../../packages/db/src/monthly-reward-snapshots.ts';

export interface MonthlyRewardSnapshotEnv {
  DB_JOBS_FRESH: HyperdriveBinding;
  MONTHLY_REPUTATION_SNAPSHOT_RULES?: string;
}
export async function processMonthlyRewardSnapshotEvent(env: MonthlyRewardSnapshotEnv,eventId: string,eventType: string) {
  if (!env.MONTHLY_REPUTATION_SNAPSHOT_RULES) return null;
  return transaction(env.DB_JOBS_FRESH,async client => {
    if (eventType === MONTHLY_REWARD_CORRECTION_EVENT)
      return applyMonthlyRewardSnapshotCorrection(client,{eventId,rulesVersion:env.MONTHLY_REPUTATION_SNAPSHOT_RULES});
    return publishMonthlyRewardSnapshot(client,{eventId,rulesVersion:env.MONTHLY_REPUTATION_SNAPSHOT_RULES});
  });
}
export async function reconcileMonthlyRewardSnapshots(env: MonthlyRewardSnapshotEnv) {
  if (!env.MONTHLY_REPUTATION_SNAPSHOT_RULES) return { processed:0 };
  const configuration = await transaction(env.DB_JOBS_FRESH,
    client => monthlyRewardSnapshotConfiguration(client,env.MONTHLY_REPUTATION_SNAPSHOT_RULES));
  if (!configuration) return { processed:0 };
  const events = await query<{ id: string; event_type: string }>(env.DB_JOBS_FRESH,`SELECT event.id,event.event_type FROM system.outbox_events event
    WHERE NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_receipts receipt
      WHERE receipt.event_id = event.id AND receipt.rules_version = $1)
      AND ((event.event_type = 'trust.monthly_assessment.recorded' AND EXISTS (
        SELECT 1 FROM trust.monthly_reputation_assessments assessment
        JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
        JOIN trust.monthly_reputation_assemblies assembly ON assembly.source_id = source.id
        JOIN trust.monthly_maintenance_rule_sets maintenance ON maintenance.version = assembly.rules_version
        WHERE event.aggregate_type = 'monthly_reputation_assessment' AND event.aggregate_id = assessment.id
          AND event.actor_id = source.subject_user_id AND source.policy_version = $2
          AND assembly.weekly_rules_version = $3 AND assembly.rules_version = $4
          AND ((source.source_month + interval '1 month') AT TIME ZONE 'UTC')
            + (maintenance.configuration ->> 'monthSettlementHours')::integer * interval '1 hour' <= clock_timestamp()
          AND event.payload @> jsonb_build_object('assessmentId',assessment.id::text,'sourceId',source.id::text,'mode','shadow')))
      OR (event.event_type = $5 AND EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_corrections correction
        WHERE correction.source_event_id = event.id AND correction.rules_version = $1
          AND event.aggregate_type = 'monthly_reward_snapshot_correction' AND event.aggregate_id = correction.id
          AND event.actor_id = correction.actor_id AND event.created_at = correction.recorded_at
          AND event.payload @> jsonb_build_object('correctionId',correction.id::text,'policyVersion',$2::text))))
    ORDER BY event.created_at,event.id LIMIT 50`,
  [configuration.version,MONTHLY_REPUTATION_POLICY_VERSION,configuration.weekly_rules_version,
    configuration.maintenance_rules_version,MONTHLY_REWARD_CORRECTION_EVENT]);
  let processed = 0;
  for (const event of events.rows) {
    try {
      const result = await processMonthlyRewardSnapshotEvent(env,event.id,event.event_type);
      if (result === null) break;
      processed++;
    } catch { logEvent({ service:'lythaus-jobs',event:'monthly_reward_snapshot_reconciliation_failed',eventId:event.id }); }
  }
  return { processed };
}
