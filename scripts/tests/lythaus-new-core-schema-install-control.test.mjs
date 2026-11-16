import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import { PINS, CONTROL_PATHS, verifyDispatch, verifyRegistrationDiff, verifyExecutionDiff,
  parsePreflightReceipt, verifyPinnedReceipt, verifyInstallControl } from '../ci/lythaus-new-core-schema-install-control.mjs';

const mainSha = 'd'.repeat(40);
const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
function context() {
  return { GITHUB_ACTIONS:'true', GITHUB_EVENT_NAME:'workflow_dispatch', GITHUB_REPOSITORY:repository,
    GITHUB_REPOSITORY_ID:'1010752912', GITHUB_REF:'refs/heads/main', GITHUB_REF_PROTECTED:'true',
    GITHUB_RUN_ATTEMPT:'1', GITHUB_ACTOR_ID:String(PINS.ownerId), GITHUB_ACTOR:'owner', GITHUB_TRIGGERING_ACTOR:'owner',
    GITHUB_SHA:mainSha, REQUESTED_CONTROL_SHA:mainSha, REQUESTED_SCHEMA_SHA:PINS.schemaSha,
    REQUESTED_EXECUTION_SHA:PINS.executionSha, PREFLIGHT_RUN_ID:PINS.receiptRunId,
    REQUESTED_TARGET:PINS.target, CONFIRM_SCHEMA_ONLY:'true', GITHUB_RUN_ID:'98765' };
}
function receipt() {
  const sql = { accessible:true,format_valid:true,target_valid:true,authentication_valid:true,
    read_only_enforced:true,scoped_role_valid:true,baseline_valid:true };
  return { status:'READ_ONLY_PREFLIGHT_PASS',schema_candidate:PINS.schemaSha, inputs:{
    LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL:{...sql}, LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL:{...sql},
    PLANETSCALE_API_TOKEN:{accessible:true,format_valid:true,metadata_authorized:true,target_valid:true,managed_role_inventory_valid:true}},
    owner_review_verified:true,approved_schema_main_baseline_unchanged:false,schema_write_authorized_by_preflight:false };
}
function fixture() {
  const approval = [{state:'approved',user:{id:PINS.ownerId},environments:[{id:PINS.environmentId}]}];
  const responses = new Map([
    ['branches/main',{protected:true,commit:{sha:mainSha}}],
    ['environments/production',{id:PINS.environmentId,name:'production',protection_rules:[
      {type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:PINS.ownerId}}]},
      {type:'branch_policy'}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}}],
    ['environments/production/deployment-branch-policies?per_page=100',{total_count:1,branch_policies:[{name:'main',type:'branch'}]}],
    [`actions/runs/${PINS.receiptRunId}`,{id:Number(PINS.receiptRunId),repository:{id:1010752912},workflow_id:PINS.receiptWorkflowId,
      head_branch:'main',head_sha:PINS.receiptMainSha,path:'.github/workflows/lythaus-new-core-secret-preflight.yml',
      event:'workflow_dispatch',run_attempt:1,actor:{id:PINS.ownerId},triggering_actor:{id:PINS.ownerId},status:'completed',conclusion:'success'}],
    [`actions/runs/${PINS.receiptRunId}/approvals`,approval],
    [`actions/runs/${PINS.receiptRunId}/jobs?per_page=100`,{total_count:2,jobs:[{id:1,conclusion:'success'},
      {id:PINS.receiptJobId,name:'Owner-reviewed read-only inspection of existing inputs',conclusion:'success'}]}],
    [`compare/${PINS.receiptMainSha}...${mainSha}`,{status:'ahead',merge_base_commit:{sha:PINS.receiptMainSha},files:CONTROL_PATHS.map(filename=>({filename,status:filename.endsWith('ci.yml')?'modified':'added'}))}],
    [`commits/${PINS.schemaSha}`,{sha:PINS.schemaSha}], [`commits/${PINS.executionSha}`,{sha:PINS.executionSha}],
    [`compare/${PINS.schemaSha}...${PINS.executionSha}`,{status:'ahead',merge_base_commit:{sha:PINS.schemaSha},files:[
      'scripts/ci/lythaus-new-core-clean-install.mjs','scripts/tests/lythaus-new-core-clean-install.test.mjs',
      'infrastructure/planetscale/lythaus-new-core-clean-install.target.json','docs/runbooks/lythaus-new-core-schema-actions-handoff.md'].map(filename=>({filename,status:'modified'}))}],
    ['actions/runs/98765/approvals',approval],
  ]);
  const calls=[];
  let log='2026-11-16T22:00:00Z '+JSON.stringify(receipt());
  return { responses,calls,get:async key=>{calls.push(key);if(!responses.has(key))throw new Error('unexpected_endpoint');return responses.get(key);},
    readJobLog:async id=>{calls.push('job-log:'+id);return log;},setLog:value=>{log=value;} };
}

test('only the exact source, target, receipt and first-attempt protected-main owner dispatch are accepted',()=>{
  assert.doesNotThrow(()=>verifyDispatch(context()));
  for(const delta of [{CONFIRM_SCHEMA_ONLY:'false'},{REQUESTED_SCHEMA_SHA:'a'.repeat(40)},
    {REQUESTED_EXECUTION_SHA:'a'.repeat(40)},{GITHUB_REF:'refs/heads/another'},
    {GITHUB_EVENT_NAME:'push'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_ACTOR_ID:'1'},
    {PREFLIGHT_RUN_ID:'43951305902'},{RUNNER_DEBUG:'1'}]) assert.throws(()=>verifyDispatch({...context(),...delta}));
});
test('the passed receipt is reusable across only reviewed install-control additions',async()=>{
  const f=fixture();const result=await verifyInstallControl({env:context(),get:f.get,readJobLog:f.readJobLog});
  assert.equal(result.preflightReceiptReused,true);
  assert.equal(result.protectedMainSha,mainSha);
  assert.equal(result.sqlExecuted,false);
  assert.equal(result.providerSecretsAccessed,false);
  assert.equal(result.ownerInstallApprovalVerified,false);
  assert.ok(f.calls.every(path=>!path.includes('/secrets')&&!path.includes('planetscale')));
});
test('changed preflight code, application files or a different comparison base stop receipt reuse',()=>{
  for(const file of ['scripts/ci/lythaus-new-core-secret-preflight.mjs','apps/lythaus-admin-api/src/index.ts',
    'database/planetscale/migrations/0001_extensions_and_schemas.sql']) {
    assert.throws(()=>verifyRegistrationDiff({status:'ahead',merge_base_commit:{sha:PINS.receiptMainSha},files:[
      {filename:CONTROL_PATHS[1]},{filename:file}]}),/control_code_changed/);
  }
  assert.throws(()=>verifyRegistrationDiff({status:'ahead',merge_base_commit:{sha:mainSha},files:[{filename:CONTROL_PATHS[1]}]}));
});
test('SQL payload changes are never classified as execution-admission changes',()=>{
  const f=fixture();const diff=f.responses.get(`compare/${PINS.schemaSha}...${PINS.executionSha}`);
  diff.files[0].filename='database/planetscale/grants/roles.sql';
  assert.throws(()=>verifyExecutionDiff(diff),/execution_payload_changed/);
});
test('only a completely passing, fixed-schema, owner-reviewed boolean receipt is accepted',()=>{
  assert.equal(parsePreflightReceipt(JSON.stringify(receipt())).receiptVerified,true);
  for(const mutate of [r=>{r.schema_candidate=mainSha;},r=>{r.owner_review_verified=false;},
    r=>{r.inputs.LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL.authentication_valid=false;},
    r=>{r.inputs.PLANETSCALE_API_TOKEN.target_valid=false;},r=>{r.schema_write_authorized_by_preflight=true;}]) {
    const r=receipt();mutate(r);assert.throws(()=>parsePreflightReceipt(JSON.stringify(r)));
  }
  assert.throws(()=>parsePreflightReceipt('no report'));
});
test('the reviewed sanitized receipt is hash-bound and contains no credential material',()=>{
  const record=JSON.parse(fs.readFileSync('infrastructure/planetscale/lythaus-new-core-preflight-43951305901.receipt.json','utf8'));
  assert.equal(verifyPinnedReceipt(record).receiptVerified,true);
  record.target='lythaus/lythaus-core/main';
  assert.throws(()=>verifyPinnedReceipt(record),/pinned_receipt_changed/);
});
test('mismatched main, wrong run source, rerun receipts and failed jobs stop before provider use',async()=>{
  for(const mutate of [f=>{f.responses.get('branches/main').commit.sha=PINS.receiptMainSha;},
    f=>{f.responses.get(`actions/runs/${PINS.receiptRunId}`).head_sha=mainSha;},
    f=>{f.responses.get(`actions/runs/${PINS.receiptRunId}`).run_attempt=2;},
    f=>{f.responses.get(`actions/runs/${PINS.receiptRunId}/jobs?per_page=100`).jobs[1].conclusion='failure';}]) {
    const f=fixture();mutate(f);await assert.rejects(verifyInstallControl({env:context(),get:f.get,readJobLog:f.readJobLog}));
  }
});
test('existing review settings cannot be weakened or silently rebound to a recreated environment',async()=>{
  for(const change of [{id:999},{protection_rules:[]},
    {deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}}]) {
    const f=fixture();Object.assign(f.responses.get('environments/production'),change);
    await assert.rejects(verifyInstallControl({env:context(),get:f.get,readJobLog:f.readJobLog}),/environment_changed/);
  }
});
test('the install step requires its own recorded owner approval in addition to the older preflight review',async()=>{
  const f=fixture();f.responses.set('actions/runs/98765/approvals',[]);
  await assert.rejects(verifyInstallControl({env:context(),get:f.get,readJobLog:f.readJobLog,requireInstallApproval:true}),/owner_approval_missing/);
  const g=fixture();assert.equal((await verifyInstallControl({env:context(),get:g.get,readJobLog:g.readJobLog,requireInstallApproval:true})).ownerInstallApprovalVerified,true);
});
test('workflow is dispatch-only with false execution default, exact source pins and only existing three secrets',()=>{
  const text=fs.readFileSync('.github/workflows/lythaus-new-core-schema-install.yml','utf8');
  const w=YAML.parse(text);
  assert.deepEqual(Object.keys(w.on),['workflow_dispatch']);
  assert.equal(w.on.workflow_dispatch.inputs.confirm_schema_only.default,false);
  assert.equal(w.on.workflow_dispatch.inputs.preflight_run_id.default,PINS.receiptRunId);
  assert.equal(w.on.workflow_dispatch.inputs.execution_sha.default,PINS.executionSha);
  assert.deepEqual(w.permissions,{contents:'read',actions:'read'});
  assert.equal(w.jobs['install-schema-only'].needs,'verify-control');
  assert.equal(w.jobs['install-schema-only'].environment.name,'production');
  const inputs=[...text.matchAll(/secrets\.([A-Z_]+)/g)].map(match=>match[1]);
  assert.deepEqual(inputs,['LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL','LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL','PLANETSCALE_API_TOKEN']);
  assert.doesNotMatch(text,/secrets: inherit|PROVISIONER_DATABASE_URL|ADMIN_DATABASE_URL|--admin|wrangler|pscale|upload-artifact/);
});
