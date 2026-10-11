import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import { signAccessToken, uuidv7, hmacLookup } from '@lythaus/security';
import { postModerationFixture } from './post-moderation-fixture.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_post_publishing_[a-f0-9]+$/);
const client = new pg.Client({ connectionString, ssl: false });
let fixture, privateKeyPem, keyId, adminToken, adminId;
before(async () => {
  await client.connect();
  const pair = await generateKeyPair('ES256', { extractable: true });
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
async function call(path, body, headers = {}) {
  return fixture.dispatchFetch('https://api.lythaus.test' + path, { method: 'POST',
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
  return { post, author, event };
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

for (const timing of ['before', 'during']) test(`same-policy human admin queue ${timing} inference is an independent hold without detector evidence`, async () => {
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
test('case conflict after review preflight rolls back preceding evidence and declaration writes', async () => {
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

for (const phase of ['wait', 'apply']) test(`loss of account-lock connection during ${phase} prevents stale deleted-account review commit`, async () => {
  const item = await created(), reached = Promise.withResolvers();
  const blocker = new pg.Client({ connectionString, ssl: false }); await blocker.connect();
  let delivery;
  try {
    if (phase === 'wait') {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM content.posts WHERE id=$1 FOR UPDATE', [item.post.id]);
    }
    fixture.duringSql = async input => {
      if (input.role !== 'lythaus_jobs') return;
      if (phase === 'wait' && input.text.includes('FOR UPDATE OF post')) reached.resolve(input.backendPid);
      if (phase === 'apply' && input.text.includes('INSERT INTO moderation.detector_runs')) {
        await fixture.disconnectPrivacyTransactions();
        await client.query("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1", [item.author]);
      }
    };
    delivery = deliver(item);
    if (phase === 'wait') {
      await blocked(await reached.promise); await fixture.disconnectPrivacyTransactions();
      await client.query("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1", [item.author]);
      await blocker.query('COMMIT');
    }
    assert.deepEqual(await delivery, { ack: 0, retry: 1 });
    assert.equal(await records(item), 0, 'losing the account lock must roll back all review writes');
  } finally { fixture.duringSql = undefined; await blocker.query('ROLLBACK'); await blocker.end(); if (delivery) await delivery; }
});

test('idle account-lock transaction abort and outer COMMIT rollback cannot leave stale inner Jobs writes', async () => {
  const item = await created();
  fixture.duringSql = async input => {
    if (input.role === 'lythaus_jobs' && input.text.includes('INSERT INTO moderation.detector_runs')) {
      fixture.duringSql = undefined;
      await fixture.abortPrivacyTransactions();
      await client.query("UPDATE identity.users SET status='locked' WHERE id=$1", [item.author]);
    }
  };
  let reply;
  try { reply = await deliver(item); } finally { fixture.duringSql = undefined; }
  assert.equal(await records(item), 0, 'outer privacy rollback must not leave a stale committed detector');
  assert.deepEqual(reply, { ack: 0, retry: 1 });
});

test('real admin case-then-post handler racing Jobs case supersession completes without deadlock', async () => {
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
