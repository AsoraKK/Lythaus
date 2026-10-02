import assert from 'node:assert/strict';
import test from 'node:test';
import { uuidv7 } from '@lythaus/security';
import { createPasskeyHandler } from '../src/passkey-runtime.ts';
import { passkeyFixture, fixturePassword, assertNoSession } from './passkey-test-support.mjs';
import { syntheticAuthenticator } from '../../../packages/security/tests/passkey-fixtures.mjs';
import { erasePasskeyData, exportPasskeyMetadata, purgeExpiredPasskeyChallenges, reconcilePasskeyPrivacyLocations } from '../../../packages/db/src/passkey-privacy.ts';

function privacyTransaction(f, work) {
  return f.deps.transaction(async client => {
    await client.query('SET LOCAL ROLE lythaus_privacy');
    return work(client);
  });
}

test('disabled feature exposes capability false without touching storage', async () => {
  const handler = createPasskeyHandler({}, { response: (_request, body) => Response.json(body) });
  const response = await handler(new Request('https://api.lythaus.co/api/auth/passkeys/capabilities'));
  assert.deepEqual(await response.json(), { enabled: false });
  await assert.rejects(handler(new Request('https://api.lythaus.co/api/auth/passkeys/login/options', { method: 'POST' })), /feature_disabled/);
});

test('enrollment requires password and current verified account; credential list omits key material', async t => {
  const f = await passkeyFixture(t);
  await assert.rejects(f.call('/register/options', { body: { name: 'Test', password: 'wrong' } }), /invalid_credentials/);
  const credential = await f.enroll();
  const { data } = await f.call('/credentials', { method: 'GET' });
  assert.equal(data.credentials[0].id, credential.id);
  assert.equal(data.credentials[0].name, 'Synthetic device');
  for (const key of ['public_key', 'credential_id', 'user_handle', 'sign_count']) assert.equal(key in data.credentials[0], false);
  assert.ok(f.rateLimits.some(row => row.subject === f.userId && row.limit === 6));
});

test('registration rejects replay, stale sessions and a different owner', async t => {
  const f = await passkeyFixture(t);
  const { data } = await f.call('/register/options', { body: { name: 'Device', password: fixturePassword } });
  const body = { challengeId: data.challengeId, credential: syntheticAuthenticator().registration(data.options) };
  await assert.rejects(f.call('/register/verify', { body, token: f.otherToken }), /passkey_invalid/);
  await f.call('/register/verify', { body });
  await assert.rejects(f.call('/register/verify', { body }), /passkey_invalid/);
  await f.control.query('UPDATE identity.users SET token_version=2 WHERE id=$1', [f.userId]);
  await assert.rejects(f.call('/register/options', { body: { name: 'Device', password: fixturePassword } }), /authentication_required/);
});

test('passkey login creates the standard refresh family and HttpOnly cookie without a refresh token in JSON', async t => {
  const f = await passkeyFixture(t);
  const login = await f.login(await f.enroll());
  const { data, response } = await login.verify();
  assert.equal(data.sessionTransport, 'cookie-v1');
  assert.equal(data.refreshToken, undefined);
  assert.match(response.headers.get('set-cookie'), /__Host-lythaus_refresh=.*HttpOnly; Secure; SameSite=Strict/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const sessions = await f.control.query('SELECT count(*)::int AS count FROM identity.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [f.userId]);
  assert.equal(sessions.rows[0].count, 1);
});

test('login challenge is browser-bound and atomically one-use under concurrent replay', async t => {
  const f = await passkeyFixture(t);
  const login = await f.login(await f.enroll());
  await assert.rejects(f.call('/login/verify', { token: null, body: { challengeId: login.options.challengeId, credential: login.credential } }), /passkey_invalid/);
  await assert.rejects(f.call('/login/verify', { token: null, cookie: '__Host-lythaus_passkey=' + '0'.repeat(64), body: { challengeId: login.options.challengeId, credential: login.credential } }), /passkey_invalid/);
  const results = await Promise.allSettled([login.verify(), login.verify()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.message === 'passkey_invalid').length, 1);
});

test('expired challenges and missing UV fail without creating a session; failed verification still consumes the challenge', async t => {
  const f = await passkeyFixture(t);
  const credential = await f.enroll();
  const expired = await f.login(credential);
  await f.control.query(`UPDATE identity.passkey_challenges SET created_at=now()-interval '10 minutes', expires_at=now()-interval '5 minutes' WHERE id=$1`, [expired.options.challengeId]);
  await assert.rejects(expired.verify(), /passkey_invalid/);
  const invalid = await f.login(credential, { uv: false });
  await assert.rejects(invalid.verify(), /passkey_invalid/);
  const state = await f.control.query('SELECT consumed_at IS NOT NULL AS consumed FROM identity.passkey_challenges WHERE id=$1', [invalid.options.challengeId]);
  assert.equal(state.rows[0].consumed, true);
  await assert.rejects(invalid.verify(), /passkey_invalid/);
  await assertNoSession(f);
});

for (const [name, override] of [['malicious origin', { origin: 'https://evil.test' }], ['wrong RP', { rpId: 'evil.test' }], ['wrong owner handle', {}]]) {
  test(`login rejects ${name} before session creation`, async t => {
    const f = await passkeyFixture(t);
    const credential = await f.enroll();
    if (name === 'wrong owner handle') credential.userHandle = Buffer.from('other account').toString('base64url');
    const login = await f.login(credential, override);
    await assert.rejects(login.verify(), /passkey_invalid/);
    await assertNoSession(f);
  });
}

test('suspended and unverified accounts cannot use passkeys', async t => {
  const f = await passkeyFixture(t);
  const credential = await f.enroll();
  await f.control.query(`UPDATE identity.users SET status='suspended' WHERE id=$1`, [f.userId]);
  await assert.rejects((await f.login(credential)).verify(), /authentication_required/);
  await f.control.query(`UPDATE identity.users SET status='active' WHERE id=$1`, [f.userId]);
  await f.control.query('UPDATE identity.email_credentials SET verified_at=NULL WHERE user_id=$1', [f.userId]);
  await assert.rejects((await f.login(credential)).verify(), /authentication_required/);
  await assertNoSession(f);
});

test('maintenance is owner-bound and idempotent across two passkeys and authenticator method evidence', async t => {
  const f = await passkeyFixture(t);
  const first = await f.enroll();
  const second = await f.enroll();
  for (const credential of [first, second]) {
    const { data } = await f.call('/maintenance/options', { body: {} });
    const body = { challengeId: data.challengeId, credential: credential.authenticator.assertion(data.options, credential.userHandle) };
    await assert.rejects(f.call('/maintenance/verify', { body, token: f.otherToken }), /passkey_invalid/);
    assert.equal((await f.call('/maintenance/verify', { body })).data.points, 0);
    await assert.rejects(f.call('/maintenance/verify', { body }), /passkey_invalid/);
  }
  const rows = await f.control.query(`SELECT metadata FROM identity.account_events WHERE user_id=$1 AND event_type='security.strong_auth_evidence'`, [f.userId]);
  assert.equal(rows.rowCount, 2);
  const maintenance = rows.rows.find(row => row.metadata.actionKey === 'security.strong_auth_maintenance').metadata;
  const duplicate = await f.control.query(`INSERT INTO identity.account_events(id,user_id,event_type,metadata) VALUES($1,$2,'security.strong_auth_evidence',$3::jsonb)
    ON CONFLICT (user_id,(metadata->>'policyVersion'),(metadata->>'sourceKey')) WHERE event_type='security.strong_auth_evidence' DO NOTHING`, [uuidv7(), f.userId, JSON.stringify({ ...maintenance, method: 'authenticator' })]);
  assert.equal(duplicate.rowCount, 0);
});

test('naming and removal enforce ownership; removal needs password and revokes all sessions while retaining email fallback', async t => {
  const f = await passkeyFixture(t);
  const credential = await f.enroll();
  await (await f.login(credential)).verify();
  await assert.rejects(f.call(`/credentials/${credential.id}`, { method: 'PATCH', token: f.otherToken, body: { name: 'Stolen' } }), /passkey_invalid/);
  await f.call(`/credentials/${credential.id}`, { method: 'PATCH', body: { name: 'Renamed device' } });
  assert.equal((await f.call('/credentials', { method: 'GET' })).data.credentials[0].name, 'Renamed device');
  await assert.rejects(f.call(`/credentials/${credential.id}/revoke`, { body: { password: 'wrong' } }), /invalid_credentials/);
  await f.call(`/credentials/${credential.id}/revoke`, { body: { password: fixturePassword } });
  const active = await f.control.query('SELECT count(*)::int AS count FROM identity.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [f.userId]);
  assert.equal(active.rows[0].count, 0);
  const email = await f.control.query('SELECT password_hash, verified_at FROM identity.email_credentials WHERE user_id=$1', [f.userId]);
  assert.deepEqual(email.rows[0].password_hash, f.passwordHash);
  assert.ok(email.rows[0].verified_at);
  await assert.rejects((await f.login(credential)).verify(), /passkey_invalid/);
});

test('password recovery revokes credentials and pending ceremonies even if the runtime feature is disabled', async t => {
  const f = await passkeyFixture(t);
  const credential = await f.enroll();
  const login = await f.login(credential);
  const id = uuidv7();
  await f.control.query(`INSERT INTO identity.password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,decode($3,'base64'),now()+interval '10 minutes')`, [id,f.userId,Buffer.from(id).toString('base64')]);
  await f.control.query('UPDATE identity.password_reset_tokens SET consumed_at=now() WHERE id=$1', [id]);
  await assert.rejects(login.verify(), /passkey_invalid/);
  assert.equal((await f.call('/credentials', { method: 'GET' })).data.credentials.length, 0);
});

test('email credential deletion cascades passkey data for privacy cleanup', async t => {
  const f = await passkeyFixture(t);
  await f.enroll();
  await f.call('/maintenance/options', { body: {} });
  await f.control.query('DELETE FROM identity.email_credentials WHERE user_id=$1', [f.userId]);
  for (const table of ['passkey_subjects','passkey_credentials','passkey_challenges']) {
    assert.equal((await f.control.query(`SELECT count(*)::int AS count FROM identity.${table} WHERE user_id=$1`, [f.userId])).rows[0].count, 0);
  }
});

test('least-privilege runtime role can complete the lifecycle and cannot run DDL', async t => {
  const f = await passkeyFixture(t);
  const runTransaction = f.deps.transaction;
  f.deps.transaction = work => runTransaction(async client => {
    await client.query('SET LOCAL ROLE lythaus_runtime');
    return work(client);
  });
  f.deps.query = (sql, values) => f.deps.transaction(client => client.query(sql, values));
  const credential = await f.enroll();
  await (await f.login(credential)).verify();
  await f.call(`/credentials/${credential.id}/revoke`, { body: { password: fixturePassword } });
  await assert.rejects(f.deps.transaction(client => client.query('DELETE FROM identity.passkey_challenges WHERE false')), /permission denied/);
  await assert.rejects(f.deps.transaction(client => client.query('CREATE TABLE identity.passkey_forbidden_fixture (id uuid)')), /permission denied/);
});

test('removing and adding a new credential never repeats the one-time setup evidence', async t => {
  const f = await passkeyFixture(t);
  const first = await f.enroll();
  await f.call(`/credentials/${first.id}/revoke`, { body: { password: fixturePassword } });
  const currentPrincipal = f.deps.principal;
  const newToken = `${f.ownerToken}-new-session`;
  f.deps.principal = async request => request.headers.get('authorization') === `Bearer ${newToken}`
    ? { userId: f.userId, tokenVersion: 2, roles: [] } : currentPrincipal(request);
  const { data } = await f.call('/register/options', { token: newToken, body: { name: 'New synthetic device', password: fixturePassword } });
  await f.call('/register/verify', { token: newToken, body: { challengeId: data.challengeId, credential: syntheticAuthenticator().registration(data.options) } });
  const rows = await f.control.query(`SELECT metadata FROM identity.account_events WHERE user_id=$1 AND event_type='security.strong_auth_evidence'`, [f.userId]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].metadata.points, 0);
});

test('disabled enrollment does not strand privacy metadata and restricted roles cannot export authentication material', async t => {
  const f = await passkeyFixture(t);
  const first = await f.enroll();
  await f.enroll(syntheticAuthenticator(), 'Second synthetic passkey');
  await f.control.query('UPDATE identity.passkey_credentials SET revoked_at=now() WHERE id=$1', [first.id]);
  f.env.PASSKEYS_ENABLED = 'false';
  const rows = await privacyTransaction(f, client => exportPasskeyMetadata(client, f.userId));
  assert.equal(rows.length, 2);
  assert.ok(rows.some(row => row.revokedAt));
  assert.equal((await privacyTransaction(f, client => exportPasskeyMetadata(client, f.otherUserId))).length, 0);
  for (const row of rows) for (const key of ['public_key','credential_id','user_handle','binding_hash','sign_count']) assert.equal(key in row, false);
  for (const sql of [
    'SELECT public_key, credential_id FROM identity.passkey_credentials',
    'SELECT user_handle FROM identity.passkey_subjects',
    'SELECT binding_hash, challenge FROM identity.passkey_challenges',
  ]) await assert.rejects(privacyTransaction(f, client => client.query(sql)), /permission denied/);
});

test('privacy inventory includes all owned passkey stores, respects holds and is retry-safe', async t => {
  const f = await passkeyFixture(t);
  await f.enroll();
  await f.call('/maintenance/options', { body: {} });
  await f.control.query('INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,$3)', [uuidv7(), f.userId, 'Synthetic fixture hold']);
  await privacyTransaction(f, async client => {
    await client.query('SELECT privacy.reconcile_subject_data_locations($1)', [f.userId]);
    await reconcilePasskeyPrivacyLocations(client, f.userId);
  });
  const before = await f.control.query(`SELECT resource_reference, entity_id, legal_hold_state FROM privacy.subject_data_locations
    WHERE subject_id=$1 AND resource_reference LIKE 'identity.passkey_%' ORDER BY resource_reference, entity_id`, [f.userId]);
  assert.equal(new Set(before.rows.map(row => row.resource_reference)).size, 3);
  assert.ok(before.rows.every(row => row.legal_hold_state === 'active'));
  await privacyTransaction(f, client => reconcilePasskeyPrivacyLocations(client, f.userId));
  const after = await f.control.query(`SELECT resource_reference, entity_id, legal_hold_state FROM privacy.subject_data_locations
    WHERE subject_id=$1 AND resource_reference LIKE 'identity.passkey_%' ORDER BY resource_reference, entity_id`, [f.userId]);
  assert.deepEqual(after.rows, before.rows);
});

test('privacy erasure requires a locked account without a hold and removes every owned passkey store', async t => {
  const f = await passkeyFixture(t);
  await f.enroll();
  await f.call('/maintenance/options', { body: {} });
  const otherOptions = (await f.call('/register/options', { token: f.otherToken, body: { name: 'Other owner', password: fixturePassword } })).data;
  await f.call('/register/verify', { token: f.otherToken, body: { challengeId: otherOptions.challengeId, credential: syntheticAuthenticator().registration(otherOptions.options) } });
  await privacyTransaction(f, client => reconcilePasskeyPrivacyLocations(client, f.otherUserId));
  await privacyTransaction(f, client => reconcilePasskeyPrivacyLocations(client, f.userId));
  await assert.rejects(privacyTransaction(f, client => erasePasskeyData(client, f.userId)), /passkey_erasure_blocked/);
  await f.control.query("UPDATE identity.users SET status='locked' WHERE id=$1", [f.userId]);
  await f.control.query('INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,$3)', [uuidv7(), f.userId, 'Synthetic erasure hold']);
  await assert.rejects(privacyTransaction(f, client => erasePasskeyData(client, f.userId)), /passkey_erasure_blocked/);
  assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.passkey_credentials WHERE user_id=$1', [f.userId])).rows[0].count, 1);
  await f.control.query('UPDATE privacy.legal_holds SET active=false WHERE subject_id=$1', [f.userId]);
  await privacyTransaction(f, client => erasePasskeyData(client, f.userId));
  await privacyTransaction(f, client => erasePasskeyData(client, f.userId));
  for (const table of ['passkey_subjects','passkey_credentials','passkey_challenges']) {
    assert.equal((await f.control.query(`SELECT count(*)::int AS count FROM identity.${table} WHERE user_id=$1`, [f.userId])).rows[0].count, 0);
  }
  assert.equal((await f.control.query(`SELECT count(*)::int AS count FROM privacy.subject_data_locations
    WHERE subject_id=$1 AND resource_reference LIKE 'identity.passkey_%' AND deletion_state<>'deleted'`, [f.userId])).rows[0].count, 0);
  assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.email_credentials WHERE user_id=$1', [f.userId])).rows[0].count, 1);
  for (const table of ['passkey_subjects','passkey_credentials','passkey_challenges']) {
    assert.equal((await f.control.query(`SELECT count(*)::int AS count FROM identity.${table} WHERE user_id=$1`, [f.otherUserId])).rows[0].count, 1);
  }
  assert.equal((await f.control.query(`SELECT count(*)::int AS count FROM privacy.subject_data_locations
    WHERE subject_id=$1 AND resource_reference LIKE 'identity.passkey_%' AND deletion_state='present'`, [f.otherUserId])).rows[0].count, 3);
});

test('disabled feature still purges expired anonymous challenges while retaining held and recent owner challenges', async t => {
  const f = await passkeyFixture(t);
  await f.enroll();
  const anonymous = (await f.call('/login/options', { body: {}, token: null })).data.challengeId;
  const recent = (await f.call('/maintenance/options', { body: {} })).data.challengeId;
  await f.control.query(`UPDATE identity.passkey_challenges SET created_at=now()-interval '2 days', expires_at=now()-interval '2 days'+interval '5 minutes'
    WHERE (user_id=$1 AND id<>$3) OR id=$2`, [f.userId, anonymous, recent]);
  await f.control.query('INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,$3)', [uuidv7(), f.userId, 'Synthetic retention hold']);
  f.env.PASSKEYS_ENABLED = 'false';
  assert.equal(await privacyTransaction(f, purgeExpiredPasskeyChallenges), 1);
  assert.equal((await f.control.query('SELECT count(*)::int AS count FROM identity.passkey_challenges WHERE user_id=$1', [f.userId])).rows[0].count, 2);
  await f.control.query('UPDATE privacy.legal_holds SET active=false WHERE subject_id=$1', [f.userId]);
  assert.equal(await privacyTransaction(f, purgeExpiredPasskeyChallenges), 1);
  assert.equal((await f.control.query('SELECT id FROM identity.passkey_challenges WHERE user_id=$1', [f.userId])).rows[0].id, recent);
});
