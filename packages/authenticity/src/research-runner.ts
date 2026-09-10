import { createAuthenticityCase, type ForensicFeatureBundle } from './contracts.ts';
import { buildEvidencePacket, type EvidencePacket, type PacketPreflight } from './evidence-packet.ts';
import { generateForensicFeatureBundleV1, inspectMedia, sha256Hex } from './forensics.ts';
import { createMockJudge, type Judge, type JudgeResult } from './judge.ts';
import { createMockModerationProvider, type ModerationAnalysis, type ModerationProvider } from './moderation.ts';
import { detectMediaMime } from './media-intake.ts';
import { mimeFromResearchFilename } from './research-image.ts';
import { type RuntimeManifestEntry, type RuntimeResearchManifest } from './research-manifests.ts';
import { createMockVisionObserver, type VisionObserver, type VisionObserverResult } from './vision-observer.ts';
import { uuidv7 } from './uuid.ts';

export const RESEARCH_RUN_SCHEMA_VERSION = 'lythaus-wp004a-research-run-v1' as const;

export type ResearchRunMode = 'MOCK_ONLY' | 'MODERATION_ONLY' | 'OBSERVER_ONLY' | 'JUDGE_ONLY' | 'FULL';
export type ResearchSafetyMode = 'observe' | 'gate';
export type InvocationKind = 'moderation' | 'observer' | 'judge';

export interface InvocationCaps {
  maxSamples: number;
  maxModerationCalls: number;
  maxObserverCalls: number;
  maxJudgeCalls: number;
  maxTotalCalls: number;
}

export const DEFAULT_INVOCATION_CAPS: InvocationCaps = {
  maxSamples: 20,
  maxModerationCalls: 20,
  maxObserverCalls: 20,
  maxJudgeCalls: 20,
  maxTotalCalls: 60,
};

export interface InvocationRecord {
  kind: InvocationKind;
  provider: string;
  model: string | null;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  executionMs: number;
  retries: 0;
  estimatedCostUsd: number | null;
}

export interface InvocationAccounting {
  caps: InvocationCaps;
  calls: { moderation: number; observer: number; judge: number; total: number };
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
  forensic: ForensicFeatureBundle | null;
  packet: EvidencePacket | null;
  judge: JudgeResult | null;
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

function capFor(kind: InvocationKind, caps: InvocationCaps): number {
  if (kind === 'moderation') return caps.maxModerationCalls;
  if (kind === 'observer') return caps.maxObserverCalls;
  return caps.maxJudgeCalls;
}

function modelFromResult(kind: InvocationKind, value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { modelVersion?: unknown; model?: unknown };
  if (typeof candidate.model === 'string') return candidate.model;
  if (typeof candidate.modelVersion === 'string') return candidate.modelVersion;
  return kind === 'moderation' ? null : null;
}

class InvocationLedger {
  private readonly counts = { moderation: 0, observer: 0, judge: 0, total: 0 };
  private readonly records: InvocationRecord[] = [];
  private readonly caps: InvocationCaps;

  constructor(caps: InvocationCaps) {
    this.caps = caps;
    if (![caps.maxSamples, caps.maxModerationCalls, caps.maxObserverCalls, caps.maxJudgeCalls, caps.maxTotalCalls].every((value) => Number.isInteger(value) && value >= 0)) throw new Error('research_invocation_caps_invalid');
  }

  reserve(kind: InvocationKind): void {
    if (this.counts[kind] >= capFor(kind, this.caps) || this.counts.total >= this.caps.maxTotalCalls) throw new Error(`research_invocation_cap_exceeded:${kind}`);
    this.counts[kind] += 1;
    this.counts.total += 1;
  }

  complete(input: { kind: InvocationKind; provider: string; value: unknown; status: 'SUCCESS' | 'PROVIDER_FAILURE'; executionMs: number; estimatedCostUsd?: number | null }): void {
    this.records.push({ kind: input.kind, provider: input.provider, model: modelFromResult(input.kind, input.value), status: input.status, executionMs: Math.max(0, input.executionMs), retries: 0, estimatedCostUsd: input.estimatedCostUsd ?? null });
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
  const caps = {
    maxSamples: resolvedMaxSamples,
    maxModerationCalls: supplied.maxModerationCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxModerationCalls, resolvedMaxSamples),
    maxObserverCalls: supplied.maxObserverCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxObserverCalls, resolvedMaxSamples),
    maxJudgeCalls: supplied.maxJudgeCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxJudgeCalls, resolvedMaxSamples),
    maxTotalCalls: supplied.maxTotalCalls ?? Math.min(DEFAULT_INVOCATION_CAPS.maxTotalCalls, resolvedMaxSamples * 3),
  };
  if (!Number.isInteger(caps.maxSamples) || caps.maxSamples <= 0) throw new Error('research_max_samples_invalid');
  if (caps.maxModerationCalls > caps.maxSamples || caps.maxObserverCalls > caps.maxSamples || caps.maxJudgeCalls > caps.maxSamples) throw new Error('research_invocation_caps_exceed_samples');
  return caps;
}

function assertNetworkAllowed(provider: unknown, allowNetwork: boolean, kind: InvocationKind): void {
  if (providerIsLive(provider) && !allowNetwork) throw new Error(`research_network_disabled:${kind}`);
}

function statusOf(value: unknown): 'SUCCESS' | 'PROVIDER_FAILURE' {
  if (value && typeof value === 'object') {
    const status = (value as { status?: unknown }).status;
    if (status === 'PROVIDER_FAILURE') return 'PROVIDER_FAILURE';
    if ((value as { result?: unknown }).result === 'PROVIDER_FAILURE') return 'PROVIDER_FAILURE';
  }
  return 'SUCCESS';
}

async function deterministicRunId(input: { mode: ResearchRunMode; sampleIds: readonly string[] }): Promise<string> {
  const digest = await sha256Hex(new TextEncoder().encode(JSON.stringify(input)));
  return `wp004a-${digest.slice(0, 24)}`;
}

function emptyPreflight(input: { inputHash: string; mime: string; inspection: ReturnType<typeof inspectMedia>; timestamp: string; signatureMime: string | null }): NonNullable<ResearchCaseResult['preflight']> {
  return {
    inputHash: input.inputHash,
    mime: input.mime,
    dimensions: input.inspection.dimensions,
    executionTimestamp: input.timestamp,
    signatureMime: input.signatureMime,
    format: input.inspection.format || null,
    readable: input.inspection.dimensions !== null,
  };
}

function sanitizeForensicBundle(bundle: ForensicFeatureBundle): ForensicFeatureBundle {
  return {
    ...bundle,
    fileProvenance: {
      ...bundle.fileProvenance,
      encoderInformation: bundle.fileProvenance.encoderInformation ? 'PRESENT_REDACTED' : null,
    },
  };
}

export async function runResearchTrial(input: ResearchRunnerInput, dependencies: ResearchRunnerDependencies): Promise<ResearchRunResult> {
  const mode = input.mode;
  const safetyMode = input.safetyMode ?? 'observe';
  const allowNetwork = input.allowNetwork === true;
  const moderation = dependencies.moderation ?? createMockModerationProvider();
  const observer = dependencies.observer ?? createMockVisionObserver();
  const judge = dependencies.judge ?? createMockJudge();
  const liveProviderUsed = (mode === 'MODERATION_ONLY' || mode === 'FULL' || mode === 'MOCK_ONLY') && providerIsLive(moderation)
    || (mode === 'OBSERVER_ONLY' || mode === 'FULL' || mode === 'MOCK_ONLY') && providerIsLive(observer)
    || (mode === 'JUDGE_ONLY' || mode === 'FULL' || mode === 'MOCK_ONLY') && providerIsLive(judge);
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
    for (const packet of selected) {
      assertNetworkAllowed(judge, allowNetwork, 'judge');
      ledger.reserve('judge');
      const startedAt = Date.now();
      try {
        const result = await judge.judge({ packet, requestId: `${runId}:${packet.sampleId}` });
        ledger.complete({ kind: 'judge', provider: providerLabel(judge, result), value: result, status: statusOf(result), executionMs: Date.now() - startedAt });
        judgeOnlyResults.push(result);
      } catch {
        ledger.complete({ kind: 'judge', provider: providerLabel(judge), value: null, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt });
        judgeOnlyResults.push({ schemaVersion: 'lythaus-judge-result-v1', promptVersion: 'lythaus-gpt-oss-judge-prompt-v1', prompt: '', provider: providerLabel(judge), model: null, status: 'PROVIDER_FAILURE', recommendation: null, executionMs: Date.now() - startedAt, errorCategory: 'NETWORK_FAILURE' });
      }
    }
    return { schemaVersion: RESEARCH_RUN_SCHEMA_VERSION, runId, mode, safetyMode, groundTruthLoaded: false, cases: [], judgeOnlyResults, invocationAccounting: ledger.snapshot(), enforcementAuthority: false };
  }

  const manifest = input.runtimeManifest;
  if (!manifest) throw new Error('research_runtime_manifest_required');
  const entries = manifest.entries;
  if (input.maxSamples !== undefined && input.maxSamples > caps.maxSamples) throw new Error('research_max_samples_exceeded');
  const selectedEntries = input.maxSamples === undefined ? entries : entries.slice(0, input.maxSamples);
  if (selectedEntries.length > caps.maxSamples) throw new Error('research_max_samples_exceeded');
  const runId = input.runId ?? await deterministicRunId({ mode, sampleIds: selectedEntries.map((entry) => entry.sampleId) });
  const results: ResearchCaseResult[] = [];

  for (const entry of selectedEntries) {
    const caseRecord = createAuthenticityCase({ contentKind: 'image', processingMode: 'MODERATION_THEN_AUTHENTICITY' });
    let sample: ResearchSampleBytes;
    try {
      sample = await dependencies.readSample(entry);
    } catch {
      results.push({ sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, caseId: caseRecord.id, inputHash: null, status: 'FAILED', stoppedAt: null, preflight: null, moderation: null, observer: null, forensic: null, packet: null, judge: null, errorCategory: 'SAMPLE_READ_FAILURE' });
      continue;
    }
    const mime = sample.mime ?? mimeFromResearchFilename(entry.path);
    const inputHash = await sha256Hex(sample.bytes);
    const inspection = inspectMedia(sample.bytes, mime);
    const timestamp = now();
    const preflight = emptyPreflight({ inputHash, mime, inspection, timestamp, signatureMime: detectMediaMime(sample.bytes) });
    let moderationResult: ModerationAnalysis | null = null;
    let observerResult: VisionObserverResult | null = null;
    let forensic: ForensicFeatureBundle | null = null;
    let packet: EvidencePacket | null = null;
    let judgeResult: JudgeResult | null = null;
    const failedComponents: string[] = [];
    let status: ResearchCaseResult['status'] = 'COMPLETED';
    let stoppedAt: ResearchCaseResult['stoppedAt'] = null;

    if (mode === 'MODERATION_ONLY' || mode === 'FULL' || mode === 'MOCK_ONLY') {
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

    if (mode === 'FULL' || mode === 'MOCK_ONLY') {
      const moderationFailed = moderationResult === null || moderationResult.result === 'PROVIDER_FAILURE';
      if (safetyMode === 'gate' && (moderationResult?.result === 'BLOCK' || moderationFailed)) {
        status = 'STOPPED';
        stoppedAt = 'SAFETY_GATE';
      } else {
        try {
          forensic = sanitizeForensicBundle(await generateForensicFeatureBundleV1({ caseId: caseRecord.id, mime, bytes: sample.bytes, now: timestamp }));
        } catch {
          failedComponents.push('forensics');
        }
        assertNetworkAllowed(observer, allowNetwork, 'observer');
        ledger.reserve('observer');
        const startedAt = Date.now();
        try {
          observerResult = await observer.observe({ sampleId: entry.sampleId, inputHash, mime, bytes: sample.bytes, executionTimestamp: timestamp });
          ledger.complete({ kind: 'observer', provider: providerLabel(observer, observerResult), value: observerResult, status: statusOf(observerResult), executionMs: Date.now() - startedAt });
        } catch {
          failedComponents.push('vision-observer');
          ledger.complete({ kind: 'observer', provider: providerLabel(observer), value: null, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt });
        }
      }
    } else if (mode === 'OBSERVER_ONLY') {
      assertNetworkAllowed(observer, allowNetwork, 'observer');
      ledger.reserve('observer');
      const startedAt = Date.now();
      try {
        observerResult = await observer.observe({ sampleId: entry.sampleId, inputHash, mime, bytes: sample.bytes, executionTimestamp: timestamp });
        ledger.complete({ kind: 'observer', provider: providerLabel(observer, observerResult), value: observerResult, status: statusOf(observerResult), executionMs: Date.now() - startedAt });
      } catch {
        failedComponents.push('vision-observer');
        ledger.complete({ kind: 'observer', provider: providerLabel(observer), value: null, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt });
      }
    }

    packet = buildEvidencePacket({
      runId,
      caseId: caseRecord.id,
      sampleId: entry.sampleId,
      sourceFamilyId: entry.sourceFamilyId,
      preflight,
      forensicBundle: forensic,
      moderation: moderationResult,
      observer: observerResult,
      failedComponents,
      now: timestamp,
    });

    if ((mode === 'FULL' || mode === 'MOCK_ONLY') && stoppedAt === null) {
      assertNetworkAllowed(judge, allowNetwork, 'judge');
      ledger.reserve('judge');
      const startedAt = Date.now();
      try {
        judgeResult = await judge.judge({ packet, requestId: `${runId}:${entry.sampleId}` });
        ledger.complete({ kind: 'judge', provider: providerLabel(judge, judgeResult), value: judgeResult, status: statusOf(judgeResult), executionMs: Date.now() - startedAt });
      } catch {
        failedComponents.push('judge');
        ledger.complete({ kind: 'judge', provider: providerLabel(judge), value: null, status: 'PROVIDER_FAILURE', executionMs: Date.now() - startedAt });
      }
    }
    results.push({ sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, caseId: caseRecord.id, inputHash, status, stoppedAt, preflight, moderation: moderationResult, observer: observerResult, forensic, packet, judge: judgeResult, errorCategory: failedComponents.includes('forensics') ? 'FORENSIC_FAILURE' : null });
  }
  return { schemaVersion: RESEARCH_RUN_SCHEMA_VERSION, runId, mode, safetyMode, groundTruthLoaded: false, cases: results, judgeOnlyResults: [], invocationAccounting: ledger.snapshot(), enforcementAuthority: false };
}
