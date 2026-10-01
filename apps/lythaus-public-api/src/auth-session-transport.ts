export const REFRESH_COOKIE_NAME = '__Host-lythaus_refresh';
export const SESSION_TRANSPORT_HEADER = 'x-lythaus-auth-transport';
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict';

export function validateAuthRequestOrigin(request: Request, allowedOrigins: string | undefined): void {
  if (request.method === 'POST' && new URL(request.url).pathname.startsWith('/api/auth/')) {
    sessionTransport(request, allowedOrigins);
  }
}

export function sessionTransport(request: Request, allowedOrigins: string | undefined): 'cookie' | 'native' {
  const transport = request.headers.get(SESSION_TRANSPORT_HEADER);
  if (transport !== null && transport !== 'cookie-v1') throw new Error('invalid_session_transport');
  const origin = request.headers.get('origin');
  const allowed = (allowedOrigins ?? '').split(',').map(value => value.trim()).filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; }
  });
  if (origin !== null && !allowed.includes(origin)) throw new Error('auth_origin_not_allowed');
  if (transport === 'cookie-v1') {
    if (!origin || !allowed.includes(origin)) throw new Error('auth_origin_not_allowed');
    return 'cookie';
  }
  return 'native';
}

export function optionalRefreshCookie(request: Request): string | undefined {
  const matches = (request.headers.get('cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) throw new Error('refresh_token_invalid');
  const value = matches[0].slice(REFRESH_COOKIE_NAME.length + 1);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) throw new Error('refresh_token_invalid');
  return value;
}

export function refreshCookie(request: Request): string {
  const value = optionalRefreshCookie(request);
  if (value === undefined) throw new Error('refresh_token_invalid');
  return value;
}

export function sessionTransportResult(
  request: Request,
  allowedOrigins: string | undefined,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
): { body: Record<string, unknown>; headers: Record<string, string> } {
  if (sessionTransport(request, allowedOrigins) === 'native') {
    return { body: { ...tokens, tokenType: 'Bearer' }, headers: {} };
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(tokens.refreshToken)) throw new Error('refresh_token_invalid');
  return {
    body: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, tokenType: 'Bearer', sessionTransport: 'cookie-v1' },
    headers: { 'set-cookie': `${REFRESH_COOKIE_NAME}=${tokens.refreshToken}; ${COOKIE_ATTRIBUTES}; Max-Age=2592000` },
  };
}

export function expiredRefreshCookie(): string {
  return `${REFRESH_COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}
