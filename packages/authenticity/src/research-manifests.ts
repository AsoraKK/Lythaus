import type { OriginLabel } from './evaluation.ts';

export const RUNTIME_RESEARCH_MANIFEST_SCHEMA_VERSION = 'lythaus-wp004a-runtime-manifest-v1' as const;
export const GROUND_TRUTH_MANIFEST_SCHEMA_VERSION = 'lythaus-wp004a-ground-truth-manifest-v1' as const;

export type ResearchRightsClass = 'A' | 'B' | 'C' | 'CLASS_A_COMMERCIAL_TRAINING' | 'CLASS_B_EVALUATION_ONLY' | 'CLASS_C_LYTHAUS_OWNED';

export interface RuntimeManifestEntry {
  sampleId: string;
  sourceFamilyId: string;
  path: string;
  rightsClass: ResearchRightsClass;
  evaluationAllowed: boolean;
  provenanceAssertion?: 'OWNER_ASSERTED_CAMERA_ORIGINAL' | 'NEEDS_OWNER_CONFIRMATION';
}

export interface RuntimeResearchManifest {
  schemaVersion: typeof RUNTIME_RESEARCH_MANIFEST_SCHEMA_VERSION;
  manifestType: 'RUNTIME';
  entries: readonly RuntimeManifestEntry[];
}

export type ResearchTruthBasis = 'OWNER_ASSERTED' | 'NEEDS_OWNER_CONFIRMATION';

export interface GroundTruthEntry {
  sampleId: string;
  truth: {
    physicalCameraAcquisition: boolean | null;
    syntheticContent: boolean | null;
    screenRecapture: boolean | null;
    digitalScreenshot: boolean | null;
    localManipulation: boolean | null;
    originClass: OriginLabel;
    truthBasis: ResearchTruthBasis;
  };
}

export interface GroundTruthResearchManifest {
  schemaVersion: typeof GROUND_TRUTH_MANIFEST_SCHEMA_VERSION;
  manifestType: 'GROUND_TRUTH';
  entries: readonly GroundTruthEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeRelativePath(value: string): void {
  if (!value || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) throw new Error('runtime_manifest_path_must_be_relative');
  if (value.split(/[\\/]/u).includes('..')) throw new Error('runtime_manifest_path_traversal');
}

function assertNoKeys(value: unknown, forbidden: readonly string[], errorCode: string): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoKeys(item, forbidden, errorCode);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (forbidden.includes(key)) throw new Error(errorCode);
    assertNoKeys(value[key], forbidden, errorCode);
  }
}

export function assertRuntimeResearchManifest(value: unknown): asserts value is RuntimeResearchManifest {
  if (!isRecord(value) || value.schemaVersion !== RUNTIME_RESEARCH_MANIFEST_SCHEMA_VERSION || value.manifestType !== 'RUNTIME' || !Array.isArray(value.entries)) throw new Error('runtime_manifest_schema_invalid');
  assertNoKeys(value, ['truth', 'groundTruth', 'observations', 'evidence', 'aiProbability', 'humanProbability'], 'runtime_manifest_evaluation_data_forbidden');
  const sampleIds = new Set<string>();
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.sampleId !== 'string' || typeof entry.sourceFamilyId !== 'string' || typeof entry.path !== 'string' || typeof entry.evaluationAllowed !== 'boolean') throw new Error('runtime_manifest_entry_invalid');
    assertSafeRelativePath(entry.path);
    if (sampleIds.has(entry.sampleId)) throw new Error('runtime_manifest_duplicate_sample');
    sampleIds.add(entry.sampleId);
  }
}

export function assertGroundTruthResearchManifest(value: unknown): asserts value is GroundTruthResearchManifest {
  if (!isRecord(value) || value.schemaVersion !== GROUND_TRUTH_MANIFEST_SCHEMA_VERSION || value.manifestType !== 'GROUND_TRUTH' || !Array.isArray(value.entries)) throw new Error('ground_truth_manifest_schema_invalid');
  assertNoKeys(value, ['weirdHands', 'malformedText', 'suspiciousShadow', 'suspiciousTexture', 'aiProbability', 'humanProbability', 'evidence', 'observations'], 'ground_truth_observation_leakage');
  const sampleIds = new Set<string>();
  const originClasses = new Set(['CAMERA_NATIVE', 'AI_GENERATED', 'AI_EDITED', 'TRADITIONAL_DIGITAL_ART', 'CGI', 'SCAN', 'COMPOSITE', 'UNKNOWN']);
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.sampleId !== 'string' || !isRecord(entry.truth)) throw new Error('ground_truth_entry_invalid');
    if (sampleIds.has(entry.sampleId)) throw new Error('ground_truth_duplicate_sample');
    sampleIds.add(entry.sampleId);
    const truth = entry.truth;
    for (const key of ['physicalCameraAcquisition', 'syntheticContent', 'screenRecapture', 'digitalScreenshot', 'localManipulation']) {
      if (truth[key] !== null && typeof truth[key] !== 'boolean') throw new Error('ground_truth_axis_invalid');
    }
    if (!originClasses.has(String(truth.originClass)) || !['OWNER_ASSERTED', 'NEEDS_OWNER_CONFIRMATION'].includes(String(truth.truthBasis))) throw new Error('ground_truth_basis_invalid');
  }
}

export function parseRuntimeResearchManifest(value: unknown): RuntimeResearchManifest {
  assertRuntimeResearchManifest(value);
  return value;
}

export function parseGroundTruthResearchManifest(value: unknown): GroundTruthResearchManifest {
  assertGroundTruthResearchManifest(value);
  return value;
}
