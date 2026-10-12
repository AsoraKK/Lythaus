import {
  calculateMonthlyReputation, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_BANDS,
  nextReputationMonth, reputationInstant, requireSourceMonth, reputationLevelForMonthlyScore,
  type MonthlyReputationInput,
} from './monthly-reputation-policy.ts';
import { previewQuarterlyEmailQualification } from './monthly-quarterly-policy.ts';
import {
  SUGGESTION_PREVIEW_CONFIGURATION, previewSuggestionQualification,
  type SuggestionPreviewConfiguration, type SuggestionAcceptanceRevision,
} from './monthly-suggestion-policy.ts';
import type { MonthlyMaintenanceEvidence } from './monthly-maintenance-policy.ts';

export const PROSPECTIVE_REPUTATION_POLICY_VERSION = 'lythaus-monthly-rewards-2026-10-v2';
export const PROSPECTIVE_REPUTATION_CATALOGUE_HASH = '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67';
export const PROSPECTIVE_REPUTATION_ALLOCATION_VERSION = 'quarterly-suggestion-additive-allocation-2026-10-07-v4';
export const PROSPECTIVE_REPUTATION_ALLOCATION_APPROVED_AT = '2026-10-07T20:12:31.000Z';

export const PROSPECTIVE_REPUTATION_REPORT_LIMITS = Object.freeze({
  weeklyMaximumPerWeek: 2_500,
  selectedWeekLimit: 4,
  maximumSelectedWeeklyPoints: 10_000,
  monthlyMaximumPoints: 2_500,
  emailMaximumPoints: 1_000,
  suggestionMaximumPoints: 150,
  quarterlyMaximumPoints: 1_150,
  maximumSourceMonth: 13_650,
});

export const PROSPECTIVE_REPUTATION_BANDS = Object.freeze([
  ...MONTHLY_REPUTATION_BANDS.slice(0, 4),
  Object.freeze({ level: 5 as const, minimum: 10_000, maximum: 13_650 }),
]);

export interface ProspectiveReputationConfiguration extends SuggestionPreviewConfiguration {
  scoringPolicyVersion: typeof PROSPECTIVE_REPUTATION_POLICY_VERSION;
  scoringCatalogueHash: typeof PROSPECTIVE_REPUTATION_CATALOGUE_HASH;
  scoringAmendmentVersion: typeof PROSPECTIVE_REPUTATION_ALLOCATION_VERSION;
  firstSourceMonth: string | null;
}

export const PROSPECTIVE_REPUTATION_CONFIGURATION: Readonly<ProspectiveReputationConfiguration> = Object.freeze({
  ...SUGGESTION_PREVIEW_CONFIGURATION,
  scoringPolicyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION,
  scoringCatalogueHash: PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
  scoringAmendmentVersion: PROSPECTIVE_REPUTATION_ALLOCATION_VERSION,
  firstSourceMonth: null,
});

export function prospectiveReputationLevelForScore(score: number) {
  if (!Number.isSafeInteger(score) || score < 0 || score > PROSPECTIVE_REPUTATION_REPORT_LIMITS.maximumSourceMonth) {
    throw new Error('prospective_reputation_score_invalid');
  }
  return score > 13_500 ? 5 as const : reputationLevelForMonthlyScore(score);
}

export function previewProspectiveMonthlyReputation(input: {
  subjectUserId: string;
  source: Omit<MonthlyReputationInput, 'quarterlyPoints'>;
  emailEvidence: readonly MonthlyMaintenanceEvidence[];
  suggestionRevisions: readonly SuggestionAcceptanceRevision[];
  configuration: ProspectiveReputationConfiguration;
}, evaluatedAt: string) {
  const sourceMonth = requireSourceMonth(input.source.sourceMonth);
  const effectiveMonth = nextReputationMonth(sourceMonth);
  const configuration = input.configuration;
  const header = Object.freeze({
    policyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION,
    catalogueHash: PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
    allocationAmendmentVersion: PROSPECTIVE_REPUTATION_ALLOCATION_VERSION,
    inheritedValidationPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    mode: 'proposal_preview' as const, sourceMonth, effectiveMonth,
    reportLimits: PROSPECTIVE_REPUTATION_REPORT_LIMITS,
    appliedPoints: 0 as const, runtimeActivationAllowed: false as const,
  });
  if (!configuration || configuration.runtimeActivationAllowed !== false
    || configuration.scoringPolicyVersion !== PROSPECTIVE_REPUTATION_POLICY_VERSION
    || configuration.scoringCatalogueHash !== PROSPECTIVE_REPUTATION_CATALOGUE_HASH
    || configuration.scoringAmendmentVersion !== PROSPECTIVE_REPUTATION_ALLOCATION_VERSION) {
    throw new Error('prospective_reputation_configuration_invalid');
  }
  if (configuration.prospectiveFrom === null || configuration.firstSourceMonth === null
    || !configuration.rubricVersion || !configuration.authorityVersion) {
    return Object.freeze({ ...header, reason: 'configuration_pending' as const, proposedCalculation: null });
  }
  if (reputationInstant(configuration.prospectiveFrom) < reputationInstant(PROSPECTIVE_REPUTATION_ALLOCATION_APPROVED_AT)) {
    throw new Error('prospective_reputation_cutover_not_prospective');
  }
  requireSourceMonth(configuration.firstSourceMonth);
  if (configuration.firstSourceMonth < configuration.prospectiveFrom.slice(0, 7)) {
    throw new Error('prospective_reputation_first_source_month_invalid');
  }
  if (sourceMonth < configuration.firstSourceMonth) {
    return Object.freeze({ ...header, reason: 'policy_not_effective_for_source_month' as const, proposedCalculation: null });
  }
  const inherited = calculateMonthlyReputation({ ...input.source, quarterlyPoints: 0 }, evaluatedAt);
  const email = previewQuarterlyEmailQualification({ subjectUserId: input.subjectUserId, sourceMonth,
    evidence: input.emailEvidence, configuration }, evaluatedAt);
  const suggestion = previewSuggestionQualification({ subjectUserId: input.subjectUserId, sourceMonth,
    revisions: input.suggestionRevisions, configuration }, evaluatedAt);
  const settledEmailReasons = new Set(['completion_required', 'completion_before_cutover',
    'scoring_quarter_expired', 'revoked_at_source_cutoff', 'qualified_at_source_cutoff_activation_pending']);
  const settledSuggestionReasons = new Set(['no_accepted_evidence', 'not_in_qualifying_month', 'reversed',
    'qualification_candidate_activation_pending']);
  if (!settledEmailReasons.has(email.reason) || !settledSuggestionReasons.has(suggestion.reason)) {
    return Object.freeze({ ...header, reason: 'quarterly_evidence_pending' as const,
      quarterlyQualification: Object.freeze({ email, suggestion }), proposedCalculation: null });
  }
  const emailPoints = email.qualifies ? 1_000 : 0;
  const suggestionPoints = suggestion.qualifies ? 150 : 0;
  const quarterlyPoints = emailPoints + suggestionPoints;
  const sourceScore = inherited.sourceScore + quarterlyPoints;
  return Object.freeze({ ...header, reason: 'complete_preview_activation_pending' as const,
    quarterlyQualification: Object.freeze({ email, suggestion }),
    proposedCalculation: Object.freeze({
      sourceMonth, effectiveMonth, sourceCutoff: inherited.sourceCutoff,
      periodPolicyVersion: inherited.periodPolicyVersion,
      weeks: inherited.weeks, selectedWeekIds: inherited.selectedWeekIds,
      weeklyPoints: inherited.weeklyPoints, monthlyPoints: inherited.monthlyPoints,
      emailPoints, suggestionPoints, quarterlyPoints, sourceScore,
      level: prospectiveReputationLevelForScore(sourceScore),
    }),
  });
}
