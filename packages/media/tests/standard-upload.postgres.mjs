import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { publicationControlTarget } from '../../../scripts/ci/run-publication-pg17.mjs';
import { standardUploadFixture } from './standard-upload-fixture.mjs';

test('standard uploads with Workerd, local R2 and unchanged canonical PG17 roles', { timeout: 120_000 }, async t => {
  const target = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: target.toString(), ssl: false });
  const name = `lythaus_auth_test_post_media_${randomUUID().replaceAll('-', '')}`;
  const local = new URL(target); local.pathname = '/' + name;
  const connections = new Map(), failures = [];
  let admin, fixture, created = false, beforeQuery;
  const open = async role => {
    const client = new pg.Client({ connectionString: local.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query("SET statement_timeout='5s'");
    if (role) {
      assert.ok(['lythaus_runtime', 'lythaus_jobs'].includes(role));
      await client.query('SET ROLE ' + role);
    }
    return client;
  };
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await control.query(`CREATE DATABASE ${name}`); created = true;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/ci/validate-planetscale-postgres17.mjs'], {
        env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: local.toString() }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 && !signal ? resolve() : reject(new Error('canonical_baseline_failed')));
    });
    admin = await open();
    assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name, name);
    fixture = await standardUploadFixture(async input => {
      const temporary = !input.transactionId;
      let client = connections.get(input.transactionId);
      try {
        if (temporary) client = await open(input.role);
        if (input.action === 'begin') {
          await client.query('BEGIN');
          const transactionId = randomUUID(); connections.set(transactionId, client);
          return { transactionId };
        }
        if (input.action === 'query') {
          if (beforeQuery) await beforeQuery(input);
          const result = await client.query(input.text, input.values);
          return { rows: result.rows, rowCount: result.rowCount };
        }
        assert.ok(['commit', 'rollback'].includes(input.action));
        await client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK'); return {};
      } catch (error) {
        failures.push({ code: error.code, statement: input.text });
        throw error;
      } finally {
        if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
          connections.delete(input.transactionId); await client?.end();
        }
      }
    });
    const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const checksum = createHash('sha256').update(png).digest('hex');
    async function seed(status = 'pending', purpose = 'standard') {
      beforeQuery = undefined;
      const userId = randomUUID(), sessionId = randomUUID(), eventId = randomUUID();
      const objectKey = `quarantine/${userId}/${sessionId}`;
      await admin.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [userId]);
      await admin.query(`INSERT INTO media.upload_sessions
        (id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at,purpose,status)
        VALUES($1,$2,$3,'image/png',$4,$5,now()+interval '10 minutes',$6,$7)`,
      [sessionId, userId, objectKey, png.length, checksum, purpose, status]);
      await admin.query('INSERT INTO media.storage_ledger(user_id,bytes_reserved) VALUES($1,$2)', [userId, png.length]);
      await fixture.quarantine.put(objectKey, png);
      return { userId, sessionId, objectKey, event: { eventId, eventType: 'media.upload.finalised',
        payload: { uploadSessionId: sessionId, objectKey } } };
    }
    const session = async input => (await admin.query('SELECT status FROM media.upload_sessions WHERE id=$1', [input.sessionId])).rows[0];
    const queue = async input => (await fixture.request('/fixture/queue', input)).json();

    await t.test('real owner predicates, purpose checks and private queued receipt', async () => {
      const input = await seed();
      assert.equal((await fixture.request('/fixture/finalise', { ...input, userId: randomUUID() })).status, 400);
      const privateCase = await seed('pending', 'authenticity_alpha');
      assert.equal((await fixture.request('/fixture/finalise', privateCase)).status, 400);
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal((await session(input)).status, 'queued');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM system.outbox_events WHERE aggregate_id=$1', [input.sessionId])).rows[0].n, 1);
      assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
    });
    await t.test('expiry between byte verification and SQL transition rolls back without an event', async () => {
      const input = await seed();
      beforeQuery = async request => {
        if (request.text.includes("SET status = 'queued'")) {
          beforeQuery = undefined;
          await admin.query("UPDATE media.upload_sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [input.sessionId]);
        }
      };
      assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
      assert.equal((await session(input)).status, 'pending');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM system.outbox_events WHERE aggregate_id=$1', [input.sessionId])).rows[0].n, 0);
    });
    await t.test('first-ledger concurrent quota reservations cannot exceed the configured quota', async () => {
      const userId = randomUUID();
      await admin.query('INSERT INTO identity.users(id) VALUES($1)', [userId]);
      const input = { userId, upload: { contentType: 'image/png', size: 6 * 1024 * 1024, checksumSha256: checksum } };
      const responses = await Promise.all([fixture.request('/fixture/create', input), fixture.request('/fixture/create', input)]);
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 400]);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [userId])).rows[0].bytes_reserved), input.upload.size);
    });
    await t.test('canonical runtime rejection permission gap remains fail-closed and is not bypassed', async () => {
      const input = await seed();
      await admin.query("UPDATE media.upload_sessions SET content_type='image/jpeg' WHERE id=$1", [input.sessionId]);
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal(response.status, 500);
      assert.equal((await response.json()).error, 'request_failed');
      assert.equal((await session(input)).status, 'pending');
      assert.ok(failures.some(error => error.code === '42501' && error.statement.includes('bytes_rejected')));
    });
    await t.test('canonical Jobs ownership permission gap rolls back review persistence and retains retry', async () => {
      const input = await seed('queued');
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 1 });
      assert.equal((await session(input)).status, 'queued');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
      assert.ok(failures.some(error => error.code === '42501' && error.statement.includes('INSERT INTO media.ownership')));
      assert.ok(await fixture.quarantine.head(input.objectKey));
    });
    await t.test('Jobs checksum rejection, cleanup failure and redelivery settle once with actual SQL', async () => {
      const input = await seed('queued');
      const altered = png.slice(); altered[11] = 1;
      await fixture.quarantine.put(input.objectKey, altered);
      assert.deepEqual(await queue({ ...input, failDelete: true }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal((await session(input)).status, 'rejected');
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      const ledger = (await admin.query('SELECT bytes_reserved,bytes_rejected FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0];
      assert.equal(Number(ledger.bytes_reserved), 0); assert.equal(Number(ledger.bytes_rejected), png.length);
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
    });
    await t.test('an expired session at the final lock cannot create a review row', async () => {
      const input = await seed('queued');
      beforeQuery = async request => {
        if (request.text.includes('SELECT status FROM media.upload_sessions')) {
          beforeQuery = undefined;
          await admin.query("UPDATE media.upload_sessions SET status='expired' WHERE id=$1", [input.sessionId]);
        }
      };
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 1 });
      assert.equal((await session(input)).status, 'expired');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
    });
    assert.equal(fixture.outbound.length, 0);
    assert.ok(!fixture.statements.some(input => /(?:INSERT INTO|UPDATE) (?:content|feed)\./.test(input.text ?? '')));
  } finally {
    await fixture?.dispose();
    await Promise.all([...connections.values()].map(client => client.end()));
    await admin?.end();
    if (created) await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await control.end();
  }
});
