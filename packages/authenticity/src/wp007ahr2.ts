import {
  stableArtifactHash,
  stableStringifyWp007a,
} from './wp007a.ts';
import {
  WP007AH_MODEL_IDS,
  WP007AH_PROMPT_COUNT,
} from './wp007ah.ts';

export const WP007AHR2_AUTHORIZATION_SCHEMA_VERSION = 'lythaus-wp007ahr2-execution-authorization-v1' as const;
export const WP007AHR2_OWNER_AUTHORIZATION = 'AUTHORIZED_BOUNDED_PAID_WP007AHR2' as const;
export const WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD = 1 as const;
export const WP007AHR2_PROJECT_MONTHLY_INCREMENTAL_CEILING_USD = 10 as const;
export const WP007AHR2_HISTORICAL_FREEZE_SHA256 = '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514' as const;
export const WP007AHR2_EXECUTION_AUTHORIZATION_SHA256 = 'eaa403c2a5519bcc130a33062ef1f4bbb67ba724eb9b003f57c3e609400d91ab' as const;
export const WP007AHR2_AUTHORIZED_CALLS = WP007AH_PROMPT_COUNT * WP007AH_MODEL_IDS.length;
export const WP007AHR2_MAX_TRANSPORT_RETRIES = 1 as const;
export const WP007AHR2_MAX_ATTEMPTS = WP007AHR2_AUTHORIZED_CALLS * (WP007AHR2_MAX_TRANSPORT_RETRIES + 1);
export const WP007AHR2_OUTPUT_TILES_PER_1024_IMAGE = 4 as const;

export const WP007AHR2_MODEL_PRICING = Object.freeze({
  '@cf/black-forest-labs/flux-1-schnell': Object.freeze({
    inputTileUsd: 0.0000528,
    outputTileUsd: 0,
    stepUsd: 0.0001056,
    steps: 4,
  }),
  '@cf/black-forest-labs/flux-2-klein-4b': Object.freeze({
    inputTileUsd: 0.000059,
    outputTileUsd: 0.000287,
    stepUsd: 0,
    steps: 0,
  }),
} as const);

export const WP007AHR2_OFFICIAL_COST_SOURCES = Object.freeze([
  'https://developers.cloudflare.com/workers-ai/platform/pricing/',
  'https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/',
  'https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/',
] as const);

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactModels(value: unknown): boolean {
  return Array.isArray(value) && stableStringifyWp007a(value) === stableStringifyWp007a([...WP007AH_MODEL_IDS]);
}

function withoutAuthorizationHash(value: RecordValue): RecordValue {
  const { authorizationSha256: _authorizationSha256, ...content } = value;
  return content;
}

export function estimateWp007ahr2BaseCostUsd(
  promptCount = WP007AH_PROMPT_COUNT,
  modelIds: readonly string[] = WP007AH_MODEL_IDS,
): number {
  return modelIds.reduce((total, modelId) => {
    const pricing = WP007AHR2_MODEL_PRICING[modelId as keyof typeof WP007AHR2_MODEL_PRICING];
    if (!pricing) throw new Error(`wp007ahr2_model_pricing_missing:${modelId}`);
    const perImage = (WP007AHR2_OUTPUT_TILES_PER_1024_IMAGE * (pricing.inputTileUsd + pricing.outputTileUsd)) + (pricing.steps * pricing.stepUsd);
    return total + (perImage * promptCount);
  }, 0);
}

export function estimateWp007ahr2MaximumCostUsd(
  promptCount = WP007AH_PROMPT_COUNT,
  modelIds: readonly string[] = WP007AH_MODEL_IDS,
): number {
  const baseCost = estimateWp007ahr2BaseCostUsd(promptCount, modelIds);
  const maximumWithRetries = baseCost * (WP007AHR2_MAX_TRANSPORT_RETRIES + 1);
  return Math.ceil((maximumWithRetries - Number.EPSILON) * 100) / 100;
}

export function assertWp007ahr2ExecutionAuthorization(value: unknown): asserts value is RecordValue {
  if (!isRecord(value)) throw new Error('wp007ahr2_execution_authorization_invalid');
  if (value.schemaVersion !== WP007AHR2_AUTHORIZATION_SCHEMA_VERSION) throw new Error('wp007ahr2_execution_authorization_schema_invalid');
  if (value.ownerAuthorization !== WP007AHR2_OWNER_AUTHORIZATION) throw new Error('wp007ahr2_owner_authorization_invalid');
  if (value.historicalGenerationFreezeSha256 !== WP007AHR2_HISTORICAL_FREEZE_SHA256) throw new Error('wp007ahr2_historical_freeze_mismatch');
  if (value.maxIncrementalPaidCostUsd !== WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD) throw new Error('wp007ahr2_cost_cap_invalid');
  if (value.projectMonthlyIncrementalCeilingUsd !== WP007AHR2_PROJECT_MONTHLY_INCREMENTAL_CEILING_USD) throw new Error('wp007ahr2_monthly_ceiling_invalid');
  if (!exactModels(value.authorizedModels)) throw new Error('wp007ahr2_authorized_models_invalid');
  if (value.authorizedPromptCount !== WP007AH_PROMPT_COUNT) throw new Error('wp007ahr2_prompt_count_invalid');
  if (value.authorizedCallsMaximum !== WP007AHR2_AUTHORIZED_CALLS) throw new Error('wp007ahr2_call_cap_invalid');
  if (value.maxTransportRetries !== WP007AHR2_MAX_TRANSPORT_RETRIES || value.maxAttemptsMaximum !== WP007AHR2_MAX_ATTEMPTS) throw new Error('wp007ahr2_retry_cap_invalid');
  if (value.purpose !== 'EF3_SEALED_GENERATOR_HOLDOUT_MATERIALISATION') throw new Error('wp007ahr2_purpose_invalid');
  if (value.changesScientificFreeze !== false) throw new Error('wp007ahr2_scientific_freeze_mutation');
  if (value.trainingEligibility !== 'EVALUATION_ONLY') throw new Error('wp007ahr2_training_state_invalid');
  if (value.rightsStatus !== 'PASS_FOR_BOUNDED_HOLDOUT_EVALUATION') throw new Error('wp007ahr2_rights_state_invalid');
  if (value.noDetectorInference !== true || value.noTraining !== true || value.noTransformations !== true || value.noProductionChanges !== true) throw new Error('wp007ahr2_prohibited_operation_state_invalid');
  if (!isRecord(value.costEstimate)) throw new Error('wp007ahr2_cost_estimate_missing');
  const estimate = value.costEstimate;
  if (estimate.baseRunListPriceUsd !== estimateWp007ahr2BaseCostUsd() || estimate.estimatedMaxIncrementalPaidCostUsd !== estimateWp007ahr2MaximumCostUsd()) throw new Error('wp007ahr2_cost_estimate_mismatch');
  if (estimate.pricingSourceDate !== '2026-09-14' || estimate.rounding !== 'CEILING_TO_CENT' || !Array.isArray(estimate.officialSources) || stableStringifyWp007a(estimate.officialSources) !== stableStringifyWp007a([...WP007AHR2_OFFICIAL_COST_SOURCES])) throw new Error('wp007ahr2_cost_provenance_invalid');
  if (typeof value.authorizationSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.authorizationSha256)) throw new Error('wp007ahr2_authorization_hash_missing');
  if (value.authorizationSha256 !== WP007AHR2_EXECUTION_AUTHORIZATION_SHA256 || stableArtifactHash(withoutAuthorizationHash(value)) !== value.authorizationSha256) throw new Error('wp007ahr2_authorization_hash_mismatch');
}

export function assertWp007ahr2BoundedCost({ estimatedMaxCostUsd, requestedCapUsd = WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD }: { estimatedMaxCostUsd: number; requestedCapUsd?: number }): void {
  if (!Number.isFinite(estimatedMaxCostUsd) || estimatedMaxCostUsd < 0) throw new Error('wp007ahr2_cost_estimate_invalid');
  if (requestedCapUsd !== WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD) throw new Error('wp007ahr2_requested_cost_cap_invalid');
  if (estimatedMaxCostUsd > WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD) throw new Error('wp007ahr2_projected_cost_exceeds_owner_cap');
}
