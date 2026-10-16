import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { createHash } from 'node:crypto';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import * as accessPolicy from '../src/admin-access-runtime-policy.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_auth_test') || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Membership entitlement tests require explicitly local disposable PostgreSQL');
}

const adminId = uuidv7();
const subject = 'synthetic-membership-entitlement-admin';
const userIds = [uuidv7(), uuidv7(), uuidv7()];
const adminRateHash = createHash('sha256').update(`admin:${adminId}`).digest('hex');

async function withClient(work, role) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '5s'");
    if (role) await client.query(`SET ROLE ${role}`);
    return await work(client);
  } finally { await client.end(); }
}

const sql = (text, values = []) => withClient(client => client.query(text, values));
const query = (binding, text, values = []) => text.includes('FROM identity.admin_memberships')
  ? Promise.resolve({ rows: [{ user_id: adminId, role: 'administrator' }], rowCount: 1 })
  : withClient(client => client.query(text, values), binding.role);
const transaction = (binding, work) => withClient(async client => {
  await client.query('BEGIN');
  try {
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}, binding.role);

mock.module('@lythaus/db', { cache: true, namedExports: { ...database, query, transaction } });
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), {
  cache: true,
  namedExports: {
    ...accessPolicy,
    verifiedAccessSubject: async request => {
      if (request.headers.get('cf-access-jwt-assertion') !== 'synthetic-valid') throw new Error('access_required');
      return subject;
    },
  },
});

const { default: worker } = await import('../src/index.ts');
const env = {
  ACCESS_SUBJECT_HMAC_KEY: 'synthetic-membership-entitlement-key',
  EXPECTED_HOSTNAMES: 'admin.lythaus.co',
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
  DB_ADMIN_FRESH: { role: 'lythaus_admin' },
  DB_PRIVACY_FRESH: { role: 'lythaus_admin' },
  WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-membership-entitlement-test' },
};

async function changeTier(userId, body, assertion = 'synthetic-valid') {
  return worker.fetch(new Request(`https://admin.lythaus.co/api/admin/users/${userId}/tier`, {
    method: 'POST',
    headers: {
      origin: 'https://admin.lythaus.co',
      'content-type': 'application/json',
      'cf-access-jwt-assertion': assertion,
    },
    body: JSON.stringify(body),
  }), env);
}

async function count(sqlText, values) {
  return Number((await sql(sqlText, values)).rows[0].count);
}

before(async () => {
  const version = Number((await sql('SHOW server_version_num')).rows[0].server_version_num);
  assert.ok(version >= 170000 && version < 180000, 'membership fixtures require PostgreSQL 17');
  await sql('INSERT INTO identity.users (id) VALUES ($1)', [adminId]);
  for (const id of userIds) await sql("INSERT INTO identity.users (id, status) VALUES ($1, 'active')", [id]);
});

after(async () => {
  const subjects = [adminId, ...userIds];
  await sql('DELETE FROM trust.user_activity_events WHERE user_id = ANY($1::uuid[]) OR actor_user_id = ANY($1::uuid[])', [subjects]);
  await sql("DELETE FROM system.audit_events WHERE actor_id = $1 OR target_id = ANY($2::uuid[])", [adminId, userIds]);
  await sql("DELETE FROM system.outbox_events WHERE event_type = 'identity.user.tier_changed' AND aggregate_id = ANY($1::uuid[])", [userIds]);
  await sql("DELETE FROM system.rate_limit_windows WHERE scope = 'admin-api' AND subject_hash = $1", [adminRateHash]);
  await sql('DELETE FROM identity.user_entitlements WHERE user_id = ANY($1::uuid[])', [userIds]);
  await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [subjects]);
});

test('first manual grant races serialize and retries emit one entitlement event', async () => {
  const results = await Promise.all([
    changeTier(userIds[0], { tier: 'premium', reasonCode: 'SYNTHETIC_TEST' }),
    changeTier(userIds[0], { tier: 'premium', reasonCode: 'SYNTHETIC_TEST' }),
  ]);
  for (const response of results) assert.equal(response.status, 200, await response.clone().text());
  const bodies = await Promise.all(results.map(response => response.json()));
  assert.deepEqual(bodies.map(body => body.changed).sort(), [false, true]);

  const retry = await changeTier(userIds[0], { tier: 'premium', reasonCode: 'SYNTHETIC_TEST' });
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.deepEqual(await retry.json(), { userId: userIds[0], tier: 'premium', changed: false });

  for (const [table, predicate] of [
    ['system.audit_events', "action = 'user.tier_changed'"],
    ['system.outbox_events', "event_type = 'identity.user.tier_changed'"],
    ['trust.user_activity_events', "event_type = 'rewards.subscription_tier_changed'"],
  ]) {
    assert.equal(await count(`SELECT count(*)::integer AS count FROM ${table} WHERE ${predicate} AND ${table === 'system.outbox_events' ? 'aggregate_id' : table === 'system.audit_events' ? 'target_id' : 'user_id'} = $1`, [userIds[0]]), 1, table);
  }
});

test('tier writes are account-scoped and downgrade changes only the target authority', async () => {
  const otherBefore = await sql('SELECT subscription_tier FROM identity.user_entitlements WHERE user_id = $1', [userIds[1]]);
  assert.equal(otherBefore.rowCount, 0);

  const black = await changeTier(userIds[0], { tier: 'black', reasonCode: 'SYNTHETIC_TEST' });
  assert.deepEqual(await black.json(), { userId: userIds[0], tier: 'black', changed: true });
  const premium = await changeTier(userIds[1], { tier: 'premium', reasonCode: 'SYNTHETIC_TEST' });
  assert.deepEqual(await premium.json(), { userId: userIds[1], tier: 'premium', changed: true });
  const downgrade = await changeTier(userIds[0], { tier: 'free', reasonCode: 'SYNTHETIC_TEST' });
  assert.deepEqual(await downgrade.json(), { userId: userIds[0], tier: 'free', changed: true });

  const rows = (await sql('SELECT user_id, subscription_tier FROM identity.user_entitlements WHERE user_id = ANY($1::uuid[]) ORDER BY user_id', [userIds])).rows;
  assert.deepEqual(rows, [
    { user_id: userIds[0], subscription_tier: 'free' },
    { user_id: userIds[1], subscription_tier: 'premium' },
  ].sort((left, right) => left.user_id.localeCompare(right.user_id)));
});

test('provider lifecycle claims and unavailable state cannot act as manual entitlement inputs', async () => {
  const targetId = userIds[2];
  for (const field of [
    { status: 'pending' },
    { status: 'expired' },
    { status: 'cancelled' },
    { status: 'unavailable' },
    { provider: 'stripe' },
    { currentPeriodEnd: '2099-01-01T00:00:00Z' },
    { cancelAtPeriodEnd: true },
    { manualGrantExpiresAt: '2099-01-01T00:00:00Z' },
  ]) {
    const response = await changeTier(targetId, { tier: 'black', reasonCode: 'SYNTHETIC_TEST', ...field });
    assert.equal(response.status, 400, await response.clone().text());
    assert.equal((await response.json()).error, 'unknown_field');
  }
  assert.equal(await count('SELECT count(*)::integer AS count FROM identity.user_entitlements WHERE user_id = $1', [targetId]), 0);

  const denied = await changeTier(targetId, { tier: 'black', reasonCode: 'SYNTHETIC_TEST' }, 'synthetic-invalid');
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).error, 'access_required');
  assert.equal(await count('SELECT count(*)::integer AS count FROM identity.user_entitlements WHERE user_id = $1', [targetId]), 0);
});
