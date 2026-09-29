import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMailboxMx, mailboxDomain, observeMailboxProviders } from '../src/mailbox-provider.ts';
const dns=(...hosts)=>({Status:0,Answer:hosts.map(host=>({type:15,data:`10 ${host}.`}))});
test('provider classification is independent of recipient domain or plus alias',()=>{
  assert.equal(mailboxDomain('local+fixture@Example.invalid'),'example.invalid');
  for(const email of ['missing','local@bad..invalid','local@127.0.0.1','local@a.invalid/path'])assert.throws(()=>mailboxDomain(email));
  for(const host of ['smtp.google.com','aspmx.l.google.com','alt1.aspmx.l.google.com','alt1.aspmx.googlemail.com'])assert.equal(classifyMailboxMx(dns(host)),'google');
  assert.equal(classifyMailboxMx(dns('example.mail.protection.outlook.com')),'microsoft');
  for(const body of [null,{}, {Status:3}, {Status:0,TC:true,Answer:[]},dns(),dns('attacker.invalid'),dns('smtp.google.com.attacker.invalid'),dns('smtp.google.com','example.mail.protection.outlook.com'),{Status:0,Answer:[{type:15}]}])assert.throws(()=>classifyMailboxMx(body),/provider_unknown/);
});
test('bounded DNS observation requires different known providers, never exposes recipient addresses',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.ok(!url.includes('local%40'));assert.equal(options.headers.accept,'application/dns-json');assert.ok(options.signal);
      return Response.json(dns(url.includes('first.invalid')?'smtp.google.com':'example.mail.protection.outlook.com'));
    };
    const proof=await observeMailboxProviders('local@first.invalid','local@second.invalid');
    assert.equal(proof.initial,'google');assert.equal(proof.resend,'microsoft');assert.ok(!JSON.stringify(proof).includes('invalid'));
    await assert.rejects(()=>observeMailboxProviders('local@first.invalid','other@first.invalid'),/second_mail_provider/);
    globalThis.fetch=async()=>Response.json(dns('smtp.google.com'));
    await assert.rejects(()=>observeMailboxProviders('local@first.invalid','other@second.invalid'),/second_mail_provider/);
    globalThis.fetch=async()=>new Response(null,{status:503});
    await assert.rejects(()=>observeMailboxProviders('local@first.invalid','other@second.invalid'),/provider_unknown/);
    globalThis.fetch=async()=>{throw new Error('private network detail');};
    await assert.rejects(()=>observeMailboxProviders('local@first.invalid','other@second.invalid'),/^Error: acceptance_mailbox_provider_unknown$/);
  } finally {globalThis.fetch=original;}
});
