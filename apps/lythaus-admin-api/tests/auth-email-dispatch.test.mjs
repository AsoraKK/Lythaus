import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dispatchKeeperEmail } from '../src/auth-email-dispatch-adapter.ts';
import { handleEmailEnvelope } from '../../lythaus-public-api/src/email-envelope-entrypoint.ts';
import { decryptField, encryptField, hmacLookup } from '../../../packages/security/src/index.ts';

const version = '01900000-0000-7000-8000-000000000001';
const email = 'synthetic@example.invalid';
const env = { DB_APP_FRESH: {}, PII_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'),
  PII_HMAC_KEY_V1: randomBytes(32).toString('base64'), AUTH_PASSWORD_PEPPER_V1: 'local-synthetic-pepper',
  TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: randomBytes(32).toString('base64'), WORKER_VERSION: { id: version } };
const encrypted = await encryptField(email, env.PII_ENCRYPTION_KEY_V1, 'v1');
const lookup = hmacLookup(email, env.PII_HMAC_KEY_V1);
const account = { id:version,status:'relink_required',protected_identity:false,contact_ciphertext:encrypted.ciphertext,
  contact_key_version:'v1',contact_lookup:lookup,contact_verified:true,credential_lookup:lookup,credential_verified:false };
const input = { operation:'invite',actorId:version,correlationId:version,reasonCode:'SUPPORT_REQUEST',email,displayName:'Synthetic',handle:'synthetic' };
const request = new Request('https://admin.lythaus.co/api/admin/users');
const internal = (body, method='POST',path='/keeper-email') => new Request(`https://private.internal${path}`, { method, ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}) });
function database({ member=true, duplicate=false, recovered=account, recent=false }={}) {
  const writes=[];
  const run=async (_,work)=>work({query:async(sql,values)=>{
    if(sql.includes('FROM identity.admin_memberships a JOIN')) return {rows:[],rowCount:member?1:0};
    if(sql.includes('UNION SELECT user_id')) return {rows:[],rowCount:duplicate?1:0};
    if(sql.includes('SELECT u.id, u.status')) return {rows:recovered?[recovered]:[],rowCount:recovered?1:0};
    if(sql.includes('SELECT id FROM identity.email_verification_tokens')) return {rows:[],rowCount:recent?1:0};
    writes.push({sql,values});
    return {rows:[],rowCount:1};
  }});
  return {run,writes};
}

test('private invitation and resend produce Jobs-compatible envelopes with no plaintext DB payload', async()=>{
  for(const operation of ['invite','resend']) {
    const db=database();
    const response=await handleEmailEnvelope(internal({...input,operation,userId:version}),env,db.run);
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.result.deliveryState,'queued');
    const values=db.writes.find(row=>row.sql.includes('INSERT INTO system.transactional_email_outbox')).values;
    assert.match(values[0],/^[0-9a-f-]{14}7/);
    assert.equal(values[6],null);
    assert.equal(values[7],null);
    const opened=JSON.parse(await decryptField({ciphertext:values[8],encryptionKeyVersion:values[9]},env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1));
    assert.equal(opened.to,email);
    assert.match(opened.token,/^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(db.writes).includes(email));
    assert.ok(!JSON.stringify(db.writes).includes(opened.token));
  }
});

test('authorization, existing identity, cooldown, restrictions and trusted linkage are enforced',async()=>{
  for(const [options,body,error] of [
    [{member:false},input,'admin_role_required'],
    [{duplicate:true},input,'user_email_exists'],
    [{recovered:undefined},{...input,operation:'resend',userId:version},null],
    [{recovered:null},{...input,operation:'resend',userId:version},'user_not_found'],
    [{recovered:{...account,credential_verified:true,status:'active'}},{...input,operation:'resend',userId:version},'email_already_verified'],
    [{recovered:{...account,status:'suspended'}},{...input,operation:'resend',userId:version},'invalid_account_status'],
    [{recovered:{...account,protected_identity:true}},{...input,operation:'resend',userId:version},'invalid_account_status'],
    [{recovered:{...account,contact_lookup:'different',credential_lookup:'different'}},{...input,operation:'resend',userId:version},'auth_email_dispatch_unavailable'],
  ]) {
    const response=await handleEmailEnvelope(internal(body),env,database(options).run);
    const result=await response.json();
    if(error) assert.equal(result.error,error); else assert.equal(response.status,200);
  }
  const db=database({recent:true});
  assert.equal((await (await handleEmailEnvelope(internal({...input,operation:'resend',userId:version}),env,db.run)).json()).result.deliveryState,'cooldown');
  assert.ok(!db.writes.some(row=>row.sql.includes('INSERT INTO system.transactional_email_outbox')));
});

test('private service rejects invalid operations, bodies, missing bindings and database failure',async()=>{
  const invalid=[{...input,operation:'other'},{...input,unknown:true},{...input,actorId:null},{...input,correlationId:'bad'},
    {...input,reasonCode:'bad'},{...input,email:'bad'},{...input,displayName:123},{...input,displayName:'x'.repeat(81)},
    {...input,handle:'!'}, {...input,operation:'resend',userId:'bad'},'null','[]','{','x'.repeat(4097)];
  for(const body of invalid) assert.equal((await handleEmailEnvelope(internal(body),env,database().run)).status,503);
  assert.equal((await handleEmailEnvelope(internal(input,'GET'),env)).status,404);
  assert.equal((await handleEmailEnvelope(internal(input,'POST','/other'),env)).status,404);
  assert.equal((await handleEmailEnvelope(internal(input),{})).status,503);
  assert.equal((await handleEmailEnvelope(internal(input),env,async()=>{throw new Error('private-database-detail')})).status,503);
});

const valid={workerVersion:version,result:{userId:version,deliveryState:'queued'}};
test('Admin delegates without keys, filters sensitive responses, pins candidate and maps only safe errors',async()=>{
  const pinned=new Request(request,{headers:{'Cloudflare-Workers-Version-Overrides':`other-worker="${version}", lythaus-public-api-development="${version}"`}});
  for(const operation of ['invite','resend']) {
    const binding={fetch:async(url,init)=>{
      assert.equal(init.headers['Cloudflare-Workers-Version-Overrides'],`lythaus-public-api-development="${version}"`);
      return Response.json({...valid,ignored:'do-not-expose'});
    }};
    const result=await dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:binding},pinned,{operation});
    assert.equal(result.userId,version);
    assert.equal(result.ignored,undefined);
  }
  for(const error of ['user_email_exists','user_not_found','email_already_verified','invalid_account_status','admin_role_required','private-secret']) {
    await assert.rejects(dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:{fetch:async()=>Response.json({workerVersion:version,error},{status:409})}},request,input),
      new RegExp(error==='private-secret'?'auth_email_dispatch_unavailable':error));
  }
  const cooldown=await dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:{fetch:async()=>Response.json({...valid,result:{userId:version,deliveryState:'cooldown'}})}},request,{operation:'resend'});
  assert.equal(cooldown.deliveryState,'cooldown');
});

test('Admin fails closed on absent binding, malformed response, missing outcome, version drift or timeout',async t=>{
  const pinned=new Request(request,{headers:{'Cloudflare-Workers-Version-Overrides':`lythaus-public-api-development="${version}"`}});
  const responses=[new Response('null'),new Response('x'.repeat(4097)),new Response(null,{status:503}),
    ...[{...valid,workerVersion:'bad'},{...valid,workerVersion:'01900000-0000-7000-8000-000000000002'},
      {...valid,result:null},{...valid,result:{userId:'bad'}},{...valid,result:{userId:version,deliveryState:'fabricated'}}].map(body=>Response.json(body))];
  for(const response of responses) await assert.rejects(dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:{fetch:async()=>response}},pinned,input),/auth_email_dispatch_unavailable/);
  await assert.rejects(dispatchKeeperEmail({},request,input),/auth_email_dispatch_unavailable/);
  await assert.rejects(dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:{fetch:async()=>{throw new Error('secret')}}},request,input),/auth_email_dispatch_unavailable/);
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=assert.rejects(dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:{fetch:()=>new Promise(()=>{})}},request,input),/auth_email_dispatch_unavailable/);
  t.mock.timers.tick(5001);
  await pending;
});

test('capability is bound only to existing Public Worker and absent from anonymous router',()=>{
  const config=JSON.parse(readFileSync('apps/lythaus-admin-api/wrangler.jsonc','utf8'));
  assert.deepEqual(config.services,[{binding:'AUTH_EMAIL_ENVELOPE',service:'lythaus-public-api-development',entrypoint:'AuthEmailEnvelope'}]);
  assert.match(readFileSync('apps/lythaus-public-api/src/worker.ts','utf8'),/class AuthEmailEnvelope extends WorkerEntrypoint/);
  assert.doesNotMatch(readFileSync('apps/lythaus-public-api/src/index.ts','utf8'),/handleEmailEnvelope|['"]\/keeper-email['"]/);
  assert.doesNotMatch(readFileSync('apps/lythaus-admin-api/src/auth-email-dispatch-adapter.ts','utf8'),/ENCRYPTION_KEY|secretCiphertext|console\./);
  assert.match(readFileSync('scripts/ci/probe-production-workers.mjs','utf8'), /body.emailBinding\?\.bindingVerified !== true \|\| !publicVersionIsExpected/);
  assert.match(readFileSync('apps/lythaus-admin-api/src/index.ts','utf8'), /dispatchKeeperEmail\(env, request, \{ operation: 'probe' \}\)/);
});

test('protected readiness probes the exact private capability without any identity write',async()=>{
  const binding={fetch:(url,init)=>handleEmailEnvelope(new Request(url,init),env,async()=>assert.fail('probe cannot query or mutate identities'))};
  const pinned=new Request(request,{headers:{'Cloudflare-Workers-Version-Overrides':`lythaus-public-api-development="${version}"`}});
  assert.deepEqual(await dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:binding},pinned,{operation:'probe'}),{bindingVerified:true,publicWorkerVersion:version});
  await assert.rejects(dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:binding},request,{operation:'probe'}),/auth_email_dispatch_unavailable/);
  await assert.rejects(dispatchKeeperEmail({AUTH_EMAIL_ENVELOPE:{fetch:async()=>Response.json(valid)}},pinned,{operation:'probe'}),/auth_email_dispatch_unavailable/);
});
