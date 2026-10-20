import type { DatabaseClient } from '@lythaus/db';
import { isUuidV7 } from '../../../packages/authenticity/src/uuid.ts';
import { verifyTextReviewEvidence, type TextReviewEvidence } from '../../../packages/authenticity/src/text-review-evidence.ts';

export async function recordTextReviewDecisionEvidence(client: DatabaseClient, input: {
  evidence: TextReviewEvidence;
  caseId: string;
  decisionId: string;
  detectorRunId: string;
}): Promise<void> {
  const { evidence, caseId, decisionId, detectorRunId } = structuredClone(input);
  if (![caseId, decisionId, detectorRunId].every(isUuidV7)
    || !await verifyTextReviewEvidence(evidence)) throw new Error('text_review_evidence_invalid');
  const metadata = { schemaVersion: evidence.schemaVersion, evidenceHash: evidence.evidenceHash,
    contentType: evidence.contentType, revision: evidence.revision, policyVersion: evidence.policyVersion,
    caseId, decisionId, detectorRunId,
    decision: evidence.decision, publicationEligible: false };
  const result = await client.query(
    `UPDATE moderation.detector_runs r
        SET signal = jsonb_set(r.signal, '{textReviewDecision}', $8::jsonb)
       FROM moderation.decisions d
       JOIN moderation.cases c ON c.id = d.case_id
      WHERE d.id = $1 AND c.id = $2 AND c.content_type = $4 AND c.content_id = $5 AND c.source_event_id = $6
        AND r.id = $3 AND r.content_type = c.content_type AND r.content_id = c.content_id AND r.source_event_id = c.source_event_id
        AND c.state = 'open' AND c.policy_version = 'evaluation-only-v1'
        AND d.outcome = 'queue' AND d.decided_by IS NULL AND d.policy_version = 'evaluation-only-v1'
        AND r.signal->'textReviewEvidence'->>'evidenceHash' = $7
        AND r.signal->'textReviewEvidence' = $9::jsonb
        AND (NOT (r.signal ? 'textReviewDecision') OR r.signal->'textReviewDecision' = $8::jsonb)
     RETURNING r.id`,
    [decisionId, caseId, detectorRunId, evidence.contentType, evidence.revision.contentId,
      evidence.revision.sourceEventId, evidence.evidenceHash, JSON.stringify(metadata), JSON.stringify(evidence)],
  );
  if (result.rowCount !== 1) throw new Error('text_review_evidence_binding_unavailable');
}
