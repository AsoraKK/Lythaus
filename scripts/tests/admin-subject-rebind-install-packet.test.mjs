import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareRebindInstallPacket,requireRebindPacketMain,rebindPacketGithubRead,rebindInstallPacketFailure,REBIND_PACKET_CAPACITY_SQL} from '../ci/admin-subject-rebind-install-packet.mjs';
import {REBIND_OBJECTS_SQL,REBIND_SOURCE_STATE_SQL,rebindInstallConsent} from '../ci/admin-subject-rebind-capability.mjs';
import {REBIND_EXECUTOR_SESSION_SQL,rebindExecutorRoleFingerprint,rebindRoleMapSha256} from '../ci/admin-subject-rebind-executor.mjs';
import {branchQualifiedDatabaseTarget} from '../ci/planetscale-0021-target-identity.mjs';
import {loadApprovedMigrations} from '../ci/planetscale-migration-manifest.mjs';
import {roles} from './admin-subject-rebind-fixtures.mjs';

const source='a'.repeat(40),repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const canary='synthetic-password-never-in-packet',now=Date.parse('2026-11-15T04:00:00.000Z');
const environment=()=>({GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_ACTOR:repository.split('/')[0],
  GITHUB_ACTOR_ID:'211295889',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_RUN_NUMBER:'24',GITHUB_REF:'refs/heads/main',
  REF_PROTECTED:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-cutover-identity-preflight.yml@refs/heads/main`,
  RELEASE_SHA:source,GITHUB_SHA:source,INSPECTION:'rebind-install-packet',MIGRATION_PROBE_APPROVAL_JSON:'',
  PLANETSCALE_ADMIN_DATABASE_URL:`postgresql://pscale_api_executor.vqa2g2xc9wsl:${canary}@aws-eu-central-1-1.pg.psdb.cloud:5432/postgres?sslmode=verify-full`,
  PLANETSCALE_SCHEMA_READ_DATABASE_URL:`postgresql://pscale_api_qodocjs6vgrb.vqa2g2xc9wsl:${canary}@aws-eu-central-1-1.pg.psdb.cloud:5432/postgres?sslmode=verify-full`,
  PLANETSCALE_API_TOKEN:'synthetic-id:synthetic-token',PSCALE_ROLE_IDENTIFIERS:JSON.stringify(roles)});
const checkNames=['Repository hygiene','Workflow lint','Native Workers and PlanetScale','OpenAPI contract','Flutter analyze and test',
  'Web frontends','Dependency audit','CodeQL JavaScript TypeScript','dependency-review','scan','Disabled activity pilot integration',
  'Offline posting feedback evaluation','Validate mobile security contracts'];

function fixture(){
  const env=environment(),calls=[],sql=[],extraRoles=[],configs=[];
  const branch={protected:true,commit:{sha:source},protection:{required_status_checks:{contexts:['Repository hygiene']}}};
  const checks=checkNames.map(name=>({name,app:{id:15368},head_sha:source,status:'completed',conclusion:'success'}));
  const objects={namespace_present:false,control_present:false,reader_present:false,restore_state_present:false,mutator_present:false};
  const capacity={namespace_create:true,functions_create:true,verifier_ready:true};
  const session={database_name:'postgres',current_role:'pscale_api_executor',session_role:'pscale_api_executor',may_set_owner:true,login_valid:true,apps_isolated:true};
  const options={env,now,assertCheckout:async()=>{},read:async suffix=>{
    if(suffix==='/branches/main')return branch;
    if(suffix.includes('/check-runs?'))return {total_count:checks.length,check_runs:checks};
    assert.ok(suffix.startsWith('/actions/runs?status='));return {total_count:0,workflow_runs:[]};
  },fetchImpl:async(url,request)=>{
    assert.equal(request.method,'GET');assert.equal(request.body,undefined);calls.push(url);
    const names=[...Object.values(roles),'pscale_api_executor','pscale_api_qodocjs6vgrb'];
    const data=[...names.map((name,index)=>({id:'syntheticrole'+index,base_username:name,username:`${name}.vqa2g2xc9wsl`,
      ready:true,deleted_at:null,expires_at:null,database_name:'postgres',branch:{id:'vqa2g2xc9wsl',name:'main',deleted_at:null}})),...extraRoles];
    return new Response(JSON.stringify(url.includes('/roles?')?{current_page:1,total_count:data.length,next_page:null,data}
      :{id:'vqa2g2xc9wsl',name:'main',kind:'postgresql',deleted_at:null}),{status:200});
  },clientFactory:config=>{
    configs.push(config);
    assert.equal(config.options,'-c default_transaction_read_only=on');
    return {on(){},connect:async()=>{},end:async()=>{},query:async(text)=>{
      sql.push(text);const one=row=>({rowCount:1,rows:[row]});
      if(text==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')return {rowCount:0,rows:[]};
      if(text.includes('pg_try_advisory_xact_lock'))return one({locked:true});
      if(text===REBIND_EXECUTOR_SESSION_SQL)return one(session);
      if(text===REBIND_PACKET_CAPACITY_SQL)return one(capacity);
      if(text==='SELECT version,checksum FROM system.schema_migrations ORDER BY version')return {rows:loadApprovedMigrations().migrations.map(row=>({version:row.name,checksum:row.checksum}))};
      if(text===REBIND_SOURCE_STATE_SQL)return one({one_membership:true,bootstrap_closed:true,one_bootstrap:true,original_administrator:true});
      if(text===REBIND_OBJECTS_SQL)return one(objects);
      assert.fail('unexpected packet SQL');
    }};
  }};
  return {env,options,branch,checks,objects,capacity,session,calls,sql,extraRoles,configs};
}

function separateFixture(){
  const f=fixture(),role='pscale_api_dedicated';
  f.env.ADMIN_REBIND_CONNECTION='separate';
  f.env.PLANETSCALE_ADMIN_REBIND_DATABASE_URL=f.env.PLANETSCALE_ADMIN_DATABASE_URL.replace('pscale_api_executor',role);
  f.extraRoles.push({id:'separatefixture',base_username:role,username:`${role}.vqa2g2xc9wsl`,ready:true,deleted_at:null,
    database_name:'postgres',branch:{id:'vqa2g2xc9wsl',name:'main',deleted_at:null},with_replication:false,
    created_at:new Date(now-60000).toISOString(),expires_at:new Date(now+3600000).toISOString()});
  Object.assign(f.session,{current_role:role,session_role:role});
  return f;
}

test('dedicated packet uses only the explicit separate binding and retains a non-executable exact-mode draft',async()=>{
  const f=separateFixture(),original=f.env.PLANETSCALE_ADMIN_DATABASE_URL,result=await prepareRebindInstallPacket(f.options);
  assert.equal(result.consentDraft.executor.mode,'separate_owner_connection');
  assert.equal(result.consentDraft.executor.roleId,'separatefixture');assert.equal(result.executable,false);
  assert.equal(result.consentDraft.approvalReference,null);assert.equal(f.sql.length,7);assert.equal(f.configs.length,1);
  assert.equal(new URL(f.configs[0].connectionString).username,'pscale_api_dedicated.vqa2g2xc9wsl');
  assert.equal(f.env.PLANETSCALE_ADMIN_DATABASE_URL,original);
  for(const value of [canary,f.env.PLANETSCALE_ADMIN_REBIND_DATABASE_URL])assert.equal(JSON.stringify(result).includes(value),false);
});

test('dedicated packet never falls back or produces consent after profile or SQL qualification failure',async()=>{
  for(const change of [f=>delete f.env.PLANETSCALE_ADMIN_REBIND_DATABASE_URL,f=>f.extraRoles[0].with_replication=true,
    f=>f.extraRoles[0].expires_at=null,f=>f.session.login_valid=false]) {
    const f=separateFixture();change(f);let caught;
    await assert.rejects(prepareRebindInstallPacket(f.options),error=>{caught=error;return true;});
    const report=rebindInstallPacketFailure(caught,{env:f.env,now});
    assert.equal(report.status,'BLOCKED');assert.equal(report.executable,false);assert.equal(Object.hasOwn(report,'consentDraft'),false);
    assert.ok(f.configs.every(config=>new URL(config.connectionString).username==='pscale_api_dedicated.vqa2g2xc9wsl'));
  }
});

test('packet preparation reads existing bindings and emits a non-executable exact-source consent draft',async()=>{
  const f=fixture(),result=await prepareRebindInstallPacket(f.options);
  assert.equal(result.status,'REVIEW_PACKET_NOT_INSTALL_AUTHORITY');assert.equal(result.capabilityState,'ABSENT');
  assert.equal(result.executable,false);assert.equal(result.databaseWrites,false);assert.equal(result.providerMutations,false);
  assert.equal(result.credentialsCreated,false);assert.equal(result.ownerLoginVerified,false);
  assert.equal(result.consentDraft.approvedAt,null);assert.equal(result.consentDraft.expiresAt,null);
  assert.equal(result.consentDraft.approvalReference,null);assert.equal(result.sourceMainSha,source);
  assert.equal(f.calls.length,2);assert.equal(f.sql.length,7);
  assert.ok(f.sql.every(text=>/^SELECT\s/.test(text)||text==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  const serialized=JSON.stringify(result);
  for(const value of [canary,f.env.PLANETSCALE_ADMIN_DATABASE_URL,...Object.values(roles),'pscale_api_executor'])assert.equal(serialized.includes(value),false);
  assert.throws(()=>rebindInstallConsent({...f.env,
    GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`,
    PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true',ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify(result.consentDraft)},
  {now,committedOnly:false}));
});

test('old modes, credential consent, wrong owner and retried runs cannot prepare a packet',async()=>{
  for(const change of [{INSPECTION:'migration-role-audit'},{MIGRATION_PROBE_APPROVAL_JSON:'{}'},
    {GITHUB_RUN_ATTEMPT:'2'},{GITHUB_ACTOR_ID:'1'},{GITHUB_SHA:'b'.repeat(40)}]){
    const f=fixture();Object.assign(f.env,change);await assert.rejects(prepareRebindInstallPacket(f.options));
    assert.equal(f.calls.length,0);assert.equal(f.sql.length,0);
  }
});

test('default packet reader reaches only exact GET endpoints and fails closed on transport or redirect',async t=>{
  const f=fixture(),requests=[];f.env.GH_TOKEN='synthetic-github-token';
  t.mock.method(globalThis,'fetch',async(url,request)=>{
    requests.push(url);assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.body,undefined);
    assert.equal(request.headers.authorization,`Bearer ${f.env.GH_TOKEN}`);
    const suffix=url.slice(`https://api.github.com/repos/${repository}`.length);
    return new Response(JSON.stringify(await f.options.read(suffix)),{status:200});
  });
  const result=await prepareRebindInstallPacket({...f.options,read:undefined});
  assert.equal(result.status,'REVIEW_PACKET_NOT_INSTALL_AUTHORITY');
  assert.equal(requests.filter(url=>url.endsWith('/branches/main')).length,2);
  assert.equal(requests.filter(url=>url.includes(`/commits/${source}/check-runs?`)).length,2);
  for(const suffix of ['/branches/other',`/commits/${'b'.repeat(40)}/check-runs?filter=latest&per_page=100`,'/settings','//other.test'])
    await assert.rejects(rebindPacketGithubRead(f.env,suffix),/packet_github_path_invalid/);
  for(const fetchImpl of [async()=>new Response('{}',{status:302}),async()=>new Response('{}',{status:403}),
    async()=>{throw new Error('synthetic transport canary');},async()=>new Response('x'.repeat(1048577),{status:200})])
    await assert.rejects(rebindPacketGithubRead(f.env,'/branches/main',fetchImpl),/packet_github_read_failed/);
});

test('main movement, incomplete or failing exact checks block before protected database access',async()=>{
  for(const mutate of [f=>f.branch.commit.sha='b'.repeat(40),f=>f.branch.protected=false,
    f=>f.checks.pop(),f=>f.checks[0].conclusion='failure',f=>f.checks[0].head_sha='b'.repeat(40),
    f=>f.checks[0].app.id=1,f=>f.branch.protection.required_status_checks.contexts.push('additional-required-check')]){
    const f=fixture();mutate(f);await assert.rejects(requireRebindPacketMain(f.env,f.options.read));
    await assert.rejects(prepareRebindInstallPacket(f.options));assert.equal(f.calls.length,0);assert.equal(f.sql.length,0);
  }
});

test('missing existing authority or any existing/partial capability blocks instead of creating or replacing it',async()=>{
  for(const mutate of [f=>f.capacity.namespace_create=false,f=>f.capacity.functions_create=false,f=>f.session.may_set_owner=false,
    f=>f.session.apps_isolated=false,f=>f.objects.namespace_present=true,f=>f.objects.mutator_present=true,
    f=>{for(const key of Object.keys(f.objects))f.objects[key]=true;}]){
    const f=fixture();mutate(f);await assert.rejects(prepareRebindInstallPacket(f.options));
    assert.ok(f.sql.every(text=>!text.startsWith('CREATE ')&&!text.startsWith('GRANT ')&&!text.startsWith('SET ROLE')));
  }
});

test('blocked packet retains sanitized session facts without publishing an executable draft or identity material',async()=>{
  const f=fixture();Object.assign(f.session,{login_valid:false,role_present:true,can_login:true,is_superuser:false,
    replication_enabled:true,unexpired:true,private_field:canary});
  let caught;await assert.rejects(prepareRebindInstallPacket(f.options),error=>{caught=error;return /owner_authority/.test(error.message);});
  const report=rebindInstallPacketFailure(caught,{env:f.env,now});
  assert.equal(report.status,'BLOCKED');assert.equal(report.blocker,'admin_rebind_existing_owner_authority_unverified');
  assert.equal(report.sourceMainSha,source);assert.equal(report.runId,f.env.GITHUB_RUN_ID);
  assert.equal(report.executorSession.checks.sqlReplicationEnabled,true);assert.equal(report.executorSession.checks.loginProfileAllowed,false);
  assert.equal(report.executorSession.checks.roleMatchesApproval,true);assert.equal(report.executable,false);
  assert.deepEqual(report.configuredExecutor,{
    mode:'existing_owner_connection',branchId:'vqa2g2xc9wsl',databaseName:'postgres',roleId:'syntheticrole5',
    roleFingerprint:rebindExecutorRoleFingerprint('pscale_api_executor'),
    originFingerprint:branchQualifiedDatabaseTarget(f.env.PLANETSCALE_ADMIN_DATABASE_URL).originFingerprint,
    roleMapSha256:rebindRoleMapSha256(roles),
  });
  assert.equal(report.configuredExecutorStatus,'PROVIDER_IDENTITY_VERIFIED_SQL_QUALIFICATION_FAILED');
  for(const key of ['roleFingerprint','originFingerprint','roleMapSha256'])assert.match(report.configuredExecutor[key],/^[a-f0-9]{64}$/);
  report.configuredExecutor.roleId='modified-copy';
  assert.equal(rebindInstallPacketFailure(caught,{env:f.env,now}).configuredExecutor.roleId,'syntheticrole5');
  assert.equal(report.databaseWrites,false);assert.equal(report.providerMutations,false);assert.equal(report.credentialsCreated,false);
  assert.equal(report.consentDraft,undefined);assert.equal(f.sql.length,3);
  for(const value of [canary,f.env.PLANETSCALE_ADMIN_DATABASE_URL,...Object.values(roles),'pscale_api_executor'])
    assert.equal(JSON.stringify(report).includes(value),false);
  const generic=rebindInstallPacketFailure(Object.assign(new Error(canary),{executorSession:{private_field:canary},
    configuredExecutor:report.configuredExecutor}),{env:f.env,now});
  assert.equal(generic.blocker,'read_only_packet_unverified');assert.equal(generic.executorSession,undefined);
  assert.equal(generic.configuredExecutor,undefined);assert.equal(generic.configuredExecutorStatus,undefined);
  assert.equal(JSON.stringify(generic).includes(canary),false);
});

test('unverified provider or target cannot populate a configured-executor approval binding',async()=>{
  const f=fixture();f.env.PLANETSCALE_ADMIN_DATABASE_URL=f.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL;
  let caught;await assert.rejects(prepareRebindInstallPacket(f.options),error=>{caught=error;return true;});
  const report=rebindInstallPacketFailure(caught,{env:f.env,now});
  assert.equal(report.status,'BLOCKED');assert.equal(report.configuredExecutor,undefined);assert.equal(report.consentDraft,undefined);
  assert.equal(report.executorSession,undefined);assert.equal(f.sql.length,0);
});
