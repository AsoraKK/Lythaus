import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {loadRepairBaseline,recordRepairBeforeRequest,recordRepairState,requireRecordedRepairIntent,validateRepairReceipt,verifyNoRepairRequest} from '../ci/new-core-repair-receipt.mjs';
import {predecessorRun,predecessorRuns,routedRun,routedHead} from '../ci/new-core-repair-control.mjs';
import {priorRepairState,routed} from '../ci/new-core-isolated-repair-state.mjs';
import {RECORDED_WORKER,SCRIPT} from '../ci/new-core-isolated-cloudflare.mjs';
const pins={sourceSha:'b'.repeat(40),workerSha:'c'.repeat(64),assetsSha:'d'.repeat(64),workerBytes:123,assetBytes:345,assetCount:3};
const expected={runId:'123',controllerSha:'a'.repeat(40),operation:'stage-isolated-repair',priorRun:predecessorRun};
const state={sourceSha:pins.sourceSha,workerSha:pins.workerSha,assetsSha:pins.assetsSha,
  intentId:'0028b1b2-a63d-4ffe-8485-ab2a8688b2a0'};
const envelope={...expected,schema:1,workerId:'89391a349e454b3994bd43299c6386ed',baselineRun:predecessorRun,state};
test('repair artifact binds every scope field and accepts only bounded intent and provider state',()=>{
  assert.deepEqual(validateRepairReceipt(envelope,expected,pins),state);
  for(const mutation of [{runId:'777'},{operation:'activate-isolated-repair'},{workerId:'9'.repeat(32)},
    {controllerSha:'f'.repeat(40)},{priorRun:'999'},{baselineRun:'999'},{schema:2},{extra:'private'},
    {state:{...state,notes:'private'}},{state:{...state,workerSha:'f'.repeat(64)}},
    {state:{...state,stageVerified:true}},{state:{...state,versionId:'37f36eb4-911d-4c51-b723-751329cd1b92'}}]) {
    assert.throws(()=>validateRepairReceipt({...envelope,...mutation},expected,pins));
  }
});
test('the routed lineage and both completed previous receipts must match and cannot authorize a fresh write',()=>{
  const scopes=predecessorRuns.map(({runId,controllerSha,operation,priorRun})=>({runId,controllerSha,operation,priorRun}));
  const {activationIntent,deploymentId,activationVerified,...staged}=priorRepairState;
  const archives=scopes.map((scope,index)=>({...scope,schema:1,workerId:envelope.workerId,baselineRun:routedRun,
    state:index===0?staged:priorRepairState}));
  const readLineage=(env,sha)=>{
    assert.equal(env.PRIOR_RUN,routedRun);
    assert.equal(sha,routedHead);
    return routed;
  };
  const read=(env,scope)=>archives[scopes.findIndex(row=>row.runId===scope.runId)];
  assert.deepEqual(loadRepairBaseline({},read,readLineage),{prior:routed,predecessor:priorRepairState});
  assert.throws(()=>loadRepairBaseline({},read,()=>({...routed,ackChild:staged.versionId})));
  for(const [index,scope] of scopes.entries()){
    const archive=archives[index];
    assert.throws(()=>validateRepairReceipt(archive,scope,pins));
    for(const change of [{runId:'999'},{priorRun:'999'},{workerId:'9'.repeat(32)},{baselineRun:predecessorRun},
      {state:{...archive.state,sourceSha:pins.sourceSha}},{state:{...archive.state,versionId:routed.ackChild}},
      {state:index===0?priorRepairState:staged}]){
      archives[index]={...archive,...change};
      assert.throws(()=>loadRepairBaseline({},read,readLineage),/predecessor_receipt/);
    }
    archives[index]=archive;
  }
});
test('journal retains intent before acknowledging a version, and never confuses stage with activation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'repair-journal-'));
  const env={RUNNER_TEMP:dir,GITHUB_RUN_ID:expected.runId,GITHUB_SHA:expected.controllerSha,
    REQUESTED_OPERATION:expected.operation,PRIOR_RUN:predecessorRun};
  try {
    recordRepairState(env,state,pins);
    const read=()=>JSON.parse(readFileSync(join(dir,'isolated-worker-repair.json'),'utf8'));
    assert.deepEqual(validateRepairReceipt(read(),expected,pins),state);
    const staged={...state,versionId:'f17c12eb-6a6e-492e-b207-93b99bdf5d5d',stageVerified:true};
    recordRepairState(env,staged,pins);
    assert.deepEqual(validateRepairReceipt(read(),expected,pins),staged);
    const activation={...staged,activationIntent:'7f421fae-43e9-4f65-9bb7-76ff4780d797'};
    assert.throws(()=>recordRepairState(env,activation,pins),/receipt_wrong_operation/);
    env.REQUESTED_OPERATION='activate-isolated-repair'; env.PRIOR_RUN=env.GITHUB_RUN_ID; env.GITHUB_RUN_ID='456';
    assert.throws(()=>recordRepairState(env,staged,pins),/receipt_wrong_operation/);
    recordRepairState(env,activation,pins);
    assert.deepEqual(read().state,activation);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('only the positive pre-request receipt permits a fresh approved attempt of the same operation and pinned bytes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'repair-before-request-'));
  const env={RUNNER_TEMP:dir,GITHUB_RUN_ID:expected.runId,GITHUB_SHA:expected.controllerSha,
    REQUESTED_OPERATION:expected.operation,PRIOR_RUN:predecessorRun};
  const read=()=>JSON.parse(readFileSync(join(dir,'isolated-worker-repair.json'),'utf8'));
  try {
    assert.throws(()=>verifyNoRepairRequest(env,expected,pins,read));
    recordRepairBeforeRequest(env,pins);
    verifyNoRepairRequest(env,expected,pins,read);
    assert.throws(()=>verifyNoRepairRequest(env,{...expected,runId:'789'},pins,read));
    assert.throws(()=>verifyNoRepairRequest(env,expected,{...pins,workerSha:'9'.repeat(64)},read));
    assert.throws(()=>verifyNoRepairRequest(env,{...expected,operation:'activate-isolated-repair'},pins,read));
    assert.throws(()=>validateRepairReceipt(read(),expected,pins));
    recordRepairState(env,state,pins);
    assert.throws(()=>verifyNoRepairRequest(env,expected,pins,read),/prior_write_attempt/);
    assert.throws(()=>recordRepairBeforeRequest(env,pins));
    assert.deepEqual(validateRepairReceipt(read(),expected,pins),state);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('the actual version and deployment transport checks the durable intent before contacting a provider',()=>{
  for(const operation of ['stage-isolated-repair','activate-isolated-repair']) {
    const dir=mkdtempSync(join(tmpdir(),'repair-send-'));
    const env={RUNNER_TEMP:dir,GITHUB_RUN_ID:'123',GITHUB_SHA:expected.controllerSha,REQUESTED_OPERATION:operation,
      PRIOR_RUN:operation==='stage-isolated-repair'?predecessorRun:'122'};
    let sent=0;
    const checked=requireRecordedRepairIntent({request:()=>++sent},env,pins);
    const staged='f17c12eb-6a6e-492e-b207-93b99bdf5d5d', activation='7f421fae-43e9-4f65-9bb7-76ff4780d797';
    const isStage=operation==='stage-isolated-repair',path=isStage?RECORDED_WORKER+'/versions?deploy=false':SCRIPT+'/deployments';
    const marker=isStage?'lythaus-isolated '+state.intentId+' '+priorRepairState.versionId:'lythaus-isolated-repair '+activation;
    const body={annotations:{'workers/message':marker},...(!isStage?{versions:[{version_id:staged,percentage:100}]}:{})};
    try {
      recordRepairBeforeRequest(env,pins);
      assert.throws(()=>checked.request(path,{method:'POST',body}));
      recordRepairState(env,isStage?state:{...state,stageVerified:true,versionId:staged,activationIntent:activation},pins);
      assert.throws(()=>checked.request(path,{method:'POST',body:{...body,annotations:{'workers/message':'wrong'}}}));
      assert.equal(sent,0);
      checked.request(path,{method:'POST',body});
      assert.equal(sent,1);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  }
});
