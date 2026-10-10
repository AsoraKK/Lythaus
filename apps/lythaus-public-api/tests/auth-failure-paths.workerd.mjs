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
if (!['localhost', '127.0.0.1', '::1'].includes(databaseTarget.hostname)
  || !databaseTarget.pathname.startsWith('/lythaus_auth_test')) {
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

describe('Public API authentication failures in native Workerd', { timeout: 90_000 }, () => {
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
      const email = `failure-${uuidv7()}@example.invalid`;
      const key = `fixture-${uuidv7()}`;
      fixture.setProviderModes({ screening: scenario.screening, turnstile: scenario.turnstile ?? 'ok' });
      const before = fixture.providerCounts();
      const response = await fixture.request('/api/auth/email', {
        mode: 'register', email, password, turnstileToken: 'account_signup',
      }, { idempotencyKey: key });
      const body = await response.json();
      assert.equal(response.status, scenario.expectedStatus, scenario.name);
      assert.equal(body.error, scenario.expected, scenario.name);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
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
        assert.equal(replay.status, 409);
        assert.equal((await replay.json()).error, 'idempotency_outcome_unknown');
        assert.deepEqual(fixture.providerCounts(), beforeReplay, 'ambiguous retry must not call either provider again');
        assert.equal(await fixture.accountCount(email), 0);
      }
    }
  });

  test('signup replay, resend replay, stale proof, verification replay, and sign-in retain contract boundaries', async () => {
    fixture.setProviderModes({ screening: 'ok', turnstile: 'ok' });
    const email = `journey-${uuidv7()}@example.invalid`;
    const signupKey = `signup-${uuidv7()}`;
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
      mode: 'login', email: `unknown-${uuidv7()}@example.invalid`, password,
    });
    const wrongPassword = await fixture.request('/api/auth/email', { mode: 'login', email, password: 'synthetic wrong password' });
    assert.equal(nonexistent.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.equal((await nonexistent.json()).error, 'invalid_credentials');
    assert.equal((await wrongPassword.json()).error, 'invalid_credentials');
    const pendingPassword = await fixture.request('/api/auth/email', { mode: 'login', email, password });
    assert.equal(pendingPassword.status, 400);
    assert.equal((await pendingPassword.json()).error, 'email_verification_required');
    assert.equal(await fixture.sessionCount(user.id), 0, 'failed and pending sign-ins must not create sessions');

    await fixture.query(
      `UPDATE identity.email_verification_tokens SET created_at=now()-interval '31 seconds'
        WHERE user_id=$1 AND consumed_at IS NULL AND superseded_at IS NULL`, [user.id],
    );
    const resendKey = `resend-${uuidv7()}`;
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
      assert.equal(stale.status, 400);
      assert.equal((await stale.json()).error, 'verification_token_invalid');
      assert.equal((await fixture.account(email)).verified_at, null, 'stale evidence cannot verify or replace the credential');
    }

    const verified = await fixture.request('/api/auth/email/verify', { token: validToken, password: ownerPassword });
    assert.equal(verified.status, 200);
    assert.deepEqual(await verified.json(), { state: 'verified' });
    assert.ok((await fixture.account(email)).verified_at);
    const replayedProof = await fixture.request('/api/auth/email/verify', { token: validToken, password: ownerPassword });
    assert.equal(replayedProof.status, 400);
    assert.equal((await replayedProof.json()).error, 'verification_token_invalid');
    assert.equal(await fixture.sessionCount(user.id), 0, 'verification does not silently create an authenticated session');

    const previousPassword = await fixture.request('/api/auth/email', { mode: 'login', email, password });
    assert.equal(previousPassword.status, 401);
    assert.equal((await previousPassword.json()).error, 'invalid_credentials');

    const loginHeaders = { idempotencyKey: `login-${uuidv7()}` };
    const firstLogin = await fixture.request('/api/auth/email', { mode: 'login', email, password: ownerPassword }, loginHeaders);
    const secondLogin = await fixture.request('/api/auth/email', { mode: 'login', email, password: ownerPassword }, loginHeaders);
    assert.equal(firstLogin.status, 200);
    assert.equal(secondLogin.status, 200);
    const firstSession = await firstLogin.json();
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

  test('the Public Worker still rejects the eleventh auth request from one IP window', async () => {
    const ip = fixture.rateLimitIp();
    for (let index = 0; index < 10; index += 1) {
      const response = await fixture.request('/api/auth/email', {
        mode: 'login', email: 'not-an-email', password: 'synthetic login input',
      }, { ip });
      assert.equal(response.status, 400, `request ${index + 1} remains inside the allowed window`);
      assert.equal((await response.json()).error, 'invalid_email');
    }
    const limited = await fixture.request('/api/auth/email', {
      mode: 'login', email: 'not-an-email', password: 'synthetic login input',
    }, { ip });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, 'rate_limit_exceeded');
  });
});

async function createFixture() {
  const databaseClients = new Map();
  let transactionSequence = 0;
  let requestSequence = 0;
  const ipNonce = randomBytes(8).toString('hex');
  const providerModes = { screening: 'ok', turnstile: 'ok' };
  const counts = { screening: 0, turnstile: 0, denied: 0 };
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
    rateLimitIp() { return `2001:db8:${ipNonce.slice(0, 4)}:${ipNonce.slice(4, 8)}::ffff`; },
    async request(path, body, options = {}) {
      const ip = options.ip ?? `2001:db8:${ipNonce.slice(0, 4)}:${ipNonce.slice(4, 8)}::${++requestSequence}`;
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
      await worker.dispose();
      await Promise.all([...databaseClients.values()].map(client => client.end()));
      databaseClients.clear();
    },
  };
}
