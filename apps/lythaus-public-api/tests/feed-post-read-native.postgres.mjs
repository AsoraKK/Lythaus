import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { feedResponsePlan } from '../src/feed-runtime-policy.ts';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const actors = Object.fromEntries(['a', 'b', 'c'].map(name => [name, { id: uuidv7() }]));
const subjects = Object.values(actors).map(actor => actor.id);
const fixtureIps = Object.fromEntries(['guest', ...Object.keys(actors)].map(name => [name,
  '2001:db8:' + uuidv7().replaceAll('-', '').slice(-16).match(/.{4}/g).join(':') + '::1']));
const rateHashes = Object.values(fixtureIps).map(ip => createHash('sha256').update(`public-api:${ip}`).digest('hex'));
const posts = {}, comments = {}, queries = [];
let control, fixture, outbound = 0;

async function seedPost(name, actor, { state = 'allowed', visibility = 'public', deleted = false, label = 'Human-authored' } = {}) {
  const id = uuidv7(), body = 'SYNTHETIC_POST_' + name;
  await control.query(`INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility,published_at,deleted_at)
    VALUES($1,$2,$3,'human',$4,$5,CASE WHEN $4='allowed' THEN now() END,CASE WHEN $6 THEN now() END)`,
  [id, actors[actor].id, body, state, visibility, deleted]);
  await control.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human',$2)", [id, label]);
  posts[name] = { id, body, actor };
  for (const viewer of ['a', 'b']) await control.query(
    "INSERT INTO feed.user_inbox(user_id,post_id,source) VALUES($1,$2,'synthetic-read-fixture')", [actors[viewer].id, id]);
  return id;
}

async function seedComment(name, actor, post, { state = 'allowed', deleted = false, parentId = null } = {}) {
  const id = uuidv7(), body = 'SYNTHETIC_COMMENT_' + name;
  await control.query(`INSERT INTO content.comments(id,post_id,author_id,body,declared_creation_mode,moderation_state,parent_id,depth,deleted_at)
    VALUES($1,$2,$3,$4,'human',$5,$6,$7,CASE WHEN $8 THEN now() END)`,
  [id, posts[post].id, actors[actor].id, body, state, parentId, parentId ? 1 : 0, deleted]);
  comments[name] = { id, body, actor };
  return id;
}

before(async () => {
  control = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await control.connect();
  await control.query("SET statement_timeout='5s'");
  const version = Number((await control.query('SHOW server_version_num')).rows[0].server_version_num);
  assert.ok(version >= 170000 && version < 180000);
  await control.query('BEGIN');
  try {
    for (const id of subjects) await control.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
    await seedPost('publicA', 'a');
    await seedPost('publicB', 'b');
    await seedPost('privateA', 'a', { visibility: 'private' });
    await seedPost('followersA', 'a', { visibility: 'followers' });
    await seedPost('pendingA', 'a', { state: 'under_review', label: 'Under review' });
    await seedPost('rejectedA', 'a', { state: 'blocked' });
    await seedPost('deletedA', 'a', { deleted: true });
    await seedPost('unlabelledA', 'a', { label: null });
    for (const name of Object.keys(posts)) await seedComment(name, 'c', name);
    await seedComment('pending', 'a', 'publicA', { state: 'under_review' });
    await seedComment('rejected', 'a', 'publicA', { state: 'blocked' });
    await seedComment('deleted', 'a', 'publicA', { deleted: true });
    await seedComment('reply', 'b', 'publicA', { parentId: comments.publicA.id });
    await control.query("INSERT INTO social.reactions(user_id,post_id,reaction_type) VALUES($1,$3,'like'),($2,$3,'support')",
      [actors.a.id, actors.b.id, posts.publicA.id]);
    await control.query('COMMIT');
  } catch (error) { await control.query('ROLLBACK'); throw error; }
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey), keyId = 'synthetic-feed-read';
  for (const actor of Object.values(actors)) actor.token = await signAccessToken({ userId: actor.id, privateKeyPem, keyId });
  fixture = await nativePostgresProfileFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-feed-read' },
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  }, {
    outboundService: async () => { outbound += 1; return new Response(null, { status: 403 }); },
    onQuery: row => {
      assert.equal(row.role, 'lythaus_runtime');
      assert.ok(!row.rolsuper && !row.rolcreaterole && !row.rolcreatedb);
      queries.push(row);
    },
  });
});

after(async () => {
  try { await fixture?.dispose(); }
  finally {
    if (control) {
      try {
        await control.query('BEGIN');
        await control.query('DELETE FROM content.comments WHERE post_id=ANY($1::uuid[])', [Object.values(posts).map(post => post.id)]);
        await control.query('DELETE FROM content.posts WHERE author_id=ANY($1::uuid[])', [subjects]);
        await control.query('DELETE FROM social.follows WHERE follower_id=ANY($1::uuid[]) OR followed_id=ANY($1::uuid[])', [subjects]);
        await control.query('DELETE FROM social.blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])', [subjects]);
        await control.query("DELETE FROM system.rate_limit_windows WHERE scope='public-api' AND subject_hash=ANY($1::text[])", [rateHashes]);
        await control.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [subjects]);
        assert.equal((await control.query('SELECT count(*)::integer AS count FROM identity.users WHERE id=ANY($1::uuid[])', [subjects])).rows[0].count, 0);
        assert.equal((await control.query("SELECT count(*)::integer AS count FROM system.rate_limit_windows WHERE scope='public-api' AND subject_hash=ANY($1::text[])", [rateHashes])).rows[0].count, 0);
        await control.query('COMMIT');
        process.stdout.write('Native feed-read cleanup: zero owned users and rate windows.\n');
      } catch (error) { await control.query('ROLLBACK'); throw error; }
      finally { await control.end(); }
    }
  }
});

const call = (actor, path) => fixture.dispatchFetch('https://api.lythaus.test' + path, {
  headers: { origin: 'https://app.lythaus.test', 'cf-connecting-ip': fixtureIps[actor ?? 'guest'],
    ...(actor ? { authorization: 'Bearer ' + actors[actor].token } : {}) },
});

async function read(actor, path, surface = 'post') {
  const response = await call(actor, path);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), feedResponsePlan(surface, Boolean(actor)).cacheControl);
  assert.equal(response.headers.get('vary'), 'Origin, Authorization');
  return response.json();
}

async function denied(actor, path, status = 404, error = 'post_not_found') {
  const response = await call(actor, path);
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['correlationId', 'error']);
  assert.equal(body.error, error);
  assert.equal(body.correlationId, response.headers.get('x-correlation-id'));
  const headers = Object.fromEntries(response.headers);
  delete headers['x-correlation-id'];
  return { status, body: { error }, headers };
}

const postPath = name => '/api/posts/' + posts[name].id;
const idsOf = items => items.map(item => item.id).sort();

test('native guest, owner and unrelated member feeds exclude pending, rejected, deleted and private content', async () => {
  const publicIds = [posts.publicA.id, posts.publicB.id].sort();
  const fixturePostIds = new Set(Object.values(posts).map(post => post.id));
  for (const actor of [undefined, 'a', 'b', 'a']) {
    const discovery = await read(actor, '/api/feed/discover', 'discovery');
    assert.deepEqual(idsOf(discovery.items.filter(item => fixturePostIds.has(item.id))), publicIds);
    for (const name of ['pendingA', 'rejectedA', 'privateA', 'followersA', 'deletedA', 'unlabelledA']) {
      assert.ok(!JSON.stringify(discovery).includes(posts[name].body));
    }
  }
  await denied(undefined, '/api/feed', 401, 'authentication_required');
  for (const actor of ['a', 'b', 'a']) {
    const personal = await read(actor, '/api/feed?userId=' + actors[actor === 'a' ? 'b' : 'a'].id, 'personal');
    const expected = actor === 'a' ? [...publicIds, posts.privateA.id, posts.followersA.id].sort() : publicIds;
    assert.deepEqual(idsOf(personal.items), expected);
    const publicA = personal.items.find(item => item.id === posts.publicA.id);
    assert.equal(publicA.viewerReaction, actor === 'a' ? 'like' : 'support');
  }
  await control.query('INSERT INTO social.follows(follower_id,followed_id) VALUES($1,$2)', [actors.b.id, actors.a.id]);
  try {
    assert.ok((await read('b', '/api/feed', 'personal')).items.some(item => item.id === posts.followersA.id));
    assert.equal((await read('b', postPath('followersA'))).post.id, posts.followersA.id);
  } finally { await control.query('DELETE FROM social.follows WHERE follower_id=$1 AND followed_id=$2', [actors.b.id, actors.a.id]); }
  await denied('b', postPath('followersA'));
});

test('native public and private known-ID reads bind the account across A to B to A', async () => {
  for (const actor of [undefined, 'a', 'b', 'a']) {
    const body = await read(actor, postPath('publicA'));
    assert.equal(body.post.body, posts.publicA.body);
    assert.equal(body.post.viewerReaction, actor === undefined ? null : actor === 'a' ? 'like' : 'support');
    for (const name of ['pendingA', 'rejectedA', 'deletedA', 'unlabelledA']) await denied(actor, postPath(name));
    for (const name of ['privateA', 'followersA']) {
      if (actor === 'a') assert.equal((await read(actor, postPath(name))).post.body, posts[name].body);
      else await denied(actor, postPath(name));
    }
  }
  for (const actor of ['a', 'b', 'a']) {
    const path = postPath('pendingA') + '/owner-view';
    if (actor === 'a') {
      const body = await read(actor, path);
      assert.equal(body.post.body, posts.pendingA.body);
      assert.equal(body.post.moderationState, 'under_review');
      assert.ok(!('publicLabel' in body.post));
    } else await denied(actor, path);
    await denied(actor, postPath('rejectedA') + '/owner-view');
  }
  await denied(undefined, postPath('pendingA') + '/owner-view', 401, 'authentication_required');
});

test('native comments hide pending and rejected bodies, redact deleted bodies and isolate private owner reads', async () => {
  for (const actor of [undefined, 'a', 'b', 'a']) {
    const body = await read(actor, postPath('publicA') + '/comments', 'comments');
    assert.deepEqual(idsOf(body.items), [comments.publicA.id, comments.deleted.id, comments.reply.id].sort());
    assert.equal(body.items.find(item => item.id === comments.deleted.id).body, null);
    for (const name of ['pending', 'rejected', 'deleted']) assert.ok(!JSON.stringify(body).includes(comments[name].body));
    for (const name of ['pendingA', 'rejectedA', 'deletedA', 'privateA', 'followersA', 'unlabelledA']) {
      const hidden = await read(actor, postPath(name) + '/comments', 'comments');
      assert.deepEqual(idsOf(hidden.items), actor === 'a' && ['privateA', 'followersA'].includes(name) ? [comments[name].id] : []);
    }
  }
  for (const actor of ['a', 'b', 'a']) {
    const path = '/api/comments/' + comments.pending.id + '/owner-view';
    if (actor === 'a') assert.equal((await read(actor, path)).comment.body, comments.pending.body);
    else await denied(actor, path, 404, 'comment_not_found');
  }
  await denied(undefined, '/api/comments/' + comments.pending.id + '/owner-view', 401, 'authentication_required');
  for (const name of ['rejected', 'deleted']) await denied('a', '/api/comments/' + comments[name].id + '/owner-view', 404, 'comment_not_found');
});

test('native reads withdraw current post and comment revisions while stale inbox and declarations remain', async () => {
  const revisedPost = 'SYNTHETIC_PRIVATE_POST_REVISION', revisedComment = 'SYNTHETIC_PRIVATE_COMMENT_REVISION';
  await control.query("UPDATE content.posts SET body=$1,moderation_state='under_review',published_at=NULL WHERE id=$2", [revisedPost, posts.publicA.id]);
  await control.query("UPDATE content.comments SET body=$1,moderation_state='under_review' WHERE id=$2", [revisedComment, comments.publicB.id]);
  try {
    for (const actor of [undefined, 'a', 'b', 'a']) {
      await denied(actor, postPath('publicA'));
      assert.ok(!(await read(actor, '/api/feed/discover', 'discovery')).items.some(item => item.id === posts.publicA.id));
      assert.deepEqual((await read(actor, postPath('publicA') + '/comments', 'comments')).items, []);
      assert.ok(!JSON.stringify(await read(actor, postPath('publicB') + '/comments', 'comments')).includes(revisedComment));
      if (actor) assert.ok(!(await read(actor, '/api/feed', 'personal')).items.some(item => item.id === posts.publicA.id));
    }
    assert.equal((await read('a', postPath('publicA') + '/owner-view')).post.body, revisedPost);
    await denied('b', postPath('publicA') + '/owner-view');
    assert.equal((await read('c', '/api/comments/' + comments.publicB.id + '/owner-view')).comment.body, revisedComment);
    await denied('b', '/api/comments/' + comments.publicB.id + '/owner-view', 404, 'comment_not_found');
  } finally {
    await control.query("UPDATE content.posts SET body=$1,moderation_state='allowed',published_at=now() WHERE id=$2", [posts.publicA.body, posts.publicA.id]);
    await control.query("UPDATE content.comments SET body=$1,moderation_state='allowed' WHERE id=$2", [comments.publicB.body, comments.publicB.id]);
  }
});

test('native comment listings respect parent-author blocks', async () => {
  for (const pair of [[actors.a.id, actors.b.id], [actors.b.id, actors.a.id]]) {
    await control.query('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2)', pair);
    try {
      await denied('b', postPath('publicA'));
      assert.deepEqual((await read('b', postPath('publicA') + '/comments', 'comments')).items, []);
    } finally { await control.query('DELETE FROM social.blocks WHERE blocker_id=$1 AND blocked_id=$2', pair); }
  }
});

test('native comment listings respect inactive parent-author accounts', async () => {
  await control.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [actors.a.id]);
  try {
    for (const actor of [undefined, 'b']) {
      await denied(actor, postPath('publicA'));
      assert.deepEqual((await read(actor, postPath('publicA') + '/comments', 'comments')).items, []);
    }
  } finally { await control.query("UPDATE identity.users SET status='active' WHERE id=$1", [actors.a.id]); }
});

for (const suffix of ['', '/comments']) {
  test(`native hostile ${suffix ? 'comment-list' : 'post'} identifiers fail privately before content SQL`, async () => {
    for (const actor of [undefined, 'a', 'b']) {
      const encoded = await read(actor, '/api/posts/' + posts.publicA.id.replace('0', '%30') + suffix, suffix ? 'comments' : 'post');
      if (suffix) assert.ok(encoded.items.some(item => item.id === comments.publicA.id));
      else assert.equal(encoded.post.id, posts.publicA.id);
      const missing = await denied(actor, '/api/posts/' + uuidv7());
      for (const id of ['not-a-uuid', `${uuidv7()}' OR '1'='1`, '../../private', '%']) {
        const path = '/api/posts/' + encodeURIComponent(id) + suffix;
        const start = queries.length;
        assert.deepEqual(await denied(actor, path), missing);
        assert.ok(!queries.slice(start).some(row => row.text.includes('FROM content.posts') || row.text.includes('FROM content.comments')));
      }
      assert.deepEqual((await read(actor, '/api/posts/' + uuidv7() + '/comments', 'comments')).items, []);
    }
  });
}

test('native feed and content SQL use only the restricted runtime role with no outbound destinations', () => {
  assert.ok(queries.length > 0 && queries.every(row => row.role === 'lythaus_runtime' && !row.rolsuper && !row.rolcreaterole && !row.rolcreatedb));
  assert.equal(outbound, 0);
});
