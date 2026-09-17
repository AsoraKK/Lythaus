export const SAFE_SPECIALIST_CANDIDATE = 'SAFE' as const;
export const SAFE_UPSTREAM_COMMIT = '4e998724651b227def64f5be0cd60c0aa1552c35' as const;
export const SAFE_CHECKPOINT_SHA256 = 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e' as const;
export const SAFE_PREPROCESSING_VERSION = 'SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1' as const;

export type SafeStatus = 'OK' | 'TIMEOUT' | 'ERROR' | 'UNAVAILABLE' | 'RIGHTS_BLOCKED' | 'RUNTIME_BLOCKED';
export type SafeInputRegime =
  | 'ORIGINAL_OR_HIGH_QUALITY'
  | 'MODERATELY_TRANSFORMED'
  | 'HEAVILY_RECOMPRESSED'
  | 'RESAMPLED'
  | 'SCREENSHOT_LIKELY'
  | 'UNKNOWN_TRANSFORMATION_STATE';
export type SafeApplicability = 'HIGH' | 'MODERATE' | 'LOW' | 'UNSUPPORTED';
export type SafeEvidenceLevel =
  | 'STRONG_SYNTHETIC_SUPPORT'
  | 'REDUCED_SYNTHETIC_SUPPORT'
  | 'MEANINGFUL_LOW_SYNTHETIC_SIGNAL'
  | 'LOW_SYNTHETIC_SIGNAL'
  | 'INCONCLUSIVE_APPLICABILITY'
  | 'INCONCLUSIVE_NO_SCORE';
export type SafeScoreInterpretation = 'ABOVE_FROZEN_THRESHOLD' | 'BELOW_FROZEN_THRESHOLD' | 'NO_SCORE';

export interface SafeInputFacts {
  readonly inputRegime: SafeInputRegime;
  readonly format?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly metadataPresent?: boolean | null;
  readonly metadataMissing?: boolean | null;
  readonly doubleCompressionIndicator?: boolean;
  readonly resamplingIndicator?: boolean;
  readonly screenshotIndicator?: boolean;
  readonly transformationEvidence?: readonly string[];
}

export interface SafeCalibrationProfile {
  readonly profileVersion: string;
  readonly artifactHash: string;
  readonly preprocessingVersion: string;
  readonly frozenSyntheticThreshold: number;
  readonly thresholdProvenance: string;
}

export interface SafeSpecialistEvidence {
  readonly detectorId: typeof SAFE_SPECIALIST_CANDIDATE;
  readonly detectorVersion: string;
  readonly status: SafeStatus;
  readonly rawScore: number | null;
  readonly rawScoreDirection: 'HIGHER_IS_MORE_SYNTHETIC_LIKE';
  readonly scoreInterpretation: SafeScoreInterpretation;
  readonly evidenceLevel: SafeEvidenceLevel;
  readonly inputRegime: SafeInputRegime;
  readonly applicability: SafeApplicability;
  readonly applicabilityReasons: readonly string[];
  readonly preprocessingVersion: string;
  readonly artifactHash: string;
  readonly calibrationProfileVersion: string;
  readonly transformationEvidence: readonly string[];
  readonly runtimeMs: number | null;
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function freezeStrings(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...(values ?? [])]);
}

export function classifySafeApplicability(facts: SafeInputFacts): {
  readonly inputRegime: SafeInputRegime;
  readonly applicability: SafeApplicability;
  readonly reasons: readonly string[];
} {
  const reasons: string[] = [];
  if (facts.screenshotIndicator || facts.inputRegime === 'SCREENSHOT_LIKELY') {
    reasons.push('screenshot-like resampling evidence limits SAFE applicability');
    return Object.freeze({ inputRegime: 'SCREENSHOT_LIKELY', applicability: 'LOW', reasons: freezeStrings(reasons) });
  }
  if (facts.doubleCompressionIndicator || facts.inputRegime === 'HEAVILY_RECOMPRESSED') {
    reasons.push('double-compression or heavy recompression evidence limits SAFE applicability');
    return Object.freeze({ inputRegime: 'HEAVILY_RECOMPRESSED', applicability: 'LOW', reasons: freezeStrings(reasons) });
  }
  if (facts.inputRegime === 'UNKNOWN_TRANSFORMATION_STATE') {
    reasons.push('transformation state is not represented by the frozen stress matrix');
    return Object.freeze({ inputRegime: 'UNKNOWN_TRANSFORMATION_STATE', applicability: 'UNSUPPORTED', reasons: freezeStrings(reasons) });
  }
  if (facts.resamplingIndicator || facts.inputRegime === 'RESAMPLED') {
    reasons.push('resampling evidence is present');
    return Object.freeze({ inputRegime: 'RESAMPLED', applicability: 'MODERATE', reasons: freezeStrings(reasons) });
  }
  if (facts.inputRegime === 'MODERATELY_TRANSFORMED') {
    reasons.push('bounded transformation evidence is present');
    return Object.freeze({ inputRegime: 'MODERATELY_TRANSFORMED', applicability: 'MODERATE', reasons: freezeStrings(reasons) });
  }
  // Missing EXIF/metadata is deliberately not a synthetic-origin signal and,
  // by itself, does not lower the detector's applicability.
  if (facts.metadataMissing === true || facts.metadataPresent === false) reasons.push('metadata absence is not used as authenticity evidence');
  else reasons.push('no measured transformation damage in the frozen applicability matrix');
  return Object.freeze({ inputRegime: 'ORIGINAL_OR_HIGH_QUALITY', applicability: 'HIGH', reasons: freezeStrings(reasons) });
}

function validateProfile(profile: SafeCalibrationProfile): void {
  if (!profile.profileVersion) throw new Error('safe_calibration_profile_version_required');
  if (!hash(profile.artifactHash)) throw new Error('safe_calibration_artifact_hash_invalid');
  if (!profile.preprocessingVersion) throw new Error('safe_calibration_preprocessing_required');
  if (!finite(profile.frozenSyntheticThreshold) || profile.frozenSyntheticThreshold < 0 || profile.frozenSyntheticThreshold > 1) {
    throw new Error('safe_calibration_threshold_invalid');
  }
  if (!profile.thresholdProvenance) throw new Error('safe_calibration_threshold_provenance_required');
}

function mapEvidenceLevel(status: SafeStatus, rawScore: number | null, applicability: SafeApplicability, threshold: number): SafeEvidenceLevel {
  if (status !== 'OK' || rawScore === null) return 'INCONCLUSIVE_NO_SCORE';
  if (applicability === 'LOW' || applicability === 'UNSUPPORTED') return 'INCONCLUSIVE_APPLICABILITY';
  if (rawScore >= threshold) return applicability === 'HIGH' ? 'STRONG_SYNTHETIC_SUPPORT' : 'REDUCED_SYNTHETIC_SUPPORT';
  return applicability === 'HIGH' ? 'MEANINGFUL_LOW_SYNTHETIC_SIGNAL' : 'LOW_SYNTHETIC_SIGNAL';
}

export function createSafeEvidence(input: {
  readonly status: SafeStatus;
  readonly rawScore: number | null;
  readonly runtimeMs?: number | null;
  readonly facts: SafeInputFacts;
  readonly calibration: SafeCalibrationProfile;
  readonly detectorVersion?: string;
  readonly warnings?: readonly string[];
  readonly limitations?: readonly string[];
}): SafeSpecialistEvidence {
  validateProfile(input.calibration);
  if (input.rawScore !== null && (!finite(input.rawScore) || input.rawScore < 0 || input.rawScore > 1)) {
    throw new Error('safe_raw_score_invalid');
  }
  if (input.status === 'OK' && input.rawScore === null) throw new Error('safe_ok_score_required');
  if (input.runtimeMs !== undefined && input.runtimeMs !== null && (!finite(input.runtimeMs) || input.runtimeMs < 0)) {
    throw new Error('safe_runtime_invalid');
  }
  const classification = classifySafeApplicability(input.facts);
  const scoreInterpretation: SafeScoreInterpretation = input.rawScore === null
    ? 'NO_SCORE'
    : input.rawScore >= input.calibration.frozenSyntheticThreshold ? 'ABOVE_FROZEN_THRESHOLD' : 'BELOW_FROZEN_THRESHOLD';
  const limitations = [...(input.limitations ?? [])];
  if (classification.applicability === 'LOW' || classification.applicability === 'UNSUPPORTED') {
    limitations.push('SAFE authority is reduced or withdrawn by measured input-regime applicability; this is not an authenticity label.');
  }
  if (input.status !== 'OK') limitations.push('SAFE did not produce a usable score; missingness is not negative synthetic evidence.');
  return Object.freeze({
    detectorId: SAFE_SPECIALIST_CANDIDATE,
    detectorVersion: input.detectorVersion ?? `SAFE_OFFICIAL_${SAFE_UPSTREAM_COMMIT}`,
    status: input.status,
    rawScore: input.rawScore === null ? null : clamp(input.rawScore, 0, 1),
    rawScoreDirection: 'HIGHER_IS_MORE_SYNTHETIC_LIKE',
    scoreInterpretation,
    evidenceLevel: mapEvidenceLevel(input.status, input.rawScore, classification.applicability, input.calibration.frozenSyntheticThreshold),
    inputRegime: classification.inputRegime,
    applicability: classification.applicability,
    applicabilityReasons: classification.reasons,
    preprocessingVersion: input.calibration.preprocessingVersion,
    artifactHash: input.calibration.artifactHash,
    calibrationProfileVersion: input.calibration.profileVersion,
    transformationEvidence: freezeStrings(input.facts.transformationEvidence),
    runtimeMs: input.runtimeMs === undefined ? null : input.runtimeMs,
    warnings: freezeStrings(input.warnings),
    limitations: freezeStrings(limitations),
  });
}

export function safeEvidenceCanSupportSynthetic(evidence: SafeSpecialistEvidence): boolean {
  return evidence.status === 'OK' && (evidence.evidenceLevel === 'STRONG_SYNTHETIC_SUPPORT' || evidence.evidenceLevel === 'REDUCED_SYNTHETIC_SUPPORT');
}
