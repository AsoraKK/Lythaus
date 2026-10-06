import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mock, test } from 'node:test';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import * as database from '@lythaus/db';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { normalizeTagSearchQuery } from '../src/tag-search-policy.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_content_test')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Tag search tests require an explicitly local disposable PostgreSQL database');
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
  } finally {
    await client.end();
  }
}

const sql = (text, values) => withClient((client) => client.query(text, values));
mock.module('@lythaus/db', { namedExports: {
  ...database,
  query: (binding, text, values) => withClient((client) => client.query(text, values), binding.role),
  transaction: (binding, work) => withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }, binding.role),
} });

const { default: worker } = await import('../src/index.ts');
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const keyId = 'synthetic-local-discovery-test';
const privateKeyPem = await exportPKCS8(privateKey);
const env = {
  ENVIRONMENT: 'local',
  EXPECTED_HOSTNAMES: 'api.lythaus.test',
  CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
  DB_APP_FRESH: { role: 'lythaus_runtime' },
  JWT_PUBLIC_JWKS: JSON.stringify({
    keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }],
  }),
};

test('tag normalization accepts exact NFC tokens and rejects malformed input', () => {
  assert.equal(normalizeTagSearchQuery('  #City_Update  '), 'city_update');
  assert.equal(normalizeTagSearchQuery('cafe\u0301'), 'café');
  for (const value of ['', '#', '##tag', 'tag with spaces', 'tag%', 'x'.repeat(65), '\u0130', ['tag']]) {
    assert.throws(() => normalizeTagSearchQuery(value), /invalid_tag_search/);
  }
});

async function get(path, ip = '203.0.113.10', actor) {
  return worker.fetch(new Request(`https://api.lythaus.test${path}`, {
    method: 'GET',
    headers: {
      'cf-connecting-ip': ip,
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
    },
  }), env, { waitUntil() {} });
}

async function actor(status = 'active') {
  const id = uuidv7();
  await sql('INSERT INTO identity.users(id,status,display_name) VALUES($1,$2,$3)', [
    id, status, 'Synthetic discovery fixture',
  ]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}

async function post({ authorId, body = 'Synthetic #city fixture', visibility = 'public', moderationState = 'allowed', deleted = false, publishedAt, publicLabel = 'Human-authored' }) {
  const id = uuidv7();
  await sql(
    `INSERT INTO content.posts
       (id,author_id,body,declared_creation_mode,visibility,moderation_state,published_at,deleted_at)
     VALUES($1,$2,$3,'human',$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END)`,
    [id, authorId, body, visibility, moderationState, publishedAt, deleted],
  );
  await sql(
    `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
     VALUES($1,'human',$2)`,
    [id, publicLabel],
  );
  return id;
}

test('the Worker validates tag input and fails closed before any body query', async () => {
  const unknown = await get('/api/feed/discover?tag=lythaus_test_unknown_9f03', '203.0.113.40');
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).error, 'tag_search_unavailable');
  assert.match(unknown.headers.get('cache-control') ?? '', /private, no-store/);

  const injection = await get(
    `/api/feed/discover?tag=${encodeURIComponent("#city' OR 'x'='x")}`,
    '203.0.113.41',
  );
  assert.equal(injection.status, 400);
  assert.equal((await injection.json()).error, 'invalid_tag_search');

  const duplicates = await get('/api/feed/discover?tag=city&tag=other', '203.0.113.42');
  assert.equal(duplicates.status, 400);
  assert.equal((await duplicates.json()).error, 'invalid_tag_search');

  const ordinaryDiscover = await get('/api/feed/discover?limit=2', '203.0.113.43');
  assert.equal(ordinaryDiscover.status, 200, await ordinaryDiscover.clone().text());
});

test('the native rate limiter rejects an over-limit tag search with retry timing', async () => {
  const ip = '203.0.113.44';
  const subjectHash = createHash('sha256').update(`feed:tag-search:${ip}`).digest('hex');
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  await sql(
    `INSERT INTO system.rate_limit_windows(scope,subject_hash,window_started_at,request_count,expires_at)
     VALUES('feed:tag-search',$1,$2,30,$2::timestamptz + interval '2 minutes')
     ON CONFLICT (scope,subject_hash,window_started_at)
     DO UPDATE SET request_count=30,expires_at=EXCLUDED.expires_at`,
    [subjectHash, windowStartedAt],
  );

  const response = await get('/api/feed/discover?tag=city', ip);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'rate_limit_exceeded');
  assert.match(response.headers.get('retry-after') ?? '', /^\d+$/);
});

test('native discovery preserves visibility, block/mute isolation, and chronological cursor paging', async () => {
  const viewer = await actor();
  const visibleAuthor = await actor();
  const blockedAuthor = await actor();
  const reverseBlockedAuthor = await actor();
  const mutedAuthor = await actor();
  const inactiveAuthor = await actor('suspended');
  const publishedAt = (minutesAgo) => new Date(Date.now() + 6 * 60 * 60_000 - minutesAgo * 60_000).toISOString();

  const visibleNewest = await post({ authorId: visibleAuthor.id, publishedAt: publishedAt(0) });
  const hiddenIds = [
    await post({ authorId: visibleAuthor.id, visibility: 'private', publishedAt: publishedAt(1) }),
    await post({ authorId: visibleAuthor.id, visibility: 'followers', publishedAt: publishedAt(2) }),
    await post({ authorId: visibleAuthor.id, moderationState: 'under_review', publishedAt: publishedAt(3) }),
    await post({ authorId: visibleAuthor.id, moderationState: 'blocked', publishedAt: publishedAt(4) }),
    await post({ authorId: visibleAuthor.id, deleted: true, publishedAt: publishedAt(5) }),
    await post({ authorId: inactiveAuthor.id, publishedAt: publishedAt(6) }),
    await post({ authorId: blockedAuthor.id, publishedAt: publishedAt(7) }),
    await post({ authorId: reverseBlockedAuthor.id, publishedAt: publishedAt(8) }),
    await post({ authorId: mutedAuthor.id, publishedAt: publishedAt(9) }),
  ];
  const visibleMiddle = await post({ authorId: visibleAuthor.id, publishedAt: publishedAt(9) });
  const visibleOldest = await post({ authorId: visibleAuthor.id, publishedAt: publishedAt(10) });

  await sql('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2),($3,$4)', [
    viewer.id, blockedAuthor.id, reverseBlockedAuthor.id, viewer.id,
  ]);
  await sql('INSERT INTO social.mutes(muter_id,muted_id) VALUES($1,$2)', [viewer.id, mutedAuthor.id]);

  const complete = await get('/api/feed/discover?limit=100', '203.0.113.45', viewer);
  assert.equal(complete.status, 200, await complete.clone().text());
  assert.match(complete.headers.get('cache-control') ?? '', /private, no-store/);
  const completeItems = (await complete.json()).items;
  const visibleIds = new Set([visibleNewest, visibleMiddle, visibleOldest]);
  assert.deepEqual(completeItems.map(({ id }) => id).filter((id) => visibleIds.has(id)), [
    visibleNewest, visibleMiddle, visibleOldest,
  ]);
  const completeIds = new Set(completeItems.map(({ id }) => id));
  for (const hiddenId of hiddenIds) assert.equal(completeIds.has(hiddenId), false);

  const pageIds = [];
  let cursor;
  for (let page = 0; page < 3; page += 1) {
    const path = `/api/feed/discover?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await get(path, '203.0.113.46', viewer);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.items.length, 1);
    pageIds.push(body.items[0].id);
    cursor = body.nextCursor;
    if (page < 2) assert.equal(typeof cursor, 'string');
  }
  assert.deepEqual(pageIds, [visibleNewest, visibleMiddle, visibleOldest]);
});
