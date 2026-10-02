export const MONTHLY_REPUTATION_POLICY_VERSION = 'lythaus-monthly-rewards-2026-10-v1';
export const MONTHLY_REPUTATION_CATALOGUE_HASH = 'bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2';

export const MONTHLY_REPUTATION_LIMITS = Object.freeze({
  weekly: 2_500,
  selectedWeeks: 4,
  monthly: 2_500,
  quarterly: 1_000,
  sourceMonth: 13_500,
});

export type MonthlyReputationLevel = 1 | 2 | 3 | 4 | 5;

export const MONTHLY_REPUTATION_BANDS = Object.freeze([
  Object.freeze({ level: 1 as const, minimum: 0, maximum: 999 }),
  Object.freeze({ level: 2 as const, minimum: 1_000, maximum: 2_999 }),
  Object.freeze({ level: 3 as const, minimum: 3_000, maximum: 5_999 }),
  Object.freeze({ level: 4 as const, minimum: 6_000, maximum: 9_999 }),
  Object.freeze({ level: 5 as const, minimum: 10_000, maximum: 13_500 }),
]);

export interface LockedReputationWeek {
  weekId: string;
  revision: number;
  ownerMonth: string;
  startsAt: string;
  endsAt: string;
  lockedAt: string;
  state: 'locked' | 'corrected';
  points: number;
}

export interface MonthlyReputationInput {
  policyVersion: typeof MONTHLY_REPUTATION_POLICY_VERSION;
  sourceMonth: string;
  sourceCutoff: string;
  periodPolicyVersion: string;
  weeks: readonly LockedReputationWeek[];
  monthlyPoints: number;
  quarterlyPoints: 0 | 1_000;
}

export interface AssessedReputationWeek extends LockedReputationWeek {
  selected: boolean;
  selectionReason: 'selected_best_four' | 'not_selected_best_four';
}

export interface MonthlyReputationCalculation {
  policyVersion: typeof MONTHLY_REPUTATION_POLICY_VERSION;
  periodPolicyVersion: string;
  sourceMonth: string;
  effectiveMonth: string;
  sourceCutoff: string;
  weeks: readonly AssessedReputationWeek[];
  selectedWeekIds: readonly string[];
  weeklyPoints: number;
  monthlyPoints: number;
  quarterlyPoints: 0 | 1_000;
  sourceScore: number;
  level: MonthlyReputationLevel;
}

function boundedInteger(value: number, maximum: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(code);
}

export function requireSourceMonth(value: string): string {
  if (typeof value !== 'string' || !/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('monthly_reputation_source_month_invalid');
  }
  return value;
}

export function nextReputationMonth(value: string): string {
  requireSourceMonth(value);
  const [year, month] = value.split('-').map(Number);
  if (year === 9999 && month === 12) throw new Error('monthly_reputation_effective_month_invalid');
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function reputationLevelForMonthlyScore(score: number): MonthlyReputationLevel {
  boundedInteger(score, MONTHLY_REPUTATION_LIMITS.sourceMonth, 'monthly_reputation_score_invalid');
  return MONTHLY_REPUTATION_BANDS.find((band) => score <= band.maximum)!.level;
}

export function reputationInstant(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('monthly_reputation_timestamp_invalid');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    throw new Error('monthly_reputation_timestamp_invalid');
  }
  return time;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function calculateMonthlyReputation(
  input: MonthlyReputationInput,
  evaluatedAt: string,
): MonthlyReputationCalculation {
  if (input.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION) {
    throw new Error('monthly_reputation_policy_unsupported');
  }
  requireSourceMonth(input.sourceMonth);
  const effectiveMonth = nextReputationMonth(input.sourceMonth);
  const cutoff = reputationInstant(input.sourceCutoff);
  const evaluation = reputationInstant(evaluatedAt);
  if (evaluation < cutoff) throw new Error('monthly_reputation_source_not_closed');
  if (input.periodPolicyVersion !== 'closing-sunday-utc-proposal-v1') {
    throw new Error('monthly_reputation_period_policy_unsupported');
  }
  if (input.sourceCutoff !== `${effectiveMonth}-01T00:00:00.000Z`) {
    throw new Error('monthly_reputation_source_cutoff_invalid');
  }
  boundedInteger(input.monthlyPoints, MONTHLY_REPUTATION_LIMITS.monthly, 'monthly_reputation_maintenance_invalid');
  if (input.quarterlyPoints !== 0 && input.quarterlyPoints !== 1_000) {
    throw new Error('monthly_reputation_quarterly_invalid');
  }
  if (!Array.isArray(input.weeks) || input.weeks.length > 5) throw new Error('monthly_reputation_week_count_invalid');
  const weekIds = new Set<string>();
  const weeks = input.weeks.map((week): LockedReputationWeek => {
    if (!week || typeof week !== 'object') throw new Error('monthly_reputation_week_invalid');
    if (typeof week.weekId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(week.weekId)) {
      throw new Error('monthly_reputation_week_id_invalid');
    }
    if (weekIds.has(week.weekId)) throw new Error('monthly_reputation_duplicate_week');
    weekIds.add(week.weekId);
    if (!Number.isSafeInteger(week.revision) || week.revision < 1) throw new Error('monthly_reputation_week_revision_invalid');
    if (week.ownerMonth !== input.sourceMonth) throw new Error('monthly_reputation_week_owner_mismatch');
    if (week.state !== 'locked' && week.state !== 'corrected') throw new Error('monthly_reputation_week_not_locked');
    boundedInteger(week.points, MONTHLY_REPUTATION_LIMITS.weekly, 'monthly_reputation_week_points_invalid');
    const start = reputationInstant(week.startsAt);
    const end = reputationInstant(week.endsAt);
    const locked = reputationInstant(week.lockedAt);
    if (end - start !== 7 * 86_400_000 || new Date(start).getUTCDay() !== 1
      || !week.startsAt.endsWith('T00:00:00.000Z')
      || new Date(end - 1).toISOString().slice(0, 7) !== input.sourceMonth
      || end > cutoff || locked < end || locked > evaluation) {
      throw new Error('monthly_reputation_week_period_invalid');
    }
    return {
      weekId: week.weekId, revision: week.revision, ownerMonth: week.ownerMonth,
      startsAt: week.startsAt, endsAt: week.endsAt, lockedAt: week.lockedAt,
      state: week.state, points: week.points,
    };
  });
  weeks.sort((left, right) => stableCompare(left.startsAt, right.startsAt) || stableCompare(left.weekId, right.weekId));
  for (let index = 1; index < weeks.length; index += 1) {
    if (weeks[index].startsAt < weeks[index - 1].endsAt) throw new Error('monthly_reputation_overlapping_weeks');
  }
  const ranked = [...weeks].sort((left, right) => right.points - left.points
    || stableCompare(left.endsAt, right.endsAt) || stableCompare(left.weekId, right.weekId));
  const selected = ranked.slice(0, MONTHLY_REPUTATION_LIMITS.selectedWeeks);
  const selectedIds = new Set(selected.map((week) => week.weekId));
  const weeklyPoints = selected.reduce((total, week) => total + week.points, 0);
  const sourceScore = weeklyPoints + input.monthlyPoints + input.quarterlyPoints;
  return Object.freeze({
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    periodPolicyVersion: input.periodPolicyVersion,
    sourceMonth: input.sourceMonth,
    effectiveMonth,
    sourceCutoff: input.sourceCutoff,
    weeks: Object.freeze(weeks.map((week) => Object.freeze({
      ...week,
      selected: selectedIds.has(week.weekId),
      selectionReason: selectedIds.has(week.weekId) ? 'selected_best_four' as const : 'not_selected_best_four' as const,
    }))),
    selectedWeekIds: Object.freeze(selected.map((week) => week.weekId)),
    weeklyPoints,
    monthlyPoints: input.monthlyPoints,
    quarterlyPoints: input.quarterlyPoints,
    sourceScore,
    level: reputationLevelForMonthlyScore(sourceScore),
  });
}
