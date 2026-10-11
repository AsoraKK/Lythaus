import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { postModerationFixture, postReviewTestOptions } from './post-moderation-fixture.mjs';

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
async function created(body = 'Synthetic human post') {
  const key = uuidv7(), payload = { body, declaredCreationMode: 'human', geoScope: 'none' };
  const response = await call(owner, 'POST', '/api/posts', payload, key);
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
