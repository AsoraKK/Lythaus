import { requireSourceMonth, reputationInstant } from './monthly-reputation-policy.ts';

export const MONTHLY_REPUTATION_DECISIONS = Object.freeze([
  'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D13',
] as const);

export const MONTHLY_REPUTATION_ACTIVATION = Object.freeze({
  state: 'blocked' as const,
  catalogue: 'original_received_activation_prohibited' as const,
  pendingDecisions: MONTHLY_REPUTATION_DECISIONS,
  emailValidity: 'proposed_three_calendar_months_pending_approval' as const,
});

export const PROPOSED_CLOSING_SUNDAY_CALENDAR = Object.freeze({
  version: 'closing-sunday-utc-proposal-v1',
  decisionId: 'D01',
  status: 'pending_owner_approval',
});

export interface ProposedReputationWeek {
  startsAt: string;
  endsAt: string;
  ownerMonth: string;
  periodPolicyVersion: typeof PROPOSED_CLOSING_SUNDAY_CALENDAR.version;
}

export function proposedClosingSundayWeek(occurredAt: string): ProposedReputationWeek {
  const instant = reputationInstant(occurredAt);
  const day = new Date(instant);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const startsAt = day.toISOString();
  day.setUTCDate(day.getUTCDate() + 7);
  const endsAt = day.toISOString();
  const ownerMonth = new Date(day.getTime() - 1).toISOString().slice(0, 7);
  return Object.freeze({ startsAt, endsAt, ownerMonth, periodPolicyVersion: PROPOSED_CLOSING_SUNDAY_CALENDAR.version });
}

export function proposedClosingSundayWeeks(sourceMonth: string): readonly ProposedReputationWeek[] {
  requireSourceMonth(sourceMonth);
  const day = new Date(`${sourceMonth}-01T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + (7 - day.getUTCDay()) % 7);
  const weeks: ProposedReputationWeek[] = [];
  while (day.toISOString().slice(0, 7) === sourceMonth) {
    weeks.push(proposedClosingSundayWeek(day.toISOString()));
    day.setUTCDate(day.getUTCDate() + 7);
  }
  return Object.freeze(weeks);
}

export function proposedQuarterlyEmailExpiry(verifiedAt: string): string {
  const verified = new Date(reputationInstant(verifiedAt));
  const day = verified.getUTCDate();
  verified.setUTCDate(1);
  verified.setUTCMonth(verified.getUTCMonth() + 3);
  const monthEnd = new Date(verified.getTime());
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  verified.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
  return verified.toISOString();
}

export function proposedQuarterlyEmailComponent(input: {
  subjectUserId: string;
  emailVersion: string;
  sourceCutoff: string;
  proof: { subjectUserId: string; emailVersion: string; verifiedAt: string; revokedAt: string | null } | null;
}): { points: 0 | 1_000; reason: 'valid_at_cutoff' | 'no_matching_proof' | 'verified_after_cutoff' | 'expired' | 'revoked' } {
  const cutoff = reputationInstant(input.sourceCutoff);
  const proof = input.proof;
  if (!proof || proof.subjectUserId !== input.subjectUserId || proof.emailVersion !== input.emailVersion) {
    return { points: 0, reason: 'no_matching_proof' };
  }
  if (reputationInstant(proof.verifiedAt) >= cutoff) return { points: 0, reason: 'verified_after_cutoff' };
  if (proof.revokedAt !== null && reputationInstant(proof.revokedAt) < cutoff) return { points: 0, reason: 'revoked' };
  if (reputationInstant(proposedQuarterlyEmailExpiry(proof.verifiedAt)) < cutoff) return { points: 0, reason: 'expired' };
  return { points: 1_000, reason: 'valid_at_cutoff' };
}
