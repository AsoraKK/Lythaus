import pg from 'pg';
import { APPLICATION_SCHEMAS } from './product-integrity-schema-contract.mjs';

const { Client } = pg;
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const adminDatabaseUrl = process.env.PLANETSCALE_ADMIN_DATABASE_URL ?? '';
const verifierDatabaseUrl = process.env.PLANETSCALE_VERIFIER_DATABASE_URL ?? '';
const roleIdentifiers = JSON.parse(process.env.PSCALE_ROLE_IDENTIFIERS ?? '{}');

if (branch !== 'main') throw new Error('schema-verifier grant reconciliation requires PSCALE_BRANCH_NAME=main');
if (!adminDatabaseUrl) throw new Error('PLANETSCALE_ADMIN_DATABASE_URL is required');
if (!verifierDatabaseUrl) throw new Error('PLANETSCALE_VERIFIER_DATABASE_URL is required');

function verifiedConnection(raw, label) {
  const connection = new URL(raw);
  if (connection.protocol !== 'postgres:' && connection.protocol !== 'postgresql:') {
    throw new Error(`${label} must use PostgreSQL`);
  }
  if (!connection.hostname.endsWith('.psdb.cloud')) throw new Error(`${label} must target PlanetScale`);
  if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error(`${label} requires sslmode=verify-full`);
  if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');
  return connection.toString();
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const incidentAggregateColumns = [
  { schema: 'identity', table: 'users', columns: ['status'] },
  { schema: 'identity', table: 'email_credentials', columns: ['verified_at'] },
  {
    schema: 'identity',
    table: 'email_verification_tokens',
    columns: ['created_at', 'consumed_at', 'expires_at'],
  },
  { schema: 'identity', table: 'account_events', columns: ['event_type', 'created_at'] },
  // Bootstrap checks count only NOT NULL columns. Do not grant the verifier
  // table-wide SELECT because these relations contain protected ciphertext
  // and acceptance metadata.
  { schema: 'system', table: 'transactional_email_outbox', columns: ['purpose', 'created_at'] },
  { schema: 'system', table: 'production_auth_acceptance_runs', columns: ['created_at'] },
];

const adminConnection = verifiedConnection(adminDatabaseUrl, 'admin database URL');
const verifierConnection = verifiedConnection(verifierDatabaseUrl, 'schema verifier database URL');

const verifier = new Client({ connectionString: verifierConnection, ssl: { rejectUnauthorized: true } });
await verifier.connect();
let verifierRole;
try {
  await verifier.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const identity = await verifier.query('SELECT current_user AS role, current_database() AS database');
  verifierRole = identity.rows[0]?.role ?? '';
  if (!/^pscale_api_[a-z0-9]+$/.test(verifierRole)) throw new Error('schema verifier uses an unexpected PlanetScale role identifier');
  if (identity.rows[0]?.database !== 'postgres') throw new Error('schema verifier must target the postgres database');
} finally {
  await verifier.end();
}

for (const [label, role] of Object.entries(roleIdentifiers)) {
  if (role === verifierRole) throw new Error(`schema verifier must be distinct from ${label}`);
}

const admin = new Client({ connectionString: adminConnection, ssl: { rejectUnauthorized: true } });
await admin.connect();
try {
  const adminIdentity = await admin.query('SELECT current_user AS role, current_database() AS database');
  if (adminIdentity.rows[0]?.role === verifierRole) throw new Error('schema verifier credential must be distinct from the migration/admin credential');
  if (adminIdentity.rows[0]?.database !== 'postgres') throw new Error('migration/admin credential must target the postgres database');

  // information_schema.tables is privilege-filtered. Grant a non-row-reading
  // table privilege to every table/view relation that can contribute to the
  // canonical schema fingerprint: ordinary tables, partitioned tables and views.
  const relations = await admin.query(`SELECT namespace.nspname AS schema_name, relation.relname AS relation_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = ANY($1::text[])
      AND relation.relkind IN ('r', 'p', 'v')
    ORDER BY namespace.nspname, relation.relname`, [APPLICATION_SCHEMAS]);

  const roleSql = quoteIdentifier(verifierRole);
  const schemaSql = APPLICATION_SCHEMAS.map(quoteIdentifier).join(', ');
  const relationKeys = new Set(relations.rows.map((row) => `${row.schema_name}.${row.relation_name}`));
  await admin.query('BEGIN');
  try {
    await admin.query("SET LOCAL lock_timeout = '10s'");
    await admin.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-verifier-grants'))");
    await admin.query(`GRANT CONNECT ON DATABASE postgres TO ${roleSql}`);
    await admin.query(`GRANT USAGE ON SCHEMA ${schemaSql} TO ${roleSql}`);
    await admin.query(`REVOKE CREATE ON DATABASE postgres FROM ${roleSql}`);
    await admin.query(`REVOKE CREATE ON SCHEMA ${schemaSql} FROM ${roleSql}`);
    for (const row of relations.rows) {
      const relationSql = `${quoteIdentifier(row.schema_name)}.${quoteIdentifier(row.relation_name)}`;
      await admin.query(`GRANT REFERENCES ON TABLE ${relationSql} TO ${roleSql}`);
    }
    await admin.query(`GRANT SELECT ON TABLE system.schema_migrations TO ${roleSql}`);
    for (const aggregate of incidentAggregateColumns) {
      const key = `${aggregate.schema}.${aggregate.table}`;
      if (!relationKeys.has(key)) throw new Error(`required incident aggregate relation is missing: ${key}`);
      const relationSql = `${quoteIdentifier(aggregate.schema)}.${quoteIdentifier(aggregate.table)}`;
      const columnsSql = aggregate.columns.map(quoteIdentifier).join(', ');
      await admin.query(`GRANT SELECT (${columnsSql}) ON TABLE ${relationSql} TO ${roleSql}`);
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
} finally {
  await admin.end();
}

const proof = new Client({ connectionString: verifierConnection, ssl: { rejectUnauthorized: true } });
await proof.connect();
try {
  await proof.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const checks = await proof.query(`SELECT
    has_schema_privilege(current_user, 'marketing', 'USAGE') AS marketing_usage,
    has_table_privilege(current_user, 'marketing.waitlist_signups', 'REFERENCES') AS waitlist_metadata,
    has_table_privilege(current_user, 'media.storage_ledgers', 'REFERENCES') AS storage_ledgers_metadata,
    has_table_privilege(current_user, 'system.schema_migrations', 'SELECT') AS migration_registry_read,
    has_column_privilege(current_user, 'identity.users', 'status', 'SELECT') AS incident_users_status_read,
    has_column_privilege(current_user, 'identity.email_credentials', 'verified_at', 'SELECT') AS incident_credentials_verified_at_read,
    has_column_privilege(current_user, 'identity.email_verification_tokens', 'created_at', 'SELECT') AS incident_tokens_created_at_read,
    has_column_privilege(current_user, 'identity.email_verification_tokens', 'consumed_at', 'SELECT') AS incident_tokens_consumed_at_read,
    has_column_privilege(current_user, 'identity.email_verification_tokens', 'expires_at', 'SELECT') AS incident_tokens_expires_at_read,
    has_column_privilege(current_user, 'identity.account_events', 'event_type', 'SELECT') AS incident_events_type_read,
    has_column_privilege(current_user, 'identity.account_events', 'created_at', 'SELECT') AS incident_events_created_at_read,
    has_column_privilege(current_user, 'system.transactional_email_outbox', 'purpose', 'SELECT') AS bootstrap_outbox_purpose_read,
    has_column_privilege(current_user, 'system.transactional_email_outbox', 'created_at', 'SELECT') AS bootstrap_outbox_created_at_read,
    has_column_privilege(current_user, 'system.production_auth_acceptance_runs', 'created_at', 'SELECT') AS bootstrap_acceptance_created_at_read,
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND table_type = 'BASE TABLE'
    ) AS waitlist_visible,
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'media' AND table_name = 'storage_ledgers' AND table_type = 'VIEW'
    ) AS storage_ledgers_visible,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'email_lookup_hmac'
    ) AS waitlist_columns_visible`);
  const row = checks.rows[0];
  if (!row?.marketing_usage || !row.waitlist_metadata || !row.storage_ledgers_metadata
    || !row.migration_registry_read || !row.incident_users_status_read
    || !row.incident_credentials_verified_at_read || !row.incident_tokens_created_at_read
    || !row.incident_tokens_consumed_at_read || !row.incident_tokens_expires_at_read
    || !row.incident_events_type_read || !row.incident_events_created_at_read
    || !row.bootstrap_outbox_purpose_read || !row.bootstrap_outbox_created_at_read
    || !row.bootstrap_acceptance_created_at_read
    || !row.waitlist_visible || !row.storage_ledgers_visible || !row.waitlist_columns_visible) {
    throw new Error('dedicated schema verifier metadata and aggregate evidence grant contract failed');
  }
  console.log(`Reconciled dedicated PlanetScale schema verifier metadata and aggregate evidence grants across ${APPLICATION_SCHEMAS.length} application schemas.`);
} finally {
  await proof.end();
}
