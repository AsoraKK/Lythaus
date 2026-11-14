import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import {rebindGrantPayload,REBIND_BOUNDARY_SQL,REBIND_SOURCE_STATE_SQL} from '../ci/admin-subject-rebind-capability.mjs';
import {DISABLED_POLICY_SHA256,policySha256,requireRebindActivationContext,rebindActivationConsent,requirePolicyTransition,
  sealRebindActivationConsent,transitionRebindPolicy,disableRebindPolicy,withRebindPolicyTransaction,REBIND_POLICY_ID_SQL,REBIND_POLICY_ALTER_SQL,
  REBIND_OPERATOR_SESSION_SQL,REBIND_OWNER_CAPACITY_SQL} from '../ci/admin-subject-rebind-activation.mjs';
import {requireRebindRecoveryReport} from '../ci/run-admin-subject-rebind-activation.mjs';
import {verifyRebindLiveTarget} from '../ci/verify-admin-subject-rebind-live.mjs';
import {branchQualifiedDatabaseTarget} from '../ci/planetscale-0021-target-identity.mjs';

const now=Date.parse('2026-11-14T12:00:00Z'),source='a'.repeat(40),version='01900000-0000-7000-8000-000000000002';
const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const roles=Object.fromEntries(['admin','runtime','jobs','privacy','migrations'].map(label=>[`lythaus_${label}`,`pscale_api_${label}`]));
const payload=rebindGrantPayload();
const sha256=value=>createHash('sha256').update(value).digest('hex');
const env=()=>({ENABLE_ADMIN_SUBJECT_REBIND:'true',RELEASE_MODE:'force_auth_critical',RELEASE_SHA:source,GITHUB_SHA:source,
  GITHUB_REF:'refs/heads/main',REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'456',
  GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/production-release.yml@refs/heads/main`,
  GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',
  ADMIN_WORKER_VERSION_ID:version,PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true'});
const policy=()=>({schemaVersion:'lythaus-admin-subject-rebind-v2',mode:'preview',origin:'https://admin.lythaus.co',
  accessIssuer:'https://synthetic.cloudflareaccess.com',accessAudience:'synthetic-ui',sourceSha:source,workerVersionId:version,
  emailSha256:sha256('owner@example.test'),notBefore:now/1000,expiresAt:now/1000+600,commitmentSha256:null,nonceHex:null,
  reference:'canonical-release:456:admin-subject-rebind',databaseTarget:{branchId:'vqa2g2xc9wsl',databaseName:'postgres',
    originFingerprint:'d'.repeat(64),roleFingerprint:sha256(`lythaus-admin-diagnostic-role:v1:${roles.lythaus_admin}`)}});
const record=()=>({schemaVersion:'lythaus-admin-subject-rebind-activation-v1',scope:'function_policy_only',stage:'preview',
  releaseSha:source,releaseRunId:'456',workerVersionId:version,grantSha256:payload.sha256,previousPolicySha256:DISABLED_POLICY_SHA256,
  policy:policy(),operator:repository.split('/')[0],approvalReference:'specific-synthetic-approval',
  approvedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString(),disableAtExpiry:true});
const proof=(p,checkedAt=now/1000)=>({schemaVersion:'lythaus-admin-rebind-binding-v1',worker:'lythaus-admin-api-development',
  binding:'DB_ADMIN_FRESH',hyperdriveId:'6bfbb0eab42642e8ad294dbf59294ed3',sourceSha:p.sourceSha,workerVersionId:p.workerVersionId,
  releaseRunId:'456',branchId:p.databaseTarget.branchId,databaseName:p.databaseTarget.databaseName,
  originFingerprint:p.databaseTarget.originFingerprint,roleFingerprint:p.databaseTarget.roleFingerprint,checkedAt,expiresAt:p.expiresAt});
const unarmed=(value=record(),environment=env(),time=now)=>rebindActivationConsent(value,{env:environment,payload,stage:value.stage,now:time});
const consent=(value=record(),environment=env(),time=now)=>sealRebindActivationConsent(unarmed(value,environment,time),proof(value.policy,Math.floor(time/1000)));
const row=()=>({body:payload.sql.match(/AS \$\$([\s\S]*?)\$\$;/)[1],security_definer:true,owner:'postgres',
  language_matches:true,return_matches:true,behavior_matches:true,arguments_match:true,
  admin_execute:true,runtime_execute:false,jobs_execute:false,privacy_execute:false,
  admin_direct_update:false,admin_acts_as_owner:false,unexpected_execute:false,unexpected_role_reach:false});

class PolicyClient {
  constructor(){this.policy='DISABLED';this.guard=null;this.config=new Map();this.alters=0;this.afterGuard=()=>{};this.blockCapacity=false;}
  async query(sql,args=[]){
    if(sql===REBIND_OPERATOR_SESSION_SQL)return {rowCount:1,rows:[{database_name:'postgres',current_role:roles.lythaus_migrations,
      session_role:roles.lythaus_migrations,may_set_owner:true}]};
    if(sql===REBIND_OWNER_CAPACITY_SQL)return {rowCount:1,rows:[{owner_context:true,guard_allowed:!this.blockCapacity,policy_allowed:true}]};
    if(sql===REBIND_POLICY_ID_SQL)return {rowCount:1,rows:[{oid:123}]};
    if(sql===REBIND_BOUNDARY_SQL)return {rowCount:1,rows:[{...row(),settings:['search_path=pg_catalog',
      `lythaus.admin_subject_rebind_approval=${this.policy}`,...(this.guard?[`${this.guard}=locked`]:[])]}]};
    if(sql===REBIND_SOURCE_STATE_SQL)return {rowCount:1,rows:[{one:true,two:true,three:true,four:true}]};
    if(sql==='SELECT set_config($1,$2,true)'){this.config.set(args[0],args[1]);return {rowCount:1,rows:[]};}
    if(sql.startsWith('ALTER FUNCTION ')&&sql.includes(' SET lythaus.rebind_guard_')){
      this.guard=sql.match(/SET (lythaus\.rebind_guard_[a-f0-9]{32}) FROM CURRENT/)[1];this.afterGuard();return {rowCount:0,rows:[]};}
    if(sql.startsWith('ALTER FUNCTION ')&&sql.includes(' RESET lythaus.rebind_guard_')){this.guard=null;return {rowCount:0,rows:[]};}
    if(sql===REBIND_POLICY_ALTER_SQL){this.policy=this.config.get('lythaus.admin_subject_rebind_approval');this.alters++;return {rowCount:0,rows:[]};}
    if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory_xact_lock|LOCK TABLE)/.test(sql))return {rowCount:0,rows:[]};
    throw new Error('unexpected_fixture_query');
  }
  async end(){}
}

test('activation is bound to full canonical protected first-attempt owner context, never an exception',()=>{
  requireRebindActivationContext(env());
  for(const patch of [{ENABLE_ADMIN_SUBJECT_REBIND:'false'},{RELEASE_MODE:'owner_testing_native_recovery_exception'},
    {RELEASE_MODE:'owner_testing_subject_diagnostic_exception'},{RELEASE_MODE:'automatic_subject_diagnostic'},
    {GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REPOSITORY_ID:'1'},{GITHUB_SHA:'b'.repeat(40)},{REF_PROTECTED:'false'},
    {GITHUB_REF:'refs/heads/other'},{GITHUB_ACTOR_ID:'1'},{PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'false'}]){
    assert.throws(()=>requireRebindActivationContext({...env(),...patch}));
  }
});

test('preview consent rejects changed payload/run/version, broad scope, replay and expired windows',()=>{
  assert.equal(consent().policy.mode,'preview');
  for(const patch of [{releaseRunId:'457'},{releaseSha:'b'.repeat(40)},{workerVersionId:version.slice(0,-1)+'3'},
    {grantSha256:'b'.repeat(64)},{disableAtExpiry:false},{scope:'membership_write'},{previousPolicySha256:'b'.repeat(64)},
    {extra:true},{approvalReference:''},{expiresAt:new Date(now).toISOString()},
    {approvedAt:new Date(now+1).toISOString()},{expiresAt:new Date(now+901000).toISOString()}])assert.throws(()=>consent({...record(),...patch}));
  assert.throws(()=>consent(record(),env(),now+600000));
  assert.throws(()=>consent(record(),{...env(),GITHUB_RUN_ID:'457'}));
});

test('execute approval preserves preview identity, target and original deadline and cannot rearm execution',()=>{
  const preview=consent(),p={...preview.record.policy,mode:'execute',nonceHex:'c'.repeat(64),commitmentSha256:'e'.repeat(64)};
  const execution={...record(),stage:'execute',policy:p,previousPolicySha256:preview.policySha256,
    approvedAt:new Date(now+1000).toISOString()};
  const approved=consent(execution,{...env(),ADMIN_REBIND_PREVIEW_POLICY_SHA256:preview.policySha256},now+1000);
  requirePolicyTransition(preview.policyText,approved);
  for(const patch of [{emailSha256:'f'.repeat(64)},{accessAudience:'other'},{sourceSha:'b'.repeat(40)},
    {expiresAt:p.expiresAt+1},{notBefore:p.notBefore+1},{reference:'different'}])assert.throws(()=>requirePolicyTransition(preview.policyText,
      {...approved,policy:{...p,...patch}}));
  assert.throws(()=>requirePolicyTransition(approved.policyText,{...approved,record:{...approved.record,previousPolicySha256:approved.policySha256}}));
});

test('fresh recovery includes verified native archive and independent destination, with no owner exception',()=>{
  const report={ready:true,ok:true,sourceMainSha:source,databaseWrites:false,providerMutations:false,blockers:[],
    generatedAt:new Date(now).toISOString(),backup:{protected:true,state:'success'},
    restoreEvidence:{ok:true,evidenceArtifact:{status:'verified'},independentRecovery:{status:'VERIFIED'}}};
  requireRebindRecoveryReport(report,env(),now);
  for(const patch of [{sourceMainSha:'b'.repeat(40)},{ready:false},{blockers:['blocked']},{generatedAt:new Date(now-120001).toISOString()},
    {restoreEvidence:{...report.restoreEvidence,independentRecovery:{status:'DEFERRED_BY_OWNER_EXCEPTION'}}},
    {restoreEvidence:{...report.restoreEvidence,evidenceArtifact:{status:'unavailable'}}}])assert.throws(()=>requireRebindRecoveryReport({...report,...patch},env(),now));
});

test('policy transition uses transient unique guard and reads back, while missing owner capacity makes no policy write',async()=>{
  const client=new PolicyClient(),approved=consent();
  const result=await transitionRebindPolicy(client,{consent:approved,roles,now:()=>now});
  assert.equal(result.status,'PREVIEW_POLICY_INSTALLED');assert.equal(client.policy,approved.policyText);assert.equal(client.guard,null);
  assert.equal(client.alters,1);
  const missing=new PolicyClient();missing.blockCapacity=true;
  await assert.rejects(transitionRebindPolicy(missing,{consent:approved,roles,now:()=>now}),/owner_capacity/);assert.equal(missing.alters,0);
  const changed=new PolicyClient();changed.afterGuard=()=>{changed.policy=JSON.stringify({...approved.policy,emailSha256:'f'.repeat(64)});};
  await assert.rejects(transitionRebindPolicy(changed,{consent:approved,roles,now:()=>now}),/policy_changed/);assert.equal(changed.alters,0);
  const expired=new PolicyClient();let clock=now;expired.afterGuard=()=>{clock=now+600000;};
  await assert.rejects(transitionRebindPolicy(expired,{consent:approved,roles,now:()=>clock}),/consent_expired/);assert.equal(expired.alters,0);
});

test('unarmed intents and stale or caller-supplied control-plane proof cannot activate a policy',async()=>{
  const intent=unarmed();assert.equal(intent.policyText,null);assert.equal(intent.policySha256,null);
  const noDatabase={query:async()=>{throw new Error('database_must_not_be_reached');}};
  await assert.rejects(transitionRebindPolicy(noDatabase,{consent:intent,roles,now:()=>now}),/proof_required/);
  assert.throws(()=>unarmed({...record(),policy:consent().policy}),/policy_invalid/);
  for(const patch of [{releaseRunId:'457'},{hyperdriveId:'a'.repeat(32)},{sourceSha:'b'.repeat(40)},
    {workerVersionId:version.slice(0,-1)+'3'},{branchId:'other'},{databaseName:'other'},
    {originFingerprint:'a'.repeat(64)},{roleFingerprint:'b'.repeat(64)},{expiresAt:policy().expiresAt+1}]){
    assert.throws(()=>sealRebindActivationConsent(intent,{...proof(intent.policy),...patch}),/proof_invalid/);
  }
  await assert.rejects(transitionRebindPolicy(noDatabase,{consent:consent(),roles,now:()=>now+120001}),/proof_stale/);
  const future=sealRebindActivationConsent(intent,proof(intent.policy,now/1000+1));
  await assert.rejects(transitionRebindPolicy(noDatabase,{consent:future,roles,now:()=>now}),/proof_stale/);
  const drifted={...consent(),policyText:JSON.stringify({...consent().policy,emailSha256:'f'.repeat(64)})};
  await assert.rejects(transitionRebindPolicy(noDatabase,{consent:drifted,roles,now:()=>now}),/proof_required/);
});

test('cleanup refuses another policy and never changes membership',async()=>{
  const client=new PolicyClient(),approved=consent();client.policy=approved.policyText;
  await assert.rejects(disableRebindPolicy(client,{roles,payload,allowedPolicyHashes:['f'.repeat(64)]}),/different_policy/);
  client.guard=null;
  const result=await disableRebindPolicy(client,{roles,payload,allowedPolicyHashes:[approved.policySha256]});
  assert.equal(result.status,'DISABLED');assert.equal(client.policy,'DISABLED');assert.equal(client.guard,null);
});

test('lost COMMIT acknowledgement is read back without retry and a mismatching outcome stays unknown',async()=>{
  for(const fault of ['commit','close']){
    const state=new PolicyClient(),approved=consent();let opened=0,attempts=0;
    const connect=async()=>{const index=opened++;return {query:async(sql,args)=>{
      const answer=await state.query(sql,args);if(index===0&&sql==='COMMIT'&&fault==='commit')throw new Error('lost');return answer;
    },end:async()=>{if(index===0&&fault==='close')throw new Error('lost');}};};
    const result=await withRebindPolicyTransaction({connect,roles,payload,expectedPolicySha256:approved.policySha256,
      work:async client=>{attempts++;return transitionRebindPolicy(client,{consent:approved,roles,now:()=>now});}});
    assert.equal(result.readbackVerified,true);assert.equal(opened,2);assert.equal(attempts,1);
  }
  const state=new PolicyClient();
  await assert.rejects(withRebindPolicyTransaction({connect:async()=>state,roles,payload,expectedPolicySha256:'f'.repeat(64),
    work:async()=>({status:'UNCONFIRMED'})}),/outcome_unknown/);
});

function liveFixture() {
  const environment={...env(),CLOUDFLARE_ACCOUNT_ID:'e5b7ae46e04698f507b7e4b3d4ef1af0',CLOUDFLARE_API_TOKEN:'synthetic',
    PLANETSCALE_ADMIN_DATABASE_URL:'postgres://pscale_api_migrations.vqa2g2xc9wsl:synthetic@fixture.psdb.cloud/postgres?sslmode=verify-full',
    PLANETSCALE_SCHEMA_READ_DATABASE_URL:'postgres://pscale_api_verifier.vqa2g2xc9wsl:synthetic@fixture.psdb.cloud/postgres?sslmode=verify-full'};
  const p=policy();p.databaseTarget.originFingerprint=branchQualifiedDatabaseTarget(environment.PLANETSCALE_ADMIN_DATABASE_URL).originFingerprint;
  const worker='lythaus-admin-api-development',drive='6bfbb0eab42642e8ad294dbf59294ed3';
  const manifest={expectedMainOriginFingerprint:p.databaseTarget.originFingerprint,bindings:[{worker,binding:'DB_ADMIN_FRESH',hyperdriveId:drive}]};
  const bindings=[{name:'DB_ADMIN_FRESH',type:'hyperdrive',id:drive},{name:'WORKER_VERSION',type:'version_metadata'},
    {name:'ACCESS_SUBJECT_HMAC_KEY',type:'secret_text'},...Object.entries({ACCESS_TEAM_DOMAIN:'synthetic.cloudflareaccess.com',
      ACCESS_AUDIENCES:'synthetic-ui,synthetic-api',EXPECTED_HOSTNAMES:'admin.lythaus.co',CORS_ALLOWED_ORIGINS:p.origin}).map(([name,text])=>({name,type:'plain_text',text}))];
  const data={deployments:{deployments:[{id:'deployment',created_on:new Date(now).toISOString(),versions:[{version_id:version,percentage:100}]}]},
    version:{id:version,annotations:{'workers/tag':source},resources:{bindings}},
    routes:[{id:'route',pattern:'admin.lythaus.co/api/admin/*',script:worker}],
    apps:[{id:'ui',name:'Lythaus Admin UI',domain:'admin.lythaus.co',aud:'synthetic-ui'},
      {id:'api',name:'Lythaus Admin API',domain:'admin-api.lythaus.co',aud:'synthetic-api'}],
    policies:[{id:'human',decision:'allow',include:[{email:{email:'owner@example.test'}}]},
      {id:'block',decision:'deny',include:[{everyone:{}}]}]};
  const fetchImpl=async(url,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');const u=new URL(url);assert.equal(u.host,'api.cloudflare.com');
    const result=u.pathname.endsWith('/deployments')?data.deployments:u.pathname.includes('/versions/')?data.version:
      u.pathname.endsWith('/routes')?data.routes:u.pathname.endsWith('/apps')?data.apps:data.policies;
    return {ok:true,json:async()=>({success:true,result,...(Array.isArray(result)?{result_info:{page:1,total_pages:1,total_count:result.length}}:{})})};
  };
  return {data,env:environment,policy:p,roles,fetchImpl,manifest,now:()=>now,verifyTargets:async()=>({status:'pass',targetBranch:'main',
    originFingerprint:p.databaseTarget.originFingerprint,bindings:[{roleMatches:true,runtimeRoleMatches:true}]})};
}

test('read-only serving check binds exact Worker, UI audience, both sole human selectors, route and main Hyperdrive',async()=>{
  const f=liveFixture(),verified=await verifyRebindLiveTarget(f);assert.equal(verified.status,'VERIFIED');
  assert.deepEqual(verified.bindingProof,proof(f.policy));
  const changes=[f=>f.data.deployments.deployments[0].versions[0].percentage=50,
    f=>f.data.version.annotations['workers/tag']='b'.repeat(40),f=>f.data.version.resources.bindings[0].id='b'.repeat(32),
    f=>f.data.apps[0].aud='synthetic-api',f=>f.data.policies[0].include[0].email.email='different@example.test',
    f=>f.data.routes.push({id:'conflict',pattern:'admin.lythaus.co/api/admin/recovery/*',script:'different'}),
    f=>f.data.policies.push({id:'bypass',decision:'bypass',include:[{everyone:{}}]}),
    f=>f.data.policies[1].include=[],
    f=>f.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL=f.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL.replace('vqa2g2xc9wsl','otherbranch'),
    f=>f.env.GITHUB_RUN_ID='457'];
  for(const mutate of changes){const changed=liveFixture();mutate(changed);await assert.rejects(verifyRebindLiveTarget(changed));}
  for(const invalid of [{page:2,total_pages:1},{page:1,total_pages:1,total_count:999},{page:1,total_pages:11}]){
    const f=liveFixture(),original=f.fetchImpl;f.fetchImpl=async(...args)=>{const response=await original(...args),data=await response.json();
      if(Array.isArray(data.result))data.result_info=invalid;return {...response,json:async()=>data};};
    await assert.rejects(verifyRebindLiveTarget(f));
  }
  const stale=liveFixture();let ticks=0;stale.now=()=>now+(ticks++===0?0:120001);
  await assert.rejects(verifyRebindLiveTarget(stale),/observation_expired/);
});

test('live inventory rejects partial metadata and requires complete stable Access pagination',async()=>{
  for(const invalid of [{page:1,total_count:2},{page:1,total_pages:1},{page:1,total_pages:1,total_count:2},
    {page:1,total_pages:1,total_count:1,count:2},null]){
    const f=liveFixture(),original=f.fetchImpl;
    f.fetchImpl=async(...args)=>{const response=await original(...args),data=await response.json();
      if(new URL(args[0]).pathname.endsWith('/routes'))data.result_info=invalid;
      return {...response,json:async()=>data};};
    await assert.rejects(verifyRebindLiveTarget(f),/pagination/);
  }
  const unpaginated=liveFixture(),routesFetch=unpaginated.fetchImpl;
  unpaginated.fetchImpl=async(...args)=>{const response=await routesFetch(...args),data=await response.json();
    if(new URL(args[0]).pathname.endsWith('/routes'))delete data.result_info;
    return {...response,json:async()=>data};};
  assert.equal((await verifyRebindLiveTarget(unpaginated)).status,'VERIFIED');
  for(const endpoint of ['/apps','/policies']){
    const f=liveFixture(),original=f.fetchImpl;
    f.fetchImpl=async(...args)=>{const response=await original(...args),data=await response.json();
      if(new URL(args[0]).pathname.endsWith(endpoint))delete data.result_info;
      return {...response,json:async()=>data};};
    await assert.rejects(verifyRebindLiveTarget(f),/pagination_missing/);
  }
  const paginated=(mutation,{omitTotalPages=false}={})=>{
    const f=liveFixture(),original=f.fetchImpl;
    f.fetchImpl=async(...args)=>{
      const response=await original(...args),data=await response.json(),url=new URL(args[0]);
      if(url.pathname.endsWith('/apps')){
        const page=Number(url.searchParams.get('page'));
        data.result=[f.data.apps[page-1]];
        data.result_info={page,per_page:1,count:1,total_count:2,total_pages:2};
        if(omitTotalPages)delete data.result_info.total_pages;
        if(page===2)mutation(data,f);
      }
      return {...response,json:async()=>data};
    };
    return f;
  };
  assert.equal((await verifyRebindLiveTarget(paginated(()=>{}))).status,'VERIFIED');
  assert.equal((await verifyRebindLiveTarget(paginated(()=>{},{omitTotalPages:true}))).status,'VERIFIED');
  for(const mutation of [
    data=>{data.result_info.total_pages=1;data.result_info.total_count=1;},
    data=>{data.result_info.total_pages=3;data.result_info.total_count=3;},
    data=>{data.result_info.page=1;},
    data=>{delete data.result_info;},
    (data,f)=>{data.result[0]={...data.result[0],id:f.data.apps[0].id};},
  ])await assert.rejects(verifyRebindLiveTarget(paginated(mutation)),/pagination/);
  for(const mutation of [
    data=>{data.result_info.total_pages=1;},
    data=>{data.result_info.total_pages=3;},
    data=>{data.result_info.total_count=3;},
    data=>{data.result_info.per_page=2;},
    data=>{data.result=[];data.result_info.count=0;},
    data=>{delete data.result_info.per_page;},
  ])await assert.rejects(verifyRebindLiveTarget(paginated(mutation,{omitTotalPages:true})),/pagination/);
});

test('canonical workflow keeps both approvals after normal release, defaults off and retains same-run cleanup',()=>{
  const workflow=YAML.parse(fs.readFileSync('.github/workflows/production-release.yml','utf8'));
  assert.equal(workflow.on.workflow_dispatch.inputs.enable_admin_subject_rebind.default,false);
  assert.ok(workflow.jobs.preflight.steps.some(step=>step.if==='inputs.enable_admin_subject_rebind == true'
    &&step.run==='test "$RELEASE_MODE" = force_auth_critical'));
  const preview=workflow.jobs.admin_rebind_preview,execute=workflow.jobs.admin_rebind_execute,cleanup=workflow.jobs.admin_rebind_cleanup;
  assert.deepEqual(preview.needs,['preflight','workers','production_smoke','manifest']);
  assert.equal(preview.environment,'production');assert.equal(execute.environment,'production');
  assert.ok(preview.steps[0].run.includes('test "$AUTHENTICATED_ACCEPTANCE_PROVEN" = true'));
  assert.ok(preview.steps[0].run.includes('test "$ADMIN_WORKER_SOURCE_SHA" = "$RELEASE_SHA"'));
  for(const job of [preview,execute]){
    assert.ok(job.if.includes("inputs.release_mode == 'force_auth_critical'"));
    assert.ok(job.steps.some(step=>step.run==='node scripts/ci/verify-production-recovery-readiness.mjs'));
    assert.equal(job.env.PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT,"${{ secrets.PLANETSCALE_ADMIN_DATABASE_URL != '' }}");
  }
  assert.equal(preview.env.ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON,'${{ vars.ADMIN_SUBJECT_REBIND_PREVIEW_APPROVAL_JSON }}');
  assert.equal(execute.env.ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON,'${{ vars.ADMIN_SUBJECT_REBIND_EXECUTE_APPROVAL_JSON }}');
  assert.deepEqual(cleanup.needs,['admin_rebind_preview','admin_rebind_execute']);assert.ok(cleanup.if.includes('always()'));
  assert.ok(cleanup.steps.at(-1).run.endsWith(' disable'));
});
