import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_BENCHMARK_COMMIT = '3dc22f117d1106b570251b80286bb9bb18a7bbe4';
const ATTESTATION_ID = 'WP006B-OWNER-BATCH-CAMERA-LINEAGE-V1';
const ATTESTATION_TEXT = 'All images in my Lythaus camera collection were taken by me with physical cameras/phones. Unless I explicitly identify an exception, they are the files I retained from those captures, I did not intentionally edit them, they are not screenshots or photographs of screens, and they do not intentionally depict AI-generated content. I authorize Lythaus to use them for this research. Where Codex cannot establish whether a file is the exact native camera byte-for-byte original versus an OS/cloud/exported copy, that field may remain UNKNOWN rather than being guessed.';
const OWNER_KNOWN_EXCEPTIONS = 'NONE';
const ANSWERS = Object.freeze({
  nativeStatus: 'UNKNOWN',
  knownEdited: 'NO',
  screenRecapture: 'NO',
  syntheticDepictedContent: 'NO',
  nativeOriginalAvailable: 'UNKNOWN',
});

const DEFAULTS = Object.freeze({
  manifest: 'research/wp006b/benchmark-manifest.json',
  reserved: 'research/wp006b/reserved-holdout-manifest.json',
  inventory: 'research/wp006b/owner-pool-inventory.json',
  review: 'research/wp006b/ef2-owner-lineage-review.json',
  rights: 'research/wp006b/benchmark-rights.json',
  splits: 'research/wp006b/benchmark-splits.json',
  fingerprint: 'research/wp006b/benchmark-fingerprint.json',
  gap: 'research/wp006b/benchmark-gap.json',
  attestation: 'research/wp006b/ef2-owner-batch-attestation.json',
  readiness: 'research/wp006b/ef2-data-readiness.json',
});

const RIGHTS_FIELDS = [
  'codeRights',
  'weightRights',
  'sourceMediaRights',
  'dataRights',
  'evaluationRights',
  'internalResearchRights',
  'commercialProductEvaluationRights',
  'redistributionRights',
  'publicRedistributionRights',
  'thirdPartyRedistributionRights',
];

function parseArgs(args) {
  const options = { ...DEFAULTS, benchmarkCommit: DEFAULT_BENCHMARK_COMMIT, attestationDate: null };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) throw new Error('invalid_argument:' + key);
    index += 1;
    if (key === '--benchmark-commit') options.benchmarkCommit = value;
    else if (key === '--attestation-date') options.attestationDate = value;
    else if (Object.hasOwn(DEFAULTS, key.slice(2))) options[key.slice(2)] = value;
    else throw new Error('unknown_argument:' + key);
  }
  return options;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), 'utf8'));
}

async function writeJson(relativePath, value) {
  await writeFile(path.resolve(ROOT, relativePath), JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function assertSafety(manifest, reserved, inventory) {
  assertCondition(manifest.originalFilesModified === false, 'manifest_media_modified');
  assertCondition(manifest.mediaCommittedToGit === false, 'manifest_media_committed');
  assertCondition(manifest.specialistInferenceRun === false, 'manifest_inference_run');
  assertCondition(reserved.mediaCommittedToGit === false, 'reserved_media_committed');
  assertCondition(reserved.specialistInferenceRun === false, 'reserved_inference_run');
  assertCondition(inventory.originalFilesModified === false, 'inventory_media_modified');
  assertCondition(inventory.mediaCommittedToGit === false, 'inventory_media_committed');
  assertCondition(inventory.specialistInferenceRun === false, 'inventory_inference_run');
}

function cameraOriginal(record) {
  return record.candidateCategory === 'CAMERA_ORIGINAL_CANDIDATE' && record.mediaType !== 'video';
}

function assertSetEqual(left, right, code) {
  assertCondition(left.size === right.size, code + ':size:' + left.size + ':' + right.size);
  for (const value of left) assertCondition(right.has(value), code + ':missing:' + value);
}

function applyAttestation(record) {
  const truthAxes = {
    ...record.truthAxes,
    physicalCameraAcquisition: 'TRUE',
    syntheticDepictedContent: 'FALSE',
    localManipulation: 'FALSE',
    screenRecapture: 'FALSE',
  };
  const truthConfidence = {
    ...record.truthConfidence,
    physicalCameraAcquisition: 'OWNER_CONFIRMED',
    syntheticDepictedContent: 'OWNER_CONFIRMED',
    localManipulation: 'OWNER_CONFIRMED',
    screenRecapture: 'OWNER_CONFIRMED',
  };
  return {
    ...record,
    truthAxes,
    truthConfidence,
    truthSynthetic: 'FALSE',
    truthLocalManipulation: 'FALSE',
    truthBasis: 'OWNER_CONFIRMED',
    ownerConfirmationReference: 'ef2-owner-batch-attestation.json#/records/' + record.sampleId,
  };
}

function updateSelectedRecords(records, familyIds) {
  let updated = 0;
  const next = records.map((record) => {
    if (!cameraOriginal(record) || !familyIds.has(record.sourceFamilyId)) return record;
    updated += 1;
    return applyAttestation(record);
  });
  return { records: next, updated };
}

function truthAxes(value) {
  return {
    physicalCameraAcquisition: value.physicalCameraAcquisition,
    syntheticDepictedContent: value.syntheticDepictedContent,
    localManipulation: value.localManipulation,
    digitalCapture: value.digitalCapture,
    screenRecapture: value.screenRecapture,
  };
}

function truthConfidence(value) {
  return {
    physicalCameraAcquisition: value.physicalCameraAcquisition,
    syntheticDepictedContent: value.syntheticDepictedContent,
    localManipulation: value.localManipulation,
    digitalCapture: value.digitalCapture,
    screenRecapture: value.screenRecapture,
  };
}

function buildFingerprintInput(manifest, rights, splits, inventory, reserved) {
  return {
    manifestVersion: manifest.schemaVersion,
    samples: manifest.samples.map((sample) => ({
      sampleId: sample.sampleId,
      sourceFamilyId: sample.sourceFamilyId,
      contentSha256: sample.contentSha256,
      parentSampleId: sample.parentSampleId,
      mask: sample.mask === null ? null : {
        maskReference: sample.mask.maskReference,
        maskSha256: sample.mask.maskSha256,
        operation: sample.mask.operation,
        parameters: sample.mask.parameters,
        region: sample.mask.region,
      },
      truthAxes: truthAxes(sample.truthAxes),
      truthConfidence: truthConfidence(sample.truthConfidence),
      hardNegativeType: sample.hardNegativeType,
      split: sample.split,
      poolRole: sample.poolRole,
      rightsRecordId: sample.rightsRecordId,
    })).sort((left, right) => left.sampleId.localeCompare(right.sampleId)),
    rights: rights.records.map((record) => ({
      rightsRecordId: record.rightsRecordId,
      sampleId: record.sampleId,
      sourceFamilyId: record.sourceFamilyId,
      rights: Object.fromEntries(RIGHTS_FIELDS.map((key) => [key, record[key]])),
      readiness: record.readiness,
    })).sort((left, right) => left.rightsRecordId.localeCompare(right.rightsRecordId)),
    splitAssignments: splits.assignments.map((assignment) => ({
      sampleId: assignment.sampleId,
      sourceFamilyId: assignment.sourceFamilyId,
      split: assignment.split,
    })).sort((left, right) => left.sampleId.localeCompare(right.sampleId)),
    splitPolicy: splits.policy,
    poolMembership: inventory.entries.map((entry) => ({
      sampleId: entry.sampleId,
      sourceFamilyId: entry.sourceFamilyId,
      contentSha256: entry.contentSha256,
      poolRole: entry.poolRole,
      split: entry.split,
      nearDuplicateGroupId: entry.nearDuplicateGroupId ?? null,
    })).sort((left, right) => left.sampleId.localeCompare(right.sampleId)),
    reservedHoldoutFamilies: [...new Set(reserved.records.map((record) => record.sourceFamilyId))].sort(),
  };
}

function safeReference(reviewByFamily, record) {
  const reviewRecord = reviewByFamily.get(record.sourceFamilyId);
  if (reviewRecord?.sanitizedLogicalReference) return reviewRecord.sanitizedLogicalReference;
  return 'camera-family/' + record.sampleId;
}

function attestationRecord(record, reviewByFamily, reviewScope) {
  return {
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    sanitizedLogicalReference: safeReference(reviewByFamily, record),
    deviceFamily: record.cameraDeviceFamily ?? null,
    reviewScope,
    split: record.split,
    lineage: { ...ANSWERS },
    truthConfidence: {
      physicalCameraAcquisition: 'OWNER_CONFIRMED',
      knownEdited: 'OWNER_CONFIRMED',
      screenRecapture: 'OWNER_CONFIRMED',
      syntheticDepictedContent: 'OWNER_CONFIRMED',
      nativeStatus: 'UNKNOWN',
      nativeOriginalAvailable: 'UNKNOWN',
    },
  };
}

function resolvedReviewRecord(record, updatedRecord, fingerprint) {
  return {
    ...record,
    deviceFamily: updatedRecord.cameraDeviceFamily ?? null,
    currentLineageStatus: { ...record.currentLineageStatus, ...ANSWERS },
    reasonHumanConfirmationIsRequired: 'NONE; resolved by the owner batch attestation. Native/export byte lineage remains UNKNOWN.',
    resolutionStatus: 'RESOLVED_BY_OWNER_BATCH_ATTESTATION',
    ownerBatchAttestationId: ATTESTATION_ID,
    answers: { ...ANSWERS },
    benchmarkFingerprint: fingerprint,
  };
}

const options = parseArgs(process.argv.slice(2));
const manifest = await readJson(options.manifest);
const reserved = await readJson(options.reserved);
const inventory = await readJson(options.inventory);
const review = await readJson(options.review);
const rights = await readJson(options.rights);
const splits = await readJson(options.splits);
const priorFingerprint = await readJson(options.fingerprint);
const gap = await readJson(options.gap);

assertSafety(manifest, reserved, inventory);
assertCondition(review.records?.length === 65, 'lineage_review_record_count_unexpected');
assertCondition(splits.deviceHoldout?.status === 'PREDECLARED', 'device_holdout_not_predeclared');

const activeFamilies = new Set(manifest.samples
  .filter((record) => cameraOriginal(record) && record.poolRole === 'ACTIVE_MICROBENCH')
  .map((record) => record.sourceFamilyId));
const holdoutFamilies = new Set(reserved.records
  .filter((record) => cameraOriginal(record) && record.split === 'DEVICE_HOLDOUT')
  .map((record) => record.sourceFamilyId));
const reviewActiveFamilies = new Set(review.records
  .filter((record) => record.reviewScope === 'EF2_ACTIVE_BENCHMARK')
  .map((record) => record.sourceFamilyId));
const reviewHoldoutFamilies = new Set(review.records
  .filter((record) => record.reviewScope === 'EF2_COMPLETE_DEVICE_HOLDOUT')
  .map((record) => record.sourceFamilyId));

assertSetEqual(reviewActiveFamilies, activeFamilies, 'review_active_scope_mismatch');
assertSetEqual(reviewHoldoutFamilies, holdoutFamilies, 'review_holdout_scope_mismatch');
assertCondition(activeFamilies.size === 32, 'active_family_count_unexpected:' + activeFamilies.size);
assertCondition(holdoutFamilies.size === 33, 'holdout_family_count_unexpected:' + holdoutFamilies.size);

const activeResult = updateSelectedRecords(manifest.samples, activeFamilies);
const holdoutResult = updateSelectedRecords(reserved.records, holdoutFamilies);
const inventoryFamilySet = new Set([...activeFamilies, ...holdoutFamilies]);
const inventoryResult = updateSelectedRecords(inventory.entries, inventoryFamilySet);
assertCondition(activeResult.updated === 32, 'active_records_updated_unexpected:' + activeResult.updated);
assertCondition(holdoutResult.updated === 33, 'holdout_records_updated_unexpected:' + holdoutResult.updated);
assertCondition(inventoryResult.updated === 65, 'inventory_records_updated_unexpected:' + inventoryResult.updated);

const nextManifest = {
  ...manifest,
  counts: {
    ...manifest.counts,
    ef2ActiveLineageAttestedFamilies: 32,
    ef2DeviceHoldoutLineageAttestedFamilies: 33,
    ef2LineageAttestedFamilies: 65,
  },
  samples: activeResult.records,
};
const nextReserved = {
  ...reserved,
  counts: {
    ...reserved.counts,
    ef2DeviceHoldoutLineageAttestedFamilies: 33,
  },
  records: holdoutResult.records,
};
const nextInventory = { ...inventory, entries: inventoryResult.records };

const canonicalInput = buildFingerprintInput(nextManifest, rights, splits, nextInventory, nextReserved);
const fingerprintSha256 = createHash('sha256').update(stableStringify(canonicalInput)).digest('hex');
const nextFingerprint = {
  ...priorFingerprint,
  benchmarkVersion: nextManifest.schemaVersion,
  fingerprintSha256,
  canonicalInput,
};

const reviewByFamily = new Map(review.records.map((record) => [record.sourceFamilyId, record]));
const activeRecords = nextManifest.samples.filter((record) => cameraOriginal(record) && activeFamilies.has(record.sourceFamilyId));
const holdoutRecords = nextReserved.records.filter((record) => cameraOriginal(record) && holdoutFamilies.has(record.sourceFamilyId));
const attestationRecords = [
  ...activeRecords.map((record) => attestationRecord(record, reviewByFamily, 'EF2_ACTIVE_BENCHMARK')),
  ...holdoutRecords.map((record) => attestationRecord(record, reviewByFamily, 'EF2_COMPLETE_DEVICE_HOLDOUT')),
].sort((left, right) => left.sourceFamilyId.localeCompare(right.sourceFamilyId));
assertCondition(attestationRecords.length === 65, 'attestation_record_count_unexpected:' + attestationRecords.length);

const nextReview = {
  ...review,
  schemaVersion: 'lythaus-wp006b-ef2-owner-lineage-review-v2',
  reviewDate: options.attestationDate ?? manifest.researchDate,
  benchmarkCommit: options.benchmarkCommit,
  benchmarkFingerprint: fingerprintSha256,
  ownerBatchAttestationId: ATTESTATION_ID,
  manualReviewStatus: 'NOT_REQUIRED_BATCH_ATTESTATION_APPLIED',
  OWNER_KNOWN_EXCEPTIONS,
  summary: {
    ...review.summary,
    EF2_ACTIVE_FAMILIES_REQUIRING_CONFIRMATION: 0,
    EF2_HOLDOUT_FAMILIES_REQUIRING_CONFIRMATION: 0,
    EF2_FAMILIES_RESOLVED_BY_BATCH_ATTESTATION: 65,
  },
  records: review.records.map((record) => {
    const updated = nextManifest.samples.find((candidate) => candidate.sourceFamilyId === record.sourceFamilyId)
      ?? nextReserved.records.find((candidate) => candidate.sourceFamilyId === record.sourceFamilyId);
    assertCondition(updated, 'review_source_family_missing:' + record.sourceFamilyId);
    return resolvedReviewRecord(record, updated, fingerprintSha256);
  }),
};

const nextAttestation = {
  schemaVersion: 'lythaus-wp006b-ef2-owner-batch-attestation-v1',
  benchmarkVersion: nextManifest.schemaVersion,
  attestationId: ATTESTATION_ID,
  attestationDate: options.attestationDate ?? manifest.researchDate,
  ownerBatchAttestation: ATTESTATION_TEXT,
  OWNER_KNOWN_EXCEPTIONS,
  ownerAuthorization: 'ALREADY_RECORDED; NO_PERMISSION_QUESTIONS',
  scope: {
    selectedActiveFamilies: 32,
    selectedDeviceHoldoutFamilies: 33,
    activeDeviceFamilies: [...new Set(activeRecords.map((record) => record.cameraDeviceFamily).filter(Boolean))].sort(),
    deviceHoldoutFamilies: [...new Set(holdoutRecords.map((record) => record.cameraDeviceFamily).filter(Boolean))].sort(),
    deviceFamilyNote: 'Owner states the LGE photos are from an old LG smartphone.',
  },
  appliedLineage: { ...ANSWERS },
  interpretation: {
    physicalCameraAcquisition: 'TRUE',
    knownEdited: 'NO',
    screenRecapture: 'NO',
    syntheticDepictedContent: 'NO',
    nativeStatus: 'UNKNOWN',
    nativeOriginalAvailable: 'UNKNOWN',
  },
  records: attestationRecords,
  benchmarkFingerprint: fingerprintSha256,
  specialistInferenceRun: false,
  mediaModified: false,
  rightsQuestionsRequested: false,
  limitations: [
    'Owner attestation is the provenance source for the selected families; EXIF is corroboration only.',
    'Native/export byte lineage remains UNKNOWN and is not guessed.',
    'This attestation enables bounded EF2 feasibility preparation, not directional validation, commercial accuracy, or human-FPR claims.',
  ],
};

const nextReadiness = {
  schemaVersion: 'lythaus-wp006b-ef2-data-readiness-v1',
  benchmarkVersion: nextManifest.schemaVersion,
  readinessDate: options.attestationDate ?? manifest.researchDate,
  benchmarkCommit: options.benchmarkCommit,
  EF2_DATA_READINESS: 'READY_FOR_BOUNDED_FEASIBILITY',
  attestationId: ATTESTATION_ID,
  activeFamilies: 32,
  deviceHoldoutFamilies: 33,
  deviceFamilies: {
    active: [...new Set(activeRecords.map((record) => record.cameraDeviceFamily).filter(Boolean))].sort(),
    holdout: [...new Set(holdoutRecords.map((record) => record.cameraDeviceFamily).filter(Boolean))].sort(),
  },
  ownerAttestedLineage: { ...ANSWERS },
  prerequisites: {
    ownerBatchAttestationApplied: true,
    sourceFamilyLeakage: 'PASS',
    deviceHoldoutLeakage: 'PASS',
    benchmarkFingerprint: fingerprintSha256,
    specialistInferenceRun: false,
  },
  boundedUse: 'EF2 pixel-domain feasibility and enrollment/device-holdout preparation only.',
  deferredClaims: [
    'EF2_DIRECTIONAL_VALIDATION',
    'NATIVE_BYTE_ORIGINALITY',
    'UNSEEN_DEVICE_GENERALIZATION',
    'COMMERCIAL_ACCURACY',
    'HUMAN_FALSE_POSITIVE_RATE',
  ],
  nextStep: 'WP006C may be prepared only after WP006B PR review and merge; WP006C is not started by this artifact.',
};

const nextGap = {
  ...gap,
  ef2DataReadiness: 'READY_FOR_BOUNDED_FEASIBILITY',
  ef2ReadinessArtifact: options.readiness,
  technicalGaps: {
    ...gap.technicalGaps,
    cameraTechnicalLineage: 'OWNER_BATCH_ATTESTATION_APPLIED; NATIVE_BYTE_LINEAGE_REMAINS_UNKNOWN',
  },
  activeMicrobench: {
    ...gap.activeMicrobench,
    ef2ActiveLineageAttestedFamilies: 32,
    ef2DeviceHoldoutLineageAttestedFamilies: 33,
  },
};

await writeJson(options.manifest, nextManifest);
await writeJson(options.reserved, nextReserved);
await writeJson(options.inventory, nextInventory);
await writeJson(options.fingerprint, nextFingerprint);
await writeJson(options.review, nextReview);
await writeJson(options.attestation, nextAttestation);
await writeJson(options.readiness, nextReadiness);
await writeJson(options.gap, nextGap);

console.log(JSON.stringify({
  attestationId: ATTESTATION_ID,
  activeFamilies: activeFamilies.size,
  holdoutFamilies: holdoutFamilies.size,
  updatedInventoryRecords: inventoryResult.updated,
  EF2_DATA_READINESS: nextReadiness.EF2_DATA_READINESS,
  fingerprintSha256,
  specialistInferenceRun: false,
}));
