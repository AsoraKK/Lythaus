import pg from 'pg';
import { APPROVED_MIGRATIONS } from './planetscale-migration-manifest.mjs';
import { classifyMigrationState } from './planetscale-migration-reconciliation.mjs';

const { Client } = pg;
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
if (!branch) throw new Error('PSCALE_BRANCH_NAME is required');
const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('migration reconciliation requires sslmode=verify-full');
// PlanetScale's libpq connection examples use sslrootcert=system. node-postgres
// interprets sslrootcert as a literal filename, so remove only that special value
// and rely on Node's system trust store while keeping certificate verification on.
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  // Keep every catalog probe read-only, but do not wrap the entire reconciliation in
  // one explicit transaction. PostgreSQL marks a transaction failed after an expected
  // undefined-table/undefined-column probe, which would poison all later probes even
  // though classifyMigrationState correctly classifies that artifact as not applied.
  // Session-level read-only mode preserves the safety boundary while letting each
  // statement autocommit independently.
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const readOnly = await client.query('SHOW transaction_read_only');
  if (readOnly.rows[0]?.transaction_read_only !== 'on') throw new Error('migration reconciliation session is not read-only');

  const registryExists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
  const registry = registryExists.rows[0]?.registry
    ? await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')
    : { rows: [] };
  const states = await classifyMigrationState(client, APPROVED_MIGRATIONS.slice(9).map(({ name }) => name));
  console.log(JSON.stringify({ branch, registry: registry.rows, migrations: states }, null, 2));
} finally {
  await client.end();
}
