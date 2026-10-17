import { detectMediaMime, readBoundedRequestBody, MAX_IMAGE_PIXELS } from '../../authenticity/src/media-intake.ts';
import { sha256Hex } from '../../authenticity/src/forensics.ts';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type AllowedImageType } from './index.ts';

export { readBoundedRequestBody };

export class UploadIntegrityError extends Error {}

export function validStandardImageDimensions(width: unknown, height: unknown): boolean {
  return typeof width === 'number' && typeof height === 'number'
    && Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS;
}

export interface StandardDerivative {
  bytes: Uint8Array;
  sha256: string;
  width: number;
  height: number;
}

export function standardDerivativeMetadata(derivative: StandardDerivative, session: {
  expected_bytes: number | string; content_type: string; checksum_sha256: string;
}): Record<string, string> {
  return { transform: 'standard-webp-v1', sourceSha256: session.checksum_sha256,
    sourceBytes: String(session.expected_bytes), sourceContentType: session.content_type,
    sha256: derivative.sha256, width: String(derivative.width), height: String(derivative.height) };
}

export async function readStandardDerivative(source: {
  size: number; body: ReadableStream<Uint8Array>; customMetadata?: Record<string, string>;
}, session: { expected_bytes: number | string; content_type: string; checksum_sha256: string }): Promise<StandardDerivative> {
  const metadata = source.customMetadata ?? {};
  const width = Number(metadata.width), height = Number(metadata.height), reserved = Number(session.expected_bytes);
  if (!Number.isSafeInteger(reserved) || reserved < 1 || reserved > MAX_IMAGE_BYTES || source.size > reserved
    || metadata.transform !== 'standard-webp-v1' || metadata.sourceSha256 !== session.checksum_sha256
    || metadata.sourceBytes !== String(session.expected_bytes) || metadata.sourceContentType !== session.content_type
    || !/^[0-9a-f]{64}$/.test(metadata.sha256 ?? '') || !validStandardImageDimensions(width, height)) {
    void source.body.cancel().catch(() => undefined);
    throw new Error('media_derivative_conflict');
  }
  const bytes = await verifyStandardUploadBytes(source, {
    expected_bytes: source.size, content_type: 'image/webp', checksum_sha256: metadata.sha256,
  });
  return { bytes, sha256: metadata.sha256, width, height };
}

export function parseStandardUpload(input: { contentType?: unknown; size?: unknown; checksumSha256?: unknown }): {
  contentType: AllowedImageType; size: number; checksumSha256: string;
} {
  if (!(ALLOWED_IMAGE_TYPES as readonly unknown[]).includes(input.contentType)) throw new Error('unsupported_media_type');
  if (typeof input.size !== 'number' || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_IMAGE_BYTES) {
    throw new Error('media_size_exceeded');
  }
  const checksumSha256 = typeof input.checksumSha256 === 'string' ? input.checksumSha256.toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(checksumSha256)) throw new Error('checksum_required');
  return { contentType: input.contentType as AllowedImageType, size: input.size, checksumSha256 };
}

export async function verifyStandardUploadBytes(source: { size: number; body: ReadableStream<Uint8Array> }, session: {
  expected_bytes: number | string; content_type: string; checksum_sha256: string;
}): Promise<Uint8Array> {
  const expected = Number(session.expected_bytes);
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > MAX_IMAGE_BYTES || source.size !== expected) {
    void source.body.cancel().catch(() => undefined);
    throw new UploadIntegrityError('upload_object_invalid');
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedRequestBody({ headers: new Headers(), body: source.body }, expected);
  } catch (error) {
    if (error instanceof Error && error.message === 'media_size_limit_exceeded') throw new UploadIntegrityError('upload_object_invalid');
    throw error;
  }
  if (bytes.byteLength !== expected) throw new UploadIntegrityError('upload_object_invalid');
  if (await sha256Hex(bytes) !== session.checksum_sha256) throw new UploadIntegrityError('upload_checksum_invalid');
  if (detectMediaMime(bytes) !== session.content_type) throw new UploadIntegrityError('unsupported_media_type');
  return bytes;
}
