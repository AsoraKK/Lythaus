import assert from 'node:assert/strict';
import test from 'node:test';
import {rebindGrantPayload,rebindInstallConsent,installReviewedRebindCapability,assertRebindBoundary}
  from '../ci/admin-subject-rebind-capability.mjs';

const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const now=Date.parse('2026-11-14T00:00:00Z');
const payload=rebindGrantPayload();
const record=()=>({schemaVersion:'lythaus-admin-subject-rebind-install-v1',scope:'install_disabled_capability_only',
  releaseSha:'a'.repeat(40),grantSha256:payload.sha256,roleGrantsSha256:payload.roleGrantsSha256,
  operator:repository.split('/')[0],approvalReference:'synthetic-specific-security-approval',
  approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+300000).toISOString()});
const environment=()=>({GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_REF:'refs/heads/main',
  REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),RELEASE_SHA:'a'.repeat(40),
  GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`,
  GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true',
  ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify(record())});
const consent=env=>rebindInstallConsent(env,{now,committedOnly:false});

test('capability installation defaults to no action and reads no database without consent',async()=>{
  assert.equal(rebindInstallConsent({}),null);
  assert.deepEqual(await installReviewedRebindCapability({query:async()=>{throw new Error('unexpected_database_call');}},null,{}),
    {status:'NOT_REQUESTED',installed:false});
});

test('exact disabled installation binds protected main, operator, first attempt and both SQL payloads',()=>{
  const approved=consent(environment());assert.equal(approved.payload.sha256,payload.sha256);
  for(const patch of [{GITHUB_REF:'refs/pull/1/merge'},{REF_PROTECTED:'false'},{GITHUB_RUN_ATTEMPT:'2'},
    {GITHUB_ACTOR_ID:'1'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY_ID:'1'},
    {GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/other.yml@refs/heads/main`},
    {PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'false'}]) {
    assert.throws(()=>consent({...environment(),...patch}));
  }
  for(const patch of [{scope:'activate'},{releaseSha:'b'.repeat(40)},{grantSha256:'b'.repeat(64)},
    {roleGrantsSha256:'b'.repeat(64)},{extra:true},{approvalReference:''},
    {approvedAt:new Date(now+1000).toISOString()},{expiresAt:new Date(now).toISOString()},
    {expiresAt:new Date(now+48*3600000).toISOString()}]) {
    assert.throws(()=>consent({...environment(),ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify({...record(),...patch})}));
  }
});

test('capability postcondition rejects source, owner, activation and privilege drift',()=>{
  const row={body:payload.sql.match(/AS \$\$([\s\S]*?)\$\$;/)[1],security_definer:true,owner:'postgres',
    language_matches:true,return_matches:true,behavior_matches:true,arguments_match:true,
    settings:['search_path=pg_catalog','lythaus.admin_subject_rebind_approval=DISABLED'],
    admin_execute:true,runtime_execute:false,jobs_execute:false,privacy_execute:false,
    admin_direct_update:false,admin_acts_as_owner:false,unexpected_execute:false,unexpected_role_reach:false};
  assert.doesNotThrow(()=>assertRebindBoundary(row,payload));
  for(const patch of [{body:row.body+' '},{owner:'lythaus_admin'},{security_definer:false},
    {language_matches:false},{return_matches:false},{behavior_matches:false},{arguments_match:false},
    {settings:['search_path=pg_catalog','lythaus.admin_subject_rebind_approval={}']},
    {settings:[...row.settings,'row_security=off']},{admin_execute:false},{runtime_execute:true},
    {jobs_execute:true},{privacy_execute:true},{admin_direct_update:true},{admin_acts_as_owner:true},{unexpected_execute:true},
    {unexpected_role_reach:true}]) {
    assert.throws(()=>assertRebindBoundary({...row,...patch},payload));
  }
});

test('installation refuses missing existing owner or parameter authority before DDL',async()=>{
  const roles=Object.fromEntries(['runtime','admin','jobs','privacy','migrations'].map(label=>['lythaus_'+label,'pscale_api_test'+label]));
  const approved=consent(environment());
  for(const missing of ['owner','parameter']){
    const calls=[];
    const client={query:async sql=>{
      calls.push(sql);
      if(sql.includes(' AS owner_context_available'))return {rowCount:1,rows:[{owner_context_available:missing!=='owner'}]};
      if(sql==='SET LOCAL ROLE postgres')return {rows:[]};
      if(sql.includes(' AS policy_setting_available'))return {rowCount:1,rows:[{policy_setting_available:false}]};
      throw new Error('unexpected_database_call');
    }};
    await assert.rejects(()=>installReviewedRebindCapability(client,approved,roles,{now:()=>now}),/admin_rebind_(owner_context|policy_setting_permission)_unavailable/);
    assert.ok(calls.every(sql=>sql.startsWith('SELECT ')||sql==='SET LOCAL ROLE postgres'));
  }
});
