import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_rep_lock_[a-f0-9]{32}$/);
assert.equal(target.search, ''); assert.equal(target.hash, '');
const owner = new pg.Client({ connectionString: target.href, ssl: false });
await owner.connect();
try {
  await owner.query('SET SESSION AUTHORIZATION postgres');
  assert.equal((await owner.query('SELECT current_user AS role')).rows[0].role, 'postgres');
  let grants = readFileSync(new URL('../../database/planetscale/grants/roles.sql', import.meta.url), 'utf8');
  grants = grants.replaceAll('lythaus_jobs', 'pscale_api_9jfbtij9y4b2')
    .replace('GRANT CONNECT ON DATABASE postgres TO', 'GRANT CONNECT ON DATABASE ' + target.pathname.slice(1) + ' TO');
  await owner.query(grants);
  // Fixture only: restore the target's reported absence of custom function defaults.
  await owner.query('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC');
  assert.equal((await owner.query("SELECT count(*)::int AS count FROM pg_catalog.pg_default_acl WHERE defaclrole='postgres'::regrole AND defaclobjtype='f'")).rows[0].count, 0);
  const ownership = (await owner.query(`SELECT
    (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='identity.users'::regclass) AS users_owner,
    (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='trust') AS trust_owner,
    (SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AS database_owner`)).rows[0];
  assert.deepEqual(ownership, { users_owner: 'postgres', trust_owner: 'postgres', database_owner: 'postgres' });
  assert.equal((await owner.query("SELECT count(*)::int AS count FROM pg_catalog.pg_auth_members WHERE member='pscale_api_9jfbtij9y4b2'::regrole")).rows[0].count, 0);
  console.log('Synthetic target-role ACL model prepared; ownership unchanged, no custom postgres function defaults.');
} finally { await owner.end(); }
