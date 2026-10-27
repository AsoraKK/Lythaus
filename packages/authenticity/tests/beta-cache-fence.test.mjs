import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { BETA_VERSION, SAFE_CHECKPOINT, SAFE_PREPROCESSING, compileBetaResult, betaReuseKey } from '../src/beta.ts';
import { createInsufficientEvidenceRecommendation } from '../src/judge.ts';
import { sha256Hex } from '../src/forensics.ts';

const caseId='01990000-0000-7000-8000-000000000601';
const runId='01990000-0000-7000-8000-000000000602';
const eventId='01990000-0000-7000-8000-000000000603';
const ownerId='01990000-0000-7000-8000-000000000604';
const bytes=new Uint8Array(33);
bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
new DataView(bytes.buffer).setUint32(16,256); new DataView(bytes.buffer).setUint32(20,256); bytes[24]=8; bytes[25]=2;
const inputHash=await sha256Hex(bytes);
const runtimeDigest=`sha256:${'c'.repeat(64)}`, preprocessingHash='b'.repeat(64);
const safe={caseId,runId,inputHash,revision:1,schemaVersion:BETA_VERSION,checkpoint:SAFE_CHECKPOINT,preprocessing:SAFE_PREPROCESSING,runtimeDigest,preprocessingHash,status:'OK',score:1,facts:{mime:'image/png',width:256,height:256,frames:1,mode:'RGB',sourceHistory:'DOCUMENTED_LOSSLESS'},timings:{decodeMs:1,inferenceMs:1,peakRssBytes:1},forensics:null};
const safety={provider:'synthetic-fixture',modelVersion:'fixture',result:'ALLOW',reasonCodes:[],executionMs:1,costEstimateUsd:0};
const reuseKey=await betaReuseKey(ownerId,inputHash,runtimeDigest,preprocessingHash);
let config,row,queries,calls,hook,cachedSafe;
const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
function reset({saved=true}={}) {
  config={enabled:true,expiresAt:new Date(Date.now()+3600000).toISOString(),allowlist:[ownerId],safeEnabled:true,adviserEnabled:false,rightsApproval:'d'.repeat(64),runtimeApproval:'e'.repeat(64),budgetApproval:'f'.repeat(64),budgetEvidenceSha256:'f'.repeat(64),budgetObservedAt:new Date().toISOString(),budgetExpiresAt:new Date(Date.now()+3600000).toISOString(),authenticitySubBudgetUsd:2,authenticityHeadroomUsd:0.4,caseReservationUsd:0.1,runtimeDigest,preprocessingHash,sourceHistoryHashes:[inputHash]};
  row={case_id:caseId,owner_id:ownerId,input_hash:inputHash,revision:1,original_key:'private-fixture',original_etag:'fixture-etag',lease_token:runId,state:'complete',result:saved?compileBetaResult(structuredClone(safe),safety):null,review_state:'none',created_at:new Date(),updated_at:new Date(),expires_at:new Date(Date.now()+3600000)};
  queries=[]; calls={container:0,adviser:0}; hook=()=>{}; cachedSafe=structuredClone(safe);
}
async function query(_binding,sql,values=[]) {
  queries.push({sql,values}); hook(sql,values);
  if(sql.includes('FROM system.outbox_events')) return result([{id:eventId}]);
  if(sql.includes('FROM system.cost_budget_reservations')) return result([{id:eventId}]);
  if(sql.includes('count(DISTINCT case_id)')) return result([{count:'0'}]);
  if(sql.includes("lease_until>now() AND state='analyzing' LIMIT 1")) return result();
  if(sql.includes("UPDATE moderation.authenticity_beta SET state='analyzing'")) return result([row]);
  if(sql.includes('SELECT id,state,output,reuse_key')) return values[1]==='advice'?result():result([{id:runId,state:'completed',output:values[1]==='safe'?cachedSafe:safety,reuse_key:reuseKey}]);
  if(sql.includes('SELECT id FROM moderation.authenticity_beta_steps') && sql.includes("step='safe'")) return result([{id:runId},{id:eventId}]);
  if(sql.includes('SELECT id FROM moderation.authenticity_beta_steps')) return result();
  if(sql.includes('FROM media.objects')) return result([{content_type:'image/png',byte_size:String(bytes.length)}]);
  if(sql.includes('FROM moderation.authenticity_beta_feedback')) return result();
  if(sql.includes('SELECT * FROM moderation.authenticity_beta')) return result([row]);
  if(sql.includes('SELECT case_id FROM moderation.authenticity_beta')) return result([{case_id:caseId}]);
  return result([],1);
}
mock.module('@lythaus/db',{cache:true,namedExports:{query,transaction:async(binding,work)=>work({query:(sql,values)=>query(binding,sql,values)}),reserveBudget:async()=>{throw new Error('unexpected_budget_write');}}});
mock.module('@lythaus/security',{cache:true,namedExports:{uuidv7:()=>runId}});
mock.module('@lythaus/media',{cache:true,namedExports:{createPresignedPutUrl:async()=>{throw new Error('unexpected_upload');}}});
const { processBetaEvent }=await import('../../../apps/lythaus-jobs/src/authenticity-beta.ts');
const { handleBetaApi }=await import('../../../apps/lythaus-public-api/src/authenticity-beta.ts');
const { handleAdminBeta }=await import('../../../apps/lythaus-admin-api/src/authenticity-beta.ts');
function env() {
  return {DB_JOBS_FRESH:{},DB_APP_FRESH:{},DB_ADMIN_FRESH:{},AUTHENTICITY_BETA_ENABLED:'true',COST_BUDGET_ENABLED:'true',AUTHENTICITY_BETA_DISPATCH_SECRET:'synthetic-fixture',AI_GATEWAY_ID:'fixture',LYTHAUS_CONFIG:{get:async()=>structuredClone(config)},MEDIA_QUARANTINE:{get:async()=>({httpEtag:'fixture-etag',size:bytes.length,body:new Response(bytes).body})},AUTHENTICITY_BETA_CONTAINER:{getByName:()=>({fetch:async()=>{calls.container++;throw new Error('unexpected_inference');}})},AI:{run:async()=>{calls.adviser++;config.sourceHistoryHashes=[];return {response:JSON.stringify(createInsufficientEvidenceRecommendation('Synthetic fixture; evidence remains incomplete.'))};}}};
}
function assertPaused() {
  const settled=queries.findLast(item=>item.sql.includes('failure_code=$5'));
  assert.ok(settled); assert.equal(settled.values[3],'paused'); assert.equal(settled.values[4],'beta_evidence_stale');
  assert.equal(queries.some(item=>item.sql.includes('SET result=$4::jsonb') && item.values[4]===true),false);
}
test('owner list, detail and finalise retry withdraw stale findings without mutating stored history',async()=>{
  reset(); config.sourceHistoryHashes=[];
  for(const [path,method] of [['','GET'],[`/${caseId}`,'GET'],[`/${caseId}/finalise`,'POST']]) {
    const response=await handleBetaApi(new Request(`https://fixture.test/api/authenticity/cases${path}`,{method}),env(),ownerId);
    assert.equal(response.status,200); const body=await response.json(); const view=body.items?.[0]??body;
    assert.equal(view.finding,'UNAVAILABLE'); assert.equal(view.advisoryStatus,'disabled'); assert.equal(view.detectorExecution,'no_usable_output');
  }
  assert.equal(row.result.finding,'SYNTHETIC_LIKE_EVIDENCE'); assert.deepEqual(calls,{container:0,adviser:0});
});
test('admin stale diagnostics and retry/advice cannot expose or enqueue cached evidence',async()=>{
  reset(); config.sourceHistoryHashes=[]; config.adviserEnabled=true;
  const actor={userId:ownerId,role:'owner'};
  const response=await handleAdminBeta(new Request(`https://fixture.test/api/admin/authenticity/cases/${caseId}`),env(),actor);
  const body=await response.json(); assert.equal(body.finding,'UNAVAILABLE'); assert.equal(body.diagnostics.safe,null); assert.equal(body.diagnostics.advisory,null); assert.equal(body.diagnostics.evidenceFamilies,null);
  for(const action of ['retry','advice']) {
    const denied=await handleAdminBeta(new Request(`https://fixture.test/api/admin/authenticity/cases/${caseId}/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Synthetic fixture retry'})}),env(),actor);
    assert.equal(denied.status,409);
  }
  assert.equal(queries.some(item=>item.sql.includes('INSERT INTO system.outbox_events')),false);
});
test('saved result withdrawal stops analysis and advice before any provider call',async()=>{
  for(const operation of ['analysis','advice']) {
    reset(); config.sourceHistoryHashes=[];
    await processBetaEvent(env(),eventId,{caseId,revision:1,operation});
    assertPaused(); assert.deepEqual(calls,{container:0,adviser:0});
  }
});
test('completed SAFE step reuse observes withdrawal after admission',async()=>{
  reset({saved:false});
  hook=(sql,values)=>{if(sql.includes('SELECT id,state,output,reuse_key') && values[1]==='safe') config.sourceHistoryHashes=[];};
  await processBetaEvent(env(),eventId,{caseId,revision:1});
  assertPaused(); assert.deepEqual(calls,{container:0,adviser:0});
});
test('completed SAFE cache is bound to the recorded step id',async()=>{
  reset({saved:false}); cachedSafe.runId=eventId;
  await processBetaEvent(env(),eventId,{caseId,revision:1});
  assertPaused(); assert.deepEqual(calls,{container:0,adviser:0});
});
test('withdrawal while adviser runs prevents terminal result settlement',async()=>{
  reset(); config.adviserEnabled=true;
  await processBetaEvent(env(),eventId,{caseId,revision:1,operation:'advice'});
  assertPaused(); assert.deepEqual(calls,{container:0,adviser:1});
});
test('current cached SAFE result completes locally without repeating inference',async()=>{
  reset({saved:false});
  await processBetaEvent(env(),eventId,{caseId,revision:1});
  const settled=queries.find(item=>item.sql.includes('SET result=$4::jsonb') && item.values[4]===true);
  assert.ok(settled); assert.equal(JSON.parse(settled.values[3]).finding,'SYNTHETIC_LIKE_EVIDENCE'); assert.deepEqual(calls,{container:0,adviser:0});
});
