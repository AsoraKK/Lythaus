import {
  SAFE_CHECKPOINT_SHA256,
  SAFE_PREPROCESSING_VERSION,
  SAFE_SPECIALIST_CANDIDATE,
  type SafeSpecialistEvidence,
  safeEvidenceCanSupportSynthetic,
} from './wp007h.ts';

export const WP007I_SELECTIVE_EVIDENCE_SCHEMA_VERSION = 'lythaus-wp007i-safe-selective-evidence-v1' as const;
export const WP007I_POLICY_VERSION = 'WP007I_SAFE_POSITIVE_ONLY_APPLICABILITY_V1' as const;
export const WP007I_FROZEN_THRESHOLD = 0.5864923000335693 as const;

export type SelectiveSafeResolution =
  | 'HIGH_SYNTHETIC_EVIDENCE'
  | 'LOW_SYNTHETIC_EVIDENCE'
  | 'INCONCLUSIVE_DUE_TO_INPUT_REGIME'
  | 'MODEL_UNAVAILABLE'
  | 'CONFLICTING_CAMERA_AND_SYNTHETIC_EVIDENCE';

export interface SelectiveSafeSnapshot {
  readonly schemaVersion: typeof WP007I_SELECTIVE_EVIDENCE_SCHEMA_VERSION;
  readonly policyVersion: typeof WP007I_POLICY_VERSION;
  readonly contentSha256: string | null;
  readonly detectorId: typeof SAFE_SPECIALIST_CANDIDATE;
  readonly artifactHash: typeof SAFE_CHECKPOINT_SHA256;
  readonly preprocessingVersion: typeof SAFE_PREPROCESSING_VERSION;
  readonly rawScore: number | null;
  readonly frozenThreshold: number;
  readonly resolution: SelectiveSafeResolution;
  readonly evidenceLevel: SafeSpecialistEvidence['evidenceLevel'];
  readonly applicability: SafeSpecialistEvidence['applicability'];
  readonly applicabilityReasons: readonly string[];
  readonly inputRegime: SafeSpecialistEvidence['inputRegime'];
  readonly runtimeMs: number | null;
  readonly modelStatus: SafeSpecialistEvidence['status'];
  readonly warnings: readonly string[];
  readonly transformationContext: readonly string[];
  readonly timestamp: string | null;
}

export function assertWp007iGeneratorFamilyAllowed(generatorFamily: string): void {
  if (/flux[._-]?2/i.test(generatorFamily)) throw new Error('wp007i_flux2_family_denied');
}

export function createSelectiveSafeSnapshot(input: {
  readonly evidence: SafeSpecialistEvidence;
  readonly contentSha256?: string | null;
  readonly frozenThreshold: number;
  readonly timestamp?: string | null;
  readonly cameraEvidencePositive?: boolean;
}): SelectiveSafeSnapshot {
  const { evidence } = input;
  if (evidence.artifactHash !== SAFE_CHECKPOINT_SHA256) throw new Error('wp007i_safe_artifact_mismatch');
  if (evidence.preprocessingVersion !== SAFE_PREPROCESSING_VERSION) throw new Error('wp007i_safe_preprocessing_mismatch');
  if (input.frozenThreshold !== WP007I_FROZEN_THRESHOLD) throw new Error('wp007i_safe_threshold_mismatch');
  const supportsSynthetic = safeEvidenceCanSupportSynthetic(evidence);
  const conflict = Boolean(input.cameraEvidencePositive && supportsSynthetic);
  const resolution: SelectiveSafeResolution = conflict
    ? 'CONFLICTING_CAMERA_AND_SYNTHETIC_EVIDENCE'
    : evidence.status !== 'OK' || evidence.rawScore === null
      ? 'MODEL_UNAVAILABLE'
      : evidence.applicability === 'LOW' || evidence.applicability === 'UNSUPPORTED'
        ? 'INCONCLUSIVE_DUE_TO_INPUT_REGIME'
        : supportsSynthetic
          ? 'HIGH_SYNTHETIC_EVIDENCE'
          : 'LOW_SYNTHETIC_EVIDENCE';
  return Object.freeze({
    schemaVersion: WP007I_SELECTIVE_EVIDENCE_SCHEMA_VERSION,
    policyVersion: WP007I_POLICY_VERSION,
    contentSha256: input.contentSha256 ?? null,
    detectorId: evidence.detectorId,
    artifactHash: evidence.artifactHash as typeof SAFE_CHECKPOINT_SHA256,
    preprocessingVersion: evidence.preprocessingVersion as typeof SAFE_PREPROCESSING_VERSION,
    rawScore: evidence.rawScore,
    frozenThreshold: input.frozenThreshold,
    resolution,
    evidenceLevel: evidence.evidenceLevel,
    applicability: evidence.applicability,
    applicabilityReasons: Object.freeze([...evidence.applicabilityReasons]),
    inputRegime: evidence.inputRegime,
    runtimeMs: evidence.runtimeMs,
    modelStatus: evidence.status,
    warnings: Object.freeze([...evidence.warnings]),
    transformationContext: Object.freeze([...evidence.transformationEvidence]),
    timestamp: input.timestamp ?? null,
  });
}

export function publicSelectiveSafeView(snapshot: SelectiveSafeSnapshot): Readonly<Record<string, unknown>> {
  const { rawScore: _rawScore, ...publicView } = snapshot;
  return Object.freeze(publicView);
}
