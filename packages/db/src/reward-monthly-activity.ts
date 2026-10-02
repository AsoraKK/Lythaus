import type { Client } from 'pg';
import { calendarRewardMonths, rewardCalendarInstant } from '../../contracts/src/reward-calendar.ts';
import { projectMonthlyReputationActivity, type MonthlyReputationLedgerEvent } from '../../contracts/src/reward-monthly-activity.ts';

export async function readMonthlyReputationActivity(
  client: Client,
  subjectUserId: string,
  asOf: string,
  timeZone: string,
) {
  if (!subjectUserId) throw new Error('reward_month_subject_required');
  const months = calendarRewardMonths(asOf, timeZone);
  const result = await client.query<MonthlyReputationLedgerEvent>(
    `SELECT id, subject_user_id AS "subjectUserId", event_type AS "eventType",
            source_event_id AS "sourceEventId", policy_version AS "policyVersion",
            to_char(effective_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "occurredAt",
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recordedAt",
            impact::double precision AS impact, status, reversal_reference AS "reversalReference"
       FROM trust.reputation_events
      WHERE subject_user_id = $1
        AND to_char(effective_at AT TIME ZONE $2, 'YYYY-MM') = ANY($3::text[])
        AND effective_at <= $4::timestamptz AND created_at <= $4::timestamptz
      ORDER BY effective_at, id`,
    [subjectUserId, months.timeZone, [months.qualificationMonth, months.currentActivityMonth], rewardCalendarInstant(asOf).toISOString()],
  );
  return projectMonthlyReputationActivity(result.rows, subjectUserId, asOf, months.timeZone);
}
