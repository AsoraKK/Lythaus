export const ACTIVITY_POLICY_VERSION = 'activity-v1.0.0';

export const ACTIVITY_CATEGORIES = [
  'account',
  'content',
  'social',
  'reputation',
  'moderation',
  'appeals',
  'privacy',
  'rewards',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_EVENT_TYPES = [
  'account.registered',
  'account.email_verified',
  'account.email_verification_requested',
  'account.login_succeeded',
  'account.logout_succeeded',
  'account.session_revoked',
  'account.session_refreshed',
  'account.password_reset_requested',
  'account.password_changed',
  'account.password_reset',
  'account.recovery_completed',
  'account.deletion_requested',
  'account.deletion_completed',
  'profile.display_name_changed',
  'profile.accountability_name_changed',
  'profile.bio_changed',
  'profile.handle_changed',
  'profile.avatar_changed',
  'profile.visibility_changed',
  'profile.privacy_setting_changed',
  'profile.notification_preference_changed',
  'profile.notification_device_registered',
  'profile.notification_device_revoked',
  'profile.region_changed',
  'profile.retention_preference_changed',
  'content.post_submitted',
  'content.declaration_selected',
  'content.post_published',
  'content.post_edited',
  'content.post_deleted',
  'content.comment_created',
  'content.comment_published',
  'content.comment_edited',
  'content.comment_deleted',
  'content.reply_created',
  'content.reply_published',
  'content.reaction_added',
  'content.reaction_removed',
  'content.bookmark_added',
  'content.bookmark_removed',
  'content.visibility_changed',
  'content.media_upload_started',
  'content.media_upload_finalised',
  'content.media_upload_approved',
  'content.media_upload_rejected',
  'social.follow_created',
  'social.follow_removed',
  'social.block_created',
  'social.block_removed',
  'social.mute_created',
  'social.mute_removed',
  'social.custom_feed_created',
  'social.custom_feed_updated',
  'social.custom_feed_deleted',
  'reputation.event_awarded',
  'reputation.event_withheld',
  'reputation.deduction_applied',
  'reputation.event_reversed',
  'reputation.level_promoted',
  'reputation.level_demoted',
  'reputation.promotion_withheld',
  'reputation.reviewer_eligibility_changed',
  'moderation.flag_submitted',
  'moderation.case_opened',
  'moderation.decision_applied',
  'moderation.warning_applied',
  'moderation.content_restricted',
  'moderation.feature_restricted',
  'moderation.reputation_penalty_applied',
  'moderation.suspension_applied',
  'moderation.content_removed',
  'moderation.decision_reversed',
  'appeals.appeal_submitted',
  'appeals.appeal_accepted',
  'appeals.reviewer_assignment_changed',
  'appeals.review_completed',
  'appeals.reviewer_panel_result_reached',
  'appeals.adjudication_requested',
  'appeals.adjudicator_result_recorded',
  'appeals.appeal_resolved',
  'appeals.decision_reversed',
  'appeals.decision_upheld',
  'privacy.export_requested',
  'privacy.export_generated',
  'privacy.export_accessed',
  'privacy.rectification_requested',
  'privacy.deletion_requested',
  'privacy.deletion_state_changed',
  'privacy.retention_changed',
  'privacy.legal_restriction_changed',
  'rewards.reward_eligible',
  'rewards.reward_redeemed',
  'rewards.subscription_tier_changed',
  'rewards.custom_feed_limit_changed',
  'rewards.news_board_entitlement_changed',
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];
export type ActivityResult = 'succeeded' | 'failed' | 'withheld' | 'reversed' | 'pending';
export type ReputationEffect = 'none' | 'positive' | 'negative' | 'reversed' | 'withheld';
export type ActivityRetentionClass = 'ordinary' | 'security' | 'moderation';

export const ACTIVITY_RETENTION_DAYS: Readonly<Record<ActivityRetentionClass, number>> = {
  ordinary: 730,
  security: 365,
  moderation: 90,
};

const ALLOWED_METADATA_KEYS: Readonly<Record<ActivityCategory, ReadonlySet<string>>> = {
  account: new Set(['authenticationMethod', 'changedField', 'sessionAction']),
  content: new Set(['contentType', 'creationMode', 'visibility', 'moderationState']),
  social: new Set(['relationshipType', 'targetType']),
  reputation: new Set(['pillar', 'levelBefore', 'levelAfter', 'explanationCode']),
  moderation: new Set(['decisionType', 'restrictionType', 'durationBand']),
  appeals: new Set(['appealState', 'riskClass', 'outcome']),
  privacy: new Set(['requestType', 'requestState', 'retentionClass']),
  rewards: new Set(['tierBefore', 'tierAfter', 'entitlementType', 'rewardId']),
};

const FORBIDDEN_METADATA_KEY = /(authorization|body|cookie|credential|email|password|request|secret|token)/i;

export type ActivityMetadataValue = string | number | boolean | null;
export type ActivityMetadata = Readonly<Record<string, ActivityMetadataValue>>;

export interface ActivityEventInput {
  id: string;
  userId: string;
  actorUserId?: string;
  eventType: ActivityEventType;
  category: ActivityCategory;
  source: 'public_api' | 'admin_api' | 'jobs' | 'workflow' | 'system';
  sourceEventId: string;
  correlationId: string;
  title: string;
  explanation: string;
  result: ActivityResult;
  reasonCode?: string;
  policyVersion?: string;
  objectType?: string;
  objectId?: string;
  reputationEffect: ReputationEffect;
  appealable: boolean;
  retentionClass: ActivityRetentionClass;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityEvent extends Omit<ActivityEventInput, 'metadata'> {
  metadata: ActivityMetadata;
  retentionDays: number;
}

function isMetadataValue(value: unknown): value is ActivityMetadataValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function sanitizeActivityMetadata(
  category: ActivityCategory,
  metadata: Record<string, unknown> = {},
): ActivityMetadata {
  const allowedKeys = ALLOWED_METADATA_KEYS[category];
  const safeEntries: Array<[string, ActivityMetadataValue]> = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEY.test(key)) throw new Error('activity_metadata_sensitive_key');
    if (!allowedKeys.has(key)) throw new Error('activity_metadata_key_not_allowed');
    if (!isMetadataValue(value)) throw new Error('activity_metadata_value_not_allowed');
    if (typeof value === 'string' && value.length > 160) throw new Error('activity_metadata_value_too_long');
    safeEntries.push([key, value]);
  }

  return Object.freeze(Object.fromEntries(safeEntries));
}

export function buildActivityEvent(input: ActivityEventInput): ActivityEvent {
  if (!input.id || !input.userId || !input.sourceEventId || !input.correlationId) {
    throw new Error('activity_event_identity_required');
  }
  if (input.actorUserId && input.actorUserId !== input.userId && input.source === 'public_api') {
    throw new Error('activity_actor_mismatch');
  }

  return Object.freeze({
    ...input,
    policyVersion: input.policyVersion ?? ACTIVITY_POLICY_VERSION,
    metadata: sanitizeActivityMetadata(input.category, input.metadata),
    retentionDays: ACTIVITY_RETENTION_DAYS[input.retentionClass],
  });
}

export function canViewPrivateActivity(
  viewerUserId: string,
  subjectUserId: string,
  scopes: readonly string[] = [],
): boolean {
  return viewerUserId === subjectUserId || scopes.includes('privacy:activity:read');
}
