import {
  createDecisionAudit,
  EVALUATION_SCHEMA_VERSION,
  type EvaluationMetrics,
  type EvaluationQualityGate,
  type EvaluationRun,
  type EvaluationSliceMetrics,
  type TransformationRobustnessMetrics,
} from './contracts.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';
import type { DatasetRightsClass, DatasetSplit } from './dataset-provenance.ts';

export const ORIGIN_LABELS = ['CAMERA_NATIVE', 'AI_GENERATED', 'AI_EDITED', 'TRADITIONAL_DIGITAL_ART', 'CGI', 'SCAN', 'COMPOSITE', 'UNKNOWN'] as const;
export type OriginLabel = (typeof ORIGIN_LABELS)[number];
export const TRANSFORMATION_LABELS = ['ORIGINAL', 'JPEG_COMPRESSED', 'RESIZED', 'CROPPED', 'SCREENSHOT', 'SCREEN_RECAPTURE', 'BLURRED', 'SHARPENED', 'METADATA_STRIPPED', 'INPAINTED'] as const;
export type EvaluationTransformationLabel = (typeof TRANSFORMATION_LABELS)[number];
export const GENERATOR_SPLITS = ['KNOWN', 'UNSEEN', 'NOT_APPLICABLE'] as const;
export type GeneratorSplit = (typeof GENERATOR_SPLITS)[number];

export const LYTHAUS_HUMAN_CONTENT_FPR_TARGET = 0.01 as const;
export const LYTHAUS_SUBGROUP_FPR_REVIEW_THRESHOLD = 0.02 as const;

export interface EvaluationDatasetManifest {
  id: UUIDv7;
  name: string;
  version: string;
  storageReference: string;
  contentHashes: readonly string[];
  containsUserContent: false;
  materializationPolicy: 'EXTERNAL_OR_R2_ONLY';
  approvedForEvaluation: boolean;
  licenceClassification?: string;
  sourceEvidenceUrls?: readonly string[];
}

export interface EvaluationSample {
  sampleId: UUIDv7;
  groupId: UUIDv7;
  origin: OriginLabel;
  transformation: EvaluationTransformationLabel;
  truthSynthetic: boolean | null;
  generatorFamily?: string | null;
  generatorVersion?: string | null;
  generatorSplit?: GeneratorSplit;
  hardNegative?: boolean;
  sourceFamilyId?: UUIDv7;
  rightsClass?: DatasetRightsClass;
  split?: DatasetSplit;
}

export interface EvaluationPrediction {
  sampleId: UUIDv7;
  score: number | null;
  classification: 'SYNTHETIC' | 'NOT_SYNTHETIC' | 'ABSTAIN';
  latencyMs: number;
  cpuTimeMs?: number | null;
  memoryMb: number | null;
  costUsd: number;
  embedding?: readonly number[] | null;
  evidenceFamilyStates?: readonly string[] | null;
}

export function createEvaluationDatasetManifest(input: Omit<EvaluationDatasetManifest, 'id' | 'containsUserContent' | 'materializationPolicy'> & { containsUserContent?: boolean }): EvaluationDatasetManifest {
  if (input.containsUserContent) throw new Error('evaluation_dataset_user_content_prohibited');
  return { ...input, id: uuidv7(), containsUserContent: false, materializationPolicy: 'EXTERNAL_OR_R2_ONLY' };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function predictionMap(predictions: readonly EvaluationPrediction[]): Map<UUIDv7, EvaluationPrediction> {
  return new Map(predictions.map((prediction) => [prediction.sampleId, prediction]));
}

function knownPairs(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]) {
  const byId = predictionMap(predictions);
  return samples.flatMap((sample) => {
    const prediction = byId.get(sample.sampleId);
    return prediction && sample.truthSynthetic !== null ? [{ sample, prediction }] : [];
  });
}

function brierScore(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): number | null {
  const observed = knownPairs(samples, predictions).filter(({ prediction }) => finite(prediction.score));
  if (observed.length === 0) return null;
  return observed.reduce((sum, { sample, prediction }) => sum + ((prediction.score as number) - (sample.truthSynthetic ? 1 : 0)) ** 2, 0) / observed.length;
}

function expectedCalibrationError(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[], binCount = 10): number | null {
  const observed = knownPairs(samples, predictions).filter(({ prediction }) => finite(prediction.score));
  if (observed.length === 0) return null;
  const bins = Array.from({ length: binCount }, () => ({ count: 0, confidence: 0, truth: 0 }));
  for (const { sample, prediction } of observed) {
    const score = Math.max(0, Math.min(1, prediction.score as number));
    const bin = bins[Math.min(binCount - 1, Math.floor(score * binCount))];
    bin.count += 1;
    bin.confidence += score;
    bin.truth += sample.truthSynthetic ? 1 : 0;
  }
  return bins.reduce((error, bin) => bin.count === 0 ? error : error + (bin.count / observed.length) * Math.abs((bin.confidence / bin.count) - (bin.truth / bin.count)), 0);
}

function auroc(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): number | null {
  const observed = knownPairs(samples, predictions).filter(({ prediction }) => finite(prediction.score)).sort((left, right) => {
    const scoreDifference = (left.prediction.score as number) - (right.prediction.score as number);
    return scoreDifference === 0 ? left.sample.sampleId.localeCompare(right.sample.sampleId) : scoreDifference;
  });
  const positiveCount = observed.filter(({ sample }) => sample.truthSynthetic === true).length;
  const negativeCount = observed.length - positiveCount;
  if (positiveCount === 0 || negativeCount === 0) return null;
  let positiveRankSum = 0;
  let index = 0;
  while (index < observed.length) {
    let end = index + 1;
    const score = observed[index].prediction.score as number;
    while (end < observed.length && observed[end].prediction.score === score) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) if (observed[cursor].sample.truthSynthetic === true) positiveRankSum += averageRank;
    index = end;
  }
  return (positiveRankSum - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
}

function auprc(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): number | null {
  const observed = knownPairs(samples, predictions).filter(({ prediction }) => finite(prediction.score)).sort((left, right) => {
    const scoreDifference = (right.prediction.score as number) - (left.prediction.score as number);
    return scoreDifference === 0 ? left.sample.sampleId.localeCompare(right.sample.sampleId) : scoreDifference;
  });
  const positiveCount = observed.filter(({ sample }) => sample.truthSynthetic === true).length;
  if (positiveCount === 0) return null;
  let truePositive = 0;
  let falsePositive = 0;
  let previousRecall = 0;
  let area = 0;
  for (const { sample } of observed) {
    if (sample.truthSynthetic === true) truePositive += 1;
    else falsePositive += 1;
    const recall = truePositive / positiveCount;
    const precision = truePositive / (truePositive + falsePositive);
    area += (recall - previousRecall) * precision;
    previousRecall = recall;
  }
  return area;
}

function confusion(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]) {
  const pairs = knownPairs(samples, predictions);
  let falsePositive = 0;
  let falseNegative = 0;
  let truePositive = 0;
  let predictedPositive = 0;
  let actualPositive = 0;
  for (const { sample, prediction } of pairs) {
    if (sample.truthSynthetic === true) actualPositive += 1;
    if (prediction.classification === 'SYNTHETIC') predictedPositive += 1;
    if (sample.truthSynthetic === true && prediction.classification === 'SYNTHETIC') truePositive += 1;
    if (sample.truthSynthetic === false && prediction.classification === 'SYNTHETIC') falsePositive += 1;
    if (sample.truthSynthetic === true && prediction.classification === 'NOT_SYNTHETIC') falseNegative += 1;
  }
  const actualNegative = pairs.filter(({ sample }) => sample.truthSynthetic === false).length;
  const precision = ratio(truePositive, predictedPositive);
  const recall = ratio(truePositive, actualPositive);
  return {
    sampleCount: pairs.length,
    falsePositiveRate: ratio(falsePositive, actualNegative),
    falseNegativeRate: ratio(falseNegative, actualPositive),
    precision,
    recall,
    f1: precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall),
  };
}

function coreSliceMetrics(key: string, samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): EvaluationSliceMetrics {
  const counts = confusion(samples, predictions);
  const abstentionCount = samples.reduce((count, sample) => count + (predictionMap(predictions).get(sample.sampleId)?.classification === 'ABSTAIN' ? 1 : 0), 0);
  return {
    key,
    sampleCount: counts.sampleCount,
    falsePositiveRate: counts.falsePositiveRate,
    falseNegativeRate: counts.falseNegativeRate,
    precision: counts.precision,
    recall: counts.recall,
    f1: counts.f1,
    auroc: auroc(samples, predictions),
    auprc: auprc(samples, predictions),
    expectedCalibrationError: expectedCalibrationError(samples, predictions),
    abstentionRate: ratio(abstentionCount, samples.filter((sample) => predictionMap(predictions).has(sample.sampleId)).length),
  };
}

function isHardNegative(sample: EvaluationSample): boolean {
  return sample.hardNegative === true || ['TRADITIONAL_DIGITAL_ART', 'CGI', 'SCAN', 'COMPOSITE'].includes(sample.origin);
}

function transformationStability(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): number | null {
  const byId = predictionMap(predictions);
  const groups = new Map<UUIDv7, string[]>();
  for (const sample of samples) {
    const prediction = byId.get(sample.sampleId);
    if (!prediction || prediction.classification === 'ABSTAIN') continue;
    const group = groups.get(sample.groupId) ?? [];
    group.push(prediction.classification);
    groups.set(sample.groupId, group);
  }
  const complete = [...groups.values()].filter((values) => values.length > 1);
  if (complete.length === 0) return null;
  return complete.filter((values) => values.every((value) => value === values[0])).length / complete.length;
}

function vectorDistance(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  if (length === 0) return 0;
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - (right[index] ?? 0)) ** 2, 0) / length);
}

function sameStates(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined): boolean | null {
  if (!left || !right) return null;
  if (left.length !== right.length) return false;
  return [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function transformationRobustness(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): TransformationRobustnessMetrics | null {
  const byId = predictionMap(predictions);
  const groups = new Map<UUIDv7, Array<{ sample: EvaluationSample; prediction: EvaluationPrediction }>>();
  for (const sample of samples) {
    const prediction = byId.get(sample.sampleId);
    if (!prediction) continue;
    const group = groups.get(sample.groupId) ?? [];
    group.push({ sample, prediction });
    groups.set(sample.groupId, group);
  }
  const complete = [...groups.values()].filter((group) => group.length > 1);
  if (complete.length === 0) return null;
  const scores = complete.flatMap((group) => group.map(({ prediction }) => prediction.score).filter(finite));
  const scoreMean = scores.length === 0 ? null : scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const scoreVariance = scores.length === 0 ? null : scores.reduce((sum, score) => sum + (score - (scoreMean as number)) ** 2, 0) / scores.length;
  const flips: boolean[] = [];
  const movements: number[] = [];
  const familyStability: number[] = [];
  for (const group of complete) {
    const classes = group.map(({ prediction }) => prediction.classification).filter((value) => value !== 'ABSTAIN');
    if (classes.length > 1) flips.push(classes.some((value) => value !== classes[0]));
    const reference = group.find(({ prediction }) => prediction.embedding && prediction.embedding.length > 0)?.prediction.embedding;
    if (reference) for (const { prediction } of group) if (prediction.embedding) movements.push(vectorDistance(reference, prediction.embedding));
    const referenceStates = group.find(({ prediction }) => prediction.evidenceFamilyStates)?.prediction.evidenceFamilyStates;
    if (referenceStates) {
      const values = group.map(({ prediction }) => sameStates(referenceStates, prediction.evidenceFamilyStates)).filter((value): value is boolean => value !== null);
      if (values.length > 0) familyStability.push(values.filter(Boolean).length / values.length);
    }
  }
  return {
    groupCount: complete.length,
    scoreMean,
    scoreVariance,
    embeddingMovement: movements.length === 0 ? null : movements.reduce((sum, value) => sum + value, 0) / movements.length,
    classificationFlipRate: flips.length === 0 ? null : flips.filter(Boolean).length / flips.length,
    evidenceFamilyStability: familyStability.length === 0 ? null : familyStability.reduce((sum, value) => sum + value, 0) / familyStability.length,
  };
}

export function calculateEvaluationMetrics(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): EvaluationMetrics {
  const overall = coreSliceMetrics('OVERALL', samples, predictions);
  const byId = predictionMap(predictions);
  const matchedPredictions = samples.flatMap((sample) => byId.get(sample.sampleId) ? [byId.get(sample.sampleId) as EvaluationPrediction] : []);
  const perGenerator = [...new Set(samples.map((sample) => sample.generatorFamily).filter((value): value is string => Boolean(value)))].sort().map((key) => coreSliceMetrics(key, samples.filter((sample) => sample.generatorFamily === key), predictions));
  const perTransformation = [...new Set(samples.map((sample) => sample.transformation))].sort().map((key) => coreSliceMetrics(key, samples.filter((sample) => sample.transformation === key), predictions));
  const perOrigin = [...new Set(samples.map((sample) => sample.origin))].sort().map((key) => coreSliceMetrics(key, samples.filter((sample) => sample.origin === key), predictions));
  const hardNegatives = samples.filter(isHardNegative);
  const unseen = samples.filter((sample) => sample.generatorSplit === 'UNSEEN');
  const latencyValues = matchedPredictions.map((prediction) => prediction.latencyMs).filter(Number.isFinite);
  const cpuValues = matchedPredictions.map((prediction) => prediction.cpuTimeMs).filter(finite);
  const memoryValues = matchedPredictions.map((prediction) => prediction.memoryMb).filter(finite);
  const costValues = matchedPredictions.map((prediction) => prediction.costUsd).filter(Number.isFinite);
  return {
    falsePositiveRate: overall.falsePositiveRate,
    falseNegativeRate: overall.falseNegativeRate,
    precision: overall.precision,
    recall: overall.recall,
    f1: overall.f1,
    auroc: overall.auroc,
    auprc: overall.auprc,
    calibrationBrierScore: brierScore(samples, predictions),
    expectedCalibrationError: overall.expectedCalibrationError,
    abstentionRate: overall.abstentionRate,
    latencyMs: ratio(latencyValues.reduce((sum, value) => sum + value, 0), latencyValues.length),
    cpuTimeMs: ratio(cpuValues.reduce((sum, value) => sum + value, 0), cpuValues.length),
    memoryMb: ratio(memoryValues.reduce((sum, value) => sum + value, 0), memoryValues.length),
    costUsd: costValues.reduce((sum, value) => sum + value, 0),
    transformationStability: transformationStability(samples, predictions),
    humanContentFalsePositiveRate: overall.falsePositiveRate,
    hardNegativeFalsePositiveRate: hardNegatives.length === 0 ? null : coreSliceMetrics('HARD_NEGATIVES', hardNegatives, predictions).falsePositiveRate,
    unseenGeneratorFalsePositiveRate: unseen.length === 0 ? null : coreSliceMetrics('UNSEEN_GENERATORS', unseen, predictions).falsePositiveRate,
    perOrigin,
    perGenerator,
    perTransformation,
    transformationRobustness: transformationRobustness(samples, predictions),
  };
}

export function evaluateEvaluationQualityGates(metrics: EvaluationMetrics): EvaluationQualityGate {
  const materialSubgroupsAboveThreshold = [
    ...metrics.perGenerator.filter((slice) => slice.falsePositiveRate !== null && slice.falsePositiveRate > LYTHAUS_SUBGROUP_FPR_REVIEW_THRESHOLD).map((slice) => `generator:${slice.key}`),
    ...metrics.perTransformation.filter((slice) => slice.falsePositiveRate !== null && slice.falsePositiveRate > LYTHAUS_SUBGROUP_FPR_REVIEW_THRESHOLD).map((slice) => `transformation:${slice.key}`),
    ...metrics.perOrigin.filter((slice) => slice.falsePositiveRate !== null && slice.falsePositiveRate > LYTHAUS_SUBGROUP_FPR_REVIEW_THRESHOLD).map((slice) => `origin:${slice.key}`),
  ];
  if (metrics.humanContentFalsePositiveRate === null) {
    return {
      humanContentFalsePositiveRateTarget: LYTHAUS_HUMAN_CONTENT_FPR_TARGET,
      subgroupFalsePositiveReviewThreshold: LYTHAUS_SUBGROUP_FPR_REVIEW_THRESHOLD,
      humanContentFalsePositiveRate: null,
      materialSubgroupsAboveThreshold,
      overallStatus: 'UNKNOWN',
      enforcementAuthority: 'NONE',
      rationale: 'No labelled human-content denominator is available.',
    };
  }
  const overallStatus = metrics.humanContentFalsePositiveRate <= LYTHAUS_HUMAN_CONTENT_FPR_TARGET && materialSubgroupsAboveThreshold.length === 0 ? 'PASS' : 'REVIEW';
  return {
    humanContentFalsePositiveRateTarget: LYTHAUS_HUMAN_CONTENT_FPR_TARGET,
    subgroupFalsePositiveReviewThreshold: LYTHAUS_SUBGROUP_FPR_REVIEW_THRESHOLD,
    humanContentFalsePositiveRate: metrics.humanContentFalsePositiveRate,
    materialSubgroupsAboveThreshold,
    overallStatus,
    enforcementAuthority: 'NONE',
    rationale: overallStatus === 'PASS' ? 'Policy targets are met for this labelled evaluation slice; human review remains required.' : 'One or more policy targets require mitigation or human review; no enforcement authority is granted.',
  };
}

export async function runEvaluation(input: {
  dataset: EvaluationDatasetManifest;
  modelId: UUIDv7;
  samples: readonly EvaluationSample[];
  predict: (sample: EvaluationSample) => Promise<Omit<EvaluationPrediction, 'sampleId'>>;
}): Promise<{ run: EvaluationRun; predictions: readonly EvaluationPrediction[] }> {
  if (!input.dataset.approvedForEvaluation) throw new Error('evaluation_dataset_not_approved');
  if (input.dataset.containsUserContent) throw new Error('evaluation_dataset_user_content_prohibited');
  const predictions: EvaluationPrediction[] = [];
  for (const sample of input.samples) predictions.push({ sampleId: sample.sampleId, ...(await input.predict(sample)) });
  const metrics = calculateEvaluationMetrics(input.samples, predictions);
  const qualityGate = evaluateEvaluationQualityGates(metrics);
  const run: EvaluationRun = {
    id: uuidv7(),
    datasetManifestId: input.dataset.id,
    modelId: input.modelId,
    evaluationSchemaVersion: EVALUATION_SCHEMA_VERSION,
    originLabels: [...new Set(input.samples.map((sample) => sample.origin))],
    transformations: [...new Set(input.samples.map((sample) => sample.transformation))],
    generatorFamilies: [...new Set(input.samples.map((sample) => sample.generatorFamily).filter((value): value is string => Boolean(value)))],
    metrics,
    qualityGate,
    status: 'COMPLETED',
    audit: createDecisionAudit({
      modelVersion: 'evaluation-only',
      reasonCodes: ['EVALUATION_ONLY', 'NO_ENFORCEMENT_AUTHORITY', `QUALITY_GATE_${qualityGate.overallStatus}`],
      finalClassification: null,
      costEstimateUsd: metrics.costUsd ?? 0,
      executionMs: metrics.latencyMs ?? 0,
      uncertainty: { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'Evaluation results require human review and calibration before any deployment decision.' },
    }),
  };
  return { run, predictions };
}
