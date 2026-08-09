import { createDecisionAudit, type EvaluationMetrics, type EvaluationRun } from './contracts.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

export const ORIGIN_LABELS = ['CAMERA_NATIVE', 'AI_GENERATED', 'AI_EDITED', 'TRADITIONAL_DIGITAL_ART', 'CGI', 'SCAN', 'COMPOSITE', 'UNKNOWN'] as const;
export type OriginLabel = (typeof ORIGIN_LABELS)[number];
export const TRANSFORMATION_LABELS = ['ORIGINAL', 'JPEG_COMPRESSED', 'RESIZED', 'CROPPED', 'SCREENSHOT', 'SCREEN_RECAPTURE', 'BLURRED', 'SHARPENED', 'METADATA_STRIPPED', 'INPAINTED'] as const;
export type EvaluationTransformationLabel = (typeof TRANSFORMATION_LABELS)[number];

export interface EvaluationDatasetManifest {
  id: UUIDv7;
  name: string;
  version: string;
  storageReference: string;
  contentHashes: readonly string[];
  containsUserContent: false;
  materializationPolicy: 'EXTERNAL_OR_R2_ONLY';
  approvedForEvaluation: boolean;
}

export interface EvaluationSample {
  sampleId: UUIDv7;
  groupId: UUIDv7;
  origin: OriginLabel;
  transformation: EvaluationTransformationLabel;
  truthSynthetic: boolean | null;
}

export interface EvaluationPrediction {
  sampleId: UUIDv7;
  score: number | null;
  classification: 'SYNTHETIC' | 'NOT_SYNTHETIC' | 'ABSTAIN';
  latencyMs: number;
  memoryMb: number | null;
  costUsd: number;
}

export function createEvaluationDatasetManifest(input: Omit<EvaluationDatasetManifest, 'id' | 'containsUserContent' | 'materializationPolicy'> & { containsUserContent?: boolean }): EvaluationDatasetManifest {
  if (input.containsUserContent) throw new Error('evaluation_dataset_user_content_prohibited');
  return { ...input, id: uuidv7(), containsUserContent: false, materializationPolicy: 'EXTERNAL_OR_R2_ONLY' };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function brierScore(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): number | null {
  const byId = new Map(predictions.map((prediction) => [prediction.sampleId, prediction]));
  const observed = samples.filter((sample) => sample.truthSynthetic !== null && byId.get(sample.sampleId)?.score !== null && byId.get(sample.sampleId)?.score !== undefined);
  if (observed.length === 0) return null;
  return observed.reduce((sum, sample) => {
    const score = byId.get(sample.sampleId)?.score ?? 0;
    const truth = sample.truthSynthetic ? 1 : 0;
    return sum + (score - truth) ** 2;
  }, 0) / observed.length;
}

function transformationStability(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): number | null {
  const byId = new Map(predictions.map((prediction) => [prediction.sampleId, prediction]));
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
  const stable = complete.filter((values) => values.every((value) => value === values[0])).length;
  return stable / complete.length;
}

export function calculateEvaluationMetrics(samples: readonly EvaluationSample[], predictions: readonly EvaluationPrediction[]): EvaluationMetrics {
  const byId = new Map(predictions.map((prediction) => [prediction.sampleId, prediction]));
  let falsePositive = 0;
  let falseNegative = 0;
  let truePositive = 0;
  let predictedPositive = 0;
  let actualPositive = 0;
  let abstained = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let memoryTotal = 0;
  let memoryCount = 0;
  let costTotal = 0;
  for (const sample of samples) {
    const prediction = byId.get(sample.sampleId);
    if (!prediction) continue;
    if (prediction.classification === 'ABSTAIN') abstained += 1;
    if (prediction.classification === 'SYNTHETIC') predictedPositive += 1;
    if (sample.truthSynthetic === true) actualPositive += 1;
    if (sample.truthSynthetic === true && prediction.classification === 'SYNTHETIC') truePositive += 1;
    if (sample.truthSynthetic === false && prediction.classification === 'SYNTHETIC') falsePositive += 1;
    if (sample.truthSynthetic === true && prediction.classification === 'NOT_SYNTHETIC') falseNegative += 1;
    if (Number.isFinite(prediction.latencyMs)) { latencyTotal += prediction.latencyMs; latencyCount += 1; }
    if (prediction.memoryMb !== null && Number.isFinite(prediction.memoryMb)) { memoryTotal += prediction.memoryMb; memoryCount += 1; }
    if (Number.isFinite(prediction.costUsd)) costTotal += prediction.costUsd;
  }
  const evaluated = predictions.length;
  return {
    falsePositiveRate: ratio(falsePositive, samples.filter((sample) => sample.truthSynthetic === false).length),
    falseNegativeRate: ratio(falseNegative, actualPositive),
    precision: ratio(truePositive, predictedPositive),
    recall: ratio(truePositive, actualPositive),
    calibrationBrierScore: brierScore(samples, predictions),
    abstentionRate: ratio(abstained, evaluated),
    latencyMs: ratio(latencyTotal, latencyCount),
    memoryMb: ratio(memoryTotal, memoryCount),
    costUsd: costTotal,
    transformationStability: transformationStability(samples, predictions),
  };
}

export async function runEvaluation(input: {
  dataset: EvaluationDatasetManifest;
  modelId: UUIDv7;
  samples: readonly EvaluationSample[];
  predict: (sample: EvaluationSample) => Promise<Omit<EvaluationPrediction, 'sampleId'>>;
}): Promise<{ run: EvaluationRun; predictions: readonly EvaluationPrediction[] }> {
  if (!input.dataset.approvedForEvaluation) throw new Error('evaluation_dataset_not_approved');
  const predictions: EvaluationPrediction[] = [];
  for (const sample of input.samples) predictions.push({ sampleId: sample.sampleId, ...(await input.predict(sample)) });
  const metrics = calculateEvaluationMetrics(input.samples, predictions);
  const run: EvaluationRun = {
    id: uuidv7(),
    datasetManifestId: input.dataset.id,
    modelId: input.modelId,
    originLabels: [...new Set(input.samples.map((sample) => sample.origin))],
    transformations: [...new Set(input.samples.map((sample) => sample.transformation))],
    metrics,
    status: 'COMPLETED',
    audit: createDecisionAudit({
      modelVersion: 'evaluation-only',
      reasonCodes: ['EVALUATION_ONLY', 'NO_ENFORCEMENT_AUTHORITY'],
      finalClassification: null,
      costEstimateUsd: metrics.costUsd ?? 0,
      executionMs: metrics.latencyMs ?? 0,
      uncertainty: { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'Evaluation results require human review and calibration before any deployment decision.' },
    }),
  };
  return { run, predictions };
}
