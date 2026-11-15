import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rebindGrantPayload,rebindInstallConsent,installReviewedRebindCapability,withVerifiedRebindInstallation,assertRebindBoundary} from '../ci/admin-subject-rebind-capability.mjs';
import {assertRebindControlBoundary,assertRebindReaderBoundary,assertRebindRestoreStateBoundary,checkedRebindControl} from '../ci/admin-subject-rebind-control.mjs';
import {REBIND_CAPABILITY_SHA256,REBIND_READER_BODY_SHA256,REBIND_MUTATOR_BODY_SHA256} from '../../apps/lythaus-admin-api/src/solo-recovery/rebind-protocol.ts';
import {roles,executor,payload,mutatorRow,readerRow,restoreStateRow,controlBoundaryRow,PolicyClient} from './admin-subject-rebind-fixtures.mjs';

const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
const now=Date.parse('2026-11-14T00:00:00Z');
const record=()=>({schemaVersion:'lythaus-admin-subject-rebind-install-v2',scope:'install_disabled_capability_only',executor,
  metadataVerifierPermission:'disabled_restore_state_only',
  releaseSha:'a'.repeat(40),grantSha256:payload.sha256,roleGrantsSha256:payload.roleGrantsSha256,
  operator:repository.split('/')[0],approvalReference:'synthetic-specific-security-approval',
  approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+300000).toISOString()});
const environment=()=>({GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_REF:'refs/heads/main',
  REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),RELEASE_SHA:'a'.repeat(40),
  GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`,
  GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true',
  ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify(record())});
const consent=env=>rebindInstallConsent(env,{now,committedOnly:false});

test('disabled capability bytes and both runtime body pins match the exact SQL payload',()=>{
  const actual=rebindGrantPayload();
  assert.equal(actual.sha256,REBIND_CAPABILITY_SHA256);
  assert.equal(actual.readerBodySha256,REBIND_READER_BODY_SHA256);
  assert.equal(actual.bodySha256,REBIND_MUTATOR_BODY_SHA256);
});

test('no consent causes no database access',async()=>{
  assert.equal(rebindInstallConsent({}),null);
  assert.deepEqual(await installReviewedRebindCapability({query:async()=>{throw new Error('unexpected_database_call');}},null,{}),
    {status:'NOT_REQUESTED',installed:false});
});

test('installation requires exact new consent, existing executor, protected main and first owner attempt',()=>{
  assert.equal(consent(environment()).payload.sha256,payload.sha256);
  for(const patch of [{GITHUB_REF:'refs/pull/1/merge'},{REF_PROTECTED:'false'},{GITHUB_RUN_ATTEMPT:'2'},
    {GITHUB_ACTOR_ID:'1'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY_ID:'1'},
    {GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/other.yml@refs/heads/main`},
    {PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'false'}])assert.throws(()=>consent({...environment(),...patch}));
  for(const patch of [{schemaVersion:'lythaus-admin-subject-rebind-install-v1'},{metadataVerifierPermission:null},{executor:null},{executor:{...executor,mode:'fallback'}},
    {scope:'activate'},{releaseSha:'b'.repeat(40)},{grantSha256:'b'.repeat(64)},{roleGrantsSha256:'b'.repeat(64)},
    {extra:true},{approvalReference:''},{approvedAt:new Date(now+1000).toISOString()},
    {expiresAt:new Date(now).toISOString()},{expiresAt:new Date(now+48*3600000).toISOString()}]) {
    assert.throws(()=>consent({...environment(),ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify({...record(),...patch})}));
  }
});

test('catalog boundaries reject source, ownership, executable configuration and effective privilege drift',()=>{
  assert.doesNotThrow(()=>assertRebindBoundary(mutatorRow(),payload));
  for(const patch of [{body:mutatorRow().body+' '},{owner:'lythaus_admin'},{security_definer:false},
    {language_matches:false},{return_matches:false},{behavior_matches:false},{arguments_match:false},
    {settings:['search_path=public']},{settings:['search_path=pg_catalog','row_security=off']},
    {admin_execute:false},{runtime_execute:true},{jobs_execute:true},{privacy_execute:true},{admin_direct_update:true},
    {admin_acts_as_owner:true},{unexpected_execute:true},{unexpected_role_reach:true}])assert.throws(()=>assertRebindBoundary({...mutatorRow(),...patch},payload));
  assert.doesNotThrow(()=>assertRebindReaderBoundary(readerRow(),payload));
  assert.doesNotThrow(()=>assertRebindRestoreStateBoundary(restoreStateRow(),payload));
  for(const patch of [{body:'changed'},{owner:'app'},{security_definer:false},{definition_matches:false},
    {verifier_execute:false},{apps_denied:false},{acl_matches:false},{verifier_isolated:false}]) {
    assert.throws(()=>assertRebindRestoreStateBoundary({...restoreStateRow(),...patch},payload));
  }
  for(const patch of [{body:'altered'},{security_definer:false},{owner:'app'},{definition_matches:false},
    {settings:[]},{admin_execute:false},{other_roles_denied:false},{acl_matches:false}])assert.throws(()=>assertRebindReaderBoundary({...readerRow(),...patch},payload));
  assert.doesNotThrow(()=>assertRebindControlBoundary(controlBoundaryRow()));
  for(const patch of [{namespace_matches:false},{owner_matches:false},{columns_match:false},{structure_matches:false},{runtime_isolated:false},
    {acl_matches:false},{constraints:[]},{defaults:[]}])assert.throws(()=>assertRebindControlBoundary({...controlBoundaryRow(),...patch}));
});

test('control records reject unsafe revisions, a different payload and missing cleanup identity',()=>{
  const row={policy_text:'DISABLED',revision:'0',capability_sha256:payload.sha256,disabled_from_policy_sha256:null};
  assert.equal(checkedRebindControl(row,payload).revision,0);
  for(const patch of [{revision:'-1'},{revision:'01'},{revision:'1.0'},{revision:Infinity},
    {revision:String(Number.MAX_SAFE_INTEGER)},{capability_sha256:'f'.repeat(64)},{policy_text:''},
    {disabled_from_policy_sha256:'invalid'},{revision:'1'},{disabled_from_policy_sha256:'f'.repeat(64)},
    {policy_text:'{}'},{revision:'1',policy_text:'{}',disabled_from_policy_sha256:'f'.repeat(64)}]) {
    assert.throws(()=>checkedRebindControl({...row,...patch},payload));
  }
});

test('missing existing owner authority stops before any DDL or policy write',async()=>{
  const client=new PolicyClient();client.blockCapacity=true;
  await assert.rejects(installReviewedRebindCapability(client,consent(environment()),roles,{now:()=>now}),/owner_authority/);
  assert.equal(client.catalogLocks,0);assert.equal(client.alters,0);
  assert.ok(client.queries.every(sql=>sql.startsWith('SELECT ')));
});

test('missing database CREATE authority blocks a new private schema without adding permissions',async()=>{
  const client=new PolicyClient({installed:false});client.blockNamespace=true;
  await assert.rejects(installReviewedRebindCapability(client,consent(environment()),roles,{now:()=>now}),/creation_authority/);
  assert.equal(client.installed,false);assert.ok(client.queries.every(sql=>!sql.startsWith('GRANT ')&&!sql.startsWith('CREATE ')));
});

test('installation commit or close uncertainty is reconciled without another installation',async()=>{
  for(const fault of ['commit','close']) {
    const state=new PolicyClient({installed:false});let opens=0,creates=0;
    const connect=async()=>{const first=opens++===0;return {query:async(sql,args)=>{
      const result=await state.query(sql,args);
      if(sql.includes('CREATE TABLE admin_recovery.subject_rebind_control ('))creates++;
      if(first&&sql==='COMMIT'&&fault==='commit')throw new Error('synthetic_lost_commit');return result;
    },end:async()=>{if(first&&fault==='close')throw new Error('synthetic_lost_close');}};};
    const result=await withVerifiedRebindInstallation({connect,consent:consent(environment()),roles,now:()=>now});
    assert.equal(result.readbackVerified,true);assert.equal(creates,1);assert.equal(opens,2);
    assert.equal(result.membershipWritePerformed,false);
  }
  const state=new PolicyClient({installed:false});let opens=0;
  const connect=async()=>{const first=opens++===0;return {query:async(sql,args)=>{
    const result=await state.query(sql,args);if(first&&sql==='COMMIT'){state.installed=false;throw new Error('unknown');}return result;
  },end:async()=>{}};};
  await assert.rejects(withVerifiedRebindInstallation({connect,consent:consent(environment()),roles,now:()=>now}),/outcome_unknown_read_only_reconciliation/);
  assert.equal(opens,2);
});

test('pre-setup migration approval modules import without installed packages, credentials or network',()=>{
  const sourceRoot=fileURLToPath(new URL('../../',import.meta.url)),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lythaus-rebind-import-'));
  const copied=new Set();
  const copy=file=>{
    if(copied.has(file))return;copied.add(file);
    const content=fs.readFileSync(path.join(sourceRoot,file),'utf8');
    for(const match of content.matchAll(/(?:^|\n)import\s+(?:[^;]+?\sfrom\s*)?['"]([^'"]+)['"]/g)) {
      const specifier=match[1];if(specifier.startsWith('node:'))continue;
      assert.ok(specifier.startsWith('.'),'early validation must not eagerly import an npm dependency');
      const dependency=path.normalize(path.join(path.dirname(file),specifier));
      assert.ok(!dependency.startsWith('..')&&dependency.endsWith('.mjs'),'early validation must stay plain JavaScript');copy(dependency);
    }
    const destination=path.join(temporary,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);
  };
  try {
    const entry='scripts/ci/run-planetscale-migration-probe.mjs';copy(entry);
    const script=`globalThis.fetch=()=>{throw new Error('unexpected_network')};await import(${JSON.stringify(pathToFileURL(path.join(temporary,entry)).href)});`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
    assert.equal(result.status,0,result.stderr);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
