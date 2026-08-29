import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const outputPath = process.env.PLANETSCALE_CONTRACT_AUDIT_OUTPUT ?? '.artifacts/provider-inventory/planetscale-production-contract.json';

if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('PlanetScale contract audit requires sslmode=verify-full');
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

const verifier = spawnSync(process.execPath, ['scripts/ci/verify-planetscale-production-schema.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection.toString(),
    PSCALE_BRANCH_NAME: 'main',
    REQUIRE_PRODUCT_INTEGRITY_MIGRATION: 'true',
  },
  encoding: 'utf8',
});
if (verifier.status !== 0) {
  process.stderr.write(verifier.stdout ?? '');
  process.stderr.write(verifier.stderr ?? '');
  throw new Error(`production schema verifier failed with exit code ${verifier.status}`);
}

const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
let report;
try {
  await client.query('BEGIN READ ONLY');
  const readOnlyResult = await client.query('SHOW transaction_read_only');
  if (readOnlyResult.rows[0]?.transaction_read_only !== 'on') throw new Error('PlanetScale contract audit did not enter a read-only transaction');
  const versionResult = await client.query('SHOW server_version');
  const extensionsResult = await client.query('SELECT extname, extversion FROM pg_extension ORDER BY extname');
  const migrationsResult = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  const grantsResult = await client.query(`SELECT privilege_type, COUNT(*)::int AS grant_count
    FROM information_schema.role_table_grants
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    GROUP BY privilege_type
    ORDER BY privilege_type`);
  const roleCountResult = await client.query(`SELECT COUNT(DISTINCT grantee)::int AS role_count
    FROM information_schema.role_table_grants
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`);
  await client.query('ROLLBACK');

  const migrationsPayload = migrationsResult.rows.map(({ version, checksum }) => `${version}:${checksum}`).join('\n');
  const verifierOutput = String(verifier.stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('Observed post-0014 schema fingerprint:')
      || line.startsWith('Observed post-0014 relation count:')
      || line.startsWith('Observed post-0014 catalog SHA-256:')
      || line.startsWith('Approved migration-set SHA-256:')
      || line.startsWith('Verified read-only PlanetScale migration registry'));
  report = {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    branch: 'main',
    transactionReadOnly: true,
    verifierPassed: true,
    post0014Required: true,
    postgresVersion: versionResult.rows[0]?.server_version ?? null,
    extensions: extensionsResult.rows,
    migrationLedger: {
      count: migrationsResult.rowCount ?? migrationsResult.rows.length,
      first: migrationsResult.rows[0]?.version ?? null,
      last: migrationsResult.rows.at(-1)?.version ?? null,
      entries: migrationsResult.rows,
      ledgerSha256: createHash('sha256').update(migrationsPayload).digest('hex'),
    },
    visibleGrantMetadata: {
      distinctGrantees: roleCountResult.rows[0]?.role_count ?? 0,
      byPrivilege: grantsResult.rows.map(({ privilege_type, grant_count }) => ({ privilege: privilege_type, count: grant_count })),
      note: 'Specific runtime/admin/privacy least-privilege assertions are enforced by verify-planetscale-production-schema.mjs.',
    },
    verifierOutput,
  };
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized PlanetScale production contract audit to ${outputPath}.`);
