import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPublicError } from '../src/auth-runtime-policy.ts';
import { createWaitlistRouteHandler } from '../src/waitlist-handler.ts';
import {
  parseWaitlistRequest,
  requireWaitlistSecrets,
} from '../src/waitlist-runtime-policy.ts';
import { json } from '@lythaus/observability';

const validToken = 'turnstile-token-12345';
const rawEmail = ' Person@Example.COM ';

function request(body, options = {}) {
  return new Request('https://api.lythaus.co/api/waitlist', {
    method: options.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': 'waitlist-test-correlation',
      'cf-connecting-ip': '198.51.100.18',
      ...(options.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function createFixture(options = {}) {
  const queries = [];
  const hmacInputs = [];
  const logs = [];
  const turnstileCalls = [];
  const env = {
    DB_APP_FRESH: { connectionString: 'postgresql://hyperdrive.local:5432/postgres?sslmode=disable' },
    PII_ENCRYPTION_KEY_V1: 'encryption-key',
    PII_HMAC_KEY_V1: 'hmac-key',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_EXPECTED_HOSTNAMES: 'lythaus.co',
    CORS_ALLOWED_ORIGINS: 'https://lythaus.co',
  };
  const handler = createWaitlistRouteHandler({
    query: async (_binding, text, values) => {
      queries.push({ text, values });
      if (text.includes('system.rate_limit_windows')) return { rowCount: options.rateLimitRowCount ?? 1 };
      return { rowCount: options.insertRowCount ?? 1 };
    },
    parseRequest: parseWaitlistRequest,
    requireSecrets: requireWaitlistSecrets,
    verifyTurnstile: async (input) => {
      turnstileCalls.push(input);
      if (options.turnstileError) throw new Error(options.turnstileError);
    },
    hmacLookup: (value) => {
      hmacInputs.push(value);
      return `hmac:${value}`;
    },
    encryptField: async (email) => ({ ciphertext: `ciphertext:${email}`, encryptionKeyVersion: 'v1' }),
    uuidv7: () => '019ffc6d-ecce-7ea1-ac71-7ee0d0d69772',
    logEvent: (event) => logs.push(event),
    correlationId: (incoming) => incoming.headers.get('x-correlation-id') ?? 'generated-correlation',
    classifyPublicError,
    json,
    now: () => Date.parse('2026-08-14T12:34:56.000Z'),
  });
  return { env, handler, hmacInputs, logs, queries, turnstileCalls };
}

test('waitlist handler writes a normalized, parameterized encrypted signup with no-store correlation headers', async () => {
  const fixture = createFixture();
  const response = await fixture.handler(request({
    email: rawEmail,
    turnstileToken: validToken,
    consentVersion: 'waitlist-v1',
    source: 'untrusted-client-value',
  }, { headers: { origin: 'https://lythaus.co' } }), fixture.env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: 'waitlisted' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-correlation-id'), 'waitlist-test-correlation');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://lythaus.co');
  assert.deepEqual(fixture.hmacInputs, ['waitlist:198.51.100.18', 'person@example.com']);
  assert.deepEqual(fixture.turnstileCalls, [{
    token: validToken,
    secret: 'turnstile-secret',
    expectedHostnames: 'lythaus.co',
  }]);
  assert.equal(fixture.queries.length, 2);
  const insert = fixture.queries[1];
  assert.match(insert.text, /INSERT INTO marketing\.waitlist_signups/);
  assert.match(insert.text, /VALUES \(\$1, decode\(\$2, 'base64'\), convert_to\(\$3, 'utf8'\), \$4, 'waiting', \$5, \$6\)/);
  assert.match(insert.text, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(insert.text, /person@example\.com|turnstile-token/i);
  assert.deepEqual(insert.values, [
    '019ffc6d-ecce-7ea1-ac71-7ee0d0d69772',
    'hmac:person@example.com',
    'ciphertext:person@example.com',
    'v1',
    'lythaus.co',
    'waitlist-v1',
  ]);
  assert.deepEqual(fixture.logs, [{
    service: 'lythaus-public-api',
    event: 'marketing.waitlist_signup_processed',
    correlationId: 'waitlist-test-correlation',
    result: 'success',
    source: 'lythaus.co',
  }]);
});

test('waitlist handler keeps duplicate submissions neutral', async () => {
  const fixture = createFixture({ insertRowCount: 0 });
  const response = await fixture.handler(request({
    email: 'person@example.com', turnstileToken: validToken, consentVersion: 'waitlist-v1',
  }), fixture.env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: 'waitlisted' });
  assert.equal(fixture.queries.length, 2);
  assert.match(fixture.queries[1].text, /ON CONFLICT DO NOTHING/);
});

test('waitlist handler rejects invalid and missing verification input before writing a signup', async (t) => {
  await t.test('invalid email', async () => {
    const fixture = createFixture();
    const response = await fixture.handler(request({
      email: 'not-an-email', turnstileToken: validToken, consentVersion: 'waitlist-v1',
    }), fixture.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_email', correlationId: 'waitlist-test-correlation' });
    assert.equal(fixture.queries.length, 0);
  });

  await t.test('missing Turnstile token', async () => {
    const fixture = createFixture();
    const response = await fixture.handler(request({ email: 'person@example.com', consentVersion: 'waitlist-v1' }), fixture.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'turnstile_required', correlationId: 'waitlist-test-correlation' });
    assert.equal(fixture.queries.length, 0);
  });

  await t.test('failed Turnstile verification', async () => {
    const fixture = createFixture({ turnstileError: 'turnstile_failed' });
    const response = await fixture.handler(request({
      email: 'person@example.com', turnstileToken: validToken, consentVersion: 'waitlist-v1',
    }), fixture.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'turnstile_failed', correlationId: 'waitlist-test-correlation' });
    assert.equal(fixture.queries.length, 1);
    assert.equal(fixture.queries.some((query) => query.text.includes('marketing.waitlist_signups')), false);
  });
});

test('waitlist handler returns safe bounded-body and abuse-limit responses', async (t) => {
  await t.test('oversized body', async () => {
    const fixture = createFixture();
    const response = await fixture.handler(request({}, { headers: { 'content-length': '9000' } }), fixture.env);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'request_too_large', correlationId: 'waitlist-test-correlation' });
    assert.equal(fixture.queries.length, 0);
  });

  await t.test('rate limit', async () => {
    const fixture = createFixture({ rateLimitRowCount: 0 });
    const response = await fixture.handler(request({
      email: 'person@example.com', turnstileToken: validToken, consentVersion: 'waitlist-v1',
    }), fixture.env);
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'rate_limit_exceeded', correlationId: 'waitlist-test-correlation' });
    assert.equal(fixture.turnstileCalls.length, 0);
    assert.equal(fixture.queries.some((query) => query.text.includes('marketing.waitlist_signups')), false);
  });
});

test('waitlist handler logs never contain submitted email or Turnstile token', async () => {
  const fixture = createFixture({ turnstileError: 'turnstile_failed' });
  const response = await fixture.handler(request({
    email: rawEmail, turnstileToken: validToken, consentVersion: 'waitlist-v1',
  }), fixture.env);

  assert.equal(response.status, 400);
  const serializedLogs = JSON.stringify(fixture.logs);
  assert.doesNotMatch(serializedLogs, /person@example\.com|turnstile-token-12345|198\.51\.100\.18/i);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-correlation-id'), 'waitlist-test-correlation');
});
