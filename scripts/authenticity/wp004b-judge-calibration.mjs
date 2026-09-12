import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildJudgeRequest,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
} from '../../packages/authenticity/src/wp004a.ts';
import {
  JUDGE_EPISTEMIC_POLICY_VERSION,
  JUDGE_EPISTEMIC_EVALUATOR_SCHEMA_VERSION,
  createWp004bLiveCalibrationCases,
  assertWp004bExpectationsNotInJudgeRequest,
  evaluateWp004bLiveRecommendation,
} from '../../packages/authenticity/src/wp004b.ts';

const GPT_OSS_MODEL = '@cf/openai/gpt-oss-20b';
const MAX_REQUESTS = 3;

function parseArgs(argv) {
  const options = { allowNetwork: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-network') options.allowNetwork = true;
    else if (argument === '--output') options.output = argv[++index] ?? null;
    else throw new Error('WP004B_ARGUMENT_INVALID');
  }
  if (!options.allowNetwork) throw new Error('WP004B_NETWORK_OPT_IN_REQUIRED');
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED');
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

function normalizedText(recommendation) {
  return [
    recommendation.rationale,
    ...recommendation.alternativeHypotheses.map((item) => item.rationale),
    ...recommendation.supportingEvidence.map((item) => item.rationale),
    ...recommendation.contradictoryEvidence.map((item) => item.rationale),
    ...recommendation.missingEvidence.map((item) => item.request),
  ].join(' ').toLowerCase();
}

function classifyRationaleMention(text, subjectPattern, violationPattern, disciplinedPattern) {
  if (!subjectPattern.test(text)) return 'NOT_MENTIONED';
  if (violationPattern.test(text)) return 'VIOLATION';
  if (disciplinedPattern.test(text)) return 'DISCIPLINED';
  return 'CONCERNING';
}

function rationaleAudit(caseId, recommendation) {
  const text = normalizedText(recommendation);
  if (caseId === 'WP004B_LIVE_NEUTRAL_STRESS_01') {
    return {
      uniformity: classifyRationaleMention(text, /uniform|flat|simple/, /(uniform|flat|simple).{0,100}(support|prove|indicat|suggest).{0,80}(synthetic|camera)/, /neutral|nondiscrimin|not.{0,30}(establish|prove|support)|descriptive|insufficient/),
      metadata: classifyRationaleMention(text, /metadata|exif|xmp/, /(missing|absent).{0,80}(support|prove|indicat|suggest).{0,80}(synthetic|camera)/, /neutral|not.{0,30}(establish|prove|support)|missing evidence|limited/),
      png: classifyRationaleMention(text, /png|file format/, /(png|format).{0,80}(support|prove|indicat|suggest).{0,80}(synthetic|camera)|format.{0,40}proof/, /format.{0,40}(alone|neutral|not)|not.{0,30}(establish|prove|support)/),
      ef2: classifyRationaleMention(text, /ef2|camera.{0,20}(proxy|evidence)|sensor noise|camera pipeline/, /(prove|support|therefore|more likely).{0,100}(camera-native|synthetic)/, /uncalibrated|proxy|not.{0,30}(proof|support)|neutral|experimental/),
      ef4: classifyRationaleMention(text, /ef4|spectral|variance|residual/, /(prove|support|therefore|more likely).{0,100}(camera-native|synthetic)/, /uncalibrated|not.{0,30}(proof|support)|neutral|experimental/),
      ef3Unavailable: classifyRationaleMention(text, /ef3|generative/, /(unavailable|missing).{0,80}(no|none|not).{0,80}(generative|artifact)/, /unavailable|missing|not.{0,30}(run|available)|no conclusion/),
      ef5Unavailable: classifyRationaleMention(text, /ef5|local manipulation|reconstruction/, /(unavailable|missing).{0,80}(no|none|not).{0,80}(manipulation|edit)/, /unavailable|missing|not.{0,30}(run|available)|no conclusion/),
    };
  }
  if (caseId === 'WP004B_LIVE_SAFETY_BLOCK_01') {
    return {
      safetyInfluence: classifyRationaleMention(text, /safety|moderation|block|violence/, /(safety|moderation|block|violence).{0,160}(support|contradict|prove|therefore|more likely).{0,100}(synthetic|camera|origin|manipulat)/, /safety.{0,80}(context only|separate|excluded)|not.{0,40}(authenticity|origin)|must not/),
    };
  }
  return {
    calibratedEf5: classifyRationaleMention(text, /calibrated|ef5|local edit|localized alteration|reconstruction/, /(ef5|calibrated|local edit).{0,120}(support|indicat|establish).{0,80}(local|manipulat)/, /calibrated|directional|localized alteration|supports/),
    neutralEvidenceUse: classifyRationaleMention(text, /png|file format|metadata|exif/, /(png|format|metadata|exif).{0,100}(support|prove|therefore).{0,80}(origin|synthetic|camera)/, /neutral|not.{0,30}(proof|support|establish)/),
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
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return 'WP004B_RUNNER_FAILURE';
}

const options = parseArgs(process.argv.slice(2));
const calibrationCases = createWp004bLiveCalibrationCases();
const transport = createCloudflareRestTransport({
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  allowNetwork: options.allowNetwork,
  maxRequests: MAX_REQUESTS,
});
const judge = createCloudflareJudgeRest({ transport, model: GPT_OSS_MODEL });
const results = [];
let stoppedAfter = null;

try {
  for (const calibrationCase of calibrationCases) {
    const request = buildJudgeRequest(calibrationCase.packet);
    assertWp004bExpectationsNotInJudgeRequest(request, calibrationCase.expectation);
    const judgeResult = await judge.judge({ packet: calibrationCase.packet });
    const evaluation = judgeResult.status === 'SUCCESS' && judgeResult.recommendation
      ? evaluateWp004bLiveRecommendation(calibrationCase.packet, judgeResult.recommendation, calibrationCase.expectation)
      : null;
    results.push({
      caseId: calibrationCase.caseId,
      description: calibrationCase.description,
      packet: safePacketSummary(calibrationCase.packet),
      judge: safeJudgeResult(judgeResult),
      evaluation: evaluation ? {
        schemaValid: evaluation.schemaValid,
        epistemic: evaluation.epistemic,
        expectation: evaluation.expectation,
        rationaleAudit: rationaleAudit(calibrationCase.caseId, judgeResult.recommendation),
      } : null,
      caseStatus: caseStatus(judgeResult, evaluation),
    });
    if (isSharedFailure(judgeResult)) {
      stoppedAfter = calibrationCase.caseId;
      break;
    }
  }

  const snapshot = transport.snapshot();
  if (snapshot.calls > MAX_REQUESTS) throw new Error('WP004B_CALL_CAP_EXCEEDED');
  const summary = {
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
      judgeCalls: snapshot.calls,
      totalProviderCalls: snapshot.calls,
      retries: 0,
      openAiCalls: 0,
      moondreamCalls: 0,
      otherInferenceCalls: 0,
      transportInvocations: snapshot.invocations,
    },
    enforcementAuthority: false,
  };
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(summary));
  if (results.length !== calibrationCases.length || results.some((item) => item.caseStatus !== 'PASS')) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: WP004B_LIVE_CALIBRATION_SCHEMA_VERSION, status: 'FAILED', errorCategory: safeFailure(error), invocationAccounting: { judgeCalls: transport.snapshot().calls, retries: 0, openAiCalls: 0, moondreamCalls: 0, otherInferenceCalls: 0 } }));
  process.exitCode = 1;
}
