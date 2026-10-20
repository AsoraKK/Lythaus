import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { target, repositoryId, runVerifierStats } from '../ci/planetscale-verifier-stats.mjs';

test('PG17 proves authority, attributed grant, fresh visibility, row identity and restricted rollback', { timeout: 60000 }, async () => {
  const configured = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
  assert.equal(configured.protocol, 'postgresql:');
  assert.ok(['127.0.0.1', 'localhost'].includes(configured.hostname));
  assert.equal(configured.pathname, '/lythaus_auth_test_post_control');
  assert.equal(configured.search, '');
  const control = new pg.Client({ connectionString: configured.toString(), ssl: false });
  const database = `lythaus_auth_test_stats_${randomUUID().replaceAll('-', '')}`;
  const local = new URL(configured); local.pathname = '/' + database;
  const clients = [];
  let ownedDatabase = false, ownedRoles = false;
  await control.connect();
  try {
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    assert.equal((await control.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ANY($1::text[])',
      [[target.migrator, target.verifier]])).rows[0].n, 0, 'refuse existing fixture identities');
    await control.query('BEGIN');
    await control.query(`CREATE ROLE "${target.migrator}" NOLOGIN`);
    await control.query(`CREATE ROLE "${target.verifier}" NOLOGIN`);
    await control.query('COMMIT'); ownedRoles = true;
    await control.query(`CREATE DATABASE ${database}`); ownedDatabase = true;
    const setup = new pg.Client({ connectionString: local.toString(), ssl: false });
    await setup.connect();
    try {
      await setup.query(`CREATE SCHEMA media; CREATE SCHEMA system;
        CREATE TABLE media.upload_sessions (id integer);
        CREATE TABLE system.schema_migrations (id integer);
        ALTER TABLE media.upload_sessions OWNER TO "${target.migrator}";
        ALTER TABLE system.schema_migrations OWNER TO "${target.migrator}"`);
    } finally { await setup.end(); }
    await control.query(`GRANT pg_read_all_stats TO "${target.migrator}" WITH INHERIT TRUE`);
    const sourceSha = 'a'.repeat(40);
    const environment = { STATS_OPERATION: 'inspect', RELEASE_SHA: sourceSha, GITHUB_SHA: sourceSha,
      GITHUB_REPOSITORY: 'example/Lythaus', GITHUB_REPOSITORY_ID: repositoryId, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '201',
      GH_TOKEN: 'synthetic', PLANETSCALE_API_TOKEN: 'synthetic:service-token',
      PLANETSCALE_ADMIN_DATABASE_URL: `postgresql://${target.migrator}.${target.branchId}:synthetic@aws.connect.psdb.cloud/postgres?sslmode=verify-full`,
      PLANETSCALE_SCHEMA_READ_DATABASE_URL: `postgresql://${target.verifier}.${target.branchId}:synthetic@aws.connect.psdb.cloud/postgres?sslmode=verify-full` };
    const execute = (overrides = {}, receipt = null) => runVerifierStats({ environment: { ...environment, ...overrides }, receipt,
      fetchImpl: async url => ({ ok: true, json: async () => url.includes('planetscale.com')
        ? { id: target.branchId, name: 'main', kind: 'postgresql', ready: true, production: true }
        : { object: { sha: sourceSha } } }),
      clientFactory: config => {
        const identity = decodeURIComponent(new URL(config.connectionString).username).split('.')[0];
        assert.ok([target.migrator, target.verifier].includes(identity));
        const client = new pg.Client({ connectionString: local.toString(), ssl: false });
        const connect = client.connect.bind(client);
        const query = client.query.bind(client);
        client.connect = async () => { await connect(); await client.query(`SET SESSION AUTHORIZATION "${identity}"`); };
        client.query = async (...args) => {
          const result = await query(...args);
          if (args[0].includes('current_database() AS database_name')) {
            assert.equal(result.rows[0].database_name, database);
            result.rows[0].database_name = 'postgres';
          }
          return result;
        };
        clients.push(client); return client;
      } });
    const denied = await execute();
    assert.equal(denied.status, 'BLOCKED');
    assert.deepEqual(denied.blockers, ['grantor_admin_option_or_superuser_required'], JSON.stringify(denied));
    assert.equal(denied.before.grantorAuthority, false);
    await control.query(`GRANT pg_read_all_stats TO "${target.migrator}" WITH ADMIN OPTION`);
    assert.equal((await execute()).status, 'READY_FOR_APPROVED_GRANT');
    const grant = await execute({ STATS_OPERATION: 'grant' });
    assert.equal(grant.status, 'GRANTED_AND_RECONNECTED', JSON.stringify(grant.blockers));
    assert.equal(grant.introducedGrant.admin_option, false);
    assert.equal(grant.introducedGrant.inherit_option, true);
    assert.equal(grant.introducedGrant.set_option, true);
    assert.ok(/^\d+$/.test(grant.introducedGrant.xmin));
    assert.match(grant.introducedGrant.tuple_id, /^\(\d+,\d+\)$/);
    assert.equal((await execute({ STATS_OPERATION: 'grant' })).status, 'BLOCKED');
    const revoke = await execute({ STATS_OPERATION: 'revoke', GITHUB_RUN_ID: '202',
      GRANT_RUN_ID: '201', VERIFIED_GRANT_RUN_SHA: sourceSha }, grant);
    assert.equal(revoke.status, 'INTRODUCED_GRANT_REVOKED', JSON.stringify(revoke.blockers));
    assert.equal(revoke.verifierAfter.indexProgressVisibility.pgReadAllStatsUsage, false);
    assert.equal((await execute()).status, 'READY_FOR_APPROVED_GRANT');
  } finally {
    for (const client of clients) await client.end().catch(() => {});
    await control.query('ROLLBACK');
    if (ownedDatabase) await control.query(`DROP DATABASE ${database} WITH (FORCE)`);
    if (ownedRoles) {
      await control.query(`DROP ROLE "${target.verifier}"`);
      await control.query(`DROP ROLE "${target.migrator}"`);
    }
    await control.end();
  }
});
