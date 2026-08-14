import type { HyperdriveBinding } from '@lythaus/db';
import { json, correlationId, logEvent } from '@lythaus/observability';
import { encryptField, hmacLookup, uuidv7, type EncryptedField } from '@lythaus/security';
import { classifyPublicError } from './auth-runtime-policy.ts';
import {
  parseWaitlistRequest,
  requireWaitlistSecrets,
  verifyWaitlistTurnstile,
  WAITLIST_SOURCE,
} from './waitlist-runtime-policy.ts';

export interface WaitlistRouteEnv {
  DB_APP_FRESH: HyperdriveBinding;
  PII_ENCRYPTION_KEY_V1?: string;
  PII_HMAC_KEY_V1?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAMES?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

type WaitlistQuery = (
  binding: HyperdriveBinding,
  text: string,
  values: readonly unknown[],
) => Promise<{ rowCount: number | null }>;

export interface WaitlistHandlerDependencies {
  query: WaitlistQuery;
  parseRequest: typeof parseWaitlistRequest;
  requireSecrets: typeof requireWaitlistSecrets;
  verifyTurnstile: typeof verifyWaitlistTurnstile;
  hmacLookup: typeof hmacLookup;
  encryptField: (plaintext: string, base64Key: string, encryptionKeyVersion: string) => Promise<EncryptedField>;
  uuidv7: typeof uuidv7;
  logEvent: typeof logEvent;
  correlationId: typeof correlationId;
  classifyPublicError: typeof classifyPublicError;
  json: typeof json;
  now: () => number;
}

function allowedCorsOrigin(request: Request, env: WaitlistRouteEnv): string | undefined {
  const origin = request.headers.get('origin');
  return origin && (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).includes(origin)
    ? origin
    : undefined;
}

function routeResponse(
  dependencies: WaitlistHandlerDependencies,
  request: Request,
  env: WaitlistRouteEnv,
  correlation: string,
  body: unknown,
  init: ResponseInit = {},
): Response {
  const requestedCacheControl = new Headers(init.headers).get('cache-control');
  const result = dependencies.json(body, init);
  if (requestedCacheControl) result.headers.set('cache-control', requestedCacheControl);
  const origin = allowedCorsOrigin(request, env);
  if (origin) {
    result.headers.set('access-control-allow-origin', origin);
    result.headers.set('access-control-allow-credentials', 'true');
  }
  result.headers.set('x-correlation-id', correlation);
  result.headers.set('vary', 'Origin, Authorization');
  return result;
}

async function enforceWaitlistRateLimit(
  request: Request,
  env: WaitlistRouteEnv,
  hmacKey: string,
  dependencies: WaitlistHandlerDependencies,
): Promise<void> {
  const abuseSubject = request.headers.get('cf-connecting-ip') ?? 'anonymous';
  const subjectHash = dependencies.hmacLookup(`waitlist:${abuseSubject}`, hmacKey);
  const windowStartedAt = new Date(Math.floor(dependencies.now() / 60_000) * 60_000).toISOString();
  const result = await dependencies.query(env.DB_APP_FRESH,
    `INSERT INTO system.rate_limit_windows (scope, subject_hash, window_started_at, request_count, expires_at)
     VALUES ('waitlist-signup', $1, $2, 1, $2::timestamptz + interval '2 minutes')
     ON CONFLICT (scope, subject_hash, window_started_at)
     DO UPDATE SET request_count = system.rate_limit_windows.request_count + 1
     WHERE system.rate_limit_windows.request_count < 5
     RETURNING request_count`, [subjectHash, windowStartedAt]);
  if (result.rowCount !== 1) throw new Error('rate_limit_exceeded');
}

async function joinWaitlist(
  request: Request,
  env: WaitlistRouteEnv,
  dependencies: WaitlistHandlerDependencies,
  correlation: string,
): Promise<Response> {
  const submission = await dependencies.parseRequest(request);
  const secrets = dependencies.requireSecrets(env);
  await enforceWaitlistRateLimit(request, env, secrets.hmacKey, dependencies);
  await dependencies.verifyTurnstile({
    token: submission.turnstileToken,
    secret: secrets.turnstileSecret,
    expectedHostnames: secrets.turnstileExpectedHostnames,
  });
  try {
    const emailHmac = dependencies.hmacLookup(submission.email, secrets.hmacKey);
    const encrypted = await dependencies.encryptField(submission.email, secrets.encryptionKey, 'v1');
    await dependencies.query(env.DB_APP_FRESH,
      `INSERT INTO marketing.waitlist_signups
         (id, email_lookup_hmac, email_ciphertext, encryption_key_version, status, source, consent_version)
       VALUES ($1, decode($2, 'base64'), convert_to($3, 'utf8'), $4, 'waiting', $5, $6)
       ON CONFLICT DO NOTHING`,
      [dependencies.uuidv7(), emailHmac, encrypted.ciphertext, encrypted.encryptionKeyVersion, WAITLIST_SOURCE, submission.consentVersion]);
  } catch {
    throw new Error('waitlist_unavailable');
  }
  dependencies.logEvent({
    service: 'lythaus-public-api',
    event: 'marketing.waitlist_signup_processed',
    correlationId: correlation,
    result: 'success',
    source: WAITLIST_SOURCE,
  });
  return routeResponse(dependencies, request, env, correlation, { ok: true, status: 'waitlisted' }, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}

export function createWaitlistRouteHandler(dependencies: WaitlistHandlerDependencies) {
  return async (request: Request, env: WaitlistRouteEnv): Promise<Response> => {
    const correlation = dependencies.correlationId(request);
    try {
      if (request.method !== 'POST') throw new Error('method_not_allowed');
      return await joinWaitlist(request, env, dependencies, correlation);
    } catch (error) {
      const classified = dependencies.classifyPublicError(error);
      dependencies.logEvent({
        service: 'lythaus-public-api',
        correlationId: correlation,
        errorCode: classified.exposedCode,
        internalErrorCode: classified.internalCode,
        route: new URL(request.url).pathname,
      });
      const result = routeResponse(dependencies, request, env, correlation, {
        error: classified.exposedCode,
        correlationId: correlation,
      }, { status: classified.status });
      result.headers.set('cache-control', 'private, no-store');
      return result;
    }
  };
}
