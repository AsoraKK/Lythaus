import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import { target, grantSql, runVerifierStats } from '../ci/planetscale-verifier-stats.mjs';

const releaseSha = 'a'.repeat(40);
const url = role => `postgresql://${role}.${target.branchId}:synthetic-password@aws.connect.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`;
const environment = () => ({ STATS_OPERATION: 'grant', RELEASE_SHA: releaseSha, GITHUB_SHA: releaseSha,
  GITHUB_REPOSITORY: 'AsoraKK/Lythaus', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '201',
  GH_TOKEN: 'synthetic-github-token', PLANETSCALE_API_TOKEN: 'synthetic:service-token',
  PLANETSCALE_ADMIN_DATABASE_URL: url(target.migrator), PLANETSCALE_SCHEMA_READ_DATABASE_URL: url(target.verifier) });
const member = () => ({ role_id: '3375', member_id: '1002', grantor_id: '1001',
  admin_option: false, inherit_option: true, set_option: true, xmin: '777', tuple_id: '(1,2)' });
const role = (oid, name, superuser = false) => ({ oid, name, superuser,
  create_role: false, create_db: false, replication: false, bypass_rls: false });

function fixture() {
  const world = { roles: [role('10', 'postgres', true), role('1001', target.migrator),
    role('1002', target.verifier), role('3375', target.role)], memberships: [
    { role_id: '3375', member_id: '1001', grantor_id: '10', admin_option: true, inherit_option: true, set_option: true },
  ], queries: [], connections: [], fetches: [], mutationCount: 0 };
  class Client {
    constructor(config) { this.role = decodeURIComponent(new URL(config.connectionString).username).split('.')[0];
      this.pending = null; world.connections.push(this); }
    async connect() { if (world.fail === 'connect') throw new Error('synthetic-password SQL text secret'); }
    async end() { this.closed = true; }
    async query(sql) {
      world.queries.push(sql);
      if (world.fail === 'query' && sql.includes('FROM pg_catalog.pg_auth_members')) throw new Error('SQL text synthetic-password');
      if (sql === 'BEGIN READ WRITE') { this.pending = structuredClone(world.memberships); return { rows: [] }; }
      if (sql === 'ROLLBACK') {
        if (world.fail === 'rollback' && this.pending) throw new Error('SQL text');
        this.pending = null; return { rows: [] };
      }
      if (sql === 'COMMIT') {
        if (world.fail !== 'commit-before') world.memberships = this.pending;
        if (world.fail?.startsWith('commit')) throw new Error('SQL text');
        this.pending = null; return { rows: [] };
      }
      if (sql === grantSql) { world.mutationCount++; this.pending.push({ ...member(),
        grantor_id: world.roles[1].superuser ? '10' : '1001', ...world.badGrant }); return { rows: [] }; }
      if (sql.startsWith('REVOKE ')) {
        world.mutationCount++;
        if (world.dependentGrant) throw new Error('dependent grant SQL text');
        this.pending = this.pending.filter(row => row.member_id !== '1002' || row.role_id !== '3375');
        return { rows: [] };
      }
      if (sql.includes('pg_try_advisory_xact_lock')) {
        if (world.drift) this.pending.push({ role_id: '9999', member_id: '1002' });
        return { rows: [{ locked: !world.locked }] };
      }
      if (sql.includes('pg_current_xact_id')) return { rows: [{ transaction_id: '777' }] };
      if (sql.includes('FROM pg_catalog.pg_roles WHERE rolname')) return { rows: structuredClone(world.roles) };
      if (sql.includes('FROM pg_catalog.pg_auth_members')) return { rows: structuredClone(this.pending ?? world.memberships) };
      if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] };
      if (sql.includes('current_database() AS database_name')) return { rows: [{ database_name: 'postgres',
        connected_user: world.identityDrift ?? this.role, login_user: this.role, server_version_num: world.version ?? '170011',
        transaction_read_only: 'on', is_superuser: this.role === target.migrator && world.roles[1].superuser }] };
      if (sql.includes('pg_get_userbyid')) return { rows: [
        { schema_name: 'media', relation_name: 'upload_sessions', owner_name: 'postgres', effective_owner_role: this.role === target.migrator },
        { schema_name: 'system', relation_name: 'schema_migrations', owner_name: 'postgres', effective_owner_role: this.role === target.migrator },
      ] };
      if (sql.includes("pg_has_role(current_user, 'pg_read_all_stats'")) {
        const usage = this.role === target.migrator || world.memberships.some(row => row.member_id === '1002' && row.role_id === '3375' && row.inherit_option);
        return { rows: [{ pg_read_all_stats_usage: usage && !world.noFreshVisibility,
          pg_monitor_usage: world.monitor ?? false }] };
      }
      if (sql.includes('pg_stat_progress_create_index')) return { rows: [{ active_index_build_observed: false }] };
      return { rows: [] };
    }
  }
  const fetchImpl = async request => {
    world.fetches.push(request);
    if (request.startsWith('https://api.planetscale.com/')) return { ok: true, json: async () => ({ id: world.branchId ?? target.branchId,
      name: 'main', kind: 'postgresql', ready: true, production: true }) };
    return { ok: true, json: async () => ({ object: { sha: world.mainSha ?? releaseSha } }) };
  };
  return { world, execute: (env = environment(), receipt = null) => runVerifierStats({ environment: env,
    fetchImpl, clientFactory: config => new Client(config), receipt }) };
}

test('inspect proves direct grant authority without modifying permissions', async () => {
  const { world, execute } = fixture();
  const report = await execute({ ...environment(), STATS_OPERATION: 'inspect' });
  assert.equal(report.status, 'READY_FOR_APPROVED_GRANT');
  assert.equal(report.before.grantorAuthority, true);
  assert.deepEqual(report.before.direct, []);
  assert.equal(world.mutationCount, 0);
  assert.ok(world.connections.every(client => client.closed));
});

test('sole approved grant commits exact options and proves visibility on a new verifier connection', async () => {
  const { world, execute } = fixture();
  const report = await execute();
  assert.equal(report.status, 'GRANTED_AND_RECONNECTED');
  assert.equal(report.mutationOutcome, 'COMMITTED');
  assert.deepEqual(report.introducedGrant, member());
  assert.equal(report.verifierBefore.indexProgressVisibility.pgReadAllStatsUsage, false);
  assert.equal(report.verifierAfter.indexProgressVisibility.pgReadAllStatsUsage, true);
  assert.equal(world.connections.filter(client => client.role === target.verifier).length, 2);
  assert.deepEqual(world.queries.filter(sql => /^(GRANT|REVOKE|ALTER|CREATE|DROP|INSERT|UPDATE|DELETE)/.test(sql)), [grantSql]);
  assert.ok(world.connections.every(client => client.closed));
  assert.equal(world.fetches.length, 4);
});

test('USAGE and CREATEROLE are not treated as ADMIN OPTION', async () => {
  const { world, execute } = fixture();
  world.memberships[0].admin_option = false;
  world.roles[1].create_role = true;
  const report = await execute();
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockers.includes('grantor_admin_option_or_superuser_required'));
  assert.equal(world.mutationCount, 0);
});

test('a real superuser authority records the bootstrap grantor rather than guessing the session grantor', async () => {
  const { world, execute } = fixture(); world.roles[1].superuser = true;
  assert.equal((await execute()).introducedGrant.grantor_id, '10');
});

test('wrong role, SQL target, provider branch, main SHA, session, version, and options all stop before mutation', async t => {
  const cases = [
    ['configured role', env => { env.PLANETSCALE_SCHEMA_READ_DATABASE_URL = url('pscale_api_other'); }],
    ['SQL branch', env => { env.PLANETSCALE_ADMIN_DATABASE_URL = url(target.migrator).replace(target.branchId, 'other'); }],
    ['connection options', env => { env.PLANETSCALE_ADMIN_DATABASE_URL += '&options=-crole=postgres'; }],
    ['hostname', env => { env.PLANETSCALE_ADMIN_DATABASE_URL = url(target.migrator).replace('aws.connect.psdb.cloud', 'example.com'); }],
    ['SQL database', env => { env.PLANETSCALE_ADMIN_DATABASE_URL = url(target.migrator).replace('/postgres?', '/other?'); }],
    ['provider branch', (_, world) => { world.branchId = 'other'; }],
    ['current main', (_, world) => { world.mainSha = 'b'.repeat(40); }],
    ['connected identity', (_, world) => { world.identityDrift = 'postgres'; }],
    ['PostgreSQL version', (_, world) => { world.version = '180000'; }],
    ['verifier superuser', (_, world) => { world.roles[2].superuser = true; }],
    ['unexpected pg_monitor', (_, world) => { world.monitor = true; }],
    ['preexisting non-inherited membership', (_, world) => { world.memberships.push({ ...member(), inherit_option: false }); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const { world, execute } = fixture(), env = environment(); mutate(env, world);
    assert.equal((await execute(env)).status, 'BLOCKED');
    assert.equal(world.mutationCount, 0);
  });
});

test('concurrent state drift, lock refusal, invalid postcondition and transport errors fail closed', async t => {
  for (const [name, change] of [
    ['drift', world => { world.drift = true; }], ['locked', world => { world.locked = true; }],
    ['bad grant', world => { world.badGrant = { admin_option: true }; }],
    ['different transaction', world => { world.badGrant = { xmin: '778' }; }],
    ['connect', world => { world.fail = 'connect'; }], ['query', world => { world.fail = 'query'; }],
  ]) await t.test(name, async () => {
    const { world, execute } = fixture(); change(world); const report = await execute();
    assert.equal(report.status, 'BLOCKED');
    assert.equal(world.memberships.length, 1);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-password|SQL text/);
  });
});

test('commit ambiguity is preserved and is never automatically retried or reversed', async t => {
  for (const mode of ['commit-before', 'commit-after']) await t.test(mode, async () => {
    const { world, execute } = fixture(); world.fail = mode;
    const report = await execute();
    assert.equal(report.mutationOutcome, 'UNKNOWN_COMMIT_OUTCOME');
    assert.equal(world.mutationCount, 1);
    assert.equal(world.queries.filter(sql => sql.startsWith('REVOKE ')).length, 0);
  });
});

test('a failed rollback is reported as uncertain and invalid execution fields are redacted', async () => {
  const { world, execute } = fixture();
  world.badGrant = { admin_option: true }; world.fail = 'rollback';
  assert.equal((await execute()).mutationOutcome, 'UNKNOWN_ROLLBACK_OUTCOME');
  const report = await execute({ ...environment(), RELEASE_SHA: 'SQL text synthetic-password' });
  assert.equal(report.sourceMainSha, null);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-password|SQL text/);
});

test('failed reconnect leaves a committed receipt and never claims rollback', async () => {
  const { world, execute } = fixture(); world.noFreshVisibility = true;
  const report = await execute();
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.mutationOutcome, 'COMMITTED');
  assert.deepEqual(report.introducedGrant, member());
});

test('rollback revokes only the evidenced introduced grant, attributed to its recorded grantor, with RESTRICT', async () => {
  const { world, execute } = fixture(); const receipt = await execute();
  const report = await execute({ ...environment(), STATS_OPERATION: 'revoke', GITHUB_RUN_ID: '202',
    GRANT_RUN_ID: '201', VERIFIED_GRANT_RUN_SHA: releaseSha }, receipt);
  assert.equal(report.status, 'INTRODUCED_GRANT_REVOKED');
  assert.equal(world.memberships.length, 1);
  assert.ok(world.queries.includes('REVOKE pg_read_all_stats FROM "pscale_api_qodocjs6vgrb" GRANTED BY "pscale_api_47syed2xlt6p" RESTRICT'));
  assert.ok(!world.queries.some(sql => sql.includes('CASCADE')));
});

test('rollback rejects missing, wrong-run, wrong-target or changed membership receipts and restricts dependencies', async t => {
  for (const mode of ['missing', 'wrong-run', 'wrong-sha', 'wrong-target', 'added-row', 'changed-options', 'reintroduced-row', 'dependency']) await t.test(mode, async () => {
    const { world, execute } = fixture(); let receipt = await execute();
    if (mode === 'missing') receipt = null;
    if (mode === 'wrong-run') receipt.runId = '999';
    if (mode === 'wrong-sha') receipt.sourceMainSha = 'b'.repeat(40);
    if (mode === 'wrong-target') receipt = { ...receipt, target: { ...target, branchId: 'other' } };
    if (mode === 'added-row') world.memberships.push({ ...member(), grantor_id: '10' });
    if (mode === 'changed-options') world.memberships[1].admin_option = true;
    if (mode === 'reintroduced-row') world.memberships[1].xmin = '778';
    if (mode === 'dependency') world.dependentGrant = true;
    const report = await execute({ ...environment(), STATS_OPERATION: 'revoke', GITHUB_RUN_ID: '202',
      GRANT_RUN_ID: '201', VERIFIED_GRANT_RUN_SHA: releaseSha }, receipt);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(world.memberships.some(row => row.member_id === '1002'));
  });
});

test('workflow pins production, immutable main, credential reuse, receipt provenance and required CI registration', () => {
  const source = fs.readFileSync('.github/workflows/planetscale-verifier-stats.yml', 'utf8');
  const workflow = YAML.parse(source);
  assert.equal(workflow.jobs.stats.environment, 'production');
  assert.equal(workflow.concurrency.group, 'lythaus-production-planetscale-migrations');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.on.workflow_dispatch.inputs.operation.default, 'inspect');
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.match(source, /git rev-parse origin\/main/);
  assert.match(source, /VERIFIED_GRANT_RUN_SHA/);
  assert.match(source, /\.head_branch == \\\"main\\\"|\.head_branch == "main"/);
  assert.match(source, /PLANETSCALE_ADMIN_DATABASE_URL/);
  assert.doesNotMatch(source, /reconcile-planetscale-schema-verifier|PSCALE_ROLE_IDENTIFIERS|SERVICE_TOKEN_ID|CASCADE/);
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /run: node --test scripts\/tests\/planetscale-verifier-stats\.test\.mjs/);
});
