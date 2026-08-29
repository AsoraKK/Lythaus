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
  contact_email_user_id: string | null;
  secret_ciphertext: string | null;
  secret_encryption_key_version: string | null;
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

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return '';
}

function messageForRow(env: TransactionalEmailRelayEnv, row: ClaimedEmail & { email_ciphertext: unknown; encryption_key_version: string | null }): Promise<TransactionalEmailMessage> {
  if (!row.secret_ciphertext || !row.secret_encryption_key_version || !row.email_ciphertext || !row.encryption_key_version) {
    throw new EmailProviderFailure(400, 'E_SECRET_UNAVAILABLE');
  }
  if (!env.PII_ENCRYPTION_KEY_V1) throw new EmailProviderFailure(503, 'E_ENCRYPTION_KEY_UNAVAILABLE');
  return Promise.all([
    decryptField({ ciphertext: row.secret_ciphertext, encryptionKeyVersion: row.secret_encryption_key_version }, env.PII_ENCRYPTION_KEY_V1),
    decryptField({ ciphertext: textValue(row.email_ciphertext), encryptionKeyVersion: row.encryption_key_version }, env.PII_ENCRYPTION_KEY_V1),
  ]).then(([token, to]) => {
    const message = renderTransactionalEmail({
      purpose: row.purpose,
      token,
      verificationBaseUrl: env.EMAIL_VERIFICATION_BASE_URL,
      resetBaseUrl: env.EMAIL_PASSWORD_RESET_BASE_URL,
    });
    return { ...message, to };
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
       RETURNING outbox.id, outbox.purpose, outbox.contact_email_user_id,
                 outbox.secret_ciphertext, outbox.secret_encryption_key_version,
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
    const recipient = await query<{ email_ciphertext: unknown; encryption_key_version: string | null }>(
      env.DB_JOBS_FRESH,
      `SELECT email_ciphertext, encryption_key_version
         FROM identity.contact_emails
        WHERE user_id = $1`,
      [row.contact_email_user_id],
    );
    const contact = recipient.rows[0];
    if (!contact) throw new EmailProviderFailure(400, 'E_RECIPIENT_UNAVAILABLE');
    const message = await messageForRow(env, { ...row, email_ciphertext: contact.email_ciphertext, encryption_key_version: contact.encryption_key_version });
    delivery = await sendTransactionalEmail(env, message);
  } catch (error) {
    await markEmailFailure(env, row, error);
    return;
  }
  await query(env.DB_JOBS_FRESH,
    `UPDATE system.transactional_email_outbox
        SET state = 'provider_accepted', provider = $2, provider_message_id = $3,
            accepted_at = $4::timestamptz, secret_ciphertext = NULL,
            secret_encryption_key_version = NULL, updated_at = now()
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
  return result.rowCount === 1;
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
  return Response.json({ accepted: updated });
}
