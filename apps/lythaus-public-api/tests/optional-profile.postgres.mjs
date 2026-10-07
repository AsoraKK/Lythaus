import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { presentationPreferencesIdentityExportQuery, resetPresentationPreferences, validatedPresentationPreferencesIdentity } from '../../lythaus-jobs/src/runtime-policy.ts';
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

test('proposed preferences schema supports private versioned saves, retries, grants and rollback', { timeout: 90000 }, async () => {
  const actor = await owner('Preference owner');
  const other = await owner('Other preference owner');
  const choices = { presentationPreferences: { leftHandedMode: true, horizontalSwipeEnabled: false, expectedVersion: 1 } };
  assert.equal((await (await call(actor, 'GET')).json()).user.presentationPreferences, null);
  const unavailable = await call(actor, 'PATCH', choices);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'presentation_preferences_unavailable');
  const proposal = new URL('../../../database/planetscale/proposals/profile-presentation-preferences.sql', import.meta.url);
  const rollback = new URL('../../../database/planetscale/proposals/profile-presentation-preferences.rollback.sql', import.meta.url);
  await sql(readFileSync(proposal, 'utf8'));
  try {
    await sql("INSERT INTO social.profiles(user_id,bio,moderation_state,trust_passport_visibility) VALUES($1,'Existing biography','allowed','public_expanded')", [actor.id]);
    const key = uuidv7();
    const saved = await call(actor, 'PATCH', choices, undefined, key);
    assert.equal(saved.status, 200, await saved.clone().text());
    const receipt = await saved.json();
    assert.deepEqual(receipt.user.presentationPreferences, { leftHandedMode: true, horizontalSwipeEnabled: false, version: 2 });
    assert.equal(receipt.user.moderationState, 'allowed');
    assert.equal(receipt.user.trustPassportVisibility, 'public_expanded');
    assert.equal(receipt.user.bio, 'Existing biography');
    const replay = await call(actor, 'PATCH', choices, undefined, key);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), receipt);
    assert.deepEqual((await (await call(actor, 'GET')).json()).user.presentationPreferences, receipt.user.presentationPreferences);
    const conflict = await call(actor, 'PATCH', choices, undefined, uuidv7());
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, 'presentation_preferences_conflict');
    assert.deepEqual((await (await call(other, 'GET')).json()).user.presentationPreferences,
      { leftHandedMode: false, horizontalSwipeEnabled: true, version: 1 });
    for (const reader of [null, other, actor]) {
      const publicResponse = await call(reader, 'GET', undefined, '/api/users/' + actor.id);
      assert.equal(publicResponse.status, 200);
      assert.equal('presentationPreferences' in (await publicResponse.json()).user, false);
    }
    assert.equal((await call(null, 'PATCH', choices)).status, 401);
    assert.equal((await call(actor, 'PATCH', { ...choices, userId: other.id })).status, 400);
    assert.equal((await sql('SELECT id FROM system.outbox_events WHERE aggregate_id=$1', [actor.id])).rowCount, 0);
    const concurrent = await Promise.all([false, true].map(leftHandedMode => call(actor, 'PATCH', {
      presentationPreferences: { leftHandedMode, horizontalSwipeEnabled: true, expectedVersion: 2 },
    }, undefined, uuidv7())));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    assert.equal((await (await call(actor, 'GET')).json()).user.presentationPreferences.version, 3);
    await withClient(async client => {
      await client.query('SET ROLE lythaus_privacy');
      const exported = await client.query(`SELECT to_jsonb(u)->'presentation_left_handed' AS left,
        to_jsonb(u)->'presentation_profile_swipe' AS swipe FROM identity.users u WHERE id=$1`, [actor.id]);
      assert.equal(exported.rowCount, 1);
      await client.query('SELECT privacy.reconcile_subject_data_locations($1)', [actor.id]);
      const locator = await client.query(`SELECT * FROM privacy.subject_data_locations
        WHERE subject_id=$1 AND resource_reference='identity.users'`, [actor.id]);
      assert.equal(locator.rowCount, 1);
    });

    const runtime = await nativePostgresProfileFixture(connectionString, {
      ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS, JWT_PUBLIC_JWKS: env.JWT_PUBLIC_JWKS,
    });
    try {
      const nativeRead = await runtime.dispatchFetch('https://api.lythaus.test/api/users/me', {
        headers: { Authorization: 'Bearer ' + actor.token },
      });
      assert.equal(nativeRead.status, 200, await nativeRead.clone().text());
      assert.equal(nativeRead.headers.get('cache-control'), 'private, no-store');
      assert.equal((await nativeRead.json()).user.presentationPreferences.version, 3);
      const nativeSave = await runtime.dispatchFetch('https://api.lythaus.test/api/users/me', {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + actor.token,
          'Content-Type': 'application/json', 'Idempotency-Key': uuidv7() },
        body: JSON.stringify({ presentationPreferences: {
          leftHandedMode: true, horizontalSwipeEnabled: false, expectedVersion: 3,
        } }),
      });
      assert.equal(nativeSave.status, 200, await nativeSave.clone().text());
      assert.deepEqual((await nativeSave.json()).user.presentationPreferences,
        { leftHandedMode: true, horizontalSwipeEnabled: false, version: 4 });
      assert.equal((await runtime.dispatchFetch('https://api.lythaus.test/api/users/me')).status, 401);
      const publicRead = await runtime.dispatchFetch('https://api.lythaus.test/api/users/' + actor.id);
      assert.equal('presentationPreferences' in (await publicRead.json()).user, false);
      const exportResponse = await runtime.dispatchFetch('https://api.lythaus.test/fixture/export?subject=' + actor.id + '&request=' + uuidv7());
      assert.equal(exportResponse.status, 200, await exportResponse.clone().text());
      assert.deepEqual((await exportResponse.json()).presentation_preferences,
        { leftHandedMode: true, horizontalSwipeEnabled: false, version: 4 });
      const erased = await runtime.dispatchFetch('https://api.lythaus.test/fixture/reset-preferences?subject=' + actor.id);
      assert.equal(erased.status, 200, await erased.clone().text());
      const erasedRow = (await sql(`SELECT status, presentation_left_handed, presentation_profile_swipe,
        presentation_preferences_version FROM identity.users WHERE id=$1`, [actor.id])).rows[0];
      assert.deepEqual(erasedRow, { status: 'active', presentation_left_handed: false,
        presentation_profile_swipe: true, presentation_preferences_version: 1 });
      assert.equal((await (await call(other, 'GET')).json()).user.presentationPreferences.version, 1);
    } finally { await runtime.dispose(); }
  } finally { await sql(readFileSync(rollback, 'utf8')); }
  assert.equal((await (await call(other, 'GET')).json()).user.presentationPreferences, null);
  assert.equal((await call(other, 'PATCH', choices)).status, 503);
});

test('privacy rejects partial columns, wrong types, nullable storage and invalid revisions without resetting retained choices', async t => {
  const actor = await owner('Synthetic privacy boundary');
  const runtime = await nativePostgresProfileFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS, JWT_PUBLIC_JWKS: env.JWT_PUBLIC_JWKS,
  });
  t.after(() => runtime.dispose());
  const readPrivate = async () => withClient(async client => {
    await client.query('SET ROLE lythaus_privacy');
    return client.query(presentationPreferencesIdentityExportQuery, [actor.id]);
  });
  const resetPrivate = async () => withClient(async client => {
    await client.query('SET ROLE lythaus_privacy');
    await client.query('BEGIN');
    try {
      const reset = await resetPresentationPreferences(client, actor.id);
      await client.query('COMMIT');
      return reset;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  const absent = await readPrivate();
  assert.equal(absent.rows[0].presentation_preferences_storage_state, 'absent');
  assert.equal(validatedPresentationPreferencesIdentity(absent.rows[0]).presentation_preferences, null);
  assert.equal(await resetPrivate(), false);
  const nativeAbsent = await runtime.dispatchFetch('https://api.lythaus.test/fixture/export?subject=' + actor.id);
  assert.equal(nativeAbsent.status, 200);
  assert.equal((await nativeAbsent.json()).presentation_preferences, null);
  const scenarios = [
    { name: 'one stored choice', columns: 'presentation_left_handed boolean NOT NULL DEFAULT true' },
    { name: 'two stored choices', columns: 'presentation_left_handed boolean NOT NULL DEFAULT true, presentation_profile_swipe boolean NOT NULL DEFAULT false' },
    { name: 'wrong boolean type', columns: "presentation_left_handed text NOT NULL DEFAULT 'true', presentation_profile_swipe boolean NOT NULL DEFAULT false, presentation_preferences_version integer NOT NULL DEFAULT 1" },
    { name: 'fractional revision type', columns: 'presentation_left_handed boolean NOT NULL DEFAULT true, presentation_profile_swipe boolean NOT NULL DEFAULT false, presentation_preferences_version numeric NOT NULL DEFAULT 1.5' },
    { name: 'nullable boolean definition', columns: 'presentation_left_handed boolean DEFAULT true, presentation_profile_swipe boolean NOT NULL DEFAULT false, presentation_preferences_version integer NOT NULL DEFAULT 1' },
    { name: 'invalid zero revision', columns: 'presentation_left_handed boolean NOT NULL DEFAULT true, presentation_profile_swipe boolean NOT NULL DEFAULT false, presentation_preferences_version integer NOT NULL DEFAULT 0' },
    { name: 'null stored choice', columns: 'presentation_left_handed boolean, presentation_profile_swipe boolean NOT NULL DEFAULT false, presentation_preferences_version integer NOT NULL DEFAULT 1' },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    await sql('ALTER TABLE identity.users ADD COLUMN ' + scenario.columns.replaceAll(', ', ', ADD COLUMN '));
    try {
      const before = (await sql('SELECT to_jsonb(u) AS value FROM identity.users u WHERE id=$1', [actor.id])).rows[0].value;
      const result = await readPrivate();
      assert.equal(result.rows[0].presentation_preferences_storage_state, 'incomplete');
      assert.throws(() => validatedPresentationPreferencesIdentity(result.rows[0]), /presentation_preferences_storage_incomplete/);
      await assert.rejects(resetPrivate(), /presentation_preferences_storage_incomplete/);
      for (const action of ['export', 'reset-preferences']) {
        const rejected = await runtime.dispatchFetch('https://api.lythaus.test/fixture/' + action + '?subject=' + actor.id);
        assert.equal(rejected.status, 503);
        assert.equal((await rejected.json()).error, 'presentation_preferences_storage_incomplete');
      }
      const after = (await sql('SELECT to_jsonb(u) AS value FROM identity.users u WHERE id=$1', [actor.id])).rows[0].value;
      assert.deepEqual(after, before, 'failed erasure must not claim or partially reset the retained choices');
    } finally {
      await sql('ALTER TABLE identity.users DROP COLUMN IF EXISTS presentation_left_handed, DROP COLUMN IF EXISTS presentation_profile_swipe, DROP COLUMN IF EXISTS presentation_preferences_version');
    }
    assert.equal(await resetPrivate(), false);
    assert.equal(validatedPresentationPreferencesIdentity((await readPrivate()).rows[0]).presentation_preferences, null);
  });
});
