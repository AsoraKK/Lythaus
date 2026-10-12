import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { bindActivityActor, activitySummary } from '../src/activity-measurement.ts';
import { activityPrivacyReadiness } from '../src/activity-measurement-privacy.ts';
import { handleActivityMeasurement, activityAccountScope } from '../../../apps/lythaus-public-api/src/activity-measurement-handler.ts';
import { handleActivityMeasurementSummary } from '../../../apps/lythaus-admin-api/src/activity-measurement-handler.ts';
import { ACTIVITY_NOTICE_VERSION } from '../../contracts/src/activity-measurement.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/lythaus_auth_test_activity_pilot')) throw new Error('Activity tests require the dedicated disposable local PostgreSQL17 fixture');
const ids = [];
const makeId = () => { const id = uuidv7(); ids.push(id); return id; };
const userA = makeId(), userB = makeId(), raceUser = makeId(), owner = makeId();
const env = { DB_APP_FRESH: {}, PII_HMAC_KEY_V1: 'Synthetic activity scope fixture only' };
const proposal = fs.readFileSync(new URL('../../../database/planetscale/proposals/opt-in-activity-measurement.sql', import.meta.url), 'utf8');
const rollback = fs.readFileSync(new URL('../../../database/planetscale/proposals/opt-in-activity-measurement.rollback.sql', import.meta.url), 'utf8');
async function client(role) {
  const value = new pg.Client({ connectionString, ssl: false }); await value.connect();
  await value.query("SET statement_timeout = '5s'");
  if (role) await value.query(`SET ROLE ${role}`);
  return value;
}
async function sql(text, values = [], role) {
  const c = await client(role);
  try { return await c.query(text, values); } finally { await c.end(); }
}
const run = async (_binding, work) => {
  const c = await client('lythaus_runtime');
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (error) { await c.query('ROLLBACK'); throw error; } finally { await c.end(); }
};
async function asActor(subject, text, values = [], role = 'lythaus_runtime', timezone) {
  const c = await client(role);
  try {
    await c.query('BEGIN');
    if (role === 'lythaus_admin') await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    if (timezone) await c.query("SELECT set_config('TimeZone',$1,true)", [timezone]);
    await bindActivityActor(c, subject);
    const result = await c.query(text, values); await c.query('COMMIT'); return result;
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { await c.end(); }
}
const status = async id => (await asActor(id, 'SELECT privacy.activity_measurement_status() AS value')).rows[0].value;
const grant = async id => {
  const current = await status(id);
  return (await asActor(id, 'SELECT privacy.set_activity_measurement_consent($1,true,$2,$3,$4) AS value',
    [uuidv7(), current.revision, current.epoch, ACTIVITY_NOTICE_VERSION])).rows[0].value;
};
const withdraw = async id => {
  const current = await status(id);
  return (await asActor(id, 'SELECT privacy.set_activity_measurement_consent($1,false,$2,$3,$4) AS value',
    [uuidv7(), current.revision, current.epoch, ACTIVITY_NOTICE_VERSION])).rows[0].value;
};
const record = (id, consent, timezone) => asActor(id, 'SELECT privacy.record_activity_measurement_day($1,$2) AS value', [consent.revision, consent.epoch], 'lythaus_runtime', timezone);
const aggregate = async () => activitySummary((await asActor(owner, 'SELECT privacy.activity_measurement_aggregate() AS value', [], 'lythaus_admin')).rows[0].value);
const adminTransaction = async (_binding, work) => {
  const c = await client('lythaus_admin');
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (error) { await c.query('ROLLBACK'); throw error; } finally { await c.end(); }
};
const setFlag = enabled => sql("UPDATE system.feature_flags SET enabled=$1 WHERE flag_key='analytics.account_daily_activity_pilot'", [enabled]);
let currentA, currentB;
let applied = false;

before(async () => {
  const version = (await sql("SELECT current_setting('server_version_num')::integer AS version")).rows[0].version;
  assert.ok(version >= 170000 && version < 180000);
  assert.equal((await sql("SELECT to_regclass('privacy.account_active_days') AS relation")).rows[0].relation, null, 'fixture must start before the proposal');
  await sql(proposal); applied = true;
  const privacy = await client('lythaus_privacy');
  try { assert.equal(await activityPrivacyReadiness(privacy), 'ready'); } finally { await privacy.end(); }
  for (const id of ids) await sql('INSERT INTO identity.users(id,is_production_acceptance) VALUES($1,false)', [id]);
  await sql("INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role,active) VALUES($1,$2,'owner',true)", [owner, randomBytes(32)]);
});

after(async () => {
  if (!applied) return;
  await sql('DELETE FROM system.audit_events WHERE actor_id=$1', [owner]);
  await sql('DELETE FROM privacy.account_active_days WHERE user_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM privacy.activity_measurement_consents WHERE user_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM identity.consent_records WHERE user_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM privacy.subject_data_locations WHERE subject_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM privacy.legal_holds WHERE subject_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM privacy.requests WHERE subject_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM identity.admin_memberships WHERE user_id=ANY($1::uuid[])', [ids]);
  await sql('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [ids]);
  await sql(rollback);
  const privacy = await client('lythaus_privacy');
  try { await assert.rejects(() => activityPrivacyReadiness(privacy), /schema_incomplete/); } finally { await privacy.end(); }
  assert.equal((await sql('SELECT count(*)::integer AS count FROM identity.users WHERE id=ANY($1::uuid[])', [ids])).rows[0].count, 0);
  // Dedicated synthetic database only: all fixture-purpose consent records were
  // removed above; never transfer this marker cleanup into a provider workflow.
  await sql('DROP FUNCTION privacy.activity_measurement_installation_marker()');
});

test('proposal is disabled, cutover unset and zero records are not opt-in', async () => {
  assert.equal((await status(userA)).pilotEnabled, false);
  assert.equal((await status(userA)).granted, false);
  assert.equal((await sql('SELECT cutover_at FROM privacy.activity_measurement_configuration')).rows[0].cutover_at, null);
  await assert.rejects(() => grant(userA), /activity_pilot_disabled/);
  assert.equal((await aggregate()).metrics.dau.reason, 'pilot_disabled');
  assert.equal((await sql('SELECT count(*)::integer AS count FROM identity.consent_records')).rows[0].count, 0);
});

test('legacy anonymous consent does not authorize account-day collection', async () => {
  await sql("INSERT INTO identity.consent_records(id,user_id,purpose,policy_version,granted) VALUES($1,$2,'anonymous_usage','legacy',true)", [uuidv7(), userA]);
  await sql("UPDATE privacy.activity_measurement_configuration SET cutover_at=now()-interval '90 days'");
  await setFlag(true);
  await assert.rejects(() => grant(userA), /activity_pilot_disabled/, 'owner retention approval is a separate disabled activation gate');
  await sql('UPDATE privacy.activity_measurement_configuration SET retention_terms_approved=true');
  await assert.rejects(() => record(userA, { revision: 1, epoch: uuidv7() }), /activity_consent_required/);
  currentA = await grant(userA); currentB = await grant(userB);
  assert.equal(currentA.granted, true);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM identity.consent_records WHERE user_id=$1 AND purpose='anonymous_usage'", [userA])).rows[0].count, 1);
});

test('parallel replay and all app renders dedupe to one canonical UTC day', async () => {
  const responses = await Promise.all(Array.from({ length: 6 }, () => record(userA, currentA)));
  assert.equal(responses.filter(r => r.rows[0].value.inserted).length, 1);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [userA])).rows[0].count, 1);
  const registry = await sql("SELECT last_verified_at FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='privacy.account_active_days'", [userA]);
  await record(userA, currentA);
  assert.deepEqual((await sql("SELECT last_verified_at FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='privacy.account_active_days'", [userA])).rows, registry.rows);
  const timezoneResult = (await record(userA, currentA, 'Pacific/Kiritimati')).rows[0].value;
  assert.equal(timezoneResult.activeDay, new Date().toISOString().slice(0, 10));
  const expiry = (await sql('SELECT expires_at, ((active_day+61)::timestamp AT TIME ZONE \'UTC\') AS expected FROM privacy.account_active_days WHERE user_id=$1', [userA])).rows[0];
  assert.deepEqual(expiry.expires_at, expiry.expected);
});

test('account switch with matching revision is rejected before a real database mutation', async () => {
  const body = { signal: 'foreground_app_render', consentRevision: currentA.revision, consentEpoch: currentA.epoch,
    accountScope: activityAccountScope(userA, env.PII_HMAC_KEY_V1), noticeVersion: ACTIVITY_NOTICE_VERSION };
  const response = await handleActivityMeasurement(new Request('https://lythaus.co/api/analytics/activity', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env, { userId: userB }, run);
  assert.equal(currentA.revision, currentB.revision);
  assert.equal(response.status, 409);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [userB])).rows[0].count, 0);
  await assert.rejects(() => record(userB, currentA), /activity_consent_required/);
});

test('withdrawal clears activity, old epoch cannot replay and regrant restarts coverage', async () => {
  const old = currentA;
  const revoked = await withdraw(userA);
  assert.equal(revoked.granted, false);
  assert.equal(revoked.continuousSince, null);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [userA])).rows[0].count, 0);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference='privacy.account_active_days'", [userA])).rows[0].count, 0);
  await assert.rejects(() => record(userA, old), /activity_consent_required/);
  currentA = await grant(userA);
  assert.notEqual(currentA.epoch, old.epoch);
  await assert.rejects(() => record(userA, old), /activity_consent_required/);
  await record(userA, currentA);
});

test('withdrawal race serializes on the same account lock and cannot recreate a day', async () => {
  const consent = await grant(raceUser);
  const a = await client('lythaus_runtime'), b = await client('lythaus_runtime');
  try {
    await a.query('BEGIN'); await bindActivityActor(a, raceUser);
    await a.query('SELECT privacy.set_activity_measurement_consent($1,false,$2,$3,$4)', [uuidv7(), consent.revision, consent.epoch, ACTIVITY_NOTICE_VERSION]);
    await b.query('BEGIN'); await bindActivityActor(b, raceUser);
    const rejected = assert.rejects(() => b.query('SELECT privacy.record_activity_measurement_day($1,$2)', [consent.revision, consent.epoch]), /activity_consent_required/);
    await a.query('COMMIT'); await rejected; await b.query('ROLLBACK');
  } finally { await a.end(); await b.end(); }
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [raceUser])).rows[0].count, 0);
});

test('disabling collection still permits withdrawal and removes consented dates', async () => {
  await setFlag(false);
  assert.equal((await status(userA)).granted, true);
  await assert.rejects(() => record(userA, currentA), /activity_pilot_disabled/);
  assert.equal((await withdraw(userA)).granted, false);
  await setFlag(true);
});

test('runtime/admin/jobs have no raw account-day access or privacy-export privilege', async () => {
  for (const role of ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs']) {
    await assert.rejects(() => sql('SELECT user_id FROM privacy.account_active_days', [], role), error => error.code === '42501');
    await assert.rejects(() => sql('SELECT privacy.export_activity_measurement($1,$2)', [uuidv7(), userB], role), error => error.code === '42501');
  }
  await assert.rejects(() => sql("INSERT INTO privacy.account_active_days(user_id,active_day,consent_id,expires_at) VALUES($1,current_date,$2,now())", [userB, currentB.epoch], 'lythaus_runtime'), error => error.code === '42501');
  await assert.rejects(() => asActor(userB, 'SELECT privacy.activity_measurement_aggregate()', [], 'lythaus_admin'), /activity_owner_required/);
  await assert.rejects(() => asActor(userB, 'SELECT privacy.activity_measurement_aggregate()'), error => error.code === '42501');
});

test('privacy export/delete verify the authoritative request subject and preserve other purposes', async () => {
  await record(userB, currentB);
  const exportId = uuidv7(), deleteId = uuidv7();
  await sql("INSERT INTO privacy.requests(id,subject_id,request_type,state) VALUES($1,$2,'export','processing'),($3,$2,'delete','processing')", [exportId, userB, deleteId]);
  await assert.rejects(() => sql('SELECT privacy.export_activity_measurement($1,$2)', [exportId, userA], 'lythaus_privacy'), /activity_privacy_request_invalid/);
  const data = (await sql('SELECT privacy.export_activity_measurement($1,$2) AS value', [exportId, userB], 'lythaus_privacy')).rows[0].value;
  assert.deepEqual(data.activeDates, [new Date().toISOString().slice(0, 10)]);
  const hold = uuidv7();
  await sql("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic privacy isolation fixture')", [hold, userB]);
  await assert.rejects(() => sql('SELECT privacy.purge_activity_measurement($1,$2)', [deleteId, userB], 'lythaus_privacy'), /activity_privacy_held/);
  await sql('UPDATE privacy.legal_holds SET active=false WHERE id=$1', [hold]);
  assert.equal((await sql('SELECT privacy.purge_activity_measurement($1,$2) AS count', [deleteId, userB], 'lythaus_privacy')).rows[0].count, 1);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.activity_measurement_consents WHERE user_id=$1', [userB])).rows[0].count, 0);
  assert.equal((await sql("SELECT count(*)::integer AS count FROM identity.consent_records WHERE user_id=$1 AND purpose='anonymous_usage'", [userA])).rows[0].count, 1);
});

test('expiry filters export and bounded physical cleanup leaves unexpired activity untouched', async () => {
  currentA = await grant(userA); await record(userA, currentA);
  for (const days of [61, 62, 63]) await sql(`INSERT INTO privacy.account_active_days(user_id,active_day,consent_id,expires_at)
    SELECT $1,(now() AT TIME ZONE 'UTC')::date-$3::integer,$2,(((now() AT TIME ZONE 'UTC')::date-$3::integer+61)::timestamp AT TIME ZONE 'UTC')`, [userA, currentA.epoch, days]);
  const exportId = uuidv7();
  await sql("INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,'export')", [exportId, userA]);
  assert.equal((await sql('SELECT privacy.export_activity_measurement($1,$2) AS value', [exportId, userA], 'lythaus_privacy')).rows[0].value.activeDates.length, 1);
  assert.equal((await sql('SELECT privacy.expire_activity_measurement(2) AS count', [], 'lythaus_privacy')).rows[0].count, 2);
  assert.equal((await sql('SELECT privacy.expire_activity_measurement(2) AS count', [], 'lythaus_privacy')).rows[0].count, 1);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [userA])).rows[0].count, 1);
  await assert.rejects(() => sql('SELECT privacy.expire_activity_measurement(501)', [], 'lythaus_privacy'), /activity_invalid_batch/);
  await assert.rejects(() => sql(`INSERT INTO privacy.account_active_days(user_id,active_day,consent_id,expires_at)
    VALUES($1,(now() AT TIME ZONE 'UTC')::date-1,$2,now()+interval '62 days')`, [userA, currentA.epoch]), error => error.code === '23514');
});

test('all cleanup paths fence hold activation, preserve held dates and exclude held accounts', async () => {
  const subject = makeId(), holdId = uuidv7(), exportId = uuidv7();
  await sql('INSERT INTO identity.users(id) VALUES($1)', [subject]);
  const consent = await grant(subject); await record(subject, consent);
  await sql(`INSERT INTO privacy.account_active_days(user_id,active_day,consent_id,expires_at)
    SELECT $1,(now() AT TIME ZONE 'UTC')::date-61,$2,((now() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC')`, [subject, consent.epoch]);
  await sql("INSERT INTO privacy.legal_holds(id,subject_id,reason,active) VALUES($1,$2,'Synthetic cleanup hold',false)", [holdId,subject]);
  const activating = await client();
  try {
    await activating.query('BEGIN');
    await activating.query('UPDATE privacy.legal_holds SET active=true WHERE id=$1', [holdId]);
    for (const operation of [() => record(subject,consent), () => withdraw(subject),
      () => sql('SELECT privacy.expire_activity_measurement(500)', [], 'lythaus_privacy')]) {
      await assert.rejects(operation, error => error.code === '55P03');
    }
    assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [subject])).rows[0].count, 2);
    await activating.query('COMMIT');
  } finally { await activating.query('ROLLBACK'); await activating.end(); }
  await assert.rejects(() => record(subject,consent), /activity_privacy_held/);
  assert.equal((await sql('SELECT privacy.expire_activity_measurement(500) AS removed', [], 'lythaus_privacy')).rows[0].removed, 0);
  await sql("UPDATE privacy.activity_measurement_consents SET continuous_since=now()-interval '90 days' WHERE user_id=$1", [subject]);
  const raw = (await asActor(owner, 'SELECT privacy.activity_measurement_aggregate() AS value', [], 'lythaus_admin')).rows[0].value;
  assert.equal(raw.periods['1'].cohortSize, 0, 'the only mature account is held and excluded');
  await sql("INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,'export')", [exportId,subject]);
  const heldExport = (await sql('SELECT privacy.export_activity_measurement($1,$2) AS value', [exportId,subject], 'lythaus_privacy')).rows[0].value;
  assert.equal(heldExport.retentionException, 'legal_hold'); assert.equal(heldExport.activeDates.length, 2);
  assert.equal((await withdraw(subject)).granted, false);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [subject])).rows[0].count, 2);
  await assert.rejects(() => grant(subject), /activity_privacy_held/);
  await sql('UPDATE privacy.legal_holds SET active=false WHERE id=$1', [holdId]);
  assert.equal((await sql('SELECT privacy.expire_activity_measurement(500) AS removed', [], 'lythaus_privacy')).rows[0].removed, 2, 'release also disposes of unexpired withdrawn dates');
  const next = await grant(subject);
  assert.notEqual(next.epoch, consent.epoch);
  assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [subject])).rows[0].count, 0);
});

test('account lock fences a newly inserted legal hold through the canonical subject FK', async () => {
  const subject = makeId(); await sql('INSERT INTO identity.users(id) VALUES($1)', [subject]);
  const locked = await client(), insertion = await client();
  try {
    await locked.query('BEGIN'); await locked.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE', [subject]);
    await insertion.query("SET lock_timeout='100ms'");
    await assert.rejects(() => insertion.query("INSERT INTO privacy.legal_holds(id,subject_id,reason) VALUES($1,$2,'Synthetic FK fence')", [uuidv7(),subject]), error => error.code === '55P03');
  } finally { await locked.query('ROLLBACK'); await locked.end(); await insertion.end(); }
});

test('synthetic metric fixtures cover sealed boundaries, continuous cohorts, missing history and zero', async () => {
  const cases = [[1,90,false,'active'], [7,90,false,'active'], [30,90,false,'active'], [60,90,false,'active'], [61,90,false,'active'], [1,4,false,'active'], [1,90,true,'active'], [1,90,false,'suspended']];
  for (const [dayAge, consentAge, acceptance, statusValue] of cases) {
    const id = makeId(), epoch = uuidv7();
    await sql('INSERT INTO identity.users(id,is_production_acceptance,status) VALUES($1,$2,$3)', [id, acceptance, statusValue]);
    await sql("INSERT INTO identity.consent_records(id,user_id,purpose,policy_version,granted,created_at) VALUES($1,$2,'account_daily_activity',$3,true,now()-($4::integer*interval '1 day'))", [epoch,id,ACTIVITY_NOTICE_VERSION,consentAge]);
    await sql('INSERT INTO privacy.activity_measurement_consents(user_id,consent_id,revision,granted,continuous_since) SELECT $1,$2,1,true,created_at FROM identity.consent_records WHERE id=$2', [id,epoch]);
    await sql(`INSERT INTO privacy.account_active_days(user_id,active_day,consent_id,expires_at)
      SELECT $1,(now() AT TIME ZONE 'UTC')::date-$3::integer,$2,(((now() AT TIME ZONE 'UTC')::date-$3::integer+61)::timestamp AT TIME ZONE 'UTC')`, [id,epoch,dayAge]);
  }
  await sql(`INSERT INTO privacy.activity_measurement_coverage(coverage_day,complete,verified_at)
    SELECT (now() AT TIME ZONE 'UTC')::date-n,true,(((now() AT TIME ZONE 'UTC')::date-n+1)::timestamp AT TIME ZONE 'UTC') FROM generate_series(1,60) n`);
  const measured = await aggregate();
  assert.equal(measured.metrics.dau.value, 2);
  assert.equal(measured.metrics.wau.value, 2);
  assert.equal(measured.metrics.mau.value, 3);
  assert.equal(measured.metrics.quiet.value, 1);
  assert.ok(measured.metrics.dau.cohortSize > measured.metrics.mau.cohortSize);
  const output = process.env.ACTIVITY_PILOT_FIXTURE_OUTPUT;
  if (output) {
    assert.match(output, /^\/(?:workspace|tmp)\/.+\.json$/);
    fs.writeFileSync(output, JSON.stringify({ fixture: 'synthetic_local_pg17_not_production', snapshot: measured }, null, 2) + '\n');
  }
  await sql("DELETE FROM privacy.activity_measurement_coverage WHERE coverage_day=(now() AT TIME ZONE 'UTC')::date-30");
  const missing = await aggregate();
  assert.equal(missing.metrics.mau.value, null);
  assert.equal(missing.metrics.mau.observedLowerBound, 3);
  assert.equal(missing.metrics.quiet.value, null);
  assert.equal(missing.metrics.quiet.observedLowerBound, null);
  await sql("DELETE FROM privacy.account_active_days WHERE active_day=(now() AT TIME ZONE 'UTC')::date-1");
  assert.equal((await aggregate()).metrics.dau.value, 0);
  await sql("DELETE FROM privacy.activity_measurement_coverage WHERE coverage_day=(now() AT TIME ZONE 'UTC')::date-1");
  assert.equal((await aggregate()).metrics.dau.value, null);
  const plan = (await asActor(owner, 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT privacy.activity_measurement_aggregate()', [], 'lythaus_admin')).rows[0]['QUERY PLAN'][0];
  assert.ok(plan['Execution Time'] < 1500);
  console.log(JSON.stringify({ fixture: 'synthetic_local_pg17', aggregateExecutionMs: plan['Execution Time'], accountLimit: 5000, maxRetainedDaysPerAccount: 61 }));
});

test('restricted admin handler commits canonical private audit with non-UUID and repeated correlation', async () => {
  for (const correlation of ['synthetic-readable-correlation', 'synthetic-readable-correlation', uuidv7()]) {
    const response = await handleActivityMeasurementSummary(new Request('https://synthetic.invalid/api/admin/activity-measurement'),
      { DB_ADMIN_FRESH: {} }, { userId: owner, role: 'owner' }, correlation, adminTransaction);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).contractVersion, 'activity-pilot-v1');
  }
  const rows = (await sql("SELECT id,actor_id,correlation_id,metadata FROM system.audit_events WHERE actor_id=$1 AND action='admin.activity_measurement_read'", [owner])).rows;
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  assert.equal(rows.filter(row => row.correlation_id === 'synthetic-readable-correlation').length, 2);
  for (const row of rows) assert.deepEqual(row.metadata, { contractVersion: 'activity-pilot-v1', pilotEnabled: true });
});

test('purge cannot erase data while an existing inactive hold is activating', async () => {
  const subject = makeId(), holdId = uuidv7(), requestId = uuidv7();
  await sql('INSERT INTO identity.users(id) VALUES($1)', [subject]);
  const consent = await grant(subject); await record(subject, consent);
  await sql("INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,'delete')", [requestId, subject]);
  await sql("INSERT INTO privacy.legal_holds(id,subject_id,reason,active) VALUES($1,$2,'Synthetic activating hold',false)", [holdId, subject]);
  const activating = await client();
  try {
    await activating.query('BEGIN'); await activating.query('UPDATE privacy.legal_holds SET active=true WHERE id=$1', [holdId]);
    await assert.rejects(() => sql('SELECT privacy.purge_activity_measurement($1,$2)', [requestId, subject], 'lythaus_privacy'),
      error => error.code === '55P03' || /activity_privacy_held/.test(error.message));
    assert.equal((await sql('SELECT count(*)::integer AS count FROM privacy.account_active_days WHERE user_id=$1', [subject])).rows[0].count, 1);
    await activating.query('COMMIT');
    await assert.rejects(() => sql('SELECT privacy.purge_activity_measurement($1,$2)', [requestId, subject], 'lythaus_privacy'), /activity_privacy_held/);
  } finally { await activating.query('ROLLBACK'); await activating.end(); }
  await sql('UPDATE privacy.legal_holds SET active=false WHERE id=$1', [holdId]);
  assert.equal((await sql('SELECT privacy.purge_activity_measurement($1,$2) AS removed', [requestId, subject], 'lythaus_privacy')).rows[0].removed, 1);
});

test('capacity excess is unavailable, owner revocation is enforced and no raw identities escape', async () => {
  const bulk = Array.from({ length: 5001 }, () => ({ user: makeId(), consent: uuidv7() }));
  for (let offset = 0; offset < bulk.length; offset += 500) {
    const values = JSON.stringify(bulk.slice(offset, offset + 500));
    await sql(`INSERT INTO identity.users(id) SELECT "user"::uuid FROM jsonb_to_recordset($1::jsonb) AS item("user" text,consent text)`, [values]);
    await sql(`INSERT INTO identity.consent_records(id,user_id,purpose,policy_version,granted)
      SELECT consent::uuid,"user"::uuid,'account_daily_activity',$2,true FROM jsonb_to_recordset($1::jsonb) AS item("user" text,consent text)`, [values,ACTIVITY_NOTICE_VERSION]);
    await sql(`INSERT INTO privacy.activity_measurement_consents(user_id,consent_id,revision,granted,continuous_since)
      SELECT "user"::uuid,consent::uuid,1,true,now() FROM jsonb_to_recordset($1::jsonb) AS item("user" text,consent text)`, [values]);
  }
  const result = await aggregate();
  for (const metric of Object.values(result.metrics)) assert.equal(metric.reason, 'snapshot_capacity_exceeded');
  assert.equal(JSON.stringify(result).includes(userA), false);
  await sql('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1', [owner]);
  await assert.rejects(() => aggregate(), /activity_owner_required/);
});
