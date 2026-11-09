import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dispatchKeeperEmail } from '../src/auth-email-dispatch-adapter.ts';
import { claimKeeperIdempotency, finalizeKeeperIdempotency } from '../src/keeper-runtime.ts';
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

test('stale waitlist invite idempotency claims become outcome-unknown without dispatch replay', async () => {
  const calls = [];
  const client = { query: async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes('INSERT INTO system.idempotency_keys')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT actor_id, response, created_at')) return { rows: [{ actor_id: version, response: { state: 'processing' }, processing_expired: true }], rowCount: 1 };
    if (sql.includes('UPDATE system.idempotency_keys')) return { rows: [], rowCount: 1 };
    throw new Error('unexpected_idempotency_query');
  } };
  assert.deepEqual(await claimKeeperIdempotency(client, `admin.waitlist.invite:${version}`, 'invite-key-0001', version), { state: 'outcome_unknown' });
  assert.equal(calls.length, 3);
  assert.match(calls[1].sql, /created_at <= now\(\) - interval '5 minutes'/);
  assert.match(calls[2].sql, /response ->> 'state' = 'processing'/);
});

test('fresh or unrelated idempotency claims remain in progress and actor mismatch stays rejected', async () => {
  for (const { scope, row, expected } of [
    { scope: `admin.waitlist.invite:${version}`, row: { actor_id: version, response: { state: 'processing' }, processing_expired: false }, expected: /idempotency_in_progress/ },
    { scope: 'admin.user.delete:target', row: { actor_id: version, response: { state: 'processing' }, processing_expired: true }, expected: /idempotency_in_progress/ },
    { scope: `admin.waitlist.invite:${version}`, row: { actor_id: '01900000-0000-7000-8000-000000000002', response: { state: 'processing' }, processing_expired: true }, expected: /idempotency_key_reused/ },
  ]) {
    const client = { query: async sql => sql.includes('INSERT INTO system.idempotency_keys')
      ? { rows: [], rowCount: 0 }
      : { rows: [row], rowCount: 1 } };
    await assert.rejects(claimKeeperIdempotency(client, scope, 'invite-key-0001', version), expected);
  }
});

test('late invite finalization reports the quarantined unknown outcome', async () => {
  const client = { query: async sql => sql.includes("SET response = $4::jsonb")
    ? { rows: [], rowCount: 0 }
    : { rows: [{ state: 'outcome_unknown' }], rowCount: 1 } };
  await assert.rejects(finalizeKeeperIdempotency(client, `admin.waitlist.invite:${version}`, 'invite-key-0001', version, { deliveryState: 'queued' }), /idempotency_outcome_unknown/);
});

const request = new Request('https://admin.lythaus.co/api/admin/users');
const internal = (body, method='POST',path='/keeper-email') => new Request(`https://private.internal${path}`, { method, ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}) });
function database({ member=true, duplicate=false, recovered=account, recent=false, waitlistEligible=true, inviteBound=true, existingWaitlistInvite=null }={}) {
  const writes=[], calls=[];
  const reissueEligibleAccount = existingWaitlistInvite?.status === 'relink_required';
  const run=async (_,work)=>work({query:async(sql,values)=>{
    calls.push({sql,values});
    if(sql.includes('FROM identity.admin_memberships a JOIN')) return {rows:[],rowCount:member?1:0};
    if(sql.includes("pg_catalog.to_regclass('marketing.waitlist_invites')")) return {rows:[{invites_present:false,verifier_present:false}],rowCount:1};
    if(sql.includes('marketing.waitlist_invite_eligible')) return {rows:[{eligible:waitlistEligible && (!existingWaitlistInvite || reissueEligibleAccount)}],rowCount:1};
    if(sql.includes('marketing.waitlist_invite_reissue_user')) return {rows:[{user_id:reissueEligibleAccount ? existingWaitlistInvite.user_id : null}],rowCount:1};
    if(sql.includes('marketing.bind_waitlist_invite')) return {rows:[{bound:inviteBound}],rowCount:1};
    if(sql.includes('UNION SELECT user_id')) return {rows:[],rowCount:duplicate?1:0};
    if(sql.includes('SELECT u.id, u.status')) return {rows:recovered?[recovered]:[],rowCount:recovered?1:0};
    if(sql.includes('SELECT id FROM identity.email_verification_tokens')) return {rows:[],rowCount:recent?1:0};
    writes.push({sql,values});
    return {rows:[],rowCount:1};
  }});
  return {run,writes,calls};
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

test('waitlist invitation requires its schema, matching eligible address and atomic binding before queueing', async () => {
  const waitlistId = '01900000-0000-7000-8000-000000000002';
  const payload = { ...input, waitlistId };
  const disabled = database();
  const disabledResponse = await handleEmailEnvelope(internal(payload), env, disabled.run);
  assert.equal(disabledResponse.status, 409);
  assert.equal((await disabledResponse.json()).error, 'waitlist_invite_not_eligible');
  assert.equal(disabled.calls.length, 0, 'schema-off requests must fail before opening a transaction');

  const ineligible = database({ waitlistEligible: false });
  const rejected = await handleEmailEnvelope(internal(payload), { ...env, WAITLIST_INVITE_SCHEMA_ENABLED: 'true' }, ineligible.run);
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error, 'waitlist_invite_not_eligible');
  assert.equal(ineligible.writes.some(row => /INSERT INTO identity\.(users|email_credentials|email_verification_tokens)|INSERT INTO system\.transactional_email_outbox/.test(row.sql)), false);

  const db = database();
  const response = await handleEmailEnvelope(internal(payload), { ...env, WAITLIST_INVITE_SCHEMA_ENABLED: 'true' }, db.run);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.result.deliveryState, 'queued');
  assert.equal(result.result.userId.length, 36);
  const eligibility = db.calls.findIndex(row => row.sql.includes('marketing.waitlist_invite_eligible'));
  const accountInsert = db.calls.findIndex(row => row.sql.includes('INSERT INTO identity.users'));
  const outboxInsert = db.calls.findIndex(row => row.sql.includes('INSERT INTO system.transactional_email_outbox'));
  const bind = db.calls.find(row => row.sql.includes('marketing.bind_waitlist_invite'));
  assert.ok(eligibility >= 0 && eligibility < accountInsert && accountInsert < outboxInsert);
  assert.ok(bind && db.calls.indexOf(bind) > outboxInsert, 'the waitlist binding is committed with the account and email outbox');
  assert.equal(bind.values[0], waitlistId);
  assert.equal(bind.values[1], result.result.userId);
  assert.equal(bind.values[4], lookup);
  const challenge = db.calls.find(row => row.sql.includes('INSERT INTO identity.email_verification_tokens'));
  assert.match(challenge.sql, /CASE WHEN \$4::boolean THEN interval '7 days'/);
  assert.equal(challenge.values[3], true);
  const outbox = db.writes.find(row => row.sql.includes('INSERT INTO system.transactional_email_outbox'));
  assert.equal(outbox.values[5], 'waitlist-v1');
  const envelope = JSON.parse(await decryptField({ ciphertext: outbox.values[8], encryptionKeyVersion: outbox.values[9] }, env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1));
  assert.equal(envelope.to, email);
  assert.match(envelope.token, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(db.writes).includes(email));
  assert.ok(!JSON.stringify(db.writes).includes(envelope.token));
});

test('expired or failed waitlist invitations reissue to the existing email-bound account', async () => {
  const waitlistId = '01900000-0000-7000-8000-000000000002';
  const existingUserId = '01900000-0000-7000-8000-000000000003';
  const db = database({ existingWaitlistInvite: { user_id: existingUserId, status: 'relink_required', email_lookup_hmac: lookup } });
  const response = await handleEmailEnvelope(internal({ ...input, waitlistId }), { ...env, WAITLIST_INVITE_SCHEMA_ENABLED: 'true' }, db.run);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.userId, existingUserId);
  assert.equal(db.writes.some(row => /INSERT INTO identity\.(users|email_credentials|contact_emails)/.test(row.sql)), false);
  assert.equal(db.calls.some(row => row.sql.includes('UNION SELECT user_id')), false);
  const bind = db.calls.find(row => row.sql.includes('marketing.bind_waitlist_invite'));
  assert.equal(bind.values[1], existingUserId);
  assert.equal(db.calls.some(row => row.sql.includes('marketing.waitlist_invite_reissue_user')), true);
  const audit = db.calls.find(row => row.sql.includes('INSERT INTO system.audit_events') && row.sql.includes('target_id, reason_code'));
  assert.equal(audit.values[6], 'marketing.waitlist_invite_reissued');
  assert.equal(JSON.parse(audit.values[5]).reissued, true);

  const redeemed = database({ existingWaitlistInvite: { user_id: existingUserId, status: 'active', email_lookup_hmac: lookup } });
  const rejected = await handleEmailEnvelope(internal({ ...input, waitlistId }), { ...env, WAITLIST_INVITE_SCHEMA_ENABLED: 'true' }, redeemed.run);
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error, 'waitlist_invite_not_eligible');
  assert.equal(redeemed.writes.some(row => /INSERT INTO identity\.(email_verification_tokens)|INSERT INTO system\.transactional_email_outbox/.test(row.sql)), false);
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
