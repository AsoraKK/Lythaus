import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

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

const migrationDir = path.join(root, 'database', 'planetscale', 'migrations');
const migrations = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
const client = new Client({ connectionString, ssl: false });
await client.connect();
try {
  const version = await client.query('SELECT current_setting(\'server_version_num\')::integer AS version');
  if (Number(version.rows[0]?.version) < 170000 || Number(version.rows[0]?.version) >= 180000) throw new Error(`local compatibility server must be PostgreSQL 17.x; found ${version.rows[0]?.version}`);
  for (const file of migrations) {
    process.stdout.write(`Applying ${file}\n`);
    await client.query(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
  }
  const grants = fs.readFileSync(path.join(root, 'database', 'planetscale', 'grants', 'roles.sql'), 'utf8');
  for (const role of ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations']) {
    await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role}; END IF; END $$;`);
  }
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
      (SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_trgm', 'unaccent')) AS extension_count,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_schema IN ('identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'system')) AS relation_count,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'system')
          AND c.relkind IN ('r', 'p')) AS table_count
  `);
  const row = checks.rows[0];
  for (const field of ['users', 'posts', 'subject_locations', 'idempotency', 'contact_emails', 'locator_function', 'retention_function', 'budget_periods', 'budget_reservations', 'usage_events', 'kill_switches']) if (!row[field]) throw new Error(`PostgreSQL 17 compatibility check missing ${field}`);
  if (Number(row.extension_count) !== 3) throw new Error(`PostgreSQL 17 compatibility check expected 3 required extensions, found ${row.extension_count}`);
  if (Number(row.relation_count) !== 85) throw new Error(`PostgreSQL 17 compatibility check expected 85 local application relations after migration 0011, found ${row.relation_count}`);
  if (Number(row.relation_count) + 2 !== 87) throw new Error(`PostgreSQL 17 compatibility check expected 87 PlanetScale relations including two provider extension views, found ${Number(row.relation_count) + 2}`);
  if (Number(row.table_count) !== 84) throw new Error(`PostgreSQL 17 compatibility check expected 84 launch tables after migration 0011, found ${row.table_count}`);

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
      has_table_privilege('lythaus_privacy', 'privacy.legal_holds', 'SELECT') AS privacy_legal_holds_allowed,
      has_table_privilege('lythaus_privacy', 'identity.email_credentials', 'SELECT') AS privacy_credentials_read_forbidden,
      has_schema_privilege('lythaus_migrations', 'identity', 'CREATE') AS migrations_ddl_allowed,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'lythaus_runtime'), false) AS runtime_create_role_forbidden,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'lythaus_jobs'), false) AS jobs_create_role_forbidden,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'lythaus_admin'), false) AS admin_create_role_forbidden
  `);
  const privilegeRow = privileges.rows[0];
  for (const allowed of ['runtime_privacy_request_allowed', 'jobs_post_update_allowed', 'admin_decision_allowed', 'privacy_legal_holds_allowed', 'migrations_ddl_allowed']) {
    if (privilegeRow[allowed] !== true) throw new Error(`PostgreSQL 17 role contract missing allowed privilege: ${allowed}`);
  }
  for (const forbidden of ['runtime_legal_holds_forbidden', 'runtime_content_ddl_forbidden', 'runtime_database_ddl_forbidden', 'jobs_privacy_ddl_forbidden', 'jobs_database_ddl_forbidden', 'privacy_credentials_read_forbidden', 'runtime_create_role_forbidden', 'jobs_create_role_forbidden', 'admin_create_role_forbidden']) {
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
