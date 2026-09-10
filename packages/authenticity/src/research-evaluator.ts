import type { OriginHypothesis } from './judge.ts';
import type { GroundTruthEntry } from './research-manifests.ts';
import type { VisionObserverComparison } from './vision-observer.ts';

export interface ResearchPrediction {
  sampleId: string;
  primaryHypothesis: OriginHypothesis;
  uncertainty: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  requiresReview: boolean;
}

export interface ResearchEvaluationRow {
  sampleId: string;
  expectedHypothesis: OriginHypothesis | null;
  predictedHypothesis: OriginHypothesis;
  evaluated: boolean;
  matches: boolean | null;
  truthBasis: GroundTruthEntry['truth']['truthBasis'];
}

export interface ResearchEvaluationResult {
  schemaVersion: 'lythaus-wp004a-research-evaluation-v1';
  sampleCount: number;
  evaluatedCount: number;
  abstainedCount: number;
  agreementRate: number | null;
  rows: readonly ResearchEvaluationRow[];
  enforcementAuthority: false;
}

export interface VisionObserverComparisonSummary {
  schemaVersion: 'lythaus-wp004a-observer-comparison-v1';
  sampleCount: number;
  directReasonedAgreementRate: number | null;
  contradictoryCount: number;
  directIndeterminateRate: number | null;
  reasonedIndeterminateRate: number | null;
  directMeanConfidence: number | null;
  reasonedMeanConfidence: number | null;
  directMeanLatencyMs: number | null;
  reasonedMeanLatencyMs: number | null;
  directCalls: number;
  reasonedCalls: number;
  observationGroundTruthAvailable: false;
  limitations: readonly string[];
}

function expectedHypothesis(entry: GroundTruthEntry): OriginHypothesis | null {
  const truth = entry.truth;
  if (truth.truthBasis !== 'OWNER_ASSERTED') return null;
  if (truth.physicalCameraAcquisition === true && truth.syntheticContent === true) return 'CAMERA_CAPTURE_OF_SYNTHETIC';
  if (truth.localManipulation === true) return 'LOCALLY_MANIPULATED';
  if (truth.screenRecapture === true || truth.digitalScreenshot === true || truth.originClass === 'COMPOSITE') return 'SCREENSHOT_OR_COMPOSITE';
  if (truth.originClass === 'CGI' || truth.originClass === 'TRADITIONAL_DIGITAL_ART') return 'DIGITAL_ART_OR_CGI';
  if (truth.syntheticContent === true || truth.originClass === 'AI_GENERATED') return 'SYNTHETIC';
  if (truth.physicalCameraAcquisition === true && truth.syntheticContent === false) return 'CAMERA_NATIVE';
  return null;
}

export function evaluateResearchPredictions(input: { predictions: readonly ResearchPrediction[]; groundTruth: readonly GroundTruthEntry[] }): ResearchEvaluationResult {
  const truthBySample = new Map(input.groundTruth.map((entry) => [entry.sampleId, entry]));
  const rows = input.predictions.map((prediction) => {
    const truth = truthBySample.get(prediction.sampleId);
    const expected = truth ? expectedHypothesis(truth) : null;
    const evaluated = expected !== null;
    return {
      sampleId: prediction.sampleId,
      expectedHypothesis: expected,
      predictedHypothesis: prediction.primaryHypothesis,
      evaluated,
      matches: evaluated ? prediction.primaryHypothesis === expected : null,
      truthBasis: truth?.truth.truthBasis ?? 'NEEDS_OWNER_CONFIRMATION',
    } satisfies ResearchEvaluationRow;
  });
  const scored = rows.filter((row) => row.matches !== null);
  return {
    schemaVersion: 'lythaus-wp004a-research-evaluation-v1',
    sampleCount: rows.length,
    evaluatedCount: scored.length,
    abstainedCount: rows.filter((row) => row.predictedHypothesis === 'INSUFFICIENT_EVIDENCE').length,
    agreementRate: scored.length === 0 ? null : scored.filter((row) => row.matches === true).length / scored.length,
    rows,
    enforcementAuthority: false,
  };
}

export function assertGroundTruthIsEvaluatorOnly(value: unknown): void {
  if (value && typeof value === 'object' && ('truth' in value || 'groundTruth' in value)) throw new Error('ground_truth_must_not_enter_runtime_packet');
}

function statusSignature(comparison: VisionObserverComparison, mode: 'direct' | 'reasoned'): string {
  return comparison[mode].observations.map((observation) => `${observation.category}:${observation.status}`).sort().join('|');
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function indeterminate(comparison: VisionObserverComparison, mode: 'direct' | 'reasoned'): boolean {
  return comparison[mode].observations.some((observation) => observation.status === 'INDETERMINATE');
}

function confidenceValues(comparisons: readonly VisionObserverComparison[], mode: 'direct' | 'reasoned'): number[] {
  return comparisons.flatMap((comparison) => comparison[mode].observations.flatMap((observation) => observation.measurementConfidence === null ? [] : [observation.measurementConfidence]));
}

export function summarizeVisionObserverComparisons(comparisons: readonly VisionObserverComparison[]): VisionObserverComparisonSummary {
  const sampleCount = comparisons.length;
  return {
    schemaVersion: 'lythaus-wp004a-observer-comparison-v1',
    sampleCount,
    directReasonedAgreementRate: sampleCount === 0 ? null : comparisons.filter((comparison) => statusSignature(comparison, 'direct') === statusSignature(comparison, 'reasoned')).length / sampleCount,
    contradictoryCount: comparisons.filter((comparison) => comparison.contradictory).length,
    directIndeterminateRate: sampleCount === 0 ? null : comparisons.filter((comparison) => indeterminate(comparison, 'direct')).length / sampleCount,
    reasonedIndeterminateRate: sampleCount === 0 ? null : comparisons.filter((comparison) => indeterminate(comparison, 'reasoned')).length / sampleCount,
    directMeanConfidence: mean(confidenceValues(comparisons, 'direct')),
    reasonedMeanConfidence: mean(confidenceValues(comparisons, 'reasoned')),
    directMeanLatencyMs: mean(comparisons.map((comparison) => comparison.direct.executionMs)),
    reasonedMeanLatencyMs: mean(comparisons.map((comparison) => comparison.reasoned.executionMs)),
    directCalls: sampleCount,
    reasonedCalls: sampleCount,
    observationGroundTruthAvailable: false,
    limitations: ['No observation-level ground truth was supplied; agreement, confidence, and latency are descriptive only.', 'A higher confidence value is not evidence of better observation quality.'],
  };
}
