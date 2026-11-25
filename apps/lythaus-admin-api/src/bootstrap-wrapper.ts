import type { EnvBindings } from '@lythaus/cloudflare-env';
import adminWorker from './index.ts';
import { handleFirstAdminBootstrap } from './first-admin-bootstrap-handler.ts';
import { SUBJECT_DIAGNOSTIC_PATH, handleSubjectDiagnostic } from './solo-recovery/subject-diagnostic.ts';
import { SUBJECT_REBIND_PATH, handleSubjectRebind } from './solo-recovery/subject-rebind.ts';

interface Env extends EnvBindings {
  WORKER_VERSION: NonNullable<EnvBindings['WORKER_VERSION']>;
  DB_ADMIN_FRESH: NonNullable<EnvBindings['DB_ADMIN_FRESH']>;
  DB_PRIVACY_FRESH: NonNullable<EnvBindings['DB_PRIVACY_FRESH']>;
  ACCESS_AUDIENCES?: string;
}

const BOOTSTRAP_PATH = '/api/admin/bootstrap/first-administrator';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === SUBJECT_REBIND_PATH) return handleSubjectRebind(request, env);
    if (new URL(request.url).pathname === SUBJECT_DIAGNOSTIC_PATH) return handleSubjectDiagnostic(request, env);
    if (new URL(request.url).pathname === BOOTSTRAP_PATH) {
      return handleFirstAdminBootstrap(request, env);
    }
    const result = await adminWorker.fetch(request, env);
    if (request.method === 'GET' && result.ok && ['/api/admin/health', '/api/admin/moderation/cases'].includes(new URL(request.url).pathname)
      && /^[a-f0-9]{40}$/.test(env.WORKER_VERSION?.tag ?? '')
      && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env.WORKER_VERSION?.id ?? '')) {
      const headers = new Headers(result.headers);
      headers.set('x-lythaus-source-sha', env.WORKER_VERSION.tag!);
      headers.set('x-lythaus-worker-version', env.WORKER_VERSION.id);
      return new Response(result.body, { status: result.status, headers });
    }
    return result;
  },
};
