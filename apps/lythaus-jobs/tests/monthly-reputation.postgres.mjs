import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { after, before, mock, test } from 'node:test';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, nextReputationMonth } from '@lythaus/contracts';
import { proposedClosingSundayWeeks } from '../../../packages/contracts/src/monthly-reputation-decisions.ts';
import {
  assessMonthlyReputationSource, recordMonthlyReputationSource,
  MONTHLY_REPUTATION_REQUEST_EVENT, MONTHLY_REPUTATION_SHADOW_FLAG, MONTHLY_REPUTATION_PAUSED,
} from '../../../packages/db/src/monthly-reputation.ts';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !(target.pathname === '/lythaus_monthly_test' || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Monthly reputation tests require an explicitly local disposable PostgreSQL database');
}

const statements = [];
async function transact(work, role) {
  const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    if (role) {
      assert.ok(['lythaus_jobs', 'lythaus_privacy', 'lythaus_runtime'].includes(role));
      await client.query(`SET LOCAL ROLE ${role}`);
    }
    const wrapped = { query: (text, values) => { statements.push(text); return client.query(text, values); } };
    const result = await work(wrapped);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}

const sql = (text, values) => transact(client => client.query(text, values));
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => {
    assert.equal(binding, freshBinding);
    return transact(client => client.query(text, values), 'lythaus_jobs');
  },
  transaction: (binding, work) => {
    if (binding === privacyBinding) return transact(work, 'lythaus_privacy');
    assert.equal(binding, freshBinding);
    return transact(work, 'lythaus_jobs');
  },
} });
const { processMonthlyReputationAssessment, reconcileDeferredMonthlyReputation } = await import('../src/monthly-reputation.ts');
const platform = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'cloudflare:workers'
    ? { url: 'data:text/javascript,export class WorkflowEntrypoint {}', shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { default: jobsWorker } = await import('../src/index.ts');
platform.deregister();
const freshBinding = Object.freeze({ connectionString: 'local-fixture-binding' });
const privacyBinding = Object.freeze({ connectionString: 'local-privacy-fixture-binding' });
const env = { DB_JOBS_FRESH: freshBinding, DB_PRIVACY_FRESH: privacyBinding };
const userId = uuidv7();
const otherId = uuidv7();
const firstSourceId = uuidv7();
const firstEventId = uuidv7();
const evaluation = '2026-10-05T00:00:00.000Z';
const weekIds = Array.from({ length: 5 }, () => uuidv7());
let firstAssessment;
let correctedSource;
let flagGrantExisted = false;

function input(sourceMonth = '2026-08', points = [2200, 1800, 2450, 900, 2000]) {
  return {
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
    periodPolicyVersion: 'closing-sunday-utc-proposal-v1',
    sourceMonth, sourceCutoff: `${nextReputationMonth(sourceMonth)}-01T00:00:00.000Z`,
    weeks: proposedClosingSundayWeeks(sourceMonth).slice(0, points.length).map((week, index) => ({
      weekId: weekIds[index], revision: 1, ownerMonth: week.ownerMonth,
      startsAt: week.startsAt, endsAt: week.endsAt, lockedAt: week.endsAt,
      state: 'locked', points: points[index],
    })),
    monthlyPoints: 2250, quarterlyPoints: 1000,
  };
}

function sourceRequest(overrides = {}) {
  return { id: firstSourceId, subjectUserId: userId, eventId: firstEventId,
    expectedPreviousId: null, reasonCode: 'initial_assessment', input: input(), evaluatedAt: evaluation,
    ...overrides };
}
const record = overrides => transact(client => recordMonthlyReputationSource(client, sourceRequest(overrides)), 'lythaus_jobs');

before(async () => {
  const version = await sql("SELECT current_setting('server_version_num')::integer AS version");
  assert.ok(version.rows[0].version >= 170000 && version.rows[0].version < 180000);
  flagGrantExisted = (await sql("SELECT has_table_privilege('lythaus_jobs', 'system.feature_flags', 'SELECT') AS allowed")).rows[0].allowed;
  await sql(readFileSync(new URL('../../../database/planetscale/proposals/monthly_reputation_shadow.sql', import.meta.url), 'utf8'));
  await sql('INSERT INTO identity.users (id, display_name) VALUES ($1, $3), ($2, $3)', [userId, otherId, 'Synthetic monthly accounting fixture']);
  await sql(`INSERT INTO trust.reputation_profiles (user_id, policy_version, current_level, total_score)
    VALUES ($1, 'reputation-v2.0.0', 2, 60)`, [userId]);
});

after(async () => {
  await sql(`DELETE FROM system.consumer_inbox WHERE event_id IN
    (SELECT id FROM system.outbox_events WHERE actor_id IN ($1, $2))`, [userId, otherId]);
  await sql('DELETE FROM system.outbox_events WHERE actor_id IN ($1, $2)', [userId, otherId]);
  await sql('DELETE FROM system.feature_flags WHERE flag_key = $1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  await sql('DROP TABLE IF EXISTS trust.monthly_reputation_assessments, trust.monthly_reputation_sources');
  await sql('DROP FUNCTION IF EXISTS trust.reject_monthly_reputation_update()');
  if (!flagGrantExisted) await sql('REVOKE SELECT ON system.feature_flags FROM lythaus_jobs');
  await sql('DELETE FROM trust.reputation_profiles WHERE user_id = $1', [userId]);
  await sql('DELETE FROM identity.users WHERE id IN ($1, $2)', [userId, otherId]);
});

test('REL-01: disabled, absent and wrong-version flags stop before new table access through the invoked Jobs adapter', async () => {
  for (const flag of [null, { enabled: false, policy: MONTHLY_REPUTATION_POLICY_VERSION }, { enabled: true, policy: 'old-policy' }]) {
    if (flag) await sql(`INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ($1, $2, $3)
      ON CONFLICT (flag_key) DO UPDATE SET enabled = EXCLUDED.enabled, policy_version = EXCLUDED.policy_version`, [MONTHLY_REPUTATION_SHADOW_FLAG, flag.enabled, flag.policy]);
    statements.length = 0;
    assert.equal(await processMonthlyReputationAssessment(env, firstEventId), null);
    assert.equal(statements.some(text => text.includes('trust.monthly_reputation_')), false);
    await assert.rejects(record(), /shadow_disabled/);
  }
  await sql('UPDATE system.feature_flags SET enabled = true, policy_version = $2 WHERE flag_key = $1', [MONTHLY_REPUTATION_SHADOW_FLAG, MONTHLY_REPUTATION_POLICY_VERSION]);
});

test('T03: source and outbox are atomic, sanitized and idempotent; client roles cannot submit or read shadow evidence', async () => {
  const result = await record({ input: { ...input(), rawEmail: 'never-store@example.invalid' } });
  assert.deepEqual(result, { id: firstSourceId, revision: 1, created: true });
  assert.equal((await record()).created, false);
  const source = await sql('SELECT input FROM trust.monthly_reputation_sources WHERE id = $1', [firstSourceId]);
  assert.equal(source.rows[0].input.rawEmail, undefined);
  assert.equal((await sql('SELECT id FROM system.outbox_events WHERE id = $1', [firstEventId])).rowCount, 1);
  await assert.rejects(record({ input: { ...input(), monthlyPoints: 500 } }), /source_id_reused/);
  await assert.rejects(record({ id: uuidv7(), eventId: uuidv7() }), /revision_conflict/);
  await assert.rejects(record({ id: 'bad' }), /id_invalid/);
  await assert.rejects(record({ reasonCode: 'contains private free text' }), /reason_invalid/);
  await assert.rejects(transact(client => client.query('SELECT * FROM trust.monthly_reputation_sources'), 'lythaus_runtime'), { code: '42501' });
  await assert.rejects(transact(client => client.query('INSERT INTO trust.monthly_reputation_assessments (id) VALUES ($1)', [uuidv7()]), 'lythaus_runtime'), { code: '42501' });
  const rolledBack = uuidv7();
  await assert.rejects(record({ id: rolledBack, expectedPreviousId: firstSourceId }), { code: '23505' });
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_sources WHERE id = $1', [rolledBack])).rowCount, 0);
});

test('CAL-20/REL-02: concurrent queue retries publish one shadow assessment and one result event', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => processMonthlyReputationAssessment(env, firstEventId)));
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  firstAssessment = results[0];
  assert.equal(firstAssessment.mode, 'shadow');
  assert.equal(firstAssessment.calculation.sourceScore, 11700);
  assert.equal(firstAssessment.calculation.weeks[3].selectionReason, 'not_selected_best_four');
  const events = await sql("SELECT id FROM system.outbox_events WHERE aggregate_id = $1 AND event_type = 'trust.monthly_assessment.recorded'", [firstAssessment.id]);
  assert.equal(events.rowCount, 1);
});

test('CAL-12/18/19: corrections append, reselect the previous fifth week and leave historical and current levels intact', async () => {
  const corrected = input();
  Object.assign(corrected.weeks[2], { points: 0, revision: 2, state: 'corrected', lockedAt: '2026-10-01T00:00:00.000Z' });
  const eventId = uuidv7();
  correctedSource = await record({ id: uuidv7(), eventId, expectedPreviousId: firstSourceId, reasonCode: 'upheld_appeal', input: corrected });
  assert.equal(correctedSource.revision, 2);
  const result = await processMonthlyReputationAssessment(env, eventId);
  assert.equal(result.calculation.weeks[3].selected, true);
  assert.equal(result.calculation.weeks[2].selected, false);
  assert.equal(result.calculation.sourceMonth, '2026-08');
  assert.equal(result.calculation.sourceScore, 10150);
  const replay = await processMonthlyReputationAssessment(env, firstEventId);
  assert.equal(replay.id, firstAssessment.id);
  assert.equal(replay.calculation.sourceScore, 11700);
  assert.equal(replay.created, false);
  const historical = await sql('SELECT policy_version, current_level, total_score FROM trust.reputation_profiles WHERE user_id = $1', [userId]);
  assert.deepEqual(historical.rows, [{ policy_version: 'reputation-v2.0.0', current_level: 2, total_score: '60' }]);
  await assert.rejects(sql('UPDATE trust.monthly_reputation_sources SET reason_code = reason_code WHERE id = $1', [firstSourceId]), { code: '55000' });
  await assert.rejects(sql('UPDATE trust.monthly_reputation_assessments SET level = level WHERE id = $1', [firstAssessment.id]), { code: '55000' });
});

test('CAL-20/REL-02: simultaneous corrections use compare-and-swap and result publication rolls back on outbox failure', async () => {
  const requests = [sourceRequest(), sourceRequest()].map(item => ({ ...item,
    id: uuidv7(), eventId: uuidv7(), expectedPreviousId: correctedSource.id, reasonCode: 'corrected_evidence',
  }));
  const results = await Promise.allSettled(requests.map(request => record(request)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /revision_conflict/);
  const accepted = requests[results.findIndex(result => result.status === 'fulfilled')];
  await assert.rejects(transact(client => assessMonthlyReputationSource(client, {
    eventId: accepted.eventId, assessmentId: uuidv7(), resultEventId: firstEventId, evaluatedAt: evaluation,
  }), 'lythaus_jobs'), { code: '23505' });
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments WHERE source_id = $1', [accepted.id])).rowCount, 0);
  assert.equal((await processMonthlyReputationAssessment(env, accepted.eventId)).created, true);
});

test('SEC-01/REL-02: nonexistent, mismatched and cross-subject queue events cannot supply point totals', async () => {
  await assert.rejects(processMonthlyReputationAssessment(env, uuidv7()), /canonical_event_required/);
  const eventId = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, $2, 'monthly_reputation_source', $3, $4, $5::jsonb)`, [eventId, MONTHLY_REPUTATION_REQUEST_EVENT, firstSourceId, otherId, JSON.stringify({ sourceId: firstSourceId, points: 13500 })]);
  await assert.rejects(processMonthlyReputationAssessment(env, eventId), /source_not_found/);
  await sql('UPDATE system.outbox_events SET payload = $2::jsonb WHERE id = $1', [eventId, JSON.stringify({ sourceId: uuidv7() })]);
  await assert.rejects(processMonthlyReputationAssessment(env, eventId), /canonical_event_required/);
  const corruptSourceId = uuidv7();
  const corruptEventId = uuidv7();
  await sql(`INSERT INTO trust.monthly_reputation_sources
    (id, subject_user_id, source_month, policy_version, catalogue_hash, revision, reason_code, input, input_digest)
    VALUES ($1, $2, '2026-08-01', $3, $4, 1, 'integrity_fixture', $5::jsonb, $6)`,
    [corruptSourceId, otherId, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, JSON.stringify(input()), '0'.repeat(64)]);
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, $2, 'monthly_reputation_source', $3, $4, $5::jsonb)`,
    [corruptEventId, MONTHLY_REPUTATION_REQUEST_EVENT, corruptSourceId, otherId, JSON.stringify({ sourceId: corruptSourceId })]);
  await assert.rejects(processMonthlyReputationAssessment(env, corruptEventId), /source_integrity_failed/);
  await sql('DELETE FROM trust.monthly_reputation_sources WHERE id = $1', [corruptSourceId]);
});

function delivery(eventId) {
  const result = { acknowledged: 0, retried: 0 };
  return { result, message: { id: uuidv7(), body: { eventId, eventType: MONTHLY_REPUTATION_REQUEST_EVENT },
    ack: () => result.acknowledged++, retry: () => result.retried++ } };
}

test('REL-02: actual Jobs dispatcher durably defers disabled delivery and accepts the same event after re-enabling', async () => {
  const sourceId = uuidv7(), eventId = uuidv7();
  await record({ id: sourceId, eventId, subjectUserId: otherId });
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  const paused = delivery(eventId);
  await jobsWorker.queue({ queue: 'synthetic-audit', messages: [paused.message] }, env);
  assert.deepEqual(paused.result, { acknowledged: 1, retried: 0 });
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments WHERE source_id = $1', [sourceId])).rowCount, 0);
  assert.equal((await sql('SELECT state FROM system.consumer_inbox WHERE event_id = $1', [eventId])).rowCount, 0);
  assert.equal((await sql('SELECT last_error_code FROM system.outbox_events WHERE id = $1', [eventId])).rows[0].last_error_code, MONTHLY_REPUTATION_PAUSED);
  assert.equal(await reconcileDeferredMonthlyReputation(env), 0);
  const invalid = delivery(uuidv7());
  await jobsWorker.queue({ queue: 'synthetic-audit', messages: [invalid.message] }, env);
  assert.deepEqual(invalid.result, { acknowledged: 0, retried: 1 });
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  for (let attempt = 0; attempt < 2; attempt++) {
    const resumed = delivery(eventId);
    await jobsWorker.queue({ queue: 'synthetic-audit', messages: [resumed.message] }, env);
    assert.deepEqual(resumed.result, { acknowledged: 1, retried: 0 });
  }
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments WHERE source_id = $1', [sourceId])).rowCount, 1);
  assert.equal((await sql('SELECT state FROM system.consumer_inbox WHERE event_id = $1', [eventId])).rows[0].state, 'completed');
  assert.equal((await sql('SELECT last_error_code FROM system.outbox_events WHERE id = $1', [eventId])).rows[0].last_error_code, null);
});

test('REL-02: scheduled reconciliation resumes acknowledged deferrals without Queue redelivery and survives invalid neighbors', async () => {
  const sourceId = uuidv7(), eventId = uuidv7();
  await record({ id: sourceId, eventId, subjectUserId: otherId, input: input('2026-09') });
  await sql('UPDATE system.feature_flags SET enabled = false WHERE flag_key = $1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  const paused = delivery(eventId);
  await jobsWorker.queue({ queue: 'synthetic-audit', messages: [paused.message] }, env);
  assert.deepEqual(paused.result, { acknowledged: 1, retried: 0 });
  const relayed = [];
  const scheduledEnv = { ...env, AUDIT_QUEUE: { send: async body => { relayed.push(body); } } };
  await jobsWorker.scheduled({}, scheduledEnv);
  assert.equal(relayed.some(body => body.eventId === eventId), false);
  assert.equal((await sql('SELECT last_error_code FROM system.outbox_events WHERE id = $1', [eventId])).rows[0].last_error_code, MONTHLY_REPUTATION_PAUSED);
  await sql('UPDATE system.outbox_events SET dispatched_at = now() WHERE id = $1', [eventId]);
  await sql('UPDATE system.feature_flags SET enabled = true WHERE flag_key = $1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  const invalidId = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, last_error_code)
    VALUES ($1, $2, 'monthly_reputation_source', $3, $4, '{}'::jsonb, $5)`,
    [invalidId, MONTHLY_REPUTATION_REQUEST_EVENT, uuidv7(), otherId, MONTHLY_REPUTATION_PAUSED]);
  await jobsWorker.scheduled({}, scheduledEnv);
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments WHERE source_id = $1', [sourceId])).rowCount, 1);
  assert.equal((await sql('SELECT state FROM system.consumer_inbox WHERE event_id = $1', [eventId])).rows[0].state, 'completed');
  await sql('DELETE FROM system.outbox_events WHERE id = $1', [invalidId]);
  assert.equal(await reconcileDeferredMonthlyReputation(env), 0);
  const repeated = delivery(eventId);
  await jobsWorker.queue({ queue: 'synthetic-audit', messages: [repeated.message] }, env);
  assert.deepEqual(repeated.result, { acknowledged: 1, retried: 0 });
});

test('RPT-01/04 partial: stored calculation is exact and authorised privacy erasure removes all dependent shadow rows', async () => {
  const stored = await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE id = $1', [firstAssessment.id]);
  assert.deepEqual(stored.rows[0].calculation, firstAssessment.calculation);
  await transact(client => client.query('DELETE FROM trust.monthly_reputation_sources WHERE subject_user_id IN ($1, $2)', [userId, otherId]), 'lythaus_privacy');
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments')).rowCount, 0);
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_sources')).rowCount, 0);
});
