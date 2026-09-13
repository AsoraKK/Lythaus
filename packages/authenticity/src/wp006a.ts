import type { Applicability } from './contracts.ts';

export const WP006A_SCHEMA_VERSION = 'lythaus-wp006a-specialist-feasibility-v1' as const;
export const WP006A_RESEARCH_DATE = '2026-09-13' as const;

export const WP006A_EVIDENCE_FAMILIES = [
  'EF2_PHYSICAL_ACQUISITION',
  'EF3_GENERATIVE_FORENSICS',
  'EF5_RECONSTRUCTION_LOCAL_MANIPULATION',
] as const;
export type Wp006aEvidenceFamily = (typeof WP006A_EVIDENCE_FAMILIES)[number];

export const WP006A_CALIBRATION_STATUSES = [
  'UNVALIDATED',
  'MEASUREMENT_ONLY',
  'CALIBRATION_CANDIDATE',
  'DIRECTIONALLY_VALIDATED',
] as const;
export type Wp006aCalibrationStatus = (typeof WP006A_CALIBRATION_STATUSES)[number];

export const WP006A_RIGHTS_STATUSES = [
  'CONFIRMED',
  'UNRESOLVED',
  'REVIEW_REQUIRED',
  'NOT_APPLICABLE',
] as const;
export type Wp006aRightsStatus = (typeof WP006A_RIGHTS_STATUSES)[number];

export interface Wp006aRegion {
  coordinateSpace: 'NORMALIZED' | 'PIXEL';
  x: number;
  y: number;
  width: number;
  height: number;
  maskReference?: string | null;
}

export interface Wp006aSpecialistProvenance {
  inputHash: string;
  repositoryCommit?: string | null;
  checkpointHash?: string | null;
  dependencyLockHash?: string | null;
  preprocessing?: string | null;
}

/**
 * Research-only specialist output. It intentionally has no origin verdict or
 * directional role. Calibration code is the only layer allowed to interpret
 * a measurement as directional evidence.
 */
export interface Wp006aSpecialistResult {
  schemaVersion: typeof WP006A_SCHEMA_VERSION;
  specialistId: string;
  version: string;
  evidenceFamily: Wp006aEvidenceFamily;
  measurementType: string;
  rawScore?: number | null;
  normalizedMeasurement?: number | null;
  region?: Wp006aRegion | null;
  applicability: Applicability;
  runtimeMs: number;
  limitations: readonly string[];
  calibrationStatus: Wp006aCalibrationStatus;
  provenance?: Wp006aSpecialistProvenance | null;
}

export interface Wp006aRightsSeparation {
  codeRights: Wp006aRightsStatus;
  weightRights: Wp006aRightsStatus;
  dataRights: Wp006aRightsStatus;
  evaluationRights: Wp006aRightsStatus;
  commercialDeploymentRights: Wp006aRightsStatus;
}

export interface Wp006aSplitEntry {
  sampleId: string;
  sourceFamilyId: string;
  split: 'CALIBRATION' | 'EVALUATION' | 'HOLDOUT' | 'RUNTIME_SMOKE';
}

const FORBIDDEN_SPECIALIST_KEYS = [
  'groundTruth',
  'truth',
  'truthSynthetic',
  'truthLocalManipulation',
  'expectedPrimary',
  'caseExpectation',
  'supports',
  'contradicts',
  'supportedHypotheses',
  'contradictedHypotheses',
  'directionalRole',
  'cameraOrigin',
  'syntheticEvidence',
  'authenticityVerdict',
  'recommendation',
  'enforcementAuthority',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if ((FORBIDDEN_SPECIALIST_KEYS as readonly string[]).includes(key)) throw new Error(`wp006a_specialist_forbidden_field:${key}`);
    assertNoForbiddenKeys(value[key]);
  }
}

function assertFiniteOptional(value: unknown, errorCode: string): void {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(errorCode);
}

function assertRegion(region: unknown): void {
  if (region === undefined || region === null) return;
  if (!isRecord(region) || !['NORMALIZED', 'PIXEL'].includes(String(region.coordinateSpace))) throw new Error('wp006a_specialist_region_invalid');
  for (const key of ['x', 'y', 'width', 'height']) {
    if (typeof region[key] !== 'number' || !Number.isFinite(region[key]) || region[key] < 0) throw new Error('wp006a_specialist_region_invalid');
  }
  if (region.coordinateSpace === 'NORMALIZED' && ['x', 'y', 'width', 'height'].some((key) => Number(region[key]) > 1)) throw new Error('wp006a_specialist_region_invalid');
  if (region.maskReference !== undefined && region.maskReference !== null && typeof region.maskReference !== 'string') throw new Error('wp006a_specialist_region_invalid');
}

export function assertWp006aSpecialistResult(value: unknown): asserts value is Wp006aSpecialistResult {
  assertNoForbiddenKeys(value);
  if (!isRecord(value) || value.schemaVersion !== WP006A_SCHEMA_VERSION) throw new Error('wp006a_specialist_schema_invalid');
  if (typeof value.specialistId !== 'string' || value.specialistId.length === 0 || typeof value.version !== 'string' || value.version.length === 0) throw new Error('wp006a_specialist_identity_invalid');
  if (!(WP006A_EVIDENCE_FAMILIES as readonly string[]).includes(String(value.evidenceFamily))) throw new Error('wp006a_specialist_family_invalid');
  if (typeof value.measurementType !== 'string' || value.measurementType.length === 0) throw new Error('wp006a_specialist_measurement_type_invalid');
  if (!['applicable', 'not_applicable', 'unavailable', 'invalid'].includes(String(value.applicability))) throw new Error('wp006a_specialist_applicability_invalid');
  if (typeof value.runtimeMs !== 'number' || !Number.isFinite(value.runtimeMs) || value.runtimeMs < 0) throw new Error('wp006a_specialist_runtime_invalid');
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== 'string')) throw new Error('wp006a_specialist_limitations_invalid');
  if (!(WP006A_CALIBRATION_STATUSES as readonly string[]).includes(String(value.calibrationStatus))) throw new Error('wp006a_specialist_calibration_status_invalid');
  assertFiniteOptional(value.rawScore, 'wp006a_specialist_raw_score_invalid');
  assertFiniteOptional(value.normalizedMeasurement, 'wp006a_specialist_normalized_measurement_invalid');
  assertRegion(value.region);
  if (value.provenance !== undefined && value.provenance !== null) {
    if (!isRecord(value.provenance) || typeof value.provenance.inputHash !== 'string' || value.provenance.inputHash.length === 0) throw new Error('wp006a_specialist_provenance_invalid');
  }
}

export function assertWp006aRightsSeparation(value: unknown): asserts value is Wp006aRightsSeparation {
  if (!isRecord(value)) throw new Error('wp006a_rights_shape_invalid');
  for (const key of ['codeRights', 'weightRights', 'dataRights', 'evaluationRights', 'commercialDeploymentRights']) {
    if (!(WP006A_RIGHTS_STATUSES as readonly string[]).includes(String(value[key]))) throw new Error(`wp006a_rights_field_invalid:${key}`);
  }
}

export function assertWp006aSourceFamilySplits(entries: readonly Wp006aSplitEntry[]): void {
  const sampleIds = new Set<string>();
  const familySplits = new Map<string, Wp006aSplitEntry['split']>();
  for (const entry of entries) {
    if (!entry || typeof entry.sampleId !== 'string' || !entry.sampleId || typeof entry.sourceFamilyId !== 'string' || !entry.sourceFamilyId || !['CALIBRATION', 'EVALUATION', 'HOLDOUT', 'RUNTIME_SMOKE'].includes(entry.split)) throw new Error('wp006a_split_entry_invalid');
    if (sampleIds.has(entry.sampleId)) throw new Error('wp006a_duplicate_sample_id');
    sampleIds.add(entry.sampleId);
    const prior = familySplits.get(entry.sourceFamilyId);
    if (prior && prior !== entry.split) throw new Error(`wp006a_source_family_split_leak:${entry.sourceFamilyId}`);
    familySplits.set(entry.sourceFamilyId, entry.split);
  }
}

export function parseWp006aSpecialistResult(value: unknown): Wp006aSpecialistResult {
  assertWp006aSpecialistResult(value);
  return value;
}
