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
  parentSampleId: UUIDv7 | null;
  transformation: string;
  split: DatasetSplit;
}

export function assertDatasetSampleRights(sample: DatasetSampleProvenance): void {
  assertUuidV7(sample.sampleId, 'sampleId');
  assertUuidV7(sample.sourceFamilyId, 'sourceFamilyId');
  if (sample.parentSampleId) assertUuidV7(sample.parentSampleId, 'parentSampleId');
  if (sample.rightsClass === 'CLASS_B_EVALUATION_ONLY' && sample.distillationAllowed === 'ALLOW') {
    throw new Error('evaluation_only_sample_cannot_distil');
  }
  if (sample.licenceEvidenceStatus === 'UNKNOWN' || sample.trainingGate === 'UNKNOWN') {
    throw new Error('unclear_rights_do_not_train');
  }
  if (sample.trainingGate === 'ALLOW' && (sample.licenceEvidenceStatus !== 'VERIFIED' || sample.commercialTrainingAllowed !== 'ALLOW')) {
    throw new Error('commercial_training_requires_verified_allow_rights');
  }
}

export function canUseForTraining(sample: Pick<DatasetSampleProvenance, 'rightsClass' | 'trainingGate' | 'commercialTrainingAllowed' | 'licenceEvidenceStatus'>): boolean {
  return sample.rightsClass !== 'CLASS_B_EVALUATION_ONLY'
    && sample.trainingGate === 'ALLOW'
    && sample.commercialTrainingAllowed === 'ALLOW'
    && sample.licenceEvidenceStatus === 'VERIFIED';
}

export function canUseForDistillation(sample: Pick<DatasetSampleProvenance, 'rightsClass' | 'distillationAllowed' | 'licenceEvidenceStatus'>): boolean {
  return sample.rightsClass !== 'CLASS_B_EVALUATION_ONLY'
    && sample.distillationAllowed === 'ALLOW'
    && sample.licenceEvidenceStatus === 'VERIFIED';
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
