/** Shared primitives used across Lythaus backend contracts. */
export type Cursor = string;

export interface CursorPaginationParams {
  cursor?: Cursor;
  limit?: number;
}

export interface CursorPaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export type AuthProvider = 'email' | 'guest';
export type Role = 'user' | 'moderator' | 'journalist' | 'contributor' | 'admin';
export type Tier = 'free' | 'creator' | 'premium' | 'enterprise';
export type Visibility = 'public' | 'followers' | 'private';
export type ContentType = 'text' | 'image' | 'video' | 'mixed';
export type SortingRule = 'hot' | 'new' | 'relevant' | 'following' | 'local';
export type AuthorRole = 'journalist' | 'contributor' | 'user';

export interface UserPreferences {
  language?: string;
  timezone?: string;
  allowPersonalizedNews?: boolean;
  shareAnalytics?: boolean;
  notificationChannels?: ('email' | 'push' | 'sms')[];
}

export interface UserIdentity {
  id: string;
  primaryEmail: string;
  secondaryEmails: string[];
  roles: Role[];
  tier: Tier;
  reputationScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  displayName: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  location?: string;
  preferences: UserPreferences;
  badges: string[];
}

export interface UserDocument {
  id: string;
  profile: UserProfile;
  settings: Record<string, unknown>;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  tier: Tier;
  reputationScore: number;
  journalistVerified: boolean;
  badges: string[];
}

export interface AuthTokenRequest {
  provider: AuthProvider;
  credential: string;
  redirectUri?: string;
  deviceId?: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType: 'Bearer';
  user: UserIdentity & { profile: UserProfile };
}

export interface AuthRefreshRequest {
  refreshToken: string;
}

export type AuthRefreshResponse = AuthTokenResponse;

export interface CurrentUserResponse {
  identity: UserIdentity;
  profile: UserProfile;
  settings: UserDocument['settings'];
}

export interface UpdateUserRequest {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  preferences?: Partial<UserPreferences>;
}

export interface PublicUserResponse {
  user: PublicUser;
}

export interface PostContent {
  text?: string;
  mediaUrls?: string[];
  attachments?: Record<string, unknown>;
}

export interface Post {
  id: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  content: PostContent;
  visibility: Visibility;
  contentType: ContentType;
  topicIds: string[];
  replyToPostId?: string;
  metadata: Record<string, unknown>;
  score: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  clusterId?: string;
}

/** The PostView is what feed readers consume, including author metadata. */
export interface PostView extends Post {
  author: PublicUser;
  isNews: boolean;
  authorRole: AuthorRole;
  promotedForTopic?: string;
}

export interface CreatePostRequest {
  content: PostContent;
  contentType: ContentType;
  visibility?: Visibility;
  topicIds?: string[];
  replyToPostId?: string;
  locale?: string;
}

export interface PostResponse {
  post: PostView;
}

export interface FeedRequest extends CursorPaginationParams {
  limit?: number;
  locales?: string[];
  includeTopics?: string[];
  excludeTopics?: string[];
}

/** News feed mixes journalist + contributor signals; the UI needs to know why a post showed up. */
export interface NewsFeedRequest extends FeedRequest {
  region?: string;
  includeHighReputation?: boolean;
}

export type FeedResponse = CursorPaginatedResponse<PostView>;

export interface UserPostsRequest extends CursorPaginationParams {
  limit?: number;
  includeReplies?: boolean;
}

export interface UserPostsResponse extends FeedResponse {}

/** Custom feed definitions are stored per owner and describe a 3-layer filter pipeline. */
export interface CustomFeedDefinition {
  id: string;
  ownerId: string;
  name: string;
  contentType: ContentType;
  sorting: SortingRule;
  includeKeywords: string[];
  excludeKeywords: string[];
  includeAccounts: string[];
  excludeAccounts: string[];
  isHome: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomFeedRequest {
  name: string;
  contentType: ContentType;
  sorting: SortingRule;
  includeKeywords?: string[];
  excludeKeywords?: string[];
  includeAccounts?: string[];
  excludeAccounts?: string[];
  isHome?: boolean;
}

export interface UpdateCustomFeedRequest {
  name?: string;
  includeKeywords?: string[];
  excludeKeywords?: string[];
  includeAccounts?: string[];
  excludeAccounts?: string[];
  sorting?: SortingRule;
  isHome?: boolean;
}

export type CustomFeedListResponse = CursorPaginatedResponse<CustomFeedDefinition>;

export interface CustomFeedItemsRequest extends CursorPaginationParams {
  limit?: number;
}

export type CustomFeedItemsResponse = CursorPaginatedResponse<PostView>;

export interface ModerationCase {
  id: string;
  targetId: string;
  contentId: string;
  reporterId?: string;
  createdAt: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  aiConfidence: number;
  status: 'pending' | 'escalated' | 'resolved';
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

/** Decisions are written to the moderation_decisions container with contentId as the partition path. */
export interface ModerationDecision {
  caseId: string;
  reviewerId: string;
  action: 'remove' | 'keep' | 'escalate';
  rationale: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ModerationQueueResponse extends CursorPaginatedResponse<ModerationCase> {}

export interface ModerationCaseResponse {
  moderationCase: ModerationCase;
  decisions: ModerationDecision[];
}

export interface ModerationDecisionRequest {
  action: ModerationDecision['action'];
  rationale: string;
  severityOverride?: ModerationCase['severity'];
}

/** Appeals are stored separately so votes can aggregate in the dedicated votes container. */
export interface Appeal {
  id: string;
  caseId: string;
  contentId: string;
  authorId: string;
  statement: string;
  evidenceUrls: string[];
  status: 'pending' | 'in_review' | 'upheld' | 'overturned' | 'dismissed';
  createdAt: string;
  updatedAt: string;
  resolutionNotes?: string;
}

export interface AppealResponse {
  appeal: Appeal;
}

export interface AppealVote {
  id: string;
  appealId: string;
  userId: string;
  vote: 'approve' | 'reject';
  weight: number;
  createdAt: string;
}

export interface FileAppealRequest {
  caseId: string;
  statement: string;
  evidenceUrls?: string[];
}

export interface VoteOnAppealRequest {
  vote: AppealVote['vote'];
  weight?: number;
  rationale?: string;
}

export interface VoteOnAppealResponse {
  vote: AppealVote;
}

export type AppealDetailsResponse = AppealResponse & { votes: AppealVote[] };

/** v2/future: Reputation and tiering outreach. */
export interface ReputationTier {
  name: string;
  minXP: number;
  privileges: string[];
}

export interface ReputationEvent {
  id: string;
  userId: string;
  action: string;
  xpDelta: number;
  source: string;
  createdAt: string;
}

export interface ReputationOverview {
  userId: string;
  totalXP: number;
  tier: ReputationTier;
  breakdown: Record<string, number>;
}

export type ReputationHistoryResponse = CursorPaginatedResponse<ReputationEvent>;

export interface ReputationEventRequest {
  action: string;
  userId: string;
  xpDelta: number;
  source: string;
}

/** v2/future: Search and Trending placeholders. */
export interface SearchRequest extends CursorPaginationParams {
  query: string;
  types?: ('post' | 'user')[];
  timeframe?: '24h' | '7d' | '30d';
}

export interface SearchResult {
  type: 'post' | 'user';
  post?: PostView;
  user?: PublicUser;
}

export type SearchResponse = CursorPaginatedResponse<SearchResult>;

export interface TrendingRequest extends CursorPaginationParams {
  timeframe?: '24h' | '7d' | '30d';
  categories?: string[];
}

export interface TrendingTopic {
  name: string;
  mentions: number;
  topPostId?: string;
}

export interface TrendingResponse {
  topics: TrendingTopic[];
  posts: PostView[];
}

/** v2/future: Partner-facing feed endpoints. */
export interface PartnerFeedRequest extends FeedRequest {
  partnerId: string;
  apiKey?: string;
}

export interface PartnerFeedResponse extends FeedResponse {}

/** v2/future: Onboarding boosts.*/
export interface InviteCodeRequest {
  code: string;
  deviceId: string;
}

export interface InviteCodeResponse {
  valid: boolean;
  tier?: Tier;
  expiresAt?: string;
}

export interface JournalistApplicationRequest {
  userId: string;
  portfolioUrl: string;
  organization?: string;
  statement: string;
}

export interface JournalistApplicationResponse {
  applicationId: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected';
  submittedAt: string;
}
