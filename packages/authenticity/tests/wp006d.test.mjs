import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  EF2_CONFIG,
  EF2_FEATURE_REGISTRY,
  WP006C_EXPECTED_BENCHMARK_FINGERPRINT,
  assertBlindDecodedPixels,
  assertNoVerdictFields,
  stableArtifactHash,
} from '../src/wp006c.ts';
import {
  WP006D_BENCHMARK_VERSION,
  WP006D_EXPECTED_BASE_SHA,
  WP006D_FUTURE_HOLDOUT_DEVICES,
  WP006D_LGE_DEVICE,
  WP006D_REPLICATION_DEVICES,
  assertSafeArchiveMember,
  assertWp006dBenchmarkFingerprint,
  assertWp006dPlan,
  assertWp006dSubsetPlan,
  centeredNativeCrop,
  hashWp006dPlan,
  selectCanonicalCropSize,
} from '../src/wp006d.ts';

const researchDir = path.resolve('research/wp006d');

function readResearchJson(name) {
  return JSON.parse(fs.readFileSync(path.join(researchDir, name), 'utf8'));
}

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

test('WP006D artifacts bind to the frozen WP006C benchmark and base', () => {
  const plan = readResearchJson('wp006d-plan.json');
  const fingerprint = readResearchJson('wp006d-fingerprint.json');
  const run = readResearchJson('wp006d-run-manifest.json');
  assert.doesNotThrow(() => assertWp006dPlan(plan));
  assert.doesNotThrow(() => assertWp006dBenchmarkFingerprint(fingerprint));
  assert.equal(plan.baseSha, WP006D_EXPECTED_BASE_SHA);
  assert.equal(plan.wp006cHistorical.benchmarkFingerprint, WP006C_EXPECTED_BENCHMARK_FINGERPRINT);
  assert.equal(plan.benchmarkFingerprint, fingerprint.fingerprintSha256);
  assert.equal(fingerprint.planHash, hashWp006dPlan(plan));
  assert.equal(run.benchmarkFingerprint, fingerprint.fingerprintSha256);
  assert.equal(run.planHash, fingerprint.planHash);
  assert.equal(run.v0Frozen, true);
  assert.equal(run.v0ModelRefit, false);
  assert.equal(run.thresholdRetuned, false);
  assert.equal(run.modelInferenceCalls, 0);
  assert.equal(run.cloudCalls, 0);
  assert.equal(run.productionChanges, false);
  assert.equal(run.holdouts.lge, 'SEALED');
  assert.equal(run.holdouts.csafeFutureDevices, 'SEALED');
});

test('WP006D keeps the complete LGE and CSAFE future-device boundaries sealed', () => {
  const plan = readResearchJson('wp006d-plan.json');
  const subset = readResearchJson('csafe-subset-plan.json');
  const inventory = readResearchJson('csafe-device-inventory.json');
  const replication = readResearchJson('csafe-replication-manifest.json');
  assert.doesNotThrow(() => assertWp006dSubsetPlan(subset));
  assert.deepEqual(plan.csafe.replicationDevices, [...WP006D_REPLICATION_DEVICES]);
  assert.deepEqual(plan.csafe.futureHoldoutDevices, [...WP006D_FUTURE_HOLDOUT_DEVICES]);
  assert.equal(plan.frozenBoundaries.lgeHoldoutDevice, WP006D_LGE_DEVICE);
  assert.equal(plan.frozenBoundaries.lgeHoldoutStatus, 'SEALED');
  assert.equal(plan.frozenBoundaries.csafeFutureHoldoutStatus, 'SEALED');
  assert.equal(inventory.futureHoldoutPixelsOpened, false);
  assert.equal(replication.futureHoldoutPixelsOpened, false);
  assert.equal(replication.records.some((record) => WP006D_FUTURE_HOLDOUT_DEVICES.includes(record.deviceFamilyId)), false);
  assert.equal(fs.existsSync(path.join(researchDir, 'holdout-unblind-freeze.json')), false);
  assert.equal(fs.existsSync(path.join(researchDir, 'ef2-device-holdout-results.json')), false);
});

test('subset plan rejects device overlap, duplicate members, and score-based selection', () => {
  const plan = readResearchJson('csafe-subset-plan.json');
  assert.throws(() => assertWp006dSubsetPlan({ ...plan, futureHoldoutDevices: [plan.replicationDevices[0], ...plan.futureHoldoutDevices.slice(1)] }), /overlap/);
  assert.throws(() => assertWp006dSubsetPlan({ ...plan, selectionUsesEf2Scores: true }), /used_ef2/);
  assert.throws(() => assertWp006dSubsetPlan({ ...plan, futureHoldoutPixelsOpened: true }), /holdout_pixels/);
  assert.throws(() => assertSafeArchiveMember('../escape.jpg'), /unsafe/);
  assert.throws(() => assertSafeArchiveMember('C:/escape.jpg'), /unsafe/);
  assert.doesNotThrow(() => assertSafeArchiveMember('iPhone11/iPhone11_1/natural/front/IMG_0700.JPG'));
});

test('canonical crop is deterministic native decoded pixels with no resize', () => {
  const input = fixturePixels();
  const cropOne = centeredNativeCrop(input, 512);
  const cropTwo = centeredNativeCrop(input, 512);
  assert.deepEqual(cropOne, cropTwo);
  assert.equal(cropOne.width, 512);
  assert.equal(cropOne.height, 512);
  assert.equal(cropOne.channels, 3);
  assert.equal(selectCanonicalCropSize([{ width: 3000, height: 2000 }, { width: 1080, height: 2340 }]), 1024);
  assert.throws(() => selectCanonicalCropSize([{ width: 400, height: 400 }]), /no_canonical/);
});

test('blind extractor boundary excludes truth, metadata, filename and dimensions-as-features', () => {
  const valid = fixturePixels(256, 256);
  assert.doesNotThrow(() => assertBlindDecodedPixels(valid));
  assert.throws(() => assertBlindDecodedPixels({ ...valid, truthAxes: { physicalCameraAcquisition: 'TRUE' } }), /metadata_or_truth/);
  assert.throws(() => assertBlindDecodedPixels({ ...valid, metadata: { exif: true } }), /metadata_or_truth/);
  assert.throws(() => assertBlindDecodedPixels({ ...valid, filename: 'camera.jpg' }), /metadata_or_truth/);
  assert.equal(EF2_CONFIG.noMetadataInputs, true);
  assert.equal(EF2_CONFIG.noTruthInputs, true);
  assert.equal(EF2_FEATURE_REGISTRY.preprocessing.globalResize, false);
});

test('replication results remain measurement-only and do not contain verdict fields', () => {
  const results = readResearchJson('v0-replication-results.json');
  assert.equal(results.frozenMeasurement.modelRefit, false);
  assert.equal(results.frozenMeasurement.thresholdSource, 'CALIBRATION_CAMERA_ONLY');
  assert.equal(results.holdouts.lge, 'SEALED');
  assert.equal(results.holdouts.csafeFutureDevices, 'SEALED');
  assert.equal(results.cloudCalls, 0);
  assert.equal(results.modelInferenceCalls, 0);
  assert.doesNotThrow(() => assertNoVerdictFields(results.rows[0].measurement));
  assert.match(results.rows[0].measurement.limitations.join(' '), /not a probability/i);
});

test('source media and raw pixel/residual payloads are absent from tracked artifacts', () => {
  const tracked = execFileSync('git', ['ls-files', 'research/wp006d'], { encoding: 'utf8' }).split(/\r?\n/u).filter(Boolean);
  assert.equal(tracked.some((name) => /\.(?:jpg|jpeg|png|webp|avif|bin|npy|npz)$/iu.test(name)), false);
  const content = tracked.map((name) => fs.readFileSync(name, 'utf8')).join('\n');
  assert.doesNotMatch(content, /[A-Z]:\\\\Users\\/iu);
  assert.doesNotMatch(content, /"(?:pixels|rawPixels|rawResidual|residualSurface)"\s*:/iu);
  assert.doesNotMatch(content, /(?:authorizationHeader|apiToken|base64)\s*[:=]/iu);
});

test('WP006D fingerprint remains deterministic and architecture-neutral', () => {
  const plan = readResearchJson('wp006d-plan.json');
  const fingerprint = readResearchJson('wp006d-fingerprint.json');
  assert.equal(stableArtifactHash(fingerprint.canonicalInput), fingerprint.fingerprintSha256);
  assert.equal(fingerprint.lgeHoldoutStatus, 'SEALED');
  assert.equal(fingerprint.csafeFutureHoldoutStatus, 'SEALED');
  assert.equal(plan.selectionUsesEf2Scores, false);
  assert.equal(plan.noModelInference, true);
  assert.equal(plan.noCloudCalls, true);
  assert.equal(plan.noProductionChanges, true);
});
