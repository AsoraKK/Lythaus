import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const WAITLIST_ID = '01900000-0000-7000-8000-000000000001';
const SECOND_WAITLIST_ID = '01900000-0000-7000-8000-000000000002';
const state = { access: 'administrator', auditWrites: [], decryptions: [], hmacInputs: [], privateRequests: [], queries: [], transactionCalls: 0, userAuditWrites: [], supportAuditWrites: [] };

function resetState() {
  state.access = 'administrator';
  state.auditWrites = [];
  state.decryptions = [];
  state.hmacInputs = [];
  state.privateRequests = [];
  state.queries = [];
  state.transactionCalls = 0;
  state.userAuditWrites = [];
  state.supportAuditWrites = [];
}

function result(rows = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function row(id, createdAt, ciphertext) {
  return { id, email_ciphertext: ciphertext, encryption_key_version: 'v1', status: 'waiting', source: 'lythaus.co', created_at: createdAt, invited_at: null, converted_at: null, unsubscribed_at: null, retention_hold: false };
}

mock.module('@lythaus/db', { cache: true, namedExports: {
  databaseExpectationsFromEnv: () => ({}), databaseReadinessResponse: () => ({}),
  createSupportFeedbackRuntime: async () => null,
  handleSupportFeedbackRequest: async () => new Response(null, { status: 404 }),
  isSupportFeedbackPath: () => false,
  supportAuthentication: () => ({ member: async () => { throw new Error('not reached'); }, owner: async () => { throw new Error('not reached'); } }),
  enqueueTransactionalEmailIntent: async () => undefined,
  inspectDatabaseIdentity: async () => ({ readiness: 'pass', budgetLedgerApplied: true }), recordUserActivity: async () => undefined,
  transaction: async (_binding, work) => { state.transactionCalls += 1; return work({ query: async (sql, values = []) => {
    if (sql.includes('identity.admin_memberships')) return state.access === 'nonmember'
      ? result([], 0) : result([{ user_id: '01900000-0000-7000-8000-000000000099', role: state.access }], 1);
    if (sql.includes('INSERT INTO system.audit_events') && values[2] === 'identity.account_support_lookup') {
      state.supportAuditWrites.push({ sql, values }); return result([{ id: '01900000-0000-7000-8000-000000000777' }], 1);
    }
    if (sql.includes('INSERT INTO system.audit_events')) return result([], 1);
    return result();
  } }); },
  query: async (_binding, sql, values = []) => {
    state.queries.push({ sql, values });
    if (sql.includes('identity.admin_memberships')) return state.access === 'nonmember'
      ? result([], 0) : result([{ user_id: '01900000-0000-7000-8000-000000000099', role: state.access }], 1);
    if (sql.includes('system.rate_limit_windows')) return result([{ request_count: 1 }], 1);
    if (sql.includes('SELECT w.id, convert_from(w.email_ciphertext')) {
      const rows = [row(WAITLIST_ID, '2026-08-14T10:00:00.000000Z', 'ciphertext-1'), row(SECOND_WAITLIST_ID, '2026-08-13T10:00:00.000000Z', 'ciphertext-2')];
      if (sql.includes('w.id = ANY($1::uuid[])')) return result(rows.filter(item => values[0].includes(item.id)));
      if (values.at(-1) === 1001) return result(rows);
      return values.length > 1 ? result([rows[1]]) : result(rows);
    }
    if (sql.includes('SELECT count(id)::text AS matching_total')) return result([{ matching_total: '2' }], 1);
    if (sql.includes('count(id) FILTER')) return result([{ total_waiting: '2', last_7_days: '2' }], 1);
    if (sql.includes("'marketing.waitlist_viewed'")) { state.auditWrites.push({ sql, values }); return result([], 1); }
    if (sql.includes('SELECT count(*)::text AS matching_total')) return result([{ matching_total: sql.includes('u.id = $1') ? '1' : '3' }], 1);
    if (sql.includes('FROM identity.users u')) return result([{
      id: '01900000-0000-7000-8000-000000000003', display_name: 'Member Name', handle: 'member',
      status: 'active', created_at: '2026-08-12T10:00:00.000Z', updated_at: '2026-08-13T10:00:00.000Z', deleted_at: null,
      last_login_at: null, current_session_count: '0', subscription_tier: 'free',
      password_hash: 'synthetic-secret', refresh_token_hash: 'synthetic-token', email_lookup_hmac: 'synthetic-hmac',
    }]);
    if (sql.includes("'identity.users_viewed'")) { state.userAuditWrites.push({ sql, values }); return result([], 1); }
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
  hmacLookup: (value) => { state.hmacInputs.push(value); return 'access-subject-hmac'; }, randomToken: () => 'opaque-token', uuidv7: () => '01900000-0000-7000-8000-000000000777',
} });

mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), { cache: true, namedExports: {
  requireActiveAdminMembership: (membership) => ({ userId: membership.user_id, role: membership.role }),
  verifiedAccessSubject: async (request) => {
    const assertion = request.headers.get('cf-access-jwt-assertion');
    if (!assertion) throw new Error('access_required');
    if (assertion === 'invalid') throw new Error('access_assertion_invalid');
    return 'verified-access-subject';
  },
} });

const { default: worker } = await import('../src/index.ts');

function env() {
  const workerVersion = '01900000-0000-7000-8000-000000000088';
  return {
    ACCESS_SUBJECT_HMAC_KEY: 'subject-key', CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
    DB_ADMIN_FRESH: { connectionString: 'postgres://unused' }, DB_PRIVACY_FRESH: { connectionString: 'postgres://unused' },
    EXPECTED_HOSTNAMES: 'admin.lythaus.co', PII_ENCRYPTION_KEY_V1: 'encryption-key', PII_HMAC_KEY_V1: 'hmac-key',
    AUTH_EMAIL_ENVELOPE: { fetch: async (url, init) => {
      state.privateRequests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ workerVersion, result: { state: 'found', account: {
        id: '01900000-0000-7000-8000-000000000003', status: 'active', verificationState: 'verified',
        verifiedAt: '2026-08-13T10:00:00.000Z', createdAt: '2026-08-12T10:00:00.000Z', updatedAt: '2026-08-13T10:00:00.000Z',
        deletedAt: null, lastSignInAt: null, activeSessionCount: 0, subscriptionTier: 'free',
      } } }), { headers: { 'content-type': 'application/json' } });
    } },
    WORKER_VERSION: { id: workerVersion },
  };
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
  assert.equal(firstBody.totalMatching, 2);
  assert.deepEqual(firstBody.items, [{ id: WAITLIST_ID, email: 'first@example.com', status: 'waiting', source: 'lythaus.co', createdAt: '2026-08-14T10:00:00.000Z', retentionHold: false }]);
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
  assert.equal(secondBody.totalMatching, 2);
  assert.equal(secondBody.nextCursor, null);
});

test('waitlist exact email search uses a bounded decrypt-and-compare scan and counts all filtered matches', async () => {
  resetState();
  const emailSearch = request('/api/admin/waitlist/search', { method: 'POST', headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' }, body: JSON.stringify({ q: 'FIRST@EXAMPLE.COM', limit: 1 }) });
  assert.equal(new URL(emailSearch.url).searchParams.has('q'), false);
  const response = await worker.fetch(emailSearch, env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.totalMatching, 1);
  assert.equal(body.items[0].email, 'first@example.com');
  const listQuery = state.queries.find(entry => entry.sql.includes('SELECT w.id, convert_from(w.email_ciphertext'));
  assert.doesNotMatch(listQuery.sql, /email_lookup_hmac|LIKE|ILIKE/);
  assert.deepEqual(listQuery.values, [1001]);
  assert.deepEqual(state.decryptions, ['ciphertext-1', 'ciphertext-2']);
  assert.ok(!JSON.stringify(state.auditWrites).includes('first@example.com'));
});

test('account list uses safe fields and exact email lookup through the audited owner support primitive', async () => {
  resetState();
  state.access = 'owner';
  const emailSearch = request('/api/admin/users/search-by-email', { method: 'POST', headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' }, body: JSON.stringify({ q: 'MEMBER@EXAMPLE.COM', limit: 1 }) });
  assert.equal(new URL(emailSearch.url).searchParams.has('q'), false);
  const response = await worker.fetch(emailSearch, env());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.totalMatching, 1);
  assert.equal(body.items[0].displayName, 'Member Name');
  assert.equal(body.items[0].verificationState, 'verified');
  assert.equal(body.items[0].email, undefined);
  assert.equal(JSON.stringify(body).includes('password_hash'), false);
  assert.equal(JSON.stringify(body).includes('refresh_token_hash'), false);
  assert.equal(JSON.stringify(body).includes('email_lookup_hmac'), false);
  assert.equal(JSON.stringify(body).includes('MEMBER@EXAMPLE.COM'), false);
  assert.equal(state.privateRequests[0].url, 'https://lythaus-public.internal/keeper-account-support/lookup');
  assert.equal(state.privateRequests[0].body.email, 'member@example.com');
  assert.equal(state.supportAuditWrites.length, 1);
  assert.equal(JSON.stringify(state.supportAuditWrites[0]).includes('member@example.com'), false);
  const listQuery = state.queries.find(entry => entry.sql.includes('FROM identity.users u') && entry.sql.includes('LIMIT'));
  assert.match(listQuery.sql, /u\.id = \$1::uuid/);
  assert.doesNotMatch(listQuery.sql, /contact_emails|email_credentials|email_ciphertext|password_hash|token_hash/);
  assert.equal(state.userAuditWrites.length, 1);
  assert.equal(state.userAuditWrites[0].values[1], '01900000-0000-7000-8000-000000000099');
});

test('exact account email search is denied to administrator role and non-owner membership', async () => {
  resetState(); state.access = 'administrator';
  const requestBody = () => request('/api/admin/users/search-by-email', {
    method: 'POST', headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'member@example.com' }),
  });
  const administrator = await worker.fetch(requestBody(), env());
  assert.equal(administrator.status, 403);
  assert.equal((await administrator.json()).error, 'account_support_owner_required');
  assert.equal(state.privateRequests.length, 0);
  resetState(); state.access = 'nonmember';
  const nonmember = await worker.fetch(requestBody(), env());
  assert.equal(nonmember.status, 403);
  assert.equal(state.privateRequests.length, 0);
});

test('email search rejects URL query strings and incomplete body values', async () => {
  resetState();
  assert.equal((await worker.fetch(request('/api/admin/waitlist?q=person%40example.com'), env())).status, 400);
  assert.equal((await worker.fetch(request('/api/admin/users?q=person%40example.com'), env())).status, 400);
  const invalid = request('/api/admin/waitlist/search', { method: 'POST', headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' }, body: JSON.stringify({ q: 'partial' }) });
  assert.equal((await worker.fetch(invalid, env())).status, 400);
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
