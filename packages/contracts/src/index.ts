export type DeclaredCreationMode = 'human' | 'ai_assisted' | 'ai_generated';
export type PublicDeclaredCreationMode = Exclude<DeclaredCreationMode, 'ai_generated'>;

export type PublicContentLabel =
  | 'Human-authored'
  | 'AI-assisted'
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
  declaredCreationMode: PublicDeclaredCreationMode;
  geoScope: GeoScope;
  placeId?: string;
}

export {
  MAX_AI_ASSISTED_PUBLIC_GRAPHEMES,
  MAX_PUBLIC_CONTENT_GRAPHEMES,
  countUserPerceivedCharacters,
  enforceAdminAllowPublication,
  enforceContentDeclaration,
  type ContentDeclarationDecision,
  type DeclaredContentCreationMode,
  type PublishableContentLabel,
} from './content-policy.ts';

export interface ApiErrorBody {
  error: string;
  correlationId: string;
}

export {
  decodeCursor,
  encodeCursor,
  pageRequest,
  type KeysetCursor,
} from './keyset-cursor.ts';

export interface UploadSessionResponse {
  uploadSessionId: string;
  objectKey: string;
  putUrl: string;
  expiresAt: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  maxBytes: number;
  checksumSha256: string;
}

export {
  PLATFORM_SAFETY_LIMITS,
  REWARD_ACCESS_POLICY,
  TIER_POLICIES,
  hasNewsBoardAccess,
  normalizeUserTier,
  type TierPolicy,
  type UserTier,
} from './tier-policy.ts';
export {
  ACTIVITY_CATEGORIES,
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_POLICY_VERSION,
  ACTIVITY_RETENTION_DAYS,
  buildActivityEvent,
  canViewPrivateActivity,
  sanitizeActivityMetadata,
  type ActivityCategory,
  type ActivityEvent,
  type ActivityEventInput,
  type ActivityEventType,
  type ActivityMetadata,
  type ActivityResult,
  type ActivityRetentionClass,
  type ReputationEffect,
} from './activity-policy.ts';
export {
  REPUTATION_PILLARS,
  REPUTATION_PILLAR_BASELINES,
  REPUTATION_EVENT_CATALOG,
  REPUTATION_POLICY,
  calculateReputationImpact,
  evaluateReputation,
  publicReputationSummary,
  type ReputationEvaluation,
  type ReputationEvaluationInput,
  type ReputationEventDisposition,
  type ReputationEventPolicy,
  type ReputationImpact,
  type ReputationImpactInput,
  type ReputationLevel,
  type ReputationPillar,
  type ReputationPillarScores,
  type ReputationSignalType,
} from './reputation-policy.ts';
export {
  APPEAL_POLICY,
  evaluateAppeal,
  selectAppealReviewers,
  type AppealAdjudication,
  type AppealDecision,
  type AppealEvaluation,
  type AppealReviewerAssignment,
  type AppealReviewerCandidate,
  type AppealRiskClass,
  type AppealVote,
  type ReviewerQualification,
} from './appeal-policy.ts';

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
