import { createHash } from 'node:crypto';
import {
  WP006A_SCHEMA_VERSION,
  assertWp006aSpecialistResult,
  type Wp006aSpecialistResult,
} from './wp006a.ts';
import { stableStringify } from './wp006b.ts';

export const WP006C_PLAN_SCHEMA_VERSION = 'lythaus-wp006c-ef2-plan-v1' as const;
export const WP006C_FEATURE_REGISTRY_SCHEMA_VERSION = 'lythaus-wp006c-ef2-feature-registry-v1' as const;
export const WP006C_CALIBRATION_FREEZE_SCHEMA_VERSION = 'lythaus-wp006c-ef2-calibration-freeze-v1' as const;
export const WP006C_RESULT_SCHEMA_VERSION = 'lythaus-wp006c-ef2-result-v1' as const;
export const WP006C_RUN_MANIFEST_SCHEMA_VERSION = 'lythaus-wp006c-ef2-run-manifest-v1' as const;
export const WP006C_SPECIALIST_ID = 'lythaus-ef2-pixel-acquisition-v0' as const;
export const WP006C_SPECIALIST_VERSION = '0' as const;
export const WP006C_BENCHMARK_VERSION = 'lythaus-forensic-microbench-v0' as const;
export const WP006C_EXPECTED_BASE_SHA = '04f3d3e6d83540dbf52a21f6760fb2398ab1c9f9' as const;
export const WP006C_EXPECTED_BENCHMARK_FINGERPRINT = '1d3244ff464118904768acdeeb80561253dd7dccf65fff445148b26b9a6d77fb' as const;
export const WP006C_HOLDOUT_DEVICE = 'LGE LM-G710' as const;
export const WP006C_MAX_STATUS = 'CALIBRATION_CANDIDATE' as const;
export const WP006C_PRNU_STATUS = 'NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL' as const;

export const WP006C_FEATURE_GROUPS = [
  'RESIDUAL_ENERGY',
  'INTENSITY_CONDITIONED_RESIDUAL',
  'CROSS_CHANNEL_RESIDUAL',
  'RESIDUAL_AUTOCORRELATION',
  'PARITY_PERIODICITY',
  'EDGE_CONDITIONED_RESIDUAL',
  'MULTISCALE_RESIDUAL',
  'PATCH_CONSISTENCY',
] as const;
export type Wp006cFeatureGroup = (typeof WP006C_FEATURE_GROUPS)[number];

export const WP006C_APPLICABILITY = ['applicable', 'not_applicable', 'unavailable', 'invalid'] as const;
export type Wp006cApplicability = (typeof WP006C_APPLICABILITY)[number];

export const EF2_CONFIG = Object.freeze({
  patchSize: 256,
  maxPatches: 8,
  candidateGridRows: 3,
  candidateGridColumns: 3,
  candidateVarianceSampleStep: 8,
  residualKernel: '3x3_uniform_excluding_center',
  multiscaleKernel: '5x5_uniform',
  edgeGradientThreshold: 0.08,
  residualHistogramBins: 256,
  residualHistogramMaximum: 1,
  scoreAggregation: 'median_of_group_mean_squared_robust_z',
  deviceWeighting: 'equal_device_center_weight',
  scaleEstimator: '1.4826_median_absolute_deviation_about_pooled_center',
  scaleFloor: 0.0001,
  calibrationVarianceFloor: 1e-12,
  calibrationAvailabilityMinimum: 0.8,
  thresholdQuantile: 0.9,
  bootstrapSeed: 6061301,
  bootstrapReplicates: 1000,
  preprocessingIdentifier: 'SHARP_RAW_DECODE_NO_ROTATE_UCHAR_RGB_OR_GRAY_V1',
  patchSelectionIdentifier: 'NATIVE_GRID_VARIANCE_RANKED_NON_SEMANTIC_V1',
  noMetadataInputs: true,
  noTruthInputs: true,
});

export interface Wp006cDecodedPixels {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
}

export interface Wp006cFeatureVector {
  values: number[];
  patchCount: number;
  applicability: Wp006cApplicability;
  unavailableFeatures: string[];
}

export interface Wp006cFeatureDefinition {
  featureGroup: Wp006cFeatureGroup;
  featureName: string;
  definition: string;
  preprocessing: string;
  patchSelectionRule: string;
  aggregationRule: string;
  expectedNumericDomain: string;
  degenerateFeatureHandling: string;
  missingValueHandling: string;
  primaryScore: boolean;
  diagnosticOnly: boolean;
}

export interface Wp006cFeatureRegistry {
  schemaVersion: typeof WP006C_FEATURE_REGISTRY_SCHEMA_VERSION;
  specialistId: typeof WP006C_SPECIALIST_ID;
  specialistVersion: typeof WP006C_SPECIALIST_VERSION;
  semanticStatus: 'MEASUREMENT_ONLY';
  prnuStatus: typeof WP006C_PRNU_STATUS;
  preprocessing: {
    identifier: string;
    orientationHandling: string;
    colorHandling: string;
    globalResize: boolean;
  };
  patchSelection: {
    identifier: string;
    patchSize: number;
    maximumPatches: number;
    candidateGrid: string;
    ranking: string;
    semanticSelection: boolean;
  };
  features: readonly Wp006cFeatureDefinition[];
  primaryAggregation: {
    featureGroups: readonly Wp006cFeatureGroup[];
    withinGroup: string;
    acrossGroups: string;
  };
}

const BASE_FEATURE_DEFINITIONS: readonly Wp006cFeatureDefinition[] = Object.freeze([
  {
    featureGroup: 'RESIDUAL_ENERGY',
    featureName: 'residualAbsMean',
    definition: 'Mean absolute 3x3-excluding-center luminance residual over valid patch pixels.',
    preprocessing: 'Native decoded pixel values normalized to [0,1]; luminance is 0.299R+0.587G+0.114B.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Excluded if calibration variance is at or below the declared variance floor.',
    missingValueHandling: 'Non-finite patch values are omitted; feature is unavailable if fewer than 80% of calibration vectors are finite.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_ENERGY',
    featureName: 'residualRms',
    definition: 'Root mean square of the 3x3-excluding-center luminance residual.',
    preprocessing: 'Native decoded pixel values normalized to [0,1].',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Excluded if calibration variance is at or below the declared variance floor.',
    missingValueHandling: 'Non-finite patch values are omitted.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_ENERGY',
    featureName: 'residualP90',
    definition: 'Approximate 90th percentile of absolute luminance residual using a fixed 256-bin histogram.',
    preprocessing: 'Native decoded pixel values normalized to [0,1]; histogram range is fixed at [0,1].',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Excluded if calibration variance is at or below the declared variance floor.',
    missingValueHandling: 'Histogram is unavailable when no valid residual pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_ENERGY',
    featureName: 'residualP90ToMedianRatio',
    definition: '90th-percentile absolute residual divided by the median absolute residual plus a fixed epsilon.',
    preprocessing: 'Same fixed residual histogram as residualP90.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 when the median residual is zero.',
    missingValueHandling: 'Unavailable when no valid residual pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'INTENSITY_CONDITIONED_RESIDUAL',
    featureName: 'residualIntensitySlope',
    definition: 'Least-squares slope of absolute residual against center-pixel luminance.',
    preprocessing: 'Native decoded pixel values normalized to [0,1].',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: 'finite real',
    degenerateFeatureHandling: 'Returns 0 when luminance variance is degenerate.',
    missingValueHandling: 'Unavailable when fewer than two valid pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'INTENSITY_CONDITIONED_RESIDUAL',
    featureName: 'residualIntensityR2',
    definition: 'Squared correlation of absolute residual with center-pixel luminance.',
    preprocessing: 'Native decoded pixel values normalized to [0,1].',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 when luminance or residual variance is degenerate.',
    missingValueHandling: 'Unavailable when fewer than two valid pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'CROSS_CHANNEL_RESIDUAL',
    featureName: 'residualCrossChannelCorrelationRG',
    definition: 'Pearson correlation between 3x3 residuals of red and green channels.',
    preprocessing: 'Native decoded RGB channels; grayscale inputs repeat the single channel.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when either channel residual variance is degenerate.',
    missingValueHandling: 'Unavailable when fewer than two valid pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'CROSS_CHANNEL_RESIDUAL',
    featureName: 'residualCrossChannelCorrelationRB',
    definition: 'Pearson correlation between 3x3 residuals of red and blue channels.',
    preprocessing: 'Native decoded RGB channels; grayscale inputs repeat the single channel.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when either channel residual variance is degenerate.',
    missingValueHandling: 'Unavailable when fewer than two valid pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'CROSS_CHANNEL_RESIDUAL',
    featureName: 'residualCrossChannelCorrelationGB',
    definition: 'Pearson correlation between 3x3 residuals of green and blue channels.',
    preprocessing: 'Native decoded RGB channels; grayscale inputs repeat the single channel.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when either channel residual variance is degenerate.',
    missingValueHandling: 'Unavailable when fewer than two valid pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'CROSS_CHANNEL_RESIDUAL',
    featureName: 'residualChannelEnergySpread',
    definition: 'Range of per-channel mean absolute 3x3 residual energies.',
    preprocessing: 'Native decoded RGB channels normalized to [0,1].',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 for a constant channel-energy triplet.',
    missingValueHandling: 'Unavailable when no valid residual pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_AUTOCORRELATION',
    featureName: 'residualAutocorrelationHorizontal1',
    definition: 'Normalized product correlation of luminance residuals at horizontal offset one.',
    preprocessing: 'Native decoded luminance residuals.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when residual energy is degenerate.',
    missingValueHandling: 'Unavailable when no valid offset pairs exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_AUTOCORRELATION',
    featureName: 'residualAutocorrelationVertical1',
    definition: 'Normalized product correlation of luminance residuals at vertical offset one.',
    preprocessing: 'Native decoded luminance residuals.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when residual energy is degenerate.',
    missingValueHandling: 'Unavailable when no valid offset pairs exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_AUTOCORRELATION',
    featureName: 'residualAutocorrelationDiagonal1',
    definition: 'Normalized product correlation of luminance residuals at diagonal offset (1,1).',
    preprocessing: 'Native decoded luminance residuals.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when residual energy is degenerate.',
    missingValueHandling: 'Unavailable when no valid offset pairs exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_AUTOCORRELATION',
    featureName: 'residualAutocorrelationDiagonal2',
    definition: 'Normalized product correlation of luminance residuals at diagonal offset (1,-1).',
    preprocessing: 'Native decoded luminance residuals.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[-1,1]',
    degenerateFeatureHandling: 'Returns 0 when residual energy is degenerate.',
    missingValueHandling: 'Unavailable when no valid offset pairs exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'PARITY_PERIODICITY',
    featureName: 'parityPeriodicityEnergy',
    definition: 'Variance of four 2x2 parity-bin mean squared residuals divided by mean residual energy.',
    preprocessing: 'Native decoded luminance residuals; parity is measured on native patch coordinates.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 when mean residual energy is zero.',
    missingValueHandling: 'Unavailable when no valid residual pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'PARITY_PERIODICITY',
    featureName: 'parityPeriodicityContrast',
    definition: 'Maximum-minus-minimum four-bin mean absolute residual divided by their mean plus epsilon.',
    preprocessing: 'Native decoded luminance residuals.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 when all parity-bin means are zero.',
    missingValueHandling: 'Unavailable when no valid residual pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'EDGE_CONDITIONED_RESIDUAL',
    featureName: 'flatResidualAbsMean',
    definition: 'Mean absolute luminance residual where fixed local gradient is below the edge threshold.',
    preprocessing: 'Native decoded luminance and residuals; no semantic segmentation.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 when no flat pixels are present.',
    missingValueHandling: 'Unavailable when neither flat nor edge pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'EDGE_CONDITIONED_RESIDUAL',
    featureName: 'edgeResidualAbsMean',
    definition: 'Mean absolute luminance residual where fixed local gradient meets the edge threshold.',
    preprocessing: 'Native decoded luminance and residuals; no semantic segmentation.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 when no edge pixels are present.',
    missingValueHandling: 'Unavailable when neither flat nor edge pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'EDGE_CONDITIONED_RESIDUAL',
    featureName: 'edgeToFlatResidualRatio',
    definition: 'Edge residual mean divided by flat residual mean plus fixed epsilon.',
    preprocessing: 'Same fixed edge threshold as flatResidualAbsMean.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 when no edge pixels exist.',
    missingValueHandling: 'Unavailable when no flat or edge pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'MULTISCALE_RESIDUAL',
    featureName: 'residualScaleEnergyRatio3To5',
    definition: 'Mean squared 3x3 residual divided by mean squared 5x5 residual.',
    preprocessing: 'Native decoded luminance; fixed 3x3 and 5x5 local means.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 when the 5x5 residual energy is zero.',
    missingValueHandling: 'Unavailable when no valid interior pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'MULTISCALE_RESIDUAL',
    featureName: 'residualScaleP90Ratio3To5',
    definition: '90th-percentile absolute 3x3 residual divided by 90th-percentile absolute 5x5 residual.',
    preprocessing: 'Fixed residual histograms with range [0,1].',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 when the 5x5 percentile is zero.',
    missingValueHandling: 'Unavailable when no valid interior pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'RESIDUAL_ENERGY',
    featureName: 'residualSignBalance',
    definition: 'Absolute difference between positive and negative luminance residual proportions.',
    preprocessing: 'Native decoded luminance residuals.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 when no residual signs are observed.',
    missingValueHandling: 'Unavailable when no valid residual pixels exist.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'PATCH_CONSISTENCY',
    featureName: 'patchDispersionResidualEnergy',
    definition: 'Median-absolute-deviation of selected-patch residualRms values divided by their median plus epsilon.',
    preprocessing: 'Derived only from per-patch pixel-domain residualRms.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Robust relative dispersion across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 for fewer than two valid patch values.',
    missingValueHandling: 'Unavailable if all patch residualRms values are non-finite.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'PATCH_CONSISTENCY',
    featureName: 'patchDispersionCrossChannel',
    definition: 'Median-absolute-deviation of selected-patch residualCrossChannelCorrelationRG values.',
    preprocessing: 'Derived only from per-patch cross-channel residual correlation.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median-absolute-deviation across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 for fewer than two valid patch values.',
    missingValueHandling: 'Unavailable if all patch values are non-finite.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'PATCH_CONSISTENCY',
    featureName: 'patchDispersionAutocorrelation',
    definition: 'Median-absolute-deviation of selected-patch horizontal residual autocorrelation.',
    preprocessing: 'Derived only from per-patch pixel-domain residual autocorrelation.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median-absolute-deviation across selected patches.',
    expectedNumericDomain: '[0,1]',
    degenerateFeatureHandling: 'Returns 0 for fewer than two valid patch values.',
    missingValueHandling: 'Unavailable if all patch values are non-finite.',
    primaryScore: true,
    diagnosticOnly: false,
  },
  {
    featureGroup: 'PATCH_CONSISTENCY',
    featureName: 'patchDispersionParity',
    definition: 'Median-absolute-deviation of selected-patch parityPeriodicityEnergy values.',
    preprocessing: 'Derived only from per-patch native-grid parity periodicity.',
    patchSelectionRule: EF2_CONFIG.patchSelectionIdentifier,
    aggregationRule: 'Median-absolute-deviation across selected patches.',
    expectedNumericDomain: '[0, infinity)',
    degenerateFeatureHandling: 'Returns 0 for fewer than two valid patch values.',
    missingValueHandling: 'Unavailable if all patch values are non-finite.',
    primaryScore: true,
    diagnosticOnly: false,
  },
]);

export const EF2_FEATURE_REGISTRY: Wp006cFeatureRegistry = Object.freeze({
  schemaVersion: WP006C_FEATURE_REGISTRY_SCHEMA_VERSION,
  specialistId: WP006C_SPECIALIST_ID,
  specialistVersion: WP006C_SPECIALIST_VERSION,
  semanticStatus: 'MEASUREMENT_ONLY',
  prnuStatus: WP006C_PRNU_STATUS,
  preprocessing: {
    identifier: EF2_CONFIG.preprocessingIdentifier,
    orientationHandling: 'No EXIF orientation application; raw decoded pixel grid is used as returned by the decoder.',
    colorHandling: 'Use first three decoded channels; alpha is ignored; one-channel input is repeated across RGB calculations.',
    globalResize: false,
  },
  patchSelection: {
    identifier: EF2_CONFIG.patchSelectionIdentifier,
    patchSize: EF2_CONFIG.patchSize,
    maximumPatches: EF2_CONFIG.maxPatches,
    candidateGrid: 'Three evenly spaced x anchors by three evenly spaced y anchors on the native decoded grid, deduplicated.',
    ranking: 'Descending sampled local luminance variance; ties by y then x; no semantic or truth input.',
    semanticSelection: false,
  },
  features: BASE_FEATURE_DEFINITIONS,
  primaryAggregation: {
    featureGroups: WP006C_FEATURE_GROUPS,
    withinGroup: 'Mean squared robust z distance over non-excluded feature scalars.',
    acrossGroups: 'Median of group distances.',
  },
});

export const EF2_FEATURE_NAMES = Object.freeze(EF2_FEATURE_REGISTRY.features.map((feature) => feature.featureName));
export const EF2_FEATURE_INDEX = new Map(EF2_FEATURE_NAMES.map((name, index) => [name, index]));
export const EF2_FEATURE_GROUP_INDEXES = new Map<Wp006cFeatureGroup, number[]>(
  WP006C_FEATURE_GROUPS.map((group) => [group, EF2_FEATURE_REGISTRY.features.flatMap((feature, index) => feature.featureGroup === group ? [index] : [])]),
);

export function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableArtifactHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function assertBlindDecodedPixels(value: unknown): asserts value is Wp006cDecodedPixels {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006c_blind_pixels_invalid');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'channels,height,pixels,width') throw new Error('wp006c_blind_pixels_metadata_or_truth_input');
  if (!Number.isInteger(record.width) || Number(record.width) <= 0 || !Number.isInteger(record.height) || Number(record.height) <= 0) throw new Error('wp006c_blind_pixels_dimensions_invalid');
  if (!Number.isInteger(record.channels) || Number(record.channels) < 1 || Number(record.channels) > 4) throw new Error('wp006c_blind_pixels_channels_invalid');
  if (!(record.pixels instanceof Uint8Array)) throw new Error('wp006c_blind_pixels_buffer_invalid');
  if (record.pixels.byteLength < Number(record.width) * Number(record.height) * Number(record.channels)) throw new Error('wp006c_blind_pixels_buffer_short');
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function median(values: readonly number[]): number {
  const finiteValues = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (finiteValues.length === 0) return Number.NaN;
  const middle = Math.floor(finiteValues.length / 2);
  return finiteValues.length % 2 === 1 ? finiteValues[middle] : (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

export function medianFinite(values: readonly number[]): number | null {
  const value = median(values);
  return Number.isFinite(value) ? value : null;
}

export function madFinite(values: readonly number[], center: number | null = null): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  const location = center ?? median(clean);
  const result = median(clean.map((value) => Math.abs(value - location)));
  return Number.isFinite(result) ? result : null;
}

function pixelChannel(input: Wp006cDecodedPixels, x: number, y: number, channel: number): number {
  const offset = (y * input.width + x) * input.channels;
  if (input.channels === 1 || input.channels === 2) return input.pixels[offset] / 255;
  return input.pixels[offset + Math.min(channel, input.channels - 1)] / 255;
}

function lumaAt(input: Wp006cDecodedPixels, x: number, y: number): number {
  return 0.299 * pixelChannel(input, x, y, 0) + 0.587 * pixelChannel(input, x, y, 1) + 0.114 * pixelChannel(input, x, y, 2);
}

function patchAnchors(length: number, patchSize: number, count: number): number[] {
  if (length < patchSize) return [];
  if (count <= 1 || length === patchSize) return [0];
  return Array.from({ length: count }, (_, index) => Math.round(index * (length - patchSize) / (count - 1)));
}

function patchVariance(input: Wp006cDecodedPixels, left: number, top: number): number {
  const step = EF2_CONFIG.candidateVarianceSampleStep;
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  for (let y = 0; y < EF2_CONFIG.patchSize; y += step) {
    for (let x = 0; x < EF2_CONFIG.patchSize; x += step) {
      const value = lumaAt(input, left + x, top + y);
      count += 1;
      sum += value;
      sumSquares += value * value;
    }
  }
  if (count === 0) return 0;
  return Math.max(0, sumSquares / count - (sum / count) ** 2);
}

function selectPatchAnchors(input: Wp006cDecodedPixels): Array<{ left: number; top: number }> {
  const xs = patchAnchors(input.width, EF2_CONFIG.patchSize, EF2_CONFIG.candidateGridColumns);
  const ys = patchAnchors(input.height, EF2_CONFIG.patchSize, EF2_CONFIG.candidateGridRows);
  const candidates: Array<{ left: number; top: number; variance: number }> = [];
  for (const top of ys) for (const left of xs) candidates.push({ left, top, variance: patchVariance(input, left, top) });
  candidates.sort((a, b) => b.variance - a.variance || a.top - b.top || a.left - b.left);
  return candidates.slice(0, EF2_CONFIG.maxPatches).map(({ left, top }) => ({ left, top }));
}

function integral(values: Float64Array, size: number): Float64Array {
  const stride = size + 1;
  const output = new Float64Array(stride * stride);
  for (let y = 1; y <= size; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= size; x += 1) {
      rowSum += values[(y - 1) * size + (x - 1)];
      output[y * stride + x] = output[(y - 1) * stride + x] + rowSum;
    }
  }
  return output;
}

function regionSum(table: Float64Array, size: number, left: number, top: number, width: number, height: number): number {
  const stride = size + 1;
  const right = left + width;
  const bottom = top + height;
  return table[bottom * stride + right] - table[top * stride + right] - table[bottom * stride + left] + table[top * stride + left];
}

function correlation(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length < 2 || xs.length !== ys.length) return 0;
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index]; const y = ys[index];
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const n = xs.length;
  const vx = n * sxx - sx * sx;
  const vy = n * syy - sy * sy;
  if (vx <= 1e-18 || vy <= 1e-18) return 0;
  return Math.max(-1, Math.min(1, (n * sxy - sx * sy) / Math.sqrt(vx * vy)));
}

function autocorrelation(residual: Float64Array, size: number, dx: number, dy: number): number {
  const xs: number[] = [];
  const ys: number[] = [];
  const start = 2;
  const end = size - 3;
  for (let y = start; y <= end; y += 1) {
    for (let x = start; x <= end; x += 1) {
      const tx = x + dx; const ty = y + dy;
      if (tx < start || tx > end || ty < start || ty > end) continue;
      xs.push(residual[y * size + x]);
      ys.push(residual[ty * size + tx]);
    }
  }
  return correlation(xs, ys);
}

function histogramQuantile(histogram: Uint32Array, total: number, quantile: number): number {
  if (total <= 0) return 0;
  const target = Math.max(1, Math.ceil(total * quantile));
  let cumulative = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    cumulative += histogram[index];
    if (cumulative >= target) return (index + 0.5) / histogram.length;
  }
  return 1;
}

function computePatchFeatures(input: Wp006cDecodedPixels, left: number, top: number): Record<string, number> {
  const size = EF2_CONFIG.patchSize;
  const count = size * size;
  const red = new Float64Array(count);
  const green = new Float64Array(count);
  const blue = new Float64Array(count);
  const luminance = new Float64Array(count);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      red[index] = pixelChannel(input, left + x, top + y, 0);
      green[index] = pixelChannel(input, left + x, top + y, 1);
      blue[index] = pixelChannel(input, left + x, top + y, 2);
      luminance[index] = 0.299 * red[index] + 0.587 * green[index] + 0.114 * blue[index];
    }
  }
  const redIntegral = integral(red, size);
  const greenIntegral = integral(green, size);
  const blueIntegral = integral(blue, size);
  const luminanceIntegral = integral(luminance, size);
  const squareLuminance = new Float64Array(count);
  for (let index = 0; index < count; index += 1) squareLuminance[index] = luminance[index] * luminance[index];
  const squareLuminanceIntegral = integral(squareLuminance, size);
  const residual = new Float64Array(count);
  const residualRed = new Float64Array(count);
  const residualGreen = new Float64Array(count);
  const residualBlue = new Float64Array(count);
  const residualFive = new Float64Array(count);
  const histogram = new Uint32Array(EF2_CONFIG.residualHistogramBins);
  const histogramFive = new Uint32Array(EF2_CONFIG.residualHistogramBins);
  const absoluteResiduals: number[] = [];
  const crossRGX: number[] = []; const crossRGY: number[] = [];
  const crossRBX: number[] = []; const crossRBY: number[] = [];
  const crossGBX: number[] = []; const crossGBY: number[] = [];
  let sumAbs = 0; let sumSquare = 0; let sumAbsRed = 0; let sumAbsGreen = 0; let sumAbsBlue = 0;
  let sumX = 0; let sumY = 0; let sumXX = 0; let sumYY = 0; let sumXY = 0;
  let positive = 0; let negative = 0; let valid = 0;
  let flatAbs = 0; let flatCount = 0; let edgeAbs = 0; let edgeCount = 0;
  const parityAbs = [0, 0, 0, 0]; const paritySquare = [0, 0, 0, 0]; const parityCount = [0, 0, 0, 0];
  let sumSquareFive = 0; let sumSquareThree = 0;
  const validStart = 2; const validEnd = size - 3;
  for (let y = validStart; y <= validEnd; y += 1) {
    for (let x = validStart; x <= validEnd; x += 1) {
      const index = y * size + x;
      const meanLuma = regionSum(luminanceIntegral, size, x - 1, y - 1, 3, 3) / 9;
      const meanRed = regionSum(redIntegral, size, x - 1, y - 1, 3, 3) / 9;
      const meanGreen = regionSum(greenIntegral, size, x - 1, y - 1, 3, 3) / 9;
      const meanBlue = regionSum(blueIntegral, size, x - 1, y - 1, 3, 3) / 9;
      const r = red[index] - meanRed;
      const g = green[index] - meanGreen;
      const b = blue[index] - meanBlue;
      const yResidual = luminance[index] - meanLuma;
      const meanFive = regionSum(luminanceIntegral, size, x - 2, y - 2, 5, 5) / 25;
      const fiveResidual = luminance[index] - meanFive;
      residual[index] = yResidual;
      residualRed[index] = r;
      residualGreen[index] = g;
      residualBlue[index] = b;
      residualFive[index] = fiveResidual;
      const absolute = Math.abs(yResidual);
      const absoluteFive = Math.abs(fiveResidual);
      absoluteResiduals.push(absolute);
      sumAbs += absolute;
      sumSquare += yResidual * yResidual;
      sumAbsRed += Math.abs(r); sumAbsGreen += Math.abs(g); sumAbsBlue += Math.abs(b);
      sumX += luminance[index]; sumY += absolute; sumXX += luminance[index] ** 2; sumYY += absolute ** 2; sumXY += luminance[index] * absolute;
      if (yResidual > 0) positive += 1; else if (yResidual < 0) negative += 1;
      const histogramIndex = Math.max(0, Math.min(histogram.length - 1, Math.floor(absolute * histogram.length)));
      const histogramFiveIndex = Math.max(0, Math.min(histogramFive.length - 1, Math.floor(absoluteFive * histogramFive.length)));
      histogram[histogramIndex] += 1;
      histogramFive[histogramFiveIndex] += 1;
      crossRGX.push(r); crossRGY.push(g); crossRBX.push(r); crossRBY.push(b); crossGBX.push(g); crossGBY.push(b);
      const gradient = Math.abs(luminance[index] - luminance[index - 1]) + Math.abs(luminance[index] - luminance[index - size]);
      if (gradient >= EF2_CONFIG.edgeGradientThreshold) { edgeAbs += absolute; edgeCount += 1; } else { flatAbs += absolute; flatCount += 1; }
      const parity = ((x & 1) << 1) | (y & 1);
      parityAbs[parity] += absolute; paritySquare[parity] += yResidual * yResidual; parityCount[parity] += 1;
      sumSquareThree += yResidual * yResidual; sumSquareFive += fiveResidual * fiveResidual; valid += 1;
    }
  }
  if (valid === 0) return Object.fromEntries(EF2_FEATURE_NAMES.map((name) => [name, Number.NaN]));
  const residualMedian = histogramQuantile(histogram, valid, 0.5);
  const residualP90 = histogramQuantile(histogram, valid, 0.9);
  const residualP90Five = histogramQuantile(histogramFive, valid, 0.9);
  const covarianceNumerator = valid * sumXY - sumX * sumY;
  const varianceX = valid * sumXX - sumX * sumX;
  const varianceY = valid * sumYY - sumY * sumY;
  const slope = varianceX > 1e-18 ? covarianceNumerator / varianceX : 0;
  const intensityR2 = varianceX > 1e-18 && varianceY > 1e-18 ? Math.max(0, Math.min(1, (covarianceNumerator ** 2) / (varianceX * varianceY))) : 0;
  const parityMeansAbs = parityAbs.map((value, index) => value / Math.max(1, parityCount[index]));
  const parityMeansSquare = paritySquare.map((value, index) => value / Math.max(1, parityCount[index]));
  const parityMeanAbs = parityMeansAbs.reduce((sum, value) => sum + value, 0) / parityMeansAbs.length;
  const parityMeanSquare = parityMeansSquare.reduce((sum, value) => sum + value, 0) / parityMeansSquare.length;
  const parityEnergyVariance = parityMeansSquare.reduce((sum, value) => sum + (value - parityMeanSquare) ** 2, 0) / parityMeansSquare.length;
  const channelEnergies = [sumAbsRed, sumAbsGreen, sumAbsBlue].map((value) => value / valid);
  const flatMean = flatCount > 0 ? flatAbs / flatCount : 0;
  const edgeMean = edgeCount > 0 ? edgeAbs / edgeCount : 0;
  const overallMean = sumAbs / valid;
  const energyThree = sumSquareThree / valid;
  const energyFive = sumSquareFive / valid;
  const result: Record<string, number> = {
    residualAbsMean: overallMean,
    residualRms: Math.sqrt(sumSquare / valid),
    residualP90,
    residualP90ToMedianRatio: residualMedian > 0 ? residualP90 / residualMedian : 0,
    residualIntensitySlope: slope,
    residualIntensityR2: intensityR2,
    residualCrossChannelCorrelationRG: correlation(crossRGX, crossRGY),
    residualCrossChannelCorrelationRB: correlation(crossRBX, crossRBY),
    residualCrossChannelCorrelationGB: correlation(crossGBX, crossGBY),
    residualChannelEnergySpread: Math.max(...channelEnergies) - Math.min(...channelEnergies),
    residualAutocorrelationHorizontal1: autocorrelation(residual, size, 1, 0),
    residualAutocorrelationVertical1: autocorrelation(residual, size, 0, 1),
    residualAutocorrelationDiagonal1: autocorrelation(residual, size, 1, 1),
    residualAutocorrelationDiagonal2: autocorrelation(residual, size, 1, -1),
    parityPeriodicityEnergy: parityMeanSquare > 0 ? parityEnergyVariance / parityMeanSquare : 0,
    parityPeriodicityContrast: parityMeanAbs > 0 ? (Math.max(...parityMeansAbs) - Math.min(...parityMeansAbs)) / parityMeanAbs : 0,
    flatResidualAbsMean: flatMean,
    edgeResidualAbsMean: edgeMean,
    edgeToFlatResidualRatio: flatMean > 0 ? edgeMean / flatMean : 0,
    residualScaleEnergyRatio3To5: energyFive > 0 ? energyThree / energyFive : 0,
    residualScaleP90Ratio3To5: residualP90Five > 0 ? residualP90 / residualP90Five : 0,
    residualSignBalance: Math.abs(positive - negative) / valid,
  };
  return result;
}

export function extractEf2FeatureVector(input: Wp006cDecodedPixels): Wp006cFeatureVector {
  assertBlindDecodedPixels(input);
  if (input.width < EF2_CONFIG.patchSize || input.height < EF2_CONFIG.patchSize) {
    return { values: EF2_FEATURE_NAMES.map(() => Number.NaN), patchCount: 0, applicability: 'not_applicable', unavailableFeatures: [...EF2_FEATURE_NAMES] };
  }
  const anchors = selectPatchAnchors(input);
  const patchFeatures = anchors.map(({ left, top }) => computePatchFeatures(input, left, top));
  const values: number[] = [];
  for (const name of EF2_FEATURE_NAMES) {
    if (name.startsWith('patchDispersion')) {
      const sourceName = name === 'patchDispersionResidualEnergy' ? 'residualRms'
        : name === 'patchDispersionCrossChannel' ? 'residualCrossChannelCorrelationRG'
          : name === 'patchDispersionAutocorrelation' ? 'residualAutocorrelationHorizontal1' : 'parityPeriodicityEnergy';
      const sourceValues = patchFeatures.map((patch) => patch[sourceName]).filter((value) => Number.isFinite(value));
      const center = median(sourceValues);
      const spread = madFinite(sourceValues, center);
      values.push(Number.isFinite(center) && spread !== null ? spread / (Math.abs(center) + 1e-6) : Number.NaN);
    } else {
      values.push(median(patchFeatures.map((patch) => patch[name])));
    }
  }
  const unavailableFeatures = values.flatMap((value, index) => Number.isFinite(value) ? [] : [EF2_FEATURE_NAMES[index]]);
  return {
    values,
    patchCount: anchors.length,
    applicability: unavailableFeatures.length === EF2_FEATURE_NAMES.length ? 'unavailable' : 'applicable',
    unavailableFeatures,
  };
}

export interface Wp006cCalibrationModel {
  featureNames: readonly string[];
  includedFeatureIndexes: number[];
  excludedFeatures: Array<{ featureName: string; reason: string; finiteCount: number; calibrationCount: number; variance: number | null }>;
  centers: number[];
  scales: number[];
  deviceCenters: Record<string, number[]>;
  deviceFamilies: string[];
  groupIndexes: Record<string, number[]>;
  method: {
    robustCenter: string;
    scale: string;
    deviceWeighting: string;
    groupAggregation: string;
    overallAggregation: string;
  };
}

function mean(values: readonly number[]): number {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length === 0 ? Number.NaN : clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function variance(values: readonly number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const center = mean(clean);
  return clean.reduce((sum, value) => sum + (value - center) ** 2, 0) / clean.length;
}

export function fitDeviceBalancedCameraModel(vectors: readonly number[][], deviceFamilies: readonly string[], excludedIndexes: readonly number[] = []): Wp006cCalibrationModel {
  if (vectors.length === 0 || vectors.length !== deviceFamilies.length) throw new Error('wp006c_calibration_empty_or_misaligned');
  const featureCount = EF2_FEATURE_NAMES.length;
  if (vectors.some((vector) => vector.length !== featureCount)) throw new Error('wp006c_calibration_feature_length_invalid');
  const excluded = new Set(excludedIndexes);
  const devices = [...new Set(deviceFamilies)].sort();
  const deviceCenters: Record<string, number[]> = {};
  const centers = Array.from({ length: featureCount }, () => Number.NaN);
  const scales = Array.from({ length: featureCount }, () => Number.NaN);
  const excludedFeatures: Wp006cCalibrationModel['excludedFeatures'] = [];
  const includedFeatureIndexes: number[] = [];
  for (const device of devices) {
    const valuesForDevice = vectors.flatMap((vector, index) => deviceFamilies[index] === device ? [vector] : []);
    deviceCenters[device] = Array.from({ length: featureCount }, (_, featureIndex) => median(valuesForDevice.map((vector) => vector[featureIndex])));
  }
  for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
    const values = vectors.map((vector) => vector[featureIndex]);
    const finiteValues = values.filter((value) => Number.isFinite(value));
    const featureVariance = variance(finiteValues);
    const unavailable = finiteValues.length < Math.ceil(vectors.length * EF2_CONFIG.calibrationAvailabilityMinimum);
    const reason = excluded.has(featureIndex) ? 'predeclared_external_exclusion' : unavailable ? 'calibration_availability_below_floor' : featureVariance === null ? 'calibration_variance_unavailable' : featureVariance <= EF2_CONFIG.calibrationVarianceFloor ? 'calibration_variance_at_or_below_floor' : null;
    if (reason) {
      excludedFeatures.push({ featureName: EF2_FEATURE_NAMES[featureIndex], reason, finiteCount: finiteValues.length, calibrationCount: vectors.length, variance: featureVariance });
      continue;
    }
    const deviceCentersForFeature = devices.map((device) => deviceCenters[device][featureIndex]).filter((value) => Number.isFinite(value));
    const center = mean(deviceCentersForFeature);
    const deviations = finiteValues.map((value) => Math.abs(value - center));
    const mad = median(deviations);
    const scale = 1.4826 * mad;
    if (!Number.isFinite(center) || !Number.isFinite(scale) || scale <= EF2_CONFIG.scaleFloor) {
      excludedFeatures.push({ featureName: EF2_FEATURE_NAMES[featureIndex], reason: 'robust_scale_at_or_below_floor', finiteCount: finiteValues.length, calibrationCount: vectors.length, variance: featureVariance });
      continue;
    }
    centers[featureIndex] = center;
    scales[featureIndex] = scale;
    includedFeatureIndexes.push(featureIndex);
  }
  if (includedFeatureIndexes.length < Math.max(1, Math.floor(featureCount / 2))) throw new Error('wp006c_too_few_included_features');
  return {
    featureNames: EF2_FEATURE_NAMES,
    includedFeatureIndexes,
    excludedFeatures,
    centers,
    scales,
    deviceCenters,
    deviceFamilies: devices,
    groupIndexes: Object.fromEntries(WP006C_FEATURE_GROUPS.map((group) => [group, (EF2_FEATURE_GROUP_INDEXES.get(group) ?? []).filter((index) => includedFeatureIndexes.includes(index))])),
    method: {
      robustCenter: 'per-device median then equal arithmetic mean of device centers',
      scale: '1.4826 * median absolute deviation about pooled center with fixed floor',
      deviceWeighting: EF2_CONFIG.deviceWeighting,
      groupAggregation: 'mean squared robust z distance',
      overallAggregation: 'median across feature groups',
    },
  };
}

export interface Wp006cScoredMeasurement {
  rawScore: number;
  normalizedMeasurement: number;
  groupScores: Record<string, number>;
  includedFeatureCount: number;
}

export function scoreEf2FeatureVector(vector: readonly number[], model: Wp006cCalibrationModel): Wp006cScoredMeasurement | null {
  if (vector.length !== model.featureNames.length) throw new Error('wp006c_score_feature_length_invalid');
  const groupScores: Record<string, number> = {};
  for (const group of WP006C_FEATURE_GROUPS) {
    const indexes = model.groupIndexes[group] ?? [];
    const distances = indexes.flatMap((index) => {
      const value = vector[index];
      if (!Number.isFinite(value) || !Number.isFinite(model.centers[index]) || !Number.isFinite(model.scales[index])) return [];
      return [((value - model.centers[index]) / model.scales[index]) ** 2];
    });
    if (distances.length > 0) groupScores[group] = mean(distances);
  }
  const groups = Object.values(groupScores).filter((value) => Number.isFinite(value));
  if (groups.length < 4) return null;
  const rawScore = median(groups);
  if (!Number.isFinite(rawScore)) return null;
  return { rawScore, normalizedMeasurement: 1 / (1 + Math.max(0, rawScore)), groupScores, includedFeatureCount: model.includedFeatureIndexes.length };
}

export function buildSpecialistMeasurement(input: {
  inputHash: string;
  measurement: Wp006cScoredMeasurement | null;
  runtimeMs: number;
  repositoryCommit: string;
  featureRegistryHash: string;
  configurationHash: string;
  benchmarkFingerprint: string;
  applicability: Wp006cApplicability;
  limitations?: readonly string[];
}): Wp006aSpecialistResult {
  const result: Wp006aSpecialistResult = {
    schemaVersion: WP006A_SCHEMA_VERSION,
    specialistId: WP006C_SPECIALIST_ID,
    version: WP006C_SPECIALIST_VERSION,
    evidenceFamily: 'EF2_PHYSICAL_ACQUISITION',
    measurementType: 'PIXEL_ACQUISITION_CONSISTENCY',
    rawScore: input.measurement?.rawScore ?? null,
    normalizedMeasurement: input.measurement?.normalizedMeasurement ?? null,
    applicability: input.measurement ? 'applicable' : input.applicability,
    runtimeMs: Number.isFinite(input.runtimeMs) && input.runtimeMs >= 0 ? input.runtimeMs : 0,
    limitations: [
      'Measurement only; normalizedMeasurement is not a probability of camera origin.',
      'No PRNU claim; device-specific residual correlation is not part of this result.',
      ...(input.limitations ?? []),
    ],
    calibrationStatus: 'MEASUREMENT_ONLY',
    provenance: {
      inputHash: input.inputHash,
      repositoryCommit: input.repositoryCommit,
      checkpointHash: null,
      dependencyLockHash: null,
      preprocessing: `${EF2_CONFIG.preprocessingIdentifier};featureRegistry=${input.featureRegistryHash};configuration=${input.configurationHash};benchmark=${input.benchmarkFingerprint}`,
    },
  };
  assertWp006aSpecialistResult(result);
  return result;
}

export function percentileFinite(values: readonly number[], quantile: number): number | null {
  const clean = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const position = Math.max(0, Math.min(clean.length - 1, (clean.length - 1) * quantile));
  const lower = Math.floor(position); const upper = Math.ceil(position);
  if (lower === upper) return clean[lower];
  return clean[lower] + (clean[upper] - clean[lower]) * (position - lower);
}

export function summarizeScores(scores: readonly number[]): { count: number; median: number | null; iqr: number | null; p95: number | null } {
  const p25 = percentileFinite(scores, 0.25);
  const p50 = percentileFinite(scores, 0.5);
  const p75 = percentileFinite(scores, 0.75);
  return { count: scores.filter((score) => Number.isFinite(score)).length, median: p50, iqr: p25 === null || p75 === null ? null : p75 - p25, p95: percentileFinite(scores, 0.95) };
}

export function rocAuc(cameraScores: readonly number[], nonCameraScores: readonly number[]): number | null {
  const camera = cameraScores.filter((score) => Number.isFinite(score));
  const nonCamera = nonCameraScores.filter((score) => Number.isFinite(score));
  if (camera.length === 0 || nonCamera.length === 0) return null;
  let wins = 0; let ties = 0;
  for (const positive of camera) for (const negative of nonCamera) {
    if (positive < negative) wins += 1;
    else if (positive === negative) ties += 1;
  }
  return (wins + ties / 2) / (camera.length * nonCamera.length);
}

export function cliffsDelta(cameraScores: readonly number[], nonCameraScores: readonly number[]): number | null {
  const camera = cameraScores.filter((score) => Number.isFinite(score));
  const nonCamera = nonCameraScores.filter((score) => Number.isFinite(score));
  if (camera.length === 0 || nonCamera.length === 0) return null;
  let greater = 0; let less = 0;
  for (const cameraScore of camera) for (const nonCameraScore of nonCamera) {
    if (nonCameraScore > cameraScore) greater += 1;
    else if (nonCameraScore < cameraScore) less += 1;
  }
  return (greater - less) / (camera.length * nonCamera.length);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function bootstrapAuc(cameraScores: readonly number[], nonCameraScores: readonly number[], seed = EF2_CONFIG.bootstrapSeed, replicates = EF2_CONFIG.bootstrapReplicates): { lower: number; upper: number; replicates: number } | null {
  const camera = cameraScores.filter((score) => Number.isFinite(score));
  const nonCamera = nonCameraScores.filter((score) => Number.isFinite(score));
  if (camera.length < 2 || nonCamera.length < 2) return null;
  const random = seededRandom(seed);
  const values: number[] = [];
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const cameraSample = Array.from({ length: camera.length }, () => camera[Math.floor(random() * camera.length)]);
    const nonCameraSample = Array.from({ length: nonCamera.length }, () => nonCamera[Math.floor(random() * nonCamera.length)]);
    const auc = rocAuc(cameraSample, nonCameraSample);
    if (auc !== null) values.push(auc);
  }
  return { lower: percentileFinite(values, 0.025) ?? 0, upper: percentileFinite(values, 0.975) ?? 1, replicates: values.length };
}

export function assertNoVerdictFields(value: unknown): void {
  const forbidden = new Set(['supports', 'contradicts', 'origin', 'isReal', 'isAI', 'probabilityReal', 'probabilityAI', 'authenticityVerdict', 'recommendation', 'enforcementAuthority']);
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) { current.forEach(visit); return; }
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.has(key)) throw new Error(`wp006c_specialist_verdict_field:${key}`);
      visit(child);
    }
  };
  visit(value);
}

export function assertCalibrationOnlyFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006c_calibration_freeze_invalid');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WP006C_CALIBRATION_FREEZE_SCHEMA_VERSION) throw new Error('wp006c_calibration_freeze_schema_invalid');
  if (record.benchmarkFingerprint !== WP006C_EXPECTED_BENCHMARK_FINGERPRINT) throw new Error('wp006c_calibration_freeze_fingerprint_invalid');
  if (!Array.isArray(record.calibrationFamilyIds) || record.calibrationFamilyIds.length === 0) throw new Error('wp006c_calibration_freeze_families_invalid');
  if (record.thresholdSource !== 'CALIBRATION_CAMERA_ONLY') throw new Error('wp006c_calibration_freeze_threshold_source_invalid');
  if (record.evaluationPixelsProcessedBeforeFreeze === true) throw new Error('wp006c_calibration_freeze_sequence_invalid');
}

export function assertHoldoutUnblindFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006c_holdout_freeze_invalid');
  const record = value as Record<string, unknown>;
  if (record.decision !== 'UNBLIND_AUTHORIZED') throw new Error('wp006c_holdout_freeze_decision_invalid');
  if (record.benchmarkFingerprint !== WP006C_EXPECTED_BENCHMARK_FINGERPRINT) throw new Error('wp006c_holdout_freeze_fingerprint_invalid');
  if (record.device !== WP006C_HOLDOUT_DEVICE) throw new Error('wp006c_holdout_freeze_device_invalid');
  if (!Array.isArray(record.familyIds) || record.familyIds.length === 0) throw new Error('wp006c_holdout_freeze_families_invalid');
}

