import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  assessCutoverIdentityPreflight,
  collectCutoverIdentityEvidence,
  inspectDatabaseIdentity,
} from '../ci/planetscale-cutover-identity-preflight.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';
import { inspectProductGrantorAuthority, PRODUCT_GRANTOR_CHECKS } from '../ci/product-grantor-authority.mjs';

const workflowPath = '.github/workflows/planetscale-cutover-identity-preflight.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const connection = (role) => `postgresql://pscale_api_${role}.branch123:synthetic-password@aws.connect.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`;
const adminTarget = branchQualifiedDatabaseTarget(connection('migrator'));
const verifierTarget = branchQualifiedDatabaseTarget(connection('verifier'));
const releaseSha = 'a'.repeat(40);

function snapshot({ user, isSuperuser = false, statsVisible = true, monitorVisible = false, activeBuild = false, ownerAccess = true } = {}) {
  return {
    databaseName: 'postgres',
    currentUser: user,
    sessionUser: user,
    serverVersionNum: '170006',
    transactionReadOnly: 'on',
    isSuperuser,
    relationOwners: [
      { schemaName: 'media', relationName: 'upload_sessions', ownerName: 'postgres', effectiveOwnerRole: ownerAccess },
      { schemaName: 'system', relationName: 'schema_migrations', ownerName: 'postgres', effectiveOwnerRole: ownerAccess },
    ],
    indexProgressVisibility: {
      pgReadAllStatsUsage: statsVisible,
      pgMonitorUsage: monitorVisible,
      effective: isSuperuser || statsVisible,
      activeBuildObserved: isSuperuser || statsVisible ? activeBuild : null,
    },
  };
}

function assess(overrides = {}) {
  return assessCutoverIdentityPreflight({
    releaseSha,
    providerBranchId: 'branch123',
    adminTarget,
    verifierTarget,
    adminSnapshot: snapshot({ user: 'pscale_api_migrator' }),
    verifierSnapshot: snapshot({ user: 'pscale_api_verifier' }),
    generatedAt: '2026-10-20T12:00:00.000Z',
    ...overrides,
  });
}

class FakeClient {
  constructor({ user, isSuperuser = false, statsVisible = true, monitorVisible = false, activeBuild = false, readOnly = 'on', failAt = '', secret = '' }) {
    this.user = user;
    this.isSuperuser = isSuperuser;
    this.statsVisible = statsVisible;
    this.monitorVisible = monitorVisible;
    this.activeBuild = activeBuild;
    this.readOnly = readOnly;
    this.failAt = failAt;
    this.secret = secret;
    this.queries = [];
    this.connected = false;
    this.closed = false;
  }

  async connect() {
    if (this.failAt === 'connect') throw new Error(this.secret);
    this.connected = true;
  }

  async end() { this.closed = true; }

  async query(sql) {
    this.queries.push(sql);
    if (this.failAt === 'query' && sql.includes('pg_get_userbyid')) throw new Error(this.secret);
    if (this.failAt === 'rollback' && sql === 'ROLLBACK') throw new Error(this.secret);
    if (this.failAt === 'grantor' && sql.includes('AS grantable')) throw new Error(this.secret);
    if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: this.readOnly }] };
    if (sql.includes('current_database() AS database_name')) {
      return { rows: [{
        database_name: 'postgres', connected_user: this.user, login_user: this.user,
        server_version_num: '170006', transaction_read_only: 'on', is_superuser: this.isSuperuser,
      }] };
    }
    if (sql.includes('pg_get_userbyid')) {
      return { rows: [
        { schema_name: 'media', relation_name: 'upload_sessions', owner_name: 'postgres', effective_owner_role: true },
        { schema_name: 'system', relation_name: 'schema_migrations', owner_name: 'postgres', effective_owner_role: true },
      ] };
    }
    if (sql.includes("'pg_read_all_stats'")) {
      return { rows: [{ pg_read_all_stats_usage: this.statsVisible, pg_monitor_usage: this.monitorVisible }] };
    }
    if (sql.includes('pg_stat_progress_create_index')) {
      return { rows: [{ active_index_build_observed: this.activeBuild }] };
    }
    if (sql.includes('AS grantable')) return { rows: [{ grantable: true }] };
    return { rows: [] };
  }
}

test('passes only when both distinct connected identities target current main with owner and progress visibility', () => {
  const report = assess();
  assert.equal(report.status, 'IDENTITY_PREFLIGHT_PASSED');
  assert.equal(report.cutoverDecision, 'NOT_ASSESSED');
  assert.equal(report.databaseWrites, false);
  assert.equal(report.providerMutations, false);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.identities.migrator.currentUser, 'pscale_api_migrator');
  assert.equal(report.identities.verifier.currentUser, 'pscale_api_verifier');
  assert.equal(report.identities.migrator.relationOwners[0].ownerName, 'postgres');
});

test('blocks source branch, SQL origin, identity, ownership, stats visibility, and active index mismatches', () => {
  const cases = [
    [{ providerBranchId: 'other123' }, 'migrator_database_branch_id_does_not_match_main'],
    [{ verifierTarget: { ...verifierTarget, originFingerprint: 'f'.repeat(64) } }, 'migrator_and_verifier_database_origins_differ'],
    [{ verifierSnapshot: snapshot({ user: 'pscale_api_migrator' }) }, 'migrator_and_verifier_connected_identities_are_not_separate'],
    [{ adminSnapshot: snapshot({ user: 'pscale_api_migrator', ownerAccess: false }) }, 'migrator_effective_relation_owner_access_missing'],
    [{ verifierSnapshot: snapshot({ user: 'pscale_api_verifier', statsVisible: false }) }, 'verifier_effective_index_progress_visibility_missing'],
    [{ verifierSnapshot: snapshot({ user: 'pscale_api_verifier', statsVisible: false, monitorVisible: true }) }, 'verifier_effective_index_progress_visibility_missing'],
    [{ verifierSnapshot: snapshot({ user: 'pscale_api_verifier', activeBuild: true }) }, 'active_index_build_observed'],
    [{ releaseSha: 'not-an-exact-sha' }, 'release_sha_missing_or_invalid'],
  ];
  for (const [overrides, blocker] of cases) {
    assert.ok(assess(overrides).blockers.includes(blocker), blocker);
  }
});

test('probes use bounded read-only transactions and hide active-build state without effective visibility', async () => {
  const client = new FakeClient({ user: 'pscale_api_verifier', statsVisible: false, monitorVisible: true });
  const observed = await inspectDatabaseIdentity(client);
  assert.equal(observed.indexProgressVisibility.effective, false);
  assert.equal(observed.indexProgressVisibility.activeBuildObserved, null);
  assert.ok(client.queries.includes('BEGIN READ ONLY'));
  assert.ok(client.queries.includes('ROLLBACK'));
  assert.ok(client.queries.some((query) => query.includes('LIMIT 3')));
  assert.ok(client.queries.some((query) => query.includes('pg_monitor')));
  assert.ok(!client.queries.some((query) => query.includes('pg_stat_progress_create_index')));
  for (const query of client.queries) {
    assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  }

  const unconfirmed = new FakeClient({ user: 'pscale_api_verifier', readOnly: 'off' });
  await assert.rejects(inspectDatabaseIdentity(unconfirmed), { code: 'read_only_transaction_not_confirmed' });
  assert.ok(unconfirmed.queries.includes('ROLLBACK'));
  assert.ok(!unconfirmed.queries.some((query) => query.includes('pg_get_userbyid')));

  const superuser = new FakeClient({ user: 'pscale_api_migrator', isSuperuser: true, statsVisible: false });
  const superuserObserved = await inspectDatabaseIdentity(superuser);
  assert.equal(superuserObserved.indexProgressVisibility.effective, true);
  assert.equal(superuserObserved.indexProgressVisibility.activeBuildObserved, false);
  assert.ok(superuser.queries.some((query) => query.includes('pg_stat_progress_create_index')));
});

test('requires the live PlanetScale main branch before opening either SQL connection and emits sanitized evidence', async () => {
  const clients = [];
  const environment = {
    RELEASE_SHA: releaseSha,
    PLANETSCALE_API_TOKEN: 'synthetic-id:synthetic-token',
    PLANETSCALE_ADMIN_DATABASE_URL: connection('migrator'),
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection('verifier'),
  };
  const report = await collectCutoverIdentityEvidence({
    environment,
    generatedAt: '2026-10-20T12:00:00.000Z',
    fetchImpl: async (url, options) => {
      assert.match(url, /\/branches\/main$/);
      assert.equal(options.method, 'GET');
      return { ok: true, json: async () => ({ name: 'main', id: 'branch123' }) };
    },
    clientFactory: (config) => {
      const user = config.application_name.endsWith('migrator') ? 'pscale_api_migrator' : 'pscale_api_verifier';
      const client = new FakeClient({ user });
      clients.push({ config, client });
      return client;
    },
  });
  assert.equal(report.status, 'IDENTITY_PREFLIGHT_PASSED');
  assert.equal(clients.length, 2);
  assert.equal(report.productGrantAuthority.status, 'AUTHORITY_PRESENT_NOT_EXECUTED');
  assert.equal(report.productGrantAuthority.grantsExecuted, false);
  assert.equal(report.productGrantAuthority.checks.length, 17);
  assert.ok(clients[0].client.queries.some(sql => sql.includes('AS grantable')));
  assert.ok(!clients[1].client.queries.some(sql => sql.includes('AS grantable')));
  assert.ok(clients.every(({ config }) => config.ssl.rejectUnauthorized === true));
  assert.ok(clients.every(({ client }) => client.closed));
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('synthetic-password'));
  assert.ok(!serialized.includes('synthetic-token'));
  assert.ok(!serialized.includes('psdb.cloud'));

  const mismatchedClients = [];
  const blocked = await collectCutoverIdentityEvidence({
    environment,
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'GET');
      return { ok: true, json: async () => ({ name: 'main', id: 'different123' }) };
    },
    clientFactory: (config) => { mismatchedClients.push(config); return new FakeClient({ user: 'never-used' }); },
  });
  assert.equal(blocked.status, 'BLOCKED');
  assert.ok(blocked.blockers.includes('migrator_database_branch_id_does_not_match_main'));
  assert.equal(mismatchedClients.length, 0);
});

test('connection, probe, and rollback failures stay sanitized and close both clients', async () => {
  const environment = {
    RELEASE_SHA: releaseSha,
    PLANETSCALE_API_TOKEN: 'synthetic-id:synthetic-token',
    PLANETSCALE_ADMIN_DATABASE_URL: connection('migrator'),
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection('verifier'),
  };
  for (const failAt of ['connect', 'query', 'rollback']) {
    const clients = [];
    const report = await collectCutoverIdentityEvidence({
      environment,
      fetchImpl: async () => ({ ok: true, json: async () => ({ name: 'main', id: 'branch123' }) }),
      clientFactory: (config) => {
        const user = config.application_name.endsWith('migrator') ? 'pscale_api_migrator' : 'pscale_api_verifier';
        const client = new FakeClient({ user, failAt, secret: `secret-bearing-${failAt}-failure` });
        clients.push(client);
        return client;
      },
    });
    assert.equal(report.status, 'BLOCKED', failAt);
    assert.equal(clients.length, 2, failAt);
    assert.ok(clients.every((client) => client.closed), `${failAt} failure should close both clients`);
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes(`secret-bearing-${failAt}-failure`), failAt);
    assert.ok(!serialized.includes('synthetic-password'), failAt);
    assert.ok(!serialized.includes('synthetic-token'), failAt);
  }
});

test('manual workflow is protected, exact-SHA gated, read-only, and has no bypass input', () => {
  const identityWorkflow = workflow.split('\n  restore_inventory:')[0];
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(workflow, /test "\$REF_PROTECTED" = true/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$RELEASE_SHA"/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$RELEASE_SHA"/);
  assert.ok(workflow.indexOf('Recheck current main before protected reads') < workflow.indexOf('PLANETSCALE_ADMIN_DATABASE_URL:'));
  assert.match(workflow, /PLANETSCALE_ADMIN_DATABASE_URL: \$\{\{ secrets\.PLANETSCALE_ADMIN_DATABASE_URL \}\}/);
  assert.match(workflow, /PLANETSCALE_SCHEMA_READ_DATABASE_URL: \$\{\{ secrets\.PLANETSCALE_SCHEMA_READ_DATABASE_URL \}\}/);
  assert.match(workflow, /PLANETSCALE_API_TOKEN: \$\{\{ secrets\.PLANETSCALE_API_TOKEN \}\}/);
  assert.match(workflow, /\[\[ "\$RELEASE_SHA" == "\$\(git rev-parse HEAD\)" \]\]/);
  assert.match(workflow, /\[\[ "\$RELEASE_SHA" == "\$\(git rev-parse origin\/main\)" \]\]/);
  assert.match(workflow, /\[\[ "\$RELEASE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.doesNotMatch(identityWorkflow, /PLANETSCALE_SERVICE_TOKEN|PSCALE_ROLE_IDENTIFIERS|execute_0021|reconcile-planetscale|apply-planetscale/);
  assert.doesNotMatch(workflow, /\b(GRANT|REVOKE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.equal((workflow.match(/^      [a-zA-Z0-9_]+:\s*$/gm) ?? []).length, 2);
  assert.match(workflow, /if: inputs.inspection == 'identity'/);
  const source = fs.readFileSync('scripts/ci/planetscale-cutover-identity-preflight.mjs', 'utf8');
  assert.match(source, /method: 'GET'/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.doesNotMatch(source, /console\.(error|warn)\(.*error|error\.message/);
  assert.doesNotMatch(source, /['"`]\s*(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
});

test('product grantor checks require every exact column/schema grant option without reading rows or changing security', async () => {
  assert.equal(PRODUCT_GRANTOR_CHECKS.length, 17);
  const queries = [];
  const client = { query: async (sql, values) => {
    queries.push({ sql, values });
    return { rows: sql === 'SHOW transaction_read_only' ? [{ transaction_read_only: 'on' }] : [{ grantable: true }] };
  } };
  const observed = await inspectProductGrantorAuthority(client);
  assert.equal(observed.status, 'AUTHORITY_PRESENT_NOT_EXECUTED');
  assert.equal(observed.grantsExecuted, false);
  assert.equal(observed.checks.length, 17);
  assert.deepEqual(queries.slice(1).map(query => query.values.at(-1)), [
    ...Array(7).fill('SELECT WITH GRANT OPTION'), ...Array(5).fill('INSERT WITH GRANT OPTION'),
    ...Array(4).fill('SELECT WITH GRANT OPTION'), 'USAGE WITH GRANT OPTION',
  ]);
  for (const { sql } of queries) {
    assert.doesNotMatch(sql, /\b(SET ROLE|INSERT INTO|UPDATE|DELETE|REVOKE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
    assert.doesNotMatch(sql, /\bFROM\s+(trust|editorial|identity|content|system)\./i);
    assert.doesNotMatch(sql, /^\s*GRANT\b/i);
  }
});

test('ordinary privileges cannot substitute for even one missing grant option', async () => {
  for (let missing = 0; missing < PRODUCT_GRANTOR_CHECKS.length; missing++) {
    let check = 0;
    const report = await inspectProductGrantorAuthority({ query: async sql => ({ rows:
      sql === 'SHOW transaction_read_only' ? [{ transaction_read_only: 'on' }] : [{ grantable: check++ !== missing }],
    }) });
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.reason, 'product_grantor_authority_missing');
    assert.equal(report.checks.filter(item => !item.grantable).length, 1);
  }
});

test('missing, ambiguous, unknown and failed grantor probes remain blocked and sanitized', async () => {
  for (const rows of [[], [{ grantable: true }, { grantable: true }], [{ grantable: null }], [{ grantable: 'true' }]]) {
    const report = await inspectProductGrantorAuthority({ query: async sql => ({ rows:
      sql === 'SHOW transaction_read_only' ? [{ transaction_read_only: 'on' }] : rows,
    }) });
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.reason, 'product_grantor_catalog_evidence_incomplete');
  }
  const failed = await inspectProductGrantorAuthority({ query: async () => { throw new Error('private-connection-secret'); } });
  assert.equal(failed.reason, 'product_grantor_catalog_probe_failed');
  assert.ok(!JSON.stringify(failed).includes('private-connection-secret'));
  let reads = 0;
  const writable = await inspectProductGrantorAuthority({ query: async () => { reads++; return { rows: [{ transaction_read_only: 'off' }] }; } });
  assert.equal(writable.reason, 'product_grantor_read_only_not_confirmed');
  assert.equal(reads, 1);
});

test('grantor evidence stays independent of cutover status and is suppressed on identity failure', () => {
  const adminSnapshot = snapshot({ user: 'pscale_api_migrator' });
  adminSnapshot.productGrantAuthority = { status: 'BLOCKED', reason: 'product_grantor_authority_missing', grantsExecuted: false, checks: [] };
  const observed = assess({ adminSnapshot });
  assert.equal(observed.status, 'IDENTITY_PREFLIGHT_PASSED');
  assert.equal(observed.productGrantAuthority.status, 'BLOCKED');
  adminSnapshot.productGrantAuthority.status = 'AUTHORITY_PRESENT_NOT_EXECUTED';
  const mismatched = assess({ adminSnapshot, providerBranchId: 'other123' });
  assert.equal(mismatched.productGrantAuthority.status, 'BLOCKED');
  assert.equal(mismatched.productGrantAuthority.reason, 'cutover_identity_preflight_blocked');
  assert.deepEqual(mismatched.productGrantAuthority.checks, []);
});

test('failed product authority query retains identity evidence and rolls back the read-only transaction', async () => {
  const client = new FakeClient({ user: 'pscale_api_migrator', failAt: 'grantor', secret: 'private-error' });
  const observed = await inspectDatabaseIdentity(client, { inspectProductGrants: true });
  assert.equal(observed.currentUser, 'pscale_api_migrator');
  assert.equal(observed.productGrantAuthority.status, 'BLOCKED');
  assert.equal(observed.productGrantAuthority.reason, 'product_grantor_catalog_probe_failed');
  assert.equal(client.queries.at(-1), 'ROLLBACK');
  assert.ok(!JSON.stringify(observed).includes('private-error'));
});
