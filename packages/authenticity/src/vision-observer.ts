import type { Applicability } from './contracts.ts';
import { createCloudflareRestTransport, type CloudflareRestTransport } from './cloudflare-rest.ts';
import { CLOUDFLARE_VISION_OBSERVER_MODEL } from './research-config.ts';
import { assertResearchImageInput, bytesToDataUrl, type ResearchImageMime } from './research-image.ts';

export const VISION_OBSERVER_PROTOCOL_VERSION = 'lythaus-vision-observer-protocol-v1' as const;
export const VISION_OBSERVER_PROMPT_VERSION = 'lythaus-vision-observer-prompt-v1' as const;
export const VISION_OBSERVER_ROUTING_POLICY_VERSION = 'lythaus-vision-observer-routing-policy-v1' as const;

export const VISION_OBSERVER_CATEGORIES = [
  'SCENE_INVENTORY',
  'OBJECT_LOCALISATION',
  'TEXT',
  'GEOMETRY_OCCLUSION',
  'LIGHTING_SHADOW',
  'REFLECTION',
  'REPETITION',
  'ANATOMY',
  'SCREEN_DISPLAY_RELATIONSHIP',
  'SUSPICIOUS_REGION',
] as const;
export type VisionObservationCategory = (typeof VISION_OBSERVER_CATEGORIES)[number];

export const VISION_OBSERVER_TASKS = ['caption', 'detect', 'point', 'query'] as const;
export type VisionObserverTask = (typeof VISION_OBSERVER_TASKS)[number];

export const VISION_OBSERVER_REASONING_MODES = ['DIRECT', 'REASONED'] as const;
export type VisionObserverReasoningMode = (typeof VISION_OBSERVER_REASONING_MODES)[number];

export const VISION_OBSERVATION_STATUSES = ['OBSERVED', 'NOT_OBSERVED', 'INDETERMINATE', 'NOT_APPLICABLE'] as const;
export type VisionObservationStatus = (typeof VISION_OBSERVATION_STATUSES)[number];

export const VISION_ESCALATION_RECOMMENDATIONS = ['NONE', 'REASONED_VISUAL_RECHECK'] as const;
export type VisionEscalationRecommendation = (typeof VISION_ESCALATION_RECOMMENDATIONS)[number];

export const VISION_ESCALATION_REASONS = [
  'LOW_OBSERVATION_CONFIDENCE',
  'RELATIONAL_VISUAL_TASK',
  'CONTRADICTORY_VISUAL_SIGNALS',
  'PARTIAL_OCCLUSION',
  'AMBIGUOUS_REFLECTION',
  'AMBIGUOUS_LIGHTING',
  'AMBIGUOUS_GEOMETRY',
  'AMBIGUOUS_ANATOMY',
  'SCREEN_RECAPTURE_UNCERTAINTY',
] as const;
export type VisionEscalationReason = (typeof VISION_ESCALATION_REASONS)[number];

export interface VisionRegion {
  coordinateSpace: 'NORMALIZED';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface VisionObserverRequest {
  queryId: string;
  category: VisionObservationCategory;
  task: VisionObserverTask;
  question?: string;
  target?: string;
  reasoningMode?: VisionObserverReasoningMode;
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
  task: VisionObserverTask;
  reasoningMode: VisionObserverReasoningMode;
  executionMs: number;
}

export interface VisionObservation {
  observationId: string;
  queryId: string;
  protocolVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  category: VisionObservationCategory;
  task: VisionObserverTask;
  reasoningMode: VisionObserverReasoningMode;
  applicable: boolean;
  status: VisionObservationStatus;
  observation: string;
  regions: readonly VisionRegion[];
  measurementConfidence: number | null;
  limitations: readonly string[];
  provider: string;
  model: string;
  executionMs: number;
  provenance: VisionObservationProvenance;
}

export interface VisionObserverInput {
  sampleId: string;
  inputHash: string;
  mime: ResearchImageMime | string;
  bytes: Uint8Array;
  executionTimestamp?: string;
  request?: VisionObserverRequest;
}

export type VisionObserverErrorCategory = 'EMPTY_RESPONSE' | 'INVALID_INPUT' | 'TIMEOUT' | 'NETWORK_FAILURE' | 'MALFORMED_RESPONSE' | 'UNEXPECTED_SCHEMA';

export interface VisionObserverResult {
  schemaVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  protocolVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  promptVersion: typeof VISION_OBSERVER_PROMPT_VERSION;
  prompt: string;
  provider: string;
  model: string;
  queryId: string;
  task: VisionObserverTask;
  reasoningMode: VisionObserverReasoningMode;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  observations: readonly VisionObservation[];
  escalationRecommendation: VisionEscalationRecommendation;
  escalationReasons: readonly VisionEscalationReason[];
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

export interface VisionRoutingPolicy {
  version: typeof VISION_OBSERVER_ROUTING_POLICY_VERSION;
  lowConfidenceThreshold: number;
  directFirst: readonly VisionObservationCategory[];
  reasonedAllowed: readonly VisionObservationCategory[];
}

export const VISION_OBSERVER_ROUTING_POLICY: VisionRoutingPolicy = {
  version: VISION_OBSERVER_ROUTING_POLICY_VERSION,
  lowConfidenceThreshold: 0.65,
  directFirst: ['SCENE_INVENTORY', 'OBJECT_LOCALISATION', 'TEXT', 'REPETITION', 'SUSPICIOUS_REGION', 'GEOMETRY_OCCLUSION', 'ANATOMY', 'SCREEN_DISPLAY_RELATIONSHIP'],
  reasonedAllowed: ['GEOMETRY_OCCLUSION', 'LIGHTING_SHADOW', 'REFLECTION', 'ANATOMY', 'SCREEN_DISPLAY_RELATIONSHIP'],
};

export const VISION_OBSERVER_PROMPT = [
  'You are the Lythaus Vision Observer, protocol lythaus-vision-observer-protocol-v1.',
  'You are visual evidence collection only. Do not determine whether the image is AI-generated.',
  'Do not assign synthetic probability, human probability, camera probability, authenticity labels, or an image-level verdict.',
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
  'If asked a relational question, describe the visible relationship and uncertainty; do not turn it into an origin conclusion.',
  'Return JSON only: {"observations":[{"category":"...","applicable":true,"status":"...","observation":"...","regions":[],"measurementConfidence":null,"limitations":[]}]}.',
  'If regions are returned, coordinates must be normalized from 0 to 1 with coordinateSpace NORMALIZED.',
].join('\n');

function defaultRequest(): VisionObserverRequest {
  return { queryId: 'SCENE_INVENTORY_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Inventory visible scene elements and report only structured visual observations.', reasoningMode: 'DIRECT' };
}

function requestFor(input: VisionObserverInput): VisionObserverRequest {
  const request = input.request ?? defaultRequest();
  const reasoningMode = request.reasoningMode ?? 'DIRECT';
  if (!request.queryId.trim() || !request.category || !request.task) throw new Error('vision_observer_request_invalid');
  if (!(VISION_OBSERVER_CATEGORIES as readonly string[]).includes(request.category)) throw new Error('vision_observer_category_invalid');
  if (!(VISION_OBSERVER_TASKS as readonly string[]).includes(request.task)) throw new Error('vision_observer_task_invalid');
  if (!(VISION_OBSERVER_REASONING_MODES as readonly string[]).includes(reasoningMode)) throw new Error('vision_observer_reasoning_mode_invalid');
  if (reasoningMode === 'REASONED' && request.task !== 'query') throw new Error('vision_reasoned_task_must_be_query');
  return { ...request, queryId: request.queryId.trim().slice(0, 120), reasoningMode };
}

function finite01(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textFromModelResponse(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  for (const key of ['response', 'output_text', 'answer', 'caption', 'description', 'text']) if (typeof value[key] === 'string') return value[key] as string;
  if (isRecord(value.result)) return textFromModelResponse(value.result);
  if (typeof value.result === 'string') return value.result;
  return '';
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeRegion(value: unknown): VisionRegion | null {
  if (!isRecord(value) || value.coordinateSpace !== 'NORMALIZED') return null;
  if (![value.x, value.y, value.width, value.height].every(finite01)) return null;
  if ((value.width as number) <= 0 || (value.height as number) <= 0) return null;
  if ((value.x as number) + (value.width as number) > 1 || (value.y as number) + (value.height as number) > 1) return null;
  return {
    coordinateSpace: 'NORMALIZED',
    x: value.x as number,
    y: value.y as number,
    width: value.width as number,
    height: value.height as number,
    ...(typeof value.label === 'string' && value.label.trim() ? { label: value.label.trim().slice(0, 120) } : {}),
  };
}

function regionFromObject(value: unknown): VisionRegion | null {
  if (!isRecord(value)) return null;
  const x = typeof value.x === 'number' ? value.x : typeof value.x_min === 'number' ? value.x_min : null;
  const y = typeof value.y === 'number' ? value.y : typeof value.y_min === 'number' ? value.y_min : null;
  const width = typeof value.width === 'number' ? value.width : typeof value.w === 'number' ? value.w : typeof value.x_max === 'number' && x !== null ? value.x_max - x : null;
  const height = typeof value.height === 'number' ? value.height : typeof value.h === 'number' ? value.h : typeof value.y_max === 'number' && y !== null ? value.y_max - y : null;
  if (![x, y, width, height].every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  return normalizeRegion({ coordinateSpace: 'NORMALIZED', x, y, width, height });
}

function normalizeTaskOutput(value: unknown, request: VisionObserverRequest): { observations: unknown[] } | null {
  if (isRecord(value) && Array.isArray(value.observations)) return { observations: value.observations };
  if (isRecord(value) && isRecord(value.result)) return normalizeTaskOutput(value.result, request);
  if (isRecord(value) && Array.isArray(value.objects)) {
    return {
      observations: [{
        category: request.category,
        applicable: true,
        status: 'OBSERVED',
        observation: `The provider returned ${value.objects.length} detected object(s).`,
        regions: value.objects.map(regionFromObject).filter((region): region is VisionRegion => region !== null),
        measurementConfidence: null,
        limitations: ['Detection output was normalized from the provider response; coordinates are retained only when already normalized.'],
      }],
    };
  }
  if (isRecord(value) && Array.isArray(value.points)) {
    return {
      observations: [{
        category: request.category,
        applicable: true,
        status: 'OBSERVED',
        observation: `The provider returned ${value.points.length} point(s) for the requested target.`,
        regions: [],
        measurementConfidence: null,
        limitations: ['Point output is preserved as a visual observation without treating it as an origin conclusion.'],
      }],
    };
  }
  if (isRecord(value) && typeof value.response === 'string') {
    const parsedResponse = parseJsonText(value.response);
    return parsedResponse && isRecord(parsedResponse) && Array.isArray(parsedResponse.observations) ? { observations: parsedResponse.observations } : null;
  }
  const text = textFromModelResponse(value);
  if (text) {
    const parsed = parseJsonText(text);
    if (parsed && isRecord(parsed) && Array.isArray(parsed.observations)) return { observations: parsed.observations };
    return {
      observations: [{
        category: request.category,
        applicable: true,
        status: 'OBSERVED',
        observation: text,
        regions: [],
        measurementConfidence: null,
        limitations: ['The provider returned free-form visual text; no origin conclusion was accepted.'],
      }],
    };
  }
  const parsed = parseJsonText(typeof value === 'string' ? value : '');
  return parsed && isRecord(parsed) && Array.isArray(parsed.observations) ? { observations: parsed.observations } : null;
}

function normalizeObservation(value: unknown, index: number, input: VisionObserverInput, request: VisionObserverRequest, provider: string, model: string, executionMs: number): VisionObservation | null {
  if (!isRecord(value)) return null;
  if (!(VISION_OBSERVER_CATEGORIES as readonly string[]).includes(String(value.category))) return null;
  if (!(VISION_OBSERVATION_STATUSES as readonly string[]).includes(String(value.status))) return null;
  if (typeof value.applicable !== 'boolean' || typeof value.observation !== 'string') return null;
  const confidence = value.measurementConfidence === null || value.measurementConfidence === undefined
    ? null
    : finite01(value.measurementConfidence) ? value.measurementConfidence : null;
  if (value.measurementConfidence !== null && value.measurementConfidence !== undefined && confidence === null) return null;
  const rawRegions = value.regions === undefined ? [] : value.regions;
  if (!Array.isArray(rawRegions)) return null;
  const regions = rawRegions.map(normalizeRegion);
  if (regions.some((region) => region === null)) return null;
  const limitations = value.limitations === undefined ? [] : value.limitations;
  if (!Array.isArray(limitations) || !limitations.every((item) => typeof item === 'string')) return null;
  const reasoningMode = request.reasoningMode ?? 'DIRECT';
  const safeLimitations = limitations.map((item) => item.slice(0, 300)).slice(0, 12);
  const observationId = `${input.inputHash.slice(0, 16)}-${request.queryId}-${reasoningMode}-${index + 1}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
  return {
    observationId,
    queryId: request.queryId,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    category: value.category as VisionObservationCategory,
    task: request.task,
    reasoningMode,
    applicable: value.applicable,
    status: value.status as VisionObservationStatus,
    observation: value.observation.slice(0, 1200),
    regions: regions as VisionRegion[],
    measurementConfidence: confidence,
    limitations: safeLimitations,
    provider,
    model,
    executionMs,
    provenance: {
      evidenceFamily: 'VISION_OBSERVATION',
      sourceComponent: 'lythaus-vision-observer',
      provider,
      modelVersion: model,
      schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
      executionTimestamp: input.executionTimestamp ?? new Date().toISOString(),
      inputHash: input.inputHash,
      applicable: value.applicable ? 'applicable' : 'not_applicable',
      limitations: safeLimitations,
      task: request.task,
      reasoningMode,
      executionMs,
    },
  };
}

function successfulObserverResult(input: VisionObserverInput, request: VisionObserverRequest, provider: string, model: string, observations: readonly VisionObservation[], executionMs: number): VisionObserverResult {
  const decision = recommendVisionEscalation({ observations, reasoningMode: request.reasoningMode ?? 'DIRECT', category: request.category });
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    promptVersion: VISION_OBSERVER_PROMPT_VERSION,
    prompt: VISION_OBSERVER_PROMPT,
    provider,
    model,
    queryId: request.queryId,
    task: request.task,
    reasoningMode: request.reasoningMode ?? 'DIRECT',
    status: 'SUCCESS',
    observations,
    escalationRecommendation: decision.recommendation,
    escalationReasons: decision.reasons,
    executionMs,
  };
}

function failedObserverResult(request: VisionObserverRequest, provider: string, model: string, errorCategory: VisionObserverErrorCategory, executionMs: number): VisionObserverResult {
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    promptVersion: VISION_OBSERVER_PROMPT_VERSION,
    prompt: VISION_OBSERVER_PROMPT,
    provider,
    model,
    queryId: request.queryId,
    task: request.task,
    reasoningMode: request.reasoningMode ?? 'DIRECT',
    status: 'PROVIDER_FAILURE',
    observations: [],
    escalationRecommendation: 'NONE',
    escalationReasons: [],
    executionMs,
    errorCategory,
  };
}

function buildMoondreamPayload(input: VisionObserverInput, request: VisionObserverRequest, image: string): Record<string, unknown> {
  if (request.task === 'query') {
    return {
      task: 'query',
      image,
      question: `${VISION_OBSERVER_PROMPT}\nTarget category: ${request.category}\nTarget visual question: ${request.question?.trim() || 'Report only applicable visual observations for this category.'}`,
      reasoning: request.reasoningMode === 'REASONED',
      stream: false,
    };
  }
  if (request.task === 'caption') return { task: 'caption', image, caption_length: 'normal', stream: false };
  return { task: request.task, image, target: request.target?.trim() || request.question?.trim() || 'object', max_objects: 20, stream: false };
}

function errorCategoryFrom(error: unknown): VisionObserverErrorCategory {
  const message = error instanceof Error ? error.message : '';
  const category = error && typeof error === 'object' && 'category' in error ? (error as { category?: unknown }).category : null;
  if (message === 'research_image_empty' || message === 'research_image_mime_invalid' || message === 'research_image_size_limit_exceeded' || message === 'vision_observer_request_invalid' || message === 'vision_observer_category_invalid' || message === 'vision_observer_task_invalid' || message === 'vision_observer_reasoning_mode_invalid' || message === 'vision_reasoned_task_must_be_query') return 'INVALID_INPUT';
  if (message === 'observer_timeout' || category === 'TIMEOUT') return 'TIMEOUT';
  if (category === 'MALFORMED_RESPONSE' || category === 'PROVIDER_FAILURE') return 'UNEXPECTED_SCHEMA';
  return 'NETWORK_FAILURE';
}

async function invokeWithTimeout(run: () => Promise<unknown>, timeoutMs: number): Promise<unknown> {
  if (timeoutMs <= 0) return run();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = run();
    const timeout = new Promise<never>((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error('observer_timeout')), timeoutMs); });
    return await Promise.race([call, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function createVisionObserver(options: {
  model: string;
  provider: string;
  maxImageBytes?: number;
  timeoutMs?: number;
  run: (model: string, payload: Record<string, unknown>, request: VisionObserverRequest) => Promise<unknown>;
}): VisionObserver & { isLive: true } {
  return {
    isLive: true,
    async observe(input): Promise<VisionObserverResult> {
      const startedAt = Date.now();
      let request: VisionObserverRequest = defaultRequest();
      try {
        request = requestFor(input);
        const mime = assertResearchImageInput({ bytes: input.bytes, mime: input.mime, maxBytes: options.maxImageBytes });
        const image = bytesToDataUrl(input.bytes, mime);
        const raw = await invokeWithTimeout(() => options.run(options.model, buildMoondreamPayload(input, request, image), request), options.timeoutMs ?? 30_000);
        const normalized = normalizeTaskOutput(raw, request);
        if (!normalized) return failedObserverResult(request, options.provider, options.model, 'UNEXPECTED_SCHEMA', Date.now() - startedAt);
        const observations = normalized.observations.map((value, index) => normalizeObservation(value, index, input, request, options.provider, options.model, Date.now() - startedAt));
        if (observations.some((value) => value === null)) return failedObserverResult(request, options.provider, options.model, 'MALFORMED_RESPONSE', Date.now() - startedAt);
        return successfulObserverResult(input, request, options.provider, options.model, observations as VisionObservation[], Date.now() - startedAt);
      } catch (error) {
        return failedObserverResult(request, options.provider, options.model, errorCategoryFrom(error), Date.now() - startedAt);
      }
    },
  };
}

export function createCloudflareVisionObserver(options: {
  ai: CloudflareAiRunOptions;
  model?: string;
  maxImageBytes?: number;
  timeoutMs?: number;
}): VisionObserver & { isLive: true } {
  const model = options.model ?? CLOUDFLARE_VISION_OBSERVER_MODEL;
  return createVisionObserver({
    model,
    provider: 'cloudflare-workers-ai',
    maxImageBytes: options.maxImageBytes,
    timeoutMs: options.timeoutMs,
    run: (selectedModel, payload) => options.ai.run(selectedModel, payload, { metadata: { protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION, promptVersion: VISION_OBSERVER_PROMPT_VERSION } }),
  });
}

export function createCloudflareVisionObserverRest(options: {
  transport: CloudflareRestTransport;
  model?: string;
  maxImageBytes?: number;
}): VisionObserver & { isLive: true } {
  const model = options.model ?? CLOUDFLARE_VISION_OBSERVER_MODEL;
  return createVisionObserver({
    model,
    provider: 'cloudflare-workers-ai-rest',
    maxImageBytes: options.maxImageBytes,
    timeoutMs: 0,
    run: async (selectedModel, payload) => (await options.transport.run({ kind: 'VISION_OBSERVER', model: selectedModel, payload })).result,
  });
}

export function createMockVisionObserver(observations: readonly VisionObservation[] = []): VisionObserver & { isLive: false } {
  return {
    isLive: false,
    async observe(input): Promise<VisionObserverResult> {
      const provider = 'mock-vision-observer';
      const model = 'mock-v1';
      const request = requestFor(input);
      const startedAt = Date.now();
      const normalized = observations.map((observation, index) => {
        const reasoningMode = request.reasoningMode ?? 'DIRECT';
        const observationId = `${input.inputHash.slice(0, 16)}-${request.queryId}-${reasoningMode}-${index + 1}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
        return {
          ...observation,
          observationId,
          queryId: request.queryId,
          protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
          category: observation.category ?? request.category,
          task: request.task,
          reasoningMode,
          provider,
          model,
          executionMs: 0,
          provenance: {
            evidenceFamily: 'VISION_OBSERVATION' as const,
            sourceComponent: 'lythaus-vision-observer' as const,
            provider,
            modelVersion: model,
            schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
            executionTimestamp: input.executionTimestamp ?? new Date().toISOString(),
            inputHash: input.inputHash,
            applicable: observation.applicable ? 'applicable' as const : 'not_applicable' as const,
            limitations: observation.limitations,
            task: request.task,
            reasoningMode,
            executionMs: 0,
          },
        } satisfies VisionObservation;
      });
      return successfulObserverResult(input, request, provider, model, normalized, Date.now() - startedAt);
    },
  };
}

export function recommendVisionEscalation(input: {
  observations: readonly VisionObservation[];
  reasoningMode: VisionObserverReasoningMode;
  category: VisionObservationCategory;
  contradictoryVisualSignals?: boolean;
  deterministicEvidenceConflict?: boolean;
  explicitExperiment?: boolean;
}): { recommendation: VisionEscalationRecommendation; reasons: readonly VisionEscalationReason[] } {
  if (input.reasoningMode === 'REASONED') return { recommendation: 'NONE', reasons: [] };
  const reasons = new Set<VisionEscalationReason>();
  const allowed = (VISION_OBSERVER_ROUTING_POLICY.reasonedAllowed as readonly string[]).includes(input.category);
  const uncertain = input.observations.some((observation) => observation.status === 'INDETERMINATE' || (observation.measurementConfidence !== null && observation.measurementConfidence < VISION_OBSERVER_ROUTING_POLICY.lowConfidenceThreshold));
  const escalationTrigger = uncertain || input.contradictoryVisualSignals === true || input.deterministicEvidenceConflict === true || input.explicitExperiment === true;
  if (allowed && escalationTrigger) reasons.add('RELATIONAL_VISUAL_TASK');
  if (input.observations.some((observation) => observation.status === 'INDETERMINATE')) reasons.add('PARTIAL_OCCLUSION');
  if (input.observations.some((observation) => observation.measurementConfidence !== null && observation.measurementConfidence < VISION_OBSERVER_ROUTING_POLICY.lowConfidenceThreshold)) reasons.add('LOW_OBSERVATION_CONFIDENCE');
  if (input.contradictoryVisualSignals || input.deterministicEvidenceConflict) reasons.add('CONTRADICTORY_VISUAL_SIGNALS');
  if (input.explicitExperiment) reasons.add('RELATIONAL_VISUAL_TASK');
  if (escalationTrigger && input.category === 'REFLECTION') reasons.add('AMBIGUOUS_REFLECTION');
  if (escalationTrigger && input.category === 'LIGHTING_SHADOW') reasons.add('AMBIGUOUS_LIGHTING');
  if (escalationTrigger && input.category === 'GEOMETRY_OCCLUSION') reasons.add('AMBIGUOUS_GEOMETRY');
  if (escalationTrigger && input.category === 'ANATOMY') reasons.add('AMBIGUOUS_ANATOMY');
  if (escalationTrigger && input.category === 'SCREEN_DISPLAY_RELATIONSHIP') reasons.add('SCREEN_RECAPTURE_UNCERTAINTY');
  return allowed && reasons.size > 0
    ? { recommendation: 'REASONED_VISUAL_RECHECK', reasons: [...reasons] }
    : { recommendation: 'NONE', reasons: [] };
}

export interface VisionObserverPassSummary {
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  observations: readonly VisionObservation[];
  provider: string;
  model: string;
  task: VisionObserverTask;
  reasoningMode: VisionObserverReasoningMode;
  executionMs: number;
  escalationRecommendation: VisionEscalationRecommendation;
  escalationReasons: readonly VisionEscalationReason[];
}

export interface VisionObserverComparison {
  schemaVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  sampleId: string;
  inputHash: string;
  queryId: string;
  category: VisionObservationCategory;
  protocolVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  direct: VisionObserverPassSummary;
  reasoned: VisionObserverPassSummary;
  contradictory: boolean;
}

function passSummary(result: VisionObserverResult): VisionObserverPassSummary {
  return {
    status: result.status,
    observations: result.observations,
    provider: result.provider,
    model: result.model,
    task: result.task,
    reasoningMode: result.reasoningMode,
    executionMs: result.executionMs,
    escalationRecommendation: result.escalationRecommendation,
    escalationReasons: result.escalationReasons,
  };
}

export function compareVisionObserverResults(input: { sampleId: string; inputHash: string; direct: VisionObserverResult; reasoned: VisionObserverResult }): VisionObserverComparison {
  if (input.direct.reasoningMode !== 'DIRECT' || input.reasoned.reasoningMode !== 'REASONED') throw new Error('vision_ab_reasoning_modes_invalid');
  if (input.direct.queryId !== input.reasoned.queryId || input.direct.task !== input.reasoned.task || input.direct.protocolVersion !== input.reasoned.protocolVersion) throw new Error('vision_ab_inputs_mismatch');
  const directStatuses = new Set(input.direct.observations.map((observation) => `${observation.category}:${observation.status}`));
  const reasonedStatuses = new Set(input.reasoned.observations.map((observation) => `${observation.category}:${observation.status}`));
  const contradictory = [...directStatuses].some((status) => {
    const [category, value] = status.split(':');
    const opposite = value === 'OBSERVED' ? 'NOT_OBSERVED' : value === 'NOT_OBSERVED' ? 'OBSERVED' : null;
    return opposite !== null && reasonedStatuses.has(`${category}:${opposite}`);
  });
  const category = input.direct.observations[0]?.category ?? input.reasoned.observations[0]?.category ?? 'SCENE_INVENTORY';
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    sampleId: input.sampleId,
    inputHash: input.inputHash,
    queryId: input.direct.queryId,
    category,
    protocolVersion: input.direct.protocolVersion,
    direct: passSummary(input.direct),
    reasoned: passSummary(input.reasoned),
    contradictory,
  };
}

export function assertVisionObservation(observation: VisionObservation): void {
  if (observation.protocolVersion !== VISION_OBSERVER_PROTOCOL_VERSION) throw new Error('vision_observation_protocol_invalid');
  if (!(VISION_OBSERVER_CATEGORIES as readonly string[]).includes(observation.category)) throw new Error('vision_observation_category_invalid');
  if (!(VISION_OBSERVER_TASKS as readonly string[]).includes(observation.task)) throw new Error('vision_observation_task_invalid');
  if (!(VISION_OBSERVER_REASONING_MODES as readonly string[]).includes(observation.reasoningMode)) throw new Error('vision_observation_reasoning_mode_invalid');
  if (!(VISION_OBSERVATION_STATUSES as readonly string[]).includes(observation.status)) throw new Error('vision_observation_status_invalid');
  if (observation.measurementConfidence !== null && !finite01(observation.measurementConfidence)) throw new Error('vision_observation_confidence_invalid');
  if (observation.provenance.evidenceFamily !== 'VISION_OBSERVATION' || observation.provenance.sourceComponent !== 'lythaus-vision-observer') throw new Error('vision_observation_provenance_invalid');
  if (observation.provenance.schemaVersion !== VISION_OBSERVER_PROTOCOL_VERSION || !observation.provenance.inputHash || observation.provenance.task !== observation.task || observation.provenance.reasoningMode !== observation.reasoningMode) throw new Error('vision_observation_provenance_invalid');
  for (const region of observation.regions) {
    if (region.coordinateSpace !== 'NORMALIZED' || ![region.x, region.y, region.width, region.height].every(finite01) || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) throw new Error('vision_region_invalid');
  }
}

export function createCloudflareVisionObserverRestFromEnvironment(options: {
  apiToken?: string;
  accountId?: string;
  allowNetwork?: boolean;
  maxRequests: number;
  timeoutMs?: number;
  model?: string;
}): VisionObserver & { isLive: true } {
  const transport = createCloudflareRestTransport({
    apiToken: options.apiToken,
    accountId: options.accountId,
    allowNetwork: options.allowNetwork,
    maxRequests: options.maxRequests,
    timeoutMs: options.timeoutMs,
  });
  return createCloudflareVisionObserverRest({ transport, model: options.model });
}
