import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';
import { collectProductPrivilegeEvidence, inspectProductPrivileges, PRODUCT_PRIVILEGE_REQUIREMENTS, PRODUCT_PRIVILEGE_TARGET } from '../ci/product-privilege-preflight.mjs';
import { verifyHyperdriveTargets } from '../ci/verify-cloudflare-hyperdrive-targets.mjs';

const secret = 'synthetic-private-value-never-in-evidence';
const connection = `postgresql://pscale_api_verifier.branch123:${secret}@aws.connect.psdb.cloud/postgres?sslmode=verify-full&sslrootcert=system`;
const target = branchQualifiedDatabaseTarget(connection);
const runtimeRole = 'pscale_api_runtime';
const releaseSha = 'a'.repeat(40);
const result = rows => ({ rows });

class FakeClient {
  constructor(options = {}) { this.options = options; this.queries = []; }
  async connect() { this.connected = true; if (this.options.fail === 'connect') throw new Error(secret); }
  async end() { this.closed = true; }
  async query(text, values = []) {
    this.queries.push({ text, values });
    if (this.options.fail === 'query' && text.includes('pg_catalog.pg_roles')) throw new Error(secret);
    if (text === 'SHOW transaction_read_only') return result([{ transaction_read_only: this.options.readOnly ?? 'on' }]);
    if (text.includes('current_database()')) return result([{ database_name: 'postgres', current_user_name: this.options.verifier ?? target.role, session_user_name: target.role }]);
    if (text.startsWith('SELECT oid, rolname')) return result(this.options.roles ?? [{ oid: 42, rolname: runtimeRole,
      rolsuper: false, rolbypassrls: this.options.bypassRls ?? false, rolcreaterole: false, rolcreatedb: false, rolinherit: true, rolcanlogin: true }]);
    if (text.includes('pg_catalog.pg_auth_members')) return result([{ rolname: 'inherited_fixture', effective: true, direct: true }]);
    if (text.startsWith('WITH target AS (')) {
      if (this.options.aclFail) throw new Error(secret);
      const rows = [
        { kind: 'schema', column_name: null, attribute_number: null, object_oid: 200 },
        { kind: 'table', column_name: null, attribute_number: null, object_oid: values[2] },
        ...values[3].map((column_name, index) => ({ kind: 'column', column_name, attribute_number: index + 1, object_oid: values[2] })),
      ].map(row => ({ ...row, owner_oid: 7, owner: 'pscale_api_owner', acl_is_null: true,
        grantor_oid: null, grantor: null, grantee_oid: null, grantee: null, privilege: null, is_grantable: null }));
      return result(this.options.aclRows ? this.options.aclRows(rows) : rows);
    }
    if (text.includes('pg_catalog.pg_policy')) return result([{ oid: 100 + PRODUCT_PRIVILEGE_REQUIREMENTS.findIndex(item => item.schema === values[1] && item.relation === values[2]),
      relrowsecurity: this.options.rls ?? false, relforcerowsecurity: false, owner: 'pscale_api_owner', effective_owner: false,
      schema_usage: values[1] !== this.options.missingSchema, policy_count: 0 }]);
    if (text.startsWith('SELECT pg_catalog.has_table_privilege')) return result([{ permitted: false }]);
    if (text.includes('pg_catalog.pg_attribute')) return result(values[3].map(attname => ({ attname,
      permitted: !this.options.missingColumn || !(values[1] === 100 && values[2] === 'INSERT' && attname === 'user_id') })));
    if (text.startsWith('SELECT pg_catalog.has_function_privilege')) return result([{ permitted: true }]);
    if (/^(SET |BEGIN READ ONLY$|ROLLBACK$)/.test(text)) return result([]);
    throw new Error('unexpected_fixture_sql');
  }
}

async function collect(options = {}, client = new FakeClient()) {
  const calls = [], mappings = [];
  const environment = { RELEASE_SHA: releaseSha, PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection,
    PLANETSCALE_API_TOKEN: `synthetic-id:${secret}`, CLOUDFLARE_API_TOKEN: secret,
    PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: runtimeRole, lythaus_admin: secret }), ...options.environment };
  const report = await collectProductPrivilegeEvidence({ environment, reviewedOriginFingerprint: target.originFingerprint,
    generatedAt: '2026-10-21T12:00:00.000Z', fetchImpl: async (url, request) => {
      calls.push({ url, request });
      return { ok: options.providerOk !== false, json: async () => ({ name: 'main', id: options.branchId ?? target.branchId }) };
    }, verifyTargets: async input => {
      mappings.push(input);
      if (options.mappingFailure) throw new Error(secret);
      return { status: 'pass', targetBranch: 'main', originFingerprint: target.originFingerprint,
        bindings: [{ ...PRODUCT_PRIVILEGE_TARGET, roleMatches: true }] };
    }, clientFactory: config => { client.config = config; return client; } });
  return { report, calls, mappings, client };
}

test('live provider mapping precedes one verifier-only TLS connection and reports effective catalog privileges without certifying acceptance', async () => {
  const { report, calls, mappings, client } = await collect();
  assert.equal(report.status, 'PRIVILEGES_PRESENT_NOT_ACCEPTED');
  assert.equal(report.liveProductAcceptance, 'NOT_ASSESSED');
  assert.equal(report.grantApproval, 'NOT_GRANTED');
  assert.equal(report.databaseWrites, false);
  assert.equal(report.providerMutations, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main');
  assert.equal(calls[0].request.method, 'GET');
  assert.equal(calls[0].request.redirect, 'error');
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].readOnlyGetOnly, true);
  assert.equal(mappings[0].environment.HYPERDRIVE_VERIFY_IDS, PRODUCT_PRIVILEGE_TARGET.hyperdriveId);
  assert.deepEqual(JSON.parse(mappings[0].environment.PSCALE_ROLE_IDENTIFIERS), { lythaus_runtime: runtimeRole });
  assert.equal(client.config.ssl.rejectUnauthorized, true);
  assert.ok(!client.config.connectionString.includes('sslrootcert'));
  assert.equal(client.closed, true);
  assert.equal(report.evidence.runtimeRole.sqlRole, runtimeRole);
  assert.equal(report.evidence.runtimeRole.runtimeSessionObserved, false);
  assert.deepEqual(report.evidence.runtimeRole.memberships, [{ role: 'inherited_fixture', effective: true, direct: true }]);
  assert.equal(report.evidence.objects[0].tablePrivileges.SELECT, false);
  assert.ok(report.evidence.objects[0].columns.every(item => item.permitted));
  assert.deepEqual(report.evidence.functions, [{ signature: 'pg_catalog.now()', privilege: 'EXECUTE', scope: 'existing_prerequisite', permitted: true }]);
  const encoded = JSON.stringify(report);
  for (const forbidden of [secret, 'psdb.cloud', 'postgresql://', 'Authorization', 'connectionString', 'PSCALE_ROLE_IDENTIFIERS']) assert.equal(encoded.includes(forbidden), false);
  for (const query of client.queries) assert.doesNotMatch(query.text, /\b(INSERT INTO|UPDATE [a-z]|DELETE FROM|GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|SET ROLE)\b/i);
  assert.ok(client.queries.some(item => item.text === 'BEGIN READ ONLY'));
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
  for (const query of client.queries.filter(item => item.text.includes('FROM '))) {
    assert.doesNotMatch(query.text, /\bFROM\s+(trust|identity|editorial|content|social|system)\./i);
  }
});

test('missing exact column or schema rights are an approval need, never repaired', async () => {
  const { report } = await collect({}, new FakeClient({ missingColumn: true, missingSchema: 'editorial' }));
  assert.equal(report.status, 'NEEDS_APPROVAL');
  assert.deepEqual(report.evidence.missingPrivileges, [
    { object: 'trust.reward_redemptions', kind: 'column', column: 'user_id', privilege: 'INSERT', scope: 'proposed_additional' },
    { object: 'editorial', kind: 'schema', privilege: 'USAGE', scope: 'proposed_additional' },
  ]);
});

test('only the two proposed relations retain bounded, projected ACL provenance for their schemas, tables and requested columns', async () => {
  const { report, client } = await collect({}, new FakeClient({ aclRows: rows => rows.map(row => {
    if (row.kind === 'schema') return { ...row, acl_is_null: false, ignored: secret };
    if (row.kind === 'table') return { ...row, acl_is_null: false, grantor_oid: 7, grantor: 'pscale_api_owner',
      grantee_oid: 0, grantee: 'PUBLIC', privilege: 'REFERENCES', is_grantable: false, ignored: secret };
    if (row.column_name === 'id') return { ...row, acl_is_null: false, grantor_oid: 9, grantor: 'inherited_fixture',
      grantee_oid: 42, grantee: runtimeRole, privilege: 'SELECT', is_grantable: true };
    return row;
  }) }));
  assert.equal(report.status, 'PRIVILEGES_PRESENT_NOT_ACCEPTED');
  const captured = report.evidence.objects.filter(object => object.aclSnapshot);
  assert.deepEqual(captured.map(object => object.object), ['trust.reward_redemptions', 'editorial.publications']);
  for (const object of captured) {
    const [schema, table, ...columns] = object.aclSnapshot;
    const requirement = PRODUCT_PRIVILEGE_REQUIREMENTS.find(item => `${item.schema}.${item.relation}` === object.object);
    assert.deepEqual(columns.map(item => item.column), [...new Set(Object.values(requirement.columns).flat())]);
    assert.deepEqual(schema, { kind: 'schema', objectOid: 200, ownerOid: 7, owner: 'pscale_api_owner', aclIsNull: false, entries: [] });
    assert.deepEqual(table.entries, [{ grantorOid: 7, grantor: 'pscale_api_owner', granteeOid: 0, grantee: 'PUBLIC',
      privilege: 'REFERENCES', isGrantable: false }]);
    assert.equal(columns[0].attributeNumber, 1);
    assert.deepEqual(columns[0].entries, [{ grantorOid: 9, grantor: 'inherited_fixture', granteeOid: 42,
      grantee: runtimeRole, privilege: 'SELECT', isGrantable: true }]);
    assert.equal(columns[1].aclIsNull, true);
    assert.deepEqual(columns[1].entries, []);
  }
  const queries = client.queries.filter(query => query.text.startsWith('WITH target AS ('));
  assert.equal(queries.length, 2);
  assert.deepEqual(queries.map(query => query.values.slice(0, 2)), [['trust', 'reward_redemptions'], ['editorial', 'publications']]);
  for (const query of queries) assert.match(query.text, /LIMIT 513$/);
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('missing, oversized, inconsistent or unsafe ACL metadata fails closed and always rolls back without leaking query errors', async () => {
  const entry = { acl_is_null: false, grantor_oid: 7, grantor: 'pscale_api_owner', grantee_oid: 42,
    grantee: runtimeRole, privilege: 'SELECT', is_grantable: false };
  const cases = [
    rows => rows.slice(1),
    rows => Array.from({ length: 513 }, () => rows[0]),
    rows => [...rows, { ...rows[2], column_name: 'unrelated_private_column' }],
    rows => rows.map((row, index) => index === 1 ? { ...row, ...entry, grantor: `${secret}\n` } : row),
    rows => rows.map((row, index) => index === 1 ? { ...row, ...entry, grantor_oid: 0 } : row),
    rows => rows.map((row, index) => index === 1 ? { ...row, ...entry, is_grantable: 'false' } : row),
    rows => rows.map((row, index) => index === 1 ? { ...row, ...entry, acl_is_null: true } : row),
    rows => rows.map((row, index) => index === 1 ? { ...row, ...entry, privilege: secret } : row),
    rows => [...rows.slice(0, 1), { ...rows[1], ...entry }, { ...rows[1], ...entry }, ...rows.slice(2)],
    rows => [...rows, { ...rows[1], ...entry }],
    rows => rows.map((row, index) => index === 2 ? { ...row, owner_oid: 8 } : row),
    rows => rows.map((row, index) => index === 3 ? { ...row, attribute_number: rows[2].attribute_number } : row),
  ];
  for (const aclRows of cases) {
    const { report, client } = await collect({}, new FakeClient({ aclRows }));
    assert.equal(report.status, 'BLOCKED');
    assert.deepEqual(report.blockers, ['relation_acl_metadata_unavailable']);
    assert.equal(report.evidence, null);
    assert.equal(client.closed, true);
    assert.equal(client.queries.at(-1).text, 'ROLLBACK');
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
  const { report, client } = await collect({}, new FakeClient({ aclFail: true }));
  assert.deepEqual(report.blockers, ['catalog_probe_failed']);
  assert.equal(client.closed, true);
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('RLS and privileged runtime identities require review even when all column booleans pass', async () => {
  for (const options of [{ rls: true }, { bypassRls: true }]) {
    const { report } = await collect({}, new FakeClient(options));
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockers.some(item => item.includes('requires_review')));
  }
});

test('invalid source, unverified target/mapping and denied provider calls never open SQL or retry alternate endpoints', async () => {
  for (const options of [{ environment: { RELEASE_SHA: 'main' } }, { branchId: 'other123' }, { providerOk: false },
    { mappingFailure: true }, { environment: { PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: target.role }) } },
    { environment: { PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection.replace('sslmode=verify-full', 'sslmode=require') } }]) {
    const { report, calls, client } = await collect(options);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockers.length);
    assert.equal(client.connected, undefined);
    assert.ok(calls.length <= 1);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
  const report = await collectProductPrivilegeEvidence({ environment: { RELEASE_SHA: releaseSha,
    PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection }, fetchImpl: async () => assert.fail('unreviewed origin must fail before network') });
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockers.includes('schema_read_target_not_reviewed_main_origin'));
});

test('read-only confirmation, verifier identity and unique role resolution fail closed; rollback/closure remain bounded', async () => {
  for (const options of [{ readOnly: 'off' }, { verifier: 'pscale_api_other' }, { roles: [] }, { roles: [{ rolname: secret }, { rolname: runtimeRole }] },
    { fail: 'query' }, { fail: 'connect' }]) {
    const { report, client } = await collect({}, new FakeClient(options));
    assert.equal(report.status, 'BLOCKED');
    assert.equal(client.closed, true);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test('minimal proposed grants remain limited to reward columns and four publication columns', () => {
  assert.deepEqual(PRODUCT_PRIVILEGE_REQUIREMENTS.filter(item => item.scope === 'proposed_additional'), [
    { schema: 'trust', relation: 'reward_redemptions', scope: 'proposed_additional', columns: {
      SELECT: ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title', 'redeemed_at', 'status'],
      INSERT: ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title'] } },
    { schema: 'editorial', relation: 'publications', scope: 'proposed_additional', columns: { SELECT: ['id', 'title', 'post_id', 'published_at'] } },
  ]);
});

test('manual protected workflow has only existing read credentials, exact-main checks and one sanitized artifact', () => {
  const workflow = fs.readFileSync('.github/workflows/product-privilege-preflight.yml', 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\b(push|pull_request|schedule|workflow_call):/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    environment: production$/m);
  assert.match(workflow, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(workflow, /test "\$REF_PROTECTED" = true/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$RELEASE_SHA"/);
  assert.equal((workflow.match(/git rev-parse FETCH_HEAD/g) ?? []).length, 2);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(item => item[1]),
    ['PLANETSCALE_SCHEMA_READ_DATABASE_URL', 'PLANETSCALE_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'PSCALE_ROLE_IDENTIFIERS']);
  assert.doesNotMatch(workflow, /ADMIN_DATABASE_URL|create-role|create-password|pscale |wrangler |continue-on-error/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/product-privilege-summary\.json/);
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /node --test --test-concurrency=1 scripts\/tests\/product-privilege-preflight.test.mjs scripts\/tests\/product-privilege-preflight.postgres.mjs/);
  const cli = spawnSync(process.execPath, ['scripts/ci/verify-cloudflare-hyperdrive-targets.mjs', '--manifest-only'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
});

test('shared Hyperdrive verifier supports a non-fallback read-only mode without top-level provider calls on import', () => {
  assert.equal(typeof verifyHyperdriveTargets, 'function');
  const source = fs.readFileSync('scripts/ci/verify-cloudflare-hyperdrive-targets.mjs', 'utf8');
  assert.match(source, /readOnlyGetOnly && !response.ok/);
  assert.match(source, /if \(readOnlyGetOnly\) throw new Error\('hyperdrive_read_failed'\)/);
  assert.match(source, /redirect: 'error'/);
  assert.match(source, /AbortSignal.timeout\(15_000\)/);
});

test('actual shared Hyperdrive checks prove the selected mapping and stop after one denied GET without a list fallback', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-product-mapping-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json', 'utf8'));
  manifest.bindings = manifest.bindings.filter(item => item.hyperdriveId === PRODUCT_PRIVILEGE_TARGET.hyperdriveId);
  manifest.expectedMainOriginFingerprint = target.originFingerprint;
  const entry = manifest.bindings[0];
  for (const [file, value] of [['infrastructure/cloudflare/native-hyperdrive-production.json', manifest],
    [entry.configPath, { hyperdrive: [{ binding: entry.binding, id: entry.hyperdriveId }] }]]) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(value));
  }
  const prior = process.cwd();
  let fixtureVerifier;
  try {
    process.chdir(root);
    fixtureVerifier = (await import(new URL('../ci/verify-cloudflare-hyperdrive-targets.mjs', import.meta.url).href + '?fixture=' + randomUUID())).verifyHyperdriveTargets;
  } finally { process.chdir(prior); }
  const environment = { CLOUDFLARE_API_TOKEN: secret, PLANETSCALE_SCHEMA_READ_DATABASE_URL: connection,
    PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: runtimeRole }), PSCALE_BRANCH_NAME: 'main',
    HYPERDRIVE_VERIFY_IDS: entry.hyperdriveId };
  const config = { id: entry.hyperdriveId, name: entry.expectedConfigName,
    origin: { ...target.origin, user: runtimeRole + '.' + target.branchId, password: secret },
    caching: { disabled: true }, mtls: { sslmode: 'verify-full', ca_certificate_id: 'synthetic-ca' } };
  let calls = 0;
  const verified = await fixtureVerifier({ environment, readOnlyGetOnly: true, fetchImpl: async (url, request) => {
    calls++;
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${manifest.accountId}/hyperdrive/configs/${entry.hyperdriveId}`);
    assert.equal(request.method, 'GET');
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ success: true, result: config }) };
  } });
  assert.equal(calls, 1);
  assert.equal(verified.bindings[0].roleMatches, true);
  assert.equal(JSON.stringify(verified).includes(secret), false);
  for (const status of [401, 403]) {
    let deniedCalls = 0, bodyReads = 0;
    await assert.rejects(fixtureVerifier({ environment, readOnlyGetOnly: true, fetchImpl: async () => {
      deniedCalls++;
      return { ok: false, status, json: async () => { bodyReads++; return { error: secret }; } };
    } }), { message: 'hyperdrive_read_failed' });
    assert.equal(deniedCalls, 1);
    assert.equal(bodyReads, 0);
  }
  await assert.rejects(fixtureVerifier({ environment, readOnlyGetOnly: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, result: {
      ...config, origin: { ...config.origin, user: 'pscale_api_wrong.branch123' },
    } }) }) }), /Hyperdrive production target check failed/);
});
