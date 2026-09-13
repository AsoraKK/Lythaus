import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WP006A_SCHEMA_VERSION,
  assertWp006aRightsSeparation,
  assertWp006aSourceFamilySplits,
  assertWp006aSpecialistResult,
} from '../src/wp006a.ts';

function measurement(overrides = {}) {
  return {
    schemaVersion: WP006A_SCHEMA_VERSION,
    specialistId: 'test-specialist',
    version: 'test-v1',
    evidenceFamily: 'EF3_GENERATIVE_FORENSICS',
    measurementType: 'normalized_score',
    rawScore: 0.25,
    normalizedMeasurement: 0.25,
    region: null,
    applicability: 'applicable',
    runtimeMs: 12,
    limitations: ['unvalidated research measurement'],
    calibrationStatus: 'MEASUREMENT_ONLY',
    provenance: { inputHash: 'a'.repeat(64) },
    ...overrides,
  };
}

test('WP006A specialist results are measurements, not origin decisions', () => {
  assert.doesNotThrow(() => assertWp006aSpecialistResult(measurement()));
  assert.throws(() => assertWp006aSpecialistResult(measurement({ supports: ['SYNTHETIC'] })), /forbidden_field:supports/);
  assert.throws(() => assertWp006aSpecialistResult(measurement({ groundTruth: false })), /forbidden_field:groundTruth/);
  assert.throws(() => assertWp006aSpecialistResult(measurement({ region: { coordinateSpace: 'NORMALIZED', x: 0, y: 0, width: 2, height: 1 } })), /region_invalid/);
});

test('WP006A keeps code, weights, data, evaluation, and commercial rights separate', () => {
  assert.doesNotThrow(() => assertWp006aRightsSeparation({
    codeRights: 'CONFIRMED',
    weightRights: 'UNRESOLVED',
    dataRights: 'REVIEW_REQUIRED',
    evaluationRights: 'CONFIRMED',
    commercialDeploymentRights: 'UNRESOLVED',
  }));
  assert.throws(() => assertWp006aRightsSeparation({ licenseOk: true }), /rights_field_invalid/);
});

test('WP006A rejects source-family split leakage and duplicate samples', () => {
  assert.doesNotThrow(() => assertWp006aSourceFamilySplits([
    { sampleId: 'a', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
    { sampleId: 'b', sourceFamilyId: 'family-b', split: 'HOLDOUT' },
    { sampleId: 'a-variant', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
  ]));
  assert.throws(() => assertWp006aSourceFamilySplits([
    { sampleId: 'a', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
    { sampleId: 'b', sourceFamilyId: 'family-a', split: 'HOLDOUT' },
  ]), /source_family_split_leak/);
  assert.throws(() => assertWp006aSourceFamilySplits([
    { sampleId: 'a', sourceFamilyId: 'family-a', split: 'CALIBRATION' },
    { sampleId: 'a', sourceFamilyId: 'family-b', split: 'HOLDOUT' },
  ]), /duplicate_sample_id/);
});
