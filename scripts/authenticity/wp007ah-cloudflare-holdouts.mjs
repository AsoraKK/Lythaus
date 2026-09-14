import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertWp007ahGeneratedRecord,
  assertWp007ahGenerationFreeze,
  assertWp007ahManifest,
  assertWp007ahNoPaidGeneration,
  assertWp007ahPixelAccess,
  buildWp007ahFingerprintInput,
  deriveWp007ahPromptSeed,
  fingerprintWp007ah,
  selectWp007ahPromptIds,
  wp007ahPromptSelectionHash,
  WP007AH_GENERATION_CONFIGURATION,
  WP007AH_GENERATION_ROUTE,
  WP007AH_MAX_PAID_COST_USD,
  WP007AH_MODEL_SPECS,
  WP007AH_PLAN_SCHEMA_VERSION,
  WP007AH_PROMPT_BANK_VERSION,
  WP007AH_RETRY_POLICY,
  WP007AH_SCHEMA_VERSION,
  WP007AH_TRAINING_ELIGIBILITY,
  WP007AH_WP007A_BENCHMARK_FINGERPRINT,
} from '../../packages/authenticity/src/wp007ah.ts';
import { stableArtifactHash } from '../../packages/authenticity/src/wp007a.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPT_BANK_PATH = path.join(REPOSITORY_ROOT, 'research', 'wp007a', 'prompt-bank.json');
const RIGHTS_PATH = path.join(REPOSITORY_ROOT, 'research', 'wp007ah', 'cloudflare-rights-revalidation.json');
const DEFAULT_CACHE = path.join(os.homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets', '90_RESEARCH_ONLY', 'wp007ah-cloudflare-cache');
const DEFAULT_MANIFEST_NAME = 'cloudflare-generation-manifest.json';
const CLOUDFLARE_API_ROOT = 'https://api.cloudflare.com/client/v4/accounts';
const FOUR_TILES_1024 = 4;
const PRICE = Object.freeze({
  '@cf/black-forest-labs/flux-1-schnell': { inputTile: 0.0000528, outputTile: 0, step: 0.0001056, steps: 4 },
  '@cf/black-forest-labs/flux-2-klein-4b': { inputTile: 0.000059, outputTile: 0.000287, step: 0, steps: 0 },
});

function parseArgs(argv) {
  const options = {
    dryRun: true,
    model: null,
    maxPaidCost: 0,
    outputCache: DEFAULT_CACHE,
    resume: false,
    verifyOnly: false,
    smokeOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--execute') options.dryRun = false;
    else if (argument === '--model') options.model = argv[++index];
    else if (argument === '--max-paid-cost' || argument === '--max-cost') options.maxPaidCost = Number(argv[++index]);
    else if (argument === '--output-cache') options.outputCache = path.resolve(argv[++index]);
    else if (argument === '--resume') options.resume = true;
    else if (argument === '--verify-only') options.verifyOnly = true;
    else if (argument === '--smoke-only') options.smokeOnly = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

function readJson(filePath) {
  return readFile(filePath, 'utf8').then((value) => JSON.parse(value));
}

function assertExternalCache(cachePath) {
  const absoluteCache = path.resolve(cachePath);
  const relative = path.relative(REPOSITORY_ROOT, absoluteCache);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('wp007ah_output_cache_inside_repository');
  return absoluteCache;
}

function relativeCacheId(cachePath, filePath) {
  const relative = path.relative(cachePath, filePath).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('wp007ah_cache_id_invalid');
  return `wp007ah-cloudflare/${relative}`;
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function modelPrice(modelId) {
  const price = PRICE[modelId];
  if (!price) throw new Error(`wp007ah_model_price_missing:${modelId}`);
  return (FOUR_TILES_1024 * (price.inputTile + price.outputTile)) + (price.steps * price.step);
}

export function estimateWp007ahListPrice(modelIds = WP007AH_MODEL_SPECS.map((model) => model.modelId), promptCount = 40) {
  return modelIds.reduce((total, modelId) => total + (modelPrice(modelId) * promptCount), 0);
}

function rightsRows(rightsArtifact) {
  if (!rightsArtifact || !Array.isArray(rightsArtifact.models)) throw new Error('wp007ah_rights_artifact_invalid');
  return WP007AH_MODEL_SPECS.map((spec) => {
    const row = rightsArtifact.models.find((candidate) => candidate.modelId === spec.modelId);
    if (!row) throw new Error(`wp007ah_rights_model_missing:${spec.modelId}`);
    if (row.provider !== 'BLACK_FOREST_LABS' || row.accessRoute !== 'CLOUDFLARE_WORKERS_AI') throw new Error(`wp007ah_rights_route_invalid:${spec.modelId}`);
    if (row.evaluationEligibility !== 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY') throw new Error(`wp007ah_rights_evaluation_blocked:${spec.modelId}`);
    if (row.trainingEligibility !== WP007AH_TRAINING_ELIGIBILITY) throw new Error(`wp007ah_rights_training_not_evaluation_only:${spec.modelId}`);
    return row;
  });
}

export async function buildWp007ahPlan() {
  const bank = await readJson(PROMPT_BANK_PATH);
  const promptIds = selectWp007ahPromptIds(bank);
  const rightsArtifact = await readJson(RIGHTS_PATH);
  const rights = rightsRows(rightsArtifact);
  const models = WP007AH_MODEL_SPECS.map((spec, index) => ({
    ...spec,
    rightsAuditId: rights[index].rightsAuditId ?? rightsArtifact.rightsAuditId ?? 'WP007AH_CLOUDFLARE_BFL_ROUTE_2026-09-14',
    trainingEligibility: WP007AH_TRAINING_ELIGIBILITY,
    evaluationEligibility: 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY',
  }));
  const generationFreeze = {
    schemaVersion: 'lythaus-wp007ah-generation-freeze-v1',
    baseSha: '6543ec6496a4d4b006fb40b6f5de50cfd9e98009',
    baseWp007aBenchmarkFingerprint: WP007AH_WP007A_BENCHMARK_FINGERPRINT,
    promptBankVersion: WP007AH_PROMPT_BANK_VERSION,
    promptIds,
    models,
    generationRoute: WP007AH_GENERATION_ROUTE,
    generationConfiguration: WP007AH_GENERATION_CONFIGURATION,
    seedDerivation: 'derivePromptSeed(promptBankVersion, generatorModelId, promptId, 1); FLUX.2 records NOT_SUPPORTED unless route documentation confirms seed input.',
    retryPolicy: WP007AH_RETRY_POLICY,
    maxIncrementalPaidCostUsd: WP007AH_MAX_PAID_COST_USD,
    outputCache: { insideRepository: false, mediaCommittedToGit: false, logicalCacheIdOnly: true },
    trainingEligibility: WP007AH_TRAINING_ELIGIBILITY,
    rightsRevalidation: 'PASS_FOR_BOUNDED_HOLDOUT_EVALUATION',
    noDetectorInference: true,
    noTraining: true,
    noTransformations: true,
    frozenBeforeGeneration: true,
  };
  assertWp007ahGenerationFreeze(generationFreeze);
  return {
    schemaVersion: WP007AH_PLAN_SCHEMA_VERSION,
    baseSha: '6543ec6496a4d4b006fb40b6f5de50cfd9e98009',
    baseWp007aBenchmarkFingerprint: WP007AH_WP007A_BENCHMARK_FINGERPRINT,
    promptBankVersion: WP007AH_PROMPT_BANK_VERSION,
    promptIds,
    promptSelectionSha256: wp007ahPromptSelectionHash(WP007AH_PROMPT_BANK_VERSION, promptIds),
    models,
    generationFreeze,
    generationFreezeSha256: stableArtifactHash(generationFreeze),
    requestedPerModel: promptIds.length,
    requestedTotal: promptIds.length * models.length,
    smokePairsPerModel: 2,
    estimatedListPriceUsd: estimateWp007ahListPrice(models.map((model) => model.modelId), promptIds.length),
    maxIncrementalPaidCostUsd: WP007AH_MAX_PAID_COST_USD,
    noIncrementalPaidCostEvidenceRequired: true,
    noDetectorInference: true,
    noTraining: true,
    noTransformations: true,
    noProductionChanges: true,
  };
}

function authStatus() {
  const tokenPresent = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  const accountPresent = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
  return {
    status: tokenPresent && accountPresent ? 'AVAILABLE' : 'AUTH_BLOCKED',
    tokenPresent,
    accountIdPresent: accountPresent,
    credentialsPrinted: false,
  };
}

function responseImage(payload) {
  if (typeof payload?.image === 'string') return payload.image;
  if (typeof payload?.result?.image === 'string') return payload.result.image;
  return null;
}

async function requestCloudflare(modelId, body) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const endpoint = `${CLOUDFLARE_API_ROOT}/${encodeURIComponent(accountId)}/ai/run/${encodeURIComponent(modelId)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`cloudflare_http_${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.startsWith('image/')) return new Uint8Array(await response.arrayBuffer());
    const payload = await response.json();
    const encoded = responseImage(payload);
    if (!encoded) throw new Error('cloudflare_image_missing');
    return new Uint8Array(Buffer.from(encoded, 'base64'));
  } catch (error) {
    if (String(error?.message ?? '').startsWith('cloudflare_http_')) throw error;
    const retryable = error instanceof TypeError || /fetch|network|socket|timeout/iu.test(String(error?.message ?? error));
    const wrapped = new Error(retryable ? 'cloudflare_transport_failure' : String(error?.message ?? error));
    wrapped.retryable = retryable;
    throw wrapped;
  }
}

async function decodeImage(bytes) {
  let sharpModule;
  try {
    sharpModule = await import('sharp');
  } catch {
    throw new Error('wp007ah_image_validation_dependency_missing');
  }
  const sharp = sharpModule.default ?? sharpModule;
  const metadata = await sharp(bytes).metadata();
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width < 1 || metadata.height < 1) throw new Error('wp007ah_image_dimensions_invalid');
  return { width: metadata.width, height: metadata.height, format: String(metadata.format ?? 'UNKNOWN').toUpperCase() };
}

async function verifyCachedRecord(cachePath, record) {
  const cacheFile = path.resolve(cachePath, record.file.cacheId.replace(/^wp007ah-cloudflare\//u, ''));
  const bytes = new Uint8Array(await readFile(cacheFile));
  if (hashBytes(bytes) !== record.file.sha256) throw new Error(`wp007ah_cached_hash_mismatch:${record.sampleId}`);
  return true;
}

function requestBody(model, prompt) {
  const seed = model.seedSupport === 'DOCUMENTED_BY_CURRENT_MODEL_PAGE'
    ? deriveWp007ahPromptSeed(model.modelId, prompt.promptId)
    : null;
  const body = { prompt: prompt.text };
  if (model.modelId === '@cf/black-forest-labs/flux-1-schnell') {
    body.steps = WP007AH_GENERATION_CONFIGURATION.flux1.steps;
    body.seed = seed;
  }
  return { body, recordedSeed: seed === null ? 'NOT_SUPPORTED' : seed };
}

function recordFor({ model, prompt, seed, file, rightsAuditId, cacheId }) {
  const familyToken = model.modelFamily.replaceAll(/[^A-Za-z0-9_]+/gu, '_');
  const promptToken = prompt.promptId;
  return {
    sampleId: `WP007AH_${familyToken}_${promptToken}`,
    sourceFamilyId: `WP007AH-${familyToken}-${promptToken}`,
    provider: 'CLOUDFLARE_WORKERS_AI',
    generatorModelId: model.modelId,
    generatorFamily: model.modelFamily,
    generatorVersion: null,
    generationRoute: WP007AH_GENERATION_ROUTE,
    promptBankVersion: WP007AH_PROMPT_BANK_VERSION,
    promptId: prompt.promptId,
    seed,
    generationParameters: model.requestParameters,
    generatedAt: new Date().toISOString(),
    file: { ...file, cacheId },
    truthAxes: {
      physicalCameraAcquisition: 'FALSE',
      syntheticDepictedContent: 'TRUE',
      localManipulation: 'FALSE',
      digitalCapture: 'TRUE',
      screenRecapture: 'FALSE',
    },
    rightsAuditId,
    trainingEligibility: WP007AH_TRAINING_ELIGIBILITY,
    evaluationEligibility: 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY',
    benchmarkRole: model.benchmarkRole,
    limitations: ['Provider output is retained only as a private/local research holdout.', 'Generator metadata is provenance, not detector input.', 'Output dimensions and format are provider-returned unless documented request parameters apply.'],
  };
}

async function loadLocalManifest(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return {
      schemaVersion: 'lythaus-wp007ah-cloudflare-generation-manifest-v1',
      baseWp007aBenchmarkFingerprint: WP007AH_WP007A_BENCHMARK_FINGERPRINT,
      promptBankVersion: WP007AH_PROMPT_BANK_VERSION,
      records: [],
      failures: [],
      generationCalls: 0,
      valid: 0,
      failed: 0,
      detectorInferenceRun: false,
      modelTrainingRun: false,
      transformationsRun: false,
      mediaCommittedToGit: false,
    };
  }
}

async function persistManifest(manifestPath, manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function executeGeneration(plan, options) {
  const outputCache = assertExternalCache(options.outputCache);
  const manifestPath = path.join(outputCache, DEFAULT_MANIFEST_NAME);
  const manifest = await loadLocalManifest(manifestPath);
  const promptBank = await readJson(PROMPT_BANK_PATH);
  const promptMap = new Map(promptBank.prompts.map((prompt) => [prompt.promptId, prompt]));
  const selectedModels = options.model ? plan.models.filter((model) => model.modelId === options.model) : plan.models;
  if (selectedModels.length !== (options.model ? 1 : 2)) throw new Error(`wp007ah_model_selection_invalid:${options.model}`);
  const selectedPairs = selectedModels.flatMap((model) => plan.promptIds.map((promptId) => ({ model, prompt: promptMap.get(promptId) })));
  const smokePairs = selectedPairs.filter((pair) => plan.promptIds.slice(0, 2).includes(pair.prompt.promptId));
  const pairs = options.smokeOnly ? smokePairs : selectedPairs;
  for (const pair of pairs) {
    const { model, prompt } = pair;
    const request = requestBody(model, prompt);
    const existing = manifest.records.find((record) => record.generatorModelId === model.modelId && record.promptId === prompt.promptId && record.seed === request.recordedSeed && stableArtifactHash(record.generationParameters) === stableArtifactHash(model.requestParameters));
    if (existing) {
      await verifyCachedRecord(outputCache, existing);
      continue;
    }
    assertWp007ahPixelAccess({ modelId: model.modelId, purpose: 'MATERIALIZATION_INTEGRITY_VALIDATION' });
    let attempts = 0;
    let bytes;
    let lastError;
    while (attempts <= WP007AH_RETRY_POLICY.maxIdenticalTransportRetries) {
      attempts += 1;
      try {
        bytes = await requestCloudflare(model.modelId, request.body);
        break;
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempts > WP007AH_RETRY_POLICY.maxIdenticalTransportRetries) break;
      }
    }
    manifest.generationCalls += attempts;
    if (!bytes) {
      manifest.failures.push({ generatorModelId: model.modelId, promptId: prompt.promptId, failureType: String(lastError?.message ?? 'provider_failure'), providerOutputReceived: false, retryAttempts: attempts, replacementPrompt: false });
      continue;
    }
    try {
      const metadata = await decodeImage(bytes);
      const sha256 = hashBytes(bytes);
      const sampleId = `WP007AH_${model.modelFamily}_${prompt.promptId}`;
      const extension = metadata.format.toLowerCase() === 'jpeg' ? 'jpg' : metadata.format.toLowerCase();
      const cacheFile = path.join(outputCache, 'wp007ah-cloudflare', model.modelFamily, `${sampleId}.${extension}`);
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, bytes);
      const record = recordFor({ model, prompt, seed: request.recordedSeed, rightsAuditId: model.rightsAuditId, cacheId: relativeCacheId(outputCache, cacheFile), file: { sha256, width: metadata.width, height: metadata.height, format: metadata.format, byteSize: bytes.byteLength } });
      assertWp007ahGeneratedRecord(record);
      manifest.records.push(record);
    } catch (error) {
      manifest.failures.push({ generatorModelId: model.modelId, promptId: prompt.promptId, failureType: String(error?.message ?? error), providerOutputReceived: true, retryAttempts: attempts, replacementPrompt: false });
    }
    manifest.valid = manifest.records.length;
    manifest.failed = manifest.failures.length;
    await persistManifest(manifestPath, manifest);
  }
  manifest.valid = manifest.records.length;
  manifest.failed = manifest.failures.length;
  manifest.status = options.smokeOnly ? 'SMOKE_COMPLETE' : (manifest.valid === plan.requestedTotal ? 'MATERIALIZED' : 'PARTIAL');
  await persistManifest(manifestPath, manifest);
  return { status: manifest.status, manifestPathId: 'wp007ah-cloudflare/cloudflare-generation-manifest.json', manifest };
}

export async function runWp007ah(options = {}) {
  const merged = { ...parseArgs([]), ...options };
  if (merged.maxPaidCost !== WP007AH_MAX_PAID_COST_USD) throw new Error('wp007ah_paid_cost_cap_must_be_zero');
  const plan = await buildWp007ahPlan();
  if (merged.model && !plan.models.some((model) => model.modelId === merged.model)) throw new Error(`wp007ah_model_not_authorized:${merged.model}`);
  const auth = authStatus();
  if (merged.verifyOnly) {
    const manifestPath = path.join(assertExternalCache(merged.outputCache), DEFAULT_MANIFEST_NAME);
    const manifest = await loadLocalManifest(manifestPath);
    assertWp007ahManifest(manifest);
    for (const record of manifest.records) await verifyCachedRecord(assertExternalCache(merged.outputCache), record);
    return { status: 'VERIFY_ONLY', auth, plan, manifest };
  }
  if (merged.dryRun) return { status: 'DRY_RUN', auth, plan, generatedCount: 0 };
  if (auth.status !== 'AVAILABLE') throw new Error('WP007AH_STATUS=AUTH_BLOCKED');
  if (rightsRows(await readJson(RIGHTS_PATH)).length !== 2) throw new Error('WP007AH_STATUS=RIGHTS_BLOCKED');
  const freeAllocationConfirmed = process.env.CLOUDFLARE_WP007AH_FREE_ALLOCATION_CONFIRMED === '1';
  assertWp007ahNoPaidGeneration({ estimatedCostUsd: merged.smokeOnly ? estimateWp007ahListPrice(plan.models.map((model) => model.modelId), 2) : plan.estimatedListPriceUsd, freeAllocationConfirmed });
  return executeGeneration(plan, merged);
}

export function wp007ahFingerprintForManifest({ plan, manifest }) {
  const canonicalInput = buildWp007ahFingerprintInput({
    promptIds: plan.promptIds,
    models: plan.models,
    records: manifest.records,
    failures: manifest.failures,
    roles: Object.fromEntries(plan.models.map((model) => [model.modelId, model.benchmarkRole])),
    rights: Object.fromEntries(plan.models.map((model) => [model.modelId, { trainingEligibility: model.trainingEligibility, evaluationEligibility: model.evaluationEligibility }])),
    generationStatus: manifest.status ?? 'NOT_RUN',
  });
  return { fingerprintSha256: fingerprintWp007ah(canonicalInput), canonicalInput };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = await runWp007ah(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ status: result.status, authStatus: result.auth?.status, estimatedListPriceUsd: result.plan?.estimatedListPriceUsd ?? null, generatedCount: result.generatedCount ?? result.manifest?.valid ?? 0, credentialsPrinted: false }));
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exitCode = 1;
  }
}
