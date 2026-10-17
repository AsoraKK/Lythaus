import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import pg from 'pg';
import { loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { exactRegistryPrefix } from '../ci/planetscale-migration-reconciliation.mjs';
import { MIGRATION_0020, MIGRATION_0021 } from '../ci/planetscale-0021-only-contract.mjs';
import { classifyLocked0021State, recordCanonical0021RegistryMarker } from '../ci/planetscale-0021-registry-marker.mjs';
import { applyMediaQuarantineMigration, inspectMediaQuarantineMigration, verifyMediaQuarantineMigration } from '../ci/planetscale-media-quarantine-migration.mjs';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol), 'local PostgreSQL test URL required');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'roll-forward rehearsal requires loopback');
assert.equal(target.pathname, '/postgres', 'rehearsal requires a disposable local control cluster');
assert.equal(target.search, '', 'connection parameters must not override the local target');
assert.equal(target.hash, '');

const { migrations } = loadApprovedMigrations();
const migration = migrations.find(({ name }) => name === MIGRATION_0021);
const registry = async client => (await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version')).rows;
const ddl = /^\s*(ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i;

async function resume(client) {
  let recoveryPending = false;
  return applyMediaQuarantineMigration(client, migration, {
    beforeApply: async () => {
      const state = classifyLocked0021State(await registry(client), (await inspectMediaQuarantineMigration(client)).state);
      if (state.action === 'BLOCK') throw new Error(state.reason);
      if (state.action === 'ALREADY_RECORDED') return false;
      if (state.action === 'RECOVER_MARKER') { recoveryPending = true; return false; }
      assert.equal(state.action, 'APPLY_DDL');
      return true;
    },
    afterVerified: async ({ applied }) => {
      if (applied || recoveryPending) {
        await recordCanonical0021RegistryMarker(client, migration, () => verifyMediaQuarantineMigration(client));
      }
    },
  });
}

async function baseline(client) {
  const pending = [];
  for (const entry of migrations.filter(({ name }) => name !== MIGRATION_0021)) {
    await client.query('BEGIN');
    try {
      await client.query(entry.contents.toString('utf8'));
      pending.push(entry);
      if ((await client.query("SELECT to_regclass('system.schema_migrations') AS registry")).rows[0].registry) {
        for (const item of pending.splice(0)) {
          await client.query('INSERT INTO system.schema_migrations (version, checksum) VALUES ($1, $2)', [item.name, item.checksum]);
        }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  assert.equal(pending.length, 0);
  assert.ok(exactRegistryPrefix(await registry(client), MIGRATION_0020));
}

test('0021 local PG17 roll-forward preserves data across DDL interruption and marker failure', { timeout: 120_000 }, async t => {
  const database = `lythaus_cutover_0021_${randomUUID().replaceAll('-', '')}`;
  const control = new pg.Client({ connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 5000 });
  const clients = [];
  let created = false;
  const local = new URL(target); local.pathname = `/${database}`;
  const open = async () => {
    const client = new pg.Client({ connectionString: local.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    await client.connect(); clients.push(client);
    await client.query("SET statement_timeout='30s'");
    return client;
  };
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await control.query(`CREATE DATABASE ${database}`); created = true;
    const admin = await open(), builder = await open(), blocker = await open();
    await baseline(admin);
    const owner = '0199ed00-0000-7000-8000-000000000001';
    await admin.query('INSERT INTO identity.users (id, display_name) VALUES ($1, $2)', [owner, 'Disposable contingency fixture']);
    for (const [id, purpose, status] of [
      ['0199ed00-0000-7000-8000-000000000002', 'standard', 'expired'],
      ['0199ed00-0000-7000-8000-000000000003', 'standard', 'approved'],
      ['0199ed00-0000-7000-8000-000000000004', 'authenticity_alpha', 'cancelled'],
    ]) {
      await admin.query(`INSERT INTO media.upload_sessions
        (id,user_id,object_key,content_type,expected_bytes,checksum_sha256,status,expires_at,purpose)
        VALUES ($1::uuid,$2,$1::uuid::text,'image/png',100,$3,$4,'2026-01-01T00:00:00Z',$5)`, [id, owner, 'a'.repeat(64), status, purpose]);
    }
    const snapshot = async () => (await admin.query("SELECT to_jsonb(s) - 'quarantine_deleted_at' AS row FROM media.upload_sessions s ORDER BY id")).rows;
    const original = await snapshot(), prefix = await registry(admin);
    const unchanged = async () => {
      assert.deepEqual(await snapshot(), original);
      assert.equal((await admin.query('SELECT count(*)::integer AS count FROM media.upload_sessions WHERE quarantine_deleted_at IS NOT NULL')).rows[0].count, 0);
    };

    await t.test('interruption after column commit leaves a resumable exact 0020 prefix', async () => {
      assert.equal((await inspectMediaQuarantineMigration(admin)).state, 'NOT_APPLIED');
      const interrupted = { query: async (sql, values) => {
        if (/^CREATE INDEX CONCURRENTLY/.test(sql)) throw new Error('synthetic_interruption_before_index');
        return admin.query(sql, values);
      } };
      await assert.rejects(resume(interrupted), /synthetic_interruption_before_index/);
      assert.equal((await inspectMediaQuarantineMigration(admin)).state, 'COLUMN_ONLY');
      assert.deepEqual(await registry(admin), prefix);
      await unchanged();
    });

    await t.test('real cancellation leaves an inactive invalid index for the bounded retry', async () => {
      await blocker.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await blocker.query('SELECT count(*) FROM media.upload_sessions');
      await admin.query('SELECT pg_current_xact_id()');
      const pid = (await builder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const building = resume(builder).then(value => ({ value }), error => ({ error }));
      let outcome;
      try {
        const deadline = Date.now() + 15_000;
        let waiting = false;
        while (Date.now() < deadline) {
          if ((await admin.query('SELECT phase FROM pg_stat_progress_create_index WHERE pid=$1', [pid])).rows[0]?.phase === 'waiting for old snapshots') { waiting = true; break; }
          await delay(25);
        }
        assert.ok(waiting, 'the real concurrent build must reach the old-snapshot barrier');
        assert.equal((await inspectMediaQuarantineMigration(admin)).state, 'INVALID_INDEX_ACTIVE');
      } finally {
        await admin.query('SELECT pg_cancel_backend($1)', [pid]);
        await blocker.query('ROLLBACK');
        outcome = await building;
      }
      assert.equal(outcome.error?.code, '57014');
      assert.equal((await inspectMediaQuarantineMigration(admin)).state, 'INVALID_INDEX_RETRYABLE');
      assert.deepEqual(await registry(admin), prefix);
      await unchanged();
    });

    await t.test('retry replaces only the exact invalid index and rolls back a failed marker transaction', async () => {
      const statements = [];
      const failedMarker = { query: async (sql, values) => {
        statements.push(sql);
        const result = await admin.query(sql, values);
        if (/^INSERT INTO system.schema_migrations/.test(sql) && values?.[0] === MIGRATION_0021) throw new Error('synthetic_failure_after_marker_insert');
        return result;
      } };
      await assert.rejects(resume(failedMarker), /synthetic_failure_after_marker_insert/);
      assert.deepEqual(statements.filter(sql => ddl.test(sql)).map(sql => sql.trim().split('\n')[0]), [
        'DROP INDEX CONCURRENTLY media.media_upload_quarantine_cleanup_idx',
        'CREATE INDEX CONCURRENTLY media_upload_quarantine_cleanup_idx',
      ]);
      assert.equal((await inspectMediaQuarantineMigration(admin)).state, 'FULLY_APPLIED');
      assert.deepEqual(await registry(admin), prefix);
      await unchanged();
    });

    await t.test('exact schema recovers only its canonical marker and a second retry makes no writes', async () => {
      let inserts = 0;
      const markerOnly = { query: async (sql, values) => {
        assert.doesNotMatch(sql, ddl, 'recovery must not repeat schema DDL');
        if (/^INSERT INTO system.schema_migrations/.test(sql)) {
          inserts += 1; assert.deepEqual(values, [MIGRATION_0021, migration.checksum]);
        } else assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE)\b/i);
        return admin.query(sql, values);
      } };
      await resume(markerOnly);
      assert.equal(inserts, 1);
      assert.ok(exactRegistryPrefix(await registry(admin), MIGRATION_0021));
      await resume(markerOnly);
      assert.equal(inserts, 1);
      await verifyMediaQuarantineMigration(admin);
      await unchanged();
      await admin.query(fs.readFileSync('database/planetscale/recovery/restore-verify.sql', 'utf8'));
    });

    await t.test('checksum mismatch and schema drift refuse further writes', async () => {
      const readOnly = { query: async (sql, values) => {
        assert.doesNotMatch(sql, /^\s*(ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i);
        return admin.query(sql, values);
      } };
      await admin.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', ['0'.repeat(64), MIGRATION_0021]);
      const mismatched = await registry(admin);
      await assert.rejects(resume(readOnly), /0021_registry_prefix_not_exact_through_0020/);
      assert.deepEqual(await registry(admin), mismatched);
      await admin.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', [migration.checksum, MIGRATION_0021]);
      await admin.query('ALTER TABLE media.upload_sessions ALTER COLUMN quarantine_deleted_at SET DEFAULT now()');
      await assert.rejects(resume(readOnly), /0021_registry_requires_exact_postconditions/);
      await unchanged();
    });
    t.diagnostic(JSON.stringify({ postgresMajor: 17, baselineMigrations: prefix.length, fixtureRows: original.length,
      fixtureSha256: createHash('sha256').update(JSON.stringify(original)).digest('hex'), productionDataUsed: false }));
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
    if (created) await control.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await control.end();
  }
});
