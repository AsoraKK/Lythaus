import assert from 'node:assert/strict';
import test from 'node:test';
import { allowsAppAuthCors, allowsAppAuthPostBody, classifyAppAuthRequest } from '../release/app-only-auth-network-policy.mjs';

const app = 'https://app.lythaus.co', api = 'https://api.lythaus.co';
const owner = '11111111-1111-4111-8111-111111111111';

test('only local artifact reads and the bounded authentication journey are allowed', () => {
  assert.equal(classifyAppAuthRequest(`${app}/settings/security`, 'GET'), 'ARTIFACT');
  for (const route of ['/api/auth/userinfo', '/api/users/me', '/api/users/me/posts', '/api/feed/discover', '/api/subscription/status', '/api/custom-feeds',
    '/api/users/me/reputation', '/api/reputation/me', '/api/rewards/me/monthly']) {
    assert.equal(classifyAppAuthRequest(`${api}${route}`, 'GET'), 'API');
    assert.equal(classifyAppAuthRequest(`${api}${route}`, 'OPTIONS', { preflightMethod: 'GET' }), 'API');
  }
  for (const route of ['/api/auth/email', '/api/auth/refresh', '/api/auth/logout']) {
    assert.equal(classifyAppAuthRequest(`${api}${route}`, 'POST'), 'API');
    assert.equal(classifyAppAuthRequest(`${api}${route}`, 'OPTIONS', { preflightMethod: 'POST' }), 'API');
  }
  assert.equal(classifyAppAuthRequest(`${api}/api/users/${owner}`, 'GET', { ownerId: owner }), 'API');
  assert.equal(classifyAppAuthRequest(`${api}/api/users/${owner}`, 'GET'), 'DENY');
});

test('email login is bound to the authorized test account; register, resend and token overrides are blocked', () => {
  const credentials = { email: 'synthetic@example.invalid', password: 'synthetic-password' };
  const login = { mode: 'login', ...credentials };
  assert.equal(allowsAppAuthPostBody('/api/auth/email', JSON.stringify(login), credentials), true);
  for (const body of [{ ...login, mode: 'register' }, { ...login, mode: 'resend_verification' },
    { ...login, email: 'other@example.invalid' }, { ...login, password: 'wrong' }, { ...login, extra: true }, [], null]) {
    assert.equal(allowsAppAuthPostBody('/api/auth/email', JSON.stringify(body), credentials), false);
  }
  for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
    assert.equal(allowsAppAuthPostBody(path, '{}', credentials), true);
    assert.equal(allowsAppAuthPostBody(path, '{"refreshToken":"other"}', credentials), false);
    assert.equal(classifyAppAuthRequest(`${api}${path}?extra=x`, 'POST'), 'DENY');
  }
});

test('actual upstream CORS headers must allow this credentialed app and its preflight', () => {
  const response = { 'access-control-allow-origin': app, 'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' };
  const request = { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' };
  assert.equal(allowsAppAuthCors(response, request, 'OPTIONS'), true);
  assert.equal(allowsAppAuthCors(response, {}, 'GET'), true);
  assert.equal(allowsAppAuthCors({ ...response, 'access-control-allow-origin': '*' }, {}, 'GET'), false);
  assert.equal(allowsAppAuthCors({ ...response, 'access-control-allow-credentials': 'false' }, {}, 'GET'), false);
  assert.equal(allowsAppAuthCors({ ...response, 'access-control-allow-headers': 'Authorization' }, request, 'OPTIONS'), false);
  assert.equal(allowsAppAuthCors({ ...response, 'access-control-allow-methods': 'GET' }, request, 'OPTIONS'), false);
});

test('content writes, feedback, unrelated people, and noncanonical origins are denied', () => {
  for (const [url, method, options] of [
    [`${api}/api/posts`, 'POST'], [`${api}/api/feedback/post/${owner}`, 'GET'],
    [`${api}/api/users/${owner}`, 'GET', { ownerId: '22222222-2222-4222-8222-222222222222' }],
    [`${api}/api/auth/email`, 'GET'], [`${api}/api/auth/email`, 'OPTIONS', { preflightMethod: 'DELETE' }],
    [`${api}/api/feed/discover`, 'POST'], [`${app}/settings`, 'POST'],
    ['https://api.lythaus.co.example.invalid/api/auth/email', 'POST'],
    ['http://api.lythaus.co/api/auth/email', 'POST'],
    ['https://user@api.lythaus.co/api/auth/email', 'POST'], ['not a URL', 'GET'],
  ]) assert.equal(classifyAppAuthRequest(url, method, options), 'DENY');
});
