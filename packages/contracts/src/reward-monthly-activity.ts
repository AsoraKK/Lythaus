import { calendarRewardMonths, rewardCalendarInstant, rewardCalendarMonthAt, shiftRewardCalendarMonth } from './reward-calendar.ts';
import { REPUTATION_EVENT_CATALOG, REPUTATION_POLICY, type ReputationSignalType } from './reputation-policy.ts';

export interface MonthlyReputationLedgerEvent {
  id: string;
  subjectUserId: string;
  eventType: ReputationSignalType;
  sourceEventId: string | null;
  policyVersion: string;
  occurredAt: string;
  recordedAt: string;
  impact: number;
  status: 'effective' | 'withheld' | 'reversed' | 'expired';
  reversalReference: string | null;
}

export interface MonthlyReputationActivity {
  month: string;
  followingRewardMonth: string;
  positiveImpact: number;
  negativeImpact: number;
  effectiveEvents: number;
  withheldEvents: number;
  reversedEvents: number;
  expiredEvents: number;
}

function emptyActivity(month: string): MonthlyReputationActivity {
  return {
    month,
    followingRewardMonth: shiftRewardCalendarMonth(month, 1),
    positiveImpact: 0,
    negativeImpact: 0,
    effectiveEvents: 0,
    withheldEvents: 0,
    reversedEvents: 0,
    expiredEvents: 0,
  };
}

export function projectMonthlyReputationActivity(
  events: readonly MonthlyReputationLedgerEvent[],
  subjectUserId: string,
  asOf: string,
  timeZone: string,
) {
  if (!subjectUserId) throw new Error('reward_month_subject_required');
  const months = calendarRewardMonths(asOf, timeZone);
  const now = rewardCalendarInstant(asOf).getTime();
  const qualificationActivity = emptyActivity(months.qualificationMonth);
  const currentActivity = emptyActivity(months.currentActivityMonth);
  const identities = new Map<string, string>();
  const sources = new Map<string, string>();
  for (const event of events) {
    if (event.subjectUserId !== subjectUserId) throw new Error('reward_month_subject_mismatch');
    if (!event.id || !Object.hasOwn(REPUTATION_EVENT_CATALOG, event.eventType)
      || (event.sourceEventId !== null && (typeof event.sourceEventId !== 'string' || !event.sourceEventId))) {
      throw new Error('reward_month_event_invalid');
    }
    if (event.policyVersion !== REPUTATION_POLICY.version) throw new Error('reward_month_ledger_policy_unsupported');
    if (!['effective', 'withheld', 'reversed', 'expired'].includes(event.status) || !Number.isFinite(event.impact)) {
      throw new Error('reward_month_event_invalid');
    }
    const occurred = rewardCalendarInstant(event.occurredAt);
    const recorded = rewardCalendarInstant(event.recordedAt);
    if (occurred.getTime() > now || recorded.getTime() > now) continue;
    const identity = JSON.stringify([
      event.subjectUserId, event.eventType, event.sourceEventId, event.policyVersion,
      occurred.toISOString(), recorded.toISOString(), event.impact, event.status, event.reversalReference,
    ]);
    if (identities.has(event.id)) {
      if (identities.get(event.id) !== identity) throw new Error('reward_month_replay_conflict');
      continue;
    }
    identities.set(event.id, identity);
    if (event.sourceEventId !== null) {
      const source = JSON.stringify([event.subjectUserId, event.eventType, event.sourceEventId]);
      if (sources.has(source)) throw new Error('reward_month_duplicate_source');
      sources.set(source, event.id);
    }
    if (event.eventType === 'reputation_event_reversal') {
      if (!event.reversalReference) throw new Error('reward_month_reversal_invalid');
      continue;
    }
    if (event.reversalReference !== null) throw new Error('reward_month_reversal_invalid');
    const month = rewardCalendarMonthAt(event.occurredAt, months.timeZone);
    const activity = month === qualificationActivity.month ? qualificationActivity
      : month === currentActivity.month ? currentActivity : null;
    if (!activity) continue;
    if (event.status === 'withheld') activity.withheldEvents += 1;
    else if (event.status === 'reversed') activity.reversedEvents += 1;
    else if (event.status === 'expired') activity.expiredEvents += 1;
    else {
      const disposition = REPUTATION_EVENT_CATALOG[event.eventType].disposition;
      if ((disposition === 'withheld' && event.impact !== 0)
        || (disposition === 'positive' && event.impact < 0)
        || (disposition === 'negative' && event.impact > 0)) throw new Error('reward_month_impact_invalid');
      activity.effectiveEvents += 1;
      activity.positiveImpact += Math.max(0, event.impact);
      activity.negativeImpact += Math.max(0, -event.impact);
      if (!Number.isFinite(activity.positiveImpact) || !Number.isFinite(activity.negativeImpact)) {
        throw new Error('reward_month_impact_invalid');
      }
    }
  }
  return {
    ...months,
    ledgerPolicyVersion: REPUTATION_POLICY.version,
    status: 'monthly_policy_pending' as const,
    rewardLevel: null,
    nextRewardLevel: null,
    qualificationActivity,
    currentActivity,
  };
}
