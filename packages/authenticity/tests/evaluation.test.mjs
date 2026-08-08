import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAuthenticity } from '../src/index.ts';

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
