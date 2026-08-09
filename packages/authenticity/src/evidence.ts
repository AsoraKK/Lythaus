import {
  createDecisionAudit,
  EVIDENCE_SCHEMA_VERSION,
  type AuthenticityEvidence,
  type CameraEvidenceLevel,
  type EvidenceFamily,
  type JsonValue,
  type SyntheticEvidenceLevel,
} from './contracts.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

export const MANDATORY_EVIDENCE_FAMILIES: readonly EvidenceFamily[] = [
  'EF1_FILE_PROVENANCE',
  'EF2_PHYSICAL_ACQUISITION',
  'EF3_GENERATIVE_FORENSICS',
  'EF4_SPECTRAL_STABILITY',
  'EF5_RECONSTRUCTION_LOCAL_MANIPULATION',
];

export interface DualAxisOriginEvidence {
  cameraEvidence: CameraEvidenceLevel;
  syntheticEvidence: SyntheticEvidenceLevel;
}

export function createAuthenticityEvidence(input: {
  caseId: UUIDv7;
  family: EvidenceFamily;
  featureName: string;
  value: JsonValue;
  source: string;
  modelVersion?: string | null;
  applicability?: 'applicable' | 'not_applicable' | 'unavailable' | 'invalid';
  reasonCodes?: readonly string[];
  executionMs?: number;
  costEstimateUsd?: number;
}): AuthenticityEvidence {
  return {
    id: uuidv7(),
    caseId: input.caseId,
    family: input.family,
    featureName: input.featureName,
    value: input.value,
    source: input.source,
    capturedAt: new Date().toISOString(),
    audit: createDecisionAudit({
      modelVersion: input.modelVersion ?? null,
      reasonCodes: input.reasonCodes ?? [],
      applicability: input.applicability ?? 'applicable',
      executionMs: input.executionMs ?? 0,
      costEstimateUsd: input.costEstimateUsd ?? 0,
    }),
  };
}

export function validateDualAxisOrigin(input: DualAxisOriginEvidence): DualAxisOriginEvidence {
  if (!input.cameraEvidence || !input.syntheticEvidence) throw new Error('dual_axis_origin_incomplete');
  return { cameraEvidence: input.cameraEvidence, syntheticEvidence: input.syntheticEvidence };
}

export function assertEvidenceVersion(evidence: AuthenticityEvidence): void {
  if (evidence.audit.evidenceSchemaVersion !== EVIDENCE_SCHEMA_VERSION) throw new Error('evidence_schema_version_invalid');
}
