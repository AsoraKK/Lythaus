import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  WP007A_EXPECTED_BASE_SHA,
  WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES,
  WP007A_PROMPT_BANK_VERSION,
  assertArchiveBudget,
  assertBenchmarkRoleTrainingBoundary,
  assertDetectorInput,
  assertNoPrivateArtifactKeys,
  assertPromptBank,
  assertSafeArchiveMember,
  assertSourceFamilyIsolation,
  assertSyntheticBenchmarkRecord,
  assertTrainingEligible,
  derivePromptSeed,
  stableArtifactHash,
} from '../src/wp007a.ts';
import { providerImportTemplate } from '../../../scripts/authenticity/wp007a-import-provider-images.mjs';
import { planCloudflareGeneration } from '../../../scripts/authenticity/wp007a-generate-cloudflare.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const researchDir = path.join(repositoryRoot, 'research', 'wp007a');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(researchDir, name), 'utf8'));
const hasArtifact = (name) => fs.existsSync(path.join(researchDir, name));

test('WP007A contract keeps the expected WP006E baseline intact', () => {
  assert.equal(WP007A_EXPECTED_BASE_SHA, '6c11fbf994bcf6e05e5e20238064237f9f90e574');
  const report = fs.readFileSync(path.join(repositoryRoot, 'research/wp006e/wp006e-final-report.md'), 'utf8');
  assert.match(report, /WP006E_EF2_DECISION = KEEP_MEASUREMENT_ONLY/);
  assert.match(report, /FINAL_CLASSIFICATION = WP006E_EF2_V1_MEASUREMENT_ONLY/);
  const camera = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'research/wp006e/wp006e-camera-partitions.json'), 'utf8'));
  assert.equal(camera.lge.status, 'SEALED');
  assert.equal(camera.lge.pixelsOpened, false);
  assert.equal(camera.futureModelReserve.status, 'SEALED');
  assert.deepEqual(camera.futureModelReserve.deviceIds, ['iPhone11_6', 'iPhone12_6', 'iPhone14_6', 'note10_6']);
});

test('prompt bank is balanced, generator-neutral and deterministic', () => {
  if (!hasArtifact('prompt-bank.json')) return;
  const bank = readJson('prompt-bank.json');
  assert.equal(bank.version, WP007A_PROMPT_BANK_VERSION);
  assert.doesNotThrow(() => assertPromptBank(bank));
  assert.equal(derivePromptSeed(bank.version, 'FLUX_1_SCHNELL', 'PROMPT_001'), derivePromptSeed(bank.version, 'FLUX_1_SCHNELL', 'PROMPT_001'));
  assert.notEqual(derivePromptSeed(bank.version, 'FLUX_1_SCHNELL', 'PROMPT_001'), derivePromptSeed(bank.version, 'FLUX_2_KLEIN_4B', 'PROMPT_001'));
});

test('rights and benchmark role are separate machine-enforced gates', () => {
  const development = {
    sampleId: 'DDB_0001',
    sourceFamilyId: 'DDB-FAMILY-1',
    artifactTruth: { physicalCameraAcquisition: 'FALSE', syntheticDepictedContent: 'TRUE', localManipulation: 'FALSE', digitalCapture: 'FALSE', screenRecapture: 'FALSE' },
    provenance: { provider: 'POLOCLUB', product: 'DIFFUSIONDB_2M', generatorFamily: 'STABLE_DIFFUSION_1X_DIFFUSIONDB', generationRoute: 'OFFICIAL_DIFFUSIONDB_DATASET', truthSource: 'DATASET_PROVENANCE_CONFIRMED' },
    rights: { trainingEligibility: 'TRAINING_ALLOWED_WITH_CONSTRAINTS', evaluationEligibility: true },
    benchmark: { role: 'DEVELOPMENT' },
    file: { sha256: 'a'.repeat(64), width: 512, height: 512, format: 'PNG' },
  };
  assert.doesNotThrow(() => assertTrainingEligible(development));
  const holdout = structuredClone(development);
  holdout.benchmark.role = 'SEALED_GENERATOR_HOLDOUT';
  assert.throws(() => assertTrainingEligible(holdout), /holdout/);
  assert.throws(() => assertBenchmarkRoleTrainingBoundary(holdout), /role_isolation/);
  const future = structuredClone(development);
  future.benchmark.role = 'CALIBRATION_FUTURE';
  assert.throws(() => assertBenchmarkRoleTrainingBoundary(future), /role_isolation/);
  const evaluationOnly = structuredClone(development);
  evaluationOnly.rights.trainingEligibility = 'EVALUATION_ONLY';
  assert.throws(() => assertTrainingEligible(evaluationOnly), /training_rights_blocked/);
  assert.equal(Object.hasOwn(development.rights, 'benchmarkRole'), false);
});

test('truth axes remain independent and provider metadata cannot enter detector input', () => {
  assert.doesNotThrow(() => assertDetectorInput({ pixels: new Uint8Array([1, 2, 3]), configurationId: 'canonical-v1' }));
  for (const metadata of [{ provider: 'x' }, { truthAxes: { syntheticDepictedContent: 'TRUE' } }, { filename: 'x.png' }, { width: 512, height: 512 }]) {
    assert.throws(() => assertDetectorInput({ pixels: new Uint8Array([1]), ...metadata }), /detector_input_metadata/);
  }
});

test('archive safety, source families and duplicate isolation are enforced', () => {
  assert.doesNotThrow(() => assertSafeArchiveMember('part-000001/abc.png'));
  for (const unsafe of ['/absolute.png', 'C:/drive.png', '../escape.png', 'part/../escape.png', 'part//empty.png']) assert.throws(() => assertSafeArchiveMember(unsafe), /archive_member_unsafe/);
  assert.doesNotThrow(() => assertSourceFamilyIsolation([{ sourceFamilyId: 'A', benchmark: { role: 'DEVELOPMENT' }, file: { sha256: 'a'.repeat(64) } }, { sourceFamilyId: 'A', parentSourceFamilyId: 'A', benchmark: { role: 'DEVELOPMENT' }, file: { sha256: 'b'.repeat(64) } }]));
  assert.throws(() => assertSourceFamilyIsolation([{ sourceFamilyId: 'A', benchmark: { role: 'DEVELOPMENT' }, file: { sha256: 'a'.repeat(64) } }, { sourceFamilyId: 'B', benchmark: { role: 'DEVELOPMENT' }, file: { sha256: 'a'.repeat(64) } }]), /exact_duplicate/);
  assert.throws(() => assertSourceFamilyIsolation([{ sourceFamilyId: 'A', benchmark: { role: 'DEVELOPMENT' }, file: { sha256: 'a'.repeat(64) } }, { sourceFamilyId: 'A', parentSourceFamilyId: 'A', benchmark: { role: 'SEALED_GENERATOR_HOLDOUT' }, file: { sha256: 'b'.repeat(64) } }]), /role_leak/);
  assert.doesNotThrow(() => assertArchiveBudget({ archiveBytes: WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES, selectedFamilies: 600, selectedBytes: 1024 }));
  assert.throws(() => assertArchiveBudget({ archiveBytes: WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES + 1, selectedFamilies: 1, selectedBytes: 1 }), /archive_budget/);
});

test('materialized corpus meets bounded development and negative foundations', () => {
  if (!hasArtifact('ef3-synthetic-manifest.json')) return;
  const synthetic = readJson('ef3-synthetic-manifest.json');
  const ddb = synthetic.records.filter((record) => record.provenance.product === 'DIFFUSIONDB_2M');
  assert.ok(ddb.length >= 400 && ddb.length <= 600);
  assert.ok(ddb.every((record) => record.benchmark.role === 'DEVELOPMENT' && record.rights.trainingEligibility === 'TRAINING_ALLOWED_WITH_CONSTRAINTS'));
  assert.ok(synthetic.records.filter((record) => record.benchmark.role === 'UNKNOWN_GENERATOR_DIAGNOSTIC').length >= 1);
  const negative = readJson('ef3-negative-foundation.json');
  assert.ok(negative.cameraNegativeFamilies >= 64);
  assert.ok(negative.programmaticDigitalNonAiFamilies === 48);
  assert.ok(negative.records.filter((record) => record.researchRole === 'CAMERA_NEGATIVE_FOUNDATION').every((record) => record.artifactTruth.syntheticDepictedContent === 'FALSE'));
  assert.ok(negative.records.filter((record) => record.benchmark?.role === 'DEVELOPMENT' && record.researchRole !== 'CAMERA_NEGATIVE_FOUNDATION').every((record) => record.artifactTruth.syntheticDepictedContent === 'FALSE'));
  assertSourceFamilyIsolation([...synthetic.records, ...negative.records]);
});

test('all persisted benchmark records use canonical truth, rights and role separation', () => {
  if (!hasArtifact('ef3-synthetic-manifest.json')) return;
  const records = [...readJson('ef3-synthetic-manifest.json').records, ...readJson('ef3-negative-foundation.json').records];
  assert.ok(records.length >= 600);
  for (const record of records) {
    assert.doesNotThrow(() => assertSyntheticBenchmarkRecord(record));
    assert.equal(Object.hasOwn(record, 'benchmarkRole'), false);
    assert.equal(Object.hasOwn(record.rights, 'benchmarkRole'), false);
    assert.equal(typeof record.file.sha256, 'string');
    assert.equal(typeof record.benchmark.role, 'string');
  }
  assert.ok(records.some((record) => record.provenance.generatorFamily === 'NONE_NON_GENERATIVE'));
});

test('rights audits and owner review preserve unresolved provenance without reasking rights', () => {
  if (!hasArtifact('owner-generator-provenance-review.json')) return;
  const review = readJson('owner-generator-provenance-review.json');
  assert.equal(review.ownerActionRequired, true);
  assert.ok(review.groups.every((group) => group.questions.every((question) => !/permission|rights|authorize/iu.test(question))));
  const diffusion = readJson('diffusiondb-rights-audit.json');
  assert.equal(diffusion.rightsGate, 'PASS');
  assert.equal(diffusion.license, 'CC0-1.0');
  assert.ok(diffusion.downloadedBytes <= WP007A_MAX_DIFFUSIONDB_ARCHIVE_BYTES);
  assert.equal(diffusion.fullDatasetDownloaded, false);
  assert.equal(diffusion.fullDatasetExtracted, false);
  const owner = readJson('owner-synthetic-provenance.json');
  assert.ok(owner.records.every((record) => record.provenance.generatorFamily === 'UNKNOWN' && record.rights.trainingEligibility === 'REVIEW_REQUIRED'));
});

test('provider importer template is metadata-only and uses the future holdout role', () => {
  const template = providerImportTemplate();
  assert.equal(template.schemaVersion, 'lythaus-wp007a-provider-image-import-v1');
  assert.equal(template.records.length, 1);
  assert.equal(template.records[0].benchmarkRole, 'EXTERNAL_PROVIDER_HOLDOUT');
  assert.equal(Object.hasOwn(template.records[0], 'filePath'), false);
  assert.equal(Object.hasOwn(template.records[0], 'apiToken'), false);
});

test('benchmark fingerprint is reproducible and roles preserve reserves', () => {
  if (!hasArtifact('ef3-benchmark-fingerprint.json')) return;
  const fingerprint = readJson('ef3-benchmark-fingerprint.json');
  assert.equal(fingerprint.fingerprintSha256, stableArtifactHash(fingerprint.canonicalInput));
  assert.equal(fingerprint.sourceMediaCommitted, false);
  assert.equal(fingerprint.detectorInferenceRun, false);
  const splits = readJson('ef3-benchmark-splits.json');
  assert.equal(splits.reservedOwnerMediaConsumed, false);
  assert.deepEqual(splits.futureGeneratorReserve, ['XAI_GROK_IMAGINE']);
  const cloudflare = readJson('cloudflare-model-rights.json');
  assert.equal(cloudflare.models.length, 4);
  assert.ok(cloudflare.models.every((model) => model.benchmarkRoleDefault === 'SEALED_GENERATOR_HOLDOUT'));
});

test('privacy, no-inference and no-media guarantees hold for repository artifacts', () => {
  if (!fs.existsSync(researchDir)) return;
  for (const filename of fs.readdirSync(researchDir)) {
    const filePath = path.join(researchDir, filename);
    if (!filename.endsWith('.json')) continue;
    const value = readJson(filename);
    assert.doesNotThrow(() => assertNoPrivateArtifactKeys(value), filename);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(/(^|[^A-Za-z0-9_])[A-Za-z]:[\\/]/u.test(content), false, filename);
    assert.equal(/\.safetensors|\.ckpt|checkpointHash/iu.test(content), false, filename);
  }
  const run = readJson('wp007a-run-manifest.json');
  assert.equal(run.modelInferenceCalls, 0);
  assert.equal(run.modelTrainingRuns, 0);
  assert.equal(run.cloudImageCalls, 0);
  assert.equal(run.mediaCommittedToGit, false);
  const plan = readJson('wp007a-plan.json');
  assert.equal(plan.noModelInference, true);
  assert.equal(plan.noModelTraining, true);
  assert.equal(plan.noCloudImageCalls, true);
  assert.equal(plan.noProductionChanges, true);
});

test('modern generator plan keeps matched prompts and generation disabled', () => {
  if (!hasArtifact('cloudflare-generation-plan.json')) return;
  const plan = readJson('cloudflare-generation-plan.json');
  assert.equal(plan.generationCalls, 0);
  assert.equal(plan.generationStatus, 'AUTH_REQUIRED_AND_RIGHTS_REVIEW_REQUIRED');
  assert.equal(plan.defaultRole, 'SEALED_GENERATOR_HOLDOUT');
  const bank = readJson('prompt-bank.json');
  assert.deepEqual(plan.matchedPromptIds, bank.prompts.slice(0, 40).map((prompt) => prompt.promptId));
});

test('Cloudflare planning is dry-run by default, bounded and secret-free', async () => {
  if (!hasArtifact('cloudflare-model-rights.json')) return;
  const result = await planCloudflareGeneration({ promptStart: 1, promptCount: 2, maxCost: 1 });
  assert.equal(result.dryRun, true);
  assert.equal(result.generatedCount, 0);
  assert.equal(result.credentialsPrinted, false);
  assert.ok(result.estimatedCostUsd <= 1);
  assert.ok(result.rows.every((row) => row.generationAuthorized === false));
});
