export type PostGeoScope = 'global' | 'country' | 'province' | 'municipality' | 'community' | 'none';
export type PostVisibility = 'public' | 'followers' | 'private';
export type ReactionType = 'like' | 'insightful' | 'support';
export type RelationshipKind = 'block' | 'mute';

export interface PostPublicationPlan {
  geoScope: PostGeoScope;
  placeId: string | undefined;
  locationPrecision: 'country' | 'province' | 'municipality' | 'community' | undefined;
  moderationState: 'under_review';
}

export interface CommentCreationPlan {
  parentId: string | null;
  isReply: boolean;
  moderationState: 'under_review';
  activityEvent: 'content.comment_created' | 'content.reply_created';
  contentType: 'comment' | 'reply';
}

export interface ContentDeletionPlan {
  contentType: 'post' | 'comment';
  outboxEventType: 'content.post.deleted' | 'content.comment.deleted';
  activityEvent: 'content.post_deleted' | 'content.comment_deleted';
  visibility?: 'private';
}

const GEO_SCOPES = new Set<PostGeoScope>(['global', 'country', 'province', 'municipality', 'community', 'none']);
const VISIBILITIES = new Set<PostVisibility>(['public', 'followers', 'private']);
const REACTIONS = new Set<ReactionType>(['like', 'insightful', 'support']);

export function planPostPublication(geoScope: unknown, placeId: unknown): PostPublicationPlan {
  if (typeof geoScope !== 'string' || !GEO_SCOPES.has(geoScope as PostGeoScope)) throw new Error('invalid_geo_scope');
  const isGlobalScope = geoScope === 'none' || geoScope === 'global';
  if (isGlobalScope) {
    if (placeId !== null && placeId !== undefined) throw new Error('invalid_geo_scope');
    return {
      geoScope: geoScope as PostGeoScope,
      placeId: undefined,
      locationPrecision: undefined,
      moderationState: 'under_review',
    };
  }
  if (typeof placeId !== 'string' || !placeId.trim()) throw new Error('invalid_geo_scope');
  return {
    geoScope: geoScope as PostGeoScope,
    placeId: placeId.trim(),
    locationPrecision: geoScope as PostPublicationPlan['locationPrecision'],
    moderationState: 'under_review',
  };
}

export function planPostRevision(input: {
  visibility: unknown;
  bodyProvided: boolean;
  declaredCreationMode: unknown;
}): { visibility: PostVisibility; moderationState: 'under_review'; bodyUpdated: boolean } {
  if (typeof input.visibility !== 'string' || !VISIBILITIES.has(input.visibility as PostVisibility)) {
    throw new Error('invalid_post_visibility');
  }
  if (input.bodyProvided && input.declaredCreationMode === undefined) throw new Error('invalid_post');
  return { visibility: input.visibility as PostVisibility, moderationState: 'under_review', bodyUpdated: input.bodyProvided };
}

export function planCommentCreation(parentId: unknown): CommentCreationPlan {
  if (parentId !== null && parentId !== undefined && (typeof parentId !== 'string' || parentId.length === 0)) {
    throw new Error('invalid_comment_parent');
  }
  const isReply = typeof parentId === 'string';
  return {
    parentId: isReply ? parentId : null,
    isReply,
    moderationState: 'under_review',
    activityEvent: isReply ? 'content.reply_created' : 'content.comment_created',
    contentType: isReply ? 'reply' : 'comment',
  };
}

export function replyDepth(parent: { depth: unknown } | undefined): 1 {
  if (!parent || Number(parent.depth) !== 0) throw new Error('invalid_comment_parent');
  return 1;
}

export function planCommentRevision(input: {
  body?: unknown;
  declaredCreationMode?: unknown;
}, storedDeclaredCreationMode: unknown): {
  body: string;
  declaredCreationMode: unknown;
  moderationState: 'under_review';
} {
  if (typeof input.body !== 'string') throw new Error('invalid_comment');
  return {
    body: input.body,
    declaredCreationMode: input.declaredCreationMode === undefined
      ? storedDeclaredCreationMode
      : input.declaredCreationMode,
    moderationState: 'under_review',
  };
}

export function contentDeletionPlan(contentType: 'post' | 'comment'): ContentDeletionPlan {
  return contentType === 'post'
    ? {
      contentType,
      outboxEventType: 'content.post.deleted',
      activityEvent: 'content.post_deleted',
      visibility: 'private',
    }
    : {
      contentType,
      outboxEventType: 'content.comment.deleted',
      activityEvent: 'content.comment_deleted',
    };
}

export function planReactionChange(reactionType: unknown, existingReaction: unknown): {
  reactionType: ReactionType;
  changed: boolean;
  status: 200 | 201;
} {
  if (typeof reactionType !== 'string' || !REACTIONS.has(reactionType as ReactionType)) throw new Error('invalid_reaction');
  if (existingReaction === reactionType) return { reactionType: reactionType as ReactionType, changed: false, status: 200 };
  return { reactionType: reactionType as ReactionType, changed: true, status: existingReaction ? 200 : 201 };
}

export function assertDistinctReactionAuthor(authorId: string, actorId: string): void {
  if (authorId === actorId) throw new Error('self_reaction_not_allowed');
}

export function planRelationshipMutation(
  kind: RelationshipKind,
  actorId: string,
  targetUserId: unknown,
  enabled: boolean,
): {
  targetUserId: string;
  removeFollowEdges: boolean;
  activityEvent: 'social.block_created' | 'social.block_removed' | 'social.mute_created' | 'social.mute_removed';
} {
  if (typeof targetUserId !== 'string' || !targetUserId || targetUserId === actorId) {
    throw new Error(kind === 'block' ? 'invalid_block' : 'invalid_mute');
  }
  if (kind === 'block') {
    return {
      targetUserId,
      removeFollowEdges: enabled,
      activityEvent: enabled ? 'social.block_created' : 'social.block_removed',
    };
  }
  return {
    targetUserId,
    removeFollowEdges: false,
    activityEvent: enabled ? 'social.mute_created' : 'social.mute_removed',
  };
}
