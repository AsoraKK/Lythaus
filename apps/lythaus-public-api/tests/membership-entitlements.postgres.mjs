import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { requireNewsBoardAccess } from '../src/feed-runtime-policy.ts';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const actors = Object.fromEntries(['free', 'premium', 'black', 'forged', 'unavailable', 'racing'].map(name => [name, { id: uuidv7() }]));
const users = Object.values(actors).map(actor => actor.id);
const ips = Object.fromEntries(Object.keys(actors).map(name => [name,
  '2001:db8:' + uuidv7().replaceAll('-', '').slice(-16).match(/.{4}/g).join(':') + '::1']));
const rateHashes = Object.values(ips).map(ip => createHash('sha256').update(`public-api:${ip}`).digest('hex'));
let control, fixture, failEntitlementReads = false;

async function sql(text, values = []) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try { return await client.query(text, values); }
  finally { await client.end(); }
}

before(async () => {
  control = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await control.connect();
  await control.query("SET statement_timeout = '5s'");
  const version = Number((await control.query('SHOW server_version_num')).rows[0].server_version_num);
  assert.ok(version >= 170000 && version < 180000, 'membership fixtures require PostgreSQL 17');
  await control.query('BEGIN');
  try {
    for (const actor of Object.values(actors)) await control.query("INSERT INTO identity.users (id, status) VALUES ($1, 'active')", [actor.id]);
    await control.query("INSERT INTO identity.user_entitlements (user_id, subscription_tier) VALUES ($1, 'premium'), ($2, 'black')", [actors.premium.id, actors.black.id]);
    await control.query('COMMIT');
  } catch (error) { await control.query('ROLLBACK'); throw error; }

  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey), keyId = 'synthetic-membership-entitlements';
  for (const actor of Object.values(actors)) actor.token = await signAccessToken({ userId: actor.id, privateKeyPem, keyId });
  fixture = await nativePostgresProfileFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-membership-entitlements' },
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
    PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
  }, {
    onQuery: row => {
      assert.equal(row.role, 'lythaus_runtime');
      assert.ok(!row.rolsuper && !row.rolcreaterole && !row.rolcreatedb);
      if (failEntitlementReads && row.text.includes('identity.user_entitlements')) throw new Error('synthetic_provider_state_unavailable');
    },
  });
});

after(async () => {
  try { await fixture?.dispose(); }
  finally {
    if (control) {
      try {
        await control.query('BEGIN');
        await control.query('DELETE FROM system.idempotency_keys WHERE actor_id = ANY($1::uuid[])', [users]);
        await control.query('DELETE FROM trust.user_activity_events WHERE user_id = ANY($1::uuid[])', [users]);
        await control.query("DELETE FROM system.rate_limit_windows WHERE scope = 'public-api' AND subject_hash = ANY($1::text[])", [rateHashes]);
        await control.query('DELETE FROM social.custom_feeds WHERE user_id = ANY($1::uuid[])', [users]);
        await control.query('DELETE FROM identity.user_entitlements WHERE user_id = ANY($1::uuid[])', [users]);
        await control.query('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [users]);
        assert.equal((await control.query('SELECT count(*)::integer AS count FROM identity.users WHERE id = ANY($1::uuid[])', [users])).rows[0].count, 0);
        assert.equal((await control.query('SELECT count(*)::integer AS count FROM system.idempotency_keys WHERE actor_id = ANY($1::uuid[])', [users])).rows[0].count, 0);
        await control.query('COMMIT');
      } catch (error) { await control.query('ROLLBACK'); throw error; }
      finally { await control.end(); }
    }
  }
});

function call(actor, method, path, body, key) {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, {
    method,
    headers: {
      origin: 'https://app.lythaus.test',
      'cf-connecting-ip': ips[actor],
      ...(actor ? { authorization: 'Bearer ' + actors[actor].token } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function createFeed(actor, name, key, extra = {}) {
  return call(actor, 'POST', '/api/custom-feeds', { name, rules: [], ...extra }, key);
}

async function assertFeedLimit(actor, expectedLimit) {
  for (let index = 0; index < expectedLimit; index += 1) {
    const response = await createFeed(actor, `${actor}-${index}`, uuidv7());
    assert.equal(response.status, 201, await response.clone().text());
    await response.json();
  }
  const denied = await createFeed(actor, `${actor}-over-limit`, uuidv7());
  assert.equal(denied.status, 400, await denied.clone().text());
  assert.equal((await denied.json()).error, 'custom_feed_limit_reached');
}

test('server enforces Free, Premium, and Black limits and Black-only News Board policy', async () => {
  await assertFeedLimit('free', 1);
  await assertFeedLimit('premium', 2);
  await assertFeedLimit('black', 3);

  for (const actor of ['free', 'premium']) {
    const denied = await call(actor, 'GET', '/api/news-board');
    assert.equal(denied.status, 403, await denied.clone().text());
    assert.equal((await denied.json()).error, 'news_board_not_entitled');
  }
  // The authorization policy permits Black. The publication read itself needs
  // a separate runtime SELECT grant, which is intentionally outside this lane.
  assert.equal(requireNewsBoardAccess('black'), 'full');
});

test('concurrent distinct creates cannot exceed the remaining Free feed capacity', async () => {
  await control.query('BEGIN');
  let pendingCreates;
  try {
    await control.query('LOCK TABLE social.custom_feeds IN SHARE MODE');
    let createsSettled = false;
    pendingCreates = Promise.all([
      createFeed('racing', 'race-one', undefined),
      createFeed('racing', 'race-two', undefined),
    ]).then(responses => {
      createsSettled = true;
      return responses;
    });
    let serializedAtCapacity = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !createsSettled) {
      const waiters = await control.query(`
        SELECT count(*) FILTER (WHERE locktype = 'relation' AND relation = 'social.custom_feeds'::regclass)::integer AS insert_waiters,
               count(*) FILTER (WHERE locktype = 'advisory')::integer AS account_waiters
          FROM pg_locks WHERE NOT granted`);
      const insertWaiters = Number(waiters.rows[0]?.insert_waiters ?? 0);
      const accountWaiters = Number(waiters.rows[0]?.account_waiters ?? 0);
      if (insertWaiters === 1 && accountWaiters === 1) {
        serializedAtCapacity = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(serializedAtCapacity, true, 'one create must hold the account lock while the other waits');
    await control.query('COMMIT');
  } catch (error) {
    await control.query('ROLLBACK').catch(() => undefined);
    await pendingCreates?.catch(() => undefined);
    throw error;
  }
  const responses = await pendingCreates;
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 400]);
  const successful = responses.find(response => response.status === 201);
  const denied = responses.find(response => response.status === 400);
  assert.equal((await denied.json()).error, 'custom_feed_limit_reached');
  const created = await successful.json();

  const feeds = await sql('SELECT id, name FROM social.custom_feeds WHERE user_id = $1 ORDER BY name', [actors.racing.id]);
  assert.equal(feeds.rowCount, 1);
  assert.deepEqual(feeds.rows, [{ id: created.id, name: created.name }]);
  const activities = await sql(
    `SELECT event_type, object_id FROM trust.user_activity_events WHERE user_id = $1 ORDER BY created_at`,
    [actors.racing.id],
  );
  assert.deepEqual(activities.rows, [{ event_type: 'social.custom_feed_created', object_id: created.id }]);
});

test('Black News Board records the canonical privilege gap and works with a fixture-only publication read', async () => {
  const pathname = new URL(connectionString).pathname;
  assert.ok(/^\/lythaus_auth_test_post_membership_[a-f0-9]{32}$/.test(pathname)
    || (process.env.GITHUB_ACTIONS === 'true' && pathname === '/postgres'),
  'publication privilege fixtures require the isolated runner or disposable Actions PostgreSQL service');
  const privileges = (await sql(`SELECT has_schema_privilege('lythaus_runtime', 'editorial', 'USAGE') AS usage,
    has_column_privilege('lythaus_runtime', 'editorial.publications', 'id', 'SELECT') AS publication_read`)).rows[0];
  assert.deepEqual(privileges, { usage: false, publication_read: false });
  assert.deepEqual((await sql(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE oid='editorial.publications'::regclass`)).rows[0], { relrowsecurity: false, relforcerowsecurity: false });
  const unavailable = await call('black', 'GET', '/api/news-board');
  assert.equal(unavailable.status, 500, await unavailable.clone().text());
  assert.equal((await unavailable.json()).error, 'request_failed');

  await sql(`GRANT USAGE ON SCHEMA editorial TO lythaus_runtime;
    GRANT SELECT (id, title, post_id, published_at) ON editorial.publications TO lythaus_runtime`);
  try {
    const response = await call('black', 'GET', '/api/news-board');
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { access: 'full', items: [], nextCursor: null });
    for (const actor of ['free', 'premium']) {
      const denied = await call(actor, 'GET', '/api/news-board');
      assert.equal(denied.status, 403, await denied.clone().text());
    }
  } finally {
    await sql(`REVOKE SELECT (id, title, post_id, published_at) ON editorial.publications FROM lythaus_runtime;
      REVOKE USAGE ON SCHEMA editorial FROM lythaus_runtime`);
  }
});

test('forged tier, pending, expired, cancelled, and provider claims do not change the server tier', async () => {
  const firstKey = uuidv7();
  const first = await createFeed('forged', 'forged-black-claim', firstKey, { tier: 'black', status: 'active', provider: 'stripe' });
  assert.equal(first.status, 201, await first.clone().text());
  const created = await first.json();

  const replay = await createFeed('forged', 'forged-black-claim', firstKey, { tier: 'black', status: 'active', provider: 'stripe' });
  assert.equal(replay.status, 201, await replay.clone().text());
  assert.deepEqual(await replay.json(), created);

  for (const status of ['pending', 'active', 'confirmed', 'expired', 'cancelled', 'unavailable']) {
    const denied = await createFeed('forged', `forged-${status}`, uuidv7(), { tier: 'black', status, provider: 'stripe' });
    assert.equal(denied.status, 400, await denied.clone().text());
    assert.equal((await denied.json()).error, 'custom_feed_limit_reached');
  }
  const count = Number((await sql('SELECT count(*)::integer AS count FROM social.custom_feeds WHERE user_id = $1', [actors.forged.id])).rows[0].count);
  assert.equal(count, 1);
});

test('subscription status and custom feeds remain owner-scoped across accounts', async () => {
  const status = await call('free', 'GET', `/api/subscription/status?userId=${actors.black.id}`);
  assert.equal(status.status, 200, await status.clone().text());
  assert.deepEqual(await status.json(), {
    tier: 'free',
    entitlements: { maxCustomFeeds: 1, newsBoardAccess: 'none' },
  });

  const blackFeeds = (await sql('SELECT id FROM social.custom_feeds WHERE user_id = $1 ORDER BY created_at LIMIT 1', [actors.black.id])).rows;
  assert.equal(blackFeeds.length, 1);
  const denied = await call('free', 'GET', `/api/custom-feeds/${blackFeeds[0].id}`);
  assert.equal(denied.status, 404, await denied.clone().text());
  assert.equal((await denied.json()).error, 'custom_feed_not_found');
});

test('downgrade removes future capacity and unavailable entitlement authority fails closed', async () => {
  await sql("UPDATE identity.user_entitlements SET subscription_tier = 'free' WHERE user_id = $1", [actors.black.id]);
  const status = await call('black', 'GET', '/api/subscription/status');
  assert.equal(status.status, 200, await status.clone().text());
  assert.equal((await status.json()).tier, 'free');

  const denied = await createFeed('black', 'after-downgrade', uuidv7());
  assert.equal(denied.status, 400, await denied.clone().text());
  assert.equal((await denied.json()).error, 'custom_feed_limit_reached');

  failEntitlementReads = true;
  try {
    const unavailable = await call('premium', 'GET', '/api/subscription/status');
    assert.equal(unavailable.status, 500, await unavailable.clone().text());
    assert.equal((await unavailable.json()).error, 'request_failed');
    const blockedWrite = await createFeed('unavailable', 'unavailable-authority', uuidv7());
    assert.equal(blockedWrite.status, 500, await blockedWrite.clone().text());
    assert.equal((await blockedWrite.json()).error, 'request_failed');
  } finally { failEntitlementReads = false; }

  const after = Number((await sql('SELECT count(*)::integer AS count FROM social.custom_feeds WHERE user_id = $1', [actors.unavailable.id])).rows[0].count);
  assert.equal(after, 0);
  const premiumCount = Number((await sql('SELECT count(*)::integer AS count FROM social.custom_feeds WHERE user_id = $1', [actors.premium.id])).rows[0].count);
  assert.equal(premiumCount, 2);
});
