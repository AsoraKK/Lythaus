import { WorkerEntrypoint } from 'cloudflare:workers';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { handleEmailEnvelope } from './email-envelope-entrypoint.ts';
export { default } from './index.ts';

export class AuthEmailEnvelope extends WorkerEntrypoint<EnvBindings> {
  fetch(request: Request): Promise<Response> {
    return handleEmailEnvelope(request, this.env);
  }
}
