import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { handleOwnerContentRead } from '../src/owner-content-reader.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.ok(target.pathname.startsWith('/lythaus_auth_test')
  || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'));
const sql = async (text, values) => {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try { return await client.query(text, values); }
  finally { await client.end(); }
};
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const privateKeyPem = await exportPKCS8(privateKey);
const keyId = 'synthetic-profile-comments';
const fixture = await nativePostgresProfileFixture(connectionString, {
  ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
  CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
  JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
});
test.after(() => fixture.dispose());
const actor = async () => {
  const id = uuidv7();
  await sql("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
};
const call = (user, query = '', method = 'GET') => fixture.dispatchFetch(
  'https://api.lythaus.test/api/users/me/comments' + query, {
    method, headers: user ? { authorization: 'Bearer ' + user.token } : {},
  },
);
const post = async (user, { visibility = 'public', state = 'allowed', deleted = false } = {}) => {
  const id = uuidv7();
  await sql(`INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility,published_at,deleted_at)
    VALUES($1,$2,'Synthetic parent body','human',$3,$4,now(),CASE WHEN $5 THEN now() END)`,
  [id, user.id, state, visibility, deleted]);
  await sql("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [id]);
  return id;
};
const comment = async (user, postId, {
  state = 'allowed', deleted = false, mode = 'human', parentId = null,
  timestamp = '2026-10-10T10:00:00.123456Z', body = 'Synthetic own comment',
} = {}) => {
  const id = uuidv7();
  await sql(`INSERT INTO content.comments(id,post_id,author_id,body,declared_creation_mode,moderation_state,parent_id,depth,created_at,updated_at,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,CASE WHEN $10 THEN now() END)`,
  [id, postId, user.id, body, mode, state, parentId, parentId ? 1 : 0, timestamp, deleted]);
  return id;
};

test('actual Worker lists only owned accessible comments with stable microsecond pagination', async () => {
  const owner = await actor(); const other = await actor();
  const visible = await post(other);
  const foreignParent = await comment(other, visible, { body: 'Foreign parent secret' });
  const first = await comment(owner, visible, { body: 'Approved own comment' });
  const second = await comment(owner, visible, { body: 'Pending own reply', state: 'under_review', parentId: foreignParent });
  const third = await comment(owner, visible, { body: 'Older own comment', timestamp: '2026-10-10T10:00:00.123455Z' });
  await comment(other, visible, { body: 'Foreign comment secret' });
  for (const options of [{ deleted: true }, { state: 'blocked' }]) {
    await comment(owner, visible, { ...options, body: 'Unavailable comment secret' });
  }
  await assert.rejects(comment(owner, visible, { mode: 'ai_generated' }), { code: '23514' });
  const privateForeign = await post(other, { visibility: 'private' });
  const deletedPost = await post(other, { deleted: true });
  const blockedPost = await post(other, { state: 'blocked' });
  for (const postId of [privateForeign, deletedPost, blockedPost]) {
    await comment(owner, postId, { body: 'Inaccessible parent comment secret' });
  }
  const response = await call(owner, '?limit=1');
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Origin, Authorization');
  const newest = await response.json();
  assert.equal(newest.items[0].id, second);
  assert.equal(newest.items[0].moderationState, 'under_review');
  assert.equal(newest.items[0].parentId, foreignParent);
  const seen = [...newest.items]; let cursor = newest.nextCursor;
  while (cursor) {
    const next = await call(owner, '?limit=1&cursor=' + cursor);
    assert.equal(next.status, 200, await next.clone().text());
    const page = await next.json(); seen.push(...page.items); cursor = page.nextCursor;
  }
  assert.deepEqual(seen.map(item => item.id), [second, first, third]);
  assert.ok(seen.every(item => item.authorId === owner.id));
  assert.ok(!JSON.stringify(seen).includes('secret'));
  const otherResponse = await call(other);
  assert.equal(otherResponse.status, 200, await otherResponse.clone().text());
  const otherPage = await otherResponse.json();
  assert.ok(otherPage.items.length > 0);
  assert.ok(otherPage.items.every(item => item.authorId === other.id));
  assert.ok(otherPage.items.every(item => ![first, second, third].includes(item.id)));
  const empty = await actor();
  assert.deepEqual((await (await call(empty)).json()).items, []);
  assert.equal((await call(null)).status, 401);
  assert.equal((await call(owner, '?limit=21')).status, 400);
  assert.equal((await call(owner, '?cursor=broken')).status, 400);
  assert.equal((await call(owner, '', 'POST')).status, 404);
  assert.equal((await call(null, '', 'POST')).status, 404);
  await sql('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1', [owner.id]);
  assert.equal((await call(owner)).status, 401);
});

test('fresh reads revoke follow, block, deletion and inactive parent access immediately', async () => {
  const owner = await actor(); const other = await actor();
  const followers = await post(other, { visibility: 'followers' });
  const id = await comment(owner, followers);
  const initiallyHidden = await call(owner);
  assert.equal(initiallyHidden.status, 200, await initiallyHidden.clone().text());
  assert.deepEqual((await initiallyHidden.json()).items, []);
  await sql('INSERT INTO social.follows(follower_id,followed_id) VALUES($1,$2)', [owner.id, other.id]);
  assert.deepEqual((await (await call(owner)).json()).items.map(item => item.id), [id]);
  await sql('DELETE FROM social.follows WHERE follower_id=$1 AND followed_id=$2', [owner.id, other.id]);
  assert.deepEqual((await (await call(owner)).json()).items, []);
  await sql("UPDATE content.posts SET visibility='public' WHERE id=$1", [followers]);
  await sql('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2)', [other.id, owner.id]);
  assert.deepEqual((await (await call(owner)).json()).items, []);
  await sql('DELETE FROM social.blocks WHERE blocker_id=$1 AND blocked_id=$2', [other.id, owner.id]);
  assert.deepEqual((await (await call(owner)).json()).items.map(item => item.id), [id]);
  await sql("UPDATE identity.users SET status='suspended' WHERE id=$1", [other.id]);
  assert.deepEqual((await (await call(owner)).json()).items, []);
  await sql("UPDATE identity.users SET status='active' WHERE id=$1", [other.id]);
  await sql('UPDATE content.posts SET deleted_at=now() WHERE id=$1', [followers]);
  assert.deepEqual((await (await call(owner)).json()).items, []);
});

test('isolated collection handler executes canonical SQL under the local runtime role', async () => {
  const owner = await actor(); const other = await actor();
  const visible = await post(other);
  const hidden = await post(other, { visibility: 'private' });
  const allowed = await comment(owner, visible, { body: 'Local allowed comment' });
  const pending = await comment(owner, visible, { body: 'Local pending comment', state: 'under_review' });
  await comment(other, visible, { body: 'Foreign secret' });
  await comment(owner, hidden, { body: 'Inaccessible secret' });
  await comment(owner, visible, { body: 'Blocked secret', state: 'blocked' });
  await comment(owner, visible, { body: 'Deleted secret', deleted: true });
  const read = async (query = '') => handleOwnerContentRead(
    new Request('https://local.test/api/users/me/comments' + query), {
      authenticate: async () => ({ userId: owner.id }),
      query: async (text, values) => {
        const client = new pg.Client({ connectionString, ssl: false });
        await client.connect();
        try {
          await client.query('SET ROLE lythaus_runtime');
          return await client.query(text, values);
        } finally { await client.end(); }
      },
      respond: (body, status) => Response.json(body, { status,
        headers: { 'cache-control': 'private, no-store', vary: 'Origin, Authorization' } }),
    },
  );
  const response = await read('?limit=1');
  assert.equal(response.status, 200, await response.clone().text());
  const first = await response.json();
  assert.deepEqual(first.items.map(item => item.id), [pending]);
  const nextQuery = '?limit=1&cursor=' + first.nextCursor;
  const concurrent = await Promise.all([read(nextQuery), read(nextQuery)]);
  const pages = await Promise.all(concurrent.map(result => result.json()));
  assert.deepEqual(pages[0], pages[1]);
  assert.deepEqual(pages[0].items.map(item => item.id), [allowed]);
  assert.equal(pages[0].nextCursor, null);
  await sql('UPDATE content.comments SET deleted_at=now() WHERE id=$1', [allowed]);
  assert.deepEqual((await (await read(nextQuery)).json()).items, []);
  await sql('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2)', [other.id, owner.id]);
  assert.deepEqual((await (await read()).json()).items, []);
});
