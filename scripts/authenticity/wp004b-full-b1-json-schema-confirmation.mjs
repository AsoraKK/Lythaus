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
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT,
  WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_CASE_IDS,
  WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  assertWp004bExpectationsNotInJudgeRequest,
  auditWp004bRationale,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  evaluateWp004bLiveRecommendation,
  writeWp004bAtomicJson,
  canonicalJson,
} from '../../packages/authenticity/src/wp004b.ts';

const PHASE_I_SCHEMA_VERSION = 'lythaus-wp004b-phase-i-full-b1-json-schema-v1';
const B1_CASE_ID = 'WP004B_LIVE_NEUTRAL_STRESS_01';
const ACCOUNTING_CASE_ID = 'B1';
const EXPECTED_SCHEMA_CHARACTER_LENGTH = 3758;
const MAX_REQUESTS = WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS;
const TIMEOUT_MS = WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS;

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-full-b1-json-schema-confirmation.json',
    journal: '.artifacts/wp004b-full-b1-json-schema-confirmation-call-accounting.json',
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
    'WP004B_PHASE_I_PREFLIGHT_FAILED',
    'B1_SCHEMA_FINGERPRINT_DRIFT',
    'WP004B_REQUEST_INVARIANTS_INVALID',
    'WP004B_JSON_SCHEMA_PREFLIGHT_FAILED',
  ]);
  return error instanceof Error && allowed.has(error.message) ? error.message : 'WP004B_PHASE_I_RUNNER_FAILURE';
}

function schemaFingerprint(schema) {
  return createHash('sha256').update(JSON.stringify(schema), 'utf8').digest('hex');
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
  if (calibrationCase.caseId !== B1_CASE_ID) throw new Error('WP004B_PHASE_I_PREFLIGHT_FAILED');
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
  if (schema.$id !== JUDGE_JSON_SCHEMA_VERSION
    || provenance.schemaFingerprint !== WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT) {
    throw new Error('B1_SCHEMA_FINGERPRINT_DRIFT');
  }
  if (provenance.schemaCharacterLength !== EXPECTED_SCHEMA_CHARACTER_LENGTH) {
    throw new Error('WP004B_JSON_SCHEMA_PREFLIGHT_FAILED');
  }
  const referenceIds = schema.properties.supportingEvidence.items?.properties?.evidenceId?.enum ?? [];
  const packetIds = [...packetReferenceIds(calibrationCase.packet)]
    .filter((evidenceId) => evidenceId !== calibrationCase.packet.safetyContext.contextId)
    .sort();
  const schemaText = JSON.stringify(schema);
  if (JSON.stringify(referenceIds) !== JSON.stringify(packetIds)
    || referenceIds.includes(calibrationCase.packet.safetyContext.contextId)
    || ['groundTruth', 'expectedHypothesis', 'caseExpectation'].some((token) => schemaText.includes(token))
    || ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL', 'UNVALIDATED'].some((token) => schemaText.includes(`\"${token}\"`))) {
    throw new Error('WP004B_JSON_SCHEMA_PREFLIGHT_FAILED');
  }
  return { request, objectRequest, schema, provenance };
}

function accountingUpdateForJudge(result) {
  const transportCompleted = result.responseDiagnostics?.transportSucceeded === true
    || result.httpStatus !== null && result.httpStatus !== undefined;
  const transportFailure = result.transportErrorCategory;
  return {
    transportCompleted,
    canonicalSuccess: result.status === 'SUCCESS',
    executionMs: result.executionMs,
    httpStatus: result.httpStatus ?? null,
    providerEnvelopeClassification: result.responseDiagnostics?.providerEnvelopeClassification ?? null,
    normalizationFailureCode: result.normalizationFailureCode ?? null,
    ambiguousSend: !transportCompleted && ['TIMEOUT', 'NETWORK_FAILURE'].includes(transportFailure),
    failureStage: result.status === 'SUCCESS'
      ? 'PROVIDER_ENVELOPE'
      : result.normalizationFailureCode ? 'CANONICAL_SCHEMA' : 'TRANSPORT',
  };
}

function caseStatus(judgeResult, evaluation) {
  if (judgeResult.status !== 'SUCCESS') return 'PROVIDER_OR_SCHEMA_FAILURE';
  if (!evaluation?.epistemic.valid) return 'EPISTEMIC_VIOLATION';
  if (!evaluation.expectation.valid) return 'CASE_EXPECTATION_MISMATCH';
  return 'PASS';
}

function capabilityConclusion(b1, fatalFailure) {
  if (fatalFailure === 'B1_SCHEMA_FINGERPRINT_DRIFT') return fatalFailure;
  if (!b1) return 'B1_FULL_JSON_SCHEMA_CANONICAL_FAILURE';
  if (b1.judge.normalizationFailureCode === 'FINISH_REASON_TRUNCATED') return 'B1_FULL_JSON_SCHEMA_OUTPUT_TRUNCATED';
  if (b1.judge.status !== 'SUCCESS') {
    if (b1.judge.errorCategory === 'TIMEOUT' || b1.judge.transportErrorCategory === 'TIMEOUT') return 'B1_FULL_JSON_SCHEMA_TIMEOUT';
    return 'B1_FULL_JSON_SCHEMA_PROVIDER_REJECTED';
  }
  if (b1.judge.normalizationFailureCode) return 'B1_FULL_JSON_SCHEMA_CANONICAL_FAILURE';
  if (b1.evaluation?.epistemic?.valid !== true || b1.evaluation?.expectation?.valid !== true) return 'B1_FULL_JSON_SCHEMA_EPISTEMIC_FAILURE';
  return b1.judge.executionMs > 30_000 ? 'B1_FULL_JSON_SCHEMA_CONFIRMED_SLOW' : 'B1_FULL_JSON_SCHEMA_CONFIRMED';
}

function buildB1Result({ calibrationCase, preflight, judgeResult, evaluation, evaluationFailure }) {
  const conclusion = capabilityConclusion({ judge: judgeResult, evaluation }, null);
  return {
    caseId: calibrationCase.caseId,
    accountingCaseId: ACCOUNTING_CASE_ID,
    description: calibrationCase.description,
    packet: safePacketSummary(calibrationCase.packet),
    schemaProvenance: preflight.provenance,
    timeoutMs: TIMEOUT_MS,
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
    capabilityConclusion: conclusion,
  };
}

function buildSummary({ calibrationCase, preflight, b1, ledger, transport, fatalFailure }) {
  const budgetAccounting = ledger.snapshot();
  const transportSnapshot = transport?.snapshot?.() ?? { calls: 0, successes: 0, providerFailures: 0, invocations: [] };
  const conclusion = capabilityConclusion(b1, fatalFailure ? safeFailure(fatalFailure) : null);
  const casePass = b1?.caseStatus === 'PASS';
  const finalClassification = fatalFailure || !b1
    ? 'WP004B_PHASE_I_CONTRACT_BLOCKED'
    : b1.judge.status !== 'SUCCESS'
      ? 'WP004B_PHASE_I_PROVIDER_BLOCKED'
      : casePass
        ? 'WP004B_PHASE_I_READY'
        : 'WP004B_PHASE_I_READY_WITH_CONCERNS';
  return {
    schemaVersion: PHASE_I_SCHEMA_VERSION,
    phase: 'WP004B_PHASE_I_FULL_B1_JSON_SCHEMA_CONFIRMATION',
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    promptVersion: JUDGE_PROMPT_VERSION,
    structuredOutputMode: 'JSON_SCHEMA',
    jsonSchemaVersion: JUDGE_JSON_SCHEMA_VERSION,
    epistemicPolicyVersion: JUDGE_EPISTEMIC_POLICY_VERSION,
    evaluatorSchemaVersion: JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
    packetSchemaVersion: calibrationCase?.packet.schemaVersion ?? null,
    timeoutMs: TIMEOUT_MS,
    generationConfig: { temperature: 0, max_tokens: JUDGE_MAX_OUTPUT_TOKENS, stream: false },
    caseOrder: [ACCOUNTING_CASE_ID],
    casesExecuted: b1 ? [calibrationCase.caseId] : [],
    b1,
    capabilityConclusion: conclusion,
    invocationAccounting: {
      authorizedMaxJudgeAttempts: MAX_REQUESTS,
      judgeCallsAttempted: budgetAccounting.observed.judgeCallsAttempted,
      judgeCallsCompleted: transportSnapshot.successes + transportSnapshot.providerFailures,
      retries: budgetAccounting.observed.retries,
      b1Attempts: budgetAccounting.attempts.filter((item) => item.caseId === ACCOUNTING_CASE_ID).length,
      openAiCalls: 0,
      moondreamCalls: 0,
      otherInferenceCalls: 0,
      transportInvocations: transportSnapshot.invocations,
      budgetIntegrity: budgetAccounting.budgetIntegrity,
      scientificValidity: budgetAccounting.scientificValidity,
    },
    budgetAccounting,
    fatalFailure: fatalFailure ? safeFailure(fatalFailure) : null,
    enforcementAuthority: false,
    finalClassification,
  };
}

async function main() {
  const calibrationCase = createWp004bLiveCalibrationCases()[0];
  const ledger = createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS,
  });
  let options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-full-b1-json-schema-confirmation.json',
    journal: '.artifacts/wp004b-full-b1-json-schema-confirmation-call-accounting.json',
  };
  let preflight = null;
  let transport = null;
  let b1 = null;
  let fatalFailure = null;
  let activeCallReserved = false;
  const persistJournal = async () => writeWp004bAtomicJson(options.journal, ledger.snapshot());

  try {
    options = parseArgs(process.argv.slice(2));
    await persistJournal();
    preflight = validatePreflight(calibrationCase);
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED');
    transport = createCloudflareRestTransport({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      allowNetwork: options.allowNetwork,
      maxRequests: MAX_REQUESTS,
      timeoutMs: TIMEOUT_MS,
    });
    ledger.preCallValidation(ACCOUNTING_CASE_ID);
    await persistJournal();
    ledger.reserveCall(ACCOUNTING_CASE_ID);
    activeCallReserved = true;
    await persistJournal();
    const judge = createCloudflareJudgeRest({
      transport,
      model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
      structuredOutputMode: 'JSON_SCHEMA',
    });
    let judgeResult;
    try {
      judgeResult = await judge.judge({ packet: calibrationCase.packet });
    } catch (error) {
      ledger.markAmbiguousSend(ACCOUNTING_CASE_ID);
      ledger.markResultAvailable(ACCOUNTING_CASE_ID);
      activeCallReserved = false;
      await persistJournal();
      throw error;
    }
    ledger.postTransport(ACCOUNTING_CASE_ID, accountingUpdateForJudge(judgeResult));
    activeCallReserved = false;
    await persistJournal();
    let evaluation = null;
    let evaluationFailure = null;
    if (judgeResult.status === 'SUCCESS' && judgeResult.recommendation) {
      ledger.setStage(ACCOUNTING_CASE_ID, 'EPISTEMIC_EVALUATION');
      await persistJournal();
      try {
        evaluation = evaluateWp004bLiveRecommendation(calibrationCase.packet, judgeResult.recommendation, calibrationCase.expectation);
      } catch {
        evaluationFailure = 'WP004B_EPISTEMIC_EVALUATION_FAILURE';
      }
      if (evaluation) ledger.setStage(ACCOUNTING_CASE_ID, 'CASE_EXPECTATION');
    }
    if (judgeResult.status === 'SUCCESS' && !judgeResult.recommendation) ledger.setStage(ACCOUNTING_CASE_ID, 'CANONICAL_SCHEMA');
    b1 = buildB1Result({ calibrationCase, preflight, judgeResult, evaluation, evaluationFailure });
    ledger.markResultAvailable(ACCOUNTING_CASE_ID);
    ledger.setStage(ACCOUNTING_CASE_ID, 'COMPLETED');
    await persistJournal();
  } catch (error) {
    fatalFailure = error;
    if (activeCallReserved) {
      try {
        ledger.markAmbiguousSend(ACCOUNTING_CASE_ID);
        ledger.markResultAvailable(ACCOUNTING_CASE_ID);
      } catch { }
    }
    try { await persistJournal(); } catch { }
  } finally {
    let summary;
    try {
      await persistJournal();
      summary = buildSummary({ calibrationCase, preflight, b1, ledger, transport, fatalFailure });
      await writeWp004bAtomicJson(options.output, summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      try { await persistJournal(); } catch { }
      console.error(JSON.stringify({
        schemaVersion: PHASE_I_SCHEMA_VERSION,
        status: 'FAILED',
        errorCategory: safeFailure(error),
        budgetAccounting: ledger.snapshot(),
      }));
      process.exitCode = 1;
      return;
    }
    const snapshot = ledger.snapshot();
    if (fatalFailure || snapshot.budgetIntegrity !== 'PASS' || b1?.caseStatus !== 'PASS') process.exitCode = 1;
  }
}

await main();
