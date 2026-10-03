import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test, mock } from 'node:test';
import { registerHooks } from 'node:module';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import * as database from '@lythaus/db';
import { exportPKCS8, generateKeyPair } from 'jose';
import { uuidv7, hashAuthToken } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy, MONTHLY_REPUTATION_CATALOGUE_HASH as hash } from '@lythaus/contracts';
import { PROPOSED_WEEKLY_EARNING_RULES as weekly } from '../../../packages/contracts/src/monthly-earning-policy.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as maintenance } from '../../../packages/contracts/src/monthly-maintenance-policy.ts';
import { recordMonthlyEmailControl, readMonthlyMaintenanceEvidence, loadMonthlyMaintenanceConfiguration } from '../../../packages/db/src/monthly-maintenance.ts';
import { assembleMonthlyReputation } from '../../../packages/db/src/monthly-assembly.ts';
import { assessMonthlyReputationSource } from '../../../packages/db/src/monthly-reputation.ts';
import { recordMonthlyContentEarning } from '../../../packages/db/src/monthly-earning.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !(target.pathname === '/lythaus_monthly_test' || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Monthly assembly tests require explicitly local disposable PostgreSQL');
}
const statements = [];
async function tx(work, role = 'lythaus_jobs') {
  const client = new pg.Client({ connectionString, ssl: false }); await client.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '10s'");
    if (role) { assert.ok(['lythaus_runtime', 'lythaus_jobs', 'lythaus_privacy'].includes(role)); await client.query(`SET LOCAL ROLE ${role}`); }
    const result = await work({ query: (text, values) => { statements.push(text); return client.query(text, values); } });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
const sql = (text, values) => tx(client => client.query(text, values), null);
const jobsBinding = { role: 'lythaus_jobs' }, runtimeBinding = { role: 'lythaus_runtime' };
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => tx(client => client.query(text, values), binding.role),
  transaction: (binding, work) => tx(work, binding.role),
} });
const { reconcileMonthlyAssembly } = await import('../src/monthly-assembly.ts');
const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === 'cloudflare:workers' ? { url: 'data:text/javascript,export class WorkflowEntrypoint {}', shortCircuit: true } : next(specifier, context);
} });
const { default: jobs } = await import('../src/index.ts'); hooks.deregister();
const { default: worker } = await import('../../lythaus-public-api/src/index.ts');
mock.method(globalThis, 'fetch', async url => {
  assert.ok(String(url).startsWith('https://api.pwnedpasswords.com/range/'));
  return new Response(`${'0'.repeat(35)}:0`);
});
const env = { DB_JOBS_FRESH: jobsBinding, MONTHLY_REPUTATION_SHADOW_RULES: weekly.version, MONTHLY_REPUTATION_MAINTENANCE_RULES: maintenance.version };
const users = [], posts = [], cases = [], grants = [], weeks = ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'];
let subject, reviewer, empty, firstSource, emailProof;
const flag = 'trust.monthly_reputation_shadow';
const assemble = (subjectUserId = subject, patch = {}) => tx(client => assembleMonthlyReputation(client, {
  subjectUserId, sourceMonth: '2026-08', weeklyRulesVersion: weekly.version, maintenanceRulesVersion: maintenance.version,
  evaluatedAt: new Date().toISOString(), ...patch,
}));
async function person(created = '2026-07-01T00:00:00.000Z') {
  const id = uuidv7(); users.push(id);
  await sql("INSERT INTO identity.users (id, display_name, created_at) VALUES ($1, 'Synthetic monthly assembly', $2)", [id, created]);
  return id;
}
async function emailFixture(userId = subject, performedAt = '2026-08-15T12:00:00.000Z') {
  const eventId = uuidv7(), tokenId = uuidv7(), lookup = randomBytes(32);
  await sql(`INSERT INTO identity.email_credentials
    (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash, verified_at)
    VALUES ($1, decode('00', 'hex'), $2, 'v1', 'v1', '{}'::jsonb, $3)`, [userId, lookup, performedAt]);
  await sql(`INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, created_at, expires_at, consumed_at)
    VALUES ($1, $2, $3, $4::timestamptz - interval '1 minute', $4::timestamptz + interval '5 minutes', $4)`, [tokenId, userId, randomBytes(32), performedAt]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'identity.email.verified', 'user', $2, $2, '{"points":13500,"verified":true}'::jsonb, $3)`, [eventId, userId, performedAt]);
  return { eventId, tokenId, lookup, performedAt };
}
const capture = (fixture, rulesVersion = maintenance.version) => tx(client => recordMonthlyEmailControl(client, {
  sourceEventId: fixture.eventId, verificationTokenId: fixture.tokenId, rulesVersion,
}), 'lythaus_runtime');
async function post(week, process = true) {
  const id = uuidv7(), event = uuidv7(), caseId = uuidv7(); posts.push({ id, event, week }); cases.push(caseId);
  const performed = `${week}T12:00:00.000Z`;
  await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, moderation_source_event_id, created_at)
    VALUES ($1, $2, $3, 'human', 'public', 'allowed', $4, $5)`, [id, subject, `Distinct synthetic contribution ${id}`, event, performed]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'content.post.created', 'post', $2, $3, '{}'::jsonb, $4)`, [event, id, subject, performed]);
  await sql(`INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
    VALUES ($1, 'post', $2, 'resolved', 'synthetic-acceptance', $3)`, [caseId, id, event]);
  await sql(`INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version, decided_by)
    VALUES ($1, $2, 'allow', 'Human-authored', 'synthetic-acceptance', $3)`, [uuidv7(), caseId, reviewer]);
  if (process) await tx(client => recordMonthlyContentEarning(client, { eventId: event, rulesVersion: weekly.version, evaluatedAt: new Date().toISOString() }));
  return { id, event };
}
before(async () => {
  for (const role of ['lythaus_runtime', 'lythaus_jobs']) {
    if (!(await sql('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, 'system.feature_flags', 'SELECT'])).rows[0].allowed) grants.push(`REVOKE SELECT ON system.feature_flags FROM ${role}`);
  }
  for (const proposal of ['monthly_reputation_shadow', 'monthly_reputation_earning', 'monthly_reputation_maintenance']) {
    await sql(readFileSync(new URL(`../../../database/planetscale/proposals/${proposal}.sql`, import.meta.url), 'utf8'));
  }
  for (const [table, rules] of [['monthly_earning_rule_sets', weekly], ['monthly_maintenance_rule_sets', maintenance]]) {
    const privacyColumn = table === 'monthly_maintenance_rule_sets' ? ', collection_privacy_version' : '';
    const privacyValue = table === 'monthly_maintenance_rule_sets' ? ", 'monthly-privacy-v1'" : '';
    await sql(`INSERT INTO trust.${table} (version, policy_version, catalogue_hash, mode, collect_from, configuration${privacyColumn})
      VALUES ($1, $2, $3, 'shadow', '2026-07-27T00:00:00.000Z', $4::jsonb${privacyValue})`, [rules.version, policy, hash, JSON.stringify(rules)]);
  }
  const unready = { ...maintenance, version: 'synthetic-privacy-not-ready' };
  await sql(`INSERT INTO trust.monthly_maintenance_rule_sets (version, policy_version, catalogue_hash, mode, collect_from, configuration)
    VALUES ($1, $2, $3, 'shadow', '2026-07-27T00:00:00.000Z', $4::jsonb)`, [unready.version, policy, hash, JSON.stringify(unready)]);
  subject = await person(); reviewer = await person(); empty = await person();
});
after(async () => {
  await sql('DROP TRIGGER IF EXISTS fail_monthly_assembly_fixture ON trust.monthly_reputation_assemblies');
  await sql('DROP FUNCTION IF EXISTS trust.fail_monthly_assembly_fixture()');
  await sql('DROP TRIGGER IF EXISTS monthly_email_control_revocation ON identity.email_credentials');
  await sql('DROP TRIGGER IF EXISTS monthly_reputation_subject_erasure ON identity.users');
  await sql('DROP TRIGGER IF EXISTS monthly_collection_flag_preserved ON system.feature_flags');
  await sql('DROP FUNCTION IF EXISTS trust.revoke_monthly_email_control()');
  await sql(`DROP TABLE IF EXISTS trust.monthly_reputation_assemblies, trust.monthly_maintenance_revocations,
    trust.monthly_maintenance_observations, trust.monthly_maintenance_rule_sets,
    trust.monthly_reputation_assessments, trust.monthly_reputation_sources,
    trust.monthly_earning_week_revisions, trust.monthly_earning_receipts, trust.monthly_earning_evidence_revisions,
    trust.monthly_earning_contributions, trust.monthly_earning_rule_sets`);
  await sql('DROP FUNCTION IF EXISTS trust.reject_monthly_maintenance_update(), trust.reject_monthly_reputation_update(), trust.reject_monthly_earning_update()');
  await sql('DROP FUNCTION IF EXISTS trust.require_monthly_reputation_subject(), trust.require_monthly_assessment_subject(), trust.erase_monthly_reputation_subject(), trust.preserve_monthly_collection_flag(), trust.lock_monthly_reputation_subject(uuid)');
  await sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [flag]);
  for (const grant of grants) await sql(grant);
  await sql('DELETE FROM moderation.decisions WHERE case_id = ANY($1::uuid[])', [cases]);
  await sql('DELETE FROM moderation.cases WHERE id = ANY($1::uuid[])', [cases]);
  await sql('DELETE FROM content.posts WHERE author_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events WHERE actor_id = ANY($1::uuid[]))', [users]);
  await sql('DELETE FROM system.outbox_events WHERE actor_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM trust.user_activity_events WHERE user_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM identity.account_events WHERE user_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM identity.email_credentials WHERE user_id = ANY($1::uuid[])', [users]);
  await sql('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [users]);
});

test('SEC-01/REL-03: no implicit collection or assembly; configured shadow needs the exact enabled policy', async () => {
  statements.length = 0;
  assert.deepEqual(await reconcileMonthlyAssembly({ DB_JOBS_FRESH: jobsBinding }), { processed: 0 });
  assert.equal(statements.length, 0);
  assert.equal(await assemble(), null);
  emailProof = await emailFixture();
  assert.equal(await capture(emailProof), null);
  await sql('UPDATE identity.email_credentials SET updated_at = now() WHERE user_id = $1', [subject]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_revocations')).rowCount, 0);
  await sql('INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ($1, true, $2)', [flag, policy]);
  await assert.rejects(sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [flag]), /requires_privacy_teardown/);
  assert.equal(await capture(emailProof, 'unknown'), null);
  assert.equal(await capture(emailProof, 'synthetic-privacy-not-ready'), null);
  assert.equal(await tx(client => loadMonthlyMaintenanceConfiguration(client, 'unknown')), null);
  await assert.rejects(capture({ ...emailProof, eventId: uuidv7() }), /canonical_email_required/);
});

test('REL-02/03: the first earning write cannot race removal or relabeling of its lifecycle flag', async () => {
  await sql('DELETE FROM trust.monthly_maintenance_rule_sets WHERE version = $1', [maintenance.version]);
  const item = await post('2026-08-31', false);
  let reached, resume;
  const barrier = new Promise(resolve => { reached = resolve; }), released = new Promise(resolve => { resume = resolve; });
  const pending = tx(client => recordMonthlyContentEarning({ query: async (text, values) => {
    if (text.includes('INSERT INTO trust.monthly_earning_contributions')) { reached(); await released; }
    return client.query(text, values);
  } }, { eventId: item.event, rulesVersion: weekly.version, evaluatedAt: new Date().toISOString() }));
  await barrier;
  try {
    assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_contributions')).rowCount, 0);
    assert.equal((await sql("SELECT 1 FROM trust.monthly_maintenance_rule_sets WHERE collection_privacy_version = 'monthly-privacy-v1'")).rowCount, 0);
    await assert.rejects(sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [flag]), /requires_privacy_teardown/);
    await assert.rejects(sql("UPDATE system.feature_flags SET policy_version = 'unconfigured-replacement' WHERE flag_key = $1", [flag]), /requires_privacy_teardown/);
  } finally { resume(); }
  assert.equal((await pending).processed, true);
  await sql(`INSERT INTO trust.monthly_maintenance_rule_sets
    (version, policy_version, catalogue_hash, mode, collect_from, configuration, collection_privacy_version)
    VALUES ($1, $2, $3, 'shadow', '2026-07-27T00:00:00.000Z', $4::jsonb, 'monthly-privacy-v1')`,
  [maintenance.version, policy, hash, JSON.stringify(maintenance)]);
});

test('SEC-01/09/CAL-16: canonical consumed verification supplies one bound proof, with no client point input', async () => {
  const responses = await Promise.all([capture(emailProof), capture(emailProof)]);
  assert.equal(responses.filter(result => result.recorded).length, 1);
  const evidence = await tx(client => readMonthlyMaintenanceEvidence(client, subject, '2026-09-01T00:00:00.000Z'));
  assert.deepEqual(evidence.evidence[0].facts, { kind: 'email_control', emailVersion: emailProof.tokenId });
  assert.equal(JSON.stringify(evidence).includes(emailProof.lookup.toString('hex')), false);
  await assert.rejects(tx(client => client.query('SELECT email_binding_digest FROM trust.monthly_maintenance_observations')), { code: '42501' });
  await assert.rejects(sql('UPDATE trust.monthly_maintenance_observations SET performed_at = now() WHERE id = $1', [emailProof.eventId]), /evidence_is_immutable/);
  for (const [facts, binding] of [[{ kind: 'email_control' }, Buffer.alloc(32)],
    [{ kind: 'email_control', emailVersion: uuidv7() }, null], [{}, null],
    [{ kind: null, emailVersion: uuidv7() }, Buffer.alloc(32)]]) {
    await assert.rejects(tx(client => client.query(`INSERT INTO trust.monthly_maintenance_observations
      (id, subject_user_id, source_event_id, kind, performed_at, facts, email_binding_digest)
      VALUES ($1, $2, $1, 'email_control', now(), $3::jsonb, $4)`,
    [uuidv7(), subject, JSON.stringify(facts), binding]), 'lythaus_runtime'), { code: '23514' });
  }
  const outsider = await person(); const otherProof = await emailFixture(outsider);
  await assert.rejects(capture({ ...emailProof, tokenId: otherProof.tokenId }), /source_reused/);
  const beforeCollection = await person();
  assert.deepEqual(await capture(await emailFixture(beforeCollection, '2026-06-01T00:00:00.000Z')), { recorded: false });
});

test('CAL-01/02/03/RPT-01: real earning plus email evidence assembles best four whole weeks exactly once', async () => {
  for (const week of weeks) for (let n = 0; n < (week === weeks[0] ? 1 : 3); n++) await post(week);
  const responses = await Promise.all([assemble(), assemble(), assemble()]);
  assert.equal(responses.filter(result => result.created).length, 1); firstSource = responses[0].sourceId;
  const source = (await sql('SELECT input FROM trust.monthly_reputation_sources WHERE id = $1', [firstSource])).rows[0];
  assert.deepEqual(source.input.weeks.map(week => week.points), [250, 500, 500, 500, 500]);
  assert.equal(source.input.monthlyPoints, 0); assert.equal(source.input.quarterlyPoints, 1000);
  assert.equal(responses[0].report.maintenance.actions.filter(action => action.state === 'unavailable').length, 5);
  const event = (await sql("SELECT id FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'trust.monthly_assessment.requested'", [firstSource])).rows[0];
  let acknowledged = 0;
  const message = () => ({ body: { eventId: event.id, eventType: 'trust.monthly_assessment.requested', payload: { points: 13500 } },
    ack() { acknowledged++; }, retry() { assert.fail('Assessment queue must not retry'); } });
  await jobs.queue({ messages: [message(), message()] }, env);
  assert.equal(acknowledged, 2);
  const assessment = (await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE source_id = $1', [firstSource])).rows[0].calculation;
  assert.equal(assessment.sourceScore, 3000); assert.equal(assessment.level, 3); assert.equal(assessment.effectiveMonth, '2026-09');
  assert.equal(assessment.weeks.filter(week => !week.selected).length, 1); assert.equal(assessment.weeks[0].selected, false);
  assert.equal((await sql('SELECT 1 FROM trust.reputation_profiles WHERE user_id = $1', [subject])).rowCount, 0);
});

test('CAL-09/12: empty or new accounts have explicit missing weeks and cannot assemble before settlement', async () => {
  await assert.rejects(assemble(empty, { evaluatedAt: '2026-09-03T23:59:59.999Z' }), /source_not_settled/);
  const result = await assemble(empty);
  assert.equal(result.report.missingWeeks.length, 5); assert.equal(result.report.weeks.length, 0);
  const newcomer = await person('2026-08-31T12:00:00.000Z');
  await capture(await emailFixture(newcomer, '2026-08-31T13:00:00.000Z'));
  const partial = await assemble(newcomer);
  assert.equal(partial.report.maintenance.quarterlyPoints, 1000);
  assert.ok(partial.report.missingWeeks.every(week => week.reasonCode === 'before_account'));
  const afterCutoff = await person('2026-09-01T00:00:00.000Z');
  assert.equal(await assemble(afterCutoff), null);
  assert.equal(await assemble(subject, { sourceMonth: '2026-06' }), null);
  assert.equal(await assemble(subject, { maintenanceRulesVersion: 'unconfigured' }), null);
});

test('CAL-18/19: reversal retains its original week and reselects the omitted fifth without rewriting prior reports', async () => {
  for (const item of posts.filter(post => post.week === weeks[1])) {
    const eventId = uuidv7();
    await sql("UPDATE content.posts SET moderation_state = 'blocked' WHERE id = $1", [item.id]);
    await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
      VALUES ($1, 'moderation.content.blocked', 'post', $2, $3, '{}'::jsonb)`, [eventId, item.id, reviewer]);
    await tx(client => recordMonthlyContentEarning(client, { eventId, rulesVersion: weekly.version, evaluatedAt: new Date().toISOString() }));
  }
  const result = await assemble();
  assert.equal(result.revision, 2); assert.notEqual(result.sourceId, firstSource);
  const requested = (await sql("SELECT id FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'trust.monthly_assessment.requested'", [result.sourceId])).rows[0];
  await jobs.queue({ messages: [{ body: { eventId: requested.id, eventType: 'trust.monthly_assessment.requested', payload: {} },
    ack() {}, retry() { assert.fail('Correction must be assessed'); } }] }, env);
  const revised = (await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE source_id = $1', [result.sourceId])).rows[0].calculation;
  assert.equal(revised.sourceScore, 2750); assert.equal(revised.weeks[0].selected, true); assert.equal(revised.weeks[1].state, 'corrected');
  assert.equal((await sql('SELECT source_score FROM trust.monthly_reputation_assessments WHERE source_id = $1', [firstSource])).rows[0].source_score, 3000);
  await assert.rejects(sql('UPDATE trust.monthly_reputation_assemblies SET report = report WHERE source_id = $1', [result.sourceId]), /evidence_is_immutable/);
});

test('SEC-09/CAL-16: credential changes revoke existing proofs while preserving their historical cutoff meaning', async () => {
  await tx(client => client.query('UPDATE identity.email_credentials SET email_lookup_hmac = $2 WHERE user_id = $1', [subject, randomBytes(32)]), 'lythaus_runtime');
  const revocation = (await sql('SELECT * FROM trust.monthly_maintenance_revocations WHERE observation_id = $1', [emailProof.eventId])).rows[0];
  assert.equal(revocation.reason_code, 'email_binding_changed');
  const result = await assemble();
  assert.equal(result.report.maintenance.quarterlyPoints, 1000, 'A later email change cannot rewrite an earlier cutoff');
  assert.deepEqual(result.report.revocationIds, [emailProof.eventId]);
  await tx(client => client.query('UPDATE identity.email_credentials SET verified_at = NULL WHERE user_id = $1', [subject]), 'lythaus_runtime');
  assert.equal((await sql('SELECT count(*)::int n FROM trust.monthly_maintenance_revocations WHERE observation_id = $1', [emailProof.eventId])).rows[0].n, 1);
  const removed = await person(), removedProof = await emailFixture(removed);
  await capture(removedProof);
  await sql('DELETE FROM identity.email_credentials WHERE user_id = $1', [removed]);
  assert.equal((await sql('SELECT reason_code FROM trust.monthly_maintenance_revocations WHERE observation_id = $1', [removedProof.eventId])).rows[0].reason_code, 'credential_removed');
  const unverified = await person(), unverifiedProof = await emailFixture(unverified);
  await capture(unverifiedProof);
  await tx(client => client.query('UPDATE identity.email_credentials SET verified_at = NULL WHERE user_id = $1', [unverified]), 'lythaus_runtime');
  assert.equal((await sql('SELECT reason_code FROM trust.monthly_maintenance_revocations WHERE observation_id = $1', [unverifiedProof.eventId])).rows[0].reason_code, 'verification_revoked');
});

test('REL-02: assembly, immutable source and outbox commit atomically and retry after a crash', async () => {
  const isolated = await person();
  await sql(`CREATE FUNCTION trust.fail_monthly_assembly_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic_assembly_crash'; END; $$;
    CREATE TRIGGER fail_monthly_assembly_fixture BEFORE INSERT ON trust.monthly_reputation_assemblies
      FOR EACH ROW EXECUTE FUNCTION trust.fail_monthly_assembly_fixture()`);
  try { await assert.rejects(assemble(isolated), /synthetic_assembly_crash/); }
  finally { await sql('DROP TRIGGER fail_monthly_assembly_fixture ON trust.monthly_reputation_assemblies'); await sql('DROP FUNCTION trust.fail_monthly_assembly_fixture()'); }
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id = $1', [isolated])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE actor_id = $1', [isolated])).rowCount, 0);
  assert.equal((await assemble(isolated)).created, true); assert.equal((await assemble(isolated)).created, false);
  await sql("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [isolated]);
  assert.equal(await assemble(isolated), null);
});

test('SEC-01/03/16: the real ordinary email verification handler captures evidence without copying secrets', async () => {
  const userId = await person(new Date().toISOString()), tokenId = uuidv7(), token = randomBytes(32).toString('base64url');
  const lookup = randomBytes(32);
  await sql(`INSERT INTO identity.contact_emails (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider)
    VALUES ($1, convert_to('synthetic-encrypted-contact', 'utf8'), $2, 'v1', 'email')`, [userId, lookup]);
  await sql(`INSERT INTO identity.email_credentials
    (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash)
    VALUES ($1, convert_to('synthetic-encrypted-contact', 'utf8'), $2, 'v1', 'v1', '{}'::jsonb)`, [userId, lookup]);
  await sql(`INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at)
    VALUES ($1, $2, decode($3, 'base64'), now() + interval '5 minutes')`, [tokenId, userId, hashAuthToken(token, 'verification')]);
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const apiEnv = { ENVIRONMENT: 'local', EXPECTED_HOSTNAMES: 'api.lythaus.test', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.test',
    DB_APP_FRESH: runtimeBinding, MONTHLY_REPUTATION_MAINTENANCE_RULES: maintenance.version,
    AUTH_PASSWORD_PEPPER_V1: randomBytes(32).toString('base64'), PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
    PII_HMAC_KEY_V1: randomBytes(32).toString('base64'), JWT_KEY_ID: 'synthetic-maintenance', JWT_PRIVATE_KEY: await exportPKCS8(privateKey) };
  const password = 'synthetic monthly verification passphrase';
  const call = () => worker.fetch(new Request('https://api.lythaus.test/api/auth/email/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) }), apiEnv);
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [flag]);
  const response = await call(); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const observed = (await sql('SELECT facts, performed_at FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rows;
  assert.equal(observed.length, 1); assert.deepEqual(observed[0].facts, { kind: 'email_control', emailVersion: tokenId });
  assert.equal((await call()).status, 400);
  assert.equal(JSON.stringify(observed).includes(password), false); assert.equal(JSON.stringify(observed).includes(token), false);
  await tx(client => client.query('UPDATE identity.email_credentials SET email_lookup_hmac = $2 WHERE user_id = $1',
    [userId, randomBytes(32)]), 'lythaus_runtime');
  assert.equal((await sql(`SELECT reason_code FROM trust.monthly_maintenance_revocations WHERE observation_id IN
    (SELECT id FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1)`, [userId])).rows[0].reason_code, 'email_binding_changed');
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  const restored = await tx(client => readMonthlyMaintenanceEvidence(client, userId, '2026-11-01T00:00:00.000Z'));
  assert.equal(restored.evidence.length, 1); assert.notEqual(restored.evidence[0].revokedAt, null);
});

test('RPT-04/REL-02: deletion completes while assembly waits and cannot resurrect private evidence', async () => {
  const userId = await person(); const proof = await emailFixture(userId); await capture(proof);
  const initial = await assemble(userId); assert.equal(initial.created, true);
  const requested = (await sql("SELECT id FROM system.outbox_events WHERE event_type = 'trust.monthly_assessment.requested' AND aggregate_id = $1", [initial.sourceId])).rows[0];
  const assessed = await tx(client => assessMonthlyReputationSource(client, { eventId: requested.id,
    assessmentId: uuidv7(), resultEventId: uuidv7(), evaluatedAt: new Date().toISOString() }));
  const resultEvent = (await sql("SELECT id FROM system.outbox_events WHERE event_type = 'trust.monthly_assessment.recorded' AND aggregate_id = $1", [assessed.id])).rows[0];
  await sql("INSERT INTO system.consumer_inbox (consumer_name, event_id, event_type, payload) VALUES ('synthetic-privacy', $1, 'trust.monthly_assessment.recorded', '{}'::jsonb)", [resultEvent.id]);
  const blocker = new pg.Client({ connectionString, ssl: false }); await blocker.connect();
  await blocker.query('BEGIN');
  await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-reputation:${userId}:2026-08`]);
  const pending = assemble(userId);
  try {
    for (let n = 0; n < 100; n++) {
      const waiting = await sql("SELECT 1 FROM pg_stat_activity WHERE wait_event = 'advisory' AND query LIKE '%pg_advisory_xact_lock%'");
      if (waiting.rowCount) break;
      if (n === 99) assert.fail('Assembly must demonstrably wait before deletion');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await tx(client => client.query("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [userId]), 'lythaus_privacy');
  } finally { await blocker.query('COMMIT'); await blocker.end(); }
  assert.equal(await pending, null);
  for (const table of ['monthly_reputation_sources', 'monthly_reputation_assemblies', 'monthly_maintenance_observations',
    'monthly_earning_contributions', 'monthly_earning_week_revisions', 'monthly_earning_receipts']) {
    assert.equal((await sql(`SELECT 1 FROM trust.${table} WHERE subject_user_id = $1`, [userId])).rowCount, 0);
  }
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_revocations WHERE observation_id = $1', [proof.eventId])).rowCount, 0);
  await assert.rejects(capture(proof), /canonical_email_required/);
  assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE event_type = 'trust.monthly_assessment.requested' AND aggregate_id = $1", [initial.sourceId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE id = $1', [resultEvent.id])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM system.consumer_inbox WHERE event_id = $1', [resultEvent.id])).rowCount, 0);
});

test('RPT-04/REL-02: interrupted assessment cannot append personal events after completed deletion', async () => {
  const userId = await person(), source = await assemble(userId), resultEventId = uuidv7();
  const event = (await sql("SELECT id FROM system.outbox_events WHERE event_type = 'trust.monthly_assessment.requested' AND aggregate_id = $1", [source.sourceId])).rows[0];
  let reached, resume;
  const barrier = new Promise(resolve => { reached = resolve; }), released = new Promise(resolve => { resume = resolve; });
  const pending = tx(client => assessMonthlyReputationSource({ query: async (text, values) => {
    if (text.includes('INSERT INTO trust.monthly_reputation_assessments')) { reached(); await released; }
    return client.query(text, values);
  } }, { eventId: event.id, assessmentId: uuidv7(), resultEventId, evaluatedAt: new Date().toISOString() }));
  await barrier;
  try { await tx(client => client.query("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [userId]), 'lythaus_privacy'); }
  finally { resume(); }
  await assert.rejects(pending, /subject_unavailable/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE id = $1', [resultEventId])).rowCount, 0);
});

test('CAL-09/REL-02: more than fifty canonical events must drain before the month settles', async () => {
  const backlog = await person(), eventIds = [];
  for (let n = 0; n < 55; n++) {
    const postId = uuidv7(), eventId = uuidv7(); eventIds.push(eventId);
    await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, created_at)
      VALUES ($1, $2, $3, 'human', 'public', 'under_review', '2026-08-20T12:00:00.000Z')`, [postId, backlog, `Synthetic paused backlog ${n}`]);
    await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
      VALUES ($1, 'content.post.created', 'post', $2, $3, '{}'::jsonb, '2026-08-20T12:00:00.000Z')`, [eventId, postId, reviewer]);
  }
  await assert.rejects(assemble(backlog), /ingestion_pending/);
  for (const eventId of eventIds.slice(0, 50)) await tx(client => recordMonthlyContentEarning(client,
    { eventId, rulesVersion: weekly.version, evaluatedAt: new Date().toISOString() }));
  await assert.rejects(assemble(backlog), /ingestion_pending/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id = $1', [backlog])).rowCount, 0);
  for (const eventId of eventIds.slice(50)) await tx(client => recordMonthlyContentEarning(client,
    { eventId, rulesVersion: weekly.version, evaluatedAt: new Date().toISOString() }));
  const result = await assemble(backlog);
  assert.equal(result.created, true); assert.equal(result.report.weeks.length, 1);
  assert.equal(result.report.weeks[0].calculation.evidence.length, 55);
});

test('CAL-20/REL-02: scheduled reconciliation discovers months, revisits new evidence and is inert while paused', async () => {
  const first = await reconcileMonthlyAssembly(env); assert.ok(first.processed > 0);
  assert.deepEqual(await reconcileMonthlyAssembly(env), { processed: 0 });
  const before = (await sql('SELECT count(*)::int n FROM trust.monthly_reputation_sources')).rows[0].n;
  await jobs.scheduled({}, env);
  assert.equal((await sql('SELECT count(*)::int n FROM trust.monthly_reputation_sources')).rows[0].n, before);
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [flag]);
  assert.deepEqual(await reconcileMonthlyAssembly(env), { processed: 0 });
  assert.equal(await assemble(), null);
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
});
