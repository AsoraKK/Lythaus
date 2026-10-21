import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAuthenticity } from '../src/index.ts';
import { createTextReviewEvidence } from '../src/text-review-evidence.ts';

test('normalizes model evidence and remains evaluation-only', async () => {
  const result = await evaluateAuthenticity({
    kind: 'text',
    content: 'sanitized fixture',
    contentId: '018f0000-0000-7000-8000-000000000001',
    declaredCreationMode: 'human',
    runModel: async () => ({ response: JSON.stringify({ riskScore: 0.2, signals: [{ category: 'authorship_mismatch', confidence: 0.4, rationale: 'Needs review.' }] }) }),
  });
  assert.equal(result.recommendation, 'review');
  assert.equal(result.reviewRequired, true);
  assert.equal(result.riskScore, 0.2);
  assert.equal(result.signals[0].category, 'authorship_mismatch');
});

test('malformed provider output stays unavailable and cannot become an observed authorship or safety result', async () => {
  const valid = { riskScore: 0.2, signals: [{ category: 'synthetic_fixture', confidence: 0.4, rationale: 'Needs review.' }] };
  const malformed = [null, true, 0, [], {}, { ...valid, riskScore: '0.2' }, { ...valid, riskScore: -1 },
    { ...valid, riskScore: 2 }, { ...valid, signals: null }, { ...valid, signals: [null] },
    { ...valid, signals: [{ ...valid.signals[0], confidence: '0.4' }] },
    { ...valid, signals: [{ ...valid.signals[0], confidence: 2 }] },
    { ...valid, signals: [{ ...valid.signals[0], category: '' }] },
    { ...valid, signals: [{ ...valid.signals[0], rationale: null }] },
    { ...valid, signals: Array.from({ length: 21 }, () => valid.signals[0]) }];
  for (const raw of [...malformed.map(value => JSON.stringify(value)), 'invalid JSON']) {
    const evaluation = await evaluateAuthenticity({ kind: 'text', content: 'sanitized fixture',
      contentId: '019a0000-0000-7000-8000-000000000001', runModel: async () => ({ response: raw }) });
    assert.equal(evaluation.recommendation, 'review');
    assert.equal(evaluation.reviewRequired, true);
    assert.equal(evaluation.riskScore, 1);
    assert.equal(evaluation.signals[0].category, 'model_response_invalid');
    const evidence = await createTextReviewEvidence({ contentType: 'post', revision: {
      contentId: '019a0000-0000-7000-8000-000000000001', sourceEventId: '019a0000-0000-7000-8000-000000000002',
      bodyHash: 'a'.repeat(64), declaredCreationMode: 'human',
    }, observation: { evaluation, modelExecuted: true } });
    assert.deepEqual(evidence.reasoning, { state: 'UNAVAILABLE', modelVersion: null, responseHash: null });
    assert.equal(evidence.authorship.state, 'ABSTAIN');
    assert.equal(evidence.safety.state, 'ABSTAIN');
    assert.equal(evidence.publicationEligible, false);
  }
});
