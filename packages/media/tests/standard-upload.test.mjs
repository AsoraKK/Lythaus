import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { MAX_IMAGE_BYTES } from '../src/index.ts';
import { parseStandardUpload, verifyStandardUploadBytes, UploadIntegrityError, readStandardDerivative, standardDerivativeMetadata } from '../src/standard-upload.ts';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const metadata = (bytes = png) => ({ expected_bytes: bytes.length, content_type: 'image/png', checksum_sha256: digest(bytes) });
const source = (bytes = png, size = bytes.length) => ({ size, body: new Response(bytes).body });

test('upload metadata permits only finite integer bounds, canonical image MIME and SHA-256', () => {
  const valid = { contentType: 'image/png', size: 1, checksumSha256: 'A'.repeat(64) };
  assert.deepEqual(parseStandardUpload(valid), { ...valid, checksumSha256: 'a'.repeat(64) });
  assert.equal(parseStandardUpload({ ...valid, size: MAX_IMAGE_BYTES }).size, MAX_IMAGE_BYTES);
  for (const size of [0, -1, 1.5, '12', null, NaN, Infinity, MAX_IMAGE_BYTES + 1]) {
    assert.throws(() => parseStandardUpload({ ...valid, size }), /media_size_exceeded/);
  }
  for (const contentType of ['image/svg+xml', 'video/mp4', 'IMAGE/PNG', 'image/png; charset=utf-8', null]) {
    assert.throws(() => parseStandardUpload({ ...valid, contentType }), /unsupported_media_type/);
  }
  for (const checksumSha256 of [null, 'a'.repeat(63), 'g'.repeat(64)]) {
    assert.throws(() => parseStandardUpload({ ...valid, checksumSha256 }), /checksum_required/);
  }
});

test('source bytes must match exact length, digest and actual MIME, including PostgreSQL bigint strings', async () => {
  assert.deepEqual(await verifyStandardUploadBytes(source(), { ...metadata(), expected_bytes: String(png.length) }), png);
  for (const content_type of ['image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml']) {
    await assert.rejects(verifyStandardUploadBytes(source(), { ...metadata(), content_type }), /unsupported_media_type/);
  }
  await assert.rejects(verifyStandardUploadBytes(source(), { ...metadata(), checksum_sha256: '0'.repeat(64) }), /upload_checksum_invalid/);
  await assert.rejects(verifyStandardUploadBytes(source(png.slice(0, -1), png.length), metadata()), /upload_object_invalid/);
});

test('lying storage size cannot cause unbounded buffering and overflow cancels the reader', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(png.length + 1)); },
    cancel() { cancelled = true; } });
  await assert.rejects(verifyStandardUploadBytes({ size: png.length, body }, metadata()), UploadIntegrityError);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('invalid stored bounds reject without reading and dispose the source', async () => {
  for (const expected_bytes of [0, -1, 1.5, MAX_IMAGE_BYTES + 1, NaN, 'bad']) {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    await assert.rejects(verifyStandardUploadBytes({ size: expected_bytes, body }, { ...metadata(), expected_bytes }), UploadIntegrityError);
    assert.equal(cancelled, true);
  }
});

test('storage read failures stay transient rather than becoming integrity rejections', async () => {
  const failure = new Error('synthetic storage unavailable');
  const body = new ReadableStream({ pull(controller) { controller.error(failure); } });
  await assert.rejects(verifyStandardUploadBytes({ size: png.length, body }, metadata()), error => error === failure);
  assert.equal(body.locked, false);
});

test('matching a file signature is only an integrity check, not a full decode or safety verdict', async () => {
  const nonDecodable = png.slice(0, 8);
  assert.deepEqual(await verifyStandardUploadBytes(source(nonDecodable), metadata(nonDecodable)), nonDecodable);
});

test('cached derivatives bind exact bytes and source identity within the existing reservation', async () => {
  const bytes = Uint8Array.from([82,73,70,70,4,0,0,0,87,69,66,80]);
  const derivative = { bytes, sha256: digest(bytes), width: 1, height: 1 };
  const customMetadata = standardDerivativeMetadata(derivative, metadata());
  const stored = patch => ({ ...source(bytes), customMetadata: { ...customMetadata, ...patch } });
  assert.deepEqual(await readStandardDerivative(stored(), metadata()), derivative);
  for (const patch of [{ transform: 'unknown' }, { sourceSha256: '0'.repeat(64) }, { sourceBytes: '13' },
    { sourceContentType: 'image/jpeg' }, { width: '1.5' }, { height: '-1' }, { sha256: 'invalid' }]) {
    await assert.rejects(readStandardDerivative(stored(patch), metadata()), /media_derivative_conflict/);
  }
  await assert.rejects(readStandardDerivative(stored({ sha256: '0'.repeat(64) }), metadata()), /upload_checksum_invalid/);
  const smallerReservation = { ...metadata(), expected_bytes: bytes.length - 1 };
  await assert.rejects(readStandardDerivative({ ...source(bytes), customMetadata: standardDerivativeMetadata(derivative, smallerReservation) },
    smallerReservation), /media_derivative_conflict/);
  await assert.rejects(readStandardDerivative(source(bytes), metadata()), /media_derivative_conflict/);
});
