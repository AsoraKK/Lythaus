import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock, test } from 'node:test';
import { uuidv7 } from '@lythaus/security';
import { publishCommittedEmailDispatch } from '../src/auth-email-dispatch-queue.ts';
import { createTransactionalEmailDispatchMessage, parseTransactionalEmailDispatchMessage, verifyTransactionalEmailDispatchMessage } from '../../../packages/security/src/transactional-email-dispatch.ts';

const logs=[];
mock.method(console,'log',value=>logs.push(JSON.parse(value)));
const key=randomBytes(32).toString('base64');

test('dispatch hints are scoped, signed and contain no email content or credential',async()=>{
  const id=uuidv7(),message=await createTransactionalEmailDispatchMessage(id,key);
  assert.deepEqual(Object.keys(message).sort(),['outboxId','signature','type']);
  assert.deepEqual(await verifyTransactionalEmailDispatchMessage(message,key),message);
  for(const invalid of [null,'{}',[],{...message,signature:'f'.repeat(64)},
    {...message,outboxId:uuidv7()},{...message,to:'fixture@example.invalid'},
    {...message,type:'cf.email.sending.message.delivered'}, {...message,outboxId:'not-a-uuid'},
    {...message,signature:'bad'},{type:message.type,outboxId:id,nonce:'unexpected'}])assert.equal(await verifyTransactionalEmailDispatchMessage(invalid,key),undefined);
  assert.equal(await verifyTransactionalEmailDispatchMessage(message,randomBytes(32).toString('base64')),undefined);
  assert.equal(await verifyTransactionalEmailDispatchMessage(message,''),undefined);
  assert.equal(await verifyTransactionalEmailDispatchMessage(message,'malformed'),undefined);
  await assert.rejects(createTransactionalEmailDispatchMessage(id,'malformed'),/email_dispatch_key_unavailable/);
  await assert.rejects(createTransactionalEmailDispatchMessage('not-a-uuid',key),/email_dispatch_intent_invalid/);
  assert.equal(parseTransactionalEmailDispatchMessage({type:message.type,outboxId:id}),undefined);
});

test('unapproved dispatch and absent intent never publish; approved hints reach the bound queue',async()=>{
  const messages=[],id=uuidv7(),env={TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:key,
    TRANSACTIONAL_EMAIL_DISPATCH_QUEUE:{send:async message=>messages.push(message)}};
  assert.equal(await publishCommittedEmailDispatch(env,id),'skipped');
  assert.equal(await publishCommittedEmailDispatch({...env,TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'false'},id),'skipped');
  const enabled={...env,TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true'};
  assert.equal(await publishCommittedEmailDispatch(enabled),'skipped');
  assert.equal(messages.length,0);
  assert.equal(await publishCommittedEmailDispatch(enabled,id),'published');
  assert.equal(messages.length,1);
  assert.equal((await verifyTransactionalEmailDispatchMessage(messages[0],key)).outboxId,id);
});

test('lost publish and missing binding/key preserve committed intent and emit only a sanitized category',async()=>{
  const start=logs.length,id=uuidv7();
  for(const env of [
    {TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true'},
    {TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true',TRANSACTIONAL_EMAIL_DISPATCH_QUEUE:{send:()=>assert.fail('must not publish without a key')}},
    {TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true',TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:key,
      TRANSACTIONAL_EMAIL_DISPATCH_QUEUE:{send:async()=>{throw new Error('private provider data');}}},
  ])assert.equal(await publishCommittedEmailDispatch(env,id),'deferred');
  assert.equal(logs.length-start,3);
  for(const event of logs.slice(start)) {
    assert.equal(event.service,'lythaus-public-api');assert.equal(event.event,'transactional_email_dispatch_deferred');
    assert.deepEqual(Object.keys(event).sort(),['event','service','timestamp']);
  }
  assert.ok(!JSON.stringify(logs).includes(key));
  assert.ok(!JSON.stringify(logs).includes(id));
});

test('an unresponsive queue cannot indefinitely hold the accepted intake response',async()=>{
  const env={TRANSACTIONAL_EMAIL_DISPATCH_ENABLED:'true',TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:key,
    TRANSACTIONAL_EMAIL_DISPATCH_QUEUE:{send:()=>new Promise(()=>{})}};
  assert.equal(await publishCommittedEmailDispatch(env,uuidv7()),'deferred');
});
