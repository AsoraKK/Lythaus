import { TARGET } from './lythaus-new-core-isolation-review.mjs';

export async function verifyAnonymousTestGate(issuer, fetchImpl = fetch) {
  if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(issuer)) {
    throw new Error('setup_edge_issuer_invalid');
  }
  for (const path of ['/flags', '/api/admin/moderation/cases']) {
    const url = 'https://' + TARGET.hostname + path;
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    await response.body?.cancel();
    let challenge;
    try { challenge = new URL(response.headers.get('location'), url); } catch {}
    if (![302, 303, 307].includes(response.status) || challenge?.origin !== issuer
      || !challenge.pathname.startsWith('/cdn-cgi/access/login/') || challenge.username || challenge.password) {
      throw new Error('setup_anonymous_access_challenge_unverified');
    }
  }
  return true;
}
