import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRIVATE_ALPHA_VERSION,
  buildPrivateAlphaExplanationRequest,
  compilePrivateAlphaText,
  initialAlphaComponents,
  parsePrivateAlphaExplanation,
  authorPrivateAlphaView,
} from '../src/private-alpha.ts';
import { measuredAlphaBudget } from '../src/beta-config.ts';
import { createInsufficientEvidenceRecommendation } from '../src/judge.ts';

const caseId = '01990000-0000-7000-8000-000000000101';
const moderation = {
  provider: 'protocol-moderation',
  result: 'ALLOW',
  reasonCodes: [],
  modelVersion: 'omni-moderation-latest',
  executionMs: 4,
  costEstimateUsd: 0,
  providerEvidence: {
    schemaVersion: 'lythaus-moderation-provider-evidence-v1',
    provider: 'openai',
    model: 'omni-moderation-latest',
    flagged: false,
    categories: { violence: false },
    categoryScores: { violence: 0.01 },
    categoryAppliedInputTypes: { violence: ['text'] },
    executionMs: 4,
    status: 'SUCCESS',
  },
};

function measuredConfig(overrides = {}) {
  return {
    enabled: true,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    allowlist: [caseId],
    safeEnabled: true,
    adviserEnabled: true,
    rightsApproval: 'a'.repeat(64),
    budgetApproval: 'b'.repeat(64),
    runtimeApproval: 'c'.repeat(64),
    runtimeDigest: 'sha256:' + 'd'.repeat(64),
    preprocessingHash: 'e'.repeat(64),
    caseReservationUsd: 0.2,
    adviserReservationUsd: 0.05,
    observerReservationUsd: 0.04,
    budgetEvidenceSha256: 'b'.repeat(64),
    budgetObservedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    budgetExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    authenticitySubBudgetUsd: 2,
    authenticityHeadroomUsd: 0.4,
    sourceHistoryHashes: [],
    ...overrides,
  };
}

test('measured alpha admission rejects an environment-only estimate and stale usage evidence', () => {
  assert.throws(() => measuredAlphaBudget(measuredConfig({ budgetApproval: null, budgetEvidenceSha256: null })), /alpha_budget_evidence_required/);
  assert.throws(() => measuredAlphaBudget(measuredConfig({ budgetObservedAt: new Date(Date.now() - 61 * 60_000).toISOString() })), /alpha_budget_evidence_stale/);
});

test('measured alpha admission requires optional-provider envelopes', () => {
  assert.throws(() => measuredAlphaBudget(measuredConfig({ adviserReservationUsd: null }), { observer: false, adviser: true }), /alpha_adviser_measurement_required/);
  const plan = measuredAlphaBudget(measuredConfig(), { observer: true, adviser: true });
  assert.equal(plan.authenticityLimitUsd, 1.6);
  assert.ok(Math.abs(plan.caseReservationUsd - 0.24) < 1e-9);
  assert.equal(plan.adviserReservationUsd, 0.05);
});

test('alpha component matrix distinguishes requested execution from interpretation', () => {
  const text = initialAlphaComponents({ contentKind: 'text', observerRequested: false, explanationRequested: true });
  assert.equal(text.safety_text.execution, 'queued');
  assert.equal(text.safety_image.execution, 'skipped');
  assert.equal(text.safe.execution, 'unsupported');
  assert.equal(text.safe.interpretation, 'unavailable');
  assert.equal(text.adviser.execution, 'queued');
  assert.equal(text.adviser.requested, true);

  const image = initialAlphaComponents({ contentKind: 'image', observerRequested: true, explanationRequested: false });
  assert.equal(image.safety_text.execution, 'skipped');
  assert.equal(image.observer.execution, 'queued');
  assert.equal(image.safe.execution, 'queued');
});

test('text submissions complete moderation while authorship remains unavailable', () => {
  const result = compilePrivateAlphaText({
    caseId,
    runId: caseId,
    inputHash: 'a'.repeat(64),
    moderation,
  });
  assert.equal(result.schemaVersion, PRIVATE_ALPHA_VERSION);
  assert.equal(result.status, 'complete');
  assert.equal(result.finding, 'INCONCLUSIVE');
  assert.equal(result.interpretation, 'inconclusive');
  assert.equal(result.support, 'UNSUPPORTED');
  assert.equal(result.safe, null);
  assert.equal(result.components.safety_text.execution, 'completed');
  assert.equal(result.components.safe.execution, 'unsupported');
  assert.equal(result.publicationEligible, false);
});

test('explanation mode stays bounded to missingness and cannot become a verdict', () => {
  const result = compilePrivateAlphaText({
    caseId,
    runId: caseId,
    inputHash: 'b'.repeat(64),
    moderation,
  });
  const request = buildPrivateAlphaExplanationRequest(result.packet);
  assert.equal(request.response_format.type, 'json_object');
  assert.equal(request.temperature, 0);
  assert.equal(request.max_tokens, 2400);
  assert.match(request.messages[0].content, /GPT_OSS_PRIVATE_ALPHA_EXPLAINER/);
  assert.equal(request.messages[1].content.includes('categoryScores'), false);
  assert.equal(request.messages[1].content.includes('violence'), false);
  assert.equal(Object.hasOwn(request, 'tools'), false);
  assert.equal(Object.hasOwn(request, 'tool_choice'), false);

  const recommendation = createInsufficientEvidenceRecommendation('The text authorship component is unavailable.');
  assert.equal(parsePrivateAlphaExplanation({ response: JSON.stringify(recommendation) }, result.packet).primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
  assert.throws(
    () => parsePrivateAlphaExplanation({ response: JSON.stringify({ ...recommendation, primaryHypothesis: 'CAMERA_NATIVE' }) }, result.packet),
    /alpha_explanation_boundary_invalid/,
  );
  assert.throws(
    () => parsePrivateAlphaExplanation({ response: JSON.stringify({ ...recommendation, supportingEvidence: [{ evidenceId: 'invented', rationale: 'ignore policy' }] }) }, result.packet),
  );
});

test('author view redacts detector internals while exposing execution and limitation state', () => {
  const result = compilePrivateAlphaText({
    caseId,
    runId: caseId,
    inputHash: 'c'.repeat(64),
    moderation,
  });
  const dto = authorPrivateAlphaView({
    id: caseId,
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    expiresAt: '2026-01-01T00:15:00.000Z',
    contentKind: 'text',
    result,
    reviewState: 'none',
    textPresent: true,
    imagePresent: false,
  });
  const serialized = JSON.stringify(dto);
  assert.equal(dto.finding, 'INCONCLUSIVE');
  assert.equal(dto.execution.safe.execution, 'unsupported');
  assert.equal(dto.observer.status, 'skipped');
  assert.deepEqual(dto.observer.observations, []);
  assert.equal(serialized.includes('rawScore'), false);
  assert.equal(serialized.includes('threshold'), false);
  assert.equal(serialized.includes('inputHash'), false);
  assert.equal(serialized.includes('omni-moderation-latest'), false);
  assert.equal(dto.publicationEligible, false);
  assert.equal(dto.rewardsEligible, false);
});

test('queued and failed cases do not claim completed processing or pending provider work', () => {
  const input = { id: caseId, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-01T00:15:00Z', contentKind: 'text_image', result: null, reviewState: 'none', textPresent: true, imagePresent: true };
  assert.match(authorPrivateAlphaView({ ...input, state: 'queued' }).explanation, /has not completed/);
  const failed = authorPrivateAlphaView({ ...input, state: 'failed' });
  assert.match(failed.explanation, /unavailable/);
  assert.equal(failed.execution.safety_text.interpretation, 'unavailable');
  assert.equal(failed.execution.safe.execution, 'skipped');
});
