import { assertEvidencePacket, assertSafetyIsolation, type EvidencePacket, type PacketEvidence } from './evidence-packet.ts';
import type { EvidenceFamily, JsonValue } from './contracts.ts';
import { assertJudgeRecommendation, createInsufficientEvidenceRecommendation, ORIGIN_HYPOTHESES, type JudgeRecommendation, type OriginHypothesis } from './judge.ts';
import { buildEvidenceDirectionPolicy, JUDGE_EPISTEMIC_POLICY_VERSION, type EvidenceDirectionClassification, type EpistemicDirection } from './judge-epistemic-evaluator.ts';
import { selectResolutionRoute } from './resolution-gate.ts';
export const WP005A_LEDGER_SCHEMA_VERSION = 'lythaus-evidence-ledger-v1' as const;
export const WP005A_ROUTING_POLICY_VERSION = 'lythaus-wp005a-routing-policy-v1' as const;

const FORBIDDEN_RESEARCH_INPUT_KEYS = new Set([
  'groundTruth', 'truth', 'expectedPrimary', 'caseExpectation', 'expectedUncertainty', 'passCriteria', 'benchmarkDirectionLabels',
  'rawReasoning', 'reasoningTrace', 'chainOfThought', 'thinking', 'imageBytes', 'base64',
]);

export function assertNoForbiddenResearchInput(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) assertNoForbiddenResearchInput(item); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESEARCH_INPUT_KEYS.has(key)) throw new Error(`wp005a_forbidden_input_field:${key}`);
    assertNoForbiddenResearchInput(child);
  }
}

export type EvidenceLedgerValidationStatus = 'NONDISCRIMINATIVE' | 'UNCALIBRATED' | 'CALIBRATED_DIRECTIONAL';

export interface EvidenceLedgerEntry {
  evidenceId: string;
  family: EvidenceFamily | 'VISION_OBSERVATION';
  summary: string;
  applicability: string;
  quality: string;
  validationStatus: EvidenceLedgerValidationStatus;
  directionalRole: EpistemicDirection;
  supportedHypotheses: readonly OriginHypothesis[];
  contradictedHypotheses: readonly OriginHypothesis[];
  limitations: readonly string[];
}

export interface EvidenceLedgerObservation {
  observationId: string;
  category: string;
  status: string;
  summary: string;
  directionalRole: 'NEUTRAL';
  limitations: readonly string[];
}

export interface EvidenceLedger {
  schemaVersion: typeof WP005A_LEDGER_SCHEMA_VERSION;
  policyVersion: typeof JUDGE_EPISTEMIC_POLICY_VERSION;
  packetId: string;
  quality: {
    overall: string;
    missingEvidenceFamilies: readonly string[];
    contradictoryEvidenceIds: readonly string[];
    contradictoryObservationIds: readonly string[];
  };
  independentOriginAxes: {
    cameraEvidence: string;
    syntheticEvidence: string;
    relationship: 'INDEPENDENT_AXES';
  };
  safetyContext: {
    role: 'SAFETY_CONTEXT_ONLY';
    canonicalResult: string;
    excludedFromOriginInference: true;
  };
  evidence: readonly EvidenceLedgerEntry[];
  observations: readonly EvidenceLedgerObservation[];
  missingEvidence: readonly { family: string; status: string; limitations: readonly string[] }[];
  enforcementAuthority: false;
}

export function isEvidenceLedger(value: EvidencePacket | EvidenceLedger): value is EvidenceLedger {
  return Boolean(value && typeof value === 'object' && (value as { schemaVersion?: unknown }).schemaVersion === WP005A_LEDGER_SCHEMA_VERSION);
}

function valueSummary(value: JsonValue): string {
  let serialized = '';
  try { serialized = JSON.stringify(value); } catch { serialized = '[unserializable]'; }
  return serialized.length > 360 ? `${serialized.slice(0, 357)}...` : serialized;
}

function directionalRole(classification: EvidenceDirectionClassification): EpistemicDirection {
  const roles = Object.values(classification.directionByHypothesis);
  if (roles.includes('SUPPORTS')) return 'SUPPORTS';
  if (roles.includes('CONTRADICTS')) return 'CONTRADICTS';
  if (roles.includes('UNVALIDATED')) return 'UNVALIDATED';
  return 'NEUTRAL';
}

function ledgerEntry(item: PacketEvidence, classification: EvidenceDirectionClassification): EvidenceLedgerEntry {
  return {
    evidenceId: item.evidenceId,
    family: classification.family,
    summary: `${item.name}: ${valueSummary(item.value)}`,
    applicability: item.provenance.applicable,
    quality: item.quality,
    validationStatus: classification.calibrationStatus,
    directionalRole: directionalRole(classification),
    supportedHypotheses: ORIGIN_HYPOTHESES.filter((hypothesis) => classification.directionByHypothesis[hypothesis] === 'SUPPORTS'),
    contradictedHypotheses: ORIGIN_HYPOTHESES.filter((hypothesis) => classification.directionByHypothesis[hypothesis] === 'CONTRADICTS'),
    limitations: [...item.provenance.limitations],
  };
}

export function compileEpistemicLedger(packet: EvidencePacket): EvidenceLedger {
  assertEvidencePacket(packet);
  assertSafetyIsolation(packet);
  const policy = buildEvidenceDirectionPolicy(packet);
  const policyById = new Map(policy.map((item) => [item.evidenceId, item]));
  const evidence = packet.evidence.map((item) => ledgerEntry(item, policyById.get(item.evidenceId) as EvidenceDirectionClassification));
  const observations = [...packet.observations, ...packet.observationHistory]
    .filter((observation, index, all) => all.findIndex((candidate) => candidate.observationId === observation.observationId) === index)
    .map((observation) => ({
      observationId: observation.observationId,
      category: observation.category,
      status: observation.status,
      summary: observation.observation.slice(0, 360),
      directionalRole: 'NEUTRAL' as const,
      limitations: [...observation.limitations],
    }));
  const missingEvidence = Object.values(packet.evidenceFamilies)
    .filter((family) => ['UNAVAILABLE', 'FAILED', 'NOT_APPLICABLE', 'INDETERMINATE'].includes(family.status))
    .map((family) => ({ family: family.family, status: family.status, limitations: [...family.limitations] }));
  const ledger: EvidenceLedger = {
    schemaVersion: WP005A_LEDGER_SCHEMA_VERSION,
    policyVersion: JUDGE_EPISTEMIC_POLICY_VERSION,
    packetId: packet.packetId,
    quality: {
      overall: packet.quality.overall,
      missingEvidenceFamilies: [...packet.quality.missingEvidenceFamilies],
      contradictoryEvidenceIds: [...packet.quality.contradictoryEvidenceIds],
      contradictoryObservationIds: [...packet.quality.contradictoryObservationIds],
    },
    independentOriginAxes: { ...packet.originAxes, relationship: 'INDEPENDENT_AXES' },
    safetyContext: { role: 'SAFETY_CONTEXT_ONLY', canonicalResult: packet.safetyContext.canonicalResult, excludedFromOriginInference: true },
    evidence,
    observations,
    missingEvidence,
    enforcementAuthority: false,
  };
  assertEvidenceLedger(ledger);
  return ledger;
}

export function assertEvidenceLedger(ledger: EvidenceLedger): void {
  if (ledger.schemaVersion !== WP005A_LEDGER_SCHEMA_VERSION) throw new Error('wp005a_ledger_schema_invalid');
  if (ledger.policyVersion !== JUDGE_EPISTEMIC_POLICY_VERSION) throw new Error('wp005a_ledger_policy_invalid');
  if (ledger.enforcementAuthority !== false) throw new Error('wp005a_ledger_enforcement_authority_invalid');
  if (ledger.safetyContext.role !== 'SAFETY_CONTEXT_ONLY' || ledger.safetyContext.excludedFromOriginInference !== true) throw new Error('wp005a_ledger_safety_isolation_invalid');
  const ids = new Set<string>();
  for (const item of ledger.evidence) {
    if (ids.has(item.evidenceId)) throw new Error('wp005a_ledger_duplicate_evidence_id');
    ids.add(item.evidenceId);
  }
  for (const item of ledger.observations) {
    if (ids.has(item.observationId)) throw new Error('wp005a_ledger_duplicate_observation_id');
    ids.add(item.observationId);
  }
  assertNoForbiddenResearchInput(ledger);
}

export type Wp005aRoutingPolicy = 'CONSERVATIVE_GATE' | 'SELECTIVE_RESOLUTION_GATE';
export type Wp005aRoute = 'DETERMINISTIC' | 'ESCALATE';

export interface Wp005aRoutingResult {
  schemaVersion: typeof WP005A_ROUTING_POLICY_VERSION;
  policy: Wp005aRoutingPolicy;
  route: Wp005aRoute;
  deterministic: boolean;
  recommendation: JudgeRecommendation;
  directionalEvidenceIds: readonly string[];
  supportedHypotheses: readonly OriginHypothesis[];
  contradictedHypotheses: readonly OriginHypothesis[];
  reasonCodes: readonly string[];
}

function directionalEvidence(packet: EvidencePacket): {
  policy: readonly EvidenceDirectionClassification[];
  directionalIds: string[];
  supportedHypotheses: OriginHypothesis[];
  contradictedHypotheses: OriginHypothesis[];
} {
  const policy = buildEvidenceDirectionPolicy(packet);
  const directional = policy.filter((item) => Object.values(item.directionByHypothesis).some((direction) => direction === 'SUPPORTS' || direction === 'CONTRADICTS'));
  const supported = new Set<OriginHypothesis>();
  const contradicted = new Set<OriginHypothesis>();
  for (const item of directional) {
    for (const hypothesis of ORIGIN_HYPOTHESES) {
      if (item.directionByHypothesis[hypothesis] === 'SUPPORTS') supported.add(hypothesis);
      if (item.directionByHypothesis[hypothesis] === 'CONTRADICTS') contradicted.add(hypothesis);
    }
  }
  return { policy, directionalIds: directional.map((item) => item.evidenceId), supportedHypotheses: [...supported], contradictedHypotheses: [...contradicted] };
}

function boundedRecommendation(packet: EvidencePacket, hypothesis: OriginHypothesis, evidenceIds: readonly string[]): JudgeRecommendation {
  const recommendation: JudgeRecommendation = {
    schemaVersion: '1',
    primaryHypothesis: hypothesis,
    alternativeHypotheses: [],
    supportingEvidence: evidenceIds.map((evidenceId) => ({ evidenceId, rationale: 'The deterministic epistemic policy marks this evidence as calibrated directional support for the bounded research hypothesis.' })),
    contradictoryEvidence: [],
    missingEvidence: [],
    uncertainty: packet.quality.overall === 'AVAILABLE' ? 'MODERATE' : 'HIGH',
    requiresReview: packet.quality.overall !== 'AVAILABLE',
    recommendedAdditionalTests: [],
    rationale: 'A deterministic research gate found one calibrated supported hypothesis and no calibrated contradiction. This is advisory and not a product enforcement decision.',
    enforcementAuthority: false,
  };
  assertJudgeRecommendation(recommendation, packet);
  return recommendation;
}

export function applyWp005aRoutingGate(packet: EvidencePacket, policy: Wp005aRoutingPolicy): Wp005aRoutingResult {
  assertEvidencePacket(packet);
  const directions = directionalEvidence(packet);
  const resolution = selectResolutionRoute({ directionalEvidenceCount: directions.directionalIds.length, supportedHypothesesCount: directions.supportedHypotheses.length, contradictedHypothesesCount: directions.contradictedHypotheses.length, contradictoryEvidenceCount: packet.quality.contradictoryEvidenceIds.length, contradictoryObservationsCount: packet.quality.contradictoryObservationIds.length }, policy);
  if (resolution === 'ABSTAIN') {
    return {
      schemaVersion: WP005A_ROUTING_POLICY_VERSION, policy, route: 'DETERMINISTIC', deterministic: true,
      recommendation: createInsufficientEvidenceRecommendation('No validated directional evidence is available; the deterministic gate abstains.'),
      directionalEvidenceIds: [], supportedHypotheses: [], contradictedHypotheses: [], reasonCodes: ['NO_VALIDATED_DIRECTIONAL_EVIDENCE'],
    };
  }
  if (resolution === 'BOUNDED') {
    const hypothesis = directions.supportedHypotheses[0];
    return {
      schemaVersion: WP005A_ROUTING_POLICY_VERSION, policy, route: 'DETERMINISTIC', deterministic: true,
      recommendation: boundedRecommendation(packet, hypothesis, directions.policy.filter((item) => item.directionByHypothesis[hypothesis] === 'SUPPORTS').map((item) => item.evidenceId)),
      directionalEvidenceIds: directions.directionalIds, supportedHypotheses: directions.supportedHypotheses, contradictedHypotheses: directions.contradictedHypotheses,
      reasonCodes: ['ONE_CALIBRATED_SUPPORTED_HYPOTHESIS', 'NO_CALIBRATED_CONTRADICTION'],
    };
  }
  return {
    schemaVersion: WP005A_ROUTING_POLICY_VERSION, policy, route: 'ESCALATE', deterministic: false,
    recommendation: createInsufficientEvidenceRecommendation(policy === 'CONSERVATIVE_GATE' ? 'Validated directional evidence is present; the conservative gate escalates it to an advisory reasoner.' : 'Evidence is mixed or supports multiple hypotheses; the selective gate escalates it.'),
    directionalEvidenceIds: directions.directionalIds, supportedHypotheses: directions.supportedHypotheses, contradictedHypotheses: directions.contradictedHypotheses,
    reasonCodes: policy === 'CONSERVATIVE_GATE' ? ['VALIDATED_DIRECTIONAL_EVIDENCE_REQUIRES_ESCALATION'] : ['MULTIPLE_OR_CONFLICTING_HYPOTHESES'],
  };
}
