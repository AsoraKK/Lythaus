import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import './auth-password-screen.workerd.mjs';
import { classifyPublicError } from '../src/auth-runtime-policy.ts';
import {
  PasswordScreeningUnavailableError,
  passwordScreeningFailureLogFields,
  requireUncompromisedPassword,
} from '../src/auth-password-screen.ts';

const password = 'synthetic screening fixture only';
const digest = createHash('sha1').update(password).digest('hex').toUpperCase();

async function expectUnavailable(promise, reasonCode, httpStatus) {
  let failure;
  try { await promise; } catch (error) { failure = error; }
  assert.ok(failure instanceof PasswordScreeningUnavailableError);
  assert.equal(failure.message, 'password_screening_unavailable');
  assert.deepEqual(classifyPublicError(failure), {
    exposedCode: 'password_screening_unavailable',
    internalCode: 'password_screening_unavailable',
    status: 503,
  });
  assert.deepEqual(passwordScreeningFailureLogFields(failure), {
    passwordScreeningFailureReason: reasonCode,
    ...(httpStatus === undefined ? {} : { passwordScreeningHttpStatus: httpStatus }),
  });
  return failure;
}

test('new-password screening sends only five digest characters, requests padding, and preserves exact input', async () => {
  const result = await requireUncompromisedPassword(password, async (url, init) => {
    assert.equal(url, `https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`);
    assert.equal(init.headers['Add-Padding'], 'true');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.body, undefined);
    assert.doesNotMatch(JSON.stringify({ url, init }), /synthetic screening fixture/);
    return new Response(`${digest.slice(5)}:0\r\n${'F'.repeat(35)}:2`);
  });
  assert.equal(result, password);
});
test('known compromised password fails and padded zero counts do not count as compromise', async () => {
  await assert.rejects(() => requireUncompromisedPassword(password, async () => new Response(`${digest.slice(5)}:1`)), /password_compromised/);
});
test('HTTP failures log only a category and status while keeping the public error generic', async () => {
  await expectUnavailable(requireUncompromisedPassword(password, async () => new Response('', { status: 503 })), 'http_status', 503);
  await expectUnavailable(requireUncompromisedPassword(password, async () => new Response('', { status: 302 })), 'http_status', 302);
});
test('network failures do not expose the provider exception', async () => {
  const failure = await expectUnavailable(
    requireUncompromisedPassword(password, async () => { throw new Error('private upstream details'); }),
    'network_error',
  );
  assert.doesNotMatch(JSON.stringify(passwordScreeningFailureLogFields(failure)), /private upstream details/);
  const failedBody = new Response(new ReadableStream({ start(controller) { controller.error(new Error('private body details')); } }));
  const bodyFailure = await expectUnavailable(
    requireUncompromisedPassword(password, async () => failedBody),
    'network_error',
  );
  assert.doesNotMatch(JSON.stringify(passwordScreeningFailureLogFields(bodyFailure)), /private body details/);
});
test('invalid or oversized response bodies fail closed with a body-only diagnostic', async () => {
  for (const response of [
    new Response(null),
    new Response('<html>error</html>'),
    new Response(''),
    new Response('x'.repeat(262145)),
  ]) {
    const failure = await expectUnavailable(
      requireUncompromisedPassword(password, async () => response),
      'invalid_body',
    );
    assert.doesNotMatch(JSON.stringify(passwordScreeningFailureLogFields(failure)), /html|range|x{20}/i);
  }
});
test('fetch and body deadlines log timeout without changing the public error', async () => {
  let signal;
  await expectUnavailable(requireUncompromisedPassword(password, async (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  }, 10), 'timeout');
  assert.equal(signal.aborted, true);
  const stalledBody = new Response(new ReadableStream({ start() {} }));
  await expectUnavailable(requireUncompromisedPassword(password, async () => stalledBody, 10), 'timeout');
});
test('invalid creation password never reaches screening service', async () => {
  await assert.rejects(() => requireUncompromisedPassword('short', async () => assert.fail('must not send')), /invalid_password/);
});
