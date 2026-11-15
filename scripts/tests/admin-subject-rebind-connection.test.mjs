import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import pg from 'pg';
import YAML from 'yaml';
import {selectRebindConnection,rebindSqlClient} from '../ci/admin-subject-rebind-connection.mjs';
import {approvedRebindInstallationConnection,exportApprovedRebindInstallationConnection} from '../ci/resolve-admin-subject-rebind-connection.mjs';
import {assertRebindExecutorProviderProfile,assertRebindExecutorSession,rebindExecutorRoleFingerprint,rebindRoleMapSha256}
  from '../ci/admin-subject-rebind-executor.mjs';
import {branchQualifiedDatabaseTarget} from '../ci/planetscale-0021-target-identity.mjs';
import {requireRebindActivationContext} from '../ci/admin-subject-rebind-activation.mjs';
import {runRebindActivation} from '../ci/run-admin-subject-rebind-activation.mjs';
import {roles,payload,PolicyClient} from './admin-subject-rebind-fixtures.mjs';

const now=Date.parse('2026-11-15T10:00:00Z'),source='a'.repeat(40);
const raw='postgresql://pscale_api_oldowner.vqa2g2xc9wsl:synthetic-old@aws-eu-central-1-1.pg.psdb.cloud:5432/postgres?sslmode=verify-full';
const dedicated=raw.replace('oldowner','executor').replace('synthetic-old','synthetic-new%25password');
const target=branchQualifiedDatabaseTarget(dedicated);
const executor={mode:'separate_owner_connection',branchId:'vqa2g2xc9wsl',databaseName:'postgres',roleId:'syntheticowner',
  roleFingerprint:rebindExecutorRoleFingerprint(target.role),originFingerprint:target.originFingerprint,roleMapSha256:rebindRoleMapSha256(roles)};
const connections=()=>({PLANETSCALE_ADMIN_DATABASE_URL:raw,PLANETSCALE_ADMIN_REBIND_DATABASE_URL:dedicated,
  INSPECTION:'rebind-install-packet',PSCALE_ROLE_IDENTIFIERS:JSON.stringify(roles)});
function installation() {
  const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
  const record={schemaVersion:'lythaus-admin-subject-rebind-install-v2',scope:'install_disabled_capability_only',
    releaseSha:source,grantSha256:payload.sha256,roleGrantsSha256:payload.roleGrantsSha256,executor,
    metadataVerifierPermission:'disabled_restore_state_only',operator:repository.split('/')[0],
    approvalReference:'specific-synthetic-approval',approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()};
  return {...connections(),CI:'false',GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_REF:'refs/heads/main',
    REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:source,RELEASE_SHA:source,
    GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`,
    GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'false',
    ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify(record),RUNNER_TEMP:'/tmp/synthetic-rebind',GITHUB_ENV:'/tmp/synthetic-rebind/env'};
}

test('default selection preserves the working connection and canonical map even when a separate secret exists',()=>{
  const env=connections(),before=JSON.stringify(env),selected=selectRebindConnection(env,{stage:'packet'});
  assert.equal(selected.mode,'existing_owner_connection');assert.equal(selected.env.PLANETSCALE_ADMIN_DATABASE_URL,raw);
  assert.equal(JSON.stringify(env),before);assert.equal(selected.env.PSCALE_ROLE_IDENTIFIERS,env.PSCALE_ROLE_IDENTIFIERS);
});

test('separate packet selection is explicit and never falls back after missing, same-role or wrong-target bindings',()=>{
  const env={...connections(),ADMIN_REBIND_CONNECTION:'separate'};
  assert.equal(selectRebindConnection(env,{stage:'packet'}).env.PLANETSCALE_ADMIN_DATABASE_URL,dedicated);
  for(const patch of [{PLANETSCALE_ADMIN_REBIND_DATABASE_URL:undefined},{PLANETSCALE_ADMIN_REBIND_DATABASE_URL:''},
    {PLANETSCALE_ADMIN_REBIND_DATABASE_URL:raw.replace('synthetic-old','other-password')},
    {PLANETSCALE_ADMIN_REBIND_DATABASE_URL:dedicated.replace('vqa2g2xc9wsl','otherbranch')},
    {PLANETSCALE_ADMIN_REBIND_DATABASE_URL:dedicated.replace('/postgres?','/other?')},
    {PLANETSCALE_ADMIN_REBIND_DATABASE_URL:dedicated.replace('aws-eu-central-1-1','other')},
    {PLANETSCALE_ADMIN_REBIND_DATABASE_URL:dedicated+'\nINJECT=synthetic'},
    {ADMIN_REBIND_CONNECTION:'unknown'},{ADMIN_REBIND_CONNECTION:false},{INSPECTION:'migration-probe'}]) {
    assert.throws(()=>selectRebindConnection({...env,...patch},{stage:'packet'}),error=>{
      assert.doesNotMatch(error.message,/synthetic|postgresql:/);return /^admin_rebind_/.test(error.message);
    });
  }
});

test('install and later separately approved activation choose only their explicit executor mode',()=>{
  const env=installation();
  assert.equal(selectRebindConnection(env,{stage:'install'}).mode,'separate_owner_connection');
  for(const stage of ['preview','execute']) {
    const activation={...connections(),ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON:JSON.stringify({executor})};
    assert.equal(selectRebindConnection(activation,{stage}).env.PLANETSCALE_ADMIN_DATABASE_URL,dedicated);
    activation.ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON=JSON.stringify({executor:{...executor,mode:'existing_owner_connection'}});
    assert.equal(selectRebindConnection(activation,{stage}).env.PLANETSCALE_ADMIN_DATABASE_URL,raw);
  }
  for(const rawApproval of ['',null,'{}','[]','{"executor":{"mode":"fallback"}}','not-json'])
    assert.throws(()=>selectRebindConnection({...env,ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:rawApproval},{stage:'install'}));
});

test('cleanup retains the same-run dedicated tuple and cannot fall back to another operation approval',()=>{
  const env={...installation(),ADMIN_REBIND_EXECUTOR_BINDING_JSON:JSON.stringify(executor),
    ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON:JSON.stringify({executor:{...executor,mode:'existing_owner_connection'}})};
  assert.equal(selectRebindConnection(env,{stage:'disable'}).env.PLANETSCALE_ADMIN_DATABASE_URL,dedicated);
  delete env.PLANETSCALE_ADMIN_REBIND_DATABASE_URL;
  assert.throws(()=>selectRebindConnection(env,{stage:'disable'}),/selected_connection_unavailable/);
});

test('complete install consent and target pins are validated before any runner export',()=>{
  const env=installation(),before=JSON.stringify(env);
  assert.equal(approvedRebindInstallationConnection(env,{now}).mode,'separate_owner_connection');
  assert.equal(JSON.stringify(env),before);
  for(const mutate of [record=>record.expiresAt=new Date(now-1).toISOString(),record=>record.releaseSha='b'.repeat(40),
    record=>record.executor={...executor,roleFingerprint:'f'.repeat(64)},record=>record.executor={...executor,roleMapSha256:'f'.repeat(64)}]) {
    const record=JSON.parse(env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON);mutate(record);let calls=0;
    assert.throws(()=>exportApprovedRebindInstallationConnection({...env,ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify(record)},
      {now,write:()=>calls++,mask:()=>calls++}));assert.equal(calls,0);
  }
});

test('existing-mode install preserves false or missing credential proof and rejects before export',()=>{
  const env=installation(),record=JSON.parse(env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON);
  record.executor={...executor,mode:'existing_owner_connection',roleFingerprint:rebindExecutorRoleFingerprint(branchQualifiedDatabaseTarget(raw).role)};
  env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON=JSON.stringify(record);
  env.PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT='true';
  assert.equal(approvedRebindInstallationConnection(env,{now}).mode,'existing_owner_connection');
  for(const marker of ['false',undefined]) {
    const rejected={...env,PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:marker};
    assert.equal(selectRebindConnection(rejected,{stage:'install'}).env.PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT,marker);
    assert.throws(()=>exportApprovedRebindInstallationConnection(rejected,{now,write:()=>assert.fail('unexpected export'),
      mask:()=>assert.fail('unexpected secret mask')}),/install_requires_existing_credential/);
  }
});

test('existing-mode preview, execute and cleanup preserve credential proof and reject before any connection',async t=>{
  let connections=0,requests=0;
  t.mock.method(pg.Client.prototype,'connect',async()=>{connections++;throw new Error('unexpected connection');});
  const context=installation();
  const env={...context,ENABLE_ADMIN_SUBJECT_REBIND:'true',RELEASE_MODE:'force_auth_critical',GITHUB_RUN_ID:'456',
    GITHUB_WORKFLOW_REF:`${context.GITHUB_REPOSITORY}/.github/workflows/production-release.yml@refs/heads/main`,
    ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON:JSON.stringify({executor:{...executor,mode:'existing_owner_connection'}}),
    ADMIN_REBIND_EXECUTOR_BINDING_JSON:JSON.stringify({...executor,mode:'existing_owner_connection'})};
  for(const stage of ['preview','execute','disable']) {
    requireRebindActivationContext(selectRebindConnection({...env,PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true'},{stage}).env);
    for(const marker of ['false',undefined])await assert.rejects(runRebindActivation({stage,
      env:{...env,PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:marker},fetchImpl:async()=>{requests++;assert.fail('unexpected request');}}),
    /activation_requires_existing_credential/);
  }
  assert.equal(connections,0);assert.equal(requests,0);
});

test('approved runner-local export masks first, emits no credential report, and rejects another destination',()=>{
  const env=installation(),calls=[];
  const result=exportApprovedRebindInstallationConnection(env,{now,mask:line=>calls.push(['mask',line]),
    write:(file,body)=>calls.push(['write',file,body])});
  assert.equal(calls[0][0],'mask');assert.ok(calls[0][1].includes('%2525'));
  assert.equal(calls[1][1],env.GITHUB_ENV);assert.ok(calls[1][2].includes(`PLANETSCALE_ADMIN_DATABASE_URL=${dedicated}\n`));
  assert.ok(calls[1][2].includes('PLANETSCALE_EPHEMERAL_ROLE_ID=\n'));
  assert.equal(JSON.stringify(result).includes('synthetic-new'),false);assert.equal(result.credentialsCreated,false);
  assert.throws(()=>exportApprovedRebindInstallationConnection({...env,GITHUB_ENV:'/tmp/other/env'},
    {now,write:()=>assert.fail('unexpected write'),mask:()=>assert.fail('unexpected mask')}),/export_unverified/);
  assert.throws(()=>exportApprovedRebindInstallationConnection({...env,GITHUB_ENV:'/tmp/synthetic-rebind/../other/env'},
    {now,write:()=>assert.fail('unexpected write'),mask:()=>assert.fail('unexpected mask')}),/export_unverified/);
});

test('normal locked pg startup remains unconnected and preserves TLS verification',()=>{
  const client=rebindSqlClient({connectionString:'postgresql://synthetic:synthetic@127.0.0.1/postgres',
    ssl:{rejectUnauthorized:true}},pg.Client);
  assert.equal(client._connected,false);assert.equal(client.connectionParameters.replication,undefined);
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized,true);
});

test('PGREPLICATION presence including empty is rejected before constructing a client',()=>{
  class Never {constructor(){assert.fail('unexpected client construction');}}
  for(const value of ['', 'database','true','false'])
    assert.throws(()=>rebindSqlClient({},Never,{env:{PGREPLICATION:value}}),/sql_transport_unverified/);
});

test('locked pg truthy environment fallback is denied even with replication:false',()=>{
  const previous=process.env.PGREPLICATION;
  try {
    process.env.PGREPLICATION='database';
    const config={connectionString:'postgresql://synthetic:synthetic@127.0.0.1/postgres',replication:false};
    assert.equal(new pg.Client(config).connectionParameters.replication,'database');
    assert.throws(()=>rebindSqlClient(config,pg.Client,{env:{}}),/sql_transport_unverified/);
  } finally {if(previous===undefined)delete process.env.PGREPLICATION;else process.env.PGREPLICATION=previous;}
});

test('parsed URL replication and clients with missing or unsafe startup evidence are rejected before connect',()=>{
  const raw='postgresql://synthetic:synthetic@127.0.0.1/postgres?replication=database';
  assert.equal(new pg.Client({connectionString:raw,replication:false}).connectionParameters.replication,'database');
  assert.throws(()=>rebindSqlClient({connectionString:raw},pg.Client),/sql_transport_unverified/);
  for(const parameters of [undefined,{}, {replication:'database'},{replication:true}]) {
    class Unsafe {constructor(){this.connectionParameters=parameters;}connect(){assert.fail('unexpected connect');}}
    assert.throws(()=>rebindSqlClient({},Unsafe),/sql_transport_unverified/);
  }
});

const provider=()=>({id:executor.roleId,base_username:target.role,username:`${target.role}.vqa2g2xc9wsl`,ready:true,
  database_name:'postgres',deleted_at:null,branch:{id:'vqa2g2xc9wsl',name:'main',deleted_at:null},with_replication:false,
  created_at:new Date(now-60000).toISOString(),expires_at:new Date(now+3600000).toISOString()});

test('dedicated provider profile has explicit replication off and a finite UTC lifetime at most24h',()=>{
  assertRebindExecutorProviderProfile(provider(),executor,{now,requiredThrough:now+300000});
  for(const patch of [{with_replication:true},{with_replication:undefined},{created_at:null},{expires_at:null},
    {created_at:'2026-02-30T10:00:00Z'},{expires_at:'2026-11-15T11:00:00+00:00'},
    {created_at:new Date(now+1).toISOString()},
    {expires_at:new Date(now+86400000).toISOString()}])
    assert.throws(()=>assertRebindExecutorProviderProfile({...provider(),...patch},executor,{now}));
  assert.throws(()=>assertRebindExecutorProviderProfile(provider(),executor,{now,requiredThrough:now+3600000}),/expires_before_cleanup/);
  assert.throws(()=>assertRebindExecutorProviderProfile({...provider(),created_at:'2026-11-15T09:59:00.000001Z',
    expires_at:'2026-11-16T09:59:00.000002Z'},executor,{now}),/lifetime_unverified/);
  assertRebindExecutorProviderProfile({...provider(),created_at:undefined,expires_at:null,with_replication:true},
    {...executor,mode:'existing_owner_connection'},{now});
});

test('separate mode retains the identical SQL NoReplication and owner/isolation admission checks',async()=>{
  const client=new PolicyClient();await assertRebindExecutorSession(client,{...executor,originFingerprint:'d'.repeat(64)},roles);
  for(const patch of [{login_valid:false,replication_enabled:true},{may_set_owner:false},{apps_isolated:false}]) {
    const client=new PolicyClient();client.sessionOverride=patch;
    await assert.rejects(assertRebindExecutorSession(client,executor,roles),/owner_authority_unverified/);
  }
});

test('workflow selection is restricted to rebind and preserves ordinary credentials, probe and later release gates',()=>{
  const wf=YAML.parse(fs.readFileSync('.github/workflows/planetscale-cutover-identity-preflight.yml','utf8'));
  assert.equal(wf.on.workflow_dispatch.inputs.rebind_connection.default,'existing');
  for(const job of [wf.jobs.inspect,wf.jobs.install_target,wf.jobs.restore_inventory])
    assert.equal(job.steps[0].run,'test "${ADMIN_REBIND_CONNECTION:-existing}" = existing');
  assert.ok(wf.jobs.migration_role.steps.find(step=>step.name==='Require first-attempt owner and exact protected main').run
    .includes('test "${ADMIN_REBIND_CONNECTION:-existing}" = existing'));
  const migrations=YAML.parse(fs.readFileSync('.github/workflows/planetscale-production-migrations.yml','utf8'));
  const resolve=migrations.jobs.migrate.steps.find(step=>step.name==='Resolve protected migration database credential');
  assert.ok(resolve.run.indexOf('resolve-admin-subject-rebind-connection.mjs')<resolve.run.indexOf('if [[ -n "${STATIC_ADMIN_DATABASE_URL:-}" ]]'));
  const release=YAML.parse(fs.readFileSync('.github/workflows/production-release.yml','utf8'));
  assert.ok(Object.keys(release.on.workflow_dispatch.inputs).length<=10);
  for(const name of ['admin_rebind_preview','admin_rebind_execute','admin_rebind_cleanup']) {
    const job=release.jobs[name];assert.equal(job.environment,'production');
    const step=job.steps.find(step=>step.run?.includes('run-admin-subject-rebind-activation.mjs'));
    assert.equal(step.env.PLANETSCALE_ADMIN_REBIND_DATABASE_URL,'${{ secrets.PLANETSCALE_ADMIN_REBIND_DATABASE_URL }}');
  }
});
