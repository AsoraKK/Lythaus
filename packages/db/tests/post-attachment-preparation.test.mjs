import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POST_ATTACHMENT_ACTIVATION_ENABLED,
  POST_ATTACHMENT_REFERENCE_HARD_LIMIT,
  UNRESOLVED_POST_ATTACHMENT_CAPABILITIES,
  preparePostAttachments,
  revalidatePostAttachmentSnapshot,
} from '../src/post-attachment-preparation.ts';

const ownerId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b11';
const otherOwnerId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b12';
const mediaId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b13';
const sessionId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b14';
const safetyRunId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b15';
const authenticityRunId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b16';
const sha256 = 'a'.repeat(64);

const syntheticCapabilities = {
  enabled: true,
  maxAttachments: 2,
  allowedSourceContentTypes: ['image/png'],
  allowedStoredContentTypes: ['image/webp'],
  maxSourceBytes: 4096,
  maxStoredBytes: 4096,
  maxPixels: 100_000,
  humanImageDeclarationVersion: 'fixture-only',
  altTextPolicyVersion: 'fixture-only',
  originalRetentionPolicyVersion: 'fixture-only',
  attachmentTombstonePolicyVersion: 'fixture-only',
};

function evidence(kind, runId, overrides = {}) {
  return { kind, outcome: 'pass', inputSha256: sha256, mediaStateVersion: 3, runId, ...overrides };
}

function validMedia(overrides = {}) {
  return {
    mediaId,
    ownerId,
    objectVersion: 3,
    objectState: 'approved',
    deletedAt: null,
    objectContentType: 'image/webp',
    objectByteSize: 200,
    sourceSha256: sha256,
    width: 20,
    height: 10,
    sourceUploadSessionId: sessionId,
    sourceUploadOwnerId: ownerId,
    sourceUploadPurpose: 'standard',
    sourceUploadStatus: 'approved',
    sourceContentType: 'image/png',
    sourceByteSize: 100,
    orientationNormalized: true,
    exifMetadataAbsent: true,
    gpsMetadataAbsent: true,
    safetyEvidence: evidence('public_safety_detector', safetyRunId),
    authenticityEvidence: evidence('public_image_authenticity_detector', authenticityRunId),
    ...overrides,
  };
}

function prepare(overrides = {}) {
  return preparePostAttachments({
    ownerId,
    requestedMediaIds: [mediaId],
    declaredCreationMode: 'human',
    capabilities: syntheticCapabilities,
    media: [validMedia()],
    ...overrides,
  });
}

test('default capabilities remain unresolved and cannot activate relations or publishing', () => {
  const result = prepare({ capabilities: UNRESOLVED_POST_ATTACHMENT_CAPABILITIES });
  assert.equal(POST_ATTACHMENT_ACTIVATION_ENABLED, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('attachment_count_policy_unresolved'));
  assert.ok(result.blockers.includes('human_image_declaration_policy_unresolved'));
  assert.ok(result.blockers.includes('alt_text_policy_unresolved'));
  assert.ok(result.blockers.includes('original_retention_policy_unresolved'));
  assert.equal(result.relationWriteAllowed, false);
  assert.equal(result.publicationEligible, false);
});

test('synthetic structurally complete state yields only a candidate snapshot, never a write or publication', () => {
  const result = prepare();
  assert.equal(result.status, 'candidate');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.snapshot?.length, 1);
  assert.equal(result.relationWriteAllowed, false);
  assert.equal(result.publicationEligible, false);
});

test('only opaque UUID media identifiers are accepted and the request bound is an engineering cap', () => {
  assert.equal(POST_ATTACHMENT_REFERENCE_HARD_LIMIT, 32);
  const url = prepare({ requestedMediaIds: ['https://r2.example.invalid/private/object'] });
  assert.ok(url.blockers.includes('media_id_must_be_opaque_uuid'));
  const objectKey = prepare({ requestedMediaIds: ['quarantine/owner/session'] });
  assert.ok(objectKey.blockers.includes('media_id_must_be_opaque_uuid'));
  const tooMany = prepare({ requestedMediaIds: Array.from({ length: 33 }, () => mediaId) });
  assert.ok(tooMany.blockers.includes('attachment_reference_bound_exceeded'));
});

test('missing and duplicate references fail closed', () => {
  const missing = prepare({ media: [] });
  assert.ok(missing.blockers.includes('media_reference_missing'));
  const duplicate = prepare({ requestedMediaIds: [mediaId, mediaId] });
  assert.ok(duplicate.blockers.includes('duplicate_media_reference'));
  const secondId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b17';
  const countLimited = prepare({
    requestedMediaIds: [mediaId, secondId],
    capabilities: { ...syntheticCapabilities, maxAttachments: 1 },
    media: [validMedia(), validMedia({ mediaId: secondId, sourceUploadSessionId: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b18' })],
  });
  assert.ok(countLimited.blockers.includes('attachment_count_policy_limit'));
});

test('media and source-session ownership must both match the authenticated owner', () => {
  const crossOwnerObject = prepare({ media: [validMedia({ ownerId: otherOwnerId })] });
  assert.ok(crossOwnerObject.blockers.includes('media_owner_mismatch'));
  const crossOwnerSession = prepare({ media: [validMedia({ sourceUploadOwnerId: otherOwnerId })] });
  assert.ok(crossOwnerSession.blockers.includes('media_owner_mismatch'));
});

test('rejected, pending, unknown and review states fail closed even when the session says approved', () => {
  for (const status of ['pending', 'queued']) {
    assert.ok(prepare({ media: [validMedia({ sourceUploadStatus: status })] }).blockers.includes('upload_pending'));
  }
  for (const status of ['rejected', 'expired']) {
    assert.ok(prepare({ media: [validMedia({ sourceUploadStatus: status })] }).blockers.includes('upload_rejected_or_expired'));
  }
  assert.ok(prepare({ media: [validMedia({ sourceUploadStatus: 'mystery' })] }).blockers.includes('upload_state_unknown'));
  const reviewed = prepare({ media: [validMedia({ objectState: 'review' })] });
  assert.ok(reviewed.blockers.includes('media_not_approved'));
  assert.equal(reviewed.publicationEligible, false);
  assert.ok(prepare({ media: [validMedia({ objectState: 'unknown' })] }).blockers.includes('media_not_approved'));
  assert.ok(prepare({ media: [validMedia({ objectState: 'rejected' })] }).blockers.includes('media_rejected_or_deleted'));
});

test('only standard-purpose uploads can be considered; private authenticity purposes stay separate', () => {
  for (const purpose of ['authenticity_alpha', 'authenticity_beta', 'unknown']) {
    const result = prepare({ media: [validMedia({ sourceUploadPurpose: purpose })] });
    assert.ok(result.blockers.includes('unsupported_upload_purpose'));
    assert.equal(result.publicationEligible, false);
  }
});

test('safety-only, generic, private and failed evidence never stand in for separate public detector passes', () => {
  const safetyOnly = prepare({ media: [validMedia({ authenticityEvidence: null })] });
  assert.ok(safetyOnly.blockers.includes('authenticity_evidence_missing'));
  const generic = prepare({ media: [validMedia({
    safetyEvidence: evidence('generic_evaluation', safetyRunId),
    authenticityEvidence: evidence('generic_evaluation', authenticityRunId),
  })] });
  assert.ok(generic.blockers.includes('safety_evidence_untrusted'));
  assert.ok(generic.blockers.includes('authenticity_evidence_untrusted'));
  const privateAlpha = prepare({ media: [validMedia({
    authenticityEvidence: evidence('private_authenticity_alpha', authenticityRunId),
  })] });
  assert.ok(privateAlpha.blockers.includes('authenticity_evidence_untrusted'));
  const failed = prepare({ media: [validMedia({
    safetyEvidence: evidence('public_safety_detector', safetyRunId, { outcome: 'failed' }),
  })] });
  assert.ok(failed.blockers.includes('safety_evidence_not_passed'));
  const failedAuthenticity = prepare({ media: [validMedia({
    authenticityEvidence: evidence('public_image_authenticity_detector', authenticityRunId, { outcome: 'failed' }),
  })] });
  assert.ok(failedAuthenticity.blockers.includes('authenticity_evidence_not_passed'));
  for (const evidenceValue of [null, undefined, { outcome: 'pass' }]) {
    const missing = prepare({ media: [validMedia({ safetyEvidence: evidenceValue })] });
    assert.ok(missing.blockers.includes('safety_evidence_missing'));
  }
});

test('detector evidence must bind to the current hash and state version', () => {
  const staleHash = prepare({ media: [validMedia({
    authenticityEvidence: evidence('public_image_authenticity_detector', authenticityRunId, { inputSha256: 'b'.repeat(64) }),
  })] });
  assert.ok(staleHash.blockers.includes('authenticity_evidence_stale_or_unbound'));
  const staleVersion = prepare({ media: [validMedia({
    safetyEvidence: evidence('public_safety_detector', safetyRunId, { mediaStateVersion: 2 }),
  })] });
  assert.ok(staleVersion.blockers.includes('safety_evidence_stale_or_unbound'));
});

test('AI-assisted, AI-generated and absent declarations do not satisfy the human-image claim', () => {
  for (const mode of ['ai_assisted', 'ai_generated', null, undefined]) {
    const result = prepare({ declaredCreationMode: mode });
    assert.ok(result.blockers.includes('human_image_claim_required'));
    assert.equal(result.publicationEligible, false);
  }
});

test('explicit format, byte, pixel and derivative privacy checks reject unsupported or unverified inputs', () => {
  assert.ok(prepare({ media: [validMedia({ sourceContentType: 'image/unknown' })] }).blockers.includes('source_content_type_unsupported'));
  assert.ok(prepare({ media: [validMedia({ sourceByteSize: 5000 })] }).blockers.includes('source_size_limit_exceeded'));
  assert.ok(prepare({ media: [validMedia({ width: 1000, height: 1000 })] }).blockers.includes('pixel_limit_exceeded'));
  for (const key of ['orientationNormalized', 'exifMetadataAbsent', 'gpsMetadataAbsent']) {
    const result = prepare({ media: [validMedia({ [key]: false })] });
    assert.ok(result.blockers.includes('derivative_privacy_unverified'));
  }
});

test('state revalidation rejects a media state/version change between preparation and commit', () => {
  const input = { ownerId, requestedMediaIds: [mediaId], declaredCreationMode: 'human', capabilities: syntheticCapabilities, media: [validMedia()] };
  const initial = prepare(input);
  assert.equal(revalidatePostAttachmentSnapshot(input, initial, [validMedia()]).ok, true);
  const changed = validMedia({ objectVersion: 4, objectState: 'review' });
  assert.deepEqual(revalidatePostAttachmentSnapshot(input, initial, [changed]), { ok: false, reason: 'attachment_state_changed' });
});

test('prepared projection carries no storage keys, signed URLs, or client locators', () => {
  const privateInput = validMedia({ objectKey: 'quarantine/private/key', signedUrl: 'https://r2.invalid/upload' });
  const result = prepare({ media: [privateInput] });
  assert.equal(result.status, 'candidate');
  assert.equal('objectKey' in result.snapshot[0], false);
  assert.equal('signedUrl' in result.snapshot[0], false);
});
