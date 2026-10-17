import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import pg from 'pg';
import { APPROVED_MIGRATIONS, loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { assertCompleteMigrationPostconditions, classifyMigrationState, incrementalRegistryHead } from '../ci/planetscale-migration-reconciliation.mjs';
import { applyMediaQuarantineMigration, inspectMediaQuarantineMigration, verifyMediaQuarantineMigration } from '../ci/planetscale-media-quarantine-migration.mjs';
import { MEDIA_QUARANTINE_MIGRATION_NAME, splitMediaQuarantineMigration } from '../ci/planetscale-media-quarantine-contract.mjs';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol), 'local PostgreSQL 17 test URL is required');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'migration regressions refuse hosted databases');
assert.ok(['/postgres', '/lythaus_auth_test_post_control'].includes(target.pathname), 'migration regressions require a local control database');
assert.ok([...target.searchParams].every(([key, value]) => key === 'sslmode' && value === 'disable'), 'connection options cannot override the local target');
assert.equal(target.hash, '');

const quote = value => `"${value.replaceAll('"', '""')}"`;
const mutation = /^\s*(?:ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i;
const migration = loadApprovedMigrations().migrations.find(({ name }) => name === MEDIA_QUARANTINE_MIGRATION_NAME);
const { concurrentIndexSql } = splitMediaQuarantineMigration(migration.contents.toString('utf8'));

function readOnlyObserver(client) {
  const statements = [];
  return {
    statements,
    async query(sql, values) {
      statements.push(sql);
      assert.doesNotMatch(sql, mutation, 'a refused migration must not attempt DDL or registry mutation');
      return client.query(sql, values);
    },
  };
}

async function waitForOldSnapshot(admin, pid) {
  const deadline = Date.now() + 15_000;
  let phase;
  while (Date.now() < deadline) {
    const result = await admin.query('SELECT phase FROM pg_stat_progress_create_index WHERE pid = $1', [pid]);
    phase = result.rows[0]?.phase;
    if (phase === 'waiting for old snapshots') return;
    await delay(25);
  }
  throw new Error(`concurrent index did not reach the old-snapshot barrier; last phase: ${phase ?? 'absent'}`);
}

test('0021 real PG17 effective progress visibility and canonical marker drift', { timeout: 120_000 }, async t => {
  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `lythaus_media_migration_${suffix}`;
  const roles = {
    builder: `media_builder_${suffix}`,
    noinherit: `media_noinherit_${suffix}`,
    effective: `media_effective_${suffix}`,
  };
  const localPassword = randomUUID();
  const local = new URL(target); local.pathname = `/${databaseName}`;
  const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
  const clients = [];
  const createdRoles = [];
  let created = false;
  async function open(role) {
    const url = new URL(local);
    if (role) { url.username = role; url.password = localPassword; }
    const client = new pg.Client({ connectionString: url.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    await client.connect();
    clients.push(client);
    await client.query("SET statement_timeout = '60s'");
    return client;
  }
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await control.query(`CREATE DATABASE ${quote(databaseName)}`); created = true;
    for (const [kind, role] of Object.entries(roles)) {
      await control.query(`CREATE ROLE ${quote(role)} LOGIN NOSUPERUSER ${kind === 'noinherit' ? 'NOINHERIT' : 'INHERIT'} PASSWORD '${localPassword}'`);
      createdRoles.push(role);
    }
    await control.query(`GRANT pg_read_all_stats TO ${quote(roles.noinherit)} WITH INHERIT FALSE`);
    await control.query(`GRANT pg_read_all_stats TO ${quote(roles.effective)} WITH INHERIT TRUE`);
    await control.query(`GRANT ${quote(roles.builder)} TO ${quote(roles.effective)} WITH INHERIT TRUE`);
    const admin = await open();
    await admin.query('CREATE SCHEMA system; CREATE TABLE system.schema_migrations (version text PRIMARY KEY, checksum text NOT NULL)');
    await admin.query(`GRANT USAGE ON SCHEMA system TO ${quote(roles.effective)}; GRANT INSERT ON system.schema_migrations TO ${quote(roles.effective)}`);
    const builder = await open(roles.builder);
    const noinherit = await open(roles.noinherit);
    const effective = await open(roles.effective);
    const blocker = await open();

    async function resetFixture(marker, recorded, { index = true, partitioned = false } = {}) {
      await admin.query(`DROP SCHEMA IF EXISTS media CASCADE; CREATE SCHEMA media AUTHORIZATION ${quote(roles.builder)}`);
      await admin.query(`CREATE TABLE media.upload_sessions (
        id uuid PRIMARY KEY, expires_at timestamptz NOT NULL, purpose text NOT NULL, status text NOT NULL,
        quarantine_deleted_at ${marker}
      )${partitioned ? ' PARTITION BY HASH (id)' : ''}`);
      await admin.query(`ALTER TABLE media.upload_sessions OWNER TO ${quote(roles.builder)}`);
      if (partitioned) await admin.query('CREATE TABLE media.upload_sessions_part PARTITION OF media.upload_sessions FOR VALUES WITH (MODULUS 1, REMAINDER 0)');
      await admin.query(`GRANT USAGE ON SCHEMA media TO ${quote(roles.noinherit)}`);
      if (index) await admin.query(partitioned ? concurrentIndexSql.replace('CREATE INDEX CONCURRENTLY', 'CREATE INDEX') : concurrentIndexSql);
      await admin.query('TRUNCATE system.schema_migrations');
      const prefix = recorded ? APPROVED_MIGRATIONS : APPROVED_MIGRATIONS.slice(0, -1);
      await admin.query('INSERT INTO system.schema_migrations SELECT * FROM unnest($1::text[], $2::text[])',
        [prefix.map(({ name }) => name), prefix.map(({ appliedSha256 }) => appliedSha256)]);
    }
    async function registry() {
      return (await admin.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')).rows;
    }
    async function schemaSnapshot() {
      return (await admin.query(`SELECT relation_entry.relkind, attribute.attgenerated, attribute.attidentity,
        pg_get_expr(default_value.adbin, default_value.adrelid) AS expression,
        index_entry.indexrelid, index_entry.indisvalid, index_entry.indisready, pg_get_indexdef(index_entry.indexrelid) AS definition
        FROM pg_attribute attribute JOIN pg_class relation_entry ON relation_entry.oid = attribute.attrelid
        LEFT JOIN pg_attrdef default_value ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
        JOIN pg_index index_entry ON index_entry.indexrelid = to_regclass('media.media_upload_quarantine_cleanup_idx')
        WHERE attribute.attrelid = to_regclass('media.upload_sessions') AND attribute.attname = 'quarantine_deleted_at'`)).rows;
    }

    await t.test('NOINHERIT MEMBER hides live progress and cannot authorize invalid-index cleanup', async () => {
      await resetFixture('timestamptz', false, { index: false });
      await blocker.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await blocker.query('SELECT count(*) FROM media.upload_sessions');
      await admin.query('SELECT pg_current_xact_id()');
      const pid = (await builder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const building = builder.query(concurrentIndexSql).then(() => ({ succeeded: true }), error => ({ error }));
      try {
        await waitForOldSnapshot(admin, pid);
        const privileges = (await noinherit.query(`SELECT
          pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER') AS member,
          pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') AS effective`)).rows[0];
        assert.deepEqual(privileges, { member: true, effective: false });
        const hidden = (await noinherit.query('SELECT relid, index_relid, phase FROM pg_stat_progress_create_index WHERE pid = $1', [pid])).rows;
        assert.deepEqual(hidden, [{ relid: null, index_relid: null, phase: null }]);
        assert.equal((await inspectMediaQuarantineMigration(noinherit)).state, 'INVALID_INDEX_REVIEW_REQUIRED');
        assert.equal((await effective.query("SELECT pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') AS effective")).rows[0].effective, true);
        assert.equal((await inspectMediaQuarantineMigration(effective)).state, 'INVALID_INDEX_ACTIVE');
        const before = await registry();
        for (const client of [noinherit, effective]) {
          const guarded = readOnlyObserver(client);
          let recorded = false;
          await assert.rejects(applyMediaQuarantineMigration(guarded, migration, { afterVerified: async () => {
            recorded = true;
            await guarded.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
          } }), /0021 staged migration stopped/);
          assert.equal(recorded, false);
          assert.ok(guarded.statements.every(sql => !mutation.test(sql)));
        }
        assert.deepEqual(await registry(), before);
      } finally {
        await admin.query('SELECT pg_cancel_backend($1)', [pid]);
        await blocker.query('ROLLBACK');
        const outcome = await building;
        assert.equal(outcome.error?.code, '57014', 'the real cancelled concurrent build must leave an invalid index');
      }
      assert.equal((await inspectMediaQuarantineMigration(effective)).state, 'INVALID_INDEX_RETRYABLE');
      await applyMediaQuarantineMigration(effective, migration, { afterVerified: async () => {
        await effective.query('BEGIN');
        try {
          await verifyMediaQuarantineMigration(effective);
          await effective.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
          await effective.query('COMMIT');
        } catch (error) { await effective.query('ROLLBACK'); throw error; }
      } });
      assert.equal(incrementalRegistryHead(await registry()), migration.name);
      await verifyMediaQuarantineMigration(admin);
    });

    for (const [shape, marker] of [
      ['default', 'timestamptz DEFAULT clock_timestamp()'],
      ['generated', 'timestamptz GENERATED ALWAYS AS (NULL::timestamptz) STORED'],
    ]) {
      for (const recorded of [true, false]) {
        await t.test(`${shape} marker drift fails closed with a valid ${recorded ? 'recorded' : 'unrecorded'} index`, async () => {
          await resetFixture(marker, recorded);
          const before = { registry: await registry(), schema: await schemaSnapshot() };
          assert.equal(incrementalRegistryHead(before.registry), recorded ? migration.name : APPROVED_MIGRATIONS.at(-2).name);
          assert.ok(before.schema.every(row => row.indisvalid && row.indisready));
          const guarded = readOnlyObserver(admin);
          const [state] = await classifyMigrationState(guarded, [migration.name]);
          assert.equal(state.state, 'PARTIALLY_APPLIED');
          assert.equal(state.artifacts.find(({ artifact }) => artifact === 'media_quarantine_marker_contract').present, false);
          assert.throws(() => assertCompleteMigrationPostconditions(state), /media_quarantine_marker_contract/);
          let registryCallback = false;
          if (recorded) {
            await assert.rejects(verifyMediaQuarantineMigration(guarded), /0021 exact staged postconditions failed/);
          } else {
            await assert.rejects(applyMediaQuarantineMigration(guarded, migration, { afterVerified: async () => {
              registryCallback = true;
              await guarded.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
            } }), /0021 staged migration stopped/);
          }
          assert.equal(registryCallback, false);
          assert.ok(guarded.statements.every(sql => !mutation.test(sql)));
          assert.deepEqual({ registry: await registry(), schema: await schemaSnapshot() }, before);
        });
      }
    }
    await t.test('a partitioned marker relation cannot satisfy the regular-table contract', async () => {
      await resetFixture('timestamptz', true, { partitioned: true });
      const before = { registry: await registry(), schema: await schemaSnapshot() };
      const guarded = readOnlyObserver(admin);
      const [state] = await classifyMigrationState(guarded, [migration.name]);
      assert.equal(state.artifacts.find(({ artifact }) => artifact === 'media_quarantine_marker_contract').present, false);
      await assert.rejects(verifyMediaQuarantineMigration(guarded), /not a regular table/);
      assert.deepEqual({ registry: await registry(), schema: await schemaSnapshot() }, before);
    });
  } finally {
    await Promise.all(clients.map(client => client.end()));
    if (created) await control.query(`DROP DATABASE ${quote(databaseName)} WITH (FORCE)`);
    for (const role of createdRoles.reverse()) await control.query(`DROP ROLE ${quote(role)}`);
    await control.end();
  }
});
