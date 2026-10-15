import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { uuidv7 } from '../../security/src/index.ts';
import { loadReputationLockCandidate } from './helpers/reputation-lock-candidate.mjs';
import { recordUserActivity } from '../src/activity.ts';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_rep_lock_[a-f0-9]{32}$/);
assert.equal(target.search, ''); assert.equal(target.hash, '');
const proposal = new URL('../../../database/planetscale/proposals/', import.meta.url);
const lockSql = 'SELECT status FROM trust.lock_reputation_subject($1::pg_catalog.uuid)';
let observer, candidate;
const clients = new Set(), pending = new Set(), pauses = new Set();
async function client(role = 'pscale_api_9jfbtij9y4b2', deadlockTimeout) {
  assert.ok(['pscale_api_9jfbtij9y4b2', 'lythaus_jobs', 'lythaus_admin', 'lythaus_privacy', 'lythaus_runtime', 'lythaus_migrations', 'postgres'].includes(role));
  const connection = new pg.Client({ connectionString: target.href, ssl: false });
  await connection.connect(); clients.add(connection);
  if (deadlockTimeout !== undefined) {
    assert.ok(['100ms', '30s'].includes(deadlockTimeout));
    // Local bootstrap privilege only, before switching to the modeled app role.
    await connection.query("SET deadlock_timeout='" + deadlockTimeout + "'");
  }
  await connection.query(`SET SESSION AUTHORIZATION ${role}`);
  await connection.query("SET statement_timeout='8s'; SET lock_timeout='5s'");
  assert.deepEqual((await connection.query('SELECT current_user AS role,session_user AS session_role')).rows[0],
    { role, session_role: role });
  return connection;
}
async function close(connection) {
  if (!clients.has(connection)) return;
  try { await connection.end(); } finally { clients.delete(connection); }
}
function watch(promise) {
  pending.add(promise);
  promise.then(() => pending.delete(promise), () => pending.delete(promise));
  return promise;
}
function transact(connection, work) {
  return watch((async () => {
  await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.equal((await connection.query("SELECT pg_catalog.current_setting('transaction_isolation') AS isolation")).rows[0].isolation, 'read committed');
  try { const result = await work(connection); await connection.query('COMMIT'); return result; }
  catch (error) { await connection.query('ROLLBACK'); throw error; }
  })());
}
async function fixtureTest(parent, name, work) {
  return parent.test(name, async context => {
    try { await work(context); }
    finally {
      for (const release of [...pauses]) release();
      const failures = [];
      await observer.query('ROLLBACK').catch(error => failures.push(error));
      const cancellations = await Promise.allSettled([...clients].map(connection =>
        observer.query('SELECT pg_catalog.pg_cancel_backend($1)', [connection.processID])));
      failures.push(...cancellations.filter(result => result.status === 'rejected'));
      await Promise.allSettled([...pending]);
      const results = await Promise.allSettled([...clients].map(async connection => {
        try { await connection.query('ROLLBACK'); } finally { await close(connection); }
      }));
      await observer.query('ROLLBACK').catch(error => failures.push(error));
      assert.ok(failures.length === 0 && results.every(result => result.status === 'fulfilled'), 'owned fixture cleanup failed');
      assert.equal(clients.size, 0);
    }
  });
}
async function subject() {
  const id = uuidv7();
  await observer.query("INSERT INTO identity.users(id,display_name,created_at) VALUES($1,'Synthetic lock fixture','2025-01-01')", [id]);
  return id;
}
const input = (subjectUserId, signalType = 'email_verified', sourceEventId = uuidv7()) => ({
  id: uuidv7(), subjectUserId, signalType, sourceEventId, occurredAt: '2026-10-13T12:00:00Z',
});
async function snapshot(userId) {
  const results = [];
  for (const [table, column] of [['reputation_events','subject_user_id'], ['reputation_profiles','user_id'], ['reputation_balances','user_id']]) {
    results.push((await observer.query(`SELECT * FROM trust.${table} WHERE ${column}=$1 ORDER BY 1`, [userId])).rows);
  }
  return results;
}
async function activity(connection, userId, sourceEventId) {
  return recordUserActivity(connection, {
    id: uuidv7(), userId, eventType: 'reputation.signal_recorded', category: 'reputation',
    source: 'jobs', sourceEventId, correlationId: sourceEventId,
    title: 'Synthetic reputation delivery', explanation: 'Synthetic isolated deletion and retry fixture.',
    result: 'succeeded', policyVersion: 'synthetic-reputation-lock-v2',
    objectType: 'reputation_profile', objectId: userId, reputationEffect: 'positive',
    appealable: false, retentionClass: 'ordinary', metadata: {}, createdAt: new Date().toISOString(),
  });
}
async function finalPrivacyPurge(connection, userId) {
  // Exact final-stage order from AccountDeleteWorkflow. Earlier outbox/balance
  // scrubbing occurs in a separate Jobs transaction; ledger retention is unchanged.
  await connection.query('DELETE FROM trust.user_activity_events WHERE user_id=$1', [userId]);
  await connection.query('DELETE FROM trust.reputation_profiles WHERE user_id=$1', [userId]);
  await connection.query("UPDATE identity.users SET status='deleted', display_name='[deleted]', deleted_at=COALESCE(deleted_at,now()), updated_at=now() WHERE id=$1", [userId]);
}
async function proposedFinalPrivacyPurge(connection, userId) {
  const subject = await connection.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE', [userId]);
  assert.equal(subject.rowCount, 1);
  await finalPrivacyPurge(connection, userId);
}
async function proposedFinalBalanceCleanup(connection, userId) {
  const subject = await connection.query(lockSql, [userId]);
  if (subject.rows[0]?.status !== 'deleted') throw new Error('privacy_subject_not_terminal');
  await connection.query('DELETE FROM trust.reputation_balances WHERE user_id=$1', [userId]);
}
async function blocked(waiter, holder) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const blockers = (await observer.query('SELECT pg_blocking_pids($1) AS pids', [waiter.processID])).rows[0].pids;
    if (blockers.includes(holder.processID)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('expected row-lock wait was not observed');
}
function pauseAggregate(connection) {
  let reached, release;
  const observed = new Promise(resolve => { reached = resolve; });
  const resumed = new Promise(resolve => { release = resolve; });
  const resume = () => { release(); pauses.delete(resume); };
  pauses.add(resume);
  return { observed, release: resume, client: { async query(text, values) {
    const result = await connection.query(text, values);
    if (text.includes('COALESCE(sum(impact)')) { reached(); await resumed; }
    return result;
  } } };
}
function extract(name, marker) {
  name = name.replace('reputation_subject_lock.sql.', 'reputation_subject_lock.v2.sql.')
    .replace('reputation_subject_lock.verify.', 'reputation_subject_lock.v2.verify.')
    .replace('reputation_subject_lock.rollback.', 'reputation_subject_lock.v2.rollback.');
  const source = readFileSync(new URL(name, proposal), 'utf8');
  assert.ok(source.startsWith('/*') && source.trimEnd().endsWith('*/'));
  return source.split(`BEGIN REPUTATION LOCK ${marker}\n`)[1].split(`END REPUTATION LOCK ${marker}`)[0];
}
before(async () => {
  observer = new pg.Client({ connectionString: target.href, ssl: false }); await observer.connect();
  assert.match((await observer.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  candidate = await loadReputationLockCandidate();
});
after(async () => {
  await Promise.allSettled([...clients].map(connection => connection.end()));
  await observer?.end();
});

test('offline reputation lock approval packet under canonical PG17 roles', async t => {
  await fixtureTest(t, 'fixture models catalog privileges only and exposes its superuser bootstrap limitation', async () => {
    assert.equal((await observer.query('SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user')).rows[0].rolsuper, true);
    assert.equal((await observer.query("SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname='postgres'")).rows[0].rolsuper, false);
    assert.equal((await observer.query("SELECT count(*)::int AS n FROM pg_catalog.pg_auth_members WHERE member='pscale_superuser'::regrole")).rows[0].n, 0);
    // pscale_superuser is an empty synthetic group, not PlanetScale behavior.
    // SET SESSION AUTHORIZATION is test scaffolding, never actual Jobs identity proof.
  });
  await fixtureTest(t, 'runtime fails closed before lock capability installation without ledger writes', async () => {
    const userId = await subject(), jobs = await client();
    await assert.rejects(transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId))), error => error.code === '42883');
    assert.deepEqual(await snapshot(userId), [[], [], []]); await close(jobs);
  });
  await fixtureTest(t, 'advisory locking alone does not exclude an existing account status writer', async () => {
    const userId = await subject(), jobs = await client(), admin = await client('lythaus_admin');
    await jobs.query('BEGIN');
    await jobs.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['reputation:' + userId]);
    assert.equal((await jobs.query('SELECT status FROM identity.users WHERE id=$1', [userId])).rows[0].status, 'active');
    await transact(admin, connection => connection.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [userId]));
    assert.equal((await jobs.query('SELECT status FROM identity.users WHERE id=$1', [userId])).rows[0].status, 'suspended');
    await jobs.query('ROLLBACK'); await close(jobs); await close(admin);
  });
  await fixtureTest(t, 'direct execution of candidate and rollback files is inert', async () => {
    for (const name of ['reputation_subject_lock.sql.proposal', 'reputation_subject_lock.rollback.sql.proposal', 'reputation_subject_lock.verify.sql.proposal',
      'reputation_subject_lock.v2.sql.proposal', 'reputation_subject_lock.v2.verify.sql.proposal', 'reputation_subject_lock.v2.rollback.sql.proposal']) {
      await observer.query(readFileSync(new URL(name, proposal), 'utf8'));
      assert.equal((await observer.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    }
  });
  await fixtureTest(t, 'bounded read-only checks report exact simulated Jobs session without helper or application writes', async () => {
    const jobs = await client(), userId = await subject(), before = await snapshot(userId);
    const results = await jobs.query(extract('reputation_subject_lock.verify.sql.proposal', 'SESSION VERIFICATION'));
    assert.equal(results[1].rows[0].current_user, 'pscale_api_9jfbtij9y4b2');
    assert.equal(results[1].rows[0].session_user, 'pscale_api_9jfbtij9y4b2');
    assert.equal(results[1].rows[0].effective_isolation, 'read committed');
    assert.equal(results[1].rows[0].read_only, 'on');
    assert.equal(results.at(-1).command, 'ROLLBACK');
    assert.deepEqual(await snapshot(userId), before); await close(jobs);
  });
  await fixtureTest(t, 'incoming direct transitive mixed and disabled Jobs memberships fail before installation', async () => {
    const body = extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim()
      .replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '');
    for (const grants of [
      'GRANT pscale_api_9jfbtij9y4b2 TO lythaus_runtime WITH INHERIT TRUE, SET FALSE',
      'GRANT pscale_api_9jfbtij9y4b2 TO lythaus_runtime WITH INHERIT FALSE, SET TRUE',
      'GRANT pscale_api_9jfbtij9y4b2 TO lythaus_admin WITH INHERIT FALSE, SET TRUE; GRANT lythaus_admin TO lythaus_runtime WITH INHERIT FALSE, SET TRUE',
      'GRANT pscale_api_9jfbtij9y4b2 TO lythaus_admin WITH INHERIT TRUE, SET FALSE; GRANT lythaus_admin TO lythaus_runtime WITH INHERIT FALSE, SET TRUE',
      'GRANT pscale_api_9jfbtij9y4b2 TO lythaus_runtime WITH INHERIT FALSE, SET FALSE',
      'GRANT postgres TO lythaus_admin WITH INHERIT TRUE, SET FALSE; GRANT lythaus_admin TO lythaus_runtime WITH INHERIT FALSE, SET TRUE',
    ]) {
      await assert.rejects(transact(observer, async connection => {
        await connection.query(grants); await connection.query('SET LOCAL ROLE postgres');
        await connection.query(body);
      }), /reputation_lock_audience_unverified/);
      assert.equal((await observer.query("SELECT to_regprocedure('trust.lock_reputation_subject(uuid)') AS capability")).rows[0].capability, null);
    }
    // Defect control: original inert v1 preflight admits a reverse membership.
    const original = readFileSync(new URL('reputation_subject_lock.sql.proposal', proposal), 'utf8')
      .split('BEGIN REPUTATION LOCK CANDIDATE\n')[1].split('END REPUTATION LOCK CANDIDATE')[0]
      .trim().replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '');
    await observer.query('BEGIN');
    try {
      await observer.query('GRANT pscale_api_9jfbtij9y4b2 TO lythaus_runtime WITH INHERIT TRUE, SET FALSE');
      await observer.query('SET LOCAL ROLE postgres'); await observer.query(original);
      assert.equal((await observer.query("SELECT has_function_privilege('lythaus_runtime','trust.lock_reputation_subject(uuid)','EXECUTE') AS allowed")).rows[0].allowed, true);
    } finally { await observer.query('ROLLBACK'); }
  });
  await fixtureTest(t, 'delegated owner login is an unresolved approval conflict, never an app-role exception', async () => {
    await observer.query('BEGIN');
    await observer.query('CREATE ROLE lythaus_lock_owner_delegate LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS');
    await observer.query('GRANT postgres TO lythaus_lock_owner_delegate WITH INHERIT FALSE, SET TRUE');
    assert.equal((await observer.query("SELECT pg_has_role('lythaus_lock_owner_delegate','postgres','SET') AS allowed")).rows[0].allowed, true);
    await observer.query('SET LOCAL SESSION AUTHORIZATION lythaus_lock_owner_delegate');
    await observer.query('SET LOCAL ROLE postgres');
    assert.deepEqual((await observer.query('SELECT session_user,current_user')).rows[0], { session_user: 'lythaus_lock_owner_delegate', current_user: 'postgres' });
    const body = extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim().replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '');
    await assert.rejects(observer.query(body), /reputation_lock_audience_unverified/);
    await observer.query('ROLLBACK');
    assert.equal((await observer.query("SELECT count(*)::int AS n FROM pg_catalog.pg_roles WHERE rolname='lythaus_lock_owner_delegate'")).rows[0].n, 0);
    assert.equal((await observer.query("SELECT to_regprocedure('trust.lock_reputation_subject(uuid)') AS function")).rows[0].function, null);
  });
  await fixtureTest(t, 'proposal exposes only the lock capability with an existing non-superuser owner', async () => {
    const deniedOwner = await client('lythaus_migrations');
    await assert.rejects(deniedOwner.query(extract('reputation_subject_lock.sql.proposal', 'CANDIDATE')), /reputation_lock_owner_unverified/);
    await deniedOwner.query('ROLLBACK'); await close(deniedOwner);
    const owner = await client('postgres');
    assert.equal((await observer.query("SELECT to_regprocedure('trust.lock_reputation_subject(uuid)') AS capability")).rows[0].capability, null);
    await owner.query('BEGIN');
    await owner.query('GRANT UPDATE(status) ON identity.users TO pscale_api_9jfbtij9y4b2');
    await assert.rejects(owner.query(extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim()
      .replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '')), /reputation_lock_jobs_privileges_unexpected/);
    await owner.query('ROLLBACK');
    assert.equal((await observer.query("SELECT pg_catalog.has_any_column_privilege('pscale_api_9jfbtij9y4b2','identity.users','UPDATE') AS allowed")).rows[0].allowed, false);
    assert.equal((await observer.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    const ownerAttributes = (await owner.query(`SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,
      pg_catalog.pg_has_role('postgres','pscale_superuser','MEMBER') AS inherited_managed_group
      FROM pg_catalog.pg_roles WHERE rolname='postgres'`)).rows[0];
    assert.deepEqual(ownerAttributes, { rolsuper: false, rolbypassrls: true, rolcreaterole: true,
      rolcreatedb: true, rolinherit: true, inherited_managed_group: true });
    await owner.query('BEGIN');
    await owner.query('ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY');
    await assert.rejects(owner.query(extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim()
      .replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '')), /reputation_lock_owner_unverified/);
    await owner.query('ROLLBACK');
    await owner.query('BEGIN');
    await owner.query('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO lythaus_runtime');
    await assert.rejects(owner.query(extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim()
      .replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '')), /reputation_lock_function_catalog_changed/);
    await owner.query('ROLLBACK');
    const sql = extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim()
      .replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, '');
    const revokeMarker = 'REVOKE ALL ON FUNCTION trust.lock_reputation_subject(pg_catalog.uuid)';
    assert.equal(sql.split(revokeMarker).length, 2);
    await owner.query('BEGIN');
    await owner.query(sql.split(revokeMarker)[0]);
    const initialAcl = await owner.query(`SELECT 1 FROM pg_catalog.pg_proc function_row,
      LATERAL pg_catalog.aclexplode(COALESCE(function_row.proacl,pg_catalog.acldefault('f',function_row.proowner))) acl
      WHERE function_row.oid='trust.lock_reputation_subject(pg_catalog.uuid)'::regprocedure AND acl.grantee=0`);
    assert.equal(initialAcl.rowCount, 1, 'target default PUBLIC execute is reproduced before atomic revoke');
    assert.equal((await observer.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    await owner.query(revokeMarker + sql.split(revokeMarker)[1]);
    const aclRoles = (await owner.query(`SELECT pg_catalog.pg_get_userbyid(acl.grantee) AS role
      FROM pg_catalog.pg_proc function_row,LATERAL pg_catalog.aclexplode(function_row.proacl) acl
      WHERE function_row.oid='trust.lock_reputation_subject(pg_catalog.uuid)'::regprocedure ORDER BY role`)).rows;
    assert.deepEqual(aclRoles, [{ role: 'postgres' }, { role: 'pscale_api_9jfbtij9y4b2' }]);
    await owner.query('COMMIT'); await close(owner);
    const metadata = (await observer.query(`SELECT p.prosecdef,p.provolatile,p.proisstrict,p.proconfig,p.proparallel,p.proleakproof,r.rolname,r.rolsuper,l.lanname
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
      WHERE p.oid='trust.lock_reputation_subject(pg_catalog.uuid)'::regprocedure`)).rows[0];
    assert.deepEqual(metadata, { prosecdef: true, provolatile: 'v', proisstrict: true,
      proconfig: ['search_path=pg_catalog, pg_temp'], proparallel: 'u', proleakproof: false,
      rolname: 'postgres', rolsuper: false, lanname: 'plpgsql' });
    assert.equal((await observer.query("SELECT has_any_column_privilege('pscale_api_9jfbtij9y4b2','identity.users','UPDATE') AS allowed")).rows[0].allowed, false);
    for (const role of ['lythaus_runtime','lythaus_admin','lythaus_privacy','lythaus_jobs','lythaus_migrations']) {
      const denied = await client(role);
      await assert.rejects(denied.query(lockSql, [uuidv7()]), error => error.code === '42501'); await close(denied);
    }
    const publicGrants = await observer.query(`SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) acl
      WHERE p.oid='trust.lock_reputation_subject(uuid)'::regprocedure AND acl.grantee=0`);
    assert.equal(publicGrants.rowCount, 0);
    const jobs = await client(), userId = await subject();
    await assert.rejects(jobs.query('UPDATE identity.users SET status=$1 WHERE id=$2', ['suspended', userId]), error => error.code === '42501');
    await jobs.query('CREATE TEMP TABLE users(id uuid,status text)');
    await jobs.query("INSERT INTO users VALUES($1,'spoofed')", [userId]);
    assert.equal((await jobs.query(lockSql, [userId])).rows[0].status, 'active'); await close(jobs);
  });
  for (const [name, drift] of [
    ['body', "CREATE OR REPLACE FUNCTION trust.lock_reputation_subject(p_subject_id uuid) RETURNS TABLE(status text) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS 'BEGIN RETURN QUERY SELECT ''spoofed''::text; END;'"],
    ['language', "CREATE OR REPLACE FUNCTION trust.lock_reputation_subject(p_subject_id uuid) RETURNS TABLE(status text) LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS 'SELECT status FROM identity.users WHERE id=p_subject_id FOR UPDATE'"],
    ['signature', "DROP FUNCTION trust.lock_reputation_subject(uuid); CREATE FUNCTION trust.lock_reputation_subject(p_subject_id text) RETURNS TABLE(status text) LANGUAGE sql AS 'SELECT ''spoofed''::text'"],
    ['result', 'DROP FUNCTION trust.lock_reputation_subject(uuid); CREATE FUNCTION trust.lock_reputation_subject(p_subject_id uuid) RETURNS TABLE(status uuid) LANGUAGE sql AS $$SELECT p_subject_id$$'],
    ['owner', 'ALTER FUNCTION trust.lock_reputation_subject(uuid) OWNER TO lythaus_admin'],
    ['path', 'ALTER FUNCTION trust.lock_reputation_subject(uuid) SET search_path=public,pg_catalog'],
    ['strictness', 'ALTER FUNCTION trust.lock_reputation_subject(uuid) CALLED ON NULL INPUT'],
    ['PUBLIC ACL', 'GRANT EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) TO PUBLIC'],
    ['missing Jobs ACL', 'REVOKE EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) FROM pscale_api_9jfbtij9y4b2'],
    ['grantor and delegation ACL', 'GRANT EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) TO pscale_api_9jfbtij9y4b2 WITH GRANT OPTION; SET LOCAL ROLE pscale_api_9jfbtij9y4b2; GRANT EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) TO lythaus_jobs; RESET ROLE'],
    ['overload', "CREATE FUNCTION trust.lock_reputation_subject(text) RETURNS text LANGUAGE sql AS $$SELECT 'spoofed'::text$$"],
  ]) await fixtureTest(t, 'fingerprint drift refuses verification and rollback DROP: ' + name, async () => {
    await observer.query('BEGIN'); await observer.query(drift);
    const before = (await observer.query("SELECT oid,prosrc,proowner,proacl::text FROM pg_catalog.pg_proc WHERE proname='lock_reputation_subject' ORDER BY oid")).rows;
    for (const sql of [
      extract('reputation_subject_lock.verify.sql.proposal', 'POSTINSTALL VERIFICATION').trim().replace(/^BEGIN READ ONLY;\n/, '').replace(/ROLLBACK;$/, ''),
      extract('reputation_subject_lock.rollback.sql.proposal', 'ROLLBACK').trim().replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, ''),
    ]) {
      await observer.query('SAVEPOINT fingerprint_probe'); await observer.query('SET LOCAL ROLE postgres');
      await assert.rejects(observer.query(sql), /reputation_lock_function_fingerprint_mismatch/);
      await observer.query('ROLLBACK TO SAVEPOINT fingerprint_probe');
      const after = (await observer.query("SELECT oid,prosrc,proowner,proacl::text FROM pg_catalog.pg_proc WHERE proname='lock_reputation_subject' ORDER BY oid")).rows;
      assert.deepEqual(after, before, 'guard refused before REVOKE or DROP');
    }
    await observer.query('ROLLBACK');
  });
  await fixtureTest(t, 'postcondition rejects PUBLIC explicit delegated and grant-option execution drift atomically', async () => {
    const sql = extract('reputation_subject_lock.sql.proposal', 'CANDIDATE');
    const postcondition = 'DO $audience_postcondition$' + sql.split('DO $audience_postcondition$')[1]
      .split('$audience_postcondition$;')[0] + '$audience_postcondition$;';
    for (const drift of [
      'GRANT EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) TO PUBLIC',
      'GRANT EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) TO lythaus_runtime',
      'GRANT pscale_api_9jfbtij9y4b2 TO lythaus_admin WITH INHERIT TRUE, SET FALSE; GRANT lythaus_admin TO lythaus_runtime WITH INHERIT FALSE, SET TRUE',
      'GRANT EXECUTE ON FUNCTION trust.lock_reputation_subject(uuid) TO pscale_api_9jfbtij9y4b2 WITH GRANT OPTION',
    ]) {
      await assert.rejects(transact(observer, async connection => {
        await connection.query(drift); await connection.query('SET LOCAL ROLE postgres');
        await connection.query(postcondition);
      }), /reputation_lock_execute_audience_unverified/);
      assert.equal((await observer.query("SELECT has_function_privilege('lythaus_runtime','trust.lock_reputation_subject(uuid)','EXECUTE') AS allowed")).rows[0].allowed, false);
    }
  });
  await fixtureTest(t, 'only explicit read committed is supported; other isolation levels fail before locks and writes', async () => {
    const userId = await subject(), holder = await client(), jobs = await client();
    const before = await snapshot(userId);
    await holder.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    assert.equal((await holder.query(lockSql, [userId])).rows[0].status, 'active');
    try {
      for (const level of ['READ UNCOMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']) {
        for (const operation of [connection => connection.query(lockSql, [userId]),
          connection => candidate.recordReputationSignal(connection, input(userId)),
          connection => candidate.refreshReputationProfile(connection, userId)]) {
          await jobs.query(`BEGIN ISOLATION LEVEL ${level}`);
          try {
            assert.equal((await jobs.query("SELECT pg_catalog.current_setting('transaction_isolation') AS isolation")).rows[0].isolation, level.toLowerCase());
            await assert.rejects(operation(jobs), error => error.code === '25000' && error.message === 'reputation_lock_isolation_unsupported');
            assert.deepEqual((await observer.query('SELECT pg_catalog.pg_blocking_pids($1) AS pids', [jobs.processID])).rows[0].pids, []);
          } finally { await jobs.query('ROLLBACK'); }
          assert.deepEqual(await snapshot(userId), before);
        }
      }
    } finally { await holder.query('ROLLBACK'); await close(holder); await close(jobs); }
    const supported = await client();
    assert.equal((await transact(supported, connection => candidate.recordReputationSignal(connection, input(userId)))).event.impact, 5);
    await close(supported);
  });
  await fixtureTest(t, 'malicious caller paths cannot replace definer tables functions or operators or hide isolation', async () => {
    const jobs = await client(), userId = await subject(), other = await subject();
    await observer.query('CREATE SCHEMA lock_attack AUTHORIZATION pscale_api_9jfbtij9y4b2');
    await jobs.query(`CREATE TABLE lock_attack.users(id pg_catalog.uuid,status pg_catalog.text);
      CREATE TEMP TABLE users(id pg_catalog.uuid,status pg_catalog.text);
      CREATE FUNCTION lock_attack.current_setting(pg_catalog.text) RETURNS pg_catalog.text LANGUAGE plpgsql AS $attack$
        BEGIN RAISE EXCEPTION 'malicious_setting_function_executed'; END; $attack$;
      CREATE FUNCTION lock_attack.uuid_equal(pg_catalog.uuid,pg_catalog.uuid) RETURNS pg_catalog.bool LANGUAGE plpgsql AS $attack$
        BEGIN RAISE EXCEPTION 'malicious_uuid_operator_executed'; END; $attack$;
      CREATE OPERATOR lock_attack.= (LEFTARG=pg_catalog.uuid,RIGHTARG=pg_catalog.uuid,PROCEDURE=lock_attack.uuid_equal);
      CREATE FUNCTION lock_attack.lock_reputation_subject(pg_catalog.uuid) RETURNS TABLE(status pg_catalog.text) LANGUAGE sql
        AS $attack$ SELECT 'spoofed_function'::pg_catalog.text $attack$;`);
    await jobs.query("INSERT INTO lock_attack.users VALUES($1,'spoofed_permanent'),($2,'wrong_subject')", [userId, other]);
    await jobs.query("INSERT INTO pg_temp.users VALUES($1,'spoofed_temporary'),($2,'wrong_subject')", [userId, other]);
    await jobs.query('SET search_path=lock_attack,pg_temp,pg_catalog');
    assert.equal((await jobs.query('SELECT status FROM lock_reputation_subject($1::pg_catalog.uuid)', [userId])).rows[0].status, 'spoofed_function');
    await assert.rejects(jobs.query("SELECT current_setting('transaction_isolation'::pg_catalog.text)"), /malicious_setting_function_executed/);
    await assert.rejects(jobs.query('SELECT $1::pg_catalog.uuid = $1::pg_catalog.uuid', [userId]), /malicious_uuid_operator_executed/);
    for (const path of ['lock_attack,pg_temp,pg_catalog', 'pg_temp,lock_attack,pg_catalog', 'lock_attack,pg_catalog,pg_temp']) {
      await jobs.query('SET search_path=' + path);
      const beforePath = (await jobs.query('SHOW search_path')).rows[0].search_path;
      assert.deepEqual((await jobs.query(lockSql, [userId])).rows, [{ status: 'active' }]);
      assert.equal((await jobs.query(lockSql, [uuidv7()])).rowCount, 0);
      assert.equal((await jobs.query('SHOW search_path')).rows[0].search_path, beforePath);
      await jobs.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      try { await assert.rejects(jobs.query(lockSql, [userId]), error => error.code === '25000' && error.message === 'reputation_lock_isolation_unsupported'); }
      finally { await jobs.query('ROLLBACK'); }
      assert.equal((await jobs.query('SHOW search_path')).rows[0].search_path, beforePath);
    }
    assert.deepEqual(await snapshot(userId), [[], [], []]);
    await close(jobs);
  });
  await fixtureTest(t, 'canonical UUID casts ignore caller-owned UUID domains in both patched methods', async () => {
    const jobs = await client();
    await observer.query('CREATE SCHEMA lock_cast_attack AUTHORIZATION pscale_api_9jfbtij9y4b2');
    await observer.query('GRANT USAGE ON SCHEMA lock_cast_attack TO postgres');
    await jobs.query('CREATE DOMAIN lock_cast_attack.uuid AS pg_catalog.uuid CHECK (false)');
    await jobs.query('CREATE TEMP TABLE cast_anchor(id pg_catalog.uuid)');
    await jobs.query('CREATE DOMAIN pg_temp.uuid AS pg_catalog.uuid CHECK (false)');
    for (const path of ['lock_cast_attack,pg_catalog,pg_temp', 'pg_temp,lock_cast_attack,pg_catalog']) {
      const userId = await subject();
      await jobs.query('SET search_path=' + path);
      await assert.rejects(jobs.query('SELECT $1::uuid', [userId]), error => error.code === '23514');
      const signal = await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId)));
      assert.equal(signal.event.impact, 5);
      assert.equal((await transact(jobs, connection => candidate.refreshReputationProfile(connection, userId))).profile.totalScore, 5);
    }
    await close(jobs);
  });
  await fixtureTest(t, 'non-owner roles cannot invoke patched methods and Jobs cannot acquire owner privileges', async () => {
    const userId = await subject(), before = await snapshot(userId);
    for (const role of ['lythaus_runtime', 'lythaus_admin', 'lythaus_privacy']) {
      const denied = await client(role);
      for (const operation of [connection => candidate.recordReputationSignal(connection, input(userId)),
        connection => candidate.refreshReputationProfile(connection, userId)]) {
        await assert.rejects(transact(denied, operation), error => error.code === '42501');
        assert.deepEqual(await snapshot(userId), before);
      }
      await close(denied);
    }
    const jobs = await client();
    await assert.rejects(jobs.query('SET ROLE postgres'), error => error.code === '42501');
    await assert.rejects(jobs.query('ALTER FUNCTION trust.lock_reputation_subject(pg_catalog.uuid) OWNER TO pscale_api_9jfbtij9y4b2'), error => error.code === '42501');
    await assert.rejects(jobs.query('CREATE ROLE unexpected_jobs_role'), error => error.code === '42501');
    await assert.rejects(jobs.query('CREATE DATABASE unexpected_jobs_database'), error => error.code === '42501');
    assert.equal((await jobs.query("SELECT pg_catalog.has_schema_privilege(current_user,'trust','CREATE') AS allowed")).rows[0].allowed, false);
    await close(jobs);
  });
  await fixtureTest(t, 'same subject first-write race serializes one-time quotas and profile aggregates', async () => {
    const userId = await subject(), first = await client(), second = await client();
    await first.query('BEGIN'); const earned = await candidate.recordReputationSignal(first, input(userId));
    const pending = transact(second, connection => candidate.recordReputationSignal(connection, input(userId)));
    await blocked(second, first); await first.query('COMMIT'); const duplicate = await pending;
    assert.equal(earned.event.impact, 5); assert.equal(duplicate.event.impact, 0); assert.equal(duplicate.event.status, 'withheld');
    const [events, profiles, balances] = await snapshot(userId);
    assert.equal(events.length, 2); assert.equal(Number(profiles[0].total_score), 5); assert.equal(Number(balances[0].points), 5);
    await close(first); await close(second);
  });
  await fixtureTest(t, 'same source concurrent replay creates exactly one ledger event', async () => {
    const userId = await subject(), source = uuidv7(), first = await client(), second = await client();
    await first.query('BEGIN'); const original = await candidate.recordReputationSignal(first, input(userId, 'reliable_review', source));
    const pending = transact(second, connection => candidate.recordReputationSignal(connection, input(userId, 'reliable_review', source)));
    await blocked(second, first); await first.query('COMMIT'); const replay = await pending;
    assert.equal(original.created, true); assert.equal(replay.created, false); assert.equal(replay.event.id, original.event.id);
    assert.equal((await snapshot(userId))[0].length, 1); await close(first); await close(second);
  });
  await fixtureTest(t, 'locked refresh excludes a concurrent write and leaves a current aggregate', async () => {
    const userId = await subject(), refresh = await client(), writer = await client();
    await transact(writer, connection => candidate.recordReputationSignal(connection, input(userId, 'reliable_review')));
    await refresh.query('BEGIN');
    const candidatePause = pauseAggregate(refresh);
    const protectedRefresh = watch(candidate.refreshReputationProfile(candidatePause.client, userId));
    await candidatePause.observed;
    const newSignal = transact(writer, connection => candidate.recordReputationSignal(connection, input(userId, 'reliable_review')));
    await blocked(writer, refresh);
    candidatePause.release(); await protectedRefresh; await refresh.query('COMMIT'); await newSignal;
    const [events, profiles, balances] = await snapshot(userId);
    assert.equal(events.reduce((sum, event) => sum + Number(event.impact), 0), 10);
    assert.equal(Number(profiles[0].total_score), 10); assert.equal(Number(balances[0].points), 10);
    await close(refresh); await close(writer);
  });
  await fixtureTest(t, 'different subjects progress independently while daily diminishing is serialized', async () => {
    const userId = await subject(), other = await subject(), first = await client(), second = await client(), independent = await client();
    await first.query('BEGIN'); const one = await candidate.recordReputationSignal(first, input(userId, 'qualifying_human_contribution'));
    const pending = transact(second, connection => candidate.recordReputationSignal(connection, input(userId, 'qualifying_human_contribution')));
    await blocked(second, first);
    assert.equal((await transact(independent, connection => candidate.recordReputationSignal(connection, input(other)))).event.impact, 5);
    await first.query('COMMIT'); const two = await pending;
    assert.equal(one.event.impact, 10); assert.equal(two.event.impact, 5);
    assert.equal(Number((await snapshot(userId))[1][0].total_score), 15);
    await close(first); await close(second); await close(independent);
  });
  await fixtureTest(t, 'committed suspension wins before the locked status read and withholds earning', async () => {
    const userId = await subject(), admin = await client('lythaus_admin'), jobs = await client();
    await admin.query('BEGIN'); await admin.query("UPDATE identity.users SET status='suspended' WHERE id=$1", [userId]);
    const pending = transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId)));
    await blocked(jobs, admin); await admin.query('COMMIT'); const result = await pending;
    assert.equal(result.event.impact, 0); assert.equal(result.event.status, 'withheld'); assert.equal(result.profile.status, 'suspended');
    await close(admin); await close(jobs);
  });
  await fixtureTest(t, 'subject lock excludes later status changes until commit and refresh uses the same lock', async () => {
    const userId = await subject(), jobs = await client(), admin = await client('lythaus_admin');
    await jobs.query('BEGIN'); await candidate.recordReputationSignal(jobs, input(userId));
    const status = transact(admin, connection => connection.query("UPDATE identity.users SET status='locked' WHERE id=$1", [userId]));
    await blocked(admin, jobs); await jobs.query('COMMIT'); await status;
    await admin.query('BEGIN'); await admin.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE', [userId]);
    const pending = transact(jobs, connection => candidate.refreshReputationProfile(connection, userId));
    await blocked(jobs, admin); await admin.query('COMMIT'); assert.equal((await pending).profile.status, 'suspended');
    await close(jobs); await close(admin);
  });
  await fixtureTest(t, 'rollback restores ledger profile balance and an explicitly targeted reversal', async () => {
    const userId = await subject(), jobs = await client();
    const penalty = await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId, 'confirmed_spam')));
    const before = await snapshot(userId);
    await assert.rejects(transact(jobs, async connection => {
      await candidate.recordReputationSignal(connection, { ...input(userId, 'reputation_event_reversal'), reversalReference: penalty.event.id });
      throw new Error('synthetic_after_success_failure');
    }), /synthetic_after_success_failure/);
    assert.deepEqual(await snapshot(userId), before);
    const after = await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId, 'reliable_review')));
    assert.equal(after.event.impact, 5); await close(jobs);
  });
  await fixtureTest(t, 'missing subjects and invalid identifiers never create state or expose another subject', async () => {
    const jobs = await client(), missing = uuidv7();
    await assert.rejects(transact(jobs, connection => candidate.recordReputationSignal(connection, input(missing))), /reputation_subject_not_found/);
    await assert.rejects(transact(jobs, connection => candidate.refreshReputationProfile(connection, missing)), /reputation_subject_not_found/);
    assert.equal((await jobs.query(lockSql, [null])).rowCount, 0);
    await assert.rejects(jobs.query(lockSql, ['invalid']), error => error.code === '22P02');
    assert.deepEqual(await snapshot(missing), [[], [], []]); await close(jobs);
  });
  await fixtureTest(t, 'captured pre-deletion delivery and standing refresh cannot resurrect private state', async () => {
    const userId = await subject(), sourceId = uuidv7(), jobs = await client(), privacy = await client('lythaus_privacy');
    await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId)));
    await observer.query("INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'identity.email.verified','user',$2,$2,$3::jsonb)",
      [sourceId, userId, JSON.stringify({ userId })]);
    // Mirrors processReputationSource: capture canonical source in one transaction,
    // then deliver the already captured subject in a later transaction.
    const captured = await transact(jobs, async connection => (await connection.query(
      'SELECT event_type,actor_id,payload,created_at FROM system.outbox_events WHERE id=$1 AND event_type=$2',
      [sourceId, 'identity.email.verified'])).rows[0]);
    await transact(privacy, connection => connection.query("UPDATE identity.users SET status='locked' WHERE id=$1", [userId]));
    await transact(jobs, async connection => {
      await connection.query('DELETE FROM trust.reputation_balances WHERE user_id=$1', [userId]);
      await connection.query("UPDATE system.outbox_events SET actor_id=NULL,payload='{}'::jsonb WHERE id=$1", [sourceId]);
    });
    await transact(privacy, connection => finalPrivacyPurge(connection, userId));
    assert.equal(captured.payload.userId, userId);
    assert.deepEqual((await observer.query('SELECT actor_id,payload FROM system.outbox_events WHERE id=$1', [sourceId])).rows, [{ actor_id: null, payload: {} }]);
    const before = await snapshot(userId);
    for (const operation of [
      connection => candidate.recordReputationSignal(connection, input(captured.payload.userId, 'email_verified', sourceId)),
      connection => candidate.refreshReputationProfile(connection, userId),
    ]) {
      await assert.rejects(transact(jobs, async connection => {
        await operation(connection); await activity(connection, userId, sourceId);
      }), /reputation_subject_deleted/);
      assert.deepEqual(await snapshot(userId), before);
    }
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.user_activity_events WHERE user_id=$1', [userId])).rows[0].n, 0);
    await close(jobs); await close(privacy);
  });
  await fixtureTest(t, 'activation blocker characterization: pre-tombstone refresh can recreate an earlier-purged balance', async () => {
    const userId = await subject(), jobs = await client(), privacy = await client('lythaus_privacy');
    await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId)));
    await transact(privacy, connection => connection.query("UPDATE identity.users SET status='locked' WHERE id=$1", [userId]));
    await transact(jobs, connection => connection.query('DELETE FROM trust.reputation_balances WHERE user_id=$1', [userId]));
    const refreshed = await transact(jobs, connection => candidate.refreshReputationProfile(connection, userId));
    assert.equal(refreshed.profile.status, 'suspended');
    await transact(privacy, connection => finalPrivacyPurge(connection, userId));
    const after = await snapshot(userId);
    assert.equal(after[1].length, 0);
    assert.equal(after[2].length, 1, 'known unsafe lifecycle interval remains an activation blocker');
    assert.equal(Number(after[2][0].points), 5);
    // Deliberately characterizes the remaining defect, not an acceptance pass.
    // Do not erase retained accounting history or change privacy ordering here.
    await close(jobs); await close(privacy);
  });
  await fixtureTest(t, 'proposed privacy order and final Jobs cleanup serialize deletion without changing ledger retention', async () => {
    const userId = await subject(), jobs = await client(), privacy = await client('lythaus_privacy');
    await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId)));
    await assert.rejects(transact(privacy, connection => connection.query('DELETE FROM trust.reputation_balances WHERE user_id=$1', [userId])), error => error.code === '42501');
    await assert.rejects(transact(jobs, connection => proposedFinalBalanceCleanup(connection, userId)), /privacy_subject_not_terminal/);
    const ledger = (await snapshot(userId))[0];
    await privacy.query('BEGIN'); await proposedFinalPrivacyPurge(privacy, userId);
    const delivering = transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId, 'reliable_review')));
    await blocked(jobs, privacy); await privacy.query('COMMIT');
    await assert.rejects(delivering, error => error instanceof candidate.ReputationSubjectDeletedError);
    // The earlier unsafe balance is removed only through the existing Jobs ACL.
    await transact(jobs, connection => proposedFinalBalanceCleanup(connection, userId));
    await transact(jobs, connection => proposedFinalBalanceCleanup(connection, userId));
    const after = await snapshot(userId);
    assert.deepEqual(after, [ledger, [], []]);
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.user_activity_events WHERE user_id=$1', [userId])).rows[0].n, 0);
  });
  for (const victim of ['jobs', 'privacy']) await fixtureTest(t, 'deterministic real deadlock victim: ' + victim, async () => {
    const userId = await subject();
    const jobs = await client('pscale_api_9jfbtij9y4b2', victim === 'jobs' ? '100ms' : '30s');
    const privacy = await client('lythaus_privacy', victim === 'privacy' ? '100ms' : '30s');
    await transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId)));
    // AccountDeleteWorkflow commits its account lock before the final purge.
    await transact(privacy, connection => connection.query("UPDATE identity.users SET status='locked' WHERE id=$1", [userId]));
    const sourceId = uuidv7(), delivery = input(userId, 'reliable_review', sourceId);
    await privacy.query('BEGIN');
    await privacy.query('DELETE FROM trust.user_activity_events WHERE user_id=$1', [userId]);
    await privacy.query('DELETE FROM trust.reputation_profiles WHERE user_id=$1', [userId]);
    await jobs.query('BEGIN');
    const settle = promise => watch(promise).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
    const startDelivery = () => settle((async () => {
      try {
        const mutation = await candidate.recordReputationSignal(jobs, delivery);
        await activity(jobs, userId, sourceId); await jobs.query('COMMIT'); return mutation;
      } catch (error) { await jobs.query('ROLLBACK'); throw error; }
    })());
    const startDeletion = () => settle((async () => {
      try {
        await privacy.query("UPDATE identity.users SET status='deleted',display_name='[deleted]',deleted_at=now() WHERE id=$1", [userId]);
        await privacy.query('COMMIT');
      } catch (error) { await privacy.query('ROLLBACK'); throw error; }
    })());
    let delivering, deleting;
    // Establish the long-timeout waiter before creating the cycle with the
    // chosen short-timeout detector. Each victim branch must actually execute.
    if (victim === 'jobs') {
      await jobs.query(lockSql, [userId]);
      deleting = startDeletion(); await blocked(privacy, jobs);
      delivering = startDelivery();
    } else {
      delivering = startDelivery(); await blocked(jobs, privacy);
      deleting = startDeletion();
    }
    const [delivered, deleted] = await Promise.all([delivering, deleting]);
    assert.equal(delivered.ok, victim === 'privacy');
    assert.equal(deleted.ok, victim === 'jobs');
    assert.equal((victim === 'jobs' ? delivered : deleted).error.code, '40P01', 'requires real PostgreSQL deadlock, not lock timeout');
    if (victim === 'jobs') {
      // Aborted Jobs transaction wrote neither its ledger event nor its activity.
      assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.reputation_events WHERE source_event_id=$1', [sourceId])).rows[0].n, 0);
      assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.user_activity_events WHERE source_event_id=$1', [sourceId])).rows[0].n, 0);
      await assert.rejects(transact(jobs, connection => candidate.recordReputationSignal(connection, delivery)), /reputation_subject_deleted/);
    } else {
      // Queue redelivery after a committed Jobs winner remains idempotent.
      const replay = await transact(jobs, async connection => {
        const mutation = await candidate.recordReputationSignal(connection, delivery);
        await activity(connection, userId, sourceId); return mutation;
      });
      assert.equal(replay.created, false);
      assert.equal(Number(replay.event.impact), 0, 'locked accounts cannot earn another award');
      assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.reputation_events WHERE source_event_id=$1', [sourceId])).rows[0].n, 1);
      assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.user_activity_events WHERE source_event_id=$1', [sourceId])).rows[0].n, 1);
      await transact(privacy, connection => finalPrivacyPurge(connection, userId));
    }
    const terminal = await snapshot(userId);
    assert.equal(terminal[1].length, 0);
    await assert.rejects(transact(jobs, connection => candidate.refreshReputationProfile(connection, userId)), /reputation_subject_deleted/);
    assert.deepEqual(await snapshot(userId), terminal);
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM trust.user_activity_events WHERE user_id=$1', [userId])).rows[0].n, 0);
    await close(jobs); await close(privacy);
  });
  await fixtureTest(t, 'removing the unapproved function makes the candidate fail before writes', async () => {
    const owner = await client('postgres');
    await owner.query('SET search_path=lock_cast_attack,pg_catalog,pg_temp');
    await assert.rejects(owner.query('SELECT $1::uuid', [await subject()]), error => error.code === '23514');
    const beforePath = (await owner.query('SHOW search_path')).rows[0].search_path;
    const rollback = extract('reputation_subject_lock.rollback.sql.proposal', 'ROLLBACK');
    await owner.query('BEGIN');
    await owner.query(rollback.trim().replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, ''));
    assert.equal((await owner.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    await owner.query('ROLLBACK');
    assert.equal((await owner.query('SHOW search_path')).rows[0].search_path, beforePath);
    const probe = await client();
    assert.equal((await probe.query(lockSql, [await subject()])).rows[0].status, 'active'); await close(probe);
    await owner.query(rollback);
    assert.equal((await owner.query('SHOW search_path')).rows[0].search_path, beforePath);
    assert.equal((await observer.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    await assert.rejects(owner.query(rollback), /reputation_lock_function_fingerprint_mismatch/);
    await owner.query('ROLLBACK');
    await owner.query('BEGIN');
    await owner.query(extract('reputation_subject_lock.sql.proposal', 'CANDIDATE').trim().replace(/^BEGIN;\n/, '').replace(/COMMIT;$/, ''));
    assert.notEqual((await owner.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    await owner.query('ROLLBACK');
    assert.equal((await owner.query('SHOW search_path')).rows[0].search_path, beforePath);
    assert.equal((await observer.query("SELECT pg_catalog.to_regprocedure('trust.lock_reputation_subject(pg_catalog.uuid)') AS capability")).rows[0].capability, null);
    await close(owner);
    const userId = await subject(), jobs = await client();
    await assert.rejects(transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId))), error => error.code === '42883');
    await assert.rejects(transact(jobs, connection => candidate.refreshReputationProfile(connection, userId)), error => error.code === '42883');
    assert.deepEqual(await snapshot(userId), [[], [], []]);
    await assert.rejects(transact(jobs, connection => candidate.recordReputationSignal(connection, input(userId))), error => error.code === '42883');
    assert.equal((await jobs.query("SELECT has_any_column_privilege(current_user,'identity.users','UPDATE') AS allowed")).rows[0].allowed, false);
    await close(jobs);
  });
});
