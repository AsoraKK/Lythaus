import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import { signAccessToken, hmacLookup, uuidv7 } from '@lythaus/security';
import { APPEAL_POLICY } from '../../../packages/contracts/src/appeal-policy.ts';
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
    'trust.user_activity_events', 'trust.reputation_events']) {
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

test('historical overturn fails closed without durable challenge binding and preserves private content', async () => {
  const profileAccess = (await client.query(`SELECT has_schema_privilege('lythaus_admin','social','USAGE') AS "schemaUsage",
      has_table_privilege('lythaus_admin','social.profiles','SELECT') AS "profileSelect"`)).rows[0];
  assert.deepEqual(profileAccess, { schemaUsage: false, profileSelect: false },
    'the canonical admin role deliberately has no social profile read grant');
  const postOwner = await actor();
  const item = await create(postOwner, 'post', { body: 'Synthetic historical appeal restoration', declaredCreationMode: 'human' });
  const review = await reviewCase(item);
  const initialAllow = await admin(review, { reasonCode: 'SYNTHETIC_PRIOR_ALLOW' });
  assert.equal(initialAllow.status, 200, await initialAllow.clone().text());
  assert.equal((await call(null, 'GET', itemPath(item))).status, 200,
    'the same source revision was public after an explicit human allow');
  const priorPublicDecision = (await client.query(
    `SELECT id FROM moderation.decisions WHERE case_id=$1 AND outcome='allow' AND decided_by IS NOT NULL`, [review.id],
  )).rows[0];
  assert.ok(priorPublicDecision, 'the source revision was explicitly allowed before the synthetic block');
  const priorPublicPublication = (await client.query(`SELECT id,created_at FROM system.outbox_events
    WHERE aggregate_type='post' AND aggregate_id=$1 AND event_type='content.post.published'
    ORDER BY created_at DESC,id DESC LIMIT 1`, [item.id])).rows[0];
  assert.ok(priorPublicPublication, 'the admitted source revision has a durable publication outbox event');
  const challengedDecisionId = uuidv7();
  await client.query(`UPDATE content.posts SET moderation_state='blocked',published_at=NULL WHERE id=$1`, [item.id]);
  await client.query(`UPDATE content.content_declarations
    SET public_label='Under review',review_required=true,updated_at=now() WHERE post_id=$1`, [item.id]);
  await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,public_label,policy_version,decided_by,created_at)
    VALUES($1,$2,'block','Under review',$3,$4,clock_timestamp())`,
  [challengedDecisionId, review.id, policy, adminId]);
  const appealId = uuidv7();
  await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
    VALUES($1,$2,$3,'open','standard',$4,'Synthetic historical appeal')`,
  [appealId, review.id, postOwner.id, APPEAL_POLICY.version]);

  const reviewers = [];
  for (let index = 0; index < 5; index++) reviewers.push(await actor());
  const adjudicatorRole = (await client.query('SELECT role FROM identity.admin_memberships WHERE user_id=$1', [adminId])).rows[0].role;
  try {
    await client.query("UPDATE identity.admin_memberships SET role='editorial' WHERE user_id=$1", [adminId]);
    for (const reviewer of [...reviewers, { id: adminId }]) {
      await client.query(`INSERT INTO moderation.reviewer_qualifications(user_id,state,policy_version,trained_at)
        VALUES($1,'trained',$2,now())`, [reviewer.id, APPEAL_POLICY.version]);
    }
    const seedOverturnVotes = async targetAppealId => {
      for (const [index, reviewer] of reviewers.entries()) {
        const assignmentId = uuidv7();
        await client.query(`INSERT INTO moderation.appeal_assignments
          (id,appeal_id,reviewer_id,assignment_ordinal,level_snapshot,qualification_snapshot,vote_weight_snapshot,
           state,random_rank_hash,conflict_checked,policy_version)
          VALUES($1,$2,$3,$4,1,'trained',1,'voted',$5,true,$6)`,
        [assignmentId, targetAppealId, reviewer.id, index + 1, 'a'.repeat(64), APPEAL_POLICY.version]);
        await client.query(`INSERT INTO moderation.appeal_review_votes
          (id,assignment_id,appeal_id,reviewer_id,decision,level_snapshot,qualification_snapshot,vote_weight_snapshot,idempotency_key,policy_version)
          VALUES($1,$2,$3,$4,'overturn',1,'trained',1,$5,$6)`,
        [uuidv7(), assignmentId, targetAppealId, reviewer.id, `synthetic-${targetAppealId}-${reviewer.id}`, APPEAL_POLICY.version]);
      }
    };
    await seedOverturnVotes(appealId);
    const response = await call(null, 'POST', `/api/admin/appeals/${appealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_OVERTURN' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.finalDecision, 'overturn');
    assert.equal(result.policyVersion, APPEAL_POLICY.version);
    const versions = (await client.query(`SELECT c.policy_version AS "casePolicy", a.policy_version AS "appealPolicy",
        adjudication.policy_version AS "adjudicationPolicy",
        outcome.policy_version AS "outcomePolicy"
      FROM moderation.cases c
      JOIN moderation.appeals a ON a.case_id=c.id
      JOIN moderation.appeal_adjudications adjudication ON adjudication.appeal_id=a.id
      JOIN moderation.appeal_outcomes outcome ON outcome.appeal_id=a.id
      WHERE a.id=$1`, [appealId])).rows[0];
    assert.deepEqual(versions, {
      casePolicy: policy, appealPolicy: APPEAL_POLICY.version,
      adjudicationPolicy: APPEAL_POLICY.version,
      outcomePolicy: APPEAL_POLICY.version,
    });
    const appealState = (await client.query(`SELECT post.moderation_state AS "moderationState",
        declaration.public_label AS "publicLabel", declaration.review_required AS "reviewRequired",
        post.published_at AS "publishedAt"
      FROM content.posts post JOIN content.content_declarations declaration ON declaration.post_id=post.id
      WHERE post.id=$1`, [item.id])).rows[0];
    assert.deepEqual(appealState, {
      moderationState: 'blocked', publicLabel: 'Under review', reviewRequired: true,
      publishedAt: null,
    });
    const appealAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [appealId])).rows[0].metadata;
    assert.equal(appealAudit.challengedDecisionId, null);
    assert.equal(appealAudit.challengeBinding, 'unavailable');
    assert.equal(appealAudit.contentReversalHold, 'challenged_decision_unavailable');
    assert.equal(appealAudit.contentReversed, false);
    assert.equal(appealAudit.sourceEventId,
      (await client.query('SELECT source_event_id FROM moderation.cases WHERE id=$1', [review.id])).rows[0].source_event_id);
    assert.equal((await call(null, 'GET', itemPath(item))).status, 404,
      'a previous allow and publication event cannot substitute for a durable challenge binding');
    assert.equal(fixture.statements.some(({ role, text }) => role === 'lythaus_admin' && /FROM social\.profiles/i.test(text)), false,
      'post appeal adjudication must not read profile data');

    const previouslyPublicReply = await create(await actor(), 'reply', {
      body: 'Synthetic previously published reply', declaredCreationMode: 'human',
    });
    const replyReview = await reviewCase(previouslyPublicReply);
    const replyAllow = await admin(replyReview, { reasonCode: 'SYNTHETIC_REPLY_PRIOR_ALLOW' });
    assert.equal(replyAllow.status, 200, await replyAllow.clone().text());
    assert.equal((await call(null, 'GET', `/api/posts/${parentPost.id}/comments?limit=100`)).status, 200);
    const replyPriorPublication = (await client.query(`SELECT id FROM system.outbox_events
      WHERE aggregate_type='comment' AND aggregate_id=$1 AND event_type='content.comment.published'
      ORDER BY created_at DESC,id DESC LIMIT 1`, [previouslyPublicReply.id])).rows[0];
    assert.ok(replyPriorPublication);
    const replyChallengeId = uuidv7();
    await client.query("UPDATE content.comments SET moderation_state='blocked' WHERE id=$1", [previouslyPublicReply.id]);
    await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version,decided_by,created_at)
      VALUES($1,$2,'block',$3,$4,clock_timestamp())`,
    [replyChallengeId, replyReview.id, policy, adminId]);
    const replyAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic previously published reply appeal')`,
    [replyAppealId, replyReview.id, previouslyPublicReply.owner.id, APPEAL_POLICY.version]);
    await seedOverturnVotes(replyAppealId);
    const replyResponse = await call(null, 'POST', `/api/admin/appeals/${replyAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_REPLY_OVERTURN' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(replyResponse.status, 200, await replyResponse.clone().text());
    const privateReplyList = await call(null, 'GET', `/api/posts/${parentPost.id}/comments?limit=100`);
    assert.equal(privateReplyList.status, 200, await privateReplyList.clone().text());
    assert.equal((await privateReplyList.text()).includes(previouslyPublicReply.id), false,
      'an overturn without a durable challenge binding does not restore a reply');
    assert.equal((await client.query('SELECT moderation_state FROM content.comments WHERE id=$1',
      [previouslyPublicReply.id])).rows[0].moderation_state, 'blocked');
    const replyAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [replyAppealId])).rows[0].metadata;
    assert.equal(replyAudit.challengeBinding, 'unavailable');
    assert.equal(replyAudit.challengedDecisionId, null);
    assert.equal(replyAudit.contentReversalHold, 'challenged_decision_unavailable');
    assert.equal(replyAudit.contentReversed, false);

    const allowedWithoutPublication = await create(await actor(), 'post', {
      body: 'Synthetic allow without publication evidence stays private', declaredCreationMode: 'human',
    });
    const unpublishedReview = await reviewCase(allowedWithoutPublication);
    await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,public_label,policy_version,decided_by)
      VALUES($1,$2,'allow','Human-authored',$3,$4)`,
    [uuidv7(), unpublishedReview.id, policy, adminId]);
    await client.query(`UPDATE content.posts SET moderation_state='blocked',published_at=NULL WHERE id=$1`, [allowedWithoutPublication.id]);
    await client.query(`UPDATE content.content_declarations
      SET public_label='Under review',review_required=true,updated_at=now() WHERE post_id=$1`, [allowedWithoutPublication.id]);
    const unpublishedChallengeId = uuidv7();
    await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,public_label,policy_version,decided_by,created_at)
      VALUES($1,$2,'block','Under review',$3,$4,clock_timestamp())`,
    [unpublishedChallengeId, unpublishedReview.id, policy, adminId]);
    const unpublishedAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic unpublished prior allow')`,
    [unpublishedAppealId, unpublishedReview.id, allowedWithoutPublication.owner.id, APPEAL_POLICY.version]);
    await seedOverturnVotes(unpublishedAppealId);
    const unpublishedResponse = await call(null, 'POST', `/api/admin/appeals/${unpublishedAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_UNPUBLISHED_OVERTURN' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(unpublishedResponse.status, 200, await unpublishedResponse.clone().text());
    assert.equal((await client.query(`SELECT moderation_state FROM content.posts WHERE id=$1`,
      [allowedWithoutPublication.id])).rows[0].moderation_state, 'blocked');
    assert.equal((await call(null, 'GET', itemPath(allowedWithoutPublication))).status, 404);
    const unpublishedAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [unpublishedAppealId])).rows[0].metadata;
    assert.equal(unpublishedAudit.challengeBinding, 'unavailable');
    assert.equal(unpublishedAudit.challengedDecisionId, null);
    assert.equal(unpublishedAudit.contentReversalHold, 'challenged_decision_unavailable');

    const generated = await create(await actor(), 'post', {
      body: 'Synthetic appeal must preserve generated-content block', declaredCreationMode: 'human',
    });
    await client.query("UPDATE content.posts SET visibility='private',declared_creation_mode='ai_generated' WHERE id=$1", [generated.id]);
    await client.query("UPDATE content.content_declarations SET declared_creation_mode='ai_generated',public_label='Under review',review_required=true WHERE post_id=$1",
      [generated.id]);
    const generatedReview = await reviewCase({ ...generated, declaredCreationMode: 'ai_generated' });
    const generatedBlock = await admin(generatedReview, { outcome: 'block', publicLabel: 'Under review' });
    assert.equal(generatedBlock.status, 200, await generatedBlock.clone().text());
    const generatedAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic generated-content appeal')`,
    [generatedAppealId, generatedReview.id, generatedReview.item.owner.id, APPEAL_POLICY.version]);
    await seedOverturnVotes(generatedAppealId);
    const generatedResponse = await call(null, 'POST', `/api/admin/appeals/${generatedAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_GENERATED_OVERTURN' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(generatedResponse.status, 200, await generatedResponse.clone().text());
    assert.equal((await generatedResponse.json()).finalDecision, 'overturn');
    const generatedState = (await client.query(`SELECT post.moderation_state AS "moderationState",
        declaration.public_label AS "publicLabel", declaration.review_required AS "reviewRequired",
        post.published_at IS NOT NULL AS "published", appeal.state AS "appealState",
        count(adjudication.id)::integer AS "adjudicationCount",
        EXISTS(SELECT 1 FROM moderation.appeal_outcome_effects effect
          WHERE effect.appeal_id=appeal.id AND effect.effect_type='content_reversal') AS "hasContentReversal"
      FROM content.posts post JOIN content.content_declarations declaration ON declaration.post_id=post.id
      JOIN moderation.appeals appeal ON appeal.case_id=$2
      LEFT JOIN moderation.appeal_adjudications adjudication ON adjudication.appeal_id=appeal.id
      WHERE post.id=$1 GROUP BY post.id,declaration.post_id,appeal.id`, [generated.id, generatedReview.id])).rows[0];
    assert.deepEqual(generatedState, {
      moderationState: 'blocked', publicLabel: 'Under review', reviewRequired: true, published: false,
      appealState: 'resolved', adjudicationCount: 1, hasContentReversal: false,
    });
    const generatedAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [generatedAppealId])).rows[0].metadata;
    assert.equal(generatedAudit.challengeBinding, 'unavailable');
    assert.equal(generatedAudit.contentReversalHold, 'challenged_decision_unavailable');

    const neverPublic = await create(await actor(), 'post', {
      body: 'Synthetic never-public appeal remains private', declaredCreationMode: 'human',
    });
    const neverPublicReview = await reviewCase(neverPublic);
    const neverPublicBlock = await admin(neverPublicReview, { outcome: 'block', publicLabel: 'Under review' });
    assert.equal(neverPublicBlock.status, 200, await neverPublicBlock.clone().text());
    const neverPublicAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic never-public appeal')`,
    [neverPublicAppealId, neverPublicReview.id, neverPublic.owner.id, APPEAL_POLICY.version]);
    await seedOverturnVotes(neverPublicAppealId);
    const neverPublicResponse = await call(null, 'POST', `/api/admin/appeals/${neverPublicAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_NEVER_PUBLIC' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(neverPublicResponse.status, 200, await neverPublicResponse.clone().text());
    assert.equal((await neverPublicResponse.json()).finalDecision, 'overturn');
    const neverPublicState = (await client.query(`SELECT post.moderation_state AS "moderationState",
        post.published_at IS NOT NULL AS "published", appeal.state AS "appealState",
        EXISTS(SELECT 1 FROM moderation.appeal_outcome_effects effect
          WHERE effect.appeal_id=appeal.id AND effect.effect_type='content_reversal') AS "hasContentReversal"
      FROM content.posts post JOIN moderation.appeals appeal ON appeal.id=$2 WHERE post.id=$1`,
    [neverPublic.id, neverPublicAppealId])).rows[0];
    assert.deepEqual(neverPublicState, {
      moderationState: 'blocked', published: false, appealState: 'resolved', hasContentReversal: false,
    });
    assert.equal((await call(null, 'GET', itemPath(neverPublic))).status, 404,
      'an appeal overturn cannot publish a revision with no exact prior-publication evidence');
    const neverPublicAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [neverPublicAppealId])).rows[0].metadata;
    assert.equal(neverPublicAudit.challengeBinding, 'unavailable');
    assert.equal(neverPublicAudit.contentReversalHold, 'challenged_decision_unavailable');

    const missing = await create(await actor(), 'post', {
      body: 'Synthetic appeal cannot bypass a missing declaration', declaredCreationMode: 'human',
    });
    const missingReview = await reviewCase(missing);
    const missingPriorAllow = await admin(missingReview, { reasonCode: 'SYNTHETIC_MISSING_PRIOR_ALLOW' });
    assert.equal(missingPriorAllow.status, 200, await missingPriorAllow.clone().text());
    await client.query(`UPDATE content.posts SET moderation_state='blocked',published_at=NULL WHERE id=$1`, [missing.id]);
    await client.query(`UPDATE content.content_declarations
      SET public_label='Under review',review_required=true,updated_at=now() WHERE post_id=$1`, [missing.id]);
    await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,public_label,policy_version,decided_by,created_at)
      VALUES($1,$2,'block','Under review',$3,$4,clock_timestamp())`,
    [uuidv7(), missingReview.id, policy, adminId]);
    const missingAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic missing-declaration appeal')`,
    [missingAppealId, missingReview.id, missingReview.item.owner.id, APPEAL_POLICY.version]);
    await seedOverturnVotes(missingAppealId);
    await client.query('DELETE FROM content.content_declarations WHERE post_id=$1', [missing.id]);
    const missingResponse = await call(null, 'POST', `/api/admin/appeals/${missingAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_MISSING_DECLARATION' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(missingResponse.status, 200, await missingResponse.clone().text());
    assert.equal((await missingResponse.json()).finalDecision, 'overturn');
    const missingState = (await client.query(`SELECT post.moderation_state AS "moderationState",
        post.published_at IS NOT NULL AS "published", appeal.state AS "appealState",
        count(adjudication.id)::integer AS "adjudicationCount",
        EXISTS(SELECT 1 FROM content.content_declarations WHERE post_id=post.id) AS "declarationExists"
      FROM content.posts post JOIN moderation.appeals appeal ON appeal.case_id=$2
      LEFT JOIN moderation.appeal_adjudications adjudication ON adjudication.appeal_id=appeal.id
      WHERE post.id=$1 GROUP BY post.id,appeal.id`, [missing.id, missingReview.id])).rows[0];
    assert.deepEqual(missingState, {
      moderationState: 'blocked', published: false, appealState: 'resolved', adjudicationCount: 1, declarationExists: false,
    });
    const missingAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [missingAppealId])).rows[0].metadata;
    assert.equal(missingAudit.contentReversalHold, 'challenged_decision_unavailable');

    const profileOwner = await actor(), profileAppellant = await actor(), profileSourceEventId = uuidv7();
    await client.query(`UPDATE social.profiles
      SET moderation_state='blocked',moderation_source_event_id=$2 WHERE user_id=$1`, [profileOwner.id, profileSourceEventId]);
    const profileCaseId = uuidv7(), profileAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id)
      VALUES($1,'profile',$2,'resolved',$3,$4)`, [profileCaseId, profileOwner.id, policy, profileSourceEventId]);
    await client.query(`INSERT INTO moderation.decisions(id,case_id,outcome,policy_version)
      VALUES($1,$2,'block',$3)`, [uuidv7(), profileCaseId, policy]);
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic unauthorized profile appeal')`,
    [profileAppealId, profileCaseId, profileAppellant.id, APPEAL_POLICY.version]);
    const profileResponse = await call(null, 'POST', `/api/admin/appeals/${profileAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_PROFILE_ACCESS' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(profileResponse.status, 503, await profileResponse.clone().text());
    assert.equal((await profileResponse.json()).error, 'appeal_profile_access_unavailable');
    const profileState = (await client.query(`SELECT profile.moderation_state AS "moderationState",
        profile.moderation_source_event_id AS "sourceEventId", appeal.state AS "appealState",
        count(adjudication.id)::integer AS "adjudicationCount"
      FROM social.profiles profile JOIN moderation.appeals appeal ON appeal.id=$2
      LEFT JOIN moderation.appeal_adjudications adjudication ON adjudication.appeal_id=appeal.id
      WHERE profile.user_id=$1 GROUP BY profile.user_id,appeal.id`, [profileOwner.id, profileAppealId])).rows[0];
    assert.deepEqual(profileState, {
      moderationState: 'blocked', sourceEventId: profileSourceEventId, appealState: 'open', adjudicationCount: 0,
    });
    assert.equal(fixture.statements.some(({ role, text }) => role === 'lythaus_admin' && /FROM social\.profiles/i.test(text)), false,
      'an unauthorized profile read fails at the privilege check before accessing social.profiles');

    const raceOwner = await actor();
    const racePost = await create(raceOwner, 'post', {
      body: 'Synthetic late-commit appeal binding race', declaredCreationMode: 'human',
    });
    const raceReview = await reviewCase(racePost);
    const raceAllow = await admin(raceReview, { reasonCode: 'SYNTHETIC_RACE_PRIOR_ALLOW' });
    assert.equal(raceAllow.status, 200, await raceAllow.clone().text());
    assert.equal((await call(null, 'GET', itemPath(racePost))).status, 200);
    const raceAppealId = uuidv7();
    const blocker = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
    await blocker.connect();
    let transactionStartedAt;
    let restrictiveDecision;
    let raceAppeal;
    let ambiguousQueue;
    try {
      await blocker.query('BEGIN');
      transactionStartedAt = (await blocker.query('SELECT transaction_timestamp() AS started_at')).rows[0].started_at;
      await blocker.query('SELECT pg_sleep(0.01)');
      const restrictiveDecisionId = uuidv7();
      await blocker.query(`INSERT INTO moderation.decisions(id,case_id,outcome,public_label,policy_version,decided_by)
        VALUES($1,$2,'block','Under review',$3,$4)`,
      [restrictiveDecisionId, raceReview.id, policy, adminId]);
      restrictiveDecision = (await blocker.query(
        'SELECT id,created_at FROM moderation.decisions WHERE id=$1', [restrictiveDecisionId],
      )).rows[0];
      await blocker.query(`UPDATE content.posts SET moderation_state='blocked',published_at=NULL WHERE id=$1`, [racePost.id]);
      await blocker.query(`UPDATE content.content_declarations
        SET public_label='Under review',review_required=true,updated_at=now() WHERE post_id=$1`, [racePost.id]);
      raceAppeal = (await client.query(`INSERT INTO moderation.appeals
        (id,case_id,appellant_id,state,risk_class,policy_version,statement)
        VALUES($1,$2,$3,'open','standard',$4,'Synthetic late-commit challenge binding race')
        RETURNING created_at`,
      [raceAppealId, raceReview.id, raceOwner.id, APPEAL_POLICY.version])).rows[0];
      assert.ok(transactionStartedAt < raceAppeal.created_at,
        'the restrictive decision transaction starts before appeal intake');
      assert.ok(restrictiveDecision.created_at < raceAppeal.created_at,
        'the uncommitted restrictive decision uses the earlier transaction-start timestamp');
      ambiguousQueue = (await client.query(`INSERT INTO moderation.decisions
        (id,case_id,outcome,policy_version,decided_by)
        VALUES($1,$2,'queue','evaluation-only-v1',$3)
        RETURNING id,created_at`,
      [uuidv7(), raceReview.id, adminId])).rows[0];
      assert.ok(raceAppeal.created_at < ambiguousQueue.created_at,
        'an explicitly admin-authored evaluation-only queue is recorded after appeal intake');
      await blocker.query('COMMIT');
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await blocker.end();
    }
    await seedOverturnVotes(raceAppealId);
    const raceResponse = await call(null, 'POST', `/api/admin/appeals/${raceAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_LATE_COMMIT_RACE' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(raceResponse.status, 200, await raceResponse.clone().text());
    assert.equal((await raceResponse.json()).finalDecision, 'overturn');
    const raceState = (await client.query(`SELECT post.moderation_state AS "moderationState",
        declaration.public_label AS "publicLabel", declaration.review_required AS "reviewRequired",
        post.published_at IS NOT NULL AS "published", appeal.state AS "appealState",
        EXISTS(SELECT 1 FROM moderation.appeal_outcome_effects effect
          WHERE effect.appeal_id=appeal.id AND effect.effect_type='content_reversal') AS "hasContentReversal"
      FROM content.posts post JOIN content.content_declarations declaration ON declaration.post_id=post.id
      JOIN moderation.appeals appeal ON appeal.id=$2 WHERE post.id=$1`, [racePost.id, raceAppealId])).rows[0];
    assert.deepEqual(raceState, {
      moderationState: 'blocked', publicLabel: 'Under review', reviewRequired: true,
      published: false, appealState: 'resolved', hasContentReversal: false,
    });
    assert.equal((await call(null, 'GET', itemPath(racePost))).status, 404,
      'a late-committed restriction and ambiguous queue cannot restore a previously public revision');
    const raceAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [raceAppealId])).rows[0].metadata;
    assert.equal(raceAudit.challengeBinding, 'unavailable');
    assert.equal(raceAudit.challengedDecisionId, null);
    assert.equal(raceAudit.contentReversalHold, 'challenged_decision_unavailable');
    assert.equal(raceAudit.contentReversed, false);
    assert.ok(restrictiveDecision.id);
    assert.ok(ambiguousQueue.id);

    const revisedOwner = await actor();
    const revisedPost = await create(revisedOwner, 'post', {
      body: 'Synthetic stale-source appeal boundary', declaredCreationMode: 'human',
    });
    const oldReview = await reviewCase(revisedPost);
    const oldAllow = await admin(oldReview, { reasonCode: 'SYNTHETIC_OLD_REVISION_ALLOW' });
    assert.equal(oldAllow.status, 200, await oldAllow.clone().text());
    const oldSource = (await client.query('SELECT source_event_id FROM moderation.cases WHERE id=$1', [oldReview.id])).rows[0].source_event_id;
    assert.equal((await call(null, 'GET', itemPath(revisedPost))).status, 200);
    const revision = await call(revisedOwner, 'PUT', itemPath(revisedPost), {
      body: 'Synthetic current-source appeal boundary', declaredCreationMode: 'human',
    });
    assert.equal(revision.status, 200, await revision.clone().text());
    const currentReview = await reviewCase(revisedPost);
    assert.notEqual(currentReview.id, oldReview.id);
    const currentBlock = await admin(currentReview, { outcome: 'block', publicLabel: 'Under review' });
    assert.equal(currentBlock.status, 200, await currentBlock.clone().text());
    const currentAppealId = uuidv7();
    await client.query(`INSERT INTO moderation.appeals(id,case_id,appellant_id,state,risk_class,policy_version,statement)
      VALUES($1,$2,$3,'open','standard',$4,'Synthetic current revision appeal')`,
    [currentAppealId, currentReview.id, revisedOwner.id, APPEAL_POLICY.version]);
    await seedOverturnVotes(currentAppealId);
    const currentResponse = await call(null, 'POST', `/api/admin/appeals/${currentAppealId}/adjudications`,
      { decision: 'overturn', reasonCode: 'SYNTHETIC_CURRENT_REVISION' }, uuidv7(),
      { 'cf-access-jwt-assertion': accessToken, origin: 'https://api.lythaus.test' });
    assert.equal(currentResponse.status, 200, await currentResponse.clone().text());
    assert.equal((await currentResponse.json()).finalDecision, 'overturn');
    const revisionSources = (await client.query(`SELECT old_case.source_event_id AS "oldSource",
        current_case.source_event_id AS "currentSource", post.moderation_source_event_id AS "postSource",
        old_case.state AS "oldCaseState", current_case.state AS "currentCaseState",
        post.moderation_state AS "moderationState", post.published_at IS NOT NULL AS "published"
      FROM moderation.cases old_case
      JOIN moderation.cases current_case ON current_case.id=$2
      JOIN content.posts post ON post.id=old_case.content_id
      WHERE old_case.id=$1`, [oldReview.id, currentReview.id])).rows[0];
    assert.equal(revisionSources.oldSource, oldSource);
    assert.notEqual(revisionSources.oldSource, revisionSources.currentSource);
    assert.equal(revisionSources.currentSource, revisionSources.postSource);
    assert.equal(revisionSources.oldCaseState, 'resolved');
    assert.equal(revisionSources.currentCaseState, 'resolved');
    assert.equal(revisionSources.moderationState, 'blocked');
    assert.equal(revisionSources.published, false);
    assert.equal((await call(null, 'GET', itemPath(revisedPost))).status, 404,
      'a prior allow on another source revision cannot authorize publication of the current revision');
    const staleAudit = (await client.query(`SELECT metadata FROM system.audit_events
      WHERE target_type='appeal' AND target_id=$1 AND action='moderation.appeal.outcome_applied'
      ORDER BY created_at DESC LIMIT 1`, [currentAppealId])).rows[0].metadata;
    assert.equal(staleAudit.sourceEventId, revisionSources.currentSource);
    assert.equal(staleAudit.challengedDecisionId, null);
    assert.equal(staleAudit.contentReversalHold, 'challenged_decision_unavailable');
  } finally {
    await client.query('DELETE FROM moderation.reviewer_qualifications WHERE user_id=ANY($1::uuid[])',
      [[...reviewers.map(reviewer => reviewer.id), adminId]]);
    await client.query('UPDATE identity.admin_memberships SET role=$2 WHERE user_id=$1', [adminId, adjudicatorRole]);
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
