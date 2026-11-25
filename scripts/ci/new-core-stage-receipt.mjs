import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID, RECORDED_WORKER_ID, requireSetup } from './new-core-isolated-cloudflare.mjs';
import { TARGET } from './lythaus-new-core-isolation-review.mjs';

const file = 'isolated-worker-lineage.json';
const keys = new Set(['parentIntent','ackParent','childIntent','childParent','ackChild','activationTarget','deploymentId','dnsId','routeId']);

export function validateStageReceipt(row,runId,controllerSha) {
  requireSetup(row?.schema === 1 && row.runId === runId && row.controllerSha === controllerSha &&
    row.workerId === RECORDED_WORKER_ID && row.applicationSha === TARGET.candidate &&
    row.lineage && Object.getPrototypeOf(row.lineage) === Object.prototype &&
    Object.entries(row.lineage).every(([key,value])=>keys.has(key) && typeof value === 'string' && ID.test(value)) &&
    Object.keys(row).sort().join() === 'applicationSha,controllerSha,lineage,runId,schema,workerId','lineage_receipt_invalid');
  const l=row.lineage;
  requireSetup(l.parentIntent && (!l.childIntent || l.ackParent && l.childParent === l.ackParent && l.childIntent !== l.parentIntent) &&
    (!l.ackChild || l.childIntent && l.ackChild !== l.ackParent) && (!l.activationTarget || l.activationTarget === l.ackChild) &&
    (!l.deploymentId || l.activationTarget) && (!l.dnsId || l.deploymentId) && (!l.routeId || l.dnsId),'lineage_receipt_inconsistent');
  return {...row.lineage};
}

export function loadPriorStageReceipt(env,priorRunSha) {
  if (!env.PRIOR_RUN) return {};
  const dir = mkdtempSync(join(env.RUNNER_TEMP,'prior-lineage-'));
  try {
    execFileSync('gh',['run','download',env.PRIOR_RUN,'--repo','AsoraKK/Lythaus','--name',
      'isolated-worker-lineage-'+env.PRIOR_RUN+'-1','--dir',dir],{
      env:{PATH:env.PATH,HOME:env.HOME,GH_TOKEN:env.GH_TOKEN},stdio:'ignore',timeout:30000});
    const path = join(dir,file), stat = lstatSync(path);
    requireSetup(stat.isFile() && stat.size <= 4096,'lineage_receipt_invalid');
    return validateStageReceipt(JSON.parse(readFileSync(path,'utf8')),env.PRIOR_RUN,priorRunSha);
  } catch { throw new Error('setup_prior_lineage_artifact_unverified'); }
  finally { rmSync(dir,{recursive:true,force:true}); }
}

export function recordStageReceipt(lineage,row,env) {
  switch (row.operation) {
    case 'worker_parent_intent':
      if (row.workerId !== RECORDED_WORKER_ID) return;
      requireSetup(!lineage.ackParent && !lineage.childIntent,'parent_lineage_conflict');
      lineage.parentIntent = row.intentId;
      break;
    case 'worker_child_intent':
      if (row.workerId !== RECORDED_WORKER_ID) return;
      requireSetup(lineage.ackParent === row.parentVersionId && !lineage.ackChild,'child_lineage_conflict');
      Object.assign(lineage,{childIntent:row.intentId,childParent:row.parentVersionId});
      break;
    case 'stage_version':
      if (!lineage.parentIntent || !row.id) return;
      lineage[lineage.childIntent ? 'ackChild' : 'ackParent'] = row.id;
      break;
    case 'worker_parent_verified':
    case 'worker_child_verified':
      if (row.workerId !== RECORDED_WORKER_ID) return;
      lineage[row.operation === 'worker_parent_verified' ? 'ackParent' : 'ackChild'] = row.versionId;
      break;
    case 'activate_child_intent':
      if (row.workerId !== RECORDED_WORKER_ID) return;
      requireSetup(row.versionId === lineage.ackChild,'activation_lineage_conflict');
      lineage.activationTarget = row.versionId;
      break;
    case 'activate_version':
    case 'create_test_dns':
    case 'create_test_route': {
      if (!lineage.activationTarget || !row.id) return;
      const key = {activate_version:'deploymentId',create_test_dns:'dnsId',create_test_route:'routeId'}[row.operation];
      lineage[key] = row.id;
      break;
    }
    default: return;
  }
  const receipt = {schema:1,runId:env.GITHUB_RUN_ID,controllerSha:env.GITHUB_SHA,workerId:RECORDED_WORKER_ID,
    applicationSha:TARGET.candidate,lineage};
  validateStageReceipt(receipt,env.GITHUB_RUN_ID,env.GITHUB_SHA);
  const path = join(env.RUNNER_TEMP,file);
  writeFileSync(path+'.tmp',JSON.stringify(receipt)+'\n',{mode:0o600});
  renameSync(path+'.tmp',path);
}
