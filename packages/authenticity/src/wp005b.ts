import type { EvidencePacket } from './evidence-packet.ts';
import {
  buildWp005aJudgeRequest,
  compileEpistemicLedger,
  createWp005aJudgeCases,
  getWp005aCandidateRegistry,
  runWp005aJudgeAttempt,
  evaluateWp005aRouting,
  Wp005aBudget,
  WP005A_JUDGE_PROMPT_VERSION,
  WP005A_RESEARCH_JUDGE_SYSTEM_PROMPT,
  WP005A_JUDGE_MAX_OUTPUT_TOKENS,
  type EvidenceLedger,
  type Wp005aCandidateFamily,
  type Wp005aJudgeCase,
  type Wp005aJudgeAttempt,
  type Wp005aModelCandidate,
  type Wp005aRoutingPolicy,
} from './wp005a.ts';
import { buildVisionObserverPrompt, type VisionObserverInput, type VisionObserverPayloadBuilder, type VisionObserverRequest } from './vision-observer.ts';

export const WP005B_SCHEMA_VERSION = 'lythaus-wp005b-architecture-lock-v1' as const;
export const WP005B_RESEARCH_DATE = '2026-09-13' as const;
export const WP005B_JUDGE_PROMPT_VERSION = WP005A_JUDGE_PROMPT_VERSION;
export const WP005B_JUDGE_SYSTEM_PROMPT = WP005A_RESEARCH_JUDGE_SYSTEM_PROMPT;
export const WP005B_LEDGER_SCHEMA_VERSION = 'lythaus-evidence-ledger-v1' as const;
export const WP005B_MAX_LIVE_REQUESTS = 50 as const;
export const WP005B_MAX_ESTIMATED_NEURONS = 7500 as const;
export const WP005B_MAX_ESTIMATED_COST_USD = 0.15 as const;
export const WP005B_JUDGE_TIMEOUT_MS = 20_000 as const;
export const WP005B_OBSERVER_TIMEOUT_MS = 20_000 as const;
export const WP005B_JUDGE_MAX_OUTPUT_TOKENS = WP005A_JUDGE_MAX_OUTPUT_TOKENS;

export const WP005B_JUDGE_CANDIDATE_IDS = [
  'gpt-oss-20b',
  'qwen3-30b-a3b-fp8',
  'llama-3.3-70b-instruct-fp8-fast',
] as const;
export const WP005B_OBSERVER_CANDIDATE_IDS = [
  'moondream3.1-9B-A2B',
  'llama-4-scout-17b-16e-instruct',
] as const;
export type Wp005bJudgeCandidateId = (typeof WP005B_JUDGE_CANDIDATE_IDS)[number];
export type Wp005bObserverCandidateId = (typeof WP005B_OBSERVER_CANDIDATE_IDS)[number];

export const WP005B_SCREENING_CASE_IDS = [
  'missing-exif',
  'safety-block',
  'strong-ef2',
  'calibrated-local-edit',
  'calibrated-synthetic',
  'camera-capture-synthetic',
] as const;
export const WP005B_HOLDOUT_CASE_IDS = [
  'png-neutral',
  'low-spectral',
  'observer-anomaly',
  'conflicting-calibrated',
  'partial-overconfidence',
  'absence-not-contradiction',
] as const;
export const WP005B_LEDGER_CASE_IDS = [
  'camera-capture-synthetic',
  'conflicting-calibrated',
] as const;

export interface Wp005bModelCandidate extends Wp005aModelCandidate {
  tournamentRole: 'JUDGE_FINALIST' | 'OBSERVER_FINALIST';
  documentationVerified: true;
  documentationNotes: readonly string[];
}

function candidateById(candidateId: string, family: Wp005aCandidateFamily): Wp005bModelCandidate {
  const candidate = getWp005aCandidateRegistry().find((item) => item.candidate === candidateId && item.family === family);
  if (!candidate) throw new Error(`wp005b_candidate_missing:${candidateId}`);
  const tournamentRole = family === 'JUDGE' ? 'JUDGE_FINALIST' : 'OBSERVER_FINALIST';
  const currentPricing = {
    'gpt-oss-20b': [0.20, 0.30, 18182, 27273],
    'qwen3-30b-a3b-fp8': [0.051, 0.335, 4625, 30475],
    'llama-3.3-70b-instruct-fp8-fast': [0.293, 2.253, 26668, 204805],
    'moondream3.1-9B-A2B': [0.30, 1.00, 27273, 90909],
    'llama-4-scout-17b-16e-instruct': [0.27, 0.85, 24545, 77273],
  }[candidateId as keyof Record<string, number[]>];
  return {
    ...candidate,
    sourceUrl: candidateId === 'moondream3.1-9B-A2B'
      ? 'https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/'
      : candidate.sourceUrl,
    ...(currentPricing ? {
      inputPricePerMillionUsd: currentPricing[0],
      outputPricePerMillionUsd: currentPricing[1],
      inputNeuronsPerMillion: currentPricing[2],
      outputNeuronsPerMillion: currentPricing[3],
    } : {}),
    tournamentRole,
    documentationVerified: true,
    documentationNotes: candidateId === 'llama-4-scout-17b-16e-instruct'
      ? ['Cloudflare documents native multimodal Vision support and messages input; the image field remains an explicit research adapter because the current model page does not publish a dedicated image payload example.']
      : ['Cloudflare model page and pricing page were checked on the WP005B research date.'],
  };
}

export function getWp005bJudgeCandidates(): readonly Wp005bModelCandidate[] {
  return WP005B_JUDGE_CANDIDATE_IDS.map((candidateId) => candidateById(candidateId, 'JUDGE'));
}

export function getWp005bObserverCandidates(): readonly Wp005bModelCandidate[] {
  return WP005B_OBSERVER_CANDIDATE_IDS.map((candidateId) => candidateById(candidateId, 'OBSERVER'));
}

export function createWp005bJudgeCases(): readonly Wp005aJudgeCase[] {
  return createWp005aJudgeCases();
}

export function selectWp005bCases(cases: readonly Wp005aJudgeCase[], ids: readonly string[]): readonly Wp005aJudgeCase[] {
  const byId = new Map(cases.map((item) => [item.caseId, item]));
  return ids.map((caseId) => {
    const testCase = byId.get(caseId);
    if (!testCase) throw new Error(`wp005b_case_missing:${caseId}`);
    return testCase;
  });
}

export function buildWp005bJudgeRequest(input: EvidencePacket | EvidenceLedger) {
  return buildWp005aJudgeRequest(input);
}

export function compileWp005bEvidenceLedger(packet: EvidencePacket): EvidenceLedger {
  return compileEpistemicLedger(packet);
}

export function evaluateWp005bRouting(cases: readonly Wp005aJudgeCase[], policy: Wp005aRoutingPolicy = 'SELECTIVE_RESOLUTION_GATE') {
  return evaluateWp005aRouting(cases, policy);
}

export class Wp005bBudget extends Wp005aBudget {
  constructor() {
    super({
      maxRequests: WP005B_MAX_LIVE_REQUESTS,
      maxEstimatedNeurons: WP005B_MAX_ESTIMATED_NEURONS,
      maxEstimatedCostUsd: WP005B_MAX_ESTIMATED_COST_USD,
    });
  }
}

export async function runWp005bJudgeAttempt(input: {
  candidate: Wp005bModelCandidate;
  stage: string;
  caseId: string;
  packet: EvidencePacket;
  representation?: 'FULL_EVIDENCE_PACKET' | 'COMPACT_EVIDENCE_LEDGER';
  transport: Parameters<typeof runWp005aJudgeAttempt>[0]['transport'];
  budget: Wp005bBudget;
}): Promise<Wp005aJudgeAttempt> {
  return runWp005aJudgeAttempt(input);
}

export const buildWp005bNativeMultimodalPayload: VisionObserverPayloadBuilder = (_input: VisionObserverInput, request: VisionObserverRequest, image: string) => {
  const question = request.question?.trim() || 'Report only applicable visual observations for this category.';
  return {
    messages: [
      { role: 'system', content: 'Return only the requested visual observations. Do not infer image origin.' },
      { role: 'user', content: `${buildVisionObserverPrompt(request.category, request.regionPolicy)}\n\nTASK QUESTION: ${question}` },
    ],
    image,
    temperature: 0,
    max_tokens: 1200,
    stream: false,
  };
};

export const WP005B_CLOUDFLARE_VERIFICATION = {
  researchDate: WP005B_RESEARCH_DATE,
  catalogUrl: 'https://developers.cloudflare.com/workers-ai/models/',
  pricingUrl: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
  jsonModeUrl: 'https://developers.cloudflare.com/workers-ai/features/json-mode/',
  compatibilityUrl: 'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/',
  candidates: {
    'gpt-oss-20b': { model: '@cf/openai/gpt-oss-20b', available: true, capability: ['Text Generation', 'Reasoning', 'Function calling'], contextWindow: 128000, responseShape: 'response string; usage; tool_calls', structuredJson: 'JSON Mode documented at platform level; ordinary json_object used by tournament', reasoning: true, imageInput: false, price: { input: 0.20, output: 0.30 }, access: 'Cloudflare-hosted; no finalist-specific paid-access notice' },
    'qwen3-30b-a3b-fp8': { model: '@cf/qwen/qwen3-30b-a3b-fp8', available: true, capability: ['Text Generation', 'Reasoning', 'Function calling', 'Batch'], contextWindow: 32768, responseShape: 'chat.completion choices documented by model page', structuredJson: 'JSON Mode documented at platform level; ordinary json_object used by tournament', reasoning: true, imageInput: false, price: { input: 0.051, output: 0.335 }, access: 'Cloudflare-hosted; no finalist-specific paid-access notice' },
    'llama-3.3-70b-instruct-fp8-fast': { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', available: true, capability: ['Text Generation', 'Function calling', 'Batch'], contextWindow: 24000, responseShape: 'response string; usage; tool_calls', structuredJson: 'JSON Mode documented at platform level; ordinary json_object used by tournament', reasoning: false, imageInput: false, price: { input: 0.293, output: 2.253 }, access: 'Cloudflare-hosted; no finalist-specific paid-access notice' },
    'moondream3.1-9B-A2B': { model: '@cf/moondream/moondream3.1-9B-A2B', available: true, capability: ['Image-to-Text', 'Vision'], contextWindow: null, responseShape: 'answer/caption/points/objects/reasoning', structuredJson: 'Structured output described; observer requests JSON in query answer', reasoning: true, imageInput: 'public HTTPS URL or base64 data URI', price: { input: 0.30, output: 1.00 }, access: 'Cloudflare-hosted; no finalist-specific paid-access notice' },
    'llama-4-scout-17b-16e-instruct': { model: '@cf/meta/llama-4-scout-17b-16e-instruct', available: true, capability: ['Text Generation', 'Vision', 'Function calling', 'Batch'], contextWindow: 131000, responseShape: 'messages/chat-compatible text; explicit image adapter under test', structuredJson: 'JSON Mode documented at platform level; ordinary JSON is requested in the user message', reasoning: false, imageInput: 'Vision/native multimodal; current model page documents messages but not a dedicated image field example', price: { input: 0.27, output: 0.85 }, access: 'Cloudflare-hosted; no finalist-specific paid-access notice' },
  },
} as const;

export type Wp005bAttempt = Awaited<ReturnType<typeof runWp005bJudgeAttempt>>;
