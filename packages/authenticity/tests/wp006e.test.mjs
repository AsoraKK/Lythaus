import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  WP006E_BENCHMARK_VERSION,
  WP006E_CANDIDATE_FEATURE_REGISTRY,
  WP006E_CANONICAL_CROP_SIZE,
  WP006E_EXPECTED_BASE_SHA,
  WP006E_EXPECTED_CSAFE_ARCHIVE_FINGERPRINT,
  WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT,
  WP006E_FEATURE_NAMES,
  WP006E_MAX_CANDIDATE_FEATURES,
  WP006E_MAX_SELECTED_FEATURES,
  WP006E_MIN_SELECTED_GROUPS,
  assertNoWp006eVerdictFields,
  assertWp006eCandidateRegistry,
  assertWp006eHoldoutFreeze,
  assertWp006ePlan,
  assertWp006eSelectedRegistry,
  assertWp006eSealedAccess,
  buildDeviceInvariantMeasurement,
  centeredNativeCrop,
  evaluateDeviceInvariantFeatures,
  extractDeviceInvariantFeatureVector,
  fitDeviceInvariantModel,
  runNestedLeaveOneDeviceOut,
  scoreDeviceInvariantVector,
  selectDeviceInvariantFeatures,
  stableArtifactHash,
} from '../src/wp006e.ts';

const researchDir = path.resolve('research/wp006e');

function fixturePixels(width = 1024, height = 1024) {
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

function syntheticVectors(rows = 12, shift = 0) {
  return Array.from({ length: rows }, (_, row) => WP006E_FEATURE_NAMES.map((_, index) => (
    0.01 * (index + 1) + 0.0007 * row + shift + ((index + row) % 3) * 0.0001
  )));
}

test('WP006E candidate registry is bounded, deterministic and conservative', () => {
  assert.equal(WP006E_BENCHMARK_VERSION, 'lythaus-wp006e-ef2-device-invariant-v1');
  assert.equal(WP006E_CANDIDATE_FEATURE_REGISTRY.features.length <= WP006E_MAX_CANDIDATE_FEATURES, true);
  assert.equal(WP006E_CANDIDATE_FEATURE_REGISTRY.preprocessing.globalResize, false);
  assert.equal(WP006E_CANDIDATE_FEATURE_REGISTRY.patchSelection.semanticSelection, false);
  assert.equal(WP006E_CANDIDATE_FEATURE_REGISTRY.semanticStatus, 'MEASUREMENT_ONLY');
  assert.equal(WP006E_CANDIDATE_FEATURE_REGISTRY.prnuStatus, 'NOT_ADMITTED_AS_PRIMARY_EF2_SIGNAL');
  assert.equal(stableArtifactHash(WP006E_CANDIDATE_FEATURE_REGISTRY), stableArtifactHash(WP006E_CANDIDATE_FEATURE_REGISTRY));
  assert.doesNotThrow(() => assertWp006eCandidateRegistry(WP006E_CANDIDATE_FEATURE_REGISTRY));
  assert.doesNotThrow(() => assertNoWp006eVerdictFields(WP006E_CANDIDATE_FEATURE_REGISTRY));
});

test('canonical crop and fixed-grid feature extraction are deterministic', () => {
  const input = fixturePixels();
  const firstCrop = centeredNativeCrop(input, WP006E_CANONICAL_CROP_SIZE);
  const secondCrop = centeredNativeCrop(input, WP006E_CANONICAL_CROP_SIZE);
  assert.deepEqual(firstCrop, secondCrop);
  const first = extractDeviceInvariantFeatureVector(firstCrop);
  const second = extractDeviceInvariantFeatureVector(secondCrop);
  assert.deepEqual(first, second);
  assert.equal(first.patchCount, 16);
  assert.equal(first.values.length, WP006E_FEATURE_NAMES.length);
  assert.equal(first.applicability, 'applicable');
  assert.ok(first.values.every((value) => Number.isFinite(value)));
});

test('device-invariant model uses bounded selected features and no verdict semantics', () => {
  const camera = [...syntheticVectors(6, 0), ...syntheticVectors(6, 0.02)];
  const controls = syntheticVectors(12, -0.02);
  const devices = ['device-a', 'device-a', 'device-a', 'device-a', 'device-a', 'device-a', 'device-b', 'device-b', 'device-b', 'device-b', 'device-b', 'device-b'];
  const qualities = evaluateDeviceInvariantFeatures({ cameraVectors: camera, cameraDevices: devices, controlVectors: controls });
  const selection = selectDeviceInvariantFeatures(qualities, camera, controls);
  assert.equal(selection.selectedFeatureIndexes.length <= WP006E_MAX_SELECTED_FEATURES, true);
  assert.equal(selection.selectedFeatureGroups.length >= WP006E_MIN_SELECTED_GROUPS || selection.failureReason !== null, true);
  if (!selection.failureReason) {
    const model = fitDeviceInvariantModel(camera, devices, controls, qualities, selection);
    const score = scoreDeviceInvariantVector(camera[0], model);
    assert.ok(score);
    assert.ok(score.rawScore >= 0 && score.rawScore <= 1);
    const result = buildDeviceInvariantMeasurement({
      inputHash: 'a'.repeat(64),
      measurement: score,
      runtimeMs: 1,
      repositoryCommit: 'b'.repeat(40),
      candidateFeatureRegistryHash: 'c'.repeat(64),
      finalFeatureRegistryHash: 'd'.repeat(64),
      selectionPolicyHash: 'e'.repeat(64),
      configurationHash: 'f'.repeat(64),
      benchmarkFingerprint: WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT,
      applicability: 'applicable',
    });
    assert.doesNotThrow(() => assertNoWp006eVerdictFields(result));
    assert.equal(result.calibrationStatus, 'MEASUREMENT_ONLY');
    assert.match(result.limitations.join(' '), /not a probability/i);
  }
});

test('nested leave-one-device-out refits each development device', () => {
  const camera = [...syntheticVectors(4, 0), ...syntheticVectors(4, 0.03), ...syntheticVectors(4, -0.02)];
  const controls = syntheticVectors(8, -0.04);
  const devices = ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'c', 'c', 'c', 'c'];
  const nested = runNestedLeaveOneDeviceOut({ cameraVectors: camera, cameraDevices: devices, controlVectors: controls });
  assert.equal(nested.folds.length, 3);
  assert.deepEqual(nested.folds.map((fold) => fold.leftOutDevice), ['a', 'b', 'c']);
  assert.ok(nested.folds.every((fold) => fold.trainingDeviceFamilies.length === 2));
});

test('WP006E blind and sealed boundaries reject truth, metadata and premature access', () => {
  const input = fixturePixels(256, 256);
  assert.throws(() => extractDeviceInvariantFeatureVector({ ...input, truthAxes: { physicalCameraAcquisition: 'TRUE' } }), /metadata_or_truth/);
  assert.throws(() => extractDeviceInvariantFeatureVector({ ...input, filename: 'camera.jpg' }), /metadata_or_truth/);
  assert.doesNotThrow(() => assertWp006eSealedAccess({ lgePixelsOpened: false, futureModelReservePixelsOpened: false, internalValidationPixelsOpened: false, finalControlPixelsOpened: false }));
  assert.throws(() => assertWp006eSealedAccess({ lgePixelsOpened: true }), /sealed_access/);
  assert.throws(() => assertWp006eHoldoutFreeze({ decision: 'FINAL_HOLDOUT_UNBLIND_AUTHORIZED', lgeHoldoutStatus: 'SEALED', futureModelReserveStatus: 'SEALED', algorithmMutableAfterFreeze: true }), /mutable/);
});

test('WP006E artifacts, when materialized, remain frozen and bound to WP006D', () => {
  const planPath = path.join(researchDir, 'wp006e-plan.json');
  if (!fs.existsSync(planPath)) return;
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.doesNotThrow(() => assertWp006ePlan(plan));
  assert.equal(plan.baseSha, WP006E_EXPECTED_BASE_SHA);
  assert.equal(plan.wp006dBenchmarkFingerprint, WP006E_EXPECTED_WP006D_BENCHMARK_FINGERPRINT);
  assert.equal(plan.csafeArchiveDirectoryFingerprint, WP006E_EXPECTED_CSAFE_ARCHIVE_FINGERPRINT);
  assert.equal(plan.noModelInference, true);
  assert.equal(plan.noCloudCalls, true);
  assert.equal(plan.noProductionChanges, true);
});
