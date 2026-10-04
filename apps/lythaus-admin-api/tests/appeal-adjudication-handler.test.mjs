import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as database from '@lythaus/db';

const actorId = '01900000-0000-7000-8000-000000000099';
const state = { role: 'moderator', reads: [], rateLimited: false };
const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });

async function query(sql, values = []) {
  state.reads.push({ sql, values });
  if (sql.includes('identity.admin_memberships')) {
    return result([{ user_id: actorId, role: state.role }]);
  }
  if (sql.includes('system.rate_limit_windows')) return state.rateLimited ? result([], 0) : result([{ request_count: 1 }]);
  if (sql.includes('FROM moderation.appeals appeal')) return result([]);
  throw new Error('unexpected_test_query');
}

mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    ...database,
    query: (_binding, sql, values) => query(sql, values),
    transaction: (_binding, work) => work({ query }),
  },
});
mock.module(new URL('../src/admin-access-runtime-policy.ts', import.meta.url), {
  cache: true,
  namedExports: {
    requireActiveAdminMembership: row => ({ userId: row.user_id, role: row.role }),
    verifiedAccessSubject: async request => {
      if (request.headers.get('cf-access-jwt-assertion') !== 'synthetic-valid') {
        throw new Error('access_required');
      }
      return 'synthetic-editor';
    },
  },
});

const { default: worker } = await import('../src/index.ts');
const env = {
  ACCESS_SUBJECT_HMAC_KEY: 'synthetic-key',
  EXPECTED_HOSTNAMES: 'admin.lythaus.co',
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
  DB_ADMIN_FRESH: {},
};

function request(path, method = 'GET', body) {
  return new Request(`https://admin.lythaus.co${path}`, {
    method,
    headers: {
      origin: 'https://admin.lythaus.co',
      'cf-access-jwt-assertion': 'synthetic-valid',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function reset(role) {
  state.role = role;
  state.reads = [];
  state.rateLimited = false;
}

test('HTTP role denial is 403 for pending list and remains 400 for adjudication POST', async () => {
  reset('moderator');
  const pending = await worker.fetch(request('/api/admin/appeals/pending-adjudication'), env);
  assert.equal(pending.status, 403);
  assert.equal((await pending.json()).error, 'appeal_adjudication_list_forbidden');
  assert.equal(state.reads.filter(read => read.sql.includes('FROM moderation.appeals appeal')).length, 0);

  reset('administrator');
  const adjudication = await worker.fetch(
    request('/api/admin/appeals/01900000-0000-7000-8000-000000000010/adjudications', 'POST', {
      decision: 'uphold',
      reasonCode: 'APPEAL.PANEL_CONFIRMED',
    }),
    env,
  );
  assert.equal(adjudication.status, 400);
  assert.equal((await adjudication.json()).error, 'appeal_adjudicator_required');
  assert.equal(state.reads.filter(read => read.sql.includes('FROM moderation.appeals appeal')).length, 0);
});

test('authorized pending list dispatches the query and stays private', async () => {
  reset('editorial');
  const response = await worker.fetch(request('/api/admin/appeals/pending-adjudication'), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.deepEqual(await response.json(), { items: [] });
  assert.equal(state.reads.filter(read => read.sql.includes('FROM moderation.appeals appeal')).length, 1);
});

test('the shared admin limiter returns 429 before dispatch on the five appeal operations', async () => {
  const cases = [
    ['GET', '/api/admin/appeals/pending-adjudication'],
    ['POST', '/api/admin/appeals/01900000-0000-7000-8000-000000000010/adjudications', {
      decision: 'uphold', reasonCode: 'APPEAL.PANEL_CONFIRMED',
    }],
    ['GET', '/api/admin/appeals/community/queue'],
    ['POST', '/api/admin/appeals/01900000-0000-7000-8000-000000000010/triage', {
      reviewClass: 'standard', safePreview: 'synthetic safe preview', ruleContext: 'synthetic rule', reasonCode: 'community_review',
    }],
    ['GET', '/api/admin/appeals/01900000-0000-7000-8000-000000000010/evidence'],
  ];

  for (const [method, path, body] of cases) {
    reset('editorial');
    state.rateLimited = true;
    const response = await worker.fetch(request(path, method, body), env);
    assert.equal(response.status, 429, `${method} ${path}`);
    assert.equal((await response.json()).error, 'rate_limit_exceeded');
    assert.equal(state.reads.filter(read => read.sql.includes('system.rate_limit_windows')).length, 1);
    assert.equal(state.reads.filter(read => read.sql.includes('FROM moderation.appeals appeal')).length, 0);
    assert.equal(state.reads.filter(read => /community_appeal_(?:triage|safe_evidence)/.test(read.sql)).length, 0);
  }
});
