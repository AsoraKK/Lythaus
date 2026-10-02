import assert from 'node:assert/strict';
import pg from 'pg';
import { hashPassword, hashResetToken, randomToken, uuidv7 } from '@lythaus/security';
import { createPasskeyHandler } from '../src/passkey-runtime.ts';
import { issueAuthSession, revokeAllAuthSessions } from '../src/auth-session-runtime.ts';
import { sessionTransportResult } from '../src/auth-session-transport.ts';
import { syntheticAuthenticator } from '../../../packages/security/tests/passkey-fixtures.mjs';

export const origin = 'https://app.lythaus.co';
export const fixturePassword = 'Synthetic passkey fallback 123!';
export const fixturePepper = 'local-synthetic-passkey-pepper';

export async function passkeyFixture(t) {
  const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('Passkey tests require an explicitly local disposable PostgreSQL URL');
  const target = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.startsWith('/lythaus_auth_test')) {
    throw new Error('Passkey tests refuse remote or non-disposable databases');
  }
  const control = new pg.Client({ connectionString, ssl: false });
  await control.connect();
  const userId = uuidv7();
  const otherUserId = uuidv7();
  const passwordHash = hashPassword(fixturePassword, fixturePepper);
  for (const id of [userId, otherUserId]) {
    await control.query('INSERT INTO identity.users (id) VALUES ($1)', [id]);
    await control.query(`INSERT INTO identity.email_credentials
      (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
      VALUES ($1, 'synthetic', decode($2, 'base64'), 'v1', 'v1', $3::jsonb, now())`,
    [id, Buffer.from(id).toString('base64'), JSON.stringify(passwordHash)]);
  }
  const env = { PASSKEYS_ENABLED: 'true', PASSKEY_RP_ID: 'lythaus.co', PASSKEY_ALLOWED_ORIGINS: origin,
    CORS_ALLOWED_ORIGINS: origin, AUTH_PASSWORD_PEPPER_V1: fixturePepper };
  const headers = { origin, 'x-lythaus-auth-transport': 'cookie-v1', 'content-type': 'application/json' };
  const ownerToken = `fixture-owner-${userId}`;
  const otherToken = `fixture-owner-${otherUserId}`;
  const rateLimits = [];
  const deps = {
    principal: async request => {
      const supplied = request.headers.get('authorization');
      const id = supplied === `Bearer ${ownerToken}` ? userId : supplied === `Bearer ${otherToken}` ? otherUserId : undefined;
      if (!id) throw new Error('authentication_required');
      return { userId: id, roles: [], tokenVersion: 1 };
    },
    rateLimit: async (_request, scope, limit, subject) => { rateLimits.push({ scope, limit, subject }); },
    query: (sql, values) => control.query(sql, values),
    transaction: async work => {
      const client = new pg.Client({ connectionString, ssl: false });
      await client.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { await client.end(); }
    },
    issueSession: (client, account) => issueAuthSession({
      loadAccount: async () => account, randomToken, hashRefreshToken: hashResetToken, newId: uuidv7,
      signAccessToken: async () => `synthetic-access-${account.userId}`,
      createRefreshFamilyAndSession: async input => {
        await client.query('INSERT INTO identity.refresh_token_families (id,user_id) VALUES ($1,$2)', [input.familyId, input.userId]);
        await client.query(`INSERT INTO identity.auth_sessions (id,user_id,refresh_family_id,refresh_token_hash,expires_at)
          VALUES ($1,$2,$3,decode($4,'base64'),now()+interval '30 days')`, [input.sessionId,input.userId,input.familyId,input.refreshTokenHash]);
      },
    }, { userId: account.userId }),
    revokeSessions: (client, id) => revokeAllAuthSessions({
      revokeAllSessions: async subjectId => { await client.query('UPDATE identity.auth_sessions SET revoked_at=now() WHERE user_id=$1', [subjectId]); },
      revokeAllRefreshFamilies: async subjectId => { await client.query('UPDATE identity.refresh_token_families SET revoked_at=now() WHERE user_id=$1', [subjectId]); },
      bumpTokenVersion: async subjectId => { await client.query('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1', [subjectId]); },
    }, id),
    response: (request, body, init = {}) => Response.json(body, { ...init, headers: {
      'cache-control': 'no-store', 'access-control-allow-origin': request.headers.get('origin') ?? origin,
      'access-control-allow-credentials': 'true', ...init.headers,
    } }),
    sessionResponse: (request, tokens) => {
      const result = sessionTransportResult(request, env.CORS_ALLOWED_ORIGINS, tokens);
      return deps.response(request, result.body, { headers: result.headers });
    },
  };
  const handler = createPasskeyHandler(env, deps);
  async function call(route, { body, method = 'POST', token = ownerToken, cookie, extraHeaders = {} } = {}) {
    const request = new Request(`https://api.lythaus.co/api/auth/passkeys${route}`, { method,
      headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...extraHeaders },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const response = await handler(request);
    return { response, data: await response.json() };
  }
  async function enroll(authenticator = syntheticAuthenticator(), name = 'Synthetic device') {
    const { data } = await call('/register/options', { body: { name, password: fixturePassword } });
    const result = await call('/register/verify', { body: { challengeId: data.challengeId, credential: authenticator.registration(data.options) } });
    return { authenticator, userHandle: data.options.user.id, id: result.data.id };
  }
  async function login(enrolled, override = {}) {
    const { data, response } = await call('/login/options', { body: {}, token: null });
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const credential = enrolled.authenticator.assertion(data.options, enrolled.userHandle, override);
    return { options: data, cookie, credential,
      verify: () => call('/login/verify', { token: null, cookie, body: { challengeId: data.challengeId, credential } }) };
  }
  t.after(async () => {
    for (const id of [userId, otherUserId]) {
      await control.query('DELETE FROM privacy.subject_data_locations WHERE subject_id=$1', [id]);
      await control.query('DELETE FROM privacy.legal_holds WHERE subject_id=$1', [id]);
      await control.query('DELETE FROM identity.auth_sessions WHERE user_id=$1', [id]);
      await control.query('DELETE FROM identity.refresh_token_families WHERE user_id=$1', [id]);
      await control.query('DELETE FROM identity.account_events WHERE user_id=$1', [id]);
      await control.query('DELETE FROM identity.password_reset_tokens WHERE user_id=$1', [id]);
      await control.query('DELETE FROM identity.email_credentials WHERE user_id=$1', [id]);
      await control.query('DELETE FROM identity.users WHERE id=$1', [id]);
    }
    await control.end();
  });
  return { control, userId, otherUserId, ownerToken, otherToken, env, deps, handler, call, enroll, login, rateLimits, passwordHash };
}

export async function assertNoSession(fixture) {
  const result = await fixture.control.query('SELECT count(*)::int AS count FROM identity.auth_sessions WHERE user_id=$1', [fixture.userId]);
  assert.equal(result.rows[0].count, 0);
}
