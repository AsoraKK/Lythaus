import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidencePacket } from '../src/evidence-packet.ts';
import {
  analyzeAlphaEvidence,
  attachDetectorEvidence,
  runAlphaDetectorCascade,
} from '../src/alpha.ts';

function detector(overrides = {}) {
  return {
    id: 'SPAI_C512',
    version: 'wp007f-v1',
    evidenceFamily: 'EF3_SPECTRAL_SYNTHETIC',
    correlationGroup: 'SPAI_SPECTRAL',
    modelHash: 'a'.repeat(64),
    preprocessingVersion: 'c512-v1',
    infer: async () => ({
      detectorId: 'SPAI_C512',
      detectorVersion: 'wp007f-v1',
      evidenceFamily: 'EF3_SPECTRAL_SYNTHETIC',
      correlationGroup: 'SPAI_SPECTRAL',
      rawScore: 0.9,
      rawScoreDirection: 'HIGHER_SYNTHETIC',
      calibratedStrength: 0.9,
      supportLevel: 'STRONG_SUPPORT',
      thresholdProfileVersion: 'alpha-v1',
      preprocessingVersion: 'c512-v1',
      modelHash: 'a'.repeat(64),
      runtimeMs: 2,
      status: 'SHADOW_ONLY',
      warnings: [],
    }),
    ...overrides,
  };
}

test('alpha cascade preserves successful evidence and records timeout', async () => {
  const slow = detector({ id: 'RINE', infer: () => new Promise(() => {}) });
  const results = await runAlphaDetectorCascade({ detectors: [detector(), slow], image: {}, timeoutMs: 5 });
  assert.equal(results[0].status, 'SHADOW_ONLY');
  assert.equal(results[1].status, 'TIMEOUT');
});

test('shadow mode never emits a visible authenticity label', () => {
  const result = analyzeAlphaEvidence({ mode: 'SHADOW', detectors: [] });
  assert.equal(result.visibleLabel, 'Under review');
  assert.equal(result.analysisStatus, 'COMPLETE');
});

test('off mode performs no detector analysis', () => {
  const result = analyzeAlphaEvidence({ mode: 'OFF', detectors: [] });
  assert.equal(result.analysisStatus, 'DISABLED');
  assert.equal(result.visibleLabel, null);
  assert.deepEqual(result.detectors, []);
});

test('detector evidence attaches to EF3 without changing safety context', () => {
  const packet = buildEvidencePacket({
    runId: 'run', caseId: 'case', sampleId: 'sample', sourceFamilyId: 'family',
    preflight: { inputHash: 'b'.repeat(64), mime: 'image/png', dimensions: null },
  });
  const updated = attachDetectorEvidence(packet, [detector().infer ? {
    detectorId: 'SPAI_C512', detectorVersion: 'wp007f-v1', evidenceFamily: 'EF3_SPECTRAL_SYNTHETIC', correlationGroup: 'SPAI_SPECTRAL', rawScore: 0.9,
    rawScoreDirection: 'HIGHER_SYNTHETIC', calibratedStrength: 0.9, supportLevel: 'STRONG_SUPPORT', thresholdProfileVersion: 'alpha-v1', preprocessingVersion: 'c512-v1', modelHash: 'a'.repeat(64), runtimeMs: 2, status: 'SHADOW_ONLY', warnings: [],
  } : null]);
  assert.equal(updated.evidenceFamilies.EF3_GENERATIVE_FORENSICS.status, 'AVAILABLE');
  assert.equal(updated.safetyContext.canonicalResult, 'NOT_RUN');
  assert.equal(updated.evidence.length, packet.evidence.length + 1);
});
