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
  let admin, fixture, created = false, beforeQuery, effectHandler;
  const effects = [];
  const open = async role => {
    const client = new pg.Client({ connectionString: local.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    client.on('error', () => {});
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
    }, async effect => { effects.push(effect); await effectHandler?.(effect); });
    const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const checksum = createHash('sha256').update(png).digest('hex');
    async function seed(status = 'pending', purpose = 'standard') {
      beforeQuery = undefined;
      effectHandler = undefined;
      effects.length = 0;
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
    const create = async userId => fixture.request('/fixture/create', { userId,
      upload: { contentType: 'image/png', size: png.length, checksumSha256: checksum } });

    await t.test('Worker ingress bounds bytes before R2 and retries after a lost SQL transition', async () => {
      const userId = randomUUID();
      await admin.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [userId]);
      const created = await create(userId);
      assert.equal(created.status, 201);
      const receipt = await created.json();
      const row = (await admin.query('SELECT object_key, expires_at FROM media.upload_sessions WHERE id=$1', [receipt.uploadSessionId])).rows[0];
      assert.ok(Date.parse(receipt.expiresAt) > Date.now());
      assert.equal(new Date(row.expires_at).toISOString(), receipt.expiresAt);
      assert.equal((await fixture.upload(receipt.uploadUrl, randomUUID(), png)).status, 409);
      assert.equal(await fixture.quarantine.head(row.object_key), null);
      const oversized = await fixture.upload(receipt.uploadUrl, userId, Uint8Array.from([...png, 1]));
      assert.equal(oversized.status, 413);
      assert.equal(await fixture.quarantine.head(row.object_key), null);

      beforeQuery = async request => {
        if (request.text.includes('UPDATE media.upload_sessions SET observed_bytes')) {
          beforeQuery = undefined;
          throw new Error('synthetic_upload_commit_lost');
        }
      };
      const first = await fixture.upload(receipt.uploadUrl, userId, png);
      assert.equal(first.status, 500);
      assert.equal((await admin.query('SELECT observed_bytes FROM media.upload_sessions WHERE id=$1', [receipt.uploadSessionId])).rows[0].observed_bytes, null);
      assert.ok(await fixture.quarantine.head(row.object_key), 'R2 may succeed before its SQL transaction is lost');
      beforeQuery = undefined;
      const retry = await fixture.upload(receipt.uploadUrl, userId, png);
      assert.equal(retry.status, 201);
      const stored = await fixture.quarantine.head(row.object_key);
      assert.equal(stored.size, png.length);
      assert.equal(stored.httpMetadata.contentType, 'image/png');
      assert.equal(stored.customMetadata.checksumSha256, checksum);
      assert.equal(Number((await admin.query('SELECT observed_bytes FROM media.upload_sessions WHERE id=$1', [receipt.uploadSessionId])).rows[0].observed_bytes), png.length);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [userId])).rows[0].bytes_reserved), png.length);
      const concurrent = await Promise.all([
        fixture.upload(receipt.uploadUrl, userId, png), fixture.upload(receipt.uploadUrl, userId, png),
      ]);
      assert.ok(concurrent.every(response => [201, 500].includes(response.status)));
      assert.ok(concurrent.some(response => response.status === 201));
      assert.equal((await fixture.upload(receipt.uploadUrl, userId, png)).status, 201);
      assert.equal((await fixture.quarantine.head(row.object_key)).customMetadata.checksumSha256, checksum);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [userId])).rows[0].bytes_reserved), png.length);
    });

    await t.test('a still-valid URL cannot recreate quarantine after account deletion', async () => {
      const userId = randomUUID();
      await admin.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [userId]);
      const created = await create(userId);
      assert.equal(created.status, 201);
      const receipt = await created.json();
      const row = (await admin.query('SELECT object_key FROM media.upload_sessions WHERE id=$1', [receipt.uploadSessionId])).rows[0];
      assert.equal((await fixture.upload(receipt.uploadUrl, userId, png)).status, 201);
      await admin.query("UPDATE identity.users SET status='deleted', deleted_at=clock_timestamp() WHERE id=$1", [userId]);
      assert.ok(Date.parse(receipt.expiresAt) > Date.now());
      const afterAccountFence = await fixture.upload(receipt.uploadUrl, userId, png);
      assert.equal(afterAccountFence.status, 409);

      await admin.query("UPDATE media.upload_sessions SET status='expired' WHERE id=$1", [receipt.uploadSessionId]);
      await fixture.quarantine.delete(row.object_key);
      await admin.query('DELETE FROM media.storage_ledger WHERE user_id=$1', [userId]);
      const afterPurge = await fixture.upload(receipt.uploadUrl, userId, png);
      assert.equal(afterPurge.status, 409);
      assert.equal(await fixture.quarantine.head(row.object_key), null);
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.storage_ledger WHERE user_id=$1', [userId])).rows[0].n, 0);
    });

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
    await t.test('expired finalization with reservation drift leaves the session and private bytes retryable', async () => {
      const input = await seed();
      await admin.query("UPDATE media.upload_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [input.sessionId]);
      await admin.query('UPDATE media.storage_ledger SET bytes_reserved=0 WHERE user_id=$1', [input.userId]);
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal(response.status, 500);
      assert.equal((await session(input)).status, 'pending');
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM system.outbox_events WHERE aggregate_id=$1', [input.sessionId])).rows[0].n, 0);
      assert.ok(await fixture.quarantine.head(input.objectKey));
      await fixture.quarantine.delete(input.objectKey);
      await admin.query("UPDATE media.upload_sessions SET status='expired', quarantine_deleted_at=clock_timestamp() WHERE id=$1", [input.sessionId]);
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
    await t.test('exact proposed column grants enable real runtime rejection and private review in this disposable database', async () => {
      try {
        await admin.query('GRANT UPDATE (bytes_rejected) ON media.storage_ledger TO lythaus_runtime');
        await admin.query('GRANT INSERT (object_id, owner_id) ON media.ownership TO lythaus_jobs');
        const privileges = (await admin.query(`SELECT
        has_column_privilege('lythaus_runtime','media.storage_ledger','bytes_rejected','UPDATE') AS runtime_rejected,
        has_column_privilege('lythaus_jobs','media.ownership','object_id','INSERT') AS jobs_object,
        has_column_privilege('lythaus_jobs','media.ownership','owner_id','INSERT') AS jobs_owner`)).rows[0];
        assert.deepEqual(Object.values(privileges), [true, true, true]);

        const invalid = await seed('pending');
        await admin.query("UPDATE media.upload_sessions SET content_type='image/jpeg' WHERE id=$1", [invalid.sessionId]);
        const rejected = await fixture.request('/fixture/finalise', invalid);
        assert.equal(rejected.status, 400);
        assert.equal((await rejected.json()).error, 'unsupported_media_type');
        assert.equal((await session(invalid)).status, 'rejected');
        const rejectedLedger = (await admin.query('SELECT bytes_reserved,bytes_rejected FROM media.storage_ledger WHERE user_id=$1', [invalid.userId])).rows[0];
        assert.deepEqual(Object.values(rejectedLedger).map(Number), [0, png.length]);
        assert.equal(await fixture.quarantine.head(invalid.objectKey), null);

        const userId = randomUUID();
        await admin.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [userId]);
        const created = await create(userId);
        assert.equal(created.status, 201);
        const uploadReceipt = await created.json();
        const storedSession = (await admin.query('SELECT object_key, expires_at FROM media.upload_sessions WHERE id=$1', [uploadReceipt.uploadSessionId])).rows[0];
        assert.equal((await fixture.upload(uploadReceipt.uploadUrl, userId, png)).status, 201);
        const input = { userId, sessionId: uploadReceipt.uploadSessionId, objectKey: storedSession.object_key,
          event: { eventId: randomUUID(), eventType: 'media.upload.finalised',
            payload: { uploadSessionId: uploadReceipt.uploadSessionId, objectKey: storedSession.object_key } } };
        const response = await fixture.request('/fixture/finalise', input);
        assert.equal(response.status, 200);
        const receipt = await response.json();
        const event = { eventId: receipt.eventId, eventType: 'media.upload.finalised',
          payload: { uploadSessionId: input.sessionId, objectKey: input.objectKey } };
        assert.deepEqual(await queue({ ...input, event }), { ack: 1, retry: 0, imageCalls: 1 });
        assert.equal((await session(input)).status, 'approved');
        const object = (await admin.query('SELECT id, object_key, content_type, byte_size, sha256, state FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0];
        assert.equal(object.state, 'review');
        assert.equal(object.content_type, 'image/webp');
        assert.equal(Number(object.byte_size), 12);
        assert.equal(object.sha256, createHash('sha256').update(Uint8Array.from([82,73,70,70,4,0,0,0,87,69,66,80])).digest('hex'));
        assert.equal((await admin.query('SELECT owner_id FROM media.ownership WHERE object_id=$1', [object.id])).rows[0].owner_id, input.userId);
        const evidence = (await admin.query('SELECT model_version, signal FROM media.moderation_results WHERE object_id=$1', [object.id])).rows[0];
        assert.equal(evidence.model_version, 'not-executed');
        assert.equal(evidence.signal.modelId, 'not-executed');
        assert.equal(evidence.signal.reviewRequired, true);
        const ledger = (await admin.query('SELECT bytes_reserved,bytes_uploaded,bytes_approved,bytes_rejected,object_count FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0];
        assert.deepEqual(Object.values(ledger).map(Number), [0, 12, 12, 0, 1]);
        assert.equal((await admin.query('SELECT count(*)::integer AS n FROM system.outbox_events WHERE aggregate_id=$1', [input.sessionId])).rows[0].n, 1);
        assert.equal(await fixture.quarantine.head(input.objectKey), null);
        assert.ok(await fixture.approved.head(object.object_key));
        assert.ok(new Date(storedSession.expires_at).getTime() > Date.now());
        assert.equal((await fixture.upload(uploadReceipt.uploadUrl, userId, png)).status, 409);
        assert.equal(await fixture.quarantine.head(input.objectKey), null);
        assert.ok(!fixture.statements.some(query => /(?:INSERT INTO|UPDATE) (?:content|feed)\./.test(query.text ?? '')));
        assert.equal(fixture.outbound.length, 0);
      } finally {
        await admin.query('REVOKE INSERT (object_id, owner_id) ON media.ownership FROM lythaus_jobs');
        await admin.query('REVOKE UPDATE (bytes_rejected) ON media.storage_ledger FROM lythaus_runtime');
      }
    });
    await t.test('expired-session janitor releases quota once and retries object and marker loss', async () => {
      const input = await seed('pending');
      await admin.query("UPDATE media.upload_sessions SET expires_at=clock_timestamp()-interval '20 minutes' WHERE id=$1", [input.sessionId]);
      const first = await fixture.cleanup({ failDelete: true });
      assert.equal(first.status, 204);
      assert.equal((await session(input)).status, 'expired');
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
      assert.equal((await admin.query('SELECT quarantine_deleted_at FROM media.upload_sessions WHERE id=$1', [input.sessionId])).rows[0].quarantine_deleted_at, null);
      assert.ok(await fixture.quarantine.head(input.objectKey));

      beforeQuery = async request => {
        if (request.text.includes('SET quarantine_deleted_at = clock_timestamp()')) {
          beforeQuery = undefined;
          throw new Error('synthetic_cleanup_commit_lost');
        }
      };
      const lostMarker = await fixture.cleanup();
      assert.equal(lostMarker.status, 204);
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal((await admin.query('SELECT quarantine_deleted_at FROM media.upload_sessions WHERE id=$1', [input.sessionId])).rows[0].quarantine_deleted_at, null);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);

      beforeQuery = undefined;
      assert.equal((await fixture.cleanup()).status, 204);
      assert.ok((await admin.query('SELECT quarantine_deleted_at FROM media.upload_sessions WHERE id=$1', [input.sessionId])).rows[0].quarantine_deleted_at);
      assert.equal((await fixture.cleanup()).status, 204);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
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
    await t.test('an already-expired session only repeats private cleanup', async () => {
      const input = await seed('queued');
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      beforeQuery = async request => {
        if (request.text.includes('FROM media.upload_sessions') && request.text.includes('FOR UPDATE NOWAIT')) {
          beforeQuery = undefined;
          await admin.query("UPDATE media.upload_sessions SET status='expired' WHERE id=$1", [input.sessionId]);
        }
      };
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal((await session(input)).status, 'expired');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal(await fixture.approved.head(key), null);
    });
    await t.test('database-time expiry releases quota and removes a stored private orphan', async () => {
      const input = await seed('queued');
      await admin.query("UPDATE media.upload_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [input.sessionId]);
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal((await session(input)).status, 'expired');
      const ledger = (await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0];
      assert.equal(Number(ledger.bytes_reserved), 0);
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal(await fixture.approved.head(key), null);
    });
    await t.test('queued expiry with reservation drift rolls back before cleanup then succeeds on retry', async () => {
      const input = await seed('queued');
      await admin.query("UPDATE media.upload_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [input.sessionId]);
      await admin.query('UPDATE media.storage_ledger SET bytes_reserved=0 WHERE user_id=$1', [input.userId]);
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal((await session(input)).status, 'queued');
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
      assert.ok(await fixture.quarantine.head(input.objectKey));
      assert.ok(await fixture.approved.head(key));
      await admin.query('UPDATE media.storage_ledger SET bytes_reserved=$2 WHERE user_id=$1', [input.userId, png.length]);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal((await session(input)).status, 'expired');
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal(await fixture.approved.head(key), null);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
    });
    await t.test('expiry during conditional R2 creation rolls back and retries orphan cleanup', async () => {
      const input = await seed('queued');
      await admin.query("UPDATE media.upload_sessions SET expires_at=clock_timestamp()+interval '5 seconds' WHERE id=$1", [input.sessionId]);
      const reached = Promise.withResolvers(), release = Promise.withResolvers();
      effectHandler = async effect => {
        if (effect.type === 'beforePut') { reached.resolve(); await release.promise; }
      };
      const first = queue(input);
      try {
        await reached.promise;
        let expired = false;
        while (!expired) {
          expired = (await admin.query('SELECT expires_at <= clock_timestamp() AS expired FROM media.upload_sessions WHERE id=$1', [input.sessionId])).rows[0].expired;
          if (!expired) await new Promise(resolve => setTimeout(resolve, 10));
        }
      } finally { release.resolve(); }
      assert.deepEqual(await first, { ack: 0, retry: 1, imageCalls: 1 });
      assert.equal((await session(input)).status, 'queued');
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), png.length);
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      assert.ok(await fixture.approved.head(key));
      effectHandler = undefined;
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal((await session(input)).status, 'expired');
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal(await fixture.approved.head(key), null);
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
    });
    await t.test('a deleted account cannot process queued media and reclaims private orphans', async () => {
      const input = await seed('queued');
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      await admin.query("UPDATE identity.users SET status='deleted', deleted_at=now() WHERE id=$1", [input.userId]);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal((await session(input)).status, 'expired');
      assert.equal(Number((await admin.query('SELECT bytes_reserved FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0].bytes_reserved), 0);
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal(await fixture.approved.head(key), null);
    });
    await t.test('account-deletion session fence makes an in-flight worker retry before external work', async () => {
      const input = await seed('queued');
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      await admin.query('BEGIN');
      await admin.query("UPDATE identity.users SET status='deleted', deleted_at=now() WHERE id=$1", [input.userId]);
      await admin.query(`UPDATE media.upload_sessions SET status='expired'
        WHERE user_id=$1 AND purpose='standard' AND status IN ('pending', 'queued')`, [input.userId]);
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
      assert.ok(failures.some(error => error.code === '55P03' && error.statement.includes('FOR UPDATE NOWAIT')));
      await admin.query('COMMIT');
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal((await session(input)).status, 'expired');
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM media.objects WHERE owner_id=$1', [input.userId])).rows[0].n, 0);
      assert.equal(await fixture.quarantine.head(input.objectKey), null);
      assert.equal(await fixture.approved.head(key), null);
    });
    await t.test('derivative growth is rejected within the reservation before storage or inference', async () => {
      const input = await seed('queued');
      const expanded = [82,73,70,70,5,0,0,0,87,69,66,80,0];
      assert.deepEqual(await queue({ ...input, transformed: expanded, aiEnabled: true }), { ack: 1, retry: 0, imageCalls: 1 });
      assert.equal((await session(input)).status, 'rejected');
      assert.equal(await fixture.approved.head(`approved/${input.userId}/${input.sessionId}.webp`), null);
      const ledger = (await admin.query('SELECT bytes_reserved,bytes_approved,bytes_rejected FROM media.storage_ledger WHERE user_id=$1', [input.userId])).rows[0];
      assert.deepEqual(Object.values(ledger).map(Number), [0, 0, png.length]);
      assert.equal(effects.filter(effect => effect.type === 'beforePut').length, 0);
    });
    for (const delivery of ['different-event', 'reclaimed-event']) {
      await t.test(`${delivery} cannot repeat Images work while the first transaction owns the session`, async () => {
        const input = await seed('queued');
        const reached = Promise.withResolvers(), release = Promise.withResolvers();
        effectHandler = async effect => {
          if (effect.type === 'info' && effect.input.attempt === 'first') { reached.resolve(); await release.promise; }
        };
        const first = queue({ ...input, attempt: 'first', transformed: [82,73,70,70,5,0,0,0,87,69,66,80,0] });
        try {
          await reached.promise;
          const event = delivery === 'different-event' ? { ...input.event, eventId: randomUUID() } : input.event;
          if (delivery === 'reclaimed-event') await admin.query("UPDATE system.consumer_inbox SET claimed_at=now()-interval '6 minutes' WHERE event_id=$1", [event.eventId]);
          assert.deepEqual(await queue({ ...input, event, attempt: 'second' }), { ack: 0, retry: 1, imageCalls: 0 });
          assert.equal(effects.filter(effect => effect.type === 'info').length, 1);
          assert.ok(failures.some(error => error.code === '55P03' && error.statement.includes('FOR UPDATE NOWAIT')));
        } finally { release.resolve(); }
        assert.deepEqual(await first, { ack: 1, retry: 0, imageCalls: 1 });
        assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
        assert.equal(effects.filter(effect => effect.type === 'transform').length, 1);
        assert.equal((await session(input)).status, 'rejected');
      });
    }
    await t.test('a persisted derivative is reused after canonical grant failure with zero repeated Images work', async () => {
      const input = await seed('queued');
      assert.deepEqual(await queue({ ...input, aiEnabled: true }), { ack: 0, retry: 1, imageCalls: 1 });
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      const stored = await fixture.approved.get(key);
      const original = await stored.arrayBuffer();
      assert.deepEqual(await queue({ ...input, decoderFailure: true, aiEnabled: true }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.deepEqual(await (await fixture.approved.get(key)).arrayBuffer(), original);
      assert.equal(effects.filter(effect => effect.type === 'transform').length, 1);
      assert.equal(effects.filter(effect => effect.type === 'beforePut').length, 1);
      assert.equal((await session(input)).status, 'queued');
      assert.ok(!fixture.statements.some(input => /system\.cost_/.test(input.text ?? '')));
    });
    await t.test('an unbound older derivative fails closed without overwrite or decoding', async () => {
      const input = await seed('queued');
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
      assert.deepEqual(new Uint8Array(await (await fixture.approved.get(key)).arrayBuffer()), png);
      assert.equal(effects.length, 0);
    });
    await t.test('lost transaction and overlapping late PUT cannot overwrite the winning derivative', async () => {
      const input = await seed('queued');
      const reached = Promise.withResolvers(), release = Promise.withResolvers();
      let firstTransaction;
      beforeQuery = request => {
        if (!firstTransaction && request.text.includes('FOR UPDATE NOWAIT')) firstTransaction = request.transactionId;
      };
      effectHandler = async effect => {
        if (effect.type === 'beforePut' && effect.input.attempt === 'stale') { reached.resolve(); await release.promise; }
      };
      const stale = queue({ ...input, attempt: 'stale' });
      const winnerBytes = [82,73,70,70,4,0,0,0,87,69,66,80];
      winnerBytes[4] = 5;
      try {
        await reached.promise;
        assert.ok(firstTransaction);
        const backend = connections.get(firstTransaction).processID;
        assert.equal((await admin.query('SELECT pg_terminate_backend($1) AS terminated', [backend])).rows[0].terminated, true);
        const event = { ...input.event, eventId: randomUUID() };
        assert.deepEqual(await queue({ ...input, event, attempt: 'winner', transformed: winnerBytes }), { ack: 0, retry: 1, imageCalls: 1 });
      } finally { release.resolve(); }
      assert.deepEqual(await stale, { ack: 0, retry: 1, imageCalls: 1 });
      const stored = await fixture.approved.get(`approved/${input.userId}/${input.sessionId}.webp`);
      assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), Uint8Array.from(winnerBytes));
      assert.equal(effects.filter(effect => effect.type === 'stored').length, 1);
      assert.equal(effects.filter(effect => effect.type === 'conflict').length, 1);
      assert.equal((await session(input)).status, 'queued');
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
