import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import pg from 'pg';
import {rebindGrantPayload,REBIND_SIGNATURE} from '../ci/admin-subject-rebind-capability.mjs';
import {REBIND_READER_SIGNATURE,REBIND_CONTROL_UPDATE_SQL,REBIND_METADATA_VERIFIER_ROLE,REBIND_RESTORE_STATE_SIGNATURE} from '../ci/admin-subject-rebind-control.mjs';
import {rebindExecutorRoleFingerprint,rebindRoleMapSha256,assertRebindExecutorSession,rebindExecutorSessionDiagnostic} from '../ci/admin-subject-rebind-executor.mjs';
import {rebindSqlClient} from '../ci/admin-subject-rebind-connection.mjs';
import {DISABLED_POLICY_SHA256,rebindActivationConsent,sealRebindActivationConsent,transitionRebindPolicy,disableRebindPolicy,
  withRebindPolicyTransaction,REBIND_POLICY_ID_SQL,rebindCatalogLockSql} from '../ci/admin-subject-rebind-activation.mjs';

const url=new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL??'');
assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname));
assert.equal(process.env.LYTHAUS_LOCAL_REBIND_PROPOSAL_TEST,'synthetic');
const payload=rebindGrantPayload();
const roles=Object.fromEntries(['admin','runtime','jobs','privacy','migrations'].map(label=>[`lythaus_${label}`,`pscale_api_handoff${label}`]));
const executorRole='pscale_api_handoffexecutor';
const executor={mode:'existing_owner_connection',branchId:'vqa2g2xc9wsl',databaseName:'postgres',roleId:'synthetichandoff',
  originFingerprint:'d'.repeat(64),roleFingerprint:rebindExecutorRoleFingerprint(executorRole),roleMapSha256:rebindRoleMapSha256(roles)};
const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const id=n=>`01900000-0000-7000-8000-${String(n).padStart(12,'0')}`;
const connect=async(role=url.username)=>{const target=new URL(url);target.username=role;
  if(role!==url.username)target.password='synthetic-handoff-fixture';
  const config={connectionString:target.href,ssl:false};
  const c=role===executorRole?rebindSqlClient(config,pg.Client):new pg.Client(config);await c.connect();return c;};
const operator=()=>connect(executorRole);
const policyText=async c=>(await c.query('SELECT policy_text FROM admin_recovery.subject_rebind_control')).rows[0].policy_text;
const mapped=sql=>sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,label=>roles[label]);
const environment=()=>({ENABLE_ADMIN_SUBJECT_REBIND:'true',RELEASE_MODE:'force_auth_critical',RELEASE_SHA:'a'.repeat(40),
  GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/main',REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'456',
  GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/production-release.yml@refs/heads/main`,GITHUB_REPOSITORY:repository,
  GITHUB_REPOSITORY_ID:'1010752912',GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',
  ADMIN_WORKER_VERSION_ID:id(2),PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true'});
function approval(stage='preview',preview=null) {
  const now=Math.floor(Date.now()/1000)*1000;
  const policy=preview?{...preview.record.policy,mode:'execute',controlRevision:preview.policy.controlRevision+1,
    commitmentSha256:'e'.repeat(64),nonceHex:'c'.repeat(64)}:
    {schemaVersion:'lythaus-admin-subject-rebind-v3',capabilitySha256:payload.sha256,controlRevision:1,
      mode:'preview',origin:'https://admin.lythaus.co',accessIssuer:'https://synthetic.cloudflareaccess.com',accessAudience:'synthetic-ui',
      sourceSha:'a'.repeat(40),workerVersionId:id(2),emailSha256:'b'.repeat(64),notBefore:now/1000,expiresAt:now/1000+600,
      commitmentSha256:null,nonceHex:null,reference:'canonical-release:456:admin-subject-rebind',
      databaseTarget:{branchId:'vqa2g2xc9wsl',databaseName:'postgres',originFingerprint:'d'.repeat(64),roleFingerprint:'f'.repeat(64)}};
  const record={schemaVersion:'lythaus-admin-subject-rebind-activation-v2',scope:'owner_control_record_and_catalog_lock',
    catalogLock:'canonical_functions_cost_100',stage,executor,releaseSha:'a'.repeat(40),releaseRunId:'456',
    workerVersionId:id(2),grantSha256:payload.sha256,previousPolicySha256:preview?.policySha256??DISABLED_POLICY_SHA256,
    previousPolicyRevision:preview?.policy.controlRevision??0,policy,operator:repository.split('/')[0],
    approvalReference:'synthetic-specific-security-approval',approvedAt:new Date(now).toISOString(),
    expiresAt:new Date(policy.expiresAt*1000).toISOString(),disableAtExpiry:true};
  const intent=rebindActivationConsent(record,{env:{...environment(),ADMIN_REBIND_PREVIEW_POLICY_SHA256:preview?.policySha256,
    ADMIN_REBIND_PREVIEW_CONTROL_REVISION:String(preview?.policy.controlRevision),
    ADMIN_REBIND_EXECUTOR_BINDING_JSON:JSON.stringify(executor)},payload,stage});
  return sealRebindActivationConsent(intent,{schemaVersion:'lythaus-admin-rebind-binding-v1',worker:'lythaus-admin-api-development',
    binding:'DB_ADMIN_FRESH',hyperdriveId:'6bfbb0eab42642e8ad294dbf59294ed3',sourceSha:policy.sourceSha,workerVersionId:policy.workerVersionId,
    releaseRunId:'456',branchId:policy.databaseTarget.branchId,databaseName:policy.databaseTarget.databaseName,
    originFingerprint:policy.databaseTarget.originFingerprint,roleFingerprint:policy.databaseTarget.roleFingerprint,
    checkedAt:now/1000,expiresAt:policy.expiresAt});
}
async function drop(c) {
  await c.query(`DROP FUNCTION IF EXISTS ${REBIND_SIGNATURE}`);
  await c.query(`DROP FUNCTION IF EXISTS ${REBIND_READER_SIGNATURE}`);
  await c.query(`DROP FUNCTION IF EXISTS ${REBIND_RESTORE_STATE_SIGNATURE}`);
  await c.query('DROP TABLE IF EXISTS admin_recovery.subject_rebind_control');
  await c.query('DROP SCHEMA IF EXISTS admin_recovery');
}
async function seed(c) {
  await c.query('TRUNCATE identity.users CASCADE');
  await c.query("DELETE FROM system.audit_events WHERE action IN ('identity.first_admin_bootstrapped','identity.admin_subject_rebound')");
  await c.query("UPDATE system.feature_flags SET enabled=false WHERE flag_key='identity.first_admin_bootstrap_consumed'");
  assert.equal((await c.query('SELECT identity.bootstrap_first_administrator($1,$2,$3,$4) AS created',
    [id(1),Buffer.alloc(32,1),id(3),'synthetic-bootstrap'])).rows[0].created,true);
  await drop(c);await c.query(mapped(payload.sql));
  await c.query('INSERT INTO admin_recovery.subject_rebind_control(id,singleton,capability_sha256) VALUES($1,true,$2)',[id(90),payload.sha256]);
}
async function unchanged(c) {
  const result=await c.query(`SELECT (SELECT count(*)=1 FROM identity.admin_memberships) AS one,
    (SELECT user_id=$1 AND role='administrator' AND active AND access_subject_hmac=$2 FROM identity.admin_memberships) AS preserved,
    (SELECT count(*)=0 FROM system.audit_events WHERE action='identity.admin_subject_rebound') AS no_binding_write`,[id(1),Buffer.alloc(32,1)]);
  assert.deepEqual(result.rows[0],{one:true,preserved:true,no_binding_write:true});
}
async function rawTransaction(work) {const c=await operator();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}
  catch(error){await c.query('ROLLBACK');throw error;}finally{await c.end();}}
const transition=consent=>withRebindPolicyTransaction({connect:operator,roles,payload,executor,expectedPolicySha256:consent.policySha256,
  work:c=>transitionRebindPolicy(c,{consent,roles})});
const cleanup=(preview,execute)=>withRebindPolicyTransaction({connect:operator,roles,payload,executor,expectedPolicySha256:DISABLED_POLICY_SHA256,
  work:c=>disableRebindPolicy(c,{roles,payload,executor,previousDisabledRevision:0,
    allowedPolicies:[preview,...(execute?[execute]:[])].map(value=>({policySha256:value.policySha256,controlRevision:value.policy.controlRevision}))})});

test('PG17 policy handoff uses existing managed-owner authority and preserves the original administrator',{timeout:30000},async t=>{
  const owner=await connect();
  try {
    await owner.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${REBIND_METADATA_VERIFIER_ROLE}') THEN CREATE ROLE ${REBIND_METADATA_VERIFIER_ROLE} LOGIN NOSUPERUSER NOINHERIT; END IF; END $$;`);
    await owner.query(`GRANT USAGE ON SCHEMA identity TO ${REBIND_METADATA_VERIFIER_ROLE}`);
    for(const [label,role] of Object.entries(roles)){
      await owner.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN NOSUPERUSER INHERIT PASSWORD 'synthetic-handoff-fixture'; END IF; END $$;`);
      if(label!=='lythaus_migrations')await owner.query(`GRANT ${label} TO ${role}`);
    }
    await owner.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${executorRole}') THEN CREATE ROLE ${executorRole} LOGIN NOSUPERUSER NOINHERIT PASSWORD 'synthetic-handoff-fixture'; END IF; END $$;`);
    await owner.query(`GRANT postgres TO ${executorRole} WITH INHERIT FALSE, SET TRUE`);
    await t.test('replication-enabled executor remains refused and reports exact SQL flags without role names',async()=>{
      let client;
      try{
        await owner.query(`ALTER ROLE ${executorRole} REPLICATION`);client=await operator();
        await client.query('BEGIN READ ONLY');
        for(const mode of ['existing_owner_connection','separate_owner_connection']){
          let caught;
          await assert.rejects(assertRebindExecutorSession(client,{...executor,mode},roles),error=>{caught=error;return /owner_authority/.test(error.message);});
          const diagnostic=rebindExecutorSessionDiagnostic(caught);
          assert.deepEqual(diagnostic.checks,{oneRow:true,databaseMatches:true,sessionIdentityMatches:true,roleMatchesApproval:true,
            maySetOwner:true,loginProfileAllowed:false,applicationRolesIsolated:true,sqlRolePresent:true,sqlCanLogin:true,
            sqlSuperuser:false,sqlReplicationEnabled:true,sqlUnexpired:true,sqlCreateDatabase:false,sqlCreateRole:false,sqlBypassRls:false,
            ownerSuperuser:true,ownerReplication:false,otherSetReachableSuperuser:false,otherSetReachableReplication:false,sqlClientBackend:true});
          assert.equal(JSON.stringify(diagnostic).includes(executorRole),false);
        }
      }finally{
        try{if(client){try{await client.query('ROLLBACK');}finally{await client.end();}}}
        finally{await owner.query(`ALTER ROLE ${executorRole} NOREPLICATION`);}
      }
      const clean=await operator();
      try{
        await clean.query('BEGIN READ ONLY');
        for(const mode of ['existing_owner_connection','separate_owner_connection'])
          await assertRebindExecutorSession(clean,{...executor,mode},roles);
      }
      finally{try{await clean.query('ROLLBACK');}finally{await clean.end();}}
    });
    await t.test('preview, execution and cleanup CAS exact control revisions without changing membership',async()=>{
      await seed(owner);const preview=approval();
      await transition(preview);assert.equal(await policyText(owner),preview.policyText);await unchanged(owner);
      await assert.rejects(rawTransaction(c=>transitionRebindPolicy(c,{consent:preview,roles})),/policy_changed/);
      const execute=approval('execute',preview);await transition(execute);await unchanged(owner);
      await cleanup(preview,execute);assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
      assert.equal((await owner.query('SELECT revision FROM admin_recovery.subject_rebind_control')).rows[0].revision,'3');
    });
    await t.test('full policy lifecycle works when the stable postgres owner is not a superuser',async()=>{
      assert.notEqual((await owner.query("SELECT oid FROM pg_roles WHERE rolname='postgres'")).rows[0].oid,10,
        'managed-owner test requires the CI non-bootstrap postgres fixture');
      await seed(owner);const preview=approval();
      await owner.query("CREATE ROLE pscale_api_handofflocalroot LOGIN SUPERUSER PASSWORD 'synthetic-handoff-fixture'");
      const root=await connect('pscale_api_handofflocalroot');
      try {
        await root.query('ALTER ROLE postgres NOSUPERUSER');
        await transition(preview);const execute=approval('execute',preview);await transition(execute);await cleanup(preview,execute);
      } finally {await root.query('ALTER ROLE postgres SUPERUSER');await root.end();await owner.query('DROP ROLE pscale_api_handofflocalroot');}
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('concurrent configuration drift is preserved and rejected after catalog locking',async()=>{
      for(const mutation of ["SET statement_timeout='1234ms'","SECURITY INVOKER"]){
        await seed(owner);const preview=approval(),c=await operator(),query=c.query.bind(c);let count=0,target;
        c.query=async(sql,args)=>{const result=await query(sql,args);
          if(sql===REBIND_POLICY_ID_SQL&&++count===1){target=args[0];await owner.query(`ALTER FUNCTION ${target} ${mutation}`);}return result;};
        try{await c.query('BEGIN');await assert.rejects(transitionRebindPolicy(c,{consent:preview,roles}));await c.query('ROLLBACK');}
        finally{await c.end();}
        const row=(await owner.query('SELECT proconfig,prosecdef FROM pg_proc WHERE oid=to_regprocedure($1)',[target])).rows[0];
        if(mutation==='SECURITY INVOKER')assert.equal(row.prosecdef,false);else assert.ok(row.proconfig.includes('statement_timeout=1234ms'));
        assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
      }
    });
    await t.test('same-body function replacement is rejected by changed object identity',async()=>{
      await seed(owner);const preview=approval(),c=await operator(),query=c.query.bind(c);let count=0;
      c.query=async(sql,args)=>{const result=await query(sql,args);
        if(sql===REBIND_POLICY_ID_SQL&&++count===1){
          assert.equal(args[0],REBIND_READER_SIGNATURE);await owner.query(`DROP FUNCTION ${REBIND_READER_SIGNATURE}`);
          const start=payload.sql.indexOf('CREATE FUNCTION identity.admin_subject_rebind_policy()');
          const end=payload.sql.indexOf('CREATE FUNCTION identity.admin_subject_rebind_restore_state()');
          await owner.query(mapped(payload.sql.slice(start,end)));
        }return result;};
      try{await c.query('BEGIN');await assert.rejects(transitionRebindPolicy(c,{consent:preview,roles}),/capability_replaced/);await c.query('ROLLBACK');}
      finally{await c.end();}
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('fixed-cost operation holds the actual catalog tuple until transaction end',async()=>{
      await seed(owner);const preview=approval(),c=await operator(),writer=await connect(),query=c.query.bind(c);let pending,blocked=false;
      const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      c.query=async(sql,args)=>{const result=await query(sql,args);
        if(sql===rebindCatalogLockSql(REBIND_READER_SIGNATURE)){
          pending=writer.query(`ALTER FUNCTION ${REBIND_READER_SIGNATURE} SET statement_timeout='2345ms'`);
          for(let i=0;i<100;i++){blocked=(await owner.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[pid])).rows[0].blocked;
            if(blocked)break;await delay(10);}
        }return result;};
      try{await c.query('BEGIN');await transitionRebindPolicy(c,{consent:preview,roles});assert.equal(blocked,true);
        await c.query('ROLLBACK');await pending;}
      finally{await c.end();await writer.end();}
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('expiry after waiting for the control row causes atomic rollback',async()=>{
      await seed(owner);const preview=approval(),c=await operator();let clock=Date.now(),pending;
      const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      try {
        await owner.query('BEGIN');await owner.query('SELECT * FROM admin_recovery.subject_rebind_control FOR UPDATE');
        await c.query('BEGIN');pending=transitionRebindPolicy(c,{consent:preview,roles,now:()=>clock});
        const rejected=assert.rejects(pending,/consent_expired/);let blocked=false;
        for(let i=0;i<100;i++){blocked=(await owner.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[pid])).rows[0].blocked;
          if(blocked)break;await delay(10);}
        assert.equal(blocked,true);clock=Date.parse(preview.record.expiresAt)+1;await owner.query('ROLLBACK');
        await rejected;await c.query('ROLLBACK');
      }finally{await owner.query('ROLLBACK');await c.end();}
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
    await t.test('lost COMMIT and connection-close acknowledgements require one exact readback and one policy write',async()=>{
      for(const fault of ['commit','close']){
        await seed(owner);const preview=approval();let connections=0,writes=0;
        const connectFault=async()=>{const c=await operator(),first=connections++===0,query=c.query.bind(c),end=c.end.bind(c);
          c.query=async(sql,args)=>{const result=await query(sql,args);if(sql===REBIND_CONTROL_UPDATE_SQL)writes++;
            if(first&&sql==='COMMIT'&&fault==='commit')throw new Error('synthetic_lost_commit');return result;};
          c.end=async()=>{await end();if(first&&fault==='close')throw new Error('synthetic_lost_close');};return c;};
        const result=await withRebindPolicyTransaction({connect:connectFault,roles,payload,executor,expectedPolicySha256:preview.policySha256,
          work:c=>transitionRebindPolicy(c,{consent:preview,roles})});
        assert.equal(result.readbackVerified,true);assert.equal(writes,1);assert.equal(connections,2);await unchanged(owner);
      }
    });
    await t.test('missing pre-existing owner authority stops before catalog or policy changes',async()=>{
      await seed(owner);const preview=approval();
      await owner.query(`REVOKE postgres FROM ${executorRole}`);
      try{await assert.rejects(rawTransaction(c=>transitionRebindPolicy(c,{consent:preview,roles})),/owner_authority/);}
      finally{await owner.query(`GRANT postgres TO ${executorRole} WITH INHERIT FALSE, SET TRUE`);}
      assert.equal(await policyText(owner),'DISABLED');await unchanged(owner);
    });
  }finally{
    await owner.query('ROLLBACK');await drop(owner);await owner.query(payload.sql);
    await owner.query('INSERT INTO admin_recovery.subject_rebind_control(id,singleton,capability_sha256) VALUES($1,true,$2)',[id(90),payload.sha256]);
    for(const role of [...Object.values(roles),executorRole])await owner.query(`DROP ROLE IF EXISTS ${role}`);
    await owner.end();
  }
});
