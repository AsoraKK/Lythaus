export type PrivacyRequestType = 'export' | 'delete' | 'rectify';

export interface PrivacyRequestPayload {
  requestId: string;
  requestType: PrivacyRequestType;
  subjectId: string;
}

export function moderationReputationSignal(reasonCode: string | undefined):
  | 'confirmed_spam'
  | 'confirmed_harassment'
  | 'authenticity_evasion'
  | 'duplicate_content'
  | null {
  switch (reasonCode) {
    case 'CONFIRMED_SPAM': return 'confirmed_spam';
    case 'CONFIRMED_HARASSMENT': return 'confirmed_harassment';
    case 'AUTHENTICITY_EVASION': return 'authenticity_evasion';
    case 'DUPLICATE_CONTENT': return 'duplicate_content';
    default: return null;
  }
}

export function reputationActivity(disposition: 'positive' | 'negative' | 'withheld' | 'reversed'): {
  eventType: 'reputation.event_reversed' | 'reputation.deduction_applied' | 'reputation.event_withheld' | 'reputation.event_awarded';
  title: string;
  explanation: string;
  result: 'reversed' | 'succeeded' | 'withheld';
  reputationEffect: 'reversed' | 'negative' | 'withheld' | 'positive';
} {
  if (disposition === 'reversed') return {
    eventType: 'reputation.event_reversed',
    title: 'Reputation event reversed',
    explanation: 'A previously effective reputation event was reversed after the underlying outcome changed.',
    result: 'reversed',
    reputationEffect: 'reversed',
  };
  if (disposition === 'negative') return {
    eventType: 'reputation.deduction_applied',
    title: 'Reputation deduction applied',
    explanation: 'A confirmed policy outcome reduced the relevant private reputation pillar under the current policy.',
    result: 'succeeded',
    reputationEffect: 'negative',
  };
  if (disposition === 'withheld') return {
    eventType: 'reputation.event_withheld',
    title: 'Reputation credit withheld',
    explanation: 'This action did not qualify for reputation credit under the current eligibility and anti-gaming rules.',
    result: 'withheld',
    reputationEffect: 'withheld',
  };
  if (disposition === 'positive') return {
    eventType: 'reputation.event_awarded',
    title: 'Constructive contribution recognised',
    explanation: 'An eligible action contributed to the relevant private reputation pillar under the current policy.',
    result: 'succeeded',
    reputationEffect: 'positive',
  };
  throw new Error('reputation_disposition_invalid');
}

export function isPrivacyRequestType(value: unknown): value is PrivacyRequestType {
  return value === 'export' || value === 'delete' || value === 'rectify';
}

export function reconcilePrivacyRequestPayload(input: {
  messageRequestId?: unknown;
  messageRequestType?: unknown;
  actorId?: unknown;
  canonical?: { aggregateId: string; actorId: string | null; requestType: unknown };
}): PrivacyRequestPayload {
  let requestId = typeof input.messageRequestId === 'string' ? input.messageRequestId : undefined;
  let requestType = isPrivacyRequestType(input.messageRequestType) ? input.messageRequestType : undefined;
  let subjectId = typeof input.actorId === 'string' ? input.actorId : undefined;
  const canonical = input.canonical;
  if (canonical) {
    if (requestId && requestId !== canonical.aggregateId) throw new Error('privacy_request_id_mismatch');
    if (subjectId && canonical.actorId && subjectId !== canonical.actorId) throw new Error('privacy_subject_mismatch');
    if (requestType && canonical.requestType && requestType !== canonical.requestType) throw new Error('privacy_request_type_mismatch');
    requestId = canonical.aggregateId;
    subjectId ??= canonical.actorId ?? undefined;
    requestType ??= isPrivacyRequestType(canonical.requestType) ? canonical.requestType : undefined;
  }
  if (!requestId || !subjectId || !requestType) throw new Error('privacy_event_invalid');
  return { requestId, subjectId, requestType };
}

export function privacyRequestLifecyclePlan(requestType: PrivacyRequestType): {
  activity?: { eventType: 'privacy.export_requested' | 'privacy.deletion_requested'; title: string; explanation: string };
  workflow?: 'export' | 'delete';
} {
  if (requestType === 'export') {
    return {
      activity: {
        eventType: 'privacy.export_requested',
        title: 'Data export requested',
        explanation: 'Your data export request was received for processing.',
      },
      workflow: 'export',
    };
  }
  if (requestType === 'delete') {
    return {
      activity: {
        eventType: 'privacy.deletion_requested',
        title: 'Account deletion requested',
        explanation: 'Your account deletion request was received for processing.',
      },
      workflow: 'delete',
    };
  }
  return {};
}

export function legalHoldPlan(legalHoldId: string | undefined):
  | { state: 'proceed' }
  | {
    state: 'blocked';
    legalHoldId: string;
    requestEventType: 'blocked_legal_hold';
    activity: {
      eventType: 'privacy.deletion_state_changed';
      title: string;
      explanation: string;
      result: 'withheld';
      reasonCode: 'LEGAL_HOLD';
    };
  } {
  if (!legalHoldId) return { state: 'proceed' };
  return {
    state: 'blocked',
    legalHoldId,
    requestEventType: 'blocked_legal_hold',
    activity: {
      eventType: 'privacy.deletion_state_changed',
      title: 'Account deletion is paused',
      explanation: 'Your deletion request is paused while an active legal restriction applies.',
      result: 'withheld',
      reasonCode: 'LEGAL_HOLD',
    },
  };
}

export function retentionCleanupPlan(hasLegalHold: boolean, contentType: unknown): 'skip' | 'redact_posts' | 'delete_media' {
  if (hasLegalHold) return 'skip';
  if (contentType === 'post' || contentType === 'posts') return 'redact_posts';
  if (contentType === 'media') return 'delete_media';
  return 'skip';
}

export function reviewerReplacementPlan(currentLevel: unknown, hasWeightedAssignment: boolean): { level: number; voteWeight: 1 | 2 } {
  if (!Number.isInteger(currentLevel) || (currentLevel as number) < 0 || (currentLevel as number) > 5) {
    throw new Error('appeal_reviewer_level_invalid');
  }
  const level = currentLevel as number;
  return { level, voteWeight: level === 5 && !hasWeightedAssignment ? 2 : 1 };
}

export function lockedAppealVote(input: {
  reviewerId: string;
  decision: unknown;
  qualificationSnapshot: unknown;
  levelSnapshot: unknown;
  voteWeightSnapshot: unknown;
  assignmentState: unknown;
  conflictChecked: unknown;
  currentQualificationState: unknown;
}): {
  reviewerId: string;
  decision: 'overturn' | 'uphold';
  qualificationSnapshot: 'trained';
  levelSnapshot: 0 | 1 | 2 | 3 | 4 | 5;
  voteWeightSnapshot: 1 | 2;
  locked: true;
  recused: boolean;
} {
  if (input.decision !== 'overturn' && input.decision !== 'uphold') throw new Error('appeal_vote_decision_invalid');
  if (input.qualificationSnapshot !== 'trained') throw new Error('appeal_vote_qualification_invalid');
  if (!Number.isInteger(input.levelSnapshot) || (input.levelSnapshot as number) < 0 || (input.levelSnapshot as number) > 5) throw new Error('appeal_vote_level_invalid');
  if (input.voteWeightSnapshot !== 1 && input.voteWeightSnapshot !== 2) throw new Error('appeal_vote_weight_invalid');
  return {
    reviewerId: input.reviewerId,
    decision: input.decision,
    qualificationSnapshot: 'trained',
    levelSnapshot: input.levelSnapshot as 0 | 1 | 2 | 3 | 4 | 5,
    voteWeightSnapshot: input.voteWeightSnapshot,
    locked: true,
    recused: input.assignmentState !== 'voted' || !input.conflictChecked || input.currentQualificationState !== 'trained',
  };
}

export type QueueRoute = 'moderation' | 'feed' | 'notifications' | 'media' | 'privacy' | 'audit';

export function queueRouteForEvent(eventType: string): QueueRoute {
  if (eventType.startsWith('content.') || eventType.startsWith('moderation.')) return 'moderation';
  if (eventType.startsWith('feed.')) return 'feed';
  if (eventType.startsWith('notification.')) return 'notifications';
  if (eventType.startsWith('media.')) return 'media';
  if (eventType.startsWith('privacy.')) return 'privacy';
  return 'audit';
}

export function workflowCreateFailurePlan(message: unknown): 'already_exists' | 'throw' {
  if (typeof message !== 'string') return 'throw';
  return /(already exists|already started|instance[^\n]*(exists|started)|\b409\b)/i.test(message)
    ? 'already_exists'
    : 'throw';
}

export interface WorkflowCreateBinding<T> {
  create(options: { id: string; params: T }): Promise<unknown>;
}

export async function ensureWorkflowCreate<T>(workflow: WorkflowCreateBinding<T>, id: string, params: T): Promise<'created' | 'already_exists'> {
  try {
    await workflow.create({ id, params });
    return 'created';
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;
    if (workflowCreateFailurePlan(message) === 'already_exists') return 'already_exists';
    throw error;
  }
}

export interface ContentModerationRevision {
  contentId: string;
  sourceEventId: string;
  declaredCreationMode: 'human' | 'ai_assisted';
  bodyHash: string;
}

export interface ProfileModerationRevision {
  userId: string;
  sourceEventId: string;
  changedFields: Array<'displayName' | 'bio'>;
}

export function parseProfileModerationRevision(input: {
  eventId: unknown;
  payload: unknown;
}): ProfileModerationRevision {
  if (typeof input.eventId !== 'string' || !input.eventId) throw new Error('profile_event_invalid');
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw new Error('profile_event_invalid');
  }
  const payload = input.payload as Record<string, unknown>;
  const userId = payload.userId;
  const sourceEventId = payload.sourceEventId;
  const changedFields = payload.changedFields;
  if (typeof userId !== 'string' || !userId
    || typeof sourceEventId !== 'string' || sourceEventId !== input.eventId
    || !Array.isArray(changedFields)
    || changedFields.length === 0
    || changedFields.some((field) => field !== 'displayName' && field !== 'bio')) {
    throw new Error('profile_event_invalid');
  }
  return { userId, sourceEventId, changedFields: [...new Set(changedFields)] as Array<'displayName' | 'bio'> };
}

export function isCurrentProfileModerationRevision(input: {
  revision: ProfileModerationRevision;
  canonical?: {
    userId: unknown;
    sourceEventId: unknown;
    moderationState: unknown;
    userStatus: unknown;
  };
}): boolean {
  const canonical = input.canonical;
  if (!canonical) return false;
  return canonical.userId === input.revision.userId
    && canonical.sourceEventId === input.revision.sourceEventId
    && canonical.moderationState === 'under_review'
    && canonical.userStatus === 'active';
}

export function parseContentModerationRevision(input: {
  eventId: unknown;
  payload: unknown;
  contentIdField: 'postId' | 'commentId';
}): ContentModerationRevision {
  if (typeof input.eventId !== 'string' || !input.eventId) throw new Error('content_event_invalid');
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw new Error('content_event_invalid');
  }
  const payload = input.payload as Record<string, unknown>;
  const contentId = payload[input.contentIdField];
  const sourceEventId = payload.sourceEventId;
  const declaredCreationMode = payload.declaredCreationMode;
  const bodyHash = payload.bodyHash;
  if (typeof contentId !== 'string' || !contentId
    || typeof sourceEventId !== 'string' || sourceEventId !== input.eventId
    || (declaredCreationMode !== 'human' && declaredCreationMode !== 'ai_assisted')
    || typeof bodyHash !== 'string' || !/^[a-f0-9]{64}$/.test(bodyHash)) {
    throw new Error('content_event_invalid');
  }
  return { contentId, sourceEventId, declaredCreationMode, bodyHash };
}

export function isCurrentContentModerationRevision(input: {
  revision: ContentModerationRevision;
  canonical?: {
    contentId: unknown;
    sourceEventId: unknown;
    declaredCreationMode: unknown;
    bodyHash: unknown;
    moderationState: unknown;
    deletedAt?: unknown;
  };
}): boolean {
  const canonical = input.canonical;
  if (!canonical || canonical.deletedAt !== undefined && canonical.deletedAt !== null) return false;
  return canonical.contentId === input.revision.contentId
    && canonical.sourceEventId === input.revision.sourceEventId
    && canonical.declaredCreationMode === input.revision.declaredCreationMode
    && canonical.bodyHash === input.revision.bodyHash
    && canonical.moderationState === 'under_review';
}

export interface PrivatePassportEncryptedField {
  ciphertext: string;
  encryptionKeyVersion: string;
}

export async function decryptPrivatePassportIdentity(input: {
  encryptionKey: string | undefined;
  privateProfile?: PrivatePassportEncryptedField;
  contactEmail?: PrivatePassportEncryptedField;
  decrypt(field: PrivatePassportEncryptedField, encryptionKey: string): Promise<string>;
}): Promise<{ privateProfile: { accountabilityName: string } | null; contactEmail: string | null }> {
  if (!input.privateProfile && !input.contactEmail) return { privateProfile: null, contactEmail: null };
  if (!input.encryptionKey) throw new Error('private_export_encryption_key_not_configured');
  let privateProfile: { accountabilityName: string } | null = null;
  if (input.privateProfile) {
    const plaintext = await input.decrypt(input.privateProfile, input.encryptionKey);
    const parsed = JSON.parse(plaintext) as { accountabilityName?: unknown };
    if (typeof parsed.accountabilityName !== 'string') throw new Error('private_profile_export_invalid');
    privateProfile = { accountabilityName: parsed.accountabilityName };
  }
  let contactEmail: string | null = null;
  if (input.contactEmail) {
    const decrypted = await input.decrypt(input.contactEmail, input.encryptionKey);
    if (!decrypted.trim()) throw new Error('private_contact_email_export_invalid');
    contactEmail = decrypted;
  }
  return { privateProfile, contactEmail };
}

export function securityAuditRetentionPlan(): { retentionDays: 365 } {
  return { retentionDays: 365 };
}

export function buildPrivacyDataPassport(input: {
  generatedAt: string;
  profile: unknown;
  privateProfile: unknown;
  contactEmail: string | null;
  consentRecords: unknown[];
  entitlement: unknown;
  rewardRedemptions: unknown[];
  accountEvents: unknown[];
  posts: unknown[];
  comments: unknown[];
  follows: unknown[];
  reactions: unknown[];
  blocks: unknown[];
  mutes: unknown[];
  bookmarks: unknown[];
  customFeeds: unknown[];
  submittedFlags: unknown[];
  media: unknown[];
  provenance: unknown[];
  humanContribution: unknown[];
  reputationProfile: unknown;
  reputationEvents: unknown[];
  accountabilitySignals: unknown[];
  notificationPreferences: unknown;
  notificationDevices: unknown[];
  activity: unknown[];
  submittedAppeals: unknown[];
  reviewerQualification: unknown;
  appealAssignments: unknown[];
  appealVotes: unknown[];
  appealAdjudications: unknown[];
  appealOutcomes: unknown[];
  appealOutcomeEffects: unknown[];
  subjectDataLocations: unknown[];
}): Record<string, unknown> {
  return {
    schemaVersion: 'lythaus-data-passport-v3',
    generatedAt: input.generatedAt,
    profile: input.profile,
    privateProfile: input.privateProfile,
    contactEmail: input.contactEmail,
    consentRecords: input.consentRecords,
    entitlement: input.entitlement,
    rewardRedemptions: input.rewardRedemptions,
    accountEvents: input.accountEvents,
    posts: input.posts,
    comments: input.comments,
    follows: input.follows,
    reactions: input.reactions,
    blocks: input.blocks,
    mutes: input.mutes,
    bookmarks: input.bookmarks,
    customFeeds: input.customFeeds,
    submittedFlags: input.submittedFlags,
    media: input.media,
    provenance: input.provenance,
    humanContribution: input.humanContribution,
    reputation: {
      profile: input.reputationProfile,
      events: input.reputationEvents,
      accountabilitySignals: input.accountabilitySignals,
    },
    notifications: {
      preferences: input.notificationPreferences,
      devices: input.notificationDevices,
    },
    activity: input.activity,
    appeals: {
      submitted: input.submittedAppeals,
      reviewerQualification: input.reviewerQualification,
      assignments: input.appealAssignments,
      votes: input.appealVotes,
      adjudications: input.appealAdjudications,
      outcomes: input.appealOutcomes,
      outcomeEffects: input.appealOutcomeEffects,
    },
    subjectDataLocations: input.subjectDataLocations,
  };
}
