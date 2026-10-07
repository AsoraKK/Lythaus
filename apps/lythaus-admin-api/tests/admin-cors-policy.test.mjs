import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  adminCorsPreflight,
  assertAdminMutationRequest,
  allowedAdminOrigin,
  withAdminCors,
} from '../src/admin-cors-policy.ts';

const configured = 'https://admin.lythaus.co,http://localhost:3000';

test('allows only exact configured origins', () => {
  assert.equal(allowedAdminOrigin('https://admin.lythaus.co', configured), 'https://admin.lythaus.co');
  assert.equal(allowedAdminOrigin('https://evil.example', configured), undefined);
  assert.equal(allowedAdminOrigin('https://admin.lythaus.co.evil.example', configured), undefined);
  assert.equal(allowedAdminOrigin(null, configured), undefined);
  assert.equal(allowedAdminOrigin('https://admin.lythaus.co', 'https://admin.lythaus.co/path'), undefined);
});

test('credentialed CORS headers are emitted for the configured control-panel origin', () => {
  const request = new Request('https://admin-api.lythaus.co/api/admin/health', {
    headers: { origin: 'https://admin.lythaus.co' },
  });
  const response = withAdminCors(request, configured, new Response('{}', {
    headers: { vary: 'Accept-Encoding', 'x-correlation-id': 'test-correlation' },
  }));
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://admin.lythaus.co');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(response.headers.get('access-control-expose-headers'), 'X-Correlation-ID');
  assert.equal(response.headers.get('vary'), 'Accept-Encoding, Origin');
});

test('preflight is fail closed for unconfigured origins and explicit for the control panel', () => {
  const denied = adminCorsPreflight(new Request('https://admin-api.lythaus.co/api/admin/health', {
    method: 'OPTIONS', headers: { origin: 'https://evil.example' },
  }), configured);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const allowed = adminCorsPreflight(new Request('https://admin-api.lythaus.co/api/admin/health', {
    method: 'OPTIONS', headers: { origin: 'https://admin.lythaus.co' },
  }), configured);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://admin.lythaus.co');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.match(allowed.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.match(allowed.headers.get('access-control-allow-headers') ?? '', /Authorization/);
});

test('admin mutations require the configured same origin and JSON content type', () => {
  const valid = new Request('https://admin.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json; charset=utf-8' },
  });
  assert.doesNotThrow(() => assertAdminMutationRequest(valid, configured));

  const crossOrigin = new Request('https://admin.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
  });
  assert.throws(() => assertAdminMutationRequest(crossOrigin, configured), /admin_mutation_origin_invalid/);

  const crossHost = new Request('https://admin-api.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' },
  });
  assert.throws(() => assertAdminMutationRequest(crossHost, configured), /admin_mutation_origin_invalid/);

  const nonJson = new Request('https://admin.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://admin.lythaus.co', 'content-type': 'text/plain' },
  });
  assert.throws(() => assertAdminMutationRequest(nonJson, configured), /admin_mutation_content_type_invalid/);
});

const actorId = '01900000-0000-7000-8000-000000000099';
const targetId = '01900000-0000-7000-8000-000000000010';
const state = { role: 'administrator', member: true, limited: false, queries: [], transactions: 0 };
const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });

mock.module('@lythaus/db', { cache: true, namedExports: {
  ...database,
  query: async (_binding, sql) => {
    state.queries.push(sql);
    if (sql.includes('identity.admin_memberships')) return state.member
      ? result([{ user_id: actorId, role: state.role }]) : result();
    if (sql.includes('system.rate_limit_windows')) return state.limited ? result() : result([{ request_count: 1 }]);
    if (sql.includes('FROM privacy.legal_holds')) return result();
    throw new Error('unexpected_admission_query');
  },
  transaction: async (_binding, work) => {
    state.transactions += 1;
    return work({ query: async sql => {
      state.queries.push(sql);
      if (sql.startsWith('UPDATE privacy.legal_holds')) return result();
      throw new Error('unexpected_admission_transaction');
    } });
  },
} });
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), { cache: true, namedExports: {
  requireActiveAdminMembership: row => {
    if (!row) throw new Error('admin_role_required');
    return { userId: row.user_id, role: row.role };
  },
  verifiedAccessSubject: async request => {
    const assertion = request.headers.get('cf-access-jwt-assertion');
    if (!assertion) throw new Error('access_required');
    if (assertion !== 'synthetic-valid') throw new Error('access_assertion_invalid');
    return 'synthetic-admin';
  },
} });

const { default: worker } = await import('../src/index.ts');
const env = { ACCESS_SUBJECT_HMAC_KEY: 'synthetic-key', EXPECTED_HOSTNAMES: 'admin.lythaus.co,admin-api.lythaus.co',
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co', DB_ADMIN_FRESH: {}, DB_PRIVACY_FRESH: {} };
const operations = [
  { method: 'POST', path: '/api/admin/privacy/legal-holds', error: 'invalid_legal_hold',
    body: { subjectId: targetId, reason: 'Synthetic regression' } },
  { method: 'POST', path: `/api/admin/privacy/legal-holds/${targetId}/clear`, error: 'legal_hold_not_found', status: 404, body: null },
  { method: 'POST', path: '/api/admin/editorial/publications', error: 'invalid_editorial_publication', body: { title: 'Synthetic regression' } },
  { method: 'POST', path: `/api/admin/moderation/cases/${targetId}/decision`, error: 'invalid_moderation_outcome',
    body: { outcome: 'block', reasonCode: 'SYNTHETIC_TEST' } },
  { method: 'POST', path: `/api/admin/appeals/${targetId}/adjudications`, role: 'editorial', error: 'appeal_adjudication_decision_invalid',
    body: { decision: 'uphold', reasonCode: 'SYNTHETIC_TEST' } },
  { method: 'PUT', path: `/api/admin/reviewers/${targetId}/qualification`, error: 'reviewer_qualification_state_invalid',
    body: { state: 'trained', reasonCode: 'SYNTHETIC_TEST' } },
  { method: 'POST', path: `/api/admin/reviewers/${targetId}/qualification`, error: 'reviewer_qualification_state_invalid',
    body: { state: 'trained', reasonCode: 'SYNTHETIC_TEST' } },
  { method: 'POST', path: `/api/admin/users/${targetId}/status`, error: 'invalid_account_status',
    body: { status: 'suspended', reasonCode: 'SYNTHETIC_TEST', confirmation: 'SUSPEND ACCOUNT' } },
  { method: 'POST', path: `/api/admin/users/${targetId}/tier`, error: 'invalid_subscription_tier',
    body: { tier: 'premium', reasonCode: 'SYNTHETIC_TEST' } },
];

function reset(operation = {}) {
  state.role = operation.role ?? 'administrator';
  state.member = true; state.limited = false; state.queries = []; state.transactions = 0;
}

function mutationRequest(operation, headers = {}, body = '{}', origin = 'https://admin.lythaus.co') {
  const requestHeaders = new Headers({ 'cf-access-jwt-assertion': 'synthetic-valid', origin,
    'content-type': 'application/json', ...headers });
  const request = new Request(`https://admin.lythaus.co${operation.path}`, { method: operation.method, headers: requestHeaders, body });
  for (const [name, value] of Object.entries(headers)) if (value === null) request.headers.delete(name);
  return request;
}

function assertNoDomainWork() {
  assert.equal(state.transactions, 0);
  assert.equal(state.queries.filter(sql => !sql.includes('identity.admin_memberships')
    && !sql.includes('system.rate_limit_windows')).length, 0);
}

test('every legacy admin mutation denies absent, opaque, unconfigured, sibling and external origins before body/domain work', async t => {
  for (const operation of operations) {
    await t.test(`${operation.method} ${operation.path}`, async () => {
      for (const origin of [null, 'null', 'https://untrusted.invalid', 'https://lythaus.co', 'https://admin.lythaus.co.evil.invalid']) {
        reset(operation);
        const request = mutationRequest(operation, { origin }, '{');
        const response = await worker.fetch(request, env);
        assert.equal(response.status, 403, `${operation.method} ${operation.path}: ${origin}`);
        assert.equal((await response.json()).error, 'admin_mutation_origin_invalid');
        assert.equal(request.bodyUsed, false);
        assertNoDomainWork();
      }
      reset(operation);
      const response = await worker.fetch(mutationRequest(operation), { ...env, CORS_ALLOWED_ORIGINS: undefined });
      assert.equal(response.status, 403);
      assertNoDomainWork();
    });
  }
});

test('every legacy admin mutation denies missing and non-JSON media types before body/domain work', async t => {
  for (const operation of operations) {
    await t.test(`${operation.method} ${operation.path}`, async () => {
      for (const contentType of [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=synthetic']) {
        reset(operation);
        const request = mutationRequest(operation, { 'content-type': contentType }, '{');
        const response = await worker.fetch(request, env);
        assert.equal(response.status, 415, `${operation.method} ${operation.path}: ${contentType}`);
        assert.equal((await response.json()).error, 'admin_mutation_content_type_invalid');
        assert.equal(request.bodyUsed, false);
        assertNoDomainWork();
      }
    });
  }
});

test('configured same-origin JSON passes admission and retains each operation validation', async () => {
  for (const operation of operations) {
    for (const contentType of ['application/json', 'Application/JSON; charset=utf-8']) {
      reset(operation);
      const response = await worker.fetch(mutationRequest(operation, { 'content-type': contentType }), env);
      assert.equal(response.status, operation.status ?? 400, operation.path);
      assert.equal((await response.json()).error, operation.error);
      assert.match(response.headers.get('cache-control'), /private.*no-store/);
      if (operation.status === 404) assert.equal(state.transactions, 1);
      else assertNoDomainWork();
    }
  }
});

test('otherwise valid mutation bodies cannot reach the domain through cross-origin or plain-text requests', async () => {
  for (const operation of operations) {
    for (const [headers, status, error] of [
      [{ origin: null }, 403, 'admin_mutation_origin_invalid'],
      [{ origin: 'https://untrusted.invalid', 'content-type': 'text/plain' }, 403, 'admin_mutation_origin_invalid'],
      [{ 'content-type': 'text/plain' }, 415, 'admin_mutation_content_type_invalid'],
    ]) {
      reset(operation);
      const request = mutationRequest(operation, headers, operation.body === null ? null : JSON.stringify(operation.body));
      const response = await worker.fetch(request, env);
      assert.equal(response.status, status, operation.path);
      assert.equal((await response.json()).error, error);
      assert.equal(request.bodyUsed, false);
      assertNoDomainWork();
    }
  }
});

test('mutation admission retains Access, active membership and rate checks', async () => {
  for (const operation of operations) {
    for (const [assertion, error] of [[null, 'access_required'], ['synthetic-invalid', 'access_assertion_invalid']]) {
      reset(operation);
      const response = await worker.fetch(mutationRequest(operation, { 'cf-access-jwt-assertion': assertion }), env);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, error);
      assert.equal(state.queries.length, 0);
      assertNoDomainWork();
    }
    reset(operation); state.member = false;
    const nonmember = await worker.fetch(mutationRequest(operation), env);
    assert.equal(nonmember.status, 403);
    assert.equal((await nonmember.json()).error, 'admin_role_required');
    assertNoDomainWork();
    reset(operation); state.limited = true;
    const limited = await worker.fetch(mutationRequest(operation), env);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, 'rate_limit_exceeded');
    assertNoDomainWork();
  }
});

test('configured JSON preserves existing role denial and bodyless hold clearing', async () => {
  for (const operation of operations.filter(item => !item.path.includes('/moderation/'))) {
    reset(); state.role = 'moderator';
    const response = await worker.fetch(mutationRequest(operation), env);
    assert.equal(response.status, operation.role ? 400 : 403);
    assert.equal((await response.json()).error, operation.role ? 'appeal_adjudicator_required' : 'admin_role_required');
    assertNoDomainWork();
  }
  const clear = operations.find(item => item.status === 404);
  reset(); state.role = 'privacy_operator';
  const response = await worker.fetch(mutationRequest(clear, {}, null), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'legal_hold_not_found');
  assert.equal(state.transactions, 1);
});

test('legal-hold reads and preflight retain their separate admission behavior', async () => {
  reset(); state.role = 'privacy_operator';
  const response = await worker.fetch(new Request('https://admin.lythaus.co/api/admin/privacy/legal-holds', {
    headers: { 'cf-access-jwt-assertion': 'synthetic-valid' },
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [] });
  assert.equal(state.transactions, 0);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  for (const origin of ['https://admin.lythaus.co', 'https://untrusted.invalid']) {
    reset();
    const response = await worker.fetch(new Request('https://admin.lythaus.co/api/admin/privacy/legal-holds', {
      method: 'OPTIONS', headers: { origin },
    }), env);
    assert.equal(response.status, origin === 'https://admin.lythaus.co' ? 204 : 403);
    assert.equal(state.queries.length, 0);
  }
});

test('actual workerd preserves strict same-origin JSON admission independently of Access fixtures', { timeout: 60_000 }, async () => {
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022', stdin: { resolveDir: root, contents: `
      import { assertAdminMutationRequest } from './apps/lythaus-admin-api/src/admin-cors-policy.ts';
      export default { fetch(request) {
        try { assertAdminMutationRequest(request, 'https://admin.lythaus.co'); return new Response(null, { status: 204 }); }
        catch (error) { return Response.json({ error: error.message }, { status: error.message === 'admin_mutation_origin_invalid' ? 403 : 415 }); }
      }};
    ` },
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'admin-admission', modules: true,
    script: bundle.outputFiles[0].text, compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
  }] }));
  try {
    for (const [headers, status] of [
      [{ 'content-type': 'application/json' }, 403],
      [{ origin: 'https://untrusted.invalid', 'content-type': 'text/plain' }, 403],
      [{ origin: 'https://admin.lythaus.co', 'content-type': 'text/plain' }, 415],
      [{ origin: 'https://admin.lythaus.co', 'content-type': 'application/json' }, 204],
    ]) {
      const response = await mf.dispatchFetch('https://admin.lythaus.co/api/admin/privacy/legal-holds', { method: 'POST', headers, body: '{}' });
      assert.equal(response.status, status);
    }
  } finally { await mf.dispose(); }
});
