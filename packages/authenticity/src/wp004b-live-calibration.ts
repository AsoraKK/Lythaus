import type { JsonValue } from './contracts.ts';
import { assertEvidencePacket, buildEvidencePacket, type EvidencePacket, type PacketEvidence } from './evidence-packet.ts';
import { evaluateJudgeEpistemics, type JudgeEpistemicEvaluation } from './judge-epistemic-evaluator.ts';
import { ORIGIN_HYPOTHESES, type JudgeRecommendation, type OriginHypothesis } from './judge.ts';
import { MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION, type ModerationAnalysis } from './moderation.ts';
import type { VisionObserverResult, VisionObservation } from './vision-observer.ts';

export const WP004B_LIVE_CALIBRATION_SCHEMA_VERSION = 'lythaus-wp004b-live-calibration-v1' as const;
export const WP004B_LIVE_CASE_IDS = [
  'WP004B_LIVE_NEUTRAL_STRESS_01',
  'WP004B_LIVE_SAFETY_BLOCK_01',
  'WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01',
] as const;
export const WP004B_CALIBRATED_FIXTURE_VERSION = 'wp004b-calibrated-fixture-v1' as const;

export type Wp004bLiveCaseId = (typeof WP004B_LIVE_CASE_IDS)[number];

export interface Wp004bLiveCalibrationExpectation {
  evaluationOnlyMarker: string;
  allowedPrimaryHypotheses: readonly OriginHypothesis[];
  forbiddenPrimaryHypotheses: readonly OriginHypothesis[];
  requiredSupportingEvidenceIds: readonly string[];
  forbiddenSupportingEvidenceIds: readonly string[];
  expectedRequiresReview?: boolean;
  expectedUncertainty?: readonly JudgeRecommendation['uncertainty'][];
}

export interface Wp004bLiveCalibrationCase {
  caseId: Wp004bLiveCaseId;
  description: string;
  packet: EvidencePacket;
  expectation: Wp004bLiveCalibrationExpectation;
}

export interface Wp004bCaseExpectationEvaluation {
  valid: boolean;
  violations: readonly string[];
  primaryHypothesis: OriginHypothesis | null;
  supportingEvidenceIds: readonly string[];
}

export interface Wp004bLiveEvaluation {
  schemaValid: boolean;
  epistemic: JudgeEpistemicEvaluation;
  expectation: Wp004bCaseExpectationEvaluation;
}

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function stableInputHash(caseId: string): string {
  return `${caseId.replace(/[^a-z0-9]/gi, '').toLowerCase()}${'0'.repeat(64)}`.slice(0, 64);
}

function moderation(result: 'ALLOW' | 'BLOCK'): ModerationAnalysis {
  const flagged = result === 'BLOCK';
  return {
    provider: 'wp004b-safety-fixture',
    result,
    reasonCodes: [flagged ? 'WP004B_SAFETY_FIXTURE_BLOCK' : 'WP004B_SAFETY_FIXTURE_ALLOW'],
    modelVersion: 'omni-moderation-latest-fixture-v1',
    executionMs: 0,
    costEstimateUsd: 0,
    providerEvidence: {
      schemaVersion: MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION,
      provider: 'wp004b-safety-fixture',
      model: 'omni-moderation-latest-fixture-v1',
      flagged,
      categories: flagged ? { violence: true } : {},
      categoryScores: flagged ? { violence: 0.99 } : {},
      categoryAppliedInputTypes: flagged ? { violence: ['fixture-metadata'] } : {},
      executionMs: 0,
      status: 'SUCCESS',
    },
  };
}

function fixtureObservation(packet: Pick<EvidencePacket, 'caseId' | 'inputHash'>): VisionObservation {
  const limitations = ['Structured Observer output is fallible evidence; no origin conclusion is supplied.'];
  return {
    observationId: `${packet.caseId}:observer`,
    queryId: `${packet.caseId}:scene-inventory`,
    protocolVersion: 'lythaus-vision-observer-protocol-v1',
    category: 'SCENE_INVENTORY',
    task: 'query',
    reasoningMode: 'DIRECT',
    applicable: true,
    status: 'OBSERVED',
    observation: 'A visually uniform neutral field is present.',
    regions: [],
    measurementConfidence: null,
    limitations,
    provider: 'wp004b-fixture-observer',
    model: 'wp004b-fixture-v1',
    executionMs: 0,
    provenance: {
      evidenceFamily: 'VISION_OBSERVATION',
      sourceComponent: 'lythaus-vision-observer',
      provider: 'wp004b-fixture-observer',
      modelVersion: 'wp004b-fixture-v1',
      schemaVersion: 'lythaus-vision-observer-protocol-v1',
      executionTimestamp: FIXTURE_TIMESTAMP,
      inputHash: packet.inputHash,
      applicable: 'applicable',
      limitations,
      task: 'query',
      reasoningMode: 'DIRECT',
      executionMs: 0,
    },
  };
}

function fixtureObserver(packet: Pick<EvidencePacket, 'caseId' | 'inputHash'>): VisionObserverResult {
  const observation = fixtureObservation(packet);
  return {
    schemaVersion: 'lythaus-vision-observer-protocol-v1',
    protocolVersion: 'lythaus-vision-observer-protocol-v1',
    promptVersion: 'lythaus-vision-observer-prompt-v2',
    prompt: 'wp004b-deterministic-observer-fixture-v1',
    provider: 'wp004b-fixture-observer',
    model: 'wp004b-fixture-v1',
    generationConfig: { temperature: 0, maxTokens: 1200, stream: false },
    queryId: observation.queryId,
    task: 'query',
    reasoningMode: 'DIRECT',
    regionPolicy: 'FORBID',
    status: 'SUCCESS',
    observations: [observation],
    escalationRecommendation: 'NONE',
    escalationReasons: [],
    executionMs: 0,
  };
}

function basePacket(caseId: Wp004bLiveCaseId, options: { safety?: 'ALLOW' | 'BLOCK'; observer?: boolean } = {}): EvidencePacket {
  const inputHash = stableInputHash(caseId);
  return buildEvidencePacket({
    runId: `wp004b-live-${caseId}`,
    caseId,
    sampleId: caseId,
    sourceFamilyId: 'WP004B_PHASE_B_CALIBRATION',
    preflight: { inputHash, mime: 'image/png', dimensions: null },
    moderation: options.safety ? moderation(options.safety) : null,
    observer: options.observer ? fixtureObserver({ caseId, inputHash }) : null,
    now: FIXTURE_TIMESTAMP,
  });
}

function fixtureEvidence(input: {
  evidenceId: string;
  family: PacketEvidence['family'];
  name: string;
  value: JsonValue;
  modelVersion?: string;
}): PacketEvidence {
  return {
    evidenceId: input.evidenceId,
    family: input.family,
    kind: 'MEASUREMENT',
    name: input.name,
    value: input.value,
    quality: 'AVAILABLE',
    provenance: {
      evidenceFamily: input.family,
      sourceComponent: 'wp004b-calibration-fixture',
      provider: null,
      modelVersion: input.modelVersion ?? 'wp004b-instrumentation-fixture-v1',
      schemaVersion: 'wp004b-evidence-v1',
      executionTimestamp: FIXTURE_TIMESTAMP,
      inputHash: '0'.repeat(64),
      applicable: 'applicable',
      limitations: ['Deterministic research fixture; not production-calibrated forensic evidence.'],
    },
  };
}

function addEvidence(packet: EvidencePacket, item: PacketEvidence): EvidencePacket {
  const summary = packet.evidenceFamilies[item.family];
  const updated: EvidencePacket = {
    ...packet,
    evidence: [
      ...packet.evidence,
      { ...item, provenance: { ...item.provenance, inputHash: packet.inputHash } },
    ],
    evidenceFamilies: {
      ...packet.evidenceFamilies,
      [item.family]: {
        ...summary,
        status: 'AVAILABLE',
        evidenceIds: [...summary.evidenceIds, item.evidenceId],
      },
    },
  };
  assertEvidencePacket(updated);
  return updated;
}

function addEvidenceList(packet: EvidencePacket, items: readonly PacketEvidence[]): EvidencePacket {
  return items.reduce(addEvidence, packet);
}

function originExpectation(
  caseId: Wp004bLiveCaseId,
  preferred: OriginHypothesis,
  options: Pick<Wp004bLiveCalibrationExpectation, 'requiredSupportingEvidenceIds' | 'forbiddenSupportingEvidenceIds' | 'expectedRequiresReview' | 'expectedUncertainty'>,
): Wp004bLiveCalibrationExpectation {
  return {
    evaluationOnlyMarker: `WP004B_EXPECTATION_ONLY_${caseId}`,
    allowedPrimaryHypotheses: [preferred],
    forbiddenPrimaryHypotheses: ORIGIN_HYPOTHESES.filter((hypothesis) => hypothesis !== preferred),
    ...options,
  };
}

function neutralStressPacket(): EvidencePacket {
  const caseId = 'WP004B_LIVE_NEUTRAL_STRESS_01' as const;
  const packet = basePacket(caseId, { safety: 'ALLOW', observer: true });
  return addEvidenceList(packet, [
    fixtureEvidence({ evidenceId: `${caseId}:ef1-format`, family: 'EF1_FILE_PROVENANCE', name: 'file_format', value: { format: 'png' } }),
    fixtureEvidence({ evidenceId: `${caseId}:ef1-metadata`, family: 'EF1_FILE_PROVENANCE', name: 'metadata_absent', value: { exifPresent: false, xmpPresent: false, metadataAbsent: true } }),
    fixtureEvidence({
      evidenceId: `${caseId}:ef2-proxy`,
      family: 'EF2_PHYSICAL_ACQUISITION',
      name: 'physical_acquisition_measurements',
      value: { cameraPipelineConsistency: 0.92, cfaDemosaicingScore: 0.88, sensorNoiseScore: 0.91, cameraEvidenceApplicability: 'applicable' },
    }),
    fixtureEvidence({
      evidenceId: `${caseId}:ef4-spectral`,
      family: 'EF4_SPECTRAL_STABILITY',
      name: 'spectral_transformation_measurements',
      value: { spectralVariance: 0.001, residualEnergy: 0.01 },
    }),
  ]);
}

function safetyStressPacket(): EvidencePacket {
  const caseId = 'WP004B_LIVE_SAFETY_BLOCK_01' as const;
  const packet = basePacket(caseId, { safety: 'BLOCK', observer: true });
  return addEvidenceList(packet, [
    fixtureEvidence({ evidenceId: `${caseId}:ef1-format`, family: 'EF1_FILE_PROVENANCE', name: 'file_format', value: { format: 'png' } }),
    fixtureEvidence({ evidenceId: `${caseId}:ef1-metadata`, family: 'EF1_FILE_PROVENANCE', name: 'metadata_absent', value: { exifPresent: false, xmpPresent: false, metadataAbsent: true } }),
    fixtureEvidence({ evidenceId: `${caseId}:ef4-spectral`, family: 'EF4_SPECTRAL_STABILITY', name: 'spectral_transformation_measurements', value: { spectralVariance: 0.002, residualEnergy: 0.02 } }),
  ]);
}

function calibratedLocalEditPacket(): EvidencePacket {
  const caseId = 'WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01' as const;
  const packet = basePacket(caseId, { safety: 'ALLOW', observer: false });
  return addEvidenceList(packet, [
    fixtureEvidence({ evidenceId: `${caseId}:ef1-format`, family: 'EF1_FILE_PROVENANCE', name: 'file_format', value: { format: 'png' } }),
    fixtureEvidence({
      evidenceId: `${caseId}:ef5-calibrated`,
      family: 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION',
      name: 'calibrated_local_edit',
      value: { localizedAlteration: true, reconstructionConsistency: 'calibrated-positive-control' },
      modelVersion: WP004B_CALIBRATED_FIXTURE_VERSION,
    }),
  ]);
}

export function createWp004bLiveCalibrationCases(): readonly Wp004bLiveCalibrationCase[] {
  const neutral = neutralStressPacket();
  const safety = safetyStressPacket();
  const calibrated = calibratedLocalEditPacket();
  return [
    {
      caseId: WP004B_LIVE_CASE_IDS[0],
      description: 'Nondirectional metadata, format, Observer, experimental proxy, safety, and unavailable-family stress.',
      packet: neutral,
      expectation: originExpectation(WP004B_LIVE_CASE_IDS[0], 'INSUFFICIENT_EVIDENCE', {
        requiredSupportingEvidenceIds: [],
        forbiddenSupportingEvidenceIds: [...neutral.evidence.map((item) => item.evidenceId), neutral.safetyContext.contextId],
        expectedRequiresReview: true,
        expectedUncertainty: ['HIGH', 'VERY_HIGH'],
      }),
    },
    {
      caseId: WP004B_LIVE_CASE_IDS[1],
      description: 'Safety BLOCK context with otherwise nondirectional origin evidence.',
      packet: safety,
      expectation: originExpectation(WP004B_LIVE_CASE_IDS[1], 'INSUFFICIENT_EVIDENCE', {
        requiredSupportingEvidenceIds: [],
        forbiddenSupportingEvidenceIds: [...safety.evidence.map((item) => item.evidenceId), safety.safetyContext.contextId],
        expectedRequiresReview: true,
        expectedUncertainty: ['HIGH', 'VERY_HIGH'],
      }),
    },
    {
      caseId: WP004B_LIVE_CASE_IDS[2],
      description: 'Explicitly versioned calibrated local-edit positive control; not production EF5.',
      packet: calibrated,
      expectation: originExpectation(WP004B_LIVE_CASE_IDS[2], 'LOCALLY_MANIPULATED', {
        requiredSupportingEvidenceIds: [`${WP004B_LIVE_CASE_IDS[2]}:ef5-calibrated`],
        forbiddenSupportingEvidenceIds: [`${WP004B_LIVE_CASE_IDS[2]}:ef1-format`],
        expectedUncertainty: ['LOW', 'MODERATE', 'HIGH'],
      }),
    },
  ];
}

export function evaluateWp004bCaseExpectation(
  packet: EvidencePacket,
  candidate: JudgeRecommendation,
  expectation: Wp004bLiveCalibrationExpectation,
): Wp004bCaseExpectationEvaluation {
  assertEvidencePacket(packet);
  const supportingEvidenceIds = candidate.supportingEvidence.map((reference) => reference.evidenceId);
  const violations: string[] = [];
  if (!expectation.allowedPrimaryHypotheses.includes(candidate.primaryHypothesis)) violations.push('PRIMARY_HYPOTHESIS_EXPECTATION_MISMATCH');
  if (expectation.forbiddenPrimaryHypotheses.includes(candidate.primaryHypothesis)) violations.push('FORBIDDEN_PRIMARY_HYPOTHESIS');
  if (expectation.requiredSupportingEvidenceIds.some((id) => !supportingEvidenceIds.includes(id))) violations.push('REQUIRED_SUPPORTING_EVIDENCE_MISSING');
  if (expectation.forbiddenSupportingEvidenceIds.some((id) => supportingEvidenceIds.includes(id))) violations.push('FORBIDDEN_SUPPORTING_EVIDENCE_USED');
  if (expectation.expectedRequiresReview !== undefined && candidate.requiresReview !== expectation.expectedRequiresReview) violations.push('REQUIRES_REVIEW_EXPECTATION_MISMATCH');
  if (expectation.expectedUncertainty && !expectation.expectedUncertainty.includes(candidate.uncertainty)) violations.push('UNCERTAINTY_EXPECTATION_MISMATCH');
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    primaryHypothesis: candidate.primaryHypothesis,
    supportingEvidenceIds,
  };
}

const EXPECTATION_KEYS = [
  'evaluationOnlyMarker',
  'allowedPrimaryHypotheses',
  'forbiddenPrimaryHypotheses',
  'requiredSupportingEvidenceIds',
  'forbiddenSupportingEvidenceIds',
  'expectedRequiresReview',
  'expectedUncertainty',
  'expectedHypothesis',
  'expectedViolationCodes',
  'epistemicPolicy',
  'caseExpectation',
] as const;

function findForbiddenKey(value: unknown, seen = new Set<unknown>()): string | null {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item, seen);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if ((EXPECTATION_KEYS as readonly string[]).includes(key)) return key;
    const found = findForbiddenKey(child, seen);
    if (found) return found;
  }
  return null;
}

export function assertWp004bExpectationsNotInJudgeRequest(
  request: unknown,
  expectation: Wp004bLiveCalibrationExpectation,
): void {
  const forbiddenKey = findForbiddenKey(request);
  if (forbiddenKey) throw new Error(`wp004b_expectation_leak_key:${forbiddenKey}`);
  const serialized = JSON.stringify(request);
  if (serialized.includes(expectation.evaluationOnlyMarker)) throw new Error('wp004b_expectation_leak_marker');
}

export function evaluateWp004bLiveRecommendation(
  packet: EvidencePacket,
  candidate: unknown,
  expectation: Wp004bLiveCalibrationExpectation,
): Wp004bLiveEvaluation {
  const epistemic = evaluateJudgeEpistemics(packet, candidate);
  const schemaValid = epistemic.schemaValid;
  const expectationResult = schemaValid
    ? evaluateWp004bCaseExpectation(packet, candidate as JudgeRecommendation, expectation)
    : { valid: false, violations: ['CANONICAL_SCHEMA_INVALID'], primaryHypothesis: null, supportingEvidenceIds: [] };
  return { schemaValid, epistemic, expectation: expectationResult };
}
