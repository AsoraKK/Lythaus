import { transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { ACCOUNT_SUPPORT_HISTORY_NOTICE, ACCOUNT_SUPPORT_SOURCES, accountSupportSnapshot, safeSupportCode, supportTimestamp, supportUuid, type AccountSupportSource } from '@lythaus/contracts';
import { json } from '@lythaus/observability';
import { uuidv7 } from '@lythaus/security';
import type { AdminActor } from './admin-access-runtime-policy.ts';
import { assertAdminMutationRequest } from './admin-cors-policy.ts';
import { parseAdminUserId, parseDisplayName, parseReasonCode, rejectUnknownFields, requireConfirmation } from './admin-runtime-policy.ts';
import { readBoundedJson } from './request-body-policy.ts';

interface SupportEnv extends EnvBindings { DB_ADMIN_FRESH: HyperdriveBinding }
interface HistoryFilters {
  source: AccountSupportSource | null;
  eventType: string | null;
  correlationId: string | null;
  since: string | null;
  until: string | null;
  order: 'newest' | 'oldest';
}
interface HistoryCursor { scope: string; snapshotAt: string; createdAt: string; id: string; source: AccountSupportSource }
interface MemberProfileRecord {
  display_name: string;
  bio: string;
  user_updated_at: string;
  profile_updated_at: string | null;
}

async function requireOwner(client: DatabaseClient, actor: AdminActor): Promise<void> {
  const member = await client.query(`SELECT a.user_id FROM identity.admin_memberships a JOIN identity.users u ON u.id = a.user_id
    WHERE a.user_id = $1 AND a.role = 'owner' AND a.active = true AND u.status = 'active'`, [actor.userId]);
  if (member.rowCount !== 1) throw new Error('account_support_owner_required');
}

async function profileCorrectionsAvailable(client: DatabaseClient): Promise<boolean> {
  const capability = await client.query<{ available: boolean }>(`SELECT CASE
      WHEN has_schema_privilege(current_user, 'social', 'USAGE') THEN
        has_table_privilege(current_user, 'identity.users', 'SELECT')
        AND has_table_privilege(current_user, 'identity.users', 'UPDATE')
        AND has_table_privilege(current_user, 'social.profiles', 'SELECT')
        AND has_table_privilege(current_user, 'social.profiles', 'INSERT')
        AND has_table_privilege(current_user, 'social.profiles', 'UPDATE')
        AND has_table_privilege(current_user, 'system.outbox_events', 'INSERT')
        AND has_table_privilege(current_user, 'system.audit_events', 'INSERT')
      ELSE false
    END AS available`);
  return capability.rows[0]?.available === true;
}

function historyRequest(input: unknown, userId: string): { filters: HistoryFilters; limit: number; cursor: HistoryCursor | null; reasonCode: string; scope: string } {
  const body = rejectUnknownFields(input, ['reasonCode', 'source', 'eventType', 'correlationId', 'since', 'until', 'order', 'limit', 'cursor']);
  const optionalCode = (value: unknown, maximum: number): string | null => {
    if (value === undefined || value === null || value === '') return null;
    const code = safeSupportCode(value, maximum);
    if (!code) throw new Error('account_support_invalid_filter');
    return code;
  };
  const source = optionalCode(body.source, 10) as AccountSupportSource | null;
  if (source && !ACCOUNT_SUPPORT_SOURCES.includes(source)) throw new Error('account_support_invalid_filter');
  const order = body.order ?? 'newest';
  if (order !== 'newest' && order !== 'oldest') throw new Error('account_support_invalid_filter');
  const time = (value: unknown): string | null => value === undefined || value === null || value === '' ? null : supportTimestamp(value);
  const filters: HistoryFilters = { source, eventType: optionalCode(body.eventType, 100), correlationId: optionalCode(body.correlationId, 128), since: time(body.since), until: time(body.until), order };
  if (filters.since && filters.until && filters.since >= filters.until) throw new Error('invalid_date_filter');
  const limit = body.limit ?? 25;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('invalid_page_limit');
  const scope = JSON.stringify({ userId, ...filters });
  let cursor: HistoryCursor | null = null;
  if (body.cursor !== undefined && body.cursor !== null) {
    try {
      if (typeof body.cursor !== 'string' || body.cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(body.cursor)) throw new Error('invalid_cursor');
      const decoded = JSON.parse(atob(body.cursor.replaceAll('-', '+').replaceAll('_', '/'))) as HistoryCursor;
      if (decoded.scope !== scope || !supportUuid(decoded.id) || !ACCOUNT_SUPPORT_SOURCES.includes(decoded.source)) throw new Error('invalid_cursor');
      cursor = { scope, snapshotAt: supportTimestamp(decoded.snapshotAt), createdAt: supportTimestamp(decoded.createdAt), id: decoded.id, source: decoded.source };
    } catch { throw new Error('invalid_cursor'); }
  }
  return { filters, limit, cursor, reasonCode: parseReasonCode(body.reasonCode), scope };
}

function profileReadRequest(input: unknown): string {
  const body = rejectUnknownFields(input, ['reasonCode']);
  return parseReasonCode(body.reasonCode);
}

function profileUpdateRequest(input: unknown): {
  displayName?: string;
  bio?: string;
  expectedUserUpdatedAt: string;
  expectedProfileUpdatedAt: string | null;
  reasonCode: string;
} {
  const body = rejectUnknownFields(input, ['displayName', 'bio', 'expectedUserUpdatedAt', 'expectedProfileUpdatedAt', 'reasonCode', 'confirmation']);
  if (!('expectedUserUpdatedAt' in body) || !('expectedProfileUpdatedAt' in body)) throw new Error('invalid_date_filter');
  if (body.displayName === undefined && body.bio === undefined) throw new Error('profile_update_empty');
  const displayName = body.displayName === undefined ? undefined : parseDisplayName(body.displayName);
  let bio: string | undefined;
  if (body.bio !== undefined) {
    if (typeof body.bio !== 'string') throw new Error('invalid_bio');
    bio = body.bio.normalize('NFC').trim();
    if (bio.length > 2000) throw new Error('invalid_bio');
  }
  const expectedProfileUpdatedAt = body.expectedProfileUpdatedAt === null
    ? null
    : supportTimestamp(body.expectedProfileUpdatedAt);
  requireConfirmation(body.confirmation, 'UPDATE MEMBER PROFILE');
  return {
    displayName,
    bio,
    expectedUserUpdatedAt: supportTimestamp(body.expectedUserUpdatedAt),
    expectedProfileUpdatedAt,
    reasonCode: parseReasonCode(body.reasonCode),
  };
}

function memberProfileOutput(row: MemberProfileRecord): Record<string, unknown> {
  if (typeof row.display_name !== 'string' || typeof row.bio !== 'string') throw new Error('account_support_unavailable');
  return {
    displayName: row.display_name,
    bio: row.bio,
    userUpdatedAt: supportTimestamp(row.user_updated_at),
    profileUpdatedAt: row.profile_updated_at === null ? null : supportTimestamp(row.profile_updated_at),
  };
}

async function audit(client: DatabaseClient, actor: AdminActor, action: string, userId: string | null, reasonCode: string, correlation: string, metadata: Record<string, unknown>): Promise<void> {
  const written = await client.query(`INSERT INTO system.audit_events
    (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata, created_at)
    VALUES ($1, $2, $3, 'user', $4, $5, $6, $7::jsonb, clock_timestamp()) RETURNING id`,
  [uuidv7(), actor.userId, action, userId, reasonCode, correlation, JSON.stringify(metadata)]);
  if (written.rowCount !== 1) throw new Error('account_support_unavailable');
}

async function readMemberProfile(client: DatabaseClient, userId: string): Promise<Record<string, unknown>> {
  const found = await client.query<MemberProfileRecord>(`SELECT u.display_name, COALESCE(p.bio, '') AS bio,
      to_char(u.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS user_updated_at,
      CASE WHEN p.user_id IS NULL THEN NULL
        ELSE to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS profile_updated_at
     FROM identity.users u LEFT JOIN social.profiles p ON p.user_id = u.id
    WHERE u.id = $1 AND u.status <> 'deleted' AND u.deleted_at IS NULL`, [userId]);
  if (!found.rows[0]) throw new Error('user_not_found');
  return memberProfileOutput(found.rows[0]);
}

async function updateMemberProfile(
  client: DatabaseClient,
  actor: AdminActor,
  userId: string,
  input: ReturnType<typeof profileUpdateRequest>,
  correlation: string,
): Promise<Record<string, unknown>> {
  const currentUser = await client.query<{ display_name: string; status: string; deleted_at: string | Date | null; user_updated_at: string }>(
    `SELECT display_name, status, deleted_at,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS user_updated_at
       FROM identity.users WHERE id = $1 FOR UPDATE`, [userId]);
  if (!currentUser.rows[0] || currentUser.rows[0].status === 'deleted' || currentUser.rows[0].deleted_at) throw new Error('user_not_found');
  const currentProfile = await client.query<{ bio: string; profile_updated_at: string }>(
    `SELECT bio, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS profile_updated_at
       FROM social.profiles WHERE user_id = $1 FOR UPDATE`, [userId]);
  const before = { displayName: currentUser.rows[0].display_name, bio: currentProfile.rows[0]?.bio ?? '' };
  const actualProfileUpdatedAt = currentProfile.rows[0]?.profile_updated_at ?? null;
  if (currentUser.rows[0].user_updated_at !== input.expectedUserUpdatedAt
    || actualProfileUpdatedAt !== input.expectedProfileUpdatedAt) throw new Error('account_support_profile_conflict');
  const after = {
    displayName: input.displayName ?? before.displayName,
    bio: input.bio ?? before.bio,
  };
  const changedFields = [
    after.displayName !== before.displayName ? 'display_name' : null,
    after.bio !== before.bio ? 'bio' : null,
  ].filter((field): field is string => field !== null);
  if (!changedFields.length) throw new Error('profile_update_empty');

  const sourceEventId = uuidv7();
  let userUpdatedAt = currentUser.rows[0].user_updated_at;
  if (changedFields.includes('display_name')) {
    const updatedUser = await client.query<{ user_updated_at: string }>(
      `UPDATE identity.users SET display_name = $1, updated_at = clock_timestamp()
        WHERE id = $2 AND updated_at = $3::timestamptz
        RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS user_updated_at`,
      [after.displayName, userId, input.expectedUserUpdatedAt]);
    if (updatedUser.rowCount !== 1) throw new Error('account_support_profile_conflict');
    userUpdatedAt = updatedUser.rows[0].user_updated_at;
  }
  const updatedProfile = await client.query<{ profile_updated_at: string }>(
    `INSERT INTO social.profiles (user_id, bio, moderation_source_event_id, moderation_state)
     VALUES ($1, $2, $3, 'under_review')
     ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio,
       moderation_source_event_id = EXCLUDED.moderation_source_event_id,
       moderation_state = 'under_review', updated_at = clock_timestamp()
       WHERE social.profiles.updated_at IS NOT DISTINCT FROM $4::timestamptz
     RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS profile_updated_at`,
    [userId, after.bio, sourceEventId, input.expectedProfileUpdatedAt]);
  if (updatedProfile.rowCount !== 1) throw new Error('account_support_profile_conflict');
  await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, 'content.profile.updated', 'profile', $2, $3, $4::jsonb)`,
  [sourceEventId, userId, actor.userId, JSON.stringify({ userId, sourceEventId, changedFields })]);
  await audit(client, actor, 'identity.account_support_profile_changed', userId, input.reasonCode, correlation, {
    changedFields,
    before,
    after,
    moderationState: 'under_review',
    sourceEventId,
  });
  return {
    profile: {
      displayName: after.displayName,
      bio: after.bio,
      userUpdatedAt,
      profileUpdatedAt: updatedProfile.rows[0].profile_updated_at,
      moderationState: 'under_review',
    },
    correlationId: correlation,
  };
}

async function privateLookup(request: Request, env: SupportEnv, actor: AdminActor, email: unknown): Promise<{ state: string; account: ReturnType<typeof accountSupportSnapshot> | null }> {
  if (!env.AUTH_EMAIL_ENVELOPE) throw new Error('account_support_unavailable');
  const overrides = request.headers.get('Cloudflare-Workers-Version-Overrides') ?? '';
  const candidate = /(?:^|,\s*)lythaus-public-api-development="([0-9a-f-]{36})"(?:\s*(?:,|$))/i.exec(overrides)?.[1];
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await env.AUTH_EMAIL_ENVELOPE!.fetch('https://lythaus-public.internal/keeper-account-support/lookup', {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', ...(candidate ? { 'Cloudflare-Workers-Version-Overrides': `lythaus-public-api-development="${candidate}"` } : {}) },
          body: JSON.stringify({ actorId: actor.userId, email }),
        });
        const body = await readBoundedJson<Record<string, unknown>>(response, 4096);
        if (!supportUuid(body?.workerVersion) || (candidate && body.workerVersion !== candidate)) throw new Error('account_support_unavailable');
        if (!response.ok) throw new Error(body.error === 'account_support_owner_required' ? 'account_support_owner_required' : 'account_support_unavailable');
        const result = body.result as Record<string, unknown> | undefined;
        if (!result || !['found', 'not_found', 'ambiguous'].includes(String(result.state))) throw new Error('account_support_unavailable');
        const account = result.state === 'found' ? accountSupportSnapshot(result.account) : null;
        if (result.state !== 'found' && result.account !== null) throw new Error('account_support_unavailable');
        return { state: String(result.state), account };
      })(),
      new Promise<never>((_, reject) => { deadline = setTimeout(() => { controller.abort(); reject(new Error('account_support_unavailable')); }, 5000); }),
    ]);
  } finally { clearTimeout(deadline); }
}

const EXACT_TIME_SQL = `to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function handleAccountSupport(request: Request, env: SupportEnv, actor: AdminActor, correlation: string, runTransaction = transaction): Promise<Response> {
  if (actor.role !== 'owner' || !supportUuid(actor.userId)) throw new Error('account_support_owner_required');
  const url = new URL(request.url);
  const headers = { 'cache-control': 'private, no-store', 'x-correlation-id': correlation };
  const historyMatch = url.pathname.match(/^\/api\/admin\/account-support\/users\/([^/]+)\/history$/);
  const profileMatch = url.pathname.match(/^\/api\/admin\/account-support\/users\/([^/]+)\/profile$/);
  const lookup = url.pathname === '/api/admin/account-support/lookup';
  const access = url.pathname === '/api/admin/account-support/access';
  if ((!access && !lookup && !historyMatch && !profileMatch) || url.search) return json({ error: 'not_found', correlationId: correlation }, { status: 404, headers });
  const allowedMethods = access ? ['GET'] : profileMatch ? ['POST', 'PATCH'] : ['POST'];
  if (!allowedMethods.includes(request.method)) return json({ error: 'method_not_allowed', correlationId: correlation }, { status: 405, headers: { ...headers, allow: allowedMethods.join(', ') } });
  if (!access) assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
  const input = access ? null : await readBoundedJson(request, request.method === 'PATCH' ? 16 * 1024 : 4096);
  const userId = historyMatch || profileMatch ? parseAdminUserId((historyMatch || profileMatch)![1]) : null;
  const lookupInput = lookup ? rejectUnknownFields(input, ['email', 'reasonCode']) : null;
  if (lookupInput && (typeof lookupInput.email !== 'string' || lookupInput.email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookupInput.email.trim()))) throw new Error('invalid_email');
  const lookupReason = lookupInput ? parseReasonCode(lookupInput.reasonCode) : null;
  const profileReadReason = profileMatch && request.method === 'POST' ? profileReadRequest(input) : null;
  const profileUpdate = profileMatch && request.method === 'PATCH' ? profileUpdateRequest(input) : null;
  const history = historyMatch ? historyRequest(input, userId!) : null;
  try {
    const result = await runTransaction(env.DB_ADMIN_FRESH, async client => {
      await requireOwner(client, actor);
      if (access) return { available: true, profileCorrectionsAvailable: await profileCorrectionsAvailable(client) };
      if (profileMatch && !(await profileCorrectionsAvailable(client))) throw new Error('account_support_unavailable');
      if (lookupInput) {
        const found = await privateLookup(request, env, actor, lookupInput.email);
        await requireOwner(client, actor);
        await audit(client, actor, 'identity.account_support_lookup', found.account?.id ?? null, lookupReason!, correlation, { outcome: found.state, lookupType: 'exact_email' });
        return { ...found, correlationId: correlation };
      }
      if (profileMatch && profileReadReason) {
        const profile = await readMemberProfile(client, userId!);
        await audit(client, actor, 'identity.account_support_profile_viewed', userId, profileReadReason, correlation, { fields: ['display_name', 'bio'] });
        return { profile, correlationId: correlation };
      }
      if (profileMatch && profileUpdate) return updateMemberProfile(client, actor, userId!, profileUpdate, correlation);
      const exists = await client.query('SELECT id FROM identity.users WHERE id = $1', [userId]);
      if (exists.rowCount !== 1) throw new Error('user_not_found');
      const { filters, limit, cursor, reasonCode, scope } = history!;
      const snapshot = cursor?.snapshotAt ?? supportTimestamp((await client.query(`SELECT ${EXACT_TIME_SQL} AS snapshot_at`)).rows[0]?.snapshot_at);
      const values: unknown[] = [userId, snapshot];
      const predicates = ['created_at <= $2::timestamptz'];
      const add = (value: unknown): string => { values.push(value); return `$${values.length}`; };
      if (filters.source) predicates.push(`source = ${add(filters.source)}`);
      if (filters.eventType) predicates.push(`event_type = ${add(filters.eventType)}`);
      if (filters.correlationId) predicates.push(`correlation_id = ${add(filters.correlationId)}`);
      if (filters.since) predicates.push(`created_at >= ${add(filters.since)}::timestamptz`);
      if (filters.until) predicates.push(`created_at < ${add(filters.until)}::timestamptz`);
      const direction = filters.order === 'oldest' ? 'ASC' : 'DESC';
      if (cursor) predicates.push(`(created_at, id, source COLLATE "C") ${filters.order === 'oldest' ? '>' : '<'} (${add(cursor.createdAt)}::timestamptz, ${add(cursor.id)}::uuid, ${add(cursor.source)}::text COLLATE "C")`);
      const records = await client.query(`WITH history AS (
          SELECT id, created_at, 'account'::text AS source, event_type, NULL::text AS correlation_id,
            NULL::text AS reason_code, 'account'::text AS category, NULL::text AS outcome FROM identity.account_events WHERE user_id = $1
          UNION ALL
          SELECT id, created_at, 'activity'::text, event_type, correlation_id, reason_code, category, result
            FROM trust.user_activity_events WHERE user_id = $1
          UNION ALL
          SELECT id, created_at, 'audit'::text, action, correlation_id, reason_code, 'admin'::text, NULL::text
            FROM system.audit_events WHERE target_type = 'user' AND target_id = $1
        ) SELECT id, source, event_type, correlation_id, reason_code, category, outcome,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
        FROM history WHERE ${predicates.join(' AND ')}
        ORDER BY created_at ${direction}, id ${direction}, source COLLATE "C" ${direction} LIMIT ${add(limit + 1)}`, values);
      const items = records.rows.slice(0, limit).map(row => ({
        id: row.id, source: row.source, eventType: safeSupportCode(row.event_type) ?? 'unavailable',
        createdAt: supportTimestamp(row.created_at), correlationId: safeSupportCode(row.correlation_id, 128),
        reasonCode: safeSupportCode(row.reason_code, 80), category: safeSupportCode(row.category, 20), outcome: safeSupportCode(row.outcome, 20),
      }));
      const tail = items.at(-1);
      const nextCursor = records.rows.length > limit && tail ? btoa(JSON.stringify({ scope, snapshotAt: snapshot, createdAt: tail.createdAt, id: tail.id, source: tail.source })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '') : null;
      await audit(client, actor, 'identity.account_support_history_viewed', userId, reasonCode, correlation, {
        returnedRowCount: items.length, requestedLimit: limit, source: filters.source, order: filters.order,
        hasCursor: Boolean(cursor), hasEventTypeFilter: Boolean(filters.eventType), hasCorrelationFilter: Boolean(filters.correlationId), hasDateFilter: Boolean(filters.since || filters.until),
      });
      return { items, nextCursor, snapshotAt: snapshot, coverage: 'partial', notice: ACCOUNT_SUPPORT_HISTORY_NOTICE, correlationId: correlation };
    });
    return json(result, { headers });
  } catch (error) {
    if (error instanceof Error && ['account_support_owner_required', 'account_support_profile_conflict', 'profile_update_empty', 'user_not_found'].includes(error.message)) throw error;
    throw new Error('account_support_unavailable');
  }
}
