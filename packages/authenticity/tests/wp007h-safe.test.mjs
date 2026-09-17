import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAFE_CHECKPOINT_SHA256,
  SAFE_PREPROCESSING_VERSION,
  SAFE_SPECIALIST_CANDIDATE,
  classifySafeApplicability,
  createSafeEvidence,
  safeEvidenceCanSupportSynthetic,
} from '../src/wp007h.ts';

const profile = {
  profileVersion: 'wp007h-safe-frozen-test-v1',
  artifactHash: SAFE_CHECKPOINT_SHA256,
  preprocessingVersion: SAFE_PREPROCESSING_VERSION,
  frozenSyntheticThreshold: 0.5864923000335693,
  thresholdProvenance: 'WP007G-R1 SAFE threshold; fixed before WP007H confirmation scoring',
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

test('SAFE specialist evidence requires and preserves the frozen artifact contract', () => {
  const result = createSafeEvidence({ status: 'OK', rawScore: 0.97, runtimeMs: 12, facts: facts(), calibration: profile });
  assert.equal(result.detectorId, SAFE_SPECIALIST_CANDIDATE);
  assert.equal(result.artifactHash, SAFE_CHECKPOINT_SHA256);
  assert.equal(result.preprocessingVersion, SAFE_PREPROCESSING_VERSION);
  assert.equal(result.scoreInterpretation, 'ABOVE_FROZEN_THRESHOLD');
  assert.equal(result.evidenceLevel, 'STRONG_SYNTHETIC_SUPPORT');
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => { result.rawScore = 0.1; }, TypeError);
});

test('invalid, unavailable and timeout results fail closed without becoming low synthetic evidence', () => {
  assert.throws(() => createSafeEvidence({ status: 'OK', rawScore: 2, facts: facts(), calibration: profile }), /safe_raw_score_invalid/);
  for (const status of ['UNAVAILABLE', 'TIMEOUT', 'ERROR']) {
    const result = createSafeEvidence({ status, rawScore: null, facts: facts(), calibration: profile });
    assert.equal(result.evidenceLevel, 'INCONCLUSIVE_NO_SCORE');
    assert.equal(safeEvidenceCanSupportSynthetic(result), false);
    assert.ok(result.limitations.some((item) => item.includes('missingness')));
  }
});

test('compression and resampling reduce applicability but never create synthetic evidence', () => {
  assert.equal(classifySafeApplicability(facts({ inputRegime: 'HEAVILY_RECOMPRESSED', doubleCompressionIndicator: true })).applicability, 'LOW');
  assert.equal(classifySafeApplicability(facts({ inputRegime: 'RESAMPLED', resamplingIndicator: true })).applicability, 'MODERATE');
  assert.equal(classifySafeApplicability(facts({ inputRegime: 'SCREENSHOT_LIKELY', screenshotIndicator: true })).applicability, 'LOW');
  const result = createSafeEvidence({ status: 'OK', rawScore: 0.99, facts: facts({ inputRegime: 'SCREENSHOT_LIKELY', screenshotIndicator: true }), calibration: profile });
  assert.equal(result.evidenceLevel, 'INCONCLUSIVE_APPLICABILITY');
  assert.equal(safeEvidenceCanSupportSynthetic(result), false);
});

test('metadata absence alone does not mean AI and high applicability preserves low-score evidence', () => {
  const applicability = classifySafeApplicability(facts({ metadataPresent: false, metadataMissing: true }));
  assert.equal(applicability.applicability, 'HIGH');
  assert.ok(applicability.reasons.some((item) => item.includes('metadata absence')));
  const result = createSafeEvidence({ status: 'OK', rawScore: 0.05, facts: facts({ metadataPresent: false, metadataMissing: true }), calibration: profile });
  assert.equal(result.evidenceLevel, 'MEANINGFUL_LOW_SYNTHETIC_SIGNAL');
  assert.equal(result.inputRegime, 'ORIGINAL_OR_HIGH_QUALITY');
});

test('SAFE record does not accept EF2, Safety, Observer, Judge, or supporter votes', () => {
  const safe = createSafeEvidence({ status: 'OK', rawScore: 0.9, facts: { ...facts(), cameraEvidence: true, moderation: 'BLOCK', observer: 'screen' }, calibration: profile });
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'cameraEvidence'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'moderation'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'observer'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'judge'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'supporterScores'), false);
});

test('input regime and shadow-supporter data cannot mutate the SAFE raw score', () => {
  const safe = createSafeEvidence({ status: 'OK', rawScore: 0.42, facts: facts({ inputRegime: 'RESAMPLED', resamplingIndicator: true }), calibration: profile });
  assert.equal(safe.rawScore, 0.42);
  assert.equal(safe.applicability, 'MODERATE');
  assert.equal(safeEvidenceCanSupportSynthetic(safe), false);
});
