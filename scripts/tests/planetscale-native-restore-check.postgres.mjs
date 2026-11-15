import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';
import { loadApprovedMigrations } from '../ci/planetscale-migration-manifest.mjs';
import { RESTORE, ROLE_NAMES } from '../ci/planetscale-native-restore-contract.mjs';
import { RESTORE_PLAN_SCHEMA } from '../ci/planetscale-native-restore-plan.mjs';
import { collectRestoreCatalog, inspectExtensionAuthority, installMissingExtensions } from '../ci/planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from '../ci/planetscale-native-restore-smoke.mjs';
import {rebindGrantPayload} from '../ci/admin-subject-rebind-capability.mjs';
import {REBIND_METADATA_VERIFIER_ROLE} from '../ci/admin-subject-rebind-control.mjs';

const TEST_RESTORE_PLAN = Object.freeze({ schemaVersion: RESTORE_PLAN_SCHEMA, releaseSha: 'a'.repeat(40),
  schemaMode: 'pre-0021', sourceBranchId: RESTORE.sourceId,
  backup: Object.freeze({ id: 'syntheticrestore', completedAt: '2026-11-09T02:51:08.741Z',
    expiresAt: '2026-11-11T02:51:08.741Z', pvcBytes: RESTORE.bytes, uncompressedBytes: 1,
    protected: true, restoredBranches: Object.freeze([]) }),
  target: Object.freeze({ name: 'lythaus-0021-native-restore-check-20261109-01',
    minimumStorageBytes: RESTORE.bytes, maximumStorageBytes: RESTORE.bytes }) });

test('disposable PG17 verifies actual catalog SQL, all 17 restored privileges and actual Worker read-only readiness routes', { timeout: 120000 }, async () => {
  const controlUrl = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: controlUrl.toString(), ssl: false });
  const database = `lythaus_auth_test_post_restore_${randomUUID().replaceAll('-', '')}`;
  const targetDatabase = `lythaus_auth_test_restore_target_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const ownedRoles = []; let created = false, targetCreated = false, client, targetClient, sourceVerifier, ownedVerifier=false;
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    const existing = await control.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [ROLE_NAMES]);
    assert.equal(existing.rows.length, 0, 'fixture roles must not preexist');
    if(!(await control.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[REBIND_METADATA_VERIFIER_ROLE])).rowCount){
      await control.query(`CREATE ROLE "${REBIND_METADATA_VERIFIER_ROLE}" LOGIN NOSUPERUSER NOINHERIT`);ownedVerifier=true;
    }
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
    const result = await runRestoreSmoke(urls, branch, baseline, scripts, targetRuntime, undefined, TEST_RESTORE_PLAN);
    assert.equal(result.services, 3); assert.equal(result.distinctRoles, 4); assert.equal(result.externalHttpRequests, 0);
    const version = '0020_auth_recovery_delivery.sql';
    const checksum = (await targetClient.query('SELECT checksum FROM system.schema_migrations WHERE version=$1', [version])).rows[0].checksum;
    await targetClient.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', ['target-only-readiness-canary', version]);
    assert.deepEqual(await collectRestoreCatalog(client), baseline, 'source remains healthy while only the target is broken');
    await assert.rejects(() => runRestoreSmoke(urls, branch, baseline, scripts, targetRuntime, undefined, TEST_RESTORE_PLAN), /isolated_application_(?:public_contract|readiness)_failed/);
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
    await client.query(`GRANT SELECT (id) ON editorial.publications TO "${RESTORE.runtime}"`);
    await client.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', [checksum, version]);
    assert.deepEqual(await collectRestoreCatalog(client), baseline);

    for (const connection of [client, targetClient]) {
      await connection.query('BEGIN');
      try {
        await connection.query(staged.contents.toString('utf8'));
        await connection.query('INSERT INTO system.schema_migrations(version,checksum) VALUES ($1,$2)', [staged.name, staged.checksum]);
        await connection.query('COMMIT');
      } catch (error) {
        await connection.query('ROLLBACK'); throw error;
      }
    }
    const postSource = await collectRestoreCatalog(client, 'post-0021');
    assert.equal(postSource.schemaVersion, staged.name);
    assert.equal(postSource.schemaFingerprint, '7fdff3474c152317336d2201626b3b69aac79387264e6481576e103f82e8342d');
    assert.deepEqual(await collectRestoreCatalog(targetClient, 'post-0021'), postSource);
    const postSmoke = await runRestoreSmoke(urls, branch, postSource, scripts, targetRuntime, undefined, TEST_RESTORE_PLAN);
    assert.equal(postSmoke.services, 3); assert.equal(postSmoke.distinctRoles, 4); assert.equal(postSmoke.externalHttpRequests, 0);
    await targetClient.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', ['post-target-only-canary', staged.name]);
    try {
      assert.deepEqual(await collectRestoreCatalog(client, 'post-0021'), postSource,
        'post-0021 source remains healthy while only the target is broken');
      await assert.rejects(() => runRestoreSmoke(urls, branch, postSource, scripts, targetRuntime, undefined, TEST_RESTORE_PLAN),
        /isolated_application_(?:public_contract|readiness)_failed/);
    } finally {
      await targetClient.query('UPDATE system.schema_migrations SET checksum=$1 WHERE version=$2', [staged.checksum, staged.name]);
    }
    assert.deepEqual(await collectRestoreCatalog(targetClient, 'post-0021'), postSource);
    const capability=rebindGrantPayload(),roleMap={lythaus_runtime:RESTORE.runtime,lythaus_admin:RESTORE.admin,
      lythaus_jobs:RESTORE.jobs,lythaus_privacy:RESTORE.privacy,lythaus_migrations:RESTORE.setup};
    for(const connection of [client,targetClient]){
      await connection.query(capability.sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,name=>roleMap[name]));
      await connection.query('INSERT INTO admin_recovery.subject_rebind_control(id,singleton,capability_sha256) VALUES($1,true,$2)',
        ['01900000-0000-7000-8000-000000000099',capability.sha256]);
      await connection.query(`GRANT USAGE ON SCHEMA identity,content,social,feed,moderation,privacy,trust,media,editorial,marketing,system TO "${REBIND_METADATA_VERIFIER_ROLE}"`);
      await connection.query(`GRANT SELECT ON system.schema_migrations TO "${REBIND_METADATA_VERIFIER_ROLE}"`);
    }
    const withCapability=await collectRestoreCatalog(client,'post-0021');
    assert.equal(withCapability.rebindCapability.state,'CATALOG_VERIFIED');
    assert.equal(withCapability.rebindCapability.disabledStateVerified,true);
    assert.equal(withCapability.relationCount,postSource.relationCount,'private supplemental table is outside runtime-visible baseline');
    assert.equal(withCapability.catalogRelationCount,postSource.catalogRelationCount+1);
    assert.equal(withCapability.schemaFingerprint,postSource.schemaFingerprint);
    assert.notEqual(withCapability.catalogSha256,postSource.catalogSha256,'full catalog includes the exact supplemental objects and disabled state');
    assert.deepEqual(await collectRestoreCatalog(targetClient,'post-0021'),withCapability);
    const verifierUrl=new URL(controlUrl);verifierUrl.pathname='/'+database;
    sourceVerifier=new pg.Client({connectionString:verifierUrl.toString(),ssl:false});await sourceVerifier.connect();
    await sourceVerifier.query(`SET SESSION AUTHORIZATION "${REBIND_METADATA_VERIFIER_ROLE}"`);
    await sourceVerifier.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.deepEqual((await sourceVerifier.query('SELECT current_user=session_user AS same, r.rolsuper FROM pg_roles r WHERE r.rolname=current_user')).rows[0],
      {same:true,rolsuper:false});
    for(const forbidden of ['SELECT * FROM admin_recovery.subject_rebind_control','SELECT * FROM identity.admin_subject_rebind_policy()',
      'SELECT identity.rebind_control_plane_administrator(NULL::bytea,NULL::text,NULL::uuid,NULL::text,NULL::bytea,NULL::bigint,NULL::uuid,NULL::text)']){
      await sourceVerifier.query('SAVEPOINT verifier_denied');
      await assert.rejects(sourceVerifier.query(forbidden),error=>error.code==='42501');
      await sourceVerifier.query('ROLLBACK TO SAVEPOINT verifier_denied');
    }
    const attested=await sourceVerifier.query('SELECT * FROM identity.admin_subject_rebind_restore_state()');
    assert.equal(attested.rowCount,1);assert.deepEqual(Object.keys(attested.rows[0]).sort(),
      ['id','disabled','revision','capability_sha256','disabled_from_policy_sha256'].sort());
    assert.deepEqual(await collectRestoreCatalog(sourceVerifier,'post-0021'),withCapability,
      'actual metadata-verifier session needs no private table privilege or privileged source connection');
    await sourceVerifier.query('ROLLBACK');
    await client.query("UPDATE admin_recovery.subject_rebind_control SET policy_text='{}',revision=1");
    try{
      await sourceVerifier.query('BEGIN READ ONLY');
      assert.equal((await sourceVerifier.query('SELECT * FROM identity.admin_subject_rebind_restore_state()')).rowCount,0);
      await assert.rejects(collectRestoreCatalog(sourceVerifier,'post-0021'),/not_disabled/);
    }finally{await sourceVerifier.query('ROLLBACK');await client.query("UPDATE admin_recovery.subject_rebind_control SET policy_text='DISABLED',revision=0");}
    const capabilitySmoke=await runRestoreSmoke(urls,branch,withCapability,scripts,targetRuntime,undefined,TEST_RESTORE_PLAN);
    assert.equal(capabilitySmoke.services,3);assert.equal(capabilitySmoke.externalHttpRequests,0);
    for(const [mutation,expected] of [
      ['DROP TABLE admin_recovery.subject_rebind_control',/partial_or_legacy/],
      ['DROP FUNCTION identity.admin_subject_rebind_policy()',/partial_or_legacy/],
      ['GRANT EXECUTE ON FUNCTION identity.admin_subject_rebind_policy() TO PUBLIC',/reader_boundary/],
      [`GRANT SELECT ON admin_recovery.subject_rebind_control TO "${RESTORE.runtime}"`,/control_boundary/],
      ['CREATE INDEX fixture_extra_rebind_index ON admin_recovery.subject_rebind_control(revision)',/control_boundary/],
      ["UPDATE admin_recovery.subject_rebind_control SET policy_text='{}',revision=1",/not_disabled/],
      ["UPDATE admin_recovery.subject_rebind_control SET capability_sha256=repeat('f',64)",/control_state/],
      ["UPDATE admin_recovery.subject_rebind_control SET disabled_from_policy_sha256=repeat('f',64)",/control_state/],
      ['CREATE TABLE system.unreviewed_recovery_control(id integer)',/relation_contract_incomplete/],
    ]){
      await targetClient.query('BEGIN');
      try{await targetClient.query(mutation);await assert.rejects(collectRestoreCatalog(targetClient,'post-0021'),expected);}
      finally{await targetClient.query('ROLLBACK');}
    }
    await targetClient.query('UPDATE admin_recovery.subject_rebind_control SET id=$1',['01900000-0000-7000-8000-000000000098']);
    assert.notEqual((await collectRestoreCatalog(targetClient,'post-0021')).catalogSha256,withCapability.catalogSha256,
      'a different control instance is not the same restored data');
    await targetClient.query('UPDATE admin_recovery.subject_rebind_control SET id=$1',['01900000-0000-7000-8000-000000000099']);
    assert.deepEqual(await collectRestoreCatalog(targetClient,'post-0021'),withCapability);
  } finally {
    if(sourceVerifier)await sourceVerifier.end();
    if (client) await client.end();
    if (targetClient) await targetClient.end();
    if (targetCreated) await control.query(`DROP DATABASE "${targetDatabase}" WITH (FORCE)`);
    if (created) await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    for (const role of ownedRoles.reverse()) await control.query(`DROP ROLE "${role}"`);
    if(ownedVerifier)await control.query(`DROP ROLE "${REBIND_METADATA_VERIFIER_ROLE}"`);
    await control.end();
  }
});
