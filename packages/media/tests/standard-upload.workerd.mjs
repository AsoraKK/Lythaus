import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { standardUploadFixture } from './standard-upload-fixture.mjs';

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('actual standard-upload handlers, Queue dispatcher and local private R2', { timeout: 60_000 }, async t => {
  let state, snapshot, beforeQuery;
  const result = rows => ({ rows, rowCount: rows.length });
  const fixture = await standardUploadFixture(async input => {
    if (input.action === 'begin') { snapshot = structuredClone(state); return { transactionId: 'synthetic' }; }
    if (input.action === 'commit') return {};
    if (input.action === 'rollback') { state = snapshot; return {}; }
    const sql = input.text.replace(/\s+/g, ' ').trim(), values = input.values;
    if (beforeQuery) await beforeQuery(sql, values);
    if (sql === 'SELECT 1') return result([{}]);
    if (sql.startsWith('INSERT INTO system.consumer_inbox')) {
      if (state.inbox) return result([]);
      state.inbox = 'processing'; return result([{}]);
    }
    if (sql.startsWith('SELECT state, claimed_at FROM system.consumer_inbox')) return result([{ state: state.inbox }]);
    if (sql.startsWith('UPDATE system.consumer_inbox SET state')) { state.inbox = 'completed'; return result([{}]); }
    if (sql.startsWith('DELETE FROM system.consumer_inbox')) { state.inbox = null; return result([{}]); }
    if (sql.startsWith('SELECT') && sql.includes('FROM media.upload_sessions')) {
      if (state.session.purpose !== 'standard' || state.session.id !== values[0]) return result([]);
      if (sql.includes('object_key = $2') && values[1] !== state.session.object_key) return result([]);
      if (sql.includes('user_id = $2') && values[1] !== state.session.user_id) return result([]);
      if (sql.includes('expected_bytes = $4') && (values[2] !== state.session.object_key || values[4] !== state.session.checksum_sha256)) return result([]);
      return result([{ ...state.session }]);
    }
    if (sql.startsWith('UPDATE media.upload_sessions')) {
      const next = sql.match(/SET status = '(\w+)'/)[1];
      const expected = next === 'queued' || (next === 'rejected' && values.length === 2) ? 'pending' : 'queued';
      if (state.session.status !== expected || (next === 'queued' && !state.session.unexpired)) return result([]);
      state.session.status = next; return result([{ id: state.session.id }]);
    }
    if (sql.startsWith('INSERT INTO media.objects')) {
      if (state.objects.length) return result([]);
      state.objects.push({ id: values[0], state: values[5], sha256: values[4] }); return result([{ id: values[0] }]);
    }
    if (sql.includes('INSERT INTO media.moderation_results')) { state.evidence.push(JSON.parse(values[4])); return result([{}]); }
    if (sql.includes('INSERT INTO trust.user_activity_events')) {
      state.activity.push({ title: values[8], result: values[10], metadata: JSON.parse(values[17]) }); return result([{ id: values[0] }]);
    }
    if (sql.includes('INSERT INTO system.outbox_events')) { state.outbox.push({ id: values[0] }); return result([{}]); }
    if (sql.startsWith('UPDATE media.storage_ledger SET bytes_uploaded')) {
      if (state.reservationMissing) return result([]);
      state.ledgerWrites++; return result([{}]);
    }
    if (sql.startsWith('UPDATE media.storage_ledger')) { state.rejections++; return result([{}]); }
    if (sql.startsWith('INSERT INTO media.storage_ledger')) { state.ledgerWrites++; return result([{}]); }
    if (sql.startsWith('SELECT bytes_reserved')) return result([{ bytes_reserved: 0, bytes_approved: 0 }]);
    if (sql.startsWith('INSERT INTO media.upload_sessions')) return result([{}]);
    if (sql.startsWith('INSERT INTO media.ownership') || sql.startsWith('INSERT INTO media.variants') || sql.startsWith('INSERT INTO system.rate_limit_windows')) return result([{}]);
    throw new Error('unexpected_fixture_sql:' + sql.slice(0, 90));
  });
  async function seed(status = 'queued', overrides = {}) {
    beforeQuery = undefined;
    const id = randomUUID(), user_id = randomUUID();
    state = { session: { id, user_id, object_key: `quarantine/${user_id}/${id}`, expected_bytes: png.length,
      checksum_sha256: digest(png), content_type: 'image/png', purpose: 'standard', status, unexpired: true, ...overrides },
      inbox: null, objects: [], evidence: [], activity: [], outbox: [], ledgerWrites: 0, rejections: 0 };
    await fixture.quarantine.put(state.session.object_key, png, { httpMetadata: { contentType: 'image/png' } });
    fixture.statements.length = 0;
    return { userId: state.session.user_id, sessionId: state.session.id,
      event: { eventId: randomUUID(), eventType: 'media.upload.finalised',
        payload: { uploadSessionId: state.session.id, objectKey: state.session.object_key } } };
  }
  const queue = async input => (await fixture.request('/fixture/queue', input)).json();
  try {
    await t.test('disabled routes expose feature_disabled and enabled guest routes require authentication', async () => {
      for (const path of ['/api/media/uploads', `/api/media/uploads/${randomUUID()}/finalise`]) {
        const disabled = await fixture.runtime.dispatchFetch('https://local.test' + path, { method: 'POST' });
        assert.equal(disabled.status, 404);
        assert.equal((await disabled.json()).error, 'feature_disabled');
        const guest = await fixture.runtime.dispatchFetch('https://local.test' + path, { method: 'POST', headers: { 'x-fixture-enabled': 'true' } });
        assert.equal(guest.status, 401);
        assert.equal((await guest.json()).error, 'authentication_required');
      }
      assert.ok(!fixture.statements.some(x => /media\./.test(x.text ?? '')));
    });
    await t.test('owner finalization returns a private queued receipt, no publication or storage locator', async () => {
      const input = await seed('pending');
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('vary'), 'Origin, Authorization');
      assert.deepEqual(Object.keys(await response.json()).sort(), ['eventId', 'status', 'uploadSessionId']);
      assert.equal(state.session.status, 'queued');
      assert.equal(state.outbox.length, 1);
      assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
      assert.equal(state.outbox.length, 1);
    });
    await t.test('another owner, private-purpose upload and expired session cannot finalize or read bytes', async () => {
      for (const scenario of ['other-owner', 'alpha', 'expired']) {
        const input = await seed('pending', scenario === 'alpha' ? { purpose: 'authenticity_alpha' }
          : scenario === 'expired' ? { unexpired: false } : {});
        if (scenario === 'other-owner') input.userId = randomUUID();
        assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
        assert.equal(state.outbox.length, 0);
        assert.equal(state.session.status, 'pending');
        assert.equal(fixture.statements.filter(x => x.action === 'begin').length, 0);
      }
    });
    await t.test('expiry at the final state transition prevents outbox and activity writes', async () => {
      const input = await seed('pending');
      beforeQuery = sql => { if (sql.startsWith('UPDATE media.upload_sessions')) state.session.unexpired = false; };
      assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
      assert.equal(state.outbox.length, 0);
      assert.equal(state.activity.length, 0);
    });
    await t.test('MIME spoofing rejects once, releases reservation once and keeps cleanup unclaimed', async () => {
      const input = await seed('pending', { content_type: 'image/jpeg' });
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal((await response.json()).error, 'unsupported_media_type');
      await fixture.request('/fixture/finalise', input);
      assert.equal(state.rejections, 1);
      assert.equal(state.session.status, 'rejected');
      assert.ok(await fixture.quarantine.head(state.session.object_key));
    });
    await t.test('disabled processing retries and does not mark the consumer inbox complete', async () => {
      const input = await seed();
      assert.deepEqual(await queue({ ...input, enabled: false }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.inbox, null);
      assert.equal(state.objects.length, 0);
    });
    await t.test('rewritten source bytes fail checksum before decoder, settlement and cleanup are idempotent', async () => {
      const input = await seed();
      const changed = png.slice(); changed[11] = 1;
      await fixture.quarantine.put(state.session.object_key, changed);
      assert.deepEqual(await queue({ ...input, failDelete: true }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.session.status, 'rejected');
      assert.equal(state.rejections, 1);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(state.rejections, 1);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.equal(state.objects.length, 0);
    });
    await t.test('private-purpose and expired sessions never decode or create review objects', async () => {
      for (const overrides of [{ purpose: 'authenticity_alpha' }, { status: 'expired' }]) {
        const input = await seed('queued', overrides);
        assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
        assert.equal(state.objects.length, 0);
        assert.ok(await fixture.quarantine.head(state.session.object_key));
      }
    });
    await t.test('decoder failures retain source and retry; malformed output cannot enter approved storage', async () => {
      const input = await seed();
      assert.deepEqual(await queue({ ...input, decoderFailure: true }), { ack: 0, retry: 1, imageCalls: 1 });
      assert.ok(await fixture.quarantine.head(state.session.object_key));
      assert.deepEqual(await queue({ ...input, transformed: [0, 1, 2] }), { ack: 0, retry: 1, imageCalls: 1 });
      assert.deepEqual(await queue({ ...input, oversizedTransform: true }), { ack: 1, retry: 0, imageCalls: 1 });
      assert.equal(state.objects.length, 0);
      assert.equal(await fixture.approved.head(`approved/${input.userId}/${input.sessionId}.webp`), null);
    });
    await t.test('invalid dimensions reject before transform, including fractional and negative values', async () => {
      for (const dimensions of [{ width: -1, height: 1 }, { width: 1.5, height: 1 }, { width: 40000001, height: 1 }]) {
        const input = await seed();
        assert.deepEqual(await queue({ ...input, dimensions }), { ack: 1, retry: 0, imageCalls: 1 });
        assert.equal(state.session.status, 'rejected');
        assert.equal(state.objects.length, 0);
      }
    });
    await t.test('deleted session state blocks processing at the initial lock', async () => {
      const input = await seed();
      beforeQuery = sql => { if (sql.includes('FROM media.upload_sessions') && sql.includes('FOR UPDATE NOWAIT')) state.session.status = 'expired'; };
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.objects.length, 0);
      assert.equal(state.evidence.length, 0);
      assert.equal(state.ledgerWrites, 0);
    });
    await t.test('review evidence persistence failure rolls back database effects and retries', async () => {
      const input = await seed();
      beforeQuery = sql => { if (sql.includes('INSERT INTO media.moderation_results')) throw new Error('synthetic_evidence_unavailable'); };
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 1 });
      assert.equal(state.session.status, 'queued');
      assert.equal(state.objects.length, 0);
      assert.equal(state.evidence.length, 0);
      assert.equal(state.ledgerWrites, 0);
      assert.ok(await fixture.quarantine.head(state.session.object_key));
      beforeQuery = undefined;
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(state.objects.length, 1);
      assert.equal(state.evidence.length, 1);
    });
    await t.test('a missing reservation cannot settle a review object or invent a ledger', async () => {
      const input = await seed();
      state.reservationMissing = true;
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 1 });
      assert.equal(state.session.status, 'queued');
      assert.equal(state.objects.length, 0);
      assert.equal(state.evidence.length, 0);
      assert.equal(state.ledgerWrites, 0);
    });
    await t.test('processing remains private review with unavailable evidence, and duplicate delivery has no repeated effect', async () => {
      const input = await seed();
      assert.deepEqual(await queue({ ...input, failDelete: true }), { ack: 0, retry: 1, imageCalls: 1 });
      assert.equal(state.objects.length, 1);
      assert.equal(state.objects[0].state, 'review');
      assert.equal(state.evidence.length, 1);
      assert.equal(state.evidence[0].recommendation, 'review');
      assert.equal(state.evidence[0].reviewRequired, true);
      assert.equal(state.evidence[0].policyVersion, 'evaluation-only-v1');
      assert.equal(state.evidence[0].modelId, 'not-executed');
      assert.equal(state.activity.at(-1).metadata.moderationState, 'under_review');
      assert.equal(state.activity.at(-1).result, 'pending');
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(state.objects.length, 1);
      assert.equal(state.evidence.length, 1);
      assert.equal(state.ledgerWrites, 1);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.ok(!fixture.statements.some(x => /(?:INSERT INTO|UPDATE) (?:content|feed)\./.test(x.text ?? '')));
      assert.equal(fixture.outbound.length, 0);
    });
  } finally { await fixture.dispose(); }
});
