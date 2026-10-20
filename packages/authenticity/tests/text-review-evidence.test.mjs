import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createTextReviewEvidence, verifyTextReviewEvidence } from '../src/text-review-evidence.ts';

const revision = { contentId: '019a0000-0000-7000-8000-000000000001',
  sourceEventId: '019a0000-0000-7000-8000-000000000002', bodyHash: 'a'.repeat(64), declaredCreationMode: 'human' };
const evaluation = { schemaVersion: 'lythaus-authenticity-v1', recommendation: 'review', reviewRequired: true,
  riskScore: 0.1, signals: [{ category: 'synthetic_fixture', confidence: 0.9, rationale: 'private-fixture-rationale' }],
  modelId: 'synthetic-model-v1', policyVersion: 'evaluation-only-v1' };
const input = () => ({ contentType: 'post', revision: { ...revision }, observation: { evaluation: structuredClone(evaluation), modelExecuted: true } });

function withheld(value) {
  assert.equal(value.decision, 'queue');
  assert.equal(value.safety.state, 'ABSTAIN'); assert.equal(value.authorship.state, 'ABSTAIN');
  assert.equal(value.safety.thresholdVersion, null); assert.equal(value.authorship.thresholdVersion, null);
  for (const key of ['publicationEligible', 'discoveryEligible', 'reputationEligible']) assert.equal(value[key], false);
}

test('canonical evidence is deterministic, private, and separately binds both abstaining axes', async () => {
  const first = await createTextReviewEvidence(input());
  const reordered = input();
  reordered.revision = Object.fromEntries(Object.entries(reordered.revision).reverse());
  reordered.observation.evaluation = Object.fromEntries(Object.entries(reordered.observation.evaluation).reverse());
  reordered.observation.evaluation.signals[0] = Object.fromEntries(Object.entries(reordered.observation.evaluation.signals[0]).reverse());
  assert.deepEqual(await createTextReviewEvidence(reordered), first);
  assert.equal(await verifyTextReviewEvidence(JSON.parse(JSON.stringify(first))), true);
  const { evidenceHash, ...payload } = first;
  assert.equal(evidenceHash, createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
  assert.ok(!JSON.stringify(first).includes('private-fixture-rationale'));
  assert.ok(!JSON.stringify(first).includes('synthetic_fixture'));
  withheld(first);
});

for (const [field, value] of Object.entries({ contentId: '019a0000-0000-7000-8000-000000000003',
  sourceEventId: '019a0000-0000-7000-8000-000000000004', bodyHash: 'b'.repeat(64), declaredCreationMode: 'ai_assisted' })) {
  test(`exact ${field} changes the evidence binding`, async () => {
    const original = await createTextReviewEvidence(input()), changed = input(); changed.revision[field] = value;
    assert.notEqual((await createTextReviewEvidence(changed)).evidenceHash, original.evidenceHash);
    original.revision[field] = value;
    assert.equal(await verifyTextReviewEvidence(original), false);
  });
}

for (const change of [value => { value.contentType = 'comment'; }, value => { value.observation.evaluation.modelId = 'synthetic-v2'; },
  value => { value.observation.evaluation.riskScore = 0.2; }, value => { value.observation.evaluation.signals[0].rationale = 'changed'; }]) {
  test('content type, model and normalized response participate in the binding', async () => {
    const original = await createTextReviewEvidence(input()), changed = input(); change(changed);
    const result = await createTextReviewEvidence(changed);
    assert.notEqual(result.evidenceHash, original.evidenceHash); withheld(result);
  });
}

for (const modelExecuted of [false, true]) test(`provider execution=${modelExecuted} cannot qualify authorship or safety`, async () => {
  const value = input(); value.observation.modelExecuted = modelExecuted;
  const result = await createTextReviewEvidence(value);
  assert.equal(result.reasoning.state, modelExecuted ? 'OBSERVED_UNQUALIFIED' : 'UNAVAILABLE');
  if (!modelExecuted) assert.deepEqual(result.reasoning, { state: 'UNAVAILABLE', modelVersion: null, responseHash: null });
  withheld(result);
});

test('comments with no provider observation record NOT_RUN and queue only', async () => {
  const result = await createTextReviewEvidence({ contentType: 'comment', revision });
  assert.deepEqual(result.reasoning, { state: 'NOT_RUN', modelVersion: null, responseHash: null });
  withheld(result);
});

for (const alter of [value => { value.riskScore = NaN; }, value => { value.signals[0].confidence = Infinity; },
  value => { value.recommendation = 'allow'; }, value => { value.schemaVersion = 'unknown'; },
  value => { value.signals[0].category = 'model_response_invalid'; }]) test('malformed or failed normalized response remains unavailable', async () => {
  const value = input(); alter(value.observation.evaluation);
  const result = await createTextReviewEvidence(value); assert.equal(result.reasoning.state, 'UNAVAILABLE'); withheld(result);
});

for (const [field, invalid] of Object.entries({ contentId: 'wrong', sourceEventId: 'wrong', bodyHash: 'wrong', declaredCreationMode: 'ai_generated' })) {
  test(`invalid ${field} cannot create ordinary-publication evidence`, async () => {
    const value = input(); value.revision[field] = invalid;
    await assert.rejects(createTextReviewEvidence(value), /text_review_revision_invalid/);
  });
}

for (const field of ['publicationEligible', 'discoveryEligible', 'reputationEligible']) test(`forged ${field} invalidates evidence`, async () => {
  const value = await createTextReviewEvidence(input()); value[field] = true;
  assert.equal(await verifyTextReviewEvidence(value), false);
});

for (const field of ['safety', 'authorship']) test(`forged ${field} approval or threshold is rejected`, async () => {
  const value = await createTextReviewEvidence(input()); value[field].state = 'ALLOW';
  assert.equal(await verifyTextReviewEvidence(value), false);
  value[field].state = 'ABSTAIN'; value[field].thresholdVersion = 'invented-calibration';
  assert.equal(await verifyTextReviewEvidence(value), false);
});

test('caller mutation during hashing cannot replace the revision or normalized observation', async () => {
  const value = input(), expected = await createTextReviewEvidence(input());
  const pending = createTextReviewEvidence(value);
  value.revision.bodyHash = 'c'.repeat(64); value.observation.evaluation.modelId = 'changed-after-call';
  value.observation.evaluation.signals[0].rationale = 'changed-after-call';
  assert.deepEqual(await pending, expected);
});
