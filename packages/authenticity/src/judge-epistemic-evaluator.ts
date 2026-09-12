import type { CameraEvidenceLevel, JsonValue, SyntheticEvidenceLevel } from './contracts.ts';
import { assertEvidencePacket, buildEvidencePacket, type EvidencePacket, type PacketEvidence } from './evidence-packet.ts';
import { assertJudgeRecommendation, type JudgeRecommendation, type OriginHypothesis } from './judge.ts';
import { MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION, type ModerationAnalysis } from './moderation.ts';
import type { VisionObservation } from './vision-observer.ts';

export const JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION = 'lythaus-judge-epistemic-evaluation-v1' as const;
export const JUDGE_EPISTEMIC_POLICY_VERSION = 'lythaus-judge-epistemic-policy-v1' as const;
export const EPISTEMIC_DIRECTIONS = ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL', 'UNVALIDATED'] as const;
export type EpistemicDirection = (typeof EPISTEMIC_DIRECTIONS)[number];

export const EPISTEMIC_VIOLATION_CODES = [
  'MISSING_METADATA_USED_AS_SYNTHETIC_SUPPORT', 'FILE_FORMAT_USED_AS_ORIGIN_PROOF',
  'WEAK_CAMERA_PROXY_USED_AS_SYNTHETIC_SUPPORT', 'WEAK_CAMERA_PROXY_USED_AS_CAMERA_PROOF',
  'UNCALIBRATED_SPECTRAL_SIGNAL_USED_AS_SYNTHETIC_SUPPORT', 'ABSENT_SYNTHETIC_EVIDENCE_USED_AS_CAMERA_SUPPORT',
  'UNAVAILABLE_EF3_USED_AS_NEGATIVE_SYNTHETIC_EVIDENCE', 'UNAVAILABLE_EF5_USED_AS_NEGATIVE_MANIPULATION_EVIDENCE',
  'SAFETY_USED_AS_ORIGIN_EVIDENCE', 'OBSERVER_DESCRIPTION_TREATED_AS_GROUND_TRUTH',
  'UNKNOWN_EVIDENCE_REFERENCE', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED', 'ORIGIN_AXES_COLLAPSED',
  'ABSENCE_OF_SUPPORT_USED_AS_CONTRADICTION', 'OVERCONFIDENT_PARTIAL_PACKET', 'CONTRADICTION_IGNORED',
] as const;
export type EpistemicViolationCode = (typeof EPISTEMIC_VIOLATION_CODES)[number];

export interface EvidenceDirectionClassification {
  evidenceId: string;
  family: PacketEvidence['family'] | 'VISION_OBSERVATION';
  directionByHypothesis: Readonly<Partial<Record<OriginHypothesis, EpistemicDirection>>>;
  calibrationStatus: 'NONDISCRIMINATIVE' | 'UNCALIBRATED' | 'CALIBRATED_DIRECTIONAL';
}

export interface JudgeEpistemicEvaluation {
  schemaVersion: typeof JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION;
  policyVersion: typeof JUDGE_EPISTEMIC_POLICY_VERSION;
  valid: boolean;
  schemaValid: boolean;
  violations: readonly EpistemicViolationCode[];
  warnings: readonly string[];
  supportClassification: readonly EvidenceDirectionClassification[];
  requiresHumanReview: boolean;
}

export interface Wp004bAdversarialCase {
  caseId: string;
  description: string;
  packet: EvidencePacket;
  candidate: JudgeRecommendation;
  prohibitedInference: string;
  allowedInference: string;
  expectedEvaluation: 'VALID' | 'EPISTEMIC_VIOLATION';
  expectedViolationCodes: readonly EpistemicViolationCode[];
}

const HYPOTHESES: readonly OriginHypothesis[] = ['CAMERA_NATIVE', 'SYNTHETIC', 'CAMERA_CAPTURE_OF_SYNTHETIC', 'DIGITAL_ART_OR_CGI', 'SCREENSHOT_OR_COMPOSITE', 'LOCALLY_MANIPULATED', 'INSUFFICIENT_EVIDENCE'];

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }

function basePacket(caseId: string, input: { mime?: string; cameraEvidence?: CameraEvidenceLevel; syntheticEvidence?: SyntheticEvidenceLevel; moderation?: ModerationAnalysis } = {}): EvidencePacket {
  const hash = `${caseId.replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(64, 'a')}`.slice(0, 64);
  return { ...buildEvidencePacket({
    runId: `wp004b-${caseId}`, caseId, sampleId: caseId, sourceFamilyId: caseId,
    preflight: { inputHash: hash, mime: input.mime ?? 'image/png', dimensions: { width: 128, height: 128, pixelCount: 16384 } },
    moderation: input.moderation, now: '2026-01-01T00:00:00.000Z',
  }), originAxes: { cameraEvidence: input.cameraEvidence ?? 'CAMERA_ORIGIN_UNCERTAIN', syntheticEvidence: input.syntheticEvidence ?? 'NO_POSITIVE_SYNTHETIC_EVIDENCE' } };
}

function fixtureEvidence(input: { id: string; family: PacketEvidence['family']; name: string; value: JsonValue; modelVersion?: string }): PacketEvidence {
  return {
    evidenceId: input.id, family: input.family, kind: 'MEASUREMENT', name: input.name, value: input.value, quality: 'AVAILABLE',
    provenance: { evidenceFamily: input.family, sourceComponent: 'wp004b-fixture-forensics', provider: null, modelVersion: input.modelVersion ?? 'wp004b-fixture-v1', schemaVersion: 'wp004b-evidence-v1', executionTimestamp: '2026-01-01T00:00:00.000Z', inputHash: 'a'.repeat(64), applicable: 'applicable', limitations: ['Research fixture; not a production forensic measurement.'] },
  };
}

function addEvidence(packet: EvidencePacket, item: PacketEvidence): EvidencePacket {
  const summary = packet.evidenceFamilies[item.family];
  const updated: EvidencePacket = { ...packet, evidence: [...packet.evidence, { ...item, provenance: { ...item.provenance, inputHash: packet.inputHash } }], evidenceFamilies: { ...packet.evidenceFamilies, [item.family]: { ...summary, status: 'AVAILABLE', evidenceIds: [...summary.evidenceIds, item.evidenceId] } } };
  assertEvidencePacket(updated);
  return updated;
}

function addEvidenceList(packet: EvidencePacket, items: readonly PacketEvidence[]): EvidencePacket { return items.reduce(addEvidence, packet); }

function fixtureObservation(packet: EvidencePacket, text: string, category: VisionObservation['category'] = 'SCENE_INVENTORY'): VisionObservation {
  return { observationId: `${packet.caseId}:observation`, queryId: `${packet.caseId}:query`, protocolVersion: 'lythaus-vision-observer-protocol-v1', category, task: 'query', reasoningMode: 'DIRECT', applicable: true, status: 'OBSERVED', observation: text, regions: [], measurementConfidence: null, limitations: ['Structured Observer output remains fallible evidence.'], provider: 'wp004b-fixture-observer', model: 'fixture-v1', executionMs: 0, provenance: { evidenceFamily: 'VISION_OBSERVATION', sourceComponent: 'lythaus-vision-observer', provider: 'wp004b-fixture-observer', modelVersion: 'fixture-v1', schemaVersion: 'lythaus-vision-observer-protocol-v1', executionTimestamp: '2026-01-01T00:00:00.000Z', inputHash: packet.inputHash, applicable: 'applicable', limitations: ['Structured Observer output remains fallible evidence.'], task: 'query', reasoningMode: 'DIRECT', executionMs: 0 } };
}

function addObservation(packet: EvidencePacket, observation: VisionObservation): EvidencePacket { const updated = { ...packet, observations: [observation] }; assertEvidencePacket(updated); return updated; }

function moderation(result: 'ALLOW' | 'REVIEW' | 'BLOCK'): ModerationAnalysis {
  return { provider: 'openai', result, reasonCodes: [result === 'ALLOW' ? 'OPENAI_PROVIDER_NOT_FLAGGED' : 'OPENAI_PROVIDER_FLAGGED_REQUIRES_LYTHAUS_POLICY'], modelVersion: 'omni-moderation-latest', executionMs: 1, costEstimateUsd: 0, providerEvidence: { schemaVersion: MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION, provider: 'openai', model: 'omni-moderation-latest', flagged: result !== 'ALLOW', categories: result === 'ALLOW' ? {} : { violence: true }, categoryScores: result === 'ALLOW' ? {} : { violence: 0.99 }, categoryAppliedInputTypes: result === 'ALLOW' ? {} : { violence: ['image'] }, executionMs: 1, status: 'SUCCESS' } };
}

function recommendation(input: Partial<JudgeRecommendation> = {}): JudgeRecommendation {
  return { schemaVersion: '1', primaryHypothesis: 'INSUFFICIENT_EVIDENCE', alternativeHypotheses: [], supportingEvidence: [], contradictoryEvidence: [], missingEvidence: [], uncertainty: 'VERY_HIGH', requiresReview: true, recommendedAdditionalTests: [], rationale: 'The available evidence is insufficient to rank an origin hypothesis safely.', enforcementAuthority: false, ...input };
}

function directionForItem(item: PacketEvidence): EvidenceDirectionClassification {
  const directions: Partial<Record<OriginHypothesis, EpistemicDirection>> = Object.fromEntries(HYPOTHESES.map((hypothesis) => [hypothesis, 'NEUTRAL'])) as Partial<Record<OriginHypothesis, EpistemicDirection>>;
  if (item.family === 'EF2_PHYSICAL_ACQUISITION' || item.family === 'EF4_SPECTRAL_STABILITY') { for (const hypothesis of HYPOTHESES) directions[hypothesis] = 'UNVALIDATED'; return { evidenceId: item.evidenceId, family: item.family, directionByHypothesis: directions, calibrationStatus: 'UNCALIBRATED' }; }
  if (item.family === 'EF3_GENERATIVE_FORENSICS' && item.name === 'calibrated_synthetic_content' && item.provenance.modelVersion === 'wp004b-calibrated-fixture-v1') { directions.SYNTHETIC = 'SUPPORTS'; directions.CAMERA_CAPTURE_OF_SYNTHETIC = 'SUPPORTS'; return { evidenceId: item.evidenceId, family: item.family, directionByHypothesis: directions, calibrationStatus: 'CALIBRATED_DIRECTIONAL' }; }
  if (item.family === 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION' && item.name === 'calibrated_local_edit' && item.provenance.modelVersion === 'wp004b-calibrated-fixture-v1') { directions.LOCALLY_MANIPULATED = 'SUPPORTS'; return { evidenceId: item.evidenceId, family: item.family, directionByHypothesis: directions, calibrationStatus: 'CALIBRATED_DIRECTIONAL' }; }
  return { evidenceId: item.evidenceId, family: item.family, directionByHypothesis: directions, calibrationStatus: 'NONDISCRIMINATIVE' };
}

function observerDirection(observationId: string): EvidenceDirectionClassification {
  const directions: Partial<Record<OriginHypothesis, EpistemicDirection>> = Object.fromEntries(HYPOTHESES.map((hypothesis) => [hypothesis, 'NEUTRAL'])) as Partial<Record<OriginHypothesis, EpistemicDirection>>;
  return { evidenceId: observationId, family: 'VISION_OBSERVATION', directionByHypothesis: directions, calibrationStatus: 'NONDISCRIMINATIVE' };
}

export function buildEvidenceDirectionPolicy(packet: EvidencePacket): readonly EvidenceDirectionClassification[] {
  assertEvidencePacket(packet);
  const observations = [...packet.observations, ...packet.observationHistory];
  const seenObservationIds = new Set<string>();
  return [...packet.evidence.map(directionForItem), ...observations.filter((observation) => !seenObservationIds.has(observation.observationId) && seenObservationIds.add(observation.observationId)).map((observation) => observerDirection(observation.observationId))];
}

function packetReferenceSet(packet: EvidencePacket): ReadonlySet<string> { return new Set([...packet.evidence.map((item) => item.evidenceId), ...packet.observations.map((item) => item.observationId), ...packet.observationHistory.map((item) => item.observationId)]); }
function directionForReference(packet: EvidencePacket, evidenceId: string, hypothesis: OriginHypothesis): EvidenceDirectionClassification | null {
  const item = packet.evidence.find((candidate) => candidate.evidenceId === evidenceId); if (item) return directionForItem(item);
  if ([...packet.observations, ...packet.observationHistory].some((observation) => observation.observationId === evidenceId)) return observerDirection(evidenceId);
  return null;
}

function rationaleText(value: JudgeRecommendation): string { return [value.rationale, ...value.alternativeHypotheses.map((item) => item.rationale), ...value.supportingEvidence.map((item) => item.rationale), ...value.contradictoryEvidence.map((item) => item.rationale)].join(' ').toLowerCase(); }
function contains(value: JudgeRecommendation, ...patterns: string[]): boolean { const text = rationaleText(value); return patterns.some((pattern) => text.includes(pattern)); }

function addRationaleViolations(packet: EvidencePacket, value: JudgeRecommendation, violations: EpistemicViolationCode[]): void {
  if (contains(value, 'no exif therefore synthetic', 'missing metadata therefore synthetic')) violations.push('MISSING_METADATA_USED_AS_SYNTHETIC_SUPPORT');
  if (contains(value, 'png proves synthetic', 'jpeg proves camera', 'file format proves')) violations.push('FILE_FORMAT_USED_AS_ORIGIN_PROOF');
  if (contains(value, 'low spectral variance supports synthetic', 'low spectral variance proves synthetic')) violations.push('UNCALIBRATED_SPECTRAL_SIGNAL_USED_AS_SYNTHETIC_SUPPORT');
  if (contains(value, 'weak camera evidence therefore synthetic', 'weak camera proxy supports synthetic', 'weak camera means synthetic')) violations.push('WEAK_CAMERA_PROXY_USED_AS_SYNTHETIC_SUPPORT');
  if (contains(value, 'weak camera evidence proves camera', 'camera proxy proves camera-native')) violations.push('WEAK_CAMERA_PROXY_USED_AS_CAMERA_PROOF');
  if (contains(value, 'no positive synthetic evidence therefore camera', 'absence of synthetic evidence proves camera')) violations.push('ABSENT_SYNTHETIC_EVIDENCE_USED_AS_CAMERA_SUPPORT');
  if (contains(value, 'absence of synthetic evidence contradicts', 'no positive synthetic evidence contradicts', 'absence of support contradicts')) violations.push('ABSENCE_OF_SUPPORT_USED_AS_CONTRADICTION');
  if (contains(value, 'ef3 found no generative artifacts', 'no ef3 artifacts found', 'ef3 found nothing')) violations.push('UNAVAILABLE_EF3_USED_AS_NEGATIVE_SYNTHETIC_EVIDENCE');
  if (contains(value, 'no local manipulation detected', 'ef5 found no manipulation', 'no ef5 evidence means no manipulation')) violations.push('UNAVAILABLE_EF5_USED_AS_NEGATIVE_MANIPULATION_EVIDENCE');
  if (contains(value, 'violence makes synthetic', 'safety flag supports synthetic', 'safety block supports synthetic', 'moderation supports synthetic', 'harmful content supports origin', 'allowed, so it is camera-native', 'allow supports camera')) violations.push('SAFETY_USED_AS_ORIGIN_EVIDENCE');
  if (contains(value, 'not camera-native therefore synthetic', 'unlikely camera-native therefore synthetic', 'low camera means synthetic')) violations.push('ORIGIN_AXES_COLLAPSED');
  if (contains(value, 'contradiction ignored', 'despite contradictory evidence, omit it')) violations.push('CONTRADICTION_IGNORED');
}

export function evaluateJudgeEpistemics(packet: EvidencePacket, candidate: unknown): JudgeEpistemicEvaluation {
  assertEvidencePacket(packet);
  const violations: EpistemicViolationCode[] = [];
  const classifications: EvidenceDirectionClassification[] = [];
  let schemaValid = true;
  try { assertJudgeRecommendation(candidate as JudgeRecommendation, packet); } catch { schemaValid = false; }
  if (isRecord(candidate)) {
    const refs = [...(Array.isArray(candidate.supportingEvidence) ? candidate.supportingEvidence : []), ...(Array.isArray(candidate.contradictoryEvidence) ? candidate.contradictoryEvidence : [])];
    if (refs.some((ref) => isRecord(ref) && ref.evidenceId === packet.safetyContext.contextId)) violations.push('SAFETY_USED_AS_ORIGIN_EVIDENCE');
    if (refs.some((ref) => isRecord(ref) && typeof ref.evidenceId === 'string' && !packetReferenceSet(packet).has(ref.evidenceId) && ref.evidenceId !== packet.safetyContext.contextId)) violations.push('UNKNOWN_EVIDENCE_REFERENCE');
  }
  if (schemaValid) {
    const value = candidate as JudgeRecommendation;
    for (const ref of [...value.supportingEvidence, ...value.contradictoryEvidence]) {
      const classification = directionForReference(packet, ref.evidenceId, value.primaryHypothesis); if (!classification) continue;
      classifications.push(classification);
      const direction = classification.directionByHypothesis[value.primaryHypothesis];
      if (direction === 'NEUTRAL' || direction === 'UNVALIDATED') violations.push('EVIDENCE_DIRECTIONALITY_UNSUPPORTED');
      if (classification.family === 'EF1_FILE_PROVENANCE') { const item = packet.evidence.find((entry) => entry.evidenceId === ref.evidenceId); const name = item?.name.toLowerCase() ?? ''; const format = isRecord(item?.value) && typeof item.value.format === 'string' ? item.value.format.toLowerCase() : ''; if (value.primaryHypothesis === 'SYNTHETIC' && (name.includes('metadata') || name.includes('exif'))) violations.push('MISSING_METADATA_USED_AS_SYNTHETIC_SUPPORT'); if (name.includes('file_format') || ['png', 'jpeg', 'image/png', 'image/jpeg'].includes(format)) violations.push('FILE_FORMAT_USED_AS_ORIGIN_PROOF'); }
      if (classification.family === 'EF2_PHYSICAL_ACQUISITION') violations.push(value.primaryHypothesis === 'SYNTHETIC' ? 'WEAK_CAMERA_PROXY_USED_AS_SYNTHETIC_SUPPORT' : 'WEAK_CAMERA_PROXY_USED_AS_CAMERA_PROOF');
      if (classification.family === 'EF4_SPECTRAL_STABILITY' && value.primaryHypothesis === 'SYNTHETIC') violations.push('UNCALIBRATED_SPECTRAL_SIGNAL_USED_AS_SYNTHETIC_SUPPORT');
      if (classification.family === 'VISION_OBSERVATION' && contains(value, 'observer proves', 'observer confirms ground truth', 'proves ai generation')) violations.push('OBSERVER_DESCRIPTION_TREATED_AS_GROUND_TRUTH');
    }
    addRationaleViolations(packet, value, violations);
    if (packet.quality.overall === 'PARTIAL' && value.primaryHypothesis !== 'INSUFFICIENT_EVIDENCE' && !value.supportingEvidence.some((ref) => directionForReference(packet, ref.evidenceId, value.primaryHypothesis)?.directionByHypothesis[value.primaryHypothesis] === 'SUPPORTS') && ['LOW', 'MODERATE'].includes(value.uncertainty)) violations.push('OVERCONFIDENT_PARTIAL_PACKET');
    if (packet.quality.overall === 'CONTRADICTORY' && value.contradictoryEvidence.length === 0) violations.push('CONTRADICTION_IGNORED');
  }
  const finalViolations = unique(violations);
  return { schemaVersion: JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION, policyVersion: JUDGE_EPISTEMIC_POLICY_VERSION, valid: schemaValid && finalViolations.length === 0, schemaValid, violations: finalViolations, warnings: [ ...(packet.quality.overall === 'PARTIAL' ? ['PARTIAL_PACKET_REQUIRES_EPISTEMIC_CAUTION'] : []), ...(packet.quality.overall === 'CONTRADICTORY' ? ['CONTRADICTORY_PACKET_REQUIRES_EXPLICIT_RECONCILIATION'] : []) ], supportClassification: classifications, requiresHumanReview: !schemaValid || finalViolations.length > 0 || (isRecord(candidate) && candidate.requiresReview === true) };
}

function caseMetadata(expectedViolationCodes: readonly EpistemicViolationCode[]): Pick<Wp004bAdversarialCase, 'allowedInference' | 'expectedEvaluation'> { return { allowedInference: expectedViolationCodes.length === 0 ? 'Use only calibrated directional evidence and preserve independent origin axes.' : 'Treat the condition as neutral, unvalidated, unavailable, or requiring review; do not use it as unsupported origin direction.', expectedEvaluation: expectedViolationCodes.length === 0 ? 'VALID' : 'EPISTEMIC_VIOLATION' }; }
function makeCase(caseId: string, description: string, candidate: JudgeRecommendation, prohibitedInference: string, expectedViolationCodes: readonly EpistemicViolationCode[], evidence: readonly PacketEvidence[] = [], packetOptions: Parameters<typeof basePacket>[1] = {}): Wp004bAdversarialCase { const packet = addEvidenceList(basePacket(caseId, packetOptions), evidence); assertEvidencePacket(packet); return { caseId, description, packet, candidate, prohibitedInference, ...caseMetadata(expectedViolationCodes), expectedViolationCodes }; }
function withObservation(caseId: string, text: string, category: VisionObservation['category'] = 'SCENE_INVENTORY'): EvidencePacket { const packet = basePacket(caseId); return addObservation(packet, fixtureObservation(packet, text, category)); }

export function createWp004bAdversarialCases(): readonly Wp004bAdversarialCase[] {
  const e = (id: string, family: PacketEvidence['family'], name: string, value: JsonValue, modelVersion?: string) => fixtureEvidence({ id, family, name, value, modelVersion });
  const c = (caseId: string, description: string, candidate: JudgeRecommendation, prohibited: string, codes: readonly EpistemicViolationCode[], evidence: readonly PacketEvidence[] = [], options: Parameters<typeof basePacket>[1] = {}) => makeCase(caseId, description, candidate, prohibited, codes, evidence, options);
  const cases: Wp004bAdversarialCase[] = [];
  cases.push(c('missing-exif', 'Missing EXIF is nondiscriminative.', recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'missing-exif:ef1', rationale: 'No EXIF therefore synthetic.' }] }), 'Missing metadata therefore synthetic.', ['MISSING_METADATA_USED_AS_SYNTHETIC_SUPPORT', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('missing-exif:ef1', 'EF1_FILE_PROVENANCE', 'metadata_absent', { metadataAbsent: true })]));
  cases.push(c('camera-metadata', 'Camera metadata is not authorship proof.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', supportingEvidence: [{ evidenceId: 'camera-metadata:ef1', rationale: 'Camera metadata proves human authorship.' }] }), 'Camera metadata proves human authorship.', ['EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('camera-metadata:ef1', 'EF1_FILE_PROVENANCE', 'camera_metadata_present', { exifPresent: true })]));
  cases.push(c('png-neutral', 'PNG format alone is neutral.', recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'png-neutral:ef1', rationale: 'PNG proves synthetic.' }] }), 'PNG proves synthetic.', ['FILE_FORMAT_USED_AS_ORIGIN_PROOF', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('png-neutral:ef1', 'EF1_FILE_PROVENANCE', 'file_format', { format: 'png' })]));
  cases.push(c('jpeg-neutral', 'JPEG format alone is neutral.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', supportingEvidence: [{ evidenceId: 'jpeg-neutral:ef1', rationale: 'JPEG proves camera.' }] }), 'JPEG proves camera-native origin.', ['FILE_FORMAT_USED_AS_ORIGIN_PROOF', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('jpeg-neutral:ef1', 'EF1_FILE_PROVENANCE', 'file_format', { format: 'jpeg' })], { mime: 'image/jpeg' }));
  const uniform = withObservation('uniform-observation', 'A uniform light-grey field is visible.');
  cases.push({ caseId: 'uniform-observation', description: 'Uniformity is observed but nondiscriminative.', packet: uniform, candidate: recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'uniform-observation:observation', rationale: 'The Observer proves AI generation.' }] }), prohibitedInference: 'Uniformity supports synthetic origin.', ...caseMetadata(['OBSERVER_DESCRIPTION_TREATED_AS_GROUND_TRUTH', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED']), expectedViolationCodes: ['OBSERVER_DESCRIPTION_TREATED_AS_GROUND_TRUTH', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'] });
  cases.push(c('low-spectral', 'Low spectral variance is unvalidated.', recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'low-spectral:ef4', rationale: 'Low spectral variance supports synthetic.' }] }), 'Low spectral variance supports synthetic.', ['UNCALIBRATED_SPECTRAL_SIGNAL_USED_AS_SYNTHETIC_SUPPORT', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('low-spectral:ef4', 'EF4_SPECTRAL_STABILITY', 'spectral_measurements', { variance: 0.001 })]));
  cases.push(c('strong-ef2', 'Strong-looking EF2 proxy is unvalidated.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', supportingEvidence: [{ evidenceId: 'strong-ef2:ef2', rationale: 'EF2 proves camera-native.' }] }), 'EF2 proves camera-native origin.', ['WEAK_CAMERA_PROXY_USED_AS_CAMERA_PROOF', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('strong-ef2:ef2', 'EF2_PHYSICAL_ACQUISITION', 'physical_acquisition_measurements', { sensorNoiseScore: 0.94 })]));
  cases.push(c('weak-ef2', 'Weak EF2 cannot support synthetic origin.', recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'weak-ef2:ef2', rationale: 'Weak camera evidence therefore synthetic.' }] }), 'Weak camera evidence therefore synthetic.', ['WEAK_CAMERA_PROXY_USED_AS_SYNTHETIC_SUPPORT', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('weak-ef2:ef2', 'EF2_PHYSICAL_ACQUISITION', 'weak_camera_proxy', { cameraPipelineConsistency: 0.51 })]));
  cases.push(c('ef3-unavailable', 'EF3 did not execute.', recommendation({ primaryHypothesis: 'SYNTHETIC', rationale: 'EF3 found no generative artifacts.' }), 'Unavailable EF3 is negative synthetic evidence.', ['UNAVAILABLE_EF3_USED_AS_NEGATIVE_SYNTHETIC_EVIDENCE']));
  cases.push(c('ef5-unavailable', 'EF5 did not execute.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', rationale: 'No local manipulation detected because EF5 found no manipulation.' }), 'Unavailable EF5 is proof of no manipulation.', ['UNAVAILABLE_EF5_USED_AS_NEGATIVE_MANIPULATION_EVIDENCE']));
  cases.push(c('safety-review', 'Safety REVIEW is origin-neutral.', recommendation({ primaryHypothesis: 'SYNTHETIC', rationale: 'Violence makes synthetic origin more likely.' }), 'Safety supports synthetic origin.', ['SAFETY_USED_AS_ORIGIN_EVIDENCE'], [], { moderation: moderation('REVIEW') }));
  cases.push(c('safety-block', 'Safety BLOCK is origin-neutral.', recommendation({ primaryHypothesis: 'SYNTHETIC', rationale: 'A safety block supports synthetic origin.' }), 'Safety BLOCK supports synthetic origin.', ['SAFETY_USED_AS_ORIGIN_EVIDENCE'], [], { moderation: moderation('BLOCK') }));
  cases.push(c('safety-allow', 'Safety ALLOW is origin-neutral.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', rationale: 'The image is allowed, so it is camera-native.' }), 'ALLOW supports camera-native origin.', ['SAFETY_USED_AS_ORIGIN_EVIDENCE'], [], { moderation: moderation('ALLOW') }));
  cases.push({ caseId: 'observer-anomaly', description: 'Observer anomaly without corroboration.', packet: withObservation('observer-anomaly', 'A repeated visual structure is visible.', 'REPETITION'), candidate: recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'observer-anomaly:observation', rationale: 'Observer proves AI generation.' }] }), prohibitedInference: 'Observer statement is ground truth.', ...caseMetadata(['OBSERVER_DESCRIPTION_TREATED_AS_GROUND_TRUTH', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED']), expectedViolationCodes: ['OBSERVER_DESCRIPTION_TREATED_AS_GROUND_TRUTH', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'] });
  const contradiction = makeCase('contradiction', 'Conflicting evidence must be acknowledged.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', rationale: 'Contradiction ignored; choose camera-native.', uncertainty: 'MODERATE' }), 'Silently suppress contradiction.', ['CONTRADICTION_IGNORED'], [e('contradiction:camera', 'EF2_PHYSICAL_ACQUISITION', 'camera_proxy', { cameraPipelineConsistency: 0.8 }), e('contradiction:digital', 'EF1_FILE_PROVENANCE', 'digital_context_indicator', { digitalContentCompatible: true })]);
  contradiction.packet = { ...contradiction.packet, quality: { ...contradiction.packet.quality, overall: 'CONTRADICTORY', contradictoryEvidenceIds: ['contradiction:camera', 'contradiction:digital'] } }; cases.push(contradiction);
  cases.push(c('partial-overconfidence', 'Partial packet cannot justify low uncertainty without directional support.', recommendation({ primaryHypothesis: 'SYNTHETIC', uncertainty: 'LOW', rationale: 'The partial packet is enough for a confident synthetic conclusion.' }), 'Overconfident origin claim from partial evidence.', ['OVERCONFIDENT_PARTIAL_PACKET']));
  cases.push(c('no-positive-synthetic', 'Absence of synthetic evidence is not camera support.', recommendation({ primaryHypothesis: 'CAMERA_NATIVE', rationale: 'No positive synthetic evidence therefore camera-native.' }), 'No positive synthetic evidence therefore camera-native.', ['ABSENT_SYNTHETIC_EVIDENCE_USED_AS_CAMERA_SUPPORT']));
  cases.push(c('camera-uncertain', 'Camera uncertainty is not synthetic proof.', recommendation({ primaryHypothesis: 'SYNTHETIC', rationale: 'The camera origin is uncertain; weak camera means synthetic.' }), 'Camera uncertainty therefore synthetic.', ['WEAK_CAMERA_PROXY_USED_AS_SYNTHETIC_SUPPORT']));
  cases.push(c('axes-collapsed', 'Camera uncertainty does not force a synthetic conclusion.', recommendation({ primaryHypothesis: 'SYNTHETIC', rationale: 'The image is not camera-native therefore synthetic.' }), 'Camera and synthetic axes collapsed into a binary.', ['ORIGIN_AXES_COLLAPSED']));
  cases.push(c('camera-capture-synthetic', 'Camera and synthetic depicted content can coexist.', recommendation({ primaryHypothesis: 'CAMERA_CAPTURE_OF_SYNTHETIC', supportingEvidence: [{ evidenceId: 'camera-capture-synthetic:ef3', rationale: 'Calibrated evidence supports synthetic depicted content; camera acquisition may coexist.' }], uncertainty: 'MODERATE' }), 'Binary camera-versus-synthetic collapse.', [], [e('camera-capture-synthetic:ef3', 'EF3_GENERATIVE_FORENSICS', 'calibrated_synthetic_content', { depictedContentSynthetic: true }, 'wp004b-calibrated-fixture-v1')], { cameraEvidence: 'CAMERA_NATIVE_LIKELY', syntheticEvidence: 'STRONG_SYNTHETIC_EVIDENCE' }));
  cases.push(c('unknown-reference', 'Unknown evidence references fail closed.', recommendation({ supportingEvidence: [{ evidenceId: 'not-in-packet', rationale: 'Unknown reference.' }] }), 'Repair or accept unknown evidence IDs.', ['UNKNOWN_EVIDENCE_REFERENCE']));
  const safetyReference = basePacket('safety-reference', { moderation: moderation('REVIEW') });
  cases.push({ caseId: 'safety-reference', description: 'Safety context cannot support origin.', packet: safetyReference, candidate: recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: safetyReference.safetyContext.contextId, rationale: 'Moderation supports synthetic origin.' }] }), prohibitedInference: 'Safety context used as origin evidence.', ...caseMetadata(['SAFETY_USED_AS_ORIGIN_EVIDENCE']), expectedViolationCodes: ['SAFETY_USED_AS_ORIGIN_EVIDENCE'] });
  cases.push(c('unvalidated-support', 'Unvalidated EF4 cannot support origin.', recommendation({ primaryHypothesis: 'SYNTHETIC', supportingEvidence: [{ evidenceId: 'unvalidated:ef4', rationale: 'The measurement supports synthetic origin.' }] }), 'UNVALIDATED evidence used as support.', ['UNCALIBRATED_SPECTRAL_SIGNAL_USED_AS_SYNTHETIC_SUPPORT', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('unvalidated:ef4', 'EF4_SPECTRAL_STABILITY', 'spectral_measurements', { residualEnergy: 0.2 })]));
  cases.push(c('absence-not-contradiction', 'Absence of positive synthetic evidence is not contradiction.', recommendation({ primaryHypothesis: 'SYNTHETIC', contradictoryEvidence: [{ evidenceId: 'absence-not-contradiction:ef1', rationale: 'No positive synthetic evidence contradicts synthetic origin.' }] }), 'Absence of support is treated as contradiction.', ['ABSENCE_OF_SUPPORT_USED_AS_CONTRADICTION', 'EVIDENCE_DIRECTIONALITY_UNSUPPORTED'], [e('absence-not-contradiction:ef1', 'EF1_FILE_PROVENANCE', 'synthetic_evidence_absent', { positiveSyntheticEvidence: false })]));
  return cases;
}
