import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import { signAccessToken, hmacLookup, uuidv7 } from '@lythaus/security';
import { APPEAL_POLICY } from '../../../packages/contracts/src/appeal-policy.ts';
import { recordReputationSignal } from '../../../packages/db/src/reputation.ts';
import { publicationAdmissionFixture } from './publication-admission-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_[a-z0-9_]+$/);
const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
let fixture, privateKeyPem, accessToken, adminId, parentPost, parentComment;
let requestNumber = 0;
const keyId = 'synthetic-publication-admission';
const policy = 'synthetic-historical-admission-v1';
const clusters = { ASCII: 'a', combining: 'e\u0301', ZWJ: '👩‍💻', flags: '🇿🇦', skin: '👍🏽' };

before(async () => {
  await client.connect();
  await client.query("SET statement_timeout='5s'");
  assert.match((await client.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  privateKeyPem = await exportPKCS8(privateKey);
  const subject = 'synthetic-publication-admin', hmacKey = randomBytes(32).toString('base64');
  fixture = await publicationAdmissionFixture(connectionString, {
    ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://api.lythaus.test',
    JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }),
    ACCESS_SUBJECT_HMAC_KEY: hmacKey, ACCESS_JWKS_URL: 'https://synthetic-access.invalid/jwks',
    ACCESS_AUDIENCES: 'synthetic-admission', ACCESS_TEAM_DOMAIN: 'synthetic-access.invalid',
  });
  adminId = (await actor()).id;
  await client.query("INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role,active) VALUES($1,decode($2,'base64'),'owner',true)",
    [adminId, hmacLookup(subject, hmacKey)]);
  accessToken = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId }).setSubject(subject)
    .setAudience('synthetic-admission').setIssuer('https://synthetic-access.invalid').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const owner = await actor();
  parentPost = await create(owner, 'post', { body: 'Synthetic permitted thread', declaredCreationMode: 'human' });
  await allow(await reviewCase(parentPost));
  parentComment = await create(owner, 'comment', { body: 'Synthetic permitted parent', declaredCreationMode: 'human' });
  await allow(await reviewCase(parentComment));
});
after(async () => { await fixture?.dispose(); await client.end(); });

async function actor() {
  const id = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic admission actor')", [id]);
  await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [id]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}
const createPath = kind => kind === 'post' ? '/api/posts' : `/api/posts/${parentPost.id}/comments`;
const itemPath = item => `/api/${item.kind === 'post' ? 'posts' : 'comments'}/${item.id}`;
const payload = (kind, input) => ({ ...input, ...(kind === 'post' ? { geoScope: 'none' } : kind === 'reply' ? { parentId: parentComment.id } : {}) });
async function call(owner, method, path, body, key = uuidv7(), extra = {}) {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, { method, headers: {
    ...(owner ? { authorization: 'Bearer ' + owner.token } : {}), 'content-type': 'application/json',
    'idempotency-key': key, 'cf-connecting-ip': `192.0.2.${++requestNumber % 250 + 1}`, ...extra,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function create(owner, kind, input, key = uuidv7()) {
  const response = await call(owner, 'POST', createPath(kind), payload(kind, input), key);
  assert.equal(response.status, 201, await response.clone().text());
  const result = await response.json();
  assert.equal(kind === 'post' ? result.content : result.body, input.body.normalize('NFC').trim());
  const table = kind === 'post' ? 'posts' : 'comments';
  const stored = (await client.query(`SELECT body,declared_creation_mode,moderation_state FROM content.${table} WHERE id=$1`, [result.id])).rows[0];
  assert.equal(stored.declared_creation_mode, input.declaredCreationMode);
  assert.equal(stored.moderation_state, 'under_review');
  const publicPath = kind === 'post' ? `/api/posts/${result.id}` : `/api/posts/${parentPost.id}/comments?limit=100`;
  const pending = await call(null, 'GET', publicPath);
  if (kind === 'post') assert.equal(pending.status, 404);
  else { assert.equal(pending.status, 200); assert.ok(!(await pending.text()).includes(result.id)); }
  return { ...result, declaredCreationMode: stored.declared_creation_mode, owner, kind, key };
}
async function reviewCase(item, policyVersion = policy) {
  const table = item.kind === 'post' ? 'posts' : 'comments';
  const row = (await client.query(`SELECT moderation_source_event_id FROM content.${table} WHERE id=$1`, [item.id])).rows[0];
  if (item.kind === 'post') {
    await client.query(`INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label,review_required)
      VALUES($1,$2,'Under review',true) ON CONFLICT(post_id) DO NOTHING`, [item.id, item.declaredCreationMode]);
  }
  const id = uuidv7();
  await client.query("INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id) VALUES($1,$2,$3,'open',$4,$5)",
    [id, item.kind === 'post' ? 'post' : 'comment', item.id, policyVersion, row.moderation_source_event_id]);
  return { id, item };
}
async function admin(review, input = {}, headers = {}) {
  return call(null, 'POST', `/api/admin/moderation/cases/${review.id}/decision`,
    { outcome: 'allow', reasonCode: 'SYNTHETIC_ALLOW', ...input }, uuidv7(),
    { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test', ...headers });
}
async function allow(review, publicLabel) {
  const response = await admin(review, publicLabel === undefined ? {} : { publicLabel });
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  const expected = review.item.declaredCreationMode === 'ai_assisted' ? 'AI-assisted' : 'Human-authored';
  assert.equal(result.publicLabel, expected);
  const row = (await client.query('SELECT policy_version,public_label FROM moderation.decisions WHERE case_id=$1', [review.id])).rows[0];
  assert.deepEqual(row, { policy_version: policy, public_label: expected });
  assert.equal((await call(review.item.owner, 'GET', itemPath(review.item) + '/owner-view')).status, 200);
  const publicPath = review.item.kind === 'post' ? itemPath(review.item) : `/api/posts/${parentPost.id}/comments?limit=100`;
  const published = await call(null, 'GET', publicPath);
  assert.equal(published.status, 200, await published.clone().text());
  const text = await published.text();
  assert.ok(text.includes(review.item.id));
  assert.ok(text.includes(expected));
  return result;
}
async function snapshot() {
  const result = {};
  for (const table of ['content.posts', 'content.comments', 'content.content_declarations', 'moderation.cases',
    'moderation.decisions', 'moderation.enforcement_events', 'system.outbox_events', 'system.audit_events',
    'trust.user_activity_events', 'trust.reputation_events', 'moderation.appeals', 'moderation.appeal_adjudications',
    'moderation.appeal_outcomes', 'moderation.appeal_outcome_effects', 'trust.provenance_events',
    'trust.reputation_profiles', 'trust.reputation_balances', 'feed.notifications', 'system.consumer_inbox']) {
    result[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
  }
  return result;
}
async function rejected(work, status, error) {
  const state = await snapshot(), response = await work();
  assert.equal(response.status, status, await response.clone().text());
  assert.equal((await response.json()).error, error);
  assert.deepEqual(await snapshot(), state, 'no content, declaration, case, decision, outbox, audit, activity or reward side effects');
}

test('pinned Workerd has real Segmenter; forced absence gives explicit unsupported result for every cluster', async () => {
  assert.equal(Array.from(clusters.ZWJ.repeat(249)).length, 747);
  assert.equal(Array.from(clusters.flags.repeat(249)).length, 498);
  for (const cluster of Object.values(clusters)) {
    const body = `  ${cluster.repeat(249)}  `;
    const reply = await call(null, 'POST', '/fixture/graphemes', { body, declaredCreationMode: 'ai_assisted' });
    const result = await reply.json();
    assert.equal(result.available, true); assert.equal(result.count, 249);
    assert.equal(result.decision.body, body.normalize('NFC').trim());
    const unsupported = await call(null, 'POST', '/fixture/graphemes', { body, declaredCreationMode: 'ai_assisted' }, uuidv7(),
      { 'x-fixture-segmenter': 'unavailable' });
    assert.deepEqual(await unsupported.json(), { available: false, error: 'grapheme_segmentation_unavailable' });
  }
});

for (const kind of ['post', 'comment', 'reply']) {
  for (const [name, cluster] of Object.entries(clusters)) test(`${kind} create/revise/admin allow enforces 249/250 ${name} graphemes atomically`, async () => {
    const owner = await actor(), body = `  ${cluster.repeat(249)}  `;
    const item = await create(owner, kind, { body, declaredCreationMode: 'ai_assisted' });
    const review = await reviewCase(item);
    await rejected(() => admin(review, { publicLabel: 'Human-authored' }), 400, 'admin_public_label_declaration_mismatch');
    await allow(review, 'AI-assisted');
    await rejected(() => call(owner, 'POST', createPath(kind), payload(kind, { body: cluster.repeat(250), declaredCreationMode: 'ai_assisted' })),
      400, 'ai_assisted_character_limit_exceeded');
    await rejected(() => call(owner, 'PUT', itemPath(item), { body: cluster.repeat(250), declaredCreationMode: 'ai_assisted' }),
      400, 'ai_assisted_character_limit_exceeded');
    const revised = await call(owner, 'PUT', itemPath(item), { body: ` ${cluster.repeat(248)}b `, declaredCreationMode: 'ai_assisted' });
    assert.equal(revised.status, 200, await revised.clone().text());
    const current = await reviewCase(item);
    await allow(current);
    const table = kind === 'post' ? 'posts' : 'comments';
    await client.query(`UPDATE content.${table} SET body=$1,moderation_state='under_review',moderation_source_event_id=$3 WHERE id=$2`,
      [cluster.repeat(250), item.id, uuidv7()]);
    const over = await reviewCase(item);
    await rejected(() => admin(over), 400, 'ai_assisted_character_limit_exceeded');
    const human = await create(owner, kind, { body: cluster.repeat(250), declaredCreationMode: 'human' });
    await allow(await reviewCase(human), 'Human-authored');
  });

  test(`${kind} rejects missing/invalid/generated declarations and preserves revision disclosure semantics`, async () => {
    const owner = await actor();
    for (const declaredCreationMode of [undefined, null, '', 'model_output', 'ai_generated']) {
      const invalidOwner = await actor();
      await rejected(() => call(invalidOwner, 'POST', createPath(kind), payload(kind, { body: 'Synthetic invalid disclosure', declaredCreationMode })),
        400, declaredCreationMode === 'ai_generated' ? 'ai_generated_public_content_blocked' : 'invalid_post');
    }
    const item = await create(owner, kind, { body: 'Synthetic original assisted item', declaredCreationMode: 'ai_assisted' });
    for (const declaredCreationMode of [null, false, 1, {}, ['human'], '', 'model_output', 'ai_generated']) {
      await rejected(() => call(owner, 'PUT', itemPath(item), { body: 'Synthetic invalid revision', declaredCreationMode }),
        400, declaredCreationMode === 'ai_generated' ? 'ai_generated_public_content_blocked' : kind === 'post' ? 'invalid_post' : 'invalid_comment');
    }
    if (kind === 'post') {
      await rejected(() => call(owner, 'PUT', itemPath(item), { body: 'Synthetic missing fresh declaration' }), 400, 'invalid_post');
      await rejected(() => call(owner, 'PUT', itemPath(item), { visibility: 'private', declaredCreationMode: null }), 400, 'invalid_post');
      await rejected(() => call(owner, 'PUT', itemPath(item), { declaredCreationMode: null }), 400, 'invalid_post');
      const visibility = await call(owner, 'PUT', itemPath(item), { visibility: 'private' });
      assert.equal(visibility.status, 200, await visibility.clone().text());
      assert.equal((await visibility.json()).post.declaredCreationMode, 'ai_assisted');
    } else {
      const revised = await call(owner, 'PUT', itemPath(item), { body: 'Synthetic reuse of stored assisted declaration' });
      assert.equal(revised.status, 200, await revised.clone().text());
      assert.equal((await revised.json()).declaredCreationMode, 'ai_assisted');
    }
    for (const declaredCreationMode of ['human', 'ai_assisted']) {
      const body = `Synthetic fresh ${declaredCreationMode} declaration`;
      const revised = await call(owner, 'PUT', itemPath(item), { body, declaredCreationMode });
      assert.equal(revised.status, 200, await revised.clone().text());
      const result = await revised.json(), revision = kind === 'post' ? result.post : result;
      assert.equal(revision.declaredCreationMode, declaredCreationMode);
      assert.equal(revision.body, body);
      assert.equal(revision.moderationState, 'under_review');
    }
    const table = kind === 'post' ? 'posts' : 'comments';
    if (kind === 'post') {
      await client.query("UPDATE content.posts SET declared_creation_mode='ai_generated' WHERE id=$1", [item.id]);
      const generated = await reviewCase(item);
      await rejected(() => admin(generated), 400, 'ai_generated_public_content_blocked');
    } else {
      const state = await snapshot();
      await assert.rejects(client.query("UPDATE content.comments SET declared_creation_mode='ai_generated' WHERE id=$1", [item.id]), { code: '23514' });
      assert.deepEqual(await snapshot(), state);
      await client.query("UPDATE content.comments SET declared_creation_mode='unknown' WHERE id=$1", [item.id]);
      const unknown = await reviewCase(item);
      await rejected(() => admin(unknown), 500, 'admin_request_failed');
      await client.query("UPDATE content.comments SET declared_creation_mode='human',body=' ' WHERE id=$1", [item.id]);
      await rejected(() => admin(unknown), 500, 'admin_request_failed');
    }
  });

  test(`${kind} stale/deleted cases, resolved replay and concurrent allows cannot publish another revision`, async () => {
    const item = await create(await actor(), kind, { body: 'Synthetic first revision', declaredCreationMode: 'human' });
    const stale = await reviewCase(item);
    const revised = await call(item.owner, 'PUT', itemPath(item), { body: 'Synthetic second revision', declaredCreationMode: 'human' });
    assert.equal(revised.status, 200, await revised.clone().text());
    await rejected(() => admin(stale), 409, 'moderation_case_superseded');
    await client.query("UPDATE moderation.cases SET state='superseded',resolved_at=now() WHERE id=$1", [stale.id]);
    const current = await reviewCase(item);
    const responses = await Promise.all([admin(current), admin(current)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM moderation.decisions WHERE case_id=$1', [current.id])).rows[0].count, 1);
    await rejected(() => admin(current), 409, 'moderation_case_already_resolved');
    const deleted = await create(await actor(), kind, { body: 'Synthetic deleted revision', declaredCreationMode: 'human' });
    const pending = await reviewCase(deleted);
    const removal = await call(deleted.owner, 'DELETE', itemPath(deleted));
    assert.equal(removal.status, 200, await removal.clone().text());
    await rejected(() => admin(pending), 409, 'moderation_case_superseded');
  });

  test(`${kind} replay, key reuse, unsupported runtime and interrupted revision preserve admission atomicity`, async () => {
    const owner = await actor(), key = uuidv7(), input = { body: 'Synthetic replay admission', declaredCreationMode: 'human' };
    const item = await create(owner, kind, input, key), state = await snapshot();
    const replay = await call(owner, 'POST', createPath(kind), payload(kind, input), key);
    assert.equal(replay.status, 201); assert.equal((await replay.json()).id, item.id);
    assert.deepEqual(await snapshot(), state);
    await rejected(() => call(owner, 'POST', createPath(kind), payload(kind, { ...input, body: 'Different synthetic request' }), key), 409, 'idempotency_key_conflict');
    await rejected(() => call(owner, 'POST', createPath(kind), payload(kind, input), uuidv7(), { 'x-fixture-segmenter': 'unavailable' }), 500, 'request_failed');
    await rejected(() => call(owner, 'PUT', itemPath(item), { ...input, body: 'Unsupported synthetic edit' }, uuidv7(), { 'x-fixture-segmenter': 'unavailable' }), 500, 'request_failed');
    fixture.interruptAfterSql = kind === 'post' ? /UPDATE content\.posts\s+SET body/ : /UPDATE content\.comments\s+SET body/;
    const interruptedKey = uuidv7();
    await rejected(() => call(owner, 'PUT', itemPath(item), { ...input, body: 'Synthetic interrupted edit' }, interruptedKey), 500, 'request_failed');
    await rejected(() => call(owner, 'PUT', itemPath(item), { ...input, body: 'Synthetic interrupted edit' }, interruptedKey), 409, 'idempotency_outcome_unknown');
    const retried = await call(owner, 'PUT', itemPath(item), { ...input, body: 'Synthetic interrupted edit' });
    assert.equal(retried.status, 200, await retried.clone().text());
    const review = await reviewCase(item);
    await rejected(() => admin(review, {}, { 'x-fixture-segmenter': 'unavailable' }), 500, 'admin_request_failed');
    fixture.interruptAfterSql = /INSERT INTO moderation\.decisions/;
    await rejected(() => admin(review), 500, 'admin_request_failed');
    await allow(review);
  });
}

test('missing post declaration rolls back a real admin allow after provisional decision and publication writes', async () => {
  const item = await create(await actor(), 'post', { body: 'Synthetic missing declaration', declaredCreationMode: 'human' });
  const review = await reviewCase(item);
  await client.query('DELETE FROM content.content_declarations WHERE post_id=$1', [item.id]);
  await rejected(() => admin(review), 409, 'moderation_declaration_missing');
});

test('historical appeal authority stays fail-closed across admin, outbox, Jobs and standing', async t => {
  const reviewers = [];
  for (let index = 0; index < 5; index++) reviewers.push(await actor());
  const oldRole = (await client.query('SELECT role FROM identity.admin_memberships WHERE user_id=$1', [adminId])).rows[0].role;
  await client.query("UPDATE identity.admin_memberships SET role='editorial' WHERE user_id=$1", [adminId]);
  for (const reviewer of [...reviewers, { id: adminId }]) {
    await client.query("INSERT INTO moderation.reviewer_qualifications(user_id,state,policy_version,trained_at) VALUES($1,'trained',$2,now())",
      [reviewer.id, APPEAL_POLICY.version]);
  }
  const adjudicate = (appealId, decision = 'overturn', key = uuidv7()) =>
    call(null, 'POST', '/api/admin/appeals/' + appealId + '/adjudications',
      { decision, reasonCode: 'SYNTHETIC_APPEAL' }, key,
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
  const deliver = async (event, messagePayload = event.payload) => {
    const response = await call(null, 'POST', '/fixture/queue', {
      eventId: event.id, eventType: event.event_type, payload: messagePayload,
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const refresh = async userId => {
    const response = await call(null, 'POST', '/fixture/reputation', { userId });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).profile;
  };
  const seedVotes = async (appealId, decision) => {
    for (const [index, reviewer] of reviewers.entries()) {
      const assignmentId = uuidv7();
      await client.query("INSERT INTO moderation.appeal_assignments (id,appeal_id,reviewer_id,assignment_ordinal,level_snapshot,qualification_snapshot,vote_weight_snapshot,state,random_rank_hash,conflict_checked,policy_version) VALUES($1,$2,$3,$4,1,'trained',1,'voted',$5,true,$6)",
        [assignmentId, appealId, reviewer.id, index + 1, 'a'.repeat(64), APPEAL_POLICY.version]);
      await client.query("INSERT INTO moderation.appeal_review_votes (id,assignment_id,appeal_id,reviewer_id,decision,level_snapshot,qualification_snapshot,vote_weight_snapshot,idempotency_key,policy_version) VALUES($1,$2,$3,$4,$5,1,'trained',1,$6,$7)",
        [uuidv7(), assignmentId, appealId, reviewer.id, decision, 'synthetic-' + appealId + '-' + reviewer.id, APPEAL_POLICY.version]);
    }
  };
  const prepare = async ({ kind = 'post', previouslyPublic = false, decision = 'overturn', intake = true } = {}) => {
    const item = await create(await actor(), kind, { body: 'Synthetic authority fixture ' + uuidv7(), declaredCreationMode: 'human' });
    const review = await reviewCase(item);
    if (previouslyPublic) {
      await allow(review);
      await client.query("UPDATE moderation.cases SET state='open',resolved_at=NULL WHERE id=$1", [review.id]);
    }
    const blocked = await admin(review, { outcome: 'block', reasonCode: 'CONFIRMED_SPAM', publicLabel: 'Under review' });
    assert.equal(blocked.status, 200, await blocked.clone().text());
    const blockDecisionId = (await client.query("SELECT metadata->>'decisionId' AS id FROM system.audit_events WHERE action='moderation.decision' AND correlation_id=$1 AND target_id=$2",
      [blocked.headers.get('x-correlation-id'), review.id])).rows[0].id;
    const blockEvent = (await client.query("SELECT id,event_type,payload FROM system.outbox_events WHERE event_type='moderation.content.blocked' AND aggregate_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [item.id])).rows[0];
    assert.ok(blockEvent);
    if (!intake) return { item, review, blockEvent, blockDecisionId };
    const response = await call(item.owner, 'POST', '/api/appeals', { caseId: review.id, statement: 'Synthetic historical appeal statement' });
    assert.equal(response.status, 201, await response.clone().text());
    const appealId = (await response.json()).appealId;
    await seedVotes(appealId, decision);
    return { item, review, appealId, blockEvent, blockDecisionId };
  };
  const seedHistoricalPenalty = async (f, event, signalType, decisionId = f.blockDecisionId) => {
    await client.query('BEGIN');
    try {
      const mutation = await recordReputationSignal(client, { id: uuidv7(), subjectUserId: f.item.owner.id,
        contentId: f.item.id, signalType, sourceEventId: event.id, moderationDecisionId: decisionId,
        occurredAt: new Date().toISOString() });
      await client.query('COMMIT');
      return mutation.event;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  };
  const unavailable = async appealId => {
    await rejected(() => adjudicate(appealId), 503, 'appeal_resolution_unavailable');
    const state = (await client.query("SELECT state,policy_version FROM moderation.appeals WHERE id=$1", [appealId])).rows[0];
    assert.deepEqual(state, { state: 'open', policy_version: APPEAL_POLICY.version });
  };
  const legacyEvent = async (f, overrides = {}) => {
    await client.query("UPDATE moderation.appeals SET state='resolved',resolved_at=now() WHERE id=$1", [f.appealId]);
    await client.query("INSERT INTO moderation.appeal_outcomes (appeal_id,risk_class,reviewer_panel_decision,final_decision,completed_reviewers,total_weight,overturn_weight,uphold_weight,winning_share,required_adjudicators,state,policy_version,resolved_at) VALUES($1,'standard','overturn','overturn',5,5,5,0,1,1,'resolved',$2,now()) ON CONFLICT(appeal_id) DO NOTHING",
      [f.appealId, APPEAL_POLICY.version]);
    const id = uuidv7(), payload = { appealId: f.appealId, subjectUserId: f.item.owner.id,
      contentId: f.item.id, contentType: f.item.kind === 'post' ? 'post' : 'comment',
      finalDecision: 'overturn', riskClass: 'standard', ...overrides };
    await client.query("INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'moderation.appeal.resolved','appeal',$2,$3,$4::jsonb)",
      [id, f.appealId, adminId, JSON.stringify(payload)]);
    return { id, event_type: 'moderation.appeal.resolved', payload };
  };
  try {
    await t.test('real intake has no binding; failed and concurrent overturns leave every authority effect unchanged', async () => {
      const f = await prepare({ previouslyPublic: true });
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='moderation' AND table_name='appeals' AND column_name='challenged_decision_id'");
      assert.equal(columns.rowCount, 0);
      const intake = (await client.query("SELECT payload FROM system.outbox_events WHERE event_type='moderation.appeal.created' AND aggregate_id=$1", [f.appealId])).rows[0];
      assert.equal(intake.payload.caseId, f.review.id);
      assert.equal(intake.payload.challengedDecisionId, undefined);
      fixture.interruptAfterSql = /INSERT INTO moderation\.appeal_adjudications/;
      await rejected(() => adjudicate(f.appealId), 500, 'admin_request_failed');
      await unavailable(f.appealId);
      const before = await snapshot(), key = uuidv7();
      const replies = await Promise.all([adjudicate(f.appealId, 'overturn', key), adjudicate(f.appealId, 'overturn', key)]);
      for (const response of replies) {
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error, 'appeal_resolution_unavailable');
      }
      assert.deepEqual(await snapshot(), before);
      await unavailable(f.appealId);
      assert.equal((await call(null, 'GET', itemPath(f.item))).status, 404);
      assert.equal((await refresh(f.item.owner.id)).promotionBlockers.includes('unresolved_serious_enforcement'), true);
      assert.equal((await client.query("SELECT policy_version FROM moderation.cases WHERE id=$1", [f.review.id])).rows[0].policy_version, policy);
    });

    await t.test('previous publication, replies, generated content and missing declarations cannot substitute for binding', async () => {
      for (const variant of [
        { kind: 'reply', previouslyPublic: true },
        { declaredCreationMode: 'ai_generated' },
        { missingDeclaration: true },
        { previouslyPublic: false },
      ]) {
        const f = await prepare(variant);
        if (variant.declaredCreationMode) {
          await client.query("UPDATE content.posts SET visibility='private',declared_creation_mode=$2 WHERE id=$1", [f.item.id, variant.declaredCreationMode]);
          await client.query('UPDATE content.content_declarations SET declared_creation_mode=$2 WHERE post_id=$1', [f.item.id, variant.declaredCreationMode]);
        }
        if (variant.missingDeclaration) await client.query('DELETE FROM content.content_declarations WHERE post_id=$1', [f.item.id]);
        await unavailable(f.appealId);
        const table = f.item.kind === 'post' ? 'posts' : 'comments';
        assert.equal((await client.query('SELECT moderation_state FROM content.' + table + ' WHERE id=$1', [f.item.id])).rows[0].moderation_state, 'blocked');
      }
    });

    await t.test('late commit with default now and an independent queue cannot acquire reversal authority', async () => {
      const f = await prepare({ previouslyPublic: true, intake: false });
      const blocker = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
      await blocker.connect();
      let raceAppealId;
      try {
        await blocker.query('BEGIN');
        const lateDecisionId = uuidv7();
        const intake = await call(f.item.owner, 'POST', '/api/appeals', { caseId: f.review.id, statement: 'Synthetic late-commit appeal' });
        assert.equal(intake.status, 201, await intake.clone().text());
        raceAppealId = (await intake.json()).appealId;
        const created = (await client.query('SELECT created_at FROM moderation.appeals WHERE id=$1', [raceAppealId])).rows[0].created_at;
        const late = (await blocker.query("INSERT INTO moderation.decisions(id,case_id,outcome,policy_version,decided_by) VALUES($1,$2,'block',$3,$4) RETURNING created_at",
          [lateDecisionId, f.review.id, policy, adminId])).rows[0];
        await blocker.query("INSERT INTO moderation.enforcement_events(id,case_id,subject_id,action,reason_code,policy_version,actor_id) VALUES($1,$2,$3,'block','CONFIRMED_HARASSMENT',$4,$5)",
          [uuidv7(), f.review.id, f.item.owner.id, policy, adminId]);
        assert.ok(late.created_at < created, 'transaction-start default now predates appeal intake despite committing later');
        await seedVotes(raceAppealId, 'overturn');
        await client.query("INSERT INTO moderation.decisions(id,case_id,outcome,policy_version,decided_by,created_at) VALUES($1,$2,'queue','evaluation-only-v1',$3,clock_timestamp())",
          [uuidv7(), f.review.id, adminId]);
        await unavailable(raceAppealId);
        await blocker.query('COMMIT');
      } finally {
        await blocker.query('ROLLBACK');
        await blocker.end();
      }
      await unavailable(raceAppealId);
      const profile = await refresh(f.item.owner.id);
      assert.ok(profile.promotionBlockers.includes('unresolved_serious_enforcement'));
    });

    await t.test('stale revision and independent penalties survive old canonical overturn events, retries and forged authority labels', async () => {
      const f = await prepare();
      const role = (await client.query("SELECT has_table_privilege('lythaus_jobs','identity.users','UPDATE') AS can_lock_users")).rows[0];
      assert.equal(role.can_lock_users, false);
      const empty = await snapshot();
      assert.deepEqual(await deliver(f.blockEvent), { ack: 0, retry: 1 });
      assert.deepEqual(await snapshot(), empty, 'canonical Jobs cannot apply a penalty without its required user-lock privilege');
      await seedHistoricalPenalty(f, f.blockEvent, 'confirmed_spam');
      const initialPenalty = (await client.query("SELECT id,status,moderation_decision_id FROM trust.reputation_events WHERE subject_user_id=$1 AND impact<0", [f.item.owner.id])).rows[0];
      assert.equal(initialPenalty.status, 'effective');
      const revised = await call(f.item.owner, 'PUT', itemPath(f.item), { body: 'Synthetic current revision', declaredCreationMode: 'human' });
      assert.equal(revised.status, 200, await revised.clone().text());
      const currentReview = await reviewCase(f.item);
      const currentBlock = await admin(currentReview, { outcome: 'block', reasonCode: 'CONFIRMED_HARASSMENT', publicLabel: 'Under review' });
      assert.equal(currentBlock.status, 200, await currentBlock.clone().text());
      const currentDecisionId = (await client.query("SELECT metadata->>'decisionId' AS id FROM system.audit_events WHERE action='moderation.decision' AND correlation_id=$1 AND target_id=$2",
        [currentBlock.headers.get('x-correlation-id'), currentReview.id])).rows[0].id;
      const currentEvent = (await client.query("SELECT id,event_type,payload FROM system.outbox_events WHERE event_type='moderation.content.blocked' AND aggregate_id=$1 AND id<>$2",
        [f.item.id, f.blockEvent.id])).rows[0];
      await seedHistoricalPenalty(f, currentEvent, 'confirmed_harassment', currentDecisionId);
      await unavailable(f.appealId);
      const event = await legacyEvent(f, { challengeBinding: 'bound', challengedDecisionId: initialPenalty.moderation_decision_id,
        sourceEventId: f.blockEvent.payload.sourceEventId, contentReversed: true, policyVersion: APPEAL_POLICY.version });
      await client.query("INSERT INTO moderation.enforcement_events(id,case_id,subject_id,action,reason_code,policy_version,actor_id,created_at) VALUES($1,$2,$3,'appeal_overturn','SYNTHETIC_LEGACY_OVERTURN',$4,$5,clock_timestamp())",
        [uuidv7(), f.review.id, f.item.owner.id, APPEAL_POLICY.version, adminId]);
      const before = await snapshot();
      fixture.interruptAfterSql = /UPDATE system\.consumer_inbox SET state = 'completed'/;
      assert.deepEqual(await deliver(event), { ack: 0, retry: 1 });
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await deliver(event), { ack: 1, retry: 0 });
      const after = await snapshot();
      assert.deepEqual(await deliver(event, { finalDecision: 'uphold', challengedDecisionId: currentDecisionId }), { ack: 1, retry: 0 });
      assert.deepEqual(await snapshot(), after);
      const penalties = (await client.query("SELECT id,status FROM trust.reputation_events WHERE subject_user_id=$1 AND impact<0 ORDER BY id", [f.item.owner.id])).rows;
      assert.equal(penalties.length, 2);
      assert.ok(penalties.every(row => row.status === 'effective'));
      for (const overrides of [{ finalDecision: 'uphold' }, { finalDecision: 'bogus' }, { finalDecision: undefined }, { subjectUserId: undefined }]) {
        const oldEvent = await legacyEvent(f, overrides), state = await snapshot();
        const expected = overrides.finalDecision === 'uphold' ? { ack: 1, retry: 0 } : { ack: 0, retry: 1 };
        assert.deepEqual(await deliver(oldEvent), expected);
        if (expected.retry) assert.deepEqual(await snapshot(), state);
        assert.deepEqual((await client.query('SELECT id,status FROM trust.reputation_events WHERE subject_user_id=$1 AND impact<0 ORDER BY id', [f.item.owner.id])).rows, penalties);
      }
      const profile = await refresh(f.item.owner.id);
      assert.ok(profile.promotionBlockers.includes('unresolved_serious_enforcement'));
      await client.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [f.item.owner.id]);
      assert.equal((await refresh(f.item.owner.id)).status, 'suspended');
      assert.equal((await client.query('SELECT status FROM identity.users WHERE id=$1', [f.item.owner.id])).rows[0].status, 'suspended');
      assert.equal((await call(null, 'GET', itemPath(f.item))).status, 404);
    });

    await t.test('an old same-case overturn marker cannot clear any independent block during reputation refresh', async () => {
      const f = await prepare();
      await client.query("INSERT INTO moderation.enforcement_events(id,case_id,subject_id,action,reason_code,policy_version,actor_id,created_at) VALUES($1,$2,$3,'block','SYNTHETIC_INDEPENDENT_BLOCK',$4,$5,clock_timestamp())",
        [uuidv7(), f.review.id, f.item.owner.id, policy, adminId]);
      await client.query("INSERT INTO moderation.enforcement_events(id,case_id,subject_id,action,reason_code,policy_version,actor_id,created_at) VALUES($1,$2,$3,'appeal_overturn','SYNTHETIC_UNBOUND_MARKER',$4,$5,clock_timestamp())",
        [uuidv7(), f.review.id, f.item.owner.id, APPEAL_POLICY.version, adminId]);
      assert.ok((await refresh(f.item.owner.id)).promotionBlockers.includes('unresolved_serious_enforcement'));
      await unavailable(f.appealId);
    });

    await t.test('historical uphold rolls back on audit failure; its actual admin outbox retries safely under canonical Jobs privileges', async () => {
      const f = await prepare({ decision: 'uphold' });
      fixture.interruptAfterSql = /INSERT INTO system\.audit_events/;
      await rejected(() => adjudicate(f.appealId, 'uphold'), 500, 'admin_request_failed');
      const response = await adjudicate(f.appealId, 'uphold');
      assert.equal(response.status, 200, await response.clone().text());
      const result = await response.json();
      assert.equal(result.status, 'resolved'); assert.equal(result.finalDecision, 'uphold');
      assert.equal(result.policyVersion, APPEAL_POLICY.version);
      const event = (await client.query("SELECT id,event_type,payload FROM system.outbox_events WHERE event_type='moderation.appeal.resolved' AND aggregate_id=$1", [f.appealId])).rows[0];
      assert.equal(event.payload.finalDecision, 'uphold');
      const before = await snapshot();
      assert.deepEqual(await deliver(event), { ack: 0, retry: 1 });
      assert.equal((await client.query('SELECT 1 FROM trust.reputation_events WHERE appeal_id=$1', [f.appealId])).rowCount, 0);
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await deliver(event, { finalDecision: 'overturn' }), { ack: 0, retry: 1 });
      assert.deepEqual(await snapshot(), before);
      await rejected(() => adjudicate(f.appealId, 'uphold'), 409, 'appeal_already_resolved');
      assert.ok((await refresh(f.item.owner.id)).promotionBlockers.includes('unresolved_serious_enforcement'));
      const audit = (await client.query("SELECT metadata FROM system.audit_events WHERE target_id=$1 AND action='moderation.appeal.outcome_applied'", [f.appealId])).rows[0].metadata;
      assert.equal(audit.outcome, 'uphold'); assert.equal(audit.contentReversed, false);
    });

    await t.test('historical high-risk pending adjudications remain intact when final overturn authority is unavailable', async () => {
      const f = await prepare();
      await client.query("UPDATE moderation.appeals SET risk_class='high' WHERE id=$1", [f.appealId]);
      const pending = await adjudicate(f.appealId);
      assert.equal(pending.status, 200, await pending.clone().text());
      const evaluation = await pending.json();
      assert.equal(evaluation.status, 'pending_adjudication');
      assert.equal(evaluation.finalDecision, null);
      assert.equal(evaluation.requiredAdjudicators, 2);
      const second = await actor();
      await client.query("INSERT INTO moderation.appeal_adjudications(id,appeal_id,adjudicator_id,adjudicator_role,trained_snapshot,decision,reason_code,policy_version) VALUES($1,$2,$3,'editorial',true,'overturn','SYNTHETIC_HISTORICAL_PENDING',$4)",
        [uuidv7(), f.appealId, second.id, APPEAL_POLICY.version]);
      await unavailable(f.appealId);
      const stored = (await client.query('SELECT state,final_decision,required_adjudicators,policy_version FROM moderation.appeal_outcomes WHERE appeal_id=$1', [f.appealId])).rows[0];
      assert.deepEqual(stored, { state: 'pending_adjudication', final_decision: null, required_adjudicators: 2, policy_version: APPEAL_POLICY.version });
    });

    await t.test('unsupported policy versions remain unresolved without relabelling historical records', async () => {
      const f = await prepare();
      await client.query("UPDATE moderation.appeals SET policy_version='synthetic-unsupported-policy' WHERE id=$1", [f.appealId]);
      await rejected(() => adjudicate(f.appealId), 400, 'appeal_policy_version_unsupported');
    });

    await t.test('profile privilege failure remains sanitized and rolls back before profile access', async () => {
      const owner = await actor(), appellant = await actor(), caseId = uuidv7(), appealId = uuidv7();
      await client.query("UPDATE social.profiles SET moderation_state='blocked',moderation_source_event_id=$2 WHERE user_id=$1", [owner.id, uuidv7()]);
      await client.query("INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id) VALUES($1,'profile',$2,'resolved',$3,$4)", [caseId, owner.id, policy, uuidv7()]);
      await client.query("INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement) VALUES($1,$2,$3,'open','standard',$4,'Synthetic profile appeal')",
        [appealId, caseId, appellant.id, APPEAL_POLICY.version]);
      await rejected(() => adjudicate(appealId), 503, 'appeal_profile_access_unavailable');
      assert.equal(fixture.statements.some(({ role, text }) => role === 'lythaus_admin' && /FROM social\.profiles/i.test(text)), false);
    });
  } finally {
    await client.query('DELETE FROM moderation.reviewer_qualifications WHERE user_id=ANY($1::uuid[])',
      [[...reviewers.map(reviewer => reviewer.id), adminId]]);
    await client.query('UPDATE identity.admin_memberships SET role=$2 WHERE user_id=$1', [adminId, oldRole]);
  }
});

test('admin authentication, origin and restricted roles execute; all outbound requests remain synthetic', async () => {
  const item = await create(await actor(), 'post', { body: 'Synthetic boundary evidence', declaredCreationMode: 'human' });
  const review = await reviewCase(item);
  await rejected(() => admin(review, {}, { 'cf-access-jwt-assertion': 'invalid' }), 401, 'access_assertion_invalid');
  await rejected(() => admin(review, {}, { origin: 'https://untrusted.invalid' }), 403, 'admin_mutation_origin_invalid');
  await client.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1', [adminId]);
  await rejected(() => admin(review), 403, 'admin_role_required');
  await client.query('UPDATE identity.admin_memberships SET active=true WHERE user_id=$1', [adminId]);
  await allow(review);
  assert.ok(fixture.statements.some(statement => statement.role === 'lythaus_runtime' && /INSERT INTO content\.posts/.test(statement.text)));
  assert.ok(fixture.statements.some(statement => statement.role === 'lythaus_admin' && /INSERT INTO moderation\.decisions/.test(statement.text)));
  assert.ok(fixture.outbound.length > 0);
  assert.ok(fixture.outbound.every(url => url === 'https://synthetic-access.invalid/jwks'));
});
