import {
  MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION,
  type ModerationAnalysis,
  type ModerationImageInput,
  type ModerationProvider,
  type ModerationProviderErrorCategory,
  type ModerationProviderEvidence,
  type ModerationTextInput,
  type ModerationVideoFrameInput,
} from './moderation.ts';
import { OPENAI_MODERATION_MODEL } from './research-config.ts';
import { assertResearchImageInput, bytesToDataUrl, DEFAULT_RESEARCH_IMAGE_SIZE_LIMIT } from './research-image.ts';

export const OPENAI_MODERATION_ENDPOINT = 'https://api.openai.com/v1/moderations' as const;

export interface OpenAIModerationProviderOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  maxImageBytes?: number;
  timeoutMs?: number;
  flaggedResult?: 'REVIEW' | 'BLOCK';
  now?: () => number;
}

interface ParsedModerationResponse {
  model: string;
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  categoryAppliedInputTypes: Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBooleanRecord(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === 'boolean')) return null;
  return Object.fromEntries(entries.map(([key, item]) => [key, item as boolean]));
}

function parseScoreRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1)) return null;
  return Object.fromEntries(entries.map(([key, item]) => [key, item as number]));
}

function parseAppliedInputTypes(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => Array.isArray(item) && item.every((entry) => typeof entry === 'string'))) return null;
  return Object.fromEntries(entries.map(([key, item]) => [key, (item as string[]).slice(0, 8)]));
}

function parseModerationResponse(value: unknown, expectedModel: string): ParsedModerationResponse | null {
  if (!isRecord(value) || typeof value.model !== 'string' || value.model !== expectedModel || !Array.isArray(value.results) || value.results.length < 1) return null;
  const result = value.results[0];
  if (!isRecord(result) || typeof result.flagged !== 'boolean') return null;
  const categories = parseBooleanRecord(result.categories);
  const categoryScores = parseScoreRecord(result.category_scores);
  const categoryAppliedInputTypes = parseAppliedInputTypes(result.category_applied_input_types);
  if (!categories || !categoryScores || !categoryAppliedInputTypes) return null;
  return { model: value.model, flagged: result.flagged, categories, categoryScores, categoryAppliedInputTypes };
}

function errorCategoryForStatus(status: number): ModerationProviderErrorCategory {
  if (status === 401 || status === 403) return 'HTTP_AUTHENTICATION_FAILURE';
  if (status === 429) return 'HTTP_RATE_LIMITED';
  if (status >= 500) return 'HTTP_SERVER_FAILURE';
  return 'HTTP_FAILURE';
}

function failureAnalysis(input: {
  model: string;
  errorCategory: ModerationProviderErrorCategory;
  executionMs: number;
}): ModerationAnalysis {
  const providerEvidence: ModerationProviderEvidence = {
    schemaVersion: MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION,
    provider: 'openai',
    model: input.model,
    flagged: null,
    categories: {},
    categoryScores: {},
    categoryAppliedInputTypes: {},
    executionMs: input.executionMs,
    status: 'PROVIDER_FAILURE',
    errorCategory: input.errorCategory,
  };
  return {
    provider: 'openai',
    result: 'PROVIDER_FAILURE',
    reasonCodes: [`OPENAI_MODERATION_${input.errorCategory}`],
    modelVersion: input.model,
    executionMs: input.executionMs,
    costEstimateUsd: 0,
    providerEvidence,
  };
}

function successAnalysis(input: { model: string; parsed: ParsedModerationResponse; executionMs: number; flaggedResult: 'REVIEW' | 'BLOCK' }): ModerationAnalysis {
  const providerEvidence: ModerationProviderEvidence = {
    schemaVersion: MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION,
    provider: 'openai',
    model: input.parsed.model,
    flagged: input.parsed.flagged,
    categories: input.parsed.categories,
    categoryScores: input.parsed.categoryScores,
    categoryAppliedInputTypes: input.parsed.categoryAppliedInputTypes,
    executionMs: input.executionMs,
    status: 'SUCCESS',
  };
  return {
    provider: 'openai',
    result: input.parsed.flagged ? input.flaggedResult : 'ALLOW',
    reasonCodes: input.parsed.flagged ? ['OPENAI_PROVIDER_FLAGGED_REQUIRES_LYTHAUS_POLICY'] : ['OPENAI_PROVIDER_NOT_FLAGGED'],
    modelVersion: input.parsed.model,
    executionMs: input.executionMs,
    costEstimateUsd: 0,
    providerEvidence,
  };
}

export function createOpenAIModerationProvider(options: OpenAIModerationProviderOptions = {}): ModerationProvider & { isLive: true } {
  const model = OPENAI_MODERATION_MODEL;
  const endpoint = options.endpoint ?? OPENAI_MODERATION_ENDPOINT;
  const fetcher = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const flaggedResult = options.flaggedResult ?? 'REVIEW';
  const maxImageBytes = options.maxImageBytes ?? DEFAULT_RESEARCH_IMAGE_SIZE_LIMIT;

  async function request(input: string | { bytes: Uint8Array; mime: string }): Promise<ModerationAnalysis> {
    const startedAt = now();
    if (!options.apiKey) return failureAnalysis({ model, errorCategory: 'MISSING_CREDENTIAL', executionMs: now() - startedAt });
    if (typeof input === 'object') {
      try {
        assertResearchImageInput({ bytes: input.bytes, mime: input.mime, maxBytes: maxImageBytes });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const errorCategory: ModerationProviderErrorCategory = message === 'research_image_empty'
          ? 'EMPTY_INPUT'
          : message === 'research_image_size_limit_exceeded'
            ? 'IMAGE_SIZE_LIMIT_EXCEEDED'
            : 'INVALID_MIME';
        return failureAnalysis({ model, errorCategory, executionMs: now() - startedAt });
      }
    }
    const payload = typeof input === 'string'
      ? { model, input }
      : { model, input: [{ type: 'image_url', image_url: { url: bytesToDataUrl(input.bytes, input.mime) } }] };
    const timeoutMs = options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      timeoutHandle = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return failureAnalysis({ model, errorCategory: errorCategoryForStatus(response.status), executionMs: now() - startedAt });
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        return failureAnalysis({ model, errorCategory: 'MALFORMED_RESPONSE', executionMs: now() - startedAt });
      }
      const parsed = parseModerationResponse(raw, model);
      if (!parsed) return failureAnalysis({ model, errorCategory: 'UNEXPECTED_SCHEMA', executionMs: now() - startedAt });
      return successAnalysis({ model, parsed, executionMs: now() - startedAt, flaggedResult });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return failureAnalysis({ model, errorCategory: message === 'AbortError' || controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE', executionMs: now() - startedAt });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  return {
    isLive: true,
    analyseText: (input: ModerationTextInput) => request(input.text),
    analyseImage: (input: ModerationImageInput) => request({ bytes: input.bytes, mime: input.mime }),
    analyseVideoFrame: (input: ModerationVideoFrameInput) => request({ bytes: input.frame, mime: input.mime }),
  };
}

export function assertModerationProviderEvidence(evidence: ModerationProviderEvidence): void {
  if (evidence.schemaVersion !== MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION) throw new Error('moderation_provider_evidence_schema_invalid');
  if (!Number.isFinite(evidence.executionMs) || evidence.executionMs < 0) throw new Error('moderation_provider_evidence_execution_invalid');
  if (evidence.status === 'SUCCESS' && evidence.flagged === null) throw new Error('moderation_provider_evidence_flagged_missing');
  if (evidence.status === 'PROVIDER_FAILURE' && evidence.errorCategory === undefined) throw new Error('moderation_provider_evidence_error_missing');
}
