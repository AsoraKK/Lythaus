export const POST_ATTACHMENT_REFERENCE_HARD_LIMIT = 32;
export const POST_ATTACHMENT_ACTIVATION_ENABLED = false as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface PostAttachmentCapabilityInputs {
  enabled: boolean;
  maxAttachments: number | null;
  allowedSourceContentTypes: readonly string[] | null;
  allowedStoredContentTypes: readonly string[] | null;
  maxSourceBytes: number | null;
  maxStoredBytes: number | null;
  maxPixels: number | null;
  humanImageDeclarationVersion: string | null;
  altTextPolicyVersion: string | null;
  originalRetentionPolicyVersion: string | null;
  attachmentTombstonePolicyVersion: string | null;
}

export const UNRESOLVED_POST_ATTACHMENT_CAPABILITIES: PostAttachmentCapabilityInputs = Object.freeze({
  enabled: false,
  maxAttachments: null,
  allowedSourceContentTypes: null,
  allowedStoredContentTypes: null,
  maxSourceBytes: null,
  maxStoredBytes: null,
  maxPixels: null,
  humanImageDeclarationVersion: null,
  altTextPolicyVersion: null,
  originalRetentionPolicyVersion: null,
  attachmentTombstonePolicyVersion: null,
});

export type DetectorOutcome = 'pass' | 'review' | 'reject' | 'failed' | 'unknown';
export type DetectorEvidenceKind =
  | 'public_safety_detector'
  | 'public_image_authenticity_detector'
  | 'safety_only'
  | 'generic_evaluation'
  | 'private_authenticity_alpha'
  | 'private_authenticity_beta';

export interface DetectorEvidenceInput {
  kind: DetectorEvidenceKind;
  outcome: DetectorOutcome;
  inputSha256: string | null;
  mediaStateVersion: number | null;
  runId: string | null;
}

export interface PostAttachmentMediaSnapshot {
  mediaId: string;
  ownerId: string;
  objectVersion: number;
  objectState: string;
  deletedAt: string | null;
  objectContentType: string;
  objectByteSize: number;
  sourceSha256: string | null;
  width: number;
  height: number;
  sourceUploadSessionId: string;
  sourceUploadOwnerId: string;
  sourceUploadPurpose: string;
  sourceUploadStatus: string;
  sourceContentType: string;
  sourceByteSize: number;
  orientationNormalized: boolean | null;
  exifMetadataAbsent: boolean | null;
  gpsMetadataAbsent: boolean | null;
  safetyEvidence: unknown;
  authenticityEvidence: unknown;
}

export interface PreparePostAttachmentsInput {
  ownerId: string;
  requestedMediaIds: unknown;
  declaredCreationMode: unknown;
  capabilities: PostAttachmentCapabilityInputs;
  media: readonly PostAttachmentMediaSnapshot[];
}

export interface PreparedPostAttachmentState {
  mediaId: string;
  ownerId: string;
  objectVersion: number;
  objectState: string;
  deletedAt: string | null;
  objectContentType: string;
  objectByteSize: number;
  sourceSha256: string;
  width: number;
  height: number;
  sourceUploadSessionId: string;
  sourceUploadOwnerId: string;
  sourceUploadPurpose: string;
  sourceUploadStatus: string;
  sourceContentType: string;
  sourceByteSize: number;
  orientationNormalized: boolean;
  exifMetadataAbsent: boolean;
  gpsMetadataAbsent: boolean;
  safetyEvidence: DetectorEvidenceInput;
  authenticityEvidence: DetectorEvidenceInput;
}

export interface PostAttachmentPreparationResult {
  status: 'blocked' | 'candidate';
  blockers: readonly string[];
  requestedMediaIds: readonly string[];
  ownerId: string | null;
  declaredCreationMode: 'human' | null;
  snapshot: readonly PreparedPostAttachmentState[] | null;
  relationWriteAllowed: false;
  publicationEligible: false;
}

function opaqueUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function policyBlockers(capabilities: PostAttachmentCapabilityInputs): string[] {
  const blockers: string[] = [];
  if (!capabilities.enabled) blockers.push('post_attachment_feature_disabled');
  if (!isPositiveSafeInteger(capabilities.maxAttachments)
    || capabilities.maxAttachments > POST_ATTACHMENT_REFERENCE_HARD_LIMIT) blockers.push('attachment_count_policy_unresolved');
  if (!capabilities.allowedSourceContentTypes?.length) blockers.push('source_content_type_policy_unresolved');
  if (!capabilities.allowedStoredContentTypes?.length) blockers.push('stored_content_type_policy_unresolved');
  if (!isPositiveSafeInteger(capabilities.maxSourceBytes)) blockers.push('source_size_policy_unresolved');
  if (!isPositiveSafeInteger(capabilities.maxStoredBytes)) blockers.push('stored_size_policy_unresolved');
  if (!isPositiveSafeInteger(capabilities.maxPixels)) blockers.push('pixel_limit_policy_unresolved');
  if (!capabilities.humanImageDeclarationVersion?.trim()) blockers.push('human_image_declaration_policy_unresolved');
  if (!capabilities.altTextPolicyVersion?.trim()) blockers.push('alt_text_policy_unresolved');
  if (!capabilities.originalRetentionPolicyVersion?.trim()) blockers.push('original_retention_policy_unresolved');
  if (!capabilities.attachmentTombstonePolicyVersion?.trim()) blockers.push('attachment_tombstone_policy_unresolved');
  return blockers;
}

function parseDetectorEvidence(value: unknown): DetectorEvidenceInput | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<DetectorEvidenceInput>;
  if (typeof item.kind !== 'string' || typeof item.outcome !== 'string') return null;
  return {
    kind: item.kind as DetectorEvidenceKind,
    outcome: item.outcome as DetectorOutcome,
    inputSha256: typeof item.inputSha256 === 'string' ? item.inputSha256 : null,
    mediaStateVersion: typeof item.mediaStateVersion === 'number' ? item.mediaStateVersion : null,
    runId: typeof item.runId === 'string' ? item.runId : null,
  };
}

function detectorBlocker(
  evidence: DetectorEvidenceInput | null,
  expectedKind: 'public_safety_detector' | 'public_image_authenticity_detector',
  expectedSha256: string,
  expectedVersion: number,
  label: 'safety' | 'authenticity',
): string | null {
  if (!evidence) return `${label}_evidence_missing`;
  if (evidence.kind !== expectedKind) return `${label}_evidence_untrusted`;
  if (evidence.outcome !== 'pass') return `${label}_evidence_not_passed`;
  if (!opaqueUuid(evidence.runId) || evidence.inputSha256 !== expectedSha256
    || evidence.mediaStateVersion !== expectedVersion) return `${label}_evidence_stale_or_unbound`;
  return null;
}

function safeMediaState(media: PostAttachmentMediaSnapshot, ownerId: string): {
  state: PreparedPostAttachmentState | null;
  blockers: string[];
} {
  const blockers: string[] = [];
  const mediaId = opaqueUuid(media.mediaId);
  const mediaOwnerId = opaqueUuid(media.ownerId);
  const sessionId = opaqueUuid(media.sourceUploadSessionId);
  const sessionOwnerId = opaqueUuid(media.sourceUploadOwnerId);
  if (!mediaId || !sessionId) blockers.push('media_reference_invalid');
  if (!mediaOwnerId || mediaOwnerId !== ownerId || sessionOwnerId !== ownerId) blockers.push('media_owner_mismatch');
  if (!isPositiveSafeInteger(media.objectVersion)) blockers.push('media_version_invalid');
  if (media.sourceUploadPurpose !== 'standard') blockers.push('unsupported_upload_purpose');
  if (media.sourceUploadStatus === 'pending' || media.sourceUploadStatus === 'queued') blockers.push('upload_pending');
  else if (media.sourceUploadStatus === 'rejected' || media.sourceUploadStatus === 'expired' || media.sourceUploadStatus === 'cancelled') blockers.push('upload_rejected_or_expired');
  else if (media.sourceUploadStatus !== 'approved') blockers.push('upload_state_unknown');
  if (media.objectState === 'rejected' || media.objectState === 'deleted' || media.deletedAt !== null) blockers.push('media_rejected_or_deleted');
  else if (media.objectState !== 'approved') blockers.push('media_not_approved');
  if (!isSha256(media.sourceSha256)) blockers.push('media_hash_missing_or_invalid');
  if (!isPositiveSafeInteger(media.sourceByteSize) || !isPositiveSafeInteger(media.objectByteSize)
    || !isPositiveSafeInteger(media.width) || !isPositiveSafeInteger(media.height)) blockers.push('media_dimensions_or_size_invalid');
  if (media.orientationNormalized !== true || media.exifMetadataAbsent !== true || media.gpsMetadataAbsent !== true) blockers.push('derivative_privacy_unverified');

  const sourceMime = typeof media.sourceContentType === 'string' ? media.sourceContentType : '';
  const storedMime = typeof media.objectContentType === 'string' ? media.objectContentType : '';
  if (!sourceMime.startsWith('image/') || !storedMime.startsWith('image/')) blockers.push('non_image_media_unsupported');

  const safetyEvidence = parseDetectorEvidence(media.safetyEvidence);
  const authenticityEvidence = parseDetectorEvidence(media.authenticityEvidence);
  const hash = isSha256(media.sourceSha256) ? media.sourceSha256 : '';
  const version = isPositiveSafeInteger(media.objectVersion) ? media.objectVersion : -1;
  const safetyBlocker = detectorBlocker(safetyEvidence, 'public_safety_detector', hash, version, 'safety');
  const authenticityBlocker = detectorBlocker(authenticityEvidence, 'public_image_authenticity_detector', hash, version, 'authenticity');
  if (safetyBlocker) blockers.push(safetyBlocker);
  if (authenticityBlocker) blockers.push(authenticityBlocker);

  if (blockers.length || !mediaId || !mediaOwnerId || !sessionId || !sessionOwnerId
    || !isSha256(media.sourceSha256) || !safetyEvidence || !authenticityEvidence) return { state: null, blockers };
  return {
    state: {
      mediaId,
      ownerId: mediaOwnerId,
      objectVersion: media.objectVersion,
      objectState: media.objectState,
      deletedAt: media.deletedAt,
      objectContentType: storedMime,
      objectByteSize: media.objectByteSize,
      sourceSha256: media.sourceSha256,
      width: media.width,
      height: media.height,
      sourceUploadSessionId: sessionId,
      sourceUploadOwnerId: sessionOwnerId,
      sourceUploadPurpose: media.sourceUploadPurpose,
      sourceUploadStatus: media.sourceUploadStatus,
      sourceContentType: sourceMime,
      sourceByteSize: media.sourceByteSize,
      orientationNormalized: media.orientationNormalized === true,
      exifMetadataAbsent: media.exifMetadataAbsent === true,
      gpsMetadataAbsent: media.gpsMetadataAbsent === true,
      safetyEvidence,
      authenticityEvidence,
    },
    blockers,
  };
}

export function preparePostAttachments(input: PreparePostAttachmentsInput): PostAttachmentPreparationResult {
  const blockers = policyBlockers(input.capabilities);
  const ownerId = opaqueUuid(input.ownerId);
  if (!ownerId) blockers.push('owner_id_invalid');

  let requestedMediaIds: string[] = [];
  if (!Array.isArray(input.requestedMediaIds)) blockers.push('media_ids_required');
  else if (input.requestedMediaIds.length > POST_ATTACHMENT_REFERENCE_HARD_LIMIT) blockers.push('attachment_reference_bound_exceeded');
  else {
    for (const value of input.requestedMediaIds) {
      const id = opaqueUuid(value);
      if (!id) blockers.push('media_id_must_be_opaque_uuid');
      else requestedMediaIds.push(id);
    }
  }
  if (new Set(requestedMediaIds).size !== requestedMediaIds.length) blockers.push('duplicate_media_reference');
  if (input.declaredCreationMode !== 'human') blockers.push('human_image_claim_required');
  if (ownerId && requestedMediaIds.length > 0 && input.capabilities.maxAttachments !== null
    && isPositiveSafeInteger(input.capabilities.maxAttachments)
    && requestedMediaIds.length > input.capabilities.maxAttachments) blockers.push('attachment_count_policy_limit');

  const rows = new Map<string, PostAttachmentMediaSnapshot[]>();
  for (const media of input.media) {
    const id = opaqueUuid(media.mediaId);
    if (!id) continue;
    const found = rows.get(id) ?? [];
    found.push(media);
    rows.set(id, found);
  }
  const states: PreparedPostAttachmentState[] = [];
  for (const mediaId of requestedMediaIds) {
    const matching = rows.get(mediaId) ?? [];
    if (matching.length === 0) {
      blockers.push('media_reference_missing');
      continue;
    }
    if (matching.length !== 1) {
      blockers.push('media_reference_ambiguous');
      continue;
    }
    const checked = safeMediaState(matching[0], ownerId ?? '');
    blockers.push(...checked.blockers);
    if (checked.state) states.push(checked.state);
    const sourceTypes = input.capabilities.allowedSourceContentTypes;
    const storedTypes = input.capabilities.allowedStoredContentTypes;
    if (sourceTypes && !sourceTypes.includes(matching[0].sourceContentType)) blockers.push('source_content_type_unsupported');
    if (storedTypes && !storedTypes.includes(matching[0].objectContentType)) blockers.push('stored_content_type_unsupported');
    if (isPositiveSafeInteger(input.capabilities.maxSourceBytes)
      && matching[0].sourceByteSize > input.capabilities.maxSourceBytes) blockers.push('source_size_limit_exceeded');
    if (isPositiveSafeInteger(input.capabilities.maxStoredBytes)
      && matching[0].objectByteSize > input.capabilities.maxStoredBytes) blockers.push('stored_size_limit_exceeded');
    if (isPositiveSafeInteger(input.capabilities.maxPixels)
      && matching[0].width * matching[0].height > input.capabilities.maxPixels) blockers.push('pixel_limit_exceeded');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const valid = uniqueBlockers.length === 0 && ownerId !== null && input.declaredCreationMode === 'human';
  return {
    status: valid ? 'candidate' : 'blocked',
    blockers: uniqueBlockers,
    requestedMediaIds,
    ownerId,
    declaredCreationMode: input.declaredCreationMode === 'human' ? 'human' : null,
    snapshot: valid ? states : null,
    relationWriteAllowed: POST_ATTACHMENT_ACTIVATION_ENABLED,
    publicationEligible: POST_ATTACHMENT_ACTIVATION_ENABLED,
  };
}

export function revalidatePostAttachmentSnapshot(
  input: PreparePostAttachmentsInput,
  expected: PostAttachmentPreparationResult,
  freshMedia: readonly PostAttachmentMediaSnapshot[],
): { ok: boolean; reason: 'current' | 'initial_plan_blocked' | 'attachment_state_changed' } {
  if (!expected.snapshot || expected.ownerId === null || expected.status !== 'candidate') {
    return { ok: false, reason: 'initial_plan_blocked' };
  }
  const refreshed = preparePostAttachments({ ...input, media: freshMedia });
  if (!refreshed.snapshot || refreshed.status !== 'candidate') return { ok: false, reason: 'attachment_state_changed' };
  if (JSON.stringify(expected.snapshot) !== JSON.stringify(refreshed.snapshot)) return { ok: false, reason: 'attachment_state_changed' };
  return { ok: true, reason: 'current' };
}
