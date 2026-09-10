import { createAuthenticityCase, type ForensicFeatureBundle } from './contracts.ts';
import { buildEvidencePacket, packetReferenceIds, type EvidencePacket, type PacketPreflight } from './evidence-packet.ts';
import { generateForensicFeatureBundleV1, inspectMedia, sha256Hex } from './forensics.ts';
import { createMockJudge, type Judge, type JudgeResult } from './judge.ts';
import { createMockModerationProvider, type ModerationAnalysis, type ModerationProvider } from './moderation.ts';
import { detectMediaMime } from './media-intake.ts';
import { mimeFromResearchFilename } from './research-image.ts';
import { type RuntimeManifestEntry, type RuntimeResearchManifest } from './research-manifests.ts';
import {
  compareVisionObserverResults,
  createMockVisionObserver,
  type VisionObserver,
  type VisionObserverComparison,
  type VisionObserverRequest,
  type VisionObserverResult,
  type VisionObserverTask,
  type VisionObserverReasoningMode,
  VISION_OBSERVER_PROTOCOL_VERSION,
  VISION_OBSERVER_PROMPT_VERSION,
} from './vision-observer.ts';

export const RESEARCH_RUN_SCHEMA_VERSION = 'lythaus-wp004a-research-run-v1' as const;
export const MAX_RECHECK_ROUNDS_V1 = 1 as const;
export const MAX_JUDGE_PASSES_V1 = 2 as const;

export type ResearchRunMode = 'MOCK_ONLY' | 'MODERATION_ONLY' | 'OBSERVER_ONLY' | 'OBSERVER_REASONED' | 'OBSERVER_AB' | 'JUDGE_ONLY' | 'FULL' | 'FULL_RECHECK';
export type ResearchSafetyMode = 'observe' | 'gate';
export type InvocationKind = 'moderation' | 'observer_direct' | 'observer_reasoned' | 'observer_caption' | 'observer_detect' | 'observer_point' | 'judge';

export interface InvocationCaps {
  maxSamples: number;
  maxModerationCalls: number;
  maxObserverCalls: number;
  maxObserverDirectCalls: number;
  maxObserverReasonedCalls: number;
  maxCaptionCalls: number;
  maxDetectCalls: number;
  maxPointCalls: number;
  maxJudgeCalls: number;
  maxTotalCalls: number;
  maxRecheckRounds: number;
}

export const DEFAULT_INVOCATION_CAPS: InvocationCaps = {
  maxSamples: 20,
  maxModerationCalls: 20,
  maxObserverCalls: 40,
  maxObserverDirectCalls: 20,
  maxObserverReasonedCalls: 20,
  maxCaptionCalls: 20,
  maxDetectCalls: 20,
  maxPointCalls: 20,
  maxJudgeCalls: 40,
  maxTotalCalls: 100,
  maxRecheckRounds: MAX_RECHECK_ROUNDS_V1,
};

export interface InvocationRecord {
  kind: InvocationKind;
  provider: string;
  model: string | null;
  task: VisionObserverTask | null;
  reasoningMode: VisionObserverReasoningMode | null;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  executionMs: number;
  retries: 0;
  estimatedCostUsd: number | null;
}

export interface InvocationAccounting {
  caps: InvocationCaps;
  calls: {
    moderation: number;
    observer: number;
    observerDirect: number;
    observerReasoned: number;
    caption: number;
    detect: number;
    point: number;
    judge: number;
    total: number;
  };
  retries: number;
  successes: number;
  providerFailures: number;
  estimatedExternalCostUsd: number | null;
  records: readonly InvocationRecord[];
}

export interface ResearchSampleBytes {
  bytes: Uint8Array;
  mime?: string;
}

export interface ResearchRunnerDependencies {
  readSample: (entry: RuntimeManifestEntry) => Promise<ResearchSampleBytes>;
  moderation?: ModerationProvider;
  observer?: VisionObserver;
  judge?: Judge;
  now?: () => string;
}

export interface ResearchRunnerInput {
  mode: ResearchRunMode;
  runtimeManifest?: RuntimeResearchManifest;
  packets?: readonly EvidencePacket[];
  maxSamples?: number;
  allowNetwork?: boolean;
  safetyMode?: ResearchSafetyMode;
  caps?: Partial<InvocationCaps>;
  runId?: string;
  observerRequest?: VisionObserverRequest;
  enableRecheck?: boolean;
}

export interface ResearchCaseResult {
  sampleId: string;
  sourceFamilyId: string;
  caseId: string;
  inputHash: string | null;
  status: 'COMPLETED' | 'STOPPED' | 'FAILED';
  stoppedAt: 'SAFETY_GATE' | null;
  preflight: (PacketPreflight & { signatureMime: string | null; format: string | null; readable: boolean }) | null;
  moderation: ModerationAnalysis | null;
  observer: VisionObserverResult | null;
  observerComparison: VisionObserverComparison | null;
  forensic: ForensicFeatureBundle | null;
  packet: EvidencePacket | null;
  judge: JudgeResult | null;
  judgeHistory: readonly JudgeResult[];
  recheckRounds: number;
  errorCategory: 'SAMPLE_READ_FAILURE' | 'FORENSIC_FAILURE' | null;
}

export interface ResearchRunResult {
  schemaVersion: typeof RESEARCH_RUN_SCHEMA_VERSION;
  runId: string;
  mode: ResearchRunMode;
  safetyMode: ResearchSafetyMode;
  groundTruthLoaded: false;
  cases: readonly ResearchCaseResult[];
  judgeOnlyResults: readonly JudgeResult[];
  invocationAccounting: InvocationAccounting;
  enforcementAuthority: false;
}

function providerIsLive(provider: unknown): boolean {
  return Boolean(provider && typeof provider === 'object' && (provider as { isLive?: boolean }).isLive === true);
}

function providerLabel(provider: unknown, value?: unknown): string {
  for (const candidate of [value, provider]) {
    if (candidate && typeof candidate === 'object') {
      const providerName = (candidate as { provider?: unknown }).provider;
      if (typeof providerName === 'string' && providerName) return providerName;
    }
  }
  return 'injected-provider';
}

function observerKind(task: VisionObserverTask, reasoningMode: VisionObserverReasoningMode): InvocationKind {
  if (reasoningMode === 'REASONED') return 'observer_reasoned';
  if (task === 'caption') return 'observer_caption';
  if (task === 'detect') return 'observer_detect';
  if (task === 'point') return 'observer_point';
  return 'observer_direct';
}

function modelFromResult(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { modelVersion?: unknown; model?: unknown };
  if (typeof candidate.model === 'string') return candidate.model;
  if (typeof candidate.modelVersion === 'string') return candidate.modelVersion;
  return null;
}

function statusOf(value: unknown): 'SUCCESS' | 'PROVIDER_FAILURE' {
  if (value && typeof value === 'object') {
    if ((value as { status?: unknown }).status === 'PROVIDER_FAILURE') return 'PROVIDER_FAILURE';
    if ((value as { result?: unknown }).result === 'PROVIDER_FAILURE') return 'PROVIDER_FAILURE';
  }
  return 'SUCCESS';
}

class InvocationLedger {
  private readonly counts: InvocationAccounting['calls'] = { moderation: 0, observer: 0, observerDirect: 0, observerReasoned: 0, caption: 0, detect: 0, point: 0, judge: 0, total: 0 };
  private readonly records: InvocationRecord[] = [];
  private readonly caps: InvocationCaps;

  constructor(caps: InvocationCaps) {
    this.caps = caps;
    if (!Object.values(caps).every((value) => Number.isInteger(value) && value >= 0)) throw new Error('research_invocation_caps_invalid');
  }

  reserve(kind: InvocationKind): void {
    const max = kind === 'moderation'
      ? this.caps.maxModerationCalls
      : kind === 'judge'
        ? this.caps.maxJudgeCalls
        : kind === 'observer_direct'
          ? this.caps.maxObserverDirectCalls
          : kind === 'observer_reasoned'
            ? this.caps.maxObserverReasonedCalls
            : kind === 'observer_caption'
              ? this.caps.maxCaptionCalls
              : kind === 'observer_detect'
                ? this.caps.maxDetectCalls
                : this.caps.maxPointCalls;
    const observerCount = kind === 'moderation' || kind === 'judge' ? 0 : this.counts.observer;
    if (this.counts.total >= this.caps.maxTotalCalls || this.counts[kind === 'moderation' ? 'moderation' : kind === 'judge' ? 'judge' : kind === 'observer_direct' ? 'observerDirect' : kind === 'observer_reasoned' ? 'observerReasoned' : kind === 'observer_caption' ? 'caption' : kind === 'observer_detect' ? 'detect' : 'point'] >= max || observerCount >= this.caps.maxObserverCalls) throw new Error(`research_invocation_cap_exceeded:${kind}`);
    this.counts.total += 1;
    if (kind === 'moderation') this.counts.moderation += 1;
    else if (kind === 'judge') this.counts.judge += 1;
    else {
      this.counts.observer += 1;
      if (kind === 'observer_direct') this.counts.observerDirect += 1;
      if (kind === 'observer_reasoned') this.counts.observerReasoned += 1;
      if (kind === 'observer_caption') this.counts.caption += 1;
      if (kind === 'observer_detect') this.counts.detect += 1;
      if (kind === 'observer_point') this.counts.point += 1;
    }
  }

  complete(input: { kind: InvocationKind; provider: string; value: unknown; status: 'SUCCESS' | 'PROVIDER_FAILURE'; executionMs: number; task?: VisionObserverTask | null; reasoningMode?: VisionObserverReasoningMode | null; estimatedCostUsd?: number | null }): void {
    this.records.push({ kind: input.kind, provider: input.provider, model: modelFromResult(input.value), task: input.task ?? null, reasoningMode: input.reasoningMode ?? null, status: input.status, executionMs: Math.max(0, input.executionMs), retries: 0, estimatedCostUsd: input.estimatedCostUsd ?? null });
  }

  snapshot(): InvocationAccounting {
    const knownCosts = this.records.map((record) => record.estimatedCostUsd).filter((value): value is number => value !== null && Number.isFinite(value));
    return {
      caps: this.caps,
      calls: { ...this.counts },
      retries: 0,
      successes: this.records.filter((record) => record.status === 'SUCCESS').length,
      providerFailures: this.records.filter((record) => record.status === 'PROVIDER_FAILURE').length,
      estimatedExternalCostUsd: knownCosts.length === this.records.length ? knownCosts.reduce((sum, value) => sum + value, 0) : null,
      records: [...this.records],
    };
  }
}

function normalizeCaps(input: Partial<InvocationCaps> | undefined, maxSamples: number | undefined): InvocationCaps {
  const supplied = input ?? {};
  const resolvedMaxSamples = maxSamples ?? supplied.maxSamples ?? DEFAULT_INVOCATION_CAPS.maxSamples;
  const observerCalls = supplied.maxObserverCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxObserverCalls, resolvedMaxSamples * 2);
  const caps: InvocationCaps = {
    maxSamples: resolvedMaxSamples,
    maxModerationCalls: supplied.maxModerationCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxModerationCalls, resolvedMaxSamples),
    maxObserverCalls: observerCalls,
    maxObserverDirectCalls: supplied.maxObserverDirectCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxObserverDirectCalls, resolvedMaxSamples),
    maxObserverReasonedCalls: supplied.maxObserverReasonedCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxObserverReasonedCalls, resolvedMaxSamples),
    maxCaptionCalls: supplied.maxCaptionCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxCaptionCalls, resolvedMaxSamples),
    maxDetectCalls: supplied.maxDetectCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxDetectCalls, resolvedMaxSamples),
    maxPointCalls: supplied.maxPointCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxPointCalls, resolvedMaxSamples),
    maxJudgeCalls: supplied.maxJudgeCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxJudgeCalls, resolvedMaxSamples * 2),
    maxTotalCalls: supplied.maxTotalCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxTotalCalls, resolvedMaxSamples * 5),
    maxRecheckRounds: supplied.maxRecheckRounds ?? MAX_RECHECK_ROUNDS_V1,
  };
  if (!Number.isInteger(caps.maxSamples) || caps.maxSamples <= 0) throw new Error('research_max_samples_invalid');
  if (caps.maxRecheckRounds > MAX_RECHECK_ROUNDS_V1) throw new Error('research_recheck_cap_invalid');
  return caps;
}

function assertNetworkAllowed(provider: unknown, allowNetwork: boolean, kind: string): void {
  if (providerIsLive(provider) && !allowNetwork) throw new Error(`research_network_disabled:${kind}`);
}

async function deterministicRunId(input: { mode: ResearchRunMode; sampleIds: readonly string[] }): Promise<string> {
  const digest = await sha256Hex(new TextEncoder().encode(JSON.stringify(input)));
  return `wp004a-${digest.slice(0, 24)}`;
}

function emptyPreflight(input: { inputHash: string; mime: string; inspection: ReturnType<typeof inspectMedia>; timestamp: string; signatureMime: string | null }): NonNullable<ResearchCaseResult['preflight']> {
  return { inputHash: input.inputHash, mime: input.mime, dimensions: input.inspection.dimensions, executionTimestamp: input.timestamp, signatureMime: input.signatureMime, format: input.inspection.format || null, readable: input.inspection.dimensions !== null };
}

function sanitizeForensicBundle(bundle: ForensicFeatureBundle): ForensicFeatureBundle {
  return { ...bundle, fileProvenance: { ...bundle.fileProvenance, encoderInformation: bundle.fileProvenance.encoderInformation ? 'PRESENT_REDACTED' : null } };
}

function defaultObserverRequest(mode: VisionObserverReasoningMode = 'DIRECT'): VisionObserverRequest {
  return { queryId: 'SCENE_INVENTORY_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Inventory visible scene elements and report only structured visual observations.', reasoningMode: mode };
}

function requestForMode(input: ResearchRunnerInput, mode: VisionObserverReasoningMode): VisionObserverRequest {
  return { ...(input.observerRequest ?? defaultObserverRequest()), reasoningMode: mode };
}

function failedObserverResult(provider: string, model: string, request: VisionObserverRequest): VisionObserverResult {
  return { schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION, protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION, promptVersion: VISION_OBSERVER_PROMPT_VERSION, prompt: '', provider, model, queryId: request.queryId, task: request.task, reasoningMode: request.reasoningMode ?? 'DIRECT', status: 'PROVIDER_FAILURE', observations: [], escalationRecommendation: 'NONE', escalationReasons: [], executionMs: 0, errorCategory: 'NETWORK_FAILURE' };
}

function failedJudgeResult(provider: string): JudgeResult {
  return { schemaVersion: 'lythaus-judge-result-v1', promptVersion: 'lythaus-gpt-oss-judge-prompt-v1', prompt: '', provider, model: null, status: 'PROVIDER_FAILURE', recommendation: null, executionMs: 0, errorCategory: 'NETWORK_FAILURE' };
}

async function callObserver(input: { observer: VisionObserver; baseInput: { sampleId: string; inputHash: string; mime: string; bytes: Uint8Array; executionTimestamp: string }; request: VisionObserverRequest; allowNetwork: boolean; ledger: InvocationLedger }): Promise<VisionObserverResult> {
  assertNetworkAllowed(input.observer, input.allowNetwork, 'observer');
  const reasoningMode = input.request.reasoningMode ?? 'DIRECT';
  const kind = observerKind(input.request.task, reasoningMode);
  input.ledger.reserve(kind);
  const startedAt = Date.now();
  try {
    const result = await input.observer.observe({ ...input.baseInput, request: input.request });
    input.ledger.complete({ kind, provider: providerLabel(input.observer, result), value: result, status: statusOf(result), executionMs: Date.now() - startedAt, task: result.task, reasoningMode: result.reasoningMode });
    return result;
  } catch {
    const result = failedObserverResult(providerLabel(input.observer), 'unknown', input.request);
    input.ledger.complete({ kind, provider: providerLabel(input.observer), value: result, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt, task: input.request.task, reasoningMode });
    return result;
  }
}

async function callJudge(input: { judge: Judge; packet: EvidencePacket; requestId: string; allowNetwork: boolean; ledger: InvocationLedger }): Promise<JudgeResult> {
  assertNetworkAllowed(input.judge, input.allowNetwork, 'judge');
  input.ledger.reserve('judge');
  const startedAt = Date.now();
  try {
    const result = await input.judge.judge({ packet: input.packet, requestId: input.requestId });
    input.ledger.complete({ kind: 'judge', provider: providerLabel(input.judge, result), value: result, status: statusOf(result), executionMs: Date.now() - startedAt });
    return result;
  } catch {
    const result = failedJudgeResult(providerLabel(input.judge));
    input.ledger.complete({ kind: 'judge', provider: providerLabel(input.judge), value: result, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt });
    return result;
  }
}

function recheckRequested(result: JudgeResult, packet: EvidencePacket): boolean {
  if (result.status !== 'SUCCESS' || !result.recommendation?.recommendedAdditionalTests.includes('REASONED_VISUAL_RECHECK')) return false;
  const references = packetReferenceIds(packet);
  return result.recommendation.missingEvidence.some((request) => Boolean(request.observationId && request.category && request.reasonCode && references.has(request.observationId)));
}

export async function runResearchTrial(input: ResearchRunnerInput, dependencies: ResearchRunnerDependencies): Promise<ResearchRunResult> {
  const mode = input.mode;
  const safetyMode = input.safetyMode ?? 'observe';
  const allowNetwork = input.allowNetwork === true;
  const moderation = dependencies.moderation ?? createMockModerationProvider();
  const observer = dependencies.observer ?? createMockVisionObserver();
  const judge = dependencies.judge ?? createMockJudge();
  const usesModeration = mode === 'MODERATION_ONLY' || mode === 'FULL' || mode === 'FULL_RECHECK' || mode === 'MOCK_ONLY';
  const usesObserver = mode === 'OBSERVER_ONLY' || mode === 'OBSERVER_REASONED' || mode === 'OBSERVER_AB' || mode === 'FULL' || mode === 'FULL_RECHECK' || mode === 'MOCK_ONLY';
  const usesJudge = mode === 'JUDGE_ONLY' || mode === 'FULL' || mode === 'FULL_RECHECK' || mode === 'MOCK_ONLY';
  const liveProviderUsed = (usesModeration && providerIsLive(moderation)) || (usesObserver && providerIsLive(observer)) || (usesJudge && providerIsLive(judge));
  if (liveProviderUsed && input.maxSamples === undefined) throw new Error('research_live_max_samples_required');
  const caps = normalizeCaps(input.caps, input.maxSamples);
  const ledger = new InvocationLedger(caps);
  const now = dependencies.now ?? (() => new Date().toISOString());

  if (mode === 'JUDGE_ONLY') {
    const packets = input.packets ?? [];
    const selected = input.maxSamples === undefined ? packets : packets.slice(0, input.maxSamples);
    if (selected.length > caps.maxSamples) throw new Error('research_max_samples_exceeded');
    const runId = input.runId ?? await deterministicRunId({ mode, sampleIds: selected.map((packet) => packet.sampleId) });
    const judgeOnlyResults: JudgeResult[] = [];
    for (const packet of selected) judgeOnlyResults.push(await callJudge({ judge, packet, requestId: `${runId}:${packet.sampleId}`, allowNetwork, ledger }));
    return { schemaVersion: RESEARCH_RUN_SCHEMA_VERSION, runId, mode, safetyMode, groundTruthLoaded: false, cases: [], judgeOnlyResults, invocationAccounting: ledger.snapshot(), enforcementAuthority: false };
  }

  const manifest = input.runtimeManifest;
  if (!manifest) throw new Error('research_runtime_manifest_required');
  const selectedEntries = input.maxSamples === undefined ? manifest.entries : manifest.entries.slice(0, input.maxSamples);
  if (selectedEntries.length > caps.maxSamples) throw new Error('research_max_samples_exceeded');
  const runId = input.runId ?? await deterministicRunId({ mode, sampleIds: selectedEntries.map((entry) => entry.sampleId) });
  const results: ResearchCaseResult[] = [];

  for (const entry of selectedEntries) {
    const caseRecord = createAuthenticityCase({ contentKind: 'image', processingMode: 'MODERATION_THEN_AUTHENTICITY' });
    let sample: ResearchSampleBytes;
    try {
      sample = await dependencies.readSample(entry);
    } catch {
      results.push({ sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, caseId: caseRecord.id, inputHash: null, status: 'FAILED', stoppedAt: null, preflight: null, moderation: null, observer: null, observerComparison: null, forensic: null, packet: null, judge: null, judgeHistory: [], recheckRounds: 0, errorCategory: 'SAMPLE_READ_FAILURE' });
      continue;
    }
    const mime = sample.mime ?? mimeFromResearchFilename(entry.path);
    const inputHash = await sha256Hex(sample.bytes);
    const inspection = inspectMedia(sample.bytes, mime);
    const timestamp = now();
    const preflight = emptyPreflight({ inputHash, mime, inspection, timestamp, signatureMime: detectMediaMime(sample.bytes) });
    const baseInput = { sampleId: entry.sampleId, inputHash, mime, bytes: sample.bytes, executionTimestamp: timestamp };
    let moderationResult: ModerationAnalysis | null = null;
    let observerResult: VisionObserverResult | null = null;
    let observerComparison: VisionObserverComparison | null = null;
    let forensic: ForensicFeatureBundle | null = null;
    let packet: EvidencePacket | null = null;
    let judgeResult: JudgeResult | null = null;
    let judgeHistory: JudgeResult[] = [];
    let recheckRounds = 0;
    const failedComponents: string[] = [];
    let status: ResearchCaseResult['status'] = 'COMPLETED';
    let stoppedAt: ResearchCaseResult['stoppedAt'] = null;

    if (usesModeration) {
      assertNetworkAllowed(moderation, allowNetwork, 'moderation');
      ledger.reserve('moderation');
      const startedAt = Date.now();
      try {
        moderationResult = await moderation.analyseImage({ caseId: caseRecord.id, mime, bytes: sample.bytes });
        ledger.complete({ kind: 'moderation', provider: providerLabel(moderation, moderationResult), value: moderationResult, status: statusOf(moderationResult), executionMs: Date.now() - startedAt, estimatedCostUsd: moderationResult.costEstimateUsd });
      } catch {
        failedComponents.push('moderation');
        ledger.complete({ kind: 'moderation', provider: providerLabel(moderation), value: null, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt });
      }
    }

    const moderationFailed = moderationResult === null || moderationResult.result === 'PROVIDER_FAILURE';
    if ((mode === 'FULL' || mode === 'FULL_RECHECK' || mode === 'MOCK_ONLY') && safetyMode === 'gate' && (moderationResult?.result === 'BLOCK' || moderationFailed)) {
      status = 'STOPPED';
      stoppedAt = 'SAFETY_GATE';
    } else {
      if (mode === 'FULL' || mode === 'FULL_RECHECK' || mode === 'MOCK_ONLY') {
        try {
          forensic = sanitizeForensicBundle(await generateForensicFeatureBundleV1({ caseId: caseRecord.id, mime, bytes: sample.bytes, now: timestamp }));
        } catch {
          failedComponents.push('forensics');
        }
      }
      if (usesObserver) {
        if (mode === 'OBSERVER_AB') {
          const direct = await callObserver({ observer, baseInput, request: requestForMode(input, 'DIRECT'), allowNetwork, ledger });
          const reasoned = await callObserver({ observer, baseInput, request: requestForMode(input, 'REASONED'), allowNetwork, ledger });
          observerResult = direct;
          observerComparison = compareVisionObserverResults({ sampleId: entry.sampleId, inputHash, direct, reasoned });
        } else {
          const reasoningMode: VisionObserverReasoningMode = mode === 'OBSERVER_REASONED' ? 'REASONED' : 'DIRECT';
          observerResult = await callObserver({ observer, baseInput, request: requestForMode(input, reasoningMode), allowNetwork, ledger });
        }
        if (observerResult.status === 'PROVIDER_FAILURE') failedComponents.push('vision-observer');
      }
    }

    packet = buildEvidencePacket({ runId, caseId: caseRecord.id, sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, preflight, forensicBundle: forensic, moderation: moderationResult, observer: observerResult, failedComponents, now: timestamp });

    if (usesJudge && stoppedAt === null) {
      judgeResult = await callJudge({ judge, packet, requestId: `${runId}:${entry.sampleId}:1`, allowNetwork, ledger });
      judgeHistory = [judgeResult];
      const wantsRecheck = (mode === 'FULL_RECHECK' || input.enableRecheck === true) && recheckRequested(judgeResult, packet) && caps.maxRecheckRounds >= 1 && observerResult?.status === 'SUCCESS';
      if (wantsRecheck && judgeHistory.length < MAX_JUDGE_PASSES_V1) {
        recheckRounds = 1;
        const directObservations = observerResult?.observations ?? [];
        const reasoned = await callObserver({ observer, baseInput, request: requestForMode(input, 'REASONED'), allowNetwork, ledger });
        const directStatuses = new Set(directObservations.map((observation) => `${observation.category}:${observation.status}`));
        const contradictoryObservationIds = reasoned.observations.filter((observation) => {
          const opposite = observation.status === 'OBSERVED' ? 'NOT_OBSERVED' : observation.status === 'NOT_OBSERVED' ? 'OBSERVED' : null;
          return opposite !== null && directStatuses.has(`${observation.category}:${opposite}`);
        }).flatMap((observation) => [observation.observationId, ...directObservations.filter((item) => item.category === observation.category).map((item) => item.observationId)]);
        packet = buildEvidencePacket({ runId, caseId: caseRecord.id, sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, preflight, forensicBundle: forensic, moderation: moderationResult, observer: reasoned, observationHistory: directObservations, contradictoryObservationIds, failedComponents, now: timestamp });
        const finalJudge = await callJudge({ judge, packet, requestId: `${runId}:${entry.sampleId}:2`, allowNetwork, ledger });
        judgeHistory.push(finalJudge);
        judgeResult = finalJudge;
      }
    }
    results.push({ sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, caseId: caseRecord.id, inputHash, status, stoppedAt, preflight, moderation: moderationResult, observer: observerResult, observerComparison, forensic, packet, judge: judgeResult, judgeHistory, recheckRounds, errorCategory: failedComponents.includes('forensics') ? 'FORENSIC_FAILURE' : null });
  }
  return { schemaVersion: RESEARCH_RUN_SCHEMA_VERSION, runId, mode, safetyMode, groundTruthLoaded: false, cases: results, judgeOnlyResults: [], invocationAccounting: ledger.snapshot(), enforcementAuthority: false };
}
