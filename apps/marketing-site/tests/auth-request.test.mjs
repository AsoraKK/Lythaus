import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { acceptsPassword, authFetch, withAuthDeadline } from '../src/scripts/auth-request.ts';

test('website consumes the same Unicode and legacy-password fixtures as API and Flutter', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../../../packages/contracts/fixtures/password-policy.json', import.meta.url)));
  for (const fixture of fixtures.cases) {
    assert.equal(acceptsPassword(fixture.password, 'login'), fixture.login, fixture.name);
    assert.equal(acceptsPassword(fixture.password, 'creation'), fixture.creation, fixture.name);
  }
});

test('auth transport is non-cacheable and preserves typed JSON errors', async () => {
  let options;
  const result = await authFetch('https://api.example.invalid/auth', { method: 'POST' }, async (_, init) => {
    options = init;
    return Response.json({ error: 'email_verification_required' }, { status: 400 });
  });
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { error: 'email_verification_required' });
  assert.equal(options.cache, 'no-store');
  assert.equal(options.referrerPolicy, 'no-referrer');
});

test('auth transport rejects gateway HTML, malformed, primitive, and oversized JSON', async () => {
  for (const response of [new Response('<html>gateway</html>'), new Response('{invalid', { headers: { 'content-type': 'application/json' } }), Response.json(null), Response.json([]), Response.json({ value: 'x'.repeat(65536) })]) {
    await assert.rejects(() => authFetch('https://api.example.invalid/auth', {}, async () => response), /network_response_invalid/);
  }
});

test('both connection and body waits have deadlines; challenge wait also terminates', async () => {
  let signal;
  await assert.rejects(() => authFetch('https://api.example.invalid/auth', {}, async (_, init) => {
    signal = init.signal;
    return new Promise(() => {});
  }, 5), /request_timeout/);
  assert.equal(signal.aborted, true);
  await assert.rejects(() => authFetch('https://api.example.invalid/auth', {}, async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }), 5), /request_timeout/);
  await assert.rejects(() => withAuthDeadline(new Promise(() => {}), 5), /request_timeout/);
});

test('uncertain intake retries preserve their key but never reuse the consumed challenge', async () => {
  const keys=[];
  const input={method:'POST',body:JSON.stringify({mode:'register',email:'synthetic@example.invalid',password:'synthetic password',turnstileToken:'first-fixture'})};
  const failed=async (_url,init)=>{keys.push(init.headers.get('idempotency-key'));throw new Error('offline');};
  await assert.rejects(authFetch('https://api.example.invalid/auth/email',input,failed),/offline/);
  input.body=JSON.stringify({...JSON.parse(input.body),turnstileToken:'fresh-fixture'});
  await authFetch('https://api.example.invalid/auth/email',input,async (_url,init)=>{
    keys.push(init.headers.get('idempotency-key'));
    assert.equal(JSON.parse(init.body).turnstileToken,'fresh-fixture');
    return Response.json({state:'verification_required'},{status:202});
  });
  assert.ok(keys[0]);assert.equal(keys[0],keys[1]);
  await assert.rejects(authFetch('https://api.example.invalid/auth/email',input,failed),/offline/);
  assert.notEqual(keys[2],keys[1]);
});
