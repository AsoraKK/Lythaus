import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test, { beforeEach, mock } from 'node:test';
import * as jose from 'jose';
import { Client as PgClient } from 'pg';

const host = 'admin-new-core-test.lythaus.co';
const issuer = 'https://fixture.cloudflareaccess.com';
const audience = 'isolated-read-fixture';
const subject = 'synthetic-private-owner-subject';
const key = 'synthetic-private-subject-key';
const digest = createHmac('sha256', key).update(subject).digest('base64');
const connectionString = 'postgresql://synthetic_admin:fixture-password@fixture.hyperdrive.local/postgres?sslmode=disable';
const rawMessage = 'private driver detail ' + connectionString;
const routes = ['/api/admin/health', '/api/admin/moderation/cases'];
const membershipSql = "SELECT user_id, role FROM identity.admin_memberships WHERE access_subject_hmac = decode($1, 'base64') AND active = true";
let failure;
let statements;
let member;

function failAt(stage) {
  const code = stage === failure?.stage ? failure.code : stage === 'end' ? failure?.endCode : undefined;
  if (code) {
    throw Object.assign(new Error(failure.message ?? rawMessage), { code, detail: subject, hint: key });
  }
}

class FixtureClient extends PgClient {
  constructor(config) { failAt('construct'); super(config); }
  async connect() { failAt('connect'); }
  async query(statement, parameters) {
    statements.push(statement);
    if (member && statement.startsWith('INSERT INTO system.rate_limit_windows')) throw new Error(rawMessage);
    assert.equal(statement, membershipSql);
    assert.deepEqual(parameters, [digest]);
    failAt('query');
    return { command: 'SELECT', rowCount: member ? 1 : 0, rows: member ? [member] : [] };
  }
  async end() { failAt('end'); }
}
mock.module('pg', { cache: true, namedExports: { Client: FixtureClient } });

const keys = await jose.generateKeyPair('RS256');
const jwks = jose.createLocalJWKSet({ keys: [{ ...await jose.exportJWK(keys.publicKey), kid: 'fixture' }] });
mock.module('jose', { cache: true, namedExports: { ...jose, createRemoteJWKSet(url) {
  assert.equal(url.href, issuer + '/cdn-cgi/access/certs');
  return jwks;
} } });
mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected_external_request'); });
const isolated = (await import('../src/new-core-test-worker.ts')).default;
const production = (await import('../src/index.ts')).default;
const { IsolatedAdminReadFailure } = await import('../src/isolated-admin-read-failure.ts');

const env = {
  WORKER_VERSION: { id: '33333333-3333-4333-8333-333333333333', tag: 'a'.repeat(40), timestamp:'2026-11-25T00:00:00Z' },
  EXPECTED_HOSTNAMES: host, CORS_ALLOWED_ORIGINS: 'https://' + host,
  ACCESS_TEAM_DOMAIN: new URL(issuer).host, ACCESS_JWKS_URL: issuer + '/cdn-cgi/access/certs',
  ACCESS_AUDIENCES: audience, ACCESS_SUBJECT_HMAC_KEY: key,
  NEW_CORE_ACCESS_ISSUER: issuer, NEW_CORE_ACCESS_AUDIENCE_SHA256: createHash('sha256').update(audience).digest('hex'),
  DB_ADMIN_FRESH: { connectionString },
};
const assertion = await new jose.SignJWT({ sub: subject }).setIssuer(issuer).setAudience(audience)
  .setIssuedAt().setExpirationTime('5m').setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(keys.privateKey);
const secrets = [rawMessage, connectionString, 'fixture-password', subject, key, digest, assertion];
const log = mock.method(console, 'log', () => {});
const warn = mock.method(console, 'warn', () => {});
const error = mock.method(console, 'error', () => {});
beforeEach(() => {
  failure = undefined;
  statements = [];
  member = undefined;
  for (const spy of [log, warn, error]) spy.mock.resetCalls();
});

async function read(worker, path, { bindings = env, token = assertion, context } = {}) {
  const headers = token ? { 'cf-access-jwt-assertion': token } : {};
  const request = new Request('https://' + bindings.EXPECTED_HOSTNAMES + path, { headers });
  const response = await worker.fetch(request, bindings, context);
  const body = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(body.correlationId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(response.headers.get('x-correlation-id'), body.correlationId);
  return { status: response.status, body, headers: Object.fromEntries(response.headers) };
}

function assertBuild(result, version = env.WORKER_VERSION) {
  assert.equal(result.headers['x-lythaus-worker-version'], version?.id);
  assert.equal(result.headers['x-lythaus-source-sha'], version?.tag);
}

function assertPrivate(result) {
  const output = JSON.stringify([result, ...[log, warn, error].flatMap(spy => spy.mock.calls.map(call => call.arguments))]);
  for (const value of secrets) assert.equal(output.includes(value), false, 'private input appeared in output');
}

function assertFailure(result, stage, category) {
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, {
    error: 'admin_request_failed', correlationId: result.body.correlationId, diagnostic: { stage, category },
  });
  assertPrivate(result);
  assertBuild(result);
}

test('a signed nonmember receives the ordinary denial after exactly one bound lookup on each isolated read route', async () => {
  for (const path of routes) {
    const result = await read(isolated, path);
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, { error: 'admin_role_required', correlationId: result.body.correlationId });
    assertBuild(result);
    assertPrivate(result);
  }
  assert.deepEqual(statements, [membershipSql, membershipSql]);
});

test('signed reads use native binding fields even when its connection string is unusable', async () => {
  const binding = {
    host:'fixture.hyperdrive.local', port:5432, user:'synthetic_admin', database:'postgres', password:'synthetic/#?@%2F+:',
    connect() { assert.fail('pg owns the connection'); },
    get connectionString() { throw new Error(rawMessage); },
  };
  for (const path of routes) {
    const result = await read(isolated, path, { bindings:{...env, DB_ADMIN_FRESH:binding} });
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, {error:'admin_role_required', correlationId:result.body.correlationId});
    assertPrivate(result);
  }
  assert.deepEqual(statements, [membershipSql, membershipSql]);
});

test('missing or malformed assertions produce no diagnostic and never reach PostgreSQL', async () => {
  failure = { stage: 'query', code: '42501' };
  for (const [token, expected] of [['', 'access_required'], ['invalid', 'access_assertion_invalid']]) {
    for (const path of routes) {
      const result = await read(isolated, path, { token });
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, { error: expected, correlationId: result.body.correlationId });
      assertBuild(result, null);
      assertPrivate(result);
    }
  }
  assert.deepEqual(statements, []);
});

for (const [stage, code, expectedStage, category] of [
  ['construct', 'SYNTHETIC_CONSTRUCTOR_FAILURE', 'db_binding', 'client_initialization_failed'],
  ['connect', 'ECONNREFUSED', 'db_connect', 'connection_failure'],
  ['connect', '08006', 'db_connect', 'connection_failure'],
  ['connect', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'db_connect', 'tls_verification_failed'],
  ['connect', '28P01', 'db_connect', 'authentication_failed'],
  ['connect', '3D000', 'db_connect', 'invalid_catalog'],
  ['query', '42501', 'membership_query', 'permission_denied'],
  ['query', '42P01', 'membership_query', 'missing_relation'],
  ['query', '42703', 'membership_query', 'missing_column'],
  ['query', '57014', 'membership_query', 'query_canceled'],
  ['query', 'SYNTHETIC_PRIVATE_UNKNOWN_CODE', 'membership_query', 'unclassified'],
  ['end', 'ECONNRESET', 'db_close', 'connection_failure'],
]) {
  test(`isolated signed reads report only ${expectedStage} and ${category} for ${code}`, async () => {
    failure = { stage, code };
    for (const path of routes) {
      const result = await read(isolated, path);
      assertFailure(result, expectedStage, category);
      assert.equal(JSON.stringify(result).includes(code), false);
    }
  });
}

test('a cleanup error that supersedes a failed read reports the cleanup stage and its own category', async () => {
  failure = { stage: 'query', code: '42501', endCode: 'ECONNRESET' };
  for (const path of routes) assertFailure(await read(isolated, path), 'db_close', 'connection_failure');
});

test('only documented database system error messages select specific provider categories', async () => {
  for (const [code, message, category] of [
    ['58000', 'Failed to acquire a connection from the pool.', 'pool_acquire_failed'],
    ['58000', 'Server connection attempt failed: connection_refused', 'server_connection_refused'],
    ['58000', 'Internal error.', 'upstream_internal_error'],
    ['58000', 'Failed to acquire a connection from the pool. ' + rawMessage, 'database_system_error'],
    ['XX000', 'Failed to acquire a connection from the pool.', 'unclassified'],
  ]) {
    failure = { stage: 'connect', code, message };
    for (const path of routes) {
      const result = await read(isolated, path);
      assertFailure(result, 'db_connect', category);
      assert.equal(JSON.stringify(result).includes(message), false);
    }
  }
});

test('each rejected Hyperdrive component produces only its own diagnostic before the membership read', async () => {
  const binding = {connect() {}, host:'fixture.hyperdrive.local', port:5432, user:'fixture', password:'fixture', database:'postgres'};
  const cases = [
    [{...binding,host:'foreign.invalid'},'native_host_rejected'],
    [{...binding,port:0},'native_port_rejected'],
    [{...binding,user:''},'native_user_rejected'],
    [{...binding,password:''},'native_password_rejected'],
    [{...binding,database:''},'native_database_rejected'],
    [{...binding,host:'0123456789abcdef0123456789abcdef.workers.alt',scheme:'mysql'},'native_scheme_rejected'],
    [{connectionString:rawMessage},'legacy_url_invalid'],
    [{connectionString:'postgresql://fixture@fixture.hyperdrive.local/postgres?sslmode=require'},'legacy_tls_policy_rejected'],
  ];
  for (const [invalid, category] of cases) {
    for (const path of routes) {
      const result = await read(isolated, path, {bindings:{...env,DB_ADMIN_FRESH:invalid}});
      assertFailure(result, 'db_binding', category);
    }
  }
  assert.deepEqual(statements, []);
});

test('unusable scoped binding and failed subject derivation expose only the operation and its category', async () => {
  const badKey = { toString() { throw new Error(rawMessage); } };
  for (const path of routes) {
    const unavailableBinding = await read(isolated, path, { bindings: { ...env, get DB_ADMIN_FRESH() { throw new Error(rawMessage); } } });
    assertFailure(unavailableBinding, 'db_binding', 'binding_unavailable');
    const missingBinding = await read(isolated, path, { bindings: { ...env, DB_ADMIN_FRESH:undefined } });
    assertFailure(missingBinding, 'db_binding', 'binding_missing');
    const failedGetter = await read(isolated, path, { bindings: { ...env, DB_ADMIN_FRESH:{
      connect() {}, get host() { throw new Error(rawMessage); }, port:5432, database:'postgres', user:'fixture', password:'fixture',
    } } });
    assertFailure(failedGetter, 'db_binding', 'binding_unavailable');
    const badSubjectKey = await read(isolated, path, { bindings: { ...env, ACCESS_SUBJECT_HMAC_KEY: badKey } });
    assertFailure(badSubjectKey, 'subject_hmac', 'unclassified');
  }
  assert.deepEqual(statements, []);
});

test('signed read failures omit both build headers if either provider version identifier is malformed', async () => {
  failure = {stage:'query',code:'42501'};
  for (const version of [undefined, {...env.WORKER_VERSION,id:rawMessage}, {...env.WORKER_VERSION,tag:rawMessage}]) {
    const result = await read(isolated, routes[0], {bindings:{...env, WORKER_VERSION:version}});
    assert.equal(result.status, 500);
    assert.deepEqual(result.body.diagnostic, {stage:'membership_query',category:'permission_denied'});
    assertBuild(result, null);
    assertPrivate(result);
  }
});

test('the full Admin handler keeps the ordinary response under the same signed lookup failure', async () => {
  assert.deepEqual(Object.keys(production), ['fetch']);
  failure = { stage: 'query', code: '42501' };
  const productionHost = 'admin.lythaus.co';
  const bindings = { ...env, EXPECTED_HOSTNAMES: productionHost, CORS_ALLOWED_ORIGINS: 'https://' + productionHost };
  const context = { waitUntil() {}, passThroughOnException() {}, ReadFailure: IsolatedAdminReadFailure };
  for (const path of routes) {
    const result = await read(production, path, { bindings, context });
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'admin_request_failed', correlationId: result.body.correlationId });
    assertBuild(result, null);
    for (const value of secrets) assert.equal(JSON.stringify(result).includes(value), false);
  }
});

test('a failure after successful membership verification never appears as a failed membership lookup', async () => {
  member = { user_id: '01900000-0000-7000-8000-000000000001', role: 'administrator' };
  for (const path of routes) {
    const result = await read(isolated, path);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'admin_request_failed', correlationId: result.body.correlationId });
    assertBuild(result, null);
    assertPrivate(result);
  }
  assert.equal(statements.length, 4);
  assert.equal(statements.filter(statement => statement.startsWith('INSERT INTO system.rate_limit_windows')).length, 2);
});
