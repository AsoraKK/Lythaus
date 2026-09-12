import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  assertEvidencePacket,
  assertEvidenceReferenceIds,
  assertGroundTruthResearchManifest,
  assertJudgeRecommendation,
  assertModerationProviderEvidence,
  assertResearchImageInput,
  assertRuntimeResearchManifest,
  assertSafetyIsolation,
  buildEvidencePacket,
  buildJudgeRequest,
  cloudflareRestCredentialsFromEnvironment,
  cloudflareSafeProviderDiagnosticsFromBody,
  CloudflareRestError,
  compareVisionObserverResults,
  classifyGeometryOcclusionComparison,
  classifyGeometryFrontBackComparison,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
  CLOUDFLARE_REASONER_MODEL,
  CLOUDFLARE_VISION_OBSERVER_MODEL,
  createCloudflareJudge,
  createCloudflareVisionObserver,
  createCloudflareVisionObserverRest,
  createInsufficientEvidenceRecommendation,
  createMockJudge,
  createMockModerationProvider,
  createMockVisionObserver,
  createOpenAIModerationProvider,
  createWp004aAdversarialCases,
  decodeResearchImage,
  DEFAULT_RESEARCH_MODEL_CONFIG,
  evaluateResearchPredictions,
  evaluateGeometryOcclusionObservation,
  evaluateGeometryFrontBackObservation,
  summarizeGeometryFrontBackEvaluations,
  generateForensicFeatureBundleV1,
  JUDGE_PROMPT_VERSION,
  OPENAI_MODERATION_MODEL,
  parseGroundTruthResearchManifest,
  parseRuntimeResearchManifest,
  researchRunExitCode,
  researchModelConfigFromEnvironment,
  runCloudflareModelSchemaPreflight,
  runResearchTrial,
  buildReasonedVisualRecheckRequest,
  summarizeVisionObserverComparisons,
  VISION_OBSERVER_ROUTING_POLICY,
  VISION_OBSERVER_PROTOCOL_VERSION,
  VISION_OBSERVER_PROMPT,
  VISION_OBSERVER_PROMPT_VERSION,
  VISION_OBSERVER_QUERY_GENERATION_CONFIG,
  VISION_OBSERVER_REGION_POLICIES,
} from '../src/wp004a.ts';
import { createNeutralPng, validateNeutralPng } from '../../../scripts/authenticity/neutral-png.mjs';
import { renderGeometryOcclusionPng, validateGeometryOcclusionPng } from '../../../scripts/authenticity/geometry-occlusion-fixture.mjs';
import {
  buildGeometryOcclusionFrontBackSvg,
  GEOMETRY_FRONTBACK_ALLOWED_ANSWERS,
  GEOMETRY_FRONTBACK_FIXTURE_IDS,
  GEOMETRY_FRONTBACK_RUNTIME_FILENAMES,
  geometryFrontBackTruth,
  renderGeometryOcclusionFrontBackPng,
  validateGeometryOcclusionFrontBackPng,
} from '../../../scripts/authenticity/geometry-occlusion-frontback-fixtures.mjs';
import { WP004A_CLOUDFLARE_TRIAL_MODES } from '../../../scripts/authenticity/wp004a-cloudflare-trial-config.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CASE_ID = '0198a5d3-4a00-7000-8000-000000000123';
const execFileAsync = promisify(execFile);

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

function decodedFixture() {
  return { width: 2, height: 2, channels: 3, pixels: new Uint8Array(Array.from({ length: 12 }, (_, index) => index * 10)) };
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

test('generated moderation smoke fixture is a valid Sharp PNG accepted by the research image path', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lythaus-wp004a-neutral-'));
  try {
    const outputPath = path.join(directory, 'neutral.png');
    const generated = await createNeutralPng(outputPath);
    const bytes = new Uint8Array(await readFile(outputPath));
    const validation = await validateNeutralPng(bytes);
    assert.equal(generated.valid, true);
    assert.equal(validation.valid, true);
    assert.equal(validation.format, 'png');
    assert.equal(validation.width, 128);
    assert.equal(validation.height, 128);
    assert.equal(validation.channels, 3);
    assert.equal(validation.pixelBytes, 128 * 128 * 3);
    assert.equal(assertResearchImageInput({ bytes, mime: 'image/png' }), 'image/png');
    const decoded = await decodeResearchImage({ bytes, mime: 'image/png' });
    assert.equal(decoded.width, 128);
    assert.equal(decoded.height, 128);
    assert.equal(decoded.channels, 3);
    assert.equal(decoded.pixels.byteLength, 128 * 128 * 3);
    assert.ok(decoded.pixels.byteLength > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('geometry occlusion fixture is deterministic, decodable RGB, and matches its reviewed spec hash', async () => {
  const first = await renderGeometryOcclusionPng();
  const second = await renderGeometryOcclusionPng();
  assert.deepEqual(first, second);
  const validation = await validateGeometryOcclusionPng(first);
  const spec = JSON.parse(await readFile(path.join(repositoryRoot, 'research/wp004a/geometry-occlusion-fixture-v1.json'), 'utf8'));
  assert.equal(validation.valid, true);
  assert.equal(validation.fixtureId, 'WP004A_GEOMETRY_OCCLUSION_01');
  assert.equal(validation.fixtureVersion, 'v1');
  assert.equal(validation.width, 512);
  assert.equal(validation.height, 512);
  assert.equal(validation.channels, 3);
  assert.equal(validation.pixelBytes, 512 * 512 * 3);
  assert.equal(validation.sha256, spec.sha256);
  assert.equal(spec.truth.truth.frontObject, 'BLUE_RECTANGLE');
  assert.equal(spec.truth.truth.backObject, 'RED_RECTANGLE');
});

function frontBackObservation(observation, status = 'OBSERVED', overrides = {}) {
  return {
    observationId: 'frontback-observation',
    queryId: 'GEOMETRY_FRONTBACK_01',
    protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION,
    category: 'GEOMETRY_OCCLUSION',
    task: 'query',
    reasoningMode: 'DIRECT',
    applicable: true,
    status,
    observation,
    regions: [],
    measurementConfidence: null,
    limitations: [],
    provider: 'fixture-provider',
    model: 'fixture-model',
    executionMs: 1,
    provenance: {
      evidenceFamily: 'VISION_OBSERVATION',
      sourceComponent: 'lythaus-vision-observer',
      provider: 'fixture-provider',
      modelVersion: 'fixture-model',
      schemaVersion: VISION_OBSERVER_PROTOCOL_VERSION,
      executionTimestamp: '2026-01-01T00:00:00.000Z',
      inputHash: 'f'.repeat(64),
      applicable: 'applicable',
      limitations: [],
      task: 'query',
      reasoningMode: 'DIRECT',
      executionMs: 1,
    },
    ...overrides,
  };
}

test('counterbalanced front-back fixtures are deterministic and differ only by primary draw order', async () => {
  const blueFirst = await renderGeometryOcclusionFrontBackPng('BLUE');
  const blueSecond = await renderGeometryOcclusionFrontBackPng('BLUE');
  const redFirst = await renderGeometryOcclusionFrontBackPng('RED');
  const redSecond = await renderGeometryOcclusionFrontBackPng('RED');
  assert.deepEqual(blueFirst, blueSecond);
  assert.deepEqual(redFirst, redSecond);
  const blueValidation = await validateGeometryOcclusionFrontBackPng(blueFirst, 'BLUE');
  const redValidation = await validateGeometryOcclusionFrontBackPng(redFirst, 'RED');
  assert.equal(blueValidation.valid, true);
  assert.equal(redValidation.valid, true);
  assert.equal(blueValidation.width, 512);
  assert.equal(redValidation.height, 512);
  assert.equal(blueValidation.channels, 3);
  assert.equal(redValidation.channels, 3);
  assert.notEqual(blueValidation.sha256, redValidation.sha256);
  const blueSvg = buildGeometryOcclusionFrontBackSvg('BLUE');
  const redSvg = buildGeometryOcclusionFrontBackSvg('RED');
  assert.ok(blueSvg.indexOf('#d92d3f') < blueSvg.indexOf('#2f6fdb'));
  assert.ok(redSvg.indexOf('#2f6fdb') < redSvg.indexOf('#d92d3f'));
  assert.equal(geometryFrontBackTruth('BLUE').truth.front, 'BLUE');
  assert.equal(geometryFrontBackTruth('RED').truth.front, 'RED');
  const runtimeSpec = JSON.parse(await readFile(path.join(repositoryRoot, 'research/wp004a/geometry-occlusion-frontback-runtime-v2.json'), 'utf8'));
  const truthSpec = JSON.parse(await readFile(path.join(repositoryRoot, 'research/wp004a/geometry-occlusion-frontback-truth-v2.json'), 'utf8'));
  assert.equal(blueValidation.sha256, runtimeSpec.entries[0].sha256);
  assert.equal(redValidation.sha256, runtimeSpec.entries[1].sha256);
  assert.equal(runtimeSpec.entries[0].sampleId, GEOMETRY_FRONTBACK_FIXTURE_IDS.BLUE);
  assert.equal(runtimeSpec.entries[1].sampleId, GEOMETRY_FRONTBACK_FIXTURE_IDS.RED);
  assert.equal(runtimeSpec.entries[0].path, GEOMETRY_FRONTBACK_RUNTIME_FILENAMES.BLUE);
  assert.equal(runtimeSpec.entries[1].path, GEOMETRY_FRONTBACK_RUNTIME_FILENAMES.RED);
  assert.equal(runtimeSpec.observerInput.truthProvided, false);
  assert.equal(runtimeSpec.observerInput.regionPolicy, 'FORBID');
  assert.equal(Object.prototype.hasOwnProperty.call(runtimeSpec, 'truth'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(runtimeSpec.entries[0], 'front'), false);
  assert.equal(truthSpec.entries.length, 2);
  assert.equal(JSON.stringify(runtimeSpec).includes('BLUE_FRONT'), false);
  assert.equal(JSON.stringify(runtimeSpec).includes('RED_FRONT'), false);
  assert.match(JSON.stringify(runtimeSpec.observerInput), /blue rectangle/i);
  assert.match(JSON.stringify(runtimeSpec.observerInput), /red rectangle/i);
  assert.equal(truthSpec.entries[0].fixtureId, GEOMETRY_FRONTBACK_FIXTURE_IDS.BLUE);
  assert.equal(truthSpec.entries[1].fixtureId, GEOMETRY_FRONTBACK_FIXTURE_IDS.RED);
  assert.deepEqual(GEOMETRY_FRONTBACK_ALLOWED_ANSWERS, [
    'Blue rectangle is in front of red rectangle.',
    'Red rectangle is in front of blue rectangle.',
    'Front/back relationship is indeterminate.',
  ]);
});

test('front-back fixture generator stdout is blinded and contains no truth labels', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wp004a-frontback-generator-'));
  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts/authenticity/create-geometry-occlusion-frontback-fixtures.mjs'), directory], { cwd: repositoryRoot });
    assert.doesNotMatch(stdout, /BLUE_FRONT|RED_FRONT|"front"\s*:|"back"\s*:/);
    const output = JSON.parse(stdout);
    assert.equal(output.status, 'created');
    assert.deepEqual(output.fixtures.map((fixture) => fixture.sampleId), Object.values(GEOMETRY_FRONTBACK_FIXTURE_IDS));
    assert.equal(Object.prototype.hasOwnProperty.call(output.fixtures[0], 'front'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(output.fixtures[0], 'back'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(output.fixtures[0], 'variant'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('front-back evaluator uses exact answers, rejects non-empty regions, and detects same-answer bias', () => {
  const blueTruth = geometryFrontBackTruth('BLUE');
  const redTruth = geometryFrontBackTruth('RED');
  const blueCorrect = evaluateGeometryFrontBackObservation({ observations: [frontBackObservation('Blue rectangle is in front of red rectangle.')] , truth: blueTruth });
  const redCorrect = evaluateGeometryFrontBackObservation({ observations: [frontBackObservation('Red rectangle is in front of blue rectangle.')] , truth: redTruth });
  const abstain = evaluateGeometryFrontBackObservation({ observations: [frontBackObservation('Front/back relationship is indeterminate.', 'INDETERMINATE')] , truth: blueTruth });
  const wrong = evaluateGeometryFrontBackObservation({ observations: [frontBackObservation('Blue rectangle is in front of red rectangle.')] , truth: redTruth });
  const invalidRegions = evaluateGeometryFrontBackObservation({ observations: [frontBackObservation('Blue rectangle is in front of red rectangle.', 'OBSERVED', { regions: [{ coordinateSpace: 'NORMALIZED', x: 0, y: 0, width: 0.1, height: 0.1 }] })], truth: blueTruth });
  assert.equal(blueCorrect.outcome, 'CORRECT');
  assert.equal(redCorrect.outcome, 'CORRECT');
  assert.equal(abstain.outcome, 'ABSTAIN');
  assert.equal(wrong.outcome, 'INCORRECT');
  assert.equal(invalidRegions.outcome, 'PROTOCOL_FAILURE');
  assert.equal(invalidRegions.regionsEmpty, false);
  const truthFrontByFixture = new Map([[blueCorrect.fixtureId, 'BLUE'], [wrong.fixtureId, 'RED']]);
  const direct = summarizeGeometryFrontBackEvaluations([blueCorrect, wrong], truthFrontByFixture);
  const reasoned = summarizeGeometryFrontBackEvaluations([blueCorrect, wrong], truthFrontByFixture);
  assert.equal(direct.correct, 1);
  assert.equal(direct.incorrect, 1);
  assert.equal(direct.possibleFrontObjectPrior, true);
  assert.equal(classifyGeometryFrontBackComparison({ direct: [blueCorrect, wrong], reasoned: [blueCorrect, wrong] }), 'RELATIONAL_REASONING_SIGNAL_NEUTRAL');
});

test('region failure telemetry is structural only and does not retain coordinate values', async () => {
  const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'OBSERVED', observation: 'A region was returned.', regions: [{ x1: 0.125, y1: 0.25, x2: 0.5, y2: 0.75 }], measurementConfidence: null, limitations: [] }] }), reasoning: { trace: 'PRIVATE_REGION_REASONING' } }) } });
  const result = await observer.observe({ sampleId: 'REGION', inputHash: 'e'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_REGION_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Inspect the scene.', reasoningMode: 'DIRECT' } });
  assert.equal(result.status, 'PROVIDER_FAILURE');
  assert.equal(result.responseDiagnostics.normalizationFailureCode, 'REGIONS_INVALID');
  assert.equal(result.responseDiagnostics.regionDiagnostics.regionCount, 1);
  assert.equal(result.responseDiagnostics.regionDiagnostics.firstRegionType, 'OBJECT');
  assert.deepEqual(result.responseDiagnostics.regionDiagnostics.firstRegionKeys, ['x1', 'x2', 'y1', 'y2']);
  assert.equal(result.responseDiagnostics.regionDiagnostics.coordinateSpacePresent, false);
  assert.deepEqual(result.responseDiagnostics.regionDiagnostics.coordinateValueTypes, { x1: 'number', x2: 'number', y1: 'number', y2: 'number' });
  assert.equal(JSON.stringify(result).includes('0.125'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_REGION_REASONING'), false);
});

test('region policy FORBID discards provider regions without weakening other validation', async () => {
  assert.deepEqual(VISION_OBSERVER_REGION_POLICIES, ['CANONICAL', 'FORBID']);
  const providerRegion = { name: 'PRIVATE_REGION_LABEL', position: { x1: 0.125, y1: 0.25, x2: 0.5, y2: 0.75 } };
  const answer = (overrides = {}) => JSON.stringify({ observations: [{ category: 'GEOMETRY_OCCLUSION', applicable: true, status: 'OBSERVED', observation: 'Blue rectangle is in front of red rectangle.', regions: [providerRegion], measurementConfidence: null, limitations: [], ...overrides }] });
  let capturedPayload;
  const observer = createCloudflareVisionObserver({ ai: { run: async (_model, payload) => { capturedPayload = payload; return { answer: answer(), reasoning: { trace: 'PRIVATE_REGION_REASONING' } }; } } });
  const input = { sampleId: 'FORBID', inputHash: 'f'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'GEOMETRY_FRONTBACK_01', category: 'GEOMETRY_OCCLUSION', task: 'query', question: 'Inspect the front/back relationship.', regionPolicy: 'FORBID' } };
  const result = await observer.observe(input);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.regionPolicy, 'FORBID');
  assert.match(capturedPayload.question, /Region policy: FORBID/);
  assert.match(capturedPayload.question, /regions MUST be exactly \[\]/);
  assert.deepEqual(result.observations[0].regions, []);
  assert.equal(result.responseDiagnostics.regionDiagnostics.regionPolicy, 'FORBID');
  assert.equal(result.responseDiagnostics.regionDiagnostics.providerRegionOutputPresent, true);
  assert.equal(result.responseDiagnostics.regionDiagnostics.providerRegionsDiscarded, true);
  assert.equal(result.responseDiagnostics.regionDiagnostics.regionCount, 1);
  assert.equal(result.responseDiagnostics.regionDiagnostics.normalizationFailureReason, 'PROVIDER_REGIONS_DISCARDED');
  assert.equal(JSON.stringify(result).includes('PRIVATE_REGION_LABEL'), false);
  assert.equal(JSON.stringify(result).includes('0.125'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_REGION_REASONING'), false);
  const built = buildEvidencePacket({ runId: 'forbid-run', caseId: CASE_ID, sampleId: 'FORBID', sourceFamilyId: 'FAMILY', preflight: { inputHash: input.inputHash, mime: input.mime, dimensions: null }, observer: result });
  assert.equal(JSON.stringify(built).includes('PRIVATE_REGION_LABEL'), false);
  assert.equal(JSON.stringify(built).includes('0.125'), false);
  assert.equal(JSON.stringify(buildJudgeRequest(built)).includes('PRIVATE_REGION_LABEL'), false);
  assert.equal(JSON.stringify(buildJudgeRequest(built)).includes('0.125'), false);

  const canonicalObserver = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: answer() }) } });
  const canonical = await canonicalObserver.observe({ ...input, request: { ...input.request, regionPolicy: 'CANONICAL' } });
  assert.equal(canonical.status, 'PROVIDER_FAILURE');
  assert.equal(canonical.responseDiagnostics.normalizationFailureCode, 'REGIONS_INVALID');

  const invalidStatusObserver = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: answer({ status: 'VISIBLE' }) }) } });
  const invalidStatus = await invalidStatusObserver.observe(input);
  assert.equal(invalidStatus.status, 'PROVIDER_FAILURE');
  assert.equal(invalidStatus.responseDiagnostics.normalizationFailureCode, 'STATUS_INVALID');
});

test('counterbalanced Observer A/B runner enforces two DIRECT and two REASONED calls', async () => {
  const requests = [];
  const runtimeManifest = manifest(2);
  const result = await runResearchTrial({
    mode: 'OBSERVER_AB',
    runtimeManifest,
    maxSamples: 2,
    observerRequest: { queryId: 'GEOMETRY_FRONTBACK_01', category: 'GEOMETRY_OCCLUSION', task: 'query', question: 'Return one front/back observation with regions empty.', regionPolicy: 'FORBID' },
    caps: { maxSamples: 2, maxModerationCalls: 0, maxObserverCalls: 4, maxObserverDirectCalls: 2, maxObserverReasonedCalls: 2, maxCaptionCalls: 0, maxDetectCalls: 0, maxPointCalls: 0, maxJudgeCalls: 0, maxTotalCalls: 4, maxRecheckRounds: 1 },
  }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    observer: { isLive: false, observe: async (input) => {
      requests.push({ sampleId: input.sampleId, request: input.request });
      return createMockVisionObserver([frontBackObservation('Front/back relationship is indeterminate.', 'INDETERMINATE')]).observe(input);
    } },
  });
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map((item) => item.request.reasoningMode), ['DIRECT', 'REASONED', 'DIRECT', 'REASONED']);
  assert.deepEqual(requests.map((item) => item.request.regionPolicy), ['FORBID', 'FORBID', 'FORBID', 'FORBID']);
  for (const start of [0, 2]) {
    const direct = { ...requests[start].request };
    const reasoned = { ...requests[start + 1].request };
    delete direct.reasoningMode;
    delete reasoned.reasoningMode;
    assert.deepEqual(direct, reasoned);
  }
  assert.equal(JSON.stringify(requests).includes('truth'), false);
  assert.equal(result.invocationAccounting.calls.observerDirect, 2);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 2);
  assert.equal(result.invocationAccounting.calls.total, 4);
});

test('relational evaluator is conservative and truth stays outside Observer input', async () => {
  const truth = {
    fixtureId: 'WP004A_GEOMETRY_OCCLUSION_01',
    category: 'GEOMETRY_OCCLUSION',
    truth: {
      occlusionPresent: true,
      frontObject: 'BLUE_RECTANGLE',
      backObject: 'RED_RECTANGLE',
      geometryConsistent: true,
      indeterminateExpected: false,
      controlObject: { id: 'GREEN_CIRCLE', overlapsPrimaryObjects: false },
    },
  };
  let capturedRequest;
  const observer = createCloudflareVisionObserver({ ai: { run: async (_model, payload) => {
    capturedRequest = payload;
    return { answer: JSON.stringify({ observations: [{ category: 'GEOMETRY_OCCLUSION', applicable: true, status: 'OBSERVED', observation: 'The blue rectangle is in front of the red rectangle, and their overlap is geometrically consistent.', regions: [], measurementConfidence: null, limitations: [] }] }), reasoning: { trace: 'PRIVATE_RELATIONAL_REASONING' } };
  } } });
  const observed = await observer.observe({ sampleId: 'RELATIONAL', inputHash: 'r'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'GEOMETRY_01', category: 'GEOMETRY_OCCLUSION', task: 'query', question: 'Inspect the visible overlap relationship without inferring image origin.', reasoningMode: 'DIRECT' } });
  const evaluation = evaluateGeometryOcclusionObservation({ observation: observed.observations[0], truth });
  assert.equal(evaluation.occlusionIdentified, 'TRUE');
  assert.equal(evaluation.frontBackCorrect, 'TRUE');
  assert.equal(evaluation.geometryConsistencyCorrect, 'TRUE');
  assert.equal(evaluation.controlObjectFalseRelation, 'TRUE');
  assert.equal(evaluation.requiresReview, false);
  assert.equal(JSON.stringify(capturedRequest).includes('BLUE_RECTANGLE'), false);
  assert.equal(JSON.stringify(observed).includes('PRIVATE_RELATIONAL_REASONING'), false);
  const unclear = evaluateGeometryOcclusionObservation({ observation: { ...observed.observations[0], observation: 'Two coloured shapes are present.' }, truth });
  assert.equal(unclear.requiresReview, true);
  assert.equal(unclear.frontBackCorrect, 'REQUIRES_REVIEW');
  assert.equal(classifyGeometryOcclusionComparison({ direct: evaluation, reasoned: evaluation }), 'RELATIONAL_REASONING_SIGNAL_NEUTRAL');
});

test('relational A/B runner makes exactly one equal-input DIRECT and REASONED call', async () => {
  const requests = [];
  const truthLabels = ['BLUE_RECTANGLE', 'RED_RECTANGLE', 'GREEN_CIRCLE'];
  const result = await runResearchTrial({
    mode: 'OBSERVER_AB',
    runtimeManifest: manifest(1),
    maxSamples: 1,
    observerRequest: { queryId: 'GEOMETRY_OCCLUSION_01', category: 'GEOMETRY_OCCLUSION', task: 'query', question: 'Inspect the visible overlap relationship between the two primary coloured rectangular shapes.' },
    caps: { maxSamples: 1, maxObserverCalls: 2, maxObserverDirectCalls: 1, maxObserverReasonedCalls: 1, maxTotalCalls: 2 },
  }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    observer: { isLive: false, observe: async (input) => {
      requests.push(input.request);
      const observation = { category: 'GEOMETRY_OCCLUSION', applicable: true, status: 'INDETERMINATE', observation: 'The overlap relationship is unclear.', regions: [], measurementConfidence: null, limitations: [] };
      return createMockVisionObserver([observation]).observe(input);
    } },
  });
  assert.equal(requests.length, 2);
  const { reasoningMode: directMode, ...directRequest } = requests[0];
  const { reasoningMode: reasonedMode, ...reasonedRequest } = requests[1];
  assert.equal(directMode, 'DIRECT');
  assert.equal(reasonedMode, 'REASONED');
  assert.deepEqual(directRequest, reasonedRequest);
  assert.equal(truthLabels.some((label) => JSON.stringify(requests).includes(label)), false);
  assert.equal(result.invocationAccounting.calls.observerDirect, 1);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 1);
  assert.equal(result.invocationAccounting.calls.total, 2);
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
    assert.equal(result.providerEvidence.httpStatus, status);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  const diagnostic = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => jsonResponse({ error: { type: 'invalid_request_error', code: 'invalid_image', param: 'input', message: `Bearer ${secret}` } }, 400) });
  const diagnosticResult = await diagnostic.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(diagnosticResult.providerEvidence.httpStatus, 400);
  assert.equal(diagnosticResult.providerEvidence.errorType, 'invalid_request_error');
  assert.equal(diagnosticResult.providerEvidence.errorCode, 'invalid_image');
  assert.equal(diagnosticResult.providerEvidence.errorParam, 'input');
  assert.equal(JSON.stringify(diagnosticResult).includes(secret), false);
  const malformed = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => new Response('{', { status: 200 }) });
  const malformedResult = await malformed.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(malformedResult.providerEvidence.errorCategory, 'MALFORMED_RESPONSE');
  assert.equal(malformedResult.providerEvidence.httpStatus, 200);
  const missing = createOpenAIModerationProvider({ apiKey: secret, fetchImpl: async () => jsonResponse({ model: OPENAI_MODERATION_MODEL, results: [{}] }) });
  const missingResult = await missing.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  assert.equal(missingResult.providerEvidence.errorCategory, 'UNEXPECTED_SCHEMA');
  assert.equal(missingResult.providerEvidence.httpStatus, 200);
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

test('Cloudflare REST transport uses the documented endpoint, redacts failures, and enforces a hard cap', async () => {
  let request;
  const transport = createCloudflareRestTransport({
    apiToken: 'cloudflare-secret-fixture',
    accountId: 'account-fixture',
    allowNetwork: true,
    maxRequests: 1,
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return jsonResponse({ success: true, result: { answer: 'fixture' }, errors: [], messages: [] });
    },
  });
  const result = await transport.run({ kind: 'VISION_OBSERVER', model: CLOUDFLARE_VISION_OBSERVER_MODEL, payload: { task: 'query', reasoning: false } });
  assert.equal(result.result.answer, 'fixture');
  assert.match(request.url, /\/accounts\/account-fixture\/ai\/run\/%40cf\/moondream\/moondream3\.1-9B-A2B$/);
  assert.equal(request.init.headers.Authorization, 'Bearer cloudflare-secret-fixture');
  assert.equal(request.body.reasoning, false);
  assert.equal(transport.snapshot().calls, 1);
  assert.equal(transport.snapshot().successes, 1);
  await assert.rejects(transport.run({ kind: 'VISION_OBSERVER', model: CLOUDFLARE_VISION_OBSERVER_MODEL, payload: {} }), (error) => error instanceof CloudflareRestError && error.category === 'INVOCATION_CAP_EXCEEDED');
  assert.equal(transport.snapshot().calls, 1);
  assert.equal(JSON.stringify(transport.snapshot()).includes('cloudflare-secret-fixture'), false);
});

test('Cloudflare REST transport defaults to no network and maps credential, HTTP, schema, and timeout failures', async () => {
  const disabled = createCloudflareRestTransport({ apiToken: 'fixture', accountId: 'account', maxRequests: 1 });
  await assert.rejects(disabled.run({ kind: 'JUDGE', model: CLOUDFLARE_REASONER_MODEL, payload: {} }), (error) => error instanceof CloudflareRestError && error.category === 'NETWORK_DISABLED');
  const missing = createCloudflareRestTransport({ accountId: 'account', allowNetwork: true, maxRequests: 1, fetchImpl: async () => jsonResponse({ success: true, result: {} }) });
  await assert.rejects(missing.run({ kind: 'JUDGE', model: CLOUDFLARE_REASONER_MODEL, payload: {} }), (error) => error instanceof CloudflareRestError && error.category === 'MISSING_CREDENTIAL');
  for (const [status, category] of [[401, 'HTTP_AUTHENTICATION_FAILURE'], [429, 'HTTP_RATE_LIMITED'], [500, 'HTTP_SERVER_FAILURE']]) {
    const transport = createCloudflareRestTransport({ apiToken: 'secret', accountId: 'account', allowNetwork: true, maxRequests: 1, fetchImpl: async () => jsonResponse({ error: 'redacted' }, status) });
    await assert.rejects(transport.run({ kind: 'JUDGE', model: CLOUDFLARE_REASONER_MODEL, payload: {} }), (error) => error instanceof CloudflareRestError && error.category === category);
    assert.equal(JSON.stringify(transport.snapshot()).includes('secret'), false);
  }
  const malformed = createCloudflareRestTransport({ apiToken: 'secret', accountId: 'account', allowNetwork: true, maxRequests: 1, fetchImpl: async () => jsonResponse({ success: true }) });
  await assert.rejects(malformed.run({ kind: 'JUDGE', model: CLOUDFLARE_REASONER_MODEL, payload: {} }), (error) => error instanceof CloudflareRestError && error.category === 'MALFORMED_RESPONSE');
  const timeout = createCloudflareRestTransport({ apiToken: 'secret', accountId: 'account', allowNetwork: true, maxRequests: 1, timeoutMs: 1, fetchImpl: async () => new Promise(() => {}) });
  await assert.rejects(timeout.run({ kind: 'JUDGE', model: CLOUDFLARE_REASONER_MODEL, payload: {} }), (error) => error instanceof CloudflareRestError && error.category === 'TIMEOUT');
  assert.deepEqual(cloudflareRestCredentialsFromEnvironment({ CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'id' }), { apiToken: 'token', accountId: 'id' });
});

test('Cloudflare REST diagnostics preserve safe HTTP categories and Observer transport metadata', async () => {
  const cases = [
    [400, 'HTTP_FAILURE', 'HTTP_FAILURE'],
    [401, 'HTTP_AUTHENTICATION_FAILURE', 'AUTHENTICATION_FAILURE'],
    [403, 'HTTP_AUTHENTICATION_FAILURE', 'AUTHENTICATION_FAILURE'],
    [429, 'HTTP_RATE_LIMITED', 'RATE_LIMITED'],
    [500, 'HTTP_SERVER_FAILURE', 'SERVER_FAILURE'],
  ];
  for (const [status, transportCategory, observerCategory] of cases) {
    const transport = createCloudflareRestTransport({
      apiToken: 'cloudflare-secret-fixture',
      accountId: 'account-fixture',
      allowNetwork: true,
      maxRequests: 1,
      fetchImpl: async () => jsonResponse({ success: false, errors: [{ code: 10000 + status, message: 'sensitive provider text', message_code: `HTTP_${status}` }] }, status),
    });
    const observer = createCloudflareVisionObserverRest({ transport });
    const result = await observer.observe({ sampleId: 'SAMPLE', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.', reasoningMode: 'DIRECT' } });
    assert.equal(result.status, 'PROVIDER_FAILURE');
    assert.equal(result.errorCategory, observerCategory);
    assert.equal(result.transportErrorCategory, transportCategory);
    assert.equal(result.httpStatus, status);
    assert.equal(result.providerErrorCode, 10000 + status);
    assert.equal(result.providerErrorMessageCode, `HTTP_${status}`);
    assert.equal(transport.snapshot().invocations[0].httpStatus, status);
    assert.equal(transport.snapshot().invocations[0].transportErrorCategory, transportCategory);
    assert.equal(transport.snapshot().invocations[0].providerErrorCode, 10000 + status);
    assert.equal(JSON.stringify(result).includes('sensitive provider text'), false);
    assert.equal(JSON.stringify(result).includes('cloudflare-secret-fixture'), false);
    assert.equal(JSON.stringify(result).includes('data:image'), false);
  }
  assert.deepEqual(cloudflareSafeProviderDiagnosticsFromBody({ success: false, errors: [{ code: 10000, message: 'do not retain this', message_code: 'AUTHENTICATION' }] }), { providerErrorCode: 10000, providerErrorMessageCode: 'AUTHENTICATION' });
  assert.deepEqual(cloudflareSafeProviderDiagnosticsFromBody({ success: false, errors: [{ code: 10000, message: 'do not retain this' }] }), { providerErrorCode: 10000, providerErrorMessageCode: null });
});

test('Cloudflare Observer keeps true network rejection and timeout distinct', async () => {
  const networkTransport = createCloudflareRestTransport({ apiToken: 'secret', accountId: 'account', allowNetwork: true, maxRequests: 1, fetchImpl: async () => { throw new Error('Bearer secret'); } });
  const networkObserver = createCloudflareVisionObserverRest({ transport: networkTransport });
  const networkResult = await networkObserver.observe({ sampleId: 'SAMPLE', inputHash: 'b'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.', reasoningMode: 'DIRECT' } });
  assert.equal(networkResult.errorCategory, 'NETWORK_FAILURE');
  assert.equal(networkResult.transportErrorCategory, 'NETWORK_FAILURE');
  assert.equal(networkResult.httpStatus, null);
  assert.equal(JSON.stringify(networkResult).includes('secret'), false);

  const timeoutTransport = createCloudflareRestTransport({ apiToken: 'secret', accountId: 'account', allowNetwork: true, maxRequests: 1, timeoutMs: 1, fetchImpl: async () => new Promise(() => {}) });
  const timeoutObserver = createCloudflareVisionObserverRest({ transport: timeoutTransport });
  const timeoutResult = await timeoutObserver.observe({ sampleId: 'SAMPLE', inputHash: 'c'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.', reasoningMode: 'DIRECT' } });
  assert.equal(timeoutResult.errorCategory, 'TIMEOUT');
  assert.equal(timeoutResult.transportErrorCategory, 'TIMEOUT');
  assert.equal(timeoutResult.httpStatus, null);
});

test('Cloudflare model-schema access preflight is read-only, bounded, and sanitized', async () => {
  let request;
  const success = await runCloudflareModelSchemaPreflight({ apiToken: 'cloudflare-secret-fixture', accountId: 'account-fixture', model: CLOUDFLARE_VISION_OBSERVER_MODEL, allowNetwork: true, timeoutMs: 100, fetchImpl: async (url, init) => {
    request = { url, init };
    return jsonResponse({ success: true, result: { input: { type: 'object', properties: { image: {}, task: {}, question: {}, reasoning: {}, stream: {}, temperature: {}, top_p: {}, max_tokens: {} } }, output: { type: 'object', properties: { answer: {}, reasoning: {}, metrics: {} } } } });
  } });
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.schemaAvailable, true);
  assert.equal(success.httpStatus, 200);
  assert.deepEqual(success.inputSchemaPropertyNames, ['image', 'max_tokens', 'question', 'reasoning', 'stream', 'task', 'temperature', 'top_p']);
  assert.deepEqual(success.outputSchemaPropertyNames, ['answer', 'metrics', 'reasoning']);
  assert.equal(success.responseFormatSupport, 'MOONDREAM_RESPONSE_FORMAT_NOT_DECLARED');
  assert.equal(success.responseFormatDeclared, false);
  assert.equal(success.outputResponseType, null);
  assert.equal(success.responseExpectation, null);
  assert.equal(new URL(request.url).pathname, '/client/v4/accounts/account-fixture/ai/models/schema');
  assert.equal(new URL(request.url).searchParams.get('model'), CLOUDFLARE_VISION_OBSERVER_MODEL);
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.Authorization, 'Bearer cloudflare-secret-fixture');
  assert.equal(JSON.stringify(success).includes('cloudflare-secret-fixture'), false);

  const denied = await runCloudflareModelSchemaPreflight({ apiToken: 'cloudflare-secret-fixture', accountId: 'account-fixture', model: CLOUDFLARE_VISION_OBSERVER_MODEL, allowNetwork: true, fetchImpl: async () => jsonResponse({ success: false, errors: [{ code: 10000, message: 'sensitive denial', message_code: 'AUTHENTICATION' }] }, 403) });
  assert.equal(denied.status, 'PROVIDER_FAILURE');
  assert.equal(denied.schemaAvailable, false);
  assert.equal(denied.httpStatus, 403);
  assert.equal(denied.transportErrorCategory, 'HTTP_AUTHENTICATION_FAILURE');
  assert.equal(denied.providerErrorCode, 10000);
  assert.equal(denied.providerErrorMessageCode, 'AUTHENTICATION');
  assert.equal(JSON.stringify(denied).includes('sensitive denial'), false);

  const disabled = await runCloudflareModelSchemaPreflight({ apiToken: 'secret', accountId: 'account', fetchImpl: async () => { throw new Error('must not run'); } });
  assert.equal(disabled.status, 'PROVIDER_FAILURE');
  assert.equal(disabled.transportErrorCategory, 'NETWORK_DISABLED');
});

test('Cloudflare schema preflight reports GPT-OSS response expectation separately', async () => {
  const result = await runCloudflareModelSchemaPreflight({
    apiToken: 'cloudflare-secret-fixture',
    accountId: 'account-fixture',
    model: CLOUDFLARE_REASONER_MODEL,
    allowNetwork: true,
    fetchImpl: async () => jsonResponse({
      success: true,
      result: {
        input: { type: 'object', properties: { messages: {}, response_format: {}, temperature: {}, max_tokens: {}, stream: {} } },
        output: { type: 'object', properties: { response: { type: 'string' }, usage: { type: 'object' }, tool_calls: { type: 'array' } } },
      },
    }),
  });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.model, CLOUDFLARE_REASONER_MODEL);
  assert.equal(result.responseFormatDeclared, true);
  assert.equal(result.outputResponseType, 'STRING');
  assert.equal(result.responseExpectation, 'GPT_OSS_RESPONSE_STRING_EXPECTED');
  assert.deepEqual(result.outputSchemaPropertyNames, ['response', 'tool_calls', 'usage']);
  assert.equal(JSON.stringify(result).includes('cloudflare-secret-fixture'), false);
});

test('live smoke exit code is non-zero for provider failure and zero for success', () => {
  const base = { cases: [], judgeOnlyResults: [], invocationAccounting: { providerFailures: 0 } };
  assert.equal(researchRunExitCode(base), 0);
  assert.equal(researchRunExitCode({ ...base, invocationAccounting: { providerFailures: 1 } }), 1);
  assert.equal(researchRunExitCode({ ...base, cases: [{ moderation: null, observer: { status: 'PROVIDER_FAILURE' }, judge: null, judgeHistory: [] }] }), 1);
});

test('Vision Observer sends only visual protocol instructions and returns observations without a verdict', async () => {
  let called;
  const observer = createCloudflareVisionObserver({
    ai: { run: async (model, input, options) => { called = { model, input, options }; return { response: JSON.stringify({ observations: [{ category: 'TEXT', applicable: true, status: 'INDETERMINATE', observation: 'A text region is partly occluded.', regions: [{ coordinateSpace: 'NORMALIZED', x: 0.1, y: 0.2, width: 0.3, height: 0.2 }], measurementConfidence: 0.4, limitations: ['Partial visibility.'] }] }) }; } },
  });
  const result = await observer.observe({ sampleId: 'SAMPLE_1', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'TEXT_01', category: 'TEXT', task: 'query', question: 'Describe visible text regions.' } });
  assert.equal(called.model, CLOUDFLARE_VISION_OBSERVER_MODEL);
  assert.equal(called.input.task, 'query');
  assert.match(called.input.image, /^data:image\/png;base64,/);
  assert.match(called.input.question, /do not determine whether the image is AI-generated/i);
  assert.equal(called.options.metadata.protocolVersion, VISION_OBSERVER_PROTOCOL_VERSION);
  assert.equal(called.options.metadata.promptVersion, VISION_OBSERVER_PROMPT_VERSION);
  assert.equal(called.options.metadata.observerTemperature, '0');
  assert.equal(called.options.metadata.observerMaxTokens, String(VISION_OBSERVER_QUERY_GENERATION_CONFIG.maxTokens));
  assert.equal(called.options.metadata.observerStream, 'false');
  assert.equal(called.input.temperature, 0);
  assert.equal(called.input.max_tokens, VISION_OBSERVER_QUERY_GENERATION_CONFIG.maxTokens);
  assert.equal(called.input.stream, false);
  assert.match(called.input.question, /status MUST be exactly one of: OBSERVED, NOT_OBSERVED, INDETERMINATE, NOT_APPLICABLE/);
  assert.match(called.input.question, /category MUST exactly equal TEXT/);
  assert.match(called.input.question, /"category": "TEXT"/);
  assert.equal(result.protocolVersion, VISION_OBSERVER_PROTOCOL_VERSION);
  assert.equal(result.promptVersion, 'lythaus-vision-observer-prompt-v2');
  assert.deepEqual(result.generationConfig, VISION_OBSERVER_QUERY_GENERATION_CONFIG);
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

test('Moondream query diagnostics preserve successful HTTP metadata without retaining answer or reasoning text', async () => {
  const transport = createCloudflareRestTransport({
    apiToken: 'fixture-token',
    accountId: 'fixture-account',
    allowNetwork: true,
    maxRequests: 1,
    fetchImpl: async () => jsonResponse({ success: true, result: { answer: 'The image appears to be a plain grey square.', reasoning: { trace: 'PRIVATE_REASONING_TRACE' }, metrics: { inputTokens: 1 } } }),
  });
  const observer = createCloudflareVisionObserverRest({ transport });
  const result = await observer.observe({ sampleId: 'SAMPLE', inputHash: 'diag'.repeat(16), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } });
  assert.equal(result.status, 'PROVIDER_FAILURE');
  assert.equal(result.errorCategory, 'UNEXPECTED_SCHEMA');
  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.responseDiagnostics, {
    transportSucceeded: true,
    providerResultType: 'OBJECT',
    providerTopLevelKeys: ['answer', 'metrics', 'reasoning'],
    answerPresent: true,
    answerType: 'string',
    answerLength: 44,
    reasoningFieldPresent: true,
    reasoningFieldType: 'object',
    answerJsonParseable: false,
    parsedTopLevelType: null,
    parsedTopLevelKeys: [],
    observationsPresent: null,
    observationCount: null,
    normalizationFailureCode: 'ANSWER_NOT_JSON',
  });
  assert.equal(JSON.stringify(result).includes('plain grey square'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING_TRACE'), false);
  assert.equal(JSON.stringify(result).includes('fixture-token'), false);
});

test('Moondream query parser accepts structured answer JSON and fenced JSON but never prose', async () => {
  const observation = { category: 'SCENE_INVENTORY', applicable: true, status: 'OBSERVED', observation: 'A uniform grey image is visible.', regions: [], measurementConfidence: null, limitations: [] };
  const structured = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [observation] }), reasoning: { trace: 'PRIVATE_REASONING_TRACE' } }) } });
  const structuredResult = await structured.observe({ sampleId: 'SAMPLE', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } });
  assert.equal(structuredResult.status, 'SUCCESS');
  assert.equal(structuredResult.responseDiagnostics.answerJsonParseable, true);
  assert.equal(structuredResult.responseDiagnostics.parsedTopLevelType, 'OBJECT');
  assert.equal(structuredResult.responseDiagnostics.observationsPresent, true);
  assert.equal(structuredResult.responseDiagnostics.observationCount, 1);
  assert.equal(structuredResult.responseDiagnostics.normalizationFailureCode, null);
  assert.equal(JSON.stringify(structuredResult).includes('PRIVATE_REASONING_TRACE'), false);

  const fenced = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: `\`\`\`json\n${JSON.stringify({ observations: [observation] })}\n\`\`\`` }) } });
  const fencedResult = await fenced.observe({ sampleId: 'SAMPLE', inputHash: 'b'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_02', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } });
  assert.equal(fencedResult.status, 'SUCCESS');
  assert.equal(fencedResult.responseDiagnostics.answerJsonParseable, true);

  const prose = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: 'The image appears to be a plain grey square.' }) } });
  const proseResult = await prose.observe({ sampleId: 'SAMPLE', inputHash: 'c'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_03', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } });
  assert.equal(proseResult.status, 'PROVIDER_FAILURE');
  assert.equal(proseResult.responseDiagnostics.normalizationFailureCode, 'ANSWER_NOT_JSON');
  assert.equal(proseResult.observations.length, 0);
});

test('Vision Observer prompt v2 and parser enforce the canonical status contract', async () => {
  assert.equal(VISION_OBSERVER_PROMPT_VERSION, 'lythaus-vision-observer-prompt-v2');
  assert.match(VISION_OBSERVER_PROMPT, /Return JSON only/);
  assert.match(VISION_OBSERVER_PROMPT, /OBSERVED, NOT_OBSERVED, INDETERMINATE, NOT_APPLICABLE/);
  assert.match(VISION_OBSERVER_PROMPT, /NOT_APPLICABLE.*applicable MUST be false/s);
  assert.match(VISION_OBSERVER_PROMPT, /For OBSERVED, NOT_OBSERVED, and INDETERMINATE, applicable MUST be true/s);
  assert.match(VISION_OBSERVER_PROMPT, /between 1 and 8 concise observations/);

  const base = { sampleId: 'STATUS', inputHash: '5'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'STATUS_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } };
  for (const status of ['OBSERVED', 'NOT_OBSERVED', 'INDETERMINATE', 'NOT_APPLICABLE']) {
    const applicable = status !== 'NOT_APPLICABLE';
    const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable, status, observation: 'A bounded visual observation.', regions: [], measurementConfidence: null, limitations: [] }] }) }) } });
    const result = await observer.observe(base);
    assert.equal(result.status, 'SUCCESS', status);
    assert.equal(result.observations[0].status, status);
    assert.equal(result.observations[0].applicable, applicable);
  }

  for (const status of ['VISIBLE', 'PRESENT', 'observed', 'YES', 'anything else']) {
    const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status, observation: 'Must be rejected.', regions: [], measurementConfidence: null, limitations: [] }] }) }) } });
    const result = await observer.observe(base);
    assert.equal(result.status, 'PROVIDER_FAILURE', status);
    assert.equal(result.responseDiagnostics.normalizationFailureCode, 'STATUS_INVALID');
    if (status === 'VISIBLE' || status === 'PRESENT' || status === 'YES') assert.equal(result.responseDiagnostics.invalidStatusToken, status);
    else assert.equal(result.responseDiagnostics.invalidStatusToken, undefined);
  }

  const mismatchedNotApplicable = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'NOT_APPLICABLE', observation: 'Mismatch.', regions: [], measurementConfidence: null, limitations: [] }] }) }) } });
  assert.equal((await mismatchedNotApplicable.observe(base)).responseDiagnostics.normalizationFailureCode, 'APPLICABILITY_STATUS_MISMATCH');

  const overLimit = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: Array.from({ length: 9 }, () => ({ category: 'SCENE_INVENTORY', applicable: true, status: 'OBSERVED', observation: 'Bounded.', regions: [], measurementConfidence: null, limitations: [] })) }) }) } });
  const overLimitResult = await overLimit.observe(base);
  assert.equal(overLimitResult.status, 'PROVIDER_FAILURE');
  assert.equal(overLimitResult.responseDiagnostics.normalizationFailureCode, 'OBSERVATIONS_TOO_MANY');
  assert.equal(overLimitResult.responseDiagnostics.observationCount, 9);
});

test('safe invalid status diagnostics never enter Evidence Packet or Judge input', async () => {
  const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'VISIBLE', observation: 'Diagnostic-only token.', regions: [], measurementConfidence: null, limitations: [] }] }), reasoning: { private: 'PRIVATE_REASONING_TRACE' } }) } });
  const result = await observer.observe({ sampleId: 'SAMPLE', inputHash: '6'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'STATUS_02', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } });
  assert.equal(result.responseDiagnostics.invalidStatusToken, 'VISIBLE');
  assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING_TRACE'), false);
  const packet = buildEvidencePacket({ runId: 'status-diagnostic', caseId: CASE_ID, sampleId: 'SAMPLE', sourceFamilyId: 'FAMILY', preflight: { inputHash: '6'.repeat(64), mime: 'image/png', dimensions: null }, observer: result });
  assert.equal(JSON.stringify(packet).includes('VISIBLE'), false);
  assert.equal(JSON.stringify(buildJudgeRequest(packet)).includes('VISIBLE'), false);
});

test('Moondream query diagnostics identify precise answer and observation schema failures', async () => {
  const run = (answer) => createCloudflareVisionObserver({ ai: { run: async () => ({ answer }) } });
  const base = { sampleId: 'SAMPLE', inputHash: 'd'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_04', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } };
  const missingAnswer = await run('').observe(base);
  assert.equal(missingAnswer.responseDiagnostics.normalizationFailureCode, 'ANSWER_MISSING');
  const missingObservations = await run(JSON.stringify({ result: 'no observations' })).observe(base);
  assert.equal(missingObservations.responseDiagnostics.normalizationFailureCode, 'OBSERVATIONS_MISSING');
  const wrongCategory = await run(JSON.stringify({ observations: [{ category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'wrong target', regions: [], measurementConfidence: null, limitations: [] }] })).observe(base);
  assert.equal(wrongCategory.responseDiagnostics.normalizationFailureCode, 'CATEGORY_MISMATCH');
  const missingApplicable = await run(JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', status: 'OBSERVED', observation: 'missing applicability', regions: [], measurementConfidence: null, limitations: [] }] })).observe(base);
  assert.equal(missingApplicable.responseDiagnostics.normalizationFailureCode, 'APPLICABLE_MISSING');
  const invalidStatus = await run(JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'MAYBE', observation: 'invalid status', regions: [], measurementConfidence: null, limitations: [] }] })).observe(base);
  assert.equal(invalidStatus.responseDiagnostics.normalizationFailureCode, 'STATUS_INVALID');
});

test('Vision Observer maps direct and reasoned query modes, escalates only in the research layer, and discards raw reasoning', async () => {
  const calls = [];
  const observer = createCloudflareVisionObserver({
    ai: { run: async (_model, input) => {
      calls.push(input);
      const observation = input.reasoning
        ? { category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'The visible reflection is consistent with the scene.', regions: [], measurementConfidence: 0.78, limitations: [] }
        : { category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'The reflective surface is partly obscured.', regions: [], measurementConfidence: 0.4, limitations: ['Partial visibility.'] };
      return { answer: JSON.stringify({ observations: [observation] }), reasoning: { trace: 'PRIVATE_REASONING_TRACE_MUST_NOT_ESCAPE' } };
    } },
  });
  const base = { sampleId: 'SAMPLE', inputHash: 'f'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'REFLECTION_01', category: 'REFLECTION', task: 'query', question: 'Describe reflection consistency without making an origin judgment.' } };
  const direct = await observer.observe({ ...base, request: { ...base.request, reasoningMode: 'DIRECT' } });
  const reasoned = await observer.observe({ ...base, request: { ...base.request, reasoningMode: 'REASONED' } });
  assert.equal(calls[0].reasoning, false);
  assert.equal(calls[1].reasoning, true);
  assert.equal(direct.reasoningMode, 'DIRECT');
  assert.equal(reasoned.reasoningMode, 'REASONED');
  assert.equal(direct.escalationRecommendation, 'REASONED_VISUAL_RECHECK');
  assert.equal(reasoned.escalationRecommendation, 'NONE');
  assert.equal(JSON.stringify(direct).includes('PRIVATE_REASONING_TRACE_MUST_NOT_ESCAPE'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(direct, 'primaryHypothesis'), false);
  const compared = compareVisionObserverResults({ sampleId: 'SAMPLE', inputHash: 'f'.repeat(64), category: 'REFLECTION', direct, reasoned });
  assert.equal(compared.contradictory, false);
  assert.equal(compared.direct.reasoningMode, 'DIRECT');
  assert.equal(compared.reasoned.reasoningMode, 'REASONED');
  const built = buildEvidencePacket({ runId: 'reasoning-run', caseId: CASE_ID, sampleId: 'SAMPLE', sourceFamilyId: 'FAMILY', preflight: { inputHash: 'f'.repeat(64), mime: 'image/png', dimensions: null }, observer: reasoned, observationHistory: direct.observations });
  assert.equal(JSON.stringify(buildJudgeRequest(built)).includes('PRIVATE_REASONING_TRACE_MUST_NOT_ESCAPE'), false);
  assert.deepEqual(built.originAxes, { cameraEvidence: 'CAMERA_ORIGIN_UNCERTAIN', syntheticEvidence: 'NO_POSITIVE_SYNTHETIC_EVIDENCE' });

  const sufficientDirect = createCloudflareVisionObserver({
    ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'The reflection is visible and consistent.', regions: [], measurementConfidence: 0.9, limitations: [] }] }) }) },
  });
  const sufficient = await sufficientDirect.observe({ ...base, request: { ...base.request, reasoningMode: 'DIRECT' } });
  assert.equal(sufficient.escalationRecommendation, 'NONE');
});

test('query observations fail closed on unstructured origin-like provider text', async () => {
  const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: 'This image looks AI-generated.' }) } });
  const result = await observer.observe({ sampleId: 'SAMPLE', inputHash: 'q'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.' } });
  assert.equal(result.status, 'PROVIDER_FAILURE');
  assert.equal(result.observations.length, 0);
  assert.equal(JSON.stringify(result).includes('This image looks AI-generated.'), false);
  const inputPacket = buildEvidencePacket({ runId: 'malformed-query', caseId: CASE_ID, sampleId: 'SAMPLE', sourceFamilyId: 'FAMILY', preflight: { inputHash: 'q'.repeat(64), mime: 'image/png', dimensions: null }, observer: result });
  assert.equal(JSON.stringify(inputPacket).includes('This image looks AI-generated.'), false);
  assert.equal(JSON.stringify(buildJudgeRequest(inputPacket)).includes('This image looks AI-generated.'), false);
});

test('targeted Observer output must preserve category and applicable/status consistency', async () => {
  const wrongCategory = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'wrong target', regions: [], measurementConfidence: null, limitations: [] }] }) }) } });
  const wrongCategoryResult = await wrongCategory.observe({ sampleId: 'SAMPLE', inputHash: 'r'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'TEXT_01', category: 'TEXT', task: 'query', question: 'Describe text.' } });
  assert.equal(wrongCategoryResult.status, 'PROVIDER_FAILURE');
  const inconsistent = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'TEXT', applicable: false, status: 'OBSERVED', observation: 'inconsistent', regions: [], measurementConfidence: null, limitations: [] }] }) }) } });
  const inconsistentResult = await inconsistent.observe({ sampleId: 'SAMPLE', inputHash: 's'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'TEXT_02', category: 'TEXT', task: 'query', question: 'Describe text.' } });
  assert.equal(inconsistentResult.status, 'PROVIDER_FAILURE');
  const inconsistentNotApplicable = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'TEXT', applicable: true, status: 'NOT_APPLICABLE', observation: 'inconsistent', regions: [], measurementConfidence: null, limitations: [] }] }) }) } });
  assert.equal((await inconsistentNotApplicable.observe({ sampleId: 'SAMPLE', inputHash: 't'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'TEXT_03', category: 'TEXT', task: 'query', question: 'Describe text.' } })).status, 'PROVIDER_FAILURE');
});

test('failed Observer comparisons retain the requested category', async () => {
  const make = (reasoningMode) => createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'GEOMETRY_OCCLUSION', applicable: true, status: 'OBSERVED', observation: 'A relationship is visible.', regions: [{ name: 'provider-only', position: { x1: 0, y1: 0, x2: 1, y2: 1 } }], measurementConfidence: null, limitations: [] }] }) }) } }).observe({ sampleId: 'FAILED_AB', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'GEOMETRY_FRONTBACK_01', category: 'GEOMETRY_OCCLUSION', task: 'query', reasoningMode } });
  const direct = await make('DIRECT');
  const reasoned = await make('REASONED');
  const compared = compareVisionObserverResults({ sampleId: 'FAILED_AB', inputHash: 'a'.repeat(64), category: 'GEOMETRY_OCCLUSION', direct, reasoned });
  assert.equal(direct.status, 'PROVIDER_FAILURE');
  assert.equal(reasoned.status, 'PROVIDER_FAILURE');
  assert.equal(compared.category, 'GEOMETRY_OCCLUSION');
  assert.notEqual(compared.category, 'SCENE_INVENTORY');
});

test('indeterminate escalation uses neutral uncertainty and controlled occlusion reasons', async () => {
  const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'The surface is obscured.', regions: [], measurementConfidence: 0.4, limitations: [] }] }) }) } });
  const result = await observer.observe({ sampleId: 'SAMPLE', inputHash: 'u'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'REFLECTION_02', category: 'REFLECTION', task: 'query', question: 'Describe reflection consistency.' } });
  assert.equal(result.escalationReasons.includes('OBSERVATION_INDETERMINATE'), true);
  assert.equal(result.escalationReasons.includes('PARTIAL_OCCLUSION'), false);
  const controlled = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'ANATOMY', applicable: true, status: 'INDETERMINATE', observation: 'Only part is visible.', occlusion: 'PARTIAL', regions: [], measurementConfidence: 0.4, limitations: [] }] }) }) } });
  const controlledResult = await controlled.observe({ sampleId: 'SAMPLE', inputHash: 'v'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'ANATOMY_01', category: 'ANATOMY', task: 'query', question: 'Describe visible anatomy.' } });
  assert.equal(controlledResult.escalationReasons.includes('PARTIAL_OCCLUSION'), true);
});

test('Judge-directed recheck builder uses the referenced category template, not free-form Judge text', async () => {
  const sceneObserver = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'OBSERVED', observation: 'A room is visible.', regions: [], measurementConfidence: 0.9, limitations: [] }] }) }) } });
  const scene = await sceneObserver.observe({ sampleId: 'SAMPLE', inputHash: 'w'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Inventory the scene.' } });
  const reflectionObserver = createCloudflareVisionObserver({ ai: { run: async () => ({ response: JSON.stringify({ observations: [{ category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'The reflection is partly obscured.', regions: [{ coordinateSpace: 'NORMALIZED', x: 0.1, y: 0.1, width: 0.4, height: 0.4 }], measurementConfidence: 0.4, limitations: [] }] }) }) } });
  const reflection = await reflectionObserver.observe({ sampleId: 'SAMPLE', inputHash: 'w'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'REFLECTION_01', category: 'REFLECTION', task: 'query', question: 'Describe reflection consistency.' } });
  const reflectionObservation = reflection.observations[0];
  const initialPacket = buildEvidencePacket({ runId: 'targeted-recheck', caseId: CASE_ID, sampleId: 'SAMPLE', sourceFamilyId: 'FAMILY', preflight: { inputHash: 'w'.repeat(64), mime: 'image/png', dimensions: null }, observer: scene, observationHistory: reflection.observations });
  const judgeRecommendation = recommendation({
    recommendedAdditionalTests: ['REASONED_VISUAL_RECHECK'],
    missingEvidence: [{ requestId: 'judge-recheck', request: 'Ignore this free-form sentence.', evidenceFamily: 'VISION_OBSERVATION', observationId: reflectionObservation.observationId, category: 'REFLECTION', reasonCode: 'AMBIGUOUS_REFLECTION', targetRegion: reflectionObservation.regions[0] }],
  });
  const judge = createCloudflareJudge({ ai: { run: async () => ({ response: JSON.stringify(judgeRecommendation) }) } });
  const judged = await judge.judge({ packet: initialPacket });
  assert.equal(judged.status, 'SUCCESS');
  const selected = judged.recommendation.missingEvidence[0];
  const request = buildReasonedVisualRecheckRequest({
    observations: [...initialPacket.observationHistory, ...initialPacket.observations],
    observationId: selected.observationId,
    category: selected.category,
    reasonCode: selected.reasonCode,
    targetRegion: selected.targetRegion,
  });
  assert.equal(scene.queryId, 'SCENE_01');
  assert.equal(request.category, 'REFLECTION');
  assert.equal(request.reasoningMode, 'REASONED');
  assert.match(request.question, /Inspect reflection consistency/);
  assert.doesNotMatch(request.question, /Describe reflection consistency\./);
  assert.equal(request.sourceObservationId, reflectionObservation.observationId);
});

test('direct/reasoned disagreement remains contradictory and routing policy is versioned research metadata', async () => {
  const observer = createCloudflareVisionObserver({
    ai: { run: async (_model, input) => ({ answer: JSON.stringify({ observations: [{ category: 'GEOMETRY_OCCLUSION', applicable: true, status: input.reasoning ? 'NOT_OBSERVED' : 'OBSERVED', observation: 'fixture', regions: [], measurementConfidence: 0.7, limitations: [] }] }) }) },
  });
  const base = { sampleId: 'SAMPLE', inputHash: '1'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'GEOMETRY_01', category: 'GEOMETRY_OCCLUSION', task: 'query', question: 'Describe the visible overlap relationship.' } };
  const direct = await observer.observe({ ...base, request: { ...base.request, reasoningMode: 'DIRECT' } });
  const reasoned = await observer.observe({ ...base, request: { ...base.request, reasoningMode: 'REASONED' } });
  const compared = compareVisionObserverResults({ sampleId: 'SAMPLE', inputHash: '1'.repeat(64), category: 'GEOMETRY_OCCLUSION', direct, reasoned });
  assert.equal(compared.contradictory, true);
  const packetWithHistory = buildEvidencePacket({ runId: 'contradiction-run', caseId: CASE_ID, sampleId: 'SAMPLE', sourceFamilyId: 'FAMILY', preflight: { inputHash: '1'.repeat(64), mime: 'image/png', dimensions: null }, observer: reasoned, observationHistory: direct.observations, contradictoryObservationIds: [direct.observations[0].observationId, reasoned.observations[0].observationId] });
  assert.equal(packetWithHistory.quality.overall, 'CONTRADICTORY');
  assert.equal(packetWithHistory.observationHistory.length, 1);
  assert.equal(packetWithHistory.observations.length, 1);
  assert.equal(VISION_OBSERVER_ROUTING_POLICY.version, 'lythaus-vision-observer-routing-policy-v1');
  assert.equal(VISION_OBSERVER_ROUTING_POLICY.lowConfidenceThreshold, 0.65);
});

test('Evidence Packet preserves forensic families, missing evidence, and safety isolation', async () => {
  const forensic = await generateForensicFeatureBundleV1({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture(), decoded: decodedFixture(), now: '2026-01-01T00:00:00.000Z' });
  const moderation = createMockModerationProvider({ analyse: async () => ({ provider: 'fixture', result: 'REVIEW', reasonCodes: ['FLAGGED'], modelVersion: 'fixture', executionMs: 1, costEstimateUsd: 0, providerEvidence: { schemaVersion: 'lythaus-moderation-provider-evidence-v1', provider: 'fixture', model: 'fixture', flagged: true, categories: { violence: true }, categoryScores: { violence: 0.9 }, categoryAppliedInputTypes: { violence: ['image'] }, executionMs: 1, status: 'SUCCESS' } }) });
  const analysis = await moderation.analyseImage({ caseId: CASE_ID, mime: 'image/png', bytes: pngFixture() });
  const built = buildEvidencePacket({ runId: 'run', caseId: CASE_ID, sampleId: 'sample', sourceFamilyId: 'family', preflight: { inputHash: forensic.fileProvenance.sha256, mime: 'image/png', dimensions: forensic.fileProvenance.dimensions }, forensicBundle: forensic, moderation: analysis, now: '2026-01-01T00:00:00.000Z' });
  assert.equal(built.evidenceFamilies.EF1_FILE_PROVENANCE.status, 'AVAILABLE');
  assert.equal(built.evidenceFamilies.EF2_PHYSICAL_ACQUISITION.status, 'AVAILABLE');
  assert.equal(built.evidenceFamilies.EF3_GENERATIVE_FORENSICS.status, 'UNAVAILABLE');
  assert.equal(built.evidenceFamilies.EF4_SPECTRAL_STABILITY.status, 'AVAILABLE');
  assert.equal(built.evidenceFamilies.EF5_RECONSTRUCTION_LOCAL_MANIPULATION.status, 'UNAVAILABLE');
  assert.equal(built.quality.overall, 'PARTIAL');
  assert.deepEqual(built.quality.missingEvidenceFamilies, ['EF3_GENERATIVE_FORENSICS', 'EF5_RECONSTRUCTION_LOCAL_MANIPULATION']);
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

test('Judge normalizes one Cloudflare response envelope and exposes structural diagnostics only', async () => {
  const inputPacket = packet();
  const canonical = recommendation({ primaryHypothesis: 'INSUFFICIENT_EVIDENCE' });
  const cases = [
    ['direct canonical object', canonical, false],
    ['response object', { response: canonical }, true],
    ['response JSON string', { response: JSON.stringify(canonical) }, true],
    ['legacy result JSON string', { result: JSON.stringify(canonical) }, false],
    ['legacy output_text JSON string', { output_text: JSON.stringify(canonical) }, false],
  ];
  for (const [name, raw, responsePresent] of cases) {
    const judge = createCloudflareJudge({ ai: { run: async () => raw } });
    const result = await judge.judge({ packet: inputPacket });
    assert.equal(result.status, 'SUCCESS', name);
    assert.equal(result.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE', name);
    assert.equal(result.normalizationFailureCode, null, name);
    assert.equal(result.responseDiagnostics.transportSucceeded, true, name);
    assert.equal(result.responseDiagnostics.responsePresent, responsePresent, name);
    assert.equal(result.responseDiagnostics.normalizationFailureCode, null, name);
  }

  const withPrivateReasoning = createCloudflareJudge({ ai: { run: async () => ({ response: canonical, reasoning: { private: 'PRIVATE_REASONING_TRACE_MUST_NOT_RETAIN' } }) } });
  const reasoningResult = await withPrivateReasoning.judge({ packet: inputPacket });
  assert.equal(reasoningResult.status, 'SUCCESS');
  assert.equal(reasoningResult.responseDiagnostics.reasoningFieldPresent, true);
  assert.equal(reasoningResult.responseDiagnostics.reasoningFieldType, 'object');
  assert.equal(JSON.stringify(reasoningResult.responseDiagnostics).includes('PRIVATE_REASONING_TRACE_MUST_NOT_RETAIN'), false);
  assert.equal(JSON.stringify(reasoningResult).includes('PRIVATE_REASONING_TRACE_MUST_NOT_RETAIN'), false);

  const restTransport = createCloudflareRestTransport({
    apiToken: 'cloudflare-secret-fixture',
    accountId: 'account-fixture',
    allowNetwork: true,
    maxRequests: 1,
    fetchImpl: async () => jsonResponse({ success: true, result: { response: canonical, reasoning: { private: 'PRIVATE_REST_REASONING' } } }),
  });
  const restResult = await createCloudflareJudgeRest({ transport: restTransport }).judge({ packet: inputPacket });
  assert.equal(restResult.status, 'SUCCESS');
  assert.equal(restResult.httpStatus, 200);
  assert.equal(restResult.responseDiagnostics.responsePresent, true);
  assert.equal(restResult.responseDiagnostics.responseType, 'object');
  assert.equal(JSON.stringify(restResult).includes('PRIVATE_REST_REASONING'), false);
  assert.equal(JSON.stringify(restResult).includes('cloudflare-secret-fixture'), false);
});

test('Judge normalizes exactly one strict Chat Completions choice and preserves legacy envelopes', async () => {
  const inputPacket = packet();
  const canonical = recommendation({ primaryHypothesis: 'INSUFFICIENT_EVIDENCE' });
  const chatCompletion = (content, { finishReason = 'stop', message = {}, choice = {}, root = {} } = {}) => ({
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content, ...message },
      finish_reason: finishReason,
      ...choice,
    }],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    ...root,
  });

  const valid = createCloudflareJudge({ ai: { run: async () => chatCompletion(JSON.stringify(canonical)) } });
  const validResult = await valid.judge({ packet: inputPacket });
  assert.equal(validResult.status, 'SUCCESS');
  assert.equal(validResult.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
  assert.equal(validResult.responseDiagnostics.providerEnvelopeClassification, 'CHAT_COMPLETION');
  assert.equal(validResult.responseDiagnostics.choicesPresent, true);
  assert.equal(validResult.responseDiagnostics.choiceCount, 1);
  assert.equal(validResult.responseDiagnostics.firstChoiceType, 'object');
  assert.deepEqual(validResult.responseDiagnostics.firstChoiceKeys, ['finish_reason', 'index', 'message']);
  assert.equal(validResult.responseDiagnostics.firstChoiceIndexPresent, true);
  assert.equal(validResult.responseDiagnostics.firstChoiceIndexType, 'number');
  assert.equal(validResult.responseDiagnostics.messagePresent, true);
  assert.equal(validResult.responseDiagnostics.messageType, 'object');
  assert.deepEqual(validResult.responseDiagnostics.messageKeys, ['content', 'role']);
  assert.equal(validResult.responseDiagnostics.messageRolePresent, true);
  assert.equal(validResult.responseDiagnostics.messageRoleType, 'string');
  assert.equal(validResult.responseDiagnostics.messageContentPresent, true);
  assert.equal(validResult.responseDiagnostics.messageContentType, 'string');
  assert.equal(validResult.responseDiagnostics.messageContentLength, JSON.stringify(canonical).length);
  assert.equal(validResult.responseDiagnostics.finishReasonPresent, true);
  assert.equal(validResult.responseDiagnostics.finishReasonType, 'string');
  assert.equal(validResult.responseDiagnostics.finishReasonValueCode, 'STOP');
  assert.equal(validResult.responseDiagnostics.messageContentJsonParseable, true);
  assert.deepEqual(validResult.responseDiagnostics.messageContentTopLevelKeys, Object.keys(canonical).sort());
  assert.equal(validResult.responseDiagnostics.normalizationFailureCode, null);

  for (const raw of [
    canonical,
    { response: canonical },
    { response: JSON.stringify(canonical) },
    { result: JSON.stringify(canonical) },
    { output_text: JSON.stringify(canonical) },
  ]) {
    const legacy = createCloudflareJudge({ ai: { run: async () => raw } });
    const legacyResult = await legacy.judge({ packet: inputPacket });
    assert.equal(legacyResult.status, 'SUCCESS');
  }
});

test('Judge Chat Completions normalization fails closed with controlled structural codes', async () => {
  const inputPacket = packet();
  const canonical = recommendation({ primaryHypothesis: 'INSUFFICIENT_EVIDENCE' });
  const chatCompletion = (content, { finishReason = 'stop', message = {}, choice = {}, root = {} } = {}) => ({
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content, ...message },
      finish_reason: finishReason,
      ...choice,
    }],
    ...root,
  });
  const cases = [
    ['content prose', chatCompletion('The evidence is insufficient.'), 'MESSAGE_CONTENT_NOT_JSON'],
    ['invalid Judge schema', chatCompletion(JSON.stringify({ ...canonical, primaryHypothesis: 'REAL' })), 'PRIMARY_HYPOTHESIS_INVALID'],
    ['unknown evidence reference', chatCompletion(JSON.stringify({ ...canonical, supportingEvidence: [{ evidenceId: 'not-real', rationale: 'unknown' }] })), 'UNKNOWN_EVIDENCE_REFERENCE'],
    ['truncated finish reason', chatCompletion(JSON.stringify(canonical), { finishReason: 'length' }), 'FINISH_REASON_TRUNCATED'],
    ['unsupported finish reason', chatCompletion(JSON.stringify(canonical), { finishReason: 'mystery' }), 'FINISH_REASON_UNSUPPORTED'],
    ['missing finish reason', { object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(canonical) } }] }, 'FINISH_REASON_UNSUPPORTED'],
    ['missing message', { object: 'chat.completion', choices: [{ index: 0, finish_reason: 'stop' }] }, 'MESSAGE_MISSING'],
    ['missing content', { object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant' }, finish_reason: 'stop' }] }, 'MESSAGE_CONTENT_MISSING'],
    ['content wrong type', chatCompletion(17), 'MESSAGE_CONTENT_TYPE_UNSUPPORTED'],
    ['empty content', chatCompletion('   '), 'MESSAGE_CONTENT_MISSING'],
    ['empty choices', { object: 'chat.completion', choices: [] }, 'CHOICES_EMPTY'],
    ['multiple choices', { object: 'chat.completion', choices: [{ index: 0 }, { index: 1 }] }, 'CHOICE_COUNT_INVALID'],
    ['choices wrong type', { object: 'chat.completion', choices: {} }, 'CHOICES_TYPE_UNSUPPORTED'],
    ['choice wrong index', chatCompletion(JSON.stringify(canonical), { choice: { index: 1 } }), 'CHOICE_INVALID'],
    ['message wrong role', chatCompletion(JSON.stringify(canonical), { message: { role: 'system' } }), 'MESSAGE_INVALID'],
    ['non-empty tool calls', chatCompletion(JSON.stringify(canonical), { message: { tool_calls: [{ id: 'PRIVATE_TOOL_ARGUMENTS' }] } }), 'UNEXPECTED_TOOL_CALL'],
    ['missing choices', { object: 'chat.completion' }, 'CHOICES_MISSING'],
    ['random nested canonical object', { choices: [{ nested: canonical, finish_reason: 'stop' }] }, 'MESSAGE_MISSING'],
  ];

  for (const [name, raw, code] of cases) {
    const judge = createCloudflareJudge({ ai: { run: async () => raw } });
    const result = await judge.judge({ packet: inputPacket });
    assert.equal(result.status, 'PROVIDER_FAILURE', name);
    assert.equal(result.errorCategory, 'UNEXPECTED_SCHEMA', name);
    assert.equal(result.normalizationFailureCode, code, name);
    assert.equal(result.recommendation, null, name);
    assert.equal(result.responseDiagnostics.providerEnvelopeClassification, 'CHAT_COMPLETION', name);
    assert.equal(JSON.stringify(result).includes('The evidence is insufficient.'), false, name);
    assert.equal(JSON.stringify(result).includes('PRIVATE_TOOL_ARGUMENTS'), false, name);
  }
});

test('Judge Chat Completions diagnostics isolate reasoning and provider content', async () => {
  const inputPacket = packet();
  const canonical = recommendation({ primaryHypothesis: 'INSUFFICIENT_EVIDENCE' });
  const result = await createCloudflareJudge({
    ai: {
      run: async () => ({
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(canonical),
            reasoning: { private: 'PRIVATE_MESSAGE_REASONING' },
            tool_calls: [],
          },
          finish_reason: 'stop',
        }],
        reasoning: { private: 'PRIVATE_TOP_LEVEL_REASONING' },
        usage: { prompt_tokens: 1 },
        privateProviderField: 'PRIVATE_UNKNOWN_PROVIDER_FIELD',
      }),
    },
  }).judge({ packet: inputPacket });

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.responseDiagnostics.providerEnvelopeClassification, 'CHAT_COMPLETION');
  assert.equal(result.responseDiagnostics.messageReasoningFieldPresent, true);
  assert.equal(result.responseDiagnostics.messageReasoningFieldType, 'object');
  assert.equal(result.responseDiagnostics.topLevelReasoningFieldPresent, true);
  assert.equal(result.responseDiagnostics.topLevelReasoningFieldType, 'object');
  assert.equal(result.responseDiagnostics.messageToolCallsPresent, true);
  assert.equal(result.responseDiagnostics.messageToolCallCount, 0);
  assert.equal(result.responseDiagnostics.toolCallsPresent, true);
  assert.equal(result.responseDiagnostics.toolCallCount, 0);
  assert.equal(JSON.stringify(result).includes('PRIVATE_MESSAGE_REASONING'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_TOP_LEVEL_REASONING'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_UNKNOWN_PROVIDER_FIELD'), false);
});

test('Judge Chat Completions diagnostics retain only structural metadata on failed content parsing', async () => {
  const inputPacket = packet();
  const privateContent = 'PRIVATE_CHAT_CONTENT_MUST_NOT_RETAIN';
  const result = await createCloudflareJudge({
    ai: {
      run: async () => ({
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: privateContent }, finish_reason: 'stop' }],
      }),
    },
  }).judge({ packet: inputPacket });

  assert.equal(result.status, 'PROVIDER_FAILURE');
  assert.equal(result.normalizationFailureCode, 'MESSAGE_CONTENT_NOT_JSON');
  assert.equal(result.responseDiagnostics.providerEnvelopeClassification, 'CHAT_COMPLETION');
  assert.equal(result.responseDiagnostics.messageContentType, 'string');
  assert.equal(result.responseDiagnostics.messageContentLength, privateContent.length);
  assert.equal(result.responseDiagnostics.messageContentJsonParseable, false);
  assert.equal(JSON.stringify(result).includes(privateContent), false);
});

test('Judge response normalization fails closed with structural codes and never searches arbitrary nested objects', async () => {
  const inputPacket = packet();
  const canonical = recommendation({ primaryHypothesis: 'INSUFFICIENT_EVIDENCE' });
  const cases = [
    ['response prose', { response: 'The evidence is insufficient.' }, 'RESPONSE_STRING_NOT_JSON'],
    ['response invalid hypothesis', { response: { ...canonical, primaryHypothesis: 'REAL' } }, 'PRIMARY_HYPOTHESIS_INVALID'],
    ['response unknown evidence', { response: { ...canonical, supportingEvidence: [{ evidenceId: 'not-real', rationale: 'unknown' }] } }, 'UNKNOWN_EVIDENCE_REFERENCE'],
    ['response missing required schema version', { response: { ...canonical, schemaVersion: undefined } }, 'SCHEMA_VERSION_INVALID'],
    ['random nested canonical-looking object', { nested: canonical }, 'RESPONSE_MISSING'],
  ];
  for (const [name, raw, code] of cases) {
    const judge = createCloudflareJudge({ ai: { run: async () => raw } });
    const result = await judge.judge({ packet: inputPacket });
    assert.equal(result.status, 'PROVIDER_FAILURE', name);
    assert.equal(result.errorCategory, 'UNEXPECTED_SCHEMA', name);
    assert.equal(result.normalizationFailureCode, code, name);
    assert.equal(result.recommendation, null, name);
    assert.equal(result.responseDiagnostics.transportSucceeded, true, name);
    assert.equal(JSON.stringify(result.responseDiagnostics).includes('The evidence is insufficient'), false, name);
  }
});

test('Judge structural diagnostics contain only response shape metadata', async () => {
  const inputPacket = packet();
  const canonical = recommendation({ rationale: 'PRIVATE_RATIONALE_VALUE' });
  const judge = createCloudflareJudge({ ai: { run: async () => ({ response: canonical, reasoning: { private: 'PRIVATE_REASONING_VALUE' }, usage: { input_tokens: 12 }, tool_calls: [] }) } });
  const result = await judge.judge({ packet: inputPacket });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.responseDiagnostics.providerTopLevelKeys, ['response', 'reasoning', 'tool_calls', 'usage'].sort());
  assert.deepEqual(result.responseDiagnostics.responseTopLevelKeys, Object.keys(canonical).sort());
  assert.equal(result.responseDiagnostics.reasoningFieldPresent, true);
  assert.equal(result.responseDiagnostics.usageFieldPresent, true);
  assert.equal(result.responseDiagnostics.toolCallsPresent, true);
  assert.equal(result.responseDiagnostics.toolCallCount, 0);
  assert.equal(JSON.stringify(result.responseDiagnostics).includes('PRIVATE_RATIONALE_VALUE'), false);
  assert.equal(JSON.stringify(result.responseDiagnostics).includes('PRIVATE_REASONING_VALUE'), false);
});

test('Judge accepts only a packet-bound REASONED_VISUAL_RECHECK request', async () => {
  const observer = createCloudflareVisionObserver({ ai: { run: async () => ({ answer: JSON.stringify({ observations: [{ category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'fixture', regions: [], measurementConfidence: 0.4, limitations: [] }] }) }) } });
  const observed = await observer.observe({ sampleId: 'fixture-sample', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'REFLECTION_01', category: 'REFLECTION', task: 'query', question: 'Describe reflection consistency.' } });
  const inputPacket = packet({ observer: observed });
  const validRequest = recommendation({
    recommendedAdditionalTests: ['REASONED_VISUAL_RECHECK'],
    missingEvidence: [{ requestId: 'recheck-1', request: 'Recheck the reflection visually.', evidenceFamily: 'VISION_OBSERVATION', observationId: inputPacket.observations[0].observationId, category: 'REFLECTION', reasonCode: 'AMBIGUOUS_REFLECTION' }],
  });
  const validJudge = createCloudflareJudge({ ai: { run: async () => ({ response: JSON.stringify(validRequest) }) } });
  const validResult = await validJudge.judge({ packet: inputPacket });
  assert.equal(validResult.status, 'SUCCESS');
  assert.equal(validResult.recommendation.recommendedAdditionalTests[0], 'REASONED_VISUAL_RECHECK');
  const unknownRequest = createCloudflareJudge({ ai: { run: async () => ({ response: JSON.stringify({ ...validRequest, missingEvidence: [{ ...validRequest.missingEvidence[0], observationId: 'not-real' }] }) }) } });
  assert.equal((await unknownRequest.judge({ packet: inputPacket })).status, 'PROVIDER_FAILURE');
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

test('FULL runner supplies decoded pixels while preserving the original-byte hash and EF1 input', async () => {
  let forensicInput;
  const result = await runResearchTrial({ mode: 'FULL', runtimeManifest: manifest(1), maxSamples: 1 }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    decodeImage: async (input) => {
      assert.equal(input.bytes[0], 137);
      return decodedFixture();
    },
    forensicGenerator: async (input) => {
      forensicInput = input;
      return generateForensicFeatureBundleV1(input);
    },
    moderation: createMockModerationProvider(),
    observer: createMockVisionObserver(),
    judge: createMockJudge(),
  });
  const current = result.cases[0];
  assert.ok(forensicInput.decoded);
  assert.equal(forensicInput.decoded.width, 2);
  assert.equal(current.forensic.fileProvenance.sha256, current.inputHash);
  assert.equal(current.packet.evidenceFamilies.EF1_FILE_PROVENANCE.status, 'AVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF2_PHYSICAL_ACQUISITION.status, 'AVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF4_SPECTRAL_STABILITY.status, 'AVAILABLE');
});

test('decode failure preserves EF1 but cannot masquerade as pixel-domain EF2 or EF4', async () => {
  let forensicInput;
  const result = await runResearchTrial({ mode: 'FULL', runtimeManifest: manifest(1), maxSamples: 1 }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    decodeImage: async () => null,
    forensicGenerator: async (input) => {
      forensicInput = input;
      return generateForensicFeatureBundleV1(input);
    },
    moderation: createMockModerationProvider(),
    observer: createMockVisionObserver(),
    judge: createMockJudge(),
  });
  const current = result.cases[0];
  assert.equal(forensicInput.decoded, undefined);
  assert.equal(current.forensic.fileProvenance.sha256, current.inputHash);
  assert.equal(current.forensic.audit.reasonCodes.includes('PIXEL_DOMAIN_MEASUREMENTS_NOT_RUN'), true);
  assert.equal(current.forensic.spectralStability.edgeStatistics.sampleCount, 0);
  assert.equal(current.packet.evidenceFamilies.EF1_FILE_PROVENANCE.status, 'AVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF2_PHYSICAL_ACQUISITION.status, 'UNAVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF4_SPECTRAL_STABILITY.status, 'UNAVAILABLE');
  assert.equal(current.packet.quality.overall, 'FAILED');
  assert.equal(current.packet.quality.failedComponents.includes('forensics-decode'), true);
});

test('research Sharp decode boundary supports the JPEG, PNG, and WebP trial formats', async () => {
  const sharp = (await import('sharp')).default;
  const formats = [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']];
  for (const [format, mime] of formats) {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } } })[format]().toBuffer();
    const decoded = await decodeResearchImage({ bytes, mime });
    assert.equal(decoded.width, 2, format);
    assert.equal(decoded.height, 2, format);
    assert.equal(decoded.pixels.length >= 12, true, format);
  }
});

async function runFullObserverFixture({ category, direct, reasoned, enableRecheck = false, judge: judgeDependency } = {}) {
  const requests = [];
  const observer = {
    isLive: false,
    observe: async (input) => {
      requests.push(input.request);
      const fixture = input.request.reasoningMode === 'REASONED' ? reasoned : direct;
      return createMockVisionObserver([fixture]).observe(input);
    },
  };
  const result = await runResearchTrial({ mode: enableRecheck ? 'FULL_RECHECK' : 'FULL', runtimeManifest: manifest(1), maxSamples: 1, enableRecheck, observerRequest: { queryId: `${category}_RUN`, category, task: 'query', question: `Describe ${category}.` }, caps: { maxSamples: 1, maxModerationCalls: 1, maxObserverCalls: 2, maxObserverDirectCalls: 1, maxObserverReasonedCalls: 1, maxJudgeCalls: 2, maxTotalCalls: 6, maxRecheckRounds: 1 } }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    decodeImage: async () => decodedFixture(),
    moderation: createMockModerationProvider(),
    observer,
    judge: judgeDependency ?? createMockJudge(),
  });
  return { result, requests };
}

test('FULL direct-to-reasoned escalation is bounded and retains both observations', async () => {
  const { result, requests } = await runFullObserverFixture({
    category: 'REFLECTION',
    direct: { category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'The surface is obscured.', regions: [], measurementConfidence: 0.4, limitations: [] },
    reasoned: { category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'The visible reflection is consistent.', regions: [], measurementConfidence: 0.8, limitations: [] },
  });
  const current = result.cases[0];
  assert.equal(requests.length, 2);
  assert.equal(requests[0].reasoningMode, 'DIRECT');
  assert.equal(requests[1].reasoningMode, 'REASONED');
  assert.equal(result.invocationAccounting.calls.observerDirect, 1);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 1);
  assert.equal(current.recheckRounds, 1);
  assert.equal(current.judgeHistory.length, 1);
  assert.equal(current.packet.observationHistory.length, 1);
  assert.equal(current.packet.observations[0].reasoningMode, 'REASONED');
});

test('confident direct Observer output does not spend a reasoned call', async () => {
  const { result, requests } = await runFullObserverFixture({
    category: 'REFLECTION',
    direct: { category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'The reflection is visible.', regions: [], measurementConfidence: 0.95, limitations: [] },
    reasoned: { category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'unused', regions: [], measurementConfidence: 0.95, limitations: [] },
  });
  assert.equal(requests.length, 1);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 0);
  assert.equal(result.cases[0].recheckRounds, 0);
});

test('low-confidence eligible direct output escalates exactly once', async () => {
  const { result, requests } = await runFullObserverFixture({
    category: 'LIGHTING_SHADOW',
    direct: { category: 'LIGHTING_SHADOW', applicable: true, status: 'OBSERVED', observation: 'Light direction is uncertain.', regions: [], measurementConfidence: 0.4, limitations: [] },
    reasoned: { category: 'LIGHTING_SHADOW', applicable: true, status: 'OBSERVED', observation: 'The visible shadow is consistent.', regions: [], measurementConfidence: 0.8, limitations: [] },
  });
  assert.equal(requests.length, 2);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 1);
  assert.equal(result.cases[0].recheckRounds, 1);
});

test('ineligible direct category does not automatically escalate', async () => {
  const { result, requests } = await runFullObserverFixture({
    category: 'SCENE_INVENTORY',
    direct: { category: 'SCENE_INVENTORY', applicable: true, status: 'INDETERMINATE', observation: 'Scene unclear.', regions: [], measurementConfidence: 0.2, limitations: [] },
    reasoned: { category: 'SCENE_INVENTORY', applicable: true, status: 'OBSERVED', observation: 'unused', regions: [], measurementConfidence: 0.9, limitations: [] },
  });
  assert.equal(requests.length, 1);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 0);
  assert.equal(result.cases[0].recheckRounds, 0);
});

test('Observer-triggered reasoned pass consumes the global budget and blocks recursive Judge rechecks', async () => {
  let judgeCalls = 0;
  const { result, requests } = await runFullObserverFixture({
    category: 'REFLECTION',
    direct: { category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'The surface is unclear.', regions: [], measurementConfidence: 0.4, limitations: [] },
    reasoned: { category: 'REFLECTION', applicable: true, status: 'INDETERMINATE', observation: 'Still unclear.', regions: [], measurementConfidence: 0.4, limitations: [] },
    enableRecheck: true,
    judge: { isLive: false, judge: async ({ packet: inputPacket }) => {
      judgeCalls += 1;
      return { schemaVersion: 'lythaus-judge-result-v1', promptVersion: JUDGE_PROMPT_VERSION, prompt: '', provider: 'mock-judge', model: 'mock-v1', status: 'SUCCESS', recommendation: recommendation({ recommendedAdditionalTests: ['REASONED_VISUAL_RECHECK'], missingEvidence: [{ requestId: 'recheck', request: 'free-form must be ignored', evidenceFamily: 'VISION_OBSERVATION', observationId: inputPacket.observations[0].observationId, category: 'REFLECTION', reasonCode: 'AMBIGUOUS_REFLECTION' }] }), executionMs: 0 };
    } },
  });
  assert.equal(requests.length, 2);
  assert.equal(judgeCalls, 1);
  assert.equal(result.cases[0].judgeHistory.length, 1);
  assert.equal(result.cases[0].recheckRounds, 1);
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
  assert.deepEqual(result.invocationAccounting.calls, { moderation: 2, observer: 2, observerDirect: 2, observerReasoned: 0, caption: 0, detect: 0, point: 0, judge: 2, total: 6 });
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

test('FULL 0D composes decoded forensics, direct Observer, packet, and one conservative Judge pass', async () => {
  let capturedPacket = null;
  let capturedJudgeRequest = null;
  const observer = {
    isLive: false,
    observe: async (input) => {
      assert.equal(input.request.regionPolicy, 'FORBID');
      return createMockVisionObserver([{
        category: 'SCENE_INVENTORY',
        applicable: true,
        status: 'OBSERVED',
        observation: 'A uniform neutral field is visible.',
        regions: [],
        measurementConfidence: null,
        limitations: [],
      }]).observe(input);
    },
  };
  const judge = {
    isLive: false,
    judge: async ({ packet: inputPacket }) => {
      capturedPacket = inputPacket;
      capturedJudgeRequest = buildJudgeRequest(inputPacket);
      assertSafetyIsolation(inputPacket);
      assert.equal(inputPacket.safetyContext.role, 'SAFETY_CONTEXT_ONLY');
      assert.equal(inputPacket.enforcementAuthority, false);
      assert.equal(capturedJudgeRequest.messages[1].content.includes('groundTruth'), false);
      assert.equal(capturedJudgeRequest.messages[1].content.includes('rawReasoning'), false);
      return createMockJudge().judge({ packet: inputPacket });
    },
  };
  const result = await runResearchTrial({
    mode: 'FULL',
    runtimeManifest: manifest(1),
    maxSamples: 1,
    observerRequest: { queryId: 'SCENE_INVENTORY_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the visible scene without making an origin judgment.', regionPolicy: 'FORBID' },
    caps: { maxSamples: 1, maxModerationCalls: 1, maxObserverCalls: 1, maxObserverDirectCalls: 1, maxObserverReasonedCalls: 0, maxJudgeCalls: 1, maxTotalCalls: 3, maxRecheckRounds: 1 },
  }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    decodeImage: async () => decodedFixture(),
    moderation: createMockModerationProvider(),
    observer,
    judge,
  });
  const current = result.cases[0];
  assert.equal(current.status, 'COMPLETED');
  assert.equal(current.stoppedAt, null);
  assert.equal(current.packet, capturedPacket);
  assert.equal(current.packet.evidenceFamilies.EF1_FILE_PROVENANCE.status, 'AVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF2_PHYSICAL_ACQUISITION.status, 'AVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF3_GENERATIVE_FORENSICS.status, 'UNAVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF4_SPECTRAL_STABILITY.status, 'AVAILABLE');
  assert.equal(current.packet.evidenceFamilies.EF5_RECONSTRUCTION_LOCAL_MANIPULATION.status, 'UNAVAILABLE');
  assert.equal(current.packet.quality.overall, 'PARTIAL');
  assert.equal(current.packet.quality.missingEvidenceFamilies.includes('EF3_GENERATIVE_FORENSICS'), true);
  assert.equal(current.packet.quality.missingEvidenceFamilies.includes('EF5_RECONSTRUCTION_LOCAL_MANIPULATION'), true);
  assert.equal(current.judge.status, 'SUCCESS');
  assert.equal(current.judge.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
  assert.equal(current.judge.recommendation.enforcementAuthority, false);
  assert.deepEqual(result.invocationAccounting.calls, { moderation: 1, observer: 1, observerDirect: 1, observerReasoned: 0, caption: 0, detect: 0, point: 0, judge: 1, total: 3 });
  assert.equal(result.invocationAccounting.retries, 0);
});

test('FULL observe mode stops on moderation provider failure before expensive downstream calls', async () => {
  const calls = { decode: 0, forensic: 0, observer: 0, judge: 0 };
  const result = await runResearchTrial({ mode: 'FULL', runtimeManifest: manifest(1), maxSamples: 1, safetyMode: 'observe', caps: { maxSamples: 1, maxModerationCalls: 1, maxObserverCalls: 1, maxObserverDirectCalls: 1, maxObserverReasonedCalls: 0, maxJudgeCalls: 1, maxTotalCalls: 3, maxRecheckRounds: 1 } }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    decodeImage: async () => { calls.decode += 1; return decodedFixture(); },
    forensicGenerator: async () => { calls.forensic += 1; throw new Error('must-not-run'); },
    moderation: createMockModerationProvider({ analyse: async () => ({ provider: 'fixture-moderation', result: 'PROVIDER_FAILURE', reasonCodes: ['fixture'], modelVersion: null, executionMs: 1, costEstimateUsd: 0 }) }),
    observer: { isLive: false, observe: async () => { calls.observer += 1; return createMockVisionObserver().observe({ sampleId: 'SAMPLE', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: pngFixture() }); } },
    judge: { isLive: false, judge: async () => { calls.judge += 1; return createMockJudge().judge({ packet: packet() }); } },
  });
  const current = result.cases[0];
  assert.equal(current.status, 'STOPPED');
  assert.equal(current.stoppedAt, 'MODERATION_PROVIDER_FAILURE');
  assert.equal(current.packet.quality.overall, 'FAILED');
  assert.equal(current.packet.quality.failedComponents.includes('moderation'), true);
  assert.deepEqual(calls, { decode: 0, forensic: 0, observer: 0, judge: 0 });
  assert.deepEqual(result.invocationAccounting.calls, { moderation: 1, observer: 0, observerDirect: 0, observerReasoned: 0, caption: 0, detect: 0, point: 0, judge: 0, total: 1 });
  assert.equal(researchRunExitCode(result), 1);
});

test('observer A/B mode uses identical inputs, records two bounded calls, and exposes descriptive metrics only', async () => {
  let observerCalls = 0;
  const result = await runResearchTrial({
    mode: 'OBSERVER_AB',
    runtimeManifest: manifest(1),
    maxSamples: 1,
    observerRequest: { queryId: 'REFLECTION_AB', category: 'REFLECTION', task: 'query', question: 'Describe reflection consistency.' },
  }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    observer: { isLive: false, observe: async (input) => {
      observerCalls += 1;
      const mode = input.request?.reasoningMode ?? 'DIRECT';
      const base = createMockVisionObserver([{ category: 'REFLECTION', applicable: true, status: mode === 'REASONED' ? 'OBSERVED' : 'INDETERMINATE', observation: 'fixture', regions: [], measurementConfidence: mode === 'REASONED' ? 0.8 : 0.4, limitations: [] }]);
      return base.observe(input);
    } },
  });
  assert.equal(observerCalls, 2);
  assert.equal(result.invocationAccounting.calls.observer, 2);
  assert.equal(result.invocationAccounting.calls.observerDirect, 1);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 1);
  assert.equal(result.cases[0].observerComparison.direct.reasoningMode, 'DIRECT');
  assert.equal(result.cases[0].observerComparison.reasoned.reasoningMode, 'REASONED');
  const summary = summarizeVisionObserverComparisons([result.cases[0].observerComparison]);
  assert.equal(summary.sampleCount, 1);
  assert.equal(summary.observationGroundTruthAvailable, false);
  assert.equal(summary.reasonedCalls, 1);
});

test('FULL_RECHECK permits one whitelisted reasoned pass and two Judge passes, never an unbounded loop', async () => {
  let judgeCalls = 0;
  const fixtureObservation = { category: 'REFLECTION', applicable: true, status: 'OBSERVED', observation: 'The surface is visible.', regions: [], measurementConfidence: 0.9, limitations: [] };
  const result = await runResearchTrial({
    mode: 'FULL_RECHECK',
    runtimeManifest: manifest(1),
    maxSamples: 1,
    enableRecheck: true,
    observerRequest: { queryId: 'REFLECTION_RECHECK', category: 'REFLECTION', task: 'query', question: 'Describe reflection consistency.' },
    caps: { maxSamples: 1, maxModerationCalls: 1, maxObserverCalls: 2, maxObserverDirectCalls: 1, maxObserverReasonedCalls: 1, maxJudgeCalls: 2, maxTotalCalls: 5, maxRecheckRounds: 1 },
  }, {
    readSample: async () => ({ bytes: pngFixture(), mime: 'image/png' }),
    moderation: createMockModerationProvider(),
    observer: createMockVisionObserver([fixtureObservation]),
    judge: { isLive: false, judge: async ({ packet: inputPacket }) => {
      judgeCalls += 1;
      const base = judgeCalls === 1
        ? recommendation({
          primaryHypothesis: 'INSUFFICIENT_EVIDENCE',
          recommendedAdditionalTests: ['REASONED_VISUAL_RECHECK'],
          missingEvidence: [{ requestId: 'recheck-1', request: 'Recheck the reflection visually.', evidenceFamily: 'VISION_OBSERVATION', observationId: inputPacket.observations[0].observationId, category: 'REFLECTION', reasonCode: 'AMBIGUOUS_REFLECTION' }],
        })
        : createInsufficientEvidenceRecommendation('Second pass remains uncertain.');
      return { schemaVersion: 'lythaus-judge-result-v1', promptVersion: JUDGE_PROMPT_VERSION, prompt: '', provider: 'mock-judge', model: 'mock-v1', status: 'SUCCESS', recommendation: base, executionMs: 0 };
    } },
  });
  assert.equal(judgeCalls, 2);
  assert.equal(result.cases[0].recheckRounds, 1);
  assert.equal(result.cases[0].judgeHistory.length, 2);
  assert.equal(result.invocationAccounting.calls.observerDirect, 1);
  assert.equal(result.invocationAccounting.calls.observerReasoned, 1);
  assert.equal(result.invocationAccounting.calls.judge, 2);
  assert.equal(result.cases[0].packet.observationHistory.length, 1);
  assert.equal(result.cases[0].packet.observations[0].reasoningMode, 'REASONED');
});

test('unknown truth is excluded from evaluation metrics', async () => {
  const truth = JSON.parse(await readFile(path.join(repositoryRoot, 'research/wp004a/ground-truth-manifest.example.json'), 'utf8'));
  const unknown = { ...truth.entries[0], truth: { ...truth.entries[0].truth, truthBasis: 'NEEDS_OWNER_CONFIRMATION', physicalCameraAcquisition: null, syntheticContent: null } };
  const evaluation = evaluateResearchPredictions({ predictions: [{ sampleId: unknown.sampleId, primaryHypothesis: 'CAMERA_NATIVE', uncertainty: 'HIGH', requiresReview: true }], groundTruth: [unknown] });
  assert.equal(evaluation.evaluatedCount, 0);
  assert.equal(evaluation.agreementRate, null);
  assert.equal(evaluation.rows[0].matches, null);
});

test('REST-backed Observer and Judge adapters preserve provider boundaries without live calls', async () => {
  const calls = [];
  const transport = createCloudflareRestTransport({ apiToken: 'fixture-token', accountId: 'fixture-account', allowNetwork: true, maxRequests: 2, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.task === 'query') return jsonResponse({ success: true, result: { answer: JSON.stringify({ observations: [{ category: 'SCENE_INVENTORY', applicable: true, status: 'NOT_OBSERVED', observation: 'No anomaly was observed.', regions: [], measurementConfidence: 0.7, limitations: [] }] }), reasoning: { hidden: 'must-not-persist' } } });
    return jsonResponse({ success: true, result: { response: JSON.stringify(createInsufficientEvidenceRecommendation()) } });
  } });
  const observer = createCloudflareVisionObserverRest({ transport });
  const observed = await observer.observe({ sampleId: 'SAMPLE', inputHash: '2'.repeat(64), mime: 'image/png', bytes: pngFixture(), request: { queryId: 'SCENE_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the scene.', reasoningMode: 'DIRECT' } });
  const inputPacket = buildEvidencePacket({ runId: 'rest-run', caseId: CASE_ID, sampleId: 'SAMPLE', sourceFamilyId: 'FAMILY', preflight: { inputHash: '2'.repeat(64), mime: 'image/png', dimensions: null }, observer: observed });
  const judge = createCloudflareJudgeRest({ transport });
  const judged = await judge.judge({ packet: inputPacket });
  assert.equal(judged.status, 'SUCCESS');
  assert.equal(calls[0].reasoning, false);
  assert.equal(JSON.stringify(inputPacket).includes('must-not-persist'), false);
  assert.equal(JSON.stringify(buildJudgeRequest(inputPacket)).includes('must-not-persist'), false);
});

test('workflow is manual-only, uses the exact secret binding, and emits no media or key', async () => {
  const workflow = await readFile(path.join(repositoryRoot, '.github/workflows/wp004a-openai-moderation-smoke.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  assert.match(workflow, /OPENAI_API_KEY:\s*\$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(workflow, /OneDrive|research[-_]images|base64|echo\s+\$\{\{\s*secrets\.OPENAI_API_KEY/i);
  assert.match(workflow, /wp004a-openai-moderation-smoke\.mjs/);
});

test('Cloudflare smoke workflow is manual-only, secret-injected, bounded, and fixture-only', async () => {
  const workflow = await readFile(path.join(repositoryRoot, '.github/workflows/wp004a-cloudflare-rest-smoke.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /wp004a-cloudflare-smoke\.mjs/);
  assert.match(workflow, /0C-REL-AB/);
  assert.match(workflow, /0C-REL-FRONTBACK-AB/);
  assert.match(workflow, /create-geometry-occlusion-fixture\.mjs/);
  assert.match(workflow, /create-geometry-occlusion-frontback-fixtures\.mjs/);
  assert.match(workflow, /wp004a-geometry-occlusion\.png/);
  assert.match(workflow, /wp004a-frontback/);
  assert.doesNotMatch(workflow, /OneDrive|LythausForensicsData|research[-_]images|base64|echo\s+\$\{\{\s*secrets\./i);
});

test('relational Cloudflare trial maps to the executable bounded Observer A/B mode', () => {
  assert.equal(WP004A_CLOUDFLARE_TRIAL_MODES['0C-REL-AB'], 'OBSERVER_AB');
  assert.equal(WP004A_CLOUDFLARE_TRIAL_MODES['0C-REL-AB'], WP004A_CLOUDFLARE_TRIAL_MODES['0C-AB']);
  assert.equal(WP004A_CLOUDFLARE_TRIAL_MODES['0C-REL-FRONTBACK-AB'], 'OBSERVER_AB');
});

test('Cloudflare access preflight workflow is manual-only, read-only, and secret-injected', async () => {
  const workflow = await readFile(path.join(repositoryRoot, '.github/workflows/wp004a-cloudflare-access-preflight.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /wp004a-cloudflare-access-preflight\.mjs/);
  assert.doesNotMatch(workflow, /ai\/run|OneDrive|LythausForensicsData|base64|echo\s+\$\{\{\s*secrets\./i);
});
