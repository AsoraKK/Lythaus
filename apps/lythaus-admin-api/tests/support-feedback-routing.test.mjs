import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';

const OWNER_ID = '01900000-0000-7000-8000-000000000099';
const state = { runtimeCalls: 0 };
mock.module('@lythaus/db', { cache: true, namedExports: {
  ...database,
  query: async (_binding, sql) => sql.includes('identity.admin_memberships')
    ? { rows: [{ user_id: OWNER_ID, role: 'owner' }], rowCount: 1 }
    : { rows: [{ request_count: 1 }], rowCount: 1 },
  createSupportFeedbackRuntime: async () => { state.runtimeCalls += 1; return null; },
  supportAuthentication: () => ({ member: async () => { throw new Error('not reached'); }, owner: async () => { throw new Error('not reached'); } }),
} });
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), { cache: true, namedExports: {
  verifiedAccessSubject: async (request) => {
    if (request.headers.get('cf-access-jwt-assertion') !== 'synthetic-valid') throw new Error('access_required');
    return 'synthetic-owner';
  },
  requireActiveAdminMembership: (row) => ({ userId: row.user_id, role: row.role }),
} });
const { default: worker } = await import('../src/index.ts');

const env = { EXPECTED_HOSTNAMES: 'admin.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
  ACCESS_SUBJECT_HMAC_KEY: 'synthetic-owner-subject-key', DB_ADMIN_FRESH: {} };
const request = () => new Request('https://admin.lythaus.co/api/admin/support/options', {
  headers: { origin: 'https://admin.lythaus.co', 'cf-access-jwt-assertion': 'synthetic-valid' },
});

test('owner support routes are default-off and return private no-store 404', async () => {
  state.runtimeCalls = 0;
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'feature_disabled' });
  assert.equal(state.runtimeCalls, 0);
});

test('enabled owner route invokes dispatcher and missing proposal schema fails closed', async () => {
  state.runtimeCalls = 0;
  const response = await worker.fetch(request(), { ...env, SUPPORT_FEEDBACK_ENABLED: 'true' });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'support_unavailable' });
  assert.equal(state.runtimeCalls, 1);
});
