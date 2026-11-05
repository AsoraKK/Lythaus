import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'invite proposal rehearsal is loopback-only');
assert.equal(target.pathname, '/postgres', 'invite proposal rehearsal requires the local control database');
assert.equal(target.search, '', 'connection options cannot override the local control database');
assert.equal(target.hash, '');

const database = `lythaus_auth_test_invite_${randomUUID().replaceAll('-', '')}`;
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && ['--http-only', '--baseline-only'].includes(args[0])), 'supported options: --http-only, --baseline-only');
const baselineOnly = args[0] === '--baseline-only';
const testFailureInjection = process.env.LYTHAUS_INVITE_PG17_TEST_FAIL_AFTER;
assert.ok(testFailureInjection === undefined || ['roles', 'validation'].includes(testFailureInjection), 'unsupported local fixture failure injection');
const owner = 'lythaus_waitlist_invite_function_owner';
const databaseRoles = ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations'];
const fixtureRoles = [...databaseRoles, owner];
const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
let databaseCreated = false;
const rolesBefore = new Set();
let databaseAclBefore;
const rolesCreatedByFixture = new Set();
let ownerMembershipGranted = false;
let testResult = 'not_started';
let testFailure;

function databaseAclKey(row) {
  return JSON.stringify([row.grantor, row.grantee, row.is_public, row.privilege_type]);
}

async function databaseAclSnapshot(client) {
  const result = await client.query(`
    SELECT grantor_role.rolname AS grantor,
           grantee_role.rolname AS grantee,
           acl_entry.grantee = 0 AS is_public,
           acl_entry.privilege_type,
           acl_entry.is_grantable
      FROM pg_database database_entry
      CROSS JOIN LATERAL aclexplode(COALESCE(database_entry.datacl, acldefault('d', database_entry.datdba))) AS acl_entry
      JOIN pg_roles grantor_role ON grantor_role.oid = acl_entry.grantor
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl_entry.grantee
     WHERE database_entry.datname = 'postgres'
       AND acl_entry.privilege_type IN ('CONNECT', 'CREATE')
     ORDER BY grantor, grantee, acl_entry.privilege_type`);
  return result.rows;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function restoreDatabaseAcl(client, before) {
  const current = await databaseAclSnapshot(client);
  const beforeByKey = new Map(before.map(row => [databaseAclKey(row), row]));

  // The validator's roles.sql changes only CONNECT and CREATE on postgres.
  // Revoke only ACL entries that differ from this run's snapshot, including
  // any dependent grants removed by a future explicit CASCADE in that file.
  for (const row of current) {
    const prior = beforeByKey.get(databaseAclKey(row));
    if (prior && prior.is_grantable === row.is_grantable) continue;
    const grantee = row.is_public ? 'PUBLIC' : quoteIdentifier(row.grantee);
    await client.query(
      `REVOKE ${row.privilege_type} ON DATABASE postgres FROM ${grantee} GRANTED BY ${quoteIdentifier(row.grantor)} CASCADE`,
    );
  }

  const afterRevokes = await databaseAclSnapshot(client);
  const afterRevokeByKey = new Map(afterRevokes.map(row => [databaseAclKey(row), row]));
  for (const row of before) {
    const currentRow = afterRevokeByKey.get(databaseAclKey(row));
    if (currentRow && currentRow.is_grantable === row.is_grantable) continue;
    const grantee = row.is_public ? 'PUBLIC' : quoteIdentifier(row.grantee);
    await client.query(
      `GRANT ${row.privilege_type} ON DATABASE postgres TO ${grantee}${row.is_grantable ? ' WITH GRANT OPTION' : ''} GRANTED BY ${quoteIdentifier(row.grantor)}`,
    );
  }

  const restored = await databaseAclSnapshot(client);
  assert.deepEqual(restored, before, 'control database CONNECT/CREATE ACL must match the pre-run snapshot');
}

async function run(args, connectionString) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: connectionString },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal) throw new Error('invite_proposal_pg17_child_failed');
}

try {
  await control.connect();
  assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  const existing = await control.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])', [fixtureRoles]);
  for (const row of existing.rows) rolesBefore.add(row.rolname);
  databaseAclBefore = await databaseAclSnapshot(control);
  if (rolesBefore.has(owner)) throw new Error('invite_proposal_function_owner_already_exists');
  for (const role of databaseRoles) {
    if (rolesBefore.has(role)) continue;
    if (role === 'lythaus_migrations') {
      await control.query('CREATE ROLE lythaus_migrations NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    } else {
      await control.query(`CREATE ROLE ${role}`);
    }
    // Record ownership only after this process successfully creates the role.
    // The compatibility validator will now see these roles and won't create
    // untracked roles while applying the grant template.
    rolesCreatedByFixture.add(role);
  }
  await control.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  rolesCreatedByFixture.add(owner);
  await control.query(`GRANT ${owner} TO lythaus_migrations WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
  ownerMembershipGranted = true;
  if (testFailureInjection === 'roles') throw new Error('invite_proposal_pg17_test_injected_failure_after_roles');
  await control.query(`CREATE DATABASE ${database}`);
  databaseCreated = true;

  const local = new URL(target);
  local.pathname = `/${database}`;
  const localUrl = local.toString();
  process.stdout.write('Invite proposal: fresh owned PostgreSQL 17 database\n');
  await run(['scripts/ci/validate-planetscale-postgres17.mjs'], localUrl);
  if (testFailureInjection === 'validation') throw new Error('invite_proposal_pg17_test_injected_failure_after_validation');
  if (!baselineOnly) {
    await run(['--experimental-strip-types', '--experimental-test-module-mocks', '--test', '--test-concurrency=1',
      '--test-timeout=180000', 'scripts/tests/alpha-waitlist-invite-proposal.postgres.mjs'], localUrl);
  }
  const authArgs = ['--experimental-strip-types', '--experimental-test-module-mocks', '--test', '--test-concurrency=1',
    '--test-timeout=240000'];
  if (args[0] === '--http-only') authArgs.push('--test-name-pattern=disposable PostgreSQL plus the actual HTTP verification handler');
  if (baselineOnly) process.stdout.write('Baseline-only comparison: proposal remains unapplied\n');
  authArgs.push('apps/lythaus-public-api/tests/auth-journey.postgres.mjs');
  await run(authArgs, localUrl);
  testResult = 'passed';
} catch (error) {
  testResult = 'failed';
  testFailure = error;
}

const cleanupErrors = [];
if (databaseCreated) {
  try { await control.query(`DROP DATABASE ${database} WITH (FORCE)`); }
  catch { cleanupErrors.push('database'); }
}
let rolesAfter = new Set();
try {
  const current = await control.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])', [fixtureRoles]);
  rolesAfter = new Set(current.rows.map(row => row.rolname));
} catch {
  cleanupErrors.push('role_snapshot');
}
if (ownerMembershipGranted && rolesAfter.has(owner) && rolesAfter.has('lythaus_migrations')) {
  try { await control.query(`REVOKE ${owner} FROM lythaus_migrations`); }
  catch { cleanupErrors.push('function_owner_membership'); }
}
if (databaseAclBefore) {
  try { await restoreDatabaseAcl(control, databaseAclBefore); }
  catch { cleanupErrors.push('database_acl'); }
}
for (const role of [...rolesCreatedByFixture].reverse()) {
  if (!rolesAfter.has(role)) continue;
  try { await control.query(`DROP ROLE ${role}`); }
  catch { cleanupErrors.push(`role_${role}`); }
}
try { await control.end(); }
catch { cleanupErrors.push('control_connection'); }

if (testFailure) {
  process.stderr.write(`Invite proposal PG17 result: tests=${testResult} cleanup=${cleanupErrors.length ? `failed:${cleanupErrors.join(',')}` : 'passed'}\n`);
  throw testFailure;
}
if (cleanupErrors.length) {
  process.stderr.write(`Invite proposal PG17 result: tests=${testResult} cleanup=failed:${cleanupErrors.join(',')}\n`);
  throw new Error(`invite_proposal_pg17_cleanup_failed:tests_passed:${cleanupErrors.join(',')}`);
}
process.stdout.write(`Invite proposal PG17 result: tests=${testResult} cleanup=passed\n`);
