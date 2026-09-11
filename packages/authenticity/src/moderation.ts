import { createDecisionAudit, type ModerationDecision, type ModerationResult } from './contracts.ts';
import type { AuthenticityContentKind } from './types.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

export const MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION = 'lythaus-moderation-provider-evidence-v1' as const;

export type ModerationProviderEvidenceStatus = 'SUCCESS' | 'PROVIDER_FAILURE';

export type ModerationProviderErrorCategory =
  | 'MISSING_CREDENTIAL'
  | 'EMPTY_INPUT'
  | 'INVALID_MIME'
  | 'IMAGE_SIZE_LIMIT_EXCEEDED'
  | 'HTTP_AUTHENTICATION_FAILURE'
  | 'HTTP_RATE_LIMITED'
  | 'HTTP_SERVER_FAILURE'
  | 'HTTP_FAILURE'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'MALFORMED_RESPONSE'
  | 'UNEXPECTED_SCHEMA';

export interface ModerationProviderEvidence {
  schemaVersion: typeof MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION;
  provider: string;
  model: string;
  flagged: boolean | null;
  categories: Readonly<Record<string, boolean>>;
  categoryScores: Readonly<Record<string, number>>;
  categoryAppliedInputTypes: Readonly<Record<string, readonly string[]>>;
  executionMs: number;
  status: ModerationProviderEvidenceStatus;
  errorCategory?: ModerationProviderErrorCategory;
}

export interface ModerationTextInput {
  caseId: UUIDv7;
  text: string;
}

export interface ModerationImageInput {
  caseId: UUIDv7;
  mime: string;
  bytes: Uint8Array;
}

export interface ModerationVideoFrameInput {
  caseId: UUIDv7;
  mime: string;
  frame: Uint8Array;
  frameTimestampMs?: number;
}

export interface ModerationAnalysis {
  provider: string;
  result: ModerationResult;
  reasonCodes: readonly string[];
  modelVersion: string | null;
  executionMs: number;
  costEstimateUsd: number;
  providerEvidence?: ModerationProviderEvidence;
}

export interface ModerationProvider {
  analyseText(input: ModerationTextInput): Promise<ModerationAnalysis>;
  analyseImage(input: ModerationImageInput): Promise<ModerationAnalysis>;
  analyseVideoFrame(input: ModerationVideoFrameInput): Promise<ModerationAnalysis>;
}

export interface MockModerationProviderOptions {
  analyse?: (input: ModerationTextInput | ModerationImageInput | ModerationVideoFrameInput) => ModerationAnalysis | Promise<ModerationAnalysis>;
}

export function createMockModerationProvider(options: MockModerationProviderOptions = {}): ModerationProvider & { isLive: false } {
  const analyse = options.analyse ?? (async () => ({
    provider: 'mock-moderation',
    result: 'ALLOW' as const,
    reasonCodes: ['MOCK_PROVIDER'],
    modelVersion: 'mock-v1',
    executionMs: 0,
    costEstimateUsd: 0,
  }));
  const run = async (input: ModerationTextInput | ModerationImageInput | ModerationVideoFrameInput): Promise<ModerationAnalysis> => analyse(input);
  return {
    isLive: false,
    analyseText: run,
    analyseImage: run,
    analyseVideoFrame: run,
  };
}

export function unavailableModerationProvider(provider = 'unconfigured'): ModerationProvider {
  const analyse = async (): Promise<ModerationAnalysis> => ({
    provider,
    result: 'PROVIDER_FAILURE',
    reasonCodes: ['MODERATION_PROVIDER_UNAVAILABLE'],
    modelVersion: null,
    executionMs: 0,
    costEstimateUsd: 0,
  });
  return { analyseText: analyse, analyseImage: analyse, analyseVideoFrame: analyse };
}

export function createModerationDecision(caseId: UUIDv7, analysis: ModerationAnalysis): ModerationDecision {
  const finalClassification = analysis.result === 'BLOCK'
    ? 'BLOCK'
    : analysis.result === 'ALLOW'
      ? 'ALLOW'
      : 'REVIEW';
  return {
    id: uuidv7(),
    caseId,
    provider: analysis.provider,
    result: analysis.result,
    reasonCodes: analysis.reasonCodes,
    audit: createDecisionAudit({
      modelVersion: analysis.modelVersion,
      reasonCodes: analysis.reasonCodes,
      executionMs: analysis.executionMs,
      costEstimateUsd: analysis.costEstimateUsd,
      finalClassification,
      applicability: analysis.result === 'PROVIDER_FAILURE' ? 'unavailable' : 'applicable',
      uncertainty: analysis.result === 'PROVIDER_FAILURE'
        ? { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'The moderation provider did not return a decision.' }
        : { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'Provider calibration is not part of Foundation 001.' },
    }),
  };
}

export function moderationMethodForContent(kind: AuthenticityContentKind): 'text' | 'image' | 'videoFrame' | 'unsupported' {
  if (kind === 'text' || kind === 'profile') return 'text';
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'videoFrame';
  return 'unsupported';
}
