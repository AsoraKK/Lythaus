import { transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { isUuidV7 } from '../../../packages/authenticity/src/uuid.ts';
import { identicalCommunityAppealOverride } from '../../../packages/db/src/community-appeal-closure.ts';
import type { PostSafetyOutcome } from './post-safety-evidence.ts';
import { isCurrentContentModerationRevision, parseContentModerationRevision, type ContentModerationRevision } from './runtime-policy.ts';

export interface PublishingPost {
  id: string;
  author_id: string;
  body: string;
  declared_creation_mode: 'human' | 'ai_assisted' | 'ai_generated';
  moderation_state: string;
  deleted_at: string | null;
  moderation_source_event_id: string | null;
  author_status: string;
  author_deleted_at: string | null;
}

export type PostPublishingSnapshot =
  | { state: 'current'; post: PublishingPost }
  | { state: 'stale'; reason: 'invalid_event' | 'revision_changed' | 'account_inactive' | 'source_event_mismatch' | 'author_changed' }
  | { state: 'protected'; reason: 'scoped_peer_override' | 'independent_hold' };

export async function withPostPublishingAccountLock(binding: HyperdriveBinding, authorId: string, work: () => Promise<boolean>): Promise<boolean> {
  return transaction(binding, async client => {
    const account = (await client.query<{ status: string; deleted_at: string | null }>(
      `SELECT status, deleted_at FROM identity.users WHERE id = $1 FOR SHARE`, [authorId],
    )).rows[0];
    if (!account || account.status !== 'active' || account.deleted_at !== null) return false;
    return work();
  });
}

export async function readPostPublishingSnapshot(client: DatabaseClient, input: {
  revision: ContentModerationRevision;
  eventType: unknown;
  communityAppealsEnabled: boolean;
  hashBody(body: string): Promise<string>;
  lock?: boolean;
  expectedAuthorId?: string;
}): Promise<PostPublishingSnapshot> {
  const { revision } = input;
  if (!isUuidV7(revision.contentId) || !isUuidV7(revision.sourceEventId)
    || !['content.post.created', 'content.post.updated'].includes(String(input.eventType))) {
    return { state: 'stale', reason: 'invalid_event' };
  }
  const post = (await client.query<PublishingPost>(
    `SELECT post.id, post.author_id, post.body, post.declared_creation_mode, post.moderation_state,
            post.deleted_at, post.moderation_source_event_id, author.status AS author_status,
            author.deleted_at AS author_deleted_at
       FROM content.posts post JOIN identity.users author ON author.id = post.author_id
      WHERE post.id = $1 ${input.lock ? 'FOR UPDATE OF post' : ''}`, [revision.contentId],
  )).rows[0];
  if (!post) return { state: 'stale', reason: 'revision_changed' };
  if (post.author_status !== 'active' || post.author_deleted_at !== null) return { state: 'stale', reason: 'account_inactive' };
  if (input.expectedAuthorId !== undefined && post.author_id !== input.expectedAuthorId) return { state: 'stale', reason: 'author_changed' };
  const source = (await client.query<{
    id: string; event_type: string; aggregate_type: string; aggregate_id: string; actor_id: string | null; payload: unknown;
  }>(`SELECT id, event_type, aggregate_type, aggregate_id, actor_id, payload FROM system.outbox_events WHERE id = $1`,
  [revision.sourceEventId])).rows[0];
  let sourceRevision: ContentModerationRevision;
  try { sourceRevision = parseContentModerationRevision({ eventId: source?.id, payload: source?.payload, contentIdField: 'postId' }); }
  catch { return { state: 'stale', reason: 'source_event_mismatch' }; }
  if (!source || source.event_type !== input.eventType || source.aggregate_type !== 'post'
    || source.aggregate_id !== post.id || source.actor_id !== post.author_id || !sameRevision(revision, sourceRevision)) {
    return { state: 'stale', reason: 'source_event_mismatch' };
  }
  const canonical = { contentId: post.id, sourceEventId: post.moderation_source_event_id,
    declaredCreationMode: post.declared_creation_mode, bodyHash: await input.hashBody(post.body),
    moderationState: post.moderation_state, deletedAt: post.deleted_at };
  if (!isCurrentContentModerationRevision({ revision, canonical: { ...canonical, moderationState: 'under_review' } })) {
    return { state: 'stale', reason: 'revision_changed' };
  }
  if (input.communityAppealsEnabled && await identicalCommunityAppealOverride(client, {
    contentType: 'post', contentId: post.id, sourceEventId: revision.sourceEventId,
    body: post.body, declaredCreationMode: post.declared_creation_mode,
  })) return { state: 'protected', reason: 'scoped_peer_override' };
  const hold = await client.query(`SELECT 1 FROM moderation.cases c JOIN LATERAL (
      SELECT outcome, policy_version FROM moderation.decisions WHERE case_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) d ON true WHERE c.content_type = 'post' AND c.content_id = $1 AND c.source_event_id = $2
      AND c.state <> 'superseded' AND d.outcome IN ('block', 'queue')
      AND NOT (d.outcome = 'queue' AND d.policy_version = 'evaluation-only-v1') LIMIT 1`,
  [revision.contentId, revision.sourceEventId]);
  if (hold.rowCount) return { state: 'protected', reason: 'independent_hold' };
  if (!isCurrentContentModerationRevision({ revision, canonical })) return { state: 'stale', reason: 'revision_changed' };
  return { state: 'current', post };
}

export type PostPublishingStage = 'provenance' | 'specialist' | 'behaviour' | 'reasoning';
export type PostPublishingStageOutcome =
  | { state: 'unavailable' }
  | { state: 'uncertain'; revision: ContentModerationRevision; componentVersion: string }
  | { state: 'result'; revision: ContentModerationRevision; componentVersion: string; outcome: 'pass' | 'review' | 'block' };

export interface PostPublishingPolicyInput {
  policyVersion: string;
  thresholdVersion: string | null;
  revision: ContentModerationRevision;
  outcome: 'ALLOW' | 'REVIEW' | 'BLOCK' | 'NOT_RUN';
}

export interface PostPublishingAssessment {
  schemaVersion: 'lythaus-post-publishing-assessment-v1';
  applicability: 'evaluation-only';
  revision: ContentModerationRevision;
  policyVersion: string;
  thresholdVersion: string | null;
  state: 'pass' | 'review' | 'block' | 'unknown';
  reasonCodes: readonly string[];
  publicationEligible: false;
  discoveryEligible: false;
  reputationEligible: false;
  persisted: false;
}

function sameRevision(left: ContentModerationRevision, right: ContentModerationRevision): boolean {
  return Boolean(left && right) && left.contentId === right.contentId && left.sourceEventId === right.sourceEventId
    && left.bodyHash === right.bodyHash && left.declaredCreationMode === right.declaredCreationMode;
}

export function assessPostPublishing(input: {
  revision: ContentModerationRevision;
  safety: PostSafetyOutcome;
  stages: Readonly<Record<PostPublishingStage, PostPublishingStageOutcome>>;
  policy: PostPublishingPolicyInput;
}): PostPublishingAssessment {
  const reasons: string[] = [];
  const { revision, safety, stages, policy } = input;
  if (!policy.policyVersion || !sameRevision(revision, policy.revision)
    || !['ALLOW', 'REVIEW', 'BLOCK', 'NOT_RUN'].includes(policy.outcome)
    || policy.thresholdVersion !== null && !policy.thresholdVersion) reasons.push('POLICY_INPUT_INVALID');
  if (policy.outcome === 'NOT_RUN') reasons.push('POLICY_UNAVAILABLE');
  if (safety.state !== 'evidence') reasons.push('SAFETY_UNAVAILABLE');
  else if (!safety.evidence || safety.evidence.schemaVersion !== 'lythaus-post-safety-evidence-preparation-v1'
    || safety.evidence.purpose !== 'safety' || safety.evidence.applicability !== 'evaluation-only'
    || safety.evidence.status !== 'SUCCESS' || !['ALLOW', 'REVIEW', 'BLOCK'].includes(safety.evidence.providerResult)
    || !sameRevision(revision, safety.evidence.revision)) reasons.push('SAFETY_REVISION_MISMATCH');
  for (const stage of ['provenance', 'specialist', 'behaviour', 'reasoning'] as const) {
    const outcome = stages[stage];
    if (!outcome || !['unavailable', 'uncertain', 'result'].includes(outcome.state)) reasons.push(`${stage.toUpperCase()}_INPUT_INVALID`);
    else if (outcome.state === 'unavailable') reasons.push(`${stage.toUpperCase()}_UNAVAILABLE`);
    else if (!outcome.componentVersion || !sameRevision(revision, outcome.revision)) reasons.push(`${stage.toUpperCase()}_INPUT_INVALID`);
    else if (outcome.state === 'uncertain') reasons.push(`${stage.toUpperCase()}_UNCERTAIN`);
    else if (!['pass', 'review', 'block'].includes(outcome.outcome)) reasons.push(`${stage.toUpperCase()}_INPUT_INVALID`);
  }
  let state: PostPublishingAssessment['state'] = 'unknown';
  if (reasons.length === 0) {
    state = policy.outcome === 'BLOCK' ? 'block' : policy.outcome === 'REVIEW' ? 'review' : 'pass';
    if (state === 'pass' && (safety.state === 'evidence' && safety.evidence.providerResult !== 'ALLOW'
      || Object.values(stages).some(stage => stage.state === 'result' && stage.outcome !== 'pass'))) {
      state = 'review'; reasons.push('POLICY_EVIDENCE_CONFLICT');
    }
  }
  return { schemaVersion: 'lythaus-post-publishing-assessment-v1', applicability: 'evaluation-only',
    revision: { ...revision }, policyVersion: policy.policyVersion, thresholdVersion: policy.thresholdVersion,
    state, reasonCodes: [...reasons, 'PUBLICATION_PIPELINE_UNVALIDATED'], publicationEligible: false,
    discoveryEligible: false, reputationEligible: false, persisted: false };
}
