import {
  MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION,
  nextReputationMonth, reputationInstant, requireSourceMonth,
} from './monthly-reputation-policy.ts';

export const SUGGESTION_CALENDAR_AMENDMENT_VERSION = 'accepted-useful-suggestion-calendar-quarter-2026-10-07-v2';
export const SUGGESTION_CALENDAR_APPROVED_AT = '2026-10-07T18:15:47.000Z';

export interface SuggestionPreviewConfiguration {
  runtimeActivationAllowed: false;
  policyVersion: typeof MONTHLY_REPUTATION_POLICY_VERSION;
  catalogueHash: typeof MONTHLY_REPUTATION_CATALOGUE_HASH;
  amendmentVersion: typeof SUGGESTION_CALENDAR_AMENDMENT_VERSION;
  prospectiveFrom: string | null;
  rubricVersion: string | null;
  authorityVersion: string | null;
}

export const SUGGESTION_PREVIEW_CONFIGURATION: Readonly<SuggestionPreviewConfiguration> = Object.freeze({
  runtimeActivationAllowed: false,
  policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
  catalogueHash: MONTHLY_REPUTATION_CATALOGUE_HASH,
  amendmentVersion: SUGGESTION_CALENDAR_AMENDMENT_VERSION,
  prospectiveFrom: null, rubricVersion: null, authorityVersion: null,
});

export interface SuggestionAcceptanceRevision {
  eventId: string;
  contributionId: string;
  subjectUserId: string;
  reviewerUserId: string;
  privateEvidenceId: string;
  amendmentVersion: typeof SUGGESTION_CALENDAR_AMENDMENT_VERSION;
  rubricVersion: string;
  authorityVersion: string;
  revision: number;
  predecessorEventId: string | null;
  decision: 'accepted' | 'reversed';
  performedAt: string;
  decidedAt: string;
  useful: boolean;
  independentlyReviewed: boolean;
  manipulationScreened: boolean;
  competingAward: 'none' | 'weekly.accepted_help' | 'weekly.accepted_accessibility';
}

const eventFields = Object.freeze([
  'eventId', 'contributionId', 'subjectUserId', 'reviewerUserId', 'privateEvidenceId',
  'amendmentVersion', 'rubricVersion', 'authorityVersion', 'revision', 'predecessorEventId',
  'decision', 'performedAt', 'decidedAt', 'useful', 'independentlyReviewed',
  'manipulationScreened', 'competingAward',
]);

function requireUuid(value: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('suggestion_evidence_uuid_invalid');
  }
}

export function previewUtcSuggestionWindow(acceptedAt: string) {
  reputationInstant(acceptedAt);
  const completionMonth = requireSourceMonth(acceptedAt.slice(0, 7));
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

type PreviewReason = 'configuration_pending' | 'no_accepted_evidence' | 'evidence_pending'
  | 'not_in_qualifying_month' | 'reversed' | 'correction_timing_pending'
  | 'concurrent_selection_pending' | 'qualification_candidate_allocation_pending';

export function previewSuggestionQualification(input: {
  subjectUserId: string;
  sourceMonth: string;
  revisions: readonly SuggestionAcceptanceRevision[];
  configuration: SuggestionPreviewConfiguration;
}, evaluatedAt: string) {
  requireUuid(input.subjectUserId);
  requireSourceMonth(input.sourceMonth);
  const effectiveMonth = nextReputationMonth(input.sourceMonth);
  const cutoff = reputationInstant(`${effectiveMonth}-01T00:00:00.000Z`);
  const evaluation = reputationInstant(evaluatedAt);
  const result = (reason: PreviewReason) => Object.freeze({
    amendmentVersion: SUGGESTION_CALENDAR_AMENDMENT_VERSION,
    sourceMonth: input.sourceMonth, effectiveMonth, reason,
    qualifies: reason === 'qualification_candidate_allocation_pending',
    confirmedSuggestionPoints: 150 as const, appliedPoints: 0 as const,
    runtimeActivationAllowed: false as const,
  });
  const configuration = input.configuration;
  if (configuration.runtimeActivationAllowed !== false
    || configuration.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION
    || configuration.catalogueHash !== MONTHLY_REPUTATION_CATALOGUE_HASH
    || configuration.amendmentVersion !== SUGGESTION_CALENDAR_AMENDMENT_VERSION) {
    throw new Error('suggestion_preview_configuration_invalid');
  }
  if (configuration.prospectiveFrom === null || !configuration.rubricVersion || !configuration.authorityVersion) {
    return result('configuration_pending');
  }
  const prospectiveFrom = reputationInstant(configuration.prospectiveFrom);
  if (prospectiveFrom < reputationInstant(SUGGESTION_CALENDAR_APPROVED_AT)) {
    throw new Error('suggestion_preview_cutover_not_prospective');
  }
  if (evaluation < prospectiveFrom) return result('configuration_pending');
  if (!Array.isArray(input.revisions)) throw new Error('suggestion_evidence_invalid');
  const events = new Map<string, string>();
  const histories = new Map<string, SuggestionAcceptanceRevision[]>();
  for (const revision of input.revisions) {
    if (!revision || Object.keys(revision).length !== eventFields.length
      || eventFields.some(field => !Object.hasOwn(revision, field))) throw new Error('suggestion_evidence_invalid');
    for (const value of [revision.eventId, revision.contributionId, revision.subjectUserId,
      revision.reviewerUserId, revision.privateEvidenceId]) requireUuid(value);
    if (revision.predecessorEventId !== null) requireUuid(revision.predecessorEventId);
    if (revision.subjectUserId !== input.subjectUserId || revision.reviewerUserId === input.subjectUserId
      || revision.amendmentVersion !== configuration.amendmentVersion
      || revision.rubricVersion !== configuration.rubricVersion || revision.authorityVersion !== configuration.authorityVersion
      || !Number.isSafeInteger(revision.revision) || revision.revision < 1
      || !['accepted', 'reversed'].includes(revision.decision)
      || [revision.useful, revision.independentlyReviewed, revision.manipulationScreened].some(value => typeof value !== 'boolean')
      || !['none', 'weekly.accepted_help', 'weekly.accepted_accessibility'].includes(revision.competingAward)) {
      throw new Error('suggestion_evidence_scope_invalid');
    }
    const decided = reputationInstant(revision.decidedAt);
    if (reputationInstant(revision.performedAt) > decided || decided > evaluation) {
      throw new Error('suggestion_evidence_causality_invalid');
    }
    const signature = JSON.stringify(eventFields.map(field => revision[field as keyof SuggestionAcceptanceRevision]));
    const previous = events.get(revision.eventId);
    if (previous !== undefined) {
      if (previous !== signature) throw new Error('suggestion_evidence_event_conflict');
      continue;
    }
    events.set(revision.eventId, signature);
    const history = histories.get(revision.contributionId) ?? [];
    history.push(revision);
    histories.set(revision.contributionId, history);
  }
  let candidates = 0;
  const pending = new Set<PreviewReason>();
  let reversed = false;
  for (const history of histories.values()) {
    history.sort((left, right) => left.revision - right.revision);
    const first = history[0];
    for (let index = 0; index < history.length; index += 1) {
      const current = history[index];
      const previous = history[index - 1];
      if (previous?.revision === current.revision) throw new Error('suggestion_evidence_revision_conflict');
      if (current.revision !== index + 1 || current.predecessorEventId !== (previous?.eventId ?? null)) {
        pending.add('evidence_pending');
      }
      if (current.performedAt !== first.performedAt || (previous && current.decidedAt < previous.decidedAt)) {
        throw new Error('suggestion_evidence_causality_invalid');
      }
    }
    if (first.decision !== 'accepted') { pending.add('evidence_pending'); continue; }
    const window = previewUtcSuggestionWindow(first.decidedAt);
    if (reputationInstant(first.decidedAt) < prospectiveFrom
      || !window.sourceMonths.some(month => month.sourceMonth === input.sourceMonth)) continue;
    if (history.some(event => !event.useful || !event.independentlyReviewed || !event.manipulationScreened
      || event.competingAward !== 'none')) { pending.add('evidence_pending'); continue; }
    if (history.slice(1).some(event => event.decision === 'accepted')) {
      pending.add('correction_timing_pending'); continue;
    }
    const last = history[history.length - 1];
    if (last.decision === 'reversed') {
      if (reputationInstant(last.decidedAt) >= cutoff) pending.add('correction_timing_pending');
      reversed = true;
      continue;
    }
    candidates += 1;
  }
  for (const reason of ['evidence_pending', 'correction_timing_pending'] as const) {
    if (pending.has(reason)) return result(reason);
  }
  if (candidates > 1 || (candidates > 0 && reversed)) return result('concurrent_selection_pending');
  if (candidates === 1) return result('qualification_candidate_allocation_pending');
  if (reversed) return result('reversed');
  return result(histories.size ? 'not_in_qualifying_month' : 'no_accepted_evidence');
}
