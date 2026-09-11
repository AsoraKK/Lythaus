import {
  type Applicability,
  type CameraEvidenceLevel,
  type EvidenceFamily,
  type ForensicFeatureBundle,
  type ImageDimensions,
  type JsonValue,
  type SyntheticEvidenceLevel,
} from './contracts.ts';
import { type ModerationAnalysis } from './moderation.ts';
import { type VisionObservation, type VisionObserverResult, assertVisionObservation, VISION_OBSERVER_PROTOCOL_VERSION } from './vision-observer.ts';

export const EVIDENCE_PACKET_SCHEMA_VERSION = 'lythaus-evidence-packet-v1' as const;
export const SAFETY_CONTEXT_ROLE = 'SAFETY_CONTEXT_ONLY' as const;

export const EVIDENCE_QUALITY_STATUSES = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE', 'INDETERMINATE', 'FAILED', 'CONTRADICTORY'] as const;
export type EvidenceQualityStatus = (typeof EVIDENCE_QUALITY_STATUSES)[number];

export interface EvidenceProvenance {
  evidenceFamily: EvidenceFamily | 'SAFETY_CONTEXT';
  sourceComponent: string;
  provider: string | null;
  modelVersion: string | null;
  schemaVersion: string;
  executionTimestamp: string;
  inputHash: string;
  applicable: Applicability;
  limitations: readonly string[];
}

export interface PacketEvidence {
  evidenceId: string;
  family: EvidenceFamily;
  kind: 'MEASUREMENT';
  name: string;
  value: JsonValue;
  quality: EvidenceQualityStatus;
  provenance: EvidenceProvenance;
}

export interface EvidenceFamilySummary {
  family: EvidenceFamily;
  status: EvidenceQualityStatus;
  evidenceIds: readonly string[];
  limitations: readonly string[];
}

export interface SafetyContext {
  role: typeof SAFETY_CONTEXT_ROLE;
  contextId: string;
  provider: string | null;
  model: string | null;
  canonicalResult: 'ALLOW' | 'REVIEW' | 'BLOCK' | 'PROVIDER_FAILURE' | 'NOT_RUN';
  providerEvidence: ModerationAnalysis['providerEvidence'] | null;
  quality: EvidenceQualityStatus;
  limitations: readonly string[];
}

export interface TransformationState {
  operation: string;
  version: string | null;
  parameters: Record<string, JsonValue>;
  sourceFamilyId: string;
}

export interface EvidencePacket {
  schemaVersion: typeof EVIDENCE_PACKET_SCHEMA_VERSION;
  packetId: string;
  runId: string;
  caseId: string;
  sampleId: string;
  sourceFamilyId: string;
  inputHash: string;
  dimensions: ImageDimensions | null;
  mime: string;
  transformationState: TransformationState;
  executionTimestamp: string;
  schemaVersions: {
    packet: typeof EVIDENCE_PACKET_SCHEMA_VERSION;
    moderation: string | null;
    forensics: string | null;
    observer: typeof VISION_OBSERVER_PROTOCOL_VERSION | null;
    observerPrompt: string | null;
  };
  originAxes: {
    cameraEvidence: CameraEvidenceLevel;
    syntheticEvidence: SyntheticEvidenceLevel;
  };
  safetyContext: SafetyContext;
  evidenceFamilies: Readonly<Record<EvidenceFamily, EvidenceFamilySummary>>;
  evidence: readonly PacketEvidence[];
  observations: readonly VisionObservation[];
  observationHistory: readonly VisionObservation[];
  quality: {
    overall: EvidenceQualityStatus;
    missingEvidenceFamilies: readonly EvidenceFamily[];
    failedComponents: readonly string[];
    contradictoryEvidenceIds: readonly string[];
    contradictoryObservationIds: readonly string[];
    limitations: readonly string[];
  };
  enforcementAuthority: false;
}

export interface PacketPreflight {
  inputHash: string;
  mime: string;
  dimensions: ImageDimensions | null;
  executionTimestamp?: string;
}

export interface BuildEvidencePacketInput {
  runId: string;
  caseId: string;
  sampleId: string;
  sourceFamilyId: string;
  preflight: PacketPreflight;
  forensicBundle?: ForensicFeatureBundle | null;
  moderation?: ModerationAnalysis | null;
  observer?: VisionObserverResult | null;
  transformationState?: Partial<TransformationState> & Pick<TransformationState, 'sourceFamilyId'>;
  failedComponents?: readonly string[];
  contradictoryEvidenceIds?: readonly string[];
  contradictoryObservationIds?: readonly string[];
  observationHistory?: readonly VisionObservation[];
  now?: string;
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function sanitizedFileProvenance(forensic: ForensicFeatureBundle['fileProvenance']): ForensicFeatureBundle['fileProvenance'] {
  return {
    ...forensic,
    encoderInformation: forensic.encoderInformation ? 'PRESENT_REDACTED' : null,
  };
}

function familySummary(family: EvidenceFamily, status: EvidenceQualityStatus, evidenceIds: readonly string[], limitations: readonly string[]): EvidenceFamilySummary {
  return { family, status, evidenceIds, limitations };
}

function provenance(input: {
  family: EvidenceFamily;
  sourceComponent: string;
  provider?: string | null;
  modelVersion?: string | null;
  schemaVersion: string;
  timestamp: string;
  inputHash: string;
  applicable: Applicability;
  limitations: readonly string[];
}): EvidenceProvenance {
  return {
    evidenceFamily: input.family,
    sourceComponent: input.sourceComponent,
    provider: input.provider ?? null,
    modelVersion: input.modelVersion ?? null,
    schemaVersion: input.schemaVersion,
    executionTimestamp: input.timestamp,
    inputHash: input.inputHash,
    applicable: input.applicable,
    limitations: input.limitations,
  };
}

function deterministicEvidence(input: {
  evidenceId: string;
  family: EvidenceFamily;
  name: string;
  value: unknown;
  quality: EvidenceQualityStatus;
  sourceComponent: string;
  modelVersion: string;
  schemaVersion: string;
  timestamp: string;
  inputHash: string;
  applicable: Applicability;
  limitations: readonly string[];
}): PacketEvidence {
  return {
    evidenceId: input.evidenceId,
    family: input.family,
    kind: 'MEASUREMENT',
    name: input.name,
    value: asJson(input.value),
    quality: input.quality,
    provenance: provenance(input),
  };
}

function familyOrder(): readonly EvidenceFamily[] {
  return [
    'EF1_FILE_PROVENANCE',
    'EF2_PHYSICAL_ACQUISITION',
    'EF3_GENERATIVE_FORENSICS',
    'EF4_SPECTRAL_STABILITY',
    'EF5_RECONSTRUCTION_LOCAL_MANIPULATION',
  ];
}

export function buildEvidencePacket(input: BuildEvidencePacketInput): EvidencePacket {
  const timestamp = input.now ?? input.preflight.executionTimestamp ?? new Date().toISOString();
  const packetId = `${input.runId}:${input.sampleId}`;
  const evidence: PacketEvidence[] = [];
  const summaries = new Map<EvidenceFamily, EvidenceFamilySummary>();
  const forensic = input.forensicBundle ?? null;
  if (forensic) {
    const common = {
      sourceComponent: 'lythaus-deterministic-forensics',
      modelVersion: forensic.featureVersion,
      schemaVersion: forensic.audit.evidenceSchemaVersion,
      timestamp: forensic.audit.timestamp,
      inputHash: input.preflight.inputHash,
    };
    const ef1Id = `${forensic.id}:EF1`;
    evidence.push(deterministicEvidence({
      ...common,
      evidenceId: ef1Id,
      family: 'EF1_FILE_PROVENANCE',
      name: 'file_provenance_measurements',
      value: sanitizedFileProvenance(forensic.fileProvenance),
      quality: 'AVAILABLE',
      applicable: 'applicable',
      limitations: ['Metadata presence or absence is not proof of camera or synthetic origin.'],
    }));
    summaries.set('EF1_FILE_PROVENANCE', familySummary('EF1_FILE_PROVENANCE', 'AVAILABLE', [ef1Id], ['Metadata is descriptive and not ground truth.']));

    const ef2Quality: EvidenceQualityStatus = forensic.physicalAcquisition.cameraEvidenceApplicability === 'applicable'
      ? 'AVAILABLE'
      : forensic.physicalAcquisition.cameraEvidenceApplicability === 'invalid' ? 'FAILED' : 'UNAVAILABLE';
    const ef2Id = `${forensic.id}:EF2`;
    evidence.push(deterministicEvidence({
      ...common,
      evidenceId: ef2Id,
      family: 'EF2_PHYSICAL_ACQUISITION',
      name: 'physical_acquisition_measurements',
      value: forensic.physicalAcquisition,
      quality: ef2Quality,
      applicable: forensic.physicalAcquisition.cameraEvidenceApplicability,
      limitations: ['Camera acquisition and depicted-content origin are independent axes.', 'Experimental proxies require calibration.'],
    }));
    summaries.set('EF2_PHYSICAL_ACQUISITION', familySummary('EF2_PHYSICAL_ACQUISITION', ef2Quality, [ef2Id], ['Decoded pixels or sensor evidence may be unavailable.']));

    const ef4Quality: EvidenceQualityStatus = forensic.audit.applicability === 'applicable'
      ? 'AVAILABLE'
      : forensic.audit.applicability === 'invalid' ? 'FAILED' : 'UNAVAILABLE';
    const ef4Id = `${forensic.id}:EF4`;
    evidence.push(deterministicEvidence({
      ...common,
      evidenceId: ef4Id,
      family: 'EF4_SPECTRAL_STABILITY',
      name: 'spectral_transformation_measurements',
      value: { spectralStability: forensic.spectralStability, featureVectorLength: forensic.featureVector.length, imagePyramid: forensic.imagePyramid },
      quality: ef4Quality,
      applicable: forensic.audit.applicability,
      limitations: [
        'Experimental spectral/residual measurements are evidence, not a calibrated detector score.',
        ...(ef4Quality === 'UNAVAILABLE' ? ['Decoded pixels were unavailable; pixel-domain EF4 measurements were not run.'] : []),
      ],
    }));
    summaries.set('EF4_SPECTRAL_STABILITY', familySummary('EF4_SPECTRAL_STABILITY', ef4Quality, [ef4Id], ['No interpretation is upgraded beyond the deterministic extractor contract.']));
  } else {
    summaries.set('EF1_FILE_PROVENANCE', familySummary('EF1_FILE_PROVENANCE', 'UNAVAILABLE', [], ['Deterministic forensics was not run.']));
    summaries.set('EF2_PHYSICAL_ACQUISITION', familySummary('EF2_PHYSICAL_ACQUISITION', 'UNAVAILABLE', [], ['Deterministic forensics was not run.']));
    summaries.set('EF4_SPECTRAL_STABILITY', familySummary('EF4_SPECTRAL_STABILITY', 'UNAVAILABLE', [], ['Deterministic forensics was not run.']));
  }
  summaries.set('EF3_GENERATIVE_FORENSICS', familySummary('EF3_GENERATIVE_FORENSICS', 'UNAVAILABLE', [], ['No EF3 generative-forensics extractor is implemented in Research V1.']));
  summaries.set('EF5_RECONSTRUCTION_LOCAL_MANIPULATION', familySummary('EF5_RECONSTRUCTION_LOCAL_MANIPULATION', 'UNAVAILABLE', [], ['No EF5 reconstruction/local-manipulation extractor is implemented in Research V1.']));

  const observer = input.observer ?? null;
  const observations = observer?.observations ?? [];
  const observationHistory = [...(input.observationHistory ?? [])];
  const safetyAnalysis = input.moderation ?? null;
  const providerEvidence = safetyAnalysis?.providerEvidence ?? null;
  const safetyQuality: EvidenceQualityStatus = safetyAnalysis === null
    ? 'UNAVAILABLE'
    : safetyAnalysis.result === 'PROVIDER_FAILURE' ? 'FAILED' : 'AVAILABLE';
  const safetyContext: SafetyContext = {
    role: SAFETY_CONTEXT_ROLE,
    contextId: `${packetId}:SAFETY`,
    provider: safetyAnalysis?.provider ?? null,
    model: safetyAnalysis?.modelVersion ?? null,
    canonicalResult: safetyAnalysis?.result ?? 'NOT_RUN',
    providerEvidence,
    quality: safetyQuality,
    limitations: [
      'Safety moderation is context only and cannot populate synthetic-origin evidence.',
      'Provider scores are uncalibrated signals; unsupported image categories must not be treated as safe.',
    ],
  };
  const failedComponents = [...(input.failedComponents ?? [])];
  if (safetyQuality === 'FAILED') failedComponents.push('moderation');
  if (observer?.status === 'PROVIDER_FAILURE') failedComponents.push('vision-observer');
  const missingEvidenceFamilies = familyOrder().filter((family) => summaries.get(family)?.status === 'UNAVAILABLE');
  const overall: EvidenceQualityStatus = failedComponents.length > 0
    ? 'FAILED'
    : (input.contradictoryEvidenceIds && input.contradictoryEvidenceIds.length > 0) || (input.contradictoryObservationIds && input.contradictoryObservationIds.length > 0)
      ? 'CONTRADICTORY'
      : missingEvidenceFamilies.length > 0 ? 'PARTIAL' : 'AVAILABLE';
  const cameraEvidence = forensic?.physicalAcquisition.cameraOrigin ?? 'CAMERA_ORIGIN_UNCERTAIN';
  const syntheticEvidence = forensic?.generativeForensics.syntheticEvidence ?? 'NO_POSITIVE_SYNTHETIC_EVIDENCE';
  const transformationState: TransformationState = {
    operation: input.transformationState?.operation ?? 'ORIGINAL',
    version: input.transformationState?.version ?? null,
    parameters: input.transformationState?.parameters ?? {},
    sourceFamilyId: input.transformationState?.sourceFamilyId ?? input.sourceFamilyId,
  };
  const packet: EvidencePacket = {
    schemaVersion: EVIDENCE_PACKET_SCHEMA_VERSION,
    packetId,
    runId: input.runId,
    caseId: input.caseId,
    sampleId: input.sampleId,
    sourceFamilyId: input.sourceFamilyId,
    inputHash: input.preflight.inputHash,
    dimensions: input.preflight.dimensions,
    mime: input.preflight.mime,
    transformationState,
    executionTimestamp: timestamp,
    schemaVersions: {
      packet: EVIDENCE_PACKET_SCHEMA_VERSION,
      moderation: providerEvidence?.schemaVersion ?? null,
      forensics: forensic?.featureVersion ?? null,
      observer: observer?.protocolVersion ?? observationHistory[0]?.protocolVersion ?? null,
      observerPrompt: observer?.promptVersion ?? null,
    },
    originAxes: { cameraEvidence, syntheticEvidence },
    safetyContext,
    evidenceFamilies: Object.fromEntries(familyOrder().map((family) => [family, summaries.get(family)])) as Record<EvidenceFamily, EvidenceFamilySummary>,
    evidence,
    observations,
    observationHistory,
    quality: {
      overall,
      missingEvidenceFamilies,
      failedComponents: [...new Set(failedComponents)],
      contradictoryEvidenceIds: [...(input.contradictoryEvidenceIds ?? [])],
      contradictoryObservationIds: [...(input.contradictoryObservationIds ?? [])],
      limitations: [
        'Research V1 preserves measurements and observations without collapsing them into a synthetic probability.',
        'The packet contains no ground truth and grants no enforcement authority.',
      ],
    },
    enforcementAuthority: false,
  };
  assertEvidencePacket(packet);
  return packet;
}

export function packetReferenceIds(packet: EvidencePacket): ReadonlySet<string> {
  return new Set([...packet.evidence.map((item) => item.evidenceId), ...packet.observations.map((item) => item.observationId), ...packet.observationHistory.map((item) => item.observationId)]);
}

export function assertEvidenceReferenceIds(packet: EvidencePacket, ids: readonly string[]): void {
  const available = packetReferenceIds(packet);
  for (const id of ids) if (!available.has(id)) throw new Error(`judge_evidence_reference_unknown:${id}`);
}

export function assertEvidencePacket(packet: EvidencePacket): void {
  if (packet.schemaVersion !== EVIDENCE_PACKET_SCHEMA_VERSION) throw new Error('evidence_packet_schema_invalid');
  if (packet.enforcementAuthority !== false) throw new Error('evidence_packet_enforcement_authority_invalid');
  if (packet.safetyContext.role !== SAFETY_CONTEXT_ROLE) throw new Error('evidence_packet_safety_role_invalid');
  if (!(EVIDENCE_QUALITY_STATUSES as readonly string[]).includes(packet.quality.overall)) throw new Error('evidence_packet_quality_invalid');
  if (!(EVIDENCE_QUALITY_STATUSES as readonly string[]).includes(packet.safetyContext.quality)) throw new Error('evidence_packet_safety_quality_invalid');
  for (const forbidden of ['groundTruth', 'truth', 'aiProbability', 'humanProbability', 'authenticityVerdict']) {
    if (Object.prototype.hasOwnProperty.call(packet, forbidden)) throw new Error(`evidence_packet_forbidden_field:${forbidden}`);
  }
  const evidenceIds = new Set<string>();
  for (const item of packet.evidence) {
    if (evidenceIds.has(item.evidenceId)) throw new Error('evidence_packet_duplicate_evidence_id');
    evidenceIds.add(item.evidenceId);
    if (item.kind !== 'MEASUREMENT') throw new Error('evidence_packet_measurement_kind_invalid');
    if (!(EVIDENCE_QUALITY_STATUSES as readonly string[]).includes(item.quality)) throw new Error('evidence_packet_evidence_quality_invalid');
    if (item.provenance.evidenceFamily !== item.family) throw new Error('evidence_packet_provenance_family_mismatch');
    if (item.family === 'EF3_GENERATIVE_FORENSICS' && /moderation|safety|openai/i.test(item.provenance.sourceComponent)) throw new Error('safety_cannot_be_synthetic_evidence');
  }
  const observationIds = new Set<string>();
  for (const observation of [...packet.observationHistory, ...packet.observations]) {
    if (observationIds.has(observation.observationId) || evidenceIds.has(observation.observationId)) throw new Error('evidence_packet_duplicate_observation_id');
    observationIds.add(observation.observationId);
    assertVisionObservation(observation);
    if (observation.provenance.inputHash !== packet.inputHash) throw new Error('evidence_packet_observation_input_mismatch');
    if (observation.provenance.provider !== observation.provider || observation.provenance.modelVersion !== observation.model) throw new Error('evidence_packet_observation_provenance_mismatch');
  }
  for (const family of familyOrder()) {
    const summary = packet.evidenceFamilies[family];
    if (!summary || summary.family !== family) throw new Error(`evidence_packet_family_missing:${family}`);
    if (!(EVIDENCE_QUALITY_STATUSES as readonly string[]).includes(summary.status)) throw new Error('evidence_packet_family_quality_invalid');
    assertEvidenceReferenceIds(packet, summary.evidenceIds);
  }
}

export function assertSafetyIsolation(packet: EvidencePacket): void {
  assertEvidencePacket(packet);
  if (packet.evidence.some((item) => item.provenance.evidenceFamily === 'SAFETY_CONTEXT')) throw new Error('safety_context_must_be_separate');
  if (packet.evidenceFamilies.EF3_GENERATIVE_FORENSICS.evidenceIds.some((id) => packet.safetyContext.contextId === id)) throw new Error('safety_context_cannot_populate_ef3');
}
