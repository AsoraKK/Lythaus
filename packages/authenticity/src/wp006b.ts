import type { JsonValue } from './contracts.ts';

export const WP006B_BENCHMARK_SCHEMA_VERSION = 'lythaus-forensic-microbench-v0' as const;
export const WP006B_RIGHTS_SCHEMA_VERSION = 'lythaus-wp006b-benchmark-rights-v1' as const;
export const WP006B_SPLITS_SCHEMA_VERSION = 'lythaus-wp006b-benchmark-splits-v1' as const;
export const WP006B_FINGERPRINT_SCHEMA_VERSION = 'lythaus-wp006b-benchmark-fingerprint-v1' as const;
export const WP006B_INVENTORY_SCHEMA_VERSION = 'lythaus-wp006b-owner-pool-inventory-v2' as const;

export const WP006B_TRUTH_VALUES = ['TRUE', 'FALSE', 'UNKNOWN'] as const;
export type Wp006bTruthValue = (typeof WP006B_TRUTH_VALUES)[number];

export const WP006B_TRUTH_CONFIDENCE_VALUES = ['OWNER_CONFIRMED', 'METADATA_CORROBORATED', 'DERIVED_DETERMINISTICALLY', 'UNKNOWN'] as const;
export type Wp006bTruthConfidence = (typeof WP006B_TRUTH_CONFIDENCE_VALUES)[number];

export const WP006B_HARD_NEGATIVE_TYPES = [
  'SCREENSHOT',
  'UI_CAPTURE',
  'DIGITAL_ART',
  'CGI_OR_3D_RENDER',
  'CHART',
  'DIAGRAM',
  'MEME',
  'COMPOSITE',
  'SCAN',
  'HEAVILY_EDITED_PHOTO',
  'TEXT_GRAPHIC',
  'VECTOR_GRAPHIC',
  'OTHER_DIGITAL_NON_AI',
  'UNKNOWN',
] as const;
export type Wp006bHardNegativeType = (typeof WP006B_HARD_NEGATIVE_TYPES)[number];

export const WP006B_POOL_ROLES = [
  'ACTIVE_MICROBENCH',
  'OWNER_RESERVED_FUTURE_HOLDOUT',
  'FUTURE_EXPANSION_POOL',
  'AMBIGUOUS_OR_EXCLUDED',
  'VIDEO_FUTURE_POOL',
] as const;
export type Wp006bPoolRole = (typeof WP006B_POOL_ROLES)[number];

export const WP006B_SPLIT_VALUES = [
  'CALIBRATION',
  'EVALUATION',
  'HOLDOUT',
  'DEVICE_HOLDOUT',
  'GENERATOR_HOLDOUT',
  'TRANSFORMATION_STRESS',
] as const;
export type Wp006bSplit = (typeof WP006B_SPLIT_VALUES)[number];

export const WP006B_CANDIDATE_CATEGORIES = [
  'CAMERA_ORIGINAL_CANDIDATE',
  'SYNTHETIC_CANDIDATE',
  'HARD_NEGATIVE_CANDIDATE',
  'MIXED_ORIGIN_CANDIDATE',
  'PARTIAL_EDIT_CANDIDATE',
] as const;
export type Wp006bCandidateCategory = (typeof WP006B_CANDIDATE_CATEGORIES)[number];

export const WP006B_ORIGIN_VALUES = [
  'CAMERA_NATIVE',
  'AI_GENERATED',
  'AI_EDITED',
  'TRADITIONAL_DIGITAL_ART',
  'CGI',
  'SCAN',
  'COMPOSITE',
  'SCREENSHOT',
  'UNKNOWN',
] as const;
export type Wp006bOrigin = (typeof WP006B_ORIGIN_VALUES)[number];

export const WP006B_EVALUATION_GATE_VALUES = ['ALLOW', 'DO_NOT_USE', 'REVIEW_REQUIRED', 'UNKNOWN'] as const;
export const WP006B_TRAINING_GATE_VALUES = ['ALLOW', 'DO_NOT_TRAIN', 'REVIEW_REQUIRED', 'UNKNOWN'] as const;
export const WP006B_DISTILLATION_GATE_VALUES = ['ALLOW', 'DO_NOT_DISTILL', 'REVIEW_REQUIRED', 'UNKNOWN'] as const;
export type Wp006bEvaluationGate = (typeof WP006B_EVALUATION_GATE_VALUES)[number];
export type Wp006bTrainingGate = (typeof WP006B_TRAINING_GATE_VALUES)[number];
export type Wp006bDistillationGate = (typeof WP006B_DISTILLATION_GATE_VALUES)[number];

export const WP006B_PRIVACY_FLAG_VALUES = ['NONE', 'PERSONAL_MEDIA', 'BIOMETRIC_CONTENT', 'GPS_PRESENT', 'SERIAL_PRESENT', 'PII_PRESENT', 'OWNER_RESTRICTED'] as const;
export type Wp006bPrivacyFlag = (typeof WP006B_PRIVACY_FLAG_VALUES)[number];

export const WP006B_RIGHTS_VALUES = ['CONFIRMED', 'UNRESOLVED', 'REVIEW_REQUIRED', 'NOT_APPLICABLE'] as const;
export type Wp006bRightsValue = (typeof WP006B_RIGHTS_VALUES)[number];

export const WP006B_READINESS_VALUES = [
  'READY_FOR_CALIBRATION',
  'READY_FOR_EVALUATION_ONLY',
  'PROVENANCE_CONFIRMATION_REQUIRED',
  'RIGHTS_REVIEW_REQUIRED',
  'NOT_AVAILABLE',
  'REJECT',
] as const;
export type Wp006bReadiness = (typeof WP006B_READINESS_VALUES)[number];

export const WP006B_CALIBRATION_STATUS_VALUES = [
  'UNVALIDATED',
  'MEASUREMENT_ONLY',
  'CALIBRATION_CANDIDATE',
  'DIRECTIONALLY_VALIDATED',
] as const;

export const WP006B_TRANSFORMATION_REGISTRY = [
  'JPEG95',
  'JPEG75',
  'resize75',
  'resize50',
  'crop10',
  'mildBlur',
  'mildSharpen',
  'metadataStripped',
  'screenshotStyleResampling',
] as const;

export interface Wp006bTruthAxes {
  physicalCameraAcquisition: Wp006bTruthValue;
  syntheticDepictedContent: Wp006bTruthValue;
  localManipulation: Wp006bTruthValue;
  digitalCapture: Wp006bTruthValue;
  screenRecapture: Wp006bTruthValue;
}

export interface Wp006bTruthConfidenceAxes {
  physicalCameraAcquisition: Wp006bTruthConfidence;
  syntheticDepictedContent: Wp006bTruthConfidence;
  localManipulation: Wp006bTruthConfidence;
  digitalCapture: Wp006bTruthConfidence;
  screenRecapture: Wp006bTruthConfidence;
}

export interface Wp006bSafeMetadata {
  exifPresent: boolean;
  xmpPresent: boolean;
  c2paPresent: boolean;
  encoderPresent: boolean;
  metadataAbsent: boolean;
  safeKeys: readonly string[];
  orientationTag: number | null;
  privacySensitiveMetadataFlags: readonly string[];
  cameraMakePresent: boolean;
  cameraModelPresent: boolean;
  captureTimestampPresent: boolean;
}

export interface Wp006bSourceLineage {
  relation: 'SOURCE_ORIGINAL' | 'DESCENDANT' | 'PARENT_EDIT' | 'EDITED_CHILD' | 'UNKNOWN';
  parentSampleId: string | null;
  familyEvidence: 'NO_RELATED_MEDIA_OBSERVED' | 'LIKELY_RELATED' | 'OWNER_CONFIRMATION_REQUIRED';
}

export interface Wp006bMaskLinkage {
  maskReference: string;
  maskSha256: string;
  operation: string;
  parameters: Record<string, JsonValue>;
  region: { x: number; y: number; width: number; height: number };
}

export interface Wp006bRightsRecord {
  rightsRecordId: string;
  sampleId: string;
  sourceFamilyId: string;
  codeRights: Wp006bRightsValue;
  weightRights: Wp006bRightsValue;
  sourceMediaRights: Wp006bRightsValue;
  dataRights: Wp006bRightsValue;
  evaluationRights: Wp006bRightsValue;
  internalResearchRights: Wp006bRightsValue;
  commercialProductEvaluationRights: Wp006bRightsValue;
  redistributionRights: Wp006bRightsValue;
  publicRedistributionRights: Wp006bRightsValue;
  thirdPartyRedistributionRights: Wp006bRightsValue;
  readiness: Wp006bReadiness;
  reasonCodes: readonly string[];
}

export interface Wp006bSampleRecord {
  sampleId: string;
  groupId: string;
  sourceFamilyId: string;
  ownerProvidedName: string;
  candidateCategory: Wp006bCandidateCategory;
  origin: Wp006bOrigin;
  transformation: 'ORIGINAL' | 'JPEG95' | 'JPEG75' | 'resize75' | 'resize50' | 'crop10' | 'mild_blur' | 'mild_sharpen' | 'metadata_stripped' | 'screenshot_style_resampling';
  logicalFileReference: string;
  sourceUrlOrAcquisitionId: string;
  contentSha256: string;
  perceptualHash: string | null;
  perceptualHashAlgorithm: string | null;
  byteSize: number;
  width: number;
  height: number;
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  safeMetadata: Wp006bSafeMetadata;
  truthAxes: Wp006bTruthAxes;
  truthConfidence: Wp006bTruthConfidenceAxes;
  truthSynthetic: Wp006bTruthValue;
  truthLocalManipulation: Wp006bTruthValue;
  truthBasis: 'OWNER_CONFIRMATION_REQUIRED' | 'OWNER_CONFIRMED' | 'SOURCE_DOCUMENTED';
  hardNegativeType: Wp006bHardNegativeType | null;
  generatorFamily: string | null;
  generatorModel: string | null;
  generatorVersion: string | null;
  cameraDeviceFamily: string | null;
  sourceDatasetId: string;
  sourceUrl: string | null;
  licenceClassification: string;
  rightsClass: 'CLASS_A_COMMERCIAL_TRAINING' | 'CLASS_B_EVALUATION_ONLY' | 'CLASS_C_LYTHAUS_OWNED' | 'MIXED_OR_UNCLEAR';
  evaluationGate: Wp006bEvaluationGate;
  trainingGate: Wp006bTrainingGate;
  distillationGate: Wp006bDistillationGate;
  consentStatus: 'OWNER_CONFIRMATION_REQUIRED' | 'OWNER_AUTHORIZED' | 'RELEASE_REQUIRED' | 'SOURCE_TERMS_RECORDED' | 'NOT_APPLICABLE';
  sourceLineage: Wp006bSourceLineage;
  parentSampleId: string | null;
  mask: Wp006bMaskLinkage | null;
  maskPathOrId: string | null;
  maskSha256: string | null;
  rightsRecordId: string;
  split: Wp006bSplit;
  calibrationEligible: boolean;
  evaluationEligible: boolean;
  trainingEligible: boolean;
  readiness: Wp006bReadiness;
  ownerConfirmationReference: string;
  poolRole: Wp006bPoolRole;
  retentionClass: 'MEDIA_EXTERNAL_CACHE' | 'DERIVED_MASK_EXTERNAL_CACHE' | 'MANIFEST_ONLY' | 'DELETE_AFTER_RUN';
  privacyFlags: readonly Wp006bPrivacyFlag[];
  privacyReview: 'PENDING_OWNER_REVIEW' | 'SENSITIVE_METADATA_FLAGGED' | 'CLEARED' | 'REJECTED';
  duplicateOfSampleId: string | null;
  nearestPerceptualDistance: number | null;
}

export interface Wp006bBenchmarkManifest {
  schemaVersion: typeof WP006B_BENCHMARK_SCHEMA_VERSION;
  benchmarkName: 'LYTHAUS_FORENSIC_MICROBENCH_V0';
  benchmarkStatus: 'FOUNDATION_ONLY_OWNER_CONFIRMATION_REQUIRED' | 'FOUNDATION_ONLY_INSUFFICIENT_DATA' | 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION';
  researchDate: string;
  repositoryStartingSha: string;
  sourceRootLabel: string;
  originalFilesModified: false;
  mediaCommittedToGit: false;
  specialistInferenceRun: false;
  samples: readonly Wp006bSampleRecord[];
  transformations: {
    status: 'DEFERRED_UNTIL_SOURCE_FAMILY_LOCKED';
    materializedDescendantCount: number;
    registeredKinds: readonly string[];
  };
  counts: Record<string, number>;
}

export interface Wp006bSplitAssignment {
  sampleId: string;
  sourceFamilyId: string;
  split: Wp006bSplit;
  eligible: false | true;
  eligibilityReason: string;
}

export interface Wp006bSplitsManifest {
  schemaVersion: typeof WP006B_SPLITS_SCHEMA_VERSION;
  benchmarkVersion: typeof WP006B_BENCHMARK_SCHEMA_VERSION;
  splitBoundary: 'SOURCE_FAMILY';
  policy: {
    sourceFamilyBoundary: true;
    cameraDeviceBoundary: true;
    generatorFamilyHoldout: true;
    descendantsStayWithParent: true;
    scoringRequiresOwnerConfirmation: true;
    scoringRequiresRightsClosure: true;
  };
  assignments: readonly Wp006bSplitAssignment[];
  deviceHoldout: { status: 'NOT_READY' | 'PREDECLARED'; families: readonly string[]; reason: string };
  generatorHoldout: { status: 'NOT_READY' | 'PREDECLARED'; families: readonly string[]; reason: string };
  transformationStress: { status: 'DEFERRED'; descendantsRemainWithParentFamily: true };
}

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
] as const;

const FORBIDDEN_KEYS = [
  'aiProbability',
  'authenticityVerdict',
  'caseExpectation',
  'contradictedHypotheses',
  'directionalRole',
  'enforcementAuthority',
  'expectedPrimary',
  'groundTruth',
  'humanProbability',
  'isFake',
  'isReal',
  'recommendation',
  'supports',
  'contradicts',
] as const;

const FORBIDDEN_PRIVACY_KEYS = /(gps|latitude|longitude|serial(number)?|bodyserialnumber|ownername|fullpath|absolutepath|privatepath)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoKeys(value: unknown, keys: readonly string[], errorCode: string): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoKeys(item, keys, errorCode);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (keys.includes(key)) throw new Error(`${errorCode}:${key}`);
    assertNoKeys(value[key], keys, errorCode);
  }
}

function assertNoPrivacyKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivacyKeys(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PRIVACY_KEYS.test(key)) throw new Error(`wp006b_privacy_field_forbidden:${key}`);
    assertNoPrivacyKeys(value[key]);
  }
}

function assertString(value: unknown, errorCode: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(errorCode);
}

function assertHex(value: unknown, length: number, errorCode: string): void {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value)) throw new Error(errorCode);
}

function assertRelativeReference(value: unknown, errorCode: string): void {
  assertString(value, errorCode);
  if (value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/u.test(value) || value.split('/').includes('..')) throw new Error(errorCode);
}

function assertTruthAxes(value: unknown): asserts value is Wp006bTruthAxes {
  if (!isRecord(value)) throw new Error('wp006b_truth_axes_invalid');
  for (const key of ['physicalCameraAcquisition', 'syntheticDepictedContent', 'localManipulation', 'digitalCapture', 'screenRecapture']) {
    if (!(WP006B_TRUTH_VALUES as readonly string[]).includes(String(value[key]))) throw new Error(`wp006b_truth_axis_invalid:${key}`);
  }
}

function assertTruthConfidence(value: unknown): asserts value is Wp006bTruthConfidenceAxes {
  if (!isRecord(value)) throw new Error('wp006b_truth_confidence_invalid');
  for (const key of ['physicalCameraAcquisition', 'syntheticDepictedContent', 'localManipulation', 'digitalCapture', 'screenRecapture']) {
    if (!(WP006B_TRUTH_CONFIDENCE_VALUES as readonly string[]).includes(String(value[key]))) throw new Error(`wp006b_truth_confidence_invalid:${key}`);
  }
}

function assertSafeMetadata(value: unknown): asserts value is Wp006bSafeMetadata {
  if (!isRecord(value)) throw new Error('wp006b_safe_metadata_invalid');
  for (const key of ['exifPresent', 'xmpPresent', 'c2paPresent', 'encoderPresent', 'metadataAbsent', 'cameraMakePresent', 'cameraModelPresent', 'captureTimestampPresent']) {
    if (typeof value[key] !== 'boolean') throw new Error(`wp006b_safe_metadata_boolean_invalid:${key}`);
  }
  if (!Array.isArray(value.safeKeys) || value.safeKeys.some((item) => typeof item !== 'string')) throw new Error('wp006b_safe_metadata_keys_invalid');
  if (value.orientationTag !== null && (typeof value.orientationTag !== 'number' || !Number.isInteger(value.orientationTag))) throw new Error('wp006b_orientation_invalid');
  if (!Array.isArray(value.privacySensitiveMetadataFlags) || value.privacySensitiveMetadataFlags.some((item) => typeof item !== 'string')) throw new Error('wp006b_privacy_flags_invalid');
}

function assertLineage(value: unknown): asserts value is Wp006bSourceLineage {
  if (!isRecord(value) || !['SOURCE_ORIGINAL', 'DESCENDANT', 'PARENT_EDIT', 'EDITED_CHILD', 'UNKNOWN'].includes(String(value.relation))) throw new Error('wp006b_lineage_invalid');
  if (value.parentSampleId !== null && typeof value.parentSampleId !== 'string') throw new Error('wp006b_lineage_parent_invalid');
  if (!['NO_RELATED_MEDIA_OBSERVED', 'LIKELY_RELATED', 'OWNER_CONFIRMATION_REQUIRED'].includes(String(value.familyEvidence))) throw new Error('wp006b_lineage_evidence_invalid');
}

export function assertWp006bRightsRecord(value: unknown): asserts value is Wp006bRightsRecord {
  assertNoKeys(value, FORBIDDEN_KEYS, 'wp006b_forbidden_field');
  assertNoPrivacyKeys(value);
  if (!isRecord(value)) throw new Error('wp006b_rights_record_invalid');
  for (const key of ['rightsRecordId', 'sampleId', 'sourceFamilyId']) assertString(value[key], `wp006b_rights_identity_invalid:${key}`);
  for (const key of RIGHTS_FIELDS) {
    if (!(WP006B_RIGHTS_VALUES as readonly string[]).includes(String(value[key]))) throw new Error(`wp006b_rights_value_invalid:${key}`);
  }
  if (!(WP006B_READINESS_VALUES as readonly string[]).includes(String(value.readiness))) throw new Error('wp006b_rights_readiness_invalid');
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((item) => typeof item !== 'string')) throw new Error('wp006b_rights_reason_codes_invalid');
}

function assertSample(value: unknown): asserts value is Wp006bSampleRecord {
  if (!isRecord(value)) throw new Error('wp006b_sample_invalid');
  for (const key of ['sampleId', 'groupId', 'sourceFamilyId', 'ownerProvidedName', 'candidateCategory', 'sourceDatasetId', 'sourceUrlOrAcquisitionId', 'rightsRecordId', 'ownerConfirmationReference']) assertString(value[key], `wp006b_sample_identity_invalid:${key}`);
  if (value.groupId !== value.sourceFamilyId) throw new Error('wp006b_group_family_alias_mismatch');
  if (!(WP006B_CANDIDATE_CATEGORIES as readonly string[]).includes(String(value.candidateCategory))) throw new Error('wp006b_sample_category_invalid');
  if (!(WP006B_ORIGIN_VALUES as readonly string[]).includes(String(value.origin))) throw new Error('wp006b_sample_origin_invalid');
  if (!['ORIGINAL', 'JPEG95', 'JPEG75', 'resize75', 'resize50', 'crop10', 'mild_blur', 'mild_sharpen', 'metadata_stripped', 'screenshot_style_resampling'].includes(String(value.transformation))) throw new Error('wp006b_sample_transformation_invalid');
  assertRelativeReference(value.logicalFileReference, 'wp006b_logical_reference_invalid');
  assertHex(value.contentSha256, 64, 'wp006b_content_hash_invalid');
  if (value.perceptualHash !== null && (typeof value.perceptualHash !== 'string' || !/^[01]{64}$/u.test(value.perceptualHash))) throw new Error('wp006b_perceptual_hash_invalid');
  if (value.perceptualHashAlgorithm !== null) assertString(value.perceptualHashAlgorithm, 'wp006b_perceptual_hash_algorithm_invalid');
  for (const key of ['byteSize', 'width', 'height']) {
    if (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || value[key] <= 0) throw new Error(`wp006b_sample_dimension_invalid:${key}`);
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(String(value.mime))) throw new Error('wp006b_sample_mime_invalid');
  assertSafeMetadata(value.safeMetadata);
  assertTruthAxes(value.truthAxes);
  assertTruthConfidence(value.truthConfidence);
  if (value.truthSynthetic !== value.truthAxes.syntheticDepictedContent || value.truthLocalManipulation !== value.truthAxes.localManipulation) throw new Error('wp006b_truth_alias_mismatch');
  if (!['OWNER_CONFIRMATION_REQUIRED', 'OWNER_CONFIRMED', 'SOURCE_DOCUMENTED'].includes(String(value.truthBasis))) throw new Error('wp006b_truth_basis_invalid');
  if (value.hardNegativeType !== null && !(WP006B_HARD_NEGATIVE_TYPES as readonly string[]).includes(String(value.hardNegativeType))) throw new Error('wp006b_hard_negative_type_invalid');
  if (value.candidateCategory === 'HARD_NEGATIVE_CANDIDATE' && value.hardNegativeType === null) throw new Error('wp006b_hard_negative_type_missing');
  if (value.candidateCategory !== 'HARD_NEGATIVE_CANDIDATE' && value.hardNegativeType !== null) throw new Error('wp006b_hard_negative_type_unexpected');
  if (typeof value.licenceClassification !== 'string' || value.licenceClassification.trim().length === 0) throw new Error('wp006b_licence_classification_invalid');
  if (!['CLASS_A_COMMERCIAL_TRAINING', 'CLASS_B_EVALUATION_ONLY', 'CLASS_C_LYTHAUS_OWNED', 'MIXED_OR_UNCLEAR'].includes(String(value.rightsClass))) throw new Error('wp006b_rights_class_invalid');
  if (!(WP006B_EVALUATION_GATE_VALUES as readonly string[]).includes(String(value.evaluationGate))) throw new Error('wp006b_gate_invalid:evaluationGate');
  if (!(WP006B_TRAINING_GATE_VALUES as readonly string[]).includes(String(value.trainingGate))) throw new Error('wp006b_gate_invalid:trainingGate');
  if (!(WP006B_DISTILLATION_GATE_VALUES as readonly string[]).includes(String(value.distillationGate))) throw new Error('wp006b_gate_invalid:distillationGate');
  if (!['OWNER_CONFIRMATION_REQUIRED', 'OWNER_AUTHORIZED', 'RELEASE_REQUIRED', 'SOURCE_TERMS_RECORDED', 'NOT_APPLICABLE'].includes(String(value.consentStatus))) throw new Error('wp006b_consent_status_invalid');
  assertLineage(value.sourceLineage);
  if (value.sourceUrl !== null && typeof value.sourceUrl !== 'string') throw new Error('wp006b_source_url_invalid');
  if (value.parentSampleId !== value.sourceLineage.parentSampleId) throw new Error('wp006b_parent_alias_mismatch');
  const mask = value.mask;
  if (mask !== null) {
    if (!isRecord(mask) || typeof mask.maskReference !== 'string' || typeof mask.maskSha256 !== 'string' || !isRecord(mask.region)) throw new Error('wp006b_mask_invalid');
    assertRelativeReference(mask.maskReference, 'wp006b_mask_reference_invalid');
    assertHex(mask.maskSha256, 64, 'wp006b_mask_hash_invalid');
    for (const key of ['x', 'y']) if (typeof mask.region[key] !== 'number' || !Number.isFinite(mask.region[key]) || mask.region[key] < 0) throw new Error(`wp006b_mask_region_invalid:${key}`);
    for (const key of ['width', 'height']) if (typeof mask.region[key] !== 'number' || !Number.isFinite(mask.region[key]) || mask.region[key] <= 0) throw new Error(`wp006b_mask_region_invalid:${key}`);
  }
  if (value.maskPathOrId !== null && typeof value.maskPathOrId !== 'string') throw new Error('wp006b_mask_path_invalid');
  if (value.maskSha256 !== null) assertHex(value.maskSha256, 64, 'wp006b_mask_hash_alias_invalid');
  if (mask === null && (value.maskPathOrId !== null || value.maskSha256 !== null)) throw new Error('wp006b_mask_alias_without_mask');
  if (mask !== null && isRecord(mask) && (value.maskPathOrId !== mask.maskReference || value.maskSha256 !== mask.maskSha256)) throw new Error('wp006b_mask_alias_mismatch');
  if (!(WP006B_SPLIT_VALUES as readonly string[]).includes(String(value.split))) throw new Error('wp006b_sample_split_invalid');
  for (const key of ['calibrationEligible', 'evaluationEligible', 'trainingEligible']) if (typeof value[key] !== 'boolean') throw new Error(`wp006b_sample_eligibility_invalid:${key}`);
  if (!(WP006B_READINESS_VALUES as readonly string[]).includes(String(value.readiness))) throw new Error('wp006b_sample_readiness_invalid');
  if (!(WP006B_POOL_ROLES as readonly string[]).includes(String(value.poolRole))) throw new Error('wp006b_pool_role_invalid');
  if (!['MEDIA_EXTERNAL_CACHE', 'DERIVED_MASK_EXTERNAL_CACHE', 'MANIFEST_ONLY', 'DELETE_AFTER_RUN'].includes(String(value.retentionClass))) throw new Error('wp006b_retention_invalid');
  if (!Array.isArray(value.privacyFlags) || value.privacyFlags.some((item) => !(WP006B_PRIVACY_FLAG_VALUES as readonly string[]).includes(String(item)))) throw new Error('wp006b_privacy_flags_invalid');
  if (!['PENDING_OWNER_REVIEW', 'SENSITIVE_METADATA_FLAGGED', 'CLEARED', 'REJECTED'].includes(String(value.privacyReview))) throw new Error('wp006b_privacy_review_invalid');
  if (value.duplicateOfSampleId !== null && typeof value.duplicateOfSampleId !== 'string') throw new Error('wp006b_duplicate_reference_invalid');
  if (value.nearestPerceptualDistance !== null && (typeof value.nearestPerceptualDistance !== 'number' || !Number.isInteger(value.nearestPerceptualDistance) || value.nearestPerceptualDistance < 0)) throw new Error('wp006b_nearest_distance_invalid');
}

export function assertWp006bSourceFamilySplits(entries: readonly Pick<Wp006bSampleRecord, 'sampleId' | 'sourceFamilyId' | 'split'>[]): void {
  const sampleIds = new Set<string>();
  const familySplits = new Map<string, Wp006bSplit>();
  for (const entry of entries) {
    assertString(entry.sampleId, 'wp006b_split_sample_invalid');
    assertString(entry.sourceFamilyId, 'wp006b_split_family_invalid');
    if (!(WP006B_SPLIT_VALUES as readonly string[]).includes(String(entry.split))) throw new Error('wp006b_split_invalid');
    if (sampleIds.has(entry.sampleId)) throw new Error(`wp006b_duplicate_sample_id:${entry.sampleId}`);
    sampleIds.add(entry.sampleId);
    const prior = familySplits.get(entry.sourceFamilyId);
    if (prior && prior !== entry.split) throw new Error(`wp006b_source_family_split_leak:${entry.sourceFamilyId}`);
    familySplits.set(entry.sourceFamilyId, entry.split);
  }
}

export function assertWp006bDuplicateHashHandling(samples: readonly Pick<Wp006bSampleRecord, 'sampleId' | 'sourceFamilyId' | 'contentSha256' | 'duplicateOfSampleId'>[]): void {
  const hashes = new Map<string, { sampleId: string; sourceFamilyId: string }[]>();
  for (const sample of samples) hashes.set(sample.contentSha256, [...(hashes.get(sample.contentSha256) ?? []), { sampleId: sample.sampleId, sourceFamilyId: sample.sourceFamilyId }]);
  for (const matches of hashes.values()) {
    if (matches.length < 2) {
      const only = matches[0];
      const sample = samples.find((candidate) => candidate.sampleId === only.sampleId);
      if (sample?.duplicateOfSampleId) throw new Error('wp006b_unique_sample_duplicate_reference');
      continue;
    }
    const families = new Set(matches.map((match) => match.sourceFamilyId));
    if (families.size > 1) throw new Error('wp006b_exact_duplicate_cross_family');
    for (const match of matches) {
      const sample = samples.find((candidate) => candidate.sampleId === match.sampleId);
      if (!sample || !sample.duplicateOfSampleId || !matches.some((other) => other.sampleId === sample.duplicateOfSampleId)) throw new Error('wp006b_duplicate_reference_missing');
    }
  }
}

export function assertWp006bParentEditLinkage(samples: readonly Pick<Wp006bSampleRecord, 'sampleId' | 'sourceFamilyId' | 'parentSampleId' | 'sourceLineage' | 'mask' | 'truthAxes'>[]): void {
  const byId = new Map(samples.map((sample) => [sample.sampleId, sample]));
  for (const sample of samples) {
    if (sample.truthAxes.localManipulation === 'TRUE' && !sample.parentSampleId) throw new Error(`wp006b_edit_parent_missing:${sample.sampleId}`);
    if (!sample.parentSampleId) continue;
    const parent = byId.get(sample.parentSampleId);
    if (!parent) throw new Error(`wp006b_parent_missing:${sample.sampleId}`);
    if (parent.sourceFamilyId !== sample.sourceFamilyId) throw new Error(`wp006b_parent_family_mismatch:${sample.sampleId}`);
    if (sample.sourceLineage.relation !== 'EDITED_CHILD' && sample.sourceLineage.relation !== 'DESCENDANT') throw new Error(`wp006b_parent_relation_invalid:${sample.sampleId}`);
    if (sample.truthAxes.localManipulation === 'TRUE' && !sample.mask) throw new Error(`wp006b_edit_mask_missing:${sample.sampleId}`);
  }
}

export function assertWp006bHoldoutBoundaries(samples: readonly Pick<Wp006bSampleRecord, 'split' | 'cameraDeviceFamily' | 'generatorFamily'>[]): void {
  const deviceSplits = new Map<string, Wp006bSplit>();
  const generatorSplits = new Map<string, Wp006bSplit>();
  for (const sample of samples) {
    if (sample.split === 'DEVICE_HOLDOUT' && !sample.cameraDeviceFamily) throw new Error('wp006b_device_holdout_identity_missing');
    if (sample.split === 'GENERATOR_HOLDOUT' && !sample.generatorFamily) throw new Error('wp006b_generator_holdout_identity_missing');
    if (sample.cameraDeviceFamily) {
      const prior = deviceSplits.get(sample.cameraDeviceFamily);
      if (prior && prior !== sample.split && (prior === 'DEVICE_HOLDOUT' || sample.split === 'DEVICE_HOLDOUT')) throw new Error(`wp006b_device_holdout_leak:${sample.cameraDeviceFamily}`);
      deviceSplits.set(sample.cameraDeviceFamily, sample.split);
    }
    if (sample.generatorFamily) {
      const prior = generatorSplits.get(sample.generatorFamily);
      if (prior && prior !== sample.split && (prior === 'GENERATOR_HOLDOUT' || sample.split === 'GENERATOR_HOLDOUT')) throw new Error(`wp006b_generator_holdout_leak:${sample.generatorFamily}`);
      generatorSplits.set(sample.generatorFamily, sample.split);
    }
  }
}

export function assertWp006bBenchmarkManifest(value: unknown): asserts value is Wp006bBenchmarkManifest {
  assertNoKeys(value, FORBIDDEN_KEYS, 'wp006b_forbidden_field');
  assertNoPrivacyKeys(value);
  if (!isRecord(value) || value.schemaVersion !== WP006B_BENCHMARK_SCHEMA_VERSION || value.benchmarkName !== 'LYTHAUS_FORENSIC_MICROBENCH_V0' || typeof value.researchDate !== 'string' || typeof value.repositoryStartingSha !== 'string') throw new Error('wp006b_manifest_header_invalid');
  if (value.originalFilesModified !== false || value.mediaCommittedToGit !== false || value.specialistInferenceRun !== false) throw new Error('wp006b_manifest_safety_flag_invalid');
  if (!Array.isArray(value.samples)) throw new Error('wp006b_manifest_samples_invalid');
  for (const sample of value.samples) assertSample(sample);
  assertWp006bSourceFamilySplits(value.samples);
  assertWp006bDuplicateHashHandling(value.samples);
  assertWp006bParentEditLinkage(value.samples);
  assertWp006bHoldoutBoundaries(value.samples);
  if (!isRecord(value.transformations) || value.transformations.status !== 'DEFERRED_UNTIL_SOURCE_FAMILY_LOCKED' || value.transformations.materializedDescendantCount !== 0 || !Array.isArray(value.transformations.registeredKinds)) throw new Error('wp006b_transformations_invalid');
}

export function assertWp006bRightsManifest(value: unknown): asserts value is { schemaVersion: typeof WP006B_RIGHTS_SCHEMA_VERSION; records: readonly Wp006bRightsRecord[] } {
  assertNoKeys(value, FORBIDDEN_KEYS, 'wp006b_forbidden_field');
  assertNoPrivacyKeys(value);
  if (!isRecord(value) || value.schemaVersion !== WP006B_RIGHTS_SCHEMA_VERSION || !Array.isArray(value.records)) throw new Error('wp006b_rights_manifest_invalid');
  const ids = new Set<string>();
  for (const record of value.records) {
    assertWp006bRightsRecord(record);
    if (ids.has(record.rightsRecordId)) throw new Error('wp006b_duplicate_rights_record');
    ids.add(record.rightsRecordId);
  }
}

export function assertWp006bSplitsManifest(value: unknown): asserts value is Wp006bSplitsManifest {
  assertNoKeys(value, FORBIDDEN_KEYS, 'wp006b_forbidden_field');
  assertNoPrivacyKeys(value);
  if (!isRecord(value) || value.schemaVersion !== WP006B_SPLITS_SCHEMA_VERSION || value.benchmarkVersion !== WP006B_BENCHMARK_SCHEMA_VERSION || value.splitBoundary !== 'SOURCE_FAMILY' || !isRecord(value.policy) || !Array.isArray(value.assignments)) throw new Error('wp006b_splits_manifest_invalid');
  for (const key of ['sourceFamilyBoundary', 'cameraDeviceBoundary', 'generatorFamilyHoldout', 'descendantsStayWithParent', 'scoringRequiresOwnerConfirmation', 'scoringRequiresRightsClosure']) if (value.policy[key] !== true) throw new Error(`wp006b_split_policy_invalid:${key}`);
  assertWp006bSourceFamilySplits(value.assignments);
  for (const assignment of value.assignments) {
    if (typeof assignment.eligible !== 'boolean' || typeof assignment.eligibilityReason !== 'string') throw new Error('wp006b_split_eligibility_invalid');
  }
  if (!isRecord(value.deviceHoldout) || !['NOT_READY', 'PREDECLARED'].includes(String(value.deviceHoldout.status)) || !Array.isArray(value.deviceHoldout.families)) throw new Error('wp006b_device_holdout_manifest_invalid');
  if (!isRecord(value.generatorHoldout) || !['NOT_READY', 'PREDECLARED'].includes(String(value.generatorHoldout.status)) || !Array.isArray(value.generatorHoldout.families)) throw new Error('wp006b_generator_holdout_manifest_invalid');
  if (!isRecord(value.transformationStress) || value.transformationStress.status !== 'DEFERRED' || value.transformationStress.descendantsRemainWithParentFamily !== true) throw new Error('wp006b_transformation_split_invalid');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function jsonTruthAxes(value: Wp006bTruthAxes): Record<string, JsonValue> {
  return {
    physicalCameraAcquisition: value.physicalCameraAcquisition,
    syntheticDepictedContent: value.syntheticDepictedContent,
    localManipulation: value.localManipulation,
    digitalCapture: value.digitalCapture,
    screenRecapture: value.screenRecapture,
  };
}

function jsonTruthConfidence(value: Wp006bTruthConfidenceAxes): Record<string, JsonValue> {
  return {
    physicalCameraAcquisition: value.physicalCameraAcquisition,
    syntheticDepictedContent: value.syntheticDepictedContent,
    localManipulation: value.localManipulation,
    digitalCapture: value.digitalCapture,
    screenRecapture: value.screenRecapture,
  };
}

export function buildWp006bFingerprintInput(input: {
  manifest: Pick<Wp006bBenchmarkManifest, 'schemaVersion' | 'samples'>;
  rights: { records: readonly Wp006bRightsRecord[] };
  splits: Pick<Wp006bSplitsManifest, 'assignments' | 'policy'>;
}): Record<string, JsonValue> {
  return {
    manifestVersion: input.manifest.schemaVersion,
    samples: input.manifest.samples.map((sample) => ({
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
      truthAxes: jsonTruthAxes(sample.truthAxes),
      truthConfidence: jsonTruthConfidence(sample.truthConfidence),
      hardNegativeType: sample.hardNegativeType,
      split: sample.split,
      poolRole: sample.poolRole,
      rightsRecordId: sample.rightsRecordId,
    })).sort((left, right) => left.sampleId.localeCompare(right.sampleId)),
    rights: input.rights.records.map((record) => ({
      rightsRecordId: record.rightsRecordId,
      sampleId: record.sampleId,
      sourceFamilyId: record.sourceFamilyId,
      rights: Object.fromEntries(RIGHTS_FIELDS.map((key) => [key, record[key]])),
      readiness: record.readiness,
    })).sort((left, right) => left.rightsRecordId.localeCompare(right.rightsRecordId)),
    splitAssignments: input.splits.assignments.map((assignment) => ({
      sampleId: assignment.sampleId,
      sourceFamilyId: assignment.sourceFamilyId,
      split: assignment.split,
    })).sort((left, right) => left.sampleId.localeCompare(right.sampleId)),
    splitPolicy: input.splits.policy,
  };
}

export function assertWp006bFingerprint(value: unknown): asserts value is { schemaVersion: typeof WP006B_FINGERPRINT_SCHEMA_VERSION; fingerprintSha256: string; canonicalInput: Record<string, JsonValue> } {
  assertNoKeys(value, FORBIDDEN_KEYS, 'wp006b_forbidden_field');
  assertNoPrivacyKeys(value);
  if (!isRecord(value) || value.schemaVersion !== WP006B_FINGERPRINT_SCHEMA_VERSION || !isRecord(value.canonicalInput)) throw new Error('wp006b_fingerprint_invalid');
  assertHex(value.fingerprintSha256, 64, 'wp006b_fingerprint_hash_invalid');
}
