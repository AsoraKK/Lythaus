import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const MAX_PERSISTENT_BYTES = 500 * 1024 * 1024;
const OPERATIONS = new Set([
  'COPY_MOVE',
  'LOCAL_BLUR',
  'LOCAL_RESIZE',
  'SPLICE',
  'REGION_REPLACEMENT',
  'OBJECT_PASTE',
  'LOCAL_RESAMPLING',
  'COMPOSITE_INSERTION',
]);

function parseArgs(argv) {
  const options = {
    inventory: null,
    plan: 'research/wp006b/partial-edit-plan.json',
    seedRoot: null,
    outputRoot: null,
    allowExistingOutput: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--inventory') options.inventory = argv[++index];
    else if (argument === '--plan') options.plan = argv[++index];
    else if (argument === '--seed-root') options.seedRoot = argv[++index];
    else if (argument === '--output-root') options.outputRoot = argv[++index];
    else if (argument === '--allow-existing-output') options.allowExistingOutput = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!options.inventory || !options.seedRoot || !options.outputRoot) throw new Error('inventory_seed_root_output_root_required');
  return options;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function categoryFor(folder) {
  return {
    camera: 'CAMERA_ORIGINAL_CANDIDATE',
    synthetic: 'SYNTHETIC_CANDIDATE',
    'hard-negative': 'HARD_NEGATIVE_CANDIDATE',
    'mixed-origin': 'MIXED_ORIGIN_CANDIDATE',
  }[String(folder).toLowerCase()] ?? 'MIXED_ORIGIN_CANDIDATE';
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
  return `${String(category).replaceAll('_CANDIDATE', '').replaceAll('-', '_')}_${entry.contentSha256.slice(0, 16)}`;
}

function buildSafeIdIndex(entries) {
  const used = new Map();
  const index = new Map();
  for (const entry of [...entries]
    .filter((candidate) => candidate.mediaType === 'image' || !candidate.mediaType)
    .sort((left, right) => String(left.relativePath).localeCompare(String(right.relativePath)))) {
    const category = categoryFor(entry.candidateFolderCategory);
    const base = safeIdBase(entry, category);
    const occurrence = (used.get(base) ?? 0) + 1;
    used.set(base, occurrence);
    const sampleId = occurrence === 1 ? base : `${base}__COPY_${occurrence}`;
    index.set(sampleId, { entry, category, extension: extensionFor(entry) });
  }
  return index;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function resolveSeedFile(seedRoot, relativePath) {
  const root = path.resolve(seedRoot);
  const rootPrefix = `${root}${path.sep}`;
  const normalizedRelative = String(relativePath).replaceAll('/', path.sep).replaceAll('\\', path.sep);
  const resolved = path.resolve(root, normalizedRelative);
  if (!resolved.startsWith(rootPrefix)) throw new Error('seed_path_escape');
  return resolved;
}

function boundedRegion(width, height) {
  const regionWidth = Math.min(width, Math.max(8, Math.floor(width * 0.2)));
  const regionHeight = Math.min(height, Math.max(8, Math.floor(height * 0.2)));
  return {
    x: Math.min(Math.max(0, Math.floor(width * 0.16)), width - regionWidth),
    y: Math.min(Math.max(0, Math.floor(height * 0.18)), height - regionHeight),
    width: regionWidth,
    height: regionHeight,
  };
}

function destinationRegion(width, height, source) {
  let x = Math.min(width - source.width, Math.floor(width * 0.62));
  let y = Math.min(height - source.height, Math.floor(height * 0.56));
  if (x <= source.x + source.width && x + source.width <= width) x = Math.min(width - source.width, source.x + source.width + 2);
  if (y <= source.y + source.height && y + source.height <= height) y = Math.min(height - source.height, source.y + source.height + 2);
  return { x, y, width: source.width, height: source.height };
}

function extractRegion(region) {
  return { left: region.x, top: region.y, width: region.width, height: region.height };
}

async function solidOverlay(region, index) {
  const colors = [
    { r: 212, g: 48, b: 48, alpha: 0.72 },
    { r: 34, g: 118, b: 206, alpha: 0.68 },
    { r: 228, g: 154, b: 34, alpha: 0.7 },
  ];
  return sharp({
    create: {
      width: region.width,
      height: region.height,
      channels: 4,
      background: colors[index % colors.length],
    },
  }).png().toBuffer();
}

async function editedBuffer(inputPath, operation, sourceRegion, destination, index) {
  const base = sharp(inputPath, { failOn: 'error' });
  if (operation === 'LOCAL_BLUR') {
    const overlay = await sharp(inputPath).extract(extractRegion(sourceRegion)).blur(7).toBuffer();
    return base.composite([{ input: overlay, left: sourceRegion.x, top: sourceRegion.y }]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  }
  if (operation === 'LOCAL_RESIZE') {
    const reduced = await sharp(inputPath).extract(extractRegion(sourceRegion))
      .resize({ width: Math.max(1, Math.floor(sourceRegion.width * 0.55)), height: Math.max(1, Math.floor(sourceRegion.height * 0.55)), fit: 'fill', kernel: 'nearest' })
      .resize({ width: sourceRegion.width, height: sourceRegion.height, fit: 'fill', kernel: 'nearest' }).toBuffer();
    return base.composite([{ input: reduced, left: sourceRegion.x, top: sourceRegion.y }]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  }
  if (operation === 'LOCAL_RESAMPLING') {
    const resampled = await sharp(inputPath).extract(extractRegion(sourceRegion))
      .resize({ width: Math.max(1, Math.floor(sourceRegion.width * 0.5)), height: Math.max(1, Math.floor(sourceRegion.height * 0.5)), fit: 'fill', kernel: 'cubic' })
      .resize({ width: sourceRegion.width, height: sourceRegion.height, fit: 'fill', kernel: 'lanczos3' }).toBuffer();
    return base.composite([{ input: resampled, left: sourceRegion.x, top: sourceRegion.y }]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  }
  const copyOperation = operation === 'COPY_MOVE' || operation === 'OBJECT_PASTE';
  const overlay = copyOperation ? await sharp(inputPath).extract(extractRegion(sourceRegion)).toBuffer() : await solidOverlay(sourceRegion, index);
  const target = copyOperation ? destination : sourceRegion;
  return base.composite([{ input: overlay, left: target.x, top: target.y }]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}

function maskRecord(record, sourceRegion, destination, operation) {
  const affected = operation === 'COPY_MOVE' || operation === 'OBJECT_PASTE' ? destination : sourceRegion;
  return {
    schemaVersion: 'lythaus-wp006b-mask-v1',
    editedSampleId: record.editedSampleId,
    parentSampleId: record.parentSampleId,
    sourceFamilyId: record.sourceFamilyId,
    operation,
    semantics: 'Binary region changed by a deterministic conventional operation; region is the affected output rectangle.',
    region: affected,
    parameters: {
      sourceRegion,
      destinationRegion: affected,
      interpolation: operation === 'LOCAL_RESIZE' ? 'nearest' : operation === 'LOCAL_RESAMPLING' ? 'cubic_then_lanczos3' : null,
      blurSigma: operation === 'LOCAL_BLUR' ? 7 : null,
    },
  };
}

const options = parseArgs(process.argv.slice(2));
const inventory = JSON.parse(await readFile(path.resolve(options.inventory), 'utf8'));
const plan = JSON.parse(await readFile(path.resolve(options.plan), 'utf8'));
if (inventory.originalFilesModified !== false || inventory.rawMediaPersisted !== false) throw new Error('inventory_safety_flags_invalid');
if (plan.originalFilesModified !== false || plan.mediaCommittedToGit !== false || plan.specialistInferenceRun !== false) throw new Error('partial_edit_plan_safety_flags_invalid');
if (!Array.isArray(plan.records) || plan.records.length !== 8) throw new Error('partial_edit_plan_requires_eight_records');
if (await pathExists(path.join(options.outputRoot, 'partial-edits.json')) && !options.allowExistingOutput) throw new Error('partial_edit_output_root_exists');

const sourceIndex = buildSafeIdIndex(inventory.entries ?? []);
const outputRoot = path.resolve(options.outputRoot);
const mediaRoot = path.join(outputRoot, 'media');
const masksRoot = path.join(outputRoot, 'masks');
await mkdir(mediaRoot, { recursive: true });
await mkdir(masksRoot, { recursive: true });

const records = [];
let mediaBytes = 0;
for (let index = 0; index < plan.records.length; index += 1) {
  const record = plan.records[index];
  if (!OPERATIONS.has(record.operation)) throw new Error(`partial_edit_operation_invalid:${record.operation}`);
  const source = sourceIndex.get(record.parentSampleId);
  if (!source) throw new Error(`partial_edit_parent_not_found:${record.parentSampleId}`);
  if (source.entry.mimeSignatureStatus !== 'MATCH') throw new Error(`partial_edit_parent_mime_invalid:${record.parentSampleId}`);
  if (record.parentContentSha256 !== source.entry.contentSha256) throw new Error(`partial_edit_parent_hash_mismatch:${record.parentSampleId}`);
  const inputPath = resolveSeedFile(options.seedRoot, source.entry.relativePath);
  const metadata = await sharp(inputPath, { failOn: 'error' }).metadata();
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8) throw new Error(`partial_edit_parent_dimensions_invalid:${record.parentSampleId}`);
  const sourceRegion = boundedRegion(width, height);
  const destination = destinationRegion(width, height, sourceRegion);
  const edited = await editedBuffer(inputPath, record.operation, sourceRegion, destination, index);
  const editedMetadata = await sharp(edited, { failOn: 'error' }).metadata();
  if (editedMetadata.format !== 'jpeg' || editedMetadata.width !== width || editedMetadata.height !== height) throw new Error(`partial_edit_output_invalid:${record.editedSampleId}`);
  const mask = maskRecord(record, sourceRegion, destination, record.operation);
  const maskBytes = Buffer.from(`${JSON.stringify(mask, null, 2)}\n`, 'utf8');
  const contentSha256 = sha256Hex(edited);
  const maskSha256 = sha256Hex(maskBytes);
  mediaBytes += edited.byteLength;
  if (mediaBytes > MAX_PERSISTENT_BYTES) throw new Error('partial_edit_persistent_media_cap_exceeded');
  const mediaName = `${record.editedSampleId}.jpg`;
  const maskName = `${record.editedSampleId}.json`;
  await writeFile(path.join(mediaRoot, mediaName), edited);
  await writeFile(path.join(masksRoot, maskName), maskBytes);
  records.push({
    schemaVersion: 'lythaus-wp006b-partial-edit-record-v1',
    parentSampleId: record.parentSampleId,
    parentContentSha256: record.parentContentSha256,
    sourceFamilyId: record.sourceFamilyId,
    operation: record.operation,
    parameters: mask.parameters,
    region: mask.region,
    editedSampleId: record.editedSampleId,
    logicalFileReference: `external-owner-derived/wp006b/partial-edits-v1/media/${mediaName}`,
    contentSha256,
    byteSize: edited.byteLength,
    width,
    height,
    mime: 'image/jpeg',
    perceptualHash: null,
    perceptualHashAlgorithm: null,
    safeMetadata: {
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
    mask: {
      maskReference: `external-owner-derived/wp006b/partial-edits-v1/masks/${maskName}`,
      maskSha256,
      region: mask.region,
      operation: record.operation,
      parameters: mask.parameters,
    },
  });
}

const materialization = {
  schemaVersion: 'lythaus-wp006b-partial-edit-materialization-v1',
  sourceDatasetId: 'lythaus-owner-controlled-partial-edit-wp006b-v1',
  researchDate: new Date().toISOString().slice(0, 10),
  sourceRootLabel: 'external-owner-seed/wp004a-observer-v0/originals',
  outputRootLabel: 'external-owner-derived/wp006b/partial-edits-v1',
  originalFilesModified: false,
  mediaCommittedToGit: false,
  specialistInferenceRun: false,
  rawMetadataPersisted: false,
  rawMediaPersisted: false,
  mediaBytes,
  records,
};
await writeFile(path.join(outputRoot, 'partial-edits.json'), `${JSON.stringify(materialization, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schemaVersion: materialization.schemaVersion, records: records.length, mediaBytes, outputRootLabel: materialization.outputRootLabel }));
