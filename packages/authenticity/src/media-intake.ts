import { createAuthenticityCase, type AuthenticityCase, type ProcessingMode } from './contracts.ts';
import { computePerceptualHash, inspectMedia, sha256Hex } from './forensics.ts';
import { type UUIDv7 } from './uuid.ts';

export const MEDIA_INTAKE_SCHEMA_VERSION = 'lythaus-media-intake-v1' as const;
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_ESTIMATED_DECODED_BYTES = 64 * 1024 * 1024;
export const ALLOWED_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];

export interface QuarantineObjectStore {
  put(key: string, value: Uint8Array, options: { contentType: string; customMetadata: Record<string, string> }): Promise<void>;
}

export interface ExistingMediaCase {
  caseId: UUIDv7;
  submissionId: UUIDv7;
  objectKey: string;
  sha256: string;
  status: AuthenticityCase['status'];
}

export interface MediaCaseStore {
  findByIdempotencyKey(key: string): Promise<ExistingMediaCase | null>;
  findBySha256(sha256: string): Promise<ExistingMediaCase | null>;
  create(input: { caseRecord: AuthenticityCase; objectKey: string; sha256: string; perceptualHash: string; idempotencyKey: string; byteSize: number; mime: AllowedMediaMimeType }): Promise<void>;
}

export interface IntakeQueue {
  send(message: { caseId: UUIDv7; submissionId: UUIDv7; objectKey: string; sha256: string; eventType: 'authenticity.media.intake.v1' }): Promise<void>;
}

export interface MediaIntakeDependencies {
  quarantine: QuarantineObjectStore;
  cases: MediaCaseStore;
  queue: IntakeQueue;
  now?: () => string;
}

export interface MediaIntakeRequest {
  bytes: Uint8Array;
  declaredMime: string;
  idempotencyKey: string;
  processingMode?: ProcessingMode;
}

export interface MediaIntakeResult {
  schemaVersion: typeof MEDIA_INTAKE_SCHEMA_VERSION;
  accepted: boolean;
  duplicate: boolean;
  caseRecord: AuthenticityCase | null;
  existingCase: ExistingMediaCase | null;
  objectKey: string | null;
  sha256: string | null;
  perceptualHash: string | null;
}

const MAGIC_MIME: readonly { mime: AllowedMediaMimeType; test: (bytes: Uint8Array) => boolean }[] = [
  { mime: 'image/jpeg', test: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: 'image/png', test: (bytes) => bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) },
  { mime: 'image/webp', test: (bytes) => bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP' },
  { mime: 'image/avif', test: (bytes) => bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 4)) },
];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}

function normalizeMime(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

export function detectMediaMime(bytes: Uint8Array): AllowedMediaMimeType | null {
  return MAGIC_MIME.find((candidate) => candidate.test(bytes))?.mime ?? null;
}

export function validateMediaPayload(input: Pick<MediaIntakeRequest, 'bytes' | 'declaredMime' | 'idempotencyKey'>): { mime: AllowedMediaMimeType; inspection: ReturnType<typeof inspectMedia> } {
  if (!input.idempotencyKey || input.idempotencyKey.length > 256) throw new Error('media_idempotency_key_invalid');
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('media_size_limit_exceeded');
  const declaredMime = normalizeMime(input.declaredMime);
  if (!(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(declaredMime)) throw new Error('media_mime_not_allowed');
  const detectedMime = detectMediaMime(input.bytes);
  if (detectedMime !== declaredMime) throw new Error('media_mime_signature_mismatch');
  const inspection = inspectMedia(input.bytes, declaredMime);
  if (!inspection.dimensions) throw new Error('media_dimensions_unavailable');
  if (inspection.dimensions.pixelCount > MAX_IMAGE_PIXELS) throw new Error('media_pixel_limit_exceeded');
  if (inspection.dimensions.pixelCount * 4 > MAX_ESTIMATED_DECODED_BYTES) throw new Error('media_decode_memory_limit_exceeded');
  return { mime: declaredMime as AllowedMediaMimeType, inspection };
}

export async function ingestMedia(input: MediaIntakeRequest, dependencies: MediaIntakeDependencies): Promise<MediaIntakeResult> {
  const { mime } = validateMediaPayload(input);
  const byIdempotency = await dependencies.cases.findByIdempotencyKey(input.idempotencyKey);
  if (byIdempotency) return { schemaVersion: MEDIA_INTAKE_SCHEMA_VERSION, accepted: true, duplicate: true, caseRecord: null, existingCase: byIdempotency, objectKey: byIdempotency.objectKey, sha256: byIdempotency.sha256, perceptualHash: null };
  const sha256 = await sha256Hex(input.bytes);
  const byDigest = await dependencies.cases.findBySha256(sha256);
  if (byDigest) return { schemaVersion: MEDIA_INTAKE_SCHEMA_VERSION, accepted: true, duplicate: true, caseRecord: null, existingCase: byDigest, objectKey: byDigest.objectKey, sha256, perceptualHash: null };
  const perceptualHash = computePerceptualHash(input.bytes);
  const caseRecord = createAuthenticityCase({ contentKind: 'image', processingMode: input.processingMode ?? 'MODERATION_THEN_AUTHENTICITY', now: dependencies.now?.() });
  const extension = mime.slice(mime.indexOf('/') + 1);
  const objectKey = `quarantine/${caseRecord.id}/${sha256}.${extension}`;
  await dependencies.quarantine.put(objectKey, input.bytes, {
    contentType: mime,
    customMetadata: { schemaVersion: MEDIA_INTAKE_SCHEMA_VERSION, sha256, perceptualHash, caseId: caseRecord.id },
  });
  await dependencies.cases.create({ caseRecord, objectKey, sha256, perceptualHash, idempotencyKey: input.idempotencyKey, byteSize: input.bytes.byteLength, mime });
  await dependencies.queue.send({ caseId: caseRecord.id, submissionId: caseRecord.submissionId, objectKey, sha256, eventType: 'authenticity.media.intake.v1' });
  return { schemaVersion: MEDIA_INTAKE_SCHEMA_VERSION, accepted: true, duplicate: false, caseRecord, existingCase: null, objectKey, sha256, perceptualHash };
}

export async function readBoundedRequestBody(request: Request, maxBytes = MAX_MEDIA_BYTES): Promise<Uint8Array> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > maxBytes) throw new Error('media_size_limit_exceeded');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('media_size_limit_exceeded');
        throw new Error('media_size_limit_exceeded');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
