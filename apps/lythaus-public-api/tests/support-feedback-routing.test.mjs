import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';

const state = { runtimeCalls: 0, rateLimitCalls: 0 };
mock.module('@lythaus/db', { cache: true, namedExports: {
  ...database,
  query: async () => { state.rateLimitCalls += 1; return { rows: [{ request_count: 1 }], rowCount: 1 }; },
  createSupportFeedbackRuntime: async () => { state.runtimeCalls += 1; return null; },
  supportAuthentication: () => ({ member: async () => { throw new Error('not reached'); }, owner: async () => { throw new Error('not reached'); } }),
} });
const { default: worker } = await import('../src/index.ts');

const env = { EXPECTED_HOSTNAMES: 'api.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.co', DB_APP_FRESH: {} };
const request = () => new Request('https://api.lythaus.co/api/support/options', { headers: { authorization: 'Bearer synthetic-member' } });

test('member support routes are default-off and return private no-store 404', async () => {
  state.runtimeCalls = 0;
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'feature_disabled' });
  assert.equal(state.runtimeCalls, 0);
});

test('enabled member route invokes dispatcher and missing proposal schema fails closed', async () => {
  state.runtimeCalls = 0;
  const response = await worker.fetch(request(), { ...env, SUPPORT_FEEDBACK_ENABLED: 'true' });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'support_unavailable' });
  assert.equal(state.runtimeCalls, 1);
});
