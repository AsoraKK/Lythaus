import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import { logEvent } from '@lythaus/observability';
import { loadMonthlyPeerConfiguration, MONTHLY_PEER_PARTICIPATION_EVENT, recordMonthlyPeerParticipation } from '../../../packages/db/src/monthly-peer-participation.ts';

export interface MonthlyPeerJobsEnv {
  DB_JOBS_FRESH: HyperdriveBinding;
  MONTHLY_REPUTATION_SHADOW_RULES?: string;
  MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES?: string;
}
export async function processMonthlyPeerParticipation(env: MonthlyPeerJobsEnv, eventId: string) {
  if (!env.MONTHLY_REPUTATION_SHADOW_RULES || !env.MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES) return null;
  return transaction(env.DB_JOBS_FRESH, client => recordMonthlyPeerParticipation(client, { eventId,
    rulesVersion: env.MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES!, weeklyRulesVersion: env.MONTHLY_REPUTATION_SHADOW_RULES!,
    evaluatedAt: new Date().toISOString() }));
}
export async function reconcileMonthlyPeerParticipation(env: MonthlyPeerJobsEnv): Promise<{ processed: number }> {
  if (!env.MONTHLY_REPUTATION_SHADOW_RULES || !env.MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES) return { processed: 0 };
  const configuration = await transaction(env.DB_JOBS_FRESH, client => loadMonthlyPeerConfiguration(client,
    env.MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES!, env.MONTHLY_REPUTATION_SHADOW_RULES!));
  if (!configuration) return { processed: 0 };
  const events = await query<{ id: string }>(env.DB_JOBS_FRESH, `SELECT event.id FROM system.outbox_events event
    JOIN moderation.community_appeal_sessions session ON session.appeal_id = event.aggregate_id
    WHERE event.event_type = $1 AND event.aggregate_type = 'community_appeal' AND session.rules_version = $2
      AND session.review_class = 'standard' AND session.state IN ('resolved_allow', 'resolved_retain', 'unresolved')
      AND session.resolved_at >= $3 AND event.payload ->> 'appealId' = session.appeal_id::text
      AND event.payload ->> 'state' = session.state
      AND NOT EXISTS (SELECT 1 FROM trust.monthly_peer_participation_receipts receipt WHERE receipt.appeal_id = session.appeal_id)
    ORDER BY event.created_at, event.id LIMIT 50`, [MONTHLY_PEER_PARTICIPATION_EVENT, configuration.appealRulesVersion, configuration.collectFrom]);
  let processed = 0;
  for (const event of events.rows) {
    try { if ((await processMonthlyPeerParticipation(env, event.id))?.processed) processed++; }
    catch { logEvent({ service: 'lythaus-jobs', event: 'monthly_peer_participation_failed', eventId: event.id }); }
  }
  return { processed };
}
