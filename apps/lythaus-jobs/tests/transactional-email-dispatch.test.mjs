import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { encryptField, uuidv7 } from '@lythaus/security';
import { createTransactionalEmailDispatchMessage } from '../../../packages/security/src/transactional-email-dispatch.ts';
import {
  decryptTransactionalEmailEnvelope, emailProviderFailureCategory, handleTransactionalEmailLifecycleWebhook,
  readTransactionalEmailDeliveryEvidence, reconcileTransactionalEmailLifecycleQueueMessage,
  relayTransactionalEmailOutbox, sendTransactionalEmail, summarizeTransactionalEmailDeliveryEvidence,
  dispatchTransactionalEmailQueueMessage,
} from '../src/transactional-email-runtime.ts';

const key=randomBytes(32).toString('base64');
const base={ENVIRONMENT:'production',DB_JOBS_FRESH:{},TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:key,
  EMAIL_PROVIDER_MODE:'cloudflare',EMAIL_FROM:'no-reply@mail.lythaus.test',
  EMAIL_VERIFICATION_BASE_URL:'https://lythaus.co/verify-email',EMAIL_PASSWORD_RESET_BASE_URL:'https://lythaus.co/reset-password'};
const message={to:'fixture@example.invalid',subject:'Fixture',text:'Synthetic fixture only',html:'<p>Synthetic fixture</p>'};
const reply=(rows=[],rowCount=rows.length)=>({rows,rowCount});
async function row(overrides={}) {
  const envelope=await encryptField(JSON.stringify({to:message.to,token:'f'.repeat(64)}),key,'v1');
  return {id:uuidv7(),user_id:uuidv7(),purpose:'verification',attempt_count:1,template_version:'v1',correlation_id:uuidv7(),
    delivery_envelope_ciphertext:envelope.ciphertext,delivery_envelope_encryption_key_version:'v1',...overrides};
}
function database(rows,{valid=true,dispatchState='provider_accepted',retryAfterSeconds=45}={}) {
  const calls=[];
  const remaining=[...rows];
  const run=async(sql,values=[])=>{
    calls.push({sql,values});
    if(sql.includes('WITH claimable')){
      assert.equal(values[0],1);
      const index=values.length===1?0:remaining.findIndex(row=>row.id===values[1]);
      if(values.length===2)assert.match(sql,/AND id = \$2::uuid/);
      return reply(index<0?[]:remaining.splice(index,1));
    }
    if(sql.includes(' AS valid'))return reply([{valid}]);
    if(sql.includes(' AS retry_after_seconds'))return reply([{state:dispatchState,retry_after_seconds:retryAfterSeconds}]);
    return reply([],1);
  };
  return {calls,query:(_binding,sql,values)=>run(sql,values),transaction:(_binding,work)=>work({query:run})};
}

test('signed queue hint promptly dispatches only its intent and duplicate delivery cannot send again',async()=>{
  const unrelated=await row(),target=await row(),db=database([unrelated,target]);let sends=0;
  const hint=await createTransactionalEmailDispatchMessage(target.id,key);
  const env={...base,TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true',EMAIL:{send:async()=>{sends++;return {messageId:'synthetic-queued-send'};}}};
  assert.deepEqual(await dispatchTransactionalEmailQueueMessage(env,hint,db),{retryAfterSeconds:null});
  assert.deepEqual(await dispatchTransactionalEmailQueueMessage(env,hint,db),{retryAfterSeconds:null});
  assert.equal(sends,1);
  assert.ok(db.calls.filter(({sql})=>sql.includes('WITH claimable')).every(({values})=>values[1]===target.id));
});

test('unapproved or forged hints cannot query the database or send mail',async()=>{
  const target=await row(),hint=await createTransactionalEmailDispatchMessage(target.id,key),db=database([target]);
  for(const [env,message] of [[base,hint],[{...base,TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true'},{...hint,signature:'0'.repeat(64)}]]) {
    assert.deepEqual(await dispatchTransactionalEmailQueueMessage(env,message,db),{retryAfterSeconds:60});
  }
  assert.equal(db.calls.length,0);
});

test('delayed queue retry respects database due time and processing lease; terminal outcomes acknowledge',async()=>{
  const hint=await createTransactionalEmailDispatchMessage(uuidv7(),key);
  for(const [state,expected] of [['queued',45],['processing',60],['failed',null],['cancelled',null],['provider_accepted',null],['delivered',null]]) {
    const db=database([],{dispatchState:state});
    const env={...base,TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true',EMAIL:{send:()=>assert.fail('Must not resend an unclaimed intent')}};
    assert.deepEqual(await dispatchTransactionalEmailQueueMessage(env,hint,db),{retryAfterSeconds:expected});
  }
});

test('queued transient provider failure requests a delayed retry while unknown acceptance remains terminal',async()=>{
  for(const [error,state,expected] of [[{code:'E_INTERNAL_SERVER_ERROR'},'queued',45],[new Error('unknown acceptance'),'failed',null]]) {
    const target=await row(),db=database([target],{dispatchState:state}),hint=await createTransactionalEmailDispatchMessage(target.id,key);
    const env={...base,TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true',EMAIL:{send:async()=>{throw error;}}};
    assert.deepEqual(await dispatchTransactionalEmailQueueMessage(env,hint,db),{retryAfterSeconds:expected});
    const failure=db.calls.find(({sql})=>sql.includes('SET state = $2'));
    assert.equal(failure.values[1],state);
  }
});

test('dispatcher claims once, uses the scoped envelope and scrubs only after provider acceptance',async()=>{
  const claimed=await row(),db=database([claimed]);let sends=0;
  await relayTransactionalEmailOutbox({...base,EMAIL:{send:async data=>{
    sends++;assert.equal(data.to,message.to);assert.match(data.text,/#token=/);return {messageId:'synthetic-provider-id'};
  }}},db);
  assert.equal(sends,1);
  assert.match(db.calls[0].sql,/processing.*updated_at < now\(\) - interval '5 minutes'/s);
  assert.match(db.calls[0].sql,/E_DELIVERY_ACCEPTANCE_UNKNOWN/);
  assert.match(db.calls[1].sql,/FOR UPDATE SKIP LOCKED/);
  assert.ok(!db.calls.some(({sql})=>sql.includes('identity.contact_emails')));
  const accepted=db.calls.find(({sql})=>sql.includes("SET state = 'provider_accepted'"));
  assert.match(accepted.sql,/delivery_envelope_ciphertext = NULL/);
  assert.equal(accepted.values[2],'synthetic-provider-id');
});

test('expired, superseded or missing challenges cancel without sending',async()=>{
  const db=database([await row({user_id:null})],{valid:false});
  await relayTransactionalEmailOutbox({...base,EMAIL:{send:()=>assert.fail('must not send')}},db);
  const cancelled=db.calls.find(({sql})=>sql.includes("SET state='cancelled'"));
  assert.match(cancelled.sql,/delivery_envelope_ciphertext=NULL/);
});

test('explicit transient failures retain the same envelope; unknown/permanent/exhausted failures scrub it',async()=>{
  for(const [error,attempt,state,terminal] of [
    [{code:'E_RATE_LIMIT_EXCEEDED'},1,'queued',false],
    [{status:503},8,'failed',true],
    [{code:'E_RECIPIENT_SUPPRESSED'},1,'failed',true],
    [new Error('ambiguous network result'),1,'failed',true],
  ]) {
    const db=database([await row({attempt_count:attempt})]);
    await relayTransactionalEmailOutbox({...base,EMAIL:{send:async()=>{throw error;}}},db);
    const failure=db.calls.find(({sql})=>sql.includes('SET state = $2'));
    assert.equal(failure.values[1],state);assert.equal(failure.values[5],terminal);
    assert.match(failure.sql,/CASE WHEN \$6 THEN NULL ELSE delivery_envelope_ciphertext END/);
  }
});

test('missing/wrong keys and malformed encrypted envelopes never reach the provider',async()=>{
  for(const [env,record] of [
    [base,await row({delivery_envelope_ciphertext:null})],
    [{...base,TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:''},await row()],
    [{...base,TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:randomBytes(32).toString('base64')},await row()],
  ]) {
    const db=database([record]);await relayTransactionalEmailOutbox({...env,EMAIL:{send:()=>assert.fail('must not send')}},db);
    assert.ok(db.calls.some(({sql})=>sql.includes('SET state = $2')&&sql.includes('provider_error_category')));
  }
  for(const plaintext of ['not-json','null','{}','{"to":12,"token":null}']) {
    await assert.rejects(decryptTransactionalEmailEnvelope(await encryptField(plaintext,key,'v1'),key),/E_DELIVERY_ENVELOPE_INVALID/);
  }
});

test('provider adapter distinguishes missing configuration, missing message IDs and safe provider codes',async()=>{
  for(const env of [{...base,EMAIL_PROVIDER_MODE:'disabled'},base,{...base,EMAIL_PROVIDER_MODE:'unknown'},
    {...base,EMAIL:{send:async()=>({})}}, {...base,EMAIL:{send:async()=>{throw new Error('private details E_RECIPIENT_NOT_ALLOWED');}}}]) {
    await assert.rejects(sendTransactionalEmail(env,message));
  }
  assert.equal(emailProviderFailureCategory(null).category,'unknown');
  assert.equal(emailProviderFailureCategory({statusCode:503,errorCode:'E_INTERNAL_SERVER_ERROR'}).category,'transient');
  assert.equal(emailProviderFailureCategory({response:{status:400},code:'recipient@example.invalid'}).code,undefined);
});

test('just-in-time leases never claim waiting batch rows and each sweep is bounded',async()=>{
  const rows=await Promise.all(Array.from({length:26},()=>row()));
  const db=database(rows);let sends=0;
  await relayTransactionalEmailOutbox({...base,EMAIL:{send:async()=>{
    sends++;
    assert.equal(db.calls.filter(({sql})=>sql.includes('WITH claimable')).length,sends);
    return {messageId:`fixture-${sends}`};
  }}},db);
  assert.equal(sends,25);
});

test('fallback adapter never invents acceptance after a timeout or malformed response',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const env={...base,EMAIL_PROVIDER_MODE:'fallback',EMAIL_PROVIDER_URL:'https://fixture.invalid/send',EMAIL_PROVIDER_TOKEN:'local-fixture'};
  for(const response of [Response.json({code:'E_RECIPIENT_SUPPRESSED'},{status:400}),new Response('<html>failure</html>'),Response.json({})]) {
    globalThis.fetch=async()=>response;await assert.rejects(sendTransactionalEmail(env,message));
  }
  globalThis.fetch=async()=>{throw new Error('connection lost');};await assert.rejects(sendTransactionalEmail(env,message),/E_DELIVERY_ACCEPTANCE_UNKNOWN/);
  globalThis.fetch=async()=>Response.json({messageId:'synthetic-fallback'});
  assert.equal((await sendTransactionalEmail(env,message)).provider,'fallback-email');
});

test('read-only delivery evidence validates its bounds and selects aggregates only',async()=>{
  const calls=[];const db={query:async(_binding,sql,values)=>{calls.push({sql,values});return reply();}};
  const filter={correlationId:'synthetic-correlation',windowStart:'2026-09-01T00:00:00Z',windowEnd:'2026-09-01T01:00:00Z',challengeIds:[uuidv7()]};
  assert.equal((await readTransactionalEmailDeliveryEvidence(base,filter,db)).status,'no_matching_rows');
  assert.match(calls[0].sql,/challenge_id = ANY\(\$4::uuid\[\]\)/);
  assert.doesNotMatch(calls[0].sql.split('FROM')[0],/ciphertext|token_hash|email_lookup/);
  await readTransactionalEmailDeliveryEvidence(base,{...filter,challengeIds:undefined},db);
  for(const invalid of [{correlationId:'bad'}, {windowStart:'invalid'}, {windowEnd:filter.windowStart},
    {windowEnd:'2027-01-01'}, {challengeIds:[]}, {challengeIds:['not-a-uuid']}, {challengeIds:Array.from({length:33},()=>uuidv7())}]) {
    await assert.rejects(readTransactionalEmailDeliveryEvidence(base,{...filter,...invalid},db),/email_evidence_filter_invalid/);
  }
  assert.equal(summarizeTransactionalEmailDeliveryEvidence([{row_count:-1,accepted_count:'bad',delivered_count:-1}]).groups[0].rowCount,0);
});

test('protected lifecycle ingress rejects invalid input and unknown messages without exposing payloads',async()=>{
  const db={transaction:async(_binding,work)=>work({query:async()=>reply([],0)})};
  const env={...base,EMAIL_LIFECYCLE_WEBHOOK_SECRET:'synthetic-secret'};
  const request=(body,authorized=true)=>new Request('https://fixture.invalid/internal/email/lifecycle',{method:'POST',headers:authorized?{authorization:'Bearer synthetic-secret'}:{},body});
  assert.equal((await handleTransactionalEmailLifecycleWebhook(request('{}',false),env,db)).status,404);
  for(const body of ['not-json','null','[]'])assert.equal((await handleTransactionalEmailLifecycleWebhook(request(body),env,db)).status,400);
  assert.equal((await handleTransactionalEmailLifecycleWebhook(request(JSON.stringify({eventType:'message.delivered',messageId:'unknown'})),env,db)).status,409);
  assert.deepEqual(await reconcileTransactionalEmailLifecycleQueueMessage(env,{},db),{valid:false,reconciled:false});
  assert.deepEqual(await reconcileTransactionalEmailLifecycleQueueMessage(env,{type:'cf.email.sending.message.delivered',payload:{messageId:'unknown'}},db),{valid:true,reconciled:false});
});
