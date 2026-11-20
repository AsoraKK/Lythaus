import adminWorker from './index.ts';
import { verifiedAccessSubject } from './admin-access-runtime-policy.ts';

const hostname = 'control.lythaus.co';
const origin = 'https://' + hostname;
const panelPaths = new Set(['/', '/flags', '/moderation', '/appeals', '/accounts', '/accounts/management',
  '/users', '/account-support', '/waitlist', '/support', '/authenticity', '/audit', '/production-auth-acceptance',
  '/favicon.ico', '/apple-touch-icon.png']);
type Env = Parameters<typeof adminWorker.fetch>[1] & {
  ASSETS: {fetch(request: Request): Promise<Response>};
  CONTROL_ACCESS_AUDIENCE_SHA256: string;
  CONTROL_ACCESS_ISSUER_SHA256: string;
  ACCESS_REQUIRE_SIGNED_SUBJECT: string;
};

function closed(status: number) {
  return new Response(null, {status,headers:{'cache-control':'private, no-store'}});
}

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Candidate entry point for the replacement Worker. Routes and triggers are installed by the release.
export function createControlWorker(verify = verifiedAccessSubject, adminFetch = adminWorker.fetch) {
  return {async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== origin) return closed(404);
    const audience = env.ACCESS_AUDIENCES ?? '';
    const team = env.ACCESS_TEAM_DOMAIN ?? '';
    const issuer = 'https://' + team;
    if (env.EXPECTED_HOSTNAMES !== hostname || env.CORS_ALLOWED_ORIGINS !== origin
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(team)
      || env.ACCESS_JWKS_URL !== issuer + '/cdn-cgi/access/certs'
      || env.ACCESS_REQUIRE_SIGNED_SUBJECT !== 'true' || !/^[a-f0-9]{64}$/.test(audience)
      || !/^[a-f0-9]{40}$/.test(env.WORKER_VERSION?.tag ?? '')
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(env.WORKER_VERSION?.id ?? '')) return closed(503);
    if (await sha256(audience) !== env.CONTROL_ACCESS_AUDIENCE_SHA256 || await sha256(issuer) !== env.CONTROL_ACCESS_ISSUER_SHA256) return closed(503);
    try { await verify(request, env); } catch { return closed(401); }
    const path = url.pathname;
    let response;
    if (path.startsWith('/api/admin/')) {
      if (/^\/api\/admin\/(?:bootstrap|recovery|production-auth-acceptance)(?:\/|$)/.test(path)) return closed(404);
      response = await adminFetch(request, env);
    } else {
      if ((!panelPaths.has(path) && !/^\/(assets|icons|brand)\//.test(path))
        || (request.method !== 'GET' && request.method !== 'HEAD')) return closed(404);
      response = await env.ASSETS.fetch(request);
    }
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store');
    if (response.ok) {
      headers.set('x-lythaus-worker-version', env.WORKER_VERSION.id);
      headers.set('x-lythaus-source-sha', env.WORKER_VERSION.tag!);
    }
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }};
}

export default createControlWorker();
