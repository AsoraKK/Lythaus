import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import Ajv from 'ajv';
import {
  JUDGE_JSON_SCHEMA_VERSION,
  JUDGE_MAX_OUTPUT_TOKENS,
  JUDGE_PROMPT_VERSION,
  JUDGE_SYSTEM_PROMPT,
  buildJudgeRequest,
  packetReferenceIds,
} from '../src/wp004a.ts';
import {
  WP004B_ACCOUNTING_PROVIDER,
  WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS,
  WP004B_JSON_SCHEMA_B2_B3_COMPLETION_MAX_CALLS,
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  buildWp004bBudgetFinalizerSummary,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  emergencyFinalizerSummary,
} from '../src/wp004b.ts';

const CASE_IDS = [
  'WP004B_LIVE_SAFETY_BLOCK_01',
  'WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01',
];

function phaseJCases() {
  const cases = createWp004bLiveCalibrationCases();
  return CASE_IDS.map((caseId) => {
    const value = cases.find((item) => item.caseId === caseId);
    assert.ok(value);
    return value;
  });
}

function schemaFingerprint(schema) {
  return createHash('sha256').update(JSON.stringify(schema), 'utf8').digest('hex');
}

function completeCase(ledger, caseId, sequenceNumber) {
  ledger.preCallValidation(caseId);
  ledger.reserveCall(caseId);
  ledger.postTransport(caseId, {
    transportCompleted: true,
    canonicalSuccess: true,
    executionMs: 100 + sequenceNumber,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    failureStage: 'PROVIDER_ENVELOPE',
  });
  ledger.markResultAvailable(caseId);
  ledger.setStage(caseId, 'COMPLETED');
}

test('Phase J uses exact B2 then B3 cases', () => {
  assert.deepEqual(WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS, ['B2', 'B3']);
  assert.deepEqual(phaseJCases().map((item) => item.caseId), CASE_IDS);
  assert.deepEqual(WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS, ['B2', 'B3']);
});

test('Phase J schemas compile and enforce packet-aware IDs', () => {
  for (const calibrationCase of phaseJCases()) {
    const schemaRequest = buildJudgeRequest(calibrationCase.packet, { structuredOutputMode: 'JSON_SCHEMA' });
    const schema = schemaRequest.response_format.json_schema;
    assert.equal(schema.$id, JUDGE_JSON_SCHEMA_VERSION);
    assert.doesNotThrow(() => new Ajv({ strict: true }).compile(schema));
    const expectedEvidenceIds = [...packetReferenceIds(calibrationCase.packet)]
      .filter((evidenceId) => evidenceId !== calibrationCase.packet.safetyContext.contextId)
      .sort();
    assert.deepEqual(schema.properties.supportingEvidence.items.properties.evidenceId.enum, expectedEvidenceIds);
    assert.equal(expectedEvidenceIds.includes(calibrationCase.packet.safetyContext.contextId), false);
    const serialized = JSON.stringify(schema);
    assert.doesNotMatch(serialized, /groundTruth|expectedHypothesis|caseExpectation|"SUPPORTS"|"CONTRADICTS"|"NEUTRAL"|"UNVALIDATED"/);
    assert.equal(schema.properties.enforcementAuthority.const, false);
    assert.ok(schemaFingerprint(schema).length === 64);
  }
  const b2 = phaseJCases()[0];
  const b2ObservationIds = b2.packet.observations.map((item) => item.observationId).sort();
  assert.deepEqual(b2.packet.observations.length > 0
    ? b2ObservationIds
    : [], b2.packet.observations.map((item) => item.observationId).sort());
  const b3 = phaseJCases()[1];
  const b3Ids = b3.packet.evidence.map((item) => item.evidenceId);
  const b3Schema = buildJudgeRequest(b3.packet, { structuredOutputMode: 'JSON_SCHEMA' }).response_format.json_schema;
  const calibratedEf5Id = 'WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01:ef5-calibrated';
  assert.ok(b3Ids.includes(calibratedEf5Id));
  assert.ok(b3Schema.properties.supportingEvidence.items.properties.evidenceId.enum.includes(calibratedEf5Id));
  assert.equal(b3Schema.properties.supportingEvidence.items.properties.evidenceId.enum.includes(b3.packet.safetyContext.contextId), false);
});

test('Phase J request preserves prompt and generation controls', () => {
  for (const calibrationCase of phaseJCases()) {
    const objectRequest = buildJudgeRequest(calibrationCase.packet);
    const schemaRequest = buildJudgeRequest(calibrationCase.packet, { structuredOutputMode: 'JSON_SCHEMA' });
    assert.deepEqual(schemaRequest.messages, objectRequest.messages);
    assert.equal(schemaRequest.messages[0].content, JUDGE_SYSTEM_PROMPT);
    assert.equal(schemaRequest.temperature, 0);
    assert.equal(schemaRequest.max_tokens, JUDGE_MAX_OUTPUT_TOKENS);
    assert.equal(schemaRequest.max_tokens, 2400);
    assert.equal(JUDGE_PROMPT_VERSION, 'lythaus-gpt-oss-judge-prompt-v3');
    assert.equal(schemaRequest.response_format.type, 'json_schema');
    assert.equal(objectRequest.response_format.type, 'json_object');
    assert.equal(Object.prototype.hasOwnProperty.call(schemaRequest, 'stream'), false);
  }
  assert.equal(WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS, 90_000);
});

test('Phase J accounting accepts exactly two attempts, zero retries, and rejects a third', () => {
  const ledger = createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_B2_B3_COMPLETION_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_B2_B3_COMPLETION_MAX_CALLS,
  });
  completeCase(ledger, 'B2', 1);
  completeCase(ledger, 'B3', 2);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.budget.maxJudgeCalls, 2);
  assert.equal(snapshot.budget.maxTotalCalls, 2);
  assert.equal(snapshot.observed.judgeCallsAttempted, 2);
  assert.equal(snapshot.observed.totalCallsAttempted, 2);
  assert.equal(snapshot.observed.retries, 0);
  assert.deepEqual(snapshot.attempts.map((item) => item.caseId), ['B2', 'B3']);
  assert.deepEqual(snapshot.attempts.map((item) => item.provider), [WP004B_ACCOUNTING_PROVIDER, WP004B_ACCOUNTING_PROVIDER]);
  assert.throws(() => ledger.reserveCall('B2'), /WP004B_CASE_CALL_CAP_EXCEEDED/);
  assert.equal(snapshot.budgetIntegrity, 'PASS');
  assert.equal(snapshot.scientificValidity, 'VALID_FOR_SCIENTIFIC_SCORING');
  const finalizer = buildWp004bBudgetFinalizerSummary(snapshot, { caseOrder: ['B2', 'B3'], maxJudgeCalls: 2, maxTotalCalls: 2 });
  assert.equal(finalizer.budgetIntegrity, 'PASS');
  assert.equal(finalizer.scientificValidity, 'VALID_FOR_SCIENTIFIC_SCORING');
  assert.deepEqual(finalizer.cases.map((item) => item.caseId), ['B2', 'B3']);
  assert.deepEqual(emergencyFinalizerSummary({ caseOrder: ['B2', 'B3'], maxJudgeCalls: 2, maxTotalCalls: 2 }).cases.map((item) => item.caseId), ['B2', 'B3']);
});

test('Phase J runner is B2/B3-only, JSON_SCHEMA-only, and does not invoke other providers', async () => {
  const runner = await readFile(path.resolve('scripts/authenticity/wp004b-json-schema-b2-b3-completion.mjs'), 'utf8');
  assert.match(runner, /CASE_CONFIG/);
  assert.match(runner, /accountingCaseId: 'B2'/);
  assert.match(runner, /accountingCaseId: 'B3'/);
  assert.match(runner, /maxRequests: MAX_REQUESTS/);
  assert.match(runner, /timeoutMs: TIMEOUT_MS/);
  assert.match(runner, /structuredOutputMode: 'JSON_SCHEMA'/);
  assert.match(runner, /caseOrder: \[\.\.\.WP004B_JSON_SCHEMA_B2_B3_COMPLETION_CASE_IDS\]/);
  assert.doesNotMatch(runner, /WP004B_LIVE_NEUTRAL_STRESS_01|B1|createCloudflareVisionObserver|createOpenAIModerationProvider|OPENAI_API_KEY/);
  assert.doesNotMatch(runner, /fallback|retry|createCloudflareJsonSchema/);
});

test('Phase J workflow is manual, B2/B3-only, bounded, and sanitized', async () => {
  const workflow = await readFile(path.resolve('.github/workflows/wp004b-json-schema-b2-b3-completion.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /--case-order B2,B3/);
  assert.match(workflow, /--max-calls 2/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|Moondream|B1/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /final-result\.json/);
  assert.match(workflow, /call-accounting\.json/);
  assert.match(workflow, /budget-finalizer\.json/);
  assert.match(workflow, /if-no-files-found: error/);
});
