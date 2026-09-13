import { assertEvidencePacket, assertEvidenceReferenceIds, packetReferenceIds, type EvidencePacket } from './evidence-packet.ts';
import { CloudflareRestError, type CloudflareRestErrorCategory, type CloudflareRestTransport } from './cloudflare-rest.ts';
import { CLOUDFLARE_REASONER_MODEL } from './research-config.ts';
import { isReasonedRecheckReasonAllowed, VISION_ESCALATION_REASONS, VISION_OBSERVER_CATEGORIES } from './vision-observer.ts';
import type { CloudflareAiRunOptions, VisionEscalationReason, VisionObservationCategory, VisionRegion } from './vision-observer.ts';

export const JUDGE_RESULT_SCHEMA_VERSION = 'lythaus-judge-result-v1' as const;
export const JUDGE_RECOMMENDATION_SCHEMA_VERSION = '1' as const;
export const JUDGE_PROMPT_VERSION = 'lythaus-gpt-oss-judge-prompt-v3' as const;
export const JUDGE_MAX_OUTPUT_TOKENS = 2400 as const;
export const JUDGE_JSON_SCHEMA_VERSION = 'lythaus-judge-json-schema-v1' as const;
export const JUDGE_STRUCTURED_OUTPUT_MODES = ['JSON_OBJECT', 'JSON_SCHEMA'] as const;
export type JudgeStructuredOutputMode = (typeof JUDGE_STRUCTURED_OUTPUT_MODES)[number];

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

export interface JudgeJsonSchema {
  readonly $id: typeof JUDGE_JSON_SCHEMA_VERSION;
  readonly type: 'object';
  readonly additionalProperties: false;
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface JudgeRequest {
  readonly messages: readonly { role: 'system' | 'user'; content: string }[];
  readonly response_format:
    | { readonly type: 'json_object' }
    | { readonly type: 'json_schema'; readonly json_schema: JudgeJsonSchema };
  readonly temperature: 0;
  readonly max_tokens: typeof JUDGE_MAX_OUTPUT_TOKENS;
}

export interface JudgeRequestOptions {
  structuredOutputMode?: JudgeStructuredOutputMode;
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
  'CHOICES_MISSING',
  'CHOICES_TYPE_UNSUPPORTED',
  'CHOICES_EMPTY',
  'CHOICE_COUNT_INVALID',
  'CHOICE_INVALID',
  'MESSAGE_MISSING',
  'MESSAGE_INVALID',
  'MESSAGE_CONTENT_MISSING',
  'MESSAGE_CONTENT_TYPE_UNSUPPORTED',
  'MESSAGE_CONTENT_NOT_JSON',
  'FINISH_REASON_TRUNCATED',
  'FINISH_REASON_UNSUPPORTED',
  'UNEXPECTED_TOOL_CALL',
  'UNKNOWN_RESPONSE_SHAPE',
] as const;
export type JudgeNormalizationFailureCode = (typeof JUDGE_NORMALIZATION_FAILURE_CODES)[number];

export type JudgeProviderResultType = 'OBJECT' | 'STRING' | 'ARRAY' | 'NULL' | 'OTHER';

export type JudgeProviderEnvelopeClassification =
  | 'DIRECT_CANONICAL'
  | 'RESPONSE_OBJECT'
  | 'RESPONSE_STRING'
  | 'RESULT_OBJECT'
  | 'RESULT_STRING'
  | 'OUTPUT_TEXT_OBJECT'
  | 'OUTPUT_TEXT_STRING'
  | 'CHAT_COMPLETION'
  | 'UNKNOWN';

export type JudgeFinishReasonValueCode = 'STOP' | 'LENGTH' | 'TOOL_CALLS' | 'OTHER';

export interface JudgeResponseDiagnostics {
  transportSucceeded: boolean;
  providerResultType: JudgeProviderResultType;
  providerEnvelopeClassification: JudgeProviderEnvelopeClassification;
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
  choicesPresent: boolean;
  choiceCount: number | null;
  firstChoiceType: string | null;
  firstChoiceKeys: readonly string[];
  firstChoiceIndexPresent: boolean;
  firstChoiceIndexType: string | null;
  messagePresent: boolean;
  messageType: string | null;
  messageKeys: readonly string[];
  messageRolePresent: boolean;
  messageRoleType: string | null;
  messageContentPresent: boolean;
  messageContentType: string | null;
  messageContentLength: number | null;
  messageContentBlockTypes?: readonly string[];
  finishReasonPresent: boolean;
  finishReasonType: string | null;
  finishReasonValueCode: JudgeFinishReasonValueCode | null;
  messageToolCallsPresent: boolean;
  messageToolCallCount: number | null;
  messageReasoningFieldPresent: boolean;
  messageReasoningFieldType: string | null;
  topLevelReasoningFieldPresent: boolean;
  topLevelReasoningFieldType: string | null;
  messageContentJsonParseable: boolean | null;
  messageContentTopLevelKeys: readonly string[];
  stringJsonParseable: boolean | null;
  normalizationFailureCode: JudgeNormalizationFailureCode | null;
  invalidPrimaryHypothesisToken?: string;
}

export const JUDGE_ADAPTER_FAILURE_CLASSES = [
  'PROVIDER_ENVELOPE_UNSUPPORTED',
  'CONTENT_FIELD_SHAPE_UNSUPPORTED',
  'CONTENT_JSON_EXTRACTION_UNSUPPORTED',
  'MODEL_OUTPUT_CONTRACT_FAILURE',
  'FINISH_REASON_FAILURE',
  'TOOL_CALL_FAILURE',
  'CANONICAL_SCHEMA_FAILURE',
  'UNKNOWN',
] as const;
export type JudgeAdapterFailureClass = (typeof JUDGE_ADAPTER_FAILURE_CLASSES)[number];

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
  'ROLE',
  'You are the Lythaus GPT-OSS Judge for lythaus-evidence-packet-v1.',
  'This is Research V1. Evaluate competing origin hypotheses from the supplied Evidence Packet; do not act as a product policy engine.',
  'EVIDENCE RULES',
  'Distinguish measured facts, visual observer descriptions, provider safety signals, and your interpretation.',
  'Treat missing metadata as neutral. Low camera evidence is insufficient to prove synthetic origin.',
  'Camera-origin evidence and synthetic-origin evidence are independent axes. Never reason REAL = 1 - AI. Never infer SYNTHETIC merely because camera evidence is weak. Never infer CAMERA_NATIVE merely because synthetic evidence is absent.',
  'Do not infer provenance from PNG/JPEG format, AI origin from missing EXIF, or human authorship from camera metadata. Uniform content and weak experimental measurements do not establish origin.',
  'Camera acquisition and synthetic depicted content may both be true. Account for photographs of displays, screenshots, recaptures, CGI, digital art, composites, and local manipulation.',
  'Safety evidence is SAFETY_CONTEXT_ONLY. Never use harmful-content categories, flags, or scores as origin evidence.',
  'safetyContext has role SAFETY_CONTEXT_ONLY. Moderation categories, flags, scores, and ALLOW/REVIEW/BLOCK status MUST NOT support or contradict any origin hypothesis. Safety handling belongs outside this Judge; enforcementAuthority MUST be false.',
  'Report contradictory evidence and missing evidence. Never fabricate an unavailable evidence family.',
  'A PARTIAL Evidence Packet is valid. UNAVAILABLE families are missing evidence, not negative evidence. Unavailable EF3 does not mean no synthetic signal exists; unavailable EF5 does not mean no local manipulation exists. Acknowledge these limitations.',
  'Do not let eloquent reasoning substitute for weak measurements. Abstain with INSUFFICIENT_EVIDENCE when evidence is insufficient.',
  'Vision observations are fallible evidence, not ground truth merely because they are structured.',
  'Observer reasoningMode is execution metadata. Never treat REASONED as synthetic-origin evidence.',
  'The Vision Observer raw reasoning trace is not supplied and must never be requested, repeated, or used as evidence.',
  'Return only a concise evidence-grounded rationale, never hidden reasoning, a scratchpad, or chain-of-thought.',
  'Do not output numeric confidence, AI probability, human probability, enforcement actions, or a final product decision.',
  'EVIDENCE DIRECTIONALITY',
  'Evidence being compatible with a hypothesis does not make it supporting evidence. A measurement may be descriptive without being origin-directional.',
  'Use an evidence item in supportingEvidence only when the supplied packet, provenance, limitations, and/or explicit calibration establish a validated directional relationship supporting the selected hypothesis.',
  'Use an evidence item in contradictoryEvidence only when a validated directional relationship establishes that it weighs against the selected hypothesis. Absence of supporting evidence is not contradictory evidence.',
  'Experimental, uncalibrated, proxy, or otherwise unvalidated measurements must not be used as positive or contradictory origin evidence merely because their value appears suggestive.',
  'Research V1 contract: EF1 file-format and metadata observations are descriptive and nondirectional unless explicitly calibrated; current EF2 experimental physical-acquisition proxies and current EF4 experimental spectral/residual measurements are not validated origin-directional evidence; Vision Observer descriptions are fallible and nondirectional by themselves; Safety is never origin evidence; unavailable EF3 and EF5 are missing evidence, not support or contradiction.',
  'Current EF2 may describe camera/pipeline/acquisition characteristics, but unless the packet explicitly establishes calibrated directional validity, EF2 MUST NOT support CAMERA_NATIVE or SYNTHETIC or contradict either origin.',
  'Current EF4 measurements are descriptive experimental observations; do not infer origin direction from their values unless the evidence contract explicitly establishes calibrated direction.',
  'Explicitly calibrated directional evidence may and should be used as supporting evidence when applicable; validated directional contradiction may be used as contradictory evidence. These rules do not require always abstaining.',
  'Incorrect: an uncalibrated EF2 proxy looks camera-like, therefore it supports CAMERA_NATIVE. Correct: it is an experimental measurement without validated origin direction and is not supporting evidence.',
  'Positive example: an evidence item explicitly calibrated as directional support for LOCALLY_MANIPULATED may be cited in supportingEvidence for that hypothesis.',
  'Do not include an evidence ID in supportingEvidence or contradictoryEvidence merely because it was measured or observed. Each reference must be directionally eligible for the selected primary hypothesis.',
  'If the packet is PARTIAL and no validated directional origin evidence exists, prefer INSUFFICIENT_EVIDENCE, HIGH or VERY_HIGH uncertainty, and requiresReview true. Do not apply this preference when validated directional evidence supports a bounded conclusion.',
  'HYPOTHESES',
  `primaryHypothesis MUST be exactly one of: ${ORIGIN_HYPOTHESES.join(', ')}.`,
  'Do not create synonyms, abbreviate these values, or return any other hypothesis token.',
  `Every alternativeHypotheses[].hypothesis MUST use exactly the same vocabulary: ${ORIGIN_HYPOTHESES.join(', ')}. Each alternative must include a brief rationale. Prefer genuinely competing alternatives rather than repeating the primary hypothesis.`,
  'CAMERA_NATIVE: Evidence supports native physical-camera acquisition of the visible scene; absence of synthetic evidence alone is insufficient.',
  'SYNTHETIC: Evidence positively supports directly generated/synthetic visual content; weak or absent camera evidence alone is insufficient.',
  'CAMERA_CAPTURE_OF_SYNTHETIC: Evidence supports a physical camera capturing synthetic/digital depicted content, such as a display or printed synthetic image. Camera acquisition and synthetic depicted content can coexist.',
  'DIGITAL_ART_OR_CGI: Evidence supports digital artwork, rendering, or CGI, without sufficient basis to classify it as generative-AI output.',
  'SCREENSHOT_OR_COMPOSITE: Evidence supports screenshot, UI capture, compositing, or other native-digital assembly.',
  'LOCALLY_MANIPULATED: Evidence supports localized alteration of otherwise distinct source content.',
  'INSUFFICIENT_EVIDENCE: Available evidence is insufficient to responsibly rank another origin hypothesis. This is a valid first-class outcome.',
  'OUTPUT CONTRACT',
  'Return JSON only. No Markdown or prose outside JSON. The top-level object must contain exactly the twelve fields in the example. schemaVersion MUST be "1"; requiresReview MUST be a boolean; enforcementAuthority MUST be false.',
  'uncertainty MUST be exactly one of: LOW, MODERATE, HIGH, VERY_HIGH. It describes uncertainty in the assessment, not rhetorical confidence. Do not use MEDIUM, UNKNOWN, CERTAIN, numbers, or percentages.',
  `recommendedAdditionalTests MUST contain only: ${WHITELISTED_ADDITIONAL_TESTS.join(', ')}. Return [] if no additional test is justified. Do not invent test names.`,
  'supportingEvidence and contradictoryEvidence MUST be arrays of {"evidenceId":"<exact ID from packet>","rationale":"<brief rationale>"}. Copy IDs exactly from the packet. Never invent or shorten IDs, omit the real ID from a reference, or reference safety context as origin evidence. Return [] when there is no relevant evidence.',
  'missingEvidence MUST be an array of {"requestId":"short-stable-id","request":"Description of missing evidence","evidenceFamily":null}. Use a valid evidence family instead of null only when known. Missing evidence is a request, never a claim that an unavailable family was observed.',
  'You may request only whitelisted bounded additional tests. REASONED_VISUAL_RECHECK is valid only with a real observationId, category, reasonCode, and optional normalized targetRegion in missingEvidence. Do not emit tool calls or execute tests.',
  'For a recheck, category must match the referenced observation and be eligible under the supplied policy; reasonCode must be allowed for that category. Include optional observation/category/reason/region fields only when valid. Never supply an arbitrary executable prompt.',
  'Select the primary hypothesis from the supplied evidence. Do not copy the example\'s hypothesis unless the evidence warrants it.',
  'EXAMPLE (structure only)',
  '{"schemaVersion":"1","primaryHypothesis":"INSUFFICIENT_EVIDENCE","alternativeHypotheses":[],"supportingEvidence":[],"contradictoryEvidence":[],"missingEvidence":[],"uncertainty":"VERY_HIGH","requiresReview":true,"recommendedAdditionalTests":[],"rationale":"Brief evidence-grounded rationale.","enforcementAuthority":false}',
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

function finishReasonValueCode(value: unknown): JudgeFinishReasonValueCode | null {
  if (typeof value !== 'string') return value === undefined ? null : 'OTHER';
  if (value === 'stop') return 'STOP';
  if (value === 'length') return 'LENGTH';
  if (value === 'tool_calls') return 'TOOL_CALLS';
  return 'OTHER';
}

function createJudgeResponseDiagnostics(value: unknown, transportSucceeded: boolean): JudgeResponseDiagnostics {
  const root = isRecord(value) ? value : null;
  const toolCalls = root && hasOwn(root, 'tool_calls') ? root.tool_calls : root && hasOwn(root, 'toolCalls') ? root.toolCalls : undefined;
  const choices = root && hasOwn(root, 'choices') ? root.choices : undefined;
  const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] : undefined;
  const message = isRecord(firstChoice) && hasOwn(firstChoice, 'message') ? firstChoice.message : undefined;
  const messageToolCalls = isRecord(message) && hasOwn(message, 'tool_calls') ? message.tool_calls : undefined;
  return {
    transportSucceeded,
    providerResultType: providerResultType(value),
    providerEnvelopeClassification: 'UNKNOWN',
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
    toolCallsPresent: Boolean(root && (hasOwn(root, 'tool_calls') || hasOwn(root, 'toolCalls'))) || Boolean(isRecord(message) && hasOwn(message, 'tool_calls')),
    toolCallCount: Array.isArray(messageToolCalls) ? Math.min(messageToolCalls.length, 1000) : Array.isArray(toolCalls) ? Math.min(toolCalls.length, 1000) : null,
    choicesPresent: Boolean(root && hasOwn(root, 'choices')),
    choiceCount: Array.isArray(choices) ? Math.min(choices.length, 1000) : null,
    firstChoiceType: choices === undefined || !Array.isArray(choices) || choices.length === 0 ? null : valueType(firstChoice),
    firstChoiceKeys: safeObjectKeys(firstChoice),
    firstChoiceIndexPresent: Boolean(isRecord(firstChoice) && hasOwn(firstChoice, 'index')),
    firstChoiceIndexType: isRecord(firstChoice) && hasOwn(firstChoice, 'index') ? valueType(firstChoice.index) : null,
    messagePresent: Boolean(isRecord(firstChoice) && hasOwn(firstChoice, 'message')),
    messageType: isRecord(firstChoice) && hasOwn(firstChoice, 'message') ? valueType(firstChoice.message) : null,
    messageKeys: safeObjectKeys(message),
    messageRolePresent: Boolean(isRecord(message) && hasOwn(message, 'role')),
    messageRoleType: isRecord(message) && hasOwn(message, 'role') ? valueType(message.role) : null,
    messageContentPresent: Boolean(isRecord(message) && hasOwn(message, 'content')),
    messageContentType: isRecord(message) && hasOwn(message, 'content') ? valueType(message.content) : null,
    messageContentLength: isRecord(message) && typeof message.content === 'string' ? message.content.length : null,
    messageContentBlockTypes: isRecord(message) && Array.isArray(message.content)
      ? message.content.map((block) => isRecord(block) && typeof block.type === 'string' ? block.type.slice(0, 64) : 'UNKNOWN').slice(0, 32)
      : [],
    finishReasonPresent: Boolean(isRecord(firstChoice) && hasOwn(firstChoice, 'finish_reason')),
    finishReasonType: isRecord(firstChoice) && hasOwn(firstChoice, 'finish_reason') ? valueType(firstChoice.finish_reason) : null,
    finishReasonValueCode: isRecord(firstChoice) && hasOwn(firstChoice, 'finish_reason') ? finishReasonValueCode(firstChoice.finish_reason) : null,
    messageToolCallsPresent: Boolean(isRecord(message) && hasOwn(message, 'tool_calls')),
    messageToolCallCount: Array.isArray(messageToolCalls) ? Math.min(messageToolCalls.length, 1000) : null,
    messageReasoningFieldPresent: Boolean(isRecord(message) && hasOwn(message, 'reasoning')),
    messageReasoningFieldType: isRecord(message) && hasOwn(message, 'reasoning') ? valueType(message.reasoning) : null,
    topLevelReasoningFieldPresent: Boolean(root && hasOwn(root, 'reasoning')),
    topLevelReasoningFieldType: root && hasOwn(root, 'reasoning') ? valueType(root.reasoning) : null,
    messageContentJsonParseable: null,
    messageContentTopLevelKeys: [],
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

function parseJsonSurface(text: string, diagnostics: JudgeResponseDiagnostics, failureCode: 'RESPONSE_STRING_NOT_JSON' | 'MESSAGE_CONTENT_NOT_JSON' = 'RESPONSE_STRING_NOT_JSON', surface: 'response' | 'message' = 'response'): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(normalized);
    if (surface === 'message') {
      diagnostics.messageContentJsonParseable = true;
      if (isRecord(parsed)) diagnostics.messageContentTopLevelKeys = safeObjectKeys(parsed);
    } else {
      diagnostics.stringJsonParseable = true;
      if (isRecord(parsed)) diagnostics.responseTopLevelKeys = safeObjectKeys(parsed);
    }
    return parsed;
  } catch {
    if (surface === 'message') diagnostics.messageContentJsonParseable = false;
    else diagnostics.stringJsonParseable = false;
    throw new JudgeNormalizationError(failureCode);
  }
}

function chatMessageContentText(value: unknown, diagnostics: JudgeResponseDiagnostics): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new JudgeNormalizationError('MESSAGE_CONTENT_TYPE_UNSUPPORTED');
  const textBlocks: string[] = [];
  for (const block of value.slice(0, 32)) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') {
      throw new JudgeNormalizationError('MESSAGE_CONTENT_TYPE_UNSUPPORTED');
    }
    textBlocks.push(block.text.slice(0, 12000));
  }
  if (textBlocks.length === 0) throw new JudgeNormalizationError('MESSAGE_CONTENT_MISSING');
  diagnostics.messageContentLength = textBlocks.reduce((sum, item) => sum + item.length, 0);
  return textBlocks.join('\n');
}

function unwrapJudgeChatCompletion(value: Record<string, unknown>, diagnostics: JudgeResponseDiagnostics): unknown {
  diagnostics.providerEnvelopeClassification = 'CHAT_COMPLETION';
  if (!hasOwn(value, 'choices')) throw new JudgeNormalizationError('CHOICES_MISSING');
  if (!Array.isArray(value.choices)) throw new JudgeNormalizationError('CHOICES_TYPE_UNSUPPORTED');
  if (value.choices.length === 0) throw new JudgeNormalizationError('CHOICES_EMPTY');
  if (value.choices.length !== 1) throw new JudgeNormalizationError('CHOICE_COUNT_INVALID');

  const choice = value.choices[0];
  if (!isRecord(choice)) throw new JudgeNormalizationError('CHOICE_INVALID');
  if (hasOwn(choice, 'index') && choice.index !== 0) throw new JudgeNormalizationError('CHOICE_INVALID');

  if (!hasOwn(choice, 'finish_reason')) throw new JudgeNormalizationError('FINISH_REASON_UNSUPPORTED');
  if (choice.finish_reason === 'length') throw new JudgeNormalizationError('FINISH_REASON_TRUNCATED');
  if (choice.finish_reason !== 'stop') throw new JudgeNormalizationError('FINISH_REASON_UNSUPPORTED');

  if (hasOwn(value, 'tool_calls')) {
    if (!Array.isArray(value.tool_calls) || value.tool_calls.length > 0) throw new JudgeNormalizationError('UNEXPECTED_TOOL_CALL');
  }

  if (!hasOwn(choice, 'message')) throw new JudgeNormalizationError('MESSAGE_MISSING');
  if (!isRecord(choice.message)) throw new JudgeNormalizationError('MESSAGE_INVALID');
  const message = choice.message;
  if (hasOwn(message, 'role') && message.role !== 'assistant') throw new JudgeNormalizationError('MESSAGE_INVALID');
  if (hasOwn(message, 'tool_calls')) {
    if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0) throw new JudgeNormalizationError('UNEXPECTED_TOOL_CALL');
  }
  if (!hasOwn(message, 'content')) throw new JudgeNormalizationError('MESSAGE_CONTENT_MISSING');
  const content = chatMessageContentText(message.content, diagnostics);
  if (!content.trim()) throw new JudgeNormalizationError('MESSAGE_CONTENT_MISSING');
  return parseJsonSurface(content, diagnostics, 'MESSAGE_CONTENT_NOT_JSON', 'message');
}

function unwrapExplicitObject(value: Record<string, unknown>, diagnostics: JudgeResponseDiagnostics): unknown {
  if (value.object === 'chat.completion' || hasOwn(value, 'choices')) return unwrapJudgeChatCompletion(value, diagnostics);
  for (const key of ['response', 'result', 'output_text']) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] === 'string') {
      diagnostics.providerEnvelopeClassification = key === 'response' ? 'RESPONSE_STRING' : key === 'result' ? 'RESULT_STRING' : 'OUTPUT_TEXT_STRING';
      return parseJsonSurface(value[key] as string, diagnostics);
    }
    if (isRecord(value[key])) return unwrapExplicitObject(value[key] as Record<string, unknown>, diagnostics);
    throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
  }
  return value;
}

function unwrapJudgeProviderResult(value: unknown, diagnostics: JudgeResponseDiagnostics): unknown {
  if (typeof value === 'string') {
    diagnostics.providerEnvelopeClassification = 'RESPONSE_STRING';
    return parseJsonSurface(value, diagnostics);
  }
  if (!isRecord(value)) throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
  if (typeof value.primaryHypothesis === 'string') {
    diagnostics.providerEnvelopeClassification = 'DIRECT_CANONICAL';
    return value;
  }
  if (hasOwn(value, 'response')) {
    if (typeof value.response === 'string') {
      diagnostics.providerEnvelopeClassification = 'RESPONSE_STRING';
      return parseJsonSurface(value.response, diagnostics);
    }
    if (isRecord(value.response)) {
      diagnostics.providerEnvelopeClassification = 'RESPONSE_OBJECT';
      diagnostics.responseTopLevelKeys = safeObjectKeys(value.response);
      return unwrapExplicitObject(value.response, diagnostics);
    }
    throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
  }
  for (const key of ['result', 'output_text']) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] === 'string') {
      diagnostics.providerEnvelopeClassification = key === 'result' ? 'RESULT_STRING' : 'OUTPUT_TEXT_STRING';
      return parseJsonSurface(value[key] as string, diagnostics);
    }
    if (isRecord(value[key])) {
      diagnostics.providerEnvelopeClassification = key === 'result' ? 'RESULT_OBJECT' : 'OUTPUT_TEXT_OBJECT';
      if (key === 'result') diagnostics.resultType = 'object';
      if (key === 'output_text') diagnostics.outputTextType = 'object';
      return unwrapExplicitObject(value[key] as Record<string, unknown>, diagnostics);
    }
    throw new JudgeNormalizationError('RESPONSE_TYPE_UNSUPPORTED');
  }
  if (value.object === 'chat.completion' || hasOwn(value, 'choices')) return unwrapJudgeChatCompletion(value, diagnostics);
  throw new JudgeNormalizationError('RESPONSE_MISSING');
}

export function normalizeJudgeProviderResult(value: unknown, packet: EvidencePacket, transportSucceeded = true): { recommendation: JudgeRecommendation; responseDiagnostics: JudgeResponseDiagnostics } {
  const diagnostics = createJudgeResponseDiagnostics(value, transportSucceeded);
  let candidate: unknown;
  try {
    candidate = unwrapJudgeProviderResult(value, diagnostics);
    const recommendation = parseRecommendation(candidate, packet);
    diagnostics.normalizationFailureCode = null;
    return { recommendation, responseDiagnostics: diagnostics };
  } catch (error) {
    const code = error instanceof JudgeNormalizationError ? error.code : 'UNKNOWN_RESPONSE_SHAPE';
    diagnostics.normalizationFailureCode = code;
    if (code === 'PRIMARY_HYPOTHESIS_INVALID' && isRecord(candidate)
      && typeof candidate.primaryHypothesis === 'string'
      && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate.primaryHypothesis)) {
      diagnostics.invalidPrimaryHypothesisToken = candidate.primaryHypothesis;
    }
    throw new JudgeNormalizationError(code, diagnostics);
  }
}

export function classifyJudgeAdapterFailure(code: JudgeNormalizationFailureCode | null): JudgeAdapterFailureClass {
  if (code === null) return 'UNKNOWN';
  if (['CHOICES_MISSING', 'CHOICES_TYPE_UNSUPPORTED', 'CHOICES_EMPTY', 'CHOICE_COUNT_INVALID', 'CHOICE_INVALID', 'MESSAGE_MISSING', 'MESSAGE_INVALID', 'MESSAGE_CONTENT_MISSING', 'RESPONSE_MISSING', 'RESPONSE_TYPE_UNSUPPORTED', 'RESPONSE_OBJECT_UNWRAP_FAILED', 'UNKNOWN_RESPONSE_SHAPE'].includes(code)) return 'PROVIDER_ENVELOPE_UNSUPPORTED';
  if (['MESSAGE_CONTENT_TYPE_UNSUPPORTED'].includes(code)) return 'CONTENT_FIELD_SHAPE_UNSUPPORTED';
  if (['RESPONSE_STRING_NOT_JSON', 'MESSAGE_CONTENT_NOT_JSON'].includes(code)) return 'CONTENT_JSON_EXTRACTION_UNSUPPORTED';
  if (['FINISH_REASON_TRUNCATED', 'FINISH_REASON_UNSUPPORTED'].includes(code)) return 'FINISH_REASON_FAILURE';
  if (code === 'UNEXPECTED_TOOL_CALL') return 'TOOL_CALL_FAILURE';
  if (['SCHEMA_VERSION_INVALID', 'ALTERNATIVES_INVALID', 'SUPPORTING_EVIDENCE_INVALID', 'CONTRADICTORY_EVIDENCE_INVALID', 'MISSING_EVIDENCE_INVALID', 'UNCERTAINTY_INVALID', 'REQUIRES_REVIEW_INVALID', 'ADDITIONAL_TEST_INVALID', 'REASONED_RECHECK_INVALID', 'RATIONALE_INVALID'].includes(code)) return 'CANONICAL_SCHEMA_FAILURE';
  if (['PRIMARY_HYPOTHESIS_INVALID', 'UNKNOWN_EVIDENCE_REFERENCE', 'FORBIDDEN_FIELD_PRESENT', 'ENFORCEMENT_AUTHORITY_INVALID'].includes(code)) return 'MODEL_OUTPUT_CONTRACT_FAILURE';
  return 'UNKNOWN';
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

const JUDGE_JSON_SCHEMA_REQUIRED_FIELDS = [
  'schemaVersion',
  'primaryHypothesis',
  'alternativeHypotheses',
  'supportingEvidence',
  'contradictoryEvidence',
  'missingEvidence',
  'uncertainty',
  'requiresReview',
  'recommendedAdditionalTests',
  'rationale',
  'enforcementAuthority',
] as const;

function jsonSchemaString(maxLength: number): Record<string, unknown> {
  return { type: 'string', maxLength };
}

function jsonSchemaEnum(values: readonly string[]): Record<string, unknown> {
  return { type: 'string', enum: [...values] };
}

function jsonSchemaTargetRegion(): Record<string, unknown> {
  return {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['coordinateSpace', 'x', 'y', 'width', 'height'],
        properties: {
          coordinateSpace: { const: 'NORMALIZED' },
          x: { type: 'number', minimum: 0, maximum: 1 },
          y: { type: 'number', minimum: 0, maximum: 1 },
          width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
          height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
          label: jsonSchemaString(120),
        },
      },
      { type: 'null' },
    ],
  };
}

function jsonSchemaEvidenceReferences(referenceIds: readonly string[]): Record<string, unknown> {
  if (referenceIds.length === 0) return { type: 'array', maxItems: 0 };
  return {
    type: 'array',
    maxItems: 20,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['evidenceId', 'rationale'],
      properties: {
        evidenceId: { ...jsonSchemaString(200), enum: [...referenceIds] },
        rationale: jsonSchemaString(1200),
      },
    },
  };
}

function jsonSchemaMissingEvidence(observationIds: readonly string[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    requestId: jsonSchemaString(120),
    request: jsonSchemaString(1200),
    evidenceFamily: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    category: jsonSchemaEnum(VISION_OBSERVER_CATEGORIES),
    reasonCode: jsonSchemaEnum(VISION_ESCALATION_REASONS),
    targetRegion: jsonSchemaTargetRegion(),
  };
  if (observationIds.length > 0) properties.observationId = { ...jsonSchemaString(200), enum: [...observationIds] };
  return {
    type: 'array',
    maxItems: 12,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'request', 'evidenceFamily'],
      properties,
    },
  };
}

export function buildJudgeJsonSchema(packet: EvidencePacket): JudgeJsonSchema {
  assertEvidencePacket(packet);
  const safetyContextId = packet.safetyContext.contextId;
  const referenceIds = [...packetReferenceIds(packet)]
    .filter((evidenceId) => evidenceId !== safetyContextId)
    .sort();
  const observationIds = [...new Set([
    ...packet.observations.map((observation) => observation.observationId),
    ...packet.observationHistory.map((observation) => observation.observationId),
  ])]
    .filter((observationId) => observationId !== safetyContextId)
    .sort();
  return {
    $id: JUDGE_JSON_SCHEMA_VERSION,
    type: 'object',
    additionalProperties: false,
    required: [...JUDGE_JSON_SCHEMA_REQUIRED_FIELDS],
    properties: {
      schemaVersion: { const: JUDGE_RECOMMENDATION_SCHEMA_VERSION },
      primaryHypothesis: jsonSchemaEnum(ORIGIN_HYPOTHESES),
      alternativeHypotheses: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['hypothesis', 'rationale'],
          properties: {
            hypothesis: jsonSchemaEnum(ORIGIN_HYPOTHESES),
            rationale: jsonSchemaString(1200),
          },
        },
      },
      supportingEvidence: jsonSchemaEvidenceReferences(referenceIds),
      contradictoryEvidence: jsonSchemaEvidenceReferences(referenceIds),
      missingEvidence: jsonSchemaMissingEvidence(observationIds),
      uncertainty: jsonSchemaEnum(['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']),
      requiresReview: { type: 'boolean' },
      recommendedAdditionalTests: {
        type: 'array',
        maxItems: 8,
        items: jsonSchemaEnum(WHITELISTED_ADDITIONAL_TESTS),
      },
      rationale: jsonSchemaString(2400),
      enforcementAuthority: { const: false },
    },
  };
}

export function buildJudgeRequest(packet: EvidencePacket, options: JudgeRequestOptions = {}): JudgeRequest {
  assertEvidencePacket(packet);
  if (forbiddenDeep(packet)) throw new Error('judge_input_forbidden_data');
  const structuredOutputMode = options.structuredOutputMode ?? 'JSON_OBJECT';
  if (!(JUDGE_STRUCTURED_OUTPUT_MODES as readonly string[]).includes(structuredOutputMode)) throw new Error('judge_structured_output_mode_invalid');
  return {
    messages: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(packet) },
    ],
    response_format: structuredOutputMode === 'JSON_SCHEMA'
      ? { type: 'json_schema', json_schema: buildJudgeJsonSchema(packet) }
      : { type: 'json_object' },
    temperature: 0,
    max_tokens: JUDGE_MAX_OUTPUT_TOKENS,
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

export function createCloudflareJudge(options: { ai: CloudflareAiRunOptions; model?: string; timeoutMs?: number; structuredOutputMode?: JudgeStructuredOutputMode }): Judge & { isLive: true } {
  const provider = 'cloudflare-workers-ai';
  const model = options.model ?? CLOUDFLARE_REASONER_MODEL;
  return {
    isLive: true,
    async judge(input): Promise<JudgeResult> {
      const startedAt = Date.now();
      try {
        const request = buildJudgeRequest(input.packet, { structuredOutputMode: options.structuredOutputMode });
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

export function createCloudflareJudgeRest(options: { transport: CloudflareRestTransport; model?: string; structuredOutputMode?: JudgeStructuredOutputMode }): Judge & { isLive: true } {
  const provider = 'cloudflare-workers-ai-rest';
  const model = options.model ?? CLOUDFLARE_REASONER_MODEL;
  return {
    isLive: true,
    async judge(input): Promise<JudgeResult> {
      const startedAt = Date.now();
      let httpStatus: number | null = null;
      try {
        const request = buildJudgeRequest(input.packet, { structuredOutputMode: options.structuredOutputMode });
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
