import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PINS, REPOSITORY as repository, verifyEnvironment, verifyOwnerReview } from './lythaus-new-core-schema-install-control.mjs';
import { isRepairOperation, predecessorRun, verifyRepairControl } from './new-core-repair-control.mjs';
import { REPAIR_PINS } from './new-core-isolated-repair-pins.mjs';

const workflow = '.github/workflows/new-core-isolated-setup.yml';
export const credentialAttestation = 'The current protected Admin credential has stayed private.';
export const planAttestation = credentialAttestation + ' Existing plan covers the rehearsal and the sole live Admin Access selector is my intended identity.';
const receipts = [
  ['44045540354', '4f77e6f916e2d3504f207924b365dc31f8e07496', 'lythaus-new-core-schema-install.yml'],
  ['44114706197', '633eb910a5710be186bce319d75eb3bf620f04f5', 'lythaus-new-core-isolation-readonly.yml'],
  ['44177194818', '633eb910a5710be186bce319d75eb3bf620f04f5', 'cloudflare-admin-access-readonly.yml'],
];
const workerReceipt = ['45460021762','9ea7d93145c7c297cc70c65f810071d37f67c049','new-core-isolated-setup.yml'];

function githubGet(path) {
  // Pass only the job's GitHub token to gh. All request paths are fixed here.
  const query = path.startsWith('actions/workflows/new-core-isolated-setup.yml/runs?')
    ? ['--jq','{total_count,workflow_runs:[.workflow_runs[]|{id,display_title,status,conclusion}]}']
    : path.startsWith('compare/') ? ['--jq','{merge_base_commit:{sha:.merge_base_commit.sha}}'] : [];
  const json = execFileSync('gh', ['api', '--method', 'GET', 'repos/' + repository + '/' + path,...query], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: process.env.GH_TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 20000, maxBuffer: 512 * 1024,
  });
  return JSON.parse(json);
}

export async function authorizeSetup({ env = process.env, get = githubGet, afterReview = true, repairPins = REPAIR_PINS, loadBaseline } = {}) {
  const repair = isRepairOperation(env.REQUESTED_OPERATION);
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REF_PROTECTED !== 'true' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REPOSITORY_ID !== '1010752912'
    || env.GITHUB_WORKFLOW_REF !== repository + '/' + workflow + '@refs/heads/main'
    || env.GITHUB_ACTOR_ID !== String(PINS.ownerId) || env.GITHUB_ACTOR !== env.GITHUB_TRIGGERING_ACTOR
    || env.GITHUB_RUN_ATTEMPT !== '1' || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || env.REQUESTED_CONTROL_SHA !== env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || (!repair && !['inspect', 'diagnose-admin-read', 'setup', 'resume-access', 'resume-worker-script-settings', 'stage-one-nonserving-version'].includes(env.REQUESTED_OPERATION))
    || (env.REQUESTED_OPERATION === 'diagnose-admin-read' && env.PRIOR_RUN !== '45611431085')
    || (env.PRIOR_RUN && (!/^[1-9]\d{0,18}$/.test(env.PRIOR_RUN) || env.PRIOR_RUN === env.GITHUB_RUN_ID ||
      (!repair && !['inspect','diagnose-admin-read','resume-worker-script-settings','stage-one-nonserving-version'].includes(env.REQUESTED_OPERATION))))
    || env.NODE_OPTIONS || env.NODE_DEBUG || env.RUNNER_DEBUG === '1') throw new Error('setup_dispatch_changed');
  const main = await get('branches/main');
  if (!main.protected || main.commit.sha !== env.GITHUB_SHA) throw new Error('setup_main_changed');
  verifyEnvironment(await get('environments/production'),
    await get('environments/production/deployment-branch-policies?per_page=100'));
  for (const [id, sha, filename] of ['resume-worker-script-settings','stage-one-nonserving-version'].includes(env.REQUESTED_OPERATION) ? [...receipts,workerReceipt] : receipts) {
    const run = await get('actions/runs/' + id);
    if (run.repository?.id !== 1010752912 || String(run.id) !== id || run.head_sha !== sha
      || run.path !== '.github/workflows/' + filename || run.head_branch !== 'main'
      || run.run_attempt !== 1 || run.status !== 'completed' || run.conclusion !== 'success'
      || run.event !== 'workflow_dispatch'
      || (id === workerReceipt[0] && run.display_title !== 'inspect admin-new-core-test.lythaus.co at ' + sha)) throw new Error('setup_prior_receipt_changed');
  }
  let attested = false;
  let privateCredentialConfirmed = false;
  let priorRunSha;
  let repairControl;
  const beforeRequestRuns = [];
  if (repair) {
    repairControl = await verifyRepairControl({env,get,pins:repairPins,loadBaseline,onVerifiedNoRequest:id=>beforeRequestRuns.push(id)});
  } else if (env.PRIOR_RUN) {
    const run = await get('actions/runs/'+env.PRIOR_RUN);
    const title = run.display_title;
    if (env.REQUESTED_OPERATION === 'diagnose-admin-read' &&
      (run.conclusion !== 'success' || run.head_sha !== 'd4cf5bb1229383f736b0287101096482ca9a535e'
        || title !== 'resume-worker-script-settings admin-new-core-test.lythaus.co at '+run.head_sha)) {
      throw new Error('setup_serving_receipt_changed');
    }
    if (String(run.id) !== env.PRIOR_RUN || run.repository?.id !== 1010752912 || run.path !== workflow ||
      run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.run_attempt !== 1 || run.status !== 'completed' ||
      run.actor?.id !== PINS.ownerId || run.triggering_actor?.id !== PINS.ownerId || !/^[a-f0-9]{40}$/.test(run.head_sha) ||
      !['setup','resume-access','resume-worker-script-settings','stage-one-nonserving-version'].some(op =>
        title === op+' admin-new-core-test.lythaus.co at '+run.head_sha)) throw new Error('setup_prior_lineage_run_unverified');
    if (run.head_sha !== env.GITHUB_SHA) {
      const compare = await get('compare/'+run.head_sha+'...'+env.GITHUB_SHA);
      if (compare.merge_base_commit?.sha !== run.head_sha) throw new Error('setup_prior_lineage_source_unverified');
    }
    verifyOwnerReview(await get('actions/runs/'+env.PRIOR_RUN+'/approvals'));
    priorRunSha = run.head_sha;
  }
  if (afterReview) {
    const history = await get('actions/runs/' + env.GITHUB_RUN_ID + '/approvals');
    verifyOwnerReview(history);
    const ownerComments = history.filter(review => review.state === 'approved' && review.user?.id === PINS.ownerId
      && review.environments?.some(item => item.id === PINS.environmentId)).map(review => review.comment?.trim());
    attested = ownerComments.includes(planAttestation);
    privateCredentialConfirmed = attested || ownerComments.includes(credentialAttestation);
    if (repair && !attested) throw new Error('setup_repair_owner_attestation_missing');
  }
  return { existingPlanConfirmedByOwner: attested, ownerSelectorConfirmedByOwner: attested, privateCredentialConfirmed,
    ...(priorRunSha ? {priorRunSha} : {}), ...repairControl,
    ...(beforeRequestRuns.length ? {beforeRequestRuns} : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.argv[2];
  try {
    if (!['before-review', 'after-review'].includes(phase)) throw new Error('setup_phase_invalid');
    const env = process.env;
    const gate = await authorizeSetup({ afterReview: phase === 'after-review' });
    if (phase === 'before-review' && isRepairOperation(env.REQUESTED_OPERATION)) {
      const {loadRepairReceipt} = await import('./new-core-repair-receipt.mjs');
      const state = loadRepairReceipt(env,gate.repairPrior,REPAIR_PINS);
      const purpose = {
        'stage-isolated-repair':'Stage one non-serving version inheriting the current identity key.',
        'activate-isolated-repair':'Activate the verified staged version on the isolated hostname.',
        'reconcile-isolated-repair':'Read immutable versions, traffic and the prior write intent.',
      }[env.REQUESTED_OPERATION];
      const summary = [
        purpose, 'Worker: `lythaus-admin-api-new-core-test` (`89391a349e454b3994bd43299c6386ed`).',
        'Verified baseline from protected activation `'+predecessorRun+'`: isolated deployment `'+gate.repairBaseline.predecessor.deploymentId+
          '` served version `'+gate.repairBaseline.predecessor.versionId+'` at 100%. Preserve this rollback reference.',
        'Candidate application: `' + REPAIR_PINS.sourceSha + '`. Worker SHA-256: `' + REPAIR_PINS.workerSha + '`. Assets SHA-256: `' + REPAIR_PINS.assetsSha + '`.',
        'Prior run: `' + env.PRIOR_RUN + '`.' + (state?.versionId ? ' Repair version: `' + state.versionId + '`.' : ''),
        ...(gate.beforeRequestRuns ? ['Prior protected runs with verified receipts showing no version or deployment request: '+gate.beforeRequestRuns.join(', ')+'.'] : []),
        'Abort on changed serving state, owner Access, routing, key lineage or database target. Reconcile uncertain writes before another mutation.',
        'Use the following review comment if accurate:', '`' + planAttestation + '`',
      ].join('\n\n');
      console.log(summary);
      if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,summary+'\n');
    }
    console.log('Verified protected main, completed receipts and owner gate.');
  } catch {
    console.error('Setup stopped at the source, receipt or owner approval check.');
    process.exitCode = 1;
  }
}
