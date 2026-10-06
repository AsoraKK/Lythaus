import type { EnvBindings } from '@lythaus/cloudflare-env';
import { logEvent } from '@lythaus/observability';
import { createTransactionalEmailDispatchMessage } from '../../../packages/security/src/transactional-email-dispatch.ts';

export async function publishCommittedEmailDispatch(env: EnvBindings, outboxId?: string): Promise<'skipped' | 'published' | 'deferred'> {
  if (!outboxId || env.TRANSACTIONAL_EMAIL_DISPATCH_ENABLED !== 'true') return 'skipped';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!env.TRANSACTIONAL_EMAIL_DISPATCH_QUEUE || !env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1) throw new Error('email_dispatch_not_configured');
    const message = await createTransactionalEmailDispatchMessage(outboxId, env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1);
    await Promise.race([
      env.TRANSACTIONAL_EMAIL_DISPATCH_QUEUE.send(message),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('email_dispatch_deferred')), 3000); }),
    ]);
    return 'published';
  } catch {
    logEvent({ service: 'lythaus-public-api', event: 'transactional_email_dispatch_deferred' });
    return 'deferred';
  } finally { clearTimeout(timer); }
}
