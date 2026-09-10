import type { OriginHypothesis } from './judge.ts';
import type { GroundTruthEntry } from './research-manifests.ts';

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
