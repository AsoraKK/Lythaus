import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WP005A_JUDGE_PROMPT_VERSION,
  WP005A_LEDGER_SCHEMA_VERSION,
  WP005A_MAX_LIVE_WORKERS_AI_REQUESTS,
  WP005A_MAX_ESTIMATED_NEURONS,
  Wp005aBudget,
  applyWp005aRoutingGate,
  buildWp005aJudgeRequest,
  compileEpistemicLedger,
  createWp005aJudgeCases,
  evaluateWp005aRouting,
  getWp005aCandidateRegistry,
  runWp005aJudgeAttempt,
} from '../src/wp005a.ts';
import { createCloudflareVisionObserverRest } from '../src/vision-observer.ts';

const cases = createWp005aJudgeCases();

test('WP005A creates a 16-case blind Judge benchmark with neutral model input', () => {
  assert.equal(WP005A_JUDGE_PROMPT_VERSION, 'lythaus-research-adjudicator-prompt-v1');
  assert.equal(cases.length, 16);
  const request = buildWp005aJudgeRequest(cases[0].packet);
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.temperature, 0);
  assert.equal(request.stream, false);
  assert.doesNotMatch(request.messages[1].content, /"(?:expectedPrimary|caseExpectation|passCriteria|groundTruth|truth)"\s*:/);
  assert.match(request.messages[0].content, /independent origin axes/);
});

test('Epistemic Compiler preserves packet v1, safety isolation, and no hidden oracle fields', () => {
  const packetBefore = JSON.stringify(cases[10].packet);
  const ledger = compileEpistemicLedger(cases[10].packet);
  assert.equal(ledger.schemaVersion, WP005A_LEDGER_SCHEMA_VERSION);
  assert.equal(ledger.enforcementAuthority, false);
  assert.equal(ledger.safetyContext.role, 'SAFETY_CONTEXT_ONLY');
  assert.equal(ledger.safetyContext.excludedFromOriginInference, true);
  assert.equal(ledger.independentOriginAxes.relationship, 'INDEPENDENT_AXES');
  assert.equal(JSON.stringify(cases[10].packet), packetBefore);
  assert.notEqual(cases[10].packet.caseId, cases[10].caseId);
  assert.doesNotMatch(JSON.stringify(cases[10].packet), /camera-capture-synthetic/);
  assert.doesNotMatch(JSON.stringify(ledger), /expectedPrimary|caseExpectation|passCriteria|groundTruth/);
  const synthetic = ledger.evidence.find((item) => item.family === 'EF3_GENERATIVE_FORENSICS');
  assert.deepEqual(synthetic.supportedHypotheses, ['SYNTHETIC', 'CAMERA_CAPTURE_OF_SYNTHETIC']);
});

test('deterministic-only routing is measurable and never resolves a conflict unsafely', () => {
  const conservative = evaluateWp005aRouting(cases, 'CONSERVATIVE_GATE');
  const selective = evaluateWp005aRouting(cases, 'SELECTIVE_RESOLUTION_GATE');
  assert.equal(conservative.incorrectDeterministicResolutions, 0);
  assert.equal(selective.incorrectDeterministicResolutions, 0);
  assert.ok(selective.resolvedWithoutLlm > conservative.resolvedWithoutLlm);
  assert.equal(selective.results.find((item) => item.caseId === 'calibrated-local-edit').primaryHypothesis, 'LOCALLY_MANIPULATED');
  assert.equal(selective.results.find((item) => item.caseId === 'conflicting-calibrated').route, 'ESCALATE');
  assert.equal(selective.results.find((item) => item.caseId === 'camera-capture-synthetic').route, 'ESCALATE');
});

test('budget reservations fail closed before a provider send and stay within hard caps', () => {
  const candidate = getWp005aCandidateRegistry().find((item) => item.candidate === 'qwen3-30b-a3b-fp8');
  assert.ok(candidate);
  const budget = new Wp005aBudget({ maxRequests: 2, maxEstimatedNeurons: WP005A_MAX_ESTIMATED_NEURONS, maxEstimatedCostUsd: 0.15 });
  budget.reserve(candidate, { kind: 'JUDGE', inputText: 'small packet', maxOutputTokens: 2400 });
  budget.reserve(candidate, { kind: 'JUDGE', inputText: 'small packet', maxOutputTokens: 2400 });
  assert.equal(budget.snapshot().reservedRequests, 2);
  assert.equal(budget.snapshot().remainingRequests, 0);
  assert.throws(() => budget.reserve(candidate, { kind: 'JUDGE', inputText: 'small packet', maxOutputTokens: 2400 }), /request_cap/);
  assert.ok(budget.snapshot().reservedEstimatedNeurons <= WP005A_MAX_ESTIMATED_NEURONS);
  assert.equal(WP005A_MAX_LIVE_WORKERS_AI_REQUESTS, 80);
});

test('Judge adapter records one no-retry canonical attempt without persisting reasoning', async () => {
  const candidate = getWp005aCandidateRegistry().find((item) => item.candidate === 'gpt-oss-20b');
  const testCase = cases.find((item) => item.caseId === 'calibrated-local-edit');
  assert.ok(candidate && testCase);
  const recommendation = applyWp005aRoutingGate(testCase.packet, 'SELECTIVE_RESOLUTION_GATE').recommendation;
  let sends = 0;
  const transport = {
    isLive: true,
    async run() { sends += 1; return { httpStatus: 200, executionMs: 3, result: { response: JSON.stringify(recommendation), reasoning: 'PRIVATE_REASONING' } }; },
    snapshot() { return { calls: sends, successes: sends, providerFailures: 0, invocations: [] }; },
  };
  const attempt = await runWp005aJudgeAttempt({ candidate, stage: 'TEST', caseId: testCase.caseId, packet: testCase.packet, transport, budget: new Wp005aBudget() });
  assert.equal(sends, 1);
  assert.equal(attempt.record.canonicalSuccess, true);
  assert.equal(attempt.record.retryCount, 0);
  assert.equal(attempt.record.reasoningMode, 'DEFAULT_PROVIDER_REASONING');
  assert.equal(Object.hasOwn(attempt.record, 'reasoning'), false);
  assert.equal(attempt.recommendation.primaryHypothesis, 'LOCALLY_MANIPULATED');
});

test('Observer research adapter permits native multimodal payloads without changing canonical observations', async () => {
  let capturedPayload = null;
  const transport = {
    isLive: true,
    async run(input) {
      capturedPayload = input.payload;
      return {
        httpStatus: 200,
        executionMs: 2,
        result: {
          answer: JSON.stringify({ observations: [{
            category: 'TEXT', applicable: true, status: 'OBSERVED', observation: 'LYTHAUS AUTHENTICITY is visible.', regions: [], measurementConfidence: 0.9, limitations: [],
          }] }),
        },
      };
    },
    snapshot() { return { calls: 1, successes: 1, providerFailures: 0, invocations: [] }; },
  };
  const observer = createCloudflareVisionObserverRest({
    transport,
    model: '@cf/meta/llama-4-scout-17b-16e-instruct',
    payloadBuilder: (_input, request, image) => ({
      messages: [{ role: 'user', content: request.question }], image, temperature: 0, max_tokens: 1200, stream: false,
    }),
  });
  const result = await observer.observe({
    sampleId: 'wp005a-observer-contract', inputHash: 'a'.repeat(64), mime: 'image/png', bytes: new Uint8Array([1, 2, 3]),
    request: { queryId: 'TEXT_01', category: 'TEXT', task: 'query', question: 'Read the visible text.', reasoningMode: 'DIRECT', regionPolicy: 'CANONICAL' },
  });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.observations[0].observation, 'LYTHAUS AUTHENTICITY is visible.');
  assert.equal(capturedPayload.messages[0].role, 'user');
  assert.match(capturedPayload.image, /^data:image\/png;base64,/);
  assert.equal(capturedPayload.temperature, 0);
  assert.equal(capturedPayload.stream, false);
});
