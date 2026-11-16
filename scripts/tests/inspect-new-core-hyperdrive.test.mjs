import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inspectNewCoreHyperdrive } from '../ci/inspect-new-core-hyperdrive.mjs';

const sourceSha = 'ba10cfb16941cd163e345af3c00b9bd739884646';
const token = 'synthetic-cloudflare-token';
const secretsInFixture = {
  host: 'aws.connect.psdb.cloud',
  username: 'pscale_api_syntheticrole.xwkb9quljkzd',
  password: 'synthetic-origin-password',
  ca: 'synthetic-ca-certificate',
};

function validPayload(overrides = {}) {
  return {
    success: true,
    result: {
      id: '7e39fc4a286147988ed12df7a6322616',
      origin: {
        scheme: 'postgres',
        host: secretsInFixture.host,
        port: 5432,
        database: 'postgres',
        user: secretsInFixture.username,
        password: secretsInFixture.password,
      },
      mtls: { sslmode: 'verify-full', ca_certificate_id: secretsInFixture.ca },
      caching: { disabled: true },
      ...overrides,
    },
  };
}

test('reads only the pinned Hyperdrive GET and emits sanitized exact-target evidence', async () => {
  let request;
  const result = await inspectNewCoreHyperdrive({
    token,
    sourceSha,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json(validPayload());
    },
  });
  assert.equal(request.url, 'https://api.cloudflare.com/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/hyperdrive/configs/7e39fc4a286147988ed12df7a6322616');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.headers.authorization, `Bearer ${token}`);
  assert.equal(result.status, 'READ_ONLY_PREFLIGHT_PASS');
  assert.equal(result.sourceSha, sourceSha);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.parsedBranchId, 'xwkb9quljkzd');
  assert.equal(result.branchMatch, true);
  assert.equal(result.logicalDatabase, 'postgres');
  assert.equal(result.logicalDatabaseMatch, true);
  assert.equal(result.schemeValid, true);
  assert.equal(result.hostValid, true);
  assert.equal(result.portValid, true);
  assert.equal(result.cacheDisabled, true);
  assert.equal(result.tlsMode, 'verify-full');
  assert.equal(result.caPresent, true);
  assert.equal(result.normalizedOriginFingerprint, crypto.createHash('sha256')
    .update(JSON.stringify({ scheme: 'postgres', host: secretsInFixture.host, port: 5432, database: 'postgres' })).digest('hex'));
  assert.equal(result.roleClass, 'unknown_pending_provider_role_inventory');
  const serialized = JSON.stringify(result);
  for (const value of [token, secretsInFixture.host, secretsInFixture.username, secretsInFixture.password, secretsInFixture.ca]) {
    assert.equal(serialized.includes(value), false);
  }
});

test('reports an exact branch, database, cache, or TLS mismatch as blocked', async () => {
  for (const resultOverride of [
    { origin: { ...validPayload().result.origin, username: 'pscale_api_syntheticrole.oldbranch01' } },
    { origin: { ...validPayload().result.origin, database: 'other' } },
    { origin: { ...validPayload().result.origin, scheme: 'mysql' } },
    { origin: { ...validPayload().result.origin, host: 'psdb.cloud.attacker.invalid' } },
    { origin: { ...validPayload().result.origin, port: 3306 } },
    { origin: { ...validPayload().result.origin, username: 'owner@example.invalid' } },
    { origin: { ...validPayload().result.origin, user: 'pscale_api_syntheticrole.xwkb9quljkzd', username: 'owner@example.invalid' } },
    { mtls: { sslmode: 'require' } },
    { caching: { disabled: false } },
    { id: 'wrong-config-id' },
  ]) {
    const result = await inspectNewCoreHyperdrive({
      token,
      sourceSha,
      fetchImpl: async () => Response.json(validPayload(resultOverride)),
    });
    assert.equal(result.status, 'READ_ONLY_PREFLIGHT_BLOCKED');
    if (resultOverride.origin?.database === 'other') {
      assert.equal(result.logicalDatabase, null);
      assert.equal(JSON.stringify(result).includes('other'), false);
    }
    if (resultOverride.origin?.username === 'owner@example.invalid') {
      assert.equal(result.originUsernameSha256, null);
      assert.equal(result.parsedBranchId, null);
      assert.equal(JSON.stringify(result).includes('owner@example.invalid'), false);
    }
  }
  const missingCache = await inspectNewCoreHyperdrive({ token, sourceSha,
    fetchImpl: async () => Response.json(validPayload({ caching: {} })) });
  assert.equal(missingCache.cacheDisabled, null);
  assert.equal(missingCache.status, 'READ_ONLY_PREFLIGHT_BLOCKED');
});

test('keeps HTTP failures and oversized or malformed responses sanitized', async () => {
  const unauthorized = await inspectNewCoreHyperdrive({
    token,
    sourceSha,
    fetchImpl: async () => new Response(JSON.stringify({ error: 'raw provider body must not escape', token }), { status: 401 }),
  });
  assert.deepEqual(unauthorized, {
    status: 'READ_ONLY_PREFLIGHT_BLOCKED',
    sourceSha,
    httpStatus: 401,
    code: 'cloudflare_http_status_not_ok',
  });
  for (const body of ['not-json', 'x'.repeat(70 * 1024)]) {
    const result = await inspectNewCoreHyperdrive({
      token,
      sourceSha,
      fetchImpl: async () => new Response(body, { status: 200 }),
    });
    assert.equal(result.status, 'READ_ONLY_PREFLIGHT_BLOCKED');
    assert.equal(JSON.stringify(result).includes(body), false);
  }
});

test('does not call Cloudflare when token or source SHA is unavailable', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not run'); };
  assert.equal((await inspectNewCoreHyperdrive({ token: '', sourceSha, fetchImpl })).code, 'cloudflare_token_unavailable');
  assert.equal((await inspectNewCoreHyperdrive({ token, sourceSha: 'untrusted', fetchImpl })).code, 'source_sha_unavailable');
  assert.equal(calls, 0);
});
