import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import { inspectProductionRoles } from '../ci/new-core-production-role-check.mjs';
import { TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';
import { branchQualifiedDatabaseTarget } from '../ci/planetscale-0021-target-identity.mjs';
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
test('both inspection modes are dispatch-only and isolate their three secret inputs',()=>{
  const text=fs.readFileSync('.github/workflows/lythaus-new-core-secret-preflight.yml','utf8');
  const workflow=YAML.parse(text);
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
  assert.deepEqual(workflow.permissions,{contents:'read',actions:'read'});
  assert.equal(workflow.jobs['inspect-existing-inputs'].needs,'verify-gate');
  assert.equal(workflow.jobs['inspect-existing-inputs'].environment.name,'production');
  const refs = job => [...JSON.stringify(job).matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]);
  const legacy = workflow.jobs['inspect-existing-inputs'];
  const production = workflow.jobs['inspect-production-roles'];
  assert.deepEqual(refs(legacy), [...INPUTS]);
  assert.equal(legacy.if, "inputs.inspection != 'installed-production-roles'");
  assert.equal(production.if, "inputs.inspection == 'installed-production-roles'");
  assert.equal(production.needs, 'verify-gate');
  assert.equal(production.environment, 'production');
  assert.match(production.steps.at(-2).run, /requireApproval: true/);
  assert.deepEqual(refs(production), ['PRIVACY', 'RUNTIME', 'JOBS'].map(name => 'LYTHAUS_NEW_CORE_' + name + '_DATABASE_URL'));
  assert.doesNotMatch(text,/--apply-live|--provision|upload-artifact|secrets: inherit|environment_writer|PROVISIONER_DATABASE_URL/i);
});

function productionFixture({ changeRow = {}, connectError = false, receipt = true, wrongPeer = false } = {}) {
  const inputs = Object.fromEntries(['PRIVACY', 'RUNTIME', 'JOBS'].map(name =>
    ['LYTHAUS_NEW_CORE_' + name + '_DATABASE_URL', url('lythaus_' + name.toLowerCase())]));
  const calls = [];
  const clients = [];
  const deps = {
    parseTarget(raw) { return { ...branchQualifiedDatabaseTarget(raw), originFingerprint: TARGET.origin }; },
    createClient(config) {
      clients.push(config);
      return {
        connection: { stream: {} }, on() {}, async end() {},
        async connect() { if (connectError) throw new Error('driver echoed ' + config.connectionString); },
        async query(sql, args) {
          calls.push(sql);
          if (args) return { rows: [{ identity_matches: true, read_only: true, roles_restricted: true,
            ddl_restricted: true, sensitive_grants_match: true, ...changeRow }] };
          return { rows: [], rowCount: 0 };
        },
      };
    },
    verifyPeer() { if (wrongPeer) throw new Error('private TLS metadata'); },
    async matchesReceipt() { return receipt; },
  };
  return { inputs, calls, clients, deps };
}

test('post-install validation checks each exact session and performs one zero-row application read per role', async () => {
  const f = productionFixture();
  const result = await inspectProductionRoles(f.inputs, f.deps);
  assert.equal(result.passed, true);
  assert.equal(f.clients.length, 3);
  for (const config of f.clients) {
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.match(config.options, /default_transaction_read_only=on/);
  }
  assert.deepEqual(f.calls.filter(sql => sql.endsWith('LIMIT 0')), [
    'SELECT id, active FROM privacy.legal_holds LIMIT 0', 'SELECT id, expires_at FROM identity.auth_sessions LIMIT 0',
    'SELECT id, dispatched_at FROM system.outbox_events LIMIT 0',
  ]);
});

test('a missing password or mismatch of role, origin, branch or TLS mode stops before authentication', async () => {
  for (const replace of [raw => raw.replace('lythaus_privacy.', 'lythaus_admin.'), raw => raw.replace(TARGET.branch, 'oldbranch'),
    raw => raw.replace('verify-full', 'disable'), raw => raw.replace(':synthetic-private-password', '')]) {
    const f = productionFixture();
    const result = await inspectProductionRoles({ LYTHAUS_NEW_CORE_PRIVACY_DATABASE_URL: replace(f.inputs.LYTHAUS_NEW_CORE_PRIVACY_DATABASE_URL) }, f.deps);
    assert.equal(result.passed, false);
    assert.equal(f.clients.length, 0);
  }
  const f = productionFixture();
  await inspectProductionRoles(f.inputs, { ...f.deps, parseTarget: branchQualifiedDatabaseTarget });
  assert.equal(f.clients.length, 0);
});

test('peer failure, session drift, excessive privileges or changed receipt prevent application probes', async () => {
  for (const change of [{ wrongPeer: true }, { receipt: false },
    ...['identity_matches', 'roles_restricted', 'ddl_restricted', 'read_only', 'sensitive_grants_match'].map(key => ({ changeRow: { [key]: false } }))]) {
    const f = productionFixture(change);
    const result = await inspectProductionRoles(f.inputs, f.deps);
    assert.equal(result.passed, false);
    assert.ok(!f.calls.some(sql => sql.endsWith('LIMIT 0')));
  }
});

test('driver errors on the three production roles produce sanitized booleans only', async () => {
  const f = productionFixture({ connectError: true });
  const result = await inspectProductionRoles(f.inputs, f.deps);
  assert.equal(result.passed, false);
  assert.ok(Object.values(result.inputs).every(report => Object.values(report).every(v => typeof v === 'boolean')));
  assert.doesNotMatch(JSON.stringify(result), /fixture|synthetic|postgresql:|driver echoed/);
});
