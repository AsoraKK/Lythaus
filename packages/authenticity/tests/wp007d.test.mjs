import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WP007D_BENCHMARK_FINGERPRINT,
  WP007D_PROXY_GENERATORS,
  WP007D_PROXY_PROMPT,
  WP007D_STRENGTHS,
  WP007D_WP007AHR4_HOLDOUT_FREEZE_SHA,
  WP007D_FLUX2_RESERVE_FREEZE_SHA,
  assertWp007dGeneratedRecord,
  assertWp007dPlan,
  classifyRuntimeTier,
  deriveProxySeed,
  familyBalancedWeights,
  proxyRequestBody,
} from '../src/wp007d.ts';

function source(index) {
  return {
    sampleId: `SOURCE_${String(index).padStart(3, '0')}`,
    sourceFamilyId: `FAMILY_${String(index).padStart(3, '0')}`,
    sourceType: index < 36 ? 'CAMERA' : 'DIGITAL_NON_AI',
    sourceRole: 'PAIR_BASE_TRAINING_ELIGIBLE',
    rights: { trainingEligibility: 'TRAINING_ALLOWED_EXPLICIT' },
    file: { sha256: String(index).padStart(64, '0'), width: 512, height: 512, format: 'PNG' },
    canonicalSha256: String(index + 1000).padStart(64, '0'),
  };
}

function plan() {
  return {
    schemaVersion: 'lythaus-wp007d-paired-proxy-plan-v1',
    baseSha: 'a'.repeat(40),
    benchmarkFingerprint: WP007D_BENCHMARK_FINGERPRINT,
    historicalFreezeSha256: 'b'.repeat(64),
    holdoutFreezeSha256: WP007D_WP007AHR4_HOLDOUT_FREEZE_SHA,
    flux2ReserveFreezeSha256: WP007D_FLUX2_RESERVE_FREEZE_SHA,
    prompt: WP007D_PROXY_PROMPT,
    sources: Array.from({ length: 60 }, (_, index) => source(index)),
    generators: structuredClone(WP007D_PROXY_GENERATORS),
    strengths: [...WP007D_STRENGTHS],
    requested: 360,
    costCapUsd: 1,
    holdoutPixelAccess: false,
    flux2PixelAccess: false,
  };
}

test('proxy seed derivation is deterministic and route-specific', () => {
  const seed = deriveProxySeed('FAMILY_001', WP007D_PROXY_GENERATORS[0].modelId, 0.3);
  assert.equal(seed, deriveProxySeed('FAMILY_001', WP007D_PROXY_GENERATORS[0].modelId, 0.3));
  assert.notEqual(seed, deriveProxySeed('FAMILY_001', WP007D_PROXY_GENERATORS[1].modelId, 0.3));
  assert.notEqual(seed, deriveProxySeed('FAMILY_001', WP007D_PROXY_GENERATORS[0].modelId, 0.5));
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
});

test('img2img request is fixed, seeded, and excludes forbidden routes', () => {
  const body = proxyRequestBody({ modelId: WP007D_PROXY_GENERATORS[0].modelId, imageB64: 'aGVsbG8=', strength: 0.3, seed: 7 });
  assert.equal(body.prompt, WP007D_PROXY_PROMPT);
  assert.equal(body.strength, 0.3);
  assert.equal(body.seed, 7);
  assert.equal(body.image_b64, 'aGVsbG8=');
  assert.equal(body.width, 512);
  assert.equal(body.height, 512);
  assert.equal(body.num_steps, 20);
  assert.equal(Object.hasOwn(body, 'flux1'), false);
  assert.throws(() => proxyRequestBody({ modelId: '@cf/black-forest-labs/flux-1-schnell', imageB64: 'a', strength: 0.3, seed: 1 }), /model_not_authorized/);
});

test('runtime tiers and family-balanced weights are deterministic', () => {
  assert.equal(classifyRuntimeTier(1, 5), 'FAST');
  assert.equal(classifyRuntimeTier(5.1, 20), 'MODERATE');
  assert.equal(classifyRuntimeTier(20.1, 60), 'SLOW');
  assert.equal(classifyRuntimeTier(60.1, 60.1), 'NOT_PRACTICAL');
  assert.deepEqual(familyBalancedWeights(['A', 'B', 'C']), [1 / 3, 1 / 3, 1 / 3]);
  assert.throws(() => familyBalancedWeights(['A', 'A']), /duplicate/);
});

test('plan assertions allow safe holdout field names but reject FLUX routes', () => {
  assert.doesNotThrow(() => assertWp007dPlan(plan()));
  const invalid = plan();
  invalid.generators[0] = { ...invalid.generators[0], modelId: '@cf/black-forest-labs/flux-1-schnell' };
  assert.throws(() => assertWp007dPlan(invalid), /generator_set_invalid|flux_generator_forbidden/);
});

test('generated proxy records require an explicit submitted-seed provenance state', () => {
  const record = {
    sampleId: 'PROXY_001',
    sourceFamilyId: 'FAMILY_001',
    generatorModelId: WP007D_PROXY_GENERATORS[0].modelId,
    generatorFamily: WP007D_PROXY_GENERATORS[0].modelFamily,
    strength: '0.30',
    prompt: WP007D_PROXY_PROMPT,
    seedState: 'DERIVED_DOCUMENTED_SEED_SUBMITTED',
    originTruth: 'GENERATIVE_DERIVED_PROXY',
    trainingRole: 'PAIRED_GENERATIVE_PROXY',
    canonicalSourceSha256: 'c'.repeat(64),
    file: { sha256: 'd'.repeat(64) },
  };
  assert.doesNotThrow(() => assertWp007dGeneratedRecord(record));
  assert.throws(() => assertWp007dGeneratedRecord({ ...record, seedState: 'RANDOM' }), /seed_state_invalid/);
  assert.throws(() => assertWp007dGeneratedRecord({ ...record, absolutePath: 'C:\\private\\x.png' }), /private_field/);
});
