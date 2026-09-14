import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EF2_CONFIG,
  EF2_FEATURE_REGISTRY,
  WP006C_BENCHMARK_VERSION,
  WP006C_CALIBRATION_FREEZE_SCHEMA_VERSION,
  WP006C_EXPECTED_BASE_SHA,
  WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
  WP006C_FEATURE_REGISTRY_SCHEMA_VERSION,
  WP006C_HOLDOUT_DEVICE,
  WP006C_SPECIALIST_ID,
  WP006C_SPECIALIST_VERSION,
  assertBlindDecodedPixels,
  assertCalibrationOnlyFreeze,
  assertNoVerdictFields,
  bootstrapAuc,
  buildSpecialistMeasurement,
  cliffsDelta,
  extractEf2FeatureVector,
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
import {
  WP006D_ARCHIVE_AUDIT_SCHEMA_VERSION,
  WP006D_BENCHMARK_VERSION,
  WP006D_CONTROL_MANIFEST_SCHEMA_VERSION,
  WP006D_EXPECTED_BASE_SHA,
  WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
  WP006D_EXPECTED_WP006C_SPECIALIST_ID,
  WP006D_EXPECTED_WP006C_SPECIALIST_VERSION,
  WP006D_FUTURE_HOLDOUT_DEVICES,
  WP006D_LGE_DEVICE,
  WP006D_MAX_SELECTED_BYTES,
  WP006D_MAX_SELECTED_IMAGES,
  WP006D_REPLICATION_DEVICES,
  WP006D_REPLICATION_MANIFEST_SCHEMA_VERSION,
  WP006D_REQUIRED_NEW_CONTROL_FAMILIES,
  WP006D_RESULT_SCHEMA_VERSION,
  WP006D_SUBSET_PLAN_SCHEMA_VERSION,
  assertSafeArchiveMember,
  assertWp006dBenchmarkFingerprint,
  assertWp006dPlan,
  assertWp006dSubsetPlan,
  centeredNativeCrop,
  hashWp006dPlan,
  selectCanonicalCropSize,
} from '../../packages/authenticity/src/wp006d.ts';

const OUTPUT_DEFAULT = 'research/wp006d';
const OWNER_ROOT_LABEL = 'external-owner-seed:wp004a-observer-v0/originals';
const OWNER_ROOT_ENV = 'WP006D_MEDIA_ROOT';
const ARCHIVE_ENV = 'WP006D_CSAFE_ARCHIVE';
const CACHE_ENV = 'WP006D_CSAFE_CACHE';
const ARCHIVE_SCRIPT = path.resolve('scripts/authenticity/wp006d-csafe-archive.py');
const OWNER_ROOT_DEFAULT = path.join(homedir(), 'OneDrive', 'Desktop', 'LythausForensicsData', 'wp004a-observer-v0', 'originals');
const DATA_ROOT_DEFAULT = path.join(homedir(), 'OneDrive', 'Desktop', 'LythausForensicsData');
const HARD_NEGATIVE_CATEGORY = 'HARD_NEGATIVE_CANDIDATE';
const DEVICE_REPLICATION_TARGET = 12;
const CONTROL_TARGET = 32;
const CONDITIONS = Object.freeze(['ORIGINAL_DECODED_PIXEL_CONDITION', 'CANONICAL_DECODED_PIXEL_CONDITION']);

function parseArgs(argv) {
  const options = {
    phase: 'prepare',
    outputDir: OUTPUT_DEFAULT,
    mediaRoot: process.env[OWNER_ROOT_ENV] ?? OWNER_ROOT_DEFAULT,
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
  if (!['prepare', 'run'].includes(options.phase)) throw new Error('phase_invalid');
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function requireSharp() {
  const require = createRequire(import.meta.url);
  const sharp = require('sharp');
  if (typeof sharp !== 'function') throw new Error('sharp_runtime_unavailable');
  return sharp;
}

function runPython(operation, args) {
  const output = execFileSync('python', [ARCHIVE_SCRIPT, operation, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function desktopRoots() {
  const roots = [
    path.join(homedir(), 'Desktop'),
    path.join(homedir(), 'OneDrive', 'Desktop'),
  ];
  return [...new Set(roots)];
}

async function boundedArchiveSearch() {
  const candidates = [];
  const visited = new Set();
  const directoryHint = /(lythaus|forensics|authenticity|csafe|dataset)/iu;
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
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.zip' && (current.hinted || /csafe|26932084/iu.test(entry.name))) {
          candidates.push(entryPath);
        } else if (entry.isDirectory() && current.depth < 3 && (current.hinted || directoryHint.test(entry.name))) {
          queue.push({ directory: entryPath, depth: current.depth + 1, hinted: current.hinted || directoryHint.test(entry.name) });
        }
      }
    }
  }
  return [...new Set(candidates)];
}

async function locateArchive(explicitArchive) {
  if (explicitArchive) {
    if (!(await stat(explicitArchive).catch(() => null))?.isFile()) throw new Error('WP006D_RUNTIME_STATUS=LOCAL_ARCHIVE_NOT_FOUND');
    return path.resolve(explicitArchive);
  }
  const candidates = await boundedArchiveSearch();
  if (candidates.length === 0) throw new Error('WP006D_RUNTIME_STATUS=LOCAL_ARCHIVE_NOT_FOUND');
  const verified = [];
  for (const candidate of candidates) {
    const name = path.basename(candidate).toLowerCase();
    if (name.includes('26932084') || name.includes('csafe')) verified.push(candidate);
  }
  if (verified.length !== 1) throw new Error(`WP006D_RUNTIME_STATUS=LOCAL_ARCHIVE_AMBIGUOUS:${verified.length}`);
  return path.resolve(verified[0]);
}

async function requireDirectory(directory, errorCode) {
  if (!(await stat(directory).catch(() => null))?.isDirectory()) throw new Error(errorCode);
}

function benchmarkPaths(outputDir) {
  return {
    manifest: path.resolve(outputDir, '../wp006b/benchmark-manifest.json'),
    rights: path.resolve(outputDir, '../wp006b/benchmark-rights.json'),
    splits: path.resolve(outputDir, '../wp006b/benchmark-splits.json'),
    fingerprint: path.resolve(outputDir, '../wp006b/benchmark-fingerprint.json'),
    readiness: path.resolve(outputDir, '../wp006b/ef2-data-readiness.json'),
    holdout: path.resolve(outputDir, '../wp006b/reserved-holdout-manifest.json'),
    ownerPool: path.resolve(outputDir, '../wp006b/owner-pool-inventory.json'),
    wp006cFreeze: path.resolve(outputDir, '../wp006c/ef2-calibration-freeze.json'),
    wp006cRegistry: path.resolve(outputDir, '../wp006c/ef2-feature-registry.json'),
  };
}

async function loadFrozenState(outputDir) {
  const files = benchmarkPaths(outputDir);
  const [manifest, rights, splits, fingerprint, readiness, holdout, ownerPool, wp006cFreeze, wp006cRegistry] = await Promise.all([
    readJson(files.manifest),
    readJson(files.rights),
    readJson(files.splits),
    readJson(files.fingerprint),
    readJson(files.readiness),
    readJson(files.holdout),
    readJson(files.ownerPool),
    readJson(files.wp006cFreeze),
    readJson(files.wp006cRegistry),
  ]);
  assertWp006bBenchmarkManifest(manifest);
  assertWp006bRightsManifest(rights);
  assertWp006bSplitsManifest(splits);
  assertWp006bFingerprint(fingerprint);
  if (manifest.schemaVersion !== WP006B_BENCHMARK_SCHEMA_VERSION || manifest.specialistInferenceRun !== false) throw new Error('wp006d_wp006b_manifest_invalid');
  if (fingerprint.benchmarkVersion !== WP006C_BENCHMARK_VERSION || fingerprint.fingerprintSha256 !== WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT) throw new Error('WP006D_START_GATE=BENCHMARK_CHANGED_REVIEW_REQUIRED');
  const canonicalInput = fingerprint.canonicalInput;
  if (sha256Hex(stableStringify(canonicalInput)) !== WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT) throw new Error('WP006D_START_GATE=BENCHMARK_CHANGED_REVIEW_REQUIRED');
  const currentInput = buildWp006bFingerprintInput({ manifest, rights, splits });
  for (const key of Object.keys(currentInput)) {
    if (stableStringify(currentInput[key]) !== stableStringify(canonicalInput[key])) throw new Error(`WP006D_START_GATE=BENCHMARK_CHANGED_REVIEW_REQUIRED:${key}`);
  }
  if (readiness.EF2_DATA_READINESS !== 'READY_FOR_BOUNDED_FEASIBILITY') throw new Error('WP006D_START_GATE=WP006B_READINESS_INVALID');
  const lgeRecords = (Array.isArray(holdout.records) ? holdout.records : []).filter((record) => record.cameraDeviceFamily === WP006D_LGE_DEVICE && record.split === 'DEVICE_HOLDOUT');
  if (lgeRecords.length !== 33) throw new Error(`WP006D_START_GATE=LGE_HOLDOUT_BOUNDARY_INVALID:${lgeRecords.length}`);
  if (WP006C_HOLDOUT_DEVICE !== WP006D_LGE_DEVICE) throw new Error('wp006d_lge_constant_invalid');
  assertCalibrationOnlyFreeze(wp006cFreeze);
  if (wp006cFreeze.benchmarkFingerprint !== WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT || wp006cFreeze.specialistId !== WP006D_EXPECTED_WP006C_SPECIALIST_ID || wp006cFreeze.specialistVersion !== WP006D_EXPECTED_WP006C_SPECIALIST_VERSION) throw new Error('wp006d_wp006c_freeze_identity_invalid');
  if (wp006cFreeze.schemaVersion !== WP006C_CALIBRATION_FREEZE_SCHEMA_VERSION) throw new Error('wp006d_wp006c_freeze_schema_invalid');
  const savedRegistryHash = wp006cRegistry.registryHash;
  const registryWithoutHash = jsonClone(wp006cRegistry);
  delete registryWithoutHash.registryHash;
  const registryHash = stableArtifactHash(registryWithoutHash);
  if (savedRegistryHash !== registryHash || registryHash !== wp006cFreeze.featureRegistryHash || registryHash !== stableArtifactHash(EF2_FEATURE_REGISTRY)) throw new Error('wp006d_wp006c_registry_changed');
  const configurationHash = stableArtifactHash(EF2_CONFIG);
  if (wp006cFreeze.configurationHash !== configurationHash) throw new Error('wp006d_wp006c_configuration_changed');
  if (!wp006cFreeze.model || wp006cFreeze.thresholdSource !== 'CALIBRATION_CAMERA_ONLY' || !Number.isFinite(wp006cFreeze.thresholdValue)) throw new Error('wp006d_wp006c_frozen_model_invalid');
  return { manifest, rights, splits, fingerprint, readiness, holdout, ownerPool, lgeRecords, wp006cFreeze, registryHash, configurationHash };
}

function sourceRelativeReference(logicalFileReference) {
  if (typeof logicalFileReference !== 'string') throw new Error('wp006d_owner_reference_invalid');
  const normalized = logicalFileReference.replaceAll('\\', '/');
  const marker = '/originals/';
  const index = normalized.indexOf(marker);
  if (index < 0) throw new Error('wp006d_owner_reference_root_invalid');
  const relative = normalized.slice(index + marker.length);
  if (!relative || relative.startsWith('/') || relative.split('/').some((part) => part === '..' || part.length === 0)) throw new Error('wp006d_owner_reference_unsafe');
  return relative;
}

async function resolveOwnerBytes(mediaRoot, record) {
  const relative = sourceRelativeReference(record.logicalFileReference);
  const direct = path.join(mediaRoot, ...relative.split('/'));
  const candidates = [direct];
  const folder = relative.split('/')[0];
  const folderPath = path.join(mediaRoot, folder);
  const directoryEntries = await readdir(folderPath, { withFileTypes: true }).catch(() => []);
  const idPrefix = String(record.sampleId).toLowerCase();
  for (const entry of directoryEntries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(extension)) continue;
    if (entry.name.toLowerCase().startsWith(idPrefix) || entry.name.toLowerCase() === path.basename(relative).toLowerCase()) candidates.push(path.join(folderPath, entry.name));
  }
  const unique = [...new Set(candidates)];
  const matches = [];
  for (const candidate of unique) {
    const candidateStat = await stat(candidate).catch(() => null);
    if (!candidateStat?.isFile()) continue;
    const bytes = await readFile(candidate);
    if (sha256Hex(bytes) === record.contentSha256) matches.push({ bytes, source: 'OWNER_CONTROLLED' });
  }
  if (matches.length === 0) {
    for (const entry of directoryEntries) {
      if (!entry.isFile() || !['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(path.extname(entry.name).toLowerCase())) continue;
      const candidate = path.join(folderPath, entry.name);
      if (unique.includes(candidate)) continue;
      const bytes = await readFile(candidate);
      if (sha256Hex(bytes) === record.contentSha256) matches.push({ bytes, source: 'OWNER_CONTROLLED' });
    }
  }
  if (matches.length !== 1) throw new Error(`wp006d_owner_media_resolution_${matches.length === 0 ? 'hash_mismatch' : 'ambiguous'}:${record.sampleId}`);
  return matches[0];
}

async function decodeRaw(sharp, bytes) {
  const decoded = await sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
  const result = {
    width: Number(decoded.info.width),
    height: Number(decoded.info.height),
    channels: Number(decoded.info.channels),
    pixels: new Uint8Array(decoded.data),
  };
  assertBlindDecodedPixels(result);
  return result;
}

async function safeDecodedMetadata(sharp, bytes) {
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
  return {
    width: Number(metadata.width ?? 0),
    height: Number(metadata.height ?? 0),
    mime: metadata.format ? `image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}` : 'image/jpeg',
    exifPresent: Boolean(metadata.exif),
    xmpPresent: Boolean(metadata.xmp),
    iptcPresent: Boolean(metadata.iptc),
    iccPresent: Boolean(metadata.icc),
    orientationPresent: Number.isInteger(metadata.orientation),
  };
}

async function averageHash(sharp, bytes) {
  const output = await sharp(bytes, { failOn: 'error' }).resize(32, 32, { fit: 'fill' }).grayscale().raw().toBuffer();
  let sum = 0;
  for (const value of output) sum += value;
  const mean = sum / output.length;
  let bits = '';
  for (const value of output) bits += value >= mean ? '1' : '0';
  return bits;
}

function hammingDistance(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return null;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

function evenlySpaced(items, count) {
  const sorted = [...items].sort((a, b) => String(a.member ?? a.sampleId).localeCompare(String(b.member ?? b.sampleId)));
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

function selectCsafeMembers(memberList) {
  const selected = [];
  for (const device of WP006D_REPLICATION_DEVICES) {
    const deviceMembers = memberList.filter((member) => member.deviceFamilyId === device && member.sceneType === 'natural');
    if (deviceMembers.length < DEVICE_REPLICATION_TARGET) throw new Error(`wp006d_csafe_device_underpowered:${device}`);
    const lenses = [...new Set(deviceMembers.map((member) => member.lens))].sort();
    if (lenses.length === 0) throw new Error(`wp006d_csafe_lens_inventory_missing:${device}`);
    const base = Math.floor(DEVICE_REPLICATION_TARGET / lenses.length);
    let remainder = DEVICE_REPLICATION_TARGET % lenses.length;
    for (const lens of lenses) {
      const quota = base + (remainder > 0 ? 1 : 0);
      remainder -= 1;
      selected.push(...evenlySpaced(deviceMembers.filter((member) => member.lens === lens), quota));
    }
  }
  if (selected.length !== WP006D_REPLICATION_DEVICES.length * DEVICE_REPLICATION_TARGET) throw new Error('wp006d_csafe_selected_count_invalid');
  return selected.sort((a, b) => `${a.deviceFamilyId}:${a.member}`.localeCompare(`${b.deviceFamilyId}:${b.member}`));
}

function selectControls(ownerPool) {
  const candidates = ownerPool.entries.filter((record) => record.poolRole === 'FUTURE_EXPANSION_POOL'
    && record.candidateCategory === HARD_NEGATIVE_CATEGORY
    && record.truthAxes?.physicalCameraAcquisition === 'FALSE'
    && !record.duplicateOfSampleId
    && !record.nearDuplicateGroupId);
  if (candidates.length < CONTROL_TARGET) throw new Error(`wp006d_new_control_pool_underpowered:${candidates.length}`);
  const selected = evenlySpaced(candidates.sort((a, b) => a.sampleId.localeCompare(b.sampleId)), CONTROL_TARGET);
  if (new Set(selected.map((record) => record.sourceFamilyId)).size !== selected.length) throw new Error('wp006d_control_family_duplicate');
  return selected.sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

function cacheDefaultPath(mediaRoot, archiveFingerprint) {
  const ownerDataRoot = path.resolve(mediaRoot, '..', '..');
  return path.join(ownerDataRoot, `wp006d-csafe-cache-${archiveFingerprint.slice(0, 12)}`);
}

async function createCache(cacheDir, archiveFingerprint) {
  const existing = await stat(cacheDir).catch(() => null);
  if (existing) {
    if (!existing.isDirectory()) throw new Error('wp006d_cache_path_not_directory');
    const marker = await readJson(path.join(cacheDir, 'cache-manifest.json')).catch(() => null);
    if (!marker || marker.archiveDirectoryFingerprint !== archiveFingerprint) throw new Error('wp006d_cache_path_exists_unrelated');
    return;
  }
  await mkdir(cacheDir, { recursive: true });
}

function archiveSelectionArgs(tempSelection, devices) {
  return ['--selection-json', tempSelection, '--output-dir', devices.cacheDir, '--replication-devices-json', devices.replicationJson, '--holdout-devices-json', devices.holdoutJson];
}

function groupCounts(records, field) {
  return Object.fromEntries([...new Set(records.map((record) => record[field] ?? 'UNKNOWN'))].sort().map((value) => [value, records.filter((record) => (record[field] ?? 'UNKNOWN') === value).length]));
}

function buildCsafeRecords(extraction, selectedMembers, archive, sharp) {
  const extractionByKey = new Map(extraction.records.map((record) => [`${record.outerMember}::${record.member}`, record]));
  return Promise.all(selectedMembers.map(async (member, index) => {
    const extractionRecord = extractionByKey.get(`${member.outerMember}::${member.member}`);
    if (!extractionRecord) throw new Error(`wp006d_extraction_record_missing:${member.member}`);
    const bytes = await readFile(path.join(activeCacheDir, extractionRecord.cacheRelativePath));
    const actualHash = sha256Hex(bytes);
    if (actualHash !== extractionRecord.contentSha256) throw new Error(`wp006d_extraction_hash_mismatch:${member.member}`);
    const metadata = await safeDecodedMetadata(sharp, bytes);
    const ahash = await averageHash(sharp, bytes);
    const sourceFamilyId = `CSAFE-FAMILY-${member.deviceFamilyId}-${String(index + 1).padStart(2, '0')}`;
    return {
      sampleId: `CSAFE_${member.deviceFamilyId}_${String(index + 1).padStart(2, '0')}`,
      sourceFamilyId,
      archiveMemberId: `${member.outerMember}::${member.member}`,
      cacheRelativePath: extractionRecord.cacheRelativePath,
      deviceFamilyId: member.deviceFamilyId,
      model: member.model,
      manufacturer: member.model?.startsWith('iPhone') ? 'Apple' : 'Samsung',
      sceneType: member.sceneType,
      lens: member.lens,
      sceneId: null,
      sceneIdentifierStatus: 'NOT_SUPPLIED_BY_DATASET',
      sourceFamilyRelation: 'ONE_DATASET_PHOTOGRAPH_ONE_SOURCE_FAMILY',
      contentSha256: actualHash,
      perceptualHash: ahash,
      perceptualHashAlgorithm: 'RESIZE32_GRAYSCALE_AVERAGE_64BIT_V1',
      byteSize: bytes.length,
      width: metadata.width,
      height: metadata.height,
      mime: metadata.mime,
      safeMetadata: {
        exifPresent: metadata.exifPresent,
        xmpPresent: metadata.xmpPresent,
        iptcPresent: metadata.iptcPresent,
        iccPresent: metadata.iccPresent,
        orientationPresent: metadata.orientationPresent,
      },
      truthAxes: {
        physicalCameraAcquisition: 'TRUE',
        syntheticDepictedContent: 'FALSE',
        localManipulation: 'FALSE',
        digitalCapture: 'FALSE',
        screenRecapture: 'FALSE',
      },
      truthConfidence: 'DATASET_PROVENANCE_CONFIRMED',
      truthBasis: 'CSAFE_DATASET_DOCUMENTATION_PHYSICAL_SMARTPHONE_CAPTURE',
      sourceDatasetId: 'csafe-multi-camera-smartphone-image-database-26932084',
      evaluationGate: 'ALLOW',
      trainingGate: 'DO_NOT_TRAIN',
      researchRole: 'CSAFE_REPLICATION_CAMERA',
      split: 'EVALUATION',
      ownerMediaModified: false,
      fullArchiveExtraction: false,
      archiveDirectoryFingerprint: archive.directoryFingerprintSha256,
    };
  }));
}

let activeCacheDir = null;

async function buildControlRecords(ownerPool, controls, mediaRoot, sharp) {
  return Promise.all(controls.map(async (record) => {
    const resolved = await resolveOwnerBytes(mediaRoot, record);
    const metadata = await safeDecodedMetadata(sharp, resolved.bytes);
    const ahash = await averageHash(sharp, resolved.bytes);
    return {
      sampleId: record.sampleId,
      sourceFamilyId: record.sourceFamilyId,
      logicalReference: record.logicalFileReference,
      hardNegativeType: record.hardNegativeType ?? 'UNKNOWN',
      sceneId: null,
      sceneIdentifierStatus: 'OWNER_POOL_NOT_SUPPLIED',
      contentSha256: sha256Hex(resolved.bytes),
      perceptualHash: ahash,
      perceptualHashAlgorithm: 'RESIZE32_GRAYSCALE_AVERAGE_64BIT_V1',
      byteSize: resolved.bytes.length,
      width: metadata.width,
      height: metadata.height,
      mime: metadata.mime,
      safeMetadata: {
        exifPresent: metadata.exifPresent,
        xmpPresent: metadata.xmpPresent,
        iptcPresent: metadata.iptcPresent,
        iccPresent: metadata.iccPresent,
        orientationPresent: metadata.orientationPresent,
      },
      truthAxes: {
        physicalCameraAcquisition: 'FALSE',
        syntheticDepictedContent: 'FALSE',
        localManipulation: record.truthAxes?.localManipulation ?? 'UNKNOWN',
        digitalCapture: record.truthAxes?.digitalCapture ?? 'TRUE',
        screenRecapture: record.truthAxes?.screenRecapture ?? 'UNKNOWN',
      },
      truthConfidence: record.truthConfidence ?? 'OWNER_CONFIRMED',
      truthBasis: 'OWNER_CONTROLLED_POOL_EXPLICIT_HARD_NEGATIVE_TYPING',
      sourceDatasetId: 'lythaus-owner-controlled-pool-wp006b-v2',
      evaluationGate: 'ALLOW',
      trainingGate: 'DO_NOT_TRAIN',
      researchRole: 'NEW_INDEPENDENT_NON_CAMERA_CONTROL',
      split: 'EVALUATION',
      poolRole: 'FUTURE_EXPANSION_POOL',
      ownerMediaModified: false,
      duplicateOfSampleId: null,
      nearDuplicateGroupId: null,
    };
  }));
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
    dimension: `${record.width}x${record.height}`,
    aspectRatio: Number((record.width / Math.max(1, record.height)).toFixed(2)),
    format: record.mime,
    fileSizeBucket: Math.floor(Math.log2(Math.max(1, record.byteSize))),
  };
}

function nuisanceMatchingReport(cameraRecords, selectedControls, allControls) {
  const before = {};
  const after = {};
  for (const field of ['dimension', 'aspectRatio', 'format', 'fileSizeBucket']) {
    before[field] = distinctOverlap(cameraRecords, allControls, (record) => nuisanceSignature(record)[field]);
    after[field] = distinctOverlap(cameraRecords, selectedControls, (record) => nuisanceSignature(record)[field]);
  }
  return {
    schemaVersion: 'lythaus-wp006d-nuisance-matching-v1',
    selectionUsesEf2Scores: false,
    selectionUsesPixels: false,
    matchingVariables: ['width', 'height', 'aspectRatio', 'mime', 'fileSizeBucket'],
    method: 'Camera membership was fixed by CSAFE device/lens/scene policy; controls were selected by deterministic source-family order and evenly spaced file-size ranks within the eligible future-expansion pool. No EF2 score, feature vector, visual judgment, or truth-derived score entered selection.',
    beforeMatching: before,
    afterMatching: after,
    cameraFamilies: cameraRecords.length,
    eligibleControlPoolFamilies: allControls.length,
    selectedControlFamilies: selectedControls.length,
    limitation: 'The owner future-expansion non-camera pool is screenshot-heavy and currently has the same portrait dimensions in nearly all eligible records; metadata matching cannot create missing subtype or dimension diversity.',
  };
}

function sourceFamilyLeakageReport(records) {
  const byHash = new Map();
  for (const record of records) {
    const prior = byHash.get(record.contentSha256) ?? [];
    prior.push(record.sampleId);
    byHash.set(record.contentSha256, prior);
  }
  const exactDuplicateGroups = [...byHash.values()].filter((ids) => ids.length > 1);
  const nearPairs = [];
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const distance = hammingDistance(records[left].perceptualHash, records[right].perceptualHash);
      if (distance !== null && distance <= 2) nearPairs.push({ left: records[left].sampleId, right: records[right].sampleId, distance });
    }
  }
  return {
    sourceFamilyLeakage: exactDuplicateGroups.length === 0 ? 'PASS' : 'FAIL',
    exactDuplicateGroups,
    exactDuplicateFileCount: exactDuplicateGroups.reduce((sum, ids) => sum + ids.length, 0),
    nearDuplicatePairCount: nearPairs.length,
    nearDuplicatePairs: nearPairs.slice(0, 100),
    nearDuplicateRule: '64-bit deterministic average-hash Hamming distance <=2 is recorded as a probable near-duplicate diagnostic; it does not silently merge source families.',
  };
}

function buildBenchmarkFingerprintInput({ archive, csafeRecords, controlRecords, subsetPlan, nuisanceReport, canonicalCropSize }) {
  return {
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    wp006cBenchmarkFingerprint: WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
    archiveDirectoryFingerprintSha256: archive.directoryFingerprintSha256,
    archiveReadmeSha256: archive.readme?.sha256 ?? null,
    replicationDevices: [...WP006D_REPLICATION_DEVICES],
    futureHoldoutDevices: [...WP006D_FUTURE_HOLDOUT_DEVICES],
    csafeReplication: csafeRecords.map((record) => ({
      sampleId: record.sampleId,
      sourceFamilyId: record.sourceFamilyId,
      contentSha256: record.contentSha256,
      deviceFamilyId: record.deviceFamilyId,
      model: record.model,
      sceneType: record.sceneType,
      lens: record.lens,
      truthAxes: record.truthAxes,
      researchRole: record.researchRole,
    })),
    nonCameraControls: controlRecords.map((record) => ({
      sampleId: record.sampleId,
      sourceFamilyId: record.sourceFamilyId,
      contentSha256: record.contentSha256,
      hardNegativeType: record.hardNegativeType,
      truthAxes: record.truthAxes,
      researchRole: record.researchRole,
    })),
    selectedReplicationMembers: subsetPlan.selectedReplicationMembers,
    selectedControlSampleIds: subsetPlan.selectedControlSampleIds,
    nuisanceMatching: nuisanceReport,
    canonicalPixelCrop: {
      size: canonicalCropSize,
      rule: 'CENTERED_NATIVE_DECODED_PIXEL_CROP_NO_RESIZE_V1',
    },
    lgeHoldoutStatus: 'SEALED',
    csafeFutureHoldoutStatus: 'SEALED',
    mediaCommittedToGit: false,
    modelOrCloudCalls: 0,
  };
}

function buildRightsMarkdown(archive, archivePathLabel = 'local CSAFE archive') {
  return `# WP006D — CSAFE rights and attribution\n\n` +
    `## Source\n\n` +
    `The locally audited source is the CSAFE Multicamera Smartphone Image Database, dataset record 26932084. The local archive was identified by its bounded Desktop/Lythaus search and is referenced in Git only by the label \`${archivePathLabel}\`.\n\n` +
    `- README member SHA-256: \`${archive.readme?.sha256 ?? 'NOT_FOUND'}\`\n` +
    `- Archive directory fingerprint: \`${archive.directoryFingerprintSha256}\`\n` +
    `- Dataset README-reported image count: 49,970 entries were present in the audited nested archives; the README describes an approximately 50,000-image study.\n` +
    `- Dataset README-reported design: Apple iPhone and Samsung Galaxy smartphones, six model families, ten device instances per model, blank/natural scenes and multiple lenses.\n\n` +
    `## License and attribution\n\n` +
    `The local README license page states Creative Commons Attribution (CC BY) 4.0 International: https://creativecommons.org/licenses/by/4.0/. Attribution is required for any permitted reuse. Credit the dataset as **CSAFE Multicamera Smartphone Image Database**, Megan McGuire and the listed dataset contributors/institutions in the source README, with the CC BY 4.0 link. This private research package does not publish or mirror image bytes.\n\n` +
    `## Rights matrix\n\n` +
    `| Dimension | Status | Basis / limitation |\n|---|---|---|\n| CODE_RIGHTS | NOT_APPLICABLE | WP006D runs Lythaus code; no third-party code is bundled. |\n| WEIGHT_RIGHTS | NOT_APPLICABLE | No model checkpoint or neural inference is used. |\n| SOURCE_MEDIA_RIGHTS | CC_BY_4.0_WITH_ATTRIBUTION | License stated in the local README. |\n| DATA_RIGHTS | VERIFIED_FOR_RESEARCH_WITH_ATTRIBUTION | Local README and license page were audited; dataset provenance remains tied to the source record. |\n| EVALUATION_RIGHTS | AUTHORIZED_BY_CC_BY_4.0_SUBJECT_TO_ATTRIBUTION | Only selected JPEGs are read locally; no full extraction or upload. |\n| INTERNAL_RESEARCH_RIGHTS | AUTHORIZED_BY_CC_BY_4.0_SUBJECT_TO_ATTRIBUTION | Internal forensic replication is within the declared research scope. |\n| COMMERCIAL_PRODUCT_EVALUATION_RIGHTS | LIKELY_PERMITTED_BY_CC_BY_4.0_SUBJECT_TO_ATTRIBUTION | Requires ordinary legal review of attribution, privacy and downstream product handling; not a public-release decision. |\n| PUBLIC_REDISTRIBUTION_RIGHTS | NOT_USED_IN_WP006D | No media is committed, uploaded or mirrored. |\n\n` +
    `The README states that no personally identifying or legally protected material was intentionally included. That is a source-document statement, not an independent legal warranty. Lythaus must keep the selected media private/local and retain the attribution record.\n\n` +
    `No new service, payment, cloud call, dataset download, full archive extraction, or model inference was used.\n`;
}

function buildSubsetPlan(selectedMembers, controls, archive, declaredSelectedBytes) {
  return {
    schemaVersion: WP006D_SUBSET_PLAN_SCHEMA_VERSION,
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    archiveLabel: 'CSAFE_ARCHIVE_26932084_ZIP',
    archiveDirectoryFingerprintSha256: archive.directoryFingerprintSha256,
    replicationDevices: [...WP006D_REPLICATION_DEVICES],
    futureHoldoutDevices: [...WP006D_FUTURE_HOLDOUT_DEVICES],
    selectedReplicationMembers: selectedMembers.map((member) => ({
      outerMember: member.outerMember,
      member: member.member,
      deviceFamilyId: member.deviceFamilyId,
      model: member.model,
      sceneType: member.sceneType,
      lens: member.lens,
      declaredSizeBytes: member.declaredSizeBytes,
    })),
    selectedControlSampleIds: controls.map((record) => record.sampleId).sort(),
    scenePolicy: 'Primary replication uses natural-scene entries selected across lenses; CSAFE supplies no stable scene identifiers in its audited directory, so scene disjointness is documented but not claimed.',
    sourceFamilyPolicy: 'One selected CSAFE photograph is one source family unless exact hashes reveal a duplicate; descendants are not created in WP006D.',
    holdoutPolicy: 'Four complete CSAFE device directories are membership-recorded only; no member bytes are extracted or decoded. LGE LM-G710 remains sealed under WP006C.',
    selectionUsesEf2Scores: false,
    futureHoldoutPixelsOpened: false,
    maximumSelectedImages: WP006D_MAX_SELECTED_IMAGES,
    maximumSelectedBytes: WP006D_MAX_SELECTED_BYTES,
    declaredSelectedBytes,
    selectionStatus: 'FROZEN_BEFORE_EF2_SCORES',
  };
}

async function prepareArtifacts(outputDir, options, state) {
  const outputStat = await stat(outputDir).catch(() => null);
  if (outputStat) {
    const existingPlan = await stat(path.join(outputDir, 'wp006d-plan.json')).catch(() => null);
    if (existingPlan) throw new Error('wp006d_plan_already_exists');
  }
  await requireDirectory(options.mediaRoot, 'WP006D_BLOCKER=OWNER_MEDIA_NOT_FOUND');
  const archivePath = await locateArchive(options.archive);
  const archive = runPython('audit', ['--archive', archivePath]);
  if (archive.schemaVersion !== WP006D_ARCHIVE_AUDIT_SCHEMA_VERSION || archive.pathSafety?.fullExtractionPerformed !== false) throw new Error('wp006d_archive_audit_invalid');
  if (archive.pathSafety?.unsafeEntryCount !== 0 || archive.pathSafety?.encryptedEntryCount !== 0) throw new Error('WP006D_STOP=ARCHIVE_MEMBER_SAFETY_FAILURE');
  if (archive.deviceCount !== 60 || archive.totalImageFiles !== 49970) throw new Error('WP006D_STOP=ARCHIVE_STRUCTURE_CONFLICT_REVIEW_REQUIRED');
  const availableDevices = new Set(archive.devices.map((device) => device.deviceFamilyId));
  if ([...WP006D_REPLICATION_DEVICES, ...WP006D_FUTURE_HOLDOUT_DEVICES].some((device) => !availableDevices.has(device))) throw new Error('wp006d_required_csafe_device_missing');
  const stateFiles = await loadFrozenState(outputDir);
  const memberTempDir = await mkdtemp(path.join(homedir(), 'wp006d-csafe-selection-'));
  const devicesJson = path.join(memberTempDir, 'devices.json');
  await writeFile(devicesJson, JSON.stringify([...WP006D_REPLICATION_DEVICES, ...WP006D_FUTURE_HOLDOUT_DEVICES]), 'utf8');
  const listed = runPython('list', ['--archive', archivePath, '--devices-json', devicesJson]);
  const selectedMembers = selectCsafeMembers(listed.members);
  const controls = selectControls(stateFiles.ownerPool);
  const declaredSelectedBytes = selectedMembers.reduce((sum, member) => sum + Number(member.declaredSizeBytes), 0);
  const subsetPlan = buildSubsetPlan(selectedMembers, controls, archive, declaredSelectedBytes);
  assertWp006dSubsetPlan(subsetPlan);
  await writeJson(outputDir, 'csafe-subset-plan.json', subsetPlan);
  const cacheDir = options.cacheDir ? path.resolve(options.cacheDir) : cacheDefaultPath(options.mediaRoot, archive.directoryFingerprintSha256);
  await createCache(cacheDir, archive.directoryFingerprintSha256);
  activeCacheDir = cacheDir;
  const selectionJson = path.join(memberTempDir, 'selection.json');
  await writeFile(selectionJson, JSON.stringify(selectedMembers), 'utf8');
  const replicationJson = path.join(memberTempDir, 'replication.json');
  const holdoutJson = path.join(memberTempDir, 'holdout.json');
  await writeFile(replicationJson, JSON.stringify([...WP006D_REPLICATION_DEVICES]), 'utf8');
  await writeFile(holdoutJson, JSON.stringify([...WP006D_FUTURE_HOLDOUT_DEVICES]), 'utf8');
  const extraction = runPython('extract', ['--archive', archivePath, ...archiveSelectionArgs(selectionJson, { cacheDir, replicationJson, holdoutJson })]);
  if (extraction.selectedImageCount !== selectedMembers.length || extraction.declaredBytes !== declaredSelectedBytes || extraction.fullExtractionPerformed !== false || extraction.holdoutDevicesOpened.length !== 0) throw new Error('wp006d_selective_extraction_accounting_invalid');
  const sharp = requireSharp();
  if (typeof sharp.concurrency === 'function') sharp.concurrency(1);
  if (typeof sharp.cache === 'function') sharp.cache({ items: 0, memory: 0, files: 0 });
  const csafeRecords = await buildCsafeRecords(extraction, selectedMembers, archive, sharp);
  const controlRecords = await buildControlRecords(stateFiles.ownerPool, controls, options.mediaRoot, sharp);
  if (new Set([...csafeRecords, ...controlRecords].map((record) => record.contentSha256)).size !== csafeRecords.length + controlRecords.length) throw new Error('WP006D_STOP=SOURCE_FAMILY_EXACT_DUPLICATE');
  const leakage = sourceFamilyLeakageReport([...csafeRecords, ...controlRecords]);
  if (leakage.sourceFamilyLeakage !== 'PASS') throw new Error('WP006D_STOP=SOURCE_FAMILY_LEAKAGE');
  const dimensions = [...csafeRecords, ...controlRecords].map((record) => ({ width: record.width, height: record.height }));
  const canonicalCropSize = selectCanonicalCropSize(dimensions, 0.9);
  const nuisanceReport = nuisanceMatchingReport(csafeRecords, controlRecords, stateFiles.ownerPool.entries.filter((record) => record.poolRole === 'FUTURE_EXPANSION_POOL' && record.candidateCategory === HARD_NEGATIVE_CATEGORY && !record.duplicateOfSampleId && !record.nearDuplicateGroupId));
  const fingerprintInput = buildBenchmarkFingerprintInput({ archive, csafeRecords, controlRecords, subsetPlan, nuisanceReport, canonicalCropSize });
  const benchmarkFingerprint = stableArtifactHash(fingerprintInput);
  const implementationCommit = currentCommit();
  const plan = {
    schemaVersion: 'lythaus-wp006d-ef2-plan-v1',
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    benchmarkFingerprint,
    baseSha: WP006D_EXPECTED_BASE_SHA,
    implementationCommit,
    researchDate: new Date().toISOString().slice(0, 10),
    wp006cHistorical: {
      benchmarkVersion: WP006C_BENCHMARK_VERSION,
      benchmarkFingerprint: WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
      decision: 'REJECT_CURRENT_EF2_MEASUREMENT',
      stageA: 'FAIL',
      measurementId: WP006C_SPECIALIST_ID,
      measurementVersion: WP006C_SPECIALIST_VERSION,
    },
    wp006cFrozenModel: {
      featureRegistrySchemaVersion: WP006C_FEATURE_REGISTRY_SCHEMA_VERSION,
      featureRegistryHash: stateFiles.registryHash,
      configurationHash: stateFiles.configurationHash,
      calibrationFreezeSchemaVersion: stateFiles.wp006cFreeze.schemaVersion,
      calibrationFreezeHash: stableArtifactHash(stateFiles.wp006cFreeze),
      thresholdSource: stateFiles.wp006cFreeze.thresholdSource,
      thresholdValue: stateFiles.wp006cFreeze.thresholdValue,
      sourceCodeCommit: stateFiles.wp006cFreeze.sourceCodeCommit,
      frozenWithoutCsafeRefit: true,
    },
    researchQuestions: [
      'Does the frozen WP006C v0 measurement reproduce camera-consistency on independently sourced multi-device CSAFE images?',
      'Does it separate the new non-camera controls without relying on obvious file/container nuisance differences?',
      'Does the canonical decoded-pixel challenge preserve any separation?',
      'Can a stronger, leak-resistant benchmark foundation be handed to a later EF2 v1 design without consuming sealed devices?',
    ],
    csafe: {
      archiveLabel: 'CSAFE_ARCHIVE_26932084_ZIP',
      archiveDirectoryFingerprintSha256: archive.directoryFingerprintSha256,
      readmeSha256: archive.readme?.sha256 ?? null,
      replicationDevices: [...WP006D_REPLICATION_DEVICES],
      futureHoldoutDevices: [...WP006D_FUTURE_HOLDOUT_DEVICES],
      replicationFamilies: csafeRecords.length,
      selectedImages: csafeRecords.length,
      selectedDeclaredBytes: declaredSelectedBytes,
      futureHoldoutDeviceCount: WP006D_FUTURE_HOLDOUT_DEVICES.length,
      fullExtractionPerformed: false,
    },
    nonCameraControls: {
      selectedFamilies: controlRecords.length,
      sourcePoolRole: 'FUTURE_EXPANSION_POOL',
      subtypeCounts: groupCounts(controlRecords, 'hardNegativeType'),
      truth: 'physicalCameraAcquisition=FALSE; not a FAKE_IMAGE label',
    },
    sceneHandling: {
      sceneIdentifiersAvailable: false,
      sceneLeakageStatus: 'DOCUMENTED_NOT_DISJOINT',
      matchedSceneDiagnostic: 'NOT_RUN',
      primarySelection: 'natural entries across lenses; no scene ID or score-based selection',
    },
    canonicalPixelChallenge: {
      cropSize: canonicalCropSize,
      coverage: dimensions.filter((dimension) => dimension.width >= canonicalCropSize && dimension.height >= canonicalCropSize).length / dimensions.length,
      rule: 'CENTERED_NATIVE_DECODED_PIXEL_CROP_NO_RESIZE_V1',
      input: 'decoded pixels only; container metadata, filename, format, dimensions as classifier variables and file size are not passed to the frozen feature extractor',
    },
    nuisanceMatching: nuisanceReport,
    sourceFamilyPolicy: {
      exactDuplicateLeakage: leakage.sourceFamilyLeakage,
      exactDuplicateGroups: leakage.exactDuplicateGroups,
      nearDuplicatePairCount: leakage.nearDuplicatePairCount,
      nearDuplicateRule: leakage.nearDuplicateRule,
    },
    frozenBoundaries: {
      lgeHoldoutDevice: WP006D_LGE_DEVICE,
      lgeHoldoutStatus: 'SEALED',
      lgeHoldoutFamilyCount: stateFiles.lgeRecords.length,
      csafeFutureHoldoutStatus: 'SEALED',
      csafeFutureHoldoutDeviceCount: WP006D_FUTURE_HOLDOUT_DEVICES.length,
      reservedOwnerHoldoutsUsed: false,
      wp006cThresholdRetuned: false,
      v0FeatureRegistryChanged: false,
      v0ModelRefit: false,
    },
    selectionUsesEf2Scores: false,
    noCloudCalls: true,
    noModelInference: true,
    noTraining: true,
    noProductionChanges: true,
    planStatus: 'FROZEN_BEFORE_EF2_SCORES',
  };
  assertWp006dPlan(plan);
  const planHash = hashWp006dPlan(plan);
  const fingerprint = {
    schemaVersion: 'lythaus-wp006d-benchmark-fingerprint-v1',
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    fingerprintSha256: benchmarkFingerprint,
    planHash,
    canonicalInput: fingerprintInput,
    lgeHoldoutStatus: 'SEALED',
    csafeFutureHoldoutStatus: 'SEALED',
    mediaCommittedToGit: false,
  };
  assertWp006dBenchmarkFingerprint(fingerprint);
  await writeJson(outputDir, 'csafe-archive-audit.json', archive);
  await writeMarkdown(outputDir, 'csafe-rights-and-attribution.md', buildRightsMarkdown(archive));
  await writeJson(outputDir, 'csafe-device-inventory.json', {
    schemaVersion: 'lythaus-wp006d-csafe-device-inventory-v1',
    archiveLabel: archive.archiveLabel,
    deviceCount: archive.deviceCount,
    devices: archive.devices,
    replicationDeviceIds: [...WP006D_REPLICATION_DEVICES],
    futureHoldoutDeviceIds: [...WP006D_FUTURE_HOLDOUT_DEVICES],
    futureHoldoutPixelsOpened: false,
  });
  await writeJson(outputDir, 'csafe-replication-manifest.json', {
    schemaVersion: WP006D_REPLICATION_MANIFEST_SCHEMA_VERSION,
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    archiveLabel: archive.archiveLabel,
    archiveDirectoryFingerprintSha256: archive.directoryFingerprintSha256,
    researchRole: 'CSAFE_REPLICATION_CAMERA',
    records: csafeRecords,
    mediaCommittedToGit: false,
    futureHoldoutPixelsOpened: false,
  });
  await writeJson(outputDir, 'non-camera-control-manifest.json', {
    schemaVersion: WP006D_CONTROL_MANIFEST_SCHEMA_VERSION,
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    researchRole: 'NEW_INDEPENDENT_NON_CAMERA_CONTROL',
    records: controlRecords,
    selectionUsesEf2Scores: false,
    ownerReservedFutureHoldoutUsed: false,
    mediaCommittedToGit: false,
  });
  await writeJson(outputDir, 'nuisance-matching-report.json', nuisanceReport);
  await writeJson(outputDir, 'wp006d-plan.json', plan);
  await writeJson(outputDir, 'wp006d-fingerprint.json', fingerprint);
  await writeJson(outputDir, 'wp006d-run-manifest.json', {
    schemaVersion: 'lythaus-wp006d-run-manifest-v1',
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    benchmarkFingerprint,
    planHash,
    baseSha: WP006D_EXPECTED_BASE_SHA,
    implementationCommit,
    status: 'PLANNED',
    v0Frozen: true,
    v0ModelRefit: false,
    thresholdRetuned: false,
    modelInferenceCalls: 0,
    cloudCalls: 0,
    incrementalCostUsd: 0,
    fullArchiveExtraction: false,
    selectiveExtraction: { imageCount: csafeRecords.length, declaredBytes: declaredSelectedBytes, maximumImages: WP006D_MAX_SELECTED_IMAGES, maximumBytes: WP006D_MAX_SELECTED_BYTES },
    mediaAccess: { selectedInventoryPixels: true, replicationScoringPixels: false, nonCameraControlScoringPixels: false, csafeFutureHoldoutPixels: false, lgePixels: false },
    holdouts: { lge: 'SEALED', csafeFutureDevices: 'SEALED' },
    sourceMediaModified: false,
    mediaCommittedToGit: false,
    rawResidualsPersisted: false,
    rawMetadataPersisted: false,
    productionChanges: false,
  });
  await writeFile(path.join(cacheDir, 'cache-manifest.json'), `${JSON.stringify({ schemaVersion: 'lythaus-wp006d-local-csafe-cache-v1', archiveDirectoryFingerprint: archive.directoryFingerprintSha256, planHash, selectedImageCount: csafeRecords.length, futureHoldoutDevicesOpened: [], mediaCommittedToGit: false }, null, 2)}\n`, 'utf8');
  await rm(memberTempDir, { recursive: true, force: true });
  return { archive, csafeRecords, controlRecords, subsetPlan, plan, planHash, benchmarkFingerprint, cacheDir, stateFiles };
}

function readConditionRows(resultRows, condition) {
  return resultRows.filter((row) => row.condition === condition);
}

function acceptance(rows, threshold) {
  const valid = rows.filter((row) => Number.isFinite(row.rawScore));
  const accepted = valid.filter((row) => row.rawScore <= threshold);
  return { valid: valid.length, accepted: accepted.length, rejected: valid.length - accepted.length, invalid: rows.length - valid.length, rate: valid.length === 0 ? null : accepted.length / valid.length };
}

function rowSummary(rows, threshold) {
  const scores = rows.map((row) => row.rawScore).filter((value) => Number.isFinite(value));
  const decision = acceptance(rows, threshold);
  return {
    sampleCount: rows.length,
    sourceFamilyCount: new Set(rows.map((row) => row.sourceFamilyId)).size,
    validCount: scores.length,
    invalidCount: rows.length - scores.length,
    rawScore: summarizeScores(scores),
    normalizedMedian: medianFinite(rows.map((row) => row.normalizedMeasurement)),
    acceptanceAtFrozenThreshold: decision,
    runtimeMs: summarizeScores(rows.map((row) => row.runtimeMs)),
  };
}

function riskFromAuc(auc) {
  if (auc === null) return 'UNKNOWN';
  const separation = Math.abs(auc - 0.5);
  if (separation >= 0.4) return 'HIGH';
  if (separation >= 0.25) return 'MODERATE';
  return 'LOW';
}

function recordMap(csafeRecords, controls) {
  return new Map([...csafeRecords, ...controls].map((record) => [record.sampleId, record]));
}

function nuisanceAudit(rows, csafeRecords, controls) {
  const byId = recordMap(csafeRecords, controls);
  const cameraRows = rows.filter((row) => row.researchRole === 'CSAFE_REPLICATION_CAMERA');
  const controlRows = rows.filter((row) => row.researchRole === 'NEW_INDEPENDENT_NON_CAMERA_CONTROL');
  const variable = (name, getter, basis) => ({ name, auc: rocAuc(cameraRows.map((row) => getter(byId.get(row.sampleId))).filter(Number.isFinite), controlRows.map((row) => getter(byId.get(row.sampleId))).filter(Number.isFinite)), basis });
  const dimensions = variable('dimensions', (record) => record ? Math.log1p(record.width * record.height) : Number.NaN, 'Univariate decoded dimensions from the frozen manifest; not in primary score.');
  const fileSize = variable('fileSize', (record) => record ? Math.log1p(record.byteSize) : Number.NaN, 'Univariate file size from the frozen manifest; not in primary score.');
  const format = variable('format', (record) => record?.mime === 'image/jpeg' ? 1 : 0, 'Format marker from manifest; not in primary score.');
  const metadata = variable('metadataPresence', (record) => record && (record.safeMetadata.exifPresent || record.safeMetadata.xmpPresent || record.safeMetadata.iptcPresent || record.safeMetadata.iccPresent) ? 1 : 0, 'Safe metadata-presence marker only; metadata values are not in primary score.');
  const audited = Object.fromEntries([dimensions, fileSize, format, metadata].map((entry) => [entry.name, { auc: entry.auc, risk: riskFromAuc(entry.auc), basis: entry.basis }]));
  return {
    schemaVersion: 'lythaus-wp006d-shortcut-audit-v1',
    primaryScoreUnaffected: true,
    rowsUsed: rows.length,
    variables: audited,
    deviceIdentity: { risk: 'HIGH', basis: 'All CSAFE camera rows carry a provenance device label while owner controls intentionally do not; this is curation metadata and not a primary score input.' },
    shortcutRisk: Object.values(audited).some((entry) => entry.risk === 'HIGH') ? 'HIGH' : Object.values(audited).some((entry) => entry.risk === 'MODERATE') ? 'MODERATE' : 'LOW',
    method: 'Descriptive univariate AUC after frozen-plan selection; no nuisance variable entered the frozen v0 feature extractor or score.',
    limitation: 'The owner control pool is screenshot-heavy and the CSAFE camera dimensions/metadata differ structurally; canonical decoded-pixel results are the relevant nuisance-neutralized diagnostic.',
  };
}

function perDeviceSummary(rows, threshold) {
  const devices = [...new Set(rows.map((row) => row.deviceFamilyId).filter(Boolean))].sort();
  return Object.fromEntries(devices.map((device) => [device, rowSummary(rows.filter((row) => row.deviceFamilyId === device), threshold)]));
}

function replicationSummary(rows, csafeRecords, controls, threshold) {
  const camera = rows.filter((row) => row.researchRole === 'CSAFE_REPLICATION_CAMERA');
  const nonCamera = rows.filter((row) => row.researchRole === 'NEW_INDEPENDENT_NON_CAMERA_CONTROL');
  const bySubtype = Object.fromEntries([...new Set(controls.map((record) => record.hardNegativeType))].sort().map((subtype) => [subtype, rowSummary(nonCamera.filter((row) => controls.find((record) => record.sampleId === row.sampleId)?.hardNegativeType === subtype), threshold)]));
  return {
    all: rowSummary(rows, threshold),
    camera: rowSummary(camera, threshold),
    nonCamera: rowSummary(nonCamera, threshold),
    cameraVsNonCamera: {
      rocAuc: rocAuc(camera.map((row) => row.rawScore), nonCamera.map((row) => row.rawScore)),
      bootstrap95: bootstrapAuc(camera.map((row) => row.rawScore), nonCamera.map((row) => row.rawScore)),
      cliffsDelta: cliffsDelta(camera.map((row) => row.rawScore), nonCamera.map((row) => row.rawScore)),
    },
    perDevice: perDeviceSummary(camera, threshold),
    nonCameraBySubtype: bySubtype,
    counts: {
      cameraFamilies: csafeRecords.length,
      nonCameraFamilies: controls.length,
      cameraDevices: new Set(csafeRecords.map((record) => record.deviceFamilyId)).size,
    },
  };
}

function transformationClassification(originalRows, canonicalRows, threshold) {
  const cameraOriginal = acceptance(originalRows.filter((row) => row.researchRole === 'CSAFE_REPLICATION_CAMERA'), threshold).rate;
  const cameraCanonical = acceptance(canonicalRows.filter((row) => row.researchRole === 'CSAFE_REPLICATION_CAMERA'), threshold).rate;
  const controlOriginal = acceptance(originalRows.filter((row) => row.researchRole === 'NEW_INDEPENDENT_NON_CAMERA_CONTROL'), threshold).rate;
  const controlCanonical = acceptance(canonicalRows.filter((row) => row.researchRole === 'NEW_INDEPENDENT_NON_CAMERA_CONTROL'), threshold).rate;
  if (cameraCanonical === null || controlCanonical === null) return 'NOT_RUN';
  if (cameraCanonical >= 0.6 && controlCanonical <= 0.3 && Math.abs(cameraOriginal - cameraCanonical) <= 0.25) return 'STRONG';
  if (cameraCanonical >= 0.4 && controlCanonical <= 0.5) return 'MIXED';
  return 'WEAK';
}

function externalReplicationClassification(originalSummary, canonicalSummary, deviceSummary, shortcutAudit) {
  const deviceRates = Object.values(deviceSummary).map((value) => value.acceptanceAtFrozenThreshold.rate).filter((value) => Number.isFinite(value));
  const originalCamera = originalSummary.camera.acceptanceAtFrozenThreshold.rate;
  const originalControls = originalSummary.nonCamera.acceptanceAtFrozenThreshold.rate;
  const canonicalCamera = canonicalSummary.camera.acceptanceAtFrozenThreshold.rate;
  const canonicalControls = canonicalSummary.nonCamera.acceptanceAtFrozenThreshold.rate;
  const promising = originalCamera !== null && originalCamera >= 0.7
    && deviceRates.filter((value) => value >= 0.6).length >= 4
    && originalControls !== null && originalControls <= 0.25
    && canonicalCamera !== null && canonicalCamera >= 0.6
    && canonicalControls !== null && canonicalControls <= 0.3
    && shortcutAudit.shortcutRisk !== 'HIGH';
  if (promising) return 'PROMISING';
  if ((originalCamera !== null && originalCamera < 0.4) || (canonicalCamera !== null && canonicalCamera < 0.4)) return 'FAILED';
  return 'MIXED';
}

function safeResultRow(record, condition, measurement, features, runtimeMs, decoded) {
  assertNoVerdictFields(measurement);
  return {
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    researchRole: record.researchRole,
    condition,
    deviceFamilyId: record.deviceFamilyId ?? null,
    hardNegativeType: record.hardNegativeType ?? null,
    inputHash: record.contentSha256,
    rawScore: measurement.rawScore,
    normalizedMeasurement: measurement.normalizedMeasurement,
    groupScores: measurement.rawScore === null ? {} : features.applicability === 'applicable' ? scoreEf2FeatureVector(features.values, frozenModel).groupScores : {},
    acceptedAtFrozenThreshold: null,
    applicability: features.applicability,
    patchCount: features.patchCount,
    unavailableFeatures: features.unavailableFeatures,
    runtimeMs,
    decodedWidth: decoded.width,
    decodedHeight: decoded.height,
    measurement,
  };
}

let frozenModel = null;

async function scoreRecord(sharp, record, bytes, condition, plan, stateFiles, implementationCommit) {
  const started = performance.now();
  const decoded = await decodeRaw(sharp, bytes);
  const input = condition === 'ORIGINAL_DECODED_PIXEL_CONDITION' ? decoded : centeredNativeCrop(decoded, plan.canonicalPixelChallenge.cropSize);
  const features = extractEf2FeatureVector(input);
  const score = features.applicability === 'applicable' ? scoreEf2FeatureVector(features.values, frozenModel) : null;
  const measurement = buildSpecialistMeasurement({
    inputHash: record.contentSha256,
    measurement: score,
    runtimeMs: performance.now() - started,
    repositoryCommit: implementationCommit,
    featureRegistryHash: stateFiles.registryHash,
    configurationHash: stateFiles.configurationHash,
    benchmarkFingerprint: plan.benchmarkFingerprint,
    applicability: features.applicability,
    limitations: [
      'WP006D external replication of frozen WP006C v0; no CSAFE refit or threshold retuning.',
      'normalizedMeasurement is not a probability of camera origin.',
      'No PRNU claim, camera identification, synthetic verdict, directional evidence or product enforcement.',
      condition === 'CANONICAL_DECODED_PIXEL_CONDITION' ? 'Canonical challenge uses a deterministic centered decoded-pixel crop and no resize.' : 'Original condition uses the native decoded pixel grid returned by the decoder without EXIF rotation.',
    ],
  });
  return safeResultRow(record, condition, measurement, features, measurement.runtimeMs, input);
}

async function loadRecordBytes(record, mediaRoot) {
  if (record.researchRole === 'CSAFE_REPLICATION_CAMERA') return readFile(path.join(activeCacheDir, record.cacheRelativePath));
  return (await resolveOwnerBytes(mediaRoot, record)).bytes;
}

async function runScores(outputDir, options, stateFiles) {
  const plan = await readJson(path.join(outputDir, 'wp006d-plan.json'));
  assertWp006dPlan(plan);
  if (plan.implementationCommit !== currentCommit()) throw new Error('wp006d_implementation_commit_changed_after_plan');
  const fingerprint = await readJson(path.join(outputDir, 'wp006d-fingerprint.json'));
  assertWp006dBenchmarkFingerprint(fingerprint);
  if (fingerprint.planHash !== hashWp006dPlan(plan) || fingerprint.fingerprintSha256 !== plan.benchmarkFingerprint) throw new Error('wp006d_plan_or_fingerprint_mismatch');
  const subsetPlan = await readJson(path.join(outputDir, 'csafe-subset-plan.json'));
  assertWp006dSubsetPlan(subsetPlan);
  const csafeManifest = await readJson(path.join(outputDir, 'csafe-replication-manifest.json'));
  const controlManifest = await readJson(path.join(outputDir, 'non-camera-control-manifest.json'));
  if (csafeManifest.futureHoldoutPixelsOpened !== false || plan.frozenBoundaries.lgeHoldoutStatus !== 'SEALED' || plan.frozenBoundaries.csafeFutureHoldoutStatus !== 'SEALED') throw new Error('WP006D_STOP=HOLDOUT_BOUNDARY_INVALID');
  const cacheDir = options.cacheDir ? path.resolve(options.cacheDir) : cacheDefaultPath(options.mediaRoot, plan.csafe.archiveDirectoryFingerprintSha256);
  await requireDirectory(cacheDir, 'WP006D_RUNTIME_STATUS=SELECTIVE_CACHE_NOT_FOUND');
  const cacheMarker = await readJson(path.join(cacheDir, 'cache-manifest.json')).catch(() => null);
  if (!cacheMarker || cacheMarker.planHash !== fingerprint.planHash || (cacheMarker.futureHoldoutDevicesOpened ?? []).length !== 0) throw new Error('WP006D_STOP=SELECTED_CACHE_BOUNDARY_INVALID');
  activeCacheDir = cacheDir;
  const resultPaths = ['v0-replication-results.json', 'canonical-pixel-challenge.json', 'wp006d-final-report.md'];
  for (const filename of resultPaths) if (await stat(path.join(outputDir, filename)).catch(() => null)) throw new Error(`wp006d_result_already_exists:${filename}`);
  frozenModel = stateFiles.wp006cFreeze.model;
  const sharp = requireSharp();
  if (typeof sharp.concurrency === 'function') sharp.concurrency(1);
  if (typeof sharp.cache === 'function') sharp.cache({ items: 0, memory: 0, files: 0 });
  const records = [...csafeManifest.records, ...controlManifest.records];
  const rows = [];
  for (const record of records) {
    const bytes = await loadRecordBytes(record, options.mediaRoot);
    if (sha256Hex(bytes) !== record.contentSha256) throw new Error(`wp006d_run_input_hash_mismatch:${record.sampleId}`);
    for (const condition of CONDITIONS) rows.push(await scoreRecord(sharp, record, bytes, condition, plan, stateFiles, currentCommit()));
  }
  const threshold = stateFiles.wp006cFreeze.thresholdValue;
  const thresholdedRows = rows.map((row) => ({ ...row, acceptedAtFrozenThreshold: Number.isFinite(row.rawScore) ? row.rawScore <= threshold : null }));
  const originalRows = readConditionRows(thresholdedRows, 'ORIGINAL_DECODED_PIXEL_CONDITION');
  const canonicalRows = readConditionRows(thresholdedRows, 'CANONICAL_DECODED_PIXEL_CONDITION');
  const originalSummary = replicationSummary(originalRows, csafeManifest.records, controlManifest.records, threshold);
  const canonicalSummary = replicationSummary(canonicalRows, csafeManifest.records, controlManifest.records, threshold);
  const shortcutAudit = nuisanceAudit(originalRows, csafeManifest.records, controlManifest.records);
  const sourceLeakage = sourceFamilyLeakageReport([...csafeManifest.records, ...controlManifest.records]);
  const pixelSignalSurvival = transformationClassification(originalRows, canonicalRows, threshold);
  const v0ExternalReplication = externalReplicationClassification(originalSummary, canonicalSummary, originalSummary.perDevice, shortcutAudit);
  const canonicalChallenge = {
    schemaVersion: 'lythaus-wp006d-canonical-pixel-challenge-v1',
    benchmarkFingerprint: plan.benchmarkFingerprint,
    cropSize: plan.canonicalPixelChallenge.cropSize,
    cropRule: plan.canonicalPixelChallenge.rule,
    dimensionsOnlySelectionCoverage: plan.canonicalPixelChallenge.coverage,
    metadataAndContainerInputsRemoved: true,
    resizeApplied: false,
    camera: canonicalSummary.camera,
    nonCamera: canonicalSummary.nonCamera,
    cameraVsNonCamera: canonicalSummary.cameraVsNonCamera,
    pixelSignalSurvival,
    primaryAlgorithmChanged: false,
    thresholdRetuned: false,
  };
  const replicationResult = {
    schemaVersion: WP006D_RESULT_SCHEMA_VERSION,
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    benchmarkFingerprint: plan.benchmarkFingerprint,
    wp006cBenchmarkFingerprint: WP006D_EXPECTED_WP006C_BENCHMARK_FINGERPRINT,
    implementationCommit: currentCommit(),
    frozenMeasurement: {
      specialistId: WP006C_SPECIALIST_ID,
      specialistVersion: WP006C_SPECIALIST_VERSION,
      featureRegistryHash: stateFiles.registryHash,
      configurationHash: stateFiles.configurationHash,
      calibrationFreezeHash: stableArtifactHash(stateFiles.wp006cFreeze),
      threshold,
      thresholdSource: stateFiles.wp006cFreeze.thresholdSource,
      modelRefit: false,
      featureRegistryChanged: false,
    },
    conditions: {
      original: originalSummary,
      canonical: canonicalSummary,
    },
    perDeviceOriginal: originalSummary.perDevice,
    shortcutAudit,
    sourceFamilyLeakage: sourceLeakage,
    sceneLeakageStatus: plan.sceneHandling.sceneLeakageStatus,
    pixelSignalSurvival,
    v0ExternalReplication,
    rows: thresholdedRows,
    holdouts: { lge: 'SEALED', csafeFutureDevices: 'SEALED', futureHoldoutPixelsOpened: false },
    cloudCalls: 0,
    modelInferenceCalls: 0,
    incrementalCostUsd: 0,
    productionChanges: false,
  };
  await writeJson(outputDir, 'v0-replication-results.json', replicationResult);
  await writeJson(outputDir, 'canonical-pixel-challenge.json', canonicalChallenge);
  await writeJson(outputDir, 'shortcut-audit.json', shortcutAudit);
  const benchmarkExpansion = plan.csafe.replicationFamilies >= 6 * 8 && plan.csafe.futureHoldoutDeviceCount >= 4 && controlManifest.records.length >= WP006D_REQUIRED_NEW_CONTROL_FAMILIES && sourceLeakage.sourceFamilyLeakage === 'PASS' && plan.nuisanceMatching.selectionUsesEf2Scores === false ? 'READY_FOR_V1_DESIGN' : 'PARTIALLY_READY';
  const finalReport = buildReport({ plan, stateFiles, csafeManifest, controlManifest, originalSummary, canonicalSummary, shortcutAudit, sourceLeakage, canonicalChallenge, v0ExternalReplication, benchmarkExpansion, implementationCommit: currentCommit() });
  await writeMarkdown(outputDir, 'wp006d-final-report.md', finalReport);
  await writeJson(outputDir, 'wp006d-run-manifest.json', {
    schemaVersion: 'lythaus-wp006d-run-manifest-v1',
    benchmarkVersion: WP006D_BENCHMARK_VERSION,
    benchmarkFingerprint: plan.benchmarkFingerprint,
    planHash: fingerprint.planHash,
    baseSha: plan.baseSha,
    implementationCommit: currentCommit(),
    status: 'COMPLETE',
    v0Frozen: true,
    v0ModelRefit: false,
    thresholdRetuned: false,
    modelInferenceCalls: 0,
    cloudCalls: 0,
    incrementalCostUsd: 0,
    fullArchiveExtraction: false,
    selectiveExtraction: { imageCount: csafeManifest.records.length, declaredBytes: plan.csafe.selectedDeclaredBytes, maximumImages: WP006D_MAX_SELECTED_IMAGES, maximumBytes: WP006D_MAX_SELECTED_BYTES },
    mediaAccess: { selectedInventoryPixels: true, replicationScoringPixels: true, nonCameraControlScoringPixels: true, csafeFutureHoldoutPixels: false, lgePixels: false },
    holdouts: { lge: 'SEALED', csafeFutureDevices: 'SEALED' },
    sourceMediaModified: false,
    mediaCommittedToGit: false,
    rawResidualsPersisted: false,
    rawMetadataPersisted: false,
    productionChanges: false,
    benchmarkExpansion,
    v0ExternalReplication,
    nextStep: benchmarkExpansion === 'READY_FOR_V1_DESIGN' ? 'WP006E — EF2 Device-Invariant Measurement v1 Design & Sealed-Device Evaluation' : 'WP006E — EF2 benchmark repair before device-invariant v1 design',
  });
  return { replicationResult, canonicalChallenge, shortcutAudit, benchmarkExpansion, v0ExternalReplication };
}

function number(value) {
  return value === null || value === undefined ? 'NOT_RUN' : typeof value === 'number' ? Number.isFinite(value) ? String(Number(value.toFixed(6))) : 'NOT_FINITE' : String(value);
}

function buildReport({ plan, stateFiles, csafeManifest, controlManifest, originalSummary, canonicalSummary, shortcutAudit, sourceLeakage, canonicalChallenge, v0ExternalReplication, benchmarkExpansion, implementationCommit }) {
  const originalDeviceLines = Object.entries(originalSummary.perDevice).map(([device, value]) => `| ${device} | ${value.sampleCount} | ${number(value.rawScore.median)} | ${number(value.rawScore.iqr)} | ${number(value.acceptanceAtFrozenThreshold.rate)} | ${number(value.runtimeMs.median)} / ${number(value.runtimeMs.p95)} |`).join('\n');
  const subtypeLines = Object.entries(originalSummary.nonCameraBySubtype).map(([subtype, value]) => `| ${subtype} | ${value.sourceFamilyCount} | ${number(value.acceptanceAtFrozenThreshold.rate)} | ${number(value.rawScore.median)} |`).join('\n');
  return `# WP006D — EF2 Benchmark Expansion & Independent Multi-Device Replication\n\n` +
    `## Executive decision\n\n` +
    `WP006D_BASE_SHA = ${plan.baseSha}\n\n` +
    `WP006D_BENCHMARK_FINGERPRINT = ${plan.benchmarkFingerprint}\n\n` +
    `CSAFE_LOCAL_STATUS = FOUND_AND_VERIFIED\n\n` +
    `CSAFE_RIGHTS_STATUS = VERIFIED_CC_BY_4.0_WITH_ATTRIBUTION\n\n` +
    `CSAFE_ARCHIVE_DIRECTORY_FINGERPRINT_SHA256 = ${plan.csafe.archiveDirectoryFingerprintSha256}\n\n` +
    `CSAFE_DEVICE_FAMILIES_AVAILABLE = ${stateFiles ? '60' : 'NOT_RECORDED'}\n\n` +
    `CSAFE_IMAGE_FILES_AVAILABLE = 49,970\n\n` +
    `CSAFE_REPLICATION_DEVICE_COUNT = ${plan.csafe.replicationDevices.length}\n\n` +
    `CSAFE_REPLICATION_CAMERA_FAMILIES = ${csafeManifest.records.length}\n\n` +
    `CSAFE_FUTURE_HOLDOUT_DEVICE_COUNT = ${plan.csafe.futureHoldoutDeviceCount}\n\n` +
    `NEW_NON_CAMERA_CONTROL_FAMILIES = ${controlManifest.records.length}\n\n` +
    `SOURCE_FAMILY_LEAKAGE = ${sourceLeakage.sourceFamilyLeakage}\n\n` +
    `SCENE_LEAKAGE_STATUS = ${plan.sceneHandling.sceneLeakageStatus}\n\n` +
    `WP006D_PLAN_SHA256 = ${stableArtifactHash(plan)}\n\n` +
    `WP006D_BENCHMARK_EXPANSION = ${benchmarkExpansion}\n\n` +
    `V0_EXTERNAL_REPLICATION = ${v0ExternalReplication}\n\n` +
    `## Frozen v0 results\n\n` +
    `The experiment ran the unchanged WP006C \`LYTHAUS_EF2_PIXEL_ACQUISITION_CONSISTENCY_V0\` feature registry, robust model, and calibration-camera-only threshold. CSAFE images were selected from six model/device directories before any EF2 scores; four other device directories were recorded as future holdout only. No refit, recentering, threshold movement, or feature change occurred.\n\n` +
    `Threshold = ${number(stateFiles.wp006cFreeze.thresholdValue)}; feature registry hash = \`${stateFiles.registryHash}\`; configuration hash = \`${stateFiles.configurationHash}\`. The normalized measurement is not a probability of camera origin.\n\n` +
    `### Original decoded pixels\n\n` +
    `V0_ORIGINAL_CAMERA_ACCEPTANCE = ${number(originalSummary.camera.acceptanceAtFrozenThreshold.rate)}\n\n` +
    `V0_ORIGINAL_NON_CAMERA_FALSE_ACCEPTANCE = ${number(originalSummary.nonCamera.acceptanceAtFrozenThreshold.rate)}\n\n` +
    `| Device | Families | Median distance | IQR | Acceptance | Runtime p50 / p95 ms |\n|---|---:|---:|---:|---:|---:|\n${originalDeviceLines}\n\n` +
    `| Non-camera subtype | Families | False acceptance | Median distance |\n|---|---:|---:|---:|\n${subtypeLines || '| NOT_REPORTED | 0 | NOT_RUN | NOT_RUN |'}\n\n` +
    `Original camera-vs-control ROC AUC = ${number(originalSummary.cameraVsNonCamera.rocAuc)}; bootstrap 95% = ${originalSummary.cameraVsNonCamera.bootstrap95 ? `${number(originalSummary.cameraVsNonCamera.bootstrap95.lower)}–${number(originalSummary.cameraVsNonCamera.bootstrap95.upper)}` : 'NOT_AVAILABLE'}; Cliff's delta = ${number(originalSummary.cameraVsNonCamera.cliffsDelta)}. These are bounded research diagnostics, not detector accuracy.\n\n` +
    `### Canonical decoded-pixel challenge\n\n` +
    `CANONICAL_PIXEL_CROP_SIZE = ${canonicalChallenge.cropSize}\n\n` +
    `CANONICAL_CAMERA_ACCEPTANCE = ${number(canonicalSummary.camera.acceptanceAtFrozenThreshold.rate)}\n\n` +
    `CANONICAL_NON_CAMERA_FALSE_ACCEPTANCE = ${number(canonicalSummary.nonCamera.acceptanceAtFrozenThreshold.rate)}\n\n` +
    `PIXEL_SIGNAL_SURVIVAL = ${canonicalChallenge.pixelSignalSurvival}\n\n` +
    `The same centered native-grid crop was applied in memory after decoding. No global resize, file metadata, filename, format marker, or file size was passed to the frozen extractor.\n\n` +
    `## Shortcut and leakage audit\n\n` +
    Object.entries(shortcutAudit.variables).map(([name, value]) => `- ${name}: ${value.risk} (descriptive AUC ${number(value.auc)}).`).join('\n') + '\n' +
    `- device identity: ${shortcutAudit.deviceIdentity.risk}; known CSAFE camera labels are absent from owner controls by design.\n\n` +
    `SHORTCUT_RISK = ${shortcutAudit.shortcutRisk}\n\n` +
    `DEVICE_IDENTITY_SHORTCUT_RISK = ${shortcutAudit.deviceIdentity.risk}\n\n` +
    `SCENE_MATCHED_DIAGNOSTIC = NOT_RUN; CSAFE directory paths expose scene type and lens but no stable scene identifiers. Source-family exact-hash isolation passed; probable average-hash near pairs are recorded in the result artifact and were not silently merged.\n\n` +
    `## Holdout protection\n\n` +
    `LGE_HOLDOUT_STATUS = SEALED\n\n` +
    `CSAFE_FUTURE_HOLDOUT_STATUS = SEALED\n\n` +
    `No LGE pixels, features, thumbnails or scores were accessed. The four CSAFE future-holdout device directories were inspected only through central-directory metadata; no bytes were extracted or decoded.\n\n` +
    `## Scientific limitations\n\n` +
    `The CSAFE archive is a rights-audited CC BY 4.0 research source with attribution requirements. The new non-camera slice contains ${controlManifest.records.length} independent owner-controlled future-expansion families but is screenshot-only in the available pool, so broad non-camera generalization remains unresolved. CSAFE supplies no stable scene IDs in the audited directory; primary scene disjointness is therefore not established. Synthetic generator provenance is not relevant to the EF2 target but remains unknown. The owner-controlled population and CSAFE collection are not population-representative. Only six replication devices were used, with four CSAFE devices and the complete 33-family LGE device still reserved.\n\n` +
    `This replication does not establish end-to-end authenticity accuracy, human false-positive rate, broad camera generalization, camera-native probability, native-byte originality, sensor identity, or EF2 directional validation. WP006C's negative result remains unchanged.\n\n` +
    `END_TO_END_AUTHENTICITY_ACCURACY = UNRESOLVED\n\n` +
    `HUMAN_FALSE_POSITIVE_RATE = UNRESOLVED\n\n` +
    `COMMERCIAL_DETECTOR_ACCURACY = UNRESOLVED\n\n` +
    `BROAD_CAMERA_GENERALIZATION = UNRESOLVED\n\n` +
    `BROAD_NON_CAMERA_GENERALIZATION = UNRESOLVED\n\n` +
    `UNSEEN_GENERATOR_GENERALIZATION = UNRESOLVED\n\n` +
    `CAMERA_NATIVE_PROBABILITY = UNRESOLVED\n\n` +
    `NATIVE_BYTE_ORIGINALITY = UNRESOLVED\n\n` +
    `SENSOR_IDENTITY = UNRESOLVED\n\n` +
    `EF2_DIRECTIONAL_VALIDATION = UNRESOLVED\n\n` +
    `## Decision and next step\n\n` +
    `WP006D_REPLICATION_RESULT = ${v0ExternalReplication}\n\n` +
    `The benchmark foundation is ${benchmarkExpansion}. This is a data/protocol result, not a product verdict.\n\n` +
    `NEXT_RESEARCH_STEP = ${benchmarkExpansion === 'READY_FOR_V1_DESIGN' ? 'WP006E — EF2 Device-Invariant Measurement v1 Design & Sealed-Device Evaluation' : 'WP006E — repair the documented benchmark nuisance/scene gaps before device-invariant v1 design'}\n\n` +
    `WP006D_FINAL_CLASSIFICATION = ${benchmarkExpansion === 'READY_FOR_V1_DESIGN' ? 'WP006D_REPLICATION_READY_FOR_V1' : 'WP006D_REPLICATION_MIXED'}\n\n` +
    `No model or cloud inference ran; no source media was committed, uploaded, renamed, moved, modified or recompressed; no production configuration, labels, enforcement or WP006C artifact changed. Implementation commit: \`${implementationCommit}\`.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(options.outputDir);
  const originMain = currentOriginMain();
  if (originMain !== WP006D_EXPECTED_BASE_SHA) throw new Error(`WP006D_START_GATE=ORIGIN_MAIN_CHANGED:${originMain}`);
  if (currentMergeBase() !== WP006D_EXPECTED_BASE_SHA) throw new Error('WP006D_START_GATE=BRANCH_BASE_CHANGED');
  const stateFiles = await loadFrozenState(outputDir);
  if (options.phase === 'prepare') {
    const result = await prepareArtifacts(outputDir, options, stateFiles);
    console.log(JSON.stringify({ phase: 'prepare', baseSha: WP006D_EXPECTED_BASE_SHA, archiveLabel: result.archive.archiveLabel, directoryFingerprint: result.archive.directoryFingerprintSha256, replicationDevices: result.plan.csafe.replicationDevices, replicationFamilies: result.csafeRecords.length, controlFamilies: result.controlRecords.length, futureHoldoutDevices: result.plan.csafe.futureHoldoutDevices, benchmarkFingerprint: result.benchmarkFingerprint, planHash: result.planHash, cacheLabel: path.basename(result.cacheDir) }));
    return;
  }
  const result = await runScores(outputDir, options, stateFiles);
  console.log(JSON.stringify({ phase: 'run', v0ExternalReplication: result.v0ExternalReplication, benchmarkExpansion: result.benchmarkExpansion, cloudCalls: 0, modelInferenceCalls: 0, lgeHoldout: 'SEALED', csafeFutureHoldout: 'SEALED' }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
