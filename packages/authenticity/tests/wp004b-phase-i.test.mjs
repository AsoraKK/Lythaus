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
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT,
  WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_CASE_IDS,
  WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  buildWp004bBudgetFinalizerSummary,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  emergencyFinalizerSummary,
} from '../src/wp004b.ts';

const EXPECTED_SCHEMA_CHARACTER_LENGTH = 3758;
const EXPECTED_CASE_ID = 'WP004B_LIVE_NEUTRAL_STRESS_01';

function b1() {
  const value = createWp004bLiveCalibrationCases()[0];
  assert.equal(value.caseId, EXPECTED_CASE_ID);
  return value;
}

function schemaFingerprint(schema) {
  return createHash('sha256').update(JSON.stringify(schema), 'utf8').digest('hex');
}

function completeB1(ledger) {
  ledger.preCallValidation('B1');
  ledger.reserveCall('B1');
  ledger.postTransport('B1', {
    transportCompleted: true,
    canonicalSuccess: true,
    executionMs: 100,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    failureStage: 'PROVIDER_ENVELOPE',
  });
  ledger.markResultAvailable('B1');
  ledger.setStage('B1', 'COMPLETED');
}

test('Phase I B1 schema is exact, deterministic, and locally compilable', () => {
  const packet = b1().packet;
  const first = buildJudgeRequest(packet, { structuredOutputMode: 'JSON_SCHEMA' });
  const second = buildJudgeRequest(packet, { structuredOutputMode: 'JSON_SCHEMA' });
  const schema = first.response_format.json_schema;
  assert.deepEqual(first, second);
  assert.equal(schema.$id, JUDGE_JSON_SCHEMA_VERSION);
  assert.equal(schemaFingerprint(schema), WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT);
  assert.equal(JSON.stringify(schema).length, EXPECTED_SCHEMA_CHARACTER_LENGTH);
  assert.doesNotThrow(() => new Ajv({ strict: true }).compile(schema));
});

test('Phase I request changes only response format from JSON_OBJECT', () => {
  const packet = b1().packet;
  const objectRequest = buildJudgeRequest(packet);
  const schemaRequest = buildJudgeRequest(packet, { structuredOutputMode: 'JSON_SCHEMA' });
  assert.deepEqual(schemaRequest.messages, objectRequest.messages);
  assert.equal(schemaRequest.temperature, objectRequest.temperature);
  assert.equal(schemaRequest.max_tokens, objectRequest.max_tokens);
  assert.equal(schemaRequest.messages[0].content, JUDGE_SYSTEM_PROMPT);
  assert.equal(JUDGE_PROMPT_VERSION, 'lythaus-gpt-oss-judge-prompt-v3');
  assert.deepEqual(objectRequest.response_format, { type: 'json_object' });
  assert.equal(schemaRequest.response_format.type, 'json_schema');
  assert.equal(Object.prototype.hasOwnProperty.call(schemaRequest, 'stream'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectRequest, 'stream'), false);
});

test('Phase I schema uses B1 origin references and excludes Safety context', () => {
  const packet = b1().packet;
  const schema = buildJudgeRequest(packet, { structuredOutputMode: 'JSON_SCHEMA' }).response_format.json_schema;
  const expectedIds = [...packetReferenceIds(packet)]
    .filter((evidenceId) => evidenceId !== packet.safetyContext.contextId)
    .sort();
  assert.deepEqual(schema.properties.supportingEvidence.items.properties.evidenceId.enum, expectedIds);
  assert.equal(expectedIds.includes(packet.safetyContext.contextId), false);
  assert.equal(schema.properties.enforcementAuthority.const, false);
  assert.doesNotMatch(JSON.stringify(schema), /groundTruth|expectedHypothesis|caseExpectation|"SUPPORTS"|"CONTRADICTS"|"NEUTRAL"|"UNVALIDATED"/);
});

test('Phase I accounting is one B1 attempt with zero retries and no fourth call', () => {
  const ledger = createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_FULL_B1_CONFIRMATION_MAX_CALLS,
  });
  completeB1(ledger);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.budget.maxJudgeCalls, 1);
  assert.equal(snapshot.budget.maxTotalCalls, 1);
  assert.equal(snapshot.observed.judgeCallsAttempted, 1);
  assert.equal(snapshot.observed.totalCallsAttempted, 1);
  assert.equal(snapshot.observed.retries, 0);
  assert.equal(snapshot.attempts[0].provider, WP004B_ACCOUNTING_PROVIDER);
  assert.throws(() => ledger.reserveCall('B1'), /WP004B_CASE_CALL_CAP_EXCEEDED/);
  const finalizer = buildWp004bBudgetFinalizerSummary(snapshot, { caseOrder: ['B1'], maxJudgeCalls: 1, maxTotalCalls: 1 });
  assert.equal(finalizer.budgetIntegrity, 'PASS');
  assert.equal(finalizer.scientificValidity, 'VALID_FOR_SCIENTIFIC_SCORING');
  assert.deepEqual(finalizer.cases.map((item) => item.caseId), ['B1']);
  const emergency = emergencyFinalizerSummary({ caseOrder: ['B1'], maxJudgeCalls: 1, maxTotalCalls: 1 });
  assert.deepEqual(emergency.cases.map((item) => item.caseId), ['B1']);
});

test('Phase I timeout and provider controls are opt-in and bounded', async () => {
  assert.equal(WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS, 90_000);
  assert.equal(JUDGE_MAX_OUTPUT_TOKENS, 2400);
  const runner = await readFile(path.resolve('scripts/authenticity/wp004b-full-b1-json-schema-confirmation.mjs'), 'utf8');
  assert.match(runner, /maxRequests:\s*MAX_REQUESTS/);
  assert.match(runner, /timeoutMs:\s*TIMEOUT_MS/);
  assert.match(runner, /structuredOutputMode:\s*'JSON_SCHEMA'/);
  assert.match(runner, /WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT/);
  assert.match(runner, /EXPECTED_SCHEMA_CHARACTER_LENGTH/);
  assert.doesNotMatch(runner, /B2|B3|createCloudflareVisionObserver|createOpenAIModerationProvider|OPENAI_API_KEY/);
  assert.doesNotMatch(runner, /response_format:\s*\{\s*type:\s*'json_object'/);
});

test('Phase I workflow is manual, one-call, B1-only, and sanitized', async () => {
  const workflow = await readFile(path.resolve('.github/workflows/wp004b-full-b1-json-schema-confirmation.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /--case-order B1/);
  assert.match(workflow, /--max-calls 1/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|Moondream/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /final-result\.json/);
  assert.match(workflow, /call-accounting\.json/);
  assert.match(workflow, /budget-finalizer\.json/);
  assert.match(workflow, /if-no-files-found: error/);
});
