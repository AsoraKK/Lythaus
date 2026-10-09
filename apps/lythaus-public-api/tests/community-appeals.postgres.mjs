import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { before, after, test, mock } from 'node:test';
import pg from 'pg';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createHash } from 'node:crypto';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import * as database from '@lythaus/db';
import { hmacLookup, signAccessToken, uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { PROPOSED_WEEKLY_EARNING_RULES } from '../../../packages/contracts/src/monthly-earning-policy.ts';
import { loadMonthlyEarningConfiguration, recordMonthlyContentEarning, refreshMonthlyEarningWeek } from '../../../packages/db/src/monthly-earning.ts';
import { PROPOSED_COMMUNITY_APPEAL_RULES } from '../../../packages/contracts/src/monthly-peer-appeal-policy.ts';
import { communityConfiguration, communityEligibility, communityReviewQueue, communityTriageQueue, readCommunityAppeal, readCommunityTriageEvidence } from '../../../packages/db/src/community-appeal-access.ts';
import { castCommunityBallot, submitCommunityAppeal, triageCommunityAppeal, withdrawCommunityAppeal } from '../../../packages/db/src/community-appeal-mutations.ts';
import { closeCommunityAppeal, identicalCommunityAppealOverride } from '../../../packages/db/src/community-appeal-closure.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES } from '../../../packages/contracts/src/monthly-maintenance-policy.ts';
import { assembleMonthlyReputation } from '../../../packages/db/src/monthly-assembly.ts';
import { loadMonthlyPeerConfiguration, recordMonthlyPeerParticipation, requireMonthlyPeerIngestionDrained } from '../../../packages/db/src/monthly-peer-participation.ts';
import { proposedClosingSundayWeek } from '../../../packages/contracts/src/monthly-reputation-decisions.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !(target.pathname === '/lythaus_monthly_test' || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Community appeal tests require explicitly local disposable PostgreSQL');
}
const statements = [];
const specification = JSON.parse(readFileSync(new URL('../../../api/openapi/dist/openapi.json', import.meta.url)));
const validator = new Ajv({ strict: false, allErrors: true }); addFormats(validator); validator.addSchema(specification, 'api');
function matches(schema, data) {
  const valid = validator.validate({ $ref: `api#/components/schemas/${schema}` }, data);
  assert.equal(valid, true, JSON.stringify(validator.errors));
}
async function tx(work, role = 'lythaus_runtime') {
  const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '10s'");
    if (role) { assert.ok(['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy'].includes(role)); await client.query(`SET LOCAL ROLE ${role}`); }
    const result = await work({ query: (text, values) => { statements.push(text); return client.query(text, values); } });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
const sql = (text, values) => tx(client => client.query(text, values), null);
const binding = { role: 'lythaus_runtime' }, jobsBinding = { role: 'lythaus_jobs' }, adminBinding = { role: 'lythaus_admin' }, privacyBinding = { role: 'lythaus_privacy' };
mock.module('@lythaus/db', { namedExports: { ...database,
  transaction: (actual, work) => { assert.ok([binding, jobsBinding, adminBinding, privacyBinding].includes(actual)); return tx(work, actual.role); },
  query: (actual, text, values) => { assert.ok([binding, jobsBinding, adminBinding].includes(actual)); return tx(client => client.query(text, values), actual.role); },
} });
const { default: worker } = await import('../src/index.ts');
const { default: adminWorker } = await import('../../lythaus-admin-api/src/index.ts');
const { reconcileCommunityAppeals } = await import('../../lythaus-jobs/src/community-appeals.ts');
const { processMonthlyPeerParticipation, reconcileMonthlyPeerParticipation } = await import('../../lythaus-jobs/src/monthly-peer-participation.ts');
const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === 'cloudflare:workers' ? { url: 'data:text/javascript,export class WorkflowEntrypoint {}', shortCircuit: true } : next(specifier, context);
} });
const { default: jobs } = await import('../../lythaus-jobs/src/index.ts'); hooks.deregister();
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const keyId = 'synthetic-local-community-appeal', privateKeyPem = await exportPKCS8(privateKey);
const rules = PROPOSED_COMMUNITY_APPEAL_RULES.version, flag = 'moderation.community_appeals';
const env = { EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
  DB_APP_FRESH: binding, COMMUNITY_APPEAL_RULES_VERSION: rules,
  JWT_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] }) };
const jobsEnv = { DB_JOBS_FRESH: jobsBinding, DB_PRIVACY_FRESH: privacyBinding, COMMUNITY_APPEAL_RULES_VERSION: rules };
const adminEnv = { EXPECTED_HOSTNAMES: 'admin-api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://admin-api.lythaus.test',
  DB_ADMIN_FRESH: adminBinding, COMMUNITY_APPEAL_RULES_VERSION: rules, ACCESS_AUDIENCES: 'synthetic-community-admin',
  ACCESS_SUBJECT_HMAC_KEY: 'synthetic-community-access-subject-key', ACCESS_TEAM_DOMAIN: 'synthetic-access.lythaus.test',
  ACCESS_JWKS_URL: 'https://synthetic-access.lythaus.test/cdn-cgi/access/certs' };
mock.method(globalThis, 'fetch', async url => {
  assert.equal(String(url), adminEnv.ACCESS_JWKS_URL);
  return Response.json({ keys: [{ ...await exportJWK(publicKey), kid: keyId, alg: 'ES256', use: 'sig' }] });
});
const users = [], cases = [], posts = [], grantRestores = [], priorSelectGrants = [];
let owner, decider, triager, voters, unverified;
async function person(verified = true) {
  const id = uuidv7(); users.push(id);
  await sql("INSERT INTO identity.users (id, display_name) VALUES ($1, 'Synthetic appeal fixture')", [id]);
  await sql(`INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
    VALUES ($1, decode('00', 'hex'), decode($2, 'hex'), 'synthetic', 'synthetic', '{}'::jsonb, CASE WHEN $3 THEN now() ELSE NULL END)`, [id, id.replaceAll('-', ''), verified]);
  return { id, token: await signAccessToken({ userId: id, privateKeyPem, keyId }) };
}
async function call(actor, method, path, body, key = uuidv7(), configuration = env) {
  return worker.fetch(new Request('https://api.lythaus.test' + path, { method,
    headers: { ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'Idempotency-Key': key },
    ...(body ? { body: JSON.stringify(body) } : {}) }), configuration, { waitUntil() {} });
}
async function blocked(patch = {}) {
  const id = uuidv7(), source = uuidv7(), caseId = uuidv7(), decision = uuidv7(); posts.push(id); cases.push(caseId);
  const body = patch.body ?? `Frozen sensitive owner detail ${id}`, mode = patch.mode ?? 'human';
  await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, moderation_source_event_id)
    VALUES ($1, $2, $3, $4, $5, 'blocked', $6)`, [id, owner.id, body, mode, mode === 'ai_generated' ? 'private' : 'public', source]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, 'content.post.created', 'post', $2, $3, '{}'::jsonb)`, [source, id, owner.id]);
  await sql(`INSERT INTO content.content_declarations (post_id, declared_creation_mode, public_label, review_required)
    VALUES ($1, $2, 'Under review', true)`, [id, mode]);
  await sql(`INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
    VALUES ($1, 'post', $2, 'resolved', 'synthetic-block-v1', $3)`, [caseId, id, source]);
  await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version, decided_by)
    VALUES ($1, $2, 'block', 'Under review', 'synthetic-block-v1', $3)`, [decision, caseId, decider.id]);
  return { id, source, caseId, decision, body, mode };
}
const submit = fixture => tx(client => submitCommunityAppeal(client, { userId: owner.id, caseId: fixture.caseId, statement: 'Please review the rule application.', rulesVersion: rules }));
const triage = (appeal, patch = {}) => tx(client => triageCommunityAppeal(client, { appealId: appeal.appealId, actorId: triager.id,
  reviewClass: 'standard', safePreview: 'Redacted review text', ruleContext: 'Apply the authorship rule to this version; disagreement is not a breach.', reasonCode: 'safe_text_review', ...patch }), 'lythaus_admin');
async function opened(patch) { const fixture = await blocked(patch), appeal = await submit(fixture); await triage(appeal); return { ...fixture, ...appeal }; }
const voteInput = (appealId, userId, choice = 'allow', patch = {}) => ({ appealId, userId, choice,
  reasonCode: { allow: 'rule_misapplied', retain: 'rule_applies', recuse: 'conflict', cannot_assess: 'insufficient_context' }[choice],
  contextAcknowledged: true, expectedRevision: 0, idempotencyKey: uuidv7(), ...patch });
const cast = input => tx(client => castCommunityBallot(client, input));
const close = id => tx(client => closeCommunityAppeal(client, id), 'lythaus_jobs');
async function due(id, extension = 0) {
  await sql(`WITH deadline AS (SELECT date_trunc('milliseconds', clock_timestamp()) - interval '1 millisecond' AS closes_at)
    UPDATE moderation.community_appeal_sessions SET closes_at = deadline.closes_at,
      opens_at = deadline.closes_at - ($2::integer * interval '1 hour'), extensions = $3
    FROM deadline WHERE appeal_id = $1`, [id, 48 + extension * 24, extension]);
}
async function majority(appealId, allow = 3, retain = 2) {
  for (let i = 0; i < allow + retain; i++) await cast(voteInput(appealId, voters[i].id, i < allow ? 'allow' : 'retain'));
}
before(async () => {
  assert.ok((await sql("SELECT current_setting('server_version_num')::integer AS n")).rows[0].n >= 170000);
  for (const [role, table] of [['lythaus_runtime', 'moderation.decisions'], ['lythaus_runtime', 'moderation.detector_runs'],
    ['lythaus_runtime', 'system.feature_flags'], ['lythaus_admin', 'system.feature_flags'], ['lythaus_jobs', 'system.feature_flags']]) {
    const tableAllowed = (await sql('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, table, 'SELECT'])).rows[0].allowed;
    const columns = (await sql(`SELECT attname, has_column_privilege($1, $2, attname, 'SELECT') AS allowed
      FROM pg_attribute WHERE attrelid = $2::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`, [role, table])).rows;
    priorSelectGrants.push({ role, table, tableAllowed, columns });
    if (!tableAllowed) {
      grantRestores.push(`REVOKE SELECT ON ${table} FROM ${role}`);
      const allowed = columns.filter(column => column.allowed).map(column => `"${column.attname.replaceAll('"', '""')}"`);
      if (allowed.length) grantRestores.push(`GRANT SELECT (${allowed.join(', ')}) ON ${table} TO ${role}`);
    }
  }
  if (!(await sql("SELECT has_column_privilege('lythaus_runtime', 'moderation.appeals', 'state', 'UPDATE') AS allowed")).rows[0].allowed) grantRestores.push('REVOKE UPDATE (state) ON moderation.appeals FROM lythaus_runtime');
  await sql(readFileSync(new URL('../../../database/planetscale/proposals/community_appeals.sql', import.meta.url), 'utf8'));
  owner = await person(); decider = await person(); triager = await person(); unverified = await person(false); voters = [];
  for (let i = 0; i < 12; i++) voters.push(await person());
  await sql("INSERT INTO identity.admin_memberships (user_id, access_subject_hmac, role) VALUES ($1, decode($2, 'base64'), 'moderator')", [triager.id, hmacLookup(triager.id, adminEnv.ACCESS_SUBJECT_HMAC_KEY)]);
});
after(async () => {
  await sql('DROP TRIGGER IF EXISTS monthly_context_subject_erasure ON identity.users');
  await sql('DROP TRIGGER IF EXISTS monthly_context_flag_preserved ON system.feature_flags');
  await sql('DROP TABLE IF EXISTS trust.monthly_context_dependency_receipts, trust.monthly_context_reviews, trust.monthly_context_rule_sets');
  await sql('DROP FUNCTION IF EXISTS trust.require_monthly_context_review(),trust.lock_monthly_context_configuration(),trust.lock_monthly_context_actor(uuid,uuid),trust.preserve_monthly_context_flag(),trust.erase_monthly_context_subject()');
  await sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_context_review'");
  await sql('DROP TRIGGER IF EXISTS fail_community_fixture ON system.outbox_events');
  await sql('DROP FUNCTION IF EXISTS system.fail_community_fixture()');
  await sql('DROP TRIGGER IF EXISTS fail_peer_fixture ON system.outbox_events');
  await sql('DROP FUNCTION IF EXISTS system.fail_peer_fixture()');
  await sql('DROP TRIGGER IF EXISTS monthly_peer_flag_preserved ON system.feature_flags');
  await sql('DROP TRIGGER IF EXISTS monthly_collection_flag_preserved ON system.feature_flags');
  await sql('DROP TRIGGER IF EXISTS monthly_reputation_subject_erasure ON identity.users');
  await sql('DROP TRIGGER IF EXISTS monthly_email_control_revocation ON identity.email_credentials');
  await sql(`DROP TABLE IF EXISTS trust.monthly_peer_participation_receipts, trust.monthly_peer_participation_rule_sets,
    trust.monthly_reputation_assemblies, trust.monthly_maintenance_revocations, trust.monthly_maintenance_observations,
    trust.monthly_maintenance_rule_sets, trust.monthly_reputation_assessments, trust.monthly_reputation_sources`);
  await sql('DROP TABLE IF EXISTS trust.monthly_earning_week_revisions, trust.monthly_earning_receipts, trust.monthly_earning_evidence_revisions, trust.monthly_earning_contributions, trust.monthly_earning_rule_sets');
  await sql(`DROP FUNCTION IF EXISTS trust.preserve_monthly_peer_flag(), trust.lock_monthly_peer_configuration(), trust.preserve_monthly_collection_flag(),
    trust.require_monthly_assessment_subject(), trust.require_monthly_reputation_subject(), trust.erase_monthly_reputation_subject(),
    trust.revoke_monthly_email_control(), trust.lock_monthly_reputation_subject(uuid),
    trust.reject_monthly_maintenance_update(), trust.reject_monthly_reputation_update()`);
  await sql('DROP FUNCTION IF EXISTS trust.reject_monthly_earning_update()');
  await sql('DROP FUNCTION IF EXISTS trust.redact_monthly_earning_calculation(jsonb)');
  await sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_reputation_shadow'");
  await sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_peer_participation'");
  await sql(`DROP TABLE IF EXISTS moderation.community_appeal_events, moderation.community_appeal_overrides,
    moderation.community_appeal_valid_participation, moderation.community_appeal_outcomes, moderation.community_voting_restrictions,
    moderation.community_appeal_ballot_revisions, moderation.community_appeal_ballots, moderation.community_appeal_evidence,
    moderation.community_appeal_sessions, moderation.community_appeal_rule_sets`);
  await sql('DROP FUNCTION IF EXISTS moderation.reject_community_appeal_update()');
  await sql('DROP FUNCTION IF EXISTS moderation.freeze_community_appeal_packet()');
  await sql('DELETE FROM moderation.appeals WHERE appellant_id = $1', [owner?.id]);
  await sql('DELETE FROM moderation.decisions WHERE case_id = ANY($1::uuid[])', [cases]);
  await sql('DELETE FROM moderation.cases WHERE id = ANY($1::uuid[])', [cases]);
  await sql('DELETE FROM content.posts WHERE id = ANY($1::uuid[])', [posts]);
  await sql('DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events WHERE aggregate_id = ANY($1::uuid[]) OR actor_id = ANY($2::uuid[]))', [posts, users]);
  await sql('DELETE FROM system.outbox_events WHERE aggregate_id = ANY($1::uuid[]) OR event_type LIKE $2 OR actor_id = ANY($3::uuid[])', [posts, 'moderation.community_appeal.%', users]);
  await sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [flag]);
  await sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_peer_participation'");
  await sql('DELETE FROM system.idempotency_keys WHERE actor_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM feed.notifications WHERE recipient_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM identity.email_credentials WHERE user_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [users]);
  for (const statement of grantRestores) await sql(statement);
  for (const { role, table, tableAllowed, columns } of priorSelectGrants) {
    assert.equal((await sql('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, table, 'SELECT'])).rows[0].allowed, tableAllowed);
    const restored = (await sql(`SELECT attname, has_column_privilege($1, $2, attname, 'SELECT') AS allowed
      FROM pg_attribute WHERE attrelid = $2::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`, [role, table])).rows;
    assert.deepEqual(restored, columns, `${role} ${table} column grants must survive cleanup`);
  }
});

test('APP-01: pending defaults, missing approval and disabled flag cannot activate appeals', async () => {
  statements.length = 0;
  assert.deepEqual(await reconcileCommunityAppeals({ DB_JOBS_FRESH: jobsBinding }), { processed: 0 });
  assert.equal(statements.length, 0);
  const fixture = await blocked();
  await assert.rejects(submit(fixture), /community_appeals_unavailable/);
  await sql(`INSERT INTO moderation.community_appeal_rule_sets (version, policy_version, configuration, ballot_changes_allowed)
    VALUES ($1, $2, $3::jsonb, true)`, [rules + '-unapproved', MONTHLY_REPUTATION_POLICY_VERSION, JSON.stringify({ ...PROPOSED_COMMUNITY_APPEAL_RULES, version: rules + '-unapproved' })]);
  await sql('INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ($1, true, $2)', [flag, MONTHLY_REPUTATION_POLICY_VERSION]);
  await assert.rejects(tx(client => communityConfiguration(client, rules + '-unapproved')), /community_appeals_unavailable/);
  await sql(`INSERT INTO moderation.community_appeal_rule_sets (version, policy_version, configuration, ballot_changes_allowed, approved_by, approved_at, approval_reference)
    VALUES ($1, $2, $3::jsonb, true, $4, now(), 'Synthetic local test approval only')`, [rules, MONTHLY_REPUTATION_POLICY_VERSION, JSON.stringify(PROPOSED_COMMUNITY_APPEAL_RULES), triager.id]);
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [flag]);
  assert.deepEqual(await reconcileCommunityAppeals(jobsEnv), { processed: 0 });
  await assert.rejects(submit(fixture), /unavailable/);
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  assert.deepEqual(await tx(client => communityReviewQueue(client, voters[0].id, rules)), { state: 'no_case_available', items: [] });
});

test('APP-04/07/12: JWT ownership, frozen evidence, safe triage and private reads use real API routes', async () => {
  const fixture = await blocked();
  assert.equal((await call(null, 'POST', '/api/appeals', { caseId: fixture.caseId, statement: 'Review' })).status, 401);
  assert.equal((await call(voters[0], 'POST', '/api/appeals', { caseId: fixture.caseId, statement: 'Review' })).status, 400);
  const response = await call(owner, 'POST', '/api/appeals', { caseId: fixture.caseId, statement: 'Review the rule.' });
  assert.equal(response.status, 201, await response.clone().text());
  const appeal = await response.json();
  matches('AppealCreateResponse', appeal);
  assert.equal(appeal.state, 'submitted');
  assert.equal((await submit(fixture)).appealId, appeal.appealId);
  assert.equal((await call(voters[0], 'GET', `/api/appeals/${appeal.appealId}`)).status, 404);
  assert.ok((await tx(client => communityTriageQueue(client, triager.id, rules), 'lythaus_admin')).items.some(item => item.appealId === appeal.appealId));
  const staffEvidence = await tx(client => readCommunityTriageEvidence(client, triager.id, appeal.appealId), 'lythaus_admin');
  assert.equal(staffEvidence.evidence.frozen_content.body, fixture.body);
  await assert.rejects(triage(appeal, { actorId: decider.id }), /triage_not_allowed/);
  await assert.rejects(triage(appeal, { safePreview: '' }), /safe_evidence_required/);
  await triage(appeal);
  await assert.rejects(sql('UPDATE moderation.community_appeal_sessions SET safe_preview = $2 WHERE appeal_id = $1', [appeal.appealId, 'Changed after voting opens']), /packet_is_frozen/);
  await assert.rejects(sql('UPDATE moderation.community_appeal_sessions SET source_event_id = $2 WHERE appeal_id = $1', [appeal.appealId, uuidv7()]), /packet_is_frozen/);
  await assert.rejects(triage(appeal), /state_conflict/);
  for (const actor of [owner, voters[0]]) {
    const detail = await call(actor, 'GET', `/api/appeals/${appeal.appealId}`);
    assert.equal(detail.status, 200); assert.match(detail.headers.get('cache-control'), /private.*no-store/);
    const text = await detail.text(); assert.ok(!text.includes(fixture.body)); assert.ok(!text.includes(owner.id));
    matches('AppealDetailResponse', JSON.parse(text));
    assert.ok(!text.includes('validBallots')); assert.ok(!text.includes('decided_by'));
    assert.ok(text.includes('Redacted review text'));
  }
  assert.equal((await call(unverified, 'GET', `/api/appeals/${appeal.appealId}`)).status, 404);
  assert.equal((await call(null, 'GET', '/api/appeals/review/queue')).status, 401);
  assert.equal((await call(unverified, 'GET', '/api/appeals/review/queue')).status, 403);
  const queue = await call(voters[0], 'GET', '/api/appeals/review/queue'); assert.equal(queue.status, 200);
  const queueData = await queue.json(); matches('CommunityAppealQueue', queueData);
  assert.ok(queueData.items.some(item => item.appealId === appeal.appealId));
  await assert.rejects(tx(client => client.query('SELECT * FROM moderation.community_appeal_evidence')), /permission denied/);
});

test('APP-05/06/08: equal ballots, own-only reads, concurrent CAS, idempotency and hidden live counts', async () => {
  const appeal = await opened(); const first = voteInput(appeal.appealId, voters[0].id);
  for (const actor of [owner, decider, triager, unverified]) await assert.rejects(cast({ ...first, userId: actor.id }), /vote_not_allowed/);
  const { appealId, userId, idempotencyKey, ...body } = first;
  const response = await call(voters[0], 'POST', `/api/appeals/${appealId}/vote`, body, idempotencyKey);
  assert.equal(response.status, 201, await response.clone().text());
  matches('GovernanceAppealVoteResponse', await response.json());
  const ballotId = (await cast(first)).ballotId;
  await assert.rejects(sql(`INSERT INTO moderation.community_appeal_ballot_revisions
    (id, ballot_id, revision, weight, choice, reason_code, context_acknowledged, idempotency_key, cast_at)
    VALUES ($1, $2, 99, 2, 'allow', 'rule_misapplied', true, $3, now())`, [uuidv7(), ballotId, uuidv7()]), /check constraint/);
  await assert.rejects(sql("UPDATE moderation.community_appeal_ballot_revisions SET choice = 'retain' WHERE ballot_id = $1", [ballotId]), /history_is_immutable/);
  assert.equal((await cast(first)).created, false);
  await assert.rejects(cast({ ...first, choice: 'retain', reasonCode: 'rule_applies' }), /idempotency_key_conflict/);
  const changes = await Promise.allSettled([cast(voteInput(appealId, userId, 'retain', { expectedRevision: 1 })), cast(voteInput(appealId, userId, 'allow', { expectedRevision: 1 }))]);
  assert.equal(changes.filter(item => item.status === 'fulfilled').length, 1);
  assert.match(changes.find(item => item.status === 'rejected').reason.message, /revision_conflict/);
  for (const voter of voters.slice(1)) await cast(voteInput(appealId, voter.id));
  assert.equal((await sql('SELECT count(*)::int AS n FROM moderation.community_appeal_ballots WHERE appeal_id = $1', [appealId])).rows[0].n, 12);
  assert.equal((await tx(client => readCommunityAppeal(client, userId, appealId))).ownBallot.revision, 2);
  assert.equal((await tx(client => readCommunityAppeal(client, owner.id, appealId))).ownBallot, null);
  const detail = await call(voters[1], 'GET', `/api/appeals/${appealId}`);
  assert.ok(!(await detail.text()).includes(userId));
  await assert.rejects(cast(voteInput(appealId, voters[1].id, 'allow', { contextAcknowledged: false })), /vote_invalid/);
  assert.equal((await close(appealId)).created, false);
});

test('APP-10/13/14: closure is atomic, concurrent retries resolve once, valid minority records equal participation', async () => {
  const appeal = await opened(); await majority(appeal.appealId); await due(appeal.appealId);
  await assert.rejects(cast(voteInput(appeal.appealId, voters[8].id)), /closed/);
  const result = await Promise.all([close(appeal.appealId), close(appeal.appealId)]);
  assert.equal(result.filter(item => item.created).length, 1);
  assert.equal(result[0].result.status, 'resolved_allow'); assert.equal(result[0].restoration, 'restored');
  assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [appeal.id])).rows[0].moderation_state, 'allowed');
  const participation = await sql(`SELECT p.*, b.voter_user_id FROM moderation.community_appeal_valid_participation p
    JOIN moderation.community_appeal_ballots b ON b.id = p.ballot_id WHERE b.appeal_id = $1`, [appeal.appealId]);
  assert.equal(participation.rowCount, 5); assert.ok(participation.rows.some(row => row.voter_user_id === voters[4].id));
  assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'moderation.community_appeal.resolved'", [appeal.appealId])).rowCount, 1);
  assert.equal((await sql("SELECT 1 FROM feed.notifications WHERE entity_id = $1 AND notification_type = 'appeals.community_resolved'", [appeal.appealId])).rowCount, 6);
  assert.equal((await tx(client => readCommunityAppeal(client, owner.id, appeal.appealId))).outcome.result.validBallots, 5);
  assert.equal(await tx(client => identicalCommunityAppealOverride(client, { contentType: 'post', contentId: appeal.id, sourceEventId: appeal.source, body: appeal.body, declaredCreationMode: appeal.mode }), 'lythaus_jobs'), true);
  assert.equal(await tx(client => identicalCommunityAppealOverride(client, { contentType: 'post', contentId: appeal.id, sourceEventId: uuidv7(), body: appeal.body, declaredCreationMode: appeal.mode }), 'lythaus_jobs'), false);
  let acked = 0;
  await jobs.queue({ queue: 'synthetic-community-replay', messages: [{ id: appeal.source,
    body: { eventId: appeal.source, eventType: 'content.post.created', payload: { postId: appeal.id, sourceEventId: appeal.source,
      declaredCreationMode: appeal.mode, bodyHash: createHash('sha256').update(appeal.body).digest('hex') } },
    ack() { acked++; }, retry() { throw new Error('unexpected_queue_retry'); } }] }, jobsEnv);
  assert.equal(acked, 1);
  assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [appeal.id])).rows[0].moderation_state, 'allowed');
});

test('APP-09/11: tie extends once with notice; final unresolved is not guilt', async () => {
  const appeal = await opened(); await majority(appeal.appealId, 3, 3); await due(appeal.appealId);
  assert.equal((await close(appeal.appealId)).state, 'extended');
  assert.equal((await close(appeal.appealId)).created, false);
  await due(appeal.appealId, 1);
  const result = await close(appeal.appealId); assert.equal(result.result.status, 'unresolved'); assert.equal(result.result.reason, 'tie');
  assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'moderation.community_appeal.extended'", [appeal.appealId])).rowCount, 1);
  assert.equal((await sql("SELECT 1 FROM feed.notifications WHERE entity_id = $1 AND notification_type = 'appeals.community_extended'", [appeal.appealId])).rowCount, 7);
  assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [appeal.id])).rows[0].moderation_state, 'blocked');
});

test('APP-12: restricted evidence never enters queue or ordinary member reads and cannot be voted on', async () => {
  const appeal = await submit(await blocked());
  await assert.rejects(triage(appeal, { reviewClass: 'restricted' }), /restricted_evidence_forbidden/);
  await triage(appeal, { reviewClass: 'restricted', safePreview: undefined, ruleContext: undefined, reasonCode: 'sensitive_material' });
  await assert.rejects(tx(client => readCommunityTriageEvidence(client, triager.id, appeal.appealId), 'lythaus_admin'), /restricted_evidence_forbidden/);
  await assert.rejects(tx(client => readCommunityAppeal(client, voters[0].id, appeal.appealId)), /not_found/);
  assert.equal((await tx(client => readCommunityAppeal(client, owner.id, appeal.appealId))).evidence, null);
  assert.equal((await close(appeal.appealId)).state, 'restricted_review');
  await assert.rejects(cast(voteInput(appeal.appealId, voters[0].id)), /closed/);
  assert.ok(!(await tx(client => communityReviewQueue(client, voters[0].id, rules))).items.some(item => item.appealId === appeal.appealId));
});

test('APP-13: changed, deleted, independently held and generated content are not republished by an allow majority', async () => {
  for (const type of ['changed', 'deleted', 'independent', 'generated']) {
    const appeal = await opened(type === 'generated' ? { mode: 'ai_generated' } : undefined); await majority(appeal.appealId);
    if (type === 'changed') await sql('UPDATE content.posts SET body = $2, moderation_source_event_id = $3 WHERE id = $1', [appeal.id, 'New content version', uuidv7()]);
    if (type === 'deleted') await sql('UPDATE content.posts SET deleted_at = now() WHERE id = $1', [appeal.id]);
    if (type === 'independent') {
      await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, policy_version, decided_by) VALUES ($1, $2, 'block', 'independent-safety', $3)`, [uuidv7(), appeal.caseId, decider.id]);
    }
    await due(appeal.appealId); const result = await close(appeal.appealId);
    assert.equal(result.result.status, 'resolved_allow');
    assert.equal(result.restoration, type === 'independent' ? 'independent_hold' : type === 'generated' ? 'publication_rule_hold' : 'content_changed_or_deleted');
    assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [appeal.id])).rows[0].moderation_state, 'blocked');
  }
});

test('APP-04/14: established restrictions are rechecked at closure; recusal replaces a prior choice without penalty', async () => {
  const appeal = await opened(); await majority(appeal.appealId, 4, 2);
  await cast(voteInput(appeal.appealId, voters[0].id, 'recuse', { expectedRevision: 1 }));
  await sql(`INSERT INTO moderation.community_voting_restrictions (id, subject_user_id, appeal_id, reason_code, evidence_reference, imposed_by, starts_at, expires_at)
    VALUES ($1, $2, $3, 'established_controlled_duplicate', 'Synthetic established-control evidence', $4, now(), now() + interval '1 day')`, [uuidv7(), voters[1].id, appeal.appealId, triager.id]);
  await assert.rejects(cast(voteInput(appeal.appealId, voters[1].id, 'retain', { expectedRevision: 1 })), /not_allowed/);
  assert.equal((await tx(client => communityEligibility(client, voters[1].id))).activeVotingRestriction, false);
  await due(appeal.appealId, 1); const result = await close(appeal.appealId);
  assert.equal(result.result.validBallots, 4); assert.equal(result.result.reason, 'no_quorum');
  assert.equal((await sql(`SELECT count(*)::int AS n FROM moderation.community_appeal_valid_participation p JOIN moderation.community_appeal_ballots b ON b.id = p.ballot_id WHERE b.appeal_id = $1`, [appeal.appealId])).rows[0].n, 4);
});

test('REL-02: outbox failure rolls back closure, restoration, participation and override together', async () => {
  const appeal = await opened(); await majority(appeal.appealId); await due(appeal.appealId);
  await sql(`CREATE FUNCTION system.fail_community_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type = 'moderation.community_appeal.resolved' THEN RAISE EXCEPTION 'synthetic_outbox_failure'; END IF; RETURN NEW; END $$`);
  await sql('CREATE TRIGGER fail_community_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_community_fixture()');
  await assert.rejects(close(appeal.appealId), /synthetic_outbox_failure/);
  assert.equal((await sql('SELECT state FROM moderation.community_appeal_sessions WHERE appeal_id = $1', [appeal.appealId])).rows[0].state, 'open');
  assert.equal((await sql('SELECT 1 FROM moderation.community_appeal_outcomes WHERE appeal_id = $1', [appeal.appealId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM moderation.community_appeal_overrides WHERE appeal_id = $1', [appeal.appealId])).rowCount, 0);
  assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [appeal.id])).rows[0].moderation_state, 'blocked');
  await sql('DROP TRIGGER fail_community_fixture ON system.outbox_events');
  await sql('DROP FUNCTION system.fail_community_fixture()');
  assert.equal((await close(appeal.appealId)).restoration, 'restored');
});

test('REL-02/APP-10: actual scheduled Worker closes a retain majority without an editorial confirmation', async () => {
  const appeal = await opened(); await majority(appeal.appealId, 2, 3); await due(appeal.appealId);
  await jobs.scheduled({}, jobsEnv);
  assert.equal((await close(appeal.appealId)).result.status, 'resolved_retain');
  assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [appeal.id])).rows[0].moderation_state, 'blocked');
});

test('APP-07: withdrawal is owner-only and removes case evidence from the community surface', async () => {
  const appeal = await opened();
  await assert.rejects(tx(client => withdrawCommunityAppeal(client, appeal.appealId, voters[0].id)), /not_found/);
  const response = await call(owner, 'POST', `/api/appeals/${appeal.appealId}/withdraw`, {});
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await tx(client => withdrawCommunityAppeal(client, appeal.appealId, owner.id))).state, 'withdrawn');
  await assert.rejects(tx(client => readCommunityAppeal(client, voters[0].id, appeal.appealId)), /not_found/);
  await assert.rejects(cast(voteInput(appeal.appealId, voters[0].id)), /closed/);
});

test('APP-16/17/18: comment restoration uses the same frozen scope and changed classifier evidence needs a new assessment', async () => {
  const parent = await blocked(), comment = uuidv7(), source = uuidv7(), caseId = uuidv7(); cases.push(caseId);
  await sql(`INSERT INTO content.comments (id, post_id, author_id, body, declared_creation_mode, moderation_state, moderation_source_event_id)
    VALUES ($1, $2, $3, 'Frozen comment', 'human', 'blocked', $4)`, [comment, parent.id, owner.id, source]);
  await sql(`INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
    VALUES ($1, 'comment', $2, 'resolved', 'synthetic-comment', $3)`, [caseId, comment, source]);
  await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, policy_version, decided_by)
    VALUES ($1, $2, 'block', 'synthetic-comment', $3)`, [uuidv7(), caseId, decider.id]);
  const appeal = await submit({ caseId }); await triage(appeal); await majority(appeal.appealId); await due(appeal.appealId);
  assert.equal((await close(appeal.appealId)).restoration, 'restored');
  assert.equal((await sql('SELECT moderation_state FROM content.comments WHERE id = $1', [comment])).rows[0].moderation_state, 'allowed');
  assert.equal((await sql('SELECT moderation_state FROM content.posts WHERE id = $1', [parent.id])).rows[0].moderation_state, 'blocked');
  const published = (await sql("SELECT id, payload FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'content.comment.published'", [comment])).rows[0];
  let acknowledged = 0;
  await jobs.queue({ queue: 'synthetic-community-publication', messages: [{ id: published.id,
    body: { eventId: published.id, eventType: 'content.comment.published', payload: published.payload },
    ack() { acknowledged++; }, retry() { throw new Error('unexpected_publication_retry'); } }] }, jobsEnv);
  assert.equal(acknowledged, 1);
  assert.equal((await sql('SELECT 1 FROM trust.reputation_events WHERE source_event_id = $1', [published.id])).rowCount, 0);
  const input = { contentType: 'comment', contentId: comment, sourceEventId: source, body: 'Frozen comment', declaredCreationMode: 'human' };
  assert.equal(await tx(client => identicalCommunityAppealOverride(client, input), 'lythaus_jobs'), true);
  const detector = uuidv7();
  await sql(`INSERT INTO moderation.detector_runs (id, content_type, content_id, provider, model_version, signal, source_event_id)
    VALUES ($1, 'comment', $2, 'synthetic-new-evidence', 'test-v2', '{"newEvidence":true}', $3)`, [detector, comment, source]);
  assert.equal(await tx(client => identicalCommunityAppealOverride(client, input), 'lythaus_jobs'), false);
  await sql('DELETE FROM moderation.detector_runs WHERE id = $1', [detector]);
});

test('APP-16: a committed scoped overturn corrects the earning evidence; an unproven null-actor allow cannot earn', async () => {
  await sql(readFileSync(new URL('../../../database/planetscale/proposals/monthly_reputation_earning.sql', import.meta.url), 'utf8'));
  await sql(`INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ('trust.monthly_reputation_shadow', true, $1)`, [MONTHLY_REPUTATION_POLICY_VERSION]);
  await sql(`INSERT INTO trust.monthly_earning_rule_sets (version, policy_version, catalogue_hash, mode, collect_from, configuration)
    VALUES ($1, $2, $3, 'shadow', '2020-01-01T00:00:00.000Z', $4::jsonb)`, [PROPOSED_WEEKLY_EARNING_RULES.version, MONTHLY_REPUTATION_POLICY_VERSION,
    MONTHLY_REPUTATION_CATALOGUE_HASH, JSON.stringify(PROPOSED_WEEKLY_EARNING_RULES)]);
  const appeal = await opened();
  const earn = eventId => tx(client => recordMonthlyContentEarning(client, { eventId, rulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, evaluatedAt: new Date().toISOString() }), 'lythaus_jobs');
  assert.equal((await earn(appeal.source)).calculation.points, 0);
  await majority(appeal.appealId); await due(appeal.appealId); await close(appeal.appealId);
  const event = (await sql("SELECT id FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'content.post.published'", [appeal.id])).rows[0].id;
  const result = await earn(event); assert.equal(result.calculation.points, 250);
  assert.equal(result.calculation.evidence[0].reasonCode, 'community_appeal_publication_accepted');
  const forgedEvent = uuidv7();
  await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, policy_version) VALUES ($1, $2, 'allow', $3)`, [uuidv7(), appeal.caseId, MONTHLY_REPUTATION_POLICY_VERSION]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
    VALUES ($1, 'content.post.published', 'post', $2, '{}'::jsonb)`, [forgedEvent, appeal.id]);
  assert.equal((await earn(forgedEvent)).calculation.points, 0);
});

test('APP-19: an open historical case retains its labelled policy and cannot silently enter the new electorate', async () => {
  const fixture = await blocked(), legacyId = uuidv7();
  await sql(`INSERT INTO moderation.appeals (id, case_id, appellant_id, policy_version, statement, expires_at)
    VALUES ($1, $2, $3, 'appeals-v1.0.0', 'Historical appeal', now() + interval '1 day')`, [legacyId, fixture.caseId, owner.id]);
  await assert.rejects(submit(fixture), /legacy_case_pending/);
  await assert.rejects(cast(voteInput(legacyId, voters[0].id)), /appeal_not_found/);
  const response = await call(owner, 'GET', `/api/appeals/${legacyId}`); assert.equal(response.status, 200);
  assert.equal((await response.json()).appeal.policy_version, 'appeals-v1.0.0');
});

const peerVersion = 'synthetic-peer-participation-v1';
const peerEnv = { ...jobsEnv, MONTHLY_REPUTATION_SHADOW_RULES: PROPOSED_WEEKLY_EARNING_RULES.version,
  MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES: peerVersion };
let pausedPeerAppeal, pausedPeerEvent, peerCollectFrom, prePeerSubject, prePeerAssembly;
const peerEvent = async appealId => (await sql("SELECT id FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'moderation.community_appeal.resolved'", [appealId])).rows[0].id;
const peerWeek = async userId => (await sql(`SELECT calculation FROM trust.monthly_earning_week_revisions
  WHERE subject_user_id = $1 ORDER BY week_start DESC, revision DESC LIMIT 1`, [userId])).rows[0]?.calculation;

test('APP-13/REL-03: peer earning needs its own approved configuration; unavailable setup leaves monthly assembly inert', async () => {
  assert.equal(await processMonthlyPeerParticipation(peerEnv, uuidv7()), null, 'An absent flag must stay inert before installing the peer proposal');
  for (const proposal of ['monthly_reputation_shadow', 'monthly_reputation_maintenance', 'monthly_reputation_peer_participation']) {
    await sql(readFileSync(new URL(`../../../database/planetscale/proposals/${proposal}.sql`, import.meta.url), 'utf8'));
  }
  await sql(`INSERT INTO trust.monthly_maintenance_rule_sets (version, policy_version, catalogue_hash, mode, collect_from, configuration)
    VALUES ($1, $2, $3, 'shadow', '2020-01-01T00:00:00.000Z', $4::jsonb)`, [PROPOSED_MONTHLY_MAINTENANCE_RULES.version,
    MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, JSON.stringify(PROPOSED_MONTHLY_MAINTENANCE_RULES)]);
  statements.length = 0;
  assert.equal(await processMonthlyPeerParticipation(jobsEnv, uuidv7()), null);
  assert.deepEqual(await reconcileMonthlyPeerParticipation(jobsEnv), { processed: 0 }); assert.equal(statements.length, 0);
  const untouched = await person();
  const assembly = () => tx(client => assembleMonthlyReputation(client, { subjectUserId: untouched.id, sourceMonth: '2026-10',
    weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, maintenanceRulesVersion: PROPOSED_MONTHLY_MAINTENANCE_RULES.version,
    peerRulesVersion: peerVersion, evaluatedAt: '2026-11-04T00:00:00.000Z' }), 'lythaus_jobs');
  assert.equal((await assembly()).created, true, 'An absent peer flag must not block unrelated shadow assembly');
  await sql("INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ('trust.monthly_peer_participation', true, $1)", [MONTHLY_REPUTATION_POLICY_VERSION]);
  await sql(`INSERT INTO trust.monthly_peer_participation_rule_sets
    (version, policy_version, weekly_rules_version, appeal_rules_version, catalogue_hash, mode, award_rule, weekly_points, status, collect_from)
    VALUES ($1, $2, $3, $4, $5, 'shadow', 'one_valid_final_ballot', 250, 'pending_owner_approval', '2020-01-01T00:00:00.000Z')`,
  [peerVersion + '-unapproved', MONTHLY_REPUTATION_POLICY_VERSION, PROPOSED_WEEKLY_EARNING_RULES.version, rules, MONTHLY_REPUTATION_CATALOGUE_HASH]);
  assert.equal(await tx(client => loadMonthlyPeerConfiguration(client, peerVersion + '-unapproved', PROPOSED_WEEKLY_EARNING_RULES.version), 'lythaus_jobs'), null);
  assert.equal((await assembly()).created, false);
  prePeerSubject = await person();
  await sql("UPDATE identity.users SET created_at = '2026-08-01T00:00:00Z' WHERE id = $1", [prePeerSubject.id]);
  prePeerAssembly = await tx(client => assembleMonthlyReputation(client, { subjectUserId: prePeerSubject.id, sourceMonth: '2026-09',
    weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, maintenanceRulesVersion: PROPOSED_MONTHLY_MAINTENANCE_RULES.version,
    peerRulesVersion: peerVersion, evaluatedAt: '2026-10-04T00:00:00.000Z' }), 'lythaus_jobs');
  assert.equal(prePeerAssembly.created, true); assert.equal(prePeerAssembly.report.peerRulesVersion, null);
  peerCollectFrom = (await sql("SELECT date_trunc('milliseconds', clock_timestamp()) AS value")).rows[0].value.toISOString();
  pausedPeerAppeal = await opened(); await majority(pausedPeerAppeal.appealId, 2, 3); await due(pausedPeerAppeal.appealId); await close(pausedPeerAppeal.appealId);
  pausedPeerEvent = await peerEvent(pausedPeerAppeal.appealId);
  let acknowledged = 0;
  await jobs.queue({ messages: [{ body: { eventId: pausedPeerEvent, eventType: 'moderation.community_appeal.resolved', payload: { points: 13500 } },
    ack() { acknowledged++; }, retry() { assert.fail('Unavailable peer collector stays inert'); } }] }, peerEnv);
  assert.equal(acknowledged, 1);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_peer_participation_receipts')).rowCount, 0);
  assert.equal((await sql("SELECT state FROM system.consumer_inbox WHERE event_id = $1", [pausedPeerEvent])).rows[0].state, 'completed');
});

test('APP-13/REL-02: resumed final participation awards both sides once despite a completed transport inbox', async () => {
  await sql(`INSERT INTO trust.monthly_peer_participation_rule_sets
    (version, policy_version, weekly_rules_version, appeal_rules_version, catalogue_hash, mode, award_rule, weekly_points, status,
      collect_from, approved_by, approved_at, approval_reference)
    VALUES ($1, $2, $3, $4, $5, 'shadow', 'one_valid_final_ballot', 250, 'pending_owner_approval',
      $7, $6, now(), 'synthetic disposable approval only')`,
  [peerVersion, MONTHLY_REPUTATION_POLICY_VERSION, PROPOSED_WEEKLY_EARNING_RULES.version, rules, MONTHLY_REPUTATION_CATALOGUE_HASH, triager.id, peerCollectFrom]);
  const period = proposedClosingSundayWeek(new Date().toISOString());
  await assert.rejects(tx(client => requireMonthlyPeerIngestionDrained(client, { subjectUserId: voters[0].id,
    weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, peerRulesVersion: peerVersion, startsAt: period.startsAt, endsAt: period.endsAt }), 'lythaus_jobs'), /peer_ingestion_pending/);
  const results = await Promise.all([processMonthlyPeerParticipation(peerEnv, pausedPeerEvent), processMonthlyPeerParticipation(peerEnv, pausedPeerEvent)]);
  assert.equal(results.filter(result => result.processed).length, 1); assert.equal(results[0].participants, 5);
  for (const voter of voters.slice(0, 5)) {
    const calculation = await peerWeek(voter.id);
    assert.equal(calculation.points, 250); assert.equal(calculation.actions.find(row => row.actionId === 'weekly.peer_appeal_participation').points, 250);
    const evidence = calculation.evidence[0];
    const recorded = (await sql(`SELECT participation.performed_at FROM moderation.community_appeal_valid_participation participation
      JOIN moderation.community_appeal_ballots ballot ON ballot.id = participation.ballot_id WHERE ballot.appeal_id = $1 AND ballot.voter_user_id = $2`,
    [pausedPeerAppeal.appealId, voter.id])).rows[0];
    assert.equal(evidence.performedAt, recorded.performed_at.toISOString());
    assert.equal(evidence.kind, 'peer_ballot'); assert.equal(evidence.contentFingerprint, null);
    assert.equal(JSON.stringify(calculation).includes('rule_applies'), false); assert.equal(JSON.stringify(calculation).includes('rule_misapplied'), false);
  }
  assert.equal(await peerWeek(owner.id) instanceof Object, true);
  assert.equal((await sql("SELECT 1 FROM trust.monthly_earning_contributions WHERE subject_user_id = $1 AND source_type = 'peer_ballot'", [owner.id])).rowCount, 0);
  assert.deepEqual(await reconcileMonthlyPeerParticipation(peerEnv), { processed: 0 });
  await tx(client => requireMonthlyPeerIngestionDrained(client, { subjectUserId: voters[0].id,
    weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, peerRulesVersion: peerVersion, startsAt: period.startsAt, endsAt: period.endsAt }), 'lythaus_jobs');
});

test('APP-06/14/REL-02: multiple final ballots share one weekly allowance; recusal and latest cannot-assess never earn', async () => {
  const appeal = await opened(); await majority(appeal.appealId, 2, 3);
  const extra = voters[5]; await cast(voteInput(appeal.appealId, extra.id));
  await cast(voteInput(appeal.appealId, extra.id, 'cannot_assess', { expectedRevision: 1 }));
  await cast(voteInput(appeal.appealId, voters[6].id, 'recuse'));
  await due(appeal.appealId); await close(appeal.appealId);
  const eventId = await peerEvent(appeal.appealId);
  assert.equal((await processMonthlyPeerParticipation(peerEnv, eventId)).participants, 5);
  assert.equal((await peerWeek(voters[0].id)).points, 250); assert.equal((await peerWeek(voters[0].id)).evidence.length, 2);
  assert.equal(await peerWeek(extra.id), undefined); assert.equal(await peerWeek(voters[6].id), undefined);
  assert.equal((await processMonthlyPeerParticipation(peerEnv, eventId)).processed, false);
  await assert.rejects(processMonthlyPeerParticipation(peerEnv, uuidv7()), /canonical_event_required/);
});

test('CAL-18/REL-03: later peer collection never freezes an earlier month correction', async () => {
  const evaluatedAt = new Date(Date.now() + 60_000).toISOString();
  await tx(async client => {
    const configuration = await loadMonthlyEarningConfiguration(client, PROPOSED_WEEKLY_EARNING_RULES.version);
    await refreshMonthlyEarningWeek(client, { subjectUserId: prePeerSubject.id, startsAt: '2026-09-07T00:00:00.000Z',
      configuration, evaluatedAt });
  }, 'lythaus_jobs');
  const corrected = await tx(client => assembleMonthlyReputation(client, { subjectUserId: prePeerSubject.id, sourceMonth: '2026-09',
    weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, maintenanceRulesVersion: PROPOSED_MONTHLY_MAINTENANCE_RULES.version,
    peerRulesVersion: peerVersion, evaluatedAt }), 'lythaus_jobs');
  assert.equal(corrected.created, true); assert.equal(corrected.revision, 2); assert.equal(corrected.report.peerRulesVersion, null);
  assert.notEqual(corrected.sourceId, prePeerAssembly.sourceId);
  assert.equal((await sql('SELECT report FROM trust.monthly_reputation_assemblies WHERE source_id = $1', [prePeerAssembly.sourceId])).rows[0].report.peerRulesVersion, null);
});

test('REL-02: failed fanout rolls back every participant and retries from authoritative closure', async () => {
  const appeal = await opened(); await majority(appeal.appealId, 2, 3); await due(appeal.appealId); await close(appeal.appealId);
  const eventId = await peerEvent(appeal.appealId), before = (await peerWeek(voters[0].id)).evidence.length;
  await sql(`CREATE FUNCTION system.fail_peer_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type = 'trust.monthly_week.revised' THEN RAISE EXCEPTION 'synthetic_peer_fanout_failure'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER fail_peer_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_peer_fixture()`);
  try { await assert.rejects(processMonthlyPeerParticipation(peerEnv, eventId), /synthetic_peer_fanout_failure/); }
  finally { await sql('DROP TRIGGER fail_peer_fixture ON system.outbox_events'); await sql('DROP FUNCTION system.fail_peer_fixture()'); }
  assert.equal((await sql('SELECT 1 FROM trust.monthly_peer_participation_receipts WHERE appeal_id = $1', [appeal.appealId])).rowCount, 0);
  assert.equal((await peerWeek(voters[0].id)).evidence.length, before);
  assert.equal((await processMonthlyPeerParticipation(peerEnv, eventId)).participants, 5);
});

test('REL-02: deletion during fanout rolls back the batch and retry excludes the erased account', async () => {
  const appeal = await opened(), participants = [];
  for (let n = 0; n < 5; n++) {
    const actor = await person(); participants.push(actor);
    await cast(voteInput(appeal.appealId, actor.id, n < 2 ? 'allow' : 'retain'));
  }
  await due(appeal.appealId); await close(appeal.appealId);
  const eventId = await peerEvent(appeal.appealId), erased = [...participants].sort((a, b) => a.id.localeCompare(b.id))[0];
  let reached, resume;
  const barrier = new Promise(resolve => { reached = resolve; }), released = new Promise(resolve => { resume = resolve; });
  const pending = tx(client => recordMonthlyPeerParticipation({ query: async (text, values) => {
    if (text.includes('INSERT INTO trust.monthly_earning_contributions') && values[1] === erased.id) { reached(); await released; }
    return client.query(text, values);
  } }, { eventId, rulesVersion: peerVersion, weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version,
    evaluatedAt: new Date().toISOString() }), 'lythaus_jobs');
  const rejection = assert.rejects(pending, /subject_unavailable/);
  await barrier;
  try { await sql("UPDATE identity.users SET status = 'deleted', deleted_at = clock_timestamp() WHERE id = $1", [erased.id]); }
  finally { resume(); }
  await rejection;
  assert.equal((await sql('SELECT 1 FROM trust.monthly_peer_participation_receipts WHERE appeal_id = $1', [appeal.appealId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_contributions WHERE subject_user_id = ANY($1::uuid[])', [participants.map(actor => actor.id)])).rowCount, 0);
  assert.equal((await processMonthlyPeerParticipation(peerEnv, eventId)).participants, 4);
  assert.equal(await peerWeek(erased.id), undefined);
  for (const actor of participants.filter(actor => actor !== erased)) assert.equal((await peerWeek(actor.id)).points, 250);
});

test('REL-03: concurrent flag pause is observed freshly; approved configuration cannot be removed or relabelled', async () => {
  const appeal = await opened(); await majority(appeal.appealId, 2, 3); await due(appeal.appealId); await close(appeal.appealId);
  const eventId = await peerEvent(appeal.appealId), locker = new pg.Client({ connectionString, ssl: false });
  await locker.connect(); await locker.query('BEGIN');
  await locker.query("UPDATE system.feature_flags SET enabled = false WHERE flag_key = 'trust.monthly_peer_participation'");
  let consumerPid, reached;
  const barrier = new Promise(resolve => { reached = resolve; });
  const pending = tx(async client => {
    consumerPid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; reached();
    return recordMonthlyPeerParticipation(client, { eventId, rulesVersion: peerVersion,
      weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, evaluatedAt: new Date().toISOString() });
  }, 'lythaus_jobs');
  await barrier;
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await sql('SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked', [consumerPid])).rows[0].blocked) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(blocked, true, 'The collector must wait for the concurrent configuration update');
    await locker.query('COMMIT');
    assert.equal(await pending, null);
  } finally { await locker.query('ROLLBACK'); await locker.end(); }
  assert.equal((await sql('SELECT 1 FROM trust.monthly_peer_participation_receipts WHERE appeal_id = $1', [appeal.appealId])).rowCount, 0);
  assert.deepEqual(await reconcileMonthlyPeerParticipation(peerEnv), { processed: 0 });
  const period = proposedClosingSundayWeek(new Date().toISOString());
  await assert.rejects(tx(client => requireMonthlyPeerIngestionDrained(client, { subjectUserId: voters[0].id,
    weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, peerRulesVersion: peerVersion, startsAt: period.startsAt, endsAt: period.endsAt }), 'lythaus_jobs'), /participation_paused/);
  await assert.rejects(sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_peer_participation'"), /requires_privacy_teardown/);
  await assert.rejects(sql("UPDATE system.feature_flags SET policy_version = 'different-policy' WHERE flag_key = 'trust.monthly_peer_participation'"), /requires_privacy_teardown/);
  await assert.rejects(tx(client => client.query("UPDATE system.feature_flags SET enabled = true WHERE flag_key = 'trust.monthly_peer_participation'"), 'lythaus_jobs'), /permission denied/);
  await sql("UPDATE system.feature_flags SET enabled = true WHERE flag_key = 'trust.monthly_peer_participation'");
  assert.deepEqual(await reconcileMonthlyPeerParticipation(peerEnv), { processed: 1 });
  assert.deepEqual(await reconcileMonthlyPeerParticipation(peerEnv), { processed: 0 });
});

test('CAL-05/06/APP-14: late closure earns only the final revision in its original cross-month week', async () => {
  const historicalVersion = peerVersion + '-boundary';
  await sql(`INSERT INTO trust.monthly_peer_participation_rule_sets
    (version, policy_version, weekly_rules_version, appeal_rules_version, catalogue_hash, mode, award_rule, weekly_points, status,
      collect_from, approved_by, approved_at, approval_reference)
    VALUES ($1, $2, $3, $4, $5, 'shadow', 'one_valid_final_ballot', 250, 'pending_owner_approval',
      '2020-01-01T00:00:00Z', $6, now(), 'synthetic boundary fixture only')`,
  [historicalVersion, MONTHLY_REPUTATION_POLICY_VERSION, PROPOSED_WEEKLY_EARNING_RULES.version, rules, MONTHLY_REPUTATION_CATALOGUE_HASH, triager.id]);
  const appeal = await opened(), ballotIds = [];
  await sql("UPDATE moderation.community_appeal_sessions SET opens_at = '2026-08-30T12:00:00Z', closes_at = '2026-09-01T12:00:00Z' WHERE appeal_id = $1", [appeal.appealId]);
  for (let n = 0; n < 5; n++) {
    const ballot = uuidv7(); ballotIds.push(ballot);
    await sql('INSERT INTO moderation.community_appeal_ballots (id, appeal_id, voter_user_id) VALUES ($1, $2, $3)', [ballot, appeal.appealId, voters[n].id]);
    await sql(`INSERT INTO moderation.community_appeal_ballot_revisions
      (id, ballot_id, revision, weight, choice, reason_code, context_acknowledged, idempotency_key, cast_at)
      VALUES ($1, $2, 1, 1, $3, $4, true, $5, '2026-08-30T23:59:59.123456Z')`,
    [uuidv7(), ballot, n < 2 ? 'allow' : 'retain', n < 2 ? 'rule_misapplied' : 'rule_applies', uuidv7()]);
  }
  const finalRevision = uuidv7();
  await sql(`INSERT INTO moderation.community_appeal_ballot_revisions
    (id, ballot_id, revision, weight, choice, reason_code, context_acknowledged, idempotency_key, cast_at)
    VALUES ($1, $2, 2, 1, 'allow', 'rule_misapplied', true, $3, '2026-08-31T00:00:00.000001Z')`, [finalRevision, ballotIds[0], uuidv7()]);
  assert.equal((await close(appeal.appealId)).result.status, 'resolved_retain');
  assert.equal((await sql(`SELECT 1 FROM moderation.community_appeal_valid_participation participation
    JOIN moderation.community_appeal_ballot_revisions revision ON revision.id = participation.revision_id
    WHERE participation.ballot_id = ANY($1::uuid[]) AND participation.performed_at = revision.cast_at`, [ballotIds])).rowCount, 5);
  const historicalEnv = { ...peerEnv, MONTHLY_REPUTATION_PEER_PARTICIPATION_RULES: historicalVersion };
  assert.equal((await processMonthlyPeerParticipation(historicalEnv, await peerEvent(appeal.appealId))).participants, 5);
  const earning = (await sql(`SELECT contribution.source_id, contribution.week_start, evidence.input
    FROM trust.monthly_earning_contributions contribution JOIN trust.monthly_earning_evidence_revisions evidence ON evidence.contribution_id = contribution.id
    WHERE contribution.source_id = ANY($1::uuid[]) ORDER BY contribution.source_id`, [ballotIds])).rows;
  assert.equal(earning.length, 5);
  for (const row of earning) {
    const expected = row.source_id === ballotIds[0] ? '2026-08-31T00:00:00.000Z' : '2026-08-24T00:00:00.000Z';
    assert.equal(row.week_start.toISOString(), expected);
    assert.equal(proposedClosingSundayWeek(row.input.performedAt).ownerMonth, row.source_id === ballotIds[0] ? '2026-09' : '2026-08');
    assert.equal(row.input.performedAt.startsWith('2026-10'), false, 'Closure delivery must not move the performance period');
  }
  assert.equal(earning.find(row => row.source_id === ballotIds[0]).input.sourceRevisionId, finalRevision);
  await assert.rejects(processMonthlyPeerParticipation(peerEnv, await peerEvent(appeal.appealId)), /previous_policy_requires_review/);
});

test('APP-07/12: actual staff routes verify Access JWT, membership, Origin, private evidence and triage', async () => {
  const appeal = await submit(await blocked());
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId }).setSubject(triager.id)
    .setAudience(adminEnv.ACCESS_AUDIENCES).setIssuer(`https://${adminEnv.ACCESS_TEAM_DOMAIN}`).setIssuedAt().setExpirationTime('10m').sign(privateKey);
  const adminCall = (method, path, body, patch = {}) => adminWorker.fetch(new Request('https://admin-api.lythaus.test/api/admin/appeals' + path,
    { method, headers: { 'CF-Access-Jwt-Assertion': token, Origin: 'https://admin-api.lythaus.test', 'Content-Type': 'application/json', ...patch },
      ...(body ? { body: JSON.stringify(body) } : {}) }), adminEnv);
  assert.equal((await adminCall('GET', '/community/queue', undefined, { 'CF-Access-Jwt-Assertion': '' })).status, 401);
  assert.equal((await adminCall('GET', '/community/queue', undefined, { 'CF-Access-Jwt-Assertion': 'invalid.signature' })).status, 401);
  const queue = await adminCall('GET', '/community/queue'); assert.equal(queue.status, 200, await queue.clone().text());
  matches('CommunityAppealTriageQueue', await queue.json());
  const evidence = await adminCall('GET', `/${appeal.appealId}/evidence`); assert.equal(evidence.status, 200);
  assert.match(evidence.headers.get('cache-control'), /private.*no-store/);
  matches('CommunityAppealTriageEvidence', await evidence.json());
  const body = { reviewClass: 'standard', safePreview: 'Reviewed safe text', ruleContext: 'Apply the stated rule.', reasonCode: 'safe_text_review' };
  assert.equal((await adminCall('POST', `/${appeal.appealId}/triage`, body, { Origin: 'https://untrusted.invalid' })).status, 403);
  const triaged = await adminCall('POST', `/${appeal.appealId}/triage`, body); assert.equal(triaged.status, 200, await triaged.clone().text());
  matches('CommunityAppealTriageResponse', await triaged.json());
  await sql('UPDATE identity.admin_memberships SET active = false WHERE user_id = $1', [triager.id]);
  assert.equal((await adminCall('GET', '/community/queue')).status, 403);
  await sql('UPDATE identity.admin_memberships SET active = true WHERE user_id = $1', [triager.id]);
});

test('REL-02/APP-07: pausing ballots also pauses peer evidence while preserving the owner report', async () => {
  const appeal = await opened();
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [flag]);
  assert.equal((await call(voters[0], 'GET', `/api/appeals/${appeal.appealId}`)).status, 503);
  assert.equal((await call(owner, 'GET', `/api/appeals/${appeal.appealId}`)).status, 200);
  await assert.rejects(cast(voteInput(appeal.appealId, voters[0].id)), /unavailable/);
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  assert.equal((await call(voters[0], 'GET', `/api/appeals/${appeal.appealId}`)).status, 200);
});

test('APP-11/PTS-03/RPT-04: actual equal-vote comment restoration retains context credit after soft/purge before Jobs delivery',async()=>{
  await sql(readFileSync(new URL('../../../database/planetscale/proposals/monthly_reputation_context.sql',import.meta.url),'utf8'));
  const contextVersion='synthetic-restored-context-v1',rubric='synthetic-restored-rubric-v1';
  await sql("INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ('trust.monthly_context_review',true,$1)",[MONTHLY_REPUTATION_POLICY_VERSION]);
  await sql(`INSERT INTO trust.monthly_context_rule_sets (version,policy_version,weekly_rules_version,catalogue_hash,rubric_version,mode,status,
    collect_from,approved_by,approved_at,approval_reference,collection_privacy_version)
    VALUES ($1,$2,$3,$4,$5,'shadow','pending_owner_approval','2020-01-01',$6,now(),'Synthetic only','monthly-privacy-v1')`,
  [contextVersion,MONTHLY_REPUTATION_POLICY_VERSION,PROPOSED_WEEKLY_EARNING_RULES.version,MONTHLY_REPUTATION_CATALOGUE_HASH,rubric,triager.id]);
  const accessToken=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:keyId}).setSubject(triager.id)
    .setAudience(adminEnv.ACCESS_AUDIENCES).setIssuer(`https://${adminEnv.ACCESS_TEAM_DOMAIN}`).setIssuedAt().setExpirationTime('10m').sign(privateKey);
  for(const pending of [false,true]){
    const root=uuidv7(),threadSource=uuidv7(),commentId=uuidv7(),source=uuidv7(),caseId=uuidv7();posts.push(root);cases.push(caseId);
    await sql(`INSERT INTO content.posts (id,author_id,body,declared_creation_mode,visibility,moderation_state,moderation_source_event_id)
      VALUES ($1,$2,'Synthetic restored thread','human','public','allowed',$3)`,[root,owner.id,threadSource]);
    await sql(`INSERT INTO content.comments (id,post_id,author_id,body,declared_creation_mode,moderation_state,moderation_source_event_id)
      VALUES ($1,$2,$3,$4,'human','blocked',$5)`,[commentId,root,owner.id,`Synthetic contextual comment ${commentId}`,source]);
    await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
      VALUES ($1,'content.comment.created','comment',$2,$3,'{}'::jsonb)`,[source,commentId,owner.id]);
    await sql(`INSERT INTO moderation.cases (id,content_type,content_id,state,policy_version,source_event_id)
      VALUES ($1,'comment',$2,'resolved','synthetic-comment-block',$3)`,[caseId,commentId,source]);
    await sql(`INSERT INTO moderation.decisions (id,case_id,outcome,public_label,policy_version,decided_by)
      VALUES ($1,$2,'block','Under review','synthetic-comment-block',$3)`,[uuidv7(),caseId,decider.id]);
    const appeal=await submit({caseId});await triage(appeal);await majority(appeal.appealId,5,0);await due(appeal.appealId);
    assert.equal((await close(appeal.appealId)).restoration,'restored');
    const earning=eventId=>tx(client=>recordMonthlyContentEarning(client,{eventId,rulesVersion:PROPOSED_WEEKLY_EARNING_RULES.version,
      contextRulesVersion:contextVersion,evaluatedAt:new Date().toISOString()}),'lythaus_jobs');
    if(pending) await earning(source);
    const input={rubricVersion:rubric,sourceRevisionId:source,threadRevisionId:threadSource,parentRevisionId:null,
      decision:'accepted',reasonCode:'synthetic_context_accepted',evidenceReference:'Synthetic private evidence',expectedRevision:0,idempotencyKey:uuidv7()};
    const contextCall=(body=input,headers={},configuration={...adminEnv,MONTHLY_REPUTATION_CONTEXT_RULES:contextVersion})=>adminWorker.fetch(new Request(
      `https://admin-api.lythaus.test/api/admin/reputation/comments/${commentId}/context-review`,{method:'POST',
        headers:{'CF-Access-Jwt-Assertion':accessToken,Origin:'https://admin-api.lythaus.test','Content-Type':'application/json',...headers},body:JSON.stringify(body)}),configuration);
    assert.equal((await contextCall(input,{'CF-Access-Jwt-Assertion':''})).status,401);
    assert.equal((await contextCall(input,{Origin:'https://untrusted.invalid'})).status,403);
    assert.equal((await contextCall(input,{},adminEnv)).status,503);
    assert.equal((await contextCall({...input,points:13500})).status,400);
    const response=await contextCall();assert.equal(response.status,201,await response.clone().text());
    assert.match(response.headers.get('cache-control'),/private.*no-store/);
    const review=await response.json();assert.equal((await contextCall()).status,200);
    await sql('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1',[triager.id]);
    assert.equal((await contextCall()).status,403);
    await sql('UPDATE identity.admin_memberships SET active=true WHERE user_id=$1',[triager.id]);
    assert.equal((await sql('SELECT earning_facts FROM trust.monthly_context_reviews WHERE id=$1',[review.reviewId])).rows[0].earning_facts.publicationAccepted,true);
    await sql('UPDATE content.comments SET deleted_at=now() WHERE id=$1',[commentId]);
    await earning(review.sourceEventId);
    await sql('DELETE FROM content.comments WHERE id=$1',[commentId]);
    const contribution=(await sql(`SELECT evidence.input FROM trust.monthly_earning_contributions contribution
      JOIN LATERAL (SELECT input FROM trust.monthly_earning_evidence_revisions WHERE contribution_id=contribution.id ORDER BY revision DESC LIMIT 1) evidence ON true
      WHERE contribution.source_id=$1`,[commentId])).rows[0];
    assert.equal(contribution.input.state,'accepted');assert.equal(contribution.input.contextReviewId,review.reviewId);
  }
});

test('public dispatcher invokes private monthly JSON, CSV, and rewards routes with feature gates closed',async()=>{
  const report=await call(owner,'GET','/api/reputation/me/reports/monthly/2026-08');
  assert.equal(report.status,200,await report.clone().text());
  assert.match(report.headers.get('cache-control')??'',/private.*no-store/);
  const reportBody=await report.json();matches('MonthlyReputationReportResponse',reportBody);
  assert.equal(reportBody.reportState,'pending');assert.equal(reportBody.preparedResponse,null);
  assert.deepEqual(reportBody.responsePreparation,{
    state:'disabled',reasonCode:'activation_not_approved',responseVersion:'monthly-rewards-response-v2-preparation',
    policyVersion:'lythaus-monthly-rewards-2026-10-v2',
    catalogueHash:'26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67',
    dataVersion:2,maximumSourceMonth:13650,preparationOnly:true,runtimeActivationAllowed:false,appliedPoints:0,
  });

  const csv=await call(owner,'GET','/api/reputation/me/reports/monthly/2026-08/export.csv');
  assert.equal(csv.status,200,await csv.clone().text());
  assert.match(csv.headers.get('content-type')??'',/text\/csv/);
  assert.equal(csv.headers.get('content-disposition'),'attachment; filename="monthly-reputation-2026-08.csv"');
  assert.ok((await csv.text()).startsWith('rowType,sourceMonth,effectiveMonth'));

  const rewards=await call(owner,'GET','/api/rewards/me/monthly');
  assert.equal(rewards.status,200,await rewards.clone().text());
  assert.match(rewards.headers.get('cache-control')??'',/private.*no-store/);
  const rewardsBody=await rewards.json();matches('MonthlyRewardsMeResponse',rewardsBody);
  assert.deepEqual(rewardsBody,{
    state:'pending',reasonCode:'approval_unavailable',effectiveMonth:null,currentLevel:null,sourceMonth:null,sourceScore:null,
    snapshot:{state:'unavailable',reasonCode:'approval_unavailable'},selection:{state:'unavailable',reasonCode:'approval_unavailable'},
    responsePreparation:reportBody.responsePreparation,preparedResponse:null,
  });
});
