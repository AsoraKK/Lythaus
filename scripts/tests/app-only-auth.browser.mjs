import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { runAppOnlyAuthBrowser } from '../ci/app-only-auth-browser.mjs';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';

const artifactDir = process.env.APP_ONLY_AUTH_SYNTHETIC_ARTIFACT;
const user = { id: '018f0000-0000-7000-8000-000000000001', email: 'synthetic@example.invalid', role: 'user',
  tier: 'bronze', subscription_tier: 'free', reputation_score: 0, created_at: '2026-08-01T00:00:00Z', last_login_at: '2026-08-01T00:00:00Z' };

for (const scenario of ['normal', 'missing-discover-cors', 'redirect-login']) test(
  scenario === 'missing-discover-cors' ? 'a synthetic Discover CORS failure cannot pass browser acceptance'
    : scenario === 'redirect-login' ? 'a synthetic login redirect cannot escape the inspected request'
      : 'app-only browser acceptance exercises login, refresh and logout against a synthetic API',
  { timeout: 120000 }, async t => {
  assert.ok(artifactDir, 'APP_ONLY_AUTH_SYNTHETIC_ARTIFACT is required');
  let session = false;
  const calls = [], blocked = [];
  const fixture = await localAuthBrowserServer(async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method(), requestHeaders = await req.allHeaders();
    calls.push(`${method} ${url.pathname.replaceAll(user.id, '{synthetic-owner}')}`);
    const headers = { 'access-control-allow-origin': 'https://app.lythaus.co', 'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport' };
    if (scenario === 'missing-discover-cors' && url.pathname === '/api/feed/discover') delete headers['access-control-allow-origin'];
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (scenario === 'redirect-login' && method === 'POST' && url.pathname === '/api/auth/email') {
      return route.fulfill({ status: 307, headers: { ...headers, location: 'https://api.lythaus.co/api/posts' }, body: '' });
    }
    const protectedRead = ['/api/auth/userinfo', '/api/users/me', '/api/users/me/posts', '/api/reputation/me', '/api/rewards/me/monthly', `/api/users/${user.id}`].includes(url.pathname);
    if (protectedRead && (!session || !/^Bearer local-(?:access|refreshed)-fixture$/.test(requestHeaders.authorization ?? ''))) {
      return route.fulfill({ status: 401, headers, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    let status = 200, body = { items: [], hasMore: false, nextCursor: null };
    if (url.pathname === '/api/auth/email') {
      session = true;
      headers['set-cookie'] = `__Host-lythaus_refresh=${'f'.repeat(48)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
      body = { accessToken: 'local-access-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 };
    } else if (url.pathname === '/api/auth/refresh') {
      if (session && requestHeaders.cookie?.includes('__Host-lythaus_refresh=')) body = { accessToken: 'local-refreshed-fixture', sessionTransport: 'cookie-v1', expiresIn: 900 };
      else { status = 401; body = { error: 'refresh_token_invalid' }; }
    } else if (url.pathname === '/api/auth/userinfo') body = user;
    else if (url.pathname === '/api/auth/logout') {
      session = false;
      headers['set-cookie'] = '__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
      body = { state: 'signed_out' };
    } else if (url.pathname === `/api/users/${user.id}` || url.pathname === '/api/users/me') {
      body = { user: { id: user.id, displayName: 'Synthetic acceptance', trustPassportVisibility: 'private', moderationState: 'allowed', publicVisibility: false, reputationScore: 0 } };
    } else if (url.pathname === '/api/reputation/me') {
      body = { userId: user.id, level: 0, reputationLevel: 0, levelName: 'New', reputationStatus: 'active', reputationBand: 'new',
        policyVersion: 'reputation-v2.0.0', pillars: { accountability: 0, contribution: 0, conduct: 0, sourcing: 0, authenticity: 0, reviewReliability: 0 }, promotionBlockers: [], evaluatedAt: null };
    } else if (url.pathname === '/api/rewards/me/monthly') {
      body = { state: 'pending', reasonCode: 'approval_unavailable', effectiveMonth: null, currentLevel: null, sourceMonth: null, sourceScore: null,
        snapshot: { state: 'unavailable', reasonCode: 'approval_unavailable' }, selection: { state: 'unavailable', reasonCode: 'approval_unavailable' } };
    }
    await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  t.after(() => fixture.close());
  try {
    const journey = runAppOnlyAuthBrowser({ chromium, artifactDir, email: user.email, password: 'synthetic-password',
      launchOptions: { ...(process.env.APP_ONLY_TEST_CHROMIUM_PATH ? { executablePath: process.env.APP_ONLY_TEST_CHROMIUM_PATH } : {}),
        proxy: { server: fixture.proxy } }, contextOptions: { ignoreHTTPSErrors: true },
      onBlocked: value => blocked.push(value), ...(scenario !== 'normal' ? { timeoutMs: 8000 } : {}) });
    if (scenario !== 'normal') {
      await assert.rejects(() => journey, /app-only browser authentication acceptance failed/);
      if (scenario === 'missing-discover-cors') assert.ok(calls.some(call => call.endsWith(' /api/feed/discover')));
      if (scenario === 'redirect-login') {
        assert.ok(calls.some(call => call === 'POST /api/auth/email'));
        assert.ok(calls.every(call => !call.endsWith(' /api/posts')));
      }
      return;
    }
    const result = await journey;
    assert.equal(result.status, 'PASSED');
    assert.equal(session, false);
    assert.ok(calls.some(call => call === 'POST /api/auth/email'));
    assert.ok(calls.some(call => call === 'POST /api/auth/refresh'));
    assert.ok(calls.some(call => call === 'POST /api/auth/logout'));
    assert.ok(calls.filter(call => call.startsWith('POST ')).every(call =>
      ['POST /api/auth/email', 'POST /api/auth/refresh', 'POST /api/auth/logout'].includes(call)));
    assert.ok(calls.every(call => !call.includes('/api/feedback/')));
  } catch (error) {
    t.diagnostic(JSON.stringify({ synthetic: true, calls, blocked }));
    throw error;
  }
});
