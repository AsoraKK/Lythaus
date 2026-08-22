import { createHash } from 'node:crypto';
import pg from 'pg';
import { expectedMigrationPrefix, loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { APPLICATION_SCHEMAS, approvedPost0013Expectation, runtimeSchemaFingerprint } from './product-integrity-schema-contract.mjs';

const { Client } = pg;
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const manifestOnly = process.argv.includes('--manifest-only');
const emitContract = process.argv.includes('--emit-contract');
const committedOnly = process.argv.includes('--committed') || process.env.CI === 'true';
const requireBudgetMigration = process.env.REQUIRE_BUDGET_MIGRATION === 'true';
const requireProductIntegrityMigration = process.env.REQUIRE_PRODUCT_INTEGRITY_MIGRATION === 'true';
const manifest = loadApprovedMigrations({ committedOnly });
const post0013Expectation = requireProductIntegrityMigration || emitContract
  ? approvedPost0013Expectation(
    process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? '',
    process.env.EXPECTED_DATABASE_RELATION_COUNT ?? '',
  )
  : null;

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

async function schemaContract(client, registryRows) {
  const schemaParams = APPLICATION_SCHEMAS.map((_, index) => `$${index + 1}`).join(', ');
  // Keep a single pg.Client strictly sequential. Concurrent client.query()
  // calls are deprecated by node-postgres and will be rejected in pg@9.
  const relations = await client.query(`SELECT table_type, table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN (${schemaParams})
    ORDER BY table_type, table_schema, table_name`, APPLICATION_SCHEMAS);
  const columns = await client.query(`SELECT table_schema, table_name, ordinal_position, column_name, udt_name, is_nullable, COALESCE(column_default, '') AS column_default
    FROM information_schema.columns
    WHERE table_schema IN (${schemaParams})
    ORDER BY table_schema, table_name, ordinal_position`, APPLICATION_SCHEMAS);
  const constraints = await client.query(`SELECT namespace.nspname AS table_schema, relation.relname AS table_name,
      constraint_row.conname, constraint_row.contype, constraint_row.convalidated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname IN (${schemaParams})
    ORDER BY namespace.nspname, relation.relname, constraint_row.conname`, APPLICATION_SCHEMAS);
  const indexes = await client.query(`SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname IN (${schemaParams})
    ORDER BY schemaname, tablename, indexname`, APPLICATION_SCHEMAS);
  const functions = await client.query(`SELECT namespace.nspname AS function_schema, procedure.proname,
      pg_get_function_identity_arguments(procedure.oid) AS arguments,
      pg_get_function_result(procedure.oid) AS result_type,
      procedure.prosecdef,
      COALESCE(array_to_string(procedure.proconfig, ','), '') AS configuration
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN (${schemaParams})
    ORDER BY namespace.nspname, procedure.proname, arguments`, APPLICATION_SCHEMAS);
  const extensions = await client.query('SELECT extname, extversion FROM pg_extension ORDER BY extname');
  const catalogSections = [
    ['relations', relations.rows],
    ['columns', columns.rows],
    ['constraints', constraints.rows],
    ['indexes', indexes.rows],
    ['functions', functions.rows],
    ['extensions', extensions.rows],
    ['migrations', registryRows],
  ];
  const catalogPayload = catalogSections
    .map(([name, rows]) => `--${name}--\n${rows.map((row) => JSON.stringify(row)).join('\n')}`)
    .join('\n');
  return {
    fingerprint: runtimeSchemaFingerprint(relations.rows, registryRows),
    relationCount: relations.rowCount ?? relations.rows.length,
    relations: relations.rows,
    catalogFingerprint: createHash('sha256').update(catalogPayload).digest('hex'),
  };
}

function relationKey(row) {
  return `${row.table_type}:${row.table_schema}.${row.table_name}`;
}

function fingerprintMismatch(contract, expectation) {
  const expected = new Set(expectation.canonical.relations.map(relationKey));
  const observed = new Set(contract.relations.map(relationKey));
  const missing = [...expected].filter((key) => !observed.has(key)).sort();
  const extra = [...observed].filter((key) => !expected.has(key)).sort();
  return new Error(
    `production post-0013 schema fingerprint mismatch: observed=${contract.fingerprint}; expected=${expectation.fingerprint}; `
    + `relations=${contract.relationCount}/${expectation.relationCount}; missing=${JSON.stringify(missing)}; extra=${JSON.stringify(extra)}`,
  );
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
    has_schema_privilege($1, 'system', 'USAGE') AS runtime_system_usage,
    has_table_privilege($1, 'system.rate_limit_windows', 'SELECT') AS runtime_rate_select,
    has_table_privilege($1, 'system.rate_limit_windows', 'INSERT') AS runtime_rate_insert,
    has_table_privilege($1, 'system.rate_limit_windows', 'UPDATE') AS runtime_rate_update,
    has_schema_privilege($1, 'marketing', 'USAGE') AS runtime_marketing_usage,
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
  if (!row?.runtime_system_usage || !row.runtime_rate_select || !row.runtime_rate_insert || !row.runtime_rate_update
    || !row.runtime_marketing_usage || !row.runtime_insert_hmac || row.runtime_select
    || !row.admin_select_ciphertext || row.admin_select_hmac
    || !row.admin_update_status || row.admin_update_ciphertext
    || !row.privacy_delete || !row.privacy_select_purge || row.privacy_select_ciphertext) {
    throw new Error('production waitlist/runtime least-privilege contract failed');
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
      console.log(JSON.stringify({ branch, ...contract, relations: undefined }));
    } else {
      if (contract.fingerprint !== post0013Expectation.fingerprint) throw fingerprintMismatch(contract, post0013Expectation);
      if (contract.relationCount !== post0013Expectation.relationCount) {
        throw new Error(`production post-0013 relation count is ${contract.relationCount}; expected ${post0013Expectation.relationCount}`);
      }
      console.log(`Observed post-0013 schema fingerprint: ${contract.fingerprint}`);
      console.log(`Observed post-0013 relation count: ${contract.relationCount}`);
      console.log(`Observed post-0013 catalog SHA-256: ${contract.catalogFingerprint}`);
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
