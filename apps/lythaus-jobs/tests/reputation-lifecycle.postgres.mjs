import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { uuidv7 } from '../../../packages/security/src/index.ts';
import { recordReputationSignal, transaction } from '../../../packages/db/src/index.ts';
import { rollbackResponseProxy, fixtureHost, localFixtureDns } from '../../../packages/db/tests/transaction-socket-fixture.mjs';
import { loadJobsModule } from './helpers/load-jobs-module.mjs';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.match(target.pathname, /^\/lythaus_auth_test_rep_lock_[a-f0-9]{32}$/);
assert.equal(target.search, '');
assert.equal(target.hash, '');

const proposal = readFileSync(new URL('../../../database/planetscale/proposals/reputation_subject_lock.v2.sql.proposal', import.meta.url), 'utf8');
const proxies = new Set();
let observer, jobs, restoreDns;

function binding(role, port = target.port) {
  const url = new URL(target);
  url.hostname = fixtureHost;
  url.port = String(port || 5432);
  url.username = role;
  url.password = '';
  url.search = '';
  url.searchParams.set('sslmode', 'disable');
  url.searchParams.set('application_name', 'lythaus_reputation_lifecycle_fixture');
  return { connectionString: url.href };
}

function env(jobsBinding = binding('pscale_api_9jfbtij9y4b2')) {
  return {
    DB_JOBS_FRESH: jobsBinding,
    DB_PRIVACY_FRESH: binding('lythaus_privacy'),
    AUTHENTICITY_BETA_STORAGE_ENABLED: 'false',
    PRIVATE_EXPORTS: { async list() { return { objects: [], truncated: false }; }, async delete() {} },
    MEDIA_APPROVED: { async delete() {} },
    MEDIA_QUARANTINE: { async delete() {} },
  };
}

function message(eventId, eventType, payload) {
  const calls = { ack: 0, retry: 0 };
  return {
    calls,
    value: { id: eventId, body: { eventId, eventType, payload, correlationId: eventId },
      ack() { calls.ack += 1; }, retry() { calls.retry += 1; } },
  };
}

async function queueOne(item, bindings) {
  await jobs.default.queue({ queue: 'lythaus-reputation-fixture', messages: [item.value] }, bindings);
}

async function addSubject(status = 'active') {
  const id = uuidv7();
  await observer.query('INSERT INTO identity.users(id,display_name,status) VALUES($1,$2,$3)',
    [id, 'Synthetic reputation lifecycle fixture', status]);
  return id;
}

async function addOutboxEvent(eventId, eventType, subjectId, payload) {
  await observer.query(`INSERT INTO system.outbox_events
    (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES($1,$2,'synthetic',$3,$4,$5::jsonb)`,
  [eventId, eventType, subjectId, subjectId, JSON.stringify(payload)]);
}

async function seedReputation(subjectId) {
  const sourceEventId = uuidv7();
  return transaction(binding('pscale_api_9jfbtij9y4b2'), client => recordReputationSignal(client, {
    id: uuidv7(), subjectUserId: subjectId, signalType: 'email_verified',
    sourceEventId, occurredAt: '2026-10-15T19:00:00.000Z',
  }));
}

async function addDeleteRequest(subjectId) {
  const requestId = uuidv7();
  await observer.query(`INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,'delete')`, [requestId, subjectId]);
  return requestId;
}

function stepJournal(journal = new Map(), { failAfter, afterSuccess } = {}) {
  return {
    journal,
    async do(name, ...args) {
      if (journal.has(name)) return journal.get(name);
      const result = await args.at(-1)();
      await afterSuccess?.(name, result);
      if (name === failAfter) throw new Error('synthetic_workflow_restart_after_' + name);
      journal.set(name, result);
      return result;
    },
    async sleep(name) {
      if (!journal.has(name)) journal.set(name, true);
    },
  };
}

async function runDelete(subjectId, requestId, steps) {
  const workflow = new jobs.AccountDeleteWorkflow({}, env());
  return workflow.run({ payload: { subjectId, requestId }, instanceId: uuidv7() }, steps);
}

async function count(sql, values) {
  return Number((await observer.query(sql, values)).rows[0].count);
}

async function assertNoFixtureBackends() {
  assert.equal(await count(`SELECT count(*) AS count FROM pg_stat_activity
    WHERE datname=current_database() AND usename IN ('pscale_api_9jfbtij9y4b2','lythaus_privacy')
      AND application_name='lythaus_reputation_lifecycle_fixture'`, []), 0);
}

before(async () => {
  observer = new pg.Client({ connectionString: target.href, ssl: false });
  await observer.connect();
  assert.match((await observer.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  restoreDns = localFixtureDns();
  const installed = (await observer.query("SELECT to_regprocedure('trust.lock_reputation_subject(uuid)') AS fn")).rows[0].fn;
  if (!installed) {
    const body = proposal.split('BEGIN REPUTATION LOCK CANDIDATE\n')[1].split('END REPUTATION LOCK CANDIDATE')[0];
    const owner = new pg.Client({ connectionString: target.href, ssl: false });
    await owner.connect();
    try {
      await owner.query('SET SESSION AUTHORIZATION postgres');
      await owner.query(body);
    } finally { await owner.end(); }
  }
  jobs = await loadJobsModule();
  assert.equal(typeof jobs.default.queue, 'function');
  assert.equal(typeof jobs.AccountDeleteWorkflow, 'function');
});

after(async () => {
  for (const proxy of proxies) { proxy.release(); await proxy.close(); }
  restoreDns?.();
  await observer?.end();
});

test('dispatcher retries a deleted subject when real rollback acknowledgement is lost, then safely replays', async () => {
  const subjectId = await addSubject('deleted'), eventId = uuidv7();
  await addOutboxEvent(eventId, 'identity.account.status_changed', subjectId, { userId: subjectId });
  const proxy = await rollbackResponseProxy(target, 'drop_before_commit'); proxies.add(proxy);
  const first = message(eventId, 'identity.account.status_changed', { userId: subjectId });
  try {
    await queueOne(first, env(binding('pscale_api_9jfbtij9y4b2', proxy.port)));
    assert.equal(proxy.commitSeen, true);
    assert.equal(proxy.responseDropped, true);
    assert.equal(first.calls.ack, 0);
    assert.equal(first.calls.retry, 1);
    assert.equal(await count(`SELECT count(*) AS count FROM system.consumer_inbox WHERE consumer_name='lythaus-jobs' AND event_id=$1`, [eventId]), 0);
    assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_events WHERE subject_user_id=$1', [subjectId]), 0);

    const replay = message(eventId, 'identity.account.status_changed', { userId: subjectId });
    await queueOne(replay, env());
    assert.equal(replay.calls.ack, 1);
    assert.equal(replay.calls.retry, 0);
    assert.equal((await observer.query(`SELECT state FROM system.consumer_inbox
      WHERE consumer_name='lythaus-jobs' AND event_id=$1`, [eventId])).rows[0].state, 'completed');
    await assertNoFixtureBackends();
  } finally { await proxy.close(); proxies.delete(proxy); }
});

test('dispatcher holds ack through a stalled real close and serializes concurrent replay', async () => {
  const subjectId = await addSubject('deleted'), eventId = uuidv7();
  await addOutboxEvent(eventId, 'identity.account.status_changed', subjectId, { userId: subjectId });
  const proxy = await rollbackResponseProxy(target, 'stall_after_acknowledgement'); proxies.add(proxy);
  const first = message(eventId, 'identity.account.status_changed', { userId: subjectId });
  const running = queueOne(first, env(binding('pscale_api_9jfbtij9y4b2', proxy.port)));
  try {
    await proxy.stalled;
    assert.equal(proxy.commandObserved, 'ROLLBACK');
    assert.equal(proxy.acknowledged, true);
    assert.equal(proxy.terminationSeen, true);
    await assertNoFixtureBackends();
    assert.equal(first.calls.ack, 0);
    assert.equal(first.calls.retry, 0);
    assert.equal((await observer.query(`SELECT state FROM system.consumer_inbox
      WHERE consumer_name='lythaus-jobs' AND event_id=$1`, [eventId])).rows[0].state, 'processing');

    const concurrent = message(eventId, 'identity.account.status_changed', { userId: subjectId });
    await queueOne(concurrent, env());
    assert.equal(concurrent.calls.ack, 0);
    assert.equal(concurrent.calls.retry, 1);
    assert.equal(first.calls.ack, 0);

    proxy.release();
    await running;
    assert.equal(first.calls.ack, 1);
    assert.equal(first.calls.retry, 0);
    assert.equal((await observer.query(`SELECT state FROM system.consumer_inbox
      WHERE consumer_name='lythaus-jobs' AND event_id=$1`, [eventId])).rows[0].state, 'completed');
    await assertNoFixtureBackends();

    const replay = message(eventId, 'identity.account.status_changed', { userId: subjectId });
    await queueOne(replay, env());
    assert.equal(replay.calls.ack, 1);
    assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_events WHERE subject_user_id=$1', [subjectId]), 0);
  } finally {
    proxy.release();
    await running.catch(() => undefined);
    await proxy.close(); proxies.delete(proxy);
  }
});

test('privacy restart retries failed final balance cleanup before tombstone completion', async () => {
  const subjectId = await addSubject(), requestId = await addDeleteRequest(subjectId);
  const signal = await seedReputation(subjectId);
  const journal = new Map();
  const suffix = uuidv7().replaceAll('-', '');
  const trigger = 'fixture_balance_delete_' + suffix;
  const triggerFunction = 'fixture_balance_failure_' + suffix;
  let injected = false;
  try {
    const first = stepJournal(journal, { afterSuccess: async name => {
      if (name !== 'redact-authoritative-content' || injected) return;
      injected = true;
      await observer.query(`INSERT INTO trust.reputation_balances(user_id,points) VALUES($1,42)`, [subjectId]);
      await observer.query(`CREATE FUNCTION public.${triggerFunction}() RETURNS trigger LANGUAGE plpgsql AS $body$
        BEGIN RAISE EXCEPTION 'synthetic_reputation_balance_delete_failure'; END; $body$`);
      await observer.query(`CREATE TRIGGER ${trigger} BEFORE DELETE ON trust.reputation_balances
        FOR EACH ROW EXECUTE FUNCTION public.${triggerFunction}()`);
    } });
    await assert.rejects(runDelete(subjectId, requestId, first), /synthetic_reputation_balance_delete_failure/);
    assert.equal((await observer.query('SELECT status FROM identity.users WHERE id=$1', [subjectId])).rows[0].status, 'deleted');
    assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_balances WHERE user_id=$1', [subjectId]), 1);
    assert.equal(await count('SELECT count(*) AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [subjectId]), 0);
    assert.notEqual((await observer.query('SELECT state FROM privacy.requests WHERE id=$1', [requestId])).rows[0].state, 'completed');

    await observer.query(`DROP TRIGGER ${trigger} ON trust.reputation_balances`);
    await observer.query(`DROP FUNCTION public.${triggerFunction}()`);
    const resumed = await runDelete(subjectId, requestId, stepJournal(journal));
    assert.deepEqual(resumed, { subjectId, state: 'completed' });
    assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_balances WHERE user_id=$1', [subjectId]), 0);
    assert.equal(await count('SELECT count(*) AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [subjectId]), 1);
    assert.equal(await count(`SELECT count(*) AS count FROM privacy.request_events
      WHERE request_id=$1 AND event_type='completed'`, [requestId]), 1);
    assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_events WHERE id=$1', [signal.event.id]), 1);
    await assertNoFixtureBackends();
  } finally {
    await observer.query(`DROP TRIGGER IF EXISTS ${trigger} ON trust.reputation_balances`).catch(() => undefined);
    await observer.query(`DROP FUNCTION IF EXISTS public.${triggerFunction}()`).catch(() => undefined);
  }
});

test('privacy restart after tombstone replays completion idempotently and retains reputation history', async () => {
  const subjectId = await addSubject(), requestId = await addDeleteRequest(subjectId);
  const signal = await seedReputation(subjectId);
  const journal = new Map();
  const first = stepJournal(journal, { failAfter: 'complete-request-and-tombstone' });
  await assert.rejects(runDelete(subjectId, requestId, first), /synthetic_workflow_restart_after_complete-request-and-tombstone/);
  assert.equal(await count('SELECT count(*) AS count FROM privacy.deletion_tombstones WHERE subject_id=$1', [subjectId]), 1);
  assert.equal(await count(`SELECT count(*) AS count FROM privacy.request_events
    WHERE request_id=$1 AND event_type='completed'`, [requestId]), 1);
  assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_events WHERE id=$1', [signal.event.id]), 1);

  const resumed = await runDelete(subjectId, requestId, stepJournal(journal));
  assert.deepEqual(resumed, { subjectId, state: 'completed' });
  assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_balances WHERE user_id=$1', [subjectId]), 0);
  assert.equal(await count('SELECT count(*) AS count FROM trust.reputation_events WHERE id=$1', [signal.event.id]), 1);
  assert.equal(await count(`SELECT count(*) AS count FROM privacy.request_events
    WHERE request_id=$1 AND event_type='completed'`, [requestId]), 1);
  assert.equal(await count(`SELECT count(*) AS count FROM trust.user_activity_events
    WHERE user_id=$1 AND source_event_id=$2 AND event_type='account.deletion_completed'`, [subjectId, requestId]), 1);
  await assertNoFixtureBackends();
});
