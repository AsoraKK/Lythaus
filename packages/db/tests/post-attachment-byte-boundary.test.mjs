import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import {
  createPostAttachmentByteBoundary, POST_ATTACHMENT_BYTE_BOUNDARY_ENABLED, POST_ATTACHMENT_OWNER_LOOKUP_SQL,
} from '../src/post-attachment-byte-boundary.ts';
import { preparePostAttachments } from '../src/post-attachment-preparation.ts';
import { inspectMedia } from '../../authenticity/src/forensics.ts';

const owner = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b11';
const otherOwner = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b12';
const mediaId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b13';
const sessionId = '018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b14';
const sourceKey = 'server-private-source/synthetic';
const storedKey = 'server-private-stored/synthetic';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const policy = { allowedSourceContentTypes: ['image/png'], allowedStoredContentTypes: ['image/webp'],
  maxSourceBytes: 4096, maxStoredBytes: 4096, maxPixels: 1000 };
let png, webp, jpeg, avif;

before(async () => {
  const image = () => sharp({ create: { width: 4, height: 3, channels: 3, background: '#5e7231' } });
  [png, webp, jpeg, avif] = await Promise.all([
    image().png().toBuffer(), image().webp().toBuffer(), image().jpeg().toBuffer(), image().avif().toBuffer(),
  ]);
});

function fixture({ sourceBytes = png, storedBytes = webp, sourceMime = 'image/png', storedMime = 'image/webp',
  row: changes = {}, inspectionPolicy = policy, decoderAvailable = true } = {}) {
  const row = { media_id: mediaId, owner_id: owner, source_session_id: sessionId, source_owner_id: owner,
    source_purpose: 'standard', source_status: 'approved', object_state: 'review', deleted_at: null,
    state_version: '3', source_key: sourceKey, stored_key: storedKey, source_mime: sourceMime, stored_mime: storedMime,
    source_bytes: String(sourceBytes.length), stored_bytes: String(storedBytes.length),
    source_sha256: hash(sourceBytes), stored_sha256: hash(storedBytes), ...changes };
  const state = { queries: [], storageReads: [], decodes: 0, canceled: 0, afterQuery: null, afterInfo: null };
  const bucket = (key, bytes, contentType) => ({
    revision: 'etag-1', bodyBytes: bytes, headSize: bytes.length, missing: false, onGet: null, onHead: null,
    async head(loadedKey) {
      assert.equal(loadedKey, key);
      state.storageReads.push(['head', key]);
      this.onHead?.();
      if (this.missing) return null;
      return { etag: this.revision, size: this.headSize, httpMetadata: { contentType } };
    },
    async get(loadedKey, options) {
      assert.equal(loadedKey, key);
      state.storageReads.push(['get', key]);
      this.onGet?.();
      if (options.onlyIf.etagMatches !== this.revision) return { etag: this.revision, size: this.headSize };
      let offset = 0;
      const bodyBytes = this.bodyBytes;
      return { etag: this.revision, size: this.headSize, httpMetadata: { contentType },
        customMetadata: { verified: 'true', safety: 'pass', authenticity: 'pass' },
        body: new ReadableStream({
          pull(controller) {
            if (offset === bodyBytes.length) return controller.close();
            const end = Math.min(offset + 17, bodyBytes.length);
            controller.enqueue(new Uint8Array(bodyBytes.subarray(offset, end)));
            offset = end;
          }, cancel() { state.canceled++; },
        }),
      };
    },
  });
  const sourceBucket = bucket(sourceKey, sourceBytes, sourceMime), storedBucket = bucket(storedKey, storedBytes, storedMime);
  const images = {
    async info(stream) {
      state.decodes++;
      const bytes = Buffer.from(await new Response(stream).arrayBuffer());
      const info = await sharp(bytes, { failOn: 'warning', limitInputPixels: 1000 }).metadata();
      const result = { format: info.format === 'heif' && info.compression === 'av1' ? 'image/avif' : info.format,
        fileSize: bytes.length, width: info.width, height: info.height,
        verified: true, safety: 'pass', authenticity: 'pass' };
      state.afterInfo?.();
      return result;
    },
    input(stream) {
      return { async output(options) {
        assert.deepEqual(options, { format: 'rgba', anim: false });
        const bytes = Buffer.from(await new Response(stream).arrayBuffer());
        const raw = await sharp(bytes, { failOn: 'warning', limitInputPixels: 1000 })
          .toColourspace('srgb').ensureAlpha().raw().toBuffer();
        return { image: () => new Response(raw).body };
      } };
    },
  };
  const dependencies = { sourceBucket, storedBucket, policy: inspectionPolicy,
    images: decoderAvailable ? images : undefined,
    database: { async query(sql, values) {
      assert.equal(sql, POST_ATTACHMENT_OWNER_LOOKUP_SQL);
      assert.deepEqual(values, [mediaId, owner]);
      state.queries.push({ sql, values });
      state.afterQuery?.(state.queries.length, row);
      return { rows: [{ ...row }] };
    } },
  };
  const boundary = createPostAttachmentByteBoundary(dependencies);
  return { boundary, dependencies, row, state, sourceBucket, storedBucket, images,
    load: request => boundary.loadForOwner(owner, request ?? { mediaId }) };
}

function noAuthority(result) {
  assert.equal(POST_ATTACHMENT_BYTE_BOUNDARY_ENABLED, false);
  assert.equal(result.runtimeAuthority, false);
  assert.equal(result.relationWriteAllowed, false);
  assert.equal(result.publicationEligible, false);
}

test('actual private bytes produce immutable format facts, no detector/privacy claims or locators', async () => {
  const f = fixture();
  const result = await f.load();
  assert.equal(result.status, 'inspected');
  noAuthority(result);
  assert.equal(result.snapshot.sourceSha256, hash(png));
  assert.equal(result.snapshot.objectSha256, hash(webp));
  assert.deepEqual(result.snapshot.objectFormatEvidence, { outcome: 'verified', detectedContentType: 'image/webp',
    inputSha256: hash(webp), mediaStateVersion: 3 });
  assert.equal(result.snapshot.safetyEvidence, null);
  assert.equal(result.snapshot.authenticityEvidence, null);
  assert.equal(result.snapshot.orientationNormalized, null);
  assert.equal(result.snapshot.exifMetadataAbsent, null);
  assert.equal(result.snapshot.gpsMetadataAbsent, null);
  assert.equal(JSON.stringify(result).includes(sourceKey), false);
  assert.equal(JSON.stringify(result).includes(storedKey), false);
  assert.throws(() => { result.snapshot.objectFormatEvidence.outcome = 'forged'; }, TypeError);
  const prepared = preparePostAttachments({ ownerId: owner, requestedMediaIds: [mediaId], declaredCreationMode: 'human',
    capabilities: { ...policy, enabled: true, maxAttachments: 1, humanImageDeclarationVersion: 'fixture-only',
      altTextPolicyVersion: 'fixture-only', originalRetentionPolicyVersion: 'fixture-only', attachmentTombstonePolicyVersion: 'fixture-only' },
    media: [result.snapshot] });
  assert.equal(prepared.status, 'blocked');
  assert.ok(prepared.blockers.includes('safety_evidence_missing'));
  assert.ok(prepared.blockers.includes('authenticity_evidence_missing'));
  assert.equal(prepared.publicationEligible, false);
});

test('unresolved formats, excessive configured bounds, or absent decoder are explicitly unavailable before lookup', async () => {
  for (const inspectionPolicy of [undefined, { ...policy, allowedSourceContentTypes: null },
    { ...policy, allowedStoredContentTypes: ['image/svg+xml'] }, { ...policy, maxSourceBytes: 10 * 1024 * 1024 + 1 }]) {
    const f = fixture();
    const result = await createPostAttachmentByteBoundary({ ...f.dependencies, policy: inspectionPolicy }).loadForOwner(owner, { mediaId });
    assert.equal(result.status, 'unavailable');
    assert.equal(f.state.queries.length, 0);
    noAuthority(result);
  }
  const f = fixture({ decoderAvailable: false });
  assert.equal((await f.load()).reason, 'image_decoder_unavailable');
  assert.equal(f.state.storageReads.length, 0);
});

test('untrusted verified/pass claims, keys, alternate owners, duplicate fields and getters are rejected', async () => {
  const f = fixture();
  let getterCalled = false;
  const getter = { get mediaId() { getterCalled = true; return mediaId; } };
  for (const request of [{ mediaId, safetyEvidence: { outcome: 'pass' } }, { mediaId, sourceFormatEvidence: { outcome: 'verified' } },
    { mediaId, objectKey: sourceKey }, { mediaId, ownerId: otherOwner }, [mediaId, mediaId],
    { mediaId: 'https://r2.invalid/file' }, getter, { mediaId, [Symbol('evidence')]: 'pass' },
    new Proxy({}, { getPrototypeOf() { throw new Error('untrusted proxy'); } })]) {
    const result = await f.load(request);
    assert.equal(result.status, 'blocked');
    assert.equal(result.snapshot, null);
    noAuthority(result);
  }
  assert.equal(getterCalled, false);
  assert.equal(f.state.queries.length, 0);
});

test('the fixed query scopes both owners; cross-owner, wrong session and private-purpose rows never read storage', async () => {
  assert.match(POST_ATTACHMENT_OWNER_LOOKUP_SQL, /m\.owner_id = \$2 AND s\.user_id = \$2/);
  for (const row of [{ owner_id: otherOwner }, { source_owner_id: otherOwner },
    { source_purpose: 'authenticity_alpha' }, { source_purpose: 'authenticity_beta' },
    { source_status: 'pending' }, { object_state: 'rejected' }, { source_session_id: 'forged' },
    { deleted_at: '2026-10-13T00:00:00Z' }]) {
    const f = fixture({ row });
    assert.equal((await f.load()).reason, 'attachment_unavailable');
    assert.equal(f.state.storageReads.length, 0);
  }
  const f = fixture();
  for (const rows of [[], [f.row, f.row]]) {
    const database = { query: async () => ({ rows }) };
    assert.equal((await createPostAttachmentByteBoundary({ ...f.dependencies, database })
      .loadForOwner(owner, { mediaId })).reason, 'attachment_unavailable');
  }
  assert.equal(f.state.storageReads.length, 0);
});

test('missing proposed schema or originals is unavailable without altering storage or metadata', async () => {
  const f = fixture();
  const database = { query: async () => { throw Object.assign(new Error('private database detail'), { code: '42703' }); } };
  const result = await createPostAttachmentByteBoundary({ ...f.dependencies, database }).loadForOwner(owner, { mediaId });
  assert.equal(result.reason, 'attachment_metadata_schema_unavailable');
  assert.equal(f.state.storageReads.length, 0);
  f.sourceBucket.missing = true;
  assert.equal((await f.load()).reason, 'private_bytes_unavailable');
});

test('forged MIME and unsupported configured content cannot create verified format evidence', async () => {
  for (const sourceMime of ['image/jpeg', 'image/png; charset=utf-8', 'image/png\r\ntext/html']) {
    const f = fixture({ sourceMime });
    const result = await f.load();
    assert.equal(result.status, 'blocked');
    assert.equal(result.snapshot, null);
    noAuthority(result);
  }
  const f = fixture({ sourceBytes: jpeg, sourceMime: 'image/jpeg' });
  assert.equal((await f.load()).reason, 'image_format_policy_unavailable');
});

test('all existing standard formats require real complete decoding under explicit fixture policy', async () => {
  for (const [contentType, bytes] of [['image/png', png], ['image/webp', webp], ['image/jpeg', jpeg], ['image/avif', avif]]) {
    const f = fixture({ sourceBytes: bytes, storedBytes: bytes, sourceMime: contentType, storedMime: contentType,
      inspectionPolicy: { ...policy, allowedSourceContentTypes: [contentType], allowedStoredContentTypes: [contentType] } });
    const result = await f.load();
    assert.equal(result.status, 'inspected', `${contentType}: ${result.reason}`);
    assert.equal(result.snapshot.objectFormatEvidence.inputSha256, hash(bytes));
    noAuthority(result);
  }
});

test('the reused JPEG header parser preserves actual non-square width and height', () => {
  assert.deepEqual(inspectMedia(jpeg, 'image/jpeg').dimensions, { width: 4, height: 3, pixelCount: 12 });
});

test('recognized animations remain unavailable rather than selecting an animation policy', async () => {
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0); animationChunk.write('acTL', 4);
  animationChunk.writeUInt32BE(2, 8);
  animationChunk.writeUInt32BE(crc32(animationChunk.subarray(4, 16)), 16);
  const apng = Buffer.concat([png.subarray(0, 33), animationChunk, png.subarray(33)]);
  const f = fixture({ sourceBytes: apng });
  assert.equal((await f.load()).reason, 'animated_image_policy_unresolved');
  assert.equal(f.state.decodes, 0);
  const sequence = Buffer.from(avif);
  sequence.write('avis', 8);
  const sequenceFixture = fixture({ sourceBytes: sequence, sourceMime: 'image/avif',
    inspectionPolicy: { ...policy, allowedSourceContentTypes: ['image/avif'] } });
  assert.equal((await sequenceFixture.load()).reason, 'animated_image_policy_unresolved');
});

test('incorrect decoder metadata or incomplete/oversized pixel streams cannot supply format evidence', async () => {
  const f = fixture();
  const wrongMetadata = { ...f.images, info: async stream => ({ ...await f.images.info(stream), width: 100 }) };
  let result = await createPostAttachmentByteBoundary({ ...f.dependencies, images: wrongMetadata }).loadForOwner(owner, { mediaId });
  assert.equal(result.reason, 'decoded_metadata_mismatch');
  for (const [size, reason] of [[47, 'decoded_pixels_incomplete'], [49, 'decoded_pixel_limit']]) {
    const images = { ...f.images, input: () => ({ output: async () => ({ image: () => new Response(new Uint8Array(size)).body }) }) };
    result = await createPostAttachmentByteBoundary({ ...f.dependencies, images }).loadForOwner(owner, { mediaId });
    assert.equal(result.reason, reason);
    assert.equal(result.snapshot, null);
    noAuthority(result);
  }
});

test('truncated PNG, JPEG, WebP and AVIF containers fail even when their metadata digest matches', async () => {
  for (const [sourceMime, bytes] of [['image/png', png], ['image/jpeg', jpeg], ['image/webp', webp], ['image/avif', avif]]) {
    const f = fixture({ sourceMime, sourceBytes: bytes.subarray(0, bytes.length - 3),
      inspectionPolicy: { ...policy, allowedSourceContentTypes: [sourceMime] } });
    const result = await f.load();
    assert.equal(result.status, 'blocked', sourceMime);
    assert.equal(result.snapshot, null);
    assert.equal(f.state.decodes, 0);
  }
  const corrupted = Buffer.from(png);
  corrupted[corrupted.length - 1] ^= 1;
  const f = fixture({ sourceBytes: corrupted });
  assert.equal((await f.load()).reason, 'image_container_invalid_or_truncated');
});

test('a framed PNG with a valid CRC but broken compressed pixels cannot create evidence', async () => {
  const corrupt = Buffer.from(png), tag = corrupt.indexOf(Buffer.from('IDAT'));
  const size = corrupt.readUInt32BE(tag - 4);
  corrupt.fill(0, tag + 4, tag + 4 + size);
  corrupt.writeUInt32BE(crc32(corrupt.subarray(tag, tag + 4 + size)), tag + 4 + size);
  const f = fixture({ sourceBytes: corrupt });
  const result = await f.load();
  assert.ok(['blocked', 'unavailable'].includes(result.status));
  assert.equal(result.snapshot, null);
  assert.ok(f.state.decodes >= 1);
  noAuthority(result);
});

test('configured size bounds apply before lookup-body allocation and bound lying storage streams', async () => {
  const tooLarge = fixture({ inspectionPolicy: { ...policy, maxSourceBytes: png.length - 1 } });
  assert.equal((await tooLarge.load()).reason, 'stored_size_limit');
  assert.equal(tooLarge.state.storageReads.length, 0);
  const lying = fixture({ inspectionPolicy: { ...policy, maxSourceBytes: png.length } });
  lying.sourceBucket.bodyBytes = Buffer.concat([png, Buffer.alloc(100)]);
  assert.equal((await lying.load()).reason, 'stored_size_limit');
  assert.equal(lying.state.canceled, 1);
  assert.equal(lying.state.decodes, 0);
});

test('pixel and existing decode memory bounds apply before the decoder is invoked', async () => {
  const f = fixture({ inspectionPolicy: { ...policy, maxPixels: 11 } });
  assert.equal((await f.load()).reason, 'image_pixel_or_decode_memory_limit');
  assert.equal(f.state.decodes, 0);
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(5000, 16); bomb.writeUInt32BE(4000, 20);
  bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)), 29);
  const big = fixture({ sourceBytes: bomb, inspectionPolicy: { ...policy, maxPixels: 40_000_000 } });
  assert.equal((await big.load()).reason, 'image_pixel_or_decode_memory_limit');
  assert.equal(big.state.decodes, 0);
});

test('source and stored digests are checked before decoding; client metadata never supplies passes', async () => {
  for (const field of ['source_sha256', 'stored_sha256']) {
    const f = fixture({ row: { [field]: 'f'.repeat(64), verified: true, safetyEvidence: { outcome: 'pass' } } });
    assert.equal((await f.load()).reason, 'source_or_stored_integrity_mismatch');
    assert.equal(f.state.decodes, 0);
  }
});

test('source/stored revisions and final owner state are rechecked after byte inspection', async () => {
  for (const change of [{ state_version: '4' }, { source_sha256: 'f'.repeat(64) },
    { stored_sha256: 'f'.repeat(64) }, { source_session_id: otherOwner }]) {
    const f = fixture();
    f.state.afterQuery = (count, row) => { if (count === 2) Object.assign(row, change); };
    assert.equal((await f.load()).reason, 'media_revision_changed');
  }
  const revoked = fixture();
  revoked.state.afterQuery = (count, row) => { if (count === 2) row.owner_id = otherOwner; };
  assert.equal((await revoked.load()).reason, 'attachment_unavailable');
  const r2 = fixture();
  r2.state.afterInfo = () => { r2.storedBucket.revision = 'etag-new'; };
  assert.equal((await r2.load()).reason, 'storage_revision_changed');
  const changedOnGet = fixture();
  changedOnGet.sourceBucket.onGet = () => { changedOnGet.sourceBucket.revision = 'etag-new'; };
  assert.equal((await changedOnGet.load()).reason, 'storage_revision_changed');
});

test('repeated inspections are deterministic and read only; dependency failures disclose no keys or errors', async () => {
  const f = fixture();
  assert.deepEqual(await f.load(), await f.load());
  assert.equal(f.state.queries.every(entry => entry.sql.startsWith('SELECT')), true);
  const failing = { ...f.images, info: async () => { throw new Error('private key and provider detail'); } };
  const result = await createPostAttachmentByteBoundary({ ...f.dependencies, images: failing }).loadForOwner(owner, { mediaId });
  assert.equal(result.reason, 'inspection_dependency_unavailable');
  assert.equal(JSON.stringify(result).includes('private key'), false);
  noAuthority(result);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function deadlineBoundary(t, f, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  return createPostAttachmentByteBoundary({ ...f.dependencies, inspectionTimeoutMs: 20, cleanupTimeoutMs: 5, ...overrides });
}

test('deadlines cannot be disabled or extended above the server hard bounds', async () => {
  const f = fixture();
  for (const limits of [{ inspectionTimeoutMs: 0 }, { inspectionTimeoutMs: 30_001 },
    { cleanupTimeoutMs: 0 }, { cleanupTimeoutMs: 1001 }]) {
    const result = await createPostAttachmentByteBoundary({ ...f.dependencies, ...limits }).loadForOwner(owner, { mediaId });
    assert.equal(result.reason, 'inspection_deadline_config_invalid');
    noAuthority(result);
  }
  assert.equal(f.state.queries.length, 0);
});

test('a stalled metadata lookup stops at the shared deadline', async t => {
  const f = fixture(), entered = deferred();
  const database = { query() { entered.resolve(); return new Promise(() => {}); } };
  const pending = deadlineBoundary(t, f, { database }).loadForOwner(owner, { mediaId });
  await entered.promise;
  t.mock.timers.tick(20);
  const result = await pending;
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(f.state.storageReads.length, 0);
  noAuthority(result);
});

test('stalled Images info errors its input stream and returns no authority', async t => {
  const f = fixture(), entered = deferred();
  let input;
  const images = { ...f.images, info(stream) { input = stream; entered.resolve(); return new Promise(() => {}); } };
  const pending = deadlineBoundary(t, f, { images }).loadForOwner(owner, { mediaId });
  await entered.promise;
  t.mock.timers.tick(20);
  const result = await pending;
  assert.equal(result.reason, 'attachment_inspection_deadline');
  const reader = input.getReader();
  await assert.rejects(reader.read(), /attachment_inspection_deadline/);
  reader.releaseLock();
  assert.equal(input.locked, false);
  assert.equal(f.state.decodes, 0);
  noAuthority(result);
});

test('Images output shares elapsed budget and a late output body is canceled and unlocked', async t => {
  const f = fixture(), infoReady = deferred(), infoContinue = deferred(), outputReady = deferred(), output = deferred();
  let input, canceled = 0;
  const images = {
    async info(stream) { const value = await f.images.info(stream); infoReady.resolve(); await infoContinue.promise; return value; },
    input(stream) { input = stream; return { output() { outputReady.resolve(); return output.promise; } }; },
  };
  const pending = deadlineBoundary(t, f, { images }).loadForOwner(owner, { mediaId });
  await infoReady.promise;
  t.mock.timers.tick(10);
  infoContinue.resolve();
  await outputReady.promise;
  t.mock.timers.tick(10);
  const result = await pending;
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(f.state.decodes, 1);
  const lateBody = new ReadableStream({ cancel() { canceled++; } });
  output.resolve({ image: () => lateBody });
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(canceled, 1);
  assert.equal(lateBody.locked, false);
  assert.equal(input.locked, false);
  noAuthority(result);
});

test('a stalled private byte stream is canceled and its reader released', async t => {
  const f = fixture(), entered = deferred();
  let canceled = 0;
  const body = new ReadableStream({ pull() { entered.resolve(); return new Promise(() => {}); }, cancel() { canceled++; } }, { highWaterMark: 0 });
  const get = f.sourceBucket.get.bind(f.sourceBucket);
  const sourceBucket = { ...f.sourceBucket, async get(...args) { return { ...await get(...args), body }; } };
  const pending = deadlineBoundary(t, f, { sourceBucket }).loadForOwner(owner, { mediaId });
  await entered.promise;
  t.mock.timers.tick(20);
  const result = await pending;
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(canceled, 1);
  assert.equal(body.locked, false);
  assert.equal(f.state.decodes, 0);
  noAuthority(result);
});

test('a stalled decoded pixel stream is canceled and its reader released', async t => {
  const f = fixture(), entered = deferred();
  let canceled = 0;
  const body = new ReadableStream({ pull() { entered.resolve(); return new Promise(() => {}); }, cancel() { canceled++; } }, { highWaterMark: 0 });
  const images = { ...f.images, input: () => ({ output: async () => ({ image: () => body }) }) };
  const pending = deadlineBoundary(t, f, { images }).loadForOwner(owner, { mediaId });
  await entered.promise;
  t.mock.timers.tick(20);
  const result = await pending;
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(canceled, 1);
  assert.equal(body.locked, false);
  noAuthority(result);
});

test('a cancellation hook that never settles cannot hold the reader or extend cleanup indefinitely', async t => {
  const f = fixture(), entered = deferred();
  const body = new ReadableStream({ start(value) { value.enqueue(new Uint8Array(5000)); },
    cancel() { entered.resolve(); return new Promise(() => {}); } });
  const get = f.sourceBucket.get.bind(f.sourceBucket);
  const sourceBucket = { ...f.sourceBucket, async get(...args) { return { ...await get(...args), body }; } };
  const pending = deadlineBoundary(t, f, { sourceBucket }).loadForOwner(owner, { mediaId });
  await entered.promise;
  assert.equal(body.locked, false);
  t.mock.timers.tick(5);
  const result = await pending;
  assert.equal(result.reason, 'stored_size_limit');
  assert.equal(f.state.decodes, 0);
  t.mock.timers.tick(1000);
  noAuthority(result);
});

test('late private bodies are canceled even when their get operation outlives the caller deadline', async t => {
  const f = fixture(), entered = deferred(), fetched = deferred();
  let canceled = 0;
  const sourceBucket = { ...f.sourceBucket, get() { entered.resolve(); return fetched.promise; } };
  const pending = deadlineBoundary(t, f, { sourceBucket }).loadForOwner(owner, { mediaId });
  await entered.promise;
  t.mock.timers.tick(20);
  const result = await pending;
  const body = new ReadableStream({ cancel() { canceled++; return Promise.reject(new Error('cancel rejected')); } });
  fetched.resolve({ etag: 'late', size: png.length, body });
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(canceled, 1);
  assert.equal(body.locked, false);
  noAuthority(result);
});

test('timeout cleanup has its own finite budget when cancel never settles', async t => {
  const f = fixture(), reading = deferred(), canceling = deferred();
  const body = new ReadableStream({ pull() { reading.resolve(); return new Promise(() => {}); },
    cancel() { canceling.resolve(); return new Promise(() => {}); } }, { highWaterMark: 0 });
  const get = f.sourceBucket.get.bind(f.sourceBucket);
  const sourceBucket = { ...f.sourceBucket, async get(...args) { return { ...await get(...args), body }; } };
  const pending = deadlineBoundary(t, f, { sourceBucket }).loadForOwner(owner, { mediaId });
  await reading.promise;
  t.mock.timers.tick(20);
  await canceling.promise;
  assert.equal(body.locked, false);
  t.mock.timers.tick(5);
  const result = await pending;
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(f.state.decodes, 0);
  noAuthority(result);
});

test('a provider operation rejecting after timeout is handled without producing evidence', async t => {
  const f = fixture(), entered = deferred(), info = deferred();
  const images = { ...f.images, info() { entered.resolve(); return info.promise; } };
  const pending = deadlineBoundary(t, f, { images }).loadForOwner(owner, { mediaId });
  await entered.promise;
  t.mock.timers.tick(20);
  const result = await pending;
  info.reject(new Error('late decoder rejection'));
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(result.reason, 'attachment_inspection_deadline');
  assert.equal(result.snapshot, null);
  noAuthority(result);
});
