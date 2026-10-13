import type { DatabaseClient } from './index.ts';
import type { PostAttachmentCapabilityInputs, PostAttachmentMediaSnapshot } from './post-attachment-preparation.ts';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../media/src/index.ts';
import { detectMediaMime, MAX_IMAGE_PIXELS, MAX_ESTIMATED_DECODED_BYTES, readBoundedRequestBody } from '../../authenticity/src/media-intake.ts';
import { inspectMedia, sha256Hex } from '../../authenticity/src/forensics.ts';

export const POST_ATTACHMENT_BYTE_BOUNDARY_ENABLED = false as const;

export type AttachmentInspectionPolicy = Pick<PostAttachmentCapabilityInputs,
  'allowedSourceContentTypes' | 'allowedStoredContentTypes' | 'maxSourceBytes' | 'maxStoredBytes' | 'maxPixels'>;

export interface AttachmentPrivateObject {
  etag: string;
  size: number;
  httpMetadata?: { contentType?: string };
  body?: ReadableStream<Uint8Array>;
}

export interface AttachmentPrivateBucket {
  head(key: string): Promise<AttachmentPrivateObject | null>;
  get(key: string, options: { onlyIf: { etagMatches: string } }): Promise<AttachmentPrivateObject | null>;
}

export interface AttachmentImagesBinding {
  info(bytes: ReadableStream<Uint8Array>): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>;
  input(bytes: ReadableStream<Uint8Array>): {
    output(options: { format: 'rgba'; anim: false }): Promise<{ image(): ReadableStream<Uint8Array> }>;
  };
}

export interface AttachmentByteBoundaryDependencies {
  database: Pick<DatabaseClient, 'query'>;
  sourceBucket: AttachmentPrivateBucket;
  storedBucket: AttachmentPrivateBucket;
  images?: AttachmentImagesBinding;
  policy?: AttachmentInspectionPolicy;
  inspectionTimeoutMs?: number;
  cleanupTimeoutMs?: number;
}

interface MediaRecord {
  media_id: string;
  owner_id: string;
  source_session_id: string;
  source_owner_id: string;
  source_purpose: string;
  source_status: string;
  object_state: string;
  deleted_at: string | null;
  state_version: number | string;
  source_key: string;
  stored_key: string;
  source_mime: string;
  stored_mime: string;
  source_bytes: number | string;
  stored_bytes: number | string;
  source_sha256: string;
  stored_sha256: string;
}

export interface AttachmentByteInspectionResult {
  status: 'inspected' | 'blocked' | 'unavailable';
  reason: string;
  snapshot: Readonly<PostAttachmentMediaSnapshot> | null;
  runtimeAuthority: false;
  relationWriteAllowed: false;
  publicationEligible: false;
}

export const POST_ATTACHMENT_OWNER_LOOKUP_SQL = `SELECT
  m.id AS media_id, m.owner_id, m.source_upload_session_id AS source_session_id,
  s.user_id AS source_owner_id, s.purpose AS source_purpose, s.status AS source_status,
  m.state AS object_state, m.deleted_at, m.attachment_state_version AS state_version,
  s.object_key AS source_key, m.object_key AS stored_key,
  s.content_type AS source_mime, m.content_type AS stored_mime,
  s.expected_bytes AS source_bytes, m.byte_size AS stored_bytes,
  s.checksum_sha256 AS source_sha256, m.sha256 AS stored_sha256
FROM media.objects m
JOIN media.upload_sessions s ON s.id = m.source_upload_session_id AND s.user_id = m.owner_id
WHERE m.id = $1 AND m.owner_id = $2 AND s.user_id = $2
  AND s.purpose = 'standard' AND m.deleted_at IS NULL`;

class InspectionFailure extends Error {
  readonly status: 'blocked' | 'unavailable';
  constructor(status: 'blocked' | 'unavailable', reason: string) { super(reason); this.status = status; }
}

function inspectionBudget(timeoutMs: number, cleanupMs: number) {
  const controller = new AbortController(), deadlineAt = Date.now() + timeoutMs;
  const expired = () => new InspectionFailure('unavailable', 'attachment_inspection_deadline');
  const timer = setTimeout(() => controller.abort(expired()), timeoutMs);
  const streams = new Set<() => Promise<void>>(), cleaning = new Set<Promise<void>>();
  const cancel = (reader: ReadableStreamDefaultReader<Uint8Array>, reason: unknown): Promise<void> => {
    let pending: Promise<void>;
    try { pending = reader.cancel(reason); } catch { pending = Promise.resolve(); }
    try { reader.releaseLock(); } catch {}
    let cleanupTimer: ReturnType<typeof setTimeout>;
    const done = Promise.race([pending.catch(() => {}), new Promise<void>(resolve => {
      cleanupTimer = setTimeout(resolve, cleanupMs);
    })]).finally(() => { clearTimeout(cleanupTimer); cleaning.delete(done); });
    cleaning.add(done);
    return done;
  };
  const cancelBody = async (body?: ReadableStream<Uint8Array>): Promise<void> => {
    if (body && !body.locked) await cancel(body.getReader(), expired());
  };
  const run = async <T>(work: () => Promise<T>, late?: (value: T) => Promise<void>): Promise<T> => {
    if (Date.now() >= deadlineAt && !controller.signal.aborted) controller.abort(expired());
    if (controller.signal.aborted) throw expired();
    let abort!: () => void;
    const timeout = new Promise<never>((_, reject) => {
      abort = () => reject(expired());
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const call = Promise.resolve().then(() => {
      if (controller.signal.aborted || Date.now() >= deadlineAt) throw expired();
      return work();
    });
    void call.then(value => { if (controller.signal.aborted && late) return late(value); }).catch(() => {});
    try { return await Promise.race([call, timeout]); }
    finally { controller.signal.removeEventListener('abort', abort); }
  };
  const body = (source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
    const reader = source.getReader();
    let finished = false, target: ReadableStreamDefaultController<Uint8Array>;
    const retire = (): Promise<void> => {
      if (finished) return Promise.resolve();
      finished = true;
      streams.delete(retire);
      controller.signal.removeEventListener('abort', abort);
      return cancel(reader, expired());
    };
    const abort = () => { if (!finished) { target.error(expired()); void retire(); } };
    const wrapped = new ReadableStream<Uint8Array>({
      start(value) { target = value; },
      async pull(value) {
        try {
          const next = await run(() => reader.read());
          if (finished) return;
          if (next.done) {
            finished = true;
            streams.delete(retire);
            controller.signal.removeEventListener('abort', abort);
            reader.releaseLock();
            value.close();
          } else value.enqueue(next.value);
        } catch (error) { value.error(error); await retire(); }
      },
      cancel: retire,
    });
    streams.add(retire);
    controller.signal.addEventListener('abort', abort, { once: true });
    if (controller.signal.aborted) abort();
    return wrapped;
  };
  return {
    run, body, cancelBody,
    async close() {
      clearTimeout(timer);
      controller.abort(expired());
      await Promise.all([...streams].map(retire => retire()).concat([...cleaning]));
    },
  };
}

type InspectionBudget = ReturnType<typeof inspectionBudget>;

const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const mime = (value: unknown): string | null => typeof value === 'string'
  && /^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/i.test(value) ? value.toLowerCase() : null;

function result(status: AttachmentByteInspectionResult['status'], reason: string,
  snapshot: AttachmentByteInspectionResult['snapshot'] = null): AttachmentByteInspectionResult {
  return Object.freeze({ status, reason, snapshot, runtimeAuthority: false,
    relationWriteAllowed: false, publicationEligible: false });
}

function policyCopy(policy?: AttachmentInspectionPolicy): AttachmentInspectionPolicy | null {
  if (!policy) return null;
  const allowed = (values: readonly string[] | null) => Array.isArray(values) && values.length > 0
    && values.every(value => mime(value) === value && (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value));
  if (!allowed(policy.allowedSourceContentTypes) || !allowed(policy.allowedStoredContentTypes)
    || !positive(policy.maxSourceBytes) || policy.maxSourceBytes > MAX_IMAGE_BYTES
    || !positive(policy.maxStoredBytes) || policy.maxStoredBytes > MAX_IMAGE_BYTES
    || !positive(policy.maxPixels) || policy.maxPixels > MAX_IMAGE_PIXELS) return null;
  return Object.freeze({
    allowedSourceContentTypes: Object.freeze([...policy.allowedSourceContentTypes!]),
    allowedStoredContentTypes: Object.freeze([...policy.allowedStoredContentTypes!]),
    maxSourceBytes: policy.maxSourceBytes, maxStoredBytes: policy.maxStoredBytes, maxPixels: policy.maxPixels,
  });
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function completeEnvelope(bytes: Uint8Array, contentType: string): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) => new TextDecoder().decode(bytes.subarray(start, start + length));
  const invalid = () => { throw new InspectionFailure('blocked', 'image_container_invalid_or_truncated'); };
  const animated = () => { throw new InspectionFailure('unavailable', 'animated_image_policy_unresolved'); };
  if (contentType === 'image/jpeg') {
    if (bytes.length < 4 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) invalid();
    return;
  }
  if (contentType === 'image/png') {
    let offset = 8, imageData = false;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset), type = ascii(offset + 4, 4), end = offset + 8 + size;
      if (end + 4 > bytes.length || (offset === 8 && (type !== 'IHDR' || size !== 13))) invalid();
      let crc = 0xffffffff;
      for (let i = offset + 4; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
      if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end)) invalid();
      if (type === 'acTL') animated();
      if (type === 'IDAT' && size > 0) imageData = true;
      offset = end + 4;
      if (type === 'IEND') {
        if (size !== 0 || !imageData || offset !== bytes.length) invalid();
        return;
      }
    }
    invalid();
  }
  if (contentType === 'image/webp') {
    if (bytes.length < 12 || view.getUint32(4, true) + 8 !== bytes.length) invalid();
    let offset = 12, imageData = 0;
    while (offset + 8 <= bytes.length) {
      const type = ascii(offset, 4), size = view.getUint32(offset + 4, true);
      const end = offset + 8 + size + (size % 2);
      if (end > bytes.length) invalid();
      if (type === 'ANIM' || type === 'ANMF') animated();
      if ((type === 'VP8 ' || type === 'VP8L') && size > 0) imageData++;
      offset = end;
    }
    if (offset !== bytes.length || imageData !== 1) invalid();
    return;
  }
  if (contentType === 'image/avif') {
    let offset = 0, metadata = false, imageData = false;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset), type = ascii(offset + 4, 4);
      if (size < 8) throw new InspectionFailure('unavailable', 'image_container_variant_unavailable');
      if (offset + size > bytes.length) invalid();
      if (type === 'ftyp') {
        for (let i = offset + 8; i + 4 <= offset + size; i += 4) if (ascii(i, 4) === 'avis') animated();
      }
      if (type === 'meta') metadata = true;
      if (type === 'mdat' && size > 8) imageData = true;
      offset += size;
    }
    if (offset !== bytes.length || !metadata || !imageData) invalid();
    return;
  }
  throw new InspectionFailure('unavailable', 'image_container_variant_unavailable');
}

async function inspectBytes(bytes: Uint8Array, expectedMime: string, allowed: readonly string[],
  maxPixels: number, images: AttachmentImagesBinding, budget: InspectionBudget): Promise<{ mime: string; sha256: string; width: number; height: number }> {
  const detected = detectMediaMime(bytes);
  if (!detected || detected !== mime(expectedMime)) throw new InspectionFailure('blocked', 'mime_bytes_mismatch');
  if (!allowed.includes(detected)) throw new InspectionFailure('unavailable', 'image_format_policy_unavailable');
  completeEnvelope(bytes, detected);
  const header = inspectMedia(bytes, detected).dimensions;
  const boundedDimensions = (width: unknown, height: unknown): number => {
    const pixels = Number(width) * Number(height);
    if (!positive(width) || !positive(height) || !positive(pixels)
      || pixels > maxPixels || pixels * 4 > MAX_ESTIMATED_DECODED_BYTES) {
      throw new InspectionFailure('blocked', 'image_pixel_or_decode_memory_limit');
    }
    return pixels;
  };
  if (header) boundedDimensions(header.width, header.height);
  const stream = () => budget.body(new Response(bytes.slice()).body!);
  const info = await budget.run(() => images.info(stream()));
  const infoMime = mime(info.format) ?? ({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' } as Record<string, string>)[info.format.toLowerCase()];
  if (infoMime !== detected || info.fileSize !== bytes.length
    || (header && (info.width !== header.width || info.height !== header.height))) {
    throw new InspectionFailure('blocked', 'decoded_metadata_mismatch');
  }
  const pixels = boundedDimensions(info.width, info.height);
  const decoded = await budget.run(() => images.input(stream()).output({ format: 'rgba', anim: false }),
    value => budget.cancelBody(value.image()));
  const reader = budget.body(decoded.image()).getReader();
  let decodedBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      decodedBytes += next.value.byteLength;
      if (decodedBytes > pixels * 4) {
        await reader.cancel('decoded_pixel_limit');
        throw new InspectionFailure('blocked', 'decoded_pixel_limit');
      }
    }
  } finally { reader.releaseLock(); }
  if (decodedBytes !== pixels * 4) throw new InspectionFailure('blocked', 'decoded_pixels_incomplete');
  return { mime: detected, sha256: await budget.run(() => sha256Hex(bytes)), width: info.width!, height: info.height! };
}

function sameStorage(a: AttachmentPrivateObject, b: AttachmentPrivateObject): boolean {
  return a.etag === b.etag && a.size === b.size && mime(a.httpMetadata?.contentType) === mime(b.httpMetadata?.contentType);
}

async function privateBytes(bucket: AttachmentPrivateBucket, key: string, expectedSize: number, expectedMime: string,
  maxBytes: number, budget: InspectionBudget): Promise<{ bytes: Uint8Array; head: AttachmentPrivateObject }> {
  if (!positive(expectedSize) || expectedSize > maxBytes) throw new InspectionFailure('blocked', 'stored_size_limit');
  const head = await budget.run(() => bucket.head(key));
  if (!head) throw new InspectionFailure('unavailable', 'private_bytes_unavailable');
  if (!head.etag || head.size !== expectedSize || mime(head.httpMetadata?.contentType) !== mime(expectedMime)) {
    throw new InspectionFailure('blocked', 'storage_metadata_mismatch');
  }
  const stableHead = { etag: head.etag, size: head.size, httpMetadata: { contentType: head.httpMetadata?.contentType } };
  const object = await budget.run(() => bucket.get(key, { onlyIf: { etagMatches: stableHead.etag } }),
    value => budget.cancelBody(value?.body));
  if (!object?.body || !sameStorage(stableHead, object)) {
    await budget.cancelBody(object?.body);
    throw new InspectionFailure('blocked', 'storage_revision_changed');
  }
  let bytes: Uint8Array;
  try { bytes = await readBoundedRequestBody({ headers: new Headers(), body: budget.body(object.body) }, maxBytes); }
  catch (error) {
    if (error instanceof Error && error.message === 'media_size_limit_exceeded') throw new InspectionFailure('blocked', 'stored_size_limit');
    throw error;
  }
  if (bytes.length !== expectedSize) throw new InspectionFailure('blocked', 'stored_size_mismatch');
  return { bytes, head: stableHead };
}

export function createPostAttachmentByteBoundary(dependencies: AttachmentByteBoundaryDependencies) {
  const { database, sourceBucket, storedBucket, images } = dependencies;
  const policy = policyCopy(dependencies.policy);
  const timeoutMs = dependencies.inspectionTimeoutMs ?? 30_000, cleanupMs = dependencies.cleanupTimeoutMs ?? 250;
  const lookup = async (mediaId: string, ownerId: string, budget: InspectionBudget): Promise<MediaRecord> => {
    const loaded = await budget.run(() => database.query<MediaRecord>(POST_ATTACHMENT_OWNER_LOOKUP_SQL, [mediaId, ownerId]));
    if (loaded.rows.length !== 1) throw new InspectionFailure('blocked', 'attachment_unavailable');
    const row = loaded.rows[0];
    if (row.media_id !== mediaId || row.owner_id !== ownerId || row.source_owner_id !== ownerId
      || !uuid(row.source_session_id) || row.source_purpose !== 'standard' || row.source_status !== 'approved'
      || !['review', 'approved'].includes(row.object_state) || row.deleted_at !== null
      || !positive(Number(row.state_version)) || !digest(row.source_sha256) || !digest(row.stored_sha256)
      || typeof row.source_key !== 'string' || !row.source_key || typeof row.stored_key !== 'string' || !row.stored_key) {
      throw new InspectionFailure('blocked', 'attachment_unavailable');
    }
    return Object.fromEntries([
      'media_id', 'owner_id', 'source_session_id', 'source_owner_id', 'source_purpose', 'source_status',
      'object_state', 'deleted_at', 'state_version', 'source_key', 'stored_key', 'source_mime', 'stored_mime',
      'source_bytes', 'stored_bytes', 'source_sha256', 'stored_sha256',
    ].map(key => [key, row[key as keyof MediaRecord]])) as unknown as MediaRecord;
  };
  return Object.freeze({
    async loadForOwner(ownerId: string, request: unknown): Promise<AttachmentByteInspectionResult> {
      if (!policy) return result('unavailable', 'image_format_or_bounds_policy_unavailable');
      if (!images) return result('unavailable', 'image_decoder_unavailable');
      if (!positive(timeoutMs) || timeoutMs > 30_000 || !positive(cleanupMs) || cleanupMs > 1_000) {
        return result('unavailable', 'inspection_deadline_config_invalid');
      }
      let mediaId: string, owner: string;
      try {
        if (!uuid(ownerId) || !request || typeof request !== 'object' || Array.isArray(request)
          || ![Object.prototype, null].includes(Object.getPrototypeOf(request))) return result('blocked', 'attachment_request_invalid');
        const keys = Reflect.ownKeys(request), descriptor = Object.getOwnPropertyDescriptor(request, 'mediaId');
        if (keys.length !== 1 || keys[0] !== 'mediaId' || !descriptor || !('value' in descriptor) || !uuid(descriptor.value)) {
          return result('blocked', 'attachment_request_invalid');
        }
        mediaId = descriptor.value.toLowerCase(); owner = ownerId.toLowerCase();
      } catch { return result('blocked', 'attachment_request_invalid'); }
      const budget = inspectionBudget(timeoutMs, cleanupMs);
      try {
        const row = await lookup(mediaId, owner, budget);
        const source = await privateBytes(sourceBucket, row.source_key, Number(row.source_bytes), row.source_mime, policy.maxSourceBytes!, budget);
        const stored = await privateBytes(storedBucket, row.stored_key, Number(row.stored_bytes), row.stored_mime, policy.maxStoredBytes!, budget);
        if (await budget.run(() => sha256Hex(source.bytes)) !== row.source_sha256
          || await budget.run(() => sha256Hex(stored.bytes)) !== row.stored_sha256) {
          throw new InspectionFailure('blocked', 'source_or_stored_integrity_mismatch');
        }
        const sourceFacts = await inspectBytes(source.bytes, row.source_mime, policy.allowedSourceContentTypes!, policy.maxPixels!, images, budget);
        const storedFacts = await inspectBytes(stored.bytes, row.stored_mime, policy.allowedStoredContentTypes!, policy.maxPixels!, images, budget);
        if (sourceFacts.sha256 !== row.source_sha256 || storedFacts.sha256 !== row.stored_sha256) {
          throw new InspectionFailure('blocked', 'source_or_stored_integrity_mismatch');
        }
        const fresh = await lookup(mediaId, owner, budget);
        if (JSON.stringify(row) !== JSON.stringify(fresh)) throw new InspectionFailure('blocked', 'media_revision_changed');
        const sourceHead = await budget.run(() => sourceBucket.head(row.source_key));
        const storedHead = await budget.run(() => storedBucket.head(row.stored_key));
        if (!sourceHead || !storedHead || !sameStorage(source.head, sourceHead) || !sameStorage(stored.head, storedHead)) {
          throw new InspectionFailure('blocked', 'storage_revision_changed');
        }
        const version = Number(row.state_version);
        const format = (facts: typeof sourceFacts) => Object.freeze({ outcome: 'verified' as const,
          detectedContentType: facts.mime, inputSha256: facts.sha256, mediaStateVersion: version });
        const snapshot: PostAttachmentMediaSnapshot = Object.freeze({
          mediaId, ownerId: owner, objectVersion: version, objectState: row.object_state, deletedAt: null,
          objectContentType: storedFacts.mime, objectByteSize: stored.bytes.length, objectSha256: storedFacts.sha256,
          sourceSha256: sourceFacts.sha256, width: storedFacts.width, height: storedFacts.height,
          sourceUploadSessionId: row.source_session_id, sourceUploadOwnerId: row.source_owner_id,
          sourceUploadPurpose: row.source_purpose, sourceUploadStatus: row.source_status,
          sourceContentType: sourceFacts.mime, sourceByteSize: source.bytes.length,
          sourceFormatEvidence: format(sourceFacts), objectFormatEvidence: format(storedFacts),
          orientationNormalized: null, exifMetadataAbsent: null, gpsMetadataAbsent: null,
          safetyEvidence: null, authenticityEvidence: null,
        });
        return result('inspected', 'format_only_no_modality_authority', snapshot);
      } catch (error) {
        if (error instanceof InspectionFailure) return result(error.status, error.message);
        const code = (error as { code?: string } | null)?.code;
        if (code === '42703' || code === '42P01') return result('unavailable', 'attachment_metadata_schema_unavailable');
        return result('unavailable', 'inspection_dependency_unavailable');
      } finally { await budget.close(); }
    },
  });
}
