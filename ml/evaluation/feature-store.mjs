#!/usr/bin/env node

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertExternalDataPath,
  assertExternalOutputPath,
  assertProvenanceAuthorization,
} from '../datasets/tools/provenance-authorization.mjs';

function assertHash(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('feature_store_requires_sha256_key');
}

async function writeBundle(bundlePath, storeRoot, provenancePath) {
  const sourceBundle = assertExternalDataPath(bundlePath, 'feature_bundle');
  const root = assertExternalOutputPath(storeRoot, 'feature_store_output');
  const sourceProvenance = assertExternalDataPath(provenancePath, 'feature_provenance');
  const provenance = JSON.parse(await readFile(sourceProvenance, 'utf8'));
  assertProvenanceAuthorization(provenance, { operation: 'evaluation', requireModification: true });
  const bundle = JSON.parse(await readFile(sourceBundle, 'utf8'));
  const sha256 = bundle.fileProvenance?.sha256;
  assertHash(sha256);
  if (provenance.sha256 !== sha256) throw new Error('feature_store_provenance_sha256_mismatch');
  await mkdir(join(root, 'features'), { recursive: true });
  const featurePath = join(root, 'features', `${sha256}.json`);
  const record = {
    schemaVersion: 'lythaus-authenticity-feature-store-v1',
    imageSha256: sha256,
    datasetId: provenance.datasetId,
    sampleId: provenance.sampleId,
    sourceFamilyId: provenance.sourceFamilyId,
    transformation: provenance.transformation ?? 'UNKNOWN',
    parentSampleId: provenance.parentSampleId ?? null,
    featureSchemaVersion: bundle.featureVersion,
    spectralFeatures: bundle.spectralStability,
    cameraFeatures: bundle.physicalAcquisition,
    compressionFeatures: bundle.fileProvenance.compression,
    featureVector: bundle.featureVector,
    futureTeacherScores: [],
    generatedAt: provenance.retrievedAt,
    containsUserContent: false,
    provenanceApprovalId: provenance.humanApproval?.approvalId ?? null,
  };
  await writeFile(featurePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await appendFile(join(root, 'index.jsonl'), `${JSON.stringify({ imageSha256: sha256, featurePath, featureSchemaVersion: bundle.featureVersion, datasetId: record.datasetId, sampleId: record.sampleId, containsUserContent: false })}\n`, 'utf8');
  return { featurePath, imageSha256: sha256 };
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'write') {
    if (!args[0] || !args[1] || !args[2]) throw new Error('feature_store_provenance_required');
    console.log(JSON.stringify(await writeBundle(args[0], args[1], args[2])));
  } else {
    console.log('Usage: node ml/evaluation/feature-store.mjs write <external-bundle.json> <external-store-root> <external-provenance.json>');
    process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
