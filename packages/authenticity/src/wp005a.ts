import { CloudflareRestError, type CloudflareRestTransport } from './cloudflare-rest.ts';
import { assertEvidencePacket, assertSafetyIsolation, buildEvidencePacket, type EvidencePacket, type PacketEvidence } from './evidence-packet.ts';
import type { EvidenceFamily, JsonValue } from './contracts.ts';
import {
  assertJudgeRecommendation,
  createInsufficientEvidenceRecommendation,
  normalizeJudgeProviderResult,
  ORIGIN_HYPOTHESES,
  type JudgeRecommendation,
  type OriginHypothesis,
} from './judge.ts';
import {
  buildEvidenceDirectionPolicy,
  evaluateJudgeEpistemics,
  JUDGE_EPISTEMIC_POLICY_VERSION,
  type EvidenceDirectionClassification,
  type EpistemicDirection,
} from './judge-epistemic-evaluator.ts';
import { createWp004bAdversarialCases } from './wp004b.ts';

export const WP005A_SCHEMA_VERSION = 'lythaus-wp005a-architecture-tournament-v1' as const;
export const WP005A_RESEARCH_DATE = '2026-09-12' as const;
export const WP005A_JUDGE_PROMPT_VERSION = 'lythaus-research-adjudicator-prompt-v1' as const;
export const WP005A_LEDGER_SCHEMA_VERSION = 'lythaus-evidence-ledger-v1' as const;
export const WP005A_ROUTING_POLICY_VERSION = 'lythaus-wp005a-routing-policy-v1' as const;
export const WP005A_MAX_LIVE_WORKERS_AI_REQUESTS = 80 as const;
export const WP005A_MAX_ESTIMATED_NEURONS = 7500 as const;
export const WP005A_MAX_ESTIMATED_COST_USD = 0.15 as const;
export const WP005A_JUDGE_MAX_OUTPUT_TOKENS = 2400 as const;

export type Wp005aCandidateFamily = 'JUDGE' | 'OBSERVER' | 'UNIFIED_MULTIMODAL';
export type Wp005aCandidateStatus = 'LIVE_CANDIDATE' | 'RESEARCH_ORACLE' | 'DESK_RESEARCH_ONLY';

export interface Wp005aModelCandidate {
  candidate: string;
  family: Wp005aCandidateFamily;
  model: string;
  status: Wp005aCandidateStatus;
  liveEligible: boolean;
  contextWindow: number | null;
  capabilities: readonly string[];
  inputPricePerMillionUsd: number | null;
  outputPricePerMillionUsd: number | null;
  inputNeuronsPerMillion: number | null;
  outputNeuronsPerMillion: number | null;
  evidenceContribution: string;
  independenceRisk: string;
  sourceUrl: string;
  notes: readonly string[];
}

const CANDIDATES: readonly Wp005aModelCandidate[] = [
  {
    candidate: 'gpt-oss-20b', family: 'JUDGE', model: '@cf/openai/gpt-oss-20b', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 128000, capabilities: ['text', 'reasoning', 'json_object'], inputPricePerMillionUsd: 0.20, outputPricePerMillionUsd: 0.30,
    inputNeuronsPerMillion: 18182, outputNeuronsPerMillion: 27273,
    evidenceContribution: 'Evidence synthesis and contract-following reasoner; not a forensic sensor.',
    independenceRisk: 'High correlation with other language judges; no new image evidence.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/',
    notes: ['Historical WP004B JSON_OBJECT evidence exists.', 'Retained as baseline but not assumed primary.'],
  },
  {
    candidate: 'qwen3-30b-a3b-fp8', family: 'JUDGE', model: '@cf/qwen/qwen3-30b-a3b-fp8', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 32768, capabilities: ['text', 'reasoning', 'function_calling', 'json_object'], inputPricePerMillionUsd: 0.051, outputPricePerMillionUsd: 0.335,
    inputNeuronsPerMillion: 4625, outputNeuronsPerMillion: 30475,
    evidenceContribution: 'Alternative text reasoner for evidence adjudication.',
    independenceRisk: 'Reasoning diversity only; no independent visual or forensic measurement.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/',
    notes: ['Low published input price; output price and context remain operational constraints.'],
  },
  {
    candidate: 'glm-4.7-flash', family: 'JUDGE', model: '@cf/zai-org/glm-4.7-flash', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 131072, capabilities: ['text', 'reasoning', 'function_calling', 'json_object', 'reasoning_effort'], inputPricePerMillionUsd: 0.06, outputPricePerMillionUsd: 0.40,
    inputNeuronsPerMillion: 5500, outputNeuronsPerMillion: 36400,
    evidenceContribution: 'Fast alternative text reasoner for adjudication.',
    independenceRisk: 'Reasoning diversity only; no independent visual or forensic measurement.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/',
    notes: ['Current catalog candidate; research must measure actual structured-output reliability.'],
  },
  {
    candidate: 'llama-3.3-70b-instruct-fp8-fast', family: 'JUDGE', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 24000, capabilities: ['text', 'function_calling', 'json_object'], inputPricePerMillionUsd: 0.29, outputPricePerMillionUsd: 2.25,
    inputNeuronsPerMillion: 26364, outputNeuronsPerMillion: 204545,
    evidenceContribution: 'Higher-capacity text adjudication control.',
    independenceRisk: 'Reasoning diversity only; no independent visual or forensic measurement.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/',
    notes: ['Published fast variant remains active in the current catalog.'],
  },
  {
    candidate: 'gemma-4-26b-a4b-it', family: 'UNIFIED_MULTIMODAL', model: '@cf/google/gemma-4-26b-a4b-it', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 256000, capabilities: ['text', 'vision', 'reasoning', 'function_calling', 'json_object'], inputPricePerMillionUsd: 0.10, outputPricePerMillionUsd: 0.30,
    inputNeuronsPerMillion: 9091, outputNeuronsPerMillion: 27273,
    evidenceContribution: 'Potential unified visual observer and bounded ambiguity reasoner.',
    independenceRisk: 'Semantic visual signal may duplicate a VLM Observer; not a calibrated forensic detector.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/',
    notes: ['Research challenger only; it cannot bypass deterministic forensics.'],
  },
  {
    candidate: 'qwen3.8-27b', family: 'UNIFIED_MULTIMODAL', model: '@cf/qwen/qwen3.8-27b', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 262144, capabilities: ['text', 'vision', 'reasoning', 'function_calling', 'json_object'], inputPricePerMillionUsd: 0.45, outputPricePerMillionUsd: 3.20,
    inputNeuronsPerMillion: 40909, outputNeuronsPerMillion: 290909,
    evidenceContribution: 'Potential single-call visual observation plus ambiguity adjudication.',
    independenceRisk: 'Semantic multimodal signal; does not replace EF2/EF3/EF5 calibration.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/',
    notes: ['Launched in the current research window; expensive output and unknown Lythaus task fit.'],
  },
  {
    candidate: 'gpt-oss-120b', family: 'JUDGE', model: '@cf/openai/gpt-oss-120b', status: 'RESEARCH_ORACLE', liveEligible: false,
    contextWindow: 128000, capabilities: ['text', 'reasoning', 'function_calling', 'json_object'], inputPricePerMillionUsd: 0.35, outputPricePerMillionUsd: 0.75,
    inputNeuronsPerMillion: 31818, outputNeuronsPerMillion: 68182,
    evidenceContribution: 'Potential accuracy-ceiling text reasoner.',
    independenceRisk: 'No new forensic evidence; high resource and latency risk.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/',
    notes: ['Not live-tested because the bounded free-neuron experiment cannot safely establish a useful sample.'],
  },
  {
    candidate: 'moondream3.1-9B-A2B', family: 'OBSERVER', model: '@cf/moondream/moondream3.1-9B-A2B', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: null, capabilities: ['vision', 'query', 'caption', 'point', 'detect', 'json_object'], inputPricePerMillionUsd: 0.30, outputPricePerMillionUsd: 1.00,
    inputNeuronsPerMillion: 27273, outputNeuronsPerMillion: 90909,
    evidenceContribution: 'Bounded scene, OCR, geometry, localization, display, and anomaly observations.',
    independenceRisk: 'Visual semantic observer; observation is nondirectional without calibration.',
    sourceUrl: 'https://developers.cloudflare.com/ai/models/%40cf/moondream/moondream3.1-9B-A2B/',
    notes: ['Current Lythaus Observer baseline.', 'Raw reasoning remains excluded from canonical evidence.'],
  },
  {
    candidate: 'llama-4-scout-17b-16e-instruct', family: 'OBSERVER', model: '@cf/meta/llama-4-scout-17b-16e-instruct', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: 131072, capabilities: ['vision', 'text', 'function_calling', 'json_object'], inputPricePerMillionUsd: 0.27, outputPricePerMillionUsd: 0.85,
    inputNeuronsPerMillion: 24545, outputNeuronsPerMillion: 77273,
    evidenceContribution: 'Strong multimodal observation challenger.',
    independenceRisk: 'Semantic VLM signal may be correlated with other VLM observers.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/',
    notes: ['Research challenger; no authenticity verdict is accepted from it.'],
  },
  {
    candidate: 'llama-3.2-11b-vision-instruct', family: 'OBSERVER', model: '@cf/meta/llama-3.2-11b-vision-instruct', status: 'LIVE_CANDIDATE', liveEligible: true,
    contextWindow: null, capabilities: ['vision', 'text', 'json_object'], inputPricePerMillionUsd: 0.049, outputPricePerMillionUsd: 0.676,
    inputNeuronsPerMillion: 4455, outputNeuronsPerMillion: 61455,
    evidenceContribution: 'Lower-cost multimodal observation control.',
    independenceRisk: 'Semantic VLM signal; may duplicate Moondream scene descriptions.',
    sourceUrl: 'https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/',
    notes: ['Useful price/latency control if current access remains available.'],
  },
];

export function getWp005aCandidateRegistry(): readonly Wp005aModelCandidate[] {
  return CANDIDATES.map((candidate) => ({ ...candidate, capabilities: [...candidate.capabilities], notes: [...candidate.notes] }));
}

export const WP005A_RESEARCH_JUDGE_SYSTEM_PROMPT = [
  'ROLE',
  `You are the Lythaus Research Adjudicator for ${WP005A_SCHEMA_VERSION}. Prompt: ${WP005A_JUDGE_PROMPT_VERSION}.`,
  'Adjudicate the supplied Evidence Packet or deterministic Evidence Ledger. You are advisory research infrastructure, not a product policy engine.',
  'EVIDENCE DISCIPLINE',
  'Keep physical-camera acquisition and depicted synthetic content as independent origin axes. A photograph of a synthetic display may support both axes. Weak camera evidence is not synthetic evidence. Absence of synthetic evidence is not camera-native evidence.',
  'Safety is SAFETY_CONTEXT_ONLY. Never use safety categories, scores, flags, or ALLOW/REVIEW/BLOCK as authenticity-origin evidence.',
  'Metadata and file format are descriptive unless the supplied evidence explicitly establishes calibrated direction. Current EF2 and EF4 experimental measurements are unvalidated unless the supplied policy marks them CALIBRATED_DIRECTIONAL.',
  'Unavailable evidence is missing, not negative. Vision observations are fallible observations, not ground truth or authenticity probabilities.',
  'Use supportingEvidence and contradictoryEvidence only for exact supplied IDs whose deterministic policy direction is SUPPORTS or CONTRADICTS for the selected hypothesis. Do not invent IDs. Absence of support is not contradiction.',
  'When no calibrated directional evidence exists, prefer INSUFFICIENT_EVIDENCE, HIGH or VERY_HIGH uncertainty, and requiresReview true. Explicitly calibrated directional evidence may support a bounded hypothesis. Conflicting calibrated evidence requires explicit contradiction handling and review.',
  'Return only a concise rationale. Never return hidden reasoning, a scratchpad, chain-of-thought, numeric confidence, probabilities, enforcement actions, or product decisions.',
  'OUTPUT CONTRACT',
  `Return JSON only with exactly the canonical recommendation fields. primaryHypothesis and alternatives must use: ${ORIGIN_HYPOTHESES.join(', ')}. uncertainty must use LOW, MODERATE, HIGH, or VERY_HIGH. enforcementAuthority must be false. supportingEvidence, contradictoryEvidence, and missingEvidence must be arrays. recommendedAdditionalTests must use only the bounded tests named by the canonical contract.`,
  'The input contains no ground truth. Do not request, infer, or emit benchmark expectations.',
].join('\n');

export interface Wp005aJudgeRequest {
  readonly messages: readonly { role: 'system' | 'user'; content: string }[];
  readonly response_format: { readonly type: 'json_object' };
  readonly temperature: 0;
  readonly max_tokens: typeof WP005A_JUDGE_MAX_OUTPUT_TOKENS;
  readonly stream: false;
}

const FORBIDDEN_RESEARCH_INPUT_KEYS = new Set([
  'groundTruth', 'truth', 'expectedPrimary', 'caseExpectation', 'expectedUncertainty', 'passCriteria', 'benchmarkDirectionLabels',
  'rawReasoning', 'reasoningTrace', 'chainOfThought', 'thinking', 'imageBytes', 'base64',
]);

function assertNoForbiddenResearchInput(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) assertNoForbiddenResearchInput(item); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESEARCH_INPUT_KEYS.has(key)) throw new Error(`wp005a_forbidden_input_field:${key}`);
    assertNoForbiddenResearchInput(child);
  }
}

export function buildWp005aJudgeRequest(input: EvidencePacket | EvidenceLedger): Wp005aJudgeRequest {
  if (isEvidenceLedger(input)) assertEvidenceLedger(input);
  else assertEvidencePacket(input);
  assertNoForbiddenResearchInput(input);
  return {
    messages: [
      { role: 'system', content: WP005A_RESEARCH_JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: WP005A_JUDGE_MAX_OUTPUT_TOKENS,
    stream: false,
  };
}

export type EvidenceLedgerValidationStatus = 'NONDISCRIMINATIVE' | 'UNCALIBRATED' | 'CALIBRATED_DIRECTIONAL';

export interface EvidenceLedgerEntry {
  evidenceId: string;
  family: EvidenceFamily | 'VISION_OBSERVATION';
  summary: string;
  applicability: string;
  quality: string;
  validationStatus: EvidenceLedgerValidationStatus;
  directionalRole: EpistemicDirection;
  supportedHypotheses: readonly OriginHypothesis[];
  contradictedHypotheses: readonly OriginHypothesis[];
  limitations: readonly string[];
}

export interface EvidenceLedgerObservation {
  observationId: string;
  category: string;
  status: string;
  summary: string;
  directionalRole: 'NEUTRAL';
  limitations: readonly string[];
}

export interface EvidenceLedger {
  schemaVersion: typeof WP005A_LEDGER_SCHEMA_VERSION;
  policyVersion: typeof JUDGE_EPISTEMIC_POLICY_VERSION;
  packetId: string;
  quality: {
    overall: string;
    missingEvidenceFamilies: readonly string[];
    contradictoryEvidenceIds: readonly string[];
    contradictoryObservationIds: readonly string[];
  };
  independentOriginAxes: {
    cameraEvidence: string;
    syntheticEvidence: string;
    relationship: 'INDEPENDENT_AXES';
  };
  safetyContext: {
    role: 'SAFETY_CONTEXT_ONLY';
    canonicalResult: string;
    excludedFromOriginInference: true;
  };
  evidence: readonly EvidenceLedgerEntry[];
  observations: readonly EvidenceLedgerObservation[];
  missingEvidence: readonly { family: string; status: string; limitations: readonly string[] }[];
  enforcementAuthority: false;
}

function isEvidenceLedger(value: EvidencePacket | EvidenceLedger): value is EvidenceLedger {
  return Boolean(value && typeof value === 'object' && (value as { schemaVersion?: unknown }).schemaVersion === WP005A_LEDGER_SCHEMA_VERSION);
}

function valueSummary(value: JsonValue): string {
  let serialized = '';
  try { serialized = JSON.stringify(value); } catch { serialized = '[unserializable]'; }
  return serialized.length > 360 ? `${serialized.slice(0, 357)}...` : serialized;
}

function directionalRole(classification: EvidenceDirectionClassification): EpistemicDirection {
  const roles = Object.values(classification.directionByHypothesis);
  if (roles.includes('SUPPORTS')) return 'SUPPORTS';
  if (roles.includes('CONTRADICTS')) return 'CONTRADICTS';
  if (roles.includes('UNVALIDATED')) return 'UNVALIDATED';
  return 'NEUTRAL';
}

function ledgerEntry(item: PacketEvidence, classification: EvidenceDirectionClassification): EvidenceLedgerEntry {
  return {
    evidenceId: item.evidenceId,
    family: classification.family,
    summary: `${item.name}: ${valueSummary(item.value)}`,
    applicability: item.provenance.applicable,
    quality: item.quality,
    validationStatus: classification.calibrationStatus,
    directionalRole: directionalRole(classification),
    supportedHypotheses: ORIGIN_HYPOTHESES.filter((hypothesis) => classification.directionByHypothesis[hypothesis] === 'SUPPORTS'),
    contradictedHypotheses: ORIGIN_HYPOTHESES.filter((hypothesis) => classification.directionByHypothesis[hypothesis] === 'CONTRADICTS'),
    limitations: [...item.provenance.limitations],
  };
}

export function compileEpistemicLedger(packet: EvidencePacket): EvidenceLedger {
  assertEvidencePacket(packet);
  assertSafetyIsolation(packet);
  const policy = buildEvidenceDirectionPolicy(packet);
  const policyById = new Map(policy.map((item) => [item.evidenceId, item]));
  const evidence = packet.evidence.map((item) => ledgerEntry(item, policyById.get(item.evidenceId) as EvidenceDirectionClassification));
  const observations = [...packet.observations, ...packet.observationHistory]
    .filter((observation, index, all) => all.findIndex((candidate) => candidate.observationId === observation.observationId) === index)
    .map((observation) => ({
      observationId: observation.observationId,
      category: observation.category,
      status: observation.status,
      summary: observation.observation.slice(0, 360),
      directionalRole: 'NEUTRAL' as const,
      limitations: [...observation.limitations],
    }));
  const missingEvidence = Object.values(packet.evidenceFamilies)
    .filter((family) => ['UNAVAILABLE', 'FAILED', 'NOT_APPLICABLE', 'INDETERMINATE'].includes(family.status))
    .map((family) => ({ family: family.family, status: family.status, limitations: [...family.limitations] }));
  const ledger: EvidenceLedger = {
    schemaVersion: WP005A_LEDGER_SCHEMA_VERSION,
    policyVersion: JUDGE_EPISTEMIC_POLICY_VERSION,
    packetId: packet.packetId,
    quality: {
      overall: packet.quality.overall,
      missingEvidenceFamilies: [...packet.quality.missingEvidenceFamilies],
      contradictoryEvidenceIds: [...packet.quality.contradictoryEvidenceIds],
      contradictoryObservationIds: [...packet.quality.contradictoryObservationIds],
    },
    independentOriginAxes: { ...packet.originAxes, relationship: 'INDEPENDENT_AXES' },
    safetyContext: { role: 'SAFETY_CONTEXT_ONLY', canonicalResult: packet.safetyContext.canonicalResult, excludedFromOriginInference: true },
    evidence,
    observations,
    missingEvidence,
    enforcementAuthority: false,
  };
  assertEvidenceLedger(ledger);
  return ledger;
}

export function assertEvidenceLedger(ledger: EvidenceLedger): void {
  if (ledger.schemaVersion !== WP005A_LEDGER_SCHEMA_VERSION) throw new Error('wp005a_ledger_schema_invalid');
  if (ledger.policyVersion !== JUDGE_EPISTEMIC_POLICY_VERSION) throw new Error('wp005a_ledger_policy_invalid');
  if (ledger.enforcementAuthority !== false) throw new Error('wp005a_ledger_enforcement_authority_invalid');
  if (ledger.safetyContext.role !== 'SAFETY_CONTEXT_ONLY' || ledger.safetyContext.excludedFromOriginInference !== true) throw new Error('wp005a_ledger_safety_isolation_invalid');
  const ids = new Set<string>();
  for (const item of ledger.evidence) {
    if (ids.has(item.evidenceId)) throw new Error('wp005a_ledger_duplicate_evidence_id');
    ids.add(item.evidenceId);
  }
  for (const item of ledger.observations) {
    if (ids.has(item.observationId)) throw new Error('wp005a_ledger_duplicate_observation_id');
    ids.add(item.observationId);
  }
  assertNoForbiddenResearchInput(ledger);
}

export type Wp005aRoutingPolicy = 'CONSERVATIVE_GATE' | 'SELECTIVE_RESOLUTION_GATE';
export type Wp005aRoute = 'DETERMINISTIC' | 'ESCALATE';

export interface Wp005aRoutingResult {
  schemaVersion: typeof WP005A_ROUTING_POLICY_VERSION;
  policy: Wp005aRoutingPolicy;
  route: Wp005aRoute;
  deterministic: boolean;
  recommendation: JudgeRecommendation;
  directionalEvidenceIds: readonly string[];
  supportedHypotheses: readonly OriginHypothesis[];
  contradictedHypotheses: readonly OriginHypothesis[];
  reasonCodes: readonly string[];
}

function directionalEvidence(packet: EvidencePacket): {
  policy: readonly EvidenceDirectionClassification[];
  directionalIds: string[];
  supportedHypotheses: OriginHypothesis[];
  contradictedHypotheses: OriginHypothesis[];
} {
  const policy = buildEvidenceDirectionPolicy(packet);
  const directional = policy.filter((item) => Object.values(item.directionByHypothesis).some((direction) => direction === 'SUPPORTS' || direction === 'CONTRADICTS'));
  const supported = new Set<OriginHypothesis>();
  const contradicted = new Set<OriginHypothesis>();
  for (const item of directional) {
    for (const hypothesis of ORIGIN_HYPOTHESES) {
      if (item.directionByHypothesis[hypothesis] === 'SUPPORTS') supported.add(hypothesis);
      if (item.directionByHypothesis[hypothesis] === 'CONTRADICTS') contradicted.add(hypothesis);
    }
  }
  return { policy, directionalIds: directional.map((item) => item.evidenceId), supportedHypotheses: [...supported], contradictedHypotheses: [...contradicted] };
}

function boundedRecommendation(packet: EvidencePacket, hypothesis: OriginHypothesis, evidenceIds: readonly string[]): JudgeRecommendation {
  const recommendation: JudgeRecommendation = {
    schemaVersion: '1',
    primaryHypothesis: hypothesis,
    alternativeHypotheses: [],
    supportingEvidence: evidenceIds.map((evidenceId) => ({ evidenceId, rationale: 'The deterministic epistemic policy marks this evidence as calibrated directional support for the bounded research hypothesis.' })),
    contradictoryEvidence: [],
    missingEvidence: [],
    uncertainty: packet.quality.overall === 'AVAILABLE' ? 'MODERATE' : 'HIGH',
    requiresReview: packet.quality.overall !== 'AVAILABLE',
    recommendedAdditionalTests: [],
    rationale: 'A deterministic research gate found one calibrated supported hypothesis and no calibrated contradiction. This is advisory and not a product enforcement decision.',
    enforcementAuthority: false,
  };
  assertJudgeRecommendation(recommendation, packet);
  return recommendation;
}

export function applyWp005aRoutingGate(packet: EvidencePacket, policy: Wp005aRoutingPolicy): Wp005aRoutingResult {
  assertEvidencePacket(packet);
  const directions = directionalEvidence(packet);
  if (directions.directionalIds.length === 0) {
    return {
      schemaVersion: WP005A_ROUTING_POLICY_VERSION, policy, route: 'DETERMINISTIC', deterministic: true,
      recommendation: createInsufficientEvidenceRecommendation('No validated directional evidence is available; the deterministic gate abstains.'),
      directionalEvidenceIds: [], supportedHypotheses: [], contradictedHypotheses: [], reasonCodes: ['NO_VALIDATED_DIRECTIONAL_EVIDENCE'],
    };
  }
  if (policy === 'SELECTIVE_RESOLUTION_GATE'
    && directions.supportedHypotheses.length === 1
    && directions.contradictedHypotheses.length === 0
    && packet.quality.contradictoryEvidenceIds.length === 0
    && packet.quality.contradictoryObservationIds.length === 0) {
    const hypothesis = directions.supportedHypotheses[0];
    return {
      schemaVersion: WP005A_ROUTING_POLICY_VERSION, policy, route: 'DETERMINISTIC', deterministic: true,
      recommendation: boundedRecommendation(packet, hypothesis, directions.policy.filter((item) => item.directionByHypothesis[hypothesis] === 'SUPPORTS').map((item) => item.evidenceId)),
      directionalEvidenceIds: directions.directionalIds, supportedHypotheses: directions.supportedHypotheses, contradictedHypotheses: directions.contradictedHypotheses,
      reasonCodes: ['ONE_CALIBRATED_SUPPORTED_HYPOTHESIS', 'NO_CALIBRATED_CONTRADICTION'],
    };
  }
  return {
    schemaVersion: WP005A_ROUTING_POLICY_VERSION, policy, route: 'ESCALATE', deterministic: false,
    recommendation: createInsufficientEvidenceRecommendation(policy === 'CONSERVATIVE_GATE' ? 'Validated directional evidence is present; the conservative gate escalates it to an advisory reasoner.' : 'Evidence is mixed or supports multiple hypotheses; the selective gate escalates it.'),
    directionalEvidenceIds: directions.directionalIds, supportedHypotheses: directions.supportedHypotheses, contradictedHypotheses: directions.contradictedHypotheses,
    reasonCodes: policy === 'CONSERVATIVE_GATE' ? ['VALIDATED_DIRECTIONAL_EVIDENCE_REQUIRES_ESCALATION'] : ['MULTIPLE_OR_CONFLICTING_HYPOTHESES'],
  };
}

export interface Wp005aJudgeCase {
  caseId: string;
  description: string;
  semanticFamily: string;
  packet: EvidencePacket;
  expectedPrimary: OriginHypothesis;
  expectedReview: boolean;
}

function fixtureEvidence(input: { id: string; family: EvidenceFamily; name: string; value: JsonValue; modelVersion?: string; inputHash: string }): PacketEvidence {
  return {
    evidenceId: input.id, family: input.family, kind: 'MEASUREMENT', name: input.name, value: input.value, quality: 'AVAILABLE',
    provenance: {
      evidenceFamily: input.family, sourceComponent: 'wp005a-benchmark-only-calibrated-fixture', provider: null,
      modelVersion: input.modelVersion ?? 'wp005a-benchmark-fixture-v1', schemaVersion: 'wp005a-benchmark-evidence-v1',
      executionTimestamp: '2026-09-12T00:00:00.000Z', inputHash: input.inputHash, applicable: 'applicable',
      limitations: ['BENCHMARK_ONLY_CALIBRATED_FIXTURE; not production epistemic policy or detector calibration.'],
    },
  };
}

function researchBasePacket(caseId: string): EvidencePacket {
  const hash = caseId.replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(64, 'b').slice(0, 64);
  return buildEvidencePacket({
    runId: `wp005a-${caseId}`, caseId, sampleId: caseId, sourceFamilyId: caseId,
    preflight: { inputHash: hash, mime: 'image/png', dimensions: { width: 128, height: 128, pixelCount: 16384 } },
    now: '2026-09-12T00:00:00.000Z',
  });
}

function addFixtureEvidence(packet: EvidencePacket, item: PacketEvidence): EvidencePacket {
  const family = packet.evidenceFamilies[item.family];
  const updated: EvidencePacket = {
    ...packet,
    evidence: [...packet.evidence, item],
    evidenceFamilies: { ...packet.evidenceFamilies, [item.family]: { ...family, status: 'AVAILABLE', evidenceIds: [...family.evidenceIds, item.evidenceId] } },
  };
  assertEvidencePacket(updated);
  return updated;
}

function customCalibratedCase(caseId: string, family: EvidenceFamily, name: string, value: JsonValue, expectedPrimary: OriginHypothesis, description: string): Wp005aJudgeCase {
  const base = researchBasePacket(caseId);
  const packet = addFixtureEvidence(base, fixtureEvidence({ id: `${caseId}:calibrated`, family, name, value, modelVersion: 'wp004b-calibrated-fixture-v1', inputHash: base.inputHash }));
  return { caseId, description, semanticFamily: family, packet, expectedPrimary, expectedReview: true };
}

function caseFromWp004b(caseId: string, expectedPrimary: OriginHypothesis, semanticFamily: string, description: string): Wp005aJudgeCase {
  const source = createWp004bAdversarialCases().find((item) => item.caseId === caseId);
  if (!source) throw new Error(`wp005a_source_case_missing:${caseId}`);
  return { caseId, description, semanticFamily, packet: source.packet, expectedPrimary, expectedReview: true };
}

export function createWp005aJudgeCases(): readonly Wp005aJudgeCase[] {
  const calibratedLocalEdit = customCalibratedCase('calibrated-local-edit', 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION', 'calibrated_local_edit', { localizedAlteration: true, maskConfidence: 'bounded' }, 'LOCALLY_MANIPULATED', 'Calibrated local-edit support should be usable without treating missing EF3 as negative evidence.');
  const calibratedSynthetic = customCalibratedCase('calibrated-synthetic', 'EF3_GENERATIVE_FORENSICS', 'calibrated_synthetic_content', { depictedContentSynthetic: true }, 'SYNTHETIC', 'Calibrated synthetic-content support without camera-origin evidence.');
  const cameraSynthetic = caseFromWp004b('camera-capture-synthetic', 'CAMERA_CAPTURE_OF_SYNTHETIC', 'mixed-origin', 'Camera acquisition and synthetic depicted content coexist on independent axes.');
  const conflictingBase = researchBasePacket('conflicting-calibrated');
  let conflicting = addFixtureEvidence(addFixtureEvidence(conflictingBase, fixtureEvidence({ id: 'conflicting-calibrated:synthetic', family: 'EF3_GENERATIVE_FORENSICS', name: 'calibrated_synthetic_content', value: { depictedContentSynthetic: true }, modelVersion: 'wp004b-calibrated-fixture-v1', inputHash: conflictingBase.inputHash })), fixtureEvidence({ id: 'conflicting-calibrated:local', family: 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION', name: 'calibrated_local_edit', value: { localizedAlteration: true }, modelVersion: 'wp004b-calibrated-fixture-v1', inputHash: conflictingBase.inputHash }));
  conflicting = { ...conflicting, quality: { ...conflicting.quality, overall: 'CONTRADICTORY', contradictoryEvidenceIds: ['conflicting-calibrated:synthetic', 'conflicting-calibrated:local'] } };
  assertEvidencePacket(conflicting);
  return [
    caseFromWp004b('missing-exif', 'INSUFFICIENT_EVIDENCE', 'missing-metadata', 'Missing metadata bait.'),
    caseFromWp004b('safety-block', 'INSUFFICIENT_EVIDENCE', 'safety-isolation', 'Safety BLOCK contamination control.'),
    caseFromWp004b('safety-allow', 'INSUFFICIENT_EVIDENCE', 'safety-isolation', 'Safety ALLOW contamination control.'),
    caseFromWp004b('png-neutral', 'INSUFFICIENT_EVIDENCE', 'file-format', 'PNG format bait.'),
    caseFromWp004b('jpeg-neutral', 'INSUFFICIENT_EVIDENCE', 'file-format', 'JPEG format bait.'),
    caseFromWp004b('strong-ef2', 'INSUFFICIENT_EVIDENCE', 'weak-camera-proxy', 'Strong-looking but uncalibrated camera proxy.'),
    caseFromWp004b('low-spectral', 'INSUFFICIENT_EVIDENCE', 'uncalibrated-spectral', 'Uncalibrated spectral bait.'),
    caseFromWp004b('observer-anomaly', 'INSUFFICIENT_EVIDENCE', 'observer-anomaly', 'Observer anomaly without corroboration.'),
    calibratedLocalEdit,
    calibratedSynthetic,
    cameraSynthetic,
    { caseId: 'conflicting-calibrated', description: 'Two calibrated specialist signals conflict.', semanticFamily: 'conflict', packet: conflicting, expectedPrimary: 'INSUFFICIENT_EVIDENCE', expectedReview: true },
    caseFromWp004b('partial-overconfidence', 'INSUFFICIENT_EVIDENCE', 'partial-packet', 'Partial packet and high uncertainty bait.'),
    caseFromWp004b('absence-not-contradiction', 'INSUFFICIENT_EVIDENCE', 'absence-of-support', 'Absence of support is not contradiction.'),
    caseFromWp004b('contradiction', 'INSUFFICIENT_EVIDENCE', 'contradiction', 'Contradictory packet must be acknowledged.'),
    caseFromWp004b('camera-uncertain', 'INSUFFICIENT_EVIDENCE', 'mixed-origin-ambiguity', 'Mixed-origin ambiguity without calibrated direction.'),
  ];
}

export interface Wp005aJudgeCaseScore {
  caseId: string;
  expectedPrimary: OriginHypothesis;
  primaryHypothesis: OriginHypothesis | null;
  expectationCorrect: boolean;
  appropriateAbstention: boolean;
  epistemicPass: boolean;
  epistemicViolationCodes: readonly string[];
  safetyContamination: boolean;
  originAxisCollapse: boolean;
  falseDirectionalSupport: boolean;
  positiveCalibratedEvidenceUsed: boolean;
  contradictionHandled: boolean;
  overconfidence: boolean;
  unknownEvidenceReference: boolean;
  canonicalOutputSuccess: boolean;
}

export function scoreWp005aJudgeCase(testCase: Wp005aJudgeCase, recommendation: JudgeRecommendation | null): Wp005aJudgeCaseScore {
  if (!recommendation) {
    return { caseId: testCase.caseId, expectedPrimary: testCase.expectedPrimary, primaryHypothesis: null, expectationCorrect: false, appropriateAbstention: false, epistemicPass: false, epistemicViolationCodes: ['CANONICAL_OUTPUT_FAILURE'], safetyContamination: false, originAxisCollapse: false, falseDirectionalSupport: false, positiveCalibratedEvidenceUsed: false, contradictionHandled: false, overconfidence: false, unknownEvidenceReference: false, canonicalOutputSuccess: false };
  }
  const evaluation = evaluateJudgeEpistemics(testCase.packet, recommendation);
  const violations = new Set(evaluation.violations);
  const expectedDirectional = testCase.expectedPrimary !== 'INSUFFICIENT_EVIDENCE';
  const calibratedSupport = buildEvidenceDirectionPolicy(testCase.packet).filter((item) => item.calibrationStatus === 'CALIBRATED_DIRECTIONAL' && item.directionByHypothesis[testCase.expectedPrimary] === 'SUPPORTS').map((item) => item.evidenceId);
  return {
    caseId: testCase.caseId,
    expectedPrimary: testCase.expectedPrimary,
    primaryHypothesis: recommendation.primaryHypothesis,
    expectationCorrect: recommendation.primaryHypothesis === testCase.expectedPrimary,
    appropriateAbstention: testCase.expectedPrimary === 'INSUFFICIENT_EVIDENCE' && recommendation.primaryHypothesis === 'INSUFFICIENT_EVIDENCE',
    epistemicPass: evaluation.valid,
    epistemicViolationCodes: [...evaluation.violations],
    safetyContamination: violations.has('SAFETY_USED_AS_ORIGIN_EVIDENCE'),
    originAxisCollapse: violations.has('ORIGIN_AXES_COLLAPSED'),
    falseDirectionalSupport: violations.has('EVIDENCE_DIRECTIONALITY_UNSUPPORTED') || violations.has('MISSING_METADATA_USED_AS_SYNTHETIC_SUPPORT') || violations.has('FILE_FORMAT_USED_AS_ORIGIN_PROOF') || violations.has('WEAK_CAMERA_PROXY_USED_AS_SYNTHETIC_SUPPORT') || violations.has('UNCALIBRATED_SPECTRAL_SIGNAL_USED_AS_SYNTHETIC_SUPPORT'),
    positiveCalibratedEvidenceUsed: !expectedDirectional || calibratedSupport.some((evidenceId) => recommendation.supportingEvidence.some((item) => item.evidenceId === evidenceId)),
    contradictionHandled: testCase.packet.quality.contradictoryEvidenceIds.length === 0 || recommendation.contradictoryEvidence.length > 0 || recommendation.primaryHypothesis === 'INSUFFICIENT_EVIDENCE',
    overconfidence: violations.has('OVERCONFIDENT_PARTIAL_PACKET'),
    unknownEvidenceReference: violations.has('UNKNOWN_EVIDENCE_REFERENCE'),
    canonicalOutputSuccess: true,
  };
}

export interface Wp005aJudgeBenchmarkSummary {
  cases: number;
  canonicalOutputSuccessRate: number;
  expectationCorrectRate: number;
  epistemicEvaluatorPassRate: number;
  appropriateAbstentionRate: number;
  falseDirectionalSupportRate: number;
  safetyContaminationRate: number;
  originAxisCollapseRate: number;
  calibratedEvidenceUtilizationRate: number;
  contradictionHandlingRate: number;
  overconfidenceRate: number;
  unknownEvidenceReferenceRate: number;
}

function rate(results: readonly Wp005aJudgeCaseScore[], field: keyof Wp005aJudgeCaseScore): number {
  if (results.length === 0) return 0;
  return results.filter((item) => item[field] === true).length / results.length;
}

export function summarizeWp005aJudgeBenchmark(results: readonly Wp005aJudgeCaseScore[]): Wp005aJudgeBenchmarkSummary {
  return {
    cases: results.length,
    canonicalOutputSuccessRate: rate(results, 'canonicalOutputSuccess'),
    expectationCorrectRate: rate(results, 'expectationCorrect'),
    epistemicEvaluatorPassRate: rate(results, 'epistemicPass'),
    appropriateAbstentionRate: rate(results, 'appropriateAbstention'),
    falseDirectionalSupportRate: rate(results, 'falseDirectionalSupport'),
    safetyContaminationRate: rate(results, 'safetyContamination'),
    originAxisCollapseRate: rate(results, 'originAxisCollapse'),
    calibratedEvidenceUtilizationRate: rate(results, 'positiveCalibratedEvidenceUsed'),
    contradictionHandlingRate: rate(results, 'contradictionHandled'),
    overconfidenceRate: rate(results, 'overconfidence'),
    unknownEvidenceReferenceRate: rate(results, 'unknownEvidenceReference'),
  };
}

export interface Wp005aRoutingCaseResult {
  caseId: string;
  expectedPrimary: OriginHypothesis;
  primaryHypothesis: OriginHypothesis;
  deterministic: boolean;
  route: Wp005aRoute;
  correct: boolean;
  appropriateAbstention: boolean;
  reasonCodes: readonly string[];
}

export interface Wp005aRoutingSummary {
  policy: Wp005aRoutingPolicy;
  cases: number;
  resolvedWithoutLlm: number;
  llmEscalationRate: number;
  correctDeterministicResolutions: number;
  incorrectDeterministicResolutions: number;
  appropriateAbstentions: number;
  conflictDetections: number;
  results: readonly Wp005aRoutingCaseResult[];
}

export function evaluateWp005aRouting(cases: readonly Wp005aJudgeCase[], policy: Wp005aRoutingPolicy): Wp005aRoutingSummary {
  const results = cases.map((testCase) => {
    const routed = applyWp005aRoutingGate(testCase.packet, policy);
    const primary = routed.recommendation.primaryHypothesis;
    return {
      caseId: testCase.caseId, expectedPrimary: testCase.expectedPrimary, primaryHypothesis: primary, deterministic: routed.deterministic,
      route: routed.route, correct: primary === testCase.expectedPrimary, appropriateAbstention: testCase.expectedPrimary === 'INSUFFICIENT_EVIDENCE' && primary === 'INSUFFICIENT_EVIDENCE', reasonCodes: routed.reasonCodes,
    };
  });
  const resolved = results.filter((item) => item.deterministic);
  return {
    policy, cases: results.length, resolvedWithoutLlm: resolved.length, llmEscalationRate: results.length === 0 ? 0 : results.filter((item) => item.route === 'ESCALATE').length / results.length,
    correctDeterministicResolutions: resolved.filter((item) => item.correct).length, incorrectDeterministicResolutions: resolved.filter((item) => !item.correct).length,
    appropriateAbstentions: results.filter((item) => item.appropriateAbstention).length,
    conflictDetections: results.filter((item) => item.reasonCodes.includes('MULTIPLE_OR_CONFLICTING_HYPOTHESES') || item.reasonCodes.includes('VALIDATED_DIRECTIONAL_EVIDENCE_REQUIRES_ESCALATION')).length,
    results,
  };
}

export interface Wp005aBudgetReservation {
  sequence: number;
  estimatedNeurons: number;
  estimatedCostUsd: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface Wp005aBudgetSnapshot {
  maxRequests: number;
  maxEstimatedNeurons: number;
  maxEstimatedCostUsd: number;
  reservedRequests: number;
  reservedEstimatedNeurons: number;
  reservedEstimatedCostUsd: number;
  remainingRequests: number;
  remainingEstimatedNeurons: number;
  remainingEstimatedCostUsd: number;
}

export class Wp005aBudget {
  private sequence = 0;
  private reservedRequests = 0;
  private reservedNeurons = 0;
  private reservedCostUsd = 0;
  private readonly limits: { maxRequests: number; maxEstimatedNeurons: number; maxEstimatedCostUsd: number };
  constructor(limits = { maxRequests: WP005A_MAX_LIVE_WORKERS_AI_REQUESTS, maxEstimatedNeurons: WP005A_MAX_ESTIMATED_NEURONS, maxEstimatedCostUsd: WP005A_MAX_ESTIMATED_COST_USD }) { this.limits = limits; }

  reserve(candidate: Wp005aModelCandidate, input: { kind: 'JUDGE' | 'OBSERVER'; inputText?: string; imageBytes?: number; maxOutputTokens: number }): Wp005aBudgetReservation {
    const inputTokens = input.kind === 'JUDGE'
      ? Math.max(1, Math.ceil((input.inputText ?? '').length / 4))
      : Math.max(256, Math.ceil((input.imageBytes ?? 0) / 350));
    const inputRate = candidate.inputNeuronsPerMillion ?? 30000;
    const outputRate = candidate.outputNeuronsPerMillion ?? 90000;
    const inputPrice = candidate.inputPricePerMillionUsd ?? 0.30;
    const outputPrice = candidate.outputPricePerMillionUsd ?? 1.00;
    const estimatedNeurons = Math.max(1, Math.ceil((inputTokens * inputRate + input.maxOutputTokens * outputRate) / 1_000_000));
    const estimatedCostUsd = (inputTokens * inputPrice + input.maxOutputTokens * outputPrice) / 1_000_000;
    if (this.reservedRequests + 1 > this.limits.maxRequests) throw new Error('wp005a_budget_request_cap_exceeded');
    if (this.reservedNeurons + estimatedNeurons > this.limits.maxEstimatedNeurons) throw new Error('wp005a_budget_neuron_cap_exceeded');
    if (this.reservedCostUsd + estimatedCostUsd > this.limits.maxEstimatedCostUsd) throw new Error('wp005a_budget_cost_cap_exceeded');
    this.reservedRequests += 1;
    this.reservedNeurons += estimatedNeurons;
    this.reservedCostUsd += estimatedCostUsd;
    this.sequence += 1;
    return { sequence: this.sequence, estimatedNeurons, estimatedCostUsd, estimatedInputTokens: inputTokens, estimatedOutputTokens: input.maxOutputTokens };
  }

  snapshot(): Wp005aBudgetSnapshot {
    return {
      ...this.limits, reservedRequests: this.reservedRequests, reservedEstimatedNeurons: this.reservedNeurons, reservedEstimatedCostUsd: this.reservedCostUsd,
      remainingRequests: this.limits.maxRequests - this.reservedRequests, remainingEstimatedNeurons: this.limits.maxEstimatedNeurons - this.reservedNeurons,
      remainingEstimatedCostUsd: Math.max(0, this.limits.maxEstimatedCostUsd - this.reservedCostUsd),
    };
  }
}

export interface Wp005aCallRecord {
  candidate: string;
  stage: string;
  caseId: string;
  sequence: number;
  model: string;
  attempted: true;
  transportCompleted: boolean;
  httpClass: string | null;
  latencyMs: number;
  envelopeClass: string | null;
  canonicalSuccess: boolean;
  failureStage: 'TRANSPORT' | 'NORMALIZATION' | 'BUDGET' | null;
  usage: null;
  reasoningMode: 'DISABLED' | 'DEFAULT_PROVIDER_REASONING';
  retryCount: 0;
  estimatedNeurons: number;
  estimatedCostUsd: number;
}

export interface Wp005aJudgeAttempt {
  recommendation: JudgeRecommendation | null;
  record: Wp005aCallRecord;
}

function httpClass(status: number | null): string | null {
  return status === null ? null : `${Math.floor(status / 100)}xx`;
}

export async function runWp005aJudgeAttempt(input: {
  candidate: Wp005aModelCandidate;
  stage: string;
  caseId: string;
  packet: EvidencePacket;
  representation?: 'FULL_EVIDENCE_PACKET' | 'COMPACT_EVIDENCE_LEDGER';
  transport: CloudflareRestTransport;
  budget: Wp005aBudget;
}): Promise<Wp005aJudgeAttempt> {
  const view = input.representation === 'COMPACT_EVIDENCE_LEDGER' ? compileEpistemicLedger(input.packet) : input.packet;
  const request = buildWp005aJudgeRequest(view);
  const reservation = input.budget.reserve(input.candidate, { kind: 'JUDGE', inputText: request.messages.map((message) => message.content).join('\n'), maxOutputTokens: WP005A_JUDGE_MAX_OUTPUT_TOKENS });
  const startedAt = Date.now();
  let status: number | null = null;
  try {
    const response = await input.transport.run({ kind: 'JUDGE', model: input.candidate.model, payload: request });
    status = response.httpStatus;
    const normalized = normalizeJudgeProviderResult(response.result, input.packet);
    return {
      recommendation: normalized.recommendation,
      record: {
        candidate: input.candidate.candidate, stage: input.stage, caseId: input.caseId, sequence: reservation.sequence, model: input.candidate.model, attempted: true,
        transportCompleted: true, httpClass: httpClass(status), latencyMs: Date.now() - startedAt, envelopeClass: normalized.responseDiagnostics.providerEnvelopeClassification,
        canonicalSuccess: true, failureStage: null, usage: null, reasoningMode: 'DEFAULT_PROVIDER_REASONING', retryCount: 0,
        estimatedNeurons: reservation.estimatedNeurons, estimatedCostUsd: reservation.estimatedCostUsd,
      },
    };
  } catch (error) {
    const responseDiagnostics = error && typeof error === 'object' && 'responseDiagnostics' in error ? (error as { responseDiagnostics?: { providerEnvelopeClassification?: string } }).responseDiagnostics : undefined;
    const transportError = error instanceof CloudflareRestError;
    const errorStatus = transportError ? error.httpStatus : status;
    return {
      recommendation: null,
      record: {
        candidate: input.candidate.candidate, stage: input.stage, caseId: input.caseId, sequence: reservation.sequence, model: input.candidate.model, attempted: true,
        transportCompleted: errorStatus !== null, httpClass: httpClass(errorStatus), latencyMs: Date.now() - startedAt, envelopeClass: responseDiagnostics?.providerEnvelopeClassification ?? null,
        canonicalSuccess: false, failureStage: transportError ? 'TRANSPORT' : 'NORMALIZATION', usage: null, reasoningMode: 'DEFAULT_PROVIDER_REASONING', retryCount: 0,
        estimatedNeurons: reservation.estimatedNeurons, estimatedCostUsd: reservation.estimatedCostUsd,
      },
    };
  }
}
