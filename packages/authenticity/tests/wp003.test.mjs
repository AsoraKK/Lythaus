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
import {
  MAX_ACQUISITION_BYTES,
  assertAcquisitionBounds,
  assertAllowedAcquisitionUrl,
  assertExternalChildPath,
  assertExternalOutputPath,
  assertProvenanceAuthorization,
} from '../../../ml/datasets/tools/provenance-authorization.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const materialiser = path.join(repositoryRoot, 'ml/datasets/tools/materialise/materialise.mjs');
const composeBenchmark = path.join(repositoryRoot, 'ml/evaluation/compose-benchmark.mjs');
const featureStore = path.join(repositoryRoot, 'ml/evaluation/feature-store.mjs');
const extractFeatures = path.join(repositoryRoot, 'ml/evaluation/extract-features.mjs');

function approval(scopes = ['SOURCE_RIGHTS', 'EVALUATION', 'MODIFICATION', 'ACQUISITION', 'COMMERCIAL_TRAINING', 'TRAINING', 'DISTILLATION']) {
  return {
    approvalId: 'rights-review-2026-08-09-fixture',
    approvedBy: 'Lythaus Rights Review',
    approvedAt: '2026-08-09T00:00:00.000Z',
    retrievedAt: '2026-08-09T00:00:00.000Z',
    decision: 'APPROVED',
    scopes,
  };
}

function record(overrides = {}) {
  return {
    datasetId: 'fixture',
    sampleId: '0198a5d3-4a00-7000-8000-000000000123',
    sourceFamilyId: '0198a5d3-4a00-7000-8000-000000000124',
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
    containsUserContent: false,
    ...overrides,
  };
}

async function run(...args) {
  return execFileAsync(process.execPath, [materialiser, ...args], { cwd: repositoryRoot });
}

async function runScript(script, ...args) {
  return execFileAsync(process.execPath, [script, ...args], { cwd: repositoryRoot });
}

test('materialiser accepts approved evaluation records and rejects distillation leakage', async () => {
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

test('transform plans are deterministic and preserve source-family provenance', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    const manifestPath = path.join(directory, 'manifest.jsonl');
    const outputPath = path.join(directory, 'transformations.json');
    const replayPath = path.join(directory, 'transformations-replay.json');
    await writeFile(manifestPath, `${JSON.stringify(record())}\n`, 'utf8');
    await run('transform-plan', manifestPath, outputPath);
    await run('transform-plan', manifestPath, replayPath);
    const plan = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(await readFile(outputPath, 'utf8'), await readFile(replayPath, 'utf8'));
    assert.equal(plan.records.length, 10);
    assert.equal(plan.records.filter((item) => item.parentSampleId === null).length, 1);
    assert.ok(plan.records.every((item) => item.sourceFamilyId === record().sourceFamilyId));
    assert.ok(plan.records.filter((item) => item.parentSampleId !== null).every((item) => item.rightsInheritedFrom));
    assert.ok(plan.records.every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.sampleId)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('materialiser rejects denied, unknown, and user-content provenance before planning', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    const cases = [
      [record({ evaluationAllowed: 'DENY' }), /provenance_gate_denied:evaluationAllowed/],
      [record({ licenceEvidenceStatus: 'UNKNOWN' }), /recorded_human_approval_required:licenceEvidenceStatus/],
      [record({ containsUserContent: true }), /contains_user_content_must_be_false/],
    ];
    for (const [entry, expected] of cases) {
      const manifestPath = path.join(directory, `${createHash('sha256').update(JSON.stringify(entry)).digest('hex')}.jsonl`);
      const outputPath = path.join(directory, `${path.basename(manifestPath)}.out.json`);
      await writeFile(manifestPath, `${JSON.stringify(entry)}\n`, 'utf8');
      await assert.rejects(run('transform-plan', manifestPath, outputPath), expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('shared authorization permits recorded human review only for unresolved rights', () => {
  const reviewed = record({
    licenceEvidenceStatus: 'UNKNOWN',
    evaluationAllowed: 'CONDITIONAL',
    modificationAllowed: 'UNKNOWN',
    humanApproval: approval(['SOURCE_RIGHTS', 'EVALUATION', 'MODIFICATION']),
  });
  assert.doesNotThrow(() => assertProvenanceAuthorization(reviewed, { operation: 'evaluation', requireModification: true }));
  assert.throws(() => assertProvenanceAuthorization(record({ evaluationAllowed: 'DENY', humanApproval: approval() }), { operation: 'evaluation', requireModification: true }), /provenance_gate_denied:evaluationAllowed/);
  assert.throws(() => assertProvenanceAuthorization(record({ containsUserContent: true }), { operation: 'evaluation', requireModification: true }), /contains_user_content_must_be_false/);
});

test('distillation requires commercial, training, and distillation authorization together', () => {
  const base = record({
    rightsClass: 'CLASS_C_LYTHAUS_OWNED',
    trainingGate: 'ALLOW',
    commercialTrainingAllowed: 'ALLOW',
    distillationAllowed: 'ALLOW',
  });
  assertDatasetSampleRights(base);
  assert.equal(canUseForTraining(base), true);
  assert.equal(canUseForDistillation(base), true);
  assert.equal(canUseForDistillation({ ...base, commercialTrainingAllowed: 'DO_NOT_TRAIN' }), false);
  assert.equal(canUseForDistillation({ ...base, trainingGate: 'DO_NOT_TRAIN' }), false);
  assert.equal(canUseForDistillation({ ...base, distillationAllowed: 'DO_NOT_TRAIN' }), false);
  assert.throws(() => assertDatasetSampleRights({ ...base, commercialTrainingAllowed: 'DO_NOT_TRAIN' }), /distillation_requires_commercial_training_approval/);
});

test('acquisition and output safety controls reject unsafe hosts, paths, counts, and bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    assert.equal(assertAllowedAcquisitionUrl('https://images.unsplash.com/photo-1').hostname, 'images.unsplash.com');
    assert.throws(() => assertAllowedAcquisitionUrl('https://evil.example/photo.jpg'), /acquisition_host_not_allowlisted/);
    assert.throws(() => assertAllowedAcquisitionUrl('http://images.unsplash.com/photo.jpg'), /acquisition_host_not_allowlisted/);
    assert.throws(() => assertAcquisitionBounds({ count: 81 }), /acquisition_count_out_of_bounds/);
    assert.throws(() => assertAcquisitionBounds({ count: 1, usedBytes: MAX_ACQUISITION_BYTES, nextBytes: 1 }), /acquisition_aggregate_bytes_exceeded/);
    assert.throws(() => assertExternalOutputPath(repositoryRoot), /repository_path_rejected/);
    assert.throws(() => assertExternalOutputPath(path.parse(directory).root), /dangerous_root_path_rejected/);
    assert.throws(() => assertExternalOutputPath('relative-output.json'), /external_path_must_be_absolute/);
    assert.throws(() => assertExternalChildPath(directory, path.resolve(directory, '..', 'outside.jpg'), 'fixture'), /path_outside_external_root:fixture/);

    const approvalPath = path.join(directory, 'approval.json');
    const tsvPath = path.join(directory, 'photos.tsv');
    await writeFile(approvalPath, JSON.stringify(approval()), 'utf8');
    await writeFile(tsvPath, 'photo_id\tphoto_image_url\texif_camera_make\n', 'utf8');
    await assert.rejects(
      run('unsplash-lite-sample', tsvPath, path.join(directory, 'manifest.jsonl'), path.join(directory, 'images'), approvalPath, '81'),
      /acquisition_count_out_of_bounds:81/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI rejects repository and dangerous paths before loading media', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-materialiser-'));
  try {
    const manifestPath = path.join(directory, 'manifest.jsonl');
    await writeFile(manifestPath, `${JSON.stringify(record())}\n`, 'utf8');
    await assert.rejects(run('transform-plan', manifestPath, path.join(repositoryRoot, 'must-not-write.json')), /repository_path_rejected:transform_plan_output/);
    await assert.rejects(
      run('transform-images', manifestPath, directory, path.join(repositoryRoot, 'must-not-write-images'), path.join(directory, 'output.jsonl')),
      /repository_path_rejected:transform_output_directory/,
    );
    await assert.rejects(run('hash', repositoryRoot), /repository_path_rejected:hash_input/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('benchmark composition and feature-store materialisation use the same authorization boundary', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-evaluation-'));
  try {
    const manifestPath = path.join(directory, 'manifest.jsonl');
    const benchmarkPath = path.join(directory, 'benchmark.json');
    const replayPath = path.join(directory, 'benchmark-replay.json');
    await writeFile(manifestPath, `${JSON.stringify(record())}\n`, 'utf8');
    await runScript(composeBenchmark, benchmarkPath, manifestPath);
    await runScript(composeBenchmark, replayPath, manifestPath);
    const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));
    assert.equal(benchmark.containsUserContent, false);
    assert.equal(await readFile(benchmarkPath, 'utf8'), await readFile(replayPath, 'utf8'));
    await assert.rejects(runScript(composeBenchmark, path.join(directory, 'blocked.json'), manifestPath.replace('manifest', 'missing')), /ENOENT/);

    const bundleHash = 'b'.repeat(64);
    const bundlePath = path.join(directory, 'bundle.json');
    const provenancePath = path.join(directory, 'provenance.json');
    const featureRoot = path.join(directory, 'features');
    await writeFile(bundlePath, JSON.stringify({ fileProvenance: { sha256: bundleHash, compression: {} }, featureVersion: 'lythaus-forensics-v1', spectralStability: {}, physicalAcquisition: {}, featureVector: [] }), 'utf8');
    await writeFile(provenancePath, JSON.stringify(record({ sha256: bundleHash })), 'utf8');
    await runScript(featureStore, 'write', bundlePath, featureRoot, provenancePath);
    assert.equal(JSON.parse(await readFile(path.join(featureRoot, 'features', `${bundleHash}.json`), 'utf8')).containsUserContent, false);

    await writeFile(provenancePath, JSON.stringify(record({ sha256: bundleHash, containsUserContent: true })), 'utf8');
    await assert.rejects(runScript(featureStore, 'write', bundlePath, featureRoot, provenancePath), /contains_user_content_must_be_false/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('feature extraction rejects repository output paths before decoding any media', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lythaus-extraction-'));
  try {
    const manifestPath = path.join(directory, 'manifest.jsonl');
    await writeFile(manifestPath, `${JSON.stringify(record({ imagePath: path.join(directory, 'missing.jpg') }))}\n`, 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, ['--experimental-strip-types', extractFeatures, manifestPath, path.join(repositoryRoot, 'must-not-write-features')], { cwd: repositoryRoot }),
      /repository_path_rejected:feature_output_root/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('model rights register keeps unresolved artefacts blocked and no source-family split leaks', async () => {
  const registry = JSON.parse(await readFile(path.join(repositoryRoot, 'ml/models/model-rights-registry.json'), 'utf8'));
  for (const model of registry.models) {
    if (['SAFE', 'GRIP_CLIP_CONTROL', 'RECONSTRUCTION_DIRE', 'RECONSTRUCTION_LARE2', 'RECONSTRUCTION_ADRD'].includes(model.registryKey)) {
      assert.notEqual(model.status, 'APPROVED_FOR_COMMERCIAL_USE');
      assert.equal(model.artifactDownload, 'PROHIBITED_UNTIL_ALL_RIGHTS_VERIFIED');
      assert.equal(model.distillation, 'DO_NOT_TRAIN');
    }
  }
  const base = record({ rightsClass: 'CLASS_C_LYTHAUS_OWNED', trainingGate: 'ALLOW', commercialTrainingAllowed: 'ALLOW', distillationAllowed: 'ALLOW' });
  assert.throws(() => assertNoSourceFamilyLeakage([
    { sampleId: base.sampleId, sourceFamilyId: base.sourceFamilyId, split: 'TRAIN' },
    { sampleId: '0198a5d3-4a00-7000-8000-000000000125', sourceFamilyId: base.sourceFamilyId, split: 'KNOWN_TEST' },
  ]), /source_family_split_leakage/);
});
