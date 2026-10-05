import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, mock, test } from 'node:test';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import * as database from '@lythaus/db';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { enforcePostTagLimit, extractHashtags, normalizeTagSearchQuery, TAG_SEARCH_PROPOSAL_VERSION } from '../src/tag-search-policy.ts';
import { prepareTagSearchCandidate } from './tag-search-candidate.mjs';

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
let failTagSearchQuery = false;
mock.module('@lythaus/db', { namedExports: {
  ...database,
  query: (binding, text, values) => {
    if (failTagSearchQuery && text.includes('FROM feed.search_public_posts_by_tag')) {
      throw Object.assign(new Error('synthetic statement cancellation'), { code: '57014' });
    }
    return withClient((client) => client.query(text, values), binding.role);
  },
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
  TAG_SEARCH_INDEX_MAINTENANCE_ENABLED: 'true',
  TAG_SEARCH_INDEX_READ_ENABLED: 'true',
  JWT_PUBLIC_JWKS: JSON.stringify({
    keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }],
  }),
};

await withClient((client) => prepareTagSearchCandidate(client));

const createdPostIds = [];
afterEach(async () => {
  if (createdPostIds.length) {
    const ids = createdPostIds.splice(0, createdPostIds.length);
    await sql('DELETE FROM content.posts WHERE id=ANY($1::uuid[])', [ids]);
  }
});

test('tag normalization accepts exact NFC tokens and rejects malformed input', () => {
  assert.equal(normalizeTagSearchQuery('  #City_Update  '), 'city_update');
  assert.equal(normalizeTagSearchQuery('cafe\u0301'), 'café');
  for (const value of ['', '#', '##tag', 'tag with spaces', 'tag%', 'x'.repeat(65), '\u0130', ['tag']]) {
    assert.throws(() => normalizeTagSearchQuery(value), /invalid_tag_search/);
  }
  assert.deepEqual(extractHashtags('#City_Update #CAFÉ #cafe\u0301').tokens, ['café', 'city_update']);
  assert.deepEqual(extractHashtags('mail#inline ##double #cityscape').tokens, ['cityscape']);
  assert.deepEqual(extractHashtags(`#${'x'.repeat(65)}`).tokens, []);
  const overflow = extractHashtags(Array.from({ length: 17 }, (_, i) => `#tag${i}`).join(' '));
  assert.equal(overflow.tokens.length, 17);
  assert.equal(overflow.observedDistinctCount, 17);
  assert.equal(overflow.complete, true, 'the exact token set remains complete above the per-post search cap');
  assert.equal(overflow.exceedsLimit, true);
  assert.equal(enforcePostTagLimit(Array.from({ length: 16 }, (_, i) => `#cap${i}`).join(' ')).observedDistinctCount, 16);
  assert.throws(() => enforcePostTagLimit(Array.from({ length: 17 }, (_, i) => `#cap${i}`).join(' ')), /post_tag_limit_exceeded/);
  const hardLimit = extractHashtags(Array.from({ length: 50_001 }, (_, i) => `#bounded${i}`).join(' '));
  assert.equal(hardLimit.tokens.length, 0);
  assert.equal(hardLimit.observedDistinctCount, 50_001);
  assert.equal(hardLimit.complete, false, 'the hard parser ceiling fails closed instead of storing a truncated token set');
  assert.equal(extractHashtags('#one #one #one').complete, true, 'duplicate tags count once');
});

test('runtime cannot read private token or completeness tables directly', async () => {
  for (const relation of ['content.post_tag_search_tokens', 'content.post_tag_search_state']) {
    await assert.rejects(
      withClient((client) => client.query(`SELECT * FROM ${relation} LIMIT 1`), 'lythaus_runtime'),
      (error) => error.code === '42501',
    );
  }
  const gate = await withClient(
    (client) => client.query('SELECT search_enabled FROM feed.tag_search_index_control WHERE singleton=true'),
    'lythaus_runtime',
  );
  assert.equal(gate.rows.length, 1);
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

async function mutate(method, path, body, owner) {
  return worker.fetch(new Request(`https://api.lythaus.test${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${owner.token}`,
      'Idempotency-Key': uuidv7(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO content.posts
           (id,author_id,body,declared_creation_mode,visibility,moderation_state,published_at,deleted_at)
         VALUES($1,$2,$3,'human',$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END)`,
        [id, authorId, body, visibility, moderationState, publishedAt, deleted],
      );
      if (!deleted) {
        const extracted = extractHashtags(body);
        await client.query(
          `SELECT feed.write_post_tag_search_index($1::uuid,$2::text[],$3::integer,$4::boolean,$5::text)`,
          [id, extracted.tokens, extracted.observedDistinctCount, extracted.complete, TAG_SEARCH_PROPOSAL_VERSION],
        );
      }
      await client.query(
        `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
         VALUES($1,'human',$2)`,
        [id, publicLabel],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
  createdPostIds.push(id);
  return id;
}

test('tag-search gate returns unavailable until indexed state is ready, then unknown tags are empty', async () => {
  await sql(`UPDATE feed.tag_search_index_control SET search_enabled=false WHERE singleton=true`);
  const unknown = await get('/api/feed/discover?tag=lythaus_test_unknown_9f03', '203.0.113.40');
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).error, 'tag_search_unavailable');
  assert.match(unknown.headers.get('cache-control') ?? '', /private, no-store/);

  await sql(`UPDATE feed.tag_search_index_control SET search_enabled=true WHERE singleton=true`);
  const noMatches = await get('/api/feed/discover?tag=lythaus_test_unknown_9f03', '203.0.113.39');
  assert.equal(noMatches.status, 200, await noMatches.clone().text());
  assert.deepEqual((await noMatches.json()).items, []);

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

test('indexed tag results retain exact identity, privacy filters, and chronological keyset pages', async () => {
  const viewer = await actor();
  const visibleAuthor = await actor();
  const blockedAuthor = await actor();
  const reverseBlockedAuthor = await actor();
  const mutedAuthor = await actor();
  const inactiveAuthor = await actor('suspended');
  const timestamp = (secondsAgo) => new Date(Date.now() + 6 * 60 * 60_000 - secondsAgo * 1000).toISOString();

  const newest = await post({ authorId: visibleAuthor.id, publishedAt: timestamp(0) });
  const hidden = [
    await post({ authorId: visibleAuthor.id, visibility: 'private', publishedAt: timestamp(1) }),
    await post({ authorId: visibleAuthor.id, moderationState: 'under_review', publishedAt: timestamp(2) }),
    await post({ authorId: visibleAuthor.id, moderationState: 'blocked', publishedAt: timestamp(3) }),
    await post({ authorId: visibleAuthor.id, deleted: true, publishedAt: timestamp(4) }),
    await post({ authorId: visibleAuthor.id, publicLabel: 'Under review', publishedAt: timestamp(5) }),
    await post({ authorId: inactiveAuthor.id, publishedAt: timestamp(6) }),
    await post({ authorId: blockedAuthor.id, publishedAt: timestamp(7) }),
    await post({ authorId: reverseBlockedAuthor.id, publishedAt: timestamp(8) }),
    await post({ authorId: mutedAuthor.id, publishedAt: timestamp(9) }),
  ];
  const needsReview = await post({ authorId: visibleAuthor.id, publishedAt: timestamp(10) });
  await sql('UPDATE content.content_declarations SET review_required=true WHERE post_id=$1', [needsReview]);
  const middle = await post({ authorId: visibleAuthor.id, publishedAt: timestamp(11) });
  const oldest = await post({ authorId: visibleAuthor.id, publishedAt: timestamp(12) });
  await sql('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2),($3,$4)', [
    viewer.id, blockedAuthor.id, reverseBlockedAuthor.id, viewer.id,
  ]);
  await sql('INSERT INTO social.mutes(muter_id,muted_id) VALUES($1,$2)', [viewer.id, mutedAuthor.id]);

  const response = await get('/api/feed/discover?tag=city&limit=100', '203.0.113.48', viewer);
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(body.items.map(({ id }) => id), [newest, middle, oldest]);
  for (const id of hidden) assert.equal(body.items.some((item) => item.id === id), false);
  assert.equal(body.items.some((item) => item.id === needsReview), false);
  assert.equal(body.items[0].authorId, visibleAuthor.id);
  assert.deepEqual(body.items[0].reactionCounts, {});

  const pagedIds = [];
  let cursor;
  for (let page = 0; page < 3; page += 1) {
    const path = `/api/feed/discover?tag=city&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const result = await get(path, '203.0.113.49', viewer);
    assert.equal(result.status, 200, await result.clone().text());
    const pageBody = await result.json();
    assert.equal(pageBody.items.length, 1);
    pagedIds.push(pageBody.items[0].id);
    cursor = pageBody.nextCursor;
  }
  assert.deepEqual(pagedIds, [newest, middle, oldest]);
});

test('Worker post create, edit, moderation, review, and delete maintain the candidate index transactionally', async () => {
  const owner = await actor();
  const created = await mutate('POST', '/api/posts', {
    body: '#apiindex #CAFÉ #cafe\u0301',
    declaredCreationMode: 'human',
    geoScope: 'none',
  }, owner);
  assert.equal(created.status, 201, await created.clone().text());
  const postId = (await created.json()).id;
  createdPostIds.push(postId);

  let index = await sql(
    `SELECT state.complete, state.observed_distinct_count,
            array_agg(token.tag_key ORDER BY token.tag_key) FILTER (WHERE token.tag_key IS NOT NULL) AS tokens
       FROM content.post_tag_search_state state
       LEFT JOIN content.post_tag_search_tokens token ON token.post_id=state.post_id
      WHERE state.post_id=$1 GROUP BY state.complete,state.observed_distinct_count`,
    [postId],
  );
  assert.deepEqual(index.rows[0], { complete: true, observed_distinct_count: 2, tokens: ['apiindex', 'café'] });
  await sql(
    `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
     VALUES($1,'human','Human-authored')`,
    [postId],
  );
  await sql("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [postId]);
  let visible = await get('/api/feed/discover?tag=apiindex', '203.0.113.54');
  assert.equal(visible.status, 200, await visible.clone().text());
  assert.deepEqual((await visible.json()).items.map(({ id }) => id), [postId]);

  await sql('UPDATE content.content_declarations SET review_required=true WHERE post_id=$1', [postId]);
  visible = await get('/api/feed/discover?tag=apiindex', '203.0.113.55');
  assert.equal(visible.status, 200);
  assert.deepEqual((await visible.json()).items, []);
  await sql('UPDATE content.content_declarations SET review_required=false WHERE post_id=$1', [postId]);

  const edited = await mutate('PUT', `/api/posts/${postId}`, {
    body: '#changedonly', declaredCreationMode: 'human',
  }, owner);
  assert.equal(edited.status, 200, await edited.clone().text());
  index = await sql(
    `SELECT state.complete,
            array_agg(token.tag_key ORDER BY token.tag_key) FILTER (WHERE token.tag_key IS NOT NULL) AS tokens
       FROM content.post_tag_search_state state
       LEFT JOIN content.post_tag_search_tokens token ON token.post_id=state.post_id
      WHERE state.post_id=$1 GROUP BY state.complete`,
    [postId],
  );
  assert.deepEqual(index.rows[0], { complete: true, tokens: ['changedonly'] });
  visible = await get('/api/feed/discover?tag=changedonly', '203.0.113.56');
  assert.deepEqual((await visible.json()).items, [], 'edited content stays hidden while it is under review');
  await sql("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [postId]);
  visible = await get('/api/feed/discover?tag=changedonly', '203.0.113.57');
  assert.deepEqual((await visible.json()).items.map(({ id }) => id), [postId]);

  const deleted = await mutate('DELETE', `/api/posts/${postId}`, undefined, owner);
  assert.equal(deleted.status, 200, await deleted.clone().text());
  const remaining = await sql(
    `SELECT (SELECT count(*)::integer FROM content.post_tag_search_tokens WHERE post_id=$1) AS tokens,
            (SELECT count(*)::integer FROM content.post_tag_search_state WHERE post_id=$1) AS state`,
    [postId],
  );
  assert.deepEqual(remaining.rows[0], { tokens: 0, state: 0 });
});

test('indexed query cancellation becomes explicit unavailable, not an empty success', async () => {
  failTagSearchQuery = true;
  try {
    const response = await get('/api/feed/discover?tag=city', '203.0.113.50');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'tag_search_unavailable');
  } finally {
    failTagSearchQuery = false;
  }
});

test('viewer filtering beyond the candidate scan bound is unavailable, not a partial page', async () => {
  const viewer = await actor();
  const newestAuthor = await actor();
  const middleAuthor = await actor();
  const oldestAuthor = await actor();
  const unrelatedAuthor = await actor();
  const timestamp = (secondsAgo) => new Date(Date.now() + 6 * 60 * 60_000 - secondsAgo * 1000).toISOString();
  const newest = await post({ authorId: newestAuthor.id, body: 'Synthetic #boundedlimit', publishedAt: timestamp(0) });
  await post({ authorId: middleAuthor.id, body: 'Synthetic #boundedlimit', publishedAt: timestamp(1) });
  const visible = await post({ authorId: oldestAuthor.id, body: 'Synthetic #boundedlimit', publishedAt: timestamp(2) });
  const unrelated = await post({ authorId: unrelatedAuthor.id, body: 'Synthetic #boundedunrelated', publishedAt: timestamp(3) });
  await sql('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2),($1,$3)', [
    viewer.id, newestAuthor.id, middleAuthor.id,
  ]);
  await sql('UPDATE feed.tag_search_index_control SET max_candidates_per_request=2 WHERE singleton=true');
  env.TAG_SEARCH_MAX_CANDIDATES_PER_REQUEST = '2';
  try {
    const bounded = await get('/api/feed/discover?tag=boundedlimit', '203.0.113.52', viewer);
    assert.equal(bounded.status, 503);
    assert.equal((await bounded.json()).error, 'tag_search_unavailable');
    const guestPage = await get('/api/feed/discover?tag=boundedlimit&limit=1', '203.0.113.54');
    assert.equal(guestPage.status, 200, await guestPage.clone().text());
    const guestBody = await guestPage.json();
    assert.deepEqual(guestBody.items.map(({ id }) => id), [newest]);
    assert.ok(guestBody.nextCursor, 'a bounded window containing limit + 1 public posts preserves pagination');
    const otherTag = await get('/api/feed/discover?tag=boundedunrelated', '203.0.113.55', viewer);
    assert.equal(otherTag.status, 200, await otherTag.clone().text());
    assert.deepEqual((await otherTag.json()).items.map(({ id }) => id), [unrelated]);
    const gate = await sql('SELECT search_enabled FROM feed.tag_search_index_control WHERE singleton=true');
    assert.equal(gate.rows[0].search_enabled, true, 'a block-heavy request does not close the global index gate');

    await sql('UPDATE feed.tag_search_index_control SET max_candidates_per_request=3 WHERE singleton=true');
    env.TAG_SEARCH_MAX_CANDIDATES_PER_REQUEST = '3';
    const complete = await get('/api/feed/discover?tag=boundedlimit', '203.0.113.53', viewer);
    assert.equal(complete.status, 200, await complete.clone().text());
    assert.deepEqual((await complete.json()).items.map(({ id }) => id), [visible]);
  } finally {
    await sql('UPDATE feed.tag_search_index_control SET max_candidates_per_request=1000 WHERE singleton=true');
    delete env.TAG_SEARCH_MAX_CANDIDATES_PER_REQUEST;
  }
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

test('enabled post writes reject over-limit tags before creation or edit mutation', async () => {
  await sql('UPDATE feed.tag_search_index_control SET search_enabled=true WHERE singleton=true');
  const owner = await actor();
  const tag = `writecap${uuidv7().replaceAll('-', '')}`;
  const tooManyTags = `#${tag} ${Array.from({ length: 16 }, (_, index) => `#capfill${index}`).join(' ')}`;
  const rejectedCreate = await mutate('POST', '/api/posts', {
    body: tooManyTags, declaredCreationMode: 'human', geoScope: 'none',
  }, owner);
  assert.equal(rejectedCreate.status, 400, await rejectedCreate.clone().text());
  assert.equal((await rejectedCreate.json()).error, 'post_tag_limit_exceeded');
  const absentCreate = await sql('SELECT count(*)::integer AS count FROM content.posts WHERE author_id=$1 AND body=$2', [owner.id, tooManyTags]);
  assert.equal(absentCreate.rows[0].count, 0, 'rejected create never becomes a post or index candidate');

  const created = await mutate('POST', '/api/posts', {
    body: `#${tag}`, declaredCreationMode: 'human', geoScope: 'none',
  }, owner);
  assert.equal(created.status, 201, await created.clone().text());
  const postId = (await created.json()).id;
  createdPostIds.push(postId);
  await sql(
    `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
     VALUES($1,'human','Human-authored')`,
    [postId],
  );
  await sql("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [postId]);

  const rejectedEdit = await mutate('PUT', `/api/posts/${postId}`, {
    body: tooManyTags, declaredCreationMode: 'human',
  }, owner);
  assert.equal(rejectedEdit.status, 400, await rejectedEdit.clone().text());
  assert.equal((await rejectedEdit.json()).error, 'post_tag_limit_exceeded');
  const preserved = await sql(
    `SELECT post.body, post.published_at IS NOT NULL AS published, state.complete,
            state.excluded_reason, array_agg(token.tag_key ORDER BY token.tag_key)
              FILTER (WHERE token.tag_key IS NOT NULL) AS tags
       FROM content.posts post
       JOIN content.post_tag_search_state state ON state.post_id=post.id
       LEFT JOIN content.post_tag_search_tokens token ON token.post_id=post.id
      WHERE post.id=$1 GROUP BY post.id,state.complete,state.excluded_reason`,
    [postId],
  );
  assert.deepEqual(preserved.rows[0], {
    body: `#${tag}`, published: true, complete: true,
    excluded_reason: null, tags: [tag],
  }, 'rejected edit preserves published body and its valid index state');
  const searchable = await get(`/api/feed/discover?tag=${tag}`, '203.0.113.50');
  assert.equal(searchable.status, 200, await searchable.clone().text());
  assert.deepEqual((await searchable.json()).items.map(({ id }) => id), [postId]);
});

test('legacy over-limit posts remain feed-visible but cannot poison popular-tag search or cursors', async () => {
  await sql('UPDATE feed.tag_search_index_control SET search_enabled=true WHERE singleton=true');
  const viewer = await actor();
  const legacyAuthor = await actor();
  const topAuthor = await actor();
  const blockedAuthor = await actor();
  const mutedAuthor = await actor();
  const olderAuthor = await actor();
  const tag = `popularattack${uuidv7().replaceAll('-', '')}`;
  const time = (secondsAgo) => new Date(Date.now() + 6 * 60 * 60_000 - secondsAgo * 1000).toISOString();
  const legacyBody = `#${tag} ${Array.from({ length: 16 }, (_, index) => `#attackfill${index}`).join(' ')}`;
  const legacyPost = await post({ authorId: legacyAuthor.id, body: legacyBody, publishedAt: time(0) });
  const top = await post({ authorId: topAuthor.id, body: `#${tag}`, publishedAt: time(1) });
  const blocked = await post({ authorId: blockedAuthor.id, body: `#${tag}`, publishedAt: time(2) });
  const muted = await post({ authorId: mutedAuthor.id, body: `#${tag}`, publishedAt: time(3) });
  const older = await post({ authorId: olderAuthor.id, body: `#${tag}`, publishedAt: time(4) });
  await sql('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2)', [viewer.id, blockedAuthor.id]);
  await sql('INSERT INTO social.mutes(muter_id,muted_id) VALUES($1,$2)', [viewer.id, mutedAuthor.id]);

  const legacyState = await sql(
    `SELECT complete,observed_distinct_count,excluded_reason
       FROM content.post_tag_search_state WHERE post_id=$1`,
    [legacyPost],
  );
  assert.deepEqual(legacyState.rows[0], {
    complete: true, observed_distinct_count: 17, excluded_reason: 'legacy_tag_limit_exceeded',
  });
  await sql("UPDATE content.posts SET moderation_state='under_review',published_at=NULL WHERE id=$1", [legacyPost]);
  await sql("UPDATE content.posts SET moderation_state='allowed',published_at=$2 WHERE id=$1", [legacyPost, time(0)]);
  const legacyTokens = await sql('SELECT count(*)::integer AS count FROM content.post_tag_search_tokens WHERE post_id=$1', [legacyPost]);
  assert.equal(legacyTokens.rows[0].count, 0, 'publication transitions cannot add an excluded legacy post to tag candidates');

  const publicFeed = await get('/api/feed/discover?limit=50', '203.0.113.51');
  assert.equal(publicFeed.status, 200, await publicFeed.clone().text());
  assert.ok((await publicFeed.json()).items.some(({ id }) => id === legacyPost),
    'legacy over-limit content remains in ordinary public feeds');

  const guestSearch = await get(`/api/feed/discover?tag=${tag}&limit=10`, '203.0.113.52');
  assert.equal(guestSearch.status, 200, await guestSearch.clone().text());
  assert.deepEqual((await guestSearch.json()).items.map(({ id }) => id), [top, blocked, muted, older]);

  const pagedIds = [];
  let cursor;
  for (let page = 0; page < 2; page += 1) {
    const path = `/api/feed/discover?tag=${tag}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const result = await get(path, '203.0.113.53', viewer);
    assert.equal(result.status, 200, await result.clone().text());
    const body = await result.json();
    assert.equal(body.items.length, 1);
    pagedIds.push(body.items[0].id);
    cursor = body.nextCursor;
    if (page === 0) assert.equal(typeof cursor, 'string');
    if (page === 1) assert.equal(cursor, null);
  }
  assert.deepEqual(pagedIds, [top, older], 'block and mute filters still apply across stable chronological cursors');
  assert.equal(new Set(pagedIds).size, pagedIds.length, 'cursor pages contain no duplicates');
  const gate = await sql('SELECT search_enabled FROM feed.tag_search_index_control WHERE singleton=true');
  assert.equal(gate.rows[0].search_enabled, true, 'legacy overflow does not disable the global search gate');
});

test('invalid index metadata remains a systemic fail-closed condition', async () => {
  const author = await actor();
  const postId = await post({ authorId: author.id, body: '#systemicindexfailure' });
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `SELECT feed.write_post_tag_search_index(
           $1::uuid, ARRAY['systemicindexfailure']::text[], 1, true, 'unknown-extractor')`,
        [postId],
      );
      const state = await client.query(
        'SELECT complete FROM content.post_tag_search_state WHERE post_id=$1', [postId],
      );
      const gate = await client.query(
        'SELECT search_enabled FROM feed.tag_search_index_control WHERE singleton=true',
      );
      assert.equal(state.rows[0].complete, false);
      assert.equal(gate.rows[0].search_enabled, false,
        'unknown extraction metadata closes search because exact token completeness cannot be proven');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
