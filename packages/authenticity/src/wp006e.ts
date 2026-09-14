import { createHash } from 'node:crypto';
import {
  WP006A_SCHEMA_VERSION,
  assertWp006aSpecialistResult,
  type Wp006aSpecialistResult,
} from './wp006a.ts';
import type { Applicability } from './contracts.ts';
import { stableStringify } from './wp006b.ts';
import { assertBlindDecodedPixels, type Wp006cDecodedPixels } from './wp006c.ts';
import {
  WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
  WP006D_FUTURE_HOLDOUT_DEVICES,
  WP006D_LGE_DEVICE,
  WP006D_REPLICATION_DEVICES,
} from './wp006d.ts';

export const WP006E_PLAN_SCHEMA_VERSION = 'lythaus-wp006e-ef2-device-invariant-plan-v1' as const;
export const WP006E_CAMERA_PARTITIONS_SCHEMA_VERSION = 'lythaus-wp006e-camera-partitions-v1' as const;
export const WP006E_CONTROL_PARTITIONS_SCHEMA_VERSION = 'lythaus-wp006e-control-partitions-v1' as const;
export const WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION = 'lythaus-wp006e-v1-candidate-feature-registry-v1' as const;
export const WP006E_SELECTION_POLICY_SCHEMA_VERSION = 'lythaus-wp006e-v1-selection-policy-v1' as const;
export const WP006E_DEVELOPMENT_RESULTS_SCHEMA_VERSION = 'lythaus-wp006e-v1-development-results-v1' as const;
export const WP006E_SELECTION_RESULTS_SCHEMA_VERSION = 'lythaus-wp006e-v1-feature-selection-results-v1' as const;
export const WP006E_FINAL_REGISTRY_SCHEMA_VERSION = 'lythaus-wp006e-v1-feature-registry-v1' as const;
export const WP006E_CALIBRATION_FREEZE_SCHEMA_VERSION = 'lythaus-wp006e-v1-calibration-freeze-v1' as const;
export const WP006E_RUN_MANIFEST_SCHEMA_VERSION = 'lythaus-wp006e-run-manifest-v1' as const;
export const WP006E_BENCHMARK_VERSION = 'lythaus-wp006e-ef2-device-invariant-v1' as const;
export const WP006E_SPECIALIST_ID = 'lythaus-ef2-device-invariant-v1' as const;
export const WP006E_SPECIALIST_VERSION = '1' as const;
export const WP006E_MEASUREMENT_TYPE = 'DEVICE_INVARIANT_PIXEL_ACQUISITION_CONSISTENCY' as const;
export const WP006E_EXPECTED_BASE_SHA = 'bc3e17729dda099e4f9e6086d99ef5fc6153a4a9' as const;
export const WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT = 'cb1119f9569736f81b0132969a3ea748a03d85ce03a99387f239f074eba235d4' as const;
export const WP006E_EXPECTED_CSAFE_ARCHIVE_FINGERPRINT = '4e8c0d40f2c7b548d63417be28a8705ba79cda5b6682764ba0d02d38dd6c6131' as const;
export const WP006E_CANONICAL_CROP_SIZE = 1024 as const;
export const WP006E_PATCH_SIZE = 256 as const;
export const WP006E_PATCH_GRID_ROWS = 4 as const;
export const WP006E_PATCH_GRID_COLUMNS = 4 as const;
export const WP006E_MAX_CANDIDATE_FEATURES = 48 as const;
export const WP006E_MAX_SELECTED_FEATURES = 10 as const;
export const WP006E_MIN_SELECTED_GROUPS = 3 as const;
export const WP006E_MIN_NONDEGENERATE_FEATURES = 4 as const;
export const WP006E_FEATURE_CORRELATION_CUTOFF = 0.9 as const;
export const WP006E_LGE_DEVICE = WP006D_LGE_DEVICE;
export const WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES = Object.freeze([...WP006D_FUTURE_HOLDOUT_DEVICES]);
export const WP006E_HISTORICAL_REPLICATION_DEVICES = Object.freeze([...WP006D_REPLICATION_DEVICES]);
export const WP006E_PRNU_STATUS = 'NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL' as const;

export const WP006E_FEATURE_GROUPS = Object.freeze([
  'RESIDUAL_MAGNITUDE',
  'TEXTURE_NORMALIZED_RESIDUAL',
  'LUMINANCE_CONDITIONED_RESIDUAL',
  'CROSS_CHANNEL_RESIDUAL',
  'RESIDUAL_AUTOCORRELATION',
  'DIRECTIONAL_RESIDUAL',
  'PARITY_PERIODICITY',
  'MULTISCALE_RESIDUAL',
  'RESIDUAL_DISTRIBUTION',
  'PATCH_STATIONARITY',
] as const);
export type Wp006eFeatureGroup = (typeof WP006E_FEATURE_GROUPS)[number];

export interface Wp006eFeatureDefinition {
  featureGroup: Wp006eFeatureGroup;
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

export interface Wp006eCandidateFeatureRegistry {
  schemaVersion: typeof WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION;
  specialistId: typeof WP006E_SPECIALIST_ID;
  specialistVersion: typeof WP006E_SPECIALIST_VERSION;
  semanticStatus: 'MEASUREMENT_ONLY';
  prnuStatus: typeof WP006E_PRNU_STATUS;
  preprocessing: {
    identifier: string;
    orientationHandling: string;
    colorHandling: string;
    globalResize: false;
    canonicalCrop: string;
  };
  patchSelection: {
    identifier: string;
    patchSize: number;
    rows: number;
    columns: number;
    overlap: number;
    ranking: string;
    semanticSelection: false;
  };
  features: readonly Wp006eFeatureDefinition[];
  maximumCandidateFeatures: number;
}

export interface Wp006eDecodedPixels extends Wp006cDecodedPixels {}

const PATCH_SELECTION = 'CENTERED_NATIVE_1024_DECODED_PIXEL_CROP_FIXED_4X4_GRID_V1';
const PREPROCESSING = 'SHARP_RAW_DECODE_NO_ROTATE_UCHAR_RGB_OR_GRAY_V1';

const FEATURE_NAMES = Object.freeze([
  'residualAbsMean',
  'residualRms',
  'residualQ10',
  'residualQ50',
  'residualQ90',
  'residualTailRatio',
  'residualSkew',
  'residualKurtosis',
  'residualSignBalance',
  'residualIntensitySlope',
  'residualIntensityR2',
  'residualIntensityBinContrast',
  'normalizedResidualByGradient',
  'flatResidualAbsMean',
  'edgeResidualAbsMean',
  'edgeFlatResidualRatio',
  'crossChannelResidualCorrelationRG',
  'crossChannelResidualCorrelationRB',
  'crossChannelResidualCorrelationGB',
  'crossChannelResidualEnergySpread',
  'residualChromaLumaCorrelation',
  'normalizedResidualAutocorrX1',
  'normalizedResidualAutocorrY1',
  'normalizedResidualAutocorrD1',
  'normalizedResidualAutocorrD2',
  'residualAutocorrDirectionalDifference',
  'residualGradientCorrelation',
  'residualDirectionalAnisotropy',
  'parityPeriodicityRatio',
  'parityEnergyContrast',
  'residualScaleEnergyRatio3To5',
  'residualScaleP90Ratio3To5',
  'residualDistributionSkew',
  'residualDistributionKurtosis',
  'patchResidualEnergyDispersion',
  'patchIntensitySlopeDispersion',
  'patchCrossChannelCorrelationDispersion',
  'patchAutocorrelationDispersion',
  'patchEdgeFlatRatioDispersion',
] as const);

export const WP006E_FEATURE_NAMES = FEATURE_NAMES;

function feature(
  featureGroup: Wp006eFeatureGroup,
  featureName: string,
  definition: string,
  expectedNumericDomain: string,
): Wp006eFeatureDefinition {
  return {
    featureGroup,
    featureName,
    definition,
    preprocessing: 'Native decoded pixel values; no metadata, filename, dimensions, file size, encoder or truth input.',
    patchSelectionRule: PATCH_SELECTION,
    aggregationRule: featureName.startsWith('patch') ? 'Relative MAD across the sixteen fixed-grid patch measurements.' : 'Median across the sixteen fixed-grid patch measurements.',
    expectedNumericDomain,
    degenerateFeatureHandling: 'Non-finite values are omitted; a feature is excluded only by the calibration-only finite-count or variance rule.',
    missingValueHandling: 'The image is unavailable if fewer than four selected features are finite at scoring time.',
    primaryScore: true,
    diagnosticOnly: false,
  };
}

const FEATURE_DEFINITIONS: readonly Wp006eFeatureDefinition[] = Object.freeze([
  feature('RESIDUAL_MAGNITUDE', 'residualAbsMean', 'Mean absolute three-by-three local luminance residual.', '[0,1]'),
  feature('RESIDUAL_MAGNITUDE', 'residualRms', 'Root mean square of the three-by-three local luminance residual.', '[0,1]'),
  feature('RESIDUAL_MAGNITUDE', 'residualQ10', 'Tenth percentile of absolute luminance residuals.', '[0,1]'),
  feature('RESIDUAL_MAGNITUDE', 'residualQ50', 'Median of absolute luminance residuals.', '[0,1]'),
  feature('RESIDUAL_MAGNITUDE', 'residualQ90', 'Ninetieth percentile of absolute luminance residuals.', '[0,1]'),
  feature('RESIDUAL_MAGNITUDE', 'residualTailRatio', 'Ninetieth-to-median absolute residual ratio with a fixed epsilon.', '[0,infinity)'),
  feature('RESIDUAL_DISTRIBUTION', 'residualSkew', 'Third standardized moment of signed local residuals.', '(-infinity,infinity)'),
  feature('RESIDUAL_DISTRIBUTION', 'residualKurtosis', 'Fourth standardized moment of signed local residuals minus three.', '(-infinity,infinity)'),
  feature('RESIDUAL_DISTRIBUTION', 'residualSignBalance', 'Absolute positive/negative residual count imbalance.', '[0,1]'),
  feature('LUMINANCE_CONDITIONED_RESIDUAL', 'residualIntensitySlope', 'Least-squares slope of absolute residual against local luminance.', '(-infinity,infinity)'),
  feature('LUMINANCE_CONDITIONED_RESIDUAL', 'residualIntensityR2', 'Squared correlation of absolute residual against local luminance.', '[0,1]'),
  feature('LUMINANCE_CONDITIONED_RESIDUAL', 'residualIntensityBinContrast', 'Range-to-mean contrast of absolute residual means across four luminance bins.', '[0,infinity)'),
  feature('TEXTURE_NORMALIZED_RESIDUAL', 'normalizedResidualByGradient', 'Mean absolute residual divided by local first-difference gradient plus fixed epsilon.', '[0,infinity)'),
  feature('TEXTURE_NORMALIZED_RESIDUAL', 'flatResidualAbsMean', 'Mean absolute residual in pixels below the fixed gradient threshold.', '[0,1]'),
  feature('TEXTURE_NORMALIZED_RESIDUAL', 'edgeResidualAbsMean', 'Mean absolute residual in pixels at or above the fixed gradient threshold.', '[0,1]'),
  feature('TEXTURE_NORMALIZED_RESIDUAL', 'edgeFlatResidualRatio', 'Edge residual mean divided by flat residual mean with a fixed epsilon.', '[0,infinity)'),
  feature('CROSS_CHANNEL_RESIDUAL', 'crossChannelResidualCorrelationRG', 'Pearson correlation of red and green local residuals.', '[-1,1]'),
  feature('CROSS_CHANNEL_RESIDUAL', 'crossChannelResidualCorrelationRB', 'Pearson correlation of red and blue local residuals.', '[-1,1]'),
  feature('CROSS_CHANNEL_RESIDUAL', 'crossChannelResidualCorrelationGB', 'Pearson correlation of green and blue local residuals.', '[-1,1]'),
  feature('CROSS_CHANNEL_RESIDUAL', 'crossChannelResidualEnergySpread', 'Range of per-channel absolute residual means divided by their mean.', '[0,infinity)'),
  feature('CROSS_CHANNEL_RESIDUAL', 'residualChromaLumaCorrelation', 'Correlation of chroma residual magnitude with absolute luminance residual.', '[-1,1]'),
  feature('RESIDUAL_AUTOCORRELATION', 'normalizedResidualAutocorrX1', 'Correlation of residuals one fixed sampled-grid step horizontally.', '[-1,1]'),
  feature('RESIDUAL_AUTOCORRELATION', 'normalizedResidualAutocorrY1', 'Correlation of residuals one fixed sampled-grid step vertically.', '[-1,1]'),
  feature('RESIDUAL_AUTOCORRELATION', 'normalizedResidualAutocorrD1', 'Correlation of residuals one fixed sampled-grid step on the positive diagonal.', '[-1,1]'),
  feature('RESIDUAL_AUTOCORRELATION', 'normalizedResidualAutocorrD2', 'Correlation of residuals one fixed sampled-grid step on the negative diagonal.', '[-1,1]'),
  feature('DIRECTIONAL_RESIDUAL', 'residualAutocorrDirectionalDifference', 'Absolute difference between horizontal and vertical residual autocorrelation.', '[0,2]'),
  feature('DIRECTIONAL_RESIDUAL', 'residualGradientCorrelation', 'Correlation between absolute residual and local first-difference gradient.', '[-1,1]'),
  feature('DIRECTIONAL_RESIDUAL', 'residualDirectionalAnisotropy', 'Absolute horizontal-versus-vertical residual-difference contrast.', '[0,1]'),
  feature('PARITY_PERIODICITY', 'parityPeriodicityRatio', 'Variance-to-mean ratio of mean absolute residual across four x/y parity classes.', '[0,infinity)'),
  feature('PARITY_PERIODICITY', 'parityEnergyContrast', 'Range-to-mean contrast of squared residual energy across four parity classes.', '[0,infinity)'),
  feature('MULTISCALE_RESIDUAL', 'residualScaleEnergyRatio3To5', 'Three-by-three residual energy divided by five-by-five residual energy.', '[0,infinity)'),
  feature('MULTISCALE_RESIDUAL', 'residualScaleP90Ratio3To5', 'Three-by-three residual ninetieth percentile divided by five-by-five residual ninetieth percentile.', '[0,infinity)'),
  feature('RESIDUAL_DISTRIBUTION', 'residualDistributionSkew', 'Skew of the absolute residual distribution.', '(-infinity,infinity)'),
  feature('RESIDUAL_DISTRIBUTION', 'residualDistributionKurtosis', 'Excess kurtosis of the absolute residual distribution.', '(-infinity,infinity)'),
  feature('PATCH_STATIONARITY', 'patchResidualEnergyDispersion', 'Relative MAD of per-patch residual RMS.', '[0,infinity)'),
  feature('PATCH_STATIONARITY', 'patchIntensitySlopeDispersion', 'Relative MAD of per-patch luminance-conditioned residual slopes.', '[0,infinity)'),
  feature('PATCH_STATIONARITY', 'patchCrossChannelCorrelationDispersion', 'Relative MAD of per-patch red/green residual correlations.', '[0,infinity)'),
  feature('PATCH_STATIONARITY', 'patchAutocorrelationDispersion', 'Relative MAD of per-patch horizontal residual autocorrelations.', '[0,infinity)'),
  feature('PATCH_STATIONARITY', 'patchEdgeFlatRatioDispersion', 'Relative MAD of per-patch edge-to-flat residual ratios.', '[0,infinity)'),
]);

export const WP006E_CANDIDATE_FEATURE_REGISTRY: Wp006eCandidateFeatureRegistry = Object.freeze({
  schemaVersion: WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION,
  specialistId: WP006E_SPECIALIST_ID,
  specialistVersion: WP006E_SPECIALIST_VERSION,
  semanticStatus: 'MEASUREMENT_ONLY',
  prnuStatus: WP006E_PRNU_STATUS,
  preprocessing: {
    identifier: PREPROCESSING,
    orientationHandling: 'No EXIF orientation application; the decoder raw pixel grid is used as returned.',
    colorHandling: 'RGB channels are used when available; grayscale and alpha-bearing inputs are handled deterministically without alpha.',
    globalResize: false as const,
    canonicalCrop: 'Centered native-grid 1024x1024 crop chosen from decoded dimensions before extraction; no resize.',
  },
  patchSelection: {
    identifier: PATCH_SELECTION,
    patchSize: WP006E_PATCH_SIZE,
    rows: WP006E_PATCH_GRID_ROWS,
    columns: WP006E_PATCH_GRID_COLUMNS,
    overlap: 0,
    ranking: 'All sixteen spatial cells are used in row-major order; no variance ranking or semantic selection.',
    semanticSelection: false as const,
  },
  features: FEATURE_DEFINITIONS,
  maximumCandidateFeatures: WP006E_MAX_CANDIDATE_FEATURES,
});

export function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableArtifactHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function hashWithoutField(value: Record<string, unknown>, fieldName: string): string {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  delete copy[fieldName];
  return stableArtifactHash(copy);
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function median(values: readonly number[]): number {
  const clean = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (clean.length === 0) return Number.NaN;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 === 1 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
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

function channelAt(input: Wp006eDecodedPixels, x: number, y: number, channel: number): number {
  const offset = (y * input.width + x) * input.channels;
  if (input.channels <= 2) return input.pixels[offset] / 255;
  return input.pixels[offset + Math.min(channel, input.channels - 1)] / 255;
}

function lumaAt(input: Wp006eDecodedPixels, x: number, y: number): number {
  return 0.299 * channelAt(input, x, y, 0) + 0.587 * channelAt(input, x, y, 1) + 0.114 * channelAt(input, x, y, 2);
}

function channelMean(input: Wp006eDecodedPixels, x: number, y: number, channel: number, radius: number): number {
  let sum = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      sum += channelAt(input, x + dx, y + dy, channel);
      count += 1;
    }
  }
  return sum / count;
}

function localMean(input: Wp006eDecodedPixels, x: number, y: number, radius: number): number {
  let sum = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      sum += lumaAt(input, x + dx, y + dy);
      count += 1;
    }
  }
  return sum / count;
}

function correlation(xs: readonly number[], ys: readonly number[]): number {
  const pairs = xs.flatMap((x, index) => Number.isFinite(x) && Number.isFinite(ys[index]) ? [{ x, y: ys[index] }] : []);
  if (pairs.length < 2) return 0;
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
  for (const pair of pairs) {
    sx += pair.x; sy += pair.y; sxx += pair.x * pair.x; syy += pair.y * pair.y; sxy += pair.x * pair.y;
  }
  const n = pairs.length;
  const vx = n * sxx - sx * sx;
  const vy = n * syy - sy * sy;
  if (vx <= 1e-18 || vy <= 1e-18) return 0;
  return clamp((n * sxy - sx * sy) / Math.sqrt(vx * vy), -1, 1);
}

function quantile(values: readonly number[], q: number): number {
  const clean = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (clean.length === 0) return Number.NaN;
  const position = clamp((clean.length - 1) * q, 0, clean.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? clean[lower] : clean[lower] + (clean[upper] - clean[lower]) * (position - lower);
}

function autocorrelation(values: Float64Array, size: number, dx: number, dy: number): number {
  const xs: number[] = [];
  const ys: number[] = [];
  const startX = Math.max(0, -dx);
  const startY = Math.max(0, -dy);
  const endX = Math.min(size, size - dx);
  const endY = Math.min(size, size - dy);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      xs.push(values[y * size + x]);
      ys.push(values[(y + dy) * size + (x + dx)]);
    }
  }
  return correlation(xs, ys);
}

function relativeMad(values: readonly number[]): number {
  const center = median(values);
  const spread = madFinite(values, center);
  return Number.isFinite(center) && spread !== null ? spread / (Math.abs(center) + 1e-6) : Number.NaN;
}

interface PatchFeatures {
  residualAbsMean: number;
  residualRms: number;
  residualQ10: number;
  residualQ50: number;
  residualQ90: number;
  residualTailRatio: number;
  residualSkew: number;
  residualKurtosis: number;
  residualSignBalance: number;
  residualIntensitySlope: number;
  residualIntensityR2: number;
  residualIntensityBinContrast: number;
  normalizedResidualByGradient: number;
  flatResidualAbsMean: number;
  edgeResidualAbsMean: number;
  edgeFlatResidualRatio: number;
  crossChannelResidualCorrelationRG: number;
  crossChannelResidualCorrelationRB: number;
  crossChannelResidualCorrelationGB: number;
  crossChannelResidualEnergySpread: number;
  residualChromaLumaCorrelation: number;
  normalizedResidualAutocorrX1: number;
  normalizedResidualAutocorrY1: number;
  normalizedResidualAutocorrD1: number;
  normalizedResidualAutocorrD2: number;
  residualAutocorrDirectionalDifference: number;
  residualGradientCorrelation: number;
  residualDirectionalAnisotropy: number;
  parityPeriodicityRatio: number;
  parityEnergyContrast: number;
  residualScaleEnergyRatio3To5: number;
  residualScaleP90Ratio3To5: number;
  residualDistributionSkew: number;
  residualDistributionKurtosis: number;
}

function patchFeatures(input: Wp006eDecodedPixels, left: number, top: number): PatchFeatures {
  const sampleSize = 126;
  const residualGrid = new Float64Array(sampleSize * sampleSize);
  const lumaGrid = new Float64Array(sampleSize * sampleSize);
  const absoluteValues: number[] = [];
  const signedValues: number[] = [];
  const gradients: number[] = [];
  const chromaValues: number[] = [];
  const channelResiduals: [number[], number[], number[]] = [[], [], []];
  const intensityValues: number[] = [];
  const absResidualValues: number[] = [];
  const intensityBins = Array.from({ length: 4 }, () => ({ count: 0, sum: 0 }));
  const parity = Array.from({ length: 4 }, () => ({ count: 0, abs: 0, square: 0 }));
  let sumAbs = 0;
  let sumSquare = 0;
  let sumCube = 0;
  let sumFourth = 0;
  let sumResidual = 0;
  let positive = 0;
  let negative = 0;
  let sumGradientNormalized = 0;
  let flatAbs = 0;
  let flatCount = 0;
  let edgeAbs = 0;
  let edgeCount = 0;
  let sumScaleThree = 0;
  let sumScaleFive = 0;
  const scaleThreeAbs: number[] = [];
  const scaleFiveAbs: number[] = [];
  const channelEnergy = [0, 0, 0];
  const channelCounts = [0, 0, 0];
  const gradientThreshold = 0.08;
  const epsilon = 1e-6;

  for (let py = 0; py < sampleSize; py += 1) {
    const y = top + 2 + py * 2;
    for (let px = 0; px < sampleSize; px += 1) {
      const x = left + 2 + px * 2;
      const index = py * sampleSize + px;
      const luma = lumaAt(input, x, y);
      const residual = luma - localMean(input, x, y, 1);
      const residualFive = luma - localMean(input, x, y, 2);
      const red = channelAt(input, x, y, 0) - channelMean(input, x, y, 0, 1);
      const green = channelAt(input, x, y, 1) - channelMean(input, x, y, 1, 1);
      const blue = channelAt(input, x, y, 2) - channelMean(input, x, y, 2, 1);
      const leftLuma = lumaAt(input, x - 1, y);
      const upLuma = lumaAt(input, x, y - 1);
      const gradient = Math.abs(luma - leftLuma) + Math.abs(luma - upLuma);
      const absolute = Math.abs(residual);
      const bin = Math.min(3, Math.floor(luma * 4));
      residualGrid[index] = residual;
      lumaGrid[index] = luma;
      absoluteValues.push(absolute);
      signedValues.push(residual);
      gradients.push(gradient);
      chromaValues.push(Math.sqrt(((red - green) ** 2 + (green - blue) ** 2 + (blue - red) ** 2) / 3));
      channelResiduals[0].push(red); channelResiduals[1].push(green); channelResiduals[2].push(blue);
      intensityValues.push(luma); absResidualValues.push(absolute);
      intensityBins[bin].count += 1; intensityBins[bin].sum += absolute;
      sumAbs += absolute; sumSquare += residual ** 2; sumCube += residual ** 3; sumFourth += residual ** 4; sumResidual += residual;
      if (residual > 0) positive += 1; else if (residual < 0) negative += 1;
      sumGradientNormalized += absolute / (gradient + 0.01);
      if (gradient >= gradientThreshold) { edgeAbs += absolute; edgeCount += 1; } else { flatAbs += absolute; flatCount += 1; }
      sumScaleThree += residual ** 2; sumScaleFive += residualFive ** 2;
      scaleThreeAbs.push(absolute); scaleFiveAbs.push(Math.abs(residualFive));
      for (let channel = 0; channel < 3; channel += 1) {
        const value = channel === 0 ? red : channel === 1 ? green : blue;
        channelEnergy[channel] += Math.abs(value); channelCounts[channel] += 1;
      }
    }
  }

  const parityRows = 63;
  for (let py = 0; py < parityRows; py += 1) {
    for (let px = 0; px < parityRows; px += 1) {
      for (let parityY = 0; parityY < 2; parityY += 1) {
        for (let parityX = 0; parityX < 2; parityX += 1) {
          const x = left + 2 + px * 4 + parityX;
          const y = top + 2 + py * 4 + parityY;
          const residual = lumaAt(input, x, y) - localMean(input, x, y, 1);
          const bucket = ((x & 1) << 1) | (y & 1);
          parity[bucket].count += 1;
          parity[bucket].abs += Math.abs(residual);
          parity[bucket].square += residual ** 2;
        }
      }
    }
  }

  const count = absoluteValues.length;
  const meanAbs = sumAbs / count;
  const meanResidual = sumResidual / count;
  const varianceResidual = Math.max(0, sumSquare / count - meanResidual ** 2);
  const standardDeviation = Math.sqrt(varianceResidual);
  const centeredThird = sumCube / count - 3 * meanResidual * (sumSquare / count) + 2 * meanResidual ** 3;
  const centeredFourth = sumFourth / count - 4 * meanResidual * (sumCube / count) + 6 * meanResidual ** 2 * (sumSquare / count) - 3 * meanResidual ** 4;
  const intensitySlope = (() => {
    let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
    for (let index = 0; index < intensityValues.length; index += 1) {
      const x = intensityValues[index]; const y = absResidualValues[index];
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const n = intensityValues.length;
    const vx = n * sxx - sx * sx;
    return vx > 1e-18 ? (n * sxy - sx * sy) / vx : 0;
  })();
  const intensityR2 = correlation(intensityValues, absResidualValues) ** 2;
  const intensityMeans = intensityBins.map((bin) => bin.count > 0 ? bin.sum / bin.count : meanAbs);
  const intensityBinContrast = (Math.max(...intensityMeans) - Math.min(...intensityMeans)) / (meanAbs + epsilon);
  const parityAbsMeans = parity.map((item) => item.abs / Math.max(1, item.count));
  const paritySquareMeans = parity.map((item) => item.square / Math.max(1, item.count));
  const parityAbsMean = parityAbsMeans.reduce((sum, value) => sum + value, 0) / parityAbsMeans.length;
  const paritySquareMean = paritySquareMeans.reduce((sum, value) => sum + value, 0) / paritySquareMeans.length;
  const parityVariance = parityAbsMeans.reduce((sum, value) => sum + (value - parityAbsMean) ** 2, 0) / parityAbsMeans.length;
  const channelMeans = channelEnergy.map((value, index) => value / Math.max(1, channelCounts[index]));
  const channelAverage = channelMeans.reduce((sum, value) => sum + value, 0) / channelMeans.length;
  const horizontalDifference: number[] = [];
  const verticalDifference: number[] = [];
  for (let py = 0; py < sampleSize; py += 1) {
    for (let px = 0; px < sampleSize; px += 1) {
      const current = residualGrid[py * sampleSize + px];
      if (px > 0) horizontalDifference.push(Math.abs(current - residualGrid[py * sampleSize + px - 1]));
      if (py > 0) verticalDifference.push(Math.abs(current - residualGrid[(py - 1) * sampleSize + px]));
    }
  }
  const edgeMean = edgeCount > 0 ? edgeAbs / edgeCount : 0;
  const flatMean = flatCount > 0 ? flatAbs / flatCount : 0;
  const autocorrX = autocorrelation(residualGrid, sampleSize, 1, 0);
  const autocorrY = autocorrelation(residualGrid, sampleSize, 0, 1);
  const autocorrD1 = autocorrelation(residualGrid, sampleSize, 1, 1);
  const autocorrD2 = autocorrelation(residualGrid, sampleSize, 1, -1);
  const horizontalMean = horizontalDifference.reduce((sum, value) => sum + value, 0) / Math.max(1, horizontalDifference.length);
  const verticalMean = verticalDifference.reduce((sum, value) => sum + value, 0) / Math.max(1, verticalDifference.length);
  const distributionAbsMean = absoluteValues.reduce((sum, value) => sum + value, 0) / count;
  const distributionVariance = absoluteValues.reduce((sum, value) => sum + (value - distributionAbsMean) ** 2, 0) / count;
  const distributionScale = Math.sqrt(distributionVariance);
  const distributionThird = absoluteValues.reduce((sum, value) => sum + (value - distributionAbsMean) ** 3, 0) / count;
  const distributionFourth = absoluteValues.reduce((sum, value) => sum + (value - distributionAbsMean) ** 4, 0) / count;

  return {
    residualAbsMean: meanAbs,
    residualRms: Math.sqrt(sumSquare / count),
    residualQ10: quantile(absoluteValues, 0.1),
    residualQ50: quantile(absoluteValues, 0.5),
    residualQ90: quantile(absoluteValues, 0.9),
    residualTailRatio: quantile(absoluteValues, 0.9) / (quantile(absoluteValues, 0.5) + epsilon),
    residualSkew: centeredThird / (standardDeviation ** 3 + epsilon),
    residualKurtosis: centeredFourth / (varianceResidual ** 2 + epsilon) - 3,
    residualSignBalance: Math.abs(positive - negative) / count,
    residualIntensitySlope: intensitySlope,
    residualIntensityR2: intensityR2,
    residualIntensityBinContrast: intensityBinContrast,
    normalizedResidualByGradient: sumGradientNormalized / count,
    flatResidualAbsMean: flatMean,
    edgeResidualAbsMean: edgeMean,
    edgeFlatResidualRatio: edgeMean / (flatMean + epsilon),
    crossChannelResidualCorrelationRG: correlation(channelResiduals[0], channelResiduals[1]),
    crossChannelResidualCorrelationRB: correlation(channelResiduals[0], channelResiduals[2]),
    crossChannelResidualCorrelationGB: correlation(channelResiduals[1], channelResiduals[2]),
    crossChannelResidualEnergySpread: (Math.max(...channelMeans) - Math.min(...channelMeans)) / (channelAverage + epsilon),
    residualChromaLumaCorrelation: correlation(chromaValues, absResidualValues),
    normalizedResidualAutocorrX1: autocorrX,
    normalizedResidualAutocorrY1: autocorrY,
    normalizedResidualAutocorrD1: autocorrD1,
    normalizedResidualAutocorrD2: autocorrD2,
    residualAutocorrDirectionalDifference: Math.abs(autocorrX - autocorrY),
    residualGradientCorrelation: correlation(absResidualValues, gradients),
    residualDirectionalAnisotropy: Math.abs(horizontalMean - verticalMean) / (horizontalMean + verticalMean + epsilon),
    parityPeriodicityRatio: parityVariance / (parityAbsMean + epsilon),
    parityEnergyContrast: (Math.max(...paritySquareMeans) - Math.min(...paritySquareMeans)) / (paritySquareMean + epsilon),
    residualScaleEnergyRatio3To5: (sumScaleThree / count) / (sumScaleFive / count + epsilon),
    residualScaleP90Ratio3To5: quantile(scaleThreeAbs, 0.9) / (quantile(scaleFiveAbs, 0.9) + epsilon),
    residualDistributionSkew: distributionThird / (distributionScale ** 3 + epsilon),
    residualDistributionKurtosis: distributionFourth / (distributionVariance ** 2 + epsilon) - 3,
  };
}

export interface Wp006eFeatureVector {
  values: number[];
  patchCount: number;
  applicability: Applicability;
  unavailableFeatures: string[];
}

export function centeredNativeCrop(input: Wp006eDecodedPixels, cropSize = WP006E_CANONICAL_CROP_SIZE): Wp006eDecodedPixels {
  assertBlindDecodedPixels(input);
  if (!Number.isInteger(cropSize) || cropSize <= 0 || input.width < cropSize || input.height < cropSize) throw new Error('wp006e_canonical_crop_unavailable');
  const left = Math.floor((input.width - cropSize) / 2);
  const top = Math.floor((input.height - cropSize) / 2);
  const pixels = new Uint8Array(cropSize * cropSize * input.channels);
  for (let y = 0; y < cropSize; y += 1) {
    const sourceStart = ((top + y) * input.width + left) * input.channels;
    const targetStart = y * cropSize * input.channels;
    pixels.set(input.pixels.subarray(sourceStart, sourceStart + cropSize * input.channels), targetStart);
  }
  return { width: cropSize, height: cropSize, channels: input.channels, pixels };
}

export function extractDeviceInvariantFeatureVector(input: Wp006eDecodedPixels): Wp006eFeatureVector {
  assertBlindDecodedPixels(input);
  if (input.width !== WP006E_CANONICAL_CROP_SIZE || input.height !== WP006E_CANONICAL_CROP_SIZE) {
    return { values: FEATURE_NAMES.map(() => Number.NaN), patchCount: 0, applicability: 'not_applicable', unavailableFeatures: [...FEATURE_NAMES] };
  }
  const patches: PatchFeatures[] = [];
  for (let row = 0; row < WP006E_PATCH_GRID_ROWS; row += 1) {
    for (let column = 0; column < WP006E_PATCH_GRID_COLUMNS; column += 1) {
      patches.push(patchFeatures(input, column * WP006E_PATCH_SIZE, row * WP006E_PATCH_SIZE));
    }
  }
  const values = FEATURE_NAMES.map((name) => {
    if (name === 'patchResidualEnergyDispersion') return relativeMad(patches.map((patch) => patch.residualRms));
    if (name === 'patchIntensitySlopeDispersion') return relativeMad(patches.map((patch) => patch.residualIntensitySlope));
    if (name === 'patchCrossChannelCorrelationDispersion') return relativeMad(patches.map((patch) => patch.crossChannelResidualCorrelationRG));
    if (name === 'patchAutocorrelationDispersion') return relativeMad(patches.map((patch) => patch.normalizedResidualAutocorrX1));
    if (name === 'patchEdgeFlatRatioDispersion') return relativeMad(patches.map((patch) => patch.edgeFlatResidualRatio));
    return median(patches.map((patch) => patch[name as keyof PatchFeatures] as number));
  });
  const unavailableFeatures = values.flatMap((value, index) => Number.isFinite(value) ? [] : [FEATURE_NAMES[index]]);
  return {
    values,
    patchCount: patches.length,
    applicability: unavailableFeatures.length === FEATURE_NAMES.length ? 'unavailable' : 'applicable',
    unavailableFeatures,
  };
}

export interface Wp006eFeatureQuality {
  featureIndex: number;
  featureName: string;
  featureGroup: Wp006eFeatureGroup;
  finiteRate: number;
  effectSize: number;
  direction: 1 | -1;
  directionConsistency: number;
  deviceHeterogeneityRatio: number;
  nuisancePenalty: number;
  qualityScore: number;
  excluded: boolean;
  exclusionReason: string | null;
  cameraCenter: number | null;
  controlCenter: number | null;
}

export interface Wp006eFeatureQualityInput {
  cameraVectors: readonly number[][];
  cameraDevices: readonly string[];
  controlVectors: readonly number[][];
  nuisancePenaltyByFeature?: readonly number[];
}

function featureVariance(values: readonly number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const center = median(clean);
  return clean.reduce((sum, value) => sum + (value - center) ** 2, 0) / clean.length;
}

export function evaluateDeviceInvariantFeatures(input: Wp006eFeatureQualityInput): Wp006eFeatureQuality[] {
  if (input.cameraVectors.length === 0 || input.cameraVectors.length !== input.cameraDevices.length) throw new Error('wp006e_feature_quality_camera_alignment');
  const featureCount = FEATURE_NAMES.length;
  if (input.cameraVectors.some((vector) => vector.length !== featureCount) || input.controlVectors.some((vector) => vector.length !== featureCount)) throw new Error('wp006e_feature_quality_length');
  const devices = [...new Set(input.cameraDevices)].sort();
  const minimumFinite = Math.ceil(input.cameraVectors.length * 0.8);
  return FEATURE_NAMES.map((featureName, featureIndex) => {
    const cameraValues = input.cameraVectors.map((vector) => vector[featureIndex]);
    const controlValues = input.controlVectors.map((vector) => vector[featureIndex]);
    const finiteCamera = cameraValues.filter((value) => Number.isFinite(value));
    const finiteControl = controlValues.filter((value) => Number.isFinite(value));
    const finiteRate = finiteCamera.length / Math.max(1, input.cameraVectors.length);
    const variance = featureVariance(finiteCamera);
    const nuisancePenalty = clamp(Number(input.nuisancePenaltyByFeature?.[featureIndex] ?? 0), 0, 0.9);
    if (finiteCamera.length < minimumFinite) return { featureIndex, featureName, featureGroup: FEATURE_DEFINITIONS[featureIndex].featureGroup, finiteRate, effectSize: 0, direction: 1, directionConsistency: 0, deviceHeterogeneityRatio: Number.POSITIVE_INFINITY, nuisancePenalty, qualityScore: 0, excluded: true, exclusionReason: 'camera_finite_rate_below_0.80', cameraCenter: null, controlCenter: medianFinite(finiteControl) };
    if (variance === null || variance <= 1e-12) return { featureIndex, featureName, featureGroup: FEATURE_DEFINITIONS[featureIndex].featureGroup, finiteRate, effectSize: 0, direction: 1, directionConsistency: 0, deviceHeterogeneityRatio: Number.POSITIVE_INFINITY, nuisancePenalty, qualityScore: 0, excluded: true, exclusionReason: 'camera_variance_at_or_below_floor', cameraCenter: medianFinite(finiteCamera), controlCenter: medianFinite(finiteControl) };
    const deviceCenters = devices.map((device) => medianFinite(input.cameraVectors.flatMap((vector, row) => input.cameraDevices[row] === device ? [vector[featureIndex]] : []))).filter((value): value is number => value !== null);
    const cameraCenter = deviceCenters.length > 0 ? deviceCenters.reduce((sum, value) => sum + value, 0) / deviceCenters.length : Number.NaN;
    const controlCenter = median(finiteControl);
    if (!Number.isFinite(cameraCenter) || !Number.isFinite(controlCenter)) return { featureIndex, featureName, featureGroup: FEATURE_DEFINITIONS[featureIndex].featureGroup, finiteRate, effectSize: 0, direction: 1, directionConsistency: 0, deviceHeterogeneityRatio: Number.POSITIVE_INFINITY, nuisancePenalty, qualityScore: 0, excluded: true, exclusionReason: 'camera_or_control_center_unavailable', cameraCenter: Number.isFinite(cameraCenter) ? cameraCenter : null, controlCenter: Number.isFinite(controlCenter) ? controlCenter : null };
    const direction: 1 | -1 = cameraCenter >= controlCenter ? 1 : -1;
    const midpoint = (cameraCenter + controlCenter) / 2;
    const scale = Math.max(1.4826 * (madFinite(finiteCamera, cameraCenter) ?? 0), 1e-6);
    const effectSize = Math.min(4, Math.abs(cameraCenter - controlCenter) / scale);
    const directionConsistency = deviceCenters.length === 0 ? 0 : deviceCenters.filter((value) => direction * (value - midpoint) >= 0).length / deviceCenters.length;
    const withinDevice = devices.map((device) => {
      const values = input.cameraVectors.flatMap((vector, row) => input.cameraDevices[row] === device ? [vector[featureIndex]] : []);
      return madFinite(values);
    }).filter((value): value is number => value !== null);
    const within = median(withinDevice);
    const between = median(deviceCenters.map((value) => Math.abs(value - cameraCenter)));
    const deviceHeterogeneityRatio = Math.min(100, between / (within + 1e-6));
    const qualityScore = effectSize * directionConsistency * (1 / (1 + deviceHeterogeneityRatio)) * (1 - nuisancePenalty) * finiteRate;
    return { featureIndex, featureName, featureGroup: FEATURE_DEFINITIONS[featureIndex].featureGroup, finiteRate, effectSize, direction, directionConsistency, deviceHeterogeneityRatio, nuisancePenalty, qualityScore, excluded: false, exclusionReason: null, cameraCenter, controlCenter };
  });
}

function rank(values: readonly number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const result = Array.from({ length: values.length }, () => 0);
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    const average = (index + end - 1) / 2 + 1;
    for (let cursor = index; cursor < end; cursor += 1) result[sorted[cursor].index] = average;
    index = end;
  }
  return result;
}

export function spearmanCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const pairs = xs.flatMap((value, index) => Number.isFinite(value) && Number.isFinite(ys[index]) ? [{ x: value, y: ys[index] }] : []);
  if (pairs.length < 2) return 0;
  return correlation(rank(pairs.map((pair) => pair.x)), rank(pairs.map((pair) => pair.y)));
}

export interface Wp006eFeatureSelection {
  selectedFeatureIndexes: number[];
  selectedFeatureNames: string[];
  selectedFeatureGroups: Wp006eFeatureGroup[];
  rejectedRedundantFeatures: Array<{ featureName: string; retainedFeatureName: string; absoluteSpearmanRho: number }>;
  failureReason: string | null;
}

export function selectDeviceInvariantFeatures(
  qualities: readonly Wp006eFeatureQuality[],
  cameraVectors: readonly number[][],
  controlVectors: readonly number[][],
  maximum = WP006E_MAX_SELECTED_FEATURES,
  minimumGroups = WP006E_MIN_SELECTED_GROUPS,
): Wp006eFeatureSelection {
  const candidates = qualities.filter((quality) => !quality.excluded && Number.isFinite(quality.qualityScore)).sort((left, right) => right.qualityScore - left.qualityScore || left.featureName.localeCompare(right.featureName));
  const combined = [...cameraVectors, ...controlVectors];
  const selected: Wp006eFeatureQuality[] = [];
  const rejectedRedundantFeatures: Wp006eFeatureSelection['rejectedRedundantFeatures'] = [];
  const isRedundant = (candidate: Wp006eFeatureQuality): boolean => {
    for (const retained of selected) {
      const rho = Math.abs(spearmanCorrelation(combined.map((vector) => vector[candidate.featureIndex]), combined.map((vector) => vector[retained.featureIndex])));
      if (rho >= WP006E_FEATURE_CORRELATION_CUTOFF) {
        rejectedRedundantFeatures.push({ featureName: candidate.featureName, retainedFeatureName: retained.featureName, absoluteSpearmanRho: rho });
        return true;
      }
    }
    return false;
  };
  for (const group of WP006E_FEATURE_GROUPS) {
    const candidate = candidates.find((item) => item.featureGroup === group && !selected.includes(item) && !isRedundant(item));
    if (candidate) selected.push(candidate);
  }
  for (const candidate of candidates) {
    if (selected.length >= maximum) break;
    if (selected.includes(candidate) || isRedundant(candidate)) continue;
    selected.push(candidate);
  }
  const groups = [...new Set(selected.map((item) => item.featureGroup))];
  const failureReason = selected.length < WP006E_MIN_NONDEGENERATE_FEATURES ? 'FEATURE_SET_COLLAPSE' : groups.length < minimumGroups ? 'FEATURE_GROUP_DIVERSITY_BELOW_FLOOR' : null;
  return {
    selectedFeatureIndexes: selected.map((item) => item.featureIndex),
    selectedFeatureNames: selected.map((item) => item.featureName),
    selectedFeatureGroups: groups,
    rejectedRedundantFeatures,
    failureReason,
  };
}

export interface Wp006eDeviceInvariantModel {
  featureNames: readonly string[];
  selectedFeatureIndexes: number[];
  selectedFeatureNames: string[];
  selectedFeatureGroups: Wp006eFeatureGroup[];
  centers: number[];
  scales: number[];
  controlCenters: number[];
  directions: Array<1 | -1 | null>;
  weights: number[];
  deviceCenters: Record<string, number[]>;
  deviceFamilies: string[];
  method: {
    cameraCenter: string;
    scale: string;
    featureQuality: string;
    redundancy: string;
    score: string;
    threshold: string;
  };
}

function equalDeviceCenters(vectors: readonly number[][], devices: readonly string[], featureIndex: number): { center: number; deviceCenters: Record<string, number[]> } {
  const families = [...new Set(devices)].sort();
  const map: Record<string, number[]> = {};
  const centers: number[] = [];
  for (const family of families) {
    const values = vectors.flatMap((vector, row) => devices[row] === family ? [vector[featureIndex]] : []).filter((value) => Number.isFinite(value));
    const familyCenter = median(values);
    map[family] = [familyCenter];
    if (Number.isFinite(familyCenter)) centers.push(familyCenter);
  }
  return { center: centers.length > 0 ? centers.reduce((sum, value) => sum + value, 0) / centers.length : Number.NaN, deviceCenters: map };
}

export function fitDeviceInvariantModel(
  cameraVectors: readonly number[][],
  cameraDevices: readonly string[],
  controlVectors: readonly number[][],
  qualities: readonly Wp006eFeatureQuality[],
  selection: Wp006eFeatureSelection,
): Wp006eDeviceInvariantModel {
  if (cameraVectors.length === 0 || cameraVectors.length !== cameraDevices.length) throw new Error('wp006e_model_camera_alignment');
  const centers = FEATURE_NAMES.map(() => Number.NaN);
  const scales = FEATURE_NAMES.map(() => Number.NaN);
  const controlCenters = FEATURE_NAMES.map(() => Number.NaN);
  const directions: Array<1 | -1 | null> = FEATURE_NAMES.map(() => null);
  const deviceCenters: Record<string, number[]> = {};
  for (const selectedIndex of selection.selectedFeatureIndexes) {
    const equal = equalDeviceCenters(cameraVectors, cameraDevices, selectedIndex);
    const cameraCenter = equal.center;
    const finiteCamera = cameraVectors.map((vector) => vector[selectedIndex]).filter((value) => Number.isFinite(value));
    const controlCenter = median(controlVectors.map((vector) => vector[selectedIndex]).filter((value) => Number.isFinite(value)));
    const scale = Math.max(1.4826 * (madFinite(finiteCamera, cameraCenter) ?? 0), 1e-6);
    centers[selectedIndex] = cameraCenter;
    scales[selectedIndex] = scale;
    controlCenters[selectedIndex] = controlCenter;
    directions[selectedIndex] = cameraCenter >= controlCenter ? 1 : -1;
    for (const [device, values] of Object.entries(equal.deviceCenters)) deviceCenters[device] ??= Array.from({ length: FEATURE_NAMES.length }, () => Number.NaN), deviceCenters[device][selectedIndex] = values[0];
  }
  const qualityByIndex = new Map(qualities.map((quality) => [quality.featureIndex, quality]));
  const rawWeights = selection.selectedFeatureIndexes.map((index) => Math.max(0, qualityByIndex.get(index)?.qualityScore ?? 0));
  const rawWeightSum = rawWeights.reduce((sum, value) => sum + value, 0);
  const normalizedWeights = rawWeights.map((value) => rawWeightSum > 0 ? value / rawWeightSum : 1 / Math.max(1, rawWeights.length));
  return {
    featureNames: FEATURE_NAMES,
    selectedFeatureIndexes: [...selection.selectedFeatureIndexes],
    selectedFeatureNames: [...selection.selectedFeatureNames],
    selectedFeatureGroups: [...selection.selectedFeatureGroups],
    centers,
    scales,
    controlCenters,
    directions,
    weights: normalizedWeights,
    deviceCenters,
    deviceFamilies: [...new Set(cameraDevices)].sort(),
    method: {
      cameraCenter: 'Equal arithmetic mean of per-device medians; device image counts do not weight the pooled center.',
      scale: '1.4826 times MAD around the equal-device camera center with a fixed 1e-6 floor.',
      featureQuality: 'min(4,effect) * directionConsistency / (1 + deviceHeterogeneityRatio) * (1 - nuisancePenalty) * finiteRate.',
      redundancy: 'Greedy deterministic selection; absolute Spearman rho >= 0.90 is redundant and the higher-quality feature is retained.',
      score: 'Weighted linear sum of bounded feature components: clamp(0.5 + direction * (value - midpoint) / (2 * (abs(controlCenter-cameraCenter) + scale)), 0, 1).',
      threshold: '10th percentile of training-camera scores only; higher score is more camera-consistent.',
    },
  };
}

export interface Wp006eScoredMeasurement {
  rawScore: number;
  normalizedMeasurement: number;
  includedFeatureCount: number;
}

export function scoreDeviceInvariantVector(vector: readonly number[], model: Wp006eDeviceInvariantModel): Wp006eScoredMeasurement | null {
  if (vector.length !== model.featureNames.length) throw new Error('wp006e_score_feature_length_invalid');
  let weighted = 0;
  let weightTotal = 0;
  for (let index = 0; index < model.selectedFeatureIndexes.length; index += 1) {
    const featureIndex = model.selectedFeatureIndexes[index];
    const value = vector[featureIndex];
    const center = model.centers[featureIndex];
    const scale = model.scales[featureIndex];
    const controlCenter = model.controlCenters[featureIndex];
    const direction = model.directions[featureIndex];
    if (!Number.isFinite(value) || !Number.isFinite(center) || !Number.isFinite(scale) || !Number.isFinite(controlCenter) || direction === null) continue;
    const midpoint = (center + controlCenter) / 2;
    const span = Math.abs(controlCenter - center) + scale;
    const component = clamp(0.5 + direction * (value - midpoint) / (2 * span), 0, 1);
    weighted += model.weights[index] * component;
    weightTotal += model.weights[index];
  }
  if (weightTotal <= 0 || !Number.isFinite(weighted)) return null;
  const score = weighted / weightTotal;
  return { rawScore: score, normalizedMeasurement: score, includedFeatureCount: model.selectedFeatureIndexes.length };
}

export function percentileFinite(values: readonly number[], quantileValue: number): number | null {
  const value = quantile(values, quantileValue);
  return Number.isFinite(value) ? value : null;
}

export function summarizeFinite(values: readonly number[]): { count: number; median: number | null; iqr: number | null; p95: number | null } {
  const p25 = percentileFinite(values, 0.25);
  const p50 = percentileFinite(values, 0.5);
  const p75 = percentileFinite(values, 0.75);
  return { count: values.filter((value) => Number.isFinite(value)).length, median: p50, iqr: p25 === null || p75 === null ? null : p75 - p25, p95: percentileFinite(values, 0.95) };
}

export interface Wp006eNestedLodoFold {
  leftOutDevice: string;
  trainingDeviceFamilies: string[];
  trainingFamilyCount: number;
  selectedFeatureNames: string[];
  selectedFeatureGroups: Wp006eFeatureGroup[];
  threshold: number | null;
  leftOutScores: number[];
  leftOutAcceptance: number | null;
  controlScores: number[];
  controlFalseAcceptance: number | null;
  featureFailure: string | null;
}

export function runNestedLeaveOneDeviceOut(input: {
  cameraVectors: readonly number[][];
  cameraDevices: readonly string[];
  controlVectors: readonly number[][];
  nuisancePenaltyByFeature?: readonly number[];
  nuisancePenaltyForTrainingRows?: (trainingRowIndexes: readonly number[]) => readonly number[];
}): { folds: Wp006eNestedLodoFold[]; cameraAcceptance: number | null; medianDeviceAcceptance: number | null; worstDeviceAcceptance: number | null; controlFalseAcceptance: number | null } {
  const devices = [...new Set(input.cameraDevices)].sort();
  const folds: Wp006eNestedLodoFold[] = [];
  for (const leftOutDevice of devices) {
    const trainingRows = input.cameraVectors.flatMap((vector, row) => input.cameraDevices[row] === leftOutDevice ? [] : [{ vector, device: input.cameraDevices[row] }]);
    const trainingRowIndexes = input.cameraVectors.flatMap((_, row) => input.cameraDevices[row] === leftOutDevice ? [] : [row]);
    const leftOutRows = input.cameraVectors.flatMap((vector, row) => input.cameraDevices[row] === leftOutDevice ? [vector] : []);
    const trainingVectors = trainingRows.map((row) => row.vector);
    const trainingDevices = trainingRows.map((row) => row.device);
    const qualities = evaluateDeviceInvariantFeatures({ cameraVectors: trainingVectors, cameraDevices: trainingDevices, controlVectors: input.controlVectors, nuisancePenaltyByFeature: input.nuisancePenaltyForTrainingRows?.(trainingRowIndexes) ?? input.nuisancePenaltyByFeature });
    const selection = selectDeviceInvariantFeatures(qualities, trainingVectors, input.controlVectors);
    if (selection.failureReason) {
      folds.push({ leftOutDevice, trainingDeviceFamilies: [...new Set(trainingDevices)].sort(), trainingFamilyCount: trainingVectors.length, selectedFeatureNames: selection.selectedFeatureNames, selectedFeatureGroups: selection.selectedFeatureGroups, threshold: null, leftOutScores: [], leftOutAcceptance: null, controlScores: [], controlFalseAcceptance: null, featureFailure: selection.failureReason });
      continue;
    }
    const model = fitDeviceInvariantModel(trainingVectors, trainingDevices, input.controlVectors, qualities, selection);
    const trainingScores = trainingVectors.flatMap((vector) => { const score = scoreDeviceInvariantVector(vector, model); return score ? [score.rawScore] : []; });
    const threshold = percentileFinite(trainingScores, 0.1);
    const leftOutScores = leftOutRows.flatMap((vector) => { const score = scoreDeviceInvariantVector(vector, model); return score ? [score.rawScore] : []; });
    const controlScores = input.controlVectors.flatMap((vector) => { const score = scoreDeviceInvariantVector(vector, model); return score ? [score.rawScore] : []; });
    const leftOutAcceptance = threshold === null || leftOutScores.length === 0 ? null : leftOutScores.filter((score) => score >= threshold).length / leftOutScores.length;
    const controlFalseAcceptance = threshold === null || controlScores.length === 0 ? null : controlScores.filter((score) => score >= threshold).length / controlScores.length;
    folds.push({ leftOutDevice, trainingDeviceFamilies: [...new Set(trainingDevices)].sort(), trainingFamilyCount: trainingVectors.length, selectedFeatureNames: selection.selectedFeatureNames, selectedFeatureGroups: selection.selectedFeatureGroups, threshold, leftOutScores, leftOutAcceptance, controlScores, controlFalseAcceptance, featureFailure: null });
  }
  const acceptances = folds.flatMap((fold) => fold.leftOutAcceptance === null ? [] : [fold.leftOutAcceptance]);
  const cameraResultCounts = folds.reduce((summary, fold) => ({ accepted: summary.accepted + (fold.threshold === null ? 0 : fold.leftOutScores.filter((score) => score >= fold.threshold!).length), total: summary.total + fold.leftOutScores.length }), { accepted: 0, total: 0 });
  const cameraAcceptance = cameraResultCounts.total === 0 ? null : cameraResultCounts.accepted / cameraResultCounts.total;
  const medianDeviceAcceptance = percentileFinite(acceptances, 0.5);
  const worstDeviceAcceptance = acceptances.length === 0 ? null : Math.min(...acceptances);
  const foldControlAcceptances = folds.flatMap((fold) => fold.controlFalseAcceptance === null ? [] : [fold.controlFalseAcceptance]);
  const controlFalseAcceptance = foldControlAcceptances.length === 0 ? null : foldControlAcceptances.reduce((sum, value) => sum + value, 0) / foldControlAcceptances.length;
  return { folds, cameraAcceptance, medianDeviceAcceptance, worstDeviceAcceptance, controlFalseAcceptance };
}

export function buildDeviceInvariantMeasurement(input: {
  inputHash: string;
  measurement: Wp006eScoredMeasurement | null;
  runtimeMs: number;
  repositoryCommit: string;
  candidateFeatureRegistryHash: string;
  finalFeatureRegistryHash?: string | null;
  selectionPolicyHash: string;
  configurationHash: string;
  benchmarkFingerprint: string;
  applicability: Applicability;
  calibrationStatus?: 'MEASUREMENT_ONLY' | 'CALIBRATION_CANDIDATE';
}): Wp006aSpecialistResult {
  const result: Wp006aSpecialistResult = {
    schemaVersion: WP006A_SCHEMA_VERSION,
    specialistId: WP006E_SPECIALIST_ID,
    version: WP006E_SPECIALIST_VERSION,
    evidenceFamily: 'EF2_PHYSICAL_ACQUISITION',
    measurementType: WP006E_MEASUREMENT_TYPE,
    rawScore: input.measurement?.rawScore ?? null,
    normalizedMeasurement: input.measurement?.normalizedMeasurement ?? null,
    applicability: input.measurement ? 'applicable' : input.applicability,
    runtimeMs: Number.isFinite(input.runtimeMs) && input.runtimeMs >= 0 ? input.runtimeMs : 0,
    limitations: [
      'Measurement only; normalizedMeasurement is not a probability of camera origin.',
      'No PRNU claim; device-invariant residual statistics are not sensor identity.',
      'A later calibration policy must establish any directional Evidence Packet role.',
    ],
    calibrationStatus: input.calibrationStatus ?? 'MEASUREMENT_ONLY',
    provenance: {
      inputHash: input.inputHash,
      repositoryCommit: input.repositoryCommit,
      checkpointHash: null,
      dependencyLockHash: null,
      preprocessing: `${PREPROCESSING};candidateFeatureRegistry=${input.candidateFeatureRegistryHash};finalFeatureRegistry=${input.finalFeatureRegistryHash ?? 'NOT_FINALIZED'};selectionPolicy=${input.selectionPolicyHash};configuration=${input.configurationHash};benchmark=${input.benchmarkFingerprint}`,
    },
  };
  assertWp006aSpecialistResult(result);
  return result;
}

export function assertNoWp006eVerdictFields(value: unknown): void {
  const forbidden = new Set(['supports', 'contradicts', 'origin', 'isReal', 'isAI', 'probabilityReal', 'probabilityAI', 'authenticityVerdict', 'recommendation', 'enforcementAuthority', 'cameraOrigin']);
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) { current.forEach(visit); return; }
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.has(key)) throw new Error(`wp006e_specialist_verdict_field:${key}`);
      visit(child);
    }
  };
  visit(value);
}

export function assertWp006ePlan(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006e_plan_invalid');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WP006E_PLAN_SCHEMA_VERSION) throw new Error('wp006e_plan_schema_invalid');
  if (record.baseSha !== WP006E_EXPECTED_BASE_SHA) throw new Error('wp006e_plan_base_invalid');
  if (record.wp006dBenchmarkFingerprint !== WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT) throw new Error('wp006e_plan_wp006d_fingerprint_invalid');
  if (record.wp006cBenchmarkFingerprint !== WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT) throw new Error('wp006e_plan_wp006c_fingerprint_invalid');
  if (record.csafeArchiveDirectoryFingerprint !== WP006E_EXPECTED_CSAFE_ARCHIVE_FINGERPRINT) throw new Error('wp006e_plan_archive_fingerprint_invalid');
  if (record.planStatus !== 'FROZEN_BEFORE_V1_FEATURE_VALUES') throw new Error('wp006e_plan_not_frozen');
  if (record.noModelInference !== true || record.noCloudCalls !== true || record.noProductionChanges !== true) throw new Error('wp006e_plan_safety_invalid');
  if (record.canonicalPixelCropSize !== WP006E_CANONICAL_CROP_SIZE || record.patchGrid !== '4x4_256_NON_OVERLAPPING') throw new Error('wp006e_plan_representation_invalid');
  if (!isDisjointRoleList(record.cameraRoles) || !isDisjointRoleList(record.controlRoles)) throw new Error('wp006e_plan_role_overlap');
  if (record.lgeHoldoutStatus !== 'SEALED' || record.futureModelReserveStatus !== 'SEALED') throw new Error('wp006e_plan_holdout_not_sealed');
}

function isDisjointRoleList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const role of value) {
    if (!role || typeof role !== 'object' || Array.isArray(role)) return false;
    const record = role as Record<string, unknown>;
    if (!Array.isArray(record.deviceIds) && !Array.isArray(record.familyIds)) return false;
    const ids = [...(Array.isArray(record.deviceIds) ? record.deviceIds : []), ...(Array.isArray(record.familyIds) ? record.familyIds : [])].map(String);
    for (const id of ids) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
  }
  return true;
}

export function assertWp006eCandidateRegistry(value: unknown): asserts value is Wp006eCandidateFeatureRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006e_candidate_registry_invalid');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION || record.specialistId !== WP006E_SPECIALIST_ID || record.specialistVersion !== WP006E_SPECIALIST_VERSION) throw new Error('wp006e_candidate_registry_identity_invalid');
  if (record.semanticStatus !== 'MEASUREMENT_ONLY' || record.prnuStatus !== WP006E_PRNU_STATUS) throw new Error('wp006e_candidate_registry_semantics_invalid');
  if (!record.preprocessing || (record.preprocessing as Record<string, unknown>).globalResize !== false) throw new Error('wp006e_candidate_registry_resize_invalid');
  if (!record.patchSelection || (record.patchSelection as Record<string, unknown>).semanticSelection !== false) throw new Error('wp006e_candidate_registry_patch_selection_invalid');
  if (!Array.isArray(record.features) || record.features.length > WP006E_MAX_CANDIDATE_FEATURES || record.features.length !== FEATURE_NAMES.length) throw new Error('wp006e_candidate_registry_feature_count_invalid');
  const names = new Set<string>();
  for (const item of record.features) {
    if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).featureName !== 'string') throw new Error('wp006e_candidate_registry_feature_invalid');
    const name = String((item as Record<string, unknown>).featureName);
    if (names.has(name)) throw new Error('wp006e_candidate_registry_duplicate_feature');
    names.add(name);
  }
}

export function assertWp006eSelectedRegistry(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006e_selected_registry_invalid');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WP006E_FINAL_REGISTRY_SCHEMA_VERSION || record.specialistId !== WP006E_SPECIALIST_ID) throw new Error('wp006e_selected_registry_identity_invalid');
  if (!Array.isArray(record.features) || record.features.length < WP006E_MIN_NONDEGENERATE_FEATURES || record.features.length > WP006E_MAX_SELECTED_FEATURES) throw new Error('wp006e_selected_registry_count_invalid');
  const groups = new Set(record.features.flatMap((item) => item && typeof item === 'object' ? [String((item as Record<string, unknown>).featureGroup)] : []));
  if (groups.size < WP006E_MIN_SELECTED_GROUPS) throw new Error('wp006e_selected_registry_group_diversity_invalid');
  assertNoWp006eVerdictFields(record);
}

export function assertWp006eHoldoutFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006e_holdout_freeze_invalid');
  const record = value as Record<string, unknown>;
  if (record.decision !== 'FINAL_HOLDOUT_UNBLIND_AUTHORIZED') throw new Error('wp006e_holdout_freeze_decision_invalid');
  if (record.lgeHoldoutStatus !== 'SEALED' || record.futureModelReserveStatus !== 'SEALED') throw new Error('wp006e_holdout_freeze_boundary_invalid');
  if (record.algorithmMutableAfterFreeze !== false) throw new Error('wp006e_holdout_freeze_mutable');
}

export function assertWp006eSealedAccess(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('wp006e_sealed_access_invalid');
  const record = value as Record<string, unknown>;
  if (record.lgePixelsOpened === true || record.futureModelReservePixelsOpened === true || record.internalValidationPixelsOpened === true || record.finalControlPixelsOpened === true) throw new Error('wp006e_sealed_access_violation');
}
