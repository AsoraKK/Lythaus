import { inspectMedia, sha256Hex } from './forensics.ts';
import { detectMediaMime, MAX_IMAGE_PIXELS, MAX_MEDIA_BYTES } from './media-intake.ts';

export const IMAGE_REVIEW_EVIDENCE_VERSION = 'lythaus-image-review-evidence-v1' as const;

export interface ImageReviewBinding {
  ownerId: string;
  uploadSessionId: string;
  sourceEventId: string;
  objectId: string;
  sourceSha256: string;
  sourceContentType: string;
  sourceBytes: number;
  derivativeSha256: string;
  derivativeBytes: number;
  width: number;
  height: number;
  transformVersion: 'standard-webp-v1' | 'standard-webp-v2';
}

export interface ImageReviewEvidence {
  schemaVersion: typeof IMAGE_REVIEW_EVIDENCE_VERSION;
  policyVersion: 'evaluation-only-v1';
  binding: ImageReviewBinding;
  provenance: {
    state: 'OBSERVED_UNVERIFIED' | 'UNAVAILABLE';
    exifPresent: boolean | null;
    xmpPresent: boolean | null;
    c2pa: 'PRESENT_UNVERIFIED' | 'ABSENT' | 'UNKNOWN';
    cameraOrigin: 'UNKNOWN';
  };
  safety: { state: 'NOT_RUN'; authority: 'SAFETY_ONLY' };
  authorship: {
    state: 'ABSTAIN';
    specialistState: 'NOT_RUN';
    reason: 'NO_QUALIFIED_IMAGE_AUTHORSHIP_DETECTOR';
    thresholdVersion: null;
  };
  reasoning: { state: 'NOT_RUN'; reason: 'SPECIALIST_EVIDENCE_UNAVAILABLE' };
  policy: {
    outcome: 'review_required';
    publicationEligible: false;
    reputationEligible: false;
    enforcementAuthority: false;
  };
  evidenceHash: string;
}

function validBinding(binding: ImageReviewBinding): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Boolean(binding) && [binding.ownerId, binding.uploadSessionId, binding.sourceEventId, binding.objectId]
    .every(value => typeof value === 'string' && uuid.test(value))
    && [binding.sourceSha256, binding.derivativeSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    && ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(binding.sourceContentType)
    && [binding.sourceBytes, binding.derivativeBytes, binding.width, binding.height].every(value => Number.isSafeInteger(value) && value > 0)
    && binding.sourceBytes <= MAX_MEDIA_BYTES && binding.derivativeBytes <= binding.sourceBytes
    && binding.width * binding.height <= MAX_IMAGE_PIXELS
    && ['standard-webp-v1', 'standard-webp-v2'].includes(binding.transformVersion);
}

function canonicalEvidence(value: Omit<ImageReviewEvidence, 'evidenceHash'>): Omit<ImageReviewEvidence, 'evidenceHash'> {
  const binding = value.binding;
  return {
    schemaVersion: value.schemaVersion, policyVersion: value.policyVersion,
    binding: { ownerId: binding.ownerId, uploadSessionId: binding.uploadSessionId, sourceEventId: binding.sourceEventId,
      objectId: binding.objectId, sourceSha256: binding.sourceSha256, sourceContentType: binding.sourceContentType,
      sourceBytes: binding.sourceBytes, derivativeSha256: binding.derivativeSha256, derivativeBytes: binding.derivativeBytes,
      width: binding.width, height: binding.height, transformVersion: binding.transformVersion },
    provenance: { state: value.provenance.state, exifPresent: value.provenance.exifPresent,
      xmpPresent: value.provenance.xmpPresent, c2pa: value.provenance.c2pa, cameraOrigin: value.provenance.cameraOrigin },
    safety: { state: value.safety.state, authority: value.safety.authority },
    authorship: { state: value.authorship.state, specialistState: value.authorship.specialistState,
      reason: value.authorship.reason, thresholdVersion: value.authorship.thresholdVersion },
    reasoning: { state: value.reasoning.state, reason: value.reasoning.reason },
    policy: { outcome: value.policy.outcome, publicationEligible: value.policy.publicationEligible,
      reputationEligible: value.policy.reputationEligible, enforcementAuthority: value.policy.enforcementAuthority },
  };
}

async function evidenceHash(value: Omit<ImageReviewEvidence, 'evidenceHash'>): Promise<string> {
  return sha256Hex(new TextEncoder().encode(JSON.stringify(canonicalEvidence(value))));
}

export async function createImageReviewEvidence(input: {
  binding: ImageReviewBinding;
  sourceBytes: Uint8Array | null;
  derivativeBytes: Uint8Array;
}): Promise<ImageReviewEvidence> {
  const binding = { ...input.binding };
  const { sourceBytes, derivativeBytes } = input;
  if (!validBinding(binding)) throw new Error('image_review_binding_invalid');
  if (derivativeBytes.byteLength !== binding.derivativeBytes || detectMediaMime(derivativeBytes) !== 'image/webp') {
    throw new Error('image_review_derivative_changed');
  }
  if (sourceBytes !== null && (sourceBytes.byteLength !== binding.sourceBytes
    || detectMediaMime(sourceBytes) !== binding.sourceContentType)) throw new Error('image_review_source_changed');
  const metadata = sourceBytes === null ? null : inspectMedia(sourceBytes, binding.sourceContentType).metadata;
  const [derivativeHash, sourceHash] = await Promise.all([
    sha256Hex(derivativeBytes), sourceBytes === null ? null : sha256Hex(sourceBytes),
  ]);
  if (derivativeHash !== binding.derivativeSha256) throw new Error('image_review_derivative_changed');
  if (sourceHash !== null && sourceHash !== binding.sourceSha256) throw new Error('image_review_source_changed');
  const evidence: Omit<ImageReviewEvidence, 'evidenceHash'> = {
    schemaVersion: IMAGE_REVIEW_EVIDENCE_VERSION, policyVersion: 'evaluation-only-v1', binding,
    provenance: { state: metadata ? 'OBSERVED_UNVERIFIED' : 'UNAVAILABLE', exifPresent: metadata?.exifPresent ?? null,
      xmpPresent: metadata?.xmpPresent ?? null, c2pa: metadata?.c2pa?.status === 'PRESENT_UNVERIFIED'
        ? 'PRESENT_UNVERIFIED' : metadata ? 'ABSENT' : 'UNKNOWN', cameraOrigin: 'UNKNOWN' },
    safety: { state: 'NOT_RUN', authority: 'SAFETY_ONLY' },
    authorship: { state: 'ABSTAIN', specialistState: 'NOT_RUN', reason: 'NO_QUALIFIED_IMAGE_AUTHORSHIP_DETECTOR', thresholdVersion: null },
    reasoning: { state: 'NOT_RUN', reason: 'SPECIALIST_EVIDENCE_UNAVAILABLE' },
    policy: { outcome: 'review_required', publicationEligible: false, reputationEligible: false, enforcementAuthority: false },
  };
  return { ...canonicalEvidence(evidence), evidenceHash: await evidenceHash(evidence) };
}

export async function verifyImageReviewEvidence(value: ImageReviewEvidence, expected: ImageReviewBinding): Promise<boolean> {
  if (!value || !validBinding(expected) || !validBinding(value.binding)
    || value.schemaVersion !== IMAGE_REVIEW_EVIDENCE_VERSION || value.policyVersion !== 'evaluation-only-v1'
    || Object.keys(expected).some(key => expected[key as keyof ImageReviewBinding] !== value.binding[key as keyof ImageReviewBinding])
    || value.provenance?.cameraOrigin !== 'UNKNOWN'
    || !['OBSERVED_UNVERIFIED', 'UNAVAILABLE'].includes(value.provenance.state)
    || (value.provenance.state === 'UNAVAILABLE'
      ? value.provenance.exifPresent !== null || value.provenance.xmpPresent !== null || value.provenance.c2pa !== 'UNKNOWN'
      : typeof value.provenance.exifPresent !== 'boolean' || typeof value.provenance.xmpPresent !== 'boolean'
        || !['PRESENT_UNVERIFIED', 'ABSENT'].includes(value.provenance.c2pa))
    || value.safety?.state !== 'NOT_RUN' || value.safety.authority !== 'SAFETY_ONLY'
    || value.authorship?.state !== 'ABSTAIN' || value.authorship.specialistState !== 'NOT_RUN'
    || value.authorship.reason !== 'NO_QUALIFIED_IMAGE_AUTHORSHIP_DETECTOR' || value.authorship.thresholdVersion !== null
    || value.reasoning?.state !== 'NOT_RUN' || value.reasoning.reason !== 'SPECIALIST_EVIDENCE_UNAVAILABLE'
    || value.policy?.outcome !== 'review_required' || value.policy.publicationEligible !== false
    || value.policy.reputationEligible !== false || value.policy.enforcementAuthority !== false) return false;
  return value.evidenceHash === await evidenceHash(value);
}
