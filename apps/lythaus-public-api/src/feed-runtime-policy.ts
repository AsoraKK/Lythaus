import { TIER_POLICIES, type TierPolicy, type UserTier } from '@lythaus/contracts';

export type FeedSurface = 'discovery' | 'personal' | 'custom' | 'news' | 'post' | 'comments';

export interface FeedResponsePlan {
  privateResponse: boolean;
  cacheControl: string;
}

const PRIVATE_FEED_RESPONSE: FeedResponsePlan = {
  privateResponse: true,
  cacheControl: 'private, no-store',
};

export function feedResponsePlan(surface: FeedSurface, hasViewer: boolean): FeedResponsePlan {
  if (hasViewer) return PRIVATE_FEED_RESPONSE;
  if (surface === 'discovery') {
    return { privateResponse: false, cacheControl: 'public, s-maxage=30, stale-while-revalidate=60' };
  }
  if (surface === 'post') {
    return { privateResponse: false, cacheControl: 'public, max-age=15, s-maxage=15' };
  }
  if (surface === 'comments') {
    return { privateResponse: false, cacheControl: 'public, max-age=10, s-maxage=10' };
  }
  return PRIVATE_FEED_RESPONSE;
}

export function entitlementsForTier(tier: UserTier): TierPolicy {
  return TIER_POLICIES[tier];
}

export function assertCustomFeedAvailable(tier: UserTier, existingCount: number): TierPolicy {
  const policy = entitlementsForTier(tier);
  if (existingCount >= policy.maxCustomFeeds) throw new Error('custom_feed_limit_reached');
  return policy;
}

export function requireNewsBoardAccess(tier: UserTier): 'full' {
  const access = entitlementsForTier(tier).newsBoardAccess;
  if (access !== 'full') throw new Error('news_board_not_entitled');
  return access;
}

export interface FeedViewerEligibility {
  userId: string;
  followsAuthor: boolean;
  blocked: boolean;
  muted: boolean;
}

export interface FeedItemEligibility {
  authorId: string;
  visibility: unknown;
  moderationState: unknown;
  publicLabel: unknown;
  deleted: boolean;
  viewer?: FeedViewerEligibility;
}

export function assertFeedItemEligibility(item: FeedItemEligibility): void {
  if (item.deleted || item.moderationState !== 'allowed') throw new Error('post_not_available');
  if (item.publicLabel !== 'Human-authored' && item.publicLabel !== 'AI-assisted') throw new Error('post_not_available');
  if (item.viewer?.blocked || item.viewer?.muted) throw new Error('post_not_available');
  if (item.visibility === 'public') return;
  if (!item.viewer) throw new Error('post_not_available');
  if (item.authorId === item.viewer.userId) return;
  if (item.visibility === 'followers' && item.viewer.followsAuthor) return;
  throw new Error('post_not_available');
}

export interface CommentFeedViewerEligibility {
  isPostAuthor: boolean;
  followsPostAuthor: boolean;
  blockedCommentAuthor: boolean;
  mutedCommentAuthor: boolean;
}

export interface CommentFeedItemEligibility {
  postVisibility: unknown;
  postModerationState: unknown;
  postDeleted: boolean;
  publicLabel: unknown;
  viewer?: CommentFeedViewerEligibility;
}

export function assertCommentFeedItemEligibility(item: CommentFeedItemEligibility): void {
  if (item.postDeleted || item.postModerationState !== 'allowed') throw new Error('post_not_available');
  if (item.publicLabel !== 'Human-authored' && item.publicLabel !== 'AI-assisted') throw new Error('post_not_available');
  if (item.viewer?.blockedCommentAuthor || item.viewer?.mutedCommentAuthor) throw new Error('post_not_available');
  if (item.postVisibility === 'public') return;
  if (!item.viewer) throw new Error('post_not_available');
  if (item.viewer.isPostAuthor) return;
  if (item.postVisibility === 'followers' && item.viewer.followsPostAuthor) return;
  throw new Error('post_not_available');
}

export function commentPublicLabel(declaredCreationMode: unknown): 'Human-authored' | 'AI-assisted' | undefined {
  if (declaredCreationMode === 'human') return 'Human-authored';
  if (declaredCreationMode === 'ai_assisted') return 'AI-assisted';
  return undefined;
}

export interface NewsBoardItemEligibility {
  publicationPublished: boolean;
  postBacked: boolean;
  post?: FeedItemEligibility;
}

export function assertNewsBoardItemEligibility(item: NewsBoardItemEligibility): void {
  if (!item.publicationPublished) throw new Error('post_not_available');
  if (!item.postBacked) return;
  if (!item.post) throw new Error('post_not_available');
  assertFeedItemEligibility(item.post);
}
