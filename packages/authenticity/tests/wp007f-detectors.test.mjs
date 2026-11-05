import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIDENCE_COMPILER_VERSION,
  compileSyntheticEvidence,
  createDecisionSnapshot,
  createDetectorRegistry,
  replaceDetectorInRegistry,
  resolveAlphaAuthenticityLabel,
} from '../src/detectors.ts';

function evidence(overrides = {}) {
  return {
    detectorId: 'SPAI_C512', detectorVersion: 'v1', evidenceFamily: 'EF3_SPECTRAL_SYNTHETIC',
    correlationGroup: 'SPAI_SPECTRAL', rawScore: 0.9, rawScoreDirection: 'HIGHER_SYNTHETIC',
    calibratedStrength: 0.9, supportLevel: 'STRONG_SUPPORT', thresholdProfileVersion: 'cal-v1',
    preprocessingVersion: 'c512-v1', modelHash: 'a'.repeat(64), runtimeMs: 400,
    status: 'OK', warnings: [], ...overrides,
  };
}

const registryEntry = (id, group = 'SPAI_SPECTRAL') => ({
  detectorId: id, displayName: id, enabled: true, shadowMode: false,
  evidenceFamily: group === 'CLIP_GENERATIVE' ? 'EF3_LEARNED_SYNTHETIC' : 'EF3_SPECTRAL_SYNTHETIC',
  correlationGroup: group, adapterVersion: 'adapter-v1', checkpointHash: 'b'.repeat(64),
  checkpointLicense: 'research', inputPolicy: 'pixels-only', runtimeBudgetMs: 5000,
  calibrationProfile: 'cal-v1', weightCapBytes: 1_000_000, replacementFor: null,
  introducedAt: '2026-09-16T00:00:00.000Z', retiredAt: null,
});

test('one detector yields bounded evidence without becoming two independent families', () => {
  const compiled = compileSyntheticEvidence({ detectors: [evidence()] });
  assert.equal(compiled.compilerVersion, EVIDENCE_COMPILER_VERSION);
  assert.equal(compiled.syntheticEvidenceScore, 31.5);
  assert.equal(compiled.distinctEvidenceFamilies.length, 1);
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: compiled }), 'Under review');
});

test('correlated CLIP detectors share one capped group contribution', () => {
  const compiled = compileSyntheticEvidence({ detectors: [
    evidence({ detectorId: 'UNIVERSAL_FAKE_DETECT', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE', calibratedStrength: 1 }),
    evidence({ detectorId: 'RINE', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE', calibratedStrength: 1 }),
  ] });
  assert.equal(compiled.syntheticEvidenceScore, 35);
  assert.deepEqual(compiled.contributingCorrelationGroups, ['CLIP_GENERATIVE']);
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: compiled }), 'Under review');
});

test('SPAI plus CLIP agreement can satisfy the two-family alpha rule', () => {
  const compiled = compileSyntheticEvidence({ detectors: [
    evidence(),
    evidence({ detectorId: 'UNIVERSAL_FAKE_DETECT', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE', calibratedStrength: 0.95 }),
  ] });
  assert.equal(compiled.syntheticEvidenceBand, 'HIGH');
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: compiled }), 'Under review');
  const veryHigh = compileSyntheticEvidence({ detectors: [
    evidence({ calibratedStrength: 1 }),
    evidence({ detectorId: 'UNIVERSAL_FAKE_DETECT', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE', calibratedStrength: 1 }),
  ], reliableSyntheticProvenance: true });
  assert.equal(veryHigh.syntheticEvidenceBand, 'VERY_HIGH');
  assert.equal(veryHigh.syntheticEvidenceScore, 100);
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: veryHigh }), 'AI-generated');
});

test('synthetic and camera evidence remain conflicting, not collapsed', () => {
  const compiled = compileSyntheticEvidence({
    detectors: [evidence({ calibratedStrength: 1 }), evidence({ detectorId: 'UFD', evidenceFamily: 'EF3_LEARNED_SYNTHETIC', correlationGroup: 'CLIP_GENERATIVE', calibratedStrength: 1 })],
    cameraEvidence: { positive: true, strength: 0.95, source: 'EF2' },
  });
  assert.equal(compiled.resolution, 'CONFLICTING');
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: compiled }), 'Under review');
});

test('moderation is explicitly ignored by the authenticity compiler', () => {
  const base = compileSyntheticEvidence({ detectors: [evidence()] });
  const blocked = compileSyntheticEvidence({ detectors: [evidence()], moderation: { result: 'BLOCK' } });
  assert.deepEqual(blocked, base);
  assert.equal(blocked.moderationIgnoredForAuthenticity, true);
});

test('timeouts, errors, and missing detectors are partial evidence, not negative evidence', () => {
  const compiled = compileSyntheticEvidence({ detectors: [evidence({ status: 'TIMEOUT', calibratedStrength: null }), evidence({ detectorId: 'RINE', status: 'ERROR', calibratedStrength: null })], missingEvidence: ['RINE'] });
  assert.equal(compiled.syntheticEvidenceScore, 0);
  assert.equal(compiled.resolution, 'INSUFFICIENT');
  assert.deepEqual(compiled.missingEvidence, ['RINE']);
});

test('registry replacement is versioned and does not mutate the prior registry', () => {
  const original = createDetectorRegistry([registryEntry('SPAI_C512')]);
  const replacement = registryEntry('SPAI_C512');
  replacement.adapterVersion = 'adapter-v2';
  const next = replaceDetectorInRegistry(original, replacement);
  assert.equal(original[0].adapterVersion, 'adapter-v1');
  assert.equal(next[0].adapterVersion, 'adapter-v2');
  assert.throws(() => createDetectorRegistry([registryEntry('D1'), registryEntry('D1')]), /duplicate/);
});

test('snapshot retains model versions, raw scores, compiler version, and label', () => {
  const compiled = compileSyntheticEvidence({ detectors: [evidence()] });
  const snapshot = createDecisionSnapshot({
    contentId: 'content-1', inputFileHash: 'c'.repeat(64), evidencePacketVersion: 'packet-v1',
    detectors: [evidence()], calibrationProfileVersion: 'cal-v1', compiledEvidence: compiled,
    observations: [], advisory: null, policyVersion: 'alpha-v1', finalAlphaLabel: 'Under review',
    timestamp: '2026-09-16T00:00:00.000Z',
  });
  assert.equal(snapshot.compilerVersion, EVIDENCE_COMPILER_VERSION);
  assert.equal(snapshot.detectors[0].rawScore, 0.9);
  assert.equal(snapshot.finalAlphaLabel, 'Under review');
});

test('low detector scores alone never create a Human-authored label', () => {
  const compiled = compileSyntheticEvidence({ detectors: [evidence({ calibratedStrength: -0.9, supportLevel: 'STRONG_CONTRADICTS' })] });
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: compiled }), 'Under review');
  assert.equal(resolveAlphaAuthenticityLabel({ compiledEvidence: compiled, cameraEvidencePositive: true }), 'Human-authored');
});
