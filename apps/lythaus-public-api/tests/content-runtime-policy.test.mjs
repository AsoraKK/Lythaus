import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDistinctReactionAuthor,
  contentDeletionPlan,
  planCommentCreation,
  planCommentRevision,
  planPostPublication,
  planPostRevision,
  planReactionChange,
  planRelationshipMutation,
  replyDepth,
} from '../src/content-runtime-policy.ts';
import { enforceContentDeclaration } from '../src/product-policy.ts';

test('plans new posts with validated geographic precision and moderation state', () => {
  assert.deepEqual(planPostPublication('global', undefined), {
    geoScope: 'global', placeId: undefined, locationPrecision: undefined, moderationState: 'under_review',
  });
  assert.deepEqual(planPostPublication('none', null), {
    geoScope: 'none', placeId: undefined, locationPrecision: undefined, moderationState: 'under_review',
  });
  assert.deepEqual(planPostPublication('municipality', ' place-1 '), {
    geoScope: 'municipality', placeId: 'place-1', locationPrecision: 'municipality', moderationState: 'under_review',
  });
  assert.throws(() => planPostPublication('country', undefined), /invalid_geo_scope/);
  assert.throws(() => planPostPublication('community', ''), /invalid_geo_scope/);
  assert.throws(() => planPostPublication('global', 'place-1'), /invalid_geo_scope/);
  assert.throws(() => planPostPublication('none', ''), /invalid_geo_scope/);
  assert.throws(() => planPostPublication('planet', 'place-1'), /invalid_geo_scope/);
});

test('post revisions require a fresh declaration whenever body changes', () => {
  assert.deepEqual(planPostRevision({ visibility: 'followers', bodyProvided: false, declaredCreationMode: undefined }), {
    visibility: 'followers', moderationState: 'under_review', bodyUpdated: false,
  });
  assert.deepEqual(planPostRevision({ visibility: 'public', bodyProvided: true, declaredCreationMode: 'human' }), {
    visibility: 'public', moderationState: 'under_review', bodyUpdated: true,
  });
  assert.deepEqual(enforceContentDeclaration({ body: 'human revision', declaredCreationMode: 'human' }), {
    body: 'human revision', declaredCreationMode: 'human', declaredAuthorship: 'human', publicLabel: 'Human-authored', characterCount: 14,
  });
  assert.deepEqual(enforceContentDeclaration({ body: 'a'.repeat(249), declaredCreationMode: 'ai_assisted' }).publicLabel, 'AI-assisted');
  assert.throws(() => planPostRevision({ visibility: 'public', bodyProvided: true, declaredCreationMode: undefined }), /invalid_post/);
  assert.throws(() => enforceContentDeclaration({ body: 'a'.repeat(250), declaredCreationMode: 'ai_assisted' }), /ai_assisted_character_limit_exceeded/);
  assert.throws(() => enforceContentDeclaration({ body: 'generated', declaredCreationMode: 'ai_generated' }), /ai_generated_public_content_blocked/);
  assert.throws(() => planPostRevision({ visibility: 'hidden', bodyProvided: false, declaredCreationMode: undefined }), /invalid_post_visibility/);
});

test('comment plans distinguish replies and reject malformed parents', () => {
  assert.deepEqual(planCommentCreation(undefined), {
    parentId: null, isReply: false, moderationState: 'under_review',
    activityEvent: 'content.comment_created', contentType: 'comment',
  });
  assert.deepEqual(planCommentCreation('parent-1'), {
    parentId: 'parent-1', isReply: true, moderationState: 'under_review',
    activityEvent: 'content.reply_created', contentType: 'reply',
  });
  assert.equal(replyDepth({ depth: 0 }), 1);
  assert.throws(() => replyDepth({ depth: 1 }), /invalid_comment_parent/);
  assert.throws(() => replyDepth(undefined), /invalid_comment_parent/);
  assert.throws(() => planCommentCreation(''), /invalid_comment_parent/);
  assert.throws(() => planCommentCreation(42), /invalid_comment_parent/);
  assert.deepEqual(planCommentRevision({ body: 'body-only update', declaredCreationMode: undefined }, 'human'), {
    body: 'body-only update', declaredCreationMode: 'human', moderationState: 'under_review',
  });
  assert.equal(enforceContentDeclaration(planCommentRevision({ body: 'body-only update', declaredCreationMode: undefined }, 'human')).publicLabel, 'Human-authored');
  assert.throws(
    () => enforceContentDeclaration(planCommentRevision({ body: 'legacy generated comment', declaredCreationMode: undefined }, 'ai_generated')),
    /ai_generated_public_content_blocked/,
  );
  assert.throws(() => planCommentRevision({ body: undefined, declaredCreationMode: 'human' }, 'human'), /invalid_comment/);
});

test('deletion, reaction and relationship plans retain observed business transitions', () => {
  assert.deepEqual(contentDeletionPlan('post'), {
    contentType: 'post', outboxEventType: 'content.post.deleted',
    activityEvent: 'content.post_deleted', visibility: 'private',
  });
  assert.deepEqual(contentDeletionPlan('comment'), {
    contentType: 'comment', outboxEventType: 'content.comment.deleted',
    activityEvent: 'content.comment_deleted',
  });
  assert.deepEqual(planReactionChange('like', undefined), { reactionType: 'like', changed: true, status: 201 });
  assert.deepEqual(planReactionChange('like', 'like'), { reactionType: 'like', changed: false, status: 200 });
  assert.deepEqual(planReactionChange('support', 'like'), { reactionType: 'support', changed: true, status: 200 });
  assert.throws(() => planReactionChange('angry', undefined), /invalid_reaction/);
  assert.throws(() => assertDistinctReactionAuthor('same', 'same'), /self_reaction_not_allowed/);
  assert.doesNotThrow(() => assertDistinctReactionAuthor('author', 'actor'));
  assert.deepEqual(planRelationshipMutation('block', 'actor', 'target', true), {
    targetUserId: 'target', removeFollowEdges: true, activityEvent: 'social.block_created',
  });
  assert.deepEqual(planRelationshipMutation('block', 'actor', 'target', false), {
    targetUserId: 'target', removeFollowEdges: false, activityEvent: 'social.block_removed',
  });
  assert.deepEqual(planRelationshipMutation('mute', 'actor', 'target', true), {
    targetUserId: 'target', removeFollowEdges: false, activityEvent: 'social.mute_created',
  });
  assert.deepEqual(planRelationshipMutation('mute', 'actor', 'target', false), {
    targetUserId: 'target', removeFollowEdges: false, activityEvent: 'social.mute_removed',
  });
  assert.throws(() => planRelationshipMutation('block', 'actor', '', true), /invalid_block/);
  assert.throws(() => planRelationshipMutation('mute', 'actor', 'actor', true), /invalid_mute/);
});
