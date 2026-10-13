import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';

const roleStatements = {
  lythaus_runtime: 'SET ROLE lythaus_runtime',
  lythaus_admin: 'SET ROLE lythaus_admin',
};

export async function createPostgresIsolationDatabase(connectionString) {
  const target = new URL(connectionString ?? 'file:///missing');
  assert.equal(target.protocol, 'postgresql:');
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'isolation tests require loopback PostgreSQL');
  assert.ok(/^\/lythaus_auth_test[a-z0-9_]*$/.test(target.pathname)
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'), 'isolation tests require a disposable database');
  assert.ok([...target.searchParams].every(([key, value]) => key === 'sslmode' && value === 'disable'));
  assert.equal(target.hash, '');
  const ids = { a: uuidv7(), b: uuidv7(), staff: uuidv7(), moderator: uuidv7() };
  const requestIp = '2001:db8:' + ids.a.replaceAll('-', '').slice(-16).match(/.{4}/g).join(':') + '::1';
  const publicRateHash = createHash('sha256').update(`public-api:${requestIp}`).digest('hex');
  const subjects = Object.values(ids);
  const adminHashes = [ids.staff, ids.moderator].map(id => createHash('sha256').update(`admin:${id}`).digest('hex'));
  const clients = new Map();
  const reads = [], roleEvidence = [], databaseErrors = [];
  let sequence = 0;

  async function sql(work, role) {
    const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      await client.query("SET statement_timeout='5s'");
      if (role) {
        assert.ok(Object.hasOwn(roleStatements, role));
        await client.query(roleStatements[role]);
      }
      return await work(client);
    } finally { await client.end(); }
  }

  const version = await sql(async client => (await client.query("SELECT current_setting('server_version_num')::integer AS version")).rows[0].version);
  assert.ok(version >= 170000 && version < 180000, 'isolation tests require PostgreSQL 17');
  await sql(async client => {
    await client.query('BEGIN');
    try {
      for (const [key, id] of Object.entries(ids)) await client.query(
        'INSERT INTO identity.users(id,display_name) VALUES($1,$2)',
        [id, key === 'a' ? 'Synthetic Member A' : key === 'b' ? 'Synthetic Member B' : `Synthetic ${key}`]);
      for (const [id, bio, visible] of [
        [ids.a, 'Private biography for account A.', true],
        [ids.b, 'Private biography for account B.', false],
      ]) await client.query(
        "INSERT INTO social.profiles(user_id,bio,public_visibility,trust_passport_visibility,moderation_state) VALUES($1,$2,$3,'private','allowed')", [id, bio, visible]);
      for (const [id, values] of [[ids.a, [false, true, false, true, true]], [ids.b, [false, false, true, false, false]]]) {
        await client.query(`INSERT INTO feed.notification_preferences
          (user_id,email_enabled,push_enabled,replies_enabled,moderation_enabled,rewards_enabled)
          VALUES($1,$2,$3,$4,$5,$6)`, [id, ...values]);
        await client.query(`INSERT INTO trust.user_activity_events
          (id,user_id,actor_user_id,event_type,category,source,source_event_id,correlation_id,title,
           explanation,result,policy_version,reputation_effect,retention_class,retention_until,created_at)
          VALUES($1,$2,$2,'account.email_verified','account','public_api',$3,$4,$5,
            'Synthetic private account activity fixture.','succeeded','activity-v1','none','security',now()+interval '365 days',now())`,
        [uuidv7(), id, uuidv7(), uuidv7(), id === ids.a ? 'Private event for account A' : 'Private event for account B']);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  });

  async function service(request) {
    const input = await request.json();
    const temporary = !input.transactionId;
    let session = clients.get(input.transactionId);
    let retained = false;
    try {
      assert.ok(['begin', 'query', 'commit', 'rollback'].includes(input.action));
      if (temporary) {
        assert.ok(Object.hasOwn(roleStatements, input.role));
        const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
        session = { client, role: input.role };
        await client.connect();
        await client.query("SET statement_timeout='5s'");
        await client.query(roleStatements[input.role]);
        const identity = (await client.query(`SELECT current_user AS role, rolsuper, rolcreaterole, rolcreatedb
          FROM pg_roles WHERE rolname=current_user`)).rows[0];
        assert.equal(identity.role, input.role);
        assert.equal(identity.rolsuper, false);
        assert.equal(identity.rolcreaterole, false);
        assert.equal(identity.rolcreatedb, false);
        roleEvidence.push(identity);
      }
      assert.ok(session, 'transaction must reference its existing restricted connection');
      if (input.action === 'begin') {
        assert.ok(temporary);
        await session.client.query('BEGIN');
        const transactionId = String(++sequence);
        clients.set(transactionId, session);
        retained = true;
        return Response.json({ transactionId });
      }
      if (input.action === 'query') {
        reads.push({ text: input.text, values: input.values, role: session.role });
        const row = await session.client.query(input.text, input.values);
        return Response.json({ rows: row.rows, rowCount: row.rowCount });
      }
      assert.ok(!temporary);
      await session.client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
      return Response.json({ completed: true });
    } catch (error) {
      databaseErrors.push({ code: error.code ?? 'FIXTURE_ASSERTION', table: error.table, constraint: error.constraint });
      return Response.json({ error: 'isolated_database_query_failed' }, { status: 500 });
    } finally {
      if (!retained && (temporary || ['commit', 'rollback'].includes(input.action))) {
        clients.delete(input.transactionId);
        await session?.client.end();
      }
    }
  }

  return {
    ids, requestIp, publicRateHash, reads, roleEvidence, databaseErrors, service,
    async preferencesFor(id) {
      const row = await sql(async client => (await client.query(`SELECT email_enabled AS "emailEnabled",
        push_enabled AS "pushEnabled",replies_enabled AS "repliesEnabled",moderation_enabled AS "moderationEnabled",
        rewards_enabled AS "rewardsEnabled",updated_at AS "updatedAt" FROM feed.notification_preferences WHERE user_id=$1`, [id])).rows[0], 'lythaus_runtime');
      return JSON.parse(JSON.stringify(row));
    },
    async setMembership(hmac, membership) {
      assert.ok(subjects.includes(membership.user_id));
      assert.ok(['administrator', 'moderator'].includes(membership.role));
      await sql(client => client.query(`INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role)
        VALUES($1,decode($2,'base64'),$3)`, [membership.user_id, hmac, membership.role]));
    },
    async revokeMembership(id) {
      assert.ok(subjects.includes(id));
      await sql(client => client.query('UPDATE identity.admin_memberships SET active=false WHERE user_id=$1', [id]));
    },
    async dispose() {
      await Promise.all([...clients.values()].map(({ client }) => client.end()));
      clients.clear();
      await sql(async client => {
        await client.query('BEGIN');
        try {
          await client.query('DELETE FROM trust.user_activity_events WHERE user_id=ANY($1::uuid[]) OR actor_user_id=ANY($1::uuid[])', [subjects]);
          await client.query('DELETE FROM system.audit_events WHERE actor_id=ANY($1::uuid[])', [subjects]);
          await client.query(`DELETE FROM system.rate_limit_windows WHERE
            (scope='admin-api' AND subject_hash=ANY($1::text[])) OR (scope='public-api' AND subject_hash=$2)`, [adminHashes, publicRateHash]);
          for (const table of ['feed.notification_preferences', 'identity.admin_memberships', 'social.profiles']) {
            await client.query(`DELETE FROM ${table} WHERE user_id=ANY($1::uuid[])`, [subjects]);
          }
          await client.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [subjects]);
          assert.equal((await client.query('SELECT count(*)::integer AS count FROM identity.users WHERE id=ANY($1::uuid[])', [subjects])).rows[0].count, 0);
          assert.equal((await client.query(`SELECT count(*)::integer AS count FROM system.rate_limit_windows WHERE
            (scope='admin-api' AND subject_hash=ANY($1::text[])) OR (scope='public-api' AND subject_hash=$2)`, [adminHashes, publicRateHash])).rows[0].count, 0);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
      });
      process.stdout.write('PG17 isolation cleanup: zero fixture users and rate windows; dependent fixture rows removed.\n');
    },
  };
}
