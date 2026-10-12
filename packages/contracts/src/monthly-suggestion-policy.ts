import {
  nextReputationMonth, reputationInstant, requireSourceMonth,
} from './monthly-reputation-policy.ts';
import {
  QUARTERLY_CALENDAR_AMENDMENT_VERSION, QUARTERLY_CALENDAR_APPROVED_AT, QUARTERLY_PREVIEW_CONFIGURATION,
  quarterlyPreviewReady, previewUtcQuarterlyWindow, previewQuarterlyCompletion,
  type QuarterlyPreviewConfiguration,
} from './monthly-quarterly-policy.ts';

export const SUGGESTION_CALENDAR_AMENDMENT_VERSION = QUARTERLY_CALENDAR_AMENDMENT_VERSION;
export const SUGGESTION_CALENDAR_APPROVED_AT = QUARTERLY_CALENDAR_APPROVED_AT;

export interface SuggestionPreviewConfiguration extends QuarterlyPreviewConfiguration {
  rubricVersion: string | null;
  authorityVersion: string | null;
}

export const SUGGESTION_PREVIEW_CONFIGURATION: Readonly<SuggestionPreviewConfiguration> = Object.freeze({
  ...QUARTERLY_PREVIEW_CONFIGURATION, rubricVersion: null, authorityVersion: null,
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
  return previewUtcQuarterlyWindow(acceptedAt);
}

type PreviewReason = 'configuration_pending' | 'no_accepted_evidence' | 'evidence_pending'
  | 'not_in_qualifying_month' | 'reversed' | 'correction_timing_pending'
  | 'source_not_closed' | 'concurrent_selection_pending' | 'qualification_candidate_activation_pending';

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
    qualifies: reason === 'qualification_candidate_activation_pending',
    confirmedSuggestionPoints: 150 as const, appliedPoints: 0 as const,
    runtimeActivationAllowed: false as const,
  });
  const configuration = input.configuration;
  if (!quarterlyPreviewReady(configuration, evaluatedAt) || !configuration.rubricVersion || !configuration.authorityVersion) {
    return result('configuration_pending');
  }
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
    const qualification = previewQuarterlyCompletion({ sourceMonth: input.sourceMonth,
      completion: { completedAt: first.decidedAt, revokedAt: null }, configuration }, evaluatedAt);
    if (qualification.reason === 'source_not_closed') pending.add('source_not_closed');
    if (!qualification.qualifies) continue;
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
  for (const reason of ['evidence_pending', 'correction_timing_pending', 'source_not_closed'] as const) {
    if (pending.has(reason)) return result(reason);
  }
  if (candidates > 1 || (candidates > 0 && reversed)) return result('concurrent_selection_pending');
  if (candidates === 1) return result('qualification_candidate_activation_pending');
  if (reversed) return result('reversed');
  return result(histories.size ? 'not_in_qualifying_month' : 'no_accepted_evidence');
}
