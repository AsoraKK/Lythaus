import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
if (!connectionString) throw new Error('PLANETSCALE_PG17_TEST_DATABASE_URL is required');
const parsed = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  throw new Error('first-admin bootstrap validation refuses non-local database hosts');
}

const ids = {
  duplicateAudit: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b80',
  rollbackPrincipal: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b81',
  concurrentA: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b82',
  concurrentB: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b83',
  closedAttempt: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b84',
  auditA: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b85',
  auditB: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b86',
  auditClosed: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b87',
};
const fixtureIds = Object.values(ids);

async function connect() {
  const client = new Client({ connectionString, ssl: false });
  await client.connect();
  return client;
}

async function callAsAdmin(client, userId, hmacByte, auditId, correlationId) {
  await client.query('SET ROLE lythaus_admin');
  try {
    const result = await client.query(
      `SELECT identity.bootstrap_first_administrator($1::uuid, $2::bytea, $3::uuid, $4::text) AS created`,
      [userId, Buffer.alloc(32, hmacByte), auditId, correlationId],
    );
    return result.rows[0]?.created;
  } finally {
    await client.query('RESET ROLE').catch(() => undefined);
  }
}

const admin = await connect();
try {
  const version = await admin.query("SELECT current_setting('server_version_num')::integer AS version");
  const serverVersion = Number(version.rows[0]?.version);
  if (serverVersion < 170000 || serverVersion >= 180000) throw new Error(`bootstrap validation requires PostgreSQL 17.x; found ${serverVersion}`);

  const boundary = await admin.query(`SELECT
    to_regprocedure('identity.bootstrap_first_administrator(uuid,bytea,uuid,text)') IS NOT NULL AS function_present,
    EXISTS (SELECT 1 FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed' AND enabled = false) AS fresh_latch_present,
    has_function_privilege('lythaus_admin', 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS admin_execute,
    has_function_privilege('lythaus_runtime', 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS runtime_execute,
    has_function_privilege('lythaus_jobs', 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS jobs_execute,
    has_function_privilege('lythaus_privacy', 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS privacy_execute,
    has_table_privilege('lythaus_admin', 'identity.users', 'INSERT') AS admin_user_insert,
    has_table_privilege('lythaus_admin', 'identity.admin_memberships', 'INSERT') AS admin_membership_insert`);
  const b = boundary.rows[0];
  if (!b?.function_present || !b.fresh_latch_present || !b.admin_execute) throw new Error('first-admin bootstrap database boundary is incomplete');
  if (b.runtime_execute || b.jobs_execute || b.privacy_execute) throw new Error('first-admin bootstrap function leaked to a non-admin runtime role');
  if (b.admin_user_insert || b.admin_membership_insert) throw new Error('normal admin role gained direct first-admin table insert privileges');

  const initialMemberships = await admin.query('SELECT count(*)::integer AS count FROM identity.admin_memberships');
  if (Number(initialMemberships.rows[0]?.count) !== 0) throw new Error('PostgreSQL 17 bootstrap fixture requires zero initial memberships');

  // Force the final audit write to fail after the function has attempted the
  // user/membership/latch writes. PostgreSQL must roll the whole statement back.
  await admin.query(
    `INSERT INTO system.audit_events (id, action, correlation_id, metadata)
     VALUES ($1, 'test.bootstrap.preexisting', 'bootstrap-rollback-fixture', '{}'::jsonb)`,
    [ids.duplicateAudit],
  );
  const rollbackCaller = await connect();
  try {
    let rollbackError;
    try {
      await callAsAdmin(rollbackCaller, ids.rollbackPrincipal, 1, ids.duplicateAudit, 'bootstrap-rollback');
    } catch (error) {
      rollbackError = error;
    }
    if (!rollbackError || rollbackError.code !== '23505') throw new Error(`expected audit PK rollback failure 23505, found ${rollbackError?.code ?? 'none'}`);
  } finally {
    await rollbackCaller.end();
  }
  const rollbackState = await admin.query(`SELECT
    EXISTS (SELECT 1 FROM identity.users WHERE id = $1) AS user_exists,
    (SELECT count(*)::integer FROM identity.admin_memberships) AS membership_count,
    (SELECT enabled FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed') AS consumed`,
  [ids.rollbackPrincipal]);
  if (rollbackState.rows[0]?.user_exists || Number(rollbackState.rows[0]?.membership_count) !== 0 || rollbackState.rows[0]?.consumed !== false) {
    throw new Error('failed bootstrap did not roll back user, membership and latch atomically');
  }
  await admin.query('DELETE FROM system.audit_events WHERE id = $1', [ids.duplicateAudit]);

  // Two callers racing the one-shot function must serialize through the
  // advisory lock. Exactly one can create the control-plane principal.
  const callerA = await connect();
  const callerB = await connect();
  let results;
  try {
    results = await Promise.all([
      callAsAdmin(callerA, ids.concurrentA, 2, ids.auditA, 'bootstrap-concurrent-a'),
      callAsAdmin(callerB, ids.concurrentB, 3, ids.auditB, 'bootstrap-concurrent-b'),
    ]);
  } finally {
    await Promise.all([callerA.end(), callerB.end()]);
  }
  if (results.filter(Boolean).length !== 1 || results.filter((value) => value === false).length !== 1) {
    throw new Error(`concurrent bootstrap expected one true and one false result; found ${JSON.stringify(results)}`);
  }

  const successState = await admin.query(`SELECT
    (SELECT count(*)::integer FROM identity.admin_memberships) AS membership_count,
    (SELECT count(*)::integer FROM identity.users WHERE id = ANY($1::uuid[])) AS fixture_user_count,
    (SELECT count(*)::integer FROM identity.users u JOIN identity.admin_memberships m ON m.user_id = u.id WHERE u.status = 'locked' AND u.display_name = 'Lythaus control-plane administrator' AND m.role = 'administrator' AND m.active = true) AS locked_admin_count,
    (SELECT count(*)::integer FROM identity.email_credentials e JOIN identity.admin_memberships m ON m.user_id = e.user_id) AS email_credential_count,
    (SELECT count(*)::integer FROM identity.provider_links p JOIN identity.admin_memberships m ON m.user_id = p.user_id) AS provider_link_count,
    (SELECT count(*)::integer FROM identity.handles h JOIN identity.admin_memberships m ON m.user_id = h.user_id) AS handle_count,
    (SELECT count(*)::integer FROM social.profiles p JOIN identity.admin_memberships m ON m.user_id = p.user_id) AS profile_count,
    (SELECT enabled FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed') AS consumed,
    (SELECT count(*)::integer FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped') AS bootstrap_audit_count`,
  [[ids.concurrentA, ids.concurrentB]]);
  const s = successState.rows[0];
  if (Number(s?.membership_count) !== 1 || Number(s?.fixture_user_count) !== 1 || Number(s?.locked_admin_count) !== 1 || s?.consumed !== true || Number(s?.bootstrap_audit_count) !== 1) {
    throw new Error('successful bootstrap did not produce exactly one locked administrator and durable closure evidence');
  }
  for (const field of ['email_credential_count', 'provider_link_count', 'handle_count', 'profile_count']) {
    if (Number(s?.[field]) !== 0) throw new Error(`control-plane administrator unexpectedly gained consumer identity material: ${field}`);
  }

  // Prove closure survives membership removal: the durable latch/audit facts
  // must prevent a second administrator from being created.
  await admin.query('DELETE FROM identity.admin_memberships');
  const closedCaller = await connect();
  let closedResult;
  try {
    closedResult = await callAsAdmin(closedCaller, ids.closedAttempt, 4, ids.auditClosed, 'bootstrap-closed-after-delete');
  } finally {
    await closedCaller.end();
  }
  if (closedResult !== false) throw new Error('durable bootstrap latch reopened after membership deletion');
  const closedState = await admin.query('SELECT EXISTS (SELECT 1 FROM identity.users WHERE id = $1) AS created', [ids.closedAttempt]);
  if (closedState.rows[0]?.created) throw new Error('closed bootstrap created a second control-plane user');

  console.log(JSON.stringify({
    serverVersion,
    boundary: {
      functionPresent: true,
      adminExecuteOnly: true,
      directTableInsertDenied: true,
    },
    rollbackAtomic: true,
    concurrencyExactlyOnce: true,
    credentiallessControlPlanePrincipal: true,
    durableClosureAfterMembershipRemoval: true,
  }));
} finally {
  // Local disposable-test cleanup only. This script refuses non-local hosts.
  await admin.query('DELETE FROM identity.admin_memberships WHERE user_id = ANY($1::uuid[])', [fixtureIds]).catch(() => undefined);
  await admin.query("DELETE FROM system.audit_events WHERE id = ANY($1::uuid[]) OR action = 'identity.first_admin_bootstrapped'", [fixtureIds]).catch(() => undefined);
  await admin.query('DELETE FROM identity.users WHERE id = ANY($1::uuid[])', [fixtureIds]).catch(() => undefined);
  await admin.query("UPDATE system.feature_flags SET enabled = false, policy_version = 'bootstrap-v1', updated_at = now() WHERE flag_key = 'identity.first_admin_bootstrap_consumed'").catch(() => undefined);
  await admin.end();
}
