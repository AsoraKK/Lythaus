import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { PUBLIC_PROFILE_SQL, PROBE_PROFILE_SQL, CANONICAL_AUTHORITY_SQL, allTrue, PUBLIC_KEYS, PROBE_KEYS }
  from '../ci/planetscale-migration-role-audit.mjs';
import { SESSION_SQL, OBSERVER_SQL } from '../ci/planetscale-migration-probe.mjs';

test('PostgreSQL17 synthetic ACL, ownership, column, function, SET-path and observer oracle', {
  skip: !process.env.SYNTHETIC_PG_URL,
}, async () => {
  const address = new URL(process.env.SYNTHETIC_PG_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname), 'only a disposable local database is allowed');
  const setup = new pg.Client({ connectionString: address.toString() }); await setup.connect();
  const probeName = 'pscale_api_syntheticprobe', observerName = 'pscale_api_syntheticobserver', migrationName = 'pscale_api_syntheticmigration';
  const fixturePassword = 'synthetic-local-probe-only';
  const apps = ['runtime', 'admin', 'jobs', 'privacy'].map(name => `pscale_api_synthetic${name}`);
  const connect = async name => {
    const url = new URL(address); url.username = name; url.password = fixturePassword;
    const client = new pg.Client({ connectionString: url.toString() }); await client.connect(); return client;
  };
  const publicCheck = async () => (await setup.query(PUBLIC_PROFILE_SQL)).rows[0];
  try {
    assert.match((await setup.query('SHOW server_version')).rows[0].server_version, /^17\./);
    for (const name of [probeName, observerName, migrationName, ...apps]) await setup.query(`CREATE ROLE ${name} LOGIN PASSWORD '${fixturePassword}'`);
    await setup.query(`GRANT postgres TO ${migrationName}`);
    await setup.query(`GRANT pg_read_all_stats TO ${observerName}`);
    await setup.query('CREATE SCHEMA fixture; CREATE TABLE fixture.items(id integer, private text); CREATE TABLE public.fixture_columns(id integer)');
    assert.equal(allTrue(await publicCheck(), PUBLIC_KEYS), true);
    const probe = await connect(probeName);
    try {
      await probe.query('BEGIN READ ONLY');
      assert.equal(allTrue((await probe.query(PROBE_PROFILE_SQL, [probeName])).rows[0], PROBE_KEYS), true);
      await probe.query('ROLLBACK');
    } finally { await probe.end(); }
    await setup.query('GRANT SELECT(id) ON fixture.items TO PUBLIC');
    assert.equal((await publicCheck()).no_public_columns, false);
    await setup.query('REVOKE SELECT(id) ON fixture.items FROM PUBLIC');
    await setup.query('GRANT SELECT ON fixture.items TO PUBLIC');
    assert.equal((await publicCheck()).no_public_relations, false);
    await setup.query('REVOKE SELECT ON fixture.items FROM PUBLIC');
    await setup.query("CREATE FUNCTION public.fixture_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'");
    assert.equal((await publicCheck()).no_public_callable_application_functions, false);
    await setup.query('REVOKE ALL ON FUNCTION public.fixture_definer() FROM PUBLIC');
    await setup.query("CREATE FUNCTION pg_catalog.fixture_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'");
    assert.equal((await publicCheck()).no_public_catalog_escalation, false);
    await setup.query('REVOKE ALL ON FUNCTION pg_catalog.fixture_definer() FROM PUBLIC');
    await setup.query('GRANT SELECT ON pg_catalog.pg_authid TO PUBLIC');
    assert.equal((await publicCheck()).no_public_catalog_escalation, false);
    await setup.query('REVOKE SELECT ON pg_catalog.pg_authid FROM PUBLIC');
    await setup.query('GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO PUBLIC');
    assert.equal((await publicCheck()).no_public_catalog_escalation, false);
    await setup.query('REVOKE EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) FROM PUBLIC');
    await setup.query(`GRANT SELECT ON pg_catalog.pg_authid TO ${probeName}`);
    const extra = await connect(probeName);
    try { assert.equal((await extra.query(PROBE_PROFILE_SQL, [probeName])).rows[0].no_catalog_escalation, false); }
    finally { await extra.end(); }
    await setup.query(`REVOKE SELECT ON pg_catalog.pg_authid FROM ${probeName}`);
    await setup.query(`GRANT SELECT(rolpassword) ON pg_catalog.pg_authid TO ${probeName}`);
    const columnGrant = await connect(probeName);
    try { assert.equal((await columnGrant.query(PROBE_PROFILE_SQL, [probeName])).rows[0].no_catalog_escalation, false); }
    finally { await columnGrant.end(); }
    await setup.query(`REVOKE SELECT(rolpassword) ON pg_catalog.pg_authid FROM ${probeName}`);
    await setup.query('ALTER DEFAULT PRIVILEGES IN SCHEMA fixture GRANT SELECT ON TABLES TO PUBLIC');
    assert.equal((await publicCheck()).no_public_default_grants, false);
    await setup.query('ALTER DEFAULT PRIVILEGES IN SCHEMA fixture REVOKE SELECT ON TABLES FROM PUBLIC');
    const watch = await connect(observerName);
    try {
      await watch.query('BEGIN READ ONLY');
      assert.equal((await watch.query(OBSERVER_SQL, [observerName])).rows[0].visible, true);
      assert.equal((await watch.query(SESSION_SQL, [probeName, observerName])).rows[0].sessions, 0);
      const authority = (await watch.query(CANONICAL_AUTHORITY_SQL, [observerName, migrationName, apps])).rows[0];
      assert.equal(authority.canonical_can_set_owner, true); assert.equal(authority.owner_policy_set, true);
      assert.equal(authority.app_roles_isolated, true); await watch.query('ROLLBACK');
    } finally { await watch.end(); }
    await setup.query(`GRANT ${migrationName} TO ${apps[0]} WITH INHERIT FALSE, SET TRUE`);
    assert.equal((await setup.query(CANONICAL_AUTHORITY_SQL, ['postgres', migrationName, apps])).rows[0].app_roles_isolated, false);
    await setup.query(`GRANT ${apps[1]} TO ${probeName} WITH INHERIT FALSE, SET TRUE`);
    const mapped = await connect(probeName);
    try { assert.equal((await mapped.query(PROBE_PROFILE_SQL, [probeName])).rows[0].no_memberships, false); }
    finally { await mapped.end(); }
  } finally {
    await setup.query('DROP SCHEMA IF EXISTS fixture CASCADE; DROP TABLE IF EXISTS public.fixture_columns; DROP FUNCTION IF EXISTS public.fixture_definer(); DROP FUNCTION IF EXISTS pg_catalog.fixture_definer()');
    for (const name of [probeName, observerName, migrationName, ...apps]) {
      await setup.query(`DROP OWNED BY ${name}`);
      await setup.query(`DROP ROLE IF EXISTS ${name}`);
    }
    await setup.end();
  }
});
