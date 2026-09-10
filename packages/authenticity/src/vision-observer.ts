import type { Applicability } from './contracts.ts';
import { CLOUDFLARE_VISION_OBSERVER_MODEL } from './research-config.ts';
import { assertResearchImageInput, bytesToDataUrl, type ResearchImageMime } from './research-image.ts';

export const VISION_OBSERVER_PROTOCOL_VERSION = 'lythaus-vision-observer-protocol-v1' as const;
export const VISION_OBSERVER_PROMPT_VERSION = 'lythaus-vision-observer-prompt-v1' as const;

export const VISION_OBSERVER_CATEGORIES = [
  'SCENE_INVENTORY',
  'TEXT',
  'GEOMETRY_OCCLUSION',
  'LIGHTING_SHADOW',
  'REFLECTION',
  'REPETITION',
  'ANATOMY',
  'SUSPICIOUS_REGION',
] as const;
export type VisionObservationCategory = (typeof VISION_OBSERVER_CATEGORIES)[number];

export const VISION_OBSERVATION_STATUSES = ['OBSERVED', 'NOT_OBSERVED', 'INDETERMINATE', 'NOT_APPLICABLE'] as const;
export type VisionObservationStatus = (typeof VISION_OBSERVATION_STATUSES)[number];

export interface VisionRegion {
  coordinateSpace: 'NORMALIZED';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface VisionObservationProvenance {
  evidenceFamily: 'VISION_OBSERVATION';
  sourceComponent: 'lythaus-vision-observer';
  provider: string;
  modelVersion: string;
  schemaVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  executionTimestamp: string;
  inputHash: string;
  applicable: Applicability;
  limitations: readonly string[];
}

export interface VisionObservation {
  observationId: string;
  protocolVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  category: VisionObservationCategory;
  applicable: boolean;
  status: VisionObservationStatus;
  observation: string;
  regions: readonly VisionRegion[];
  measurementConfidence: number | null;
  limitations: readonly string[];
  provider: string;
  model: string;
  provenance: VisionObservationProvenance;
}

export interface VisionObserverInput {
  sampleId: string;
  inputHash: string;
  mime: ResearchImageMime | string;
  bytes: Uint8Array;
  executionTimestamp?: string;
}

export type VisionObserverErrorCategory = 'EMPTY_RESPONSE' | 'INVALID_INPUT' | 'TIMEOUT' | 'NETWORK_FAILURE' | 'MALFORMED_RESPONSE' | 'UNEXPECTED_SCHEMA';

export interface VisionObserverResult {
  schemaVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  protocolVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  promptVersion: typeof VISION_OBSERVER_PROMPT_VERSION;
  prompt: string;
  provider: string;
  model: string;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  observations: readonly VisionObservation[];
  executionMs: number;
  errorCategory?: VisionObserverErrorCategory;
}

export interface VisionObserver {
  observe(input: VisionObserverInput): Promise<VisionObserverResult>;
  isLive?: boolean;
}

export interface CloudflareAiRunOptions {
  run(model: string, input: unknown, options?: { gateway?: { id: string; skipCache?: boolean; cacheTtl?: number }; collectLog?: boolean; metadata?: Record<string, string> }): Promise<unknown>;
}

export const VISION_OBSERVER_PROMPT = [
  'You are the Lythaus Vision Observer, protocol lythaus-vision-observer-protocol-v1.',
  'You are visual evidence collection only. Do not determine whether the image is AI-generated.',
  'Do not assign synthetic probability, human probability, authenticity labels, or an image-level verdict.',
  'Report structured observations only. Do not invent anomalies. Absence of an anomaly is valid.',
  'Uncertainty and NOT_APPLICABLE are valid outcomes. Partial visibility must not be treated as malformed.',
  'Unusual artistic content is not automatically an error. Screenshots, CGI, game images, digital art, and composites are legitimate hard negatives.',
  'Do not use metadata because this Observer is visual-only unless metadata is explicitly supplied in the question.',
  'Inspect scene inventory: people, animals, objects, screens or displays, text regions, mirrors, reflective surfaces, shadows, repeated objects, and UI elements.',
  'When text exists, identify text regions and transcribe or OCR where possible; report malformed or inconsistent glyph structures without calling them AI artifacts.',
  'Inspect object intersections, impossible overlap, occlusion consistency, repeated structural discontinuities, and perspective conflicts.',
  'Inspect apparent major light directions and shadow consistency; do not penalize complex multi-light scenes merely for having multiple shadow directions.',
  'For mirrors and reflective surfaces, report expected reflected objects, gross inconsistencies, or indeterminate visibility.',
  'Inspect suspicious repeated textures or duplicated local structures, while treating natural repetition as valid.',
  'When applicable, inspect visible hands, digits, limbs, faces, and joints; do not hallucinate occluded anatomy.',
  'Return suspicious regions or ROIs warranting further inspection when the model can localize them.',
  'Only inspect anatomy when visible and applicable. Mark occluded or ambiguous anatomy INDETERMINATE.',
  'Do not treat natural repetition or complex multi-light scenes as synthetic by default.',
  'Return JSON only: {"observations":[{"category":"...","applicable":true,"status":"...","observation":"...","regions":[],"measurementConfidence":null,"limitations":[]}]}.',
  'If regions are returned, coordinates must be normalized from 0 to 1 with coordinateSpace NORMALIZED.',
].join('\n');

function finite01(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function textFromModelResponse(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { response?: unknown; result?: unknown; output_text?: unknown };
  if (typeof candidate.response === 'string') return candidate.response;
  if (typeof candidate.result === 'string') return candidate.result;
  if (typeof candidate.output_text === 'string') return candidate.output_text;
  return '';
}

function parseJsonResponse(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { observations?: unknown };
    if (Array.isArray(candidate.observations)) return value;
  }
  const text = textFromModelResponse(value).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeRegion(value: unknown): VisionRegion | null {
  if (!value || typeof value !== 'object') return null;
  const region = value as Record<string, unknown>;
  if (region.coordinateSpace !== 'NORMALIZED') return null;
  if (![region.x, region.y, region.width, region.height].every(finite01)) return null;
  if ((region.width as number) <= 0 || (region.height as number) <= 0) return null;
  if ((region.x as number) + (region.width as number) > 1 || (region.y as number) + (region.height as number) > 1) return null;
  return {
    coordinateSpace: 'NORMALIZED',
    x: region.x as number,
    y: region.y as number,
    width: region.width as number,
    height: region.height as number,
    ...(typeof region.label === 'string' && region.label.trim() ? { label: region.label.trim().slice(0, 120) } : {}),
  };
}

function normalizeObservation(value: unknown, index: number, input: VisionObserverInput, provider: string, model: string): VisionObservation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!(VISION_OBSERVER_CATEGORIES as readonly string[]).includes(String(candidate.category))) return null;
  if (!(VISION_OBSERVATION_STATUSES as readonly string[]).includes(String(candidate.status))) return null;
  if (typeof candidate.applicable !== 'boolean' || typeof candidate.observation !== 'string') return null;
  const confidence = candidate.measurementConfidence === null || candidate.measurementConfidence === undefined
    ? null
    : finite01(candidate.measurementConfidence) ? candidate.measurementConfidence : null;
  if (candidate.measurementConfidence !== null && candidate.measurementConfidence !== undefined && confidence === null) return null;
  const rawRegions = candidate.regions === undefined ? [] : candidate.regions;
  if (!Array.isArray(rawRegions)) return null;
  const regions = rawRegions.map(normalizeRegion);
  if (regions.some((region) => region === null)) return null;
  const limitations = candidate.limitations === undefined ? [] : candidate.limitations;
  if (!Array.isArray(limitations) || !limitations.every((item) => typeof item === 'string')) return null;
  return {
    observationId: typeof candidate.observationId === 'string' && candidate.observationId.trim()
      ? candidate.observationId.trim().slice(0, 120)
      : `${input.inputHash.slice(0, 16)}-obs-${index + 1}`,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    category: candidate.category as VisionObservationCategory,
    applicable: candidate.applicable,
    status: candidate.status as VisionObservationStatus,
    observation: candidate.observation.slice(0, 1200),
    regions: regions as VisionRegion[],
    measurementConfidence: confidence,
    limitations: limitations.map((item) => item.slice(0, 300)).slice(0, 12),
    provider,
    model,
    provenance: {
      evidenceFamily: 'VISION_OBSERVATION',
      sourceComponent: 'lythaus-vision-observer',
      provider,
      modelVersion: model,
      schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
      executionTimestamp: input.executionTimestamp ?? new Date().toISOString(),
      inputHash: input.inputHash,
      applicable: candidate.applicable ? 'applicable' : 'not_applicable',
      limitations: limitations.map((item) => item.slice(0, 300)).slice(0, 12),
    },
  };
}

function successfulObserverResult(input: VisionObserverInput, provider: string, model: string, observations: readonly VisionObservation[], executionMs: number): VisionObserverResult {
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    promptVersion: VISION_OBSERVER_PROMPT_VERSION,
    prompt: VISION_OBSERVER_PROMPT,
    provider,
    model,
    status: 'SUCCESS',
    observations,
    executionMs,
  };
}

function failedObserverResult(provider: string, model: string, errorCategory: VisionObserverErrorCategory, executionMs: number): VisionObserverResult {
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    promptVersion: VISION_OBSERVER_PROMPT_VERSION,
    prompt: VISION_OBSERVER_PROMPT,
    provider,
    model,
    status: 'PROVIDER_FAILURE',
    observations: [],
    executionMs,
    errorCategory,
  };
}

export function createCloudflareVisionObserver(options: {
  ai: CloudflareAiRunOptions;
  model?: string;
  maxImageBytes?: number;
  timeoutMs?: number;
}): VisionObserver & { isLive: true } {
  const model = options.model ?? CLOUDFLARE_VISION_OBSERVER_MODEL;
  const provider = 'cloudflare-workers-ai';
  return {
    isLive: true,
    async observe(input): Promise<VisionObserverResult> {
      const startedAt = Date.now();
      try {
        const mime = assertResearchImageInput({ bytes: input.bytes, mime: input.mime, maxBytes: options.maxImageBytes });
        const image = bytesToDataUrl(input.bytes, mime);
        const request = {
          task: 'query',
          image,
          question: VISION_OBSERVER_PROMPT,
        };
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutMs = options.timeoutMs ?? 30_000;
        const call = options.ai.run(model, request, { metadata: { protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION } });
        const guarded = timeoutMs > 0
          ? new Promise<unknown>((resolve, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('observer_timeout')), timeoutMs);
            call.then(resolve, reject);
          })
          : call;
        let raw: unknown;
        try {
          raw = await guarded;
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
        const parsed = parseJsonResponse(raw);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { observations?: unknown }).observations)) {
          return failedObserverResult(provider, model, 'UNEXPECTED_SCHEMA', Date.now() - startedAt);
        }
        const observations = (parsed as { observations: unknown[] }).observations.map((value, index) => normalizeObservation(value, index, input, provider, model));
        if (observations.some((value) => value === null)) return failedObserverResult(provider, model, 'MALFORMED_RESPONSE', Date.now() - startedAt);
        return successfulObserverResult(input, provider, model, observations as VisionObservation[], Date.now() - startedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const category: VisionObserverErrorCategory = message === 'research_image_empty' || message === 'research_image_mime_invalid' || message === 'research_image_size_limit_exceeded'
          ? 'INVALID_INPUT'
          : message === 'observer_timeout'
            ? 'TIMEOUT'
            : 'NETWORK_FAILURE';
        return failedObserverResult(provider, model, category, Date.now() - startedAt);
      }
    },
  };
}

export function createMockVisionObserver(observations: readonly VisionObservation[] = []): VisionObserver & { isLive: false } {
  return {
    isLive: false,
    async observe(input): Promise<VisionObserverResult> {
      const provider = 'mock-vision-observer';
      const model = 'mock-v1';
      return successfulObserverResult(
        input,
        provider,
        model,
        observations.map((observation, index) => ({
          ...observation,
          observationId: observation.observationId || `${input.inputHash.slice(0, 16)}-mock-${index + 1}`,
          protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
          provider,
          model,
          provenance: {
            evidenceFamily: 'VISION_OBSERVATION',
            sourceComponent: 'lythaus-vision-observer',
            provider,
            modelVersion: model,
            schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
            executionTimestamp: input.executionTimestamp ?? new Date().toISOString(),
            inputHash: input.inputHash,
            applicable: observation.applicable ? 'applicable' : 'not_applicable',
            limitations: observation.limitations,
          },
        })),
        0,
      );
    },
  };
}

export function assertVisionObservation(observation: VisionObservation): void {
  if (observation.protocolVersion !== VISION_OBSERVER_PROTOCOL_VERSION) throw new Error('vision_observation_protocol_invalid');
  if (!(VISION_OBSERVER_CATEGORIES as readonly string[]).includes(observation.category)) throw new Error('vision_observation_category_invalid');
  if (!(VISION_OBSERVATION_STATUSES as readonly string[]).includes(observation.status)) throw new Error('vision_observation_status_invalid');
  if (observation.measurementConfidence !== null && !finite01(observation.measurementConfidence)) throw new Error('vision_observation_confidence_invalid');
  if (observation.provenance.evidenceFamily !== 'VISION_OBSERVATION' || observation.provenance.sourceComponent !== 'lythaus-vision-observer') throw new Error('vision_observation_provenance_invalid');
  if (observation.provenance.schemaVersion !== VISION_OBSERVER_PROTOCOL_VERSION || !observation.provenance.inputHash) throw new Error('vision_observation_provenance_invalid');
  for (const region of observation.regions) {
    if (region.coordinateSpace !== 'NORMALIZED' || ![region.x, region.y, region.width, region.height].every(finite01) || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) throw new Error('vision_region_invalid');
  }
}
