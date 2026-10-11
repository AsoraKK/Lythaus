import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { uuidv7 } from '../../security/src/index.ts';
import { transaction } from '../src/index.ts';
import { commitResponseProxy, fixtureHost, localFixtureDns } from './transaction-socket-fixture.mjs';

const supplied = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(supplied.hostname, '127.0.0.1');
assert.equal(supplied.pathname, '/postgres');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const database = 'lythaus_transaction_test_' + randomBytes(8).toString('hex');
const local = new URL(supplied); local.pathname = '/' + database;
const control = new pg.Client({ connectionString: supplied.href, ssl: false });
let observer, restoreDns;
const binding = port => {
  const url = new URL(local); url.hostname = fixtureHost;
  url.port = String(port ?? supplied.port); url.search = '';
  url.searchParams.set('sslmode', 'disable');
  url.searchParams.set('options', '-c role=lythaus_jobs');
  return { connectionString: url.href };
};
before(async () => {
  await control.connect();
  const version = Number((await control.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
  assert.ok(version >= 170000 && version < 180000);
  await control.query('CREATE DATABASE ' + database);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/ci/validate-planetscale-postgres17.mjs'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: local.href },
    });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('canonical_fixture_setup_failed')));
  });
  observer = new pg.Client({ connectionString: local.href, ssl: false }); await observer.connect();
  restoreDns = localFixtureDns();
});
after(async () => {
  restoreDns?.(); await observer?.end();
  await control.query('DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)'); await control.end();
});
async function write(client, id) {
  assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, 'lythaus_jobs');
  await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,payload)
    VALUES($1,'synthetic.transaction.fixture','synthetic',$1,'{}') ON CONFLICT (id) DO NOTHING`, [id]);
  return id;
}
const count = async id => Number((await observer.query('SELECT count(*) AS count FROM system.outbox_events WHERE id=$1', [id])).rows[0].count);
async function ended(pid) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if ((await observer.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [pid])).rowCount === 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('terminated fixture backend did not close');
}

test('direct production transaction commits with the unchanged Jobs role and closes its backend', async () => {
  const id = uuidv7(); let pid;
  const result = await transaction(binding(), async client => { pid = client.processID; return write(client, id); });
  assert.equal(result, id); assert.equal(await count(id), 1); await ended(pid);
});

test('callback error rolls back writes, preserves the original error and closes the backend', async () => {
  const id = uuidv7(), failure = new Error('synthetic_callback_failure'); let pid;
  await assert.rejects(transaction(binding(), async client => { pid = client.processID; await write(client, id); throw failure; }), error => error === failure);
  assert.equal(await count(id), 0); await ended(pid);
});

test('failed startup closes the production client without issuing rollback on an unstarted transaction', async () => {
  const missing = new URL(binding().connectionString); missing.pathname += '_missing';
  let called = false;
  await assert.rejects(transaction({ connectionString: missing.href }, () => { called = true; }), error => error.code === '3D000');
  assert.equal(called, false);
});

test('actual aborted COMMIT returns ROLLBACK and must never report callback success', async () => {
  const id = uuidv7(); let pid;
  await assert.rejects(transaction(binding(), async client => {
    pid = client.processID; await write(client, id);
    await assert.rejects(client.query('SELECT 1/0'), error => error.code === '22012');
    return 'synthetic_success';
  }), /database_transaction_rolled_back/);
  assert.equal(await count(id), 0); await ended(pid);
});

for (const mode of ['drop_before_commit', 'drop_committed_response']) test(`direct production client reports unknown outcome for ${mode}; reconcile before idempotent retry`, async () => {
  const id = uuidv7(), proxy = await commitResponseProxy(supplied, mode); let pid;
  try {
    await assert.rejects(transaction(binding(proxy.port), async client => { pid = client.processID; return write(client, id); }),
      error => error.name === 'DatabaseCommitUncertainError' && error.outcome === 'unknown');
    assert.equal(proxy.commitSeen, true); assert.equal(proxy.responseDropped, true); await ended(pid);
    assert.equal(proxy.commandObserved, mode === 'drop_committed_response' ? 'COMMIT' : undefined);
    const observed = await count(id);
    assert.equal(observed, mode === 'drop_committed_response' ? 1 : 0, 'independent observer establishes the fixture outcome; transport error alone does not');
    if (observed) {
      const durable = (await observer.query('SELECT event_type,aggregate_id,payload FROM system.outbox_events WHERE id=$1', [id])).rows[0];
      assert.deepEqual(durable, { event_type: 'synthetic.transaction.fixture', aggregate_id: id, payload: {} });
    }
    await transaction(binding(), client => write(client, id));
    assert.equal(await count(id), 1, 'same deterministic operation id reconciles/retries without duplicating durable effect');
  } finally { await proxy.close(); }
});

test('disconnect while production callback awaits non-SQL work is handled without a fixture Client error listener', async () => {
  const id = uuidv7(), ready = Promise.withResolvers(), release = Promise.withResolvers(); let pid;
  const pending = transaction(binding(), async client => {
    pid = client.processID; await write(client, id); ready.resolve();
    await release.promise; return 'synthetic_success';
  });
  const outcome = assert.rejects(pending, /database_transaction_connection_failed/);
  try {
    await ready.promise; await observer.query('SELECT pg_terminate_backend($1)', [pid]); await ended(pid);
    await new Promise(resolve => setImmediate(resolve)); release.resolve(); await outcome;
    assert.equal(await count(id), 0);
  } finally { release.resolve(); await outcome; }
});

test('callback failure after an idle disconnect preserves its error and transaction cleanup', async () => {
  const id = uuidv7(), failure = new Error('synthetic_work_failure_after_disconnect');
  const ready = Promise.withResolvers(), release = Promise.withResolvers(); let pid;
  const pending = transaction(binding(), async client => {
    pid = client.processID; await write(client, id); ready.resolve(); await release.promise; throw failure;
  });
  const outcome = assert.rejects(pending, error => error === failure);
  try {
    await ready.promise; await observer.query('SELECT pg_terminate_backend($1)', [pid]); await ended(pid);
    await new Promise(resolve => setImmediate(resolve)); release.resolve(); await outcome;
    assert.equal(await count(id), 0);
  } finally { release.resolve(); await outcome; }
});
