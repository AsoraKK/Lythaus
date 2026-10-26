import { sha256Hex } from './forensics.ts';
import { isUuidV7 } from './uuid.ts';

export const IMAGE_DETECTION_VERSION = 'lythaus-image-detection-v1';
export const IMAGE_DETECTION_POLICY = 'image-evaluation-only-v1';
export type DetectionState = 'queued' | 'processing' | 'completed' | 'failed' | 'inconclusive' | 'cancelled' | 'deleted';
export type DetectionReason = 'ORIGINAL_UNAVAILABLE' | 'ORIGINAL_CHANGED' | 'INTEGRITY_FAILED' | 'SOURCE_UNAVAILABLE'
  | 'ATTEMPT_CONSUMED' | 'TIMEOUT' | 'EXPIRED' | 'INVALID_RESULT' | 'CANCELLED' | 'DELETED' | 'CLEANUP' | 'SUPERSEDED';

export interface ImageDetectionBinding {
  ownerId: string;
  uploadSessionId: string;
  sourceEventId: string;
  objectId: string;
  contentVersion: string;
  original: { key: string; version: string; etag: string; sha256: string; bytes: number; mime: 'image/png' | 'image/jpeg' };
  evaluator: { id: string; version: string; model: string; modelVersion: string; preprocessing: string; runtime: string };
  policyVersion: typeof IMAGE_DETECTION_POLICY;
}

export interface ImageDetectionOutput {
  schemaVersion: typeof IMAGE_DETECTION_VERSION;
  bindingHash: string;
  attemptId: string;
  evaluator: ImageDetectionBinding['evaluator'];
  evidenceKind: 'synthetic';
  safety: 'NOT_RUN' | 'ALLOW' | 'REVIEW' | 'BLOCK' | 'UNAVAILABLE';
  authorship: 'NOT_RUN' | 'ABSTAIN' | 'SYNTHETIC_LIKE_EVIDENCE' | 'NO_POSITIVE_EVIDENCE';
}

export interface ImageDetectionEvidence {
  schemaVersion: typeof IMAGE_DETECTION_VERSION;
  bindingHash: string;
  attemptId: string;
  evaluator: ImageDetectionBinding['evaluator'];
  evidenceKind: 'synthetic';
  integrity: 'VERIFIED';
  safety: ImageDetectionOutput['safety'];
  authorship: { state: 'ABSTAIN'; observation: ImageDetectionOutput['authorship'] };
  startedAt: string;
  completedAt: string;
  policy: { version: typeof IMAGE_DETECTION_POLICY; outcome: 'review_required'; publicationEligible: false; reputationEligible: false; enforcementAuthority: false };
}

export interface DetectionJob {
  id: string;
  binding: ImageDetectionBinding | null;
  bindingHash: string;
  state: DetectionState;
  attempts: number;
  attemptId: string | null;
  dispatchStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  leaseUntil: string | null;
  evidence: ImageDetectionEvidence | null;
  reason: DetectionReason | null;
}

const hash = /^[a-f0-9]{64}$/;
const label = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/;
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === keys.sort().join(',');
}

export function assertDetectionBinding(value: ImageDetectionBinding): void {
  if (!exactKeys(value, ['ownerId', 'uploadSessionId', 'sourceEventId', 'objectId', 'contentVersion', 'original', 'evaluator', 'policyVersion'])
    || ![value.ownerId, value.uploadSessionId, value.sourceEventId, value.objectId].every(isUuidV7)
    || !hash.test(value.contentVersion) || value.policyVersion !== IMAGE_DETECTION_POLICY
    || !exactKeys(value.original, ['key', 'version', 'etag', 'sha256', 'bytes', 'mime'])
    || value.original.key !== `quarantine/${value.ownerId}/${value.uploadSessionId}`
    || typeof value.original.version !== 'string' || !label.test(value.original.version)
    || typeof value.original.etag !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.original.etag)
    || !hash.test(value.original.sha256) || !Number.isSafeInteger(value.original.bytes)
    || value.original.bytes < 1 || value.original.bytes > 10 * 1024 * 1024
    || !['image/png', 'image/jpeg'].includes(value.original.mime)
    || !exactKeys(value.evaluator, ['id', 'version', 'model', 'modelVersion', 'preprocessing', 'runtime'])
    || Object.values(value.evaluator).some(v => typeof v !== 'string' || !label.test(v))) throw new Error('image_detection_binding_invalid');
}

export function canonicalDetectionBinding(binding: ImageDetectionBinding): string {
  assertDetectionBinding(binding);
  const { original: o, evaluator: e } = binding;
  return JSON.stringify([IMAGE_DETECTION_VERSION, binding.ownerId, binding.uploadSessionId, binding.sourceEventId,
    binding.objectId, binding.contentVersion, o.key, o.version, o.etag, o.sha256, o.bytes, o.mime,
    e.id, e.version, e.model, e.modelVersion, e.preprocessing, e.runtime, binding.policyVersion]);
}

export async function detectionBindingHash(binding: ImageDetectionBinding): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalDetectionBinding(binding)));
}

export function compileDetectionEvidence(job: DetectionJob, value: ImageDetectionOutput, completedAt: string): ImageDetectionEvidence {
  if (!job.binding || !job.attemptId || !job.dispatchStartedAt
    || !exactKeys(value, ['schemaVersion', 'bindingHash', 'attemptId', 'evaluator', 'evidenceKind', 'safety', 'authorship'])
    || value.schemaVersion !== IMAGE_DETECTION_VERSION || value.bindingHash !== job.bindingHash
    || value.attemptId !== job.attemptId || value.evidenceKind !== 'synthetic'
    || !exactKeys(value.evaluator, Object.keys(job.binding.evaluator))
    || Object.entries(job.binding.evaluator).some(([k, v]) => value.evaluator[k as keyof typeof value.evaluator] !== v)
    || !['NOT_RUN', 'ALLOW', 'REVIEW', 'BLOCK', 'UNAVAILABLE'].includes(value.safety)
    || !['NOT_RUN', 'ABSTAIN', 'SYNTHETIC_LIKE_EVIDENCE', 'NO_POSITIVE_EVIDENCE'].includes(value.authorship)
    || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) < Date.parse(job.dispatchStartedAt)
    || Date.parse(completedAt) >= Date.parse(job.expiresAt)) throw new Error('image_detection_result_invalid');
  return { schemaVersion: IMAGE_DETECTION_VERSION, bindingHash: job.bindingHash, attemptId: job.attemptId,
    evaluator: { ...job.binding.evaluator }, evidenceKind: 'synthetic', integrity: 'VERIFIED', safety: value.safety,
    authorship: { state: 'ABSTAIN', observation: value.authorship }, startedAt: job.dispatchStartedAt, completedAt,
    policy: { version: IMAGE_DETECTION_POLICY, outcome: 'review_required', publicationEligible: false,
      reputationEligible: false, enforcementAuthority: false } };
}

export function detectionOwnerStatus(job: DetectionJob) {
  return { schemaVersion: IMAGE_DETECTION_VERSION, status: job.state, updatedAt: job.updatedAt,
    evaluation: job.evidence ? 'synthetic_only' : job.dispatchStartedAt ? 'no_usable_output' : 'not_run',
    reviewRequired: true, authenticity: 'unverified', publicationEligible: false, reputationEligible: false } as const;
}
