import { assertEvidencePacket, type EvidencePacket, type PacketEvidence } from './evidence-packet.ts';
import {
  compileSyntheticEvidence,
  createDecisionSnapshot,
  resolveAlphaAuthenticityLabel,
  type AuthenticityDecisionSnapshot,
  type CompiledSyntheticEvidence,
  type DetectorEvidence,
  type SyntheticDetector,
} from './detectors.ts';
import type { JsonValue } from './contracts.ts';

export const AUTHENTICITY_ALPHA_MODES = ['OFF', 'SHADOW', 'ALPHA'] as const;
export type AuthenticityAlphaMode = (typeof AUTHENTICITY_ALPHA_MODES)[number];
export const AUTHENTICITY_ALPHA_POLICY_VERSION = 'lythaus-authenticity-alpha-policy-v1' as const;
export const DEFAULT_AUTHENTICITY_ALPHA_MODE: AuthenticityAlphaMode = 'SHADOW';

export interface AlphaDetectorRunOptions {
  readonly detectors: readonly SyntheticDetector[];
  readonly image: unknown;
  readonly timeoutMs?: number;
}

export interface AlphaAnalysisResult {
  readonly mode: AuthenticityAlphaMode;
  readonly detectors: readonly DetectorEvidence[];
  readonly compiledEvidence: CompiledSyntheticEvidence;
  readonly visibleLabel: 'Human-authored' | 'AI-assisted' | 'AI-generated' | 'Under review' | null;
  readonly analysisStatus: 'DISABLED' | 'COMPLETE' | 'PARTIAL';
}

function timeoutEvidence(detector: SyntheticDetector, runtimeMs: number): DetectorEvidence {
  return {
    detectorId: detector.id,
    detectorVersion: detector.version,
    evidenceFamily: detector.evidenceFamily,
    correlationGroup: detector.correlationGroup,
    rawScore: null,
    rawScoreDirection: 'UNKNOWN',
    calibratedStrength: null,
    supportLevel: 'NEUTRAL',
    thresholdProfileVersion: null,
    preprocessingVersion: detector.preprocessingVersion,
    modelHash: detector.modelHash,
    runtimeMs,
    status: 'TIMEOUT',
    warnings: ['Detector exceeded its bounded alpha timeout.'],
  };
}

function errorEvidence(detector: SyntheticDetector, runtimeMs: number, error: unknown): DetectorEvidence {
  return {
    ...timeoutEvidence(detector, runtimeMs),
    status: 'ERROR',
    warnings: [error instanceof Error ? error.message.slice(0, 160) : 'Detector inference failed.'],
  };
}

async function runOne(detector: SyntheticDetector, image: unknown, timeoutMs: number): Promise<DetectorEvidence> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      detector.infer(image),
      new Promise<DetectorEvidence>((resolve) => {
        timer = setTimeout(() => resolve(timeoutEvidence(detector, Date.now() - started)), timeoutMs);
      }),
    ]);
    return result;
  } catch (error) {
    return errorEvidence(detector, Date.now() - started, error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runAlphaDetectorCascade(input: AlphaDetectorRunOptions): Promise<readonly DetectorEvidence[]> {
  const timeoutMs = input.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('alpha_detector_timeout_invalid');
  return Promise.all(input.detectors.map((detector) => runOne(detector, input.image, timeoutMs)));
}

export function analyzeAlphaEvidence(input: {
  readonly mode?: AuthenticityAlphaMode;
  readonly detectors: readonly DetectorEvidence[];
  readonly explicitSyntheticProvenance?: boolean;
  readonly reliableSyntheticProvenance?: boolean;
  readonly cameraEvidence?: { readonly positive: boolean; readonly strength: number; readonly source: string } | null;
  readonly missingEvidence?: readonly string[];
}): AlphaAnalysisResult {
  const mode = input.mode ?? DEFAULT_AUTHENTICITY_ALPHA_MODE;
  if (!AUTHENTICITY_ALPHA_MODES.includes(mode)) throw new Error('alpha_mode_invalid');
  if (mode === 'OFF') return {
    mode,
    detectors: [],
    compiledEvidence: compileSyntheticEvidence({ detectors: [], missingEvidence: ['authenticity_alpha_disabled'] }),
    visibleLabel: null,
    analysisStatus: 'DISABLED',
  };
  const compiledEvidence = compileSyntheticEvidence({
    detectors: input.detectors,
    explicitSyntheticProvenance: input.explicitSyntheticProvenance,
    reliableSyntheticProvenance: input.reliableSyntheticProvenance,
    cameraEvidence: input.cameraEvidence,
    missingEvidence: input.missingEvidence,
  });
  const label = resolveAlphaAuthenticityLabel({
    compiledEvidence,
    explicitSyntheticProvenance: input.explicitSyntheticProvenance,
    cameraEvidencePositive: input.cameraEvidence?.positive,
    policyVersion: AUTHENTICITY_ALPHA_POLICY_VERSION,
  });
  const partial = input.detectors.some((item) => !['OK', 'SHADOW_ONLY'].includes(item.status));
  return {
    mode,
    detectors: Object.freeze([...input.detectors]),
    compiledEvidence,
    visibleLabel: mode === 'ALPHA' ? label : 'Under review',
    analysisStatus: partial ? 'PARTIAL' : 'COMPLETE',
  };
}

export function attachDetectorEvidence(packet: EvidencePacket, detectors: readonly DetectorEvidence[]): EvidencePacket {
  assertEvidencePacket(packet);
  const additions: PacketEvidence[] = detectors.map((detector) => ({
    evidenceId: `${packet.packetId}:detector:${detector.detectorId}`,
    family: 'EF3_GENERATIVE_FORENSICS',
    kind: 'MEASUREMENT',
    name: 'pretrained_synthetic_detector_evidence',
    value: {
      detectorId: detector.detectorId,
      detectorVersion: detector.detectorVersion,
      evidenceFamily: detector.evidenceFamily,
      correlationGroup: detector.correlationGroup,
      rawScore: detector.rawScore,
      rawScoreDirection: detector.rawScoreDirection,
      calibratedStrength: detector.calibratedStrength,
      supportLevel: detector.supportLevel,
      thresholdProfileVersion: detector.thresholdProfileVersion,
      preprocessingVersion: detector.preprocessingVersion,
      modelHash: detector.modelHash,
      runtimeMs: detector.runtimeMs,
      status: detector.status,
      warnings: [...detector.warnings],
    } as unknown as JsonValue,
    quality: detector.status === 'OK' || detector.status === 'SHADOW_ONLY' ? 'AVAILABLE' : 'FAILED',
    provenance: {
      evidenceFamily: 'EF3_GENERATIVE_FORENSICS',
      sourceComponent: `lythaus-pretrained-detector:${detector.detectorId}`,
      provider: null,
      modelVersion: detector.detectorVersion,
      schemaVersion: 'lythaus-authenticity-detectors-v1',
      executionTimestamp: new Date().toISOString(),
      inputHash: packet.inputHash,
      applicable: detector.status === 'UNAVAILABLE' || detector.status === 'RIGHTS_BLOCKED' ? 'unavailable' : detector.status === 'ERROR' || detector.status === 'TIMEOUT' ? 'invalid' : 'applicable',
      limitations: ['Synthetic detector evidence is an independent origin axis and is not a probability.', 'Model outputs are calibrated operating-point evidence, not authorship proof.'],
    },
  }));
  const existingIds = new Set(packet.evidence.map((item) => item.evidenceId));
  for (const item of additions) if (existingIds.has(item.evidenceId)) throw new Error(`detector_evidence_duplicate:${item.evidenceId}`);
  const family = packet.evidenceFamilies.EF3_GENERATIVE_FORENSICS;
  const updated: EvidencePacket = {
    ...packet,
    evidence: [...packet.evidence, ...additions],
    evidenceFamilies: {
      ...packet.evidenceFamilies,
      EF3_GENERATIVE_FORENSICS: {
        ...family,
        status: additions.some((item) => item.quality === 'AVAILABLE') ? 'AVAILABLE' : family.status,
        evidenceIds: [...family.evidenceIds, ...additions.map((item) => item.evidenceId)],
        limitations: [...family.limitations, 'Pretrained detector outputs are capped by correlation group in the alpha compiler.'],
      },
    },
  };
  assertEvidencePacket(updated);
  return updated;
}

export function createAlphaDecisionSnapshot(input: {
  readonly contentId: string;
  readonly inputFileHash: string;
  readonly evidencePacketVersion: string;
  readonly detectors: readonly DetectorEvidence[];
  readonly compiledEvidence: CompiledSyntheticEvidence;
  readonly observations?: readonly JsonValue[];
  readonly advisory?: JsonValue | null;
  readonly policyVersion?: string;
  readonly finalAlphaLabel: 'Human-authored' | 'AI-assisted' | 'AI-generated' | 'Under review';
  readonly timestamp: string;
}): AuthenticityDecisionSnapshot {
  return createDecisionSnapshot({
    contentId: input.contentId,
    inputFileHash: input.inputFileHash,
    evidencePacketVersion: input.evidencePacketVersion,
    detectors: input.detectors,
    calibrationProfileVersion: input.detectors.find((item) => item.thresholdProfileVersion)?.thresholdProfileVersion ?? null,
    compiledEvidence: input.compiledEvidence,
    observations: input.observations ?? [],
    advisory: input.advisory ?? null,
    policyVersion: input.policyVersion ?? AUTHENTICITY_ALPHA_POLICY_VERSION,
    finalAlphaLabel: input.finalAlphaLabel,
    timestamp: input.timestamp,
  });
}
