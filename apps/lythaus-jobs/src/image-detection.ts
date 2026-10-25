import { processImageDetection, type DetectionDependencies } from '../../../packages/authenticity/src/image-detection.ts';
import { isUuidV7 } from '../../../packages/authenticity/src/uuid.ts';

export async function processImageDetectionEvent(deps: DetectionDependencies, event: unknown, signal?: AbortSignal) {
  if (deps.mode !== 'synthetic-local-only') return 'disabled';
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('image_detection_event_invalid');
  const value = event as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'bindingHash,jobId,sourceEventId'
    || !isUuidV7(value.jobId) || !isUuidV7(value.sourceEventId)
    || typeof value.bindingHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.bindingHash)) throw new Error('image_detection_event_invalid');
  return processImageDetection(deps, { jobId: value.jobId, sourceEventId: value.sourceEventId, bindingHash: value.bindingHash }, signal);
}
