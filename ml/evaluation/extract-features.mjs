#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = (await import(pathToFileURL(require.resolve('sharp', { paths: [resolve('ml/datasets/tools/materialise')] })).href)).default;
const { generateForensicFeatureBundleV1, uuidv7 } = await import('../../packages/authenticity/src/foundation.ts');

const [manifestPath, outputRoot, countArg] = process.argv.slice(2);
if (!manifestPath || !outputRoot) {
  console.error('Usage: node --experimental-strip-types ml/evaluation/extract-features.mjs <manifest.jsonl> <external-feature-root> [count]');
  process.exit(2);
}

const records = (await readFile(resolve(manifestPath), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).slice(0, Number(countArg ?? 80));
const root = resolve(outputRoot);
await mkdir(join(root, 'bundles'), { recursive: true });
await mkdir(join(root, 'features'), { recursive: true });
const index = [];
for (const record of records) {
  const bytes = new Uint8Array(await readFile(record.imagePath));
  const decodedResult = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const channels = decodedResult.info.channels === 4 ? 4 : decodedResult.info.channels === 3 ? 3 : 1;
  const bundle = await generateForensicFeatureBundleV1({
    caseId: uuidv7(),
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
    generatedAt: new Date().toISOString(),
  };
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  await writeFile(featurePath, `${JSON.stringify(featureRecord, null, 2)}\n`, 'utf8');
  index.push({ imageSha256: bundle.fileProvenance.sha256, datasetId: record.datasetId, sampleId: record.sampleId, featureSchemaVersion: bundle.featureVersion, featurePath });
}
await writeFile(join(root, 'index.jsonl'), index.map((item) => JSON.stringify(item)).join('\n') + (index.length ? '\n' : ''), 'utf8');
console.log(JSON.stringify({ status: 'extracted', count: index.length, outputRoot: root, featureSchemaVersion: 'lythaus-forensics-v1' }));
