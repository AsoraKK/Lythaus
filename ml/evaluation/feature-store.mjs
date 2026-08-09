#!/usr/bin/env node

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function assertHash(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('feature_store_requires_sha256_key');
}

async function writeBundle(bundlePath, storeRoot, provenancePath = null) {
  const bundle = JSON.parse(await readFile(resolve(bundlePath), 'utf8'));
  const sha256 = bundle.fileProvenance?.sha256;
  assertHash(sha256);
  const root = resolve(storeRoot);
  await mkdir(join(root, 'features'), { recursive: true });
  const featurePath = join(root, 'features', `${sha256}.json`);
  const provenance = provenancePath ? JSON.parse(await readFile(resolve(provenancePath), 'utf8')) : null;
  const record = {
    schemaVersion: 'lythaus-authenticity-feature-store-v1',
    imageSha256: sha256,
    datasetId: provenance?.datasetId ?? null,
    sampleId: provenance?.sampleId ?? null,
    sourceFamilyId: provenance?.sourceFamilyId ?? null,
    transformation: provenance?.transformation ?? 'UNKNOWN',
    parentSampleId: provenance?.parentSampleId ?? null,
    featureSchemaVersion: bundle.featureVersion,
    spectralFeatures: bundle.spectralStability,
    cameraFeatures: bundle.physicalAcquisition,
    compressionFeatures: bundle.fileProvenance.compression,
    featureVector: bundle.featureVector,
    futureTeacherScores: [],
    generatedAt: new Date().toISOString(),
  };
  await writeFile(featurePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await appendFile(join(root, 'index.jsonl'), `${JSON.stringify({ imageSha256: sha256, featurePath, featureSchemaVersion: bundle.featureVersion, datasetId: record.datasetId, sampleId: record.sampleId })}\n`, 'utf8');
  return { featurePath, imageSha256: sha256 };
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'write') {
    console.log(JSON.stringify(await writeBundle(args[0], args[1], args[2])));
  } else {
    console.log('Usage: node ml/evaluation/feature-store.mjs write <bundle.json> <external-store-root> [provenance.json]');
    process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
