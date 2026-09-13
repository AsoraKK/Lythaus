import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WP005B_HOLDOUT_CASE_IDS,
  WP005B_JUDGE_CANDIDATE_IDS,
  WP005B_LEDGER_CASE_IDS,
  WP005B_MAX_ESTIMATED_COST_USD,
  WP005B_MAX_ESTIMATED_NEURONS,
  WP005B_MAX_LIVE_REQUESTS,
  WP005B_OBSERVER_CANDIDATE_IDS,
  WP005B_SCREENING_CASE_IDS,
  Wp005bBudget,
  buildWp005bJudgeRequest,
  compileWp005bEvidenceLedger,
  createWp005bJudgeCases,
  getWp005bJudgeCandidates,
  getWp005bObserverCandidates,
  selectWp005bCases,
} from '../src/wp005b.ts';
import { applyWp005aRoutingGate } from '../src/wp005a.ts';
import { createCloudflareJudge, createInsufficientEvidenceRecommendation } from '../src/judge.ts';
import { createCloudflareVisionObserver } from '../src/vision-observer.ts';

const cases = createWp005bJudgeCases();
const neutralPacket = cases.find((item) => item.caseId === 'missing-exif').packet;

function chatCompletion(content, options = {}) {
  return {
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content, ...(options.message ?? {}) },
      finish_reason: options.finishReason ?? 'stop',
    }],
  };
}

function observerEnvelope(observations, kind) {
  const text = JSON.stringify({ observations });
  if (kind === 'answer') return { answer: text };
  if (kind === 'chat') return chatCompletion(text);
  if (kind === 'nested-chat') return { response: chatCompletion(text) };
  throw new Error(`unknown fixture envelope ${kind}`);
}

test('WP005B exposes exactly the authorized finalists and fixed blind split', () => {
  assert.deepEqual(getWp005bJudgeCandidates().map((item) => item.candidate), [...WP005B_JUDGE_CANDIDATE_IDS]);
  assert.deepEqual(getWp005bObserverCandidates().map((item) => item.candidate), [...WP005B_OBSERVER_CANDIDATE_IDS]);
  assert.equal(cases.length, 16);
  assert.equal(selectWp005bCases(cases, WP005B_SCREENING_CASE_IDS).length, 6);
  assert.equal(selectWp005bCases(cases, WP005B_HOLDOUT_CASE_IDS).length, 6);
  assert.equal(selectWp005bCases(cases, WP005B_LEDGER_CASE_IDS).length, 2);
  assert.equal(new Set([...WP005B_SCREENING_CASE_IDS, ...WP005B_HOLDOUT_CASE_IDS]).size, 12);
});

test('WP005B budget reserves before send and enforces hard caps', () => {
  const candidate = getWp005bJudgeCandidates()[1];
  const budget = new Wp005bBudget();
  budget.reserve(candidate, { kind: 'JUDGE', inputText: 'small', maxOutputTokens: 2400 });
  assert.equal(budget.snapshot().reservedRequests, 1);
  assert.ok(budget.snapshot().reservedEstimatedNeurons <= WP005B_MAX_ESTIMATED_NEURONS);
  assert.ok(budget.snapshot().reservedEstimatedCostUsd <= WP005B_MAX_ESTIMATED_COST_USD);
  assert.equal(WP005B_MAX_LIVE_REQUESTS, 50);
});

test('Evidence Ledger is deterministic, packet-preserving, blind, and safety-isolated', () => {
  const testCase = cases.find((item) => item.caseId === 'camera-capture-synthetic');
  const before = JSON.stringify(testCase.packet);
  const ledger = compileWp005bEvidenceLedger(testCase.packet);
  assert.equal(JSON.stringify(testCase.packet), before);
  assert.equal(ledger.schemaVersion, 'lythaus-evidence-ledger-v1');
  assert.equal(ledger.independentOriginAxes.relationship, 'INDEPENDENT_AXES');
  assert.equal(ledger.safetyContext.role, 'SAFETY_CONTEXT_ONLY');
  assert.equal(ledger.safetyContext.excludedFromOriginInference, true);
  assert.equal(ledger.enforcementAuthority, false);
  assert.doesNotMatch(JSON.stringify(ledger), /expectedPrimary|groundTruth|caseExpectation|passCriteria/);
  const request = buildWp005bJudgeRequest(ledger);
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.temperature, 0);
  assert.equal(request.max_tokens, 2400);
  assert.doesNotMatch(request.messages[1].content, /expectedPrimary|groundTruth|caseExpectation|passCriteria/);
});

test('Selective Resolution Gate retains the WP005A zero-error routing contract', () => {
  const resolved = cases.map((testCase) => ({ testCase, route: applyWp005aRoutingGate(testCase.packet, 'SELECTIVE_RESOLUTION_GATE') }));
  const deterministic = resolved.filter((item) => item.route.deterministic);
  assert.equal(deterministic.length, 13);
  assert.equal(resolved.filter((item) => item.route.route === 'ESCALATE').length, 3);
  assert.equal(deterministic.filter((item) => item.route.recommendation.primaryHypothesis !== item.testCase.expectedPrimary).length, 0);
  assert.equal(resolved.find((item) => item.testCase.caseId === 'conflicting-calibrated').route.route, 'ESCALATE');
  assert.equal(resolved.find((item) => item.testCase.caseId === 'camera-capture-synthetic').route.route, 'ESCALATE');
  assert.equal(resolved.find((item) => item.testCase.caseId === 'safety-block').route.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
});

test('Judge equivalent envelopes produce identical canonical recommendations', async () => {
  const testCase = cases.find((item) => item.caseId === 'calibrated-local-edit');
  const recommendation = applyWp005aRoutingGate(testCase.packet, 'SELECTIVE_RESOLUTION_GATE').recommendation;
  const rawValues = [
    recommendation,
    { response: recommendation },
    { response: JSON.stringify(recommendation) },
    { result: JSON.stringify(recommendation) },
    { output_text: JSON.stringify(recommendation) },
    { result: { response: recommendation } },
    { output_text: chatCompletion(JSON.stringify(recommendation)) },
    chatCompletion(JSON.stringify(recommendation)),
    { response: chatCompletion(JSON.stringify(recommendation)) },
    chatCompletion([{ type: 'text', text: JSON.stringify(recommendation) }]),
  ];
  const normalized = [];
  for (const raw of rawValues) {
    const result = await createCloudflareJudge({ ai: { run: async () => raw } }).judge({ packet: testCase.packet });
    assert.equal(result.status, 'SUCCESS');
    normalized.push(result.recommendation);
  }
  for (const item of normalized.slice(1)) assert.deepEqual(item, normalized[0]);
});

test('Judge adapters fail closed and retain only structural diagnostics', async () => {
  const privateContent = 'PRIVATE_PROVIDER_CONTENT';
  const malformed = await createCloudflareJudge({
    ai: { run: async () => chatCompletion(privateContent) },
  }).judge({ packet: neutralPacket });
  assert.equal(malformed.status, 'PROVIDER_FAILURE');
  assert.equal(malformed.normalizationFailureCode, 'MESSAGE_CONTENT_NOT_JSON');
  assert.equal(malformed.responseDiagnostics.providerEnvelopeClassification, 'CHAT_COMPLETION');
  assert.equal(malformed.responseDiagnostics.messageContentJsonParseable, false);
  assert.equal(JSON.stringify(malformed).includes(privateContent), false);
  const toolCall = await createCloudflareJudge({
    ai: { run: async () => chatCompletion(JSON.stringify(createInsufficientEvidenceRecommendation()), { message: { tool_calls: [{ id: 'PRIVATE_TOOL' }] } }) },
  }).judge({ packet: neutralPacket });
  assert.equal(toolCall.normalizationFailureCode, 'UNEXPECTED_TOOL_CALL');
  assert.equal(JSON.stringify(toolCall).includes('PRIVATE_TOOL'), false);
});

test('Observer equivalent text envelopes produce identical canonical observations', async () => {
  const observations = [{ category: 'TEXT', applicable: true, status: 'OBSERVED', observation: 'LYTHAUS AUTHENTICITY is visible.', regions: [], measurementConfidence: 0.9, limitations: [] }];
  const input = {
    sampleId: 'wp005b-observer-envelope', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: new Uint8Array([1, 2, 3]),
    request: { queryId: 'TEXT_01', category: 'TEXT', task: 'query', question: 'Read the visible text.', reasoningMode: 'DIRECT', regionPolicy: 'CANONICAL' },
  };
  const core = [];
  for (const kind of ['answer', 'chat', 'nested-chat']) {
    const result = await createCloudflareVisionObserver({ ai: { run: async () => observerEnvelope(observations, kind) } }).observe(input);
    assert.equal(result.status, 'SUCCESS', kind);
    core.push(result.observations.map(({ observationId, provider, executionMs, provenance, ...item }) => item));
  }
  assert.deepEqual(core[1], core[0]);
  assert.deepEqual(core[2], core[0]);
});

test('Observer adapter rejects non-text chat blocks without persisting their contents', async () => {
  const privateContent = 'PRIVATE_IMAGE_BLOCK';
  const result = await createCloudflareVisionObserver({
    ai: { run: async () => chatCompletion([{ type: 'image_url', image_url: privateContent }]) },
  }).observe({
    sampleId: 'wp005b-observer-bad-envelope', inputHash: 'b'.repeat(64), mime: 'image/png', bytes: new Uint8Array([1, 2, 3]),
    request: { queryId: 'TEXT_02', category: 'TEXT', task: 'query', question: 'Read the visible text.', reasoningMode: 'DIRECT', regionPolicy: 'CANONICAL' },
  });
  assert.equal(result.status, 'PROVIDER_FAILURE');
  assert.equal(result.responseDiagnostics.messageContentType, 'array');
  assert.equal(JSON.stringify(result).includes(privateContent), false);
});
