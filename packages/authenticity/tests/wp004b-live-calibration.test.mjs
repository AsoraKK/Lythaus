import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import {
  buildJudgeRequest,
  createCloudflareJudgeRest,
  createCloudflareRestTransport,
  createInsufficientEvidenceRecommendation,
} from '../src/wp004a.ts';
import {
  WP004B_CALIBRATED_FIXTURE_VERSION,
  WP004B_LIVE_CASE_IDS,
  assertWp004bExpectationsNotInJudgeRequest,
  buildEvidenceDirectionPolicy,
  createWp004bLiveCalibrationCases,
  evaluateWp004bCaseExpectation,
  evaluateWp004bLiveRecommendation,
} from '../src/wp004b.ts';

const cases = createWp004bLiveCalibrationCases();

function calibratedRecommendation(caseId) {
  return {
    ...createInsufficientEvidenceRecommendation('The calibrated research control provides bounded directional evidence for a localized edit.'),
    primaryHypothesis: 'LOCALLY_MANIPULATED',
    supportingEvidence: [{ evidenceId: `${caseId}:ef5-calibrated`, rationale: 'The versioned calibrated EF5 fixture supports a localized alteration.' }],
    uncertainty: 'MODERATE',
  };
}

function completionFor(recommendation) {
  return {
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(recommendation) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

test('Phase B defines the three ordered cases with deterministic, valid packets', () => {
  assert.deepEqual(cases.map((item) => item.caseId), [...WP004B_LIVE_CASE_IDS]);
  for (const item of cases) {
    assert.equal(item.packet.schemaVersion, 'lythaus-evidence-packet-v1');
    assert.equal(item.packet.enforcementAuthority, false);
    assert.equal(Object.hasOwn(item.packet, 'truth'), false);
    assert.equal(Object.hasOwn(item.packet, 'groundTruth'), false);
    assert.equal(item.packet.caseId, item.caseId);
  }
  assert.equal(cases[0].packet.safetyContext.canonicalResult, 'ALLOW');
  assert.equal(cases[1].packet.safetyContext.canonicalResult, 'BLOCK');
  assert.equal(cases[2].packet.evidence.find((item) => item.name === 'calibrated_local_edit').provenance.modelVersion, WP004B_CALIBRATED_FIXTURE_VERSION);
});

test('Phase B packets are stable and expectations never enter the Judge request', () => {
  const secondBuild = createWp004bLiveCalibrationCases();
  for (let index = 0; index < cases.length; index += 1) {
    assert.equal(JSON.stringify(cases[index].packet), JSON.stringify(secondBuild[index].packet), cases[index].caseId);
    const request = buildJudgeRequest(cases[index].packet);
    assert.doesNotThrow(() => assertWp004bExpectationsNotInJudgeRequest(request, cases[index].expectation));
    const serialized = JSON.stringify(request);
    assert.equal(serialized.includes(cases[index].expectation.evaluationOnlyMarker), false);
    assert.equal(serialized.includes('allowedPrimaryHypotheses'), false);
    assert.equal(serialized.includes('forbiddenSupportingEvidenceIds'), false);
    assert.equal(serialized.includes('expectedViolationCodes'), false);
    assert.equal(request.messages.find((message) => message.role === 'user').content, JSON.stringify(cases[index].packet));
  }
});

test('B1 and B2 contain no SUPPORTS direction, while only calibrated EF5 supports B3', () => {
  for (const item of cases.slice(0, 2)) {
    const classifications = buildEvidenceDirectionPolicy(item.packet);
    assert.ok(classifications.every((classification) => Object.values(classification.directionByHypothesis).every((direction) => direction !== 'SUPPORTS')), item.caseId);
  }
  const calibrated = cases[2];
  const classification = buildEvidenceDirectionPolicy(calibrated.packet).find((item) => item.evidenceId.endsWith(':ef5-calibrated'));
  assert.equal(classification.calibrationStatus, 'CALIBRATED_DIRECTIONAL');
  assert.equal(classification.directionByHypothesis.LOCALLY_MANIPULATED, 'SUPPORTS');
  assert.ok(Object.entries(classification.directionByHypothesis).filter(([, direction]) => direction === 'SUPPORTS').every(([hypothesis]) => hypothesis === 'LOCALLY_MANIPULATED'));
});

test('case expectations remain separate from epistemic policy validity', () => {
  const neutralGood = createInsufficientEvidenceRecommendation();
  for (const item of cases.slice(0, 2)) {
    const epistemic = evaluateWp004bLiveRecommendation(item.packet, neutralGood, item.expectation);
    assert.equal(epistemic.schemaValid, true, item.caseId);
    assert.equal(epistemic.epistemic.valid, true, item.caseId);
    assert.equal(epistemic.expectation.valid, true, item.caseId);
  }

  const b3 = cases[2];
  const goodB3 = calibratedRecommendation(b3.caseId);
  const goodEvaluation = evaluateWp004bLiveRecommendation(b3.packet, goodB3, b3.expectation);
  assert.equal(goodEvaluation.schemaValid, true);
  assert.equal(goodEvaluation.epistemic.valid, true);
  assert.equal(goodEvaluation.expectation.valid, true);

  const neutralSupport = {
    ...neutralGood,
    primaryHypothesis: 'SYNTHETIC',
    supportingEvidence: [{ evidenceId: `${cases[0].caseId}:ef1-format`, rationale: 'The file format is compatible with synthetic content.' }],
  };
  const neutralEvaluation = evaluateWp004bLiveRecommendation(cases[0].packet, neutralSupport, cases[0].expectation);
  assert.equal(neutralEvaluation.schemaValid, true);
  assert.equal(neutralEvaluation.epistemic.valid, false);
  assert.ok(neutralEvaluation.epistemic.violations.includes('EVIDENCE_DIRECTIONALITY_UNSUPPORTED'));
  assert.equal(neutralEvaluation.expectation.valid, false);
});

test('the offline transport harness permits exactly three GPT-OSS calls and no other provider', async () => {
  let fetchCalls = 0;
  const transport = createCloudflareRestTransport({
    apiToken: 'test-token-not-a-secret',
    accountId: 'test-account',
    allowNetwork: true,
    maxRequests: 3,
    fetchImpl: async (url) => {
      fetchCalls += 1;
      assert.match(String(url), /\/ai\/run\/(?:%40|@)cf\/openai\/gpt-oss-20b$/);
      const item = cases[fetchCalls - 1];
      const recommendation = fetchCalls === 3 ? calibratedRecommendation(item.caseId) : createInsufficientEvidenceRecommendation();
      return new Response(JSON.stringify({ success: true, result: completionFor(recommendation) }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const judge = createCloudflareJudgeRest({ transport });
  const results = [];
  for (const item of cases) results.push(await judge.judge({ packet: item.packet }));
  assert.equal(fetchCalls, 3);
  assert.equal(transport.snapshot().calls, 3);
  assert.equal(transport.snapshot().invocations.filter((item) => item.status === 'SUCCESS').length, 3);
  assert.equal(results[0].status, 'SUCCESS');
  assert.equal(results[1].status, 'SUCCESS');
  assert.equal(results[2].recommendation.primaryHypothesis, 'LOCALLY_MANIPULATED');
  const evaluation = evaluateWp004bLiveRecommendation(cases[2].packet, results[2].recommendation, cases[2].expectation);
  assert.equal(evaluation.epistemic.valid, true);
  assert.equal(evaluation.expectation.valid, true);
});

test('calibrated EF5 is directional only for the intended hypothesis', () => {
  const item = cases[2];
  const candidate = {
    ...calibratedRecommendation(item.caseId),
    primaryHypothesis: 'SYNTHETIC',
  };
  const result = evaluateWp004bCaseExpectation(item.packet, candidate, item.expectation);
  assert.equal(result.valid, false);
  assert.ok(result.violations.includes('PRIMARY_HYPOTHESIS_EXPECTATION_MISMATCH'));
  const epistemic = evaluateWp004bLiveRecommendation(item.packet, candidate, item.expectation);
  assert.equal(epistemic.epistemic.valid, false);
  assert.ok(epistemic.epistemic.violations.includes('EVIDENCE_DIRECTIONALITY_UNSUPPORTED'));
});

test('Phase B workflow is manual, GPT-OSS-only, and does not inject OpenAI credentials', async () => {
  const workflow = await readFile(path.resolve(' .github/workflows/wp004b-judge-calibration.yml'.trim()), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /structured_output_mode:/);
  assert.match(workflow, /type: choice/);
  assert.match(workflow, /--structured-output-mode.*inputs\.structured_output_mode/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /wp004b-live-calibration/);
  assert.match(workflow, /Finalize sanitized budget accounting/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /wp004b-budget-finalizer/);
  assert.match(workflow, /Stage sanitized calibration artifacts/);
  assert.match(workflow, /target="wp004b-sanitized-artifacts"/);
  assert.match(workflow, /final-result\.json/);
  assert.match(workflow, /call-accounting\.json/);
  assert.match(workflow, /budget-finalizer\.json/);
  assert.match(workflow, /path: wp004b-sanitized-artifacts/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /path: \.artifacts\s*\n/);
});

test('live runner declares its sanitized report and budget dependencies', async () => {
  const runner = await readFile(path.resolve('scripts/authenticity/wp004b-judge-calibration.mjs'), 'utf8');
  assert.match(runner, /createWp004bBudgetLedger/);
  assert.match(runner, /writeWp004bAtomicJson/);
  assert.match(runner, /WP004B_LIVE_CALIBRATION_SCHEMA_VERSION,\s*createWp004bBudgetLedger/);
  assert.match(runner, /ledger\.reserveCall\(currentCaseId\)/);
  assert.match(runner, /--structured-output-mode/);
  assert.match(runner, /structuredOutputMode/);
  assert.match(runner, /createCloudflareJudgeRest\(\{ transport, model: GPT_OSS_MODEL, structuredOutputMode/);
  assert.match(runner, /schemaFingerprint/);
  assert.match(runner, /structuredOutputMode === 'JSON_SCHEMA'/);
  assert.match(runner, /HTTP_FAILURE/);
  assert.match(runner, /RESPONSE_MISSING/);
  assert.match(runner, /finally\s*\{/);
});
