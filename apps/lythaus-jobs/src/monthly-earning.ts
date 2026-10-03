import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import { logEvent } from '@lythaus/observability';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { loadMonthlyEarningConfiguration, monthlyEarningSourceEvents, recordMonthlyContentEarning, refreshMonthlyEarningWeek } from '../../../packages/db/src/monthly-earning.ts';
import { monthlyContextConfiguration, MONTHLY_CONTEXT_EVENT } from '../../../packages/db/src/monthly-context-review.ts';
import { monthlyContextDependencyCandidates } from '../../../packages/db/src/monthly-context-dependencies.ts';

export interface MonthlyEarningEnv {
  DB_JOBS_FRESH: HyperdriveBinding;
  MONTHLY_REPUTATION_SHADOW_RULES?: string;
  MONTHLY_REPUTATION_CONTEXT_RULES?: string;
}

export async function processMonthlyEarningEvent(env: MonthlyEarningEnv, eventId: string) {
  if (!env.MONTHLY_REPUTATION_SHADOW_RULES) return null;
  return transaction(env.DB_JOBS_FRESH, client => recordMonthlyContentEarning(client, {
    eventId, rulesVersion: env.MONTHLY_REPUTATION_SHADOW_RULES!, evaluatedAt: new Date().toISOString(),
    contextRulesVersion: env.MONTHLY_REPUTATION_CONTEXT_RULES,
  }));
}

export async function reconcileMonthlyEarning(env: MonthlyEarningEnv): Promise<{ processed: number; settled: number }> {
  const version = env.MONTHLY_REPUTATION_SHADOW_RULES;
  if (!version) return { processed: 0, settled: 0 };
  const configuration = await transaction(env.DB_JOBS_FRESH, client => loadMonthlyEarningConfiguration(client, version));
  if (!configuration) return { processed: 0, settled: 0 };
  const context = await transaction(env.DB_JOBS_FRESH, client => monthlyContextConfiguration(client, env.MONTHLY_REPUTATION_CONTEXT_RULES, version, true));
  const events = await query<{ id: string }>(env.DB_JOBS_FRESH,
    `SELECT event.id FROM system.outbox_events event WHERE event.event_type = ANY($1::text[])
      AND event.created_at >= $2 AND NOT EXISTS (SELECT 1 FROM trust.monthly_earning_receipts receipt
        WHERE receipt.event_id = event.id AND receipt.policy_version = $3)
      ${context ? `AND (event.event_type <> $4 OR EXISTS (SELECT 1 FROM trust.monthly_context_reviews review
        WHERE review.source_event_id = event.id AND review.rules_version = $5))` : ''}
      ORDER BY event.created_at, event.id LIMIT 50`,
    [monthlyEarningSourceEvents(!!context), configuration.collectFrom, MONTHLY_REPUTATION_POLICY_VERSION,
      ...(context ? [MONTHLY_CONTEXT_EVENT, context.version] : [])]);
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
  const dependencies = await transaction(env.DB_JOBS_FRESH, client => monthlyContextDependencyCandidates(client, version));
  for (const dependency of dependencies) {
    try {
      const result = await transaction(env.DB_JOBS_FRESH, client => recordMonthlyContentEarning(client, {
        eventId: dependency.event_id, dependentCommentId: dependency.comment_id, contextRulesVersion: dependency.rules_version,
        rulesVersion: version, evaluatedAt: new Date().toISOString(),
      }));
      if (result?.processed) processed++;
    } catch { logEvent({ service: 'lythaus-jobs', event: 'monthly_context_dependency_reconciliation_failed', eventId: dependency.event_id }); }
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
