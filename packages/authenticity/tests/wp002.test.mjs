import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MODEL_REGISTRY,
  createEvaluationDatasetManifest,
  isUuidV7,
} from '../src/foundation.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
}

test('dataset registry has conservative machine-readable classifications', async () => {
  const registry = await readJson('ml/datasets/dataset-registry.json');
  const allowed = new Set(registry.classificationValues);
  assert.equal(registry.schemaVersion, 'lythaus-authenticity-dataset-registry-v2');
  assert.equal(registry.policy.normalLythausUserContentTraining, 'PROHIBITED');
  assert.equal(registry.policy.unclearRightsAction, 'DO_NOT_TRAIN');
  assert.ok(registry.datasets.length >= 10);
  assert.deepEqual(registry.rightsClassValues, [
    'CLASS_A_COMMERCIAL_TRAINING',
    'CLASS_B_EVALUATION_ONLY',
    'CLASS_C_LYTHAUS_OWNED',
  ]);
  for (const dataset of registry.datasets) {
    assert.ok(allowed.has(dataset.classification), dataset.id);
    assert.ok(dataset.source, dataset.id);
    assert.ok(dataset.licence, dataset.id);
    assert.ok(dataset.recommendation, dataset.id);
    assert.ok(registry.rightsClassValues.includes(dataset.rightsClass), dataset.id);
    assert.ok(dataset.trainingGate, dataset.id);
    assert.ok(dataset.evaluationGate, dataset.id);
    assert.ok(dataset.distillationGate, dataset.id);
    assert.notEqual(dataset.trainingAllowed, 'APPROVED_FOR_COMMERCIAL_TRAINING');
  }
});

test('benchmark schema is versioned and does not permit user-content claims', async () => {
  const schema = await readJson('ml/evaluation/benchmark-v0.schema.json');
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://lythaus.co/schemas/authenticity-benchmark-v0.json');
  assert.ok(schema.required.includes('samples'));
  assert.equal(schema.properties.containsUserContent.const, false);
});

test('evaluation manifests reject normal Lythaus user content', () => {
  assert.throws(
    () => createEvaluationDatasetManifest({
      name: 'invalid-user-content-fixture',
      version: 'v0',
      storageReference: 'r2://fixture',
      contentHashes: ['c'.repeat(64)],
      approvedForEvaluation: true,
      containsUserContent: true,
    }),
    /evaluation_dataset_user_content_prohibited/,
  );
});

test('model registry remains research-only and UUID v7 addressed', () => {
  assert.ok(MODEL_REGISTRY.length >= 10);
  for (const model of MODEL_REGISTRY) {
    assert.equal(isUuidV7(model.modelId), true);
    assert.equal(model.deploymentStatus, 'NOT_DEPLOYED');
    assert.equal(model.artifactSha256, null);
    assert.notEqual(model.productionSuitability, 'APPROVED');
  }
});
