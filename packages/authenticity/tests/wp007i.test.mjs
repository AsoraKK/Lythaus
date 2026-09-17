import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAFE_CHECKPOINT_SHA256,
  SAFE_PREPROCESSING_VERSION,
  SAFE_SPECIALIST_CANDIDATE,
  classifySafeApplicability,
  createSafeEvidence,
} from '../src/wp007h.ts';
import {
  WP007I_FROZEN_THRESHOLD,
  WP007I_POLICY_VERSION,
  WP007I_SELECTIVE_EVIDENCE_SCHEMA_VERSION,
  assertWp007iGeneratorFamilyAllowed,
  createSelectiveSafeSnapshot,
  publicSelectiveSafeView,
} from '../src/wp007i.ts';

const profile = {
  profileVersion: 'wp007h-safe-frozen-test-v1',
  artifactHash: SAFE_CHECKPOINT_SHA256,
  preprocessingVersion: SAFE_PREPROCESSING_VERSION,
  frozenSyntheticThreshold: WP007I_FROZEN_THRESHOLD,
  thresholdProvenance: 'WP007H frozen SAFE operating point',
};

function facts(overrides = {}) {
  return {
    inputRegime: 'ORIGINAL_OR_HIGH_QUALITY',
    format: 'PNG',
    width: 1024,
    height: 1024,
    metadataPresent: true,
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return createSafeEvidence({
    status: 'OK',
    rawScore: 0.9,
    runtimeMs: 10,
    facts: facts(),
    calibration: profile,
    ...overrides,
  });
}

test('WP007I preserves the WP007H SAFE artifact, preprocessing, and threshold', () => {
  const snapshot = createSelectiveSafeSnapshot({ evidence: evidence(), frozenThreshold: WP007I_FROZEN_THRESHOLD });
  assert.equal(snapshot.detectorId, SAFE_SPECIALIST_CANDIDATE);
  assert.equal(snapshot.artifactHash, SAFE_CHECKPOINT_SHA256);
  assert.equal(snapshot.preprocessingVersion, SAFE_PREPROCESSING_VERSION);
  assert.equal(snapshot.frozenThreshold, 0.5864923000335693);
  assert.equal(snapshot.policyVersion, WP007I_POLICY_VERSION);
  assert.equal(snapshot.schemaVersion, WP007I_SELECTIVE_EVIDENCE_SCHEMA_VERSION);
  assert.throws(() => createSelectiveSafeSnapshot({ evidence: evidence(), frozenThreshold: 0.5 }), /threshold_mismatch/);
  assert.throws(() => createSelectiveSafeSnapshot({ evidence: { ...evidence(), artifactHash: 'a'.repeat(64) }, frozenThreshold: WP007I_FROZEN_THRESHOLD }), /artifact_mismatch/);
});

test('high SAFE evidence is positive EF3 evidence and low SAFE never becomes human authorship', () => {
  const high = createSelectiveSafeSnapshot({ evidence: evidence({ rawScore: 0.99 }), frozenThreshold: WP007I_FROZEN_THRESHOLD });
  const low = createSelectiveSafeSnapshot({ evidence: evidence({ rawScore: 0.01 }), frozenThreshold: WP007I_FROZEN_THRESHOLD });
  assert.equal(high.resolution, 'HIGH_SYNTHETIC_EVIDENCE');
  assert.equal(low.resolution, 'LOW_SYNTHETIC_EVIDENCE');
  assert.notEqual(low.resolution, 'HUMAN_AUTHORED');
  assert.notEqual(high.resolution, 'HUMAN_AUTHORED');
});

test('applicability is independent of SAFE score and degraded low scores are inconclusive', () => {
  const low = createSafeEvidence({ status: 'OK', rawScore: 0.01, facts: facts({ inputRegime: 'HEAVILY_RECOMPRESSED', doubleCompressionIndicator: true }), calibration: profile });
  const high = createSafeEvidence({ status: 'OK', rawScore: 0.99, facts: facts({ inputRegime: 'HEAVILY_RECOMPRESSED', doubleCompressionIndicator: true }), calibration: profile });
  assert.deepEqual(low.applicability, high.applicability);
  assert.equal(low.applicability, 'LOW');
  assert.equal(createSelectiveSafeSnapshot({ evidence: low, frozenThreshold: WP007I_FROZEN_THRESHOLD }).resolution, 'INCONCLUSIVE_DUE_TO_INPUT_REGIME');
  assert.equal(createSelectiveSafeSnapshot({ evidence: high, frozenThreshold: WP007I_FROZEN_THRESHOLD }).resolution, 'INCONCLUSIVE_DUE_TO_INPUT_REGIME');
  assert.equal(classifySafeApplicability(facts({ metadataPresent: false })).applicability, 'HIGH');
});

test('JPEG, screenshot, metadata and EF2 facts do not alter SAFE score or become synthetic evidence', () => {
  const safe = evidence({ rawScore: 0.9, facts: facts({ inputRegime: 'SCREENSHOT_LIKELY', screenshotIndicator: true, metadataPresent: false, cameraEvidence: true }) });
  assert.equal(safe.rawScore, 0.9);
  assert.equal(safe.evidenceLevel, 'INCONCLUSIVE_APPLICABILITY');
  assert.equal(Object.hasOwn(safe, 'cameraEvidence'), false);
  assert.equal(Object.hasOwn(safe, 'moderation'), false);
  assert.equal(Object.hasOwn(safe, 'observer'), false);
  assert.equal(Object.hasOwn(safe, 'judge'), false);
});

test('strong EF2 plus strong SAFE preserves a contradiction without cancellation', () => {
  const snapshot = createSelectiveSafeSnapshot({ evidence: evidence({ rawScore: 0.95 }), frozenThreshold: WP007I_FROZEN_THRESHOLD, cameraEvidencePositive: true });
  assert.equal(snapshot.resolution, 'CONFLICTING_CAMERA_AND_SYNTHETIC_EVIDENCE');
  assert.equal(snapshot.rawScore, 0.95);
});

test('missing, timeout, and invalid SAFE states fail closed', () => {
  for (const status of ['UNAVAILABLE', 'TIMEOUT', 'ERROR']) {
    const snapshot = createSelectiveSafeSnapshot({ evidence: evidence({ status, rawScore: null }), frozenThreshold: WP007I_FROZEN_THRESHOLD });
    assert.equal(snapshot.resolution, 'MODEL_UNAVAILABLE');
  }
  assert.throws(() => evidence({ status: 'OK', rawScore: 2 }), /raw_score_invalid/);
});

test('public selective view omits the internal raw score and snapshots are deterministic', () => {
  const input = { evidence: evidence({ rawScore: 0.77 }), frozenThreshold: WP007I_FROZEN_THRESHOLD, contentSha256: 'b'.repeat(64), timestamp: '2026-09-17T00:00:00.000Z' };
  const one = createSelectiveSafeSnapshot(input);
  const two = createSelectiveSafeSnapshot(input);
  assert.deepEqual(one, two);
  assert.equal(Object.hasOwn(publicSelectiveSafeView(one), 'rawScore'), false);
  assert.equal(Object.hasOwn(publicSelectiveSafeView(one), 'artifactHash'), true);
});

test('WP007I rejects FLUX.2 families before any media access', () => {
  assert.doesNotThrow(() => assertWp007iGeneratorFamilyAllowed('FLUX.1-public'));
  for (const family of ['FLUX.2-dev', 'FLUX.2-klein-4B', 'flux2-klein-9B']) {
    assert.throws(() => assertWp007iGeneratorFamilyAllowed(family), /flux2_family_denied/);
  }
});
