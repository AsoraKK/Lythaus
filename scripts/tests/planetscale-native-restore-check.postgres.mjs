import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';
import { loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { RESTORE, ROLE_NAMES } from '../ci/planetscale-native-restore-contract.mjs';
import { collectRestoreCatalog } from '../ci/planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from '../ci/planetscale-native-restore-smoke.mjs';

test('disposable PG17 verifies actual catalog SQL, all 17 restored privileges and actual Worker read-only readiness routes', { timeout: 120000 }, async () => {
  const controlUrl = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: controlUrl.toString(), ssl: false });
  const database = `lythaus_auth_test_post_restore_${randomUUID().replaceAll('-', '')}`;
  const ownedRoles = []; let created = false, client;
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    const existing = await control.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [ROLE_NAMES]);
    assert.equal(existing.rows.length, 0, 'fixture roles must not preexist');
    for (const role of ROLE_NAMES) {
      await control.query(`CREATE ROLE "${role}" LOGIN PASSWORD 'synthetic-restore-only'`); ownedRoles.push(role);
    }
    await control.query(`CREATE DATABASE "${database}"`); created = true;
    const local = new URL(controlUrl); local.pathname = '/' + database;
    client = new pg.Client({ connectionString: local.toString(), ssl: false }); await client.connect();
    const migrations = loadApprovedMigrations().migrations.slice(0, 21); const pending = [];
    for (const migration of migrations) {
      await client.query(migration.contents.toString('utf8')); pending.push(migration);
      if ((await client.query("SELECT to_regclass('system.schema_migrations') AS registry")).rows[0].registry) {
        for (const row of pending.splice(0)) await client.query('INSERT INTO system.schema_migrations(version,checksum) VALUES ($1,$2)', [row.name, row.checksum]);
      }
    }
    for (const role of ROLE_NAMES) {
      await client.query(`GRANT USAGE ON SCHEMA system TO "${role}"`);
      await client.query(`GRANT SELECT ON system.schema_migrations TO "${role}"`);
    }
    await client.query(`GRANT USAGE ON SCHEMA trust,editorial TO "${RESTORE.runtime}"`);
    await client.query(`GRANT SELECT (id,user_id,reward_id,reward_level,reward_title,redeemed_at,status),
      INSERT (id,user_id,reward_id,reward_level,reward_title) ON trust.reward_redemptions TO "${RESTORE.runtime}"`);
    await client.query(`GRANT SELECT (id,title,post_id,published_at) ON editorial.publications TO "${RESTORE.runtime}"`);
    await client.query('BEGIN READ ONLY');
    const baseline = await collectRestoreCatalog(client); await client.query('ROLLBACK');
    assert.equal(baseline.approvedPrivilegeChecks, 17); assert.equal(baseline.extensionCount, 3);
    assert.match(baseline.catalogSha256, /^[a-f0-9]{64}$/);
    const branch = 'synthetictarget';
    const urls = Object.fromEntries(['runtime','admin','jobs','privacy'].map(name => [name,
      `postgresql://${RESTORE[name]}.${branch}:synthetic-restore-only@aws.connect.psdb.cloud/postgres?sslmode=verify-full`]));
    const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
    const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
    const result = await runRestoreSmoke(urls, branch, baseline, await buildRestoreSmoke(), options => {
      for (const worker of options.workers) for (const binding of Object.keys(worker.hyperdrives ?? {})) {
        const role = decodeURIComponent(new URL(worker.hyperdrives[binding]).username).split('.')[0];
        const url = new URL(local); url.username = role; url.password = 'synthetic-restore-only'; url.search = '?sslmode=disable';
        worker.hyperdrives[binding] = url.toString();
      }
      const mf = new Miniflare(convertV4MiniflareOptions(options));
      return { dispose: () => mf.dispose(), getWorker: async name => {
        const worker = await mf.getWorker(name);
        return { fetch: async (...args) => {
          const response = await worker.fetch(...args); const body = await response.clone().json();
          assert.equal(body.readiness, 'pass', JSON.stringify(body));
          return response;
        } };
      } };
    });
    assert.equal(result.services, 3); assert.equal(result.distinctRoles, 4); assert.equal(result.externalHttpRequests, 0);
    await client.query(`REVOKE SELECT (id) ON editorial.publications FROM "${RESTORE.runtime}"`);
    await client.query('BEGIN READ ONLY');
    await assert.rejects(() => collectRestoreCatalog(client), /restored_approved_grants_not_present/); await client.query('ROLLBACK');
    await client.query("UPDATE system.schema_migrations SET checksum='tampered' WHERE version='0020_auth_recovery_delivery.sql'");
    await client.query('BEGIN READ ONLY');
    await assert.rejects(() => collectRestoreCatalog(client), /exact_pre_0021_registry_required/); await client.query('ROLLBACK');
  } finally {
    if (client) await client.end();
    if (created) await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    for (const role of ownedRoles.reverse()) await control.query(`DROP ROLE "${role}"`);
    await control.end();
  }
});
