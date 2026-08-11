import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrivacyDataPassport,
  decryptPrivatePassportIdentity,
  ensureWorkflowCreate,
  isCurrentContentModerationRevision,
  isCurrentProfileModerationRevision,
  isPrivacyRequestType,
  legalHoldPlan,
  lockedAppealVote,
  moderationReputationSignal,
  parseContentModerationRevision,
  parseProfileModerationRevision,
  privacyRequestLifecyclePlan,
  queueRouteForEvent,
  reconcilePrivacyRequestPayload,
  reputationActivity,
  retentionCleanupPlan,
  reviewerReplacementPlan,
  securityAuditRetentionPlan,
  workflowCreateFailurePlan,
} from '../src/runtime-policy.ts';

test('maps moderation outcomes into the exact reputation signals', () => {
  assert.equal(moderationReputationSignal('CONFIRMED_SPAM'), 'confirmed_spam');
  assert.equal(moderationReputationSignal('CONFIRMED_HARASSMENT'), 'confirmed_harassment');
  assert.equal(moderationReputationSignal('AUTHENTICITY_EVASION'), 'authenticity_evasion');
  assert.equal(moderationReputationSignal('DUPLICATE_CONTENT'), 'duplicate_content');
  assert.equal(moderationReputationSignal(undefined), null);
  assert.equal(moderationReputationSignal('unrelated'), null);
  assert.equal(moderationReputationSignal('AUTHENTIC_CONTENT'), null);
  assert.equal(moderationReputationSignal('SPAM_SUSPECTED'), null);
  assert.equal(moderationReputationSignal('THREAT_REVIEW'), null);
  assert.equal(moderationReputationSignal('confirmed_spam'), null);
});

test('records all reputation dispositions and fails closed for impossible inputs', () => {
  assert.equal(reputationActivity('positive').eventType, 'reputation.event_awarded');
  assert.equal(reputationActivity('negative').reputationEffect, 'negative');
  assert.equal(reputationActivity('withheld').result, 'withheld');
  assert.equal(reputationActivity('reversed').result, 'reversed');
  assert.throws(() => reputationActivity('unexpected'), /reputation_disposition_invalid/);
});

test('reconciles privacy requests against canonical outbox facts', () => {
  assert.equal(isPrivacyRequestType('export'), true);
  assert.equal(isPrivacyRequestType('delete'), true);
  assert.equal(isPrivacyRequestType('rectify'), true);
  assert.equal(isPrivacyRequestType('download'), false);
  assert.deepEqual(reconcilePrivacyRequestPayload({
    messageRequestId: 'request-1', messageRequestType: 'export', actorId: 'user-1',
  }), { requestId: 'request-1', requestType: 'export', subjectId: 'user-1' });
  assert.deepEqual(reconcilePrivacyRequestPayload({
    canonical: { aggregateId: 'request-1', actorId: 'user-1', requestType: 'delete' },
  }), { requestId: 'request-1', requestType: 'delete', subjectId: 'user-1' });
  assert.throws(() => reconcilePrivacyRequestPayload({
    messageRequestId: 'other-request', canonical: { aggregateId: 'request-1', actorId: 'user-1', requestType: 'delete' },
  }), /privacy_request_id_mismatch/);
  assert.throws(() => reconcilePrivacyRequestPayload({
    actorId: 'other-user', canonical: { aggregateId: 'request-1', actorId: 'user-1', requestType: 'delete' },
  }), /privacy_subject_mismatch/);
  assert.throws(() => reconcilePrivacyRequestPayload({
    messageRequestType: 'export', canonical: { aggregateId: 'request-1', actorId: 'user-1', requestType: 'delete' },
  }), /privacy_request_type_mismatch/);
  assert.throws(() => reconcilePrivacyRequestPayload({ messageRequestId: 'request-1' }), /privacy_event_invalid/);
});

test('plans privacy request, legal-hold, and retention workflow states', () => {
  assert.equal(privacyRequestLifecyclePlan('export').workflow, 'export');
  assert.equal(privacyRequestLifecyclePlan('delete').activity?.eventType, 'privacy.deletion_requested');
  assert.deepEqual(privacyRequestLifecyclePlan('rectify'), {});
  assert.deepEqual(legalHoldPlan(undefined), { state: 'proceed' });
  assert.deepEqual(legalHoldPlan('hold-1'), {
    state: 'blocked', legalHoldId: 'hold-1', requestEventType: 'blocked_legal_hold',
    activity: {
      eventType: 'privacy.deletion_state_changed', title: 'Account deletion is paused',
      explanation: 'Your deletion request is paused while an active legal restriction applies.',
      result: 'withheld', reasonCode: 'LEGAL_HOLD',
    },
  });
  assert.equal(retentionCleanupPlan(true, 'post'), 'skip');
  assert.equal(retentionCleanupPlan(false, 'post'), 'redact_posts');
  assert.equal(retentionCleanupPlan(false, 'posts'), 'redact_posts');
  assert.equal(retentionCleanupPlan(false, 'media'), 'delete_media');
  assert.equal(retentionCleanupPlan(false, 'comment'), 'skip');
  assert.deepEqual(securityAuditRetentionPlan(), { retentionDays: 365 });
});

test('only allows the current canonical content revision into moderation', () => {
  const revision = parseContentModerationRevision({
    eventId: 'event-1',
    contentIdField: 'postId',
    payload: {
      postId: 'post-1', sourceEventId: 'event-1', declaredCreationMode: 'human',
      bodyHash: 'a'.repeat(64),
    },
  });
  assert.deepEqual(revision, {
    contentId: 'post-1', sourceEventId: 'event-1', declaredCreationMode: 'human', bodyHash: 'a'.repeat(64),
  });
  const canonical = {
    contentId: 'post-1', sourceEventId: 'event-1', declaredCreationMode: 'human',
    bodyHash: 'a'.repeat(64), moderationState: 'under_review', deletedAt: null,
  };
  assert.equal(isCurrentContentModerationRevision({ revision, canonical }), true);
  assert.equal(isCurrentContentModerationRevision({ revision, canonical: { ...canonical, sourceEventId: 'event-2' } }), false);
  assert.equal(isCurrentContentModerationRevision({ revision, canonical: { ...canonical, bodyHash: 'b'.repeat(64) } }), false);
  assert.equal(isCurrentContentModerationRevision({ revision, canonical: { ...canonical, declaredCreationMode: 'ai_assisted' } }), false);
  assert.equal(isCurrentContentModerationRevision({ revision, canonical: { ...canonical, moderationState: 'allowed' } }), false);
  assert.equal(isCurrentContentModerationRevision({ revision, canonical: { ...canonical, deletedAt: '2026-08-11T00:00:00.000Z' } }), false);
  assert.equal(isCurrentContentModerationRevision({ revision, canonical: undefined }), false);
  assert.throws(() => parseContentModerationRevision({
    eventId: 'event-1', contentIdField: 'commentId',
    payload: { commentId: 'comment-1', sourceEventId: 'event-2', declaredCreationMode: 'human', bodyHash: 'a'.repeat(64) },
  }), /content_event_invalid/);
  assert.throws(() => parseContentModerationRevision({
    eventId: 'event-1', contentIdField: 'commentId',
    payload: { commentId: 'comment-1', sourceEventId: 'event-1', declaredCreationMode: 'ai_generated', bodyHash: 'a'.repeat(64) },
  }), /content_event_invalid/);
  assert.throws(() => parseContentModerationRevision({
    eventId: 'event-1', contentIdField: 'commentId',
    payload: { commentId: 'comment-1', sourceEventId: 'event-1', declaredCreationMode: 'human', bodyHash: 'not-a-hash' },
  }), /content_event_invalid/);
});

test('only allows a current active canonical profile revision into moderation without PII in the event', () => {
  const revision = parseProfileModerationRevision({
    eventId: 'event-1',
    payload: { userId: 'user-1', sourceEventId: 'event-1', changedFields: ['displayName', 'bio'] },
  });
  assert.deepEqual(revision, {
    userId: 'user-1', sourceEventId: 'event-1', changedFields: ['displayName', 'bio'],
  });
  const canonical = {
    userId: 'user-1', sourceEventId: 'event-1', moderationState: 'under_review', userStatus: 'active',
  };
  assert.equal(isCurrentProfileModerationRevision({ revision, canonical }), true);
  assert.equal(isCurrentProfileModerationRevision({ revision, canonical: { ...canonical, sourceEventId: 'event-2' } }), false);
  assert.equal(isCurrentProfileModerationRevision({ revision, canonical: { ...canonical, moderationState: 'allowed' } }), false);
  assert.equal(isCurrentProfileModerationRevision({ revision, canonical: { ...canonical, userStatus: 'deleted' } }), false);
  assert.equal(isCurrentProfileModerationRevision({ revision, canonical: undefined }), false);
  assert.throws(() => parseProfileModerationRevision({
    eventId: 'event-1', payload: { userId: 'user-1', sourceEventId: 'event-2', changedFields: ['bio'] },
  }), /profile_event_invalid/);
  assert.throws(() => parseProfileModerationRevision({
    eventId: 'event-1', payload: { userId: 'user-1', sourceEventId: 'event-1', changedFields: ['email'] },
  }), /profile_event_invalid/);
  assert.throws(() => parseProfileModerationRevision({
    eventId: 'event-1', payload: { userId: 'user-1', sourceEventId: 'event-1', changedFields: [] },
  }), /profile_event_invalid/);
});

test('decrypts private passport fields only with the configured export key', async () => {
  const decrypted = [];
  const decrypt = async (field, key) => {
    decrypted.push([field, key]);
    return field.ciphertext === 'profile-ciphertext'
      ? JSON.stringify({ accountabilityName: 'Private Name' })
      : 'person@example.test';
  };
  assert.deepEqual(await decryptPrivatePassportIdentity({ encryptionKey: undefined, decrypt }), {
    privateProfile: null, contactEmail: null,
  });
  assert.deepEqual(await decryptPrivatePassportIdentity({
    encryptionKey: 'key', decrypt,
    privateProfile: { ciphertext: 'profile-ciphertext', encryptionKeyVersion: 'v1' },
    contactEmail: { ciphertext: 'email-ciphertext', encryptionKeyVersion: 'v1' },
  }), {
    privateProfile: { accountabilityName: 'Private Name' }, contactEmail: 'person@example.test',
  });
  assert.deepEqual(decrypted, [
    [{ ciphertext: 'profile-ciphertext', encryptionKeyVersion: 'v1' }, 'key'],
    [{ ciphertext: 'email-ciphertext', encryptionKeyVersion: 'v1' }, 'key'],
  ]);
  await assert.rejects(() => decryptPrivatePassportIdentity({
    encryptionKey: undefined, decrypt, contactEmail: { ciphertext: 'email-ciphertext', encryptionKeyVersion: 'v1' },
  }), /private_export_encryption_key_not_configured/);
  await assert.rejects(() => decryptPrivatePassportIdentity({
    encryptionKey: 'key', decrypt: async () => '{}', privateProfile: { ciphertext: 'profile-ciphertext', encryptionKeyVersion: 'v1' },
  }), /private_profile_export_invalid/);
  await assert.rejects(() => decryptPrivatePassportIdentity({
    encryptionKey: 'key', decrypt: async () => '   ', contactEmail: { ciphertext: 'email-ciphertext', encryptionKeyVersion: 'v1' },
  }), /private_contact_email_export_invalid/);
});

test('preserves reviewer qualification snapshots and recuses invalid vote circumstances', () => {
  assert.deepEqual(reviewerReplacementPlan(5, false), { level: 5, voteWeight: 2 });
  assert.deepEqual(reviewerReplacementPlan(5, true), { level: 5, voteWeight: 1 });
  assert.deepEqual(reviewerReplacementPlan(4, false), { level: 4, voteWeight: 1 });
  assert.throws(() => reviewerReplacementPlan(Number.NaN, false), /appeal_reviewer_level_invalid/);
  assert.throws(() => reviewerReplacementPlan(-1, false), /appeal_reviewer_level_invalid/);
  assert.throws(() => reviewerReplacementPlan(6, false), /appeal_reviewer_level_invalid/);

  const validVote = {
    reviewerId: 'reviewer-1', decision: 'overturn', qualificationSnapshot: 'trained',
    levelSnapshot: 5, voteWeightSnapshot: 2, assignmentState: 'voted',
    conflictChecked: true, currentQualificationState: 'trained',
  };
  assert.deepEqual(lockedAppealVote(validVote), {
    reviewerId: 'reviewer-1', decision: 'overturn', qualificationSnapshot: 'trained',
    levelSnapshot: 5, voteWeightSnapshot: 2, locked: true, recused: false,
  });
  assert.equal(lockedAppealVote({ ...validVote, assignmentState: 'recused' }).recused, true);
  assert.equal(lockedAppealVote({ ...validVote, conflictChecked: false }).recused, true);
  assert.equal(lockedAppealVote({ ...validVote, currentQualificationState: 'suspended' }).recused, true);
  assert.throws(() => lockedAppealVote({ ...validVote, decision: 'abstain' }), /appeal_vote_decision_invalid/);
  assert.throws(() => lockedAppealVote({ ...validVote, qualificationSnapshot: 'suspended' }), /appeal_vote_qualification_invalid/);
  assert.throws(() => lockedAppealVote({ ...validVote, levelSnapshot: 9 }), /appeal_vote_level_invalid/);
  assert.throws(() => lockedAppealVote({ ...validVote, voteWeightSnapshot: 3 }), /appeal_vote_weight_invalid/);
});

test('routes every worker queue family and preserves a complete privacy data passport', () => {
  assert.equal(queueRouteForEvent('content.post.created'), 'moderation');
  assert.equal(queueRouteForEvent('moderation.content.blocked'), 'moderation');
  assert.equal(queueRouteForEvent('feed.refresh'), 'feed');
  assert.equal(queueRouteForEvent('notification.push'), 'notifications');
  assert.equal(queueRouteForEvent('media.approved'), 'media');
  assert.equal(queueRouteForEvent('privacy.requested'), 'privacy');
  assert.equal(queueRouteForEvent('system.audit'), 'audit');

  const passport = buildPrivacyDataPassport({
    generatedAt: '2026-08-11T00:00:00.000Z', profile: { id: 'user-1' }, privateProfile: { accountabilityName: 'Private Name' },
    contactEmail: 'person@example.test',
    consentRecords: [{ id: 'consent-1', purpose: 'privacy', granted: true }],
    entitlement: { subscriptionTier: 'black' }, rewardRedemptions: [{ id: 'reward-1' }], accountEvents: [{ id: 'account-event-1', eventType: 'email_login' }],
    posts: [{ id: 'post-1' }], comments: [{ id: 'comment-1' }], follows: [{ followedId: 'user-2' }],
    reactions: [{ postId: 'post-1', reactionType: 'like' }], blocks: [{ blockedId: 'user-3' }],
    mutes: [{ mutedId: 'user-4' }], bookmarks: [{ postId: 'post-2' }],
    customFeeds: [{ id: 'feed-1', rules: [{ id: 'rule-1' }] }], submittedFlags: [{ id: 'flag-1' }],
    media: [{ id: 'media-1' }], provenance: [{ contentId: 'post-1' }], humanContribution: [{ contentId: 'post-1' }],
    reputationProfile: { userId: 'user-1' }, reputationEvents: [{ id: 'rep-1' }], accountabilitySignals: [{ id: 'signal-1' }],
    notificationPreferences: { emailEnabled: true }, notificationDevices: [{ id: 'device-1' }], activity: [{ id: 'activity-1' }],
    submittedAppeals: [{ id: 'appeal-1' }], reviewerQualification: { state: 'trained' }, appealAssignments: [{ id: 'assignment-1' }],
    appealVotes: [{ id: 'vote-1' }], appealAdjudications: [{ id: 'adjudication-1' }], appealOutcomes: [{ id: 'outcome-1' }],
    appealOutcomeEffects: [{ id: 'effect-1' }], subjectDataLocations: [{ resourceReference: 'social.custom_feeds' }],
  });
  assert.equal(passport.schemaVersion, 'lythaus-data-passport-v3');
  assert.equal(passport.contactEmail, 'person@example.test');
  assert.deepEqual(passport.consentRecords, [{ id: 'consent-1', purpose: 'privacy', granted: true }]);
  assert.deepEqual(passport.entitlement, { subscriptionTier: 'black' });
  assert.deepEqual(passport.rewardRedemptions, [{ id: 'reward-1' }]);
  assert.deepEqual(passport.accountEvents, [{ id: 'account-event-1', eventType: 'email_login' }]);
  assert.deepEqual(passport.customFeeds, [{ id: 'feed-1', rules: [{ id: 'rule-1' }] }]);
  assert.deepEqual(passport.submittedFlags, [{ id: 'flag-1' }]);
  assert.deepEqual(passport.reactions, [{ postId: 'post-1', reactionType: 'like' }]);
  assert.deepEqual(passport.appeals, {
    submitted: [{ id: 'appeal-1' }], reviewerQualification: { state: 'trained' }, assignments: [{ id: 'assignment-1' }],
    votes: [{ id: 'vote-1' }], adjudications: [{ id: 'adjudication-1' }], outcomes: [{ id: 'outcome-1' }], outcomeEffects: [{ id: 'effect-1' }],
  });
});

test('workflow retry classification accepts only deterministic existing-instance conflicts', () => {
  assert.equal(workflowCreateFailurePlan('Workflow instance already exists'), 'already_exists');
  assert.equal(workflowCreateFailurePlan('instance appeal-1 already started'), 'already_exists');
  assert.equal(workflowCreateFailurePlan('HTTP 409 conflict'), 'already_exists');
  assert.equal(workflowCreateFailurePlan('workflow binding unavailable'), 'throw');
  assert.equal(workflowCreateFailurePlan(undefined), 'throw');
});

test('workflow creation keeps an existing deterministic instance as a successful retry', async () => {
  const created = [];
  assert.equal(await ensureWorkflowCreate({
    async create(input) { created.push(input); },
  }, 'privacy-delete-request-1', { subjectId: 'user-1' }), 'created');
  assert.deepEqual(created, [{ id: 'privacy-delete-request-1', params: { subjectId: 'user-1' } }]);
  assert.equal(await ensureWorkflowCreate({
    async create() { throw new Error('Workflow instance already exists'); },
  }, 'privacy-delete-request-1', { subjectId: 'user-1' }), 'already_exists');
  await assert.rejects(() => ensureWorkflowCreate({
    async create() { throw new Error('workflow binding unavailable'); },
  }, 'privacy-delete-request-1', { subjectId: 'user-1' }), /workflow binding unavailable/);
});
