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
  throw new Error('Reputation visibility tests require an explicitly local disposable PostgreSQL database');
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
const keyId = 'synthetic-reputation-visibility-test';
const privateKeyPem = await exportPKCS8(privateKey);
const env = {
  ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
  CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test', DB_APP_FRESH: { role: 'lythaus_runtime' },
  JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
};

async function subject({ accountStatus = 'active', moderationState = 'allowed', publicVisibility = true,
  trustPassportVisibility = 'public_minimal', reputationStatus = 'active', level = 3, profile = true,
  reputation = true } = {}) {
  const id = uuidv7();
  await sql('INSERT INTO identity.users(id,status,display_name) VALUES($1,$2,$3)', [id, accountStatus, 'Synthetic member']);
  if (profile) await sql(
    `INSERT INTO social.profiles(user_id,moderation_state,public_visibility,trust_passport_visibility)
     VALUES($1,$2,$3,$4)`, [id, moderationState, publicVisibility, trustPassportVisibility]);
  if (reputation) await sql(
    `INSERT INTO trust.reputation_profiles(user_id,policy_version,current_level,status)
     VALUES($1,$2,$3,$4)`, [id, 'synthetic-reputation-policy', level, reputationStatus]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}

async function call(path, actor) {
  return worker.fetch(new Request(`https://api.lythaus.test${path}`, {
    method: 'GET', headers: actor ? { Authorization: `Bearer ${actor.token}` } : {},
  }), env, { waitUntil() {} });
}

const publicAliases = id => [
  `/api/reputation/users/${id}`,
  `/api/reputation/user/${id}`,
];

test('both public reputation aliases return only level and label for public Passport modes', async () => {
  for (const trustPassportVisibility of ['public_minimal', 'public_expanded']) {
    const member = await subject({ trustPassportVisibility, level: 3 });
    for (const path of publicAliases(member.id)) {
      const response = await call(path);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.deepEqual(Object.keys(body).sort(), ['level', 'levelName', 'userId']);
      assert.equal(body.userId, member.id);
      assert.equal(body.level, 3);
      assert.equal(typeof body.levelName, 'string');
      for (const field of ['reputationLevel', 'reputationStatus', 'reputationBand', 'policyVersion', 'pillars', 'promotionBlockers', 'evaluatedAt']) {
        assert.equal(field in body, false, `${field} must remain private`);
      }
    }

    const profileResponse = await call(`/api/users/${member.id}`);
    assert.equal(profileResponse.status, 200, await profileResponse.clone().text());
    assert.equal(profileResponse.headers.get('cache-control'), 'private, no-store');
    const profile = (await profileResponse.json()).user;
    assert.deepEqual(Object.keys(profile.reputation).sort(), ['label', 'level']);
    assert.equal(profile.reputation.level, 3);
    assert.equal(typeof profile.reputation.label, 'string');
    assert.equal('reputationLevel' in profile, false);
    for (const field of ['status', 'band', 'policyVersion', 'pillars', 'promotionBlockers', 'evaluatedAt']) {
      assert.equal(field in profile.reputation, false, `${field} must remain private`);
    }
  }
});

test('private Passport settings suppress public summary without hiding an otherwise public profile', async () => {
  const member = await subject({ trustPassportVisibility: 'private', level: 4 });
  for (const path of publicAliases(member.id)) {
    const response = await call(path);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }
  const profileResponse = await call(`/api/users/${member.id}`);
  assert.equal(profileResponse.status, 200);
  assert.equal(profileResponse.headers.get('cache-control'), 'private, no-store');
  const profile = (await profileResponse.json()).user;
  assert.equal(profile.trustPassportVisibility, 'private');
  assert.equal('reputation' in profile, false);
  assert.equal('reputationLevel' in profile, false);
});

test('non-active reputation states are omitted from profile and unavailable publicly', async () => {
  for (const reputationStatus of ['restricted', 'suspended', 'under_investigation']) {
    const member = await subject({ reputationStatus, trustPassportVisibility: 'public_expanded' });
    for (const path of publicAliases(member.id)) assert.equal((await call(path)).status, 404);
    const response = await call(`/api/users/${member.id}`);
    assert.equal(response.status, 200);
    const profile = (await response.json()).user;
    assert.equal('reputation' in profile, false);
    assert.equal('reputationLevel' in profile, false);
    assert.equal(JSON.stringify(profile).includes(reputationStatus), false);
  }
});

test('hidden, unapproved, inactive, and missing targets have no public profile or reputation response', async () => {
  const hidden = await subject({ publicVisibility: false });
  const underReview = await subject({ moderationState: 'under_review' });
  const blocked = await subject({ moderationState: 'blocked' });
  const inactive = [];
  for (const accountStatus of ['suspended', 'deleted', 'locked', 'relink_required']) {
    inactive.push(await subject({ accountStatus }));
  }
  const absentId = '01900000-0000-7000-8000-000000000099';
  for (const member of [hidden, underReview, blocked, ...inactive, { id: absentId }]) {
    for (const path of publicAliases(member.id)) {
      const response = await call(path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(await response.json(), { error: 'not_found' });
    }
    const profileResponse = await call(`/api/users/${member.id}`);
    assert.equal(profileResponse.status, 404, `/api/users/${member.id}`);
    assert.equal(profileResponse.headers.get('cache-control'), 'private, no-store');
  }
});

test('authenticated owner retains detailed reputation and profile fields with private no-store caching', async () => {
  const owner = await subject({ trustPassportVisibility: 'private', reputationStatus: 'under_investigation', level: 2 });
  const unauthenticated = await call('/api/reputation/me');
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('cache-control'), 'private, no-store');

  const response = await call(`/api/reputation/me?userId=01900000-0000-7000-8000-000000000099`, owner);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.userId, owner.id);
  assert.equal(body.reputationStatus, 'under_investigation');
  for (const field of ['reputationLevel', 'reputationBand', 'policyVersion', 'pillars', 'promotionBlockers', 'evaluatedAt']) {
    assert.equal(field in body, true, `${field} remains available to the owner`);
  }

  const privateProfile = await call('/api/users/me', owner);
  assert.equal(privateProfile.status, 200);
  assert.equal(privateProfile.headers.get('cache-control'), 'private, no-store');
  const profile = (await privateProfile.json()).user;
  assert.equal(profile.trustPassportVisibility, 'private');
  assert.equal(profile.reputation.status, 'under_investigation');
  assert.ok(['new', 'accountable', 'trusted', 'established'].includes(profile.reputation.band));
  assert.equal('pillars' in profile.reputation, false);
});
