import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { mock } from 'node:test';
import YAML from 'yaml';
import {loadApprovedMigrations} from '../ci/planetscale-migration-manifest.mjs';
import {rebindGrantPayload,REBIND_BOUNDARY_SQL,REBIND_SOURCE_STATE_SQL} from '../ci/admin-subject-rebind-capability.mjs';

test('destructive synthetic rebind fixture is isolated from broad application test discovery',()=>{
  const filename='admin-subject-rebind.pg17.mjs';
  assert.ok(fs.existsSync(`apps/lythaus-admin-api/tests/${filename}`));
  assert.equal(fs.existsSync('apps/lythaus-admin-api/tests/admin-subject-rebind.postgres.mjs'),false);
  assert.doesNotMatch(filename,/\.(postgres|test)\.mjs$/);
  const ci=YAML.parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));
  const registrations=Object.values(ci.jobs).flatMap(job=>job.steps??[]).filter(step=>step.run?.includes(filename));
  assert.equal(registrations.length,1);
  assert.equal(registrations[0].env.LYTHAUS_LOCAL_REBIND_PROPOSAL_TEST,'synthetic');
  const target=new URL(registrations[0].env.PLANETSCALE_PG17_TEST_DATABASE_URL);
  assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/postgres');
  const baseline=registrations[0].run.indexOf('npm run validate:planetscale-postgres17');
  assert.ok(baseline>=0&&baseline<registrations[0].run.indexOf(filename));
});

test('opt-in installation CLI installs the fixed disabled objects and reads back without ordinary migrations or grants',async()=>{
  const {roles,executor,payload,PolicyClient}=await import('./admin-subject-rebind-fixtures.mjs');
  const implementation=await import('../ci/admin-subject-rebind-executor.mjs');
  const {branchQualifiedDatabaseTarget}=await import('../ci/planetscale-0021-target-identity.mjs');
  const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
  const manifest=loadApprovedMigrations(),state=new PolicyClient({installed:false}),calls=[];let connections=0,providerChecks=0;
  const raw='postgresql://pscale_api_executor.vqa2g2xc9wsl:synthetic@fixture.psdb.cloud/postgres?sslmode=verify-full';
  const origin=branchQualifiedDatabaseTarget(raw).originFingerprint,binding={...executor,originFingerprint:origin};
  class Client {
    constructor(){this.connectionParameters={replication:undefined};}
    async connect(){connections++;}
    async end(){}
    async query(sql,args){
      calls.push(sql);
      if(sql==='SELECT current_database() AS database_name, current_user AS current_role, session_user AS session_role')
        return {rowCount:1,rows:[{database_name:'postgres',current_role:'pscale_api_executor',session_role:'pscale_api_executor'}]};
      if(sql.includes("to_regclass('system.schema_migrations')"))return {rows:[{registry:'system.schema_migrations'}],rowCount:1};
      if(sql.startsWith('SELECT version, checksum'))return {rows:manifest.migrations.map(m=>({version:m.name,checksum:m.checksum}))};
      if(sql.includes('AS runtime_insert_hmac'))return {rows:[{runtime_insert_hmac:true,runtime_select:false,
        admin_select_ciphertext:true,admin_select_hmac:false,admin_update_status:true,admin_update_ciphertext:false,
        privacy_delete:true,privacy_select_purge:true,privacy_select_ciphertext:false}]};
      if(sql.includes('AS rate_limit_select'))return {rows:[{system_usage:true,rate_limit_select:true,rate_limit_insert:true,rate_limit_update:true}]};
      return state.query(sql,args);
    }
  }
  mock.module('pg',{defaultExport:{Client}});
  mock.module('../ci/planetscale-media-quarantine-migration.mjs',{namedExports:{
    verifyMediaQuarantineMigration:async()=>{},inspectMediaQuarantineMigration:async()=>{throw new Error('unexpected_schema_inspection');},
    applyMediaQuarantineMigration:async()=>{throw new Error('unexpected_schema_migration');},
  }});
  mock.module('../ci/admin-subject-rebind-executor.mjs',{namedExports:{...implementation,
    assertRebindExecutorTarget:(value,map,_manifestOrigin,approved)=>implementation.assertRebindExecutorTarget(value,map,origin,approved),
    assertRebindMetadataVerifierTarget:(value,_manifestOrigin)=>implementation.assertRebindMetadataVerifierTarget(value,origin),
    verifyRebindExecutorProvider:async(environment,approved)=>{
      providerChecks++;assert.equal(approved.roleFingerprint,binding.roleFingerprint);
      assert.equal(environment.PLANETSCALE_ADMIN_DATABASE_URL,raw);return {executorVerified:true};
    },
  }});
  const now=Date.now(),env={CI:'false',GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_REF:'refs/heads/main',
    REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),RELEASE_SHA:'a'.repeat(40),
    GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`,
    GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true',
    PSCALE_BRANCH_NAME:'main',PSCALE_ROLE_IDENTIFIERS:JSON.stringify(roles),PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED:'approved',
    PLANETSCALE_MIGRATION_USAGE_APPROVED:'approved',PLANETSCALE_MIGRATION_USAGE_MAX_USD:'0',PLANETSCALE_ADMIN_DATABASE_URL:raw,
    PLANETSCALE_VERIFIER_DATABASE_URL:raw.replace('pscale_api_executor.','pscale_api_qodocjs6vgrb.'),
    ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify({schemaVersion:'lythaus-admin-subject-rebind-install-v2',
      scope:'install_disabled_capability_only',executor:binding,releaseSha:'a'.repeat(40),grantSha256:payload.sha256,roleGrantsSha256:payload.roleGrantsSha256,
      metadataVerifierPermission:'disabled_restore_state_only',
      operator:repository.split('/')[0],approvalReference:'synthetic-specific-approval',approvedAt:new Date(now-1000).toISOString(),
      expiresAt:new Date(now+60000).toISOString()})};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  try {
    Object.assign(process.env,env);await import('../ci/apply-planetscale-production-migrations.mjs');
    assert.equal(providerChecks,1);assert.equal(connections,2,'one write connection and one read-only reconciliation');
    assert.equal(state.installed,true);assert.equal(state.policy,'DISABLED');assert.equal(state.revision,0);
    const writes=calls.filter(sql=>/\b(CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(sql)&&!/^\s*SELECT\b/.test(sql));
    assert.equal(writes.filter(sql=>sql.includes('CREATE TABLE admin_recovery.subject_rebind_control (')).length,1);
    assert.ok(writes.every(sql=>sql.includes('CREATE TABLE admin_recovery.subject_rebind_control (')
      ||sql.startsWith('INSERT INTO admin_recovery.subject_rebind_control')));
    assert.equal(calls.filter(sql=>sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,1);
    assert.equal(state.alters,0);
  } finally {for(const key of Object.keys(env)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
