import pg from 'pg';
import { APPROVED_MIGRATIONS } from './planetscale-migration-manifest.mjs';
import { classifyMigrationState } from './planetscale-migration-reconciliation.mjs';

const { Client } = pg;
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
if (!branch) throw new Error('PSCALE_BRANCH_NAME is required');
if (new URL(databaseUrl).searchParams.get('sslmode') !== 'verify-full') throw new Error('migration reconciliation requires sslmode=verify-full');

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const registryExists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
  const registry = registryExists.rows[0]?.registry
    ? await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')
    : { rows: [] };
  const states = await classifyMigrationState(client, APPROVED_MIGRATIONS.slice(9).map(({ name }) => name));
  await client.query('ROLLBACK');
  console.log(JSON.stringify({ branch, registry: registry.rows, migrations: states }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
