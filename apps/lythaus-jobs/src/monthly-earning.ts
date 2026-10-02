import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import { logEvent } from '@lythaus/observability';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { loadMonthlyEarningConfiguration, MONTHLY_EARNING_SOURCE_EVENTS, recordMonthlyContentEarning, refreshMonthlyEarningWeek } from '../../../packages/db/src/monthly-earning.ts';

export interface MonthlyEarningEnv {
  DB_JOBS_FRESH: HyperdriveBinding;
  MONTHLY_REPUTATION_SHADOW_RULES?: string;
}

export async function processMonthlyEarningEvent(env: MonthlyEarningEnv, eventId: string) {
  if (!env.MONTHLY_REPUTATION_SHADOW_RULES) return null;
  return transaction(env.DB_JOBS_FRESH, client => recordMonthlyContentEarning(client, {
    eventId, rulesVersion: env.MONTHLY_REPUTATION_SHADOW_RULES!, evaluatedAt: new Date().toISOString(),
  }));
}

export async function reconcileMonthlyEarning(env: MonthlyEarningEnv): Promise<{ processed: number; settled: number }> {
  const version = env.MONTHLY_REPUTATION_SHADOW_RULES;
  if (!version) return { processed: 0, settled: 0 };
  const configuration = await transaction(env.DB_JOBS_FRESH, client => loadMonthlyEarningConfiguration(client, version));
  if (!configuration) return { processed: 0, settled: 0 };
  const events = await query<{ id: string }>(env.DB_JOBS_FRESH,
    `SELECT event.id FROM system.outbox_events event WHERE event.event_type = ANY($1::text[])
      AND event.created_at >= $2 AND NOT EXISTS (SELECT 1 FROM trust.monthly_earning_receipts receipt
        WHERE receipt.event_id = event.id AND receipt.policy_version = $3)
      ORDER BY event.created_at, event.id LIMIT 50`,
    [MONTHLY_EARNING_SOURCE_EVENTS, configuration.collectFrom, MONTHLY_REPUTATION_POLICY_VERSION]);
  let processed = 0, settled = 0;
  for (const event of events.rows) {
    try {
      const result = await processMonthlyEarningEvent(env, event.id);
      if (result === null) break;
      if (result.processed) processed++;
    } catch {
      logEvent({ service: 'lythaus-jobs', event: 'monthly_earning_reconciliation_failed', eventId: event.id });
    }
  }
  const weeks = await query<{ subject_user_id: string; week_start: Date }>(env.DB_JOBS_FRESH,
    `SELECT subject_user_id, week_start FROM (
       SELECT DISTINCT ON (subject_user_id, week_start) subject_user_id, week_start, state, rules_version
       FROM trust.monthly_earning_week_revisions WHERE policy_version = $1
       ORDER BY subject_user_id, week_start, revision DESC
     ) latest WHERE rules_version = $2 AND state IN ('open', 'settling')
       AND week_start + interval '7 days' <= now() ORDER BY week_start, subject_user_id LIMIT 50`,
    [MONTHLY_REPUTATION_POLICY_VERSION, version]);
  for (const week of weeks.rows) {
    const result = await transaction(env.DB_JOBS_FRESH, async client => {
      const current = await loadMonthlyEarningConfiguration(client, version);
      if (!current) return null;
      return refreshMonthlyEarningWeek(client, { subjectUserId: week.subject_user_id,
        startsAt: week.week_start.toISOString(), configuration: current, evaluatedAt: new Date().toISOString() });
    });
    if (result?.created) settled++;
  }
  return { processed, settled };
}
