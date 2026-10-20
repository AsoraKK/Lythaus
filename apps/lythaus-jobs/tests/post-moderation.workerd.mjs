import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { postModerationFixture, postReviewTestOptions } from './post-moderation-fixture.mjs';
import { assertTextReviewBundle } from './text-review-pg17-assertions.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const requiresAccountLock = await postReviewTestOptions(connectionString);
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
const client = new pg.Client({ connectionString, ssl: false });
let fixture, owner, other, privateKeyPem, keyId;
before(async () => {
  await client.connect();
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  privateKeyPem = await exportPKCS8(privateKey);
  keyId = 'synthetic-post-workerd';
  fixture = await postModerationFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
  });
  owner = await actor(); other = await actor();
});
after(async () => { await fixture?.dispose(); await client.end(); });
async function actor() {
  const id = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic post actor')", [id]);
  await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [id]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}
async function call(actor, method, path, body, key = uuidv7()) {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, { method,
    headers: { ...(actor ? { authorization: 'Bearer ' + actor.token } : {}),
      'content-type': 'application/json', 'idempotency-key': key },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function created(body = 'Synthetic human post', writer = owner) {
  const key = uuidv7(), payload = { body, declaredCreationMode: 'human', geoScope: 'none' };
  const response = await call(writer, 'POST', '/api/posts', payload, key);
  assert.equal(response.status, 201, await response.clone().text());
  const post = await response.json();
  const event = (await client.query('SELECT id AS "eventId", event_type AS "eventType", payload FROM system.outbox_events WHERE id=$1', [post.eventId])).rows[0];
  return { post, event, payload, key };
}
async function deliver(event) {
  const response = await call(null, 'POST', '/fixture/queue', event);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function counts(id) {
  return (await client.query(`SELECT
    (SELECT count(*)::int FROM moderation.detector_runs WHERE content_id=$1) AS detectors,
    (SELECT count(*)::int FROM moderation.cases WHERE content_id=$1) AS cases,
    (SELECT moderation_state FROM content.posts WHERE id=$1) AS state`, [id])).rows[0];
}

test('native API and outbox keep owner status private while Jobs account authority is unavailable', async () => {
  const createdPost = await created();
  const replay = await call(owner, 'POST', '/api/posts', createdPost.payload, createdPost.key);
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), createdPost.post);
  const relayed = await call(null, 'POST', '/fixture/relay');
  assert.equal(relayed.status, 200, await relayed.clone().text());
  const delivery = fixture.deliveries.find(item => item.body.eventId === createdPost.event.eventId);
  assert.equal(delivery.queue, 'MODERATION_QUEUE');
  assert.deepEqual(await deliver(delivery.body), requiresAccountLock.skip ? { ack: 0, retry: 1 } : { ack: 1, retry: 0 });
  assert.equal(fixture.modelCalls, requiresAccountLock.skip ? 0 : 1);
  assert.deepEqual(await counts(createdPost.post.id), { detectors: requiresAccountLock.skip ? 0 : 1, cases: requiresAccountLock.skip ? 0 : 1, state: 'under_review' });
  assert.deepEqual(await deliver(delivery.body), requiresAccountLock.skip ? { ack: 0, retry: 1 } : { ack: 1, retry: 0 });
  assert.equal(fixture.modelCalls, requiresAccountLock.skip ? 0 : 1);
  const pending = await call(owner, 'GET', '/api/posts/' + createdPost.post.id + '/owner-view');
  assert.equal(pending.status, 200);
  assert.match(pending.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await pending.json()).post.moderationState, 'under_review');
  for (const viewer of [null, other, owner]) assert.equal((await call(viewer, 'GET', '/api/posts/' + createdPost.post.id)).status, 404);
  for (const viewer of [null, other]) assert.equal((await call(viewer, 'GET', '/api/posts/' + createdPost.post.id + '/owner-view')).status, viewer ? 404 : 401);
  if (requiresAccountLock.skip) {
    assert.equal((await client.query('SELECT published_at FROM content.posts WHERE id=$1', [createdPost.post.id])).rows[0].published_at, null);
    assert.equal((await client.query("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type LIKE '%published%'", [createdPost.post.id])).rowCount, 0);
    return;
  }
  // Synthetic final-decision setup; this does not claim to exercise the admin decision handler.
  await client.query("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [createdPost.post.id]);
  await client.query("UPDATE content.content_declarations SET public_label='Human-authored',review_required=false WHERE post_id=$1", [createdPost.post.id]);
  const published = await call(null, 'GET', '/api/posts/' + createdPost.post.id);
  assert.equal(published.status, 200, await published.clone().text());
  assert.ok((await published.text()).includes('Human-authored'));
});

test('concurrent duplicate queue deliveries cannot persist evidence without atomic account authority', async () => {
  const { post, event } = await created('Concurrent synthetic post');
  const replies = await Promise.all([deliver(event), deliver(event)]);
  if (requiresAccountLock.skip) {
    assert.ok(replies.every(reply => reply.retry === 1));
    assert.deepEqual(await deliver(event), { ack: 0, retry: 1 });
    assert.deepEqual(await counts(post.id), { detectors: 0, cases: 0, state: 'under_review' }); return;
  }
  assert.ok(replies.some(reply => reply.ack === 1));
  assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
  assert.deepEqual(await counts(post.id), { detectors: 1, cases: 1, state: 'under_review' });
});

test('provider outage yields manual review and keeps content withheld without automatic guilt or allow', requiresAccountLock, async () => {
  fixture.failModel = true;
  try {
    const { post, event } = await created('Synthetic provider outage');
    assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
    assert.deepEqual(await counts(post.id), { detectors: 1, cases: 1, state: 'under_review' });
    const evidence = (await client.query('SELECT signal FROM moderation.detector_runs WHERE content_id=$1', [post.id])).rows[0].signal;
    assert.equal(evidence.recommendation, 'review');
    assert.match(evidence.signals[0].category, /manual_review/);
    assert.equal((await call(null, 'GET', '/api/posts/' + post.id)).status, 404);
  } finally { fixture.failModel = false; }
});

test('stale revision and independent blocked decision cannot be overwritten by late detector delivery', async () => {
  const { post, event } = await created('Original synthetic revision');
  const response = await call(owner, 'PUT', '/api/posts/' + post.id, { body: 'New synthetic revision', declaredCreationMode: 'human' });
  assert.equal(response.status, 200, await response.clone().text());
  const calls = fixture.modelCalls;
  assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
  assert.equal(fixture.modelCalls, calls);
  const current = (await client.query("SELECT id AS \"eventId\",event_type AS \"eventType\",payload FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.post.updated'", [post.id])).rows[0];
  await client.query("UPDATE content.posts SET moderation_state='blocked' WHERE id=$1", [post.id]);
  assert.deepEqual(await deliver(current), { ack: 1, retry: 0 });
  assert.deepEqual(await counts(post.id), { detectors: 0, cases: 0, state: 'blocked' });
  assert.equal(fixture.modelCalls, calls);
});

test('failed dispatch retains outbox work for retry and guest submission cannot persist content', async () => {
  const { post, event } = await created('Synthetic dispatch retry');
  fixture.failQueue = event.eventId;
  let relay = await call(null, 'POST', '/fixture/relay');
  assert.equal(relay.status, 500);
  assert.match(await relay.text(), /synthetic_queue_unavailable/);
  let row = (await client.query('SELECT dispatched_at,last_error_code FROM system.outbox_events WHERE id=$1', [event.eventId])).rows[0];
  assert.equal(row.dispatched_at, null);
  assert.equal(row.last_error_code, 'synthetic_queue_unavailable');
  fixture.failQueue = false;
  relay = await call(null, 'POST', '/fixture/relay');
  assert.equal(relay.status, 200, await relay.clone().text());
  row = (await client.query('SELECT dispatched_at FROM system.outbox_events WHERE id=$1', [event.eventId])).rows[0];
  assert.ok(row.dispatched_at);
  const response = await call(null, 'POST', '/api/posts', { body: 'Guest write denied', declaredCreationMode: 'human', geoScope: 'none' });
  assert.equal(response.status, 401);
  assert.deepEqual(await counts(post.id), { detectors: 0, cases: 0, state: 'under_review' });
});

async function createdComment() {
  const writer = await actor(), parent = await created('Synthetic parent admission fixture', writer);
  await client.query("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [parent.post.id]);
  await client.query("UPDATE content.content_declarations SET public_label='Human-authored',review_required=false WHERE post_id=$1", [parent.post.id]);
  const response = await call(writer, 'POST', `/api/posts/${parent.post.id}/comments`, {
    body: 'Synthetic comment evidence', declaredCreationMode: 'human',
  });
  assert.equal(response.status, 201, await response.clone().text());
  const comment = await response.json();
  const event = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events
    WHERE aggregate_id=$1 AND event_type='content.comment.created'`, [comment.commentId])).rows[0];
  return { id: comment.commentId, event, writer, parent };
}

async function pendingComment(item) {
  assert.equal((await client.query('SELECT moderation_state FROM content.comments WHERE id=$1', [item.id])).rows[0].moderation_state, 'under_review');
  assert.equal((await client.query("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.comment.published'", [item.id])).rowCount, 0);
}

test('canonical Jobs binds comment evidence to one persisted queue decision and preserves duplicate identity', async () => {
  const item = await createdComment(), calls = fixture.modelCalls;
  const replies = await Promise.all([deliver(item.event), deliver(item.event)]);
  assert.ok(replies.some(reply => reply.ack === 1));
  const evidence = await assertTextReviewBundle(client, item.id, item.event.eventId, 'comment');
  assert.equal(evidence.reasoning.state, 'NOT_RUN');
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.equal((await assertTextReviewBundle(client, item.id, item.event.eventId, 'comment')).evidenceHash, evidence.evidenceHash);
  assert.equal((await client.query('SELECT state FROM system.consumer_inbox WHERE event_id=$1', [item.event.eventId])).rows[0].state, 'completed');
  assert.equal(fixture.modelCalls, calls); await pendingComment(item);
});

for (const phase of ['before', 'after']) test(`canonical comment ${phase} binding failure rolls back all review effects before retry`, async () => {
  const item = await createdComment();
  const priorActivity = (await client.query('SELECT id FROM trust.user_activity_events WHERE source_event_id=$1 ORDER BY id', [item.event.eventId])).rows;
  if (phase === 'before') fixture.failSql = { match: 'UPDATE moderation.detector_runs r', remaining: 1 };
  else fixture.afterSql = input => {
    if (input.text.includes('UPDATE moderation.detector_runs r')) {
      fixture.afterSql = undefined; throw new Error('synthetic_after_comment_binding');
    }
  };
  try { assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 }); }
  finally { fixture.failSql = undefined; fixture.afterSql = undefined; }
  for (const table of ['moderation.detector_runs', 'moderation.cases'])
    assert.equal((await client.query(`SELECT id FROM ${table} WHERE content_id=$1`, [item.id])).rowCount, 0);
  assert.equal((await client.query('SELECT id FROM system.audit_events WHERE id=$1', [item.event.eventId])).rowCount, 0);
  assert.deepEqual((await client.query('SELECT id FROM trust.user_activity_events WHERE source_event_id=$1 ORDER BY id', [item.event.eventId])).rows, priorActivity);
  assert.equal((await client.query('SELECT event_id FROM system.consumer_inbox WHERE event_id=$1', [item.event.eventId])).rowCount, 0);
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  await assertTextReviewBundle(client, item.id, item.event.eventId, 'comment'); await pendingComment(item);
});

test('canonical comment stale delivery cannot bind the superseded body revision', async () => {
  const item = await createdComment();
  const response = await call(item.writer, 'PUT', `/api/comments/${item.id}`, { body: 'Synthetic revised comment', declaredCreationMode: 'human' });
  assert.equal(response.status, 200, await response.clone().text());
  const current = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events
    WHERE aggregate_id=$1 AND event_type='content.comment.updated'`, [item.id])).rows[0];
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.equal((await client.query('SELECT id FROM moderation.detector_runs WHERE content_id=$1', [item.id])).rowCount, 0);
  assert.deepEqual(await deliver(current), { ack: 1, retry: 0 });
  await assertTextReviewBundle(client, item.id, current.eventId, 'comment'); await pendingComment(item);
});

test('canonical comment lost COMMIT reply reconciles the already durable binding on retry', async () => {
  const item = await createdComment();
  let selected, interrupted = false;
  fixture.afterSql = input => {
    if (input.text.includes('UPDATE moderation.detector_runs r')) selected = input.transactionId;
    if (selected && input.transactionId === selected && input.text === 'COMMIT') {
      assert.equal(input.command, 'COMMIT'); interrupted = true; fixture.afterSql = undefined;
      throw new Error('synthetic_lost_comment_commit_reply');
    }
  };
  try { assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 }); }
  finally { fixture.afterSql = undefined; }
  assert.equal(interrupted, true);
  const evidence = await assertTextReviewBundle(client, item.id, item.event.eventId, 'comment');
  assert.equal((await client.query('SELECT event_id FROM system.consumer_inbox WHERE event_id=$1', [item.event.eventId])).rowCount, 0);
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.equal((await assertTextReviewBundle(client, item.id, item.event.eventId, 'comment')).evidenceHash, evidence.evidenceHash);
  await pendingComment(item);
});

test('canonical comment late independent case conflict rolls back automated evidence and preserves its hold', async () => {
  const item = await createdComment(), independentCase = uuidv7(), independentDecision = uuidv7();
  fixture.duringSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text.includes('INSERT INTO moderation.detector_runs')) {
      fixture.duringSql = undefined;
      await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id)
        VALUES($1,'comment',$2,'open','synthetic-independent-v1',$3)`, [independentCase, item.id, item.event.eventId]);
      await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version)
        VALUES($1,$2,'queue','synthetic-independent-v1')`, [independentDecision, independentCase]);
    }
  };
  try { assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 }); }
  finally { fixture.duringSql = undefined; }
  assert.equal((await client.query('SELECT id FROM moderation.detector_runs WHERE content_id=$1', [item.id])).rowCount, 0);
  assert.equal((await client.query('SELECT id FROM system.audit_events WHERE id=$1', [item.event.eventId])).rowCount, 0);
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.deepEqual((await client.query(`SELECT d.id,c.state,d.outcome FROM moderation.cases c JOIN moderation.decisions d ON d.case_id=c.id
    WHERE c.content_id=$1`, [item.id])).rows, [{ id: independentDecision, state: 'open', outcome: 'queue' }]);
  await pendingComment(item);
});

for (const restriction of ['deleted_comment', 'deleted_author', 'inactive_author', 'independent_queue', 'independent_block']) {
  test(`canonical comment ${restriction} withholds new detector evidence`, async () => {
    const item = await createdComment();
    if (restriction === 'deleted_comment') await client.query('UPDATE content.comments SET deleted_at=now() WHERE id=$1', [item.id]);
    if (restriction === 'deleted_author') await client.query('UPDATE identity.users SET deleted_at=now() WHERE id=$1', [item.writer.id]);
    if (restriction === 'inactive_author') await client.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [item.writer.id]);
    if (restriction.startsWith('independent_')) {
      const caseId = uuidv7();
      await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id)
        VALUES($1,'comment',$2,'open','synthetic-independent-v1',$3)`, [caseId, item.id, item.event.eventId]);
      await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version)
        VALUES($1,$2,$3,'synthetic-independent-v1')`, [uuidv7(), caseId, restriction === 'independent_block' ? 'block' : 'queue']);
    }
    assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
    assert.equal((await client.query('SELECT id FROM moderation.detector_runs WHERE content_id=$1', [item.id])).rowCount, 0);
    await pendingComment(item);
  });
}
