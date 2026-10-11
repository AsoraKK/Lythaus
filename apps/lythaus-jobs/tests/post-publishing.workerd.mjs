import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { signAccessToken, uuidv7 } from '@lythaus/security';
import { communityClassifierEvidence, communityDigest } from '../../../packages/db/src/community-appeal-access.ts';
import { identicalCommunityAppealOverride } from '../../../packages/db/src/community-appeal-closure.ts';
import { postModerationFixture, postReviewTestOptions } from './post-moderation-fixture.mjs';
import { installProposedPostReviewCapability, postReviewAuthorLockSignature } from './post-review-author-lock-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const requiresAccountLock = await postReviewTestOptions(connectionString);
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_publishing_[a-f0-9]+$/);
const client = new pg.Client({ connectionString, ssl: false });
let fixture, privateKeyPem, keyId;
before(async () => {
  await client.connect();
  await client.query(readFileSync(new URL('../../../database/planetscale/proposals/community_appeals.sql', import.meta.url), 'utf8'));
  await client.query(`INSERT INTO moderation.community_appeal_rule_sets(version,policy_version,configuration,ballot_changes_allowed)
    VALUES('synthetic-publishing-rules','lythaus-monthly-rewards-2026-10-v1',
      '{"version":"synthetic-publishing-rules","status":"pending_owner_approval"}',false)`);
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  privateKeyPem = await exportPKCS8(privateKey); keyId = 'synthetic-publishing-workerd';
  fixture = await postModerationFixture(connectionString, { ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test',
    COMMUNITY_APPEAL_RULES_VERSION: 'synthetic-publishing-rules',
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }) });
});
after(async () => { await fixture?.dispose(); await client.end(); });
async function call(token, method, path, body) {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, { method,
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json', 'idempotency-key': uuidv7() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function created(mode = 'human') {
  const author = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic publishing owner')", [author]);
  await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [author]);
  const token = await signAccessToken({ userId: author, privateKeyPem, keyId });
  const response = await call(token, 'POST', '/api/posts', { body: 'Synthetic publishing body', declaredCreationMode: mode, geoScope: 'none' });
  assert.equal(response.status, 201, await response.clone().text());
  const post = await response.json();
  const event = (await client.query('SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events WHERE id=$1', [post.eventId])).rows[0];
  return { post, event, author, token };
}
async function deliver(event) {
  const response = await call(null, 'POST', '/fixture/queue', event);
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
async function rows(item) {
  return (await client.query(`SELECT
    (SELECT count(*)::int FROM moderation.detector_runs WHERE content_id=$1) AS detectors,
    (SELECT count(*)::int FROM moderation.cases WHERE content_id=$1) AS cases,
    (SELECT count(*)::int FROM trust.provenance_events WHERE content_id=$1) AS provenance,
    (SELECT count(*)::int FROM trust.user_activity_events WHERE source_event_id=$2 AND event_type='moderation.case_opened') AS activity,
    (SELECT count(*)::int FROM system.consumer_inbox WHERE event_id=$2) AS inbox,
    (SELECT count(*)::int FROM system.outbox_events WHERE aggregate_id=$1 AND event_type LIKE '%published%') AS publications,
    (SELECT moderation_state FROM content.posts WHERE id=$1) AS state,
    (SELECT published_at FROM content.posts WHERE id=$1) AS published_at`, [item.post.id, item.event.eventId])).rows[0];
}
async function pending(item) {
  assert.equal((await rows(item)).published_at, null);
  assert.equal((await rows(item)).publications, 0);
  assert.equal((await call(null, 'GET', '/api/posts/' + item.post.id)).status, 404);
}
async function hold(item, outcome = 'queue') {
  const caseId = uuidv7(), decision = uuidv7();
  await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id)
    VALUES($1,'post',$2,'resolved','synthetic-independent-policy-v1',$3)`, [caseId, item.post.id, item.event.eventId]);
  await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version)
    VALUES($1,$2,$3,'synthetic-independent-policy-v1')`, [decision, caseId, outcome]);
  return { caseId, decision };
}
async function override(item) {
  const { caseId, decision } = await hold(item), appeal = uuidv7();
  const contentHash = await communityDigest({ body: 'Synthetic publishing body', declaration: item.event.payload.declaredCreationMode });
  const evidenceHash = await communityDigest(await communityClassifierEvidence(client, 'post', item.post.id, item.event.eventId));
  await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,policy_version)
    VALUES($1,$2,$3,'resolved_allow','lythaus-monthly-rewards-2026-10-v1')`, [appeal, caseId, item.author]);
  await client.query(`INSERT INTO moderation.community_appeal_sessions(appeal_id,rules_version,challenged_decision_id,
    source_event_id,content_type,content_id,content_hash,evidence_hash,state)
    VALUES($1,'synthetic-publishing-rules',$2,$3,'post',$4,$5,$6,'resolved_allow')`,
  [appeal, decision, item.event.eventId, item.post.id, contentHash, evidenceHash]);
  await client.query(`INSERT INTO moderation.community_appeal_overrides(appeal_id,decision_id,content_type,content_id,source_event_id,content_hash,evidence_hash,recorded_at)
    VALUES($1,$2,'post',$3,$4,$5,$6,now())`, [appeal, decision, item.post.id, item.event.eventId, contentHash, evidenceHash]);
  return () => identicalCommunityAppealOverride(client, { contentType: 'post', contentId: item.post.id,
    sourceEventId: item.event.eventId, body: 'Synthetic publishing body', declaredCreationMode: item.event.payload.declaredCreationMode });
}

for (const mode of ['human', 'ai_assisted']) for (const outcome of ['pass', 'review', 'block', 'unknown']) {
  test(`${mode} submission with ${outcome} evaluation remains private review with no publication authority`, requiresAccountLock, async () => {
    const item = await created(mode);
    fixture.modelResponse = { recommendation: outcome, riskScore: outcome === 'pass' ? 0 : 1,
      signals: [{ category: 'synthetic_' + outcome, confidence: 1, rationale: 'Synthetic feedback only' }] };
    fixture.failModel = outcome === 'unknown';
    try { assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 }); } finally { fixture.failModel = false; }
    const state = await rows(item);
    assert.deepEqual([state.detectors, state.cases, state.provenance, state.activity, state.state], [1, 1, 1, 1, 'under_review']);
    const declaration = (await client.query('SELECT public_label,review_required FROM content.content_declarations WHERE post_id=$1', [item.post.id])).rows[0];
    assert.deepEqual(declaration, { public_label: 'Under review', review_required: true });
    const decision = (await client.query('SELECT outcome,policy_version FROM moderation.decisions WHERE case_id IN (SELECT id FROM moderation.cases WHERE content_id=$1)', [item.post.id])).rows[0];
    assert.deepEqual(decision, { outcome: 'queue', policy_version: 'evaluation-only-v1' });
    const owner = await call(item.token, 'GET', '/api/posts/' + item.post.id + '/owner-view');
    assert.equal(owner.status, 200); assert.equal((await owner.json()).post.moderationState, 'under_review');
    assert.match(owner.headers.get('cache-control'), /private.*no-store/); await pending(item);
  });
}
for (const timing of ['before', 'during']) for (const mutation of ['locked', 'relink_required', 'suspended', 'deleted_account', 'deleted_post', 'body', 'declaration', 'author', 'superseded_source', 'source_actor', 'source_payload', 'independent_queue', 'independent_block', 'peer_override']) {
  test(`${mutation} ${timing} inference fences late review evidence and preserves authority`, timing === 'during' ? requiresAccountLock : {}, async () => {
    const item = await created(), calls = fixture.modelCalls;
    let identical;
    const mutate = async () => {
      if (mutation === 'locked') await client.query("UPDATE identity.users SET status='locked' WHERE id=$1", [item.author]);
      if (mutation === 'relink_required' || mutation === 'suspended') await client.query('UPDATE identity.users SET status=$2 WHERE id=$1', [item.author, mutation]);
      if (mutation === 'deleted_account') await client.query("UPDATE identity.users SET deleted_at=now() WHERE id=$1", [item.author]);
      if (mutation === 'deleted_post') await client.query('UPDATE content.posts SET deleted_at=now() WHERE id=$1', [item.post.id]);
      if (mutation === 'body') await client.query("UPDATE content.posts SET body='Changed synthetic body' WHERE id=$1", [item.post.id]);
      if (mutation === 'declaration') await client.query("UPDATE content.posts SET declared_creation_mode='ai_assisted' WHERE id=$1", [item.post.id]);
      if (mutation === 'author') {
        const replacement = uuidv7();
        await client.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [replacement]);
        await client.query('UPDATE content.posts SET author_id=$2 WHERE id=$1', [item.post.id, replacement]);
      }
      if (mutation === 'superseded_source') await client.query('UPDATE content.posts SET moderation_source_event_id=$2 WHERE id=$1', [item.post.id, uuidv7()]);
      if (mutation === 'source_actor') await client.query('UPDATE system.outbox_events SET actor_id=NULL WHERE id=$1', [item.event.eventId]);
      if (mutation === 'source_payload') await client.query("UPDATE system.outbox_events SET payload='{}' WHERE id=$1", [item.event.eventId]);
      if (mutation.startsWith('independent_')) await hold(item, mutation === 'independent_queue' ? 'queue' : 'block');
      if (mutation === 'peer_override') identical = await override(item);
    };
    if (timing === 'before') await mutate(); else fixture.duringModel = mutate;
    try { assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 }); } finally { fixture.duringModel = undefined; }
    assert.equal(fixture.modelCalls, calls + (timing === 'during' ? 1 : 0));
    const state = await rows(item);
    assert.equal(state.detectors, 0); assert.equal(state.provenance, 0); assert.equal(state.activity, 0);
    if (identical) assert.equal(await identical(), true, 'no new safety/classifier evidence changes the appeal fingerprint');
    await pending(item);
  });
}
test('revised submissions bind new event and body hash while stale delivery is ignored', async () => {
  const item = await created(), calls = fixture.modelCalls;
  const response = await call(item.token, 'PUT', '/api/posts/' + item.post.id, { body: 'New synthetic revision', declaredCreationMode: 'human' });
  assert.equal(response.status, 200);
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 }); assert.equal(fixture.modelCalls, calls);
  const event = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events
    WHERE aggregate_id=$1 AND event_type='content.post.updated'`, [item.post.id])).rows[0];
  assert.deepEqual(await deliver(event), requiresAccountLock.skip ? { ack: 0, retry: 1 } : { ack: 1, retry: 0 });
  assert.equal((await rows({ ...item, event })).detectors, requiresAccountLock.skip ? 0 : 1); await pending(item);
});

test('preflight commits before inference; final Jobs EXECUTE, ordered cases and post fence one complete review bundle', requiresAccountLock, async () => {
  const item = await created(), start = fixture.statements.length;
  let probe;
  fixture.duringModel = async () => {
    const statements = fixture.statements.slice(start);
    probe = statements.find(row => row.text.startsWith('SELECT trust.lock_active_post_review_author('));
    assert.ok(probe);
    assert.ok(statements.some(row => row.transactionId === probe.transactionId && row.text === 'COMMIT'));
    const writer = new pg.Client({ connectionString, ssl: false }); await writer.connect();
    try {
      await writer.query("SET lock_timeout='500ms'");
      await writer.query('BEGIN'); await writer.query('SET LOCAL ROLE lythaus_privacy');
      await writer.query("UPDATE identity.users SET status='locked' WHERE id=$1", [item.author]);
      await writer.query('ROLLBACK');
    } finally { await writer.query('ROLLBACK'); await writer.end(); }
  };
  try { assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 }); }
  finally { fixture.duringModel = undefined; }
  const statements = fixture.statements.slice(start), fences = statements.filter(row =>
    row.text.startsWith('SELECT trust.lock_active_post_review_author('));
  assert.equal(fences.length, 2); assert.notEqual(fences[0].transactionId, fences[1].transactionId);
  const final = statements.filter(row => row.transactionId === fences[1].transactionId);
  const author = final.findIndex(row => row.text.startsWith('SELECT trust.lock_active_post_review_author('));
  const cases = final.findIndex(row => row.text.includes('ORDER BY id FOR UPDATE'));
  const post = final.findIndex(row => row.text.includes('FOR UPDATE OF post'));
  const write = final.findIndex(row => row.text.includes('INSERT INTO moderation.detector_runs'));
  assert.ok(author >= 0 && author < cases && cases < post && post < write);
  for (const table of ['moderation.detector_runs','content.content_declarations','moderation.cases',
    'moderation.decisions','trust.provenance_events','trust.user_activity_events']) {
    assert.ok(final.some(row => row.text.includes('INSERT INTO ' + table)), table + ' must share the authoritative transaction');
  }
  assert.ok(final.every(row => row.role === 'lythaus_jobs'));
  assert.equal(final.at(-1).text, 'COMMIT');
  assert.ok(!statements.some(row => row.text.includes('FOR SHARE') || row.role === 'lythaus_privacy'));
  assert.deepEqual(await rows(item), { detectors: 1, cases: 1, provenance: 1, activity: 1,
    inbox: 1, publications: 0, state: 'under_review', published_at: null });
  await pending(item);
});

for (const restriction of ['status','deletion']) test(`privacy ${restriction} writer waits for the authoritative Jobs author fence through review COMMIT`, requiresAccountLock, async () => {
  const item = await created(), writer = new pg.Client({ connectionString, ssl: false });
  await writer.connect(); await writer.query('SET SESSION AUTHORIZATION lythaus_privacy');
  const reached = Promise.withResolvers(), resume = Promise.withResolvers();
  let invocations = 0, delivery, update;
  fixture.afterSql = async input => {
    if (input.text.startsWith('SELECT trust.lock_active_post_review_author(') && ++invocations === 2) {
      reached.resolve(input.backendPid); await resume.promise;
    }
  };
  try {
    delivery = deliver(item.event); const holder = await reached.promise;
    await writer.query('BEGIN');
    update = writer.query(restriction === 'status' ? "UPDATE identity.users SET status='locked' WHERE id=$1"
      : 'UPDATE identity.users SET deleted_at=now() WHERE id=$1', [item.author]);
    const deadline = Date.now() + 4000;
    let waits = false;
    while (Date.now() < deadline) {
      waits = (await client.query('SELECT $2::integer=ANY(pg_blocking_pids($1)) AS waits',
        [writer.processID, holder])).rows[0].waits;
      if (waits) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waits, true, 'privacy update must wait for the actual final author-lock holder');
    resume.resolve(); assert.deepEqual(await delivery, { ack: 1, retry: 0 });
    await update; await writer.query('COMMIT');
    const state = await rows(item);
    assert.deepEqual([state.detectors,state.cases,state.provenance,state.activity], [1,1,1,1]);
    await pending(item);
  } finally {
    resume.resolve(); fixture.afterSql = undefined;
    if (delivery) await delivery;
    if (update) await update.catch(() => undefined);
    await writer.query('ROLLBACK'); await writer.end();
  }
});

test('absent proposed function leaves canonical Jobs retryable with no inference or review writes', async () => {
  const item = await created(), calls = fixture.modelCalls;
  if (!requiresAccountLock.skip) await client.query('DROP FUNCTION ' + postReviewAuthorLockSignature);
  try {
    assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 });
    assert.equal(fixture.modelCalls, calls);
    const state = await rows(item);
    assert.deepEqual([state.detectors,state.cases,state.provenance,state.activity,state.inbox], [0,0,0,0,0]);
    await pending(item);
  } finally { if (!requiresAccountLock.skip) await installProposedPostReviewCapability(connectionString); }
});

for (const withdrawal of ['during_inference', 'before_final_call']) test(`EXECUTE withdrawal ${withdrawal} preserves fresh-session denial and records admitted-transaction limits`, requiresAccountLock, async () => {
  const item = await created(), calls = fixture.modelCalls;
  let invoked = 0, revoked = false;
  const revoke = async () => {
    await client.query('REVOKE EXECUTE ON FUNCTION ' + postReviewAuthorLockSignature + ' FROM lythaus_jobs'); revoked = true;
    assert.equal((await client.query("SELECT has_function_privilege('lythaus_jobs',$1,'EXECUTE') AS allowed",
      [postReviewAuthorLockSignature])).rows[0].allowed, false);
  };
  if (withdrawal === 'during_inference') fixture.duringModel = revoke;
  else fixture.duringSql = async input => {
    if (input.text.startsWith('SELECT trust.lock_active_post_review_author(') && ++invoked === 2) await revoke();
  };
  try {
    const reply = await deliver(item.event);
    assert.equal(revoked, true, 'the proposed EXECUTE withdrawal must actually execute');
    assert.deepEqual(reply, withdrawal === 'during_inference' ? { ack: 0, retry: 1 } : { ack: 1, retry: 0 });
    const state = await rows(item);
    const admitted = withdrawal === 'before_final_call' ? 1 : 0;
    assert.deepEqual([state.detectors,state.cases,state.provenance,state.activity,state.inbox],
      [admitted,admitted,admitted,admitted,admitted]);
    assert.equal(fixture.modelCalls, calls + 1); await pending(item);
    const fresh = await created();
    assert.deepEqual(await deliver(fresh.event), { ack: 0, retry: 1 });
    assert.equal((await rows(fresh)).detectors, 0); assert.equal(fixture.modelCalls, calls + 1); await pending(fresh);
  } finally {
    fixture.duringModel = undefined; fixture.duringSql = undefined;
    await client.query('GRANT EXECUTE ON FUNCTION ' + postReviewAuthorLockSignature + ' TO lythaus_jobs');
  }
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.equal((await rows(item)).detectors, 1); assert.equal(fixture.modelCalls, calls + 1); await pending(item);
});

for (const phase of ['preflight','final']) test(`lost ${phase} COMMIT acknowledgement is uncertain and same-event retry reconciles durable effects`, requiresAccountLock, async () => {
  const item = await created(), calls = fixture.modelCalls;
  let selected, interrupted = false;
  fixture.afterSql = input => {
    if (input.role !== 'lythaus_jobs') return;
    if (phase === 'preflight' && input.text.startsWith('SELECT trust.lock_active_post_review_author(')) selected ??= input.transactionId;
    if (phase === 'final' && input.text.includes('INSERT INTO moderation.detector_runs')) selected = input.transactionId;
    if (selected && input.transactionId === selected && input.text === 'COMMIT') {
      interrupted = true; fixture.afterSql = undefined; throw new Error('synthetic_lost_commit_acknowledgement');
    }
  };
  try { assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 }); }
  finally { fixture.afterSql = undefined; }
  assert.equal(interrupted, true);
  const state = await rows(item), durable = phase === 'final' ? 1 : 0;
  assert.deepEqual([state.detectors,state.cases,state.provenance,state.activity], [durable,durable,durable,durable]);
  assert.equal(fixture.modelCalls, calls + durable);
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  const retried = await rows(item);
  assert.deepEqual([retried.detectors,retried.cases,retried.provenance,retried.activity], [1,1,1,1]);
  assert.equal(fixture.modelCalls, calls + 1); await pending(item);
});
test('forged delivery cannot use a valid post revision with an absent canonical source event', async () => {
  const item = await created(), eventId = uuidv7(), calls = fixture.modelCalls;
  await client.query('UPDATE content.posts SET moderation_source_event_id=$2 WHERE id=$1', [item.post.id, eventId]);
  assert.deepEqual(await deliver({ ...item.event, eventId, payload: { ...item.event.payload, sourceEventId: eventId } }), { ack: 1, retry: 0 });
  assert.equal(fixture.modelCalls, calls); assert.equal((await rows(item)).detectors, 0); await pending(item);
});
test('interrupted apply rolls back detector, declaration, case, provenance and activity; retry is bounded by existing budget', requiresAccountLock, async () => {
  const item = await created(), calls = fixture.modelCalls;
  fixture.failSql = { match: 'INSERT INTO moderation.cases', remaining: 1 };
  assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 });
  assert.equal((await rows(item)).detectors, 0); assert.equal((await rows(item)).inbox, 0);
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.equal(fixture.modelCalls, calls + 1); assert.equal((await rows(item)).cases, 1); await pending(item);
});
test('interruption after applied review retries without duplicating records or provider calls', requiresAccountLock, async () => {
  const item = await created(), calls = fixture.modelCalls;
  fixture.failSql = { match: "UPDATE system.consumer_inbox SET state = 'completed'", remaining: 1 };
  assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 });
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  assert.equal(fixture.modelCalls, calls + (requiresAccountLock.skip ? 0 : 1));
  const state = await rows(item); assert.deepEqual([state.detectors, state.cases, state.provenance, state.activity], [1, 1, 1, 1]); await pending(item);
});
test('configured retry horizon exhaustion never publishes or fabricates a terminal moderation decision', async () => {
  const item = await created(), calls = fixture.modelCalls;
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const retries = Number(config.match(/"queue": "lythaus-moderation-dev",[^\n]*"max_retries": (\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(retries) && retries >= 0);
  fixture.failSql = { match: 'INSERT INTO moderation.cases', remaining: retries + 1 };
  for (let attempt = 0; attempt <= retries; attempt++) assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 });
  fixture.failSql = undefined;
  assert.equal(fixture.modelCalls, calls + (requiresAccountLock.skip ? 0 : 1));
  const state = await rows(item); assert.deepEqual([state.detectors, state.cases, state.inbox], [0, 0, 0]); await pending(item);
});
test('concurrent duplicate delivery preserves unavailable account-fence retry and null publication state', async () => {
  const item = await created();
  const replies = await Promise.all([deliver(item.event), deliver(item.event)]);
  if (requiresAccountLock.skip) {
    assert.ok(replies.every(reply => reply.retry === 1));
    assert.deepEqual(await deliver(item.event), { ack: 0, retry: 1 });
    const state = await rows(item); assert.deepEqual([state.detectors, state.cases, state.provenance, state.activity], [0, 0, 0, 0]);
    await pending(item); return;
  }
  assert.ok(replies.some(reply => reply.ack === 1));
  assert.deepEqual(await deliver(item.event), { ack: 1, retry: 0 });
  const state = await rows(item); assert.deepEqual([state.detectors, state.cases, state.provenance, state.activity], [1, 1, 1, 1]); await pending(item);
});
for (const boundary of ['account', 'post']) test(`concurrent ${boundary} decision wins the lock before late Jobs persistence`, requiresAccountLock, async () => {
  const item = await created(), connection = new pg.Client({ connectionString, ssl: false });
  await connection.connect();
  const waiting = Promise.withResolvers();
  let delivery;
  try {
    await connection.query('BEGIN');
    await connection.query('SET LOCAL ROLE ' + (boundary === 'account' ? 'lythaus_privacy' : 'lythaus_admin'));
    await connection.query(`SELECT id FROM ${boundary === 'account' ? 'identity.users' : 'content.posts'} WHERE id=$1 FOR UPDATE`,
      [boundary === 'account' ? item.author : item.post.id]);
    fixture.duringSql = input => {
      if (boundary === 'account' ? input.text.startsWith('SELECT trust.lock_active_post_review_author(')
        : input.text.includes('FOR UPDATE OF post')) waiting.resolve();
    };
    delivery = deliver(item.event);
    await waiting.promise;
    if (boundary === 'account') await connection.query("UPDATE identity.users SET status='locked' WHERE id=$1", [item.author]);
    else await connection.query("UPDATE content.posts SET moderation_state='blocked',published_at=NULL WHERE id=$1", [item.post.id]);
    await connection.query('COMMIT');
    assert.deepEqual(await delivery, { ack: 1, retry: 0 });
    const state = await rows(item); assert.equal(state.detectors, 0); assert.equal(state.cases, 0); await pending(item);
  } finally {
    fixture.duringSql = undefined; await connection.query('ROLLBACK'); await connection.end();
    if (delivery) await delivery;
  }
});
