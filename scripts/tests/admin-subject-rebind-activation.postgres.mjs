import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import pg from 'pg';
import {rebindGrantPayload,REBIND_SIGNATURE} from '../ci/admin-subject-rebind-capability.mjs';
import {DISABLED_POLICY_SHA256,rebindActivationConsent,sealRebindActivationConsent,transitionRebindPolicy,disableRebindPolicy,withRebindPolicyTransaction,
  REBIND_POLICY_ID_SQL,REBIND_POLICY_ALTER_SQL,REBIND_OWNER_CAPACITY_SQL} from '../ci/admin-subject-rebind-activation.mjs';

const url=new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL??'');
assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname));
assert.equal(process.env.LYTHAUS_LOCAL_REBIND_PROPOSAL_TEST,'synthetic');
const payload=rebindGrantPayload();
const roles=Object.fromEntries(['admin','runtime','jobs','privacy','migrations'].map(label=>[`lythaus_${label}`,`pscale_api_handoff${label}`]));
const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const id=n=>`01900000-0000-7000-8000-${String(n).padStart(12,'0')}`;
const connect=async()=>{const c=new pg.Client({connectionString:url.href,ssl:false});await c.connect();return c;};
const operator=async()=>{const c=await connect();await c.query(`SET SESSION AUTHORIZATION ${roles.lythaus_migrations}`);return c;};
const policyText=async c=>(await c.query('SELECT proconfig FROM pg_proc WHERE oid=to_regprocedure($1)',[REBIND_SIGNATURE]))
  .rows[0].proconfig.find(value=>value.startsWith('lythaus.admin_subject_rebind_approval=')).split('=').slice(1).join('=');
const environment=()=>({ENABLE_ADMIN_SUBJECT_REBIND:'true',RELEASE_MODE:'force_auth_critical',RELEASE_SHA:'a'.repeat(40),
  GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/main',REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'456',
  GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/production-release.yml@refs/heads/main`,GITHUB_REPOSITORY:repository,
  GITHUB_REPOSITORY_ID:'1010752912',GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',
  ADMIN_WORKER_VERSION_ID:id(2),PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true'});
function approval(stage='preview',preview=null) {
  const now=Math.floor(Date.now()/1000)*1000;
  const policy=preview?{...preview.record.policy,mode:'execute',commitmentSha256:'e'.repeat(64),nonceHex:'c'.repeat(64)}:
    {schemaVersion:'lythaus-admin-subject-rebind-v2',mode:'preview',origin:'https://admin.lythaus.co',
      accessIssuer:'https://synthetic.cloudflareaccess.com',accessAudience:'synthetic-ui',sourceSha:'a'.repeat(40),
      workerVersionId:id(2),emailSha256:'b'.repeat(64),notBefore:now/1000,expiresAt:now/1000+600,
      commitmentSha256:null,nonceHex:null,reference:'canonical-release:456:admin-subject-rebind',
      databaseTarget:{branchId:'vqa2g2xc9wsl',databaseName:'postgres',originFingerprint:'d'.repeat(64),roleFingerprint:'f'.repeat(64)}};
  const record={schemaVersion:'lythaus-admin-subject-rebind-activation-v1',scope:'function_policy_only',stage,
    releaseSha:'a'.repeat(40),releaseRunId:'456',workerVersionId:id(2),grantSha256:payload.sha256,
    previousPolicySha256:preview?.policySha256??DISABLED_POLICY_SHA256,policy,operator:repository.split('/')[0],
    approvalReference:'synthetic-specific-security-approval',approvedAt:new Date(now).toISOString(),
    expiresAt:new Date(policy.expiresAt*1000).toISOString(),disableAtExpiry:true};
  const intent=rebindActivationConsent(record,{env:{...environment(),ADMIN_REBIND_PREVIEW_POLICY_SHA256:preview?.policySha256},payload,stage});
  return sealRebindActivationConsent(intent,{schemaVersion:'lythaus-admin-rebind-binding-v1',worker:'lythaus-admin-api-development',
    binding:'DB_ADMIN_FRESH',hyperdriveId:'6bfbb0eab42642e8ad294dbf59294ed3',sourceSha:policy.sourceSha,workerVersionId:policy.workerVersionId,
    releaseRunId:'456',branchId:policy.databaseTarget.branchId,databaseName:policy.databaseTarget.databaseName,
    originFingerprint:policy.databaseTarget.originFingerprint,roleFingerprint:policy.databaseTarget.roleFingerprint,
    checkedAt:now/1000,expiresAt:policy.expiresAt});
}
async function seed(c) {
  await c.query('TRUNCATE identity.users CASCADE');
  await c.query("DELETE FROM system.audit_events WHERE action IN ('identity.first_admin_bootstrapped','identity.admin_subject_rebound')");
  await c.query("UPDATE system.feature_flags SET enabled=false WHERE flag_key='identity.first_admin_bootstrap_consumed'");
  assert.equal((await c.query('SELECT identity.bootstrap_first_administrator($1,$2,$3,$4) AS created',
    [id(1),Buffer.alloc(32,1),id(3),'synthetic-bootstrap'])).rows[0].created,true);
  await c.query(`DROP FUNCTION IF EXISTS ${REBIND_SIGNATURE}`);
  await c.query(payload.sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,label=>roles[label]));
}
async function unchanged(c) {
  const result=await c.query(`SELECT (SELECT count(*)=1 FROM identity.admin_memberships) AS one,
    (SELECT user_id=$1 AND role='administrator' AND active AND access_subject_hmac=$2 FROM identity.admin_memberships) AS preserved,
    (SELECT count(*)=0 FROM system.audit_events WHERE action='identity.admin_subject_rebound') AS no_binding_write`,[id(1),Buffer.alloc(32,1)]);
  assert.deepEqual(result.rows[0],{one:true,preserved:true,no_binding_write:true});
  assert.equal((await c.query("SELECT EXISTS(SELECT 1 FROM pg_proc p,LATERAL unnest(p.proconfig) s WHERE p.oid=to_regprocedure($1) AND s LIKE 'lythaus.rebind_guard_%') AS guard_committed",[REBIND_SIGNATURE])).rows[0].guard_committed,false);
}
async function rawTransaction(work) {const c=await operator();try{await c.query('BEGIN');await work(c);await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');throw error;}finally{await c.end();}}

test('PG17 exact policy handoff uses existing owner authority and retains the same administrator', {timeout:30000},async t=>{
  const owner=await connect();
  try{
    const version=Number((await owner.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
    assert.ok(version>=170000&&version<180000);
    for(const [label,role] of Object.entries(roles)){
      await owner.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER INHERIT`);
      await owner.query(`GRANT ${label==='lythaus_migrations'?'postgres':label} TO ${role}`);
    }
    await t.test('preview, exact execution and expiry cleanup alter only function configuration',async()=>{
      await seed(owner);const preview=approval();
      await withRebindPolicyTransaction({connect:operator,roles,payload,expectedPolicySha256:preview.policySha256,
        work:c=>transitionRebindPolicy(c,{consent:preview,roles})});
      assert.equal(await policyText(owner),preview.policyText);await unchanged(owner);
      await assert.rejects(rawTransaction(c=>transitionRebindPolicy(c,{consent:preview,roles})),/policy_changed/);
      const execute=approval('execute',preview);
      await withRebindPolicyTransaction({connect:operator,roles,payload,expectedPolicySha256:execute.policySha256,
        work:c=>transitionRebindPolicy(c,{consent:execute,roles})});
      await unchanged(owner);
      await withRebindPolicyTransaction({connect:operator,roles,payload,expectedPolicySha256:DISABLED_POLICY_SHA256,
        work:c=>disableRebindPolicy(c,{roles,payload,allowedPolicyHashes:[preview.policySha256,execute.policySha256]})});
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('pre-lock concurrent policy or unknown setting is preserved on rejection',async()=>{
      for(const mutation of ["SET lythaus.admin_subject_rebind_approval='UNREVIEWED'","SET statement_timeout='1234ms'"]){
        await seed(owner);const preview=approval(),c=await operator(),query=c.query.bind(c);let ids=0;
        c.query=async(sql,args)=>{const result=await query(sql,args);if(sql===REBIND_POLICY_ID_SQL&&++ids===1)
          await owner.query(`ALTER FUNCTION ${REBIND_SIGNATURE} ${mutation}`);return result;};
        try{await c.query('BEGIN');await assert.rejects(transitionRebindPolicy(c,{consent:preview,roles}));await c.query('ROLLBACK');}
        finally{await c.end();}
        const config=(await owner.query('SELECT proconfig FROM pg_proc WHERE oid=to_regprocedure($1)',[REBIND_SIGNATURE])).rows[0].proconfig;
        assert.ok(config.includes(mutation.includes('UNREVIEWED')?'lythaus.admin_subject_rebind_approval=UNREVIEWED':'statement_timeout=1234ms'));
        await unchanged(owner);
      }
    });
    await t.test('concurrent exact-source function replacement is rejected by its changed OID',async()=>{
      await seed(owner);const preview=approval(),c=await operator(),query=c.query.bind(c);let ids=0;
      c.query=async(sql,args)=>{const result=await query(sql,args);if(sql===REBIND_POLICY_ID_SQL&&++ids===1){
        await owner.query(`DROP FUNCTION ${REBIND_SIGNATURE}`);
        await owner.query(payload.sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,label=>roles[label]));
      }return result;};
      try{await c.query('BEGIN');await assert.rejects(transitionRebindPolicy(c,{consent:preview,roles}),/capability_replaced/);await c.query('ROLLBACK');}
      finally{await c.end();}assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('unique guard really holds the catalog tuple against concurrent ALTER until transaction end',async()=>{
      await seed(owner);const preview=approval(),c=await operator(),writer=await connect(),query=c.query.bind(c);let pending,blocked=false;
      const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      c.query=async(sql,args)=>{const result=await query(sql,args);if(sql.includes(' SET lythaus.rebind_guard_')){
        pending=writer.query(`ALTER FUNCTION ${REBIND_SIGNATURE} SET statement_timeout='2345ms'`);
        for(let i=0;i<100;i++){
          blocked=(await owner.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[pid])).rows[0].blocked;
          if(blocked)break;await delay(10);
        }
      }return result;};
      try{await c.query('BEGIN');await transitionRebindPolicy(c,{consent:preview,roles});assert.equal(blocked,true);
        await c.query('ROLLBACK');await pending;}
      finally{await c.end();await writer.end();}
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('lost COMMIT acknowledgement reads exact durable policy and never retries the ALTER',async()=>{
      await seed(owner);const preview=approval();let connections=0,policyAlters=0;
      const connectFault=async()=>{const c=await operator(),first=connections++===0,query=c.query.bind(c);
        c.query=async(sql,args)=>{const result=await query(sql,args);if(sql===REBIND_POLICY_ALTER_SQL)policyAlters++;
          if(first&&sql==='COMMIT')throw new Error('synthetic_commit_ack_lost');return result;};return c;};
      const result=await withRebindPolicyTransaction({connect:connectFault,roles,payload,expectedPolicySha256:preview.policySha256,
        work:c=>transitionRebindPolicy(c,{consent:preview,roles})});
      assert.equal(result.readbackVerified,true);assert.equal(policyAlters,1);assert.equal(connections,2);await unchanged(owner);
    });
    await t.test('unavailable managed-owner parameter authority fails before any function alteration',async()=>{
      await seed(owner);const preview=approval(),c=await operator(),query=c.query.bind(c);let alters=0;
      c.query=async(sql,args)=>{if(sql.startsWith('ALTER FUNCTION'))alters++;
        if(sql===REBIND_OWNER_CAPACITY_SQL)return {rowCount:1,rows:[{owner_context:true,guard_allowed:false,policy_allowed:false}]};
        return query(sql,args);};
      try{await c.query('BEGIN');await assert.rejects(transitionRebindPolicy(c,{consent:preview,roles}),/owner_capacity/);await c.query('ROLLBACK');}
      finally{await c.end();}assert.equal(alters,0);assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
  }finally{
    await owner.query(`DROP FUNCTION IF EXISTS ${REBIND_SIGNATURE}`);
    await owner.query(fs.readFileSync('database/planetscale/grants/admin-subject-rebind.sql','utf8'));
    for(const role of Object.values(roles))await owner.query(`DROP ROLE IF EXISTS ${role}`);
    await owner.end();
  }
});
