import { detectMediaMime, readBoundedRequestBody } from '../../authenticity/src/media-intake.ts';
import { sha256Hex } from '../../authenticity/src/forensics.ts';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type AllowedImageType } from './index.ts';

export class UploadIntegrityError extends Error {}

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
