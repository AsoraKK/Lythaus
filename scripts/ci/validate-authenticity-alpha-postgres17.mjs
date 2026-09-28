import assert from 'node:assert/strict';
import { mock } from 'node:test';
import pg from 'pg';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
if (!connectionString || !['localhost', '127.0.0.1', '::1'].includes(new URL(connectionString).hostname)) {
  throw new Error('Local PostgreSQL 17 test database required');
}

async function connect(role) {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  if (role) {
    if (!['lythaus_runtime', 'lythaus_jobs', 'lythaus_admin'].includes(role)) throw new Error('test_role_invalid');
    await client.query(`SET ROLE ${role}`);
  }
  return client;
}

const sql = async (binding, text, values = []) => {
  const client = await connect(binding.role);
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
};

const transaction = async (binding, work) => {
  const client = await connect(binding.role);
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
};

let reserveBudget;
let reserveBudgetInTransaction;
let scheduleAlphaPurge;
let purgeAlphaMedia;
mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    query: sql,
    transaction,
    reserveBudget: (...args) => reserveBudget(...args),
    reserveBudgetInTransaction: (...args) => reserveBudgetInTransaction(...args),
    reconcileBudgetReservation: async () => undefined,
    scheduleAlphaPurge: (...args) => scheduleAlphaPurge(...args),
    purgeAlphaMedia: (...args) => purgeAlphaMedia(...args),
  },
});
mock.module('@lythaus/media', {
  cache: true,
  namedExports: { createPresignedPutUrl: async () => { throw new Error('IMAGE_PATH_NOT_USED'); } },
});
mock.module(new URL('../../packages/authenticity/src/openai-moderation.ts', import.meta.url), {
  cache: true,
  namedExports: {
    createOpenAIModerationProvider: () => ({
      analyseText: async () => ({
        provider: 'explicit-pg17-safety-fixture',
        result: 'ALLOW',
        reasonCodes: [],
        modelVersion: 'protocol-only',
        executionMs: 1,
        costEstimateUsd: 0,
      }),
    }),
  },
});

reserveBudget = (await import('../../packages/db/src/budget.ts')).reserveBudget;
reserveBudgetInTransaction = (await import('../../packages/db/src/budget.ts')).reserveBudgetInTransaction;
scheduleAlphaPurge = (await import('../../packages/db/src/authenticity-alpha.ts')).scheduleAlphaPurge;
purgeAlphaMedia = (await import('../../packages/db/src/authenticity-alpha.ts')).purgeAlphaMedia;
const { handleAlphaApi } = await import('../../apps/lythaus-public-api/src/authenticity-alpha.ts');
const { processAlphaEvent } = await import('../../apps/lythaus-jobs/src/authenticity-alpha.ts');

const owner = '01990000-0000-7000-8000-000000000411';
const stranger = '01990000-0000-7000-8000-000000000412';
const now = Date.now();
const config = {
  enabled: true,
  expiresAt: new Date(now + 60 * 60_000).toISOString(),
  allowlist: [owner],
  safeEnabled: false,
  adviserEnabled: false,
  rightsApproval: 'a'.repeat(64),
  budgetApproval: 'b'.repeat(64),
  runtimeApproval: 'c'.repeat(64),
  runtimeDigest: `sha256:${'d'.repeat(64)}`,
  preprocessingHash: 'e'.repeat(64),
  caseReservationUsd: 0.05,
  adviserReservationUsd: 0.01,
  observerReservationUsd: 0.01,
  budgetEvidenceSha256: 'b'.repeat(64),
  budgetObservedAt: new Date(now - 5 * 60_000).toISOString(),
  budgetExpiresAt: new Date(now + 55 * 60_000).toISOString(),
  authenticitySubBudgetUsd: 2,
  authenticityHeadroomUsd: 0.4,
  sourceHistoryHashes: [],
};
const env = {
  DB_APP_FRESH: { role: 'lythaus_runtime' },
  DB_JOBS_FRESH: { role: 'lythaus_jobs' },
  AUTHENTICITY_BETA_ENABLED: 'true',
  AUTHENTICITY_ALPHA_ENABLED: 'true',
  AUTHENTICITY_ALPHA_STORAGE_ENABLED: 'true',
  AUTHENTICITY_ALPHA_OBSERVER_ENABLED: 'false',
  AUTHENTICITY_ALPHA_ADVISER_ENABLED: 'false',
  COST_BUDGET_ENABLED: 'true',
  COST_BUDGET_LIMIT_USD: '10',
  COST_BUDGET_WARNING_USD: '7',
  COST_BUDGET_OPTIONAL_ANALYSIS_USD: '8',
  COST_BUDGET_ESSENTIAL_ONLY_USD: '9',
  COST_BUDGET_DEEP_SCAN_STOP_USD: '9.5',
  OPENAI_API_KEY: 'explicit-pg17-safety-fixture',
  LYTHAUS_CONFIG: { get: async () => config },
};

const request = (path, method = 'GET', body) => new Request(`https://alpha.pg17.test${path}`, {
  method,
  ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
});
const callApi = (path, method = 'GET', body, user = owner) => handleAlphaApi(request(path, method, body), env, user);

const admin = await connect();
try {
  const version = Number((await admin.query("SELECT current_setting('server_version_num')::integer AS n")).rows[0].n);
  assert.ok(version >= 170000 && version < 180000);
  await admin.query('INSERT INTO identity.users(id,display_name) VALUES($1,$2),($3,$4) ON CONFLICT (id) DO NOTHING', [owner, 'Alpha PG17 owner', stranger, 'Alpha PG17 stranger']);

  const created = await callApi('/api/authenticity/alpha/cases', 'POST', {
    contentKind: 'text',
    text: 'Disposable PostgreSQL 17 private-alpha text fixture.',
    consentVersion: 'lythaus-authenticity-private-alpha-v0.1.0',
    trainingConsent: false,
  });
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  const caseId = (await created.json()).caseId;
  const event = (await admin.query("SELECT id,payload FROM system.outbox_events WHERE aggregate_id=$1 ORDER BY created_at DESC LIMIT 1", [caseId])).rows[0];
  assert.ok(event?.id && event.payload);

  await processAlphaEvent(env, event.id, event.payload);
  const result = await callApi(`/api/authenticity/alpha/cases/${caseId}`);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.status, 'complete');
  assert.equal(body.finding, 'INCONCLUSIVE');
  assert.equal(body.execution.safety_text.execution, 'completed');
  assert.equal(body.execution.safety_text.interpretation, 'available');
  assert.equal(body.execution.safe.execution, 'unsupported');
  assert.equal(body.execution.safe.reason, 'SAFE-A_requires_image');
  assert.equal((await callApi(`/api/authenticity/alpha/cases/${caseId}`, 'GET', undefined, stranger)).status, 404);

  const deleted = await callApi(`/api/authenticity/alpha/cases/${caseId}`, 'DELETE');
  assert.equal(deleted.status, 200, JSON.stringify(await deleted.clone().json()));
  const tombstone = (await admin.query('SELECT state,result,text_body,purge_state,purged_at FROM moderation.authenticity_alpha WHERE case_id=$1', [caseId])).rows[0];
  assert.equal(tombstone.state, 'deleted');
  assert.equal(tombstone.result, null);
  assert.equal(tombstone.text_body, null);
  assert.equal(tombstone.purge_state, 'completed');
  assert.ok(tombstone.purged_at);
  assert.equal((await callApi(`/api/authenticity/alpha/cases/${caseId}`)).status, 404);
  console.log('PASS: PostgreSQL 17 alpha API -> outbox -> Jobs -> persisted text result -> owner isolation -> durable deletion. Safety was an explicit protocol fixture; no SAFE, Moondream or GPT-OSS calls were made.');
} finally {
  await admin.end();
  mock.restoreAll();
}
