import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';

const target = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL);
const ownsDatabase = process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres';
assert.ok(ownsDatabase || /^\/lythaus_auth_test_post_rewards_[a-f0-9]{32}$/.test(target.pathname),
  'rewards privilege fixtures require the isolated runner or disposable Actions PostgreSQL service');
const databaseName = ownsDatabase ? `lythaus_auth_test_post_rewards_${randomUUID().replaceAll('-', '')}` : target.pathname.slice(1);
const local = new URL(target); local.pathname = '/' + databaseName;
const connectionString = local.toString();
const actors = Object.fromEntries(['free', 'premium', 'black', 'history', 'young', 'unqualified'].map(name => [name, { id: uuidv7() }]));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const spec = JSON.parse(readFileSync(new URL('../../../api/openapi/dist/openapi.json', import.meta.url), 'utf8'));
const validateRedemption = ajv.compile(spec.components.schemas.RewardRedemption);
const historyIds = [uuidv7(), uuidv7()];
const historyAt = '2026-05-26T01:02:03.000Z';
let control, fixture, bootstrapControl, created = false, parentAcl;
const parentAclQuery = `SELECT relation.relacl, ARRAY(SELECT attribute.attacl::text FROM pg_attribute attribute
  WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 ORDER BY attribute.attnum) AS columns
  FROM pg_class relation WHERE relation.oid=to_regclass('trust.reward_redemptions')`;

before(async () => {
  if (ownsDatabase) {
    bootstrapControl = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    await bootstrapControl.connect();
    assert.match((await bootstrapControl.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    parentAcl = (await bootstrapControl.query(parentAclQuery)).rows;
    await bootstrapControl.query(`CREATE DATABASE ${databaseName}`); created = true;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/ci/validate-planetscale-postgres17.mjs'], {
        env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: connectionString }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 && !signal ? resolve() : reject(new Error('canonical_baseline_failed')));
    });
  }
  control = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await control.connect();
  await control.query("SET statement_timeout='5s'");
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  assert.equal((await control.query('SELECT current_database() AS name')).rows[0].name, databaseName);
  for (const [name, actor] of Object.entries(actors)) {
    await control.query(`INSERT INTO identity.users (id, status, created_at)
      VALUES ($1, 'active', now() - $2::interval)`, [actor.id, name === 'young' ? '1 day' : '8 days']);
    await control.query(`INSERT INTO trust.reputation_profiles (user_id, policy_version, current_level)
      VALUES ($1, 'reputation-v2.0.0', $2)`, [actor.id, name === 'unqualified' ? 0 : 1]);
    if (name === 'premium' || name === 'black') await control.query(
      'INSERT INTO identity.user_entitlements (user_id, subscription_tier) VALUES ($1, $2)', [actor.id, name]);
  }
  await control.query(`INSERT INTO trust.reward_redemptions
    (id, user_id, reward_id, reward_level, reward_title, status, redeemed_at) VALUES
    ($1, $3, 'level-1-learning', 1, 'Learning access', 'confirmed', $4),
    ($2, $3, 'level-2-source-tools', 2, 'Source toolkit', 'revoked', $4)`,
  [...historyIds, actors.history.id, historyAt]);

  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey), keyId = 'synthetic-rewards-acceptance';
  for (const actor of Object.values(actors)) actor.token = await signAccessToken({ userId: actor.id, privateKeyPem, keyId });
  fixture = await nativePostgresProfileFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-rewards-acceptance' },
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
    PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
  }, { onQuery: row => {
    assert.equal(row.role, 'lythaus_runtime');
    assert.ok(!row.rolsuper && !row.rolcreaterole && !row.rolcreatedb);
  }, outboundService: () => { throw new Error('rewards fixture must not contact a provider'); } });
});

after(async () => {
  try { await fixture?.dispose(); }
  finally {
    try { await control?.end(); }
    finally {
      try {
        if (created) {
          await bootstrapControl.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
          assert.equal((await bootstrapControl.query('SELECT count(*)::integer AS count FROM pg_database WHERE datname=$1', [databaseName])).rows[0].count, 0);
          assert.deepEqual((await bootstrapControl.query(parentAclQuery)).rows, parentAcl,
            'fixture-only reward permissions must not change the shared Actions database');
        }
      } finally { await bootstrapControl?.end(); }
    }
  }
});

function call(actor, method, path, key, body) {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, {
    method,
    headers: {
      origin: 'https://app.lythaus.test', 'cf-connecting-ip': '2001:db8::2026',
      ...(actor ? { authorization: 'Bearer ' + actors[actor].token } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function assertRedemption(value) {
  assert.equal(validateRedemption(value), true, JSON.stringify(validateRedemption.errors));
  assert.deepEqual(Object.keys(value).sort(), ['id', 'userId', 'rewardId', 'rewardLevel', 'rewardTitle', 'redeemedAt', 'status'].sort());
}

test('canonical runtime grants fail closed for rewards before any fixture-only permission is introduced', async () => {
  assert.deepEqual((await control.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE oid='trust.reward_redemptions'::regclass`)).rows[0], { relrowsecurity: false, relforcerowsecurity: false });
  const privileges = (await control.query(`SELECT
    has_table_privilege('lythaus_runtime', 'trust.reward_redemptions', 'SELECT') AS read,
    has_table_privilege('lythaus_runtime', 'trust.reward_redemptions', 'INSERT') AS insert`)).rows[0];
  assert.deepEqual(privileges, { read: false, insert: false });
  for (const [method, path] of [['GET', '/api/rewards/me'], ['POST', '/api/rewards/level-1-learning/redeem']]) {
    const denied = await call('free', method, path);
    assert.equal(denied.status, 500, await denied.clone().text());
    assert.equal((await denied.json()).error, 'request_failed');
  }
  assert.equal((await control.query('SELECT count(*)::integer AS count FROM trust.reward_redemptions WHERE user_id=$1', [actors.free.id])).rows[0].count, 0);
  await control.query(`GRANT SELECT (id, user_id, reward_id, reward_level, reward_title, redeemed_at, status)
      ON trust.reward_redemptions TO lythaus_runtime;
    GRANT INSERT (id, user_id, reward_id, reward_level, reward_title)
      ON trust.reward_redemptions TO lythaus_runtime`);
  assert.deepEqual((await control.query(`SELECT
    has_table_privilege('lythaus_runtime', 'trust.reward_redemptions', 'UPDATE') AS update,
    has_table_privilege('lythaus_runtime', 'trust.reward_redemptions', 'DELETE') AS delete,
    has_column_privilege('lythaus_runtime', 'trust.reward_redemptions', 'status', 'INSERT') AS status_insert,
    has_column_privilege('lythaus_runtime', 'trust.reward_redemptions', 'redeemed_at', 'INSERT') AS timestamp_insert`)).rows[0],
  { update: false, delete: false, status_insert: false, timestamp_insert: false });
});

test('history matches the wire contract, retains revoked state and isolates the authenticated account', async () => {
  const response = await call('history', 'GET', '/api/rewards/me?userId=' + actors.free.id);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const snapshot = await response.json();
  assert.equal(snapshot.redemptionHistory.length, 2);
  for (const redemption of snapshot.redemptionHistory) {
    assertRedemption(redemption);
    assert.equal(redemption.userId, actors.history.id);
    assert.equal(redemption.redeemedAt, historyAt);
  }
  assert.deepEqual(snapshot.redemptionHistory.map(item => item.status).sort(), ['redeemed', 'revoked']);
  assert.equal(snapshot.offers.find(offer => offer.id === 'level-2-source-tools').redeemed, true,
    'a revoked reward does not become redeemable again');
  const other = await call('free', 'GET', '/api/rewards/me?userId=' + actors.history.id);
  assert.equal(other.status, 200, await other.clone().text());
  assert.deepEqual((await other.json()).redemptionHistory, []);
});

test('tier-neutral redemption returns the persisted timestamp and exact replay writes one activity', async () => {
  for (const actor of ['free', 'premium', 'black']) {
    const key = uuidv7();
    const first = await call(actor, 'POST', '/api/rewards/level-1-learning/redeem', key);
    assert.equal(first.status, 201, await first.clone().text());
    const redemption = await first.json();
    assertRedemption(redemption);
    assert.equal(redemption.userId, actors[actor].id);
    assert.equal(redemption.status, 'redeemed');
    const stored = (await control.query('SELECT redeemed_at FROM trust.reward_redemptions WHERE id=$1', [redemption.id])).rows[0];
    assert.equal(redemption.redeemedAt, stored.redeemed_at.toISOString());
    const replay = await call(actor, 'POST', '/api/rewards/level-1-learning/redeem', key);
    assert.equal(replay.status, 201, await replay.clone().text());
    assert.deepEqual(await replay.json(), redemption);
    const duplicate = await call(actor, 'POST', '/api/rewards/level-1-learning/redeem', uuidv7());
    assert.equal(duplicate.status, 409, await duplicate.clone().text());
    assert.equal((await duplicate.json()).error, 'reward_already_redeemed');
    assert.equal((await control.query(`SELECT count(*)::integer AS count FROM trust.user_activity_events
      WHERE user_id=$1 AND event_type='rewards.reward_redeemed'`, [actors[actor].id])).rows[0].count, 1);
    const snapshot = await call(actor, 'GET', '/api/rewards/me');
    assert.equal(snapshot.status, 200, await snapshot.clone().text());
    assert.deepEqual((await snapshot.json()).redemptionHistory, [redemption]);
  }
});

test('immature, unqualified, already revoked and unauthenticated attempts create no redemption', async () => {
  for (const actor of ['young', 'unqualified']) {
    const rejected = await call(actor, 'POST', '/api/rewards/level-1-learning/redeem', uuidv7(), { tier: 'black', currentLevel: 5 });
    assert.equal(rejected.status, 400, await rejected.clone().text());
    assert.equal((await rejected.json()).error, 'reward_locked');
    assert.equal((await control.query('SELECT count(*)::integer AS count FROM trust.reward_redemptions WHERE user_id=$1', [actors[actor].id])).rows[0].count, 0);
  }
  await control.query('UPDATE trust.reputation_profiles SET current_level=2 WHERE user_id=$1', [actors.history.id]);
  const revoked = await call('history', 'POST', '/api/rewards/level-2-source-tools/redeem', uuidv7());
  assert.equal(revoked.status, 409, await revoked.clone().text());
  assert.equal((await revoked.json()).error, 'reward_already_redeemed');
  assert.deepEqual((await control.query(`SELECT status FROM trust.reward_redemptions
    WHERE user_id=$1 AND reward_id='level-2-source-tools'`, [actors.history.id])).rows, [{ status: 'revoked' }]);
  const guest = await call(undefined, 'POST', '/api/rewards/level-1-learning/redeem', uuidv7());
  assert.equal(guest.status, 401, await guest.clone().text());
});

test('disabled payment routes cannot turn redirect, webhook or client purchase claims into entitlements', async () => {
  for (const [method, path] of [
    ['GET', '/api/payments/checkout/success?paid=true&tier=black'],
    ['POST', '/api/payments/checkout'], ['POST', '/api/payments/webhook'],
    ['POST', '/api/payments/restore'], ['DELETE', '/api/payments/subscription'],
  ]) {
    const disabled = await call('free', method, path, uuidv7(), method === 'GET' ? undefined
      : { tier: 'black', status: 'confirmed', paymentConfirmed: true, provider: 'untrusted', userId: actors.premium.id });
    assert.equal(disabled.status, 404, await disabled.clone().text());
    assert.equal((await disabled.json()).error, 'feature_disabled');
  }
  const status = await call('free', 'GET', '/api/subscription/status');
  assert.equal(status.status, 200, await status.clone().text());
  assert.deepEqual(await status.json(), { tier: 'free', entitlements: { maxCustomFeeds: 1, newsBoardAccess: 'none' } });
  assert.equal((await control.query('SELECT count(*)::integer AS count FROM identity.user_entitlements WHERE user_id=$1', [actors.free.id])).rows[0].count, 0);
});
