import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadApprovedMigrations, EXPECTED_MIGRATION_SET_SHA256 } from '../ci/planetscale-migration-manifest.mjs';
import {
  assertFixedDeploymentTarget,
  assertLocalRehearsalUrl,
  assertDistinctRolePasswords,
  assertProviderRegion,
  buildPreparationPlan,
  installLiveCleanSchema,
  readBootstrapStateAsVerifier,
  validateRoleMap,
  validateTestAccessEnvironment,
  verifyAccessAppAndPolicies,
  verifyNewCoreAccessMetadata,
  verifyProviderRoles,
} from '../ci/lythaus-new-core-clean-install.mjs';

test('preparation plan pins the new database, branch, Hyperdrive and approved migration set', () => {
  const plan = buildPreparationPlan();
  assert.equal(plan.status, 'PREPARATION_PROVIDER_ACCESS_BLOCKED');
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

test('provider role inventory binds six distinct ready role labels to the new branch', () => {
  const labels = ['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy', 'lythaus_migrations', 'lythaus_verifier'];
  const roleMap = Object.fromEntries(labels.map((label, index) => [label, `pscale_api_id${index}`]));
  validateRoleMap(roleMap);
  const rows = labels.map((name, index) => ({
    id: `role${index}`, name, base_username: roleMap[name], username: `${roleMap[name]}.xwkb9quljkzd`,
    ready: true, deleted_at: null, database_name: 'postgres', branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null },
    expires_at: null,
  }));
  assert.deepEqual(verifyProviderRoles(rows, roleMap), {
    count: 6, distinct: true, allReady: true, branchQualified: true,
  });
  assert.throws(() => verifyProviderRoles(rows.slice(1), roleMap));
  assert.throws(() => validateRoleMap({ ...roleMap, lythaus_verifier: roleMap.lythaus_admin }));
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
  const roleMap = Object.fromEntries(labels.map((label) => [label, `pscale_api_${label.slice('lythaus_'.length)}`]));
  const region = { provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central' };
  const metadata = new Map([
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core', {
      id: '87dbkhprjh30', name: 'lythaus-new-core', kind: 'postgresql', region,
    }],
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core/branches/main', {
      id: 'xwkb9quljkzd', name: 'main', kind: 'postgresql', deleted_at: null, ready: true, region,
    }],
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-new-core/branches/main/roles?page=1&per_page=100', {
      current_page: 1, total_count: labels.length, next_page: null,
      data: labels.map((name, index) => ({
        id: `role${index}`, name, base_username: roleMap[name], username: `${roleMap[name]}.xwkb9quljkzd`,
        ready: true, deleted_at: null, database_name: 'postgres',
        branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null }, expires_at: null,
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
    originSha, contract, environment, fetchImpl, calls };
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

test('live installer rejects unsafe provider roles before running any DDL', async () => {
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
      return { rows: [{
        database_name: 'postgres', current_role: fixture.roleMap.lythaus_migrations,
        version_num: 170011, application_schema_count: 0, application_relation_count: 0,
        ledger_missing: true, provisioned_role_count: 6, unsafe_role_count: 1, role_membership_count: 0,
      }] };
    },
  };
  await assert.rejects(() => installLiveCleanSchema({
    ...fixture,
    worktreeHasChanges: false,
    createClient: () => { clients += 1; return client; },
  }), /new_core_live_role_capability_precondition_failed/);
  assert.equal(clients, 2);
  assert.equal(connects, 1);
  assert.ok(queries.every((sql) => /^\s*SELECT\b/i.test(sql)));
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
