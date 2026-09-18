import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const wp = path.join(root, 'research', 'wp007k');

async function read(name) {
  return JSON.parse(await readFile(path.join(wp, name), 'utf8'));
}

test('WP007K preserves frozen SAFE-A identity and threshold', async () => {
  const audit = await read('current-state-audit.json');
  const ledger = await read('WP007K_GOAL_AND_COMPLETION_LEDGER.json');
  assert.equal(audit.safe.checkpointSha256, 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e');
  assert.equal(audit.safe.threshold, 0.5864923000335693);
  assert.equal(ledger.globalControls.safeAWeightsModified, false);
  assert.equal(ledger.globalControls.safeAPreprocessingModified, false);
  assert.equal(ledger.globalControls.safeAThresholdModified, false);
});

test('CES-E is input context only and never authorship truth', async () => {
  const specification = await read('ces-e-specification.json');
  const results = await read('ces-e-confirmation-results-v2.json');
  assert.equal(specification.role, 'EF1_EF4_INPUT_REGIME_CONTEXT');
  assert.equal(results.cannotEmitAuthenticity, true);
  assert.deepEqual(Object.keys(results.stateCounts).sort(), ['LIMITED', 'UNSUPPORTED']);
  assert.equal(results.records.some((row) => Object.keys(row).some((key) => /ai|human|authorship/i.test(key))), false);
});

test('CES-S low or unavailable evidence never becomes human evidence', async () => {
  const modelCard = await read('ces-s-model-card.json');
  const specification = await read('ces-e-specification.json');
  assert.equal(modelCard.qualificationStatus, 'NOT_QUALIFIED');
  assert.match(specification.rules.join(' '), /SAFE low on unsupported input is INCONCLUSIVE/);
  assert.equal(modelCard.notAProductionModel, true);
});

test('held-out replay is deterministic and confirmation remained untuned', async () => {
  const replay = await read('ces-s-independent-replay.json');
  const summary = await read('ces-s-confirmation-results.json');
  const training = await read('ces-s-training-manifest.json');
  assert.equal(replay.pass, true);
  assert.equal(replay.thresholdMismatchCount, 0);
  assert.equal(summary.confirmationUntuned, true);
  assert.equal(training.confirmationExposedDuringFit, false);
});

test('encoder and generator holdouts remain explicit', async () => {
  const encoders = await read('encoder-leave-one-out.json');
  const generators = await read('generator-leave-one-out.json');
  assert.equal(encoders.experiments.length, 2);
  assert.deepEqual(new Set(encoders.experiments.map((row) => row.heldOutEncoder)), new Set(['PILLOW_LIBJPEG', 'SHARP_LIBVIPS']));
  assert.equal(generators.heldOutFamilies.length, 7);
  assert.equal(generators.zeroRecallFamilyCount >= 1, true);
});

test('all materialized inspector checks and independent decoder cross-checks pass', async () => {
  const validation = await read('jpeg-inspector-validation-wp007k.json');
  assert.equal(validation.recordCount, 3656);
  assert.equal(validation.mismatchCount, 0);
  for (const [key, value] of Object.entries(validation.counters)) assert.equal(value, validation.recordCount, key);
  assert.equal(validation.currentByteFactsOnly, true);
});

test('source-level specificity and rescue artifacts retain bounded denominators', async () => {
  const hard = await read('hard-negative-analysis.json');
  const rescue = await read('safe-vs-ces-unique-rescue.json');
  assert.equal(hard.overall.sourceLevelWorstCaseFpr.denominator, 836);
  assert.equal(hard.overall.fp, 7);
  assert.equal(rescue.uniqueRescue.cesSUniqueCorrect, 142);
  assert.equal(rescue.uniqueRescue.cesSFalsePositiveSafeNegative, 6);
});

test('FLUX.2 remains sealed and no production change is recorded', async () => {
  const seal = await read('flux2-zero-access.json');
  const ledger = await read('WP007K_GOAL_AND_COMPLETION_LEDGER.json');
  assert.equal(seal.pixelAccess, false);
  assert.equal(seal.providerCalls, 0);
  assert.equal(ledger.globalControls.flux2PixelAccess, false);
  assert.equal(ledger.globalControls.flux2ProviderCalls, 0);
  assert.equal(ledger.globalControls.productionChanged, false);
});

test('model rights class is explicit and research-only', async () => {
  const training = await read('ces-s-training-manifest.json');
  const card = await read('ces-s-model-card.json');
  assert.equal(training.rightsClass, 'RESEARCH_ONLY_NOT_DEPLOYABLE');
  assert.equal(card.rightsClass, 'RESEARCH_ONLY_NOT_DEPLOYABLE');
});
