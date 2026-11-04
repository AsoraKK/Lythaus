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
const owner = 'lythaus_waitlist_invite_function_owner';
const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
let databaseCreated = false;
let ownerCreated = false;
let migrationRoleCreated = false;

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
  const existing = await control.query(`SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])`, [[
    'lythaus_migrations', owner,
  ]]);
  const existingRoles = new Set(existing.rows.map(row => row.rolname));
  if (existingRoles.has(owner)) throw new Error('invite_proposal_function_owner_already_exists');
  if (!existingRoles.has('lythaus_migrations')) {
    await control.query('CREATE ROLE lythaus_migrations NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    migrationRoleCreated = true;
  }
  await control.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  ownerCreated = true;
  await control.query(`GRANT ${owner} TO lythaus_migrations WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
  await control.query(`CREATE DATABASE ${database}`);
  databaseCreated = true;

  const local = new URL(target);
  local.pathname = `/${database}`;
  const localUrl = local.toString();
  process.stdout.write('Invite proposal: fresh owned PostgreSQL 17 database\n');
  await run(['scripts/ci/validate-planetscale-postgres17.mjs'], localUrl);
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
} finally {
  const cleanupErrors = [];
  if (databaseCreated) {
    try { await control.query(`DROP DATABASE ${database} WITH (FORCE)`); }
    catch { cleanupErrors.push('database'); }
  }
  if (ownerCreated) {
    try { await control.query(`REVOKE ${owner} FROM lythaus_migrations`); }
    catch { cleanupErrors.push('function_owner_membership'); }
    try { await control.query(`DROP ROLE ${owner}`); }
    catch { cleanupErrors.push('function_owner_role'); }
  }
  if (migrationRoleCreated) {
    try { await control.query('DROP ROLE lythaus_migrations'); }
    catch { cleanupErrors.push('migration_role'); }
  }
  try { await control.end(); }
  catch { cleanupErrors.push('control_connection'); }
  if (cleanupErrors.length) {
    throw new Error(`invite_proposal_pg17_cleanup_failed:${cleanupErrors.join(',')}`);
  }
}
