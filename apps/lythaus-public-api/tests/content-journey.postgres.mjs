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
  || !((target.pathname.startsWith('/lythaus_content_test') || target.pathname.startsWith('/lythaus_auth_test')) || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Content journey tests require an explicitly local disposable PostgreSQL database');
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
const keyId = 'synthetic-local-content-test';
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


async function create(actor, path, body, key = uuidv7()) {
  const response = await call(actor, 'POST', body, path, key);
  assert.equal(response.status, 201, await response.clone().text());
  return { data: await response.json(), key };
}
async function publishedPost(actor) {
  const id = uuidv7();
  await sql("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,published_at) VALUES($1,$2,'Published fixture','human','allowed',now())", [id, actor.id]);
  await sql("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [id]);
  return id;
}

test('pending post can be privately reopened, edited and deleted with exact replay acknowledgements', async () => {
  const actor = await owner();
  const other = await owner();
  const body = { body: 'Private pending post', declaredCreationMode: 'human', geoScope: 'none' };
  const created = await create(actor, '/api/posts', body);
  const id = created.data.id;
  assert.ok(id);
  const replay = await call(actor, 'POST', body, '/api/posts', created.key);
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), created.data);
  assert.equal((await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.post.created'", [id])).rowCount, 1);
  for (const viewer of [null, other, actor]) {
    assert.equal((await call(viewer, 'GET', undefined, '/api/posts/' + id)).status, 404);
  }
  for (const viewer of [null, other]) {
    const response = await call(viewer, 'GET', undefined, '/api/posts/' + id + '/owner-view');
    assert.equal(response.status, viewer ? 404 : 401);
    assert.ok(!(await response.text()).includes(body.body));
  }
  const own = await call(actor, 'GET', undefined, '/api/posts/' + id + '/owner-view');
  assert.equal(own.status, 200, await own.clone().text());
  assert.match(own.headers.get('cache-control'), /private.*no-store/);
  assert.match(own.headers.get('vary'), /Authorization/i);
  const privatePost = (await own.json()).post;
  assert.equal(privatePost.body, body.body);
  assert.equal(privatePost.moderationState, 'under_review');
  assert.ok(!('publicLabel' in privatePost));
  const editBody = { body: 'Private pending revision', declaredCreationMode: 'ai_assisted' };
  const editKey = uuidv7();
  const edited = await call(actor, 'PUT', editBody, '/api/posts/' + id, editKey);
  assert.equal(edited.status, 200, await edited.clone().text());
  const revision = await edited.json();
  assert.equal((revision.post ?? revision).moderationState, 'under_review');
  assert.deepEqual(await (await call(actor, 'PUT', editBody, '/api/posts/' + id, editKey)).json(), revision);
  assert.equal((await (await call(actor, 'GET', undefined, '/api/posts/' + id + '/owner-view')).json()).post.body, editBody.body);
  assert.equal((await call(other, 'PUT', editBody, '/api/posts/' + id, uuidv7())).status, 404);
  const deleteKey = uuidv7();
  const deleted = await call(actor, 'DELETE', undefined, '/api/posts/' + id, deleteKey);
  assert.equal(deleted.status, 200);
  const acknowledgement = await deleted.json();
  assert.equal(acknowledgement.deleted, true);
  assert.deepEqual(await (await call(actor, 'DELETE', undefined, '/api/posts/' + id, deleteKey)).json(), acknowledgement);
  assert.equal((await call(actor, 'GET', undefined, '/api/posts/' + id + '/owner-view')).status, 404);
  assert.equal((await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.post.deleted'", [id])).rowCount, 1);
});

test('private comment read binds the comment author and never reveals another author or parent body', async () => {
  const postAuthor = await owner();
  const commentAuthor = await owner();
  const other = await owner();
  const postId = await publishedPost(postAuthor);
  const original = await create(commentAuthor, '/api/posts/' + postId + '/comments',
    { body: 'Own pending comment', declaredCreationMode: 'human' });
  const id = original.data.id;
  assert.ok(id);
  const response = await call(commentAuthor, 'GET', undefined, '/api/comments/' + id + '/owner-view');
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).comment.body, 'Own pending comment');
  for (const viewer of [postAuthor, other]) {
    assert.equal((await call(viewer, 'GET', undefined, '/api/comments/' + id + '/owner-view')).status, 404);
  }
  const publicComments = await call(commentAuthor, 'GET', undefined, '/api/posts/' + postId + '/comments');
  assert.ok(!(await publicComments.text()).includes('Own pending comment'));
  const edit = { body: 'Own pending revised comment', declaredCreationMode: 'ai_assisted' };
  const key = uuidv7();
  const revision = await call(commentAuthor, 'PUT', edit, '/api/comments/' + id, key);
  assert.equal(revision.status, 200, await revision.clone().text());
  const data = await revision.json();
  assert.deepEqual(await (await call(commentAuthor, 'PUT', edit, '/api/comments/' + id, key)).json(), data);
  assert.equal((await (await call(commentAuthor, 'GET', undefined, '/api/comments/' + id + '/owner-view')).json()).comment.body, edit.body);
  const parentId = uuidv7();
  await sql("INSERT INTO content.comments(id,post_id,author_id,body,declared_creation_mode,moderation_state) VALUES($1,$2,$3,'Foreign parent secret','human','allowed')", [parentId, postId, postAuthor.id]);
  const reply = await create(commentAuthor, '/api/posts/' + postId + '/comments',
    { body: 'Own pending reply', declaredCreationMode: 'human', parentId });
  const replyRead = await call(commentAuthor, 'GET', undefined, '/api/comments/' + reply.data.id + '/owner-view');
  const replyText = await replyRead.text();
  assert.ok(replyText.includes(parentId));
  assert.ok(!replyText.includes('Foreign parent secret'));
  const deleteKey = uuidv7();
  const deletion = await call(commentAuthor, 'DELETE', undefined, '/api/comments/' + id, deleteKey);
  const ack = await deletion.json();
  assert.equal(ack.deleted, true);
  assert.deepEqual(await (await call(commentAuthor, 'DELETE', undefined, '/api/comments/' + id, deleteKey)).json(), ack);
  assert.equal((await call(commentAuthor, 'GET', undefined, '/api/comments/' + id + '/owner-view')).status, 404);
});

test('blocked, deleted, generated, stale-session and invalid-ID owner reads remain unavailable', async () => {
  const actor = await owner();
  for (const [mode, state] of [['human', 'blocked'], ['ai_generated', 'under_review']]) {
    const id = uuidv7();
    await sql("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state,visibility) VALUES($1,$2,$3,$4,$5,'private')", [id, actor.id, 'Unavailable secret', mode, state]);
    const response = await call(actor, 'GET', undefined, '/api/posts/' + id + '/owner-view');
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('Unavailable secret'));
  }
  for (const id of ['invalid', uuidv7()]) assert.equal((await call(actor, 'GET', undefined, '/api/posts/' + id + '/owner-view')).status, 404);
  const postId = await publishedPost(actor);
  await sql('UPDATE identity.users SET token_version=token_version+1 WHERE id=$1', [actor.id]);
  assert.equal((await call(actor, 'GET', undefined, '/api/posts/' + postId + '/owner-view')).status, 401);
});
