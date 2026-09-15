import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCloudflareGenerationFailure,
  requestCloudflare,
} from '../../../scripts/authenticity/wp007ah-cloudflare-holdouts.mjs';
import { runModelSchemaPreflight } from '../../../scripts/authenticity/wp007ahr-preflight.mjs';
import { WP007AH_MODEL_IDS } from '../src/wp007ah.ts';

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
