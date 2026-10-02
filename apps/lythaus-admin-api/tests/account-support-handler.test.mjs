import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';
import { accountSupportSnapshot } from '@lythaus/contracts';

const ID = '01900000-0000-7000-8000-000000000001';
const OWNER_ID = '01900000-0000-7000-8000-000000000099';
const VERSION = '01900000-0000-7000-8000-000000000088';
const account = accountSupportSnapshot({ id: ID, status: 'active', verificationState: 'pending_verification',
  verifiedAt: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', deletedAt: null, lastSignInAt: null,
  activeSessionCount: 0, subscriptionTier: 'free' });
const state = { role: 'owner', active: true, member: true, auditCount: 1, exists: true, outcome: 'found', failHistory: false, reads: [] };
function reset() { Object.assign(state, { role: 'owner', active: true, member: true, auditCount: 1, exists: true, outcome: 'found', failHistory: false, reads: [] }); }
const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });
async function query(sql, values = []) {
  state.reads.push({ sql, values });
  if (sql.includes('identity.admin_memberships')) return state.member && (!sql.includes("a.role = 'owner'") || state.active)
    ? result([{ user_id: OWNER_ID, role: state.role }]) : result();
  if (sql.includes('system.rate_limit_windows')) return result([{ request_count: 1 }]);
  if (sql.startsWith('SELECT id FROM identity.users')) return state.exists ? result([{ id: ID }]) : result();
  if (sql.includes('AS snapshot_at')) return result([{ snapshot_at: '2026-10-02T00:00:00.000001Z' }]);
  if (sql.includes('INSERT INTO system.audit_events')) return result([{ id: ID }], state.auditCount);
  if (sql.includes('WITH history')) { if (state.failHistory) throw new Error('password=private; reset-link'); return result(); }
  throw new Error('unexpected_test_query');
}
mock.module('@lythaus/db', { cache: true, namedExports: { ...database,
  query: (_binding, sql, values) => query(sql, values), transaction: (_binding, work) => work({ query })
} });
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), { cache: true, namedExports: {
  requireActiveAdminMembership: row => ({ userId: row.user_id, role: row.role }),
  verifiedAccessSubject: async request => {
    const assertion = request.headers.get('cf-access-jwt-assertion');
    if (!assertion) throw new Error('access_required');
    if (assertion !== 'synthetic-valid') throw new Error('access_assertion_invalid');
    return 'synthetic-owner';
  }
} });
const { default: worker } = await import('../src/index.ts');
const env = { ACCESS_SUBJECT_HMAC_KEY: 'synthetic-subject-key', EXPECTED_HOSTNAMES: 'admin.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
  DB_ADMIN_FRESH: {}, DB_PRIVACY_FRESH: {}, AUTH_EMAIL_ENVELOPE: { fetch: async () => Response.json({ workerVersion: VERSION, result: { state: state.outcome, account: state.outcome === 'found' ? account : null } }) } };
function request(path = '/api/admin/account-support/lookup', body = { email: 'synthetic@example.invalid', reasonCode: 'SUPPORT_REQUEST' }, headers = {}, method = 'POST') {
  return new Request(`https://admin.lythaus.co${path}`, { method, headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json', 'cf-access-jwt-assertion': 'synthetic-valid', ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
}
const historyPath = `/api/admin/account-support/users/${ID}/history`;

test('worker rejects missing or invalid Access before account support reads', async () => {
  reset();
  for (const assertion of ['', 'invalid']) {
    const response = await worker.fetch(request(undefined, undefined, { 'cf-access-jwt-assertion': assertion }), env);
    assert.equal(response.status, 401);
  }
  assert.equal(state.reads.length, 0);
});

test('worker rejects nonmembers, every non-owner role and inactive owner state', async () => {
  reset(); state.member = false; assert.equal((await worker.fetch(request(), env)).status, 403);
  for (const role of ['administrator', 'moderator', 'privacy_operator', 'editorial', 'guest']) {
    reset(); state.role = role; const response = await worker.fetch(request(), env);
    assert.equal(response.status, 403); assert.equal((await response.json()).error, 'account_support_owner_required');
    assert.ok(!state.reads.some(query => query.sql.includes('INSERT INTO system.audit_events')));
  }
  reset(); state.active = false; assert.equal((await worker.fetch(request(), env)).status, 403);
});

test('worker returns a no-store audited allowlist for successful exact lookup', async () => {
  reset(); const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json(); assert.deepEqual(body.account, account);
  assert.equal(response.headers.get('x-correlation-id'), body.correlationId);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://admin.lythaus.co');
  const audit = state.reads.find(query => query.sql.includes('INSERT INTO system.audit_events'));
  assert.equal(audit.values[1], OWNER_ID); assert.equal(audit.values[3], ID);
  assert.ok(!JSON.stringify(audit).includes('synthetic@example.invalid'));
});

test('worker returns audited neutral missing and ambiguous states', async () => {
  for (const outcome of ['not_found', 'ambiguous']) {
    reset(); state.outcome = outcome;
    const response = await worker.fetch(request(), env); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.state, outcome); assert.equal(body.account, null);
    assert.equal(JSON.parse(state.reads.at(-1).values[6]).outcome, outcome);
  }
});

test('worker fails closed when audit or private binding is unavailable', async () => {
  reset(); state.auditCount = 0;
  assert.equal((await worker.fetch(request(), env)).status, 503);
  reset(); assert.equal((await worker.fetch(request(), { ...env, AUTH_EMAIL_ENVELOPE: undefined })).status, 503);
});

test('worker blocks cross-origin or non-JSON support POST before account queries', async () => {
  for (const [headers, status] of [[{ origin: 'https://evil.invalid' }, 403], [{ 'content-type': 'text/plain' }, 415]]) {
    reset(); const response = await worker.fetch(request(undefined, undefined, headers), env); assert.equal(response.status, status);
    assert.equal(state.reads.length, 2);
  }
});

test('worker rejects oversized and unknown-field bodies without disclosing their contents', async () => {
  for (const [body, status] of [[{ email: 'x'.repeat(5000), reasonCode: 'SUPPORT_REQUEST' }, 413], [{ email: 'synthetic@example.invalid', reasonCode: 'SUPPORT_REQUEST', token: 'private-reset-token' }, 400]]) {
    reset(); const response = await worker.fetch(request(undefined, body), env); assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes('private-reset-token'));
  }
});

test('worker support has no mutation methods and never accepts URL email lookup', async () => {
  for (const method of ['PATCH', 'PUT', 'DELETE', 'GET']) {
    reset(); const response = await worker.fetch(request(undefined, undefined, {}, method), env); assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.ok(!state.reads.some(query => /UPDATE identity|DELETE FROM|INSERT INTO system.audit/.test(query.sql)));
  }
  reset(); assert.equal((await worker.fetch(request('/api/admin/account-support/lookup?email=synthetic@example.invalid'), env)).status, 404);
});

test('worker dispatches only the three documented support routes', async () => {
  for (const path of ['/api/admin/account-support/other', `${historyPath}/extra`, '/api/admin/account-support/lookup/extra']) {
    reset(); assert.equal((await worker.fetch(request(path), env)).status, 404);
    assert.equal(state.reads.length, 2);
  }
  for (const [path, method, allow] of [['/api/admin/account-support/access', 'POST', 'GET'], [historyPath, 'GET', 'POST']]) {
    reset(); const response = await worker.fetch(request(path, undefined, {}, method), env);
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), allow);
    assert.equal(state.reads.length, 2);
  }
});

test('worker empty history is explicitly partial and records the owner request', async () => {
  reset(); const response = await worker.fetch(request(historyPath, { reasonCode: 'SUPPORT_REQUEST' }), env);
  assert.equal(response.status, 200); const body = await response.json();
  assert.deepEqual(body.items, []); assert.equal(body.coverage, 'partial'); assert.match(body.notice, /does not prove/);
  assert.equal(state.reads.at(-1).values[2], 'identity.account_support_history_viewed');
});

test('worker distinguishes missing account from unavailable history and never invents success', async () => {
  reset(); state.exists = false; assert.equal((await worker.fetch(request(historyPath, { reasonCode: 'SUPPORT_REQUEST' }), env)).status, 404);
  reset(); state.failHistory = true; const response = await worker.fetch(request(historyPath, { reasonCode: 'SUPPORT_REQUEST' }), env);
  assert.equal(response.status, 503); const text = await response.text();
  assert.ok(!text.includes('private')); assert.ok(!text.includes('items'));
});

test('worker validates date ranges, filter codes, user IDs and limits', async () => {
  for (const body of [{ reasonCode: 'SUPPORT_REQUEST', source: 'other' }, { reasonCode: 'SUPPORT_REQUEST', limit: 99 }, { reasonCode: 'SUPPORT_REQUEST', since: '2026-02-30T00:00:00Z' }, { reasonCode: 'SUPPORT_REQUEST', correlationId: '<script>' }]) {
    reset(); assert.equal((await worker.fetch(request(historyPath, body), env)).status, 400);
  }
  reset(); assert.equal((await worker.fetch(request('/api/admin/account-support/users/bad/history', { reasonCode: 'SUPPORT_REQUEST' }), env)).status, 400);
});

test('worker owner capability returns no account state and is denied for inactive membership', async () => {
  reset(); const response = await worker.fetch(request('/api/admin/account-support/access', null, {}, 'GET'), env);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { available: true });
  reset(); state.active = false; assert.equal((await worker.fetch(request('/api/admin/account-support/access', null, {}, 'GET'), env)).status, 403);
});
