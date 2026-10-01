import assert from 'node:assert/strict';
import test from 'node:test';
import { expiredRefreshCookie, optionalRefreshCookie, refreshCookie, sessionTransport, sessionTransportResult, validateAuthRequestOrigin } from '../src/auth-session-transport.ts';

const allowed = 'https://app.lythaus.co,https://lythaus.co';
const token = 'synthetic-not-a-real-refresh-token-00000000';
const tokens = { accessToken: 'synthetic-access', refreshToken: token, expiresIn: 900 };
const request = (headers = {}) => new Request('https://api.lythaus.co/api/auth/refresh', { method: 'POST', headers });
const browser = { origin: 'https://app.lythaus.co', 'x-lythaus-auth-transport': 'cookie-v1' };

test('all auth POST operations enforce origin before dispatch, including recovery',()=>{
  for(const path of ['email','email/verify','password/reset/request','password/reset/complete','refresh','logout']) {
    assert.throws(()=>validateAuthRequestOrigin(new Request(`https://api.lythaus.co/api/auth/${path}`,{method:'POST',headers:{origin:'https://evil.lythaus.co'}}),allowed),/auth_origin_not_allowed/);
  }
  assert.doesNotThrow(()=>validateAuthRequestOrigin(new Request('https://api.lythaus.co/api/health'),allowed));
  assert.doesNotThrow(()=>validateAuthRequestOrigin(new Request('https://api.lythaus.co/api/posts',{method:'POST'}),allowed));
});

test('browser session never returns refresh credentials in JSON; host-only secure cookie has no Domain', () => {
  const result = sessionTransportResult(request(browser), allowed, tokens);
  assert.equal(result.body.refreshToken, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /synthetic-not-a-real-refresh/);
  assert.match(result.headers['set-cookie'], /__Host-lythaus_refresh=.*; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);
  assert.doesNotMatch(result.headers['set-cookie'], /Domain=/);
  assert.match(expiredRefreshCookie(), /Max-Age=0$/);
});

test('native/deployed legacy clients retain explicit compatible token transport', () => {
  assert.equal(sessionTransport(request(), allowed), 'native');
  assert.deepEqual(sessionTransportResult(request(), allowed, tokens).body, { ...tokens, tokenType: 'Bearer' });
});

test('cookie transport requires custom header and exact HTTPS origin, never wildcard or sibling trust', () => {
  for (const origin of [undefined, 'null', 'http://app.lythaus.co', 'https://untrusted.lythaus.co', 'https://app.lythaus.co.evil.invalid']) {
    assert.throws(() => sessionTransport(request({ 'x-lythaus-auth-transport': 'cookie-v1', ...(origin ? { origin } : {}) }), allowed), /auth_origin_not_allowed/);
  }
  assert.throws(() => sessionTransport(request(browser), '*'), /auth_origin_not_allowed/);
  assert.throws(() => sessionTransport(request({ origin: browser.origin, 'x-lythaus-auth-transport': 'unknown' }), allowed), /invalid_session_transport/);
  assert.throws(() => sessionTransport(request({ origin: 'https://untrusted.lythaus.co' }), allowed), /auth_origin_not_allowed/);
});

test('refresh cookie parser rejects absent, duplicate, malformed or oversized credentials', () => {
  assert.equal(refreshCookie(request({ cookie: `other=1; __Host-lythaus_refresh=${token}` })), token);
  for (const cookie of ['', '__Host-lythaus_refresh=short', `__Host-lythaus_refresh=${token}; __Host-lythaus_refresh=${token}`, '__Host-lythaus_refresh=%3Bunsafe', `__Host-lythaus_refresh=${'a'.repeat(257)}`]) {
    assert.throws(() => refreshCookie(request({ cookie })), /refresh_token_invalid/);
  }
});

test('optional logout cookie permits absence without weakening credential parsing', () => {
  assert.equal(optionalRefreshCookie(request()), undefined);
  assert.equal(optionalRefreshCookie(request({ cookie: 'other=1' })), undefined);
  assert.equal(optionalRefreshCookie(request({ cookie: `__Host-lythaus_refresh=${token}` })), token);
  for (const cookie of ['__Host-lythaus_refresh=', '__Host-lythaus_refresh=short',
    `__Host-lythaus_refresh=${token}; __Host-lythaus_refresh=${token}`, `__Host-lythaus_refresh=${'a'.repeat(257)}`]) {
    assert.throws(() => optionalRefreshCookie(request({ cookie })), /refresh_token_invalid/);
  }
});
