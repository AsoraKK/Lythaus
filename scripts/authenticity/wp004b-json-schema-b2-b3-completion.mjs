import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import {
  JUDGE_JSON_SCHEMA_VERSION,
  JUDGE_MAX_OUTPUT_TOKENS,
  JUDGE_PROMPT_VERSION,
  JUDGE_SYSTEM_PROMPT,
  buildJudgeRequest,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
  packetReferenceIds,
  assertEvidencePacket,
} from '../../packages/authenticity/src/wp004a.ts';
import {
  JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
  JUDGE_EPISTEMIC_POLICY_VERSION,
  WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS,
  WP004B_JSON_SCHEMA_B2_B3_COMPLETION_MAX_CALLS,
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  assertWp004bExpectationsNotInJudgeRequest,
  auditWp004bRationale,
  canonicalJson,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  evaluateWp004bLiveRecommendation,
  writeWp004bAtomicJson,
} from '../../packages/authenticity/src/wp004b.ts';

const PHASE_J_SCHEMA_VERSION = 'lythaus-wp004b-phase-j-json-schema-b2-b3-v1';
const TIMEOUT_MS = WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS;
const MAX_REQUESTS = WP004B_JSON_SCHEMA_B2_B3_COMPLETION_MAX_CALLS;
const CASE_CONFIG = [
  {
    accountingCaseId: 'B2',
    caseId: 'WP004B_LIVE_SAFETY_BLOCK_01',
    historicalJsonObjectExecutionMs: 7_834,
  },
  {
    accountingCaseId: 'B3',
    caseId: 'WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01',
    historicalJsonObjectExecutionMs: 9_091,
  },
];

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-json-schema-b2-b3-completion.json',
    journal: '.artifacts/wp004b-json-schema-b2-b3-completion-call-accounting.json',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-network') options.allowNetwork = true;
    else if (argument === '--output') options.output = argv[++index] ?? null;
    else if (argument === '--journal') options.journal = argv[++index] ?? null;
    else throw new Error('WP004B_ARGUMENT_INVALID');
  }
  if (!options.allowNetwork || !options.output || !options.journal) {
    throw new Error(options.allowNetwork ? 'WP004B_ARGUMENT_INVALID' : 'WP004B_NETWORK_OPT_IN_REQUIRED');
  }
  return options;
}

function safeFailure(error) {
  const allowed = new Set([
    'WP004B_ARGUMENT_INVALID',
    'WP004B_NETWORK_OPT_IN_REQUIRED',
    'WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED',
    'WP004B_ACCOUNTING_BUDGET_INVALID',
    'WP004B_ACCOUNTING_CASES_INVALID',
    'WP004B_ACCOUNTING_MODEL_INVALID',
    'WP004B_CASE_UNKNOWN',
    'WP004B_CALL_CAP_EXCEEDED',
    'WP004B_CASE_CALL_CAP_EXCEEDED',
    'WP004B_CALL_NOT_RESERVED',
    'WP004B_JSON_SCHEMA_B2_B3_PREFLIGHT_FAILED',
    'WP004B_REQUEST_INVARIANTS_INVALID',
    'WP004B_JSON_SCHEMA_PREFLIGHT_FAILED',
    'WP004B_PHASE_J_RUNNER_FAILURE',
  ]);
  return error instanceof Error && allowed.has(error.message) ? error.message : 'WP004B_PHASE_J_RUNNER_FAILURE';
}

function schemaProvenance(schema) {
  const serialized = JSON.stringify(schema);
  return {
    schemaVersion: schema.$id,
    schemaFingerprint: createHash('sha256').update(serialized, 'utf8').digest('hex'),
    canonicalSchemaFingerprint: createHash('sha256').update(canonicalJson(schema), 'utf8').digest('hex'),
    schemaCharacterLength: serialized.length,
  };
}

function safeResponseDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  return {
    transportSucceeded: diagnostics.transportSucceeded,
    providerResultType: diagnostics.providerResultType,
    providerEnvelopeClassification: diagnostics.providerEnvelopeClassification,
    providerTopLevelKeys: diagnostics.providerTopLevelKeys,
    responsePresent: diagnostics.responsePresent,
    responseType: diagnostics.responseType,
    responseTopLevelKeys: diagnostics.responseTopLevelKeys,
    resultPresent: diagnostics.resultPresent,
    resultType: diagnostics.resultType,
    outputTextPresent: diagnostics.outputTextPresent,
    outputTextType: diagnostics.outputTextType,
    reasoningFieldPresent: diagnostics.reasoningFieldPresent,
    reasoningFieldType: diagnostics.reasoningFieldType,
    usageFieldPresent: diagnostics.usageFieldPresent,
    usageFieldType: diagnostics.usageFieldType,
    choicesPresent: diagnostics.choicesPresent,
    choiceCount: diagnostics.choiceCount,
    firstChoiceType: diagnostics.firstChoiceType,
    firstChoiceKeys: diagnostics.firstChoiceKeys,
    messagePresent: diagnostics.messagePresent,
    messageType: diagnostics.messageType,
    messageKeys: diagnostics.messageKeys,
    messageRolePresent: diagnostics.messageRolePresent,
    messageRoleType: diagnostics.messageRoleType,
    messageContentPresent: diagnostics.messageContentPresent,
    messageContentType: diagnostics.messageContentType,
    messageContentLength: diagnostics.messageContentLength,
    finishReasonPresent: diagnostics.finishReasonPresent,
    finishReasonType: diagnostics.finishReasonType,
    finishReasonValueCode: diagnostics.finishReasonValueCode,
    messageToolCallsPresent: diagnostics.messageToolCallsPresent,
    messageToolCallCount: diagnostics.messageToolCallCount,
    toolCallsPresent: diagnostics.toolCallsPresent,
    toolCallCount: diagnostics.toolCallCount,
    messageReasoningFieldPresent: diagnostics.messageReasoningFieldPresent,
    messageReasoningFieldType: diagnostics.messageReasoningFieldType,
    topLevelReasoningFieldPresent: diagnostics.topLevelReasoningFieldPresent,
    topLevelReasoningFieldType: diagnostics.topLevelReasoningFieldType,
    messageContentJsonParseable: diagnostics.messageContentJsonParseable,
    messageContentTopLevelKeys: diagnostics.messageContentTopLevelKeys,
    stringJsonParseable: diagnostics.stringJsonParseable,
    normalizationFailureCode: diagnostics.normalizationFailureCode,
    invalidPrimaryHypothesisToken: diagnostics.invalidPrimaryHypothesisToken ?? null,
  };
}

function safeRecommendation(recommendation) {
  if (!recommendation) return null;
  return {
    schemaVersion: recommendation.schemaVersion,
    primaryHypothesis: recommendation.primaryHypothesis,
    alternativeHypotheses: recommendation.alternativeHypotheses,
    supportingEvidence: recommendation.supportingEvidence,
    contradictoryEvidence: recommendation.contradictoryEvidence,
    missingEvidence: recommendation.missingEvidence,
    uncertainty: recommendation.uncertainty,
    requiresReview: recommendation.requiresReview,
    recommendedAdditionalTests: recommendation.recommendedAdditionalTests,
    rationale: recommendation.rationale,
    enforcementAuthority: recommendation.enforcementAuthority,
  };
}

function safeJudgeResult(result) {
  return {
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    provider: result.provider,
    model: result.model,
    status: result.status,
    executionMs: result.executionMs,
    errorCategory: result.errorCategory ?? null,
    httpStatus: result.httpStatus ?? null,
    transportErrorCategory: result.transportErrorCategory ?? null,
    providerErrorCode: result.providerErrorCode ?? null,
    providerErrorMessageCode: result.providerErrorMessageCode ?? null,
    normalizationFailureCode: result.normalizationFailureCode ?? null,
    responseDiagnostics: safeResponseDiagnostics(result.responseDiagnostics),
    recommendation: safeRecommendation(result.recommendation),
  };
}

function safePacketSummary(packet) {
  return {
    schemaVersion: packet.schemaVersion,
    packetId: packet.packetId,
    runId: packet.runId,
    caseId: packet.caseId,
    sampleId: packet.sampleId,
    sourceFamilyId: packet.sourceFamilyId,
    inputHash: packet.inputHash,
    mime: packet.mime,
    quality: packet.quality,
    evidenceFamilyStatuses: Object.fromEntries(Object.entries(packet.evidenceFamilies).map(([family, summary]) => [family, {
      status: summary.status,
      evidenceIds: summary.evidenceIds,
    }])),
    evidence: packet.evidence.map((item) => ({
      evidenceId: item.evidenceId,
      family: item.family,
      kind: item.kind,
      name: item.name,
      quality: item.quality,
      modelVersion: item.provenance.modelVersion,
    })),
    observationIds: packet.observations.map((observation) => observation.observationId),
    safetyContext: {
      role: packet.safetyContext.role,
      contextId: packet.safetyContext.contextId,
      canonicalResult: packet.safetyContext.canonicalResult,
      quality: packet.safetyContext.quality,
    },
    enforcementAuthority: packet.enforcementAuthority,
  };
}

function validatePreflight(calibrationCase) {
  const config = CASE_CONFIG.find((candidate) => candidate.caseId === calibrationCase.caseId);
  if (!config) throw new Error('WP004B_JSON_SCHEMA_B2_B3_PREFLIGHT_FAILED');
  assertEvidencePacket(calibrationCase.packet);
  const objectRequest = buildJudgeRequest(calibrationCase.packet, { structuredOutputMode: 'JSON_OBJECT' });
  const request = buildJudgeRequest(calibrationCase.packet, { structuredOutputMode: 'JSON_SCHEMA' });
  assertWp004bExpectationsNotInJudgeRequest(request, calibrationCase.expectation);
  if (request.response_format.type !== 'json_schema'
    || objectRequest.response_format.type !== 'json_object'
    || JSON.stringify(request.messages) !== JSON.stringify(objectRequest.messages)
    || request.temperature !== objectRequest.temperature
    || request.max_tokens !== objectRequest.max_tokens
    || request.max_tokens !== JUDGE_MAX_OUTPUT_TOKENS
    || Object.prototype.hasOwnProperty.call(request, 'stream')
    || Object.prototype.hasOwnProperty.call(objectRequest, 'stream')
    || request.messages[0].content !== JUDGE_SYSTEM_PROMPT
    || JUDGE_PROMPT_VERSION !== 'lythaus-gpt-oss-judge-prompt-v3') {
    throw new Error('WP004B_REQUEST_INVARIANTS_INVALID');
  }
  const schema = request.response_format.json_schema;
  try {
    new Ajv({ strict: true }).compile(schema);
  } catch {
    throw new Error('WP004B_JSON_SCHEMA_PREFLIGHT_FAILED');
  }
  const provenance = schemaProvenance(schema);
  const expectedEvidenceIds = [...packetReferenceIds(calibrationCase.packet)]
    .filter((evidenceId) => evidenceId !== calibrationCase.packet.safetyContext.contextId)
    .sort();
  const actualEvidenceIds = schema.properties.supportingEvidence?.items?.properties?.evidenceId?.enum ?? [];
  const expectedObservationIds = [...new Set([
    ...calibrationCase.packet.observations.map((observation) => observation.observationId),
    ...calibrationCase.packet.observationHistory.map((observation) => observation.observationId),
  ])].sort();
  const missingEvidenceProperties = schema.properties.missingEvidence?.items?.properties ?? {};
  const actualObservationIds = missingEvidenceProperties.observationId?.enum ?? [];
  const schemaText = JSON.stringify(schema);
  if (schema.$id !== JUDGE_JSON_SCHEMA_VERSION
    || JSON.stringify(actualEvidenceIds) !== JSON.stringify(expectedEvidenceIds)
    || (expectedObservationIds.length > 0 && JSON.stringify(actualObservationIds) !== JSON.stringify(expectedObservationIds))
    || (expectedObservationIds.length === 0 && Object.prototype.hasOwnProperty.call(missingEvidenceProperties, 'observationId'))
    || actualEvidenceIds.includes(calibrationCase.packet.safetyContext.contextId)
    || ['groundTruth', 'expectedHypothesis', 'caseExpectation'].some((token) => schemaText.includes(token))
    || ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL', 'UNVALIDATED'].some((token) => schemaText.includes(`"${token}"`))) {
    throw new Error('WP004B_JSON_SCHEMA_B2_B3_PREFLIGHT_FAILED');
  }
  return { objectRequest, request, schema, provenance, config };
}

function accountingUpdateForJudge(result) {
  const transportCompleted = result.responseDiagnostics?.transportSucceeded === true
    || result.httpStatus !== null && result.httpStatus !== undefined;
  return {
    transportCompleted,
    canonicalSuccess: result.status === 'SUCCESS',
    executionMs: result.executionMs,
    httpStatus: result.httpStatus ?? null,
    providerEnvelopeClassification: result.responseDiagnostics?.providerEnvelopeClassification ?? null,
    normalizationFailureCode: result.normalizationFailureCode ?? null,
    ambiguousSend: !transportCompleted && ['TIMEOUT', 'NETWORK_FAILURE'].includes(result.transportErrorCategory),
    failureStage: result.status === 'SUCCESS'
      ? 'PROVIDER_ENVELOPE'
      : result.normalizationFailureCode ? 'CANONICAL_SCHEMA' : transportCompleted ? 'PROVIDER_ENVELOPE' : 'TRANSPORT',
  };
}

function caseStatus(judgeResult, evaluation) {
  if (judgeResult.status !== 'SUCCESS') return 'PROVIDER_OR_SCHEMA_FAILURE';
  if (!evaluation?.epistemic.valid) return 'EPISTEMIC_VIOLATION';
  if (!evaluation.expectation.valid) return 'CASE_EXPECTATION_MISMATCH';
  return 'PASS';
}

function latencyBand(executionMs) {
  if (executionMs <= 30_000) return 'ACCEPTABLE_RESEARCH_LATENCY';
  if (executionMs <= 60_000) return 'ELEVATED_RESEARCH_LATENCY';
  return 'MATERIAL_OPERATIONAL_CONCERN';
}

function buildCaseResult({ calibrationCase, preflight, judgeResult, evaluation, evaluationFailure }) {
  const config = preflight.config;
  const ratio = judgeResult.executionMs / config.historicalJsonObjectExecutionMs;
  return {
    caseId: calibrationCase.caseId,
    accountingCaseId: config.accountingCaseId,
    description: calibrationCase.description,
    packet: safePacketSummary(calibrationCase.packet),
    schemaProvenance: preflight.provenance,
    timeoutMs: TIMEOUT_MS,
    historicalJsonObjectExecutionMs: config.historicalJsonObjectExecutionMs,
    latencyBand: latencyBand(judgeResult.executionMs),
    latencyRatioToJsonObject: Number.isFinite(ratio) ? Number(ratio.toFixed(3)) : null,
    judge: safeJudgeResult(judgeResult),
    evaluation: evaluation ? {
      schemaValid: evaluation.schemaValid,
      epistemic: evaluation.epistemic,
      expectation: evaluation.expectation,
      rationaleAudit: auditWp004bRationale({
        caseId: calibrationCase.caseId,
        packet: calibrationCase.packet,
        recommendation: judgeResult.recommendation,
        evaluation,
      }),
    } : null,
    evaluationFailure: evaluationFailure ?? null,
    caseStatus: caseStatus(judgeResult, evaluation),
  };
}

function compatibilityConclusion(results, fatalFailure) {
  if (fatalFailure || results.length < CASE_CONFIG.length || results.some((result) => result.judge.status !== 'SUCCESS')) {
    return 'JSON_SCHEMA_COMPATIBILITY_NOT_CONFIRMED';
  }
  return results.every((result) => result.caseStatus === 'PASS')
    ? 'JSON_SCHEMA_THREE_CASE_COMPATIBILITY_CONFIRMED'
    : 'JSON_SCHEMA_COMPATIBILITY_CONFIRMED_WITH_CONCERNS';
}

function buildSummary({ cases, results, ledger, transport, fatalFailure, stopReason }) {
  const budgetAccounting = ledger.snapshot();
  const transportSnapshot = transport?.snapshot?.() ?? { calls: 0, successes: 0, providerFailures: 0, invocations: [] };
  const orderedResults = CASE_CONFIG.map((config) => results.get(config.accountingCaseId)).filter(Boolean);
  const successfulResults = orderedResults.filter((result) => result.judge.status === 'SUCCESS');
  const epistemicPasses = successfulResults.filter((result) => result.evaluation?.epistemic.valid === true);
  const expectationPasses = successfulResults.filter((result) => result.evaluation?.expectation.valid === true);
  const providerFailures = orderedResults.filter((result) => result.judge.status !== 'SUCCESS').length;
  const schemaFailures = orderedResults.filter((result) => result.judge.normalizationFailureCode !== null).length;
  const epistemicViolations = successfulResults.filter((result) => result.evaluation?.epistemic.valid !== true).length;
  const allPass = orderedResults.length === CASE_CONFIG.length && orderedResults.every((result) => result.caseStatus === 'PASS');
  const hasProviderFailure = orderedResults.some((result) => result.judge.status !== 'SUCCESS');
  const finalClassification = fatalFailure && !hasProviderFailure
    ? 'WP004B_PHASE_J_CONTRACT_BLOCKED'
    : hasProviderFailure || orderedResults.length < CASE_CONFIG.length
      ? 'WP004B_PHASE_J_PROVIDER_BLOCKED'
      : allPass ? 'WP004B_PHASE_J_READY' : 'WP004B_PHASE_J_READY_WITH_CONCERNS';
  return {
    schemaVersion: PHASE_J_SCHEMA_VERSION,
    phase: 'WP004B_PHASE_J_JSON_SCHEMA_B2_B3_COMPLETION',
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    promptVersion: JUDGE_PROMPT_VERSION,
    structuredOutputMode: 'JSON_SCHEMA',
    jsonSchemaVersion: JUDGE_JSON_SCHEMA_VERSION,
    epistemicPolicyVersion: JUDGE_EPISTEMIC_POLICY_VERSION,
    evaluatorSchemaVersion: JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
    packetSchemaVersion: cases[0]?.packet.schemaVersion ?? null,
    timeoutMs: TIMEOUT_MS,
    generationConfig: { temperature: 0, max_tokens: JUDGE_MAX_OUTPUT_TOKENS, stream: false },
    caseOrder: [...WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS],
    casesExecuted: orderedResults.map((result) => result.caseId),
    b2: results.get('B2') ?? null,
    b3: results.get('B3') ?? null,
    aggregate: {
      canonicalSuccesses: successfulResults.length,
      executedCases: orderedResults.length,
      epistemicPasses: epistemicPasses.length,
      expectationPasses: expectationPasses.length,
      providerFailures,
      schemaFailures,
      epistemicViolations,
    },
    invocationAccounting: {
      authorizedMaxJudgeAttempts: MAX_REQUESTS,
      judgeCallsAttempted: budgetAccounting.observed.judgeCallsAttempted,
      judgeCallsCompleted: transportSnapshot.successes + transportSnapshot.providerFailures,
      retries: budgetAccounting.observed.retries,
      b2Attempts: budgetAccounting.attempts.filter((item) => item.caseId === 'B2').length,
      b3Attempts: budgetAccounting.attempts.filter((item) => item.caseId === 'B3').length,
      openAiCalls: 0,
      moondreamCalls: 0,
      otherInferenceCalls: 0,
      transportInvocations: transportSnapshot.invocations,
      budgetIntegrity: budgetAccounting.budgetIntegrity,
      scientificValidity: budgetAccounting.scientificValidity,
    },
    budgetAccounting,
    stopReason: stopReason ?? null,
    fatalFailure: fatalFailure ? safeFailure(fatalFailure) : null,
    enforcementAuthority: false,
    compatibilityConclusion: compatibilityConclusion(orderedResults, fatalFailure),
    defaultMode: 'JSON_OBJECT',
    finalClassification,
  };
}

async function main() {
  const allCases = createWp004bLiveCalibrationCases();
  const casesById = new Map(allCases.map((calibrationCase) => [calibrationCase.caseId, calibrationCase]));
  const selectedCases = CASE_CONFIG.map((config) => casesById.get(config.caseId));
  if (selectedCases.some((calibrationCase) => !calibrationCase)) throw new Error('WP004B_JSON_SCHEMA_B2_B3_PREFLIGHT_FAILED');
  const ledger = createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS,
    maxJudgeCalls: MAX_REQUESTS,
    maxTotalCalls: MAX_REQUESTS,
  });
  let options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-json-schema-b2-b3-completion.json',
    journal: '.artifacts/wp004b-json-schema-b2-b3-completion-call-accounting.json',
  };
  let transport = null;
  let activeCase = null;
  let fatalFailure = null;
  let stopReason = null;
  const results = new Map();
  const persistJournal = async () => writeWp004bAtomicJson(options.journal, ledger.snapshot());

  try {
    options = parseArgs(process.argv.slice(2));
    await persistJournal();
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED');
    transport = createCloudflareRestTransport({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      allowNetwork: options.allowNetwork,
      maxRequests: MAX_REQUESTS,
      timeoutMs: TIMEOUT_MS,
    });
    const judge = createCloudflareJudgeRest({
      transport,
      model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
      structuredOutputMode: 'JSON_SCHEMA',
    });
    for (const calibrationCase of selectedCases) {
      activeCase = calibrationCase;
      const preflight = validatePreflight(calibrationCase);
      const accountingCaseId = preflight.config.accountingCaseId;
      ledger.preCallValidation(accountingCaseId);
      await persistJournal();
      ledger.reserveCall(accountingCaseId);
      await persistJournal();
      let judgeResult;
      try {
        judgeResult = await judge.judge({ packet: calibrationCase.packet });
      } catch (error) {
        ledger.markAmbiguousSend(accountingCaseId);
        ledger.markResultAvailable(accountingCaseId);
        activeCase = null;
        await persistJournal();
        throw error;
      }
      ledger.postTransport(accountingCaseId, accountingUpdateForJudge(judgeResult));
      activeCase = null;
      await persistJournal();
      let evaluation = null;
      let evaluationFailure = null;
      if (judgeResult.status === 'SUCCESS' && judgeResult.recommendation) {
        ledger.setStage(accountingCaseId, 'EPISTEMIC_EVALUATION');
        await persistJournal();
        try {
          evaluation = evaluateWp004bLiveRecommendation(calibrationCase.packet, judgeResult.recommendation, calibrationCase.expectation);
        } catch {
          evaluationFailure = 'WP004B_EPISTEMIC_EVALUATION_FAILURE';
        }
        if (evaluation) ledger.setStage(accountingCaseId, 'CASE_EXPECTATION');
      }
      if (judgeResult.status === 'SUCCESS' && !judgeResult.recommendation) ledger.setStage(accountingCaseId, 'CANONICAL_SCHEMA');
      const caseResult = buildCaseResult({ calibrationCase, preflight, judgeResult, evaluation, evaluationFailure });
      results.set(accountingCaseId, caseResult);
      ledger.markResultAvailable(accountingCaseId);
      ledger.setStage(accountingCaseId, 'COMPLETED');
      await persistJournal();
      if (judgeResult.status !== 'SUCCESS') {
        stopReason = 'B2_PROVIDER_OR_SCHEMA_FAILURE_STOPPED_B3';
        break;
      }
    }
  } catch (error) {
    fatalFailure = error;
    if (activeCase) {
      const accountingCaseId = CASE_CONFIG.find((config) => config.caseId === activeCase.caseId)?.accountingCaseId;
      if (accountingCaseId) {
        try {
          ledger.markAmbiguousSend(accountingCaseId);
          ledger.markResultAvailable(accountingCaseId);
        } catch { }
      }
    }
    try { await persistJournal(); } catch { }
  } finally {
    try {
      await persistJournal();
      const summary = buildSummary({ cases: selectedCases, results, ledger, transport, fatalFailure, stopReason });
      await writeWp004bAtomicJson(options.output, summary);
      console.log(JSON.stringify(summary));
      const snapshot = ledger.snapshot();
      if (fatalFailure || snapshot.budgetIntegrity !== 'PASS' || summary.finalClassification !== 'WP004B_PHASE_J_READY') process.exitCode = 1;
    } catch (error) {
      try { await persistJournal(); } catch { }
      console.error(JSON.stringify({
        schemaVersion: PHASE_J_SCHEMA_VERSION,
        status: 'FAILED',
        errorCategory: safeFailure(error),
        budgetAccounting: ledger.snapshot(),
      }));
      process.exitCode = 1;
    }
  }
}

await main();
