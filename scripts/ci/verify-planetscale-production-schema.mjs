import { createHash } from 'node:crypto';
import pg from 'pg';
import { expectedMigrationPrefix, loadApprovedMigrations } from './planetscale-migration-manifest.mjs';

const { Client } = pg;
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const manifestOnly = process.argv.includes('--manifest-only');
const emitContract = process.argv.includes('--emit-contract');
const committedOnly = process.argv.includes('--committed') || process.env.CI === 'true';
const requireBudgetMigration = process.env.REQUIRE_BUDGET_MIGRATION === 'true';
const requireProductIntegrityMigration = process.env.REQUIRE_PRODUCT_INTEGRITY_MIGRATION === 'true';
const expectedSchemaFingerprint = process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? '';
const expectedRelationCount = Number(process.env.EXPECTED_DATABASE_RELATION_COUNT ?? '0');
const manifest = loadApprovedMigrations({ committedOnly });

if (manifestOnly) {
  console.log(`Verified ${manifest.migrations.length} committed production migrations, ${manifest.bytes} bytes.`);
  console.log(`Approved migration-set SHA-256: ${manifest.checksum}`);
  process.exit(0);
}
if (!branch) throw new Error('schema verification requires PSCALE_BRANCH_NAME');
if (!emitContract && branch !== 'main') throw new Error('production schema verification requires PSCALE_BRANCH_NAME=main');
if (emitContract && branch === 'main') throw new Error('schema contract generation is restricted to a non-production branch');
if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');
const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('production schema verification requires sslmode=verify-full');
if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');
if (requireProductIntegrityMigration && !emitContract && (!/^[0-9a-f]{64}$/.test(expectedSchemaFingerprint) || !Number.isInteger(expectedRelationCount) || expectedRelationCount <= 0)) {
  throw new Error('post-0013 verification requires expected schema fingerprint and relation count');
}

const applicationSchemas = ['identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'marketing', 'system'];

async function schemaContract(client, registryRows) {
  const schemaParams = applicationSchemas.map((_, index) => `$${index + 1}`).join(', ');
  const [relations, columns, constraints, indexes, functions, extensions] = await Promise.all([
    client.query(`SELECT table_type, table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN (${schemaParams})
      ORDER BY table_type, table_schema, table_name`, applicationSchemas),
    client.query(`SELECT table_schema, table_name, ordinal_position, column_name, udt_name, is_nullable, COALESCE(column_default, '') AS column_default
      FROM information_schema.columns
      WHERE table_schema IN (${schemaParams})
      ORDER BY table_schema, table_name, ordinal_position`, applicationSchemas),
    client.query(`SELECT namespace.nspname AS table_schema, relation.relname AS table_name,
        constraint_row.conname, constraint_row.contype, constraint_row.convalidated,
        pg_get_constraintdef(constraint_row.oid, true) AS definition
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname IN (${schemaParams})
      ORDER BY namespace.nspname, relation.relname, constraint_row.conname`, applicationSchemas),
    client.query(`SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname IN (${schemaParams})
      ORDER BY schemaname, tablename, indexname`, applicationSchemas),
    client.query(`SELECT namespace.nspname AS function_schema, procedure.proname,
        pg_get_function_identity_arguments(procedure.oid) AS arguments,
        pg_get_function_result(procedure.oid) AS result_type,
        procedure.prosecdef,
        COALESCE(array_to_string(procedure.proconfig, ','), '') AS configuration
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname IN (${schemaParams})
      ORDER BY namespace.nspname, procedure.proname, arguments`, applicationSchemas),
    client.query('SELECT extname, extversion FROM pg_extension ORDER BY extname'),
  ]);
  const sections = [
    ['relations', relations.rows],
    ['columns', columns.rows],
    ['constraints', constraints.rows],
    ['indexes', indexes.rows],
    ['functions', functions.rows],
    ['extensions', extensions.rows],
    ['migrations', registryRows],
  ];
  const payload = sections.map(([name, rows]) => `--${name}--\n${rows.map((row) => JSON.stringify(row)).join('\n')}`).join('\n');
  return {
    fingerprint: createHash('sha256').update(payload).digest('hex'),
    relationCount: relations.rowCount ?? relations.rows.length,
  };
}

async function verifyWaitlistCatalog(client) {
  const result = await client.query(`SELECT
    to_regclass('marketing.waitlist_signups') IS NOT NULL AS waitlist_table,
    to_regclass('marketing.waitlist_signups_created_cursor_idx') IS NOT NULL AS cursor_index,
    to_regclass('marketing.waitlist_signups_due_purge_idx') IS NOT NULL AS purge_index,
    to_regclass('system.rate_limit_windows') IS NOT NULL AS rate_limit_windows,
    to_regclass('feed.notification_devices') IS NOT NULL AS notification_devices,
    to_regclass('trust.user_activity_events') IS NOT NULL AS activity_events,
    to_regclass('moderation.appeal_review_votes') IS NOT NULL AS appeal_review_votes,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_signups_email_lookup_hmac_unique' AND contype = 'u') AS unique_hmac,
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups'
        AND column_name IN ('email', 'plain_email', 'raw_ip', 'ip_address', 'user_agent', 'turnstile_token')
    ) AS prohibited_columns_absent`);
  if (Object.values(result.rows[0] ?? {}).some((value) => value !== true)) throw new Error('production post-0013 catalog contract is incomplete');
}

async function verifyWaitlistPrivileges(client) {
  const roleIdentifiers = JSON.parse(process.env.PSCALE_ROLE_IDENTIFIERS ?? '{}');
  const runtime = roleIdentifiers.lythaus_runtime;
  const admin = roleIdentifiers.lythaus_admin;
  const privacy = roleIdentifiers.lythaus_privacy;
  if (![runtime, admin, privacy].every((value) => /^pscale_api_[a-z0-9]+$/.test(value ?? ''))) {
    throw new Error('post-0013 privilege verification requires canonical PlanetScale role identifiers');
  }
  const result = await client.query(`SELECT
    has_column_privilege($1, 'marketing.waitlist_signups', 'email_lookup_hmac', 'INSERT') AS runtime_insert_hmac,
    has_table_privilege($1, 'marketing.waitlist_signups', 'SELECT') AS runtime_select,
    has_column_privilege($2, 'marketing.waitlist_signups', 'email_ciphertext', 'SELECT') AS admin_select_ciphertext,
    has_column_privilege($2, 'marketing.waitlist_signups', 'email_lookup_hmac', 'SELECT') AS admin_select_hmac,
    has_column_privilege($2, 'marketing.waitlist_signups', 'status', 'UPDATE') AS admin_update_status,
    has_column_privilege($2, 'marketing.waitlist_signups', 'email_ciphertext', 'UPDATE') AS admin_update_ciphertext,
    has_table_privilege($3, 'marketing.waitlist_signups', 'DELETE') AS privacy_delete,
    has_column_privilege($3, 'marketing.waitlist_signups', 'purge_after', 'SELECT') AS privacy_select_purge,
    has_column_privilege($3, 'marketing.waitlist_signups', 'email_ciphertext', 'SELECT') AS privacy_select_ciphertext`,
  [runtime, admin, privacy]);
  const row = result.rows[0];
  if (!row?.runtime_insert_hmac || row.runtime_select
    || !row.admin_select_ciphertext || row.admin_select_hmac
    || !row.admin_update_status || row.admin_update_ciphertext
    || !row.privacy_delete || !row.privacy_select_purge || row.privacy_select_ciphertext) {
    throw new Error('production waitlist least-privilege contract failed');
  }
}
const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const registry = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  const through = requireProductIntegrityMigration || emitContract ? '0013_marketing_waitlist.sql' : requireBudgetMigration ? '0009_cost_budget_enforcement.sql' : '0008_legacy_relink_status.sql';
  const expected = expectedMigrationPrefix(through);
  if (registry.rows.length !== expected.length) throw new Error(`production migration registry contains ${registry.rows.length} entries; expected ${expected.length}`);
  expected.forEach((migration, index) => {
    const row = registry.rows[index];
    if (row?.version !== migration.name || row?.checksum !== migration.appliedSha256) throw new Error(`production migration registry mismatch: ${migration.name}`);
  });
  if (requireProductIntegrityMigration || emitContract) {
    await verifyWaitlistCatalog(client);
    await verifyWaitlistPrivileges(client);
    const contract = await schemaContract(client, registry.rows);
    if (emitContract) {
      console.log(JSON.stringify({ branch, ...contract }));
    } else {
      if (contract.fingerprint !== expectedSchemaFingerprint) throw new Error('production post-0013 schema fingerprint mismatch');
      if (contract.relationCount !== expectedRelationCount) throw new Error(`production post-0013 relation count is ${contract.relationCount}; expected ${expectedRelationCount}`);
    }
  }
  await client.query('ROLLBACK');
  console.log(`Verified read-only PlanetScale migration registry on ${branch}.`);
  console.log(`Approved migration-set SHA-256: ${manifest.checksum}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
