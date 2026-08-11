export type UserTier = 'free' | 'premium' | 'black';

export interface TierPolicy {
  maxCustomFeeds: 1 | 2 | 3;
  newsBoardAccess: 'none' | 'full';
}

export const TIER_POLICIES: Readonly<Record<UserTier, TierPolicy>> = {
  free: {
    maxCustomFeeds: 1,
    newsBoardAccess: 'none',
  },
  premium: {
    maxCustomFeeds: 2,
    newsBoardAccess: 'none',
  },
  black: {
    maxCustomFeeds: 3,
    newsBoardAccess: 'full',
  },
};

export const PLATFORM_SAFETY_LIMITS = Object.freeze({
  dailyPosts: 5,
  dailyComments: 50,
  dailyReactions: 100,
  maxFollowStateChangesPerRelationshipPerDay: 2,
  dailyFlags: 20,
  dailyMediaUploads: 20,
  maxMediaBytesPerUpload: 10 * 1024 * 1024,
  dailyAppeals: 1,
  exportCooldownDays: 30,
});

export const REWARD_ACCESS_POLICY = Object.freeze({
  maximumReputationLevel: 5,
  maximumOptionsPerLevel: null as number | null,
});

export function normalizeUserTier(value: unknown): UserTier {
  return value === 'premium' || value === 'black' ? value : 'free';
}

export function hasNewsBoardAccess(tier: UserTier): boolean {
  return TIER_POLICIES[tier].newsBoardAccess === 'full';
}
