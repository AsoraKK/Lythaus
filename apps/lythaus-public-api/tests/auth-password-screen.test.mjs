import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { requireUncompromisedPassword } from '../src/auth-password-screen.ts';

const password = 'synthetic screening fixture only';
const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
test('new-password screening sends only five digest characters, requests padding, and preserves exact input', async () => {
  const result = await requireUncompromisedPassword(password, async (url, init) => {
    assert.equal(url, `https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`);
    assert.equal(init.headers['Add-Padding'], 'true');
    assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined);
    assert.doesNotMatch(JSON.stringify({ url, init }), /synthetic screening fixture/);
    return new Response(`${digest.slice(5)}:0\r\n${'F'.repeat(35)}:2`);
  });
  assert.equal(result, password);
});
test('known compromised password fails and padded zero counts do not count as compromise', async () => {
  await assert.rejects(() => requireUncompromisedPassword(password, async () => new Response(`${digest.slice(5)}:1`)), /password_compromised/);
});
test('outage, malformed data, redirects, oversize, and stalled providers fail closed with safe errors', async () => {
  for (const response of [new Response('', { status: 503 }), new Response('', { status: 302 }), new Response('<html>error</html>'), new Response(''), new Response('x'.repeat(262145))]) {
    await assert.rejects(() => requireUncompromisedPassword(password, async () => response), /password_screening_unavailable/);
  }
  await assert.rejects(() => requireUncompromisedPassword(password, async () => { throw new Error('private upstream details'); }), /password_screening_unavailable/);
  await assert.rejects(() => requireUncompromisedPassword(password, async () => new Promise(() => {}), 5), /password_screening_unavailable/);
});
test('invalid creation password never reaches screening service', async () => {
  await assert.rejects(() => requireUncompromisedPassword('short', async () => assert.fail('must not send')), /invalid_password/);
});
