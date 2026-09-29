import type { EnvBindings } from '@lythaus/cloudflare-env';
import { readBoundedJson } from './request-body-policy.ts';

const SAFE_ERRORS = ['user_email_exists', 'user_not_found', 'email_already_verified', 'invalid_account_status', 'admin_role_required'];
export async function dispatchKeeperEmail(env: EnvBindings, request: Request, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!env.AUTH_EMAIL_ENVELOPE) throw new Error('auth_email_dispatch_unavailable');
  const overrides = request.headers.get('Cloudflare-Workers-Version-Overrides') ?? '';
  const candidate = /(?:^|,\s*)lythaus-public-api-development="([0-9a-f-]{36})"(?:\s*(?:,|$))/i.exec(overrides)?.[1];
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await env.AUTH_EMAIL_ENVELOPE!.fetch('https://lythaus-public.internal/keeper-email', {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', ...(candidate ? { 'Cloudflare-Workers-Version-Overrides': `lythaus-public-api-development="${candidate}"` } : {}) },
          body: JSON.stringify(input),
        });
        const body = await readBoundedJson<{ workerVersion: string; result?: Record<string, unknown>; error?: string }>(response, 4096);
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.workerVersion)
          || (candidate && body.workerVersion !== candidate)) throw new Error('auth_email_dispatch_unavailable');
        if (!response.ok) throw new Error(SAFE_ERRORS.includes(body.error ?? '') ? body.error : 'auth_email_dispatch_unavailable');
        if (input.operation === 'probe') {
          if (!candidate || body.result?.bindingVerified !== true) throw new Error('auth_email_dispatch_unavailable');
          return { bindingVerified: true, publicWorkerVersion: body.workerVersion };
        }
        if (!body.result || typeof body.result.userId !== 'string'
          || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.result.userId)
          || !['queued', 'cooldown'].includes(String(body.result.deliveryState))) throw new Error('auth_email_dispatch_unavailable');
        return { userId: body.result.userId, ...(input.operation === 'invite'
          ? { status: 'relink_required', verificationState: 'pending_verification' }
          : { deliveryState: body.result.deliveryState }) };
      })(),
      new Promise<never>((_, reject) => { deadline = setTimeout(() => { controller.abort(); reject(new Error('auth_email_dispatch_unavailable')); }, 5000); }),
    ]);
  } catch (error) {
    if (error instanceof Error && SAFE_ERRORS.includes(error.message)) throw error;
    throw new Error('auth_email_dispatch_unavailable');
  } finally { clearTimeout(deadline); }
}
