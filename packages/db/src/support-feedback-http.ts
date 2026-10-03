import { supportFailureCode, supportObject } from './support-feedback-policy.ts';
import type { SupportFeedbackKind } from '../../contracts/src/support-feedback.ts';

type Channel='member'|'owner';
type Service=Readonly<{
  supportOptions(request:Request,channel:Channel):Promise<unknown>;
  submit(request:Request,body:unknown):Promise<{replayed?:boolean}>;
  memberList(request:Request,kind:unknown,options:unknown):Promise<unknown>;
  ownerQueue(request:Request,kind:unknown,options:unknown):Promise<unknown>;
  memberDetail(request:Request,kind:unknown,id:unknown,options?:unknown):Promise<unknown>;
  ownerDetail(request:Request,kind:unknown,id:unknown,options?:unknown):Promise<unknown>;
  memberReply(request:Request,kind:unknown,id:unknown,body:unknown):Promise<{replayed?:boolean}>;
  ownerReply(request:Request,kind:unknown,id:unknown,body:unknown):Promise<{replayed?:boolean}>;
  ownerNote(request:Request,kind:unknown,id:unknown,body:unknown):Promise<{replayed?:boolean}>;
  ownerEvidence(request:Request,kind:unknown,id:unknown,body:unknown):Promise<{replayed?:boolean}>;
  ownerDecision(request:Request,kind:unknown,id:unknown,body:unknown):Promise<{replayed?:boolean}>;
}>;
type Respond=(body:Record<string,unknown>,status:number)=>Response;
type ReadBody=(request:Request,maximum:number)=>Promise<unknown>;
const ERRORS=new Set(['support_input_invalid','support_not_found','support_owner_required','support_authentication_required',
  'support_revision_conflict','support_idempotency_conflict','support_rate_limited','support_closed','support_evidence_required',
  'support_transition_invalid','support_policy_version_mismatch','support_feedback_submission_invalid','support_feedback_record_invalid',
  'support_privacy_invalid','support_privacy_held','support_policy_invalid','support_unavailable','invalid_json','request_too_large']);

function status(code:string):number {
  if(code==='invalid_json')return 400;
  if(code==='request_too_large')return 413;
  if(code==='support_authentication_required')return 401;
  if(code==='support_owner_required')return 403;
  if(code==='support_not_found')return 404;
  if(code==='support_rate_limited')return 429;
  if(code==='support_revision_conflict'||code==='support_idempotency_conflict'||code==='support_closed')return 409;
  if(code==='support_evidence_required'||code==='support_transition_invalid')return 422;
  if(code==='support_unavailable'||code==='support_policy_invalid'||code==='support_policy_version_mismatch')return 503;
  return 400;
}

function parseListOptions(url:URL):Record<string,unknown> {
  const limit=url.searchParams.get('limit');
  if(!limit||!/^\d{1,3}$/.test(limit))throw new Error('support_input_invalid');
  const cursor=url.searchParams.get('cursor');
  return {limit:Number(limit),...(cursor?{cursor}:{})};
}

function parseDetailOptions(url:URL,channel:Channel):Record<string,unknown> {
  const allowed=channel==='owner'?['messageBefore','noteBefore','evidenceBefore','decisionBefore']:['messageBefore'];
  const result:Record<string,unknown>={};
  for(const key of allowed){
    const value=url.searchParams.get(key);
    if(value!==null){if(!/^\d{1,10}$/.test(value))throw new Error('support_input_invalid');result[key]=Number(value);}
  }
  let unknown=false;
  url.searchParams.forEach((_value,key)=>{if(!allowed.includes(key))unknown=true;});
  if(unknown)throw new Error('support_input_invalid');
  return result;
}

function kind(value:string):SupportFeedbackKind {return value==='problems'?'problem':'suggestion';}
function pathKind(path:string,channel:Channel):{kind:SupportFeedbackKind|null;id:string|null;action:string|null;options:boolean}|null {
  const prefix=channel==='member'?'/api/support/':'/api/admin/support/';
  if(!path.startsWith(prefix))return null;
  const parts=path.slice(prefix.length).split('/');
  if(parts.length===1&&parts[0]==='options')return {kind:null,id:null,action:null,options:true};
  if(parts.length>3||!['problems','suggestions'].includes(parts[0]))return null;
  if(parts.length===1)return {kind:kind(parts[0]),id:null,action:null,options:false};
  if(parts.length===2&&parts[1])return {kind:kind(parts[0]),id:parts[1],action:null,options:false};
  if(parts.length===3&&parts[1]&&['messages','notes','evidence','decision'].includes(parts[2]))return {kind:kind(parts[0]),id:parts[1],action:parts[2],options:false};
  return null;
}

export function isSupportFeedbackPath(path:string,channel:Channel):boolean {
  return pathKind(path,channel)!==null;
}

export async function handleSupportFeedbackRequest(input:{request:Request;service:Service|null;channel:Channel;respond:Respond;readBody:ReadBody}):Promise<Response|null> {
  const url=new URL(input.request.url),route=pathKind(url.pathname,input.channel);
  if(!route)return null;
  const answer=(body:unknown,statusCode=200)=>input.respond(typeof body==='object'&&body!==null&&!Array.isArray(body)?body as Record<string,unknown>:{data:body},statusCode);
  try {
    if(!input.service)throw new Error('support_unavailable');
    if(route.options){
      if(input.request.method!=='GET')return answer({error:'method_not_allowed'},405);
      if(url.search)return answer({error:'support_input_invalid'},400);
      return answer(await input.service.supportOptions(input.request,input.channel));
    }
    if(!route.kind)throw new Error('support_input_invalid');
    if(route.id===null){
      if(input.request.method==='GET')return answer(input.channel==='member'
        ?await input.service.memberList(input.request,route.kind,parseListOptions(url))
        :await input.service.ownerQueue(input.request,route.kind,parseListOptions(url)));
      if(input.request.method==='POST'&&input.channel==='member'){
        const body=await input.readBody(input.request,32*1024),fields=supportObject(body);
        if(fields.kind!==route.kind)throw new Error('support_input_invalid');
        const result=await input.service.submit(input.request,fields);
        return answer(result,result.replayed?200:201);
      }
      return answer({error:'method_not_allowed'},405);
    }
    if(route.action===null&&input.request.method==='GET')return answer(input.channel==='member'
      ?await input.service.memberDetail(input.request,route.kind,route.id,parseDetailOptions(url,input.channel))
      :await input.service.ownerDetail(input.request,route.kind,route.id,parseDetailOptions(url,input.channel)));
    if(route.action!==null&&input.request.method==='POST'){
      const body=await input.readBody(input.request,32*1024);
      let result:{replayed?:boolean};
      if(route.action==='messages')result=input.channel==='member'
        ?await input.service.memberReply(input.request,route.kind,route.id,body)
        :await input.service.ownerReply(input.request,route.kind,route.id,body);
      else if(input.channel==='owner'&&route.action==='notes')result=await input.service.ownerNote(input.request,route.kind,route.id,body);
      else if(input.channel==='owner'&&route.action==='evidence')result=await input.service.ownerEvidence(input.request,route.kind,route.id,body);
      else if(input.channel==='owner'&&route.action==='decision')result=await input.service.ownerDecision(input.request,route.kind,route.id,body);
      else return answer({error:'not_found'},404);
      return answer(result,result.replayed?200:201);
    }
    return answer({error:'method_not_allowed'},405);
  } catch(error){
    const code=supportFailureCode(error,ERRORS,'support_unavailable');
    return answer({error:code},status(code));
  }
}
