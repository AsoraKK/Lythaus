import { normalizeEmailAddress } from './auth-runtime-policy.ts';
import { readBoundedJson } from './request-body-runtime.ts';

export const WAITLIST_CONSENT_VERSION = 'waitlist-v1';
export const WAITLIST_SOURCE = 'lythaus.co';
export const WAITLIST_TURNSTILE_ACTION = 'waitlist_signup';
export const WAITLIST_MAX_BODY_BYTES = 8 * 1024;

export interface WaitlistSubmission {
  email: string;
  turnstileToken: string;
  consentVersion: typeof WAITLIST_CONSENT_VERSION;
}

export interface WaitlistSecrets {
  encryptionKey: string;
  hmacKey: string;
  turnstileSecret: string;
  turnstileExpectedHostnames: string;
}

interface TurnstileResult {
  success?: boolean;
  action?: string;
  hostname?: string;
}

function isJsonContentType(value: string | null): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

export function parseWaitlistSubmission(input: unknown): WaitlistSubmission {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_json');
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !['email', 'turnstileToken', 'consentVersion', 'source'].includes(key))) {
    throw new Error('invalid_json');
  }
  const turnstileToken = typeof candidate.turnstileToken === 'string' ? candidate.turnstileToken : '';
  if (turnstileToken.length < 10 || turnstileToken.length > 4096) throw new Error('turnstile_required');
  if (candidate.consentVersion !== WAITLIST_CONSENT_VERSION) throw new Error('invalid_consent_version');
  return {
    email: normalizeEmailAddress(candidate.email),
    turnstileToken,
    consentVersion: WAITLIST_CONSENT_VERSION,
  };
}

export async function parseWaitlistRequest(request: Request): Promise<WaitlistSubmission> {
  if (request.method !== 'POST') throw new Error('method_not_allowed');
  if (!isJsonContentType(request.headers.get('content-type'))) throw new Error('unsupported_content_type');
  return parseWaitlistSubmission(await readBoundedJson<unknown>(request, WAITLIST_MAX_BODY_BYTES));
}

export function requireWaitlistSecrets(input: {
  PII_ENCRYPTION_KEY_V1?: string;
  PII_HMAC_KEY_V1?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAMES?: string;
}): WaitlistSecrets {
  if (!input.PII_ENCRYPTION_KEY_V1 || !input.PII_HMAC_KEY_V1 || !input.TURNSTILE_SECRET_KEY || !input.TURNSTILE_EXPECTED_HOSTNAMES) {
    throw new Error('waitlist_unavailable');
  }
  return {
    encryptionKey: input.PII_ENCRYPTION_KEY_V1,
    hmacKey: input.PII_HMAC_KEY_V1,
    turnstileSecret: input.TURNSTILE_SECRET_KEY,
    turnstileExpectedHostnames: input.TURNSTILE_EXPECTED_HOSTNAMES,
  };
}

export function validateWaitlistTurnstileResult(result: TurnstileResult, expectedHostnames: string): void {
  const hostnames = new Set(expectedHostnames.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (hostnames.size === 0) throw new Error('waitlist_unavailable');
  if (result.success !== true
    || result.action !== WAITLIST_TURNSTILE_ACTION
    || typeof result.hostname !== 'string'
    || !hostnames.has(result.hostname.toLowerCase())) {
    throw new Error('turnstile_failed');
  }
}

export async function verifyWaitlistTurnstile(input: {
  token: string;
  secret: string;
  expectedHostnames: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: input.secret, response: input.token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('turnstile_unavailable');
  }
  if (!response.ok) throw new Error('turnstile_unavailable');
  let result: TurnstileResult;
  try {
    result = await response.json() as TurnstileResult;
  } catch {
    throw new Error('turnstile_unavailable');
  }
  validateWaitlistTurnstileResult(result, input.expectedHostnames);
}
