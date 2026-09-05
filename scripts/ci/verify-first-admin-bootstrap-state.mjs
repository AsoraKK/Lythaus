import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const expectedMembershipCount = Number(process.env.EXPECTED_MEMBERSHIP_COUNT ?? '');
const expectedBootstrapConsumed = process.env.EXPECTED_BOOTSTRAP_CONSUMED;
const expectedCompletionAuditCount = Number(process.env.EXPECTED_COMPLETION_AUDIT_COUNT ?? '');

if (branch !== 'main') throw new Error('first-admin bootstrap state verification requires PSCALE_BRANCH_NAME=main');
if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
if (!Number.isInteger(expectedMembershipCount) || expectedMembershipCount < 0) {
  throw new Error('EXPECTED_MEMBERSHIP_COUNT must be a non-negative integer');
}
if (!['true', 'false'].includes(expectedBootstrapConsumed ?? '')) {
  throw new Error('EXPECTED_BOOTSTRAP_CONSUMED must be true or false');
}
if (!Number.isInteger(expectedCompletionAuditCount) || expectedCompletionAuditCount < 0) {
  throw new Error('EXPECTED_COMPLETION_AUDIT_COUNT must be a non-negative integer');
}

const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') {
  throw new Error('first-admin bootstrap state verification requires sslmode=verify-full');
}
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SET TRANSACTION READ ONLY');
  const result = await client.query(`SELECT
    (SELECT count(*)::integer
     FROM identity.admin_memberships
     WHERE active = true) AS membership_count,

    (SELECT enabled
     FROM system.feature_flags
     WHERE flag_key = 'identity.first_admin_bootstrap_consumed')
     AS bootstrap_consumed,

    (SELECT count(*)::integer
     FROM system.audit_events
     WHERE action = 'identity.first_admin_bootstrapped')
     AS completion_audit_count`);
  await client.query('COMMIT');

  if (result.rowCount !== 1) throw new Error('first-admin bootstrap state query returned no row');
  const state = {
    membershipCount: Number(result.rows[0]?.membership_count ?? -1),
    bootstrapConsumed: result.rows[0]?.bootstrap_consumed === true,
    completionAuditCount: Number(result.rows[0]?.completion_audit_count ?? -1),
  };
  const expected = {
    membershipCount: expectedMembershipCount,
    bootstrapConsumed: expectedBootstrapConsumed === 'true',
    completionAuditCount: expectedCompletionAuditCount,
  };
  if (state.membershipCount !== expected.membershipCount
    || state.bootstrapConsumed !== expected.bootstrapConsumed
    || state.completionAuditCount !== expected.completionAuditCount) {
    throw new Error(`first-admin bootstrap state mismatch: expected=${JSON.stringify(expected)} observed=${JSON.stringify(state)}`);
  }
  console.log(JSON.stringify({ status: 'verified', ...state }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
