import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import Ajv from 'ajv';
import {
  WP004B_ACCOUNTING_PROVIDER,
  WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
  WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS,
  WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
  WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_TOKENS,
  WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS,
  WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION,
  WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS,
  WP004B_MINIMAL_JSON_SCHEMA,
  WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT,
  WP004B_JSON_SCHEMA_PROBE_USER_PROMPT,
  buildWp004bBudgetFinalizerSummary,
  createWp004bBudgetLedger,
  buildWp004bJsonSchemaCapabilityRequest,
  emergencyFinalizerSummary,
} from '../src/wp004b.ts';

const expectedFingerprint = 'e10092f0b601d72dc5d4c994116ca49d7e4bca1eee89f6f9d2eb71dcd71012ac';

function hLedger() {
  return createWp004bBudgetLedger({
    model: WP004B_JSON_SCHEMA_CAPABILITY_MODEL,
    caseIds: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS,
    maxJudgeCalls: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
  });
}

function completeH1(ledger) {
  ledger.preCallValidation('H1');
  ledger.reserveCall('H1');
  ledger.postTransport('H1', {
    transportCompleted: true,
    canonicalSuccess: true,
    executionMs: 9,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    failureStage: 'PROVIDER_ENVELOPE',
  });
  ledger.markResultAvailable('H1');
  ledger.setStage('H1', 'COMPLETED');
}

test('Phase H request changes only max_tokens from the Phase G request', () => {
  const phaseG = buildWp004bJsonSchemaCapabilityRequest({ maxTokens: WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS });
  const phaseH = buildWp004bJsonSchemaCapabilityRequest({ maxTokens: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_TOKENS });
  assert.equal(phaseG.max_tokens, 64);
  assert.equal(phaseH.max_tokens, 512);
  assert.deepEqual(phaseH.messages, phaseG.messages);
  assert.deepEqual(phaseH.response_format, phaseG.response_format);
  assert.equal(phaseH.temperature, phaseG.temperature);
  assert.equal(phaseH.stream, phaseG.stream);
  assert.equal(phaseH.messages[0].content, WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT);
  assert.equal(phaseH.messages[1].content, WP004B_JSON_SCHEMA_PROBE_USER_PROMPT);
  assert.equal(phaseH.response_format.type, 'json_schema');
  assert.equal(createHash('sha256').update(JSON.stringify(phaseH.response_format.json_schema), 'utf8').digest('hex'), expectedFingerprint);
});

test('Phase H preflight invariants remain bounded and contain no packet or truth data', () => {
  const request = buildWp004bJsonSchemaCapabilityRequest({ maxTokens: 512 });
  const validate = new Ajv({ strict: true }).compile(WP004B_MINIMAL_JSON_SCHEMA);
  assert.equal(validate({ success: true }), true);
  assert.equal(validate({ success: false }), false);
  assert.equal(request.max_tokens, 512);
  assert.equal(WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS, 90_000);
  assert.equal(WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION, 'lythaus-wp004b-minimal-json-schema-v1');
  const serialized = JSON.stringify(request);
  assert.doesNotMatch(serialized, /EvidencePacket|groundTruth|expectedHypothesis|truth|CLOUDFLARE_API_TOKEN|B1|B2|B3/);
});

test('Phase H accounting is exactly one attempt with zero retries', () => {
  const ledger = hLedger();
  completeH1(ledger);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.provider, undefined);
  assert.equal(snapshot.budget.maxJudgeCalls, 1);
  assert.equal(snapshot.budget.maxTotalCalls, 1);
  assert.equal(snapshot.observed.judgeCallsAttempted, 1);
  assert.equal(snapshot.observed.totalCallsAttempted, 1);
  assert.equal(snapshot.observed.retries, 0);
  assert.deepEqual(snapshot.caseOrder, ['H1']);
  assert.equal(snapshot.attempts[0].provider, WP004B_ACCOUNTING_PROVIDER);
  assert.equal(snapshot.attempts[0].retryCount, 0);
  assert.equal(snapshot.budgetIntegrity, 'PASS');
  assert.throws(() => ledger.reserveCall('H1'), /WP004B_CASE_CALL_CAP_EXCEEDED/);
  const finalizer = buildWp004bBudgetFinalizerSummary(snapshot, { caseOrder: ['H1'], maxJudgeCalls: 1, maxTotalCalls: 1 });
  assert.equal(finalizer.budgetIntegrity, 'PASS');
  assert.equal(finalizer.budget.maxJudgeCalls, 1);
  assert.deepEqual(finalizer.cases.map((item) => item.caseId), ['H1']);
  const emergency = emergencyFinalizerSummary({ caseOrder: ['H1'], maxJudgeCalls: 1, maxTotalCalls: 1 });
  assert.deepEqual(emergency.cases.map((item) => item.caseId), ['H1']);
  assert.equal(emergency.budget.maxTotalCalls, 1);
});

test('Phase H workflow is manual, one-call, GPT-OSS-only, and uses sanitized artifacts', async () => {
  const workflow = await readFile(path.resolve('.github/workflows/wp004b-json-schema-minimal-confirmation.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /wp004b-json-schema-minimal-confirmation/);
  assert.match(workflow, /--allow-network/);
  assert.match(workflow, /--case-order H1/);
  assert.match(workflow, /--max-calls 1/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|wp004b-json-schema-capability-probe|Moondream/);
  assert.match(workflow, /final-result\.json/);
  assert.match(workflow, /call-accounting\.json/);
  assert.match(workflow, /budget-finalizer\.json/);
  assert.match(workflow, /if-no-files-found: error/);
});

test('Phase H runner cannot execute G2 or the full Judge suite', async () => {
  const runner = await readFile(path.resolve('scripts/authenticity/wp004b-json-schema-minimal-confirmation.mjs'), 'utf8');
  assert.match(runner, /maxTokens: H1_MAX_TOKENS/);
  assert.match(runner, /maxRequests: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS/);
  assert.match(runner, /timeoutMs: WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS/);
  assert.match(runner, /max_tokens.*512|H1_MAX_TOKENS/);
  assert.doesNotMatch(runner, /createCloudflareJudgeRest|buildJudgeRequest|createWp004bLiveCalibrationCases|G2|B1|B2|B3/);
  assert.doesNotMatch(runner, /OPENAI_API_KEY|createOpenAIModerationProvider|createCloudflareVisionObserver/);
});

test('Phase G default request remains 64 tokens and its two-call profile remains intact', async () => {
  const request = buildWp004bJsonSchemaCapabilityRequest();
  assert.equal(request.max_tokens, 64);
  const phaseGTests = await readFile(path.resolve('packages/authenticity/tests/wp004b-phase-g.test.mjs'), 'utf8');
  assert.match(phaseGTests, /request\.max_tokens, 64/);
  const workflow = await readFile(path.resolve('.github/workflows/wp004b-json-schema-capability-probe.yml'), 'utf8');
  assert.match(workflow, /--case-order G1,G2/);
  assert.match(workflow, /--max-calls 2/);
});
