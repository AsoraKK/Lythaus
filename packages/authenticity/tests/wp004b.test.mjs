import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EPISTEMIC_DIRECTIONS,
  EPISTEMIC_VIOLATION_CODES,
  JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
  JUDGE_EPISTEMIC_POLICY_VERSION,
  buildEvidenceDirectionPolicy,
  createWp004bAdversarialCases,
  evaluateJudgeEpistemics,
} from '../src/wp004b.ts';

const cases = createWp004bAdversarialCases();

test('WP004B direction vocabulary and evaluator schema are versioned', () => {
  assert.deepEqual(EPISTEMIC_DIRECTIONS, ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL', 'UNVALIDATED']);
  assert.equal(JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION, 'lythaus-judge-epistemic-evaluation-v1');
  assert.equal(JUDGE_EPISTEMIC_POLICY_VERSION, 'lythaus-judge-epistemic-policy-v1');
  assert.ok(EPISTEMIC_VIOLATION_CODES.includes('EVIDENCE_DIRECTIONALITY_UNSUPPORTED'));
});

test('deterministic adversarial fixture matrix produces its expected epistemic outcomes', () => {
  assert.equal(cases.length, 24);
  for (const fixture of cases) {
    const result = evaluateJudgeEpistemics(fixture.packet, fixture.candidate);
    assert.deepEqual([...result.violations].sort(), [...fixture.expectedViolationCodes].sort(), fixture.caseId);
    assert.equal(result.valid, fixture.expectedViolationCodes.length === 0, fixture.caseId);
    assert.ok(fixture.allowedInference.length > 0, fixture.caseId);
    assert.equal(fixture.expectedEvaluation, fixture.expectedViolationCodes.length === 0 ? 'VALID' : 'EPISTEMIC_VIOLATION', fixture.caseId);
    assert.equal(result.schemaVersion, JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION);
  }
});

test('current EF1 is neutral, EF2/EF4 are unvalidated, and unavailable EF3/EF5 remain absent', () => {
  const missing = cases.find((fixture) => fixture.caseId === 'missing-exif');
  const policy = buildEvidenceDirectionPolicy(missing.packet);
  assert.equal(policy.find((item) => item.evidenceId === 'missing-exif:ef1').calibrationStatus, 'NONDISCRIMINATIVE');
  const spectral = cases.find((fixture) => fixture.caseId === 'low-spectral');
  assert.equal(buildEvidenceDirectionPolicy(spectral.packet).find((item) => item.evidenceId === 'low-spectral:ef4').calibrationStatus, 'UNCALIBRATED');
  const observer = cases.find((fixture) => fixture.caseId === 'observer-anomaly');
  assert.equal(buildEvidenceDirectionPolicy(observer.packet).find((item) => item.evidenceId === 'observer-anomaly:observation').family, 'VISION_OBSERVATION');
  assert.equal(buildEvidenceDirectionPolicy(observer.packet).find((item) => item.evidenceId === 'observer-anomaly:observation').directionByHypothesis.SYNTHETIC, 'NEUTRAL');
  assert.equal(spectral.packet.evidenceFamilies.EF3_GENERATIVE_FORENSICS.status, 'UNAVAILABLE');
  assert.equal(spectral.packet.evidenceFamilies.EF5_RECONSTRUCTION_LOCAL_MANIPULATION.status, 'UNAVAILABLE');
});

test('a good PARTIAL recommendation can abstain without supporting nondirectional evidence', () => {
  const fixture = cases.find((item) => item.caseId === 'partial-overconfidence');
  const good = { ...fixture.candidate, primaryHypothesis: 'INSUFFICIENT_EVIDENCE', uncertainty: 'VERY_HIGH', rationale: 'EF3 and EF5 are unavailable; remaining measurements are not directionally calibrated.' };
  const result = evaluateJudgeEpistemics(fixture.packet, good);
  assert.equal(result.schemaValid, true);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.includes('PARTIAL_PACKET_REQUIRES_EPISTEMIC_CAUTION'));
});

test('camera acquisition and synthetic depicted-content axes can coexist', () => {
  const fixture = cases.find((item) => item.caseId === 'camera-capture-synthetic');
  const result = evaluateJudgeEpistemics(fixture.packet, fixture.candidate);
  assert.equal(result.valid, true);
  assert.equal(fixture.packet.originAxes.cameraEvidence, 'CAMERA_NATIVE_LIKELY');
  assert.equal(fixture.packet.originAxes.syntheticEvidence, 'STRONG_SYNTHETIC_EVIDENCE');
});

test('schema-invalid unknown and safety references remain hard failures', () => {
  for (const id of ['unknown-reference', 'safety-reference']) {
    const fixture = cases.find((item) => item.caseId === id);
    const result = evaluateJudgeEpistemics(fixture.packet, fixture.candidate);
    assert.equal(result.schemaValid, false, id);
    assert.equal(result.valid, false, id);
    assert.ok(result.violations.length > 0, id);
  }
});

test('the evaluator never changes Evidence Packet v1 or grants authority', () => {
  for (const fixture of cases) {
    const before = JSON.stringify(fixture.packet);
    evaluateJudgeEpistemics(fixture.packet, fixture.candidate);
    assert.equal(JSON.stringify(fixture.packet), before, fixture.caseId);
    assert.equal(fixture.packet.enforcementAuthority, false);
    assert.equal(Object.hasOwn(fixture.packet, 'groundTruth'), false);
  }
});
