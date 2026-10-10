import type { EnvBindings } from '@lythaus/cloudflare-env';
import { classifyEmailProviderFailure, lifecycleStateForEmailEvent, nextTransactionalEmailState, renderTransactionalEmail, type TransactionalEmailMessage, type TransactionalEmailPurpose, type TransactionalEmailState } from '@lythaus/contracts';
import { lockAuthDelivery, query, transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { constantTimeEqual, decryptField } from '@lythaus/security';
import { logEvent } from '@lythaus/observability';
import { TRANSACTIONAL_EMAIL_DISPATCH_TYPE, verifyTransactionalEmailDispatchMessage } from '../../../packages/security/src/transactional-email-dispatch.ts';

export interface TransactionalEmailRelayEnv extends EnvBindings {
  DB_JOBS_FRESH: HyperdriveBinding;
}

type EmailDatabase = { query: typeof query; transaction: typeof transaction };
const emailDatabase: EmailDatabase = { query, transaction };

interface ClaimedEmail {
  id: string;
  user_id: string | null;
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

async function withDeliveryDeadline<T>(operation: Promise<T>, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new EmailProviderFailure(undefined, 'E_DELIVERY_ACCEPTANCE_UNKNOWN')), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
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

export async function decryptTransactionalEmailEnvelope(
  field: { ciphertext: string; encryptionKeyVersion: string },
  transactionalEmailKey: string,
): Promise<{ to: string; token: string; acceptanceContext?: string }> {
  const plaintext = await decryptField(field, transactionalEmailKey);
  let envelope: { to?: unknown; token?: unknown; acceptanceContext?: unknown };
  try { envelope = JSON.parse(plaintext) as typeof envelope; } catch { throw new EmailProviderFailure(400, 'E_DELIVERY_ENVELOPE_INVALID'); }
  if (!envelope || typeof envelope.to !== 'string' || typeof envelope.token !== 'string') throw new EmailProviderFailure(400, 'E_DELIVERY_ENVELOPE_INVALID');
  return {
    to: envelope.to,
    token: envelope.token,
    ...(typeof envelope.acceptanceContext === 'string' ? { acceptanceContext: envelope.acceptanceContext } : {}),
  };
}

async function messageForRow(env: TransactionalEmailRelayEnv, row: ClaimedEmail): Promise<TransactionalEmailMessage> {
  if (!row.delivery_envelope_ciphertext || !row.delivery_envelope_encryption_key_version) {
    throw new EmailProviderFailure(400, 'E_SECRET_UNAVAILABLE');
  }
  if (!env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1) throw new EmailProviderFailure(503, 'E_ENCRYPTION_KEY_UNAVAILABLE');
  return decryptTransactionalEmailEnvelope({
    ciphertext: row.delivery_envelope_ciphertext,
    encryptionKeyVersion: row.delivery_envelope_encryption_key_version,
  }, env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1).then((envelope) => {
    const message = renderTransactionalEmail({
      purpose: row.purpose,
      token: envelope.token,
      verificationBaseUrl: env.EMAIL_VERIFICATION_BASE_URL,
      resetBaseUrl: env.EMAIL_PASSWORD_RESET_BASE_URL,
      acceptanceLinkBaseUrl: env.AUTH_ACCEPTANCE_EMAIL_LINK_BASE_URL,
      acceptanceContext: envelope.acceptanceContext,
      environment: env.ENVIRONMENT,
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
      const delivery = await withDeliveryDeadline(env.EMAIL.send({
        to: message.to,
        from: { email: env.EMAIL_FROM, name: 'Lythaus' },
        subject: message.subject,
        html: message.html,
        text: message.text,
      }));
      if (!delivery.messageId || typeof delivery.messageId !== 'string') throw new EmailProviderFailure(undefined, 'E_DELIVERY_ACCEPTANCE_UNKNOWN');
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
      redirect: 'manual',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}` },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: message.to, subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new EmailProviderFailure(undefined, 'E_DELIVERY_ACCEPTANCE_UNKNOWN');
  }
  if (response.status >= 300 && response.status < 400) {
    throw new EmailProviderFailure(response.status, 'E_DELIVERY_ACCEPTANCE_UNKNOWN');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new EmailProviderFailure(response.status, errorResponseCode(payload));
  const messageId = payload && typeof payload === 'object' && typeof (payload as { messageId?: unknown }).messageId === 'string'
    ? (payload as { messageId: string }).messageId
    : '';
  if (!messageId) throw new EmailProviderFailure(undefined, 'E_DELIVERY_ACCEPTANCE_UNKNOWN');
  return { provider: 'fallback-email', messageId, acceptedAt: new Date().toISOString() };
}

async function claimTransactionalEmails(env: TransactionalEmailRelayEnv, database: EmailDatabase, outboxId?: string): Promise<ClaimedEmail[]> {
  return database.transaction(env.DB_JOBS_FRESH, async (client) => {
    await client.query(
      `UPDATE system.transactional_email_outbox
          SET state = 'failed', terminal_at = now(), updated_at = now(),
              delivery_envelope_ciphertext = NULL, delivery_envelope_encryption_key_version = NULL,
              provider_error_code = 'E_DELIVERY_ACCEPTANCE_UNKNOWN', provider_error_category = 'unknown'
        WHERE state = 'processing' AND updated_at < now() - interval '5 minutes'`,
    );
    const result = await client.query<ClaimedEmail>(
      `WITH claimable AS (
         SELECT id
           FROM system.transactional_email_outbox
          WHERE state = 'queued' AND next_attempt_at <= now()
          ${outboxId ? 'AND id = $2::uuid' : ''}
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
       RETURNING outbox.id, outbox.user_id, outbox.purpose,
                 outbox.delivery_envelope_ciphertext, outbox.delivery_envelope_encryption_key_version,
                 outbox.template_version, outbox.attempt_count, outbox.correlation_id`,
      outboxId ? [1, outboxId] : [1],
    );
    return result.rows;
  });
}

async function markEmailFailure(client: DatabaseClient, row: ClaimedEmail, error: unknown): Promise<void> {
  const details = emailProviderFailureCategory(error);
  const next = nextTransactionalEmailState({ category: details.category, attemptCount: row.attempt_count });
  const terminal = next.state === 'failed';
  await client.query(
    `UPDATE system.transactional_email_outbox
        SET state = $2,
            next_attempt_at = CASE WHEN $3::bigint IS NULL THEN next_attempt_at ELSE to_timestamp($3::double precision / 1000) END,
            provider_error_code = $4,
            provider_error_category = $5,
            terminal_at = CASE WHEN $6 THEN now() ELSE terminal_at END,
            delivery_envelope_ciphertext = CASE WHEN $6 THEN NULL ELSE delivery_envelope_ciphertext END,
            delivery_envelope_encryption_key_version = CASE WHEN $6 THEN NULL ELSE delivery_envelope_encryption_key_version END,
            updated_at = now()
      WHERE id = $1 AND state = 'processing'`,
    [row.id, next.state, next.nextAttemptAt, details.code ?? 'E_PROVIDER_UNKNOWN', details.category, terminal],
  );
}

export async function lockDeliverableEmail(client: DatabaseClient, id: string, userId: string | null): Promise<boolean> {
  if (userId) await lockAuthDelivery(client, userId);
  const result = await client.query<{ valid: boolean }>(
    `SELECT state='processing' AND user_id IS NOT NULL AND (
       (purpose='password_changed' AND created_at>now()-interval '24 hours') OR
       (purpose='password_reset' AND EXISTS(SELECT 1 FROM identity.password_reset_tokens t
          WHERE t.id=o.challenge_id AND t.user_id=o.user_id AND t.expires_at>clock_timestamp()
            AND t.consumed_at IS NULL AND t.superseded_at IS NULL)) OR
       (purpose IN ('verification','invite','email_change') AND EXISTS(SELECT 1 FROM identity.email_verification_tokens t
          WHERE t.id=o.challenge_id AND t.user_id=o.user_id AND t.expires_at>clock_timestamp()
            AND t.consumed_at IS NULL AND t.superseded_at IS NULL))) AS valid
       FROM system.transactional_email_outbox o WHERE id=$1 AND user_id IS NOT DISTINCT FROM $2::uuid FOR UPDATE`, [id, userId]);
  if (result.rows[0]?.valid) return true;
  await client.query(`UPDATE system.transactional_email_outbox SET state='cancelled', terminal_at=now(), updated_at=now(),
    delivery_envelope_ciphertext=NULL, delivery_envelope_encryption_key_version=NULL
    WHERE id=$1 AND state IN ('queued','processing')`, [id]);
  return false;
}

async function deliverClaimedEmail(env: TransactionalEmailRelayEnv, row: ClaimedEmail, database: EmailDatabase): Promise<void> {
  await database.transaction(env.DB_JOBS_FRESH, async client => {
  if (!await lockDeliverableEmail(client, row.id, row.user_id)) return;
  let delivery: { provider: string; messageId: string; acceptedAt: string };
  try {
    const message = await messageForRow(env, row);
    delivery = await sendTransactionalEmail(env, message);
  } catch (error) {
    await markEmailFailure(client, row, error);
    return;
  }
  await client.query(
    `UPDATE system.transactional_email_outbox
        SET state = 'provider_accepted', provider = $2, provider_message_id = $3,
            accepted_at = clock_timestamp(), delivery_envelope_ciphertext = NULL,
            delivery_envelope_encryption_key_version = NULL, updated_at = now()
      WHERE id = $1 AND state = 'processing'`,
    [row.id, delivery.provider, delivery.messageId],
  );
  });
}

export async function relayTransactionalEmailOutbox(env: TransactionalEmailRelayEnv, database: EmailDatabase = emailDatabase): Promise<void> {
  for (let attempted = 0; attempted < 25; attempted++) {
    const [row] = await claimTransactionalEmails(env, database);
    if (!row) break;
    await deliverClaimedEmail(env, row, database);
  }
}

export async function dispatchTransactionalEmailQueueMessage(env: TransactionalEmailRelayEnv, body: unknown, database: EmailDatabase = emailDatabase): Promise<{ retryAfterSeconds: number | null }> {
  if (env.TRANSACTIONAL_EMAIL_DISPATCH_ENABLED !== 'true') return { retryAfterSeconds: 60 };
  const message = await verifyTransactionalEmailDispatchMessage(body, env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1 ?? '');
  if (!message) return { retryAfterSeconds: 60 };
  const [row] = await claimTransactionalEmails(env, database, message.outboxId);
  if (row) await deliverClaimedEmail(env, row, database);
  const result = await database.query<{ state: string; retry_after_seconds: number }>(env.DB_JOBS_FRESH,
    `SELECT state,GREATEST(1,CEIL(EXTRACT(EPOCH FROM next_attempt_at-clock_timestamp())))::integer AS retry_after_seconds
       FROM system.transactional_email_outbox WHERE id=$1`, [message.outboxId]);
  const state = result.rows[0];
  if (state?.state === 'queued') return { retryAfterSeconds: state.retry_after_seconds };
  if (state?.state === 'processing') return { retryAfterSeconds: 60 };
  return { retryAfterSeconds: null };
}

export interface TransactionalEmailLifecycleEvent {
  eventType?: string;
  type?: string;
  messageId?: string;
  providerMessageId?: string;
  errorCode?: string;
}

export const EMAIL_LIFECYCLE_QUEUE = 'lythaus-email-lifecycle-dev';

interface EmailQueueMessage {
  id: string;
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds: number }): void;
}

export async function processEmailLifecycleQueue(
  batch: { queue: string; messages: readonly EmailQueueMessage[] },
  env: TransactionalEmailRelayEnv,
  database: EmailDatabase = emailDatabase,
): Promise<void> {
  const isDispatch = (message: EmailQueueMessage) => recordValue(message.body)?.type === TRANSACTIONAL_EMAIL_DISPATCH_TYPE;
  const process = async (message: EmailQueueMessage): Promise<void> => {
    try {
      if (recordValue(message.body)?.type === TRANSACTIONAL_EMAIL_DISPATCH_TYPE) {
        const dispatch = await dispatchTransactionalEmailQueueMessage(env, message.body, database);
        if (dispatch.retryAfterSeconds === null) message.ack();
        else message.retry({ delaySeconds: dispatch.retryAfterSeconds });
        return;
      }
      const result = await reconcileTransactionalEmailLifecycleQueueMessage(env, message.body, database);
      if (!result.valid || !result.reconciled) {
        logEvent({ service: 'lythaus-jobs', queue: batch.queue, messageId: message.id,
          errorCode: result.valid ? 'email_lifecycle_event_unmatched' : 'email_lifecycle_event_invalid' });
        message.retry();
      } else message.ack();
    } catch {
      logEvent({ service: 'lythaus-jobs', queue: batch.queue, messageId: message.id, errorCode: 'email_lifecycle_reconciliation_failed' });
      message.retry();
    }
  };
  for (const message of batch.messages.filter(message => !isDispatch(message))) await process(message);
  const dispatches = batch.messages.filter(isDispatch);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, dispatches.length) }, async () => {
    while (next < dispatches.length) await process(dispatches[next++]);
  }));
}

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
  database: EmailDatabase = emailDatabase,
): Promise<{ valid: boolean; reconciled: boolean }> {
  const event = parseTransactionalEmailLifecycleQueueEvent(body);
  if (!event) return { valid: false, reconciled: false };
  return {
    valid: true,
    reconciled: await database.transaction(env.DB_JOBS_FRESH, (client) => applyTransactionalEmailLifecycle(client, event)),
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
            delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, clock_timestamp()) ELSE delivered_at END,
            terminal_at = CASE WHEN $4 THEN COALESCE(terminal_at, now()) ELSE terminal_at END,
            updated_at = now()
      WHERE provider_message_id = $1
        AND state NOT IN ('cancelled', 'bounced', 'rejected', 'failed', 'complained')
        AND state <> $2
        AND NOT (state = 'delivered' AND $2 = 'deferred')`,
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
  database: EmailDatabase = emailDatabase,
): Promise<TransactionalEmailDeliveryEvidence> {
  const validated = validateEvidenceFilter(filter);
  const values: unknown[] = [filter.correlationId, validated.start.toISOString(), validated.end.toISOString()];
  const challengePredicate = validated.challengeIds
    ? (() => { values.push(validated.challengeIds); return ' AND challenge_id = ANY($4::uuid[])'; })()
    : '';
  const result = await database.query<TransactionalEmailEvidenceGroupRow>(
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

export async function handleTransactionalEmailLifecycleWebhook(request: Request, env: TransactionalEmailRelayEnv, database: EmailDatabase = emailDatabase): Promise<Response> {
  if (!authorizedEmailLifecycleRequest(request, env.EMAIL_LIFECYCLE_WEBHOOK_SECRET)) return new Response(null, { status: 404 });
  let event: TransactionalEmailLifecycleEvent;
  try {
    event = await request.json() as TransactionalEmailLifecycleEvent;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return new Response(null, { status: 400 });
  const updated = await database.transaction(env.DB_JOBS_FRESH, (client) => applyTransactionalEmailLifecycle(client, event));
  return Response.json({ accepted: updated }, { status: updated ? 200 : 409 });
}
