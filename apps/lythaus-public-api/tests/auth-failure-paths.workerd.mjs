import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { hashAuthToken, hmacLookup, uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Auth Workerd fixtures require local disposable PostgreSQL 17');
const databaseTarget = new URL(connectionString);
// Local runs must use the auth-test database; CI may use only its disposable PostgreSQL service.
const disposableDatabase = databaseTarget.pathname.startsWith('/lythaus_auth_test')
  || (process.env.GITHUB_ACTIONS === 'true' && databaseTarget.pathname === '/postgres');
if (!['localhost', '127.0.0.1', '::1'].includes(databaseTarget.hostname)
  || !disposableDatabase) {
  throw new Error('Auth Workerd fixtures refuse non-local or non-disposable PostgreSQL databases');
}

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const password = 'synthetic pre-verification password';
const ownerPassword = 'synthetic mailbox owner password';
const acceptedPasswordDigests = [password, ownerPassword].map(value => createHash('sha1').update(value).digest('hex').toUpperCase());
const hmacKey = randomBytes(32).toString('base64');
const rateLimitWindowMs = 60_000;
const stableWindowStartOffsetMs = 1_500;
const stableWindowHalfwayMs = 30_000;
const stableWindowSelectionTimeoutMs = 120_000;
const publicErrorHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json; charset=utf-8',
  'mf-content-encoding': 'gzip',
  'transfer-encoding': 'chunked',
  vary: 'Origin, Authorization',
};

function normalizePrivateError(response, body) {
  assert.ok(body && typeof body === 'object' && !Array.isArray(body));
  assert.match(body.correlationId ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(response.headers.get('x-correlation-id'), body.correlationId);
  const normalizedBody = { ...body };
  delete normalizedBody.correlationId;
  const normalizedHeaders = Object.fromEntries(response.headers.entries());
  delete normalizedHeaders['x-correlation-id'];
  return { status: response.status, body: normalizedBody, headers: normalizedHeaders };
}

function assertPrivateError(response, body, status, error, extraHeaders = {}) {
  assert.deepEqual(normalizePrivateError(response, body), {
    status,
    body: { error },
    headers: { ...publicErrorHeaders, ...extraHeaders },
  });
}

function assertPrivacyLeakMutationsRejected(response, body, status, error, extraHeaders = {}) {
  const mutations = [
    { accountState: 'verified' },
    { submittedInput: { email: 'member@example.invalid', password: 'synthetic password', turnstileToken: 'synthetic token' } },
    { providerDetails: { status: 302, location: 'https://provider-detail.invalid/private' } },
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => assertPrivateError(response, { ...body, ...mutation }, status, error, extraHeaders),
      assert.AssertionError,
      'unexpected account, submitted-input, or provider details must fail the complete-body assertion',
    );
  }
  const leakedHeaders = new Headers(response.headers);
  leakedHeaders.set('x-provider-details', 'synthetic upstream response');
  assert.throws(
    () => assertPrivateError({ status: response.status, headers: leakedHeaders }, body, status, error, extraHeaders),
    assert.AssertionError,
    'unexpected provider response headers must fail the complete-header assertion',
  );
}

function stableRateLimitWindowStart(now) {
  const currentWindowStart = Math.floor(now / rateLimitWindowMs) * rateLimitWindowMs;
  return now - currentWindowStart >= stableWindowHalfwayMs
    ? currentWindowStart + rateLimitWindowMs
    : currentWindowStart;
}

async function waitForStableRateLimitWindow(windowStart, {
  now = Date.now,
  elapsedNow = () => performance.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  deadline = elapsedNow() + stableWindowSelectionTimeoutMs,
  maxAttempts = 8,
} = {}) {
  let candidate = windowStart;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const observedAt = now();
    if (elapsedNow() >= deadline) break;
    const observedWindowStart = Math.floor(observedAt / rateLimitWindowMs) * rateLimitWindowMs;
    if (candidate < observedWindowStart) candidate = observedWindowStart;
    if (observedAt - candidate >= stableWindowHalfwayMs) {
      candidate = Math.max(candidate + rateLimitWindowMs, observedWindowStart + rateLimitWindowMs);
      continue;
    }

    const safeStart = candidate + stableWindowStartOffsetMs;
    if (observedAt < safeStart) {
      await sleep(Math.min(safeStart - observedAt, deadline - elapsedNow()));
    }

    const confirmedAt = now();
    if (elapsedNow() >= deadline) break;
    const confirmedWindowStart = Math.floor(confirmedAt / rateLimitWindowMs) * rateLimitWindowMs;
    const elapsedInCandidate = confirmedAt - candidate;
    if (confirmedWindowStart === candidate
      && elapsedInCandidate >= 1_000
      && elapsedInCandidate < stableWindowHalfwayMs) {
      return candidate;
    }

    // The clock or event loop crossed the candidate's safe range; select again from the latest reading.
    candidate = Math.max(candidate + rateLimitWindowMs, confirmedWindowStart);
  }
  throw new Error('fixture could not enter a stable rate-limit window before its bounded deadline');
}

async function chooseStableRateLimitWindow(options = {}) {
  const now = options.now ?? Date.now;
  return waitForStableRateLimitWindow(stableRateLimitWindowStart(now()), options);
}

test('rate-limit window selection handles the midpoint race and is bounded', async () => {
  assert.equal(stableRateLimitWindowStart(29_999), 0);
  assert.equal(stableRateLimitWindowStart(30_000), rateLimitWindowMs);

  let fakeNow = 29_999;
  let fakeElapsed = 0;
  let nowCalls = 0;
  const sleeps = [];
  const selected = await chooseStableRateLimitWindow({
    now: () => {
      nowCalls += 1;
      if (nowCalls === 3) fakeNow = 30_001;
      return fakeNow;
    },
    elapsedNow: () => fakeElapsed,
    sleep: async milliseconds => {
      sleeps.push(milliseconds);
      fakeNow += milliseconds;
      fakeElapsed += milliseconds;
    },
    deadline: 120_000,
  });
  assert.equal(selected, rateLimitWindowMs, 'a missed midpoint window is reselected after the clock crosses 30 seconds');
  assert.deepEqual(sleeps, [rateLimitWindowMs + stableWindowStartOffsetMs - 30_001]);

  let timedOutAt = 0;
  let timedOutElapsed = 0;
  await assert.rejects(
    waitForStableRateLimitWindow(0, {
      now: () => timedOutAt,
      elapsedNow: () => timedOutElapsed,
      sleep: async milliseconds => {
        timedOutAt += milliseconds + stableWindowHalfwayMs;
        timedOutElapsed += milliseconds + stableWindowHalfwayMs;
      },
      deadline: 10_000,
    }),
    /bounded deadline/,
    'selection stops at its caller-supplied deadline when every candidate is missed',
  );
});

const databaseStub = `
import { env } from 'cloudflare:workers';
export * from './packages/db/src/index.ts';
async function sql(input) {
  const response = await env.DISPOSABLE_POSTGRES.fetch('https://fixture.invalid/sql', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
export async function query(binding, text, values = []) {
  return sql({ action: 'query', role: binding.role, text, values });
}
export async function transaction(binding, work) {
  const { transactionId } = await sql({ action: 'begin', role: binding.role });
  try {
    const result = await work({ query: (text, values = []) => sql({ action: 'query', transactionId, text, values }) });
    await sql({ action: 'commit', transactionId });
    return result;
  } catch (error) {
    await sql({ action: 'rollback', transactionId });
    throw error;
  }
}
`;

describe('Public API authentication failures in native Workerd', { timeout: 180_000 }, () => {
  let fixture;
  before(async () => { fixture = await createFixture(); });
  after(async () => { await fixture?.dispose(); });

  test('provider failures fail closed before account or email intent persistence', async () => {
    const cases = [
      { name: 'screening redirect', screening: 'redirect', expected: 'password_screening_unavailable', expectedStatus: 503, screeningCalls: 1, turnstileCalls: 0 },
      { name: 'screening malformed range', screening: 'malformed', expected: 'password_screening_unavailable', expectedStatus: 503, screeningCalls: 1, turnstileCalls: 0 },
      { name: 'screening timeout', screening: 'timeout', expected: 'password_screening_unavailable', expectedStatus: 503, screeningCalls: 1, turnstileCalls: 0 },
      { name: 'Turnstile redirect', screening: 'ok', turnstile: 'redirect', expected: 'turnstile_unavailable', expectedStatus: 503, screeningCalls: 1, turnstileCalls: 1 },
      { name: 'Turnstile HTTP failure', screening: 'ok', turnstile: 'http_503', expected: 'turnstile_unavailable', expectedStatus: 503, screeningCalls: 1, turnstileCalls: 1 },
      { name: 'Turnstile malformed body', screening: 'ok', turnstile: 'malformed', expected: 'turnstile_unavailable', expectedStatus: 503, screeningCalls: 1, turnstileCalls: 1 },
      { name: 'Turnstile wrong action', screening: 'ok', turnstile: 'wrong_action', expected: 'turnstile_failed', expectedStatus: 400, screeningCalls: 1, turnstileCalls: 1 },
    ];

    for (const scenario of cases) {
      const email = fixture.email('failure');
      const key = fixture.idempotencyKey('failure');
      fixture.setProviderModes({ screening: scenario.screening, turnstile: scenario.turnstile ?? 'ok' });
      const before = fixture.providerCounts();
      const response = await fixture.request('/api/auth/email', {
        mode: 'register', email, password, turnstileToken: 'account_signup',
      }, { idempotencyKey: key });
      const body = await response.json();
      assertPrivateError(response, body, scenario.expectedStatus, scenario.expected);
      if (scenario.name === cases[0].name) {
        assertPrivacyLeakMutationsRejected(response, body, scenario.expectedStatus, scenario.expected);
      }
      const after = fixture.providerCounts();
      assert.equal(after.screening - before.screening, scenario.screeningCalls, `${scenario.name}: one screening request, no redirect follow`);
      assert.equal(after.turnstile - before.turnstile, scenario.turnstileCalls, `${scenario.name}: only the expected Turnstile request`);
      assert.equal(after.denied - before.denied, 0, `${scenario.name}: no redirect target or unrecognized outbound request`);
      assert.equal(await fixture.accountCount(email), 0, `${scenario.name}: no account`);
      assert.equal(await fixture.outboxCount(email), 0, `${scenario.name}: no email intent`);

      const record = await fixture.idempotencyRecord('register', key);
      assert.equal(record.response.state, 'outcome_unknown', scenario.name);
      assert.deepEqual(Object.keys(record.response).sort(), ['requestHash', 'state']);
      assert.equal(record.response.requestHash.length, 64);
      const serialized = JSON.stringify(record.response);
      for (const privateValue of [email, password, 'account_signup', hmacKey]) assert.ok(!serialized.includes(privateValue));

      if (scenario.name === 'screening timeout') {
        fixture.setProviderModes({ screening: 'ok', turnstile: 'ok' });
        const beforeReplay = fixture.providerCounts();
        const replay = await fixture.request('/api/auth/email', {
          mode: 'register', email, password, turnstileToken: 'account_signup',
        }, { idempotencyKey: key });
        assertPrivateError(replay, await replay.json(), 409, 'idempotency_outcome_unknown');
        assert.deepEqual(fixture.providerCounts(), beforeReplay, 'ambiguous retry must not call either provider again');
        assert.equal(await fixture.accountCount(email), 0);
      }
    }
  });

  test('signup replay, resend replay, stale proof, verification replay, and sign-in retain contract boundaries', async () => {
    fixture.setProviderModes({ screening: 'ok', turnstile: 'ok' });
    const email = fixture.email('journey');
    const signupKey = fixture.idempotencyKey('signup');
    const signup = { mode: 'register', email, password, turnstileToken: 'account_signup' };
    const signupCounts = fixture.providerCounts();
    const firstSignup = await fixture.request('/api/auth/email', signup, { idempotencyKey: signupKey });
    assert.equal(firstSignup.status, 202);
    assert.deepEqual(await firstSignup.json(), { state: 'verification_required' });
    const afterSignup = fixture.providerCounts();
    assert.equal(afterSignup.screening - signupCounts.screening, 1);
    assert.equal(afterSignup.turnstile - signupCounts.turnstile, 1);

    const signupReplay = await fixture.request('/api/auth/email', signup, { idempotencyKey: signupKey });
    assert.equal(signupReplay.status, 202);
    assert.deepEqual(await signupReplay.json(), { state: 'verification_required' });
    assert.deepEqual(fixture.providerCounts(), afterSignup, 'accepted signup replay must not reuse Turnstile or mint another proof');

    const user = await fixture.account(email);
    assert.ok(user);
    assert.equal(user.verified_at, null);
    assert.equal(await fixture.challengeCount(user.id), 1);
    assert.equal(await fixture.outboxCount(email), 1);
    const signupRecord = await fixture.idempotencyRecord('register', signupKey);
    assert.equal(signupRecord.response.state, 'completed');
    for (const privateValue of [email, password, 'account_signup', hmacKey]) {
      assert.ok(!JSON.stringify(signupRecord.response).includes(privateValue));
    }

    const nonexistent = await fixture.request('/api/auth/email', {
      mode: 'login', email: fixture.email('unknown-login'), password,
    });
    const wrongPassword = await fixture.request('/api/auth/email', { mode: 'login', email, password: 'synthetic wrong password' });
    const nonexistentBody = await nonexistent.json();
    const wrongPasswordBody = await wrongPassword.json();
    assertPrivateError(nonexistent, nonexistentBody, 401, 'invalid_credentials');
    assertPrivateError(wrongPassword, wrongPasswordBody, 401, 'invalid_credentials');
    assert.notEqual(nonexistentBody.correlationId, wrongPasswordBody.correlationId);
    assert.deepEqual(
      normalizePrivateError(nonexistent, nonexistentBody),
      normalizePrivateError(wrongPassword, wrongPasswordBody),
      'unknown-account and wrong-password responses have the same complete public body and headers apart from correlation ID',
    );
    const pendingPassword = await fixture.request('/api/auth/email', { mode: 'login', email, password });
    assertPrivateError(pendingPassword, await pendingPassword.json(), 400, 'email_verification_required');
    assert.equal(await fixture.sessionCount(user.id), 0, 'failed and pending sign-ins must not create sessions');

    await fixture.query(
      `UPDATE identity.email_verification_tokens SET created_at=now()-interval '31 seconds'
        WHERE user_id=$1 AND consumed_at IS NULL AND superseded_at IS NULL`, [user.id],
    );
    const resendKey = fixture.idempotencyKey('resend');
    const resend = { mode: 'resend_verification', email, turnstileToken: 'verification_resend' };
    const resendCounts = fixture.providerCounts();
    const firstResend = await fixture.request('/api/auth/email', resend, { idempotencyKey: resendKey });
    assert.equal(firstResend.status, 202);
    assert.deepEqual(await firstResend.json(), { state: 'verification_required' });
    const afterResend = fixture.providerCounts();
    assert.equal(afterResend.screening, resendCounts.screening, 'resend does not run new-password screening');
    assert.equal(afterResend.turnstile - resendCounts.turnstile, 1);
    assert.equal(await fixture.challengeCount(user.id), 2);
    assert.equal(await fixture.currentChallengeCount(user.id), 1);
    assert.equal(await fixture.outboxCount(email), 2);

    const resendReplay = await fixture.request('/api/auth/email', resend, { idempotencyKey: resendKey });
    assert.equal(resendReplay.status, 202);
    assert.deepEqual(await resendReplay.json(), { state: 'verification_required' });
    assert.deepEqual(fixture.providerCounts(), afterResend, 'accepted resend replay must not repeat Turnstile or create another intent');
    assert.equal(await fixture.challengeCount(user.id), 2);
    assert.equal(await fixture.outboxCount(email), 2);

    const expiredToken = randomBytes(32).toString('base64url');
    const supersededToken = randomBytes(32).toString('base64url');
    const validToken = randomBytes(32).toString('base64url');
    await fixture.insertChallenge(user.id, expiredToken, 'expired');
    await fixture.insertChallenge(user.id, supersededToken, 'superseded');
    await fixture.insertChallenge(user.id, validToken, 'valid');

    for (const token of [expiredToken, supersededToken]) {
      const stale = await fixture.request('/api/auth/email/verify', { token, password: ownerPassword });
      assertPrivateError(stale, await stale.json(), 400, 'verification_token_invalid');
      assert.equal((await fixture.account(email)).verified_at, null, 'stale evidence cannot verify or replace the credential');
    }

    const verified = await fixture.request('/api/auth/email/verify', { token: validToken, password: ownerPassword });
    assert.equal(verified.status, 200);
    assert.deepEqual(await verified.json(), { state: 'verified' });
    assert.ok((await fixture.account(email)).verified_at);
    const replayedProof = await fixture.request('/api/auth/email/verify', { token: validToken, password: ownerPassword });
    assertPrivateError(replayedProof, await replayedProof.json(), 400, 'verification_token_invalid');
    assert.equal(await fixture.sessionCount(user.id), 0, 'verification does not silently create an authenticated session');

    const previousPassword = await fixture.request('/api/auth/email', { mode: 'login', email, password });
    assertPrivateError(previousPassword, await previousPassword.json(), 401, 'invalid_credentials');

    const loginHeaders = { idempotencyKey: fixture.idempotencyKey('login') };
    const firstLogin = await fixture.request('/api/auth/email', { mode: 'login', email, password: ownerPassword }, loginHeaders);
    assert.equal(firstLogin.status, 200);
    const firstSession = await firstLogin.json();
    const secondLogin = await fixture.request('/api/auth/email', { mode: 'login', email, password: ownerPassword }, loginHeaders);
    assert.equal(secondLogin.status, 200);
    const secondSession = await secondLogin.json();
    assert.equal(typeof firstSession.accessToken, 'string');
    assert.equal(typeof firstSession.refreshToken, 'string');
    assert.notEqual(firstSession.refreshToken, secondSession.refreshToken, 'login responses are not cached by idempotency key');
    const claims = JSON.parse(Buffer.from(firstSession.accessToken.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, user.id, 'JWT subject remains the UUIDv7 account id');
    assert.equal(await fixture.sessionCount(user.id), 2);
    assert.equal(await fixture.idempotencyCount('login', loginHeaders.idempotencyKey), 0);
    assert.equal(fixture.providerCounts().denied, 0, 'the Worker made no unrecognized or live provider request');
  });

  test('the Public Worker enforces ten auth requests and resets at the minute boundary', { timeout: 180_000 }, async () => {
    const ip = fixture.rateLimitIp();
    const selectionDeadline = performance.now() + stableWindowSelectionTimeoutMs;
    const firstWindowStart = await chooseStableRateLimitWindow({ deadline: selectionDeadline });
    const proofStartedAt = Date.now();
    for (let index = 0; index < 10; index += 1) {
      const response = await fixture.request('/api/auth/email', {
        mode: 'login', email: 'not-an-email', password: 'synthetic login input',
      }, { ip });
      assertPrivateError(response, await response.json(), 400, 'invalid_email');
    }
    const limited = await fixture.request('/api/auth/email', {
      mode: 'login', email: 'not-an-email', password: 'synthetic login input',
    }, { ip });
    const limitedBody = await limited.json();
    const retryAfter = limited.headers.get('retry-after');
    assert.match(retryAfter ?? '', /^\d+$/);
    assert.ok(Number(retryAfter) >= 1 && Number(retryAfter) <= 60);
    assert.ok(Math.abs(Number(retryAfter) - (60 - Math.floor(Date.now() / 1000) % 60)) <= 1);
    assertPrivateError(limited, limitedBody, 429, 'rate_limit_exceeded', { 'retry-after': retryAfter });
    assert.ok(Date.now() - proofStartedAt < 25_000, 'all threshold requests finish with a safe margin inside one minute bucket');
    assert.deepEqual(await fixture.authRateLimitWindows(ip), [
      { windowStartedAt: firstWindowStart, requestCount: 10 },
    ], 'the eleventh request is rejected in the same exact UTC minute bucket');

    const nextWindowStart = await waitForStableRateLimitWindow(firstWindowStart + rateLimitWindowMs, { deadline: selectionDeadline });
    const afterBoundary = await fixture.request('/api/auth/email', {
      mode: 'login', email: 'not-an-email', password: 'synthetic login input',
    }, { ip });
    assertPrivateError(afterBoundary, await afterBoundary.json(), 400, 'invalid_email');
    assert.deepEqual(await fixture.authRateLimitWindows(ip), [
      { windowStartedAt: firstWindowStart, requestCount: 10 },
      { windowStartedAt: nextWindowStart, requestCount: 1 },
    ], 'the same IP receives a fresh ten-request bucket immediately after the minute boundary');
  });
});

async function createFixture() {
  // CI shares its disposable database with other suites; teardown deletes only this run's exact records.
  const databaseClients = new Map();
  let transactionSequence = 0;
  let requestSequence = 0;
  const fixtureRunId = uuidv7();
  const ipNonce = randomBytes(8).toString('hex');
  const ipPrefix = `2001:db8:${ipNonce.slice(0, 4)}:${ipNonce.slice(4, 8)}:${ipNonce.slice(8, 12)}:${ipNonce.slice(12, 16)}`;
  const providerModes = { screening: 'ok', turnstile: 'ok' };
  const counts = { screening: 0, turnstile: 0, denied: 0 };
  const createdEmails = new Set();
  const createdIdempotencyKeys = new Set();
  const rateLimitSubjects = new Map();
  function fixtureEmail(label) {
    const email = `${label}-${fixtureRunId}-${uuidv7()}@example.invalid`;
    createdEmails.add(email);
    return email;
  }
  function fixtureIdempotencyKey(label) {
    const key = `auth-fixture-${fixtureRunId}-${label}-${uuidv7()}`;
    createdIdempotencyKeys.add(key);
    return key;
  }
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const keyId = 'native-auth-fixture';
  const publicJwk = { ...await exportJWK(publicKey), kid: keyId, use: 'sig', alg: 'ES256' };
  const bundle = await build({
    absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///auth-workerd-fixture.mjs');" },
    plugins: [{ name: 'loopback-disposable-postgres', setup(builder) {
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: 'database', namespace: 'auth-disposable-postgres' }));
      builder.onLoad({ filter: /.*/, namespace: 'auth-disposable-postgres' }, () => ({ resolveDir: root, contents: databaseStub }));
    } }],
    stdin: { resolveDir: root, contents: `
      import api from './apps/lythaus-public-api/src/worker.ts';
      export default api;
    ` },
  });
  const worker = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'lythaus-public-api-auth-workerd-fixture', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: {
      DB_APP_FRESH: { role: 'lythaus_runtime' },
      ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
      CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
      WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-auth-workerd' },
      AUTH_PASSWORD_PEPPER_V1: randomBytes(32).toString('base64'),
      PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'), PII_HMAC_KEY_V1: hmacKey,
      TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
      JWT_KEY_ID: keyId, JWT_PRIVATE_KEY: await exportPKCS8(privateKey),
      JWT_PUBLIC_JWKS: JSON.stringify({ keys: [publicJwk] }),
      TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET_KEY: 'synthetic-turnstile-secret',
      TURNSTILE_EXPECTED_HOSTNAMES: 'lythaus.co', EMAIL_PROVIDER_MODE: 'cloudflare',
      TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: 'false',
      EMAIL_FROM: 'no-reply@example.invalid',
      EMAIL_VERIFICATION_BASE_URL: 'https://example.invalid/verify?token=',
      EMAIL_PASSWORD_RESET_BASE_URL: 'https://example.invalid/reset?token=',
    },
    serviceBindings: {
      DISPOSABLE_POSTGRES: async request => {
        const input = await request.json();
        const temporary = !input.transactionId;
        let client = databaseClients.get(input.transactionId);
        try {
          if (temporary) {
            assert.equal(input.role, 'lythaus_runtime');
            client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
            await client.connect();
            await client.query("SET statement_timeout='5s'");
            await client.query('SET ROLE lythaus_runtime');
          }
          assert.ok(client);
          if (input.action === 'begin') {
            await client.query('BEGIN');
            const transactionId = String(++transactionSequence);
            databaseClients.set(transactionId, client);
            return Response.json({ transactionId });
          }
          if (input.action === 'query') {
            const result = await client.query(input.text, input.values);
            return Response.json({ rows: result.rows, rowCount: result.rowCount });
          }
          assert.ok(['commit', 'rollback'].includes(input.action));
          await client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
          return Response.json({ completed: true });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
        } finally {
          if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
            databaseClients.delete(input.transactionId);
            await client?.end();
          }
        }
      },
    },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.hostname === 'api.pwnedpasswords.com') {
        counts.screening += 1;
        const prefix = url.pathname.slice('/range/'.length);
        const digest = acceptedPasswordDigests.find(candidate => candidate.slice(0, 5) === prefix);
        assert.ok(digest, 'only a synthetic known password digest may reach the fixture');
        assert.equal(request.method, 'GET');
        assert.equal(request.headers.get('Add-Padding'), 'true');
        assert.equal(request.headers.get('User-Agent'), 'Lythaus-password-screening');
        if (providerModes.screening === 'redirect') return new Response('', { status: 302, headers: { location: 'https://redirect.invalid/range' } });
        if (providerModes.screening === 'malformed') return new Response('<html>synthetic provider error</html>');
        if (providerModes.screening === 'timeout') {
          await new Promise(resolve => setTimeout(resolve, 5100));
          return new Response(`${digest.slice(5)}:0`);
        }
        return new Response(`${digest.slice(5)}:0`);
      }
      if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/siteverify') {
        counts.turnstile += 1;
        assert.equal(request.method, 'POST');
        const input = await request.clone().json();
        assert.equal(input.secret, 'synthetic-turnstile-secret');
        if (providerModes.turnstile === 'redirect') return new Response('', { status: 307, headers: { location: 'https://redirect.invalid/siteverify' } });
        if (providerModes.turnstile === 'http_503') return new Response('', { status: 503 });
        if (providerModes.turnstile === 'malformed') return new Response('<html>synthetic provider error</html>');
        if (providerModes.turnstile === 'wrong_action') return Response.json({ success: true, hostname: 'lythaus.co', action: 'wrong_action' });
        return Response.json({ success: true, hostname: 'lythaus.co', action: input.response });
      }
      counts.denied += 1;
      return new Response(null, { status: 403 });
    },
  }] }));

  async function query(text, values = []) {
    const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await client.query(text, values); }
    finally { await client.end(); }
  }

  return {
    setProviderModes(modes) { Object.assign(providerModes, modes); },
    providerCounts() { return { ...counts }; },
    email: fixtureEmail,
    idempotencyKey: fixtureIdempotencyKey,
    rateLimitIp() { return `${ipPrefix}::ffff`; },
    async request(path, body, options = {}) {
      const ip = options.ip ?? `${ipPrefix}::${(++requestSequence).toString(16)}`;
      const scope = ['/api/auth/email', '/api/auth/email/verify'].includes(path) ? `auth:${path}` : 'public-api';
      rateLimitSubjects.set(`${scope}\u0000${ip}`, { scope, subject: ip });
      if (path === '/api/auth/email' && typeof body?.email === 'string'
        && ['register', 'login', 'resend_verification'].includes(body.mode)) {
        const addressScope = `auth-address:${body.mode}`;
        const addressLookup = hmacLookup(body.email, hmacKey);
        rateLimitSubjects.set(`${addressScope}\u0000${addressLookup}`, { scope: addressScope, subject: addressLookup });
      }
      const headers = new Headers({ 'content-type': 'application/json', 'cf-connecting-ip': ip });
      if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey);
      const response = await worker.dispatchFetch(`https://api.lythaus.test${path}`, {
        method: options.method ?? 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return response;
    },
    async account(email) {
      const lookup = hmacLookup(email, hmacKey);
      return (await query(
        `SELECT u.id, u.status, c.verified_at FROM identity.email_credentials c
          JOIN identity.users u ON u.id=c.user_id WHERE c.email_lookup_hmac=decode($1,'base64')`, [lookup],
      )).rows[0];
    },
    async accountCount(email) {
      const lookup = hmacLookup(email, hmacKey);
      return Number((await query(`SELECT count(*)::int AS count FROM identity.email_credentials WHERE email_lookup_hmac=decode($1,'base64')`, [lookup])).rows[0].count);
    },
    async outboxCount(email) {
      const lookup = hmacLookup(email, hmacKey);
      return Number((await query(
        `SELECT count(*)::int AS count FROM system.transactional_email_outbox o
          JOIN identity.email_credentials c ON c.user_id=o.user_id WHERE c.email_lookup_hmac=decode($1,'base64')`, [lookup],
      )).rows[0].count);
    },
    async challengeCount(userId) {
      return Number((await query(`SELECT count(*)::int AS count FROM identity.email_verification_tokens WHERE user_id=$1`, [userId])).rows[0].count);
    },
    async currentChallengeCount(userId) {
      return Number((await query(
        `SELECT count(*)::int AS count FROM identity.email_verification_tokens
          WHERE user_id=$1 AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at>now()`, [userId],
      )).rows[0].count);
    },
    async sessionCount(userId) {
      return Number((await query(`SELECT count(*)::int AS count FROM identity.auth_sessions WHERE user_id=$1`, [userId])).rows[0].count);
    },
    async idempotencyRecord(scope, key) {
      return (await query(`SELECT response FROM system.idempotency_keys WHERE scope=$1 AND key=$2`, [`auth-intake:${scope}`, key])).rows[0];
    },
    async idempotencyCount(scope, key) {
      return Number((await query(`SELECT count(*)::int AS count FROM system.idempotency_keys WHERE scope=$1 AND key=$2`, [`auth-intake:${scope}`, key])).rows[0].count);
    },
    async authRateLimitWindows(ip) {
      const scope = 'auth:/api/auth/email';
      const subjectHash = createHash('sha256').update(`${scope}:${ip}`).digest('hex');
      const result = await query(
        `SELECT window_started_at, request_count FROM system.rate_limit_windows
          WHERE scope=$1 AND subject_hash=$2 ORDER BY window_started_at`, [scope, subjectHash],
      );
      return result.rows.map(row => ({
        windowStartedAt: new Date(row.window_started_at).getTime(),
        requestCount: Number(row.request_count),
      }));
    },
    async insertChallenge(userId, token, state) {
      const parameters = [uuidv7(), userId, hashAuthToken(token, 'verification')];
      if (state === 'expired') {
        await query(
          `INSERT INTO identity.email_verification_tokens(id,user_id,token_hash,expires_at)
           VALUES($1,$2,decode($3,'base64'),now()-interval '1 minute')`, parameters,
        );
      } else if (state === 'superseded') {
        await query(
          `INSERT INTO identity.email_verification_tokens(id,user_id,token_hash,expires_at,superseded_at)
           VALUES($1,$2,decode($3,'base64'),now()+interval '30 minutes',now())`, parameters,
        );
      } else {
        await query(
          `INSERT INTO identity.email_verification_tokens(id,user_id,token_hash,expires_at)
           VALUES($1,$2,decode($3,'base64'),now()+interval '30 minutes')`, parameters,
        );
      }
    },
    async query(text, values) { return query(text, values); },
    async dispose() {
      let disposalError;
      try { await worker.dispose(); } catch (error) { disposalError = error; }
      const closeResults = await Promise.allSettled([...databaseClients.values()].map(client => client.end()));
      disposalError ??= closeResults.find(result => result.status === 'rejected')?.reason;
      databaseClients.clear();
      try { await cleanupFixtureRows(); } catch (error) { disposalError ??= error; }
      if (disposalError) throw disposalError;
    },
  };

  async function cleanupFixtureRows() {
    const cleanupClient = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
    await cleanupClient.connect();
    try {
      await cleanupClient.query("SET statement_timeout='5s'");
      await cleanupClient.query('BEGIN');
      for (const key of createdIdempotencyKeys) {
        await cleanupClient.query('DELETE FROM system.idempotency_keys WHERE key=$1', [key]);
        const remainingKey = await cleanupClient.query('SELECT count(*)::int AS count FROM system.idempotency_keys WHERE key=$1', [key]);
        assert.equal(Number(remainingKey.rows[0].count), 0, 'fixture-owned idempotency evidence is removed');
      }
      const userIds = new Set();
      for (const email of createdEmails) {
        const lookup = hmacLookup(email, hmacKey);
        const result = await cleanupClient.query(
          `SELECT user_id FROM identity.email_credentials WHERE email_lookup_hmac=decode($1,'base64')
           UNION SELECT user_id FROM identity.contact_emails WHERE email_lookup_hmac=decode($1,'base64')`, [lookup],
        );
        for (const row of result.rows) userIds.add(row.user_id);
      }
      const users = [...userIds];
      if (users.length) {
        await cleanupClient.query(
          `DELETE FROM system.transactional_email_outbox
            WHERE user_id=ANY($1::uuid[]) OR contact_email_user_id=ANY($1::uuid[])`, [users],
        );
        await cleanupClient.query(
          `DELETE FROM trust.user_activity_events
            WHERE user_id=ANY($1::uuid[]) OR actor_user_id=ANY($1::uuid[])`, [users],
        );
        await cleanupClient.query('DELETE FROM system.outbox_events WHERE actor_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query(
          `DELETE FROM identity.account_events
            WHERE user_id=ANY($1::uuid[]) OR actor_id=ANY($1::uuid[])`, [users],
        );
        await cleanupClient.query('DELETE FROM identity.auth_sessions WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.refresh_token_families WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.email_verification_tokens WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.password_reset_tokens WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.provider_links WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.user_entitlements WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM privacy.subject_data_locations WHERE subject_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.email_credentials WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.contact_emails WHERE user_id=ANY($1::uuid[])', [users]);
        await cleanupClient.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [users]);
        const remainingUsers = await cleanupClient.query('SELECT count(*)::int AS count FROM identity.users WHERE id=ANY($1::uuid[])', [users]);
        assert.equal(Number(remainingUsers.rows[0].count), 0, 'fixture-owned synthetic accounts are removed');
      }
      for (const { scope, subject } of rateLimitSubjects.values()) {
        const subjectHash = createHash('sha256').update(`${scope}:${subject}`).digest('hex');
        await cleanupClient.query('DELETE FROM system.rate_limit_windows WHERE scope=$1 AND subject_hash=$2', [scope, subjectHash]);
        const remainingWindow = await cleanupClient.query(
          'SELECT count(*)::int AS count FROM system.rate_limit_windows WHERE scope=$1 AND subject_hash=$2', [scope, subjectHash],
        );
        assert.equal(Number(remainingWindow.rows[0].count), 0, 'fixture-owned rate-limit windows are removed');
      }
      await cleanupClient.query('COMMIT');
    } catch (error) {
      await cleanupClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await cleanupClient.end();
    }
  }
}
