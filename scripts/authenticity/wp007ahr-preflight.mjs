import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertWp007ahGenerationFreeze,
  assertWp007ahRightsRecord,
  assertWp007ahPromptSelection,
  WP007AH_MODEL_IDS,
  WP007AH_MODEL_ROLES,
  WP007AH_PROMPT_BANK_VERSION,
  WP007AH_PROMPT_COUNT,
  WP007AH_WP007A_BENCHMARK_FINGERPRINT,
  selectWp007ahPromptIds,
  wp007ahPromptSelectionHash,
} from '../../packages/authenticity/src/wp007ah.ts';
import { stableArtifactHash } from '../../packages/authenticity/src/wp007a.ts';
import {
  WP007AHR4_EXECUTION_CONFIRMATION,
  WP007AHR4_EXECUTION_MODE,
  WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
} from '../../packages/authenticity/src/wp007ahr4.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WP007AHR_REPOSITORY = ['As', 'oraKK', '/Lythaus'].join('');
export const WP007AHR_TRUSTED_REF = 'refs/heads/main';
export const WP007AHR_EXPECTED_HISTORICAL_MAIN_SHA = '71fc02ff9eaefc1be3d30940b2efe5c5496ba6ee';
export const WP007AHR_FREEZE_SHA256 = '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514';
export const WP007AHR_PROMPT_SELECTION_SHA256 = '6c17bf38a30e9d7c987107a97aaab48626b684535ce61dd239652654d2535cb8';
export const WP007AHR_HISTORICAL_FINGERPRINT = '1efd1254953a3551ed4664eea5fe0dbec3cb21e674f468df04c079202077e495';
export const WP007AHR_MAX_PAID_COST_USD = 0;
export const WP007AHR_ESTIMATED_FROZEN_RUN_LIST_PRICE_USD = 0.080704;
export const WP007AHR_EXECUTION_CONFIRMATION = 'EXECUTE_FROZEN_WP007AH';
export const WP007AHR_WORKFLOW_PATH = '.github/workflows/wp007ah-cloudflare-holdout.yml';
export const WP007AHR_OFFICIAL_COST_SOURCES = Object.freeze([
  'https://developers.cloudflare.com/workers-ai/platform/pricing/',
  'https://developers.cloudflare.com/analytics/graphql-api/',
  'https://developers.cloudflare.com/api/resources/ai/',
]);

const EXPECTED_PROMPT_IDS = Object.freeze([
  'PROMPT_001', 'PROMPT_002', 'PROMPT_003', 'PROMPT_004', 'PROMPT_005',
  'PROMPT_011', 'PROMPT_012', 'PROMPT_013', 'PROMPT_014', 'PROMPT_015',
  'PROMPT_021', 'PROMPT_022', 'PROMPT_023', 'PROMPT_024', 'PROMPT_025',
  'PROMPT_031', 'PROMPT_032', 'PROMPT_033', 'PROMPT_034', 'PROMPT_035',
  'PROMPT_041', 'PROMPT_042', 'PROMPT_043', 'PROMPT_044', 'PROMPT_045',
  'PROMPT_051', 'PROMPT_052', 'PROMPT_053', 'PROMPT_054', 'PROMPT_055',
  'PROMPT_061', 'PROMPT_062', 'PROMPT_063', 'PROMPT_064', 'PROMPT_065',
  'PROMPT_071', 'PROMPT_072', 'PROMPT_073', 'PROMPT_074', 'PROMPT_075',
]);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertTrustedMain({ ref, repository }) {
  if (ref !== WP007AHR_TRUSTED_REF) throw new Error('wp007ahr_untrusted_ref');
  if (repository !== WP007AHR_REPOSITORY) throw new Error('wp007ahr_untrusted_repository');
}

export function assertExecutionConfirmation({ mode, confirm, expectedFreezeSha256, flux1ContractAmendmentSha256 = '' }) {
  if (mode !== 'preflight' && mode !== 'execute' && mode !== WP007AHR4_EXECUTION_MODE) throw new Error('wp007ahr_mode_invalid');
  if (mode === WP007AHR4_EXECUTION_MODE) {
    if (confirm !== WP007AHR4_EXECUTION_CONFIRMATION) throw new Error('wp007ahr4_execute_confirmation_invalid');
    if (expectedFreezeSha256 !== WP007AHR_FREEZE_SHA256) throw new Error('wp007ahr4_execute_freeze_confirmation_invalid');
    if (flux1ContractAmendmentSha256 !== WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256) throw new Error('wp007ahr4_contract_amendment_hash_invalid');
    return;
  }
  if (mode !== 'execute') return;
  if (confirm !== WP007AHR_EXECUTION_CONFIRMATION) throw new Error('wp007ahr_execute_confirmation_invalid');
  if (expectedFreezeSha256 !== WP007AHR_FREEZE_SHA256) throw new Error('wp007ahr_execute_freeze_confirmation_invalid');
}

export async function loadFrozenArtifacts(rootDir = REPOSITORY_ROOT) {
  const researchDir = path.join(rootDir, 'research', 'wp007ah');
  return {
    freeze: await readJson(path.join(researchDir, 'generation-freeze.json')),
    promptSubset: await readJson(path.join(researchDir, 'prompt-subset-freeze.json')),
    promptBank: await readJson(path.join(rootDir, 'research', 'wp007a', 'prompt-bank.json')),
    rights: await readJson(path.join(researchDir, 'cloudflare-rights-revalidation.json')),
    roles: await readJson(path.join(researchDir, 'holdout-role-manifest.json')),
    generationManifest: await readJson(path.join(researchDir, 'cloudflare-generation-manifest.json')),
    runManifest: await readJson(path.join(researchDir, 'wp007ah-run-manifest.json')),
    historicalFingerprint: await readJson(path.join(researchDir, 'wp007ah-fingerprint.json')),
  };
}

export async function assertFrozenArtifacts(rootDir = REPOSITORY_ROOT) {
  const artifacts = await loadFrozenArtifacts(rootDir);
  const { freeze, promptSubset, promptBank, rights, roles, generationManifest, runManifest, historicalFingerprint } = artifacts;

  assertWp007ahGenerationFreeze(freeze);
  const { freezeSha256, ...freezeWithoutHash } = freeze;
  if (freezeSha256 !== WP007AHR_FREEZE_SHA256 || stableArtifactHash(freezeWithoutHash) !== freezeSha256) {
    throw new Error('wp007ahr_generation_freeze_hash_mismatch');
  }
  if (freeze.baseSha !== '6543ec6496a4d4b006fb40b6f5de50cfd9e98009') throw new Error('wp007ahr_historical_base_mismatch');
  if (freeze.baseWp007aBenchmarkFingerprint !== WP007AH_WP007A_BENCHMARK_FINGERPRINT) throw new Error('wp007ahr_historical_benchmark_mismatch');
  if (freeze.promptBankVersion !== WP007AH_PROMPT_BANK_VERSION || freeze.promptIds.length !== WP007AH_PROMPT_COUNT || !sameJson(freeze.promptIds, EXPECTED_PROMPT_IDS)) throw new Error('wp007ahr_prompt_freeze_mismatch');
  if (promptSubset.promptSelectionSha256 !== WP007AHR_PROMPT_SELECTION_SHA256) throw new Error('wp007ahr_prompt_selection_hash_mismatch');
  assertWp007ahPromptSelection(promptBank, promptSubset.promptIds);
  if (!sameJson(selectWp007ahPromptIds(promptBank), EXPECTED_PROMPT_IDS) || !sameJson(promptSubset.promptIds, EXPECTED_PROMPT_IDS)) throw new Error('wp007ahr_prompt_selection_mismatch');
  if (wp007ahPromptSelectionHash(WP007AH_PROMPT_BANK_VERSION, promptSubset.promptIds) !== WP007AHR_PROMPT_SELECTION_SHA256) throw new Error('wp007ahr_prompt_selection_recompute_mismatch');

  if (freeze.models.length !== 2 || !sameJson(freeze.models.map((model) => model.modelId), [...WP007AH_MODEL_IDS])) throw new Error('wp007ahr_model_set_mismatch');
  for (const model of freeze.models) {
    if (model.benchmarkRole !== WP007AH_MODEL_ROLES[model.modelId] || model.trainingEligibility !== 'EVALUATION_ONLY' || model.evaluationEligibility !== 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY') throw new Error(`wp007ahr_model_policy_mismatch:${model.modelId}`);
  }
  if (freeze.maxIncrementalPaidCostUsd !== WP007AHR_MAX_PAID_COST_USD || freeze.noDetectorInference !== true || freeze.noTraining !== true || freeze.noTransformations !== true) throw new Error('wp007ahr_frozen_policy_mismatch');
  if (freeze.outputCache?.insideRepository !== false || freeze.outputCache?.mediaCommittedToGit !== false) throw new Error('wp007ahr_cache_policy_mismatch');

  if (rights.rightsRevalidationStatus !== 'PASS_FOR_BOUNDED_HOLDOUT_EVALUATION' || rights.provider !== 'BLACK_FOREST_LABS' || rights.accessRoute !== 'CLOUDFLARE_WORKERS_AI' || rights.trainingEligibility !== 'EVALUATION_ONLY' || rights.evaluationEligibility !== 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY' || rights.publicRedistribution !== 'NOT_AUTHORIZED') throw new Error('wp007ahr_rights_state_mismatch');
  for (const model of rights.models) assertWp007ahRightsRecord(model);
  if (!sameJson(roles.models.map((model) => model.modelId), [...WP007AH_MODEL_IDS]) || roles.models.some((model) => model.trainingEligibility !== 'EVALUATION_ONLY')) throw new Error('wp007ahr_role_manifest_mismatch');

  if (generationManifest.generationStatus !== 'AUTH_BLOCKED' || generationManifest.generationCalls !== 0 || generationManifest.valid !== 0 || generationManifest.failed !== 0 || generationManifest.records.length !== 0 || generationManifest.detectorInferenceRun !== false || generationManifest.modelTrainingRun !== false || generationManifest.transformationsRun !== false || generationManifest.mediaCommittedToGit !== false) throw new Error('wp007ahr_historical_generation_state_changed');
  if (runManifest.runStatus !== 'AUTH_BLOCKED' || runManifest.authPreflight?.generationCalls !== 0 || runManifest.detectorInferenceCalls !== 0 || runManifest.modelTrainingRuns !== 0 || runManifest.transformationsRun !== 0 || runManifest.mediaCommittedToGit !== false || runManifest.productionChanges !== false) throw new Error('wp007ahr_historical_run_state_changed');
  if (historicalFingerprint.fingerprintSha256 !== WP007AHR_HISTORICAL_FINGERPRINT || historicalFingerprint.generationFreezeSha256 !== WP007AHR_FREEZE_SHA256 || historicalFingerprint.canonicalInput?.records?.length !== 0 || historicalFingerprint.detectorInferenceRun !== false || historicalFingerprint.modelTrainingRun !== false || historicalFingerprint.transformationsRun !== false || historicalFingerprint.sourceMediaCommitted !== false) throw new Error('wp007ahr_historical_fingerprint_changed');

  return { freezeHash: freezeSha256, promptSelectionHash: WP007AHR_PROMPT_SELECTION_SHA256, modelIds: [...WP007AH_MODEL_IDS] };
}

export function modelCatalogUrl(accountId, modelId) {
  const searchTerm = String(modelId).split('/').at(-1) || String(modelId);
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?search=${encodeURIComponent(searchTerm)}&hide_experimental=true&include_deprecated=false&per_page=20`;
}

export function modelSchemaUrl(accountId, modelId) {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/schema?model=${encodeURIComponent(modelId)}`;
}

function modelEntries(payload) {
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.result?.models)) return payload.result.models;
  if (Array.isArray(payload?.models)) return payload.models;
  return [];
}

export function modelCallableName(entry) {
  if (!entry || typeof entry !== 'object') return null;
  for (const key of ['name', 'model_id', 'modelId']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export async function runModelCatalogPreflight({ token, accountId, fetchImpl = globalThis.fetch, modelIds = WP007AH_MODEL_IDS }) {
  if (!token || !accountId) return { status: 'REQUIRED_SECRET_MISSING', models: [], credentialsPrinted: false };
  if (typeof fetchImpl !== 'function') return { status: 'CATALOG_UNAVAILABLE', models: [], credentialsPrinted: false };
  const requestedModelIds = [...modelIds];
  const models = [];
  for (const modelId of requestedModelIds) {
    try {
      const response = await fetchImpl(modelCatalogUrl(accountId, modelId), {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      });
      if (!response.ok) {
        models.push({ modelId, status: 'CATALOG_UNAVAILABLE', httpStatus: response.status, providerErrorCode: null, providerErrorMessage: null });
        continue;
      }
      const payload = await response.json();
      const entries = modelEntries(payload);
      const match = entries.find((entry) => modelCallableName(entry) === modelId);
      models.push({
        modelId,
        status: match ? 'CATALOG_MATCH' : 'CATALOG_MISMATCH',
        httpStatus: response.status,
        catalogInternalId: typeof match?.id === 'string' ? match.id : null,
        callableName: modelCallableName(match),
      });
    } catch {
      models.push({ modelId, status: 'CATALOG_UNAVAILABLE', httpStatus: null, providerErrorCode: null, providerErrorMessage: null });
    }
  }
  const status = models.length === requestedModelIds.length && models.every((model) => model.status === 'CATALOG_MATCH')
    ? 'CATALOG_MATCH'
    : models.some((model) => model.status === 'CATALOG_UNAVAILABLE') ? 'CATALOG_UNAVAILABLE' : 'CATALOG_MISMATCH';
  return { status, models, credentialsPrinted: false };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const SAFE_SCHEMA_FIELDS = Object.freeze(['prompt', 'steps', 'seed', 'width', 'height']);

function safeSchemaTypes(value) {
  const raw = value?.type;
  const values = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  return values.filter((type) => typeof type === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,31}$/u.test(type)).map((type) => type.toUpperCase()).slice(0, 8);
}

function safeSchemaNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function schemaFieldCapability(input, field) {
  const properties = isRecord(input?.properties) ? input.properties : {};
  const property = isRecord(properties[field]) ? properties[field] : null;
  const types = safeSchemaTypes(property);
  return {
    present: Boolean(property),
    type: types.length === 1 ? types[0] : types.length > 1 ? types.join('|') : null,
    types,
    required: Array.isArray(input?.required) && input.required.includes(field),
    minimum: safeSchemaNumber(property?.minimum),
    maximum: safeSchemaNumber(property?.maximum),
    exclusiveMinimum: safeSchemaNumber(property?.exclusiveMinimum),
    exclusiveMaximum: safeSchemaNumber(property?.exclusiveMaximum),
  };
}

function schemaCapabilities(input) {
  return Object.fromEntries(SAFE_SCHEMA_FIELDS.map((field) => [field, schemaFieldCapability(input, field)]));
}

function safeProviderErrorMessage(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return null;
  for (const item of payload.errors) {
    if (!isRecord(item) || typeof item.message !== 'string') continue;
    const message = item.message.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
    if (!message) continue;
    return message.replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [REDACTED]').slice(0, 200);
  }
  return null;
}

function safeProviderErrorCode(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return null;
  for (const item of payload.errors) {
    if (!isRecord(item)) continue;
    if (typeof item.code === 'number' && Number.isSafeInteger(item.code)) return item.code;
    if (typeof item.code === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/u.test(item.code)) return item.code;
  }
  return null;
}

function schemaObject(value) {
  return isRecord(value) && value.type === 'object';
}

function schemaIsConsistentWithRoute(modelId, input, output) {
  if (!schemaObject(input) || !schemaObject(output)) return false;
  const properties = isRecord(input.properties) ? input.properties : null;
  const hasPromptProperty = Boolean(properties && Object.prototype.hasOwnProperty.call(properties, 'prompt'));
  const genericObjectSchema = !properties || input.additionalProperties === true;
  if (modelId === '@cf/black-forest-labs/flux-1-schnell') return hasPromptProperty || genericObjectSchema;
  if (modelId === '@cf/black-forest-labs/flux-2-klein-4b') {
    const multipart = properties?.multipart;
    return (isRecord(multipart) && multipart.type === 'object') || genericObjectSchema;
  }
  return false;
}

function schemaFailure({ modelId, status, httpStatus = null, payload = null, reason = null }) {
  return {
    modelId,
    status,
    httpStatus,
    providerErrorCode: safeProviderErrorCode(payload),
    providerErrorMessage: safeProviderErrorMessage(payload),
    schemaReason: reason,
    schemaCapabilities: null,
  };
}

export async function runModelSchemaPreflight({ token, accountId, fetchImpl = globalThis.fetch, modelIds = WP007AH_MODEL_IDS }) {
  if (!token || !accountId) return { status: 'REQUIRED_SECRET_MISSING', models: [], credentialsPrinted: false };
  if (typeof fetchImpl !== 'function') return { status: 'SCHEMA_API_ERROR', models: [], credentialsPrinted: false };
  const requestedModelIds = [...modelIds];
  const models = [];
  for (const modelId of requestedModelIds) {
    try {
      const response = await fetchImpl(modelSchemaUrl(accountId, modelId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (response.status === 401) {
        models.push(schemaFailure({ modelId, status: 'SCHEMA_AUTH_FAILED', httpStatus: response.status, payload }));
        continue;
      }
      if (response.status === 403) {
        models.push(schemaFailure({ modelId, status: 'SCHEMA_FORBIDDEN', httpStatus: response.status, payload }));
        continue;
      }
      if (response.status === 404) {
        models.push(schemaFailure({ modelId, status: 'SCHEMA_NOT_FOUND', httpStatus: response.status, payload }));
        continue;
      }
      if (!response.ok) {
        models.push(schemaFailure({ modelId, status: 'SCHEMA_API_ERROR', httpStatus: response.status, payload }));
        continue;
      }
      if (!isRecord(payload) || payload.success !== true || !isRecord(payload.result)) {
        models.push(schemaFailure({ modelId, status: 'SCHEMA_API_ERROR', httpStatus: response.status, payload, reason: 'success_false_or_result_missing' }));
        continue;
      }
      const input = payload.result.input;
      const output = payload.result.output;
      if (!schemaIsConsistentWithRoute(modelId, input, output)) {
        models.push(schemaFailure({ modelId, status: 'SCHEMA_MALFORMED', httpStatus: response.status, payload, reason: 'input_output_object_schema_required' }));
        continue;
      }
      models.push({
        modelId,
        status: 'SCHEMA_AVAILABLE',
        httpStatus: response.status,
        inputType: input.type,
        outputType: output.type,
        promptPropertyDeclared: Boolean(isRecord(input.properties) && Object.prototype.hasOwnProperty.call(input.properties, 'prompt')),
        multipartPropertyDeclared: Boolean(isRecord(input.properties?.multipart) && input.properties.multipart.type === 'object'),
        schemaCapabilities: schemaCapabilities(input),
        providerErrorCode: null,
        providerErrorMessage: null,
      });
    } catch {
      models.push(schemaFailure({ modelId, status: 'SCHEMA_API_ERROR' }));
    }
  }
  const available = models.filter((model) => model.status === 'SCHEMA_AVAILABLE').length;
  const authFailures = models.filter((model) => model.status === 'SCHEMA_AUTH_FAILED' || model.status === 'SCHEMA_FORBIDDEN').length;
  const authStatus = available > 0 || models.some((model) => ['SCHEMA_NOT_FOUND', 'SCHEMA_API_ERROR', 'SCHEMA_MALFORMED'].includes(model.status))
    ? 'PASS'
    : authFailures === models.length ? 'AUTH_FAILED' : 'SCHEMA_API_ERROR';
  let status = 'SCHEMA_API_ERROR';
  if (available === models.length && models.length === requestedModelIds.length) status = 'PASS';
  else if (available > 0) status = 'MODEL_ROUTE_PARTIAL';
  else if (models.length === requestedModelIds.length && models.every((model) => model.status === 'SCHEMA_NOT_FOUND')) status = 'MODEL_ROUTE_UNAVAILABLE';
  else if (models.length > 0 && models.every((model) => model.status === 'SCHEMA_AUTH_FAILED' || model.status === 'SCHEMA_FORBIDDEN')) status = 'AUTH_BLOCKED';
  else if (models.length > 0 && models.every((model) => model.status === 'SCHEMA_MALFORMED')) status = 'MODEL_SCHEMA_MALFORMED';
  return { status, authStatus, models, credentialsPrinted: false };
}

export async function runModelRoutePreflight({ token, accountId, fetchImpl = globalThis.fetch, modelIds = WP007AH_MODEL_IDS }) {
  if (!token || !accountId) return {
    status: 'REQUIRED_SECRET_MISSING',
    authStatus: 'REQUIRED_SECRET_MISSING',
    modelRouteStatus: 'NOT_REACHED',
    modelSchemas: [],
    modelCatalog: [],
    catalogStatus: 'NOT_REACHED',
    credentialsPrinted: false,
  };
  const schemas = await runModelSchemaPreflight({ token, accountId, fetchImpl, modelIds });
  const catalog = await runModelCatalogPreflight({ token, accountId, fetchImpl, modelIds });
  return {
    status: schemas.status,
    authStatus: schemas.authStatus,
    modelRouteStatus: schemas.status,
    modelSchemas: schemas.models,
    modelCatalog: catalog.models,
    catalogStatus: catalog.status,
    credentialsPrinted: false,
  };
}

export function evaluateFreeAllocation() {
  return {
    status: 'FREE_ALLOCATION_UNVERIFIED',
    verified: false,
    estimatedFrozenRunListPriceUsd: WP007AHR_ESTIMATED_FROZEN_RUN_LIST_PRICE_USD,
    requiredSafetyMargin: 'REQUIRED_USAGE_MUST_BE_AT_MOST_80_PERCENT_OF_VERIFIED_REMAINING_FREE_ALLOCATION',
    reason: 'NO_SUPPORTED_DIRECT_WORKERS_AI_FREE_ALLOCATION_BALANCE_API',
    officialSources: [...WP007AHR_OFFICIAL_COST_SOURCES],
  };
}

export async function runPreflight({
  mode = 'preflight',
  confirm = '',
  expectedFreezeSha256 = '',
  ref = process.env.GITHUB_REF,
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.CLOUDFLARE_API_TOKEN,
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  fetchImpl = globalThis.fetch,
  rootDir = REPOSITORY_ROOT,
} = {}) {
  const summary = {
    schemaVersion: 'lythaus-wp007ahr-preflight-v1',
    mode,
    passed: false,
    authStatus: 'NOT_REACHED',
    modelRouteStatus: 'NOT_REACHED',
    costStatus: 'NOT_REACHED',
    rightsStatus: 'NOT_REACHED',
    freeAllocationVerified: false,
    credentialsPrinted: false,
    generationCalls: 0,
    imagesGenerated: 0,
    detectorInferenceRun: false,
    modelTrainingRun: false,
    transformationsRun: false,
    mediaCommittedToGit: false,
    productionChanged: false,
  };
  try {
    assertTrustedMain({ ref, repository });
    assertExecutionConfirmation({ mode, confirm, expectedFreezeSha256 });
    const frozen = await assertFrozenArtifacts(rootDir);
    summary.rightsStatus = 'PASS';
    summary.freezeSha256 = frozen.freezeHash;
    summary.promptSelectionSha256 = frozen.promptSelectionHash;
  } catch (error) {
    summary.status = 'PROTOCOL_INVALID';
    summary.failure = String(error?.message ?? error);
    return summary;
  }

  if (!token || !accountId) {
    summary.authStatus = 'REQUIRED_SECRET_MISSING';
    summary.costStatus = 'NOT_REACHED_BECAUSE_AUTH_BLOCKED';
    summary.status = 'AUTH_BLOCKED';
    return summary;
  }
  const auth = await runModelRoutePreflight({ token, accountId, fetchImpl });
  summary.authStatus = auth.authStatus;
  summary.modelRouteStatus = auth.modelRouteStatus;
  summary.modelSchema = auth.modelSchemas;
  summary.modelCatalog = auth.modelCatalog;
  summary.catalogStatus = auth.catalogStatus;
  if (auth.authStatus !== 'PASS') {
    summary.costStatus = 'NOT_REACHED_BECAUSE_AUTH_BLOCKED';
    summary.status = 'AUTH_BLOCKED';
    return summary;
  }
  if (auth.modelRouteStatus !== 'PASS') {
    summary.costStatus = 'NOT_REACHED_BECAUSE_MODEL_ROUTE_BLOCKED';
    summary.status = auth.modelRouteStatus;
    return summary;
  }

  const cost = evaluateFreeAllocation();
  summary.costStatus = cost.status;
  summary.freeAllocationVerified = cost.verified;
  summary.estimatedFrozenRunListPriceUsd = cost.estimatedFrozenRunListPriceUsd;
  summary.costEvidence = cost.reason;
  summary.costOfficialSources = cost.officialSources;
  summary.status = 'COST_BLOCKED_OR_UNCERTAIN';
  return summary;
}

function parseArgs(argv) {
  const options = { mode: 'preflight', confirm: '', expectedFreezeSha256: '', output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') options.mode = argv[++index];
    else if (argument === '--confirm') options.confirm = argv[++index];
    else if (argument === '--expected-freeze-sha256') options.expectedFreezeSha256 = argv[++index];
    else if (argument === '--output') options.output = path.resolve(argv[++index]);
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

async function writeWorkflowOutputs(summary) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = [
    `passed=${summary.passed === true}`,
    `auth_status=${summary.authStatus}`,
    `model_route_status=${summary.modelRouteStatus ?? ''}`,
    `cost_status=${summary.costStatus}`,
    `free_allocation_verified=${summary.freeAllocationVerified === true}`,
    `rights_status=${summary.rightsStatus}`,
  ];
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = await runPreflight({ mode: options.mode, confirm: options.confirm, expectedFreezeSha256: options.expectedFreezeSha256 });
    if (options.output) await writeFile(options.output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeWorkflowOutputs(summary);
    console.log(JSON.stringify({
      status: summary.status ?? (summary.passed ? 'PASS' : 'BLOCKED'),
      authStatus: summary.authStatus,
      modelRouteStatus: summary.modelRouteStatus ?? null,
      costStatus: summary.costStatus,
      freeAllocationVerified: summary.freeAllocationVerified,
      rightsStatus: summary.rightsStatus,
      generationCalls: 0,
      imagesGenerated: 0,
      credentialsPrinted: false,
    }));
    if (summary.passed !== true) process.exitCode = 1;
  } catch (error) {
    console.error(`WP007AHR_STATUS=PROTOCOL_INVALID:${String(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}
