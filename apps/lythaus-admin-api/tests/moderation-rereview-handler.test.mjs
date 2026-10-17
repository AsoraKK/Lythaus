import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';
import { parseModerationRereviewRequest } from '../src/moderation-rereview-runtime.ts';

const actorId = '01900000-0000-7000-8000-000000000099';
const state = { member: true, limited: false, reads: [], transactions: 0, clientQueries: 0 };
const result = rows => ({ rows, rowCount: rows.length });

function reset() {
  state.member = true;
  state.limited = false;
  state.reads = [];
  state.transactions = 0;
  state.clientQueries = 0;
}

async function query(sql, values = []) {
  state.reads.push({ sql, values });
  if (sql.includes('identity.admin_memberships')) {
    return state.member ? result([{ user_id: actorId, role: 'moderator' }]) : result([]);
  }
  if (sql.includes('system.rate_limit_windows')) return state.limited ? result([]) : result([{ request_count: 1 }]);
  throw new Error('unexpected_test_query');
}

mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    ...database,
    query: (_binding, sql, values) => query(sql, values),
    transaction: async (_binding, work) => {
      state.transactions += 1;
      return work({ query: async () => { state.clientQueries += 1; throw new Error('unexpected_transaction_query'); } });
    },
  },
});

mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), {
  cache: true,
  namedExports: {
    requireActiveAdminMembership: row => {
      if (!row) throw new Error('admin_role_required');
      return { userId: row.user_id, role: row.role };
    },
    verifiedAccessSubject: async request => {
      const assertion = request.headers.get('cf-access-jwt-assertion');
      if (!assertion) throw new Error('access_required');
      if (assertion === 'synthetic-outsider') return 'synthetic-outsider';
      if (assertion !== 'synthetic-valid') throw new Error('access_assertion_invalid');
      return 'synthetic-moderator';
    },
  },
});

const { default: worker } = await import('../src/index.ts');
const env = {
  ACCESS_SUBJECT_HMAC_KEY: 'synthetic-subject-key',
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.test',
  EXPECTED_HOSTNAMES: 'admin.lythaus.test',
  DB_ADMIN_FRESH: {},
};

function request(body, assertion = 'synthetic-valid', headers = {}) {
  return new Request('https://admin.lythaus.test/api/admin/moderation/cases/01900000-0000-7000-8000-000000000001/rereview', {
    method: 'POST',
    headers: {
      origin: 'https://admin.lythaus.test',
      'content-type': 'application/json',
      ...(assertion ? { 'cf-access-jwt-assertion': assertion } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('re-review route rejects missing Access and inactive membership before mutation', async () => {
  reset();
  const missing = await worker.fetch(request({ expectedCaseState: 'resolved' }, ''), env);
  assert.equal(missing.status, 401);
  assert.equal(state.reads.length, 0);
  assert.equal(state.transactions, 0);

  const invalid = await worker.fetch(request({ expectedCaseState: 'resolved' }, 'invalid'), env);
  assert.equal(invalid.status, 401);
  assert.equal(state.reads.length, 0);

  state.member = false;
  const outsider = await worker.fetch(request({ expectedCaseState: 'resolved' }, 'synthetic-outsider'), env);
  assert.equal(outsider.status, 403);
  assert.equal(state.reads.filter(read => read.sql.includes('identity.admin_memberships')).length, 1);
  assert.equal(state.reads.some(read => read.sql.includes('system.rate_limit_windows')), false);
  assert.equal(state.transactions, 0);
});

test('re-review route requires resolved state, a complete revision token, and a reason code', async () => {
  reset();
  const revision = {
    resolvedAt: '2026-10-17T07:00:00.123456Z',
    sourceEventId: '01900000-0000-7000-8000-000000000002',
    decisionId: '01900000-0000-7000-8000-000000000003',
  };
  const cases = [
    [{ expectedCaseState: 'open', expectedRevision: revision, reasonCode: 'REREVIEW_REQUEST' }, 'moderation_case_state_conflict'],
    [{ expectedCaseState: 'resolved', expectedRevision: { ...revision, decisionId: undefined }, reasonCode: 'REREVIEW_REQUEST' }, 'moderation_case_revision_conflict'],
    [{ expectedCaseState: 'resolved', expectedRevision: revision, reasonCode: 'bad reason' }, 'reason_code_required'],
    [{ expectedCaseState: 'resolved', expectedRevision: revision, reasonCode: 'REREVIEW_REQUEST', ignored: true }, 'unknown_field'],
  ];
  for (const [body, code] of cases) {
    const response = await worker.fetch(request(body), env);
    assert.equal(response.status, code.startsWith('moderation_case_') ? 409 : 400, code);
    assert.equal((await response.json()).error, code);
  }
  assert.equal(state.clientQueries, 0);
});

test('exact revision parser preserves trailing zeroes and rejects shortened timestamp tokens', () => {
  for (const fraction of ['123000', '000000']) {
    const input = {
      expectedCaseState: 'resolved', reasonCode: 'MODERATION.REREVIEW_REQUESTED',
      expectedRevision: {
        resolvedAt: `2026-10-17T07:00:00.${fraction}Z`,
        sourceEventId: '01900000-0000-7000-8000-000000000002',
        decisionId: '01900000-0000-7000-8000-000000000003',
      },
    };
    assert.deepEqual(parseModerationRereviewRequest(input), input);
    assert.throws(() => parseModerationRereviewRequest({ ...input,
      expectedRevision: { ...input.expectedRevision, resolvedAt: new Date(input.expectedRevision.resolvedAt).toISOString() },
    }), /moderation_case_revision_conflict/);
  }
});

test('re-review keeps same-origin JSON and rate-limit gates before domain work', async () => {
  for (const [headers, status, code] of [
    [{ origin: 'https://untrusted.invalid' }, 403, 'admin_mutation_origin_invalid'],
    [{ 'content-type': 'text/plain' }, 415, 'admin_mutation_content_type_invalid'],
  ]) {
    reset();
    const response = await worker.fetch(request({}, 'synthetic-valid', headers), env);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, code);
    assert.equal(state.transactions, 0);
  }
  reset();
  state.limited = true;
  const response = await worker.fetch(request({}), env);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'rate_limit_exceeded');
  assert.equal(state.transactions, 0);
});
