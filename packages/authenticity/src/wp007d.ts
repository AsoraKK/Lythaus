import { createHash } from 'node:crypto';

import { sha256Hex, stableArtifactHash, stableStringifyWp007a } from './wp007a.ts';

export const WP007D_SCHEMA_VERSION = 'lythaus-wp007d-paired-generator-invariant-v1' as const;
export const WP007D_PROXY_PLAN_SCHEMA_VERSION = 'lythaus-wp007d-paired-proxy-plan-v1' as const;
export const WP007D_PROXY_CORPUS_SCHEMA_VERSION = 'lythaus-wp007d-paired-proxy-corpus-v1' as const;
export const WP007D_CALIBRATION_SCHEMA_VERSION = 'lythaus-wp007d-ef3-calibration-freeze-v1' as const;

export const WP007D_WP007C_MERGE_SHA = '33066d594ccb5345594eed537e3d80064df226a7' as const;
export const WP007D_WP007AHR4_HOLDOUT_FREEZE_SHA = 'b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4' as const;
export const WP007D_FLUX2_RESERVE_FREEZE_SHA = '56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054' as const;
export const WP007D_HISTORICAL_GENERATION_FREEZE_SHA = '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514' as const;
export const WP007D_BENCHMARK_FINGERPRINT = '210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5' as const;
export const WP007D_COST_CAP_USD = 1 as const;
export const WP007D_PROXY_PROMPT = 'Faithful reconstruction of the input image. Preserve the subject, layout, composition, geometry, colors, lighting, shapes, and overall visual content. Do not intentionally add or remove important elements.' as const;
export const WP007D_PROXY_IMAGE_INPUT_FIELD = 'image' as const;
export const WP007D_PROXY_IMAGE_INPUT_ENCODING = 'UINT8_ARRAY' as const;
export const WP007D_PROXY_CONTRACT_REPAIR = Object.freeze({
  evidenceRunId: '35077581757',
  priorImageField: 'image_b64',
  amendedImageField: WP007D_PROXY_IMAGE_INPUT_FIELD,
  amendedImageEncoding: WP007D_PROXY_IMAGE_INPUT_ENCODING,
  providerEvidence: Object.freeze([
    Object.freeze({ providerErrorCode: 3030, providerErrorMessage: 'Model input is not valid: input tensor `image` is not present' }),
    Object.freeze({ providerErrorCode: 3010, providerErrorMessage: "unexpected shape for input 'image'" }),
  ]),
  rationale: 'The live REST route rejected the documented image_b64 representation; the same official model schemas document image as an 8-bit integer array for img2img.',
});
export const WP007D_CANONICAL_RESAMPLER = 'sharp-lanczos3' as const;
export const WP007D_CANONICAL_SIZE = Object.freeze({ width: 512, height: 512 });
export const WP007D_STRENGTHS = Object.freeze([0.3, 0.5] as const);
export const WP007D_EXPECTED_SOURCE_FAMILY_COUNT = 60 as const;
export const WP007D_EXPECTED_REQUEST_COUNT = 360 as const;

export const WP007D_CAMERA_SAMPLE_IDS = Object.freeze([
  'CSAFE_WP006E_iPhone11_1_02',
  'CSAFE_WP006E_iPhone11_1_03',
  'CSAFE_WP006E_iPhone11_1_07',
  'CSAFE_WP006E_iPhone11_1_08',
  'CSAFE_WP006E_iPhone11_1_10',
  'CSAFE_WP006E_iPhone11_3_02',
  'CSAFE_WP006E_iPhone11_3_03',
  'CSAFE_WP006E_iPhone11_3_06',
  'CSAFE_WP006E_iPhone11_3_07',
  'CSAFE_WP006E_iPhone12_1_02',
  'CSAFE_WP006E_iPhone12_1_03',
  'CSAFE_WP006E_iPhone12_1_05',
  'CSAFE_WP006E_iPhone12_1_08',
  'CSAFE_WP006E_iPhone12_3_01',
  'CSAFE_WP006E_iPhone12_3_03',
  'CSAFE_WP006E_iPhone12_3_04',
  'CSAFE_WP006E_iPhone12_3_06',
  'CSAFE_WP006E_iPhone12_3_09',
  'CSAFE_WP006E_iPhone14_1_02',
  'CSAFE_WP006E_iPhone14_1_04',
  'CSAFE_WP006E_iPhone14_1_09',
  'CSAFE_WP006E_iPhone14_1_12',
  'CSAFE_WP006E_iPhone14_3_04',
  'CSAFE_WP006E_iPhone14_3_07',
  'CSAFE_WP006E_iPhone14_3_08',
  'CSAFE_WP006E_iPhone14_3_10',
  'CSAFE_WP006E_iPhone14_3_11',
  'CSAFE_WP006E_note10_1_01',
  'CSAFE_WP006E_note10_1_06',
  'CSAFE_WP006E_note10_1_08',
  'CSAFE_WP006E_note10_1_09',
  'CSAFE_WP006E_note10_1_11',
  'CSAFE_WP006E_note10_3_02',
  'CSAFE_WP006E_note10_3_04',
  'CSAFE_WP006E_note10_3_05',
  'CSAFE_WP006E_note10_3_07',
] as const);

export const WP007D_PROGRAMMATIC_SELECTION = Object.freeze(
  ['CHART', 'DIAGRAM', 'TEXT_GRAPHIC', 'VECTOR_GRAPHIC', 'UI_CAPTURE', 'OTHER_DIGITAL_NON_AI']
    .flatMap((type) => Array.from({ length: 4 }, (_, index) => `PNGN_${type}_${String(index + 1).padStart(2, '0')}`)),
);

export const WP007D_PROXY_FALLBACK = Object.freeze({
  generatorId: 'G4_DREAMSHAPER_8_LCM_IMG2IMG',
  modelId: '@cf/lykon/dreamshaper-8-lcm',
  modelFamily: 'DREAMSHAPER_8_LCM_IMG2IMG',
  routeDocs: 'https://developers.cloudflare.com/workers-ai/models/dreamshaper-8-lcm/',
  currentSchemaModel: '@cf/lykon/dreamshaper-8-lcm',
  fixedParameters: Object.freeze({ width: 512, height: 512, num_steps: 20, guidance: 7.5 }),
  strengthSemantics: 'Cloudflare img2img strength, documented as 0..1; lower values stay closer to input',
  priceBasis: '$0.00 per step on current official model page',
  activationRule: 'ONLY_IF_PREDECLARED_PRIMARY_ROUTE_IS_BLOCKED_BEFORE_SCORES',
});

export const WP007D_BLOCKED_PRIMARY_ROUTE = Object.freeze({
  generatorId: 'G1_SD15_IMG2IMG',
  modelId: '@cf/runwayml/stable-diffusion-v1-5-img2img',
  trustedWorkflowRunId: '35074947493',
  httpStatus: 404,
  providerErrorCode: 6002,
  providerErrorMessage: 'Model schema not found',
  generationCalls: 0,
});

export const WP007D_PROXY_GENERATORS = Object.freeze([
  {
    generatorId: 'G2_SDXL_BASE_IMG2IMG',
    modelId: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    modelFamily: 'STABLE_DIFFUSION_XL_BASE_1_0_IMG2IMG',
    routeDocs: 'https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-base-1.0/',
    currentSchemaModel: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    fixedParameters: Object.freeze({ width: 512, height: 512, num_steps: 20, guidance: 7.5 }),
    strengthSemantics: 'Cloudflare img2img strength, documented as 0..1; lower values stay closer to input',
    priceBasis: '$0.00 per step on current official model page',
  },
  {
    generatorId: 'G3_SDXL_LIGHTNING_IMG2IMG',
    modelId: '@cf/bytedance/stable-diffusion-xl-lightning',
    modelFamily: 'STABLE_DIFFUSION_XL_LIGHTNING_IMG2IMG',
    routeDocs: 'https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/',
    currentSchemaModel: '@cf/bytedance/stable-diffusion-xl-lightning',
    fixedParameters: Object.freeze({ width: 512, height: 512, num_steps: 4 }),
    strengthSemantics: 'Cloudflare img2img strength, documented as 0..1; lower values stay closer to input',
    priceBasis: '$0.00 per step on current official model page',
  },
  WP007D_PROXY_FALLBACK,
] as const);

export const WP007D_CANDIDATE_IDS = Object.freeze([
  'C1_CLIP_STD_LR_V0',
  'C2_CLIP_PAIRDELTA_LR_V0',
  'C3_DINO2_STD_LR_V0',
  'C4_DINO2_PAIRDELTA_LR_V0',
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`wp007d_string_invalid:${field}`);
}

function assertHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`wp007d_hash_invalid:${field}`);
}

function assertCommitSha(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value)) throw new Error(`wp007d_commit_sha_invalid:${field}`);
}

export function deriveProxySeed(sourceFamilyId: string, modelId: string, strength: number): number {
  assertNonEmptyString(sourceFamilyId, 'sourceFamilyId');
  assertNonEmptyString(modelId, 'modelId');
  if (!WP007D_STRENGTHS.includes(strength as (typeof WP007D_STRENGTHS)[number])) throw new Error('wp007d_strength_invalid');
  return createHash('sha256').update(`WP007D:${sourceFamilyId}:${modelId}:${strength.toFixed(2)}`).digest().readUInt32BE(0);
}

export function classifyRuntimeTier(p50Seconds: number, p95Seconds: number): 'FAST' | 'MODERATE' | 'SLOW' | 'NOT_PRACTICAL' {
  if (!Number.isFinite(p50Seconds) || !Number.isFinite(p95Seconds) || p50Seconds < 0 || p95Seconds < 0) throw new Error('wp007d_runtime_invalid');
  if (p95Seconds <= 5) return 'FAST';
  if (p95Seconds <= 20) return 'MODERATE';
  if (p95Seconds <= 60) return 'SLOW';
  return 'NOT_PRACTICAL';
}

export function proxyRequestBody({ modelId, imageBytes, strength, seed }: { modelId: string; imageBytes: Uint8Array | readonly number[]; strength: number; seed: number }): Record<string, unknown> {
  const model = WP007D_PROXY_GENERATORS.find((candidate) => candidate.modelId === modelId);
  if (!model) throw new Error(`wp007d_model_not_authorized:${modelId}`);
  if (!imageBytes || typeof imageBytes !== 'object' || typeof imageBytes.length !== 'number' || imageBytes.length === 0 || !Array.from(imageBytes).every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) throw new Error('wp007d_image_bytes_invalid');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('wp007d_seed_invalid');
  if (!WP007D_STRENGTHS.includes(strength as (typeof WP007D_STRENGTHS)[number])) throw new Error('wp007d_strength_invalid');
  return {
    prompt: WP007D_PROXY_PROMPT,
    ...model.fixedParameters,
    [WP007D_PROXY_IMAGE_INPUT_FIELD]: Array.from(imageBytes),
    strength,
    seed,
  };
}

export function familyBalancedWeights(sourceFamilyIds: readonly string[]): number[] {
  if (sourceFamilyIds.length === 0) throw new Error('wp007d_family_weights_empty');
  const unique = new Set(sourceFamilyIds);
  if (unique.size !== sourceFamilyIds.length) throw new Error('wp007d_family_weights_duplicate');
  return sourceFamilyIds.map(() => 1 / sourceFamilyIds.length);
}

export function assertWp007dSourceRecord(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007d_source_record_invalid');
  for (const field of ['sampleId', 'sourceFamilyId', 'sourceType', 'sourceRole']) assertNonEmptyString(value[field], field);
  if (value.sourceRole !== 'PAIR_BASE_TRAINING_ELIGIBLE') throw new Error('wp007d_source_role_invalid');
  if (!isRecord(value.rights) || value.rights.trainingEligibility !== 'TRAINING_ALLOWED_EXPLICIT' && value.rights.trainingEligibility !== 'TRAINING_ALLOWED_WITH_CONSTRAINTS') throw new Error('wp007d_source_training_rights_invalid');
  if (!isRecord(value.file)) throw new Error('wp007d_source_file_invalid');
  assertHash(value.file.sha256, 'file.sha256');
  assertHash(value.canonicalSha256, 'canonicalSha256');
  if (value.file.width === undefined || value.file.height === undefined) throw new Error('wp007d_source_dimensions_missing');
  if (value.sourceType === 'FLUX1' || value.sourceType === 'FLUX2' || value.sourceRole.includes('HOLDOUT')) throw new Error('wp007d_holdout_source_forbidden');
}

export function assertWp007dPlan(value: unknown): void {
  if (!isRecord(value) || value.schemaVersion !== WP007D_PROXY_PLAN_SCHEMA_VERSION) throw new Error('wp007d_plan_schema_invalid');
  if (value.baseSha !== undefined) assertCommitSha(value.baseSha, 'baseSha');
  if (value.holdoutPixelAccess !== false || value.flux2PixelAccess !== false) throw new Error('wp007d_holdout_access_invalid');
  if (value.prompt !== WP007D_PROXY_PROMPT) throw new Error('wp007d_prompt_invalid');
  if (!isRecord(value.proxyRequestContract) || value.proxyRequestContract.imageField !== WP007D_PROXY_IMAGE_INPUT_FIELD || value.proxyRequestContract.imageEncoding !== WP007D_PROXY_IMAGE_INPUT_ENCODING || value.proxyRequestContract.priorImageField !== 'image_b64') throw new Error('wp007d_request_contract_invalid');
  if (!Array.isArray(value.sources) || value.sources.length !== WP007D_EXPECTED_SOURCE_FAMILY_COUNT) throw new Error('wp007d_source_count_invalid');
  const familyIds = new Set<string>();
  for (const source of value.sources) {
    assertWp007dSourceRecord(source);
    const familyId = String((source as Record<string, unknown>).sourceFamilyId);
    if (familyIds.has(familyId)) throw new Error('wp007d_source_family_duplicate');
    familyIds.add(familyId);
  }
  if (!Array.isArray(value.generators) || stableStringifyWp007a(value.generators.map((generator) => isRecord(generator) ? generator.modelId : undefined)) !== stableStringifyWp007a(WP007D_PROXY_GENERATORS.map((generator) => generator.modelId))) throw new Error('wp007d_generator_set_invalid');
  for (const generator of value.generators) {
    if (!isRecord(generator) || String(generator.modelId).toLowerCase().includes('flux')) throw new Error('wp007d_flux_generator_forbidden');
  }
  if (stableStringifyWp007a(value.strengths) !== stableStringifyWp007a([...WP007D_STRENGTHS])) throw new Error('wp007d_strength_matrix_invalid');
  if (value.requested !== WP007D_EXPECTED_REQUEST_COUNT) throw new Error('wp007d_request_count_invalid');
  if (value.costCapUsd !== WP007D_COST_CAP_USD) throw new Error('wp007d_cost_cap_invalid');
}

export function assertWp007dGeneratedRecord(value: unknown): void {
  if (!isRecord(value)) throw new Error('wp007d_generated_record_invalid');
  for (const field of ['sampleId', 'sourceFamilyId', 'generatorModelId', 'generatorFamily', 'strength', 'prompt', 'seedState', 'originTruth', 'trainingRole']) assertNonEmptyString(value[field], field);
  if (value.seedState !== 'DERIVED_DOCUMENTED_SEED_SUBMITTED') throw new Error('wp007d_seed_state_invalid');
  if (value.originTruth !== 'GENERATIVE_DERIVED_PROXY' || value.trainingRole !== 'PAIRED_GENERATIVE_PROXY') throw new Error('wp007d_proxy_truth_role_invalid');
  assertHash(value.canonicalSourceSha256, 'canonicalSourceSha256');
  if (!isRecord(value.file)) throw new Error('wp007d_generated_file_invalid');
  assertHash(value.file.sha256, 'file.sha256');
  if ('apiToken' in value || 'authorization' in value || 'secret' in value || 'rawPixels' in value || 'absolutePath' in value) throw new Error('wp007d_private_field');
}

export function stableWp007dHash(value: unknown): string {
  return stableArtifactHash(value);
}

export function sha256Bytes(value: Uint8Array): string {
  return sha256Hex(value);
}
