import type { VisionObservation } from './vision-observer.ts';

export const GEOMETRY_OCCLUSION_TRUTH_SCHEMA_VERSION = 'lythaus-wp004a-geometry-occlusion-truth-v1' as const;
export const GEOMETRY_OCCLUSION_FIXTURE_ID = 'WP004A_GEOMETRY_OCCLUSION_01' as const;
export const GEOMETRY_OCCLUSION_FIXTURE_VERSION = 'v1' as const;

export interface GeometryOcclusionTruth {
  fixtureId: typeof GEOMETRY_OCCLUSION_FIXTURE_ID;
  category: 'GEOMETRY_OCCLUSION';
  truth: {
    occlusionPresent: true;
    frontObject: 'BLUE_RECTANGLE';
    backObject: 'RED_RECTANGLE';
    geometryConsistent: true;
    indeterminateExpected: false;
    controlObject: {
      id: 'GREEN_CIRCLE';
      overlapsPrimaryObjects: false;
    };
  };
}

export type RelationalEvaluationValue = 'TRUE' | 'FALSE' | 'INDETERMINATE' | 'REQUIRES_REVIEW';

export interface GeometryOcclusionEvaluation {
  schemaVersion: typeof GEOMETRY_OCCLUSION_TRUTH_SCHEMA_VERSION;
  fixtureId: typeof GEOMETRY_OCCLUSION_FIXTURE_ID;
  fixtureVersion: typeof GEOMETRY_OCCLUSION_FIXTURE_VERSION;
  observationId: string | null;
  occlusionIdentified: RelationalEvaluationValue;
  frontBackCorrect: RelationalEvaluationValue;
  geometryConsistencyCorrect: RelationalEvaluationValue;
  controlObjectFalseRelation: RelationalEvaluationValue;
  unsupportedAssertionCount: number;
  originVerdictViolation: boolean;
  canonicalProtocolValid: boolean;
  indeterminate: boolean;
  requiresReview: boolean;
  reviewReasons: readonly string[];
}

const ORIGIN_ASSERTION_PATTERN = /\b(?:ai[- ]generated|human[- ]authored|synthetic|authenticity|image origin|origin class|camera origin|camera probability|synthetic probability|human probability)\b/i;
const RELATION_PATTERN = /\b(?:overlap(?:s|ped|ping)?|occlud(?:e|es|ed|ing)|cover(?:s|ed|ing)?|obscur(?:e|es|ed|ing)|in front of|behind|on top of)\b/i;
const PRIMARY_OBJECT_PATTERN = /\b(?:red|blue)\s+(?:rectangle|shape)\b/i;
const BLUE_FRONT_PATTERN = /\bblue\s+(?:rectangle|shape)\b[\s\S]{0,100}\b(?:in front of|on top of|cover(?:s|ed|ing)?|occlud(?:e|es|ed|ing))\b[\s\S]{0,100}\bred\s+(?:rectangle|shape)\b/i;
const RED_BEHIND_PATTERN = /\bred\s+(?:rectangle|shape)\b[\s\S]{0,100}\b(?:behind|occluded by|covered by|obscured by)\b[\s\S]{0,100}\bblue\s+(?:rectangle|shape)\b/i;
const RED_FRONT_PATTERN = /\bred\s+(?:rectangle|shape)\b[\s\S]{0,100}\b(?:in front of|on top of|cover(?:s|ed|ing)?|occlud(?:e|es|ed|ing)|obscur(?:e|es|ed|ing))\b[\s\S]{0,100}\bblue\s+(?:rectangle|shape)\b/i;
const BLUE_BEHIND_PATTERN = /\bblue\s+(?:rectangle|shape)\b[\s\S]{0,100}\b(?:behind|occluded by|covered by|obscured by)\b[\s\S]{0,100}\bred\s+(?:rectangle|shape)\b/i;
const NO_PRIMARY_OVERLAP_PATTERN = /\b(?:do not|does not|doesn't|no|without)\b[\s\S]{0,40}\b(?:overlap|occlud|intersect)\b/i;
const GEOMETRY_CONSISTENT_PATTERN = /\b(?:geometrically?\s+)?consistent\b|\bno\s+(?:geometric|geometry)\s+(?:contradiction|conflict|problem)\b|\bphysically\s+consistent\b/i;
const GEOMETRY_INCONSISTENT_PATTERN = /\b(?:geometrically?\s+)?inconsistent\b|\b(?:impossible|contradictory|conflicting)\s+(?:geometry|overlap|intersection)\b/i;
const GEOMETRY_NOT_CONSISTENT_PATTERN = /\b(?:not|isn't|is not)\s+(?:geometrically?\s+)?consistent\b/i;
const GREEN_FALSE_RELATION_PATTERN = /\bgreen\s+(?:circle|shape)\b[\s\S]{0,80}\b(?:overlap|occlud|intersect|cover|behind|in front of)\b|\b(?:overlap|occlud|intersect|cover|behind|in front of)\b[\s\S]{0,80}\bgreen\s+(?:circle|shape)\b/i;
const GREEN_SEPARATE_PATTERN = /\bgreen\s+(?:circle|shape)\b[\s\S]{0,80}\b(?:separate|does not overlap|doesn't overlap|not overlapping|no overlap)\b|\b(?:separate|does not overlap|doesn't overlap|not overlapping|no overlap)\b[\s\S]{0,80}\bgreen\s+(?:circle|shape)\b/i;

function countUnsupportedAssertions(text: string): number {
  return ORIGIN_ASSERTION_PATTERN.test(text) ? 1 : 0;
}

function evaluateOcclusion(text: string, status: VisionObservation['status'], expected: boolean): RelationalEvaluationValue {
  if (status === 'INDETERMINATE') return 'INDETERMINATE';
  if (status !== 'OBSERVED' && status !== 'NOT_OBSERVED') return 'REQUIRES_REVIEW';
  if (!PRIMARY_OBJECT_PATTERN.test(text)) return 'REQUIRES_REVIEW';
  const observed = !NO_PRIMARY_OVERLAP_PATTERN.test(text) && RELATION_PATTERN.test(text);
  return observed === expected ? 'TRUE' : 'FALSE';
}

function evaluateFrontBack(text: string, status: VisionObservation['status'], expectedFrontObject: 'BLUE_RECTANGLE' | 'RED_RECTANGLE'): RelationalEvaluationValue {
  if (status === 'INDETERMINATE') return 'INDETERMINATE';
  if (status !== 'OBSERVED') return status === 'NOT_OBSERVED' ? 'FALSE' : 'REQUIRES_REVIEW';
  const observedFrontObject = BLUE_FRONT_PATTERN.test(text) || RED_BEHIND_PATTERN.test(text)
    ? 'BLUE_RECTANGLE'
    : RED_FRONT_PATTERN.test(text) || BLUE_BEHIND_PATTERN.test(text)
      ? 'RED_RECTANGLE'
      : null;
  if (observedFrontObject === null) return 'REQUIRES_REVIEW';
  return observedFrontObject === expectedFrontObject ? 'TRUE' : 'FALSE';
}

function evaluateGeometry(text: string, status: VisionObservation['status'], expected: boolean): RelationalEvaluationValue {
  if (status === 'INDETERMINATE') return 'INDETERMINATE';
  if (status !== 'OBSERVED') return 'REQUIRES_REVIEW';
  if (GEOMETRY_INCONSISTENT_PATTERN.test(text) || GEOMETRY_NOT_CONSISTENT_PATTERN.test(text)) return expected === false ? 'TRUE' : 'FALSE';
  if (GEOMETRY_CONSISTENT_PATTERN.test(text)) return expected === true ? 'TRUE' : 'FALSE';
  return 'REQUIRES_REVIEW';
}

function evaluateControlObject(text: string): RelationalEvaluationValue {
  if (GREEN_SEPARATE_PATTERN.test(text) || !/\bgreen\s+(?:circle|shape)\b/i.test(text)) return 'TRUE';
  if (GREEN_FALSE_RELATION_PATTERN.test(text)) return 'FALSE';
  return 'REQUIRES_REVIEW';
}

function protocolValid(observation: VisionObservation): boolean {
  return observation.category === 'GEOMETRY_OCCLUSION'
    && observation.applicable === true
    && ['OBSERVED', 'NOT_OBSERVED', 'INDETERMINATE'].includes(observation.status)
    && observation.observation.trim().length > 0;
}

export function evaluateGeometryOcclusionObservation(input: { observation: VisionObservation | null; truth: GeometryOcclusionTruth }): GeometryOcclusionEvaluation {
  if (input.truth.fixtureId !== GEOMETRY_OCCLUSION_FIXTURE_ID || input.truth.category !== 'GEOMETRY_OCCLUSION') throw new Error('geometry_truth_fixture_invalid');
  const observation = input.observation;
  if (!observation) {
    return {
      schemaVersion: GEOMETRY_OCCLUSION_TRUTH_SCHEMA_VERSION,
      fixtureId: GEOMETRY_OCCLUSION_FIXTURE_ID,
      fixtureVersion: GEOMETRY_OCCLUSION_FIXTURE_VERSION,
      observationId: null,
      occlusionIdentified: 'REQUIRES_REVIEW',
      frontBackCorrect: 'REQUIRES_REVIEW',
      geometryConsistencyCorrect: 'REQUIRES_REVIEW',
      controlObjectFalseRelation: 'REQUIRES_REVIEW',
      unsupportedAssertionCount: 0,
      originVerdictViolation: false,
      canonicalProtocolValid: false,
      indeterminate: false,
      requiresReview: true,
      reviewReasons: ['OBSERVER_RESULT_UNAVAILABLE'],
    };
  }
  const text = observation.observation.trim();
  const canonicalProtocolValid = protocolValid(observation);
  const unsupportedAssertionCount = countUnsupportedAssertions(text);
  const originVerdictViolation = unsupportedAssertionCount > 0;
  const occlusionIdentified = evaluateOcclusion(text, observation.status, input.truth.truth.occlusionPresent);
  const frontBackCorrect = evaluateFrontBack(text, observation.status, input.truth.truth.frontObject);
  const geometryConsistencyCorrect = evaluateGeometry(text, observation.status, input.truth.truth.geometryConsistent);
  const controlObjectFalseRelation = evaluateControlObject(text);
  const reviewReasons = [
    ...(canonicalProtocolValid ? [] : ['CANONICAL_PROTOCOL_INVALID']),
    ...(occlusionIdentified === 'REQUIRES_REVIEW' ? ['OCCLUSION_WORDING_UNCLEAR'] : []),
    ...(frontBackCorrect === 'REQUIRES_REVIEW' ? ['FRONT_BACK_WORDING_UNCLEAR'] : []),
    ...(geometryConsistencyCorrect === 'REQUIRES_REVIEW' ? ['GEOMETRY_WORDING_UNCLEAR'] : []),
    ...(controlObjectFalseRelation === 'REQUIRES_REVIEW' ? ['CONTROL_OBJECT_RELATION_UNCLEAR'] : []),
  ];
  return {
    schemaVersion: GEOMETRY_OCCLUSION_TRUTH_SCHEMA_VERSION,
    fixtureId: GEOMETRY_OCCLUSION_FIXTURE_ID,
    fixtureVersion: GEOMETRY_OCCLUSION_FIXTURE_VERSION,
    observationId: observation.observationId,
    occlusionIdentified,
    frontBackCorrect,
    geometryConsistencyCorrect,
    controlObjectFalseRelation,
    unsupportedAssertionCount,
    originVerdictViolation,
    canonicalProtocolValid,
    indeterminate: observation.status === 'INDETERMINATE',
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

function qualityScore(evaluation: GeometryOcclusionEvaluation): number {
  return [evaluation.occlusionIdentified, evaluation.frontBackCorrect, evaluation.geometryConsistencyCorrect, evaluation.controlObjectFalseRelation]
    .filter((value) => value === 'TRUE').length;
}

export type RelationalResearchClassification = 'RELATIONAL_REASONING_SIGNAL_POSITIVE' | 'RELATIONAL_REASONING_SIGNAL_NEUTRAL' | 'RELATIONAL_REASONING_SIGNAL_NEGATIVE' | 'RELATIONAL_EXPERIMENT_INCONCLUSIVE';

export function classifyGeometryOcclusionComparison(input: { direct: GeometryOcclusionEvaluation; reasoned: GeometryOcclusionEvaluation }): RelationalResearchClassification {
  if (input.direct.requiresReview || input.reasoned.requiresReview || !input.direct.canonicalProtocolValid || !input.reasoned.canonicalProtocolValid) return 'RELATIONAL_EXPERIMENT_INCONCLUSIVE';
  const directScore = qualityScore(input.direct);
  const reasonedScore = qualityScore(input.reasoned);
  const reasonedAddedUnsupported = input.reasoned.unsupportedAssertionCount > input.direct.unsupportedAssertionCount || input.reasoned.originVerdictViolation;
  if (reasonedAddedUnsupported || reasonedScore < directScore) return 'RELATIONAL_REASONING_SIGNAL_NEGATIVE';
  if (reasonedScore > directScore) return 'RELATIONAL_REASONING_SIGNAL_POSITIVE';
  return 'RELATIONAL_REASONING_SIGNAL_NEUTRAL';
}
