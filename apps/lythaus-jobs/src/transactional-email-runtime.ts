import type { EnvBindings } from '@lythaus/cloudflare-env';
import { classifyEmailProviderFailure, lifecycleStateForEmailEvent, nextTransactionalEmailState, renderTransactionalEmail, type TransactionalEmailMessage, type TransactionalEmailPurpose, type TransactionalEmailState } from '@lythaus/contracts';
import { query, transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { constantTimeEqual, decryptField } from '@lythaus/security';

export interface TransactionalEmailRelayEnv extends EnvBindings {
  DB_JOBS_FRESH: HyperdriveBinding;
}

interface ClaimedEmail {
  id: string;
  purpose: TransactionalEmailPurpose;
  delivery_envelope_ciphertext: string | null;
  delivery_envelope_encryption_key_version: string | null;
  template_version: string;
  attempt_count: number;
  correlation_id: string;
}

class EmailProviderFailure extends Error {
  readonly status?: number;
  readonly providerCode?: string;

  constructor(status?: number, providerCode?: string) {
    super(providerCode ?? 'email_provider_failed');
    this.status = status;
    this.providerCode = providerCode;
    this.name = 'EmailProviderFailure';
  }
}

function providerFailureDetails(error: unknown): { status?: number; code?: string } {
  const shape = error && typeof error === 'object' ? error as { code?: unknown; errorCode?: unknown; status?: unknown; statusCode?: unknown; response?: { status?: unknown } } : {};
  const status = Number(shape.status ?? shape.statusCode ?? shape.response?.status);
  const codeValue = shape.code ?? shape.errorCode ?? (error instanceof Error ? error.message.match(/\bE_[A-Z0-9_]{2,63}\b/)?.[0] : undefined);
  return {
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
    code: typeof codeValue === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(codeValue) ? codeValue : undefined,
  };
}

export function emailProviderFailureCategory(error: unknown): ReturnType<typeof classifyEmailProviderFailure> {
  const details = error instanceof EmailProviderFailure
    ? { status: error.status, code: error.providerCode }
    : providerFailureDetails(error);
  return classifyEmailProviderFailure(details);
}

function messageForRow(env: TransactionalEmailRelayEnv, row: ClaimedEmail): Promise<TransactionalEmailMessage> {
  if (!row.delivery_envelope_ciphertext || !row.delivery_envelope_encryption_key_version) {
    throw new EmailProviderFailure(400, 'E_SECRET_UNAVAILABLE');
  }
  if (!env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1) throw new EmailProviderFailure(503, 'E_ENCRYPTION_KEY_UNAVAILABLE');
  return decryptField({ ciphertext: row.delivery_envelope_ciphertext, encryptionKeyVersion: row.delivery_envelope_encryption_key_version }, env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1).then((plaintext) => {
    let envelope: { to?: unknown; token?: unknown; acceptanceContext?: unknown };
    try { envelope = JSON.parse(plaintext) as typeof envelope; } catch { throw new EmailProviderFailure(400, 'E_DELIVERY_ENVELOPE_INVALID'); }
    if (typeof envelope.to !== 'string' || typeof envelope.token !== 'string') throw new EmailProviderFailure(400, 'E_DELIVERY_ENVELOPE_INVALID');
    const message = renderTransactionalEmail({
      purpose: row.purpose,
      token: envelope.token,
      verificationBaseUrl: env.EMAIL_VERIFICATION_BASE_URL,
      resetBaseUrl: env.EMAIL_PASSWORD_RESET_BASE_URL,
      acceptanceLinkBaseUrl: env.AUTH_ACCEPTANCE_EMAIL_LINK_BASE_URL,
      acceptanceContext: typeof envelope.acceptanceContext === 'string' ? envelope.acceptanceContext : undefined,
    });
    return { ...message, to: envelope.to };
  });
}

function errorResponseCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as { code?: unknown; errorCode?: unknown }).code ?? (payload as { errorCode?: unknown }).errorCode;
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(value) ? value : undefined;
}

export async function sendTransactionalEmail(env: TransactionalEmailRelayEnv, message: TransactionalEmailMessage): Promise<{ provider: string; messageId: string; acceptedAt: string }> {
  const providerMode = env.EMAIL_PROVIDER_MODE ?? (env.ENVIRONMENT === 'production' ? 'cloudflare' : 'fallback');
  if (providerMode === 'disabled') throw new EmailProviderFailure(503, 'E_PROVIDER_DISABLED');
  if (providerMode === 'cloudflare') {
    if (!env.EMAIL || !env.EMAIL_FROM) throw new EmailProviderFailure(503, 'E_PROVIDER_NOT_CONFIGURED');
    try {
      const delivery = await env.EMAIL.send({
        to: message.to,
        from: { email: env.EMAIL_FROM, name: 'Lythaus' },
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (!delivery.messageId || typeof delivery.messageId !== 'string') throw new EmailProviderFailure(502, 'E_PROVIDER_MESSAGE_ID_MISSING');
      return { provider: 'cloudflare-email', messageId: delivery.messageId, acceptedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof EmailProviderFailure) throw error;
      const details = providerFailureDetails(error);
      throw new EmailProviderFailure(details.status, details.code);
    }
  }
  if (providerMode !== 'fallback' || !env.EMAIL_PROVIDER_URL || !env.EMAIL_PROVIDER_TOKEN || !env.EMAIL_FROM) {
    throw new EmailProviderFailure(400, 'E_PROVIDER_NOT_CONFIGURED');
  }
  let response: Response;
  try {
    response = await fetch(env.EMAIL_PROVIDER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}` },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: message.to, subject: message.subject, html: message.html, text: message.text }),
    });
  } catch {
    throw new EmailProviderFailure(503, 'E_PROVIDER_UNAVAILABLE');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new EmailProviderFailure(response.status, errorResponseCode(payload));
  const messageId = payload && typeof payload === 'object' && typeof (payload as { messageId?: unknown }).messageId === 'string'
    ? (payload as { messageId: string }).messageId
    : '';
  if (!messageId) throw new EmailProviderFailure(502, 'E_PROVIDER_MESSAGE_ID_MISSING');
  return { provider: 'fallback-email', messageId, acceptedAt: new Date().toISOString() };
}

async function claimTransactionalEmails(env: TransactionalEmailRelayEnv, limit = 25): Promise<ClaimedEmail[]> {
  return transaction(env.DB_JOBS_FRESH, async (client) => {
    await client.query(
      `UPDATE system.transactional_email_outbox
          SET state = 'queued', updated_at = now()
        WHERE state = 'processing' AND updated_at < now() - interval '5 minutes'`,
    );
    const result = await client.query<ClaimedEmail>(
      `WITH claimable AS (
         SELECT id
           FROM system.transactional_email_outbox
          WHERE state = 'queued' AND next_attempt_at <= now()
          ORDER BY created_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE system.transactional_email_outbox AS outbox
          SET state = 'processing', last_attempt_at = now(),
              attempt_count = outbox.attempt_count + 1, updated_at = now(),
              provider_error_code = NULL, provider_error_category = NULL
         FROM claimable
        WHERE outbox.id = claimable.id
       RETURNING outbox.id, outbox.purpose,
                 outbox.delivery_envelope_ciphertext, outbox.delivery_envelope_encryption_key_version,
                 outbox.template_version, outbox.attempt_count, outbox.correlation_id`,
      [limit],
    );
    return result.rows;
  });
}

async function markEmailFailure(env: TransactionalEmailRelayEnv, row: ClaimedEmail, error: unknown): Promise<void> {
  const details = emailProviderFailureCategory(error);
  const next = nextTransactionalEmailState({ category: details.category, attemptCount: row.attempt_count });
  const terminal = next.state === 'failed';
  await query(env.DB_JOBS_FRESH,
    `UPDATE system.transactional_email_outbox
        SET state = $2,
            next_attempt_at = CASE WHEN $3::bigint IS NULL THEN next_attempt_at ELSE to_timestamp($3::double precision / 1000) END,
            provider_error_code = $4,
            provider_error_category = $5,
            terminal_at = CASE WHEN $6 THEN now() ELSE terminal_at END,
            updated_at = now()
      WHERE id = $1 AND state = 'processing'`,
    [row.id, next.state, next.nextAttemptAt, details.code ?? 'E_PROVIDER_UNKNOWN', details.category, terminal],
  );
}

async function deliverClaimedEmail(env: TransactionalEmailRelayEnv, row: ClaimedEmail): Promise<void> {
  let delivery: { provider: string; messageId: string; acceptedAt: string };
  try {
    const message = await messageForRow(env, row);
    delivery = await sendTransactionalEmail(env, message);
  } catch (error) {
    await markEmailFailure(env, row, error);
    return;
  }
  await query(env.DB_JOBS_FRESH,
    `UPDATE system.transactional_email_outbox
        SET state = 'provider_accepted', provider = $2, provider_message_id = $3,
            accepted_at = $4::timestamptz, delivery_envelope_ciphertext = NULL,
            delivery_envelope_encryption_key_version = NULL, updated_at = now()
      WHERE id = $1 AND state = 'processing'`,
    [row.id, delivery.provider, delivery.messageId, delivery.acceptedAt],
  );
}

export async function relayTransactionalEmailOutbox(env: TransactionalEmailRelayEnv): Promise<void> {
  const claimed = await claimTransactionalEmails(env);
  for (const row of claimed) await deliverClaimedEmail(env, row);
}

export interface TransactionalEmailLifecycleEvent {
  eventType?: string;
  type?: string;
  messageId?: string;
  providerMessageId?: string;
  errorCode?: string;
}

export const EMAIL_LIFECYCLE_QUEUE = 'lythaus-email-lifecycle-dev';

const CLOUDFLARE_LIFECYCLE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  'cf.email.sending.message.delivered': 'message.delivered',
  'cf.email.sending.message.deferred': 'message.deferred',
  'cf.email.sending.message.bounced': 'message.bounced',
  'cf.email.sending.message.failed': 'message.failed',
  'cf.email.sending.message.rejected': 'message.rejected',
  'cf.email.sending.message.complained': 'message.complained',
});

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizedProviderErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : undefined;
}

function providerMessageId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= 256 && !/[\u0000-\u001f\u007f]/.test(id) ? id : undefined;
}

/**
 * Accept only the Cloudflare lifecycle fields needed for reconciliation.
 * Recipient, subject, and every other provider field are intentionally discarded.
 */
export function parseTransactionalEmailLifecycleQueueEvent(body: unknown): TransactionalEmailLifecycleEvent | undefined {
  let root = recordValue(body);
  if (typeof body === 'string') {
    if (body.length > 16 * 1024) return undefined;
    try { root = recordValue(JSON.parse(body)); } catch { return undefined; }
  }
  const eventType = typeof root?.type === 'string' ? CLOUDFLARE_LIFECYCLE_TYPES[root.type] : undefined;
  const payload = recordValue(root?.payload);
  const messageId = providerMessageId(payload?.messageId);
  if (!eventType || !messageId) return undefined;
  const errorCode = normalizedProviderErrorCode(payload?.errorCode ?? payload?.error_code ?? payload?.code);
  return errorCode ? { eventType, messageId, errorCode } : { eventType, messageId };
}

export async function reconcileTransactionalEmailLifecycleQueueMessage(
  env: TransactionalEmailRelayEnv,
  body: unknown,
): Promise<{ valid: boolean; reconciled: boolean }> {
  const event = parseTransactionalEmailLifecycleQueueEvent(body);
  if (!event) return { valid: false, reconciled: false };
  return {
    valid: true,
    reconciled: await transaction(env.DB_JOBS_FRESH, (client) => applyTransactionalEmailLifecycle(client, event)),
  };
}

export function authorizedEmailLifecycleRequest(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(supplied) && constantTimeEqual(new TextEncoder().encode(secret), new TextEncoder().encode(supplied));
}

export async function applyTransactionalEmailLifecycle(
  client: DatabaseClient,
  event: TransactionalEmailLifecycleEvent,
): Promise<boolean> {
  const eventType = event.eventType ?? event.type ?? '';
  const state = lifecycleStateForEmailEvent(eventType);
  const messageId = event.messageId ?? event.providerMessageId;
  if (!state || !messageId || messageId.length > 256) return false;
  const terminal = ['bounced', 'rejected', 'failed', 'complained'].includes(state);
  const result = await client.query(
    `UPDATE system.transactional_email_outbox
        SET state = $2,
            provider_error_code = COALESCE($3, provider_error_code),
            provider_error_category = CASE WHEN $4 THEN 'permanent' ELSE provider_error_category END,
            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
            terminal_at = CASE WHEN $4 THEN now() ELSE terminal_at END,
            updated_at = now()
      WHERE provider_message_id = $1
        AND state NOT IN ('cancelled', 'bounced', 'rejected', 'failed', 'complained')`,
    [messageId, state, event.errorCode && /^[A-Z][A-Z0-9_]{2,63}$/.test(event.errorCode) ? event.errorCode : null, terminal],
  );
  if (result.rowCount === 1) return true;
  const known = await client.query(
    `SELECT 1 FROM system.transactional_email_outbox WHERE provider_message_id = $1 LIMIT 1`,
    [messageId],
  );
  return known.rowCount === 1;
}

interface TransactionalEmailEvidenceGroupRow {
  purpose: TransactionalEmailPurpose;
  provider: string;
  state: 'provider_accepted' | 'delivered';
  provider_error_category: string | null;
  row_count: number | string;
  provider_message_id_count: number | string;
  distinct_provider_message_id_count: number | string;
  accepted_count: number | string;
  delivered_count: number | string;
}

export interface TransactionalEmailDeliveryEvidenceFilter {
  correlationId: string;
  windowStart: string;
  windowEnd: string;
  challengeIds?: readonly string[];
}

export interface TransactionalEmailDeliveryEvidence {
  status: 'delivered_rows_available' | 'provider_accepted_only' | 'no_matching_rows';
  capturedAt: string;
  lifecycleSource: 'cloudflare_email_sending_queue';
  groups: Array<{
    purpose: TransactionalEmailPurpose;
    provider: string;
    state: 'provider_accepted' | 'delivered';
    providerErrorCategory: string | null;
    rowCount: number;
    providerMessageIdCount: number;
    distinctProviderMessageIdCount: number;
    acceptedCount: number;
    deliveredCount: number;
  }>;
}

function evidenceFilterError(): Error {
  return new Error('email_evidence_filter_invalid');
}

function validateEvidenceFilter(filter: TransactionalEmailDeliveryEvidenceFilter): { start: Date; end: Date; challengeIds?: string[] } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(filter.correlationId)) throw evidenceFilterError();
  const start = new Date(filter.windowStart);
  const end = new Date(filter.windowEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 31 * 86_400_000) throw evidenceFilterError();
  const challengeIds = filter.challengeIds ? [...new Set(filter.challengeIds)] : undefined;
  if (challengeIds && (challengeIds.length === 0 || challengeIds.length > 32 || challengeIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))) throw evidenceFilterError();
  return { start, end, challengeIds };
}

export async function readTransactionalEmailDeliveryEvidence(
  env: TransactionalEmailRelayEnv,
  filter: TransactionalEmailDeliveryEvidenceFilter,
): Promise<TransactionalEmailDeliveryEvidence> {
  const validated = validateEvidenceFilter(filter);
  const values: unknown[] = [filter.correlationId, validated.start.toISOString(), validated.end.toISOString()];
  const challengePredicate = validated.challengeIds
    ? (() => { values.push(validated.challengeIds); return ' AND challenge_id = ANY($4::uuid[])'; })()
    : '';
  const result = await query<TransactionalEmailEvidenceGroupRow>(
    env.DB_JOBS_FRESH,
    `SELECT purpose, state, provider, provider_error_category,
            count(*)::bigint AS row_count,
            count(provider_message_id)::bigint AS provider_message_id_count,
            count(DISTINCT provider_message_id)::bigint AS distinct_provider_message_id_count,
            count(*) FILTER (WHERE accepted_at IS NOT NULL)::bigint AS accepted_count,
            count(*) FILTER (WHERE delivered_at IS NOT NULL)::bigint AS delivered_count
       FROM system.transactional_email_outbox
      WHERE provider = 'cloudflare-email'
        AND correlation_id = $1
        AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
        AND state IN ('provider_accepted', 'delivered')
        AND provider_message_id IS NOT NULL${challengePredicate}
      GROUP BY purpose, state, provider, provider_error_category
      ORDER BY purpose, state`,
    values,
  );
  return summarizeTransactionalEmailDeliveryEvidence(result.rows);
}

function evidenceCount(value: number | string): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function summarizeTransactionalEmailDeliveryEvidence(
  rows: readonly TransactionalEmailEvidenceGroupRow[],
  capturedAt = new Date().toISOString(),
): TransactionalEmailDeliveryEvidence {
  const groups = rows.map((row) => ({
    purpose: row.purpose,
    provider: row.provider,
    state: row.state,
    providerErrorCategory: row.provider_error_category,
    rowCount: evidenceCount(row.row_count),
    providerMessageIdCount: evidenceCount(row.provider_message_id_count),
    distinctProviderMessageIdCount: evidenceCount(row.distinct_provider_message_id_count),
    acceptedCount: evidenceCount(row.accepted_count),
    deliveredCount: evidenceCount(row.delivered_count),
  }));
  const deliveredCount = groups.reduce((total, row) => total + row.deliveredCount, 0);
  const acceptedCount = groups.reduce((total, row) => total + row.acceptedCount, 0);
  const status = deliveredCount > 0 ? 'delivered_rows_available' : acceptedCount > 0 ? 'provider_accepted_only' : 'no_matching_rows';
  return {
    status,
    capturedAt,
    lifecycleSource: 'cloudflare_email_sending_queue',
    groups,
  };
}

export async function handleTransactionalEmailLifecycleWebhook(request: Request, env: TransactionalEmailRelayEnv): Promise<Response> {
  if (!authorizedEmailLifecycleRequest(request, env.EMAIL_LIFECYCLE_WEBHOOK_SECRET)) return new Response(null, { status: 404 });
  let event: TransactionalEmailLifecycleEvent;
  try {
    event = await request.json() as TransactionalEmailLifecycleEvent;
  } catch {
    return new Response(null, { status: 400 });
  }
  const updated = await transaction(env.DB_JOBS_FRESH, (client) => applyTransactionalEmailLifecycle(client, event));
  return Response.json({ accepted: updated }, { status: updated ? 200 : 409 });
}
