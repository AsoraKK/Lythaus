import {
  assertPromptBank,
  assertTruthAxes,
  derivePromptSeed,
  sha256Hex,
  stableArtifactHash,
  stableStringifyWp007a,
  WP007A_PROMPT_BANK_VERSION,
  WP007A_PROMPT_REGIMES,
  WP007A_TRAINING_ELIGIBILITY,
} from './wp007a.ts';

export const WP007AH_SCHEMA_VERSION = 'lythaus-wp007ah-cloudflare-holdout-v1' as const;
export const WP007AH_PLAN_SCHEMA_VERSION = 'lythaus-wp007ah-plan-v1' as const;
export const WP007AH_EXPECTED_BASE_SHA = '6543ec6496a4d4b006fb40b6f5de50cfd9e98009' as const;
export const WP007AH_WP007A_BENCHMARK_FINGERPRINT = '210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5' as const;
export const WP007AH_PROMPT_BANK_VERSION = WP007A_PROMPT_BANK_VERSION;
export const WP007AH_PROMPT_COUNT = 40 as const;
export const WP007AH_MAX_PAID_COST_USD = 0 as const;
export const WP007AH_PROVIDER = 'CLOUDFLARE_WORKERS_AI' as const;
export const WP007AH_TRAINING_ELIGIBILITY = 'EVALUATION_ONLY' as const;
export const WP007AH_GENERATION_ROUTE = 'CLOUDFLARE_WORKERS_AI_BFL_PARTNER_ROUTE' as const;

export const WP007AH_MODEL_SPECS = Object.freeze([
  {
    modelId: '@cf/black-forest-labs/flux-1-schnell',
    modelFamily: 'FLUX_1_SCHNELL',
    benchmarkRole: 'SEALED_GENERATOR_HOLDOUT',
    purpose: 'WP007B_FIRST_UNSEEN_GENERATOR_HOLDOUT',
    seedSupport: 'DOCUMENTED_BY_CURRENT_MODEL_PAGE',
    requestParameters: { steps: 4 },
  },
  {
    modelId: '@cf/black-forest-labs/flux-2-klein-4b',
    modelFamily: 'FLUX_2_KLEIN_4B',
    benchmarkRole: 'FUTURE_RESERVE',
    purpose: 'POST_WP007B_INDEPENDENT_GENERATOR_REPLICATION',
    seedSupport: 'NOT_DOCUMENTED_BY_CURRENT_MODEL_PAGE',
    requestParameters: {},
  },
] as const);

export const WP007AH_MODEL_IDS = Object.freeze(WP007AH_MODEL_SPECS.map((model) => model.modelId));
export const WP007AH_MODEL_ROLES = Object.freeze({
  '@cf/black-forest-labs/flux-1-schnell': 'SEALED_GENERATOR_HOLDOUT',
  '@cf/black-forest-labs/flux-2-klein-4b': 'FUTURE_RESERVE',
} as const);

export const WP007AH_PROMPT_SELECTION_POLICY = Object.freeze({
  regimes: [...WP007A_PROMPT_REGIMES],
  promptsPerRegime: 5,
  ordering: 'WP007A_REGIME_ORDER_THEN_NUMERIC_PROMPT_ID',
  selectionBasis: 'PROMPT_BANK_STRUCTURE_ONLY',
  detectorInput: false,
});

export const WP007AH_RETRY_POLICY = Object.freeze({
  maxIdenticalTransportRetries: 1,
  retryOnlyWhenNoValidProviderOutputWasReceived: true,
  neverRetryForContentQuality: true,
  neverReplaceFailedPrompt: true,
});

export const WP007AH_GENERATION_CONFIGURATION = Object.freeze({
  outputSize: { width: 1024, height: 1024, policy: 'REQUEST_WHERE_ROUTE_SUPPORTS_OTHERWISE_PROVIDER_DEFAULT' },
  flux1: { steps: 4, seed: 'DERIVED_PROMPT_SEED' },
  flux2: { seed: 'NOT_SUPPORTED_UNLESS_CURRENT_ROUTE_DOCUMENTS_IT' },
  outputFormat: 'PROVIDER_RETURNED_IMAGE',
  noParameterSearch: true,
  noPromptVariation: true,
  noReplicateSweep: true,
});

const WP007AH_FORBIDDEN_RESULT_KEYS = new Set([
  'supports',
  'contradicts',
  'origin',
  'isAI',
  'isReal',
  'authenticityVerdict',
  'recommendation',
  'enforcementAuthority',
  'rawScore',
  'normalizedMeasurement',
  'measurementType',
  'specialistId',
  'calibrationStatus',
  'confidence',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`wp007ah_string_invalid:${field}`);
}

function assertEnum(value: unknown, values: readonly string[], field: string): void {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`wp007ah_enum_invalid:${field}`);
}

function promptNumber(promptId: string): number {
  const match = /^PROMPT_(\d+)$/u.exec(promptId);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function modelSpec(modelId: string) {
  const spec = WP007AH_MODEL_SPECS.find((candidate) => candidate.modelId === modelId);
  if (!spec) throw new Error(`wp007ah_model_not_authorized:${modelId}`);
  return spec;
}

export function selectWp007ahPromptIds(promptBank: unknown): string[] {
  assertPromptBank(promptBank);
  const prompts = promptBank as { prompts: Array<{ promptId: string; regime: string }> };
  return WP007A_PROMPT_REGIMES.flatMap((regime) => prompts.prompts
    .filter((prompt) => prompt.regime === regime)
    .sort((left, right) => promptNumber(left.promptId) - promptNumber(right.promptId))
    .slice(0, WP007AH_PROMPT_SELECTION_POLICY.promptsPerRegime)
    .map((prompt) => prompt.promptId));
}

export function assertWp007ahPromptSelection(promptBank: unknown, promptIds: unknown): asserts promptIds is string[] {
  const expected = selectWp007ahPromptIds(promptBank);
  if (!Array.isArray(promptIds) || promptIds.length !== WP007AH_PROMPT_COUNT || promptIds.some((value) => typeof value !== 'string')) {
    throw new Error('wp007ah_prompt_selection_shape_invalid');
  }
  if (stableStringifyWp007a(promptIds) !== stableStringifyWp007a(expected)) throw new Error('wp007ah_prompt_selection_not_deterministic');
  if (new Set(promptIds).size !== WP007AH_PROMPT_COUNT) throw new Error('wp007ah_prompt_selection_duplicate');
}

export function wp007ahPromptSelectionHash(promptBankVersion: string, promptIds: readonly string[]): string {
  return stableArtifactHash({ schemaVersion: WP007AH_PLAN_SCHEMA_VERSION, promptBankVersion, promptIds: [...promptIds] });
}

export function deriveWp007ahPromptSeed(modelId: string, promptId: string, replicate = 1): number {
  modelSpec(modelId);
  return derivePromptSeed(WP007AH_PROMPT_BANK_VERSION, modelId, promptId, replicate);
}

export function assertWp007ahTruthAxes(value: unknown): void {
  assertTruthAxes(value);
  const axes = value as Record<string, unknown>;
  const expected: Record<string, string> = {
    physicalCameraAcquisition: 'FALSE',
    syntheticDepictedContent: 'TRUE',
    localManipulation: 'FALSE',
    digitalCapture: 'TRUE',
    screenRecapture: 'FALSE',
  };
  for (const [key, expectedValue] of Object.entries(expected)) if (axes[key] !== expectedValue) throw new Error(`wp007ah_truth_axis_invalid:${key}`);
}

export function assertWp007ahRightsRecord(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007ah_rights_record_invalid');
  assertNonEmptyString(value.modelId, 'modelId');
  modelSpec(value.modelId);
  if (value.provider !== 'BLACK_FOREST_LABS' && value.provider !== WP007AH_PROVIDER) throw new Error('wp007ah_provider_invalid');
  if (!['CLOUDFLARE_WORKERS_AI', WP007AH_GENERATION_ROUTE].includes(String(value.accessRoute))) throw new Error('wp007ah_route_invalid');
  if (value.evaluationEligibility !== 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY') throw new Error('wp007ah_evaluation_rights_invalid');
  if (value.trainingEligibility !== WP007AH_TRAINING_ELIGIBILITY) throw new Error('wp007ah_training_rights_invalid');
  if (value.benchmarkRole !== WP007AH_MODEL_ROLES[value.modelId as keyof typeof WP007AH_MODEL_ROLES]) throw new Error('wp007ah_role_invalid');
}

export function assertWp007ahGenerationFreeze(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007ah_generation_freeze_invalid');
  if (value.schemaVersion !== 'lythaus-wp007ah-generation-freeze-v1') throw new Error('wp007ah_generation_freeze_schema_invalid');
  if (value.promptBankVersion !== WP007AH_PROMPT_BANK_VERSION) throw new Error('wp007ah_generation_freeze_prompt_bank_invalid');
  if (!Array.isArray(value.promptIds) || value.promptIds.length !== WP007AH_PROMPT_COUNT) throw new Error('wp007ah_generation_freeze_prompt_count_invalid');
  if (!Array.isArray(value.models) || value.models.length !== WP007AH_MODEL_SPECS.length) throw new Error('wp007ah_generation_freeze_models_invalid');
  const modelIds = value.models.map((model) => (isRecord(model) ? model.modelId : undefined));
  if (stableStringifyWp007a(modelIds) !== stableStringifyWp007a([...WP007AH_MODEL_IDS])) throw new Error('wp007ah_generation_freeze_model_set_invalid');
  assertEnum(value.trainingEligibility, WP007A_TRAINING_ELIGIBILITY, 'trainingEligibility');
  if (value.trainingEligibility !== WP007AH_TRAINING_ELIGIBILITY) throw new Error('wp007ah_generation_freeze_training_invalid');
  if (value.maxIncrementalPaidCostUsd !== WP007AH_MAX_PAID_COST_USD) throw new Error('wp007ah_generation_freeze_cost_policy_invalid');
  if (!isRecord(value.retryPolicy) || value.retryPolicy.maxIdenticalTransportRetries !== WP007AH_RETRY_POLICY.maxIdenticalTransportRetries || value.retryPolicy.neverReplaceFailedPrompt !== true) throw new Error('wp007ah_generation_freeze_retry_policy_invalid');
  if (!isRecord(value.outputCache) || value.outputCache.insideRepository !== false) throw new Error('wp007ah_generation_freeze_cache_policy_invalid');
}

export function assertWp007ahGeneratedRecord(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007ah_generated_record_invalid');
  for (const field of ['sampleId', 'sourceFamilyId', 'generatorModelId', 'generatorFamily', 'generationRoute', 'promptBankVersion', 'promptId', 'rightsAuditId', 'trainingEligibility', 'evaluationEligibility', 'benchmarkRole']) assertNonEmptyString(value[field], field);
  const generatorModelId = String(value.generatorModelId);
  modelSpec(generatorModelId);
  if (value.provider !== WP007AH_PROVIDER) throw new Error('wp007ah_generated_provider_invalid');
  if (value.generationRoute !== WP007AH_GENERATION_ROUTE) throw new Error('wp007ah_generated_route_invalid');
  if (value.promptBankVersion !== WP007AH_PROMPT_BANK_VERSION) throw new Error('wp007ah_generated_prompt_bank_invalid');
  if (value.trainingEligibility !== WP007AH_TRAINING_ELIGIBILITY) throw new Error('wp007ah_generated_training_invalid');
  if (value.evaluationEligibility !== 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY') throw new Error('wp007ah_generated_evaluation_invalid');
  if (value.benchmarkRole !== WP007AH_MODEL_ROLES[generatorModelId as keyof typeof WP007AH_MODEL_ROLES]) throw new Error('wp007ah_generated_role_invalid');
  assertWp007ahTruthAxes(value.truthAxes);
  if (!isRecord(value.file)) throw new Error('wp007ah_generated_file_invalid');
  if (typeof value.file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.file.sha256)) throw new Error('wp007ah_generated_hash_invalid');
  if (typeof value.file.width !== 'number' || !Number.isInteger(value.file.width) || value.file.width < 1 || typeof value.file.height !== 'number' || !Number.isInteger(value.file.height) || value.file.height < 1) throw new Error('wp007ah_generated_dimensions_invalid');
  assertNonEmptyString(value.file.format, 'file.format');
  if ('filePath' in value || 'absolutePath' in value || 'prompt' in value) throw new Error('wp007ah_generated_private_field');
  assertWp007ahNoDetectorResultFields(value);
}

export function assertWp007ahManifest(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.records)) throw new Error('wp007ah_manifest_invalid');
  const sampleIds = new Set<string>();
  const familyIds = new Set<string>();
  const modelPromptPairs = new Set<string>();
  for (const record of value.records) {
    assertWp007ahGeneratedRecord(record);
    const item = record as Record<string, any>;
    if (sampleIds.has(item.sampleId)) throw new Error('wp007ah_sample_duplicate');
    if (familyIds.has(item.sourceFamilyId)) throw new Error('wp007ah_source_family_duplicate');
    const pair = `${item.generatorModelId}:${item.promptId}`;
    if (modelPromptPairs.has(pair)) throw new Error('wp007ah_model_prompt_duplicate');
    sampleIds.add(item.sampleId);
    familyIds.add(item.sourceFamilyId);
    modelPromptPairs.add(pair);
  }
}

export function assertWp007ahNoDetectorResultFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertWp007ahNoDetectorResultFields(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (WP007AH_FORBIDDEN_RESULT_KEYS.has(key)) throw new Error(`wp007ah_detector_field:${key}`);
    assertWp007ahNoDetectorResultFields(child);
  }
}

export function assertWp007ahPixelAccess(input: { modelId: string; purpose: string }): void {
  const spec = modelSpec(input.modelId);
  if (input.purpose !== 'MATERIALIZATION_INTEGRITY_VALIDATION') throw new Error(`wp007ah_holdout_pixel_access_blocked:${spec.benchmarkRole}`);
  if (spec.benchmarkRole === 'FUTURE_RESERVE' && input.purpose !== 'MATERIALIZATION_INTEGRITY_VALIDATION') throw new Error('wp007ah_future_reserve_pixel_access_blocked');
}

export function assertWp007ahNoPaidGeneration({ estimatedCostUsd, freeAllocationConfirmed }: { estimatedCostUsd: number; freeAllocationConfirmed: boolean }): void {
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) throw new Error('wp007ah_cost_estimate_invalid');
  if (estimatedCostUsd > WP007AH_MAX_PAID_COST_USD && freeAllocationConfirmed !== true) throw new Error('wp007ah_cost_blocked_or_uncertain');
}

export function buildWp007ahFingerprintInput(input: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: WP007AH_SCHEMA_VERSION,
    baseWp007aFingerprint: WP007AH_WP007A_BENCHMARK_FINGERPRINT,
    promptBankVersion: WP007AH_PROMPT_BANK_VERSION,
    promptIds: input.promptIds ?? [],
    models: input.models ?? WP007AH_MODEL_SPECS,
    records: input.records ?? [],
    failures: input.failures ?? [],
    roles: input.roles ?? {},
    rights: input.rights ?? {},
    generationStatus: input.generationStatus ?? 'NOT_RUN',
  };
}

export function fingerprintWp007ah(input: Record<string, unknown>): string {
  return sha256Hex(stableStringifyWp007a(buildWp007ahFingerprintInput(input)));
}
