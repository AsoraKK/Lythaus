import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { postModerationFixture } from './post-moderation-fixture.mjs';
import { assertTextReviewBundle } from './text-review-pg17-assertions.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
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
  }, { simulateSubjectLock: true });
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
async function created(body = 'Synthetic human post', postAuthor = owner) {
  const key = uuidv7(), payload = { body, declaredCreationMode: 'human', geoScope: 'none' };
  const response = await call(postAuthor, 'POST', '/api/posts', payload, key);
  assert.equal(response.status, 201, await response.clone().text());
  const post = await response.json();
  const event = (await client.query('SELECT id AS "eventId", event_type AS "eventType", payload FROM system.outbox_events WHERE id=$1', [post.eventId])).rows[0];
  return { post, event, payload, key };
}
async function createdComment(postId, body = 'Synthetic human comment', commentAuthor = owner) {
  const response = await call(commentAuthor, 'POST', `/api/posts/${postId}/comments`, { body, declaredCreationMode: 'human' });
  assert.equal(response.status, 201, await response.clone().text());
  const comment = await response.json();
  const event = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload
    FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.comment.created'`, [comment.commentId])).rows[0];
  assert.ok(event);
  return { comment, event };
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

test('native API -> transactional outbox -> jobs evidence -> private pending -> final public read', async () => {
  const createdPost = await created();
  const replay = await call(owner, 'POST', '/api/posts', createdPost.payload, createdPost.key);
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), createdPost.post);
  const relayed = await call(null, 'POST', '/fixture/relay');
  assert.equal(relayed.status, 200, await relayed.clone().text());
  const delivery = fixture.deliveries.find(item => item.body.eventId === createdPost.event.eventId);
  assert.equal(delivery.queue, 'MODERATION_QUEUE');
  assert.deepEqual(await deliver(delivery.body), { ack: 1, retry: 0 });
  assert.equal(await fixture.modelCallCount(), 1);
  assert.deepEqual(await counts(createdPost.post.id), { detectors: 1, cases: 1, state: 'under_review' });
  const decision = (await client.query(`SELECT c.policy_version AS "casePolicy", c.state AS "caseState",
      d.outcome, d.policy_version AS "decisionPolicy", d.decided_by AS "decidedBy",
      detector.signal->>'riskScore' AS "riskScore", declaration.public_label AS "publicLabel",
      declaration.declaration_conflict AS "declarationConflict", provenance.final_decision AS "provenanceDecision",
      provenance.policy_version AS "provenancePolicy", post.published_at AS "publishedAt",
      (SELECT count(*)::int FROM system.outbox_events WHERE aggregate_id = post.id
        AND event_type = 'content.post.published') AS "publicationEvents"
    FROM content.posts post
    JOIN content.content_declarations declaration ON declaration.post_id = post.id
    JOIN moderation.cases c ON c.content_type = 'post' AND c.content_id = post.id
      AND c.source_event_id = post.moderation_source_event_id
    JOIN moderation.decisions d ON d.case_id = c.id
    JOIN moderation.detector_runs detector ON detector.content_type = 'post' AND detector.content_id = post.id
      AND detector.source_event_id = post.moderation_source_event_id
    JOIN trust.provenance_events provenance ON provenance.content_id = post.id
      AND provenance.source_event_id = post.moderation_source_event_id
    WHERE post.id = $1`, [createdPost.post.id])).rows[0];
  assert.deepEqual(decision, {
    casePolicy: 'evaluation-only-v1', caseState: 'open', outcome: 'queue', decisionPolicy: 'evaluation-only-v1',
    decidedBy: null, riskScore: '0.1', publicLabel: 'Under review', declarationConflict: true,
    provenanceDecision: 'queue', provenancePolicy: 'evaluation-only-v1', publishedAt: null, publicationEvents: 0,
  });
  assert.equal((await call(null, 'GET', '/api/posts/' + createdPost.post.id)).status, 404,
    'a low risk score and detection signal are evidence for review, not publication authority or proof of human authorship');
  assert.deepEqual(await deliver(delivery.body), { ack: 1, retry: 0 });
  assert.equal(await fixture.modelCallCount(), 1);
  const pending = await call(owner, 'GET', '/api/posts/' + createdPost.post.id + '/owner-view');
  assert.equal(pending.status, 200);
  assert.match(pending.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await pending.json()).post.moderationState, 'under_review');
  for (const viewer of [null, other, owner]) assert.equal((await call(viewer, 'GET', '/api/posts/' + createdPost.post.id)).status, 404);
  for (const viewer of [null, other]) assert.equal((await call(viewer, 'GET', '/api/posts/' + createdPost.post.id + '/owner-view')).status, viewer ? 404 : 401);
  // Synthetic final-decision setup; this does not claim to exercise the admin decision handler.
  await client.query("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [createdPost.post.id]);
  await client.query("UPDATE content.content_declarations SET public_label='Human-authored',review_required=false WHERE post_id=$1", [createdPost.post.id]);
  const published = await call(null, 'GET', '/api/posts/' + createdPost.post.id);
  assert.equal(published.status, 200, await published.clone().text());
  assert.ok((await published.text()).includes('Human-authored'));
});

test('missing and malformed revision evidence retries without detector or publication writes; valid-hash stale evidence is acknowledged withheld', async () => {
  const malformed = await created('Synthetic malformed revision evidence', await actor());
  const modelCalls = await fixture.modelCallCount();
  const invalidDeliveries = [
    { ...malformed.event, payload: undefined },
    { ...malformed.event, payload: { ...malformed.event.payload, bodyHash: 'not-a-hash' } },
    { ...malformed.event, payload: { ...malformed.event.payload, sourceEventId: uuidv7() } },
    { ...malformed.event, payload: { ...malformed.event.payload, declaredCreationMode: 'ai_generated' } },
  ];
  for (const invalid of invalidDeliveries) assert.deepEqual(await deliver(invalid), { ack: 0, retry: 1 });
  assert.equal(await fixture.modelCallCount(), modelCalls);
  assert.deepEqual(await counts(malformed.post.id), { detectors: 0, cases: 0, state: 'under_review' });
  assert.equal((await client.query(`SELECT count(*)::int AS count FROM system.consumer_inbox
    WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`, [malformed.event.eventId])).rows[0].count, 0,
  'a malformed event claim is released so the canonical outbox delivery can retry');
  assert.equal((await client.query(`SELECT count(*)::int AS count FROM system.outbox_events
    WHERE aggregate_id = $1 AND event_type = 'content.post.published'`, [malformed.post.id])).rows[0].count, 0);
  assert.equal((await call(null, 'GET', '/api/posts/' + malformed.post.id)).status, 404);
  assert.deepEqual(await deliver(malformed.event), { ack: 1, retry: 0 });
  assert.equal(await fixture.modelCallCount(), modelCalls + 1);
  assert.deepEqual(await counts(malformed.post.id), { detectors: 1, cases: 1, state: 'under_review' });

  const stale = await created('Synthetic stale evidence hash', await actor());
  const staleDelivery = { ...stale.event, payload: { ...stale.event.payload, bodyHash: 'f'.repeat(64) } };
  const callsBeforeStale = await fixture.modelCallCount();
  assert.deepEqual(await deliver(staleDelivery), { ack: 1, retry: 0 });
  assert.equal(await fixture.modelCallCount(), callsBeforeStale);
  assert.deepEqual(await counts(stale.post.id), { detectors: 0, cases: 0, state: 'under_review' });
  assert.equal((await client.query(`SELECT count(*)::int AS count FROM system.outbox_events
    WHERE aggregate_id = $1 AND event_type = 'content.post.published'`, [stale.post.id])).rows[0].count, 0);
  assert.equal((await call(null, 'GET', '/api/posts/' + stale.post.id)).status, 404);
});

test('comment Jobs handler persists its audit and queued case; duplicate delivery is idempotent', async () => {
  const { post } = await created('Synthetic public parent for comment moderation', other);
  await client.query("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [post.id]);
  await client.query("UPDATE content.content_declarations SET public_label='Human-authored',review_required=false WHERE post_id=$1", [post.id]);
  const { comment, event } = await createdComment(post.id);

  assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
  const review = (await client.query(`SELECT c.id,c.state,d.outcome,d.policy_version,d.decided_by
    FROM moderation.cases c JOIN moderation.decisions d ON d.case_id=c.id
    WHERE c.content_type='comment' AND c.content_id=$1 AND c.source_event_id=$2`, [comment.commentId, event.eventId])).rows[0];
  assert.ok(review);
  assert.equal(review.state, 'open');
  assert.equal(review.outcome, 'queue');
  assert.equal(review.policy_version, 'evaluation-only-v1');
  assert.equal(review.decided_by, null);
  const audit = (await client.query(`SELECT id,correlation_id FROM system.audit_events
    WHERE action='moderation.comment.review_requested' AND target_id=$1 AND id=$2`, [comment.commentId, event.eventId])).rows[0];
  assert.deepEqual(audit, { id: event.eventId, correlation_id: event.eventId });
  assert.equal((await client.query(`SELECT state FROM system.consumer_inbox
    WHERE consumer_name='lythaus-jobs' AND event_id=$1`, [event.eventId])).rows[0].state, 'completed');

  assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
  const counts = (await client.query(`SELECT
    (SELECT count(*)::int FROM system.audit_events WHERE id=$1 AND target_id=$2 AND action='moderation.comment.review_requested') AS audits,
    (SELECT count(*)::int FROM moderation.detector_runs WHERE content_type='comment' AND content_id=$2 AND source_event_id=$1) AS detectors,
    (SELECT count(*)::int FROM moderation.cases WHERE content_type='comment' AND content_id=$2 AND source_event_id=$1) AS cases,
    (SELECT count(*)::int FROM system.outbox_events WHERE aggregate_id=$2 AND event_type='content.comment.published') AS publications`,
    [event.eventId, comment.commentId])).rows[0];
  assert.deepEqual(counts, { audits: 1, detectors: 1, cases: 1, publications: 0 });
});

test('concurrent duplicate queue deliveries persist one detector and one review case', async () => {
  const { post, event } = await created('Concurrent synthetic post');
  const replies = await Promise.all([deliver(event), deliver(event)]);
  assert.ok(replies.some(reply => reply.ack === 1));
  assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
  assert.deepEqual(await counts(post.id), { detectors: 1, cases: 1, state: 'under_review' });
});

test('provider outage yields manual review and keeps content withheld without automatic guilt or allow', async () => {
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
  const calls = await fixture.modelCallCount();
  assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
  assert.equal(await fixture.modelCallCount(), calls);
  const current = (await client.query("SELECT id AS \"eventId\",event_type AS \"eventType\",payload FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.post.updated'", [post.id])).rows[0];
  await client.query("UPDATE content.posts SET moderation_state='blocked' WHERE id=$1", [post.id]);
  assert.deepEqual(await deliver(current), { ack: 1, retry: 0 });
  assert.deepEqual(await counts(post.id), { detectors: 0, cases: 0, state: 'blocked' });
  assert.equal(await fixture.modelCallCount(), calls);
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

async function reviewItem(type) {
  const writer = await actor(), parent = await created('Synthetic account fence parent', writer);
  if (type === 'post') return { id: parent.post.id, event: parent.event, writer };
  await client.query("UPDATE content.posts SET moderation_state='allowed',published_at=now() WHERE id=$1", [parent.post.id]);
  await client.query("UPDATE content.content_declarations SET public_label='Human-authored',review_required=false WHERE post_id=$1", [parent.post.id]);
  const item = await createdComment(parent.post.id, 'Synthetic account-fenced comment', writer);
  return { id: item.comment.commentId, event: item.event, writer };
}
async function privateReview(item, type) {
  const table = type === 'post' ? 'content.posts' : 'content.comments';
  assert.equal((await client.query(`SELECT moderation_state FROM ${table} WHERE id=$1`, [item.id])).rows[0].moderation_state, 'under_review');
  assert.equal((await client.query("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type LIKE '%published%'", [item.id])).rowCount, 0);
}
async function blocked(waiter, holder) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if ((await client.query('SELECT $2::integer=ANY(pg_blocking_pids($1)) AS waits', [waiter, holder])).rows[0].waits) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('expected actual PostgreSQL account-lock wait');
}

test('canonical missing subject capability retries both text kinds without inference or evidence', async () => {
  assert.equal((await client.query("SELECT to_regprocedure('trust.lock_reputation_subject(uuid)') AS function")).rows[0].function, null);
  const canonical = await postModerationFixture(connectionString, { ENVIRONMENT: 'local' });
  try {
    for (const type of ['post', 'comment']) {
      const item = await reviewItem(type);
      const response = await canonical.dispatchFetch('https://fixture.invalid/fixture/queue', { method: 'POST', body: JSON.stringify(item.event) });
      assert.deepEqual(await response.json(), { ack: 0, retry: 1 });
      assert.equal((await client.query('SELECT id FROM moderation.detector_runs WHERE content_id=$1', [item.id])).rowCount, 0);
      assert.equal(await canonical.modelCallCount(), 0); await privateReview(item, type);
    }
  } finally { await canonical.dispose(); }
});

for (const type of ['post', 'comment']) for (const change of ['status', 'deletion']) for (const first of ['writer', 'jobs']) {
  test(`synthetic capability transport, real PG17 ${type} ${change}: ${first} account lock commits first`, async () => {
    assert.equal(fixture.simulateSubjectLock, true);
    const item = await reviewItem(type), writer = new pg.Client({ connectionString, ssl: false });
    await writer.connect(); await writer.query('SET ROLE lythaus_privacy');
    const reached = Promise.withResolvers(), resume = Promise.withResolvers();
    let invocations = 0, delivery, update;
    const updateSql = change === 'status' ? "UPDATE identity.users SET status='locked' WHERE id=$1"
      : 'UPDATE identity.users SET deleted_at=now() WHERE id=$1';
    try {
      await writer.query('BEGIN');
      if (first === 'writer') {
        await writer.query(updateSql, [item.writer.id]);
        fixture.duringSql = input => { if (input.text === 'SELECT status FROM trust.lock_reputation_subject($1::pg_catalog.uuid)') reached.resolve(input.backendPid); };
        delivery = deliver(item.event);
        const waiter = await Promise.race([reached.promise, delivery.then(() => { throw new Error('Jobs did not reach the subject lock'); })]);
        await blocked(waiter, writer.processID);
        await writer.query('COMMIT'); assert.deepEqual(await delivery, { ack: 1, retry: 0 });
        assert.equal((await client.query('SELECT id FROM moderation.detector_runs WHERE content_id=$1', [item.id])).rowCount, 0);
      } else {
        fixture.afterSql = async input => {
          if (input.text === 'SELECT status FROM trust.lock_reputation_subject($1::pg_catalog.uuid)'
            && ++invocations === (type === 'post' ? 2 : 1)) { reached.resolve(input.backendPid); await resume.promise; }
        };
        delivery = deliver(item.event);
        const holder = await Promise.race([reached.promise, delivery.then(() => { throw new Error('Jobs did not hold its final account lock'); })]);
        update = writer.query(updateSql, [item.writer.id]); await blocked(writer.processID, holder);
        resume.resolve(); assert.deepEqual(await delivery, { ack: 1, retry: 0 });
        await update; await writer.query('COMMIT');
        await assertTextReviewBundle(client, item.id, item.event.eventId, type);
      }
      await privateReview(item, type);
      assert.ok(!fixture.statements.some(entry => /^\s*(CREATE|ALTER|GRANT)\b/i.test(entry.text)));
      assert.equal((await client.query("SELECT to_regprocedure('trust.lock_reputation_subject(uuid)') AS function")).rows[0].function, null);
    } finally {
      resume.resolve(); fixture.duringSql = undefined; fixture.afterSql = undefined;
      await writer.query('ROLLBACK').catch(() => undefined);
      await delivery?.catch(() => undefined); await update?.catch(() => undefined); await writer.end();
    }
  });
}

for (const type of ['post', 'comment']) test(`synthetic capability transport, real PG17 ${type} content contention retries without a deadlock`, async () => {
  const item = await reviewItem(type), holder = new pg.Client({ connectionString, ssl: false });
  await holder.connect(); await holder.query('SET ROLE lythaus_admin'); await holder.query('BEGIN');
  const errors = fixture.sqlErrors.length;
  try {
    await holder.query(`SELECT id FROM content.${type === 'post' ? 'posts' : 'comments'} WHERE id=$1 FOR UPDATE`, [item.id]);
    assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 });
    assert.ok(fixture.sqlErrors.slice(errors).some(error => error.code === '55P03'));
    assert.ok(!fixture.sqlErrors.slice(errors).some(error => error.code === '40P01'));
    assert.equal((await client.query('SELECT id FROM moderation.detector_runs WHERE content_id=$1', [item.id])).rowCount, 0);
  } finally { await holder.query('ROLLBACK'); await holder.end(); }
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  await assertTextReviewBundle(client, item.id, item.event.eventId, type); await privateReview(item, type);
});
