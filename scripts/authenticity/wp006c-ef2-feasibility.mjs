import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EF2_CONFIG,
  EF2_FEATURE_NAMES,
  EF2_FEATURE_REGISTRY,
  WP006C_BENCHMARK_VERSION,
  WP006C_CALIBRATION_FREEZE_SCHEMA_VERSION,
  WP006C_EXPECTED_BASE_SHA,
  WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
  WP006C_FEATURE_REGISTRY_SCHEMA_VERSION,
  WP006C_HOLDOUT_DEVICE,
  WP006C_PLAN_SCHEMA_VERSION,
  WP006C_PRNU_STATUS,
  WP006C_RESULT_SCHEMA_VERSION,
  WP006C_RUN_MANIFEST_SCHEMA_VERSION,
  WP006C_SPECIALIST_ID,
  WP006C_SPECIALIST_VERSION,
  assertBlindDecodedPixels,
  assertCalibrationOnlyFreeze,
  assertHoldoutUnblindFreeze,
  assertNoVerdictFields,
  bootstrapAuc,
  buildSpecialistMeasurement,
  cliffsDelta,
  extractEf2FeatureVector,
  fitDeviceBalancedCameraModel,
  medianFinite,
  percentileFinite,
  rocAuc,
  scoreEf2FeatureVector,
  sha256Hex,
  stableArtifactHash,
  summarizeScores,
} from '../../packages/authenticity/src/wp006c.ts';
import {
  WP006B_BENCHMARK_SCHEMA_VERSION,
  assertWp006bBenchmarkManifest,
  assertWp006bFingerprint,
  assertWp006bRightsManifest,
  assertWp006bSplitsManifest,
  buildWp006bFingerprintInput,
  stableStringify,
} from '../../packages/authenticity/src/wp006b.ts';

const OUTPUT_DEFAULT = 'research/wp006c';
const OWNER_ROOT_LABEL = 'external-owner-seed/wp004a-observer-v0/originals';
const OWNER_ROOT_ENV = 'WP006C_MEDIA_ROOT';
const CAMERA_CATEGORY = 'CAMERA_ORIGINAL_CANDIDATE';
const SYNTHETIC_CATEGORY = 'SYNTHETIC_CANDIDATE';
const HARD_NEGATIVE_CATEGORY = 'HARD_NEGATIVE_CANDIDATE';
const ACTIVE_SPLITS = new Set(['CALIBRATION', 'EVALUATION']);
const REQUIRED_SEEN_DEVICES = new Set(['samsung Galaxy A56 5G', 'samsung SM-A526B']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const TRANSFORMATIONS = ['metadataStripped', 'JPEG95', 'JPEG75', 'resize75', 'crop10'];
const STAGE_A_FAILURES = [];

function parseArgs(argv) {
  const options = { phase: 'run', outputDir: OUTPUT_DEFAULT, mediaRoot: process.env[OWNER_ROOT_ENV] ?? null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--phase') options.phase = argv[++index];
    else if (argument === '--output-dir') options.outputDir = argv[++index];
    else if (argument === '--media-root') options.mediaRoot = argv[++index];
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!['prepare', 'run'].includes(options.phase)) throw new Error('phase_invalid');
  return options;
}

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function workingTreeStatus() {
  return execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeJson(outputDir, filename, value) {
  const target = path.resolve(outputDir, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function requireSharp() {
  try {
    const require = createRequire(import.meta.url);
    const sharp = require('sharp');
    if (typeof sharp !== 'function') throw new Error('sharp_not_callable');
    return sharp;
  } catch (error) {
    throw new Error(`sharp_runtime_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
  }
}

function manifestPaths(outputDir) {
  return {
    manifest: path.resolve(outputDir, '../wp006b/benchmark-manifest.json'),
    rights: path.resolve(outputDir, '../wp006b/benchmark-rights.json'),
    splits: path.resolve(outputDir, '../wp006b/benchmark-splits.json'),
    fingerprint: path.resolve(outputDir, '../wp006b/benchmark-fingerprint.json'),
    readiness: path.resolve(outputDir, '../wp006b/ef2-data-readiness.json'),
    holdout: path.resolve(outputDir, '../wp006b/reserved-holdout-manifest.json'),
  };
}

async function loadFrozenBenchmark(outputDir) {
  const files = manifestPaths(outputDir);
  const [manifest, rights, splits, fingerprint, readiness, holdout] = await Promise.all([
    readJson(files.manifest),
    readJson(files.rights),
    readJson(files.splits),
    readJson(files.fingerprint),
    readJson(files.readiness),
    readJson(files.holdout),
  ]);
  assertWp006bBenchmarkManifest(manifest);
  assertWp006bRightsManifest(rights);
  assertWp006bSplitsManifest(splits);
  assertWp006bFingerprint(fingerprint);
  if (manifest.schemaVersion !== WP006B_BENCHMARK_SCHEMA_VERSION || manifest.specialistInferenceRun !== false) throw new Error('wp006c_benchmark_header_invalid');
  if (fingerprint.benchmarkVersion !== WP006C_BENCHMARK_VERSION || fingerprint.fingerprintSha256 !== WP006C_EXPECTED_BENCHMARK_FINGERPRINT) throw new Error('wp006c_benchmark_fingerprint_mismatch');
  if (readiness.EF2_DATA_READINESS !== 'READY_FOR_BOUNDED_FEASIBILITY') throw new Error('wp006c_ef2_readiness_invalid');
  const currentHelperInput = buildWp006bFingerprintInput({ manifest, rights, splits });
  const artifactCanonicalInput = fingerprint.canonicalInput;
  const artifactFingerprint = sha256Hex(stableStringify(artifactCanonicalInput));
  if (artifactFingerprint !== WP006C_EXPECTED_BENCHMARK_FINGERPRINT) throw new Error('wp006c_recomputed_benchmark_fingerprint_mismatch');
  for (const key of Object.keys(currentHelperInput)) {
    if (stableStringify(currentHelperInput[key]) !== stableStringify(artifactCanonicalInput[key])) throw new Error(`wp006c_benchmark_canonical_field_mismatch:${key}`);
  }
  const holdoutRecords = Array.isArray(holdout.records) ? holdout.records : [];
  const lgeRecords = holdoutRecords.filter((record) => record.cameraDeviceFamily === WP006C_HOLDOUT_DEVICE && record.split === 'DEVICE_HOLDOUT');
  if (lgeRecords.length !== 33) throw new Error(`wp006c_lge_holdout_count_invalid:${lgeRecords.length}`);
  const allActiveCamera = manifest.samples.filter((sample) => sample.candidateCategory === CAMERA_CATEGORY && ACTIVE_SPLITS.has(sample.split));
  if (allActiveCamera.length !== 32) throw new Error(`wp006c_active_camera_count_invalid:${allActiveCamera.length}`);
  const activeDevices = new Set(allActiveCamera.map((sample) => sample.cameraDeviceFamily).filter(Boolean));
  if (activeDevices.size !== REQUIRED_SEEN_DEVICES.size || [...REQUIRED_SEEN_DEVICES].some((device) => !activeDevices.has(device))) throw new Error('wp006c_active_device_boundary_invalid');
  return { manifest, rights, splits, fingerprint, readiness, holdout, lgeRecords, canonicalInput: artifactCanonicalInput };
}

function rightsBySample(benchmark) {
  return new Map(benchmark.rights.records.map((record) => [record.sampleId, record]));
}

function eligibleRecord(record, benchmark, purpose) {
  const rights = rightsBySample(benchmark).get(record.sampleId);
  if (!rights) return { eligible: false, reason: 'rights_record_missing' };
  if (record.evaluationGate !== 'ALLOW' || rights.evaluationRights !== 'CONFIRMED' || rights.readiness === 'REJECT') return { eligible: false, reason: 'evaluation_rights_not_allowed' };
  if (purpose === 'calibration' && (record.calibrationEligible !== true || record.split !== 'CALIBRATION')) return { eligible: false, reason: 'calibration_gate_not_met' };
  if (purpose === 'evaluation' && (record.evaluationEligible !== true || record.split !== 'EVALUATION')) return { eligible: false, reason: 'evaluation_gate_not_met' };
  return { eligible: true, reason: 'eligible' };
}

function selectRecords(benchmark) {
  const samples = benchmark.manifest.samples;
  const calibration = samples.filter((record) => {
    const gate = eligibleRecord(record, benchmark, 'calibration');
    return gate.eligible && record.candidateCategory === CAMERA_CATEGORY
      && record.truthAxes.physicalCameraAcquisition === 'TRUE'
      && record.truthAxes.syntheticDepictedContent === 'FALSE'
      && record.truthAxes.localManipulation === 'FALSE'
      && record.truthAxes.screenRecapture === 'FALSE'
      && record.truthConfidence.physicalCameraAcquisition === 'OWNER_CONFIRMED';
  }).sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  const evaluation = samples.filter((record) => eligibleRecord(record, benchmark, 'evaluation').eligible).sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  const cameraEvaluation = evaluation.filter((record) => record.candidateCategory === CAMERA_CATEGORY && record.truthAxes.physicalCameraAcquisition === 'TRUE');
  const nonCameraEvaluation = evaluation.filter((record) => record.truthAxes.physicalCameraAcquisition === 'FALSE');
  if (calibration.length === 0 || cameraEvaluation.length === 0 || nonCameraEvaluation.length === 0) throw new Error('wp006c_required_partition_empty');
  if (new Set(calibration.map((record) => record.sourceFamilyId)).size !== calibration.length) throw new Error('wp006c_calibration_family_duplicate');
  const familySplits = new Map();
  for (const record of [...calibration, ...evaluation]) {
    const prior = familySplits.get(record.sourceFamilyId);
    if (prior && prior !== record.split) throw new Error(`wp006c_calibration_evaluation_family_leak:${record.sourceFamilyId}`);
    familySplits.set(record.sourceFamilyId, record.split);
  }
  if (new Set(calibration.map((record) => record.cameraDeviceFamily)).size !== 2) throw new Error('wp006c_calibration_device_count_invalid');
  return { calibration, evaluation, cameraEvaluation, nonCameraEvaluation };
}

function logicalRelativePath(record) {
  const prefix = `${OWNER_ROOT_LABEL}/`;
  if (typeof record.logicalFileReference !== 'string' || !record.logicalFileReference.startsWith(prefix)) throw new Error(`wp006c_logical_reference_invalid:${record.sampleId}`);
  const relative = record.logicalFileReference.slice(prefix.length);
  if (!relative || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) throw new Error(`wp006c_logical_reference_unsafe:${record.sampleId}`);
  return relative;
}

async function candidateOwnerPaths(mediaRoot, record) {
  const relative = logicalRelativePath(record);
  const folder = relative.split('/')[0];
  const basename = path.posix.basename(relative);
  const extension = path.posix.extname(basename);
  const candidatePaths = [path.join(mediaRoot, ...relative.split('/'))];
  if (folder === 'camera') {
    const cameraMatch = record.sampleId.match(/^CAMERA_(\d{8}_\d{6})$/u);
    if (cameraMatch) {
      candidatePaths.push(path.join(mediaRoot, folder, `${cameraMatch[1]}${extension}`));
      const names = await readdir(path.join(mediaRoot, folder));
      for (const name of names) {
        const lower = name.toLowerCase();
        if (ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase()) && lower.startsWith(cameraMatch[1].toLowerCase())) candidatePaths.push(path.join(mediaRoot, folder, name));
      }
    }
  }
  if (folder === 'hard-negative' && record.sampleId.startsWith('SCREENSHOT_')) {
    const screenshotMatch = record.sampleId.match(/^SCREENSHOT_(\d{8}_\d{6})_/u);
    if (screenshotMatch) {
      const names = await readdir(path.join(mediaRoot, folder));
      for (const name of names) {
        const lower = name.toLowerCase();
        if (ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase()) && lower.startsWith(`screenshot_${screenshotMatch[1].toLowerCase()}`)) candidatePaths.push(path.join(mediaRoot, folder, name));
      }
    }
  }
  return [...new Set(candidatePaths)];
}

async function resolveOwnerMedia(mediaRoot, record, verifyContent = true) {
  const candidates = (await candidateOwnerPaths(mediaRoot, record)).filter(async () => true);
  const existing = [];
  for (const candidate of candidates) {
    try {
      const metadata = await stat(candidate);
      if (metadata.isFile()) existing.push(candidate);
    } catch {
      // Candidate path simply does not exist.
    }
  }
  if (existing.length === 0) throw new Error(`wp006c_media_not_found:${record.sampleId}`);
  const matches = [];
  for (const candidate of existing) {
    const bytes = await readFile(candidate);
    if (!verifyContent || sha256Hex(bytes) === record.contentSha256) matches.push({ candidate, bytes });
  }
  if (matches.length !== 1) throw new Error(`wp006c_media_resolution_${matches.length === 0 ? 'hash_mismatch' : 'ambiguous'}:${record.sampleId}`);
  return matches[0];
}

async function decodeRaw(sharp, bytes) {
  const decoded = await sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
  const channels = Number(decoded.info.channels);
  const pixels = new Uint8Array(decoded.data);
  const result = { width: Number(decoded.info.width), height: Number(decoded.info.height), channels, pixels };
  assertBlindDecodedPixels(result);
  return result;
}

function safeSampleIdentity(record) {
  return {
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    inputHash: record.contentSha256,
    split: record.split,
  };
}

async function processRecord({ sharp, mediaRoot, record, model, repoCommit, featureRegistryHash, configurationHash, benchmarkFingerprint }) {
  const started = performance.now();
  const resolved = await resolveOwnerMedia(mediaRoot, record, true);
  const decoded = await decodeRaw(sharp, resolved.bytes);
  const features = extractEf2FeatureVector(decoded);
  const score = model && features.applicability === 'applicable' ? scoreEf2FeatureVector(features.values, model) : null;
  const runtimeMs = performance.now() - started;
  const measurement = buildSpecialistMeasurement({
    inputHash: record.contentSha256,
    measurement: score,
    runtimeMs,
    repositoryCommit: repoCommit,
    featureRegistryHash,
    configurationHash,
    benchmarkFingerprint,
    applicability: features.applicability,
    limitations: [
      `Native-grid patch count=${features.patchCount}.`,
      ...(features.unavailableFeatures.length > 0 ? [`Unavailable features=${features.unavailableFeatures.join(',')}.`] : []),
    ],
  });
  return {
    ...safeSampleIdentity(record),
    measurement,
    rawScore: score?.rawScore ?? null,
    normalizedMeasurement: score?.normalizedMeasurement ?? null,
    groupScores: score?.groupScores ?? {},
    patchCount: features.patchCount,
    applicability: features.applicability,
    unavailableFeatures: features.unavailableFeatures,
    runtimeMs,
    decodedWidth: decoded.width,
    decodedHeight: decoded.height,
    acceptedAtFrozenThreshold: null,
    deviceFamily: record.cameraDeviceFamily ?? null,
    featureVector: features.values,
  };
}

function publicModel(model) {
  return {
    featureNames: model.featureNames,
    includedFeatureIndexes: model.includedFeatureIndexes,
    excludedFeatures: model.excludedFeatures,
    centers: model.centers,
    scales: model.scales,
    deviceCenters: model.deviceCenters,
    deviceFamilies: model.deviceFamilies,
    groupIndexes: model.groupIndexes,
    method: model.method,
  };
}

function lofoCalibration(calibrationRecords, featureVectors) {
  const scores = [];
  for (let index = 0; index < calibrationRecords.length; index += 1) {
    const remainingVectors = featureVectors.filter((_, candidateIndex) => candidateIndex !== index);
    const remainingDevices = calibrationRecords.filter((_, candidateIndex) => candidateIndex !== index).map((record) => record.cameraDeviceFamily);
    const model = fitDeviceBalancedCameraModel(remainingVectors, remainingDevices);
    const score = scoreEf2FeatureVector(featureVectors[index], model);
    scores.push({
      sampleId: calibrationRecords[index].sampleId,
      sourceFamilyId: calibrationRecords[index].sourceFamilyId,
      deviceFamily: calibrationRecords[index].cameraDeviceFamily,
      rawScore: score?.rawScore ?? null,
      normalizedMeasurement: score?.normalizedMeasurement ?? null,
      includedFeatureCount: score?.includedFeatureCount ?? 0,
    });
  }
  return scores;
}

function deviceLofoSummary(lofoScores) {
  return Object.fromEntries([...new Set(lofoScores.map((row) => row.deviceFamily))].sort().map((device) => {
    const rows = lofoScores.filter((row) => row.deviceFamily === device);
    return [device, {
      familyCount: rows.length,
      validCount: rows.filter((row) => Number.isFinite(row.rawScore)).length,
      rawScores: rows.map((row) => row.rawScore).filter((value) => Number.isFinite(value)),
    }];
  }));
}

function acceptance(rows, threshold) {
  const valid = rows.filter((row) => Number.isFinite(row.rawScore));
  const accepted = valid.filter((row) => row.rawScore <= threshold);
  return {
    valid: valid.length,
    accepted: accepted.length,
    rejected: valid.length - accepted.length,
    rate: valid.length === 0 ? null : accepted.length / valid.length,
    invalid: rows.length - valid.length,
  };
}

function evaluationSlice(record) {
  if (record.candidateCategory === CAMERA_CATEGORY) return 'SEEN_DEVICE_CAMERA_EVALUATION';
  if (record.candidateCategory === HARD_NEGATIVE_CATEGORY) return 'HARD_NEGATIVE_NON_CAMERA_EVALUATION';
  if (record.candidateCategory === SYNTHETIC_CATEGORY) return 'SYNTHETIC_NON_CAMERA_EVALUATION';
  return 'OTHER_NON_CAMERA_EVALUATION';
}

function withThreshold(rows, threshold) {
  return rows.map((row) => ({ ...row, acceptedAtFrozenThreshold: Number.isFinite(row.rawScore) ? row.rawScore <= threshold : null }));
}

function evaluationSummary(rows, threshold) {
  const bySlice = {};
  for (const row of rows) {
    const slice = row.evaluationSlice;
    bySlice[slice] ??= [];
    bySlice[slice].push(row);
  }
  const result = {};
  for (const [slice, sliceRows] of Object.entries(bySlice)) {
    const scores = sliceRows.map((row) => row.rawScore);
    const validScores = scores.filter((score) => Number.isFinite(score));
    const summary = summarizeScores(validScores);
    const decision = acceptance(sliceRows, threshold);
    result[slice] = {
      sampleCount: sliceRows.length,
      sourceFamilyCount: new Set(sliceRows.map((row) => row.sourceFamilyId)).size,
      rawScore: summary,
      normalizedMedian: medianFinite(sliceRows.map((row) => row.normalizedMeasurement)),
      acceptanceAtFrozenThreshold: decision,
      runtimeMs: summarizeScores(sliceRows.map((row) => row.runtimeMs)),
      invalidOrUnavailableCount: sliceRows.filter((row) => row.applicability !== 'applicable' || !Number.isFinite(row.rawScore)).length,
    };
  }
  const cameraScores = rows.filter((row) => row.evaluationSlice === 'SEEN_DEVICE_CAMERA_EVALUATION').map((row) => row.rawScore);
  const nonCameraScores = rows.filter((row) => row.evaluationSlice !== 'SEEN_DEVICE_CAMERA_EVALUATION').map((row) => row.rawScore);
  return {
    bySlice: result,
    cameraVsNonCamera: {
      rocAuc: rocAuc(cameraScores, nonCameraScores),
      bootstrap95: bootstrapAuc(cameraScores, nonCameraScores),
      cliffsDelta: cliffsDelta(cameraScores, nonCameraScores),
    },
  };
}

function valueAuc(rows, valueForRow) {
  const camera = rows.filter((row) => row.evaluationSlice === 'SEEN_DEVICE_CAMERA_EVALUATION').map((row) => valueForRow(row));
  const nonCamera = rows.filter((row) => row.evaluationSlice !== 'SEEN_DEVICE_CAMERA_EVALUATION').map((row) => valueForRow(row));
  return rocAuc(camera, nonCamera);
}

function riskFromAuc(auc) {
  if (auc === null) return 'UNKNOWN';
  const separation = Math.abs(auc - 0.5);
  if (separation >= 0.4) return 'HIGH';
  if (separation >= 0.25) return 'MODERATE';
  return 'LOW';
}

function shortcutAudit(rows, benchmark) {
  const recordById = new Map(benchmark.manifest.samples.map((record) => [record.sampleId, record]));
  const sourceRows = rows.map((row) => ({ row, record: recordById.get(row.sampleId) })).filter(({ record }) => record);
  const hasMetadata = (record) => Boolean(record.safeMetadata?.exifPresent || record.safeMetadata?.xmpPresent || record.safeMetadata?.c2paPresent || record.safeMetadata?.encoderPresent);
  const hasEncoder = (record) => Boolean(record.safeMetadata?.encoderPresent);
  const hasDeviceIdentity = (record) => typeof record.cameraDeviceFamily === 'string' && record.cameraDeviceFamily.length > 0;
  const variables = {
    dimensions: { auc: valueAuc(rows, (row) => { const record = recordById.get(row.sampleId); return record ? Math.log1p(record.width * record.height) : Number.NaN; }), basis: 'univariate image pixel dimensions from manifest; not used in primary score' },
    fileSize: { auc: valueAuc(rows, (row) => { const record = recordById.get(row.sampleId); return record ? Math.log1p(record.byteSize) : Number.NaN; }), basis: 'univariate byte size from manifest; not used in primary score' },
    metadataPresence: { auc: valueAuc(rows, (row) => { const record = recordById.get(row.sampleId); return record && hasMetadata(record) ? 1 : 0; }), basis: 'any safe metadata marker from manifest; not used in primary score' },
    encoderPresence: { auc: valueAuc(rows, (row) => { const record = recordById.get(row.sampleId); return record && hasEncoder(record) ? 1 : 0; }), basis: 'safe encoder-marker presence from manifest; not used in primary score' },
    deviceIdentityPresence: { auc: valueAuc(rows, (row) => { const record = recordById.get(row.sampleId); return record && hasDeviceIdentity(record) ? 1 : 0; }), basis: 'known camera-device label presence from manifest; not used in primary score' },
  };
  const audited = Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, { ...value, risk: riskFromAuc(value.auc) }]));
  const risks = Object.values(audited).map((value) => value.risk);
  const shortcutRisk = risks.includes('HIGH') ? 'HIGH' : risks.includes('MODERATE') ? 'MODERATE' : risks.includes('UNKNOWN') ? 'UNKNOWN' : 'LOW';
  const deviceIdentityNote = sourceRows.length > 0 && sourceRows.every(({ row, record }) => (row.evaluationSlice === 'SEEN_DEVICE_CAMERA_EVALUATION') === hasDeviceIdentity(record));
  return {
    schemaVersion: 'lythaus-wp006c-ef2-shortcut-audit-v1',
    primaryScoreUnaffected: true,
    variables: audited,
    shortcutRisk,
    deviceIdentityCurationNote: deviceIdentityNote ? 'Camera evaluation rows carry known device labels while non-camera controls do not; this is a benchmark curation nuisance and is not evidence of general EF2.' : 'Device-label presence is not perfectly aligned with evaluation slice.',
    method: 'Descriptive univariate AUC only after primary evaluation; no nuisance variable entered the primary score.',
  };
}

function deviceConfounding(calibrationRecords, vectors, model) {
  const devices = [...new Set(calibrationRecords.map((record) => record.cameraDeviceFamily))].sort();
  const normalizedSeparations = [];
  const groupSeparations = {};
  for (let index = 0; index < model.includedFeatureIndexes.length; index += 1) {
    const featureIndex = model.includedFeatureIndexes[index];
    const values = devices.map((device) => model.deviceCenters[device]?.[featureIndex]);
    if (values.length === 2 && Number.isFinite(values[0]) && Number.isFinite(values[1]) && model.scales[featureIndex] > 0) normalizedSeparations.push(Math.abs(values[0] - values[1]) / model.scales[featureIndex]);
  }
  for (const [group, indexes] of Object.entries(model.groupIndexes)) {
    const values = indexes.flatMap((featureIndex) => {
      const a = model.deviceCenters[devices[0]]?.[featureIndex]; const b = model.deviceCenters[devices[1]]?.[featureIndex];
      return Number.isFinite(a) && Number.isFinite(b) && model.scales[featureIndex] > 0 ? [Math.abs(a - b) / model.scales[featureIndex]] : [];
    });
    groupSeparations[group] = medianFinite(values);
  }
  const medianSeparation = medianFinite(normalizedSeparations);
  const highGroups = Object.values(groupSeparations).filter((value) => value !== null && value >= 1.5).length;
  const level = medianSeparation === null ? 'UNKNOWN' : highGroups >= 3 || medianSeparation >= 1.5 ? 'HIGH' : medianSeparation >= 0.75 ? 'MODERATE' : 'LOW';
  const perDeviceScore = Object.fromEntries(devices.map((device) => {
    const deviceRows = calibrationRecords.flatMap((record, index) => record.cameraDeviceFamily === device ? [scoreEf2FeatureVector(vectors[index], model)?.rawScore ?? null] : []);
    return [device, summarizeScores(deviceRows)];
  }));
  return {
    level,
    medianNormalizedCenterSeparation: medianSeparation,
    highSeparatedGroupCount: highGroups,
    groupMedianNormalizedSeparation: groupSeparations,
    pooledModelScoreByDevice: perDeviceScore,
    interpretation: level === 'HIGH' ? 'The enrolled Samsung pipelines are strongly separated in the enrolled feature space; pooled camera consistency may be device-confounded.' : 'No high pooled feature-center separation was observed between the two enrolled devices under the declared diagnostic rule.',
  };
}

function buildPlan(baseCommit) {
  return {
    schemaVersion: WP006C_PLAN_SCHEMA_VERSION,
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    specialistId: WP006C_SPECIALIST_ID,
    specialistVersion: WP006C_SPECIALIST_VERSION,
    baseCommit,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    researchQuestions: [
      'Can a deterministic pixel-domain measurement produce stable camera-acquisition consistency on owner-confirmed captures?',
      'Does the frozen measurement separate camera captures from physicalCameraAcquisition=FALSE controls without evaluation tuning?',
      'Does the frozen measurement transfer to the sealed unseen LGE LM-G710 device?',
      'Are apparent results explained by metadata, resolution, file size, encoding, device identity, or other nuisance shortcuts?',
    ],
    partitions: {
      calibration: 'CALIBRATION camera families only; owner-confirmed physical camera acquisition and clean lineage axes.',
      evaluation: 'EVALUATION families only after calibration freeze; seen camera and physicalCameraAcquisition=FALSE controls reported separately.',
      deviceHoldout: 'DEVICE_HOLDOUT LGE LM-G710; pixels sealed until Stage A passes and unblind freeze is written.',
      reservedEvidence: 'WP006B reserved camera, synthetic, and hard-negative families remain untouched.',
      sourceFamilyBoundary: true,
    },
    featureFamilies: EF2_FEATURE_REGISTRY.features.map((feature) => ({ group: feature.featureGroup, name: feature.featureName, primaryScore: feature.primaryScore })),
    scoringProcedure: {
      extractor: 'Blind native decoded pixels only; no metadata, truth, filename, dimensions, or category inputs.',
      patchSelection: EF2_FEATURE_REGISTRY.patchSelection,
      calibration: 'Per-device median centers, equal device-center weighting, robust MAD scales, group mean squared robust-z distance, median across groups.',
      leaveOneFamilyOut: true,
      threshold: '90th percentile of calibration-camera LOFO raw distance; lower distance is more camera-consistent.',
      normalizedMeasurement: '1/(1+rawDistance); not a probability.',
      noSupervisedClassifier: true,
      prnuStatus: WP006C_PRNU_STATUS,
    },
    stageAGate: {
      calibrationLofoAcceptanceMinimum: 0.8,
      perDeviceLofoAcceptanceMinimum: 0.6,
      seenCameraEvaluationMinimum: '2/3 when at least 3 eligible families; otherwise UNDERPOWERED.',
      overallNonCameraFalseAcceptanceMaximum: 0.25,
      majorCategoryFalseAcceptanceMaximum: 0.35,
      requiredProperties: ['no_source_family_leakage', 'no_calibration_evaluation_leakage', 'no_truth_or_metadata_input', 'no_severe_determinism_failure', 'shortcut_risk_not_high'],
    },
    holdoutGate: {
      device: WP006C_HOLDOUT_DEVICE,
      exactFamilyCount: 33,
      oneShot: true,
      noRefit: true,
      promisingAcceptanceMinimum: 0.7,
      mixedAcceptanceMinimum: 0.4,
    },
    transformations: TRANSFORMATIONS,
    successClassifications: ['PROMOTE_TO_CALIBRATION_CANDIDATE', 'KEEP_MEASUREMENT_ONLY', 'REJECT_CURRENT_EF2_MEASUREMENT', 'INVALID_RUN'],
    constraints: {
      noExternalInference: true,
      noModelWeights: true,
      noTraining: true,
      noProductionIntegration: true,
      noPersistentMedia: true,
      automaticRetries: 0,
      incrementalCostUsd: 0,
    },
    planStatus: 'FROZEN_BEFORE_EVALUATION',
  };
}

function deviceHoldoutIds(benchmark) {
  return benchmark.lgeRecords.map((record) => record.sourceFamilyId).sort();
}

function transformInput(sharp, bytes, decoded, transformation) {
  const instance = sharp(bytes, { failOn: 'error' });
  if (transformation === 'metadataStripped') return instance.png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  if (transformation === 'JPEG95') return instance.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  if (transformation === 'JPEG75') return instance.jpeg({ quality: 75, chromaSubsampling: '4:4:4' }).toBuffer();
  if (transformation === 'resize75') return instance.resize({ width: Math.max(1, Math.round(decoded.width * 0.75)), height: Math.max(1, Math.round(decoded.height * 0.75)), fit: 'fill', kernel: 'lanczos3' }).toBuffer();
  if (transformation === 'crop10') {
    const left = Math.floor(decoded.width * 0.1);
    const top = Math.floor(decoded.height * 0.1);
    const width = Math.max(1, decoded.width - left * 2);
    const height = Math.max(1, decoded.height - top * 2);
    return instance.extract({ left, top, width, height }).toBuffer();
  }
  throw new Error(`wp006c_transformation_unknown:${transformation}`);
}

function maxAbsoluteDifference(left, right) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  return maximum;
}

async function runTransformationStress({ sharp, mediaRoot, records, model, repoCommit, featureRegistryHash, configurationHash, benchmarkFingerprint, originalRowsBySample }) {
  const rows = [];
  for (const record of records) {
    const original = await resolveOwnerMedia(mediaRoot, record, true);
    const originalDecoded = await decodeRaw(sharp, original.bytes);
    for (const transformation of TRANSFORMATIONS) {
      const started = performance.now();
      const transformedBytes = await transformInput(sharp, original.bytes, originalDecoded, transformation);
      const transformedDecoded = await decodeRaw(sharp, transformedBytes);
      const features = extractEf2FeatureVector(transformedDecoded);
      const score = features.applicability === 'applicable' ? scoreEf2FeatureVector(features.values, model) : null;
      const originalRow = originalRowsBySample.get(record.sampleId);
      const originalGroupScores = originalRow?.groupScores ?? {};
      const groupDeltas = Object.keys(originalGroupScores).flatMap((group) => score?.groupScores[group] !== undefined ? [Math.abs(score.groupScores[group] - originalGroupScores[group])] : []);
      rows.push({
        sampleId: record.sampleId,
        sourceFamilyId: record.sourceFamilyId,
        deviceFamily: record.cameraDeviceFamily,
        transformation,
        parentRetained: true,
        rawScore: score?.rawScore ?? null,
        normalizedMeasurement: score?.normalizedMeasurement ?? null,
        acceptedAtFrozenThreshold: null,
        applicability: features.applicability,
        patchCount: features.patchCount,
        runtimeMs: performance.now() - started,
        groupScoreAbsoluteDeltaMedian: medianFinite(groupDeltas),
        decodedPixelIdentity: transformation === 'metadataStripped'
          && originalDecoded.width === transformedDecoded.width
          && originalDecoded.height === transformedDecoded.height
          && originalDecoded.channels === transformedDecoded.channels
          && maxAbsoluteDifference(originalDecoded.pixels, transformedDecoded.pixels) === 0,
        decodedPixelMaximumDifference: transformation === 'metadataStripped' && originalDecoded.width === transformedDecoded.width && originalDecoded.height === transformedDecoded.height && originalDecoded.channels === transformedDecoded.channels ? maxAbsoluteDifference(originalDecoded.pixels, transformedDecoded.pixels) : null,
        temporaryMediaPersisted: false,
        originalRawScore: originalRowsBySample.get(record.sampleId)?.rawScore ?? null,
      });
    }
  }
  return rows;
}

function summarizeTransformation(rows, threshold) {
  return Object.fromEntries(TRANSFORMATIONS.map((transformation) => {
    const items = rows.filter((row) => row.transformation === transformation);
    const validScores = items.map((row) => row.rawScore).filter((score) => Number.isFinite(score));
    const accepted = items.filter((row) => Number.isFinite(row.rawScore) && row.rawScore <= threshold).length;
    const deltas = items.flatMap((row) => {
      if (transformation === 'metadataStripped') return [];
      return Number.isFinite(row.rawScore) && Number.isFinite(row.originalRawScore) ? [row.rawScore - row.originalRawScore] : [];
    });
    return [transformation, {
      sourceFamilyCount: new Set(items.map((row) => row.sourceFamilyId)).size,
      validCount: validScores.length,
      invalidCount: items.length - validScores.length,
      acceptanceAtFrozenThreshold: validScores.length === 0 ? null : accepted / validScores.length,
      rawScore: summarizeScores(validScores),
      scoreDeltaFromMetadataStrippedBaseline: { median: medianFinite(deltas), maximumAbsolute: deltas.length === 0 ? null : Math.max(...deltas.map((value) => Math.abs(value))) },
      groupScoreAbsoluteDeltaMedian: medianFinite(items.map((row) => row.groupScoreAbsoluteDeltaMedian)),
      metadataStripPixelIdentityCount: transformation === 'metadataStripped' ? items.filter((row) => row.decodedPixelIdentity).length : null,
      metadataStripMaximumPixelDifference: transformation === 'metadataStripped' ? Math.max(...items.map((row) => row.decodedPixelMaximumDifference ?? 0)) : null,
      runtimeMs: summarizeScores(items.map((row) => row.runtimeMs)),
      parentFamilyRetained: items.every((row) => row.parentRetained),
      temporaryMediaPersisted: items.some((row) => row.temporaryMediaPersisted),
    }];
  }));
}

function stageAResult({ calibrationLofo, calibrationRecords, evaluationRows, threshold, shortcutAuditResult, deviceConfoundingResult }) {
  const calDecision = acceptance(calibrationLofo, threshold);
  const perDevice = deviceLofoSummary(calibrationLofo);
  const evalSummary = evaluationSummary(evaluationRows, threshold);
  const seenRows = evaluationRows.filter((row) => row.evaluationSlice === 'SEEN_DEVICE_CAMERA_EVALUATION');
  const nonCameraRows = evaluationRows.filter((row) => row.evaluationSlice !== 'SEEN_DEVICE_CAMERA_EVALUATION');
  const seenDecision = acceptance(seenRows, threshold);
  const nonCameraDecision = acceptance(nonCameraRows, threshold);
  const categoryDecisions = Object.fromEntries(Object.entries(evalSummary.bySlice).map(([slice, value]) => [slice, value.acceptanceAtFrozenThreshold]));
  const perDevicePass = Object.entries(perDevice).every(([, value]) => value.familyCount < 5 || (value.accepted / Math.max(1, value.validCount)) >= 0.6);
  const seenGate = seenRows.length >= 3 ? seenDecision.accepted >= 2 && seenDecision.rate !== null : 'UNDERPOWERED';
  const majorCategoryPass = ['HARD_NEGATIVE_NON_CAMERA_EVALUATION', 'SYNTHETIC_NON_CAMERA_EVALUATION'].every((slice) => {
    const decision = categoryDecisions[slice];
    return !decision || decision.valid < 5 || (decision.accepted / Math.max(1, decision.valid)) <= 0.35;
  });
  const failures = [];
  if (calDecision.rate === null || calDecision.rate < 0.8) failures.push('NO_STABLE_CAMERA_MANIFOLD');
  if (!perDevicePass) failures.push('NO_STABLE_CAMERA_MANIFOLD');
  if (seenGate !== 'UNDERPOWERED' && seenGate !== true) failures.push('INSUFFICIENT_SEEN_CAMERA_EVALUATION');
  if (nonCameraDecision.rate !== null && nonCameraDecision.rate > 0.25) failures.push('HIGH_NON_CAMERA_FALSE_ACCEPTANCE');
  if (!majorCategoryPass) failures.push('HIGH_NON_CAMERA_FALSE_ACCEPTANCE');
  if (shortcutAuditResult.shortcutRisk === 'HIGH') failures.push('SHORTCUT_RISK');
  if (deviceConfoundingResult.level === 'HIGH') failures.push('DEVICE_CONFOUNDING');
  return {
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    calibrationLofoAcceptance: calDecision.rate,
    calibrationLofo: calDecision,
    perDeviceLofo: perDevice,
    seenCameraEvaluationAcceptance: seenDecision.rate,
    seenCameraGate: seenGate,
    nonCameraFalseAcceptance: nonCameraDecision.rate,
    hardNegativeFalseAcceptance: categoryDecisions.HARD_NEGATIVE_NON_CAMERA_EVALUATION?.rate ?? null,
    syntheticFalseAcceptance: categoryDecisions.SYNTHETIC_NON_CAMERA_EVALUATION?.rate ?? null,
    categoryDecisions,
    shortcutRisk: shortcutAuditResult.shortcutRisk,
    deviceConfounding: deviceConfoundingResult.level,
    sourceFamilyLeakage: 'PASS',
    calibrationEvaluationLeakage: 'PASS',
    truthLeakage: 'PASS',
    metadataInputLeakage: 'PASS',
  };
}

function holdoutInterpretation(acceptanceRate, medianScore, threshold) {
  if (acceptanceRate === null) return 'NOT_RUN';
  if (acceptanceRate >= 0.7 && Number.isFinite(medianScore) && medianScore <= threshold) return 'PROMISING';
  if (acceptanceRate >= 0.4) return 'MIXED';
  return 'NOT_DEMONSTRATED';
}

function summarizeRuntime(rows) {
  const values = rows.map((row) => row.runtimeMs).filter((value) => Number.isFinite(value));
  const summary = summarizeScores(values);
  return { medianMs: summary.median, p95Ms: summary.p95, maxMs: values.length === 0 ? null : Math.max(...values), count: values.length };
}

function selectTransformationRecords(records) {
  const byDevice = new Map();
  for (const record of records) {
    const list = byDevice.get(record.cameraDeviceFamily) ?? [];
    list.push(record);
    byDevice.set(record.cameraDeviceFamily, list);
  }
  return [...byDevice.keys()].sort().flatMap((device) => (byDevice.get(device) ?? []).sort((a, b) => a.sampleId.localeCompare(b.sampleId)).slice(0, 4));
}

function configurationHash() {
  return stableArtifactHash(EF2_CONFIG);
}

function featureRegistryHash() {
  return stableArtifactHash(EF2_FEATURE_REGISTRY);
}

function ensurePlanMatches(plan) {
  if (plan.schemaVersion !== WP006C_PLAN_SCHEMA_VERSION) throw new Error('wp006c_plan_schema_invalid');
  if (plan.baseCommit !== WP006C_EXPECTED_BASE_SHA) throw new Error('wp006c_plan_base_commit_invalid');
  if (plan.benchmarkFingerprint !== WP006C_EXPECTED_BENCHMARK_FINGERPRINT) throw new Error('wp006c_plan_fingerprint_invalid');
  if (plan.planStatus !== 'FROZEN_BEFORE_EVALUATION') throw new Error('wp006c_plan_not_frozen');
}

async function prepareArtifacts(outputDir, baseCommit) {
  const registryHash = featureRegistryHash();
  const configHash = configurationHash();
  const plan = buildPlan(baseCommit);
  plan.featureRegistryHash = registryHash;
  plan.configurationHash = configHash;
  plan.preparedAt = new Date().toISOString();
  const registry = { ...jsonClone(EF2_FEATURE_REGISTRY), registryHash };
  await writeJson(outputDir, 'wp006c-plan.json', plan);
  await writeJson(outputDir, 'ef2-feature-registry.json', registry);
  await writeJson(outputDir, 'wp006c-run-manifest.json', {
    schemaVersion: WP006C_RUN_MANIFEST_SCHEMA_VERSION,
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    baseCommit,
    implementationCommit: null,
    specialistId: WP006C_SPECIALIST_ID,
    specialistVersion: WP006C_SPECIALIST_VERSION,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    planStatus: 'FROZEN_BEFORE_EVALUATION',
    specialistInferenceRun: false,
    externalInferenceCalls: 0,
    incrementalCostUsd: 0,
    mediaRootLabel: OWNER_ROOT_LABEL,
    mediaAccess: { calibrationPixels: false, evaluationPixels: false, transformationPixels: false, lgePixels: false },
    deviceHoldoutStatus: 'SEALED',
    temporaryMediaPersisted: false,
    rawResidualsPersisted: false,
    rawMetadataPersisted: false,
    status: 'PLANNED',
  });
  return { plan, registryHash, configHash };
}

function publicRow(row) {
  const { featureVector, ...safe } = row;
  return safe;
}

function freezeHash(value) {
  return stableArtifactHash(value);
}

function metadataStripInvariance(transformationRows) {
  const rows = transformationRows.filter((row) => row.transformation === 'metadataStripped');
  if (rows.length === 0) return 'NOT_TESTABLE';
  return rows.every((row) => row.decodedPixelIdentity === true && (row.decodedPixelMaximumDifference ?? 1) === 0) ? 'PASS' : 'FAIL';
}

function transformationRobustness(transformationSummary) {
  const retentions = Object.entries(transformationSummary).filter(([name]) => name !== 'metadataStripped').map(([, value]) => value.acceptanceAtFrozenThreshold).filter((value) => Number.isFinite(value));
  if (retentions.length === 0) return 'NOT_TESTABLE';
  if (retentions.every((value) => value >= 0.8)) return 'PROMISING';
  if (retentions.some((value) => value < 0.5)) return 'FRAGILE';
  return 'MIXED';
}

function finalDecision(stageA, unseenTransfer, invariance, runInvalid = false) {
  if (runInvalid) return 'INVALID_RUN';
  if (stageA.passed && unseenTransfer === 'PROMISING' && invariance !== 'FAIL' && stageA.shortcutRisk !== 'HIGH' && stageA.deviceConfounding !== 'HIGH') return 'PROMOTE_TO_CALIBRATION_CANDIDATE';
  if (stageA.passed && unseenTransfer !== 'NOT_DEMONSTRATED') return 'KEEP_MEASUREMENT_ONLY';
  if (stageA.failures.some((failure) => ['HIGH_NON_CAMERA_FALSE_ACCEPTANCE', 'SHORTCUT_RISK', 'DEVICE_CONFOUNDING', 'NO_STABLE_CAMERA_MANIFOLD'].includes(failure))) return 'REJECT_CURRENT_EF2_MEASUREMENT';
  return 'KEEP_MEASUREMENT_ONLY';
}

function finalClassification(decision) {
  if (decision === 'PROMOTE_TO_CALIBRATION_CANDIDATE') return 'WP006C_EF2_CALIBRATION_CANDIDATE';
  if (decision === 'INVALID_RUN') return 'WP006C_EF2_PROTOCOL_INVALID';
  if (decision === 'REJECT_CURRENT_EF2_MEASUREMENT') return 'WP006C_EF2_NOT_DEMONSTRATED';
  return 'WP006C_EF2_MEASUREMENT_ONLY';
}

function format(value) {
  if (value === null || value === undefined) return 'NOT_RUN';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value.toFixed(6))) : 'NOT_FINITE';
  return String(value);
}

function buildReport(result) {
  const stageA = result.stageA;
  const evalBySlice = result.evaluation.summary.bySlice;
  const summaryLine = (name, value) => `${name} = ${format(value)}`;
  const lines = [
    '# WP006C — EF2 Physical Camera-Acquisition Feasibility',
    '',
    '## Executive decision',
    '',
    summaryLine('WP006C_BASE_SHA', result.baseCommit),
    summaryLine('WP006C_BENCHMARK_FINGERPRINT', result.benchmarkFingerprint),
    summaryLine('FEATURE_REGISTRY_SHA256', result.featureRegistryHash),
    summaryLine('CONFIGURATION_SHA256', result.configurationHash),
    summaryLine('CALIBRATION_CAMERA_FAMILIES', result.counts.calibrationCameraFamilies),
    summaryLine('CALIBRATION_DEVICE_FAMILIES', result.counts.calibrationDeviceFamilies),
    summaryLine('SEEN_CAMERA_EVALUATION_FAMILIES', result.counts.seenCameraEvaluationFamilies),
    summaryLine('NON_CAMERA_EVALUATION_FAMILIES', result.counts.nonCameraEvaluationFamilies),
    summaryLine('HARD_NEGATIVE_EVALUATION_FAMILIES', result.counts.hardNegativeEvaluationFamilies),
    summaryLine('SYNTHETIC_EVALUATION_FAMILIES', result.counts.syntheticEvaluationFamilies),
    summaryLine('CALIBRATION_LOFO_ACCEPTANCE', stageA.calibrationLofoAcceptance),
    summaryLine('SEEN_CAMERA_EVALUATION_ACCEPTANCE', stageA.seenCameraEvaluationAcceptance),
    summaryLine('NON_CAMERA_FALSE_ACCEPTANCE', stageA.nonCameraFalseAcceptance),
    summaryLine('HARD_NEGATIVE_FALSE_ACCEPTANCE', stageA.hardNegativeFalseAcceptance),
    summaryLine('SYNTHETIC_FALSE_ACCEPTANCE', stageA.syntheticFalseAcceptance),
    summaryLine('SHORTCUT_RISK', result.shortcutAudit.shortcutRisk),
    summaryLine('DEVICE_CONFOUNDING', result.deviceConfounding.level),
    summaryLine('TRANSFORMATION_ROBUSTNESS', result.transformation.robustness),
    summaryLine('STAGE_A_FEASIBILITY', stageA.passed ? 'PASS' : 'FAIL'),
    summaryLine('DEVICE_HOLDOUT_STATUS', result.deviceHoldout.status),
    summaryLine('LGE_HOLDOUT_FAMILIES', result.deviceHoldout.familyCount),
    summaryLine('LGE_HOLDOUT_ACCEPTANCE', result.deviceHoldout.acceptanceRate),
    summaryLine('UNSEEN_DEVICE_TRANSFER', result.deviceHoldout.transfer),
    summaryLine('WP006C_EF2_DECISION', result.decision),
    summaryLine('FINAL_CLASSIFICATION', result.classification),
    '',
    '## Frozen measurement',
    '',
    'The experiment used `LYTHAUS_EF2_PIXEL_ACQUISITION_CONSISTENCY_V0` as a deterministic one-class camera-consistency measurement. It operated on native decoded pixels, selected up to eight 256×256 patches by fixed sampled luminance variance, aggregated 27 interpretable residual/pipeline scalars, balanced the two enrolled Samsung devices equally, and used a calibration-camera-only 90th-percentile leave-one-family-out distance threshold.',
    '',
    'The normalized measurement is monotonic with camera-manifold consistency and is not a probability of camera origin. `PRNU_STATUS = NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL`; no sensor fingerprint, camera identification, synthetic verdict, directional evidence, or product enforcement was produced.',
    '',
    '## Routing and validity',
    '',
    `The frozen benchmark contained ${result.counts.calibrationCameraFamilies} calibration camera families (${result.calibration.devices.join(', ')}) and ${result.counts.seenCameraEvaluationFamilies} seen-device camera evaluation families. The non-camera evaluation controls were kept as separate hard-negative (${result.counts.hardNegativeEvaluationFamilies}) and synthetic (${result.counts.syntheticEvaluationFamilies}) slices. Routing-fixture coverage is not production traffic coverage, and these results are not commercial detector accuracy.`,
    '',
    `Stage A ${stageA.passed ? 'passed' : 'failed'} because: ${stageA.failures.length === 0 ? 'all predeclared checks passed' : stageA.failures.join(', ')}. The screenshot-heavy hard-negative slice, unknown generator provenance, owner-controlled source pool, and small seen-camera evaluation remain material limitations.`,
    '',
    '## Evaluation results',
    '',
    '| Slice | Families | Valid | Median raw distance | IQR | Acceptance | Runtime p50 / p95 / max ms |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(evalBySlice).map(([slice, value]) => `| ${slice} | ${value.sourceFamilyCount} | ${value.acceptanceAtFrozenThreshold.valid} | ${format(value.rawScore.median)} | ${format(value.rawScore.iqr)} | ${format(value.acceptanceAtFrozenThreshold.rate)} | ${format(value.runtimeMs.median)} / ${format(value.runtimeMs.p95)} / ${format(value.runtimeMs.p95 === null ? null : value.runtimeMs.p95)} |`),
    '',
    `Descriptive camera-versus-non-camera ROC AUC = ${format(result.evaluation.summary.cameraVsNonCamera.rocAuc)}; bootstrap 95% interval = ${result.evaluation.summary.cameraVsNonCamera.bootstrap95 ? `${format(result.evaluation.summary.cameraVsNonCamera.bootstrap95.lower)}–${format(result.evaluation.summary.cameraVsNonCamera.bootstrap95.upper)}` : 'NOT_AVAILABLE'}; Cliff's delta = ${format(result.evaluation.summary.cameraVsNonCamera.cliffsDelta)}. These are low-powered research diagnostics, not a Lythaus accuracy claim.`,
    '',
    '## Shortcut audit',
    '',
    ...Object.entries(result.shortcutAudit.variables).map(([name, value]) => `- ${name}: risk=${value.risk}, descriptive AUC=${format(value.auc)}.`),
    '',
    result.shortcutAudit.deviceIdentityCurationNote,
    '',
    `Device confounding = ${result.deviceConfounding.level}; median normalized center separation = ${format(result.deviceConfounding.medianNormalizedCenterSeparation)}. ${result.deviceConfounding.interpretation}`,
    '',
    '## Transformation stress',
    '',
    `Metadata-strip decoded-pixel invariance = ${result.transformation.metadataStripInvariance}. The bounded stress used eight calibration families (four per active device) and did not retune the score or threshold.`,
    '',
    ...Object.entries(result.transformation.summary).map(([name, value]) => `- ${name}: valid=${value.validCount}, acceptance=${format(value.acceptanceAtFrozenThreshold)}, median score delta=${format(value.scoreDeltaFromMetadataStrippedBaseline?.median)}, group drift median=${format(value.groupScoreAbsoluteDeltaMedian)}.`),
    '',
    '## Holdout protocol',
    '',
    result.deviceHoldout.status === 'SEALED'
      ? 'Stage A did not authorize unblinding. The complete 33-family LGE LM-G710 device holdout remains sealed; no LGE pixels, features, thumbnails, or scores were accessed, and no holdout result artifact was created.'
      : `Stage A authorized one-shot unblinding. All ${result.deviceHoldout.familyCount} eligible LGE LM-G710 families were processed once with the frozen model and threshold; no refit or LGE normalization was performed.`,
    '',
    '## Scientific boundaries',
    '',
    '- Owner attestation is benchmark ground truth, not an input feature.',
    '- Physical camera acquisition and synthetic depicted content remain independent axes.',
    '- `nativeStatus` and byte-for-byte native-original availability remain unresolved.',
    '- This work does not establish end-to-end authenticity accuracy, human false-positive rate, broad camera generalization, unseen-generator generalization, camera-native probability, native-byte originality, sensor identity, or EF2 directional validation.',
    '- The current benchmark has three known device families, two active enrollment devices, one unseen device, limited seen-device positives, screenshot-heavy hard negatives, unknown synthetic generator provenance, no screen-recapture slice, no external camera replication, and no population-representativeness claim.',
    '',
    '## Next research step',
    '',
    `NEXT_RESEARCH_STEP = ${result.nextStep}`,
    '',
    'No WP006D work was started, no production configuration changed, no specialist/model inference ran, no cloud calls were made, and no source media or raw residuals were committed.',
    '',
  ];
  return lines.join('\n');
}

async function runExperiment(outputDir, mediaRoot) {
  const baseCommit = currentCommit();
  if (workingTreeStatus()) throw new Error('wp006c_worktree_not_clean_before_run');
  if (!mediaRoot) throw new Error('wp006c_media_root_required');
  const mediaStat = await stat(mediaRoot).catch(() => null);
  if (!mediaStat || !mediaStat.isDirectory()) throw new Error('WP006C_BLOCKER=OWNER_MEDIA_NOT_FOUND');
  const plan = await readJson(path.resolve(outputDir, 'wp006c-plan.json'));
  const registryFile = await readJson(path.resolve(outputDir, 'ef2-feature-registry.json'));
  ensurePlanMatches(plan);
  const savedRegistryHash = registryFile.registryHash;
  delete registryFile.registryHash;
  if (savedRegistryHash !== featureRegistryHash() || stableArtifactHash(registryFile) !== featureRegistryHash()) throw new Error('wp006c_feature_registry_hash_mismatch');
  if (plan.configurationHash !== configurationHash()) throw new Error('wp006c_configuration_hash_mismatch');
  const benchmark = await loadFrozenBenchmark(outputDir);
  const selected = selectRecords(benchmark);
  const forbiddenExisting = ['ef2-calibration-freeze.json', 'ef2-calibration-results.json', 'ef2-evaluation-results.json', 'ef2-shortcut-audit.json', 'ef2-transformation-stress.json', 'holdout-unblind-freeze.json', 'ef2-device-holdout-results.json'];
  for (const filename of forbiddenExisting) {
    const exists = await stat(path.resolve(outputDir, filename)).catch(() => null);
    if (exists) throw new Error(`wp006c_prior_result_exists:${filename}`);
  }
  const sharp = requireSharp();
  if (typeof sharp.concurrency === 'function') sharp.concurrency(1);
  if (typeof sharp.cache === 'function') sharp.cache({ items: 0, memory: 0, files: 0 });
  const registryHash = featureRegistryHash();
  const configHash = configurationHash();
  const calibrationRows = [];
  const calibrationVectors = [];
  const calibrationRuntime = [];
  for (const record of selected.calibration) {
    const processed = await processRecord({ sharp, mediaRoot, record, model: null, repoCommit: baseCommit, featureRegistryHash: registryHash, configurationHash: configHash, benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT });
    if (processed.applicability !== 'applicable' || processed.featureVector.some((value) => !Number.isFinite(value))) throw new Error(`wp006c_calibration_feature_failure:${record.sampleId}`);
    const { featureVector, ...safe } = processed;
    calibrationVectors.push(featureVector);
    calibrationRows.push(safe);
    calibrationRuntime.push(safe.runtimeMs);
  }
  const calibrationDevices = selected.calibration.map((record) => record.cameraDeviceFamily);
  const model = fitDeviceBalancedCameraModel(calibrationVectors, calibrationDevices);
  const lofo = lofoCalibration(selected.calibration, calibrationVectors);
  const threshold = percentileFinite(lofo.map((row) => row.rawScore), EF2_CONFIG.thresholdQuantile);
  if (threshold === null) throw new Error('wp006c_calibration_threshold_unavailable');
  const thresholdedLofo = lofo.map((row) => ({ ...row, acceptedAtFrozenThreshold: Number.isFinite(row.rawScore) ? row.rawScore <= threshold : null }));
  const calibrationFreeze = {
    schemaVersion: WP006C_CALIBRATION_FREEZE_SCHEMA_VERSION,
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    baseCommit: plan.baseCommit,
    implementationCommit: baseCommit,
    specialistId: WP006C_SPECIALIST_ID,
    specialistVersion: WP006C_SPECIALIST_VERSION,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    calibrationFamilyIds: selected.calibration.map((record) => record.sourceFamilyId).sort(),
    calibrationSampleIds: selected.calibration.map((record) => record.sampleId).sort(),
    calibrationDeviceFamilies: [...new Set(calibrationDevices)].sort(),
    featureExclusions: model.excludedFeatures,
    robustCenterScalingMethod: model.method,
    deviceBalancingMethod: EF2_CONFIG.deviceWeighting,
    thresholdMethod: '90th percentile of leave-one-source-family-out calibration raw distance',
    thresholdSource: 'CALIBRATION_CAMERA_ONLY',
    thresholdValue: threshold,
    model: publicModel(model),
    sourceCodeCommit: baseCommit,
    preprocessingIdentifier: EF2_CONFIG.preprocessingIdentifier,
    patchSelectionIdentifier: EF2_CONFIG.patchSelectionIdentifier,
    evaluationPixelsProcessedBeforeFreeze: false,
    transformationPixelsProcessedBeforeFreeze: false,
    holdoutPixelsAccessedBeforeFreeze: false,
    createdAt: new Date().toISOString(),
  };
  assertCalibrationOnlyFreeze(calibrationFreeze);
  await writeJson(outputDir, 'ef2-calibration-freeze.json', calibrationFreeze);
  await writeJson(outputDir, 'ef2-calibration-results.json', {
    schemaVersion: WP006C_RESULT_SCHEMA_VERSION,
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    implementationCommit: baseCommit,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    specialistId: WP006C_SPECIALIST_ID,
    specialistStatus: 'MEASUREMENT_ONLY',
    calibrationFamilyCount: selected.calibration.length,
    calibrationDeviceCounts: Object.fromEntries([...new Set(calibrationDevices)].sort().map((device) => [device, calibrationDevices.filter((candidate) => candidate === device).length])),
    calibrationDeviceWeighting: EF2_CONFIG.deviceWeighting,
    lofoThreshold: { method: '90th percentile', value: threshold, source: 'CALIBRATION_CAMERA_ONLY' },
    excludedFeatures: model.excludedFeatures,
    calibrationRows: calibrationRows.map(publicRow),
    lofoRows: thresholdedLofo,
    model: publicModel(model),
    runtime: summarizeRuntime(calibrationRows),
    mediaAccess: { calibrationPixels: true, evaluationPixels: false, lgePixels: false },
  });
  const evaluationRows = [];
  for (const record of selected.evaluation) {
    const processed = await processRecord({ sharp, mediaRoot, record, model, repoCommit: baseCommit, featureRegistryHash: registryHash, configurationHash: configHash, benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT });
    const { featureVector, ...safe } = processed;
    assertNoVerdictFields(safe.measurement);
    evaluationRows.push({ ...safe, evaluationSlice: evaluationSlice(record) });
  }
  const evaluationThresholded = withThreshold(evaluationRows, threshold);
  const evaluation = { rows: evaluationThresholded, summary: evaluationSummary(evaluationThresholded, threshold), runtime: summarizeRuntime(evaluationThresholded) };
  const shortcutAuditResult = shortcutAudit(evaluationThresholded, benchmark);
  const deviceConfoundingResult = deviceConfounding(selected.calibration, calibrationVectors, model);
  const stageA = stageAResult({ calibrationLofo: thresholdedLofo, calibrationRecords: selected.calibration, evaluationRows: evaluationThresholded, threshold, shortcutAuditResult, deviceConfoundingResult });
  await writeJson(outputDir, 'ef2-evaluation-results.json', {
    schemaVersion: WP006C_RESULT_SCHEMA_VERSION,
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    implementationCommit: baseCommit,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    specialistId: WP006C_SPECIALIST_ID,
    specialistStatus: 'MEASUREMENT_ONLY',
    threshold: { method: '90th percentile calibration-camera LOFO', value: threshold, frozenBy: 'ef2-calibration-freeze.json' },
    rows: evaluationThresholded.map(publicRow),
    summary: evaluation.summary,
    stageA,
    runtime: evaluation.runtime,
    mediaAccess: { calibrationPixels: true, evaluationPixels: true, lgePixels: false },
  });
  await writeJson(outputDir, 'ef2-shortcut-audit.json', { benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT, implementationCommit: baseCommit, ...shortcutAuditResult, deviceConfounding: deviceConfoundingResult });
  const stressRecords = selectTransformationRecords(selected.calibration);
  const originalRowsBySample = new Map(calibrationRows.map((row, index) => [row.sampleId, { ...row, rawScore: scoreEf2FeatureVector(calibrationVectors[index], model)?.rawScore ?? null }]));
  const transformationRows = await runTransformationStress({ sharp, mediaRoot, records: stressRecords, model, repoCommit: baseCommit, featureRegistryHash: registryHash, configurationHash: configHash, benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT, originalRowsBySample });
  const transformationSummary = summarizeTransformation(transformationRows, threshold);
  const invariance = metadataStripInvariance(transformationRows);
  const robustness = transformationRobustness(transformationSummary);
  await writeJson(outputDir, 'ef2-transformation-stress.json', {
    schemaVersion: 'lythaus-wp006c-ef2-transformation-stress-v1',
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    implementationCommit: baseCommit,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    sourceFamilyCount: stressRecords.length,
    deviceCounts: Object.fromEntries([...new Set(stressRecords.map((record) => record.cameraDeviceFamily))].sort().map((device) => [device, stressRecords.filter((record) => record.cameraDeviceFamily === device).length])),
    rows: transformationRows,
    summary: transformationSummary,
    metadataStripInvariance: invariance,
    robustness,
    primaryAlgorithmRetuned: false,
    temporaryMediaPersisted: false,
  });
  let deviceHoldout = { status: 'SEALED', familyCount: benchmark.lgeRecords.length, validCount: 0, invalidCount: 0, acceptanceRate: null, medianScore: null, iqr: null, transfer: 'NOT_RUN', rows: [] };
  let holdoutPixelsAccessed = false;
  if (stageA.passed) {
    const holdoutFreeze = {
      schemaVersion: 'lythaus-wp006c-ef2-holdout-unblind-freeze-v1',
      benchmarkVersion: WP006C_BENCHMARK_VERSION,
      benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
      featureRegistryHash: registryHash,
      configurationHash: configHash,
      calibrationFreezeHash: freezeHash(calibrationFreeze),
      thresholdValue: threshold,
      stageA,
      shortcutAudit: shortcutAuditResult,
      transformationSummary,
      implementationCommit: baseCommit,
      device: WP006C_HOLDOUT_DEVICE,
      familyIds: deviceHoldoutIds(benchmark),
      sampleIds: benchmark.lgeRecords.map((record) => record.sampleId).sort(),
      decision: 'UNBLIND_AUTHORIZED',
      timestamp: new Date().toISOString(),
    };
    assertHoldoutUnblindFreeze(holdoutFreeze);
    await writeJson(outputDir, 'holdout-unblind-freeze.json', holdoutFreeze);
    const holdoutRows = [];
    for (const record of benchmark.lgeRecords) {
      const processed = await processRecord({ sharp, mediaRoot, record, model, repoCommit: baseCommit, featureRegistryHash: registryHash, configurationHash: configHash, benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT });
      const { featureVector, ...safe } = processed;
      assertNoVerdictFields(safe.measurement);
      holdoutRows.push({ ...safe, evaluationSlice: 'UNSEEN_DEVICE_HOLDOUT' });
    }
    holdoutPixelsAccessed = true;
    const holdoutThresholded = withThreshold(holdoutRows, threshold);
    const holdoutAcceptance = acceptance(holdoutThresholded, threshold);
    const holdoutScoreSummary = summarizeScores(holdoutThresholded.map((row) => row.rawScore));
    deviceHoldout = {
      status: 'CONSUMED',
      familyCount: benchmark.lgeRecords.length,
      validCount: holdoutAcceptance.valid,
      invalidCount: holdoutAcceptance.invalid,
      acceptanceRate: holdoutAcceptance.rate,
      medianScore: holdoutScoreSummary.median,
      iqr: holdoutScoreSummary.iqr,
      transfer: holdoutInterpretation(holdoutAcceptance.rate, holdoutScoreSummary.median, threshold),
      rows: holdoutThresholded,
    };
    await writeJson(outputDir, 'ef2-device-holdout-results.json', {
      schemaVersion: WP006C_RESULT_SCHEMA_VERSION,
      benchmarkVersion: WP006C_BENCHMARK_VERSION,
      benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
      implementationCommit: baseCommit,
      featureRegistryHash: registryHash,
      configurationHash: configHash,
      device: WP006C_HOLDOUT_DEVICE,
      status: 'CONSUMED_ONCE_WITH_FROZEN_MODEL',
      threshold,
      rows: holdoutThresholded.map(publicRow),
      summary: { validCount: holdoutAcceptance.valid, invalidCount: holdoutAcceptance.invalid, acceptanceRate: holdoutAcceptance.rate, rawScore: holdoutScoreSummary, runtime: summarizeRuntime(holdoutThresholded) },
      noRefit: true,
      noLgeNormalization: true,
    });
  }
  const decision = finalDecision(stageA, deviceHoldout.transfer, invariance);
  const classification = finalClassification(decision);
  const result = {
    baseCommit: plan.baseCommit,
    implementationCommit: baseCommit,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    calibration: { devices: [...new Set(calibrationDevices)].sort(), records: calibrationRows, lofo: thresholdedLofo, threshold },
    evaluation,
    stageA,
    shortcutAudit: shortcutAuditResult,
    deviceConfounding: deviceConfoundingResult,
    transformation: { metadataStripInvariance: invariance, robustness, summary: transformationSummary, rows: transformationRows },
    deviceHoldout: { ...deviceHoldout, rows: deviceHoldout.rows.map(publicRow) },
    counts: {
      calibrationCameraFamilies: selected.calibration.length,
      calibrationDeviceFamilies: new Set(calibrationDevices).size,
      seenCameraEvaluationFamilies: selected.cameraEvaluation.length,
      nonCameraEvaluationFamilies: selected.nonCameraEvaluation.length,
      hardNegativeEvaluationFamilies: selected.evaluation.filter((record) => record.candidateCategory === HARD_NEGATIVE_CATEGORY).length,
      syntheticEvaluationFamilies: selected.evaluation.filter((record) => record.candidateCategory === SYNTHETIC_CATEGORY).length,
    },
    decision,
    classification,
    nextStep: decision === 'PROMOTE_TO_CALIBRATION_CANDIDATE' ? 'WP006D — EF2 Multi-Device Expansion, Recapture & Transformation Replication' : 'WP006D — EF2 Benchmark Expansion and Independent Device/Non-Camera Replication',
    mediaAccess: { calibrationPixels: true, evaluationPixels: true, transformationPixels: true, lgePixels: holdoutPixelsAccessed },
    cost: { cloudCalls: 0, incrementalUsd: 0 },
  };
  await writeJson(outputDir, 'wp006c-run-manifest.json', {
    schemaVersion: WP006C_RUN_MANIFEST_SCHEMA_VERSION,
    benchmarkVersion: WP006C_BENCHMARK_VERSION,
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    baseCommit: plan.baseCommit,
    implementationCommit: baseCommit,
    specialistId: WP006C_SPECIALIST_ID,
    specialistVersion: WP006C_SPECIALIST_VERSION,
    featureRegistryHash: registryHash,
    configurationHash: configHash,
    planStatus: 'FROZEN_BEFORE_EVALUATION',
    specialistInferenceRun: false,
    externalInferenceCalls: 0,
    incrementalCostUsd: 0,
    mediaRootLabel: OWNER_ROOT_LABEL,
    mediaAccess: result.mediaAccess,
    deviceHoldoutStatus: deviceHoldout.status,
    unseenDeviceHoldoutConsumed: holdoutPixelsAccessed,
    sourceMediaModified: false,
    temporaryMediaPersisted: false,
    rawResidualsPersisted: false,
    rawMetadataPersisted: false,
    thresholdRetunedAfterEvaluation: false,
    decision,
    classification,
    status: 'COMPLETE',
  });
  await writeFile(path.resolve(outputDir, 'wp006c-final-report.md'), buildReport(result), 'utf8');
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(options.outputDir);
  if (options.phase === 'prepare') {
    const result = await prepareArtifacts(outputDir, WP006C_EXPECTED_BASE_SHA);
    console.log(JSON.stringify({ phase: 'prepare', baseCommit: WP006C_EXPECTED_BASE_SHA, ...result }));
    return;
  }
  const result = await runExperiment(outputDir, path.resolve(options.mediaRoot));
  console.log(JSON.stringify({ phase: 'run', classification: result.classification, decision: result.decision, stageA: result.stageA, deviceHoldout: { status: result.deviceHoldout.status, transfer: result.deviceHoldout.transfer }, cloudCalls: result.cost.cloudCalls }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
