import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';
import { loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { RESTORE, ROLE_NAMES } from '../ci/planetscale-native-restore-contract.mjs';
import { collectRestoreCatalog, inspectExtensionAuthority, installMissingExtensions } from '../ci/planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from '../ci/planetscale-native-restore-smoke.mjs';

test('disposable PG17 verifies actual catalog SQL, all 17 restored privileges and actual Worker read-only readiness routes', { timeout: 120000 }, async () => {
  const controlUrl = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: controlUrl.toString(), ssl: false });
  const database = `lythaus_auth_test_post_restore_${randomUUID().replaceAll('-', '')}`;
  const targetDatabase = `lythaus_auth_test_restore_target_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const ownedRoles = []; let created = false, targetCreated = false, client, targetClient;
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    const existing = await control.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [ROLE_NAMES]);
    assert.equal(existing.rows.length, 0, 'fixture roles must not preexist');
    for (const role of ROLE_NAMES) {
      const attributes = role === RESTORE.setup ? 'CREATEDB CREATEROLE REPLICATION BYPASSRLS' : 'NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
      await control.query(`CREATE ROLE "${role}" LOGIN PASSWORD 'synthetic-restore-only' ${attributes} NOSUPERUSER`); ownedRoles.push(role);
    }
    await control.query(`GRANT postgres TO "${RESTORE.setup}"`);
    await control.query(`GRANT pg_read_all_data TO "${RESTORE.setup}"`);
    await control.query(`GRANT pg_write_all_data TO "${RESTORE.setup}"`);
    await control.query(`CREATE DATABASE "${database}"`); created = true;
    const local = new URL(controlUrl); local.pathname = '/' + database;
    client = new pg.Client({ connectionString: local.toString(), ssl: false }); await client.connect();
    await client.query("CREATE EXTENSION pg_trgm WITH SCHEMA public VERSION '1.3'");
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
    assert.deepEqual(baseline.extensionSpecifications.find(row => row.extname === 'unaccent'), {
      extname: 'unaccent', extversion: '1.1', schema: 'public', owner: 'postgres', extrelocatable: true });
    assert.equal(baseline.extensionSpecifications.find(row => row.extname === 'pg_trgm').extversion, '1.3');
    await client.end(); client = undefined;
    await control.query(`CREATE DATABASE "${targetDatabase}" TEMPLATE "${database}"`); targetCreated = true;
    client = new pg.Client({ connectionString: local.toString(), ssl: false }); await client.connect();
    const targetUrl = new URL(local); targetUrl.pathname = '/' + targetDatabase;
    targetClient = new pg.Client({ connectionString: targetUrl.toString(), ssl: false }); await targetClient.connect();
    await targetClient.query('DROP EXTENSION unaccent');
    await targetClient.query('BEGIN');
    await targetClient.query(`SET LOCAL ROLE "${RESTORE.setup}"`);
    await targetClient.query('CREATE EXTENSION unaccent');
    await targetClient.query('SET LOCAL ROLE NONE');
    const naive = await collectRestoreCatalog(targetClient);
    assert.equal(naive.extensionSpecifications.find(row => row.extname === 'unaccent').owner, RESTORE.setup);
    assert.notEqual(naive.catalogSha256, baseline.catalogSha256, 'the original default-owner installation cannot certify this source');
    await targetClient.query('ROLLBACK');
    const ddlCalls = [], setupUrl = new URL(targetUrl); setupUrl.username = RESTORE.setup; setupUrl.password = 'synthetic-restore-only';
    const extensionClient = () => {
      const actual = new pg.Client({ connectionString: setupUrl.toString(), ssl: false });
      return { connect: () => actual.connect(), end: () => actual.end(), on: (...args) => actual.on(...args),
        query: async (...args) => {
          ddlCalls.push(args[0]); const result = await actual.query(...args);
          // The local database has a disposable name; only the session's database-name assertion is adapted.
          if (args[0].includes('current_database() AS database')) result.rows[0].database = 'postgres';
          return result;
        } };
    };
    const branch = 'synthetictarget';
    const setupRaw = `postgresql://${RESTORE.setup}.${branch}:synthetic-restore-only@aws.connect.psdb.cloud/postgres?sslmode=verify-full`;
    const probe = specs => inspectExtensionAuthority(setupRaw, branch, extensionClient, undefined, specs);
    const install = specs => installMissingExtensions(setupRaw, branch, ['unaccent'], extensionClient, undefined, specs);
    const unavailable = baseline.extensionSpecifications.map(row => row.extname === 'unaccent' ? { ...row, extversion: '999.0' } : row);
    await assert.rejects(() => probe(unavailable), /required_extension_version_or_schema_unavailable/);
    await assert.rejects(() => install(unavailable), /required_extension_version_or_schema_unavailable/);
    const wrongExisting = baseline.extensionSpecifications.map(row => row.extname === 'pgcrypto' ? { ...row, owner: RESTORE.setup } : row);
    await assert.rejects(() => install(wrongExisting), /existing_extension_metadata_mismatch/);
    await control.query(`GRANT postgres TO "${RESTORE.setup}" WITH SET FALSE`);
    await assert.rejects(() => install(baseline.extensionSpecifications), /missing_extension_install_authority_unproven/);
    await control.query(`GRANT postgres TO "${RESTORE.setup}" WITH SET TRUE`);
    assert.equal(ddlCalls.filter(sql => sql.startsWith('CREATE EXTENSION')).length, 0);
    assert.deepEqual(await probe(baseline.extensionSpecifications), ['unaccent']);
    await install(baseline.extensionSpecifications);
    assert.equal(ddlCalls.filter(sql => sql === 'CREATE EXTENSION "unaccent" WITH SCHEMA "public" VERSION \'1.1\'').length, 1);
    assert.deepEqual(await collectRestoreCatalog(targetClient), baseline, 'separate restored-like database must exactly match source including extension owner/version/schema');
    assert.deepEqual(await collectRestoreCatalog(client), baseline, 'source is unchanged');
    const urls = Object.fromEntries(['runtime','admin','jobs','privacy'].map(name => [name,
      `postgresql://${RESTORE[name]}.${branch}:synthetic-restore-only@aws.connect.psdb.cloud/postgres?sslmode=verify-full`]));
    const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
    const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
    const scripts = await buildRestoreSmoke();
    const targetRuntime = options => {
      for (const worker of options.workers) for (const binding of Object.keys(worker.hyperdrives ?? {})) {
        const role = decodeURIComponent(new URL(worker.hyperdrives[binding]).username).split('.')[0];
        const url = new URL(targetUrl); url.username = role; url.password = 'synthetic-restore-only'; url.search = '?sslmode=disable';
        assert.equal(url.pathname, '/' + targetDatabase);
        assert.notEqual(url.pathname, '/' + database);
        worker.hyperdrives[binding] = url.toString();
      }
      const mf = new Miniflare(convertV4MiniflareOptions(options));
      return mf;
    };
    const result = await runRestoreSmoke(urls, branch, baseline, scripts, targetRuntime);
    assert.equal(result.services, 3); assert.equal(result.distinctRoles, 4); assert.equal(result.externalHttpRequests, 0);
    const version = '0020_auth_recovery_delivery.sql';
    const checksum = (await targetClient.query('SELECT checksum FROM system.schema_migrations WHERE version=$1', [version])).rows[0].checksum;
    await targetClient.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', ['target-only-readiness-canary', version]);
    assert.deepEqual(await collectRestoreCatalog(client), baseline, 'source remains healthy while only the target is broken');
    await assert.rejects(() => runRestoreSmoke(urls, branch, baseline, scripts, targetRuntime), /isolated_application_(?:public_contract|readiness)_failed/);
    await targetClient.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', [checksum, version]);
    assert.deepEqual(await collectRestoreCatalog(targetClient), baseline);
    const staged = loadApprovedMigrations().migrations.at(-1);
    assert.equal(staged.name, '0021_media_quarantine_cleanup.sql');
    await client.query('BEGIN'); await targetClient.query('BEGIN');
    try {
      for (const connection of [client, targetClient]) {
        await connection.query(staged.contents.toString('utf8'));
        await connection.query('INSERT INTO system.schema_migrations(version,checksum) VALUES ($1,$2)', [staged.name, staged.checksum]);
      }
      const current = await collectRestoreCatalog(client, 'post-0021');
      assert.equal(current.schemaVersion, staged.name);
      assert.equal(current.schemaFingerprint, '7fdff3474c152317336d2201626b3b69aac79387264e6481576e103f82e8342d');
      assert.deepEqual(await collectRestoreCatalog(targetClient, 'post-0021'), current);
      await assert.rejects(() => collectRestoreCatalog(targetClient), /exact_pre_0021_registry_required/);

      await targetClient.query('SAVEPOINT invalid_marker');
      await targetClient.query('ALTER TABLE media.upload_sessions ALTER COLUMN quarantine_deleted_at SET NOT NULL');
      await assert.rejects(() => collectRestoreCatalog(targetClient, 'post-0021'), /media_quarantine_marker_contract/);
      await targetClient.query('ROLLBACK TO SAVEPOINT invalid_marker');
      await targetClient.query('SAVEPOINT invalid_index');
      await targetClient.query('DROP INDEX media.media_upload_quarantine_cleanup_idx');
      await targetClient.query('CREATE INDEX media_upload_quarantine_cleanup_idx ON media.upload_sessions (id)');
      await assert.rejects(() => collectRestoreCatalog(targetClient, 'post-0021'), /media_upload_quarantine_cleanup_index/);
      await targetClient.query('ROLLBACK TO SAVEPOINT invalid_index');
      await targetClient.query('SAVEPOINT invalid_checksum');
      await targetClient.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', ['synthetic-drift', staged.name]);
      await assert.rejects(() => collectRestoreCatalog(targetClient, 'post-0021'), /exact_post_0021_registry_required/);
      await targetClient.query('ROLLBACK TO SAVEPOINT invalid_checksum');
      assert.deepEqual(await collectRestoreCatalog(targetClient, 'post-0021'), current);
    } finally {
      await client.query('ROLLBACK'); await targetClient.query('ROLLBACK');
    }
    await client.query(`REVOKE SELECT (id) ON editorial.publications FROM "${RESTORE.runtime}"`);
    await client.query('BEGIN READ ONLY');
    await assert.rejects(() => collectRestoreCatalog(client), /restored_approved_grants_not_present/); await client.query('ROLLBACK');
    await client.query("UPDATE system.schema_migrations SET checksum='tampered' WHERE version='0020_auth_recovery_delivery.sql'");
    await client.query('BEGIN READ ONLY');
    await assert.rejects(() => collectRestoreCatalog(client), /exact_pre_0021_registry_required/); await client.query('ROLLBACK');
  } finally {
    if (client) await client.end();
    if (targetClient) await targetClient.end();
    if (targetCreated) await control.query(`DROP DATABASE "${targetDatabase}" WITH (FORCE)`);
    if (created) await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    for (const role of ownedRoles.reverse()) await control.query(`DROP ROLE "${role}"`);
    await control.end();
  }
});
