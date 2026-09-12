import {
  buildJudgeRequest,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
} from '../../packages/authenticity/src/wp004a.ts';
import {
  JUDGE_EPISTEMIC_POLICY_VERSION,
  JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
  WP004B_LIVE_CALIBRATION_SCHEMA_VERSION,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  assertWp004bExpectationsNotInJudgeRequest,
  evaluateWp004bLiveRecommendation,
  auditWp004bRationale,
  writeWp004bAtomicJson,
} from '../../packages/authenticity/src/wp004b.ts';

const GPT_OSS_MODEL = '@cf/openai/gpt-oss-20b';
const MAX_REQUESTS = 3;

function parseArgs(argv) {
  const options = { allowNetwork: false, output: null, journal: '.artifacts/wp004b-call-accounting.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-network') options.allowNetwork = true;
    else if (argument === '--output') options.output = argv[++index] ?? null;
    else if (argument === '--journal') {
      options.journal = argv[++index] ?? null;
      if (!options.journal) throw new Error('WP004B_ARGUMENT_INVALID');
    }
    else throw new Error('WP004B_ARGUMENT_INVALID');
  }
  if (!options.allowNetwork) throw new Error('WP004B_NETWORK_OPT_IN_REQUIRED');
  return options;
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
    toolCallsPresent: diagnostics.toolCallsPresent,
    toolCallCount: diagnostics.toolCallCount,
    messageToolCallsPresent: diagnostics.messageToolCallsPresent,
    messageToolCallCount: diagnostics.messageToolCallCount,
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

function safeJudgeResult(judge) {
  return {
    schemaVersion: judge.schemaVersion,
    promptVersion: judge.promptVersion,
    provider: judge.provider,
    model: judge.model,
    status: judge.status,
    executionMs: judge.executionMs,
    errorCategory: judge.errorCategory ?? null,
    httpStatus: judge.httpStatus ?? null,
    transportErrorCategory: judge.transportErrorCategory ?? null,
    providerErrorCode: judge.providerErrorCode ?? null,
    providerErrorMessageCode: judge.providerErrorMessageCode ?? null,
    normalizationFailureCode: judge.normalizationFailureCode ?? null,
    responseDiagnostics: safeResponseDiagnostics(judge.responseDiagnostics),
    recommendation: safeRecommendation(judge.recommendation),
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
    dimensions: packet.dimensions,
    originAxes: packet.originAxes,
    safetyContext: {
      role: packet.safetyContext.role,
      contextId: packet.safetyContext.contextId,
      provider: packet.safetyContext.provider,
      model: packet.safetyContext.model,
      canonicalResult: packet.safetyContext.canonicalResult,
      quality: packet.safetyContext.quality,
    },
    evidenceFamilies: Object.fromEntries(Object.entries(packet.evidenceFamilies).map(([family, summary]) => [family, {
      family: summary.family,
      status: summary.status,
      evidenceIds: summary.evidenceIds,
      limitations: summary.limitations,
    }])),
    evidence: packet.evidence.map((item) => ({
      evidenceId: item.evidenceId,
      family: item.family,
      kind: item.kind,
      name: item.name,
      quality: item.quality,
      provenance: {
        evidenceFamily: item.provenance.evidenceFamily,
        sourceComponent: item.provenance.sourceComponent,
        provider: item.provenance.provider,
        modelVersion: item.provenance.modelVersion,
        schemaVersion: item.provenance.schemaVersion,
        applicable: item.provenance.applicable,
        inputHash: item.provenance.inputHash,
      },
    })),
    observationIds: packet.observations.map((observation) => observation.observationId),
    quality: packet.quality,
    enforcementAuthority: packet.enforcementAuthority,
  };
}

function isSharedFailure(judge) {
  if (judge.status !== 'PROVIDER_FAILURE') return false;
  if (['TIMEOUT', 'NETWORK_FAILURE'].includes(judge.errorCategory)) return true;
  if (['MISSING_CREDENTIAL', 'NETWORK_DISABLED', 'HTTP_AUTHENTICATION_FAILURE', 'HTTP_RATE_LIMITED', 'HTTP_SERVER_FAILURE'].includes(judge.transportErrorCategory)) return true;
  return ['CHOICES_MISSING', 'CHOICES_TYPE_UNSUPPORTED', 'CHOICES_EMPTY', 'CHOICE_COUNT_INVALID', 'CHOICE_INVALID', 'MESSAGE_MISSING', 'MESSAGE_INVALID', 'MESSAGE_CONTENT_MISSING', 'MESSAGE_CONTENT_TYPE_UNSUPPORTED', 'MESSAGE_CONTENT_NOT_JSON', 'FINISH_REASON_TRUNCATED', 'FINISH_REASON_UNSUPPORTED', 'UNEXPECTED_TOOL_CALL'].includes(judge.normalizationFailureCode);
}

function caseStatus(judge, evaluation) {
  if (judge.status !== 'SUCCESS') return 'PROVIDER_OR_SCHEMA_FAILURE';
  if (!evaluation?.epistemic.valid) return 'EPISTEMIC_VIOLATION';
  if (!evaluation.expectation.valid) return 'CASE_EXPECTATION_MISMATCH';
  return 'PASS';
}

function safeFailure(error) {
  const allowed = new Set([
    'WP004B_ARGUMENT_INVALID',
    'WP004B_NETWORK_OPT_IN_REQUIRED',
    'WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED',
    'WP004B_CALL_CAP_EXCEEDED',
    'WP004B_CASE_CALL_CAP_EXCEEDED',
    'WP004B_CASE_UNKNOWN',
    'WP004B_CALL_NOT_RESERVED',
    'WP004B_ACCOUNTING_BUDGET_INVALID',
    'WP004B_ACCOUNTING_CASES_INVALID',
    'WP004B_ACCOUNTING_MODEL_INVALID',
  ]);
  if (error instanceof Error && allowed.has(error.message)) return error.message;
  return 'WP004B_RUNNER_FAILURE';
}

function accountingUpdateForJudge(judgeResult) {
  const transportCompleted = judgeResult.responseDiagnostics?.transportSucceeded === true || judgeResult.httpStatus !== null && judgeResult.httpStatus !== undefined;
  return {
    transportCompleted,
    canonicalSuccess: judgeResult.status === 'SUCCESS',
    executionMs: judgeResult.executionMs,
    httpStatus: judgeResult.httpStatus ?? null,
    providerEnvelopeClassification: judgeResult.responseDiagnostics?.providerEnvelopeClassification ?? null,
    normalizationFailureCode: judgeResult.normalizationFailureCode ?? null,
    failureStage: judgeResult.status === 'SUCCESS'
      ? 'PROVIDER_ENVELOPE'
      : judgeResult.normalizationFailureCode ? 'CANONICAL_SCHEMA' : 'TRANSPORT',
  };
}

function safeThrownJudgeResult(error, executionMs) {
  return {
    schemaVersion: 'lythaus-judge-result-v1',
    promptVersion: null,
    provider: 'cloudflare-workers-ai-rest',
    model: GPT_OSS_MODEL,
    status: 'PROVIDER_FAILURE',
    executionMs,
    errorCategory: 'NETWORK_FAILURE',
    failureCategory: safeFailure(error),
    recommendation: null,
  };
}

function buildSummary({ calibrationCases, results, stoppedAfter, ledger, transport, fatalFailure = null }) {
  const budgetAccounting = ledger.snapshot();
  const snapshot = transport?.snapshot?.() ?? { calls: budgetAccounting.observed.judgeCallsAttempted, invocations: [] };
  return {
    schemaVersion: WP004B_LIVE_CALIBRATION_SCHEMA_VERSION,
    policyVersion: JUDGE_EPISTEMIC_POLICY_VERSION,
    evaluatorSchemaVersion: JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
    trial: 'WP004B_PHASE_B_LIVE_CALIBRATION',
    model: GPT_OSS_MODEL,
    promptVersion: results[0]?.judge.promptVersion ?? null,
    generationConfig: { temperature: 0, max_tokens: 2400, stream: false },
    caseOrder: calibrationCases.map((item) => item.caseId),
    completedCaseCount: results.length,
    stoppedAfter,
    cases: results,
    aggregate: {
      canonicalSuccesses: results.filter((item) => item.judge.status === 'SUCCESS' && item.evaluation?.schemaValid).length,
      epistemicPasses: results.filter((item) => item.evaluation?.epistemic.valid === true).length,
      caseExpectationPasses: results.filter((item) => item.evaluation?.expectation.valid === true).length,
      providerFailures: results.filter((item) => item.judge.status === 'PROVIDER_FAILURE').length,
      schemaFailures: results.filter((item) => item.judge.status === 'SUCCESS'
        ? item.evaluation?.schemaValid === false
        : Boolean(item.judge.normalizationFailureCode)).length,
      epistemicViolationCount: results.reduce((sum, item) => sum + (item.evaluation?.epistemic.violations.length ?? 0), 0),
    },
    invocationAccounting: {
      judgeCalls: budgetAccounting.observed.judgeCallsAttempted,
      totalProviderCalls: budgetAccounting.observed.totalCallsAttempted,
      retries: budgetAccounting.observed.retries,
      openAiCalls: 0,
      moondreamCalls: 0,
      otherInferenceCalls: 0,
      transportInvocations: snapshot.invocations,
      budgetIntegrity: budgetAccounting.budgetIntegrity,
      scientificValidity: budgetAccounting.scientificValidity,
    },
    budgetAccounting,
    fatalFailure: fatalFailure ? safeFailure(fatalFailure) : null,
    enforcementAuthority: false,
  };
}

async function main() {
  const calibrationCases = createWp004bLiveCalibrationCases();
  const ledger = createWp004bBudgetLedger({ model: GPT_OSS_MODEL, caseIds: calibrationCases.map((item) => item.caseId) });
  let options = { allowNetwork: false, output: null, journal: '.artifacts/wp004b-call-accounting.json' };
  let transport = null;
  let judge = null;
  const results = [];
  let stoppedAfter = null;
  let currentCaseId = null;
  let currentCallReserved = false;
  let fatalFailure = null;
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
    });
    judge = createCloudflareJudgeRest({ transport, model: GPT_OSS_MODEL });

    for (const calibrationCase of calibrationCases) {
      currentCaseId = calibrationCase.caseId;
      ledger.preCallValidation(currentCaseId);
      const request = buildJudgeRequest(calibrationCase.packet);
      assertWp004bExpectationsNotInJudgeRequest(request, calibrationCase.expectation);
      await persistJournal();
      ledger.reserveCall(currentCaseId);
      currentCallReserved = true;
      await persistJournal();
      const startedAt = Date.now();
      let judgeResult;
      try {
        judgeResult = await judge.judge({ packet: calibrationCase.packet });
      } catch (error) {
        ledger.markAmbiguousSend(currentCaseId, Date.now() - startedAt);
        ledger.markResultAvailable(currentCaseId);
        await persistJournal();
        results.push({ caseId: calibrationCase.caseId, description: calibrationCase.description, packet: safePacketSummary(calibrationCase.packet), judge: safeThrownJudgeResult(error, Date.now() - startedAt), evaluation: null, caseStatus: 'PROVIDER_OR_SCHEMA_FAILURE' });
        stoppedAfter = currentCaseId;
        break;
      }
      ledger.postTransport(currentCaseId, accountingUpdateForJudge(judgeResult));
      currentCallReserved = false;
      await persistJournal();
      let evaluation = null;
      try {
        if (judgeResult.status === 'SUCCESS' && judgeResult.recommendation) {
          ledger.setStage(currentCaseId, 'EPISTEMIC_EVALUATION');
          await persistJournal();
        }
        evaluation = judgeResult.status === 'SUCCESS' && judgeResult.recommendation
          ? evaluateWp004bLiveRecommendation(calibrationCase.packet, judgeResult.recommendation, calibrationCase.expectation)
          : null;
      } catch (error) {
        ledger.setStage(currentCaseId, 'EPISTEMIC_EVALUATION');
        await persistJournal();
        throw error;
      }
      if (evaluation) ledger.setStage(currentCaseId, 'CASE_EXPECTATION');
      else if (judgeResult.status === 'SUCCESS') ledger.setStage(currentCaseId, 'CANONICAL_SCHEMA');
      const result = {
        caseId: calibrationCase.caseId,
        description: calibrationCase.description,
        packet: safePacketSummary(calibrationCase.packet),
        judge: safeJudgeResult(judgeResult),
        evaluation: evaluation ? {
          schemaValid: evaluation.schemaValid,
          epistemic: evaluation.epistemic,
          expectation: evaluation.expectation,
          rationaleAudit: auditWp004bRationale({ caseId: calibrationCase.caseId, packet: calibrationCase.packet, recommendation: judgeResult.recommendation, evaluation }),
        } : null,
        caseStatus: caseStatus(judgeResult, evaluation),
      };
      results.push(result);
      ledger.markResultAvailable(currentCaseId);
      if (evaluation) ledger.setStage(currentCaseId, 'COMPLETED');
      await persistJournal();
      if (isSharedFailure(judgeResult)) {
        stoppedAfter = calibrationCase.caseId;
        break;
      }
    }
  } catch (error) {
    fatalFailure = error;
    if (currentCallReserved && currentCaseId) {
      try {
        ledger.markAmbiguousSend(currentCaseId);
        ledger.markResultAvailable(currentCaseId);
      } catch { }
    }
    try { await persistJournal(); } catch { }
  } finally {
    let summary;
    try {
      await persistJournal();
      summary = buildSummary({ calibrationCases, results, stoppedAfter, ledger, transport, fatalFailure });
      if (options.output) await writeWp004bAtomicJson(options.output, summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      try { await persistJournal(); } catch { }
      console.error(JSON.stringify({ schemaVersion: WP004B_LIVE_CALIBRATION_SCHEMA_VERSION, status: 'FAILED', errorCategory: safeFailure(error), budgetAccounting: ledger.snapshot() }));
      process.exitCode = 1;
      return;
    }
    const snapshot = ledger.snapshot();
    if (fatalFailure || results.length !== calibrationCases.length || results.some((item) => item.caseStatus !== 'PASS') || snapshot.budgetIntegrity !== 'PASS') process.exitCode = 1;
  }
}

await main();
