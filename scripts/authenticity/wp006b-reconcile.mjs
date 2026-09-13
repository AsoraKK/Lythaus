import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  WP006B_BENCHMARK_SCHEMA_VERSION,
  WP006B_FINGERPRINT_SCHEMA_VERSION,
  WP006B_RIGHTS_SCHEMA_VERSION,
  WP006B_SPLITS_SCHEMA_VERSION,
  WP006B_TRANSFORMATION_REGISTRY,
  buildWp006bFingerprintInput,
  stableStringify,
} from '../../packages/authenticity/src/wp006b.ts';

const MINIMUMS = { camera: 12, synthetic: 8, hardNegative: 6, partialEdit: 6 };

function parseArgs(argv) {
  const options = { inventory: null, outputDir: 'research/wp006b', repositoryStartingSha: 'UNKNOWN', researchDate: new Date().toISOString().slice(0, 10) };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--inventory') options.inventory = argv[++index];
    else if (argument === '--output-dir') options.outputDir = argv[++index];
    else if (argument === '--repository-starting-sha') options.repositoryStartingSha = argv[++index];
    else if (argument === '--research-date') options.researchDate = argv[++index];
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!options.inventory) throw new Error('inventory_required');
  return options;
}

async function writeJson(outputDir, filename, value) {
  const target = path.resolve(outputDir, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function categoryFor(folder) {
  return {
    camera: 'CAMERA_ORIGINAL_CANDIDATE',
    synthetic: 'SYNTHETIC_CANDIDATE',
    'hard-negative': 'HARD_NEGATIVE_CANDIDATE',
    'mixed-origin': 'MIXED_ORIGIN_CANDIDATE',
    'partial-edit': 'PARTIAL_EDIT_CANDIDATE',
  }[String(folder).toLowerCase()] ?? 'MIXED_ORIGIN_CANDIDATE';
}

function truthAxes() {
  return {
    physicalCameraAcquisition: 'UNKNOWN',
    syntheticDepictedContent: 'UNKNOWN',
    localManipulation: 'UNKNOWN',
    digitalCapture: 'UNKNOWN',
    screenRecapture: 'UNKNOWN',
  };
}

function privacyFlags(safeMetadata) {
  const sourceFlags = new Set(Array.isArray(safeMetadata?.privacySensitiveMetadataFlags) ? safeMetadata.privacySensitiveMetadataFlags : []);
  const flags = [];
  if (sourceFlags.has('LOCATION')) flags.push('GPS_PRESENT');
  if (sourceFlags.has('DEVICE_SERIAL')) flags.push('SERIAL_PRESENT');
  if (sourceFlags.has('OWNER_NAME')) flags.push('OWNER_RESTRICTED');
  if (sourceFlags.has('AUTHOR')) flags.push('PII_PRESENT');
  return flags.length > 0 ? flags : ['NONE'];
}

function buildOwnerQuestions(sample) {
  const commonRights = [
    'Are you the owner or an authorized contributor for this source? Answer YES, NO, or UNKNOWN.',
    'May Lythaus retain and use this source for internal authenticity research? Answer YES, NO, or UNKNOWN.',
    'May Lythaus use this source for commercial product evaluation? Answer YES, NO, or UNKNOWN.',
    'May Lythaus redistribute the source media outside controlled research storage? Answer YES, NO, or UNKNOWN. If redistribution is not planned, answer NO.',
  ];
  if (sample.candidateCategory === 'CAMERA_ORIGINAL_CANDIDATE') return [
    'Was this file produced by a physical camera capture? Answer YES, NO, or UNKNOWN.',
    'Is this a native camera original, an export, or UNKNOWN? Do not provide a serial number.',
    'Which camera device family was used, if known? Model family only; do not provide a serial number.',
    'Were any edits or exports performed after capture? Answer YES, NO, or UNKNOWN, and name only the operation class.',
    'Was a screen or display recapture involved? Answer YES, NO, or UNKNOWN.',
    'Does the depicted content include synthetic or AI-generated material? Answer YES, NO, or UNKNOWN.',
    ...commonRights,
  ];
  if (sample.candidateCategory === 'SYNTHETIC_CANDIDATE') return [
    'Was this source generated directly by the owner or an authorized contributor? Answer YES, NO, or UNKNOWN.',
    'What generator family, model, version, provider, prompt reference, seed, and generation date are known? Use UNKNOWN for each unavailable field.',
    'Was any post-processing, export, screenshot, or physical-camera capture applied after generation? Answer YES, NO, or UNKNOWN and name only the operation class.',
    'Does the source depict synthetic or AI-generated content? Answer YES, NO, or UNKNOWN.',
    'Was physical camera acquisition involved? Answer YES, NO, or UNKNOWN.',
    ...commonRights,
  ];
  if (sample.candidateCategory === 'HARD_NEGATIVE_CANDIDATE') return [
    'Which explicit hard-negative type applies: CGI, 3D_RENDER, DIGITAL_ILLUSTRATION, SCREENSHOT, UI_CAPTURE, CHART, DIAGRAM, MEME_COMPOSITE, EDITED_GENUINE_PHOTO, SCAN, or OTHER?',
    'Describe the source lineage in one short phrase: owner-created, licensed source, screenshot, export, or UNKNOWN.',
    'Confirm physical camera acquisition, synthetic depicted content, digital capture, screen recapture, and local manipulation independently as YES, NO, or UNKNOWN.',
    ...commonRights,
  ];
  return [
    'Describe the capture/content lineage in one short phrase.',
    'Confirm physical camera acquisition, synthetic depicted content, digital capture, screen recapture, and local manipulation independently as YES, NO, or UNKNOWN.',
    ...commonRights,
  ];
}

function responseFieldsForCategory(category) {
  if (category === 'CAMERA_ORIGINAL_CANDIDATE') return [
    'ownerConfirmed',
    'physicalCameraCaptureConfirmed',
    'nativeOriginalOrExport',
    'cameraDeviceFamily',
    'knownEdits',
    'screenRecapture',
    'syntheticDepictedContent',
    'permissionForInternalLythausResearch',
    'permissionForCommercialProductEvaluation',
    'permissionForRedistribution',
  ];
  if (category === 'SYNTHETIC_CANDIDATE') return [
    'ownerConfirmed',
    'generatedByOwnerOrAuthorizedContributor',
    'generatorFamily',
    'generatorModel',
    'generatorVersion',
    'provider',
    'promptReference',
    'seed',
    'generationDate',
    'postProcessing',
    'physicalCameraAcquisition',
    'screenRecapture',
    'syntheticDepictedContent',
    'permissionForInternalLythausResearch',
    'permissionForCommercialProductEvaluation',
    'permissionForRedistribution',
  ];
  if (category === 'HARD_NEGATIVE_CANDIDATE') return [
    'ownerConfirmed',
    'hardNegativeType',
    'sourceLineageDescription',
    'physicalCameraAcquisition',
    'syntheticDepictedContent',
    'digitalCapture',
    'screenRecapture',
    'localManipulation',
    'permissionForInternalLythausResearch',
    'permissionForCommercialProductEvaluation',
    'permissionForRedistribution',
  ];
  return [
    'ownerConfirmed',
    'lineageDescription',
    'physicalCameraAcquisition',
    'syntheticDepictedContent',
    'digitalCapture',
    'screenRecapture',
    'localManipulation',
    'permissionForInternalLythausResearch',
    'permissionForCommercialProductEvaluation',
    'permissionForRedistribution',
  ];
}

function buildOwnerTemplate(samples) {
  return {
    schemaVersion: 'lythaus-wp006b-owner-confirmation-template-v1',
    purpose: 'Human-only provenance and permission questions for the owner-supplied seed. Technical hashes, dimensions, MIME, and metadata were derived automatically and are intentionally not requested here.',
    responseRules: [
      'Answer only facts known from the source history; use UNKNOWN instead of guessing.',
      'Do not provide GPS, addresses, account identifiers, camera serial numbers, or private filenames.',
      'Internal research permission and commercial product-evaluation permission are separate answers.',
    ],
    collectionQuestion: 'Are any supplied files exports, recompressions, crops, screenshots, or other descendants of another supplied file? If yes, list only the logical sample IDs; otherwise answer NO or UNKNOWN.',
    samples: samples.map((sample) => ({
      sampleId: sample.sampleId,
      candidateCategory: sample.candidateCategory,
      responseFields: responseFieldsForCategory(sample.candidateCategory),
      questions: buildOwnerQuestions(sample),
    })),
  };
}

function buildGap(counts) {
  return {
    minimumResearchThresholds: MINIMUMS,
    shortfallBySlice: {
      camera: Math.max(0, MINIMUMS.camera - counts.cameraFamilies),
      synthetic: Math.max(0, MINIMUMS.synthetic - counts.syntheticFamilies),
      hardNegative: Math.max(0, MINIMUMS.hardNegative - counts.hardNegativeFamilies),
      partialEdit: Math.max(0, MINIMUMS.partialEdit - counts.partialEditFamilies),
    },
    candidateFamiliesPresent: {
      camera: counts.cameraFamilies,
      synthetic: counts.syntheticFamilies,
      hardNegative: counts.hardNegativeFamilies,
      partialEdit: counts.partialEditFamilies,
    },
    ownerConfirmationRequiredFamilies: {
      camera: counts.cameraFamilies,
      synthetic: counts.syntheticFamilies,
      hardNegative: counts.hardNegativeFamilies,
      partialEdit: counts.partialEditFamilies,
    },
    unseenGeneratorHoldout: 'NOT_READY',
    mixedOriginFamilies: counts.mixedOriginFamilies,
  };
}

function makeRightsRecord(sample) {
  return {
    rightsRecordId: sample.rightsRecordId,
    sampleId: sample.sampleId,
    sourceFamilyId: sample.sourceFamilyId,
    codeRights: 'NOT_APPLICABLE',
    weightRights: 'NOT_APPLICABLE',
    sourceMediaRights: 'UNRESOLVED',
    dataRights: 'UNRESOLVED',
    evaluationRights: 'UNRESOLVED',
    internalResearchRights: 'UNRESOLVED',
    commercialProductEvaluationRights: 'UNRESOLVED',
    redistributionRights: 'UNRESOLVED',
    readiness: 'PROVENANCE_CONFIRMATION_REQUIRED',
    reasonCodes: [
      'OWNER_CAPTURE_OR_GENERATION_PROVENANCE_UNCONFIRMED',
      'INTERNAL_RESEARCH_PERMISSION_UNCONFIRMED',
      'COMMERCIAL_PRODUCT_EVALUATION_PERMISSION_UNCONFIRMED',
      'REDISTRIBUTION_PERMISSION_UNCONFIRMED',
    ],
  };
}

const options = parseArgs(process.argv.slice(2));
const inventory = JSON.parse(await readFile(path.resolve(options.inventory), 'utf8'));
if (inventory.schemaVersion !== 'lythaus-wp006b-owner-seed-inventory-v1') throw new Error('inventory_schema_invalid');
if (inventory.originalFilesModified !== false || inventory.rawMetadataPersisted !== false || inventory.rawMediaPersisted !== false) throw new Error('inventory_safety_flags_invalid');

const sortedEntries = [...inventory.entries].sort((left, right) => left.ownerProvidedName.localeCompare(right.ownerProvidedName));
const firstByHash = new Map();
const samples = [];
for (const entry of sortedEntries) {
  const sampleId = entry.ownerProvidedName;
  const prior = firstByHash.get(entry.contentSha256) ?? null;
  if (!prior) firstByHash.set(entry.contentSha256, { sampleId, sourceFamilyId: `WP006B-FAMILY-${sampleId}` });
  const family = prior ?? firstByHash.get(entry.contentSha256);
  const candidateCategory = categoryFor(entry.candidateFolderCategory);
  const rightsRecordId = `WP006B-RIGHTS-${sampleId}`;
  const truth = truthAxes();
  const sample = {
    sampleId,
    groupId: family.sourceFamilyId,
    sourceFamilyId: family.sourceFamilyId,
    ownerProvidedName: `${sampleId}.${String(entry.relativePath).split('.').pop()}`,
    candidateCategory,
    origin: 'UNKNOWN',
    transformation: 'ORIGINAL',
    logicalFileReference: `external-owner-seed/wp004a-observer-v0/originals/${entry.relativePath}`,
    sourceUrlOrAcquisitionId: `owner-seed:${sampleId}`,
    contentSha256: entry.contentSha256,
    perceptualHash: entry.perceptualHash,
    perceptualHashAlgorithm: entry.perceptualHashAlgorithm,
    byteSize: entry.byteSize,
    width: entry.width,
    height: entry.height,
    mime: entry.signatureMime ?? entry.extensionMime,
    safeMetadata: entry.safeMetadata,
    truthAxes: truth,
    truthSynthetic: truth.syntheticDepictedContent,
    truthLocalManipulation: truth.localManipulation,
    truthBasis: 'OWNER_CONFIRMATION_REQUIRED',
    generatorFamily: null,
    generatorModel: null,
    generatorVersion: null,
    cameraDeviceFamily: null,
    sourceDatasetId: 'lythaus-owner-seed-wp004a-observer-v0',
    sourceUrl: null,
    licenceClassification: 'OWNER_CONFIRMATION_REQUIRED',
    rightsClass: 'MIXED_OR_UNCLEAR',
    evaluationGate: 'REVIEW_REQUIRED',
    trainingGate: 'DO_NOT_TRAIN',
    distillationGate: 'DO_NOT_DISTILL',
    consentStatus: 'OWNER_CONFIRMATION_REQUIRED',
    sourceLineage: {
      relation: prior ? 'DESCENDANT' : 'SOURCE_ORIGINAL',
      parentSampleId: prior?.sampleId ?? null,
      familyEvidence: prior ? 'LIKELY_RELATED' : 'NO_RELATED_MEDIA_OBSERVED',
    },
    parentSampleId: prior?.sampleId ?? null,
    mask: null,
    maskPathOrId: null,
    maskSha256: null,
    rightsRecordId,
    split: 'EVALUATION',
    calibrationEligible: false,
    evaluationEligible: false,
    trainingEligible: false,
    readiness: 'PROVENANCE_CONFIRMATION_REQUIRED',
    ownerConfirmationReference: `owner-confirmation-template.json#/samples/${sampleId}`,
    retentionClass: 'MEDIA_EXTERNAL_CACHE',
    privacyFlags: privacyFlags(entry.safeMetadata),
    privacyReview: entry.safeMetadata.privacySensitiveMetadataFlags.length > 0 ? 'SENSITIVE_METADATA_FLAGGED' : 'PENDING_OWNER_REVIEW',
    duplicateOfSampleId: prior?.sampleId ?? null,
    nearestPerceptualDistance: entry.nearestPerceptualDistance ?? null,
  };
  samples.push(sample);
}

const countFamilies = (category) => new Set(samples.filter((sample) => sample.candidateCategory === category).map((sample) => sample.sourceFamilyId)).size;
const counts = {
  ownerSeedImages: samples.length,
  independentSourceFamilies: new Set(samples.map((sample) => sample.sourceFamilyId)).size,
  cameraFamilies: countFamilies('CAMERA_ORIGINAL_CANDIDATE'),
  syntheticFamilies: countFamilies('SYNTHETIC_CANDIDATE'),
  hardNegativeFamilies: countFamilies('HARD_NEGATIVE_CANDIDATE'),
  mixedOriginFamilies: countFamilies('MIXED_ORIGIN_CANDIDATE'),
  partialEditFamilies: countFamilies('PARTIAL_EDIT_CANDIDATE'),
  cameraDeviceFamilies: 0,
  generatorFamilies: 0,
  calibrationReadyFamilies: 0,
};

const rights = { schemaVersion: WP006B_RIGHTS_SCHEMA_VERSION, benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION, records: samples.map(makeRightsRecord) };
const splits = {
  schemaVersion: WP006B_SPLITS_SCHEMA_VERSION,
  benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  splitBoundary: 'SOURCE_FAMILY',
  policy: {
    sourceFamilyBoundary: true,
    cameraDeviceBoundary: true,
    generatorFamilyHoldout: true,
    descendantsStayWithParent: true,
    scoringRequiresOwnerConfirmation: true,
    scoringRequiresRightsClosure: true,
  },
  assignments: samples.map((sample) => ({ sampleId: sample.sampleId, sourceFamilyId: sample.sourceFamilyId, split: sample.split, eligible: false, eligibilityReason: 'OWNER_PROVENANCE_AND_PERMISSION_CONFIRMATION_REQUIRED' })),
  deviceHoldout: { status: 'NOT_READY', families: [], reason: 'No owner-confirmed device-family identities are present; no device holdout is asserted.' },
  generatorHoldout: { status: 'NOT_READY', families: [], reason: 'No owner-confirmed generator-family identities are present; no unseen-generator holdout is asserted.' },
  transformationStress: { status: 'DEFERRED', descendantsRemainWithParentFamily: true },
};
const manifest = {
  schemaVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  benchmarkName: 'LYTHAUS_FORENSIC_MICROBENCH_V0',
  benchmarkStatus: 'FOUNDATION_ONLY_OWNER_CONFIRMATION_REQUIRED',
  researchDate: options.researchDate,
  repositoryStartingSha: options.repositoryStartingSha,
  sourceRootLabel: inventory.sourceRootLabel,
  originalFilesModified: false,
  mediaCommittedToGit: false,
  specialistInferenceRun: false,
  samples,
  transformations: { status: 'DEFERRED_UNTIL_SOURCE_FAMILY_LOCKED', materializedDescendantCount: 0, registeredKinds: WP006B_TRANSFORMATION_REGISTRY },
  counts,
};
const fingerprintInput = buildWp006bFingerprintInput({ manifest, rights, splits });
const fingerprint = {
  schemaVersion: WP006B_FINGERPRINT_SCHEMA_VERSION,
  benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  fingerprintAlgorithm: 'SHA-256(stableStringify(canonicalInput))',
  fingerprintSha256: createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex'),
  canonicalInput: fingerprintInput,
};
const ownerTemplate = buildOwnerTemplate(samples);
const gap = buildGap(counts);
const safeInventory = { ...inventory, entries: inventory.entries.map((entry) => ({ ...entry, safeMetadata: entry.safeMetadata })) };

await writeJson(options.outputDir, 'seed-inventory.json', safeInventory);
await writeJson(options.outputDir, 'benchmark-manifest.json', manifest);
await writeJson(options.outputDir, 'benchmark-rights.json', rights);
await writeJson(options.outputDir, 'benchmark-splits.json', splits);
await writeJson(options.outputDir, 'benchmark-fingerprint.json', fingerprint);
await writeJson(options.outputDir, 'owner-confirmation-template.json', ownerTemplate);
await writeJson(options.outputDir, 'benchmark-gap.json', gap);
console.log(JSON.stringify({ schemaVersion: WP006B_BENCHMARK_SCHEMA_VERSION, counts, gap, fingerprintSha256: fingerprint.fingerprintSha256, outputDir: path.resolve(options.outputDir) }));
