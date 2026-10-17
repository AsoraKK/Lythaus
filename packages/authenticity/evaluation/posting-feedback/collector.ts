import { createOpenAIModerationProvider, OPENAI_MODERATION_ENDPOINT } from '../../src/openai-moderation.ts';
import { OPENAI_MODERATION_MODEL } from '../../src/research-config.ts';
import type { UUIDv7 } from '../../src/uuid.ts';
import { CATEGORIES, declarationResult, hash, strictSafetySchema, type Fixture } from './harness.ts';

export const PROBE_SELECTION_HASH = 'c8882fa321e8e0073a5859814dcc86287651aa2d3b9b3170b16bd009cd6e1ed6';
export const PROBE_LIMITS = Object.freeze({ samples: 20, requests: 20, retries: 0, windowMs: 600_000,
  requestTimeoutMs: 15_000, maxResponseBytes: 262_144, maxIncrementalTotalUsd: 0 });
const selectionFields = ['id', 'familyId', 'split', 'body', 'declaration', 'scenarioAuthorship', 'slices', 'revision'] as const;
const trustedReceipts = new WeakMap<object, string>();

export interface CollectionGate {
  reviewedSourceSha: string; observedSourceSha: string;
  reviewedCollectorHash: string; observedCollectorHash: string;
  existingCredentialAuthorityVerified: boolean; existingProviderScopeVerified: boolean;
  includedExecutionAndStorageVerified: boolean; providerPriceVerifiedUsd: number; maxIncrementalTotalUsd: number;
  existingExecutionResource: string; evidenceReference: string;
  bindingName: 'OPENAI_API_KEY'; provider: 'openai'; model: typeof OPENAI_MODERATION_MODEL;
  endpoint: typeof OPENAI_MODERATION_ENDPOINT; privateDataExcluded: boolean;
  retentionDays: number; retentionResolved: boolean;
}

export interface ReceiptLedger {
  durability: 'DURABLE_LOCAL' | 'DURABLE_DATABASE' | 'SYNTHETIC_IN_MEMORY';
  claimProbe(binding: { selectionHash: string; sourceSha: string; collectorHash: string }): Promise<boolean>;
  claimAttempt(binding: { sampleId: string; inputHash: string; revision: number }): Promise<boolean>;
  persistReceipt(receipt: CollectedReceipt): Promise<void>;
}

export interface CollectedReceipt {
  schemaVersion: string; sampleId: string; familyId: string; split: string; revision: number; inputHash: string;
  selectionHash: string; sourceSha: string; collectorHash: string; evidenceClass: string; inputClass: string;
  provider: string; requestedModel: string; responseModel: string | null; providerSnapshotKnown: boolean;
  responseHash: string | null; transportCalls: number; actualProviderRequests: number; httpStatus: number | null;
  adapterStatus: string; adapterAccepted: boolean; evidenceSchema: string | null; schemaValid: boolean; flagged: boolean | null;
  categoryFlags: Readonly<Record<string, boolean>>; categoryScores: Readonly<Record<string, number>>;
  appliedInputTypes: Readonly<Record<string, readonly string[]>>; executionMs: number; latencySource: string;
  failure: string | null; delivery: string; safetyBand: string; explanation: string;
  rawFeedback: { flagged: boolean | null; categoryFlags: Record<string, boolean>; categoryScores: Record<string, number>;
    appliedInputTypes: Record<string, string[]> };
  authorship: { qualifiedTextDetector: boolean; band: string; uncertainty: string };
  declaration: ReturnType<typeof declarationResult>;
  authority: { publicPosting: string; publicationEligible: boolean; enforcementEnabled: boolean; rewardsEligible: boolean; decisionWritten: boolean };
  probabilityCalibration: string; artifactAuthenticity: string;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertTrustedCollectedReceipt(receipt: CollectedReceipt): void {
  if (trustedReceipts.get(receipt) !== JSON.stringify(receipt)) throw new Error('collection_untrusted_receipt');
}

export async function verifyProbeSelection(fixtures: readonly Fixture[]): Promise<void> {
  if (fixtures.length !== PROBE_LIMITS.samples) throw new Error('collection_wrong_sample_count');
  const selected = fixtures.map(fixture => Object.fromEntries(selectionFields.map(field => [field, fixture[field]])));
  if (await hash(JSON.stringify(selected)) !== PROBE_SELECTION_HASH) throw new Error('collection_wrong_selection');
}

export function assertCollectionGate(gate: CollectionGate, apiKey: string, ledger: ReceiptLedger,
  mode: 'ACTUAL_PROVIDER_OBSERVATION' | 'SYNTHETIC_TRANSPORT_TEST_ONLY'): void {
  if (!gate || !/^[a-f0-9]{40}$/.test(gate.reviewedSourceSha) || gate.reviewedSourceSha !== gate.observedSourceSha
    || !/^[a-f0-9]{64}$/.test(gate.reviewedCollectorHash) || gate.reviewedCollectorHash !== gate.observedCollectorHash)
    throw new Error('collection_unreviewed_source');
  if (!apiKey || !gate.existingCredentialAuthorityVerified || !gate.existingProviderScopeVerified
    || gate.bindingName !== 'OPENAI_API_KEY' || gate.provider !== 'openai' || gate.model !== OPENAI_MODERATION_MODEL
    || gate.endpoint !== OPENAI_MODERATION_ENDPOINT) throw new Error('collection_existing_authority_unverified');
  if (!gate.includedExecutionAndStorageVerified || gate.providerPriceVerifiedUsd !== 0 || gate.maxIncrementalTotalUsd !== 0
    || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(gate.existingExecutionResource)
    || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(gate.evidenceReference)) throw new Error('collection_zero_cost_unverified');
  if (!gate.privateDataExcluded || !gate.retentionResolved || gate.retentionDays !== 7)
    throw new Error('collection_data_or_retention_unresolved');
  if (ledger.durability !== 'DURABLE_LOCAL' && ledger.durability !== 'DURABLE_DATABASE')
    throw new Error('collection_durable_ledger_required');
  if (mode === 'ACTUAL_PROVIDER_OBSERVATION' && ledger.durability !== 'DURABLE_DATABASE')
    throw new Error('collection_seven_day_database_retention_required');
}

interface CollectorOptions {
  fixtures: readonly Fixture[]; ledger: ReceiptLedger; gate: CollectionGate; apiKey: string; signal?: AbortSignal;
}
interface SyntheticOptions extends CollectorOptions {
  fetchImpl: typeof fetch; now?: () => number; requestTimeoutMs?: number;
}

async function boundedBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const length = response.headers.get('content-length');
  if (length && Number(length) > PROBE_LIMITS.maxResponseBytes) throw new Error('collection_response_size_limit');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('collection_interrupted');
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > PROBE_LIMITS.maxResponseBytes) throw new Error('collection_response_size_limit');
      chunks.push(next.value);
    }
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener('abort', cancel); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function hashResponseBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function interruptible<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('collection_interrupted');
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('collection_interrupted'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([task(), interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

async function collect(options: CollectorOptions, mode: 'ACTUAL_PROVIDER_OBSERVATION' | 'SYNTHETIC_TRANSPORT_TEST_ONLY',
  fetchImpl: typeof fetch, now: () => number, timeoutMs: number) {
  const fixtures = structuredClone(options.fixtures);
  const apiKey = options.apiKey;
  await verifyProbeSelection(fixtures);
  const gate = structuredClone(options.gate);
  assertCollectionGate(gate, apiKey, options.ledger, mode);
  if (options.signal?.aborted) throw new Error('collection_interrupted');
  if (!await options.ledger.claimProbe({ selectionHash: PROBE_SELECTION_HASH, sourceSha: gate.observedSourceSha,
    collectorHash: gate.observedCollectorHash })) throw new Error('collection_probe_already_claimed');
  const stop = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, stop.signal]) : stop.signal;
  const window = setTimeout(() => stop.abort(), PROBE_LIMITS.windowMs);
  const started = now(); let previous = started; let attemptedRequests = 0;
  const receipts: CollectedReceipt[] = []; let completion = 'COMPLETED_UNQUALIFIED_FEEDBACK_COLLECTION';
  try {
    for (const fixture of fixtures) {
      const tick = now();
      if (!Number.isFinite(tick) || tick < previous || tick - started >= PROBE_LIMITS.windowMs || signal.aborted) {
        completion = 'STOPPED_INTERRUPTED_OR_WINDOW_EXPIRED'; break;
      }
      previous = tick;
      const inputHash = await hash(fixture.body);
      if (!await options.ledger.claimAttempt({ sampleId: fixture.id, inputHash, revision: fixture.revision })) {
        completion = 'STOPPED_REPLAY_OR_UNCERTAIN_PRIOR_ATTEMPT'; break;
      }
      const captured = { responseHash: null as string | null, model: null as string | null,
        httpStatus: null as number | null, failure: null as string | null, rawJsonValid: false,
        rawFeedback: { flagged: null as boolean | null, categoryFlags: {} as Record<string, boolean>,
          categoryScores: {} as Record<string, number>, appliedInputTypes: {} as Record<string, string[]> } };
      let calls = 0;
      const transport = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (calls !== 0 || attemptedRequests >= PROBE_LIMITS.requests || signal.aborted
          || String(input) !== OPENAI_MODERATION_ENDPOINT || init?.method !== 'POST' || init.redirect !== 'manual'
          || init.body !== JSON.stringify({ model: OPENAI_MODERATION_MODEL, input: fixture.body }))
          throw new Error('collection_transport_boundary');
        calls += 1; attemptedRequests += 1;
        const requestSignal = AbortSignal.any([signal, init.signal!]);
        try {
          return await interruptible(async () => {
            const response = await fetchImpl(input, { ...init, signal: requestSignal });
            captured.httpStatus = response.status;
            const body = await boundedBody(response, requestSignal);
            captured.responseHash = await hashResponseBytes(body);
            try {
              const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
              captured.rawJsonValid = true;
              if (typeof parsed?.model === 'string' && /^omni-moderation-[a-z0-9.-]{1,80}$/.test(parsed.model)) captured.model = parsed.model;
              const result = Array.isArray(parsed?.results) ? parsed.results[0] : null;
              if (typeof result?.flagged === 'boolean') captured.rawFeedback.flagged = result.flagged;
              for (const category of CATEGORIES) {
                if (typeof result?.categories?.[category] === 'boolean') captured.rawFeedback.categoryFlags[category] = result.categories[category];
                const score = result?.category_scores?.[category];
                if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1) captured.rawFeedback.categoryScores[category] = score;
                const types = result?.category_applied_input_types?.[category];
                if (Array.isArray(types)) captured.rawFeedback.appliedInputTypes[category] = types
                  .filter(value => value === 'text' || value === 'image').slice(0, 8);
              }
            } catch {}
            return new Response([204, 205, 304].includes(response.status) ? null : body,
              { status: response.status, headers: { 'content-type': 'application/json' } });
          }, requestSignal);
        } catch (error) {
          captured.failure = error instanceof Error && error.message === 'collection_response_size_limit'
            ? 'RESPONSE_SIZE_LIMIT_EXCEEDED' : requestSignal.aborted ? 'INTERRUPTED_OR_TIMEOUT' : 'TRANSPORT_OR_RESPONSE_READ_FAILURE';
          throw new Error('collection_transport_failed');
        }
      }) as typeof fetch;
      const analysis = await createOpenAIModerationProvider({ apiKey, fetchImpl: transport,
        timeoutMs, now, flaggedResult: 'REVIEW' }).analyseText({ caseId: fixture.id as UUIDv7, text: fixture.body });
      const valid = captured.rawJsonValid && strictSafetySchema(analysis); const evidence = analysis.providerEvidence;
      const categories = Object.fromEntries(CATEGORIES.filter(category => typeof evidence?.categories[category] === 'boolean')
        .map(category => [category, evidence!.categories[category]]));
      const scores = Object.fromEntries(CATEGORIES.filter(category => Number.isFinite(evidence?.categoryScores[category]))
        .map(category => [category, evidence!.categoryScores[category]]));
      const modalities = Object.fromEntries(CATEGORIES.filter(category => Array.isArray(evidence?.categoryAppliedInputTypes[category]))
        .map(category => [category, evidence!.categoryAppliedInputTypes[category].filter(value => value === 'text' || value === 'image')]));
      const receipt: CollectedReceipt = freeze({ schemaVersion: 'lythaus-bounded-moderation-receipt-v1',
        sampleId: fixture.id, familyId: fixture.familyId, split: fixture.split, revision: fixture.revision, inputHash,
        selectionHash: PROBE_SELECTION_HASH, sourceSha: gate.observedSourceSha, collectorHash: gate.observedCollectorHash,
        evidenceClass: mode, inputClass: 'ARTIFICIAL_AGENT_WRITTEN_NOT_HUMAN_GROUND_TRUTH',
        provider: 'openai', requestedModel: OPENAI_MODERATION_MODEL, responseModel: captured.model,
        providerSnapshotKnown: false, responseHash: captured.responseHash, transportCalls: calls,
        actualProviderRequests: mode === 'ACTUAL_PROVIDER_OBSERVATION' ? calls : 0,
        httpStatus: captured.httpStatus, adapterStatus: analysis.result, adapterAccepted: evidence?.status === 'SUCCESS',
        evidenceSchema: evidence?.schemaVersion ?? null, schemaValid: valid, flagged: evidence?.flagged ?? null,
        categoryFlags: categories, categoryScores: scores, appliedInputTypes: modalities,
        executionMs: analysis.executionMs, latencySource: mode === 'ACTUAL_PROVIDER_OBSERVATION' ? 'MONOTONIC_PERFORMANCE_CLOCK' : 'SYNTHETIC_TEST_CLOCK',
        failure: captured.failure ?? evidence?.errorCategory ?? (valid ? null : 'EVALUATION_SCHEMA_OR_CONSISTENCY_FAILURE'),
        rawFeedback: captured.rawFeedback,
        delivery: captured.responseHash ? 'RESPONSE_CAPTURED' : calls ? 'UNKNOWN_NO_RETRY' : 'NOT_SENT',
        safetyBand: valid ? evidence?.flagged ? 'REVIEW' : 'ALLOW_EVIDENCE' : 'ABSTAIN',
        explanation: valid ? 'Provider safety flags only; no authorship or publishing authority.' : 'No usable safety finding; stop collection without retry.',
        authorship: { qualifiedTextDetector: false, band: 'ABSTAIN', uncertainty: 'NO_QUALIFIED_TEXT_AUTHORSHIP_EVIDENCE' },
        declaration: declarationResult(fixture),
        authority: { publicPosting: 'WITHHELD', publicationEligible: false, enforcementEnabled: false, rewardsEligible: false, decisionWritten: false },
        probabilityCalibration: 'NONE', artifactAuthenticity: 'IN_PROCESS_TRUSTED_DERIVATION_PERSISTED_HASH_NOT_AUTHENTICATION' });
      trustedReceipts.set(receipt, JSON.stringify(receipt));
      assertTrustedCollectedReceipt(receipt);
      await options.ledger.persistReceipt(receipt);
      receipts.push(receipt);
      if (!valid || calls !== 1) { completion = 'STOPPED_FAILURE_OR_INVALID_EVIDENCE'; break; }
    }
    return freeze({ schemaVersion: 'lythaus-bounded-moderation-collection-v1', evidenceClass: mode,
      selectionHash: PROBE_SELECTION_HASH, sourceSha: gate.observedSourceSha, collectorHash: gate.observedCollectorHash,
      completion, attemptedRequests, actualProviderRequests: mode === 'ACTUAL_PROVIDER_OBSERVATION' ? attemptedRequests : 0,
      limits: PROBE_LIMITS, receipts, retentionDays: gate.retentionDays, retentionDeletionExecuted: false,
      thresholds: 'UNEVALUATED', publicPosting: 'WITHHELD', publicationEligible: false });
  } finally { clearTimeout(window); }
}

// No import-time execution, CLI, credential lookup, runtime wiring or live call in tests.
// The caller must establish the referenced source/resource/authority/cost/retention
// facts independently. These operator attestations are not an access certificate.
export function collectApprovedTextProbe(options: CollectorOptions) {
  if (['fetchImpl', 'now', 'requestTimeoutMs'].some(key => Object.hasOwn(options, key)))
    throw new Error('collection_live_override_forbidden');
  return collect(options, 'ACTUAL_PROVIDER_OBSERVATION', globalThis.fetch, () => performance.now(), PROBE_LIMITS.requestTimeoutMs);
}

export function simulateTextProbe(options: SyntheticOptions) {
  return collect(options, 'SYNTHETIC_TRANSPORT_TEST_ONLY', options.fetchImpl, options.now ?? (() => performance.now()),
    options.requestTimeoutMs ?? PROBE_LIMITS.requestTimeoutMs);
}
