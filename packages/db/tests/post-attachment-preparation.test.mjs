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
const sourceSha256 = 'a'.repeat(64);
const objectSha256 = 'b'.repeat(64);

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
  return { kind, outcome: 'pass', inputSha256: objectSha256, mediaStateVersion: 3, runId, ...overrides };
}

function formatEvidence(detectedContentType, inputSha256, overrides = {}) {
  return { outcome: 'verified', detectedContentType, inputSha256, mediaStateVersion: 3, ...overrides };
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
    objectSha256,
    sourceSha256,
    width: 20,
    height: 10,
    sourceUploadSessionId: sessionId,
    sourceUploadOwnerId: ownerId,
    sourceUploadPurpose: 'standard',
    sourceUploadStatus: 'approved',
    sourceContentType: 'image/png',
    sourceByteSize: 100,
    sourceFormatEvidence: formatEvidence('image/png', sourceSha256),
    objectFormatEvidence: formatEvidence('image/webp', objectSha256),
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
  assert.equal(result.snapshot?.[0]?.objectSha256, objectSha256);
  assert.equal(result.snapshot?.[0]?.safetyEvidence.inputSha256, objectSha256);
  assert.equal(result.snapshot?.[0]?.authenticityEvidence.inputSha256, objectSha256);
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
  assert.equal(crossOwnerObject.status, 'blocked');
  assert.equal(crossOwnerObject.snapshot, null);
  assert.equal(crossOwnerObject.relationWriteAllowed, false);
  assert.equal(crossOwnerObject.publicationEligible, false);
  const crossOwnerSession = prepare({ media: [validMedia({ sourceUploadOwnerId: otherOwnerId })] });
  assert.ok(crossOwnerSession.blockers.includes('media_owner_mismatch'));
  assert.equal(crossOwnerSession.snapshot, null);
  const ambiguousOwnerRows = prepare({ media: [validMedia(), validMedia({ ownerId: otherOwnerId })] });
  assert.ok(ambiguousOwnerRows.blockers.includes('media_reference_ambiguous'));
  assert.equal(ambiguousOwnerRows.snapshot, null);
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
    assert.equal(missing.snapshot, null);
    assert.equal(missing.relationWriteAllowed, false);
    assert.equal(missing.publicationEligible, false);
  }
  for (const result of [safetyOnly, generic, privateAlpha, failed, failedAuthenticity]) {
    assert.equal(result.status, 'blocked');
    assert.equal(result.snapshot, null);
    assert.equal(result.relationWriteAllowed, false);
    assert.equal(result.publicationEligible, false);
  }
});

test('detector evidence must bind to the exact stored-object hash and state version', () => {
  const staleHash = prepare({ media: [validMedia({
    authenticityEvidence: evidence('public_image_authenticity_detector', authenticityRunId, { inputSha256: 'c'.repeat(64) }),
  })] });
  assert.ok(staleHash.blockers.includes('authenticity_evidence_stale_or_unbound'));
  const staleVersion = prepare({ media: [validMedia({
    safetyEvidence: evidence('public_safety_detector', safetyRunId, { mediaStateVersion: 2 }),
  })] });
  assert.ok(staleVersion.blockers.includes('safety_evidence_stale_or_unbound'));
});

test('source and stored MIME claims require byte inspection bound to each exact hash and revision', () => {
  for (const sourceContentType of ['image/', 'image/png; charset=utf-8', ' image/png', 'image/png\r\ntext/html']) {
    const malformed = prepare({ media: [validMedia({ sourceContentType })] });
    assert.ok(malformed.blockers.includes('source_content_type_invalid'));
    assert.equal(malformed.snapshot, null);
  }

  const forgedSource = prepare({ media: [validMedia({ sourceContentType: 'image/jpeg' })] });
  assert.ok(forgedSource.blockers.includes('source_content_type_mismatch'));
  assert.equal(forgedSource.publicationEligible, false);

  const forgedStored = prepare({ media: [validMedia({
    objectContentType: 'image/png',
    objectFormatEvidence: formatEvidence('image/webp', objectSha256),
  })] });
  assert.ok(forgedStored.blockers.includes('stored_content_type_mismatch'));

  const staleSourceProbe = prepare({ media: [validMedia({
    sourceFormatEvidence: formatEvidence('image/png', 'c'.repeat(64)),
  })] });
  assert.ok(staleSourceProbe.blockers.includes('source_format_evidence_stale_or_unbound'));

  const missingStoredProbe = prepare({ media: [validMedia({ objectFormatEvidence: null })] });
  assert.ok(missingStoredProbe.blockers.includes('stored_format_evidence_unverified'));
  assert.equal(missingStoredProbe.snapshot, null);

  const staleStoredProbe = prepare({ media: [validMedia({
    objectFormatEvidence: formatEvidence('image/webp', objectSha256, { mediaStateVersion: 2 }),
  })] });
  assert.ok(staleStoredProbe.blockers.includes('stored_format_evidence_stale_or_unbound'));

  const unsupportedSource = prepare({ media: [validMedia({
    sourceContentType: 'image/jpeg',
    sourceFormatEvidence: formatEvidence('image/jpeg', sourceSha256),
  })] });
  assert.ok(unsupportedSource.blockers.includes('source_content_type_unsupported'));

  const unsupportedStored = prepare({ media: [validMedia({
    objectContentType: 'image/png',
    objectFormatEvidence: formatEvidence('image/png', objectSha256),
  })] });
  assert.ok(unsupportedStored.blockers.includes('stored_content_type_unsupported'));

  const video = prepare({ media: [validMedia({
    sourceContentType: 'video/mp4',
    sourceFormatEvidence: formatEvidence('video/mp4', sourceSha256),
  })] });
  assert.ok(video.blockers.includes('non_image_media_unsupported'));
  assert.equal(video.snapshot, null);
});

test('invalid MIME capability entries remain blocked without selecting a format policy', () => {
  const result = prepare({ capabilities: {
    ...syntheticCapabilities,
    allowedStoredContentTypes: ['image/webp; charset=binary'],
  } });
  assert.ok(result.blockers.includes('stored_content_type_policy_invalid'));
  assert.equal(result.snapshot, null);
  assert.equal(result.publicationEligible, false);
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
  const changedBytesWithoutVersionBump = validMedia({ objectSha256: 'c'.repeat(64) });
  assert.deepEqual(revalidatePostAttachmentSnapshot(input, initial, [changedBytesWithoutVersionBump]), {
    ok: false,
    reason: 'attachment_state_changed',
  });
});

test('prepared projection carries no storage keys, signed URLs, or client locators', () => {
  const privateInput = validMedia({ objectKey: 'quarantine/private/key', signedUrl: 'https://r2.invalid/upload' });
  const result = prepare({ media: [privateInput] });
  assert.equal(result.status, 'candidate');
  assert.equal('objectKey' in result.snapshot[0], false);
  assert.equal('signedUrl' in result.snapshot[0], false);
});
