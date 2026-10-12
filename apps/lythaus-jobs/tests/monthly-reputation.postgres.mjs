import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { after, before, mock, test } from 'node:test';
import pg from 'pg';
import * as database from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import { calculateMonthlyReputation, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, nextReputationMonth } from '@lythaus/contracts';
import { proposedClosingSundayWeeks } from '../../../packages/contracts/src/monthly-reputation-decisions.ts';
import { PROSPECTIVE_REPUTATION_CONFIGURATION, PROSPECTIVE_REPUTATION_POLICY_VERSION,
  PROSPECTIVE_REPUTATION_CATALOGUE_HASH } from '../../../packages/contracts/src/monthly-reputation-prospective.ts';
import {
  assessMonthlyReputationSource, recordMonthlyReputationSource,
  assessPreparedMonthlyReputationSource, recordPreparedMonthlyReputationSource,
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
    const wrapped = { connectionParameters: client.connectionParameters,
      query: (text, values) => { statements.push(text); return client.query(text, values); } };
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
const { processMonthlyReputationAssessment, processPreparedMonthlyReputationAssessment,
  reconcileDeferredMonthlyReputation } = await import('../src/monthly-reputation.ts');
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
let legacySourceId, legacyAssessmentId, legacySource, legacyCalculation;
let preparedSource, preparedRequest, preparedAssessment;
const preparation = Object.freeze({ mode: 'disposable_local_pg17', evaluatedAt: '2030-01-01T00:00:00.000Z' });
const preparationConfiguration = Object.freeze({ ...PROSPECTIVE_REPUTATION_CONFIGURATION,
  prospectiveFrom: '2027-01-01T00:00:00.000Z', firstSourceMonth: '2027-01',
  rubricVersion: 'disposable-useful-suggestion-v1', authorityVersion: 'disposable-independent-review-v1' });

function preparationRequest(overrides = {}) {
  const source = { ...input('2027-01', [2500, 2500, 2500, 2500]), monthlyPoints: 2500 };
  return { id: uuidv7(), eventId: uuidv7(), subjectUserId: userId, expectedPreviousId: null,
    reasonCode: 'disposable_preparation', evaluatedAt: preparation.evaluatedAt,
    preview: { subjectUserId: userId, source, configuration: preparationConfiguration,
      emailEvidence: [{ id: uuidv7(), subjectUserId: userId, performedAt: '2027-01-15T00:00:00.000Z',
        revokedAt: null, facts: { kind: 'email_control', emailVersion: uuidv7() } }],
      suggestionRevisions: [{ eventId: uuidv7(), contributionId: uuidv7(), revision: 1,
        predecessorEventId: null, subjectUserId: userId, reviewerUserId: otherId, privateEvidenceId: uuidv7(),
        amendmentVersion: preparationConfiguration.amendmentVersion,
        performedAt: '2027-01-14T00:00:00.000Z', decidedAt: '2027-01-16T00:00:00.000Z',
        decision: 'accepted', useful: true, independentlyReviewed: true, manipulationScreened: true, competingAward: 'none',
        rubricVersion: preparationConfiguration.rubricVersion,
        authorityVersion: preparationConfiguration.authorityVersion }] }, ...overrides };
}
const prepareRecord = (request, context = preparation) =>
  transact(client => recordPreparedMonthlyReputationSource(client, request, context), 'lythaus_jobs');

async function insertAssessment(sourceId, policy, calculation, id = uuidv7(), explicitPolicy = true) {
  return sql(`INSERT INTO trust.monthly_reputation_assessments
    (id, source_id, calculation, weekly_points, monthly_points, quarterly_points, source_score, level${explicitPolicy ? ', policy_version' : ''})
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8${explicitPolicy ? ',$9' : ''})`,
  [id, sourceId, JSON.stringify(calculation), calculation.weeklyPoints, calculation.monthlyPoints,
    calculation.quarterlyPoints, calculation.sourceScore, calculation.level, ...(explicitPolicy ? [policy] : [])]);
}

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
  const proposal = readFileSync(new URL('../../../database/planetscale/proposals/monthly_reputation_shadow.sql', import.meta.url), 'utf8');
  const [baseline, upgrade] = proposal.split('-- WP08_SOURCE_ASSESSMENT_V2_PREPARATION_UPGRADE');
  assert.ok(upgrade, 'The exact versioned upgrade proposal must be present');
  await sql(baseline);
  await sql('INSERT INTO identity.users (id, display_name) VALUES ($1, $3), ($2, $3)', [userId, otherId, 'Synthetic monthly accounting fixture']);
  await sql(`INSERT INTO trust.reputation_profiles (user_id, policy_version, current_level, total_score)
    VALUES ($1, 'reputation-v2.0.0', 2, 60)`, [userId]);
  await sql('INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES ($1,true,$2)',
    [MONTHLY_REPUTATION_SHADOW_FLAG, MONTHLY_REPUTATION_POLICY_VERSION]);
  legacySourceId = uuidv7();
  const eventId = uuidv7();
  await record({ id: legacySourceId, eventId, input: input('2026-06', [2500,2500,2500,2500]) });
  const assessed = await processMonthlyReputationAssessment(env, eventId);
  legacyAssessmentId = assessed.id;
  legacySource = (await sql('SELECT to_jsonb(source) AS row FROM trust.monthly_reputation_sources source WHERE id=$1', [legacySourceId])).rows[0].row;
  legacyCalculation = assessed.calculation;
  const unavailable = preparationRequest();
  assert.equal(await prepareRecord(unavailable), null, 'V2 must fail closed on the actual legacy schema');
  const corrupt = uuidv7();
  await sql(`INSERT INTO trust.monthly_reputation_sources
    (id,subject_user_id,source_month,policy_version,catalogue_hash,revision,reason_code,input,input_digest)
    VALUES ($1,$2,'2026-07-01',$3,$4,1,'legacy_unknown_catalogue',$5::jsonb,$4)`,
  [corrupt, otherId, MONTHLY_REPUTATION_POLICY_VERSION, '0'.repeat(64), JSON.stringify(input('2026-07'))]);
  await assert.rejects(sql(upgrade), { code: '23514' });
  assert.equal((await sql(`SELECT count(*)::int count FROM pg_attribute
    WHERE attrelid='trust.monthly_reputation_assessments'::regclass AND attname='policy_version' AND NOT attisdropped`)).rows[0].count, 0);
  await sql('DELETE FROM trust.monthly_reputation_sources WHERE id=$1', [corrupt]);
  await sql(upgrade);
  await sql('DELETE FROM system.feature_flags WHERE flag_key=$1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
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

test('I01: upgrade preserves real v1 source/calculation bytes and the legacy default writer', async () => {
  const source = (await sql('SELECT to_jsonb(source) AS row FROM trust.monthly_reputation_sources source WHERE id=$1', [legacySourceId])).rows[0].row;
  assert.deepEqual(source, legacySource);
  const assessed = (await sql('SELECT calculation,policy_version FROM trust.monthly_reputation_assessments WHERE id=$1', [legacyAssessmentId])).rows[0];
  assert.deepEqual(assessed.calculation, legacyCalculation);
  assert.equal(assessed.policy_version, MONTHLY_REPUTATION_POLICY_VERSION);
  const request = sourceRequest({ id: uuidv7(), eventId: uuidv7(), input: input('2026-04') });
  await record(request);
  await insertAssessment(request.id, MONTHLY_REPUTATION_POLICY_VERSION,
    calculateMonthlyReputation(request.input, request.evaluatedAt), uuidv7(), false);
  assert.equal((await sql('SELECT policy_version FROM trust.monthly_reputation_assessments WHERE source_id=$1', [request.id])).rows[0].policy_version, MONTHLY_REPUTATION_POLICY_VERSION);
  const keys = (await sql(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='trust.monthly_reputation_sources'::regclass AND contype IN ('u','f')`)).rows.map(row => row.definition);
  assert.ok(keys.includes('UNIQUE (subject_user_id, source_month, policy_version, revision)'));
  assert.ok(keys.some(key => key.startsWith('FOREIGN KEY (supersedes_id, subject_user_id, source_month, policy_version)')));
});

test('I08/I12: missing context/schema, disabled flags and invalid local targets cannot activate preparation', async () => {
  const request = preparationRequest();
  statements.length = 0;
  assert.equal(await transact(client => recordPreparedMonthlyReputationSource(client, request), 'lythaus_jobs'), null);
  assert.equal(await processPreparedMonthlyReputationAssessment(env, request.eventId), null);
  assert.equal(statements.length, 0);
  for (const [enabled, policy] of [[false, MONTHLY_REPUTATION_POLICY_VERSION], [true, PROSPECTIVE_REPUTATION_POLICY_VERSION]]) {
    await sql('UPDATE system.feature_flags SET enabled=$2,policy_version=$3 WHERE flag_key=$1', [MONTHLY_REPUTATION_SHADOW_FLAG, enabled, policy]);
    statements.length = 0;
    assert.equal(await prepareRecord(request), null);
    assert.equal(statements.some(text => text.includes('trust.monthly_reputation_')), false);
  }
  await sql('UPDATE system.feature_flags SET enabled=true,policy_version=$2 WHERE flag_key=$1', [MONTHLY_REPUTATION_SHADOW_FLAG, MONTHLY_REPUTATION_POLICY_VERSION]);
  await assert.rejects(prepareRecord(request, { mode: 'production' }), /disposable_local_target/);
  await assert.rejects(transact(client => recordPreparedMonthlyReputationSource({ ...client,
    connectionParameters: { host: 'provider.invalid', database: 'postgres' } }, request, preparation), 'lythaus_jobs'), /disposable_local_target/);
  await transact(async client => {
    await client.query('ALTER TABLE trust.monthly_reputation_assessments RENAME COLUMN policy_version TO fixture_unavailable');
    assert.equal(await recordPreparedMonthlyReputationSource(client, request, preparation), null);
    await client.query('ALTER TABLE trust.monthly_reputation_assessments RENAME COLUMN fixture_unavailable TO policy_version');
  });
  const pending = { ...request, preview: { ...request.preview, configuration: PROSPECTIVE_REPUTATION_CONFIGURATION } };
  assert.equal(await prepareRecord(pending), null);
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_sources WHERE id=$1', [request.id])).rowCount, 0);
});

test('I02/I04: reviewed preview admission and invoked Jobs preparation retries commit one versioned zero-applied assessment', async () => {
  preparedRequest = preparationRequest();
  preparedRequest.preview.source.rawEmail = 'discard-me@example.invalid';
  preparedRequest.preview.source.quarterlyPoints = 999999;
  const records = await Promise.all(Array.from({ length: 4 }, () => prepareRecord(preparedRequest)));
  assert.equal(records.filter(row => row.created).length, 1);
  preparedSource = records[0];
  const results = await Promise.all(Array.from({ length: 6 }, () => processPreparedMonthlyReputationAssessment(env, preparedRequest.eventId, preparation)));
  assert.equal(results.filter(row => row.created).length, 1);
  assert.equal(new Set(results.map(row => row.id)).size, 1);
  preparedAssessment = results[0];
  assert.equal(preparedAssessment.calculation.sourceScore, 13650);
  assert.equal(preparedAssessment.calculation.level, 5);
  assert.equal(preparedAssessment.calculation.quarterlyPoints, 1150);
  assert.equal(preparedAssessment.calculation.emailPoints, 1000);
  assert.equal(preparedAssessment.calculation.suggestionPoints, 150);
  assert.equal(preparedAssessment.calculation.policyVersion, PROSPECTIVE_REPUTATION_POLICY_VERSION);
  assert.equal(preparedAssessment.appliedPoints, 0);
  assert.equal(preparedAssessment.runtimeActivationAllowed, false);
  const row = (await sql('SELECT input,catalogue_hash,policy_version FROM trust.monthly_reputation_sources WHERE id=$1', [preparedSource.id])).rows[0];
  assert.equal(row.catalogue_hash, PROSPECTIVE_REPUTATION_CATALOGUE_HASH);
  assert.equal(row.policy_version, PROSPECTIVE_REPUTATION_POLICY_VERSION);
  assert.equal(row.input.preparationOnly, true);
  for (const privateKey of ['rawEmail', 'emailEvidence', 'suggestionRevisions', 'privateEvidenceId', 'reviewerUserId']) assert.equal(Object.hasOwn(row.input, privateKey), false);
  assert.equal((await sql("SELECT id FROM system.outbox_events WHERE aggregate_id=$1 AND event_type='trust.monthly_assessment.recorded'", [preparedAssessment.id])).rowCount, 1);
  assert.equal(await processMonthlyReputationAssessment(env, preparedRequest.eventId), null);
  await assert.rejects(prepareRecord({ ...preparedRequest, id: firstSourceId }), /source_id_reused/);
  const changed = structuredClone(preparedRequest);
  changed.preview.emailEvidence = [];
  await assert.rejects(prepareRecord(changed), /source_id_reused/);
  assert.deepEqual((await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE id=$1', [firstAssessment.id])).rows[0].calculation, firstAssessment.calculation);
});

test('I02/I04/I07: all quarterly component combinations reuse whole-week validation and correction CAS', async () => {
  let previous = preparedSource;
  for (const [email, suggestion, expected] of [[false,false,0], [false,true,150], [true,false,1000]]) {
    const request = preparationRequest({ expectedPreviousId: previous.id });
    if (!email) request.preview.emailEvidence = [];
    if (!suggestion) request.preview.suggestionRevisions = [];
    previous = await prepareRecord(request);
    const result = await processPreparedMonthlyReputationAssessment(env, request.eventId, preparation);
    assert.equal(result.calculation.quarterlyPoints, expected);
    assert.equal(result.calculation.sourceScore, 12500 + expected);
    assert.equal(result.calculation.level, 5);
  }
  const source = { ...input('2027-01', [2000,2000,2000,2000,2000]), monthlyPoints: 2500 };
  const request = preparationRequest({ expectedPreviousId: previous.id });
  request.preview.source = source;
  previous = await prepareRecord(request);
  const tied = await processPreparedMonthlyReputationAssessment(env, request.eventId, preparation);
  assert.deepEqual(tied.calculation.selectedWeekIds, weekIds.slice(0,4));
  const corrected = structuredClone(request);
  corrected.id = uuidv7(); corrected.eventId = uuidv7(); corrected.expectedPreviousId = previous.id;
  Object.assign(corrected.preview.source.weeks[0], { points: 0, revision: 2, state: 'corrected' });
  const contenders = [corrected, { ...corrected, id: uuidv7(), eventId: uuidv7() }];
  const raced = await Promise.allSettled(contenders.map(row => prepareRecord(row)));
  assert.equal(raced.filter(row => row.status === 'fulfilled').length, 1);
  assert.match(raced.find(row => row.status === 'rejected').reason.message, /revision_conflict/);
  const accepted = contenders[raced.findIndex(row => row.status === 'fulfilled')];
  await assert.rejects(transact(client => assessPreparedMonthlyReputationSource(client, {
    eventId: accepted.eventId, assessmentId: uuidv7(), resultEventId: firstEventId, evaluatedAt: preparation.evaluatedAt,
  }, preparation), 'lythaus_jobs'), { code: '23505' });
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments WHERE source_id=$1', [accepted.id])).rowCount, 0);
  const result = await processPreparedMonthlyReputationAssessment(env, accepted.eventId, preparation);
  assert.deepEqual(result.calculation.selectedWeekIds, weekIds.slice(1));
  assert.equal((await processPreparedMonthlyReputationAssessment(env, accepted.eventId, preparation)).created, false);
});

test('I03: SQL rejects mixed policies/catalogues and missing/null/forged quarterly components independently of the adapter', async () => {
  const latest = (await sql(`SELECT id FROM trust.monthly_reputation_sources
    WHERE subject_user_id=$1 AND source_month='2027-01-01' AND policy_version=$2 ORDER BY revision DESC LIMIT 1`, [userId, PROSPECTIVE_REPUTATION_POLICY_VERSION])).rows[0];
  const request = preparationRequest({ expectedPreviousId: latest.id });
  const source = await prepareRecord(request);
  const base = preparedAssessment.calculation;
  await assert.rejects(insertAssessment(source.id, MONTHLY_REPUTATION_POLICY_VERSION, legacyCalculation), { code: '23503' });
  await assert.rejects(insertAssessment(source.id, MONTHLY_REPUTATION_POLICY_VERSION, legacyCalculation, uuidv7(), false), { code: '23503' });
  const v1 = await record({ id: uuidv7(), eventId: uuidv7(), input: input('2026-05') });
  await assert.rejects(insertAssessment(v1.id, PROSPECTIVE_REPUTATION_POLICY_VERSION, base), { code: '23503' });
  await assert.rejects(insertAssessment(v1.id, MONTHLY_REPUTATION_POLICY_VERSION,
    { ...legacyCalculation, quarterlyPoints: 150, sourceScore: legacyCalculation.weeklyPoints + legacyCalculation.monthlyPoints + 150 }), { code: '23514' });
  for (const patch of [{ emailPoints: null }, { suggestionPoints: null }, { emailPoints: '1000' },
    { emailPoints: true }, { emailPoints: 1001 }, { suggestionPoints: 151 }, { preparationOnly: null },
    { policyVersion: MONTHLY_REPUTATION_POLICY_VERSION }, { quarterlyPoints: 1000, sourceScore: 13500 },
    { sourceScore: 13651 }, { policyVersion: 'unknown-policy' }]) {
    await assert.rejects(insertAssessment(source.id, PROSPECTIVE_REPUTATION_POLICY_VERSION, { ...base, ...patch }), { code: '23514' });
  }
  for (const key of ['emailPoints', 'suggestionPoints', 'preparationOnly', 'policyVersion']) {
    const missing = { ...base }; delete missing[key];
    await assert.rejects(insertAssessment(source.id, PROSPECTIVE_REPUTATION_POLICY_VERSION, missing), { code: '23514' });
  }
  const original = (await sql('SELECT input FROM trust.monthly_reputation_sources WHERE id=$1', [source.id])).rows[0].input;
  const insertSource = (policy, hash, value) => sql(`INSERT INTO trust.monthly_reputation_sources
    (id,subject_user_id,source_month,policy_version,catalogue_hash,revision,reason_code,input,input_digest)
    VALUES ($1,$2,'2027-01-01',$3,$4,1,'invalid_fixture',$5::jsonb,$6)`,
  [uuidv7(), otherId, policy, hash, JSON.stringify(value), '0'.repeat(64)]);
  for (const hash of [MONTHLY_REPUTATION_CATALOGUE_HASH, '0'.repeat(64)]) {
    await assert.rejects(insertSource(PROSPECTIVE_REPUTATION_POLICY_VERSION, hash, original), { code: '23514' });
  }
  await assert.rejects(insertSource(MONTHLY_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
    { ...original, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION }), { code: '23514' });
  for (const patch of [{ emailPoints: null }, { suggestionPoints: null }, { emailPoints: '1000' }, { quarterlyPoints: null }]) {
    await assert.rejects(insertSource(PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH, { ...original, ...patch }), { code: '23514' });
  }
  await insertAssessment(source.id, PROSPECTIVE_REPUTATION_POLICY_VERSION, base);
  await assert.rejects(sql('UPDATE trust.monthly_reputation_assessments SET policy_version=policy_version WHERE source_id=$1', [source.id]), { code: '55000' });
});

test('I01/I07: a v1 correction after v2 remains on its own lineage; cross-policy supersession is rejected', async () => {
  const latest = (await sql(`SELECT id,revision FROM trust.monthly_reputation_sources
    WHERE subject_user_id=$1 AND source_month='2026-08-01' AND policy_version=$2 ORDER BY revision DESC LIMIT 1`, [userId, MONTHLY_REPUTATION_POLICY_VERSION])).rows[0];
  const request = sourceRequest({ id: uuidv7(), eventId: uuidv7(), expectedPreviousId: latest.id, reasonCode: 'v1_correction_after_v2' });
  const corrected = await record(request);
  assert.equal(corrected.revision, latest.revision + 1);
  assert.equal((await processMonthlyReputationAssessment(env, request.eventId)).calculation.policyVersion, MONTHLY_REPUTATION_POLICY_VERSION);
  assert.deepEqual((await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE id=$1', [preparedAssessment.id])).rows[0].calculation, preparedAssessment.calculation);
  const januaryV1 = await record({ id: uuidv7(), eventId: uuidv7(), input: input('2027-01'), evaluatedAt: preparation.evaluatedAt });
  const next = (await sql(`SELECT input,revision FROM trust.monthly_reputation_sources
    WHERE subject_user_id=$1 AND source_month='2027-01-01' AND policy_version=$2 ORDER BY revision DESC LIMIT 1`, [userId, PROSPECTIVE_REPUTATION_POLICY_VERSION])).rows[0];
  await assert.rejects(sql(`INSERT INTO trust.monthly_reputation_sources
    (id,subject_user_id,source_month,policy_version,catalogue_hash,revision,supersedes_id,reason_code,input,input_digest)
    VALUES ($1,$2,'2027-01-01',$3,$4,$5,$6,'mixed_policy_successor',$7::jsonb,$8)`,
  [uuidv7(), userId, PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
    next.revision + 1, januaryV1.id, JSON.stringify(next.input), '0'.repeat(64)]), { code: '23503' });
  await assert.rejects(prepareRecord(preparationRequest({ expectedPreviousId: januaryV1.id })), /revision_conflict/);
});

test('I03/I06: prepared assessment binds canonical actor/policy/digest and admission rejects client evidence claims', async () => {
  for (const patch of [{ reviewerUserId: userId }, { subjectUserId: otherId }, { points: 150 }, { authorityVersion: 'unapproved' }]) {
    const request = preparationRequest();
    Object.assign(request.preview.suggestionRevisions[0], patch);
    await assert.rejects(prepareRecord(request), /suggestion_evidence/);
    assert.equal((await sql('SELECT id FROM trust.monthly_reputation_sources WHERE id=$1', [request.id])).rowCount, 0);
  }
  const eventId = uuidv7();
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,$2,'monthly_reputation_source',$3,$4,$5::jsonb)`,
  [eventId, MONTHLY_REPUTATION_REQUEST_EVENT, preparedSource.id, otherId,
    JSON.stringify({ sourceId: preparedSource.id, policyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION, points: 13650 })]);
  await assert.rejects(processPreparedMonthlyReputationAssessment(env, eventId, preparation), /source_not_found/);
  await sql('UPDATE system.outbox_events SET actor_id=$2,payload=$3::jsonb WHERE id=$1', [eventId, userId,
    JSON.stringify({ sourceId: preparedSource.id, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION })]);
  await assert.rejects(processPreparedMonthlyReputationAssessment(env, eventId, preparation), /event_policy_mismatch/);
  await assert.rejects(processMonthlyReputationAssessment(env, eventId), /source_not_found/);
  await sql('UPDATE system.outbox_events SET payload=$2::jsonb WHERE id=$1', [eventId,
    JSON.stringify({ sourceId: preparedSource.id, policyVersion: 'unknown-policy' })]);
  await assert.rejects(processMonthlyReputationAssessment(env, eventId), /event_policy_mismatch/);
  const corruptId = uuidv7(), corruptEventId = uuidv7();
  const value = (await sql('SELECT input FROM trust.monthly_reputation_sources WHERE id=$1', [preparedSource.id])).rows[0].input;
  await sql(`INSERT INTO trust.monthly_reputation_sources
    (id,subject_user_id,source_month,policy_version,catalogue_hash,revision,reason_code,input,input_digest)
    VALUES ($1,$2,'2027-01-01',$3,$4,1,'corrupt_digest_fixture',$5::jsonb,$6)`,
  [corruptId, otherId, PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH, JSON.stringify(value), '0'.repeat(64)]);
  await sql(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,$2,'monthly_reputation_source',$3,$4,$5::jsonb)`,
  [corruptEventId, MONTHLY_REPUTATION_REQUEST_EVENT, corruptId, otherId,
    JSON.stringify({ sourceId: corruptId, policyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION })]);
  await assert.rejects(processPreparedMonthlyReputationAssessment(env, corruptEventId, preparation), /source_integrity_failed/);
  await sql('DELETE FROM trust.monthly_reputation_sources WHERE id=$1', [corruptId]);
});

test('I05/I06: private preview qualification preserves quarter boundaries, duplicate/order behavior and pending causal reversals', async () => {
  const accepted = preparationRequest();
  const revision = accepted.preview.suggestionRevisions[0];
  const reversal = { ...revision, eventId: uuidv7(), revision: 2, predecessorEventId: revision.eventId,
    decision: 'reversed', decidedAt: '2027-02-15T00:00:00.000Z' };
  accepted.preview.suggestionRevisions = [revision, reversal];
  const before = (await sql('SELECT count(*)::int count FROM trust.monthly_reputation_sources')).rows[0].count;
  assert.equal(await prepareRecord(accepted), null, 'Closing-month correction timing remains unapproved');
  accepted.preview.suggestionRevisions = [revision, { ...reversal, decidedAt: '2027-01-15T00:00:00.000Z' }];
  await assert.rejects(prepareRecord(accepted), /causality/);
  assert.equal((await sql('SELECT count(*)::int count FROM trust.monthly_reputation_sources')).rows[0].count, before);
  const february = preparationRequest();
  february.preview.source = { ...input('2027-02', [2500,2500,2500,2500]), monthlyPoints: 2500 };
  february.preview.suggestionRevisions = [reversal, revision, revision];
  const result = await prepareRecord(february);
  const assessed = await processPreparedMonthlyReputationAssessment(env, february.eventId, preparation);
  assert.equal(assessed.calculation.quarterlyPoints, 1000);
  const reordered = { ...february, preview: { ...february.preview, suggestionRevisions: [revision, reversal] } };
  assert.equal((await prepareRecord(reordered)).created, false);
  assert.equal(result.created, true);
  const april = preparationRequest();
  april.preview.source = { ...input('2027-04', [2500,2500,2500,2500]), monthlyPoints: 2500 };
  await prepareRecord(april);
  const expired = await processPreparedMonthlyReputationAssessment(env, april.eventId, preparation);
  assert.equal(expired.calculation.quarterlyPoints, 0);
  assert.equal(expired.calculation.sourceScore, 12500);
  assert.equal(expired.calculation.effectiveMonth, '2027-05');
  assert.deepEqual((await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE id=$1', [preparedAssessment.id])).rows[0].calculation, preparedAssessment.calculation);
});

test('I08/I12: actual dispatcher defers preparation and bounded reconciliation skips 26 v2 neighbors to resume v1', async () => {
  let previous = null;
  const events = [];
  for (let index = 0; index < 26; index += 1) {
    const request = preparationRequest({ expectedPreviousId: previous });
    request.preview.source = { ...input('2027-07', [2500,2500,2500,2500]), monthlyPoints: 2500 };
    const recorded = await prepareRecord(request); previous = recorded.id;
    const deferred = delivery(request.eventId);
    await jobsWorker.queue({ queue: 'synthetic-audit', messages: [deferred.message] }, env);
    assert.deepEqual(deferred.result, { acknowledged: 1, retried: 0 });
    events.push(request.eventId);
  }
  const id = uuidv7(), eventId = uuidv7();
  await record({ id, eventId, subjectUserId: otherId, input: input('2026-05') });
  await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  await jobsWorker.queue({ queue: 'synthetic-audit', messages: [delivery(eventId).message] }, env);
  await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1', [MONTHLY_REPUTATION_SHADOW_FLAG]);
  const legacyBatch = (await sql(`SELECT id FROM system.outbox_events WHERE event_type=$1 AND last_error_code=$2
    ORDER BY created_at,id LIMIT 25`, [MONTHLY_REPUTATION_REQUEST_EVENT, MONTHLY_REPUTATION_PAUSED])).rows;
  assert.equal(legacyBatch.length, 25);
  assert.ok(legacyBatch.every(row => events.includes(row.id)), 'The former bounded query would never reach the v1 neighbor');
  assert.equal(await reconcileDeferredMonthlyReputation(env), 1);
  assert.equal(await reconcileDeferredMonthlyReputation(env), 0);
  assert.equal((await sql('SELECT state FROM system.consumer_inbox WHERE event_id=$1', [eventId])).rows[0].state, 'completed');
  assert.equal((await sql('SELECT count(*)::int count FROM system.outbox_events WHERE id=ANY($1::uuid[]) AND last_error_code=$2', [events, MONTHLY_REPUTATION_PAUSED])).rows[0].count, 26);
  assert.equal((await sql(`SELECT count(*)::int count FROM trust.monthly_reputation_assessments assessment
    JOIN trust.monthly_reputation_sources source ON source.id=assessment.source_id WHERE source.source_month='2027-07-01'`)).rows[0].count, 0);
});

test('I03/I10/I11/I12 partial: invalid accounts and private access fail; deletion races leave no prepared source', async () => {
  const scoped = id => {
    const request = preparationRequest({ subjectUserId: id });
    request.preview.subjectUserId = id;
    request.preview.emailEvidence[0].subjectUserId = id;
    request.preview.suggestionRevisions[0].subjectUserId = id;
    return request;
  };
  await assert.rejects(prepareRecord(scoped(uuidv7())), /subject_unavailable/);
  const wrong = preparationRequest({ subjectUserId: otherId });
  await assert.rejects(prepareRecord(wrong), /subject_mismatch/);
  const deleted = uuidv7();
  await sql("INSERT INTO identity.users(id,status,deleted_at,display_name) VALUES ($1,'deleted',now(),'Synthetic deleted fixture')", [deleted]);
  await assert.rejects(prepareRecord(scoped(deleted)), /subject_unavailable/);
  await sql('DELETE FROM identity.users WHERE id=$1', [deleted]);
  await assert.rejects(transact(client => client.query('SELECT input FROM trust.monthly_reputation_sources WHERE policy_version=$1', [PROSPECTIVE_REPUTATION_POLICY_VERSION]), 'lythaus_runtime'), { code: '42501' });
  await assert.rejects(transact(client => client.query('SELECT calculation FROM trust.monthly_reputation_assessments WHERE policy_version=$1', [PROSPECTIVE_REPUTATION_POLICY_VERSION]), 'lythaus_runtime'), { code: '42501' });
  const temporary = uuidv7();
  await sql('INSERT INTO identity.users(id,display_name) VALUES ($1,$2)', [temporary, 'Synthetic concurrent deletion fixture']);
  const request = scoped(temporary);
  const raced = await Promise.allSettled([prepareRecord(request), sql('DELETE FROM identity.users WHERE id=$1', [temporary])]);
  assert.equal(raced[1].status, 'fulfilled');
  if (raced[0].status === 'rejected') assert.ok(raced[0].reason.code === '23503' || /subject_unavailable/.test(raced[0].reason.message));
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_sources WHERE subject_user_id=$1', [temporary])).rowCount, 0);
  await sql('DELETE FROM system.outbox_events WHERE id=$1', [request.eventId]);
  assert.equal(await processPreparedMonthlyReputationAssessment(env, preparedRequest.eventId), null);
  assert.deepEqual((await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE id=$1', [preparedAssessment.id])).rows[0].calculation, preparedAssessment.calculation);
  assert.deepEqual((await sql('SELECT policy_version,current_level,total_score FROM trust.reputation_profiles WHERE user_id=$1', [userId])).rows,
    [{ policy_version: 'reputation-v2.0.0', current_level: 2, total_score: '60' }]);
});

test('RPT-01/04 partial: stored calculation is exact and authorised privacy erasure removes all dependent shadow rows', async () => {
  const stored = await sql('SELECT calculation FROM trust.monthly_reputation_assessments WHERE id = $1', [firstAssessment.id]);
  assert.deepEqual(stored.rows[0].calculation, firstAssessment.calculation);
  await transact(client => client.query('DELETE FROM trust.monthly_reputation_sources WHERE subject_user_id IN ($1, $2)', [userId, otherId]), 'lythaus_privacy');
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_assessments')).rowCount, 0);
  assert.equal((await sql('SELECT id FROM trust.monthly_reputation_sources')).rowCount, 0);
});
