import assert from 'node:assert/strict';
import { mock } from 'node:test';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

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
let reconcileBudgetReservation;
let textSafety = 'ALLOW';
let safetyCalls = 0;
let safeCalls = 0;
let observerCalls = 0;
let adviceCalls = 0;
mock.module('@lythaus/db', {
  cache: true,
  namedExports: {
    query: sql,
    transaction,
    reserveBudget: (...args) => reserveBudget(...args),
    reserveBudgetInTransaction: (...args) => reserveBudgetInTransaction(...args),
    reconcileBudgetReservation: (...args) => reconcileBudgetReservation(...args),
    scheduleAlphaPurge: (...args) => scheduleAlphaPurge(...args),
    purgeAlphaMedia: (...args) => purgeAlphaMedia(...args),
  },
});
mock.module('@lythaus/media', {
  cache: true,
  namedExports: { createPresignedPutUrl: async () => ({ url: 'https://protocol.r2.cloudflarestorage.com/private', expiresAt: new Date(Date.now() + 600000).toISOString() }) },
});
mock.module(new URL('../../packages/authenticity/src/openai-moderation.ts', import.meta.url), {
  cache: true,
  namedExports: {
    createOpenAIModerationProvider: () => ({
      analyseText: async () => { safetyCalls += 1; return ({
        provider: 'explicit-pg17-safety-fixture',
        result: textSafety,
        reasonCodes: [],
        modelVersion: 'protocol-only',
        executionMs: 1,
        costEstimateUsd: 0,
      }); },
      analyseImage: async () => { safetyCalls += 1; return ({ provider: 'explicit-pg17-safety-fixture', result: 'ALLOW', reasonCodes: [], modelVersion: 'protocol-only', executionMs: 1, costEstimateUsd: 0 }); },
    }),
  },
});

reserveBudget = (await import('../../packages/db/src/budget.ts')).reserveBudget;
reserveBudgetInTransaction = (await import('../../packages/db/src/budget.ts')).reserveBudgetInTransaction;
reconcileBudgetReservation = (await import('../../packages/db/src/budget.ts')).reconcileBudgetReservation;
scheduleAlphaPurge = (await import('../../packages/db/src/authenticity-alpha.ts')).scheduleAlphaPurge;
purgeAlphaMedia = (await import('../../packages/db/src/authenticity-alpha.ts')).purgeAlphaMedia;
const { handleAlphaApi } = await import('../../apps/lythaus-public-api/src/authenticity-alpha.ts');
const { processAlphaEvent, expireAlphaWork } = await import('../../apps/lythaus-jobs/src/authenticity-alpha.ts');
const { handleAdminAlpha } = await import('../../apps/lythaus-admin-api/src/authenticity-alpha.ts');

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
  DB_ADMIN_FRESH: { role: 'lythaus_admin' },
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
  MEDIA_QUOTA_BYTES: '104857600', R2_ACCOUNT_ID: 'protocol-only', R2_ACCESS_KEY_ID: 'protocol-only', R2_SECRET_ACCESS_KEY: 'protocol-only', MEDIA_QUARANTINE_BUCKET: 'protocol-only',
  AI_GATEWAY_ID: 'protocol-only',
  AI: { run: async () => { observerCalls += 1; throw new Error('protocol-observer-unavailable'); } },
  AUTHENTICITY_BETA_DISPATCH_SECRET: 'protocol-only',
  AUTHENTICITY_BETA_CONTAINER: { getByName: () => ({ fetch: async () => { safeCalls += 1; const error = new Error('private runtime detail'); error.name = 'TimeoutError'; throw error; } }) },
};
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG2kAAAAASUVORK5CYII=', 'base64');
const objects = new Map();
let failQuarantineDelete = false;
env.MEDIA_QUARANTINE = {
  put: async (key, bytes, options) => {
    if (options?.onlyIf && objects.has(key)) return null;
    objects.set(key, Buffer.from(bytes));
    return env.MEDIA_QUARANTINE.head(key);
  },
  head: async (key) => objects.has(key) ? { httpEtag: '"' + createHash('sha256').update(objects.get(key)).digest('hex') + '"' } : null,
  get: async (key) => {
    const bytes = objects.get(key);
    return bytes ? { ...await env.MEDIA_QUARANTINE.head(key), size: bytes.length, body: new Response(bytes).body } : null;
  },
  delete: async (keys) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (failQuarantineDelete && key.startsWith('quarantine/')) throw new Error('private provider detail');
      objects.delete(key);
    }
  },
};

const request = (path, method = 'GET', body) => new Request(`https://alpha.pg17.test${path}`, {
  method,
  ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
});
const callApi = (path, method = 'GET', body, user = owner) => handleAlphaApi(request(path, method, body), env, user);

const admin = await connect();
async function createCase(kind, options = {}, user = owner) {
  const response = await callApi('/api/authenticity/alpha/cases', 'POST', {
    contentKind: kind, ...(kind !== 'image' ? { text: 'Protocol-only caption.' } : {}),
    ...(kind !== 'text' ? { contentType: 'image/png', size: image.length, checksumSha256: createHash('sha256').update(image).digest('hex') } : {}),
    consentVersion: 'lythaus-authenticity-private-alpha-v0.1.0', trainingConsent: false, ...options,
  }, user);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return (await response.json()).caseId;
}
async function finalize(id) {
  await env.MEDIA_QUARANTINE.put(`quarantine/${owner}/${id}`, image);
  const response = await callApi(`/api/authenticity/alpha/cases/${id}/finalise`, 'POST');
  assert.equal(response.status, 202, JSON.stringify(await response.clone().json()));
}
async function processCase(id, operation = 'analysis') {
  const event = (await admin.query("SELECT id,payload FROM system.outbox_events WHERE aggregate_id=$1 AND payload->>'operation'=$2 ORDER BY created_at DESC LIMIT 1", [id, operation])).rows[0];
  assert.ok(event);
  await processAlphaEvent(env, event.id, event.payload);
  return event;
}
const detail = async (id) => (await callApi(`/api/authenticity/alpha/cases/${id}`)).json();
const contract = JSON.parse(readFileSync('api/openapi/dist/openapi.json', 'utf8'));
const ajv = new Ajv({ strict: false }); addFormats(ajv); ajv.addSchema(contract, 'alpha-contract');
const actionContract = ajv.getSchema('alpha-contract#/components/schemas/AlphaAction');
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
  assert.ok(actionContract(await deleted.clone().json()), JSON.stringify(actionContract.errors));
  const tombstone = (await admin.query('SELECT state,result,text_body,purge_state,purged_at FROM moderation.authenticity_alpha WHERE case_id=$1', [caseId])).rows[0];
  assert.equal(tombstone.state, 'deleted');
  assert.equal(tombstone.result, null);
  assert.equal(tombstone.text_body, null);
  assert.equal(tombstone.purge_state, 'completed');
  assert.ok(tombstone.purged_at);
  assert.equal((await callApi(`/api/authenticity/alpha/cases/${caseId}`)).status, 404);
  console.log('PASS: PostgreSQL 17 alpha API -> outbox -> Jobs -> persisted text result -> owner isolation -> durable deletion; explicit protocol providers only');

  const explained = await createCase('text', { explanationRequested: true });
  assert.equal((await admin.query('SELECT advice_attempts,advice_reservation_id FROM moderation.authenticity_alpha WHERE case_id=$1', [explained])).rows[0].advice_attempts, 1);
  await processCase(explained);
  assert.equal((await detail(explained)).status, 'queued');
  await processCase(explained, 'advice');
  assert.equal((await detail(explained)).adviserStatus, 'disabled');
  assert.equal((await detail(explained)).status, 'complete');
  assert.equal((await admin.query("SELECT status FROM system.cost_budget_reservations WHERE operation='authenticity_alpha_advice' AND correlation_id=$1", [explained])).rows[0].status, 'released');
  assert.equal((await callApi(`/api/authenticity/alpha/cases/${explained}/advice`, 'POST')).status, 409);
  assert.equal((await handleAdminAlpha(request(`/api/admin/authenticity/alpha/cases/${explained}/advice`, 'POST', { message: 'Explain once.' }), env, { userId: owner, role: 'operations' })).status, 409);
  assert.equal((await handleAdminAlpha(request('/api/admin/authenticity/alpha/cases'), env, { userId: owner, role: 'support' })).status, 403);
  assert.equal((await handleAdminAlpha(request(`/api/admin/authenticity/alpha/cases/${explained}`), env, { userId: owner, role: 'operations' })).status, 200);
  console.log('PASS: requested advice reservation/dispatch, disabled reservation release, admin budget/role isolation');

  config.safeEnabled = true; env.AUTHENTICITY_ALPHA_OBSERVER_ENABLED = 'true'; textSafety = 'PROVIDER_FAILURE';
  const mixed = await createCase('text_image', { observerRequested: true });
  await finalize(mixed); await processCase(mixed);
  const mixedResult = await detail(mixed);
  assert.equal(mixedResult.execution.safety_text.interpretation, 'unavailable');
  assert.equal(mixedResult.execution.safe.reason, 'safety_unavailable');
  assert.equal(safeCalls, 0); assert.equal(observerCalls, 0); textSafety = 'ALLOW';
  console.log('PASS: mixed text Safety unavailability stops SAFE/observer');

  const timeout = await createCase('image');
  await finalize(timeout); const timeoutEvent = await processCase(timeout);
  const timedOut = await detail(timeout);
  assert.equal(timedOut.status, 'failed'); assert.equal(timedOut.finding, 'UNAVAILABLE');
  assert.equal(timedOut.execution.safe.execution, 'timed_out');
  assert.equal(timedOut.execution.safety_image.interpretation, 'available');
  const beforeDuplicate = safetyCalls;
  await processAlphaEvent(env, timeoutEvent.id, timeoutEvent.payload);
  assert.equal(safeCalls, 1); assert.equal(safetyCalls, beforeDuplicate);
  assert.equal(JSON.stringify(timedOut).includes('private runtime detail'), false);
  await admin.query("UPDATE moderation.authenticity_alpha SET state='analyzing',result=NULL,lease_token=$2,lease_until=now()-interval '1 minute' WHERE case_id=$1", [timeout, stranger]);
  await processAlphaEvent(env, timeoutEvent.id, timeoutEvent.payload);
  assert.equal((await detail(timeout)).execution.safety_image.interpretation, 'available');
  assert.equal(safeCalls, 1); assert.equal(safetyCalls, beforeDuplicate);
  console.log('PASS: runtime timeout preserves Safety/result and duplicate delivery makes no second call');

  config.safeEnabled = false; const replay = await createCase('image');
  failQuarantineDelete = true; await finalize(replay); failQuarantineDelete = false;
  const outboxBefore = Number((await admin.query('SELECT count(*) AS n FROM system.outbox_events WHERE aggregate_id=$1', [replay])).rows[0].n);
  assert.equal((await callApi(`/api/authenticity/alpha/cases/${replay}/finalise`, 'POST')).status, 202);
  assert.equal(Number((await admin.query('SELECT count(*) AS n FROM system.outbox_events WHERE aggregate_id=$1', [replay])).rows[0].n), outboxBefore);
  await processCase(replay);
  assert.equal((await detail(replay)).execution.safe.reason, 'runtime_not_enabled');
  assert.equal((await callApi(`/api/authenticity/alpha/cases/${replay}`, 'DELETE')).status, 200);
  assert.equal((await admin.query('SELECT purge_state FROM moderation.authenticity_alpha WHERE case_id=$1', [replay])).rows[0].purge_state, 'pending');
  await env.MEDIA_QUARANTINE.put(`quarantine/${owner}/${replay}`, image);
  await admin.query("UPDATE media.upload_sessions SET expires_at=now()-interval '3 minutes' WHERE id=$1", [replay]);
  await purgeAlphaMedia(env.DB_JOBS_FRESH, env.MEDIA_QUARANTINE, replay);
  assert.equal(objects.has(`quarantine/${owner}/${replay}`), false);
  assert.equal((await admin.query('SELECT purge_state FROM moderation.authenticity_alpha WHERE case_id=$1', [replay])).rows[0].purge_state, 'completed');
  await admin.query("UPDATE moderation.authenticity_alpha SET expires_at=now()-interval '1 minute' WHERE case_id=ANY($1::uuid[])", [[explained, mixed, timeout]]);
  await expireAlphaWork(env);
  const expired = (await admin.query('SELECT state,result,text_body FROM moderation.authenticity_alpha WHERE case_id=ANY($1::uuid[])', [[explained, mixed, timeout]])).rows;
  assert.ok(expired.every(row => row.state === 'expired' && row.result === null && row.text_body === null));
  console.log('PASS: finalisation replay, unavailable runtime, upload drain/purge and completed-result expiry');

  config.allowlist.push(stranger);
  env.AUTHENTICITY_ALPHA_ADVISER_ENABLED = 'true';
  env.AI.run = async (_model, _input, options) => {
    adviceCalls += 1;
    assert.equal(options.gateway.collectLog, false);
    assert.equal(options.gateway.skipCache, true);
    assert.deepEqual(options.gateway.retries, { maxAttempts: 1 });
    assert.ok(options.signal instanceof AbortSignal);
    const error = new Error('private adviser protocol detail'); error.name = 'TimeoutError'; throw error;
  };
  const adviceCase = await createCase('text', { explanationRequested: true }, stranger);
  await processCase(adviceCase);
  const adviceEvent = await processCase(adviceCase, 'advice');
  const adviceResult = await (await callApi(`/api/authenticity/alpha/cases/${adviceCase}`, 'GET', undefined, stranger)).json();
  assert.equal(adviceResult.finding, 'INCONCLUSIVE');
  assert.equal(adviceResult.execution.safety_text.execution, 'completed');
  assert.equal(adviceResult.execution.adviser.execution, 'timed_out');
  assert.equal(adviceResult.adviserStatus, 'attempt_consumed');
  assert.equal(JSON.stringify(adviceResult).includes('private adviser protocol detail'), false);
  await processAlphaEvent(env, adviceEvent.id, adviceEvent.payload);
  assert.equal(adviceCalls, 1);
  console.log('PASS: reserved advice timeout preserves evidence, suppresses gateway logging/caching/retries and cannot repeat');
  console.log(JSON.stringify({ sourceEvidence: 'LOCAL_PROTOCOL_ONLY', scenarioGroups: 6, realInferenceCalls: 0, paidProviderCalls: 0, protocolSafetyCalls: safetyCalls, protocolSafeCalls: safeCalls, protocolAdviceCalls: adviceCalls }));
} finally {
  await admin.end();
  mock.restoreAll();
}
