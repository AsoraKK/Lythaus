import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { computePerceptualHash, inspectMedia } from '../../packages/authenticity/src/forensics.ts';
import { detectMediaMime } from '../../packages/authenticity/src/media-intake.ts';
import { mimeFromResearchFilename } from '../../packages/authenticity/src/research-image.ts';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const DEFAULT_MAX_FILES = 100;

function parseArgs(argv) {
  const result = { dataRoot: process.env.LYTHAUS_WP004A_DATA_ROOT, output: null, runtimeManifest: null, groundTruthManifest: null, maxFiles: DEFAULT_MAX_FILES, recursive: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--data-root') result.dataRoot = argv[++index];
    else if (argument === '--output') result.output = argv[++index];
    else if (argument === '--runtime-manifest') result.runtimeManifest = argv[++index];
    else if (argument === '--ground-truth-manifest') result.groundTruthManifest = argv[++index];
    else if (argument === '--max-files') result.maxFiles = Number(argv[++index]);
    else if (argument === '--no-recursive') result.recursive = false;
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!result.dataRoot) throw new Error('data_root_required:use --data-root or LYTHAUS_WP004A_DATA_ROOT');
  if (!Number.isInteger(result.maxFiles) || result.maxFiles <= 0) throw new Error('max_files_invalid');
  return result;
}

async function collectFiles(root, recursive, maxFiles) {
  const found = [];
  async function visit(directory, depth) {
    if (found.length >= maxFiles) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (found.length >= maxFiles) break;
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(candidate);
      else if (recursive && depth < 4 && entry.isDirectory()) await visit(candidate, depth + 1);
    }
  }
  await visit(root, 0);
  return found;
}

function containsAscii(bytes, pattern) {
  const text = new TextDecoder('latin1').decode(bytes).toLowerCase();
  return text.includes(pattern.toLowerCase());
}

function privacyFlags(bytes) {
  const flags = [];
  if (containsAscii(bytes, 'gps') || containsAscii(bytes, 'latitude') || containsAscii(bytes, 'longitude')) flags.push('LOCATION');
  if (containsAscii(bytes, 'serialnumber') || containsAscii(bytes, 'bodyserialnumber')) flags.push('DEVICE_SERIAL');
  if (containsAscii(bytes, 'cameraownername') || containsAscii(bytes, 'ownername')) flags.push('OWNER_NAME');
  if (containsAscii(bytes, 'artist') || containsAscii(bytes, 'creator')) flags.push('AUTHOR');
  return flags;
}

function safeEncoder(value) {
  if (!value) return null;
  if (/gps|serial|owner|artist|creator|location/i.test(value)) return 'PRESENT_REDACTED';
  return value.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 120) || null;
}

async function decodeStatus(bytes) {
  let sharp;
  try {
    const module = await import('sharp');
    sharp = module.default ?? module;
  } catch {
    return { status: 'UNAVAILABLE', width: null, height: null };
  }
  try {
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    return { status: metadata.width && metadata.height ? 'DECODED' : 'DECODED_NO_DIMENSIONS', width: metadata.width ?? null, height: metadata.height ?? null };
  } catch {
    return { status: 'DECODE_FAILED', width: null, height: null };
  }
}

async function inventoryFile(root, file) {
  const bytes = new Uint8Array(await readFile(file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const relativeResearchPath = path.relative(root, file).split(path.sep).join('/');
  const declaredMime = mimeFromResearchFilename(file);
  const signatureMime = detectMediaMime(bytes);
  const inspection = inspectMedia(bytes, declaredMime);
  const decoded = await decodeStatus(bytes);
  const sampleId = `WP004A-${sha256.slice(0, 16).toUpperCase()}`;
  return {
    sampleId,
    originalFilename: path.basename(file),
    relativeResearchPath,
    sha256,
    byteSize: bytes.byteLength,
    declaredMime,
    signatureMime,
    mimeSignatureStatus: signatureMime === declaredMime ? 'MATCH' : 'MISMATCH_OR_UNKNOWN',
    format: inspection.format || signatureMime || null,
    width: inspection.dimensions?.width ?? decoded.width,
    height: inspection.dimensions?.height ?? decoded.height,
    exifPresent: inspection.metadata.exifPresent,
    xmpPresent: inspection.metadata.xmpPresent,
    encoderInformation: safeEncoder(inspection.encoderInformation),
    readable: inspection.dimensions !== null,
    decodeStatus: decoded.status,
    perceptualHash: computePerceptualHash(bytes),
    duplicateHash: false,
    duplicateOf: null,
    privacySensitiveMetadataFlags: privacyFlags(bytes),
    provenanceAssertion: 'NEEDS_OWNER_CONFIRMATION',
    truthStatus: 'NEEDS_OWNER_CONFIRMATION',
    proposedSourceFamilyId: `WP004A-FAMILY-${sha256.slice(0, 16).toUpperCase()}`,
  };
}

async function writeJson(file, value) {
  const outputPath = path.resolve(file);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return outputPath;
}

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(options.dataRoot);
const files = await collectFiles(root, options.recursive, options.maxFiles);
const entries = [];
for (const file of files) entries.push(await inventoryFile(root, file));
const byHash = new Map();
for (const entry of entries) byHash.set(entry.sha256, [...(byHash.get(entry.sha256) ?? []), entry.sampleId]);
for (const entry of entries) {
  const matches = byHash.get(entry.sha256) ?? [];
  entry.duplicateHash = matches.length > 1;
  entry.duplicateOf = matches.length > 1 ? matches.find((sampleId) => sampleId !== entry.sampleId) ?? null : null;
}
const inventory = {
  schemaVersion: 'lythaus-wp004a-inventory-v1',
  dataRootLabel: 'external-research-root',
  ownerCollectionAssertion: 'LYTHAUS_ORIGINALS_OWNER_ASSERTED',
  generatedAt: new Date().toISOString(),
  originalFilesModified: false,
  entries,
};
const runtimeManifest = {
  schemaVersion: 'lythaus-wp004a-runtime-manifest-v1',
  manifestType: 'RUNTIME',
  entries: entries.map((entry) => ({ sampleId: entry.sampleId, sourceFamilyId: entry.proposedSourceFamilyId, path: entry.relativeResearchPath, rightsClass: 'C', evaluationAllowed: true, provenanceAssertion: entry.provenanceAssertion })),
};
const groundTruthManifest = {
  schemaVersion: 'lythaus-wp004a-ground-truth-manifest-v1',
  manifestType: 'GROUND_TRUTH',
  entries: entries.map((entry) => ({
    sampleId: entry.sampleId,
    truth: {
      physicalCameraAcquisition: null,
      syntheticContent: null,
      screenRecapture: null,
      digitalScreenshot: null,
      localManipulation: null,
      originClass: 'UNKNOWN',
      truthBasis: 'NEEDS_OWNER_CONFIRMATION',
    },
  })),
};
const outputPath = options.output ? await writeJson(options.output, inventory) : null;
const runtimePath = options.runtimeManifest ? await writeJson(options.runtimeManifest, runtimeManifest) : null;
const groundTruthPath = options.groundTruthManifest ? await writeJson(options.groundTruthManifest, groundTruthManifest) : null;
console.log(JSON.stringify({ schemaVersion: inventory.schemaVersion, count: entries.length, readableCount: entries.filter((entry) => entry.readable).length, duplicateHashCount: entries.filter((entry) => entry.duplicateHash).length, outputPath, runtimePath, groundTruthPath }));
