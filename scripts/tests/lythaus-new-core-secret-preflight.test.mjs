import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import { SCHEMA_SHA, INPUTS, assertContext, verifyExistingGate,
  inspectSqlInput, inspectExistingSecrets } from '../ci/lythaus-new-core-secret-preflight.mjs';

const url = (role) => `postgresql://${role}.xwkb9quljkzd:synthetic-private-password@fixture.psdb.cloud/postgres?sslmode=verify-full`;
const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const ownerLogin = repository.split('/')[0];
function context() {
  return { GITHUB_ACTIONS:'true', GITHUB_EVENT_NAME:'workflow_dispatch', GITHUB_REPOSITORY:repository,
    GITHUB_REPOSITORY_ID:'1010752912', GITHUB_REF:'refs/heads/main', GITHUB_REF_PROTECTED:'true',
    GITHUB_RUN_ATTEMPT:'1', GITHUB_ACTOR:ownerLogin, GITHUB_ACTOR_ID:'211295889', GITHUB_TRIGGERING_ACTOR:ownerLogin,
    GITHUB_SHA:'a'.repeat(40), REQUESTED_CONTROL_SHA:'a'.repeat(40), REQUESTED_SCHEMA_SHA:SCHEMA_SHA,
    REQUESTED_TARGET:'lythaus/lythaus-new-core/main', CONFIRM_READ_ONLY:'true', GITHUB_RUN_ID:'12345', GH_TOKEN:'synthetic-private-token' };
}
function githubFixture() {
  const gate = { id:77, name:'production', can_admins_bypass:true,
    protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:211295889}}]}, {type:'branch_policy'}],
    deployment_branch_policy:{protected_branches:false,custom_branch_policies:true} };
  const policies = {total_count:1,branch_policies:[{name:'main',type:'branch'}]};
  const approvals = [{state:'approved',user:{id:211295889},environments:[{id:77}]}];
  const calls=[];
  return {gate,policies,approvals,calls,fetchImpl:async (address,init)=>{
    calls.push({address,method:init.method});
    return Response.json(address.includes('/approvals') ? approvals : address.includes('deployment-branch-policies') ? policies : gate);
  }};
}
function sqlFixture({ fail=false, readOnly=true, identityChange={} }={}) {
  const calls=[];
  let config;
  const client={ async connect(){ if(fail) throw new Error('provider echoed '+url('lythaus_migrations')); }, async end(){},
    async query(sql,params){ calls.push(sql); return {rows:sql.includes('FROM pg_roles') ? [{database_matches:true,role_matches:true,version_matches:true,
      read_only:readOnly,safe_role:true,login_valid:true,connect_allowed:true,create_allowed:params[0]==='lythaus_migrations',create_grant_option:false}] : [{absent:true}]}; } };
  const modules={
    branchQualifiedDatabaseTarget(raw){ return {branchId:'xwkb9quljkzd',sqlDatabaseName:'postgres',
      role:new URL(raw).username.split('.')[0],originFingerprint:'30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558',origin:{port:5432},...identityChange}; },
    adminDatabaseConnectionConfig(raw){ return {connectionString:raw,ssl:{rejectUnauthorized:true}}; },
    NEW_CORE_ROLE_LABELS:['lythaus_runtime','lythaus_admin','lythaus_jobs','lythaus_privacy','lythaus_migrations','lythaus_verifier'],
    NEW_CORE_SQL_CREATOR_SHA256:'a'.repeat(64),
    async assertSchemaOnlyBaseline(c){ await c.query('SELECT 1'); },
    async assertNewCoreEmptyCatalog(c){ await c.query('SELECT 1'); },
    async verifyNewCoreRoleMemberships(c){ await c.query('SELECT 1'); },
    planetScaleServiceTokenAuthorizationHeader(value){ if(!value?.includes(':')) throw new Error('invalid '+value); },
    async inspectNewCorePlanetScaleRoles(){ return {httpStatus:200,databaseMatch:true,branchMatch:true,inventoryMatches:true}; },
  };
  return {modules,calls,createClient(value){config=value;return client;},get config(){return config;}};
}

test('only first-attempt owner dispatch on exact protected main control source is accepted',()=>{
  assert.doesNotThrow(()=>assertContext(context()));
  for(const change of [{GITHUB_EVENT_NAME:'push'},{GITHUB_REF:'refs/heads/codex/new-core-provisioning'},
    {GITHUB_RUN_ATTEMPT:'2'},{GITHUB_ACTOR_ID:'99'},{REQUESTED_SCHEMA_SHA:'b'.repeat(40)},
    {REQUESTED_CONTROL_SHA:'b'.repeat(40)},{CONFIRM_READ_ONLY:'false'},{RUNNER_DEBUG:'1'}]) {
    assert.throws(()=>assertContext({...context(),...change}));
  }
});
test('existing owner self-review gate is verified with GET only and without changing settings',async()=>{
  const f=githubFixture();
  const result=await verifyExistingGate({env:context(),fetchImpl:f.fetchImpl,requireApproval:true});
  assert.equal(result.owner_approval_recorded,true);
  assert.equal(result.self_review_prevention_enabled,false);
  assert.equal(f.calls.length,3);
  assert.ok(f.calls.every(c=>c.method==='GET'));
});
test('changed self-review protection or missing recorded owner approval stops the route',async()=>{
  const f=githubFixture();f.gate.protection_rules[0].prevent_self_review=true;
  await assert.rejects(verifyExistingGate({env:context(),fetchImpl:f.fetchImpl}),/existing_gate_changed/);
  const missing=githubFixture();missing.approvals.length=0;
  await assert.rejects(verifyExistingGate({env:context(),fetchImpl:missing.fetchImpl,requireApproval:true}),/owner_review_not_recorded/);
});
test('a branch-policy change blocks without provider-secret inspection',async()=>{
  const f=githubFixture();f.policies.branch_policies[0].name='*';
  await assert.rejects(verifyExistingGate({env:context(),fetchImpl:f.fetchImpl}),/existing_branch_gate_changed/);
});
test('missing secrets are reported as inaccessible without credential recovery',async()=>{
  const f=sqlFixture();const result=await inspectExistingSecrets({env:{},...f});
  assert.equal(result.status,'READ_ONLY_PREFLIGHT_BLOCKED');
  assert.ok(INPUTS.every(name=>result.inputs[name].accessible===false));
  assert.equal(f.calls.length,0);
});
test('old branch, wrong origin and admin URLs are rejected before a connection',async()=>{
  for(const identityChange of [{branchId:'oldbranch'},{originFingerprint:'b'.repeat(64)},{role:'postgres'}]) {
    const f=sqlFixture({identityChange});
    const result=await inspectSqlInput(url('lythaus_migrations'),'lythaus_migrations',f.modules,f.createClient);
    assert.equal(result.target_valid,false);assert.equal(f.config,undefined);
  }
});
test('the migration login is forced read-only from connection startup and reads only catalog guards',async()=>{
  const f=sqlFixture();const result=await inspectSqlInput(url('lythaus_migrations'),'lythaus_migrations',f.modules,f.createClient);
  assert.ok(Object.values(result).every(v=>v===true));
  assert.match(f.config.options,/default_transaction_read_only=on/);
  assert.equal(f.config.ssl.rejectUnauthorized,true);
  assert.ok(f.calls.every(sql=>/^SELECT\b/.test(sql)));
});
test('the verifier uses its own login and a database without the migration ledger',async()=>{
  const f=sqlFixture();const result=await inspectSqlInput(url('lythaus_verifier'),'lythaus_verifier',f.modules,f.createClient);
  assert.ok(Object.values(result).every(v=>v===true));
  assert.ok(f.calls.some(sql=>sql.includes('schema_migrations')));
});
test('failure to enforce read-only mode prevents baseline queries',async()=>{
  const f=sqlFixture({readOnly:false});const result=await inspectSqlInput(url('lythaus_migrations'),'lythaus_migrations',f.modules,f.createClient);
  assert.equal(result.read_only_enforced,false);assert.equal(result.baseline_valid,false);assert.equal(f.calls.length,1);
});
test('driver failures containing raw URLs and passwords produce fixed booleans only',async()=>{
  const f=sqlFixture({fail:true});const result=await inspectSqlInput(url('lythaus_migrations'),'lythaus_migrations',f.modules,f.createClient);
  assert.equal(result.authentication_valid,false);
  const serialized=JSON.stringify(result);assert.ok(Object.values(result).every(v=>typeof v==='boolean'));
  assert.doesNotMatch(serialized,/synthetic|fixture\.psdb|postgresql:|password|provider echoed/);
});
test('a successful combined report contains no input values or SQL identities',async()=>{
  const f=sqlFixture();const env={ [INPUTS[0]]:url('lythaus_migrations'),[INPUTS[1]]:url('lythaus_verifier'),[INPUTS[2]]:'synthetic-id:synthetic-value'};
  const result=await inspectExistingSecrets({env,...f});
  assert.equal(result.status,'READ_ONLY_PREFLIGHT_PASS');
  const serialized=JSON.stringify(result);for(const secret of Object.values(env)) assert.equal(serialized.includes(secret),false);
  assert.doesNotMatch(serialized,/psdb\.cloud|synthetic-private-password|synthetic-value/);
});
test('workflow is dispatch-only, gated, limited to read permissions and injects only the three named inputs',()=>{
  const text=fs.readFileSync('.github/workflows/lythaus-new-core-secret-preflight.yml','utf8');
  const workflow=YAML.parse(text);
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
  assert.deepEqual(workflow.permissions,{contents:'read',actions:'read'});
  assert.equal(workflow.jobs['inspect-existing-inputs'].needs,'verify-gate');
  assert.equal(workflow.jobs['inspect-existing-inputs'].environment.name,'production');
  const refs=[...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m=>m[1]);assert.deepEqual(refs,[...INPUTS]);
  assert.doesNotMatch(text,/--apply-live|--provision|upload-artifact|secrets: inherit|environment_writer|PROVISIONER_DATABASE_URL/i);
});
