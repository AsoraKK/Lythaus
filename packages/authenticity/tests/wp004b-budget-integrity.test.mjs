import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  WP004B_ACCOUNTING_CASE_IDS,
  WP004B_MAX_JUDGE_CALLS,
  WP004B_MAX_TOTAL_CALLS,
  WP004B_RETRIES_ALLOWED,
  buildWp004bBudgetFinalizerSummary,
  createWp004bBudgetLedger,
  writeWp004bAtomicJson,
} from '../src/wp004b.ts';

const MODEL = '@cf/openai/gpt-oss-20b';

function ledger() {
  return createWp004bBudgetLedger({ model: MODEL, caseIds: WP004B_ACCOUNTING_CASE_IDS });
}

function reserve(accounting, caseId) {
  accounting.preCallValidation(caseId);
  accounting.reserveCall(caseId);
}

function complete(accounting, caseId, update = {}) {
  accounting.postTransport(caseId, {
    transportCompleted: true,
    canonicalSuccess: true,
    executionMs: 17,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    ...update,
  });
  accounting.markResultAvailable(caseId);
  accounting.setStage(caseId, 'COMPLETED');
}

test('pre-call reservation is durable and post-call updates remain sanitized', () => {
  const accounting = ledger();
  reserve(accounting, 'B1');
  let snapshot = accounting.snapshot();
  assert.equal(snapshot.observed.judgeCallsAttempted, 1);
  assert.equal(snapshot.attempts[0].callAttempted, true);
  assert.equal(snapshot.attempts[0].failureStage, 'REQUEST_SENT');
  complete(accounting, 'B1', { normalizationFailureCode: 'PRIMARY_HYPOTHESIS_INVALID' });
  snapshot = accounting.snapshot();
  assert.equal(snapshot.attempts[0].transportCompleted, true);
  assert.equal(snapshot.attempts[0].canonicalSuccess, true);
  assert.equal(snapshot.attempts[0].failureStage, 'COMPLETED');
  assert.equal(snapshot.attempts[0].normalizationFailureCode, 'PRIMARY_HYPOTHESIS_INVALID');
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_RAW_RESPONSE'), false);
});

test('simulation A: three successful cases produce exactly three attempts and valid accounting', () => {
  const accounting = ledger();
  for (const caseId of WP004B_ACCOUNTING_CASE_IDS) {
    reserve(accounting, caseId);
    complete(accounting, caseId);
  }
  const snapshot = accounting.snapshot();
  assert.equal(snapshot.observed.judgeCallsAttempted, 3);
  assert.equal(snapshot.observed.totalCallsAttempted, 3);
  assert.equal(snapshot.observed.retries, 0);
  assert.equal(snapshot.budgetIntegrity, 'PASS');
  assert.equal(snapshot.scientificValidity, 'VALID_FOR_SCIENTIFIC_SCORING');
  assert.deepEqual(snapshot.attempts.map((item) => [item.caseId, item.sequenceNumber]), [['B1', 1], ['B2', 2], ['B3', 3]]);
});

test('simulation B: a transport failure counts once and leaves later cases not started', () => {
  const accounting = ledger();
  reserve(accounting, 'B1');
  accounting.postTransport('B1', { transportCompleted: false, canonicalSuccess: false, failureStage: 'TRANSPORT' });
  accounting.markResultAvailable('B1');
  const snapshot = accounting.snapshot();
  assert.equal(snapshot.observed.judgeCallsAttempted, 1);
  assert.equal(snapshot.cases[0].failureStage, 'TRANSPORT');
  assert.equal(snapshot.cases[1].failureStage, 'NOT_STARTED');
  assert.equal(snapshot.cases[2].callAttempted, false);
  assert.equal(snapshot.scientificValidity, 'INVALID_FOR_SCIENTIFIC_SCORING');
});

test('simulation C: canonical parsing failure after HTTP still retains one attempt', () => {
  const accounting = ledger();
  reserve(accounting, 'B1');
  accounting.postTransport('B1', {
    transportCompleted: true,
    canonicalSuccess: false,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    normalizationFailureCode: 'PRIMARY_HYPOTHESIS_INVALID',
    failureStage: 'CANONICAL_SCHEMA',
  });
  accounting.markResultAvailable('B1');
  const snapshot = accounting.snapshot();
  assert.equal(snapshot.observed.judgeCallsAttempted, 1);
  assert.equal(snapshot.attempts[0].httpStatus, 200);
  assert.equal(snapshot.attempts[0].failureStage, 'CANONICAL_SCHEMA');
  assert.equal(snapshot.attempts[0].normalizationFailureCode, 'PRIMARY_HYPOTHESIS_INVALID');
});

test('simulation D: evaluation failure cannot erase the preceding two reservations', () => {
  const accounting = ledger();
  reserve(accounting, 'B1');
  complete(accounting, 'B1');
  reserve(accounting, 'B2');
  accounting.postTransport('B2', { transportCompleted: true, canonicalSuccess: true, httpStatus: 200 });
  accounting.setStage('B2', 'EPISTEMIC_EVALUATION');
  const snapshot = accounting.snapshot();
  assert.equal(snapshot.observed.judgeCallsAttempted, 2);
  assert.equal(snapshot.cases[1].failureStage, 'EPISTEMIC_EVALUATION');
  assert.equal(snapshot.cases[2].failureStage, 'NOT_STARTED');
  assert.equal(snapshot.attempts.length, 2);
});

test('simulation E: reporting failure after B3 preserves all three attempts', () => {
  const accounting = ledger();
  reserve(accounting, 'B1');
  complete(accounting, 'B1');
  reserve(accounting, 'B2');
  complete(accounting, 'B2');
  reserve(accounting, 'B3');
  accounting.postTransport('B3', { transportCompleted: true, canonicalSuccess: true, httpStatus: 200 });
  accounting.markResultUnavailable('B3');
  accounting.setStage('B3', 'REPORTING');
  const snapshot = accounting.snapshot();
  assert.equal(snapshot.observed.judgeCallsAttempted, 3);
  assert.equal(snapshot.attempts.length, 3);
  assert.equal(snapshot.cases[2].failureStage, 'REPORTING');
  assert.equal(snapshot.cases[2].callAttempted, true);
  assert.equal(snapshot.scientificValidity, 'INVALID_FOR_SCIENTIFIC_SCORING');
  assert.equal(buildWp004bBudgetFinalizerSummary(snapshot).budgetIntegrity, 'PASS');
});

test('crash-after-send is conservatively counted and marked ambiguous', () => {
  const accounting = ledger();
  let fakeTransportCalls = 0;
  reserve(accounting, 'B1');
  try {
    fakeTransportCalls += 1;
    throw new Error('PRIVATE_RAW_RESPONSE_AND_SECRET');
  } catch {
    accounting.markAmbiguousSend('B1', 9);
    accounting.markResultAvailable('B1');
  }
  const snapshot = accounting.snapshot();
  assert.equal(fakeTransportCalls, 1);
  assert.equal(snapshot.observed.judgeCallsAttempted, 1);
  assert.equal(snapshot.attempts[0].transportCompleted, false);
  assert.equal(snapshot.attempts[0].ambiguousSend, true);
  assert.equal(snapshot.attempts[0].failureStage, 'REQUEST_SENT');
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_RAW_RESPONSE'), false);
  assert.equal(JSON.stringify(snapshot).includes('SECRET'), false);
});

test('fourth invocation is rejected before fake transport sees it', () => {
  const accounting = createWp004bBudgetLedger({ model: MODEL, caseIds: ['B1', 'B2', 'B3', 'B4'] });
  let fakeTransportCalls = 0;
  for (const caseId of WP004B_ACCOUNTING_CASE_IDS) {
    reserve(accounting, caseId);
    fakeTransportCalls += 1;
    complete(accounting, caseId);
  }
  assert.throws(() => {
    reserve(accounting, 'B4');
    fakeTransportCalls += 1;
  }, /WP004B_CALL_CAP_EXCEEDED/);
  assert.equal(fakeTransportCalls, 3);
  assert.equal(accounting.snapshot().observed.totalCallsAttempted, 3);
  assert.equal(accounting.snapshot().budgetIntegrity, 'PASS');
});

test('provider failure has no retry path and retains retryCount zero', () => {
  const accounting = ledger();
  let fakeTransportCalls = 0;
  reserve(accounting, 'B1');
  fakeTransportCalls += 1;
  accounting.postTransport('B1', { transportCompleted: false, canonicalSuccess: false, failureStage: 'TRANSPORT' });
  accounting.markResultAvailable('B1');
  const snapshot = accounting.snapshot();
  assert.equal(fakeTransportCalls, 1);
  assert.equal(snapshot.observed.retries, 0);
  assert.equal(snapshot.attempts[0].retryCount, 0);
});

test('finalizer emits only safe accounting fields and preserves the emergency report shape', async () => {
  const accounting = ledger();
  reserve(accounting, 'B1');
  accounting.postTransport('B1', { transportCompleted: true, canonicalSuccess: false, httpStatus: 500, failureStage: 'TRANSPORT', normalizationFailureCode: 'SERVER_FAILURE' });
  accounting.markResultAvailable('B1');
  const summary = buildWp004bBudgetFinalizerSummary(accounting.snapshot());
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('PRIVATE_RAW_RESPONSE'), false);
  assert.equal(serialized.includes('PRIVATE_REASONING_TRACE'), false);
  assert.equal(serialized.includes('SECRET_TOKEN'), false);
  assert.equal(summary.budget.maxJudgeCalls, WP004B_MAX_JUDGE_CALLS);
  assert.equal(summary.budget.maxTotalCalls, WP004B_MAX_TOTAL_CALLS);
  assert.equal(summary.budget.retriesAllowed, WP004B_RETRIES_ALLOWED);
  assert.equal(summary.cases.length, 3);
  assert.equal(summary.budgetIntegrity, 'PASS');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wp004b-budget-'));
  try {
    const output = path.join(directory, 'accounting.json');
    await writeWp004bAtomicJson(output, summary);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), summary);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fake provider response sentinels never enter the journal, finalizer, or surfaced failure code', () => {
  const accounting = ledger();
  const fakeProviderResponse = {
    message: 'PRIVATE_RAW_RESPONSE',
    reasoning: 'PRIVATE_REASONING_TRACE',
    tool_calls: [{ arguments: 'SECRET_TOKEN' }],
  };
  reserve(accounting, 'B1');
  accounting.postTransport('B1', {
    transportCompleted: true,
    canonicalSuccess: false,
    httpStatus: 200,
    providerEnvelopeClassification: 'CHAT_COMPLETION',
    normalizationFailureCode: 'MESSAGE_CONTENT_NOT_JSON',
  });
  accounting.markResultAvailable('B1');
  const journal = accounting.snapshot();
  const summary = buildWp004bBudgetFinalizerSummary(journal);
  const serialized = `${JSON.stringify(journal)}${JSON.stringify(summary)}${JSON.stringify({ errorCategory: 'WP004B_RUNNER_FAILURE' })}`;
  assert.equal(serialized.includes(fakeProviderResponse.message), false);
  assert.equal(serialized.includes(fakeProviderResponse.reasoning), false);
  assert.equal(serialized.includes(fakeProviderResponse.tool_calls[0].arguments), false);
});

test('finalizer marks missing or malformed journals as failed and scientifically invalid', () => {
  const summary = buildWp004bBudgetFinalizerSummary({ schemaVersion: 'wrong' });
  assert.equal(summary.budgetIntegrity, 'FAIL');
  assert.equal(summary.scientificValidity, 'INVALID_FOR_SCIENTIFIC_SCORING');
  assert.equal(summary.observed.judgeCallsAttempted, 0);
  assert.deepEqual(summary.cases.map((item) => item.failureStage), ['NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED']);
});
