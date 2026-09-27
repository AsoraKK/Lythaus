import assert from 'node:assert/strict';
import { mock } from 'node:test';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { uuidv7 } from '../../packages/authenticity/src/uuid.ts';
import { BETA_VERSION, SAFE_CHECKPOINT, SAFE_PREPROCESSING } from '../../packages/authenticity/src/beta.ts';
import { generateForensicFeatureBundleV1 } from '../../packages/authenticity/src/forensics.ts';
import { createInsufficientEvidenceRecommendation } from '../../packages/authenticity/src/judge.ts';

const connectionString=process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
if(!connectionString || !['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname)) throw new Error('Local PostgreSQL 17 test database required');
async function connect(role) {
  const client=new pg.Client({connectionString,ssl:false}); await client.connect();
  if(role) { if(!['lythaus_runtime','lythaus_jobs','lythaus_admin'].includes(role)) throw new Error('test_role_invalid'); await client.query(`SET ROLE ${role}`); }
  return client;
}
const sql=async(binding,text,values=[])=>{const client=await connect(binding.role);try{return await client.query(text,values);}finally{await client.end();}};
const transaction=async(binding,work)=>{const client=await connect(binding.role);try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}};
let reserve;
mock.module('@lythaus/db',{cache:true,namedExports:{query:sql,transaction,reserveBudget:(...args)=>reserve(...args)}});
mock.module('@lythaus/media',{cache:true,namedExports:{createPresignedPutUrl:async()=>({url:'https://fixture.r2.cloudflarestorage.com/upload',expiresAt:new Date(Date.now()+600000).toISOString()})}});
let safetyCalls=0,safeCalls=0,adviceCalls=0,safetyResult='ALLOW',duringInference;
mock.module(new URL('../../packages/authenticity/src/openai-moderation.ts',import.meta.url),{cache:true,namedExports:{createOpenAIModerationProvider:()=>({analyseImage:async()=>{safetyCalls++;return {provider:'explicit-ci-fixture',result:safetyResult,modelVersion:'protocol-only',executionMs:1,costEstimateUsd:0,reasonCodes:[]};}})}});
reserve=(await import('../../packages/db/src/budget.ts')).reserveBudget;
const {handleBetaApi}=await import('../../apps/lythaus-public-api/src/authenticity-beta.ts');
const {handleAdminBeta}=await import('../../apps/lythaus-admin-api/src/authenticity-beta.ts');
const {processBetaEvent}=await import('../../apps/lythaus-jobs/src/authenticity-beta.ts');
const {purgeBetaMedia}=await import('../../packages/db/src/authenticity-beta.ts');

class ProtocolBucket {
  objects=new Map();
  async put(key,bytes,options={}) {
    if(options.onlyIf && this.objects.has(key)) return null;
    const value=Uint8Array.from(bytes);this.objects.set(key,{bytes:value,etag:createHash('sha256').update(value).digest('hex')});return this.head(key);
  }
  async head(key){const value=this.objects.get(key);return value?{size:value.bytes.length,httpEtag:`"${value.etag}"`}:null;}
  async get(key){const value=this.objects.get(key);return value?{...await this.head(key),body:new Response(value.bytes).body}:null;}
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.objects.delete(key);}
}
const bucket=new ProtocolBucket(), owner=uuidv7(), stranger=uuidv7();
const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);new DataView(bytes.buffer).setUint32(16,256);new DataView(bytes.buffer).setUint32(20,256);bytes[24]=8;bytes[25]=2;
const hash=createHash('sha256').update(bytes).digest('hex');
const config={enabled:true,safeEnabled:true,adviserEnabled:true,allowlist:[owner,stranger],rightsApproval:'a'.repeat(64),budgetApproval:'b'.repeat(64),runtimeApproval:'c'.repeat(64),preprocessingHash:'d'.repeat(64),runtimeDigest:`sha256:${'e'.repeat(64)}`,caseReservationUsd:0.5,sourceHistoryHashes:[hash]};
const env={DB_APP_FRESH:{role:'lythaus_runtime'},DB_JOBS_FRESH:{role:'lythaus_jobs'},DB_ADMIN_FRESH:{role:'lythaus_admin'},AUTHENTICITY_BETA_ENABLED:'true',LYTHAUS_CONFIG:{get:async()=>config},MEDIA_QUARANTINE:bucket,MEDIA_QUARANTINE_BUCKET:'ci-fixture',R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture',MEDIA_QUOTA_BYTES:'67108864',COST_BUDGET_ENABLED:'true',COST_BUDGET_LIMIT_USD:'100',COST_BUDGET_WARNING_USD:'70',COST_BUDGET_OPTIONAL_ANALYSIS_USD:'80',COST_BUDGET_ESSENTIAL_ONLY_USD:'90',COST_BUDGET_DEEP_SCAN_STOP_USD:'95',OPENAI_API_KEY:'explicit-ci-fixture',AUTHENTICITY_BETA_DISPATCH_SECRET:'explicit-ci-fixture',AI_GATEWAY_ID:'ci-fixture',AI:{run:async()=>{adviceCalls++;return {response:JSON.stringify(createInsufficientEvidenceRecommendation('EF5 is unavailable; authorship remains unresolved.')),usage:{prompt_tokens:100,completion_tokens:50}};}},AUTHENTICITY_BETA_CONTAINER:{getByName(name){assert.equal(name,'safe-a-beta-v1');return {fetch:async request=>{
  safeCalls++; const binding=JSON.parse(request.headers.get('x-beta-binding'));
  assert.deepEqual(new Uint8Array(await request.arrayBuffer()),bytes);
  const forensics=await generateForensicFeatureBundleV1({caseId:binding.caseId,bytes,mime:'image/png',decoded:{width:256,height:256,channels:3,pixels:new Uint8Array(256*256*3).fill(80)}});
  if(duringInference) await duringInference(binding.caseId);
  return Response.json({result:{...binding,schemaVersion:BETA_VERSION,checkpoint:SAFE_CHECKPOINT,preprocessing:SAFE_PREPROCESSING,preprocessingHash:config.preprocessingHash,runtimeDigest:config.runtimeDigest,status:'OK',score:1,facts:{mime:'image/png',width:256,height:256,frames:1,mode:'RGB',sourceHistory:'UNKNOWN'},timings:{decodeMs:1,inferenceMs:1,peakRssBytes:1},forensics}});
}};}}};
const request=(suffix='',method='GET',body)=>new Request(`https://api.example.test/api/authenticity/cases${suffix}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
const api=(suffix='',method='GET',body,user=owner)=>handleBetaApi(request(suffix,method,body),env,user);
const submission={contentType:'image/png',size:bytes.length,checksumSha256:hash,consentVersion:BETA_VERSION,trainingConsent:false};
async function create(){const response=await api('','POST',submission);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return (await response.json()).caseId;}
async function upload(id){await bucket.put(`quarantine/${owner}/${id}`,bytes);const response=await api(`/${id}/finalise`,'POST');assert.equal(response.status,202,JSON.stringify(await response.clone().json()));}
async function event(id){return (await sql({},`SELECT id,payload FROM system.outbox_events WHERE aggregate_id=$1 ORDER BY created_at DESC LIMIT 1`,[id])).rows[0];}
async function processCase(id){const e=await event(id);await processBetaEvent(env,e.id,e.payload);return e;}
const admin=await connect();
try {
  const version=(await admin.query("SELECT current_setting('server_version_num')::integer AS n")).rows[0].n;assert.ok(version>=170000&&version<180000);
  for(const relation of ['moderation.authenticity_beta','moderation.authenticity_beta_steps','moderation.authenticity_beta_feedback','media.upload_sessions','system.cost_budget_reservations']) {
    const fingerprint=await admin.query(`WITH resolved AS (SELECT to_regclass($1) AS relation_oid), contract AS (SELECT jsonb_build_object(
      'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=resolved.relation_oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname) FROM pg_constraint c WHERE c.conrelid=resolved.relation_oid),'[]'::jsonb),
      'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',r.relname,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY r.relname) FROM pg_index i JOIN pg_class r ON r.oid=i.indexrelid WHERE i.indrelid=resolved.relation_oid),'[]'::jsonb)) AS value FROM resolved)
      SELECT encode(digest(value::text,'sha256'),'hex') AS fingerprint FROM contract`,[relation]);
    console.log(JSON.stringify({relation,canonicalPostgres17Fingerprint:fingerprint.rows[0].fingerprint}));
  }
  await admin.query(`INSERT INTO identity.users(id,display_name) VALUES($1,'Protocol fixture owner'),($2,'Protocol fixture stranger')`,[owner,stranger]);
  assert.equal((await api('','POST',{...submission,trainingConsent:true})).status,400);
  assert.equal((await api('','GET',undefined,uuidv7())).status,404);
  assert.equal((await api('/http://169.254.169.254/latest/meta-data','POST',{})).status,404);
  const first=await create();await upload(first);
  assert.equal((await api(`/${first}`,'GET',undefined,stranger)).status,404);
  await processBetaEvent(env,uuidv7(),{caseId:first,revision:1});assert.equal(safeCalls,0);
  const e=await processCase(first);await processBetaEvent(env,e.id,e.payload);
  assert.deepEqual([safetyCalls,safeCalls,adviceCalls],[1,1,1]);
  const response=await api(`/${first}`);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const result=await response.json();assert.equal(result.finding,'SYNTHETIC_LIKE_EVIDENCE');assert.equal(result.publicationEligible,false);assert.equal(JSON.stringify(result).includes(SAFE_CHECKPOINT),false);
  assert.equal((await api(`/${first}/finalise`,'POST')).status,200);assert.equal(safeCalls,1);
  assert.equal((await api(`/${first}/review`,'POST',{message:'Please review the limitations.'})).status,202);
  const actor={userId:owner,role:'moderator'};
  const review=await handleAdminBeta(new Request(`https://admin.example.test/api/admin/authenticity/cases/${first}/review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Private review; inconclusive.'})}),env,actor);assert.equal(review.status,202);
  assert.equal((await (await api(`/${first}`)).json()).reviews.length,1);
  const denied=await handleAdminBeta(new Request('https://admin.example.test/api/admin/authenticity/cases'),env,{...actor,role:'support'});assert.equal(denied.status,403);
  const second=await create();await upload(second);
  const original=`beta-original/${owner}/${second}/1`;await bucket.put(original,new Uint8Array([1,2,3]));await processCase(second);assert.equal(safeCalls,1);
  assert.equal((await (await api(`/${second}`)).json()).status,'failed');
  await bucket.put(original,bytes);
  const retry=await handleAdminBeta(new Request(`https://admin.example.test/api/admin/authenticity/cases/${second}/retry`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Restore protocol fixture object.'})}),env,{...actor,role:'operations'});assert.equal(retry.status,202);
  safetyResult='REVIEW';await processCase(second);assert.equal(safeCalls,1);assert.equal((await (await api(`/${second}`)).json()).status,'safety_review');safetyResult='ALLOW';
  const third=await create();await upload(third);
  duringInference=async id=>assert.equal((await api(`/${id}`,'DELETE')).status,200);
  await processCase(third);assert.equal((await api(`/${third}`)).status,404);assert.equal(adviceCalls,1);
  const tombstone=(await admin.query(`SELECT result,revision,state FROM moderation.authenticity_beta WHERE case_id=$1`,[third])).rows[0];assert.equal(tombstone.result,null);assert.equal(tombstone.state,'deleted');assert.equal(tombstone.revision,2);
  await bucket.put(`quarantine/${owner}/${third}`,bytes);
  await purgeBetaMedia(env.DB_JOBS_FRESH,bucket,owner);assert.equal(bucket.objects.has(`quarantine/${owner}/${third}`),false);
  await admin.query(`UPDATE media.upload_sessions SET expires_at=now()-interval '20 minutes' WHERE id=$1`,[third]);await admin.query(`UPDATE moderation.authenticity_beta SET deleted_at=now()-interval '20 minutes' WHERE case_id=$1`,[third]);
  assert.equal(await purgeBetaMedia(env.DB_JOBS_FRESH,bucket,owner),0);
  assert.equal((await api('','POST',submission)).status,429);
  config.enabled=false;assert.equal((await api('','POST',submission)).status,503);assert.equal((await api(`/${first}`)).status,200);
  assert.equal((await api(`/${second}/cancel`,'POST')).status,200);
  const isolation=await admin.query(`SELECT (SELECT count(*) FROM feed.discovery_candidates) AS feed,(SELECT count(*) FROM trust.reputation_events WHERE subject_user_id=$1) AS reputation,(SELECT count(*) FROM trust.reward_redemptions WHERE user_id=$1) AS rewards`,[owner]);assert.equal(Number(isolation.rows[0].feed),0);assert.equal(Number(isolation.rows[0].reputation),0);assert.equal(Number(isolation.rows[0].rewards),0);
  console.log('PASS: PostgreSQL 17 beta admission, ownership, forged jobs, exact bytes, duplicate protection, Safety stop, persisted advice, private review, stale object, cancellation, late deletion, budget and kill switch. All provider outputs were explicit CI protocol fixtures; no detector performance claim.');
} finally {await admin.end();mock.restoreAll();}
