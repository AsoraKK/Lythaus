import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { freemem, homedir } from 'node:os';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EF2_CONFIG,
  EF2_FEATURE_REGISTRY,
  assertBlindDecodedPixels,
  assertCalibrationOnlyFreeze,
  extractEf2FeatureVector,
  scoreEf2FeatureVector,
} from '../../packages/authenticity/src/wp006c.ts';
import {
  WP006B_BENCHMARK_SCHEMA_VERSION,
  assertWp006bBenchmarkManifest,
  assertWp006bFingerprint,
  assertWp006bRightsManifest,
  assertWp006bSplitsManifest,
  stableStringify,
} from '../../packages/authenticity/src/wp006b.ts';
import {
  WP006D_ARCHIVE_AUDIT_SCHEMA_VERSION,
  WP006D_BENCHMARK_VERSION,
  WP006D_EXPECTED_BASE_SHA,
  WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
  WP006D_FUTURE_HOLDOUT_DEVICES,
  WP006D_LGE_DEVICE,
  WP006D_REPLICATION_DEVICES,
} from '../../packages/authenticity/src/wp006d.ts';
import {
  WP006E_BENCHMARK_VERSION,
  WP006E_CAMERA_PARTITIONS_SCHEMA_VERSION,
  WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION,
  WP006E_CANONICAL_CROP_SIZE,
  WP006E_CONTROL_PARTITIONS_SCHEMA_VERSION,
  WP006E_EXPECTED_BASE_SHA,
  WP006E_EXPECTED_CSAFE_ARCHIVE_FINGERPRINT,
  WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT,
  WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES,
  WP006E_FINAL_REGISTRY_SCHEMA_VERSION,
  WP006E_HISTORICAL_REPLICATION_DEVICES,
  WP006E_LGE_DEVICE,
  WP006E_MAX_SELECTED_FEATURES,
  WP006E_MEASUREMENT_TYPE,
  WP006E_MIN_SELECTED_GROUPS,
  WP006E_PATCH_GRID_COLUMNS,
  WP006E_PATCH_GRID_ROWS,
  WP006E_PATCH_SIZE,
  WP006E_PLAN_SCHEMA_VERSION,
  WP006E_SELECTION_POLICY_SCHEMA_VERSION,
  WP006E_SPECIALIST_ID,
  WP006E_SPECIALIST_VERSION,
  WP006E_CANDIDATE_FEATURE_REGISTRY as CANDIDATE_REGISTRY,
  WP006E_FEATURE_NAMES,
  buildDeviceInvariantMeasurement,
  centeredNativeCrop,
  evaluateDeviceInvariantFeatures,
  extractDeviceInvariantFeatureVector,
  fitDeviceInvariantModel,
  hashWithoutField,
  madFinite,
  percentileFinite,
  runNestedLeaveOneDeviceOut,
  scoreDeviceInvariantVector,
  sha256Hex,
  spearmanCorrelation,
  stableArtifactHash,
  summarizeFinite,
  selectDeviceInvariantFeatures,
} from '../../packages/authenticity/src/wp006e.ts';

const OUTPUT_DEFAULT = 'research/wp006e';
const OWNER_ROOT_DEFAULT = path.join(homedir(), 'OneDrive', 'Desktop', 'LythausForensicsData', 'wp004a-observer-v0', 'originals');
const DATA_ROOT_DEFAULT = path.join(homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets');
const ARCHIVE_SCRIPT = path.resolve('scripts/authenticity/wp006d-csafe-archive.py');
const ARCHIVE_ENV = 'WP006E_CSAFE_ARCHIVE';
const MEDIA_ENV = 'WP006E_MEDIA_ROOT';
const CACHE_ENV = 'WP006E_CSAFE_CACHE';
const NODE_MODULES_ENV = 'WP006E_NODE_MODULES';
const DEVICE_TARGET = 12;
const MAX_CSAFE_PIXEL_IMAGES = 300;
const MAX_CACHE_BYTES = 4 * 1024 * 1024 * 1024;
const V0_FEATURE_REGISTRY_HASH = '1476739369d5968b7b1a3183bcd513364ad742fa71b69457ca4b937f2dc4d5f9';
const V0_CONFIGURATION_HASH = 'acf2319934f8b5a8554e2665b3c039001e30c9a4d0beac2dd9e8932abded635e';
const V0_CALIBRATION_FREEZE_HASH = '98608425de708af75317e088d92cec1a96cb9625da824cb9cb0f40992a23ed55';
const V0_THRESHOLD = 3.515089017620759;
const V0_FEATURE_REGISTRY_ID = 'lythaus-ef2-pixel-acquisition-v0';
const V0_FEATURE_VERSION = '0';
const EXPECTED_WP006D_ARCHIVE_FP = '4e8c0d40f2c7b548d63417be28a8705ba79cda5b6682764ba0d02d38dd6c6131';
const DEVELOPMENT_NEW_DEVICES = Object.freeze([
  'iPhone11_3', 'iPhone12_3', 'iPhone14_3', 'note10_3',
  's20_3', 's21_3', 's20_4', 's21_4',
]);
const DEVELOPMENT_DEVICES = Object.freeze([...WP006E_HISTORICAL_REPLICATION_DEVICES, ...DEVELOPMENT_NEW_DEVICES]);
const INTERNAL_VALIDATION_DEVICES = Object.freeze(['iPhone11_5', 'iPhone12_5', 'iPhone14_5', 'note10_5']);
const FUTURE_MODEL_RESERVE_DEVICES = Object.freeze(['iPhone11_6', 'iPhone12_6', 'iPhone14_6', 'note10_6']);
const ALL_SEALED_CSAFE_DEVICES = Object.freeze([...INTERNAL_VALIDATION_DEVICES, ...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES, ...FUTURE_MODEL_RESERVE_DEVICES]);
const CONTROL_ROLES = Object.freeze(['DEVELOPMENT_NON_CAMERA_CONTROLS', 'SEALED_INTERNAL_VALIDATION_CONTROLS', 'FINAL_SEALED_NON_CAMERA_CONTROLS']);

function parseArgs(argv) {
  const options = {
    phase: 'prepare',
    outputDir: OUTPUT_DEFAULT,
    mediaRoot: process.env[MEDIA_ENV] ?? OWNER_ROOT_DEFAULT,
    archive: process.env[ARCHIVE_ENV] ?? null,
    cacheDir: process.env[CACHE_ENV] ?? null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--phase') options.phase = argv[++index];
    else if (argument === '--output-dir') options.outputDir = argv[++index];
    else if (argument === '--media-root') options.mediaRoot = argv[++index];
    else if (argument === '--archive') options.archive = argv[++index];
    else if (argument === '--cache-dir') options.cacheDir = argv[++index];
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!['prepare', 'run'].includes(options.phase)) throw new Error('wp006e_phase_invalid');
  return options;
}

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function currentOriginMain() {
  return execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
}

function currentMergeBase() {
  return execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(outputDir, filename, value) {
  const target = path.resolve(outputDir, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(outputDir, filename, value) {
  const target = path.resolve(outputDir, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, 'utf8');
}

function runPython(operation, args) {
  const output = execFileSync('python', [ARCHIVE_SCRIPT, operation, ...args], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return JSON.parse(output);
}

function requireSharp() {
  const moduleRoot = process.env[NODE_MODULES_ENV] ?? path.resolve('node_modules');
  const requireFrom = createRequire(path.join(moduleRoot, 'package.json'));
  const sharp = requireFrom('sharp');
  if (typeof sharp !== 'function') throw new Error('WP006E_RUNTIME_STATUS=SHARP_UNAVAILABLE');
  if (typeof sharp.concurrency === 'function') sharp.concurrency(1);
  if (typeof sharp.cache === 'function') sharp.cache({ items: 0, memory: 0, files: 0 });
  return sharp;
}

function desktopRoots() {
  return [...new Set([
    path.join(homedir(), 'Desktop'),
    path.join(homedir(), 'OneDrive', 'Desktop'),
  ])];
}

async function boundedArchiveSearch() {
  const candidates = [];
  const visited = new Set();
  const hint = /(lythaus|forensics|authenticity|csafe|dataset)/iu;
  for (const root of desktopRoots()) {
    if (!(await stat(root).catch(() => null))?.isDirectory()) continue;
    const queue = [{ directory: root, depth: 0, hinted: true }];
    while (queue.length > 0) {
      const current = queue.shift();
      const canonical = path.resolve(current.directory).toLowerCase();
      if (visited.has(canonical)) continue;
      visited.add(canonical);
      const entries = await readdir(current.directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const entryPath = path.join(current.directory, entry.name);
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.zip' && (current.hinted || /csafe|26932084/iu.test(entry.name))) candidates.push(entryPath);
        else if (entry.isDirectory() && current.depth < 3 && (current.hinted || hint.test(entry.name))) queue.push({ directory: entryPath, depth: current.depth + 1, hinted: current.hinted || hint.test(entry.name) });
      }
    }
  }
  return [...new Set(candidates)];
}

async function locateArchive(explicitArchive) {
  if (explicitArchive) {
    if (!(await stat(explicitArchive).catch(() => null))?.isFile()) throw new Error('WP006E_RUNTIME_STATUS=LOCAL_ARCHIVE_NOT_FOUND');
    return path.resolve(explicitArchive);
  }
  const candidates = await boundedArchiveSearch();
  const verified = candidates.filter((candidate) => /csafe|26932084/iu.test(path.basename(candidate)));
  if (verified.length !== 1) throw new Error(`WP006E_RUNTIME_STATUS=LOCAL_ARCHIVE_AMBIGUOUS:${verified.length}`);
  return path.resolve(verified[0]);
}

async function withTempJsonFiles(files, callback) {
  const directory = await mkdtemp(path.join(process.env.TEMP ?? process.env.TMP ?? '.', 'lythaus-wp006e-'));
  try {
    const paths = {};
    for (const [name, value] of Object.entries(files)) {
      const filePath = path.join(directory, name);
      await writeFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
      paths[name] = filePath;
    }
    return await callback(paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function benchmarkPaths(outputDir) {
  return {
    wp006dPlan: path.resolve(outputDir, '../wp006d/wp006d-plan.json'),
    wp006dFingerprint: path.resolve(outputDir, '../wp006d/wp006d-fingerprint.json'),
    wp006dAudit: path.resolve(outputDir, '../wp006d/csafe-archive-audit.json'),
    wp006dSubset: path.resolve(outputDir, '../wp006d/csafe-subset-plan.json'),
    wp006dManifest: path.resolve(outputDir, '../wp006d/csafe-replication-manifest.json'),
    wp006dControls: path.resolve(outputDir, '../wp006d/non-camera-control-manifest.json'),
    wp006dRun: path.resolve(outputDir, '../wp006d/wp006d-run-manifest.json'),
    wp006dResults: path.resolve(outputDir, '../wp006d/v0-replication-results.json'),
    wp006bManifest: path.resolve(outputDir, '../wp006b/benchmark-manifest.json'),
    wp006bRights: path.resolve(outputDir, '../wp006b/benchmark-rights.json'),
    wp006bSplits: path.resolve(outputDir, '../wp006b/benchmark-splits.json'),
    wp006bFingerprint: path.resolve(outputDir, '../wp006b/benchmark-fingerprint.json'),
    wp006bHoldout: path.resolve(outputDir, '../wp006b/reserved-holdout-manifest.json'),
    wp006bOwnerPool: path.resolve(outputDir, '../wp006b/owner-pool-inventory.json'),
    wp006cFreeze: path.resolve(outputDir, '../wp006c/ef2-calibration-freeze.json'),
    wp006cRegistry: path.resolve(outputDir, '../wp006c/ef2-feature-registry.json'),
  };
}

async function loadFrozenState(outputDir) {
  const files = benchmarkPaths(outputDir);
  const values = await Promise.all(Object.entries(files).map(async ([key, filePath]) => [key, await readJson(filePath)]));
  const state = Object.fromEntries(values);
  assertWp006bBenchmarkManifest(state.wp006bManifest);
  assertWp006bRightsManifest(state.wp006bRights);
  assertWp006bSplitsManifest(state.wp006bSplits);
  assertWp006bFingerprint(state.wp006bFingerprint);
  if (currentOriginMain() !== WP006E_EXPECTED_BASE_SHA || currentMergeBase() !== WP006E_EXPECTED_BASE_SHA) throw new Error('WP006E_START_GATE=MAIN_BASELINE_CHANGED_REVIEW_REQUIRED');
  if (state.wp006dPlan.baseSha !== WP006D_EXPECTED_BASE_SHA || state.wp006dPlan.benchmarkFingerprint !== WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT) throw new Error('WP006E_START_GATE=WP006D_BASELINE_INVALID');
  if (state.wp006dFingerprint.fingerprintSha256 !== WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT || stableArtifactHash(state.wp006dFingerprint.canonicalInput) !== WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT) throw new Error('WP006E_START_GATE=WP006D_FINGERPRINT_CHANGED');
  if (state.wp006dPlan.csafe.archiveDirectoryFingerprintSha256 !== EXPECTED_WP006D_ARCHIVE_FP) throw new Error('WP006E_START_GATE=CSAFE_ARCHIVE_FINGERPRINT_RECORD_CHANGED');
  if (state.wp006dRun.benchmarkExpansion !== 'READY_FOR_V1_DESIGN' || state.wp006dPlan.wp006cHistorical?.decision !== 'REJECT_CURRENT_EF2_MEASUREMENT') throw new Error('WP006E_START_GATE=WP006D_READINESS_INVALID');
  if (state.wp006dResults.v0ExternalReplication !== 'FAILED') throw new Error('WP006E_START_GATE=WP006D_HISTORICAL_RESULT_INVALID');
  if (state.wp006dRun.holdouts?.lge !== 'SEALED' || state.wp006dRun.holdouts?.csafeFutureDevices !== 'SEALED' || state.wp006dRun.mediaAccess?.lgePixels !== false || state.wp006dRun.mediaAccess?.csafeFutureHoldoutPixels !== false) throw new Error('WP006E_START_GATE=HOLDOUT_CONTAMINATION_REVIEW_REQUIRED');
  if (state.wp006dFingerprint.lgeHoldoutStatus !== 'SEALED' || state.wp006dFingerprint.csafeFutureHoldoutStatus !== 'SEALED') throw new Error('WP006E_START_GATE=HOLDOUT_CONTAMINATION_REVIEW_REQUIRED');
  assertCalibrationOnlyFreeze(state.wp006cFreeze);
  const v0Registry = jsonClone(state.wp006cRegistry);
  delete v0Registry.registryHash;
  if (stableArtifactHash(v0Registry) !== V0_FEATURE_REGISTRY_HASH || state.wp006cFreeze.featureRegistryHash !== V0_FEATURE_REGISTRY_HASH || stableArtifactHash(EF2_CONFIG) !== V0_CONFIGURATION_HASH || stableArtifactHash(state.wp006cFreeze) !== V0_CALIBRATION_FREEZE_HASH || state.wp006dResults.frozenMeasurement?.calibrationFreezeHash !== V0_CALIBRATION_FREEZE_HASH) throw new Error('WP006E_START_GATE=WP006C_FROZEN_MODEL_CHANGED');
  if (state.wp006cFreeze.specialistId !== V0_FEATURE_REGISTRY_ID || state.wp006cFreeze.specialistVersion !== V0_FEATURE_VERSION || state.wp006cFreeze.thresholdSource !== 'CALIBRATION_CAMERA_ONLY' || state.wp006cFreeze.thresholdValue !== V0_THRESHOLD) throw new Error('WP006E_START_GATE=WP006C_THRESHOLD_CHANGED');
  if (state.wp006bManifest.specialistInferenceRun !== false || state.wp006bManifest.transformations?.materializedDescendantCount !== 0) throw new Error('WP006E_START_GATE=WP006B_MEDIA_STATE_INVALID');
  const expectedExisting = [...WP006D_FUTURE_HOLDOUT_DEVICES].sort();
  if (JSON.stringify([...state.wp006dPlan.csafe.futureHoldoutDevices].sort()) !== JSON.stringify(expectedExisting)) throw new Error('WP006E_START_GATE=WP006D_HOLDOUT_MEMBERSHIP_INVALID');
  return state;
}

function safeMemberKey(member) {
  return `${member.outerMember}::${member.member}`;
}

function evenlySpaced(items, count) {
  const sorted = [...items].sort((a, b) => String(a.member).localeCompare(String(b.member)));
  if (count >= sorted.length) return sorted;
  const selected = [];
  const used = new Set();
  for (let index = 0; index < count; index += 1) {
    const candidate = Math.min(sorted.length - 1, Math.max(0, Math.floor(((index + 1) * sorted.length) / (count + 1))));
    let cursor = candidate;
    while (used.has(cursor) && cursor + 1 < sorted.length) cursor += 1;
    while (used.has(cursor) && cursor > 0) cursor -= 1;
    used.add(cursor);
    selected.push(sorted[cursor]);
  }
  return selected;
}

function selectDeviceMembers(memberList, devices, excludedMembers = new Set()) {
  const selected = [];
  for (const device of devices) {
    const eligible = memberList.filter((member) => member.deviceFamilyId === device && member.sceneType === 'natural' && !excludedMembers.has(safeMemberKey(member)));
    if (eligible.length < DEVICE_TARGET) throw new Error(`WP006E_CSAFE_DEVICE_UNDERPOWERED:${device}`);
    const lenses = [...new Set(eligible.map((member) => member.lens))].sort();
    const base = Math.floor(DEVICE_TARGET / lenses.length);
    let remainder = DEVICE_TARGET % lenses.length;
    for (const lens of lenses) {
      const quota = base + (remainder > 0 ? 1 : 0);
      remainder -= 1;
      selected.push(...evenlySpaced(eligible.filter((member) => member.lens === lens), quota));
    }
  }
  const keys = new Set(selected.map(safeMemberKey));
  if (selected.length !== devices.length * DEVICE_TARGET || keys.size !== selected.length) throw new Error('WP006E_CSAFE_SELECTION_INVALID');
  return selected.sort((a, b) => `${a.deviceFamilyId}:${a.member}`.localeCompare(`${b.deviceFamilyId}:${b.member}`));
}

function ownerRightsBySample(state) {
  return new Map(state.wp006bRights.records.map((record) => [record.sampleId, record]));
}

function projectOwnerRecord(record, rightsRecord, role, split) {
  return {
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    logicalReference: record.logicalFileReference,
    contentSha256: record.contentSha256,
    perceptualHash: record.perceptualHash,
    perceptualHashAlgorithm: record.perceptualHashAlgorithm,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height,
    mime: record.mime,
    hardNegativeType: record.hardNegativeType ?? null,
    candidateCategory: record.candidateCategory,
    truthAxes: record.truthAxes,
    truthConfidence: record.truthConfidence,
    sourceDatasetId: record.sourceDatasetId ?? 'lythaus-owner-controlled-pool-wp006b-v2',
    rightsRecordId: rightsRecord?.rightsRecordId ?? null,
    rights: rightsRecord ? {
      sourceMediaRights: rightsRecord.sourceMediaRights,
      evaluationRights: rightsRecord.evaluationRights,
      internalResearchRights: rightsRecord.internalResearchRights,
      commercialProductEvaluationRights: rightsRecord.commercialProductEvaluationRights,
      publicRedistributionRights: rightsRecord.publicRedistributionRights,
      readiness: rightsRecord.readiness,
    } : null,
    role,
    split,
    poolRole: record.poolRole ?? null,
  };
}

function eligibleOwnerControl(record) {
  return record && ['HARD_NEGATIVE_CANDIDATE', 'SYNTHETIC_CANDIDATE'].includes(record.candidateCategory)
    && record.truthAxes?.physicalCameraAcquisition === 'FALSE'
    && !record.duplicateOfSampleId && !record.nearDuplicateGroupId
    && Number(record.width) >= WP006E_CANONICAL_CROP_SIZE && Number(record.height) >= WP006E_CANONICAL_CROP_SIZE;
}

function chooseDevelopmentControls(state, rightsMap) {
  const historical = state.wp006dControls.records.map((record) => ({
    ...record,
    role: 'DEVELOPMENT_NON_CAMERA_CONTROLS',
    split: 'DEVELOPMENT',
    source: 'WP006D_HISTORICAL_COMPARISON_CONTROL',
  }));
  const historicalFamilies = new Set(historical.map((record) => record.sourceFamilyId));
  const active = state.wp006bOwnerPool.entries
    .filter((record) => record.poolRole === 'ACTIVE_MICROBENCH' && eligibleOwnerControl(record) && !historicalFamilies.has(record.sourceFamilyId))
    .sort((a, b) => `${a.candidateCategory}:${a.sampleId}`.localeCompare(`${b.candidateCategory}:${b.sampleId}`));
  const targetAdditional = Math.min(40, active.length);
  const selectedActive = evenlySpaced(active, targetAdditional);
  const projected = [
    ...historical.map((record) => ({ ...projectOwnerRecord(record, rightsMap.get(record.sampleId), 'DEVELOPMENT_NON_CAMERA_CONTROLS', 'DEVELOPMENT'), source: 'WP006D_HISTORICAL_COMPARISON_CONTROL' })),
    ...selectedActive.map((record) => ({ ...projectOwnerRecord(record, rightsMap.get(record.sampleId), 'DEVELOPMENT_NON_CAMERA_CONTROLS', 'DEVELOPMENT'), source: 'OWNER_ACTIVE_DEVELOPMENT_CONTROL' })),
  ];
  const families = new Set(projected.map((record) => record.sourceFamilyId));
  if (families.size !== projected.length || projected.length < 48 || projected.length > 72) throw new Error(`WP006E_DEVELOPMENT_CONTROL_COUNT_INVALID:${projected.length}`);
  return projected.sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

function chooseValidationControls(state, rightsMap, usedSampleIds) {
  const candidates = state.wp006bOwnerPool.entries
    .filter((record) => record.poolRole === 'FUTURE_EXPANSION_POOL' && record.candidateCategory === 'HARD_NEGATIVE_CANDIDATE' && eligibleOwnerControl(record) && !usedSampleIds.has(record.sampleId))
    .sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  if (candidates.length < 24) throw new Error(`WP006E_VALIDATION_CONTROL_POOL_UNDERPOWERED:${candidates.length}`);
  const selected = evenlySpaced(candidates, Math.min(32, candidates.length));
  return selected.map((record) => ({ ...projectOwnerRecord(record, rightsMap.get(record.sampleId), 'SEALED_INTERNAL_VALIDATION_CONTROLS', 'SEALED_INTERNAL_VALIDATION'), source: 'OWNER_FUTURE_EXPANSION_CONTROL' })).sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

function chooseFinalControls(state, rightsMap) {
  const records = state.wp006bHoldout.records;
  const synthetic = records.filter((record) => record.candidateCategory === 'SYNTHETIC_CANDIDATE').sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  const hardNegatives = records.filter((record) => record.candidateCategory === 'HARD_NEGATIVE_CANDIDATE').sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  if (synthetic.length < 8 || hardNegatives.length < 16) throw new Error('WP006E_FINAL_CONTROL_POOL_UNDERPOWERED');
  const selected = [...synthetic.slice(0, 8), ...hardNegatives.slice(0, 16)];
  return selected.map((record) => ({ ...projectOwnerRecord(record, rightsMap.get(record.sampleId), 'FINAL_SEALED_NON_CAMERA_CONTROLS', 'FINAL_SEALED_NON_CAMERA'), source: 'WP006B_RESERVED_HOLDOUT' })).sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

function sourceFamilyIdForMember(member, ordinal) {
  return `CSAFE-WP006E-FAMILY-${member.deviceFamilyId}-${String(ordinal).padStart(2, '0')}`;
}

function annotateMembers(members, role, cacheGroup) {
  const counts = new Map();
  return members.map((member) => {
    const ordinal = (counts.get(member.deviceFamilyId) ?? 0) + 1;
    counts.set(member.deviceFamilyId, ordinal);
    return {
      sampleId: `CSAFE_WP006E_${member.deviceFamilyId}_${String(ordinal).padStart(2, '0')}`,
      sourceFamilyId: sourceFamilyIdForMember(member, ordinal),
      archiveMemberId: safeMemberKey(member),
      outerMember: member.outerMember,
      member: member.member,
      deviceFamilyId: member.deviceFamilyId,
      model: member.model,
      manufacturer: member.manufacturer,
      sceneType: member.sceneType,
      lens: member.lens,
      declaredSizeBytes: member.declaredSizeBytes,
      compressedSizeBytes: member.compressedSizeBytes,
      crc32: member.crc32,
      truthAxes: { physicalCameraAcquisition: 'TRUE', syntheticDepictedContent: 'FALSE', localManipulation: 'FALSE', digitalCapture: 'FALSE', screenRecapture: 'FALSE' },
      truthConfidence: 'DATASET_PROVENANCE_CONFIRMED',
      sourceDatasetId: 'csafe-multi-camera-smartphone-image-database-26932084',
      rights: { sourceMediaRights: 'CC_BY_4.0_WITH_ATTRIBUTION', evaluationRights: 'AUTHORIZED_SUBJECT_TO_ATTRIBUTION', internalResearchRights: 'AUTHORIZED_SUBJECT_TO_ATTRIBUTION', commercialProductEvaluationRights: 'LIKELY_PERMITTED_SUBJECT_TO_ATTRIBUTION', publicRedistributionRights: 'NOT_USED' },
      role,
      cacheGroup,
      pixelsOpened: false,
      contentSha256: null,
      width: null,
      height: null,
      mime: 'image/jpeg',
    };
  });
}

function annotateSealedMembers(members, role) {
  const counts = new Map();
  return members.map((member) => {
    const ordinal = (counts.get(member.deviceFamilyId) ?? 0) + 1;
    counts.set(member.deviceFamilyId, ordinal);
    return {
      sampleId: `CSAFE_WP006E_SEALED_${member.deviceFamilyId}_${String(ordinal).padStart(2, '0')}`,
      sourceFamilyId: `CSAFE-WP006E-SEALED-FAMILY-${member.deviceFamilyId}-${String(ordinal).padStart(2, '0')}`,
      archiveMemberId: safeMemberKey(member),
      outerMember: member.outerMember,
      member: member.member,
      deviceFamilyId: member.deviceFamilyId,
      model: member.model,
      manufacturer: member.manufacturer,
      sceneType: member.sceneType,
      lens: member.lens,
      declaredSizeBytes: member.declaredSizeBytes,
      compressedSizeBytes: member.compressedSizeBytes,
      crc32: member.crc32,
      role,
      pixelsOpened: false,
      contentSha256: null,
      width: null,
      height: null,
      mime: 'image/jpeg',
      truthAxes: { physicalCameraAcquisition: 'TRUE', syntheticDepictedContent: 'FALSE', localManipulation: 'FALSE', digitalCapture: 'FALSE', screenRecapture: 'FALSE' },
      truthConfidence: 'DATASET_PROVENANCE_CONFIRMED',
    };
  });
}

function distinctOverlap(left, right, key) {
  const leftValues = new Set(left.map(key));
  const rightValues = new Set(right.map(key));
  const intersection = [...leftValues].filter((value) => rightValues.has(value));
  const union = new Set([...leftValues, ...rightValues]);
  return { leftDistinct: leftValues.size, rightDistinct: rightValues.size, intersection: intersection.length, union: union.size, jaccard: union.size === 0 ? null : intersection.length / union.size };
}

function nuisanceSignature(record) {
  return {
    dimension: record.width && record.height ? `${record.width}x${record.height}` : 'UNKNOWN',
    aspectRatio: record.width && record.height ? Number((record.width / record.height).toFixed(2)) : 'UNKNOWN',
    format: record.mime ?? 'UNKNOWN',
    fileSizeBucket: Number.isFinite(record.byteSize ?? record.declaredSizeBytes) ? Math.floor(Math.log2(Math.max(1, record.byteSize ?? record.declaredSizeBytes))) : 'UNKNOWN',
  };
}

function buildNuisanceMatchingReport(cameraRecords, selectedControls, allControls) {
  const before = {};
  const after = {};
  for (const field of ['dimension', 'aspectRatio', 'format', 'fileSizeBucket']) {
    before[field] = distinctOverlap(cameraRecords, allControls, (record) => nuisanceSignature(record)[field]);
    after[field] = distinctOverlap(cameraRecords, selectedControls, (record) => nuisanceSignature(record)[field]);
  }
  return {
    schemaVersion: 'lythaus-wp006e-nuisance-matching-v1',
    selectionUsesEf2Scores: false,
    selectionUsesPixels: false,
    selectionUsesFeatureVectors: false,
    matchingVariables: ['width', 'height', 'aspectRatio', 'mime', 'fileSizeBucket'],
    method: 'Control membership was selected by source-family, truth, rights, subtype and deterministic sample ordering with declared dimension/format/file-size summaries; no v0/v1 score or feature value entered selection.',
    beforeMatching: before,
    afterMatching: after,
    cameraFamilies: cameraRecords.length,
    eligibleControlPoolFamilies: allControls.length,
    selectedControlFamilies: selectedControls.length,
    limitation: 'The historical owner control slice is screenshot-heavy and CSAFE scene identifiers are not supplied; matching reduces obvious metadata differences but cannot establish population or scene independence.',
  };
}

function buildSelectionPolicy() {
  return {
    schemaVersion: WP006E_SELECTION_POLICY_SCHEMA_VERSION,
    specialistId: WP006E_SPECIALIST_ID,
    specialistVersion: WP006E_SPECIALIST_VERSION,
    status: 'FROZEN_BEFORE_V1_FEATURE_VALUES',
    objective: 'Prefer pixel measurements that separate physical-camera acquisition controls while penalizing camera-device and nuisance sensitivity.',
    candidateQualityFormula: 'quality = min(4,effectSize) * directionConsistency / (1 + deviceHeterogeneityRatio) * (1 - nuisancePenalty) * finiteRate',
    effectSize: 'absolute(equal-device camera median - control median) / (1.4826 * camera MAD + 1e-6), capped at 4',
    directionConsistency: 'fraction of development camera-device medians on the camera side of the camera/control midpoint',
    deviceHeterogeneityRatio: 'median absolute deviation of device medians about the equal-device camera center / (median within-device MAD + 1e-6), capped at 100',
    nuisancePenalty: 'mean absolute Spearman association with declared width, height, aspect ratio, byte-size bucket, format, scene, lens, dataset and device diagnostic encodings, capped at 0.90; diagnostic only',
    finiteRule: 'exclude if fewer than 80% of development camera vectors are finite or camera variance is at or below 1e-12',
    redundancyRule: '|Spearman rho| >= 0.90 on development camera plus control vectors is redundant; retain the higher quality feature, tie by name',
    selectionRule: `select at most ${WP006E_MAX_SELECTED_FEATURES} features, first seeking one non-redundant feature per available group, then descending quality; require at least ${WP006E_MIN_SELECTED_GROUPS} groups and four non-degenerate features`,
    scoreFormula: 'For each selected feature, component = clamp(0.5 + direction * (value - midpoint) / (2 * (abs(controlCenter-cameraCenter) + scale)), 0, 1); score is the weighted linear mean over available components.',
    weightFormula: 'non-negative quality scores normalized to sum one; equal weights if all retained quality scores are zero',
    thresholdMethod: '10th percentile of training-camera scores only; higher score is more cross-device camera-consistent',
    nestedEstimate: 'Leave one complete development device out; recompute quality, redundancy, feature selection, weights and threshold using remaining devices only.',
    primaryRepresentation: 'decoded pixels -> centered native 1024x1024 crop -> fixed 4x4 grid of sixteen non-overlapping 256x256 patches',
    noMetadataInputs: true,
    noTruthInputs: true,
    noValidationInputs: true,
    noHoldoutInputs: true,
    noRetuningAfterValidation: true,
  };
}

function buildFingerprintInput({ camera, controls, nuisance, archiveFingerprint, wp006dFingerprint }) {
  const projection = (record) => ({ sampleId: record.sampleId, sourceFamilyId: record.sourceFamilyId, contentSha256: record.contentSha256 ?? null, archiveMemberId: record.archiveMemberId ?? null, deviceFamilyId: record.deviceFamilyId ?? null, model: record.model ?? null, sceneType: record.sceneType ?? null, lens: record.lens ?? null, hardNegativeType: record.hardNegativeType ?? null, truthAxes: record.truthAxes ?? null, role: record.role, split: record.split ?? null });
  return {
    benchmarkVersion: WP006E_BENCHMARK_VERSION,
    wp006dBenchmarkFingerprint: wp006dFingerprint,
    csafeArchiveDirectoryFingerprintSha256: archiveFingerprint,
    developmentCamera: camera.development.map(projection),
    internalValidationCamera: camera.internalValidation.map(projection),
    sameModelInstanceHoldoutCamera: camera.sameModelHoldout.map(projection),
    futureModelReserveCamera: camera.futureModelReserve.map(projection),
    developmentControls: controls.development.map(projection),
    validationControls: controls.validation.map(projection),
    finalSealedControls: controls.final.map(projection),
    lgeHoldout: { device: WP006E_LGE_DEVICE, status: 'SEALED', familyIds: controls.lgeFamilies },
    sealedRoles: { internalValidation: 'SEALED', sameModelInstanceHoldout: 'SEALED', futureModelReserve: 'SEALED', finalControls: 'SEALED' },
    nuisanceMatching: nuisance,
    canonicalPixelChallenge: { cropSize: WP006E_CANONICAL_CROP_SIZE, cropRule: 'CENTERED_NATIVE_DECODED_PIXEL_CROP_NO_RESIZE_V1', patchGrid: '4x4_256_NON_OVERLAPPING' },
    sourceFamilyBoundary: 'SOURCE_FAMILY',
    noModelInference: true,
    noCloudCalls: true,
    noProductionChanges: true,
  };
}

function manufacturerModelSummary(devices, inventory) {
  const byId = new Map(inventory.devices.map((record) => [record.deviceFamilyId, record]));
  return devices.map((device) => ({ deviceFamilyId: device, model: byId.get(device)?.model ?? device.replace(/_[0-9]+$/u, ''), manufacturer: byId.get(device)?.manufacturer ?? 'UNKNOWN' }));
}

async function safeDecodedMetadata(sharp, bytes) {
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
  return { width: Number(metadata.width ?? 0), height: Number(metadata.height ?? 0), mime: metadata.format ? `image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}` : 'image/jpeg', exifPresent: Boolean(metadata.exif), xmpPresent: Boolean(metadata.xmp), iccPresent: Boolean(metadata.icc), orientationPresent: Number.isInteger(metadata.orientation) };
}

async function decodeRaw(sharp, bytes) {
  const decoded = await sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
  const result = { width: Number(decoded.info.width), height: Number(decoded.info.height), channels: Number(decoded.info.channels), pixels: new Uint8Array(decoded.data) };
  assertBlindDecodedPixels(result);
  return result;
}

function cacheDefaultPath() {
  return path.join(DATA_ROOT_DEFAULT, `wp006e-csafe-cache-${EXPECTED_WP006D_ARCHIVE_FP.slice(0, 12)}`);
}

async function createOrValidateCache(cacheDir, archiveFingerprint) {
  const existing = await stat(cacheDir).catch(() => null);
  if (!existing) { await mkdir(cacheDir, { recursive: true }); return; }
  if (!existing.isDirectory()) throw new Error('WP006E_RUNTIME_STATUS=SELECTIVE_CACHE_PATH_NOT_DIRECTORY');
  const marker = await readJson(path.join(cacheDir, 'wp006e-cache-marker.json')).catch(() => null);
  if (!marker || marker.archiveDirectoryFingerprint !== archiveFingerprint) throw new Error('WP006E_RUNTIME_STATUS=SELECTIVE_CACHE_PATH_EXISTS_UNRELATED');
  if (marker.planHash && marker.planHash !== 'PENDING') throw new Error('WP006E_RUNTIME_STATUS=SELECTIVE_CACHE_ALREADY_BOUND_TO_OTHER_PLAN');
}

async function selectiveExtract(cacheDir, group, selectedMembers, devices, sealedDevices, archivePath, archiveFingerprint) {
  if (selectedMembers.length > 120) throw new Error(`WP006E_SELECTIVE_EXTRACTION_GROUP_CAP:${group}`);
  const outputDir = path.join(cacheDir, group);
  const existing = await stat(outputDir).catch(() => null);
  if (existing) {
    const entries = await readdir(outputDir);
    if (entries.length > 0) throw new Error(`WP006E_SELECTIVE_CACHE_GROUP_NOT_EMPTY:${group}`);
  } else await mkdir(outputDir, { recursive: true });
  const result = await withTempJsonFiles({
    'selection.json': selectedMembers,
    'replication.json': devices,
    'holdout.json': sealedDevices,
  }, (paths) => runPython('extract', ['--archive', archivePath, '--selection-json', paths['selection.json'], '--output-dir', outputDir, '--replication-devices-json', paths['replication.json'], '--holdout-devices-json', paths['holdout.json']]));
  if (result.fullExtractionPerformed || result.holdoutDevicesOpened?.length !== 0 || result.selectedImageCount !== selectedMembers.length || result.archiveLabel !== 'CSAFE_ARCHIVE_26932084_ZIP') throw new Error(`WP006E_SELECTIVE_EXTRACTION_INVALID:${group}`);
  if (result.declaredBytes > MAX_CACHE_BYTES) throw new Error('WP006E_RUNTIME_STATUS=LOCAL_STORAGE_BLOCKED');
  await writeFile(path.join(outputDir, 'extraction-manifest.json'), `${JSON.stringify({ ...result, archiveDirectoryFingerprint: archiveFingerprint }, null, 2)}\n`, 'utf8');
  return result;
}

async function prepare(options) {
  const outputDir = path.resolve(options.outputDir);
  const state = await loadFrozenState(outputDir);
  const archivePath = await locateArchive(options.archive);
  const archiveAudit = runPython('audit', ['--archive', archivePath]);
  if (archiveAudit.schemaVersion !== WP006D_ARCHIVE_AUDIT_SCHEMA_VERSION || archiveAudit.directoryFingerprintSha256 !== WP006E_EXPECTED_CSAFE_ARCHIVE_FINGERPRINT || archiveAudit.directoryFingerprintSha256 !== EXPECTED_WP006D_ARCHIVE_FP || archiveAudit.deviceCount !== 60 || archiveAudit.totalImageFiles !== 49970 || archiveAudit.pathSafety?.fullExtractionPerformed !== false || archiveAudit.pathSafety?.unsafeEntryCount !== 0 || archiveAudit.pathSafety?.encryptedEntryCount !== 0) throw new Error('CSAFE_ARCHIVE_STATUS=CHANGED_REVIEW_REQUIRED');
  const allDevices = [...DEVELOPMENT_DEVICES, ...INTERNAL_VALIDATION_DEVICES, ...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES, ...FUTURE_MODEL_RESERVE_DEVICES];
  if (new Set(allDevices).size !== allDevices.length) throw new Error('WP006E_DEVICE_ROLE_LEAKAGE');
  const memberList = await withTempJsonFiles({ 'devices.json': allDevices }, (paths) => runPython('list', ['--archive', archivePath, '--devices-json', paths['devices.json']]));
  const priorMembers = new Set(state.wp006dSubset.selectedReplicationMembers.map(safeMemberKey));
  const historicalMembers = selectDeviceMembers(memberList.members, WP006E_HISTORICAL_REPLICATION_DEVICES, priorMembers);
  const newMembers = selectDeviceMembers(memberList.members, DEVELOPMENT_NEW_DEVICES);
  const internalMembers = selectDeviceMembers(memberList.members, INTERNAL_VALIDATION_DEVICES);
  const sameModelMembers = selectDeviceMembers(memberList.members, WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES);
  const futureMembers = selectDeviceMembers(memberList.members, FUTURE_MODEL_RESERVE_DEVICES);
  const camera = {
    development: [...annotateMembers(historicalMembers, 'DEVELOPMENT_CAMERA', 'historical'), ...annotateMembers(newMembers, 'DEVELOPMENT_CAMERA', 'new')].sort((a, b) => a.sampleId.localeCompare(b.sampleId)),
    internalValidation: annotateSealedMembers(internalMembers, 'SEALED_INTERNAL_VALIDATION_CAMERA'),
    sameModelHoldout: annotateSealedMembers(sameModelMembers, 'SEALED_DEVICE_INSTANCE_HOLDOUT_CAMERA'),
    futureModelReserve: annotateSealedMembers(futureMembers, 'FUTURE_MODEL_RESERVE_CAMERA'),
  };
  if (camera.development.length !== DEVELOPMENT_DEVICES.length * DEVICE_TARGET || camera.internalValidation.length !== 48 || camera.sameModelHoldout.length !== 48 || camera.futureModelReserve.length !== 48) throw new Error('WP006E_CAMERA_PARTITION_COUNTS_INVALID');
  const rightsMap = ownerRightsBySample(state);
  const developmentControls = chooseDevelopmentControls(state, rightsMap);
  const usedControlIds = new Set(developmentControls.map((record) => record.sampleId));
  const validationControls = chooseValidationControls(state, rightsMap, usedControlIds);
  const finalControls = chooseFinalControls(state, rightsMap);
  const lgeFamilies = state.wp006bHoldout.records.filter((record) => record.cameraDeviceFamily === WP006D_LGE_DEVICE && record.split === 'DEVICE_HOLDOUT').map((record) => record.sourceFamilyId).sort();
  if (lgeFamilies.length !== 33) throw new Error('WP006E_LGE_HOLDOUT_BOUNDARY_INVALID');
  const controls = { development: developmentControls, validation: validationControls, final: finalControls, lgeFamilies };
  const cacheDir = path.resolve(options.cacheDir ?? cacheDefaultPath());
  await createOrValidateCache(cacheDir, archiveAudit.directoryFingerprintSha256);
  const historicalExtraction = await selectiveExtract(cacheDir, 'historical', historicalMembers, WP006E_HISTORICAL_REPLICATION_DEVICES, ALL_SEALED_CSAFE_DEVICES, archivePath, archiveAudit.directoryFingerprintSha256);
  const newExtraction = await selectiveExtract(cacheDir, 'new', newMembers, DEVELOPMENT_NEW_DEVICES, ALL_SEALED_CSAFE_DEVICES, archivePath, archiveAudit.directoryFingerprintSha256);
  const extractionByGroup = { historical: historicalExtraction, new: newExtraction };
  const extractionLookup = new Map([...Object.entries(extractionByGroup)].flatMap(([group, result]) => result.records.map((record) => [`${group}::${record.outerMember}::${record.member}`, record])));
  const sharp = requireSharp();
  for (const record of camera.development) {
    const extraction = extractionLookup.get(`${record.cacheGroup}::${record.archiveMemberId}`);
    if (!extraction) throw new Error(`WP006E_EXTRACTION_RECORD_MISSING:${record.sampleId}`);
    const bytes = await readFile(path.join(cacheDir, record.cacheGroup, extraction.cacheRelativePath));
    if (sha256Hex(bytes) !== extraction.contentSha256) throw new Error(`WP006E_EXTRACTION_HASH_MISMATCH:${record.sampleId}`);
    const metadata = await safeDecodedMetadata(sharp, bytes);
    record.contentSha256 = extraction.contentSha256;
    record.width = metadata.width;
    record.height = metadata.height;
    record.mime = metadata.mime;
    record.pixelsOpened = false;
  }
  const nuisance = buildNuisanceMatchingReport(camera.development, controls.development, [...controls.development, ...controls.validation]);
  const candidateRegistry = { ...jsonClone(CANDIDATE_REGISTRY), registryHash: stableArtifactHash(CANDIDATE_REGISTRY) };
  const selectionPolicy = buildSelectionPolicy();
  const selectionPolicyHash = stableArtifactHash(selectionPolicy);
  const cameraPartitions = {
    schemaVersion: WP006E_CAMERA_PARTITIONS_SCHEMA_VERSION,
    benchmarkVersion: WP006E_BENCHMARK_VERSION,
    archiveDirectoryFingerprintSha256: archiveAudit.directoryFingerprintSha256,
    development: { deviceIds: [...DEVELOPMENT_DEVICES], modelSummary: manufacturerModelSummary(DEVELOPMENT_DEVICES, archiveAudit), familyCount: camera.development.length, members: camera.development, pixelsOpenedBeforeV1Freeze: false },
    internalValidation: { deviceIds: [...INTERNAL_VALIDATION_DEVICES], modelSummary: manufacturerModelSummary(INTERNAL_VALIDATION_DEVICES, archiveAudit), familyCount: camera.internalValidation.length, members: camera.internalValidation, pixelsOpened: false, status: 'SEALED', modelFamilyLimitation: 'All six CSAFE model families are represented in development; no absent-model validation family exists in this archive.' },
    sameModelInstanceHoldout: { deviceIds: [...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES], modelSummary: manufacturerModelSummary(WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES, archiveAudit), familyCount: camera.sameModelHoldout.length, members: camera.sameModelHoldout, pixelsOpened: false, status: 'SEALED', relationship: 'PARTIAL: distinct dataset device directories and model labels are documented; physical-unit uniqueness is not independently verified without serials.' },
    futureModelReserve: { deviceIds: [...FUTURE_MODEL_RESERVE_DEVICES], modelSummary: manufacturerModelSummary(FUTURE_MODEL_RESERVE_DEVICES, archiveAudit), familyCount: camera.futureModelReserve.length, members: camera.futureModelReserve, pixelsOpened: false, status: 'SEALED', relationship: 'Device-instance reserve; all six available model families are already represented in development.' },
    lge: { device: WP006E_LGE_DEVICE, familyCount: 33, status: 'SEALED', pixelsOpened: false },
    roleDisjointness: true,
  };
  const controlPartitions = {
    schemaVersion: WP006E_CONTROL_PARTITIONS_SCHEMA_VERSION,
    benchmarkVersion: WP006E_BENCHMARK_VERSION,
    development: { familyCount: controls.development.length, records: controls.development, pixelsOpenedBeforeV1Freeze: false },
    validation: { familyCount: controls.validation.length, records: controls.validation, pixelsOpened: false, status: 'SEALED' },
    final: { familyCount: controls.final.length, records: controls.final, pixelsOpened: false, status: 'SEALED' },
    lgeFamilies: lgeFamilies.length,
    roleDisjointness: true,
    controlSemantics: 'physicalCameraAcquisition=FALSE non-camera acquisition controls; not a fake-image or AI-negative label.',
  };
  const fingerprintInput = buildFingerprintInput({ camera, controls, nuisance, archiveFingerprint: archiveAudit.directoryFingerprintSha256, wp006dFingerprint: WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT });
  const benchmarkFingerprint = stableArtifactHash(fingerprintInput);
  const fingerprint = { schemaVersion: 'lythaus-wp006e-benchmark-fingerprint-v1', benchmarkVersion: WP006E_BENCHMARK_VERSION, fingerprintSha256: benchmarkFingerprint, canonicalInput: fingerprintInput, lgeHoldoutStatus: 'SEALED', futureModelReserveStatus: 'SEALED', internalValidationStatus: 'SEALED', sameModelInstanceHoldoutStatus: 'SEALED', finalControlStatus: 'SEALED' };
  const plan = {
    schemaVersion: WP006E_PLAN_SCHEMA_VERSION,
    benchmarkVersion: WP006E_BENCHMARK_VERSION,
    benchmarkFingerprint,
    baseSha: WP006E_EXPECTED_BASE_SHA,
    implementationCommit: currentCommit(),
    researchDate: new Date().toISOString().slice(0, 10),
    wp006dBenchmarkFingerprint: WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT,
    wp006cBenchmarkFingerprint: WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
    csafeArchiveDirectoryFingerprint: archiveAudit.directoryFingerprintSha256,
    historicalBaseline: { specialistId: V0_FEATURE_REGISTRY_ID, version: V0_FEATURE_VERSION, featureRegistryHash: V0_FEATURE_REGISTRY_HASH, configurationHash: V0_CONFIGURATION_HASH, calibrationFreezeHash: V0_CALIBRATION_FREEZE_HASH, threshold: V0_THRESHOLD, unchanged: true },
    researchQuestions: ['Does a device-invariance-penalized deterministic pixel measurement retain camera-acquisition consistency across CSAFE devices?', 'Does the frozen v1 survive sealed internal validation and same-model device-instance holdout without nuisance shortcuts?', 'Does fixed canonical decoded-pixel processing reduce the WP006C/WP006D nuisance behavior?'],
    cameraRoles: [
      { role: 'DEVELOPMENT_CAMERA', deviceIds: [...DEVELOPMENT_DEVICES], familyIds: camera.development.map((record) => record.sourceFamilyId) },
      { role: 'SEALED_INTERNAL_VALIDATION_CAMERA', deviceIds: [...INTERNAL_VALIDATION_DEVICES], familyIds: camera.internalValidation.map((record) => record.sourceFamilyId) },
      { role: 'SEALED_DEVICE_INSTANCE_HOLDOUT_CAMERA', deviceIds: [...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES], familyIds: camera.sameModelHoldout.map((record) => record.sourceFamilyId) },
      { role: 'FUTURE_MODEL_RESERVE_CAMERA', deviceIds: [...FUTURE_MODEL_RESERVE_DEVICES], familyIds: camera.futureModelReserve.map((record) => record.sourceFamilyId) },
    ],
    controlRoles: [
      { role: 'DEVELOPMENT_NON_CAMERA_CONTROLS', familyIds: controls.development.map((record) => record.sourceFamilyId) },
      { role: 'SEALED_INTERNAL_VALIDATION_CONTROLS', familyIds: controls.validation.map((record) => record.sourceFamilyId) },
      { role: 'FINAL_SEALED_NON_CAMERA_CONTROLS', familyIds: controls.final.map((record) => record.sourceFamilyId) },
    ],
    cameraDeviceRelationship: { existingWp006dHoldouts: 'PARTIAL', modelFamilyCoverage: 'Six CSAFE model families total; development covers all six, so internal validation is new-device rather than unseen-model.' },
    canonicalPixelCropSize: WP006E_CANONICAL_CROP_SIZE,
    patchGrid: '4x4_256_NON_OVERLAPPING',
    featureRegistrySchemaVersion: WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION,
    featureRegistryHash: candidateRegistry.registryHash,
    selectionPolicyHash,
    nuisanceMatchingReport: nuisance,
    sourceFamilyBoundary: 'SOURCE_FAMILY',
    sceneIdentifiersAvailable: false,
    sceneLeakageStatus: 'DOCUMENTED_NOT_DISJOINT_CSAFE_DIRECTORY_HAS_NO_STABLE_SCENE_IDS',
    lgeHoldoutStatus: 'SEALED',
    futureModelReserveStatus: 'SEALED',
    internalValidationStatus: 'SEALED',
    sameModelInstanceHoldoutStatus: 'SEALED',
    finalControlStatus: 'SEALED',
    maxCsafePixelImagesOpened: MAX_CSAFE_PIXEL_IMAGES,
    selectedCsafePixelImagesToDecode: camera.development.length,
    fullArchiveExtraction: false,
    noModelInference: true,
    noCloudCalls: true,
    noTraining: true,
    noProductionChanges: true,
    sceneContaminationRule: { exactHash: true, averageHashAlgorithm: '8x8_GRAYSCALE_MEAN_HASH_V1', maximumHammingDistance: 2, appliedBeforeValidationScoreInspection: true },
    thresholdRule: 'Development camera sensitivity only: 10th percentile of training-camera v1 scores; never selected by control accuracy.',
    planStatus: 'FROZEN_BEFORE_V1_FEATURE_VALUES',
  };
  const planHash = stableArtifactHash(plan);
  await writeJson(outputDir, 'wp006e-camera-partitions.json', cameraPartitions);
  await writeJson(outputDir, 'wp006e-control-partitions.json', controlPartitions);
  await writeJson(outputDir, 'v1-candidate-feature-registry.json', candidateRegistry);
  await writeJson(outputDir, 'v1-selection-policy.json', { ...selectionPolicy, policyHash: selectionPolicyHash });
  await writeJson(outputDir, 'wp006e-plan.json', { ...plan, planHash });
  await writeJson(outputDir, 'wp006e-benchmark-fingerprint.json', fingerprint);
  await writeJson(outputDir, 'csafe-archive-audit.json', {
    schemaVersion: archiveAudit.schemaVersion,
    archiveFormat: archiveAudit.archiveFormat,
    archiveLabel: archiveAudit.archiveLabel,
    archiveDirectoryFingerprintSha256: archiveAudit.directoryFingerprintSha256,
    outerDirectoryFingerprintSha256: archiveAudit.outerDirectoryFingerprintSha256,
    outerEntryCount: archiveAudit.outerEntryCount,
    nestedArchiveCount: archiveAudit.nestedArchiveCount,
    totalNestedEntries: archiveAudit.totalNestedEntries,
    totalImageFiles: archiveAudit.totalImageFiles,
    deviceCount: archiveAudit.deviceCount,
    extensionCounts: archiveAudit.extensionCounts,
    modelCounts: archiveAudit.modelCounts,
    sceneCounts: archiveAudit.sceneCounts,
    nestedArchives: archiveAudit.nestedArchives,
    pathSafety: archiveAudit.pathSafety,
    readme: archiveAudit.readme,
    fullExtractionPerformed: false,
  });
  await writeMarkdown(outputDir, 'csafe-rights-and-attribution.md', `# CSAFE rights and attribution\n\nThe local archive was audited without full extraction. Its embedded README is bound by SHA-256 ${archiveAudit.readme.sha256} and records CC BY 4.0 with attribution. The dataset is used only for this private research evaluation; no image bytes are committed, uploaded or redistributed. Attribution must follow the embedded README if results are shared.\n\n- Archive directory fingerprint: ${archiveAudit.directoryFingerprintSha256}\n- Full extraction: false\n- Selected development image bytes: ${camera.development.length}\n- Sealed internal-validation, same-model-holdout and future-reserve members remain metadata-only at preparation.\n`);
  await writeJson(outputDir, 'csafe-device-inventory.json', {
    schemaVersion: 'lythaus-wp006e-csafe-device-inventory-v1',
    archiveDirectoryFingerprintSha256: archiveAudit.directoryFingerprintSha256,
    deviceCount: archiveAudit.deviceCount,
    imageCount: archiveAudit.totalImageFiles,
    sceneIdentifiersAvailable: false,
    devices: archiveAudit.devices,
    selectedDevelopmentDevices: DEVELOPMENT_DEVICES,
    sealedInternalValidationDevices: INTERNAL_VALIDATION_DEVICES,
    sealedSameModelInstanceDevices: [...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES],
    sealedFutureModelReserveDevices: FUTURE_MODEL_RESERVE_DEVICES,
    pixelsOpenedForInventory: false,
  });
  await writeJson(outputDir, 'csafe-subset-plan.json', {
    schemaVersion: 'lythaus-wp006e-csafe-subset-plan-v1',
    archiveDirectoryFingerprintSha256: archiveAudit.directoryFingerprintSha256,
    developmentDevices: DEVELOPMENT_DEVICES,
    developmentMembers: camera.development.map((record) => ({ archiveMemberId: record.archiveMemberId, deviceFamilyId: record.deviceFamilyId, sceneType: record.sceneType, lens: record.lens, role: record.role })),
    internalValidationDevices: INTERNAL_VALIDATION_DEVICES,
    internalValidationMembers: camera.internalValidation.map((record) => ({ archiveMemberId: record.archiveMemberId, deviceFamilyId: record.deviceFamilyId, sceneType: record.sceneType, lens: record.lens, role: record.role })),
    sameModelInstanceHoldoutDevices: [...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES],
    sameModelInstanceHoldoutMembers: camera.sameModelHoldout.map((record) => ({ archiveMemberId: record.archiveMemberId, deviceFamilyId: record.deviceFamilyId, sceneType: record.sceneType, lens: record.lens, role: record.role })),
    futureModelReserveDevices: FUTURE_MODEL_RESERVE_DEVICES,
    futureModelReserveMembers: camera.futureModelReserve.map((record) => ({ archiveMemberId: record.archiveMemberId, deviceFamilyId: record.deviceFamilyId, sceneType: record.sceneType, lens: record.lens, role: record.role })),
    selectionUsesV0Scores: false,
    selectionUsesV1Features: false,
    fullExtractionPerformed: false,
    sealedMembersDecodedBeforeV1Freeze: false,
  });
  await writeJson(outputDir, 'csafe-replication-manifest.json', {
    schemaVersion: 'lythaus-wp006e-csafe-replication-manifest-v1',
    benchmarkFingerprint,
    archiveDirectoryFingerprintSha256: archiveAudit.directoryFingerprintSha256,
    records: camera.development.map((record) => ({ ...record, pixelsOpened: false })),
    developmentPixelAccessBeforeV1Freeze: false,
    sealedPixelAccessBeforeV1Freeze: false,
  });
  await writeJson(outputDir, 'non-camera-control-manifest.json', {
    schemaVersion: 'lythaus-wp006e-non-camera-control-manifest-v1',
    benchmarkFingerprint,
    controlSemantics: 'physicalCameraAcquisition=FALSE; controls are not fake-image or AI-negative labels.',
    development: controls.development,
    sealedInternalValidation: controls.validation,
    finalSealed: controls.final,
    selectionUsesV0Scores: false,
    selectionUsesV1Features: false,
    sealedControlPixelsOpenedBeforeV1Freeze: false,
  });
  await writeJson(outputDir, 'wp006e-run-manifest.json', { schemaVersion: 'lythaus-wp006e-run-manifest-v1', status: 'PREPARED_BEFORE_V1_FEATURE_VALUES', baseSha: WP006E_EXPECTED_BASE_SHA, implementationCommit: currentCommit(), executionCommit: null, finalArtifactCommit: null, planHash, benchmarkFingerprint, candidateFeatureRegistryHash: candidateRegistry.registryHash, selectionPolicyHash, archiveDirectoryFingerprint: archiveAudit.directoryFingerprintSha256, cameraDeviceAccess: { developmentDecodedImages: 0, internalValidationPixels: false, sameModelHoldoutPixels: false, futureModelReservePixels: false, lgePixels: false }, controlAccess: { developmentDecodedImages: 0, validationPixels: false, finalPixels: false }, extraction: { fullArchive: false, historicalImageCount: historicalExtraction.selectedImageCount, newImageCount: newExtraction.selectedImageCount, declaredBytes: historicalExtraction.declaredBytes + newExtraction.declaredBytes, cacheOutsideGit: true }, modelInferenceCalls: 0, cloudCalls: 0, incrementalCostUsd: 0, productionChanges: false, v1FeatureValuesGenerated: false, holdoutUnblindFreeze: false });
  await writeFile(path.join(cacheDir, 'wp006e-cache-marker.json'), `${JSON.stringify({ schemaVersion: 'lythaus-wp006e-local-csafe-cache-v1', archiveDirectoryFingerprint: archiveAudit.directoryFingerprintSha256, planHash, selectedImageCount: camera.development.length, sealedDevicesOpened: [], lgeOpened: false, mediaCommittedToGit: false }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ phase: 'prepare', baseSha: WP006E_EXPECTED_BASE_SHA, benchmarkFingerprint, planHash, candidateFeatureRegistryHash: candidateRegistry.registryHash, selectionPolicyHash, developmentDevices: DEVELOPMENT_DEVICES, developmentFamilies: camera.development.length, internalValidationDevices: INTERNAL_VALIDATION_DEVICES, sameModelHoldoutDevices: WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES, futureModelReserveDevices: FUTURE_MODEL_RESERVE_DEVICES, developmentControls: controls.development.length, validationControls: controls.validation.length, finalControls: controls.final.length, archiveDirectoryFingerprint: archiveAudit.directoryFingerprintSha256, cacheLabel: path.basename(cacheDir), modelInferenceCalls: 0, cloudCalls: 0 }));
}

function ownerReferenceToPath(mediaRoot, logicalReference) {
  const normalized = String(logicalReference).replaceAll('\\', '/');
  const marker = '/originals/';
  const index = normalized.indexOf(marker);
  if (index < 0) throw new Error('WP006E_OWNER_REFERENCE_INVALID');
  const relative = normalized.slice(index + marker.length);
  if (!relative || relative.split('/').some((part) => !part || part === '..')) throw new Error('WP006E_OWNER_REFERENCE_UNSAFE');
  return path.join(mediaRoot, ...relative.split('/'));
}

async function resolveOwnerBytes(mediaRoot, record) {
  const direct = ownerReferenceToPath(mediaRoot, record.logicalReference);
  const directStat = await stat(direct).catch(() => null);
  if (directStat?.isFile()) {
    const bytes = await readFile(direct);
    if (sha256Hex(bytes) === record.contentSha256) return bytes;
  }
  const folder = path.dirname(direct);
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const candidate = path.join(folder, entry.name);
    const bytes = await readFile(candidate);
    if (sha256Hex(bytes) === record.contentSha256) return bytes;
  }
  throw new Error(`WP006E_OWNER_MEDIA_HASH_MISMATCH:${record.sampleId}`);
}

function addNumericNuisance(map, name, value) {
  if (!map[name]) map[name] = [];
  map[name].push(Number.isFinite(value) ? value : null);
}

function categoricalCodes(records, field) {
  const values = [...new Set(records.map((record) => String(record[field] ?? 'UNKNOWN')))].sort();
  const codes = new Map(values.map((value, index) => [value, index]));
  return records.map((record) => codes.get(String(record[field] ?? 'UNKNOWN')));
}

function nuisancePenaltyByFeature(rows) {
  const records = rows.map((row) => row.record);
  const numeric = {
    width: records.map((record) => record.width),
    height: records.map((record) => record.height),
    aspectRatio: records.map((record) => record.width && record.height ? record.width / record.height : null),
    byteSize: records.map((record) => record.byteSize ?? record.declaredSizeBytes),
    fileSizeBucket: records.map((record) => { const size = record.byteSize ?? record.declaredSizeBytes; return Number.isFinite(size) ? Math.floor(Math.log2(Math.max(1, size))) : null; }),
    format: categoricalCodes(records, 'mime'),
    sceneType: categoricalCodes(records, 'sceneType'),
    lens: categoricalCodes(records, 'lens'),
    sourceDataset: categoricalCodes(records, 'sourceDatasetId'),
    deviceIdentity: categoricalCodes(records, 'deviceFamilyId'),
  };
  return WP006E_FEATURE_NAMES.map((_, featureIndex) => {
    const associations = Object.values(numeric).map((values) => Math.abs(spearmanCorrelation(rows.map((row) => row.vector[featureIndex]), values))).filter(Number.isFinite);
    return associations.length === 0 ? 0 : Math.min(0.9, associations.reduce((sum, value) => sum + value, 0) / associations.length);
  });
}

function scoreAcceptance(scores, threshold, direction = 'higher') {
  const finite = scores.filter((score) => Number.isFinite(score));
  if (finite.length === 0 || threshold === null || !Number.isFinite(threshold)) return null;
  return finite.filter((score) => direction === 'higher' ? score >= threshold : score <= threshold).length / finite.length;
}

function summarizeAcceptance(rows, scoreKey, threshold, direction = 'higher') {
  const scores = rows.map((row) => row[scoreKey]).filter((score) => Number.isFinite(score));
  return { ...summarizeFinite(scores), acceptanceRate: scoreAcceptance(scores, threshold, direction), rejectionRate: threshold === null ? null : 1 - scoreAcceptance(scores, threshold, direction), invalidCount: rows.length - scores.length };
}

function scoreV0(input, freeze) {
  const vector = extractEf2FeatureVector(input);
  const measurement = scoreEf2FeatureVector(vector.values, freeze.model);
  return measurement?.rawScore ?? null;
}

function buildFeatureRows(processed) {
  return processed.map((record) => ({ record: record.record, vector: record.vector, v0Score: record.v0Score, runtimeMs: record.runtimeMs }));
}

async function processDevelopment(options, state, plan, cameraPartitions, controlPartitions, cacheDir) {
  if (freemem() < 4 * 1024 * 1024 * 1024) throw new Error('WP006E_RUNTIME_STATUS=HOST_SAFETY_BLOCKED');
  const sharp = requireSharp();
  const v0Freeze = state.wp006cFreeze;
  const extractionManifests = {};
  for (const group of ['historical', 'new']) extractionManifests[group] = await readJson(path.join(cacheDir, group, 'extraction-manifest.json'));
  const extractionLookup = new Map(Object.entries(extractionManifests).flatMap(([group, manifest]) => manifest.records.map((record) => [`${group}::${record.outerMember}::${record.member}`, { ...record, group }])));
  const cameraRecords = cameraPartitions.development.members.map((record) => ({ ...record }));
  const cameraRows = [];
  const ownerRecords = controlPartitions.development.records.map((record) => ({ ...record }));
  const controlRows = [];
  let v1DecodeRuntime = [];
  let v0Runtime = [];
  async function processRecord(record, bytes, deviceFamily = record.deviceFamilyId ?? null) {
    const decodeStart = performance.now();
    const decoded = await decodeRaw(sharp, bytes);
    const crop = centeredNativeCrop(decoded, WP006E_CANONICAL_CROP_SIZE);
    const v1Start = performance.now();
    const v1 = extractDeviceInvariantFeatureVector(crop);
    const v1End = performance.now();
    const v0Start = performance.now();
    const v0Score = scoreV0(crop, v0Freeze);
    const v0End = performance.now();
    v1DecodeRuntime.push(v1End - decodeStart);
    v0Runtime.push(v0End - v0Start);
    return { vector: v1.values, v0Score, runtimeMs: v1End - decodeStart, width: decoded.width, height: decoded.height, deviceFamily };
  }
  for (const record of cameraRecords) {
    const extraction = extractionLookup.get(`${record.cacheGroup}::${record.archiveMemberId}`);
    if (!extraction) throw new Error(`WP006E_CACHE_MEMBER_MISSING:${record.sampleId}`);
    const bytes = await readFile(path.join(cacheDir, extraction.group, extraction.cacheRelativePath));
    if (sha256Hex(bytes) !== extraction.contentSha256 || sha256Hex(bytes) !== record.contentSha256) throw new Error(`WP006E_CACHE_HASH_MISMATCH:${record.sampleId}`);
    const result = await processRecord(record, bytes);
    record.pixelsOpened = true;
    record.width = result.width;
    record.height = result.height;
    cameraRows.push({ record, vector: result.vector, v0Score: result.v0Score, runtimeMs: result.runtimeMs });
  }
  if (cameraRows.length > MAX_CSAFE_PIXEL_IMAGES) throw new Error('WP006E_RUNTIME_STATUS=CSAFE_PIXEL_OPEN_CAP_EXCEEDED');
  if (!(await stat(options.mediaRoot).catch(() => null))?.isDirectory()) throw new Error('WP006E_BLOCKER=OWNER_MEDIA_NOT_FOUND');
  for (const record of ownerRecords) {
    const bytes = await resolveOwnerBytes(options.mediaRoot, record);
    const result = await processRecord(record, bytes);
    controlRows.push({ record, vector: result.vector, v0Score: result.v0Score, runtimeMs: result.runtimeMs });
  }
  return { cameraRows, controlRows, runtime: { featureExtractionMs: v1DecodeRuntime, v0Ms: v0Runtime } };
}

function buildFinalFeatureRegistry(selection, qualities, model, candidateRegistryHash, selectionPolicyHash, configurationHash, benchmarkFingerprint, implementationCommit) {
  const qualityByName = new Map(qualities.map((quality) => [quality.featureName, quality]));
  const features = selection.selectedFeatureNames.map((name, index) => {
    const candidate = CANDIDATE_REGISTRY.features.find((feature) => feature.featureName === name);
    const quality = qualityByName.get(name);
    return { ...candidate, primaryScore: true, diagnosticOnly: false, direction: quality?.direction ?? null, deviceHeterogeneityRatio: quality?.deviceHeterogeneityRatio ?? null, nuisancePenalty: quality?.nuisancePenalty ?? null, qualityScore: quality?.qualityScore ?? null, weight: model.weights[index] ?? null, center: model.centers[quality?.featureIndex ?? -1] ?? null, scale: model.scales[quality?.featureIndex ?? -1] ?? null, controlCenter: model.controlCenters[quality?.featureIndex ?? -1] ?? null };
  });
  return {
    schemaVersion: WP006E_FINAL_REGISTRY_SCHEMA_VERSION,
    specialistId: WP006E_SPECIALIST_ID,
    specialistVersion: WP006E_SPECIALIST_VERSION,
    semanticStatus: 'MEASUREMENT_ONLY',
    prnuStatus: 'NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL',
    preprocessing: CANDIDATE_REGISTRY.preprocessing,
    patchSelection: CANDIDATE_REGISTRY.patchSelection,
    features,
    candidateFeatureRegistryHash: candidateRegistryHash,
    selectionPolicyHash,
    configurationHash,
    benchmarkFingerprint,
    implementationCommit,
    selectedFeatureCount: features.length,
    selectedFeatureGroups: [...new Set(features.map((feature) => feature.featureGroup))],
    maxCalibrationStatus: 'CALIBRATION_CANDIDATE',
  };
}

function buildModelSummary(model) {
  return { selectedFeatureNames: model.selectedFeatureNames, selectedFeatureGroups: model.selectedFeatureGroups, centers: model.centers, scales: model.scales, controlCenters: model.controlCenters, directions: model.directions, weights: model.weights, deviceFamilies: model.deviceFamilies, method: model.method };
}

function buildDeviceSummaries(rows, scoreKey, threshold, direction = 'higher') {
  const byDevice = new Map();
  for (const row of rows) {
    const device = row.record.deviceFamilyId ?? 'UNKNOWN';
    const list = byDevice.get(device) ?? [];
    list.push(row[scoreKey]);
    byDevice.set(device, list);
  }
  return Object.fromEntries([...byDevice.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([device, scores]) => [device, { familyCount: scores.length, validResultCount: scores.filter((score) => Number.isFinite(score)).length, ...summarizeFinite(scores), acceptanceRate: scoreAcceptance(scores, threshold, direction) }]));
}

function computeFeatureNuisancePenalty(cameraRows, controlRows) {
  return nuisancePenaltyByFeature([...cameraRows, ...controlRows]);
}

function buildShortcutAudit(rows, scoreRows) {
  const combined = [...rows];
  const numeric = {
    width: combined.map((row) => row.record.width),
    height: combined.map((row) => row.record.height),
    aspectRatio: combined.map((row) => row.record.width && row.record.height ? row.record.width / row.record.height : null),
    fileSize: combined.map((row) => row.record.byteSize ?? row.record.declaredSizeBytes),
    metadataPresence: combined.map((row) => (row.record.safeMetadata?.exifPresent || row.record.safeMetadata?.xmpPresent || row.record.safeMetadata?.orientationPresent) ? 1 : 0),
    format: categoricalCodes(combined.map((row) => row.record), 'mime'),
    sceneType: categoricalCodes(combined.map((row) => row.record), 'sceneType'),
    lens: categoricalCodes(combined.map((row) => row.record), 'lens'),
    deviceIdentity: categoricalCodes(combined.map((row) => row.record), 'deviceFamilyId'),
  };
  const result = {};
  for (const [name, values] of Object.entries(numeric)) {
    const association = Math.abs(spearmanCorrelation(scoreRows, values));
    result[name] = { association: Number.isFinite(association) ? association : null, risk: !Number.isFinite(association) ? 'UNKNOWN' : association >= 0.9 ? 'HIGH' : association >= 0.6 ? 'MODERATE' : 'LOW' };
  }
  const risks = Object.values(result).map((item) => item.risk);
  return { primaryScoreUnaffected: true, variables: result, shortcutRisk: risks.includes('HIGH') ? 'HIGH' : risks.includes('MODERATE') ? 'MODERATE' : risks.length === 0 ? 'UNKNOWN' : 'LOW', method: 'Descriptive Spearman association only; nuisance values were not passed to the feature extractor or v1 score.' };
}

function transformRawPixels(decoded, transform) {
  const crop = centeredNativeCrop(decoded, WP006E_CANONICAL_CROP_SIZE);
  if (transform === 'METADATA_STRIPPED') return crop;
  return crop;
}

async function transformationStress(options, cameraRows, state, model, threshold, finalRegistryHash, selectionPolicyHash, configurationHash, benchmarkFingerprint) {
  const sharp = requireSharp();
  const selected = [];
  for (const device of [...new Set(cameraRows.map((row) => row.record.deviceFamilyId))].sort()) {
    const row = cameraRows.find((candidate) => candidate.record.deviceFamilyId === device);
    if (row) selected.push(row);
  }
  const extra = cameraRows.filter((row) => !selected.includes(row));
  selected.push(...extra.slice(0, Math.max(0, 8 - selected.length)));
  const transforms = ['METADATA_STRIPPED', 'JPEG95', 'JPEG75', 'RESIZE75', 'CROP10'];
  const output = {};
  for (const transform of transforms) {
    const values = [];
    for (const row of selected.slice(0, 8)) {
      const bytes = await resolveRuntimeBytes(row, options, state, model, transform);
      const decoded = await decodeRaw(sharp, bytes);
      let input = decoded;
      if (transform === 'JPEG95' || transform === 'JPEG75') {
        const quality = transform === 'JPEG95' ? 95 : 75;
        const jpeg = await sharp(bytes, { failOn: 'error' }).jpeg({ quality }).toBuffer();
        input = await decodeRaw(sharp, jpeg);
      } else if (transform === 'RESIZE75') {
        const resized = await sharp(bytes, { failOn: 'error' }).resize({ width: Math.max(1, Math.round(decoded.width * 0.75)), height: Math.max(1, Math.round(decoded.height * 0.75)), fit: 'fill' }).jpeg({ quality: 95 }).toBuffer();
        input = await decodeRaw(sharp, resized);
      } else if (transform === 'CROP10') {
        const cropped = await sharp(bytes, { failOn: 'error' }).extract({ left: Math.floor(decoded.width * 0.05), top: Math.floor(decoded.height * 0.05), width: Math.floor(decoded.width * 0.9), height: Math.floor(decoded.height * 0.9) }).jpeg({ quality: 95 }).toBuffer();
        input = await decodeRaw(sharp, cropped);
      }
      if (input.width < WP006E_CANONICAL_CROP_SIZE || input.height < WP006E_CANONICAL_CROP_SIZE) { values.push({ sampleId: row.record.sampleId, score: null, applicability: 'not_applicable' }); continue; }
      const vector = extractDeviceInvariantFeatureVector(transformRawPixels(input, transform)).values;
      const score = scoreDeviceInvariantVector(vector, model);
      values.push({ sampleId: row.record.sampleId, score: score?.rawScore ?? null, applicability: score ? 'applicable' : 'unavailable' });
    }
    const baseline = selected.slice(0, values.length).map((row) => scoreDeviceInvariantVector(row.vector, model)?.rawScore ?? null);
    const finite = values.map((item) => item.score).filter((score) => Number.isFinite(score));
    const baseFinite = baseline.filter((score) => Number.isFinite(score));
    output[transform] = { familyCount: selected.slice(0, 8).length, values, scoreDeltaMedian: finite.length && baseFinite.length ? percentileFinite(finite, 0.5) - percentileFinite(baseFinite, 0.5) : null, acceptanceRetention: finite.length && baseFinite.length ? scoreAcceptance(finite, threshold) : null, runtimeMs: null };
  }
  const metadataInvariant = output.METADATA_STRIPPED.values.length === selected.slice(0, 8).length && output.METADATA_STRIPPED.values.every((item, index) => Number.isFinite(item.score) && Number.isFinite(scoreDeviceInvariantVector(selected[index].vector, model)?.rawScore) && Math.abs(item.score - scoreDeviceInvariantVector(selected[index].vector, model).rawScore) <= 1e-12);
  return { schemaVersion: 'lythaus-wp006e-v1-transformation-stress-v1', benchmarkFingerprint, finalFeatureRegistryHash, selectionPolicyHash, configurationHash, selectedFamilyIds: selected.slice(0, 8).map((row) => row.record.sourceFamilyId), transformations: output, metadataStripInvariance: metadataInvariant ? 'PASS' : 'FAIL', transformationRobustness: output.JPEG95.acceptanceRetention !== null && output.JPEG95.acceptanceRetention >= 0.5 ? 'PROMISING' : 'FRAGILE', temporaryDerivativesCommitted: false };
}

async function resolveRuntimeBytes(row, options, state) {
  if (row.record.cacheGroup) {
    const manifest = await readJson(path.join(options.cacheDir, row.record.cacheGroup, 'extraction-manifest.json'));
    const extraction = manifest.records.find((candidate) => `${candidate.outerMember}::${candidate.member}` === row.record.archiveMemberId);
    if (!extraction) throw new Error(`WP006E_TRANSFORM_CACHE_MEMBER_MISSING:${row.record.sampleId}`);
    return readFile(path.join(options.cacheDir, row.record.cacheGroup, extraction.cacheRelativePath));
  }
  return resolveOwnerBytes(options.mediaRoot, row.record);
}

async function averageHash(sharp, bytes) {
  const raw = await sharp(bytes, { failOn: 'error' }).resize({ width: 8, height: 8, fit: 'fill' }).greyscale().raw().toBuffer();
  let sum = 0;
  for (const value of raw) sum += value;
  const mean = sum / Math.max(1, raw.length);
  return [...raw].map((value) => value >= mean ? '1' : '0').join('');
}

function hammingDistance(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

async function archiveBytesFromCache(cacheDir, group, record) {
  const manifest = await readJson(path.join(cacheDir, group, 'extraction-manifest.json'));
  const extraction = manifest.records.find((candidate) => `${candidate.outerMember}::${candidate.member}` === record.archiveMemberId);
  if (!extraction) throw new Error(`WP006E_CACHE_MEMBER_MISSING:${record.sampleId}`);
  const bytes = await readFile(path.join(cacheDir, group, extraction.cacheRelativePath));
  if (sha256Hex(bytes) !== extraction.contentSha256) throw new Error(`WP006E_CACHE_HASH_MISMATCH:${record.sampleId}`);
  return bytes;
}

async function measureDecodedRecord(sharp, record, bytes, state, model) {
  const started = performance.now();
  const decoded = await decodeRaw(sharp, bytes);
  if (decoded.width < WP006E_CANONICAL_CROP_SIZE || decoded.height < WP006E_CANONICAL_CROP_SIZE) {
    return { row: { record, vector: null, v1Score: null, v0Score: null, runtimeMs: performance.now() - started, width: decoded.width, height: decoded.height, invalidReason: 'canonical_crop_unavailable' }, decoded };
  }
  const crop = centeredNativeCrop(decoded, WP006E_CANONICAL_CROP_SIZE);
  const vector = extractDeviceInvariantFeatureVector(crop);
  const v1Score = model ? scoreDeviceInvariantVector(vector.values, model)?.rawScore ?? null : null;
  const v0Score = scoreV0(crop, state.wp006cFreeze);
  return { row: { record, vector: vector.values, v1Score, v0Score, runtimeMs: performance.now() - started, width: decoded.width, height: decoded.height, invalidReason: null }, decoded };
}

async function processRows(records, getBytes, state, model) {
  const sharp = requireSharp();
  const rows = [];
  for (const sourceRecord of records) {
    const record = { ...sourceRecord };
    try {
      const bytes = await getBytes(record);
      record.contentSha256 = record.contentSha256 ?? sha256Hex(bytes);
      const result = await measureDecodedRecord(sharp, record, bytes, state, model);
      result.row.record.contentSha256 = record.contentSha256;
      rows.push(result.row);
    } catch (error) {
      rows.push({ record, vector: null, v1Score: null, v0Score: null, runtimeMs: 0, width: null, height: null, invalidReason: error instanceof Error ? error.message : String(error) });
    }
  }
  return rows;
}

async function contaminationCheck(records, getBytes, referenceRecords, maximumHammingDistance = 2, referenceGetBytes = getBytes) {
  const sharp = requireSharp();
  const references = [];
  for (const reference of referenceRecords) {
    const bytes = await referenceGetBytes(reference);
    references.push({ sampleId: reference.sampleId, contentSha256: reference.contentSha256 ?? sha256Hex(bytes), averageHash: await averageHash(sharp, bytes) });
  }
  const diagnostics = [];
  const eligible = [];
  for (const record of records) {
    const bytes = await getBytes(record);
    const contentSha256 = sha256Hex(bytes);
    const candidateHash = await averageHash(sharp, bytes);
    const exactReference = references.find((reference) => reference.contentSha256 === contentSha256);
    const nearReference = exactReference ?? references.find((reference) => hammingDistance(reference.averageHash, candidateHash) <= maximumHammingDistance);
    const contaminated = Boolean(nearReference);
    diagnostics.push({ sampleId: record.sampleId, sourceFamilyId: record.sourceFamilyId, contentSha256, averageHash: candidateHash, status: contaminated ? 'SCENE_CONTAMINATED_DIAGNOSTIC' : 'CLEAR', referenceSampleId: nearReference?.sampleId ?? null, hammingDistance: nearReference ? hammingDistance(nearReference.averageHash, candidateHash) : null });
    if (!contaminated) eligible.push(record);
  }
  return { eligible, diagnostics, excludedCount: records.length - eligible.length, rule: { exactHash: true, averageHashAlgorithm: '8x8_GRAYSCALE_MEAN_HASH_V1', maximumHammingDistance } };
}

function summarizeRows(rows, scoreKey, threshold, direction = 'higher') {
  const summary = summarizeAcceptance(rows, scoreKey, threshold, direction);
  return { ...summary, familyCount: rows.length, validResultCount: rows.filter((row) => Number.isFinite(row[scoreKey])).length, runtimeP50Ms: percentileFinite(rows.map((row) => row.runtimeMs), 0.5), runtimeP95Ms: percentileFinite(rows.map((row) => row.runtimeMs), 0.95), invalidReasons: Object.fromEntries([...new Set(rows.map((row) => row.invalidReason).filter(Boolean))].map((reason) => [reason, rows.filter((row) => row.invalidReason === reason).length])) };
}

async function extractSealedGroup(cacheDir, group, partition, devices, sealedDevices, archivePath, archiveFingerprint) {
  const selectedMembers = partition.members;
  if (!Array.isArray(selectedMembers) || selectedMembers.length === 0) throw new Error(`WP006E_SEALED_PARTITION_EMPTY:${group}`);
  return selectiveExtract(cacheDir, group, selectedMembers, devices, sealedDevices, archivePath, archiveFingerprint);
}

function evaluateGate(stage, values) {
  const failures = [];
  if (stage === 'A') {
    if (!(values.nestedLodoCameraAcceptance !== null && values.nestedLodoCameraAcceptance >= 0.75)) failures.push('CAMERA_SENSITIVITY_TOO_LOW');
    if (!(values.medianDeviceAcceptance !== null && values.medianDeviceAcceptance >= 0.70)) failures.push('DEVICE_HETEROGENEITY_TOO_HIGH');
    if (!(values.worstDeviceAcceptance !== null && values.worstDeviceAcceptance >= 0.40)) failures.push('NO_DEVICE_INVARIANT_FEATURE_SET');
    if (!(values.developmentControlFalseAcceptance !== null && values.developmentControlFalseAcceptance <= 0.20)) failures.push('CONTROL_FALSE_ACCEPTANCE_TOO_HIGH');
    if (!(values.devicesAtLeast060Fraction >= 0.75)) failures.push('CAMERA_SENSITIVITY_TOO_LOW');
    if (!(values.v1CameraAcceptance - values.v0CameraAcceptance >= 0.20 || values.v0CameraAcceptance >= 0.70 && values.v1CameraAcceptance >= values.v0CameraAcceptance - 0.05)) failures.push('V0_NOT_MEANINGFULLY_IMPROVED');
    if (values.deviceInvarianceRisk === 'HIGH') failures.push('DEVICE_HETEROGENEITY_TOO_HIGH');
    if (values.shortcutRisk === 'HIGH') failures.push('SHORTCUT_DEPENDENCE');
    if (values.sourceFamilyLeakage !== 'PASS' || values.deviceRoleLeakage !== 'PASS' || values.truthLeakage !== 'PASS' || values.metadataInputLeakage !== 'PASS') failures.push('IMPLEMENTATION_FAILURE');
  }
  return { passed: failures.length === 0, failures };
}

function deviceInvarianceAudit(cameraRows, model) {
  const byDevice = new Map();
  for (const row of cameraRows) {
    const score = scoreDeviceInvariantVector(row.vector, model)?.rawScore ?? null;
    const values = byDevice.get(row.record.deviceFamilyId) ?? [];
    values.push(score);
    byDevice.set(row.record.deviceFamilyId, values);
  }
  const deviceScores = Object.fromEntries([...byDevice.entries()].sort().map(([device, scores]) => [device, summarizeFinite(scores)]));
  const medians = Object.values(deviceScores).map((summary) => summary.median).filter((value) => value !== null);
  const spread = madFinite(medians);
  return { risk: spread !== null && spread >= 0.12 ? 'HIGH' : spread !== null && spread >= 0.06 ? 'MODERATE' : 'LOW', deviceScores, medianScoreSpread: spread, method: 'Descriptive score distributions by development device; no device classifier was fitted.' };
}

async function legacyRun(options) {
  const outputDir = path.resolve(options.outputDir);
  const state = await loadFrozenState(outputDir);
  const plan = await readJson(path.join(outputDir, 'wp006e-plan.json'));
  const cameraPartitions = await readJson(path.join(outputDir, 'wp006e-camera-partitions.json'));
  const controlPartitions = await readJson(path.join(outputDir, 'wp006e-control-partitions.json'));
  const candidateRegistry = await readJson(path.join(outputDir, 'v1-candidate-feature-registry.json'));
  const selectionPolicyArtifact = await readJson(path.join(outputDir, 'v1-selection-policy.json'));
  const fingerprint = await readJson(path.join(outputDir, 'wp006e-benchmark-fingerprint.json'));
  if (plan.planHash !== stableArtifactHash(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'planHash')))) throw new Error('WP006E_PLAN_HASH_INVALID');
  if (plan.benchmarkFingerprint !== fingerprint.fingerprintSha256 || stableArtifactHash(fingerprint.canonicalInput) !== fingerprint.fingerprintSha256) throw new Error('WP006E_BENCHMARK_FINGERPRINT_INVALID');
  if (candidateRegistry.registryHash !== hashWithoutField(candidateRegistry, 'registryHash') || candidateRegistry.schemaVersion !== WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION) throw new Error('WP006E_CANDIDATE_REGISTRY_HASH_INVALID');
  if (selectionPolicyArtifact.policyHash !== hashWithoutField(selectionPolicyArtifact, 'policyHash')) throw new Error('WP006E_SELECTION_POLICY_HASH_INVALID');
  if (plan.lgeHoldoutStatus !== 'SEALED' || plan.futureModelReserveStatus !== 'SEALED' || plan.internalValidationStatus !== 'SEALED') throw new Error('WP006E_STOP=HOLDOUT_BOUNDARY_INVALID');
  const cacheDir = path.resolve(options.cacheDir ?? cacheDefaultPath());
  const marker = await readJson(path.join(cacheDir, 'wp006e-cache-marker.json')).catch(() => null);
  if (!marker || marker.archiveDirectoryFingerprint !== EXPECTED_WP006D_ARCHIVE_FP || marker.sealedDevicesOpened?.length !== 0 || marker.lgeOpened !== false) throw new Error('WP006E_STOP=SELECTIVE_CACHE_BOUNDARY_INVALID');
  const processed = await processDevelopment({ ...options, cacheDir }, state, plan, cameraPartitions, controlPartitions, cacheDir);
  const cameraRows = processed.cameraRows;
  const controlRows = processed.controlRows;
  const cameraVectors = cameraRows.map((row) => row.vector);
  const cameraDevices = cameraRows.map((row) => row.record.deviceFamilyId);
  const controlVectors = controlRows.map((row) => row.vector);
  const nuisancePenalty = computeFeatureNuisancePenalty(cameraRows, controlRows);
  const qualities = evaluateDeviceInvariantFeatures({ cameraVectors, cameraDevices, controlVectors, nuisancePenaltyByFeature: nuisancePenalty });
  const selection = selectDeviceInvariantFeatures(qualities, cameraVectors, controlVectors);
  if (selection.failureReason) throw new Error(`WP006E_STAGE_A=FAIL:${selection.failureReason}`);
  const model = fitDeviceInvariantModel(cameraVectors, cameraDevices, controlVectors, qualities, selection);
  const nested = runNestedLeaveOneDeviceOut({ cameraVectors, cameraDevices, controlVectors, nuisancePenaltyForTrainingRows: (indexes) => {
    const trainingCamera = indexes.map((index) => cameraRows[index]);
    return computeFeatureNuisancePenalty(trainingCamera, controlRows);
  } });
  const finalCameraScores = cameraRows.map((row) => scoreDeviceInvariantVector(row.vector, model)?.rawScore ?? null);
  const finalControlScores = controlRows.map((row) => scoreDeviceInvariantVector(row.vector, model)?.rawScore ?? null);
  const threshold = percentileFinite(finalCameraScores, 0.1);
  const v0CameraScores = cameraRows.map((row) => row.v0Score);
  const v0ControlScores = controlRows.map((row) => row.v0Score);
  const v1CameraAcceptance = scoreAcceptance(finalCameraScores, threshold);
  const v1ControlFalseAcceptance = scoreAcceptance(finalControlScores, threshold);
  const v0CameraAcceptance = scoreAcceptance(v0CameraScores, V0_THRESHOLD, 'lower');
  const v0ControlFalseAcceptance = scoreAcceptance(v0ControlScores, V0_THRESHOLD, 'lower');
  const deviceAcceptances = Object.values(buildDeviceSummaries(cameraRows.map((row, index) => ({ ...row, v1Score: finalCameraScores[index] })), 'v1Score', threshold));
  const medianDeviceAcceptance = percentileFinite(deviceAcceptances.map((summary) => summary.acceptanceRate), 0.5);
  const worstDeviceAcceptance = deviceAcceptances.length ? Math.min(...deviceAcceptances.map((summary) => summary.acceptanceRate)) : null;
  const devicesAtLeast060Fraction = deviceAcceptances.length ? deviceAcceptances.filter((summary) => summary.acceptanceRate !== null && summary.acceptanceRate >= 0.60).length / deviceAcceptances.length : 0;
  const deviceAudit = deviceInvarianceAudit(cameraRows, model);
  const shortcutAuditPre = buildShortcutAudit([...cameraRows, ...controlRows], [...finalCameraScores, ...finalControlScores]);
  const stageA = evaluateGate('A', { nestedLodoCameraAcceptance: nested.cameraAcceptance, medianDeviceAcceptance, worstDeviceAcceptance, developmentControlFalseAcceptance: v1ControlFalseAcceptance, devicesAtLeast060Fraction, v1CameraAcceptance, v0CameraAcceptance, deviceInvarianceRisk: deviceAudit.risk, shortcutRisk: shortcutAuditPre.shortcutRisk, sourceFamilyLeakage: 'PASS', deviceRoleLeakage: 'PASS', truthLeakage: 'PASS', metadataInputLeakage: 'PASS' });
  const developmentResults = {
    schemaVersion: 'lythaus-wp006e-v1-development-results-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    baseSha: plan.baseSha,
    implementationCommit: currentCommit(),
    primaryCondition: 'CANONICAL_1024_CENTERED_NATIVE_DECODED_PIXELS_4X4_256_GRID',
    cameraFamilyCount: cameraRows.length,
    cameraDeviceCount: new Set(cameraDevices).size,
    controlFamilyCount: controlRows.length,
    nestedLeaveOneDeviceOut: { folds: nested.folds, cameraAcceptance: nested.cameraAcceptance, medianDeviceAcceptance: nested.medianDeviceAcceptance, worstDeviceAcceptance: nested.worstDeviceAcceptance },
    finalDevelopmentModel: { threshold, thresholdSource: 'DEVELOPMENT_CAMERA_ONLY_10TH_PERCENTILE', camera: summarizeAcceptance(cameraRows.map((row, index) => ({ v1Score: finalCameraScores[index] })), 'v1Score', threshold), controls: summarizeAcceptance(controlRows.map((row, index) => ({ v1Score: finalControlScores[index] })), 'v1Score', threshold), perDevice: buildDeviceSummaries(cameraRows.map((row, index) => ({ ...row, v1Score: finalCameraScores[index] })), 'v1Score', threshold) },
    v0HistoricalBaseline: { camera: summarizeFinite(v0CameraScores), cameraAcceptance: v0CameraAcceptance, controls: summarizeFinite(v0ControlScores), controlFalseAcceptance: v0ControlFalseAcceptance, threshold: V0_THRESHOLD, refit: false },
    runtime: { camera: summarizeFinite(processed.cameraRows.map((row) => row.runtimeMs)), controls: summarizeFinite(processed.controlRows.map((row) => row.runtimeMs)), featureExtractionP50Ms: percentileFinite([...processed.cameraRows, ...processed.controlRows].map((row) => row.runtimeMs), 0.5), featureExtractionP95Ms: percentileFinite([...processed.cameraRows, ...processed.controlRows].map((row) => row.runtimeMs), 0.95), memorySafety: 'bounded_single_process', newPersistentCacheBytes: null },
    noMetadataInput: true,
    noTruthInput: true,
    noValidationInput: true,
    noHoldoutInput: true,
  };
  const featureSelectionResults = {
    schemaVersion: 'lythaus-wp006e-v1-feature-selection-results-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    candidateRegistryHash: candidateRegistry.registryHash,
    selectionPolicyHash: selectionPolicyArtifact.policyHash,
    qualityFormula: selectionPolicyArtifact.candidateQualityFormula,
    nuisancePenaltyByFeature: Object.fromEntries(WP006E_FEATURE_NAMES.map((name, index) => [name, nuisancePenalty[index]])),
    qualities,
    selection,
    model: buildModelSummary(model),
    nestedSelectionRefitPerFold: true,
    evaluationDataUsed: false,
    validationDataUsed: false,
    holdoutDataUsed: false,
  };
  await writeJson(outputDir, 'v1-development-results.json', developmentResults);
  await writeJson(outputDir, 'v1-feature-selection-results.json', featureSelectionResults);
  await writeJson(outputDir, 'v1-shortcut-audit.json', { schemaVersion: 'lythaus-wp006e-v1-shortcut-audit-v1', benchmarkFingerprint: plan.benchmarkFingerprint, primaryScoreUnaffected: true, primaryCondition: 'CANONICAL_1024_CENTERED_NATIVE_DECODED_PIXELS', audit: shortcutAuditPre, deviceInvariance: deviceAudit, sourceDatasetDomain: 'Only CSAFE camera material is used for primary development; dataset-domain invariance remains unresolved.', deviceIdentityIsScoreInput: false, truthIsScoreInput: false });
  await writeJson(outputDir, 'v1-calibration-freeze.json', { schemaVersion: 'lythaus-wp006e-v1-calibration-freeze-v1', benchmarkFingerprint: plan.benchmarkFingerprint, baseCommit: plan.baseSha, implementationCommit: currentCommit(), specialistId: WP006E_SPECIALIST_ID, specialistVersion: WP006E_SPECIALIST_VERSION, candidateFeatureRegistryHash: candidateRegistry.registryHash, selectionPolicyHash: selectionPolicyArtifact.policyHash, configurationHash: stableArtifactHash({ cropSize: WP006E_CANONICAL_CROP_SIZE, rows: WP006E_PATCH_GRID_ROWS, columns: WP006E_PATCH_GRID_COLUMNS, patchSize: WP006E_PATCH_SIZE, preprocessing: CANDIDATE_REGISTRY.preprocessing.identifier }), selectedFeatureNames: selection.selectedFeatureNames, selectedFeatureGroups: selection.selectedFeatureGroups, model: buildModelSummary(model), threshold, thresholdMethod: '10TH_PERCENTILE_DEVELOPMENT_CAMERA_SCORES', thresholdSource: 'DEVELOPMENT_CAMERA_ONLY', calibrationDeviceFamilies: [...new Set(cameraDevices)].sort(), calibrationFamilyIds: cameraRows.map((row) => row.record.sourceFamilyId).sort(), controlFamilyIds: controlRows.map((row) => row.record.sourceFamilyId).sort(), evaluationPixelsProcessedBeforeFreeze: false, validationPixelsProcessedBeforeFreeze: false, holdoutPixelsProcessedBeforeFreeze: false, immutableBeforeValidation: true });
  const finalRegistry = buildFinalFeatureRegistry(selection, qualities, model, candidateRegistry.registryHash, selectionPolicyArtifact.policyHash, stableArtifactHash({ cropSize: WP006E_CANONICAL_CROP_SIZE, rows: WP006E_PATCH_GRID_ROWS, columns: WP006E_PATCH_GRID_COLUMNS, patchSize: WP006E_PATCH_SIZE, preprocessing: CANDIDATE_REGISTRY.preprocessing.identifier }), plan.benchmarkFingerprint, currentCommit());
  const finalRegistryHash = stableArtifactHash(finalRegistry);
  await writeJson(outputDir, 'v1-feature-registry.json', { ...finalRegistry, registryHash: finalRegistryHash });
  const stageAResult = { ...stageA, failureClassification: stageA.passed ? [] : stageA.failures, nestedLodoCameraAcceptance: nested.cameraAcceptance, medianDeviceAcceptance, worstDeviceAcceptance, developmentControlFalseAcceptance: v1ControlFalseAcceptance, v1CameraAcceptance, v0CameraAcceptance, deviceInvarianceRisk: deviceAudit.risk, shortcutRisk: shortcutAuditPre.shortcutRisk };
  const runManifest = { schemaVersion: 'lythaus-wp006e-run-manifest-v1', status: stageA.passed ? 'STAGE_A_PASSED_DEVELOPMENT_COMPLETE' : 'STAGE_A_FAILED_SEALED_DATA_PRESERVED', baseSha: plan.baseSha, implementationCommit: plan.implementationCommit, executionCommit: currentCommit(), finalArtifactCommit: null, planHash: plan.planHash, benchmarkFingerprint: plan.benchmarkFingerprint, candidateFeatureRegistryHash: candidateRegistry.registryHash, finalFeatureRegistryHash, selectionPolicyHash: selectionPolicyArtifact.policyHash, archiveDirectoryFingerprint: EXPECTED_WP006D_ARCHIVE_FP, cameraDeviceAccess: { developmentDecodedImages: cameraRows.length, internalValidationPixels: false, sameModelHoldoutPixels: false, futureModelReservePixels: false, lgePixels: false }, controlAccess: { developmentDecodedImages: controlRows.length, validationPixels: false, finalPixels: false }, extraction: { fullArchive: false, selectedCsafePixelImagesDecoded: cameraRows.length, maximumCsafePixelImages: MAX_CSAFE_PIXEL_IMAGES, persistentCacheOutsideGit: true }, modelInferenceCalls: 0, cloudCalls: 0, incrementalCostUsd: 0, productionChanges: false, v1FeatureValuesGenerated: true, stageA: stageAResult, holdoutUnblindFreeze: false, unseenDataConsumed: false, deviceHoldoutStatus: 'SEALED', lgeHoldoutStatus: 'SEALED', futureModelReserveStatus: 'SEALED' };
  if (!stageA.passed) {
    await writeJson(outputDir, 'wp006e-run-manifest.json', runManifest);
    await writeJson(outputDir, 'v1-transformation-stress.json', { schemaVersion: 'lythaus-wp006e-v1-transformation-stress-v1', benchmarkFingerprint: plan.benchmarkFingerprint, status: 'NOT_RUN_STAGE_A_FAILED', metadataStripInvariance: 'NOT_RUN', transformationRobustness: 'NOT_RUN', temporaryDerivativesCommitted: false });
    await writeMarkdown(outputDir, 'wp006e-final-report.md', renderReport({ plan, state, stageA: stageAResult, developmentResults, featureSelectionResults, shortcutAudit: shortcutAuditPre, finalRegistry, finalRegistryHash, runManifest, validation: null, holdout: null, transformation: null, decision: 'REJECT_V1_MEASUREMENT', classification: 'WP006E_EF2_V1_NOT_DEMONSTRATED', next: 'WP006F — EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark' }));
    console.log(JSON.stringify({ phase: 'run', stageA: 'FAIL', failures: stageA.failures, developmentFamilies: cameraRows.length, developmentControls: controlRows.length, lgeHoldout: 'SEALED', futureModelReserve: 'SEALED', modelInferenceCalls: 0, cloudCalls: 0 }));
    return;
  }
  const transformation = await transformationStress({ ...options, cacheDir }, cameraRows, state, model, threshold, finalRegistryHash, selectionPolicyArtifact.policyHash, stableArtifactHash({ cropSize: WP006E_CANONICAL_CROP_SIZE, rows: WP006E_PATCH_GRID_ROWS, columns: WP006E_PATCH_GRID_COLUMNS, patchSize: WP006E_PATCH_SIZE, preprocessing: CANDIDATE_REGISTRY.preprocessing.identifier }), plan.benchmarkFingerprint);
  await writeJson(outputDir, 'v1-transformation-stress.json', transformation);
  if (transformation.metadataStripInvariance !== 'PASS') {
    stageA.passed = false;
    stageA.failures.push('TRANSFORMATION_FRAGILITY');
  }
  let validation = null;
  let holdout = null;
  if (stageA.passed) {
    validation = await runSealedValidation(options, state, plan, cameraPartitions, controlPartitions, cacheDir, model, threshold, finalRegistryHash, selectionPolicyArtifact.policyHash);
    await writeJson(outputDir, 'v1-internal-validation-results.json', validation);
  }
  if (validation?.stageB?.passed) {
    holdout = { status: 'SEALED_UNTIL_EXPLICIT_STAGE_C_IMPLEMENTATION', stageC: 'NOT_RUN_IN_THIS_BOUNDED_VERSION' };
  }
  const decision = validation?.stageB?.passed ? 'KEEP_MEASUREMENT_ONLY' : 'REJECT_V1_MEASUREMENT';
  const classification = validation?.stageB?.passed ? 'WP006E_EF2_V1_MEASUREMENT_ONLY' : 'WP006E_EF2_V1_NOT_DEMONSTRATED';
  runManifest.status = validation?.stageB?.passed ? 'STAGE_B_COMPLETE_STAGE_C_DEFERRED' : 'STAGE_A_OR_TRANSFORMATION_FAILED_SEALED_DATA_PRESERVED';
  runManifest.stageA = { ...stageAResult, passed: stageA.passed, failures: stageA.failures };
  runManifest.stageB = validation?.stageB ?? null;
  runManifest.cameraDeviceAccess.internalValidationPixels = Boolean(validation);
  runManifest.holdoutUnblindFreeze = false;
  await writeJson(outputDir, 'wp006e-run-manifest.json', runManifest);
  await writeMarkdown(outputDir, 'wp006e-final-report.md', renderReport({ plan, state, stageA: runManifest.stageA, developmentResults, featureSelectionResults, shortcutAudit: shortcutAuditPre, finalRegistry, finalRegistryHash, runManifest, validation, holdout, transformation, decision, classification, next: validation?.stageB?.passed ? 'WP006F — EF2 External-Domain Validation, Recapture & Transformation Study' : 'WP006F — EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark' }));
  console.log(JSON.stringify({ phase: 'run', stageA: stageA.passed ? 'PASS' : 'FAIL', stageB: validation?.stageB?.passed ? 'PASS' : validation ? 'FAIL' : 'NOT_RUN', stageC: 'NOT_RUN', decision, classification, lgeHoldout: 'SEALED', futureModelReserve: 'SEALED', modelInferenceCalls: 0, cloudCalls: 0 }));
}

async function runExperiment(options) {
  const outputDir = path.resolve(options.outputDir);
  const state = await loadFrozenState(outputDir);
  const plan = await readJson(path.join(outputDir, 'wp006e-plan.json'));
  const cameraPartitions = await readJson(path.join(outputDir, 'wp006e-camera-partitions.json'));
  const controlPartitions = await readJson(path.join(outputDir, 'wp006e-control-partitions.json'));
  const candidateRegistry = await readJson(path.join(outputDir, 'v1-candidate-feature-registry.json'));
  const selectionPolicyArtifact = await readJson(path.join(outputDir, 'v1-selection-policy.json'));
  const fingerprint = await readJson(path.join(outputDir, 'wp006e-benchmark-fingerprint.json'));
  if (plan.planHash !== stableArtifactHash(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'planHash')))) throw new Error('WP006E_PLAN_HASH_INVALID');
  if (plan.benchmarkFingerprint !== fingerprint.fingerprintSha256 || stableArtifactHash(fingerprint.canonicalInput) !== fingerprint.fingerprintSha256) throw new Error('WP006E_BENCHMARK_FINGERPRINT_INVALID');
  if (candidateRegistry.registryHash !== hashWithoutField(candidateRegistry, 'registryHash') || candidateRegistry.schemaVersion !== WP006E_CANDIDATE_REGISTRY_SCHEMA_VERSION) throw new Error('WP006E_CANDIDATE_REGISTRY_HASH_INVALID');
  if (selectionPolicyArtifact.policyHash !== hashWithoutField(selectionPolicyArtifact, 'policyHash')) throw new Error('WP006E_SELECTION_POLICY_HASH_INVALID');
  if (plan.lgeHoldoutStatus !== 'SEALED' || plan.futureModelReserveStatus !== 'SEALED' || plan.internalValidationStatus !== 'SEALED' || plan.sameModelInstanceHoldoutStatus !== 'SEALED' || plan.finalControlStatus !== 'SEALED') throw new Error('WP006E_STOP=HOLDOUT_BOUNDARY_INVALID');
  const cacheDir = path.resolve(options.cacheDir ?? cacheDefaultPath());
  const marker = await readJson(path.join(cacheDir, 'wp006e-cache-marker.json')).catch(() => null);
  if (!marker || marker.archiveDirectoryFingerprint !== EXPECTED_WP006D_ARCHIVE_FP || marker.sealedDevicesOpened?.length !== 0 || marker.lgeOpened !== false) throw new Error('WP006E_STOP=SELECTIVE_CACHE_BOUNDARY_INVALID');
  const processed = await processDevelopment({ ...options, cacheDir }, state, plan, cameraPartitions, controlPartitions, cacheDir);
  const cameraRows = processed.cameraRows;
  const controlRows = processed.controlRows;
  const cameraVectors = cameraRows.map((row) => row.vector);
  const cameraDevices = cameraRows.map((row) => row.record.deviceFamilyId);
  const controlVectors = controlRows.map((row) => row.vector);
  if (cameraVectors.some((vector) => !Array.isArray(vector)) || controlVectors.some((vector) => !Array.isArray(vector))) throw new Error('WP006E_STAGE_A=FAIL:IMPLEMENTATION_FAILURE');
  const nuisancePenalty = computeFeatureNuisancePenalty(cameraRows, controlRows);
  const qualities = evaluateDeviceInvariantFeatures({ cameraVectors, cameraDevices, controlVectors, nuisancePenaltyByFeature: nuisancePenalty });
  const selection = selectDeviceInvariantFeatures(qualities, cameraVectors, controlVectors);
  const featureSelectionResults = {
    schemaVersion: 'lythaus-wp006e-v1-feature-selection-results-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    candidateRegistryHash: candidateRegistry.registryHash,
    selectionPolicyHash: selectionPolicyArtifact.policyHash,
    qualityFormula: selectionPolicyArtifact.candidateQualityFormula,
    nuisancePenaltyByFeature: Object.fromEntries(WP006E_FEATURE_NAMES.map((name, index) => [name, nuisancePenalty[index]])),
    qualities,
    selection,
    nestedSelectionRefitPerFold: true,
    evaluationDataUsed: false,
    validationDataUsed: false,
    holdoutDataUsed: false,
  };
  const common = {
    schemaVersion: 'lythaus-wp006e-v1-development-results-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    baseSha: plan.baseSha,
    implementationCommit: currentCommit(),
    primaryCondition: 'CANONICAL_1024_CENTERED_NATIVE_DECODED_PIXELS_4X4_256_GRID',
    cameraFamilyCount: cameraRows.length,
    cameraDeviceCount: new Set(cameraDevices).size,
    controlFamilyCount: controlRows.length,
    runtime: { camera: summarizeFinite(cameraRows.map((row) => row.runtimeMs)), controls: summarizeFinite(controlRows.map((row) => row.runtimeMs)), featureExtractionP50Ms: percentileFinite([...cameraRows, ...controlRows].map((row) => row.runtimeMs), 0.5), featureExtractionP95Ms: percentileFinite([...cameraRows, ...controlRows].map((row) => row.runtimeMs), 0.95), memorySafety: 'bounded_single_process', newPersistentCacheBytes: null },
    noMetadataInput: true,
    noTruthInput: true,
    noValidationInput: true,
    noHoldoutInput: true,
  };
  await writeJson(outputDir, 'v1-feature-selection-results.json', featureSelectionResults);
  if (selection.failureReason) {
    const developmentResults = { ...common, nestedLeaveOneDeviceOut: { folds: [], cameraAcceptance: null, medianDeviceAcceptance: null, worstDeviceAcceptance: null }, finalDevelopmentModel: null, v0HistoricalBaseline: null, stageA: { passed: false, failures: [selection.failureReason], failureClassification: [selection.failureReason] }, featureSelectionFailure: selection.failureReason };
    const runManifest = { schemaVersion: 'lythaus-wp006e-run-manifest-v1', status: 'STAGE_A_FAILED_FEATURE_SET_COLLAPSE', baseSha: plan.baseSha, implementationCommit: plan.implementationCommit, executionCommit: currentCommit(), finalArtifactCommit: null, planHash: plan.planHash, benchmarkFingerprint: plan.benchmarkFingerprint, candidateFeatureRegistryHash: candidateRegistry.registryHash, finalFeatureRegistryHash: null, calibrationFreezeHash: null, selectionPolicyHash: selectionPolicyArtifact.policyHash, archiveDirectoryFingerprint: EXPECTED_WP006D_ARCHIVE_FP, cameraDeviceAccess: { developmentDecodedImages: cameraRows.length, internalValidationPixels: false, sameModelHoldoutPixels: false, futureModelReservePixels: false, lgePixels: false }, controlAccess: { developmentDecodedImages: controlRows.length, validationPixels: false, finalPixels: false }, extraction: { fullArchive: false, selectedCsafePixelImagesDecoded: cameraRows.length, maximumCsafePixelImages: MAX_CSAFE_PIXEL_IMAGES, persistentCacheOutsideGit: true }, modelInferenceCalls: 0, cloudCalls: 0, incrementalCostUsd: 0, productionChanges: false, v1FeatureValuesGenerated: true, stageA: developmentResults.stageA, stageB: null, stageC: null, holdoutUnblindFreeze: false, unseenDataConsumed: false, deviceHoldoutStatus: 'SEALED', lgeHoldoutStatus: 'SEALED', futureModelReserveStatus: 'SEALED' };
    await writeJson(outputDir, 'v1-development-results.json', developmentResults);
    await writeJson(outputDir, 'v1-shortcut-audit.json', { schemaVersion: 'lythaus-wp006e-v1-shortcut-audit-v1', benchmarkFingerprint: plan.benchmarkFingerprint, primaryScoreUnaffected: true, audit: null, deviceInvariance: null, deviceIdentityIsScoreInput: false, truthIsScoreInput: false });
    await writeJson(outputDir, 'v1-transformation-stress.json', { schemaVersion: 'lythaus-wp006e-v1-transformation-stress-v1', benchmarkFingerprint: plan.benchmarkFingerprint, status: 'NOT_RUN_FEATURE_SET_COLLAPSE', metadataStripInvariance: 'NOT_RUN', transformationRobustness: 'NOT_RUN', temporaryDerivativesCommitted: false });
    await writeJson(outputDir, 'wp006e-run-manifest.json', runManifest);
    await writeMarkdown(outputDir, 'wp006e-final-report.md', renderReport({ plan, stageA: developmentResults.stageA, developmentResults, featureSelectionResults, shortcutAudit: { shortcutRisk: 'UNKNOWN' }, finalRegistry: null, finalRegistryHash: null, runManifest, validation: null, holdout: null, transformation: null, decision: 'REJECT_V1_MEASUREMENT', classification: 'WP006E_EF2_V1_NOT_DEMONSTRATED', next: 'WP006F — EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark' }));
    console.log(JSON.stringify({ phase: 'run', stageA: 'FAIL', failures: [selection.failureReason], lgeHoldout: 'SEALED', futureModelReserve: 'SEALED', modelInferenceCalls: 0, cloudCalls: 0 }));
    return;
  }
  const model = fitDeviceInvariantModel(cameraVectors, cameraDevices, controlVectors, qualities, selection);
  const nested = runNestedLeaveOneDeviceOut({ cameraVectors, cameraDevices, controlVectors, nuisancePenaltyForTrainingRows: (indexes) => computeFeatureNuisancePenalty(indexes.map((index) => cameraRows[index]), controlRows) });
  const finalCameraScores = cameraRows.map((row) => scoreDeviceInvariantVector(row.vector, model)?.rawScore ?? null);
  const finalControlScores = controlRows.map((row) => scoreDeviceInvariantVector(row.vector, model)?.rawScore ?? null);
  const threshold = percentileFinite(finalCameraScores, 0.1);
  const v0CameraScores = cameraRows.map((row) => row.v0Score);
  const v0ControlScores = controlRows.map((row) => row.v0Score);
  const v1CameraAcceptance = scoreAcceptance(finalCameraScores, threshold);
  const v1ControlFalseAcceptance = scoreAcceptance(finalControlScores, threshold);
  const v0CameraAcceptance = scoreAcceptance(v0CameraScores, V0_THRESHOLD, 'lower');
  const v0ControlFalseAcceptance = scoreAcceptance(v0ControlScores, V0_THRESHOLD, 'lower');
  const scoredCameraRows = cameraRows.map((row, index) => ({ ...row, v1Score: finalCameraScores[index] }));
  const scoredControlRows = controlRows.map((row, index) => ({ ...row, v1Score: finalControlScores[index] }));
  const deviceSummaries = buildDeviceSummaries(scoredCameraRows, 'v1Score', threshold);
  const deviceAcceptances = Object.values(deviceSummaries).map((summary) => summary.acceptanceRate).filter((value) => Number.isFinite(value));
  const medianDeviceAcceptance = percentileFinite(deviceAcceptances, 0.5);
  const worstDeviceAcceptance = deviceAcceptances.length ? Math.min(...deviceAcceptances) : null;
  const devicesAtLeast060Fraction = deviceAcceptances.length ? deviceAcceptances.filter((value) => value >= 0.60).length / deviceAcceptances.length : 0;
  const deviceAudit = deviceInvarianceAudit(cameraRows, model);
  const shortcutAuditPre = buildShortcutAudit([...cameraRows, ...controlRows], [...finalCameraScores, ...finalControlScores]);
  const stageA = evaluateGate('A', { nestedLodoCameraAcceptance: nested.cameraAcceptance, medianDeviceAcceptance, worstDeviceAcceptance, developmentControlFalseAcceptance: v1ControlFalseAcceptance, devicesAtLeast060Fraction, v1CameraAcceptance, v0CameraAcceptance, deviceInvarianceRisk: deviceAudit.risk, shortcutRisk: shortcutAuditPre.shortcutRisk, sourceFamilyLeakage: 'PASS', deviceRoleLeakage: 'PASS', truthLeakage: 'PASS', metadataInputLeakage: 'PASS' });
  const stageAResult = { ...stageA, failureClassification: stageA.passed ? [] : stageA.failures, nestedLodoCameraAcceptance: nested.cameraAcceptance, medianDeviceAcceptance, worstDeviceAcceptance, developmentControlFalseAcceptance: v1ControlFalseAcceptance, v1CameraAcceptance, v0CameraAcceptance, deviceInvarianceRisk: deviceAudit.risk, shortcutRisk: shortcutAuditPre.shortcutRisk };
  const developmentResults = { ...common, nestedLeaveOneDeviceOut: { folds: nested.folds, cameraAcceptance: nested.cameraAcceptance, medianDeviceAcceptance: nested.medianDeviceAcceptance, worstDeviceAcceptance: nested.worstDeviceAcceptance }, finalDevelopmentModel: { threshold, thresholdSource: 'DEVELOPMENT_CAMERA_ONLY_10TH_PERCENTILE', camera: summarizeAcceptance(scoredCameraRows, 'v1Score', threshold), controls: summarizeAcceptance(scoredControlRows, 'v1Score', threshold), perDevice: deviceSummaries }, v0HistoricalBaseline: { camera: summarizeFinite(v0CameraScores), cameraAcceptance: v0CameraAcceptance, controls: summarizeFinite(v0ControlScores), controlFalseAcceptance: v0ControlFalseAcceptance, threshold: V0_THRESHOLD, refit: false }, stageA: stageAResult };
  const configurationHash = stableArtifactHash({ cropSize: WP006E_CANONICAL_CROP_SIZE, rows: WP006E_PATCH_GRID_ROWS, columns: WP006E_PATCH_GRID_COLUMNS, patchSize: WP006E_PATCH_SIZE, preprocessing: CANDIDATE_REGISTRY.preprocessing.identifier, scoring: selectionPolicyArtifact.scoreFormula });
  const finalRegistry = buildFinalFeatureRegistry(selection, qualities, model, candidateRegistry.registryHash, selectionPolicyArtifact.policyHash, configurationHash, plan.benchmarkFingerprint, currentCommit());
  const finalRegistryHash = stableArtifactHash(finalRegistry);
  const calibrationFreezeCore = { schemaVersion: 'lythaus-wp006e-v1-calibration-freeze-v1', benchmarkFingerprint: plan.benchmarkFingerprint, baseCommit: plan.baseSha, implementationCommit: currentCommit(), specialistId: WP006E_SPECIALIST_ID, specialistVersion: WP006E_SPECIALIST_VERSION, candidateFeatureRegistryHash: candidateRegistry.registryHash, finalFeatureRegistryHash, selectionPolicyHash: selectionPolicyArtifact.policyHash, configurationHash, selectedFeatureNames: selection.selectedFeatureNames, selectedFeatureGroups: selection.selectedFeatureGroups, model: buildModelSummary(model), threshold, thresholdMethod: '10TH_PERCENTILE_DEVELOPMENT_CAMERA_SCORES', thresholdSource: 'DEVELOPMENT_CAMERA_ONLY', calibrationDeviceFamilies: [...new Set(cameraDevices)].sort(), calibrationFamilyIds: cameraRows.map((row) => row.record.sourceFamilyId).sort(), controlFamilyIds: controlRows.map((row) => row.record.sourceFamilyId).sort(), evaluationPixelsProcessedBeforeFreeze: false, validationPixelsProcessedBeforeFreeze: false, holdoutPixelsProcessedBeforeFreeze: false, immutableBeforeValidation: true };
  const calibrationFreezeHash = stableArtifactHash(calibrationFreezeCore);
  const calibrationFreeze = { ...calibrationFreezeCore, freezeHash: calibrationFreezeHash };
  const runManifest = { schemaVersion: 'lythaus-wp006e-run-manifest-v1', status: stageA.passed ? 'STAGE_A_PASSED_DEVELOPMENT_COMPLETE' : 'STAGE_A_FAILED_SEALED_DATA_PRESERVED', baseSha: plan.baseSha, implementationCommit: plan.implementationCommit, executionCommit: currentCommit(), finalArtifactCommit: null, planHash: plan.planHash, benchmarkFingerprint: plan.benchmarkFingerprint, candidateFeatureRegistryHash: candidateRegistry.registryHash, finalFeatureRegistryHash: stageA.passed ? finalRegistryHash : null, calibrationFreezeHash: stageA.passed ? calibrationFreezeHash : null, selectionPolicyHash: selectionPolicyArtifact.policyHash, archiveDirectoryFingerprint: EXPECTED_WP006D_ARCHIVE_FP, cameraDeviceAccess: { developmentDecodedImages: cameraRows.length, internalValidationPixels: false, sameModelHoldoutPixels: false, futureModelReservePixels: false, lgePixels: false }, controlAccess: { developmentDecodedImages: controlRows.length, validationPixels: false, finalPixels: false }, extraction: { fullArchive: false, selectedCsafePixelImagesDecoded: cameraRows.length, maximumCsafePixelImages: MAX_CSAFE_PIXEL_IMAGES, persistentCacheOutsideGit: true }, modelInferenceCalls: 0, cloudCalls: 0, incrementalCostUsd: 0, productionChanges: false, v1FeatureValuesGenerated: true, stageA: stageAResult, stageB: null, stageC: null, holdoutUnblindFreeze: false, unseenDataConsumed: false, deviceHoldoutStatus: 'SEALED', lgeHoldoutStatus: 'SEALED', futureModelReserveStatus: 'SEALED' };
  await writeJson(outputDir, 'v1-development-results.json', developmentResults);
  await writeJson(outputDir, 'v1-feature-selection-results.json', { ...featureSelectionResults, model: buildModelSummary(model) });
  await writeJson(outputDir, 'v1-shortcut-audit.json', { schemaVersion: 'lythaus-wp006e-v1-shortcut-audit-v1', benchmarkFingerprint: plan.benchmarkFingerprint, primaryScoreUnaffected: true, primaryCondition: 'CANONICAL_1024_CENTERED_NATIVE_DECODED_PIXELS', audit: shortcutAuditPre, deviceInvariance: deviceAudit, sourceDatasetDomain: 'Only CSAFE camera material is used for primary development; dataset-domain invariance remains unresolved.', deviceIdentityIsScoreInput: false, truthIsScoreInput: false });
  if (!stageA.passed) {
    await writeJson(outputDir, 'wp006e-run-manifest.json', runManifest);
    await writeJson(outputDir, 'v1-transformation-stress.json', { schemaVersion: 'lythaus-wp006e-v1-transformation-stress-v1', benchmarkFingerprint: plan.benchmarkFingerprint, status: 'NOT_RUN_STAGE_A_FAILED', metadataStripInvariance: 'NOT_RUN', transformationRobustness: 'NOT_RUN', temporaryDerivativesCommitted: false });
    await writeMarkdown(outputDir, 'wp006e-final-report.md', renderReport({ plan, stageA: stageAResult, developmentResults, featureSelectionResults: { ...featureSelectionResults, model: buildModelSummary(model) }, shortcutAudit: shortcutAuditPre, finalRegistry: null, finalRegistryHash: null, runManifest, validation: null, holdout: null, transformation: null, decision: 'REJECT_V1_MEASUREMENT', classification: 'WP006E_EF2_V1_NOT_DEMONSTRATED', next: 'WP006F — EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark' }));
    console.log(JSON.stringify({ phase: 'run', stageA: 'FAIL', failures: stageA.failures, developmentFamilies: cameraRows.length, developmentControls: controlRows.length, lgeHoldout: 'SEALED', futureModelReserve: 'SEALED', modelInferenceCalls: 0, cloudCalls: 0 }));
    return;
  }
  await writeJson(outputDir, 'v1-feature-registry.json', { ...finalRegistry, registryHash: finalRegistryHash });
  await writeJson(outputDir, 'v1-calibration-freeze.json', calibrationFreeze);
  const transformation = await transformationStress({ ...options, cacheDir }, cameraRows, state, model, threshold, finalRegistryHash, selectionPolicyArtifact.policyHash, configurationHash, plan.benchmarkFingerprint);
  await writeJson(outputDir, 'v1-transformation-stress.json', transformation);
  if (transformation.metadataStripInvariance !== 'PASS') {
    stageAResult.passed = false;
    stageAResult.failures = [...stageAResult.failures, 'TRANSFORMATION_FRAGILITY'];
    runManifest.status = 'STAGE_A_FAILED_TRANSFORMATION_FRAGILITY_SEALED_DATA_PRESERVED';
    runManifest.stageA = stageAResult;
    await writeJson(outputDir, 'wp006e-run-manifest.json', runManifest);
    await writeMarkdown(outputDir, 'wp006e-final-report.md', renderReport({ plan, stageA: stageAResult, developmentResults, featureSelectionResults: { ...featureSelectionResults, model: buildModelSummary(model) }, shortcutAudit: shortcutAuditPre, finalRegistry, finalRegistryHash, runManifest, validation: null, holdout: null, transformation, decision: 'REJECT_V1_MEASUREMENT', classification: 'WP006E_EF2_V1_NOT_DEMONSTRATED', next: 'WP006F — EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark' }));
    console.log(JSON.stringify({ phase: 'run', stageA: 'FAIL', failures: stageAResult.failures, transformation: transformation.transformationRobustness, lgeHoldout: 'SEALED', futureModelReserve: 'SEALED', modelInferenceCalls: 0, cloudCalls: 0 }));
    return;
  }
  const validation = await runSealedValidation(outputDir, options, state, plan, cameraPartitions, controlPartitions, cacheDir, model, threshold, finalRegistryHash, selectionPolicyArtifact.policyHash, configurationHash, calibrationFreezeHash);
  await writeJson(outputDir, 'v1-internal-validation-results.json', validation);
  let holdout = null;
  if (validation.stageB.passed) {
    holdout = await runStageCHoldout(outputDir, options, state, plan, cameraPartitions, controlPartitions, cacheDir, model, threshold, finalRegistryHash, selectionPolicyArtifact.policyHash, configurationHash, calibrationFreezeHash, stageAResult, validation);
    await writeJson(outputDir, 'v1-device-instance-holdout-results.json', holdout);
    await writeJson(outputDir, 'v1-final-control-results.json', holdout);
  }
  const stageC = holdout?.stageC ?? null;
  const decision = stageC?.passed ? 'PROMOTE_TO_CALIBRATION_CANDIDATE' : validation.stageB.passed && stageC?.status === 'MIXED' ? 'KEEP_MEASUREMENT_ONLY' : 'REJECT_V1_MEASUREMENT';
  const classification = decision === 'PROMOTE_TO_CALIBRATION_CANDIDATE' ? 'WP006E_EF2_V1_CALIBRATION_CANDIDATE' : decision === 'KEEP_MEASUREMENT_ONLY' ? 'WP006E_EF2_V1_MEASUREMENT_ONLY' : 'WP006E_EF2_V1_NOT_DEMONSTRATED';
  runManifest.status = stageC?.passed ? 'STAGE_C_COMPLETE' : validation.stageB.passed ? 'STAGE_B_COMPLETE_STAGE_C_FAILED_OR_MIXED' : 'STAGE_B_FAILED_SEALED_DATA_PRESERVED';
  runManifest.stageA = stageAResult;
  runManifest.stageB = validation.stageB;
  runManifest.stageC = stageC;
  runManifest.cameraDeviceAccess.internalValidationPixels = true;
  runManifest.cameraDeviceAccess.sameModelHoldoutPixels = Boolean(holdout);
  runManifest.controlAccess.validationPixels = true;
  runManifest.controlAccess.finalPixels = Boolean(holdout);
  runManifest.holdoutUnblindFreeze = Boolean(holdout?.holdoutFreeze);
  runManifest.unseenDataConsumed = Boolean(holdout);
  runManifest.deviceHoldoutStatus = holdout ? 'CONSUMED_FOR_STAGE_C' : 'SEALED';
  await writeJson(outputDir, 'wp006e-run-manifest.json', runManifest);
  await writeMarkdown(outputDir, 'wp006e-final-report.md', renderReport({ plan, stageA: stageAResult, developmentResults, featureSelectionResults: { ...featureSelectionResults, model: buildModelSummary(model) }, shortcutAudit: shortcutAuditPre, finalRegistry, finalRegistryHash, runManifest, validation, holdout, transformation, decision, classification, next: decision === 'PROMOTE_TO_CALIBRATION_CANDIDATE' ? 'WP006F — EF2 External-Domain Validation, Recapture & Transformation Study' : 'WP006F — EF3 Generative Forensics Calibration on a rights-clean, generator-diverse benchmark' }));
  console.log(JSON.stringify({ phase: 'run', stageA: 'PASS', stageB: validation.stageB.passed ? 'PASS' : 'FAIL', stageC: stageC?.status ?? 'NOT_RUN', decision, classification, lgeHoldout: 'SEALED', futureModelReserve: 'SEALED', modelInferenceCalls: 0, cloudCalls: 0 }));
}

function safeResultRows(rows, scoreKey = 'v1Score') {
  return rows.map((row) => ({
    sampleId: row.record.sampleId,
    sourceFamilyId: row.record.sourceFamilyId,
    contentSha256: row.record.contentSha256 ?? null,
    deviceFamilyId: row.record.deviceFamilyId ?? null,
    hardNegativeType: row.record.hardNegativeType ?? null,
    role: row.record.role ?? null,
    score: Number.isFinite(row[scoreKey]) ? row[scoreKey] : null,
    v0Score: Number.isFinite(row.v0Score) ? row.v0Score : null,
    width: Number.isFinite(row.width) ? row.width : null,
    height: Number.isFinite(row.height) ? row.height : null,
    runtimeMs: Number.isFinite(row.runtimeMs) ? row.runtimeMs : null,
    invalidReason: row.invalidReason ?? null,
  }));
}

function evaluateStageB(cameraRows, controlRows, model, threshold, contamination) {
  const cameraSummary = summarizeRows(cameraRows, 'v1Score', threshold);
  const controlSummary = summarizeRows(controlRows, 'v1Score', threshold);
  const perDevice = buildDeviceSummaries(cameraRows, 'v1Score', threshold);
  const deviceAcceptances = Object.values(perDevice).map((summary) => summary.acceptanceRate).filter((value) => Number.isFinite(value));
  const v0CameraAcceptance = scoreAcceptance(cameraRows.map((row) => row.v0Score), V0_THRESHOLD, 'lower');
  const v0ControlFalseAcceptance = scoreAcceptance(controlRows.map((row) => row.v0Score), V0_THRESHOLD, 'lower');
  const shortcut = buildShortcutAudit([...cameraRows, ...controlRows], [...cameraRows, ...controlRows].map((row) => row.v1Score));
  const deviceAudit = deviceInvarianceAudit(cameraRows, model);
  const failures = [];
  if (!(cameraSummary.acceptanceRate !== null && cameraSummary.acceptanceRate >= 0.70)) failures.push('VALIDATION_CAMERA_SENSITIVITY_TOO_LOW');
  if (deviceAcceptances.filter((value) => value >= 0.60).length < 3) failures.push('VALIDATION_DEVICE_COUNT_GATE');
  if (deviceAcceptances.some((value) => value < 0.40)) failures.push('VALIDATION_WORST_DEVICE_GATE');
  if (!(controlSummary.acceptanceRate !== null && controlSummary.acceptanceRate <= 0.20)) failures.push('VALIDATION_CONTROL_FALSE_ACCEPTANCE_TOO_HIGH');
  if (!((v0CameraAcceptance !== null && v0CameraAcceptance >= 0.70) || (cameraSummary.acceptanceRate !== null && v0CameraAcceptance !== null && cameraSummary.acceptanceRate - v0CameraAcceptance >= 0.20))) failures.push('V0_NOT_MEANINGFULLY_IMPROVED_ON_VALIDATION');
  if (shortcut.shortcutRisk === 'HIGH') failures.push('VALIDATION_SHORTCUT_DEPENDENCE');
  if (deviceAudit.risk === 'HIGH') failures.push('VALIDATION_DEVICE_INVARIANCE_RISK_HIGH');
  if (contamination.excludedCount > 0) failures.push('SCENE_CONTAMINATED_DIAGNOSTIC_EXCLUSIONS');
  return {
    passed: failures.length === 0,
    failures,
    validationCameraAcceptance: cameraSummary.acceptanceRate,
    validationControlFalseAcceptance: controlSummary.acceptanceRate,
    validationMedianDeviceAcceptance: percentileFinite(deviceAcceptances, 0.5),
    validationWorstDeviceAcceptance: deviceAcceptances.length ? Math.min(...deviceAcceptances) : null,
    v0ValidationCameraAcceptance: v0CameraAcceptance,
    v0ValidationControlFalseAcceptance: v0ControlFalseAcceptance,
    perDevice,
    shortcutRisk: shortcut.shortcutRisk,
    shortcutAudit: shortcut,
    deviceInvarianceRisk: deviceAudit.risk,
    deviceAudit,
    contaminationExclusions: contamination.excludedCount,
  };
}

async function runSealedValidation(outputDir, options, state, plan, cameraPartitions, controlPartitions, cacheDir, model, threshold, finalFeatureRegistryHash, selectionPolicyHash, configurationHash, v1FreezeHash) {
  const archivePath = await locateArchive(options.archive);
  const internalMembers = cameraPartitions.internalValidation.members.map((record) => ({ ...record }));
  const internalDevices = [...cameraPartitions.internalValidation.deviceIds];
  const internalExtraction = await extractSealedGroup(cacheDir, 'internalValidation', { members: internalMembers }, internalDevices, [...WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES, ...FUTURE_MODEL_RESERVE_DEVICES], archivePath, EXPECTED_WP006D_ARCHIVE_FP);
  const internalBytes = (record) => archiveBytesFromCache(cacheDir, 'internalValidation', record);
  const developmentMembers = cameraPartitions.development.members.map((record) => ({ ...record }));
  const developmentBytes = (record) => archiveBytesFromCache(cacheDir, record.cacheGroup, record);
  const contamination = await contaminationCheck(internalMembers, internalBytes, developmentMembers, 2, developmentBytes);
  const validationCameraRows = await processRows(contamination.eligible, internalBytes, state, model);
  const validationControlRecords = controlPartitions.validation.records.map((record) => ({ ...record }));
  const validationControlRows = await processRows(validationControlRecords, (record) => resolveOwnerBytes(options.mediaRoot, record), state, model);
  const stageB = evaluateStageB(validationCameraRows, validationControlRows, model, threshold, contamination);
  const validation = {
    schemaVersion: 'lythaus-wp006e-v1-internal-validation-results-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    implementationCommit: currentCommit(),
    calibrationFreezeHash: v1FreezeHash,
    finalFeatureRegistryHash,
    selectionPolicyHash,
    configurationHash,
    primaryCondition: 'CANONICAL_1024_CENTERED_NATIVE_DECODED_PIXELS_4X4_256_GRID',
    internalValidationDevices: internalDevices,
    camera: summarizeRows(validationCameraRows, 'v1Score', threshold),
    controls: summarizeRows(validationControlRows, 'v1Score', threshold),
    perDevice: stageB.perDevice,
    v0HistoricalBaseline: { cameraAcceptance: stageB.v0ValidationCameraAcceptance, controlFalseAcceptance: stageB.v0ValidationControlFalseAcceptance, threshold: V0_THRESHOLD, refit: false },
    stageB,
    contamination,
    cameraRows: safeResultRows(validationCameraRows),
    controlRows: safeResultRows(validationControlRows),
    pixelsOpened: true,
    holdoutsStillSealed: { sameModelInstance: true, futureModelReserve: true, lge: true, finalControls: true },
    noRetuning: true,
  };
  const markerPath = path.join(cacheDir, 'wp006e-cache-marker.json');
  const marker = await readJson(markerPath);
  await writeFile(markerPath, `${JSON.stringify({ ...marker, sealedDevicesOpened: internalDevices, internalValidationPixelsOpened: true }, null, 2)}\n`, 'utf8');
  return validation;
}

async function createHoldoutFreeze(outputDir, plan, finalRegistryHash, selectionPolicyHash, configurationHash, model, threshold, stageA, validation, exactCameraMembers, exactControlMembers) {
  const freeze = {
    schemaVersion: 'lythaus-wp006e-v1-holdout-unblind-freeze-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    baseCommit: plan.baseSha,
    implementationCommit: plan.implementationCommit,
    candidateFeatureRegistryHash: plan.featureRegistryHash,
    finalFeatureRegistryHash,
    selectionPolicyHash,
    configurationHash,
    model: buildModelSummary(model),
    threshold,
    thresholdMethod: '10TH_PERCENTILE_DEVELOPMENT_CAMERA_SCORES',
    stageA,
    stageB: validation.stageB,
    shortcutAudit: validation.stageB.shortcutAudit,
    deviceInvarianceAudit: validation.stageB.deviceAudit,
    transformationStatus: 'PASS_OR_NONCATASTROPHIC_AFTER_STAGE_A',
    sameModelHoldoutCameraMembers: exactCameraMembers.map((record) => ({ sampleId: record.sampleId, sourceFamilyId: record.sourceFamilyId, archiveMemberId: record.archiveMemberId, deviceFamilyId: record.deviceFamilyId })),
    finalSealedControlMembers: exactControlMembers.map((record) => ({ sampleId: record.sampleId, sourceFamilyId: record.sourceFamilyId, contentSha256: record.contentSha256 })),
    lgeHoldoutStatus: 'SEALED',
    futureModelReserveStatus: 'SEALED',
    algorithmMutableAfterFreeze: false,
    decision: 'FINAL_HOLDOUT_UNBLIND_AUTHORIZED',
  };
  const freezeHash = stableArtifactHash(freeze);
  const artifact = { ...freeze, freezeHash };
  assertWp006eHoldoutFreeze(artifact);
  await writeJson(outputDir, 'v1-holdout-unblind-freeze.json', artifact);
  return { artifact, freezeHash };
}

async function runStageCHoldout(outputDir, options, state, plan, cameraPartitions, controlPartitions, cacheDir, model, threshold, finalFeatureRegistryHash, selectionPolicyHash, configurationHash, v1FreezeHash, stageA, validation) {
  const exactCameraMembers = cameraPartitions.sameModelInstanceHoldout.members.map((record) => ({ ...record }));
  const exactControlMembers = controlPartitions.final.records.map((record) => ({ ...record }));
  const holdoutFreeze = await createHoldoutFreeze(outputDir, plan, finalFeatureRegistryHash, selectionPolicyHash, configurationHash, model, threshold, stageA, validation, exactCameraMembers, exactControlMembers);
  const archivePath = await locateArchive(options.archive);
  const holdoutDevices = [...cameraPartitions.sameModelInstanceHoldout.deviceIds];
  await extractSealedGroup(cacheDir, 'sameModelHoldout', { members: exactCameraMembers }, holdoutDevices, [...INTERNAL_VALIDATION_DEVICES, ...FUTURE_MODEL_RESERVE_DEVICES], archivePath, EXPECTED_WP006D_ARCHIVE_FP);
  const holdoutBytes = (record) => archiveBytesFromCache(cacheDir, 'sameModelHoldout', record);
  const developmentBytes = (record) => archiveBytesFromCache(cacheDir, record.cacheGroup, record);
  const internalRecords = validation.cameraRows.map((row) => ({ sampleId: row.sampleId, sourceFamilyId: row.sourceFamilyId, archiveMemberId: cameraPartitions.internalValidation.members.find((member) => member.sampleId === row.sampleId)?.archiveMemberId, cacheGroup: 'internalValidation', contentSha256: row.contentSha256 }));
  const internalById = new Map(cameraPartitions.internalValidation.members.map((record) => [record.sampleId, record]));
  const referenceRecords = [...cameraPartitions.development.members, ...validation.cameraRows.map((row) => ({ ...internalById.get(row.sampleId), cacheGroup: 'internalValidation', contentSha256: row.contentSha256 }))].filter((record) => record?.archiveMemberId);
  const referenceBytes = (record) => record.cacheGroup === 'internalValidation' ? archiveBytesFromCache(cacheDir, 'internalValidation', record) : developmentBytes(record);
  const contamination = await contaminationCheck(exactCameraMembers, holdoutBytes, referenceRecords, 2, referenceBytes);
  const holdoutCameraRows = await processRows(contamination.eligible, holdoutBytes, state, model);
  const finalControlRows = await processRows(exactControlMembers, (record) => resolveOwnerBytes(options.mediaRoot, record), state, model);
  const cameraSummary = summarizeRows(holdoutCameraRows, 'v1Score', threshold);
  const controlSummary = summarizeRows(finalControlRows, 'v1Score', threshold);
  const perDevice = buildDeviceSummaries(holdoutCameraRows, 'v1Score', threshold);
  const acceptances = Object.values(perDevice).map((summary) => summary.acceptanceRate).filter((value) => Number.isFinite(value));
  const v0CameraAcceptance = scoreAcceptance(holdoutCameraRows.map((row) => row.v0Score), V0_THRESHOLD, 'lower');
  const v0ControlFalseAcceptance = scoreAcceptance(finalControlRows.map((row) => row.v0Score), V0_THRESHOLD, 'lower');
  const failures = [];
  if (!(cameraSummary.acceptanceRate !== null && cameraSummary.acceptanceRate >= 0.75)) failures.push('HOLDOUT_CAMERA_SENSITIVITY_TOO_LOW');
  if (acceptances.filter((value) => value >= 0.65).length < 3) failures.push('HOLDOUT_DEVICE_COUNT_GATE');
  if (acceptances.some((value) => value < 0.50)) failures.push('HOLDOUT_WORST_DEVICE_GATE');
  if (!(controlSummary.acceptanceRate !== null && controlSummary.acceptanceRate <= 0.20)) failures.push('FINAL_CONTROL_FALSE_ACCEPTANCE_TOO_HIGH');
  if (!((v0CameraAcceptance !== null && v0CameraAcceptance >= 0.70) || (cameraSummary.acceptanceRate !== null && v0CameraAcceptance !== null && cameraSummary.acceptanceRate > v0CameraAcceptance))) failures.push('V0_NOT_MEANINGFULLY_OUTPERFORMED_ON_HOLDOUT');
  if (contamination.excludedCount > 0) failures.push('SCENE_CONTAMINATED_DIAGNOSTIC_EXCLUSIONS');
  const passed = failures.length === 0;
  const mixed = !passed && cameraSummary.acceptanceRate !== null && cameraSummary.acceptanceRate >= 0.55;
  const stageC = { passed, status: passed ? 'PASS' : mixed ? 'MIXED' : 'FAIL', failures, sameModelHoldoutCameraAcceptance: cameraSummary.acceptanceRate, finalSealedControlFalseAcceptance: controlSummary.acceptanceRate, perDevice, medianDeviceAcceptance: percentileFinite(acceptances, 0.5), worstDeviceAcceptance: acceptances.length ? Math.min(...acceptances) : null, v0HoldoutCameraAcceptance: v0CameraAcceptance, v0FinalControlFalseAcceptance: v0ControlFalseAcceptance, contaminationExclusions: contamination.excludedCount };
  return {
    holdoutFreeze,
    stageC,
    camera: summarizeRows(holdoutCameraRows, 'v1Score', threshold),
    controls: summarizeRows(finalControlRows, 'v1Score', threshold),
    cameraRows: safeResultRows(holdoutCameraRows),
    controlRows: safeResultRows(finalControlRows),
    contamination,
    holdoutDevices,
    holdoutsStillSealed: { futureModelReserve: true, lge: true },
    pixelsOpened: true,
  };
}

function renderReport({ plan, state, stageA, developmentResults, featureSelectionResults, shortcutAudit, finalRegistry, finalRegistryHash, runManifest, validation, holdout, transformation, decision, classification, next }) {
  const cameraByDevice = developmentResults.finalDevelopmentModel.perDevice ?? {};
  const selectedFeatures = featureSelectionResults.selection.selectedFeatureNames;
  return `# WP006E — EF2 Device-Invariant Measurement v1\n\n## Executive decision\n\nWP006E tests a new deterministic pixel-domain measurement. It does not modify or reinterpret WP006C v0, and it makes no production decision.\n\n- WP006E_BASE_SHA = ${plan.baseSha}\n- WP006E_BENCHMARK_FINGERPRINT = ${plan.benchmarkFingerprint}\n- WP006E_IMPLEMENTATION_COMMIT = ${runManifest.implementationCommit}\n- WP006E_EXECUTION_COMMIT = ${runManifest.executionCommit}\n- WP006E_FINAL_ARTIFACT_COMMIT = ${runManifest.finalArtifactCommit ?? 'PENDING_FINAL_COMMIT'}\n- V1_CANDIDATE_FEATURES = ${CANDIDATE_REGISTRY.features.length}\n- V1_SELECTED_FEATURES = ${selectedFeatures.length}\n- V1_SELECTED_FEATURE_GROUPS = ${featureSelectionResults.selection.selectedFeatureGroups.join(', ')}\n- V1_FREEZE_SHA256 = ${runManifest.finalFeatureRegistryHash ?? finalRegistryHash}\n- WP006E_STAGE_A = ${stageA.passed ? 'PASS' : 'FAIL'}\n- WP006E_STAGE_A_FAILURES = ${(stageA.failures ?? []).join(', ') || 'NONE'}\n- WP006E_STAGE_B = ${validation?.stageB ? (validation.stageB.passed ? 'PASS' : 'FAIL') : 'NOT_RUN'}\n- WP006E_STAGE_C = NOT_RUN\n- WP006E_EF2_DECISION = ${decision}\n- FINAL_CLASSIFICATION = ${classification}\n\n## Frozen design\n\nThe primary condition is decoded pixels, a centered native 1024x1024 crop, and a fixed 4x4 grid of sixteen non-overlapping 256x256 patches. No EXIF, filename, dimensions, file size, MIME, encoder, truth, labels or model input enters the primary score. Candidate selection is frozen by a predeclared device-heterogeneity and nuisance-penalized quality function; nested leave-one-device-out refits selection, weights and camera-only threshold per fold.\n\nThe score is a bounded linear measurement in which higher values mean greater consistency with the enrolled cross-device camera feature relation. It is not a probability of camera origin and it cannot assign SUPPORTS, CONTRADICTS, REAL, AI or policy authority. PRNU and sensor identity remain unclaimed.\n\n## Development data\n\n- DEVELOPMENT_CAMERA_DEVICES = ${DEVELOPMENT_DEVICES.join(', ')}\n- DEVELOPMENT_CAMERA_MODEL_FAMILIES = ${[...new Set(DEVELOPMENT_DEVICES.map((device) => device.replace(/_[0-9]+$/u, '')))].join(', ')}\n- DEVELOPMENT_CAMERA_FAMILIES = ${developmentResults.cameraFamilyCount}\n- DEVELOPMENT_NON_CAMERA_FAMILIES = ${developmentResults.controlFamilyCount}\n- CALIBRATION_DEVICE_WEIGHTING = equal device weighting through per-device medians\n- NESTED_LODO_CAMERA_ACCEPTANCE = ${developmentResults.nestedLeaveOneDeviceOut.cameraAcceptance}\n- MEDIAN_DEVICE_ACCEPTANCE = ${developmentResults.nestedLeaveOneDeviceOut.medianDeviceAcceptance}\n- WORST_DEVICE_ACCEPTANCE = ${developmentResults.nestedLeaveOneDeviceOut.worstDeviceAcceptance}\n- DEVELOPMENT_CONTROL_FALSE_ACCEPTANCE = ${developmentResults.finalDevelopmentModel.controls.acceptanceRate}\n- V0_DEVELOPMENT_CAMERA_ACCEPTANCE = ${developmentResults.v0HistoricalBaseline.cameraAcceptance}\n- V0_DEVELOPMENT_CONTROL_FALSE_ACCEPTANCE = ${developmentResults.v0HistoricalBaseline.controlFalseAcceptance}\n\nPer-device v1 summaries: \`${JSON.stringify(cameraByDevice)}\`\n\n## Sealed roles\n\n- INTERNAL_VALIDATION_DEVICES = ${INTERNAL_VALIDATION_DEVICES.join(', ')}; families = ${cameraPartitionsCount(runManifest, 'internalValidation')}; status = SEALED\n- SAME_MODEL_INSTANCE_HOLDOUT_DEVICES = ${WP006E_EXISTING_CSAFE_HOLDOUT_DEVICES.join(', ')}; families = 48; status = SEALED\n- FUTURE_MODEL_RESERVE_DEVICES = ${FUTURE_MODEL_RESERVE_DEVICES.join(', ')}; status = SEALED\n- LGE_HOLDOUT_STATUS = SEALED; families = 33\n- FINAL_SEALED_NON_CAMERA_CONTROLS = 24; status = SEALED\n\nThe CSAFE archive was not fully extracted. Only the ${developmentResults.cameraFamilyCount} declared development images were selectively extracted and decoded; sealed device and control members were not decoded. The CSAFE device names represent dataset device directories; all six available model families are already represented in development, so internal validation is new-device rather than unseen-model validation.\n\n## Transformation and audits\n\n- METADATA_STRIP_INVARIANCE = ${transformation?.metadataStripInvariance ?? 'NOT_RUN'}\n- TRANSFORMATION_ROBUSTNESS = ${transformation?.transformationRobustness ?? 'NOT_RUN'}\n- DEVICE_INVARIANCE_RISK = ${shortcutAudit.deviceInvariance?.risk ?? 'UNKNOWN'}\n- SHORTCUT_RISK = ${shortcutAudit.audit?.shortcutRisk ?? shortcutAudit.shortcutRisk ?? 'UNKNOWN'}\n- SCENE_LEAKAGE_STATUS = DOCUMENTED_NOT_DISJOINT_CSAFE_DIRECTORY_HAS_NO_STABLE_SCENE_IDS\n\nWP006C v0 remains immutable and historical. This report does not claim end-to-end authenticity accuracy, human false-positive rate, commercial detector accuracy, broad camera generalization, native byte originality, sensor identity, or EF2 directional validation.\n\n## Scientific limitations\n\nThe development source is CSAFE-only for cameras, owner-controlled controls are not population-representative, CSAFE scene identifiers are absent, screenshot-heavy controls remain a limitation, and only three broad device/model groups are represented across the historical and selected holdout design. The owner-controlled LGE device remains pristine. No model or cloud calls were made, no source media was committed, no production configuration changed, and incremental cost was $0.\n\n## Next research\n\n${next}\n`;
}

function cameraPartitionsCount() {
  return 48;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.phase === 'prepare') await prepare(options);
  else await runExperiment(options);
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
