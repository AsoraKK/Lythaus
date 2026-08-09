import type { AuthenticityContentKind } from './types.ts';
import { assertUuidV7, uuidv7, type UUIDv7 } from './uuid.ts';

export const EVIDENCE_SCHEMA_VERSION = 'lythaus-authenticity-evidence-v1' as const;
export const FOUNDATION_POLICY_VERSION = 'lythaus-authenticity-policy-v1' as const;

export const PROCESSING_MODES = [
  'MODERATION_ONLY',
  'AUTHENTICITY_ONLY',
  'MODERATION_THEN_AUTHENTICITY',
  'AUTHENTICITY_THEN_MODERATION',
  'PARALLEL',
  'CUSTOM_POLICY',
] as const;
export type ProcessingMode = (typeof PROCESSING_MODES)[number];

export const PIPELINE_STATES = [
  'SUBMISSION',
  'PREFLIGHT',
  'CHEAP_FORENSICS',
  'SAFETY_MODERATION',
  'QUARANTINE_AUDIT',
  'FAST_AUTHENTICITY',
  'UNCERTAINTY_ROUTER',
  'DEEP_AUTHENTICITY',
  'GPT_OSS_REASONING',
  'DETERMINISTIC_POLICY',
  'RESULT',
  'REVIEW',
  'APPEAL',
  'STOP',
] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

export type EvidenceFamily = 'EF1_FILE_PROVENANCE' | 'EF2_PHYSICAL_ACQUISITION' | 'EF3_GENERATIVE_FORENSICS' | 'EF4_SPECTRAL_STABILITY' | 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION';
export type Applicability = 'applicable' | 'not_applicable' | 'unavailable' | 'invalid';
export type UncertaintyGrade = 'low' | 'medium' | 'high' | 'unknown';
export type CameraEvidenceLevel = 'CAMERA_NATIVE_LIKELY' | 'CAMERA_PROCESSED' | 'SCREEN_RECAPTURE_LIKELY' | 'CAMERA_EVIDENCE_ABSENT' | 'CAMERA_ORIGIN_UNCERTAIN';
export type SyntheticEvidenceLevel = 'NO_POSITIVE_SYNTHETIC_EVIDENCE' | 'WEAK_SYNTHETIC_EVIDENCE' | 'MODERATE_SYNTHETIC_EVIDENCE' | 'STRONG_SYNTHETIC_EVIDENCE' | 'VERIFIED_SYNTHETIC_PROVENANCE';
export type PolicyClassification = 'ALLOW' | 'REVIEW' | 'BLOCK' | 'QUARANTINE' | 'NOT_RUN';
export type AppealOutcome = 'NOT_ELIGIBLE' | 'PENDING' | 'UPHELD' | 'REVERSED' | 'INCONCLUSIVE';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Uncertainty {
  grade: UncertaintyGrade;
  lowerBound: number | null;
  upperBound: number | null;
  rationale: string;
}

export interface DecisionAudit {
  modelVersion: string | null;
  policyVersion: string;
  evidenceSchemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  timestamp: string;
  reasonCodes: readonly string[];
  applicability: Applicability;
  uncertainty: Uncertainty;
  executionMs: number;
  costEstimateUsd: number;
  finalClassification: PolicyClassification | null;
  appealOutcome: AppealOutcome | null;
}

export interface EvidenceFamilyRecord<T extends JsonValue = JsonValue> {
  family: EvidenceFamily;
  applicability: Applicability;
  reasonCodes: readonly string[];
  data: T;
}

export interface AuthenticityCase {
  id: UUIDv7;
  submissionId: UUIDv7;
  contentKind: AuthenticityContentKind;
  processingMode: ProcessingMode;
  state: PipelineState;
  status: 'OPEN' | 'PROCESSING' | 'QUARANTINED' | 'COMPLETED' | 'REVIEW' | 'APPEAL' | 'STOPPED';
  evidenceSchemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
  evidenceIds: readonly UUIDv7[];
  finalDecisionId: UUIDv7 | null;
  appealOutcome: AppealOutcome;
}

export interface AuthenticityEvidence {
  id: UUIDv7;
  caseId: UUIDv7;
  family: EvidenceFamily;
  featureName: string;
  value: JsonValue;
  source: string;
  capturedAt: string;
  audit: DecisionAudit;
}

export interface ImageDimensions {
  width: number;
  height: number;
  pixelCount: number;
}

export interface MetadataFeatures {
  exifPresent: boolean;
  xmpPresent: boolean;
  c2paPresent: boolean;
  c2pa: { status: 'ABSENT' | 'PRESENT_UNVERIFIED'; manifestCount: number };
  encoderPresent: boolean;
  metadataAbsent: boolean;
  keys: readonly string[];
}

export interface CompressionFeatures {
  format: string;
  progressive: boolean | null;
  quantisationTableCount: number | null;
  quantisationMean: number | null;
  doubleCompressionIndicator: number | null;
  compressionRatio: number | null;
}

export interface FileProvenanceFeatures {
  sha256: string;
  perceptualHash: string;
  mime: string;
  dimensions: ImageDimensions | null;
  metadata: MetadataFeatures;
  encoderInformation: string | null;
  compression: CompressionFeatures;
  screenshotIndicatorScore: number | null;
}

export interface PhysicalAcquisitionFeatures {
  cameraPipelineConsistency: number | null;
  cfaDemosaicingScore: number | null;
  sensorNoiseScore: number | null;
  opticalCharacteristicsScore: number | null;
  screenRecaptureScore: number | null;
  moireScore: number | null;
  cameraEvidenceApplicability: Applicability;
  cameraOrigin: CameraEvidenceLevel;
}

export interface GenerativeForensicsFeatures {
  syntheticFeatureScore: number | null;
  textureStatisticsScore: number | null;
  latentDecoderScore: number | null;
  globalStructureScore: number | null;
  generatorFamilyEmbedding: readonly number[] | null;
  localSyntheticRegions: readonly JsonValue[];
  syntheticEvidence: SyntheticEvidenceLevel;
}

export interface SpectralStabilityFeatures {
  fftMagnitude: readonly number[];
  fftPhase: readonly number[];
  dct: readonly number[];
  wavelets: readonly number[];
  residuals: readonly number[];
  transformedImageScores: readonly number[];
  featureMovement: number | null;
  mean: number | null;
  variance: number | null;
  edgeStatistics: { meanMagnitude: number | null; variance: number | null; sampleCount: number };
  robustnessGrade: UncertaintyGrade;
}

export interface ReconstructionFeatures {
  inpaintingScore: number | null;
  localGenerationScore: number | null;
  reconstructionCharacteristics: readonly string[];
  mixedOriginScore: number | null;
  manipulationMasks: readonly JsonValue[];
  regionalInconsistencyScore: number | null;
}

export interface ForensicFeatureBundle {
  id: UUIDv7;
  caseId: UUIDv7;
  featureVersion: 'lythaus-forensics-v0';
  fileProvenance: FileProvenanceFeatures;
  physicalAcquisition: PhysicalAcquisitionFeatures;
  generativeForensics: GenerativeForensicsFeatures;
  spectralStability: SpectralStabilityFeatures;
  reconstruction: ReconstructionFeatures;
  imagePyramid: readonly { scale: number; width: number; height: number; mean: number; variance: number }[];
  featureVector: readonly number[];
  audit: DecisionAudit;
}

export interface ModelRun {
  id: UUIDv7;
  caseId: UUIDv7;
  modelId: UUIDv7;
  modelVersion: string;
  inputHash: string;
  outputHash: string | null;
  status: 'NOT_RUN' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABSTAINED';
  evidenceIds: readonly UUIDv7[];
  audit: DecisionAudit;
}

export type TransformationKind = 'JPEG_QUALITY_95' | 'JPEG_QUALITY_75' | 'RESIZE_75' | 'RESIZE_50' | 'CROP_10' | 'MILD_BLUR' | 'MILD_SHARPEN' | 'METADATA_STRIPPED' | 'SCREENSHOT_STYLE_RESAMPLING';

export interface TransformationRun {
  id: UUIDv7;
  caseId: UUIDv7;
  inputBundleId: UUIDv7;
  transformation: TransformationKind;
  originalFeatureVector: readonly number[];
  transformedFeatureVector: readonly number[];
  featureDistance: number;
  detectorScoreIfAvailable: number | null;
  scoreVariance: number | null;
  audit: DecisionAudit;
}

export type ModerationResult = 'ALLOW' | 'REVIEW' | 'BLOCK' | 'PROVIDER_FAILURE';

export interface ModerationDecision {
  id: UUIDv7;
  caseId: UUIDv7;
  provider: string;
  result: ModerationResult;
  reasonCodes: readonly string[];
  audit: DecisionAudit;
}

export interface AuthenticityRecommendation {
  id: UUIDv7;
  caseId: UUIDv7;
  recommendation: 'ALLOW' | 'REVIEW' | 'BLOCK';
  contradictions: readonly string[];
  evidenceIds: readonly UUIDv7[];
  enforcementAuthority: 'NONE';
  audit: DecisionAudit;
}

export interface PolicyDecision {
  id: UUIDv7;
  caseId: UUIDv7;
  classification: PolicyClassification;
  enforcementAction: 'NO_ACTION' | 'PUBLISH' | 'REVIEW' | 'QUARANTINE' | 'APPEAL';
  source: 'DETERMINISTIC_APPLICATION_CODE';
  authenticityEnforcementEnabled: false;
  audit: DecisionAudit;
}

export interface AppealEvidencePacket {
  id: UUIDv7;
  caseId: UUIDv7;
  evidenceIds: readonly UUIDv7[];
  submittedEvidenceHash: string | null;
  requestedOutcome: 'REVIEW' | 'REVERSE' | 'UPHOLD';
  audit: DecisionAudit;
}

export interface ModelManifest {
  modelId: UUIDv7;
  registryKey: string;
  displayName: string;
  version: string;
  modelType: 'CLASSIFIER' | 'EMBEDDING' | 'SPECTRAL' | 'RECONSTRUCTION' | 'FUSION' | 'REASONER' | 'SEMANTIC_VISION';
  role: 'SAFETY' | 'FORENSICS' | 'JUDGE';
  source: string;
  licence: string;
  weightLicence: string | null;
  commercialUseStatus: 'NOT_REVIEWED' | 'APPROVED' | 'BLOCKED' | 'UNKNOWN';
  inputContract: string;
  outputContract: string;
  artifactSha256: string | null;
  evaluationStatus: 'NOT_STARTED' | 'SHADOW_ONLY' | 'PASSED' | 'FAILED';
  deploymentStatus: 'NOT_DEPLOYED' | 'SHADOW' | 'PRODUCTION_REVIEW_ONLY' | 'RETIRED';
  rollbackVersion: string | null;
  approvalTimestamp: string | null;
}

export interface EvaluationMetrics {
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  precision: number | null;
  recall: number | null;
  calibrationBrierScore: number | null;
  abstentionRate: number | null;
  latencyMs: number | null;
  memoryMb: number | null;
  costUsd: number | null;
  transformationStability: number | null;
}

export interface EvaluationRun {
  id: UUIDv7;
  datasetManifestId: UUIDv7;
  modelId: UUIDv7;
  originLabels: readonly string[];
  transformations: readonly string[];
  metrics: EvaluationMetrics;
  status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  audit: DecisionAudit;
}

export function createDecisionAudit(input: Partial<Omit<DecisionAudit, 'evidenceSchemaVersion'>> = {}): DecisionAudit {
  return {
    modelVersion: input.modelVersion ?? null,
    policyVersion: input.policyVersion ?? FOUNDATION_POLICY_VERSION,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    timestamp: input.timestamp ?? new Date().toISOString(),
    reasonCodes: input.reasonCodes ?? [],
    applicability: input.applicability ?? 'applicable',
    uncertainty: input.uncertainty ?? { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'Not yet calibrated.' },
    executionMs: input.executionMs ?? 0,
    costEstimateUsd: input.costEstimateUsd ?? 0,
    finalClassification: input.finalClassification ?? null,
    appealOutcome: input.appealOutcome ?? null,
  };
}

export function createAuthenticityCase(input: {
  submissionId?: UUIDv7;
  contentKind: AuthenticityContentKind;
  processingMode: ProcessingMode;
  policyVersion?: string;
  now?: string;
}): AuthenticityCase {
  const submissionId = input.submissionId ?? uuidv7();
  assertUuidV7(submissionId, 'submissionId');
  const now = input.now ?? new Date().toISOString();
  return {
    id: uuidv7(),
    submissionId,
    contentKind: input.contentKind,
    processingMode: input.processingMode,
    state: 'SUBMISSION',
    status: 'OPEN',
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    policyVersion: input.policyVersion ?? FOUNDATION_POLICY_VERSION,
    createdAt: now,
    updatedAt: now,
    evidenceIds: [],
    finalDecisionId: null,
    appealOutcome: 'NOT_ELIGIBLE',
  };
}

export function assertDecisionAudit(audit: DecisionAudit): void {
  if (audit.evidenceSchemaVersion !== EVIDENCE_SCHEMA_VERSION) throw new Error('evidence_schema_version_invalid');
  if (!Number.isFinite(audit.executionMs) || audit.executionMs < 0) throw new Error('execution_ms_invalid');
  if (!Number.isFinite(audit.costEstimateUsd) || audit.costEstimateUsd < 0) throw new Error('cost_estimate_invalid');
  if (audit.uncertainty.lowerBound !== null && (audit.uncertainty.lowerBound < 0 || audit.uncertainty.lowerBound > 1)) throw new Error('uncertainty_lower_bound_invalid');
  if (audit.uncertainty.upperBound !== null && (audit.uncertainty.upperBound < 0 || audit.uncertainty.upperBound > 1)) throw new Error('uncertainty_upper_bound_invalid');
}
