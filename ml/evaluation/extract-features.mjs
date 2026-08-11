#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertExternalDataPath,
  assertExternalOutputPath,
  assertProvenanceAuthorization,
  deterministicUuidV7,
} from '../datasets/tools/provenance-authorization.mjs';

const require = createRequire(import.meta.url);
const { generateForensicFeatureBundleV1 } = await import('../../packages/authenticity/src/foundation.ts');

async function loadSharp() {
  try {
    return (await import(pathToFileURL(require.resolve('sharp', { paths: [resolve('ml/datasets/tools/materialise')] })).href)).default;
  } catch {
    throw new Error('sharp_required_for_feature_extraction');
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseCount(value) {
  const count = Number(value ?? 80);
  if (!Number.isInteger(count) || count < 1 || count > 80) throw new Error(`feature_extraction_count_out_of_bounds:${value}`);
  return count;
}

const [manifestPath, outputRoot, countArg] = process.argv.slice(2);
if (!manifestPath || !outputRoot) {
  console.error('Usage: node --experimental-strip-types ml/evaluation/extract-features.mjs <external-manifest.jsonl> <external-feature-root> [count]');
  process.exit(2);
}

const sourceManifest = assertExternalDataPath(manifestPath, 'feature_source_manifest');
const root = assertExternalOutputPath(outputRoot, 'feature_output_root');
const count = parseCount(countArg);
const records = (await readFile(sourceManifest, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).slice(0, count);
const authorisedRecords = records.map((record) => {
  assertProvenanceAuthorization(record, { operation: 'evaluation', requireModification: true });
  const imagePath = assertExternalDataPath(record.imagePath, 'feature_source_image');
  if (!record.sampleId || !record.sourceFamilyId || !record.retrievedAt) throw new Error('feature_provenance_identity_required');
  return { record, imagePath };
});
const sharp = await loadSharp();
await mkdir(join(root, 'bundles'), { recursive: true });
await mkdir(join(root, 'features'), { recursive: true });
const index = [];
for (const { record, imagePath } of authorisedRecords) {
  const bytes = new Uint8Array(await readFile(imagePath));
  const inputHash = sha256(bytes);
  if (record.sha256 !== inputHash) throw new Error('feature_source_sha256_mismatch');
  const decodedResult = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const channels = decodedResult.info.channels === 4 ? 4 : decodedResult.info.channels === 3 ? 3 : 1;
  const bundle = await generateForensicFeatureBundleV1({
    caseId: deterministicUuidV7(`feature-case:${record.sampleId}:${inputHash}`, record.retrievedAt),
    mime: record.mime ?? 'image/jpeg',
    bytes,
    decoded: {
      width: decodedResult.info.width,
      height: decodedResult.info.height,
      channels,
      pixels: decodedResult.data,
    },
    now: record.retrievedAt,
  });
  const bundlePath = join(root, 'bundles', `${bundle.fileProvenance.sha256}.json`);
  const featurePath = join(root, 'features', `${bundle.fileProvenance.sha256}.json`);
  const featureRecord = {
    schemaVersion: 'lythaus-authenticity-feature-store-v1',
    imageSha256: bundle.fileProvenance.sha256,
    datasetId: record.datasetId,
    sampleId: record.sampleId,
    sourceFamilyId: record.sourceFamilyId,
    transformation: record.transformation,
    parentSampleId: record.parentSampleId ?? null,
    featureSchemaVersion: bundle.featureVersion,
    spectralFeatures: bundle.spectralStability,
    cameraFeatures: bundle.physicalAcquisition,
    compressionFeatures: bundle.fileProvenance.compression,
    featureVector: bundle.featureVector,
    futureTeacherScores: [],
    generatedAt: record.retrievedAt,
    containsUserContent: false,
    provenanceApprovalId: record.humanApproval?.approvalId ?? null,
  };
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  await writeFile(featurePath, `${JSON.stringify(featureRecord, null, 2)}\n`, 'utf8');
  index.push({ imageSha256: bundle.fileProvenance.sha256, datasetId: record.datasetId, sampleId: record.sampleId, featureSchemaVersion: bundle.featureVersion, featurePath, containsUserContent: false });
}
await writeFile(join(root, 'index.jsonl'), index.map((item) => JSON.stringify(item)).join('\n') + (index.length ? '\n' : ''), 'utf8');
console.log(JSON.stringify({ status: 'extracted', count: index.length, outputRoot: root, featureSchemaVersion: 'lythaus-forensics-v1', containsUserContent: false }));
