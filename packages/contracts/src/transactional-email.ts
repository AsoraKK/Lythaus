export type TransactionalEmailPurpose = 'verification' | 'password_reset' | 'invite' | 'email_change' | 'password_changed';

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
  'E_SENDER_DOMAIN_NOT_AVAILABLE', 'E_VALIDATION_ERROR', 'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS', 'E_TOO_MANY_ATTACHMENTS', 'E_CONTENT_TOO_LARGE',
  'E_HEADER_NOT_ALLOWED', 'E_HEADER_USE_API_FIELD', 'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG', 'E_HEADER_NAME_INVALID', 'E_HEADERS_TOO_LARGE', 'E_HEADERS_TOO_MANY',
]);
const TRANSIENT_PROVIDER_CODES = new Set(['E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED', 'E_INTERNAL_SERVER_ERROR']);

export function classifyEmailProviderFailure(input: { status?: unknown; code?: unknown; accepted?: boolean }): EmailProviderFailureDetails {
  const status = Number(input.status);
  const normalizedStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  const code = typeof input.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(input.code) ? input.code : undefined;
  if (input.accepted === true) return { status: normalizedStatus, code, category: 'unknown' };
  if (code && PERMANENT_PROVIDER_CODES.has(code)) return { status: normalizedStatus, code, category: 'permanent' };
  if (code && TRANSIENT_PROVIDER_CODES.has(code)) return { status: normalizedStatus, code, category: 'transient' };
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
  random?: () => number;
}): { state: 'queued' | 'failed'; nextAttemptAt: number | null } {
  const nowMs = input.nowMs ?? Date.now();
  const maxAttempts = input.maxAttempts ?? 8;
  if (input.category !== 'transient' || input.attemptCount >= maxAttempts) return { state: 'failed', nextAttemptAt: null };
  const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.max(0, input.attemptCount - 1));
  const jitter = Math.max(0, Math.min(1, (input.random ?? Math.random)()));
  return { state: 'queued', nextAttemptAt: nowMs + delayMs + Math.floor(delayMs * 0.2 * jitter) };
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

export function transactionalEmailLink(input: {
  baseUrl: string | undefined;
  acceptance: boolean;
  parameters: Record<string, string>;
  environment?: string;
}): string {
  let url: URL;
  try { url = new URL(input.baseUrl ?? ''); } catch { throw new Error('email_link_configuration_invalid'); }
  const local = input.environment === 'local' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  const hosts = input.acceptance ? ['admin.lythaus.co'] : ['lythaus.co', 'www.lythaus.co'];
  const paths = input.acceptance ? ['/api/admin/production-auth-acceptance/email'] : ['/verify-email', '/reset-password'];
  let unsafeQuery = false;
  url.searchParams.forEach((value, key) => { if (!['token', 'context'].includes(key) || value !== '') unsafeQuery = true; });
  if ((!local && (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port))
    || url.username || url.password || !paths.includes(url.pathname)
    || unsafeQuery
    || url.hash) throw new Error('email_link_configuration_invalid');
  url.search = '';
  url.hash = new URLSearchParams(input.parameters).toString();
  return url.toString();
}

export function renderTransactionalEmail(input: {
  purpose: TransactionalEmailPurpose;
  token: string;
  verificationBaseUrl?: string;
  resetBaseUrl?: string;
  acceptanceLinkBaseUrl?: string;
  acceptanceContext?: string;
  environment?: string;
}): TransactionalEmailMessage {
  if (input.purpose === 'password_changed') {
    const text = 'Your Lythaus password changed. Existing sessions were revoked. If you did not make this change, open https://lythaus.co/forgot-password to recover your account and contact Lythaus support. We will never ask you to send your password.';
    return { to: '', subject: 'Your Lythaus password changed', text, html: `<!doctype html><html lang="en"><body><h1>Your Lythaus password changed</h1><p>${text}</p></body></html>` };
  }
  const subject = input.purpose === 'password_reset'
    ? 'Reset your Lythaus password'
    : input.purpose === 'email_change'
      ? 'Confirm your Lythaus email change'
      : input.purpose === 'invite' ? 'Your Lythaus invitation' : 'Verify your Lythaus email';
  const baseUrl = input.purpose === 'password_reset' ? input.resetBaseUrl : input.verificationBaseUrl;
  const acceptance = Boolean(input.acceptanceContext);
  const url = transactionalEmailLink({
    baseUrl: acceptance ? input.acceptanceLinkBaseUrl : baseUrl,
    acceptance,
    environment: input.environment,
    parameters: acceptance ? { context: input.acceptanceContext!, purpose: input.purpose, token: input.token } : { token: input.token },
  });
  const safeUrl = url.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value] ?? value));
  const guidance = input.purpose === 'password_reset'
    ? 'Choose a new password. This link expires in 30 minutes and can be used once.'
    : 'Confirm your email and choose your own password to finish setup. This link expires in 30 minutes and can be used once.';
  const unsolicited = 'If you did not request this, do not confirm it. You can ignore this message. Never share this link or your password.';
  return {
    to: '',
    subject,
    html: `<!doctype html><html lang="en"><body><h1>${subject}</h1><p>${guidance}</p><p><a href="${safeUrl}">Continue securely at Lythaus</a></p><p>If the button does not open, copy the link into your browser: ${safeUrl}</p><p>${unsolicited}</p></body></html>`,
    text: `${subject}. ${guidance}\nContinue securely at Lythaus: ${url}\n${unsolicited}`,
  };
}
