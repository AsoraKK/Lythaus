import { Container, getContainer } from '@cloudflare/containers';
import { AUTHENTICITY_ALPHA_MODES, DEFAULT_AUTHENTICITY_ALPHA_MODE, EVIDENCE_COMPILER_VERSION, type AuthenticityAlphaMode } from '@lythaus/authenticity/alpha';
import { DYNAMIC_EVIDENCE_COMPILER_VERSION } from '@lythaus/authenticity/wp007g';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface Env {
  AUTHENTICITY_CONTAINER: DurableObjectNamespace;
  LYTHAUS_AUTHENTICITY_ALPHA_MODE?: string;
  DETECTOR_REGISTRY_VERSION?: string;
  AUTHENTICITY_ALPHA_INTERNAL_SECRET?: string;
}

function alphaMode(env: Env): AuthenticityAlphaMode {
  const value = env.LYTHAUS_AUTHENTICITY_ALPHA_MODE ?? DEFAULT_AUTHENTICITY_ALPHA_MODE;
  if (!AUTHENTICITY_ALPHA_MODES.includes(value as AuthenticityAlphaMode)) throw new Error('authenticity_alpha_mode_invalid');
  return value as AuthenticityAlphaMode;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function internalAuthorized(request: Request, env: Env): boolean {
  const expected = env.AUTHENTICITY_ALPHA_INTERNAL_SECRET;
  if (!expected) return false;
  const supplied = request.headers.get('authorization');
  return supplied === `Bearer ${expected}`;
}

export class LythausAuthenticityAlphaContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '5m';
  enableInternet = false;
  pingEndpoint = '/health';
  envVars = { NODE_ENV: 'production', LYTHAUS_AUTHENTICITY_ALPHA_MODE: 'SHADOW' };

  override async fetch(request: Request): Promise<Response> {
    return this.containerFetch(request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let mode: AuthenticityAlphaMode;
    try { mode = alphaMode(env); } catch { return json({ status: 'misconfigured' }, 500); }
    if (url.pathname === '/health') return json({ status: 'ok', mode, compilerVersion: DYNAMIC_EVIDENCE_COMPILER_VERSION, legacyCompilerVersion: EVIDENCE_COMPILER_VERSION, registryVersion: env.DETECTOR_REGISTRY_VERSION ?? null, enforcementAuthority: 'NONE' });
    if (url.pathname !== '/score' || request.method !== 'POST') return json({ error: 'not_found' }, 404);
    if (mode === 'OFF') return json({ status: 'disabled', analysisStatus: 'DISABLED', label: null }, 200);
    if (!internalAuthorized(request, env)) return json({ error: 'internal_authentication_required' }, 401);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) return json({ error: 'image_payload_too_large' }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_IMAGE_BYTES) return json({ error: 'image_payload_invalid' }, 400);
    const container = getContainer(env.AUTHENTICITY_CONTAINER, 'alpha-detector');
    const response = await container.fetch(new Request('http://authenticity/score', {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/octet-stream',
        'content-length': String(body.byteLength),
        'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID(),
      },
      body,
    }));
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  },
};
