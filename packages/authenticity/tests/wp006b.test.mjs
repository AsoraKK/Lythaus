import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  WP006B_BENCHMARK_SCHEMA_VERSION,
  WP006B_FINGERPRINT_SCHEMA_VERSION,
  WP006B_RIGHTS_SCHEMA_VERSION,
  WP006B_SPLITS_SCHEMA_VERSION,
  assertWp006bBenchmarkManifest,
  assertWp006bDuplicateHashHandling,
  assertWp006bFingerprint,
  assertWp006bHoldoutBoundaries,
  assertWp006bParentEditLinkage,
  assertWp006bRightsManifest,
  assertWp006bRightsRecord,
  assertWp006bSourceFamilySplits,
  assertWp006bSplitsManifest,
  buildWp006bFingerprintInput,
  stableStringify,
} from '../src/wp006b.ts';

function readArtifact(name) {
  return JSON.parse(readFileSync(new URL(`../../../research/wp006b/${name}`, import.meta.url), 'utf8'));
}

const manifest = readArtifact('benchmark-manifest.json');
const rights = readArtifact('benchmark-rights.json');
const splits = readArtifact('benchmark-splits.json');
const fingerprint = readArtifact('benchmark-fingerprint.json');
const ownerTemplate = readArtifact('owner-confirmation-template.json');
const ownerPool = readArtifact('owner-pool-inventory.json');
const reservedHoldout = readArtifact('reserved-holdout-manifest.json');
const videoInventory = readArtifact('video-future-inventory.json');
const benchmarkGap = readArtifact('benchmark-gap.json');
const partialEditPlan = readArtifact('partial-edit-plan.json');
const ef2LineageReview = readArtifact('ef2-owner-lineage-review.json');

function sample(overrides = {}) {
  return {
    sampleId: 'sample-a',
    groupId: 'family-a',
    sourceFamilyId: 'family-a',
    ownerProvidedName: 'sample-a.jpg',
    candidateCategory: 'CAMERA_ORIGINAL_CANDIDATE',
    origin: 'UNKNOWN',
    transformation: 'ORIGINAL',
    logicalFileReference: 'external-owner-seed/sample-a.jpg',
    sourceUrlOrAcquisitionId: 'owner-seed:sample-a',
    contentSha256: 'a'.repeat(64),
    perceptualHash: '0'.repeat(64),
    perceptualHashAlgorithm: 'test-v1',
    byteSize: 100,
    width: 10,
    height: 10,
    mime: 'image/jpeg',
    safeMetadata: {
      exifPresent: false,
      xmpPresent: false,
      c2paPresent: false,
      encoderPresent: false,
      metadataAbsent: true,
      safeKeys: [],
      orientationTag: null,
      privacySensitiveMetadataFlags: [],
      cameraMakePresent: false,
      cameraModelPresent: false,
      captureTimestampPresent: false,
    },
    truthAxes: {
      physicalCameraAcquisition: 'UNKNOWN',
      syntheticDepictedContent: 'UNKNOWN',
      localManipulation: 'UNKNOWN',
      digitalCapture: 'UNKNOWN',
      screenRecapture: 'UNKNOWN',
    },
    truthConfidence: {
      physicalCameraAcquisition: 'UNKNOWN',
      syntheticDepictedContent: 'UNKNOWN',
      localManipulation: 'UNKNOWN',
      digitalCapture: 'UNKNOWN',
      screenRecapture: 'UNKNOWN',
    },
    truthSynthetic: 'UNKNOWN',
    truthLocalManipulation: 'UNKNOWN',
    truthBasis: 'OWNER_CONFIRMATION_REQUIRED',
    hardNegativeType: null,
    generatorFamily: null,
    generatorModel: null,
    generatorVersion: null,
    cameraDeviceFamily: null,
    sourceDatasetId: 'test-seed',
    sourceUrl: null,
    licenceClassification: 'OWNER_CONFIRMATION_REQUIRED',
    rightsClass: 'MIXED_OR_UNCLEAR',
    evaluationGate: 'REVIEW_REQUIRED',
    trainingGate: 'DO_NOT_TRAIN',
    distillationGate: 'DO_NOT_DISTILL',
    consentStatus: 'OWNER_CONFIRMATION_REQUIRED',
    sourceLineage: {
      relation: 'SOURCE_ORIGINAL',
      parentSampleId: null,
      familyEvidence: 'NO_RELATED_MEDIA_OBSERVED',
    },
    parentSampleId: null,
    mask: null,
    maskPathOrId: null,
    maskSha256: null,
    rightsRecordId: 'rights-sample-a',
    split: 'CALIBRATION',
    calibrationEligible: false,
    evaluationEligible: false,
    trainingEligible: false,
    readiness: 'PROVENANCE_CONFIRMATION_REQUIRED',
    ownerConfirmationReference: 'owner-confirmation-template.json#/samples/sample-a',
    poolRole: 'ACTIVE_MICROBENCH',
    retentionClass: 'MEDIA_EXTERNAL_CACHE',
    privacyFlags: ['NONE'],
    privacyReview: 'PENDING_OWNER_REVIEW',
    duplicateOfSampleId: null,
    nearestPerceptualDistance: null,
    ...overrides,
  };
}

function rightsRecord(overrides = {}) {
  return {
    rightsRecordId: 'rights-sample-a',
    sampleId: 'sample-a',
    sourceFamilyId: 'family-a',
    codeRights: 'NOT_APPLICABLE',
    weightRights: 'NOT_APPLICABLE',
    sourceMediaRights: 'UNRESOLVED',
    dataRights: 'UNRESOLVED',
    evaluationRights: 'UNRESOLVED',
    internalResearchRights: 'UNRESOLVED',
    commercialProductEvaluationRights: 'UNRESOLVED',
    redistributionRights: 'UNRESOLVED',
    publicRedistributionRights: 'UNRESOLVED',
    thirdPartyRedistributionRights: 'UNRESOLVED',
    readiness: 'PROVENANCE_CONFIRMATION_REQUIRED',
    reasonCodes: ['OWNER_CONFIRMATION_REQUIRED'],
    ...overrides,
  };
}

test('WP006B materializes and validates the owner-controlled pool without inference', () => {
  assert.doesNotThrow(() => assertWp006bBenchmarkManifest(manifest));
  assert.doesNotThrow(() => assertWp006bRightsManifest(rights));
  assert.doesNotThrow(() => assertWp006bSplitsManifest(splits));
  assert.doesNotThrow(() => assertWp006bFingerprint(fingerprint));
  assert.equal(manifest.schemaVersion, WP006B_BENCHMARK_SCHEMA_VERSION);
  assert.equal(manifest.specialistInferenceRun, false);
  assert.equal(manifest.benchmarkStatus, 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION');
  assert.equal(manifest.counts.ownerPoolFilesTotal, 735);
  assert.equal(manifest.counts.ownerPoolImages, 710);
  assert.equal(manifest.counts.ownerPoolVideos, 25);
  assert.equal(manifest.counts.independentSourceFamilies, 706);
  assert.equal(manifest.counts.independentCameraFamilies, 459);
  assert.equal(manifest.counts.independentSyntheticFamilies, 31);
  assert.equal(manifest.counts.independentHardNegativeFamilies, 216);
  assert.equal(manifest.counts.mimeSignatureMismatchImages, 2);
  assert.equal(manifest.counts.cameraFamilies, 32);
  assert.equal(manifest.counts.syntheticFamilies, 20);
  assert.equal(manifest.counts.hardNegativeFamilies, 20);
  assert.equal(manifest.counts.mixedOriginFamilies, 0);
  assert.equal(manifest.counts.partialEditFamilies, 8);
  assert.equal(manifest.counts.activeBenchmarkSourceFamilies, 72);
  assert.equal(manifest.counts.activeBenchmarkSamples, 80);
  assert.equal(new Set(manifest.samples.map((item) => item.sourceFamilyId)).size, 72);
  assert.ok(manifest.samples.every((item) => item.poolRole === 'ACTIVE_MICROBENCH'));
  assert.equal(manifest.samples.filter((item) => item.candidateCategory === 'PARTIAL_EDIT_CANDIDATE').length, 8);
  assert.ok(manifest.samples.filter((item) => item.candidateCategory === 'PARTIAL_EDIT_CANDIDATE').every((item) => item.parentSampleId && item.mask && item.truthAxes.localManipulation === 'TRUE'));
  assert.equal(partialEditPlan.records.length, 8);
  assert.ok(partialEditPlan.records.every((item) => /^[a-f0-9]{64}$/.test(item.parentContentSha256)));
  assert.ok(rights.records.every((item) => item.sourceMediaRights === 'CONFIRMED' && item.evaluationRights === 'CONFIRMED' && item.internalResearchRights === 'CONFIRMED' && item.commercialProductEvaluationRights === 'CONFIRMED'));
  assert.ok(rights.records.every((item) => item.publicRedistributionRights === 'REVIEW_REQUIRED' && item.thirdPartyRedistributionRights === 'REVIEW_REQUIRED'));
  assert.equal(splits.assignments.length, 80);
  assert.ok(splits.assignments.every((item) => item.eligible === true));
  assert.ok(splits.assignments.some((item) => item.split === 'HOLDOUT'));
  assert.equal(splits.deviceHoldout.status, 'PREDECLARED');
  assert.equal(splits.generatorHoldout.status, 'NOT_READY');
  assert.equal(reservedHoldout.records.length, 192);
  assert.ok(reservedHoldout.records.every((item) => item.poolRole === 'OWNER_RESERVED_FUTURE_HOLDOUT'));
  const activeFamilies = new Set(manifest.samples.map((item) => item.sourceFamilyId));
  assert.ok(reservedHoldout.records.every((item) => !activeFamilies.has(item.sourceFamilyId)));
  assert.equal(videoInventory.records.length, 25);
  assert.ok(videoInventory.records.every((item) => item.frameExtraction === false));
  assert.equal(ownerPool.entries.filter((item) => item.mediaType === 'video').length, 25);
  assert.ok(ownerPool.entries.filter((item) => item.mediaType === 'video').every((item) => item.poolRole === 'VIDEO_FUTURE_POOL' && item.width === null && item.height === null));
  assert.equal(ownerPool.entries.filter((item) => item.poolRole === 'AMBIGUOUS_OR_EXCLUDED').length, 6);
  assert.equal(benchmarkGap.shortfallBySlice.camera, 0);
  assert.equal(benchmarkGap.shortfallBySlice.synthetic, 0);
  assert.equal(benchmarkGap.shortfallBySlice.hardNegative, 0);
  assert.equal(benchmarkGap.shortfallBySlice.partialEdit, 0);
  assert.equal(benchmarkGap.readiness, 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION');
  assert.deepEqual(splits.policy, {
    sourceFamilyBoundary: true,
    cameraDeviceBoundary: true,
    generatorFamilyHoldout: true,
    descendantsStayWithParent: true,
    scoringRequiresOwnerConfirmation: true,
    scoringRequiresRightsClosure: true,
  });
  assert.equal(ownerTemplate.samples.length, 52);
  assert.ok(ownerTemplate.samples.every((item) => Array.isArray(item.responseFields)));
  assert.ok(ownerTemplate.samples.every((item) => !item.responseFields.includes('permissionForInternalResearch')));
});

test('WP006B keeps duplicates, near-duplicates, and reserved media out of active leakage', () => {
  const activeHashes = manifest.samples.map((item) => item.contentSha256);
  assert.equal(new Set(activeHashes).size, activeHashes.length);
  const splitBySampleId = new Map(splits.assignments.map((item) => [item.sampleId, item.split]));
  for (const group of ownerPool.duplicateAnalysis.nearDuplicateGroups) {
    const splitsInGroup = new Set(group.sampleIds.map((sampleId) => splitBySampleId.get(sampleId)).filter(Boolean));
    assert.ok(splitsInGroup.size <= 1, group.groupId);
  }
  assert.ok(ownerPool.entries.every((entry) => !Object.hasOwn(entry, 'relativePath')));
  assert.ok(ownerPool.entries.every((entry) => !Object.hasOwn(entry, 'absolutePath')));
  assert.ok(ownerPool.entries.every((entry) => !Object.hasOwn(entry, 'gpsCoordinates')));
});

test('WP006B keeps independent truth axes and never emits a binary verdict', () => {
  const mixedAxes = {
    physicalCameraAcquisition: 'TRUE',
    syntheticDepictedContent: 'TRUE',
    localManipulation: 'FALSE',
    digitalCapture: 'FALSE',
    screenRecapture: 'TRUE',
  };
  assert.doesNotThrow(() => assertWp006bBenchmarkManifest({
    ...manifest,
    samples: [sample({ truthAxes: mixedAxes, truthSynthetic: 'TRUE', truthLocalManipulation: 'FALSE' })],
  }));
  assert.throws(() => assertWp006bBenchmarkManifest({
    ...manifest,
    samples: [sample({ authenticityVerdict: 'SYNTHETIC' })],
  }), /forbidden_field:authenticityVerdict/);
  assert.throws(() => assertWp006bRightsRecord({ ...rightsRecord(), gpsCoordinates: 'forbidden' }), /privacy_field_forbidden:gpsCoordinates/);
  assert.throws(() => assertWp006bRightsRecord({ ...rightsRecord(), recommendation: 'BLOCK' }), /forbidden_field:recommendation/);
});

test('WP006B rejects source-family split leakage and duplicate sample IDs', () => {
  assert.doesNotThrow(() => assertWp006bSourceFamilySplits([
    { sampleId: 'a', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
    { sampleId: 'a-descendant', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
  ]));
  assert.throws(() => assertWp006bSourceFamilySplits([
    { sampleId: 'a', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
    { sampleId: 'a-descendant', sourceFamilyId: 'family-a', split: 'HOLDOUT' },
  ]), /source_family_split_leak/);
  assert.throws(() => assertWp006bSourceFamilySplits([
    { sampleId: 'a', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
    { sampleId: 'a', sourceFamilyId: 'family-b', split: 'HOLDOUT' },
  ]), /duplicate_sample_id/);
});

test('WP006B groups exact duplicate bytes inside one family only', () => {
  const duplicateA = sample({ sampleId: 'a', sourceFamilyId: 'family-a', contentSha256: 'b'.repeat(64), duplicateOfSampleId: 'b' });
  const duplicateB = sample({ sampleId: 'b', sourceFamilyId: 'family-a', contentSha256: 'b'.repeat(64), duplicateOfSampleId: 'a' });
  assert.doesNotThrow(() => assertWp006bDuplicateHashHandling([duplicateA, duplicateB]));
  assert.throws(() => assertWp006bDuplicateHashHandling([
    duplicateA,
    sample({ sampleId: 'b', sourceFamilyId: 'family-b', contentSha256: 'b'.repeat(64), duplicateOfSampleId: 'a' }),
  ]), /exact_duplicate_cross_family/);
  assert.throws(() => assertWp006bDuplicateHashHandling([
    sample({ sampleId: 'a', sourceFamilyId: 'family-a', contentSha256: 'b'.repeat(64) }),
    duplicateB,
  ]), /duplicate_reference_missing/);
});

test('WP006B requires parent, family, relation, and mask linkage for edits', () => {
  const parent = sample({ sampleId: 'parent', groupId: 'edit-family', sourceFamilyId: 'edit-family' });
  const child = sample({
    sampleId: 'child',
    sourceFamilyId: 'edit-family',
    parentSampleId: 'parent',
    sourceLineage: { relation: 'EDITED_CHILD', parentSampleId: 'parent', familyEvidence: 'OWNER_CONFIRMATION_REQUIRED' },
    truthAxes: { ...sample().truthAxes, localManipulation: 'TRUE' },
    truthLocalManipulation: 'TRUE',
    mask: {
      maskReference: 'masks/child.json',
      maskSha256: 'c'.repeat(64),
      operation: 'SPLICE',
      parameters: {},
      region: { x: 1, y: 1, width: 2, height: 2 },
    },
  });
  assert.doesNotThrow(() => assertWp006bParentEditLinkage([parent, child]));
  assert.throws(() => assertWp006bParentEditLinkage([child]), /parent_missing/);
  assert.throws(() => assertWp006bParentEditLinkage([parent, { ...child, sourceFamilyId: 'other-family' }]), /parent_family_mismatch/);
  assert.throws(() => assertWp006bParentEditLinkage([parent, { ...child, mask: null }]), /edit_mask_missing/);
  assert.throws(() => assertWp006bBenchmarkManifest({
    ...manifest,
    samples: [parent, { ...child, groupId: 'edit-family', mask: { ...child.mask, region: { x: 1, y: 1, width: 0, height: 2 } } }],
  }), /mask_region_invalid/);
});

test('WP006B keeps device and generator holdouts isolated', () => {
  assert.throws(() => assertWp006bHoldoutBoundaries([{ split: 'DEVICE_HOLDOUT', cameraDeviceFamily: null, generatorFamily: null }]), /device_holdout_identity_missing/);
  assert.throws(() => assertWp006bHoldoutBoundaries([{ split: 'GENERATOR_HOLDOUT', cameraDeviceFamily: null, generatorFamily: null }]), /generator_holdout_identity_missing/);
  assert.throws(() => assertWp006bHoldoutBoundaries([
    { split: 'CALIBRATION', cameraDeviceFamily: 'device-a', generatorFamily: null },
    { split: 'DEVICE_HOLDOUT', cameraDeviceFamily: 'device-a', generatorFamily: null },
  ]), /device_holdout_leak/);
  assert.throws(() => assertWp006bHoldoutBoundaries([
    { split: 'CALIBRATION', cameraDeviceFamily: null, generatorFamily: 'generator-a' },
    { split: 'GENERATOR_HOLDOUT', cameraDeviceFamily: null, generatorFamily: 'generator-a' },
  ]), /generator_holdout_leak/);
});

test('WP006B fingerprint input is deterministic and contains no oracle fields', () => {
  const first = buildWp006bFingerprintInput({ manifest, rights, splits });
  const second = buildWp006bFingerprintInput({
    manifest: { ...manifest, samples: [...manifest.samples].reverse() },
    rights: { records: [...rights.records].reverse() },
    splits: { assignments: [...splits.assignments].reverse(), policy: splits.policy },
  });
  assert.equal(stableStringify(first), stableStringify(second));
  const parentChanged = buildWp006bFingerprintInput({
    manifest: { ...manifest, samples: manifest.samples.map((item, index) => index === 0 ? { ...item, parentSampleId: 'changed-parent' } : item) },
    rights,
    splits,
  });
  assert.notEqual(stableStringify(first), stableStringify(parentChanged));
  assert.equal(JSON.stringify(first).includes('groundTruth'), false);
  assert.equal(JSON.stringify(first).includes('caseExpectation'), false);
  assert.equal(fingerprint.schemaVersion, WP006B_FINGERPRINT_SCHEMA_VERSION);
  assert.equal(fingerprint.fingerprintSha256.length, 64);
  assert.equal(rights.schemaVersion, WP006B_RIGHTS_SCHEMA_VERSION);
  assert.equal(splits.schemaVersion, WP006B_SPLITS_SCHEMA_VERSION);
});

test('WP006B owner questions do not request technical or private fields', () => {
  const keys = new Set();
  const collectKeys = (value) => {
    if (Array.isArray(value)) return value.forEach(collectKeys);
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach((key) => {
      keys.add(key);
      collectKeys(value[key]);
    });
  };
  collectKeys(ownerTemplate);
  for (const forbidden of ['contentSha256', 'perceptualHash', 'byteSize', 'width', 'height', 'logicalFileReference', 'fullPath', 'gps', 'serialNumber']) assert.equal(keys.has(forbidden), false, forbidden);
  for (const forbidden of ['groundTruth', 'expectedPrimary', 'authenticityVerdict', 'recommendation']) assert.equal(keys.has(forbidden), false, forbidden);
});

test('WP006B EF2 lineage review scopes only active and complete device-holdout camera families', () => {
  assert.equal(ef2LineageReview.schemaVersion, 'lythaus-wp006b-ef2-owner-lineage-review-v1');
  assert.equal(ef2LineageReview.benchmarkCommit, '6f4154af3781efcf4ed643f0c08caa2a51ddf5a1');
  assert.equal(ef2LineageReview.benchmarkFingerprint, fingerprint.fingerprintSha256);
  assert.deepEqual(ef2LineageReview.summary.EF2_ACTIVE_FAMILIES_REQUIRING_CONFIRMATION, 32);
  assert.deepEqual(ef2LineageReview.summary.EF2_HOLDOUT_FAMILIES_REQUIRING_CONFIRMATION, 33);
  assert.equal(ef2LineageReview.summary.EF2_FAMILIES_ALREADY_SATISFACTORY, 0);
  assert.equal(ef2LineageReview.summary.EF2_FAMILIES_EXCLUDED_BEFORE_OWNER_REVIEW, 0);
  assert.equal(ef2LineageReview.summary.EF2_CAMERA_FAMILIES_OUT_OF_REVIEW_SCOPE, 394);
  assert.equal(ef2LineageReview.records.length, 65);
  assert.equal(new Set(ef2LineageReview.records.map((item) => item.sourceFamilyId)).size, 65);
  const questionFields = ef2LineageReview.questionContract.map((item) => item.field);
  assert.deepEqual(questionFields, ['nativeStatus', 'knownEdited', 'screenRecapture', 'syntheticDepictedContent', 'nativeOriginalAvailable']);
  assert.ok(ef2LineageReview.records.every((item) => JSON.stringify(Object.keys(item.answers)) === JSON.stringify(questionFields)));
  assert.ok(ef2LineageReview.records.every((item) => Object.values(item.answers).every((answer) => answer === null)));
  assert.equal(ef2LineageReview.records.filter((item) => item.reviewScope === 'EF2_ACTIVE_BENCHMARK').length, 32);
  assert.equal(ef2LineageReview.records.filter((item) => item.reviewScope === 'EF2_COMPLETE_DEVICE_HOLDOUT').length, 33);
  assert.ok(ef2LineageReview.records.every((item) => item.sanitizedLogicalReference.startsWith('camera/')));
  const reviewText = JSON.stringify(ef2LineageReview);
  for (const forbidden of ['relativePath', 'absolutePath', 'ownerProvidedName', 'perceptualHash', 'contentSha256', 'gpsCoordinates', 'serialNumber']) assert.equal(reviewText.includes(forbidden), false, forbidden);
  assert.equal(questionFields.includes('permissionForInternalResearch'), false);
});
