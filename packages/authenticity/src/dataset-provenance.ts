import { assertUuidV7, type UUIDv7 } from './uuid.ts';

export const DATASET_RIGHTS_CLASSES = [
  'CLASS_A_COMMERCIAL_TRAINING',
  'CLASS_B_EVALUATION_ONLY',
  'CLASS_C_LYTHAUS_OWNED',
] as const;
export type DatasetRightsClass = (typeof DATASET_RIGHTS_CLASSES)[number];

export const DATASET_RIGHTS_GATES = ['ALLOW', 'DENY', 'CONDITIONAL', 'DO_NOT_TRAIN', 'UNKNOWN'] as const;
export type DatasetRightsGate = (typeof DATASET_RIGHTS_GATES)[number];

export const DATASET_SPLITS = ['TRAIN', 'CALIBRATION', 'KNOWN_TEST', 'UNSEEN_TEST', 'EVALUATION_ONLY'] as const;
export type DatasetSplit = (typeof DATASET_SPLITS)[number];

export const DATASET_APPROVAL_SCOPES = [
  'SOURCE_RIGHTS',
  'EVALUATION',
  'MODIFICATION',
  'COMMERCIAL_TRAINING',
  'TRAINING',
  'DISTILLATION',
] as const;
export type DatasetApprovalScope = (typeof DATASET_APPROVAL_SCOPES)[number];

export interface DatasetHumanApproval {
  approvalId: string;
  approvedBy: string;
  approvedAt: string;
  decision: 'APPROVED';
  scopes: readonly DatasetApprovalScope[];
}

export interface DatasetSampleProvenance {
  datasetId: string;
  sampleId: UUIDv7;
  sourceFamilyId: UUIDv7;
  sourceUrl: string | null;
  originalFilename: string;
  retrievedAt: string;
  sha256: string;
  perceptualHash: string | null;
  licence: string;
  licenceUrl: string | null;
  licenceEvidenceStatus: 'VERIFIED' | 'CONDITIONAL' | 'UNKNOWN' | 'BLOCKED';
  rightsClass: DatasetRightsClass;
  trainingGate: DatasetRightsGate;
  commercialTrainingAllowed: DatasetRightsGate;
  evaluationAllowed: DatasetRightsGate;
  distillationAllowed: DatasetRightsGate;
  redistributionAllowed: DatasetRightsGate;
  modificationAllowed: DatasetRightsGate;
  authorOrCreator: string | null;
  attribution: string | null;
  originClass: 'CAMERA_NATIVE' | 'AI_GENERATED' | 'AI_EDITED' | 'TRADITIONAL_DIGITAL_ART' | 'CGI' | 'SCAN' | 'COMPOSITE' | 'UNKNOWN';
  generator: string | null;
  generatorVersion: string | null;
  device: string | null;
  privacyFlags: readonly string[];
  containsUserContent: false;
  humanApproval?: DatasetHumanApproval | null;
  parentSampleId: UUIDv7 | null;
  transformation: string;
  split: DatasetSplit;
}

function hasRecordedApproval(sample: Pick<DatasetSampleProvenance, 'humanApproval'>, scope: DatasetApprovalScope): boolean {
  const approval = sample.humanApproval;
  return approval?.decision === 'APPROVED'
    && approval.approvalId.trim().length > 0
    && approval.approvedBy.trim().length > 0
    && Number.isFinite(Date.parse(approval.approvedAt))
    && approval.scopes.includes(scope);
}

function gateAllows(sample: Pick<DatasetSampleProvenance, 'humanApproval'>, gate: DatasetRightsGate, scope: DatasetApprovalScope): boolean {
  return gate === 'ALLOW' || ((gate === 'CONDITIONAL' || gate === 'UNKNOWN') && hasRecordedApproval(sample, scope));
}

function assertGate(sample: Pick<DatasetSampleProvenance, 'humanApproval'>, gate: DatasetRightsGate, scope: DatasetApprovalScope, field: string): void {
  if (gateAllows(sample, gate, scope)) return;
  if (gate === 'DENY' || gate === 'DO_NOT_TRAIN') throw new Error(`provenance_gate_denied:${field}`);
  throw new Error(`recorded_human_approval_required:${field}`);
}

function sourceRightsVerified(sample: Pick<DatasetSampleProvenance, 'licenceEvidenceStatus' | 'humanApproval'>): boolean {
  return sample.licenceEvidenceStatus === 'VERIFIED'
    || ((sample.licenceEvidenceStatus === 'CONDITIONAL' || sample.licenceEvidenceStatus === 'UNKNOWN') && hasRecordedApproval(sample, 'SOURCE_RIGHTS'));
}

export function assertDatasetSampleRights(sample: DatasetSampleProvenance): void {
  assertUuidV7(sample.sampleId, 'sampleId');
  assertUuidV7(sample.sourceFamilyId, 'sourceFamilyId');
  if (sample.parentSampleId) assertUuidV7(sample.parentSampleId, 'parentSampleId');
  if (sample.containsUserContent !== false) throw new Error('evaluation_dataset_user_content_prohibited');
  if (!sourceRightsVerified(sample)) throw new Error('unclear_rights_do_not_train');
  assertGate(sample, sample.evaluationAllowed, 'EVALUATION', 'evaluationAllowed');
  assertGate(sample, sample.modificationAllowed, 'MODIFICATION', 'modificationAllowed');
  if (sample.rightsClass === 'CLASS_B_EVALUATION_ONLY' && sample.distillationAllowed === 'ALLOW') {
    throw new Error('evaluation_only_sample_cannot_distil');
  }
  if (sample.distillationAllowed === 'ALLOW') {
    if (sample.rightsClass === 'CLASS_B_EVALUATION_ONLY'
      || !gateAllows(sample, sample.commercialTrainingAllowed, 'COMMERCIAL_TRAINING')
      || !gateAllows(sample, sample.trainingGate, 'TRAINING')) {
      throw new Error('distillation_requires_commercial_training_approval');
    }
    assertGate(sample, sample.distillationAllowed, 'DISTILLATION', 'distillationAllowed');
  } else if (sample.trainingGate === 'ALLOW' && !gateAllows(sample, sample.commercialTrainingAllowed, 'COMMERCIAL_TRAINING')) {
    throw new Error('commercial_training_requires_verified_allow_rights');
  }
}

export function canUseForTraining(sample: Pick<DatasetSampleProvenance, 'rightsClass' | 'trainingGate' | 'commercialTrainingAllowed' | 'licenceEvidenceStatus' | 'humanApproval' | 'containsUserContent'>): boolean {
  return sample.rightsClass !== 'CLASS_B_EVALUATION_ONLY'
    && sample.containsUserContent === false
    && gateAllows(sample, sample.trainingGate, 'TRAINING')
    && gateAllows(sample, sample.commercialTrainingAllowed, 'COMMERCIAL_TRAINING')
    && sourceRightsVerified(sample);
}

export function canUseForDistillation(sample: Pick<DatasetSampleProvenance, 'rightsClass' | 'trainingGate' | 'commercialTrainingAllowed' | 'distillationAllowed' | 'licenceEvidenceStatus' | 'humanApproval' | 'containsUserContent'>): boolean {
  return sample.rightsClass !== 'CLASS_B_EVALUATION_ONLY'
    && sample.containsUserContent === false
    && gateAllows(sample, sample.commercialTrainingAllowed, 'COMMERCIAL_TRAINING')
    && gateAllows(sample, sample.trainingGate, 'TRAINING')
    && gateAllows(sample, sample.distillationAllowed, 'DISTILLATION')
    && sourceRightsVerified(sample);
}

export interface PartitionedSample {
  sampleId: UUIDv7;
  sourceFamilyId: UUIDv7;
  split: DatasetSplit;
}

export function assertNoSourceFamilyLeakage(samples: readonly PartitionedSample[]): void {
  const familySplits = new Map<UUIDv7, DatasetSplit>();
  for (const sample of samples) {
    const existing = familySplits.get(sample.sourceFamilyId);
    if (existing && existing !== sample.split) throw new Error(`source_family_split_leakage:${sample.sourceFamilyId}`);
    familySplits.set(sample.sourceFamilyId, sample.split);
  }
}
