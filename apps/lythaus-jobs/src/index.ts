import { databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, query, reconcileBudgetReservation, recordReputationSignal, recordUserActivity, refreshReputationProfile, reserveBudget, settleBudgetReservation, transaction, type BudgetConfig, type DatabaseClient, type HyperdriveBinding, type ReputationMutationResult } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { evaluateAuthenticity, type AuthenticityEvaluation } from '@lythaus/authenticity';
import { ACTIVITY_POLICY_VERSION, APPEAL_POLICY, evaluateAppeal, selectAppealReviewers, type ActivityEventInput, type AppealReviewerCandidate, type AppealRiskClass, type AppealVote, type ReputationSignalType } from '@lythaus/contracts';
import { MAX_IMAGE_BYTES } from '@lythaus/media';
import { json, logEvent } from '@lythaus/observability';
import { constantTimeEqual, decryptField, uuidv7 } from '@lythaus/security';
import { buildPrivacyDataPassport, decryptPrivatePassportIdentity, ensureWorkflowCreate, isCurrentContentModerationRevision, isCurrentProfileModerationRevision, legalHoldPlan, lockedAppealVote, moderationReputationSignal, parseContentModerationRevision, parseProfileModerationRevision, privacyRequestLifecyclePlan, queueRouteForEvent, reconcilePrivacyRequestPayload, reputationActivity, retentionCleanupPlan, reviewerReplacementPlan, securityAuditRetentionPlan, type PrivacyRequestPayload, type WorkflowCreateBinding } from './runtime-policy.ts';
import { handleTransactionalEmailLifecycleWebhook, relayTransactionalEmailOutbox } from './transactional-email-runtime.ts';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env extends EnvBindings {
  WORKER_VERSION: NonNullable<EnvBindings['WORKER_VERSION']>;
  DB_JOBS_FRESH: HyperdriveBinding;
  DB_PRIVACY_FRESH: HyperdriveBinding;
  MODERATION_QUEUE?: Queue;
  FEED_QUEUE?: Queue;
  NOTIFICATIONS_QUEUE?: Queue;
  MEDIA_QUEUE?: Queue;
  PRIVACY_QUEUE?: Queue;
  AUDIT_QUEUE?: Queue;
  MEDIA_QUARANTINE?: NonNullable<EnvBindings['MEDIA_QUARANTINE']>;
  MEDIA_APPROVED?: NonNullable<EnvBindings['MEDIA_APPROVED']>;
  IMAGES?: NonNullable<EnvBindings['IMAGES']>;
  PRIVATE_EXPORTS?: NonNullable<EnvBindings['PRIVATE_EXPORTS']>;
  ACCOUNT_DELETE?: WorkflowCreateBinding<{ subjectId: string; requestId: string }>;
  ACCOUNT_EXPORT?: WorkflowCreateBinding<{ subjectId: string; requestId: string }>;
  RETENTION_CLEANUP?: WorkflowCreateBinding<{ runId: string }>;
  APPEAL_LIFECYCLE?: WorkflowCreateBinding<{ appealId: string }>;
  BACKUP_VALIDATION?: WorkflowCreateBinding<{ runId: string }>;
  APPEAL_ASSIGNMENT_SECRET?: string;
}

async function deleteR2Prefix(bucket: NonNullable<EnvBindings['PRIVATE_EXPORTS']>, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1_000 });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

function hasReadinessAuthorization(request: Request, env: Env): boolean {
  const configured = env.DATABASE_READINESS_TOKEN;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configured || !supplied) return false;
  return constantTimeEqual(new TextEncoder().encode(configured), new TextEncoder().encode(supplied));
}

function budgetConfig(env: Env): BudgetConfig {
  if (env.COST_BUDGET_ENABLED !== 'true') throw new Error('budget_not_configured');
  const value = (candidate: string | undefined, fallback: number): number => {
    const parsed = Number(candidate ?? fallback);
    if (!Number.isFinite(parsed)) throw new Error('budget_config_invalid');
    return parsed;
  };
  return {
    limitUsd: value(env.COST_BUDGET_LIMIT_USD, 100),
    warningUsd: value(env.COST_BUDGET_WARNING_USD, 70),
    optionalAnalysisUsd: value(env.COST_BUDGET_OPTIONAL_ANALYSIS_USD, 80),
    essentialOnlyUsd: value(env.COST_BUDGET_ESSENTIAL_ONLY_USD, 90),
    deepScanStopUsd: value(env.COST_BUDGET_DEEP_SCAN_STOP_USD, 95),
  };
}

async function withBudgetAdmission<T>(env: Env, input: { operation: string; operationClass: 'essential' | 'optional' | 'experiment'; estimatedCostUsd: number; idempotencyKey: string; provider?: string; correlationId?: string }, work: () => Promise<T>): Promise<T> {
  const provider = input.provider ?? 'workers-ai';
  const reservation = await reserveBudget(env.DB_JOBS_FRESH, {
    ...input,
    provider,
    period: new Date().toISOString().slice(0, 7),
    config: budgetConfig(env),
  });
  logEvent({ service: 'lythaus-jobs', event: 'budget_reservation', operation: input.operation, provider, status: reservation.status, estimatedCostUsd: input.estimatedCostUsd, projectedSpendUsd: reservation.projectedSpendUsd, reused: reservation.reused });
  if (reservation.status !== 'reserved') throw new Error('budget_operation_rejected');
  let result: T;
  try {
    result = await work();
  } catch (error) {
    await reconcileBudgetReservation(env.DB_JOBS_FRESH, {
      reservationId: reservation.id,
      actualCostUsd: input.estimatedCostUsd,
      provider,
      externalReference: input.idempotencyKey,
      reason: 'provider_error',
    });
    logEvent({ service: 'lythaus-jobs', event: 'budget_reconciliation', operation: input.operation, provider, status: 'reconciled', actualCostUsd: input.estimatedCostUsd });
    throw error;
  }
  try {
    await settleBudgetReservation(env.DB_JOBS_FRESH, {
      reservationId: reservation.id,
      actualCostUsd: input.estimatedCostUsd,
      provider,
      externalReference: input.idempotencyKey,
    });
    logEvent({ service: 'lythaus-jobs', event: 'budget_settlement', operation: input.operation, provider, status: 'committed', actualCostUsd: input.estimatedCostUsd });
  } catch {
    await reconcileBudgetReservation(env.DB_JOBS_FRESH, {
      reservationId: reservation.id,
      actualCostUsd: input.estimatedCostUsd,
      provider,
      externalReference: input.idempotencyKey,
      reason: 'settlement_error',
    });
    logEvent({ service: 'lythaus-jobs', event: 'budget_reconciliation', operation: input.operation, provider, status: 'reconciled', actualCostUsd: input.estimatedCostUsd });
  }
  return result;
}

async function simulateBudgetHardStop(env: Env): Promise<Record<string, unknown>> {
  const config = budgetConfig(env);
  const reservation = await reserveBudget(env.DB_JOBS_FRESH, {
    period: new Date().toISOString().slice(0, 7),
    operation: 'budget_hard_stop_simulation',
    operationClass: 'optional',
    estimatedCostUsd: config.limitUsd,
    idempotencyKey: `budget-simulation:${uuidv7()}`,
    provider: 'simulation',
    config,
  });
  return {
    simulation: 'budget_hard_stop',
    reservationStatus: reservation.status,
    providerCallPermitted: false,
    ledgerAvailable: true,
    readiness: reservation.status === 'rejected' ? 'pass' : 'fail',
  };
}

async function runWorkersAiWithBudget(env: Env, model: string, input: unknown, idempotencyKey: string, estimatedCostUsd = 0.004): Promise<unknown> {
  if (!env.AI) throw new Error('workers_ai_not_configured');
  const gatewayId = env.AI_GATEWAY_ID;
  if (gatewayId !== 'lythaus-ai') throw new Error('workers_ai_gateway_not_configured');
  return withBudgetAdmission(env, {
    operation: `workers_ai:${model}`,
    operationClass: 'optional',
    estimatedCostUsd,
    idempotencyKey,
    provider: 'workers-ai',
  }, () => env.AI!.run(model, input, {
    gateway: { id: env.AI_GATEWAY_ID as 'lythaus-ai', skipCache: true },
    collectLog: false,
    metadata: { application: 'lythaus', environment: env.ENVIRONMENT ?? 'unknown' },
  }));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recordAiEvidence(env: Env, input: {
  caseId: string;
  correlationId: string;
  inputHash: string;
  evidenceBundleHash: string;
  provider: string;
  modelId: string;
  gatewayId: string | null;
  promptTemplateVersion: string;
  reasoningSchemaVersion: string;
  toolVersions: Record<string, string>;
  policyVersion: string;
  responseHash: string;
  latencyMs: number;
  estimatedUsageUsd: number;
  actualUsageUsd: number;
}): Promise<void> {
  await query(env.DB_JOBS_FRESH,
    `INSERT INTO system.audit_events
       (id, action, target_type, target_id, reason_code, correlation_id, metadata)
     VALUES ($1, 'ai.reasoning.completed', 'content', $2, 'STRUCTURED_AI_EVIDENCE', $3, $4::jsonb)`,
    [uuidv7(), input.caseId, input.correlationId, JSON.stringify({
      inputHash: input.inputHash,
      evidenceBundleHash: input.evidenceBundleHash,
      provider: input.provider,
      modelId: input.modelId,
      gatewayId: input.gatewayId,
      promptTemplateVersion: input.promptTemplateVersion,
      reasoningSchemaVersion: input.reasoningSchemaVersion,
      toolVersions: input.toolVersions,
      policyVersion: input.policyVersion,
      responseHash: input.responseHash,
      latencyMs: input.latencyMs,
      estimatedUsageUsd: input.estimatedUsageUsd,
      actualUsageUsd: input.actualUsageUsd,
    })]
  );
}

interface Queue { send(body: unknown, options?: { contentType?: string }): Promise<void>; }
interface QueueMessage {
  id: string;
  body: { eventId?: string; eventType?: string; [key: string]: unknown };
  ack(): void;
  retry(): void;
}

interface QueueBatch {
  queue: string;
  messages: QueueMessage[];
}

type ActivityWriteInput = Omit<ActivityEventInput, 'id' | 'createdAt'>;

async function recordActivityAndNotification(
  env: Env,
  input: ActivityWriteInput & { notification?: { type: string; entityId: string } },
): Promise<void> {
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const activity = await recordUserActivity(client, {
      ...input,
      id: uuidv7(),
      createdAt: new Date().toISOString(),
    });
    if (!input.notification) return;
    await client.query(
      `INSERT INTO feed.notifications
         (id, recipient_id, notification_type, entity_id, source_event_id, policy_version, activity_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [
        uuidv7(),
        input.userId,
        input.notification.type,
        input.notification.entityId,
        input.sourceEventId,
        input.policyVersion ?? ACTIVITY_POLICY_VERSION,
        activity.id,
      ],
    );
  });
}

interface CanonicalOutboxEvent {
  event_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function recordReputationActivity(
  client: DatabaseClient,
  mutation: ReputationMutationResult,
  sourceEventId: string,
  correlationId: string,
): Promise<void> {
  if (!mutation.created) return;
  const details = reputationActivity(mutation.disposition);
  await recordUserActivity(client, {
    id: uuidv7(),
    userId: mutation.profile.userId,
    eventType: details.eventType,
    category: 'reputation',
    source: 'jobs',
    sourceEventId,
    correlationId,
    title: details.title,
    explanation: details.explanation,
    result: details.result,
    reasonCode: mutation.event.explanationCode,
    policyVersion: mutation.event.policyVersion,
    objectType: mutation.event.contentId ? 'content' : 'reputation_event',
    objectId: mutation.event.contentId ?? mutation.event.id,
    reputationEffect: details.reputationEffect,
    appealable: mutation.disposition === 'negative',
    retentionClass: mutation.disposition === 'negative' || mutation.disposition === 'reversed' ? 'moderation' : 'ordinary',
    metadata: {
      pillar: mutation.event.pillar ?? 'none',
      levelBefore: mutation.previousLevel,
      levelAfter: mutation.profile.currentLevel,
      explanationCode: mutation.event.explanationCode,
    },
    createdAt: new Date().toISOString(),
  });
  if (mutation.profile.currentLevel === mutation.previousLevel) return;
  const promoted = mutation.profile.currentLevel > mutation.previousLevel;
  const levelActivity = await recordUserActivity(client, {
    id: uuidv7(),
    userId: mutation.profile.userId,
    eventType: promoted ? 'reputation.level_promoted' : 'reputation.level_demoted',
    category: 'reputation',
    source: 'jobs',
    sourceEventId,
    correlationId,
    title: promoted ? 'Reputation level increased' : 'Reputation level decreased',
    explanation: promoted
      ? 'Your current evidence and eligibility gates now qualify for a higher reputation level.'
      : 'Your current evidence or eligibility gates no longer qualify for the previous reputation level.',
    result: 'succeeded',
    policyVersion: mutation.event.policyVersion,
    objectType: 'reputation_profile',
    objectId: mutation.profile.userId,
    reputationEffect: promoted ? 'positive' : 'negative',
    appealable: !promoted,
    retentionClass: promoted ? 'ordinary' : 'moderation',
    metadata: {
      pillar: mutation.event.pillar ?? 'none',
      levelBefore: mutation.previousLevel,
      levelAfter: mutation.profile.currentLevel,
      explanationCode: promoted ? 'promotion_gates_satisfied' : 'promotion_gates_no_longer_satisfied',
    },
    createdAt: new Date().toISOString(),
  });
  await client.query(
    `INSERT INTO feed.notifications
       (id, recipient_id, notification_type, entity_id, source_event_id, policy_version, activity_event_id)
     SELECT $1, $2, $3, $2, $4, $5, $6
      WHERE COALESCE((SELECT rewards_enabled FROM feed.notification_preferences WHERE user_id = $2), true)
     ON CONFLICT DO NOTHING`,
    [uuidv7(), mutation.profile.userId, promoted ? 'reputation.level_promoted' : 'reputation.level_demoted', sourceEventId, mutation.event.policyVersion, levelActivity.id],
  );
}

async function canonicalOutboxEvent(
  client: DatabaseClient,
  eventId: string,
  eventType: string,
): Promise<CanonicalOutboxEvent> {
  const result = await client.query<CanonicalOutboxEvent>(
    `SELECT event_type, actor_id, payload, created_at
       FROM system.outbox_events
      WHERE id = $1 AND event_type = $2`,
    [eventId, eventType],
  );
  if (!result.rows[0]) throw new Error('reputation_source_event_invalid');
  return result.rows[0];
}

type NotificationPreferenceClass = 'always' | 'replies' | 'moderation' | 'rewards';

async function insertPreferenceAwareNotification(
  client: DatabaseClient,
  input: {
    recipientId: string;
    notificationType: string;
    entityId: string;
    sourceEventId: string;
    policyVersion: string;
    preferenceClass: NotificationPreferenceClass;
    activityEventId?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO feed.notifications
       (id, recipient_id, notification_type, entity_id, source_event_id, policy_version, activity_event_id)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE CASE $8
        WHEN 'replies' THEN COALESCE((SELECT replies_enabled FROM feed.notification_preferences WHERE user_id = $2), true)
        WHEN 'moderation' THEN COALESCE((SELECT moderation_enabled FROM feed.notification_preferences WHERE user_id = $2), true)
        WHEN 'rewards' THEN COALESCE((SELECT rewards_enabled FROM feed.notification_preferences WHERE user_id = $2), true)
        ELSE true
      END
     ON CONFLICT DO NOTHING`,
    [
      uuidv7(),
      input.recipientId,
      input.notificationType,
      input.entityId,
      input.sourceEventId,
      input.policyVersion,
      input.activityEventId ?? null,
      input.preferenceClass,
    ],
  );
}

async function processNotificationSource(message: QueueMessage, env: Env, eventId: string, eventType: string): Promise<void> {
  if (![
    'content.comment.published',
    'social.follow.created',
    'moderation.reviewer.qualification_changed',
  ].includes(eventType)) return;
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const source = await canonicalOutboxEvent(client, eventId, eventType);
    const payload = source.payload;
    if (eventType === 'content.comment.published') {
      const authorId = stringValue(payload.authorId);
      const commentId = stringValue(payload.contentId);
      const postId = stringValue(payload.postId);
      const parentId = stringValue(payload.parentId);
      if (!authorId || !commentId || !postId) throw new Error('comment_notification_event_invalid');
      const recipient = await client.query<{ recipient_id: string }>(
        parentId
          ? `SELECT parent.author_id AS recipient_id
               FROM content.comments parent
              WHERE parent.id = $1 AND parent.author_id <> $2
                AND NOT EXISTS (
                  SELECT 1 FROM social.blocks block
                   WHERE (block.blocker_id = parent.author_id AND block.blocked_id = $2)
                      OR (block.blocker_id = $2 AND block.blocked_id = parent.author_id)
                )`
          : `SELECT post.author_id AS recipient_id
               FROM content.posts post
              WHERE post.id = $1 AND post.author_id <> $2
                AND NOT EXISTS (
                  SELECT 1 FROM social.blocks block
                   WHERE (block.blocker_id = post.author_id AND block.blocked_id = $2)
                      OR (block.blocker_id = $2 AND block.blocked_id = post.author_id)
                )`,
        [parentId ?? postId, authorId],
      );
      if (recipient.rows[0]) await insertPreferenceAwareNotification(client, {
        recipientId: recipient.rows[0].recipient_id,
        notificationType: parentId ? 'content.reply_received' : 'content.comment_received',
        entityId: commentId,
        sourceEventId: eventId,
        policyVersion: ACTIVITY_POLICY_VERSION,
        preferenceClass: 'replies',
      });
      return;
    }
    if (eventType === 'social.follow.created') {
      const followerId = stringValue(payload.followerId);
      const followedId = stringValue(payload.followedId);
      if (!followerId || !followedId || followerId === followedId) throw new Error('follow_notification_event_invalid');
      const allowed = await client.query(
        `SELECT 1 FROM identity.users recipient
          WHERE recipient.id = $1 AND recipient.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM social.blocks block
               WHERE (block.blocker_id = $1 AND block.blocked_id = $2)
                  OR (block.blocker_id = $2 AND block.blocked_id = $1)
            )`,
        [followedId, followerId],
      );
      if (allowed.rowCount !== 0) await insertPreferenceAwareNotification(client, {
        recipientId: followedId,
        notificationType: 'social.follow_received',
        entityId: followerId,
        sourceEventId: eventId,
        policyVersion: ACTIVITY_POLICY_VERSION,
        preferenceClass: 'always',
      });
      return;
    }
    const reviewerId = stringValue(payload.reviewerId);
    if (!reviewerId) throw new Error('reviewer_notification_event_invalid');
    if (payload.state === 'suspended') {
      const assignments = await client.query<{ id: string; appeal_id: string }>(
        `SELECT assignment.id, assignment.appeal_id
           FROM moderation.appeal_assignments assignment
           JOIN moderation.appeals appeal ON appeal.id = assignment.appeal_id
          WHERE assignment.reviewer_id = $1
            AND assignment.state IN ('assigned', 'voted')
            AND appeal.state = 'open'
          FOR UPDATE OF assignment`,
        [reviewerId],
      );
      for (const assignment of assignments.rows) {
        await client.query(
          `UPDATE moderation.appeal_assignments
              SET state = 'recused', recused_at = now()
            WHERE id = $1 AND state IN ('assigned', 'voted')`,
          [assignment.id],
        );
        await client.query(
          `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
           VALUES ($1, 'moderation.appeal.reviewer_recused', 'appeal', $2, $3, $4::jsonb),
                  ($5, 'moderation.appeal.vote_locked', 'appeal', $2, $3, $6::jsonb)`,
          [
            uuidv7(),
            assignment.appeal_id,
            source.actor_id,
            JSON.stringify({ appealId: assignment.appeal_id, assignmentId: assignment.id }),
            uuidv7(),
            JSON.stringify({ appealId: assignment.appeal_id, reason: 'reviewer_suspended_recompute' }),
          ],
        );
      }
    }
    await insertPreferenceAwareNotification(client, {
      recipientId: reviewerId,
      notificationType: 'appeals.reviewer_qualification_changed',
      entityId: reviewerId,
      sourceEventId: eventId,
      policyVersion: APPEAL_POLICY.version,
      preferenceClass: 'moderation',
    });
  });
}

async function processAccountStandingRefresh(message: QueueMessage, env: Env, eventId: string): Promise<void> {
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const source = await canonicalOutboxEvent(client, eventId, 'identity.account.status_changed');
    const userId = stringValue(source.payload.userId);
    if (!userId) throw new Error('account_status_event_invalid');
    const refreshed = await refreshReputationProfile(client, userId);
    if (refreshed.previousLevel === refreshed.profile.currentLevel) return;
    const promoted = refreshed.profile.currentLevel > refreshed.previousLevel;
    const activity = await recordUserActivity(client, {
      id: uuidv7(),
      userId,
      eventType: promoted ? 'reputation.level_promoted' : 'reputation.level_demoted',
      category: 'reputation',
      source: 'jobs',
      sourceEventId: eventId,
      correlationId: stringValue(message.body.correlationId) ?? eventId,
      title: promoted ? 'Reputation level increased' : 'Reputation level decreased',
      explanation: promoted
        ? 'Your account standing and current evidence again satisfy the higher level gates.'
        : 'Your account standing no longer satisfies the previous reputation level gates.',
      result: 'succeeded',
      policyVersion: refreshed.profile.policyVersion,
      objectType: 'reputation_profile',
      objectId: userId,
      reputationEffect: promoted ? 'positive' : 'negative',
      appealable: !promoted,
      retentionClass: 'moderation',
      metadata: {
        pillar: 'none',
        levelBefore: refreshed.previousLevel,
        levelAfter: refreshed.profile.currentLevel,
        explanationCode: promoted ? 'account_standing_restored' : 'account_standing_restricted',
      },
      createdAt: new Date().toISOString(),
    });
    await insertPreferenceAwareNotification(client, {
      recipientId: userId,
      notificationType: promoted ? 'reputation.level_promoted' : 'reputation.level_demoted',
      entityId: userId,
      sourceEventId: eventId,
      policyVersion: refreshed.profile.policyVersion,
      preferenceClass: 'rewards',
      activityEventId: activity.id,
    });
  });
}

async function processSingleReputationSignal(
  env: Env,
  input: {
    eventId: string;
    eventType: string;
    signalType: ReputationSignalType;
    subjectUserId: string;
    contentId?: string;
    moderationDecisionId?: string;
    appealId?: string;
    reversalReference?: string;
    occurredAt: string;
    correlationId: string;
  },
): Promise<void> {
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const mutation = await recordReputationSignal(client, {
      id: uuidv7(),
      subjectUserId: input.subjectUserId,
      signalType: input.signalType,
      sourceEventId: input.eventId,
      contentId: input.contentId,
      moderationDecisionId: input.moderationDecisionId,
      appealId: input.appealId,
      reversalReference: input.reversalReference,
      occurredAt: input.occurredAt,
    });
    await recordReputationActivity(client, mutation, input.eventId, input.correlationId);
  });
}

async function processReputationSource(message: QueueMessage, env: Env, eventId: string, eventType: string): Promise<void> {
  if (![
    'content.post.published',
    'content.comment.published',
    'identity.email.verified',
    'profile.accountability_identity_declared',
    'profile.accountability_identity_removed',
    'moderation.content.blocked',
  ].includes(eventType)) return;
  const source = await transaction(env.DB_JOBS_FRESH, (client) => canonicalOutboxEvent(client, eventId, eventType));
  const payload = source.payload;
  const correlationId = stringValue(message.body.correlationId) ?? eventId;
  const subjectUserId = stringValue(payload.authorId) ?? stringValue(payload.userId) ?? source.actor_id ?? undefined;
  if (!subjectUserId) throw new Error('reputation_subject_event_invalid');
  if (eventType === 'profile.accountability_identity_removed') {
    const original = await query<{ id: string }>(
      env.DB_JOBS_FRESH,
      `SELECT id FROM trust.reputation_events
        WHERE subject_user_id = $1
          AND event_type = 'accountability_identity_declared'
          AND status = 'effective'
        ORDER BY created_at DESC
        LIMIT 1`,
      [subjectUserId],
    );
    if (original.rows[0]) await processSingleReputationSignal(env, {
      eventId,
      eventType,
      signalType: 'reputation_event_reversal',
      subjectUserId,
      reversalReference: original.rows[0].id,
      occurredAt: source.created_at,
      correlationId,
    });
    return;
  }
  let signalType: ReputationSignalType | null = null;
  if (eventType === 'identity.email.verified') signalType = 'email_verified';
  if (eventType === 'profile.accountability_identity_declared') signalType = 'accountability_identity_declared';
  if (eventType === 'content.post.published' || eventType === 'content.comment.published') {
    signalType = payload.declaredCreationMode === 'human' ? 'qualifying_human_contribution' : 'ai_assisted_content';
  }
  if (eventType === 'moderation.content.blocked') signalType = moderationReputationSignal(stringValue(payload.reasonCode));
  if (!signalType) return;
  await processSingleReputationSignal(env, {
    eventId,
    eventType,
    signalType,
    subjectUserId,
    contentId: stringValue(payload.contentId),
    moderationDecisionId: stringValue(payload.decisionId),
    occurredAt: source.created_at,
    correlationId,
  });
}

async function processAppealReputationResolution(message: QueueMessage, env: Env, eventId: string): Promise<void> {
  const source = await transaction(env.DB_JOBS_FRESH, (client) => canonicalOutboxEvent(client, eventId, 'moderation.appeal.resolved'));
  const payload = source.payload;
  const appealId = stringValue(payload.appealId);
  const subjectUserId = stringValue(payload.subjectUserId);
  const finalDecision = stringValue(payload.finalDecision);
  if (!appealId || !subjectUserId || !finalDecision) throw new Error('appeal_reputation_event_invalid');
  const correlationId = stringValue(message.body.correlationId) ?? appealId;
  if (finalDecision === 'overturn') {
    const original = await query<{ id: string }>(
      env.DB_JOBS_FRESH,
      `SELECT event.id
         FROM trust.reputation_events event
        WHERE event.subject_user_id = $1
          AND event.content_id = $2
          AND event.status = 'effective'
          AND event.impact < 0
        ORDER BY event.created_at DESC
        LIMIT 1`,
      [subjectUserId, stringValue(payload.contentId)],
    );
    if (original.rows[0]) await processSingleReputationSignal(env, {
      eventId: original.rows[0].id,
      eventType: 'moderation.appeal.resolved',
      signalType: 'reputation_event_reversal',
      subjectUserId,
      contentId: stringValue(payload.contentId),
      appealId,
      reversalReference: original.rows[0].id,
      occurredAt: source.created_at,
      correlationId,
    });
  }
  const votes = await query<{ id: string; reviewer_id: string; decision: string }>(
    env.DB_JOBS_FRESH,
    `SELECT id, reviewer_id, decision FROM moderation.appeal_review_votes WHERE appeal_id = $1`,
    [appealId],
  );
  for (const vote of votes.rows) {
    if (vote.decision !== finalDecision) continue;
    await processSingleReputationSignal(env, {
      eventId: vote.id,
      eventType: 'moderation.appeal.resolved',
      signalType: 'reliable_review',
      subjectUserId: vote.reviewer_id,
      appealId,
      occurredAt: source.created_at,
      correlationId,
    });
  }
}

async function resolvePrivacyRequestPayload(env: Env, message: QueueMessage, eventId: string): Promise<PrivacyRequestPayload> {
  const payload = (message.body.payload ?? message.body) as { requestId?: unknown; requestType?: unknown };
  const outbox = await query<{ aggregate_id: string; actor_id: string | null; request_type: string | null }>(
    env.DB_JOBS_FRESH,
    `SELECT aggregate_id, actor_id, payload ->> 'requestType' AS request_type
       FROM system.outbox_events
      WHERE id = $1 AND event_type = 'privacy.request.created'`,
    [eventId],
  );
  const canonical = outbox.rows[0];
  return reconcilePrivacyRequestPayload({
    messageRequestId: payload.requestId,
    messageRequestType: payload.requestType,
    actorId: message.body.actorId,
    canonical: canonical ? {
      aggregateId: canonical.aggregate_id,
      actorId: canonical.actor_id,
      requestType: canonical.request_type,
    } : undefined,
  });
}

const MAX_IMAGE_PIXELS = 40_000_000;
const AUTHENTICITY_PROVIDER = 'lythaus-authenticity-ai';
const AUTHENTICITY_POLICY = 'evaluation-only-v1';

function hasMagicBytes(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  if (contentType === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (contentType === 'image/avif') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(new TextDecoder().decode(bytes.slice(8, 12)));
  return false;
}

function manualReviewEvaluation(kind: 'text' | 'image' | 'profile', modelId: string, reason: string): AuthenticityEvaluation {
  return {
    schemaVersion: 'lythaus-authenticity-v1',
    recommendation: 'review',
    reviewRequired: true,
    riskScore: 1,
    signals: [{ category: `${kind}_manual_review`, confidence: 1, rationale: reason }],
    modelId,
    policyVersion: AUTHENTICITY_POLICY,
  };
}

async function runAuthenticityEvaluation(env: Env, input: {
  kind: 'text' | 'image' | 'profile';
  content: string;
  contentId: string;
  declaredCreationMode?: string;
}): Promise<{ evaluation: AuthenticityEvaluation; modelExecuted: boolean; latencyMs: number }> {
  const modelId = input.kind === 'image'
    ? env.AUTHENTICITY_IMAGE_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast'
    : env.AUTHENTICITY_TEXT_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast';
  if (env.AUTHENTICITY_AI_ENABLED !== 'true') {
    return { evaluation: manualReviewEvaluation(input.kind, modelId, 'Authenticity evaluation is disabled; human review is required.'), modelExecuted: false, latencyMs: 0 };
  }
  const estimatedCost = input.kind === 'image'
    ? Number(env.COST_AUTHENTICITY_IMAGE_ESTIMATE_USD ?? 0.01)
    : Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004);
  const startedAt = Date.now();
  try {
    const evaluation = await evaluateAuthenticity({
      ...input,
      modelId,
      runModel: (model, modelInput, idempotencyKey) => runWorkersAiWithBudget(env, model, modelInput, idempotencyKey, estimatedCost),
    });
    return { evaluation, modelExecuted: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    logEvent({ service: 'lythaus-jobs', event: 'authenticity_evaluation_failed', operation: input.kind, error: error instanceof Error ? error.message : 'evaluation_failed' });
    return {
      evaluation: manualReviewEvaluation(input.kind, modelId, 'Automated evaluation was unavailable; human review is required.'),
      modelExecuted: false,
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function processPostModeration(message: QueueMessage, env: Env): Promise<void> {
  const eventId = typeof message.body.eventId === 'string' ? message.body.eventId : message.id;
  const revision = parseContentModerationRevision({
    eventId,
    payload: message.body.payload ?? message.body,
    contentIdField: 'postId',
  });
  const postResult = await query<{
    id: string;
    author_id: string;
    body: string;
    declared_creation_mode: 'human' | 'ai_assisted' | 'ai_generated';
    moderation_state: string;
    deleted_at: string | null;
    moderation_source_event_id: string | null;
  }>(
    env.DB_JOBS_FRESH,
    `SELECT id, author_id, body, declared_creation_mode, moderation_state, deleted_at, moderation_source_event_id
       FROM content.posts
      WHERE id = $1 AND deleted_at IS NULL`, [revision.contentId]
  );
  const post = postResult.rows[0];
  if (!post) return;
  const inputHash = await sha256Hex(post.body);
  if (!isCurrentContentModerationRevision({
    revision,
    canonical: {
      contentId: post.id,
      sourceEventId: post.moderation_source_event_id,
      declaredCreationMode: post.declared_creation_mode,
      bodyHash: inputHash,
      moderationState: post.moderation_state,
      deletedAt: post.deleted_at,
    },
  })) return;
  const prior = await query(env.DB_JOBS_FRESH,
    `SELECT 1 FROM moderation.detector_runs WHERE provider = $1 AND source_event_id = $2 LIMIT 1`,
    [AUTHENTICITY_PROVIDER, revision.sourceEventId]);
  if (prior.rowCount !== 0) return;
  const { evaluation, modelExecuted, latencyMs } = await runAuthenticityEvaluation(env, {
    kind: 'text', content: post.body, contentId: revision.contentId, declaredCreationMode: post.declared_creation_mode,
  });
  const modelVersion = evaluation.modelId;
  const responseHash = await sha256Hex(JSON.stringify(evaluation));
  const detectedContentClass = evaluation.signals[0]?.category ?? null;
  const declarationConflict = post.declared_creation_mode === 'human'
    && evaluation.signals.some((item) => /(^|[_:-])(ai|generated|synthetic)([_:-]|$)/i.test(item.category));
  const signal = JSON.stringify(evaluation);
  const applied = await transaction(env.DB_JOBS_FRESH, async (client) => {
    const locked = await client.query<{
      id: string;
      author_id: string;
      body: string;
      declared_creation_mode: 'human' | 'ai_assisted' | 'ai_generated';
      moderation_state: string;
      deleted_at: string | null;
      moderation_source_event_id: string | null;
    }>(
      `SELECT id, author_id, body, declared_creation_mode, moderation_state, deleted_at, moderation_source_event_id
         FROM content.posts
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [revision.contentId],
    );
    const lockedPost = locked.rows[0];
    if (!lockedPost) return false;
    const lockedInputHash = await sha256Hex(lockedPost.body);
    if (!isCurrentContentModerationRevision({
      revision,
      canonical: {
        contentId: lockedPost.id,
        sourceEventId: lockedPost.moderation_source_event_id,
        declaredCreationMode: lockedPost.declared_creation_mode,
        bodyHash: lockedInputHash,
        moderationState: lockedPost.moderation_state,
        deletedAt: lockedPost.deleted_at,
      },
    })) return false;
    const detectorRun = await client.query<{ id: string }>(
      `INSERT INTO moderation.detector_runs (id, content_type, content_id, provider, model_version, signal, source_event_id)
       VALUES ($1, 'post', $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [uuidv7(), revision.contentId, AUTHENTICITY_PROVIDER, modelVersion, signal, revision.sourceEventId],
    );
    if (detectorRun.rowCount !== 1) return false;
    await client.query(
      `UPDATE moderation.cases
          SET state = 'superseded', resolved_at = COALESCE(resolved_at, now())
        WHERE content_type = 'post' AND content_id = $1 AND state = 'open'
          AND source_event_id IS DISTINCT FROM $2`,
      [revision.contentId, revision.sourceEventId],
    );
    await client.query(
      `INSERT INTO content.content_declarations (post_id, declared_creation_mode, public_label, detector_provider, detector_model_version, detector_signal, declaration_conflict, review_required)
       VALUES ($1, $2, 'Under review', $3, $4, $5::jsonb, $6, true)
       ON CONFLICT (post_id) DO UPDATE SET declared_creation_mode = EXCLUDED.declared_creation_mode,
         public_label = EXCLUDED.public_label, detector_provider = EXCLUDED.detector_provider,
         detector_model_version = EXCLUDED.detector_model_version, detector_signal = EXCLUDED.detector_signal,
         declaration_conflict = EXCLUDED.declaration_conflict, review_required = EXCLUDED.review_required, updated_at = now()`,
      [revision.contentId, lockedPost.declared_creation_mode, AUTHENTICITY_PROVIDER, modelVersion, signal, declarationConflict]
    );
    const caseResult = await client.query<{ id: string }>(
      `INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
       VALUES ($1, 'post', $2, 'open', $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [uuidv7(), revision.contentId, AUTHENTICITY_POLICY, revision.sourceEventId]
    );
    if (caseResult.rowCount !== 1) return false;
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version) VALUES ($1, $2, 'queue', 'Under review', $3)`,
      [uuidv7(), caseResult.rows[0].id, AUTHENTICITY_POLICY]
    );
    await client.query(
      `INSERT INTO trust.provenance_events (id, content_id, author_id, declared_creation_mode, detected_content_class, detector_provider, detector_model_version, policy_version, final_decision, source_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queue', $9)`,
      [uuidv7(), revision.contentId, lockedPost.author_id, lockedPost.declared_creation_mode, detectedContentClass, AUTHENTICITY_PROVIDER, modelVersion, AUTHENTICITY_POLICY, revision.sourceEventId]
    );
    await recordUserActivity(client, {
      id: uuidv7(), userId: lockedPost.author_id, actorUserId: lockedPost.author_id,
      eventType: 'moderation.case_opened', category: 'moderation', source: 'jobs',
      sourceEventId: revision.sourceEventId,
      correlationId: typeof message.body.correlationId === 'string' ? message.body.correlationId : revision.sourceEventId,
      title: 'Post review opened',
      explanation: 'Your post entered the normal publication review process.',
      result: 'pending', reasonCode: 'PUBLIC_POST_REVIEW', policyVersion: AUTHENTICITY_POLICY,
      objectType: 'moderation_case', objectId: caseResult.rows[0].id, reputationEffect: 'withheld',
      appealable: false, retentionClass: 'moderation', metadata: { decisionType: 'queue' },
      createdAt: new Date().toISOString(),
    });
    return true;
  });
  if (!applied || !modelExecuted) return;
  await recordAiEvidence(env, {
    caseId: revision.contentId,
    correlationId: revision.sourceEventId,
    inputHash,
    evidenceBundleHash: await sha256Hex(`${inputHash}:${modelVersion}:${AUTHENTICITY_POLICY}`),
    provider: AUTHENTICITY_PROVIDER,
    modelId: modelVersion,
    gatewayId: env.AI_GATEWAY_ID ?? null,
    promptTemplateVersion: 'authenticity-evaluation-v1',
    reasoningSchemaVersion: evaluation.schemaVersion,
    toolVersions: { authenticity: 'lythaus-authenticity-v1' },
    policyVersion: AUTHENTICITY_POLICY,
    responseHash,
    latencyMs,
    estimatedUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
    actualUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
  }).catch((error) => logEvent({ service: 'lythaus-jobs', event: 'ai_evidence_record_failed', operation: 'moderation_text_scan', error: error instanceof Error ? error.message : 'audit_write_failed' }));
}

async function processCommentModeration(message: QueueMessage, env: Env): Promise<void> {
  const eventId = typeof message.body.eventId === 'string' ? message.body.eventId : message.id;
  const revision = parseContentModerationRevision({
    eventId,
    payload: message.body.payload ?? message.body,
    contentIdField: 'commentId',
  });

  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const comment = await client.query<{
      id: string;
      author_id: string;
      body: string;
      declared_creation_mode: string;
      moderation_state: string;
      deleted_at: string | null;
      moderation_source_event_id: string | null;
    }>(
      `SELECT id, author_id, body, declared_creation_mode, moderation_state, deleted_at, moderation_source_event_id
         FROM content.comments
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [revision.contentId],
    );
    const row = comment.rows[0];
    if (!row) return;
    const bodyHash = await sha256Hex(row.body);
    if (!isCurrentContentModerationRevision({
      revision,
      canonical: {
        contentId: row.id,
        sourceEventId: row.moderation_source_event_id,
        declaredCreationMode: row.declared_creation_mode,
        bodyHash,
        moderationState: row.moderation_state,
        deletedAt: row.deleted_at,
      },
    })) return;
    const detectorRun = await client.query(
      `INSERT INTO moderation.detector_runs (id, content_type, content_id, provider, model_version, signal, source_event_id)
       VALUES ($1, 'comment', $2, $3, 'manual-review-v1', $4::jsonb, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [uuidv7(), revision.contentId, AUTHENTICITY_PROVIDER, JSON.stringify({
        schemaVersion: 'lythaus-authenticity-v1',
        recommendation: 'review',
        reviewRequired: true,
        rationale: 'Comments enter human moderation review before publication.',
      }), revision.sourceEventId],
    );
    if (detectorRun.rowCount !== 1) return;
    const claimed = await client.query(
      `INSERT INTO system.audit_events
         (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'moderation.comment.review_requested', 'comment', $3,
               'PUBLIC_COMMENT_REVIEW', $1::text, '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [eventId, row.author_id, revision.contentId],
    );
    if (claimed.rowCount === 0) return;
    await client.query(
      `UPDATE moderation.cases
          SET state = 'superseded', resolved_at = COALESCE(resolved_at, now())
        WHERE content_type = 'comment' AND content_id = $1 AND state = 'open'
          AND source_event_id IS DISTINCT FROM $2`,
      [revision.contentId, revision.sourceEventId],
    );
    const caseId = uuidv7();
    const caseCreated = await client.query(
      `INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
       VALUES ($1, 'comment', $2, 'open', $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [caseId, revision.contentId, AUTHENTICITY_POLICY, revision.sourceEventId],
    );
    if (caseCreated.rowCount !== 1) return;
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version)
       VALUES ($1, $2, 'queue', 'Under review', $3)`,
      [uuidv7(), caseId, AUTHENTICITY_POLICY],
    );
    await recordUserActivity(client, {
      id: uuidv7(), userId: row.author_id, actorUserId: row.author_id,
      eventType: 'moderation.case_opened', category: 'moderation', source: 'jobs',
      sourceEventId: eventId,
      correlationId: typeof message.body.correlationId === 'string' ? message.body.correlationId : eventId,
      title: 'Comment review opened',
      explanation: 'Your comment entered the normal publication review process.',
      result: 'pending', reasonCode: 'PUBLIC_COMMENT_REVIEW', policyVersion: AUTHENTICITY_POLICY,
      objectType: 'moderation_case', objectId: caseId, reputationEffect: 'withheld',
      appealable: false, retentionClass: 'moderation', metadata: { decisionType: 'queue' },
      createdAt: new Date().toISOString(),
    });
  });
}

async function processMediaUpload(message: QueueMessage, env: Env): Promise<void> {
  if (env.MEDIA_PROCESSING_ENABLED !== 'true') return;
  const payload = (message.body.payload ?? message.body) as { uploadSessionId?: unknown; objectKey?: unknown };
  const sessionId = typeof payload.uploadSessionId === 'string' ? payload.uploadSessionId : undefined;
  const objectKey = typeof payload.objectKey === 'string' ? payload.objectKey : undefined;
  const eventId = typeof message.body.eventId === 'string' ? message.body.eventId : message.id;
  const correlationId = typeof message.body.correlationId === 'string' ? message.body.correlationId : eventId;
  if (!sessionId || !objectKey || !env.MEDIA_QUARANTINE || !env.MEDIA_APPROVED || !env.IMAGES) throw new Error('media_processing_not_configured');

  const session = await query<{ user_id: string; content_type: string; expected_bytes: number; status: string }>(
    env.DB_JOBS_FRESH,
    `SELECT user_id, content_type, expected_bytes, status FROM media.upload_sessions WHERE id = $1 AND object_key = $2`,
    [sessionId, objectKey]
  );
  const row = session.rows[0];
  if (!row) throw new Error('upload_session_not_found');
  if (row.status === 'approved' || row.status === 'rejected') {
    await env.MEDIA_QUARANTINE.delete(objectKey);
    return;
  }
  if (row.status !== 'queued') throw new Error('upload_session_not_queued');

  const settleRejected = async (reasonCode: string): Promise<void> => {
    await transaction(env.DB_JOBS_FRESH, async (client) => {
      const updated = await client.query(`UPDATE media.upload_sessions SET status = 'rejected' WHERE id = $1 AND status = 'queued' RETURNING id`, [sessionId]);
      if (updated.rowCount !== 0) {
        await client.query(
        `UPDATE media.storage_ledger SET bytes_reserved = greatest(bytes_reserved - $1, 0), bytes_rejected = bytes_rejected + $1, last_reconciled_at = now() WHERE user_id = $2`,
        [row.expected_bytes, row.user_id]);
        await recordUserActivity(client, {
          id: uuidv7(), userId: row.user_id, eventType: 'content.media_upload_rejected',
          category: 'content', source: 'jobs', sourceEventId: eventId, correlationId,
          title: 'Media upload rejected',
          explanation: 'The uploaded file did not pass required integrity and safety checks and was removed from quarantine.',
          result: 'failed', reasonCode, policyVersion: AUTHENTICITY_POLICY,
          objectType: 'upload_session', objectId: sessionId, reputationEffect: 'none', appealable: true,
          retentionClass: 'moderation', metadata: { contentType: row.content_type, moderationState: 'rejected' },
          createdAt: new Date().toISOString(),
        });
      }
    });
  };

  const source = await env.MEDIA_QUARANTINE.get(objectKey);
  if (!source) throw new Error('quarantine_object_missing');
  if (source.size !== Number(row.expected_bytes) || source.size > MAX_IMAGE_BYTES) {
    await settleRejected('MEDIA_SIZE_MISMATCH');
    await env.MEDIA_QUARANTINE.delete(objectKey);
    return;
  }
  const bytes = new Uint8Array(await new Response(source.body).arrayBuffer());
  if (bytes.byteLength !== Number(row.expected_bytes) || !hasMagicBytes(bytes, row.content_type)) {
    await settleRejected('MEDIA_SIGNATURE_INVALID');
    await env.MEDIA_QUARANTINE.delete(objectKey);
    return;
  }

  const sourceInfo = await env.IMAGES.info(new Response(bytes).body!);
  if (!sourceInfo.width || !sourceInfo.height || sourceInfo.width * sourceInfo.height > MAX_IMAGE_PIXELS) {
    await settleRejected('MEDIA_DIMENSIONS_INVALID');
    await env.MEDIA_QUARANTINE.delete(objectKey);
    return;
  }

  const transformed = await (await env.IMAGES.input(new Response(bytes).body!).output({ format: 'image/webp', quality: 85 })).image();
  const approvedBytes = new Uint8Array(await new Response(transformed).arrayBuffer());
  if (approvedBytes.byteLength === 0 || approvedBytes.byteLength > 10 * 1024 * 1024) throw new Error('media_transform_invalid');
  const digest = await crypto.subtle.digest('SHA-256', approvedBytes);
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  const approvedKey = `approved/${row.user_id}/${sessionId}.webp`;
  await env.MEDIA_APPROVED.put(approvedKey, approvedBytes, { httpMetadata: { contentType: 'image/webp' } });
  const { evaluation, modelExecuted, latencyMs } = await runAuthenticityEvaluation(env, {
    kind: 'image',
    content: JSON.stringify({ sha256, contentType: 'image/webp', byteSize: approvedBytes.byteLength, width: sourceInfo.width, height: sourceInfo.height }),
    contentId: sessionId,
  });
  const responseHash = await sha256Hex(JSON.stringify(evaluation));
  if (modelExecuted) await recordAiEvidence(env, {
    caseId: sessionId,
    correlationId: sessionId,
    inputHash: sha256,
    evidenceBundleHash: await sha256Hex(`${sha256}:${evaluation.modelId}:${AUTHENTICITY_POLICY}`),
    provider: AUTHENTICITY_PROVIDER,
    modelId: evaluation.modelId,
    gatewayId: env.AI_GATEWAY_ID ?? null,
    promptTemplateVersion: 'authenticity-evaluation-v1',
    reasoningSchemaVersion: evaluation.schemaVersion,
    toolVersions: { authenticity: 'lythaus-authenticity-v1' },
    policyVersion: AUTHENTICITY_POLICY,
    responseHash,
    latencyMs,
    estimatedUsageUsd: Number(env.COST_AUTHENTICITY_IMAGE_ESTIMATE_USD ?? 0.01),
    actualUsageUsd: Number(env.COST_AUTHENTICITY_IMAGE_ESTIMATE_USD ?? 0.01),
  }).catch((error) => logEvent({ service: 'lythaus-jobs', event: 'ai_evidence_record_failed', operation: 'moderation_image_scan', error: error instanceof Error ? error.message : 'audit_write_failed' }));
  const moderationSignal = JSON.stringify(evaluation);

  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO media.objects (id, owner_id, object_key, content_type, byte_size, sha256, state)
       VALUES ($1, $2, $3, 'image/webp', $4, $5, $6) ON CONFLICT (object_key) DO NOTHING RETURNING id`,
      [uuidv7(), row.user_id, approvedKey, approvedBytes.byteLength, sha256, 'review']
    );
    if (inserted.rowCount !== 0) {
      const objectId = inserted.rows[0].id;
      await client.query(`INSERT INTO media.ownership (object_id, owner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [objectId, row.user_id]);
      await client.query(
        `INSERT INTO media.variants (id, object_id, object_key, content_type, byte_size, width, height)
         VALUES ($1, $2, $3, 'image/webp', $4, $5, $6) ON CONFLICT (object_key) DO NOTHING`,
        [uuidv7(), objectId, approvedKey, approvedBytes.byteLength, sourceInfo.width, sourceInfo.height]
      );
      await client.query(
        `INSERT INTO media.moderation_results (id, object_id, provider, model_version, signal) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [uuidv7(), objectId, AUTHENTICITY_PROVIDER, evaluation.modelId, moderationSignal]
      );
      await client.query(
        `INSERT INTO media.storage_ledger (user_id, bytes_uploaded, bytes_approved, object_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id) DO UPDATE SET bytes_uploaded = media.storage_ledger.bytes_uploaded + EXCLUDED.bytes_uploaded,
           bytes_reserved = greatest(media.storage_ledger.bytes_reserved - $4, 0),
           bytes_approved = media.storage_ledger.bytes_approved + EXCLUDED.bytes_approved,
           object_count = media.storage_ledger.object_count + 1,
           last_reconciled_at = now()`,
        [row.user_id, approvedBytes.byteLength, approvedBytes.byteLength, row.expected_bytes]
      );
    }
    const approved = await client.query(`UPDATE media.upload_sessions SET status = 'approved' WHERE id = $1 AND status = 'queued' RETURNING id`, [sessionId]);
    if (approved.rowCount === 1) await recordUserActivity(client, {
      id: uuidv7(), userId: row.user_id, eventType: 'content.media_upload_approved',
      category: 'content', source: 'jobs', sourceEventId: eventId, correlationId,
      title: 'Media upload approved',
      explanation: 'The uploaded media passed integrity processing and entered the approved private media store.',
      result: 'succeeded', policyVersion: AUTHENTICITY_POLICY,
      objectType: 'upload_session', objectId: sessionId, reputationEffect: 'none', appealable: false,
      retentionClass: 'ordinary', metadata: { contentType: 'image/webp', moderationState: 'approved' },
      createdAt: new Date().toISOString(),
    });
  });
  await env.MEDIA_QUARANTINE.delete(objectKey);
}

async function processProfileModeration(message: QueueMessage, env: Env): Promise<void> {
  const eventId = typeof message.body.eventId === 'string' ? message.body.eventId : message.id;
  const revision = parseProfileModerationRevision({ eventId, payload: message.body.payload ?? message.body });
  const profile = await query<{
    user_id: string;
    display_name: string;
    bio: string | null;
    moderation_source_event_id: string | null;
    moderation_state: string;
    user_status: string;
  }>(env.DB_JOBS_FRESH,
    `SELECT profile.user_id, user_record.display_name, profile.bio,
            profile.moderation_source_event_id, profile.moderation_state,
            user_record.status AS user_status
       FROM social.profiles profile
       JOIN identity.users user_record ON user_record.id = profile.user_id
      WHERE profile.user_id = $1`,
    [revision.userId],
  );
  const current = profile.rows[0];
  if (!isCurrentProfileModerationRevision({
    revision,
    canonical: current ? {
      userId: current.user_id,
      sourceEventId: current.moderation_source_event_id,
      moderationState: current.moderation_state,
      userStatus: current.user_status,
    } : undefined,
  })) return;
  const prior = await query(env.DB_JOBS_FRESH,
    `SELECT 1 FROM moderation.detector_runs WHERE provider = $1 AND source_event_id = $2 LIMIT 1`,
    [AUTHENTICITY_PROVIDER, revision.sourceEventId]);
  if (prior.rowCount !== 0) return;
  const content = JSON.stringify({
    displayName: current.display_name,
    bio: current.bio,
  });
  const { evaluation, modelExecuted, latencyMs } = await runAuthenticityEvaluation(env, {
    kind: 'profile', content, contentId: revision.userId,
  });
  const inputHash = await sha256Hex(content);
  if (modelExecuted) await recordAiEvidence(env, {
    caseId: revision.userId,
    correlationId: revision.sourceEventId,
    inputHash,
    evidenceBundleHash: await sha256Hex(`${inputHash}:${evaluation.modelId}:${AUTHENTICITY_POLICY}`),
    provider: AUTHENTICITY_PROVIDER,
    modelId: evaluation.modelId,
    gatewayId: env.AI_GATEWAY_ID ?? null,
    promptTemplateVersion: 'authenticity-evaluation-v1',
    reasoningSchemaVersion: evaluation.schemaVersion,
    toolVersions: { authenticity: 'lythaus-authenticity-v1' },
    policyVersion: AUTHENTICITY_POLICY,
    responseHash: await sha256Hex(JSON.stringify(evaluation)),
    latencyMs,
    estimatedUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
    actualUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
  }).catch((error) => logEvent({ service: 'lythaus-jobs', event: 'ai_evidence_record_failed', operation: 'moderation_profile_scan', error: error instanceof Error ? error.message : 'audit_write_failed' }));
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const locked = await client.query<{
      user_id: string;
      display_name: string;
      bio: string | null;
      moderation_source_event_id: string | null;
      moderation_state: string;
      user_status: string;
    }>(
      `SELECT profile.user_id, user_record.display_name, profile.bio,
              profile.moderation_source_event_id, profile.moderation_state,
              user_record.status AS user_status
         FROM social.profiles profile
         JOIN identity.users user_record ON user_record.id = profile.user_id
        WHERE profile.user_id = $1
        FOR UPDATE`,
      [revision.userId],
    );
    const lockedProfile = locked.rows[0];
    if (!isCurrentProfileModerationRevision({
      revision,
      canonical: lockedProfile ? {
        userId: lockedProfile.user_id,
        sourceEventId: lockedProfile.moderation_source_event_id,
        moderationState: lockedProfile.moderation_state,
        userStatus: lockedProfile.user_status,
      } : undefined,
    })) return;
    const lockedContent = JSON.stringify({ displayName: lockedProfile.display_name, bio: lockedProfile.bio });
    if (lockedContent !== content) return;
    const detectorRun = await client.query(
      `INSERT INTO moderation.detector_runs (id, content_type, content_id, provider, model_version, signal, source_event_id)
       VALUES ($1, 'profile', $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [uuidv7(), revision.userId, AUTHENTICITY_PROVIDER, evaluation.modelId, JSON.stringify(evaluation), revision.sourceEventId],
    );
    if (detectorRun.rowCount !== 1) return;
    await client.query(
      `UPDATE moderation.cases
          SET state = 'superseded', resolved_at = COALESCE(resolved_at, now())
        WHERE content_type = 'profile' AND content_id = $1 AND state = 'open'
          AND source_event_id IS DISTINCT FROM $2`,
      [revision.userId, revision.sourceEventId],
    );
    const caseResult = await client.query<{ id: string }>(
      `INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version, source_event_id)
       VALUES ($1, 'profile', $2, 'open', $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [uuidv7(), revision.userId, AUTHENTICITY_POLICY, revision.sourceEventId]);
    if (caseResult.rowCount !== 1) return;
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version)
       VALUES ($1, $2, 'queue', 'Under review', $3)`,
      [uuidv7(), caseResult.rows[0].id, AUTHENTICITY_POLICY]);
    await recordUserActivity(client, {
      id: uuidv7(), userId: revision.userId, actorUserId: revision.userId,
      eventType: 'moderation.case_opened', category: 'moderation', source: 'jobs',
      sourceEventId: revision.sourceEventId,
      correlationId: typeof message.body.correlationId === 'string' ? message.body.correlationId : revision.sourceEventId,
      title: 'Profile review opened',
      explanation: 'Your updated public profile entered the normal publication review process.',
      result: 'pending', reasonCode: 'PUBLIC_PROFILE_REVIEW', policyVersion: AUTHENTICITY_POLICY,
      objectType: 'moderation_case', objectId: caseResult.rows[0].id, reputationEffect: 'withheld',
      appealable: false, retentionClass: 'moderation', metadata: { decisionType: 'queue' },
      createdAt: new Date().toISOString(),
    });
  });
}

async function supersedeDeletedContentCases(message: QueueMessage, env: Env, contentType: 'post' | 'comment'): Promise<void> {
  const payload = message.body.payload ?? message.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const contentId = (payload as Record<string, unknown>)[contentType === 'post' ? 'postId' : 'commentId'];
  if (typeof contentId !== 'string' || !contentId) return;
  const table = contentType === 'post' ? 'content.posts' : 'content.comments';
  const current = await query<{ id: string }>(env.DB_JOBS_FRESH,
    `SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NOT NULL`, [contentId]);
  if (current.rowCount === 0) return;
  await query(env.DB_JOBS_FRESH,
    `UPDATE moderation.cases
        SET state = 'superseded', resolved_at = COALESCE(resolved_at, now())
      WHERE content_type = $1 AND content_id = $2 AND state = 'open'`,
    [contentType, contentId]);
}

async function replaceRecusedAppealReviewer(message: QueueMessage, env: Env): Promise<void> {
  if (!env.APPEAL_ASSIGNMENT_SECRET || env.APPEAL_ASSIGNMENT_SECRET.length < 32) {
    throw new Error('appeal_assignment_secret_not_configured');
  }
  const payload = (message.body.payload ?? message.body) as { appealId?: unknown; assignmentId?: unknown };
  const appealId = typeof payload.appealId === 'string' ? payload.appealId : undefined;
  const assignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : undefined;
  if (!appealId || !assignmentId) throw new Error('appeal_recusal_event_invalid');
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const recused = await client.query<{ assignment_ordinal: number; appellant_id: string; case_id: string; risk_class: string }>(
      `SELECT assignment.assignment_ordinal, appeal.appellant_id, appeal.case_id, appeal.risk_class
         FROM moderation.appeal_assignments assignment
         JOIN moderation.appeals appeal ON appeal.id = assignment.appeal_id
        WHERE assignment.id = $1 AND assignment.appeal_id = $2 AND assignment.state = 'recused'
          AND appeal.state = 'open' AND appeal.expires_at > now()
        FOR UPDATE OF assignment, appeal`,
      [assignmentId, appealId],
    );
    const appeal = recused.rows[0];
    if (!appeal) return;
    const replacement = await client.query<{ user_id: string; current_level: number; random_rank_hash: string }>(
      `SELECT qualification.user_id,
              COALESCE(profile.current_level, 0)::integer AS current_level,
              encode(digest($1 || ':' || $4 || ':' || qualification.user_id::text, 'sha256'), 'hex') AS random_rank_hash
         FROM moderation.reviewer_qualifications qualification
         JOIN identity.users reviewer ON reviewer.id = qualification.user_id AND reviewer.status = 'active'
         LEFT JOIN trust.reputation_profiles profile ON profile.user_id = qualification.user_id
        WHERE qualification.state = 'trained'
          AND qualification.user_id <> $3
          AND COALESCE(profile.status, 'active') = 'active'
          AND NOT EXISTS (SELECT 1 FROM moderation.appeal_assignments prior WHERE prior.appeal_id = $1 AND prior.reviewer_id = qualification.user_id)
          AND NOT EXISTS (SELECT 1 FROM moderation.decisions decision WHERE decision.case_id = $2 AND decision.decided_by = qualification.user_id)
          AND NOT EXISTS (
            SELECT 1 FROM social.blocks block
             WHERE (block.blocker_id = qualification.user_id AND block.blocked_id = $3)
                OR (block.blocker_id = $3 AND block.blocked_id = qualification.user_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM social.follows follow
             WHERE (follow.follower_id = qualification.user_id AND follow.followed_id = $3)
                OR (follow.follower_id = $3 AND follow.followed_id = qualification.user_id)
          )
        ORDER BY random_rank_hash
        LIMIT 1`,
      [appealId, appeal.case_id, appeal.appellant_id, env.APPEAL_ASSIGNMENT_SECRET],
    );
    const candidate = replacement.rows[0];
    if (!candidate) throw new Error('appeal_reviewer_pool_insufficient');
    const weighted = await client.query(
      `SELECT 1 FROM moderation.appeal_assignments
        WHERE appeal_id = $1 AND vote_weight_snapshot = 2 AND state IN ('assigned', 'voted') LIMIT 1`,
      [appealId],
    );
    const { level, voteWeight } = reviewerReplacementPlan(candidate.current_level, weighted.rowCount !== 0);
    const replacementId = uuidv7();
    await client.query(
      `INSERT INTO moderation.appeal_assignments
         (id, appeal_id, reviewer_id, assignment_ordinal, level_snapshot, qualification_snapshot,
          vote_weight_snapshot, conflict_checked, random_rank_hash, policy_version)
       VALUES ($1, $2, $3, $4, $5, 'trained', $6, true, $7, $8)`,
      [replacementId, appealId, candidate.user_id, appeal.assignment_ordinal, level, voteWeight,
        candidate.random_rank_hash, APPEAL_POLICY.version],
    );
    const activity = await recordUserActivity(client, {
      id: uuidv7(), userId: candidate.user_id,
      eventType: 'appeals.reviewer_assignment_changed', category: 'appeals', source: 'jobs',
      sourceEventId: replacementId, correlationId: appealId,
      title: 'Appeal review assigned',
      explanation: 'You were independently selected as a replacement reviewer for a time-limited appeal.',
      result: 'pending', policyVersion: APPEAL_POLICY.version,
      objectType: 'appeal', objectId: appealId, reputationEffect: 'none', appealable: false,
      retentionClass: 'moderation', metadata: { appealState: 'assigned', riskClass: appeal.risk_class },
      createdAt: new Date().toISOString(),
    });
    await insertPreferenceAwareNotification(client, {
      recipientId: candidate.user_id,
      notificationType: 'appeals.reviewer_assigned',
      entityId: appealId,
      sourceEventId: replacementId,
      policyVersion: APPEAL_POLICY.version,
      preferenceClass: 'moderation',
      activityEventId: activity.id,
    });
  });
}

async function processAppealVoteLocked(message: QueueMessage, env: Env, eventId: string): Promise<void> {
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const source = await canonicalOutboxEvent(client, eventId, 'moderation.appeal.vote_locked');
    const appealId = stringValue(source.payload.appealId);
    if (!appealId) throw new Error('appeal_vote_event_invalid');
    const appealResult = await client.query<{ appellant_id: string; risk_class: string; state: string }>(
      `SELECT appellant_id, risk_class, state FROM moderation.appeals WHERE id = $1 FOR UPDATE`,
      [appealId],
    );
    const appeal = appealResult.rows[0];
    if (!appeal || appeal.state !== 'open') return;
    if (appeal.risk_class !== 'standard' && appeal.risk_class !== 'high') throw new Error('appeal_risk_class_invalid');
    const voteResult = await client.query<{
      reviewer_id: string;
      decision: string;
      qualification_snapshot: string;
      level_snapshot: number;
      vote_weight_snapshot: number;
      assignment_state: string;
      conflict_checked: boolean;
      current_qualification_state: string | null;
    }>(
      `SELECT vote.reviewer_id, vote.decision, vote.qualification_snapshot, vote.level_snapshot,
              vote.vote_weight_snapshot, assignment.state AS assignment_state,
              assignment.conflict_checked, qualification.state AS current_qualification_state
         FROM moderation.appeal_review_votes vote
         JOIN moderation.appeal_assignments assignment ON assignment.id = vote.assignment_id
         LEFT JOIN moderation.reviewer_qualifications qualification ON qualification.user_id = vote.reviewer_id
        WHERE vote.appeal_id = $1 AND assignment.appeal_id = $1`,
      [appealId],
    );
    const votes: AppealVote[] = voteResult.rows.map((row) => lockedAppealVote({
      reviewerId: row.reviewer_id,
      decision: row.decision,
      qualificationSnapshot: row.qualification_snapshot,
      levelSnapshot: row.level_snapshot,
      voteWeightSnapshot: row.vote_weight_snapshot,
      assignmentState: row.assignment_state,
      conflictChecked: row.conflict_checked,
      currentQualificationState: row.current_qualification_state,
    }));
    const riskClass = appeal.risk_class as AppealRiskClass;
    const evaluation = evaluateAppeal(votes, [], riskClass);
    const prior = await client.query<{ reviewer_panel_decision: string | null; state: string }>(
      `SELECT reviewer_panel_decision, state FROM moderation.appeal_outcomes WHERE appeal_id = $1 FOR UPDATE`,
      [appealId],
    );
    await client.query(
      `INSERT INTO moderation.appeal_outcomes
         (appeal_id, risk_class, reviewer_panel_decision, final_decision, completed_reviewers,
          total_weight, overturn_weight, uphold_weight, winning_share, required_adjudicators,
          state, policy_version, evaluated_at, resolved_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, now(), NULL)
       ON CONFLICT (appeal_id) DO UPDATE SET
         risk_class = EXCLUDED.risk_class,
         reviewer_panel_decision = EXCLUDED.reviewer_panel_decision,
         final_decision = NULL,
         completed_reviewers = EXCLUDED.completed_reviewers,
         total_weight = EXCLUDED.total_weight,
         overturn_weight = EXCLUDED.overturn_weight,
         uphold_weight = EXCLUDED.uphold_weight,
         winning_share = EXCLUDED.winning_share,
         required_adjudicators = EXCLUDED.required_adjudicators,
         state = EXCLUDED.state,
         policy_version = EXCLUDED.policy_version,
         evaluated_at = EXCLUDED.evaluated_at,
         resolved_at = NULL`,
      [
        appealId,
        riskClass,
        evaluation.reviewerPanelDecision,
        evaluation.completedReviewers,
        evaluation.totalWeight,
        evaluation.overturnWeight,
        evaluation.upholdWeight,
        evaluation.winningShare,
        evaluation.requiredAdjudicators,
        evaluation.status,
        evaluation.policyVersion,
      ],
    );
    if (!evaluation.reviewerPanelDecision || prior.rows[0]?.reviewer_panel_decision === evaluation.reviewerPanelDecision) return;
    const reviewerPanelActivity = await recordUserActivity(client, {
      id: uuidv7(),
      userId: appeal.appellant_id,
      eventType: 'appeals.reviewer_panel_result_reached',
      category: 'appeals',
      source: 'jobs',
      sourceEventId: appealId,
      correlationId: stringValue(message.body.correlationId) ?? appealId,
      title: 'Appeal reviewer panel completed',
      explanation: 'The complete independent reviewer quorum reached the required weighted majority and awaits professional adjudication.',
      result: 'pending',
      policyVersion: evaluation.policyVersion,
      objectType: 'appeal',
      objectId: appealId,
      reputationEffect: 'none',
      appealable: false,
      retentionClass: 'moderation',
      metadata: { appealState: evaluation.status, riskClass, outcome: evaluation.reviewerPanelDecision },
      createdAt: new Date().toISOString(),
    });
    await insertPreferenceAwareNotification(client, {
      recipientId: appeal.appellant_id,
      notificationType: 'appeals.reviewer_panel_result_reached',
      entityId: appealId,
      sourceEventId: appealId,
      policyVersion: evaluation.policyVersion,
      preferenceClass: 'moderation',
      activityEventId: reviewerPanelActivity.id,
    });
    const adjudicators = await client.query<{ user_id: string }>(
      `SELECT membership.user_id
         FROM identity.admin_memberships membership
         JOIN identity.users adjudicator ON adjudicator.id = membership.user_id AND adjudicator.status = 'active'
         JOIN moderation.reviewer_qualifications qualification
           ON qualification.user_id = membership.user_id AND qualification.state = 'trained'
        WHERE membership.active = true AND membership.role = 'editorial'
          AND membership.user_id <> $2
          AND NOT EXISTS (
            SELECT 1 FROM moderation.appeal_assignments assignment
             WHERE assignment.appeal_id = $1 AND assignment.reviewer_id = membership.user_id
               AND assignment.state NOT IN ('recused', 'replaced', 'expired')
          )
          AND NOT EXISTS (
            SELECT 1 FROM social.blocks block
             WHERE (block.blocker_id = membership.user_id AND block.blocked_id = $2)
                OR (block.blocker_id = $2 AND block.blocked_id = membership.user_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM social.follows follow
             WHERE (follow.follower_id = membership.user_id AND follow.followed_id = $2)
                OR (follow.follower_id = $2 AND follow.followed_id = membership.user_id)
          )
        ORDER BY membership.user_id`,
      [appealId, appeal.appellant_id],
    );
    for (const adjudicator of adjudicators.rows) {
      const activity = await recordUserActivity(client, {
        id: uuidv7(),
        userId: adjudicator.user_id,
        eventType: 'appeals.adjudication_requested',
        category: 'appeals',
        source: 'jobs',
        sourceEventId: eventId,
        correlationId: appealId,
        title: 'Appeal adjudication requested',
        explanation: `A completed reviewer-panel appeal requires ${evaluation.requiredAdjudicators === 2 ? 'two independent adjudicator confirmations' : 'an adjudicator confirmation'}.`,
        result: 'pending',
        policyVersion: evaluation.policyVersion,
        objectType: 'appeal',
        objectId: appealId,
        reputationEffect: 'none',
        appealable: false,
        retentionClass: 'moderation',
        metadata: { appealState: evaluation.status, riskClass, outcome: evaluation.reviewerPanelDecision },
        createdAt: new Date().toISOString(),
      });
      await insertPreferenceAwareNotification(client, {
        recipientId: adjudicator.user_id,
        notificationType: 'appeals.adjudication_required',
        entityId: appealId,
        sourceEventId: eventId,
        policyVersion: evaluation.policyVersion,
        preferenceClass: 'moderation',
        activityEventId: activity.id,
      });
    }
  });
}

async function processMessage(message: QueueMessage, env: Env): Promise<void> {
  const eventId = message.body.eventId ?? message.id;
  const eventType = message.body.eventType ?? 'unknown';
  const claimed = await query(env.DB_JOBS_FRESH,
    `INSERT INTO system.consumer_inbox (consumer_name, event_id, event_type, payload)
     VALUES ('lythaus-jobs', $1, $2, $3::jsonb)
     ON CONFLICT (consumer_name, event_id) DO NOTHING`,
    [eventId, eventType, JSON.stringify(message.body)]);
  if (claimed.rowCount === 0) {
    const existing = await query<{ state: 'processing' | 'completed'; claimed_at: string }>(env.DB_JOBS_FRESH,
      `SELECT state, claimed_at FROM system.consumer_inbox WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`, [eventId]);
    const row = existing.rows[0];
    if (!row || row.state === 'completed') {
      message.ack();
      return;
    }
    const reclaimed = await query(env.DB_JOBS_FRESH,
      `UPDATE system.consumer_inbox
          SET claimed_at = now(), payload = $2::jsonb, event_type = $3
        WHERE consumer_name = 'lythaus-jobs' AND event_id = $1 AND state = 'processing'
          AND claimed_at < now() - interval '5 minutes'`,
      [eventId, JSON.stringify(message.body), eventType]);
    if (reclaimed.rowCount === 0) {
      message.retry();
      return;
    }
  }
  try {
    if (eventType === 'content.post.created' || eventType === 'content.post.updated') await processPostModeration(message, env);
    if (eventType === 'content.profile.updated') await processProfileModeration(message, env);
    if (eventType === 'content.comment.created' || eventType === 'content.comment.updated') {
      await processCommentModeration(message, env);
    }
    if (eventType === 'content.post.deleted') await supersedeDeletedContentCases(message, env, 'post');
    if (eventType === 'content.comment.deleted') await supersedeDeletedContentCases(message, env, 'comment');
    if (eventType === 'media.upload.finalised') await processMediaUpload(message, env);
    if (eventType === 'privacy.request.created') {
      const payload = await resolvePrivacyRequestPayload(env, message, eventId);
      await query(env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.requests (id, subject_id, request_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`, [payload.requestId, payload.subjectId, payload.requestType]);
      const persisted = await query<{ id: string }>(env.DB_PRIVACY_FRESH,
        `SELECT id FROM privacy.requests WHERE id = $1 AND subject_id = $2 AND request_type = $3`,
        [payload.requestId, payload.subjectId, payload.requestType]);
      if (persisted.rowCount !== 1) throw new Error('privacy_request_mismatch');
      await query(env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         VALUES ($1, $2, 'received', $3::jsonb)
         ON CONFLICT (id) DO NOTHING`, [eventId, payload.requestId, JSON.stringify({ eventId })]);
      const lifecycle = privacyRequestLifecyclePlan(payload.requestType);
      if (lifecycle.workflow === 'delete' && env.ACCOUNT_DELETE) {
        await ensureWorkflowCreate(env.ACCOUNT_DELETE, `privacy-delete-${payload.requestId}`, { subjectId: payload.subjectId, requestId: payload.requestId });
      }
      if (lifecycle.workflow === 'export' && env.ACCOUNT_EXPORT) {
        await ensureWorkflowCreate(env.ACCOUNT_EXPORT, `privacy-export-${payload.requestId}`, { subjectId: payload.subjectId, requestId: payload.requestId });
      }
    }
    if (eventType === 'moderation.appeal.created' && env.APPEAL_LIFECYCLE) {
      const payload = (message.body.payload ?? {}) as { appealId?: string };
      if (typeof payload.appealId !== 'string') throw new Error('appeal_event_invalid');
      await ensureWorkflowCreate(env.APPEAL_LIFECYCLE, `appeal-${payload.appealId}`, { appealId: payload.appealId });
    }
    if (eventType === 'moderation.appeal.reviewer_recused') {
      await replaceRecusedAppealReviewer(message, env);
    }
    if (eventType === 'moderation.appeal.vote_locked') {
      await processAppealVoteLocked(message, env, eventId);
    }
    await processReputationSource(message, env, eventId, eventType);
    if (eventType === 'moderation.appeal.resolved') {
      await processAppealReputationResolution(message, env, eventId);
    }
    if (eventType === 'identity.account.status_changed') {
      await processAccountStandingRefresh(message, env, eventId);
    }
    await processNotificationSource(message, env, eventId, eventType);
    await query(env.DB_JOBS_FRESH,
      `UPDATE system.consumer_inbox SET state = 'completed', processed_at = now() WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`,
      [eventId]
    );
    logEvent({ service: 'lythaus-jobs', eventId, eventType });
    message.ack();
  } catch (error) {
    // Release the claim so Queue retry can safely reprocess a failed event.
    await query(env.DB_JOBS_FRESH,
      `DELETE FROM system.consumer_inbox WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`,
      [eventId]
    ).catch(() => undefined);
    throw error;
  }
}

function queueForEvent(eventType: string, env: Env): Queue | undefined {
  const route = queueRouteForEvent(eventType);
  if (route === 'moderation') return env.MODERATION_QUEUE;
  if (route === 'feed') return env.FEED_QUEUE;
  if (route === 'notifications') return env.NOTIFICATIONS_QUEUE;
  if (route === 'media') return env.MEDIA_QUEUE;
  if (route === 'privacy') return env.PRIVACY_QUEUE;
  return env.AUDIT_QUEUE;
}

async function relayOutbox(env: Env): Promise<void> {
  const pending = await transaction(env.DB_JOBS_FRESH, async (client) => client.query<{ id: string; event_type: string; payload: unknown; actor_id: string | null; correlation_id: string | null }>(
    `WITH claimable AS (
       SELECT id
         FROM system.outbox_events
        WHERE dispatched_at IS NULL
          AND (attempted_at IS NULL OR attempted_at < now() - interval '5 minutes')
        ORDER BY created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
     )
     UPDATE system.outbox_events AS event
        SET attempted_at = now(),
            attempt_count = event.attempt_count + 1,
            last_error_code = NULL
       FROM claimable
      WHERE event.id = claimable.id
     RETURNING event.id, event.event_type, event.payload, event.actor_id, event.correlation_id`,
  ));
  for (const event of pending.rows) {
    const queue = queueForEvent(event.event_type, env);
    if (!queue) {
      await query(env.DB_JOBS_FRESH,
        `UPDATE system.outbox_events SET last_error_code = 'queue_not_configured' WHERE id = $1 AND dispatched_at IS NULL`,
        [event.id],
      );
      continue;
    }
    try {
      await queue.send({
        eventId: event.id,
        eventType: event.event_type,
        actorId: event.actor_id,
        correlationId: event.correlation_id,
        payload: event.payload,
      });
      await query(env.DB_JOBS_FRESH,
        `UPDATE system.outbox_events SET dispatched_at = now() WHERE id = $1 AND dispatched_at IS NULL`,
        [event.id],
      );
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 160) : 'queue_send_failed';
      await query(env.DB_JOBS_FRESH,
        `UPDATE system.outbox_events
            SET attempted_at = NULL, last_error_code = $2
          WHERE id = $1 AND dispatched_at IS NULL`,
        [event.id, errorCode],
      ).catch(() => undefined);
      throw error;
    }
  }
}

interface AdminOutcomeNotification {
  source_event_id: string;
  recipient_id: string;
  notification_type: string;
  entity_id: string;
  policy_version: string;
}

async function deliverAdminOutcomeNotifications(env: Env): Promise<void> {
  const [moderation, appeals] = await Promise.all([
    query<AdminOutcomeNotification>(env.DB_JOBS_FRESH,
      `WITH candidates AS (
         SELECT audit.id AS source_event_id,
                CASE c.content_type
                  WHEN 'post' THEN p.author_id
                  WHEN 'comment' THEN cm.author_id
                  WHEN 'profile' THEN c.content_id
                  ELSE NULL
                END AS recipient_id,
                'moderation.decision_applied'::text AS notification_type,
                c.id AS entity_id,
                c.policy_version
           FROM system.audit_events audit
           JOIN moderation.cases c ON c.id = audit.target_id
           LEFT JOIN content.posts p ON c.content_type = 'post' AND p.id = c.content_id
           LEFT JOIN content.comments cm ON c.content_type = 'comment' AND cm.id = c.content_id
          WHERE audit.action = 'moderation.decision' AND audit.target_type = 'moderation_case'
       )
       SELECT candidate.*
         FROM candidates candidate
        WHERE candidate.recipient_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM feed.notifications n
             WHERE n.recipient_id = candidate.recipient_id
               AND n.notification_type = candidate.notification_type
               AND n.source_event_id = candidate.source_event_id
          )
        ORDER BY candidate.source_event_id
        LIMIT 50`,
    ),
    query<AdminOutcomeNotification>(env.DB_JOBS_FRESH,
      `SELECT audit.id AS source_event_id, a.appellant_id AS recipient_id,
              'appeals.appeal_resolved'::text AS notification_type,
              a.id AS entity_id, a.policy_version
         FROM system.audit_events audit
         JOIN moderation.appeals a ON a.id = audit.target_id
        WHERE audit.action = 'moderation.appeal.outcome_applied' AND audit.target_type = 'appeal'
          AND NOT EXISTS (
            SELECT 1 FROM feed.notifications n
             WHERE n.recipient_id = a.appellant_id
               AND n.notification_type = 'appeals.appeal_resolved'
               AND n.source_event_id = audit.id
          )
        ORDER BY audit.created_at
        LIMIT 50`,
    ),
  ]);
  for (const notification of [...moderation.rows, ...appeals.rows]) {
    await transaction(env.DB_JOBS_FRESH, (client) => insertPreferenceAwareNotification(client, {
      recipientId: notification.recipient_id,
      notificationType: notification.notification_type,
      entityId: notification.entity_id,
      sourceEventId: notification.source_event_id,
      policyVersion: notification.policy_version,
      preferenceClass: 'moderation',
    }));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/internal/email/lifecycle' && request.method === 'POST') {
      return handleTransactionalEmailLifecycleWebhook(request, env);
    }
    if (request.method === 'GET' && pathname === '/internal/readiness/database-identity') {
      if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
      const [jobs, privacy] = await Promise.all([
        inspectDatabaseIdentity(env.DB_JOBS_FRESH, databaseExpectationsFromEnv(env)),
        inspectDatabaseIdentity(env.DB_PRIVACY_FRESH, databaseExpectationsFromEnv(env)),
      ]);
      const readiness = jobs.readiness === 'pass' && privacy.readiness === 'pass' ? 'pass' : 'fail';
      return json({
        service: 'lythaus-jobs',
        workerVersionId: env.WORKER_VERSION.id,
        releaseTag: env.WORKER_VERSION.tag,
        databases: {
          jobs: databaseReadinessResponse(jobs, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
          privacy: databaseReadinessResponse(privacy, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
        },
        branchFingerprint: 'unknown',
        readiness,
        readyForAuthentication: env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true' && readiness === 'pass' && jobs.budgetLedgerApplied && privacy.budgetLedgerApplied,
        }, { headers: { 'cache-control': 'private, no-store' } });
    }
    if (request.method === 'GET' && pathname === '/internal/readiness/budget-hard-stop') {
      if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
      return json(await simulateBudgetHardStop(env), { headers: { 'cache-control': 'private, no-store' } });
    }
    return json({ status: 'ok', service: 'lythaus-jobs' });
  },

  async queue(batch: QueueBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processMessage(message, env);
      } catch (error) {
        logEvent({ service: 'lythaus-jobs', queue: batch.queue, messageId: message.id, error: error instanceof Error ? error.message : 'job_failed' });
        message.retry();
      }
    }
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await relayTransactionalEmailOutbox(env);
    await relayOutbox(env);
    await deliverAdminOutcomeNotifications(env);
    const now = new Date();
    if (env.RETENTION_CLEANUP && now.getUTCHours() === 2 && now.getUTCMinutes() === 0) {
      const runId = new Date().toISOString().slice(0, 10);
      await ensureWorkflowCreate(env.RETENTION_CLEANUP, `retention-${runId}`, { runId });
    }
    if (env.BACKUP_VALIDATION && now.getUTCDate() === 1 && now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
      const runId = now.toISOString().slice(0, 10);
      await ensureWorkflowCreate(env.BACKUP_VALIDATION, `backup-validation-${runId}`, { runId });
    }
  },
};

export class AccountDeleteWorkflow extends WorkflowEntrypoint<Env, { subjectId: string; requestId: string }> {
  async run(event: WorkflowEvent<{ subjectId: string; requestId: string }>, step: WorkflowStep): Promise<{ subjectId: string; state: string }> {
    const subjectId = event.payload.subjectId;
    const requestedId = event.payload.requestId;
    const requestId = await step.do('resolve-request', async () => {
      await query(this.env.DB_PRIVACY_FRESH, `SELECT privacy.reconcile_subject_data_locations($1)`, [subjectId]);
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT id FROM privacy.requests WHERE id = $1 AND subject_id = $2 AND request_type = 'delete'`, [requestedId, subjectId]);
      if (!result.rows[0]) throw new Error('privacy_delete_request_not_found');
      await query(this.env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         SELECT $1, $2, 'workflow_started', $3::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'workflow_started')`,
        [uuidv7(), result.rows[0].id, JSON.stringify({ subjectId })]);
      return result.rows[0].id;
    });

    await step.do('lock-account-and-revoke-sessions', async () => {
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(`UPDATE identity.users SET status = 'locked', updated_at = now() WHERE id = $1 AND status IN ('active', 'locked')`, [subjectId]);
        await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]);
        await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]);
      });
      return true;
    });

    const hold = await step.do('evaluate-legal-holds', async () => transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
      const result = await client.query<{ id: string }>(`SELECT id FROM privacy.legal_holds WHERE subject_id = $1 AND active`, [subjectId]);
      const plan = legalHoldPlan(result.rows[0]?.id);
      if (plan.state !== 'blocked') return { ...plan, activityEventId: null };
      await client.query(
        `UPDATE privacy.requests SET state = 'blocked' WHERE id = $1 AND state <> 'completed'`, [requestId]);
      await client.query(
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         SELECT $1, $2, $3, $4::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = $3)`,
        [uuidv7(), requestId, plan.requestEventType, JSON.stringify({ legalHoldId: plan.legalHoldId })]);
      const activity = await recordUserActivity(client, {
        id: uuidv7(), userId: subjectId,
        eventType: plan.activity.eventType, category: 'privacy', source: 'workflow',
        sourceEventId: requestId, correlationId: requestId,
        title: plan.activity.title, explanation: plan.activity.explanation, result: plan.activity.result,
        reasonCode: plan.activity.reasonCode, policyVersion: ACTIVITY_POLICY_VERSION,
        objectType: 'privacy_request', objectId: requestId, reputationEffect: 'none', appealable: false,
        retentionClass: 'security', metadata: { requestType: 'delete', requestState: 'blocked' },
        createdAt: new Date().toISOString(),
      });
      return { ...plan, activityEventId: activity.id };
    }));
    if (hold.state === 'blocked') {
      await step.do('record-legal-hold-outcome', async () => {
        await transaction(this.env.DB_JOBS_FRESH, (client) => insertPreferenceAwareNotification(client, {
          recipientId: subjectId, notificationType: 'privacy.deletion_blocked', entityId: requestId,
          sourceEventId: requestId, policyVersion: ACTIVITY_POLICY_VERSION,
          preferenceClass: 'always', activityEventId: hold.activityEventId,
        }));
        return true;
      });
      return { subjectId, state: 'blocked' };
    }

    await step.do('redact-authoritative-content', async () => {
      await transaction(this.env.DB_JOBS_FRESH, async (client) => {
        await client.query(`UPDATE content.comments SET body = '[deleted]', moderation_state = 'blocked' WHERE author_id = $1`, [subjectId]);
        await client.query(`UPDATE content.posts SET body = '[deleted]', visibility = 'private', moderation_state = 'blocked', published_at = NULL, updated_at = now() WHERE author_id = $1`, [subjectId]);
        await client.query(
          `UPDATE moderation.cases moderation_case
              SET state = 'superseded', resolved_at = COALESCE(resolved_at, now())
            WHERE moderation_case.state = 'open'
              AND (
                (moderation_case.content_type = 'profile' AND moderation_case.content_id = $1)
                OR (moderation_case.content_type = 'post' AND EXISTS (
                  SELECT 1 FROM content.posts post
                   WHERE post.id = moderation_case.content_id AND post.author_id = $1
                ))
                OR (moderation_case.content_type = 'comment' AND EXISTS (
                  SELECT 1 FROM content.comments comment
                   WHERE comment.id = moderation_case.content_id AND comment.author_id = $1
                ))
              )`,
          [subjectId],
        );
        await client.query(`DELETE FROM feed.author_outbox WHERE author_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.discovery_candidates WHERE post_id IN (SELECT id FROM content.posts WHERE author_id = $1)`, [subjectId]);
        await client.query(`DELETE FROM feed.user_inbox WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.feed_events WHERE recipient_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.notifications WHERE recipient_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.notification_devices WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.notification_preferences WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.follows WHERE follower_id = $1 OR followed_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.blocks WHERE blocker_id = $1 OR blocked_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.mutes WHERE muter_id = $1 OR muted_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.reactions WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.bookmarks WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.accountability_signals WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.reputation_balances WHERE user_id = $1`, [subjectId]);
        await client.query(`UPDATE moderation.appeals SET statement = NULL WHERE appellant_id = $1`, [subjectId]);
        await client.query(
          `DELETE FROM system.idempotency_keys
            WHERE actor_id = $1 AND response ->> 'state' = 'completed'`,
          [subjectId],
        );
        await client.query(
          `UPDATE system.idempotency_keys
              SET actor_id = NULL
            WHERE actor_id = $1`,
          [subjectId],
        );
        await client.query(
          `DELETE FROM system.consumer_inbox
            WHERE jsonb_path_exists(
              payload,
              '$.** ? (@ == $subject)',
              jsonb_build_object('subject', to_jsonb($1::text))
            )`,
          [subjectId],
        );
        await client.query(
          `UPDATE system.outbox_events
              SET actor_id = NULL, payload = '{}'::jsonb
            WHERE actor_id = $1
               OR aggregate_id = $1
               OR jsonb_path_exists(
                 payload,
                 '$.** ? (@ == $subject)',
                 jsonb_build_object('subject', to_jsonb($1::text))
               )`,
          [subjectId],
        );
      });
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(`DELETE FROM identity.auth_sessions WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.refresh_token_families WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.provider_links WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.email_credentials WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.contact_emails WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.user_entitlements WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.email_verification_tokens WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.password_reset_tokens WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.handles WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.user_region_preferences WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.admin_memberships WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.profile_private_fields WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.profiles WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.custom_feeds WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM editorial.applications WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM editorial.memberships WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM privacy.retention_rules WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.user_activity_events WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.reputation_profiles WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.reward_redemptions WHERE user_id = $1`, [subjectId]);
        await client.query(`UPDATE identity.users SET status = 'deleted', display_name = '[deleted]', deleted_at = COALESCE(deleted_at, now()), updated_at = now() WHERE id = $1`, [subjectId]);
      });
      return true;
    });

    await step.do('purge-media-and-mark-locator', async () => {
      if (!this.env.MEDIA_APPROVED || !this.env.MEDIA_QUARANTINE) throw new Error('media_purge_not_configured');
      if (!this.env.PRIVATE_EXPORTS) throw new Error('private_exports_not_configured');
      const objects = await query<{ id: string; object_key: string; sha256: string | null }>(this.env.DB_JOBS_FRESH, `SELECT id, object_key, sha256 FROM media.objects WHERE owner_id = $1 AND deleted_at IS NULL`, [subjectId]);
      for (const object of objects.rows) await this.env.MEDIA_APPROVED.delete(object.object_key);
      const uploads = await query<{ object_key: string }>(this.env.DB_JOBS_FRESH, `SELECT object_key FROM media.upload_sessions WHERE user_id = $1 AND status IN ('pending', 'queued')`, [subjectId]);
      for (const upload of uploads.rows) await this.env.MEDIA_QUARANTINE.delete(upload.object_key);
      const deletedExports = await deleteR2Prefix(this.env.PRIVATE_EXPORTS, `exports/${subjectId}/`);
      await transaction(this.env.DB_JOBS_FRESH, async (client) => {
        for (const object of objects.rows) {
          await client.query(
            `INSERT INTO media.deletion_events (id, object_id, owner_id, reason_code, completed_at, evidence_hash)
             SELECT $1, $2, $3, 'ACCOUNT_DELETION', now(), $4
              WHERE NOT EXISTS (
                SELECT 1 FROM media.deletion_events
                 WHERE object_id = $2 AND reason_code = 'ACCOUNT_DELETION' AND completed_at IS NOT NULL
              )`,
            [uuidv7(), object.id, subjectId, object.sha256],
          );
        }
        await client.query(`UPDATE media.objects SET state = 'deleted', deleted_at = COALESCE(deleted_at, now()) WHERE owner_id = $1`, [subjectId]);
        await client.query(`UPDATE media.upload_sessions SET status = 'expired' WHERE user_id = $1 AND status IN ('pending', 'queued')`, [subjectId]);
        await client.query(`DELETE FROM media.storage_ledger WHERE user_id = $1`, [subjectId]);
      });
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(
          `DELETE FROM privacy.export_manifests manifest
            USING privacy.requests privacy_request
           WHERE manifest.request_id = privacy_request.id
             AND privacy_request.subject_id = $1`,
          [subjectId],
        );
        await client.query(
          `UPDATE privacy.subject_data_locations
              SET deletion_state = CASE
                    WHEN resource_reference IN (
                      'identity.users', 'identity.consent_records',
                      'content.posts', 'content.comments', 'content.content_declarations',
                      'trust.provenance_events', 'trust.human_contribution_events', 'trust.reputation_events',
                      'media.objects', 'media.upload_sessions',
                      'moderation.content_flags', 'moderation.appeals', 'moderation.enforcement_events',
                      'moderation.reviewer_qualifications', 'moderation.appeal_assignments',
                      'moderation.appeal_review_votes', 'moderation.appeal_adjudications',
                      'moderation.appeal_outcomes', 'moderation.appeal_outcome_effects',
                      'editorial.peer_reviews', 'editorial.publications',
                      'privacy.requests', 'privacy.request_events', 'privacy.legal_holds'
                    ) THEN 'retained'
                    ELSE 'deleted'
                  END,
                  last_verified_at = now()
            WHERE subject_id = $1`,
          [subjectId],
        );
      });
      return objects.rows.length + uploads.rows.length + deletedExports;
    });

    await step.do('complete-request-and-tombstone', async () => {
      const evidence = new TextEncoder().encode(`${subjectId}:${requestId}:${new Date().toISOString()}`);
      const digest = await crypto.subtle.digest('SHA-256', evidence);
      const evidenceHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(`INSERT INTO privacy.deletion_tombstones (subject_id, evidence_hash) VALUES ($1, $2) ON CONFLICT (subject_id) DO UPDATE SET completed_at = now(), evidence_hash = EXCLUDED.evidence_hash`, [subjectId, evidenceHash]);
        await client.query(
          `INSERT INTO privacy.subject_data_locations
             (subject_id, store_type, resource_reference, entity_type, entity_id,
              authoritative_or_derived, retention_class, deletion_state, last_verified_at)
           VALUES ($1, 'planetscale', 'privacy.deletion_tombstones', 'deletion_tombstone', $1,
             'authoritative', 'audit', 'retained', now())
           ON CONFLICT DO UPDATE SET deletion_state = 'retained', last_verified_at = now()`,
          [subjectId],
        );
        await client.query(`UPDATE privacy.requests SET state = 'completed', completed_at = now() WHERE id = $1`, [requestId]);
        await client.query(`INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
          SELECT $1, $2, 'completed', $3::jsonb
           WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'completed')`, [uuidv7(), requestId, JSON.stringify({ evidenceHash })]);
        await recordUserActivity(client, {
          id: uuidv7(), userId: subjectId,
          eventType: 'account.deletion_completed', category: 'account', source: 'workflow',
          sourceEventId: requestId, correlationId: requestId,
          title: 'Account deletion completed',
          explanation: 'Your account deletion completed subject to the documented audit and legal-retention rules.',
          result: 'succeeded', policyVersion: ACTIVITY_POLICY_VERSION,
          objectType: 'privacy_request', objectId: requestId, reputationEffect: 'none', appealable: false,
          retentionClass: 'security', metadata: { sessionAction: 'account_deleted' },
          createdAt: new Date().toISOString(),
        });
      });
      return evidenceHash;
    });
    return { subjectId, state: 'completed' };
  }
}

export class AccountExportWorkflow extends WorkflowEntrypoint<Env, { subjectId: string; requestId: string }> {
  async run(event: WorkflowEvent<{ subjectId: string; requestId: string }>, step: WorkflowStep): Promise<{ subjectId: string; state: string }> {
    const subjectId = event.payload.subjectId;
    const requestedId = event.payload.requestId;
    const exportsBucket = this.env.PRIVATE_EXPORTS;
    if (!exportsBucket) throw new Error('private_exports_not_configured');
    const requestId = await step.do('resolve-export-request', async () => {
      await query(this.env.DB_PRIVACY_FRESH, `SELECT privacy.reconcile_subject_data_locations($1)`, [subjectId]);
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT id FROM privacy.requests WHERE id = $1 AND subject_id = $2 AND request_type = 'export'`, [requestedId, subjectId]);
      if (!result.rows[0]) throw new Error('privacy_export_request_not_found');
      await query(this.env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         SELECT $1, $2, 'workflow_started', $3::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'workflow_started')`,
        [uuidv7(), result.rows[0].id, JSON.stringify({ subjectId })]);
      return result.rows[0].id;
    });

    const passport = await step.do('build-data-passport', async () => {
      const [identity, locations, privateProfileField, consentRecords, contactEmailField, entitlement, rewardRedemptions, accountEvents] = await Promise.all([
        query(this.env.DB_PRIVACY_FRESH, `SELECT id, display_name, status, created_at, deleted_at FROM identity.users WHERE id = $1`, [subjectId]),
        query(this.env.DB_PRIVACY_FRESH, `SELECT store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class, legal_hold_state, deletion_state, last_verified_at FROM privacy.subject_data_locations WHERE subject_id = $1`, [subjectId]),
        query<{ encrypted_payload: string; encryption_key_version: string }>(
          this.env.DB_PRIVACY_FRESH,
          `SELECT convert_from(encrypted_payload, 'utf8') AS encrypted_payload, encryption_key_version
             FROM social.profile_private_fields
            WHERE user_id = $1`,
          [subjectId],
        ),
        query(this.env.DB_PRIVACY_FRESH,
          `SELECT id, purpose, policy_version, granted, created_at
             FROM identity.consent_records
            WHERE user_id = $1
            ORDER BY created_at, id`,
          [subjectId],
        ),
        query<{ ciphertext: string; encryptionKeyVersion: string }>(
          this.env.DB_PRIVACY_FRESH,
          `SELECT convert_from(email_ciphertext, 'utf8') AS ciphertext,
                  encryption_key_version AS "encryptionKeyVersion"
             FROM identity.contact_emails
            WHERE user_id = $1`,
          [subjectId],
        ),
        query(this.env.DB_PRIVACY_FRESH,
          `SELECT user_id, subscription_tier, updated_by, updated_at
             FROM identity.user_entitlements
            WHERE user_id = $1`,
          [subjectId],
        ),
        query(this.env.DB_PRIVACY_FRESH,
          `SELECT id, reward_id, reward_level, reward_title, status, redeemed_at
             FROM trust.reward_redemptions
            WHERE user_id = $1
            ORDER BY redeemed_at, id`,
          [subjectId],
        ),
        query(this.env.DB_PRIVACY_FRESH,
          `SELECT id, event_type, created_at
             FROM identity.account_events
            WHERE user_id = $1
            ORDER BY created_at, id`,
          [subjectId],
        ),
      ]);
      const privateIdentity = await decryptPrivatePassportIdentity({
        encryptionKey: this.env.PII_ENCRYPTION_KEY_V1,
        privateProfile: privateProfileField.rows[0]
          ? {
            ciphertext: privateProfileField.rows[0].encrypted_payload,
            encryptionKeyVersion: privateProfileField.rows[0].encryption_key_version,
          }
          : undefined,
        contactEmail: contactEmailField.rows[0],
        decrypt: decryptField,
      });
      const [
        posts,
        comments,
        follows,
        reactions,
        blocks,
        mutes,
        bookmarks,
        customFeeds,
        submittedFlags,
        media,
        provenance,
        contributions,
        reputationEvents,
        reputationProfile,
        userActivity,
        submittedAppeals,
        reviewerQualification,
        appealAssignments,
        appealVotes,
        appealAdjudications,
        appealOutcomes,
        appealOutcomeEffects,
        accountabilitySignals,
        notificationPreferences,
        notificationDevices,
      ] = await Promise.all([
        query(this.env.DB_JOBS_FRESH, `SELECT id, body, declared_creation_mode, visibility, moderation_state, geo_scope, place_id, published_at, created_at FROM content.posts WHERE author_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, post_id, parent_id, body, moderation_state, created_at FROM content.comments WHERE author_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT follower_id, followed_id, created_at FROM social.follows WHERE follower_id = $1 OR followed_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT user_id, post_id, reaction_type, created_at FROM social.reactions WHERE user_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT blocker_id, blocked_id, created_at FROM social.blocks WHERE blocker_id = $1 OR blocked_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT muter_id, muted_id, created_at FROM social.mutes WHERE muter_id = $1 OR muted_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT user_id, post_id, created_at FROM social.bookmarks WHERE user_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_PRIVACY_FRESH,
          `SELECT feed.id, feed.name, feed.created_at,
                  COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('id', feed_rule.id, 'rule', feed_rule.rule, 'createdAt', feed_rule.created_at)
                                     ORDER BY feed_rule.created_at, feed_rule.id)
                    FROM social.custom_feed_rules feed_rule
                    WHERE feed_rule.feed_id = feed.id
                  ), '[]'::jsonb) AS rules
             FROM social.custom_feeds feed
            WHERE feed.user_id = $1
            ORDER BY feed.created_at, feed.id`,
          [subjectId]),
        query(this.env.DB_PRIVACY_FRESH,
          `SELECT id, content_type, content_id, reason_code, created_at
             FROM moderation.content_flags
            WHERE reporter_id = $1
            ORDER BY created_at, id`,
          [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, object_key, content_type, byte_size, sha256, state, created_at, deleted_at FROM media.objects WHERE owner_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT content_id, declared_creation_mode, detected_content_class, detector_provider, detector_model_version, policy_version, appeal_state, final_decision, created_at FROM trust.provenance_events WHERE author_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT content_id, human_authorship_eligibility, quality_signal, source_signal, behaviour_signal, policy_version, points_delta, reversal_reference, created_at FROM trust.human_contribution_events WHERE subject_user_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, content_id, event_type, pillar, impact, source_event_id, moderation_decision_id, appeal_id, status, effective_at, expires_at, explanation_code, visibility, policy_version, points_delta, reversal_reference, created_at FROM trust.reputation_events WHERE subject_user_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT user_id, policy_version, current_level, total_score, accountability_score, contribution_score, conduct_score, sourcing_score, authenticity_score, review_reliability_score, active_days, active_weeks, qualifying_human_contributions, promotion_blockers, status, evaluated_at, updated_at FROM trust.reputation_profiles WHERE user_id = $1`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, user_id, actor_user_id, event_type, category, source, source_event_id, correlation_id, title, explanation, result, reason_code, policy_version, object_type, object_id, reputation_effect, appealable, metadata, retention_class, retention_until, created_at FROM trust.user_activity_events WHERE user_id = $1 ORDER BY created_at, id`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, case_id, state, risk_class, policy_version, expires_at, reviewer_panel_result_at, adjudicated_at, created_at, resolved_at FROM moderation.appeals WHERE appellant_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT user_id, state, policy_version, trained_at, suspended_at, reason_code, updated_at FROM moderation.reviewer_qualifications WHERE user_id = $1`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, appeal_id, assignment_ordinal, level_snapshot, qualification_snapshot, vote_weight_snapshot, state, conflict_checked, policy_version, assigned_at, recused_at FROM moderation.appeal_assignments WHERE reviewer_id = $1 ORDER BY assigned_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, appeal_id, reviewer_id, decision, level_snapshot, qualification_snapshot, vote_weight_snapshot, policy_version, locked_at FROM moderation.appeal_review_votes WHERE reviewer_id = $1 ORDER BY locked_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, appeal_id, adjudicator_id, adjudicator_role, trained_snapshot, decision, reason_code, policy_version, created_at FROM moderation.appeal_adjudications WHERE adjudicator_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT o.appeal_id, o.risk_class, o.reviewer_panel_decision, o.final_decision, o.completed_reviewers, o.total_weight, o.overturn_weight, o.uphold_weight, o.winning_share, o.required_adjudicators, o.state, o.policy_version, o.evaluated_at, o.resolved_at FROM moderation.appeal_outcomes o JOIN moderation.appeals a ON a.id = o.appeal_id WHERE a.appellant_id = $1 ORDER BY o.evaluated_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT e.id, e.appeal_id, e.effect_type, e.target_type, e.target_id, e.source_event_id, e.applied_at FROM moderation.appeal_outcome_effects e JOIN moderation.appeals a ON a.id = e.appeal_id WHERE a.appellant_id = $1 ORDER BY e.applied_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, signal_type, signal_value, policy_version, created_at FROM trust.accountability_signals WHERE user_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT email_enabled, push_enabled, replies_enabled, moderation_enabled, rewards_enabled, updated_at FROM feed.notification_preferences WHERE user_id = $1`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, platform, active, created_at, revoked_at FROM feed.notification_devices WHERE user_id = $1 ORDER BY created_at`, [subjectId]),
      ]);
      return buildPrivacyDataPassport({
        generatedAt: new Date().toISOString(),
        profile: identity.rows[0] ?? null,
        privateProfile: privateIdentity.privateProfile,
        contactEmail: privateIdentity.contactEmail,
        consentRecords: consentRecords.rows,
        entitlement: entitlement.rows[0] ?? null,
        rewardRedemptions: rewardRedemptions.rows,
        accountEvents: accountEvents.rows,
        posts: posts.rows,
        comments: comments.rows,
        follows: follows.rows,
        reactions: reactions.rows,
        blocks: blocks.rows,
        mutes: mutes.rows,
        bookmarks: bookmarks.rows,
        customFeeds: customFeeds.rows,
        submittedFlags: submittedFlags.rows,
        media: media.rows,
        provenance: provenance.rows,
        humanContribution: contributions.rows,
        reputationProfile: reputationProfile.rows[0] ?? null,
        reputationEvents: reputationEvents.rows,
        accountabilitySignals: accountabilitySignals.rows,
        notificationPreferences: notificationPreferences.rows[0] ?? null,
        notificationDevices: notificationDevices.rows,
        activity: userActivity.rows,
        submittedAppeals: submittedAppeals.rows,
        reviewerQualification: reviewerQualification.rows[0] ?? null,
        appealAssignments: appealAssignments.rows,
        appealVotes: appealVotes.rows,
        appealAdjudications: appealAdjudications.rows,
        appealOutcomes: appealOutcomes.rows,
        appealOutcomeEffects: appealOutcomeEffects.rows,
        subjectDataLocations: locations.rows,
      });
    });

    const completion = await step.do('store-export-and-complete-request', async () => {
      const body = JSON.stringify(passport);
      const bytes = new TextEncoder().encode(body);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const packageHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      const objectKey = `exports/${subjectId}/${requestId}.json`;
      await exportsBucket.put(objectKey, bytes, { httpMetadata: { contentType: 'application/json' } });
      const activityEventId = await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(
          `INSERT INTO privacy.export_manifests (id, request_id, object_key, package_hash, expires_at)
           VALUES ($1, $2, $3, $4, now() + interval '7 days')
           ON CONFLICT (request_id, object_key)
           DO UPDATE SET package_hash = EXCLUDED.package_hash, expires_at = EXCLUDED.expires_at`,
          [uuidv7(), requestId, objectKey, packageHash],
        );
        await client.query(`UPDATE privacy.requests SET state = 'completed', completed_at = now() WHERE id = $1`, [requestId]);
        await client.query(`INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
          SELECT $1, $2, 'completed', $3::jsonb
           WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'completed')`, [uuidv7(), requestId, JSON.stringify({ objectKey, packageHash })]);
        const activity = await recordUserActivity(client, {
          id: uuidv7(), userId: subjectId,
          eventType: 'privacy.export_generated', category: 'privacy', source: 'workflow',
          sourceEventId: requestId, correlationId: requestId,
          title: 'Data export is ready',
          explanation: 'Your requested data export has been generated and is available for the configured retention period.',
          result: 'succeeded', policyVersion: ACTIVITY_POLICY_VERSION,
          objectType: 'privacy_request', objectId: requestId, reputationEffect: 'none', appealable: false,
          retentionClass: 'security', metadata: { requestType: 'export', requestState: 'completed' },
          createdAt: new Date().toISOString(),
        });
        return activity.id;
      });
      return { packageHash, activityEventId };
    });
    await step.do('record-export-outcome', async () => {
      await transaction(this.env.DB_JOBS_FRESH, (client) => insertPreferenceAwareNotification(client, {
        recipientId: subjectId, notificationType: 'privacy.export_ready', entityId: requestId,
        sourceEventId: requestId, policyVersion: ACTIVITY_POLICY_VERSION,
        preferenceClass: 'always', activityEventId: completion.activityEventId,
      }));
      return true;
    });
    return { subjectId, state: 'completed' };
  }
}

export class RetentionCleanupWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep): Promise<{ runId: string; redactedPosts: number; deletedMedia: number; expiredActivityEvents: number; expiredAccountEvents: number; expiredSystemAuditEvents: number; expiredRateLimitWindows: number; expiredIdempotencyTombstones: number; expiredWaitlistSignups: number }> {
    const securityAuditRetention = securityAuditRetentionPlan();
    const securityRetentionInterval = `${securityAuditRetention.retentionDays} days`;
    const expiredActivityEvents = await step.do('purge-expired-user-activity', async () => {
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `DELETE FROM trust.user_activity_events activity
          WHERE activity.retention_until <= now()
            AND NOT EXISTS (
              SELECT 1 FROM privacy.legal_holds hold
               WHERE hold.subject_id = activity.user_id AND hold.active
            )
          RETURNING activity.id`);
      return result.rowCount ?? 0;
    });
    const expiredAccountEvents = await step.do('purge-expired-account-events', async () => {
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `DELETE FROM identity.account_events account_event
          WHERE account_event.created_at < now() - $1::interval
            AND NOT EXISTS (
              SELECT 1 FROM privacy.legal_holds hold
               WHERE hold.subject_id = account_event.user_id AND hold.active
            )
          RETURNING account_event.id`,
        [securityRetentionInterval]);
      return result.rowCount ?? 0;
    });
    const expiredSystemAuditEvents = await step.do('purge-expired-system-audit-events', async () => {
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `DELETE FROM system.audit_events audit_event
          WHERE audit_event.created_at < now() - $1::interval
            AND NOT EXISTS (
              SELECT 1 FROM privacy.legal_holds hold
               WHERE hold.active
                 AND (
                   hold.subject_id = audit_event.actor_id
                   OR (audit_event.target_type = 'user' AND audit_event.target_id = hold.subject_id)
                 )
            )
          RETURNING audit_event.id`,
        [securityRetentionInterval]);
      return result.rowCount ?? 0;
    });
    const expiredRateLimitWindows = await step.do('purge-expired-rate-limit-windows', async () => {
      const result = await query<{ scope: string }>(this.env.DB_JOBS_FRESH,
        `DELETE FROM system.rate_limit_windows
          WHERE window_started_at < date_trunc('day', now()) - interval '2 days'
          RETURNING scope`);
      return result.rowCount ?? 0;
    });
    const expiredIdempotencyTombstones = await step.do('purge-anonymized-idempotency-tombstones', async () => {
      const result = await query<{ scope: string }>(this.env.DB_JOBS_FRESH,
        `DELETE FROM system.idempotency_keys
          WHERE actor_id IS NULL
            AND COALESCE(response ->> 'state', '') <> 'completed'
            AND created_at < now() - interval '30 days'
          RETURNING scope`);
      return result.rowCount ?? 0;
    });
    const expiredWaitlistSignups = await step.do('purge-expired-waitlist-signups', async () => {
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `DELETE FROM marketing.waitlist_signups
          WHERE purge_after <= now()
            AND retention_hold = false
          RETURNING id`);
      const deleted = result.rowCount ?? 0;
      logEvent({
        service: 'lythaus-jobs',
        event: 'waitlist.retention_purged',
        runId: event.payload.runId,
        deleted,
      });
      return deleted;
    });
    const candidates = await step.do('find-retention-candidates', async () => {
      const result = await query<{ user_id: string; content_type: string; retention_period: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT user_id, content_type, retention_period::text FROM privacy.retention_rules ORDER BY created_at LIMIT 100`);
      return result.rows;
    });
    let redactedPosts = 0;
    let deletedMedia = 0;
    for (const [index, candidate] of candidates.entries()) {
      const result = await step.do(`apply-retention-${index}`, async () => {
        const hold = await query(this.env.DB_PRIVACY_FRESH, `SELECT 1 FROM privacy.legal_holds WHERE subject_id = $1 AND active LIMIT 1`, [candidate.user_id]);
        const plan = retentionCleanupPlan(hold.rowCount !== 0, candidate.content_type);
        if (plan === 'skip') return { posts: 0, media: 0 };
        if (plan === 'redact_posts') {
          const redactedPosts = await transaction(this.env.DB_JOBS_FRESH, async (client) => {
            const updated = await client.query<{ id: string }>(
              `UPDATE content.posts SET body = '[retention policy]', visibility = 'private', moderation_state = 'blocked', published_at = NULL, updated_at = now()
                WHERE author_id = $1 AND created_at < now() - $2::interval AND body <> '[retention policy]' RETURNING id`,
              [candidate.user_id, candidate.retention_period],
            );
            if (updated.rowCount !== 0) await client.query(
              `INSERT INTO system.audit_events (id, action, target_type, reason_code, correlation_id, metadata) VALUES ($1, 'retention.posts_redacted', 'user', 'RETENTION_POLICY', $2, $3::jsonb)`,
              [uuidv7(), event.payload.runId, JSON.stringify({ subjectId: candidate.user_id, count: updated.rowCount })],
            );
            return updated.rowCount ?? 0;
          });
          return { posts: redactedPosts, media: 0 };
        }
        if (plan === 'delete_media') {
          const objects = await query<{ id: string; object_key: string; byte_size: number }>(this.env.DB_JOBS_FRESH,
            `SELECT id, object_key, byte_size FROM media.objects WHERE owner_id = $1 AND created_at < now() - $2::interval AND deleted_at IS NULL`,
            [candidate.user_id, candidate.retention_period]);
          if (!this.env.MEDIA_APPROVED) throw new Error('media_purge_not_configured');
          for (const object of objects.rows) await this.env.MEDIA_APPROVED.delete(object.object_key);
          const deletedMedia = await transaction(this.env.DB_JOBS_FRESH, async (client) => {
            let deletedCount = 0;
            for (const object of objects.rows) {
              const updated = await client.query(
                `UPDATE media.objects SET state = 'deleted', deleted_at = COALESCE(deleted_at, now()) WHERE id = $1 AND deleted_at IS NULL`,
                [object.id],
              );
              if (updated.rowCount === 0) continue;
              deletedCount += 1;
              await client.query(
                `UPDATE media.storage_ledger SET bytes_approved = greatest(bytes_approved - $1, 0), object_count = greatest(object_count - 1, 0), last_reconciled_at = now() WHERE user_id = $2`,
                [object.byte_size, candidate.user_id],
              );
            }
            if (deletedCount !== 0) await client.query(
              `INSERT INTO system.audit_events (id, action, target_type, reason_code, correlation_id, metadata) VALUES ($1, 'retention.media_deleted', 'user', 'RETENTION_POLICY', $2, $3::jsonb)`,
              [uuidv7(), event.payload.runId, JSON.stringify({ subjectId: candidate.user_id, count: deletedCount })],
            );
            return deletedCount;
          });
          return { posts: 0, media: deletedMedia };
        }
        return { posts: 0, media: 0 };
      });
      redactedPosts += result.posts;
      deletedMedia += result.media;
    }
    return { runId: event.payload.runId, redactedPosts, deletedMedia, expiredActivityEvents, expiredAccountEvents, expiredSystemAuditEvents, expiredRateLimitWindows, expiredIdempotencyTombstones, expiredWaitlistSignups };
  }
}

export class AppealLifecycleWorkflow extends WorkflowEntrypoint<Env, { appealId: string }> {
  async run(event: WorkflowEvent<{ appealId: string }>, step: WorkflowStep): Promise<{ appealId: string; state: string }> {
    const appealId = event.payload.appealId;
    if (!this.env.APPEAL_ASSIGNMENT_SECRET || this.env.APPEAL_ASSIGNMENT_SECRET.length < 32) {
      throw new Error('appeal_assignment_secret_not_configured');
    }

    let lifecycle = { state: 'waiting_reviewer_pool', expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      lifecycle = await step.do(`assign-reviewers-${attempt}`, async () => transaction(this.env.DB_JOBS_FRESH, async (client) => {
        const appeal = await client.query<{
          state: string;
          risk_class: string;
          policy_version: string;
          appellant_id: string;
          case_id: string;
          expires_at: string;
        }>(
          `SELECT state, risk_class, policy_version, appellant_id, case_id, expires_at
             FROM moderation.appeals
            WHERE id = $1
            FOR UPDATE`,
          [appealId],
        );
        const row = appeal.rows[0];
        if (!row) throw new Error('appeal_not_found');
        if (row.state !== 'open') return { state: row.state, expiresAt: row.expires_at };
        if (row.policy_version !== APPEAL_POLICY.version) throw new Error('appeal_policy_version_unsupported');
        if (row.risk_class !== 'standard' && row.risk_class !== 'high') throw new Error('appeal_risk_class_invalid');
        await client.query(
          `INSERT INTO moderation.appeal_outcomes
             (appeal_id, risk_class, completed_reviewers, total_weight, overturn_weight, uphold_weight,
              winning_share, required_adjudicators, state, policy_version)
           VALUES ($1, $2, 0, 0, 0, 0, 0, $3, 'pending_quorum', $4)
           ON CONFLICT (appeal_id) DO NOTHING`,
          [appealId, row.risk_class,
            row.risk_class === 'high' ? APPEAL_POLICY.highRiskAdjudicatorsRequired : APPEAL_POLICY.standardAdjudicatorsRequired,
            APPEAL_POLICY.version],
        );
        const existing = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM moderation.appeal_assignments
            WHERE appeal_id = $1 AND state IN ('assigned', 'voted')`,
          [appealId],
        );
        if (Number(existing.rows[0]?.count ?? 0) >= APPEAL_POLICY.reviewerCount) {
          return { state: 'reviewers_assigned', expiresAt: row.expires_at };
        }

        const candidates = await client.query<{
          user_id: string;
          current_level: number;
          conflict: boolean;
        }>(
          `SELECT qualification.user_id,
                  COALESCE(profile.current_level, 0)::integer AS current_level,
                  (
                    EXISTS (
                      SELECT 1 FROM moderation.decisions decision
                       WHERE decision.case_id = $2 AND decision.decided_by = qualification.user_id
                    )
                    OR EXISTS (
                      SELECT 1 FROM social.blocks block
                       WHERE (block.blocker_id = qualification.user_id AND block.blocked_id = $3)
                          OR (block.blocker_id = $3 AND block.blocked_id = qualification.user_id)
                    )
                    OR EXISTS (
                      SELECT 1 FROM social.follows follow
                       WHERE (follow.follower_id = qualification.user_id AND follow.followed_id = $3)
                          OR (follow.follower_id = $3 AND follow.followed_id = qualification.user_id)
                    )
                  ) AS conflict
             FROM moderation.reviewer_qualifications qualification
             JOIN identity.users reviewer ON reviewer.id = qualification.user_id AND reviewer.status = 'active'
             LEFT JOIN trust.reputation_profiles profile ON profile.user_id = qualification.user_id
            WHERE qualification.state = 'trained'
              AND qualification.user_id <> $3
              AND COALESCE(profile.status, 'active') = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM moderation.appeal_assignments assigned
                 WHERE assigned.appeal_id = $1 AND assigned.reviewer_id = qualification.user_id
              )
            ORDER BY qualification.user_id
            LIMIT 250`,
          [appealId, row.case_id, row.appellant_id],
        );
        const pool: AppealReviewerCandidate[] = candidates.rows.map((candidate) => ({
          userId: candidate.user_id,
          level: Math.max(0, Math.min(5, Number(candidate.current_level))) as AppealReviewerCandidate['level'],
          qualification: 'trained',
          assignmentEligible: true,
          conflict: candidate.conflict,
        }));
        const eligibleCount = pool.filter((candidate) => !candidate.conflict).length;
        if (eligibleCount < APPEAL_POLICY.reviewerCount) {
          return { state: 'waiting_reviewer_pool', expiresAt: row.expires_at };
        }
        const assignments = await selectAppealReviewers({
          appealId,
          appellantId: row.appellant_id,
          assignmentSeed: this.env.APPEAL_ASSIGNMENT_SECRET as string,
          candidates: pool,
        });
        for (const [index, assignment] of assignments.entries()) {
          const assignmentId = uuidv7();
          const rankHash = await sha256Hex(`${appealId}:${this.env.APPEAL_ASSIGNMENT_SECRET}:${assignment.reviewerId}`);
          await client.query(
            `INSERT INTO moderation.appeal_assignments
               (id, appeal_id, reviewer_id, assignment_ordinal, level_snapshot,
                qualification_snapshot, vote_weight_snapshot, conflict_checked,
                random_rank_hash, policy_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
             ON CONFLICT (appeal_id, reviewer_id) DO NOTHING`,
            [assignmentId, appealId, assignment.reviewerId, index + 1, assignment.levelSnapshot,
              assignment.qualificationSnapshot, assignment.voteWeightSnapshot, rankHash, assignment.policyVersion],
          );
          const activity = await recordUserActivity(client, {
            id: uuidv7(), userId: assignment.reviewerId,
            eventType: 'appeals.reviewer_assignment_changed', category: 'appeals', source: 'workflow',
            sourceEventId: assignmentId, correlationId: appealId,
            title: 'Appeal review assigned',
            explanation: 'You were independently selected for a time-limited trained reviewer-panel appeal.',
            result: 'pending', policyVersion: assignment.policyVersion,
            objectType: 'appeal', objectId: appealId, reputationEffect: 'none', appealable: false,
            retentionClass: 'moderation', metadata: { appealState: 'assigned', riskClass: row.risk_class },
            createdAt: new Date().toISOString(),
          });
          await insertPreferenceAwareNotification(client, {
            recipientId: assignment.reviewerId,
            notificationType: 'appeals.reviewer_assigned',
            entityId: appealId,
            sourceEventId: assignmentId,
            policyVersion: assignment.policyVersion,
            preferenceClass: 'moderation',
            activityEventId: activity.id,
          });
        }
        return { state: 'reviewers_assigned', expiresAt: row.expires_at };
      }));
      if (lifecycle.state !== 'waiting_reviewer_pool') break;
      if (attempt < 7) await step.sleep(`wait-for-reviewer-pool-${attempt}`, '24 hours');
    }

    if (lifecycle.state !== 'open' && lifecycle.state !== 'resolved' && lifecycle.state !== 'expired') {
      const expiryTime = Date.parse(lifecycle.expiresAt);
      if (Number.isFinite(expiryTime) && expiryTime > Date.now()) {
        await step.sleepUntil('await-appeal-expiry', expiryTime);
      }
    }
    const state = await step.do('expire-unresolved-appeal', async () => transaction(this.env.DB_JOBS_FRESH, async (client) => {
      const appeal = await client.query<{ state: string; appellant_id: string; risk_class: string }>(
        `SELECT state, appellant_id, risk_class FROM moderation.appeals WHERE id = $1 FOR UPDATE`, [appealId]);
      const row = appeal.rows[0];
      if (!row) throw new Error('appeal_not_found');
      if (row.state !== 'open') return row.state;
      await client.query(`UPDATE moderation.appeals SET state = 'expired', resolved_at = now() WHERE id = $1`, [appealId]);
      await client.query(`UPDATE moderation.appeal_assignments SET state = 'expired' WHERE appeal_id = $1 AND state = 'assigned'`, [appealId]);
      await client.query(
        `UPDATE moderation.appeal_outcomes
            SET state = 'no_consensus', evaluated_at = now()
          WHERE appeal_id = $1 AND state <> 'resolved'`,
        [appealId],
      );
      const activity = await recordUserActivity(client, {
        id: uuidv7(), userId: row.appellant_id,
        eventType: 'appeals.appeal_resolved', category: 'appeals', source: 'workflow',
        sourceEventId: appealId, correlationId: appealId,
        title: 'Appeal review expired',
        explanation: 'The appeal window closed without the required complete governance outcome.',
        result: 'withheld', reasonCode: 'APPEAL_REVIEW_EXPIRED', policyVersion: APPEAL_POLICY.version,
        objectType: 'appeal', objectId: appealId, reputationEffect: 'none', appealable: false,
        retentionClass: 'moderation', metadata: { appealState: 'expired', riskClass: row.risk_class, outcome: 'no_consensus' },
        createdAt: new Date().toISOString(),
      });
      await insertPreferenceAwareNotification(client, {
        recipientId: row.appellant_id,
        notificationType: 'appeals.appeal_expired',
        entityId: appealId,
        sourceEventId: appealId,
        policyVersion: APPEAL_POLICY.version,
        preferenceClass: 'moderation',
        activityEventId: activity.id,
      });
      return 'expired';
    }));
    return { appealId, state };
  }
}

export class BackupValidationWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep): Promise<{ runId: string; state: string }> {
    const runId = event.payload.runId;
    const database = await step.do('verify-database-capabilities', async () => {
      const extensions = await query<{ extname: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_trgm', 'unaccent') ORDER BY extname`);
      const required = ['pgcrypto', 'pg_trgm', 'unaccent'];
      const present = new Set(extensions.rows.map((row) => row.extname));
      const missing = required.filter((name) => !present.has(name));
      if (missing.length) throw new Error(`backup_capability_extensions_missing:${missing.join(',')}`);
      const schemaObjects = await query<{ count: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT count(*)::text AS count
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'system')
            AND c.relkind IN ('r', 'p', 'v', 'm')`);
      if (Number(schemaObjects.rows[0]?.count ?? 0) < 76) throw new Error('backup_schema_objects_missing');
      return { extensions: required, schemaObjectCount: Number(schemaObjects.rows[0]?.count ?? 0) };
    });

    await step.do('record-backup-validation', async () => {
      await query(this.env.DB_PRIVACY_FRESH,
        `INSERT INTO system.audit_events (id, action, target_type, target_id, reason_code, correlation_id, metadata)
         SELECT $1, 'backup.schema_validation.completed', 'backup', NULL, 'SCHEMA_RECONSTRUCTION_CHECK', $2, $3::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM system.audit_events
             WHERE action = 'backup.schema_validation.completed'
               AND correlation_id = $2
          )`,
        [uuidv7(), runId, JSON.stringify({ runId, ...database })]);
      return true;
    });
    return { runId, state: 'completed' };
  }
}
