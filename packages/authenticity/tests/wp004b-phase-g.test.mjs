import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import Ajv from 'ajv';
import {
  JUDGE_JSON_SCHEMA_VERSION,
  buildJudgeRequest,
} from '../src/wp004a.ts';
import {
  WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS,
  WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT,
  WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT,
  WP004B_JSON_SCHEMA_PROBE_USER_PROMPT,
  WP004B_MINIMAL_JSON_SCHEMA,
  buildWp004bBudgetFinalizerSummary,
  buildWp004bJsonSchemaCapabilityRequest,
  createWp004bBudgetLedger,
  createWp004bLiveCalibrationCases,
  emergencyFinalizerSummary,
  normalizeWp004bJsonSchemaProbeResult,
  shouldExecuteWp004bFullProbe,
} from '../src/wp004b.ts';

const model = WP004B_JSON_SCHEMA_CAPABILITY_MODEL;

function chat(content, extraMessage = {}) {
  return {
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content, ...extraMessage }, finish_reason: 'stop' }],
  };
}

function successfulGProfileLedger() {
  return createWp004bBudgetLedger({
    model,
    caseIds: WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
  });
}

function reserve(ledger, caseId) {
  ledger.preCallValidation(caseId);
  ledger.reserveCall(caseId);
  ledger.postTransport(caseId, {
    transportCompleted: true,
    canonicalSuccess: true,
    executionMs: 12,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    failureStage: 'PROVIDER_ENVELOPE',
  });
  ledger.markResultAvailable(caseId);
  ledger.setStage(caseId, 'COMPLETED');
}

test('G1 minimal request is small, explicit, and locally schema-valid', () => {
  const request = buildWp004bJsonSchemaCapabilityRequest();
  const validate = new Ajv({ strict: true }).compile(WP004B_MINIMAL_JSON_SCHEMA);
  assert.equal(validate({ success: true }), true);
  assert.equal(validate({ success: false }), false);
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema, WP004B_MINIMAL_JSON_SCHEMA);
  assert.equal(request.temperature, 0);
  assert.equal(request.max_tokens, 64);
  assert.equal(request.stream, false);
  assert.deepEqual(request.messages, [
    { role: 'system', content: WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT },
    { role: 'user', content: WP004B_JSON_SCHEMA_PROBE_USER_PROMPT },
  ]);
  const serialized = JSON.stringify(request);
  assert.doesNotMatch(serialized, /JUDGE_SYSTEM_PROMPT|lythaus-gpt-oss-judge-prompt-v3|EvidencePacket|groundTruth|expectedHypothesis/);
});

test('G1 schema fingerprint and timeout are deterministic and bounded', () => {
  const request = buildWp004bJsonSchemaCapabilityRequest();
  const first = createHash('sha256').update(JSON.stringify(request.response_format.json_schema), 'utf8').digest('hex');
  const second = createHash('sha256').update(JSON.stringify(buildWp004bJsonSchemaCapabilityRequest().response_format.json_schema), 'utf8').digest('hex');
  assert.equal(first, second);
  assert.equal(WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION, 'lythaus-wp004b-minimal-json-schema-v1');
  assert.equal(WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS, 90_000);
});

test('G1 accepts only explicit provider surfaces and retains safe structure', () => {
  const validJson = JSON.stringify({ success: true });
  const fixtures = [
    { value: { success: true }, envelope: 'DIRECT_OBJECT' },
    { value: { response: { success: true } }, envelope: 'RESPONSE_OBJECT' },
    { value: { response: validJson }, envelope: 'RESPONSE_STRING' },
    { value: { result: validJson }, envelope: 'RESULT_STRING' },
    { value: { output_text: validJson }, envelope: 'OUTPUT_TEXT_STRING' },
    { value: chat(validJson), envelope: 'CHAT_COMPLETION' },
  ];
  for (const fixture of fixtures) {
    const result = normalizeWp004bJsonSchemaProbeResult(fixture.value);
    assert.deepEqual(result.result, { success: true });
    assert.equal(result.diagnostics.providerEnvelope, fixture.envelope);
  }
  const withPrivateFields = normalizeWp004bJsonSchemaProbeResult(chat(validJson, {
    reasoning: 'PRIVATE_REASONING_SENTINEL',
    tool_calls: [],
  }));
  const diagnostics = JSON.stringify(withPrivateFields.diagnostics);
  assert.equal(diagnostics.includes('PRIVATE_REASONING_SENTINEL'), false);
  assert.equal(withPrivateFields.diagnostics.messageReasoningFieldPresent, true);
  assert.equal(withPrivateFields.diagnostics.toolCallsPresent, true);
});

test('G1 rejects malformed or ambiguous provider surfaces without retaining content', () => {
  const invalid = [
    [{ nested: { success: true } }, 'RESPONSE_MISSING'],
    [chat('not JSON'), 'MESSAGE_CONTENT_NOT_JSON'],
    [{ choices: [] }, 'CHOICES_EMPTY'],
    [{ choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'length' }] }, 'FINISH_REASON_TRUNCATED'],
    [{ choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ success: true }), tool_calls: [{ arguments: 'PRIVATE_TOOL_ARGUMENT' }] }, finish_reason: 'stop' }] }, 'UNEXPECTED_TOOL_CALL'],
    [{ response: { success: true, leaked: 'PRIVATE_RAW_CONTENT' } }, 'MINIMAL_SCHEMA_INVALID'],
  ];
  for (const [value, code] of invalid) {
    assert.throws(() => normalizeWp004bJsonSchemaProbeResult(value), (error) => {
      assert.equal(error.code, code);
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes('PRIVATE_TOOL_ARGUMENT'), false);
      assert.equal(serialized.includes('PRIVATE_RAW_CONTENT'), false);
      assert.equal(serialized.includes('not JSON'), false);
      return true;
    });
  }
});

test('G2 is gated strictly on successful G1 and uses the fixed B1 schema fingerprint', () => {
  assert.equal(shouldExecuteWp004bFullProbe(false), false);
  assert.equal(shouldExecuteWp004bFullProbe(true), true);
  const b1 = createWp004bLiveCalibrationCases()[0];
  const request = buildJudgeRequest(b1.packet, { structuredOutputMode: 'JSON_SCHEMA' });
  const fingerprint = createHash('sha256').update(JSON.stringify(request.response_format.json_schema), 'utf8').digest('hex');
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.$id, JUDGE_JSON_SCHEMA_VERSION);
  assert.equal(fingerprint, WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT);
});

test('G1/G2 accounting preserves a hard two-attempt cap and profile', () => {
  const accounting = successfulGProfileLedger();
  reserve(accounting, 'G1');
  reserve(accounting, 'G2');
  const snapshot = accounting.snapshot();
  assert.deepEqual(snapshot.caseOrder, ['G1', 'G2']);
  assert.equal(snapshot.budget.maxJudgeCalls, 2);
  assert.equal(snapshot.budget.maxTotalCalls, 2);
  assert.equal(snapshot.observed.judgeCallsAttempted, 2);
  assert.equal(snapshot.observed.retries, 0);
  assert.equal(snapshot.budgetIntegrity, 'PASS');
  assert.throws(() => accounting.reserveCall('G1'), /WP004B_CASE_CALL_CAP_EXCEEDED/);
  const finalizer = buildWp004bBudgetFinalizerSummary(snapshot);
  assert.equal(finalizer.budgetIntegrity, 'PASS');
  assert.equal(finalizer.budget.maxJudgeCalls, 2);
  assert.deepEqual(finalizer.cases.map((item) => item.caseId), ['G1', 'G2']);
  const emergency = emergencyFinalizerSummary({ caseOrder: ['G1', 'G2'], maxJudgeCalls: 2, maxTotalCalls: 2 });
  assert.equal(emergency.budget.maxJudgeCalls, 2);
  assert.deepEqual(emergency.cases.map((item) => item.caseId), ['G1', 'G2']);
});

test('Phase G workflow is manual, GPT-OSS-only, 90-second bounded, and sanitized', async () => {
  const workflowPath = path.resolve('.github/workflows/wp004b-json-schema-capability-probe.yml');
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /wp004b-json-schema-capability-probe/);
  assert.match(workflow, /--allow-network/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /--case-order G1,G2/);
  assert.match(workflow, /--max-calls 2/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /final-result\.json/);
  assert.match(workflow, /call-accounting\.json/);
  assert.match(workflow, /budget-finalizer\.json/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /timeout-minutes:/);
});

test('Phase G runner has no fallback, no retry, and keeps the default Judge mode elsewhere', async () => {
  const runner = await readFile(path.resolve('scripts/authenticity/wp004b-json-schema-capability-probe.mjs'), 'utf8');
  assert.match(runner, /maxRequests:\s*WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS/);
  assert.match(runner, /timeoutMs:\s*WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS/);
  assert.match(runner, /shouldExecuteWp004bFullProbe/);
  assert.match(runner, /structuredOutputMode: 'JSON_SCHEMA'/);
  assert.doesNotMatch(runner, /structuredOutputMode: 'JSON_OBJECT'/);
  assert.doesNotMatch(runner, /OPENAI_API_KEY|createCloudflareVisionObserver|createOpenAIModerationProvider/);
  assert.match(runner, /WP004B_JSON_SCHEMA_FINGERPRINT_MISMATCH/);
  assert.match(runner, /await writeWp004bAtomicJson\(options\.output, summary\)/);
});
