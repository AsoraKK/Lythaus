import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyCloudflareGenerationFailure,
  generationRecordMatchesRequest,
  requestBody,
  requestBodyForWp007ahr4Flux1,
  requestCloudflare,
  runWp007ah,
  wp007ahr4ExecutionModelIds,
} from '../../../scripts/authenticity/wp007ah-cloudflare-holdouts.mjs';
import { runModelSchemaPreflight } from '../../../scripts/authenticity/wp007ahr-preflight.mjs';
import { runWp007ahr2Preflight } from '../../../scripts/authenticity/wp007ahr2-preflight.mjs';
import { buildTransferManifest } from '../../../scripts/authenticity/wp007ahr-build-transfer-manifest.mjs';
import { stableArtifactHash } from '../src/wp007a.ts';
import { WP007AH_MODEL_IDS, WP007AH_MODEL_SPECS } from '../src/wp007ah.ts';
import {
  WP007AHR4_EXECUTION_CONFIRMATION,
  WP007AHR4_EXECUTION_MODE,
  WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
  WP007AHR4_FLUX1_MODEL_ID,
  WP007AHR4_FLUX1_SUBMITTED_SEED_STATE,
  WP007AHR4_HISTORICAL_FREEZE_SHA256,
  wp007ahr4MaterializationStatus,
} from '../src/wp007ahr4.ts';
import {
  WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
  WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
} from '../src/wp007ahr2.ts';
import { WP007AHR_REPOSITORY, WP007AHR_TRUSTED_REF } from '../../../scripts/authenticity/wp007ahr-preflight.mjs';

const token = 'cloudflare-secret-fixture';
const accountId = 'account-fixture';

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function schemaResponse() {
  return response(200, {
    success: true,
    result: {
      input: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          steps: { type: 'integer', minimum: 1, maximum: 8 },
          seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
          width: { type: 'integer', minimum: 256, maximum: 2048 },
          height: { type: 'integer', minimum: 256, maximum: 2048 },
        },
      },
      output: { type: 'object', additionalProperties: true },
    },
  });
}

test('schema preflight records safe FLUX.1 input capabilities and constraints', async () => {
  const result = await runModelSchemaPreflight({
    token,
    accountId,
    fetchImpl: async () => schemaResponse(),
  });
  const flux1 = result.models.find((model) => model.modelId === WP007AH_MODEL_IDS[0]);
  assert.equal(flux1?.status, 'SCHEMA_AVAILABLE');
  assert.deepEqual(flux1?.schemaCapabilities?.prompt, { present: true, type: 'STRING', types: ['STRING'], required: true, minimum: null, maximum: null, exclusiveMinimum: null, exclusiveMaximum: null });
  assert.deepEqual(flux1?.schemaCapabilities?.steps, { present: true, type: 'INTEGER', types: ['INTEGER'], required: false, minimum: 1, maximum: 8, exclusiveMinimum: null, exclusiveMaximum: null });
  assert.deepEqual(flux1?.schemaCapabilities?.seed, { present: true, type: 'INTEGER', types: ['INTEGER'], required: false, minimum: 0, maximum: 4294967295, exclusiveMinimum: null, exclusiveMaximum: null });
  assert.deepEqual(flux1?.schemaCapabilities?.width, { present: true, type: 'INTEGER', types: ['INTEGER'], required: false, minimum: 256, maximum: 2048, exclusiveMinimum: null, exclusiveMaximum: null });
  assert.deepEqual(flux1?.schemaCapabilities?.height, { present: true, type: 'INTEGER', types: ['INTEGER'], required: false, minimum: 256, maximum: 2048, exclusiveMinimum: null, exclusiveMaximum: null });
});

test('generation failure classification distinguishes contract and provider categories', () => {
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 400, providerErrorCode: 1001, providerErrorMessage: 'unknown property seed' }), 'REQUEST_PARAMETER_UNSUPPORTED');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 400, providerErrorCode: 1002, providerErrorMessage: 'seed must be at most 2147483647' }), 'REQUEST_PARAMETER_RANGE_INVALID');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 401 }), 'AUTH_FAILURE');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 404 }), 'MODEL_NOT_FOUND');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 429, providerErrorMessage: 'daily quota exhausted' }), 'DAILY_QUOTA');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 429 }), 'RATE_LIMIT');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 500 }), 'PROVIDER_INTERNAL_ERROR');
  assert.equal(classifyCloudflareGenerationFailure({ transport: true }), 'TRANSPORT_ERROR');
  assert.equal(classifyCloudflareGenerationFailure({ httpStatus: 400, providerErrorCode: 9999, providerErrorMessage: 'opaque rejection' }), 'UNKNOWN_PROVIDER_400');
});

test('FLUX.1 non-2xx diagnostics redact authorization and prompt data', async () => {
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousFetch = globalThis.fetch;
  const promptText = 'unique diagnostic prompt text';
  process.env.CLOUDFLARE_API_TOKEN = token;
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  globalThis.fetch = async () => response(400, {
    success: false,
    errors: [{ code: 1001, message: `unknown property seed for ${promptText} Bearer ${token}` }],
  });
  try {
    await assert.rejects(
      () => requestCloudflare('@cf/black-forest-labs/flux-1-schnell', { prompt: promptText, steps: 4, seed: 7 }),
      (error) => {
        assert.equal(error.providerHttpStatus, 400);
        assert.equal(error.providerErrorCode, 1001);
        assert.equal(error.failureCategory, 'REQUEST_PARAMETER_UNSUPPORTED');
        assert.equal(error.requestContentTypeClassification, 'APPLICATION_JSON');
        assert.match(error.providerErrorMessage, /\[REDACTED\]/u);
        assert.equal(error.providerErrorMessage.includes(promptText), false);
        assert.equal(error.providerErrorMessage.includes(token), false);
        return true;
      },
    );
  } finally {
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    globalThis.fetch = previousFetch;
  }
});

test('HR4 amended FLUX.1 request omits seed without changing historical requestBody', () => {
  const model = WP007AH_MODEL_SPECS.find((candidate) => candidate.modelId === WP007AH_MODEL_IDS[0]);
  const prompt = { promptId: 'PROMPT_001', text: 'frozen prompt text fixture' };
  const historical = requestBody(model, prompt);
  const amended = requestBodyForWp007ahr4Flux1(model, prompt);
  assert.equal(typeof historical.body.seed, 'number');
  assert.equal(Object.hasOwn(amended.body, 'seed'), false);
  assert.equal(amended.recordedSeed, 'NOT_SENT_ROUTE_UNSUPPORTED');
  assert.equal(amended.originalDerivedSeed, historical.recordedSeed);
  assert.deepEqual(amended.body, { prompt: prompt.text, steps: 4 });
});

test('HR4 contract amendment artifact is self-hashed and evidence-bound', async () => {
  const artifact = JSON.parse(await readFile(path.resolve('research/wp007ahr4/flux1-generation-contract-amendment.json'), 'utf8'));
  const { amendmentSha256, ...withoutHash } = artifact;
  assert.equal(stableArtifactHash(withoutHash), amendmentSha256);
  assert.equal(artifact.parentHistoricalFreezeSha256, '87982112412059bd1615bd2d36ee9cf8ad72828b4042cb93839d725b6b533514');
  assert.equal(artifact.providerEvidence.providerHttpStatus, 400);
  assert.equal(artifact.providerEvidence.providerErrorCode, 5006);
  assert.equal(artifact.rootCause, 'REST_ROUTE_SEED_UNSUPPORTED');
  assert.equal(artifact.exactAmendedRequestContract.seedField, 'OMITTED');
  assert.equal(artifact.noDetectorEvidenceUsed, true);
});

test('HR4 selector is explicit, fail-closed, and FLUX.1-only', async () => {
  assert.deepEqual(wp007ahr4ExecutionModelIds(WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256), [WP007AHR4_FLUX1_MODEL_ID]);
  assert.deepEqual(wp007ahr4ExecutionModelIds(''), [...WP007AH_MODEL_IDS]);
  const dryRun = await runWp007ah({
    dryRun: true,
    model: WP007AHR4_FLUX1_MODEL_ID,
    maxPaidCost: WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
    executionAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
    wp007ahr4Flux1ContractAmendmentSha256: WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
  });
  assert.equal(dryRun.status, 'DRY_RUN');
  await assert.rejects(() => runWp007ah({
    dryRun: true,
    model: WP007AH_MODEL_IDS[0],
    maxPaidCost: WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
    executionAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
    wp007ahr4Flux1ContractAmendmentSha256: 'wrong',
  }), /contract_amendment_hash_invalid/u);
  await assert.rejects(() => runWp007ah({
    dryRun: true,
    model: WP007AH_MODEL_IDS[1],
    maxPaidCost: WP007AHR2_MAX_INCREMENTAL_PAID_COST_USD,
    executionAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
    wp007ahr4Flux1ContractAmendmentSha256: WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
  }), /flux1_model_invalid/u);
});

test('HR4 preflight verifies the amendment and queries only FLUX.1 read-only routes', async () => {
  const calls = [];
  const summary = await runWp007ahr2Preflight({
    mode: WP007AHR4_EXECUTION_MODE,
    confirm: WP007AHR4_EXECUTION_CONFIRMATION,
    expectedFreezeSha256: WP007AHR4_HISTORICAL_FREEZE_SHA256,
    expectedAuthorizationSha256: WP007AHR2_EXECUTION_AUTHORIZATION_SHA256,
    flux1ContractAmendmentSha256: WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
    ref: WP007AHR_TRUSTED_REF,
    repository: WP007AHR_REPOSITORY,
    token,
    accountId,
    rootDir: path.resolve(import.meta.dirname, '../../..'),
    fetchImpl: async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/models/schema')) return response(200, { success: true, result: { input: { type: 'object', additionalProperties: true }, output: { type: 'object', additionalProperties: true } } });
      return response(200, { success: true, result: [{ id: 'internal-flux1', name: WP007AHR4_FLUX1_MODEL_ID }] });
    },
  });
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.contractAmendmentVerified, true);
  assert.equal(summary.projectedMaxCostUsd, 0.06);
  assert.equal(summary.flux2ProviderCalls, 0);
  assert.equal(summary.modelSchema.length, 1);
  assert.ok(calls.every((url) => url.includes('flux-1-schnell')));
  assert.equal(calls.some((url) => url.includes('flux-2-klein-4b')), false);
});

test('HR4 resume matching requires the amended recorded seed state and identity', () => {
  const model = WP007AH_MODEL_SPECS[0];
  const prompt = { promptId: 'PROMPT_001', text: 'frozen prompt text fixture' };
  const request = requestBodyForWp007ahr4Flux1(model, prompt);
  const record = {
    generatorModelId: model.modelId,
    promptId: prompt.promptId,
    seed: request.recordedSeed,
    generationParameters: model.requestParameters,
    originalDerivedSeed: request.originalDerivedSeed,
    submittedSeedState: WP007AHR4_FLUX1_SUBMITTED_SEED_STATE,
    contractAmendmentSha256: WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
  };
  assert.equal(generationRecordMatchesRequest({ record, model, prompt, request, hr4Flux1Mode: true }), true);
  assert.equal(generationRecordMatchesRequest({ record: { ...record, seed: request.originalDerivedSeed }, model, prompt, request, hr4Flux1Mode: true }), false);
  assert.equal(generationRecordMatchesRequest({ record: { ...record, contractAmendmentSha256: 'wrong' }, model, prompt, request, hr4Flux1Mode: true }), false);
});

test('HR4 status and cost are FLUX.1-only and do not imply FLUX.2 regeneration', () => {
  assert.equal(wp007ahr4MaterializationStatus({ smokeOnly: false, valid: 40, requested: 40 }), 'HR4_FLUX1_MATERIALIZED');
  assert.equal(wp007ahr4MaterializationStatus({ smokeOnly: false, valid: 36, requested: 40 }), 'HR4_FLUX1_MATERIALIZED');
  assert.equal(wp007ahr4MaterializationStatus({ smokeOnly: false, valid: 35, requested: 40 }), 'HR4_FLUX1_PARTIAL');
  assert.equal(wp007ahr4MaterializationStatus({ smokeOnly: true, valid: 2, requested: 40 }), 'HR4_FLUX1_SMOKE_COMPLETE');
  assert.match(workflowText(), /hr4_flux1_execute/u);
  assert.match(workflowText(), /FLUX2_PROVIDER_CALLS =/u);
  assert.match(workflowText(), /2294cfeb9220be2becf08e70abb848267dcb5db2f213411e54c8883bc753431a/u);
  assert.doesNotMatch(workflowText(), /--model\s+['"]?@cf\/black-forest-labs\/flux-2-klein-4b/u);
});

test('HR4 transfer manifest preserves amended provenance and zero FLUX.2 calls', async () => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'wp007ahr4-transfer-'));
  try {
    await writeFile(path.join(cache, 'cloudflare-generation-manifest.json'), `${JSON.stringify({
      schemaVersion: 'lythaus-wp007ah-cloudflare-generation-manifest-v1',
      generationStatus: 'HR4_FLUX1_MATERIALIZED',
      executionMode: 'HR4_FLUX1_AMENDED_CONTRACT',
      contractAmendmentSha256: WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256,
      requestContract: { prompt: 'UNCHANGED_FROZEN_PROMPT', steps: 4, seedField: 'OMITTED', submittedSeedState: WP007AHR4_FLUX1_SUBMITTED_SEED_STATE },
      flux2ProviderCalls: 0,
      requested: { FLUX_1_SCHNELL: 40, total: 40 },
      records: [],
      failures: [],
      detectorInferenceRun: false,
      modelTrainingRun: false,
      transformationsRun: false,
      mediaCommittedToGit: false,
    }, null, 2)}\n`, 'utf8');
    const result = await buildTransferManifest({ cachePath: cache });
    assert.equal(result.transferManifest.executionMode, 'HR4_FLUX1_AMENDED_CONTRACT');
    assert.equal(result.transferManifest.contractAmendmentSha256, WP007AHR4_FLUX1_CONTRACT_AMENDMENT_SHA256);
    assert.equal(result.transferManifest.flux2ProviderCalls, 0);
    assert.deepEqual(result.transferManifest.records, []);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});

function workflowText() {
  return readFileSync(path.resolve(import.meta.dirname, '../../..', '.github/workflows/wp007ah-cloudflare-holdout.yml'), 'utf8');
}
