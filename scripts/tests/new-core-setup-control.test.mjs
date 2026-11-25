import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeSetup, credentialAttestation, planAttestation } from '../ci/new-core-setup-control.mjs';
import { verifyAnonymousTestGate } from '../ci/new-core-test-access-probe.mjs';

const sha = 'a'.repeat(40);
const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const env = {
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: '1010752912',
  GITHUB_WORKFLOW_REF: repository + '/.github/workflows/new-core-isolated-setup.yml@refs/heads/main',
  GITHUB_ACTOR_ID: '211295889', GITHUB_ACTOR: 'owner', GITHUB_TRIGGERING_ACTOR: 'owner',
  GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '765', GITHUB_SHA: sha,
  REQUESTED_OPERATION: 'setup', REQUESTED_CONTROL_SHA: sha, GITHUB_REF_PROTECTED: 'true',
};
const environmentId = 18972418184, owner = 211295889;
const approval = { state: 'approved', comment: planAttestation, user: { id: owner }, environments: [{ id: environmentId }] };
test('the UI and API independently redirect anonymous requests to the exact Access issuer', async () => {
  const team = 'https://fixture.cloudflareaccess.com';
  const visited = [];
  assert.equal(await verifyAnonymousTestGate(team, async (url, options) => {
    visited.push(new URL(url).pathname);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    return Response.redirect(team + '/cdn-cgi/access/login/test', 302);
  }), true);
  assert.deepEqual(visited, ['/flags', '/api/admin/moderation/cases']);
  await assert.rejects(verifyAnonymousTestGate(team, async () => new Response('shell')));
  await assert.rejects(verifyAnonymousTestGate(team, async () => Response.redirect('https://example.invalid/login')));
});
function sources(history) {
  const map = {
    'branches/main': { protected: true, commit: { sha } },
    'environments/production': { id: environmentId, name: 'production',
      protection_rules: [{ type: 'branch_policy' }, { type: 'required_reviewers', prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { id: owner } }] }],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } },
    'environments/production/deployment-branch-policies?per_page=100': { total_count: 1, branch_policies: [{ type: 'branch', name: 'main' }] },
    'actions/runs/765/approvals': history,
  };
  for (const [id, head_sha, name] of [
    [44045540354, '4f77e6f916e2d3504f207924b365dc31f8e07496', 'lythaus-new-core-schema-install'],
    [44114706197, '633eb910a5710be186bce319d75eb3bf620f04f5', 'lythaus-new-core-isolation-readonly'],
    [44177194818, '633eb910a5710be186bce319d75eb3bf620f04f5', 'cloudflare-admin-access-readonly'],
  ]) map['actions/runs/' + id] = { id, head_sha, path: '.github/workflows/' + name + '.yml', repository: { id: 1010752912 },
    head_branch: 'main', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', run_attempt: 1 };
  return map;
}
test('the specific owner approval can carry a private-dashboard coverage confirmation', async () => {
  for (const [history, expected] of [[[approval], true], [[{ ...approval, comment: '' }], false]]) {
    const map = sources(history);
    const result = await authorizeSetup({ env, get: path => map[path] });
    assert.equal(result.existingPlanConfirmedByOwner, expected);
    assert.equal(result.ownerSelectorConfirmedByOwner, expected);
    assert.equal(result.privateCredentialConfirmed, expected);
  }
  const map = sources([{...approval, comment:credentialAttestation}]);
  const result = await authorizeSetup({env,get:path=>map[path]});
  assert.equal(result.privateCredentialConfirmed,true);
  assert.equal(result.existingPlanConfirmedByOwner,false);
});
test('a missing review, actor mismatch, rerun, or stale main stops setup', async () => {
  for (const history of [[], [{ ...approval, user: { id: 1 } }], [{ ...approval, environments: [] }]]) {
    const map = sources(history);
    await assert.rejects(authorizeSetup({ env, get: path => map[path] }));
  }
  for (const patch of [{ GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_TRIGGERING_ACTOR: 'another' },
    { REQUESTED_CONTROL_SHA: 'b'.repeat(40) }, { REQUESTED_OPERATION: 'bootstrap' }]) {
    await assert.rejects(authorizeSetup({ env: { ...env, ...patch }, get: path => sources([approval])[path] }));
  }
  const map = sources([approval]);
  map['branches/main'].commit.sha = 'b'.repeat(40);
  await assert.rejects(authorizeSetup({ env, get: path => map[path] }));
});
test('resume is a fresh protected dispatch and requires the normal owner review', async () => {
  const resume = { ...env, REQUESTED_OPERATION:'resume-access' };
  const get = path => sources([approval])[path];
  assert.equal((await authorizeSetup({ env:resume, get })).ownerSelectorConfirmedByOwner,true);
  await assert.rejects(authorizeSetup({env:resume,get:path=>sources([])[path]}));
  await assert.rejects(authorizeSetup({env:{...resume,GITHUB_RUN_ATTEMPT:'2'},get}));
});
test('diagnosing the Admin read requires the exact successful serving receipt', async () => {
  const id = '45611431085', head = 'd4cf5bb1229383f736b0287101096482ca9a535e';
  const diagnostic = {...env, REQUESTED_OPERATION:'diagnose-admin-read', PRIOR_RUN:id};
  const run = {id:Number(id), head_sha:head, repository:{id:1010752912}, head_branch:'main', run_attempt:1,
    path:'.github/workflows/new-core-isolated-setup.yml', event:'workflow_dispatch', status:'completed', conclusion:'success',
    actor:{id:owner}, triggering_actor:{id:owner}, display_title:'resume-worker-script-settings admin-new-core-test.lythaus.co at '+head};
  const map = {...sources([approval]), ['actions/runs/'+id]:run, ['actions/runs/'+id+'/approvals']:[approval],
    ['compare/'+head+'...'+sha]:{merge_base_commit:{sha:head}}};
  assert.equal((await authorizeSetup({env:diagnostic, get:path=>map[path]})).priorRunSha, head);
  for (const prior of ['', '123']) await assert.rejects(authorizeSetup({env:{...diagnostic,PRIOR_RUN:prior},get:path=>map[path]}));
  run.conclusion = 'failure';
  await assert.rejects(authorizeSetup({env:diagnostic,get:path=>map[path]}), /serving_receipt_changed/);
});

test('Worker resume requires the exact prior read-only receipt and owner review', async () => {
  const id=45460021762, head_sha='9ea7d93145c7c297cc70c65f810071d37f67c049';
  const resume={...env,REQUESTED_OPERATION:'resume-worker-script-settings'};
  const receipt={id,head_sha,repository:{id:1010752912},head_branch:'main',run_attempt:1,
    path:'.github/workflows/new-core-isolated-setup.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',
    display_title:'inspect admin-new-core-test.lythaus.co at '+head_sha};
  const map=sources([approval]);
  const get=path=>path==='actions/runs/'+id ? receipt : map[path];
  assert.equal((await authorizeSetup({env:resume,get})).ownerSelectorConfirmedByOwner,true);
  const stage={...resume,REQUESTED_OPERATION:'stage-one-nonserving-version',PRIOR_RUN:'123'};
  const previous={...receipt,id:123,head_sha:sha,actor:{id:owner},triggering_actor:{id:owner},conclusion:'failure',
    display_title:'stage-one-nonserving-version admin-new-core-test.lythaus.co at '+sha};
  const priorGet=(path,run)=>path==='actions/runs/123' ? run : path==='actions/runs/123/approvals' ? [approval] : get(path);
  assert.equal((await authorizeSetup({env:stage,get:path=>priorGet(path,previous)})).priorRunSha,sha);
  for (const invalid of [{actor:{id:0}},{path:'somewhere'},{head_branch:'other'},{run_attempt:2},{status:'in_progress'}])
    await assert.rejects(authorizeSetup({env:stage,get:path=>priorGet(path,{...previous,...invalid})}),/setup_prior_lineage_run_unverified/);
  await assert.rejects(authorizeSetup({env:{...env,REQUESTED_OPERATION:'resume-worker'},get}),/setup_dispatch_changed/);
  for (const change of [{conclusion:'failure'},{display_title:'setup'},{head_sha:sha},{run_attempt:2}]) {
    await assert.rejects(authorizeSetup({env:resume,get:path=>path==='actions/runs/'+id ? {...receipt,...change} : map[path]}),
      /setup_prior_receipt_changed/);
  }
  map['actions/runs/765/approvals']=[];
  await assert.rejects(authorizeSetup({env:resume,get}));
});

test('repair approval requires the existing private credential and owner-selector attestation for this run',async()=>{
  const prior='45611431085',diagnostic='45628704670',app='b'.repeat(40);
  const scope={...env,REQUESTED_OPERATION:'stage-isolated-repair',PRIOR_RUN:prior};
  const repairPins={sourceSha:app,workerSha:'c'.repeat(64),assetsSha:'d'.repeat(64),workerBytes:123,assetBytes:345,assetCount:3};
  const map=sources([approval]);
  for(const [id,head,operation] of [[prior,'d4cf5bb1229383f736b0287101096482ca9a535e','resume-worker-script-settings'],
    [diagnostic,'a8f65d6ecbe107346598847a1c5c82b92a3ee9cd','diagnose-admin-read']]) {
    map['actions/runs/'+id]={id:Number(id),head_sha:head,repository:{id:1010752912},
      path:'.github/workflows/new-core-isolated-setup.yml',head_branch:'main',run_attempt:1,status:'completed',conclusion:'success',
      actor:{id:owner},triggering_actor:{id:owner},event:'workflow_dispatch',display_title:operation+' admin-new-core-test.lythaus.co at '+head};
    map['actions/runs/'+id+'/approvals']=[approval];
    map['compare/'+head+'...'+sha]={merge_base_commit:{sha:head}};
  }
  map['compare/'+app+'...'+sha]={merge_base_commit:{sha:app}};
  const get=path=>path.startsWith('actions/workflows/')?{total_count:1,workflow_runs:[{id:765}]}:map[path];
  assert.equal((await authorizeSetup({env:scope,get,repairPins})).existingPlanConfirmedByOwner,true);
  map['actions/runs/765/approvals']=[{...approval,comment:''}];
  await assert.rejects(authorizeSetup({env:scope,get,repairPins}),/repair_owner_attestation_missing/);
  assert.equal((await authorizeSetup({env:scope,get,afterReview:false,repairPins})).privateCredentialConfirmed,false);
});
