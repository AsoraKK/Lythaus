import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import test, { mock } from 'node:test';
import pg from 'pg';
import * as jose from 'jose';
import { parseRebindPolicy, rebindCommitment } from '../src/solo-recovery/rebind-protocol.ts';
import {rebindGrantPayload,installReviewedRebindCapability,REBIND_BOUNDARY_SQL}
  from '../../../scripts/ci/admin-subject-rebind-capability.mjs';

const RealClient = pg.Client;
let transactionFault = null;
class LocalBindingClient extends RealClient {
  constructor(config) {
    const url = new URL(config.connectionString);
    assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname));
    assert.equal(url.port, new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL).port);
    url.searchParams.delete('sslmode'); url.searchParams.delete('sslrootcert');
    super({...config,connectionString:url.href,ssl:false});
    this.membershipReads=0;this.mutationCalled=false;this.committed=false;
  }
  async query(statement,values) {
    if(statement===REBIND_MEMBERSHIP_SQL&&++this.membershipReads===2&&transactionFault==='readback') {
      transactionFault=null;throw new Error('synthetic_readback_failure');
    }
    if(typeof statement==='string'&&statement.startsWith('SELECT identity.rebind_control_plane_administrator'))this.mutationCalled=true;
    const result=await super.query(statement,values);
    if(statement==='COMMIT') {
      this.committed=true;
      if(this.mutationCalled&&transactionFault==='commit_ack') {transactionFault=null;throw new Error('synthetic_commit_ack_lost');}
    }
    return result;
  }
  async end() {
    await super.end();
    if(this.committed&&this.mutationCalled&&transactionFault==='close') {transactionFault=null;throw new Error('synthetic_close_after_commit');}
  }
}
mock.module('pg',{cache:true,defaultExport:pg,namedExports:{Client:LocalBindingClient}});

const keys = await jose.generateKeyPair('RS256'), wrongKeys = await jose.generateKeyPair('RS256');
const jwks = jose.createLocalJWKSet({keys:[{...await jose.exportJWK(keys.publicKey),kid:'fixture'}]});
mock.module('jose',{cache:true,namedExports:{...jose,createRemoteJWKSet:url=>{
  assert.equal(url.href,'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs'); return jwks;
}}});
const {handleSubjectRebind,SUBJECT_REBIND_PATH,SUBJECT_REBIND_CONFIRMATION,REBIND_MEMBERSHIP_SQL}=await import('../src/solo-recovery/subject-rebind.ts');
const {hmacLookup}=await import('../../../packages/security/src/index.ts');
const {verifiedAccessSubject,requireActiveAdminMembership}=await import('../src/admin-access-runtime-policy.ts');
const {default:adminWorker}=await import('../src/bootstrap-wrapper.ts');

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
const target = new URL(connectionString);
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(target.hostname), 'proposal validation is local only');
assert.equal(process.env.LYTHAUS_LOCAL_REBIND_PROPOSAL_TEST, 'synthetic');
const signature = 'identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)';
const statement = 'SELECT identity.rebind_control_plane_administrator($1::bytea,$2::text,$3::uuid,$4::text,$5::bytea,$6::bigint,$7::uuid,$8::text) AS changed';
const sql = fs.readFileSync(new URL('../../../database/planetscale/grants/admin-subject-rebind.sql', import.meta.url), 'utf8');
const id = n => '01900000-0000-7000-8000-' + n.toString().padStart(12, '0');
const previousDigest = Buffer.alloc(32, 1), nextDigest = Buffer.alloc(32, 2);
const input = { principalId: id(1), previousDigest, nextDigest, sourceSha: 'a'.repeat(40),
  workerVersionId: id(2), emailSha256: 'b'.repeat(64), nonceHex: 'c'.repeat(64) };
const connect = async () => { const client = new pg.Client({ connectionString, ssl: false }); await client.connect(); return client; };
const args = (policy, overrides = {}) => {
  const value = { ...input, expiresAt: policy.expiresAt, auditId: id(10), correlationId: 'synthetic-rebind', ...overrides };
  return [value.nextDigest, value.sourceSha, value.workerVersionId, value.emailSha256,
    Buffer.from(value.nonceHex, 'hex'), value.expiresAt, value.auditId, value.correlationId];
};
async function policy(patch = {}) {
  const now = Math.floor(Date.now() / 1000);
  const value = { schemaVersion: 'lythaus-admin-subject-rebind-v2', mode: 'execute', origin: 'https://admin.lythaus.co',
    accessIssuer: 'https://fixture.cloudflareaccess.com', accessAudience: 'synthetic-api',
    sourceSha: input.sourceSha, workerVersionId: input.workerVersionId, emailSha256: input.emailSha256,
    notBefore: now - 5, expiresAt: now + 300, commitmentSha256: null, nonceHex: input.nonceHex,
    reference: 'canonical-release:123:admin-subject-rebind',
    databaseTarget: { branchId: 'vqa2g2xc9wsl', databaseName: 'postgres', originFingerprint: 'd'.repeat(64), roleFingerprint: 'e'.repeat(64) }, ...patch };
  value.commitmentSha256 = await rebindCommitment({ ...input, expiresAt: value.expiresAt });
  value.bindingProof=proofFor(value);
  return value;
}
function proofFor(value){return {schemaVersion:'lythaus-admin-rebind-binding-v1',worker:'lythaus-admin-api-development',binding:'DB_ADMIN_FRESH',
  hyperdriveId:'6bfbb0eab42642e8ad294dbf59294ed3',sourceSha:value.sourceSha,workerVersionId:value.workerVersionId,
  releaseRunId:'123',...value.databaseTarget,checkedAt:value.notBefore,expiresAt:value.expiresAt};}
async function approve(owner, value) {
  const literal = JSON.stringify(value).replaceAll("'", "''");
  await owner.query(`ALTER FUNCTION ${signature} SET lythaus.admin_subject_rebind_approval = '${literal}'`);
}
async function call(value, overrides = {}, role = 'lythaus_admin', prepare = async () => {}) {
  const client = await connect();
  try {
    assert.ok(['lythaus_admin','lythaus_runtime','lythaus_jobs','lythaus_privacy'].includes(role));
    await client.query('SET ROLE ' + role);
    await prepare(client);
    return (await client.query(statement, args(value, overrides))).rows[0].changed;
  } finally { await client.end(); }
}
async function seed(owner) {
  await owner.query('TRUNCATE identity.users CASCADE');
  await owner.query("DELETE FROM system.audit_events WHERE action IN ('identity.first_admin_bootstrapped','identity.admin_subject_rebound','test.rebind.duplicate')");
  await owner.query("UPDATE system.feature_flags SET enabled=false WHERE flag_key='identity.first_admin_bootstrap_consumed'");
  assert.equal((await owner.query('SELECT identity.bootstrap_first_administrator($1,$2,$3,$4) AS created',
    [id(1), previousDigest, id(3), 'synthetic-bootstrap'])).rows[0].created, true);
  await owner.query(`DROP FUNCTION IF EXISTS ${signature}`);
  await owner.query(sql);
}
async function unchanged(owner, digest = previousDigest) {
  const result = await owner.query(`SELECT
    (SELECT count(*)=1 FROM identity.admin_memberships) AS one_membership,
    (SELECT access_subject_hmac=$1 AND user_id=$2 AND role='administrator' AND active AND revoked_at IS NULL FROM identity.admin_memberships) AS binding_matches,
    (SELECT count(*)=0 FROM system.audit_events WHERE action='identity.admin_subject_rebound') AS no_rebind,
    (SELECT enabled FROM system.feature_flags WHERE flag_key='identity.first_admin_bootstrap_consumed') AS consumed`, [digest,id(1)]);
  assert.deepEqual(result.rows[0], { one_membership: true, binding_matches: true, no_rebind: true, consumed: true });
}
async function callerBlockedByOwner(owner, callerPid) {
  for(let attempt=0;attempt<100;attempt++) {
    const pid=callerPid();
    if(pid){
      const row=(await owner.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS blocked',[pid])).rows[0];
      if(row.blocked)return true;
    }
    await delay(10);
  }
  return false;
}

test('local PG17 proposal preserves authorization while permitting only an exact approved identity rebind', { timeout: 30000 }, async t => {
  const owner = await connect();
  try {
    const version = Number((await owner.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
    assert.ok(version >= 170000 && version < 180000);
    await t.test('disabled function ignores a caller-created approval GUC', async () => {
      await seed(owner); const p = await policy();
      assert.equal(await call(p, {}, 'lythaus_admin', client => client.query(
        "SELECT set_config('lythaus.admin_subject_rebind_approval',$1,false)", [JSON.stringify(p)])), false);
      await unchanged(owner);
    });
    await t.test('other runtime roles cannot execute, and admin cannot update directly or approve itself', async () => {
      await seed(owner); const p = await policy(); await approve(owner,p);
      for (const role of ['lythaus_runtime','lythaus_jobs','lythaus_privacy']) {
        await assert.rejects(() => call(p,{},role), error => error.code === '42501');
      }
      for (const statement of ['UPDATE identity.admin_memberships SET active=false',
        `ALTER FUNCTION ${signature} RESET lythaus.admin_subject_rebind_approval`]) {
        await assert.rejects(() => call(p,{},'lythaus_admin',client => client.query(statement)), error => error.code === '42501');
      }
      await unchanged(owner);
    });
    await t.test('exact commitment changes only the existing digest and adds a sanitized atomic audit', async () => {
      await seed(owner); const p = await policy(); assert.ok(parseRebindPolicy(p)); await approve(owner,p);
      const before = (await owner.query('SELECT to_jsonb(m)-\'access_subject_hmac\' AS row FROM identity.admin_memberships m')).rows[0].row;
      assert.equal(await call(p), true);
      const after = (await owner.query('SELECT to_jsonb(m)-\'access_subject_hmac\' AS row FROM identity.admin_memberships m')).rows[0].row;
      assert.deepEqual(after,before);
      const state = (await owner.query(`SELECT
        (SELECT access_subject_hmac=$1 FROM identity.admin_memberships WHERE user_id=$2) AS matches_new,
        (SELECT status='locked' AND deleted_at IS NULL FROM identity.users WHERE id=$2) AS remains_locked,
        (SELECT enabled FROM system.feature_flags WHERE flag_key='identity.first_admin_bootstrap_consumed') AS consumed,
        (SELECT count(*) FROM system.audit_events WHERE action='identity.admin_subject_rebound')::integer AS audits`,[nextDigest,id(1)])).rows[0];
      assert.deepEqual(state,{matches_new:true,remains_locked:true,consumed:true,audits:1});
      const audit = (await owner.query("SELECT metadata FROM system.audit_events WHERE action='identity.admin_subject_rebound'")).rows[0].metadata;
      assert.deepEqual(Object.keys(audit).sort(), ['approvalCommitmentSha256','approvalReference','changedCount','principalType','role','sourceSha','workerVersionId']);
      assert.equal(audit.approvalCommitmentSha256,p.commitmentSha256);
      assert.equal(await call(p,{auditId:id(11)}), false, 'replay is inert');
    });
    await t.test('changed identity, key output, source, version, email, nonce or expiry is refused', async () => {
      await seed(owner); const p = await policy(); await approve(owner,p);
      for (const patch of [{nextDigest:Buffer.alloc(32,7)},{sourceSha:'f'.repeat(40)},
        {workerVersionId:id(9)},{emailSha256:'f'.repeat(64)},{nonceHex:'f'.repeat(64)},{expiresAt:p.expiresAt+1}]) {
        assert.equal(await call(p,patch),false); await unchanged(owner);
      }
      await owner.query('UPDATE identity.admin_memberships SET access_subject_hmac=$1',[Buffer.alloc(32,3)]);
      assert.equal(await call(p),false); await unchanged(owner,Buffer.alloc(32,3));
    });
    await t.test('null, malformed, overlong, expired, preview or wrong-target policies never enable writes', async () => {
      await seed(owner); const p = await policy();
      const bad = [null,[],{},'DISABLED',{...p,extra:true},{...p,mode:'preview',commitmentSha256:null},
        {...p,expiresAt:p.notBefore-1},{...p,notBefore:p.expiresAt-901},
        {...p,notBefore:1,expiresAt:2},{...p,databaseTarget:{...p.databaseTarget,branchId:'other'}},
        ...Object.keys(p).map(key=>({...p,[key]:null})),
        ...Object.keys(p.bindingProof).map(key=>({...p,bindingProof:{...p.bindingProof,[key]:null}})),
        ...[{releaseRunId:'124'},{sourceSha:'f'.repeat(40)},{checkedAt:Math.floor(Date.now()/1000)+30},
          {branchId:'other'},{originFingerprint:'f'.repeat(64)},{roleFingerprint:'f'.repeat(64)},
          {expiresAt:p.expiresAt+1},{extra:true}].map(patch=>({...p,bindingProof:{...p.bindingProof,...patch}})),
        ...Object.keys(p.databaseTarget).map(key=>({...p,databaseTarget:{...p.databaseTarget,[key]:null}}))];
      for (const value of bad) { await approve(owner,value); assert.equal(await call(p),false); await unchanged(owner); }
    });
    await t.test('membership, role, principal and durable bootstrap evidence cannot drift', async () => {
      for (const mutation of ["UPDATE identity.admin_memberships SET active=false",
        "UPDATE identity.admin_memberships SET role='owner'", "UPDATE identity.admin_memberships SET revoked_at=now()",
        "UPDATE identity.users SET status='active'", "UPDATE identity.users SET deleted_at=now()",
        "UPDATE system.feature_flags SET enabled=false WHERE flag_key='identity.first_admin_bootstrap_consumed'",
        "DELETE FROM system.audit_events WHERE action='identity.first_admin_bootstrapped'",
        "DELETE FROM identity.admin_memberships"]) {
        await seed(owner); const p=await policy(); await approve(owner,p); await owner.query(mutation);
        assert.equal(await call(p),false);
        assert.equal((await owner.query("SELECT count(*)::integer AS count FROM system.audit_events WHERE action='identity.admin_subject_rebound'")).rows[0].count,0);
      }
    });
    await t.test('audit failure rolls back the digest change and retains the original membership', async () => {
      await seed(owner); const p=await policy(); await approve(owner,p);
      await owner.query("INSERT INTO system.audit_events(id,action,correlation_id,metadata) VALUES($1,'test.rebind.duplicate','synthetic-duplicate','{}')",[id(10)]);
      await assert.rejects(()=>call(p),error=>error.code==='23505'); await unchanged(owner);
    });
    await t.test('concurrent identical requests consume one approval exactly once', async () => {
      await seed(owner); const p=await policy(); await approve(owner,p);
      const results=await Promise.all([call(p,{auditId:id(10)}),call(p,{auditId:id(11)})]);
      assert.deepEqual(results.sort(),[false,true]);
      assert.equal((await owner.query("SELECT count(*)::integer AS count FROM system.audit_events WHERE action='identity.admin_subject_rebound'")).rows[0].count,1);
    });
    await t.test('a reverse mapping requires a new exact approval and preserves the original principal', async () => {
      await seed(owner);const p=await policy();await approve(owner,p);assert.equal(await call(p),true);
      const reverse={...p,nonceHex:'f'.repeat(64)};
      reverse.commitmentSha256=await rebindCommitment({...input,previousDigest:nextDigest,nextDigest:previousDigest,
        nonceHex:reverse.nonceHex,expiresAt:reverse.expiresAt});
      assert.equal(await call(reverse,{nextDigest:previousDigest,nonceHex:reverse.nonceHex,auditId:id(12)}),false);
      await approve(owner,reverse);
      assert.equal(await call(reverse,{nextDigest:previousDigest,nonceHex:reverse.nonceHex,auditId:id(12)}),true);
      assert.equal((await owner.query('SELECT access_subject_hmac=$1 AND user_id=$2 AND role=\'administrator\' AND active AS original_restored FROM identity.admin_memberships',[previousDigest,id(1)])).rows[0].original_restored,true);
      assert.equal((await owner.query("SELECT count(*)::integer AS count FROM system.audit_events WHERE action='identity.admin_subject_rebound'")).rows[0].count,2);
    });
    await t.test('an approval expiring while a lock is held cannot perform a late write', async () => {
      await seed(owner); const now=Math.floor(Date.now()/1000),p=await policy({notBefore:now-1,expiresAt:now+1});
      await approve(owner,p); await owner.query('BEGIN');
      await owner.query("SELECT pg_advisory_xact_lock(hashtext('lythaus:first-admin-bootstrap:v1'))");
      const pending=call(p); await delay(2100); await owner.query('COMMIT');
      assert.equal(await pending,false); await unchanged(owner);
    });
    await t.test('expiry during the principal row lock refuses a late direct call',async()=>{
      await seed(owner);const now=Math.floor(Date.now()/1000),p=await policy({notBefore:now-1,expiresAt:now+3});
      await approve(owner,p);await owner.query('BEGIN');await owner.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE',[id(1)]);
      let callerPid;
      const pending=call(p,{},'lythaus_admin',async client=>{callerPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;}).then(value=>({value}),error=>({error}));let blocked;
      try{blocked=await callerBlockedByOwner(owner,()=>callerPid);await delay(Math.max(0,p.expiresAt*1000-Date.now())+80);}
      finally{await owner.query('ROLLBACK');}
      const observed=await pending;assert.equal(blocked,true,'caller reached the principal row wait before expiry');
      if(observed.error)throw observed.error;assert.equal(observed.value,false);await unchanged(owner);
    });
    await t.test('expiry during the audit insertion rolls back the earlier update',async()=>{
      await seed(owner);const now=Math.floor(Date.now()/1000),p=await policy({notBefore:now-1,expiresAt:now+3});
      await approve(owner,p);await owner.query('BEGIN');await owner.query('LOCK TABLE system.audit_events IN SHARE MODE');
      let callerPid;
      const pending=call(p,{},'lythaus_admin',async client=>{callerPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;}).then(value=>({value}),error=>({error}));let blocked;
      try{blocked=await callerBlockedByOwner(owner,()=>callerPid);await delay(Math.max(0,p.expiresAt*1000-Date.now())+80);}
      finally{await owner.query('ROLLBACK');}
      const observed=await pending;assert.equal(blocked,true,'caller reached the audit insertion wait before expiry');
      assert.equal(observed.error?.code,'57014');await unchanged(owner);
    });
    await t.test('real signed Access identity and restricted PG17 handler preserve the normal lookup path', async () => {
      const username='lythaus_admin.vqa2g2xc9wsl';
      await owner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${username}') THEN CREATE ROLE "${username}" LOGIN PASSWORD 'synthetic_rebind_http'; END IF; END $$`);
      await owner.query(`GRANT lythaus_admin TO "${username}"`);
      const dbUrl=new URL(connectionString);dbUrl.username=username;dbUrl.password='synthetic_rebind_http';
      const envUrl=new URL(dbUrl);envUrl.searchParams.set('sslmode','verify-full');
      const email='owner@example.invalid',subject='synthetic-new-subject',key='synthetic-worker-only-key';
      const env={WORKER_VERSION:{id:input.workerVersionId,tag:input.sourceSha},
        DB_ADMIN_FRESH:{connectionString:envUrl.href},ACCESS_SUBJECT_HMAC_KEY:key,
        ACCESS_JWKS_URL:'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',
        ACCESS_AUDIENCES:'synthetic-api',EXPECTED_HOSTNAMES:'admin.lythaus.co',CORS_ALLOWED_ORIGINS:'https://admin.lythaus.co'};
      const proxyEnv={...env,DB_ADMIN_FRESH:{connectionString:'postgresql://opaque:synthetic@fixture.hyperdrive.local:5432/postgres?sslmode=disable'}};
      const sha=value=>createHash('sha256').update(value).digest('hex');
      const dbTarget={branchId:'vqa2g2xc9wsl',databaseName:'postgres',
        originFingerprint:sha(JSON.stringify({scheme:'postgres',host:dbUrl.hostname.toLowerCase(),port:Number(dbUrl.port||5432),database:'postgres'})),
        roleFingerprint:sha('lythaus-admin-diagnostic-role:v1:lythaus_admin')};
      const sign=async(patch={},privateKey=keys.privateKey)=>new jose.SignJWT({
        iss:'https://fixture.cloudflareaccess.com',aud:['synthetic-api'],sub:subject,email,type:'app',
        exp:Math.floor(Date.now()/1000)+3600,...patch}).setProtectedHeader({alg:'RS256',kid:'fixture'}).sign(privateKey);
      const request=async({method='GET',claims={},privateKey=keys.privateKey,origin='https://admin.lythaus.co',body={confirmation:SUBJECT_REBIND_CONFIRMATION},accept='application/json'}={})=>new Request('https://admin.lythaus.co'+SUBJECT_REBIND_PATH,{
        method,headers:{'cf-access-jwt-assertion':await sign(claims,privateKey),accept,
          ...(method==='POST'?{'origin':origin,'content-type':'application/json'}:{})},
        ...(method==='POST'?{body:JSON.stringify(body)}:{})});
      const trace=[];
      const run=async(binding,work)=>{
        assert.ok([env.DB_ADMIN_FRESH,proxyEnv.DB_ADMIN_FRESH].includes(binding));
        const client=new pg.Client({connectionString:dbUrl.href,ssl:false});await client.connect();
        try{await client.query('BEGIN');trace.push('BEGIN');const result=await work(client);
          await client.query('COMMIT');trace.push('COMMIT');return result;
        }catch(error){await client.query('ROLLBACK');trace.push('ROLLBACK');throw error;}finally{await client.end();}
      };
      const previewPolicy=async()=>{const value={...await policy(),mode:'preview',commitmentSha256:null,nonceHex:null,
        emailSha256:sha(email),databaseTarget:dbTarget};return {...value,bindingProof:proofFor(value)};};
      await seed(owner);
      assert.equal((await handleSubjectRebind(await request(),env,{run})).status,404,'installed proposal remains disabled');
      const safeRead=async(claims={})=>adminWorker.fetch(new Request('https://admin.lythaus.co/api/admin/moderation/cases',{
        headers:{'cf-access-jwt-assertion':await sign(claims),accept:'application/json'},
      }),env);
      assert.equal((await safeRead()).status,403,'unmapped identity cannot read admin cases');
      let p=await previewPolicy();await approve(owner,p);
      for(const args of [{claims:{email:'other@example.invalid'}},{claims:{type:'service',common_name:'service'}},
        {claims:{aud:['other']}},{claims:{exp:Math.floor(Date.now()/1000)-1}},{privateKey:wrongKeys.privateKey}]){
        assert.equal((await handleSubjectRebind(await request(args),env,{run})).status,404);
        await unchanged(owner);
      }
      for(const changed of [{...env,WORKER_VERSION:{...env.WORKER_VERSION,tag:'f'.repeat(40)}},
        {...env,WORKER_VERSION:{...env.WORKER_VERSION,id:id(9)}},
        {...env,DB_ADMIN_FRESH:{connectionString:envUrl.href.replace('vqa2g2xc9wsl','other')}}]){
        assert.equal((await handleSubjectRebind(await request(),changed,{run:async(binding,work)=>run(env.DB_ADMIN_FRESH,work)})).status,404);
      }
      const previewResponse=await handleSubjectRebind(await request(),env,{run}),preview=await previewResponse.json();
      assert.equal(previewResponse.status,200);assert.equal(preview.status,'preview_ready');
      assert.equal(preview.databaseTransactionReadOnly,true);await unchanged(owner);
      const text=JSON.stringify(preview);
      for(const sensitive of [email,subject,key,id(1),previousDigest.toString('hex'),previousDigest.toString('base64'),hmacLookup(subject,key)]){
        assert.equal(text.includes(sensitive),false,'preview contains no private identity, key or digest');
      }
      assert.equal((await handleSubjectRebind(await request({method:'POST'}),env,{run})).status,404,'preview does not authorize a write');
      p={...p,mode:'execute',...preview.reviewPacket};await approve(owner,p);
      assert.equal(parseRebindPolicy(p)?.mode,'execute');
      const ready=await handleSubjectRebind(await request({accept:'text/html'}),env,{run});
      assert.equal(ready.status,200);assert.match(ready.headers.get('content-security-policy'),/default-src 'none'/);
      assert.match(await ready.text(),/Update sign-in/);
      for(const args of [{method:'POST',claims:{sub:'different-signed-subject'}},
        {method:'POST',origin:'https://other.invalid'},{method:'POST',body:{confirmation:SUBJECT_REBIND_CONFIRMATION,extra:true}}]){
        assert.equal((await handleSubjectRebind(await request(args),env,{run})).status,404);await unchanged(owner);
      }
      const failAfterWrite=async(binding,work)=>run(binding,client=>{
        let reads=0;
        return work({query:async(statement,values)=>{
          if(statement===REBIND_MEMBERSHIP_SQL&&++reads===2)throw new Error('synthetic_readback_failure');
          return client.query(statement,values);
        }});
      });
      assert.equal((await handleSubjectRebind(await request({method:'POST'}),env,{run:failAfterWrite})).status,409);
      await unchanged(owner);assert.equal(trace.at(-1),'ROLLBACK');
      transactionFault='readback';
      assert.equal((await handleSubjectRebind(await request({method:'POST'}),env)).status,404,'actual verified rollback is distinguishable');
      await unchanged(owner);
      const applied=await handleSubjectRebind(await request({method:'POST'}),env,{run});
      assert.equal(applied.status,200);assert.equal((await applied.json()).status,'rebound');
      await owner.query('REVOKE SELECT (user_id, verified_at) ON identity.contact_emails, identity.email_credentials FROM lythaus_admin');
      const accepted=await safeRead();
      assert.equal(accepted.status,200,'preserved administrator can perform the safe read without the summary grants');
      assert.equal(accepted.headers.get('x-lythaus-source-sha'),env.WORKER_VERSION.tag);
      assert.equal(accepted.headers.get('x-lythaus-worker-version'),env.WORKER_VERSION.id);
      assert.ok(Array.isArray((await accepted.json()).items));
      assert.equal((await safeRead({sub:'synthetic-non-admin'})).status,403);
      const overview=await adminWorker.fetch(new Request('https://admin.lythaus.co/api/admin/overview?period=today',{
        headers:{'cf-access-jwt-assertion':await sign(),accept:'application/json'},
      }),env);
      assert.equal(overview.status,403,'repair does not grant owner privileges');
      assert.equal((await overview.json()).error,'overview_owner_required');
      const verified=await verifiedAccessSubject(await request(),env);
      const authenticated=new pg.Client({connectionString:dbUrl.href,ssl:false});await authenticated.connect();
      try{
        const result=await authenticated.query(`SELECT user_id,role FROM identity.admin_memberships WHERE access_subject_hmac=decode($1,'base64') AND active=true`,[hmacLookup(verified,key)]);
        assert.equal(result.rowCount,1);assert.deepEqual(requireActiveAdminMembership(result.rows[0]),{userId:id(1),role:'administrator'});
      }finally{await authenticated.end();}
      assert.equal((await handleSubjectRebind(await request(),env,{run})).status,200);
      const replay=await handleSubjectRebind(await request({method:'POST'}),env,{run});
      assert.equal(replay.status,200);assert.equal((await replay.json()).writePerformed,false,'HTTP replay performs no write');
      assert.equal((await owner.query("SELECT count(*)::integer AS count FROM system.audit_events WHERE action='identity.admin_subject_rebound'")).rows[0].count,1);
      for(const fault of ['commit_ack','close']) {
        await seed(owner);await approve(owner,p);transactionFault=fault;
        const uncertain=await handleSubjectRebind(await request({method:'POST'}),env);
        assert.equal(uncertain.status,409);assert.equal((await uncertain.json()).readOnlyReconciliationRequired,true);
        const check=await handleSubjectRebind(await request(),env);
        assert.equal(check.status,200);assert.equal((await check.json()).status,'already_bound');
        const again=await handleSubjectRebind(await request({method:'POST'}),env);
        assert.equal(again.status,200);assert.equal((await again.json()).writePerformed,false);
        assert.equal((await owner.query("SELECT count(*)::integer AS count FROM system.audit_events WHERE action='identity.admin_subject_rebound'")).rows[0].count,1);
      }
      await seed(owner);p=await previewPolicy();await approve(owner,p);
      const proxyPreview=await handleSubjectRebind(await request(),proxyEnv,{run});
      assert.equal(proxyPreview.status,200,'signed identity and actual PG session support the platform-local proxy');
      const proxyPacket=await proxyPreview.json();assert.equal(proxyPacket.status,'preview_ready');await unchanged(owner);
      p={...p,mode:'execute',...proxyPacket.reviewPacket};await approve(owner,p);
      const proxyApplied=await handleSubjectRebind(await request({method:'POST'}),proxyEnv,{run});
      assert.equal(proxyApplied.status,200);assert.equal((await proxyApplied.json()).existingPrincipalPreserved,true);
      const proxyReplay=await handleSubjectRebind(await request({method:'POST'}),proxyEnv,{run});
      assert.equal(proxyReplay.status,200);assert.equal((await proxyReplay.json()).writePerformed,false);
      assert.equal((await safeRead()).status,200,'proxy repair preserves ordinary administrator access');
    });
    await t.test('canonical disabled installation is atomic, verifies real ACLs and refuses active or drifted definitions',async()=>{
      await seed(owner);
      const roles=Object.fromEntries(['runtime','admin','jobs','privacy','migrations'].map(name=>['lythaus_'+name,'pscale_api_test'+name]));
      for(const [label,role] of Object.entries(roles)){
        await owner.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`);
        await owner.query(`GRANT ${label} TO ${role}`);
      }
      const payload=rebindGrantPayload(),now=Date.now(),consent={payload,record:{approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+300000).toISOString()}};
      await owner.query(`DROP FUNCTION ${signature}`);
      await owner.query('BEGIN');let inventoried=false;
      const conflictingCreation={query:async(statement,values)=>{
        const result=await owner.query(statement,values);
        if(statement===REBIND_BOUNDARY_SQL&&!inventoried){
          inventoried=true;assert.equal(result.rowCount,0);
          const other=await connect();try{await other.query(sql);await approve(other,await policy());}finally{await other.end();}
        }
        return result;
      }};
      await assert.rejects(()=>installReviewedRebindCapability(conflictingCreation,consent,roles),error=>error.code==='42723');
      await owner.query('ROLLBACK');
      const kept=(await owner.query("SELECT proconfig FROM pg_proc WHERE oid=to_regprocedure($1)",[signature])).rows[0].proconfig;
      assert.ok(kept.some(value=>value.startsWith('lythaus.admin_subject_rebind_approval=')&&!value.endsWith('=DISABLED')),
        'a concurrently created active definition is preserved');
      await owner.query(`DROP FUNCTION ${signature}`);
      await owner.query('BEGIN');let reads=0;
      const failedReadback={query:async(statement,values)=>{
        const result=await owner.query(statement,values);
        if(statement===REBIND_BOUNDARY_SQL&&++reads===2)result.rows[0].security_definer=false;
        return result;
      }};
      await assert.rejects(()=>installReviewedRebindCapability(failedReadback,consent,roles),/admin_rebind_capability_definition_changed/);
      await owner.query('ROLLBACK');
      assert.equal((await owner.query('SELECT to_regprocedure($1) IS NULL AS absent',[signature])).rows[0].absent,true);
      await owner.query(`GRANT postgres TO ${roles.lythaus_migrations}`);
      const operator=await connect();
      try{
        await operator.query(`SET SESSION AUTHORIZATION ${roles.lythaus_migrations}`);
        assert.equal((await operator.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false);
        await operator.query('BEGIN');
        const installed=await installReviewedRebindCapability(operator,consent,roles);
        await operator.query('COMMIT');
        assert.equal(installed.status,'INSTALLED_DISABLED');
        assert.equal((await operator.query('SELECT current_user AS role')).rows[0].role,roles.lythaus_migrations,
          'function-owner context is confined to the installation transaction');
      }finally{await operator.end();}
      await owner.query('BEGIN');const repeated=await installReviewedRebindCapability(owner,consent,roles);await owner.query('COMMIT');
      assert.equal(repeated.status,'ALREADY_INSTALLED_DISABLED');
      await owner.query('BEGIN');await owner.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${roles.lythaus_runtime}`);
      await assert.rejects(()=>installReviewedRebindCapability(owner,consent,roles),/admin_rebind_capability_privilege_boundary_invalid/);
      await owner.query('ROLLBACK');
      await owner.query('BEGIN');await owner.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${roles.lythaus_admin} WITH GRANT OPTION`);
      await assert.rejects(()=>installReviewedRebindCapability(owner,consent,roles),/admin_rebind_capability_privilege_boundary_invalid/);
      await owner.query('ROLLBACK');
      for(const [memberRole,parentRole] of [[roles.lythaus_admin,'postgres'],
        [roles.lythaus_runtime,roles.lythaus_admin],[roles.lythaus_jobs,'postgres'],[roles.lythaus_privacy,roles.lythaus_admin]]){
        await owner.query('BEGIN');await owner.query(`GRANT ${parentRole} TO ${memberRole} WITH INHERIT FALSE, SET TRUE`);
        await assert.rejects(()=>installReviewedRebindCapability(owner,consent,roles),/admin_rebind_capability_privilege_boundary_invalid/);
        await owner.query('ROLLBACK');
      }
      await owner.query('BEGIN');await owner.query('CREATE ROLE pscale_api_testwriter');
      await owner.query('GRANT UPDATE ON identity.admin_memberships TO pscale_api_testwriter');
      await owner.query(`GRANT pscale_api_testwriter TO ${roles.lythaus_admin} WITH INHERIT FALSE, SET TRUE`);
      await assert.rejects(()=>installReviewedRebindCapability(owner,consent,roles),/admin_rebind_capability_privilege_boundary_invalid/);
      await owner.query('ROLLBACK');
      await owner.query('BEGIN');await approve(owner,await policy());
      await assert.rejects(()=>installReviewedRebindCapability(owner,consent,roles),/admin_rebind_capability_not_disabled/);
      await owner.query('ROLLBACK');
      const client=await connect();try{
        await client.query('SET ROLE '+roles.lythaus_admin);
        assert.equal((await client.query(statement,args(await policy()))).rows[0].changed,false,'installation does not activate the rebind');
      }finally{await client.end();}
    });
    t.diagnostic('PostgreSQL 17, synthetic local data only; no production operations or identity values reported.');
  } finally {
    await owner.query('ROLLBACK').catch(()=>{});
    await owner.end();
  }
});
