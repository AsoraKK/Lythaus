import { PINS, verifyOwnerReview } from './lythaus-new-core-schema-install-control.mjs';
import { assertRepairPins } from './new-core-isolated-repair-state.mjs';

export const routedRun = '45611431085';
export const routedHead = 'd4cf5bb1229383f736b0287101096482ca9a535e';
const diagnosticRun = '45628704670';
const diagnosticHead = 'a8f65d6ecbe107346598847a1c5c82b92a3ee9cd';
const workflow = '.github/workflows/new-core-isolated-setup.yml';
const host = ' admin-new-core-test.lythaus.co at ';
const operations = ['stage-isolated-repair','activate-isolated-repair','reconcile-isolated-repair'];
export const isRepairOperation = operation => operations.includes(operation);

function check(condition, reason) {
  if (!condition) throw new Error('setup_repair_' + reason);
}

function protectedRun(run, id) {
  return run && String(run.id) === id && run.repository?.id === 1010752912 && run.path === workflow
    && run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.run_attempt === 1
    && run.actor?.id === PINS.ownerId && run.triggering_actor?.id === PINS.ownerId
    && /^[a-f0-9]{40}$/.test(run.head_sha) && run.status === 'completed';
}

// A lost write acknowledgement cannot be retried by dispatching the same operation with an earlier receipt.
async function verifyFirstWrite(env, get, pins, verifyNoRequest, onVerifiedNoRequest) {
  const operation = env.REQUESTED_OPERATION;
  if (operation === 'reconcile-isolated-repair') return;
  const base = 'actions/workflows/new-core-isolated-setup.yml/runs?branch=main&event=workflow_dispatch&created=%3E%3D2026-11-25&per_page=100&page=';
  const seen = new Set();
  let count;
  for (let page = 1; ; page++) {
    const data = await get(base + page);
    if (page === 1) count = data?.total_count;
    check(Number.isSafeInteger(count) && count > 0 && count <= 1000 && count === data?.total_count
      && Array.isArray(data.workflow_runs) && data.workflow_runs.length === Math.min(100, count - seen.size), 'history_unavailable');
    for (const run of data.workflow_runs) {
      const id = String(run.id);
      check(/^[1-9]\d{0,18}$/.test(id) && !seen.has(id), 'history_unavailable');
      seen.add(id);
      if (id === env.GITHUB_RUN_ID || !run.display_title?.startsWith(operation + host)) continue;
      const jobs = await get('actions/runs/' + id + '/jobs?per_page=100');
      check(Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length, 'history_unavailable');
      const protectedJobs = jobs.jobs.filter(job => job.name === 'Owner review for isolated setup');
      if (protectedJobs.length === 0) {
        const neverAdmitted = ['queued','waiting','pending','requested'].includes(run.status)
          || jobs.jobs.length === 1 && jobs.jobs[0].name === 'control'
          && ['failure','skipped','cancelled','timed_out'].includes(jobs.jobs[0].conclusion);
        check(neverAdmitted, 'history_unavailable');
      }
      for (const job of protectedJobs) {
        const step = job.steps?.find(step => step.name === 'Perform only the selected operation on the isolated target');
        if (!step && job.conclusion === 'skipped') continue;
        // Other queued reviews cannot enter the provider step while this workflow owns the serial group.
        if (!step && ['queued','waiting','pending'].includes(job.status)) continue;
        if (step && (step.conclusion === 'skipped' || ['queued','pending'].includes(step.status))) continue;
        const archived=job.steps?.find(item=>item.name==='Retain the separate sanitized isolated repair receipt');
        check(step?.status==='completed' && ['failure','cancelled','timed_out'].includes(step.conclusion)
          && archived?.conclusion==='success', 'prior_write_attempt_requires_reconciliation');
        const previous=await get('actions/runs/'+id);
        check(protectedRun(previous,id) && ['failure','cancelled','timed_out'].includes(previous.conclusion),
          'prior_write_attempt_requires_reconciliation');
        const priorRun=previous.display_title?.split(' from ')[1];
        check(/^[1-9]\d{0,18}$/.test(priorRun??'') && previous.display_title === operation+host+previous.head_sha+' from '+priorRun
          && (operation!=='stage-isolated-repair' || priorRun===routedRun), 'prior_run_unverified');
        if (previous.head_sha!==env.GITHUB_SHA) {
          const compare=await get('compare/'+previous.head_sha+'...'+env.GITHUB_SHA);
          check(compare?.merge_base_commit?.sha===previous.head_sha,'ancestry_unverified');
        }
        verifyOwnerReview(await get('actions/runs/'+id+'/approvals'));
        await verifyNoRequest(env,{runId:id,controllerSha:previous.head_sha,operation,priorRun},pins);
        onVerifiedNoRequest?.(id);
      }
    }
    if (seen.size === count) break;
  }
  check(seen.has(env.GITHUB_RUN_ID), 'history_unavailable');
}

export async function verifyRepairControl({env, get, pins, verifyNoRequest, onVerifiedNoRequest}) {
  assertRepairPins(pins);
  check(pins.sourceSha !== env.GITHUB_SHA, 'separate_application_pin_required');
  const ancestral = async sha => {
    const compare = await get('compare/' + sha + '...' + env.GITHUB_SHA);
    check(compare?.merge_base_commit?.sha === sha, 'ancestry_unverified');
  };
  for (const [id, sha, operation] of [[routedRun, routedHead, 'resume-worker-script-settings'],
    [diagnosticRun, diagnosticHead, 'diagnose-admin-read']]) {
    const run = await get('actions/runs/' + id);
    check(protectedRun(run,id) && run.conclusion === 'success' && run.head_sha === sha
      && run.display_title === operation + host + sha, 'baseline_unverified');
    verifyOwnerReview(await get('actions/runs/' + id + '/approvals'));
  }
  await ancestral(diagnosticHead);
  await ancestral(pins.sourceSha);
  let prior;
  if (env.REQUESTED_OPERATION === 'stage-isolated-repair' || env.REQUESTED_OPERATION === 'reconcile-isolated-repair' && env.PRIOR_RUN === routedRun) {
    check(env.PRIOR_RUN === routedRun, 'baseline_unverified');
  } else {
    const id = env.PRIOR_RUN;
    check(/^[1-9]\d{0,18}$/.test(id ?? '') && id !== env.GITHUB_RUN_ID && id !== routedRun && id !== diagnosticRun, 'prior_run_unverified');
    const run = await get('actions/runs/' + id);
    check(protectedRun(run,id), 'prior_run_unverified');
    const [operation, suffix] = String(run.display_title).split(host);
    const allowed = env.REQUESTED_OPERATION === 'activate-isolated-repair'
      ? ['stage-isolated-repair','reconcile-isolated-repair'] : operations;
    const priorRun = suffix?.split(' from ')[1];
    check(allowed.includes(operation) && /^[1-9]\d{0,18}$/.test(priorRun ?? '') && priorRun !== id
      && run.display_title === operation + host + run.head_sha + ' from ' + priorRun
      && (operation !== 'stage-isolated-repair' || priorRun === routedRun), 'prior_run_unverified');
    check(env.REQUESTED_OPERATION === 'activate-isolated-repair'
      ? run.conclusion === 'success' && run.head_sha === env.GITHUB_SHA
      : ['success','failure','cancelled','timed_out'].includes(run.conclusion), 'prior_run_unverified');
    if (run.head_sha !== env.GITHUB_SHA) await ancestral(run.head_sha);
    verifyOwnerReview(await get('actions/runs/' + id + '/approvals'));
    prior = {runId:id,controllerSha:run.head_sha,operation,priorRun};
  }
  await verifyFirstWrite(env,get,pins,verifyNoRequest ?? (async (...args)=>{
    const {verifyNoRepairRequest} = await import('./new-core-repair-receipt.mjs');
    verifyNoRepairRequest(...args);
  }),onVerifiedNoRequest);
  return prior;
}
