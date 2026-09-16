import type {
  DetectorEvidence,
  DetectorStatus,
  RawScoreDirection,
  SyntheticEvidenceBand,
} from './detectors.ts';

export const DYNAMIC_EVIDENCE_COMPILER_VERSION = 'lythaus-synthetic-evidence-compiler-v2' as const;

export type DynamicSyntheticResolution = 'SUPPORTS_SYNTHETIC' | 'NEUTRAL' | 'CONFLICTING' | 'INSUFFICIENT';

export interface DynamicNegativeProfile {
  readonly detectorId: string;
  readonly negativeRawScores: readonly number[];
}

export interface DynamicCalibration {
  readonly calibrationVersion: string;
  readonly negativeProfiles: readonly DynamicNegativeProfile[];
  readonly intercept: number;
  readonly coefficients: Readonly<Record<string, number>>;
  readonly bandThresholds: {
    readonly moderate: number;
    readonly high: number;
    readonly veryHigh: number;
  };
  /** Caps are applied to the aggregate logit contribution of each group. */
  readonly groupLogitCaps?: Readonly<Record<string, number>>;
}

export interface DynamicTailFeatures {
  readonly cdf: number | null;
  readonly highTail: number;
  readonly lowTail: number;
}

export interface DynamicGroupEvidence {
  readonly correlationGroup: string;
  readonly detectorIds: readonly string[];
  readonly highTail: number;
  readonly lowTail: number;
  readonly bothHigh: number;
  readonly bothLow: number;
  readonly contribution: number;
  readonly contributionCap: number;
}

export interface DynamicCompiledSyntheticEvidence {
  readonly compilerVersion: typeof DYNAMIC_EVIDENCE_COMPILER_VERSION;
  readonly syntheticEvidenceScore: number;
  readonly syntheticEvidenceBand: SyntheticEvidenceBand;
  readonly syntheticEvidenceResolution: DynamicSyntheticResolution;
  readonly calibrationVersion: string | null;
  readonly detectorEvidence: readonly DetectorEvidence[];
  readonly groupEvidence: readonly DynamicGroupEvidence[];
  readonly missingDetectors: readonly string[];
  readonly warnings: readonly string[];
  readonly featureVector: Readonly<Record<string, number>>;
  readonly cameraEvidenceWasUsed: false;
  readonly moderationWasUsed: false;
  readonly observerWasUsed: false;
  readonly adjudicatorWasUsed: false;
}

export interface DynamicCompilerInput {
  readonly detectors: readonly DetectorEvidence[];
  readonly calibration: DynamicCalibration | null;
  readonly missingDetectors?: readonly string[];
  /** Used only to preserve the independent-axis conflict in the result. */
  readonly cameraEvidence?: {
    readonly positive: boolean;
    readonly strength: number;
  } | null;
}

const DEFAULT_GROUP_LOGIT_CAPS: Readonly<Record<string, number>> = Object.freeze({
  SPAI_SPECTRAL: 4,
  CLIP_GENERATIVE: 4,
  SAFE_TRANSFORMATION_RESNET: 4,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function usable(status: DetectorStatus): boolean {
  return status === 'OK' || status === 'SHADOW_ONLY';
}

function upperBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (sorted[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function empiricalNegativeCdf(rawScore: number, negativeRawScores: readonly number[]): number | null {
  if (!finite(rawScore)) return null;
  const sorted = negativeRawScores.filter(finite).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  return upperBound(sorted, rawScore) / sorted.length;
}

export function twoTailedEvidence(rawScore: number | null, negativeRawScores: readonly number[]): DynamicTailFeatures {
  const cdf = finite(rawScore) ? empiricalNegativeCdf(rawScore, negativeRawScores) : null;
  if (cdf === null) return { cdf: null, highTail: 0, lowTail: 0 };
  return {
    cdf,
    highTail: Math.max(0, 2 * (cdf - 0.5)),
    lowTail: Math.max(0, 2 * (0.5 - cdf)),
  };
}

function profileFor(calibration: DynamicCalibration, detectorId: string): DynamicNegativeProfile | undefined {
  return calibration.negativeProfiles.find((profile) => profile.detectorId === detectorId);
}

function addFeature(features: Record<string, number>, name: string, value: number): void {
  features[name] = finite(value) ? clamp(value, 0, 1) : 0;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponent = Math.exp(-value);
    return 1 / (1 + exponent);
  }
  const exponent = Math.exp(value);
  return exponent / (1 + exponent);
}

function bandForScore(score: number, thresholds: DynamicCalibration['bandThresholds']): SyntheticEvidenceBand {
  if (score >= thresholds.veryHigh) return 'VERY_HIGH';
  if (score >= thresholds.high) return 'HIGH';
  if (score >= thresholds.moderate) return 'MODERATE';
  return 'LOW';
}

function validateCalibration(calibration: DynamicCalibration): void {
  if (!calibration.calibrationVersion) throw new Error('dynamic_calibration_version_required');
  if (!finite(calibration.intercept)) throw new Error('dynamic_calibration_intercept_invalid');
  const thresholds = calibration.bandThresholds;
  if (![thresholds.moderate, thresholds.high, thresholds.veryHigh].every((value) => finite(value))) {
    throw new Error('dynamic_calibration_band_threshold_invalid');
  }
  if (!(thresholds.moderate <= thresholds.high && thresholds.high <= thresholds.veryHigh)) {
    throw new Error('dynamic_calibration_band_threshold_order_invalid');
  }
  for (const [name, coefficient] of Object.entries(calibration.coefficients)) {
    if (!finite(coefficient)) throw new Error(`dynamic_calibration_coefficient_invalid:${name}`);
  }
}

function missingDetectorIds(detectors: readonly DetectorEvidence[], explicit: readonly string[]): string[] {
  const missing = new Set(explicit);
  for (const detector of detectors) {
    if (!usable(detector.status) || !finite(detector.rawScore)) missing.add(detector.detectorId);
  }
  return [...missing].sort();
}

function featureAndGroups(
  detectors: readonly DetectorEvidence[],
  calibration: DynamicCalibration,
): { features: Record<string, number>; groups: DynamicGroupEvidence[]; groupedFeatureNames: Set<string> } {
  const features: Record<string, number> = {};
  const grouped = new Map<string, DetectorEvidence[]>();
  const tails = new Map<string, DynamicTailFeatures>();

  for (const detector of detectors) {
    const profile = profileFor(calibration, detector.detectorId);
    const tail = usable(detector.status) && profile
      ? twoTailedEvidence(detector.rawScore, profile.negativeRawScores)
      : { cdf: null, highTail: 0, lowTail: 0 };
    tails.set(detector.detectorId, tail);
    addFeature(features, `${detector.detectorId}_HIGH_TAIL`, tail.highTail);
    addFeature(features, `${detector.detectorId}_LOW_TAIL`, tail.lowTail);
    features[`${detector.detectorId}_MISSING`] = usable(detector.status) && finite(detector.rawScore) ? 0 : 1;
    grouped.set(detector.correlationGroup, [...(grouped.get(detector.correlationGroup) ?? []), detector]);
  }

  const groups: DynamicGroupEvidence[] = [];
  const groupedFeatureNames = new Set<string>();
  for (const [correlationGroup, members] of grouped) {
    const memberTails = members.map((member) => tails.get(member.detectorId) ?? { cdf: null, highTail: 0, lowTail: 0 });
    const highTail = Math.max(...memberTails.map((tail) => tail.highTail), 0);
    const lowTail = Math.max(...memberTails.map((tail) => tail.lowTail), 0);
    const bothHigh = memberTails.length > 1 ? Math.min(...memberTails.map((tail) => tail.highTail)) : 0;
    const bothLow = memberTails.length > 1 ? Math.min(...memberTails.map((tail) => tail.lowTail)) : 0;
    const groupHighName = `${correlationGroup}_HIGH_TAIL`;
    const groupLowName = `${correlationGroup}_LOW_TAIL`;
    addFeature(features, groupHighName, highTail);
    addFeature(features, groupLowName, lowTail);
    groupedFeatureNames.add(groupHighName);
    groupedFeatureNames.add(groupLowName);
    const featureNames = [
      ...members.flatMap((member) => [`${member.detectorId}_HIGH_TAIL`, `${member.detectorId}_LOW_TAIL`]),
      groupHighName,
      groupLowName,
    ];
    if (correlationGroup === 'CLIP_GENERATIVE') {
      addFeature(features, 'CLIP_BOTH_HIGH', bothHigh);
      addFeature(features, 'CLIP_BOTH_LOW', bothLow);
      groupedFeatureNames.add('CLIP_BOTH_HIGH');
      groupedFeatureNames.add('CLIP_BOTH_LOW');
      featureNames.push('CLIP_BOTH_HIGH', 'CLIP_BOTH_LOW');
    }
    groups.push({
      correlationGroup,
      detectorIds: Object.freeze(members.map((member) => member.detectorId)),
      highTail,
      lowTail,
      bothHigh,
      bothLow,
      contribution: 0,
      contributionCap: DEFAULT_GROUP_LOGIT_CAPS[correlationGroup] ?? 4,
    });
    (groups[groups.length - 1] as DynamicGroupEvidence & { featureNames?: readonly string[] }).featureNames = Object.freeze([...new Set(featureNames)]);
  }
  return { features, groups, groupedFeatureNames };
}

export function compileDynamicSyntheticEvidence(input: DynamicCompilerInput): DynamicCompiledSyntheticEvidence {
  const missing = missingDetectorIds(input.detectors, input.missingDetectors ?? []);
  const warnings: string[] = [];
  if (!input.calibration) {
    warnings.push('dynamic_calibration_not_frozen');
    return Object.freeze({
      compilerVersion: DYNAMIC_EVIDENCE_COMPILER_VERSION,
      syntheticEvidenceScore: 0,
      syntheticEvidenceBand: 'LOW',
      syntheticEvidenceResolution: 'INSUFFICIENT',
      calibrationVersion: null,
      detectorEvidence: Object.freeze([...input.detectors]),
      groupEvidence: Object.freeze([]),
      missingDetectors: Object.freeze(missing),
      warnings: Object.freeze(warnings),
      featureVector: Object.freeze({}),
      cameraEvidenceWasUsed: false,
      moderationWasUsed: false,
      observerWasUsed: false,
      adjudicatorWasUsed: false,
    });
  }

  validateCalibration(input.calibration);
  const { features, groups, groupedFeatureNames } = featureAndGroups(input.detectors, input.calibration);
  let linear = input.calibration.intercept;
  const caps = { ...DEFAULT_GROUP_LOGIT_CAPS, ...(input.calibration.groupLogitCaps ?? {}) };
  const completedGroups = groups.map((group) => {
    const featureNames = (group as DynamicGroupEvidence & { featureNames?: readonly string[] }).featureNames ?? [];
    const rawContribution = featureNames.reduce((sum, name) => sum + (input.calibration?.coefficients[name] ?? 0) * (features[name] ?? 0), 0);
    const cap = Math.max(0, caps[group.correlationGroup] ?? 4);
    const contribution = clamp(rawContribution, -cap, cap);
    linear += contribution;
    return Object.freeze({ ...group, contribution, contributionCap: cap });
  });
  for (const [name, value] of Object.entries(features)) {
    if (name.endsWith('_MISSING') && !groupedFeatureNames.has(name)) {
      linear += (input.calibration.coefficients[name] ?? 0) * value;
    }
  }
  const score = Math.round(clamp(sigmoid(linear) * 100, 0, 100) * 100) / 100;
  const band = bandForScore(score, input.calibration.bandThresholds);
  const highSynthetic = score >= input.calibration.bandThresholds.high;
  const strongCamera = Boolean(input.cameraEvidence?.positive && input.cameraEvidence.strength >= 0.7);
  const resolution: DynamicSyntheticResolution = highSynthetic && strongCamera
    ? 'CONFLICTING'
    : highSynthetic
      ? 'SUPPORTS_SYNTHETIC'
      : missing.length === input.detectors.length || !input.detectors.length
        ? 'INSUFFICIENT'
        : 'NEUTRAL';
  return Object.freeze({
    compilerVersion: DYNAMIC_EVIDENCE_COMPILER_VERSION,
    syntheticEvidenceScore: score,
    syntheticEvidenceBand: band,
    syntheticEvidenceResolution: resolution,
    calibrationVersion: input.calibration.calibrationVersion,
    detectorEvidence: Object.freeze([...input.detectors]),
    groupEvidence: Object.freeze(completedGroups),
    missingDetectors: Object.freeze(missing),
    warnings: Object.freeze(warnings),
    featureVector: Object.freeze({ ...features }),
    cameraEvidenceWasUsed: false,
    moderationWasUsed: false,
    observerWasUsed: false,
    adjudicatorWasUsed: false,
  });
}

export function dynamicDetectorDirection(detector: Pick<DetectorEvidence, 'rawScoreDirection'>): RawScoreDirection {
  return detector.rawScoreDirection;
}
