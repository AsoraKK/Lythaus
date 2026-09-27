import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { uuidv7 } from '@lythaus/security';
import { BETA_POLICY, SAFE_THRESHOLD, authorBetaView, type BetaResult, type BetaState } from '../../../packages/authenticity/src/beta.ts';
import { readBetaConfig } from '../../../packages/authenticity/src/beta-config.ts';
import { readBoundedJson } from './request-body-policy.ts';
import type { AdminActor } from './admin-access-runtime-policy.ts';

type Env = EnvBindings & { DB_ADMIN_FRESH: HyperdriveBinding };
type Row = { case_id:string;owner_id:string;state:BetaState;revision:number;review_state:string;failure_code:string|null;result:BetaResult|null;created_at:Date;updated_at:Date;expires_at:Date };
const json = (value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const view = (row:Row)=>authorBetaView({id:row.case_id,state:row.state,reviewState:row.review_state,result:row.result,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),expiresAt:row.expires_at.toISOString()});

export async function handleAdminBeta(request:Request,env:Env,actor:AdminActor):Promise<Response>{
  try { return await routeAdminBeta(request,env,actor); } catch (error) {
    const code=error instanceof Error?error.message:'';
    return json({error:['beta_attempt_consumed','beta_retry_unavailable'].includes(code)?code:'beta_admin_unavailable'},['beta_attempt_consumed','beta_retry_unavailable'].includes(code)?409:503);
  }
}
async function routeAdminBeta(request:Request,env:Env,actor:AdminActor):Promise<Response>{
  if(!['owner','administrator','moderator','operations'].includes(actor.role)) return json({error:'admin_role_required'},403);
  const match=new URL(request.url).pathname.match(/^\/api\/admin\/authenticity\/cases(?:\/([a-f0-9-]{36})(?:\/(review|retry|image))?)?$/);
  if(!match) return json({error:'not_found'},404);
  const [,caseId,action]=match;
  if(!caseId && request.method==='GET') {
    await query(env.DB_ADMIN_FRESH,`INSERT INTO system.audit_events(id,actor_id,action,target_type,reason_code,correlation_id,metadata) VALUES($1,$2,'authenticity.beta.list','authenticity_case','ADMIN_ACCESS',$1::text,$3::jsonb)`,[uuidv7(),actor.userId,JSON.stringify({role:actor.role})]);
    const rows=await query<Row>(env.DB_ADMIN_FRESH,`SELECT * FROM moderation.authenticity_beta WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`);
    return json({items:rows.rows.map(view)});
  }
  const found=await query<Row>(env.DB_ADMIN_FRESH,`SELECT * FROM moderation.authenticity_beta WHERE case_id=$1 AND deleted_at IS NULL`,[caseId]);
  const row=found.rows[0]; if(!row) return json({error:'not_found'},404);
  if(request.method==='GET') {
    await query(env.DB_ADMIN_FRESH,`INSERT INTO system.audit_events(id,actor_id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,$2,'authenticity.beta.read','authenticity_case',$3,'ADMIN_ACCESS',$3::text,$4::jsonb)`,[uuidv7(),actor.userId,caseId,JSON.stringify({role:actor.role,view:action==='image'?'image':'diagnostics'})]);
    if(action==='image') {
      const display=await env.MEDIA_QUARANTINE?.get(`beta-display/${row.owner_id}/${row.case_id}.png`);
      if(!display) return json({error:'image_unavailable'},404);
      return new Response(display.body,{headers:{'content-type':'image/png','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
    }
    const feedback=await query(env.DB_ADMIN_FRESH,`SELECT id,kind,message,policy_version,ground_truth,training_consent,created_at FROM moderation.authenticity_beta_feedback WHERE case_id=$1 ORDER BY created_at LIMIT 100`,[caseId]);
    const safe=row.result?.safe;
    return json({...view(row),feedback:feedback.rows,diagnostics:{failureCode:row.failure_code,revision:row.revision,safe: safe?{status:safe.status,rawClassifierScore:safe.score,threshold:SAFE_THRESHOLD,checkpoint:safe.checkpoint,preprocessing:safe.preprocessing,preprocessingHash:safe.preprocessingHash,runtimeDigest:safe.runtimeDigest,timings:safe.timings}:null,advisory:row.result?.advisory??null,evidenceFamilies:row.result?.packet.evidenceFamilies??null}});
  }
  if(request.method!=='POST' || !['review','retry'].includes(action)) return json({error:'not_found'},404);
  const input=await readBoundedJson<{message?:unknown}>(request);
  const message=typeof input.message==='string'?input.message.trim():'';
  if(!message || message.length>2000) return json({error:'review_explanation_required'},400);
  if(action==='retry' && !['owner','administrator','operations'].includes(actor.role)) return json({error:'admin_role_required'},403);
  if(action==='retry') {
    const config=await readBetaConfig(env);
    if(!config.enabled || !config.allowlist.includes(row.owner_id)) return json({error:'beta_paused'},409);
  }
  await transaction(env.DB_ADMIN_FRESH,async client=>{
    const current=await client.query<Row>(`SELECT * FROM moderation.authenticity_beta WHERE case_id=$1 AND deleted_at IS NULL FOR UPDATE`,[caseId]);
    if(!current.rows[0]) throw new Error('moderation_case_not_found');
    if(action==='retry') {
      const consumed=await client.query(`SELECT id FROM moderation.authenticity_beta_steps WHERE case_id=$1 AND state<>'completed' LIMIT 1`,[caseId]);
      if(consumed.rowCount) throw new Error('beta_attempt_consumed');
      const changed=await client.query(`UPDATE moderation.authenticity_beta SET state='queued',failure_code=NULL,updated_at=now() WHERE case_id=$1 AND state IN ('paused','failed') AND attempts<3 AND expires_at>now() AND lease_token IS NULL RETURNING revision`,[caseId]);
      if(!changed.rowCount) throw new Error('beta_retry_unavailable');
      await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'moderation.authenticity_beta.requested','authenticity_case',$2,$3,$4::jsonb)`,[uuidv7(),caseId,row.owner_id,JSON.stringify({caseId,revision:changed.rows[0].revision})]);
    }else{
      await client.query(`INSERT INTO moderation.authenticity_beta_feedback(id,case_id,actor_id,kind,message,policy_version) VALUES($1,$2,$3,'review',$4,$5)`,[uuidv7(),caseId,actor.userId,message,BETA_POLICY]);
      await client.query(`UPDATE moderation.authenticity_beta SET review_state='reviewed',updated_at=now() WHERE case_id=$1`,[caseId]);
    }
    await client.query(`INSERT INTO system.audit_events(id,actor_id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,$2,$3,'authenticity_case',$4,'BETA_NON_ENFORCING',$4::text,$5::jsonb)`,[uuidv7(),actor.userId,`authenticity.beta.${action}`,caseId,JSON.stringify({role:actor.role,policyVersion:BETA_POLICY})]);
  });
  return json({accepted:true,publicationEligible:false},202);
}
