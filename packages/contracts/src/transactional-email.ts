export type TransactionalEmailPurpose = 'verification' | 'password_reset' | 'invite' | 'email_change';

export type TransactionalEmailState =
  | 'queued'
  | 'processing'
  | 'provider_accepted'
  | 'delivered'
  | 'deferred'
  | 'bounced'
  | 'rejected'
  | 'failed'
  | 'cancelled'
  | 'complained';

export type EmailProviderFailureCategory = 'transient' | 'permanent' | 'unknown';

export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface TransactionalEmailDelivery extends EmailDeliveryReference {
  providerMessageId: string;
}

export interface TransactionalEmailTransport {
  send(message: TransactionalEmailMessage): Promise<TransactionalEmailDelivery>;
}

export interface EmailProviderFailureDetails {
  status?: number;
  code?: string;
  category: EmailProviderFailureCategory;
}

const PERMANENT_PROVIDER_CODES = new Set([
  'E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_DOMAIN_NOT_VERIFIED',
  'E_INVALID_PARAMETER',
  'E_MESSAGE_TOO_LARGE',
]);

export function classifyEmailProviderFailure(input: { status?: unknown; code?: unknown; accepted?: boolean }): EmailProviderFailureDetails {
  const status = Number(input.status);
  const normalizedStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  const code = typeof input.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(input.code) ? input.code : undefined;
  if (input.accepted === true) return { status: normalizedStatus, code, category: 'unknown' };
  if (code && PERMANENT_PROVIDER_CODES.has(code)) return { status: normalizedStatus, code, category: 'permanent' };
  if (normalizedStatus !== undefined && (normalizedStatus === 408 || normalizedStatus === 425 || normalizedStatus === 429 || normalizedStatus >= 500)) {
    return { status: normalizedStatus, code, category: 'transient' };
  }
  if (normalizedStatus !== undefined && normalizedStatus >= 400) return { status: normalizedStatus, code, category: 'permanent' };
  return { status: normalizedStatus, code, category: 'unknown' };
}

export function nextTransactionalEmailState(input: {
  category: EmailProviderFailureCategory;
  attemptCount: number;
  nowMs?: number;
  maxAttempts?: number;
}): { state: 'queued' | 'failed'; nextAttemptAt: number | null } {
  const nowMs = input.nowMs ?? Date.now();
  const maxAttempts = input.maxAttempts ?? 8;
  if (input.category === 'permanent' || input.attemptCount >= maxAttempts) return { state: 'failed', nextAttemptAt: null };
  const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.max(0, input.attemptCount - 1));
  return { state: 'queued', nextAttemptAt: nowMs + delayMs };
}

export function lifecycleStateForEmailEvent(eventType: string): TransactionalEmailState | undefined {
  return ({
    'message.delivered': 'delivered',
    'message.deferred': 'deferred',
    'message.bounced': 'bounced',
    'message.failed': 'failed',
    'message.rejected': 'rejected',
    'message.complained': 'complained',
  } as Record<string, TransactionalEmailState>)[eventType];
}

export interface EmailDeliveryReference {
  provider: string;
  messageId: string;
  acceptedAt: string;
}

export function renderTransactionalEmail(input: {
  purpose: TransactionalEmailPurpose;
  token: string;
  verificationBaseUrl?: string;
  resetBaseUrl?: string;
  acceptanceLinkBaseUrl?: string;
  acceptanceContext?: string;
}): TransactionalEmailMessage {
  const subject = input.purpose === 'password_reset'
    ? 'Reset your Lythaus password'
    : input.purpose === 'email_change'
      ? 'Confirm your Lythaus email change'
      : input.purpose === 'invite' ? 'Your Lythaus invitation' : 'Verify your Lythaus email';
  const baseUrl = input.purpose === 'password_reset' ? input.resetBaseUrl : input.verificationBaseUrl;
  const url = input.acceptanceContext && input.acceptanceLinkBaseUrl
    ? `${input.acceptanceLinkBaseUrl}${encodeURIComponent(input.acceptanceContext)}&purpose=${encodeURIComponent(input.purpose)}&token=${encodeURIComponent(input.token)}`
    : baseUrl ? `${baseUrl}${encodeURIComponent(input.token)}` : '';
  const safeUrl = url.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value] ?? value));
  const guidance = input.purpose === 'invite'
    ? 'Confirm your email, then use Forgot password on the sign-in page to choose your Lythaus password.'
    : '';
  return {
    to: '',
    subject,
    html: `<p>${subject}.</p>${guidance ? `<p>${guidance}</p>` : ''}${safeUrl ? `<p><a href="${safeUrl}">Continue securely</a></p>` : ''}`,
    text: `${subject}.${guidance ? ` ${guidance}` : ''}${url ? ` ${url}` : ''}`,
  };
}
