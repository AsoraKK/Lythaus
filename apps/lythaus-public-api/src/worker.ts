import { WorkerEntrypoint } from 'cloudflare:workers';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { handleEmailEnvelope } from './email-envelope-entrypoint.ts';
import { handleAccountSupportLookup } from './account-support-entrypoint.ts';
export { default } from './index.ts';

export class AuthEmailEnvelope extends WorkerEntrypoint<EnvBindings> {
  fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/keeper-account-support/lookup') return handleAccountSupportLookup(request, this.env);
    return handleEmailEnvelope(request, this.env);
  }
}
