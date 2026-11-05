import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'invite cleanup regression requires loopback PostgreSQL');
assert.equal(target.pathname, '/postgres', 'invite cleanup regression requires the disposable control database');
assert.equal(target.search, '', 'connection options cannot override the loopback target');
assert.equal(target.hash, '');

const owner = 'lythaus_waitlist_invite_function_owner';
const databaseRoles = ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations'];
const fixtureRoles = [...databaseRoles, owner];
const inviteDatabasePrefix = 'lythaus_auth_test_invite_';
const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
const runnerPath = 'scripts/ci/run-alpha-waitlist-invite-proposal-pg17.mjs';
let connected = false;

async function snapshotAcl() {
  const result = await control.query(`
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

async function snapshotState() {
  const roles = await control.query(`SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
                                       FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`, [fixtureRoles]);
  const memberships = await control.query(`SELECT grantor_role.rolname AS grantor, role_role.rolname AS role_name,
                                                  member_role.rolname AS member_name, membership.admin_option,
                                                  membership.inherit_option, membership.set_option
                                             FROM pg_auth_members membership
                                             JOIN pg_roles grantor_role ON grantor_role.oid = membership.grantor
                                             JOIN pg_roles role_role ON role_role.oid = membership.roleid
                                             JOIN pg_roles member_role ON member_role.oid = membership.member
                                            WHERE role_role.rolname = 'lythaus_migrations'
                                              AND member_role.rolname = 'lythaus_waitlist_invite_function_owner'
                                            ORDER BY grantor, role_name, member_name`);
  const databases = await control.query(`SELECT datname FROM pg_database
                                          WHERE left(datname, length($1)) = $1 ORDER BY datname`, [inviteDatabasePrefix]);
  const acl = await snapshotAcl();
  return {
    roles: roles.rows,
    membership: memberships.rows,
    inviteDatabases: databases.rows.map(row => row.datname),
    acl,
  };
}

function sanitizedTail(value) {
  return value.replace(/postgresql:\/\/[^\s]+/g, '[loopback database URL]').slice(-6000);
}

async function runRunner(label, args = [], testFailureAfter) {
  const output = { stdout: '', stderr: '' };
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PLANETSCALE_PG17_TEST_DATABASE_URL: target.toString(),
        ...(testFailureAfter ? { LYTHAUS_INVITE_PG17_TEST_FAIL_AFTER: testFailureAfter } : {}),
      },
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
    for (const [stream, key] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.setEncoding('utf8');
      stream.on('data', chunk => { output[key] = (output[key] + chunk).slice(-12000); });
    }
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  return { label, ...result, output: sanitizedTail(`${output.stdout}\n${output.stderr}`) };
}

function assertRunnerResult(result, expectedCode, marker) {
  assert.equal(result.signal, null, `${result.label} runner was signalled: ${result.output}`);
  assert.equal(result.code, expectedCode, `${result.label} runner returned an unexpected status: ${result.output}`);
  assert.ok(result.output.includes(marker), `${result.label} runner omitted ${marker}: ${result.output}`);
}

async function createFixtureRoles() {
  for (const role of databaseRoles) {
    await control.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  }
}

async function compareState(label, before) {
  assert.deepEqual(await snapshotState(), before, `${label} must leave fixture roles, membership, databases and database ACLs unchanged`);
}

let initialState;
let namespaceOwned = false;
try {
  await control.connect();
  connected = true;
  const version = Number((await control.query('SHOW server_version_num')).rows[0]?.server_version_num);
  assert.ok(version >= 170000 && version < 180000, `cleanup regression requires PostgreSQL 17.x; found ${version}`);
  const superuser = await control.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
  assert.equal(superuser.rows[0]?.rolsuper, true, 'local fixture account must be a superuser so cleanup mirrors its existing CREATE ROLE/CREATE DATABASE requirements');
  initialState = await snapshotState();
  assert.deepEqual(initialState.roles, [], 'cleanup regression requires its named roles to be absent before setup');
  assert.deepEqual(initialState.inviteDatabases, [], 'cleanup regression requires its disposable database namespace to be empty');
  namespaceOwned = true;

  await createFixtureRoles();
  await control.query('GRANT CONNECT ON DATABASE postgres TO lythaus_runtime WITH GRANT OPTION');
  await control.query('GRANT CREATE ON DATABASE postgres TO lythaus_runtime WITH GRANT OPTION');
  await control.query('GRANT CREATE ON DATABASE postgres TO lythaus_admin');
  const seededAcl = await snapshotAcl();
  assert.ok(seededAcl.some(row => row.grantee === 'lythaus_runtime' && row.privilege_type === 'CREATE' && row.is_grantable),
    'seeded runtime CREATE grant-option must be present before each runner scenario');
  assert.ok(seededAcl.some(row => row.grantee === 'lythaus_admin' && row.privilege_type === 'CREATE' && !row.is_grantable),
    'seeded admin CREATE grant without grant-option must be present before each runner scenario');
  assert.ok(seededAcl.some(row => row.grantee === 'lythaus_runtime' && row.privilege_type === 'CONNECT' && row.is_grantable),
    'seeded runtime CONNECT grant-option must be present before each runner scenario');

  // A pre-existing owner membership exercises the early-abort path that used
  // to revoke state even though this runner had not granted it.
  await control.query(`CREATE ROLE "${owner}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await control.query(`GRANT "${owner}" TO lythaus_migrations WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
  const beforeEarlyAbort = await snapshotState();
  const earlyAbort = await runRunner('early owner-collision abort');
  assertRunnerResult(earlyAbort, 1, 'invite_proposal_function_owner_already_exists');
  await compareState('early owner-collision abort', beforeEarlyAbort);

  await control.query(`REVOKE "${owner}" FROM lythaus_migrations`);
  await control.query(`DROP ROLE "${owner}"`);

  const beforeSuccess = await snapshotState();
  const success = await runRunner('normal successful cleanup', ['--baseline-only']);
  assertRunnerResult(success, 0, 'Invite proposal PG17 result: tests=passed cleanup=passed');
  await compareState('normal successful cleanup', beforeSuccess);

  const beforeValidationFailure = await snapshotState();
  const validationFailure = await runRunner('failure after ACL-mutating validator', ['--baseline-only'], 'validation');
  assertRunnerResult(validationFailure, 1, 'Invite proposal PG17 result: tests=failed cleanup=passed');
  assert.ok(validationFailure.output.includes('invite_proposal_pg17_test_injected_failure_after_validation'),
    `failure injection must occur after the validator completes: ${validationFailure.output}`);
  await compareState('failure after ACL-mutating validator', beforeValidationFailure);

  for (const role of databaseRoles) {
    await control.query(`REVOKE CONNECT, CREATE ON DATABASE postgres FROM "${role}" CASCADE`);
  }
  for (const role of [...databaseRoles].reverse()) {
    await control.query(`DROP ROLE "${role}"`);
  }
  const beforeCreatedRoleFailure = await snapshotState();
  const createdRoleFailure = await runRunner('failure after fixture-owned role and membership creation', [], 'roles');
  assertRunnerResult(createdRoleFailure, 1, 'Invite proposal PG17 result: tests=failed cleanup=passed');
  assert.ok(createdRoleFailure.output.includes('invite_proposal_pg17_test_injected_failure_after_roles'),
    `failure injection must occur after fixture role and membership creation: ${createdRoleFailure.output}`);
  await compareState('failure after fixture-owned role and membership creation', beforeCreatedRoleFailure);

  assert.deepEqual(await snapshotState(), initialState, 'the regression harness must leave the disposable server exactly as it found it');
  process.stdout.write('Invite cleanup regression: early-abort, success, post-validator-failure, created-role-failure restored exact effective ACL, role-membership, role and database state\n');
} finally {
  if (connected) {
    // These names are owned by this regression because setup requires all to
    // be absent and the local fixture namespace to be empty at entry.
    if (namespaceOwned) {
      const databases = await control.query(`SELECT datname FROM pg_database
        WHERE left(datname, length($1)) = $1 ORDER BY datname`, [inviteDatabasePrefix]).catch(() => ({ rows: [] }));
      for (const row of databases.rows) {
        await control.query(`DROP DATABASE "${row.datname.replaceAll('"', '""')}" WITH (FORCE)`).catch(() => undefined);
      }
      const current = await control.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])', [fixtureRoles]).catch(() => ({ rows: [] }));
      const present = new Set(current.rows.map(row => row.rolname));
      if (present.has(owner) && present.has('lythaus_migrations')) {
        await control.query(`REVOKE "${owner}" FROM lythaus_migrations`).catch(() => undefined);
      }
      for (const role of fixtureRoles) {
        if (present.has(role)) {
          await control.query(`REVOKE CONNECT, CREATE ON DATABASE postgres FROM "${role}" CASCADE`).catch(() => undefined);
        }
      }
      for (const role of [...fixtureRoles].reverse()) {
        if (present.has(role)) await control.query(`DROP ROLE "${role}"`).catch(() => undefined);
      }
    }
    await control.end();
  }
}
