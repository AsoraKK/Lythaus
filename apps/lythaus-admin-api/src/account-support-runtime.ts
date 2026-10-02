import { transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { ACCOUNT_SUPPORT_HISTORY_NOTICE, ACCOUNT_SUPPORT_SOURCES, accountSupportSnapshot, safeSupportCode, supportTimestamp, supportUuid, type AccountSupportSource } from '@lythaus/contracts';
import { json } from '@lythaus/observability';
import { uuidv7 } from '@lythaus/security';
import type { AdminActor } from './admin-access-runtime-policy.ts';
import { assertAdminMutationRequest } from './admin-cors-policy.ts';
import { parseAdminUserId, parseReasonCode, rejectUnknownFields } from './admin-runtime-policy.ts';
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

async function requireOwner(client: DatabaseClient, actor: AdminActor): Promise<void> {
  const member = await client.query(`SELECT a.user_id FROM identity.admin_memberships a JOIN identity.users u ON u.id = a.user_id
    WHERE a.user_id = $1 AND a.role = 'owner' AND a.active = true AND u.status = 'active'`, [actor.userId]);
  if (member.rowCount !== 1) throw new Error('account_support_owner_required');
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

async function audit(client: DatabaseClient, actor: AdminActor, action: string, userId: string | null, reasonCode: string, correlation: string, metadata: Record<string, unknown>): Promise<void> {
  const written = await client.query(`INSERT INTO system.audit_events
    (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata, created_at)
    VALUES ($1, $2, $3, 'user', $4, $5, $6, $7::jsonb, clock_timestamp()) RETURNING id`,
  [uuidv7(), actor.userId, action, userId, reasonCode, correlation, JSON.stringify(metadata)]);
  if (written.rowCount !== 1) throw new Error('account_support_unavailable');
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
  const lookup = url.pathname === '/api/admin/account-support/lookup';
  const access = url.pathname === '/api/admin/account-support/access';
  if ((!access && !lookup && !historyMatch) || url.search) return json({ error: 'not_found', correlationId: correlation }, { status: 404, headers });
  if (request.method !== (access ? 'GET' : 'POST')) return json({ error: 'method_not_allowed', correlationId: correlation }, { status: 405, headers: { ...headers, allow: access ? 'GET' : 'POST' } });
  if (!access) assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
  const input = access ? null : await readBoundedJson(request, 4096);
  const userId = historyMatch ? parseAdminUserId(historyMatch[1]) : null;
  const lookupInput = lookup ? rejectUnknownFields(input, ['email', 'reasonCode']) : null;
  if (lookupInput && (typeof lookupInput.email !== 'string' || lookupInput.email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookupInput.email.trim()))) throw new Error('invalid_email');
  const lookupReason = lookupInput ? parseReasonCode(lookupInput.reasonCode) : null;
  const history = userId ? historyRequest(input, userId) : null;
  try {
    const result = await runTransaction(env.DB_ADMIN_FRESH, async client => {
      await requireOwner(client, actor);
      if (access) return { available: true };
      if (lookupInput) {
        const found = await privateLookup(request, env, actor, lookupInput.email);
        await requireOwner(client, actor);
        await audit(client, actor, 'identity.account_support_lookup', found.account?.id ?? null, lookupReason!, correlation, { outcome: found.state, lookupType: 'exact_email' });
        return { ...found, correlationId: correlation };
      }
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
    if (error instanceof Error && ['account_support_owner_required', 'user_not_found'].includes(error.message)) throw error;
    throw new Error('account_support_unavailable');
  }
}
