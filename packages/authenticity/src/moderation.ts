import { createDecisionAudit, type ModerationDecision, type ModerationResult } from './contracts.ts';
import type { AuthenticityContentKind } from './types.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

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
}

export interface ModerationProvider {
  analyseText(input: ModerationTextInput): Promise<ModerationAnalysis>;
  analyseImage(input: ModerationImageInput): Promise<ModerationAnalysis>;
  analyseVideoFrame(input: ModerationVideoFrameInput): Promise<ModerationAnalysis>;
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
