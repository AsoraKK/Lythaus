import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, mock, test } from 'node:test';
import pg from 'pg';
import * as database from '@lythaus/db';
import { hmacLookup, uuidv7 } from '@lythaus/security';
import { nativePostgresProfileFixture } from '../../lythaus-public-api/tests/native-postgres-worker-fixture.mjs';
import { privacyPostgresTarget } from '../../lythaus-public-api/tests/privacy-postgres-target.mjs';

const connectionString = privacyPostgresTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '').toString();
const actorId = uuidv7();
const authorId = uuidv7();
const caseId = uuidv7();
const postId = uuidv7();
const sourceEventId = uuidv7();
const decisionId = uuidv7();
const enforcementId = uuidv7();
const provenanceId = uuidv7();
const policyVersion = 'moderation-rereview-synthetic-v1';
const accessSubject = 'synthetic-moderation-reviewer';
const accessKey = randomBytes(32).toString('base64');
const accessHmac = Buffer.from(hmacLookup(accessSubject, accessKey), 'base64');
const actorRateHash = createHash('sha256').update(`admin:${actorId}`).digest('hex');
const state = { failAudit: false };
let control, publicApi;

async function connect(role) {
  const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query("SET statement_timeout='5s'");
  if (role) await client.query(`SET ROLE ${role}`);
  return client;
}

async function adminQuery(_binding, text, values = []) {
  const client = await connect('lythaus_admin');
  try { return await client.query(text, values); }
  finally { await client.end(); }
}

async function adminTransaction(_binding, work) {
  const client = await connect('lythaus_admin');
  try {
    await client.query('BEGIN');
    const result = await work({ query: (text, values = []) => {
      if (state.failAudit && text.includes('INSERT INTO system.audit_events')) {
        throw new Error('synthetic_audit_failure');
      }
      return client.query(text, values);
    } });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}

mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    ...database,
    query: adminQuery,
    transaction: adminTransaction,
  },
});

mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), {
  cache: true,
  namedExports: {
    requireActiveAdminMembership: row => {
      if (!row || typeof row.user_id !== 'string' || typeof row.role !== 'string') {
        throw new Error('admin_role_required');
      }
      return { userId: row.user_id, role: row.role };
    },
    verifiedAccessSubject: async request => {
      const assertion = request.headers.get('cf-access-jwt-assertion');
      if (!assertion) throw new Error('access_required');
      if (assertion === 'synthetic-outsider') return 'synthetic-outsider';
      if (assertion !== 'synthetic-valid') throw new Error('access_assertion_invalid');
      return accessSubject;
    },
  },
});

const { default: adminApi } = await import('../src/index.ts');
const adminEnv = {
  ACCESS_SUBJECT_HMAC_KEY: accessKey,
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.test',
  EXPECTED_HOSTNAMES: 'admin.lythaus.test',
  WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-moderation-rereview' },
  DB_ADMIN_FRESH: {},
  DB_PRIVACY_FRESH: {},
};

function adminRequest(method, path, body, assertion = 'synthetic-valid') {
  const headers = {
    origin: 'https://admin.lythaus.test',
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(assertion ? { 'cf-access-jwt-assertion': assertion } : {}),
  };
  return new Request(`https://admin.lythaus.test${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function adminCall(method, path, body, assertion) {
  const response = await adminApi.fetch(adminRequest(method, path, body, assertion), adminEnv);
  return { response, body: await response.json() };
}

async function sql(text, values = []) {
  return control.query(text, values);
}

async function revisionForCase() {
  const { response, body } = await adminCall('GET', '/api/admin/moderation/cases');
  assert.equal(response.status, 200, JSON.stringify(body));
  const item = body.items.find(entry => entry.id === caseId);
  assert.ok(item);
  return item.revision;
}

async function historySnapshot() {
  const result = await sql(`SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(decision) ORDER BY decision.id)
                FROM moderation.decisions decision WHERE decision.case_id = $1), '[]'::jsonb) AS decisions,
    COALESCE((SELECT jsonb_agg(to_jsonb(enforcement) ORDER BY enforcement.id)
                FROM moderation.enforcement_events enforcement WHERE enforcement.case_id = $1), '[]'::jsonb) AS enforcement,
    COALESCE((SELECT jsonb_agg(to_jsonb(provenance) ORDER BY provenance.id)
                FROM trust.provenance_events provenance WHERE provenance.content_id = $2), '[]'::jsonb) AS provenance`,
  [caseId, postId]);
  return result.rows[0];
}

async function readPostState() {
  const result = await sql(`SELECT post.visibility, post.moderation_state, post.published_at,
                                  post.moderation_source_event_id::text AS source_event_id,
                                  declaration.declared_creation_mode, declaration.public_label,
                                  declaration.review_required
                             FROM content.posts post
                             JOIN content.content_declarations declaration ON declaration.post_id = post.id
                            WHERE post.id = $1`, [postId]);
  return result.rows[0];
}

async function publicFeed() {
  return publicApi.dispatchFetch('https://api.lythaus.test/api/feed/discover', {
    headers: { origin: 'https://app.lythaus.test', 'cf-connecting-ip': '2001:db8::85' },
  });
}

async function reopenRequest(revision) {
  return adminCall('POST', `/api/admin/moderation/cases/${caseId}/rereview`, {
    expectedCaseState: 'resolved',
    expectedRevision: revision,
    reasonCode: 'MODERATION.REREVIEW_REQUESTED',
  });
}

before(async () => {
  control = await connect(undefined);
  const version = Number((await sql('SHOW server_version_num')).rows[0].server_version_num);
  assert.ok(version >= 170000 && version < 180000, `Expected PostgreSQL 17, found ${version}`);
  await sql(`INSERT INTO identity.users (id, display_name, status)
             VALUES ($1, 'Synthetic moderation reviewer', 'active'),
                    ($2, 'Synthetic moderation author', 'active')`, [actorId, authorId]);
  await sql(`INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role, active)
             VALUES ($1, $2, 'moderator', true)`, [actorId, accessHmac]);
  await sql(`INSERT INTO social.profiles (user_id, public_visibility, moderation_state)
             VALUES ($1, true, 'allowed')`, [authorId]);
  await sql(`INSERT INTO content.posts
               (id, author_id, body, declared_creation_mode, visibility, moderation_state,
                published_at, moderation_source_event_id)
             VALUES ($1, $2, 'Synthetic public moderation re-review post', 'human', 'public', 'allowed', now(), $3)`,
  [postId, authorId, sourceEventId]);
  await sql(`INSERT INTO content.content_declarations
               (post_id, declared_creation_mode, public_label, review_required)
             VALUES ($1, 'human', 'Human-authored', false)`, [postId]);
  await sql(`INSERT INTO moderation.cases
               (id, content_type, content_id, state, policy_version, source_event_id, resolved_at)
             VALUES ($1, 'post', $2, 'resolved', $3, $4, '2026-10-17T00:00:00.123456Z')`,
  [caseId, postId, policyVersion, sourceEventId]);
  await sql(`INSERT INTO moderation.decisions
               (id, case_id, outcome, public_label, policy_version, decided_by)
             VALUES ($1, $2, 'allow', 'Human-authored', $3, $4)`,
  [decisionId, caseId, policyVersion, actorId]);
  await sql(`INSERT INTO moderation.enforcement_events
               (id, case_id, subject_id, action, reason_code, policy_version, actor_id)
             VALUES ($1, $2, $3, 'allow', 'ORIGINAL_ALLOW', $4, $5)`,
  [enforcementId, caseId, authorId, policyVersion, actorId]);
  await sql(`INSERT INTO trust.provenance_events
               (id, content_id, author_id, declared_creation_mode, detected_content_class,
                detector_provider, detector_model_version, policy_version, appeal_state,
                final_decision, source_event_id)
             VALUES ($1, $2, $3, 'human', 'human-authored', 'synthetic', 'fixture-v1', $4,
                     'none', 'allow', $5)`,
  [provenanceId, postId, authorId, policyVersion, sourceEventId]);
  publicApi = await nativePostgresProfileFixture(connectionString, {
    ENVIRONMENT: 'local',
    EXPECTED_HOSTNAMES: 'api.lythaus.test',
    CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    WORKER_VERSION: { id: uuidv7(), tag: 'synthetic-rereview-feed' },
  });
});

after(async () => {
  try { await publicApi?.dispose(); }
  finally {
    if (control) {
      try {
        await sql('BEGIN');
        await sql('DELETE FROM system.audit_events WHERE target_id = $1', [caseId]);
        await sql('DELETE FROM trust.user_activity_events WHERE user_id = $1 OR actor_user_id = $2', [authorId, actorId]);
        await sql('DELETE FROM system.outbox_events WHERE aggregate_id = $1 AND actor_id = $2', [postId, actorId]);
        await sql('DELETE FROM system.rate_limit_windows WHERE scope = \'admin-api\' AND subject_hash = $1', [actorRateHash]);
        await sql('DELETE FROM moderation.enforcement_events WHERE case_id = $1', [caseId]);
        await sql('DELETE FROM moderation.decisions WHERE case_id = $1', [caseId]);
        await sql('DELETE FROM trust.provenance_events WHERE id = $1', [provenanceId]);
        await sql('DELETE FROM moderation.cases WHERE id = $1', [caseId]);
        await sql('DELETE FROM content.posts WHERE id = $1', [postId]);
        await sql('DELETE FROM identity.admin_memberships WHERE user_id = $1', [actorId]);
        await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [[actorId, authorId]]);
        await sql('COMMIT');
      } catch (error) {
        await sql('ROLLBACK');
        throw error;
      } finally { await control.end(); }
    }
  }
});

test('resolved case re-review is guarded, atomic, auditable, and reversible through normal allow', async () => {
  const unauthenticated = await adminCall('POST', `/api/admin/moderation/cases/${caseId}/rereview`, {
    expectedCaseState: 'resolved', expectedRevision: {}, reasonCode: 'REREVIEW',
  }, '');
  assert.equal(unauthenticated.response.status, 401);
  const outsider = await adminCall('POST', `/api/admin/moderation/cases/${caseId}/rereview`, {
    expectedCaseState: 'resolved', expectedRevision: {}, reasonCode: 'REREVIEW',
  }, 'synthetic-outsider');
  assert.equal(outsider.response.status, 403);
  assert.equal((await sql('SELECT state FROM moderation.cases WHERE id = $1', [caseId])).rows[0].state, 'resolved');

  const initialFeedResponse = await publicFeed();
  assert.equal(initialFeedResponse.status, 200, await initialFeedResponse.clone().text());
  const initialFeed = await initialFeedResponse.json();
  assert.ok(initialFeed.items.some(item => item.id === postId));
  const initialRevision = await revisionForCase();
  assert.deepEqual(initialRevision, {
    resolvedAt: '2026-10-17T00:00:00.123456Z',
    sourceEventId,
    decisionId,
  });
  const beforeHistory = await historySnapshot();
  const beforePost = await readPostState();

  state.failAudit = true;
  const failedAudit = await reopenRequest(initialRevision);
  state.failAudit = false;
  assert.equal(failedAudit.response.status, 500);
  assert.equal(failedAudit.body.error, 'admin_request_failed');
  assert.equal((await sql('SELECT state FROM moderation.cases WHERE id = $1', [caseId])).rows[0].state, 'resolved');
  assert.deepEqual(await readPostState(), beforePost);
  assert.deepEqual(await historySnapshot(), beforeHistory);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM system.audit_events WHERE action = \'moderation.case.reopened\' AND target_id = $1', [caseId])).rows[0].count, 0);

  const concurrent = await Promise.all([reopenRequest(initialRevision), reopenRequest(initialRevision)]);
  assert.deepEqual(concurrent.map(result => result.response.status).sort(), [200, 409]);
  const reopened = concurrent.find(result => result.response.status === 200);
  const conflict = concurrent.find(result => result.response.status === 409);
  assert.equal(reopened.body.state, 'open');
  assert.equal(reopened.body.moderationState, 'under_review');
  assert.equal(conflict.body.error, 'moderation_case_state_conflict');

  const afterRereviewHistory = await historySnapshot();
  assert.deepEqual(afterRereviewHistory, beforeHistory);
  const afterRereviewPost = await readPostState();
  assert.equal(afterRereviewPost.visibility, beforePost.visibility);
  assert.equal(afterRereviewPost.moderation_state, 'under_review');
  assert.equal(afterRereviewPost.published_at, null);
  assert.equal(afterRereviewPost.source_event_id, beforePost.source_event_id);
  assert.equal(afterRereviewPost.declared_creation_mode, beforePost.declared_creation_mode);
  assert.equal(afterRereviewPost.public_label, beforePost.public_label);
  assert.equal(afterRereviewPost.review_required, beforePost.review_required);
  const rereviewAudits = await sql(`SELECT actor_id::text AS actor_id, action, target_id::text AS target_id,
                                          reason_code, correlation_id, metadata
                                     FROM system.audit_events
                                    WHERE action = 'moderation.case.reopened' AND target_id = $1`, [caseId]);
  assert.equal(rereviewAudits.rowCount, 1);
  assert.equal(rereviewAudits.rows[0].actor_id, actorId);
  assert.equal(rereviewAudits.rows[0].reason_code, 'MODERATION.REREVIEW_REQUESTED');
  assert.equal(rereviewAudits.rows[0].metadata.previousRevision.decisionId, decisionId);
  assert.equal(rereviewAudits.rows[0].metadata.previousDecisionActorId, actorId);

  const withdrawnFeedResponse = await publicFeed();
  assert.equal(withdrawnFeedResponse.status, 200, await withdrawnFeedResponse.clone().text());
  assert.equal((await withdrawnFeedResponse.json()).items.some(item => item.id === postId), false);

  const repeat = await reopenRequest(initialRevision);
  assert.equal(repeat.response.status, 409);
  assert.equal(repeat.body.error, 'moderation_case_state_conflict');
  const wrongExpectedState = await adminCall('POST', `/api/admin/moderation/cases/${caseId}/rereview`, {
    expectedCaseState: 'open', expectedRevision: initialRevision, reasonCode: 'REREVIEW',
  });
  assert.equal(wrongExpectedState.response.status, 409);
  assert.equal(wrongExpectedState.body.error, 'moderation_case_state_conflict');

  const decision = await adminCall('POST', `/api/admin/moderation/cases/${caseId}/decision`, {
    outcome: 'allow', reasonCode: 'REREVIEW.CLEARED',
  });
  assert.equal(decision.response.status, 200, JSON.stringify(decision.body));
  assert.equal(decision.body.outcome, 'allow');
  const allowedPost = await readPostState();
  assert.equal(allowedPost.visibility, 'public');
  assert.equal(allowedPost.moderation_state, 'allowed');
  assert.ok(allowedPost.published_at);
  assert.equal(allowedPost.declared_creation_mode, 'human');
  assert.equal(allowedPost.public_label, 'Human-authored');
  assert.equal(allowedPost.review_required, false);
  const restoredFeedResponse = await publicFeed();
  assert.equal(restoredFeedResponse.status, 200, await restoredFeedResponse.clone().text());
  assert.ok((await restoredFeedResponse.json()).items.some(item => item.id === postId));

  const staleRevision = await reopenRequest(initialRevision);
  assert.equal(staleRevision.response.status, 409);
  assert.equal(staleRevision.body.error, 'moderation_case_revision_conflict');
  const finalHistory = await historySnapshot();
  assert.deepEqual(finalHistory.decisions[0], beforeHistory.decisions[0]);
  assert.deepEqual(finalHistory.enforcement[0], beforeHistory.enforcement[0]);
  assert.deepEqual(finalHistory.provenance, beforeHistory.provenance);
  assert.equal(finalHistory.decisions.length, 2);
  assert.equal(finalHistory.enforcement.length, 2);
});
