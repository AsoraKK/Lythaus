import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import * as database from '@lythaus/db';
import { signAccessToken, uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Profile tests require an explicitly local disposable PostgreSQL database');
}
async function withClient(work, role) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query("SET statement_timeout='5s'");
    if (role) {
      assert.equal(role, 'lythaus_runtime');
      await client.query('SET ROLE lythaus_runtime');
    }
    return await work(client);
  } finally { await client.end(); }
}
const sql = (text, values) => withClient(client => client.query(text, values));
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => withClient(client => client.query(text, values), binding.role),
  transaction: (binding, work) => withClient(async client => {
    await client.query('BEGIN');
    try { const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  }, binding.role),
} });
const { default: worker } = await import('../src/index.ts');
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const keyId = 'synthetic-local-profile-test';
const privateKeyPem = await exportPKCS8(privateKey);
const env = {
  ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
  CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test', DB_APP_FRESH: { role: 'lythaus_runtime' },
  JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
};
async function owner(displayName = '') {
  const id = uuidv7();
  await sql("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active',$2)", [id, displayName]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}
async function call(actor, method, body, path = '/api/users/me', key) {
  return worker.fetch(new Request('https://api.lythaus.test' + path, {
    method, headers: { ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env, { waitUntil() {} });
}

for (const input of [{ bio: 'A partial biography' }, { displayName: 'Zoë O’Connor' }]) {
  test(`partial ${Object.keys(input)[0]} persists and remains private during review`, async () => {
    const actor = await owner();
    const saved = await call(actor, 'PATCH', input);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.match(saved.headers.get('cache-control'), /private.*no-store/);
    const body = await saved.json();
    assert.equal(body.user.moderationState, 'under_review');
    assert.equal(body.user.publicVisibility, true);
    assert.equal(body.user.displayName, input.displayName ?? '');
    assert.equal(body.user.bio, input.bio ?? '');
    assert.ok(!('accountabilityName' in body.user));
    const restored = await call(actor, 'GET');
    assert.deepEqual(await restored.json(), body);
    const publicResponse = await call(null, 'GET', undefined, '/api/users/' + actor.id);
    assert.notEqual(publicResponse.status, 200);
    assert.ok(!(await publicResponse.text()).includes(Object.values(input)[0]));
    const events = await sql("SELECT payload FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.profile.updated'", [actor.id]);
    assert.equal(events.rowCount, 1);
    assert.deepEqual(events.rows[0].payload.changedFields, Object.keys(input));
  });
}

for (const moderationState of ['under_review', 'blocked', 'allowed']) {
  test(`private owner sees ${moderationState}; public reads obey review and visibility`, async () => {
    const actor = await owner('Saved owner name');
    await sql('INSERT INTO social.profiles(user_id,bio,moderation_state) VALUES($1,$2,$3)', [actor.id, 'Saved owner bio', moderationState]);
    const own = await call(actor, 'GET');
    assert.equal(own.status, 200);
    assert.equal((await own.json()).user.moderationState, moderationState);
    const publicResponse = await call(null, 'GET', undefined, '/api/users/' + actor.id);
    if (moderationState === 'allowed') {
      assert.equal(publicResponse.status, 200);
      const publicUser = (await publicResponse.json()).user;
      for (const field of ['moderationState', 'publicVisibility', 'subscriptionTier', 'accountabilityIdentityDeclared']) assert.ok(!(field in publicUser));
    } else assert.notEqual(publicResponse.status, 200);
    await sql('UPDATE social.profiles SET public_visibility=false WHERE user_id=$1', [actor.id]);
    assert.notEqual((await call(null, 'GET', undefined, '/api/users/' + actor.id)).status, 200);
  });
}

test('no-op saves and idempotent retries do not queue duplicate reviews', async () => {
  const actor = await owner('Ada');
  const key = uuidv7();
  assert.equal((await call(actor, 'PATCH', { bio: 'Saved once' }, undefined, key)).status, 200);
  assert.equal((await call(actor, 'PATCH', { bio: 'Saved once' }, undefined, key)).status, 200);
  assert.equal((await call(actor, 'PATCH', { displayName: 'Ada', bio: 'Saved once' })).status, 200);
  const events = await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.profile.updated'", [actor.id]);
  assert.equal(events.rowCount, 1);
});

test('clearing a bio leaves the saved name unchanged and returns to review', async () => {
  const actor = await owner('李小龍');
  await call(actor, 'PATCH', { bio: 'Before clearing' });
  const response = await call(actor, 'PATCH', { bio: '' });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.displayName, '李小龍');
  assert.equal(user.bio, '');
  assert.equal(user.moderationState, 'under_review');
});

test('unsafe names, malformed patches and passwords are rejected without persistence', async () => {
  const actor = await owner('Original name');
  for (const body of [{ displayName: 'f\u200buck' }, { displayName: 'ＦＵＣＫ' }, { displayName: null },
    { accountabilityName: 'asshole' }, { bio: null }, {}, [], { password: 'synthetic-never-forwarded' }]) {
    const response = await call(actor, 'PATCH', body);
    assert.equal(response.status, 400, await response.clone().text());
  }
  assert.equal((await sql('SELECT display_name FROM identity.users WHERE id=$1', [actor.id])).rows[0].display_name, 'Original name');
  assert.equal((await sql('SELECT id FROM system.outbox_events WHERE aggregate_id=$1', [actor.id])).rowCount, 0);
});

test('owner profile requires the current session and cannot target another owner', async () => {
  const actor = await owner('First owner');
  const other = await owner('Second owner');
  assert.equal((await call(null, 'GET')).status, 401);
  const response = await call(actor, 'PATCH', { displayName: 'New first owner', userId: other.id });
  assert.equal(response.status, 400);
  await sql('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1', [actor.id]);
  assert.equal((await call(actor, 'PATCH', { bio: 'Stale save' })).status, 401);
  assert.equal((await call(actor, 'GET')).status, 401);
});
