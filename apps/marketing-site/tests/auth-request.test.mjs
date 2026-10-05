import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { acceptsPassword, authFetch, authSupportReference, withAuthDeadline } from '../src/scripts/auth-request.ts';
import { idempotentAuthIntake } from '../../lythaus-public-api/src/auth-intake-runtime.ts';

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

test('reset references are server UUIDs and never arbitrary account or reason strings', async () => {
  const correlationId = '3b8a5c5c-07c8-4b55-a0a5-7a66235648cc';
  for (const body of [{state:'reset_if_eligible',correlationId},{error:'rate_limit_exceeded',correlationId}]) {
    const result = await authFetch('https://api.example.invalid/auth', {method:'POST'}, async () => Response.json(body));
    assert.equal(authSupportReference(await result.json()),correlationId);
  }
  for (const correlationId of [undefined, null, 123, 'synthetic@example.invalid', 'support_required:protected_administrative_identity', '<script>unsafe</script>']) {
    assert.equal(authSupportReference({correlationId}),undefined);
  }
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

function intakeFixture(scope) {
  const rows=new Map(),keys=[];
  let workCount=0;
  const query=async(_binding,sql,values)=>{
    const key=values[1];
    if(sql.startsWith('INSERT')) {
      if(rows.has(key))return {rowCount:0,rows:[]};
      rows.set(key,{response:JSON.parse(values[2]),recent:true});
      return {rowCount:1,rows:[{key}]};
    }
    if(sql.startsWith('SELECT'))return {rows:rows.has(key)?[rows.get(key)]:[]};
    rows.get(key).response=JSON.parse(values[2]);
    return {rowCount:1,rows:[]};
  };
  const server=async(url,init)=>{
    const request=new Request(url,init);
    keys.push(request.headers.get('idempotency-key'));
    try {
      return await idempotentAuthIntake({request,payload:JSON.parse(init.body),scope,
        candidateVersion:'synthetic-candidate',key:'synthetic-fixture-key',database:{},
        work:async()=>{workCount++;return Response.json({state:scope==='password_reset'?'reset_if_eligible':'verification_required'},{status:202});},
      },query);
    } catch(error) {
      assert.ok(['idempotency_key_conflict','idempotency_outcome_unknown'].includes(error.message));
      return Response.json({error:error.message},{status:409});
    }
  };
  return {rows,keys,server,get workCount(){return workCount;}};
}

test('a next-day expired intake key ends the rejected retry and allows the next deliberate fresh request',async()=>{
  for(const scope of ['register','resend_verification','password_reset']) {
    const f=intakeFixture(scope),url=`https://api.example.invalid/auth/${scope==='password_reset'?'password/reset/request':'email'}`;
    const init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:scope,email:'synthetic-next-day@example.invalid',turnstileToken:'first-proof'})};
    await assert.rejects(authFetch(url,init,async(...args)=>{await f.server(...args);throw new Error('synthetic lost accepted response');}),/synthetic lost accepted response/);
    assert.equal(f.workCount,1);
    f.rows.get(f.keys[0]).recent=false;
    init.body=JSON.stringify({...JSON.parse(init.body),turnstileToken:'replacement-proof'});
    const rejected=await authFetch(url,init,f.server);
    assert.equal(rejected.status,409);
    assert.deepEqual(await rejected.json(),{error:'idempotency_key_conflict'});
    assert.equal(f.keys[1],f.keys[0]);
    assert.equal(f.keys.length,2,'A conflict must not trigger an automatic request');
    assert.equal(f.workCount,1);
    const fresh=await authFetch(url,init,f.server);
    assert.equal(fresh.status,202);
    assert.notEqual(f.keys[2],f.keys[1]);
    assert.equal(f.workCount,2);
  }
});

test('an uncertain 409 outcome retains the same intake key and never executes another domain operation',async()=>{
  const f=intakeFixture('register'),url='https://api.example.invalid/auth/email';
  const init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'register',email:'synthetic-uncertain@example.invalid'})};
  await assert.rejects(authFetch(url,init,async(...args)=>{await f.server(...args);throw new Error('synthetic lost response');}),/synthetic lost response/);
  f.rows.get(f.keys[0]).response.state='outcome_unknown';
  for(let retry=0;retry<2;retry++) {
    const result=await authFetch(url,init,f.server);
    assert.equal(result.status,409);
    assert.deepEqual(await result.json(),{error:'idempotency_outcome_unknown'});
  }
  assert.ok(f.keys.every(key=>key===f.keys[0]));
  assert.equal(f.workCount,1);
});
