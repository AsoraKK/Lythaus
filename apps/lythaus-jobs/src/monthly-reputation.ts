import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import { assessMonthlyReputationSource, assessPreparedMonthlyReputationSource, deferMonthlyReputationRequest,
  MONTHLY_REPUTATION_PAUSED, MONTHLY_REPUTATION_REQUEST_EVENT,
  type MonthlyReputationDisposablePreparation } from '../../../packages/db/src/monthly-reputation.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '@lythaus/contracts';
import { uuidv7 } from '@lythaus/security';
import { logEvent } from '@lythaus/observability';

type MonthlyJobsEnv = { DB_JOBS_FRESH: HyperdriveBinding };

export async function processMonthlyReputationAssessment(
  env: MonthlyJobsEnv,
  eventId: string,
) {
  return transaction(env.DB_JOBS_FRESH, (client) => assessMonthlyReputationSource(client, {
    eventId,
    assessmentId: uuidv7(),
    resultEventId: uuidv7(),
    evaluatedAt: new Date().toISOString(),
  }));
}

export async function deferMonthlyReputationAssessment(env: MonthlyJobsEnv, eventId: string): Promise<void> {
  await transaction(env.DB_JOBS_FRESH, (client) => deferMonthlyReputationRequest(client, eventId));
}

// Direct disposable-fixture adapter only; the shared dispatcher never calls it.
export async function processPreparedMonthlyReputationAssessment(env: MonthlyJobsEnv, eventId: string,
  context?: MonthlyReputationDisposablePreparation) {
  return transaction(env.DB_JOBS_FRESH, client => assessPreparedMonthlyReputationSource(client, {
    eventId, assessmentId: uuidv7(), resultEventId: uuidv7(), evaluatedAt: context?.evaluatedAt ?? new Date().toISOString(),
  }, context));
}

export async function reconcileDeferredMonthlyReputation(env: MonthlyJobsEnv): Promise<number> {
  const pending = await query<{ id: string }>(env.DB_JOBS_FRESH,
    `SELECT id FROM system.outbox_events WHERE event_type = $1 AND last_error_code = $2
      AND (payload ->> 'policyVersion' IS NULL OR payload ->> 'policyVersion' = $3)
      ORDER BY created_at, id LIMIT 25`,
    [MONTHLY_REPUTATION_REQUEST_EVENT, MONTHLY_REPUTATION_PAUSED, MONTHLY_REPUTATION_POLICY_VERSION]);
  let completed = 0;
  for (const event of pending.rows) {
    try {
      const result = await processMonthlyReputationAssessment(env, event.id);
      if (result === null) break;
      await query(env.DB_JOBS_FRESH,
        `INSERT INTO system.consumer_inbox (consumer_name, event_id, event_type, payload, state, processed_at)
         VALUES ('lythaus-jobs', $1, $2, '{}'::jsonb, 'completed', now())
         ON CONFLICT (consumer_name, event_id) DO UPDATE SET state = 'completed', processed_at = now()`,
        [event.id, MONTHLY_REPUTATION_REQUEST_EVENT]);
      completed += 1;
    } catch {
      logEvent({ service: 'lythaus-jobs', event: 'monthly_reputation_reconciliation_failed', eventId: event.id });
    }
  }
  return completed;
}
