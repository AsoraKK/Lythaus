import { createHash } from 'node:crypto';

export const WP007A_SCHEMA_VERSION = 'lythaus-wp007a-synthetic-benchmark-v1' as const;
export const WP007A_PLAN_SCHEMA_VERSION = 'lythaus-wp007a-plan-v1' as const;
export const WP007A_PROMPT_BANK_VERSION = 'LYTHAUS_EF3_PROMPT_BANK_V1' as const;
export const WP007A_EXPECTED_BASE_SHA = '6c11fbf994bcf6e05e5e20238064237f9f90e574' as const;
export const WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES = 1.5 * 1024 * 1024 * 1024;
export const WP007A_MAX_DIFFUSIONDB_SELECTED_FAMILIES = 600;
export const WP007A_MIN_DIFFUSIONDB_SELECTED_FAMILIES = 400;
export const WP007A_MAX_PROGRAMMATIC_NEGATIVE_FAMILIES = 48;

export const WP007A_TRAINING_ELIGIBILITY = [
  'TRAINING_ALLOWED_EXPLICIT',
  'TRAINING_ALLOWED_WITH_CONSTRAINTS',
  'EVALUATION_ALLOWED',
  'EVALUATION_ONLY',
  'PROHIBITED',
  'REVIEW_REQUIRED',
] as const;
export type Wp007aTrainingEligibility = (typeof WP007A_TRAINING_ELIGIBILITY)[number];

export const WP007A_BENCHMARK_ROLES = [
  'DEVELOPMENT',
  'CALIBRATION_FUTURE',
  'SEALED_GENERATOR_HOLDOUT',
  'EXTERNAL_PROVIDER_HOLDOUT',
  'UNKNOWN_GENERATOR_DIAGNOSTIC',
  'MIXED_ORIGIN_DIAGNOSTIC',
  'FUTURE_RESERVE',
  'EXCLUDED',
] as const;
export type Wp007aBenchmarkRole = (typeof WP007A_BENCHMARK_ROLES)[number];

export const WP007A_TRUTH_VALUES = ['TRUE', 'FALSE', 'UNKNOWN'] as const;
export type Wp007aTruthValue = (typeof WP007A_TRUTH_VALUES)[number];

export const WP007A_HARD_NEGATIVE_TYPES = [
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
  'PROGRAMMATIC_GRAPHIC',
  'UNKNOWN',
] as const;

export const WP007A_PROMPT_REGIMES = [
  'ORDINARY_PHONE_PHOTO',
  'PEOPLE_AND_PORTRAITS',
  'INTERIORS_AND_OBJECTS',
  'OUTDOOR_STREET_AND_LANDSCAPE',
  'ANIMALS_FOOD_VEHICLES',
  'HIGH_FREQUENCY_DIFFICULT_DETAIL',
  'LOW_LIGHT_BLUR_IMPERFECT_CAPTURE_STYLE',
  'NON_PHOTOGRAPHIC_DIGITAL_ART',
] as const;
export type Wp007aPromptRegime = (typeof WP007A_PROMPT_REGIMES)[number];

const FORBIDDEN_PROMPT_TERMS = [
  'ai generated',
  'stable diffusion',
  'flux',
  'midjourney',
  'chatgpt',
  'photorealistic ai',
];
const FORBIDDEN_ARTIFACT_KEYS = new Set([
  'gps',
  'latitude',
  'longitude',
  'serialNumber',
  'absolutePath',
  'privatePath',
  'apiToken',
  'secret',
  'thumbnail',
  'rawPixels',
  'rawResidual',
  'deviceFingerprintSurface',
]);
const FORBIDDEN_SPECIALIST_KEYS = new Set([
  'supports',
  'contradicts',
  'origin',
  'isAI',
  'isReal',
  'authenticityVerdict',
  'recommendation',
  'enforcementAuthority',
  'truthAxes',
  'candidateCategory',
  'benchmarkRole',
  'generatorFamily',
  'provider',
  'prompt',
  'promptId',
  'seed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`wp007a_string_invalid:${field}`);
}

function assertEnum(value: unknown, values: readonly string[], field: string): void {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`wp007a_enum_invalid:${field}`);
}

export function stableStringifyWp007a(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringifyWp007a).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringifyWp007a(record[key])}`).join(',')}}`;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableArtifactHash(value: unknown): string {
  return sha256Hex(stableStringifyWp007a(value));
}

export function derivePromptSeed(promptBankVersion: string, generatorId: string, promptId: string, replicate = 1): number {
  assertNonEmptyString(promptBankVersion, 'promptBankVersion');
  assertNonEmptyString(generatorId, 'generatorId');
  assertNonEmptyString(promptId, 'promptId');
  if (!Number.isInteger(replicate) || replicate < 1) throw new Error('wp007a_replicate_invalid');
  return createHash('sha256').update(`${promptBankVersion}:${generatorId}:${promptId}:${replicate}`).digest().readUInt32BE(0);
}

export function assertTruthAxes(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007a_truth_axes_invalid');
  for (const field of ['physicalCameraAcquisition', 'syntheticDepictedContent', 'localManipulation', 'digitalCapture', 'screenRecapture']) {
    assertEnum(value[field], WP007A_TRUTH_VALUES, `truthAxes.${field}`);
  }
}

export function assertSafeArchiveMember(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'archiveMember');
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || normalized.split('/').some((part) => !part || part === '..')) {
    throw new Error('wp007a_archive_member_unsafe');
  }
}

export function assertArchiveBudget({ archiveBytes, selectedFamilies, selectedBytes }: { archiveBytes: number; selectedFamilies: number; selectedBytes: number }): void {
  if (!Number.isFinite(archiveBytes) || archiveBytes < 0 || archiveBytes > WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES) throw new Error('wp007a_archive_budget_exceeded');
  if (!Number.isInteger(selectedFamilies) || selectedFamilies < 0 || selectedFamilies > WP007A_MAX_DIFFUSIONDB_SELECTED_FAMILIES) throw new Error('wp007a_selection_budget_exceeded');
  if (!Number.isFinite(selectedBytes) || selectedBytes < 0 || selectedBytes > 1 * 1024 * 1024 * 1024) throw new Error('wp007a_selected_bytes_budget_exceeded');
}

export function assertSyntheticBenchmarkRecord(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007a_record_invalid');
  assertNonEmptyString(value.sampleId, 'sampleId');
  assertNonEmptyString(value.sourceFamilyId, 'sourceFamilyId');
  assertTruthAxes(value.artifactTruth);
  if (!isRecord(value.provenance)) throw new Error('wp007a_provenance_invalid');
  const provenance = value.provenance;
  for (const field of ['provider', 'product', 'generatorFamily', 'generationRoute', 'truthSource']) assertNonEmptyString(provenance[field], `provenance.${field}`);
  if (!isRecord(value.rights)) throw new Error('wp007a_rights_invalid');
  const rights = value.rights;
  assertEnum(rights.trainingEligibility, WP007A_TRAINING_ELIGIBILITY, 'rights.trainingEligibility');
  if (typeof rights.evaluationEligibility !== 'boolean') throw new Error('wp007a_rights_evaluation_invalid');
  if (!isRecord(value.benchmark)) throw new Error('wp007a_benchmark_invalid');
  const benchmark = value.benchmark;
  assertEnum(benchmark.role, WP007A_BENCHMARK_ROLES, 'benchmark.role');
  if (!isRecord(value.file)) throw new Error('wp007a_file_invalid');
  const file = value.file;
  assertNonEmptyString(file.sha256, 'file.sha256');
  if (!/^[a-f0-9]{64}$/u.test(file.sha256)) throw new Error('wp007a_file_hash_invalid');
  const width = file.width;
  const height = file.height;
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || typeof height !== 'number' || !Number.isInteger(height) || height < 1) throw new Error('wp007a_dimensions_invalid');
  assertNonEmptyString(file.format, 'file.format');
  if (benchmark.role === 'DEVELOPMENT' && !['TRAINING_ALLOWED_EXPLICIT', 'TRAINING_ALLOWED_WITH_CONSTRAINTS'].includes(String(rights.trainingEligibility))) {
    throw new Error('wp007a_development_rights_ineligible');
  }
}

export function assertTrainingEligible(value: unknown): void {
  if (isRecord(value) && isRecord(value.rights) && isRecord(value.benchmark) && value.benchmark.role === 'DEVELOPMENT' && !['TRAINING_ALLOWED_EXPLICIT', 'TRAINING_ALLOWED_WITH_CONSTRAINTS'].includes(String(value.rights.trainingEligibility))) {
    throw new Error('wp007a_training_rights_blocked');
  }
  assertSyntheticBenchmarkRecord(value);
  const record = value as Record<string, any>;
  if (!['TRAINING_ALLOWED_EXPLICIT', 'TRAINING_ALLOWED_WITH_CONSTRAINTS'].includes(record.rights.trainingEligibility)) throw new Error('wp007a_training_rights_blocked');
  if (record.benchmark.role !== 'DEVELOPMENT') throw new Error('wp007a_holdout_cannot_enter_development');
  if (record.artifactTruth.syntheticDepictedContent !== 'TRUE' || record.artifactTruth.localManipulation === 'TRUE') throw new Error('wp007a_training_truth_scope_invalid');
}

export function assertPromptBank(value: unknown): void {
  if (!isRecord(value) || value.version !== WP007A_PROMPT_BANK_VERSION || !Array.isArray(value.prompts) || value.prompts.length !== 80) throw new Error('wp007a_prompt_bank_shape_invalid');
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const prompt of value.prompts) {
    if (!isRecord(prompt)) throw new Error('wp007a_prompt_invalid');
    assertNonEmptyString(prompt.promptId, 'promptId');
    assertNonEmptyString(prompt.text, 'text');
    const regime = String(prompt.regime);
    assertEnum(regime, WP007A_PROMPT_REGIMES, 'regime');
    if (ids.has(prompt.promptId)) throw new Error('wp007a_prompt_id_duplicate');
    ids.add(prompt.promptId);
    counts.set(regime, (counts.get(regime) ?? 0) + 1);
    const lower = String(prompt.text).toLowerCase();
    if (FORBIDDEN_PROMPT_TERMS.some((term) => lower.includes(term))) throw new Error('wp007a_prompt_generator_term');
  }
  for (const regime of WP007A_PROMPT_REGIMES) if (counts.get(regime) !== 10) throw new Error(`wp007a_prompt_regime_count:${regime}`);
}

export function assertBenchmarkRoleTrainingBoundary(value: unknown): void {
  assertSyntheticBenchmarkRecord(value);
  const record = value as Record<string, any>;
  if (record.benchmark.role !== 'DEVELOPMENT' && ['TRAINING_ALLOWED_EXPLICIT', 'TRAINING_ALLOWED_WITH_CONSTRAINTS'].includes(record.rights.trainingEligibility)) {
    throw new Error('wp007a_role_isolation_overrides_training_rights');
  }
}

export function assertNoPrivateArtifactKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivateArtifactKeys(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_ARTIFACT_KEYS.has(key)) throw new Error(`wp007a_private_artifact_key:${key}`);
    if (typeof child === 'string' && /^[A-Za-z]:[\\/]/u.test(child)) throw new Error('wp007a_absolute_path_persisted');
    assertNoPrivateArtifactKeys(child);
  }
}

export function assertDetectorInput(value: unknown): void {
  if (!isRecord(value) || !Object.keys(value).every((key) => key === 'pixels' || key === 'configurationId')) throw new Error('wp007a_detector_input_metadata');
  if (!('pixels' in value)) throw new Error('wp007a_detector_input_pixels_missing');
}

export function assertSourceFamilyIsolation(records: readonly Record<string, any>[]): void {
  const familyRoles = new Map<string, string>();
  const hashes = new Map<string, string>();
  for (const record of records) {
    assertNonEmptyString(record.sourceFamilyId, 'sourceFamilyId');
    const role = String(record.benchmark?.role ?? record.role ?? 'UNKNOWN');
    const priorRole = familyRoles.get(record.sourceFamilyId);
    if (priorRole && priorRole !== role) throw new Error(`wp007a_source_family_role_leak:${record.sourceFamilyId}`);
    familyRoles.set(record.sourceFamilyId, role);
    if (typeof record.file?.sha256 === 'string') {
      const prior = hashes.get(record.file.sha256);
      if (prior && prior !== record.sourceFamilyId) throw new Error(`wp007a_exact_duplicate_cross_family:${record.file.sha256}`);
      hashes.set(record.file.sha256, record.sourceFamilyId);
    }
  }
}

export function buildWp007aFingerprintInput(input: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: WP007A_SCHEMA_VERSION,
    records: input.records ?? [],
    splits: input.splits ?? {},
    rights: input.rights ?? {},
    promptBankVersion: input.promptBankVersion ?? WP007A_PROMPT_BANK_VERSION,
    transformationPlan: input.transformationPlan ?? {},
    generatorReserve: input.generatorReserve ?? [],
  };
}

export function assertNoSpecialistMetadata(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoSpecialistMetadata(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_SPECIALIST_KEYS.has(key)) throw new Error(`wp007a_specialist_metadata:${key}`);
    assertNoSpecialistMetadata(value[key]);
  }
}
