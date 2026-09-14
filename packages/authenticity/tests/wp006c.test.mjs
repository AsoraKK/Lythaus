import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  EF2_CONFIG,
  EF2_FEATURE_NAMES,
  EF2_FEATURE_REGISTRY,
  WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
  assertBlindDecodedPixels,
  assertCalibrationOnlyFreeze,
  assertHoldoutUnblindFreeze,
  assertNoVerdictFields,
  buildSpecialistMeasurement,
  extractEf2FeatureVector,
  fitDeviceBalancedCameraModel,
  scoreEf2FeatureVector,
  stableArtifactHash,
} from '../src/wp006c.ts';

const researchDir = path.resolve('research/wp006c');

function readResearchJson(name) {
  return JSON.parse(fs.readFileSync(path.join(researchDir, name), 'utf8'));
}

function fixturePixels() {
  const width = 256;
  const height = 256;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = (x * 13 + y * 7) % 256;
      pixels[offset + 1] = (x * 5 + y * 17 + 31) % 256;
      pixels[offset + 2] = (x * 19 + y * 3 + 71) % 256;
    }
  }
  return { width, height, channels: 3, pixels };
}

function syntheticVectors(count = 8) {
  return Array.from({ length: count }, (_, row) => EF2_FEATURE_NAMES.map((_, index) => 0.01 * (index + 1) + 0.001 * row + (row % 2) * 0.0007));
}

test('feature registry is conservative and deterministic', () => {
  assert.equal(EF2_FEATURE_REGISTRY.semanticStatus, 'MEASUREMENT_ONLY');
  assert.equal(EF2_FEATURE_REGISTRY.prnuStatus, 'NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL');
  assert.equal(EF2_FEATURE_REGISTRY.preprocessing.globalResize, false);
  assert.equal(EF2_FEATURE_REGISTRY.patchSelection.semanticSelection, false);
  assert.ok(EF2_FEATURE_NAMES.length >= 20 && EF2_FEATURE_NAMES.length <= 50);
  assert.equal(stableArtifactHash(EF2_FEATURE_REGISTRY), stableArtifactHash(EF2_FEATURE_REGISTRY));
  assert.equal(EF2_CONFIG.noMetadataInputs, true);
  assert.equal(EF2_CONFIG.noTruthInputs, true);
});

test('blind decoded-pixel boundary rejects metadata and truth inputs', () => {
  const valid = fixturePixels();
  assert.doesNotThrow(() => assertBlindDecodedPixels(valid));
  assert.throws(() => assertBlindDecodedPixels({ ...valid, truthAxes: { physicalCameraAcquisition: 'TRUE' } }), /metadata_or_truth/);
  assert.throws(() => assertBlindDecodedPixels({ ...valid, fileName: 'camera.jpg' }), /metadata_or_truth/);
  assert.throws(() => assertBlindDecodedPixels({ ...valid, pixels: new Uint8Array(3) }), /buffer_short/);
});

test('pixel-domain feature extraction is deterministic and metadata independent', () => {
  const input = fixturePixels();
  const first = extractEf2FeatureVector(input);
  const second = extractEf2FeatureVector(input);
  assert.deepEqual(first, second);
  assert.equal(first.applicability, 'applicable');
  assert.equal(first.values.length, EF2_FEATURE_NAMES.length);
  assert.ok(first.values.every((value) => Number.isFinite(value)));
});

test('one-class calibration balances devices and produces a finite measurement', () => {
  const vectors = syntheticVectors();
  const devices = ['device-a', 'device-a', 'device-a', 'device-b', 'device-b', 'device-b', 'device-b', 'device-b'];
  const model = fitDeviceBalancedCameraModel(vectors, devices);
  assert.deepEqual(model.deviceFamilies, ['device-a', 'device-b']);
  assert.equal(model.method.deviceWeighting, 'equal_device_center_weight');
  assert.ok(model.includedFeatureIndexes.length > 0);
  const score = scoreEf2FeatureVector(vectors[0], model);
  assert.ok(score);
  assert.ok(Number.isFinite(score.rawScore));
  assert.ok(Number.isFinite(score.normalizedMeasurement));
});

test('specialist result has no verdict or enforcement authority', () => {
  const result = buildSpecialistMeasurement({
    inputHash: 'a'.repeat(64),
    measurement: { rawScore: 1, normalizedMeasurement: 0.5, groupScores: {}, includedFeatureCount: 1 },
    runtimeMs: 3,
    repositoryCommit: 'b'.repeat(40),
    featureRegistryHash: 'c'.repeat(64),
    configurationHash: 'd'.repeat(64),
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    applicability: 'applicable',
  });
  assertNoVerdictFields(result);
  assert.equal(result.calibrationStatus, 'MEASUREMENT_ONLY');
  assert.match(result.limitations.join(' '), /not a probability/i);
  assert.equal(result.provenance.checkpointHash, null);
});

test('calibration freeze requires calibration-only threshold source and expected fingerprint', () => {
  assert.doesNotThrow(() => assertCalibrationOnlyFreeze({
    schemaVersion: 'lythaus-wp006c-ef2-calibration-freeze-v1',
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    calibrationFamilyIds: ['family-a'],
    thresholdSource: 'CALIBRATION_CAMERA_ONLY',
    evaluationPixelsProcessedBeforeFreeze: false,
  }));
  assert.throws(() => assertCalibrationOnlyFreeze({
    schemaVersion: 'lythaus-wp006c-ef2-calibration-freeze-v1',
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    calibrationFamilyIds: ['family-a'],
    thresholdSource: 'EVALUATION_TUNED',
    evaluationPixelsProcessedBeforeFreeze: false,
  }), /threshold_source/);
});

test('holdout unblind freeze binds the complete LGE device and benchmark', () => {
  assert.doesNotThrow(() => assertHoldoutUnblindFreeze({
    schemaVersion: 'lythaus-wp006c-ef2-holdout-unblind-freeze-v1',
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    device: 'LGE LM-G710',
    familyIds: ['family-a'],
    decision: 'UNBLIND_AUTHORIZED',
  }));
  assert.throws(() => assertHoldoutUnblindFreeze({
    schemaVersion: 'lythaus-wp006c-ef2-holdout-unblind-freeze-v1',
    benchmarkFingerprint: WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
    device: 'LGE LM-G710',
    familyIds: [],
    decision: 'UNBLIND_AUTHORIZED',
  }), /families/);
});

test('frozen benchmark and complete LGE boundary are retained', () => {
  const plan = readResearchJson('wp006c-plan.json');
  const freeze = readResearchJson('ef2-calibration-freeze.json');
  const run = readResearchJson('wp006c-run-manifest.json');
  assert.equal(plan.benchmarkFingerprint, WP006C_EXPECTED_BENCHMARK_FINGERPRINT);
  assert.equal(freeze.benchmarkFingerprint, WP006C_EXPECTED_BENCHMARK_FINGERPRINT);
  assert.equal(freeze.evaluationPixelsProcessedBeforeFreeze, false);
  assert.equal(freeze.holdoutPixelsAccessedBeforeFreeze, false);
  assert.equal(run.mediaAccess.lgePixels, false);
  assert.equal(run.deviceHoldoutStatus, 'SEALED');
  assert.equal(run.unseenDeviceHoldoutConsumed, false);
  assert.equal(run.externalInferenceCalls, 0);
  assert.equal(run.incrementalCostUsd, 0);
  assert.equal(fs.existsSync(path.join(researchDir, 'holdout-unblind-freeze.json')), false);
  assert.equal(fs.existsSync(path.join(researchDir, 'ef2-device-holdout-results.json')), false);
});

test('calibration threshold is frozen before evaluation and no retuning is recorded', () => {
  const freeze = readResearchJson('ef2-calibration-freeze.json');
  const evaluation = readResearchJson('ef2-evaluation-results.json');
  const run = readResearchJson('wp006c-run-manifest.json');
  assert.equal(freeze.thresholdSource, 'CALIBRATION_CAMERA_ONLY');
  assert.equal(evaluation.threshold.frozenBy, 'ef2-calibration-freeze.json');
  assert.equal(evaluation.benchmarkFingerprint, WP006C_EXPECTED_BENCHMARK_FINGERPRINT);
  assert.equal(run.thresholdRetunedAfterEvaluation, false);
  assert.equal(evaluation.mediaAccess.lgePixels, false);
});

test('current run reports protocol leakage checks and conservative outcome', () => {
  const evaluation = readResearchJson('ef2-evaluation-results.json');
  const audit = readResearchJson('ef2-shortcut-audit.json');
  assert.equal(evaluation.stageA.sourceFamilyLeakage, 'PASS');
  assert.equal(evaluation.stageA.calibrationEvaluationLeakage, 'PASS');
  assert.equal(evaluation.stageA.truthLeakage, 'PASS');
  assert.equal(evaluation.stageA.metadataInputLeakage, 'PASS');
  assert.equal(audit.primaryScoreUnaffected, true);
  assert.equal(evaluation.stageA.passed, false);
  assert.equal(evaluation.stageA.shortcutRisk, 'HIGH');
});

test('research artifacts do not persist private media or raw pixel payloads', () => {
  const names = fs.readdirSync(researchDir).filter((name) => name.endsWith('.json') || name.endsWith('.md'));
  const content = names.map((name) => fs.readFileSync(path.join(researchDir, name), 'utf8')).join('\n');
  assert.doesNotMatch(content, /[A-Z]:\\\\Users\\/i);
  assert.doesNotMatch(content, /(?:gps|cameraSerial|authorizationHeader|base64|imageData|rawPixels)\s*[:=]/i);
  assert.doesNotMatch(content, /"pixels"\s*:/i);
});
