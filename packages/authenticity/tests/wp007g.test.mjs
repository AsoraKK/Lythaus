import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DYNAMIC_EVIDENCE_COMPILER_VERSION,
  compileDynamicSyntheticEvidence,
  empiricalNegativeCdf,
  twoTailedEvidence,
} from '../src/wp007g.ts';

function detector(overrides = {}) {
  return {
    detectorId: 'SPAI_C512', detectorVersion: 'wp007g-test', evidenceFamily: 'EF3_SPECTRAL_SYNTHETIC',
    correlationGroup: 'SPAI_SPECTRAL', rawScore: 0.9, rawScoreDirection: 'HIGHER_SYNTHETIC',
    calibratedStrength: null, supportLevel: 'NEUTRAL', thresholdProfileVersion: null,
    preprocessingVersion: 'test', modelHash: 'a'.repeat(64), runtimeMs: 1, status: 'OK', warnings: [],
    ...overrides,
  };
}

function calibration(overrides = {}) {
  return {
    calibrationVersion: 'wp007g-test-calibration',
    negativeProfiles: [
      { detectorId: 'SPAI_C512', negativeRawScores: [0.1, 0.2, 0.3, 0.4] },
      { detectorId: 'RINE', negativeRawScores: [0.1, 0.2, 0.3, 0.4] },
      { detectorId: 'UNIVERSAL_FAKE_DETECT', negativeRawScores: [0.1, 0.2, 0.3, 0.4] },
    ],
    intercept: 0,
    coefficients: { SPAI_SPECTRAL_HIGH_TAIL: 2, CLIP_GENERATIVE_HIGH_TAIL: 2, CLIP_BOTH_HIGH: 1 },
    bandThresholds: { moderate: 25, high: 55, veryHigh: 80 },
    ...overrides,
  };
}

test('empirical CDF and both tails are deterministic and bounded', () => {
  assert.equal(empiricalNegativeCdf(0.3, [0.1, 0.2, 0.3, 0.4]), 0.75);
  assert.deepEqual(twoTailedEvidence(0.4, [0.1, 0.2, 0.3, 0.4]), { cdf: 1, highTail: 1, lowTail: 0 });
  assert.deepEqual(twoTailedEvidence(0.1, [0.1, 0.2, 0.3, 0.4]), { cdf: 0.25, highTail: 0, lowTail: 0.5 });
});

test('v2 output contract reports group evidence and correlation caps', () => {
  const result = compileDynamicSyntheticEvidence({
    detectors: [
      detector({ detectorId: 'RINE', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE' }),
      detector({ detectorId: 'UNIVERSAL_FAKE_DETECT', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE', rawScore: 0.8 }),
    ],
    calibration: calibration({ coefficients: { CLIP_GENERATIVE_HIGH_TAIL: 100, CLIP_BOTH_HIGH: 100 } }),
  });
  assert.equal(result.compilerVersion, DYNAMIC_EVIDENCE_COMPILER_VERSION);
  assert.equal(result.groupEvidence.length, 1);
  assert.equal(result.groupEvidence[0].correlationGroup, 'CLIP_GENERATIVE');
  assert.equal(result.groupEvidence[0].contribution, result.groupEvidence[0].contributionCap);
  assert.ok(result.featureVector.CLIP_BOTH_HIGH >= 0);
});

test('signed coefficients may be negative without hand-reversing detector labels', () => {
  const result = compileDynamicSyntheticEvidence({
    detectors: [detector({ rawScore: 0.4 })],
    calibration: calibration({ intercept: 2, coefficients: { SPAI_SPECTRAL_HIGH_TAIL: -3 } }),
  });
  assert.equal(result.syntheticEvidenceResolution, 'NEUTRAL');
  assert.ok(result.syntheticEvidenceScore < 55);
});

test('missing detector evidence is explicit and never negative evidence', () => {
  const result = compileDynamicSyntheticEvidence({
    detectors: [detector({ detectorId: 'RINE', rawScore: null, status: 'TIMEOUT' })],
    calibration: calibration(),
  });
  assert.deepEqual(result.missingDetectors, ['RINE']);
  assert.equal(result.syntheticEvidenceResolution, 'INSUFFICIENT');
  assert.equal(result.featureVector.RINE_MISSING, 1);
});

test('strong camera evidence preserves a synthetic contradiction', () => {
  const result = compileDynamicSyntheticEvidence({
    detectors: [detector()],
    calibration: calibration({ intercept: 10, coefficients: {} }),
    cameraEvidence: { positive: true, strength: 0.9 },
  });
  assert.equal(result.syntheticEvidenceResolution, 'CONFLICTING');
});

test('safety, observer, and adjudicator are outside the numeric compiler', () => {
  const result = compileDynamicSyntheticEvidence({ detectors: [detector()], calibration: calibration() });
  assert.equal(result.moderationWasUsed, false);
  assert.equal(result.observerWasUsed, false);
  assert.equal(result.adjudicatorWasUsed, false);
});
