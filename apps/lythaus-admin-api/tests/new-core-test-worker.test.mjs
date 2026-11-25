import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import defaultNewCoreWorker, { createNewCoreTestWorker, isExactTestAccessConfiguration } from '../src/new-core-test-worker.ts';

const hostname = 'admin-new-core-test.lythaus.co';
const audience = 'synthetic-new-core-test-audience';
const audienceSha256 = createHash('sha256').update(audience).digest('hex');
const workerVersionId = '12345678-1234-7234-8234-123456789abc';

function environment(overrides = {}) {
  return {
    WORKER_VERSION: { tag: 'a'.repeat(40), id: workerVersionId, timestamp: '2026-11-16T00:00:00Z' },
    EXPECTED_HOSTNAMES: hostname,
    CORS_ALLOWED_ORIGINS: `https://${hostname}`,
    ACCESS_TEAM_DOMAIN: 'lythaus.cloudflareaccess.com',
    ACCESS_JWKS_URL: 'https://lythaus.cloudflareaccess.com/cdn-cgi/access/certs',
    ACCESS_AUDIENCES: audience,
    NEW_CORE_ACCESS_ISSUER: 'https://lythaus.cloudflareaccess.com',
    NEW_CORE_ACCESS_AUDIENCE_SHA256: audienceSha256,
    ASSETS: { fetch: async () => new Response('asset') },
    ...overrides,
  };
}

function router({ verifyAccess = async () => true } = {}) {
  const calls = { admin: [], bootstrap: 0, assets: 0, verify: 0 };
  const worker = createNewCoreTestWorker({
    adminFetch: async (request) => {
      calls.admin.push(`${request.method} ${new URL(request.url).pathname}`);
      return Response.json({ ok: true });
    },
    bootstrap: async () => {
      calls.bootstrap += 1;
      return Response.json({ created: true, role: 'administrator' }, { status: 201 });
    },
    verifyAccess: async (...args) => {
      calls.verify += 1;
      return verifyAccess(...args);
    },
  });
  const env = environment({ ASSETS: { fetch: async () => { calls.assets += 1; return new Response('asset'); } } });
  return { worker, calls, env };
}

test('requires one exact isolated Access audience, issuer and JWKS origin', async () => {
  const env = environment();
  assert.equal(await isExactTestAccessConfiguration(env), true);
  assert.equal(await isExactTestAccessConfiguration(environment({ NEW_CORE_ACCESS_ISSUER: 'https://wrong.cloudflareaccess.com' })), false);
  assert.equal(await isExactTestAccessConfiguration(environment({ ACCESS_AUDIENCES: `${audience},production-audience` })), false);
  assert.equal(await isExactTestAccessConfiguration(environment({ NEW_CORE_ACCESS_AUDIENCE_SHA256: '0'.repeat(64) })), false);
  assert.equal(await isExactTestAccessConfiguration(environment({ ACCESS_JWKS_URL: 'https://wrong.cloudflareaccess.com/certs' })), false);
  assert.equal(await isExactTestAccessConfiguration(environment({ ACCESS_AUDIENCES: '' })), false);
});

test('rejects wrong origin, alternate port, host and same-origin policy before dispatch', async () => {
  const { worker, calls } = router();
  const env = environment();
  for (const url of [
    `http://${hostname}/api/admin/health`,
    `https://${hostname}:8443/api/admin/health`,
    'https://admin.lythaus.co/api/admin/health',
    'https://admin-new-core-test.lythaus.co.evil.example/api/admin/health',
  ]) {
    assert.equal((await worker.fetch(new Request(url), env)).status, 404);
  }
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/health`), environment({ EXPECTED_HOSTNAMES: 'admin.lythaus.co' }))).status, 404);
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/health`), environment({ CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co' }))).status, 404);
  assert.deepEqual(calls.admin, []);
  assert.equal(calls.verify, 0);
});

test('blocks unconfigured, invalid and unsigned Access assertions before serving assets', async () => {
  const unsigned = router({ verifyAccess: async (request) => request.headers.has('cf-access-jwt-assertion') });
  assert.equal((await unsigned.worker.fetch(new Request(`https://${hostname}/flags`), unsigned.env)).status, 401);
  assert.equal(unsigned.calls.assets, 0);
  assert.equal(unsigned.calls.verify, 1);

  const unconfigured = router();
  assert.equal((await unconfigured.worker.fetch(new Request(`https://${hostname}/flags`), environment({ ACCESS_AUDIENCES: '' }))).status, 503);
  assert.equal(unconfigured.calls.verify, 0);
});

test('the deployed entry point rejects absent and malformed signed Access assertions before asset fetch', async () => {
  const calls = { assets: 0 };
  const env = environment({ ASSETS: { fetch: async () => { calls.assets += 1; return new Response('asset'); } } });
  const noAssertion = await defaultNewCoreWorker.fetch(new Request(`https://${hostname}/flags`), env);
  const malformedAssertion = await defaultNewCoreWorker.fetch(new Request(`https://${hostname}/flags`, {
    headers: { 'cf-access-jwt-assertion': 'not.a.valid.jwt' },
  }), env);
  assert.equal(noAssertion.status, 401);
  assert.equal(malformedAssertion.status, 401);
  for (const response of [noAssertion, malformedAssertion]) {
    assert.equal(response.headers.get('x-lythaus-worker-version'), null);
    assert.equal(response.headers.get('x-lythaus-source-sha'), null);
  }
  assert.equal(calls.assets, 0);
});

test('serves the normal same-origin assets only after Access verification', async () => {
  const calls = { assets: 0 };
  const worker = createNewCoreTestWorker({
    adminFetch: async () => Response.json({ ok: true }),
    bootstrap: async () => Response.json({ created: true }),
    verifyAccess: async (request) => request.headers.get('cf-access-jwt-assertion') === 'synthetic-verified',
  });
  const env = environment({ ASSETS: { fetch: async () => { calls.assets += 1; return new Response('flags page'); } } });
  const response = await worker.fetch(new Request(`https://${hostname}/flags`, {
    headers: { 'cf-access-jwt-assertion': 'synthetic-verified' },
  }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'flags page');
  assert.equal(response.headers.get('x-lythaus-source-sha'), 'a'.repeat(40));
  assert.equal(response.headers.get('x-lythaus-worker-version'), workerVersionId);
  assert.equal(calls.assets, 1);
});

test('allows only normal health, moderation read and one-time bootstrap paths', async () => {
  const { worker, calls, env } = router();
  const health = await worker.fetch(new Request(`https://${hostname}/api/admin/health`), env);
  const cases = await worker.fetch(new Request(`https://${hostname}/api/admin/moderation/cases`), env);
  assert.equal(health.headers.get('x-lythaus-source-sha'), 'a'.repeat(40));
  assert.equal(cases.headers.get('x-lythaus-worker-version'), workerVersionId);
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/users`), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/recovery/subject-rebind`), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/recovery/subject-diagnostic`), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/moderation/cases/fixture/decision`, { method: 'POST' }), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`https://${hostname}/api/admin/bootstrap/first-administrator`), env)).status, 404);
  const bootstrap = await worker.fetch(new Request(`https://${hostname}/api/admin/bootstrap/first-administrator`, { method: 'POST' }), env);
  assert.equal(bootstrap.status, 201);
  assert.equal(bootstrap.headers.get('x-lythaus-worker-version'), null);
  assert.equal(bootstrap.headers.get('x-lythaus-source-sha'), null);
  assert.deepEqual(calls.admin, ['GET /api/admin/health', 'GET /api/admin/moderation/cases']);
  assert.equal(calls.bootstrap, 1);
});
