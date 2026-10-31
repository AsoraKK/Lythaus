const APP_ORIGIN = 'https://app.lythaus.co';
const API_ORIGIN = 'https://api.lythaus.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_PATHS = new Set([
  '/api/auth/userinfo', '/api/users/me', '/api/users/me/posts', '/api/feed/discover', '/api/custom-feeds',
  '/api/subscription/status', '/api/users/me/reputation', '/api/reputation/me', '/api/rewards/me/monthly',
]);
const AUTH_POST_PATHS = new Set(['/api/auth/email', '/api/auth/refresh', '/api/auth/logout']);

/**
 * Restrict a real-browser acceptance to the local app artifact, the canonical
 * API reads used by its sign-in journey, and session-only authentication
 * writes. Unknown destinations and all feedback or content writes are denied.
 */
export function classifyAppAuthRequest(rawUrl, method, { ownerId, preflightMethod } = {}) {
  let url;
  try { url = new URL(rawUrl); } catch { return 'DENY'; }
  if (url.username || url.password || url.hash || typeof method !== 'string') return 'DENY';
  const verb = method.toUpperCase();
  if (url.origin === APP_ORIGIN) return ['GET', 'HEAD'].includes(verb) ? 'ARTIFACT' : 'DENY';
  if (url.origin !== API_ORIGIN) return 'DENY';
  const allowedOwnerPath = typeof ownerId === 'string' && UUID.test(ownerId)
    && url.pathname.toLowerCase() === `/api/users/${ownerId.toLowerCase()}`;
  const allowedRead = READ_PATHS.has(url.pathname) || allowedOwnerPath;
  const allowedPost = AUTH_POST_PATHS.has(url.pathname);
  if (allowedPost && url.search) return 'DENY';
  if (verb === 'GET' && allowedRead) return 'API';
  if (verb === 'POST' && allowedPost) return 'API';
  if (verb === 'OPTIONS' && typeof preflightMethod === 'string') {
    const requested = preflightMethod.toUpperCase();
    if ((requested === 'GET' && allowedRead) || (requested === 'POST' && allowedPost)) return 'API';
  }
  return 'DENY';
}

/** An allowed auth endpoint can also register or resend mail. Restrict its
 * body to the intended login and require cookie-only refresh/logout. */
export function allowsAppAuthPostBody(pathname, rawBody, { email, password } = {}) {
  if (typeof rawBody !== 'string' || Buffer.byteLength(rawBody, 'utf8') > 16384) return false;
  let body;
  try { body = JSON.parse(rawBody); } catch { return false; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body).sort();
  if (pathname === '/api/auth/email') {
    return JSON.stringify(keys) === JSON.stringify(['email', 'mode', 'password'])
      && body.mode === 'login' && typeof email === 'string' && body.email === email.trim()
      && typeof password === 'string' && body.password === password;
  }
  return ['/api/auth/refresh', '/api/auth/logout'].includes(pathname) && keys.length === 0;
}

/** route.fulfill can mask browser CORS failures, so validate the actual
 * upstream response before returning it to the browser. */
export function allowsAppAuthCors(responseHeaders, requestHeaders, method) {
  if (responseHeaders?.['access-control-allow-origin'] !== APP_ORIGIN
    || responseHeaders?.['access-control-allow-credentials']?.toLowerCase() !== 'true') return false;
  if (method !== 'OPTIONS') return true;
  const entries = value => typeof value === 'string' ? value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];
  const requestedMethod = requestHeaders?.['access-control-request-method']?.toLowerCase();
  const requestedHeaders = entries(requestHeaders?.['access-control-request-headers']);
  const allowedMethods = entries(responseHeaders?.['access-control-allow-methods']);
  const allowedHeaders = entries(responseHeaders?.['access-control-allow-headers']);
  return Boolean(requestedMethod) && allowedMethods.includes(requestedMethod) && requestedHeaders.every(header => allowedHeaders.includes(header));
}
