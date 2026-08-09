#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const transformations = {
  ORIGINAL: 'ORIGINAL',
  JPEG_QUALITY_95: 'JPEG_COMPRESSED',
  JPEG_QUALITY_75: 'JPEG_COMPRESSED',
  RESIZE_75: 'RESIZED',
  RESIZE_50: 'RESIZED',
  CROP_10: 'CROPPED',
  MILD_BLUR: 'BLURRED',
  MILD_SHARPEN: 'SHARPENED',
  METADATA_STRIPPED: 'METADATA_STRIPPED',
  SCREENSHOT_STYLE_RESAMPLING: 'SCREENSHOT',
};

function uuidv7() {
  const bytes = Buffer.from(createHash('sha256').update(`benchmark:${Date.now()}:${Math.random()}`).digest().subarray(0, 16));
  const timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readJsonl(path) {
  return readFile(resolve(path), 'utf8').then((text) => text.split(/\r?\n/).filter(Boolean).map(JSON.parse));
}

function normalize(record) {
  const isEvaluationOnly = record.rightsClass === 'CLASS_B_EVALUATION_ONLY';
  return {
    sampleId: record.sampleId,
    groupId: record.sourceFamilyId,
    sourceFamilyId: record.sourceFamilyId,
    origin: record.originClass ?? 'UNKNOWN',
    transformation: transformations[record.transformation] ?? 'ORIGINAL',
    transformationParameters: record.transformation === 'JPEG_QUALITY_95'
      ? { quality: 95 }
      : record.transformation === 'JPEG_QUALITY_75' ? { quality: 75 } : null,
    generatorFamily: record.generator ?? null,
    generatorVersion: record.generatorVersion ?? null,
    generatorSplit: record.generator ? 'KNOWN' : 'NOT_APPLICABLE',
    sourceDatasetId: record.datasetId,
    sourceUrl: record.sourceUrl,
    licenceClassification: record.licenceEvidenceStatus === 'VERIFIED' ? 'APPROVED_FOR_EVALUATION_ONLY' : 'UNCLEAR',
    rightsClass: record.rightsClass,
    trainingGate: record.trainingGate,
    evaluationGate: record.evaluationAllowed,
    distillationGate: record.distillationAllowed,
    contentSha256: record.sha256,
    perceptualHash: record.perceptualHash,
    parentSampleId: record.parentSampleId,
    width: record.width,
    height: record.height,
    mime: record.mime,
    hasPii: (record.privacyFlags ?? []).some((flag) => /GPS|SERIAL|OWNER|FACE|BIOMETRIC|MEDICAL/i.test(flag)),
    privacyFlags: record.privacyFlags ?? [],
    hardNegative: ['CGI', 'TRADITIONAL_DIGITAL_ART', 'SCAN', 'COMPOSITE'].includes(record.originClass),
    consentStatus: record.rightsClass === 'CLASS_C_LYTHAUS_OWNED' ? 'RELEASE_REQUIRED' : 'SOURCE_TERMS_RECORDED',
    truthSynthetic: ['AI_GENERATED', 'AI_EDITED'].includes(record.originClass) ? true : false,
    truthLocalManipulation: record.originClass === 'AI_EDITED' ? true : null,
    split: isEvaluationOnly ? 'EVALUATION_ONLY' : (record.split ?? 'KNOWN_TEST'),
    retentionClass: isEvaluationOnly ? 'EVALUATION_ONLY_DELETE_ON_TERMINATION' : 'EXTERNAL_REVIEW_CACHE',
  };
}

const [outputPath, ...manifestPaths] = process.argv.slice(2);
if (!outputPath || manifestPaths.length === 0) {
  console.error('Usage: node ml/evaluation/compose-benchmark.mjs <output.json> <source-manifest.jsonl> [...]');
  process.exit(2);
}

const sources = (await Promise.all(manifestPaths.map(readJsonl))).flat();
const samples = sources.map(normalize);
const sourceCount = new Set(samples.map((sample) => sample.sourceFamilyId)).size;
const result = {
  schemaVersion: 'lythaus-authenticity-benchmark-v0',
  manifestId: uuidv7(),
  datasetRegistryVersion: 'lythaus-authenticity-dataset-registry-v2',
  generatedAt: new Date().toISOString(),
  containsUserContent: false,
  sourceCount,
  sampleCount: samples.length,
  targetComposition: {
    cameraNative: 80,
    aiGenerated: 80,
    cgiDigitalArt: 40,
    scanScientificMedical: 20,
    screenshotComposite: 30,
    partialSynthetic: 40,
    unseenHoldout: 30,
  },
  materialisationStatus: sourceCount >= 320 ? 'TARGET_REACHED' : 'PARTIAL_PROVENANCE_FIRST',
  samples,
};
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: resolve(outputPath), sourceCount, sampleCount: samples.length, status: result.materialisationStatus }));
