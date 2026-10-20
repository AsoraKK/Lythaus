import type { AuthenticityEvaluation } from './index.ts';
import { isUuidV7 } from './uuid.ts';

export const TEXT_REVIEW_EVIDENCE_VERSION = 'lythaus-text-review-evidence-v1';

export interface TextReviewRevision {
  contentId: string;
  sourceEventId: string;
  bodyHash: string;
  declaredCreationMode: 'human' | 'ai_assisted';
}

export interface TextReviewEvidence {
  schemaVersion: typeof TEXT_REVIEW_EVIDENCE_VERSION;
  applicability: 'evaluation-only';
  contentType: 'post' | 'comment';
  revision: TextReviewRevision;
  policyVersion: 'evaluation-only-v1';
  safety: { state: 'ABSTAIN'; reason: 'SAFETY_NOT_EVALUATED'; thresholdVersion: null };
  authorship: { state: 'ABSTAIN'; reason: 'NO_QUALIFIED_TEXT_AUTHORSHIP_DETECTOR'; thresholdVersion: null };
  reasoning: {
    state: 'NOT_RUN' | 'UNAVAILABLE' | 'OBSERVED_UNQUALIFIED';
    modelVersion: string | null;
    responseHash: string | null;
  };
  decision: 'queue';
  publicationEligible: false;
  discoveryEligible: false;
  reputationEligible: false;
  evidenceHash: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validRevision(revision: TextReviewRevision): boolean {
  return Boolean(revision) && isUuidV7(revision.contentId) && isUuidV7(revision.sourceEventId)
    && typeof revision.bodyHash === 'string' && /^[a-f0-9]{64}$/.test(revision.bodyHash)
    && ['human', 'ai_assisted'].includes(revision.declaredCreationMode);
}

function canonicalEvidence(value: Omit<TextReviewEvidence, 'evidenceHash'>): Omit<TextReviewEvidence, 'evidenceHash'> {
  return { schemaVersion: value.schemaVersion, applicability: value.applicability, contentType: value.contentType,
    revision: { contentId: value.revision.contentId, sourceEventId: value.revision.sourceEventId,
      bodyHash: value.revision.bodyHash, declaredCreationMode: value.revision.declaredCreationMode },
    policyVersion: value.policyVersion,
    safety: { state: value.safety.state, reason: value.safety.reason, thresholdVersion: value.safety.thresholdVersion },
    authorship: { state: value.authorship.state, reason: value.authorship.reason, thresholdVersion: value.authorship.thresholdVersion },
    reasoning: { state: value.reasoning.state, modelVersion: value.reasoning.modelVersion, responseHash: value.reasoning.responseHash },
    decision: value.decision, publicationEligible: value.publicationEligible,
    discoveryEligible: value.discoveryEligible, reputationEligible: value.reputationEligible };
}

export async function verifyTextReviewEvidence(value: TextReviewEvidence): Promise<boolean> {
  if (!value || value.schemaVersion !== TEXT_REVIEW_EVIDENCE_VERSION || value.applicability !== 'evaluation-only'
    || !['post', 'comment'].includes(value.contentType)
    || !validRevision(value.revision) || value.policyVersion !== 'evaluation-only-v1'
    || value.safety?.state !== 'ABSTAIN' || value.safety.reason !== 'SAFETY_NOT_EVALUATED' || value.safety.thresholdVersion !== null
    || value.authorship?.state !== 'ABSTAIN' || value.authorship.reason !== 'NO_QUALIFIED_TEXT_AUTHORSHIP_DETECTOR'
    || value.authorship.thresholdVersion !== null || value.decision !== 'queue'
    || value.publicationEligible !== false || value.discoveryEligible !== false || value.reputationEligible !== false
    || !value.reasoning || !['NOT_RUN', 'UNAVAILABLE', 'OBSERVED_UNQUALIFIED'].includes(value.reasoning.state)) return false;
  if (value.reasoning.state === 'OBSERVED_UNQUALIFIED'
    ? typeof value.reasoning.modelVersion !== 'string' || !value.reasoning.modelVersion || value.reasoning.modelVersion.length > 256
      || typeof value.reasoning.responseHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.reasoning.responseHash)
    : value.reasoning.modelVersion !== null || value.reasoning.responseHash !== null) return false;
  return value.evidenceHash === await sha256(JSON.stringify(canonicalEvidence(value)));
}

function normalizedEvaluation(value: AuthenticityEvaluation): object | null {
  if (!value || value.schemaVersion !== 'lythaus-authenticity-v1' || value.policyVersion !== 'evaluation-only-v1'
    || value.recommendation !== 'review' || value.reviewRequired !== true
    || typeof value.modelId !== 'string' || !value.modelId || value.modelId.length > 256
    || !Number.isFinite(value.riskScore) || value.riskScore < 0 || value.riskScore > 1
    || !Array.isArray(value.signals) || value.signals.length > 20
    || value.signals.some(signal => !signal || typeof signal.category !== 'string' || signal.category.length > 80
      || signal.category === 'model_response_invalid' || !Number.isFinite(signal.confidence)
      || signal.confidence < 0 || signal.confidence > 1 || typeof signal.rationale !== 'string' || signal.rationale.length > 500)) return null;
  return { schemaVersion: value.schemaVersion, policyVersion: value.policyVersion, modelId: value.modelId,
    recommendation: value.recommendation, reviewRequired: value.reviewRequired, riskScore: value.riskScore,
    signals: value.signals.map(signal => ({ category: signal.category, confidence: signal.confidence, rationale: signal.rationale })) };
}

export async function createTextReviewEvidence(input: {
  contentType: 'post' | 'comment';
  revision: TextReviewRevision;
  observation?: { evaluation: AuthenticityEvaluation; modelExecuted: boolean };
}): Promise<TextReviewEvidence> {
  const { revision } = input;
  if (!['post', 'comment'].includes(input.contentType) || !validRevision(revision)) throw new Error('text_review_revision_invalid');
  const binding: TextReviewRevision = { contentId: revision.contentId, sourceEventId: revision.sourceEventId,
    bodyHash: revision.bodyHash, declaredCreationMode: revision.declaredCreationMode };
  const normalized = input.observation?.modelExecuted === true ? normalizedEvaluation(input.observation.evaluation) : null;
  const modelVersion = normalized ? input.observation!.evaluation.modelId : null;
  const contentType = input.contentType;
  const reasoningState = !input.observation ? 'NOT_RUN' : normalized ? 'OBSERVED_UNQUALIFIED' : 'UNAVAILABLE';
  const responseHash = normalized ? await sha256(JSON.stringify(normalized)) : null;
  const evidence: Omit<TextReviewEvidence, 'evidenceHash'> = {
    schemaVersion: TEXT_REVIEW_EVIDENCE_VERSION, applicability: 'evaluation-only', contentType, revision: binding, policyVersion: 'evaluation-only-v1',
    safety: { state: 'ABSTAIN', reason: 'SAFETY_NOT_EVALUATED', thresholdVersion: null },
    authorship: { state: 'ABSTAIN', reason: 'NO_QUALIFIED_TEXT_AUTHORSHIP_DETECTOR', thresholdVersion: null },
    reasoning: { state: reasoningState, modelVersion, responseHash }, decision: 'queue',
    publicationEligible: false, discoveryEligible: false, reputationEligible: false,
  };
  return { ...evidence, evidenceHash: await sha256(JSON.stringify(canonicalEvidence(evidence))) };
}
