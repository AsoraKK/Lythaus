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

test('opt-in installation CLI executes only the reviewed capability and preserves unrelated grants',async()=>{
  const repository=new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1,-1);
  const payload=rebindGrantPayload(),calls=[],now=Date.now();let installed=false;
  const roles=Object.fromEntries(['runtime','admin','jobs','privacy','migrations'].map(label=>['lythaus_'+label,'pscale_api_test'+label]));
  const manifest=loadApprovedMigrations();
  const row={body:payload.sql.match(/AS \$\$([\s\S]*?)\$\$;/)[1],security_definer:true,owner:'postgres',
    language_matches:true,return_matches:true,behavior_matches:true,arguments_match:true,
    settings:['search_path=pg_catalog','lythaus.admin_subject_rebind_approval=DISABLED'],admin_execute:true,
    runtime_execute:false,jobs_execute:false,privacy_execute:false,admin_direct_update:false,admin_acts_as_owner:false,
    unexpected_role_reach:false,unexpected_execute:false};
  class Client {
    async connect(){}
    async end(){}
    async query(sql){
      calls.push(sql);
      if(sql.startsWith('SELECT current_database() AS database_name'))return {rowCount:1,rows:[{
        database_name:'postgres',current_role:roles.lythaus_migrations,session_role:roles.lythaus_migrations,
      }]};
      if(sql.includes(' AS owner_context_available'))return {rowCount:1,rows:[{owner_context_available:true}]};
      if(sql.includes(' AS policy_setting_available'))return {rowCount:1,rows:[{policy_setting_available:true}]};
      if(sql.includes("to_regclass('system.schema_migrations')"))return {rows:[{registry:'system.schema_migrations'}],rowCount:1};
      if(sql.startsWith('SELECT version, checksum'))return {rows:manifest.migrations.map(m=>({version:m.name,checksum:m.checksum}))};
      if(sql===REBIND_SOURCE_STATE_SQL)return {rowCount:1,rows:[{one_membership:true,bootstrap_closed:true,one_bootstrap:true,original_administrator:true}]};
      if(sql===REBIND_BOUNDARY_SQL)return {rowCount:installed?1:0,rows:installed?[row]:[]};
      if(sql.includes('CREATE FUNCTION identity.rebind_control_plane_administrator(')){installed=true;return {rows:[]};}
      if(sql.includes('AS runtime_insert_hmac'))return {rows:[{runtime_insert_hmac:true,runtime_select:false,
        admin_select_ciphertext:true,admin_select_hmac:false,admin_update_status:true,admin_update_ciphertext:false,
        privacy_delete:true,privacy_select_purge:true,privacy_select_ciphertext:false}]};
      if(sql.includes('AS rate_limit_select'))return {rows:[{system_usage:true,rate_limit_select:true,rate_limit_insert:true,rate_limit_update:true}]};
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SET LOCAL ')||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
      throw new Error('unexpected_sql_in_capability_only_scope');
    }
  }
  mock.module('pg',{defaultExport:{Client}});
  mock.module('../ci/planetscale-media-quarantine-migration.mjs',{namedExports:{
    verifyMediaQuarantineMigration:async()=>{},inspectMediaQuarantineMigration:async()=>{throw new Error('unexpected_schema_inspection');},
    applyMediaQuarantineMigration:async()=>{throw new Error('unexpected_schema_migration');},
  }});
  const expected=JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json','utf8'));
  mock.module('../ci/planetscale-0021-target-identity.mjs',{namedExports:{branchQualifiedDatabaseTarget:()=>({
    branchId:'vqa2g2xc9wsl',sqlDatabaseName:'postgres',originFingerprint:expected.expectedMainOriginFingerprint,role:roles.lythaus_migrations,
  })}});
  const env={CI:'false',GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'1010752912',GITHUB_REF:'refs/heads/main',
    REF_PROTECTED:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),RELEASE_SHA:'a'.repeat(40),
    GITHUB_WORKFLOW_REF:`${repository}/.github/workflows/planetscale-production-migrations.yml@refs/heads/main`,
    GITHUB_ACTOR:repository.split('/')[0],GITHUB_ACTOR_ID:'211295889',PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true',
    PSCALE_BRANCH_NAME:'main',PSCALE_ROLE_IDENTIFIERS:JSON.stringify(roles),PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED:'approved',
    PLANETSCALE_MIGRATION_USAGE_APPROVED:'approved',PLANETSCALE_MIGRATION_USAGE_MAX_USD:'0',
    PLANETSCALE_ADMIN_DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/postgres?sslmode=verify-full',
    ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON:JSON.stringify({schemaVersion:'lythaus-admin-subject-rebind-install-v1',
      scope:'install_disabled_capability_only',releaseSha:'a'.repeat(40),grantSha256:payload.sha256,roleGrantsSha256:payload.roleGrantsSha256,
      operator:repository.split('/')[0],approvalReference:'synthetic-specific-approval',approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()})};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  try{await import('../ci/apply-planetscale-production-migrations.mjs');}
  finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  assert.equal(installed,true);
  const payloads=calls.filter(sql=>/\b(?:CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/.test(sql)&&!sql.startsWith('SELECT'));
  assert.equal(payloads.length,1);
  assert.equal(payloads[0],payload.sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g,label=>`"${roles[label]}"`));
  assert.equal(calls.filter(sql=>sql==='COMMIT').length,1);
});
