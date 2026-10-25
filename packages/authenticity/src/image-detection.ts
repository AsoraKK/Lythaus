import { verifyStandardUploadBytes, UploadIntegrityError } from '../../media/src/standard-upload.ts';
import { uuidv7 } from './uuid.ts';
import { compileDetectionEvidence, detectionBindingHash, detectionOwnerStatus,
  type DetectionJob, type DetectionReason, type ImageDetectionBinding,
  type ImageDetectionEvidence, type ImageDetectionOutput } from './image-detection-contract.ts';

export interface DetectionStore {
  admit(id: string, binding: ImageDetectionBinding, expiresAt: string): Promise<DetectionJob>;
  read(id: string, ownerId: string): Promise<DetectionJob | null>;
  claim(id: string, eventId: string, bindingHash: string, attemptId: string, leaseMs: number): Promise<DetectionJob | null>;
  startDispatch(id: string, attemptId: string): Promise<DetectionJob | null>;
  settle(id: string, attemptId: string, state: 'completed' | 'failed' | 'inconclusive',
    evidence: ImageDetectionEvidence | null, reason: DetectionReason | null): Promise<boolean>;
  retryBeforeDispatch(id: string, attemptId: string, reason: DetectionReason): Promise<void>;
  invalidate(id: string, ownerId: string, reason: 'CANCELLED' | 'DELETED' | 'CLEANUP' | 'SUPERSEDED'): Promise<void>;
}

export interface OriginalObject { version: string; etag: string; size: number }
export interface OriginalImageSource {
  head(key: string): Promise<OriginalObject | null>;
  get(key: string, options: { onlyIf: { etagMatches: string } }): Promise<(OriginalObject & { body?: ReadableStream<Uint8Array> }) | null>;
}

export interface SyntheticImageEvaluator {
  kind: 'synthetic';
  evaluate(input: { bytes: Uint8Array; binding: ImageDetectionBinding; bindingHash: string; attemptId: string; signal: AbortSignal }): Promise<ImageDetectionOutput>;
}

export interface DetectionDependencies {
  mode?: 'synthetic-local-only';
  store: DetectionStore;
  originals: OriginalImageSource;
  evaluator: SyntheticImageEvaluator;
  timeoutMs?: number;
}

function enabled(deps: DetectionDependencies): boolean {
  return deps.mode === 'synthetic-local-only' && deps.evaluator.kind === 'synthetic';
}

function sameOriginal(value: OriginalObject | null, binding: ImageDetectionBinding): boolean {
  return !!value && value.version === binding.original.version && value.etag === binding.original.etag
    && value.size === binding.original.bytes;
}

function abortableBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  const close = () => { signal.removeEventListener('abort', abort); reader.releaseLock(); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (signal.aborted) { controller.error(new Error('image_detection_stopped')); close(); }
        else if (next.done) { controller.close(); close(); }
        else controller.enqueue(next.value);
      } catch (error) { controller.error(error); close(); }
    },
    async cancel() { try { await reader.cancel(); } finally { close(); } },
  });
}

export async function enqueueImageDetection(deps: DetectionDependencies, binding: ImageDetectionBinding, expiresAt: string): Promise<DetectionJob | null> {
  if (!enabled(deps)) return null;
  await detectionBindingHash(binding);
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('image_detection_expiry_invalid');
  return deps.store.admit(uuidv7(), structuredClone(binding), expiresAt);
}

export async function processImageDetection(deps: DetectionDependencies,
  message: { jobId: string; sourceEventId: string; bindingHash: string }, signal?: AbortSignal): Promise<'disabled' | 'ignored' | 'settled'> {
  if (!enabled(deps)) return 'disabled';
  const timeoutMs = deps.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('image_detection_timeout_invalid');
  const job = await deps.store.claim(message.jobId, message.sourceEventId, message.bindingHash, uuidv7(), timeoutMs);
  if (!job?.binding || !job.attemptId) return 'ignored';
  const { binding } = job, attemptId = job.attemptId;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  let expired = false;
  let dispatched = false;
  const deadline = Math.min(Date.parse(job.expiresAt), Date.parse(job.leaseUntil!));
  const assertActive = () => {
    if (controller.signal.aborted || Date.now() >= deadline) throw new Error('image_detection_stopped');
  };
  const stop = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new Error('image_detection_stopped')); };
    timer = setTimeout(() => { expired = true; abort(); }, Math.max(0, deadline - Date.now()));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  const work = async () => {
    assertActive();
    const object = await deps.originals.get(binding.original.key, { onlyIf: { etagMatches: binding.original.etag } });
    if (controller.signal.aborted || Date.now() >= deadline) void object?.body?.cancel().catch(() => undefined);
    assertActive();
    if (!object) return { state: 'inconclusive' as const, evidence: null, reason: 'ORIGINAL_UNAVAILABLE' as const };
    if (!sameOriginal(object, binding) || !object.body) {
      await object.body?.cancel().catch(() => undefined);
      return { state: 'inconclusive' as const, evidence: null, reason: 'ORIGINAL_CHANGED' as const };
    }
    const bytes = await verifyStandardUploadBytes({ ...object, body: abortableBody(object.body, controller.signal) }, {
      expected_bytes: binding.original.bytes, checksum_sha256: binding.original.sha256, content_type: binding.original.mime,
    });
    assertActive();
    if (!sameOriginal(await deps.originals.head(binding.original.key), binding)) {
      return { state: 'inconclusive' as const, evidence: null, reason: 'ORIGINAL_CHANGED' as const };
    }
    assertActive();
    const started = await deps.store.startDispatch(job.id, attemptId);
    if (!started) throw new Error('image_detection_stopped');
    dispatched = true;
    assertActive();
    const output = await deps.evaluator.evaluate({ bytes, binding: structuredClone(binding), bindingHash: job.bindingHash, attemptId, signal: controller.signal });
    assertActive();
    if (!sameOriginal(await deps.originals.head(binding.original.key), binding)) {
      return { state: 'inconclusive' as const, evidence: null, reason: 'ORIGINAL_CHANGED' as const };
    }
    assertActive();
    let evidence: ImageDetectionEvidence;
    try { evidence = compileDetectionEvidence(started, output, new Date().toISOString()); }
    catch { return { state: 'inconclusive' as const, evidence: null, reason: 'INVALID_RESULT' as const }; }
    const state = output.safety === 'ALLOW' && ['SYNTHETIC_LIKE_EVIDENCE', 'NO_POSITIVE_EVIDENCE'].includes(output.authorship)
      ? 'completed' as const : 'inconclusive' as const;
    return { state, evidence, reason: null };
  };
  try {
    const result = await Promise.race([work(), stop]);
    assertActive();
    await deps.store.settle(job.id, attemptId, result.state, result.evidence, result.reason);
    if (signal?.aborted) await deps.store.invalidate(job.id, binding.ownerId, 'CANCELLED');
  } catch (error) {
    if (signal?.aborted) await deps.store.invalidate(job.id, binding.ownerId, 'CANCELLED');
    else if (error instanceof UploadIntegrityError) await deps.store.settle(job.id, attemptId, 'failed', null, 'INTEGRITY_FAILED');
    else if (dispatched) await deps.store.settle(job.id, attemptId, 'inconclusive', null, expired ? 'TIMEOUT' : 'ATTEMPT_CONSUMED');
    else await deps.store.retryBeforeDispatch(job.id, attemptId, expired ? 'TIMEOUT' : 'SOURCE_UNAVAILABLE');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
  return 'settled';
}

export async function imageDetectionStatus(deps: Pick<DetectionDependencies, 'store' | 'originals'>, jobId: string, ownerId: string) {
  let job = await deps.store.read(jobId, ownerId);
  if (!job || job.state === 'deleted') return null;
  if (job.evidence && job.binding) {
    let current = false;
    try { current = sameOriginal(await deps.originals.head(job.binding.original.key), job.binding); } catch { /* No usable current evidence. */ }
    if (!current) {
      await deps.store.invalidate(jobId, ownerId, 'CLEANUP');
      job = await deps.store.read(jobId, ownerId);
      if (!job || job.state === 'deleted') return null;
    }
  }
  return detectionOwnerStatus(job);
}
