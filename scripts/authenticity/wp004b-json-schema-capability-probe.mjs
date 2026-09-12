import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import {
  buildJudgeRequest,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
  JUDGE_JSON_SCHEMA_VERSION,
  JUDGE_PROMPT_VERSION,
} from '../../packages/authenticity/src/wp004a.ts';
import {
  WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS,
  WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_CAPABILITY_SCHEMA_VERSION,
  WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT,
  WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  WP004B_MINIMAL_JSON_SCHEMA,
  WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT,
  WP004B_JSON_SCHEMA_PROBE_USER_PROMPT,
  buildWp004bJsonSchemaCapabilityRequest,
  canonicalJson,
  normalizeWp004bJsonSchemaProbeResult,
  shouldExecuteWp004bFullProbe,
} from '../../packages/authenticity/src/wp004b.ts';
import {
  JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
  JUDGE_EPISTEMIC_POLICY_VERSION,
  WP004B_LIVE_CALIBRATION_SCHEMA_VERSION,
  assertWp004bExpectationsNotInJudgeRequest,
  auditWp004bRationale,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  evaluateWp004bLiveRecommendation,
  writeWp004bAtomicJson,
} from '../../packages/authenticity/src/wp004b.ts';

const G1_MAX_TOKENS = 64;
const G2_TIMEOUT_CLASSIFICATION = Object.freeze({
  underThirtySeconds: 'JSON_SCHEMA_FULL_CONFIRMED_TRANSIENT_PHASE_F_TIMEOUT',
  overThirtySeconds: 'JSON_SCHEMA_FULL_CONFIRMED_SLOW',
  timeout: 'FULL_SCHEMA_TIMEOUT',
});

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-json-schema-capability.json',
    journal: '.artifacts/wp004b-json-schema-capability-call-accounting.json',
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
    'WP004B_JSON_SCHEMA_PROBE_PREFLIGHT_FAILED',
    'WP004B_JSON_SCHEMA_FINGERPRINT_MISMATCH',
    'WP004B_JSON_SCHEMA_REQUEST_INVARIANTS_INVALID',
    'WP004B_JSON_SCHEMA_CAPABILITY_FAILURE',
  ]);
  return error instanceof Error && allowed.has(error.message) ? error.message : 'WP004B_JSON_SCHEMA_CAPABILITY_FAILURE';
}

function schemaFingerprint(schema) {
  return createHash('sha256').update(JSON.stringify(schema), 'utf8').digest('hex');
}

function canonicalSchemaFingerprint(schema) {
  return createHash('sha256').update(canonicalJson(schema), 'utf8').digest('hex');
}

function safeProbeDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  const safe = {
    providerResultType: diagnostics.providerResultType,
    providerEnvelope: diagnostics.providerEnvelope,
    providerTopLevelKeys: diagnostics.providerTopLevelKeys,
    responsePresent: diagnostics.responsePresent,
    responseType: diagnostics.responseType,
    responseTopLevelKeys: diagnostics.responseTopLevelKeys,
    resultPresent: diagnostics.resultPresent,
    resultType: diagnostics.resultType,
    outputTextPresent: diagnostics.outputTextPresent,
    outputTextType: diagnostics.outputTextType,
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
    messageContentJsonParseable: diagnostics.messageContentJsonParseable,
    finishReasonPresent: diagnostics.finishReasonPresent,
    finishReasonType: diagnostics.finishReasonType,
    finishReasonValueCode: diagnostics.finishReasonValueCode,
    toolCallsPresent: diagnostics.toolCallsPresent,
    toolCallCount: diagnostics.toolCallCount,
    messageReasoningFieldPresent: diagnostics.messageReasoningFieldPresent,
    messageReasoningFieldType: diagnostics.messageReasoningFieldType,
    topLevelReasoningFieldPresent: diagnostics.topLevelReasoningFieldPresent,
    topLevelReasoningFieldType: diagnostics.topLevelReasoningFieldType,
    stringJsonParseable: diagnostics.stringJsonParseable,
    normalizationFailureCode: diagnostics.normalizationFailureCode,
  };
  return safe;
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
    responseDiagnostics: result.responseDiagnostics ? {
      providerEnvelopeClassification: result.responseDiagnostics.providerEnvelopeClassification,
      providerResultType: result.responseDiagnostics.providerResultType,
      providerTopLevelKeys: result.responseDiagnostics.providerTopLevelKeys,
      responsePresent: result.responseDiagnostics.responsePresent,
      responseType: result.responseDiagnostics.responseType,
      responseTopLevelKeys: result.responseDiagnostics.responseTopLevelKeys,
      choicesPresent: result.responseDiagnostics.choicesPresent,
      choiceCount: result.responseDiagnostics.choiceCount,
      firstChoiceType: result.responseDiagnostics.firstChoiceType,
      firstChoiceKeys: result.responseDiagnostics.firstChoiceKeys,
      messagePresent: result.responseDiagnostics.messagePresent,
      messageType: result.responseDiagnostics.messageType,
      messageKeys: result.responseDiagnostics.messageKeys,
      messageContentPresent: result.responseDiagnostics.messageContentPresent,
      messageContentType: result.responseDiagnostics.messageContentType,
      messageContentLength: result.responseDiagnostics.messageContentLength,
      finishReasonValueCode: result.responseDiagnostics.finishReasonValueCode,
      messageToolCallsPresent: result.responseDiagnostics.messageToolCallsPresent,
      messageToolCallCount: result.responseDiagnostics.messageToolCallCount,
      normalizationFailureCode: result.responseDiagnostics.normalizationFailureCode,
    } : null,
    recommendation: safeRecommendation(result.recommendation),
  };
}

function safeTransportFailure(error, executionMs) {
  return {
    status: 'PROVIDER_FAILURE',
    executionMs,
    httpStatus: error?.httpStatus ?? null,
    transportErrorCategory: error?.category ?? 'NETWORK_FAILURE',
    providerErrorCode: error?.providerErrorCode ?? null,
    providerErrorMessageCode: error?.providerErrorMessageCode ?? null,
  };
}

function safePacketSummary(packet) {
  return {
    schemaVersion: packet.schemaVersion,
    caseId: packet.caseId,
    packetId: packet.packetId,
    runId: packet.runId,
    sampleId: packet.sampleId,
    sourceFamilyId: packet.sourceFamilyId,
    inputHash: packet.inputHash,
    mime: packet.mime,
    quality: packet.quality,
    evidenceFamilyStatuses: Object.fromEntries(Object.entries(packet.evidenceFamilies).map(([family, summary]) => [family, {
      status: summary.status,
      evidenceIds: summary.evidenceIds,
    }])),
    evidenceIds: packet.evidence.map((item) => item.evidenceId),
    observationIds: packet.observations.map((item) => item.observationId),
    safetyContext: {
      role: packet.safetyContext.role,
      contextId: packet.safetyContext.contextId,
      canonicalResult: packet.safetyContext.canonicalResult,
      quality: packet.safetyContext.quality,
    },
    enforcementAuthority: packet.enforcementAuthority,
  };
}

function schemaProvenance(schema, version) {
  return {
    schemaVersion: version,
    schemaFingerprint: schemaFingerprint(schema),
    canonicalSchemaFingerprint: canonicalSchemaFingerprint(schema),
    schemaCharacterLength: JSON.stringify(schema).length,
  };
}

function validateMinimalPreflight() {
  let validator;
  try {
    validator = new Ajv({ strict: true }).compile(WP004B_MINIMAL_JSON_SCHEMA);
  } catch {
    throw new Error('WP004B_JSON_SCHEMA_PROBE_PREFLIGHT_FAILED');
  }
  if (!validator({ success: true }) || validator({ success: false }) || validator({ success: true, extra: true })) {
    throw new Error('WP004B_JSON_SCHEMA_PROBE_PREFLIGHT_FAILED');
  }
  const request = buildWp004bJsonSchemaCapabilityRequest();
  const serialized = JSON.stringify(request);
  if (request.response_format.type !== 'json_schema'
    || request.response_format.json_schema !== WP004B_MINIMAL_JSON_SCHEMA
    || request.temperature !== 0
    || request.max_tokens !== G1_MAX_TOKENS
    || request.stream !== false
    || request.messages[0].content !== WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT
    || request.messages[1].content !== WP004B_JSON_SCHEMA_PROBE_USER_PROMPT
    || serialized.includes('JUDGE_SYSTEM_PROMPT')
    || serialized.includes('lythaus-gpt-oss-judge-prompt-v3')
    || serialized.includes('EvidencePacket')
    || serialized.includes('groundTruth')
    || serialized.includes('expectedHypothesis')) {
    throw new Error('WP004B_JSON_SCHEMA_PROBE_PREFLIGHT_FAILED');
  }
  return { request, schema: WP004B_MINIMAL_JSON_SCHEMA, provenance: schemaProvenance(WP004B_MINIMAL_JSON_SCHEMA, WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION) };
}

function validateFullPreflight(calibrationCase) {
  const objectRequest = buildJudgeRequest(calibrationCase.packet);
  const request = buildJudgeRequest(calibrationCase.packet, { structuredOutputMode: 'JSON_SCHEMA' });
  assertWp004bExpectationsNotInJudgeRequest(request, calibrationCase.expectation);
  if (JSON.stringify(request.messages) !== JSON.stringify(objectRequest.messages)
    || request.temperature !== objectRequest.temperature
    || request.max_tokens !== objectRequest.max_tokens
    || request.response_format.type !== 'json_schema') {
    throw new Error('WP004B_JSON_SCHEMA_REQUEST_INVARIANTS_INVALID');
  }
  const schema = request.response_format.json_schema;
  try {
    new Ajv({ strict: true }).compile(schema);
  } catch {
    throw new Error('WP004B_JSON_SCHEMA_PROBE_PREFLIGHT_FAILED');
  }
  const provenance = schemaProvenance(schema, JUDGE_JSON_SCHEMA_VERSION);
  if (provenance.schemaFingerprint !== WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT) throw new Error('WP004B_JSON_SCHEMA_FINGERPRINT_MISMATCH');
  return { request, schema, provenance };
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

function caseStatus(result, evaluation) {
  if (result.status !== 'SUCCESS') return 'PROVIDER_OR_SCHEMA_FAILURE';
  if (!evaluation?.epistemic.valid) return 'EPISTEMIC_VIOLATION';
  if (!evaluation.expectation.valid) return 'CASE_EXPECTATION_MISMATCH';
  return 'PASS';
}

function g2Classification(result) {
  if (result.status === 'SUCCESS') {
    return result.executionMs > 30_000 ? G2_TIMEOUT_CLASSIFICATION.overThirtySeconds : G2_TIMEOUT_CLASSIFICATION.underThirtySeconds;
  }
  if (result.errorCategory === 'TIMEOUT' || result.transportErrorCategory === 'TIMEOUT') return G2_TIMEOUT_CLASSIFICATION.timeout;
  if (result.transportErrorCategory && ['HTTP_FAILURE', 'PROVIDER_FAILURE', 'MALFORMED_RESPONSE'].includes(result.transportErrorCategory)) return 'FULL_SCHEMA_PROVIDER_REJECTED';
  if (result.normalizationFailureCode) return 'FULL_SCHEMA_CANONICAL_FAILURE';
  return 'FULL_SCHEMA_PROVIDER_FAILURE';
}

function buildG1Result({ provenance, transportResult, normalization, transportFailure, executionMs }) {
  const transportCompleted = Boolean(transportResult) || transportFailure?.httpStatus !== null && transportFailure?.httpStatus !== undefined;
  return {
    caseId: 'G1',
    description: 'Minimal JSON Schema capability probe without Judge prompt or Evidence Packet.',
    schemaVersion: WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
    schemaProvenance: provenance,
    timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
    provider: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    attempted: true,
    transportCompleted,
    httpStatus: transportResult?.httpStatus ?? transportFailure?.httpStatus ?? null,
    executionMs,
    providerEnvelope: normalization?.diagnostics.providerEnvelope ?? null,
    diagnostics: safeProbeDiagnostics(normalization?.diagnostics),
    minimalStructuredOutputValid: Boolean(normalization),
    structuredOutput: normalization?.result ?? null,
    failureCategory: transportFailure?.category === 'TIMEOUT'
      ? 'MINIMAL_JSON_SCHEMA_TIMEOUT'
      : transportFailure?.category ?? normalization?.diagnostics.normalizationFailureCode ?? null,
  };
}

function buildG2Result({ calibrationCase, provenance, judgeResult, evaluation }) {
  return {
    caseId: 'G2',
    description: 'Full B1 Judge JSON Schema probe using the exact packet-aware Phase F schema.',
    packet: safePacketSummary(calibrationCase.packet),
    schemaProvenance: provenance,
    timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
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
    caseStatus: caseStatus(judgeResult, evaluation),
    classification: g2Classification(judgeResult),
  };
}

function buildSummary({ options, g1, g2, ledger, transport, fatalFailure }) {
  const budgetAccounting = ledger.snapshot();
  const transportSnapshot = transport?.snapshot?.() ?? { calls: 0, successes: 0, providerFailures: 0, invocations: [] };
  const g1Succeeded = g1?.minimalStructuredOutputValid === true;
  const g2Succeeded = g2?.caseStatus === 'PASS';
  let capabilityConclusion = 'JSON_SCHEMA_MINIMAL_NOT_CONFIRMED';
  if (g1Succeeded && !g2) capabilityConclusion = 'JSON_SCHEMA_MINIMAL_CONFIRMED';
  if (g1Succeeded && g2 && g2.classification === G2_TIMEOUT_CLASSIFICATION.overThirtySeconds) capabilityConclusion = 'JSON_SCHEMA_FULL_CONFIRMED_SLOW';
  if (g1Succeeded && g2 && g2.classification === G2_TIMEOUT_CLASSIFICATION.underThirtySeconds) capabilityConclusion = 'JSON_SCHEMA_FULL_CONFIRMED';
  if (g1Succeeded && g2 && g2.classification === G2_TIMEOUT_CLASSIFICATION.timeout) capabilityConclusion = 'JSON_SCHEMA_FULL_NOT_PRACTICAL';
  if (g1Succeeded && g2 && g2.classification === 'FULL_SCHEMA_PROVIDER_REJECTED') capabilityConclusion = 'JSON_SCHEMA_FULL_PROVIDER_REJECTED';
  if (g1Succeeded && g2 && g2.classification === 'FULL_SCHEMA_CANONICAL_FAILURE') capabilityConclusion = 'JSON_SCHEMA_FULL_NOT_PRACTICAL';
  if (g1Succeeded && g2 && g2.classification === 'FULL_SCHEMA_PROVIDER_FAILURE') capabilityConclusion = 'JSON_SCHEMA_FULL_NOT_PRACTICAL';
  const executionResults = [g1, g2].filter(Boolean);
  const capabilityValidity = budgetAccounting.budgetIntegrity === 'PASS'
    && executionResults.length >= 1
    && executionResults.every((item) => item && typeof item.caseId === 'string');
  const providerFailure = !g1Succeeded || Boolean(g2 && g2.judge.status === 'PROVIDER_FAILURE');
  const finalClassification = providerFailure
    ? 'WP004B_PHASE_G_PROVIDER_BLOCKED'
    : g2?.caseStatus === 'PASS' && g2.classification !== G2_TIMEOUT_CLASSIFICATION.overThirtySeconds
      ? 'WP004B_PHASE_G_READY'
      : 'WP004B_PHASE_G_READY_WITH_CONCERNS';
  return {
    schemaVersion: WP004B_JSON_SCHEMA_CAPABILITY_SCHEMA_VERSION,
    phase: 'WP004B_PHASE_G_JSON_SCHEMA_CAPABILITY_ISOLATION',
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    promptVersion: JUDGE_PROMPT_VERSION,
    structuredOutputMode: 'JSON_SCHEMA',
    timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
    generationConfig: { temperature: 0, stream: false, g1MaxTokens: G1_MAX_TOKENS, g2MaxTokens: 2400 },
    casesExecuted: executionResults.map((item) => item.caseId),
    g1,
    g2,
    capabilityValidity: capabilityValidity ? 'VALID_FOR_CAPABILITY_ASSESSMENT' : 'INVALID_FOR_CAPABILITY_ASSESSMENT',
    capabilityConclusion,
    finalClassification,
    invocationAccounting: {
      authorizedMaxJudgeAttempts: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
      judgeCallsAttempted: budgetAccounting.observed.judgeCallsAttempted,
      judgeCallsCompleted: transportSnapshot.successes + transportSnapshot.providerFailures,
      retries: budgetAccounting.observed.retries,
      g1Attempts: budgetAccounting.attempts.filter((item) => item.caseId === 'G1').length,
      g2Attempts: budgetAccounting.attempts.filter((item) => item.caseId === 'G2').length,
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
  };
}

async function main() {
  const ledger = createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
  });
  let options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-json-schema-capability.json',
    journal: '.artifacts/wp004b-json-schema-capability-call-accounting.json',
  };
  let transport = null;
  let g1 = null;
  let g2 = null;
  let fatalFailure = null;
  let activeCaseId = null;
  let activeCallReserved = false;
  const persistJournal = async () => writeWp004bAtomicJson(options.journal, ledger.snapshot());

  try {
    options = parseArgs(process.argv.slice(2));
    await persistJournal();
    const minimalPreflight = validateMinimalPreflight();
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED');
    transport = createCloudflareRestTransport({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      allowNetwork: options.allowNetwork,
      maxRequests: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
      timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
    });

    activeCaseId = 'G1';
    ledger.preCallValidation(activeCaseId);
    await persistJournal();
    ledger.reserveCall(activeCaseId);
    activeCallReserved = true;
    await persistJournal();
    const g1StartedAt = Date.now();
    let g1TransportResult = null;
    let g1Normalization = null;
    let g1TransportFailure = null;
    try {
      g1TransportResult = await transport.run({ kind: 'JUDGE', model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL, payload: minimalPreflight.request });
      try {
        g1Normalization = normalizeWp004bJsonSchemaProbeResult(g1TransportResult.result);
        ledger.postTransport(activeCaseId, {
          transportCompleted: true,
          canonicalSuccess: true,
          executionMs: g1TransportResult.executionMs,
          httpStatus: g1TransportResult.httpStatus,
          providerEnvelopeClassification: g1Normalization.diagnostics.providerEnvelope === 'DIRECT_OBJECT' ? 'DIRECT_CANONICAL' : g1Normalization.diagnostics.providerEnvelope,
          failureStage: 'PROVIDER_ENVELOPE',
        });
      } catch (error) {
        g1Normalization = error;
        ledger.postTransport(activeCaseId, {
          transportCompleted: true,
          canonicalSuccess: false,
          executionMs: g1TransportResult.executionMs,
          httpStatus: g1TransportResult.httpStatus,
          providerEnvelopeClassification: error.diagnostics?.providerEnvelope === 'DIRECT_OBJECT' ? 'DIRECT_CANONICAL' : error.diagnostics?.providerEnvelope ?? 'UNKNOWN',
          normalizationFailureCode: error.code ?? 'UNKNOWN_RESPONSE_SHAPE',
          failureStage: 'CANONICAL_SCHEMA',
        });
      }
    } catch (error) {
      g1TransportFailure = error;
      ledger.postTransport(activeCaseId, {
        transportCompleted: error.httpStatus !== null && error.httpStatus !== undefined,
        canonicalSuccess: false,
        executionMs: Date.now() - g1StartedAt,
        httpStatus: error.httpStatus ?? null,
        normalizationFailureCode: null,
        ambiguousSend: ['TIMEOUT', 'NETWORK_FAILURE'].includes(error.category),
        failureStage: 'TRANSPORT',
      });
    }
    ledger.markResultAvailable(activeCaseId);
    ledger.setStage(activeCaseId, 'COMPLETED');
    activeCallReserved = false;
    await persistJournal();
    const g1Diagnostics = g1Normalization?.diagnostics ?? null;
    g1 = buildG1Result({
      provenance: minimalPreflight.provenance,
      transportResult: g1TransportResult,
      normalization: g1Normalization?.result ? g1Normalization : null,
      transportFailure: g1TransportFailure,
      executionMs: g1TransportResult?.executionMs ?? Date.now() - g1StartedAt,
    });
    if (!shouldExecuteWp004bFullProbe(Boolean(g1.minimalStructuredOutputValid))) {
      g1.failureCategory = g1TransportFailure?.category ?? g1Diagnostics?.normalizationFailureCode ?? 'MINIMAL_JSON_SCHEMA_NOT_CONFIRMED';
    } else {
      const calibrationCase = createWp004bLiveCalibrationCases()[0];
      const fullPreflight = validateFullPreflight(calibrationCase);
      activeCaseId = 'G2';
      ledger.preCallValidation(activeCaseId);
      await persistJournal();
      ledger.reserveCall(activeCaseId);
      activeCallReserved = true;
      await persistJournal();
      const judge = createCloudflareJudgeRest({ transport, model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL, structuredOutputMode: 'JSON_SCHEMA' });
      const judgeResult = await judge.judge({ packet: calibrationCase.packet });
      ledger.postTransport(activeCaseId, accountingUpdateForJudge(judgeResult));
      activeCallReserved = false;
      await persistJournal();
      let evaluation = null;
      if (judgeResult.status === 'SUCCESS' && judgeResult.recommendation) {
        ledger.setStage(activeCaseId, 'EPISTEMIC_EVALUATION');
        await persistJournal();
        evaluation = evaluateWp004bLiveRecommendation(calibrationCase.packet, judgeResult.recommendation, calibrationCase.expectation);
        ledger.setStage(activeCaseId, 'CASE_EXPECTATION');
      } else if (judgeResult.status === 'SUCCESS') {
        ledger.setStage(activeCaseId, 'CANONICAL_SCHEMA');
      }
      ledger.markResultAvailable(activeCaseId);
      ledger.setStage(activeCaseId, 'COMPLETED');
      await persistJournal();
      g2 = buildG2Result({ calibrationCase, provenance: fullPreflight.provenance, judgeResult, evaluation });
    }
  } catch (error) {
    fatalFailure = error;
    if (activeCallReserved && activeCaseId) {
      try {
        ledger.markAmbiguousSend(activeCaseId);
        ledger.markResultAvailable(activeCaseId);
      } catch { }
    }
    try { await persistJournal(); } catch { }
  } finally {
    let summary;
    try {
      await persistJournal();
      summary = buildSummary({ options, g1, g2, ledger, transport, fatalFailure });
      await writeWp004bAtomicJson(options.output, summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      try { await persistJournal(); } catch { }
      console.error(JSON.stringify({ schemaVersion: WP004B_JSON_SCHEMA_CAPABILITY_SCHEMA_VERSION, status: 'FAILED', errorCategory: safeFailure(error) }));
      process.exitCode = 1;
      return;
    }
    const snapshot = ledger.snapshot();
    if (fatalFailure || snapshot.budgetIntegrity !== 'PASS' || !g1?.minimalStructuredOutputValid || (g2 && g2.caseStatus !== 'PASS')) process.exitCode = 1;
  }
}

await main();
