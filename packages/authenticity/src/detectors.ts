import type { JsonValue } from './contracts.ts';

export const DETECTOR_CONTRACT_VERSION = 'lythaus-authenticity-detectors-v1' as const;
export const EVIDENCE_COMPILER_VERSION = 'lythaus-synthetic-evidence-compiler-v1' as const;

export const DETECTOR_STATUSES = ['OK', 'TIMEOUT', 'ERROR', 'UNAVAILABLE', 'RIGHTS_BLOCKED', 'RUNTIME_BLOCKED', 'SHADOW_ONLY'] as const;
export type DetectorStatus = (typeof DETECTOR_STATUSES)[number];
export type RawScoreDirection = 'HIGHER_SYNTHETIC' | 'LOWER_SYNTHETIC' | 'UNKNOWN';
export type DetectorSupportLevel = 'STRONG_CONTRADICTS' | 'WEAK_CONTRADICTS' | 'NEUTRAL' | 'WEAK_SUPPORT' | 'MODERATE_SUPPORT' | 'STRONG_SUPPORT';
export type DetectorEvidenceFamily = 'EF3_SPECTRAL_SYNTHETIC' | 'EF3_LEARNED_SYNTHETIC';
export type SyntheticEvidenceBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
export type SyntheticResolution = 'SUPPORTED_SYNTHETIC' | 'SUPPORTED_CAMERA/HUMAN_ORIGIN' | 'CONFLICTING' | 'INSUFFICIENT';
export type AlphaAuthenticityLabel = 'Human-authored' | 'AI-assisted' | 'AI-generated' | 'Under review';

export interface SyntheticDetector {
  readonly id: string;
  readonly version: string;
  readonly evidenceFamily: DetectorEvidenceFamily;
  readonly correlationGroup: string;
  readonly modelHash: string;
  readonly preprocessingVersion: string;
  infer(image: unknown): Promise<DetectorEvidence>;
}

export interface DetectorEvidence {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly evidenceFamily: DetectorEvidenceFamily;
  readonly correlationGroup: string;
  readonly rawScore: number | null;
  readonly rawScoreDirection: RawScoreDirection;
  readonly calibratedStrength: number | null;
  readonly supportLevel: DetectorSupportLevel;
  readonly thresholdProfileVersion: string | null;
  readonly preprocessingVersion: string;
  readonly modelHash: string | null;
  readonly runtimeMs: number | null;
  readonly status: DetectorStatus;
  readonly warnings: readonly string[];
}

export interface DetectorRegistryEntry {
  readonly detectorId: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly shadowMode: boolean;
  readonly evidenceFamily: DetectorEvidenceFamily;
  readonly correlationGroup: string;
  readonly adapterVersion: string;
  readonly checkpointHash: string | null;
  readonly checkpointLicense: string | null;
  readonly inputPolicy: string;
  readonly runtimeBudgetMs: number;
  readonly calibrationProfile: string | null;
  readonly weightCapBytes: number;
  readonly replacementFor: string | null;
  readonly introducedAt: string;
  readonly retiredAt: string | null;
}

export interface EvidenceCompilerInput {
  readonly detectors: readonly DetectorEvidence[];
  readonly explicitSyntheticProvenance?: boolean;
  readonly reliableSyntheticProvenance?: boolean;
  readonly cameraEvidence?: {
    readonly positive: boolean;
    readonly strength: number;
    readonly source: string;
  } | null;
  readonly missingEvidence?: readonly string[];
  readonly moderation?: {
    readonly result: 'ALLOW' | 'REVIEW' | 'BLOCK' | 'PROVIDER_FAILURE' | 'NOT_RUN';
  } | null;
}

export interface CompiledSyntheticEvidence {
  readonly compilerVersion: typeof EVIDENCE_COMPILER_VERSION;
  readonly syntheticEvidenceScore: number;
  readonly syntheticEvidenceBand: SyntheticEvidenceBand;
  readonly resolution: SyntheticResolution;
  readonly contributingDetectorIds: readonly string[];
  readonly contributingCorrelationGroups: readonly string[];
  readonly distinctEvidenceFamilies: readonly DetectorEvidenceFamily[];
  readonly contradictions: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly moderationIgnoredForAuthenticity: true;
}

export interface AuthenticityDecisionSnapshot {
  readonly snapshotVersion: 'lythaus-authenticity-decision-snapshot-v1';
  readonly contentId: string;
  readonly inputFileHash: string;
  readonly evidencePacketVersion: string;
  readonly detectors: readonly DetectorEvidence[];
  readonly calibrationProfileVersion: string | null;
  readonly compilerVersion: typeof EVIDENCE_COMPILER_VERSION;
  readonly compiledEvidence: CompiledSyntheticEvidence;
  readonly observations: readonly JsonValue[];
  readonly advisory: JsonValue | null;
  readonly policyVersion: string;
  readonly finalAlphaLabel: AlphaAuthenticityLabel;
  readonly timestamp: string;
}

export const DEFAULT_CORRELATION_GROUP_CAPS: Readonly<Record<string, number>> = Object.freeze({
  SPAI_SPECTRAL: 35,
  CLIP_GENERATIVE: 35,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedStrength(evidence: DetectorEvidence): number {
  if (evidence.status !== 'OK' && evidence.status !== 'SHADOW_ONLY') return 0;
  return clamp(Number(evidence.calibratedStrength ?? 0), -1, 1);
}

function positiveSupport(evidence: DetectorEvidence): boolean {
  return normalizedStrength(evidence) > 0 && evidence.supportLevel !== 'STRONG_CONTRADICTS' && evidence.supportLevel !== 'WEAK_CONTRADICTS';
}

function bandForScore(score: number): SyntheticEvidenceBand {
  if (score >= 80) return 'VERY_HIGH';
  if (score >= 55) return 'HIGH';
  if (score >= 25) return 'MODERATE';
  return 'LOW';
}

export function createDetectorRegistry(entries: readonly DetectorRegistryEntry[]): readonly DetectorRegistryEntry[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.detectorId)) throw new Error(`detector_registry_duplicate:${entry.detectorId}`);
    if (!entry.detectorId || !entry.adapterVersion) {
      throw new Error(`detector_registry_invalid:${entry.detectorId}`);
    }
    ids.add(entry.detectorId);
  }
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export function replaceDetectorInRegistry(
  registry: readonly DetectorRegistryEntry[],
  replacement: DetectorRegistryEntry,
): readonly DetectorRegistryEntry[] {
  const next = registry.filter((entry) => entry.detectorId !== replacement.detectorId);
  return createDetectorRegistry([...next, replacement]);
}

export function compileSyntheticEvidence(input: EvidenceCompilerInput, groupCaps: Readonly<Record<string, number>> = DEFAULT_CORRELATION_GROUP_CAPS): CompiledSyntheticEvidence {
  const usable = input.detectors.filter((evidence) => evidence.status === 'OK' || evidence.status === 'SHADOW_ONLY');
  const groups = new Map<string, DetectorEvidence[]>();
  for (const evidence of usable) groups.set(evidence.correlationGroup, [...(groups.get(evidence.correlationGroup) ?? []), evidence]);
  const contributingDetectorIds: string[] = [];
  const contributingCorrelationGroups: string[] = [];
  const familySet = new Set<DetectorEvidenceFamily>();
  let score = input.reliableSyntheticProvenance ? 35 : 0;
  if (input.reliableSyntheticProvenance) contributingCorrelationGroups.push('EXPLICIT_SYNTHETIC_PROVENANCE');

  for (const [group, members] of groups) {
    const positive = members.filter(positiveSupport).sort((left, right) => normalizedStrength(right) - normalizedStrength(left));
    if (!positive.length) continue;
    const cap = groupCaps[group] ?? 25;
    const lead = normalizedStrength(positive[0]);
    const corroboration = positive.slice(1).reduce((sum, evidence) => sum + normalizedStrength(evidence) * 0.15, 0);
    const contribution = Math.min(cap, cap * clamp(lead + corroboration, 0, 1));
    score += contribution;
    contributingCorrelationGroups.push(group);
    for (const evidence of positive) {
      contributingDetectorIds.push(evidence.detectorId);
      familySet.add(evidence.evidenceFamily);
    }
  }

  const contradictions = input.detectors
    .filter((evidence) => evidence.status === 'OK' && (evidence.supportLevel === 'STRONG_CONTRADICTS' || evidence.supportLevel === 'WEAK_CONTRADICTS'))
    .map((evidence) => `${evidence.detectorId}:${evidence.supportLevel}`);
  const syntheticScore = Math.round(clamp(score, 0, 100) * 100) / 100;
  const hasStrongCamera = Boolean(input.cameraEvidence?.positive && input.cameraEvidence.strength >= 0.7);
  const hasSynthetic = syntheticScore >= 55 || Boolean(input.reliableSyntheticProvenance);
  const resolution: SyntheticResolution = hasSynthetic && hasStrongCamera
    ? 'CONFLICTING'
    : hasSynthetic
      ? 'SUPPORTED_SYNTHETIC'
      : hasStrongCamera
        ? 'SUPPORTED_CAMERA/HUMAN_ORIGIN'
        : 'INSUFFICIENT';
  return Object.freeze({
    compilerVersion: EVIDENCE_COMPILER_VERSION,
    syntheticEvidenceScore: syntheticScore,
    syntheticEvidenceBand: bandForScore(syntheticScore),
    resolution,
    contributingDetectorIds: Object.freeze(contributingDetectorIds),
    contributingCorrelationGroups: Object.freeze(contributingCorrelationGroups),
    distinctEvidenceFamilies: Object.freeze([...familySet]),
    contradictions: Object.freeze(contradictions),
    missingEvidence: Object.freeze([...(input.missingEvidence ?? [])]),
    moderationIgnoredForAuthenticity: true,
  });
}

export function resolveAlphaAuthenticityLabel(input: {
  compiledEvidence: CompiledSyntheticEvidence;
  explicitSyntheticProvenance?: boolean;
  cameraEvidencePositive?: boolean;
  policyVersion?: string;
}): AlphaAuthenticityLabel {
  if (input.compiledEvidence.resolution === 'CONFLICTING') return 'Under review';
  const distinctFamilies = input.compiledEvidence.distinctEvidenceFamilies.length;
  if (input.compiledEvidence.syntheticEvidenceBand === 'VERY_HIGH' && distinctFamilies >= 2) return 'AI-generated';
  if (input.explicitSyntheticProvenance && distinctFamilies >= 1 && input.compiledEvidence.syntheticEvidenceScore >= 35) return 'AI-generated';
  if (input.cameraEvidencePositive && input.compiledEvidence.syntheticEvidenceBand === 'LOW') return 'Human-authored';
  return 'Under review';
}

export function createDecisionSnapshot(input: Omit<AuthenticityDecisionSnapshot, 'snapshotVersion' | 'compilerVersion'>): AuthenticityDecisionSnapshot {
  return Object.freeze({
    snapshotVersion: 'lythaus-authenticity-decision-snapshot-v1',
    compilerVersion: EVIDENCE_COMPILER_VERSION,
    ...input,
    detectors: Object.freeze(input.detectors.map((evidence) => Object.freeze({ ...evidence }))),
    observations: Object.freeze([...input.observations]),
  });
}
