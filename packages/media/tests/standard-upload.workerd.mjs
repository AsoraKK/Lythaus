import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import test from 'node:test';
import { standardUploadFixture } from './standard-upload-fixture.mjs';
import { createExifGpsJpeg } from './image-fixtures.mjs';
import { verifyImageReviewEvidence } from '../../authenticity/src/image-review-evidence.ts';
import '../../../apps/lythaus-jobs/tests/image-detection-acceptance.workerd.mjs';

const png = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } } }).png().toBuffer());
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('actual standard-upload handlers, Queue dispatcher and local private R2', { timeout: 60_000 }, async t => {
  let state, snapshot, beforeQuery;
  const effects = [];
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
    if (sql.startsWith('SELECT status, deleted_at FROM identity.users')) return result([state.account]);
    if (sql.startsWith('SELECT id FROM system.outbox_events')) {
      return result(state.outbox.filter(event => event.actorId === values[0] && event.aggregateId === values[1]
        && event.payload.uploadSessionId === values[1] && event.payload.objectKey === values[2]).slice(0, 2));
    }
    if (sql.startsWith('SELECT EXISTS (SELECT 1 FROM media.objects')) {
      const key = values[0];
      return result([{ referenced: state.objects.some(object => object.object_key === key)
        || state.variants.some(variant => variant.object_key === key) }]);
    }
    if (sql.startsWith('SELECT COALESCE(sum(expected_bytes), 0) AS cleanup_bytes')) {
      const session = state.session;
      return result([{ cleanup_bytes: session?.user_id === values[0] && session.purpose === 'standard'
        && ['approved', 'rejected', 'expired', 'cancelled'].includes(session.status) && !session.quarantine_deleted_at
        ? session.expected_bytes : 0 }]);
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM media.upload_sessions')) {
      if (!state.session) return result([]);
      if (sql.startsWith('SELECT s.id, s.status') && (state.account.status !== 'active' || state.account.deleted_at !== null)) return result([]);
      if (sql.startsWith('SELECT id, user_id FROM media.upload_sessions')) {
        const terminal = ['approved', 'rejected', 'expired', 'cancelled'].includes(state.session.status);
        const due = state.session.cleanupDue === true;
        const pendingExpired = ['pending', 'queued'].includes(state.session.status) && !state.session.unexpired;
        return result(pendingExpired || (terminal && due && !state.session.quarantine_deleted_at)
          ? [{ id: state.session.id, user_id: state.session.user_id }]
          : []);
      }
      if (state.session.purpose !== 'standard' || state.session.id !== values[0]) return result([]);
      if (sql.includes('object_key = $2') && values[1] !== state.session.object_key) return result([]);
      if (sql.includes('user_id = $2') && values[1] !== state.session.user_id) return result([]);
      if (sql.includes('expected_bytes = $4') && (values[2] !== state.session.object_key || values[4] !== state.session.checksum_sha256)) return result([]);
      if (sql.includes('cleanup_due')) return result([{ object_key: state.session.object_key,
        expected_bytes: state.session.expected_bytes, status: state.session.status,
        expired: !state.session.unexpired, cleanup_due: state.session.cleanupDue === true,
        cleanup_pending: !state.session.quarantine_deleted_at }]);
      return result([{ ...state.session }]);
    }
    if (sql.startsWith('UPDATE media.upload_sessions SET observed_bytes')) {
      if (state.session.status !== 'pending' || !state.session.unexpired) return result([]);
      state.session.observed_bytes = values[0]; return result([{ id: state.session.id }]);
    }
    if (sql.startsWith('UPDATE media.upload_sessions SET quarantine_deleted_at')) {
      state.session.quarantine_deleted_at = true; return result([{ id: state.session.id }]);
    }
    if (sql.startsWith('UPDATE media.upload_sessions')) {
      const next = sql.match(/SET status = '(\w+)'/)[1];
      const allowed = sql.includes("status = 'pending'") ? ['pending']
        : sql.includes("status IN ('pending', 'queued')") ? ['pending', 'queued'] : ['queued'];
      if (!allowed.includes(state.session.status)
        || ((next === 'queued' || next === 'approved') && !state.session.unexpired)
        || (next === 'expired' && state.session.unexpired && state.account.status === 'active')) return result([]);
      state.session.status = next; return result([{ id: state.session.id }]);
    }
    if (sql.startsWith('INSERT INTO media.objects')) {
      if (state.objects.length) return result([]);
      state.objects.push({ id: values[0], object_key: values[2], state: values[5], sha256: values[4] }); return result([{ id: values[0] }]);
    }
    if (sql.includes('INSERT INTO media.moderation_results')) { state.evidence.push(JSON.parse(values[4])); return result([{}]); }
    if (sql.includes('INSERT INTO trust.user_activity_events')) {
      state.activity.push({ title: values[8], result: values[10], metadata: JSON.parse(values[17]) }); return result([{ id: values[0] }]);
    }
    if (sql.includes('INSERT INTO system.outbox_events')) {
      state.outbox.push({ id: values[0], aggregateId: values[1], actorId: values[2], payload: JSON.parse(values[3]) }); return result([{}]);
    }
    if (sql.startsWith('UPDATE media.storage_ledger SET bytes_uploaded')) {
      if (state.reservationMissing || state.ledgerReserved < Number(values[2])) return result([]);
      state.ledgerReserved -= Number(values[2]);
      state.ledgerUploaded += Number(values[1]);
      state.ledgerApproved += Number(values[1]);
      state.ledgerWrites++; return result([{}]);
    }
    if (sql.startsWith('UPDATE media.storage_ledger SET bytes_reserved = bytes_reserved -')) {
      if (state.reservationMissing || state.ledgerReserved < Number(values[0])) return result([]);
      state.ledgerReserved -= Number(values[0]);
      if (sql.includes('bytes_rejected = bytes_rejected +')) {
        state.ledgerRejected += Number(values[0]);
        state.rejections++;
      }
      state.ledgerWrites++; return result([{}]);
    }
    if (sql.startsWith('UPDATE media.storage_ledger')) { state.rejections++; return result([{}]); }
    if (sql.startsWith('INSERT INTO media.storage_ledger')) {
      state.ledgerWrites++;
      if (sql.includes('bytes_reserved')) state.ledgerReserved += Number(values[1]);
      return result([{}]);
    }
    if (sql.startsWith('SELECT bytes_reserved')) return result([{ bytes_reserved: state.ledgerReserved, bytes_approved: state.ledgerApproved }]);
    if (sql.startsWith('INSERT INTO media.upload_sessions')) {
      state.session = { id: values[0], user_id: values[1], object_key: values[2], content_type: values[3],
        expected_bytes: Number(values[4]), checksum_sha256: values[5], expires_at: values[6], purpose: 'standard',
        status: 'pending', unexpired: true, cleanupDue: false, quarantine_deleted_at: null };
      return result([{}]);
    }
    if (sql.startsWith('INSERT INTO media.variants')) {
      state.variants.push({ object_key: values[2] }); return result([{}]);
    }
    if (sql.startsWith('INSERT INTO media.ownership') || sql.startsWith('INSERT INTO system.rate_limit_windows')) return result([{}]);
    throw new Error('unexpected_fixture_sql:' + sql.slice(0, 90));
  }, async effect => effects.push(effect));
  async function seed(status = 'queued', overrides = {}) {
    beforeQuery = undefined;
    const id = randomUUID(), user_id = randomUUID();
    state = { account: { status: 'active', deleted_at: null }, ledgerReserved: status === 'expired' ? 0 : png.length, ledgerRejected: 0,
      ledgerUploaded: 0, ledgerApproved: 0, session: { id, user_id, object_key: `quarantine/${user_id}/${id}`, expected_bytes: png.length,
      checksum_sha256: digest(png), content_type: 'image/png', purpose: 'standard', status, unexpired: true,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), cleanupDue: false, quarantine_deleted_at: null, ...overrides },
      inbox: null, objects: [], variants: [], evidence: [], activity: [], outbox: [], ledgerWrites: 0, rejections: 0 };
    if (status === 'queued' || overrides.withObject !== false) {
      await fixture.quarantine.put(state.session.object_key, png, { httpMetadata: { contentType: 'image/png' } });
    }
    fixture.statements.length = 0;
    const input = { userId: state.session.user_id, sessionId: state.session.id,
      event: { eventId: randomUUID(), eventType: 'media.upload.finalised',
        payload: { uploadSessionId: state.session.id, objectKey: state.session.object_key } } };
    if (status !== 'pending') state.outbox.push({ id: input.event.eventId, actorId: input.userId,
      aggregateId: input.sessionId, payload: structuredClone(input.event.payload) });
    return input;
  }
  const queue = async input => (await fixture.request('/fixture/queue', input)).json();
  const create = async (userId, bytes = png, contentType = 'image/png') => fixture.request('/fixture/create', { userId,
    upload: { contentType, size: bytes.length, checksumSha256: digest(bytes) } });
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
      const disabledPut = await fixture.runtime.dispatchFetch(`https://local.test/api/media/uploads/${randomUUID()}/bytes`, { method: 'PUT' });
      assert.equal(disabledPut.status, 404);
      assert.equal((await disabledPut.json()).error, 'feature_disabled');
      const guestPut = await fixture.runtime.dispatchFetch(`https://local.test/api/media/uploads/${randomUUID()}/bytes`, {
        method: 'PUT', headers: { 'x-fixture-enabled': 'true', 'content-type': 'image/png' }, body: png,
      });
      assert.equal(guestPut.status, 401);
      assert.equal((await guestPut.json()).error, 'authentication_required');
      const statusUrl = `https://local.test/api/media/uploads/${randomUUID()}`;
      const disabledStatus = await fixture.runtime.dispatchFetch(statusUrl);
      assert.equal(disabledStatus.status, 404);
      assert.equal((await disabledStatus.json()).error, 'feature_disabled');
      const guestStatus = await fixture.runtime.dispatchFetch(statusUrl, { headers: { 'x-fixture-enabled': 'true' } });
      assert.equal(guestStatus.status, 401);
      assert.equal((await guestStatus.json()).error, 'authentication_required');
      assert.ok(!fixture.statements.some(x => /media\./.test(x.text ?? '')));
    });
    await t.test('private status never turns integrity completion into detector or publication approval', async () => {
      for (const [stored, expected] of [['pending', 'pending'], ['queued', 'queued'], ['approved', 'review'],
        ['rejected', 'rejected'], ['expired', 'expired'], ['cancelled', 'cancelled']]) {
        const input = await seed(stored);
        const response = await fixture.request('/fixture/status', input);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.deepEqual(await response.json(), { uploadSessionId: input.sessionId, status: expected,
          expiresAt: state.session.expires_at, processingComplete: stored === 'approved', safety: { status: 'not_run' },
          authenticity: { status: 'not_run' }, publication: { allowed: false }, private: true });
        assert.equal(state.outbox.length, stored === 'pending' ? 0 : 1);
        assert.equal(state.ledgerWrites, 0);
      }
      const input = await seed('queued', { unexpired: false });
      assert.equal((await (await fixture.request('/fixture/status', input)).json()).status, 'expired');
      state.session.status = 'future_success';
      assert.equal((await fixture.request('/fixture/status', input)).status, 404);
    });
    await t.test('status conceals missing, nonstandard, inactive and other-owner sessions', async () => {
      const input = await seed('approved');
      for (const patch of [{ userId: randomUUID() }, { sessionId: randomUUID() }, { sessionId: 'invalid' }]) {
        assert.equal((await fixture.request('/fixture/status', { ...input, ...patch })).status, 404);
      }
      for (const status of ['suspended', 'deleting']) {
        state.account.status = status;
        assert.equal((await fixture.request('/fixture/status', input)).status, 404);
      }
      state.account.status = 'active'; state.account.deleted_at = '2026-10-22T00:00:00Z';
      assert.equal((await fixture.request('/fixture/status', input)).status, 404);
      state.account.deleted_at = null; state.session.purpose = 'beta';
      assert.equal((await fixture.request('/fixture/status', input)).status, 404);
    });
    await t.test('unsupported image-bearing post bodies cannot write posts or outbox events', async () => {
      const input = await seed('approved');
      for (const attachment of [{ mediaUrl: 'https://example.invalid/private.png' }, { contentType: 'image' },
        { mediaIds: [input.sessionId] }, { attachments: [{ uploadSessionId: input.sessionId }] },
        { image: {} }, { mediaUrl: null }, { attachments: [] }]) {
        fixture.statements.length = 0;
        const response = await fixture.request('/fixture/post', { userId: input.userId,
          post: { body: 'Synthetic caption', declaredCreationMode: 'human', geoScope: 'none', ...attachment } });
        assert.equal(response.status, 415);
        assert.equal((await response.json()).error, 'unsupported_content_type');
        assert.equal(fixture.statements.length, 0);
        assert.equal(state.outbox.length, 1);
      }
    });
    await t.test('upload URL is a session-checked Worker route with no reusable R2 signature', async () => {
      await seed('pending', { withObject: false });
      state.ledgerReserved = 0;
      const userId = randomUUID();
      state.account = { status: 'active', deleted_at: null };
      const response = await create(userId);
      assert.equal(response.status, 201);
      const receipt = await response.json();
      const uploadUrl = new URL(receipt.uploadUrl);
      assert.equal(uploadUrl.origin, 'https://local.test');
      assert.match(uploadUrl.pathname, /^\/api\/media\/uploads\/[0-9a-f-]+\/bytes$/);
      assert.equal(uploadUrl.search, '');
      assert.ok(Date.parse(receipt.expiresAt) > Date.now());
      assert.equal('objectKey' in receipt, false);
      assert.equal(state.session.id, receipt.uploadSessionId);
      assert.equal(Number(state.ledgerReserved), png.length);
      const originalKey = state.session.object_key;
      const wrongOwner = await fixture.upload(receipt.uploadUrl, randomUUID(), png);
      assert.equal(wrongOwner.status, 409);
      assert.equal(await fixture.quarantine.head(originalKey), null);
      const input = { userId, sessionId: state.session.id, event: { eventId: randomUUID(), eventType: 'media.upload.finalised',
        payload: { uploadSessionId: state.session.id, objectKey: originalKey } } };
      const tooLarge = await fixture.upload(receipt.uploadUrl, userId, Uint8Array.from([...png, 0]));
      assert.equal(tooLarge.status, 413);
      assert.equal(await fixture.quarantine.head(originalKey), null);
      const wrongMime = await fixture.upload(receipt.uploadUrl, userId, png, 'image/jpeg');
      assert.equal(wrongMime.status, 415);
      const altered = png.slice(); altered[11] = 1;
      const wrongChecksum = await fixture.upload(receipt.uploadUrl, userId, altered);
      assert.equal(wrongChecksum.status, 400);
      assert.equal(await fixture.quarantine.head(originalKey), null);
      const uploaded = await fixture.upload(receipt.uploadUrl, userId, png);
      assert.equal(uploaded.status, 201);
      const finalised = await fixture.request('/fixture/finalise', input);
      assert.equal(finalised.status, 200);
      input.event.eventId = (await finalised.json()).eventId;
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 1 });
      assert.equal(state.session.status, 'approved');
      assert.ok(Date.parse(receipt.expiresAt) > Date.now(), 'the reused URL must still be within the session window');
      const replay = await fixture.upload(receipt.uploadUrl, userId, png);
      assert.equal(replay.status, 409);
      assert.equal(await fixture.quarantine.head(originalKey), null);
    });
    await t.test('actual quarantine bytes obey the configured per-owner aggregate reservation cap', async () => {
      await seed('pending', { withObject: false });
      state.ledgerReserved = 0;
      const userId = randomUUID();
      const large = new Uint8Array(6 * 1024 * 1024);
      large.set([137, 80, 78, 71, 13, 10, 26, 10]);
      const first = await create(userId, large);
      assert.equal(first.status, 201);
      const receipt = await first.json();
      assert.equal((await fixture.upload(receipt.uploadUrl, userId, large)).status, 201);
      const key = state.session.object_key;
      const second = await create(userId, large);
      assert.equal(second.status, 400);
      assert.equal((await second.json()).error, 'storage_quota_exceeded');
      assert.equal(Number(state.ledgerReserved), large.byteLength);
      assert.equal((await fixture.quarantine.head(key)).size, large.byteLength);
      assert.equal(state.session.id, receipt.uploadSessionId);
    });
    await t.test('EXIF-oriented JPEG produces a rotated metadata-free private WebP derivative', async () => {
      const jpeg = new Uint8Array(await createExifGpsJpeg());
      const sourceMetadata = await sharp(jpeg).metadata();
      assert.equal(sourceMetadata.orientation, 6);
      assert.ok(sourceMetadata.exif?.byteLength);
      assert.ok(sourceMetadata.exif.includes(Buffer.from('Lythaus fixture')));
      assert.ok(sourceMetadata.exif.includes(Buffer.from([0x25, 0x88])), 'source contains an EXIF GPSInfo IFD');
      await seed('pending', { withObject: false });
      state.ledgerReserved = 0;
      const userId = randomUUID();
      const created = await create(userId, jpeg, 'image/jpeg');
      assert.equal(created.status, 201);
      const receipt = await created.json();
      const upload = await fixture.upload(receipt.uploadUrl, userId, jpeg, 'image/jpeg');
      assert.equal(upload.status, 201);
      const originalKey = state.session.object_key;
      const input = { userId, sessionId: state.session.id, event: { eventId: randomUUID(), eventType: 'media.upload.finalised',
        payload: { uploadSessionId: state.session.id, objectKey: originalKey } } };
      const finalised = await fixture.request('/fixture/finalise', input);
      assert.equal(finalised.status, 200);
      input.event.eventId = (await finalised.json()).eventId;
      effects.length = 0;
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 1 });
      const object = state.objects[0];
      assert.equal(object.state, 'review');
      assert.equal(await fixture.quarantine.head(originalKey), null);
      const stored = await fixture.approved.get(object.object_key);
      assert.ok(stored);
      const derivativeBytes = new Uint8Array(await stored.arrayBuffer());
      const derivativeMetadata = await sharp(derivativeBytes).metadata();
      assert.equal(derivativeMetadata.format, 'webp');
      assert.deepEqual([derivativeMetadata.width, derivativeMetadata.height], [2, 3]);
      assert.equal(derivativeMetadata.orientation, undefined);
      assert.equal(derivativeMetadata.exif, undefined);
      assert.equal(derivativeMetadata.xmp, undefined);
      const review = state.evidence[0].imageReview;
      assert.equal(await verifyImageReviewEvidence(review, { ...review.binding, ownerId: userId,
        uploadSessionId: state.session.id, sourceEventId: input.event.eventId, objectId: object.id,
        sourceSha256: digest(jpeg), derivativeSha256: digest(derivativeBytes) }), true);
      assert.equal(review.provenance.exifPresent, true);
      assert.equal(review.provenance.cameraOrigin, 'UNKNOWN');
      assert.equal(review.authorship.state, 'ABSTAIN');
      assert.equal(review.safety.state, 'NOT_RUN');
      assert.equal(review.policy.publicationEligible, false);
      assert.doesNotMatch(JSON.stringify(review), /Lythaus fixture|GPS|quarantine\/|approved\//);
      const head = await fixture.approved.head(object.object_key);
      assert.equal(head.size, derivativeBytes.length);
      assert.deepEqual([head.customMetadata.width, head.customMetadata.height], ['2', '3']);
      const transform = effects.find(effect => effect.type === 'transform');
      assert.deepEqual(transform.options, { format: 'image/webp', quality: 85, anim: false });
      assert.ok(!fixture.statements.some(statement => /(?:INSERT INTO|UPDATE) (?:content|feed)\./.test(statement.text ?? '')));
      assert.equal(fixture.outbound.length, 0);
    });
    await t.test('output info failures and invalid dimensions retry without persisting or exposing a derivative', async () => {
      const invalid = [
        ['output info exception', { outputInfoFailure: true }],
        ['missing width', { outputDimensions: { height: 3 } }],
        ['zero width', { outputDimensions: { width: 0, height: 3 } }],
        ['fractional width', { outputDimensions: { width: 1.5, height: 3 } }],
        ['NaN width', { outputDimensions: { width: 'NaN', height: 3 } }],
        ['over-limit pixels', { outputDimensions: { width: 40000001, height: 1 } }],
      ];
      for (const [label, overrides] of invalid) {
        const input = await seed();
        const key = `approved/${input.userId}/${input.sessionId}.webp`;
        assert.deepEqual(await queue({ ...input, ...overrides }), { ack: 0, retry: 1, imageCalls: 1 }, label);
        assert.equal(state.session.status, 'queued', label);
        assert.equal(state.objects.length, 0, label);
        assert.equal(await fixture.approved.head(key), null, label);
        assert.ok(await fixture.quarantine.head(state.session.object_key), label);
      }
    });
    await t.test('still-valid upload URL cannot recreate bytes after account deletion', async () => {
      await seed('pending', { withObject: false });
      state.ledgerReserved = 0;
      const userId = randomUUID();
      const response = await create(userId);
      assert.equal(response.status, 201);
      const receipt = await response.json();
      const uploadUrl = receipt.uploadUrl;
      state.account = { status: 'deleted', deleted_at: new Date().toISOString() };
      state.session.status = 'expired';
      state.ledgerReserved = 0;
      assert.ok(Date.parse(receipt.expiresAt) > Date.now());
      const replay = await fixture.upload(uploadUrl, userId, png);
      assert.equal(replay.status, 409);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.equal(state.ledgerReserved, 0);
    });
    await t.test('expired pending-session janitor releases logical quota and marks private cleanup', async () => {
      const input = await seed('pending', { unexpired: false, cleanupDue: true });
      const key = state.session.object_key;
      const first = await fixture.cleanup({ failDelete: true });
      assert.equal(first.status, 204);
      assert.equal(state.session.status, 'expired');
      assert.equal(state.ledgerReserved, 0);
      assert.equal(state.session.quarantine_deleted_at, null);
      assert.ok(await fixture.quarantine.head(key));
      beforeQuery = sql => {
        if (sql.startsWith('UPDATE media.upload_sessions SET quarantine_deleted_at')) {
          beforeQuery = undefined;
          throw new Error('synthetic_cleanup_commit_lost');
        }
      };
      const lostCommit = await fixture.cleanup();
      assert.equal(lostCommit.status, 204);
      assert.equal(state.ledgerReserved, 0);
      assert.equal(state.session.quarantine_deleted_at, null);
      assert.equal(await fixture.quarantine.head(key), null);
      beforeQuery = undefined;
      const retry = await fixture.cleanup();
      assert.equal(retry.status, 204);
      assert.equal(state.session.quarantine_deleted_at, true);
      assert.equal(await fixture.quarantine.head(key), null);
      const writes = state.ledgerWrites;
      await fixture.cleanup();
      assert.equal(state.ledgerWrites, writes);
      assert.equal(state.ledgerReserved, 0);
      assert.equal(input.sessionId, state.session.id);
    });
    await t.test('cleanup failure and a lost marker keep terminal staging charged to the existing quota', async () => {
      const input = await seed('pending', { unexpired: false, cleanupDue: true });
      state.ledgerApproved = 10485760 - png.length;
      for (let attempt = 0; attempt < 3; attempt++) {
        assert.equal((await fixture.cleanup({ failDelete: true })).status, 204);
        assert.equal(state.ledgerReserved, 0);
        assert.equal(state.session.status, 'expired');
        assert.equal((await create(input.userId)).status, 400);
        assert.ok(await fixture.quarantine.head(state.session.object_key));
        assert.equal(state.session.id, input.sessionId);
      }
      beforeQuery = sql => {
        if (sql.startsWith('UPDATE media.upload_sessions SET quarantine_deleted_at')) {
          beforeQuery = undefined;
          throw new Error('synthetic_cleanup_commit_lost');
        }
      };
      const key = state.session.object_key;
      assert.equal((await fixture.cleanup()).status, 204);
      assert.equal(await fixture.quarantine.head(key), null);
      assert.equal(state.session.quarantine_deleted_at, null);
      assert.equal((await create(input.userId)).status, 400);
      assert.equal((await fixture.cleanup()).status, 204);
      assert.equal(state.session.quarantine_deleted_at, true);
      assert.equal((await create(input.userId)).status, 201);
      assert.equal(state.ledgerReserved, png.length);
    });
    await t.test('owner finalization returns a private queued receipt, no publication or storage locator', async () => {
      const input = await seed('pending');
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('vary'), 'Origin, Authorization');
      const receipt = await response.json();
      assert.deepEqual(Object.keys(receipt).sort(), ['eventId', 'status', 'uploadSessionId']);
      input.event.eventId = receipt.eventId;
      assert.equal(state.session.status, 'queued');
      assert.equal(state.outbox.length, 1);
      const retry = await fixture.request('/fixture/finalise', input);
      assert.equal(retry.status, 200);
      assert.equal(retry.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(await retry.json(), receipt);
      assert.equal(state.outbox.length, 1);
      assert.equal(state.activity.length, 1);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 1 });
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      const processedRetry = await fixture.request('/fixture/finalise', input);
      assert.equal(processedRetry.status, 200);
      assert.deepEqual(await processedRetry.json(), receipt);
      assert.equal(state.objects[0].state, 'review');
      assert.equal(state.evidence[0].modelId, 'not-executed');
      assert.equal(state.outbox.length, 1);
    });
    await t.test('retry receipts require one canonical owner and source-bound event', async () => {
      for (const alter of [state => { state.outbox.length = 0; },
        state => { state.outbox.push({ ...state.outbox[0] }); },
        state => { state.outbox[0].actorId = randomUUID(); },
        state => { state.outbox[0].payload.objectKey = 'unrelated-private-key'; }]) {
        const input = await seed('pending');
        assert.equal((await fixture.request('/fixture/finalise', input)).status, 200);
        alter(state);
        const writes = state.activity.length;
        assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
        assert.equal(state.activity.length, writes);
        assert.equal(state.session.status, 'queued');
      }
    });
    await t.test('another owner and private-purpose upload cannot finalize or read bytes', async () => {
      for (const scenario of ['other-owner', 'alpha']) {
        const input = await seed('pending', scenario === 'alpha' ? { purpose: 'authenticity_alpha' } : {});
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
    await t.test('expired pending finalization releases its reservation and retries private deletion', async () => {
      const input = await seed('pending', { unexpired: false });
      assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
      assert.equal(state.session.status, 'expired');
      assert.equal(state.ledgerReserved, 0);
      assert.equal(state.outbox.length, 0);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.equal((await fixture.request('/fixture/finalise', input)).status, 400);
      assert.equal(state.ledgerReserved, 0);
    });
    await t.test('MIME spoofing rejects once, releases reservation once and removes quarantine bytes', async () => {
      const input = await seed('pending', { content_type: 'image/jpeg' });
      const response = await fixture.request('/fixture/finalise', input);
      assert.equal((await response.json()).error, 'unsupported_media_type');
      await fixture.request('/fixture/finalise', input);
      assert.equal(state.rejections, 1);
      assert.equal(state.session.status, 'rejected');
      assert.equal(state.ledgerReserved, 0);
      assert.equal(state.ledgerRejected, png.length);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
    });
    await t.test('disabled processing retries and does not mark the consumer inbox complete', async () => {
      const input = await seed();
      assert.deepEqual(await queue({ ...input, enabled: false }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.inbox, null);
      assert.equal(state.objects.length, 0);
    });
    await t.test('forged, ambiguous and owner/source-mismatched jobs cannot inspect or settle media', async () => {
      for (const alter of [
        (input) => { input.event.eventId = randomUUID(); },
        () => { state.outbox.length = 0; },
        () => { state.outbox.push({ ...state.outbox[0], id: randomUUID() }); },
        () => { state.outbox[0].actorId = randomUUID(); },
        () => { state.outbox[0].aggregateId = randomUUID(); },
        () => { state.outbox[0].payload.objectKey = 'other-private-key'; },
        () => { state.outbox[0].payload.uploadSessionId = randomUUID(); },
      ]) {
        const input = await seed();
        alter(input);
        assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
        assert.equal(state.session.status, 'queued');
        assert.equal(state.ledgerWrites, 0);
        assert.equal(state.evidence.length, 0);
        assert.equal(state.objects.length, 0);
        assert.ok(await fixture.quarantine.head(state.session.object_key));
      }
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
    await t.test('private-purpose sessions never decode or create review objects', async () => {
      const input = await seed('queued', { purpose: 'authenticity_alpha' });
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.objects.length, 0);
      assert.ok(await fixture.quarantine.head(state.session.object_key));
    });
    await t.test('expired queue work releases quota and retries both private bucket deletions', async () => {
      const input = await seed('queued', { unexpired: false });
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      assert.deepEqual(await queue({ ...input, failApprovedDelete: true }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.session.status, 'expired');
      assert.equal(state.ledgerReserved, 0);
      assert.equal(state.objects.length, 0);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.ok(await fixture.approved.head(key));
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(await fixture.approved.head(key), null);
    });
    await t.test('deleted-account queue work is fenced before Images and removes private orphans', async () => {
      const input = await seed();
      state.account = { status: 'deleted', deleted_at: new Date().toISOString() };
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(state.session.status, 'expired');
      assert.equal(state.ledgerReserved, 0);
      assert.equal(state.objects.length, 0);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.equal(await fixture.approved.head(key), null);
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
    await t.test('already-expired session state skips Images and repeats private cleanup', async () => {
      const input = await seed();
      beforeQuery = sql => { if (sql.includes('FROM media.upload_sessions') && sql.includes('FOR UPDATE NOWAIT')) state.session.status = 'expired'; };
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(state.objects.length, 0);
      assert.equal(state.evidence.length, 0);
      assert.equal(state.ledgerWrites, 0);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.equal(await fixture.approved.head(key), null);
    });
    await t.test('cancelled queue work retries orphan cleanup without transforming or persisting evidence', async () => {
      const input = await seed('cancelled');
      state.ledgerReserved = 0;
      const key = `approved/${input.userId}/${input.sessionId}.webp`;
      await fixture.approved.put(key, png);
      const effectOffset = effects.length;

      assert.deepEqual(await queue({ ...input, failApprovedDelete: true }), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.session.status, 'cancelled');
      assert.equal(state.objects.length, 0);
      assert.equal(state.evidence.length, 0);
      assert.equal(state.ledgerWrites, 0);
      assert.equal(state.ledgerReserved, 0);
      assert.equal(await fixture.quarantine.head(state.session.object_key), null);
      assert.ok(await fixture.approved.head(key), 'failed private derivative cleanup must remain retryable');

      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      assert.equal(state.session.status, 'cancelled');
      assert.equal(state.objects.length, 0);
      assert.equal(state.evidence.length, 0);
      assert.equal(state.ledgerWrites, 0);
      assert.equal(state.ledgerReserved, 0);
      assert.equal(await fixture.approved.head(key), null);
      assert.equal(effects.slice(effectOffset).filter(effect => effect.type === 'transform').length, 0);
      assert.equal(fixture.outbound.length, 0);
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
      const review = state.evidence[0].imageReview;
      assert.equal(review.provenance.state, 'OBSERVED_UNVERIFIED');
      assert.equal(await verifyImageReviewEvidence(review, review.binding), true);
    });
    await t.test('cached derivative retry with a missing original records unavailable provenance and remains review-only', async () => {
      const input = await seed();
      beforeQuery = sql => { if (sql.includes('INSERT INTO media.moderation_results')) throw new Error('synthetic_evidence_unavailable'); };
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 1 });
      await fixture.quarantine.delete(state.session.object_key);
      beforeQuery = undefined;
      assert.deepEqual(await queue(input), { ack: 1, retry: 0, imageCalls: 0 });
      const review = state.evidence[0].imageReview;
      assert.equal(review.provenance.state, 'UNAVAILABLE');
      assert.equal(review.provenance.c2pa, 'UNKNOWN');
      assert.equal(review.authorship.state, 'ABSTAIN');
      assert.equal(review.policy.publicationEligible, false);
      assert.equal(await verifyImageReviewEvidence(review, review.binding), true);
    });
    await t.test('cached derivative retry cannot reuse provenance from a changed source revision', async () => {
      const input = await seed();
      beforeQuery = sql => { if (sql.includes('INSERT INTO media.moderation_results')) throw new Error('synthetic_evidence_unavailable'); };
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 1 });
      const changed = png.slice(); changed[11] ^= 1;
      await fixture.quarantine.put(state.session.object_key, changed);
      beforeQuery = undefined;
      assert.deepEqual(await queue(input), { ack: 0, retry: 1, imageCalls: 0 });
      assert.equal(state.evidence.length, 0);
      assert.equal(state.objects.length, 0);
      assert.equal(state.ledgerWrites, 0);
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
