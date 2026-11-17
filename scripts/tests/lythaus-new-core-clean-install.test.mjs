import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { loadApprovedMigrations, EXPECTED_MIGRATION_SET_SHA256 } from '../ci/planetscale-migration-manifest.mjs';
import { NEW_CORE_LOGIN_ROLE_LABELS, NEW_CORE_DEFERRED_ROLE_LABELS } from '../ci/lythaus-new-core-role-profile.mjs';
import {
  assertFixedDeploymentTarget,
  assertLocalRehearsalUrl,
  assertDistinctRolePasswords,
  assertProviderRegion,
  buildPreparationPlan,
  buildSchemaInstallationPlan,
  assertSchemaInstallationScope,
  schemaOnlyObjectGrantSql,
  rehearseScopedLocalPostgres17,
  assertSchemaOnlyBaseline,
  installLiveCleanSchema,
  guardInstallSqlClients,
  readBootstrapStateAsVerifier,
  validateRoleMap,
  validateTestAccessEnvironment,
  verifyAccessAppAndPolicies,
  verifyNewCoreAccessMetadata,
  verifyProviderRoles,
} from '../ci/lythaus-new-core-clean-install.mjs';

function disconnectedClientFixture() {
  const client = new EventEmitter();
  client.queries = [];
  client.query = async (sql) => { client.queries.push(sql); return { rows: [] }; };
  return client;
}

test('an idle SQL disconnect is handled and prevents further statements on either login without reconnecting', async () => {
  const migration = disconnectedClientFixture();
  const verifier = disconnectedClientFixture();
  const connections = guardInstallSqlClients({ migration, verifier });
  await migration.query('SELECT 1');
  assert.doesNotThrow(() => migration.emit('error', new Error('private driver message')));
  await assert.rejects(verifier.query('SELECT 2'), /new_core_migration_connection_lost/);
  await assert.rejects(migration.query('CREATE SCHEMA forbidden'), /new_core_migration_connection_lost/);
  assert.deepEqual(migration.queries, ['SELECT 1']);
  assert.deepEqual(verifier.queries, []);
  assert.throws(connections.assertHealthy, /new_core_migration_connection_lost/);
  assert.doesNotThrow(() => verifier.emit('error', new Error('another private driver message')));
  assert.equal(connections.failureCode, 'new_core_migration_connection_lost');
});

test('a verifier disconnect interrupts a pending migration query without waiting or retrying', { timeout: 1000 }, async () => {
  const migration = disconnectedClientFixture();
  const verifier = disconnectedClientFixture();
  let finish;
  migration.query = () => new Promise((resolve) => { finish = resolve; });
  guardInstallSqlClients({ migration, verifier });
  const pending = migration.query('SELECT 1');
  verifier.emit('error', new Error('private details'));
  await assert.rejects(pending, /new_core_verifier_connection_lost/);
  finish({ rows: [{ success: true }] });
});

test('a disconnect during COMMIT keeps its outcome unverified, blocks new writes and still permits rollback', async () => {
  const migration = disconnectedClientFixture();
  const verifier = disconnectedClientFixture();
  const executed = [];
  migration.query = async (sql) => {
    executed.push(sql);
    if (sql === 'COMMIT') migration.emit('error', new Error('lost commit acknowledgement'));
    return { rows: [] };
  };
  guardInstallSqlClients({ migration, verifier });
  await assert.rejects(migration.query('COMMIT'), /new_core_migration_connection_lost/);
  await assert.rejects(migration.query('INSERT INTO forbidden VALUES (1)'), /new_core_migration_connection_lost/);
  await migration.query('ROLLBACK');
  assert.deepEqual(executed, ['COMMIT', 'ROLLBACK']);
});

test('schema-only plan pins the six SQL identities, all migration checksums and contract files without deployment authority', () => {
  const plan = buildSchemaInstallationPlan();
  assert.equal(plan.roleMode, 'sql-console');
  assert.equal(plan.migrations.length, 22);
  assert.equal(plan.migrations[0].checksum, loadApprovedMigrations({ committedOnly: true }).migrations[0].checksum);
  assert.equal(plan.contractFiles.length, 3);
  assert.equal(plan.destination.branchId, 'xwkb9quljkzd');
  assert.equal(plan.protectedMainSha, 'ba10cfb16941cd163e345af3c00b9bd739884646');
  assert.match(plan.approvalEnvironment.value, /^APPROVE_NEW_CORE_SCHEMA_ONLY:/);
  assert.ok(plan.exclusions.includes('Hyperdrive or Access changes'));
});

test('an explicitly reviewed main pin changes the schema approval marker without changing migration payloads', () => {
  const previous = buildSchemaInstallationPlan();
  const reviewedMain = 'd'.repeat(40);
  const next = buildSchemaInstallationPlan({ protectedMainSha: reviewedMain });
  assert.equal(next.protectedMainSha, reviewedMain);
  assert.equal(next.schemaSourceBaselineSha, previous.protectedMainSha);
  assert.deepEqual(next.migrations, previous.migrations);
  assert.deepEqual(next.objectGrantPayloads, previous.objectGrantPayloads);
  assert.match(next.approvalEnvironment.value, /^APPROVE_NEW_CORE_SCHEMA_ONLY_ON_REVIEWED_MAIN:/);
  assert.ok(next.approvalEnvironment.value.endsWith(':' + reviewedMain));
  assert.notEqual(next.approvalEnvironment.value, previous.approvalEnvironment.value);
  assert.throws(() => buildSchemaInstallationPlan({ protectedMainSha: 'main' }), /reviewed_main_pin_invalid/);
});

test('the old approval cannot authorize an updated protected main and mismatched current main stops before provider access', async () => {
  const target = JSON.parse(fsSync.readFileSync('infrastructure/planetscale/lythaus-new-core-clean-install.target.json', 'utf8'));
  const previous = buildSchemaInstallationPlan();
  const next = buildSchemaInstallationPlan({ protectedMainSha: 'd'.repeat(40) });
  const environment = { LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA: next.sourceSha,
    LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS: JSON.stringify(next.roleMap),
    LYTHAUS_NEW_CORE_APPROVED_PROTECTED_MAIN_SHA: next.protectedMainSha,
    LYTHAUS_NEW_CORE_SCHEMA_INSTALL_APPROVAL: previous.approvalEnvironment.value };
  let mainReads = 0;
  const options = { contract: { target, migrations: loadApprovedMigrations({ committedOnly: true }) },
    environment, sourceSha: next.sourceSha, worktreeHasChanges: false, schemaOnly: true,
    readMain: () => { mainReads += 1; return { protected: true, commit: { sha: 'f'.repeat(40) } }; },
    fetchImpl: () => { throw new Error('provider_must_not_be_called'); },
    createClient: () => { throw new Error('SQL_must_not_be_called'); } };
  await assert.rejects(installLiveCleanSchema(options), /schema_install_approval_missing/);
  assert.equal(mainReads, 0);
  environment.LYTHAUS_NEW_CORE_SCHEMA_INSTALL_APPROVAL = next.approvalEnvironment.value;
  await assert.rejects(installLiveCleanSchema(options), /protected_main_changed/);
  assert.equal(mainReads, 1);
  options.readMain = () => { mainReads += 1; return { protected: true, commit: { sha: next.protectedMainSha } }; };
  environment.LYTHAUS_NEW_CORE_EXPECTED_ORIGIN_FINGERPRINT = target.provider.sqlOriginFingerprint;
  await assert.rejects(installLiveCleanSchema(options), /provider_authority_unavailable/);
  assert.equal(mainReads, 2);
});

test('schema-only grant adapter excludes exactly the preverified database ACL statements and preserves object SQL', () => {
  const canonical = fsSync.readFileSync('database/planetscale/grants/roles.sql', 'utf8');
  const narrow = schemaOnlyObjectGrantSql(canonical);
  assert.doesNotMatch(narrow, /(?:GRANT|REVOKE)[^;]*ON DATABASE/);
  assert.ok(narrow.includes('CREATE OR REPLACE FUNCTION identity.bootstrap_first_administrator('));
  assert.throws(() => schemaOnlyObjectGrantSql(canonical.replace('GRANT CONNECT ON DATABASE', 'GRANT TEMP ON DATABASE')), /template_changed/);
  assert.throws(() => schemaOnlyObjectGrantSql(canonical + '\nGRANT CREATE ON DATABASE postgres TO lythaus_admin;'), /statement_forbidden/);
});

test('schema-only live mode refuses missing approval, wrong creator and changed protected main before SQL or provider calls', async () => {
  const target = JSON.parse(fsSync.readFileSync('infrastructure/planetscale/lythaus-new-core-clean-install.target.json', 'utf8'));
  const plan = buildSchemaInstallationPlan();
  const environment = {
    LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA: plan.sourceSha,
    LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS: JSON.stringify(plan.roleMap),
  };
  let calls = 0;
  const options = { contract: { target, migrations: loadApprovedMigrations({ committedOnly: true }) },
    environment, sourceSha: plan.sourceSha, worktreeHasChanges: false, schemaOnly: true,
    readMain: () => { calls += 1; return { protected: true, commit: { sha: 'f'.repeat(40) } }; },
    fetchImpl: () => { throw new Error('provider_must_not_be_called'); },
    createClient: () => { throw new Error('SQL_must_not_be_called'); } };
  await assert.rejects(installLiveCleanSchema(options), /schema_install_approval_missing/);
  assert.equal(calls, 0);
  environment.LYTHAUS_NEW_CORE_SCHEMA_INSTALL_APPROVAL = plan.approvalEnvironment.value;
  await assert.rejects(installLiveCleanSchema(options), /protected_main_changed/);
  assert.equal(calls, 1);
  target.schemaInstallation.creatorRoleSha256 = 'b'.repeat(64);
  assert.throws(() => assertSchemaInstallationScope(target), /scope_mismatch/);
});

test('scoped local rehearsal refuses a provider URL, admin login and shared passwords', async () => {
  const migrationUrl = 'postgresql://lythaus_migrations:first@127.0.0.1:55442/postgres?sslmode=disable';
  const verifierUrl = 'postgresql://lythaus_verifier:second@127.0.0.1:55442/postgres?sslmode=disable';
  await assert.rejects(rehearseScopedLocalPostgres17({ migrationUrl: migrationUrl.replace('127.0.0.1', 'provider.psdb.cloud'), verifierUrl }), /not_allowlisted/);
  await assert.rejects(rehearseScopedLocalPostgres17({ migrationUrl: migrationUrl.replace('lythaus_migrations', 'postgres'), verifierUrl }), /not_allowlisted/);
  await assert.rejects(rehearseScopedLocalPostgres17({ migrationUrl, verifierUrl: verifierUrl.replace('second', 'first') }), /must_be_distinct/);
});

test('SQL-console provider inventory preserves only the pinned broad role and never substitutes API logins', () => {
  const plan = buildSchemaInstallationPlan();
  const row = { id: 'syntheticoriginal', name: 'original', base_username: 'pscale_api_original',
    username: 'pscale_api_original.xwkb9quljkzd', ready: true, deleted_at: null, expires_at: null,
    database_name: 'postgres', branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null },
    inherited_roles: ['pg_read_all_data', 'pg_write_all_data', 'synthetic_internal'] };
  const options = { mode: 'sql-console', preservedRoleHashes: {
    id: createHash('sha256').update(row.id).digest('hex'),
    username: createHash('sha256').update(row.username).digest('hex'),
  } };
  assert.equal(verifyProviderRoles([row], plan.roleMap, Date.now(), options).scopedApiRoleCount, 0);
  for (const invalid of [[], [row, row], [{ ...row, ready: false }],
    [{ ...row, inherited_roles: ['pg_read_all_data'] }], [{ ...row, name: 'lythaus_migrations' }]]) {
    assert.throws(() => verifyProviderRoles(invalid, plan.roleMap, Date.now(), options), /preserved_provider_role_mismatch/);
  }
});

test('schema-only initial grants baseline refuses catalog drift using reads only', async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); return { rows: [{ scoped_role_count: 5 }] }; } };
  await assert.rejects(assertSchemaOnlyBaseline(client), /initial_grants_baseline_mismatch/);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /WITH scoped AS/);
  assert.doesNotMatch(queries[0], /\b(?:CREATE|GRANT|REVOKE|ALTER)\s+(?:ROLE|TABLE|ON)\b/);
});

test('preparation plan pins the new database, branch, Hyperdrive and approved migration set', () => {
  const plan = buildPreparationPlan();
  assert.equal(plan.status, 'LIVE_CONFIGURATION_BLOCKED');
  assert.deepEqual(plan.destination, {
    organization: 'lythaus',
    database: 'lythaus-new-core',
    databaseId: '87dbkhprjh30',
    branch: 'main',
    branchId: 'xwkb9quljkzd',
    region: 'eu-central',
    cluster: 'PS-5 aarch64',
    replicas: 0,
    regionProvider: 'AWS',
    regionDisplayName: 'AWS eu-central-1',
    regionLocation: 'Frankfurt',
    logicalDatabase: 'postgres',
    requiredPostgresMajor: 17,
    hyperdriveId: '7e39fc4a286147988ed12df7a6322616',
    requiredCachingDisabled: true,
    testHostname: 'admin-new-core-test.lythaus.co',
    adminPagePath: '/flags',
  });
  assert.equal(plan.migrations.count, 22);
  assert.equal(plan.migrations.bytes, 100942);
  assert.equal(plan.migrations.manifestSha256, '49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614');
  assert.equal(plan.migrations.names[0], '0000_preflight.sql');
  assert.equal(plan.migrations.names.at(-1), '0021_media_quarantine_cleanup.sql');
  assert.ok(plan.blockers.some((item) => item.includes('Hyperdrive origin')));
});

test('local rehearsal accepts only a credentialless loopback postgres URL', () => {
  assert.equal(
    assertLocalRehearsalUrl('postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable'),
    'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable',
  );
  for (const unsafe of [
    'postgresql://postgres@db.psdb.cloud/postgres?sslmode=disable',
    'postgresql://postgres:password@127.0.0.1:55432/postgres?sslmode=disable',
    'postgresql://postgres@127.0.0.1:55432/lythaus-core?sslmode=disable',
    'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable&sslmode=disable',
    'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=require',
  ]) assert.throws(() => assertLocalRehearsalUrl(unsafe));
});

test('live role connections require distinct nonempty passwords', () => {
  const migration = 'postgresql://pscale_api_migrations.xwkb9quljkzd:first-secret@new-core.psdb.cloud/postgres?sslmode=verify-full';
  const verifier = 'postgresql://pscale_api_verifier.xwkb9quljkzd:second-secret@new-core.psdb.cloud/postgres?sslmode=verify-full';
  assert.equal(assertDistinctRolePasswords(migration, verifier), true);
  assert.throws(() => assertDistinctRolePasswords(migration, migration), /new_core_database_role_passwords_must_be_distinct/);
  assert.throws(() => assertDistinctRolePasswords(migration.replace(':first-secret@', '@'), verifier), /new_core_database_password_required/);
});

test('worker and manifest are pinned to the literal isolated account, worker and hostname', async () => {
  const target = JSON.parse(await fs.readFile('infrastructure/planetscale/lythaus-new-core-clean-install.target.json', 'utf8'));
  const worker = JSON.parse(await fs.readFile('apps/lythaus-admin-api/wrangler.new-core-test.jsonc', 'utf8'));
  assert.doesNotThrow(() => assertFixedDeploymentTarget(target, worker));
  const liveTarget = structuredClone(target);
  const liveWorker = structuredClone(worker);
  liveTarget.adminTest.worker = 'lythaus-admin-api';
  liveTarget.adminTest.hostname = 'admin.lythaus.co';
  liveWorker.name = liveTarget.adminTest.worker;
  liveWorker.routes = [{ pattern: `${liveTarget.adminTest.hostname}/*`, zone_name: 'lythaus.co' }];
  assert.throws(() => assertFixedDeploymentTarget(liveTarget, liveWorker), /new_core_literal_target_mismatch|new_core_worker_deployment_target_mismatch/);
});

test('provider region object is verified against AWS eu-central-1 Frankfurt', () => {
  const region = { provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central' };
  assert.deepEqual(assertProviderRegion({ region }, {}), {
    provider: 'AWS', displayName: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central',
  });
  assert.throws(() => assertProviderRegion({ region: 'eu-central' }, {}));
  assert.throws(() => assertProviderRegion({ region: { ...region, slug: 'us-east' } }, {}));
});

test('provider inventory binds three logins and preserves three passwordless SQL roles', () => {
  const labels = ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations', 'lythaus_verifier'];
  const roleMap = Object.fromEntries(labels.map((label, index) => [label,
    NEW_CORE_DEFERRED_ROLE_LABELS.includes(label) ? label : `pscale_api_id${index}`]));
  validateRoleMap(roleMap);
  const rows = NEW_CORE_LOGIN_ROLE_LABELS.map((name, index) => ({
    id: `role${index}`, name, base_username: roleMap[name], username: `${roleMap[name]}.xwkb9quljkzd`,
    ready: true, deleted_at: null, database_name: 'postgres', branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null },
    expires_at: null, inherited_roles: [],
  }));
  assert.deepEqual(verifyProviderRoles(rows, roleMap), {
    count: 3, distinct: true, allReady: true, branchQualified: true,
    deferredSqlRoleCount: 3, deferredSqlRolesRequireCatalogVerification: true,
  });
  assert.throws(() => verifyProviderRoles(rows.slice(1), roleMap));
  assert.throws(() => validateRoleMap({ ...roleMap, lythaus_verifier: roleMap.lythaus_admin }));
  assert.throws(() => validateRoleMap({ ...roleMap, lythaus_jobs: 'pscale_api_unusedcredential' }));
  assert.throws(() => verifyProviderRoles([...rows, { name: 'lythaus_jobs' }], roleMap), /deferred_role_credential_present/);
  assert.throws(() => verifyProviderRoles(rows.map((row) => ({ ...row, inherited_roles: ['pg_read_all_data'] })), roleMap));
  assert.throws(() => verifyProviderRoles(rows.map((row) => ({ ...row, expires_at: '2099-01-01T00:00:00Z' })), roleMap));
  assert.doesNotThrow(() => verifyProviderRoles([...rows, { name: 'existing_provider_role' }], roleMap));
});

test('Access metadata and Worker variables bind the isolated app audience without returning the allowlisted identity', async () => {
  const fixture = fakeTargetAndProvider();
  const audience = 'synthetic-test-access-audience';
  const audienceSha256 = createHash('sha256').update(audience).digest('hex');
  Object.assign(fixture.target.adminTest, {
    accessApplicationId: 'test-app-id',
    accessPolicyId: 'test-policy-id',
    expectedAccessIssuer: 'https://lythaus.cloudflareaccess.com',
    audienceSha256,
    ownerOnlyPolicyVerified: true,
    allowlistedHumanCount: 1,
    accessVerification: 'VERIFIED_NEW_TEST_ACCESS_OWNER_ONLY',
  });
  Object.assign(fixture.environment, {
    CLOUDFLARE_API_TOKEN: 'synthetic-token',
    LYTHAUS_NEW_CORE_OWNER_EMAIL: 'synthetic-owner@example.invalid',
    ACCESS_TEAM_DOMAIN: 'lythaus.cloudflareaccess.com',
    NEW_CORE_ACCESS_ISSUER: 'https://lythaus.cloudflareaccess.com',
    NEW_CORE_ACCESS_AUDIENCE_SHA256: audienceSha256,
    ACCESS_AUDIENCES: audience,
    ACCESS_JWKS_URL: 'https://lythaus.cloudflareaccess.com/cdn-cgi/access/certs',
  });
  assert.equal(validateTestAccessEnvironment(fixture.target, fixture.environment).allowlistedHumanCount, 1);
  const fixtureEmail = fixture.environment.LYTHAUS_NEW_CORE_OWNER_EMAIL;
  const application = { id: 'test-app-id', type: 'self_hosted', domain: 'admin-new-core-test.lythaus.co', aud: audience };
  const policies = [
    { id: 'test-policy-id', decision: 'allow', include: [{ email: { email: fixtureEmail } }], exclude: [], require: [] },
    { id: 'deny-policy-id', decision: 'deny', include: [{ everyone: {} }], exclude: [], require: [] },
  ];
  const direct = verifyAccessAppAndPolicies({ application, policies, target: fixture.target, expectedOwnerEmail: fixtureEmail });
  assert.equal(direct.accessApplicationId, 'test-app-id');
  assert.equal(JSON.stringify(direct).includes(fixtureEmail), false);
  assert.throws(() => verifyAccessAppAndPolicies({
    application, policies, target: fixture.target, expectedOwnerEmail: 'different-owner@example.invalid',
  }), /new_core_access_policy_metadata_mismatch/);
  assert.throws(() => verifyAccessAppAndPolicies({
    application: { ...application, domains: ['admin-new-core-test.lythaus.co', 'admin.lythaus.co'] },
    policies, target: fixture.target, expectedOwnerEmail: fixtureEmail,
  }), /new_core_access_application_hostname_mismatch/);
  assert.throws(() => verifyAccessAppAndPolicies({
    application: { ...application, type: 'service_auth' },
    policies, target: fixture.target, expectedOwnerEmail: fixtureEmail,
  }), /new_core_access_application_metadata_mismatch/);
  assert.throws(() => verifyAccessAppAndPolicies({
    application,
    policies: [
      { ...policies[0], include: [{ email: { email: fixtureEmail, extra: 'selector' } }] },
      policies[1],
    ],
    target: fixture.target, expectedOwnerEmail: fixtureEmail,
  }), /new_core_access_policy_metadata_mismatch/);
  assert.throws(() => verifyAccessAppAndPolicies({
    application, policies: [{ ...policies[0], decision: 'service_auth' }, policies[1]],
    target: fixture.target, expectedOwnerEmail: fixtureEmail,
  }), /new_core_access_policy_metadata_mismatch/);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    const payload = url.endsWith('/access/apps?per_page=1000')
      ? { success: true, result: [application] }
      : { success: true, result: policies };
    return Response.json(payload);
  };
  const result = await verifyNewCoreAccessMetadata({ target: fixture.target, environment: fixture.environment, fetchImpl });
  assert.equal(result.accessPolicyId, 'test-policy-id');
  assert.equal(JSON.stringify(result).includes(fixtureEmail), false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.throws(() => validateTestAccessEnvironment(fixture.target, {
    ...fixture.environment, ACCESS_AUDIENCES: `${audience},production-audience`,
  }), /new_core_access_audience_mismatch/);
});

test('bootstrap state verifier accepts only exact clean and accepted aggregate states in read-only transactions', async () => {
  for (const [expected, values] of [
    ['clean', [0, 0, 0, 1, false, 0, 0, 0]],
    ['accepted', [1, 1, 0, 1, true, 1, 1, 0]],
  ]) {
    const queries = [];
    const row = Object.fromEntries([
      'membership_count', 'active_admin_membership_count', 'active_non_admin_membership_count',
      'bootstrap_latch_count', 'bootstrap_consumed', 'completion_audit_count',
      'bootstrap_control_plane_count', 'bootstrap_consumer_material_count',
    ].map((name, index) => [name, values[index]]));
    const client = { async query(sql) {
      queries.push(sql);
      if (sql.includes('bool_or(class_entry.relrowsecurity')) return { rows: [{ relation_count: 8, rls_enabled: false }] };
      if (sql.includes('read_first_admin_bootstrap_state')) return { rows: [row] };
      return { rows: [] };
    } };
    const state = await readBootstrapStateAsVerifier(client, { asLogin: true, expected });
    assert.equal(state.membershipCount, values[0]);
    assert.equal(state.bootstrapConsumed, values[4]);
    assert.ok(queries.includes('SET TRANSACTION READ ONLY'));
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(queries.every((sql) => !/\b(INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE)\b/i.test(sql)));
  }
});

function fakeTargetAndProvider() {
  const target = JSON.parse(fsSync.readFileSync('infrastructure/planetscale/lythaus-new-core-clean-install.target.json', 'utf8'));
  const origin = { scheme: 'postgres', host: 'new-core.psdb.cloud', port: 5432, database: 'postgres' };
  const originSha = createHash('sha256').update(JSON.stringify(origin)).digest('hex');
  target.provider.sqlOriginFingerprint = originSha;
  target.provider.sqlOriginVerification = 'VERIFIED_NEW_HYPERDRIVE_DESTINATION';
  target.hyperdrive.originVerification = 'VERIFIED_NEW_HYPERDRIVE_CACHING_DISABLED';
  target.costApproval = {
    estimateReference: 'fixture-estimate', estimateSha256: 'b'.repeat(64), oneTimeCeilingUsd: 1,
    monthlyCeilingUsd: 1, approvalStatus: 'APPROVED_COST_CEILING',
  };
  const labels = ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations', 'lythaus_verifier'];
  const roleMap = Object.fromEntries(labels.map((label) => [label,
    NEW_CORE_DEFERRED_ROLE_LABELS.includes(label) ? label : `pscale_api_${label.slice('lythaus_'.length)}`]));
  const region = { provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central' };
  const metadata = new Map([
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core', {
      id: '87dbkhprjh30', name: 'lythaus-new-core', kind: 'postgresql', ready: true, state: 'ready', region,
    }],
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core/branches/main', {
      id: 'xwkb9quljkzd', name: 'main', kind: 'postgresql', deleted_at: null, ready: true, state: 'ready',
      cluster_name: 'PS_5_AWS_ARM', replicas: 0, region,
    }],
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core/branches/main/roles?page=1&per_page=100', {
      current_page: 1, total_count: NEW_CORE_LOGIN_ROLE_LABELS.length, next_page: null,
      data: NEW_CORE_LOGIN_ROLE_LABELS.map((name, index) => ({
        id: `role${index}`, name, base_username: roleMap[name], username: `${roleMap[name]}.xwkb9quljkzd`,
        ready: true, deleted_at: null, database_name: 'postgres',
        branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null }, expires_at: null, inherited_roles: [],
      })),
    }],
    ['https://api.cloudflare.com/client/v4/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/hyperdrive/configs/7e39fc4a286147988ed12df7a6322616', {
      success: true,
      result: {
        id: '7e39fc4a286147988ed12df7a6322616',
        origin: { ...origin, user: `${roleMap.lythaus_admin}.xwkb9quljkzd` },
        caching: { disabled: true },
        mtls: { sslmode: 'verify-full', ca_certificate_id: 'fixture-ca' },
      },
    }],
  ]);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    const payload = metadata.get(url);
    if (!payload) return new Response(JSON.stringify({ success: false }), { status: 404 });
    return Response.json(payload);
  };
  const migrations = loadApprovedMigrations({ committedOnly: true });
  const contract = { target, migrations };
  const sourceSha = 'c'.repeat(40);
  const environment = {
    LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA: sourceSha,
    LYTHAUS_NEW_CORE_EXPECTED_ORIGIN_FINGERPRINT: originSha,
    LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS: JSON.stringify(roleMap),
    PLANETSCALE_API_TOKEN: 'fixture-id:fixture-token',
    CLOUDFLARE_API_TOKEN: 'fixture-cloudflare-token',
    LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL: `postgresql://${roleMap.lythaus_migrations}.xwkb9quljkzd:synthetic-migration-password@new-core.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`,
    LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL: `postgresql://${roleMap.lythaus_verifier}.xwkb9quljkzd:synthetic-verifier-password@new-core.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`,
  };
  return { target, migrations, sourceSha, roleMap, roleMapSha: createHash('sha256').update(JSON.stringify(roleMap)).digest('hex'),
    originSha, contract, environment, fetchImpl, calls, metadata };
}

function bindApprovalMarkers(fixture) {
  const suffix = `${fixture.sourceSha}:${fixture.migrations.checksum}:87dbkhprjh30:xwkb9quljkzd:${fixture.originSha}:${fixture.roleMapSha}`;
  return {
    LYTHAUS_NEW_CORE_DDL_APPROVAL: `APPROVE_NEW_CORE_DDL:${suffix}`,
    LYTHAUS_NEW_CORE_GRANT_APPROVAL: `APPROVE_NEW_CORE_ROLE_GRANTS:${suffix}`,
    LYTHAUS_NEW_CORE_CREDENTIAL_APPROVAL: `APPROVE_NEW_CORE_CREDENTIAL_USE:${suffix}`,
    LYTHAUS_NEW_CORE_COST_APPROVAL: `APPROVE_NEW_CORE_COST_CEILING:${suffix}`,
  };
}

test('live installer rejects missing origin attestation before provider or SQL calls', async () => {
  const fixture = fakeTargetAndProvider();
  fixture.target.provider.sqlOriginFingerprint = null;
  fixture.target.provider.sqlOriginVerification = 'BLOCKED_UNVERIFIED';
  fixture.environment.LYTHAUS_NEW_CORE_EXPECTED_ORIGIN_FINGERPRINT = '';
  let clients = 0;
  await assert.rejects(() => installLiveCleanSchema({
    ...fixture, worktreeHasChanges: false,
    createClient: () => { clients += 1; throw new Error('client_must_not_be_created'); },
  }), /new_core_origin_attestation_missing/);
  assert.equal(fixture.calls.length, 0);
  assert.equal(clients, 0);
});

test('live installer rejects approval mismatch before creating SQL clients', async () => {
  const fixture = fakeTargetAndProvider();
  let clients = 0;
  await assert.rejects(() => installLiveCleanSchema({
    ...fixture, worktreeHasChanges: false,
    createClient: () => { clients += 1; throw new Error('client_must_not_be_created'); },
  }), /new_core_approve_new_core_ddl_approval_missing/);
  assert.equal(fixture.calls.length, 4);
  assert.equal(clients, 0);
  assert.ok(fixture.calls.every((call) => call.method === 'GET'));
});

test('accepts the observed absent database deleted_at field but rejects a present non-null value before SQL clients', async () => {
  const fixture = fakeTargetAndProvider();
  const databaseUrl = 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core';
  assert.equal(Object.hasOwn(fixture.metadata.get(databaseUrl), 'deleted_at'), false);
  fixture.metadata.get(databaseUrl).deleted_at = 'synthetic-deleted-state';
  let clients = 0;
  await assert.rejects(() => installLiveCleanSchema({
    ...fixture,
    worktreeHasChanges: false,
    createClient: () => { clients += 1; throw new Error('client_must_not_be_created'); },
  }), /new_core_provider_target_mismatch/);
  assert.equal(clients, 0);
  assert.equal(fixture.calls.length, 2);
  assert.ok(fixture.calls.every((call) => call.method === 'GET'));
});

test('live installer rejects a branch-qualified URL for the old database before opening SQL clients', async () => {
  const fixture = fakeTargetAndProvider();
  Object.assign(fixture.environment, bindApprovalMarkers(fixture));
  fixture.environment.LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL =
    `postgresql://${fixture.roleMap.lythaus_migrations}.vqa2g2xc9wsl:synthetic@old-core.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`;
  let clients = 0;
  await assert.rejects(() => installLiveCleanSchema({
    ...fixture, worktreeHasChanges: false,
    createClient: () => { clients += 1; throw new Error('client_must_not_be_created'); },
  }), /lythaus_migrations_database_target_mismatch/);
  assert.equal(clients, 0);
  assert.equal(fixture.migrations.checksum, EXPECTED_MIGRATION_SET_SHA256);
});

test('live preflight rejects a replication-capable login before DDL using catalog-only reads', async () => {
  const fixture = fakeTargetAndProvider();
  Object.assign(fixture.environment, bindApprovalMarkers(fixture));
  const queries = [];
  let clients = 0;
  let connects = 0;
  const client = {
    async connect() { connects += 1; },
    async end() {},
    async query(sql) {
      queries.push(sql);
      if (sql.includes('current_user AS user_name')) {
        return { rows: [{ database_name: 'postgres', user_name: fixture.roleMap.lythaus_migrations }] };
      }
      assert.match(sql, /rolreplication/);
      return { rows: [{
        database_name: 'postgres', current_role: fixture.roleMap.lythaus_migrations,
        migration_database_create: true, migration_database_owner: false,
        migration_database_create_grant_option: false,
        role_login_profile_mismatch_count: 0, restricted_database_ddl_count: 0,
        version_num: 170011, application_schema_count: 0, application_relation_count: 0,
        ledger_missing: true, provisioned_role_count: 6,
        unsafe_role_count: sql.includes('rolreplication') ? 1 : 0, role_membership_count: 0,
      }] };
    },
  };
  await assert.rejects(() => installLiveCleanSchema({
    ...fixture,
    worktreeHasChanges: false,
    reportProgress: () => {},
    createClient: () => { clients += 1; return Object.assign(new EventEmitter(), client); },
  }), /new_core_live_role_capability_precondition_failed/);
  assert.equal(clients, 2);
  assert.equal(connects, 1);
  assert.ok(queries.every((sql) => /^\s*SELECT\b/i.test(sql)));
  assert.ok(queries.some((sql) => /rolreplication/.test(sql)));
});

test('the live runner contains an asynchronous disconnect, reports no DDL and closes both clients', async () => {
  const fixture = fakeTargetAndProvider();
  Object.assign(fixture.environment, bindApprovalMarkers(fixture));
  const progress = [];
  const closed = [];
  const migration = disconnectedClientFixture();
  const verifier = disconnectedClientFixture();
  migration.connect = async () => {
    queueMicrotask(() => migration.emit('error', new Error('private connection details')));
  };
  verifier.connect = async () => { throw new Error('verifier_must_not_connect'); };
  migration.end = async () => { closed.push('migration'); };
  verifier.end = async () => { closed.push('verifier'); };
  let created = 0;
  await assert.rejects(installLiveCleanSchema({ ...fixture, worktreeHasChanges: false,
    reportProgress: (entry) => progress.push(entry),
    createClient: () => created++ === 0 ? migration : verifier,
  }), /new_core_migration_connection_lost/);
  assert.equal(created, 2);
  assert.deepEqual(closed, ['verifier', 'migration']);
  assert.deepEqual(migration.queries, []);
  assert.deepEqual(verifier.queries, []);
  assert.equal(progress.at(-1).status, 'SCHEMA_INSTALL_FAILURE_STATE');
  assert.equal(progress.at(-1).databaseState, 'DDL_NOT_STARTED');
  assert.equal(progress.at(-1).automaticRetry, false);
  assert.deepEqual(progress.at(-1).acknowledgedCommittedMigrations, []);
  assert.doesNotMatch(JSON.stringify(progress), /private connection details/);
});

test('runner has no generic connection fallback and live mode requires separate gates', async () => {
  const source = await fs.readFile('scripts/ci/lythaus-new-core-clean-install.mjs', 'utf8');
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL|\?\?\s*process\.env\.DATABASE_URL/);
  assert.match(source, /LYTHAUS_NEW_CORE_PG17_REHEARSAL_URL/);
  assert.match(source, /LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL/);
  assert.match(source, /LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL/);
  assert.match(source, /APPROVE_NEW_CORE_ROLE_GRANTS/);
  assert.match(source, /APPROVE_NEW_CORE_COST_CEILING/);
  assert.match(source, /--apply-live/);
  assert.match(source, /new_core_origin_attestation_missing/);
});

test('live preflight rejects grant options, runtime DDL and enabled deferred logins before writes', async () => {
  for (const [override, expectedError] of [
    [{ migration_database_create_grant_option: true }, /migration_database_create_profile_invalid/],
    [{ restricted_database_ddl_count: 1 }, /role_capability_precondition_failed/],
    [{ role_login_profile_mismatch_count: 1 }, /role_capability_precondition_failed/],
  ]) {
    const fixture = fakeTargetAndProvider();
    Object.assign(fixture.environment, bindApprovalMarkers(fixture));
    const queries = [];
    const client = {
      async connect() {}, async end() {},
      async query(sql) {
        queries.push(sql);
        if (sql.includes('current_user AS user_name')) return { rows: [{
          database_name: 'postgres', user_name: fixture.roleMap.lythaus_migrations,
        }] };
        return { rows: [{
          database_name: 'postgres', current_role: fixture.roleMap.lythaus_migrations,
          version_num: 170011, application_schema_count: 0, application_relation_count: 0,
          ledger_missing: true, provisioned_role_count: 6, unsafe_role_count: 0, role_membership_count: 0,
          migration_database_create: true, migration_database_owner: false,
          migration_database_create_grant_option: false, restricted_database_ddl_count: 0,
          role_login_profile_mismatch_count: 0, ...override,
        }] };
      },
    };
    await assert.rejects(() => installLiveCleanSchema({ ...fixture, worktreeHasChanges: false,
      reportProgress: () => {}, createClient: () => Object.assign(new EventEmitter(), client) }), expectedError);
    assert.ok(queries.length > 0 && queries.every((sql) => /^\s*SELECT\b/i.test(sql)));
  }
});
