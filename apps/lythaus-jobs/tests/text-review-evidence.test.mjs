import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordTextReviewDecisionEvidence } from '../src/text-review-evidence.ts';
import { createTextReviewEvidence } from '../../../packages/authenticity/src/text-review-evidence.ts';

const id = suffix => '019a0000-0000-7000-8000-' + suffix.toString().padStart(12, '0');
async function input(contentType = 'post') {
  return { evidence: await createTextReviewEvidence({ contentType, revision: {
    contentId: id(1), sourceEventId: id(2), bodyHash: 'a'.repeat(64), declaredCreationMode: 'human',
  } }), caseId: id(3), decisionId: id(4), detectorRunId: id(5) };
}

for (const type of ['post', 'comment']) test(`${type} linkage records exact persisted decision and detector identity`, async () => {
  let call;
  const value = await input(type);
  await recordTextReviewDecisionEvidence({ query: async (sql, parameters) => { call = { sql, parameters }; return { rowCount: 1 }; } }, value);
  const metadata = JSON.parse(call.parameters[7]);
  assert.equal(metadata.evidenceHash, value.evidence.evidenceHash);
  assert.equal(metadata.caseId, value.caseId); assert.equal(metadata.decisionId, value.decisionId);
  assert.equal(metadata.detectorRunId, value.detectorRunId); assert.equal(metadata.contentType, type);
  assert.equal(metadata.publicationEligible, false); assert.deepEqual(metadata.revision, value.evidence.revision);
  assert.deepEqual(JSON.parse(call.parameters[8]), value.evidence);
  assert.match(call.sql, /d\.outcome = 'queue' AND d\.decided_by IS NULL/);
  assert.match(call.sql, /r\.signal->'textReviewEvidence' = \$9::jsonb/);
});

test('missing, mismatched or terminal decision/detector linkage fails the enclosing transaction', async () => {
  await assert.rejects(recordTextReviewDecisionEvidence({ query: async () => ({ rowCount: 0 }) }, await input()), /text_review_evidence_binding_unavailable/);
});

test('database interruption propagates for caller rollback and inbox retry', async () => {
  const error = new Error('synthetic interrupted write');
  await assert.rejects(recordTextReviewDecisionEvidence({ query: async () => { throw error; } }, await input()), actual => actual === error);
});

test('evidence tampering is rejected before any SQL', async () => {
  const value = await input(); value.evidence.revision.bodyHash = 'b'.repeat(64);
  await assert.rejects(recordTextReviewDecisionEvidence({ query: () => assert.fail('must not query') }, value), /text_review_evidence_invalid/);
});

for (const field of ['caseId', 'decisionId', 'detectorRunId']) test(`invalid ${field} cannot reach persistence`, async () => {
  const value = await input(); value[field] = 'unbound';
  await assert.rejects(recordTextReviewDecisionEvidence({ query: () => assert.fail('must not query') }, value), /text_review_evidence_invalid/);
});
