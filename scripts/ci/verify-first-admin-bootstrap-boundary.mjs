import pg from 'pg';

const { Client } = pg;
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const databaseUrl = process.env.PLANETSCALE_ADMIN_DATABASE_URL ?? '';
const roleIdentifiers = JSON.parse(process.env.PSCALE_ROLE_IDENTIFIERS ?? '{}');
if (branch !== 'main') throw new Error('first-admin boundary verification requires PSCALE_BRANCH_NAME=main');
if (!databaseUrl) throw new Error('PLANETSCALE_ADMIN_DATABASE_URL is required');
for (const label of ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy']) {
  if (!/^pscale_api_[a-z0-9]+$/.test(roleIdentifiers[label] ?? '')) throw new Error(`missing or invalid ${label} role identifier`);
}
const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('first-admin production verification requires sslmode=verify-full');
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  const result = await client.query(`SELECT
    to_regprocedure('identity.bootstrap_first_administrator(uuid,bytea,uuid,text)') IS NOT NULL AS function_present,
    EXISTS (SELECT 1 FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed') AS latch_present,
    has_function_privilege($1, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS admin_execute,
    has_function_privilege($2, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS runtime_execute,
    has_function_privilege($3, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS jobs_execute,
    has_function_privilege($4, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS privacy_execute,
    has_table_privilege($1, 'identity.users', 'INSERT') AS admin_user_insert,
    has_table_privilege($1, 'identity.admin_memberships', 'INSERT') AS admin_membership_insert`,
  [roleIdentifiers.lythaus_admin, roleIdentifiers.lythaus_runtime, roleIdentifiers.lythaus_jobs, roleIdentifiers.lythaus_privacy]);
  const row = result.rows[0];
  if (!row?.function_present || !row.latch_present || !row.admin_execute) throw new Error('first-admin production database boundary is incomplete');
  if (row.runtime_execute || row.jobs_execute || row.privacy_execute) throw new Error('first-admin execute privilege leaked to a non-admin runtime role');
  if (row.admin_user_insert || row.admin_membership_insert) throw new Error('normal admin role gained direct identity insert privileges');

  const state = await client.query(`SELECT
    (SELECT enabled FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed') AS consumed,
    (SELECT count(*)::integer FROM identity.admin_memberships) AS membership_count,
    (SELECT count(*)::integer FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped') AS completion_audit_count`);
  console.log(JSON.stringify({
    boundary: 'verified',
    functionPresent: true,
    adminExecuteOnly: true,
    directIdentityInsertDenied: true,
    bootstrapConsumed: state.rows[0]?.consumed === true,
    membershipCount: Number(state.rows[0]?.membership_count ?? 0),
    completionAuditCount: Number(state.rows[0]?.completion_audit_count ?? 0),
  }));
} finally {
  await client.end();
}
