import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { createCloudflareRestTransport } from '../../packages/authenticity/src/wp004a.ts';
import {
  WP004B_ACCOUNTING_PROVIDER,
  WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS,
  WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
  WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_TOKENS,
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS,
  WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  WP004B_MINIMAL_JSON_SCHEMA,
  WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT,
  WP004B_JSON_SCHEMA_PROBE_USER_PROMPT,
  createWp004bBudgetLedger,
  buildWp004bJsonSchemaCapabilityRequest,
  canonicalJson,
  normalizeWp004bJsonSchemaProbeResult,
  writeWp004bAtomicJson,
} from '../../packages/authenticity/src/wp004b.ts';

const H1_CASE_ID = 'H1';
const H1_MAX_TOKENS = WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_TOKENS;
const PHASE_H_SCHEMA_VERSION = 'lythaus-wp004b-json-schema-minimal-confirmation-v1';
const EXPECTED_PHASE_G_MINIMAL_SCHEMA_FINGERPRINT = 'e10092f0b601d72dc5d4c994116ca49d7e4bca1eee89f6f9d2eb71dcd71012ac';

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-json-schema-minimal-confirmation.json',
    journal: '.artifacts/wp004b-json-schema-minimal-confirmation-call-accounting.json',
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
    'WP004B_JSON_SCHEMA_MINIMAL_PREFLIGHT_FAILED',
    'WP004B_JSON_SCHEMA_MINIMAL_FINGERPRINT_MISMATCH',
    'WP004B_JSON_SCHEMA_MINIMAL_REQUEST_INVARIANTS_INVALID',
    'WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_FAILURE',
  ]);
  return error instanceof Error && allowed.has(error.message) ? error.message : 'WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_FAILURE';
}

function schemaFingerprint(schema) {
  return createHash('sha256').update(JSON.stringify(schema), 'utf8').digest('hex');
}

function safeProbeDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  return {
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
}

function validatePreflight() {
  let validator;
  try {
    validator = new Ajv({ strict: true }).compile(WP004B_MINIMAL_JSON_SCHEMA);
  } catch {
    throw new Error('WP004B_JSON_SCHEMA_MINIMAL_PREFLIGHT_FAILED');
  }
  if (!validator({ success: true }) || validator({ success: false }) || validator({ success: true, extra: true })) {
    throw new Error('WP004B_JSON_SCHEMA_MINIMAL_PREFLIGHT_FAILED');
  }
  const phaseGRequest = buildWp004bJsonSchemaCapabilityRequest({ maxTokens: WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS });
  const request = buildWp004bJsonSchemaCapabilityRequest({ maxTokens: H1_MAX_TOKENS });
  const serialized = JSON.stringify(request);
  const fingerprint = schemaFingerprint(request.response_format.json_schema);
  if (fingerprint !== EXPECTED_PHASE_G_MINIMAL_SCHEMA_FINGERPRINT) {
    throw new Error('WP004B_JSON_SCHEMA_MINIMAL_FINGERPRINT_MISMATCH');
  }
  if (request.response_format.type !== 'json_schema'
    || request.response_format.json_schema !== phaseGRequest.response_format.json_schema
    || request.messages.length !== phaseGRequest.messages.length
    || request.messages.some((message, index) => JSON.stringify(message) !== JSON.stringify(phaseGRequest.messages[index]))
    || request.temperature !== phaseGRequest.temperature
    || request.stream !== phaseGRequest.stream
    || phaseGRequest.max_tokens !== WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS
    || request.max_tokens !== H1_MAX_TOKENS
    || request.messages[0].content !== WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT
    || request.messages[1].content !== WP004B_JSON_SCHEMA_PROBE_USER_PROMPT
    || serialized.includes('JUDGE_SYSTEM_PROMPT')
    || serialized.includes('lythaus-gpt-oss-judge-prompt-v3')
    || serialized.includes('EvidencePacket')
    || serialized.includes('groundTruth')
    || serialized.includes('expectedHypothesis')
    || serialized.includes('CLOUDFLARE_API_TOKEN')) {
    throw new Error('WP004B_JSON_SCHEMA_MINIMAL_REQUEST_INVARIANTS_INVALID');
  }
  return {
    request,
    schemaProvenance: {
      schemaVersion: WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
      schemaFingerprint: fingerprint,
      canonicalSchemaFingerprint: createHash('sha256').update(canonicalJson(request.response_format.json_schema), 'utf8').digest('hex'),
      schemaCharacterLength: JSON.stringify(request.response_format.json_schema).length,
    },
  };
}

function classificationForFailure(transportFailure, normalization) {
  if (transportFailure?.category === 'TIMEOUT') return 'JSON_SCHEMA_MINIMAL_TIMEOUT_BLOCKED';
  if (normalization?.code === 'FINISH_REASON_TRUNCATED') return 'JSON_SCHEMA_MINIMAL_OUTPUT_BUDGET_BLOCKED';
  if (transportFailure || normalization) return 'JSON_SCHEMA_MINIMAL_PROVIDER_REJECTED';
  return 'JSON_SCHEMA_MINIMAL_PROVIDER_REJECTED';
}

function buildH1Result({ preflight, transportResult, transportFailure, normalization, executionMs }) {
  const diagnostics = normalization?.diagnostics ?? null;
  const valid = Boolean(normalization?.result);
  return {
    caseId: H1_CASE_ID,
    description: 'Minimal JSON Schema capability confirmation with the exact Phase G schema and prompts.',
    schemaVersion: WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
    schemaProvenance: preflight.schemaProvenance,
    provider: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
    maxTokens: H1_MAX_TOKENS,
    attempted: true,
    transportCompleted: Boolean(transportResult) || (transportFailure?.httpStatus !== null && transportFailure?.httpStatus !== undefined),
    httpStatus: transportResult?.httpStatus ?? transportFailure?.httpStatus ?? null,
    executionMs,
    providerEnvelope: diagnostics?.providerEnvelope ?? null,
    diagnostics: safeProbeDiagnostics(diagnostics),
    minimalStructuredOutputValid: valid,
    structuredOutput: valid ? normalization.result : null,
    finishReason: diagnostics?.finishReasonValueCode ?? null,
    failureCategory: valid ? null : classificationForFailure(transportFailure, normalization),
  };
}

function postTransportUpdate({ transportResult, transportFailure, normalization, executionMs }) {
  const diagnostics = normalization?.diagnostics ?? null;
  const transportCompleted = Boolean(transportResult) || (transportFailure?.httpStatus !== null && transportFailure?.httpStatus !== undefined);
  return {
    transportCompleted,
    canonicalSuccess: Boolean(normalization?.result),
    executionMs,
    httpStatus: transportResult?.httpStatus ?? transportFailure?.httpStatus ?? null,
    providerEnvelopeClassification: diagnostics?.providerEnvelope === 'DIRECT_OBJECT' ? 'DIRECT_CANONICAL' : diagnostics?.providerEnvelope ?? null,
    normalizationFailureCode: normalization?.code ?? null,
    ambiguousSend: !transportCompleted && ['TIMEOUT', 'NETWORK_FAILURE'].includes(transportFailure?.category),
    failureStage: normalization?.result ? 'PROVIDER_ENVELOPE' : transportResult ? 'CANONICAL_SCHEMA' : 'TRANSPORT',
  };
}

function buildSummary({ preflight, h1, ledger, transport, fatalFailure }) {
  const budgetAccounting = ledger.snapshot();
  const transportSnapshot = transport?.snapshot?.() ?? { calls: 0, successes: 0, providerFailures: 0, invocations: [] };
  const success = h1?.minimalStructuredOutputValid === true;
  const capabilityValidity = budgetAccounting.budgetIntegrity === 'PASS'
    && Boolean(h1?.attempted)
    && h1?.transportCompleted === true
    && h1?.caseId === H1_CASE_ID;
  return {
    schemaVersion: PHASE_H_SCHEMA_VERSION,
    phase: 'WP004B_PHASE_H_MINIMAL_JSON_SCHEMA_CONFIRMATION',
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    structuredOutputMode: 'JSON_SCHEMA',
    timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
    generationConfig: { temperature: 0, stream: false, maxTokens: H1_MAX_TOKENS },
    experimentControl: {
      phaseGMaxTokens: WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS,
      phaseHMaxTokens: H1_MAX_TOKENS,
      onlyProviderFacingChange: 'max_tokens',
    },
    schemaProvenance: preflight?.schemaProvenance ?? null,
    casesExecuted: h1 ? [H1_CASE_ID] : [],
    h1,
    capabilityValidity: capabilityValidity ? 'VALID_FOR_CAPABILITY_ASSESSMENT' : 'INVALID_FOR_CAPABILITY_ASSESSMENT',
    capabilityConclusion: success
      ? 'JSON_SCHEMA_MINIMAL_CAPABILITY_CONFIRMED'
      : h1?.failureCategory ?? 'JSON_SCHEMA_MINIMAL_PROVIDER_REJECTED',
    finalClassification: success ? 'WP004B_PHASE_H_READY' : 'WP004B_PHASE_H_PROVIDER_BLOCKED',
    invocationAccounting: {
      authorizedMaxJudgeAttempts: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
      judgeCallsAttempted: budgetAccounting.observed.judgeCallsAttempted,
      judgeCallsCompleted: transportSnapshot.successes + transportSnapshot.providerFailures,
      retries: budgetAccounting.observed.retries,
      h1Attempts: budgetAccounting.attempts.filter((item) => item.caseId === H1_CASE_ID).length,
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
    accountingProvider: WP004B_ACCOUNTING_PROVIDER,
  };
}

async function main() {
  const ledger = createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
  });
  let options = {
    allowNetwork: false,
    output: '.artifacts/wp004b-json-schema-minimal-confirmation.json',
    journal: '.artifacts/wp004b-json-schema-minimal-confirmation-call-accounting.json',
  };
  let preflight = null;
  let transport = null;
  let h1 = null;
  let fatalFailure = null;
  let activeCallReserved = false;
  const persistJournal = async () => writeWp004bAtomicJson(options.journal, ledger.snapshot());
  try {
    options = parseArgs(process.argv.slice(2));
    await persistJournal();
    preflight = validatePreflight();
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('WP004B_CLOUDFLARE_CREDENTIALS_REQUIRED');
    transport = createCloudflareRestTransport({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      allowNetwork: options.allowNetwork,
      maxRequests: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
      timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
    });
    ledger.preCallValidation(H1_CASE_ID);
    await persistJournal();
    ledger.reserveCall(H1_CASE_ID);
    activeCallReserved = true;
    await persistJournal();
    const startedAt = Date.now();
    let transportResult = null;
    let transportFailure = null;
    let normalization = null;
    try {
      transportResult = await transport.run({ kind: 'JUDGE', model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL, payload: preflight.request });
      try {
        normalization = normalizeWp004bJsonSchemaProbeResult(transportResult.result);
      } catch (error) {
        normalization = error;
      }
    } catch (error) {
      transportFailure = error;
    }
    const executionMs = transportResult?.executionMs ?? Date.now() - startedAt;
    ledger.postTransport(H1_CASE_ID, postTransportUpdate({ transportResult, transportFailure, normalization, executionMs }));
    ledger.markResultAvailable(H1_CASE_ID);
    ledger.setStage(H1_CASE_ID, 'COMPLETED');
    activeCallReserved = false;
    await persistJournal();
    h1 = buildH1Result({ preflight, transportResult, transportFailure, normalization, executionMs });
  } catch (error) {
    fatalFailure = error;
    if (activeCallReserved) {
      try {
        ledger.markAmbiguousSend('H1');
        ledger.markResultAvailable('H1');
      } catch { }
    }
    try { await persistJournal(); } catch { }
  } finally {
    let summary;
    try {
      await persistJournal();
      summary = buildSummary({ preflight, h1, ledger, transport, fatalFailure });
      await writeWp004bAtomicJson(options.output, summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      try { await persistJournal(); } catch { }
      console.error(JSON.stringify({ schemaVersion: PHASE_H_SCHEMA_VERSION, status: 'FAILED', errorCategory: safeFailure(error) }));
      process.exitCode = 1;
      return;
    }
    const snapshot = ledger.snapshot();
    if (fatalFailure || snapshot.budgetIntegrity !== 'PASS' || !h1?.minimalStructuredOutputValid) process.exitCode = 1;
  }
}

await main();
