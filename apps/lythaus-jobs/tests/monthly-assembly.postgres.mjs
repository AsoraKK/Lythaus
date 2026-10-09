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
import { createMonthlyEmailRenewalChallenge, consumeMonthlyEmailRenewalChallenge } from '../../../packages/db/src/monthly-email-renewal.ts';
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
const jobsBinding = { role: 'lythaus_jobs' }, runtimeBinding = { role: 'lythaus_runtime' }, privacyBinding = { role: 'lythaus_privacy' };
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
const env = { DB_JOBS_FRESH: jobsBinding, DB_PRIVACY_FRESH: privacyBinding, MONTHLY_REPUTATION_SHADOW_RULES: weekly.version, MONTHLY_REPUTATION_MAINTENANCE_RULES: maintenance.version };
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
async function post(week, process = true, author = subject) {
  const id = uuidv7(), event = uuidv7(), caseId = uuidv7(); posts.push({ id, event, week }); cases.push(caseId);
  const performed = `${week}T12:00:00.000Z`;
  await sql(`INSERT INTO content.posts (id, author_id, body, declared_creation_mode, visibility, moderation_state, moderation_source_event_id, created_at)
    VALUES ($1, $2, $3, 'human', 'public', 'allowed', $4, $5)`, [id, author, `Distinct synthetic contribution ${id}`, event, performed]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    VALUES ($1, 'content.post.created', 'post', $2, $3, '{}'::jsonb, $4)`, [event, id, author, performed]);
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
  await sql(readFileSync(new URL('../../../database/planetscale/proposals/monthly_email_renewal.sql', import.meta.url), 'utf8'));
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
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_flag_preserved ON system.feature_flags');
  await sql('DELETE FROM trust.monthly_email_renewal_challenges');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_insert_authority ON trust.monthly_email_renewal_challenges');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_consume_authority ON trust.monthly_email_renewal_challenges');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_challenge_immutable ON trust.monthly_email_renewal_challenges');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_receipt_complete ON trust.monthly_email_renewal_challenges');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_credential_invalidation ON identity.email_credentials');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_subject_erasure ON identity.users');
  await sql('DROP TRIGGER IF EXISTS monthly_email_renewal_outbox_erasure ON trust.monthly_email_renewal_challenges');
  await sql('DROP TABLE IF EXISTS trust.monthly_email_renewal_challenges');
  await sql(`DROP FUNCTION IF EXISTS trust.require_monthly_email_renewal_authority(),
    trust.protect_monthly_email_renewal_challenge(), trust.require_monthly_email_renewal_receipt(),
    trust.revoke_monthly_email_renewal_challenges(), trust.erase_monthly_email_renewal_subject(),
    trust.erase_monthly_email_renewal_outbox(), trust.preserve_monthly_email_renewal_flag()`);
  await sql('DELETE FROM system.feature_flags WHERE flag_key = $1', ['trust.monthly_email_renewal']);
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
  await sql('DROP FUNCTION IF EXISTS trust.redact_monthly_earning_calculation(jsonb)');
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
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE source_event_id = $1', [emailProof.eventId])).rowCount, 0);
  await sql('UPDATE identity.email_credentials SET updated_at = now() WHERE user_id = $1', [subject]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_revocations')).rowCount, 0);
  await sql('INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ($1, true, $2)', [flag, policy]);
  await assert.rejects(sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [flag]), /requires_privacy_teardown/);
  assert.equal(await capture(emailProof, 'unknown'), null);
  assert.equal(await capture(emailProof, 'synthetic-privacy-not-ready'), null);
  assert.equal(await tx(client => loadMonthlyMaintenanceConfiguration(client, 'unknown')), null);
  await assert.rejects(capture({ ...emailProof, eventId: uuidv7() }), /canonical_email_required/);
});

test('SEC-01/REL-03: wrong policy and unavailable monthly schema cannot collect email control', async () => {
  const wrongVersionUser = await person(), wrongVersionProof = await emailFixture(wrongVersionUser);
  await sql('ALTER TABLE system.feature_flags DISABLE TRIGGER monthly_collection_flag_preserved');
  try {
    await sql('UPDATE system.feature_flags SET policy_version = $2 WHERE flag_key = $1', [flag, 'synthetic-unapproved-policy']);
    assert.equal(await capture(wrongVersionProof), null);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE source_event_id = $1', [wrongVersionProof.eventId])).rowCount, 0);
  } finally {
    await sql('UPDATE system.feature_flags SET policy_version = $2 WHERE flag_key = $1', [flag, policy]);
    await sql('ALTER TABLE system.feature_flags ENABLE TRIGGER monthly_collection_flag_preserved');
  }

  for (const table of ['monthly_maintenance_rule_sets', 'monthly_maintenance_observations', 'monthly_maintenance_revocations']) {
    const unavailableUser = await person(), unavailableProof = await emailFixture(unavailableUser);
    await sql(`ALTER TABLE trust.${table} RENAME TO ${table}_unavailable_fixture`);
    try {
      assert.equal(await capture(unavailableProof), null);
    } finally {
      await sql(`ALTER TABLE trust.${table}_unavailable_fixture RENAME TO ${table}`);
    }
    assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE source_event_id = $1', [unavailableProof.eventId])).rowCount, 0);
  }
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

test('SEC-01/03/16: ordinary email verification succeeds with the monthly feature disabled and earns no quarterly points', async () => {
  const userId = await person(), tokenId = uuidv7(), token = randomBytes(32).toString('base64url');
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
  assert.equal(observed.length, 0);
  assert.equal((await call()).status, 400);
  assert.equal(JSON.stringify(observed).includes(password), false); assert.equal(JSON.stringify(observed).includes(token), false);
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  const noAward = await assemble(userId);
  assert.equal(noAward.report.maintenance.quarterlyPoints, 0);
  assert.deepEqual(noAward.report.observationIds, []);
});

test('SEC-01/03/16: enabled current monthly policy captures safe email evidence and revokes it on binding change', async () => {
  const userId = await person(), tokenId = uuidv7(), token = randomBytes(32).toString('base64url');
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
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  assert.deepEqual((await sql('SELECT enabled, policy_version FROM system.feature_flags WHERE flag_key = $1', [flag])).rows[0],
    { enabled: true, policy_version: policy });
  const response = await call(); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const observed = (await sql('SELECT facts, performed_at FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rows;
  assert.equal(observed.length, 1); assert.deepEqual(observed[0].facts, { kind: 'email_control', emailVersion: tokenId });
  assert.equal(JSON.stringify(observed).includes(password), false); assert.equal(JSON.stringify(observed).includes(token), false);
  assert.equal((await call()).status, 400);
  await tx(client => client.query('UPDATE identity.email_credentials SET email_lookup_hmac = $2 WHERE user_id = $1',
    [userId, randomBytes(32)]), 'lythaus_runtime');
  assert.equal((await sql(`SELECT reason_code FROM trust.monthly_maintenance_revocations WHERE observation_id IN
    (SELECT id FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1)`, [userId])).rows[0].reason_code, 'email_binding_changed');
  const evidence = await tx(client => readMonthlyMaintenanceEvidence(client, userId, '2026-11-01T00:00:00.000Z'));
  assert.equal(evidence.evidence.length, 1); assert.notEqual(evidence.evidence[0].revokedAt, null);
  assert.deepEqual(evidence.evidence[0].facts, { kind: 'email_control', emailVersion: tokenId });
});

test('RPT-04/REL-02: deletion completes while assembly waits and cannot resurrect private evidence', async () => {
  const userId = await person(); await post(weeks[1], true, userId);
  const proof = await emailFixture(userId); await capture(proof);
  const initial = await assemble(userId); assert.equal(initial.created, true);
  const acceptedWeekRows = await sql('SELECT points, calculation FROM trust.monthly_earning_week_revisions WHERE subject_user_id = $1 ORDER BY week_start, revision', [userId]);
  assert.ok(acceptedWeekRows.rows.length > 0);
  assert.ok(acceptedWeekRows.rows.some(row => row.points > 0));
  const acceptedPrivateValues = acceptedWeekRows.rows.flatMap(row => row.calculation.evidence ?? [])
    .flatMap(item => [item.id, item.workId, item.sourceRevisionId, item.decisionId, item.contentFingerprint].filter(Boolean));
  assert.ok(acceptedPrivateValues.length > 0);
  assert.ok(acceptedWeekRows.rows.some(row => row.calculation.actions.some(action => action.evidenceIds?.length)));
  const scoreProjection = row => ({ points: row.points, actions: row.calculation.actions.map(({ actionId, points, accepted, pending, withheld }) =>
    ({ actionId, points, accepted, pending, withheld })) });
  const acceptedScoreProjection = acceptedWeekRows.rows.map(scoreProjection);
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
  assert.ok((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id = $1', [userId])).rowCount > 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_assemblies WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_contributions WHERE subject_user_id = $1', [userId])).rowCount, 0);
  const retainedSource = await sql('SELECT input FROM trust.monthly_reputation_sources WHERE subject_user_id = $1', [userId]);
  const retainedAssessment = await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE source_id = $1', [initial.sourceId]);
  for (const value of acceptedPrivateValues) {
    assert.equal(JSON.stringify(retainedSource.rows).includes(value), false);
    assert.equal(JSON.stringify(retainedAssessment.rows).includes(value), false);
  }
  const redactedWeekRows = await sql('SELECT points, calculation FROM trust.monthly_earning_week_revisions WHERE subject_user_id = $1 ORDER BY week_start, revision', [userId]);
  assert.deepEqual(redactedWeekRows.rows.map(scoreProjection), acceptedScoreProjection);
  for (const row of redactedWeekRows.rows) {
    assert.equal(row.calculation.evidenceRedacted, true);
    assert.equal(Object.hasOwn(row.calculation, 'evidence'), false);
    assert.ok(row.calculation.actions.every(action => !Object.hasOwn(action, 'evidenceIds')));
    const retained = JSON.stringify(row.calculation);
    for (const value of acceptedPrivateValues) assert.equal(retained.includes(value), false);
  }
  await assert.rejects(sql('UPDATE trust.monthly_earning_week_revisions SET points = points + 1 WHERE subject_user_id = $1', [userId]),
    /monthly_earning_revision_is_immutable/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_earning_receipts WHERE subject_user_id = $1', [userId])).rowCount, 0);
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
  assert.equal((await sql('SELECT 1 FROM trust.monthly_reputation_sources WHERE id = $1', [source.sourceId])).rowCount, 1);
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

test('SEC-03/CAL-16: renewal challenge creation stays separately gated and idempotent', async () => {
  const userId = await person(), verified = await emailFixture(userId);
  const input = { subjectUserId: userId, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, { ...input, tokenHash: 'not-a-hash' }), 'lythaus_runtime'), /request_invalid/);
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, input), 'lythaus_runtime'), /unavailable/);
  await sql("INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ('trust.monthly_email_renewal', false, $1)", [policy]);
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, input), 'lythaus_runtime'), /unavailable/);
  await sql("UPDATE system.feature_flags SET enabled = true WHERE flag_key = 'trust.monthly_email_renewal'");
  const futureRules = { ...maintenance, version: 'synthetic-renewal-before-collect-from' };
  await sql(`INSERT INTO trust.monthly_maintenance_rule_sets (version, policy_version, catalogue_hash, mode, collect_from, configuration, collection_privacy_version)
    VALUES ($1, $2, $3, 'shadow', '9999-01-01T00:00:00.000Z', $4::jsonb, 'monthly-privacy-v1')`, [futureRules.version, policy, hash, JSON.stringify(futureRules)]);
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client,
    { ...input, rulesVersion: futureRules.version }), 'lythaus_runtime'), /unavailable/);
  await assert.rejects(tx(client => client.query(`INSERT INTO trust.monthly_email_renewal_challenges
    (id, subject_user_id, token_hash, email_binding_digest, rules_version, idempotency_key, request_digest, expires_at, consumed_at, source_event_id)
    SELECT $1, $2, decode($3, 'hex'), public.digest(credential.email_lookup_hmac, 'sha256'), $4, $5, $6,
      clock_timestamp() + interval '30 minutes', clock_timestamp(), $7
      FROM identity.email_credentials credential WHERE credential.user_id = $2`,
    [uuidv7(), userId, randomBytes(32).toString('hex'), maintenance.version, uuidv7(), 'a'.repeat(64), uuidv7()]), 'lythaus_runtime'), /initial_state_invalid/);
  await assert.rejects(tx(client => client.query(`INSERT INTO trust.monthly_email_renewal_challenges
    (id, subject_user_id, token_hash, email_binding_digest, rules_version, idempotency_key, request_digest, expires_at)
    SELECT $1, $2, decode($3, 'hex'), public.digest(credential.email_lookup_hmac, 'sha256'), $4, $5, $6,
      clock_timestamp() + interval '30 minutes'
      FROM identity.email_credentials credential WHERE credential.user_id = $2`,
    [uuidv7(), userId, randomBytes(32).toString('hex'), futureRules.version, uuidv7(), 'b'.repeat(64)]), 'lythaus_runtime'), /unavailable/);
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [flag]);
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, input), 'lythaus_runtime'), /unavailable/);
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [flag]);
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, { ...input, rulesVersion: 'synthetic-privacy-not-ready' }), 'lythaus_runtime'), /unavailable/);

  const created = await tx(client => createMonthlyEmailRenewalChallenge(client, input), 'lythaus_runtime');
  assert.equal(created.created, true); assert.equal(created.challengeId, input.challengeId);
  const remainingMs = Date.parse(created.expiresAt) - Date.now();
  assert.equal(remainingMs <= 31 * 60_000 && remainingMs > 29 * 60_000, true);
  assert.equal(JSON.stringify(created).includes(input.tokenHash), false);
  const replay = await tx(client => createMonthlyEmailRenewalChallenge(client, { ...input, challengeId: uuidv7() }), 'lythaus_runtime');
  assert.equal(replay.created, false); assert.equal(replay.challengeId, created.challengeId);
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, { ...input, tokenHash: randomBytes(32).toString('hex') }), 'lythaus_runtime'), /idempotency_reused/);
  await sql("UPDATE system.feature_flags SET enabled = false WHERE flag_key = 'trust.monthly_email_renewal'");
  await assert.rejects(tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: input.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime'), /unavailable/);
  assert.equal((await sql('SELECT consumed_at FROM trust.monthly_email_renewal_challenges WHERE id = $1', [created.challengeId])).rows[0].consumed_at, null);
  await sql("UPDATE system.feature_flags SET enabled = true WHERE flag_key = 'trust.monthly_email_renewal'");

  const rotated = { ...input, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'), idempotencyKey: uuidv7() };
  const next = await tx(client => createMonthlyEmailRenewalChallenge(client, rotated), 'lythaus_runtime');
  assert.equal(next.created, true);
  assert.equal((await sql('SELECT invalidated_at IS NOT NULL AS invalidated FROM trust.monthly_email_renewal_challenges WHERE id = $1', [created.challengeId])).rows[0].invalidated, true);
  assert.equal((await sql('SELECT email_lookup_hmac IS NOT NULL AND verified_at IS NOT NULL AS intact FROM identity.email_credentials WHERE user_id = $1', [userId])).rows[0].intact, true);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE event_type = \'identity.email.renewed\' AND aggregate_id = $1', [created.challengeId])).rowCount, 0);
  await assert.rejects(sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_email_renewal'"), /requires_privacy_teardown/);
  assert.equal(verified.tokenId.length > 0, true);
});

test('SEC-03/REL-02: concurrent renewal consumption commits one private proof and retries its receipt', async () => {
  const userId = await person(), verified = await emailFixture(userId);
  const before = (await sql('SELECT password_hash, verified_at, email_lookup_hmac FROM identity.email_credentials WHERE user_id = $1', [userId])).rows[0];
  const input = { subjectUserId: userId, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  const issued = await tx(client => createMonthlyEmailRenewalChallenge(client, input), 'lythaus_runtime');
  const results = await Promise.all([1, 2].map(() => tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: input.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime')));
  assert.equal(results.filter(result => result.created).length, 1);
  const first = results.find(result => result.created);
  assert.ok(first); assert.equal(first.challengeId, issued.challengeId);
  assert.equal(results.every(result => result.sourceEventId === first.sourceEventId), true);
  assert.deepEqual(await tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: input.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime'), { ...first, created: false });
  const event = (await sql('SELECT event_type, aggregate_type, aggregate_id, actor_id, payload FROM system.outbox_events WHERE id = $1', [first.sourceEventId])).rows[0];
  assert.equal(event.event_type, 'identity.email.renewed'); assert.equal(event.aggregate_type, 'monthly_email_renewal');
  assert.equal(event.aggregate_id, issued.challengeId); assert.equal(event.actor_id, userId);
  assert.deepEqual(event.payload, { userId, challengeId: issued.challengeId, rulesVersion: maintenance.version });
  assert.equal(JSON.stringify(event.payload).includes(input.tokenHash), false);
  const evidence = await tx(client => readMonthlyMaintenanceEvidence(client, userId, '9999-01-01T00:00:00.000Z'));
  assert.equal(evidence.evidence.length, 1); assert.deepEqual(evidence.evidence[0].facts, { kind: 'email_control', emailVersion: issued.challengeId });
  assert.equal(evidence.evidence[0].id, first.sourceEventId);
  const afterCredential = (await sql('SELECT password_hash, verified_at, email_lookup_hmac FROM identity.email_credentials WHERE user_id = $1', [userId])).rows[0];
  assert.deepEqual(afterCredential, before);
  assert.equal((await sql('SELECT count(*)::int n FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rows[0].n, 1);
  assert.equal((await sql('SELECT count(*)::int n FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = \'identity.email.renewed\'', [issued.challengeId])).rows[0].n, 1);
  assert.equal((await sql('SELECT token_hash FROM trust.monthly_email_renewal_challenges WHERE id = $1', [issued.challengeId])).rows[0].token_hash.toString('hex'), input.tokenHash);
  await sql('DELETE FROM trust.monthly_maintenance_observations WHERE id = $1', [first.sourceEventId]);
  await assert.rejects(tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: input.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime'), /receipt_incomplete/);
  assert.equal(verified.tokenId.length > 0, true);
});

test('SEC-03/CAL-16: renewal fails for changed email binding or expired proof and stays owner-bound', async () => {
  const changed = await person(); await emailFixture(changed);
  const changedInput = { subjectUserId: changed, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await tx(client => createMonthlyEmailRenewalChallenge(client, changedInput), 'lythaus_runtime');
  await tx(client => client.query('UPDATE identity.email_credentials SET email_lookup_hmac = $2 WHERE user_id = $1', [changed, randomBytes(32)]), 'lythaus_runtime');
  assert.equal((await sql('SELECT invalidated_at IS NOT NULL AS invalidated FROM trust.monthly_email_renewal_challenges WHERE id = $1', [changedInput.challengeId])).rows[0].invalidated, true);
  await assert.rejects(tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: changedInput.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime'), /challenge_invalid/);

  const expired = await person(); await emailFixture(expired);
  const expiredInput = { subjectUserId: expired, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await tx(client => createMonthlyEmailRenewalChallenge(client, expiredInput), 'lythaus_runtime');
  await sql('ALTER TABLE trust.monthly_email_renewal_challenges DISABLE TRIGGER monthly_email_renewal_challenge_immutable');
  try {
    await sql(`UPDATE trust.monthly_email_renewal_challenges SET created_at = clock_timestamp() - interval '31 minutes',
      expires_at = clock_timestamp() - interval '1 minute' WHERE id = $1`, [expiredInput.challengeId]);
  } finally { await sql('ALTER TABLE trust.monthly_email_renewal_challenges ENABLE TRIGGER monthly_email_renewal_challenge_immutable'); }
  await assert.rejects(tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: expiredInput.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime'), /challenge_invalid/);
  await assert.rejects(tx(client => client.query(`UPDATE trust.monthly_email_renewal_challenges
    SET consumed_at = '2026-08-15T12:00:00.000Z', source_event_id = $2 WHERE id = $1`,
    [expiredInput.challengeId, uuidv7()]), 'lythaus_runtime'), /challenge_invalid/);
  assert.equal((await sql('SELECT consumed_at FROM trust.monthly_email_renewal_challenges WHERE id = $1', [expiredInput.challengeId])).rows[0].consumed_at, null);

  const owner = await person(), other = await person(); await emailFixture(owner); await emailFixture(other);
  const ownerInput = { subjectUserId: owner, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await tx(client => createMonthlyEmailRenewalChallenge(client, ownerInput), 'lythaus_runtime');
  const ownerBinding = (await sql('SELECT email_binding_digest FROM trust.monthly_email_renewal_challenges WHERE id = $1', [ownerInput.challengeId])).rows[0].email_binding_digest;
  const backdatedEventId = uuidv7(), backdatedAt = '2026-08-15T12:00:00.000Z';
  await assert.rejects(tx(async client => {
    await client.query(`UPDATE trust.monthly_email_renewal_challenges
      SET consumed_at = $2, source_event_id = $3 WHERE id = $1`, [ownerInput.challengeId, backdatedAt, backdatedEventId]);
    await client.query(`INSERT INTO system.outbox_events
      (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
      VALUES ($1, 'identity.email.renewed', 'monthly_email_renewal', $2, $3, $4::jsonb, $5)`,
    [backdatedEventId, ownerInput.challengeId, owner,
      JSON.stringify({ userId: owner, challengeId: ownerInput.challengeId, rulesVersion: maintenance.version }), backdatedAt]);
    await client.query(`INSERT INTO trust.monthly_maintenance_observations
      (id, subject_user_id, source_event_id, kind, performed_at, facts, email_binding_digest)
      VALUES ($1, $2, $1, 'email_control', $3, $4::jsonb, $5)`,
    [backdatedEventId, owner, backdatedAt,
      JSON.stringify({ kind: 'email_control', emailVersion: ownerInput.challengeId }), ownerBinding]);
  }, 'lythaus_runtime'), /receipt_incomplete/);
  assert.equal((await sql('SELECT consumed_at FROM trust.monthly_email_renewal_challenges WHERE id = $1', [ownerInput.challengeId])).rows[0].consumed_at, null);
  assert.equal((await sql('SELECT 1 FROM system.outbox_events WHERE id = $1', [backdatedEventId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE id = $1', [backdatedEventId])).rowCount, 0);
  const ownerReceipt = await tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: ownerInput.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime');
  assert.equal((await sql('SELECT subject_user_id FROM trust.monthly_maintenance_observations WHERE id = $1', [ownerReceipt.sourceEventId])).rows[0].subject_user_id, owner);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [other])).rowCount, 0);
  const otherInput = { subjectUserId: other, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await tx(client => createMonthlyEmailRenewalChallenge(client, otherInput), 'lythaus_runtime');
  await sql("UPDATE system.feature_flags SET enabled = false WHERE flag_key = 'trust.monthly_email_renewal'");
  await sql('UPDATE identity.email_credentials SET email_lookup_hmac = $2 WHERE user_id = $1', [other, randomBytes(32)]);
  assert.equal((await sql('SELECT invalidated_at IS NOT NULL AS invalidated FROM trust.monthly_email_renewal_challenges WHERE id = $1', [otherInput.challengeId])).rows[0].invalidated, true);
  await sql("UPDATE system.feature_flags SET enabled = true WHERE flag_key = 'trust.monthly_email_renewal'");
  const deleted = await person(); await emailFixture(deleted);
  const deletionInput = { subjectUserId: deleted, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await tx(client => createMonthlyEmailRenewalChallenge(client, deletionInput), 'lythaus_runtime');
  await sql("UPDATE system.feature_flags SET enabled = false WHERE flag_key = 'trust.monthly_email_renewal'");
  await sql("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [deleted]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_email_renewal_challenges WHERE id = $1', [deletionInput.challengeId])).rowCount, 0);
  await sql("UPDATE system.feature_flags SET enabled = true WHERE flag_key = 'trust.monthly_email_renewal'");
  await assert.rejects(tx(client => createMonthlyEmailRenewalChallenge(client, { ...ownerInput,
    subjectUserId: other, challengeId: uuidv7(), idempotencyKey: uuidv7() }), 'lythaus_runtime'), /duplicate key/);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_email_renewal_challenges WHERE subject_user_id = $1 AND token_hash = decode($2, \'hex\')', [other, ownerInput.tokenHash])).rowCount, 0);
});

test('SEC-03/RPT-04/REL-02: renewal transaction rollback and subject erasure clear private receipts', async () => {
  const userId = await person(); await emailFixture(userId);
  const input = { subjectUserId: userId, challengeId: uuidv7(), tokenHash: randomBytes(32).toString('hex'),
    idempotencyKey: uuidv7(), rulesVersion: maintenance.version };
  await tx(client => createMonthlyEmailRenewalChallenge(client, input), 'lythaus_runtime');
  await sql(`CREATE FUNCTION trust.fail_monthly_email_renewal_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.event_type = 'identity.email.renewed' THEN RAISE EXCEPTION 'synthetic_email_renewal_crash'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER fail_monthly_email_renewal_fixture BEFORE INSERT ON system.outbox_events
      FOR EACH ROW EXECUTE FUNCTION trust.fail_monthly_email_renewal_fixture()`);
  try {
    await assert.rejects(tx(client => consumeMonthlyEmailRenewalChallenge(client,
      { tokenHash: input.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime'), /synthetic_email_renewal_crash/);
  } finally {
    await sql('DROP TRIGGER fail_monthly_email_renewal_fixture ON system.outbox_events');
    await sql('DROP FUNCTION trust.fail_monthly_email_renewal_fixture()');
  }
  assert.equal((await sql('SELECT consumed_at FROM trust.monthly_email_renewal_challenges WHERE id = $1', [input.challengeId])).rows[0].consumed_at, null);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rowCount, 0);
  const consumed = await tx(client => consumeMonthlyEmailRenewalChallenge(client,
    { tokenHash: input.tokenHash, sourceEventId: uuidv7() }), 'lythaus_runtime');
  assert.equal(consumed.created, true);
  await sql("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [userId]);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_email_renewal_challenges WHERE id = $1', [input.challengeId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM trust.monthly_maintenance_observations WHERE subject_user_id = $1', [userId])).rowCount, 0);
  assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE event_type = 'identity.email.renewed' AND aggregate_id = $1", [input.challengeId])).rowCount, 0);
  assert.equal((await sql('SELECT 1 FROM system.consumer_inbox WHERE event_id = $1', [consumed.sourceEventId])).rowCount, 0);
});

test('SEC-09/RPT-04: ordinary auth lifecycle skips the optional renewal table without its policy marker', async () => {
  await sql('DELETE FROM trust.monthly_email_renewal_challenges');
  await sql("DELETE FROM system.feature_flags WHERE flag_key = 'trust.monthly_email_renewal'");
  await sql('ALTER TABLE trust.monthly_email_renewal_challenges RENAME TO monthly_email_renewal_challenges_absent_marker_fixture');
  try {
    const changed = await person(); await emailFixture(changed);
    await sql('UPDATE identity.email_credentials SET email_lookup_hmac = $2 WHERE user_id = $1', [changed, randomBytes(32)]);
    assert.equal((await sql('SELECT 1 FROM identity.email_credentials WHERE user_id = $1', [changed])).rowCount, 1);

    const deleted = await person(); await emailFixture(deleted);
    await sql("UPDATE identity.users SET status = 'deleted', deleted_at = now() WHERE id = $1", [deleted]);
    assert.equal((await sql('SELECT status FROM identity.users WHERE id = $1', [deleted])).rows[0].status, 'deleted');
  } finally {
    await sql('ALTER TABLE trust.monthly_email_renewal_challenges_absent_marker_fixture RENAME TO monthly_email_renewal_challenges');
  }
});
