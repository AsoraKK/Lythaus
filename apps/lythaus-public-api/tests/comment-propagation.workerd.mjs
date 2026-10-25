import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { hmacLookup, signAccessToken, uuidv7 } from '@lythaus/security';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';
import { commentRuntimeFixture } from './comment-runtime-fixture.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).toString();
const control = new pg.Client({ connectionString, ssl: false });
let fixture, privateKeyPem, adminAccessKey, adminSubject;
const keyId = 'synthetic-comment-propagation';
before(async () => {
  await control.connect();
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  privateKeyPem = await exportPKCS8(privateKey);
  adminAccessKey = randomBytes(32).toString('base64');
  fixture = await commentRuntimeFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test,admin.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test,https://admin.lythaus.test',
    PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
    ACCESS_SUBJECT_HMAC_KEY: adminAccessKey,
    ACCESS_JWKS_URL: 'https://jwks.fixture.test/.well-known/jwks.json',
    ACCESS_AUDIENCES: 'synthetic-comment-reviewer-audience',
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  });
  const moderator = await actor();
  adminSubject = 'synthetic-comment-moderator-' + uuidv7();
  await control.query('INSERT INTO identity.admin_memberships(user_id, access_subject_hmac, role, active) VALUES($1, $2, \'moderator\', true)',
    [moderator.id, Buffer.from(hmacLookup(adminSubject, adminAccessKey), 'base64')]);
});
after(async () => { try { await fixture?.dispose(); } finally { await control.end(); } });
async function actor() {
  const id = uuidv7();
  await control.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [id]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}
async function setup() {
  const owner = await actor(), author = await actor(), postId = uuidv7(), root = uuidv7();
  await control.query("INSERT INTO content.posts(id,author_id,body,declared_creation_mode,moderation_state) VALUES($1,$2,'Synthetic public post','human','allowed')", [postId, owner.id]);
  await control.query("INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label) VALUES($1,'human','Human-authored')", [postId]);
  await control.query("INSERT INTO content.comments(id,post_id,author_id,body,depth,declared_creation_mode,moderation_state,moderation_source_event_id) VALUES($1,$2,$3,'Synthetic root',0,'human','allowed',$4)", [root, postId, owner.id, uuidv7()]);
  return { owner, author, postId, root };
}
const call = (user, method, path, body, key) => fixture.dispatchFetch('https://api.lythaus.test' + path, {
  method, headers: { origin: 'https://app.lythaus.test', ...(user ? { authorization: 'Bearer ' + user.token } : {}),
    ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function json(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
const path = postId => '/api/posts/' + postId + '/comments';
async function submit(user, postId, parentId, body = 'Synthetic reply', key = uuidv7()) {
  const payload = { body, declaredCreationMode: 'human', parentId };
  return { payload, key, result: await json(await call(user, 'POST', path(postId), payload, key), 201) };
}
async function publish(id) {
  const sourceEventId = (await control.query('SELECT moderation_source_event_id FROM content.comments WHERE id=$1', [id])).rows[0].moderation_source_event_id;
  let caseId = (await control.query("SELECT id FROM moderation.cases WHERE content_type='comment' AND content_id=$1 AND source_event_id=$2 AND state='open'", [id, sourceEventId])).rows[0]?.id;
  if (!caseId) {
    caseId = uuidv7();
    await control.query("INSERT INTO moderation.cases(id,content_type,content_id,source_event_id,policy_version,state) VALUES($1,'comment',$2,$3,'synthetic-comment-fixture','open')", [caseId, id, sourceEventId]);
  }
  const response = await fixture.dispatchFetch('https://admin.lythaus.test/api/admin/moderation/cases/' + caseId + '/decision', {
    method: 'POST', headers: { origin: 'https://admin.lythaus.test', 'content-type': 'application/json', 'cf-access-jwt-assertion': adminSubject },
    body: JSON.stringify({ outcome: 'allow', reasonCode: 'SYNTHETIC.COMMENT_ALLOW', expectedReviewCycleId: null }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const event = await control.query("SELECT id FROM system.outbox_events WHERE event_type='content.comment.published' AND aggregate_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [id]);
  assert.equal(event.rowCount, 1);
  return event.rows[0].id;
}
const deliver = eventId => fixture.dispatchFetch('https://api.lythaus.test/fixture/notification', {
  method: 'POST', body: JSON.stringify({ eventId, eventType: 'content.comment.published', payload: { postId: uuidv7() } }),
});

test('candidate handlers execute authenticated nested create with exact idempotent replay and one outbox record', async () => {
  const { owner, author, postId, root } = await setup();
  const first = await submit(author, postId, root);
  assert.equal(first.result.parentId, root);
  assert.equal(first.result.moderationState, 'under_review');
  await publish(first.result.id);
  const nested = await submit(owner, postId, first.result.id, 'A direct response to the reply');
  assert.equal(nested.result.parentId, first.result.id);
  assert.equal(nested.result.depth, 1);
  const replay = await json(await call(owner, 'POST', path(postId), nested.payload, nested.key), 201);
  assert.deepEqual(replay, nested.result);
  assert.equal((await control.query("SELECT count(*)::int AS n FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.comment.created'", [nested.result.id])).rows[0].n, 1);
  const publicPage = await json(await call(owner, 'GET', path(postId) + '?view=conversations'));
  assert.equal(publicPage.items[0].replyCount, 1);
  assert.ok(!JSON.stringify(publicPage).includes(nested.payload.body));
  await publish(nested.result.id);
  const replyResponse = await call(null, 'GET', path(postId) + '?view=conversations&conversationId=' + root);
  assert.equal(replyResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(replyResponse.headers.get('vary'), 'Origin, Authorization');
  const replies = await json(replyResponse);
  assert.deepEqual(replies.items.map(item => item.id), [first.result.id, nested.result.id]);
  const exact = await json(await call(null, 'GET', path(postId) + '?view=conversations&targetId=' + first.result.id));
  assert.deepEqual(exact.items.map(item => item.id), [first.result.id]);
  assert.equal(exact.items[0].conversationId, root);
});

test('concurrent same-key submissions and distinct replies neither duplicate nor double-count', async () => {
  const { author, postId, root } = await setup(), key = uuidv7();
  const body = { body: 'Concurrent synthetic reply', declaredCreationMode: 'human', parentId: root };
  const attempts = await Promise.all([call(author, 'POST', path(postId), body, key), call(author, 'POST', path(postId), body, key)]);
  assert.ok(attempts.some(response => response.status === 201));
  assert.ok(attempts.every(response => [201, 409].includes(response.status)));
  const accepted = await json(await call(author, 'POST', path(postId), body, key), 201);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM content.comments WHERE parent_id=$1', [root])).rows[0].n, 1);
  await publish(accepted.id);
  const distinct = await Promise.all([submit(author, postId, root, 'Distinct A'), submit(author, postId, root, 'Distinct B')]);
  for (const reply of distinct) await publish(reply.result.id);
  const page = await json(await call(author, 'GET', path(postId) + '?view=conversations'));
  assert.equal(page.items[0].replyCount, 3);
});

test('reply producers preserve disclosure, ownership, parent visibility and revision moderation gates', async () => {
  const { owner, author, postId, root } = await setup();
  const target = await submit(author, postId, root);
  for (const payload of [
    { body: 'Generated', declaredCreationMode: 'ai_generated', parentId: root },
    { body: 'x'.repeat(250), declaredCreationMode: 'ai_assisted', parentId: root },
  ]) assert.equal((await call(author, 'POST', path(postId), payload, uuidv7())).status, 400);
  const nestedPending = await call(owner, 'POST', path(postId), { body: 'Unavailable target', declaredCreationMode: 'human', parentId: target.result.id }, uuidv7());
  assert.equal(nestedPending.status, 400);
  assert.equal((await call(owner, 'PUT', '/api/comments/' + target.result.id, { body: 'Foreign edit' }, uuidv7())).status, 404);
  await publish(target.result.id);
  await json(await call(author, 'PUT', '/api/comments/' + target.result.id, { body: 'Revised human reply' }, uuidv7()));
  const rows = await control.query('SELECT moderation_state,declared_creation_mode FROM content.comments WHERE id=$1', [target.result.id]);
  assert.deepEqual(rows.rows[0], { moderation_state: 'under_review', declared_creation_mode: 'human' });
  assert.equal((await json(await call(owner, 'GET', path(postId) + '?view=conversations'))).items[0].replyCount, 0);
  await control.query("UPDATE content.posts SET visibility='private' WHERE id=$1", [postId]);
  assert.equal((await call(author, 'GET', '/api/comments/' + target.result.id + '/owner-view')).status, 404);
  const hiddenParent = await call(author, 'POST', path(postId), { body: 'Hidden parent', declaredCreationMode: 'human', parentId: root }, uuidv7());
  assert.equal(hiddenParent.status, 400);
  assert.equal((await hiddenParent.json()).error, 'post_not_available');
  const unavailable = await call(owner, 'GET', path(postId) + '?view=conversations&sort=most_relevant');
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'comment_sort_unavailable');
});

test('notification adapter rolls back interruption, retries once, respects preferences and filters current read/unread counts', async () => {
  const { owner, author, postId, root } = await setup();
  const child = await submit(author, postId, root), eventId = await publish(child.result.id);
  const publication = await control.query(`SELECT event.payload, comment.moderation_source_event_id AS revision,
      decision.id AS decision_id
    FROM system.outbox_events event
    JOIN content.comments comment ON comment.id = event.aggregate_id
    JOIN moderation.cases moderation_case ON moderation_case.content_type = 'comment'
      AND moderation_case.content_id = comment.id AND moderation_case.source_event_id = comment.moderation_source_event_id
    JOIN moderation.decisions decision ON decision.case_id = moderation_case.id AND decision.outcome = 'allow'
    WHERE event.id = $1`, [eventId]);
  assert.equal(publication.rowCount, 1);
  assert.equal(publication.rows[0].payload.sourceEventId, publication.rows[0].revision);
  assert.equal(publication.rows[0].payload.decisionId, publication.rows[0].decision_id);
  assert.ok(fixture.statements.some(row => row.role === 'lythaus_admin' && row.text.includes('INSERT INTO system.outbox_events')));
  fixture.failNextNotification();
  assert.equal((await deliver(eventId)).status, 503);
  assert.equal((await control.query('SELECT count(*)::int AS n FROM feed.notifications WHERE source_event_id=$1', [eventId])).rows[0].n, 0);
  await json(await deliver(eventId));
  await json(await deliver(eventId));
  const notifications = await json(await call(owner, 'GET', '/api/notifications'));
  assert.equal(notifications.items.filter(item => item.entityId === child.result.id).length, 1);
  assert.equal(notifications.totalUnread, 1);
  assert.equal(notifications.items[0].deeplink, '/post/' + postId + '?commentId=' + child.result.id);
  await control.query("UPDATE content.comments SET moderation_state='blocked',updated_at=now() WHERE id=$1", [root]);
  const hidden = await json(await call(owner, 'GET', '/api/notifications'));
  assert.equal(hidden.items.length, 0);
  assert.equal(hidden.totalUnread, 0);
  assert.equal((await json(await call(owner, 'GET', '/api/notifications/unread-count'))).count, 0);
  await json(await deliver(eventId));
  await control.query("UPDATE content.comments SET moderation_state='allowed' WHERE id=$1", [root]);
  await control.query('INSERT INTO feed.notification_preferences(user_id,replies_enabled) VALUES($1,false)', [owner.id]);
  const other = await submit(author, postId, root), otherEvent = await publish(other.result.id);
  await json(await deliver(otherEvent));
  assert.equal((await control.query('SELECT count(*)::int AS n FROM feed.notifications WHERE source_event_id=$1', [otherEvent])).rows[0].n, 0);
  assert.ok(fixture.statements.some(row => row.role === 'lythaus_jobs' && row.text.includes('INSERT INTO feed.notifications')));
});
