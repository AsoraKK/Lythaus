import { assertEvidencePacket, assertEvidenceReferenceIds, packetReferenceIds, type EvidencePacket } from './evidence-packet.ts';
import { CloudflareRestError, type CloudflareRestErrorCategory, type CloudflareRestTransport } from './cloudflare-rest.ts';
import { CLOUDFLARE_REASONER_MODEL } from './research-config.ts';
import { isReasonedRecheckReasonAllowed, VISION_ESCALATION_REASONS, VISION_OBSERVER_CATEGORIES } from './vision-observer.ts';
import type { CloudflareAiRunOptions, VisionEscalationReason, VisionObservationCategory, VisionRegion } from './vision-observer.ts';

export const JUDGE_RESULT_SCHEMA_VERSION = 'lythaus-judge-result-v1' as const;
export const JUDGE_RECOMMENDATION_SCHEMA_VERSION = '1' as const;
export const JUDGE_PROMPT_VERSION = 'lythaus-gpt-oss-judge-prompt-v1' as const;

export const ORIGIN_HYPOTHESES = [
  'CAMERA_NATIVE',
  'SYNTHETIC',
  'CAMERA_CAPTURE_OF_SYNTHETIC',
  'DIGITAL_ART_OR_CGI',
  'SCREENSHOT_OR_COMPOSITE',
  'LOCALLY_MANIPULATED',
  'INSUFFICIENT_EVIDENCE',
] as const;
export type OriginHypothesis = (typeof ORIGIN_HYPOTHESES)[number];

export const WHITELISTED_ADDITIONAL_TESTS = [
  'INSPECT_DISPLAY_BOUNDARY',
  'INSPECT_MOIRE',
  'INSPECT_TEXT_REGION',
  'INSPECT_REFLECTION',
  'INSPECT_OCCLUSION',
  'INSPECT_SHADOWS',
  'INSPECT_ANATOMY',
  'REASONED_VISUAL_RECHECK',
] as const;
export type WhitelistedAdditionalTest = (typeof WHITELISTED_ADDITIONAL_TESTS)[number];

export interface EvidenceReference {
  evidenceId: string;
  rationale: string;
}

export interface EvidenceRequest {
  requestId: string;
  request: string;
  evidenceFamily: string | null;
  observationId?: string;
  category?: VisionObservationCategory;
  reasonCode?: VisionEscalationReason;
  targetRegion?: VisionRegion | null;
}

export interface JudgeRecommendation {
  schemaVersion: typeof JUDGE_RECOMMENDATION_SCHEMA_VERSION;
  primaryHypothesis: OriginHypothesis;
  alternativeHypotheses: readonly { hypothesis: OriginHypothesis; rationale: string }[];
  supportingEvidence: readonly EvidenceReference[];
  contradictoryEvidence: readonly EvidenceReference[];
  missingEvidence: readonly EvidenceRequest[];
  uncertainty: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  requiresReview: boolean;
  recommendedAdditionalTests: readonly WhitelistedAdditionalTest[];
  rationale: string;
  enforcementAuthority: false;
}

export interface JudgeInput {
  packet: EvidencePacket;
  requestId?: string;
}

export type JudgeErrorCategory = 'INVALID_INPUT' | 'TIMEOUT' | 'NETWORK_FAILURE' | 'MALFORMED_RESPONSE' | 'UNEXPECTED_SCHEMA';

export const JUDGE_NORMALIZATION_FAILURE_CODES = [
  'RESPONSE_MISSING',
  'RESPONSE_TYPE_UNSUPPORTED',
  'RESPONSE_STRING_NOT_JSON',
  'RESPONSE_OBJECT_UNWRAP_FAILED',
  'SCHEMA_VERSION_INVALID',
  'PRIMARY_HYPOTHESIS_INVALID',
  'ALTERNATIVES_INVALID',
  'SUPPORTING_EVIDENCE_INVALID',
  'CONTRADICTORY_EVIDENCE_INVALID',
  'UNKNOWN_EVIDENCE_REFERENCE',
  'MISSING_EVIDENCE_INVALID',
  'UNCERTAINTY_INVALID',
  'REQUIRES_REVIEW_INVALID',
  'ADDITIONAL_TEST_INVALID',
  'REASONED_RECHECK_INVALID',
  'RATIONALE_INVALID',
  'ENFORCEMENT_AUTHORITY_INVALID',
  'FORBIDDEN_FIELD_PRESENT',
  'UNKNOWN_RESPONSE_SHAPE',
] as const;
export type JudgeNormalizationFailureCode = (typeof JUDGE_NORMALIZATION_FAILURE_CODES)[number];

export type JudgeProviderResultType = 'OBJECT' | 'STRING' | 'ARRAY' | 'NULL' | 'OTHER';

export interface JudgeResponseDiagnostics {
  transportSucceeded: boolean;
  providerResultType: JudgeProviderResultType;
  providerTopLevelKeys: readonly string[];
  responsePresent: boolean;
  responseType: string | null;
  responseTopLevelKeys: readonly string[];
  resultPresent: boolean;
  resultType: string | null;
  outputTextPresent: boolean;
  outputTextType: string | null;
  reasoningFieldPresent: boolean;
  reasoningFieldType: string | null;
  usageFieldPresent: boolean;
  usageFieldType: string | null;
  toolCallsPresent: boolean;
  toolCallCount: number | null;
  stringJsonParseable: boolean | null;
  normalizationFailureCode: JudgeNormalizationFailureCode | null;
}

export class JudgeNormalizationError extends Error {
  readonly code: JudgeNormalizationFailureCode;
  readonly responseDiagnostics?: JudgeResponseDiagnostics;

  constructor(code: JudgeNormalizationFailureCode, responseDiagnostics?: JudgeResponseDiagnostics) {
    super(`judge_normalization_${code}`);
    this.name = 'JudgeNormalizationError';
    this.code = code;
    this.responseDiagnostics = responseDiagnostics;
  }
}

export interface JudgeResult {
  schemaVersion: typeof JUDGE_RESULT_SCHEMA_VERSION;
  promptVersion: typeof JUDGE_PROMPT_VERSION;
  prompt: string;
  provider: string;
  model: string | null;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  recommendation: JudgeRecommendation | null;
  executionMs: number;
  errorCategory?: JudgeErrorCategory;
  httpStatus?: number | null;
  transportErrorCategory?: CloudflareRestErrorCategory | null;
  providerErrorCode?: number | string | null;
  providerErrorMessageCode?: string | null;
  responseDiagnostics?: JudgeResponseDiagnostics | null;
  normalizationFailureCode?: JudgeNormalizationFailureCode | null;
}

export interface Judge {
  judge(input: JudgeInput): Promise<JudgeResult>;
  isLive?: boolean;
}

export const JUDGE_SYSTEM_PROMPT = [
  'You are the Lythaus GPT-OSS Judge for lythaus-evidence-packet-v1.',
  'This is Research V1. Evaluate competing origin hypotheses from the supplied Evidence Packet; do not act as a product policy engine.',
  'Distinguish measured facts, visual observer descriptions, provider safety signals, and your interpretation.',
  'Treat missing metadata as neutral. Low camera evidence is insufficient to prove synthetic origin.',
  'Camera acquisition and synthetic depicted content may both be true. Account for photographs of displays, screenshots, recaptures, CGI, digital art, composites, and local manipulation.',
  'Safety evidence is SAFETY_CONTEXT_ONLY. Never use harmful-content categories, flags, or scores as origin evidence.',
  'Report contradictory evidence and missing evidence. Never fabricate an unavailable evidence family.',
  'Do not let eloquent reasoning substitute for weak measurements. Abstain with INSUFFICIENT_EVIDENCE when evidence is insufficient.',
  'Observer reasoningMode is execution metadata. Never treat REASONED as synthetic-origin evidence.',
  'The Vision Observer raw reasoning trace is not supplied and must never be requested, repeated, or used as evidence.',
  'Do not output numeric confidence, AI probability, human probability, enforcement actions, or a final product decision.',
  'You may request only whitelisted bounded additional tests. REASONED_VISUAL_RECHECK is valid only with a real observationId, category, reasonCode, and optional normalized targetRegion in missingEvidence. Do not emit tool calls or execute tests.',
  'Return JSON only with schemaVersion "1", primaryHypothesis, alternativeHypotheses, supportingEvidence, contradictoryEvidence, missingEvidence, uncertainty, requiresReview, recommendedAdditionalTests, rationale, and enforcementAuthority false.',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function providerResultType(value: unknown): JudgeProviderResultType {
  if (value === null) return 'NULL';
  if (Array.isArray(value)) return 'ARRAY';
  if (typeof value === 'string') return 'STRING';
  if (isRecord(value)) return 'OBJECT';
  return 'OTHER';
}

function safeObjectKeys(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .filter((key) => /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key))
    .sort()
    .slice(0, 64);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function createJudgeResponseDiagnostics(value: unknown, transportSucceeded: boolean): JudgeResponseDiagnostics {
  const root = isRecord(value) ? value : null;
  const toolCalls = root && hasOwn(root, 'tool_calls') ? root.tool_calls : root && hasOwn(root, 'toolCalls') ? root.toolCalls : undefined;
  return {
    transportSucceeded,
    providerResultType: providerResultType(value),
    providerTopLevelKeys: safeObjectKeys(value),
    responsePresent: Boolean(root && hasOwn(root, 'response')),
    responseType: root && hasOwn(root, 'response') ? valueType(root.response) : null,
    responseTopLevelKeys: root && hasOwn(root, 'response') && isRecord(root.response) ? safeObjectKeys(root.response) : [],
    resultPresent: Boolean(root && hasOwn(root, 'result')),
    resultType: root && hasOwn(root, 'result') ? valueType(root.result) : null,
    outputTextPresent: Boolean(root && hasOwn(root, 'output_text')),
    outputTextType: root && hasOwn(root, 'output_text') ? valueType(root.output_text) : null,
    reasoningFieldPresent: Boolean(root && hasOwn(root, 'reasoning')),
    reasoningFieldType: root && hasOwn(root, 'reasoning') ? valueType(root.reasoning) : null,
    usageFieldPresent: Boolean(root && hasOwn(root, 'usage')),
    usageFieldType: root && hasOwn(root, 'usage') ? valueType(root.usage) : null,
    toolCallsPresent: Boolean(root && (hasOwn(root, 'tool_calls') || hasOwn(root, 'toolCalls'))),
    toolCallCount: Array.isArray(toolCalls) ? Math.min(toolCalls.length, 1000) : null,
    stringJsonParseable: null,
    normalizationFailureCode: null,
  };
}

function forbiddenDeep(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(forbiddenDeep);
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (['groundTruth', 'truth', 'aiProbability', 'humanProbability', 'rawImage', 'imageBytes', 'base64', 'rawReasoning', 'reasoningTrace', 'chainOfThought', 'thinking'].includes(key)) return true;
    if (forbiddenDeep(value[key])) return true;
  }
  return false;
}

function stringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value.map((item) => item.slice(0, 1200)).slice(0, max);
}

function parseReferences(value: unknown, packet: EvidencePacket, invalidCode: 'SUPPORTING_EVIDENCE_INVALID' | 'CONTRADICTORY_EVIDENCE_INVALID'): EvidenceReference[] {
  if (!Array.isArray(value)) throw new JudgeNormalizationError(invalidCode);
  const references = value.slice(0, 20).map((item) => {
    if (!isRecord(item) || typeof item.evidenceId !== 'string' || typeof item.rationale !== 'string') return null;
    return { evidenceId: item.evidenceId.slice(0, 200), rationale: item.rationale.slice(0, 1200) };
  });
  if (references.some((item) => item === null)) throw new JudgeNormalizationError(invalidCode);
  const result = references as EvidenceReference[];
  try {
    assertEvidenceReferenceIds(packet, result.map((item) => item.evidenceId));
  } catch {
    throw new JudgeNormalizationError('UNKNOWN_EVIDENCE_REFERENCE');
  }
  return result;
}

function normalizeTargetRegion(value: unknown): VisionRegion | null {
  if (!isRecord(value) || value.coordinateSpace !== 'NORMALIZED') return null;
  const coordinates = [value.x, value.y, value.width, value.height];
  if (!coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)) return null;
  if ((value.width as number) <= 0 || (value.height as number) <= 0 || (value.x as number) + (value.width as number) > 1 || (value.y as number) + (value.height as number) > 1) return null;
  return {
    coordinateSpace: 'NORMALIZED',
    x: value.x as number,
    y: value.y as number,
    width: value.width as number,
    height: value.height as number,
    ...(typeof value.label === 'string' && value.label.trim() ? { label: value.label.trim().slice(0, 120) } : {}),
  };
}

const FORBIDDEN_JUDGE_RESPONSE_FIELDS = [
  'groundTruth',
  'truth',
  'aiProbability',
  'humanProbability',
  'numericConfidence',
  'authenticityVerdict',
  'rawImage',
  'imageBytes',
  'base64',
  'rawReasoning',
  'reasoningTrace',
  'chainOfThought',
  'thinking',
] as const;

function observationCategoryForId(packet: EvidencePacket, observationId: string): VisionObservationCategory | null {
  for (const observation of [...packet.observations, ...packet.observationHistory]) {
    if (observation.observationId === observationId) return observation.category;
  }
  return null;
}

function parseRecommendation(value: unknown, packet: EvidencePacket): JudgeRecommendation {
  if (!isRecord(value)) throw new JudgeNormalizationError('SCHEMA_VERSION_INVALID');
  if (FORBIDDEN_JUDGE_RESPONSE_FIELDS.some((field) => hasOwn(value, field))) throw new JudgeNormalizationError('FORBIDDEN_FIELD_PRESENT');
  if (value.schemaVersion !== JUDGE_RECOMMENDATION_SCHEMA_VERSION) throw new JudgeNormalizationError('SCHEMA_VERSION_INVALID');
  if (value.enforcementAuthority !== false) throw new JudgeNormalizationError('ENFORCEMENT_AUTHORITY_INVALID');
  if (!(ORIGIN_HYPOTHESES as readonly string[]).includes(String(value.primaryHypothesis))) throw new JudgeNormalizationError('PRIMARY_HYPOTHESIS_INVALID');
  if (!Array.isArray(value.alternativeHypotheses)) throw new JudgeNormalizationError('ALTERNATIVES_INVALID');
  const alternatives = value.alternativeHypotheses.slice(0, 6).map((item) => {
    if (!isRecord(item) || !(ORIGIN_HYPOTHESES as readonly string[]).includes(String(item.hypothesis)) || typeof item.rationale !== 'string') return null;
    return { hypothesis: item.hypothesis as OriginHypothesis, rationale: item.rationale.slice(0, 1200) };
  });
  if (alternatives.some((item) => item === null)) throw new JudgeNormalizationError('ALTERNATIVES_INVALID');
  const supportingEvidence = parseReferences(value.supportingEvidence, packet, 'SUPPORTING_EVIDENCE_INVALID');
  const contradictoryEvidence = parseReferences(value.contradictoryEvidence, packet, 'CONTRADICTORY_EVIDENCE_INVALID');
  if (!Array.isArray(value.missingEvidence)) throw new JudgeNormalizationError('MISSING_EVIDENCE_INVALID');
  const missingEvidence = value.missingEvidence.slice(0, 12).map((item) => {
    if (!isRecord(item) || typeof item.requestId !== 'string' || typeof item.request !== 'string' || (item.evidenceFamily !== null && typeof item.evidenceFamily !== 'string')) throw new JudgeNormalizationError('MISSING_EVIDENCE_INVALID');
    if (item.observationId !== undefined && typeof item.observationId !== 'string') throw new JudgeNormalizationError('MISSING_EVIDENCE_INVALID');
    if (typeof item.observationId === 'string' && !packetReferenceIds(packet).has(item.observationId)) throw new JudgeNormalizationError('UNKNOWN_EVIDENCE_REFERENCE');
    if (item.category !== undefined && !(typeof item.category === 'string' && (VISION_OBSERVER_CATEGORIES as readonly string[]).includes(item.category))) throw new JudgeNormalizationError('REASONED_RECHECK_INVALID');
    if (typeof item.observationId === 'string' && typeof item.category === 'string' && observationCategoryForId(packet, item.observationId) !== item.category) throw new JudgeNormalizationError('REASONED_RECHECK_INVALID');
    if (item.reasonCode !== undefined && !(typeof item.reasonCode === 'string' && (VISION_ESCALATION_REASONS as readonly string[]).includes(item.reasonCode))) throw new JudgeNormalizationError('REASONED_RECHECK_INVALID');
    if (typeof item.category === 'string' && typeof item.reasonCode === 'string' && !isReasonedRecheckReasonAllowed(item.category as VisionObservationCategory, item.reasonCode as VisionEscalationReason)) throw new JudgeNormalizationError('REASONED_RECHECK_INVALID');
    const targetRegion = item.targetRegion === undefined || item.targetRegion === null ? item.targetRegion : normalizeTargetRegion(item.targetRegion);
    if (item.targetRegion !== undefined && item.targetRegion !== null && targetRegion === null) throw new JudgeNormalizationError('REASONED_RECHECK_INVALID');
    return {
      requestId: item.requestId.slice(0, 120),
      request: item.request.slice(0, 1200),
      evidenceFamily: item.evidenceFamily as string | null,
      ...(typeof item.observationId === 'string' ? { observationId: item.observationId.slice(0, 200) } : {}),
      ...(typeof item.category === 'string' ? { category: item.category as VisionObservationCategory } : {}),
      ...(typeof item.reasonCode === 'string' ? { reasonCode: item.reasonCode as VisionEscalationReason } : {}),
      ...(item.targetRegion !== undefined ? { targetRegion: targetRegion as VisionRegion | null } : {}),
    };
  });
  if (missingEvidence.some((item) => item === null)) throw new JudgeNormalizationError('MISSING_EVIDENCE_INVALID');
  const uncertainty = value.uncertainty;
  if (!['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'].includes(String(uncertainty))) throw new JudgeNormalizationError('UNCERTAINTY_INVALID');
  if (typeof value.requiresReview !== 'boolean') throw new JudgeNormalizationError('REQUIRES_REVIEW_INVALID');
  if (typeof value.rationale !== 'string') throw new JudgeNormalizationError('RATIONALE_INVALID');
  const additional = stringList(value.recommendedAdditionalTests, 8);
  if (!additional || additional.some((item) => !(WHITELISTED_ADDITIONAL_TESTS as readonly string[]).includes(item))) throw new JudgeNormalizationError('ADDITIONAL_TEST_INVALID');
  if (additional.includes('REASONED_VISUAL_RECHECK') && !(missingEvidence as EvidenceRequest[]).some((item) => item.observationId && item.category && item.reasonCode)) throw new JudgeNormalizationError('REASONED_RECHECK_INVALID');
  return {
    schemaVersion: JUDGE_RECOMMENDATION_SCHEMA_VERSION,
    primaryHypothesis: value.primaryHypothesis as OriginHypothesis,
    alternativeHypotheses: alternatives as { hypothesis: OriginHypothesis; rationale: string }[],
    supportingEvidence,
    contradictoryEvidence,
    missingEvidence: missingEvidence as EvidenceRequest[],
    uncertainty: uncertainty as JudgeRecommendation['uncertainty'],
    requiresReview: value.requiresReview,
    recommendedAdditionalTests: additional as WhitelistedAdditionalTest[],
    rationale: value.rationale.slice(0, 2400),
    enforcementAuthority: false,
  };
}

function parseJsonSurface(text: string, diagnostics: JudgeResponseDiagnostics): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(normalized);
    diagnostics.stringJsonParseable = true;
    if (isRecord(parsed)) diagnostics.responseTopLevelKeys = safeObjectKeys(parsed);
    return parsed;
  } catch {
    diagnostics.stringJsonParseable = false;
    throw new JudgeNormalizationError('RESPONSE_STRING_NOT_JSON');
  }
}

function unwrapJudgeProviderResult(value: unknown, diagnostics: JudgeResponseDiagnostics): unknown {
  if (typeof value === 'string') return parseJsonSurface(value, diagnostics);
  if (!isRecord(value)) throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
  if (typeof value.primaryHypothesis === 'string') return value;
  if (hasOwn(value, 'response')) {
    if (typeof value.response === 'string') return parseJsonSurface(value.response, diagnostics);
    if (isRecord(value.response)) {
      diagnostics.responseTopLevelKeys = safeObjectKeys(value.response);
      return value.response;
    }
    throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
  }
  for (const key of ['result', 'output_text']) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] !== 'string') throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
    return parseJsonSurface(value[key] as string, diagnostics);
  }
  throw new JudgeNormalizationError('RESPONSE_MISSING');
}

export function normalizeJudgeProviderResult(value: unknown, packet: EvidencePacket, transportSucceeded = true): { recommendation: JudgeRecommendation; responseDiagnostics: JudgeResponseDiagnostics } {
  const diagnostics = createJudgeResponseDiagnostics(value, transportSucceeded);
  try {
    const candidate = unwrapJudgeProviderResult(value, diagnostics);
    const recommendation = parseRecommendation(candidate, packet);
    diagnostics.normalizationFailureCode = null;
    return { recommendation, responseDiagnostics: diagnostics };
  } catch (error) {
    const code = error instanceof JudgeNormalizationError ? error.code : 'UNKNOWN_RESPONSE_SHAPE';
    diagnostics.normalizationFailureCode = code;
    throw new JudgeNormalizationError(code, diagnostics);
  }
}

export function assertJudgeRecommendation(recommendation: JudgeRecommendation, packet: EvidencePacket): void {
  assertEvidencePacket(packet);
  parseRecommendation(recommendation, packet);
}

export function createInsufficientEvidenceRecommendation(rationale = 'The available evidence is insufficient to rank an origin hypothesis safely.'): JudgeRecommendation {
  return {
    schemaVersion: JUDGE_RECOMMENDATION_SCHEMA_VERSION,
    primaryHypothesis: 'INSUFFICIENT_EVIDENCE',
    alternativeHypotheses: [],
    supportingEvidence: [],
    contradictoryEvidence: [],
    missingEvidence: [{ requestId: 'missing-evidence-1', request: 'Obtain additional independent evidence before ranking origin.', evidenceFamily: null }],
    uncertainty: 'VERY_HIGH',
    requiresReview: true,
    recommendedAdditionalTests: [],
    rationale,
    enforcementAuthority: false,
  };
}

export function buildJudgeRequest(packet: EvidencePacket): { messages: readonly { role: 'system' | 'user'; content: string }[]; response_format: { type: 'json_object' }; temperature: 0; max_tokens: 1200 } {
  assertEvidencePacket(packet);
  if (forbiddenDeep(packet)) throw new Error('judge_input_forbidden_data');
  return {
    messages: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(packet) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 1200,
  };
}

function failedJudgeResult(provider: string, model: string, errorCategory: JudgeErrorCategory, executionMs: number, diagnostics: Pick<JudgeResult, 'httpStatus' | 'transportErrorCategory' | 'providerErrorCode' | 'providerErrorMessageCode' | 'responseDiagnostics' | 'normalizationFailureCode'> = {}): JudgeResult {
  return {
    schemaVersion: JUDGE_RESULT_SCHEMA_VERSION,
    promptVersion: JUDGE_PROMPT_VERSION,
    prompt: JUDGE_SYSTEM_PROMPT,
    provider,
    model,
    status: 'PROVIDER_FAILURE',
    recommendation: null,
    executionMs,
    errorCategory,
    ...diagnostics,
  };
}

export function createCloudflareJudge(options: { ai: CloudflareAiRunOptions; model?: string; timeoutMs?: number }): Judge & { isLive: true } {
  const provider = 'cloudflare-workers-ai';
  const model = options.model ?? CLOUDFLARE_REASONER_MODEL;
  return {
    isLive: true,
    async judge(input): Promise<JudgeResult> {
      const startedAt = Date.now();
      try {
        const request = buildJudgeRequest(input.packet);
        const timeoutMs = options.timeoutMs ?? 30_000;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const call = options.ai.run(model, request, { metadata: { promptVersion: JUDGE_PROMPT_VERSION } });
        const guarded = timeoutMs > 0
          ? new Promise<unknown>((resolve, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('judge_timeout')), timeoutMs);
            call.then(resolve, reject);
          })
          : call;
        try {
          const raw = await guarded;
          const normalized = normalizeJudgeProviderResult(raw, input.packet);
          return { schemaVersion: JUDGE_RESULT_SCHEMA_VERSION, promptVersion: JUDGE_PROMPT_VERSION, prompt: JUDGE_SYSTEM_PROMPT, provider, model, status: 'SUCCESS', recommendation: normalized.recommendation, executionMs: Date.now() - startedAt, responseDiagnostics: normalized.responseDiagnostics, normalizationFailureCode: null };
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const category: JudgeErrorCategory = message === 'judge_timeout'
          ? 'TIMEOUT'
          : message.startsWith('judge_') || message === 'evidence_packet_schema_invalid' ? 'UNEXPECTED_SCHEMA' : 'NETWORK_FAILURE';
        const diagnostics = error instanceof JudgeNormalizationError
          ? { responseDiagnostics: error.responseDiagnostics ?? null, normalizationFailureCode: error.code }
          : { responseDiagnostics: null, normalizationFailureCode: null };
        return failedJudgeResult(provider, model, category, Date.now() - startedAt, diagnostics);
      }
    },
  };
}

export function createCloudflareJudgeRest(options: { transport: CloudflareRestTransport; model?: string }): Judge & { isLive: true } {
  const provider = 'cloudflare-workers-ai-rest';
  const model = options.model ?? CLOUDFLARE_REASONER_MODEL;
  return {
    isLive: true,
    async judge(input): Promise<JudgeResult> {
      const startedAt = Date.now();
      let httpStatus: number | null = null;
      try {
        const request = buildJudgeRequest(input.packet);
        const providerResponse = await options.transport.run({ kind: 'JUDGE', model, payload: request });
        httpStatus = providerResponse.httpStatus;
        const raw = providerResponse.result;
        const normalized = normalizeJudgeProviderResult(raw, input.packet);
        return { schemaVersion: JUDGE_RESULT_SCHEMA_VERSION, promptVersion: JUDGE_PROMPT_VERSION, prompt: JUDGE_SYSTEM_PROMPT, provider, model, status: 'SUCCESS', recommendation: normalized.recommendation, executionMs: Date.now() - startedAt, httpStatus, responseDiagnostics: normalized.responseDiagnostics, normalizationFailureCode: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const category: JudgeErrorCategory = message.startsWith('judge_') || message === 'evidence_packet_schema_invalid' ? 'UNEXPECTED_SCHEMA' : message.includes('timeout') ? 'TIMEOUT' : 'NETWORK_FAILURE';
        const diagnostics = error instanceof CloudflareRestError
          ? { httpStatus: error.httpStatus, transportErrorCategory: error.category, providerErrorCode: error.providerErrorCode, providerErrorMessageCode: error.providerErrorMessageCode, responseDiagnostics: null, normalizationFailureCode: null }
          : error instanceof JudgeNormalizationError
          ? { httpStatus, responseDiagnostics: error.responseDiagnostics ?? null, normalizationFailureCode: error.code }
          : { httpStatus, responseDiagnostics: null, normalizationFailureCode: null };
        return failedJudgeResult(provider, model, category, Date.now() - startedAt, diagnostics);
      }
    },
  };
}

export function createMockJudge(recommendation: JudgeRecommendation = createInsufficientEvidenceRecommendation()): Judge & { isLive: false } {
  return {
    isLive: false,
    async judge(input): Promise<JudgeResult> {
      assertJudgeRecommendation(recommendation, input.packet);
      return {
        schemaVersion: JUDGE_RESULT_SCHEMA_VERSION,
        promptVersion: JUDGE_PROMPT_VERSION,
        prompt: JUDGE_SYSTEM_PROMPT,
        provider: 'mock-judge',
        model: 'mock-v1',
        status: 'SUCCESS',
        recommendation,
        executionMs: 0,
      };
    },
  };
}
