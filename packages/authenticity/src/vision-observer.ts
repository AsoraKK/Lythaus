import type { Applicability } from './contracts.ts';
import { CloudflareRestError, createCloudflareRestTransport, type CloudflareRestTransport } from './cloudflare-rest.ts';
import { CLOUDFLARE_VISION_OBSERVER_MODEL } from './research-config.ts';
import { assertResearchImageInput, bytesToDataUrl, type ResearchImageMime } from './research-image.ts';

export const VISION_OBSERVER_PROTOCOL_VERSION = 'lythaus-vision-observer-protocol-v1' as const;
export const VISION_OBSERVER_PROMPT_VERSION = 'lythaus-vision-observer-prompt-v2' as const;
export const VISION_OBSERVER_ROUTING_POLICY_VERSION = 'lythaus-vision-observer-routing-policy-v1' as const;
export const VISION_OBSERVER_MAX_OBSERVATIONS = 8 as const;
export const VISION_OBSERVER_QUERY_GENERATION_CONFIG = {
  temperature: 0,
  maxTokens: 1200,
  stream: false,
} as const;

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

export const VISION_OBSERVER_REGION_POLICIES = ['CANONICAL', 'FORBID'] as const;
export type VisionObserverRegionPolicy = (typeof VISION_OBSERVER_REGION_POLICIES)[number];

export const VISION_OBSERVATION_STATUSES = ['OBSERVED', 'NOT_OBSERVED', 'INDETERMINATE', 'NOT_APPLICABLE'] as const;
export type VisionObservationStatus = (typeof VISION_OBSERVATION_STATUSES)[number];

const VISION_OBSERVER_EXAMPLE_TEXT: Readonly<Record<VisionObservationCategory, string>> = {
  SCENE_INVENTORY: 'A uniform light-grey field is visible.',
  OBJECT_LOCALISATION: 'A visible object is present in the requested scene.',
  TEXT: 'A text region is visible.',
  GEOMETRY_OCCLUSION: 'Two visible shapes overlap in the requested region.',
  LIGHTING_SHADOW: 'A visible object casts a shadow.',
  REFLECTION: 'A reflective surface is visible.',
  REPETITION: 'A repeated visual pattern is visible.',
  ANATOMY: 'A visible anatomical feature is present.',
  SCREEN_DISPLAY_RELATIONSHIP: 'A display-like rectangular surface is visible.',
  SUSPICIOUS_REGION: 'A region warrants further visual inspection.',
};

export function buildVisionObserverPrompt(category: VisionObservationCategory, regionPolicy: VisionObserverRegionPolicy = 'CANONICAL'): string {
  const example = JSON.stringify({
    observations: [{
      category,
      applicable: true,
      status: 'OBSERVED',
      observation: VISION_OBSERVER_EXAMPLE_TEXT[category],
      regions: [],
      measurementConfidence: null,
      limitations: [],
    }],
  }, null, 2);
  return [
    'ROLE',
    `You are the Lythaus Vision Observer. Protocol: ${VISION_OBSERVER_PROTOCOL_VERSION}. Prompt: ${VISION_OBSERVER_PROMPT_VERSION}.`,
    'Collect visual observations only. You are not an authenticity or origin classifier. Do not determine whether the image is AI-generated.',
    'Never emit an AI-generated label, human-authored label, synthetic probability, camera probability, authenticity label, or image-level origin verdict.',
    'Use visible pixels only. Do not use metadata unless it is explicitly supplied in the task question.',
    'Do not invent anomalies. The absence of an anomaly is valid. Uncertainty, partial visibility, and NOT_APPLICABLE are valid outcomes.',
    'Unusual art, screenshots, CGI, game images, digital art, and composites are legitimate visual content; do not call them synthetic by default.',
    'Describe text, geometry, lighting, reflections, repetition, anatomy, and displays as observations with limitations; do not call a visual irregularity an AI artifact.',
    '',
    'TASK',
    `Requested category: ${category}. Every observation.category MUST exactly equal ${category}.`,
    `Region policy: ${regionPolicy}.`,
    'Answer the supplied visual question for this category and no other category.',
    '',
    'OUTPUT CONTRACT',
    'Return JSON only. Do not use Markdown. Do not return prose before or after the JSON.',
    'The top-level object must contain an observations array.',
    `Return between 1 and ${VISION_OBSERVER_MAX_OBSERVATIONS} concise observations. Do not return an unbounded list.`,
    `category MUST exactly equal ${category}.`,
    'applicable MUST be a boolean.',
    'status MUST be exactly one of: OBSERVED, NOT_OBSERVED, INDETERMINATE, NOT_APPLICABLE.',
    'If status is NOT_APPLICABLE, applicable MUST be false.',
    'For OBSERVED, NOT_OBSERVED, and INDETERMINATE, applicable MUST be true.',
    'OBSERVED means the requested visual feature or relationship can be positively described from visible evidence.',
    'NOT_OBSERVED means the category applies but the queried feature or condition is not visibly present.',
    'INDETERMINATE means the category applies but visibility or evidence is insufficient for a reliable observation.',
    'NOT_APPLICABLE means the requested category genuinely does not apply to the visible scene.',
    'Do not create other status labels or synonyms such as PRESENT, VISIBLE, UNKNOWN, YES, NO, or DETECTED.',
    'observation MUST be a short factual visual observation.',
    ...(regionPolicy === 'FORBID'
      ? [
        'Do not localize the requested objects or relationship.',
        'Do not return bounding boxes, points, positions, coordinates, or region descriptions.',
        'Localization is outside this task. regions MUST be exactly [] even if the provider has localization output.',
      ]
      : ['regions MUST be an array; region coordinates must use coordinateSpace NORMALIZED and values from 0 to 1.']),
    'measurementConfidence MUST be null or a number from 0 to 1 and refers only to confidence in the observation, never origin confidence.',
    'limitations MUST be an array of strings.',
    '',
    'VALID FORMAT EXAMPLE',
    'The example is format guidance only. Describe the actual image; do not copy the example visual claim.',
    example,
  ].join('\n');
}

export const VISION_OBSERVER_PROMPT = buildVisionObserverPrompt('SCENE_INVENTORY');

export const VISION_ESCALATION_RECOMMENDATIONS = ['NONE', 'REASONED_VISUAL_RECHECK'] as const;
export type VisionEscalationRecommendation = (typeof VISION_ESCALATION_RECOMMENDATIONS)[number];

export const VISION_ESCALATION_REASONS = [
  'OBSERVATION_INDETERMINATE',
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
  regionPolicy?: VisionObserverRegionPolicy;
  sourceObservationId?: string;
  reasonCode?: VisionEscalationReason;
  targetRegion?: VisionRegion | null;
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
  occlusion?: 'NONE' | 'PARTIAL' | 'UNKNOWN';
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

export type VisionObserverErrorCategory = 'EMPTY_RESPONSE' | 'INVALID_INPUT' | 'TIMEOUT' | 'NETWORK_FAILURE' | 'MALFORMED_RESPONSE' | 'UNEXPECTED_SCHEMA' | 'AUTHENTICATION_FAILURE' | 'RATE_LIMITED' | 'SERVER_FAILURE' | 'HTTP_FAILURE' | 'PROVIDER_FAILURE';

export const VISION_PROVIDER_RESULT_TYPES = ['OBJECT', 'STRING', 'ARRAY', 'NULL', 'OTHER'] as const;
export type VisionProviderResultType = (typeof VISION_PROVIDER_RESULT_TYPES)[number];

export const VISION_PARSED_TOP_LEVEL_TYPES = ['OBJECT', 'ARRAY', 'OTHER'] as const;
export type VisionParsedTopLevelType = (typeof VISION_PARSED_TOP_LEVEL_TYPES)[number] | null;

export const VISION_NORMALIZATION_FAILURE_CODES = [
  'ANSWER_MISSING',
  'ANSWER_NOT_STRING',
  'ANSWER_NOT_JSON',
  'PARSED_NOT_OBJECT',
  'OBSERVATIONS_MISSING',
  'OBSERVATIONS_NOT_ARRAY',
  'OBSERVATIONS_EMPTY',
  'OBSERVATIONS_TOO_MANY',
  'OBSERVATION_NOT_OBJECT',
  'CATEGORY_MISSING',
  'CATEGORY_MISMATCH',
  'APPLICABLE_MISSING',
  'APPLICABLE_INVALID',
  'STATUS_MISSING',
  'STATUS_INVALID',
  'APPLICABILITY_STATUS_MISMATCH',
  'OBSERVATION_TEXT_MISSING',
  'OCCLUSION_INVALID',
  'REGIONS_INVALID',
  'CONFIDENCE_INVALID',
  'LIMITATIONS_INVALID',
  'UNKNOWN_RESPONSE_SHAPE',
] as const;
export type VisionNormalizationFailureCode = (typeof VISION_NORMALIZATION_FAILURE_CODES)[number];

export interface VisionResponseDiagnostics {
  transportSucceeded: boolean;
  providerResultType: VisionProviderResultType;
  providerTopLevelKeys: readonly string[];
  answerPresent: boolean;
  answerType: string | null;
  answerLength: number | null;
  reasoningFieldPresent: boolean;
  reasoningFieldType: string | null;
  answerJsonParseable: boolean | null;
  parsedTopLevelType: VisionParsedTopLevelType;
  parsedTopLevelKeys: readonly string[];
  observationsPresent: boolean | null;
  observationCount: number | null;
  normalizationFailureCode: VisionNormalizationFailureCode | null;
  invalidStatusToken?: string;
  regionDiagnostics?: VisionRegionDiagnostics;
}

export interface VisionRegionDiagnostics {
  regionFieldPresent: boolean;
  regionCount: number | null;
  firstRegionType: VisionProviderResultType | null;
  firstRegionKeys: readonly string[];
  coordinateSpacePresent: boolean;
  coordinateFieldNames: readonly string[];
  coordinateValueTypes: Readonly<Record<string, string>>;
  normalizationFailureReason: string;
  regionPolicy?: VisionObserverRegionPolicy;
  providerRegionOutputPresent?: boolean;
  providerRegionsDiscarded?: boolean;
}

export interface VisionObserverTransportDiagnostics {
  transportErrorCategory?: string;
  httpStatus?: number | null;
  providerErrorCode?: number | string | null;
  providerErrorMessageCode?: string | null;
}

export interface VisionObserverResult {
  schemaVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  protocolVersion: typeof VISION_OBSERVER_PROTOCOL_VERSION;
  promptVersion: typeof VISION_OBSERVER_PROMPT_VERSION;
  prompt: string;
  provider: string;
  model: string;
  generationConfig: typeof VISION_OBSERVER_QUERY_GENERATION_CONFIG;
  queryId: string;
  task: VisionObserverTask;
  reasoningMode: VisionObserverReasoningMode;
  regionPolicy: VisionObserverRegionPolicy;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  observations: readonly VisionObservation[];
  escalationRecommendation: VisionEscalationRecommendation;
  escalationReasons: readonly VisionEscalationReason[];
  executionMs: number;
  errorCategory?: VisionObserverErrorCategory;
  transportErrorCategory?: string;
  httpStatus?: number | null;
  providerErrorCode?: number | string | null;
  providerErrorMessageCode?: string | null;
  responseDiagnostics?: VisionResponseDiagnostics;
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

export const VISION_RECHECK_TEMPLATE_VERSION = 'lythaus-vision-recheck-templates-v1' as const;

const GENERIC_RECHECK_REASONS: readonly VisionEscalationReason[] = [
  'OBSERVATION_INDETERMINATE',
  'LOW_OBSERVATION_CONFIDENCE',
  'RELATIONAL_VISUAL_TASK',
  'CONTRADICTORY_VISUAL_SIGNALS',
];

const RECHECK_REASON_CODES: Readonly<Record<Extract<VisionObservationCategory, 'GEOMETRY_OCCLUSION' | 'LIGHTING_SHADOW' | 'REFLECTION' | 'ANATOMY' | 'SCREEN_DISPLAY_RELATIONSHIP'>, readonly VisionEscalationReason[]>> = {
  GEOMETRY_OCCLUSION: [...GENERIC_RECHECK_REASONS, 'PARTIAL_OCCLUSION', 'AMBIGUOUS_GEOMETRY'],
  LIGHTING_SHADOW: [...GENERIC_RECHECK_REASONS, 'AMBIGUOUS_LIGHTING'],
  REFLECTION: [...GENERIC_RECHECK_REASONS, 'AMBIGUOUS_REFLECTION'],
  ANATOMY: [...GENERIC_RECHECK_REASONS, 'PARTIAL_OCCLUSION', 'AMBIGUOUS_ANATOMY'],
  SCREEN_DISPLAY_RELATIONSHIP: [...GENERIC_RECHECK_REASONS, 'SCREEN_RECAPTURE_UNCERTAINTY'],
};

const RECHECK_TEMPLATES: Readonly<Record<keyof typeof RECHECK_REASON_CODES, string>> = {
  GEOMETRY_OCCLUSION: 'Inspect the referenced object intersection, occlusion, and perspective relationship. Report only visible geometry, contradictions, or indeterminate visibility. Do not infer image origin.',
  LIGHTING_SHADOW: 'Inspect apparent major light directions and shadow geometry for visible consistency. Account for complex multi-light scenes and report uncertainty. Do not infer image origin.',
  REFLECTION: 'Inspect reflection consistency for the referenced surface or region. Report expected reflected objects, gross inconsistencies, or indeterminate visibility. Do not infer image origin.',
  ANATOMY: 'Inspect only visible anatomy in the referenced region while explicitly considering occlusion and partial visibility. Report observations or indeterminate visibility. Do not infer image origin.',
  SCREEN_DISPLAY_RELATIONSHIP: 'Inspect whether the referenced region is consistent with a physical display or screen recapture relationship. Report visible display boundaries, moire or recapture cues, or uncertainty. Do not infer image origin.',
};

export function isReasonedRecheckReasonAllowed(category: VisionObservationCategory, reasonCode: VisionEscalationReason): boolean {
  if (!(VISION_OBSERVER_ROUTING_POLICY.reasonedAllowed as readonly string[]).includes(category)) return false;
  const allowed = RECHECK_REASON_CODES[category as keyof typeof RECHECK_REASON_CODES];
  return Boolean(allowed?.includes(reasonCode));
}

export function buildReasonedVisualRecheckRequest(input: {
  observations: readonly VisionObservation[];
  observationId: string;
  category: VisionObservationCategory;
  reasonCode: VisionEscalationReason;
  targetRegion?: VisionRegion | null;
  regionPolicy?: VisionObserverRegionPolicy;
}): VisionObserverRequest {
  const observation = input.observations.find((candidate) => candidate.observationId === input.observationId);
  if (!observation) throw new Error('vision_recheck_observation_unknown');
  if (observation.category !== input.category) throw new Error('vision_recheck_category_mismatch');
  if (!isReasonedRecheckReasonAllowed(input.category, input.reasonCode)) throw new Error('vision_recheck_request_not_allowed');
  const targetRegion = input.targetRegion === undefined ? observation.regions[0] ?? null : input.targetRegion;
  if (targetRegion !== null && normalizeVisionRegion(targetRegion) === null) throw new Error('vision_recheck_target_region_invalid');
  const safeObservationId = input.observationId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const regionText = targetRegion === null ? 'Target region: none.' : `Target region: ${JSON.stringify(targetRegion)}.`;
  return {
    queryId: `RECHECK_${safeObservationId}`.slice(0, 120),
    category: input.category,
    task: 'query',
    question: `${RECHECK_TEMPLATES[input.category as keyof typeof RECHECK_TEMPLATES]}\nReferenced observation ID: ${input.observationId}.\n${regionText}`,
    reasoningMode: 'REASONED',
    regionPolicy: input.regionPolicy ?? 'CANONICAL',
    sourceObservationId: input.observationId,
    reasonCode: input.reasonCode,
    targetRegion,
  };
}

export function buildObserverReasonedEscalationRequest(result: VisionObserverResult): VisionObserverRequest | null {
  if (result.status !== 'SUCCESS' || result.reasoningMode !== 'DIRECT' || result.escalationRecommendation !== 'REASONED_VISUAL_RECHECK') return null;
  const observation = result.observations.find((candidate) => (VISION_OBSERVER_ROUTING_POLICY.reasonedAllowed as readonly string[]).includes(candidate.category));
  if (!observation) return null;
  const reasonCode = result.escalationReasons.find((candidate) => isReasonedRecheckReasonAllowed(observation.category, candidate));
  if (!reasonCode) return null;
  return buildReasonedVisualRecheckRequest({ observations: result.observations, observationId: observation.observationId, category: observation.category, reasonCode, targetRegion: observation.regions[0] ?? null, regionPolicy: result.regionPolicy });
}

function defaultRequest(): VisionObserverRequest {
  return { queryId: 'SCENE_INVENTORY_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Inventory visible scene elements and report only structured visual observations.', reasoningMode: 'DIRECT', regionPolicy: 'CANONICAL' };
}

function requestFor(input: VisionObserverInput): VisionObserverRequest {
  const request = input.request ?? defaultRequest();
  const reasoningMode = request.reasoningMode ?? 'DIRECT';
  const regionPolicy = request.regionPolicy ?? 'CANONICAL';
  if (!request.queryId.trim() || !request.category || !request.task) throw new Error('vision_observer_request_invalid');
  if (!(VISION_OBSERVER_CATEGORIES as readonly string[]).includes(request.category)) throw new Error('vision_observer_category_invalid');
  if (!(VISION_OBSERVER_TASKS as readonly string[]).includes(request.task)) throw new Error('vision_observer_task_invalid');
  if (!(VISION_OBSERVER_REASONING_MODES as readonly string[]).includes(reasoningMode)) throw new Error('vision_observer_reasoning_mode_invalid');
  if (!(VISION_OBSERVER_REGION_POLICIES as readonly string[]).includes(regionPolicy)) throw new Error('vision_observer_region_policy_invalid');
  if (reasoningMode === 'REASONED' && request.task !== 'query') throw new Error('vision_reasoned_task_must_be_query');
  if (request.targetRegion !== undefined && request.targetRegion !== null && normalizeVisionRegion(request.targetRegion) === null) throw new Error('vision_observer_target_region_invalid');
  return { ...request, queryId: request.queryId.trim().slice(0, 120), reasoningMode, regionPolicy };
}

function finite01(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface VisionObserverProviderResponse {
  value: unknown;
  httpStatus: number | null;
  transportSucceeded: boolean;
}

interface VisionTaskNormalizationResult {
  observations: unknown[] | null;
  diagnostics: VisionResponseDiagnostics;
}

export type VisionObserverPayloadBuilder = (input: VisionObserverInput, request: VisionObserverRequest, image: string) => Record<string, unknown>;

function runtimeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function safeProviderKeys(value: Record<string, unknown>): readonly string[] {
  return Object.keys(value)
    .filter((key) => /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key))
    .sort()
    .slice(0, 32);
}

function providerResultType(value: unknown): VisionProviderResultType {
  if (value === null) return 'NULL';
  if (Array.isArray(value)) return 'ARRAY';
  if (typeof value === 'object') return 'OBJECT';
  if (typeof value === 'string') return 'STRING';
  return 'OTHER';
}

const SAFE_REGION_DIAGNOSTIC_KEYS = new Set([
  'coordinateSpace',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'x_min',
  'y_min',
  'x_max',
  'y_max',
  'w',
  'h',
]);

function regionDiagnosticsFor(rawRegions: unknown, normalizationFailureReason: string, regionPolicy: VisionObserverRegionPolicy = 'CANONICAL'): VisionRegionDiagnostics {
  const regionFieldPresent = rawRegions !== undefined;
  const regionCount = Array.isArray(rawRegions) ? rawRegions.length : null;
  const firstRegion = Array.isArray(rawRegions) ? rawRegions[0] : undefined;
  const firstRegionObject = isRecord(firstRegion);
  const firstRegionKeys = firstRegionObject ? safeProviderKeys(firstRegion) : [];
  const coordinateFieldNames = firstRegionKeys.filter((key) => SAFE_REGION_DIAGNOSTIC_KEYS.has(key));
  const coordinateValueTypes = firstRegionObject
    ? Object.fromEntries(coordinateFieldNames.map((key) => [key, runtimeType(firstRegion[key])]))
    : {};
  const providerRegionOutputPresent = regionFieldPresent && (Array.isArray(rawRegions) ? rawRegions.length > 0 : true);
  return {
    regionFieldPresent,
    regionCount,
    firstRegionType: firstRegion === undefined ? null : providerResultType(firstRegion),
    firstRegionKeys,
    coordinateSpacePresent: firstRegionObject && Object.prototype.hasOwnProperty.call(firstRegion, 'coordinateSpace'),
    coordinateFieldNames,
    coordinateValueTypes,
    normalizationFailureReason,
    ...(regionPolicy === 'FORBID' ? {
      regionPolicy,
      providerRegionOutputPresent,
      providerRegionsDiscarded: providerRegionOutputPresent,
    } : {}),
  };
}

function regionNormalizationFailureReason(value: unknown): string {
  if (!isRecord(value)) return 'REGION_NOT_OBJECT';
  if (value.coordinateSpace !== 'NORMALIZED') return 'COORDINATE_SPACE_MISSING_OR_INVALID';
  if (![value.x, value.y, value.width, value.height].every((item) => typeof item === 'number' && Number.isFinite(item))) return 'COORDINATE_VALUE_INVALID';
  if ((value.width as number) <= 0 || (value.height as number) <= 0) return 'REGION_DIMENSION_INVALID';
  if ((value.x as number) + (value.width as number) > 1 || (value.y as number) + (value.height as number) > 1) return 'REGION_OUT_OF_BOUNDS';
  return 'REGION_INVALID';
}

function responseDiagnosticsFor(value: unknown, transportSucceeded: boolean): VisionResponseDiagnostics {
  const object = isRecord(value);
  const answerPresent = object && Object.prototype.hasOwnProperty.call(value, 'answer');
  const reasoningFieldPresent = object && Object.prototype.hasOwnProperty.call(value, 'reasoning');
  const answer = answerPresent ? value.answer : undefined;
  return {
    transportSucceeded,
    providerResultType: providerResultType(value),
    providerTopLevelKeys: object ? safeProviderKeys(value) : [],
    answerPresent,
    answerType: answerPresent ? runtimeType(answer) : null,
    answerLength: typeof answer === 'string' ? answer.length : null,
    reasoningFieldPresent,
    reasoningFieldType: reasoningFieldPresent ? runtimeType(value.reasoning) : null,
    answerJsonParseable: null,
    parsedTopLevelType: null,
    parsedTopLevelKeys: [],
    observationsPresent: null,
    observationCount: null,
    normalizationFailureCode: null,
  };
}

function withParsedDiagnostics(diagnostics: VisionResponseDiagnostics, parsed: unknown): VisionResponseDiagnostics {
  const parsedTopLevelType: VisionParsedTopLevelType = isRecord(parsed) ? 'OBJECT' : Array.isArray(parsed) ? 'ARRAY' : 'OTHER';
  const parsedTopLevelKeys = isRecord(parsed) ? safeProviderKeys(parsed) : [];
  const observationsPresent = isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'observations');
  const observationCount = observationsPresent && Array.isArray(parsed.observations) ? parsed.observations.length : null;
  return {
    ...diagnostics,
    answerJsonParseable: true,
    parsedTopLevelType,
    parsedTopLevelKeys,
    observationsPresent,
    observationCount,
  };
}

function withObservationDiagnostics(diagnostics: VisionResponseDiagnostics, observations: unknown[]): VisionResponseDiagnostics {
  return {
    ...diagnostics,
    observationsPresent: true,
    observationCount: observations.length,
    normalizationFailureCode: observations.length === 0 ? 'OBSERVATIONS_EMPTY' : null,
  };
}

function withNormalizationFailure(diagnostics: VisionResponseDiagnostics, normalizationFailureCode: VisionNormalizationFailureCode): VisionResponseDiagnostics {
  return { ...diagnostics, normalizationFailureCode };
}

function normalizeObservationList(observations: unknown[], diagnostics: VisionResponseDiagnostics): VisionTaskNormalizationResult {
  const withCount = withObservationDiagnostics(diagnostics, observations);
  if (observations.length === 0) return { observations: null, diagnostics: withCount };
  if (observations.length > VISION_OBSERVER_MAX_OBSERVATIONS) {
    return { observations: null, diagnostics: withNormalizationFailure(withCount, 'OBSERVATIONS_TOO_MANY') };
  }
  return { observations, diagnostics: withCount };
}

function textFieldFromModelResponse(value: unknown): { key: string; value: string } | null {
  if (typeof value === 'string') return { key: 'value', value };
  if (!isRecord(value)) return null;
  for (const key of ['response', 'output_text', 'answer', 'caption', 'description', 'text']) {
    if (typeof value[key] === 'string') return { key, value: value[key] as string };
  }
  if (isRecord(value.result)) return textFieldFromModelResponse(value.result);
  if (typeof value.result === 'string') return { key: 'result', value: value.result };
  return null;
}

function tryParseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!trimmed) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

export function normalizeVisionRegion(value: unknown): VisionRegion | null {
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
  return normalizeVisionRegion({ coordinateSpace: 'NORMALIZED', x, y, width, height });
}

function normalizeTaskOutput(value: unknown, request: VisionObserverRequest, transportSucceeded: boolean): VisionTaskNormalizationResult {
  let diagnostics = responseDiagnosticsFor(value, transportSucceeded);
  if (isRecord(value) && Array.isArray(value.observations)) {
    return normalizeObservationList(value.observations, diagnostics);
  }
  if (isRecord(value) && isRecord(value.result)) return normalizeTaskOutput(value.result, request, transportSucceeded);
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
      diagnostics,
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
      diagnostics,
    };
  }
  const textField = textFieldFromModelResponse(value);
  if (request.task === 'query') {
    const hasAnswer = isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'answer');
    const hasLegacyResponse = isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'response');
    if (!hasAnswer && !hasLegacyResponse) {
      return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'ANSWER_MISSING') };
    }
    const answer = hasAnswer ? value.answer : value.response;
    if (typeof answer !== 'string') {
      return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'ANSWER_NOT_STRING') };
    }
    if (!answer.trim()) {
      return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'ANSWER_MISSING') };
    }
    const parsedAnswer = tryParseJsonText(answer);
    if (!parsedAnswer.ok) {
      return { observations: null, diagnostics: withNormalizationFailure({ ...diagnostics, answerJsonParseable: false }, 'ANSWER_NOT_JSON') };
    }
    diagnostics = withParsedDiagnostics(diagnostics, parsedAnswer.value);
    if (!isRecord(parsedAnswer.value)) {
      return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'PARSED_NOT_OBJECT') };
    }
    if (!Object.prototype.hasOwnProperty.call(parsedAnswer.value, 'observations')) {
      return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'OBSERVATIONS_MISSING') };
    }
    if (!Array.isArray(parsedAnswer.value.observations)) {
      return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'OBSERVATIONS_NOT_ARRAY') };
    }
    return normalizeObservationList(parsedAnswer.value.observations, diagnostics);
  }
  if (textField) {
    const parsed = tryParseJsonText(textField.value);
    if (parsed.ok && isRecord(parsed.value) && Array.isArray(parsed.value.observations)) {
      return normalizeObservationList(parsed.value.observations, withParsedDiagnostics(diagnostics, parsed.value));
    }
    if (request.task !== 'caption') return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'UNKNOWN_RESPONSE_SHAPE') };
    return {
      observations: [{
        category: request.category,
        applicable: true,
        status: 'OBSERVED',
        observation: textField.value,
        regions: [],
        measurementConfidence: null,
        limitations: ['The provider returned free-form visual text; no origin conclusion was accepted.'],
        }],
      diagnostics,
    };
  }
  return { observations: null, diagnostics: withNormalizationFailure(diagnostics, 'UNKNOWN_RESPONSE_SHAPE') };
}

interface NormalizedObservationResult {
  observation: VisionObservation | null;
  failureCode: VisionNormalizationFailureCode | null;
  invalidStatusToken?: string;
  regionDiagnostics?: VisionRegionDiagnostics;
}

function safeInvalidStatusToken(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Z_]{1,32}$/.test(value) ? value : undefined;
}

function normalizeObservationDetailed(value: unknown, index: number, input: VisionObserverInput, request: VisionObserverRequest, provider: string, model: string, executionMs: number): NormalizedObservationResult {
  if (!isRecord(value)) return { observation: null, failureCode: 'OBSERVATION_NOT_OBJECT' };
  if (!Object.prototype.hasOwnProperty.call(value, 'category')) return { observation: null, failureCode: 'CATEGORY_MISSING' };
  if (value.category !== request.category) return { observation: null, failureCode: 'CATEGORY_MISMATCH' };
  if (!Object.prototype.hasOwnProperty.call(value, 'applicable')) return { observation: null, failureCode: 'APPLICABLE_MISSING' };
  if (typeof value.applicable !== 'boolean') return { observation: null, failureCode: 'APPLICABLE_INVALID' };
  if (!Object.prototype.hasOwnProperty.call(value, 'status')) return { observation: null, failureCode: 'STATUS_MISSING' };
  if (!(VISION_OBSERVATION_STATUSES as readonly string[]).includes(String(value.status))) return { observation: null, failureCode: 'STATUS_INVALID', invalidStatusToken: safeInvalidStatusToken(value.status) };
  if (value.applicable === false && value.status !== 'NOT_APPLICABLE') return { observation: null, failureCode: 'APPLICABILITY_STATUS_MISMATCH' };
  if (value.status === 'NOT_APPLICABLE' && value.applicable !== false) return { observation: null, failureCode: 'APPLICABILITY_STATUS_MISMATCH' };
  if (typeof value.observation !== 'string' || !value.observation.trim()) return { observation: null, failureCode: 'OBSERVATION_TEXT_MISSING' };
  if (value.occlusion !== undefined && !['NONE', 'PARTIAL', 'UNKNOWN'].includes(String(value.occlusion))) return { observation: null, failureCode: 'OCCLUSION_INVALID' };
  const confidence = value.measurementConfidence === null || value.measurementConfidence === undefined
    ? null
    : finite01(value.measurementConfidence) ? value.measurementConfidence : null;
  if (value.measurementConfidence !== null && value.measurementConfidence !== undefined && confidence === null) return { observation: null, failureCode: 'CONFIDENCE_INVALID' };
  const rawRegions = Object.prototype.hasOwnProperty.call(value, 'regions') ? value.regions : undefined;
  let regions: readonly VisionRegion[];
  let regionDiagnostics: VisionRegionDiagnostics | undefined;
  if (request.regionPolicy === 'FORBID') {
    if (rawRegions !== undefined) regionDiagnostics = regionDiagnosticsFor(rawRegions, 'PROVIDER_REGIONS_DISCARDED', 'FORBID');
    regions = [];
  } else {
    const canonicalRegions = rawRegions === undefined ? [] : rawRegions;
    if (!Array.isArray(canonicalRegions)) return { observation: null, failureCode: 'REGIONS_INVALID', regionDiagnostics: regionDiagnosticsFor(canonicalRegions, 'REGIONS_NOT_ARRAY') };
    const normalizedRegions = canonicalRegions.map(normalizeVisionRegion);
    const invalidRegionIndex = normalizedRegions.findIndex((region) => region === null);
    if (invalidRegionIndex >= 0) return { observation: null, failureCode: 'REGIONS_INVALID', regionDiagnostics: regionDiagnosticsFor(canonicalRegions, regionNormalizationFailureReason(canonicalRegions[invalidRegionIndex])) };
    regions = normalizedRegions as VisionRegion[];
  }
  const limitations = value.limitations === undefined ? [] : value.limitations;
  if (!Array.isArray(limitations) || !limitations.every((item) => typeof item === 'string')) return { observation: null, failureCode: 'LIMITATIONS_INVALID' };
  const reasoningMode = request.reasoningMode ?? 'DIRECT';
  const occlusion = value.occlusion === undefined ? undefined : value.occlusion as 'NONE' | 'PARTIAL' | 'UNKNOWN';
  const safeLimitations = limitations.map((item) => item.slice(0, 300)).slice(0, 12);
  const observationId = `${input.inputHash.slice(0, 16)}-${request.queryId}-${reasoningMode}-${index + 1}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
  return {
    observation: {
      observationId,
      queryId: request.queryId,
      protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
      category: value.category as VisionObservationCategory,
      task: request.task,
      reasoningMode,
      applicable: value.applicable,
      status: value.status as VisionObservationStatus,
      ...(occlusion ? { occlusion } : {}),
      observation: value.observation.slice(0, 1200),
      regions,
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
    },
    failureCode: null,
    ...(regionDiagnostics ? { regionDiagnostics } : {}),
  };
}

function normalizeObservation(value: unknown, index: number, input: VisionObserverInput, request: VisionObserverRequest, provider: string, model: string, executionMs: number): VisionObservation | null {
  return normalizeObservationDetailed(value, index, input, request, provider, model, executionMs).observation;
}

function successfulObserverResult(input: VisionObserverInput, request: VisionObserverRequest, provider: string, model: string, observations: readonly VisionObservation[], executionMs: number, responseDiagnostics?: VisionResponseDiagnostics, httpStatus?: number | null): VisionObserverResult {
  const decision = recommendVisionEscalation({ observations, reasoningMode: request.reasoningMode ?? 'DIRECT', category: request.category });
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    promptVersion: VISION_OBSERVER_PROMPT_VERSION,
    prompt: buildVisionObserverPrompt(request.category, request.regionPolicy),
    provider,
    model,
    generationConfig: VISION_OBSERVER_QUERY_GENERATION_CONFIG,
    queryId: request.queryId,
    task: request.task,
    reasoningMode: request.reasoningMode ?? 'DIRECT',
    regionPolicy: request.regionPolicy ?? 'CANONICAL',
    status: 'SUCCESS',
    observations,
    escalationRecommendation: decision.recommendation,
    escalationReasons: decision.reasons,
    executionMs,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(responseDiagnostics ? { responseDiagnostics } : {}),
  };
}

function failedObserverResult(request: VisionObserverRequest, provider: string, model: string, errorCategory: VisionObserverErrorCategory, executionMs: number, diagnostics: VisionObserverTransportDiagnostics = {}, responseDiagnostics?: VisionResponseDiagnostics): VisionObserverResult {
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    promptVersion: VISION_OBSERVER_PROMPT_VERSION,
    prompt: buildVisionObserverPrompt(request.category, request.regionPolicy),
    provider,
    model,
    generationConfig: VISION_OBSERVER_QUERY_GENERATION_CONFIG,
    queryId: request.queryId,
    task: request.task,
    reasoningMode: request.reasoningMode ?? 'DIRECT',
    regionPolicy: request.regionPolicy ?? 'CANONICAL',
    status: 'PROVIDER_FAILURE',
    observations: [],
    escalationRecommendation: 'NONE',
    escalationReasons: [],
    executionMs,
    errorCategory,
    ...diagnostics,
    ...(responseDiagnostics ? { responseDiagnostics } : {}),
  };
}

function buildMoondreamPayload(input: VisionObserverInput, request: VisionObserverRequest, image: string): Record<string, unknown> {
  if (request.task === 'query') {
    return {
      task: 'query',
      image,
      question: `${buildVisionObserverPrompt(request.category, request.regionPolicy)}\n\nTASK QUESTION: ${request.question?.trim() || 'Report only applicable visual observations for this category.'}${request.targetRegion ? `\nTARGET REGION: ${JSON.stringify(request.targetRegion)}` : ''}`,
      reasoning: request.reasoningMode === 'REASONED',
      temperature: VISION_OBSERVER_QUERY_GENERATION_CONFIG.temperature,
      max_tokens: VISION_OBSERVER_QUERY_GENERATION_CONFIG.maxTokens,
      stream: VISION_OBSERVER_QUERY_GENERATION_CONFIG.stream,
    };
  }
  if (request.task === 'caption') return { task: 'caption', image, caption_length: 'normal', stream: false };
  return { task: request.task, image, target: request.target?.trim() || request.question?.trim() || 'object', max_objects: 20, stream: false };
}

function errorCategoryFrom(error: unknown): VisionObserverErrorCategory {
  const message = error instanceof Error ? error.message : '';
  const category = error instanceof CloudflareRestError ? error.category : null;
  if (message === 'research_image_empty' || message === 'research_image_mime_invalid' || message === 'research_image_size_limit_exceeded' || message === 'vision_observer_request_invalid' || message === 'vision_observer_category_invalid' || message === 'vision_observer_task_invalid' || message === 'vision_observer_reasoning_mode_invalid' || message === 'vision_observer_region_policy_invalid' || message === 'vision_reasoned_task_must_be_query' || message === 'vision_observer_target_region_invalid') return 'INVALID_INPUT';
  if (message === 'observer_timeout' || category === 'TIMEOUT') return 'TIMEOUT';
  if (category === 'HTTP_AUTHENTICATION_FAILURE') return 'AUTHENTICATION_FAILURE';
  if (category === 'HTTP_RATE_LIMITED') return 'RATE_LIMITED';
  if (category === 'HTTP_SERVER_FAILURE') return 'SERVER_FAILURE';
  if (category === 'HTTP_FAILURE') return 'HTTP_FAILURE';
  if (category === 'PROVIDER_FAILURE') return 'PROVIDER_FAILURE';
  if (category === 'MALFORMED_RESPONSE') return 'UNEXPECTED_SCHEMA';
  return 'NETWORK_FAILURE';
}

function errorCategoryFromNormalizationFailure(code: VisionNormalizationFailureCode | null): VisionObserverErrorCategory {
  if (code === null) return 'MALFORMED_RESPONSE';
  if (['ANSWER_MISSING', 'ANSWER_NOT_STRING', 'ANSWER_NOT_JSON', 'PARSED_NOT_OBJECT', 'OBSERVATIONS_MISSING', 'OBSERVATIONS_NOT_ARRAY', 'OBSERVATIONS_EMPTY', 'UNKNOWN_RESPONSE_SHAPE'].includes(code)) return 'UNEXPECTED_SCHEMA';
  return 'MALFORMED_RESPONSE';
}

function transportDiagnosticsFrom(error: unknown): VisionObserverTransportDiagnostics {
  if (!(error instanceof CloudflareRestError)) return {};
  return {
    transportErrorCategory: error.category,
    httpStatus: error.httpStatus,
    providerErrorCode: error.providerErrorCode,
    providerErrorMessageCode: error.providerErrorMessageCode,
  };
}

async function invokeWithTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
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
  payloadBuilder?: VisionObserverPayloadBuilder;
  run: (model: string, payload: Record<string, unknown>, request: VisionObserverRequest) => Promise<VisionObserverProviderResponse>;
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
        const payload = options.payloadBuilder?.(input, request, image) ?? buildMoondreamPayload(input, request, image);
        const providerResponse = await invokeWithTimeout(() => options.run(options.model, payload, request), options.timeoutMs ?? 30_000);
        const normalized = normalizeTaskOutput(providerResponse.value, request, providerResponse.transportSucceeded);
        const responseDiagnostics = normalized.diagnostics;
        const responseTransportDiagnostics: VisionObserverTransportDiagnostics = providerResponse.httpStatus === null ? {} : { httpStatus: providerResponse.httpStatus };
        if (normalized.observations === null || responseDiagnostics.normalizationFailureCode !== null) {
          return failedObserverResult(request, options.provider, options.model, errorCategoryFromNormalizationFailure(responseDiagnostics.normalizationFailureCode), Date.now() - startedAt, responseTransportDiagnostics, responseDiagnostics);
        }
        const normalizedObservations = normalized.observations.map((value, index) => normalizeObservationDetailed(value, index, input, request, options.provider, options.model, Date.now() - startedAt));
        const invalidObservation = normalizedObservations.find((value) => value.observation === null);
        const regionTelemetry = normalizedObservations.find((value) => value.regionDiagnostics)?.regionDiagnostics;
        const diagnosticsWithRegionTelemetry = regionTelemetry ? { ...responseDiagnostics, regionDiagnostics: regionTelemetry } : responseDiagnostics;
        if (invalidObservation) {
          return failedObserverResult(request, options.provider, options.model, 'MALFORMED_RESPONSE', Date.now() - startedAt, responseTransportDiagnostics, {
            ...diagnosticsWithRegionTelemetry,
            normalizationFailureCode: invalidObservation.failureCode,
            ...(invalidObservation.invalidStatusToken ? { invalidStatusToken: invalidObservation.invalidStatusToken } : {}),
            ...(invalidObservation.regionDiagnostics ? { regionDiagnostics: invalidObservation.regionDiagnostics } : {}),
          });
        }
        return successfulObserverResult(input, request, options.provider, options.model, normalizedObservations.map((value) => value.observation as VisionObservation), Date.now() - startedAt, diagnosticsWithRegionTelemetry, providerResponse.httpStatus);
      } catch (error) {
        return failedObserverResult(request, options.provider, options.model, errorCategoryFrom(error), Date.now() - startedAt, transportDiagnosticsFrom(error));
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
    run: async (selectedModel, payload) => ({ value: await options.ai.run(selectedModel, payload, { metadata: { protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION, promptVersion: VISION_OBSERVER_PROMPT_VERSION, observerTemperature: String(VISION_OBSERVER_QUERY_GENERATION_CONFIG.temperature), observerMaxTokens: String(VISION_OBSERVER_QUERY_GENERATION_CONFIG.maxTokens), observerStream: String(VISION_OBSERVER_QUERY_GENERATION_CONFIG.stream) } }), httpStatus: null, transportSucceeded: true }),
  });
}

export function createCloudflareVisionObserverRest(options: {
  transport: CloudflareRestTransport;
  model?: string;
  maxImageBytes?: number;
  payloadBuilder?: VisionObserverPayloadBuilder;
}): VisionObserver & { isLive: true } {
  const model = options.model ?? CLOUDFLARE_VISION_OBSERVER_MODEL;
  return createVisionObserver({
    model,
    provider: 'cloudflare-workers-ai-rest',
    maxImageBytes: options.maxImageBytes,
    timeoutMs: 0,
    payloadBuilder: options.payloadBuilder,
    run: async (selectedModel, payload) => {
      const result = await options.transport.run({ kind: 'VISION_OBSERVER', model: selectedModel, payload });
      return { value: result.result, httpStatus: result.httpStatus, transportSucceeded: true };
    },
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
      const normalized = observations.map((observation, index) => normalizeObservation(observation, index, input, request, provider, model, 0));
      if (normalized.some((observation) => observation === null)) return failedObserverResult(request, provider, model, 'MALFORMED_RESPONSE', Date.now() - startedAt);
      return successfulObserverResult(input, request, provider, model, normalized as VisionObservation[], Date.now() - startedAt);
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
  if (input.observations.some((observation) => observation.status === 'INDETERMINATE')) reasons.add('OBSERVATION_INDETERMINATE');
  if (input.observations.some((observation) => observation.occlusion === 'PARTIAL')) reasons.add('PARTIAL_OCCLUSION');
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
  promptVersion: typeof VISION_OBSERVER_PROMPT_VERSION;
  generationConfig: typeof VISION_OBSERVER_QUERY_GENERATION_CONFIG;
  task: VisionObserverTask;
  reasoningMode: VisionObserverReasoningMode;
  regionPolicy: VisionObserverRegionPolicy;
  executionMs: number;
  escalationRecommendation: VisionEscalationRecommendation;
  escalationReasons: readonly VisionEscalationReason[];
  transportErrorCategory?: string;
  httpStatus?: number | null;
  providerErrorCode?: number | string | null;
  providerErrorMessageCode?: string | null;
  responseDiagnostics?: VisionResponseDiagnostics;
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
    promptVersion: result.promptVersion,
    generationConfig: result.generationConfig,
    task: result.task,
    reasoningMode: result.reasoningMode,
    regionPolicy: result.regionPolicy,
    executionMs: result.executionMs,
    escalationRecommendation: result.escalationRecommendation,
    escalationReasons: result.escalationReasons,
    transportErrorCategory: result.transportErrorCategory,
    httpStatus: result.httpStatus,
    providerErrorCode: result.providerErrorCode,
    providerErrorMessageCode: result.providerErrorMessageCode,
    responseDiagnostics: result.responseDiagnostics,
  };
}

export function compareVisionObserverResults(input: { sampleId: string; inputHash: string; category: VisionObservationCategory; direct: VisionObserverResult; reasoned: VisionObserverResult }): VisionObserverComparison {
  if (input.direct.reasoningMode !== 'DIRECT' || input.reasoned.reasoningMode !== 'REASONED') throw new Error('vision_ab_reasoning_modes_invalid');
  if (input.direct.queryId !== input.reasoned.queryId || input.direct.task !== input.reasoned.task || input.direct.protocolVersion !== input.reasoned.protocolVersion || input.direct.promptVersion !== input.reasoned.promptVersion || input.direct.regionPolicy !== input.reasoned.regionPolicy || JSON.stringify(input.direct.generationConfig) !== JSON.stringify(input.reasoned.generationConfig)) throw new Error('vision_ab_inputs_mismatch');
  const directStatuses = new Set(input.direct.observations.map((observation) => `${observation.category}:${observation.status}`));
  const reasonedStatuses = new Set(input.reasoned.observations.map((observation) => `${observation.category}:${observation.status}`));
  const contradictory = [...directStatuses].some((status) => {
    const [category, value] = status.split(':');
    const opposite = value === 'OBSERVED' ? 'NOT_OBSERVED' : value === 'NOT_OBSERVED' ? 'OBSERVED' : null;
    return opposite !== null && reasonedStatuses.has(`${category}:${opposite}`);
  });
  return {
    schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    sampleId: input.sampleId,
    inputHash: input.inputHash,
    queryId: input.direct.queryId,
    category: input.category,
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
  if (typeof observation.applicable !== 'boolean' || typeof observation.observation !== 'string') throw new Error('vision_observation_shape_invalid');
  if ((observation.applicable === false && observation.status !== 'NOT_APPLICABLE') || (observation.status === 'NOT_APPLICABLE' && observation.applicable !== false)) throw new Error('vision_observation_applicability_invalid');
  if (observation.occlusion !== undefined && !['NONE', 'PARTIAL', 'UNKNOWN'].includes(observation.occlusion)) throw new Error('vision_observation_occlusion_invalid');
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
