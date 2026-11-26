import assert from 'node:assert/strict';
import app from './sealed.js';

// workerd supplies the real PostgreSQL wrapped binding and maps its virtual hostname
// to the disposable local database service. Only this fixture sees its random placeholders.
export const wrappedMembership = {async test(_controller, env) {
  const binding = env.DB;
  assert.ok(/^[0-9a-f]{32}\.workers\.alt$/.test(binding.host));
  assert.equal(binding.scheme, 'postgresql');
  assert.equal(binding.port, 5432);
  assert.equal(typeof binding.connect, 'function');
  assert.ok(!('ip' in binding));
  const placeholders = [binding.database, binding.user, binding.password];
  assert.ok(placeholders.every(value => /^[0-9a-f]{32}$/.test(value)) && new Set(placeholders).size === 3);
  const setup = await env.FIXTURE.fetch('http://fixture.invalid/prepare', {method:'POST', body:JSON.stringify(placeholders)});
  assert.equal(setup.status, 200);
  const {bindings, memberAssertion, visitorAssertion} = await setup.json();
  bindings.DB_ADMIN_FRESH = binding;
  const health = assertion => app.fetch(new Request('https://' + bindings.EXPECTED_HOSTNAMES + '/api/admin/health', {
    headers:{'cf-access-jwt-assertion':assertion},
  }), bindings);
  const visitor = await health(visitorAssertion);
  const denied = await visitor.json();
  if (visitor.status === 500 && denied?.diagnostic?.stage === 'db_binding' && denied?.diagnostic?.category === 'invalid_binding') {
    throw new Error('sealed_worker_rejected_official_wrapped_binding');
  }
  assert.equal(visitor.status, 403);
  assert.equal(denied.error, 'admin_role_required');
  const member = await health(memberAssertion);
  assert.equal(member.status, 200);
  const accepted = await member.json();
  assert.equal(accepted.status, 'ok');
  assert.ok(accepted.database?.database_time);
}};
