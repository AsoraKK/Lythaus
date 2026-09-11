import type { VisionObservation } from './vision-observer.ts';

export const GEOMETRY_FRONTBACK_EVALUATOR_SCHEMA_VERSION = 'lythaus-wp004a-geometry-frontback-evaluator-v1' as const;
export const GEOMETRY_FRONTBACK_FIXTURE_VERSION = 'v1' as const;

export type FrontBackColour = 'BLUE' | 'RED';
export type FrontBackSelectedRelation = FrontBackColour | 'INDETERMINATE';
export type FrontBackOutcome = 'CORRECT' | 'INCORRECT' | 'ABSTAIN' | 'PROTOCOL_FAILURE';

export interface GeometryFrontBackTruth {
  fixtureId: string;
  category: 'GEOMETRY_OCCLUSION';
  truth: {
    front: FrontBackColour;
    back: FrontBackColour;
  };
}

export interface GeometryFrontBackEvaluation {
  schemaVersion: typeof GEOMETRY_FRONTBACK_EVALUATOR_SCHEMA_VERSION;
  fixtureId: string;
  fixtureVersion: typeof GEOMETRY_FRONTBACK_FIXTURE_VERSION;
  observationId: string | null;
  selectedRelation: FrontBackSelectedRelation | null;
  outcome: FrontBackOutcome;
  canonicalProtocolValid: boolean;
  regionsEmpty: boolean;
  unsupportedAssertionCount: number;
  originVerdictViolation: boolean;
  requiresReview: boolean;
  reviewReasons: readonly string[];
}

export interface GeometryFrontBackAggregate {
  correct: number;
  incorrect: number;
  abstain: number;
  protocolFailures: number;
  possibleFrontObjectPrior: boolean;
}

const EXACT_RELATIONS: Readonly<Record<string, FrontBackSelectedRelation>> = Object.freeze({
  'Blue rectangle is in front of red rectangle.': 'BLUE',
  'Red rectangle is in front of blue rectangle.': 'RED',
  'Front/back relationship is indeterminate.': 'INDETERMINATE',
});

const ORIGIN_ASSERTION_PATTERN = /\b(?:ai[- ]generated|human[- ]authored|synthetic|authenticity|image origin|origin class|camera origin|camera probability|synthetic probability|human probability)\b/i;

function unsupportedAssertionCount(text: string): number {
  return ORIGIN_ASSERTION_PATTERN.test(text) ? 1 : 0;
}

function protocolReviewReasons(observation: VisionObservation | null, selectedRelation: FrontBackSelectedRelation | null, observationCount: number): string[] {
  const reasons: string[] = [];
  if (observationCount !== 1) reasons.push('OBSERVATION_COUNT_INVALID');
  if (!observation) return [...reasons, 'OBSERVATION_UNAVAILABLE'];
  if (observation.category !== 'GEOMETRY_OCCLUSION') reasons.push('CATEGORY_INVALID');
  if (observation.applicable !== true) reasons.push('APPLICABLE_INVALID');
  if (!['OBSERVED', 'INDETERMINATE'].includes(observation.status)) reasons.push('STATUS_INVALID');
  if (selectedRelation === null) reasons.push('OBSERVATION_TEXT_INVALID');
  if (observation.status === 'OBSERVED' && selectedRelation === 'INDETERMINATE') reasons.push('STATUS_RELATION_MISMATCH');
  if (observation.status === 'INDETERMINATE' && selectedRelation !== 'INDETERMINATE') reasons.push('STATUS_RELATION_MISMATCH');
  if (observation.regions.length !== 0) reasons.push('REGIONS_NOT_EMPTY');
  if (observation.measurementConfidence !== null) reasons.push('CONFIDENCE_NOT_NULL');
  if (observation.limitations.length !== 0) reasons.push('LIMITATIONS_NOT_EMPTY');
  return reasons;
}

export function evaluateGeometryFrontBackObservation(input: {
  observations: readonly VisionObservation[];
  truth: GeometryFrontBackTruth;
}): GeometryFrontBackEvaluation {
  if (input.truth.category !== 'GEOMETRY_OCCLUSION' || !input.truth.fixtureId) throw new Error('geometry_frontback_truth_invalid');
  const observation = input.observations.length === 1 ? input.observations[0] : null;
  const selectedRelation = observation ? (EXACT_RELATIONS[observation.observation.trim()] ?? null) : null;
  const unsupported = observation ? unsupportedAssertionCount(observation.observation) : 0;
  const originVerdictViolation = unsupported > 0;
  const reviewReasons = protocolReviewReasons(observation, selectedRelation, input.observations.length);
  if (originVerdictViolation) reviewReasons.push('ORIGIN_VERDICT_IN_OBSERVATION');
  const canonicalProtocolValid = reviewReasons.length === 0;
  const regionsEmpty = observation?.regions.length === 0;
  if (!canonicalProtocolValid) {
    return {
      schemaVersion: GEOMETRY_FRONTBACK_EVALUATOR_SCHEMA_VERSION,
      fixtureId: input.truth.fixtureId,
      fixtureVersion: GEOMETRY_FRONTBACK_FIXTURE_VERSION,
      observationId: observation?.observationId ?? null,
      selectedRelation,
      outcome: 'PROTOCOL_FAILURE',
      canonicalProtocolValid: false,
      regionsEmpty,
      unsupportedAssertionCount: unsupported,
      originVerdictViolation,
      requiresReview: true,
      reviewReasons,
    };
  }
  const outcome: FrontBackOutcome = selectedRelation === 'INDETERMINATE'
    ? 'ABSTAIN'
    : selectedRelation === input.truth.truth.front ? 'CORRECT' : 'INCORRECT';
  return {
    schemaVersion: GEOMETRY_FRONTBACK_EVALUATOR_SCHEMA_VERSION,
    fixtureId: input.truth.fixtureId,
    fixtureVersion: GEOMETRY_FRONTBACK_FIXTURE_VERSION,
    observationId: observation?.observationId ?? null,
    selectedRelation,
    outcome,
    canonicalProtocolValid: true,
    regionsEmpty: true,
    unsupportedAssertionCount: unsupported,
    originVerdictViolation,
    requiresReview: false,
    reviewReasons: [],
  };
}

export function summarizeGeometryFrontBackEvaluations(evaluations: readonly GeometryFrontBackEvaluation[], truthFrontByFixture: ReadonlyMap<string, FrontBackColour> = new Map()): GeometryFrontBackAggregate {
  const selected = evaluations.filter((evaluation) => evaluation.canonicalProtocolValid && evaluation.selectedRelation !== null && evaluation.selectedRelation !== 'INDETERMINATE');
  const truthFronts = new Set(evaluations.map((evaluation) => truthFrontByFixture.get(evaluation.fixtureId) ?? null).filter((value): value is FrontBackColour => value !== null));
  const selectedRelations = new Set(selected.map((evaluation) => evaluation.selectedRelation));
  return {
    correct: evaluations.filter((evaluation) => evaluation.outcome === 'CORRECT').length,
    incorrect: evaluations.filter((evaluation) => evaluation.outcome === 'INCORRECT').length,
    abstain: evaluations.filter((evaluation) => evaluation.outcome === 'ABSTAIN').length,
    protocolFailures: evaluations.filter((evaluation) => evaluation.outcome === 'PROTOCOL_FAILURE').length,
    possibleFrontObjectPrior: truthFronts.size === 2 && selected.length === evaluations.length && selectedRelations.size === 1,
  };
}

export type GeometryFrontBackClassification = 'RELATIONAL_REASONING_SIGNAL_POSITIVE' | 'RELATIONAL_REASONING_SIGNAL_NEUTRAL' | 'RELATIONAL_REASONING_SIGNAL_NEGATIVE' | 'RELATIONAL_EXPERIMENT_INCONCLUSIVE';

export function classifyGeometryFrontBackComparison(input: {
  direct: readonly GeometryFrontBackEvaluation[];
  reasoned: readonly GeometryFrontBackEvaluation[];
}): GeometryFrontBackClassification {
  const direct = summarizeGeometryFrontBackEvaluations(input.direct);
  const reasoned = summarizeGeometryFrontBackEvaluations(input.reasoned);
  if (direct.protocolFailures > 0 || reasoned.protocolFailures > 0) return 'RELATIONAL_EXPERIMENT_INCONCLUSIVE';
  if (reasoned.correct > direct.correct && reasoned.incorrect <= direct.incorrect) return 'RELATIONAL_REASONING_SIGNAL_POSITIVE';
  if (reasoned.correct < direct.correct || reasoned.incorrect > direct.incorrect) return 'RELATIONAL_REASONING_SIGNAL_NEGATIVE';
  return 'RELATIONAL_REASONING_SIGNAL_NEUTRAL';
}
