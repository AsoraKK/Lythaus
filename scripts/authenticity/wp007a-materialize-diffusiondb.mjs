import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES,
  assertArchiveBudget,
  assertSafeArchiveMember,
  sha256Hex,
  stableStringifyWp007a,
} from '../../packages/authenticity/src/wp007a.ts';

export const DIFFUSIONDB_BASE_URL = 'https://huggingface.co/datasets/poloclub/diffusiondb/resolve/main/images';
export const DIFFUSIONDB_SHARDS = Object.freeze([1, 2]);
export const DIFFUSIONDB_DOWNLOAD_CAP_BYTES = Math.floor(WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES);
export const DIFFUSIONDB_SELECTED_BYTES_CAP = 1 * 1024 * 1024 * 1024;
export const DIFFUSIONDB_IMAGE_LIMIT = 600;
export const DIFFUSIONDB_TARGET = 500;
export const ZIP_MAX_COMPRESSION_RATIO = 1000;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const CATEGORY_ORDER = Object.freeze([
  'PORTRAIT_OR_PEOPLE',
  'INDOOR_SCENE',
  'OUTDOOR_SCENE',
  'ANIMAL',
  'FOOD',
  'VEHICLE',
  'ARCHITECTURE',
  'LANDSCAPE',
  'OBJECT_OR_STILL_LIFE',
  'HIGH_FREQUENCY_TEXTURE',
  'TEXT_OR_SIGNAGE',
  'ILLUSTRATION_OR_ART',
  'OTHER',
]);
const CATEGORY_RULES = Object.freeze([
  ['TEXT_OR_SIGNAGE', /\b(text|sign|signage|lettering|typography|typeface|word|label|poster|book cover|newspaper)\b/iu],
  ['HIGH_FREQUENCY_TEXTURE', /\b(intricate|detailed|ornate|filigree|lace|woven|texture|pattern|embroidery|mechanical detail)\b/iu],
  ['ARCHITECTURE', /\b(building|architecture|architectural|house|castle|bridge|cathedral|interior design|room|corridor|kitchen|bedroom)\b/iu],
  ['PORTRAIT_OR_PEOPLE', /\b(person|people|portrait|woman|man|child|face|family|crowd|actor|character)\b/iu],
  ['ANIMAL', /\b(animal|dog|cat|horse|bird|elephant|lion|tiger|fox|wolf|fish|bear|rabbit)\b/iu],
  ['FOOD', /\b(food|dish|meal|cake|bread|fruit|vegetable|coffee|restaurant|cuisine)\b/iu],
  ['VEHICLE', /\b(car|vehicle|train|bus|bicycle|motorcycle|airplane|ship|boat|truck)\b/iu],
  ['LANDSCAPE', /\b(landscape|mountain|valley|lake|river|forest|field|desert|ocean|beach|waterfall)\b/iu],
  ['OUTDOOR_SCENE', /\b(outdoor|street|road|park|garden|city|urban|village|sky|sunset|sunrise)\b/iu],
  ['INDOOR_SCENE', /\b(indoor|inside|studio|gallery|office|living room|interior)\b/iu],
  ['ILLUSTRATION_OR_ART', /\b(illustration|digital art|concept art|painting|watercolor|oil painting|drawing|cartoon|anime|comic|fantasy art|sculpture|render|cgi|3d)\b/iu],
  ['OBJECT_OR_STILL_LIFE', /\b(object|still life|product|bottle|mug|chair|table|lamp|watch|jewelry|camera|tool)\b/iu],
]);
const EXCLUDED_PROMPT = /\b(porn|nsfw|nude|naked|explicit sexual|graphic violence|gore)\b/iu;
const require = createRequire(import.meta.url);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function compressionRatio(uncompressed, compressed) {
  if (compressed === 0) return uncompressed === 0 ? 1 : Number.POSITIVE_INFINITY;
  return uncompressed / compressed;
}

function assertZipMember(name) {
  assertSafeArchiveMember(name);
  if (name.includes('\0')) throw new Error('wp007a_archive_member_nul');
}

async function readAt(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const result = await handle.read(buffer, 0, length, position);
  if (result.bytesRead !== length) throw new Error('wp007a_zip_truncated');
  return buffer;
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('wp007a_zip_eocd_missing');
}

export async function readZipDirectory(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const fileStats = await handle.stat();
    const tailLength = Math.min(fileStats.size, 22 + 0xffff);
    const tail = await readAt(handle, tailLength, fileStats.size - tailLength);
    const eocdOffset = findEndOfCentralDirectory(tail);
    const diskNumber = tail.readUInt16LE(eocdOffset + 4);
    const centralDisk = tail.readUInt16LE(eocdOffset + 6);
    const entryCountDisk = tail.readUInt16LE(eocdOffset + 8);
    const entryCount = tail.readUInt16LE(eocdOffset + 10);
    const centralSize = tail.readUInt32LE(eocdOffset + 12);
    const centralOffset = tail.readUInt32LE(eocdOffset + 16);
    if (diskNumber !== 0 || centralDisk !== 0 || entryCountDisk !== entryCount) throw new Error('wp007a_zip_multidisk_unsupported');
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('wp007a_zip64_unsupported');
    if (centralSize > 256 * 1024 * 1024 || centralOffset + centralSize > fileStats.size) throw new Error('wp007a_zip_central_directory_invalid');
    const central = await readAt(handle, centralSize, centralOffset);
    const entries = [];
    let offset = 0;
    while (offset < central.length) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error('wp007a_zip_central_entry_invalid');
      const flags = central.readUInt16LE(offset + 8);
      const method = central.readUInt16LE(offset + 10);
      const crc = central.readUInt32LE(offset + 16);
      const compressedSize = central.readUInt32LE(offset + 20);
      const uncompressedSize = central.readUInt32LE(offset + 24);
      const nameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      const localOffset = central.readUInt32LE(offset + 42);
      const end = offset + 46 + nameLength + extraLength + commentLength;
      if (end > central.length) throw new Error('wp007a_zip_central_entry_truncated');
      const name = central.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      assertZipMember(name);
      if (flags & 0x1) throw new Error(`wp007a_zip_encrypted_member:${name}`);
      if (![0, 8].includes(method)) throw new Error(`wp007a_zip_method_unsupported:${method}`);
      if (compressionRatio(uncompressedSize, compressedSize) > ZIP_MAX_COMPRESSION_RATIO) throw new Error(`wp007a_zip_ratio_exceeded:${name}`);
      entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset });
      offset = end;
    }
    if (entries.length !== entryCount) throw new Error('wp007a_zip_entry_count_mismatch');
    return { fileBytes: fileStats.size, entryCount, entries };
  } finally {
    await handle.close();
  }
}

async function readZipEntry(filePath, directoryEntry) {
  const handle = await open(filePath, 'r');
  try {
    const local = await readAt(handle, 30, directoryEntry.localOffset);
    if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error(`wp007a_zip_local_header_invalid:${directoryEntry.name}`);
    const nameLength = local.readUInt16LE(26);
    const extraLength = local.readUInt16LE(28);
    const dataStart = directoryEntry.localOffset + 30 + nameLength + extraLength;
    const compressed = await readAt(handle, directoryEntry.compressedSize, dataStart);
    const payload = directoryEntry.method === 0 ? compressed : inflateRawSync(compressed);
    if (payload.length !== directoryEntry.uncompressedSize) throw new Error(`wp007a_zip_size_mismatch:${directoryEntry.name}`);
    if (crc32(payload) !== directoryEntry.crc) throw new Error(`wp007a_zip_crc_mismatch:${directoryEntry.name}`);
    return payload;
  } finally {
    await handle.close();
  }
}

function parsePngDimensions(payload) {
  if (payload.length < 24 || !payload.subarray(0, 8).equals(PNG_SIGNATURE) || payload.readUInt32BE(8) !== 13 || payload.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('wp007a_png_header_invalid');
  }
  return { width: payload.readUInt32BE(16), height: payload.readUInt32BE(20) };
}

async function perceptualHashFromPng(payload) {
  const sharp = require('sharp');
  const { data } = await sharp(payload, { failOn: 'none' }).resize({ width: 32, height: 32, fit: 'fill', kernel: 'nearest' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const cells = [];
  for (let blockY = 0; blockY < 8; blockY += 1) {
    for (let blockX = 0; blockX < 8; blockX += 1) {
      let sum = 0;
      for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) sum += data[(blockY * 4 + y) * 32 + blockX * 4 + x];
      cells.push(sum / 16);
    }
  }
  const sorted = cells.slice().sort((left, right) => left - right);
  const median = (sorted[31] + sorted[32]) / 2;
  return cells.map((value) => value >= median ? '1' : '0').join('');
}

function hammingDistance(left, right) {
  let distance = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) if (left[index] !== right[index]) distance += 1;
  return distance + Math.abs(left.length - right.length);
}

function annotateDuplicateGroups(records) {
  const parent = records.map((_, index) => index);
  const find = (index) => {
    let current = index;
    while (parent[current] !== current) current = parent[current];
    while (parent[index] !== index) { const next = parent[index]; parent[index] = current; index = next; }
    return current;
  };
  const union = (left, right) => { const a = find(left); const b = find(right); if (a !== b) parent[b] = a; };
  const exact = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const prior = exact.get(records[index].contentSha256);
    if (prior !== undefined) union(index, prior); else exact.set(records[index].contentSha256, index);
  }
  let nearPairs = 0;
  for (let left = 0; left < records.length; left += 1) for (let right = left + 1; right < records.length; right += 1) {
    if (records[left].contentSha256 === records[right].contentSha256) continue;
    if (hammingDistance(records[left].perceptualHash, records[right].perceptualHash) <= 4) { nearPairs += 1; union(left, right); }
  }
  const groups = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  }
  let exactGroupCount = 0;
  let nearGroupCount = 0;
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const hasExact = new Set(indexes.map((index) => records[index].contentSha256)).size < indexes.length;
    const groupId = `${hasExact ? 'EXACT' : 'NEAR'}_DUPLICATE_${sha256Hex(indexes.map((index) => records[index].contentSha256).sort().join('\0')).slice(0, 16)}`;
    if (hasExact) exactGroupCount += 1; else nearGroupCount += 1;
    for (const index of indexes) records[index].duplicateGroupId = groupId;
  }
  return { exactDuplicateGroups: exactGroupCount, nearDuplicateGroups: nearGroupCount, nearDuplicatePairCount: nearPairs };
}

function imageEntryFor(entries, imageName) {
  const basename = path.posix.basename(imageName);
  return entries.find((entry) => path.posix.basename(entry.name) === basename && entry.name.toLowerCase().endsWith('.png')) ?? null;
}

function classifyPrompt(prompt) {
  if (CATEGORY_RULES.some(([, pattern]) => pattern.test(prompt))) {
    for (const [category, pattern] of CATEGORY_RULES) if (pattern.test(prompt)) return category;
  }
  return 'OTHER';
}

function promptId(prompt) {
  return `DDB_PROMPT_${sha256Hex(prompt.trim().replace(/\s+/gu, ' ').toLowerCase()).slice(0, 16)}`;
}

async function loadShard(shardPath, shardNumber) {
  const directory = await readZipDirectory(shardPath);
  const imageEntries = directory.entries.filter((entry) => entry.name.toLowerCase().endsWith('.png'));
  const jsonEntries = directory.entries.filter((entry) => entry.name.toLowerCase().endsWith('.json'));
  if (imageEntries.length === 0 || jsonEntries.length === 0) throw new Error(`wp007a_diffusiondb_shard_structure_invalid:${shardNumber}`);
  const metadataEntry = jsonEntries.find((entry) => /part-\d{6}\.json$/iu.test(entry.name)) ?? jsonEntries[0];
  const metadata = JSON.parse((await readZipEntry(shardPath, metadataEntry)).toString('utf8'));
  const candidates = [];
  for (const [imageName, value] of Object.entries(metadata)) {
    if (!value || typeof value !== 'object') continue;
    const imageEntry = imageEntryFor(imageEntries, imageName);
    if (!imageEntry) continue;
    const prompt = typeof value.p === 'string' ? value.p.trim() : '';
    if (!prompt || EXCLUDED_PROMPT.test(prompt)) continue;
    candidates.push({
      shard: shardNumber,
      imageName: path.posix.basename(imageName),
      archiveMember: imageEntry.name,
      prompt,
      promptId: promptId(prompt),
      taxonomy: classifyPrompt(prompt),
      seed: Number.isInteger(value.se) ? value.se : null,
      guidanceScale: typeof value.c === 'number' ? value.c : null,
      steps: Number.isInteger(value.st) ? value.st : null,
      sampler: typeof value.sa === 'string' ? value.sa : null,
      declaredSizeBytes: imageEntry.uncompressedSize,
      compressedSizeBytes: imageEntry.compressedSize,
      crc32: imageEntry.crc,
    });
  }
  candidates.sort((left, right) => `${left.taxonomy}\0${left.promptId}\0${left.imageName}`.localeCompare(`${right.taxonomy}\0${right.promptId}\0${right.imageName}`));
  return { directory, imageEntries, metadataEntry, candidates };
}

export function selectDiffusionDbCandidates(shards, targetCount = DIFFUSIONDB_TARGET) {
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > DIFFUSIONDB_IMAGE_LIMIT) throw new Error('wp007a_diffusiondb_target_invalid');
  const all = shards.flatMap((shard) => shard.candidates);
  const byCategory = new Map(CATEGORY_ORDER.map((category) => [category, []]));
  for (const candidate of all) byCategory.get(candidate.taxonomy)?.push(candidate);
  for (const candidates of byCategory.values()) candidates.sort((left, right) => `${left.shard}\0${left.promptId}\0${left.imageName}`.localeCompare(`${right.shard}\0${right.promptId}\0${right.imageName}`));
  const chosen = [];
  const usedNames = new Set();
  const usedPrompts = new Set();
  let cursor = 0;
  while (chosen.length < targetCount) {
    let progress = false;
    for (const category of CATEGORY_ORDER) {
      const candidates = byCategory.get(category) ?? [];
      const candidate = candidates.find((item) => !usedNames.has(`${item.shard}:${item.imageName}`) && !usedPrompts.has(item.promptId))
        ?? candidates.find((item) => !usedNames.has(`${item.shard}:${item.imageName}`));
      if (!candidate) continue;
      usedNames.add(`${candidate.shard}:${candidate.imageName}`);
      usedPrompts.add(candidate.promptId);
      chosen.push({ ...candidate, selectionOrder: chosen.length + 1 });
      progress = true;
      if (chosen.length >= targetCount) break;
    }
    cursor += 1;
    if (!progress || cursor > targetCount * 3) break;
  }
  if (chosen.length < targetCount) throw new Error(`wp007a_diffusiondb_insufficient_eligible_candidates:${chosen.length}`);
  return chosen;
}

async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true });
}

async function downloadShard(shard, destination) {
  const url = `${DIFFUSIONDB_BASE_URL}/part-${String(shard).padStart(6, '0')}.zip`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`wp007a_diffusiondb_download_failed:${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > DIFFUSIONDB_DOWNLOAD_CAP_BYTES) throw new Error('wp007a_diffusiondb_download_cap_exceeded');
  await ensureDirectory(path.dirname(destination));
  const temporary = `${destination}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  const actual = await stat(temporary);
  if (actual.size > DIFFUSIONDB_DOWNLOAD_CAP_BYTES) throw new Error('wp007a_diffusiondb_download_cap_exceeded');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(temporary)) digest.update(chunk);
  await rename(temporary, destination);
  return { url, bytes: actual.size, sha256: digest.digest('hex'), contentLength: contentLength || null };
}

function sourceFamilyId(candidate, contentSha256 = null) {
  const identity = `${candidate.shard}:${candidate.imageName}:${contentSha256 ?? candidate.crc32}`;
  return `DDB-FAMILY-${sha256Hex(identity).slice(0, 24)}`;
}

export async function materializeDiffusionDb({ cacheDir, shards = DIFFUSIONDB_SHARDS, download = false, targetCount = DIFFUSIONDB_TARGET } = {}) {
  if (!cacheDir || path.isAbsolute(cacheDir) !== true) throw new Error('wp007a_diffusiondb_cache_must_be_absolute');
  const repositoryRoot = path.resolve(process.cwd());
  const relativeToRepository = path.relative(repositoryRoot, path.resolve(cacheDir));
  if (relativeToRepository === '' || (!relativeToRepository.startsWith('..') && !path.isAbsolute(relativeToRepository))) throw new Error('wp007a_diffusiondb_cache_inside_repository');
  await ensureDirectory(cacheDir);
  const shardPaths = [];
  const downloadRecords = [];
  for (const shard of shards) {
    if (!Number.isInteger(shard) || shard < 1 || shard > 2000) throw new Error('wp007a_diffusiondb_shard_invalid');
    const shardPath = path.join(cacheDir, `part-${String(shard).padStart(6, '0')}.zip`);
    const exists = await stat(shardPath).catch(() => null);
    if (!exists && !download) throw new Error(`wp007a_diffusiondb_shard_missing:${shard}`);
    if (!exists) downloadRecords.push({ shard, ...(await downloadShard(shard, shardPath)) });
    shardPaths.push({ shard, path: shardPath });
  }
  const totalArchiveBytes = (await Promise.all(shardPaths.map(async ({ path: shardPath }) => (await stat(shardPath)).size))).reduce((sum, value) => sum + value, 0);
  if (totalArchiveBytes > DIFFUSIONDB_DOWNLOAD_CAP_BYTES) throw new Error('wp007a_diffusiondb_archive_cap_exceeded');
  const loaded = [];
  for (const item of shardPaths) loaded.push({ shard: item.shard, ...(await loadShard(item.path, item.shard)) });
  const selected = selectDiffusionDbCandidates(loaded, targetCount);
  const selectedBytes = selected.reduce((sum, item) => sum + item.declaredSizeBytes, 0);
  assertArchiveBudget({ archiveBytes: totalArchiveBytes, selectedFamilies: selected.length, selectedBytes });
  const selectedDir = path.join(cacheDir, 'selected');
  await ensureDirectory(selectedDir);
  const records = [];
  for (const candidate of selected) {
    const shardPath = shardPaths.find((item) => item.shard === candidate.shard).path;
    const shard = loaded.find((item) => item.shard === candidate.shard);
    const entry = imageEntryFor(shard.imageEntries, candidate.imageName);
    if (!entry) throw new Error(`wp007a_diffusiondb_selected_entry_missing:${candidate.imageName}`);
    const payload = await readZipEntry(shardPath, entry);
      const dimensions = parsePngDimensions(payload);
      const contentSha256 = sha256Hex(payload);
    const perceptualHash = await perceptualHashFromPng(payload);
    const sampleId = `DDB_${String(candidate.selectionOrder).padStart(4, '0')}`;
    const cacheFile = path.join(selectedDir, `${sampleId}.png`);
    const existing = await readFile(cacheFile).catch(() => null);
    if (!existing || sha256Hex(existing) !== contentSha256) await writeFile(cacheFile, payload);
    records.push({
      sampleId,
      sourceFamilyId: sourceFamilyId(candidate, contentSha256),
      archiveShard: `part-${String(candidate.shard).padStart(6, '0')}`,
      archiveMemberId: `part-${String(candidate.shard).padStart(6, '0')}.zip::${candidate.archiveMember}`,
      imageName: candidate.imageName,
      contentSha256,
      declaredSizeBytes: candidate.declaredSizeBytes,
      compressedSizeBytes: candidate.compressedSizeBytes,
      crc32: candidate.crc32,
      width: dimensions.width,
      height: dimensions.height,
      format: 'PNG',
      perceptualHash,
      perceptualHashAlgorithm: 'GRAY_32X32_BLOCK_MEAN_MEDIAN_64BIT_V1',
      duplicateGroupId: null,
      nearDuplicateReviewStatus: 'BOUNDED_PHASH_DIAGNOSTIC',
      taxonomy: candidate.taxonomy,
      promptId: candidate.promptId,
      prompt: candidate.prompt,
      seed: candidate.seed,
      guidanceScale: candidate.guidanceScale,
      steps: candidate.steps,
      sampler: candidate.sampler,
      cacheId: `wp007a-diffusiondb-selected/${sampleId}.png`,
    });
  }
  records.sort((left, right) => left.sampleId.localeCompare(right.sampleId));
  const duplicateSummary = annotateDuplicateGroups(records);
  const result = {
    schemaVersion: 'lythaus-wp007a-diffusiondb-materialization-v1',
    datasetId: 'diffusiondb-2m',
    sourceUrl: 'https://huggingface.co/datasets/poloclub/diffusiondb',
    shards: shardPaths.map(({ shard }) => `part-${String(shard).padStart(6, '0')}`),
    archiveBytes: totalArchiveBytes,
    archiveDownloadBytes: downloadRecords.reduce((sum, item) => sum + item.bytes, 0),
    downloadRecords,
    fullDatasetDownloaded: false,
    fullDatasetExtracted: false,
    selectedFamilyCount: records.length,
    selectedBytes,
    taxonomyCounts: Object.fromEntries(CATEGORY_ORDER.map((category) => [category, records.filter((record) => record.taxonomy === category).length])),
    duplicateSummary,
    records,
    selectionFingerprint: sha256Hex(stableStringifyWp007a(records.map(({ sampleId, sourceFamilyId, contentSha256, taxonomy, promptId }) => ({ sampleId, sourceFamilyId, contentSha256, taxonomy, promptId })))),
  };
  await writeFile(path.join(cacheDir, 'materialization-result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

function defaultCacheDir() {
  return path.join(os.homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets', '90_RESEARCH_ONLY', 'wp007a-diffusiondb-cache');
}

function parseArgs(argv) {
  const options = { cacheDir: defaultCacheDir(), download: false, targetCount: DIFFUSIONDB_TARGET, shards: [...DIFFUSIONDB_SHARDS] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--cache-dir') options.cacheDir = path.resolve(argv[++index]);
    else if (argument === '--download') options.download = true;
    else if (argument === '--target-count') options.targetCount = Number(argv[++index]);
    else if (argument === '--shards') options.shards = String(argv[++index]).split(',').map(Number);
    else if (argument === '--help') options.help = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node --experimental-strip-types wp007a-materialize-diffusiondb.mjs [--download] [--cache-dir ABSOLUTE] [--target-count 500] [--shards 1,2]');
  } else {
    const result = await materializeDiffusionDb(options);
    console.log(JSON.stringify({ status: 'materialized', selectedFamilyCount: result.selectedFamilyCount, selectedBytes: result.selectedBytes, archiveBytes: result.archiveBytes, selectionFingerprint: result.selectionFingerprint, taxonomyCounts: result.taxonomyCounts }));
  }
}
