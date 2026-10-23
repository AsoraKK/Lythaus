import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '../src/index.ts';
import { parseStandardUpload, verifyStandardUploadBytes, UploadIntegrityError, readStandardDerivative, standardDerivativeMetadata } from '../src/standard-upload.ts';
import { createImageReviewEvidence, verifyImageReviewEvidence } from '../../authenticity/src/image-review-evidence.ts';
import { createExifGpsJpeg } from './image-fixtures.mjs';

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
  const derivative = { bytes, sha256: digest(bytes), width: 1, height: 1, needsDimensionRevalidation: false };
  const customMetadata = standardDerivativeMetadata(derivative, metadata());
  const stored = patch => ({ ...source(bytes), customMetadata: { ...customMetadata, ...patch } });
  assert.deepEqual(await readStandardDerivative(stored(), metadata()), derivative);
  assert.deepEqual(await readStandardDerivative(stored({ transform: 'standard-webp-v1', width: '3', height: '2' }), metadata()),
    { ...derivative, width: 3, height: 2, needsDimensionRevalidation: true });
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

async function imageReviewInput() {
  const sourceBytes = new Uint8Array(await createExifGpsJpeg());
  const derivativeBytes = new Uint8Array(await sharp(sourceBytes).rotate().webp({ quality: 85 }).toBuffer());
  return { sourceBytes, derivativeBytes, binding: {
    ownerId: randomUUID(), uploadSessionId: randomUUID(), sourceEventId: randomUUID(), objectId: randomUUID(),
    sourceSha256: digest(sourceBytes), sourceContentType: 'image/jpeg', sourceBytes: sourceBytes.length,
    derivativeSha256: digest(derivativeBytes), derivativeBytes: derivativeBytes.length,
    width: 2, height: 3, transformVersion: 'standard-webp-v2',
  } };
}

test('image review preserves only source marker observations and withholds every model authority', async () => {
  const input = await imageReviewInput();
  const evidence = await createImageReviewEvidence(input);
  assert.equal(await verifyImageReviewEvidence(evidence, input.binding), true);
  assert.equal(evidence.provenance.state, 'OBSERVED_UNVERIFIED');
  assert.equal(evidence.provenance.exifPresent, true);
  assert.equal(evidence.provenance.cameraOrigin, 'UNKNOWN');
  assert.equal(evidence.authorship.state, 'ABSTAIN');
  assert.equal(evidence.authorship.thresholdVersion, null);
  assert.equal(evidence.safety.state, 'NOT_RUN');
  assert.equal(evidence.reasoning.state, 'NOT_RUN');
  assert.deepEqual(evidence.policy, { outcome: 'review_required', publicationEligible: false,
    reputationEligible: false, enforcementAuthority: false });
  assert.doesNotMatch(JSON.stringify(evidence), /Lythaus fixture|GPS|encoderInformation|pixels|objectKey|riskScore/);
  assert.equal((await createImageReviewEvidence(input)).evidenceHash, evidence.evidenceHash);
});

test('metadata absence, unverified C2PA markers and unavailable originals never certify human authorship', async () => {
  const input = await imageReviewInput();
  const unavailable = await createImageReviewEvidence({ ...input, sourceBytes: null });
  assert.deepEqual(unavailable.provenance, { state: 'UNAVAILABLE', exifPresent: null, xmpPresent: null,
    c2pa: 'UNKNOWN', cameraOrigin: 'UNKNOWN' });
  assert.equal(await verifyImageReviewEvidence(unavailable, input.binding), true);
  const noMetadata = new Uint8Array(await sharp(input.sourceBytes).rotate().png().toBuffer());
  const absent = await createImageReviewEvidence({ ...input, sourceBytes: noMetadata, binding: { ...input.binding,
    sourceSha256: digest(noMetadata), sourceContentType: 'image/png', sourceBytes: noMetadata.length } });
  assert.equal(absent.provenance.c2pa, 'ABSENT');
  assert.equal(absent.provenance.exifPresent, false);
  const marked = new Uint8Array([...noMetadata, ...new TextEncoder().encode('c2pa')]);
  const unverified = await createImageReviewEvidence({ ...input, sourceBytes: marked, binding: { ...input.binding,
    sourceSha256: digest(marked), sourceContentType: 'image/png', sourceBytes: marked.length } });
  assert.equal(unverified.provenance.c2pa, 'PRESENT_UNVERIFIED');
  for (const evidence of [unavailable, absent, unverified]) {
    assert.equal(evidence.provenance.cameraOrigin, 'UNKNOWN');
    assert.equal(evidence.authorship.state, 'ABSTAIN');
    assert.equal(evidence.policy.publicationEligible, false);
  }
});

test('every source revision, owner, derivative and transform mismatch invalidates image evidence', async () => {
  const input = await imageReviewInput();
  const evidence = await createImageReviewEvidence(input);
  for (const [key, replacement] of Object.entries({ ownerId: randomUUID(), uploadSessionId: randomUUID(),
    sourceEventId: randomUUID(), objectId: randomUUID(), sourceSha256: '0'.repeat(64), sourceContentType: 'image/png',
    sourceBytes: input.binding.sourceBytes + 1, derivativeSha256: '0'.repeat(64), derivativeBytes: input.derivativeBytes.length - 1,
    width: 3, height: 2, transformVersion: 'standard-webp-v1' })) {
    assert.equal(await verifyImageReviewEvidence(evidence, { ...input.binding, [key]: replacement }), false, key);
    const changed = structuredClone(evidence);
    changed.binding[key] = replacement;
    assert.equal(await verifyImageReviewEvidence(changed, changed.binding), false, key);
  }
  for (const [section, field, value] of [['policy', 'publicationEligible', true], ['policy', 'reputationEligible', true],
    ['policy', 'enforcementAuthority', true], ['safety', 'state', 'ALLOW'], ['safety', 'authority', 'AUTHORSHIP'],
    ['authorship', 'state', 'HUMAN'], ['reasoning', 'state', 'OBSERVED'], ['provenance', 'cameraOrigin', 'CAMERA'],
    ['provenance', 'c2pa', 'VERIFIED'], ['provenance', 'exifPresent', false]]) {
    const changed = structuredClone(evidence);
    changed[section][field] = value;
    assert.equal(await verifyImageReviewEvidence(changed, input.binding), false, `${section}.${field}`);
  }
});

test('changed source and derivative bytes cannot enter persisted image evidence', async () => {
  const input = await imageReviewInput();
  const sourceChanged = input.sourceBytes.slice(); sourceChanged[sourceChanged.length - 1] ^= 1;
  const derivativeChanged = input.derivativeBytes.slice(); derivativeChanged[derivativeChanged.length - 1] ^= 1;
  await assert.rejects(createImageReviewEvidence({ ...input, sourceBytes: sourceChanged }), /image_review_source_changed/);
  await assert.rejects(createImageReviewEvidence({ ...input, derivativeBytes: derivativeChanged }), /image_review_derivative_changed/);
  for (const patch of [{ width: 0 }, { height: 1.5 }, { width: 40000001 }, { sourceBytes: MAX_IMAGE_BYTES + 1 },
    { ownerId: 'untrusted' }, { sourceContentType: 'image/svg+xml' }, { transformVersion: 'unknown' }]) {
    await assert.rejects(createImageReviewEvidence({ ...input, binding: { ...input.binding, ...patch } }), /image_review_binding_invalid/);
  }
});

test('caller mutation while hashing cannot replace the bound revision or marker observations', async () => {
  const input = await imageReviewInput();
  const expected = structuredClone(input.binding);
  const pending = createImageReviewEvidence(input);
  input.binding.ownerId = randomUUID();
  input.binding.sourceEventId = randomUUID();
  input.binding.transformVersion = 'standard-webp-v1';
  input.sourceBytes.fill(0);
  input.derivativeBytes.fill(0);
  const evidence = await pending;
  assert.equal(await verifyImageReviewEvidence(evidence, expected), true);
  assert.equal(evidence.provenance.exifPresent, true);
  assert.deepEqual(evidence.binding, expected);
});
