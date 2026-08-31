import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { APPROVED_MIGRATIONS, loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { assertCompleteMigrationPostconditions, assertMigrationDataPreconditions, classifyMigrationState, exactRegistryPrefix, incrementalMigrationNames, incrementalRegistryHead, migrationDataRiskReport } from './planetscale-migration-reconciliation.mjs';

const { Client } = pg;
const root = process.cwd();
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const approval = process.env.PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED ?? '';
const usageApproval = process.env.PLANETSCALE_MIGRATION_USAGE_APPROVED ?? '';
const usageMaxUsd = Number(process.env.PLANETSCALE_MIGRATION_USAGE_MAX_USD ?? '0');
const databaseUrl = process.env.PLANETSCALE_ADMIN_DATABASE_URL ?? '';
const roleIdentifiers = JSON.parse(process.env.PSCALE_ROLE_IDENTIFIERS ?? '{}');

if (branch !== 'main') throw new Error('production migrations require PSCALE_BRANCH_NAME=main');
if (approval !== 'approved') throw new Error('production migrations require PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED=approved');
if (usageApproval !== 'approved' || !Number.isFinite(usageMaxUsd) || usageMaxUsd < 0) throw new Error('production migrations require measured migration usage approval');
if (!databaseUrl) throw new Error('PLANETSCALE_ADMIN_DATABASE_URL is required');
const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('production migrations require sslmode=verify-full');
// PlanetScale's libpq connection examples use sslrootcert=system. node-postgres
// interprets sslrootcert as a literal filename, so remove only that special value
// and rely on Node's system trust store while keeping certificate verification on.
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');

const quoteRoleIdentifier = (value) => {
  if (!/^pscale_api_[a-z0-9]+$/.test(value)) throw new Error(`invalid PlanetScale role identifier: ${value}`);
  return `"${value}"`;
};
for (const label of ['runtime', 'admin', 'jobs', 'privacy', 'migrations']) {
  if (!roleIdentifiers[`lythaus_${label}`]) throw new Error(`missing PSCALE_ROLE_IDENTIFIERS entry for lythaus_${label}`);
  quoteRoleIdentifier(roleIdentifiers[`lythaus_${label}`]);
}

async function registryRows(client) {
  const exists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
  if (!exists.rows[0]?.registry) return null;
  const rows = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  return rows.rows;
}

async function acquireMigrationLock(client) {
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SET LOCAL statement_timeout = '15min'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
}

async function recordInsertOnly(client, migration) {
  const inserted = await client.query(
    `INSERT INTO system.schema_migrations (version, checksum)
     VALUES ($1, $2)
     ON CONFLICT (version) DO NOTHING
     RETURNING version`,
    [migration.name, migration.checksum],
  );
  if (inserted.rowCount !== 1) throw new Error(`migration registry already contains ${migration.name}`);
}

function verifyMigrationPostconditions(state) {
  try {
    assertCompleteMigrationPostconditions(state);
  } catch (error) {
    throw new Error(`postcondition verification failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function applyMigration(client, migration, pendingRegistry = [], verifyPostcondition = false) {
  await client.query('BEGIN');
  try {
    await acquireMigrationLock(client);
    await client.query(migration.contents.toString('utf8'));
    if (verifyPostcondition) {
      const [state] = await classifyMigrationState(client, [migration.name]);
      verifyMigrationPostconditions(state);
    }
    const registry = await registryRows(client);
    if (registry) {
      for (const row of [...pendingRegistry, migration]) await recordInsertOnly(client, row);
    } else if (pendingRegistry.length !== 0) {
      throw new Error('migration registry was not created by the canonical bootstrap migration');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function recordFullyAppliedMigration(client, migration) {
  await client.query('BEGIN');
  try {
    await acquireMigrationLock(client);
    const [state] = await classifyMigrationState(client, [migration.name]);
    verifyMigrationPostconditions(state);
    await recordInsertOnly(client, migration);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function verifyWaitlistPrivileges(client) {
  const roles = {
    runtime: roleIdentifiers.lythaus_runtime,
    admin: roleIdentifiers.lythaus_admin,
    privacy: roleIdentifiers.lythaus_privacy,
  };
  const checks = await client.query(`SELECT
    has_column_privilege($1, 'marketing.waitlist_signups', 'email_lookup_hmac', 'INSERT') AS runtime_insert_hmac,
    has_table_privilege($1, 'marketing.waitlist_signups', 'SELECT') AS runtime_select,
    has_column_privilege($2, 'marketing.waitlist_signups', 'email_ciphertext', 'SELECT') AS admin_select_ciphertext,
    has_column_privilege($2, 'marketing.waitlist_signups', 'email_lookup_hmac', 'SELECT') AS admin_select_hmac,
    has_column_privilege($2, 'marketing.waitlist_signups', 'status', 'UPDATE') AS admin_update_status,
    has_column_privilege($2, 'marketing.waitlist_signups', 'email_ciphertext', 'UPDATE') AS admin_update_ciphertext,
    has_table_privilege($3, 'marketing.waitlist_signups', 'DELETE') AS privacy_delete,
    has_column_privilege($3, 'marketing.waitlist_signups', 'purge_after', 'SELECT') AS privacy_select_purge,
    has_column_privilege($3, 'marketing.waitlist_signups', 'email_ciphertext', 'SELECT') AS privacy_select_ciphertext`,
  [roles.runtime, roles.admin, roles.privacy]);
  const row = checks.rows[0];
  if (!row?.runtime_insert_hmac || row.runtime_select
    || !row.admin_select_ciphertext || row.admin_select_hmac
    || !row.admin_update_status || row.admin_update_ciphertext
    || !row.privacy_delete || !row.privacy_select_purge || row.privacy_select_ciphertext) {
    throw new Error('waitlist least-privilege verification failed');
  }
}

async function verifyRuntimeRateLimitPrivileges(client) {
  const runtime = roleIdentifiers.lythaus_runtime;
  const checks = await client.query(`SELECT
    has_schema_privilege($1, 'system', 'USAGE') AS system_usage,
    has_table_privilege($1, 'system.rate_limit_windows', 'SELECT') AS rate_limit_select,
    has_table_privilege($1, 'system.rate_limit_windows', 'INSERT') AS rate_limit_insert,
    has_table_privilege($1, 'system.rate_limit_windows', 'UPDATE') AS rate_limit_update`,
  [runtime]);
  const row = checks.rows[0];
  if (!row?.system_usage || !row.rate_limit_select || !row.rate_limit_insert || !row.rate_limit_update) {
    throw new Error('runtime rate-limit privilege verification failed');
  }
}

async function applyGrants(client) {
  const template = fs.readFileSync(path.join(root, 'database', 'planetscale', 'grants', 'roles.sql'), 'utf8');
  const sql = template.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g, (label) => quoteRoleIdentifier(roleIdentifiers[label]));
  await client.query('BEGIN');
  try {
    await acquireMigrationLock(client);
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

const { migrations } = loadApprovedMigrations({ root, committedOnly: process.env.CI === 'true' });
const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  const registry = await registryRows(client);
  let mode;
  let pending;
  if (registry === null) {
    const users = await client.query("SELECT to_regclass('identity.users') AS users");
    if (users.rows[0]?.users) {
      const count = await client.query('SELECT count(*)::bigint AS count FROM identity.users');
      if (Number(count.rows[0]?.count ?? 0) !== 0) throw new Error('bootstrap migration requires an empty identity.users relation');
    }
    mode = 'bootstrap';
    pending = migrations;
  } else if (incrementalRegistryHead(registry) === '0016_transactional_email_envelope_boundary.sql') {
    mode = 'verified';
    pending = [];
  } else if (incrementalRegistryHead(registry)) {
    const remainingNames = incrementalMigrationNames(incrementalRegistryHead(registry));
    const states = await classifyMigrationState(client, remainingNames);
    const unsafe = states.filter(({ state }) => state === 'PARTIALLY_APPLIED');
    if (unsafe.length) throw new Error(`incremental migration reconciliation failed: ${JSON.stringify(unsafe)}`);
    const dataRisks = await migrationDataRiskReport(client);
    assertMigrationDataPreconditions(dataRisks);
    console.log(`Migration data preflight (aggregate counts only): ${JSON.stringify(dataRisks)}`);
    mode = 'incremental';
    pending = migrations.filter(({ name }) => remainingNames.includes(name)).map((migration) => ({
      migration,
      initialState: states.find(({ name }) => name === migration.name)?.state ?? 'PARTIALLY_APPLIED',
    }));
  } else {
    throw new Error('production migration registry is neither a clean bootstrap nor an exact canonical migration prefix');
  }

  const bootstrapPending = [];
  for (const item of pending) {
    const migration = item.migration ?? item;
    process.stdout.write(`Applying ${migration.name} (${mode})\n`);
    if (mode === 'incremental' && item.initialState === 'FULLY_APPLIED') {
      await recordFullyAppliedMigration(client, migration);
    } else if (mode === 'bootstrap' && !['0000_preflight.sql', '0001_extensions_and_schemas.sql', '0002_core_tables.sql', '0003_domain_extensions.sql'].includes(migration.name)) {
      await applyMigration(client, migration, bootstrapPending.splice(0));
    } else {
      await applyMigration(client, migration, [], mode === 'incremental');
      if (mode === 'bootstrap') bootstrapPending.push(migration);
    }
    const currentRegistry = await registryRows(client);
    if (!currentRegistry || !exactRegistryPrefix(currentRegistry, migration.name)) throw new Error(`registry prefix verification failed after ${migration.name}`);
  }
  const finalRegistry = await registryRows(client);
  if (!finalRegistry || !exactRegistryPrefix(finalRegistry, '0016_transactional_email_envelope_boundary.sql')) throw new Error('production migration registry is incomplete after apply');
  await applyGrants(client);
  await verifyWaitlistPrivileges(client);
  await verifyRuntimeRateLimitPrivileges(client);
  console.log(`Validated and applied PlanetScale production migrations on ${branch} (${mode}); no migration checksum was updated.`);
} finally {
  await client.end();
}
