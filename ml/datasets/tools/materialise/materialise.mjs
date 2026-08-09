#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const RIGHTS_CLASSES = new Set([
  'CLASS_A_COMMERCIAL_TRAINING',
  'CLASS_B_EVALUATION_ONLY',
  'CLASS_C_LYTHAUS_OWNED',
]);

const GATES = new Set(['ALLOW', 'DENY', 'CONDITIONAL', 'DO_NOT_TRAIN', 'UNKNOWN']);

const TRANSFORMATIONS = [
  'ORIGINAL',
  'JPEG_QUALITY_95',
  'JPEG_QUALITY_75',
  'RESIZE_75',
  'RESIZE_50',
  'CROP_10',
  'MILD_BLUR',
  'MILD_SHARPEN',
  'METADATA_STRIPPED',
  'SCREENSHOT_STYLE_RESAMPLING',
];

function usage() {
  console.log(`Lythaus dataset materialiser\n\nCommands:\n  validate <record.json>\n  hash <file>\n  provenance <record.json>\n  manifest <directory> <output.jsonl>\n  transform-plan <manifest.jsonl> <output.json>\n  unsplash-lite-sample <photos.tsv> <output.jsonl> <image-directory> [count]\n  transform-images <manifest.jsonl> <image-directory> <output-directory> <output.jsonl>\n\nAll binaries are written to an external, task-scoped cache. Never point this tool at normal Lythaus user uploads.`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function uuidv7() {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Date.parse('2026-08-09T00:00:00.000Z'));
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertGate(value, field) {
  if (!GATES.has(value)) throw new Error(`${field} must be one of ${[...GATES].join(', ')}`);
}

function validateRecord(record) {
  const required = [
    'datasetId', 'sampleId', 'sourceUrl', 'originalFilename', 'retrievedAt',
    'sha256', 'licence', 'rightsClass', 'trainingGate', 'originClass', 'privacyFlags',
    'commercialTrainingAllowed', 'evaluationAllowed', 'distillationAllowed',
    'redistributionAllowed', 'modificationAllowed',
  ];
  for (const field of required) {
    if (!(field in record)) throw new Error(`missing required provenance field: ${field}`);
  }
  if (!RIGHTS_CLASSES.has(record.rightsClass)) throw new Error(`invalid rightsClass: ${record.rightsClass}`);
  for (const field of ['trainingGate', 'commercialTrainingAllowed', 'evaluationAllowed', 'distillationAllowed', 'redistributionAllowed', 'modificationAllowed']) {
    assertGate(record[field], field);
  }
  if (record.rightsClass === 'CLASS_B_EVALUATION_ONLY' && record.distillationAllowed === 'ALLOW') {
    throw new Error('evaluation-only records cannot authorize distillation');
  }
  if (record.commercialTrainingAllowed !== 'ALLOW' && record.distillationAllowed === 'ALLOW') {
    throw new Error('distillation cannot be allowed when commercial training is not allowed');
  }
  if (record.trainingGate === 'ALLOW' && record.licenceEvidenceStatus !== 'VERIFIED') {
    throw new Error('trainingGate ALLOW requires verified licence evidence');
  }
  return record;
}

async function hashFile(path) {
  const hash = createHash('sha256');
  await pipeline(
    createReadStream(path),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    },
    new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
  );
  return hash.digest('hex');
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function manifestForDirectory(directory) {
  const root = resolve(directory);
  const entries = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (!entry.name.endsWith('.json') && !entry.name.endsWith('.jsonl')) {
        const info = await stat(path);
        const bytes = await readFile(path);
        entries.push({
          datasetId: 'UNASSIGNED_REVIEW_REQUIRED',
          sampleId: uuidv7(),
          sourceUrl: null,
          originalFilename: entry.name,
          retrievedAt: new Date().toISOString(),
          sha256: sha256(bytes),
          perceptualHash: null,
          licence: 'UNKNOWN',
          licenceUrl: null,
          licenceEvidenceStatus: 'UNKNOWN',
          rightsClass: 'CLASS_B_EVALUATION_ONLY',
          trainingGate: 'DO_NOT_TRAIN',
          commercialTrainingAllowed: 'DO_NOT_TRAIN',
          evaluationAllowed: 'UNKNOWN',
          distillationAllowed: 'DO_NOT_TRAIN',
          redistributionAllowed: 'DO_NOT_TRAIN',
          modificationAllowed: 'UNKNOWN',
          originClass: 'UNKNOWN',
          generator: null,
          device: null,
          privacyFlags: ['UNREVIEWED_SOURCE'],
          byteLength: info.size,
          relativePath: path.slice(root.length + 1),
        });
      }
    }
  }
  await visit(root);
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function writeJsonl(path, records) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8');
}

function parseTsvLine(line) {
  return line.split('\t');
}

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseTsvLine(lines.shift());
  return lines.map((line) => Object.fromEntries(parseTsvLine(line).map((value, index) => [headers[index], value ?? ''])));
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    throw new Error('sharp_required_for_image_materialisation_run_npm_install_in_ml_datasets_tools_materialise');
  }
}

async function perceptualHash(sharp, bytes) {
  const { data } = await sharp(bytes).greyscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const values = Array.from(data);
  const lowFrequency = [];
  for (let v = 0; v < 8; v += 1) for (let u = 0; u < 8; u += 1) {
    let total = 0;
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      total += (values[y * 32 + x] ?? 0)
        * Math.cos(((2 * x + 1) * u * Math.PI) / 64)
        * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
    }
    if (u !== 0 || v !== 0) lowFrequency.push(total);
  }
  const sorted = [...lowFrequency].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return lowFrequency.map((value) => value >= median ? '1' : '0').join('');
}

function uuidv7FromSeed(seed) {
  const digest = createHash('sha256').update(seed).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  const timestamp = BigInt(Date.parse('2026-08-09T00:00:00.000Z'));
  for (let index = 5; index >= 0; index -= 1) bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function downloadBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`image_download_failed:${response.status}:${url}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 20 * 1024 * 1024) throw new Error(`image_too_large:${length}:${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error(`image_too_large:${bytes.byteLength}:${url}`);
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function unsplashLiteSample(tsvPath, outputPath, imageDirectory, count = 80) {
  const sharp = await loadSharp();
  const rows = parseTsv(await readFile(resolve(tsvPath), 'utf8'))
    .filter((row) => row.photo_image_url && (row.exif_camera_make || row.exif_camera_model))
    .sort((left, right) => left.photo_id.localeCompare(right.photo_id))
    .slice(0, Number(count));
  await mkdir(resolve(imageDirectory), { recursive: true });
  const records = [];
  for (const row of rows) {
    const sourceFamilyId = uuidv7FromSeed(`unsplash-family:${row.photo_id}`);
    const sampleId = uuidv7FromSeed(`unsplash-sample:${row.photo_id}`);
    const retrievalUrl = `${row.photo_image_url}${row.photo_image_url.includes('?') ? '&' : '?'}auto=format&fit=max&w=2048`;
    const bytes = await downloadBytes(retrievalUrl);
    const info = await sharp(bytes).metadata();
    const fileName = `${sampleId}${extname(new URL(row.photo_image_url).pathname) || '.jpg'}`;
    await writeFile(join(resolve(imageDirectory), fileName), bytes);
    records.push({
      datasetId: 'unsplash-dataset-lite',
      sampleId,
      sourceFamilyId,
      sourceUrl: row.photo_url,
      retrievalUrl,
      originalFilename: fileName,
      retrievedAt: new Date().toISOString(),
      sha256: sha256(bytes),
      perceptualHash: await perceptualHash(sharp, bytes),
      licence: 'Unsplash Dataset Lite Terms 1.4.0',
      licenceUrl: 'https://github.com/unsplash/datasets/blob/master/TERMS.md',
      licenceEvidenceStatus: 'VERIFIED',
      rightsClass: 'CLASS_B_EVALUATION_ONLY',
      trainingGate: 'DO_NOT_TRAIN',
      commercialTrainingAllowed: 'DO_NOT_TRAIN',
      evaluationAllowed: 'ALLOW',
      distillationAllowed: 'DO_NOT_TRAIN',
      redistributionAllowed: 'DO_NOT_TRAIN',
      modificationAllowed: 'CONDITIONAL',
      authorOrCreator: [row.photographer_first_name, row.photographer_last_name].filter(Boolean).join(' ') || row.photographer_username || null,
      attribution: row.photographer_username ? `Photo by ${row.photographer_username} via Unsplash Dataset Lite` : 'Unsplash Dataset Lite attribution',
      originClass: 'CAMERA_NATIVE',
      generator: null,
      generatorVersion: null,
      device: [row.exif_camera_make, row.exif_camera_model].filter(Boolean).join(' ') || null,
      privacyFlags: [
        row.photo_location_latitude || row.photo_location_longitude ? 'GPS_PRESENT_IN_SOURCE_METADATA' : null,
        row.photographer_username ? 'CREATOR_METADATA_PRESENT' : null,
      ].filter(Boolean),
      parentSampleId: null,
      transformation: 'ORIGINAL',
      split: 'KNOWN_TEST',
      mime: info.format ? `image/${info.format === 'jpg' ? 'jpeg' : info.format}` : 'image/jpeg',
      width: info.width ?? null,
      height: info.height ?? null,
      byteLength: bytes.byteLength,
      imagePath: join(resolve(imageDirectory), fileName),
      sourceMetadata: {
        unsplashPhotoId: row.photo_id,
        cameraMake: row.exif_camera_make || null,
        cameraModel: row.exif_camera_model || null,
        broadCountry: row.photo_location_country || null,
      },
    });
  }
  await writeJsonl(resolve(outputPath), records);
  await writeJson(`${resolve(outputPath)}.summary.json`, {
    schemaVersion: 'lythaus-authenticity-materialisation-v1',
    datasetId: 'unsplash-dataset-lite',
    rightsClass: 'CLASS_B_EVALUATION_ONLY',
    count: records.length,
    sourceArchive: 'unsplash-research-dataset-lite-latest.zip',
    termsReference: 'C:\\Users\\kylee\\Projects\\Lythaus-data\\authenticity-wp003\\terms\\unsplash-dataset-terms.md',
    trainingGate: 'DO_NOT_TRAIN',
  });
}

async function transformImages(manifestPath, imageDirectory, outputDirectory, outputPath) {
  const sharp = await loadSharp();
  const sourceRecords = (await readFile(resolve(manifestPath), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const records = [];
  await mkdir(resolve(outputDirectory), { recursive: true });
  for (const source of sourceRecords) {
    const sourcePath = source.imagePath ?? join(resolve(imageDirectory), source.originalFilename);
    const metadata = await sharp(sourcePath).metadata();
    const transformations = [
      ['JPEG_QUALITY_95', (image) => image.jpeg({ quality: 95 })],
      ['JPEG_QUALITY_75', (image) => image.jpeg({ quality: 75 })],
      ['RESIZE_75', (image) => image.resize(Math.max(1, Math.round((metadata.width ?? 1) * 0.75)), Math.max(1, Math.round((metadata.height ?? 1) * 0.75))).jpeg({ quality: 95 })],
      ['RESIZE_50', (image) => image.resize(Math.max(1, Math.round((metadata.width ?? 1) * 0.5)), Math.max(1, Math.round((metadata.height ?? 1) * 0.5))).jpeg({ quality: 95 })],
      ['CROP_10', (image) => image.extract({ left: Math.floor((metadata.width ?? 1) * 0.05), top: Math.floor((metadata.height ?? 1) * 0.05), width: Math.max(1, Math.floor((metadata.width ?? 1) * 0.9)), height: Math.max(1, Math.floor((metadata.height ?? 1) * 0.9)) }).jpeg({ quality: 95 })],
      ['MILD_BLUR', (image) => image.blur(1).jpeg({ quality: 95 })],
      ['MILD_SHARPEN', (image) => image.sharpen({ sigma: 1 }).jpeg({ quality: 95 })],
      ['METADATA_STRIPPED', (image) => image.jpeg({ quality: 95 })],
      ['SCREENSHOT_STYLE_RESAMPLING', (image) => image.resize(Math.max(1, Math.round((metadata.width ?? 1) * 0.5)), Math.max(1, Math.round((metadata.height ?? 1) * 0.5))).resize(metadata.width ?? 1, metadata.height ?? 1, { kernel: 'nearest' }).jpeg({ quality: 85 })],
    ];
    for (const [transformation, apply] of transformations) {
      const sampleId = uuidv7FromSeed(`${source.sampleId}:${transformation}`);
      const outputName = `${sampleId}.jpg`;
      const outputFile = join(resolve(outputDirectory), outputName);
      const bytes = await apply(sharp(sourcePath)).toBuffer();
      const outputMetadata = await sharp(bytes).metadata();
      await writeFile(outputFile, bytes);
      records.push({
        ...source,
        sampleId,
        originalFilename: outputName,
        parentSampleId: source.sampleId,
        rightsInheritedFrom: source.sampleId,
        transformation,
        mime: 'image/jpeg',
        width: outputMetadata.width ?? null,
        height: outputMetadata.height ?? null,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        perceptualHash: await perceptualHash(sharp, bytes),
        imagePath: outputFile,
      });
    }
  }
  await writeJsonl(resolve(outputPath), records);
}

async function transformPlan(manifestPath, outputPath) {
  const lines = (await readFile(manifestPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const records = [];
  for (const source of lines) {
    const familyId = source.sourceFamilyId ?? source.sampleId;
    for (const transformation of TRANSFORMATIONS) {
      const isOriginal = transformation === 'ORIGINAL';
      records.push({
        ...source,
        sampleId: isOriginal ? source.sampleId : uuidv7FromSeed(`${source.sampleId}:${transformation}`),
        sourceFamilyId: familyId,
        parentSampleId: isOriginal ? null : source.sampleId,
        transformation,
        rightsInheritedFrom: source.sampleId,
        materialisationStatus: 'PLANNED',
      });
    }
  }
  await writeJson(outputPath, { schemaVersion: 'lythaus-authenticity-transformation-plan-v1', transformations: TRANSFORMATIONS, records });
}

const [command, ...args] = process.argv.slice(2);
try {
  if (!command || command === '--help' || command === '-h') {
    usage();
  } else if (command === 'validate') {
    const record = JSON.parse(await readFile(resolve(args[0]), 'utf8'));
    console.log(JSON.stringify({ valid: true, record: validateRecord(record) }, null, 2));
  } else if (command === 'hash') {
    console.log(await hashFile(resolve(args[0])));
  } else if (command === 'provenance') {
    const record = JSON.parse(await readFile(resolve(args[0]), 'utf8'));
    console.log(JSON.stringify(validateRecord(record), null, 2));
  } else if (command === 'manifest') {
    const records = await manifestForDirectory(args[0]);
    await writeJsonl(resolve(args[1]), records);
    console.log(JSON.stringify({ count: records.length, output: resolve(args[1]) }));
  } else if (command === 'transform-plan') {
    await transformPlan(args[0], resolve(args[1]));
    console.log(JSON.stringify({ status: 'written', output: resolve(args[1]), transformations: TRANSFORMATIONS }));
  } else if (command === 'unsplash-lite-sample') {
    await unsplashLiteSample(args[0], args[1], args[2], args[3] ?? 80);
    console.log(JSON.stringify({ status: 'materialised', datasetId: 'unsplash-dataset-lite', output: resolve(args[1]) }));
  } else if (command === 'transform-images') {
    await transformImages(args[0], args[1], args[2], args[3]);
    console.log(JSON.stringify({ status: 'transformed', output: resolve(args[3]) }));
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
