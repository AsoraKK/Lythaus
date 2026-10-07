import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';

const id = '01900000-0000-7000-8000-000000000099';
const state = { member: true, role: 'owner', active: true, fail: false, sampledAt: null, rateCount: 1, reads: [] };
const result = (rows = []) => ({ rows, rowCount: rows.length });
async function query(sql, values) {
  state.reads.push({ sql, values });
  if (sql.startsWith('SET ')) return result();
  if (sql.includes('identity.admin_memberships')) {
    if (sql.includes("a.role = 'owner'")) return state.active && state.role === 'owner' ? result([{ sampled_at: state.sampledAt ?? new Date() }]) : result();
    return state.member ? result([{ user_id: id, role: state.role }]) : result();
  }
  if (sql.includes('system.rate_limit_windows')) return state.rateCount > 120 ? result() : result([{ request_count: state.rateCount }]);
  if (sql.includes('INSERT INTO system.audit_events')) return result([{ id }]);
  if (sql.startsWith('WITH')) {
    if (state.fail) throw new Error('private-password=synthetic; private-token=synthetic');
    return result(['current', 'previous'].map(window => ({ window, post_rows: 0, comment_rows: 0, user_rows: 0, posts: 0, comments: 0,
      cohort_comments: 0, unanswered_posts: 0, unique_contributors: 0, new_registrations: 0, subscriptions_free: 0, subscriptions_premium: 0, subscriptions_black: 0 })));
  }
  throw new Error('unexpected test query');
}
mock.module('@lythaus/db', { cache: true, namedExports: { ...database, query: (_binding, sql, values) => query(sql, values), transaction: (_binding, work) => work({ query }) } });
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
function env() { return { ACCESS_SUBJECT_HMAC_KEY: 'synthetic-key', EXPECTED_HOSTNAMES: 'admin.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co', DB_ADMIN_FRESH: {} }; }
function request(path = '', assertion = 'synthetic-valid', method = 'GET') {
  return new Request(`https://admin.lythaus.co/api/admin/overview${path}`, { method, headers: { 'cf-access-jwt-assertion': assertion, origin: 'https://admin.lythaus.co' } });
}
function reset() { Object.assign(state, { member: true, role: 'owner', active: true, fail: false, sampledAt: null, rateCount: 1, reads: [] }); }

test('real dispatcher denies absent/invalid Access, nonmembers, foreign owner hints and inactive owners', async () => {
  for (const assertion of ['', 'invalid']) { reset(); assert.equal((await worker.fetch(request('', assertion), env())).status, 401); assert.equal(state.reads.length, 0); }
  reset(); state.member = false; assert.equal((await worker.fetch(request(), env())).status, 403);
  for (const role of ['administrator', 'moderator', 'operations', 'editorial', 'privacy_operator']) {
    reset(); state.role = role; const response = await worker.fetch(request(), env());
    assert.equal(response.status, 403); assert.equal((await response.json()).error, 'overview_owner_required');
  }
  reset(); state.active = false; assert.equal((await worker.fetch(request(), env())).status, 403);
  reset(); assert.equal((await worker.fetch(request('?userId=foreign'), env())).status, 400);
  assert.ok(!state.reads.some(x => x.sql.startsWith('WITH')));
});

test('real dispatcher returns a protected canonical owner aggregate; unsupported methods and periods stay denied', async () => {
  reset(); const response = await worker.fetch(request('?period=mtd'), env());
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'https://admin.lythaus.co');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json(); assert.equal(data.period, 'mtd'); assert.equal(data.metrics.posts.value, 0);
  assert.equal((await worker.fetch(request('', 'synthetic-valid', 'POST'), env())).status, 404);
  assert.equal((await worker.fetch(request('?period=bad'), env())).status, 400);
});

test('dispatcher masks source query errors and clears their private values from response and logs', async () => {
  reset(); state.fail = true;
  const logs = []; const original = console.log;
  console.log = value => logs.push(value);
  try {
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, 503); assert.equal((await response.json()).error, 'overview_unavailable');
    assert.ok(!JSON.stringify(logs).includes('private-password'));
    assert.ok(!JSON.stringify(logs).includes('private-token'));
  } finally { console.log = original; }
});

test('the invoked dispatcher refreshes database-expired cached samples and fails closed on source failure', async () => {
  reset(); const binding = env(), at = Date.now(); state.sampledAt = new Date(at);
  assert.equal((await worker.fetch(request(), binding)).status, 200);
  state.sampledAt = new Date(at + 60000);
  const refreshed = await worker.fetch(request(), binding);
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).sampledAt, state.sampledAt.toISOString());
  assert.equal(state.reads.filter(x => x.sql.startsWith('WITH')).length, 2);
  state.sampledAt = new Date(at + 120000); state.fail = true;
  const unavailable = await worker.fetch(request(), binding);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'overview_unavailable');
  assert.equal(state.reads.filter(x => x.sql.includes('INSERT INTO system.audit_events')).length, 2);
});

test('existing rate denial prevents cached Overview disclosure', async () => {
  reset(); const binding = env();
  assert.equal((await worker.fetch(request(), binding)).status, 200);
  state.rateCount = 100000;
  const response = await worker.fetch(request(), binding);
  assert.equal(response.status, 429);
  assert.equal(state.reads.filter(x => x.sql.startsWith('WITH')).length, 1);
});
