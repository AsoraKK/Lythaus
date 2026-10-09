import type { DatabaseClient } from './index.ts';
import { supportUuid } from '../../contracts/src/account-support.ts';
import { projectMemberSupportRequest } from '../../contracts/src/support-feedback.ts';
import { parseSupportServicePolicy, supportFailureCode, supportObject } from './support-feedback-policy.ts';
import { supportEventProjection } from './support-feedback.ts';
import { lockSupportScrubParticipants, SUPPORT_REQUEST_HELD } from './support-feedback-contributor-privacy.ts';

const TIME = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const ERRORS=new Set(['support_privacy_invalid','support_privacy_held','support_policy_invalid','support_policy_version_mismatch','support_feedback_record_invalid']);
function uuid(value: unknown): string { if (!supportUuid(value)) throw new Error('support_privacy_invalid'); return value.toLowerCase(); }
async function privacySubject(client: DatabaseClient, requestId: unknown, requestType: 'export'|'delete', states: readonly string[]): Promise<string> {
  const request = await client.query('SELECT subject_id FROM privacy.requests WHERE id=$1 AND request_type=$2 AND state=ANY($3::text[]) FOR SHARE', [uuid(requestId),requestType,states]);
  if (!request.rows[0]) throw new Error('support_privacy_invalid');
  return request.rows[0].subject_id;
}
async function lockSubject(client: DatabaseClient, subject: string) {
  const account = await client.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE',[subject]);
  if (!account.rows[0]) throw new Error('support_privacy_invalid');
  const holds = await client.query('SELECT active FROM privacy.legal_holds WHERE subject_id=$1 FOR SHARE',[subject]);
  if (holds.rows.some(h=>h.active)) throw new Error('support_privacy_held');
}
async function scrub(client: DatabaseClient, ids: readonly string[], deleteAudit: boolean): Promise<number> {
  if (!ids.length) return 0;
  await lockSupportScrubParticipants(client, ids);
  await client.query('DELETE FROM support.messages WHERE request_id=ANY($1::uuid[])',[ids]);
  await client.query('DELETE FROM support.notes WHERE request_id=ANY($1::uuid[])',[ids]);
  await client.query('DELETE FROM support.decisions WHERE request_id=ANY($1::uuid[])',[ids]);
  await client.query('DELETE FROM support.evidence WHERE request_id=ANY($1::uuid[])',[ids]);
  await client.query(`DELETE FROM system.outbox_events e USING support.operation_refs r
    WHERE r.request_id=ANY($1::uuid[]) AND e.id=r.outbox_id AND e.event_type='support.workflow.changed' AND e.aggregate_id=r.request_id`,[ids]);
  await client.query(`DELETE FROM system.idempotency_keys k USING support.operation_refs r
    WHERE r.request_id=ANY($1::uuid[]) AND k.scope=r.idempotency_scope AND k.key=r.idempotency_key
      AND k.scope LIKE 'support:%' AND k.response->>'requestId'=r.request_id::text`,[ids]);
  if (deleteAudit) await client.query(`DELETE FROM system.audit_events e USING support.operation_refs r
    WHERE r.request_id=ANY($1::uuid[]) AND e.id=r.audit_id AND e.action LIKE 'support.%' AND e.metadata->>'requestId'=r.request_id::text`,[ids]);
  await client.query('DELETE FROM support.operation_refs WHERE request_id=ANY($1::uuid[])',[ids]);
  const result = await client.query(`UPDATE support.requests SET deleted_at=clock_timestamp(),submission=NULL,member_message=NULL,revision=revision+1,public_revision=revision+1,updated_at=clock_timestamp()
    WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL RETURNING id`,[ids]);
  return result.rowCount ?? 0;
}
async function purgeSupport(client: DatabaseClient, requestId: unknown, suppliedPolicy: unknown) {
  const p=parseSupportServicePolicy(suppliedPolicy),subject=await privacySubject(client,requestId,'delete',p.privacy.requestStates);
  await lockSubject(client,subject);
  const rows=await client.query('SELECT id FROM support.requests WHERE submitter_id=$1 AND deleted_at IS NULL ORDER BY id LIMIT $2 FOR UPDATE',[subject,p.privacy.batch]);
  const removed=await scrub(client,rows.rows.map(r=>r.id),p.privacy.deleteAudit);
  const remaining=await client.query('SELECT 1 FROM support.requests WHERE submitter_id=$1 AND deleted_at IS NULL LIMIT 1',[subject]);
  return Object.freeze({scrubbedRecords:removed,hasMore:Boolean(remaining.rowCount)});
}
async function retainSupport(client: DatabaseClient, suppliedPolicy: unknown) {
  const p=parseSupportServicePolicy(suppliedPolicy);
  const candidates=await client.query(`WITH next_subject AS (
    SELECT r.submitter_id FROM support.requests r WHERE r.deleted_at IS NULL AND r.closed_at IS NOT NULL
      AND r.closed_at < CURRENT_TIMESTAMP-$1*interval '1 second'
      AND NOT (${SUPPORT_REQUEST_HELD})
    ORDER BY r.closed_at,r.id LIMIT 1)
    SELECT r.id,r.submitter_id FROM support.requests r JOIN next_subject s ON s.submitter_id=r.submitter_id
    WHERE r.deleted_at IS NULL AND r.closed_at IS NOT NULL AND r.closed_at < CURRENT_TIMESTAMP-$1*interval '1 second'
      AND NOT (${SUPPORT_REQUEST_HELD})
    ORDER BY r.closed_at,r.id LIMIT $2`,[p.privacy.retentionSeconds,p.privacy.batch]);
  let scrubbedRecords=0;
  if(!candidates.rows.length)return Object.freeze({scrubbedRecords:0,heldRecords:0});
  try {await lockSubject(client,candidates.rows[0].submitter_id);} catch(error) {
    const code=supportFailureCode(error,ERRORS,'support_privacy_unavailable');
    if(code==='support_privacy_held')return Object.freeze({scrubbedRecords:0,heldRecords:candidates.rows.length});throw new Error(code);
  }
  for (const candidate of candidates.rows) {
    const current=await client.query(`SELECT id FROM support.requests WHERE id=$1 AND deleted_at IS NULL AND closed_at IS NOT NULL
      AND closed_at < CURRENT_TIMESTAMP-$2*interval '1 second' FOR UPDATE`,[candidate.id,p.privacy.retentionSeconds]);
    if(current.rows[0]) {
      try { scrubbedRecords+=await scrub(client,[candidate.id],p.privacy.deleteAudit); }
      catch (error) { if (supportFailureCode(error,ERRORS,'support_privacy_unavailable')==='support_privacy_held')
        return Object.freeze({scrubbedRecords,heldRecords:1}); throw error; }
    }
  }
  return Object.freeze({scrubbedRecords,heldRecords:0});
}
async function exportSupport(client: DatabaseClient, requestId: unknown, suppliedPolicy: unknown, afterId: unknown = null) {
  const p=parseSupportServicePolicy(suppliedPolicy),subject=await privacySubject(client,requestId,'export',p.privacy.requestStates);
  await client.query('SELECT id FROM identity.users WHERE id=$1 FOR SHARE',[subject]);
  const after=afterId===null?null:uuid(afterId);
  const rows=await client.query(`SELECT r.*,${TIME('r.created_at')} AS "createdAt",${TIME('r.updated_at')} AS "updatedAt"
    FROM support.requests r WHERE submitter_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,[subject,after,p.privacy.batch+1]);
  const items=[];
  for(const row of rows.rows.slice(0,p.privacy.batch)) {
    if(row.policy_version!==p.version)throw new Error('support_policy_version_mismatch');
    const request=projectMemberSupportRequest({...row.submission,id:row.id,submitterId:subject,revision:row.revision,state:row.state,
      createdAt:row.createdAt,updatedAt:row.updatedAt,memberMessage:row.member_message,closed:Boolean(row.closed_at)},subject,p.contract);
    const messages=await client.query(`SELECT id,author_role,body,revision,${TIME('created_at')} AS "createdAt" FROM support.messages WHERE request_id=$1 AND revision<=$3 ORDER BY revision LIMIT $2`,[row.id,p.limits.messages+1,row.revision]);
    const page=messages.rows.slice(0,p.limits.messages);
    items.push(Object.freeze({request,messages:Object.freeze(page.map(m=>Object.freeze({id:m.id,from:m.author_role,text:m.body,revision:m.revision,createdAt:m.createdAt}))),
      nextMessageCursor:messages.rows.length>p.limits.messages?page.at(-1)!.revision:null}));
  }
  return Object.freeze({items:Object.freeze(items),nextRequestCursor:rows.rows.length>p.privacy.batch?rows.rows[p.privacy.batch-1].id:null});
}
async function notificationCandidate(client: DatabaseClient, eventId: unknown, suppliedPolicy: unknown) {
  const p=parseSupportServicePolicy(suppliedPolicy);
  const event=await client.query(`SELECT payload FROM system.outbox_events WHERE id=$1 AND event_type='support.workflow.changed'`,[uuid(eventId)]);
  if(!event.rows[0])return null;
  const input=supportObject(event.rows[0].payload,['requestId','subjectId','kind','revision','state']);
  const row=await client.query(`SELECT r.* FROM support.requests r JOIN identity.users u ON u.id=r.submitter_id
    WHERE r.id=$1 AND r.submitter_id=$2 AND r.deleted_at IS NULL AND u.status='active' AND r.public_revision=$3 AND r.policy_version=$4
      AND NOT EXISTS(SELECT 1 FROM privacy.requests q WHERE q.subject_id=u.id AND q.request_type='delete' AND q.state=ANY($5::text[]))`,
  [uuid(input.requestId),uuid(input.subjectId),input.revision,p.version,p.privacy.requestStates]);
  if(!row.rows[0]||row.rows[0].kind!==input.kind||row.rows[0].state!==input.state)return null;
  return supportEventProjection({...row.rows[0],revision:row.rows[0].public_revision});
}
async function privacyGuard<T>(work: () => Promise<T>): Promise<T> {
  try {return await work();} catch(error) {
    throw new Error(supportFailureCode(error,ERRORS,'support_privacy_unavailable'));
  }
}
export const purgeSupportForPrivacy = (client:DatabaseClient,requestId:unknown,policy:unknown) => privacyGuard(()=>purgeSupport(client,requestId,policy));
export const retainSupportBatch = (client:DatabaseClient,policy:unknown) => privacyGuard(()=>retainSupport(client,policy));
export const exportSupportForPrivacy = (client:DatabaseClient,requestId:unknown,policy:unknown,afterId:unknown=null) => privacyGuard(()=>exportSupport(client,requestId,policy,afterId));
export const loadSupportNotificationCandidate = (client:DatabaseClient,eventId:unknown,policy:unknown) => privacyGuard(()=>notificationCandidate(client,eventId,policy));
export function exportSupportMessagesForPrivacy(client:DatabaseClient,requestId:unknown,ticketId:unknown,policy:unknown,afterRevision:unknown,throughRevision:unknown) {
  return privacyGuard(async()=>{
    const p=parseSupportServicePolicy(policy),subject=await privacySubject(client,requestId,'export',p.privacy.requestStates);
    await client.query('SELECT id FROM identity.users WHERE id=$1 FOR SHARE',[subject]);
    if(typeof afterRevision!=='number'||!Number.isSafeInteger(afterRevision)||afterRevision<1||typeof throughRevision!=='number'||!Number.isSafeInteger(throughRevision)||throughRevision<afterRevision)throw new Error('support_privacy_invalid');
    const rows=await client.query(`SELECT m.id,m.author_role,m.body,m.revision,${TIME('m.created_at')} AS "createdAt"
      FROM support.messages m JOIN support.requests r ON r.id=m.request_id WHERE r.id=$1 AND r.submitter_id=$2 AND r.deleted_at IS NULL
      AND m.revision>$3 AND m.revision<=$5 ORDER BY m.revision LIMIT $4`,[uuid(ticketId),subject,afterRevision,p.limits.messages+1,throughRevision]);
    const page=rows.rows.slice(0,p.limits.messages);
    return Object.freeze({items:Object.freeze(page.map(m=>Object.freeze({id:m.id,from:m.author_role,text:m.body,revision:m.revision,createdAt:m.createdAt}))),
      nextCursor:rows.rows.length>p.limits.messages?page.at(-1)!.revision:null});
  });
}
