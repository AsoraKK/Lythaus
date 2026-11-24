import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PINS, REPOSITORY as repository, verifyEnvironment, verifyOwnerReview } from './lythaus-new-core-schema-install-control.mjs';

const workflow = '.github/workflows/new-core-isolated-setup.yml';
export const credentialAttestation = 'The current protected Admin credential has stayed private.';
export const planAttestation = credentialAttestation + ' Existing plan covers the rehearsal and the sole live Admin Access selector is my intended identity.';
const receipts = [
  ['44045540354', '4f77e6f916e2d3504f207924b365dc31f8e07496', 'lythaus-new-core-schema-install.yml'],
  ['44114706197', '633eb910a5710be186bce319d75eb3bf620f04f5', 'lythaus-new-core-isolation-readonly.yml'],
  ['44177194818', '633eb910a5710be186bce319d75eb3bf620f04f5', 'cloudflare-admin-access-readonly.yml'],
];

function githubGet(path) {
  // Pass only the job's GitHub token to gh. All request paths are fixed here.
  const json = execFileSync('gh', ['api', '--method', 'GET', 'repos/' + repository + '/' + path], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: process.env.GH_TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 20000, maxBuffer: 512 * 1024,
  });
  return JSON.parse(json);
}

export async function authorizeSetup({ env = process.env, get = githubGet, afterReview = true } = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REF_PROTECTED !== 'true' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REPOSITORY_ID !== '1010752912'
    || env.GITHUB_WORKFLOW_REF !== repository + '/' + workflow + '@refs/heads/main'
    || env.GITHUB_ACTOR_ID !== String(PINS.ownerId) || env.GITHUB_ACTOR !== env.GITHUB_TRIGGERING_ACTOR
    || env.GITHUB_RUN_ATTEMPT !== '1' || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || env.REQUESTED_CONTROL_SHA !== env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !['inspect', 'setup', 'resume-access'].includes(env.REQUESTED_OPERATION)
    || env.NODE_OPTIONS || env.NODE_DEBUG || env.RUNNER_DEBUG === '1') throw new Error('setup_dispatch_changed');
  const main = await get('branches/main');
  if (!main.protected || main.commit.sha !== env.GITHUB_SHA) throw new Error('setup_main_changed');
  verifyEnvironment(await get('environments/production'),
    await get('environments/production/deployment-branch-policies?per_page=100'));
  for (const [id, sha, filename] of receipts) {
    const run = await get('actions/runs/' + id);
    if (run.repository?.id !== 1010752912 || String(run.id) !== id || run.head_sha !== sha
      || run.path !== '.github/workflows/' + filename || run.head_branch !== 'main'
      || run.run_attempt !== 1 || run.status !== 'completed' || run.conclusion !== 'success'
      || run.event !== 'workflow_dispatch') throw new Error('setup_prior_receipt_changed');
  }
  let attested = false;
  let privateCredentialConfirmed = false;
  if (afterReview) {
    const history = await get('actions/runs/' + env.GITHUB_RUN_ID + '/approvals');
    verifyOwnerReview(history);
    const ownerComments = history.filter(review => review.state === 'approved' && review.user?.id === PINS.ownerId
      && review.environments?.some(item => item.id === PINS.environmentId)).map(review => review.comment?.trim());
    attested = ownerComments.includes(planAttestation);
    privateCredentialConfirmed = attested || ownerComments.includes(credentialAttestation);
  }
  return { existingPlanConfirmedByOwner: attested, ownerSelectorConfirmedByOwner: attested, privateCredentialConfirmed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.argv[2];
  try {
    if (!['before-review', 'after-review'].includes(phase)) throw new Error('setup_phase_invalid');
    await authorizeSetup({ afterReview: phase === 'after-review' });
    console.log('Verified protected main, completed receipts and owner gate.');
  } catch {
    console.error('Setup stopped at the source, receipt or owner approval check.');
    process.exitCode = 1;
  }
}
