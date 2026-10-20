import assert from 'node:assert/strict';
import { verifyTextReviewEvidence } from '../../../packages/authenticity/src/text-review-evidence.ts';

export async function assertTextReviewBundle(client, contentId, sourceEventId, contentType = 'post') {
  const rows = (await client.query(`SELECT r.id AS detector_id,r.signal,c.id AS case_id,d.id AS decision_id,d.outcome,d.decided_by
    FROM moderation.detector_runs r JOIN moderation.cases c ON c.content_type=r.content_type
      AND c.content_id=r.content_id AND c.source_event_id=r.source_event_id
    JOIN moderation.decisions d ON d.case_id=c.id
    WHERE r.content_type=$1 AND r.content_id=$2 AND r.source_event_id=$3`, [contentType, contentId, sourceEventId])).rows;
  assert.equal(rows.length, 1);
  const row = rows[0], evidence = row.signal.textReviewEvidence, link = row.signal.textReviewDecision;
  assert.equal(await verifyTextReviewEvidence(evidence), true);
  assert.equal(evidence.contentType, contentType); assert.equal(evidence.revision.contentId, contentId);
  assert.equal(evidence.revision.sourceEventId, sourceEventId);
  assert.equal(evidence.safety.state, 'ABSTAIN'); assert.equal(evidence.authorship.state, 'ABSTAIN');
  assert.equal(evidence.safety.thresholdVersion, null); assert.equal(evidence.authorship.thresholdVersion, null);
  assert.equal(evidence.publicationEligible, false); assert.equal(link.publicationEligible, false);
  assert.equal(row.outcome, 'queue'); assert.equal(row.decided_by, null);
  assert.equal(link.evidenceHash, evidence.evidenceHash); assert.equal(link.detectorRunId, row.detector_id);
  assert.equal(link.caseId, row.case_id); assert.equal(link.decisionId, row.decision_id);
  return evidence;
}
