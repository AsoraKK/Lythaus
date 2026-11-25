import type { EnvBindings } from '@lythaus/cloudflare-env';
import { parseAccessAudiences, verifiedAccessSubject } from './admin-access-runtime-policy.ts';
import adminWorker from './index.ts';
import { handleFirstAdminBootstrap, type FirstAdminBootstrapEnv } from './first-admin-bootstrap-handler.ts';

export const NEW_CORE_TEST_HOSTNAME = 'admin-new-core-test.lythaus.co';
export const NEW_CORE_TEST_READ_ROUTES = new Set([
  '/api/admin/health',
  '/api/admin/moderation/cases',
]);
const BOOTSTRAP_PATH = '/api/admin/bootstrap/first-administrator';

interface Env extends FirstAdminBootstrapEnv {
  DB_ADMIN_FRESH: NonNullable<EnvBindings['DB_ADMIN_FRESH']>;
  DB_PRIVACY_FRESH?: EnvBindings['DB_PRIVACY_FRESH'];
  ASSETS: { fetch(request: Request): Promise<Response> };
  NEW_CORE_ACCESS_ISSUER?: string;
  NEW_CORE_ACCESS_AUDIENCE_SHA256?: string;
}

interface Dependencies {
  adminFetch: (request: Request, env: Env) => Promise<Response>;
  bootstrap: (request: Request, env: Env) => Promise<Response>;
  verifyAccess: (request: Request, env: Env) => Promise<boolean>;
}

function notFound(): Response {
  return new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
}

function addBuildIdentity(response: Response, env: Env): Response {
  if (!response.ok
    || !/^[a-f0-9]{40}$/.test(env.WORKER_VERSION?.tag ?? '')
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env.WORKER_VERSION?.id ?? '')) return response;
  const headers = new Headers(response.headers);
  headers.set('x-lythaus-source-sha', env.WORKER_VERSION.tag);
  headers.set('x-lythaus-worker-version', env.WORKER_VERSION.id);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, { status: response.status, headers });
}

function denied(status: 401 | 503): Response {
  return new Response(null, { status, headers: { 'cache-control': 'private, no-store' } });
}

export async function isExactTestAccessConfiguration(env: Env): Promise<boolean> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN ?? '';
  const issuer = env.NEW_CORE_ACCESS_ISSUER ?? '';
  const audiences = parseAccessAudiences(env.ACCESS_AUDIENCES);
  const expectedAudienceSha256 = env.NEW_CORE_ACCESS_AUDIENCE_SHA256 ?? '';
  if (!/^[a-z0-9.-]+$/i.test(teamDomain)
    || issuer !== `https://${teamDomain}`
    || audiences.length !== 1
    || !/^[a-f0-9]{64}$/.test(expectedAudienceSha256)
    || !env.ACCESS_JWKS_URL) return false;
  let jwksUrl;
  try {
    jwksUrl = new URL(env.ACCESS_JWKS_URL);
  } catch {
    return false;
  }
  if (jwksUrl.protocol !== 'https:' || jwksUrl.host !== teamDomain || jwksUrl.pathname !== '/cdn-cgi/access/certs'
    || jwksUrl.username || jwksUrl.password || jwksUrl.search || jwksUrl.hash) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(audiences[0]));
  const observed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return observed === expectedAudienceSha256;
}

export function createNewCoreTestWorker(dependencies: Dependencies) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.origin !== `https://${NEW_CORE_TEST_HOSTNAME}`
        || env.EXPECTED_HOSTNAMES !== NEW_CORE_TEST_HOSTNAME
        || env.CORS_ALLOWED_ORIGINS !== `https://${NEW_CORE_TEST_HOSTNAME}`) return notFound();
      if (!await isExactTestAccessConfiguration(env)) return denied(503);

      if (request.method === 'POST' && url.pathname === BOOTSTRAP_PATH) {
        return dependencies.bootstrap(request, env);
      }
      if (request.method === 'GET' && NEW_CORE_TEST_READ_ROUTES.has(url.pathname)) {
        return addBuildIdentity(await dependencies.adminFetch(request, env), env);
      }
      if (url.pathname.startsWith('/api/admin/') || !['GET', 'HEAD'].includes(request.method)) return notFound();
      if (!await dependencies.verifyAccess(request, env)) return denied(401);
      return addBuildIdentity(await env.ASSETS.fetch(request), env);
    },
  };
}

const worker = createNewCoreTestWorker({
  adminFetch: (request, env) => adminWorker.fetchIsolatedRead(request, env as Parameters<typeof adminWorker.fetch>[1]),
  bootstrap: (request, env) => handleFirstAdminBootstrap(request, env),
  verifyAccess: async (request, env) => {
    try {
      await verifiedAccessSubject(request, env);
      return true;
    } catch {
      return false;
    }
  },
});

export default worker;
