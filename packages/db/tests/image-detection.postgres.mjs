import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import sharp from 'sharp';
import { uuidv7 } from '../../authenticity/src/uuid.ts';
import { sha256Hex } from '../../authenticity/src/forensics.ts';
import { IMAGE_DETECTION_POLICY, IMAGE_DETECTION_VERSION } from '../../authenticity/src/image-detection-contract.ts';
import { enqueueImageDetection, imageDetectionStatus } from '../../authenticity/src/image-detection.ts';
import { processImageDetectionEvent } from '../../../apps/lythaus-jobs/src/image-detection.ts';
import { createImageDetectionStore } from '../src/image-detection-store.ts';
import { publicationControlTarget } from '../../../scripts/ci/run-publication-pg17.mjs';
import { imageDetectionFixture } from './image-detection-fixture.mjs';

const syntheticEvaluator = { id: 'synthetic-provider', version: 'fixture-v1', model: 'no-model', modelVersion: 'fixture-v1',
  preprocessing: 'identity-fixture-v1', runtime: 'no-inference-v1' };

test('candidate consumer + SQL store + local R2, synthetic outputs only', { timeout: 120_000 }, async t => {
  const target = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: target.toString(), ssl: false });
  const name = `lythaus_auth_test_post_image_${randomUUID().replaceAll('-', '')}`;
  const local = new URL(target); local.pathname = '/' + name;
  let created = false, admin, mf;
  const open = async () => {
    const client = new pg.Client({ connectionString: local.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    await client.connect(); await client.query("SET statement_timeout='5s'"); return client;
  };
  const transaction = async work => {
    const client = await open();
    try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  };
  const store = createImageDetectionStore(transaction);
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await control.query(`CREATE DATABASE ${name}`); created = true;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/ci/validate-planetscale-postgres17.mjs'], {
        env: { ...process.env, PLANETSCALE_PG17_TEST_DATABASE_URL: local.toString() }, stdio: 'inherit' });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('baseline_failed')));
    });
    admin = await open();
    await admin.query(readFileSync(new URL('../../../database/planetscale/proposals/image_detection_jobs_v1.sql', import.meta.url), 'utf8'));
    const grants = await admin.query("SELECT has_table_privilege('lythaus_jobs','media.image_detection_jobs','INSERT') AS allowed");
    assert.equal(grants.rows[0].allowed, false, 'proposal does not grant live runtime permissions');
    mf = await imageDetectionFixture(open);
    const bucket = mf.bucket;
    const png = new Uint8Array(await sharp({ create: { width: 256, height: 256, channels: 3,
      background: { r: 12, g: 34, b: 56 } } }).png().toBuffer());
    const digest = await sha256Hex(png);
    async function seed(overrides = {}) {
      const ownerId = uuidv7(), uploadSessionId = uuidv7(), sourceEventId = uuidv7(), objectId = uuidv7();
      const key = `quarantine/${ownerId}/${uploadSessionId}`;
      const source = await bucket.put(key, png, { httpMetadata: { contentType: 'image/png' } });
      const expiresAt = new Date(Date.now() + 600_000).toISOString();
      await admin.query("INSERT INTO identity.users(id,status) VALUES($1,'active')", [ownerId]);
      await admin.query(`INSERT INTO media.upload_sessions(id,user_id,object_key,content_type,expected_bytes,checksum_sha256,
        status,purpose,expires_at) VALUES($1,$2,$3,'image/png',$4,$5,'approved','standard',$6)`, [uploadSessionId, ownerId, key, png.length, digest, expiresAt]);
      await admin.query(`INSERT INTO media.objects(id,owner_id,object_key,content_type,byte_size,sha256,state)
        VALUES($1,$2,$3,'image/webp',50,$4,'review')`, [objectId, ownerId, `approved/${ownerId}/${uploadSessionId}.webp`, 'd'.repeat(64)]);
      await admin.query('INSERT INTO media.ownership(object_id,owner_id) VALUES($1,$2)', [objectId, ownerId]);
      await admin.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload)
        VALUES($1,'media.upload.finalised','upload_session',$2,$3,$4::jsonb)`,
        [sourceEventId, uploadSessionId, ownerId, JSON.stringify({ uploadSessionId, objectKey: key })]);
      const binding = { ownerId, uploadSessionId, sourceEventId, objectId, contentVersion: 'd'.repeat(64),
        original: { key, version: source.version, etag: source.etag, sha256: digest, bytes: png.length, mime: 'image/png' },
        evaluator: syntheticEvaluator, policyVersion: IMAGE_DETECTION_POLICY };
      let calls = 0;
      const deps = { mode: 'synthetic-local-only', store, originals: bucket, evaluator: { kind: 'synthetic', async evaluate(input) {
        calls++; assert.deepEqual(input.bytes, png);
        return { schemaVersion: IMAGE_DETECTION_VERSION, bindingHash: input.bindingHash, attemptId: input.attemptId,
          evaluator: input.binding.evaluator, evidenceKind: 'synthetic', safety: 'ALLOW', authorship: 'NO_POSITIVE_EVIDENCE' };
      } }, ...overrides };
      const job = await enqueueImageDetection(deps, binding, expiresAt);
      const event = { jobId: job.id, sourceEventId, bindingHash: job.bindingHash };
      return { job, deps, binding, expiresAt, event, calls: () => calls,
        run: signal => processImageDetectionEvent(deps, event, signal), read: () => store.read(job.id, ownerId) };
    }

    await t.test('admission and duplicate delivery are idempotent; owner projection stays private and unverified', async () => {
      const s = await seed();
      assert.equal((await enqueueImageDetection(s.deps, s.binding, s.expiresAt)).id, s.job.id);
      assert.equal((await s.read()).state, 'queued');
      await Promise.all([s.run(), s.run()]); await s.run();
      const row = await s.read();
      assert.equal(row.state, 'completed'); assert.equal(s.calls(), 1); assert.equal(row.attempts, 1);
      assert.equal(row.evidence.integrity, 'VERIFIED'); assert.equal(row.evidence.authorship.state, 'ABSTAIN');
      assert.equal(row.evidence.policy.reputationEligible, false);
      const status = await imageDetectionStatus(s.deps, s.job.id, s.binding.ownerId);
      assert.equal(status.evaluation, 'synthetic_only'); assert.equal(status.publicationEligible, false);
      assert.equal(await imageDetectionStatus(s.deps, s.job.id, uuidv7()), null);
      assert.doesNotMatch(JSON.stringify(status), /quarantine|modelVersion|bindingHash|sha256/);
      assert.equal((await bucket.head(s.binding.original.key)).version, s.binding.original.version);
    });

    await t.test('actual unmodified modules execute in Workerd against PostgreSQL and private local R2', async () => {
      const s = await seed();
      assert.equal(await mf.request('/process', { event: s.event }), 'disabled');
      assert.equal((await s.read()).attempts, 0);
      const duplicate = await mf.request('/enqueue', { enabled: true, binding: s.binding, expiresAt: s.expiresAt });
      assert.equal(duplicate.id, s.job.id);
      assert.equal(await mf.request('/process', { enabled: true, event: { ...s.event, sourceEventId: uuidv7() } }), 'ignored');
      assert.equal(await mf.request('/process', { enabled: true, event: s.event }), 'settled');
      assert.equal(await mf.request('/process', { enabled: true, event: s.event }), 'ignored');
      assert.equal((await s.read()).state, 'completed'); assert.equal((await s.read()).attempts, 1);
      assert.equal((await mf.request('/status', { id: s.job.id, ownerId: s.binding.ownerId })).evaluation, 'synthetic_only');
      assert.equal(await mf.request('/status', { id: s.job.id, ownerId: uuidv7() }), null);
    });

    await t.test('changed identities and forged/out-of-order events make no provider call', async () => {
      const s = await seed();
      await assert.rejects(() => enqueueImageDetection(s.deps, { ...s.binding, evaluator: { ...syntheticEvaluator, version: 'other' } }, s.expiresAt), /identity_conflict/);
      await assert.rejects(() => enqueueImageDetection(s.deps, { ...s.binding, sourceEventId: uuidv7() }, s.expiresAt), /source_not_current/);
      await assert.rejects(() => enqueueImageDetection(s.deps, { ...s.binding, contentVersion: 'e'.repeat(64) }, s.expiresAt), /source_not_current/);
      assert.equal(await processImageDetectionEvent(s.deps, { ...s.event, sourceEventId: uuidv7() }), 'ignored');
      assert.equal(await processImageDetectionEvent(s.deps, { ...s.event, bindingHash: 'a'.repeat(64) }), 'ignored');
      assert.equal(s.calls(), 0); assert.equal((await s.read()).state, 'queued');
    });

    await t.test('missing original cannot fall back to the WebP derivative', async () => {
      const s = await seed(); await bucket.delete(s.binding.original.key); await s.run();
      const row = await s.read(); assert.equal(row.state, 'inconclusive'); assert.equal(row.reason, 'ORIGINAL_UNAVAILABLE');
      assert.equal(row.evidence, null); assert.equal(s.calls(), 0);
    });

    await t.test('replacement version and mutated bytes fail before evaluator dispatch', async () => {
      const s = await seed(); await bucket.put(s.binding.original.key, png); await s.run();
      assert.equal((await s.read()).reason, 'ORIGINAL_CHANGED'); assert.equal(s.calls(), 0);
      const wrong = await seed();
      wrong.deps.originals = { head: key => bucket.head(key), get: async () => ({ ...wrong.binding.original,
        size: png.length, body: new Response(new Uint8Array(png.length)).body }) };
      await wrong.run(); assert.equal((await wrong.read()).state, 'failed'); assert.equal((await wrong.read()).reason, 'INTEGRITY_FAILED');
      assert.equal(wrong.calls(), 0);
    });

    await t.test('transient pre-dispatch transport errors retry with a three-attempt bound', async () => {
      const s = await seed(), original = s.deps.originals;
      s.deps.originals = { get: async () => { throw new Error('synthetic_unavailable'); } };
      assert.equal(await s.run(), 'retry'); assert.equal((await s.read()).state, 'queued'); assert.equal(s.calls(), 0);
      s.deps.originals = original; await s.run(); assert.equal((await s.read()).state, 'completed'); assert.equal(s.calls(), 1);
      const exhausted = await seed({ originals: { get: async () => { throw new Error('synthetic_unavailable'); } } });
      assert.equal(await exhausted.run(), 'retry'); assert.equal(await exhausted.run(), 'retry');
      assert.equal(await exhausted.run(), 'settled'); assert.equal(await exhausted.run(), 'ignored');
      assert.equal((await exhausted.read()).state, 'failed'); assert.equal((await exhausted.read()).attempts, 3);
    });

    await t.test('crashed lease recovery retries before dispatch but consumes uncertain dispatched work', async () => {
      for (const dispatched of [false, true]) {
        const s = await seed(), attempt = uuidv7();
        await store.claim(s.job.id, s.event.sourceEventId, s.job.bindingHash, attempt, 30_000);
        if (dispatched) await store.startDispatch(s.job.id, attempt);
        assert.equal(await s.run(), 'retry');
        assert.equal(s.calls(), 0); assert.equal((await s.read()).attempts, 1);
        await admin.query("UPDATE media.image_detection_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [s.job.id]);
        await s.run();
        assert.equal((await s.read()).state, dispatched ? 'inconclusive' : 'completed');
        assert.equal(s.calls(), dispatched ? 0 : 1);
        assert.equal(await store.settle(s.job.id, attempt, 'failed', null, 'SOURCE_UNAVAILABLE'), false);
      }
    });

    await t.test('lease expiry during settlement returns retry only for undispatched work', async () => {
      for (const stage of ['missing', 'integrity', 'evaluated']) {
        const s = await seed();
        if (stage === 'missing') s.deps.originals = { get: async () => null };
        if (stage === 'integrity') s.deps.originals = { get: async () => ({ ...s.binding.original,
          size: png.length, body: new Response(new Uint8Array(png.length)).body }) };
        s.deps.store = { ...store, async settle(...args) {
          await admin.query("UPDATE media.image_detection_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [s.job.id]);
          return store.settle(...args);
        } };
        assert.equal(await s.run(), stage === 'evaluated' ? 'settled' : 'retry');
        assert.equal((await s.read()).state, stage === 'evaluated' ? 'inconclusive' : 'queued');
        assert.equal(s.calls(), stage === 'evaluated' ? 1 : 0);
      }
    });

    await t.test('timeout consumes dispatch and suppresses a late success even if abort is ignored', async () => {
      const s = await seed({ timeoutMs: 500 });
      let release, observed;
      const evaluate = s.deps.evaluator.evaluate;
      s.deps.evaluator.evaluate = async input => { observed = input.signal; await new Promise(resolve => { release = resolve; }); return evaluate(input); };
      await s.run(); assert.ok(release); assert.equal(observed.aborted, true);
      assert.equal((await s.read()).state, 'inconclusive');
      release(); await new Promise(resolve => setImmediate(resolve)); await s.run();
      assert.equal((await s.read()).evidence, null); assert.equal((await s.read()).attempts, 1);
    });

    await t.test('stalled original stream is cancelled and no evaluator is dispatched', async () => {
      const s = await seed({ timeoutMs: 200 }); let cancelled = 0;
      s.deps.originals = { get: async () => ({ ...s.binding.original, size: png.length,
        body: new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => { cancelled++; } }) }) };
      assert.equal(await s.run(), 'retry');
      assert.equal(cancelled, 1); assert.equal(s.calls(), 0); assert.equal((await s.read()).state, 'queued');
    });

    await t.test('malformed, misbound and NOT_RUN output remains inconclusive', async () => {
      for (const alter of [o => ({ ...o, attemptId: uuidv7() }), o => ({ ...o, safety: 'NOT_RUN', authorship: 'NOT_RUN' }),
        o => ({ ...o, evaluator: { ...o.evaluator, runtime: 'wrong' } }), o => ({ ...o, rawScore: 0.1 })]) {
        const s = await seed(), evaluate = s.deps.evaluator.evaluate;
        s.deps.evaluator.evaluate = async input => alter(await evaluate(input));
        await s.run(); assert.equal((await s.read()).state, 'inconclusive');
        assert.equal((await imageDetectionStatus(s.deps, s.job.id, s.binding.ownerId)).authenticity, 'unverified');
      }
    });

    await t.test('provider exception after dispatch is never automatically repeated', async () => {
      const s = await seed(); let calls = 0;
      s.deps.evaluator.evaluate = async () => { calls++; throw new Error('synthetic_provider_ambiguous'); };
      await s.run(); await s.run(); assert.equal(calls, 1); assert.equal((await s.read()).reason, 'ATTEMPT_CONSUMED');
    });

    await t.test('lost dispatch or settlement acknowledgement cannot repeat evaluator execution', async () => {
      for (const lose of ['dispatch', 'settlement']) {
        const s = await seed(); let lost = false;
        s.deps.store = createImageDetectionStore(async work => {
          const result = await transaction(work);
          if (!lost && (lose === 'dispatch' ? result?.dispatchStartedAt && result?.state === 'processing' : result === true)) {
            lost = true; throw new Error('synthetic_commit_acknowledgement_lost');
          }
          return result;
        });
        await s.run(); await s.run(); assert.equal(lost, true);
        assert.equal((await s.read()).state, lose === 'dispatch' ? 'inconclusive' : 'completed');
        assert.equal(s.calls(), lose === 'dispatch' ? 0 : 1); assert.equal((await s.read()).attempts, 1);
      }
    });

    await t.test('cancellation, deletion and cleanup fence an in-flight success', async () => {
      for (const reason of ['CANCELLED', 'DELETED', 'CLEANUP', 'SUPERSEDED']) {
        const s = await seed(), evaluate = s.deps.evaluator.evaluate;
        s.deps.evaluator.evaluate = async input => { await store.invalidate(s.job.id, s.binding.ownerId, reason); return evaluate(input); };
        await s.run(); await s.run();
        const row = await s.read(); assert.equal(row.evidence, null); assert.equal(s.calls(), 1);
        assert.equal(row.state, reason === 'DELETED' ? 'deleted' : reason === 'CANCELLED' ? 'cancelled' : 'inconclusive');
        if (reason === 'DELETED') { assert.equal(row.binding, null); assert.equal(await imageDetectionStatus(s.deps, s.job.id, s.binding.ownerId), null); }
      }
    });

    await t.test('abort signal cancels processing without granting later success', async () => {
      const s = await seed(), controller = new AbortController();
      s.deps.evaluator.evaluate = async () => { controller.abort(); return new Promise(() => {}); };
      await s.run(controller.signal); assert.equal((await s.read()).state, 'cancelled'); assert.equal((await s.read()).evidence, null);
    });

    await t.test('current account, media version and cleanup fences are rechecked at settlement', async () => {
      for (const mutate of [s => admin.query("UPDATE identity.users SET deleted_at=clock_timestamp(),status='deleted' WHERE id=$1", [s.binding.ownerId]),
        s => admin.query('UPDATE media.objects SET sha256=$2 WHERE id=$1', [s.binding.objectId, 'e'.repeat(64)]),
        s => admin.query('UPDATE media.upload_sessions SET quarantine_deleted_at=clock_timestamp() WHERE id=$1', [s.binding.uploadSessionId])]) {
        const s = await seed(), evaluate = s.deps.evaluator.evaluate;
        s.deps.evaluator.evaluate = async input => { await mutate(s); return evaluate(input); };
        await s.run(); assert.equal((await s.read()).evidence, null); assert.notEqual((await s.read()).state, 'completed');
      }
    });

    await t.test('completed evidence is withdrawn after original cleanup or account deletion', async () => {
      const s = await seed(); await s.run(); await bucket.delete(s.binding.original.key);
      assert.equal((await imageDetectionStatus(s.deps, s.job.id, s.binding.ownerId)).status, 'inconclusive');
      assert.equal((await s.read()).evidence, null);
      const deleted = await seed(); await deleted.run();
      await admin.query("UPDATE identity.users SET deleted_at=clock_timestamp(),status='deleted' WHERE id=$1", [deleted.binding.ownerId]);
      assert.equal(await imageDetectionStatus(deleted.deps, deleted.job.id, deleted.binding.ownerId), null);
      assert.equal((await deleted.read()).binding, null);
    });

    await t.test('cleanup retry cannot revive a cancelled/deleted case or mutate another owner', async () => {
      const s = await seed(), other = await seed();
      await store.invalidate(s.job.id, other.binding.ownerId, 'DELETED');
      assert.equal((await s.read()).state, 'queued');
      await store.invalidate(s.job.id, s.binding.ownerId, 'CANCELLED');
      await store.invalidate(s.job.id, s.binding.ownerId, 'CLEANUP');
      assert.equal((await s.read()).state, 'cancelled');
      await s.run(); assert.equal(s.calls(), 0);
      await store.invalidate(s.job.id, s.binding.ownerId, 'DELETED');
      await store.invalidate(s.job.id, s.binding.ownerId, 'CLEANUP');
      await bucket.delete(s.binding.original.key);
      assert.equal((await s.read()).state, 'deleted'); assert.equal((await other.read()).state, 'queued');
    });

    await t.test('canonical deletion scrubs cancelled jobs even after original cleanup', async () => {
      for (const target of ['account', 'media', 'media-after-cleanup']) {
        const s = await seed(), other = await seed();
        await s.run();
        await store.invalidate(s.job.id, s.binding.ownerId, 'CANCELLED');
        assert.equal((await s.read()).state, 'cancelled');
        if (target === 'account') await admin.query("UPDATE identity.users SET deleted_at=clock_timestamp(),status='deleted' WHERE id=$1", [s.binding.ownerId]);
        else {
          if (target === 'media-after-cleanup') await admin.query('UPDATE media.upload_sessions SET quarantine_deleted_at=clock_timestamp() WHERE id=$1', [s.binding.uploadSessionId]);
          await admin.query("UPDATE media.objects SET deleted_at=clock_timestamp(),state='deleted' WHERE id=$1", [s.binding.objectId]);
        }
        assert.equal(await mf.request('/status', { id: s.job.id, ownerId: s.binding.ownerId }), null);
        const row = await s.read();
        assert.equal(row.state, 'deleted'); assert.equal(row.reason, 'DELETED');
        assert.equal(row.binding, null); assert.equal(row.evidence, null);
        await store.invalidate(s.job.id, s.binding.ownerId, 'CLEANUP');
        await store.invalidate(s.job.id, s.binding.ownerId, 'CANCELLED');
        assert.equal(await s.run(), 'ignored'); assert.equal(s.calls(), 1);
        assert.equal((await s.read()).state, 'deleted'); assert.equal((await other.read()).state, 'queued');
      }
    });

    await t.test('late result cannot preserve a cancelled binding after canonical deletion', async () => {
      const s = await seed(), evaluate = s.deps.evaluator.evaluate;
      s.deps.evaluator.evaluate = async input => {
        await store.invalidate(s.job.id, s.binding.ownerId, 'CANCELLED');
        await admin.query("UPDATE identity.users SET deleted_at=clock_timestamp(),status='deleted' WHERE id=$1", [s.binding.ownerId]);
        return evaluate(input);
      };
      await s.run();
      const raw = (await admin.query('SELECT state,binding,evidence FROM media.image_detection_jobs WHERE id=$1', [s.job.id])).rows[0];
      assert.deepEqual(raw, { state: 'deleted', binding: null, evidence: null });
    });

    await t.test('explicit owner deletion scrubs even an invalid binding hash', async () => {
      const s = await seed();
      await admin.query('UPDATE media.image_detection_jobs SET binding_hash=$2 WHERE id=$1', [s.job.id, 'f'.repeat(64)]);
      await store.invalidate(s.job.id, s.binding.ownerId, 'DELETED');
      assert.equal((await s.read()).binding, null); assert.equal((await s.read()).state, 'deleted');
    });

    await t.test('database constraints reject missing or authority-bearing evidence', async () => {
      const s = await seed(); await s.run();
      for (const evidence of [{}, { ...(await s.read()).evidence, policy: { publicationEligible: true } }]) {
        await assert.rejects(() => admin.query('UPDATE media.image_detection_jobs SET evidence=$2::jsonb WHERE id=$1',
          [s.job.id, JSON.stringify(evidence)]), error => error.code === '23514');
      }
    });

    await t.test('expiry and late callback cannot revive evaluation', async () => {
      const s = await seed();
      await admin.query("UPDATE media.image_detection_jobs SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [s.job.id]);
      await s.run(); assert.equal((await s.read()).reason, 'EXPIRED'); assert.equal(s.calls(), 0);
      const inconclusive = await seed(), evaluate = inconclusive.deps.evaluator.evaluate;
      inconclusive.deps.evaluator.evaluate = async input => ({ ...await evaluate(input), authorship: 'ABSTAIN' });
      await inconclusive.run(); assert.ok((await inconclusive.read()).evidence);
      await admin.query("UPDATE media.image_detection_jobs SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [inconclusive.job.id]);
      assert.equal((await inconclusive.read()).evidence, null); assert.equal((await inconclusive.read()).reason, 'EXPIRED');
    });
  } finally {
    await mf?.dispose(); await admin?.end();
    if (created) await control.query(`DROP DATABASE ${name}`);
    await control.end();
  }
});
