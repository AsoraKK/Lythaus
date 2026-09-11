import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  classifyGeometryOcclusionComparison,
  classifyGeometryFrontBackComparison,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
  createCloudflareVisionObserverRest,
  createMockJudge,
  createMockModerationProvider,
  createOpenAIModerationProvider,
  evaluateGeometryOcclusionObservation,
  evaluateGeometryFrontBackObservation,
  researchRunExitCode,
  runResearchTrial,
  summarizeGeometryFrontBackEvaluations,
  VISION_OBSERVER_PROMPT_VERSION,
  VISION_OBSERVER_PROTOCOL_VERSION,
  VISION_OBSERVER_QUERY_GENERATION_CONFIG,
} from '../../packages/authenticity/src/wp004a.ts';
import { validateGeometryOcclusionPng } from './geometry-occlusion-fixture.mjs';
import { validateGeometryOcclusionFrontBackPng } from './geometry-occlusion-frontback-fixtures.mjs';
import { WP004A_CLOUDFLARE_TRIAL_MODES } from './wp004a-cloudflare-trial-config.mjs';

const TRIAL_MODES = WP004A_CLOUDFLARE_TRIAL_MODES;

const RELATIONAL_FIXTURE_SPEC = 'research/wp004a/geometry-occlusion-fixture-v1.json';
const FRONTBACK_RUNTIME_SPEC = 'research/wp004a/geometry-occlusion-frontback-runtime-v2.json';
const FRONTBACK_TRUTH_SPEC = 'research/wp004a/geometry-occlusion-frontback-truth-v2.json';

function parseArgs(argv) {
  const options = { trial: '0C', image: null, frontbackDir: null, output: null, allowNetwork: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--trial') options.trial = String(argv[++index] ?? '').toUpperCase();
    else if (argument === '--image') options.image = argv[++index];
    else if (argument === '--frontback-dir') options.frontbackDir = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--allow-network') options.allowNetwork = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!Object.prototype.hasOwnProperty.call(TRIAL_MODES, options.trial)) throw new Error('cloudflare_trial_invalid');
  const frontbackTrial = options.trial === '0C-REL-FRONTBACK-AB';
  if (frontbackTrial ? !options.frontbackDir : !options.image) throw new Error(frontbackTrial ? 'cloudflare_trial_frontback_directory_required' : 'cloudflare_trial_image_required');
  if (!options.allowNetwork) throw new Error('cloudflare_trial_network_opt_in_required');
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('cloudflare_rest_credentials_required');
  return options;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'cloudflare_trial_failed';
  return message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]').replace(/CLOUDFLARE_API_TOKEN[^\s]*/gi, 'CLOUDFLARE_API_TOKEN_REDACTED').slice(0, 180);
}

function safeObservation(observation) {
  return {
    observationId: observation.observationId,
    queryId: observation.queryId,
    protocolVersion: observation.protocolVersion,
    category: observation.category,
    task: observation.task,
    reasoningMode: observation.reasoningMode,
    applicable: observation.applicable,
    status: observation.status,
    observation: observation.observation,
    regions: observation.regions,
    measurementConfidence: observation.measurementConfidence,
    limitations: observation.limitations,
    provider: observation.provider,
    model: observation.model,
    executionMs: observation.executionMs,
  };
}

function safeResponseDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  return {
    transportSucceeded: diagnostics.transportSucceeded,
    providerResultType: diagnostics.providerResultType,
    providerTopLevelKeys: diagnostics.providerTopLevelKeys,
    answerPresent: diagnostics.answerPresent,
    answerType: diagnostics.answerType,
    answerLength: diagnostics.answerLength,
    reasoningFieldPresent: diagnostics.reasoningFieldPresent,
    reasoningFieldType: diagnostics.reasoningFieldType,
    answerJsonParseable: diagnostics.answerJsonParseable,
    parsedTopLevelType: diagnostics.parsedTopLevelType,
    parsedTopLevelKeys: diagnostics.parsedTopLevelKeys,
    observationsPresent: diagnostics.observationsPresent,
    observationCount: diagnostics.observationCount,
    normalizationFailureCode: diagnostics.normalizationFailureCode,
    invalidStatusToken: diagnostics.invalidStatusToken ?? null,
    regionDiagnostics: diagnostics.regionDiagnostics ?? null,
  };
}

function safeObserverResult(observer) {
  if (!observer) return null;
  return {
    schemaVersion: observer.schemaVersion,
    protocolVersion: observer.protocolVersion,
    promptVersion: observer.promptVersion,
    provider: observer.provider,
    model: observer.model,
    queryId: observer.queryId,
    task: observer.task,
    reasoningMode: observer.reasoningMode,
    regionPolicy: observer.regionPolicy,
    generationConfig: observer.generationConfig,
    status: observer.status,
    observations: observer.observations.map(safeObservation),
    escalationRecommendation: observer.escalationRecommendation,
    escalationReasons: observer.escalationReasons,
    executionMs: observer.executionMs,
    errorCategory: observer.errorCategory ?? null,
    transportErrorCategory: observer.transportErrorCategory ?? null,
    httpStatus: observer.httpStatus ?? null,
    providerErrorCode: observer.providerErrorCode ?? null,
    providerErrorMessageCode: observer.providerErrorMessageCode ?? null,
    responseDiagnostics: safeResponseDiagnostics(observer.responseDiagnostics),
  };
}

function safeComparison(comparison) {
  if (!comparison) return null;
  return {
    schemaVersion: comparison.schemaVersion,
    sampleId: comparison.sampleId,
    inputHash: comparison.inputHash,
    queryId: comparison.queryId,
    category: comparison.category,
    protocolVersion: comparison.protocolVersion,
    direct: {
      status: comparison.direct.status,
      observations: comparison.direct.observations.map(safeObservation),
      provider: comparison.direct.provider,
      model: comparison.direct.model,
      promptVersion: comparison.direct.promptVersion,
      task: comparison.direct.task,
      reasoningMode: comparison.direct.reasoningMode,
      regionPolicy: comparison.direct.regionPolicy,
      generationConfig: comparison.direct.generationConfig,
      executionMs: comparison.direct.executionMs,
      escalationRecommendation: comparison.direct.escalationRecommendation,
      escalationReasons: comparison.direct.escalationReasons,
      transportErrorCategory: comparison.direct.transportErrorCategory ?? null,
      httpStatus: comparison.direct.httpStatus ?? null,
      providerErrorCode: comparison.direct.providerErrorCode ?? null,
      providerErrorMessageCode: comparison.direct.providerErrorMessageCode ?? null,
      responseDiagnostics: safeResponseDiagnostics(comparison.direct.responseDiagnostics),
    },
    reasoned: {
      status: comparison.reasoned.status,
      observations: comparison.reasoned.observations.map(safeObservation),
      provider: comparison.reasoned.provider,
      model: comparison.reasoned.model,
      promptVersion: comparison.reasoned.promptVersion,
      task: comparison.reasoned.task,
      reasoningMode: comparison.reasoned.reasoningMode,
      regionPolicy: comparison.reasoned.regionPolicy,
      generationConfig: comparison.reasoned.generationConfig,
      executionMs: comparison.reasoned.executionMs,
      escalationRecommendation: comparison.reasoned.escalationRecommendation,
      escalationReasons: comparison.reasoned.escalationReasons,
      transportErrorCategory: comparison.reasoned.transportErrorCategory ?? null,
      httpStatus: comparison.reasoned.httpStatus ?? null,
      providerErrorCode: comparison.reasoned.providerErrorCode ?? null,
      providerErrorMessageCode: comparison.reasoned.providerErrorMessageCode ?? null,
      responseDiagnostics: safeResponseDiagnostics(comparison.reasoned.responseDiagnostics),
    },
    contradictory: comparison.contradictory,
  };
}

function safeRelationalEvaluation(evaluation) {
  if (!evaluation) return null;
  return {
    schemaVersion: evaluation.schemaVersion,
    fixtureId: evaluation.fixtureId,
    fixtureVersion: evaluation.fixtureVersion,
    observationId: evaluation.observationId,
    occlusionIdentified: evaluation.occlusionIdentified,
    frontBackCorrect: evaluation.frontBackCorrect,
    geometryConsistencyCorrect: evaluation.geometryConsistencyCorrect,
    controlObjectFalseRelation: evaluation.controlObjectFalseRelation,
    unsupportedAssertionCount: evaluation.unsupportedAssertionCount,
    originVerdictViolation: evaluation.originVerdictViolation,
    canonicalProtocolValid: evaluation.canonicalProtocolValid,
    indeterminate: evaluation.indeterminate,
    requiresReview: evaluation.requiresReview,
    reviewReasons: evaluation.reviewReasons,
  };
}

function safeFrontBackEvaluation(evaluation) {
  if (!evaluation) return null;
  return {
    schemaVersion: evaluation.schemaVersion,
    fixtureId: evaluation.fixtureId,
    fixtureVersion: evaluation.fixtureVersion,
    observationId: evaluation.observationId,
    selectedRelation: evaluation.selectedRelation,
    outcome: evaluation.outcome,
    canonicalProtocolValid: evaluation.canonicalProtocolValid,
    regionsEmpty: evaluation.regionsEmpty,
    unsupportedAssertionCount: evaluation.unsupportedAssertionCount,
    originVerdictViolation: evaluation.originVerdictViolation,
    requiresReview: evaluation.requiresReview,
    reviewReasons: evaluation.reviewReasons,
  };
}

const options = parseArgs(process.argv.slice(2));
try {
  const mode = TRIAL_MODES[options.trial];
  const relationalTrial = options.trial === '0C-REL-AB';
  const frontbackTrial = options.trial === '0C-REL-FRONTBACK-AB';
  let relationalSpec = null;
  let frontbackRuntimeSpec = null;
  let frontbackTruthSpec = null;
  const sampleBytes = new Map();
  let bytes = null;
  if (frontbackTrial) {
    frontbackRuntimeSpec = JSON.parse(await readFile(path.resolve(FRONTBACK_RUNTIME_SPEC), 'utf8'));
    frontbackTruthSpec = JSON.parse(await readFile(path.resolve(FRONTBACK_TRUTH_SPEC), 'utf8'));
    if (!Array.isArray(frontbackRuntimeSpec.entries) || frontbackRuntimeSpec.entries.length !== 2) throw new Error('geometry_frontback_runtime_entries_invalid');
    if (!Array.isArray(frontbackTruthSpec.entries) || frontbackTruthSpec.entries.length !== 2) throw new Error('geometry_frontback_truth_entries_invalid');
    if (/BLUE_FRONT|RED_FRONT/.test(JSON.stringify(frontbackRuntimeSpec))) throw new Error('geometry_frontback_runtime_truth_label_present');
    if (frontbackRuntimeSpec.observerInput?.truthProvided !== false || frontbackRuntimeSpec.observerInput?.regionPolicy !== 'FORBID') throw new Error('geometry_frontback_runtime_observer_input_invalid');
    for (const entry of frontbackRuntimeSpec.entries) {
      const entryBytes = new Uint8Array(await readFile(path.resolve(options.frontbackDir, entry.path)));
      const validation = await validateGeometryOcclusionFrontBackPng(entryBytes);
      if (!validation.valid) throw new Error(`geometry_frontback_fixture_invalid:${entry.sampleId}:${validation.reason}`);
      if (validation.sha256 !== entry.sha256) throw new Error(`geometry_frontback_fixture_hash_mismatch:${entry.sampleId}`);
      sampleBytes.set(entry.sampleId, entryBytes);
    }
  } else {
    bytes = new Uint8Array(await readFile(path.resolve(options.image)));
  }
  if (relationalTrial) {
    const validation = await validateGeometryOcclusionPng(bytes);
    if (!validation.valid) throw new Error(`geometry_fixture_invalid:${validation.reason}`);
    relationalSpec = JSON.parse(await readFile(path.resolve(RELATIONAL_FIXTURE_SPEC), 'utf8'));
    if (validation.sha256 !== relationalSpec.sha256) throw new Error('geometry_fixture_hash_mismatch');
  }
  const observerRequests = frontbackTrial ? 4 : options.trial === '0C-AB' || options.trial === '0C-REL-AB' || options.trial === '0D-R' ? 2 : 1;
  const judgeRequests = options.trial === '0D-R' ? 2 : 1;
  const observerTransport = createCloudflareRestTransport({ apiToken: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, allowNetwork: true, maxRequests: observerRequests });
  const judgeTransport = createCloudflareRestTransport({ apiToken: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, allowNetwork: true, maxRequests: judgeRequests });
  const runtimeEntries = frontbackTrial
    ? frontbackRuntimeSpec.entries.map((entry) => ({ sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, path: entry.path, rightsClass: 'C', evaluationAllowed: false }))
    : [{ sampleId: relationalTrial ? 'WP004A_GEOMETRY_OCCLUSION_01' : 'WP004A_NEUTRAL', sourceFamilyId: relationalTrial ? 'WP004A_GEOMETRY_OCCLUSION_01' : 'WP004A_NEUTRAL', path: relationalTrial ? 'geometry-occlusion.png' : 'neutral.png', rightsClass: 'C', evaluationAllowed: false }];
  const runtimeManifest = {
    schemaVersion: 'lythaus-wp004a-runtime-manifest-v1',
    manifestType: 'RUNTIME',
    entries: runtimeEntries,
  };
  const observerRequest = frontbackTrial
    ? { queryId: frontbackRuntimeSpec.observerInput.queryId, category: frontbackRuntimeSpec.observerInput.category, task: frontbackRuntimeSpec.observerInput.task, question: frontbackRuntimeSpec.observerInput.question, regionPolicy: frontbackRuntimeSpec.observerInput.regionPolicy, reasoningMode: 'DIRECT' }
    : relationalTrial
    ? { queryId: 'GEOMETRY_OCCLUSION_01', category: 'GEOMETRY_OCCLUSION', task: 'query', question: 'Inspect the visible overlap relationship between the two primary coloured rectangular shapes. Report only visible geometry. Determine whether one rectangle visibly occludes part of the other, which rectangle appears in front in the overlap region, whether the visible intersection is geometrically consistent, or whether the evidence is insufficient to decide. The separate circular object may be described only if relevant to the geometry assessment. Do not infer image origin. Do not determine whether the image is AI-generated.' }
    : { queryId: 'SCENE_INVENTORY_01', category: 'SCENE_INVENTORY', task: 'query', question: 'Describe the visible scene elements without making an origin or authenticity judgment.' };
  const result = await runResearchTrial({
    mode,
    runtimeManifest,
    maxSamples: frontbackTrial ? 2 : 1,
    allowNetwork: true,
    enableRecheck: mode === 'FULL_RECHECK',
    observerRequest,
    caps: { maxSamples: frontbackTrial ? 2 : 1, maxModerationCalls: mode === 'FULL' || mode === 'FULL_RECHECK' ? 1 : 0, maxObserverCalls: observerRequests, maxObserverDirectCalls: frontbackTrial ? 2 : mode === 'OBSERVER_AB' || mode === 'FULL_RECHECK' ? 1 : 1, maxObserverReasonedCalls: frontbackTrial ? 2 : observerRequests > 1 ? 1 : 1, maxJudgeCalls: judgeRequests, maxTotalCalls: mode === 'FULL_RECHECK' ? 5 : mode === 'FULL' ? 3 : observerRequests },
  }, {
    readSample: async (entry) => ({ bytes: frontbackTrial ? sampleBytes.get(entry.sampleId) : bytes, mime: 'image/png' }),
    moderation: mode === 'FULL' || mode === 'FULL_RECHECK' ? createOpenAIModerationProvider({ apiKey: process.env.OPENAI_API_KEY }) : createMockModerationProvider(),
    observer: createCloudflareVisionObserverRest({ transport: observerTransport }),
    judge: mode === 'FULL' || mode === 'FULL_RECHECK' ? createCloudflareJudgeRest({ transport: judgeTransport }) : createMockJudge(),
  });
  if (relationalTrial && (result.mode !== 'OBSERVER_AB' || result.invocationAccounting.calls.observerDirect !== 1 || result.invocationAccounting.calls.observerReasoned !== 1 || result.invocationAccounting.calls.total !== 2)) {
    throw new Error('relational_observer_call_accounting_mismatch');
  }
  if (frontbackTrial && (result.mode !== 'OBSERVER_AB' || result.cases.length !== 2 || result.invocationAccounting.calls.observerDirect !== 2 || result.invocationAccounting.calls.observerReasoned !== 2 || result.invocationAccounting.calls.total !== 4 || result.invocationAccounting.retries !== 0)) {
    throw new Error('frontback_observer_call_accounting_mismatch');
  }
  const relationalComparison = relationalTrial ? result.cases[0]?.observerComparison : null;
  const relationalEvaluation = relationalComparison && relationalSpec
    ? {
      direct: evaluateGeometryOcclusionObservation({ observation: relationalComparison.direct.observations[0] ?? null, truth: relationalSpec.truth }),
      reasoned: evaluateGeometryOcclusionObservation({ observation: relationalComparison.reasoned.observations[0] ?? null, truth: relationalSpec.truth }),
    }
    : null;
  const frontbackEvaluations = frontbackTrial
    ? result.cases.map((item) => {
      const truth = frontbackTruthSpec.entries.find((entry) => entry.fixtureId === item.sampleId);
      if (!truth) throw new Error(`geometry_frontback_truth_missing:${item.sampleId}`);
      const direct = evaluateGeometryFrontBackObservation({ observations: item.observerComparison?.direct.observations ?? [], truth });
      const reasoned = evaluateGeometryFrontBackObservation({ observations: item.observerComparison?.reasoned.observations ?? [], truth });
      return { sampleId: item.sampleId, direct, reasoned };
    })
    : null;
  const frontbackDirectEvaluations = frontbackEvaluations?.map((item) => item.direct) ?? [];
  const frontbackReasonedEvaluations = frontbackEvaluations?.map((item) => item.reasoned) ?? [];
  const truthFrontByFixture = frontbackTrial ? new Map(frontbackTruthSpec.entries.map((entry) => [entry.fixtureId, entry.truth.front])) : undefined;
  const frontbackDirectAggregate = frontbackTrial ? summarizeGeometryFrontBackEvaluations(frontbackDirectEvaluations, truthFrontByFixture) : null;
  const frontbackReasonedAggregate = frontbackTrial ? summarizeGeometryFrontBackEvaluations(frontbackReasonedEvaluations, truthFrontByFixture) : null;
  const summary = {
    schemaVersion: result.schemaVersion,
    trial: options.trial,
    mode: result.mode,
    caseCount: result.cases.length,
    fixture: relationalTrial ? { fixtureId: relationalSpec.fixtureId, fixtureVersion: relationalSpec.version, generatorVersion: relationalSpec.generatorVersion, format: relationalSpec.format, dimensions: relationalSpec.dimensions, sha256: relationalSpec.sha256 } : frontbackTrial ? { fixtureVersion: frontbackRuntimeSpec.fixtureVersion, generatorVersion: frontbackRuntimeSpec.generatorVersion, format: frontbackRuntimeSpec.format, dimensions: frontbackRuntimeSpec.dimensions, construction: frontbackRuntimeSpec.construction, entries: frontbackRuntimeSpec.entries.map((entry) => ({ sampleId: entry.sampleId, sourceFamilyId: entry.sourceFamilyId, path: entry.path, sha256: entry.sha256 })) } : null,
    inputControl: relationalTrial || frontbackTrial ? { queryId: observerRequest.queryId, category: observerRequest.category, task: observerRequest.task, question: observerRequest.question, regionPolicy: observerRequest.regionPolicy ?? 'CANONICAL', promptVersion: VISION_OBSERVER_PROMPT_VERSION, protocolVersion: VISION_OBSERVER_PROTOCOL_VERSION, generationConfig: VISION_OBSERVER_QUERY_GENERATION_CONFIG } : null,
    cases: result.cases.map((item) => ({
      sampleId: item.sampleId,
      inputHash: item.inputHash,
      status: item.status,
      observer: safeObserverResult(item.observer),
      observerComparison: safeComparison(item.observerComparison),
      recheckRounds: item.recheckRounds,
    })),
    relationalEvaluation: relationalEvaluation ? { direct: safeRelationalEvaluation(relationalEvaluation.direct), reasoned: safeRelationalEvaluation(relationalEvaluation.reasoned), classification: classifyGeometryOcclusionComparison(relationalEvaluation) } : null,
    frontbackEvaluation: frontbackTrial ? { cases: frontbackEvaluations.map((item) => ({ sampleId: item.sampleId, direct: safeFrontBackEvaluation(item.direct), reasoned: safeFrontBackEvaluation(item.reasoned) })), direct: frontbackDirectAggregate, reasoned: frontbackReasonedAggregate, classification: classifyGeometryFrontBackComparison({ direct: frontbackDirectEvaluations, reasoned: frontbackReasonedEvaluations }) } : null,
    invocationAccounting: result.invocationAccounting,
    enforcementAuthority: result.enforcementAuthority,
  };
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(summary));
  if (researchRunExitCode(result) !== 0 || (frontbackTrial && (frontbackDirectAggregate.protocolFailures > 0 || frontbackReasonedAggregate.protocolFailures > 0))) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: 'lythaus-wp004a-research-run-v1', status: 'FAILED', errorCategory: safeError(error) }));
  process.exitCode = 1;
}
