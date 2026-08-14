import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAccessAudiences, requireActiveAdminMembership, verifiedAccessSubject } from '../src/admin-access-runtime-policy.ts';

const configuration = {
  ACCESS_JWKS_URL: 'https://lythaus.cloudflareaccess.com/cdn-cgi/access/certs',
  ACCESS_AUDIENCES: 'admin-ui-audience,admin-api-audience',
  ACCESS_TEAM_DOMAIN: 'lythaus.cloudflareaccess.com',
};

test('requires a Cloudflare Access assertion', async () => {
  await assert.rejects(() => verifiedAccessSubject(new Request('https://admin-api.lythaus.co/api/admin/waitlist'), configuration), /access_required/);
});

test('collapses an invalid Access JWT to a safe authentication error', async () => {
  const request = new Request('https://admin-api.lythaus.co/api/admin/waitlist', {
    headers: { 'cf-access-jwt-assertion': 'invalid-jwt' },
  });
  await assert.rejects(() => verifiedAccessSubject(request, configuration, async () => {
    throw new Error('signature detail');
  }), /access_assertion_invalid/);
});

test('accepts only a verified subject and preserves issuer and audience configuration', async () => {
  const request = new Request('https://admin-api.lythaus.co/api/admin/waitlist', {
    headers: { 'cf-access-jwt-assertion': 'verified-jwt' },
  });
  let seen;
  const subject = await verifiedAccessSubject(request, configuration, async (assertion, received) => {
    seen = { assertion, received };
    return { sub: 'access-subject' };
  });
  assert.equal(subject, 'access-subject');
  assert.equal(seen.assertion, 'verified-jwt');
  assert.deepEqual(seen.received, {
    ACCESS_JWKS_URL: configuration.ACCESS_JWKS_URL,
    ACCESS_AUDIENCES: ['admin-ui-audience', 'admin-api-audience'],
    ACCESS_TEAM_DOMAIN: configuration.ACCESS_TEAM_DOMAIN,
  });
  await assert.rejects(() => verifiedAccessSubject(request, configuration, async () => ({})), /access_subject_missing/);
  assert.equal(await verifiedAccessSubject(request, configuration, async () => ({ email: 'fallback-subject@example.com' })), 'fallback-subject@example.com');
});

test('fails closed when Access verification configuration is malformed', async () => {
  const request = new Request('https://admin-api.lythaus.co/api/admin/waitlist', {
    headers: { 'cf-access-jwt-assertion': 'verified-jwt' },
  });
  await assert.rejects(() => verifiedAccessSubject(request, { ACCESS_AUDIENCES: 'audience' }), /access_verification_not_configured/);
  await assert.rejects(() => verifiedAccessSubject(request, { ACCESS_AUDIENCES: 'audience', ACCESS_JWKS_URL: 'not-a-url' }), /access_verification_not_configured/);
});

test('requires a non-empty, distinct comma-separated audience allowlist', () => {
  assert.deepEqual(parseAccessAudiences('admin-ui, admin-api'), ['admin-ui', 'admin-api']);
  assert.deepEqual(parseAccessAudiences(''), []);
  assert.deepEqual(parseAccessAudiences('admin-ui,admin-ui'), []);
  assert.deepEqual(parseAccessAudiences(undefined), []);
});

test('denies missing membership and returns only a valid active membership actor', () => {
  assert.throws(() => requireActiveAdminMembership(undefined), /admin_role_required/);
  assert.deepEqual(requireActiveAdminMembership({ user_id: '01900000-0000-7000-8000-000000000001', role: 'administrator' }), {
    userId: '01900000-0000-7000-8000-000000000001', role: 'administrator',
  });
});
