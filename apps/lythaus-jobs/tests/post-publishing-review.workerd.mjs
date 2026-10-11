import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import { signAccessToken, uuidv7, hmacLookup } from '@lythaus/security';
import { postModerationFixture, postReviewTestOptions } from './post-moderation-fixture.mjs';
import { PROPOSED_COMMUNITY_APPEAL_RULES } from '../../../packages/contracts/src/monthly-peer-appeal-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { APPEAL_POLICY } from '../../../packages/contracts/src/appeal-policy.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const requiresAccountLock = await postReviewTestOptions(connectionString);
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_publishing_[a-f0-9]+$/);
const client = new pg.Client({ connectionString, ssl: false });
let fixture, privateKeyPem, signingKey, keyId, adminToken, adminId;
before(async () => {
  await client.connect();
  await client.query(readFileSync(new URL('../../../database/planetscale/proposals/community_appeals.sql', import.meta.url), 'utf8'));
  const pair = await generateKeyPair('ES256', { extractable: true });
  signingKey = pair.privateKey;
  privateKeyPem = await exportPKCS8(pair.privateKey); keyId = 'synthetic-publishing-review';
  const jwks = JSON.stringify({ keys: [{ ...await exportJWK(pair.publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] });
  adminId = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic moderator')", [adminId]);
  await client.query(`INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role,active)
    VALUES($1,decode($2,'base64'),'owner',true)`, [adminId, hmacLookup('synthetic-review-owner', 'synthetic-review-key')]);
  adminToken = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId }).setSubject('synthetic-review-owner')
    .setAudience('synthetic-review').setIssuer('https://access.synthetic.invalid').setIssuedAt().setExpirationTime('1h').sign(pair.privateKey);
  fixture = await postModerationFixture(connectionString, { ENVIRONMENT: 'local',
    EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://api.lythaus.test',
    JWT_PUBLIC_JWKS: jwks, FIXTURE_ACCESS_JWKS: jwks, ACCESS_JWKS_URL: 'https://access.synthetic.invalid/certs',
    ACCESS_TEAM_DOMAIN: 'access.synthetic.invalid', ACCESS_AUDIENCES: 'synthetic-review', ACCESS_SUBJECT_HMAC_KEY: 'synthetic-review-key' });
});
after(async () => { await fixture?.dispose(); await client.end(); });
async function call(path, body, headers = {}, method = 'POST') {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, { method,
    headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7(), ...headers }, body: JSON.stringify(body) });
}
async function created() {
  const author = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic review author')", [author]);
  await client.query("INSERT INTO social.profiles(user_id,moderation_state,public_visibility) VALUES($1,'allowed',true)", [author]);
  const token = await signAccessToken({ userId: author, privateKeyPem, keyId });
  const response = await call('/api/posts', { body: 'Synthetic review-bound body', declaredCreationMode: 'human', geoScope: 'none' }, { authorization: 'Bearer ' + token });
  assert.equal(response.status, 201, await response.clone().text());
  const post = await response.json();
  const event = (await client.query('SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events WHERE id=$1', [post.eventId])).rows[0];
  return { post, author, event, token };
}
async function deliver(item) { const response = await call('/fixture/queue', item.event); assert.equal(response.status, 200); return response.json(); }
async function records(item) { return Number((await client.query('SELECT count(*) AS count FROM moderation.detector_runs WHERE content_id=$1', [item.post.id])).rows[0].count); }
async function reviewCase(item, source = item.event.eventId) {
  const id = uuidv7();
  await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id)
    VALUES($1,'post',$2,'open','evaluation-only-v1',$3)`, [id, item.post.id, source]); return id;
}
const decision = (caseId, outcome = 'queue') => call('/api/admin/moderation/cases/' + caseId + '/decision',
  { outcome, reasonCode: 'SYNTHETIC_REVIEW_HOLD' }, { 'cf-access-jwt-assertion': adminToken, origin: 'https://api.lythaus.test' });
async function blocked(pid) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const row = (await client.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0];
    if (row?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('expected PostgreSQL lock wait');
}

for (const timing of ['before', 'during']) test(`same-policy human admin queue ${timing} inference is an independent hold without detector evidence`, timing === 'during' ? requiresAccountLock : {}, async () => {
  const item = await created(), calls = fixture.modelCalls;
  const apply = async () => {
    const response = await decision(await reviewCase(item));
    assert.equal(response.status, 200, await response.clone().text());
    const row = (await client.query('SELECT policy_version,decided_by FROM moderation.decisions WHERE case_id IN (SELECT id FROM moderation.cases WHERE content_id=$1)', [item.post.id])).rows[0];
    assert.deepEqual(row, { policy_version: 'evaluation-only-v1', decided_by: adminId });
    assert.equal(await records(item), 0);
  };
  if (timing === 'before') await apply(); else fixture.duringModel = apply;
  try { assert.deepEqual(await deliver(item), { ack: 1, retry: 0 }); } finally { fixture.duringModel = undefined; }
  assert.equal(await records(item), 0, 'a genuine human hold must not acquire automated detector evidence');
  assert.equal(fixture.modelCalls, calls + (timing === 'during' ? 1 : 0));
});

test('existing same-source case without detector leaves declaration and evidence unchanged', async () => {
  const item = await created(); await reviewCase(item);
  const before = (await client.query('SELECT * FROM content.content_declarations WHERE post_id=$1', [item.post.id])).rows;
  assert.deepEqual(await deliver(item), { ack: 1, retry: 0 });
  assert.equal(await records(item), 0);
  assert.deepEqual((await client.query('SELECT * FROM content.content_declarations WHERE post_id=$1', [item.post.id])).rows, before);
});
test('case conflict after review preflight rolls back preceding evidence and declaration writes', requiresAccountLock, async () => {
  const item = await created();
  const before = (await client.query('SELECT * FROM content.content_declarations WHERE post_id=$1', [item.post.id])).rows;
  fixture.duringSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text.includes('INSERT INTO moderation.detector_runs')) {
      fixture.duringSql = undefined; await reviewCase(item);
    }
  };
  let reply;
  try { reply = await deliver(item); } finally { fixture.duringSql = undefined; }
  assert.equal(await records(item), 0, 'case conflict must roll back all earlier evidence writes');
  assert.deepEqual(reply, { ack: 0, retry: 1 });
  assert.deepEqual((await client.query('SELECT * FROM content.content_declarations WHERE post_id=$1', [item.post.id])).rows, before);
});

const fenced = item => call('/fixture/account-transaction', { authorId: item.author, postId: item.post.id,
  eventId: item.event.eventId, detectorId: uuidv7() });

test('canonical Jobs cannot directly lock identity; absent EXECUTE safely retries without inference or evidence', async () => {
  const item = await created(), calls = fixture.modelCalls, start = fixture.statements.length;
  const role = new pg.Client({ connectionString, ssl: false }); await role.connect();
  try {
    await role.query('SET SESSION AUTHORIZATION lythaus_jobs');
    await assert.rejects(role.query('SELECT id FROM identity.users WHERE id=$1 FOR SHARE', [item.author]), error => error.code === '42501');
  } finally { await role.end(); }
  if (!requiresAccountLock.skip) await client.query('REVOKE EXECUTE ON FUNCTION trust.lock_active_post_review_author(uuid,uuid,uuid) FROM lythaus_jobs');
  try { assert.deepEqual(await deliver(item), { ack: 0, retry: 1 }); }
  finally { if (!requiresAccountLock.skip) await client.query('GRANT EXECUTE ON FUNCTION trust.lock_active_post_review_author(uuid,uuid,uuid) TO lythaus_jobs'); }
  assert.equal(await records(item), 0); assert.equal(fixture.modelCalls, calls);
  assert.ok(!fixture.statements.slice(start).some(row => row.role === 'lythaus_privacy' || row.text.includes('INSERT INTO moderation.detector_runs')));
  const inbox = await client.query('SELECT state FROM system.consumer_inbox WHERE event_id=$1', [item.event.eventId]);
  assert.equal(inbox.rowCount, 0, 'unavailable work must remain recoverable rather than completed');
});

test('single-transaction author fence applies atomically with only proposed Jobs EXECUTE in a synthetic helper fixture', requiresAccountLock, async () => {
  const item = await created(), response = await fenced(item);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { state: 'applied' });
  assert.equal(await records(item), 1);
  const state = (await client.query('SELECT moderation_state,published_at FROM content.posts WHERE id=$1', [item.post.id])).rows[0];
  assert.deepEqual(state, { moderation_state: 'under_review', published_at: null });
});

for (const restriction of ['locked', 'deleted', 'suspended', 'deleted_at', 'missing']) test(`single-transaction account fence refuses ${restriction} authority without evidence`, requiresAccountLock, async () => {
  const item = await created();
  if (restriction === 'missing') item.author = uuidv7();
  else if (restriction === 'deleted_at') await client.query('UPDATE identity.users SET deleted_at=now() WHERE id=$1', [item.author]);
  else await client.query('UPDATE identity.users SET status=$2 WHERE id=$1', [item.author, restriction]);
  const response = await fenced(item);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { state: 'ineligible' });
  assert.equal(await records(item), 0);
});

test('existing privacy decision wins the account lock before single-transaction evidence', requiresAccountLock, async () => {
  const item = await created(), blocker = new pg.Client({ connectionString, ssl: false }), reached = Promise.withResolvers();
  await blocker.connect(); let delivery;
  try {
    await blocker.query('BEGIN'); await blocker.query('SET LOCAL ROLE lythaus_privacy');
    await blocker.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE', [item.author]);
    fixture.duringSql = input => { if (input.role === 'lythaus_jobs' && input.text.startsWith('SELECT trust.lock_active_post_review_author(')) reached.resolve(input.backendPid); };
    delivery = fenced(item); await blocked(await reached.promise);
    await blocker.query("UPDATE identity.users SET status='locked' WHERE id=$1", [item.author]); await blocker.query('COMMIT');
    const response = await delivery; assert.equal(response.status, 200); assert.deepEqual(await response.json(), { state: 'ineligible' });
    assert.equal(await records(item), 0);
  } finally { fixture.duringSql = undefined; await blocker.query('ROLLBACK'); await blocker.end(); if (delivery) await delivery; }
});

for (const phase of ['wait', 'apply']) test(`loss of the single account/write connection during ${phase} prevents stale deleted-account review commit`, requiresAccountLock, async () => {
  const item = await created(), reached = Promise.withResolvers();
  const blocker = new pg.Client({ connectionString, ssl: false }); await blocker.connect();
  let delivery, interrupted = false;
  try {
    if (phase === 'wait') {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM content.posts WHERE id=$1 FOR UPDATE', [item.post.id]);
    }
    fixture.duringSql = async input => {
      if (input.role !== 'lythaus_jobs') return;
      if (phase === 'wait' && input.text.includes('FROM content.posts WHERE id=$1 FOR UPDATE')) reached.resolve(input.backendPid);
      if (phase === 'apply' && input.text.includes('INSERT INTO moderation.detector_runs')) {
        await fixture.interruptTransaction('lythaus_jobs');
        interrupted = true;
        await client.query("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1", [item.author]);
      }
    };
    delivery = fenced(item);
    if (phase === 'wait') {
      await blocked(await reached.promise); await fixture.interruptTransaction('lythaus_jobs');
      interrupted = true;
      await client.query("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1", [item.author]);
      await blocker.query('COMMIT');
    }
    const response = await delivery;
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { state: 'interrupted' });
    assert.equal(interrupted, true, 'the intended connection-loss fault must execute');
    assert.equal(await records(item), 0, 'losing the account lock must roll back all review writes');
  } finally { fixture.duringSql = undefined; await blocker.query('ROLLBACK'); await blocker.end(); if (delivery) await delivery; }
});

test('idle single account/write transaction abort and COMMIT rollback cannot leave stale evidence or report success', requiresAccountLock, async () => {
  const item = await created();
  let aborted = false, commitCommand;
  fixture.afterSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text === 'COMMIT') commitCommand = input.command;
    if (input.role === 'lythaus_jobs' && input.text.includes('INSERT INTO moderation.detector_runs')) {
      await fixture.interruptTransaction('lythaus_jobs', true);
      aborted = true;
      await client.query("UPDATE identity.users SET status='locked' WHERE id=$1", [item.author]);
    }
  };
  let reply;
  try { reply = await fenced(item); } finally { fixture.afterSql = undefined; }
  assert.equal(await records(item), 0, 'a rolled-back transaction must not leave stale evidence');
  assert.equal(reply.status, 503); assert.deepEqual(await reply.json(), { state: 'interrupted' });
  assert.equal(aborted, true); assert.equal(commitCommand, 'ROLLBACK', 'real PostgreSQL must report the aborted COMMIT as ROLLBACK');
});

test('connection loss after the write but before COMMIT rolls back evidence and safely retries the same detector id', requiresAccountLock, async () => {
  const item = await created(), body = { authorId: item.author, postId: item.post.id, eventId: item.event.eventId, detectorId: uuidv7() };
  let interrupted = false;
  fixture.afterSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text.includes('INSERT INTO moderation.detector_runs')) {
      fixture.afterSql = undefined; await fixture.interruptTransaction('lythaus_jobs'); interrupted = true;
    }
  };
  let response;
  try { response = await call('/fixture/account-transaction', body); } finally { fixture.afterSql = undefined; }
  assert.equal(response.status, 503); assert.equal(await records(item), 0);
  assert.equal(interrupted, true);
  response = await call('/fixture/account-transaction', body);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { state: 'applied' });
  assert.equal(await records(item), 1);
});

test('real admin case-then-post handler racing Jobs case supersession completes without deadlock', requiresAccountLock, async () => {
  const item = await created(), oldCase = await reviewCase(item, uuidv7()), reached = Promise.withResolvers(), resume = Promise.withResolvers();
  let adminPid, job, admin;
  fixture.afterSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text.includes('FOR UPDATE OF post')) { reached.resolve(); await resume.promise; }
  };
  fixture.duringSql = input => { if (input.role === 'lythaus_admin' && input.text.includes('moderation.cases')) adminPid = input.backendPid; };
  try {
    job = deliver(item); await reached.promise; admin = decision(oldCase, 'block');
    while (!adminPid) await new Promise(resolve => setTimeout(resolve, 10));
    await blocked(adminPid); resume.resolve();
    const [jobReply, adminReply] = await Promise.all([job, admin]);
    assert.deepEqual(jobReply, { ack: 1, retry: 0 });
    assert.equal(adminReply.status, 409, await adminReply.clone().text());
    assert.ok(!fixture.sqlErrors.some(error => error.code === '40P01'), 'case/post lock order must not deadlock');
  } finally { resume.resolve(); fixture.afterSql = undefined; fixture.duringSql = undefined; if (job) await job; if (admin) await admin; }
});

async function person(role) {
  const id = uuidv7();
  await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic appeal actor')", [id]);
  await client.query(`INSERT INTO identity.email_credentials(user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
    VALUES($1,decode('00','hex'),decode($2,'hex'),'synthetic','synthetic','{}',now())`, [id, id.replaceAll('-', '')]);
  const token = await signAccessToken({ userId: id, privateKeyPem, keyId });
  if (!role) return { id, token };
  await client.query(`INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role,active)
    VALUES($1,decode($2,'base64'),$3,true)`, [id, hmacLookup(id, 'synthetic-review-key'), role]);
  const access = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId }).setSubject(id)
    .setAudience('synthetic-review').setIssuer('https://access.synthetic.invalid').setIssuedAt().setExpirationTime('1h').sign(signingKey);
  return { id, token, access };
}
const adminHeaders = token => ({ 'cf-access-jwt-assertion': token, origin: 'https://api.lythaus.test' });
async function revise(item) {
  const response = await call('/api/posts/' + item.post.id, { body: 'Synthetic revised appeal body', declaredCreationMode: 'human' },
    { authorization: 'Bearer ' + item.token }, 'PUT');
  assert.equal(response.status, 200, await response.clone().text());
  item.event = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events
    WHERE aggregate_id=$1 AND event_type='content.post.updated' ORDER BY created_at DESC LIMIT 1`, [item.post.id])).rows[0];
}
async function evaluatedRevision(item) {
  assert.deepEqual(await deliver(item), { ack: 1, retry: 0 });
  const priorCase = (await client.query('SELECT id FROM moderation.cases WHERE content_id=$1 AND source_event_id=$2', [item.post.id, item.event.eventId])).rows[0].id;
  const priorDecision = await decision(priorCase, 'block');
  assert.equal(priorDecision.status, 200, await priorDecision.clone().text());
  await revise(item);
}
async function communityQueuedAppeal(item) {
  const caseId = await reviewCase(item), queued = await decision(caseId);
  assert.equal(queued.status, 200, await queued.clone().text());
  return communityCaseAppeal(item, caseId);
}
async function communityCaseAppeal(item, caseId) {
  const triager = await person('moderator');
  await client.query(`INSERT INTO moderation.community_appeal_rule_sets(version,policy_version,configuration,ballot_changes_allowed,approved_by,approved_at,approval_reference)
    VALUES($1,$2,$3,true,$4,now(),'Synthetic disposable test only') ON CONFLICT DO NOTHING`,
    [PROPOSED_COMMUNITY_APPEAL_RULES.version, MONTHLY_REPUTATION_POLICY_VERSION, JSON.stringify(PROPOSED_COMMUNITY_APPEAL_RULES), triager.id]);
  await client.query(`INSERT INTO system.feature_flags(flag_key,enabled,policy_version) VALUES('moderation.community_appeals',true,$1)
    ON CONFLICT(flag_key) DO UPDATE SET enabled=true`, [MONTHLY_REPUTATION_POLICY_VERSION]);
  const submitted = await call('/fixture/community/api/appeals', { caseId, statement: 'Synthetic queue appeal.' }, { authorization: 'Bearer ' + item.token });
  assert.equal(submitted.status, 201, await submitted.clone().text());
  const { appealId } = await submitted.json();
  const triaged = await call(`/fixture/community/api/admin/appeals/${appealId}/triage`, { reviewClass: 'standard', safePreview: 'Synthetic redacted text',
    ruleContext: 'Synthetic rule application context.', reasonCode: 'safe_text_review' }, adminHeaders(triager.access));
  assert.equal(triaged.status, 200, await triaged.clone().text());
  for (let i = 0; i < PROPOSED_COMMUNITY_APPEAL_RULES.quorum; i++) {
    const voter = await person();
    const voted = await call(`/fixture/community/api/appeals/${appealId}/vote`, {
      choice: 'allow', reasonCode: 'rule_misapplied', expectedRevision: 0, contextAcknowledged: true,
    }, { authorization: 'Bearer ' + voter.token });
    assert.equal(voted.status, 201, await voted.clone().text());
  }
  await client.query(`WITH deadline AS (SELECT date_trunc('milliseconds',clock_timestamp()) - interval '1 millisecond' AS closes_at)
    UPDATE moderation.community_appeal_sessions SET closes_at=deadline.closes_at, opens_at=deadline.closes_at - interval '48 hours'
    FROM deadline WHERE appeal_id=$1`, [appealId]);
  return { appealId, caseId };
}

test('real community closure racing an in-flight review uses case-before-post order without a deadlock or automated evidence', requiresAccountLock, async () => {
  const item = await created(), prepared = Promise.withResolvers(), casesHeld = Promise.withResolvers(), resume = Promise.withResolvers(), closureWaiting = Promise.withResolvers();
  await evaluatedRevision(item);
  const start = fixture.sqlErrors.length;
  let job, closure, closureTransaction, probe, preparationStarted = false;
  fixture.afterSql = async input => {
    if (!probe && input.text.startsWith('SELECT trust.lock_active_post_review_author(')) probe = input.transactionId;
    if (!preparationStarted && input.transactionId === probe && input.text === 'COMMIT') {
      preparationStarted = true;
      try { prepared.resolve(await communityQueuedAppeal(item)); }
      catch (error) { prepared.reject(error); throw error; }
    }
    if (input.role === 'lythaus_jobs' && input.text.includes("WHERE content_type = 'post' AND content_id = $1 ORDER BY id FOR UPDATE")
      && input.transactionId !== closureTransaction) { casesHeld.resolve(); await resume.promise; }
  };
  fixture.duringSql = input => {
    if (input.text.includes('SELECT s.*, a.appellant_id')) closureTransaction = input.transactionId;
    if (input.transactionId === closureTransaction && (input.text.includes('INSERT INTO moderation.decisions')
      || input.text.includes('ORDER BY id FOR UPDATE'))) closureWaiting.resolve(input.backendPid);
  };
  try {
    job = deliver(item); await prepared.promise; await casesHeld.promise;
    closure = call('/fixture/community-reconcile', {});
    await blocked(await Promise.race([closureWaiting.promise, closure.then(async response => {
      throw new Error('Closure finished before reaching the case lock: ' + JSON.stringify(await response.clone().json())
        + ' ' + JSON.stringify(fixture.sqlErrors.slice(start)));
    })])); resume.resolve();
    const [jobReply, closureReply] = await Promise.all([job, closure]);
    assert.deepEqual(fixture.sqlErrors.slice(start).filter(error => error.code === '40P01'), [], 'eligible appeal/Jobs deadlock diagnostics');
    assert.deepEqual(jobReply, { ack: 1, retry: 0 });
    assert.equal(closureReply.status, 200); assert.deepEqual(await closureReply.json(), { processed: 1 });
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM moderation.detector_runs WHERE source_event_id=$1', [item.event.eventId])).rows[0].n, 0,
      'the human queue and appeal authority exclude evaluation evidence for the current revision');
    assert.equal((await client.query('SELECT moderation_state FROM content.posts WHERE id=$1', [item.post.id])).rows[0].moderation_state, 'allowed');
    assert.ok(!fixture.sqlErrors.slice(start).some(error => error.code === '40P01'), 'real eligible closure and Jobs must not deadlock');
  } finally {
    resume.resolve(); fixture.duringModel = undefined; fixture.afterSql = undefined; fixture.duringSql = undefined;
    await Promise.allSettled([job, closure]);
  }
});

test('community closure first retains all case locks through the post reversal; waiting Jobs rechecks authority and leaves no new evidence', requiresAccountLock, async () => {
  const item = await created(); await evaluatedRevision(item);
  const held = Promise.withResolvers(), resume = Promise.withResolvers(), waiting = Promise.withResolvers();
  const errors = fixture.sqlErrors.length;
  let job, closure, probe, closureTransaction, preparationStarted = false;
  fixture.duringSql = input => {
    if (input.text.includes('SELECT s.*, a.appellant_id')) closureTransaction = input.transactionId;
    if (input.transactionId !== closureTransaction && input.text.includes("WHERE content_type = 'post' AND content_id = $1 ORDER BY id FOR UPDATE")) waiting.resolve(input.backendPid);
  };
  fixture.afterSql = async input => {
    if (!probe && input.text.startsWith('SELECT trust.lock_active_post_review_author(')) probe = input.transactionId;
    if (!preparationStarted && input.transactionId === probe && input.text === 'COMMIT') {
      preparationStarted = true;
      await communityQueuedAppeal(item);
      closure = call('/fixture/community-reconcile', {});
      await Promise.race([held.promise, closure.then(async response => { throw new Error(await response.clone().text()); })]);
    }
    if (input.transactionId === closureTransaction && input.text.includes('FROM content.posts WHERE id = $1 FOR UPDATE')) {
      held.resolve(); await resume.promise;
    }
  };
  try {
    job = deliver(item);
    await blocked(await Promise.race([waiting.promise, job.then(() => { throw new Error('Jobs did not wait for community case authority'); })]));
    resume.resolve(); const [reply, response] = await Promise.all([job, closure]);
    assert.deepEqual(reply, { ack: 1, retry: 0 }); assert.deepEqual(await response.json(), { processed: 1 });
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM moderation.detector_runs WHERE source_event_id=$1', [item.event.eventId])).rows[0].n, 0);
    assert.equal((await client.query('SELECT moderation_state FROM content.posts WHERE id=$1', [item.post.id])).rows[0].moderation_state, 'allowed');
    assert.deepEqual(fixture.sqlErrors.slice(errors).filter(error => error.code === '40P01'), []);
  } finally { resume.resolve(); fixture.afterSql = undefined; fixture.duringSql = undefined; await Promise.allSettled([job, closure]); }
});

async function historicalAppeal(item) {
  const caseId = await reviewCase(item), blockedResponse = await decision(caseId, 'block');
  assert.equal(blockedResponse.status, 200, await blockedResponse.clone().text());
  const submitted = await call('/api/appeals', { caseId, statement: 'Synthetic historical rule appeal.' }, { authorization: 'Bearer ' + item.token });
  assert.equal(submitted.status, 201, await submitted.clone().text());
  const appeal = await submitted.json(); assert.equal(appeal.policyVersion, APPEAL_POLICY.version);
  for (let ordinal = 1; ordinal <= APPEAL_POLICY.reviewerCount; ordinal++) {
    const reviewer = await person();
    await client.query(`INSERT INTO moderation.reviewer_qualifications(user_id,state,policy_version,trained_at)
      VALUES($1,'trained',$2,now())`, [reviewer.id, APPEAL_POLICY.version]);
    await client.query(`INSERT INTO moderation.appeal_assignments(id,appeal_id,reviewer_id,assignment_ordinal,level_snapshot,
      qualification_snapshot,vote_weight_snapshot,random_rank_hash,conflict_checked,policy_version)
      VALUES($1,$2,$3,$4,1,'trained',1,$5,true,$6)`, [uuidv7(), appeal.appealId, reviewer.id, ordinal, 'a'.repeat(64), APPEAL_POLICY.version]);
    const vote = await call(`/api/appeals/${appeal.appealId}/vote`, { decision: 'overturn' }, { authorization: 'Bearer ' + reviewer.token });
    assert.equal(vote.status, 201, await vote.clone().text());
  }
  const editorial = await person('editorial');
  await client.query(`INSERT INTO moderation.reviewer_qualifications(user_id,state,policy_version,trained_at)
    VALUES($1,'trained',$2,now())`, [editorial.id, APPEAL_POLICY.version]);
  return { caseId, appealId: appeal.appealId, editorial };
}
const adjudicate = appeal => call(`/api/admin/appeals/${appeal.appealId}/adjudications`, {
  decision: 'overturn', reasonCode: 'SYNTHETIC_HISTORICAL_REVIEW',
}, adminHeaders(appeal.editorial.access));

test('canonical historical adjudication exposes its existing social-schema privilege blocker; only this owned fixture receives bounded grants', async () => {
  const item = await created(), appeal = await historicalAppeal(item), start = fixture.sqlErrors.length;
  assert.equal((await client.query("SELECT has_schema_privilege('lythaus_admin','social','USAGE') AS allowed")).rows[0].allowed, false);
  const response = await adjudicate(appeal); assert.equal(response.status, 500, await response.clone().text());
  assert.ok(fixture.sqlErrors.slice(start).some(error => error.code === '42501' && error.text.includes('LEFT JOIN social.profiles')));
  assert.equal((await client.query('SELECT count(*)::integer AS n FROM moderation.appeal_adjudications WHERE appeal_id=$1', [appeal.appealId])).rows[0].n, 0);
  await client.query('GRANT USAGE ON SCHEMA social TO lythaus_admin');
  await client.query('GRANT SELECT (user_id,moderation_source_event_id) ON social.profiles TO lythaus_admin');
});

test('historical current-version reversal holds the post while the human block excludes Jobs before any case lock', requiresAccountLock, async () => {
  const item = await created(), appeal = await historicalAppeal(item), postHeld = Promise.withResolvers(), resume = Promise.withResolvers();
  const start = fixture.statements.length, errors = fixture.sqlErrors.length, calls = fixture.modelCalls;
  let admin;
  fixture.afterSql = async input => {
    if (input.role === 'lythaus_admin' && input.text.includes('UPDATE content.posts')) { postHeld.resolve(); await resume.promise; }
  };
  try {
    admin = adjudicate(appeal);
    await Promise.race([postHeld.promise, admin.then(async response => { throw new Error(await response.clone().text()); })]);
    assert.deepEqual(await deliver(item), { ack: 1, retry: 0 });
    assert.equal(fixture.modelCalls, calls); assert.equal(await records(item), 0);
    const jobs = fixture.statements.slice(start).filter(row => row.role === 'lythaus_jobs');
    assert.ok(!jobs.some(row => row.text.includes('ORDER BY id FOR UPDATE') || row.text.includes('FOR UPDATE OF post')),
      'the committed human block excludes Jobs before its competing case/post locks');
    resume.resolve(); const response = await admin; assert.equal(response.status, 200, await response.clone().text());
    const stored = (await client.query('SELECT policy_version,state FROM moderation.appeals WHERE id=$1', [appeal.appealId])).rows[0];
    assert.deepEqual(stored, { policy_version: APPEAL_POLICY.version, state: 'resolved' });
    assert.ok(!fixture.sqlErrors.slice(errors).some(error => error.code === '40P01'));
  } finally { resume.resolve(); fixture.afterSql = undefined; await Promise.allSettled([admin]); }
});

test('historical stale-version adjudication waits on the case FK without taking the current post lock or reversing the revision', requiresAccountLock, async () => {
  const item = await created(), appeal = await historicalAppeal(item);
  await revise(item);
  const held = Promise.withResolvers(), resume = Promise.withResolvers(), waiting = Promise.withResolvers();
  const start = fixture.statements.length, errors = fixture.sqlErrors.length;
  let job, admin;
  fixture.afterSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text.includes('ORDER BY id FOR UPDATE')) { held.resolve(); await resume.promise; }
  };
  fixture.duringSql = input => {
    if (input.role === 'lythaus_admin' && input.text.includes('INSERT INTO moderation.enforcement_events')) waiting.resolve(input.backendPid);
  };
  try {
    job = deliver(item); await Promise.race([held.promise, job.then(() => { throw new Error('Jobs did not reach the current revision case lock'); })]);
    admin = adjudicate(appeal);
    await blocked(await Promise.race([waiting.promise, admin.then(async response => { throw new Error(await response.clone().text()); })]));
    resume.resolve(); const [reply, response] = await Promise.all([job, admin]);
    assert.deepEqual(reply, { ack: 1, retry: 0 }); assert.equal(response.status, 200, await response.clone().text());
    assert.ok(!fixture.statements.slice(start).some(row => row.role === 'lythaus_admin' && row.text.includes('UPDATE content.posts')),
      'historical source-version authority cannot take or reverse the current revision');
    assert.equal((await client.query("SELECT count(*)::integer AS n FROM moderation.appeal_outcome_effects WHERE appeal_id=$1 AND effect_type='content_reversal'", [appeal.appealId])).rows[0].n, 0);
    assert.deepEqual((await client.query('SELECT moderation_state,published_at FROM content.posts WHERE id=$1', [item.post.id])).rows[0],
      { moderation_state: 'under_review', published_at: null });
    assert.equal(await records(item), 1); assert.ok(!fixture.sqlErrors.slice(errors).some(error => error.code === '40P01'));
  } finally { resume.resolve(); fixture.afterSql = undefined; fixture.duringSql = undefined; await Promise.allSettled([job, admin]); }
});

async function revisedCommentAppeal() {
  const parent = await created();
  assert.deepEqual(await deliver(parent), { ack: 1, retry: 0 });
  const parentCase = (await client.query('SELECT id FROM moderation.cases WHERE content_id=$1 AND source_event_id=$2', [parent.post.id, parent.event.eventId])).rows[0].id;
  const allowed = await decision(parentCase, 'allow'); assert.equal(allowed.status, 200, await allowed.clone().text());
  const submitted = await call(`/api/posts/${parent.post.id}/comments`, { body: 'Synthetic original queued comment', declaredCreationMode: 'human' },
    { authorization: 'Bearer ' + parent.token });
  assert.equal(submitted.status, 201, await submitted.clone().text());
  const comment = await submitted.json();
  const original = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events
    WHERE aggregate_id=$1 AND event_type='content.comment.created'`, [comment.commentId])).rows[0];
  assert.deepEqual(await deliver({ event: original }), { ack: 1, retry: 0 });
  const caseRecord = (await client.query(`SELECT c.id,c.state,d.outcome,d.policy_version,d.decided_by FROM moderation.cases c
    JOIN moderation.decisions d ON d.case_id=c.id WHERE c.content_type='comment' AND c.content_id=$1 AND c.source_event_id=$2`,
    [comment.commentId, original.eventId])).rows[0];
  assert.ok(caseRecord); assert.equal(caseRecord.state, 'open'); assert.equal(caseRecord.outcome, 'queue');
  assert.equal(caseRecord.policy_version, 'evaluation-only-v1'); assert.equal(caseRecord.decided_by, null);
  const audit = (await client.query(`SELECT id,correlation_id FROM system.audit_events
    WHERE action='moderation.comment.review_requested' AND target_id=$1 AND correlation_id=$2`, [comment.commentId, original.eventId])).rows[0];
  assert.deepEqual(audit, { id: original.eventId, correlation_id: original.eventId });
  assert.equal((await client.query('SELECT state FROM system.consumer_inbox WHERE event_id=$1', [original.eventId])).rows[0].state, 'completed');
  const caseId = caseRecord.id;
  const appeal = await communityCaseAppeal(parent, caseId);
  const revised = await call(`/api/comments/${comment.commentId}`, { body: 'Synthetic revised queued comment', declaredCreationMode: 'human' },
    { authorization: 'Bearer ' + parent.token }, 'PUT');
  assert.equal(revised.status, 200, await revised.clone().text());
  const event = (await client.query(`SELECT id AS "eventId",event_type AS "eventType",payload FROM system.outbox_events
    WHERE aggregate_id=$1 AND event_type='content.comment.updated'`, [comment.commentId])).rows[0];
  return { commentId: comment.commentId, original, event, ...appeal };
}

for (const first of ['jobs', 'closure']) test(`real comment review and stale community appeal: ${first} locks first without deadlock, retry or stale publication`, requiresAccountLock, async () => {
  const item = await revisedCommentAppeal(), held = Promise.withResolvers(), resume = Promise.withResolvers(), waiting = Promise.withResolvers();
  const start = fixture.sqlErrors.length, statements = fixture.statements.length;
  let job, closure, closureTransaction;
  fixture.duringSql = input => {
    if (input.text.includes('SELECT s.*, a.appellant_id')) closureTransaction = input.transactionId;
    const closureComment = input.transactionId === closureTransaction && input.text.includes('FROM content.comments WHERE id = $1 FOR UPDATE');
    const jobsComment = input.role === 'lythaus_jobs' && input.text.includes('FROM content.comments') && input.text.includes('WHERE id = $1 AND deleted_at IS NULL') && input.text.includes('FOR UPDATE');
    if (first === 'jobs' ? closureComment : jobsComment) waiting.resolve(input.backendPid);
  };
  fixture.afterSql = async input => {
    const closureComment = input.transactionId === closureTransaction && input.text.includes('FROM content.comments WHERE id = $1 FOR UPDATE');
    const jobsComment = input.role === 'lythaus_jobs' && input.text.includes('FROM content.comments') && input.text.includes('WHERE id = $1 AND deleted_at IS NULL') && input.text.includes('FOR UPDATE');
    if (first === 'jobs' ? jobsComment : closureComment) { held.resolve(); await resume.promise; }
  };
  try {
    if (first === 'jobs') job = deliver(item); else closure = call('/fixture/community-reconcile', {});
    await Promise.race([held.promise, (job ?? closure).then(() => { throw new Error('First handler did not reach the comment lock'); })]);
    if (first === 'jobs') closure = call('/fixture/community-reconcile', {}); else job = deliver(item);
    await blocked(await Promise.race([waiting.promise, (first === 'jobs' ? closure : job).then(() => { throw new Error('Second handler did not wait on the comment lock'); })]));
    resume.resolve(); const [reply, response] = await Promise.all([job, closure]);
    assert.deepEqual(fixture.sqlErrors.slice(start).filter(error => error.code === '40P01'), [], 'comment/case inversion diagnostics');
    assert.deepEqual(reply, { ack: 1, retry: 0 });
    assert.ok(!fixture.sqlErrors.slice(start).some(error => error.code === '42P08'));
    assert.ok(!fixture.statements.slice(statements).some(row => row.transactionId === closureTransaction && row.text.includes('ORDER BY id FOR UPDATE')),
      'the post lane must not introduce a case-before-comment lock');
    assert.deepEqual(await response.json(), { processed: 1 });
    const outcome = (await client.query('SELECT restoration FROM moderation.community_appeal_outcomes WHERE appeal_id=$1', [item.appealId])).rows[0];
    assert.equal(outcome.restoration, 'content_changed_or_deleted');
    const stored = (await client.query('SELECT body,moderation_state,moderation_source_event_id FROM content.comments WHERE id=$1', [item.commentId])).rows[0];
    assert.deepEqual(stored, { body: 'Synthetic revised queued comment', moderation_state: 'under_review', moderation_source_event_id: item.event.eventId });
    const oldCase = (await client.query('SELECT state FROM moderation.cases WHERE id=$1', [item.caseId])).rows[0];
    assert.equal(oldCase.state, 'superseded');
    const newCase = (await client.query(`SELECT c.id,c.state,d.outcome FROM moderation.cases c JOIN moderation.decisions d ON d.case_id=c.id
      WHERE c.content_type='comment' AND c.content_id=$1 AND c.source_event_id=$2`, [item.commentId, item.event.eventId])).rows[0];
    assert.deepEqual(newCase, { id: newCase.id, state: 'open', outcome: 'queue' });
    assert.ok(newCase.id);
    assert.equal((await client.query("SELECT count(*)::integer AS n FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='content.comment.published'", [item.commentId])).rows[0].n, 0);
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM moderation.detector_runs WHERE content_id=$1 AND source_event_id=$2', [item.commentId, item.event.eventId])).rows[0].n, 1);
  } finally { resume.resolve(); fixture.afterSql = undefined; fixture.duringSql = undefined; await Promise.allSettled([job, closure]); }
  assert.deepEqual(await deliver(item), { ack: 1, retry: 0 });
  const retriedClosure = await call('/fixture/community-reconcile', {}); assert.deepEqual(await retriedClosure.json(), { processed: 0 });
  assert.equal((await client.query('SELECT count(*)::integer AS n FROM moderation.detector_runs WHERE content_id=$1 AND source_event_id=$2', [item.commentId, item.event.eventId])).rows[0].n, 1);
});
