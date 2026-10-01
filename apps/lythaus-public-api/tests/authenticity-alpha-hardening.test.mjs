import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const OWNER = '01990000-0000-7000-8000-000000000201';
const OTHER = '01990000-0000-7000-8000-000000000202';
const CASE_ID = '01990000-0000-7000-8000-000000000203';
const state = { config: {}, queries: [], schedule: [], purge: [], outboxFailure: false };

const result = (rows = [], rowCount = rows.length) => ({ rows, rowCount });
const future = new Date(Date.now() + 10 * 60_000);
let baseRow = () => ({
  case_id: CASE_ID,
  owner_id: OWNER,
  content_kind: 'text',
  text_body: 'private alpha fixture',
  input_hash: 'a'.repeat(64),
  content_type: 'text/plain',
  upload_session_id: null,
  original_key: null,
  original_etag: null,
  revision: 1,
  state: 'complete',
  result: null,
  components: {},
  review_state: 'none',
  observer_requested: false,
  explanation_requested: false,
  advice_attempts: 0,
  advice_reservation_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  expires_at: future,
  deleted_at: null,
});

function reset() {
  state.config = {};
  state.queries = [];
  state.schedule = [];
  state.purge = [];
  state.outboxFailure = false;
}

mock.module('@lythaus/db', { cache: true, namedExports: {
  query: async (_binding, sql, values = []) => {
    state.queries.push({ sql, values });
    if (sql.includes('SELECT case_id FROM moderation.authenticity_alpha') && sql.includes('expires_at<=')) return result();
    if (sql.includes('FROM moderation.authenticity_alpha WHERE case_id=$1 AND owner_id=$2')) return values[1] === OWNER ? result([baseRow()]) : result();
    if (sql.includes('FROM moderation.authenticity_alpha WHERE owner_id=$1')) return result([baseRow()]);
    if (sql.includes('FROM moderation.authenticity_alpha_feedback')) return result();
    throw new Error(`unexpected_query:${sql}`);
  },
  reserveBudget: async () => ({ id: '01990000-0000-7000-8000-000000000204', status: 'reserved', estimatedCostUsd: 0.2, projectedSpendUsd: 0.2, reused: false }),
  reserveBudgetInTransaction: async () => ({ id: '01990000-0000-7000-8000-000000000205', status: 'reserved', estimatedCostUsd: 0.05, projectedSpendUsd: 0.25, reused: false }),
  transaction: async (_binding, work) => work({
    query: async (sql, values = []) => {
      state.queries.push({ sql, values, transaction: true });
      if (sql.includes('INSERT INTO system.outbox_events') && state.outboxFailure) throw new Error('outbox_insert_failed');
      if (sql.includes('SELECT * FROM moderation.authenticity_alpha')) return result([baseRow()]);
      if (sql.includes('UPDATE moderation.authenticity_alpha SET state')) return result([{ revision: 1 }], 1);
      return result();
    },
  }),
  scheduleAlphaPurge: async (_binding, ownerId, caseId, target) => { state.schedule.push({ ownerId, caseId, target }); return { purgeState: 'pending', keys: [] }; },
  purgeAlphaMedia: async (_binding, _bucket, caseId) => { state.purge.push(caseId); return { pending: 1, completed: 0, failed: 0 }; },
} });

mock.module('@lythaus/media', { cache: true, namedExports: {
  createPresignedPutUrl: async () => ({ url: 'https://upload.example/alpha', expiresAt: future.toISOString() }),
} });
mock.module('@lythaus/security', { cache: true, namedExports: { uuidv7: () => CASE_ID } });

const { handleAlphaApi } = await import('../src/authenticity-alpha.ts');

function env(overrides = {}) {
  return {
    AUTHENTICITY_ALPHA_ENABLED: 'false',
    AUTHENTICITY_ALPHA_STORAGE_ENABLED: 'false',
    AUTHENTICITY_ALPHA_ADVISER_ENABLED: 'false',
    AUTHENTICITY_BETA_ENABLED: 'false',
    COST_BUDGET_ENABLED: 'false',
    LYTHAUS_CONFIG: { get: async () => state.config },
    DB_APP_FRESH: { connectionString: 'postgres://unused' },
    ...overrides,
  };
}

function request(path, options = {}) {
  return new Request(`https://api.lythaus.co${path}`, options);
}

test('existing owner read and deletion remain available when admission is disabled', async () => {
  reset();
  const read = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}`), env(), OWNER);
  assert.equal(read.status, 200, JSON.stringify(state.queries));
  const deleted = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}`, { method: 'DELETE' }), env(), OWNER);
  assert.equal(deleted.status, 200);
  assert.deepEqual(state.schedule[0], { ownerId: OWNER, caseId: CASE_ID, target: 'deleted' });
  assert.deepEqual(state.purge, [CASE_ID]);
});

test('existing privacy access does not depend on configuration availability', async () => {
  reset();
  const unavailable = env({ LYTHAUS_CONFIG: { get: async () => { throw new Error('configuration_unavailable'); } } });
  const read = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}`), unavailable, OWNER);
  assert.equal(read.status, 200);
  const deleted = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}`, { method: 'DELETE' }), unavailable, OWNER);
  assert.equal(deleted.status, 200);
});

test('removed cohort membership can read an existing case but cannot create new work', async () => {
  reset();
  state.config = { enabled: true, expiresAt: future.toISOString(), allowlist: [], budgetApproval: 'b'.repeat(64) };
  const read = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}`), env({ AUTHENTICITY_ALPHA_ENABLED: 'true', AUTHENTICITY_ALPHA_STORAGE_ENABLED: 'true', AUTHENTICITY_BETA_ENABLED: 'true' }), OWNER);
  assert.equal(read.status, 200, JSON.stringify(state.queries));
  const create = await handleAlphaApi(request('/api/authenticity/alpha/cases', { method: 'POST', body: JSON.stringify({ contentKind: 'text', text: 'new', consentVersion: 'lythaus-authenticity-private-alpha-v0.1.0', trainingConsent: false }) }), env({ AUTHENTICITY_ALPHA_ENABLED: 'true', AUTHENTICITY_ALPHA_STORAGE_ENABLED: 'true', AUTHENTICITY_BETA_ENABLED: 'true' }), OWNER);
  assert.equal(create.status, 429);
});

test('cross-account access cannot read or delete the owner case', async () => {
  reset();
  const response = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}`, { method: 'DELETE' }), env(), OTHER);
  assert.equal(response.status, 404);
  assert.deepEqual(state.schedule, []);
});

test('advice acceptance rolls back when durable outbox insertion fails', async () => {
  reset();
  state.outboxFailure = true;
  state.config = {
    enabled: true,
    expiresAt: future.toISOString(),
    allowlist: [OWNER],
    budgetApproval: 'b'.repeat(64),
    budgetEvidenceSha256: 'b'.repeat(64),
    budgetObservedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    budgetExpiresAt: future.toISOString(),
    authenticitySubBudgetUsd: 2,
    authenticityHeadroomUsd: 0.4,
    caseReservationUsd: 0.2,
    adviserReservationUsd: 0.05,
  };
  const previousResult = baseRow;
  baseRow = () => ({ ...previousResult(), result: { explanation: { status: 'not_requested' } } });
  const response = await handleAlphaApi(request(`/api/authenticity/alpha/cases/${CASE_ID}/advice`, { method: 'POST' }), env({ AUTHENTICITY_ALPHA_ENABLED: 'true', AUTHENTICITY_ALPHA_STORAGE_ENABLED: 'true', AUTHENTICITY_ALPHA_ADVISER_ENABLED: 'true', AUTHENTICITY_BETA_ENABLED: 'true', COST_BUDGET_ENABLED: 'true', COST_BUDGET_LIMIT_USD: '10', COST_BUDGET_WARNING_USD: '7', COST_BUDGET_OPTIONAL_ANALYSIS_USD: '8', COST_BUDGET_ESSENTIAL_ONLY_USD: '9', COST_BUDGET_DEEP_SCAN_STOP_USD: '9.5' }), OWNER);
  assert.equal(response.status, 503);
  assert.equal(state.queries.some((entry) => entry.sql.includes('INSERT INTO system.outbox_events')), true);
});
