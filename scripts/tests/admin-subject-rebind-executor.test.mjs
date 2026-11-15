import assert from 'node:assert/strict';
import test from 'node:test';
import {assertRebindExecutorTarget,verifyRebindExecutorProvider,assertRebindExecutorSession,validateRebindExecutor,rebindExecutorSessionDiagnostic}
  from '../ci/admin-subject-rebind-executor.mjs';
import {branchQualifiedDatabaseTarget} from '../ci/planetscale-0021-target-identity.mjs';
import {roles,executor,PolicyClient} from './admin-subject-rebind-fixtures.mjs';
import {REBIND_METADATA_VERIFIER_ROLE} from '../ci/admin-subject-rebind-control.mjs';

const raw='postgresql://pscale_api_executor.vqa2g2xc9wsl:synthetic@fixture.psdb.cloud/postgres?sslmode=verify-full';
const origin=branchQualifiedDatabaseTarget(raw).originFingerprint;
const binding=()=>({...executor,originFingerprint:origin});
const now=Date.parse('2026-11-14T12:00:00Z');

test('explicit existing executor does not rewrite the canonical map or fall back after target failure',()=>{
  const unchanged=JSON.stringify(roles);
  assert.equal(assertRebindExecutorTarget(raw,roles,origin,binding()).role,'pscale_api_executor');
  assert.equal(JSON.stringify(roles),unchanged);
  for(const changed of [raw.replace('executor','migrations'),raw.replace('vqa2g2xc9wsl','otherbranch'),
    raw.replace('fixture.psdb.cloud','other.psdb.cloud'),raw.replace('/postgres?','/other?'),raw.replace('verify-full','disable')]) {
    assert.throws(()=>assertRebindExecutorTarget(changed,roles,origin,binding()));
  }
  for(const changed of [{...binding(),mode:'canonical_fallback'},{...binding(),roleFingerprint:'f'.repeat(64)},
    {...binding(),roleMapSha256:'f'.repeat(64)},null])assert.throws(()=>assertRebindExecutorTarget(raw,roles,origin,changed));
  for(const changed of [{...binding(),unexpected:true},{...binding(),roleId:''}])assert.throws(()=>validateRebindExecutor(changed));
});

function providerFixture(){
  const row={id:executor.roleId,base_username:'pscale_api_executor',username:'pscale_api_executor.vqa2g2xc9wsl',
    ready:true,deleted_at:null,database_name:'postgres',expires_at:null,
    branch:{id:'vqa2g2xc9wsl',name:'main',deleted_at:null}};
  const branch={id:'vqa2g2xc9wsl',name:'main',kind:'postgresql',deleted_at:null};
  const verifier={...row,id:'syntheticverifier',base_username:REBIND_METADATA_VERIFIER_ROLE,
    username:`${REBIND_METADATA_VERIFIER_ROLE}.vqa2g2xc9wsl`};
  const page={current_page:1,total_count:2,next_page:null,data:[row,verifier]},calls=[];
  return {row,branch,page,calls,fetchImpl:async(url,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
    calls.push(url);return new Response(JSON.stringify(url.includes('/roles?')?page:branch),{status:200});
  }};
}

test('provider verification reuses bounded complete read-only inventory and proves cleanup lifetime',async()=>{
  const f=providerFixture();
  assert.deepEqual(await verifyRebindExecutorProvider({PLANETSCALE_API_TOKEN:'synthetic-id:synthetic-value'},binding(),
    {fetchImpl:f.fetchImpl,now,requiredThrough:now+300000}),{executorVerified:true});
  assert.equal(f.calls.length,2);
  const mutations=[f=>f.row.id='different',f=>f.row.deleted_at=new Date(now).toISOString(),f=>f.row.ready=false,
    f=>f.row.expires_at=new Date(now+1000).toISOString(),f=>f.row.database_name='other',f=>f.branch.name='other',
    f=>f.page.total_count=3,f=>delete f.page.next_page,f=>f.page.data.push({...f.row}),f=>f.page.current_page=2];
  for(const change of mutations){const f=providerFixture();change(f);
    await assert.rejects(verifyRebindExecutorProvider({PLANETSCALE_API_TOKEN:'synthetic-id:synthetic-value'},binding(),
      {fetchImpl:f.fetchImpl,now,requiredThrough:now+300000}),/admin_rebind_executor_/);
  }
});

test('actual session requires the approved login, unchanged map and pre-existing isolated owner authority',async()=>{
  await assertRebindExecutorSession(new PolicyClient(),executor,roles);
  for(const change of [{current_role:'pscale_api_migrations'},{session_role:'other'},
    {database_name:'other'},{may_set_owner:false},{login_valid:false},{apps_isolated:false}]){
    const client=new PolicyClient();client.sessionOverride=change;
    await assert.rejects(assertRebindExecutorSession(client,executor,roles),/owner_authority/);
    assert.ok(client.queries.every(sql=>sql.startsWith('SELECT ')));
  }
  await assert.rejects(assertRebindExecutorSession(new PolicyClient(),executor,{...roles,lythaus_migrations:'pscale_api_different'}),/role_map_changed/);
});

test('failed owner guard exposes only boolean observations and still rejects a replication-enabled profile',async()=>{
  const client=new PolicyClient(),canary='synthetic-private-session-value';
  client.sessionOverride={role_present:true,can_login:true,is_superuser:false,replication_enabled:true,unexpired:true,
    login_valid:false,private_field:canary};
  let caught;
  await assert.rejects(assertRebindExecutorSession(client,executor,roles),error=>{caught=error;return /owner_authority/.test(error.message);});
  const diagnostic=rebindExecutorSessionDiagnostic(caught);
  assert.equal(diagnostic.schemaVersion,'lythaus-rebind-executor-session-v1');
  assert.deepEqual(diagnostic.checks,{oneRow:true,databaseMatches:true,sessionIdentityMatches:true,roleMatchesApproval:true,
    maySetOwner:true,loginProfileAllowed:false,applicationRolesIsolated:true,sqlRolePresent:true,sqlCanLogin:true,
    sqlSuperuser:false,sqlReplicationEnabled:true,sqlUnexpired:true});
  assert.equal(JSON.stringify(diagnostic).includes(canary),false);
  assert.equal(JSON.stringify(diagnostic).includes('pscale_api_'),false);
  assert.equal(client.queries.length,1);assert.ok(client.queries[0].startsWith('SELECT '));
  caught.executorSession={private_field:canary};assert.deepEqual(rebindExecutorSessionDiagnostic(caught),diagnostic);
  assert.equal(rebindExecutorSessionDiagnostic(Object.assign(new Error(caught.message),{executorSession:diagnostic})),null);
});

test('malformed session evidence remains rejected with unknown facts instead of invented role observations',async()=>{
  for(const result of [undefined,{rowCount:0,rows:[]},{rowCount:1,rows:[null]},{rowCount:2,rows:[{},{}]},
    {rowCount:1,rows:[{}]}]){
    let caught;
    await assert.rejects(assertRebindExecutorSession({query:async()=>result},executor,roles),error=>{caught=error;return /owner_authority/.test(error.message);});
    const diagnostic=rebindExecutorSessionDiagnostic(caught);
    assert.equal(diagnostic.checks.sqlCanLogin,null);assert.equal(diagnostic.checks.sqlReplicationEnabled,null);
    assert.equal(diagnostic.checks.sessionIdentityMatches,null);
    assert.ok(Object.values(diagnostic.checks).every(value=>value===null||typeof value==='boolean'));
  }
});
