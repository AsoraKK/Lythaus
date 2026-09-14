import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  assertNoPrivateArtifactKeys,
  stableArtifactHash,
} from '../src/wp007a.ts';
import {
  assertWp007ahGeneratedRecord,
  assertWp007ahGenerationFreeze,
  assertWp007ahManifest,
  assertWp007ahNoPaidGeneration,
  assertWp007ahNoDetectorResultFields,
  assertWp007ahPixelAccess,
  assertWp007ahPromptSelection,
  assertWp007ahRightsRecord,
  buildWp007ahFingerprintInput,
  deriveWp007ahPromptSeed,
  fingerprintWp007ah,
  selectWp007ahPromptIds,
  WP007AH_EXPECTED_BASE_SHA,
  WP007AH_MODEL_IDS,
  WP007AH_MODEL_ROLES,
  WP007AH_PROMPT_BANK_VERSION,
  WP007AH_WP007A_BENCHMARK_FINGERPRINT,
  wp007ahPromptSelectionHash,
} from '../src/wp007ah.ts';
import { buildWp007ahPlan, runWp007ah } from '../../../scripts/authenticity/wp007ah-cloudflare-holdouts.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const researchDir = path.join(repositoryRoot, 'research', 'wp007ah');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(researchDir, name), 'utf8'));

test('WP007A-H preserves the merged WP007A baseline and historical fingerprint', () => {
  assert.equal(WP007AH_EXPECTED_BASE_SHA, '6543ec6496a4d4b006fb40b6f5de50cfd9e98009');
  assert.equal(WP007AH_WP007A_BENCHMARK_FINGERPRINT, '210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5');
  const report = fs.readFileSync(path.join(repositoryRoot, 'research/wp007a/wp007a-final-report.md'), 'utf8');
  assert.match(report, /FINAL_CLASSIFICATION = WP007A_EF3_CORPUS_PARTIAL/u);
  const historical = readJson('..\\wp007a\\ef3-benchmark-fingerprint.json');
  assert.equal(historical.fingerprintSha256, WP007AH_WP007A_BENCHMARK_FINGERPRINT);
});

test('prompt subset is exactly five prompts per regime and matched across models', async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'research/wp007a/prompt-bank.json'), 'utf8'));
  const subset = readJson('prompt-subset-freeze.json');
  assert.equal(bank.version, WP007AH_PROMPT_BANK_VERSION);
  assert.deepEqual(selectWp007ahPromptIds(bank), subset.promptIds);
  assert.doesNotThrow(() => assertWp007ahPromptSelection(bank, subset.promptIds));
  assert.equal(subset.promptCount, 40);
  assert.equal(subset.samePromptIdsForBothModels, true);
  assert.equal(subset.promptSelectionSha256, wp007ahPromptSelectionHash(WP007AH_PROMPT_BANK_VERSION, subset.promptIds));
  const plan = await buildWp007ahPlan();
  assert.deepEqual(plan.promptIds, subset.promptIds);
});

test('only the two authorized model routes and frozen roles are allowed', () => {
  assert.deepEqual([...WP007AH_MODEL_IDS], [
    '@cf/black-forest-labs/flux-1-schnell',
    '@cf/black-forest-labs/flux-2-klein-4b',
  ]);
  const roles = readJson('holdout-role-manifest.json');
  assert.deepEqual(roles.models.map((model) => model.modelId), [...WP007AH_MODEL_IDS]);
  assert.equal(roles.models[0].benchmarkRole, WP007AH_MODEL_ROLES[WP007AH_MODEL_IDS[0]]);
  assert.equal(roles.models[1].benchmarkRole, 'FUTURE_RESERVE');
  assert.ok(roles.models.every((model) => model.trainingEligibility === 'EVALUATION_ONLY'));
  assert.ok(roles.models.every((model) => !['DEVELOPMENT', 'CALIBRATION_FUTURE'].includes(model.benchmarkRole)));
});

test('rights revalidation preserves evaluation-only training and route separation', () => {
  const rights = readJson('cloudflare-rights-revalidation.json');
  assert.equal(rights.rightsRevalidationStatus, 'PASS_FOR_BOUNDED_HOLDOUT_EVALUATION');
  assert.equal(rights.trainingEligibility, 'EVALUATION_ONLY');
  assert.equal(rights.evaluationEligibility, 'AUTHORIZED_FOR_BOUNDED_HOLDOUT_ONLY');
  assert.equal(rights.publicRedistribution, 'NOT_AUTHORIZED');
  for (const row of rights.models) assert.doesNotThrow(() => assertWp007ahRightsRecord({ ...row, modelId: row.modelId, benchmarkRole: row.benchmarkRole }));
});

test('generation freeze locks exact prompts, roles, retry policy and zero paid cost', () => {
  const freeze = readJson('generation-freeze.json');
  assert.doesNotThrow(() => assertWp007ahGenerationFreeze(freeze));
  assert.equal(freeze.promptIds.length, 40);
  assert.equal(freeze.models.length, 2);
  assert.equal(freeze.maxIncrementalPaidCostUsd, 0);
  assert.equal(freeze.retryPolicy.maxIdenticalTransportRetries, 1);
  assert.equal(freeze.outputCache.insideRepository, false);
});

test('runner freeze hash matches the committed freeze artifact', async () => {
  const freeze = readJson('generation-freeze.json');
  const plan = await buildWp007ahPlan();
  assert.equal(plan.generationFreezeSha256, freeze.freezeSha256);
});

test('truth axes are fixed for whole-image provider outputs and no detector fields are admitted', () => {
  const manifest = readJson('cloudflare-generation-manifest.json');
  assert.doesNotThrow(() => assertWp007ahManifest(manifest));
  assert.equal(manifest.records.length, 0);
  assert.throws(() => assertWp007ahNoDetectorResultFields({ rawScore: 0.5 }), /detector_field/u);
  assert.throws(() => assertWp007ahNoDetectorResultFields({ normalizedMeasurement: 0.5 }), /detector_field/);
});

test('FLUX.2 future reserve is sealed except for materialization integrity validation', () => {
  assert.doesNotThrow(() => assertWp007ahPixelAccess({ modelId: WP007AH_MODEL_IDS[1], purpose: 'MATERIALIZATION_INTEGRITY_VALIDATION' }));
  assert.throws(() => assertWp007ahPixelAccess({ modelId: WP007AH_MODEL_IDS[1], purpose: 'WP007B_EF3_SCORING' }), /holdout_pixel_access_blocked/);
  assert.throws(() => assertWp007ahPixelAccess({ modelId: WP007AH_MODEL_IDS[0], purpose: 'DETECTOR_INFERENCE' }), /holdout_pixel_access_blocked/);
});

test('cost gate fails closed without explicit no-cost allocation evidence', () => {
  assert.throws(() => assertWp007ahNoPaidGeneration({ estimatedCostUsd: 0.080704, freeAllocationConfirmed: false }), /cost_blocked_or_uncertain/);
  assert.doesNotThrow(() => assertWp007ahNoPaidGeneration({ estimatedCostUsd: 0.080704, freeAllocationConfirmed: true }));
});

test('seed derivation is deterministic and model-specific', () => {
  const first = deriveWp007ahPromptSeed(WP007AH_MODEL_IDS[0], 'PROMPT_001');
  assert.equal(first, deriveWp007ahPromptSeed(WP007AH_MODEL_IDS[0], 'PROMPT_001'));
  assert.notEqual(first, deriveWp007ahPromptSeed(WP007AH_MODEL_IDS[1], 'PROMPT_001'));
});

test('default runner performs dry-run only and execute fails before any request without auth', async () => {
  const dryRun = await runWp007ah({ dryRun: true });
  assert.equal(dryRun.status, 'DRY_RUN');
  assert.equal(dryRun.generatedCount, 0);
  assert.equal(dryRun.plan.requestedTotal, 80);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    await assert.rejects(() => runWp007ah({ dryRun: false }), /WP007AH_STATUS=AUTH_BLOCKED/u);
  } finally {
    if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = token;
    if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = account;
  }
});

test('fingerprint input is deterministic and blocked manifest has no committed media', () => {
  const fingerprint = readJson('wp007ah-fingerprint.json');
  assert.equal(fingerprint.fingerprintSha256, stableArtifactHash(fingerprint.canonicalInput));
  const generated = execFileSync('git', ['ls-files', 'research/wp007ah'], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(/\.(?:png|jpe?g|webp|gif|avif)$/imu.test(generated), false);
  assert.equal(fingerprint.sourceMediaCommitted, false);
  assert.equal(fingerprint.detectorInferenceRun, false);
});

test('WP007A-H artifacts are privacy-safe and explicitly record the terminal blocker', () => {
  for (const name of fs.readdirSync(researchDir)) {
    if (!name.endsWith('.json')) continue;
    const value = readJson(name);
    assert.doesNotThrow(() => assertNoPrivateArtifactKeys(value), name);
    const content = fs.readFileSync(path.join(researchDir, name), 'utf8');
    assert.equal(/(^|[^A-Za-z0-9_])[A-Za-z]:[\\/]/u.test(content), false, name);
  }
  const report = fs.readFileSync(path.join(researchDir, 'wp007ah-final-report.md'), 'utf8');
  assert.match(report, /WP007AH_STATUS = AUTH_BLOCKED/u);
  assert.match(report, /FINAL_CLASSIFICATION = WP007AH_AUTH_BLOCKED/u);
  const run = readJson('wp007ah-run-manifest.json');
  assert.equal(run.authPreflight.generationCalls, 0);
  assert.equal(run.detectorInferenceCalls, 0);
  assert.equal(run.modelTrainingRuns, 0);
  assert.equal(run.transformationsRun, 0);
  assert.equal(run.mediaCommittedToGit, false);
});
