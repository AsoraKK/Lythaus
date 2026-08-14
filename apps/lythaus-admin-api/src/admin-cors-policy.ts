const ADMIN_CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ADMIN_CORS_HEADERS = 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID';

function configuredOrigins(value?: string): Set<string> {
  const origins = new Set<string>();
  for (const candidate of (value ?? '').split(',')) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.origin === trimmed && ['http:', 'https:'].includes(url.protocol)) origins.add(url.origin);
    } catch {}
  }
  return origins;
}

export function allowedAdminOrigin(origin: string | null, configured: string | undefined): string | undefined {
  if (!origin) return undefined;
  return configuredOrigins(configured).has(origin) ? origin : undefined;
}

function isJsonContentType(value: string | null): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

/**
 * CORS controls response visibility, not request delivery. Require the
 * configured control-panel origin and JSON media type before mutation routes
 * read a body or begin a transaction.
 */
export function assertAdminMutationRequest(request: Request, configured: string | undefined): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || allowedAdminOrigin(origin, configured) !== origin) {
    throw new Error('admin_mutation_origin_invalid');
  }
  if (!isJsonContentType(request.headers.get('content-type'))) {
    throw new Error('admin_mutation_content_type_invalid');
  }
}

function addOriginVary(headers: Headers): void {
  const values = (headers.get('vary') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === 'origin')) values.push('Origin');
  headers.set('vary', values.join(', '));
}

export function withAdminCors(request: Request, configured: string | undefined, response: Response): Response {
  const origin = allowedAdminOrigin(request.headers.get('origin'), configured);
  if (!origin) return response;
  response.headers.set('access-control-allow-origin', origin);
  response.headers.set('access-control-allow-credentials', 'true');
  response.headers.set('access-control-expose-headers', 'X-Correlation-ID');
  addOriginVary(response.headers);
  return response;
}

export function adminCorsPreflight(request: Request, configured: string | undefined): Response {
  const origin = allowedAdminOrigin(request.headers.get('origin'), configured);
  if (!origin) return new Response(null, { status: 403, headers: { vary: 'Origin' } });
  const response = new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-methods': ADMIN_CORS_METHODS,
      'access-control-allow-headers': ADMIN_CORS_HEADERS,
      'access-control-max-age': '600',
    },
  });
  return withAdminCors(request, configured, response);
}
