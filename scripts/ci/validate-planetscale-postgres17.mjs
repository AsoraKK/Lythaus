import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadApprovedMigrations } from './planetscale-migration-manifest.mjs';

const { Client } = pg;

async function expectSqlState(client, savepoint, sql, parameters, expectedCode) {
  await client.query(`SAVEPOINT ${savepoint}`);
  let failure;
  try {
    await client.query(sql, parameters);
  } catch (error) {
    failure = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (!failure) throw new Error(`expected SQLSTATE ${expectedCode} for ${savepoint}, but query succeeded`);
  if (failure.code !== expectedCode) throw new Error(`expected SQLSTATE ${expectedCode} for ${savepoint}, found ${failure.code ?? 'unknown'}`);
}

const root = process.cwd();
const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
if (!connectionString) throw new Error('PLANETSCALE_PG17_TEST_DATABASE_URL is required for the local PostgreSQL 17 compatibility test');
const connection = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(connection.hostname)) throw new Error('PostgreSQL 17 compatibility validation refuses non-local database hosts');

const { migrations } = loadApprovedMigrations({ root });
const client = new Client({ connectionString, ssl: false });
await client.connect();
try {
  const version = await client.query('SELECT current_setting(\'server_version_num\')::integer AS version');
  if (Number(version.rows[0]?.version) < 170000 || Number(version.rows[0]?.version) >= 180000) throw new Error(`local compatibility server must be PostgreSQL 17.x; found ${version.rows[0]?.version}`);
  for (const role of ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations']) {
    await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role}; END IF; END $$;`);
  }
  const bootstrapPending = [];
  for (const migration of migrations) {
    process.stdout.write(`Applying ${migration.name}\n`);
    await client.query('BEGIN');
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
      await client.query(migration.contents.toString('utf8'));
      const exists = await client.query("SELECT to_regclass('system.schema_migrations') AS registry");
      if (exists.rows[0]?.registry) {
        for (const row of [...bootstrapPending.splice(0), migration]) {
          const inserted = await client.query(
            `INSERT INTO system.schema_migrations (version, checksum)
             VALUES ($1, $2) ON CONFLICT (version) DO NOTHING RETURNING version`,
            [row.name, row.checksum],
          );
          if (inserted.rowCount !== 1) throw new Error(`PostgreSQL 17 registry already contains ${row.name}`);
        }
      } else {
        bootstrapPending.push(migration);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
  if (bootstrapPending.length) throw new Error('PostgreSQL 17 migration registry was not created');
  const recordedMigrations = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  if (recordedMigrations.rows.length !== migrations.length) throw new Error('PostgreSQL 17 migration registry is incomplete');
  migrations.forEach((migration, index) => {
    const row = recordedMigrations.rows[index];
    if (row.version !== migration.name || row.checksum !== migration.checksum) throw new Error(`PostgreSQL 17 migration checksum mismatch: ${migration.name}`);
  });
  const grants = fs.readFileSync(path.join(root, 'database', 'planetscale', 'grants', 'roles.sql'), 'utf8');
  await client.query(grants);
  await client.query(fs.readFileSync(path.join(root, 'database', 'planetscale', 'verification', 'verify.sql'), 'utf8'));
  const checks = await client.query(`
    SELECT
      to_regclass('identity.users') AS users,
      to_regclass('content.posts') AS posts,
      to_regclass('privacy.subject_data_locations') AS subject_locations,
      to_regclass('system.idempotency_keys') AS idempotency,
      to_regclass('identity.contact_emails') AS contact_emails,
      to_regprocedure('privacy.reconcile_subject_data_locations(uuid)') AS locator_function,
      to_regprocedure('privacy.set_retention_rule(uuid,uuid,text,interval,text)') AS retention_function,
      to_regclass('system.cost_budget_periods') AS budget_periods,
      to_regclass('system.cost_budget_reservations') AS budget_reservations,
      to_regclass('system.cost_usage_events') AS usage_events,
      to_regclass('system.cost_kill_switches') AS kill_switches,
      to_regclass('marketing.waitlist_signups') AS waitlist_signups,
      to_regclass('system.production_auth_acceptance_runs') AS production_auth_acceptance_runs,
      to_regclass('system.production_auth_acceptance_events') AS production_auth_acceptance_events,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name IN ('purge_after', 'retention_hold', 'retention_hold_at', 'retention_hold_released_at')) AS waitlist_retention_column_count,
      (SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_trgm', 'unaccent')) AS extension_count,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_schema IN ('identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'marketing', 'system')) AS relation_count,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'marketing', 'system')
          AND c.relkind IN ('r', 'p')) AS table_count
  `);
  const row = checks.rows[0];
  for (const field of ['users', 'posts', 'subject_locations', 'idempotency', 'contact_emails', 'locator_function', 'retention_function', 'budget_periods', 'budget_reservations', 'usage_events', 'kill_switches', 'waitlist_signups', 'production_auth_acceptance_runs', 'production_auth_acceptance_events']) if (!row[field]) throw new Error(`PostgreSQL 17 compatibility check missing ${field}`);
  if (Number(row.waitlist_retention_column_count) !== 4) throw new Error(`PostgreSQL 17 compatibility check expected waitlist retention and hold columns`);
  if (Number(row.extension_count) !== 3) throw new Error(`PostgreSQL 17 compatibility check expected 3 required extensions, found ${row.extension_count}`);
  if (Number(row.relation_count) !== 97) throw new Error(`PostgreSQL 17 compatibility check expected 97 local application relations after migration 0015, found ${row.relation_count}`);
  if (Number(row.relation_count) + 2 !== 99) throw new Error(`PostgreSQL 17 compatibility check expected 99 PlanetScale relations including two provider extension views, found ${Number(row.relation_count) + 2}`);
  if (Number(row.table_count) !== 96) throw new Error(`PostgreSQL 17 compatibility check expected 96 launch tables after migration 0015, found ${row.table_count}`);

  const privileges = await client.query(`
    SELECT
      has_table_privilege('lythaus_runtime', 'privacy.requests', 'SELECT,INSERT') AS runtime_privacy_request_allowed,
      has_table_privilege('lythaus_runtime', 'privacy.legal_holds', 'SELECT') AS runtime_legal_holds_forbidden,
      has_schema_privilege('lythaus_runtime', 'content', 'CREATE') AS runtime_content_ddl_forbidden,
      has_database_privilege('lythaus_runtime', current_database(), 'CREATE') AS runtime_database_ddl_forbidden,
      has_table_privilege('lythaus_jobs', 'content.posts', 'UPDATE') AS jobs_post_update_allowed,
      has_schema_privilege('lythaus_jobs', 'privacy', 'CREATE') AS jobs_privacy_ddl_forbidden,
      has_database_privilege('lythaus_jobs', current_database(), 'CREATE') AS jobs_database_ddl_forbidden,
      has_table_privilege('lythaus_admin', 'moderation.decisions', 'INSERT') AS admin_decision_allowed,
      has_column_privilege('lythaus_runtime', 'marketing.waitlist_signups', 'id', 'INSERT') AS runtime_waitlist_insert_allowed,
      has_table_privilege('lythaus_runtime', 'marketing.waitlist_signups', 'SELECT') AS runtime_waitlist_read_forbidden,
      has_column_privilege('lythaus_admin', 'marketing.waitlist_signups', 'email_ciphertext', 'SELECT') AS admin_waitlist_ciphertext_allowed,
      has_column_privilege('lythaus_admin', 'marketing.waitlist_signups', 'status', 'UPDATE') AS admin_waitlist_status_update_allowed,
      has_column_privilege('lythaus_admin', 'marketing.waitlist_signups', 'email_lookup_hmac', 'SELECT') AS admin_waitlist_hmac_forbidden,
      has_table_privilege('lythaus_admin', 'marketing.waitlist_signups', 'INSERT') AS admin_waitlist_insert_forbidden,
      has_column_privilege('lythaus_privacy', 'marketing.waitlist_signups', 'purge_after', 'SELECT') AS privacy_waitlist_purge_allowed,
      has_table_privilege('lythaus_privacy', 'marketing.waitlist_signups', 'DELETE') AS privacy_waitlist_delete_allowed,
      has_column_privilege('lythaus_privacy', 'marketing.waitlist_signups', 'email_ciphertext', 'SELECT') AS privacy_waitlist_ciphertext_forbidden,
      has_table_privilege('lythaus_privacy', 'privacy.legal_holds', 'SELECT') AS privacy_legal_holds_allowed,
      has_table_privilege('lythaus_privacy', 'identity.email_credentials', 'SELECT') AS privacy_credentials_read_forbidden,
      has_schema_privilege('lythaus_migrations', 'identity', 'CREATE') AS migrations_ddl_allowed,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'lythaus_runtime'), false) AS runtime_create_role_forbidden,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'lythaus_jobs'), false) AS jobs_create_role_forbidden,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'lythaus_admin'), false) AS admin_create_role_forbidden
  `);
  const privilegeRow = privileges.rows[0];
  for (const allowed of ['runtime_privacy_request_allowed', 'jobs_post_update_allowed', 'admin_decision_allowed', 'runtime_waitlist_insert_allowed', 'admin_waitlist_ciphertext_allowed', 'admin_waitlist_status_update_allowed', 'privacy_waitlist_purge_allowed', 'privacy_waitlist_delete_allowed', 'privacy_legal_holds_allowed', 'migrations_ddl_allowed']) {
    if (privilegeRow[allowed] !== true) throw new Error(`PostgreSQL 17 role contract missing allowed privilege: ${allowed}`);
  }
  for (const forbidden of ['runtime_legal_holds_forbidden', 'runtime_waitlist_read_forbidden', 'admin_waitlist_hmac_forbidden', 'admin_waitlist_insert_forbidden', 'privacy_waitlist_ciphertext_forbidden', 'runtime_content_ddl_forbidden', 'runtime_database_ddl_forbidden', 'jobs_privacy_ddl_forbidden', 'jobs_database_ddl_forbidden', 'privacy_credentials_read_forbidden', 'runtime_create_role_forbidden', 'jobs_create_role_forbidden', 'admin_create_role_forbidden']) {
    if (privilegeRow[forbidden] !== false) throw new Error(`PostgreSQL 17 role contract unexpectedly grants forbidden privilege: ${forbidden}`);
  }

  const fixture = {
    userId: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1a',
    postId: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1b',
    requestId: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1c',
    orphanId: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1d',
    missingUserId: '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1e',
  };
  await client.query('BEGIN');
  try {
    await client.query('INSERT INTO identity.users (id, display_name) VALUES ($1, $2)', [fixture.userId, 'PostgreSQL 17 fixture']);
    await client.query('INSERT INTO social.profiles (user_id, bio) VALUES ($1, $2)', [fixture.userId, 'Synthetic validation fixture']);
    await client.query(
      `INSERT INTO content.posts (id, author_id, body, declared_creation_mode, moderation_state)
       VALUES ($1, $2, 'Synthetic PostgreSQL 17 validation post', 'human', 'allowed')`,
      [fixture.postId, fixture.userId],
    );
    await expectSqlState(
      client,
      'duplicate_user',
      'INSERT INTO identity.users (id) VALUES ($1)',
      [fixture.userId],
      '23505',
    );
    await expectSqlState(
      client,
      'orphan_post',
      `INSERT INTO content.posts (id, author_id, body, declared_creation_mode)
       VALUES ($1, $2, 'Orphan validation post', 'human')`,
      [fixture.orphanId, fixture.missingUserId],
      '23503',
    );
    await client.query('SET LOCAL ROLE lythaus_runtime');
    await client.query(
      `INSERT INTO privacy.requests (id, subject_id, request_type)
       VALUES ($1, $2, 'export')`,
      [fixture.requestId, fixture.userId],
    );
    await expectSqlState(
      client,
      'runtime_legal_hold_read',
      'SELECT 1 FROM privacy.legal_holds LIMIT 1',
      [],
      '42501',
    );
    await expectSqlState(
      client,
      'runtime_ddl',
      'CREATE TABLE content.runtime_forbidden (id integer)',
      [],
      '42501',
    );
    await client.query('RESET ROLE');
    await client.query('SELECT privacy.reconcile_subject_data_locations($1)', [fixture.userId]);
    const locator = await client.query(
      'SELECT count(*)::integer AS count FROM privacy.subject_data_locations WHERE subject_id = $1',
      [fixture.userId],
    );
    if (Number(locator.rows[0]?.count ?? 0) < 3) throw new Error('subject locator reconciliation did not identify the synthetic user, profile, post, and privacy request');
  } finally {
    await client.query('ROLLBACK');
  }
  const rollback = await client.query('SELECT count(*)::integer AS count FROM identity.users WHERE id = $1', [fixture.userId]);
  if (Number(rollback.rows[0]?.count ?? 0) !== 0) throw new Error('transaction rollback left synthetic PostgreSQL 17 fixture data behind');
  const transactionChecks = {
    duplicateRejected: true,
    orphanRejected: true,
    runtimeLegalHoldReadRejected: true,
    runtimeDdlRejected: true,
    subjectLocatorReconciled: true,
    rollbackClean: true,
  };
  console.log(JSON.stringify({ serverVersion: version.rows[0].version, migrations, checks: row, privileges: privilegeRow, transactionChecks }, null, 2));
} finally {
  await client.end();
}
