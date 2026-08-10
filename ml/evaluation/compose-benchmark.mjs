#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  assertExternalDataPath,
  assertExternalOutputPath,
  assertProvenanceAuthorization,
  deterministicUuidV7,
} from '../datasets/tools/provenance-authorization.mjs';

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

async function readJsonl(path) {
  const manifestPath = assertExternalDataPath(path, 'benchmark_source_manifest');
  return (await readFile(manifestPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function stableTimestamp(records) {
  const timestamps = records.map((record) => Date.parse(record.retrievedAt)).filter(Number.isFinite);
  if (timestamps.length !== records.length || timestamps.length === 0) throw new Error('benchmark_reproducible_retrievedAt_required');
  return new Date(Math.max(...timestamps)).toISOString();
}

function normalize(record) {
  assertProvenanceAuthorization(record, { operation: 'evaluation', requireModification: true });
  if (!record.sampleId || !record.sourceFamilyId || !record.sha256) throw new Error('benchmark_provenance_identity_required');
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
    licenceClassification: record.licenceEvidenceStatus === 'VERIFIED' ? 'APPROVED_FOR_EVALUATION_ONLY' : 'APPROVED_BY_RECORDED_HUMAN_REVIEW',
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
  console.error('Usage: node ml/evaluation/compose-benchmark.mjs <external-output.json> <external-source-manifest.jsonl> [...]');
  process.exit(2);
}

const output = assertExternalOutputPath(outputPath, 'benchmark_output');
const sources = (await Promise.all(manifestPaths.map(readJsonl))).flat();
const samples = sources.map(normalize).sort((left, right) => left.sampleId.localeCompare(right.sampleId) || left.contentSha256.localeCompare(right.contentSha256));
const generatedAt = stableTimestamp(sources);
const sourceCount = new Set(samples.map((sample) => sample.sourceFamilyId)).size;
const manifestId = deterministicUuidV7(`benchmark-v0:${samples.map((sample) => `${sample.sampleId}:${sample.contentSha256}`).join('|')}`, generatedAt);
const result = {
  schemaVersion: 'lythaus-authenticity-benchmark-v0',
  manifestId,
  datasetRegistryVersion: 'lythaus-authenticity-dataset-registry-v2',
  generatedAt,
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
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, sourceCount, sampleCount: samples.length, status: result.materialisationStatus, containsUserContent: false }));
