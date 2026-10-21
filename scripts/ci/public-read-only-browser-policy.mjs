const pages = new Set(['/', '/signup', '/sign-in', '/forgot-password',
  '/resend-verification', '/verify-email', '/reset-password', '/privacy']);
const appPages = new Set(['/', '/login']);
const staticFile = /\.(?:js|css|json|wasm|ttf|otf|woff2?|png|svg|ico|webp)$/u;
const appEntrypoint = /^\/(?:main\.dart(?:\.[a-f0-9]{16})?|flutter_bootstrap(?:\.[a-f0-9]{16})?|release-update(?:\.[a-f0-9]{16})?|flutter)\.js$/u;
const appFiles = new Set(['/web-release-assets.json', '/manifest.json', '/version.json', '/favicon.png', '/flutter-semantics.css']);
const marketingBrandAssets = new Set([
  '/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',
  '/icons/lythaus-v1/favicon.116ff3e020c6.svg',
  '/icons/lythaus-v1/favicon-96x96.572a7b9a0d35.png',
  '/icons/lythaus-v1/favicon.e3dfdd675a74.ico',
]);

export function publicReadOnlyRequestPolicy(method, resource) {
  let url;
  try { url = new URL(resource); } catch { return 'invalid_url'; }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'non_read_method';
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return 'invalid_origin';
  if ([...url.searchParams.keys()].some(key => /token|password|secret|credential|authorization/iu.test(key))) {
    return 'sensitive_query';
  }
  const route = url.pathname.replace(/\/$/u, '') || '/';
  if (url.hostname === 'lythaus.co') {
    if (marketingBrandAssets.has(url.pathname)) return url.search ? 'unapproved_asset_query' : null;
    if (pages.has(route) || ((url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/assets/'))
      && staticFile.test(route)) || route === '/favicon.svg' || route === '/favicon.ico') return null;
    return 'unapproved_path';
  }
  if (url.hostname === 'app.lythaus.co') {
    if (appPages.has(route) || appFiles.has(route) || appEntrypoint.test(route)
      || (['/assets/', '/canvaskit/', '/icons/'].some(prefix => route.startsWith(prefix)) && staticFile.test(route))) return null;
    return 'unapproved_path';
  }
  if (url.hostname === 'api.lythaus.co') {
    if (route === '/api/feed/discover' && [...url.searchParams.keys()].every(key => ['limit', 'cursor', 'tag'].includes(key))) return null;
    return 'unapproved_api';
  }
  return 'unapproved_origin';
}

export function publicReadOnlyResource(resource) {
  try { const url = new URL(resource); return url.origin + url.pathname; }
  catch { return 'unparseable_resource'; }
}

export async function installPublicReadOnlyBoundary(context, blocked) {
  await context.routeWebSocket('**/*', socket => {
    blocked.push({ kind: 'websocket', reason: 'websockets_disabled' });
    socket.close();
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const reason = publicReadOnlyRequestPolicy(request.method(), request.url());
    if (reason) {
      blocked.push({ kind: 'http', method: request.method(), resource: publicReadOnlyResource(request.url()), reason });
      return route.abort('blockedbyclient');
    }
    let response;
    try { response = await route.fetch({ maxRedirects: 0 }); }
    catch {
      blocked.push({ kind: 'http', method: request.method(), resource: publicReadOnlyResource(request.url()), reason: 'upstream_read_failed' });
      return route.abort('blockedbyclient');
    }
    if (response.status() >= 300 && response.status() < 400) {
      blocked.push({ kind: 'http', method: request.method(), resource: publicReadOnlyResource(request.url()), reason: 'redirects_disabled' });
      return route.abort('blockedbyclient');
    }
    return route.fulfill({ response });
  });
}
