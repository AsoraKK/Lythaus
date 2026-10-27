import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { TARGET, BASELINE, GRANT_SQL, SQL_SHA256, ROLLBACK_SQL_SHA256, runProductGrants } from '../ci/product-privilege-grants.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';

const secret = 'synthetic-password-must-not-appear';
const sourceSha = 'a'.repeat(40);
const url = role => `postgresql://${role}.${TARGET.branchId}:${secret}@aws.connect.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`;
const fingerprint = branchQualifiedDatabaseTarget(url(TARGET.admin)).originFingerprint;
const statements = GRANT_SQL.match(/GRANT[\s\S]*?;/g);
const names = { 16409: 'postgres', 16489: 'pscale_api_trmeaqp1p2s6', 17977: 'pscale_api_vi7jysvnkedy',
  17980: TARGET.runtime, 17981: 'pscale_api_3vzps7bu44vo', 17982: 'pscale_api_9jfbtij9y4b2',
  17983: 'pscale_api_wv7rzyuejknl', 18006: TARGET.verifier, 18217: TARGET.admin };
const all = ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];
const entry = (owner, grantee, privilege) => ({ grantorOid: owner, grantor: names[owner], granteeOid: grantee,
  grantee: names[grantee], privilege, isGrantable: false });
const acl = (kind, objectOid, ownerOid, grants, extra = {}) => ({ kind, ...extra, objectOid, ownerOid, owner: names[ownerOid],
  aclIsNull: grants === null, entries: (grants ?? []).flatMap(([grantee, privileges]) => privileges.map(privilege => entry(ownerOid, grantee, privilege))) });
const key = item => item.kind === 'column' ? `column:${item.column}` : item.kind;

function fixture(options = {}) {
  const schemaBase = [[16409, ['CREATE', 'USAGE']], [16489, ['CREATE', 'USAGE']], [17977, ['CREATE', 'USAGE']]];
  const objects = [
    { schema: 'trust', relation: 'reward_redemptions', oid: 18357, schemaOid: 16763, ownerOid: 18217, schemaUsage: true,
      aclSnapshot: [acl('schema', 16763, 16409, [...schemaBase, ...[17980, 17981, 17982, 17983, 18006].map(id => [id, ['USAGE']])]),
        acl('table', 18357, 18217, [[17983, ['DELETE', 'SELECT']], [18006, ['REFERENCES']], [18217, all]]),
        ...[['id', 1], ['user_id', 2], ['reward_id', 3], ['reward_level', 4], ['reward_title', 5], ['redeemed_at', 7], ['status', 6]]
          .map(([column, attributeNumber]) => acl('column', 18357, 18217, null, { column, attributeNumber }))] },
    { schema: 'editorial', relation: 'publications', oid: 17873, schemaOid: 16765, ownerOid: 16409, schemaUsage: false,
      aclSnapshot: [acl('schema', 16765, 16409, [...schemaBase, ...[17981, 17983, 18006].map(id => [id, ['USAGE']])]),
        acl('table', 17873, 16409, [[16409, all], [17981, ['INSERT', 'SELECT', 'UPDATE']], [18006, ['REFERENCES']]]),
        ...[['id', 1], ['title', 3], ['post_id', 4], ['published_at', 5]]
          .map(([column, attributeNumber]) => acl('column', 17873, 16409, null, { column, attributeNumber }))] },
  ];
  for (const object of objects) object.versions = Object.fromEntries(object.aclSnapshot.map((item, index) => [key(item), { xmin: '100', tupleId: `(0,${index + 1})` }]));
  const initial = structuredClone(objects), clients = [], queries = [], requests = [];
  let beginState;
  function add(sql) {
    const index = statements.indexOf(sql), object = objects[index === 3 || index === 2 ? 1 : 0];
    assert.ok(index >= 0, 'only the four fixed statements may execute');
    const columns = index === 0 ? ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title', 'redeemed_at', 'status']
      : index === 1 ? ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title'] : ['id', 'title', 'post_id', 'published_at'];
    for (const item of object.aclSnapshot.filter(item => index === 2 ? item.kind === 'schema' : item.kind === 'column' && columns.includes(item.column))) {
      const added = entry(item.ownerOid, 17980, index === 1 ? 'INSERT' : index === 2 ? 'USAGE' : 'SELECT');
      if (options.badGrantor) { added.grantorOid = 16489; added.grantor = names[16489]; }
      if (options.grantOption) added.isGrantable = true;
      item.entries.push(added); item.aclIsNull = false;
      object.versions[key(item)] = { xmin: options.staleVersion ? '100' : '7777', tupleId: '(1,1)' };
    }
    if (index === 2) object.schemaUsage = true;
    if (index === 3 && options.extraAcl) objects[0].aclSnapshot.find(item => item.kind === 'table').entries.push(entry(18217, 16489, 'REFERENCES'));
  }
  class Client {
    constructor(config) {
      this.config = config; this.role = branchQualifiedDatabaseTarget(config.connectionString).role; clients.push(this);
      if (options.readbackDrift && clients.length === 2) objects[0].aclSnapshot.find(item => item.kind === 'table').entries.push(entry(18217, 16489, 'REFERENCES'));
    }
    on() {}
    async connect() { if (options.readbackFailure && clients.length > 1) throw Object.assign(new Error(secret), { safeCode: secret }); }
    async end() { this.closed = true; }
    async query(text, values = []) {
      queries.push({ text, values, client: this });
      const result = rows => ({ rows });
      if (text === 'BEGIN READ ONLY') { this.readOnly = true; return result([]); }
      if (text === 'BEGIN READ WRITE') {
        this.readOnly = false; beginState = structuredClone(objects);
        if (options.drift) objects[0].aclSnapshot.find(item => item.kind === 'table').entries.push(entry(18217, 16489, 'REFERENCES'));
        return result([]);
      }
      if (text === 'ROLLBACK') {
        if (!this.readOnly && beginState) { objects.splice(0, objects.length, ...structuredClone(beginState)); beginState = null; }
        if (options.rollbackFailure && !this.readOnly) throw new Error(secret);
        return result([]);
      }
      if (text === 'COMMIT') {
        beginState = null;
        if (options.commitFailure) throw Object.assign(new Error(secret), { safeCode: secret });
        return { command: 'COMMIT', rows: [] };
      }
      if (text.startsWith('SET LOCAL ')) return result([]);
      if (text.includes('pg_try_advisory_xact_lock')) return result([{ locked: !options.lockFailure }]);
      if (text.includes('pg_current_xact_id()')) return result([{ transaction_id: '7777' }]);
      if (text.startsWith('GRANT')) {
        if (options.failStatement === statements.indexOf(text) + 1) throw new Error(secret);
        add(text); return result([]);
      }
      if (text.includes('AS read_only')) return result([{ database: options.wrongDatabase ? 'other' : 'postgres', current_user: this.role, session_user: this.role, version: '170011', read_only: this.readOnly ? 'on' : 'off' }]);
      if (text.includes('rolreplication')) return result([16409, 18217, 18006, 17980].map(oid => ({ oid, rolname: names[oid],
        rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolinherit: true, rolcanlogin: true })));
      if (text.includes("'MEMBER'")) return result([{ count: options.memberships ? 1 : 0 }]);
      if (text.includes('AS admin_schema_owner')) {
        const object = objects.find(item => item.schema === values[2] && item.relation === values[3]);
        return result([{ oid: object.oid, schema_oid: object.schemaOid, owner_oid: object.ownerOid, schema_owner_oid: 16409,
          owner: names[object.ownerOid], rls: options.rls ?? false, force_rls: false, policies: 0, admin_owner: true,
          admin_schema_owner: true, runtime_owner: false, schema_usage: object.schemaUsage, schema_create: false }]);
      }
      if (text.startsWith('SELECT pg_catalog.has_table_privilege')) return result([{ permitted: false }]);
      if (text.startsWith('WITH target AS (')) {
        const object = objects.find(item => item.oid === values[2]);
        return result(object.aclSnapshot.map(item => ({ kind: item.kind, column_name: item.column ?? null, attribute_number: item.attributeNumber ?? null,
          object_oid: item.objectOid, owner_oid: item.ownerOid, owner: item.owner, acl_is_null: item.aclIsNull,
          xmin: object.versions[key(item)].xmin, tuple_id: object.versions[key(item)].tupleId,
          entries: structuredClone(item.entries).map(entry => options.unsafeMetadata ? { ...entry, grantor: `${secret}\n` } : entry) })));
      }
      if (text.includes('AS runtime_grantable')) {
        const object = objects.find(item => item.oid === values[2] || item.schemaOid === values[2]);
        const item = object.aclSnapshot.find(item => values[4] ? item.column === values[4] : item.kind === 'schema');
        const entries = item.entries.filter(entry => entry.granteeOid === 17980 && entry.privilege === values[3]);
        return result([{ permitted: !!entries.length, authority: !options.authorityFailure, runtime_grantable: entries.some(entry => entry.isGrantable) }]);
      }
      throw new Error('unexpected_fixture_query');
    }
  }
  const environment = { RELEASE_SHA: sourceSha, GITHUB_SHA: sourceSha, GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
    GITHUB_REPOSITORY: 'fixture-owner/Lythaus', GITHUB_REPOSITORY_ID: '1010752912', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GH_TOKEN: secret,
    PLANETSCALE_ADMIN_DATABASE_URL: url(TARGET.admin), PLANETSCALE_SCHEMA_READ_DATABASE_URL: url(TARGET.verifier),
    PLANETSCALE_API_TOKEN: `synthetic-id:${secret}`, CLOUDFLARE_API_TOKEN: secret, PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: TARGET.runtime }) };
  const checkpoints = [];
  return { objects, initial, clients, queries, requests, checkpoints, execute: overrides => runProductGrants({ environment: { ...environment, ...overrides },
    reviewedOriginFingerprint: fingerprint, clientFactory: config => new Client(config),
    checkpoint: receipt => {
      checkpoints.push(structuredClone(receipt));
      if (options.checkpointFailure && (receipt.phase === options.checkpointFailure
        || options.checkpointFailure === 'AFTER_COMMIT' && receipt.mutationOutcome === 'COMMITTED')) throw new Error(secret);
    },
    fetchImpl: async (address, request) => {
      requests.push({ address, request });
      if (options.providerDenied && address.includes('planetscale')) return { ok: false };
      if (options.repositoryDenied && address.endsWith('/fixture-owner/Lythaus')) return { ok: false };
      return { ok: true, json: async () => address.endsWith('/fixture-owner/Lythaus') || address.endsWith('/other/Lythaus')
        ? { id: options.wrongRepositoryId ? 123 : 1010752912, name: 'Lythaus', full_name: 'fixture-owner/Lythaus' }
        : address.includes('github') ? { protected: true, commit: { sha: options.mainChanged ? 'b'.repeat(40) : sourceSha } }
        : { name: 'main', id: TARGET.branchId, kind: 'postgresql', ready: true, production: true } };
    }, verifyTargets: async input => { assert.equal(input.readOnlyGetOnly, true); return { status: options.mappingFailure ? 'fail' : 'pass',
      targetBranch: 'main', originFingerprint: fingerprint, bindings: [{ hyperdriveId: TARGET.hyperdriveId, roleClass: 'lythaus_runtime', roleMatches: true }] }; },
  }) };
}

test('pinned artifact baseline produces exactly four approved statements, seventeen entries, and two fresh committed readbacks', async () => {
  const f = fixture(), report = await f.execute();
  assert.equal(report.status, 'GRANTED_AND_READBACK_VERIFIED', JSON.stringify(report.blockers));
  assert.equal(report.mutationOutcome, 'COMMITTED');
  assert.equal(report.statementsAttempted, 4);
  assert.equal(report.introduced.length, 17);
  assert.ok(report.before.objects.every(object => !object.rowSecurity && !object.forceRowSecurity && object.policyCount === 0
    && object.adminOwner && object.adminSchemaOwner && !object.runtimeOwner && !object.schemaCreate));
  assert.deepEqual(f.queries.filter(q => /^(GRANT|REVOKE|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)/.test(q.text)).map(q => q.text), statements);
  assert.equal(f.queries.filter(q => q.text === 'COMMIT').length, 1);
  assert.equal(f.clients.length, 3);
  assert.equal(f.checkpoints.find(receipt => receipt.phase === 'COMMIT_ATTEMPT_PENDING').mutationOutcome, 'UNKNOWN_COMMIT_OUTCOME');
  assert.ok(f.clients.every(client => client.closed && client.config.ssl.rejectUnauthorized));
  assert.equal(f.requests.length, 5);
  assert.ok(f.requests.every(call => call.request.method === 'GET' && call.request.redirect === 'error'));
  const encoded = JSON.stringify(report);
  for (const value of [secret, 'postgresql://', 'psdb.cloud', 'connectionString', 'Authorization']) assert.equal(encoded.includes(value), false);
  for (const q of f.queries) assert.doesNotMatch(q.text, /\bFROM\s+(trust|editorial)\./i);
});

test('unwritable receipt checkpoints prevent commit and roll back any staged grants', async () => {
  for (const phase of ['BEFORE_TRANSACTION', 'BEFORE_GRANTS', 'COMMIT_ATTEMPT_PENDING']) {
    const f = fixture({ checkpointFailure: phase }), report = await f.execute();
    assert.equal(report.mutationOutcome, phase === 'BEFORE_TRANSACTION' ? 'NOT_ATTEMPTED' : 'ROLLED_BACK');
    assert.equal(f.queries.filter(query => query.text === 'COMMIT').length, 0);
    assert.deepEqual(f.objects, f.initial);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test('preconditions, denied reads and rerun attempts stop without a grant or fallback', async () => {
  const cases = [ [{ providerDenied: true }, {}], [{ repositoryDenied: true }, {}], [{ wrongRepositoryId: true }, {}],
    [{ mainChanged: true }, {}], [{ mappingFailure: true }, {}],
    [{ memberships: true }, {}], [{ rls: true }, {}], [{ authorityFailure: true }, {}], [{ wrongDatabase: true }, {}], [{ unsafeMetadata: true }, {}],
    [{}, { GITHUB_RUN_ATTEMPT: '2' }], [{}, { REF_PROTECTED: 'false' }], [{}, { GITHUB_REPOSITORY: 'other/Lythaus' }],
    [{}, { PLANETSCALE_ADMIN_DATABASE_URL: url(TARGET.runtime) }], [{}, { PSCALE_ROLE_IDENTIFIERS: '{}' }] ];
  for (const [options, overrides] of cases) {
    const f = fixture(options), report = await f.execute(overrides);
    assert.equal(report.status, 'BLOCKED'); assert.equal(report.mutationOutcome, 'NOT_ATTEMPTED');
    assert.equal(f.queries.filter(q => q.text.startsWith('GRANT')).length, 0);
    assert.ok(f.clients.every(client => client.closed));
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test('drift, partial SQL failures, grant options, wrong grantors, unrelated deltas and stale transaction provenance roll back atomically', async () => {
  for (const options of [{ drift: true }, { lockFailure: true }, ...[1, 2, 3, 4].map(failStatement => ({ failStatement })),
    { badGrantor: true }, { grantOption: true }, { extraAcl: true }, { staleVersion: true }]) {
    const f = fixture(options), report = await f.execute();
    assert.equal(report.mutationOutcome, 'ROLLED_BACK', JSON.stringify({ options, blockers: report.blockers }));
    assert.deepEqual(f.objects, f.initial);
    assert.equal(f.queries.filter(q => q.text === 'COMMIT').length, 0);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test('lost commit or rollback acknowledgments remain uncertain without retries, revocation or readback claims', async () => {
  for (const [options, expected] of [[{ commitFailure: true }, 'UNKNOWN_COMMIT_OUTCOME'],
    [{ failStatement: 3, rollbackFailure: true }, 'UNKNOWN_ROLLBACK_OUTCOME']]) {
    const f = fixture(options), report = await f.execute();
    assert.equal(report.mutationOutcome, expected);
    assert.equal(f.clients.length, 1);
    assert.equal(f.queries.filter(q => q.text.startsWith('GRANT')).length, options.commitFailure ? 4 : 3);
    assert.equal(f.queries.filter(q => q.text.startsWith('REVOKE')).length, 0);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test('failed reconnect preserves acknowledged commit and never attempts a compensating mutation', async () => {
  for (const options of [{ readbackFailure: true }, { readbackDrift: true }, { checkpointFailure: 'AFTER_COMMIT' }]) {
    const f = fixture(options), report = await f.execute();
    assert.equal(report.mutationOutcome, 'COMMITTED');
    assert.equal(report.status, 'COMMITTED_READBACK_BLOCKED');
    assert.deepEqual(report.blockers, [options.readbackDrift ? 'committed_readback_mismatch' : 'operation_failed_details_redacted']);
    assert.equal(report.introduced.length, 17);
    assert.equal(f.queries.filter(q => q.text.startsWith('GRANT')).length, 4);
    assert.equal(f.queries.filter(q => q.text.startsWith('REVOKE')).length, 0);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test('workflow has no arbitrary execution inputs, uses existing secrets, holds production and main gates, and registers PG17 tests', () => {
  assert.equal(createHash('sha256').update(GRANT_SQL).digest('hex'), SQL_SHA256);
  assert.equal(ROLLBACK_SQL_SHA256, '79f3e6a0587b7f35ed56cd2283e54644b8313834edf05284f04c77bc28110c2a');
  assert.equal(BASELINE.artifactId, '12479224877');
  const workflow = fs.readFileSync('.github/workflows/product-privilege-grants.yml', 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:\n      release_sha:/m);
  assert.doesNotMatch(workflow, /\b(push|pull_request|schedule|workflow_call|operation|sql|target|role):/);
  assert.match(workflow, /^    environment: production$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /group: lythaus-production-planetscale-migrations\n  cancel-in-progress: false/);
  assert.equal((workflow.match(/git rev-parse FETCH_HEAD/g) ?? []).length, 2);
  assert.match(workflow, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.match(workflow, /test "\$REF_PROTECTED" = true/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$RELEASE_SHA"/);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(item => item[1]),
    ['PLANETSCALE_ADMIN_DATABASE_URL', 'PLANETSCALE_SCHEMA_READ_DATABASE_URL', 'PLANETSCALE_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'PSCALE_ROLE_IDENTIFIERS']);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /create-role|create-password|pscale |wrangler |continue-on-error/);
  assert.match(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), /node --test --test-concurrency=1 scripts\/tests\/product-privilege-grants.test.mjs scripts\/tests\/product-privilege-grants.postgres.mjs/);
  const invalid = spawnSync(process.execPath, ['scripts/ci/product-privilege-grants.mjs', '--sql', secret], { encoding: 'utf8' });
  assert.equal(invalid.status, 2); assert.equal(invalid.stdout.includes(secret), false);
  assert.equal(JSON.parse(invalid.stdout).mutationOutcome, 'NOT_ATTEMPTED');
});
