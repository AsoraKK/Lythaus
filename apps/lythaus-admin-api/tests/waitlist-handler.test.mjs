import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const WAITLIST_ID = '01900000-0000-7000-8000-000000000001';
const SECOND_WAITLIST_ID = '01900000-0000-7000-8000-000000000002';
const state = { access: 'administrator', auditWrites: [], decryptions: [], queries: [], transactionCalls: 0 };

function resetState() {
  state.access = 'administrator';
  state.auditWrites = [];
  state.decryptions = [];
  state.queries = [];
  state.transactionCalls = 0;
}

function result(rows = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function row(id, createdAt, ciphertext) {
  return { id, email_ciphertext: ciphertext, encryption_key_version: 'v1', status: 'waiting', source: 'lythaus.co', created_at: createdAt, invited_at: null, converted_at: null, unsubscribed_at: null, retention_hold: false };
}

mock.module('@lythaus/db', { cache: true, namedExports: {
  databaseExpectationsFromEnv: () => ({}), databaseReadinessResponse: () => ({}),
  enqueueTransactionalEmailIntent: async () => undefined,
  inspectDatabaseIdentity: async () => ({ readiness: 'pass', budgetLedgerApplied: true }), recordUserActivity: async () => undefined,
  transaction: async (_binding, work) => { state.transactionCalls += 1; return work({ query: async () => result() }); },
  query: async (_binding, sql, values = []) => {
    state.queries.push({ sql, values });
    if (sql.includes('identity.admin_memberships')) return state.access === 'nonmember'
      ? result([], 0) : result([{ user_id: '01900000-0000-7000-8000-000000000099', role: state.access }], 1);
    if (sql.includes('system.rate_limit_windows')) return result([{ request_count: 1 }], 1);
    if (sql.includes('SELECT w.id, convert_from(w.email_ciphertext')) return values.length > 1
      ? result([row(SECOND_WAITLIST_ID, '2026-08-13T10:00:00.000Z', 'ciphertext-2')])
      : result([row(WAITLIST_ID, '2026-08-14T10:00:00.000Z', 'ciphertext-1'), row(SECOND_WAITLIST_ID, '2026-08-13T10:00:00.000Z', 'ciphertext-2')]);
    if (sql.includes('count(id) FILTER')) return result([{ total_waiting: '2', last_7_days: '2' }], 1);
    if (sql.includes("'marketing.waitlist_viewed'")) { state.auditWrites.push({ sql, values }); return result([], 1); }
    throw new Error(`unexpected_query:${sql}`);
  },
} });

mock.module('@lythaus/observability', { cache: true, namedExports: {
  assertExpectedHostname: () => undefined, correlationId: () => 'test-correlation-id', logEvent: () => undefined,
  json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } }),
} });

mock.module('@lythaus/security', { cache: true, namedExports: {
  constantTimeEqual: () => true,
  decryptField: async ({ ciphertext }) => { state.decryptions.push(ciphertext); return ciphertext === 'ciphertext-1' ? 'first@example.com' : 'second@example.com'; },
  encryptField: async (value) => ({ ciphertext: value, encryptionKeyVersion: 'v1' }),
  hashAuthToken: () => 'auth-token-hash', hashPassword: () => ({}),
  hmacLookup: () => 'access-subject-hmac', randomToken: () => 'opaque-token', uuidv7: () => '01900000-0000-7000-8000-000000000777',
} });

mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), { cache: true, namedExports: {
  requireActiveAdminMembership: (membership) => membership,
  verifiedAccessSubject: async (request) => {
    const assertion = request.headers.get('cf-access-jwt-assertion');
    if (!assertion) throw new Error('access_required');
    if (assertion === 'invalid') throw new Error('access_assertion_invalid');
    return 'verified-access-subject';
  },
} });

const { default: worker } = await import('../src/index.ts');

function env() {
  return { ACCESS_SUBJECT_HMAC_KEY: 'subject-key', CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co', DB_ADMIN_FRESH: { connectionString: 'postgres://unused' }, DB_PRIVACY_FRESH: { connectionString: 'postgres://unused' }, EXPECTED_HOSTNAMES: 'admin.lythaus.co', PII_ENCRYPTION_KEY_V1: 'encryption-key' };
}

function request(path = '/api/admin/waitlist?limit=1', options = {}) {
  return new Request(`https://admin.lythaus.co${path}`, { ...options, headers: { 'cf-access-jwt-assertion': 'valid', ...(options.headers ?? {}) } });
}

test('waitlist handler returns 401 for missing or invalid Access assertions', async () => {
  resetState();
  const missing = await worker.fetch(new Request('https://admin.lythaus.co/api/admin/waitlist'), env());
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, 'access_required');
  const invalid = await worker.fetch(request('/api/admin/waitlist', { headers: { 'cf-access-jwt-assertion': 'invalid' } }), env());
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error, 'access_assertion_invalid');
});

test('waitlist handler rejects nonmembers and non-waitlist roles', async () => {
  resetState(); state.access = 'nonmember';
  assert.equal((await worker.fetch(request(), env())).status, 403);
  resetState(); state.access = 'moderator';
  assert.equal((await worker.fetch(request(), env())).status, 403);
});

test('authorized waitlist handler decrypts, paginates, audits and returns only approved fields', async () => {
  resetState();
  const first = await worker.fetch(request(), env());
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  const firstBody = await first.json();
  assert.deepEqual(firstBody.items, [{ id: WAITLIST_ID, email: 'first@example.com', status: 'waiting', source: 'lythaus.co', createdAt: '2026-08-14T10:00:00.000Z', invitedAt: null, convertedAt: null, unsubscribedAt: null, retentionHold: false }]);
  assert.ok(firstBody.nextCursor);
  assert.equal(JSON.stringify(firstBody).includes('ciphertext'), false);
  assert.equal(JSON.stringify(firstBody).includes('hmac'), false);
  assert.deepEqual(state.decryptions, ['ciphertext-1']);
  assert.equal(state.auditWrites.length, 1);
  assert.deepEqual(JSON.parse(state.auditWrites[0].values[3]), { returnedRowCount: 1, requestedLimit: 1, hasCursor: false, hasMore: true, hasSearch: false, statusFilter: null, sourceFilter: null });
  assert.equal(JSON.stringify(state.auditWrites[0]).includes('first@example.com'), false);
  const second = await worker.fetch(request(`/api/admin/waitlist?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`), env());
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.items[0].id, SECOND_WAITLIST_ID);
  assert.equal(secondBody.nextCursor, null);
});

test('waitlist mutation handler rejects cross-origin and non-JSON requests before a transaction', async () => {
  resetState();
  const path = `/api/admin/waitlist/${WAITLIST_ID}/status`;
  const crossOrigin = await worker.fetch(request(path, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'invited' }) }), env());
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error, 'admin_mutation_origin_invalid');
  assert.equal(state.transactionCalls, 0);
  const nonJson = await worker.fetch(request(path, { method: 'POST', headers: { origin: 'https://admin.lythaus.co', 'content-type': 'text/plain' }, body: JSON.stringify({ status: 'invited' }) }), env());
  assert.equal(nonJson.status, 415);
  assert.equal((await nonJson.json()).error, 'admin_mutation_content_type_invalid');
  assert.equal(state.transactionCalls, 0);
});
