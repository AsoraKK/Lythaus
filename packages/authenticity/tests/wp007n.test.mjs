import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const text = p => readFileSync(new URL(p, root), 'utf8');
const co = json('research/wp007n/cohort-freeze.json');
const protocol = json('research/wp007n/protocol.json');

test('WP007N preserves SAFE and research-only boundaries', () => {
  assert.equal(protocol.productionAuthorization, 'NO');
  assert.equal(protocol.flux2Access, 0);
  assert.equal(protocol.futureEf2ReserveAccess, 0);
  assert.match(text('scripts/authenticity/wp007n_core.py'), /SAFE_THRESHOLD = 0\.5864923000335693/);
  assert.match(text('scripts/authenticity/wp007n_core.py'), /b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e/);
});
test('WP007N has source/device/prompt isolated current roles', () => {
  assert.equal(new Set(co.rows.map(r => r.sampleId)).size, co.rows.length);
  for (const key of ['sha256', 'decodedRgbSha256']) assert.equal(new Set(co.rows.map(r => r[key])).size, co.rows.length);
  for (const key of ['splitGroup', 'sourceFamilyId', 'promptGroup', 'physicalDevice']) {
    const roles = new Map();
    for (const r of co.rows.filter(r => r[key])) {
      if (roles.has(r[key])) assert.equal(roles.get(r[key]), r.role);
      roles.set(r[key], r.role);
    }
  }
});
test('WP007N does not relabel historical or procedural populations', () => {
  assert.equal(co.newProgrammeConfirmation, false);
  assert.equal(co.actualHumanDigitalWorks, 0);
  assert.match(co.screenScope, /PHOTOGRAPH_VS_SYNTHETIC/);
  assert.equal(co.rows.filter(r => r.kind === 'PROCEDURAL_SUPPLEMENT').length, 8);
});
test('WP007N fitting never uses historical modern challenges or SAFE labels', () => {
  for (const r of co.rows.filter(r => ['FIT', 'DEV', 'CALIBRATION'].includes(r.role))) {
    assert.equal(r.trainingAllowed, true);
    assert.ok(['CSAFE', 'DDB'].includes(r.rootKey));
    if (r.label) assert.equal(r.generatorFamily, 'STABLE_DIFFUSION_1X_DIFFUSIONDB');
  }
  assert.doesNotMatch(text('scripts/authenticity/wp007n_analysis.py').split('def fit_one')[1].split('def calibration')[0], /safeScore|rawScore|SAFE_THRESHOLD/);
});
test('WP007N fixed response is normalized-space noise, no score reversal', () => {
  assert.equal(protocol.RIGID.noiseLocation, 'AFTER_NORMALIZATION');
  assert.equal(protocol.RIGID.noiseStandardDeviation, 0.05);
  assert.equal(protocol.RIGID.clamping, false);
  assert.deepEqual(protocol.RIGID.stabilityDraws, [0, 1, 2]);
});
test('WP007N explicit current calibration cannot prove one-percent population risk', () => {
  assert.equal(protocol.calibration.parents, 8);
  assert.equal(protocol.calibration.targetFpr, 0.01);
  assert.equal(protocol.advancement.requiredActualHumanDigitalControls, true);
  assert.match(protocol.calibration.rule, /Strict score > maximum/);
});
test('WP007N production/public verdicts remain absent', () => {
  const source = text('scripts/authenticity/wp007n_contracts.py');
  assert.match(source, /RepresentationResponseEvidence/);
  assert.match(source, /FrozenFeatureOriginEvidence/);
  assert.match(source, /"originVerdict":None/);
  assert.doesNotMatch(source, /"publicAuthority":True|return ["']HUMAN["']/);
});
test('WP007N budget, reserve and stale-cache gates exist', () => {
  assert.match(text('scripts/authenticity/wp007n_guards.py'), /ARM_ALREADY_RUNNING/);
  assert.match(text('scripts/authenticity/wp007n_guards.py'), /LEGACY_ROLE_PROHIBITED/);
  assert.match(text('scripts/authenticity/wp007n_guards.py'), /STALE_CALIBRATION/);
  assert.match(text('scripts/authenticity/wp007n_freeze.py'), /RESERVE_PROHIBITED/);
});
