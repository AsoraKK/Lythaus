import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseRebindPolicy, parseRebindIntent, sealRebindPolicy, rebindCommitment } from '../src/solo-recovery/rebind-protocol.ts';
import { rebindRuntimeTarget, rebindSessionMatches } from '../src/solo-recovery/rebind-target.ts';

const input = { principalId: '01900000-0000-7000-8000-000000000001',
  previousDigest: Buffer.alloc(32,1), nextDigest: Buffer.alloc(32,2), sourceSha:'a'.repeat(40),
  workerVersionId:'01900000-0000-7000-8000-000000000002', emailSha256:'b'.repeat(64),
  nonceHex:'c'.repeat(64), expiresAt:1900000000 };
const intent = () => ({ schemaVersion:'lythaus-admin-subject-rebind-v2', mode:'preview', origin:'https://admin.lythaus.co',
  accessIssuer:'https://fixture.cloudflareaccess.com', accessAudience:'synthetic-api',
  notBefore:1899999700, expiresAt:1900000000, sourceSha:input.sourceSha, workerVersionId:input.workerVersionId,
  emailSha256:input.emailSha256, nonceHex:null, commitmentSha256:null, reference:'canonical-release:123:admin-subject-rebind',
  databaseTarget:{branchId:'vqa2g2xc9wsl',databaseName:'postgres',originFingerprint:'d'.repeat(64),roleFingerprint:'e'.repeat(64)} });
const bindingProof=()=>({schemaVersion:'lythaus-admin-rebind-binding-v1',worker:'lythaus-admin-api-development',binding:'DB_ADMIN_FRESH',
  hyperdriveId:'6bfbb0eab42642e8ad294dbf59294ed3',sourceSha:input.sourceSha,workerVersionId:input.workerVersionId,
  releaseRunId:'123',...intent().databaseTarget,checkedAt:intent().notBefore,expiresAt:intent().expiresAt});
const policy=()=>({...intent(),bindingProof:bindingProof()});

test('platform-local Hyperdrive uses the protected origin proof and actual database session role',async()=>{
  const now=Math.floor(Date.now()/1000),sha=value=>createHash('sha256').update(value).digest('hex');
  const target={...intent().databaseTarget,roleFingerprint:sha('lythaus-admin-diagnostic-role:v1:lythaus_admin')};
  const value={...policy(),notBefore:now-1,expiresAt:now+60,databaseTarget:target,
    bindingProof:{...bindingProof(),...target,checkedAt:now-1,expiresAt:now+60}};
  assert.ok(parseRebindPolicy(value));
  const proxy='postgresql://opaque:synthetic@fixture.hyperdrive.local:5432/postgres?sslmode=disable';
  const runtime=await rebindRuntimeTarget(proxy,value);
  assert.deepEqual(runtime,{kind:'platform-local'});
  const row={database_name:'postgres',current_role:'lythaus_admin.vqa2g2xc9wsl',session_role:'lythaus_admin.vqa2g2xc9wsl'};
  assert.equal(await rebindSessionMatches(row,value,runtime),true);
  assert.equal(await rebindSessionMatches({...row,current_role:'lythaus_admin',session_role:'lythaus_admin'},value,runtime),true);
  for(const patch of [{database_name:'other'},{current_role:'lythaus_admin'},
    {current_role:'lythaus_runtime',session_role:'lythaus_runtime'},
    {current_role:'lythaus_admin.other',session_role:'lythaus_admin.other'}]){
    assert.equal(await rebindSessionMatches({...row,...patch},value,runtime),false);
  }
  for(const url of [proxy.replace('postgresql:','https:'),proxy.replace('/postgres?','/other?'),
    proxy.replace(':5432/',':5433/'),proxy.replace('sslmode=disable','sslmode=verify-full'),
    proxy.replace('?sslmode=disable',''),proxy+'&sslmode=disable',proxy+'&extra=value',proxy+'#fragment',
    proxy.replace('fixture.hyperdrive.local','fixture.hyperdrive.local.evil.invalid')]){
    await assert.rejects(()=>rebindRuntimeTarget(url,value));
  }
  for(const patch of [{checkedAt:now+5},{expiresAt:now-1},{hyperdriveId:'a'.repeat(32)}]){
    await assert.rejects(()=>rebindRuntimeTarget(proxy,{...value,bindingProof:{...value.bindingProof,...patch}}));
  }
});

test('physical database connections retain exact origin, branch and role checks',async()=>{
  const sha=value=>createHash('sha256').update(value).digest('hex');
  const url='postgresql://lythaus_admin.vqa2g2xc9wsl:synthetic@db.example.invalid:5432/postgres?sslmode=verify-full';
  const target={...intent().databaseTarget,
    originFingerprint:sha(JSON.stringify({scheme:'postgres',host:'db.example.invalid',port:5432,database:'postgres'})),
    roleFingerprint:sha('lythaus-admin-diagnostic-role:v1:lythaus_admin')};
  const value={...policy(),databaseTarget:target,bindingProof:{...bindingProof(),...target}};
  const runtime=await rebindRuntimeTarget(url,value);
  assert.equal(runtime.kind,'physical');
  for(const changed of [url.replace('db.example.invalid','other.invalid'),url.replace('vqa2g2xc9wsl','other'),
    url.replace('lythaus_admin.','lythaus_runtime.'),url.replace('verify-full','disable')]){
    await assert.rejects(()=>rebindRuntimeTarget(changed,value));
  }
});

test('an approval intent cannot arm the Worker without a matching protected binding attestation',()=>{
  assert.ok(parseRebindIntent(intent()));assert.equal(parseRebindPolicy(intent()),null);
  assert.ok(sealRebindPolicy(intent(),bindingProof()));
  for(const patch of [{hyperdriveId:'a'.repeat(32)},{sourceSha:'b'.repeat(40)},{workerVersionId:'invalid'},
    {releaseRunId:'124'},{branchId:'other'},{databaseName:'other'},{originFingerprint:'a'.repeat(64)},
    {roleFingerprint:'a'.repeat(64)},{checkedAt:intent().notBefore-1},{checkedAt:intent().expiresAt},
    {checkedAt:1.5},{expiresAt:intent().expiresAt+1},{binding:'DB_PRIVACY_FRESH'},{extra:true}]){
    assert.equal(parseRebindPolicy({...policy(),bindingProof:{...bindingProof(),...patch}}),null);
  }
});

test('repair policy defaults disabled and refuses malformed, unbounded or ambiguous approvals', () => {
  for (const value of [undefined,null,'DISABLED','{',[],{},
    {...policy(),extra:true},{...policy(),expiresAt:policy().notBefore+901},
    {...policy(),sourceSha:null},{...policy(),mode:'execute'},
    {...policy(),origin:'https://unapproved.invalid'},
    {...policy(),databaseTarget:{...policy().databaseTarget,branchId:'other'}},
    ...Object.keys(policy()).filter(key=>!['nonceHex','commitmentSha256'].includes(key)).map(key=>({...policy(),[key]:null}))]) {
    assert.equal(parseRebindPolicy(value),null);
  }
  const parsed=parseRebindPolicy(JSON.stringify(policy()));
  assert.ok(parsed); assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.databaseTarget));
  assert.ok(parseRebindPolicy({...policy(),mode:'execute',nonceHex:input.nonceHex,commitmentSha256:'f'.repeat(64)}));
});

test('opaque approval commitment matches an independently constructed binary protocol vector', async () => {
  const expires=Buffer.alloc(8);expires.writeBigInt64BE(BigInt(input.expiresAt));
  const preimage=Buffer.concat([Buffer.from('lythaus:admin-subject-rebind:v1\0'),
    Buffer.from(input.principalId.replaceAll('-',''),'hex'), input.previousDigest, input.nextDigest,
    Buffer.from(input.sourceSha,'hex'),Buffer.from(input.workerVersionId.replaceAll('-',''),'hex'),
    Buffer.from(input.emailSha256,'hex'),Buffer.from(input.nonceHex,'hex'),expires]);
  const result=await rebindCommitment(input);
  assert.equal(result,createHash('sha256').update(preimage).digest('hex'));
  assert.match(result,/^[a-f0-9]{64}$/);
  for (const patch of [{principalId:'01900000-0000-7000-8000-000000000003'},
    {previousDigest:Buffer.alloc(32,4)},{nextDigest:Buffer.alloc(32,4)},
    {sourceSha:'e'.repeat(40)},{workerVersionId:'01900000-0000-7000-8000-000000000003'},
    {emailSha256:'e'.repeat(64)},{nonceHex:'e'.repeat(64)},{expiresAt:input.expiresAt+1}]) {
    assert.notEqual(await rebindCommitment({...input,...patch}),result);
  }
});

test('malformed identifiers and binary lengths cannot enter the commitment protocol', async () => {
  for (const patch of [{principalId:'invalid'},{previousDigest:Buffer.alloc(31)},{nextDigest:Buffer.alloc(33)},
    {sourceSha:'A'.repeat(40)},{emailSha256:'invalid'},{nonceHex:'invalid'},{expiresAt:Infinity},{expiresAt:-1}]) {
    await assert.rejects(()=>rebindCommitment({...input,...patch}),/admin_rebind_commitment_input_invalid/);
  }
});
