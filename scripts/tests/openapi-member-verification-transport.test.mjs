import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { protectMemberVerification } from '../protect-openapi-member-verification.mjs';

const method = `  Future<Response<MemberActionVerificationReceipt>> verifyRecentAccountAction({
  }) async {
    final _path = r'/auth/recent-verification';
    final options = Options(
      validateStatus: validateStatus,
    );
  }`;

test('only the new verification transport is restricted, repeatably', () => {
  const prefix = 'existing login and refresh methods\n';
  const suffix = '\nexisting unrelated API methods';
  const safe = protectMemberVerification(prefix + method + suffix);
  assert.ok(safe.startsWith(prefix) && safe.endsWith(suffix));
  assert.match(safe, /followRedirects: false/u);
  assert.match(safe, /maxRedirects: 0/u);
  assert.match(safe, /status >= 200 && status < 300/u);
  assert.match(safe, /dart\.library\.js_interop/u);
  assert.match(safe, /throw UnsupportedError/u);
  assert.equal(protectMemberVerification(safe), safe);
});

test('unexpected generated transport shape fails closed', () => {
  for (const input of ['', method + method, method.replace('validateStatus: validateStatus', 'validateStatus: other'), method.replace('/auth/recent-verification', '/auth/refresh')]) {
    assert.throws(() => protectMemberVerification(input), /member_verification_generator_/u);
  }
});

test('committed SDK and generation pipeline retain the restriction', () => {
  const source = readFileSync('lib/generated/api_client/lib/src/api/auth_api.dart', 'utf8');
  assert.equal(protectMemberVerification(source), source);
  const commands = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.match(commands['openapi:gen:dart'], /protect-openapi-member-verification\.mjs/u);
  assert.match(commands['openapi:test:dart'], /openapi-member-verification-transport\.test\.mjs/u);
});
