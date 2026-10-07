import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as database from '@lythaus/db';

const actorId = '01900000-0000-7000-8000-000000000099';
const targetId = '01900000-0000-7000-8000-000000000010';
const state = { reads: [], rateLimited: false, transactions: 0 };

mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    ...database,
    query: async (_binding, sql) => {
      state.reads.push(sql);
      if (sql.includes('identity.admin_memberships')) {
        return { rows: [{ user_id: actorId, role: 'administrator' }], rowCount: 1 };
      }
      if (sql.includes('system.rate_limit_windows')) {
        return state.rateLimited ? { rows: [], rowCount: 0 } : { rows: [{ request_count: 1 }], rowCount: 1 };
      }
      throw new Error('unexpected_request_body_query');
    },
    transaction: async () => {
      state.transactions += 1;
      throw new Error('unexpected_request_body_transaction');
    },
  },
});
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), {
  cache: true,
  namedExports: {
    requireActiveAdminMembership: row => ({ userId: row.user_id, role: row.role }),
    verifiedAccessSubject: async request => {
      if (request.headers.get('cf-access-jwt-assertion') !== 'synthetic-valid') throw new Error('access_required');
      return 'synthetic-admin';
    },
  },
});

const { default: worker } = await import('../src/index.ts');
const env = {
  ACCESS_SUBJECT_HMAC_KEY: 'synthetic-key',
  EXPECTED_HOSTNAMES: 'admin.lythaus.co',
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
  DB_ADMIN_FRESH: {},
  DB_PRIVACY_FRESH: {},
};

function request(path, body, headers = {}) {
  return new Request(`https://admin.lythaus.co${path}`, {
    method: 'POST', body,
    headers: {
      origin: 'https://admin.lythaus.co',
      'content-type': 'application/json',
      'cf-access-jwt-assertion': 'synthetic-valid',
      ...headers,
    },
  });
}

function reset() {
  state.reads = [];
  state.rateLimited = false;
  state.transactions = 0;
}

function assertNoDomainWork() {
  assert.equal(state.transactions, 0);
  assert.equal(state.reads.filter(sql => !sql.includes('identity.admin_memberships')
    && !sql.includes('system.rate_limit_windows')).length, 0);
}

test('admin mutation dispatch rejects non-object JSON with 400 before domain work', async () => {
  for (const path of [`/api/admin/users/${targetId}/tier`, '/api/admin/privacy/legal-holds']) {
    for (const body of ['null', '[]', 'true', '0', '"synthetic"']) {
      reset();
      const response = await worker.fetch(request(path, body), env);
      assert.equal(response.status, 400, `${path}: ${body}`);
      assert.equal((await response.json()).error, 'invalid_json');
      assert.match(response.headers.get('cache-control'), /private.*no-store/);
      assertNoDomainWork();
    }
  }
});

test('admin mutation dispatch rejects invalid UTF-8 and preserves valid object validation', async () => {
  reset();
  const body = new Uint8Array([
    ...new TextEncoder().encode('{"tier":"premium","reasonCode":"'), 0xff,
    ...new TextEncoder().encode('"}'),
  ]);
  const malformed = await worker.fetch(request(`/api/admin/users/${targetId}/tier`, body), env);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'invalid_json');
  assertNoDomainWork();

  reset();
  const valid = await worker.fetch(request(`/api/admin/users/${targetId}/tier`, '{}'), env);
  assert.equal(valid.status, 400);
  assert.equal((await valid.json()).error, 'invalid_subscription_tier');
  assertNoDomainWork();
});

test('admin request admission keeps Access and rate protections before body validation', async () => {
  const path = `/api/admin/users/${targetId}/tier`;
  reset();
  const denied = await worker.fetch(request(path, 'null', { 'cf-access-jwt-assertion': 'synthetic-invalid' }), env);
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).error, 'access_required');
  assertNoDomainWork();
  reset();
  state.rateLimited = true;
  const response = await worker.fetch(request(path, 'null'), env);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'rate_limit_exceeded');
  assertNoDomainWork();
});

test('actual workerd admin decoder rejects invalid shape and UTF-8 with its byte bound intact', { timeout: 60_000 }, async () => {
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022',
    stdin: { resolveDir: root, contents: `
      import { readBoundedJson } from './apps/lythaus-admin-api/src/request-body-policy.ts';
      export default { async fetch(request) {
        try { return Response.json(await readBoundedJson(request, 64)); }
        catch (error) {
          return Response.json({ error: error.message }, { status: error.message === 'request_too_large' ? 413 : 400 });
        }
      }};
    ` },
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'admin-body-decoder',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
  }] }));
  try {
    const encoder = new TextEncoder();
    for (const body of ['null', '[]', 'true', '{',
      new Uint8Array([...encoder.encode('{"reason":"'), 0xff, ...encoder.encode('"}')])]) {
      const response = await mf.dispatchFetch('https://admin-body.synthetic.invalid/', { method: 'POST', body });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_json' });
    }
    const oversized = await mf.dispatchFetch('https://admin-body.synthetic.invalid/', {
      method: 'POST', body: JSON.stringify({ reason: 'x'.repeat(64) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: 'request_too_large' });
    const valid = await mf.dispatchFetch('https://admin-body.synthetic.invalid/', {
      method: 'POST', body: JSON.stringify({ reason: 'Café 東京' }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { reason: 'Café 東京' });
  } finally { await mf.dispose(); }
});
