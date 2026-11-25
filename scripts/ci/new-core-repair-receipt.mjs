import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { RECORDED_WORKER,RECORDED_WORKER_ID,SCRIPT } from './new-core-isolated-cloudflare.mjs';
import { REPOSITORY } from './lythaus-new-core-schema-install-control.mjs';
import { assertRepairPins,routed,validateRepairState } from './new-core-isolated-repair-state.mjs';
import { routedRun } from './new-core-repair-control.mjs';

const name = 'isolated-worker-repair.json';
const beforeRequest = {
  'stage-isolated-repair':'BEFORE_VERSION_REQUEST',
  'activate-isolated-repair':'BEFORE_DEPLOYMENT_REQUEST',
};

function receiptScope(env) {
  return {runId:env.GITHUB_RUN_ID,controllerSha:env.GITHUB_SHA,operation:env.REQUESTED_OPERATION,priorRun:env.PRIOR_RUN};
}

function beforeRequestEnvelope(scope,pins) {
  assertRepairPins(pins);
  if (!Object.hasOwn(beforeRequest,scope.operation) || !/^[1-9]\d{0,18}$/.test(scope.runId)
    || !/^[1-9]\d{0,18}$/.test(scope.priorRun) || !/^[a-f0-9]{40}$/.test(scope.controllerSha)) {
    throw new Error('setup_repair_scope_invalid');
  }
  return {schema:1,workerId:RECORDED_WORKER_ID,baselineRun:routedRun,...scope,
    checkpoint:beforeRequest[scope.operation],pins};
}

// The controller replaces this file with its durable intent before either version or deployment POST.
export function recordRepairBeforeRequest(env,pins) {
  const receipt=beforeRequestEnvelope(receiptScope(env),pins);
  writeFileSync(join(env.RUNNER_TEMP,name),JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});
}

export function requireRecordedRepairIntent(api,env,pins) {
  return {...api,request(path,options) {
    const version=path===RECORDED_WORKER+'/versions?deploy=false';
    const deployment=path===SCRIPT+'/deployments';
    if (options?.method==='POST' && (version||deployment)) {
      const scope=receiptScope(env);
      const row=JSON.parse(readFileSync(join(env.RUNNER_TEMP,name),'utf8'));
      const state=validateRepairReceipt(row,scope,pins);
      const marker=options.body?.annotations?.['workers/message'];
      const authorized=version
        ? scope.operation==='stage-isolated-repair' && !state.versionId
          && marker==='lythaus-isolated '+state.intentId+' '+routed.ackChild
        : scope.operation==='activate-isolated-repair' && !state.deploymentId
          && marker==='lythaus-isolated-repair '+state.activationIntent
          && options.body?.versions?.length===1 && options.body.versions[0].version_id===state.versionId;
      if (!authorized) throw new Error('setup_repair_write_intent_unverified');
    }
    return api.request(path,options);
  }};
}

export function validateRepairReceipt(row, expected, pins) {
  if (row?.schema !== 1 || row.workerId !== RECORDED_WORKER_ID || row.baselineRun !== routedRun
    || Object.keys(row).sort().join() !== 'baselineRun,controllerSha,operation,priorRun,runId,schema,state,workerId'
    || !['runId','controllerSha','operation','priorRun'].every(key => row[key] === expected[key])) {
    throw new Error('setup_repair_receipt_invalid');
  }
  const state = validateRepairState(row.state,pins);
  if (row.operation === 'stage-isolated-repair' && (row.priorRun !== routedRun || state.activationIntent)
    || row.operation === 'activate-isolated-repair' && (!state.stageVerified || !state.activationIntent)) {
    throw new Error('setup_repair_receipt_wrong_operation');
  }
  return state;
}

function readRepairArtifact(env,expected) {
  const dir = mkdtempSync(join(env.RUNNER_TEMP,'prior-repair-'));
  try {
    execFileSync('gh',['run','download',expected.runId,'--repo',REPOSITORY,'--name',
      'isolated-worker-repair-'+expected.runId+'-1','--dir',dir],{
      env:{PATH:env.PATH,HOME:env.HOME,GH_TOKEN:env.GH_TOKEN},stdio:'ignore',timeout:30000});
    const path = join(dir,name), stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 4096) throw new Error('invalid');
    return JSON.parse(readFileSync(path,'utf8'));
  } catch { throw new Error('setup_prior_repair_artifact_unverified'); }
  finally { rmSync(dir,{recursive:true,force:true}); }
}

export function verifyNoRepairRequest(env,expected,pins,read=readRepairArtifact) {
  if (!isDeepStrictEqual(read(env,expected),beforeRequestEnvelope(expected,pins))) {
    throw new Error('setup_repair_prior_write_attempt_requires_reconciliation');
  }
}

export function loadRepairReceipt(env, expected, pins) {
  if (!expected) return undefined;
  const state=validateRepairReceipt(readRepairArtifact(env,expected),expected,pins);
  if (env.REQUESTED_OPERATION === 'activate-isolated-repair' &&
    (state.stageVerified !== true || !state.versionId || state.activationIntent)) {
    throw new Error('setup_repair_verified_staged_version_required');
  }
  return state;
}

export function recordRepairState(env, state, pins) {
  const scope = receiptScope(env);
  const receipt = {schema:1,workerId:RECORDED_WORKER_ID,baselineRun:routedRun,...scope,state};
  validateRepairReceipt(receipt,scope,pins);
  const path = join(env.RUNNER_TEMP,name);
  writeFileSync(path+'.tmp',JSON.stringify(receipt)+'\n',{mode:0o600});
  renameSync(path+'.tmp',path);
}
