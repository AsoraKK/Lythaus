import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  NEW_CORE_ROLE_LABELS,
  NEW_CORE_DEFERRED_ROLE_LABELS,
} from '../ci/lythaus-new-core-role-profile.mjs';
import {
  applySqlRolesAndGrants,
  buildProvisioningPlanReceipt,
  provisionNewCoreRoles,
  validateNewCoreProvisioningTarget,
} from '../ci/lythaus-new-core-role-provisioning.mjs';
import {
  buildEnvironmentPlanReceipt,
  buildNewCoreEnvironmentPlan,
  NEW_CORE_ENVIRONMENT,
  NEW_CORE_PROVISIONING_BRANCH,
  verifyNewCoreEnvironmentGate,
} from '../ci/lythaus-new-core-environment-plan.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const REVIEWER_ID = 9876543210;
const WRITER_TOKEN = 'environment-writer-token-test-only-0123456789';
const PS_TOKEN = 'test-service-token-id:test-service-token-value';
const PROVISIONER_URL = 'postgresql://provisioner.xwkb9quljkzd:unique-provisioner-password@new-core.psdb.cloud:5432/postgres?sslmode=verify-full&sslrootcert=system';
const ORIGIN_SHA = branchQualifiedDatabaseTarget(PROVISIONER_URL).originFingerprint;
const TARGET = {
  schemaVersion: 'lythaus-new-core-clean-install-target-v1',
  provider: {
    organization: 'lythaus', database: 'lythaus-new-core', databaseId: '87dbkhprjh30',
    branch: 'main', branchId: 'xwkb9quljkzd', region: 'eu-central', replicas: 0,
    cluster: 'PS-5 aarch64', logicalDatabase: 'postgres', requiredPostgresMajor: 17,
    sqlOriginFingerprint: ORIGIN_SHA,
  },
};

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const preservedRole = {
  id: 'preservedrole1',
  name: 'postgres',
  base_username: 'pscale_api_preserved',
  username: 'pscale_api_preserved.xwkb9quljkzd',
  database_name: 'postgres',
  ready: true,
  deleted_at: null,
  expires_at: null,
  branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null },
  inherited_roles: ['pg_read_all_data', 'pg_write_all_data', 'pg_monitor'],
};
const TEST_PRESERVED_HASHES = {
  id: sha(preservedRole.id),
  baseUsername: sha(preservedRole.base_username),
  username: sha(preservedRole.username),
};

const roleData = {
  lythaus_migrations: { id: 'roleidmigration1', base: 'pscale_api_migration01', password: 'migration-password-unique' },
  lythaus_admin: { id: 'roleidadminrole01', base: 'pscale_api_adminrole01', password: 'admin-password-unique' },
  lythaus_verifier: { id: 'roleidverifier001', base: 'pscale_api_verifier01', password: 'verifier-password-unique' },
};

function providerRole(label, { password = roleData[label].password } = {}) {
  const { id, base } = roleData[label];
  return {
    id,
    name: label,
    base_username: base,
    username: `${base}.xwkb9quljkzd`,
    database_name: 'postgres',
    password,
    access_host_url: 'new-core.psdb.cloud',
    ready: true,
    deleted_at: null,
    expires_at: null,
    inherited_roles: [],
    branch: { id: 'xwkb9quljkzd', name: 'main', deleted_at: null },
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeFixture({
  wrongInitialRole = false,
  canaryWriteError = false,
  providerPostFailureAt = null,
  secretWriteErrorName = null,
  duplicatePasswordLabel = null,
  sqlPostconditionGood = true,
  membershipEdgesGood = true,
} = {}) {
  const roleInventory = [structuredClone(preservedRole)];
  if (wrongInitialRole) roleInventory[0].id = 'differentroleid';
  const rolePosts = [];
  const storedSecrets = new Set([
    'LYTHAUS_NEW_CORE_ENVIRONMENT_WRITER_TOKEN',
    'LYTHAUS_NEW_CORE_PROVISIONER_DATABASE_URL',
  ]);
  const deliveredValues = new Map();
  const ghRequests = [];
  const psRequests = [];
  const sqlWrites = [];
  const events = [];
  let client;

  const githubFetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    ghRequests.push({ pathname, method: options.method });
    if (pathname === '/repos/AsoraKK/Lythaus') {
      return jsonResponse({
        id: 1010752912,
        full_name: 'AsoraKK/Lythaus',
        owner: { login: 'AsoraKK', type: 'User', id: REVIEWER_ID },
      });
    }
    if (pathname === `/repos/AsoraKK/Lythaus/environments/${NEW_CORE_ENVIRONMENT}`) {
      return jsonResponse({
        name: NEW_CORE_ENVIRONMENT,
        wait_timer: 0,
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
        protection_rules: [
          { type: 'required_reviewers', prevent_self_review: false,
            reviewers: [{ type: 'User', reviewer: { id: REVIEWER_ID } }] },
          { type: 'branch_policy' },
        ],
      });
    }
    if (pathname.endsWith('/deployment-branch-policies')) {
      return jsonResponse({ total_count: 1, branch_policies: [{ name: NEW_CORE_PROVISIONING_BRANCH, type: 'branch' }] });
    }
    if (pathname.endsWith('/variables')) {
      return jsonResponse({ total_count: 1, variables: [{ name: 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA', value: SOURCE_SHA }] });
    }
    if (pathname.endsWith('/secrets')) {
      const secrets = [...storedSecrets].map((name) => ({ name }));
      return jsonResponse({ total_count: secrets.length, secrets });
    }
    throw new Error('unexpected_github_test_request');
  };

  const psFetch = async (url, options) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    psRequests.push({ method: options.method, pathname, body: options.body ? JSON.parse(options.body) : null });
    if (options.method === 'GET' && pathname.endsWith('/databases/lythaus-new-core')) {
      return jsonResponse({
        id: '87dbkhprjh30', name: 'lythaus-new-core', kind: 'postgresql', ready: true, state: 'ready',
        region: { provider: 'AWS', display_name: 'AWS eu-central-1', location: 'Frankfurt', slug: 'eu-central' },
      });
    }
    if (options.method === 'GET' && pathname.endsWith('/branches/main')) {
      return jsonResponse({
        id: 'xwkb9quljkzd', name: 'main', kind: 'postgresql', deleted_at: null,
        ready: true, state: 'ready', cluster_name: 'PS_5_AWS_ARM', replicas: 0,
      });
    }
    if (pathname.endsWith('/branches/main/roles') && options.method === 'GET') {
      const page = Number(parsed.searchParams.get('page'));
      if (page !== 1) return jsonResponse({ current_page: page, total_count: roleInventory.length, data: [], next_page: null });
      return jsonResponse({ current_page: 1, total_count: roleInventory.length, data: roleInventory, next_page: null });
    }
    if (pathname.endsWith('/branches/main/roles') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      rolePosts.push(body);
      events.push(`provider_post:${body.name}`);
      if (providerPostFailureAt === rolePosts.length) throw new Error('synthetic_transport_failure');
      const created = providerRole(body.name, {
        password: duplicatePasswordLabel && body.name === duplicatePasswordLabel
          ? roleData.lythaus_admin.password : roleData[body.name].password,
      });
      roleInventory.push(created);
      return jsonResponse(created, 201);
    }
    throw new Error('unexpected_planetscale_test_request');
  };

  const fetchImpl = async (url, options) => {
    if (url.startsWith('https://api.github.com/')) return githubFetch(url, options);
    if (url.startsWith('https://api.planetscale.com/')) return psFetch(url, options);
    throw new Error('unexpected_test_host');
  };

  const preflightRow = {
    database_name: 'postgres', user_name: 'provisioner', version_num: 170011,
    can_login: true, is_superuser: false, can_create_database: false, can_create_roles: true,
    can_replicate: false, bypasses_rls: false, role_membership_count: 0,
    database_owner: true, can_grant_connect: true, can_grant_create: true,
    public_database_create: false, application_schema_count: 0, application_relation_count: 0,
    migration_ledger_missing: true, canonical_sql_role_count: 0,
  };
  const postconditionRow = sqlPostconditionGood ? {
    role_count: 6, unsafe_role_count: 0, deferred_login_count: 0, login_profile_mismatch_count: 0,
    migration_database_owner: false, migration_database_create: true,
    migration_database_create_grant_option: false, restricted_database_create_count: 0,
    database_connect_count: 3,
  } : {
    role_count: 6, unsafe_role_count: 0, deferred_login_count: 0, login_profile_mismatch_count: 0,
    migration_database_owner: false, migration_database_create: false,
    migration_database_create_grant_option: false, restricted_database_create_count: 0,
    database_connect_count: 3,
  };
  const createClient = () => {
    client = {
      async connect() { events.push('sql_connect'); },
      async end() { events.push('sql_end'); },
      async query(sql, values = []) {
        if (sql.includes('SELECT current_database() AS database_name, current_user AS user_name')) {
          return { rows: [{ database_name: 'postgres', user_name: 'provisioner' }] };
        }
        if (sql.includes("current_setting('server_version_num')")) return { rows: [{ ...preflightRow }] };
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.startsWith('CREATE ROLE')
          || sql.startsWith('GRANT ')) {
          sqlWrites.push(sql);
          events.push(sql === 'BEGIN' ? 'sql_begin' : sql === 'COMMIT' ? 'sql_commit' : sql === 'ROLLBACK' ? 'sql_rollback' : 'sql_mutation');
          return { rows: [] };
        }
        if (sql.includes('AS role_count')) return { rows: [{ ...postconditionRow }] };
        if (sql === 'SELECT current_user AS role_name') return { rows: [{ role_name: 'provisioner' }] };
        if (sql.includes('membership_role.rolname AS role_name')) {
          const rows = membershipEdgesGood ? NEW_CORE_DEFERRED_ROLE_LABELS.map((role_name) => ({
            role_name, member_name: 'provisioner', admin_option: true, inherit_option: false, set_option: false,
          })) : [];
          return { rows };
        }
        throw new Error('unexpected_sql_test_query');
      },
    };
    return client;
  };

  const writeSecret = async ({ name, value, writerToken }) => {
    assert.equal(writerToken, WRITER_TOKEN);
    if ((canaryWriteError && name === 'LYTHAUS_NEW_CORE_DELIVERY_CANARY') || name === secretWriteErrorName) {
      events.push(`secret_write_failed:${name}`);
      throw new Error('new_core_environment_secret_write_failed');
    }
    storedSecrets.add(name);
    deliveredValues.set(name, value);
    events.push(`secret_write:${name}`);
  };

  const environment = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REPOSITORY: 'AsoraKK/Lythaus',
    GITHUB_REPOSITORY_ID: '1010752912',
    GITHUB_REF: `refs/heads/${NEW_CORE_PROVISIONING_BRANCH}`,
    GITHUB_SHA: SOURCE_SHA,
    LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA: SOURCE_SHA,
    LYTHAUS_NEW_CORE_ENVIRONMENT_WRITER_TOKEN: WRITER_TOKEN,
    LYTHAUS_NEW_CORE_PROVISIONER_DATABASE_URL: PROVISIONER_URL,
    PLANETSCALE_API_TOKEN: PS_TOKEN,
  };

  return {
    environment, fetchImpl, createClient, writeSecret, roleInventory, rolePosts,
    storedSecrets, deliveredValues, ghRequests, psRequests, sqlWrites, events,
    get client() { return client; },
    options: {
      mode: 'provision', environment, target: TARGET, sourceSha: SOURCE_SHA, actualHeadSha: SOURCE_SHA,
      fetchImpl, createClient, writeSecret, canaryValue: 'noncredential-test-canary', allowTestFixtures: true,
      preservedRoleHashes: TEST_PRESERVED_HASHES,
    },
  };
}

test('plan mode stays local and describes exact target without applying changes', async () => {
  const plan = buildProvisioningPlanReceipt({ target: TARGET, sourceSha: SOURCE_SHA });
  assert.equal(plan.status, 'PREPARATION_APPROVAL_PENDING');
  assert.equal(plan.approvalRequiredBeforeLiveExecution, true);
  assert.equal(plan.target.databaseId, '87dbkhprjh30');
  assert.equal(plan.target.branchId, 'xwkb9quljkzd');
  assert.equal(plan.rawCredentialsIncluded, false);
  const receipt = await provisionNewCoreRoles({ mode: 'plan', target: TARGET, sourceSha: SOURCE_SHA });
  assert.equal(receipt.status, 'PREPARATION_NOT_APPLIED');
  assert.equal(receipt.providerReadChecks, false);
  assert.equal(receipt.secretNames.length, 0);
});

test('environment plan is owner-only, exact-branch, source-pinned, and contains no reviewer identifier in its receipt', () => {
  const plan = buildNewCoreEnvironmentPlan({ reviewerId: String(REVIEWER_ID), sourceSha: SOURCE_SHA });
  assert.equal(plan.environment.name, NEW_CORE_ENVIRONMENT);
  assert.deepEqual(plan.environment.reviewers, [{ type: 'User', id: REVIEWER_ID }]);
  assert.equal(plan.environment.prevent_self_review, false);
  assert.deepEqual(plan.branchPolicy, { type: 'branch', name: NEW_CORE_PROVISIONING_BRANCH });
  assert.deepEqual(plan.repositoryVariables[0], { name: 'LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA', value: SOURCE_SHA });
  const receipt = buildEnvironmentPlanReceipt({ reviewerId: String(REVIEWER_ID), sourceSha: SOURCE_SHA });
  assert.equal(receipt.status, 'PLAN_ONLY_NOT_APPLIED');
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(String(REVIEWER_ID)));
});

test('secretless gate checks repository owner, exact reviewer, branch policy, and repo source pin only', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url).pathname);
    const path = new URL(url).pathname;
    if (path === '/repos/AsoraKK/Lythaus') return jsonResponse({
      id: 1010752912, full_name: 'AsoraKK/Lythaus', owner: { login: 'AsoraKK', type: 'User', id: REVIEWER_ID },
    });
    if (path === `/repos/AsoraKK/Lythaus/environments/${NEW_CORE_ENVIRONMENT}`) return jsonResponse({
      name: NEW_CORE_ENVIRONMENT,
      wait_timer: 0,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [
        { type: 'required_reviewers', prevent_self_review: false,
          reviewers: [{ type: 'User', reviewer: { id: REVIEWER_ID } }] },
        { type: 'branch_policy' },
      ],
    });
    if (path.endsWith('/deployment-branch-policies')) return jsonResponse({
      total_count: 1, branch_policies: [{ name: NEW_CORE_PROVISIONING_BRANCH, type: 'branch' }],
    });
    throw new Error('secretless_gate_must_not_read_env_secrets_or_variables');
  };
  const result = await verifyNewCoreEnvironmentGate({
    token: 'read-only-github-token-0123456789',
    sourceSha: SOURCE_SHA,
    approvedSourceSha: SOURCE_SHA,
    fetchImpl,
  });
  assert.equal(result.approvedSourceShaMatch, true);
  assert.equal(result.soleReviewerIsRepositoryOwner, true);
  assert.equal(calls.length, 3);
  await assert.rejects(verifyNewCoreEnvironmentGate({
    token: 'read-only-github-token-0123456789', sourceSha: SOURCE_SHA,
    approvedSourceSha: 'b'.repeat(40), fetchImpl,
  }), /new_core_github_repository_source_pin_mismatch/);
});

test('wrong source context blocks before provider, SQL, or secret calls', async () => {
  const fixture = makeFixture();
  const badEnv = { ...fixture.environment, GITHUB_REF: 'refs/heads/main' };
  let fetchCalls = 0;
  const fetchImpl = async (...args) => { fetchCalls += 1; return fixture.fetchImpl(...args); };
  await assert.rejects(provisionNewCoreRoles({
    ...fixture.options, environment: badEnv, fetchImpl, allowTestFixtures: false, preservedRoleHashes: undefined,
  }), /new_core_candidate_context_not_approved/);
  assert.equal(fetchCalls, 0);
  assert.equal(fixture.rolePosts.length, 0);
  assert.equal(fixture.sqlWrites.length, 0);
  assert.equal(fixture.deliveredValues.size, 0);
});

test('unexpected existing PlanetScale role state blocks before canary and credential creation', async () => {
  const fixture = makeFixture({ wrongInitialRole: true });
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'ROLE_PROVISIONING_BLOCKED_BEFORE_PROVIDER_WRITE');
  assert.equal(result.code, 'new_core_planetscale_role_inventory_not_clean');
  assert.equal(result.providerReadChecks, false);
  assert.equal(fixture.rolePosts.length, 0);
  assert.equal(fixture.deliveredValues.size, 0);
  assert.equal(fixture.sqlWrites.length, 0);
});

test('delivery canary failure stops before any one-time PlanetScale role POST', async () => {
  const fixture = makeFixture({ canaryWriteError: true });
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'PARTIAL_ROLE_PROVISIONING_BLOCKED');
  assert.equal(result.code, 'new_core_environment_secret_write_failed');
  assert.equal(result.deliveryCanaryState, 'unknown');
  assert.equal(result.providerRolePostAttemptCount, 0);
  assert.equal(fixture.rolePosts.length, 0);
  assert.equal(fixture.sqlWrites.length, 0);
});

test('ambiguous provider POST is recorded as unknown and stops without retry or SQL writes', async () => {
  const fixture = makeFixture({ providerPostFailureAt: 1 });
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'PARTIAL_ROLE_PROVISIONING_BLOCKED');
  assert.equal(result.code, 'new_core_provider_role_create_failed');
  assert.equal(result.providerRolePostAttemptCount, 1);
  assert.equal(result.createdProviderRoleCount, 0);
  assert.deepEqual(result.roles, [{ label: 'lythaus_admin', providerRoleCreated: 'unknown', secretDelivery: 'not_attempted' }]);
  assert.equal(fixture.rolePosts.length, 1);
  assert.equal(fixture.sqlWrites.length, 0);
});

test('duplicate role passwords stop before delivery of the duplicate and never appear in receipt', async () => {
  const fixture = makeFixture({ duplicatePasswordLabel: 'lythaus_migrations' });
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'PARTIAL_ROLE_PROVISIONING_BLOCKED');
  assert.equal(result.code, 'new_core_database_role_password_not_distinct');
  assert.equal(result.providerRolePostAttemptCount, 2);
  assert.equal(result.createdProviderRoleCount, 2);
  assert.equal(result.deliveredRoleSecretCount, 1);
  assert.equal(fixture.rolePosts.length, 2);
  const output = JSON.stringify(result);
  for (const secret of [WRITER_TOKEN, PS_TOKEN, 'unique-provisioner-password', ...Object.values(roleData).map((role) => role.password)]) {
    assert.equal(output.includes(secret), false);
  }
  assert.equal(fixture.sqlWrites.includes('BEGIN'), false);
});

test('a failed credential delivery preserves the created role and stops before another POST', async () => {
  const name = 'LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL';
  const fixture = makeFixture({ secretWriteErrorName: name });
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'PARTIAL_ROLE_PROVISIONING_BLOCKED');
  assert.equal(result.createdProviderRoleCount, 1);
  assert.equal(result.deliveredRoleSecretCount, 0);
  assert.equal(result.roles[0].providerRoleCreated, 'confirmed');
  assert.equal(result.roles[0].secretDelivery, 'unknown');
  assert.equal(result.secretDeliveries.find((entry) => entry.name === name).outcome, 'unknown');
  assert.equal(fixture.rolePosts.length, 1);
  assert.equal(fixture.sqlWrites.length, 0);
  assert.equal(fixture.psRequests.every((request) => ['GET', 'POST'].includes(request.method)), true);
});

test('lost COMMIT or ROLLBACK acknowledgement remains unknown and does not claim cleanup', async () => {
  for (const statement of ['COMMIT', 'ROLLBACK']) {
    const fixture = makeFixture({ sqlPostconditionGood: statement === 'COMMIT' });
    const originalCreateClient = fixture.options.createClient;
    fixture.options.createClient = (...args) => {
      const sqlClient = originalCreateClient(...args);
      const originalQuery = sqlClient.query.bind(sqlClient);
      sqlClient.query = async (sql, values) => {
        const result = await originalQuery(sql, values);
        if (sql === statement) throw new Error('synthetic_lost_transaction_acknowledgement');
        return result;
      };
      return sqlClient;
    };
    const result = await provisionNewCoreRoles(fixture.options);
    assert.equal(result.status, 'PARTIAL_ROLE_PROVISIONING_BLOCKED');
    assert.equal(result.sqlRoleTransactionOutcome, 'unknown');
    assert.equal(result.sqlRoleStateVerified, false);
    assert.equal(result.createdProviderRoleCount, 3);
    assert.equal(result.deliveredRoleSecretCount, 3);
    assert.equal(fixture.sqlWrites.filter((sql) => sql === statement).length, 1);
    if (statement === 'COMMIT') assert.equal(fixture.sqlWrites.includes('ROLLBACK'), false);
  }
});

test('successful mock provision delivers three unique URLs, role map, and grant boundary with sanitized receipt', async () => {
  const fixture = makeFixture();
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'ROLE_PROVISIONING_PREPARED');
  assert.equal(result.environmentGateChecks, true);
  assert.equal(result.providerReadChecks, true);
  assert.equal(result.provisionerPreconditions, true);
  assert.equal(result.deliveryCanaryStored, true);
  assert.equal(result.providerRolePostAttemptCount, 3);
  assert.equal(result.createdProviderRoleCount, 3);
  assert.equal(result.deliveredRoleSecretCount, 3);
  assert.equal(result.sqlRoleTransactionCommitted, true);
  assert.equal(result.sqlRoleEvidence.canonicalRoleCount, 6);
  assert.equal(result.sqlRoleEvidence.activeLoginRoleCount, 3);
  assert.equal(result.sqlRoleEvidence.deferredNoLoginRoleCount, 3);
  assert.equal(result.sqlRoleEvidence.provisionerManagementGrants, 3);
  assert.equal(result.sqlRoleEvidence.runtimeRoleMemberships, 0);
  assert.equal(result.sqlRoleEvidence.migrationDatabaseCreateGrantOption, false);
  assert.equal(fixture.rolePosts.length, 3);
  assert.ok(fixture.rolePosts.every((body) => body.ttl === 0 && body.with_replication === false
    && body.inherited_roles.length === 0));
  assert.equal(fixture.sqlWrites.filter((statement) => statement.startsWith('CREATE ROLE')).length, 3);
  assert.equal(fixture.sqlWrites.filter((statement) => statement.startsWith('GRANT CONNECT')).length, 3);
  assert.ok(fixture.sqlWrites.some((statement) => statement.startsWith('GRANT CREATE ON DATABASE')));
  assert.equal(fixture.events.at(-1), 'sql_end');
  assert.equal(result.secretNames.length, 5);
  assert.equal(result.secretDeliveries.every((entry) => entry.outcome === 'confirmed'), true);
  assert.equal(result.rawCredentialsIncluded, false);
  const rendered = JSON.stringify(result);
  for (const secret of [WRITER_TOKEN, PS_TOKEN, 'unique-provisioner-password', ...Object.values(roleData).map((role) => role.password)]) {
    assert.equal(rendered.includes(secret), false);
  }
  assert.deepEqual(Object.keys(JSON.parse(fixture.deliveredValues.get('LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS'))).sort(), [...NEW_CORE_ROLE_LABELS].sort());
  for (const name of [
    'LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL',
    'LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL',
    'LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL',
  ]) {
    const connectionString = fixture.deliveredValues.get(name);
    assert.match(connectionString, /sslmode=verify-full/);
    assert.match(connectionString, /sslrootcert=system/);
    assert.equal(branchQualifiedDatabaseTarget(connectionString).originFingerprint, ORIGIN_SHA);
  }
});

test('SQL postcondition failure rolls back and receipt does not report committed roles', async () => {
  const fixture = makeFixture({ sqlPostconditionGood: false });
  const result = await provisionNewCoreRoles(fixture.options);
  assert.equal(result.status, 'PARTIAL_ROLE_PROVISIONING_BLOCKED');
  assert.equal(result.code, 'new_core_database_role_provisioning_transaction_failed');
  assert.equal(result.sqlRoleTransactionCommitted, false);
  assert.equal(result.sqlRoleTransactionOutcome, 'rolled_back');
  assert.equal(fixture.sqlWrites.at(-1), 'ROLLBACK');
  assert.equal(fixture.sqlWrites.includes('COMMIT'), false);
});

test('target allowlist rejects an old branch and SQL executor validates role map before writes', async () => {
  const changed = structuredClone(TARGET);
  changed.provider.branchId = 'oldbranchid';
  assert.throws(() => validateNewCoreProvisioningTarget(changed), /new_core_target_manifest_identity_mismatch/);
  let began = false;
  const client = { async query(sql) { if (sql === 'BEGIN') began = true; return { rows: [] }; } };
  await assert.rejects(applySqlRolesAndGrants(client, { lythaus_migrations: 'postgres' }), /new_core_role_map_invalid/);
  assert.equal(began, false);
});

test('workflow gates environment job behind secretless existence/source checks and has no dispatch or artifact path', () => {
  const workflowPath = path.resolve('.github/workflows/lythaus-new-core-role-provisioning.yml');
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = YAML.parse(source);
  assert.deepEqual(workflow.on.push.branches, ['codex/new-core-provisioning']);
  assert.equal(Object.hasOwn(workflow.on, 'workflow_dispatch'), false);
  const preflight = workflow.jobs['verify-protected-environment'];
  const protectedJob = workflow.jobs['provision-new-target-roles'];
  assert.equal(protectedJob.needs, 'verify-protected-environment');
  assert.equal(protectedJob.environment.name, NEW_CORE_ENVIRONMENT);
  assert.equal(preflight.permissions.actions, 'read');
  assert.equal(preflight.permissions.contents, 'read');
  assert.doesNotMatch(JSON.stringify(preflight), /secrets\./);
  assert.equal(workflow.permissions.contents, 'read');
  assert.match(source, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(source, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.doesNotMatch(source, /upload-artifact|environment:\s*production|workflow_dispatch/);
  assert.equal(protectedJob.steps.some((step) => String(step.run ?? '').includes('--provision')), true);
  assert.equal(protectedJob.steps.some((step) => step.uses?.includes('actions/upload-artifact')), false);
});
