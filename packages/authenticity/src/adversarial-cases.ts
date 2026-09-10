import { MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION, type ModerationAnalysis } from './moderation.ts';
import { buildEvidencePacket, type EvidencePacket, type PacketEvidence } from './evidence-packet.ts';
import type { CameraEvidenceLevel, SyntheticEvidenceLevel } from './contracts.ts';
import type { OriginHypothesis } from './judge.ts';

export interface AdversarialEvidenceCase {
  caseId: string;
  description: string;
  expectedHypothesis: OriginHypothesis;
  packet: EvidencePacket;
}

function fixtureMeasurement(input: { id: string; family: PacketEvidence['family']; name: string; value: unknown; source?: string }): PacketEvidence {
  return {
    evidenceId: input.id,
    family: input.family,
    kind: 'MEASUREMENT',
    name: input.name,
    value: input.value as PacketEvidence['value'],
    quality: 'AVAILABLE',
    provenance: {
      evidenceFamily: input.family,
      sourceComponent: input.source ?? 'fixture-forensics',
      provider: null,
      modelVersion: 'fixture-v1',
      schemaVersion: 'fixture-evidence-v1',
      executionTimestamp: '2026-01-01T00:00:00.000Z',
      inputHash: 'a'.repeat(64),
      applicable: 'applicable',
      limitations: ['Mocked adversarial fixture; not a production measurement.'],
    },
  };
}

function addFixtureEvidence(packet: EvidencePacket, item: PacketEvidence): EvidencePacket {
  const family = packet.evidenceFamilies[item.family];
  const updated = {
    ...packet,
    evidence: [...packet.evidence, item],
    evidenceFamilies: {
      ...packet.evidenceFamilies,
      [item.family]: { ...family, status: 'AVAILABLE' as const, evidenceIds: [...family.evidenceIds, item.evidenceId] },
    },
  };
  return updated;
}

function basePacket(caseId: string, cameraEvidence: CameraEvidenceLevel, syntheticEvidence: SyntheticEvidenceLevel, moderation?: ModerationAnalysis): EvidencePacket {
  return buildEvidencePacket({
    runId: `fixture-${caseId}`,
    caseId,
    sampleId: caseId,
    sourceFamilyId: caseId,
    preflight: { inputHash: 'a'.repeat(64), mime: 'image/png', dimensions: { width: 64, height: 64, pixelCount: 4096 } },
    moderation,
    now: '2026-01-01T00:00:00.000Z',
  });
}

function withAxes(packet: EvidencePacket, cameraEvidence: CameraEvidenceLevel, syntheticEvidence: SyntheticEvidenceLevel): EvidencePacket {
  return { ...packet, originAxes: { cameraEvidence, syntheticEvidence } };
}

function harmfulCameraModeration(): ModerationAnalysis {
  return {
    provider: 'openai',
    result: 'REVIEW',
    reasonCodes: ['OPENAI_PROVIDER_FLAGGED_REQUIRES_LYTHAUS_POLICY'],
    modelVersion: 'omni-moderation-latest',
    executionMs: 1,
    costEstimateUsd: 0,
    providerEvidence: {
      schemaVersion: MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION,
      provider: 'openai',
      model: 'omni-moderation-latest',
      flagged: true,
      categories: { violence: true },
      categoryScores: { violence: 0.99 },
      categoryAppliedInputTypes: { violence: ['image'] },
      executionMs: 1,
      status: 'SUCCESS',
    },
  };
}

function finish(packet: EvidencePacket, contradictoryEvidenceIds: readonly string[] = []): EvidencePacket {
  const result = contradictoryEvidenceIds.length === 0
    ? packet
    : { ...packet, quality: { ...packet.quality, overall: 'CONTRADICTORY' as const, contradictoryEvidenceIds } };
  return result;
}

export function createWp004aAdversarialCases(): readonly AdversarialEvidenceCase[] {
  const camera = withAxes(basePacket('case-camera-native', 'CAMERA_NATIVE_LIKELY', 'NO_POSITIVE_SYNTHETIC_EVIDENCE'), 'CAMERA_NATIVE_LIKELY', 'NO_POSITIVE_SYNTHETIC_EVIDENCE');
  const cameraEvidence = fixtureMeasurement({ id: 'case-camera-native:camera', family: 'EF2_PHYSICAL_ACQUISITION', name: 'camera_pipeline_consistency', value: { cameraPipelineConsistency: 0.94, sensorNoiseScore: 0.88 } });
  const metadataStripped = withAxes(basePacket('case-metadata-stripped', 'CAMERA_NATIVE_LIKELY', 'NO_POSITIVE_SYNTHETIC_EVIDENCE'), 'CAMERA_NATIVE_LIKELY', 'NO_POSITIVE_SYNTHETIC_EVIDENCE');
  const metadataEvidence = fixtureMeasurement({ id: 'case-metadata-stripped:metadata', family: 'EF1_FILE_PROVENANCE', name: 'metadata_absent', value: { metadataAbsent: true, metadataIsNotOriginEvidence: true } });
  const photographedSynthetic = withAxes(basePacket('case-photographed-synthetic', 'CAMERA_NATIVE_LIKELY', 'STRONG_SYNTHETIC_EVIDENCE'), 'CAMERA_NATIVE_LIKELY', 'STRONG_SYNTHETIC_EVIDENCE');
  const syntheticEvidence = fixtureMeasurement({ id: 'case-photographed-synthetic:synthetic', family: 'EF3_GENERATIVE_FORENSICS', name: 'depicted_content_synthetic_measurement', value: { syntheticContentObserved: true } });
  const screenshot = withAxes(basePacket('case-game-screenshot', 'CAMERA_EVIDENCE_ABSENT', 'NO_POSITIVE_SYNTHETIC_EVIDENCE'), 'CAMERA_EVIDENCE_ABSENT', 'NO_POSITIVE_SYNTHETIC_EVIDENCE');
  const screenshotEvidence = fixtureMeasurement({ id: 'case-game-screenshot:screenshot', family: 'EF1_FILE_PROVENANCE', name: 'screenshot_indicator', value: { screenshotIndicator: 'strong', digitalContentCompatible: true } });
  const convincingSynthetic = withAxes(basePacket('case-convincing-synthetic', 'CAMERA_EVIDENCE_ABSENT', 'STRONG_SYNTHETIC_EVIDENCE'), 'CAMERA_EVIDENCE_ABSENT', 'STRONG_SYNTHETIC_EVIDENCE');
  const convincingSyntheticEvidence = fixtureMeasurement({ id: 'case-convincing-synthetic:synthetic', family: 'EF3_GENERATIVE_FORENSICS', name: 'global_forensic_measurement', value: { syntheticFeatureScore: 0.91, visualAnomalyObserved: false } });
  const weakContradiction = finish(withAxes(basePacket('case-contradictory-weak', 'CAMERA_ORIGIN_UNCERTAIN', 'WEAK_SYNTHETIC_EVIDENCE'), 'CAMERA_ORIGIN_UNCERTAIN', 'WEAK_SYNTHETIC_EVIDENCE'), ['case-contradictory-weak:camera', 'case-contradictory-weak:synthetic']);
  const weakCamera = fixtureMeasurement({ id: 'case-contradictory-weak:camera', family: 'EF2_PHYSICAL_ACQUISITION', name: 'weak_camera_proxy', value: { cameraPipelineConsistency: 0.51 } });
  const weakSynthetic = fixtureMeasurement({ id: 'case-contradictory-weak:synthetic', family: 'EF3_GENERATIVE_FORENSICS', name: 'weak_synthetic_proxy', value: { syntheticFeatureScore: 0.52 } });
  const harmfulCamera = withAxes(basePacket('case-harmful-camera', 'CAMERA_NATIVE_LIKELY', 'NO_POSITIVE_SYNTHETIC_EVIDENCE', harmfulCameraModeration()), 'CAMERA_NATIVE_LIKELY', 'NO_POSITIVE_SYNTHETIC_EVIDENCE');

  return [
    { caseId: 'case-camera-native', description: 'Strong physical acquisition evidence with no meaningful synthetic evidence.', expectedHypothesis: 'CAMERA_NATIVE', packet: addFixtureEvidence(camera, cameraEvidence) },
    { caseId: 'case-metadata-stripped', description: 'Metadata absent while other evidence remains camera-consistent.', expectedHypothesis: 'CAMERA_NATIVE', packet: addFixtureEvidence(metadataStripped, metadataEvidence) },
    { caseId: 'case-photographed-synthetic', description: 'Camera acquisition and synthetic depicted content are both present.', expectedHypothesis: 'CAMERA_CAPTURE_OF_SYNTHETIC', packet: addFixtureEvidence(photographedSynthetic, syntheticEvidence) },
    { caseId: 'case-game-screenshot', description: 'Digital or screenshot evidence without independent synthetic-generation evidence.', expectedHypothesis: 'DIGITAL_ART_OR_CGI', packet: addFixtureEvidence(screenshot, screenshotEvidence) },
    { caseId: 'case-convincing-synthetic', description: 'Synthetic-supporting forensic evidence with no semantic visual anomaly.', expectedHypothesis: 'SYNTHETIC', packet: addFixtureEvidence(convincingSynthetic, convincingSyntheticEvidence) },
    { caseId: 'case-contradictory-weak', description: 'Mixed weak measurements should cause abstention.', expectedHypothesis: 'INSUFFICIENT_EVIDENCE', packet: finish(addFixtureEvidence(addFixtureEvidence(weakContradiction, weakCamera), weakSynthetic), ['case-contradictory-weak:camera', 'case-contradictory-weak:synthetic']) },
    { caseId: 'case-harmful-camera', description: 'Safety flags violence while acquisition evidence remains camera-native.', expectedHypothesis: 'CAMERA_NATIVE', packet: harmfulCamera },
  ];
}
