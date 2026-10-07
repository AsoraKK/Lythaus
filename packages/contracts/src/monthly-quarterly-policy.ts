import {
  MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_LIMITS,
  nextReputationMonth, reputationInstant, requireSourceMonth,
} from './monthly-reputation-policy.ts';
import type { MonthlyMaintenanceEvidence } from './monthly-maintenance-policy.ts';

export const QUARTERLY_CALENDAR_AMENDMENT_VERSION = 'all-quarterly-scoring-calendar-quarter-2026-10-07-v3';
export const QUARTERLY_CALENDAR_APPROVED_AT = '2026-10-07T20:00:03.000Z';

export interface QuarterlyPreviewConfiguration {
  runtimeActivationAllowed: false;
  policyVersion: typeof MONTHLY_REPUTATION_POLICY_VERSION;
  catalogueHash: typeof MONTHLY_REPUTATION_CATALOGUE_HASH;
  amendmentVersion: typeof QUARTERLY_CALENDAR_AMENDMENT_VERSION;
  prospectiveFrom: string | null;
}

export const QUARTERLY_PREVIEW_CONFIGURATION: Readonly<QuarterlyPreviewConfiguration> = Object.freeze({
  runtimeActivationAllowed: false,
  policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
  catalogueHash: MONTHLY_REPUTATION_CATALOGUE_HASH,
  amendmentVersion: QUARTERLY_CALENDAR_AMENDMENT_VERSION,
  prospectiveFrom: null,
});

export const QUARTERLY_ALLOCATION_GATE = Object.freeze({
  status: 'owner_confirmed_pending_activation' as const,
  confirmedEmailAllowance: 1_000,
  confirmedSuggestionAllowance: 150,
  existingQuarterlyMaximum: MONTHLY_REPUTATION_LIMITS.quarterly,
  existingSourceMaximum: MONTHLY_REPUTATION_LIMITS.sourceMonth,
  combinedNominalAllowance: 1_150,
  approvedQuarterlyMaximum: 1_150,
  approvedSourceMaximum: 13_650,
  unresolvedExcess: 0,
  runtimeActivationAllowed: false,
});

export function quarterlyPreviewReady(configuration: QuarterlyPreviewConfiguration, evaluatedAt: string): boolean {
  const evaluation = reputationInstant(evaluatedAt);
  if (!configuration || configuration.runtimeActivationAllowed !== false
    || configuration.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION
    || configuration.catalogueHash !== MONTHLY_REPUTATION_CATALOGUE_HASH
    || configuration.amendmentVersion !== QUARTERLY_CALENDAR_AMENDMENT_VERSION) {
    throw new Error('quarterly_preview_configuration_invalid');
  }
  if (configuration.prospectiveFrom === null) return false;
  const prospectiveFrom = reputationInstant(configuration.prospectiveFrom);
  if (prospectiveFrom < reputationInstant(QUARTERLY_CALENDAR_APPROVED_AT)) {
    throw new Error('quarterly_preview_cutover_not_prospective');
  }
  return evaluation >= prospectiveFrom;
}

export function previewUtcQuarterlyWindow(completedAt: string) {
  reputationInstant(completedAt);
  const completionMonth = requireSourceMonth(completedAt.slice(0, 7));
  const year = Number(completionMonth.slice(0, 4));
  const month = Number(completionMonth.slice(5));
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const quarterStartsAt = `${year}-${String(firstMonth).padStart(2, '0')}-01T00:00:00.000Z`;
  const finalMonth = `${year}-${String(firstMonth + 2).padStart(2, '0')}`;
  const quarterEndsAt = `${nextReputationMonth(finalMonth)}-01T00:00:00.000Z`;
  const sourceMonths = Array.from({ length: firstMonth + 3 - month }, (_, offset) => {
    const sourceMonth = `${year}-${String(month + offset).padStart(2, '0')}`;
    return Object.freeze({ sourceMonth, effectiveMonth: nextReputationMonth(sourceMonth) });
  });
  return Object.freeze({ calendarBasis: 'UTC-preview' as const, completionMonth, quarterStartsAt,
    quarterEndsAt, sourceMonths: Object.freeze(sourceMonths) });
}

type QuarterlyPreviewReason = 'configuration_pending' | 'completion_required' | 'completion_before_cutover'
  | 'source_not_closed' | 'completed_after_source_cutoff' | 'scoring_quarter_expired'
  | 'revoked_at_source_cutoff' | 'qualified_at_source_cutoff_activation_pending';

export function previewQuarterlyCompletion(input: {
  sourceMonth: string;
  completion: { completedAt: string; revokedAt: string | null } | null;
  configuration: QuarterlyPreviewConfiguration;
}, evaluatedAt: string) {
  requireSourceMonth(input.sourceMonth);
  const effectiveMonth = nextReputationMonth(input.sourceMonth);
  const cutoffAt = `${effectiveMonth}-01T00:00:00.000Z`;
  const cutoff = reputationInstant(cutoffAt);
  const evaluation = reputationInstant(evaluatedAt);
  const result = (reason: QuarterlyPreviewReason, validFrom: string | null = null, validUntil: string | null = null) => Object.freeze({
    amendmentVersion: QUARTERLY_CALENDAR_AMENDMENT_VERSION,
    sourceMonth: input.sourceMonth, sourceCutoff: cutoffAt, effectiveMonth, reason,
    qualifies: reason === 'qualified_at_source_cutoff_activation_pending', validFrom, validUntil,
    appliedPoints: 0 as const, runtimeActivationAllowed: false as const,
  });
  if (!quarterlyPreviewReady(input.configuration, evaluatedAt)) return result('configuration_pending');
  if (!input.completion) return result('completion_required');
  const completed = reputationInstant(input.completion.completedAt);
  const revoked = input.completion.revokedAt === null ? null : reputationInstant(input.completion.revokedAt);
  if (completed > evaluation || (revoked !== null && (revoked < completed || revoked > evaluation))) {
    throw new Error('quarterly_completion_causality_invalid');
  }
  const window = previewUtcQuarterlyWindow(input.completion.completedAt);
  const from = input.completion.completedAt, until = window.quarterEndsAt;
  if (completed < reputationInstant(input.configuration.prospectiveFrom!)) return result('completion_before_cutover', from, until);
  if (evaluation < cutoff) return result('source_not_closed', from, until);
  if (completed >= cutoff) return result('completed_after_source_cutoff', from, until);
  if (input.sourceMonth > window.sourceMonths[window.sourceMonths.length - 1].sourceMonth) return result('scoring_quarter_expired', from, until);
  if (revoked !== null && revoked < cutoff) return result('revoked_at_source_cutoff', from, until);
  return result('qualified_at_source_cutoff_activation_pending', from, until);
}

function requireEvidenceUuid(value: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('quarterly_email_evidence_invalid');
  }
}

export function previewQuarterlyEmailQualification(input: {
  subjectUserId: string;
  sourceMonth: string;
  evidence: readonly MonthlyMaintenanceEvidence[];
  configuration: QuarterlyPreviewConfiguration;
}, evaluatedAt: string) {
  requireEvidenceUuid(input.subjectUserId);
  const empty = previewQuarterlyCompletion({ ...input, completion: null }, evaluatedAt);
  const finish = (qualification: ReturnType<typeof previewQuarterlyCompletion>) => Object.freeze({
    ...qualification, component: 'quarterly.email_control' as const,
    confirmedAllowance: 1_000 as const,
    renewalRequired: ['completion_required', 'completion_before_cutover', 'scoring_quarter_expired',
      'revoked_at_source_cutoff'].includes(qualification.reason),
  });
  if (empty.reason === 'configuration_pending') return finish(empty);
  if (!Array.isArray(input.evidence)) throw new Error('quarterly_email_evidence_invalid');
  const seen = new Map<string, string>();
  const receipts: MonthlyMaintenanceEvidence[] = [];
  for (const evidence of input.evidence) {
    if (!evidence || evidence.subjectUserId !== input.subjectUserId) throw new Error('quarterly_email_evidence_scope_invalid');
    if (evidence.facts?.kind !== 'email_control') continue;
    requireEvidenceUuid(evidence.id);
    requireEvidenceUuid(evidence.facts.emailVersion);
    if (Object.keys(evidence.facts).length !== 2 || !Object.hasOwn(evidence.facts, 'emailVersion')) {
      throw new Error('quarterly_email_evidence_invalid');
    }
    const completed = reputationInstant(evidence.performedAt);
    const revoked = evidence.revokedAt === null ? null : reputationInstant(evidence.revokedAt);
    if (completed > reputationInstant(evaluatedAt)
      || (revoked !== null && (revoked < completed || revoked > reputationInstant(evaluatedAt)))) {
      throw new Error('quarterly_completion_causality_invalid');
    }
    const signature = JSON.stringify([evidence.subjectUserId, evidence.performedAt, evidence.revokedAt, evidence.facts.emailVersion]);
    const previous = seen.get(evidence.id);
    if (previous !== undefined) {
      if (signature !== previous) throw new Error('quarterly_email_evidence_conflict');
      continue;
    }
    seen.set(evidence.id, signature);
    if (completed < reputationInstant(empty.sourceCutoff)) receipts.push(evidence);
  }
  receipts.sort((left, right) => left.performedAt.localeCompare(right.performedAt) || left.id.localeCompare(right.id));
  const receipt = receipts.at(-1);
  return finish(previewQuarterlyCompletion({ ...input, completion: receipt
    ? { completedAt: receipt.performedAt, revokedAt: receipt.revokedAt } : null }, evaluatedAt));
}
