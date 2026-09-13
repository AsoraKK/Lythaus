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
    },
    truthAxes: {
      physicalCameraAcquisition: 'UNKNOWN',
      syntheticDepictedContent: 'UNKNOWN',
      localManipulation: 'UNKNOWN',
      digitalCapture: 'UNKNOWN',
      screenRecapture: 'UNKNOWN',
    },
    truthSynthetic: 'UNKNOWN',
    truthLocalManipulation: 'UNKNOWN',
    truthBasis: 'OWNER_CONFIRMATION_REQUIRED',
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
    readiness: 'PROVENANCE_CONFIRMATION_REQUIRED',
    reasonCodes: ['OWNER_CONFIRMATION_REQUIRED'],
    ...overrides,
  };
}

test('WP006B materializes and validates the owner seed without inference', () => {
  assert.doesNotThrow(() => assertWp006bBenchmarkManifest(manifest));
  assert.doesNotThrow(() => assertWp006bRightsManifest(rights));
  assert.doesNotThrow(() => assertWp006bSplitsManifest(splits));
  assert.doesNotThrow(() => assertWp006bFingerprint(fingerprint));
  assert.equal(manifest.schemaVersion, WP006B_BENCHMARK_SCHEMA_VERSION);
  assert.equal(manifest.specialistInferenceRun, false);
  assert.equal(manifest.counts.ownerSeedImages, 18);
  assert.equal(manifest.counts.independentSourceFamilies, 18);
  assert.equal(manifest.counts.cameraFamilies, 8);
  assert.equal(manifest.counts.syntheticFamilies, 6);
  assert.equal(manifest.counts.hardNegativeFamilies, 4);
  assert.equal(manifest.counts.mixedOriginFamilies, 0);
  assert.equal(manifest.counts.partialEditFamilies, 0);
  assert.equal(new Set(manifest.samples.map((item) => item.sourceFamilyId)).size, 18);
  assert.ok(manifest.samples.every((item) => Object.values(item.truthAxes).every((axis) => axis === 'UNKNOWN')));
  assert.ok(rights.records.every((item) => item.readiness === 'PROVENANCE_CONFIRMATION_REQUIRED'));
  assert.ok(splits.assignments.every((item) => item.eligible === false));
  assert.deepEqual(splits.policy, {
    sourceFamilyBoundary: true,
    cameraDeviceBoundary: true,
    generatorFamilyHoldout: true,
    descendantsStayWithParent: true,
    scoringRequiresOwnerConfirmation: true,
    scoringRequiresRightsClosure: true,
  });
  assert.equal(ownerTemplate.samples.length, 18);
  assert.ok(ownerTemplate.samples.every((item) => Array.isArray(item.responseFields) && item.responseFields.includes('ownerConfirmed')));
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
  const parent = sample({ sampleId: 'parent', sourceFamilyId: 'edit-family' });
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
