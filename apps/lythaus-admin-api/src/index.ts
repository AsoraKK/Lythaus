import { databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, query, recordUserActivity, transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { ACTIVITY_POLICY_VERSION, APPEAL_POLICY, encodeCursor, enforceAdminAllowPublication } from '@lythaus/contracts';
import { assertExpectedHostname, correlationId, json, logEvent } from '@lythaus/observability';
import { constantTimeEqual, decryptField, hmacLookup, uuidv7 } from '@lythaus/security';
import { adminCorsPreflight, assertAdminMutationRequest, withAdminCors } from './admin-cors-policy.ts';
import { requireActiveAdminMembership, verifiedAccessSubject, type AdminActor } from './admin-access-runtime-policy.ts';
import { readBoundedJson } from './request-body-policy.ts';
import { adminWaitlistFilters, parseAdminUserId, parseReasonCode, rejectUnknownFields, requireConfirmation } from './admin-runtime-policy.ts';
import { appealOutcomeAuditPlan, assertActionableModerationCase, evaluateAppealFromRecords, parseAppealAdjudicationRequest, type AppealAdjudicationRecord, type AppealVoteRecord } from './runtime-policy.ts';
import { assertWaitlistAdminRole, assertWaitlistStatusTransition, parseWaitlistId, parseWaitlistRetentionHoldUpdate, parseWaitlistStatusUpdate, requireWaitlistEncryptionKey, waitlistAuditMetadata, waitlistPageRequest } from './waitlist-runtime-policy.ts';
import {
  createWaitlistEntry,
  deleteWaitlistEntry,
  getAdminAuthSummary,
  getAdminEmailHealth,
  getAdminUser,
  inviteAdminUser,
  listAdminUsers,
  patchAdminUser,
  resendAdminVerification,
  revokeAdminUserSessions,
  deleteAdminUser,
  updateAdminWaitlistEntry,
  type KeeperEnv,
} from './keeper-runtime.ts';

interface Env extends EnvBindings {
  WORKER_VERSION: NonNullable<EnvBindings['WORKER_VERSION']>;
  DB_ADMIN_FRESH: HyperdriveBinding;
  DB_PRIVACY_FRESH: HyperdriveBinding;
  ACCESS_AUDIENCES?: string;
}

const ADMIN_ERROR_CODES = new Set([
  'access_assertion_invalid', 'access_required', 'access_subject_missing',
  'access_verification_not_configured', 'admin_public_label_declaration_mismatch',
  'admin_mutation_content_type_invalid', 'admin_mutation_origin_invalid', 'admin_role_required', 'admin_subject_key_not_configured',
  'auth_data_unavailable', 'auth_email_dispatch_unavailable', 'confirmation_required',
  'email_already_verified', 'email_change_requires_public_flow', 'idempotency_in_progress', 'idempotency_key_reused', 'idempotency_key_required', 'invalid_email',
  'ai_assisted_character_limit_exceeded', 'ai_generated_public_content_blocked',
  'appeal_adjudication_decision_invalid', 'appeal_adjudication_locked',
  'appeal_adjudication_not_recorded', 'appeal_adjudicator_conflict',
  'appeal_adjudicator_required', 'appeal_adjudicator_role_invalid',
  'appeal_adjudicator_training_required', 'appeal_already_resolved', 'appeal_not_found',
  'appeal_policy_version_unsupported', 'appeal_risk_class_invalid',
  'appeal_subject_not_found', 'appeal_vote_decision_invalid', 'appeal_vote_level_invalid',
  'appeal_vote_qualification_invalid', 'appeal_vote_weight_invalid',
  'invalid_account_status', 'invalid_date_filter', 'invalid_display_name', 'invalid_editorial_publication', 'invalid_handle', 'invalid_json',
  'invalid_cursor', 'invalid_page_limit', 'invalid_waitlist_id', 'invalid_waitlist_retention_hold', 'invalid_waitlist_status',
  'invalid_legal_hold', 'invalid_moderation_outcome', 'invalid_public_label', 'invalid_source',
  'invalid_subscription_tier', 'invalid_user_id', 'invalid_user_search', 'invalid_user_source_filter', 'invalid_user_status_filter',
  'invalid_waitlist_search', 'invalid_waitlist_source', 'legal_hold_not_found',
  'moderation_case_already_resolved', 'moderation_case_not_found', 'moderation_declaration_missing',
  'moderation_case_superseded', 'rate_limit_exceeded', 'reason_code_required',
  'request_too_large', 'reviewer_qualification_state_invalid', 'unknown_field', 'user_email_exists', 'user_not_found', 'waitlist_duplicate', 'waitlist_not_found', 'waitlist_status_transition_invalid', 'waitlist_unavailable',
]);

function adminError(error: unknown): { exposedCode: string; internalCode: string; status: number } {
  const internalCode = error instanceof Error ? error.message : 'non_error_thrown';
  const exposedCode = ADMIN_ERROR_CODES.has(internalCode) ? internalCode : 'admin_request_failed';
  const status = exposedCode === 'admin_request_failed' || exposedCode === 'appeal_adjudication_not_recorded' ? 500
    : ['access_verification_not_configured', 'admin_subject_key_not_configured', 'waitlist_unavailable'].includes(exposedCode) ? 503
    : ['access_required', 'access_assertion_invalid', 'access_subject_missing'].includes(exposedCode) ? 401
      : ['auth_data_unavailable', 'auth_email_dispatch_unavailable'].includes(exposedCode) ? 503
        : ['admin_role_required', 'admin_mutation_origin_invalid'].includes(exposedCode) ? 403
          : exposedCode === 'not_found' || exposedCode.endsWith('_not_found') ? 404
              : ['appeal_adjudication_locked', 'appeal_already_resolved', 'email_already_verified', 'idempotency_in_progress', 'idempotency_key_reused', 'moderation_case_already_resolved', 'moderation_case_superseded', 'moderation_declaration_missing', 'user_email_exists', 'waitlist_duplicate', 'waitlist_status_transition_invalid'].includes(exposedCode) ? 409
              : exposedCode === 'request_too_large' ? 413
                : exposedCode === 'admin_mutation_content_type_invalid' ? 415
                : exposedCode === 'rate_limit_exceeded' ? 429 : 400;
  return { exposedCode, internalCode, status };
}

function hasReadinessAuthorization(request: Request, env: Env): boolean {
  const configured = env.DATABASE_READINESS_TOKEN;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configured || !supplied) return false;
  return constantTimeEqual(new TextEncoder().encode(configured), new TextEncoder().encode(supplied));
}

async function requireAdmin(request: Request, env: Env): Promise<AdminActor> {
  if (!env.ACCESS_SUBJECT_HMAC_KEY) throw new Error('admin_subject_key_not_configured');
  const subjectHmac = hmacLookup(await verifiedAccessSubject(request, env), env.ACCESS_SUBJECT_HMAC_KEY);
  const result = await query<{ user_id: string; role: string }>(env.DB_ADMIN_FRESH,
    `SELECT user_id, role FROM identity.admin_memberships WHERE access_subject_hmac = decode($1, 'base64') AND active = true`,
    [subjectHmac]
  );
  if (result.rowCount !== 1) throw new Error('admin_role_required');
  return requireActiveAdminMembership(result.rows[0]);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function enforceAdminRateLimit(request: Request, env: Env, actorId: string): Promise<void> {
  const subjectHash = await sha256Hex(`admin:${actorId}`);
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const result = await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.rate_limit_windows (scope, subject_hash, window_started_at, request_count, expires_at)
     VALUES ('admin-api', $1, $2, 1, $2::timestamptz + interval '2 minutes')
     ON CONFLICT (scope, subject_hash, window_started_at)
     DO UPDATE SET request_count = system.rate_limit_windows.request_count + 1
     WHERE system.rate_limit_windows.request_count < 120
     RETURNING request_count`, [subjectHash, windowStartedAt]);
  if (result.rowCount !== 1) throw new Error('rate_limit_exceeded');
}

async function listModerationCases(env: Env): Promise<unknown[]> {
  const result = await query(env.DB_ADMIN_FRESH,
    `SELECT c.id, c.content_type, c.content_id, c.state, c.policy_version, c.created_at,
            count(f.id)::integer AS flag_count
     FROM moderation.cases c
     LEFT JOIN moderation.content_flags f ON f.content_type = c.content_type AND f.content_id = c.content_id
     GROUP BY c.id, c.content_type, c.content_id, c.state, c.policy_version, c.created_at
     ORDER BY (c.state = 'open') DESC, c.created_at ASC LIMIT 200`);
  return result.rows;
}

interface WaitlistRow {
  id: string;
  email_ciphertext: string;
  encryption_key_version: string;
  status: string;
  source: string;
  created_at: string | Date;
  invited_at: string | Date | null;
  converted_at: string | Date | null;
  unsubscribed_at: string | Date | null;
  retention_hold: boolean;
  linked_user_id?: string | null;
  linked_user_status?: string | null;
}

async function listWaitlist(request: Request, env: Env, actor: AdminActor, correlation: string): Promise<Response> {
  assertWaitlistAdminRole(actor.role);
  const encryptionKey = requireWaitlistEncryptionKey(env.PII_ENCRYPTION_KEY_V1);
  const filters = adminWaitlistFilters(new URL(request.url));
  const page = waitlistPageRequest(new URL(request.url));
  const values: unknown[] = [];
  const addValue = (value: unknown): string => { values.push(value); return `$${values.length}`; };
  const conditions = ['1 = 1'];
  if (filters.query) {
    if (!env.PII_HMAC_KEY_V1) throw new Error('waitlist_unavailable');
    conditions.push(`w.email_lookup_hmac = decode(${addValue(hmacLookup(filters.query.toLowerCase(), env.PII_HMAC_KEY_V1))}, 'base64')`);
  }
  if (filters.status) conditions.push(`w.status = ${addValue(filters.status)}`);
  if (filters.source) conditions.push(`w.source = ${addValue(filters.source)}`);
  if (filters.createdAfter) conditions.push(`w.created_at >= ${addValue(filters.createdAfter)}::timestamptz`);
  if (filters.createdBefore) conditions.push(`w.created_at < ${addValue(filters.createdBefore)}::timestamptz`);
  if (page.cursor) conditions.push(`(w.created_at, w.id) < (${addValue(page.cursor.timestamp)}::timestamptz, ${addValue(page.cursor.id)}::uuid)`);
  const limitValue = addValue(page.limit + 1);
  const [records, summaryResult] = await Promise.all([
    query<WaitlistRow>(env.DB_ADMIN_FRESH,
      `SELECT w.id, convert_from(w.email_ciphertext, 'utf8') AS email_ciphertext,
              w.encryption_key_version, w.status, w.source, w.created_at, w.invited_at, w.converted_at, w.unsubscribed_at, w.retention_hold,
              linked_user.id AS linked_user_id, linked_user.status AS linked_user_status
         FROM marketing.waitlist_signups w
         LEFT JOIN LATERAL (
           SELECT u.id, u.status FROM identity.users u
           LEFT JOIN identity.contact_emails c ON c.user_id = u.id
           LEFT JOIN identity.email_credentials e ON e.user_id = u.id
           WHERE COALESCE(c.email_lookup_hmac, e.email_lookup_hmac) = w.email_lookup_hmac
           LIMIT 1
         ) linked_user ON true
        WHERE ${conditions.join(' AND ')}
        ORDER BY w.created_at DESC, w.id DESC
        LIMIT ${limitValue}`,
      values),
    query<{ total_waiting: string; last_7_days: string; last_24_hours: string }>(env.DB_ADMIN_FRESH,
      `SELECT count(id) FILTER (WHERE status = 'waiting')::text AS total_waiting,
              count(id) FILTER (WHERE created_at >= now() - interval '7 days')::text AS last_7_days,
              count(id) FILTER (WHERE created_at >= now() - interval '24 hours')::text AS last_24_hours
         FROM marketing.waitlist_signups`),
  ]);
  const hasMore = records.rows.length > page.limit;
  const selectedRows = records.rows.slice(0, page.limit);
  const items = await Promise.all(selectedRows.map(async (row: WaitlistRow) => {
    const item: Record<string, unknown> = {
      id: row.id,
      email: await decryptField({ ciphertext: row.email_ciphertext, encryptionKeyVersion: row.encryption_key_version }, encryptionKey),
      status: row.status,
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
      invitedAt: row.invited_at ? new Date(row.invited_at).toISOString() : null,
      convertedAt: row.converted_at ? new Date(row.converted_at).toISOString() : null,
      unsubscribedAt: row.unsubscribed_at ? new Date(row.unsubscribed_at).toISOString() : null,
      retentionHold: row.retention_hold,
    };
    if (row.linked_user_id) item.linkedAccount = { id: row.linked_user_id, status: row.linked_user_status };
    return item;
  }));
  const tail = selectedRows.at(-1);
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.audit_events
       (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
     VALUES ($1, $2, 'marketing.waitlist_viewed', 'marketing.waitlist', NULL, 'WAITLIST_LIST_VIEW', $3, $4::jsonb)`,
    [uuidv7(), actor.userId, correlation, JSON.stringify({ ...waitlistAuditMetadata({
      returnedRowCount: items.length,
      requestedLimit: page.limit,
      hasCursor: page.cursor !== null,
      hasMore,
    }), hasSearch: Boolean(filters.query), statusFilter: filters.status, sourceFilter: filters.source })]);
  return json({
    items,
    nextCursor: hasMore && tail ? encodeCursor({ timestamp: new Date(tail.created_at).toISOString(), id: tail.id }) : null,
    summary: {
      totalWaiting: Number(summaryResult.rows[0]?.total_waiting ?? 0),
      last7Days: Number(summaryResult.rows[0]?.last_7_days ?? 0),
      last24Hours: Number(summaryResult.rows[0]?.last_24_hours ?? 0),
    },
  }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function updateWaitlistStatus(request: Request, env: Env, actor: AdminActor, rawId: string, correlation: string): Promise<Response> {
  assertWaitlistAdminRole(actor.role);
  const id = parseWaitlistId(rawId);
  const input = rejectUnknownFields(await readBoundedJson(request), ['status', 'reasonCode', 'confirmation']);
  const status = parseWaitlistStatusUpdate(input);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'UPDATE WAITLIST STATUS');
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const current = await client.query<{ status: string }>(
      `SELECT status FROM marketing.waitlist_signups WHERE id = $1 FOR UPDATE`, [id]);
    if (current.rowCount !== 1) throw new Error('waitlist_not_found');
    const previousStatus = current.rows[0].status;
    assertWaitlistStatusTransition(previousStatus, status);
    if (previousStatus !== status) {
      await client.query(
        `UPDATE marketing.waitlist_signups
            SET status = $2,
                updated_at = now(),
                invited_at = CASE WHEN $2 = 'invited' THEN COALESCE(invited_at, now()) ELSE invited_at END,
                converted_at = CASE WHEN $2 = 'converted' THEN COALESCE(converted_at, now()) ELSE converted_at END,
                unsubscribed_at = CASE WHEN $2 = 'unsubscribed' THEN COALESCE(unsubscribed_at, now()) ELSE unsubscribed_at END,
                purge_after = CASE WHEN $2 IN ('converted', 'unsubscribed')
                  THEN LEAST(purge_after, now() + interval '30 days') ELSE purge_after END
          WHERE id = $1`, [id, status]);
    }
    await client.query(
      `INSERT INTO system.audit_events
         (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'marketing.waitlist_status_changed', 'marketing.waitlist', $3,
               $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, id, reasonCode, correlation, JSON.stringify({ status, changed: previousStatus !== status })]);
    return { id, status };
  });
  return json(result, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function updateWaitlistRetentionHold(request: Request, env: Env, actor: AdminActor, rawId: string, correlation: string): Promise<Response> {
  assertWaitlistAdminRole(actor.role);
  const id = parseWaitlistId(rawId);
  const input = rejectUnknownFields(await readBoundedJson(request), ['active', 'reasonCode', 'confirmation']);
  const active = parseWaitlistRetentionHoldUpdate(input);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, active ? 'PLACE RETENTION HOLD' : 'RELEASE RETENTION HOLD');
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const updated = await client.query<{ id: string; retention_hold: boolean }>(
      `UPDATE marketing.waitlist_signups
          SET retention_hold = $2,
              updated_at = now(),
              retention_hold_at = CASE WHEN $2 AND retention_hold = false THEN now() ELSE retention_hold_at END,
              retention_hold_released_at = CASE WHEN $2 = false AND retention_hold THEN now() ELSE retention_hold_released_at END
        WHERE id = $1
      RETURNING id, retention_hold`, [id, active]);
    if (updated.rowCount !== 1) throw new Error('waitlist_not_found');
    await client.query(
      `INSERT INTO system.audit_events
         (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'marketing.waitlist_retention_hold_changed', 'marketing.waitlist', $3,
               $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, id, reasonCode, correlation, JSON.stringify({ active })]);
    return { id: updated.rows[0].id, retentionHold: updated.rows[0].retention_hold };
  });
  return json(result, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function searchUsers(request: Request, env: Env): Promise<Response> {
  const search = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (search.length < 2 || search.length > 120) throw new Error('invalid_user_search');
  const result = await query(env.DB_ADMIN_FRESH,
    `SELECT u.id, u.display_name, u.status, u.created_at, h.handle,
            COALESCE(e.subscription_tier, 'free') AS subscription_tier
     FROM identity.users u
     LEFT JOIN identity.handles h ON h.user_id = u.id
     LEFT JOIN identity.user_entitlements e ON e.user_id = u.id
     WHERE u.id::text = $1 OR u.display_name ILIKE $2 OR h.handle_normalized ILIKE $2
     ORDER BY u.created_at DESC LIMIT 50`, [search, `%${search.toLowerCase()}%`]);
  return json({ items: result.rows }, { headers: { 'cache-control': 'private, no-store' } });
}

async function setUserTier(request: Request, env: Env, actor: { userId: string; role: string }, userId: string, correlation: string): Promise<Response> {
  if (actor.role !== 'administrator') throw new Error('admin_role_required');
  const input = await readBoundedJson<{ tier?: 'free' | 'premium' | 'black'; reasonCode?: string }>(request);
  if (!input.tier || !['free', 'premium', 'black'].includes(input.tier)) throw new Error('invalid_subscription_tier');
  if (!input.reasonCode || !/^[A-Z0-9_.:-]{2,80}$/.test(input.reasonCode)) throw new Error('reason_code_required');
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const current = await client.query<{ subscription_tier: string }>(
      `SELECT subscription_tier FROM identity.user_entitlements WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const tierBefore = current.rows[0]?.subscription_tier ?? 'free';
    if (tierBefore === input.tier) return false;
    await client.query(
      `INSERT INTO identity.user_entitlements (user_id, subscription_tier, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET subscription_tier = EXCLUDED.subscription_tier,
         updated_by = EXCLUDED.updated_by, updated_at = now()`, [userId, input.tier, actor.userId]);
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'user.tier_changed', 'user', $3, $4, $5, $6::jsonb)`,
      [sourceEventId, actor.userId, userId, input.reasonCode, correlation, JSON.stringify({ tier: input.tier })]);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, correlation_id)
       VALUES ($1, 'identity.user.tier_changed', 'user', $2, $3, $4::jsonb, $5)`,
      [sourceEventId, userId, actor.userId, JSON.stringify({ userId, tier: input.tier }), correlation],
    );
    await recordUserActivity(client, {
      id: uuidv7(), userId, actorUserId: actor.userId,
      eventType: 'rewards.subscription_tier_changed', category: 'rewards', source: 'admin_api',
      sourceEventId, correlationId: correlation,
      title: 'Subscription tier changed',
      explanation: 'An authorised administrator changed your subscription entitlement. This does not change reputation.',
      result: 'succeeded', reasonCode: input.reasonCode, policyVersion: ACTIVITY_POLICY_VERSION,
      objectType: 'subscription_tier', objectId: userId, reputationEffect: 'none', appealable: false,
      retentionClass: 'security',
      metadata: { tierBefore, tierAfter: input.tier, entitlementType: 'subscription_tier' },
      createdAt: new Date().toISOString(),
    });
    return true;
  });
  return json({ userId, tier: input.tier, changed }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function legalHolds(request: Request, env: Env, actor: { userId: string; role: string }, correlation: string): Promise<Response> {
  if (!['privacy_operator', 'administrator'].includes(actor.role)) throw new Error('admin_role_required');
  if (request.method === 'GET') {
    const result = await query(env.DB_PRIVACY_FRESH,
      `SELECT id, subject_id, reason, active, created_at, released_at
       FROM privacy.legal_holds ORDER BY created_at DESC LIMIT 200`);
    return json({ items: result.rows }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const input = await readBoundedJson<{ subjectId?: string; reason?: string }>(request);
  const reason = input.reason?.trim() ?? '';
  if (!input.subjectId || !reason || reason.length > 1000) throw new Error('invalid_legal_hold');
  const subjectId = input.subjectId;
  const holdId = uuidv7();
  const sourceEventId = uuidv7();
  await transaction(env.DB_PRIVACY_FRESH, async (client) => {
    await client.query(`INSERT INTO privacy.legal_holds (id, subject_id, reason) VALUES ($1, $2, $3)`, [holdId, subjectId, reason]);
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id)
       VALUES ($1, $2, 'privacy.legal_hold_placed', 'legal_hold', $3, 'LEGAL_HOLD', $4)`,
      [sourceEventId, actor.userId, holdId, correlation]);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, correlation_id)
       VALUES ($1, 'privacy.legal_hold.placed', 'legal_hold', $2, $3, $4::jsonb, $5)`,
      [sourceEventId, holdId, actor.userId, JSON.stringify({ holdId, subjectId }), correlation],
    );
    await recordUserActivity(client, {
      id: uuidv7(), userId: subjectId, actorUserId: actor.userId,
      eventType: 'privacy.legal_restriction_changed', category: 'privacy', source: 'admin_api',
      sourceEventId, correlationId: correlation, title: 'Legal restriction applied',
      explanation: 'An authorised privacy operator applied a legal retention restriction to relevant records.',
      result: 'succeeded', reasonCode: 'LEGAL_HOLD', policyVersion: ACTIVITY_POLICY_VERSION,
      objectType: 'legal_hold', objectId: holdId, reputationEffect: 'none', appealable: true,
      retentionClass: 'security', metadata: { requestType: 'legal_hold', requestState: 'active', retentionClass: 'legal' },
      createdAt: new Date().toISOString(),
    });
  });
  return json({ id: holdId, subjectId, active: true }, { status: 201, headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function clearLegalHold(env: Env, actor: { userId: string; role: string }, holdId: string, correlation: string): Promise<Response> {
  if (!['privacy_operator', 'administrator'].includes(actor.role)) throw new Error('admin_role_required');
  const sourceEventId = uuidv7();
  await transaction(env.DB_PRIVACY_FRESH, async (client) => {
    const updated = await client.query<{ subject_id: string }>(`UPDATE privacy.legal_holds SET active = false, released_at = now() WHERE id = $1 AND active = true RETURNING subject_id`, [holdId]);
    if (updated.rowCount !== 1) throw new Error('legal_hold_not_found');
    const subjectId = updated.rows[0].subject_id;
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id)
       VALUES ($1, $2, 'privacy.legal_hold_cleared', 'legal_hold', $3, 'LEGAL_HOLD_CLEAR', $4)`,
      [sourceEventId, actor.userId, holdId, correlation]);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, correlation_id)
       VALUES ($1, 'privacy.legal_hold.cleared', 'legal_hold', $2, $3, $4::jsonb, $5)`,
      [sourceEventId, holdId, actor.userId, JSON.stringify({ holdId, subjectId }), correlation],
    );
    await recordUserActivity(client, {
      id: uuidv7(), userId: subjectId, actorUserId: actor.userId,
      eventType: 'privacy.legal_restriction_changed', category: 'privacy', source: 'admin_api',
      sourceEventId, correlationId: correlation, title: 'Legal restriction cleared',
      explanation: 'An authorised privacy operator cleared a legal retention restriction.',
      result: 'succeeded', reasonCode: 'LEGAL_HOLD_CLEAR', policyVersion: ACTIVITY_POLICY_VERSION,
      objectType: 'legal_hold', objectId: holdId, reputationEffect: 'none', appealable: false,
      retentionClass: 'security', metadata: { requestType: 'legal_hold', requestState: 'cleared', retentionClass: 'legal' },
      createdAt: new Date().toISOString(),
    });
  });
  return json({ id: holdId, active: false }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function publishEditorial(request: Request, env: Env, actor: { userId: string; role: string }, correlation: string): Promise<Response> {
  if (actor.role !== 'administrator') throw new Error('admin_role_required');
  const input = await readBoundedJson<{ title?: string; postId?: string }>(request);
  const title = input.title?.trim() ?? '';
  if (!title || title.length > 240) throw new Error('invalid_editorial_publication');
  const publicationId = uuidv7();
  await transaction(env.DB_ADMIN_FRESH, async (client) => {
    await client.query(
      `INSERT INTO editorial.publications (id, membership_user_id, title, post_id, published_at)
       VALUES ($1, $2, $3, $4, now())`, [publicationId, actor.userId, title, input.postId ?? null]);
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id)
       VALUES ($1, $2, 'editorial.publication_created', 'editorial_publication', $3, 'NEWS_BOARD_PUBLISH', $4)`,
      [uuidv7(), actor.userId, publicationId, correlation]);
  });
  return json({ id: publicationId, published: true }, { status: 201, headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

interface ModerationCaseRecord {
  content_type: string;
  content_id: string;
  policy_version: string;
  state: string;
  source_event_id: string;
}

interface ModerationContentRecord {
  subject_user_id: string | null;
  body: string | null;
  declared_creation_mode: string | null;
  post_id: string | null;
  parent_id: string | null;
  current_source_event_id: string | null;
  content_active: boolean;
}

function moderationState(outcome: 'allow' | 'block' | 'queue'): 'allowed' | 'blocked' | 'under_review' {
  return outcome === 'allow' ? 'allowed' : outcome === 'block' ? 'blocked' : 'under_review';
}

async function decideModeration(request: Request, env: Env, actor: { userId: string; role: string }, caseId: string, correlation: string): Promise<Response> {
  const input = await readBoundedJson<{ outcome?: 'allow' | 'block' | 'queue'; reasonCode?: string; publicLabel?: string }>(request);
  if (!input.outcome || !['allow', 'block', 'queue'].includes(input.outcome)) throw new Error('invalid_moderation_outcome');
  if (!input.reasonCode || !/^[A-Z0-9_.:-]{2,80}$/.test(input.reasonCode)) throw new Error('reason_code_required');
  const outcome = input.outcome;
  if (input.publicLabel !== undefined && !['Human-authored', 'AI-assisted', 'Under review'].includes(input.publicLabel)) {
    throw new Error('invalid_public_label');
  }
  const recorded = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const existing = await client.query<ModerationCaseRecord>(
      `SELECT content_type, content_id, policy_version, state, source_event_id
         FROM moderation.cases
        WHERE id = $1
        FOR UPDATE`,
      [caseId],
    );
    const caseRecord = existing.rows[0];
    if (!caseRecord) throw new Error('moderation_case_not_found');
    let contentResult;
    if (caseRecord.content_type === 'post') {
      contentResult = await client.query<ModerationContentRecord>(
        `SELECT author_id AS subject_user_id, body, declared_creation_mode,
                NULL::uuid AS post_id, NULL::uuid AS parent_id,
                moderation_source_event_id AS current_source_event_id,
                deleted_at IS NULL AS content_active
           FROM content.posts
          WHERE id = $1
          FOR UPDATE`,
        [caseRecord.content_id],
      );
    } else if (caseRecord.content_type === 'comment') {
      contentResult = await client.query<ModerationContentRecord>(
        `SELECT author_id AS subject_user_id, body, declared_creation_mode,
                post_id, parent_id,
                moderation_source_event_id AS current_source_event_id,
                deleted_at IS NULL AS content_active
           FROM content.comments
          WHERE id = $1
          FOR UPDATE`,
        [caseRecord.content_id],
      );
    } else if (caseRecord.content_type === 'profile') {
      contentResult = await client.query<ModerationContentRecord>(
        `SELECT users.id AS subject_user_id, NULL::text AS body,
                NULL::text AS declared_creation_mode,
                NULL::uuid AS post_id, NULL::uuid AS parent_id,
                profile.moderation_source_event_id AS current_source_event_id,
                users.status = 'active' AS content_active
           FROM social.profiles profile
           JOIN identity.users users ON users.id = profile.user_id
          WHERE profile.user_id = $1
          FOR UPDATE OF profile, users`,
        [caseRecord.content_id],
      );
    } else {
      throw new Error('moderation_case_superseded');
    }
    const contentRecord = contentResult.rows[0];
    assertActionableModerationCase({
      caseState: caseRecord.state,
      sourceEventId: caseRecord.source_event_id,
      currentSourceEventId: contentRecord?.current_source_event_id,
      contentActive: contentRecord?.content_active === true,
    });
    const moderationCase = { ...caseRecord, ...contentRecord } as ModerationCaseRecord & ModerationContentRecord;
    if (input.publicLabel !== undefined
      && (outcome !== 'allow' || !['post', 'comment'].includes(moderationCase.content_type))
      && input.publicLabel !== 'Under review') {
      throw new Error('invalid_public_label');
    }
    const publicLabel = outcome === 'allow' && (moderationCase.content_type === 'post' || moderationCase.content_type === 'comment')
      ? enforceAdminAllowPublication({
        body: moderationCase.body,
        declaredCreationMode: moderationCase.declared_creation_mode,
        publicLabel: input.publicLabel,
      }).publicLabel
      : 'Under review';
    const decisionId = uuidv7();
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version, decided_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [decisionId, caseId, outcome, publicLabel ?? null, moderationCase.policy_version, actor.userId],
    );
    const caseUpdate = await client.query(
      `UPDATE moderation.cases
          SET state = $1, resolved_at = CASE WHEN $1 = 'open' THEN NULL ELSE now() END
        WHERE id = $2 AND state = 'open' AND source_event_id = $3`,
      [outcome === 'queue' ? 'open' : 'resolved', caseId, moderationCase.source_event_id],
    );
    if (caseUpdate.rowCount !== 1) throw new Error('moderation_case_superseded');
    // Appeals remain open until the independently recorded review and adjudication policy resolves them.
    if (moderationCase.content_type === 'post') {
      const contentUpdate = await client.query(
        `UPDATE content.posts
            SET moderation_state = $1,
                published_at = CASE WHEN $1 = 'allowed' THEN COALESCE(published_at, now()) ELSE NULL END,
                updated_at = now()
          WHERE id = $2 AND moderation_source_event_id = $3 AND deleted_at IS NULL`,
        [moderationState(outcome), moderationCase.content_id, moderationCase.source_event_id],
      );
      if (contentUpdate.rowCount !== 1) throw new Error('moderation_case_superseded');
      if (publicLabel) {
        const declarationUpdate = await client.query(
          `UPDATE content.content_declarations
              SET public_label = $1, review_required = $2, updated_at = now()
            WHERE post_id = $3`,
          [publicLabel, outcome !== 'allow', moderationCase.content_id],
        );
        if (outcome === 'allow' && declarationUpdate.rowCount !== 1) {
          throw new Error('moderation_declaration_missing');
        }
      }
    } else if (moderationCase.content_type === 'comment') {
      const contentUpdate = await client.query(
        `UPDATE content.comments
            SET moderation_state = $1, updated_at = now()
          WHERE id = $2 AND moderation_source_event_id = $3 AND deleted_at IS NULL`,
        [moderationState(outcome), moderationCase.content_id, moderationCase.source_event_id],
      );
      if (contentUpdate.rowCount !== 1) throw new Error('moderation_case_superseded');
    } else if (moderationCase.content_type === 'profile') {
      const contentUpdate = await client.query(
        `UPDATE social.profiles
            SET moderation_state = $1, updated_at = now()
          WHERE user_id = $2 AND moderation_source_event_id = $3`,
        [moderationState(outcome), moderationCase.content_id, moderationCase.source_event_id],
      );
      if (contentUpdate.rowCount !== 1) throw new Error('moderation_case_superseded');
    }
    await client.query(
      `INSERT INTO moderation.enforcement_events (id, case_id, subject_id, action, reason_code, policy_version, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv7(), caseId, moderationCase.subject_user_id, outcome, input.reasonCode, moderationCase.policy_version, actor.userId],
    );
    if (moderationCase.subject_user_id) {
      await recordUserActivity(client, {
        id: uuidv7(),
        userId: moderationCase.subject_user_id,
        actorUserId: actor.userId,
        eventType: 'moderation.decision_applied',
        category: 'moderation',
        source: 'admin_api',
        sourceEventId: decisionId,
        correlationId: correlation,
        title: 'Moderation decision recorded',
        explanation: 'A moderation decision was recorded for your content.',
        result: 'succeeded',
        reasonCode: input.reasonCode,
        policyVersion: moderationCase.policy_version,
        objectType: 'moderation_case',
        objectId: caseId,
        reputationEffect: 'none',
        appealable: outcome !== 'queue',
        retentionClass: 'moderation',
        metadata: { decisionType: outcome },
        createdAt: new Date().toISOString(),
      });
    }
    if (moderationCase.subject_user_id && outcome !== 'queue') {
      const outcomeEventId = uuidv7();
      const eventType = outcome === 'allow'
        ? moderationCase.content_type === 'post' ? 'content.post.published' : 'content.comment.published'
        : 'moderation.content.blocked';
      await client.query(
        `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [outcomeEventId, eventType, moderationCase.content_type, moderationCase.content_id, actor.userId,
          JSON.stringify({
            contentType: moderationCase.content_type,
            contentId: moderationCase.content_id,
            authorId: moderationCase.subject_user_id,
            postId: moderationCase.post_id,
            parentId: moderationCase.parent_id,
            declaredCreationMode: moderationCase.declared_creation_mode,
            reasonCode: input.reasonCode,
          })],
      );
      if (outcome === 'allow' && (moderationCase.content_type === 'post' || moderationCase.content_type === 'comment')) {
        await recordUserActivity(client, {
          id: uuidv7(), userId: moderationCase.subject_user_id, actorUserId: actor.userId,
          eventType: moderationCase.content_type === 'post'
            ? 'content.post_published'
            : moderationCase.parent_id ? 'content.reply_published' : 'content.comment_published',
          category: 'content', source: 'admin_api', sourceEventId: outcomeEventId,
          correlationId: correlation,
          title: moderationCase.content_type === 'post'
            ? 'Your post was published'
            : moderationCase.parent_id ? 'Your reply was published' : 'Your comment was published',
          explanation: 'The contribution passed publication review and is now available on its permitted surfaces.',
          result: 'succeeded', policyVersion: moderationCase.policy_version,
          objectType: moderationCase.content_type, objectId: moderationCase.content_id,
          reputationEffect: moderationCase.declared_creation_mode === 'human' ? 'positive' : 'none',
          appealable: false, retentionClass: 'ordinary',
          metadata: { contentType: moderationCase.parent_id ? 'reply' : moderationCase.content_type, creationMode: moderationCase.declared_creation_mode ?? 'human', moderationState: 'allowed' },
          createdAt: new Date().toISOString(),
        });
      }
    }
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'moderation.decision', 'moderation_case', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, caseId, input.reasonCode, correlation, JSON.stringify({ outcome, role: actor.role, decisionId })],
    );
    return { publicLabel };
  });
  return json({ caseId, outcome, publicLabel: recorded.publicLabel }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

interface AppealCaseRecord extends ModerationCaseRecord {
  appeal_id: string;
  appeal_state: string;
  appellant_id: string;
  risk_class: string;
  appeal_policy_version: string;
  subject_user_id: string | null;
  current_source_event_id: string | null;
  content_active: boolean;
}

async function adjudicateAppeal(request: Request, env: Env, actor: { userId: string; role: string }, appealId: string, correlation: string): Promise<Response> {
  if (actor.role !== 'editorial') throw new Error('appeal_adjudicator_required');
  const input = parseAppealAdjudicationRequest(await readBoundedJson<{ decision?: unknown; reasonCode?: unknown }>(request));

  const outcome = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const appealResult = await client.query<AppealCaseRecord>(
      `SELECT a.id AS appeal_id, a.state AS appeal_state, a.appellant_id, a.risk_class,
              a.policy_version AS appeal_policy_version, c.content_type, c.content_id, c.policy_version,
              c.state, c.source_event_id,
              CASE c.content_type
                WHEN 'post' THEN p.author_id
                WHEN 'comment' THEN cm.author_id
                WHEN 'profile' THEN c.content_id
                ELSE NULL
              END AS subject_user_id,
              CASE c.content_type
                WHEN 'post' THEN p.moderation_source_event_id
                WHEN 'comment' THEN cm.moderation_source_event_id
                WHEN 'profile' THEN profile.moderation_source_event_id
                ELSE NULL
              END AS current_source_event_id,
              CASE c.content_type
                WHEN 'post' THEN p.id IS NOT NULL AND p.deleted_at IS NULL
                WHEN 'comment' THEN cm.id IS NOT NULL AND cm.deleted_at IS NULL
                WHEN 'profile' THEN profile.user_id IS NOT NULL AND profile_user.status = 'active'
                ELSE false
              END AS content_active
         FROM moderation.appeals a
         JOIN moderation.cases c ON c.id = a.case_id
         LEFT JOIN content.posts p ON c.content_type = 'post' AND p.id = c.content_id
         LEFT JOIN content.comments cm ON c.content_type = 'comment' AND cm.id = c.content_id
         LEFT JOIN social.profiles profile ON c.content_type = 'profile' AND profile.user_id = c.content_id
         LEFT JOIN identity.users profile_user ON profile_user.id = profile.user_id
        WHERE a.id = $1
        FOR UPDATE OF a`,
      [appealId],
    );
    const appeal = appealResult.rows[0];
    if (!appeal) throw new Error('appeal_not_found');
    if (appeal.appeal_state !== 'open') throw new Error('appeal_already_resolved');
    if (appeal.appeal_policy_version !== APPEAL_POLICY.version) throw new Error('appeal_policy_version_unsupported');
    if (!appeal.subject_user_id) throw new Error('appeal_subject_not_found');
    if (appeal.appellant_id === actor.userId || appeal.subject_user_id === actor.userId) throw new Error('appeal_adjudicator_conflict');
    const qualification = await client.query<{ user_id: string }>(
      `SELECT user_id FROM moderation.reviewer_qualifications WHERE user_id = $1 AND state = 'trained'`,
      [actor.userId],
    );
    if (qualification.rowCount !== 1) throw new Error('appeal_adjudicator_training_required');
    const reviewerConflict = await client.query(
      `SELECT 1 FROM moderation.appeal_assignments
        WHERE appeal_id = $1 AND reviewer_id = $2 AND state NOT IN ('recused', 'replaced', 'expired')`,
      [appealId, actor.userId],
    );
    if (reviewerConflict.rowCount !== 0) throw new Error('appeal_adjudicator_conflict');

    const adjudicationId = uuidv7();
    const submitted = await client.query<{ id: string; decision: string }>(
      `INSERT INTO moderation.appeal_adjudications
         (id, appeal_id, adjudicator_id, adjudicator_role, trained_snapshot, decision, reason_code, policy_version)
       VALUES ($1, $2, $3, 'editorial', true, $4, $5, $6)
       ON CONFLICT (appeal_id, adjudicator_id) DO NOTHING
       RETURNING id, decision`,
      [adjudicationId, appealId, actor.userId, input.decision, input.reasonCode, APPEAL_POLICY.version],
    );
    const storedAdjudication = submitted.rows[0] ?? (await client.query<{ id: string; decision: string }>(
      `SELECT id, decision FROM moderation.appeal_adjudications WHERE appeal_id = $1 AND adjudicator_id = $2`,
      [appealId, actor.userId],
    )).rows[0];
    if (!storedAdjudication) throw new Error('appeal_adjudication_not_recorded');
    if (storedAdjudication.decision !== input.decision) throw new Error('appeal_adjudication_locked');

    const [voteResult, adjudicationResult, existingOutcome] = await Promise.all([
      client.query<AppealVoteRecord>(
        `SELECT v.reviewer_id, v.decision, v.qualification_snapshot, v.level_snapshot,
                v.vote_weight_snapshot, a.state AS assignment_state, a.conflict_checked,
                qualification.state AS current_qualification_state
           FROM moderation.appeal_review_votes v
           JOIN moderation.appeal_assignments a ON a.id = v.assignment_id
           LEFT JOIN moderation.reviewer_qualifications qualification ON qualification.user_id = v.reviewer_id
          WHERE v.appeal_id = $1 AND a.appeal_id = $1`,
        [appealId],
      ),
      client.query<AppealAdjudicationRecord>(
        `SELECT adjudicator_id, adjudicator_role, trained_snapshot, decision
           FROM moderation.appeal_adjudications WHERE appeal_id = $1`,
        [appealId],
      ),
      client.query<{ state: string }>(`SELECT state FROM moderation.appeal_outcomes WHERE appeal_id = $1 FOR UPDATE`, [appealId]),
    ]);
    if (existingOutcome.rows[0]?.state === 'resolved') throw new Error('appeal_already_resolved');
    const { riskClass, evaluation } = evaluateAppealFromRecords({
      riskClass: appeal.risk_class,
      votes: voteResult.rows,
      adjudications: adjudicationResult.rows,
    });
    const outcomePlan = appealOutcomeAuditPlan(evaluation);
    await client.query(
      `INSERT INTO moderation.appeal_outcomes
         (appeal_id, risk_class, reviewer_panel_decision, final_decision, completed_reviewers, total_weight,
          overturn_weight, uphold_weight, winning_share, required_adjudicators, state, policy_version,
          evaluated_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(),
               CASE WHEN $11 = 'resolved' THEN now() ELSE NULL END)
       ON CONFLICT (appeal_id) DO UPDATE SET
         risk_class = EXCLUDED.risk_class,
         reviewer_panel_decision = EXCLUDED.reviewer_panel_decision,
         final_decision = EXCLUDED.final_decision,
         completed_reviewers = EXCLUDED.completed_reviewers,
         total_weight = EXCLUDED.total_weight,
         overturn_weight = EXCLUDED.overturn_weight,
         uphold_weight = EXCLUDED.uphold_weight,
         winning_share = EXCLUDED.winning_share,
         required_adjudicators = EXCLUDED.required_adjudicators,
         state = EXCLUDED.state,
         policy_version = EXCLUDED.policy_version,
         evaluated_at = EXCLUDED.evaluated_at,
         resolved_at = EXCLUDED.resolved_at`,
      [
        appealId, riskClass, evaluation.reviewerPanelDecision, evaluation.finalDecision,
        evaluation.completedReviewers, evaluation.totalWeight, evaluation.overturnWeight, evaluation.upholdWeight,
        evaluation.winningShare, evaluation.requiredAdjudicators, evaluation.status, evaluation.policyVersion,
      ],
    );

    await recordUserActivity(client, {
      id: uuidv7(),
      userId: appeal.appellant_id,
      actorUserId: actor.userId,
      eventType: 'appeals.adjudicator_result_recorded',
      category: 'appeals',
      source: 'admin_api',
      sourceEventId: storedAdjudication.id,
      correlationId: correlation,
      title: 'Appeal adjudication recorded',
      explanation: 'A trained editorial adjudicator recorded an appeal result.',
      result: outcomePlan.adjudicationActivityResult,
      reasonCode: input.reasonCode,
      policyVersion: evaluation.policyVersion,
      objectType: 'appeal',
      objectId: appealId,
      reputationEffect: 'none',
      appealable: false,
      retentionClass: 'moderation',
      metadata: { appealState: outcomePlan.outcomeState, riskClass, outcome: input.decision },
      createdAt: new Date().toISOString(),
    });
    if (outcomePlan.reviewerPanelDecision) {
      await recordUserActivity(client, {
        id: uuidv7(),
        userId: appeal.appellant_id,
        actorUserId: actor.userId,
        eventType: 'appeals.reviewer_panel_result_reached',
        category: 'appeals',
        source: 'admin_api',
        sourceEventId: appealId,
        correlationId: correlation,
        title: 'Appeal reviewer panel completed',
        explanation: 'The independently assigned reviewer quorum reached a policy result.',
        result: outcomePlan.adjudicationActivityResult,
        policyVersion: evaluation.policyVersion,
        objectType: 'appeal',
        objectId: appealId,
        reputationEffect: 'none',
        appealable: false,
        retentionClass: 'moderation',
        metadata: { appealState: outcomePlan.outcomeState, riskClass, outcome: outcomePlan.reviewerPanelDecision },
        createdAt: new Date().toISOString(),
      });
    }

    if (outcomePlan.resolution) {
      const resolution = outcomePlan.resolution;
      const resolved = await client.query(
        `UPDATE moderation.appeals
            SET state = 'resolved', resolved_at = COALESCE(resolved_at, now()),
                reviewer_panel_result_at = COALESCE(reviewer_panel_result_at, now()), adjudicated_at = now()
          WHERE id = $1 AND state = 'open'`,
        [appealId],
      );
      if (resolved.rowCount !== 1) throw new Error('appeal_already_resolved');
      let contentReversed = false;
      if (resolution.reverseContent
        && appeal.content_active
        && appeal.source_event_id === appeal.current_source_event_id) {
        let contentUpdate;
        if (appeal.content_type === 'post') {
          contentUpdate = await client.query(
            `UPDATE content.posts
                SET moderation_state = 'allowed', published_at = COALESCE(published_at, now()), updated_at = now()
              WHERE id = $1 AND moderation_source_event_id = $2 AND deleted_at IS NULL`,
            [appeal.content_id, appeal.source_event_id],
          );
        } else if (appeal.content_type === 'comment') {
          contentUpdate = await client.query(
            `UPDATE content.comments
                SET moderation_state = 'allowed', updated_at = now()
              WHERE id = $1 AND moderation_source_event_id = $2 AND deleted_at IS NULL`,
            [appeal.content_id, appeal.source_event_id],
          );
        } else if (appeal.content_type === 'profile') {
          contentUpdate = await client.query(
            `UPDATE social.profiles
                SET moderation_state = 'allowed', updated_at = now()
              WHERE user_id = $1 AND moderation_source_event_id = $2`,
            [appeal.content_id, appeal.source_event_id],
          );
        }
        contentReversed = contentUpdate?.rowCount === 1;
      }
      if (contentReversed) {
        await client.query(
          `INSERT INTO moderation.appeal_outcome_effects
             (id, appeal_id, effect_type, target_type, target_id, source_event_id)
           VALUES ($1, $2, 'content_reversal', $3, $4, $2)
           ON CONFLICT (appeal_id, effect_type, target_type, target_id) DO NOTHING`,
          [uuidv7(), appealId, appeal.content_type, appeal.content_id],
        );
      }
      await client.query(
        `UPDATE trust.provenance_events
            SET appeal_state = 'resolved', final_decision = $1
          WHERE content_id = $2 AND source_event_id = $3`,
        [resolution.finalDecision, appeal.content_id, appeal.source_event_id],
      );
      await client.query(
        `INSERT INTO moderation.enforcement_events (id, case_id, subject_id, action, reason_code, policy_version, actor_id)
         SELECT $1, a.case_id, $2, $3, $4, $5, $6 FROM moderation.appeals a WHERE a.id = $7`,
        [uuidv7(), appeal.subject_user_id, resolution.enforcementAction, input.reasonCode, evaluation.policyVersion, actor.userId, appealId],
      );
      const finalActivity = await recordUserActivity(client, {
        id: uuidv7(),
        userId: appeal.appellant_id,
        actorUserId: actor.userId,
        eventType: resolution.finalActivity.eventType,
        category: 'appeals',
        source: 'admin_api',
        sourceEventId: appealId,
        correlationId: correlation,
        title: resolution.finalActivity.title,
        explanation: resolution.finalActivity.explanation,
        result: resolution.finalActivity.result,
        reasonCode: input.reasonCode,
        policyVersion: evaluation.policyVersion,
        objectType: 'appeal',
        objectId: appealId,
        reputationEffect: 'none',
        appealable: false,
        retentionClass: 'moderation',
        metadata: { appealState: outcomePlan.outcomeState, riskClass, outcome: resolution.finalDecision },
        createdAt: new Date().toISOString(),
      });
      await client.query(
        `INSERT INTO moderation.appeal_outcome_effects
           (id, appeal_id, effect_type, target_type, target_id, source_event_id)
         VALUES ($1, $2, 'activity_event', 'user_activity_event', $3, $2)
         ON CONFLICT (appeal_id, effect_type, target_type, target_id) DO NOTHING`,
        [uuidv7(), appealId, finalActivity.id],
      );
      await client.query(
        `INSERT INTO moderation.appeal_outcome_effects
           (id, appeal_id, effect_type, target_type, target_id, source_event_id)
         VALUES ($1, $2, 'notification', 'appeal', $2, $2)
         ON CONFLICT (appeal_id, effect_type, target_type, target_id) DO NOTHING`,
        [uuidv7(), appealId],
      );
      await client.query(
        `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
         VALUES ($1, $2, $3, 'appeal', $4, $5, $6, $7::jsonb)`,
        [uuidv7(), actor.userId, resolution.auditAction, appealId, input.reasonCode, correlation, JSON.stringify({ outcome: resolution.finalDecision, riskClass, policyVersion: evaluation.policyVersion, contentReversed })],
      );
      await client.query(
        `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
         VALUES ($1, $2, 'appeal', $3, $4, $5::jsonb)`,
        [uuidv7(), resolution.outboxEventType, appealId, actor.userId, JSON.stringify({
          appealId,
          subjectUserId: appeal.subject_user_id,
          contentId: appeal.content_id,
          contentType: appeal.content_type,
          finalDecision: resolution.finalDecision,
          riskClass,
        })],
      );
    }
    return evaluation;
  });
  return json({ appealId, ...outcome }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function listPendingAppealAdjudications(
  env: Env,
  actor: { userId: string; role: string },
): Promise<Response> {
  if (!['editorial', 'administrator', 'owner'].includes(actor.role)) throw new Error('appeal_adjudicator_required');
  const result = await query(env.DB_ADMIN_FRESH,
    `SELECT appeal.id AS appeal_id, appeal.case_id, appeal.risk_class, appeal.policy_version,
            appeal.created_at, appeal.expires_at, outcome.reviewer_panel_decision,
            outcome.completed_reviewers, outcome.total_weight, outcome.winning_share,
            outcome.required_adjudicators, outcome.state AS outcome_state,
            count(adjudication.id)::integer AS completed_adjudicators
       FROM moderation.appeals appeal
       JOIN moderation.appeal_outcomes outcome ON outcome.appeal_id = appeal.id
       LEFT JOIN moderation.appeal_adjudications adjudication ON adjudication.appeal_id = appeal.id
      WHERE appeal.state = 'open'
        AND outcome.state IN ('pending_adjudication', 'adjudication_disagreement')
        AND appeal.appellant_id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM moderation.appeal_assignments assignment
           WHERE assignment.appeal_id = appeal.id AND assignment.reviewer_id = $1
             AND assignment.state NOT IN ('recused', 'replaced', 'expired')
        )
      GROUP BY appeal.id, appeal.case_id, appeal.risk_class, appeal.policy_version,
               appeal.created_at, appeal.expires_at, outcome.reviewer_panel_decision,
               outcome.completed_reviewers, outcome.total_weight, outcome.winning_share,
               outcome.required_adjudicators, outcome.state
      ORDER BY appeal.created_at
      LIMIT 100`,
    [actor.userId],
  );
  return json({ items: result.rows }, { headers: { 'cache-control': 'private, no-store' } });
}

async function updateReviewerQualification(
  request: Request,
  env: Env,
  actor: { userId: string; role: string },
  reviewerId: string,
  correlation: string,
): Promise<Response> {
  if (!['administrator', 'owner'].includes(actor.role)) throw new Error('admin_role_required');
  const input = await readBoundedJson<{ state?: 'none' | 'eligible' | 'trained' | 'suspended'; reasonCode?: string }>(request);
  if (!input.state || !['none', 'eligible', 'trained', 'suspended'].includes(input.state)) {
    throw new Error('reviewer_qualification_state_invalid');
  }
  if (!input.reasonCode || !/^[A-Z0-9_.:-]{2,80}$/.test(input.reasonCode)) throw new Error('reason_code_required');
  const sourceEventId = uuidv7();
  await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const user = await client.query<{ id: string }>(
      `SELECT id FROM identity.users WHERE id = $1 AND status <> 'deleted' FOR UPDATE`,
      [reviewerId],
    );
    if (!user.rows[0]) throw new Error('user_not_found');
    await client.query(
      `INSERT INTO moderation.reviewer_qualifications
         (user_id, state, policy_version, trained_at, suspended_at, reason_code)
       VALUES ($1, $2, $3,
         CASE WHEN $2 = 'trained' THEN now() ELSE NULL END,
         CASE WHEN $2 = 'suspended' THEN now() ELSE NULL END,
         $4)
       ON CONFLICT (user_id) DO UPDATE SET
         state = EXCLUDED.state,
         policy_version = EXCLUDED.policy_version,
         trained_at = CASE
           WHEN EXCLUDED.state = 'trained' THEN COALESCE(moderation.reviewer_qualifications.trained_at, now())
           ELSE NULL
         END,
         suspended_at = CASE WHEN EXCLUDED.state = 'suspended' THEN now() ELSE NULL END,
         reason_code = EXCLUDED.reason_code,
         updated_at = now()`,
      [reviewerId, input.state, APPEAL_POLICY.version, input.reasonCode],
    );
    await recordUserActivity(client, {
      id: uuidv7(),
      userId: reviewerId,
      actorUserId: actor.userId,
      eventType: 'reputation.reviewer_eligibility_changed',
      category: 'reputation',
      source: 'admin_api',
      sourceEventId,
      correlationId: correlation,
      title: 'Appeal reviewer eligibility changed',
      explanation: input.state === 'trained'
        ? 'You are now recorded as trained and eligible for independent appeal assignment when all conflict checks pass.'
        : 'Your appeal reviewer qualification state changed. Reputation level alone never grants reviewer training.',
      result: 'succeeded',
      reasonCode: input.reasonCode,
      policyVersion: APPEAL_POLICY.version,
      objectType: 'reviewer_qualification',
      objectId: reviewerId,
      reputationEffect: 'none',
      appealable: input.state === 'suspended',
      retentionClass: 'moderation',
      metadata: { pillar: 'reviewReliability', explanationCode: `reviewer_qualification_${input.state}` },
      createdAt: new Date().toISOString(),
    });
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'moderation.reviewer.qualification_changed', 'user', $2, $3, $4::jsonb)`,
      [sourceEventId, reviewerId, actor.userId, JSON.stringify({ reviewerId, state: input.state })],
    );
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'moderation.reviewer.qualification_changed', 'user', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, reviewerId, input.reasonCode, correlation, JSON.stringify({ state: input.state, policyVersion: APPEAL_POLICY.version })],
    );
  });
  return json({ reviewerId, state: input.state, policyVersion: APPEAL_POLICY.version }, {
    headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' },
  });
}

async function updateAccountStatus(request: Request, env: Env, actor: { userId: string; role: string }, targetUserId: string, correlation: string): Promise<Response> {
  if (!['administrator', 'owner'].includes(actor.role)) throw new Error('admin_role_required');
  const targetId = parseAdminUserId(targetUserId);
  const input = rejectUnknownFields(await readBoundedJson(request), ['status', 'reasonCode', 'confirmation']);
  if (typeof input.status !== 'string' || !['active', 'suspended', 'locked'].includes(input.status)) throw new Error('invalid_account_status');
  const requestedStatus = input.status as 'active' | 'suspended' | 'locked';
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, requestedStatus === 'active' ? 'REACTIVATE ACCOUNT' : requestedStatus === 'suspended' ? 'SUSPEND ACCOUNT' : 'LOCK ACCOUNT');
  const sourceEventId = uuidv7();
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE identity.users SET status = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2 AND status <> 'deleted' RETURNING id`,
      [requestedStatus, targetId]
    );
    if (updated.rowCount !== 1) throw new Error('user_not_found');
    await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetId]);
    await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetId]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, actor_id, event_type, metadata) VALUES ($1, $2, $3, 'account_status_changed', $4::jsonb)`, [uuidv7(), targetId, actor.userId, JSON.stringify({ status: requestedStatus, reasonCode })]);
    await recordUserActivity(client, {
      id: uuidv7(), userId: targetId, actorUserId: actor.userId,
      eventType: requestedStatus === 'active' ? 'moderation.decision_reversed' : requestedStatus === 'suspended' ? 'moderation.suspension_applied' : 'moderation.feature_restricted',
      category: 'moderation', source: 'admin_api', sourceEventId,
      correlationId: correlation,
      title: requestedStatus === 'active' ? 'Account restriction cleared' : requestedStatus === 'suspended' ? 'Account suspended' : 'Account locked',
      explanation: requestedStatus === 'active'
        ? 'The previous account restriction was cleared by an authorised administrator.'
        : 'An authorised administrator changed your account access state under the recorded policy reason.',
      result: requestedStatus === 'active' ? 'reversed' : 'succeeded', reasonCode,
      policyVersion: APPEAL_POLICY.version, objectType: 'user', objectId: targetId,
      reputationEffect: requestedStatus === 'active' ? 'none' : 'withheld', appealable: requestedStatus !== 'active',
      retentionClass: 'moderation', metadata: { restrictionType: requestedStatus, durationBand: 'until_reviewed' },
      createdAt: new Date().toISOString(),
    });
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'identity.account.status_changed', 'user', $2, $3, $4::jsonb)`,
      [sourceEventId, targetId, actor.userId, JSON.stringify({ userId: targetId, status: requestedStatus })],
    );
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'account.status_changed', 'user', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, targetId, reasonCode, correlation, JSON.stringify({ status: input.status })]
    );
    return updated.rows[0].id;
  });
  return json({ userId: result, status: requestedStatus }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = correlationId(request);
    const cors = (response: Response) => withAdminCors(request, env.CORS_ALLOWED_ORIGINS, response);
    try {
      assertExpectedHostname(request, env.EXPECTED_HOSTNAMES);
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return adminCorsPreflight(request, env.CORS_ALLOWED_ORIGINS);
      if (request.method === 'GET' && url.pathname === '/health') return cors(json({ status: 'ok', service: 'lythaus-admin-api' }));
      if (request.method === 'GET' && url.pathname === '/internal/readiness/database-identity') {
        if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
        const [admin, privacy] = await Promise.all([
          inspectDatabaseIdentity(env.DB_ADMIN_FRESH, databaseExpectationsFromEnv(env)),
          inspectDatabaseIdentity(env.DB_PRIVACY_FRESH, databaseExpectationsFromEnv(env)),
        ]);
        const readiness = admin.readiness === 'pass' && privacy.readiness === 'pass' ? 'pass' : 'fail';
        return cors(json({
          service: 'lythaus-admin-api',
          workerVersionId: env.WORKER_VERSION.id,
          releaseTag: env.WORKER_VERSION.tag,
          databases: {
            admin: databaseReadinessResponse(admin, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
            privacy: databaseReadinessResponse(privacy, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
          },
          branchFingerprint: 'unknown',
          readiness,
          readyForAuthentication: env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true' && readiness === 'pass' && admin.budgetLedgerApplied && privacy.budgetLedgerApplied,
        }, { headers: { 'cache-control': 'private, no-store' } }));
      }
      const actor = await requireAdmin(request, env);
      await enforceAdminRateLimit(request, env, actor.userId);
      const keeperEnv = env as KeeperEnv;
      if (request.method === 'GET' && url.pathname === '/api/admin/auth/summary') return cors(await getAdminAuthSummary(request, keeperEnv, actor, id));
      if (request.method === 'GET' && url.pathname === '/api/admin/email-health') return cors(await getAdminEmailHealth(request, keeperEnv, actor, id));
      if (request.method === 'GET' && url.pathname === '/api/admin/health') {
        const result = await query(env.DB_ADMIN_FRESH, `SELECT current_timestamp AS database_time`);
        return cors(json({ status: 'ok', database: result.rows[0] }, { headers: { 'x-correlation-id': id, 'cache-control': 'private, no-store' } }));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/privacy/requests') {
        const result = await query(env.DB_PRIVACY_FRESH, `SELECT id, subject_id, request_type, state, created_at FROM privacy.requests ORDER BY created_at DESC LIMIT 100`);
        return cors(json({ items: result.rows }, { headers: { 'x-correlation-id': id, 'cache-control': 'private, no-store' } }));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/moderation/cases') {
        return cors(json({ items: await listModerationCases(env) }, { headers: { 'x-correlation-id': id, 'cache-control': 'private, no-store' } }));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
        const result = await query(env.DB_ADMIN_FRESH,
          `SELECT id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata, created_at
           FROM system.audit_events ORDER BY created_at DESC LIMIT 200`);
        return cors(json({ items: result.rows }, { headers: { 'x-correlation-id': id, 'cache-control': 'private, no-store' } }));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/waitlist') return cors(await listWaitlist(request, env, actor, id));
      if (request.method === 'POST' && url.pathname === '/api/admin/waitlist') {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await createWaitlistEntry(request, keeperEnv, actor, id));
      }
      const waitlistEntry = url.pathname.match(/^\/api\/admin\/waitlist\/([^/]+)$/);
      if (request.method === 'PATCH' && waitlistEntry) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await updateAdminWaitlistEntry(request, keeperEnv, actor, waitlistEntry[1], id));
      }
      if (request.method === 'DELETE' && waitlistEntry) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await deleteWaitlistEntry(request, keeperEnv, actor, waitlistEntry[1], id));
      }
      const waitlistStatus = url.pathname.match(/^\/api\/admin\/waitlist\/([^/]+)\/status$/);
      if (request.method === 'POST' && waitlistStatus) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await updateWaitlistStatus(request, env, actor, waitlistStatus[1], id));
      }
      const waitlistRetentionHold = url.pathname.match(/^\/api\/admin\/waitlist\/([^/]+)\/retention-hold$/);
      if (request.method === 'POST' && waitlistRetentionHold) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await updateWaitlistRetentionHold(request, env, actor, waitlistRetentionHold[1], id));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/users/search') return cors(await searchUsers(request, env));
      if (request.method === 'GET' && url.pathname === '/api/admin/users') return cors(await listAdminUsers(request, keeperEnv, actor, id));
      if (request.method === 'POST' && url.pathname === '/api/admin/users') {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await inviteAdminUser(request, keeperEnv, actor, id));
      }
      const adminUser = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (adminUser && request.method === 'GET') return cors(await getAdminUser(request, keeperEnv, actor, adminUser[1], id));
      if (adminUser && request.method === 'PATCH') {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await patchAdminUser(request, keeperEnv, actor, adminUser[1], id));
      }
      const resendVerification = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/resend-verification$/);
      if (request.method === 'POST' && resendVerification) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await resendAdminVerification(request, keeperEnv, actor, resendVerification[1], id));
      }
      const revokeSessions = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/revoke-sessions$/);
      if (request.method === 'POST' && revokeSessions) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await revokeAdminUserSessions(request, keeperEnv, actor, revokeSessions[1], id));
      }
      const deleteUser = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (request.method === 'DELETE' && deleteUser) {
        assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
        return cors(await deleteAdminUser(request, keeperEnv, actor, deleteUser[1], id));
      }
      if (url.pathname === '/api/admin/privacy/legal-holds' && ['GET', 'POST'].includes(request.method)) return cors(await legalHolds(request, env, actor, id));
      const legalHoldClear = url.pathname.match(/^\/api\/admin\/privacy\/legal-holds\/([^/]+)\/clear$/);
      if (request.method === 'POST' && legalHoldClear) return cors(await clearLegalHold(env, actor, legalHoldClear[1], id));
      if (request.method === 'POST' && url.pathname === '/api/admin/editorial/publications') return cors(await publishEditorial(request, env, actor, id));
      const moderation = url.pathname.match(/^\/api\/admin\/moderation\/cases\/([^/]+)\/decision$/);
      if (request.method === 'POST' && moderation) return cors(await decideModeration(request, env, actor, moderation[1], id));
      const appealAdjudication = url.pathname.match(/^\/api\/admin\/appeals\/([^/]+)\/adjudications$/);
      if (request.method === 'POST' && appealAdjudication) return cors(await adjudicateAppeal(request, env, actor, appealAdjudication[1], id));
      if (request.method === 'GET' && url.pathname === '/api/admin/appeals/pending-adjudication') {
        return cors(await listPendingAppealAdjudications(env, actor));
      }
      const reviewerQualification = url.pathname.match(/^\/api\/admin\/reviewers\/([^/]+)\/qualification$/);
      if ((request.method === 'PUT' || request.method === 'POST') && reviewerQualification) {
        return cors(await updateReviewerQualification(request, env, actor, reviewerQualification[1], id));
      }
      const accountStatus = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
      if (request.method === 'POST' && accountStatus) return cors(await updateAccountStatus(request, env, actor, accountStatus[1], id));
      const accountTier = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/tier$/);
      if (request.method === 'POST' && accountTier) return cors(await setUserTier(request, env, actor, accountTier[1], id));
      return cors(json({ error: 'not_found', correlationId: id }, { status: 404 }));
    } catch (error) {
      const classified = adminError(error);
      logEvent({
        service: 'lythaus-admin-api',
        correlationId: id,
        errorCode: classified.exposedCode,
        internalErrorCode: classified.internalCode,
        route: new URL(request.url).pathname,
      });
      return cors(json(
        { error: classified.exposedCode, correlationId: id },
        { status: classified.status, headers: { 'cache-control': 'private, no-store', 'x-correlation-id': id } },
      ));
    }
  },
};
