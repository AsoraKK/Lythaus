#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import {
  MAX_ACQUISITION_BYTES,
  MAX_ACQUISITION_COUNT,
  MAX_ACQUISITION_ITEM_BYTES,
  assertAcquisitionApproval,
  assertAcquisitionBounds,
  assertAllowedAcquisitionUrl,
  assertExternalChildPath,
  assertExternalDataPath,
  assertExternalOutputPath,
  assertProvenanceAuthorization,
  deterministicUuidV7,
} from '../provenance-authorization.mjs';

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
  console.log(`Lythaus dataset materialiser\n\nCommands:\n  validate <record.json>\n  hash <external-file>\n  provenance <record.json>\n  manifest <external-directory> <external-output.jsonl> <approval.json>\n  transform-plan <external-manifest.jsonl> <external-output.json>\n  unsplash-lite-sample <photos.tsv> <external-output.jsonl> <external-image-directory> <approval.json> [count]\n  transform-images <external-manifest.jsonl> <external-image-directory> <external-output-directory> <external-output.jsonl>\n\nEvery materialisation path is evaluation-only, requires containsUserContent=false, and rejects repository paths. Conditional or unknown rights need a recorded human approval with the matching scope. This tool never trains, distils, or writes raw media into the repository.`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertGate(value, field) {
  if (!GATES.has(value)) throw new Error(`${field} must be one of ${[...GATES].join(', ')}`);
}

function validateRecord(record) {
  const required = [
    'datasetId', 'sampleId', 'sourceUrl', 'originalFilename', 'retrievedAt',
    'sha256', 'licence', 'rightsClass', 'trainingGate', 'originClass', 'privacyFlags',
    'commercialTrainingAllowed', 'evaluationAllowed', 'distillationAllowed',
    'redistributionAllowed', 'modificationAllowed', 'licenceEvidenceStatus', 'containsUserContent',
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
  assertProvenanceAuthorization(record, { operation: 'evaluation', requireModification: true });
  if (record.distillationAllowed === 'ALLOW') {
    assertProvenanceAuthorization(record, { operation: 'distillation', requireModification: true });
  }
  return record;
}

async function hashFile(path) {
  const sourcePath = assertExternalDataPath(path, 'hash_input');
  const hash = createHash('sha256');
  await pipeline(
    createReadStream(sourcePath),
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
  const outputPath = assertExternalOutputPath(path, 'json_output');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(path, records) {
  const outputPath = assertExternalOutputPath(path, 'jsonl_output');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8');
}

async function readApproval(path) {
  const approvalPath = assertExternalDataPath(path, 'approval_record');
  return JSON.parse(await readFile(approvalPath, 'utf8'));
}

function approvalTimestamp(approval) {
  const timestamp = approval?.retrievedAt ?? approval?.approvedAt;
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error('recorded_human_approval_requires_retrievedAt_or_approvedAt');
  }
  return new Date(timestamp).toISOString();
}

async function manifestForDirectory(directory, approval) {
  const root = assertExternalDataPath(directory, 'manifest_source_directory');
  const retrievedAt = approvalTimestamp(approval);
  const authorizationTemplate = {
    containsUserContent: false,
    humanApproval: approval,
    licenceEvidenceStatus: 'CONDITIONAL',
    rightsClass: 'CLASS_B_EVALUATION_ONLY',
    evaluationAllowed: 'CONDITIONAL',
    modificationAllowed: 'CONDITIONAL',
    trainingGate: 'DO_NOT_TRAIN',
    commercialTrainingAllowed: 'DO_NOT_TRAIN',
    distillationAllowed: 'DO_NOT_TRAIN',
  };
  assertAcquisitionApproval(authorizationTemplate);
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
          sampleId: deterministicUuidV7(`manifest:${sha256(bytes)}:${path.slice(root.length + 1)}`, retrievedAt),
          sourceUrl: null,
          originalFilename: entry.name,
          retrievedAt,
          sha256: sha256(bytes),
          perceptualHash: null,
          licence: 'UNKNOWN',
          licenceUrl: null,
          licenceEvidenceStatus: 'CONDITIONAL',
          rightsClass: 'CLASS_B_EVALUATION_ONLY',
          trainingGate: 'DO_NOT_TRAIN',
          commercialTrainingAllowed: 'DO_NOT_TRAIN',
          evaluationAllowed: 'CONDITIONAL',
          distillationAllowed: 'DO_NOT_TRAIN',
          redistributionAllowed: 'DO_NOT_TRAIN',
          modificationAllowed: 'CONDITIONAL',
          originClass: 'UNKNOWN',
          generator: null,
          device: null,
          privacyFlags: ['UNREVIEWED_SOURCE'],
          containsUserContent: false,
          humanApproval: approval,
          byteLength: info.size,
          relativePath: path.slice(root.length + 1),
        });
      }
    }
  }
  await visit(root);
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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

async function downloadBytes(url, { usedBytes, maxBytes }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    let current = assertAllowedAcquisitionUrl(url);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(current, { signal: controller.signal, redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('acquisition_redirect_rejected');
        current = assertAllowedAcquisitionUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`image_download_failed:${response.status}:${current}`);
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_ACQUISITION_ITEM_BYTES) throw new Error(`image_too_large:${length}:${current}`);
      if (length > 0) assertAcquisitionBounds({ count: 1, usedBytes, nextBytes: length, maxBytes });
      const bytes = new Uint8Array(await response.arrayBuffer());
      assertAcquisitionBounds({ count: 1, usedBytes, nextBytes: bytes.byteLength, maxBytes });
      return bytes;
    }
    throw new Error('acquisition_redirect_rejected');
  } finally {
    clearTimeout(timer);
  }
}

async function unsplashLiteSample(tsvPath, outputPath, imageDirectory, approvalPath, count = 80) {
  const approval = await readApproval(approvalPath);
  const retrievedAt = approvalTimestamp(approval);
  const acquisitionRecord = {
    datasetId: 'unsplash-dataset-lite',
    containsUserContent: false,
    humanApproval: approval,
    licenceEvidenceStatus: 'VERIFIED',
    rightsClass: 'CLASS_B_EVALUATION_ONLY',
    evaluationAllowed: 'ALLOW',
    modificationAllowed: 'CONDITIONAL',
    trainingGate: 'DO_NOT_TRAIN',
    commercialTrainingAllowed: 'DO_NOT_TRAIN',
    distillationAllowed: 'DO_NOT_TRAIN',
  };
  assertAcquisitionApproval(acquisitionRecord);
  const manifestPath = assertExternalOutputPath(outputPath, 'acquisition_manifest');
  const imageRoot = assertExternalOutputPath(imageDirectory, 'acquisition_image_directory');
  const sourceTsv = assertExternalDataPath(tsvPath, 'acquisition_metadata');
  const requestedCount = Number(count);
  assertAcquisitionBounds({ count: requestedCount, maxCount: MAX_ACQUISITION_COUNT, maxBytes: MAX_ACQUISITION_BYTES });
  const sharp = await loadSharp();
  const rows = parseTsv(await readFile(sourceTsv, 'utf8'))
    .filter((row) => row.photo_image_url && (row.exif_camera_make || row.exif_camera_model))
    .sort((left, right) => left.photo_id.localeCompare(right.photo_id))
    .slice(0, requestedCount);
  await mkdir(imageRoot, { recursive: true });
  const records = [];
  let acquiredBytes = 0;
  for (const row of rows) {
    const sourceUrl = assertAllowedAcquisitionUrl(row.photo_image_url);
    const sourceFamilyId = deterministicUuidV7(`unsplash-family:${row.photo_id}`, retrievedAt);
    const sampleId = deterministicUuidV7(`unsplash-sample:${row.photo_id}`, retrievedAt);
    const retrievalUrl = `${sourceUrl}${sourceUrl.search ? '&' : '?'}auto=format&fit=max&w=2048`;
    const bytes = await downloadBytes(retrievalUrl, { usedBytes: acquiredBytes, maxBytes: MAX_ACQUISITION_BYTES });
    acquiredBytes += bytes.byteLength;
    const info = await sharp(bytes).metadata();
    const fileName = `${sampleId}${extname(new URL(row.photo_image_url).pathname) || '.jpg'}`;
    await writeFile(join(imageRoot, fileName), bytes);
    records.push({
      datasetId: 'unsplash-dataset-lite',
      sampleId,
      sourceFamilyId,
      sourceUrl: row.photo_url ?? sourceUrl.toString(),
      retrievalUrl,
      originalFilename: fileName,
      retrievedAt,
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
      containsUserContent: false,
      humanApproval: approval,
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
      imagePath: join(imageRoot, fileName),
      sourceMetadata: {
        unsplashPhotoId: row.photo_id,
        cameraMake: row.exif_camera_make || null,
        cameraModel: row.exif_camera_model || null,
        broadCountry: row.photo_location_country || null,
      },
    });
  }
  await writeJsonl(manifestPath, records);
  await writeJson(`${manifestPath}.summary.json`, {
    schemaVersion: 'lythaus-authenticity-materialisation-v1',
    datasetId: 'unsplash-dataset-lite',
    rightsClass: 'CLASS_B_EVALUATION_ONLY',
    count: records.length,
    sourceArchive: 'unsplash-research-dataset-lite-latest.zip',
    termsReference: 'external:terms/unsplash-dataset-terms.md',
    trainingGate: 'DO_NOT_TRAIN',
    containsUserContent: false,
    approvalId: approval.approvalId,
    acquiredBytes,
  });
}

async function transformImages(manifestPath, imageDirectory, outputDirectory, outputPath) {
  const sourceManifest = assertExternalDataPath(manifestPath, 'transform_manifest');
  const sourceRoot = assertExternalDataPath(imageDirectory, 'transform_image_directory');
  const outputRoot = assertExternalOutputPath(outputDirectory, 'transform_output_directory');
  const manifestOutput = assertExternalOutputPath(outputPath, 'transform_output_manifest');
  const sourceRecords = (await readFile(sourceManifest, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const authorisedSources = sourceRecords.map((source) => {
    validateRecord(source);
    assertProvenanceAuthorization(source, { operation: 'evaluation', requireModification: true });
    const sourcePath = source.imagePath
      ? assertExternalChildPath(sourceRoot, source.imagePath, 'transform_source_image')
      : assertExternalChildPath(sourceRoot, join(sourceRoot, source.originalFilename), 'transform_source_image');
    return { source, sourcePath };
  });
  const sharp = await loadSharp();
  const records = [];
  await mkdir(outputRoot, { recursive: true });
  for (const { source, sourcePath } of authorisedSources) {
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
      const sampleId = deterministicUuidV7(`${source.sampleId}:${transformation}`, source.retrievedAt);
      const outputName = `${sampleId}.jpg`;
      const outputFile = join(outputRoot, outputName);
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
  await writeJsonl(manifestOutput, records);
}

async function transformPlan(manifestPath, outputPath) {
  const sourceManifest = assertExternalDataPath(manifestPath, 'transform_plan_manifest');
  const planOutput = assertExternalOutputPath(outputPath, 'transform_plan_output');
  const lines = (await readFile(sourceManifest, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const records = [];
  for (const source of lines) {
    validateRecord(source);
    assertProvenanceAuthorization(source, { operation: 'evaluation', requireModification: true });
    const familyId = source.sourceFamilyId ?? source.sampleId;
    for (const transformation of TRANSFORMATIONS) {
      const isOriginal = transformation === 'ORIGINAL';
      records.push({
        ...source,
        sampleId: isOriginal ? source.sampleId : deterministicUuidV7(`${source.sampleId}:${transformation}`, source.retrievedAt),
        sourceFamilyId: familyId,
        parentSampleId: isOriginal ? null : source.sampleId,
        transformation,
        rightsInheritedFrom: source.sampleId,
        materialisationStatus: 'PLANNED',
      });
    }
  }
  await writeJson(planOutput, { schemaVersion: 'lythaus-authenticity-transformation-plan-v1', transformations: TRANSFORMATIONS, records });
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
    const approval = await readApproval(args[2]);
    const records = await manifestForDirectory(args[0], approval);
    await writeJsonl(args[1], records);
    console.log(JSON.stringify({ count: records.length, output: assertExternalOutputPath(args[1], 'manifest_output') }));
  } else if (command === 'transform-plan') {
    await transformPlan(args[0], resolve(args[1]));
    console.log(JSON.stringify({ status: 'written', output: resolve(args[1]), transformations: TRANSFORMATIONS }));
  } else if (command === 'unsplash-lite-sample') {
    await unsplashLiteSample(args[0], args[1], args[2], args[3], args[4] ?? 80);
    console.log(JSON.stringify({ status: 'materialised', datasetId: 'unsplash-dataset-lite', output: assertExternalOutputPath(args[1], 'acquisition_manifest') }));
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
