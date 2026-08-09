import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AUTHENTICITY_FEATURE_FLAGS,
  DEFAULT_TRANSFORMATIONS,
  EVIDENCE_SCHEMA_VERSION,
  FOUNDATION_POLICY_VERSION,
  InMemoryCostCounterStore,
  MODEL_REGISTRY,
  assertModelRegistryPolicy,
  assertWp002CostCeiling,
  calculateBoundedCostScenario,
  createAuthenticityCase,
  createAuthenticityEvidence,
  createDecisionAudit,
  createEvaluationDatasetManifest,
  createModerationDecision,
  generateForensicFeatureBundle,
  generateForensicFeatureBundleV1,
  ingestMedia,
  isUuidV7,
  runEvaluation,
  runFoundationPipeline,
  runTransformationLab,
  evaluateEvaluationQualityGates,
  validateDualAxisOrigin,
  unavailableModerationProvider,
  uuidv7,
  AuthenticityCostController,
} from '../src/foundation.ts';
import { ECO_TRAIN_CONFIG } from '../../../ml/local/eco_train/config.mjs';
import { EcoTrainController, validateEcoTrainAdmission } from '../../../ml/local/eco_train/controller.mjs';
import { parseTemperatureReading, rejectAcpiThermalZoneReading } from '../../../ml/local/eco_train/temperature-provider.mjs';
import { QUALIFICATION_STAGES, qualificationPlan, qualificationStatus } from '../../../ml/local/eco_train/thermal-qualify.mjs';

function pngFixture() {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 4, 0, 0, 0, 4, 8, 2, 0, 0, 0,
    0, 0, 0, 0,
  ]);
}

function decodedFixture() {
  return { width: 4, height: 4, channels: 1, pixels: new Uint8Array([0, 30, 60, 90, 30, 60, 90, 120, 60, 90, 120, 150, 90, 120, 150, 180]) };
}

test('UUID v7 and audit contracts are versioned', () => {
  const id = uuidv7();
  assert.equal(isUuidV7(id), true);
  const audit = createDecisionAudit({ policyVersion: FOUNDATION_POLICY_VERSION, reasonCodes: ['TEST'], finalClassification: 'REVIEW' });
  assert.equal(audit.evidenceSchemaVersion, EVIDENCE_SCHEMA_VERSION);
  assert.equal(audit.appealOutcome, null);
  assert.equal(DEFAULT_AUTHENTICITY_FEATURE_FLAGS.authenticityEnforcementEnabled, false);
});

test('evidence families and dual origin axes remain independent', () => {
  const caseId = uuidv7();
  const evidence = createAuthenticityEvidence({ caseId, family: 'EF1_FILE_PROVENANCE', featureName: 'metadataAbsent', value: true, source: 'deterministic-v0', reasonCodes: ['METADATA_ABSENT_NOT_AI_PROOF'] });
  assert.equal(evidence.audit.evidenceSchemaVersion, EVIDENCE_SCHEMA_VERSION);
  const axes = validateDualAxisOrigin({ cameraEvidence: 'CAMERA_NATIVE_LIKELY', syntheticEvidence: 'STRONG_SYNTHETIC_EVIDENCE' });
  assert.equal(axes.cameraEvidence, 'CAMERA_NATIVE_LIKELY');
  assert.equal(axes.syntheticEvidence, 'STRONG_SYNTHETIC_EVIDENCE');
});

test('model registry uses UUID v7 and no automatic artifacts', () => {
  assert.equal(MODEL_REGISTRY.length, 11);
  assertModelRegistryPolicy();
  for (const model of MODEL_REGISTRY) {
    assert.equal(isUuidV7(model.modelId), true);
    assert.equal(model.deploymentStatus === 'PRODUCTION_REVIEW_ONLY', false);
    assert.equal(model.artifactSha256, null);
    assert.ok(model.researchRole);
    assert.ok(model.sourceAccessedAt);
  }
});

test('deterministic forensics produces reusable base features and dual axes', async () => {
  const caseId = uuidv7();
  const bytes = pngFixture();
  const first = await generateForensicFeatureBundle({ caseId, mime: 'image/png', bytes, decoded: decodedFixture() });
  const second = await generateForensicFeatureBundle({ caseId, mime: 'image/png', bytes, decoded: decodedFixture() });
  assert.equal(first.fileProvenance.sha256, second.fileProvenance.sha256);
  assert.deepEqual(first.featureVector, second.featureVector);
  assert.equal(first.featureVersion, 'lythaus-forensics-v0');
  assert.equal(first.physicalAcquisition.cameraOrigin, 'CAMERA_EVIDENCE_ABSENT');
  assert.equal(first.physicalAcquisition.cameraEvidenceApplicability, 'unavailable');
  assert.equal(first.generativeForensics.syntheticEvidence, 'NO_POSITIVE_SYNTHETIC_EVIDENCE');
  assert.equal(first.imagePyramid.length, 4);
  assert.ok(first.spectralStability.fftMagnitude.length > 0);
  assert.equal(first.spectralStability.edgeStatistics.sampleCount > 0, true);
});

test('v1 deterministic forensics adds multi-scale spectral and camera evidence without a verdict', async () => {
  const caseId = uuidv7();
  const bundle = await generateForensicFeatureBundleV1({ caseId, mime: 'image/png', bytes: pngFixture(), decoded: { ...decodedFixture(), channels: 3, pixels: new Uint8Array(Array.from({ length: 48 }, (_, index) => index % 256)) } });
  assert.equal(bundle.featureVersion, 'lythaus-forensics-v1');
  assert.equal(bundle.spectralStability.multiScale?.length, 2);
  assert.ok((bundle.spectralStability.featureLabels?.length ?? 0) > 0);
  assert.ok(bundle.physicalAcquisition.evidenceDetails);
  assert.equal(bundle.audit.reasonCodes.includes('NO_ENFORCEMENT'), true);
  assert.equal(bundle.generativeForensics.syntheticEvidence, 'NO_POSITIVE_SYNTHETIC_EVIDENCE');
});

test('media intake quarantines, queues, and suppresses duplicate submissions', async () => {
  const stored = [];
  const created = [];
  const queued = [];
  const byKey = new Map();
  const byHash = new Map();
  const dependencies = {
    quarantine: { put: async (key, bytes, options) => stored.push({ key, bytes, options }) },
    cases: {
      findByIdempotencyKey: async (key) => byKey.get(key) ?? null,
      findBySha256: async (hash) => byHash.get(hash) ?? null,
      create: async (input) => {
        created.push(input);
        const record = { caseId: input.caseRecord.id, submissionId: input.caseRecord.submissionId, objectKey: input.objectKey, sha256: input.sha256, status: input.caseRecord.status };
        byKey.set(input.idempotencyKey, record);
        byHash.set(input.sha256, record);
      },
    },
    queue: { send: async (message) => queued.push(message) },
  };
  const request = { bytes: pngFixture(), declaredMime: 'image/png', idempotencyKey: 'fixture-1' };
  const accepted = await ingestMedia(request, dependencies);
  const duplicate = await ingestMedia(request, dependencies);
  assert.equal(accepted.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(stored.length, 1);
  assert.equal(created.length, 1);
  assert.equal(queued.length, 1);
  assert.match(stored[0].key, /^quarantine\/.+\/\w+\.png$/);
});

test('processing modes preserve their declared pipeline ordering', async () => {
  const modes = ['MODERATION_ONLY', 'AUTHENTICITY_ONLY', 'MODERATION_THEN_AUTHENTICITY', 'AUTHENTICITY_THEN_MODERATION', 'PARALLEL', 'CUSTOM_POLICY'];
  for (const processingMode of modes) {
    const events = [];
    const caseRecord = createAuthenticityCase({ contentKind: 'image', processingMode });
    const result = await runFoundationPipeline({
      caseRecord,
      contentKind: 'image',
      processingMode,
      customOrder: processingMode === 'CUSTOM_POLICY' ? ['AUTHENTICITY', 'MODERATION'] : undefined,
      hooks: {
        moderation: async () => {
          events.push('moderation');
          return { provider: 'fixture', result: 'ALLOW', reasonCodes: [], modelVersion: 'fixture-v0', executionMs: 1, costEstimateUsd: 0 };
        },
        fastAuthenticity: async () => {
          events.push('authenticity');
          return { id: uuidv7(), caseId: caseRecord.id, recommendation: 'REVIEW', contradictions: [], evidenceIds: [], enforcementAuthority: 'NONE', audit: createDecisionAudit({ modelVersion: 'fixture-v0', finalClassification: 'REVIEW' }) };
        },
        routeUncertainty: async () => 'SHALLOW',
      },
    });
    assert.equal(result.stoppedAt, null);
    assert.equal(result.policyDecision.authenticityEnforcementEnabled, false);
    if (processingMode === 'MODERATION_ONLY') assert.deepEqual(events, ['moderation']);
    if (processingMode === 'AUTHENTICITY_ONLY') assert.deepEqual(events, ['authenticity']);
    if (processingMode === 'AUTHENTICITY_THEN_MODERATION' || processingMode === 'CUSTOM_POLICY') assert.deepEqual(events, ['authenticity', 'moderation']);
    if (processingMode === 'MODERATION_THEN_AUTHENTICITY') assert.deepEqual(events, ['moderation', 'authenticity']);
    if (processingMode === 'PARALLEL') assert.deepEqual(events.slice().sort(), ['authenticity', 'moderation']);
  }
});

test('safety block stops expensive authenticity analysis', async () => {
  let authenticityCalls = 0;
  const result = await runFoundationPipeline({
    contentKind: 'image',
    processingMode: 'MODERATION_THEN_AUTHENTICITY',
    hooks: {
      moderation: async () => ({ provider: 'fixture-safety', result: 'BLOCK', reasonCodes: ['SAFETY_BLOCK'], modelVersion: 'fixture', executionMs: 1, costEstimateUsd: 0 }),
      fastAuthenticity: async () => { authenticityCalls += 1; throw new Error('must_not_run'); },
    },
  });
  assert.equal(authenticityCalls, 0);
  assert.equal(result.stoppedAt, 'STOP');
  assert.equal(result.policyDecision.classification, 'QUARANTINE');
  assert.equal(result.policyDecision.authenticityEnforcementEnabled, false);
});

test('moderation provider failure remains separate and routes to review', async () => {
  const provider = unavailableModerationProvider();
  const decision = createModerationDecision(uuidv7(), await provider.analyseText({ caseId: uuidv7(), text: 'fixture' }));
  assert.equal(decision.result, 'PROVIDER_FAILURE');
  assert.equal(decision.audit.applicability, 'unavailable');
});

test('transformation lab records deterministic stability fields', async () => {
  const caseId = uuidv7();
  const original = { bytes: pngFixture(), mime: 'image/png', decoded: decodedFixture() };
  const bundle = await generateForensicFeatureBundle({ caseId, ...original });
  const runs = await runTransformationLab({ caseId, inputBundle: bundle, original, transformations: DEFAULT_TRANSFORMATIONS.slice(0, 3) });
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((run) => run.transformation), ['JPEG_QUALITY_95', 'JPEG_QUALITY_75', 'RESIZE_75']);
  assert.ok(runs.every((run) => Array.isArray(run.originalFeatureVector) && typeof run.featureDistance === 'number'));
  assert.ok(runs.every((run) => run.scoreMean === null && run.classificationFlip === null && run.embeddingMovement === null));
  assert.ok(runs.every((run) => run.audit.reasonCodes.includes('NOT_USED_FOR_ENFORCEMENT')));
  const scored = await runTransformationLab({
    caseId,
    inputBundle: bundle,
    original,
    transformations: ['JPEG_QUALITY_95'],
    detectorScore: async (candidate) => (candidate.featureVector[0] ?? 0) / 100,
    detectorThreshold: 0.5,
  });
  assert.equal(typeof scored[0].scoreMean, 'number');
  assert.equal(typeof scored[0].scoreVariance, 'number');
  assert.equal(typeof scored[0].detectorScoreIfAvailable, 'number');
  assert.equal(typeof scored[0].classificationFlip, 'boolean');
});

test('evaluation harness calculates metrics without enforcement authority', async () => {
  const samples = [
    { sampleId: uuidv7(), groupId: uuidv7(), origin: 'CAMERA_NATIVE', transformation: 'ORIGINAL', truthSynthetic: false },
    { sampleId: uuidv7(), groupId: uuidv7(), origin: 'AI_GENERATED', transformation: 'ORIGINAL', truthSynthetic: true },
  ];
  const dataset = createEvaluationDatasetManifest({ name: 'fixture', version: 'v0', storageReference: 'r2://approved-fixture', contentHashes: ['a'.repeat(64)], approvedForEvaluation: true });
  const result = await runEvaluation({ dataset, modelId: MODEL_REGISTRY[4].modelId, samples, predict: async (sample) => ({ score: sample.truthSynthetic ? 0.9 : 0.1, classification: sample.truthSynthetic ? 'SYNTHETIC' : 'NOT_SYNTHETIC', latencyMs: 2, memoryMb: 12, costUsd: 0 }) });
  assert.equal(result.run.status, 'COMPLETED');
  assert.equal(result.run.metrics.precision, 1);
  assert.equal(result.run.metrics.f1, 1);
  assert.equal(result.run.metrics.auroc, 1);
  assert.equal(result.run.metrics.auprc, 1);
  assert.equal(result.run.qualityGate.overallStatus, 'PASS');
  assert.equal(result.run.audit.reasonCodes.includes('NO_ENFORCEMENT_AUTHORITY'), true);
});

test('evaluation metrics expose hard negatives, unseen generators, abstention, and grouped robustness', async () => {
  const group = uuidv7();
  const samples = [
    { sampleId: uuidv7(), groupId: group, origin: 'CAMERA_NATIVE', transformation: 'ORIGINAL', truthSynthetic: false, generatorFamily: null, hardNegative: false },
    { sampleId: uuidv7(), groupId: group, origin: 'CAMERA_NATIVE', transformation: 'JPEG_COMPRESSED', truthSynthetic: false, generatorFamily: null, hardNegative: false },
    { sampleId: uuidv7(), groupId: uuidv7(), origin: 'CGI', transformation: 'ORIGINAL', truthSynthetic: false, generatorFamily: 'cgi', generatorSplit: 'KNOWN', hardNegative: true },
    { sampleId: uuidv7(), groupId: uuidv7(), origin: 'AI_GENERATED', transformation: 'ORIGINAL', truthSynthetic: true, generatorFamily: 'unseen-family', generatorSplit: 'UNSEEN' },
    { sampleId: uuidv7(), groupId: uuidv7(), origin: 'AI_GENERATED', transformation: 'ORIGINAL', truthSynthetic: true, generatorFamily: 'known-family', generatorSplit: 'KNOWN' },
  ];
  const predictions = samples.map((sample, index) => ({
    sampleId: sample.sampleId,
    score: index === 1 ? 0.7 : index === 2 ? 0.2 : index === 3 ? 0.8 : index === 4 ? null : 0.1,
    classification: index === 1 ? 'SYNTHETIC' : index === 2 ? 'NOT_SYNTHETIC' : index === 3 ? 'SYNTHETIC' : index === 4 ? 'ABSTAIN' : 'NOT_SYNTHETIC',
    latencyMs: 2,
    cpuTimeMs: 1,
    memoryMb: 10,
    costUsd: 0,
  }));
  const dataset = createEvaluationDatasetManifest({ name: 'metrics-fixture', version: 'v0', storageReference: 'r2://fixture', contentHashes: ['b'.repeat(64)], approvedForEvaluation: true });
  const result = await runEvaluation({ dataset, modelId: MODEL_REGISTRY[0].modelId, samples, predict: async (sample) => predictions.find((prediction) => prediction.sampleId === sample.sampleId) });
  assert.equal(result.run.evaluationSchemaVersion, 'lythaus-authenticity-evaluation-v2');
  assert.equal(result.run.metrics.hardNegativeFalsePositiveRate, 0);
  assert.equal(result.run.metrics.unseenGeneratorFalsePositiveRate, null);
  assert.equal(result.run.metrics.perGenerator.find((slice) => slice.key === 'unseen-family')?.recall, 1);
  assert.ok(result.run.metrics.perOrigin.some((slice) => slice.key === 'AI_GENERATED'));
  assert.equal(result.run.metrics.transformationRobustness?.classificationFlipRate, 1);
  assert.equal(result.run.metrics.abstentionRate, 0.2);
  assert.equal(result.run.qualityGate.overallStatus, 'REVIEW');
  assert.equal(evaluateEvaluationQualityGates(result.run.metrics).enforcementAuthority, 'NONE');
});

test('cost controller hard-stops above the experimental ceiling', async () => {
  const controller = new AuthenticityCostController(new InMemoryCostCounterStore());
  assert.equal((await controller.admit({ period: '2026-08', operation: 'cheap_forensics', operationClass: 'essential', estimatedCostUsd: 1 })).admitted, true);
  await controller.settle('2026-08', 1, 9.1);
  const stopped = await controller.admit({ period: '2026-08', operation: 'deep_image_scan', operationClass: 'optional', estimatedCostUsd: 0.1 });
  assert.equal(stopped.admitted, false);
  assert.equal(['DEEP_SCAN_STOP', 'HARD_STOP', 'ESSENTIAL_ONLY'].includes(stopped.reason), true);
});

test('bounded WP002 Container estimate remains under the approved ceiling', () => {
  const estimate = calculateBoundedCostScenario({
    container: { activeSeconds: 3600, instances: 1 },
    queueOperations: 10_000,
    r2: { storageGbMonth: 1, classAOperations: 100, classBOperations: 100 },
    workersAi: { neurons: 10_000 },
  });
  assert.ok(estimate.totalUsd > 0);
  assert.equal(estimate.ceilingCompatible, true);
  assert.doesNotThrow(() => assertWp002CostCeiling(estimate));
  assert.throws(() => assertWp002CostCeiling({ ...estimate, totalUsd: 10.01 }), /wp002_experimental_ceiling_exceeded/);
});

test('eco-train fails closed without valid CPU-package telemetry', async () => {
  const unavailable = validateEcoTrainAdmission({ system: { onAcPower: true, cpuThreads: 4, freeSystemGb: 8, freeDiskGb: 100, processMemoryGb: 1, processPriority: 'below_normal' }, temperature: { state: 'UNAVAILABLE' }, unattended: true });
  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.failClosed, true);
  assert.equal(rejectAcpiThermalZoneReading({ sensorKind: 'acpi_thermal_zone', source: 'MSAcpi_ThermalZoneTemperature' }).state, 'UNAVAILABLE');
  const now = new Date().toISOString();
  assert.equal(parseTemperatureReading({ sensorKind: 'cpu_package', sourceVerified: true, celsius: 60, observedAt: now }).state, 'VALID');
  assert.equal(parseTemperatureReading({ sensorKind: 'cpu_package', sourceVerified: true, celsius: 60, observedAt: new Date(Date.now() - 60_000).toISOString() }).state, 'STALE');
  assert.equal(qualificationPlan().length, QUALIFICATION_STAGES.length);
  assert.equal(qualificationStatus([{ action: 'EMERGENCY_STOP', temperatureState: 'VALID' }]), 'ABORTED_EMERGENCY_STOP');
  const controller = new EcoTrainController();
  assert.equal((await controller.check({ system: { onAcPower: true } })).allowed, false);
  const validTemperature = { state: 'VALID', celsius: 60 };
  const initialThreadLimit = validateEcoTrainAdmission({ system: { onAcPower: true, cpuThreads: 5, freeSystemGb: 8, freeDiskGb: 100, processMemoryGb: 1, processPriority: 'below_normal' }, temperature: validTemperature });
  const qualifiedThreadLimit = validateEcoTrainAdmission({ qualified: true, system: { onAcPower: true, cpuThreads: 5, freeSystemGb: 8, freeDiskGb: 100, processMemoryGb: 1, processPriority: 'below_normal' }, temperature: validTemperature });
  assert.equal(initialThreadLimit.allowed, false);
  assert.equal(qualifiedThreadLimit.allowed, true);
  assert.equal(ECO_TRAIN_CONFIG.thermal.pause_c, 75);
  assert.equal(ECO_TRAIN_CONFIG.thermal.emergency_stop_c, 85);
});
