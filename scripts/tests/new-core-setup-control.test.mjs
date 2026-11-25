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
test('Worker resume requires the exact prior read-only receipt and owner review', async () => {
  const id=45460021762, head_sha='9ea7d93145c7c297cc70c65f810071d37f67c049';
  const resume={...env,REQUESTED_OPERATION:'resume-worker-script-settings'};
  const receipt={id,head_sha,repository:{id:1010752912},head_branch:'main',run_attempt:1,
    path:'.github/workflows/new-core-isolated-setup.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',
    display_title:'inspect admin-new-core-test.lythaus.co at '+head_sha};
  const map=sources([approval]);
  const get=path=>path==='actions/runs/'+id ? receipt : map[path];
  assert.equal((await authorizeSetup({env:resume,get})).ownerSelectorConfirmedByOwner,true);
  await assert.rejects(authorizeSetup({env:{...env,REQUESTED_OPERATION:'resume-worker'},get}),/setup_dispatch_changed/);
  for (const change of [{conclusion:'failure'},{display_title:'setup'},{head_sha:sha},{run_attempt:2}]) {
    await assert.rejects(authorizeSetup({env:resume,get:path=>path==='actions/runs/'+id ? {...receipt,...change} : map[path]}),
      /setup_prior_receipt_changed/);
  }
  map['actions/runs/765/approvals']=[];
  await assert.rejects(authorizeSetup({env:resume,get}));
});
