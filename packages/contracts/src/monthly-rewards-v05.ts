import { calculateMonthlyReputation, MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth,
  reputationInstant, requireSourceMonth, type LockedReputationWeek } from './monthly-reputation-policy.ts';
import { proposedClosingSundayWeeks, PROPOSED_CLOSING_SUNDAY_CALENDAR } from './monthly-reputation-decisions.ts';
import { calculateSecurityMaintenanceV05, type SecurityCoverageV05 } from './monthly-security-v05.ts';
import type { MonthlyMaintenanceEvidence, MonthlyMaintenanceRules } from './monthly-maintenance-policy.ts';
import { previewQuarterlyEmailQualification } from './monthly-quarterly-policy.ts';
import { previewSuggestionQualification, type SuggestionAcceptanceRevision } from './monthly-suggestion-policy.ts';
import { PROSPECTIVE_REPUTATION_CONFIGURATION, type ProspectiveReputationConfiguration } from './monthly-reputation-prospective.ts';

export const MONTHLY_REWARDS_V05 = 'lythaus-monthly-rewards-v0.5-candidate';
export const REWARDS_V05_CALENDAR = Object.freeze({ version: 'closing-sunday-utc-v0.5', status: 'approved',
  timezone: 'UTC', startsOn: 'Monday', endsOn: 'Sunday', ownerMonth: 'closing_sunday_month' });
export const REWARDS_V05_CONFIGURATION = Object.freeze({
  version: 'monthly-rewards-v0.5-preparation-v1', policyVersion: MONTHLY_REWARDS_V05,
  runtimeActivationAllowed: false as const, settlementHours: 72, settlementWindowStatus: 'provisional' as const,
  finalMaximumSourceMonth: null, prospectiveFrom: null as string | null, firstSourceMonth: null as string | null,
  weeklyRulesVersion: null as string | null, maintenanceRulesVersion: null as string | null,
  quarterly: PROSPECTIVE_REPUTATION_CONFIGURATION,
});
export interface RewardsV05Configuration {
  version: string; policyVersion: string; runtimeActivationAllowed: false;
  settlementHours: number; settlementWindowStatus: 'provisional'; finalMaximumSourceMonth: null;
  prospectiveFrom: string | null; firstSourceMonth: string | null;
  weeklyRulesVersion: string | null; maintenanceRulesVersion: string | null;
  quarterly: ProspectiveReputationConfiguration;
}
export function validateRewardsV05Configuration(value: RewardsV05Configuration): void {
  if (!value || value.version !== REWARDS_V05_CONFIGURATION.version || value.policyVersion !== MONTHLY_REWARDS_V05
    || value.runtimeActivationAllowed !== false || value.settlementWindowStatus !== 'provisional'
    || value.finalMaximumSourceMonth !== null || !Number.isSafeInteger(value.settlementHours)
    || value.settlementHours < 1 || value.settlementHours > 720 || !value.quarterly) {
    throw new Error('monthly_rewards_v05_configuration_invalid');
  }
  if (value.prospectiveFrom !== null) reputationInstant(value.prospectiveFrom);
  if (value.firstSourceMonth !== null) {
    requireSourceMonth(value.firstSourceMonth);
    if (!value.prospectiveFrom || value.firstSourceMonth < value.prospectiveFrom.slice(0, 7)) {
      throw new Error('monthly_rewards_v05_cutover_invalid');
    }
  }
}
export function calculateMonthlyRewardsV05(input: {
  subjectUserId: string; sourceMonth: string; evaluatedAt: string; configuration: RewardsV05Configuration;
  weeks: readonly LockedReputationWeek[]; maintenanceRules: MonthlyMaintenanceRules;
  evidence: readonly MonthlyMaintenanceEvidence[]; securityCoverage: readonly SecurityCoverageV05[];
  suggestionRevisions: readonly SuggestionAcceptanceRevision[]; ingestionComplete: boolean;
}) {
  const config = input.configuration;
  validateRewardsV05Configuration(config);
  requireSourceMonth(input.sourceMonth);
  const evaluated = reputationInstant(input.evaluatedAt);
  const effectiveMonth = nextReputationMonth(input.sourceMonth);
  const cutoffAt = `${effectiveMonth}-01T00:00:00.000Z`, cutoff = reputationInstant(cutoffAt);
  const settlementCandidateAt = new Date(cutoff + config.settlementHours * 3_600_000).toISOString();
  if (!config.firstSourceMonth || !config.prospectiveFrom || input.sourceMonth < config.firstSourceMonth
    || evaluated < reputationInstant(config.prospectiveFrom)) return null;
  const security = calculateSecurityMaintenanceV05({ ...input, rules: input.maintenanceRules, coverage: input.securityCoverage });
  const inherited = calculateMonthlyReputation({ policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    sourceMonth: input.sourceMonth, sourceCutoff: cutoffAt, periodPolicyVersion: PROPOSED_CLOSING_SUNDAY_CALENDAR.version,
    weeks: input.weeks, monthlyPoints: security.monthlyPoints, quarterlyPoints: 0 }, input.evaluatedAt);
  const email = previewQuarterlyEmailQualification({ ...input, configuration: config.quarterly }, input.evaluatedAt);
  const suggestion = previewSuggestionQualification({ ...input, revisions: input.suggestionRevisions,
    configuration: config.quarterly }, input.evaluatedAt);
  const quarterlyComplete = ['completion_required', 'completion_before_cutover', 'scoring_quarter_expired',
    'revoked_at_source_cutoff', 'qualified_at_source_cutoff_activation_pending'].includes(email.reason)
    && ['no_accepted_evidence', 'not_in_qualifying_month', 'reversed', 'qualification_candidate_activation_pending'].includes(suggestion.reason);
  const emailPoints = email.qualifies ? 1_000 : 0, suggestionPoints = suggestion.qualifies ? 150 : 0;
  const quarterlyPoints = emailPoints + suggestionPoints;
  const sourceScore = inherited.sourceScore + quarterlyPoints;
  const level = sourceScore >= 10_000 ? 5 : sourceScore >= 6_000 ? 4 : sourceScore >= 3_000 ? 3 : sourceScore >= 1_000 ? 2 : 1;
  const maximumForCurrentComponents = 4 * 2_500 + 2_500 + 1_000 + 150;
  if (!Number.isSafeInteger(sourceScore) || sourceScore < 0 || sourceScore > maximumForCurrentComponents) {
    throw new Error('monthly_rewards_v05_score_invalid');
  }
  const periods = proposedClosingSundayWeeks(input.sourceMonth);
  return Object.freeze({ policyVersion: MONTHLY_REWARDS_V05, configurationVersion: config.version,
    sourceMonth: input.sourceMonth, effectiveMonth, sourceCutoff: cutoffAt,
    state: 'provisional' as const, redeemable: false as const, runtimeActivationAllowed: false as const, appliedPoints: 0 as const,
    calendar: REWARDS_V05_CALENDAR, settlementHours: config.settlementHours, settlementWindowStatus: config.settlementWindowStatus,
    settlementCandidateAt, settlementState: evaluated < reputationInstant(settlementCandidateAt) ? 'settling' as const
      : !input.ingestionComplete || !quarterlyComplete ? 'evidence_pending' as const : 'candidate_complete' as const,
    finalMaximumSourceMonth: null, maximumForCurrentComponents, sourceScore, level,
    weeklyPoints: inherited.weeklyPoints, monthlyPoints: security.monthlyPoints, quarterlyPoints, emailPoints, suggestionPoints,
    selectedWeekIds: inherited.selectedWeekIds, security,
    missingWeekCount: periods.filter(period => !input.weeks.some(week => week.startsAt === period.startsAt)).length,
    finalisationBlockers: ['settlement_window_validation_pending', 'snapshot_and_activation_approval_pending',
      ...(!input.ingestionComplete ? ['ingestion_incomplete'] : []),
      ...(!quarterlyComplete ? ['quarterly_evidence_pending'] : []),
      ...(email.reason === 'configuration_pending' || suggestion.reason === 'configuration_pending' ? ['quarterly_configuration_pending'] : []),
      ...(security.categories.some(row => row.state === 'unavailable' || row.reasonCode === 'coverage_producer_unavailable')
        ? ['security_evidence_producer_unavailable'] : [])],
  });
}
export type MonthlyRewardsV05Candidate = NonNullable<ReturnType<typeof calculateMonthlyRewardsV05>>;

export function projectRewardsV05Candidate(candidate: MonthlyRewardsV05Candidate) {
  requireSourceMonth(candidate.sourceMonth);
  if (candidate.policyVersion !== MONTHLY_REWARDS_V05 || candidate.state !== 'provisional'
    || candidate.redeemable !== false || candidate.runtimeActivationAllowed !== false || candidate.appliedPoints !== 0
    || candidate.effectiveMonth !== nextReputationMonth(candidate.sourceMonth)
    || candidate.finalMaximumSourceMonth !== null || candidate.maximumForCurrentComponents !== 13_650
    || !Number.isSafeInteger(candidate.sourceScore) || candidate.sourceScore < 0 || candidate.sourceScore > 13_650
    || candidate.level !== (candidate.sourceScore >= 10_000 ? 5 : candidate.sourceScore >= 6_000 ? 4
      : candidate.sourceScore >= 3_000 ? 3 : candidate.sourceScore >= 1_000 ? 2 : 1)
    || candidate.settlementWindowStatus !== 'provisional'
    || !['settling', 'evidence_pending', 'candidate_complete'].includes(candidate.settlementState)) {
    throw new Error('monthly_rewards_v05_projection_invalid');
  }
  reputationInstant(candidate.settlementCandidateAt);
  return { policyVersion: MONTHLY_REWARDS_V05, state: 'provisional' as const, sourceMonth: candidate.sourceMonth,
    effectiveMonth: candidate.effectiveMonth, sourceScore: candidate.sourceScore, level: candidate.level,
    weeklyPoints: candidate.weeklyPoints, monthlyPoints: candidate.monthlyPoints, quarterlyPoints: candidate.quarterlyPoints,
    settlementHours: candidate.settlementHours, settlementCandidateAt: candidate.settlementCandidateAt,
    settlementWindowStatus: candidate.settlementWindowStatus, settlementState: candidate.settlementState,
    finalMaximumSourceMonth: candidate.finalMaximumSourceMonth, maximumForCurrentComponents: candidate.maximumForCurrentComponents,
    redeemable: false as const, runtimeActivationAllowed: false as const, appliedPoints: 0 as const };
}
