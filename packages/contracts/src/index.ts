export type DeclaredCreationMode = 'human' | 'ai_assisted' | 'ai_generated';

export type PublicContentLabel =
  | 'Human-authored'
  | 'AI-assisted'
  | 'AI-generated'
  | 'Under review';

export type GeoScope =
  | 'global'
  | 'country'
  | 'province'
  | 'municipality'
  | 'community'
  | 'none';

export interface EmailDeliveryReference {
  provider: string;
  messageId: string;
  acceptedAt: string;
}

export interface TransactionalEmailProvider {
  sendVerification(input: { to: string; token: string }): Promise<EmailDeliveryReference>;
  sendPasswordReset(input: { to: string; token: string }): Promise<EmailDeliveryReference>;
  sendSecurityNotice(input: { to: string; reason: string }): Promise<EmailDeliveryReference>;
  sendEmailChangeNotice(input: { to: string; token: string }): Promise<EmailDeliveryReference>;
  sendAccountDeletionNotice(input: { to: string; requestId: string }): Promise<EmailDeliveryReference>;
}

export interface CreatePostInput {
  body: string;
  declaredCreationMode: DeclaredCreationMode;
  geoScope: GeoScope;
  placeId?: string;
}

export interface ApiErrorBody {
  error: string;
  correlationId: string;
}

export interface UploadSessionResponse {
  uploadSessionId: string;
  objectKey: string;
  putUrl: string;
  expiresAt: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  maxBytes: number;
  checksumSha256: string;
}

export type UserTier = 'free' | 'premium' | 'black';

export interface TierPolicy {
  dailyPosts: number;
  dailyComments: number;
  dailyReactions: number;
  dailyAppeals: number;
  exportCooldownDays: number;
  maxCustomFeeds: number;
  newsBoardAccess: 'preview' | 'full';
  rewardLevelCap: number;
  rewardOptionsPerLevel: number | null;
}

export const TIER_POLICIES: Readonly<Record<UserTier, TierPolicy>> = {
  free: {
    dailyPosts: 5,
    dailyComments: 20,
    dailyReactions: 100,
    dailyAppeals: 1,
    exportCooldownDays: 30,
    maxCustomFeeds: 1,
    newsBoardAccess: 'preview',
    rewardLevelCap: 3,
    rewardOptionsPerLevel: 1,
  },
  premium: {
    dailyPosts: 20,
    dailyComments: 100,
    dailyReactions: 1000,
    dailyAppeals: 3,
    exportCooldownDays: 7,
    maxCustomFeeds: 2,
    newsBoardAccess: 'full',
    rewardLevelCap: 5,
    rewardOptionsPerLevel: 1,
  },
  black: {
    dailyPosts: 50,
    dailyComments: 300,
    dailyReactions: 1500,
    dailyAppeals: 10,
    exportCooldownDays: 1,
    maxCustomFeeds: 3,
    newsBoardAccess: 'full',
    rewardLevelCap: 5,
    rewardOptionsPerLevel: null,
  },
};

export function normalizeUserTier(value: unknown): UserTier {
  return value === 'premium' || value === 'black' ? value : 'free';
}

export interface RewardCatalogItem {
  id: string;
  rewardLevel: number;
  title: string;
  description: string;
  partnerName: string;
}

export const REWARD_CATALOG: readonly RewardCatalogItem[] = [
  { id: 'level-1-learning', rewardLevel: 1, title: 'Learning access', description: 'Curated learning material for responsible publishing.', partnerName: 'Lythaus Learning' },
  { id: 'level-2-source-tools', rewardLevel: 2, title: 'Source toolkit', description: 'Source tracking and citation workflow tools.', partnerName: 'Lythaus Research' },
  { id: 'level-3-community', rewardLevel: 3, title: 'Community sessions', description: 'Priority registration for selected community sessions.', partnerName: 'Lythaus Community' },
  { id: 'level-4-editorial', rewardLevel: 4, title: 'Editorial toolkit', description: 'Advanced editorial and long-form publishing tools.', partnerName: 'Lythaus Editorial' },
  { id: 'level-5-professional', rewardLevel: 5, title: 'Professional suite', description: 'Professional tooling for established contributors.', partnerName: 'Lythaus Professional' },
];
