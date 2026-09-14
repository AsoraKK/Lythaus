import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  modelCallableName,
  modelCatalogUrl,
  modelSchemaUrl,
  runModelCatalogPreflight,
  runModelRoutePreflight,
  runModelSchemaPreflight,
} from '../../../scripts/authenticity/wp007ahr-preflight.mjs';
import {
  buildModelRunRequest,
  modelRunUrl,
  requestBody,
} from '../../../scripts/authenticity/wp007ah-cloudflare-holdouts.mjs';
import { WP007AH_MODEL_IDS, WP007AH_MODEL_SPECS } from '../src/wp007ah.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'wp007ah-cloudflare-holdout.yml');
const workflow = await readFile(workflowPath, 'utf8');
const accountId = 'account-for-test';
const token = 'test-token-not-persisted';

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
      input: { type: 'object', additionalProperties: true },
      output: { type: 'object', additionalProperties: true },
    },
  });
}

function modelForSearch(url) {
  const parsed = new URL(url);
  const value = parsed.searchParams.get('model') ?? parsed.searchParams.get('search');
  return WP007AH_MODEL_IDS.find((model) => model.endsWith(String(value))) ?? value;
}

test('catalog callable identity uses name, never an opaque internal id', () => {
  const modelId = WP007AH_MODEL_IDS[0];
  assert.equal(modelCallableName({ id: 'internal-cloudflare-catalog-uuid', name: modelId }), modelId);
  assert.equal(modelCallableName({ id: 'internal-cloudflare-catalog-uuid' }), null);
  assert.equal(new URL(modelCatalogUrl(accountId, modelId)).searchParams.get('search'), 'flux-1-schnell');
});

test('schema endpoints are exact, read-only, and authoritative over catalog diagnostics', async () => {
  const calls = [];
  const result = await runModelRoutePreflight({
    token,
    accountId,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/models/schema')) return schemaResponse();
      return response(200, { success: true, result: [] });
    },
  });
  assert.equal(result.authStatus, 'PASS');
  assert.equal(result.modelRouteStatus, 'PASS');
  assert.equal(result.catalogStatus, 'CATALOG_MISMATCH');
  assert.equal(result.modelSchemas.length, 2);
  assert.ok(calls.every(({ init }) => init.method === 'GET'));
  assert.equal(calls.length, 4);
  for (const modelId of WP007AH_MODEL_IDS) {
    const url = modelSchemaUrl(accountId, modelId);
    const schemaCall = calls.find((call) => call.url === url);
    assert.ok(schemaCall);
    assert.equal(schemaCall.init.headers.Authorization, `Bearer ${token}`);
    assert.equal(schemaCall.init.headers.Accept, 'application/json');
  }
});

test('realistic UUID-plus-name catalog entries match without blocking schema success', async () => {
  const result = await runModelRoutePreflight({
    token,
    accountId,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/models/schema')) return schemaResponse();
      const modelId = modelForSearch(url);
      return response(200, { success: true, result: [{ id: `internal-${modelId}`, name: modelId }] });
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.modelRouteStatus, 'PASS');
  assert.equal(result.catalogStatus, 'CATALOG_MATCH');
  assert.deepEqual(result.modelCatalog.map((model) => model.status), ['CATALOG_MATCH', 'CATALOG_MATCH']);
  assert.deepEqual(result.modelCatalog.map((model) => model.callableName), [...WP007AH_MODEL_IDS]);
});

test('schema status separates partial model availability from authentication failure', async () => {
  const partial = await runModelSchemaPreflight({
    token,
    accountId,
    fetchImpl: async (url) => new URL(url).searchParams.get('model') === WP007AH_MODEL_IDS[0]
      ? schemaResponse()
      : response(404, { success: false, errors: [{ code: 1001, message: 'model not found' }] }),
  });
  assert.equal(partial.status, 'MODEL_ROUTE_PARTIAL');
  assert.equal(partial.authStatus, 'PASS');
  assert.deepEqual(partial.models.map((model) => model.status), ['SCHEMA_AVAILABLE', 'SCHEMA_NOT_FOUND']);
  const forbidden = await runModelSchemaPreflight({
    token,
    accountId,
    fetchImpl: async () => response(403, { success: false, errors: [{ code: 10000, message: 'forbidden' }] }),
  });
  assert.equal(forbidden.status, 'AUTH_BLOCKED');
  assert.equal(forbidden.authStatus, 'AUTH_FAILED');
  assert.ok(forbidden.models.every((model) => model.status === 'SCHEMA_FORBIDDEN'));
});

test('catalog failures are diagnostic only', async () => {
  const result = await runModelCatalogPreflight({
    token,
    accountId,
    fetchImpl: async () => response(500, { success: false, errors: [{ code: 2000, message: 'temporary catalog failure' }] }),
  });
  assert.equal(result.status, 'CATALOG_UNAVAILABLE');
  assert.ok(result.models.every((model) => model.status === 'CATALOG_UNAVAILABLE'));
});

test('model run URL preserves callable route segments and bodies follow model contracts', async () => {
  const prompt = { promptId: 'PROMPT_001', text: 'a benign test scene' };
  const flux1 = WP007AH_MODEL_SPECS[0];
  const flux2 = WP007AH_MODEL_SPECS[1];
  const flux1Body = requestBody(flux1, prompt);
  const flux2Body = requestBody(flux2, prompt);
  assert.match(
    new URL(modelRunUrl(accountId, flux1.modelId)).pathname,
    /\/ai\/run\/(?:%40cf|@cf)\/black-forest-labs\/flux-1-schnell$/u,
  );
  assert.match(
    new URL(modelRunUrl(accountId, flux2.modelId)).pathname,
    /\/ai\/run\/(?:%40cf|@cf)\/black-forest-labs\/flux-2-klein-4b$/u,
  );
  const flux1Request = buildModelRunRequest({ accountId, token, modelId: flux1.modelId, body: flux1Body.body });
  assert.equal(flux1Request.init.headers['content-type'], 'application/json');
  const parsedJson = JSON.parse(flux1Request.init.body);
  assert.equal(parsedJson.prompt, prompt.text);
  assert.equal(parsedJson.steps, 4);
  assert.equal(parsedJson.seed, flux1Body.recordedSeed);
  const flux2Request = buildModelRunRequest({ accountId, token, modelId: flux2.modelId, body: flux2Body.body });
  assert.equal(flux2Request.init.body instanceof FormData, true);
  assert.equal(await flux2Request.init.body.get('prompt'), prompt.text);
  assert.equal(flux2Body.recordedSeed, 'NOT_SUPPORTED');
  assert.equal(Object.prototype.hasOwnProperty.call(flux2Request.init.headers, 'content-type'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(flux2Request.init.headers, 'Content-Type'), false);
});

test('workflow gates execute on schema route status without weakening security', () => {
  const document = YAML.parse(workflow);
  assert.deepEqual(Object.keys(document.on), ['workflow_dispatch']);
  assert.equal(document.permissions.contents, 'read');
  assert.match(workflow, /model_route_status:/u);
  assert.match(workflow, /needs\.preflight\.outputs\.model_route_status == 'PASS'/u);
  assert.match(workflow, /scripts\/authenticity\/wp007ahr2-preflight\.mjs/u);
  assert.doesNotMatch(workflow, /contents:\s*write|git\s+push|pull_request_target|schedule|repository_dispatch|workflow_run/iu);
});
