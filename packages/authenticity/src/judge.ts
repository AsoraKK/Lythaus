import { assertEvidencePacket, assertEvidenceReferenceIds, type EvidencePacket } from './evidence-packet.ts';
import { CLOUDFLARE_REASONER_MODEL } from './research-config.ts';
import type { CloudflareAiRunOptions } from './vision-observer.ts';

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
  'Do not output numeric confidence, AI probability, human probability, enforcement actions, or a final product decision.',
  'You may request only whitelisted bounded additional tests. Do not emit tool calls or execute tests.',
  'Return JSON only with schemaVersion "1", primaryHypothesis, alternativeHypotheses, supportingEvidence, contradictoryEvidence, missingEvidence, uncertainty, requiresReview, recommendedAdditionalTests, rationale, and enforcementAuthority false.',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function modelText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  for (const key of ['response', 'result', 'output_text']) if (typeof value[key] === 'string') return value[key] as string;
  return '';
}

function parseJson(value: unknown): unknown {
  if (isRecord(value) && typeof value.primaryHypothesis === 'string') return value;
  const text = modelText(value).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function forbiddenDeep(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(forbiddenDeep);
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (['groundTruth', 'truth', 'aiProbability', 'humanProbability', 'rawImage', 'imageBytes', 'base64'].includes(key)) return true;
    if (forbiddenDeep(value[key])) return true;
  }
  return false;
}

function stringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value.map((item) => item.slice(0, 1200)).slice(0, max);
}

function parseReferences(value: unknown, packet: EvidencePacket): EvidenceReference[] | null {
  if (!Array.isArray(value)) return null;
  const references = value.slice(0, 20).map((item) => {
    if (!isRecord(item) || typeof item.evidenceId !== 'string' || typeof item.rationale !== 'string') return null;
    return { evidenceId: item.evidenceId.slice(0, 200), rationale: item.rationale.slice(0, 1200) };
  });
  if (references.some((item) => item === null)) return null;
  const result = references as EvidenceReference[];
  assertEvidenceReferenceIds(packet, result.map((item) => item.evidenceId));
  return result;
}

function parseRecommendation(value: unknown, packet: EvidencePacket): JudgeRecommendation {
  if (!isRecord(value)) throw new Error('judge_response_schema_invalid');
  if (value.schemaVersion !== JUDGE_RECOMMENDATION_SCHEMA_VERSION) throw new Error('judge_response_schema_version_invalid');
  for (const forbidden of ['aiProbability', 'humanProbability', 'numericConfidence']) if (Object.prototype.hasOwnProperty.call(value, forbidden)) throw new Error('judge_numeric_origin_confidence_forbidden');
  if (value.enforcementAuthority !== false) throw new Error('judge_enforcement_authority_invalid');
  if (!(ORIGIN_HYPOTHESES as readonly string[]).includes(String(value.primaryHypothesis))) throw new Error('judge_primary_hypothesis_invalid');
  if (!Array.isArray(value.alternativeHypotheses)) throw new Error('judge_alternatives_invalid');
  const alternatives = value.alternativeHypotheses.slice(0, 6).map((item) => {
    if (!isRecord(item) || !(ORIGIN_HYPOTHESES as readonly string[]).includes(String(item.hypothesis)) || typeof item.rationale !== 'string') return null;
    return { hypothesis: item.hypothesis as OriginHypothesis, rationale: item.rationale.slice(0, 1200) };
  });
  if (alternatives.some((item) => item === null)) throw new Error('judge_alternatives_invalid');
  const supportingEvidence = parseReferences(value.supportingEvidence, packet);
  const contradictoryEvidence = parseReferences(value.contradictoryEvidence, packet);
  if (!supportingEvidence || !contradictoryEvidence) throw new Error('judge_evidence_references_invalid');
  if (!Array.isArray(value.missingEvidence)) throw new Error('judge_missing_evidence_invalid');
  const missingEvidence = value.missingEvidence.slice(0, 12).map((item) => {
    if (!isRecord(item) || typeof item.requestId !== 'string' || typeof item.request !== 'string' || (item.evidenceFamily !== null && typeof item.evidenceFamily !== 'string')) return null;
    return { requestId: item.requestId.slice(0, 120), request: item.request.slice(0, 1200), evidenceFamily: item.evidenceFamily as string | null };
  });
  if (missingEvidence.some((item) => item === null)) throw new Error('judge_missing_evidence_invalid');
  const uncertainty = value.uncertainty;
  if (!['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'].includes(String(uncertainty))) throw new Error('judge_uncertainty_invalid');
  if (typeof value.requiresReview !== 'boolean' || typeof value.rationale !== 'string') throw new Error('judge_recommendation_fields_invalid');
  const additional = stringList(value.recommendedAdditionalTests, 8);
  if (!additional || additional.some((item) => !(WHITELISTED_ADDITIONAL_TESTS as readonly string[]).includes(item))) throw new Error('judge_additional_test_not_whitelisted');
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

function failedJudgeResult(provider: string, model: string, errorCategory: JudgeErrorCategory, executionMs: number): JudgeResult {
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
          const parsed = parseJson(raw);
          const recommendation = parseRecommendation(parsed, input.packet);
          return { schemaVersion: JUDGE_RESULT_SCHEMA_VERSION, promptVersion: JUDGE_PROMPT_VERSION, prompt: JUDGE_SYSTEM_PROMPT, provider, model, status: 'SUCCESS', recommendation, executionMs: Date.now() - startedAt };
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const category: JudgeErrorCategory = message === 'judge_timeout'
          ? 'TIMEOUT'
          : message.startsWith('judge_') || message === 'evidence_packet_schema_invalid' ? 'UNEXPECTED_SCHEMA' : 'NETWORK_FAILURE';
        return failedJudgeResult(provider, model, category, Date.now() - startedAt);
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
