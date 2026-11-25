import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyRepairControl,routedHead,routedRun} from '../ci/new-core-repair-control.mjs';

const sha='a'.repeat(40), pins={sourceSha:'b'.repeat(40),workerSha:'c'.repeat(64),assetsSha:'d'.repeat(64),workerBytes:123,assetBytes:345,assetCount:3};
const diagnostic='45628704670', diagnosticHead='a8f65d6ecbe107346598847a1c5c82b92a3ee9cd';
const stage='stage-isolated-repair',activate='activate-isolated-repair',reconcile='reconcile-isolated-repair';
const owner=211295889, approval=[{state:'approved',user:{id:owner},environments:[{id:18972418184}]}];
const workflow='.github/workflows/new-core-isolated-setup.yml';
function run(id,head,operation,priorRun) {
  return {id:Number(id),head_sha:head,repository:{id:1010752912},path:workflow,head_branch:'main',run_attempt:1,
    actor:{id:owner},triggering_actor:{id:owner},status:'completed',conclusion:'success',event:'workflow_dispatch',
    display_title:operation+' admin-new-core-test.lythaus.co at '+head+(priorRun?' from '+priorRun:'')};
}
function inputs(operation=stage, priorRun=routedRun) {
  const env={GITHUB_SHA:sha,GITHUB_RUN_ID:'45690000000',REQUESTED_OPERATION:operation,PRIOR_RUN:priorRun};
  const current=run(env.GITHUB_RUN_ID,sha,operation,priorRun);
  const rows=[current];
  const mapping={
    ['actions/runs/'+routedRun]:run(routedRun,routedHead,'resume-worker-script-settings'),
    ['actions/runs/'+diagnostic]:run(diagnostic,diagnosticHead,'diagnose-admin-read'),
    ['actions/runs/'+routedRun+'/approvals']:approval,['actions/runs/'+diagnostic+'/approvals']:approval,
    ['compare/'+diagnosticHead+'...'+sha]:{merge_base_commit:{sha:diagnosticHead}},
    ['compare/'+pins.sourceSha+'...'+sha]:{merge_base_commit:{sha:pins.sourceSha}},
  };
  const get=async path=>path.startsWith('actions/workflows/new-core-isolated-setup.yml/runs?')&&path.endsWith('page=1')
    ? {total_count:rows.length,workflow_runs:rows}:mapping[path];
  return {env,rows,mapping,get,pins};
}
const priorId='45688888999';
function withPrior(operation,from=stage,result='success') {
  const x=inputs(operation,priorId);
  x.mapping['actions/runs/'+priorId]={...run(priorId,sha,from,from===stage?routedRun:'45687777888'),conclusion:result};
  x.mapping['actions/runs/'+priorId+'/approvals']=approval;
  x.rows.push(x.mapping['actions/runs/'+priorId]);
  return x;
}
test('first repair stage uses the exact routed and diagnostic runs and protected source',async()=>{
  assert.equal(await verifyRepairControl(inputs()),undefined);
  for(const [id,patch] of [[routedRun,{conclusion:'failure'}],[routedRun,{actor:{id:1}}],[diagnostic,{head_sha:sha}],
    [diagnostic,{display_title:'other'}],[diagnostic,{run_attempt:2}],[diagnostic,{event:'pull_request'}]]) {
    const x=inputs();
    Object.assign(x.mapping['actions/runs/'+id],patch);
    await assert.rejects(verifyRepairControl(x),/baseline_unverified/);
  }
  const x=inputs();
  x.mapping['actions/runs/'+diagnostic+'/approvals']=[];
  await assert.rejects(verifyRepairControl(x),/schema_owner_approval_missing/);
  await assert.rejects(verifyRepairControl({...inputs(),pins:null}));
  await assert.rejects(verifyRepairControl({...inputs(),pins:{...pins,sourceSha:sha}}),/separate_application_pin/);
  await assert.rejects(verifyRepairControl(inputs(stage,priorId)),/baseline_unverified/);
});
test('activation accepts an approved successful stage or reconciliation on the same protected head',async()=>{
  for (const previous of [stage,reconcile]) {
    const x=withPrior(activate,previous);
    assert.deepEqual(await verifyRepairControl(x),{runId:priorId,controllerSha:sha,operation:previous,
      priorRun:previous===stage?routedRun:'45687777888'});
  }
  for (const change of [{run_attempt:2},{actor:{id:1}},{repository:{id:1}},{head_branch:'feature'},
    {event:'push'},{path:'.github/workflows/other.yml'},{head_sha:'e'.repeat(40)},
    {conclusion:'failure'},{display_title:'stage-isolated-repair admin-new-core-test.lythaus.co at '+sha+' from 5678'}]) {
    const x=withPrior(activate);
    Object.assign(x.mapping['actions/runs/'+priorId],change);
    await assert.rejects(verifyRepairControl(x),/prior_run_unverified/);
  }
  await assert.rejects(verifyRepairControl(withPrior(activate,activate)),/prior_run_unverified/);
});
test('only reconciliation reads a failed write receipt and can verify an earlier protected controller',async()=>{
  assert.equal(await verifyRepairControl(inputs(reconcile,routedRun)),undefined);
  const x=withPrior(reconcile,activate,'failure');
  const older='e'.repeat(40), previous=x.mapping['actions/runs/'+priorId];
  previous.display_title=previous.display_title.replace(sha,older); previous.head_sha=older;
  await assert.rejects(verifyRepairControl(x),/ancestry_unverified/);
  x.mapping['compare/'+older+'...'+sha]={merge_base_commit:{sha:older}};
  assert.equal((await verifyRepairControl(x)).controllerSha,older);
});

test('a failed protected provider step needs an archived positive no-request receipt for a fresh approval',async()=>{
  for(const operation of [stage,activate]) {
    const x=operation===stage?inputs():withPrior(activate), id='45687912345';
    const previous={...run(id,sha,operation,operation===stage?routedRun:priorId),conclusion:'failure'};
    x.rows.push(previous);
    x.mapping['actions/runs/'+id]=previous;
    x.mapping['actions/runs/'+id+'/approvals']=approval;
    const provider={name:'Perform only the selected operation on the isolated target',status:'completed',conclusion:'failure'};
    const archive={name:'Retain the separate sanitized isolated repair receipt',status:'completed',conclusion:'success'};
    x.mapping['actions/runs/'+id+'/jobs?per_page=100']={total_count:1,jobs:[
      {name:'Owner review for isolated setup',status:'completed',steps:[provider,archive]}]};
    let credited=0;
    const verifyNoRequest=(scope,history,reviewedPins)=>{
      assert.equal(scope,x.env);
      assert.deepEqual(history,{runId:id,controllerSha:sha,operation,priorRun:operation===stage?routedRun:priorId});
      assert.equal(reviewedPins,pins); credited++;
    };
    await verifyRepairControl({...x,verifyNoRequest});
    assert.equal(credited,1);
    await assert.rejects(verifyRepairControl({...x,verifyNoRequest:()=>{throw new Error('unknown');}}),/unknown/);
    previous.conclusion='success';
    await assert.rejects(verifyRepairControl({...x,verifyNoRequest}),/prior_write_attempt/);
    previous.conclusion='failure'; archive.conclusion='failure';
    await assert.rejects(verifyRepairControl({...x,verifyNoRequest}),/prior_write_attempt/);
  }
});
test('a new dispatch cannot repeat a write which already reached its provider step',async()=>{
  for(const operation of [stage,activate]) {
    const x=operation===stage?inputs():withPrior(activate);
    const previous=run('45687912345',sha,operation,operation===stage?routedRun:priorId);
    x.rows.push(previous);
    const step={name:'Perform only the selected operation on the isolated target',status:'completed',conclusion:'failure'};
    x.mapping['actions/runs/'+previous.id+'/jobs?per_page=100']={total_count:1,jobs:[
      {name:'Owner review for isolated setup',status:'completed',steps:[step]}]};
    await assert.rejects(verifyRepairControl(x),/prior_write_attempt/);
    step.conclusion='skipped';
    await verifyRepairControl(x);
  }
  const x=inputs(); x.rows.length=0;
  await assert.rejects(verifyRepairControl(x),/history_unavailable/);
});
