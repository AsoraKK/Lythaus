import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  assertDatasetSampleRights,
  assertNoSourceFamilyLeakage,
  canUseForDistillation,
  canUseForTraining,
} from '../src/foundation.ts';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const materialiser = path.join(repositoryRoot, 'ml/datasets/tools/materialise/materialise.mjs');

function record(overrides = {}) {
  return {
    datasetId: 'fixture',
    sampleId: '0198a5d3-4a00-7000-8000-000000000123',
    sourceUrl: 'https://example.test/image.jpg',
    originalFilename: 'image.jpg',
    retrievedAt: '2026-08-09T00:00:00.000Z',
    sha256: 'a'.repeat(64),
    perceptualHash: '0'.repeat(16),
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenceEvidenceStatus: 'VERIFIED',
    rightsClass: 'CLASS_B_EVALUATION_ONLY',
    trainingGate: 'DO_NOT_TRAIN',
    commercialTrainingAllowed: 'DO_NOT_TRAIN',
    evaluationAllowed: 'ALLOW',
    distillationAllowed: 'DO_NOT_TRAIN',
    redistributionAllowed: 'DO_NOT_TRAIN',
    modificationAllowed: 'ALLOW',
    originClass: 'CAMERA_NATIVE',
    privacyFlags: [],
    ...overrides,
  };
}

async function run(...args) {
  return execFileAsync(process.execPath, [materialiser, ...args], { cwd: repositoryRoot });
}

test('materialiser accepts evaluation records and rejects distillation leakage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    const validPath = path.join(directory, 'valid.json');
    await writeFile(validPath, JSON.stringify(record()), 'utf8');
    const valid = await run('validate', validPath);
    assert.match(valid.stdout, /"valid": true/);

    const invalidPath = path.join(directory, 'invalid.json');
    await writeFile(invalidPath, JSON.stringify(record({ distillationAllowed: 'ALLOW' })), 'utf8');
    await assert.rejects(run('validate', invalidPath), /evaluation-only records cannot authorize distillation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('materialiser creates source-family transformation lineage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    const manifestPath = path.join(directory, 'manifest.jsonl');
    const outputPath = path.join(directory, 'transformations.json');
    await writeFile(manifestPath, `${JSON.stringify(record({ sourceFamilyId: 'family-1' }))}\n`, 'utf8');
    await run('transform-plan', manifestPath, outputPath);
    const plan = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(plan.records.length, 10);
    assert.equal(plan.records.filter((item) => item.parentSampleId === null).length, 1);
    assert.ok(plan.records.every((item) => item.sourceFamilyId === 'family-1'));
    assert.ok(plan.records.filter((item) => item.parentSampleId !== null).every((item) => item.rightsInheritedFrom));
    assert.ok(plan.records.every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.sampleId)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('materialiser hashes files without loading a second provenance authority', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    const filePath = path.join(directory, 'fixture.bin');
    const content = Buffer.from('lythaus-wp003-hash-fixture');
    await writeFile(filePath, content);
    const expected = createHash('sha256').update(content).digest('hex');
    const result = await run('hash', filePath);
    assert.equal(result.stdout.trim(), expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('model rights register keeps unresolved artefacts blocked', async () => {
  const registry = JSON.parse(await readFile(path.join(repositoryRoot, 'ml/models/model-rights-registry.json'), 'utf8'));
  for (const model of registry.models) {
    if (['SAFE', 'GRIP_CLIP_CONTROL', 'RECONSTRUCTION_DIRE', 'RECONSTRUCTION_LARE2', 'RECONSTRUCTION_ADRD'].includes(model.registryKey)) {
      assert.notEqual(model.status, 'APPROVED_FOR_COMMERCIAL_USE');
      assert.equal(model.artifactDownload, 'PROHIBITED_UNTIL_ALL_RIGHTS_VERIFIED');
      assert.equal(model.distillation, 'DO_NOT_TRAIN');
    }
  }
});

test('dataset rights contracts fail closed and prevent source-family leakage', () => {
  const base = {
    datasetId: 'fixture',
    sampleId: '0198a5d3-4a00-7000-8000-000000000123',
    sourceFamilyId: '0198a5d3-4a00-7000-8000-000000000124',
    sourceUrl: null,
    originalFilename: 'fixture.jpg',
    retrievedAt: '2026-08-09T00:00:00.000Z',
    sha256: 'a'.repeat(64),
    perceptualHash: null,
    licence: 'CC0',
    licenceUrl: null,
    licenceEvidenceStatus: 'VERIFIED',
    rightsClass: 'CLASS_C_LYTHAUS_OWNED',
    trainingGate: 'ALLOW',
    commercialTrainingAllowed: 'ALLOW',
    evaluationAllowed: 'ALLOW',
    distillationAllowed: 'ALLOW',
    redistributionAllowed: 'CONDITIONAL',
    modificationAllowed: 'ALLOW',
    authorOrCreator: null,
    attribution: null,
    originClass: 'CAMERA_NATIVE',
    generator: null,
    generatorVersion: null,
    device: 'fixture-camera',
    privacyFlags: [],
    parentSampleId: null,
    transformation: 'ORIGINAL',
    split: 'TRAIN',
  };
  assertDatasetSampleRights(base);
  assert.equal(canUseForTraining(base), true);
  assert.equal(canUseForDistillation(base), true);
  assert.throws(() => assertDatasetSampleRights({ ...base, licenceEvidenceStatus: 'UNKNOWN' }), /unclear_rights_do_not_train/);
  assert.throws(() => assertNoSourceFamilyLeakage([
    { sampleId: base.sampleId, sourceFamilyId: base.sourceFamilyId, split: 'TRAIN' },
    { sampleId: '0198a5d3-4a00-7000-8000-000000000125', sourceFamilyId: base.sourceFamilyId, split: 'KNOWN_TEST' },
  ]), /source_family_split_leakage/);
});
