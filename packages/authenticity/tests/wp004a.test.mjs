import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertEvidencePacket,
  assertEvidenceReferenceIds,
  assertGroundTruthResearchManifest,
  assertJudgeRecommendation,
  assertModerationProviderEvidence,
  assertRuntimeResearchManifest,
  assertSafetyIsolation,
  buildEvidencePacket,
  buildJudgeRequest,
  CLOUDFLARE_REASONER_MODEL,
  CLOUDFLARE_VISION_OBSERVER_MODEL,
  createCloudflareJudge,
  createCloudflareVisionObserver,
  createInsufficientEvidenceRecommendation,
  createMockJudge,
  createMockModerationProvider,
  createMockVisionObserver,
  createOpenAIModerationProvider,
  createWp004aAdversarialCases,
  DEFAULT_RESEARCH_MODEL_CONFIG,
  evaluateResearchPredictions,
  generateForensicFeatureBundleV1,
  JUDGE_PROMPT_VERSION,
  OPENAI_MODERATION_MODEL,
  parseGroundTruthResearchManifest,
  parseRuntimeResearchManifest,
  researchModelConfigFromEnvironment,
  runResearchTrial,
  VISION_OBSERVER_PROTOCOL_VERSION,
  VISION_OBSERVER_PROMPT,
} from '../src/wp004a.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CASE_ID = '0198a5d3-4a00-7000-8000-000000000123';

function pngFixture() {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0,
    253, 212, 154, 115,
    0, 0, 0, 15, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 28,
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function moderationResponse(overrides = {}) {
  return {
    id: 'modr-fixture',
    model: OPENAI_MODERATION_MODEL,
    results: [{
      flagged: false,
      categories: { violence: false, sexual: false, 'sexual/minors': false },
      category_scores: { violence: 0.001, sexual: 0, 'sexual/minors': 0 },
      category_applied_input_types: { violence: ['image'], sexual: [], 'sexual/minors': [] },
      ...overrides,
    }],
  };
}

function packet(overrides = {}) {
  return buildEvidencePacket({
    runId: 'fixture-run',
    caseId: CASE_ID,
    sampleId: 'fixture-sample',
    sourceFamilyId: 'fixture-family',
    preflight: { inputHash: 'a'.repeat(64), mime: 'image/png', dimensions: { width: 2, height: 2, pixelCount: 4 } },
    now: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function recommendation(overrides = {}) {
  return {
    schemaVersion: '1',
    primaryHypothesis: 'CAMERA_NATIVE',
    alternativeHypotheses: [],
    supportingEvidence: [],
    contradictoryEvidence: [],
    missingEvidence: [],
    uncertainty: 'HIGH',
    requiresReview: true,
    recommendedAdditionalTests: [],
    rationale: 'Fixture recommendation only.',
    enforcementAuthority: false,
    ...overrides,
  };
}

function manifest(count = 2) {
  return {
    schemaVersion: 'lythaus-wp004a-runtime-manifest-v1',
    manifestType: 'RUNTIME',
    entries: Array.from({ length: count }, (_, index) => ({
      sampleId: `SAMPLE_${index + 1}`,
      sourceFamilyId: `FAMILY_${index + 1}`,
      path: `originals/sample-${index + 1}.png`,
      rightsClass: 'C',
      evaluationAllowed: true,
    })),
  };
}

test('research model configuration keeps observer, reasoner, and forensic roles additive', () => {
  assert.equal(DEFAULT_RESEARCH_MODEL_CONFIG.moderationModel, OPENAI_MODERATION_MODEL);
  assert.equal(DEFAULT_RESEARCH_MODEL_CONFIG.visionObserverModel, CLOUDFLARE_VISION_OBSERVER_MODEL);
  assert.equal(DEFAULT_RESEARCH_MODEL_CONFIG.reasonerModel, CLOUDFLARE_REASONER_MODEL);
  const configured = researchModelConfigFromEnvironment({ AUTHENTICITY_REASONER_MODEL: 'fixture-reasoner', AUTHENTICITY_VISION_OBSERVER_MODEL: 'fixture-observer', AUTHENTICITY_FORENSICS_VERSION: 'fixture-forensics' });
  assert.equal(configured.reasonerModel, 'fixture-reasoner');
  assert.equal(configured.visionObserverModel, 'fixture-observer');
  assert.equal(configured.forensicsVersion, 'fixture-forensics');
});

test('OpenAI moderation adapter sends one image data URL and preserves unsupported category applicability', async () => {
  let calls = 0;
  let requestBody;
  const provider = createOpenAIModerationProvider({
    apiKey: 'fixture-secret-that-must-not-appear',
    fetchImpl: async (_url, init) => {
      calls += 1;
      requestBody = JSON.parse(init.body);
      return jsonResponse(moderationResponse());
    },
  });
  const result = await provider.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(calls, 1);
  assert.equal(requestBody.model, OPENAI_MODERATION_MODEL);
  assert.equal(requestBody.input[0].type, 'image_url');
  assert.match(requestBody.input[0].image_url.url, /^data:image\/png;base64,/);
  assert.equal(result.result, 'ALLOW');
  assert.equal(result.providerEvidence.status, 'SUCCESS');
  assert.deepEqual(result.providerEvidence.categoryAppliedInputTypes['sexual/minors'], []);
  assert.equal(JSON.stringify(result).includes('fixture-secret-that-must-not-appear'), false);
});

test('flagged moderation is mapped through an explicit Lythaus policy and remains provider evidence', async () => {
  const provider = createOpenAIModerationProvider({
    apiKey: 'fixture-key',
    flaggedResult: 'BLOCK',
    fetchImpl: async () => jsonResponse(moderationResponse({
      flagged: true,
      categories: { violence: true, hate: true },
      category_scores: { violence: 0.98, hate: 0.77 },
      category_applied_input_types: { violence: ['image'], hate: ['image'] },
    })),
  });
  const result = await provider.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(result.result, 'BLOCK');
  assert.equal(result.providerEvidence.flagged, true);
  assert.equal(result.providerEvidence.categories.violence, true);
  assert.equal(result.providerEvidence.categoryScores.hate, 0.77);
  assert.equal(result.reasonCodes.includes('OPENAI_PROVIDER_FLAGGED_REQUIRES_LYTHAUS_POLICY'), true);
});

test('moderation failures are sanitized, typed, and never retried', async () => {
  const secret = 'fixture-api-key-never-log';
  const cases = [
    ['missing-key', createOpenAIModerationProvider({}), 'MISSING_CREDENTIAL', 0],
    ['invalid-mime', createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => { throw new Error('must_not_call'); } }), 'INVALID_MIME', 0],
    ['empty', createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => { throw new Error('must_not_call'); } }), 'EMPTY_INPUT', 0],
    ['oversize', createOpenAIModerationProvider({ apiKey: secret, maxImageBytes: 1, fetchImpl: async () => { throw new Error('must_not_call'); } }), 'IMAGE_SIZE_LIMIT_EXCEEDED', 0],
  ];
  for (const [name, provider, expected, size] of cases) {
    const bytes = name === 'empty' ? new Uint8Array() : pngFixture().slice(0, size || undefined);
    const result = await provider.analyseImage({ caseId: CASE_ID, mime: name === 'invalid-mime' ? 'image/gif' : 'image/png', bytes });
    assert.equal(result.providerEvidence.errorCategory, expected, name);
    assert.equal(JSON.stringify(result).includes(secret), false, name);
  }
  for (const [status, expected] of [[401, 'HTTP_AUTHENTICATION_FAILURE'], [429, 'HTTP_RATE_LIMITED'], [500, 'HTTP_SERVER_FAILURE'], [400, 'HTTP_FAILURE']]) {
    let calls = 0;
    const provider = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => { calls += 1; return jsonResponse({ error: 'not logged' }, status); } });
    const result = await provider.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
    assert.equal(calls, 1);
    assert.equal(result.providerEvidence.errorCategory, expected);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  const malformed = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => new Response('{', { status: 200 }) });
  assert.equal((await malformed.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() })).providerEvidence.errorCategory, 'MALFORMED_RESPONSE');
  const missing = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => jsonResponse({ model: OPENAI_MODERATION_MODEL, results: [{}] }) });
  assert.equal((await missing.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() })).providerEvidence.errorCategory, 'UNEXPECTED_SCHEMA');
  const network = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => { throw new Error(`Bearer ${secret}`); } });
  const networkResult = await network.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(networkResult.providerEvidence.errorCategory, 'NETWORK_FAILURE');
  assert.equal(JSON.stringify(networkResult).includes(secret), false);
  const timeout = createOpenAIModerationProvider({ apiKey: secret, timeoutMs: 1, fetchImpl: async (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('AbortError')))) });
  const timeoutResult = await timeout.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(timeoutResult.providerEvidence.errorCategory, 'TIMEOUT');
});

test('moderation evidence contract rejects missing success or failure fields', () => {
  assert.throws(() => assertModerationProviderEvidence({ schemaVersion: 'lythaus-moderation-provider-evidence-v1', provider: 'fixture', model: 'fixture', flagged: null, categories: {}, categoryScores: {}, categoryAppliedInputTypes: {}, executionMs: 0, status: 'SUCCESS' }), /flagged_missing/);
  assert.throws(() => assertModerationProviderEvidence({ schemaVersion: 'lythaus-moderation-provider-evidence-v1', provider: 'fixture', model: 'fixture', flagged: null, categories: {}, categoryScores: {}, categoryAppliedInputTypes: {}, executionMs: 0, status: 'PROVIDER_FAILURE' }), /error_missing/);
});

test('Vision Observer sends only visual protocol instructions and returns observations without a verdict', async () => {
  let called;
  const observer = createCloudflareVisionObserver({
    ai: { run: async (model, input, options) => { called = { model, input, options }; return { response: JSON.stringify({ observations: [{ category: 'TEXT', applicable: true, status: 'INDETERMINATE', observation: 'A text region is partly occluded.', regions: [{ coordinateSpace: 'NORMALIZED', x: 0.1, y: 0.2, width: 0.3, height: 0.2 }], measurementConfidence: 0.4, limitations: ['Partial visibility.'] }] }) }; } },
  });
  const result = await observer.observe({ sampleId: 'SAMPLE_1', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture() });
  assert.equal(called.model, CLOUDFLARE_VISION_OBSERVER_MODEL);
  assert.equal(called.input.task, 'query');
  assert.match(called.input.image, /^data:image\/png;base64,/);
  assert.match(called.input.question, /do not determine whether the image is AI-generated/i);
  assert.equal(called.options.metadata.protocolVersion, VISION_OBSERVER_PROTOCOL_VERSION);
  assert.equal(result.protocolVersion, VISION_OBSERVER_PROTOCOL_VERSION);
  assert.equal(result.promptVersion, 'lythaus-vision-observer-prompt-v1');
  assert.equal(result.observations[0].status, 'INDETERMINATE');
  assert.equal(result.observations[0].regions[0].coordinateSpace, 'NORMALIZED');
  assert.equal(result.observations[0].provenance.evidenceFamily, 'VISION_OBSERVATION');
  assert.equal(result.observations[0].provenance.inputHash, 'a'.repeat(64));
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'primaryHypothesis'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'aiProbability'), false);
  assert.match(VISION_OBSERVER_PROMPT, /absence of an anomaly is valid/i);
});

test('Vision Observer fails closed on malformed observations and invalid regions', async () => {
  const malformed = createCloudflareVisionObserver({ ai: { run: async () => ({ response: '{not-json' }) } });
  const malformedResult = await malformed.observe({ sampleId: 'SAMPLE', inputHash: 'b'.repeat(64), mime: 'image/png', bytes: pngFixture() });
  assert.equal(malformedResult.status, 'PROVIDER_FAILURE');
  assert.equal(malformedResult.observations.length, 0);
  const invalidRegion = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'OBSERVED', observation: 'fixture', regions: [{ coordinateSpace: 'PIXELS', x: 1, y: 1, width: 2, height: 2 }], measurementConfidence: null, limitations: [] }] }) }) } });
  assert.equal((await invalidRegion.observe({ sampleId: 'SAMPLE', inputHash: 'c'.repeat(64), mime: 'image/png', bytes: pngFixture() })).errorCategory, 'MALFORMED_RESPONSE');
});

test('Evidence Packet preserves forensic families, missing evidence, and safety isolation', async () => {
  const forensic = await generateForensicFeatureBundleV1({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture(), now: '2026-01-01T00:00:00.000Z' });
  const moderation = createMockModerationProvider({ analyse: async () => ({ provider: 'fixture', result: 'REVIEW', reasonCodes: ['FLAGGED'], modelVersion: 'fixture', executionMs: 1, costEstimateUsd: 0, providerEvidence: { schemaVersion: 'lythaus-moderation-provider-evidence-v1', provider: 'fixture', model: 'fixture', flagged: true, categories: { violence: true }, categoryScores: { violence: 0.9 }, categoryAppliedInputTypes: { violence: ['image'] }, executionMs: 1, status: 'SUCCESS' } }) });
  const analysis = await moderation.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  const built = buildEvidencePacket({ runId: 'run', caseId: CASE_ID, sampleId: 'sample', sourceFamilyId: 'family', preflight: { inputHash: forensic.fileProvenance.sha256, mime: 'image/png', dimensions: forensic.fileProvenance.dimensions }, forensicBundle: forensic, moderation: analysis, now: '2026-01-01T00:00:00.000Z' });
  assert.equal(built.evidenceFamilies.EF1_FILE_PROVENANCE.status, 'AVAILABLE');
  assert.equal(built.evidenceFamilies.EF2_PHYSICAL_ACQUISITION.status, 'UNAVAILABLE');
  assert.equal(built.evidenceFamilies.EF3_GENERATIVE_FORENSICS.status, 'UNAVAILABLE');
  assert.equal(built.evidenceFamilies.EF4_SPECTRAL_STABILITY.status, 'AVAILABLE');
  assert.equal(built.evidenceFamilies.EF5_RECONSTRUCTION_LOCAL_MANIPULATION.status, 'UNAVAILABLE');
  assert.equal(built.safetyContext.role, 'SAFETY_CONTEXT_ONLY');
  assert.equal(built.safetyContext.providerEvidence.flagged, true);
  assert.equal(built.enforcementAuthority, false);
  assertSafetyIsolation(built);
  assertEvidenceReferenceIds(built, built.evidence.map((item) => item.evidenceId));
  assert.throws(() => assertEvidencePacket({ ...built, groundTruth: {} }), /forbidden_field:groundTruth/);
  const unsafe = { ...built, evidence: [...built.evidence, { ...built.evidence[0], evidenceId: 'unsafe', family: 'EF3_GENERATIVE_FORENSICS', provenance: { ...built.evidence[0].provenance, evidenceFamily: 'EF3_GENERATIVE_FORENSICS', sourceComponent: 'openai-moderation' } }] };
  assert.throws(() => assertEvidencePacket(unsafe), /safety_cannot_be_synthetic_evidence/);
});

test('safety category changes cannot alter synthetic-origin evidence', () => {
  const makeModeration = (flagged) => ({ provider: 'openai', result: flagged ? 'REVIEW' : 'ALLOW', reasonCodes: [], modelVersion: OPENAI_MODERATION_MODEL, executionMs: 1, costEstimateUsd: 0, providerEvidence: { schemaVersion: 'lythaus-moderation-provider-evidence-v1', provider: 'openai', model: OPENAI_MODERATION_MODEL, flagged, categories: flagged ? { violence: true } : { violence: false }, categoryScores: flagged ? { violence: 0.99 } : { violence: 0.01 }, categoryAppliedInputTypes: { violence: ['image'] }, executionMs: 1, status: 'SUCCESS' } });
  const safe = buildEvidencePacket({ runId: 'safe', caseId: CASE_ID, sampleId: 'same', sourceFamilyId: 'family', preflight: { inputHash: 'd'.repeat(64), mime: 'image/png', dimensions: null }, moderation: makeModeration(false) });
  const flagged = buildEvidencePacket({ runId: 'flagged', caseId: CASE_ID, sampleId: 'same', sourceFamilyId: 'family', preflight: { inputHash: 'd'.repeat(64), mime: 'image/png', dimensions: null }, moderation: makeModeration(true) });
  assert.deepEqual(flagged.originAxes, safe.originAxes);
  assert.deepEqual(flagged.evidenceFamilies.EF3_GENERATIVE_FORENSICS, safe.evidenceFamilies.EF3_GENERATIVE_FORENSICS);
  assert.equal(flagged.evidence.some((item) => item.family === 'EF3_GENERATIVE_FORENSICS'), false);
});

test('Judge consumes structured packet evidence, can abstain, and cannot reference unknown evidence', async () => {
  const inputPacket = packet();
  const abstain = createInsufficientEvidenceRecommendation();
  const request = buildJudgeRequest(inputPacket);
  assert.match(request.messages[0].content, /SAFETY_CONTEXT_ONLY/);
  assert.equal(request.messages[1].content.includes('groundTruth'), false);
  assert.equal(request.messages[1].content.includes('imageBytes'), false);
  const judge = createCloudflareJudge({ ai: { run: async (model, body) => { assert.equal(model, CLOUDFLARE_REASONER_MODEL); assert.equal(body.response_format.type, 'json_object'); return { response: JSON.stringify(abstain) }; } } });
  const result = await judge.judge({ packet: inputPacket });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.recommendation.enforcementAuthority, false);
  assert.equal(result.promptVersion, JUDGE_PROMPT_VERSION);
  assertJudgeRecommendation(result.recommendation, inputPacket);
  const invalid = createCloudflareJudge({ ai: { run: async () => ({ response: JSON.stringify(recommendation({ supportingEvidence: [{ evidenceId: 'not-real', rationale: 'bad' }] })) }) } });
  const invalidResult = await invalid.judge({ packet: inputPacket });
  assert.equal(invalidResult.status, 'PROVIDER_FAILURE');
  assert.equal(invalidResult.recommendation, null);
  const untrusted = createCloudflareJudge({ ai: { run: async () => ({ response: JSON.stringify(recommendation({ recommendedAdditionalTests: ['RUN_ARBITRARY_TOOL'] })) }) } });
  assert.equal((await untrusted.judge({ packet: inputPacket })).errorCategory, 'UNEXPECTED_SCHEMA');
});

test('runtime and ground-truth manifests are separate and evaluator-only', async () => {
  const runtime = JSON.parse(await readFile(path.join(repositoryRoot, 'research/wp004a/runtime-manifest.example.json'), 'utf8'));
  const truth = JSON.parse(await readFile(path.join(repositoryRoot, 'research/wp004a/ground-truth-manifest.example.json'), 'utf8'));
  assertRuntimeResearchManifest(runtime);
  assertGroundTruthResearchManifest(truth);
  assert.equal(Object.prototype.hasOwnProperty.call(runtime.entries[0], 'truth'), false);
  assert.throws(() => parseRuntimeResearchManifest({ ...runtime, entries: [{ ...runtime.entries[0], truth: {} }] }), /evaluation_data_forbidden/);
  assert.throws(() => parseGroundTruthResearchManifest({ ...truth, entries: [{ ...truth.entries[0], truth: { ...truth.entries[0].truth, weirdHands: true } }] }), /observation_leakage/);
  const evaluation = evaluateResearchPredictions({ predictions: [{ sampleId: 'CAM_001', primaryHypothesis: 'CAMERA_NATIVE', uncertainty: 'HIGH', requiresReview: true }], groundTruth: truth.entries });
  assert.equal(evaluation.enforcementAuthority, false);
  assert.equal(evaluation.evaluatedCount, 1);
  assert.equal(evaluation.agreementRate, 1);
});

test('adversarial packet fixtures preserve the requested hard cases', () => {
  const cases = createWp004aAdversarialCases();
  assert.equal(cases.length, 7);
  for (const item of cases) {
    assertEvidencePacket(item.packet);
    assertSafetyIsolation(item.packet);
    assert.equal(item.packet.enforcementAuthority, false);
  }
  const photographed = cases.find((item) => item.caseId === 'case-photographed-synthetic');
  assert.deepEqual(photographed.packet.originAxes, { cameraEvidence: 'CAMERA_NATIVE_LIKELY', syntheticEvidence: 'STRONG_SYNTHETIC_EVIDENCE' });
  const harmful = cases.find((item) => item.caseId === 'case-harmful-camera');
  assert.equal(harmful.packet.safetyContext.providerEvidence.categories.violence, true);
  assert.equal(harmful.packet.originAxes.syntheticEvidence, 'NO_POSITIVE_SYNTHETIC_EVIDENCE');
  assert.equal(cases.find((item) => item.caseId === 'case-contradictory-weak').expectedHypothesis, 'INSUFFICIENT_EVIDENCE');
});

test('bounded runner executes mock full pipeline and records exact invocation counts', async () => {
  const calls = { moderation: 0, observer: 0, judge: 0 };
  const result = await runResearchTrial({ mode: 'MOCK_ONLY', runtimeManifest: manifest(2), maxSamples: 2 }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    moderation: createMockModerationProvider({ analyse: async () => { calls.moderation += 1; return { provider: 'mock-moderation', result: 'ALLOW', reasonCodes: [], modelVersion: 'mock', executionMs: 1, costEstimateUsd: 0 }; } }),
    observer: createMockVisionObserver(),
    judge: createMockJudge(),
  });
  assert.equal(result.cases.length, 2);
  assert.deepEqual(result.invocationAccounting.calls, { moderation: 2, observer: 2, judge: 2, total: 6 });
  assert.equal(result.groundTruthLoaded, false);
  assert.equal(result.enforcementAuthority, false);
  assert.equal(calls.moderation, 2);
  assert.ok(result.cases.every((item) => item.packet && item.packet.schemaVersion === 'lythaus-evidence-packet-v1'));
});

test('live runner requires explicit sample cap and network opt-in', async () => {
  const live = createOpenAIModerationProvider({ apiKey: 'fixture-key', fetchImpl: async () => jsonResponse(moderationResponse()) });
  await assert.rejects(runResearchTrial({ mode: 'MODERATION_ONLY', runtimeManifest: manifest(1), allowNetwork: true }, { readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }), moderation: live }), /research_live_max_samples_required/);
  await assert.rejects(runResearchTrial({ mode: 'MODERATION_ONLY', runtimeManifest: manifest(1), maxSamples: 1 }, { readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }), moderation: live }), /research_network_disabled:moderation/);
});

test('runner hard-stops invocation caps and gate mode prevents expensive downstream calls', async () => {
  let observerCalls = 0;
  const blocked = await runResearchTrial({ mode: 'FULL', runtimeManifest: manifest(1), maxSamples: 1, safetyMode: 'gate' }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    moderation: createMockModerationProvider({ analyse: async () => ({ provider: 'mock', result: 'BLOCK', reasonCodes: ['fixture'], modelVersion: 'mock', executionMs: 1, costEstimateUsd: 0 }) }),
    observer: createMockVisionObserver([]),
    judge: createMockJudge(),
  });
  assert.equal(blocked.cases[0].status, 'STOPPED');
  assert.equal(blocked.cases[0].stoppedAt, 'SAFETY_GATE');
  assert.equal(blocked.invocationAccounting.calls.moderation, 1);
  assert.equal(blocked.invocationAccounting.calls.observer, 0);
  assert.equal(blocked.invocationAccounting.calls.judge, 0);
  const failedGate = await runResearchTrial({ mode: 'FULL', runtimeManifest: manifest(1), maxSamples: 1, safetyMode: 'gate' }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    moderation: createMockModerationProvider({ analyse: async () => ({ provider: 'mock', result: 'PROVIDER_FAILURE', reasonCodes: ['fixture'], modelVersion: null, executionMs: 1, costEstimateUsd: 0 }) }),
    observer: createMockVisionObserver([]),
    judge: createMockJudge(),
  });
  assert.equal(failedGate.cases[0].status, 'STOPPED');
  assert.equal(failedGate.invocationAccounting.calls.observer, 0);
  assert.equal(failedGate.invocationAccounting.calls.judge, 0);
  await assert.rejects(runResearchTrial({ mode: 'FULL', runtimeManifest: manifest(2), maxSamples: 2, caps: { maxModerationCalls: 1, maxObserverCalls: 2, maxJudgeCalls: 2, maxTotalCalls: 5 } }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    moderation: createMockModerationProvider({ analyse: async () => ({ provider: 'mock', result: 'ALLOW', reasonCodes: [], modelVersion: 'mock', executionMs: 0, costEstimateUsd: 0 }) }),
    observer: { isLive: false, observe: async () => { observerCalls += 1; return createMockVisionObserver().observe({ sampleId: 's', inputHash: 'e'.repeat(64), mime: 'image/png', bytes: pngFixture() }); } },
    judge: createMockJudge(),
  }), /research_invocation_cap_exceeded:moderation/);
  assert.equal(observerCalls, 1);
});

test('workflow is manual-only, uses the exact secret binding, and emits no media or key', async () => {
  const workflow = await readFile(path.join(repositoryRoot, '.github/workflows/wp004a-openai-moderation-smoke.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  assert.match(workflow, /OPENAI_API_KEY:\s*\$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(workflow, /OneDrive|research[-_]images|base64|echo\s+\$\{\{\s*secrets\.OPENAI_API_KEY/i);
  assert.match(workflow, /wp004a-openai-moderation-smoke\.mjs/);
});
