import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { mock } from 'node:test';
import * as jose from 'jose';

let databaseFixture;
const transactionTrace = [];
class FixturePostgresClient {
  constructor(options) { assert.match(options.connectionString, /sslmode=verify-full/); }
  on() {}
  removeListener() {}
  async connect() {}
  async end() {}
  async query(statement, values) {
    transactionTrace.push({ statement, values });
    if (statement === 'BEGIN') return { command: 'BEGIN' };
    if (statement === 'COMMIT') return { command: 'COMMIT' };
    if (statement === 'ROLLBACK') return { command: 'ROLLBACK' };
    if (statement === 'SET TRANSACTION READ ONLY') return { command: 'SET', rowCount: null, rows: [] };
    if (statement.startsWith('SELECT current_database()')) {
      return { rowCount: 1, rows: [databaseFixture.session] };
    }
    if (statement === SUBJECT_DIAGNOSTIC_SQL) {
      const rows = Array.isArray(databaseFixture.row) ? databaseFixture.row : databaseFixture.row ? [databaseFixture.row] : [];
      return { rowCount: rows.length, rows };
    }
    throw new Error('unexpected_sql');
  }
}
mock.module('pg', { cache: true, namedExports: { Client: FixturePostgresClient } });

const keys = await jose.generateKeyPair('RS256');
const wrong = await jose.generateKeyPair('RS256');
const jwks = jose.createLocalJWKSet({ keys: [{ ...await jose.exportJWK(keys.publicKey), kid: 'fixture' }] });
mock.module('jose', { cache: true, namedExports: { ...jose, createRemoteJWKSet: url => {
  assert.equal(url.href, 'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs');
  return jwks;
} } });
mock.method(globalThis, 'fetch', async () => { throw new Error('external_network_forbidden'); });

const { handleSubjectDiagnostic, SUBJECT_DIAGNOSTIC_PATH, SUBJECT_DIAGNOSTIC_SQL } = await import('../src/solo-recovery/subject-diagnostic.ts');
const { SUBJECT_DIAGNOSTIC_MAX_WINDOW_SECONDS, validateSubjectDiagnosticPolicy } = await import('../src/solo-recovery/diagnostic-policy.ts');
const { hmacLookup } = await import('../../../packages/security/src/index.ts');

function fixture({ row = { role: 'administrator', active: true, principal_status: 'locked', principal_deleted: false }, session = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const sourceCommit = 'a'.repeat(40);
  const origin = 'https://admin.example.invalid';
  const databaseOrigin = { scheme: 'postgres', host: 'db.example.invalid', port: 5432, database: 'postgres' };
  const databaseOriginFingerprint = createHash('sha256').update(JSON.stringify(databaseOrigin)).digest('hex');
  const policy = {
    origin,
    accessIssuer: 'https://fixture.cloudflareaccess.com',
    accessAudience: 'fixture-api',
    notBefore: now - 30,
    expiresAt: now + 300,
    databaseTarget: {
      branchId: 'branchfixture', databaseName: 'postgres', originFingerprint: databaseOriginFingerprint,
      roleFingerprint: createHash('sha256').update('lythaus-admin-diagnostic-role:v1:fixture_admin').digest('hex'),
    },
  };
  const env = {
    WORKER_VERSION: { id: '01900000-0000-7000-8000-000000000011', tag: sourceCommit },
    DB_ADMIN_FRESH: { connectionString: 'postgresql://fixture_admin.branchfixture:synthetic@db.example.invalid/postgres?sslmode=verify-full' },
    ACCESS_SUBJECT_HMAC_KEY: 'synthetic-key-only',
    ACCESS_JWKS_URL: policy.accessIssuer + '/cdn-cgi/access/certs',
    ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
    ACCESS_AUDIENCES: 'fixture-ui,fixture-api',
    EXPECTED_HOSTNAMES: 'admin.example.invalid',
  };
  const subject = 'synthetic-subject-a';
  const email = 'operator@example.invalid';
  const sql = [];
  const dbSession = { database_name: 'postgres', current_user: 'fixture_admin', session_user: 'fixture_admin', transaction_read_only: 'on', ...session };
  const run = async (binding, work) => {
    assert.equal(binding, env.DB_ADMIN_FRESH);
    const client = { async query(statement, values) {
      sql.push({ statement, values });
      if (statement === 'SET TRANSACTION READ ONLY') return { command: 'SET', rowCount: null, rows: [] };
      if (statement.startsWith('SELECT current_database()')) return { rowCount: 1, rows: [dbSession] };
      if (statement === SUBJECT_DIAGNOSTIC_SQL) return { rowCount: Array.isArray(row) ? row.length : row ? 1 : 0, rows: Array.isArray(row) ? row : row ? [row] : [] };
      throw new Error('unexpected_sql');
    } };
    return work(client);
  };
  const sign = (patch = {}, key = keys.privateKey) => new jose.SignJWT({
    iss: policy.accessIssuer, aud: ['fixture-api'], sub: subject, email, type: 'app', nbf: now - 5, exp: now + 120, ...patch,
  }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(key);
  const request = async (patch = {}, { path = SUBJECT_DIAGNOSTIC_PATH, host = 'admin.example.invalid', key = keys.privateKey, headers = {} } = {}) => new Request(
    origin.replace('admin.example.invalid', host) + path,
    { method: 'GET', headers: { 'cf-access-jwt-assertion': await sign(patch, key), ...headers } },
  );
  return { policy, env, sql, run, request, sign, subject, email, get key() { return env.ACCESS_SUBJECT_HMAC_KEY; } };
}

test('compiled diagnostic policy is disabled by default', async () => {
  const f = fixture();
  Object.defineProperty(f.env, 'DB_ADMIN_FRESH', { get() { throw new Error('disabled_route_must_not_read_database_binding'); } });
  const response = await handleSubjectDiagnostic(await f.request(), f.env, { run: f.run });
  assert.equal(response.status, 404);
  assert.deepEqual(f.sql, []);
});

test('policy allows a finite three-hour workflow window and rejects longer windows', () => {
  const f = fixture();
  const bounded = validateSubjectDiagnosticPolicy({
    ...f.policy,
    expiresAt: f.policy.notBefore + SUBJECT_DIAGNOSTIC_MAX_WINDOW_SECONDS,
  });
  assert.equal(bounded.expiresAt - bounded.notBefore, 3 * 60 * 60);
  assert.throws(() => validateSubjectDiagnosticPolicy({
    ...f.policy,
    expiresAt: f.policy.notBefore + SUBJECT_DIAGNOSTIC_MAX_WINDOW_SECONDS + 1,
  }), /subject_diagnostic_policy_invalid/);
});

test('the same valid human assertion can repeat read-only diagnostics within the policy window', async () => {
  const f = fixture();
  const policy = validateSubjectDiagnosticPolicy({
    ...f.policy,
    expiresAt: f.policy.notBefore + SUBJECT_DIAGNOSTIC_MAX_WINDOW_SECONDS,
  });
  const request = await f.request();
  const responses = await Promise.all([
    handleSubjectDiagnostic(request, f.env, { policy, run: f.run }),
    handleSubjectDiagnostic(request, f.env, { policy, run: f.run }),
  ]);

  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.ok(f.sql.every(entry => /^(?:SET TRANSACTION READ ONLY|SELECT)\b/.test(entry.statement)));
  assert.equal(f.sql.filter(entry => entry.statement === SUBJECT_DIAGNOSTIC_SQL).length, 2);
});

test('strict signed identity gets only a no-store read-only subject comparison', async () => {
  const f = fixture();
  const logSpies = ['debug', 'info', 'log', 'warn', 'error']
    .map(method => mock.method(console, method, () => undefined));
  const request = await f.request();
  const assertion = request.headers.get('cf-access-jwt-assertion');
  assert.ok(assertion);
  const response = await handleSubjectDiagnostic(request, f.env, { policy: f.policy, run: f.run });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const body = await response.json();
  assert.deepEqual(body, {
    status: 'verified', workerVersionId: f.env.WORKER_VERSION.id,
    sourceCommit: f.env.WORKER_VERSION.tag, databaseTargetMatchesPinnedMain: true,
    databaseTransactionReadOnly: true, subjectBindingMatches: true, activeMembershipMatches: true,
    membershipRole: 'administrator', principalStatus: 'locked', principalDeleted: false,
  });
  assert.deepEqual(f.sql.map(entry => entry.statement), [
    'SET TRANSACTION READ ONLY',
    "SELECT current_database() AS database_name,\n        current_user AS current_user, session_user AS session_user,\n        current_setting('transaction_read_only') AS transaction_read_only",
    SUBJECT_DIAGNOSTIC_SQL,
  ]);
  assert.ok(f.sql.every(entry => /^(?:SET TRANSACTION READ ONLY|SELECT)\b/.test(entry.statement)));
  assert.deepEqual(f.sql[2].values, [hmacLookup(f.subject, f.key)]);
  const returned = JSON.stringify(body);
  assert.equal(returned.includes(assertion), false);
  assert.equal(returned.includes(f.email), false);
  assert.equal(returned.includes(f.subject), false);
  assert.equal(returned.includes(f.key), false);
  assert.equal(returned.includes(f.sql[2].values[0]), false);
  assert.ok(logSpies.every(spy => spy.mock.callCount() === 0));
});

test('default database runner uses one explicit read-only transaction with no writes', async () => {
  const f = fixture();
  databaseFixture = {
    row: { role: 'administrator', active: true, principal_status: 'locked', principal_deleted: false },
    session: { database_name: 'postgres', current_user: 'fixture_admin', session_user: 'fixture_admin', transaction_read_only: 'on' },
  };
  transactionTrace.length = 0;
  const response = await handleSubjectDiagnostic(await f.request(), f.env, { policy: f.policy });
  assert.equal(response.status, 200);
  assert.deepEqual(transactionTrace.map(item => item.statement), [
    'BEGIN', 'SET TRANSACTION READ ONLY',
    "SELECT current_database() AS database_name,\n        current_user AS current_user, session_user AS session_user,\n        current_setting('transaction_read_only') AS transaction_read_only",
    SUBJECT_DIAGNOSTIC_SQL, 'COMMIT',
  ]);
  assert.ok(transactionTrace.every(item => /^(?:BEGIN|COMMIT|SET TRANSACTION READ ONLY|SELECT)\b/.test(item.statement)));
  assert.equal(transactionTrace.filter(item => item.statement === 'COMMIT').length, 1);
});

for (const [name, patch, key] of [
  ['missing subject', { sub: undefined }],
  ['empty subject', { sub: '' }],
  ['missing email', { email: undefined }],
  ['expired assertion', { exp: 1 }],
  ['future nbf', { nbf: 9999999999 }],
  ['wrong issuer', { iss: 'https://wrong.example.invalid' }],
  ['wrong audience', { aud: ['fixture-ui'] }],
  ['multiple audiences', { aud: ['fixture-api', 'fixture-ui'] }],
  ['service token', { type: 'service', common_name: 'synthetic-service' }],
  ['wrong signature', {}, wrong.privateKey],
]) {
  test(`rejects ${name} before database access`, async () => {
    const f = fixture();
    const response = await handleSubjectDiagnostic(await f.request(patch, { key: key ?? keys.privateKey }), f.env,
      { policy: f.policy, run: f.run });
    assert.equal(response.status, 404);
    assert.deepEqual(f.sql, []);
  });
}

test('missing runtime HMAC key is rejected before database access', async () => {
  const f = fixture();
  f.env.ACCESS_SUBJECT_HMAC_KEY = undefined;
  const response = await handleSubjectDiagnostic(await f.request(), f.env, { policy: f.policy, run: f.run });
  assert.equal(response.status, 404);
  assert.deepEqual(f.sql, []);
});

test('nonmatching subject returns only mismatch booleans and no private binding values', async () => {
  const f = fixture({ row: null });
  const response = await handleSubjectDiagnostic(await f.request(), f.env, { policy: f.policy, run: f.run });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.subjectBindingMatches, false);
  assert.equal(body.activeMembershipMatches, false);
  assert.equal(body.membershipRole, null);
  assert.equal(JSON.stringify(body).includes(f.subject), false);
  assert.equal(JSON.stringify(body).includes(f.key), false);
});

test('inactive match is reported without changing the membership', async () => {
  const f = fixture({ row: { role: 'administrator', active: false, principal_status: 'locked', principal_deleted: false } });
  const response = await handleSubjectDiagnostic(await f.request(), f.env, { policy: f.policy, run: f.run });
  const body = await response.json();
  assert.equal(body.subjectBindingMatches, true);
  assert.equal(body.activeMembershipMatches, false);
  assert.ok(f.sql.every(entry => /^(?:SET TRANSACTION READ ONLY|SELECT)\b/.test(entry.statement)));
});

test('policy, request, source, and main-target mismatches fail before database access', async () => {
  const cases = [
    { name: 'expired policy', policy: f => ({ ...f.policy, expiresAt: f.policy.notBefore + 1 }) },
    { name: 'invalid Worker version id', change: f => { f.env.WORKER_VERSION.id = 'fixture'; } },
    { name: 'invalid source tag', change: f => { f.env.WORKER_VERSION.tag = 'not-a-release-sha'; } },
    { name: 'wrong route origin', request: f => f.request({}, { host: 'other.example.invalid' }) },
    { name: 'extra URL query', request: f => f.request({}, { path: SUBJECT_DIAGNOSTIC_PATH + '?debug=1' }) },
    { name: 'bearer credential', request: f => f.request({}, { headers: { authorization: 'Bearer synthetic' } }) },
    { name: 'wrong database branch', change: f => { f.env.DB_ADMIN_FRESH.connectionString = 'postgresql://fixture_admin.otherbranch:synthetic@db.example.invalid/postgres?sslmode=verify-full'; } },
    { name: 'wrong database role', change: f => { f.env.DB_ADMIN_FRESH.connectionString = 'postgresql://other_admin.branchfixture:synthetic@db.example.invalid/postgres?sslmode=verify-full'; } },
    { name: 'wrong database origin', change: f => { f.env.DB_ADMIN_FRESH.connectionString = 'postgresql://fixture_admin.branchfixture:synthetic@other.example.invalid/postgres?sslmode=verify-full'; } },
    { name: 'unknown connection option', change: f => { f.env.DB_ADMIN_FRESH.connectionString += '&application_name=fixture'; } },
  ];
  for (const item of cases) {
    const f = fixture();
    item.change?.(f);
    const request = item.request ? await item.request(f) : await f.request();
    const policy = item.policy ? item.policy(f) : f.policy;
    const response = await handleSubjectDiagnostic(request, f.env, { policy, run: f.run });
    assert.equal(response.status, 404, item.name);
    assert.deepEqual(f.sql, [], item.name);
  }
});

test('database session must confirm pinned database, role and read-only mode', async () => {
  for (const session of [
    { database_name: 'other' },
    { current_user: 'unrelated_role', session_user: 'unrelated_role' },
    { current_user: 'fixture_admin', session_user: 'fixture_admin', transaction_read_only: 'off' },
  ]) {
    const f = fixture({ session });
    const response = await handleSubjectDiagnostic(await f.request(), f.env, { policy: f.policy, run: f.run });
    assert.equal(response.status, 404);
    assert.ok(f.sql.every(entry => /^(?:SET TRANSACTION READ ONLY|SELECT)\b/.test(entry.statement)));
  }
});

test('duplicate subject matches and unexpected SQL fail closed', async () => {
  const f = fixture({ row: [
    { role: 'administrator', active: true, principal_status: 'locked', principal_deleted: false },
    { role: 'administrator', active: true, principal_status: 'locked', principal_deleted: false },
  ] });
  const response = await handleSubjectDiagnostic(await f.request(), f.env, { policy: f.policy, run: f.run });
  assert.equal(response.status, 404);
  assert.ok(f.sql.every(entry => /^(?:SET TRANSACTION READ ONLY|SELECT)\b/.test(entry.statement)));
});
