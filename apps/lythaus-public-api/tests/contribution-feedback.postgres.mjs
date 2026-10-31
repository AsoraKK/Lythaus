import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { changeFeedback, readFeedback } from '../src/contribution-feedback.ts';
import { exportContributionFeedback, purgeContributionFeedback } from '../../lythaus-jobs/src/contribution-feedback-privacy.ts';
import { nativePostgresProfileFixture } from './native-postgres-worker-fixture.mjs';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const users = Object.fromEntries(['author', 'alice', 'bob', 'blocked'].map(name => [name, { id: uuidv7() }]));
const posts = Object.fromEntries(['public', 'private', 'followers', 'unlabelled', 'pending'].map(name => [name, uuidv7()]));
const comments = { visible: uuidv7(), deleted: uuidv7(), pending: uuidv7(), blocked: uuidv7(), child: uuidv7() };
let db, enabled, disabled, afterFixtureQuery, onFixtureQuery;

before(async () => {
  db = new pg.Client({ connectionString, ssl: false });
  await db.connect();
  assert.match((await db.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  assert.equal((await db.query("SELECT to_regclass('social.contribution_feedback') AS name")).rows[0].name, null);
  assert.deepEqual(await exportContributionFeedback(db, users.alice.id), []);
  await purgeContributionFeedback(db, users.alice.id);
  await db.query(await readFile('docs/proposals/contribution-feedback-schema.sql', 'utf8'));
  for (const { id } of Object.values(users)) await db.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  for (const [name, id] of Object.entries(posts)) {
    await db.query(`INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility,published_at)
      VALUES($1,$2,'synthetic','human',$3,$4,now())`,
    [id, users.author.id, name === 'pending' ? 'under_review' : 'allowed', name === 'private' ? 'private' : name === 'followers' ? 'followers' : 'public']);
    await db.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human',$2)", [id, name === 'unlabelled' ? null : 'Human-authored']);
  }
  for (const [name, id] of Object.entries(comments)) {
    const parent = name === 'child' ? comments.blocked : null;
    await db.query(`INSERT INTO content.comments(id,post_id,author_id,body,declared_creation_mode,moderation_state,parent_id,depth,deleted_at)
      VALUES($1,$2,$3,'synthetic','human',$4,$5,$6,CASE WHEN $7 THEN now() END)`,
    [id, posts.public, name === 'blocked' ? users.blocked.id : users.bob.id, name === 'pending' ? 'under_review' : 'allowed', parent, parent ? 1 : 0, name === 'deleted']);
  }
  await db.query("INSERT INTO social.reactions(user_id,post_id,reaction_type) VALUES($1,$2,'insightful')", [users.alice.id, posts.public]);
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey), kid = 'synthetic-feedback';
  for (const user of Object.values(users)) user.token = await signAccessToken({ userId: user.id, privateKeyPem, keyId: kid });
  const bindings = { ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-feedback' },
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid, alg: 'ES256', use: 'sig' }] }) };
  enabled = await nativePostgresProfileFixture(connectionString, { ...bindings, CONTRIBUTION_FEEDBACK_ENABLED: 'true' }, {
    afterQuery: (...args) => afterFixtureQuery?.(...args),
    onQuery: (...args) => onFixtureQuery?.(...args),
    shouldTraceQueries: () => onFixtureQuery !== undefined,
  });
  disabled = await nativePostgresProfileFixture(connectionString, bindings);
});

after(async () => {
  await disabled?.dispose();
  await enabled?.dispose();
  await db?.end();
});

const target = (type, id) => ({ type, id });
const path = (type, id, channel = '') => `/api/feedback/${type}/${id}${channel ? '/' + channel : ''}`;
const call = (runtime, user, method, url, value, key = uuidv7()) => runtime.dispatchFetch('https://api.lythaus.test' + url, {
  method, headers: { origin: 'https://app.lythaus.test', 'cf-connecting-ip': '2001:db8::cafe',
    ...(user ? { authorization: 'Bearer ' + users[user].token } : {}),
    ...(method === 'PUT' ? { 'content-type': 'application/json', 'idempotency-key': key } : {}) },
  ...(method === 'PUT' ? { body: JSON.stringify({ value }) } : {}),
});
async function mutate(client, actor, item, channel, value) {
  await client.query('BEGIN');
  try {
    const result = await changeFeedback(client, { target: item, actor, channel, value, id: uuidv7(), audit: async () => {} });
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

test('default-off gate and separate persisted channels on posts and comments', async () => {
  assert.equal((await call(disabled, 'alice', 'GET', path('post', posts.public))).status, 404);
  for (const item of [target('post', posts.public), target('comment', comments.visible)]) {
    const quality = await call(enabled, 'alice', 'PUT', path(item.type, item.id, 'quality'), 'like');
    assert.equal(quality.status, 200, await quality.clone().text());
    const emotion = await call(enabled, 'alice', 'PUT', path(item.type, item.id, 'emotion'), 'sad');
    assert.equal(emotion.status, 200, await emotion.clone().text());
    const read = await call(enabled, 'alice', 'GET', path(item.type, item.id));
    assert.equal(read.status, 200, await read.clone().text());
    assert.equal(read.headers.get('cache-control'), 'private, no-store');
    const state = await read.json();
    assert.equal(state.quality.myValue, 'like');
    assert.equal(state.emotion.myValue, 'sad');
    assert.equal(state.quality.counts.like, 1);
    assert.equal(state.emotion.counts.sad, 1);
  }
  assert.equal((await db.query('SELECT reaction_type FROM social.reactions WHERE user_id=$1 AND post_id=$2', [users.alice.id, posts.public])).rows[0].reaction_type, 'insightful');
});

test('authorization, visibility, blocked ancestry, self-votes and input validation', async () => {
  for (const name of ['private', 'followers', 'unlabelled', 'pending']) {
    assert.equal((await call(enabled, 'alice', 'GET', path('post', posts[name]))).status, 404, name);
  }
  for (const name of ['deleted', 'pending']) assert.equal((await call(enabled, 'alice', 'GET', path('comment', comments[name]))).status, 404, name);
  assert.equal((await call(enabled, null, 'PUT', path('post', posts.public, 'quality'), 'like')).status, 401);
  assert.equal((await call(enabled, 'author', 'PUT', path('post', posts.public, 'quality'), 'like')).status, 400);
  await assert.rejects(mutate(db, users.author.id.toUpperCase(), target('post', posts.public), 'quality', 'like'), /self_reaction_not_allowed/);
  assert.equal((await call(enabled, 'bob', 'PUT', path('comment', comments.visible, 'emotion'), 'sad')).status, 400);
  assert.equal((await call(enabled, 'alice', 'PUT', path('post', posts.public, 'quality'), 'angry')).status, 400);
  const malformed = await enabled.dispatchFetch('https://api.lythaus.test' + path('post', posts.public, 'quality'), {
    method: 'PUT', headers: { origin: 'https://app.lythaus.test', 'cf-connecting-ip': '2001:db8::cafe',
      authorization: 'Bearer ' + users.alice.token, 'content-type': 'application/json', 'idempotency-key': uuidv7() }, body: 'null',
  });
  assert.equal(malformed.status, 400);
  await db.query('INSERT INTO social.follows(follower_id,followed_id) VALUES($1,$2)', [users.alice.id, users.author.id]);
  assert.equal((await call(enabled, 'alice', 'GET', path('post', posts.followers))).status, 200);
  await db.query('DELETE FROM social.follows WHERE follower_id=$1 AND followed_id=$2', [users.alice.id, users.author.id]);
  await db.query('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2)', [users.alice.id, users.blocked.id]);
  assert.equal((await call(enabled, 'blocked', 'PUT', path('post', posts.public, 'quality'), 'dislike')).status, 200);
  assert.equal((await (await call(enabled, 'alice', 'GET', path('post', posts.public))).json()).quality.counts.dislike, 0);
  assert.equal((await (await call(enabled, null, 'GET', path('post', posts.public))).json()).quality.counts.dislike, 1);
  assert.equal((await call(enabled, 'alice', 'GET', path('comment', comments.blocked))).status, 404);
  assert.equal((await call(enabled, 'alice', 'GET', path('comment', comments.child))).status, 404);
  await db.query('INSERT INTO social.blocks(blocker_id,blocked_id) VALUES($1,$2)', [users.author.id, users.alice.id]);
  assert.equal((await call(enabled, 'alice', 'PUT', path('post', posts.public, 'emotion'), 'angry')).status, 404);
  await db.query('DELETE FROM social.blocks WHERE blocker_id=$1 AND blocked_id=$2', [users.author.id, users.alice.id]);
});

test('replay, change and removal are idempotent and do not affect the other channel', async () => {
  const key = uuidv7(), url = path('post', posts.public, 'quality');
  const first = await call(enabled, 'alice', 'PUT', url, 'dislike', key);
  const replay = await call(enabled, 'alice', 'PUT', url, 'dislike', key);
  assert.equal(first.status, 200, await first.clone().text());
  assert.deepEqual(await first.json(), await replay.json());
  assert.equal((await call(enabled, 'alice', 'PUT', url, 'like', key)).status, 409);
  const removal = await call(enabled, 'alice', 'PUT', url, null);
  assert.equal(removal.status, 200, await removal.clone().text());
  assert.equal((await removal.json()).changed, true);
  assert.equal((await (await call(enabled, 'alice', 'PUT', url, null)).json()).changed, false);
  const state = await (await call(enabled, 'alice', 'GET', path('post', posts.public))).json();
  assert.equal(state.quality.myValue, null);
  assert.equal(state.emotion.myValue, 'sad');
});

test('concurrent changes serialize per actor, target and channel', async () => {
  const first = new pg.Client({ connectionString, ssl: false }), second = new pg.Client({ connectionString, ssl: false });
  await Promise.all([first.connect(), second.connect()]);
  try {
    await Promise.all([
      mutate(first, users.alice.id, target('post', posts.public), 'quality', 'like'),
      mutate(second, users.alice.id, target('post', posts.public), 'quality', 'dislike'),
    ]);
    const rows = await db.query("SELECT value FROM social.contribution_feedback WHERE actor_id=$1 AND post_id=$2 AND channel='quality'", [users.alice.id, posts.public]);
    assert.equal(rows.rowCount, 1);
    assert.ok(['like', 'dislike'].includes(rows.rows[0].value));
    const state = await readFeedback(db, target('post', posts.public), users.alice.id);
    assert.equal(state.quality.counts.like + state.quality.counts.dislike, 1);
    assert.equal(state.emotion.myValue, 'sad');
    await Promise.all([
      mutate(first, users.alice.id, target('post', posts.public.toUpperCase()), 'quality', 'dislike'),
      mutate(second, users.alice.id, target('post', posts.public), 'emotion', 'angry'),
    ]);
    const both = await readFeedback(db, target('post', posts.public), users.alice.id);
    assert.equal(both.quality.myValue, 'dislike');
    assert.equal(both.emotion.myValue, 'angry');
  } finally { await Promise.all([first.end(), second.end()]); }
});

test('privacy export and deletion include feedback; no reputation events are emitted', async () => {
  const exported = await exportContributionFeedback(db, users.alice.id);
  assert.ok(exported.length >= 3);
  assert.ok(exported.every(item => !('actor_id' in item)));
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE lythaus_privacy');
    await db.query('SELECT privacy.reconcile_subject_data_locations($1)', [users.alice.id]);
    const locations = await db.query("SELECT count(*)::integer AS n FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='social.contribution_feedback'", [users.alice.id]);
    assert.equal(locations.rows[0].n, exported.length);
    await db.query('ROLLBACK');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE lythaus_jobs');
    await purgeContributionFeedback(db, users.alice.id);
    assert.equal((await exportContributionFeedback(db, users.alice.id)).length, 0);
    await db.query('ROLLBACK');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM trust.reputation_events')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM trust.reward_redemptions')).rows[0].n, 0);
  const activity = await db.query("SELECT event_type, reputation_effect FROM trust.user_activity_events WHERE user_id=$1 AND object_id=$2", [users.alice.id, posts.public]);
  assert.ok(activity.rowCount >= 3);
  assert.ok(activity.rows.every(event => event.reputation_effect === 'none'));
});

test('account deletion cannot overtake an in-flight feedback write', async () => {
  const writer = new pg.Client({ connectionString, ssl: false });
  const locker = new pg.Client({ connectionString, ssl: false });
  await Promise.all([writer.connect(), locker.connect()]);
  try {
    await writer.query('BEGIN');
    await changeFeedback(writer, { target: target('post', posts.public), actor: users.bob.id,
      channel: 'emotion', value: 'sad', id: uuidv7(), audit: async () => {} });
    const locked = locker.query("UPDATE identity.users SET status='locked' WHERE id=$1", [users.bob.id]);
    assert.equal(await Promise.race([locked.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 50))]), false);
    await writer.query('COMMIT');
    await locked;
    await assert.rejects(mutate(writer, users.bob.id, target('post', posts.public), 'emotion', 'angry'), /authentication_required/);
    await locker.query("UPDATE identity.users SET status='active' WHERE id=$1", [users.bob.id]);
  } finally {
    await writer.query('ROLLBACK').catch(() => {});
    await Promise.all([writer.end(), locker.end()]);
  }
});

async function waitUntilBlocked(pid) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.query('SELECT cardinality(pg_blocking_pids($1)) AS blockers', [pid]);
    if (result.rows[0].blockers > 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('expected transaction to wait for its visibility lock');
}

test('real block, mute and unfollow routes serialize against feedback visibility', async () => {
  const writer = new pg.Client({ connectionString, ssl: false });
  await writer.connect();
  try {
    for (const action of ['block', 'mute', 'unfollow']) {
      if (action === 'unfollow') {
        await db.query('INSERT INTO social.follows(follower_id, followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [users.alice.id, users.author.id]);
      }
      let release, locked;
      const held = new Promise(resolve => { release = resolve; });
      const acquired = new Promise(resolve => { locked = resolve; });
      afterFixtureQuery = async input => {
        if (input.text.includes('ORDER BY id FOR UPDATE') && input.text.includes('identity.users')) {
          afterFixtureQuery = undefined;
          locked();
          await held;
        }
      };
      const url = action === 'unfollow' ? `/api/follows/${users.author.id}` : `/api/${action}s`;
      const request = enabled.dispatchFetch('https://api.lythaus.test' + url, {
        method: action === 'unfollow' ? 'DELETE' : 'POST',
        headers: { origin: 'https://app.lythaus.test', 'cf-connecting-ip': '2001:db8::cafe',
          authorization: 'Bearer ' + users.alice.token, 'content-type': 'application/json', 'idempotency-key': uuidv7() },
        ...(action === 'unfollow' ? {} : { body: JSON.stringify({ userId: users.author.id }) }),
      });
      await acquired;
      const item = target('post', action === 'unfollow' ? posts.followers : posts.public);
      const write = mutate(writer, users.alice.id, item, 'quality', 'like');
      const rejection = assert.rejects(write, /post_not_found/);
      await waitUntilBlocked(writer.processID);
      release();
      const response = await request;
      assert.ok(response.ok, await response.text());
      await rejection;
      if (action === 'block') await db.query('DELETE FROM social.blocks WHERE blocker_id=$1 AND blocked_id=$2', [users.alice.id, users.author.id]);
      if (action === 'mute') await db.query('DELETE FROM social.mutes WHERE muter_id=$1 AND muted_id=$2', [users.alice.id, users.author.id]);
    }
  } finally {
    afterFixtureQuery = undefined;
    await writer.query('ROLLBACK').catch(() => {});
    await writer.end();
  }
});

test('a real block waits for a feedback transaction already in progress', async () => {
  const writer = new pg.Client({ connectionString, ssl: false });
  await writer.connect();
  try {
    await writer.query('BEGIN');
    await changeFeedback(writer, { target: target('post', posts.public), actor: users.alice.id,
      channel: 'quality', value: 'like', id: uuidv7(), audit: async () => {} });
    let started;
    const waiting = new Promise(resolve => { started = resolve; });
    onFixtureQuery = input => {
      if (input.text.includes('ORDER BY id FOR UPDATE') && input.text.includes('identity.users')) {
        onFixtureQuery = undefined;
        started(input.backendPid);
      }
    };
    const request = enabled.dispatchFetch('https://api.lythaus.test/api/blocks', {
      method: 'POST', headers: { origin: 'https://app.lythaus.test', 'cf-connecting-ip': '2001:db8::cafe',
        authorization: 'Bearer ' + users.alice.token, 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ userId: users.author.id }),
    });
    await waitUntilBlocked(await waiting);
    await writer.query('COMMIT');
    const response = await request;
    assert.ok(response.ok, await response.text());
    assert.equal((await call(enabled, 'alice', 'GET', path('post', posts.public))).status, 404);
  } finally {
    onFixtureQuery = undefined;
    await writer.query('ROLLBACK').catch(() => {});
    await writer.end();
    await db.query('DELETE FROM social.blocks WHERE blocker_id=$1 AND blocked_id=$2', [users.alice.id, users.author.id]);
  }
});

test('ancestor moderation and feedback are serialized in both orders', async () => {
  const parent = uuidv7(), child = uuidv7();
  await db.query(`INSERT INTO content.comments(id,post_id,author_id,body,declared_creation_mode,moderation_state,parent_id,depth)
    VALUES($1,$3,$4,'synthetic','human','allowed',NULL,0),($2,$3,$5,'synthetic','human','allowed',$1,1)`,
  [parent, child, posts.public, users.bob.id, users.author.id]);
  const writer = new pg.Client({ connectionString, ssl: false });
  const moderator = new pg.Client({ connectionString, ssl: false });
  await Promise.all([writer.connect(), moderator.connect()]);
  try {
    await moderator.query('BEGIN');
    await moderator.query("UPDATE content.comments SET moderation_state='under_review' WHERE id=$1", [parent]);
    const rejected = mutate(writer, users.alice.id, target('comment', child), 'quality', 'like');
    const rejection = assert.rejects(rejected, /comment_not_found/);
    await waitUntilBlocked(writer.processID);
    await moderator.query('COMMIT');
    await rejection;
    assert.equal((await db.query('SELECT count(*)::int AS n FROM social.contribution_feedback WHERE comment_id=$1', [child])).rows[0].n, 0);
    await db.query("UPDATE content.comments SET moderation_state='allowed' WHERE id=$1", [parent]);
    await writer.query('BEGIN');
    await changeFeedback(writer, { target: target('comment', child), actor: users.alice.id,
      channel: 'quality', value: 'like', id: uuidv7(), audit: async () => {} });
    const moderation = moderator.query("UPDATE content.comments SET moderation_state='under_review' WHERE id=$1", [parent]);
    await waitUntilBlocked(moderator.processID);
    await writer.query('COMMIT');
    await moderation;
    assert.equal((await call(enabled, 'alice', 'GET', path('comment', child))).status, 404);
  } finally {
    await Promise.all([writer.query('ROLLBACK').catch(() => {}), moderator.query('ROLLBACK').catch(() => {})]);
    await Promise.all([writer.end(), moderator.end()]);
  }
});
