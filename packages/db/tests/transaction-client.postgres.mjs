import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { encryptField, uuidv7 } from '../../security/src/index.ts';
import { transaction } from '../src/index.ts';
import { relayTransactionalEmailOutbox } from '../../../apps/lythaus-jobs/src/transactional-email-runtime.ts';
import { storePrivateExportObject } from '../../../apps/lythaus-jobs/src/privacy-export-storage.ts';
import { commitResponseProxy, fixtureHost, localFixtureDns } from './transaction-socket-fixture.mjs';

const supplied = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(supplied.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(supplied.hostname));
assert.match(supplied.pathname, /^\/lythaus_auth_test_post_tx_[a-f0-9]{32}$/);
assert.equal(supplied.search, '');
assert.equal(supplied.hash, '');
let observer, restoreDns;
const binding = (port, role = 'lythaus_jobs') => {
  assert.ok(['lythaus_jobs', 'lythaus_privacy'].includes(role));
  const url = new URL(supplied); url.hostname = fixtureHost;
  url.port = String(port ?? supplied.port); url.search = '';
  url.searchParams.set('sslmode', 'disable');
  url.searchParams.set('options', '-c role=' + role);
  return { connectionString: url.href };
};
before(async () => {
  observer = new pg.Client({ connectionString: supplied.href, ssl: false }); await observer.connect();
  const version = Number((await observer.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
  assert.ok(version >= 170000 && version < 180000);
  restoreDns = localFixtureDns();
});
after(async () => {
  restoreDns?.(); await observer?.end();
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
  const missing = new URL(binding().connectionString); missing.pathname = '/lythaus_missing_' + uuidv7().replaceAll('-', '');
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

async function emailFixture() {
  const id = uuidv7(), user = uuidv7(), key = randomBytes(32).toString('base64');
  const envelope = await encryptField(JSON.stringify({ to: 'fixture@example.invalid', token: 'f'.repeat(64) }), key, 'v1');
  await observer.query('INSERT INTO identity.users(id) VALUES($1)', [user]);
  await observer.query(`INSERT INTO system.transactional_email_outbox
    (id,user_id,purpose,template_version,correlation_id,delivery_envelope_ciphertext,delivery_envelope_encryption_key_version)
    VALUES($1,$2,'password_changed','v1',$4,$3,'v1')`, [id, user, envelope.ciphertext, id]);
  return { id, env: { ENVIRONMENT: 'production', DB_JOBS_FRESH: binding(),
    TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: key, EMAIL_PROVIDER_MODE: 'cloudflare',
    EMAIL_FROM: 'no-reply@example.invalid', EMAIL_PASSWORD_RESET_BASE_URL: 'https://fixture.invalid/reset' } };
}
async function pausedEmailPid() {
  const rows = (await observer.query(`SELECT pid FROM pg_stat_activity
    WHERE datname=current_database() AND state='idle in transaction'
      AND query LIKE '%FROM system.transactional_email_outbox o%'`)).rows;
  assert.equal(rows.length, 1); return rows[0].pid;
}

for (const disconnect of [false, true]) test(`actual email caller ${disconnect ? 'refuses an observed disconnect during envelope decryption' : 'sends after healthy envelope decryption'}`, async () => {
  const { id, env } = await emailFixture(), ready = Promise.withResolvers(), release = Promise.withResolvers();
  const original = crypto.subtle.decrypt; let sends = 0, outcome;
  crypto.subtle.decrypt = async function (...args) { ready.resolve(); await release.promise; return Reflect.apply(original, this, args); };
  const pending = relayTransactionalEmailOutbox({ ...env, EMAIL: { send: async () => {
    sends++; return { messageId: 'synthetic-' + id };
  } } });
  outcome = disconnect ? assert.rejects(pending, /database_transaction_unavailable/) : pending;
  try {
    await ready.promise;
    if (disconnect) {
      const pid = await pausedEmailPid(); await observer.query('SELECT pg_terminate_backend($1)', [pid]);
      await ended(pid); await new Promise(resolve => setImmediate(resolve));
    }
    release.resolve(); await outcome;
    assert.equal(sends, disconnect ? 0 : 1);
    const stored = (await observer.query('SELECT state,provider_message_id FROM system.transactional_email_outbox WHERE id=$1', [id])).rows[0];
    assert.equal(stored.state, disconnect ? 'processing' : 'provider_accepted');
    assert.equal(stored.provider_message_id, disconnect ? null : 'synthetic-' + id);
  } finally {
    release.resolve(); crypto.subtle.decrypt = original; await outcome;
    await observer.query('DELETE FROM system.transactional_email_outbox WHERE id=$1', [id]);
  }
});

test('actual email caller cannot undo an in-flight synthetic acceptance; the existing processing intent prevents automatic replay', async () => {
  const { id, env } = await emailFixture(), ready = Promise.withResolvers(), release = Promise.withResolvers();
  let sends = 0;
  const configured = { ...env, EMAIL: { send: async () => {
    sends++; ready.resolve(); await release.promise; return { messageId: 'synthetic-' + id };
  } } };
  const outcome = assert.rejects(relayTransactionalEmailOutbox(configured));
  try {
    await ready.promise;
    const rows = (await observer.query(`SELECT pid FROM pg_stat_activity
      WHERE datname=current_database() AND state='idle in transaction' AND pid<>$1`, [observer.processID])).rows;
    assert.equal(rows.length, 1); const pid = rows[0].pid;
    await observer.query('SELECT pg_terminate_backend($1)', [pid]); await ended(pid);
    release.resolve(); await outcome;
    assert.equal(sends, 1);
    assert.deepEqual((await observer.query('SELECT state,provider_message_id FROM system.transactional_email_outbox WHERE id=$1', [id])).rows[0],
      { state: 'processing', provider_message_id: null });
    await relayTransactionalEmailOutbox(configured);
    assert.equal(sends, 1);
  } finally { release.resolve(); await outcome; await observer.query('DELETE FROM system.transactional_email_outbox WHERE id=$1', [id]); }
});

for (const mode of ['healthy', 'disconnect', 'aborted', 'in_flight_disconnect']) test(`actual private-export storage helper: ${mode}`, async () => {
  const user = uuidv7(), request = uuidv7(), ready = Promise.withResolvers(), release = Promise.withResolvers();
  const objectKey = `exports/${user}/${request}.json`, bytes = new TextEncoder().encode('{}');
  await observer.query('INSERT INTO identity.users(id) VALUES($1)', [user]);
  await observer.query("INSERT INTO privacy.requests(id,subject_id,request_type) VALUES($1,$2,'export')", [request, user]);
  let pid, puts = 0;
  const pending = transaction(binding(undefined, 'lythaus_privacy'), async client => {
    pid = client.processID;
    assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, 'lythaus_privacy');
    await client.query('SELECT state FROM privacy.requests WHERE id=$1 AND subject_id=$2 FOR UPDATE', [request, user]);
    await client.query('SELECT status,deleted_at FROM identity.users WHERE id=$1 FOR NO KEY UPDATE', [user]);
    if (mode !== 'in_flight_disconnect') { ready.resolve(); await release.promise; }
    if (mode === 'aborted') await assert.rejects(client.query('SELECT 1/0'), error => error.code === '22012');
    await storePrivateExportObject(client, { put: async (key, body, options) => {
      puts++; assert.equal(key, objectKey); assert.deepEqual(body, bytes);
      assert.deepEqual(options, { httpMetadata: { contentType: 'application/json' } });
      if (mode === 'in_flight_disconnect') { ready.resolve(); await release.promise; }
      return null;
    } }, objectKey, bytes);
    await client.query(`INSERT INTO privacy.export_manifests(id,request_id,object_key,package_hash,expires_at)
      VALUES($1,$2,$3,'synthetic-package-hash',now()+interval '7 days')
      ON CONFLICT(request_id,object_key) DO UPDATE SET package_hash=EXCLUDED.package_hash`, [uuidv7(), request, objectKey]);
    return 'synthetic_export_complete';
  });
  const outcome = mode === 'healthy' ? pending : assert.rejects(pending,
    mode === 'in_flight_disconnect' ? undefined : /database_transaction_unavailable/);
  try {
    await ready.promise;
    if (mode.includes('disconnect')) {
      await observer.query('SELECT pg_terminate_backend($1)', [pid]); await ended(pid);
      await new Promise(resolve => setImmediate(resolve));
    }
    release.resolve(); await outcome; await ended(pid);
    assert.equal(puts, ['healthy', 'in_flight_disconnect'].includes(mode) ? 1 : 0);
    const manifests = (await observer.query('SELECT object_key,package_hash FROM privacy.export_manifests WHERE request_id=$1', [request])).rows;
    assert.deepEqual(manifests, mode === 'healthy' ? [{ object_key: objectKey, package_hash: 'synthetic-package-hash' }] : []);
  } finally { release.resolve(); await outcome; }
});
