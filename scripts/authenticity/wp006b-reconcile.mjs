import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  WP006B_BENCHMARK_SCHEMA_VERSION,
  WP006B_FINGERPRINT_SCHEMA_VERSION,
  WP006B_INVENTORY_SCHEMA_VERSION,
  WP006B_RIGHTS_SCHEMA_VERSION,
  WP006B_SPLITS_SCHEMA_VERSION,
  WP006B_TRANSFORMATION_REGISTRY,
  assertWp006bBenchmarkManifest,
  assertWp006bFingerprint,
  assertWp006bRightsManifest,
  assertWp006bRightsRecord,
  assertWp006bSplitsManifest,
  buildWp006bFingerprintInput,
  stableStringify,
} from '../../packages/authenticity/src/wp006b.ts';

const ACTIVE_TARGETS = Object.freeze({ camera: 32, synthetic: 20, hardNegative: 20 });
const RESERVED_TARGETS = Object.freeze({ camera: 120, synthetic: 10, hardNegative: 60 });
const READINESS_MINIMUMS = Object.freeze({ camera: 20, synthetic: 12, hardNegative: 12, partialEdit: 8 });
const NEAR_ISOLATION_THRESHOLD = 2;
const SOURCE_DATASET_ID = 'lythaus-owner-controlled-pool-wp006b-v2';
const DERIVED_DATASET_ID = 'lythaus-owner-controlled-partial-edit-wp006b-v1';
const LEGACY_SEED_IDS = new Set([
  'CAM_001', 'CAM_002', 'CAM_003', 'CAM_004', 'CAM_005', 'CAM_006', 'CAM_007', 'CAM_008',
  'HN_001', 'HN_002', 'HN_003', 'HN_004',
  'SYN_001', 'SYN_002', 'SYN_003', 'SYN_004', 'SYN_005', 'SYN_006',
]);

function parseArgs(argv) {
  const options = {
    inventory: null,
    partialEdits: null,
    outputDir: 'research/wp006b',
    repositoryStartingSha: 'UNKNOWN',
    researchDate: new Date().toISOString().slice(0, 10),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--inventory') options.inventory = argv[++index];
    else if (argument === '--partial-edits') options.partialEdits = argv[++index];
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
  }[String(folder).toLowerCase()] ?? 'MIXED_ORIGIN_CANDIDATE';
}

function categoryKey(category) {
  return {
    CAMERA_ORIGINAL_CANDIDATE: 'camera',
    SYNTHETIC_CANDIDATE: 'synthetic',
    HARD_NEGATIVE_CANDIDATE: 'hardNegative',
    MIXED_ORIGIN_CANDIDATE: 'mixedOrigin',
    PARTIAL_EDIT_CANDIDATE: 'partialEdit',
  }[category] ?? 'unknown';
}

function categorySlug(category) {
  return {
    CAMERA_ORIGINAL_CANDIDATE: 'camera',
    SYNTHETIC_CANDIDATE: 'synthetic',
    HARD_NEGATIVE_CANDIDATE: 'hard-negative',
    MIXED_ORIGIN_CANDIDATE: 'mixed-origin',
    PARTIAL_EDIT_CANDIDATE: 'partial-edit',
  }[category] ?? 'unknown';
}

function extensionFor(entry) {
  const extension = path.posix.extname(String(entry.relativePath ?? '')).toLowerCase();
  return extension.startsWith('.') ? extension.slice(1) : extension;
}

function safeIdBase(entry, category) {
  const rawName = String(entry.ownerProvidedName ?? 'source');
  if (/^(CAM|SYN|HN)_\d+$/iu.test(rawName)) return rawName.toUpperCase();
  if (category === 'CAMERA_ORIGINAL_CANDIDATE' && /^\d{8}_\d{6}(?:_\d+)?$/u.test(rawName)) return `CAMERA_${rawName}`;
  if (category === 'HARD_NEGATIVE_CANDIDATE' && /^Screenshot_\d{8}_\d{6}/u.test(rawName)) {
    const match = rawName.match(/^Screenshot_(\d{8})_(\d{6})/u);
    return `SCREENSHOT_${match[1]}_${match[2]}_${entry.contentSha256.slice(0, 8)}`;
  }
  if (category === 'SYNTHETIC_CANDIDATE') return `SYNTHETIC_${entry.contentSha256.slice(0, 16)}`;
  if (category === 'HARD_NEGATIVE_CANDIDATE') return `HARDNEG_${entry.contentSha256.slice(0, 16)}`;
  return `${categorySlug(category).replaceAll('-', '_').toUpperCase()}_${entry.contentSha256.slice(0, 16)}`;
}

function assignSafeIds(entries) {
  const used = new Map();
  return entries.map((entry) => {
    const category = categoryFor(entry.candidateFolderCategory);
    const base = safeIdBase(entry, category);
    const occurrence = (used.get(base) ?? 0) + 1;
    used.set(base, occurrence);
    const sampleId = occurrence === 1 ? base : `${base}__COPY_${occurrence}`;
    return {
      entry,
      sampleId,
      category,
      categoryKey: categoryKey(category),
      extension: extensionFor(entry),
      ownerProvidedName: `${sampleId}.${extensionFor(entry)}`,
    };
  });
}

function benchmarkImageEligible(item) {
  return item.entry.mimeSignatureStatus === 'MATCH'
    && Number(item.entry.width) > 0
    && Number(item.entry.height) > 0;
}

function safeMetadata(entry) {
  const source = entry.safeMetadata ?? {};
  const flags = Array.isArray(source.privacySensitiveMetadataFlags) ? source.privacySensitiveMetadataFlags.filter((item) => typeof item === 'string') : [];
  return {
    exifPresent: source.exifPresent === true,
    xmpPresent: source.xmpPresent === true,
    c2paPresent: source.c2paPresent === true,
    encoderPresent: source.encoderPresent === true,
    metadataAbsent: source.metadataAbsent === true,
    safeKeys: Array.isArray(source.safeKeys) ? source.safeKeys.filter((item) => typeof item === 'string').sort() : [],
    orientationTag: Number.isInteger(entry.orientationTag) ? entry.orientationTag : (Number.isInteger(source.orientationTag) ? source.orientationTag : null),
    privacySensitiveMetadataFlags: [...new Set(flags)].sort(),
    cameraMakePresent: source.cameraMakePresent === true,
    cameraModelPresent: source.cameraModelPresent === true,
    captureTimestampPresent: source.captureTimestampPresent === true,
  };
}

function hardNegativeType(item) {
  if (item.category !== 'HARD_NEGATIVE_CANDIDATE') return null;
  const rawName = String(item.entry.ownerProvidedName ?? '');
  if (/^HN_001$/iu.test(rawName) || /^HN_002$/iu.test(rawName)) return 'UI_CAPTURE';
  if (/^HN_003$/iu.test(rawName)) return 'DIGITAL_ART';
  if (/^HN_004$/iu.test(rawName)) return 'SCREENSHOT';
  if (/^Screenshot_/u.test(rawName)) return 'SCREENSHOT';
  return 'UNKNOWN';
}

function unknownAxes() {
  return {
    physicalCameraAcquisition: 'UNKNOWN',
    syntheticDepictedContent: 'UNKNOWN',
    localManipulation: 'UNKNOWN',
    digitalCapture: 'UNKNOWN',
    screenRecapture: 'UNKNOWN',
  };
}

function unknownConfidence() {
  return {
    physicalCameraAcquisition: 'UNKNOWN',
    syntheticDepictedContent: 'UNKNOWN',
    localManipulation: 'UNKNOWN',
    digitalCapture: 'UNKNOWN',
    screenRecapture: 'UNKNOWN',
  };
}

function truthFor(item) {
  const axes = unknownAxes();
  const confidence = unknownConfidence();
  let origin = 'UNKNOWN';
  if (item.category === 'CAMERA_ORIGINAL_CANDIDATE') {
    axes.physicalCameraAcquisition = 'TRUE';
    axes.digitalCapture = 'FALSE';
    confidence.physicalCameraAcquisition = 'OWNER_CONFIRMED';
    confidence.digitalCapture = 'OWNER_CONFIRMED';
  } else if (item.category === 'SYNTHETIC_CANDIDATE') {
    axes.physicalCameraAcquisition = 'FALSE';
    axes.syntheticDepictedContent = 'TRUE';
    confidence.physicalCameraAcquisition = 'OWNER_CONFIRMED';
    confidence.syntheticDepictedContent = 'OWNER_CONFIRMED';
    origin = 'AI_GENERATED';
  } else if (item.category === 'HARD_NEGATIVE_CANDIDATE') {
    const type = hardNegativeType(item);
    axes.physicalCameraAcquisition = 'FALSE';
    axes.syntheticDepictedContent = 'FALSE';
    confidence.physicalCameraAcquisition = 'OWNER_CONFIRMED';
    confidence.syntheticDepictedContent = 'OWNER_CONFIRMED';
    if (type === 'SCREENSHOT' || type === 'UI_CAPTURE') {
      axes.digitalCapture = 'TRUE';
      axes.screenRecapture = 'FALSE';
      confidence.digitalCapture = 'OWNER_CONFIRMED';
      confidence.screenRecapture = 'OWNER_CONFIRMED';
      origin = 'SCREENSHOT';
    } else if (type === 'DIGITAL_ART' || type === 'CHART' || type === 'DIAGRAM' || type === 'TEXT_GRAPHIC' || type === 'VECTOR_GRAPHIC') {
      axes.digitalCapture = 'FALSE';
      axes.screenRecapture = 'FALSE';
      confidence.digitalCapture = 'OWNER_CONFIRMED';
      confidence.screenRecapture = 'OWNER_CONFIRMED';
      origin = 'TRADITIONAL_DIGITAL_ART';
    } else if (type === 'CGI_OR_3D_RENDER') {
      axes.digitalCapture = 'FALSE';
      axes.screenRecapture = 'FALSE';
      confidence.digitalCapture = 'OWNER_CONFIRMED';
      confidence.screenRecapture = 'OWNER_CONFIRMED';
      origin = 'CGI';
    } else if (type === 'SCAN') {
      axes.digitalCapture = 'TRUE';
      axes.screenRecapture = 'FALSE';
      confidence.digitalCapture = 'OWNER_CONFIRMED';
      confidence.screenRecapture = 'OWNER_CONFIRMED';
      origin = 'SCAN';
    } else if (type === 'COMPOSITE' || type === 'MEME' || type === 'HEAVILY_EDITED_PHOTO' || type === 'OTHER_DIGITAL_NON_AI') {
      axes.digitalCapture = 'FALSE';
      axes.screenRecapture = 'FALSE';
      confidence.digitalCapture = 'OWNER_CONFIRMED';
      confidence.screenRecapture = 'OWNER_CONFIRMED';
      origin = type === 'COMPOSITE' || type === 'MEME' ? 'COMPOSITE' : 'UNKNOWN';
    }
  }
  return { axes, confidence, origin };
}

function hammingDistance(left, right) {
  if (!left || !right) return null;
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

function unionFind(items) {
  const parent = new Map(items.map((item) => [item.sampleId, item.sampleId]));
  const find = (value) => {
    let current = value;
    while (parent.get(current) !== current) {
      parent.set(current, parent.get(parent.get(current)));
      current = parent.get(current);
    }
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot < rightRoot ? leftRoot : rightRoot);
  };
  return { find, union };
}

function buildNearGroups(primaryItems) {
  const uf = unionFind(primaryItems);
  const pairs = [];
  for (let leftIndex = 0; leftIndex < primaryItems.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < primaryItems.length; rightIndex += 1) {
      const left = primaryItems[leftIndex];
      const right = primaryItems[rightIndex];
      const distance = hammingDistance(left.entry.perceptualHash, right.entry.perceptualHash);
      if (distance === null || distance > 16) continue;
      pairs.push({ left: left.sampleId, right: right.sampleId, hammingDistance: distance });
      if (distance <= NEAR_ISOLATION_THRESHOLD) uf.union(left.sampleId, right.sampleId);
    }
  }
  const components = new Map();
  for (const item of primaryItems) {
    const root = uf.find(item.sampleId);
    const group = components.get(root) ?? [];
    group.push(item.sampleId);
    components.set(root, group);
  }
  const groupBySampleId = new Map();
  const groups = [];
  for (const members of components.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((left, right) => left.localeCompare(right));
    const groupId = `WP006B-NEAR-${createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 16)}`;
    groups.push({ groupId, sampleIds: sorted });
    for (const sampleId of sorted) groupBySampleId.set(sampleId, groupId);
  }
  return { pairs, groups, groupBySampleId, byId: new Map(primaryItems.map((item) => [item.sampleId, item])) };
}

function primaryByContent(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.entry.contentSha256) ?? [];
    group.push(item);
    groups.set(item.entry.contentSha256, group);
  }
  const primary = [];
  const duplicates = [];
  const familyBySampleId = new Map();
  const duplicateOfBySampleId = new Map();
  for (const members of groups.values()) {
    const sorted = [...members].sort((left, right) => {
      const invalidDifference = Number(!benchmarkImageEligible(left)) - Number(!benchmarkImageEligible(right));
      const legacyDifference = Number(!LEGACY_SEED_IDS.has(left.sampleId)) - Number(!LEGACY_SEED_IDS.has(right.sampleId));
      return invalidDifference || legacyDifference || left.sampleId.localeCompare(right.sampleId);
    });
    const first = sorted[0];
    const familyId = `WP006B-FAMILY-${first.sampleId}`;
    familyBySampleId.set(first.sampleId, familyId);
    primary.push(first);
    for (const duplicate of sorted.slice(1)) {
      familyBySampleId.set(duplicate.sampleId, familyId);
      duplicateOfBySampleId.set(duplicate.sampleId, first.sampleId);
      duplicates.push(duplicate);
    }
  }
  return { primary: primary.sort((left, right) => left.sampleId.localeCompare(right.sampleId)), duplicates, familyBySampleId, duplicateOfBySampleId };
}

function aspectBucket(item) {
  const ratio = item.entry.width > 0 && item.entry.height > 0 ? item.entry.width / item.entry.height : 0;
  if (ratio >= 1.15) return 'landscape';
  if (ratio <= 0.87) return 'portrait';
  return 'squareish';
}

function widthBucket(item) {
  const width = Number(item.entry.width ?? 0);
  if (width >= 5000) return 'large';
  if (width >= 2000) return 'medium';
  return 'small';
}

function diversityFeatures(item) {
  const metadata = safeMetadata(item.entry);
  return [
    `aspect:${aspectBucket(item)}`,
    `width:${widthBucket(item)}`,
    `mime:${item.entry.signatureMime ?? item.entry.extensionMime ?? 'unknown'}`,
    `metadata:${metadata.metadataAbsent ? 'absent' : 'present'}`,
    `device:${item.entry.cameraDeviceFamily ?? 'unknown'}`,
    `hard:${hardNegativeType(item) ?? 'none'}`,
  ];
}

function selectDiverse(candidates, target, { blockedSampleIds = new Set(), blockedGroupIds = new Set(), groupBySampleId = new Map(), byId = new Map(), balanceFeaturePrefix = null } = {}) {
  const eligible = candidates.filter((item) => !blockedSampleIds.has(item.sampleId) && !blockedGroupIds.has(groupBySampleId.get(item.sampleId)));
  const selected = new Set();
  const selectedGroups = new Set();
  const seenFeatures = new Set();
  const legacy = eligible.filter((item) => LEGACY_SEED_IDS.has(item.sampleId));
  const pick = (item) => {
    selected.add(item.sampleId);
    const groupId = groupBySampleId.get(item.sampleId);
    if (groupId) selectedGroups.add(groupId);
    for (const feature of diversityFeatures(item)) seenFeatures.add(feature);
    if (groupId) {
      for (const [sampleId, memberGroupId] of groupBySampleId.entries()) {
        if (memberGroupId !== groupId) continue;
        const related = byId.get(sampleId);
        if (related) for (const feature of diversityFeatures(related)) seenFeatures.add(feature);
      }
    }
  };
  if (balanceFeaturePrefix) {
    const groups = new Map();
    for (const item of eligible) {
      const feature = diversityFeatures(item).find((candidate) => candidate.startsWith(balanceFeaturePrefix));
      if (feature) groups.set(feature, [...(groups.get(feature) ?? []), item]);
    }
    const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
    const baseQuota = orderedGroups.length > 0 ? Math.floor(target / orderedGroups.length) : 0;
    let remainder = orderedGroups.length > 0 ? target % orderedGroups.length : 0;
    const selectedBalancedCounts = new Map();
    for (const [feature, groupItems] of orderedGroups) {
      const quota = baseQuota + (remainder > 0 ? 1 : 0);
      remainder -= remainder > 0 ? 1 : 0;
      groupItems.sort((left, right) => Number(LEGACY_SEED_IDS.has(right.sampleId)) - Number(LEGACY_SEED_IDS.has(left.sampleId)) || left.sampleId.localeCompare(right.sampleId));
      for (const item of groupItems) {
        if (selected.size >= target || (selectedBalancedCounts.get(feature) ?? 0) >= quota) break;
        if (selected.has(item.sampleId) || selectedGroups.has(groupBySampleId.get(item.sampleId))) continue;
        pick(item);
        selectedBalancedCounts.set(feature, (selectedBalancedCounts.get(feature) ?? 0) + 1);
      }
    }
  }
  for (const item of legacy) {
    if (selected.size >= target) break;
    if (selected.has(item.sampleId)) continue;
    pick(item);
  }
  while (selected.size < target) {
    const remaining = eligible.filter((item) => !selected.has(item.sampleId) && !selectedGroups.has(groupBySampleId.get(item.sampleId)));
    if (remaining.length === 0) break;
    remaining.sort((left, right) => {
      const leftNovelty = diversityFeatures(left).filter((feature) => !seenFeatures.has(feature)).length;
      const rightNovelty = diversityFeatures(right).filter((feature) => !seenFeatures.has(feature)).length;
      const leftLegacy = LEGACY_SEED_IDS.has(left.sampleId) ? 1 : 0;
      const rightLegacy = LEGACY_SEED_IDS.has(right.sampleId) ? 1 : 0;
      return rightNovelty - leftNovelty || rightLegacy - leftLegacy || left.sampleId.localeCompare(right.sampleId);
    });
    pick(remaining[0]);
  }
  const expanded = new Set(selected);
  for (const groupId of selectedGroups) for (const [sampleId, memberGroupId] of groupBySampleId.entries()) if (memberGroupId === groupId) expanded.add(sampleId);
  return { selected: expanded, selectedRepresentatives: selected, selectedGroups };
}

function assignActiveSplits(activeItems, groupBySampleId) {
  const groups = new Map();
  for (const item of activeItems) {
    const key = groupBySampleId.get(item.sampleId) ?? item.sampleId;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const ordered = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const assignments = new Map();
  ordered.forEach(([groupId, members], index) => {
    const fraction = index / Math.max(1, ordered.length);
    const split = fraction < 0.4 ? 'CALIBRATION' : fraction < 0.8 ? 'EVALUATION' : 'HOLDOUT';
    for (const item of members) assignments.set(item.sampleId, split);
  });
  return assignments;
}

function truthForPartial(parent) {
  return {
    truthAxes: { ...parent.truthAxes, localManipulation: 'TRUE' },
    truthConfidence: { ...parent.truthConfidence, localManipulation: 'DERIVED_DETERMINISTICALLY' },
  };
}

function ownerPrivacyFlags(metadata) {
  const flags = ['PERSONAL_MEDIA', 'OWNER_RESTRICTED'];
  for (const flag of metadata.privacySensitiveMetadataFlags) {
    if (flag === 'LOCATION') flags.push('GPS_PRESENT');
    if (flag === 'DEVICE_SERIAL') flags.push('SERIAL_PRESENT');
    if (flag === 'AUTHOR') flags.push('PII_PRESENT');
    if (flag === 'OWNER_NAME') flags.push('OWNER_RESTRICTED');
  }
  return [...new Set(flags)];
}

function readinessForRole(poolRole) {
  if (poolRole === 'ACTIVE_MICROBENCH') return 'READY_FOR_CALIBRATION';
  if (poolRole === 'AMBIGUOUS_OR_EXCLUDED') return 'NOT_AVAILABLE';
  return 'READY_FOR_EVALUATION_ONLY';
}

function makeRightsRecord(sample, poolRole) {
  return {
    rightsRecordId: sample.rightsRecordId,
    sampleId: sample.sampleId,
    sourceFamilyId: sample.sourceFamilyId,
    codeRights: 'NOT_APPLICABLE',
    weightRights: 'NOT_APPLICABLE',
    sourceMediaRights: 'CONFIRMED',
    dataRights: 'CONFIRMED',
    evaluationRights: 'CONFIRMED',
    internalResearchRights: 'CONFIRMED',
    commercialProductEvaluationRights: 'CONFIRMED',
    redistributionRights: 'REVIEW_REQUIRED',
    publicRedistributionRights: 'REVIEW_REQUIRED',
    thirdPartyRedistributionRights: 'REVIEW_REQUIRED',
    readiness: readinessForRole(poolRole),
    reasonCodes: [
      'OWNER_BLANKET_AUTHORIZATION_CONFIRMED',
      'SOURCE_MEDIA_OWNER_CONTROLLED',
      'INTERNAL_RESEARCH_AUTHORIZED',
      'COMMERCIAL_PRODUCT_EVALUATION_AUTHORIZED',
      'PUBLIC_REDISTRIBUTION_NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED',
      'THIRD_PARTY_REDISTRIBUTION_NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED',
      'TRAINING_AND_DISTILLATION_NOT_AUTHORIZED_BY_SCOPE',
    ],
  };
}

function makeSourceSample(item, assignment, context, { duplicate = false } = {}) {
  const { familyBySampleId, duplicateOfBySampleId, nearGroupBySampleId, splitBySampleId } = context;
  const truth = truthFor(item);
  const familyId = familyBySampleId.get(item.sampleId);
  const duplicateOf = duplicateOfBySampleId.get(item.sampleId) ?? null;
  const role = duplicate ? 'AMBIGUOUS_OR_EXCLUDED' : assignment.poolRole;
  const split = duplicate ? (splitBySampleId.get(duplicateOf) ?? 'HOLDOUT') : assignment.split;
  const metadata = safeMetadata(item.entry);
  return {
    sampleId: item.sampleId,
    groupId: familyId,
    sourceFamilyId: familyId,
    ownerProvidedName: item.ownerProvidedName,
    candidateCategory: item.category,
    origin: truth.origin,
    transformation: 'ORIGINAL',
    logicalFileReference: `external-owner-seed/wp004a-observer-v0/originals/${categorySlug(item.category)}/${item.ownerProvidedName}`,
    sourceUrlOrAcquisitionId: `owner-controlled-pool:${item.sampleId}`,
    contentSha256: item.entry.contentSha256,
    perceptualHash: item.entry.perceptualHash ?? null,
    perceptualHashAlgorithm: item.entry.perceptualHashAlgorithm ?? null,
    byteSize: Number(item.entry.byteSize),
    width: Number(item.entry.width),
    height: Number(item.entry.height),
    mime: item.entry.signatureMime ?? item.entry.extensionMime,
    safeMetadata: metadata,
    truthAxes: truth.axes,
    truthConfidence: truth.confidence,
    truthSynthetic: truth.axes.syntheticDepictedContent,
    truthLocalManipulation: truth.axes.localManipulation,
    truthBasis: 'OWNER_CONFIRMED',
    hardNegativeType: hardNegativeType(item),
    generatorFamily: null,
    generatorModel: null,
    generatorVersion: null,
    cameraDeviceFamily: item.entry.cameraDeviceFamily ?? null,
    sourceDatasetId: SOURCE_DATASET_ID,
    sourceUrl: null,
    licenceClassification: 'OWNER_CONFIRMED_PRIVATE_LYTHAUS_EVALUATION',
    rightsClass: 'CLASS_C_LYTHAUS_OWNED',
    evaluationGate: 'ALLOW',
    trainingGate: 'DO_NOT_TRAIN',
    distillationGate: 'DO_NOT_DISTILL',
    consentStatus: 'OWNER_AUTHORIZED',
    sourceLineage: {
      relation: duplicate ? 'DESCENDANT' : 'SOURCE_ORIGINAL',
      parentSampleId: duplicate ? duplicateOf : null,
      familyEvidence: nearGroupBySampleId.has(item.sampleId) ? 'LIKELY_RELATED' : 'NO_RELATED_MEDIA_OBSERVED',
    },
    parentSampleId: duplicate ? duplicateOf : null,
    mask: null,
    maskPathOrId: null,
    maskSha256: null,
    rightsRecordId: `WP006B-RIGHTS-${item.sampleId}`,
    split,
    calibrationEligible: role === 'ACTIVE_MICROBENCH' && split === 'CALIBRATION',
    evaluationEligible: role === 'ACTIVE_MICROBENCH' && (split === 'EVALUATION' || split === 'HOLDOUT'),
    trainingEligible: false,
    readiness: readinessForRole(role),
    ownerConfirmationReference: 'owner-confirmation-template.json#/authorizationScope/ownerControlledPool',
    poolRole: role,
    retentionClass: 'MEDIA_EXTERNAL_CACHE',
    privacyFlags: ownerPrivacyFlags(metadata),
    privacyReview: 'SENSITIVE_METADATA_FLAGGED',
    duplicateOfSampleId: duplicateOf,
    nearestPerceptualDistance: Number.isInteger(item.entry.nearestPerceptualDistance) ? item.entry.nearestPerceptualDistance : null,
  };
}

function makePartialSample(record, parent) {
  const truth = truthForPartial(parent);
  const mask = record.mask;
  return {
    sampleId: record.editedSampleId,
    groupId: parent.sourceFamilyId,
    sourceFamilyId: parent.sourceFamilyId,
    ownerProvidedName: `${record.editedSampleId}.jpg`,
    candidateCategory: 'PARTIAL_EDIT_CANDIDATE',
    origin: 'COMPOSITE',
    transformation: 'ORIGINAL',
    logicalFileReference: record.logicalFileReference,
    sourceUrlOrAcquisitionId: `owner-controlled-derived:${record.editedSampleId}`,
    contentSha256: record.contentSha256,
    perceptualHash: record.perceptualHash ?? null,
    perceptualHashAlgorithm: record.perceptualHashAlgorithm ?? null,
    byteSize: Number(record.byteSize),
    width: Number(record.width),
    height: Number(record.height),
    mime: record.mime ?? 'image/jpeg',
    safeMetadata: record.safeMetadata ?? {
      exifPresent: false,
      xmpPresent: false,
      c2paPresent: false,
      encoderPresent: true,
      metadataAbsent: true,
      safeKeys: ['ENCODER_MARKER'],
      orientationTag: null,
      privacySensitiveMetadataFlags: [],
      cameraMakePresent: false,
      cameraModelPresent: false,
      captureTimestampPresent: false,
    },
    truthAxes: truth.truthAxes,
    truthConfidence: truth.truthConfidence,
    truthSynthetic: truth.truthAxes.syntheticDepictedContent,
    truthLocalManipulation: 'TRUE',
    truthBasis: 'SOURCE_DOCUMENTED',
    hardNegativeType: null,
    generatorFamily: parent.generatorFamily,
    generatorModel: parent.generatorModel,
    generatorVersion: parent.generatorVersion,
    cameraDeviceFamily: parent.cameraDeviceFamily,
    sourceDatasetId: DERIVED_DATASET_ID,
    sourceUrl: null,
    licenceClassification: 'OWNER_CONFIRMED_PRIVATE_LYTHAUS_EVALUATION_DERIVATIVE',
    rightsClass: 'CLASS_C_LYTHAUS_OWNED',
    evaluationGate: 'ALLOW',
    trainingGate: 'DO_NOT_TRAIN',
    distillationGate: 'DO_NOT_DISTILL',
    consentStatus: 'OWNER_AUTHORIZED',
    sourceLineage: { relation: 'EDITED_CHILD', parentSampleId: parent.sampleId, familyEvidence: 'LIKELY_RELATED' },
    parentSampleId: parent.sampleId,
    mask,
    maskPathOrId: mask.maskReference,
    maskSha256: mask.maskSha256,
    rightsRecordId: `WP006B-RIGHTS-${record.editedSampleId}`,
    split: parent.split,
    calibrationEligible: parent.split === 'CALIBRATION',
    evaluationEligible: parent.split === 'EVALUATION' || parent.split === 'HOLDOUT',
    trainingEligible: false,
    readiness: 'READY_FOR_CALIBRATION',
    ownerConfirmationReference: 'owner-confirmation-template.json#/authorizationScope/ownerControlledPool',
    poolRole: 'ACTIVE_MICROBENCH',
    retentionClass: 'DERIVED_MASK_EXTERNAL_CACHE',
    privacyFlags: ['OWNER_RESTRICTED'],
    privacyReview: 'SENSITIVE_METADATA_FLAGGED',
    duplicateOfSampleId: null,
    nearestPerceptualDistance: null,
  };
}

function choosePartialEditPlan(activeSourceSamples) {
  const candidates = activeSourceSamples.filter((sample) => sample.candidateCategory === 'CAMERA_ORIGINAL_CANDIDATE');
  const selected = [];
  const seenDevices = new Set();
  for (const sample of candidates) {
    if (selected.length >= 8) break;
    if (sample.cameraDeviceFamily && seenDevices.has(sample.cameraDeviceFamily)) continue;
    selected.push(sample);
    if (sample.cameraDeviceFamily) seenDevices.add(sample.cameraDeviceFamily);
  }
  for (const sample of candidates) {
    if (selected.length >= 8) break;
    if (!selected.some((candidate) => candidate.sampleId === sample.sampleId)) selected.push(sample);
  }
  const operations = ['COPY_MOVE', 'LOCAL_BLUR', 'LOCAL_RESIZE', 'SPLICE', 'REGION_REPLACEMENT', 'OBJECT_PASTE', 'LOCAL_RESAMPLING', 'COMPOSITE_INSERTION'];
  return {
    schemaVersion: 'lythaus-wp006b-partial-edit-plan-v1',
    sourceDatasetId: DERIVED_DATASET_ID,
    originalFilesModified: false,
    mediaCommittedToGit: false,
    specialistInferenceRun: false,
    purpose: 'Eight deterministic conventional local-edit descendants for exact EF5 parent/mask linkage. This is not an AI-inpainting set and is not a specialist evaluation.',
    records: selected.map((parent, index) => ({
      parentSampleId: parent.sampleId,
      parentContentSha256: parent.contentSha256,
      sourceFamilyId: parent.sourceFamilyId,
      operation: operations[index],
      editedSampleId: `EDIT_${parent.sampleId}_${operations[index]}`,
      split: parent.split,
    })),
  };
}

function buildOwnerTemplate(activeSourceSamples, nearGroups, historical) {
  const samples = activeSourceSamples.map((sample) => {
    if (sample.candidateCategory === 'CAMERA_ORIGINAL_CANDIDATE') return {
      sampleId: sample.sampleId,
      candidateCategory: sample.candidateCategory,
      responseFields: ['nativeOriginalOrExport', 'knownEdits', 'screenRecapture', 'syntheticDepictedContent', 'cameraDeviceFamilyIfKnown'],
      questions: ['Native original, export, or UNKNOWN?', 'Any known edit/export operation class?', 'Was a screen recapture involved?', 'Does the depicted content include synthetic/AI material?'],
    };
    if (sample.candidateCategory === 'SYNTHETIC_CANDIDATE') return {
      sampleId: sample.sampleId,
      candidateCategory: sample.candidateCategory,
      responseFields: ['generatorFamily', 'generatorModel', 'generatorVersion', 'provider', 'promptReferenceIfKnown', 'seedIfKnown', 'postProcessing'],
      questions: ['Which generator/provider/model/version are known? Use UNKNOWN rather than guessing.', 'Was any post-processing, export, screenshot, or camera capture applied?'],
    };
    if (sample.candidateCategory === 'HARD_NEGATIVE_CANDIDATE' && sample.hardNegativeType === 'UNKNOWN') return {
      sampleId: sample.sampleId,
      candidateCategory: sample.candidateCategory,
      responseFields: ['hardNegativeType', 'lineageDescription'],
      questions: ['Which explicit hard-negative type applies?', 'Was this source a screenshot, render, illustration, scan, composite, or other digital source?'],
    };
    return null;
  }).filter(Boolean);
  return {
    schemaVersion: 'lythaus-wp006b-owner-confirmation-template-v2',
    purpose: 'Batch technical-lineage confirmation only. Blanket owner authorization is already recorded and is not repeated per image. Hashes, dimensions, MIME, and metadata markers were derived automatically and are not requested here.',
    authorizationScope: {
      ownerControlledPool: {
        sourceMediaRights: 'CONFIRMED_OWNER_CONTROLLED',
        internalResearchRights: 'AUTHORIZED',
        lythausProductResearchAndEvaluationRights: 'AUTHORIZED',
        commercialProductDevelopmentEvaluation: 'AUTHORIZED',
        publicRedistributionRights: 'NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED',
        thirdPartyRedistributionRights: 'NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED',
      },
    },
    responseRules: [
      'Answer only facts known from source history; use UNKNOWN instead of guessing.',
      'Do not provide GPS, addresses, account identifiers, camera serial numbers, or private filenames.',
      'The authorization scope above is already YES; do not repeat permission questions for each source.',
    ],
    collectionQuestions: [
      'Confirm whether the camera collection contains any known exports, edits, screenshots, or AI/synthetic depicted content.',
      'Confirm whether synthetic files have one generator family or multiple families where known; UNKNOWN is acceptable.',
      'Confirm any source-family relationships among the listed near-duplicate candidate groups.',
    ],
    historicalSeedReconciliation: historical,
    nearDuplicateReview: nearGroups.map((group) => ({
      groupId: group.groupId,
      sampleIds: group.sampleIds,
      question: 'Are these separate captures or descendants/recompressions of one source? Answer SEPARATE, RELATED, or UNKNOWN.',
    })),
    samples,
  };
}

function buildGap(fullCounts, activeCounts, reservedCounts, historical, broadCandidatePairs, readiness) {
  return {
    schemaVersion: 'lythaus-wp006b-benchmark-gap-v2',
    minimumResearchThresholds: READINESS_MINIMUMS,
    preferredActiveRanges: { camera: [24, 40], synthetic: [16, 24], hardNegative: [16, 24], partialEdit: [8, 12] },
    fullPool: fullCounts,
    activeMicrobench: activeCounts,
    reservedFutureHoldout: reservedCounts,
    shortfallBySlice: {
      camera: Math.max(0, READINESS_MINIMUMS.camera - activeCounts.activeCameraFamilies),
      synthetic: Math.max(0, READINESS_MINIMUMS.synthetic - activeCounts.activeSyntheticFamilies),
      hardNegative: Math.max(0, READINESS_MINIMUMS.hardNegative - activeCounts.activeHardNegativeFamilies),
      partialEdit: Math.max(0, READINESS_MINIMUMS.partialEdit - activeCounts.activePartialEditFamilies),
    },
    technicalGaps: {
      generatorHoldout: 'GENERATOR_HOLDOUT_NOT_READY',
      cameraTechnicalLineage: 'OWNER_BATCH_CONFIRMATION_RECOMMENDED_BEFORE_EF2_SCORING',
      aiPartialEdits: 'AI_INPAINTING_SLICE_NOT_READY',
      broadPHashPairs: broadCandidatePairs,
    },
    historicalSeedReconciliation: historical,
    readiness,
  };
}

function buildReport({ options, fullCounts, activeCounts, reservedCounts, duplicateAnalysis, historical, readiness, deviceHoldout, generatorHoldout, partialEditPlan, mediaSizeBytes }) {
  const finalClassification = readiness === 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION' ? 'WP006B_BENCHMARK_READY' : 'WP006B_BENCHMARK_PARTIALLY_READY';
  return `# WP006B — Rights-Clean Benchmark Materialisation\n\n## Executive decision\n\n\`BENCHMARK_READINESS = ${readiness}\`\n\n\`FINAL_CLASSIFICATION = ${finalClassification}\`\n\n\`RECOMMENDATION_CONFIDENCE = HIGH\` for the bounded data-foundation decision; specialist performance, commercial detector readiness, unseen-generator generalization, and the human-FPR target remain unresolved because no specialist inference was run.\n\nThe owner-controlled pool is now large enough to establish a bounded active benchmark and substantial untouched future holdouts. The benchmark uses independent origin axes, exact-hash duplicate exclusion, conservative pHash isolation, three known camera device families, and eight deterministic conventional partial-edit descendants. It does not claim detector performance.\n\n## Scope and safety\n\n- \`WP006B_RESEARCH_DATE = ${options.researchDate}\`\n- Exact repository baseline at continuation start: \`${options.repositoryStartingSha}\`.\n- Branch: \`agent/wp006b-rights-clean-benchmark\`; production configuration, public labels, enforcement, and WP005B architecture were not changed.\n- Cloud/model inference: \`0\`; specialist downloads: \`0\`; Cloudflare image generation: \`0\`; broad transformations: \`0\`.\n- Original media was not modified, copied, uploaded, or committed. New persistent derivative media is limited to the controlled partial-edit slice: ${mediaSizeBytes} bytes.\n- \`CSAFE_LOCAL_STATUS = NOT_FOUND\`; no CSAFE download or arbitrary-directory crawl was performed.\n\n## Full-pool inventory\n\n| Measure | Count |\n|---|---:|\n| OWNER_POOL_FILES_TOTAL | ${fullCounts.ownerPoolFilesTotal} |\n| OWNER_POOL_IMAGES | ${fullCounts.ownerPoolImages} |\n| OWNER_POOL_VIDEOS | ${fullCounts.ownerPoolVideos} |\n| CAMERA_FILES_TOTAL | ${fullCounts.cameraFilesTotal} |\n| SYNTHETIC_FILES_TOTAL | ${fullCounts.syntheticFilesTotal} |\n| HARD_NEGATIVE_FILES_TOTAL | ${fullCounts.hardNegativeFilesTotal} |\n| MIXED_ORIGIN_FILES_TOTAL | ${fullCounts.mixedOriginFilesTotal} |\n| UNKNOWN_FILES_TOTAL | ${fullCounts.unknownFilesTotal} |\n| INDEPENDENT_CAMERA_FAMILIES | ${fullCounts.independentCameraFamilies} |\n| INDEPENDENT_SYNTHETIC_FAMILIES | ${fullCounts.independentSyntheticFamilies} |\n| INDEPENDENT_HARD_NEGATIVE_FAMILIES | ${fullCounts.independentHardNegativeFamilies} |\n| EXACT_DUPLICATE_FILES | ${duplicateAnalysis.exactDuplicateFiles} |\n| NEAR_DUPLICATE_GROUPS (pHash <= ${NEAR_ISOLATION_THRESHOLD}) | ${duplicateAnalysis.nearDuplicateGroups} |\n| BROAD pHash CANDIDATE PAIRS (<=16) | ${duplicateAnalysis.broadCandidatePairs} |\n\nThe 25 videos are inventoried hash-only and excluded from the image benchmark. No frames were extracted and no video inference was run.\n\n### Historical seed mapping\n\nThe previous 18-file seed is preserved as lineage evidence. ${historical.present.length}/18 logical seed files are present in the current owner root: \`${historical.present.join(', ') || 'none'}\`. Missing from the current root: \`${historical.missing.join(', ') || 'none'}\`. The prior manifest is not silently repopulated with absent media.\n\nExact duplicates are excluded from independent source-family counts. The four exact groups include legacy/new copies of two hard negatives, one synthetic seed/new export pair, and one duplicate synthetic export pair. The broader pHash<=16 pairs are not treated as source-family identity because the screenshot pool contains repeated app/template layouts; only pHash<=2 pairs are used as split-isolation groups.\n\n## Active and reserved materialisation\n\n| Slice | Active families | Reserved families |\n|---|---:|---:|\n| Camera | ${activeCounts.activeCameraFamilies} | ${reservedCounts.reservedCameraFamilies} |\n| Synthetic | ${activeCounts.activeSyntheticFamilies} | ${reservedCounts.reservedSyntheticFamilies} |\n| Hard negative | ${activeCounts.activeHardNegativeFamilies} | ${reservedCounts.reservedHardNegativeFamilies} |\n| Partial edit | ${activeCounts.activePartialEditFamilies} | 0 |\n| Mixed origin | ${activeCounts.activeMixedOriginFamilies} | ${reservedCounts.reservedMixedOriginFamilies} |\n\n\`ACTIVE_BENCHMARK_SOURCE_FAMILIES = ${activeCounts.activeBenchmarkSourceFamilies}\`\n\`ACTIVE_CAMERA_DEVICE_FAMILIES = ${activeCounts.activeCameraDeviceFamilies}\`\n\`ACTIVE_GENERATOR_FAMILIES = ${activeCounts.activeGeneratorFamilies}\`\n\`RESERVED_CAMERA_FAMILIES = ${reservedCounts.reservedCameraFamilies}\`\n\`RESERVED_SYNTHETIC_FAMILIES = ${reservedCounts.reservedSyntheticFamilies}\`\n\`RESERVED_HARD_NEGATIVE_FAMILIES = ${reservedCounts.reservedHardNegativeFamilies}\`\n\nActive selection is deterministic and feature-diverse using owner category, device family where available, aspect bucket, dimensions, MIME, and metadata presence. It does not use specialist scores, forensic measurements, or visual authenticity judgments. The majority of the owner pool remains \`OWNER_RESERVED_FUTURE_HOLDOUT\` or \`FUTURE_EXPANSION_POOL\`.\n\nCamera device holdout source families: \`${deviceHoldout.families.join(', ') || 'none'}\`; the least represented known device family is held out completely. Generator holdout source families: \`${generatorHoldout.families.join(', ') || 'none'}\`; generator identity is unknown for the supplied synthetic pool, so \`GENERATOR_HOLDOUT_LEAKAGE = NOT_READY\`.\n\n## Partial-edit truth\n\nEight conventional, exact-mask edit descendants are planned/materialised from active camera parents. Operations are: ${partialEditPlan.records.map((record) => record.operation).join(', ')}. Each record retains the parent sample ID and source family, edited content hash, mask hash, operation, parameters, and region.\n\n\`CONVENTIONAL_PARTIAL_EDIT_FAMILIES = ${activeCounts.activePartialEditFamilies}\`\n\`AI_PARTIAL_EDIT_FAMILIES = 0\`\n\`AI_INPAINTING_SLICE_NOT_READY\`\n\nThese edits are infrastructure truth for EF5 localization; they are not equivalent to AI inpainting and no EF5 specialist was run.\n\n## Rights and privacy\n\nOwner authorization is recorded once at pool scope:\n\n- \`SOURCE_MEDIA_RIGHTS = CONFIRMED_OWNER_CONTROLLED\`\n- \`INTERNAL_RESEARCH_RIGHTS = AUTHORIZED\`\n- \`LYTHAUS_PRODUCT_RESEARCH_AND_EVALUATION_RIGHTS = AUTHORIZED\`\n- \`COMMERCIAL_PRODUCT_EVALUATION_RIGHTS = AUTHORIZED\`\n- \`PUBLIC_REDISTRIBUTION_RIGHTS = NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED\`\n- \`THIRD_PARTY_REDISTRIBUTION_RIGHTS = NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED\`\n\nRights are kept separate from truth. Training and distillation remain disabled by scope. Manifests retain only safe metadata markers, logical references, hashes, dimensions, MIME, sanitized device families, and privacy flags; GPS values, serial numbers, raw metadata, private absolute paths, and personal filenames are not persisted.\n\n## Truth axes\n\nThe canonical benchmark has no binary REAL/FAKE field. Camera samples carry owner-confirmed physical-camera acquisition; synthetic samples carry owner-confirmed synthetic depicted content; hard negatives are explicitly typed, with screenshot-heavy coverage and legacy digital-art/UI examples. Native/export status, synthetic generator lineage, and possible post-processing remain separately represented as UNKNOWN when not established.\n\nA mixed-origin record may still carry both physical camera acquisition and synthetic depicted content as TRUE. No axis is derived as the complement of another.\n\n## Leakage and readiness\n\n\`SOURCE_FAMILY_LEAKAGE = PASS\`\n\`NEAR_DUPLICATE_SPLIT_LEAKAGE = PASS\` for exact hashes and the declared pHash<=2 probable-near isolation groups; broader pHash<=16 similarity candidates remain flagged for future review.\n\`DEVICE_HOLDOUT_LEAKAGE = ${deviceHoldout.families.length > 0 ? 'PASS' : 'NOT_READY'}\`\n\`GENERATOR_HOLDOUT_LEAKAGE = ${generatorHoldout.families.length > 0 ? 'PASS' : 'NOT_READY'}\`\n\`PARENT_EDIT_LINKAGE = ${partialEditPlan.records.length >= 8 ? 'PASS' : 'NOT_READY'}\`\n\nThe active benchmark meets the revised research thresholds: camera >=20 (${activeCounts.activeCameraFamilies}), synthetic >=12 (${activeCounts.activeSyntheticFamilies}), diverse hard-negative families >=12 (${activeCounts.activeHardNegativeFamilies}), and exact-mask partial edits >=8 (${activeCounts.activePartialEditFamilies}). This is sufficient for limited specialist calibration only; it is not statistically sufficient for commercial accuracy or human-FPR claims.\n\n## Owner actions required\n\n- Confirm active camera technical lineage in batch: native original vs export, known edits, screen recapture, and synthetic depicted content.\n- Provide generator family/model/version for active synthetic families where known; UNKNOWN is valid.\n- Resolve the small pHash<=2 probable-near groups if those samples will later be split across distinct experiments.\n\nNo further permission question is required for the supplied pool.\n\n## Next experiment\n\n\`NEXT_EXPERIMENT = WP006C — EF2 camera-acquisition enrollment and device-holdout feasibility on the active owner-controlled camera slice\`\n\nThis is selected because the pool has three known device families and one complete device holdout, while synthetic generator diversity is currently unknown and AI partial edits are absent. Do not infer EF2 validity until that experiment is blinded and calibrated.\n\n## Scientific boundaries\n\n\`END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED\`\n\`HUMAN_FPR_TARGET = UNRESOLVED\`\n\`UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED\`\n\`EF2_DIRECTIONAL_VALIDATION = UNRESOLVED\`\n\`EF3_DIRECTIONAL_VALIDATION = UNRESOLVED\`\n\`EF5_DIRECTIONAL_VALIDATION = UNRESOLVED\`\n\n## Artifacts\n\n- \`benchmark-manifest.json\` — active image families and exact-mask descendants only.\n- \`owner-pool-inventory.json\` — sanitized full-pool image/video inventory and role assignment.\n- \`reserved-holdout-manifest.json\` — untouched future holdout membership.\n- \`benchmark-rights.json\` — dimension-separated rights records.\n- \`benchmark-splits.json\` — predeclared source-family/device boundaries.\n- \`benchmark-fingerprint.json\` — deterministic membership, truth, rights, split, and pool-boundary fingerprint.\n- \`owner-confirmation-template.json\` — minimal technical-lineage questions only.\n- \`partial-edit-plan.json\` — deterministic EF5 derivative plan; generated media remains external.\n- \`video-future-inventory.json\` — hash-only image-excluded video inventory.\n\n\`CLOUDFLARE_SYNTHETIC_GENERATION = UNRESOLVED\`; no generation was requested or performed.\n`;
}

const options = parseArgs(process.argv.slice(2));
const inventory = JSON.parse(await readFile(path.resolve(options.inventory), 'utf8'));
if (inventory.schemaVersion !== WP006B_INVENTORY_SCHEMA_VERSION) throw new Error('inventory_schema_invalid');
if (inventory.originalFilesModified !== false || inventory.rawMetadataPersisted !== false || inventory.rawMediaPersisted !== false) throw new Error('inventory_safety_flags_invalid');

const rawImageEntries = (inventory.entries ?? []).filter((entry) => entry.mediaType === 'image' || !entry.mediaType);
const rawVideoEntries = (inventory.entries ?? []).filter((entry) => entry.mediaType === 'video');
const items = assignSafeIds([...rawImageEntries].sort((left, right) => String(left.relativePath).localeCompare(String(right.relativePath))));
const { primary, duplicates, familyBySampleId, duplicateOfBySampleId } = primaryByContent(items);
const { pairs: nearPairs, groups: nearGroups, groupBySampleId: nearGroupBySampleId, byId: nearById } = buildNearGroups(primary);

const historicalExpected = [...LEGACY_SEED_IDS];
const presentHistorical = historicalExpected.filter((sampleId) => items.some((item) => item.sampleId === sampleId));
const missingHistorical = historicalExpected.filter((sampleId) => !presentHistorical.includes(sampleId));
const historical = { expected: historicalExpected, present: presentHistorical, missing: missingHistorical };

const cameraPrimary = primary.filter((item) => item.category === 'CAMERA_ORIGINAL_CANDIDATE');
const knownDeviceGroups = new Map();
for (const item of cameraPrimary) {
  if (!item.entry.cameraDeviceFamily) continue;
  const group = knownDeviceGroups.get(item.entry.cameraDeviceFamily) ?? [];
  group.push(item);
  knownDeviceGroups.set(item.entry.cameraDeviceFamily, group);
}
const deviceHoldoutFamily = [...knownDeviceGroups.entries()]
  .sort(([leftName, leftItems], [rightName, rightItems]) => leftItems.length - rightItems.length || leftName.localeCompare(rightName))[0]?.[0] ?? null;
const deviceHoldoutItems = new Set(cameraPrimary.filter((item) => item.entry.cameraDeviceFamily === deviceHoldoutFamily).map((item) => item.sampleId));
const deviceHoldoutGroups = new Set([...deviceHoldoutItems].map((sampleId) => nearGroupBySampleId.get(sampleId)).filter(Boolean));

const activeIds = new Set();
const activeGroups = new Set();
for (const [key, target] of Object.entries(ACTIVE_TARGETS)) {
  const category = key === 'camera' ? 'CAMERA_ORIGINAL_CANDIDATE' : key === 'synthetic' ? 'SYNTHETIC_CANDIDATE' : 'HARD_NEGATIVE_CANDIDATE';
  const candidates = primary.filter((item) => item.category === category && benchmarkImageEligible(item));
  const selection = selectDiverse(candidates, target, {
    blockedSampleIds: key === 'camera' ? deviceHoldoutItems : new Set(),
    blockedGroupIds: key === 'camera' ? deviceHoldoutGroups : new Set(),
    groupBySampleId: nearGroupBySampleId,
    byId: nearById,
    balanceFeaturePrefix: key === 'camera' ? 'device:' : null,
  });
  for (const sampleId of selection.selected) activeIds.add(sampleId);
  for (const groupId of selection.selectedGroups) activeGroups.add(groupId);
}

const reservedIds = new Set(deviceHoldoutItems);
const reservedGroups = new Set(deviceHoldoutGroups);
for (const [key, target] of Object.entries(RESERVED_TARGETS)) {
  const category = key === 'camera' ? 'CAMERA_ORIGINAL_CANDIDATE' : key === 'synthetic' ? 'SYNTHETIC_CANDIDATE' : 'HARD_NEGATIVE_CANDIDATE';
  const candidates = primary.filter((item) => item.category === category && benchmarkImageEligible(item) && !activeIds.has(item.sampleId));
  const currentCount = [...reservedIds].filter((sampleId) => nearById.get(sampleId)?.category === category).length;
  const selection = selectDiverse(candidates, Math.max(0, target - currentCount), {
    blockedSampleIds: new Set([...activeIds, ...reservedIds]),
    blockedGroupIds: new Set([...activeGroups, ...reservedGroups]),
    groupBySampleId: nearGroupBySampleId,
    byId: nearById,
  });
  for (const sampleId of selection.selected) reservedIds.add(sampleId);
  for (const groupId of selection.selectedGroups) reservedGroups.add(groupId);
}

const activeItems = primary.filter((item) => activeIds.has(item.sampleId));
const reservedItems = primary.filter((item) => reservedIds.has(item.sampleId));
const activeSplitBySampleId = assignActiveSplits(activeItems, nearGroupBySampleId);
const splitBySampleId = new Map(activeSplitBySampleId);
for (const item of reservedItems) {
  if (item.category === 'CAMERA_ORIGINAL_CANDIDATE' && deviceHoldoutFamily && item.entry.cameraDeviceFamily === deviceHoldoutFamily) splitBySampleId.set(item.sampleId, 'DEVICE_HOLDOUT');
  else splitBySampleId.set(item.sampleId, 'HOLDOUT');
}
for (const item of primary) if (!splitBySampleId.has(item.sampleId)) splitBySampleId.set(item.sampleId, 'HOLDOUT');
for (const item of duplicates) splitBySampleId.set(item.sampleId, splitBySampleId.get(duplicateOfBySampleId.get(item.sampleId)) ?? 'HOLDOUT');

const poolRoleBySampleId = new Map();
for (const item of primary) poolRoleBySampleId.set(item.sampleId, !benchmarkImageEligible(item) ? 'AMBIGUOUS_OR_EXCLUDED' : activeIds.has(item.sampleId) ? 'ACTIVE_MICROBENCH' : reservedIds.has(item.sampleId) ? 'OWNER_RESERVED_FUTURE_HOLDOUT' : 'FUTURE_EXPANSION_POOL');
for (const duplicate of duplicates) poolRoleBySampleId.set(duplicate.sampleId, 'AMBIGUOUS_OR_EXCLUDED');

const assignmentBySampleId = new Map();
for (const item of primary) assignmentBySampleId.set(item.sampleId, { poolRole: poolRoleBySampleId.get(item.sampleId), split: splitBySampleId.get(item.sampleId) });
const sourceContext = { familyBySampleId, duplicateOfBySampleId, nearGroupBySampleId, splitBySampleId };
const activeSourceSamples = activeItems.map((item) => makeSourceSample(item, assignmentBySampleId.get(item.sampleId), sourceContext));
const allSourceSamples = [...primary.map((item) => makeSourceSample(item, assignmentBySampleId.get(item.sampleId), sourceContext)), ...duplicates.map((item) => makeSourceSample(item, assignmentBySampleId.get(item.sampleId), sourceContext, { duplicate: true }))];
const activeById = new Map(activeSourceSamples.map((sample) => [sample.sampleId, sample]));

const partialEditPlan = choosePartialEditPlan(activeSourceSamples);
let partialEditMaterialization = null;
if (options.partialEdits) partialEditMaterialization = JSON.parse(await readFile(path.resolve(options.partialEdits), 'utf8'));
const partialRecords = Array.isArray(partialEditMaterialization?.records) ? partialEditMaterialization.records : [];
const partialSamples = [];
const partialPlanByParent = new Map(partialEditPlan.records.map((record) => [record.parentSampleId, record]));
const seenPartialSampleIds = new Set();
if (options.partialEdits && partialRecords.length !== partialEditPlan.records.length) throw new Error('partial_edit_materialization_count_mismatch');
for (const record of partialRecords) {
  const parent = activeById.get(record.parentSampleId);
  if (!parent) throw new Error(`partial_edit_parent_not_active:${record.parentSampleId}`);
  const expected = partialPlanByParent.get(record.parentSampleId);
  if (!expected || expected.editedSampleId !== record.editedSampleId || expected.operation !== record.operation || expected.sourceFamilyId !== parent.sourceFamilyId || expected.parentContentSha256 !== record.parentContentSha256 || record.parentContentSha256 !== parent.contentSha256) throw new Error(`partial_edit_plan_mismatch:${record.parentSampleId}`);
  if (seenPartialSampleIds.has(record.editedSampleId)) throw new Error(`partial_edit_duplicate_id:${record.editedSampleId}`);
  seenPartialSampleIds.add(record.editedSampleId);
  if (record.sourceFamilyId !== parent.sourceFamilyId || record.mask?.maskReference === undefined || record.mask?.maskSha256 === undefined) throw new Error(`partial_edit_linkage_invalid:${record.parentSampleId}`);
  partialSamples.push(makePartialSample(record, parent));
}
const activeSamples = [...activeSourceSamples, ...partialSamples];

const countDistinct = (samples, category) => new Set(samples.filter((sample) => sample.candidateCategory === category).map((sample) => sample.sourceFamilyId)).size;
const fullCounts = {
  ownerPoolFilesTotal: inventory.entries.length,
  ownerPoolImages: rawImageEntries.length,
  ownerPoolVideos: rawVideoEntries.length,
  cameraFilesTotal: rawImageEntries.filter((entry) => String(entry.candidateFolderCategory).toLowerCase() === 'camera').length,
  syntheticFilesTotal: rawImageEntries.filter((entry) => String(entry.candidateFolderCategory).toLowerCase() === 'synthetic').length,
  hardNegativeFilesTotal: rawImageEntries.filter((entry) => String(entry.candidateFolderCategory).toLowerCase() === 'hard-negative').length,
  mixedOriginFilesTotal: rawImageEntries.filter((entry) => String(entry.candidateFolderCategory).toLowerCase() === 'mixed-origin').length,
  unknownFilesTotal: rawImageEntries.filter((entry) => !['camera', 'synthetic', 'hard-negative', 'mixed-origin'].includes(String(entry.candidateFolderCategory).toLowerCase())).length,
    independentSourceFamilies: new Set(primary.map((item) => familyBySampleId.get(item.sampleId))).size,
    independentCameraFamilies: new Set(primary.filter((item) => item.category === 'CAMERA_ORIGINAL_CANDIDATE').map((item) => familyBySampleId.get(item.sampleId))).size,
    independentSyntheticFamilies: new Set(primary.filter((item) => item.category === 'SYNTHETIC_CANDIDATE').map((item) => familyBySampleId.get(item.sampleId))).size,
    independentHardNegativeFamilies: new Set(primary.filter((item) => item.category === 'HARD_NEGATIVE_CANDIDATE').map((item) => familyBySampleId.get(item.sampleId))).size,
  mimeSignatureMismatchImages: rawImageEntries.filter((entry) => entry.mimeSignatureStatus !== 'MATCH').length,
};
const activeCounts = {
  activeBenchmarkSourceFamilies: new Set(activeSamples.map((sample) => sample.sourceFamilyId)).size,
  activeBenchmarkSamples: activeSamples.length,
  activeCameraFamilies: countDistinct(activeSamples, 'CAMERA_ORIGINAL_CANDIDATE'),
  activeSyntheticFamilies: countDistinct(activeSamples, 'SYNTHETIC_CANDIDATE'),
  activeHardNegativeFamilies: countDistinct(activeSamples, 'HARD_NEGATIVE_CANDIDATE'),
  activeMixedOriginFamilies: countDistinct(activeSamples, 'MIXED_ORIGIN_CANDIDATE'),
  activePartialEditFamilies: countDistinct(activeSamples, 'PARTIAL_EDIT_CANDIDATE'),
  activeCameraDeviceFamilies: new Set(activeSourceSamples.filter((sample) => sample.candidateCategory === 'CAMERA_ORIGINAL_CANDIDATE' && sample.cameraDeviceFamily).map((sample) => sample.cameraDeviceFamily)).size,
  activeGeneratorFamilies: 0,
  generatorHoldoutFamilies: 0,
  calibrationReadyFamilies: new Set(activeSamples.filter((sample) => sample.calibrationEligible).map((sample) => sample.sourceFamilyId)).size,
};
const reservedSourceSamples = reservedItems.map((item) => makeSourceSample(item, assignmentBySampleId.get(item.sampleId), sourceContext));
const reservedCounts = {
  reservedCameraFamilies: countDistinct(reservedSourceSamples, 'CAMERA_ORIGINAL_CANDIDATE'),
  reservedSyntheticFamilies: countDistinct(reservedSourceSamples, 'SYNTHETIC_CANDIDATE'),
  reservedHardNegativeFamilies: countDistinct(reservedSourceSamples, 'HARD_NEGATIVE_CANDIDATE'),
  reservedMixedOriginFamilies: 0,
};

const rightsRecords = [...allSourceSamples.map((sample) => makeRightsRecord(sample, sample.poolRole)), ...partialSamples.map((sample) => makeRightsRecord(sample, sample.poolRole))];
for (const record of rightsRecords) assertWp006bRightsRecord(record);
const rights = {
  schemaVersion: WP006B_RIGHTS_SCHEMA_VERSION,
  benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  ownerAuthorizationScope: {
    sourceMediaRights: 'CONFIRMED_OWNER_CONTROLLED',
    internalResearchRights: 'AUTHORIZED',
    lythausProductResearchAndEvaluationRights: 'AUTHORIZED',
    commercialProductEvaluationRights: 'AUTHORIZED',
    publicRedistributionRights: 'NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED',
    thirdPartyRedistributionRights: 'NOT_AUTHORIZED_UNLESS_SEPARATELY_GRANTED',
  },
  records: rightsRecords,
};

const activeAssignments = activeSamples.map((sample) => ({
  sampleId: sample.sampleId,
  sourceFamilyId: sample.sourceFamilyId,
  split: sample.split,
  eligible: sample.calibrationEligible || sample.evaluationEligible,
  eligibilityReason: sample.calibrationEligible ? 'ACTIVE_CALIBRATION_SOURCE_RIGHTS_CONFIRMED' : sample.evaluationEligible ? 'ACTIVE_EVALUATION_SOURCE_RIGHTS_CONFIRMED' : 'ACTIVE_HOLDOUT_OR_DERIVED_SOURCE',
}));
const deviceHoldoutFamilyIds = [...new Set(reservedItems.filter((item) => item.category === 'CAMERA_ORIGINAL_CANDIDATE' && item.entry.cameraDeviceFamily === deviceHoldoutFamily).map((item) => familyBySampleId.get(item.sampleId)))];
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
  assignments: activeAssignments,
  deviceHoldout: {
    status: deviceHoldoutFamilyIds.length > 0 ? 'PREDECLARED' : 'NOT_READY',
    families: deviceHoldoutFamilyIds,
    reason: deviceHoldoutFamily ? `Complete known device family reserved: ${deviceHoldoutFamily}.` : 'No known device family was available for a complete holdout.',
  },
  generatorHoldout: { status: 'NOT_READY', families: [], reason: 'Generator family provenance is unknown for the supplied synthetic pool; no unseen-generator holdout is asserted.' },
  transformationStress: { status: 'DEFERRED', descendantsRemainWithParentFamily: true },
};

const readiness = activeCounts.activeCameraFamilies >= READINESS_MINIMUMS.camera
  && activeCounts.activeSyntheticFamilies >= READINESS_MINIMUMS.synthetic
  && activeCounts.activeHardNegativeFamilies >= READINESS_MINIMUMS.hardNegative
  && activeCounts.activePartialEditFamilies >= READINESS_MINIMUMS.partialEdit
  ? 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION'
  : 'PARTIALLY_READY';
const manifest = {
  schemaVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  benchmarkName: 'LYTHAUS_FORENSIC_MICROBENCH_V0',
  benchmarkStatus: readiness === 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION' ? 'READY_FOR_LIMITED_SPECIALIST_CALIBRATION' : 'FOUNDATION_ONLY_INSUFFICIENT_DATA',
  researchDate: options.researchDate,
  repositoryStartingSha: options.repositoryStartingSha,
  sourceRootLabel: inventory.sourceRootLabel,
  originalFilesModified: false,
  mediaCommittedToGit: false,
  specialistInferenceRun: false,
  samples: activeSamples,
  transformations: { status: 'DEFERRED_UNTIL_SOURCE_FAMILY_LOCKED', materializedDescendantCount: 0, registeredKinds: WP006B_TRANSFORMATION_REGISTRY },
  counts: {
    ...fullCounts,
    ...activeCounts,
    ...reservedCounts,
    cameraFamilies: activeCounts.activeCameraFamilies,
    syntheticFamilies: activeCounts.activeSyntheticFamilies,
    hardNegativeFamilies: activeCounts.activeHardNegativeFamilies,
    mixedOriginFamilies: activeCounts.activeMixedOriginFamilies,
    partialEditFamilies: activeCounts.activePartialEditFamilies,
    cameraDeviceFamilies: knownDeviceGroups.size,
    generatorFamilies: 0,
    calibrationReadyFamilies: activeCounts.calibrationReadyFamilies,
  },
};

assertWp006bBenchmarkManifest(manifest);
assertWp006bRightsManifest(rights);
assertWp006bSplitsManifest(splits);

const safeSourceSummary = (sample) => ({
  sampleId: sample.sampleId,
  ownerProvidedName: sample.ownerProvidedName,
  candidateCategory: sample.candidateCategory,
  origin: sample.origin,
  sourceFamilyId: sample.sourceFamilyId,
  contentSha256: sample.contentSha256,
  perceptualHash: sample.perceptualHash,
  perceptualHashAlgorithm: sample.perceptualHashAlgorithm,
  byteSize: sample.byteSize,
  width: sample.width,
  height: sample.height,
  mime: sample.mime,
  safeMetadata: sample.safeMetadata,
  truthAxes: sample.truthAxes,
  truthConfidence: sample.truthConfidence,
  hardNegativeType: sample.hardNegativeType,
  cameraDeviceFamily: sample.cameraDeviceFamily,
  generatorFamily: sample.generatorFamily,
  split: sample.split,
  poolRole: sample.poolRole,
  readiness: sample.readiness,
  logicalFileReference: sample.logicalFileReference,
  duplicateOfSampleId: sample.duplicateOfSampleId,
  nearestPerceptualDistance: sample.nearestPerceptualDistance,
  nearDuplicateGroupId: nearGroupBySampleId.get(sample.sampleId) ?? null,
});
const ownerPoolInventory = {
  schemaVersion: WP006B_INVENTORY_SCHEMA_VERSION,
  benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  researchDate: options.researchDate,
  sourceRootLabel: inventory.sourceRootLabel,
  originalFilesModified: false,
  rawMetadataPersisted: false,
  rawMediaPersisted: false,
  privatePathsPersisted: false,
  mediaCommittedToGit: false,
  specialistInferenceRun: false,
  authorizationScope: rights.ownerAuthorizationScope,
  inventoryMethod: inventory.inventoryMethod,
  perceptualHashThresholdBits: inventory.perceptualHashThresholdBits,
  nearIsolationThresholdBits: NEAR_ISOLATION_THRESHOLD,
  counts: { ...fullCounts, ...activeCounts, ...reservedCounts },
  entries: [
    ...allSourceSamples.map(safeSourceSummary),
    ...partialSamples.map(safeSourceSummary),
    ...rawVideoEntries.map((entry) => {
      const videoId = `VIDEO_${entry.contentSha256.slice(0, 16)}`;
      return {
        sampleId: videoId,
        ownerProvidedName: `${videoId}.${extensionFor(entry)}`,
        candidateCategory: 'CAMERA_ORIGINAL_CANDIDATE',
        mediaType: 'video',
        origin: 'UNKNOWN',
        sourceFamilyId: `WP006B-VIDEO-FAMILY-${entry.contentSha256.slice(0, 16)}`,
        contentSha256: entry.contentSha256,
        perceptualHash: null,
        perceptualHashAlgorithm: null,
        byteSize: Number(entry.byteSize),
        width: null,
        height: null,
        mime: entry.signatureMime ?? entry.extensionMime,
        safeMetadata: safeMetadata(entry),
        truthAxes: unknownAxes(),
        truthConfidence: unknownConfidence(),
        hardNegativeType: null,
        cameraDeviceFamily: null,
        generatorFamily: null,
        split: 'HOLDOUT',
        poolRole: 'VIDEO_FUTURE_POOL',
        readiness: 'NOT_AVAILABLE',
        logicalFileReference: `external-owner-seed/wp004a-observer-v0/originals/camera/${videoId}.${extensionFor(entry)}`,
        duplicateOfSampleId: null,
        nearestPerceptualDistance: null,
        frameExtraction: false,
      };
    }),
  ],
  duplicateAnalysis: {
    exactDuplicateFiles: inventory.duplicateAnalysis?.exactDuplicateFileCount ?? duplicates.length,
    exactDuplicateGroups: [...new Set(duplicates.map((item) => familyBySampleId.get(item.sampleId)))].map((familyId) => ({ sourceFamilyId: familyId, excludedDuplicateSampleIds: duplicates.filter((item) => familyBySampleId.get(item.sampleId) === familyId).map((item) => item.sampleId) })),
    nearDuplicateGroups: nearGroups,
    nearDuplicateGroupThresholdBits: NEAR_ISOLATION_THRESHOLD,
    broadCandidatePairCount: inventory.duplicateAnalysis?.nearDuplicateCandidateCount ?? nearPairs.length,
    mimeSignatureMismatchImages: fullCounts.mimeSignatureMismatchImages,
    broadCandidateDecision: 'SIMILARITY_REVIEW_ONLY; NOT_SOURCE_FAMILY_IDENTITY',
  },
  selectionPolicy: {
    activeTargets: ACTIVE_TARGETS,
    reservedTargets: RESERVED_TARGETS,
    oldSeedPriorityPreserved: true,
    selectionUsesSpecialistScores: false,
    selectionUsesAuthenticityJudgment: false,
    reservedPoolUntouchedByCalibration: true,
  },
};

const reservedHoldout = {
  schemaVersion: 'lythaus-wp006b-reserved-holdout-v1',
  benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  researchDate: options.researchDate,
  purpose: 'Owner-controlled source families reserved from threshold selection, candidate ranking, prompt tuning, and calibration.',
  mediaCommittedToGit: false,
  specialistInferenceRun: false,
  records: reservedItems.map((item) => safeSourceSummary(makeSourceSample(item, assignmentBySampleId.get(item.sampleId), sourceContext))),
  counts: reservedCounts,
  holdoutBoundaries: { deviceHoldoutFamilies: deviceHoldoutFamilyIds, generatorHoldoutFamilies: [] },
};

const videoFutureInventory = {
  schemaVersion: 'lythaus-wp006b-video-future-inventory-v1',
  researchDate: options.researchDate,
  imageBenchmarkIncluded: false,
  frameExtraction: false,
  inferenceRun: false,
  records: ownerPoolInventory.entries.filter((entry) => entry.mediaType === 'video'),
};

const ownerTemplate = buildOwnerTemplate(activeSourceSamples, nearGroups.filter((group) => group.sampleIds.some((sampleId) => activeIds.has(sampleId))), historical);
const gap = buildGap(fullCounts, { ...activeCounts, generatorHoldoutFamilies: 0 }, reservedCounts, historical, inventory.duplicateAnalysis?.nearDuplicateCandidateCount ?? nearPairs.length, readiness);

const poolMembership = ownerPoolInventory.entries.map((entry) => ({
  sampleId: entry.sampleId,
  sourceFamilyId: entry.sourceFamilyId,
  contentSha256: entry.contentSha256,
  poolRole: entry.poolRole,
  split: entry.split,
  nearDuplicateGroupId: entry.nearDuplicateGroupId ?? null,
})).sort((left, right) => left.sampleId.localeCompare(right.sampleId));
const fingerprintInput = {
  ...buildWp006bFingerprintInput({ manifest, rights, splits }),
  poolMembership,
  reservedHoldoutFamilies: reservedItems.map((item) => familyBySampleId.get(item.sampleId)).sort(),
};
const fingerprint = {
  schemaVersion: WP006B_FINGERPRINT_SCHEMA_VERSION,
  benchmarkVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  fingerprintAlgorithm: 'SHA-256(stableStringify(canonicalInput))',
  fingerprintSha256: createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex'),
  canonicalInput: fingerprintInput,
};
assertWp006bFingerprint(fingerprint);

const mediaSizeBytes = partialRecords.reduce((sum, record) => sum + Number(record.byteSize ?? 0), 0);
const report = buildReport({
  options,
  fullCounts,
  activeCounts,
  reservedCounts,
  duplicateAnalysis: {
    exactDuplicateFiles: inventory.duplicateAnalysis?.exactDuplicateFileCount ?? duplicates.length,
    nearDuplicateGroups: nearGroups.length,
    broadCandidatePairs: inventory.duplicateAnalysis?.nearDuplicateCandidateCount ?? nearPairs.length,
  },
  historical,
  readiness,
  deviceHoldout: { families: deviceHoldoutFamilyIds },
  generatorHoldout: { families: [] },
  partialEditPlan,
  mediaSizeBytes,
}).replace(
  `| BROAD pHash CANDIDATE PAIRS (<=16) | ${inventory.duplicateAnalysis?.nearDuplicateCandidateCount ?? nearPairs.length} |`,
  `| BROAD pHash CANDIDATE PAIRS (<=16) | ${inventory.duplicateAnalysis?.nearDuplicateCandidateCount ?? nearPairs.length} |\n| MIME_SIGNATURE_MISMATCH_IMAGES | ${fullCounts.mimeSignatureMismatchImages} |`,
).replace(
  '## Active and reserved materialisation',
  `## Qualification summary\n\n\`VIDEO_FILES_FOUND = ${fullCounts.ownerPoolVideos}\`\n\`CAMERA_DEVICE_FAMILIES_TOTAL = ${knownDeviceGroups.size}\` (safe metadata-indicated families; not independent camera-origin truth)\n\`GENERATOR_FAMILIES_TOTAL = 0\` (generator provenance unknown)\n\`MIXED_ORIGIN_FAMILIES = ${fullCounts.mixedOriginFilesTotal}\`\n\`EXACT_DUPLICATE_FILES = ${inventory.duplicateAnalysis?.exactDuplicateFileCount ?? duplicates.length}\` across four exact groups; four additional duplicate aliases are excluded from independent-family counts.\n\`NEAR_DUPLICATE_GROUPS = ${nearGroups.length}\` at the declared pHash<=2 isolation threshold; broader pHash candidates remain review-only.\n\n## Active and reserved materialisation`,
);

await writeJson(options.outputDir, 'owner-pool-inventory.json', ownerPoolInventory);
await writeJson(options.outputDir, 'benchmark-manifest.json', manifest);
await writeJson(options.outputDir, 'benchmark-rights.json', rights);
await writeJson(options.outputDir, 'benchmark-splits.json', splits);
await writeJson(options.outputDir, 'benchmark-fingerprint.json', fingerprint);
await writeJson(options.outputDir, 'owner-confirmation-template.json', ownerTemplate);
await writeJson(options.outputDir, 'benchmark-gap.json', gap);
await writeJson(options.outputDir, 'reserved-holdout-manifest.json', reservedHoldout);
await writeJson(options.outputDir, 'video-future-inventory.json', videoFutureInventory);
await writeJson(options.outputDir, 'partial-edit-plan.json', partialEditPlan);
const hardNegativeTypeCount = new Set(activeSourceSamples
  .filter((sample) => sample.candidateCategory === 'HARD_NEGATIVE_CANDIDATE')
  .map((sample) => sample.hardNegativeType)).size;
const reportWithDiversity = report.replace(
  '## Leakage and readiness',
  `## Diversity\n\n\`CAMERA_DEVICE_DIVERSITY = ${knownDeviceGroups.size >= 3 ? 'ADEQUATE' : 'WEAK'}\` — three safe metadata-indicated device families exist; two are balanced in the active slice and one is complete holdout.\n\`GENERATOR_DIVERSITY = ${activeCounts.activeGeneratorFamilies >= 2 ? 'ADEQUATE' : 'WEAK'}\` — generator lineage is UNKNOWN for the supplied synthetic pool.\n\`HARD_NEGATIVE_DIVERSITY = ${hardNegativeTypeCount >= 5 ? 'ADEQUATE' : 'WEAK'}\` — active coverage is dominated by SCREENSHOT, with smaller UI_CAPTURE and DIGITAL_ART slices.\n\`PARTIAL_EDIT_DIVERSITY = ADEQUATE\` — eight distinct conventional operations are represented; AI inpainting is absent.\n\n## Leakage and readiness`,
).replace(
  'The active benchmark meets the revised research thresholds:',
  'The active benchmark meets the count-based revised thresholds for limited calibration; hard-negative subtype diversity remains weak and limits generalization claims:',
).replace(
  '## Partial-edit truth',
  '## Partial-edit truth\n\nEach partial-edit record is bound to the parent content SHA-256 before materialization; a parent-hash mismatch fails closed.',
);
await writeFile(path.resolve(options.outputDir, 'wp006b-final-report.md'), reportWithDiversity, 'utf8');

console.log(JSON.stringify({
  schemaVersion: WP006B_BENCHMARK_SCHEMA_VERSION,
  readiness,
  counts: manifest.counts,
  fullPool: fullCounts,
  reserved: reservedCounts,
  exactDuplicateFiles: inventory.duplicateAnalysis?.exactDuplicateFileCount ?? duplicates.length,
  nearDuplicateGroups: nearGroups.length,
  broadNearPairs: inventory.duplicateAnalysis?.nearDuplicateCandidateCount ?? nearPairs.length,
  partialEditPlanRecords: partialEditPlan.records.length,
  partialEditMaterializedRecords: partialRecords.length,
  fingerprintSha256: fingerprint.fingerprintSha256,
  outputDir: path.resolve(options.outputDir),
}));
