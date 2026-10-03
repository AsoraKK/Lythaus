import { transaction, type DatabaseClient, type HyperdriveBinding } from './index.ts';
import { uuidv7 } from '../../security/src/index.ts';
import { isCurrentActivePrincipal } from '../../../apps/lythaus-public-api/src/auth-runtime-policy.ts';
import { supportTimestamp, supportUuid } from '../../contracts/src/account-support.ts';
import { parseSupportSubmission, projectMemberSupportRequest, projectOwnerSupportRequest, type SupportFeedbackKind } from '../../contracts/src/support-feedback.ts';
import { parseSupportServicePolicy, supportArray, supportObject, supportText } from './support-feedback-policy.ts';
import type { SupportAuthentication } from './support-feedback-auth.ts';

export type SupportTransaction = <T>(work: (client: DatabaseClient) => Promise<T>) => Promise<T>;
export function supportTransactions(binding: HyperdriveBinding): SupportTransaction { return work => transaction(binding, work); }
const TIME = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const COLUMNS = `r.*, ${TIME('r.created_at')} AS "createdAt", ${TIME('r.updated_at')} AS "updatedAt"`;
const EXPECTED = new Set(['support_input_invalid','support_not_found','support_owner_required','support_authentication_required',
  'support_revision_conflict','support_idempotency_conflict','support_rate_limited','support_closed','support_evidence_required',
  'support_transition_invalid','support_policy_version_mismatch','support_feedback_submission_invalid','support_feedback_record_invalid']);
type Row = Record<string, any>;
function id(value: unknown): string { if (!supportUuid(value)) throw new Error('support_input_invalid'); return value.toLowerCase(); }
function kind(value: unknown): SupportFeedbackKind { if (value !== 'problem' && value !== 'suggestion') throw new Error('support_input_invalid'); return value; }
function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('support_input_invalid'); return value;
}
async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
}
export function supportEventProjection(row: Row) {
  if (typeof row.state !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(row.state)) throw new Error('support_input_invalid');
  return Object.freeze({ requestId: id(row.id), subjectId: id(row.submitter_id), kind: kind(row.kind), revision: integer(row.revision), state: row.state as string });
}

export function createSupportService(dependencies: { authentication: SupportAuthentication; runTransaction: SupportTransaction; policy: unknown }) {
  const p = parseSupportServicePolicy(dependencies.policy);
  async function run<T>(request: Request, channel: 'member' | 'owner', work: (client: DatabaseClient, actor: string) => Promise<T>): Promise<T> {
    try {
      const proof = channel === 'member' ? await dependencies.authentication.member(request) : await dependencies.authentication.owner(request);
      return await dependencies.runTransaction(async client => {
        let actor: string;
        if (channel === 'owner') {
          if (typeof proof !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(proof)) throw new Error('support_owner_required');
          const found = await client.query('SELECT support.lock_owner(decode($1,\'base64\')) AS id', [proof]);
          if (!supportUuid(found.rows[0]?.id)) throw new Error('support_owner_required'); actor = found.rows[0].id;
        } else {
          if (typeof proof === 'string') throw new Error('support_authentication_required');
          actor = id(proof.userId);
          const account = await client.query('SELECT status,token_version FROM identity.users WHERE id=$1 FOR SHARE', [actor]);
          if (!isCurrentActivePrincipal(account.rows[0], proof.tokenVersion)) throw new Error('support_authentication_required');
          const deletion = await client.query("SELECT 1 FROM privacy.requests WHERE subject_id=$1 AND request_type='delete' AND state=ANY($2::text[]) LIMIT 1",[actor,p.privacy.requestStates]);
          if(deletion.rowCount)throw new Error('support_authentication_required');
        }
        return work(client, actor);
      });
    } catch (error) { throw new Error(error instanceof Error && EXPECTED.has(error.message) ? error.message : 'support_unavailable'); }
  }
  async function audit(client: DatabaseClient, actor: string, operation: string, row: Row | null, channel: 'member'|'owner', extra: Record<string, unknown> = {}, refs?: {outboxId: string|null;scope: string;key: string}) {
    const metadata = { actorId: actor, ...(row ? supportEventProjection(row) : {}), policyVersion: p.version, ...extra };
    const eventId = uuidv7();
    if (channel === 'member') {
      await client.query(`INSERT INTO system.audit_events(id,action,reason_code,correlation_id,metadata) VALUES($1,$2,'SUPPORT_OPERATION',$1::uuid::text,$3::jsonb)`,
        [eventId, `support.${operation}`, JSON.stringify(metadata)]);
    } else {
      await client.query(`INSERT INTO system.audit_events(id,actor_id,action,target_type,target_id,reason_code,correlation_id,metadata)
        VALUES($1,$2,$3,'support_request',$4,'SUPPORT_OPERATION',$1::uuid::text,$5::jsonb)`, [eventId,actor,`support.${operation}`,row?.id ?? null,JSON.stringify(metadata)]);
    }
    if(row)await client.query('INSERT INTO support.operation_refs(audit_id,request_id,outbox_id,idempotency_scope,idempotency_key) VALUES($1,$2,$3,$4,$5)',[eventId,row.id,refs?.outboxId??null,refs?.scope??null,refs?.key??null]);
  }
  async function load(client: DatabaseClient, actor: string, channel: 'member'|'owner', requestKind: unknown, requestId: unknown, lock = false): Promise<Row> {
    const k = kind(requestKind), requestKey = id(requestId);
    const subject = await client.query(`SELECT submitter_id FROM support.requests WHERE id=$1 AND kind=$2 AND deleted_at IS NULL
      AND ($3::uuid IS NULL OR submitter_id=$3)`, [requestKey,k,channel === 'member' ? actor : null]);
    if (!subject.rows[0]) throw new Error('support_not_found');
    const user = await client.query("SELECT id FROM identity.users WHERE id=$1 AND status <> 'deleted' FOR SHARE", [subject.rows[0].submitter_id]);
    if (!user.rows[0]) throw new Error('support_not_found');
    const found = await client.query(`SELECT ${COLUMNS} FROM support.requests r WHERE r.id=$1 AND r.kind=$2 AND r.deleted_at IS NULL
      AND ($3::uuid IS NULL OR r.submitter_id=$3) ${lock ? 'FOR UPDATE OF r' : ''}`, [requestKey,k,channel === 'member' ? actor : null]);
    if (!found.rows[0]) throw new Error('support_not_found');
    if (found.rows[0].policy_version !== p.version) throw new Error('support_policy_version_mismatch');
    return found.rows[0];
  }
  function projection(row: Row, actor: string, channel: 'member'|'owner') {
    if (row.policy_version !== p.version) throw new Error('support_policy_version_mismatch');
    const input = { ...row.submission, id: row.id, submitterId: row.submitter_id, revision: row.revision, state: row.state,
      createdAt: row.createdAt, updatedAt: row.updatedAt, memberMessage: row.member_message };
    return channel === 'member' ? projectMemberSupportRequest(input, actor, p.contract) : projectOwnerSupportRequest(input, p.contract);
  }
  async function rate(client: DatabaseClient, actor: string, channel: 'member'|'owner') {
    const result = await client.query(`INSERT INTO system.rate_limit_windows(scope,subject_hash,window_started_at,request_count,expires_at)
      VALUES($1,$2,to_timestamp(floor(extract(epoch FROM clock_timestamp())/$3)*$3),1,clock_timestamp()+$3*interval '1 second')
      ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE SET request_count=system.rate_limit_windows.request_count+1
      WHERE system.rate_limit_windows.request_count < $4 RETURNING request_count`,
    [`support:${channel}`,await digest(actor),p.limits.rateWindowSeconds,channel === 'member' ? p.limits.memberMutations : p.limits.ownerMutations]);
    if (result.rowCount !== 1) throw new Error('support_rate_limited');
  }
  async function mutate(request: Request, channel: 'member'|'owner', requestKind: unknown, requestId: unknown, operation: string, parse: () => Row,
    work: (client: DatabaseClient, actor: string, input: Row, row: Row | null) => Promise<{ row: Row; recordId?: string }>) {
    return run(request,channel,async (client,actor) => {
      const input = parse(), k = kind(requestKind ?? input.kind), requestKey = requestId === null ? null : id(requestId);
      const key = request.headers.get('idempotency-key');
      if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new Error('support_input_invalid');
      const scope = `support:${channel}:${actor}:${operation}`, hash = await digest(JSON.stringify({ kind:k,id:requestKey,input }));
      let stored: Row;
      if(channel==='owner')stored=(await client.query('SELECT support.claim_owner_idempotency($1,$2,$3,$4) AS response',[actor,operation,key,hash])).rows[0]?.response;
      else {
        await client.query(`INSERT INTO system.idempotency_keys(scope,key,actor_id,response) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,[scope,key,actor,JSON.stringify({hash})]);
        stored=(await client.query('SELECT response FROM system.idempotency_keys WHERE scope=$1 AND key=$2 AND actor_id=$3 FOR UPDATE',[scope,key,actor])).rows[0]?.response;
      }
      if (!stored || stored.hash !== hash) throw new Error('support_idempotency_conflict');
      if (stored.requestId) {
        const row = await load(client,actor,channel,k,stored.requestId);
        return Object.freeze({ request: projection(row,actor,channel), recordId: stored.recordId ?? null, replayed: true });
      }
      const row = requestKey ? await load(client,actor,channel,k,requestKey,true) : null;
      if (row && integer(input.expectedRevision) !== row.revision) throw new Error('support_revision_conflict');
      await rate(client,actor,channel);
      const changed = await work(client,actor,input,row);
      const outboxId=['note','evidence'].includes(operation)?null:uuidv7();
      await audit(client,actor,operation,changed.row,channel,{}, {outboxId,scope,key});
      if (outboxId) {
        await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload)
          VALUES($1,'support.workflow.changed','support_request',$2,$3,$4::jsonb)`,[outboxId,changed.row.id,actor,JSON.stringify(supportEventProjection(changed.row))]);
      }
      if(channel==='owner')await client.query('SELECT support.finish_owner_idempotency($1,$2,$3,$4,$5,$6,$7)',[actor,operation,key,hash,changed.row.id,changed.row.revision,changed.recordId??null]);
      else await client.query(`UPDATE system.idempotency_keys SET response=$3::jsonb WHERE scope=$1 AND key=$2`,[scope,key,JSON.stringify({hash,requestId:changed.row.id,revision:changed.row.revision,recordId:changed.recordId ?? null})]);
      return Object.freeze({ request: projection(changed.row,actor,channel), recordId: changed.recordId ?? null, replayed: false });
    });
  }
  async function update(client: DatabaseClient, row: Row, state: string = row.state, memberMessage: string | null = row.member_message, terminal: boolean = Boolean(row.closed_at), publicChange = true): Promise<Row> {
    const updated = await client.query(`UPDATE support.requests r SET revision=revision+1,state=$2,member_message=$3,
      public_revision=CASE WHEN $6 THEN revision+1 ELSE public_revision END,
      closed_at=CASE WHEN $4 THEN coalesce(closed_at,clock_timestamp()) ELSE NULL END,updated_at=clock_timestamp()
      WHERE id=$1 AND revision=$5 AND deleted_at IS NULL RETURNING ${COLUMNS}`,[row.id,state,memberMessage,terminal,row.revision,publicChange]);
    if (updated.rowCount !== 1) throw new Error('support_revision_conflict'); return updated.rows[0];
  }
  async function reply(request: Request, channel: 'member'|'owner', k: unknown, requestId: unknown, body: unknown) {
    return mutate(request,channel,k,requestId,'reply',() => {
      const b=supportObject(body,['expectedRevision','message']); return { expectedRevision:integer(b.expectedRevision),message:supportText(b.message,p.limits.messageBytes) };
    },async (client,actor,input,row) => {
      if (row!.closed_at) throw new Error('support_closed');
      const changed=await update(client,row!,row!.state,channel === 'owner' ? supportText(input.message,p.contract.limits.memberMessageBytes) : row!.member_message);
      const recordId=uuidv7();
      await client.query(`INSERT INTO support.messages(id,request_id,author_id,author_role,body,revision) VALUES($1,$2,$3,$4,$5,$6)`,[recordId,changed.id,actor,channel,input.message,changed.revision]);
      return {row:changed,recordId};
    });
  }
  async function detail(request: Request, channel: 'member'|'owner', k: unknown, requestId: unknown, options: unknown = {}) {
    return run(request,channel,async (client,actor) => {
      const input=supportObject(options,channel === 'owner' ? ['messageBefore','noteBefore','evidenceBefore','decisionBefore'] : ['messageBefore']);
      const row=await load(client,actor,channel,k,requestId);
      const page=async (table: 'messages'|'notes'|'evidence'|'decisions',before: unknown, maximum: number) => {
        const result=await client.query(`SELECT *,${TIME('created_at')} AS "createdAt" FROM support.${table} WHERE request_id=$1 AND ($2::int IS NULL OR revision<$2) AND revision<=$4 ORDER BY revision DESC LIMIT $3`,[row.id,before===undefined?null:integer(before),maximum+1,row.revision]);
        return {items:result.rows.slice(0,maximum),next:result.rows.length>maximum?result.rows[maximum-1].revision:null};
      };
      const messages=await page('messages',input.messageBefore,p.limits.messages);
      const publicMessages=Object.freeze(messages.items.map(m=>Object.freeze({id:m.id,from:m.author_role,text:m.body,revision:m.revision,createdAt:supportTimestamp(m.createdAt)})));
      if (channel === 'member') return Object.freeze({request:projection(row,actor,channel),messages:publicMessages,nextMessageCursor:messages.next});
      const notes=await page('notes',input.noteBefore,p.limits.privateItems),evidence=await page('evidence',input.evidenceBefore,p.limits.privateItems),decisions=await page('decisions',input.decisionBefore,p.limits.privateItems);
      await audit(client,actor,'owner.detail',row,channel);
      return Object.freeze({request:projection(row,actor,channel),messages:publicMessages,nextMessageCursor:messages.next,
        private: Object.freeze({notes:Object.freeze(notes.items.map(n=>Object.freeze({id:n.id,text:n.body,revision:n.revision,createdAt:n.createdAt}))),nextNoteCursor:notes.next,
          evidence:Object.freeze(evidence.items.map(e=>Object.freeze({id:e.id,type:e.evidence_type,description:e.description,reference:e.reference,revision:e.revision,createdAt:e.createdAt}))),nextEvidenceCursor:evidence.next,
          decisions:Object.freeze(decisions.items.map(d=>Object.freeze({id:d.id,fromState:d.from_state,toState:d.to_state,reason:d.reason_code,evidenceIds:Object.freeze([...d.evidence_ids]),policyVersion:d.policy_version,revision:d.revision,createdAt:d.createdAt}))),nextDecisionCursor:decisions.next})});
    });
  }
  async function list(request: Request,channel: 'member'|'owner',requestKind: unknown,options: unknown) {
    return run(request,channel,async (client,actor) => {
      const k=kind(requestKind),input=supportObject(options,['limit','cursor']),limit=integer(input.limit,p.limits.page),scope=`${channel}:${actor}:${k}`;
      let cursor: Row|null=null;
      if (input.cursor !== undefined) {
        if (typeof input.cursor !== 'string' || input.cursor.length>2048 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error('support_input_invalid');
        try {cursor=supportObject(JSON.parse(atob(input.cursor.replaceAll('-','+').replaceAll('_','/'))),['scope','snapshot','createdAt','id']);
          if(cursor.scope!==scope)throw new Error(); cursor={scope,snapshot:supportTimestamp(cursor.snapshot),createdAt:supportTimestamp(cursor.createdAt),id:id(cursor.id)};
        } catch {throw new Error('support_input_invalid');}
      }
      const snapshot=cursor?.snapshot ?? (await client.query(`SELECT ${TIME('clock_timestamp()')} AS time`)).rows[0].time;
      const result=await client.query(`SELECT ${COLUMNS} FROM support.requests r JOIN identity.users u ON u.id=r.submitter_id
        WHERE r.kind=$1 AND r.deleted_at IS NULL AND u.status <> 'deleted' AND ($2::uuid IS NULL OR r.submitter_id=$2)
        AND r.created_at<=$3::timestamptz AND ($4::timestamptz IS NULL OR (r.created_at,r.id)<($4::timestamptz,$5::uuid))
        ORDER BY r.created_at DESC,r.id DESC LIMIT $6`,[k,channel==='member'?actor:null,snapshot,cursor?.createdAt ?? null,cursor?.id ?? null,limit+1]);
      const rows=result.rows.slice(0,limit),tail=rows.at(-1);
      const nextCursor=result.rows.length>limit&&tail?btoa(JSON.stringify({scope,snapshot,createdAt:tail.createdAt,id:tail.id})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,''):null;
      const items=Object.freeze(rows.map(row=>projection(row,actor,channel)));
      if(channel==='owner')await audit(client,actor,'owner.queue',null,channel,{kind:k,returnedRowCount:items.length,limit,hasCursor:Boolean(cursor)});
      return Object.freeze({items,nextCursor,snapshotAt:snapshot});
    });
  }
  return Object.freeze({
    submit(request: Request,body: unknown) {
        return mutate(request,'member',null,null,'submit',()=>parseSupportSubmission(body,p.contract),async(client,actor,input)=>{
          const inserted=await client.query(`INSERT INTO support.requests AS r(id,submitter_id,kind,submission,revision,state,policy_version)
            VALUES($1,$2,$3,$4::jsonb,1,$5,$6) RETURNING ${COLUMNS}`,[uuidv7(),actor,input.kind,JSON.stringify(input),p.initial[input.kind as SupportFeedbackKind],p.version]);
          return {row:inserted.rows[0]};
        });
    },
    memberList:(request:Request,k:unknown,options:unknown)=>list(request,'member',k,options),
    ownerQueue:(request:Request,k:unknown,options:unknown)=>list(request,'owner',k,options),
    memberDetail:(request:Request,k:unknown,requestId:unknown,options?:unknown)=>detail(request,'member',k,requestId,options),
    ownerDetail:(request:Request,k:unknown,requestId:unknown,options?:unknown)=>detail(request,'owner',k,requestId,options),
    memberReply:(request:Request,k:unknown,requestId:unknown,body:unknown)=>reply(request,'member',k,requestId,body),
    ownerReply:(request:Request,k:unknown,requestId:unknown,body:unknown)=>reply(request,'owner',k,requestId,body),
    ownerNote(request:Request,k:unknown,requestId:unknown,body:unknown) {
      return mutate(request,'owner',k,requestId,'note',()=>{const b=supportObject(body,['expectedRevision','text']);return {expectedRevision:integer(b.expectedRevision),text:supportText(b.text,p.limits.noteBytes)};},async(client,actor,input,row)=>{
        const changed=await update(client,row!,row!.state,row!.member_message,Boolean(row!.closed_at),false),recordId=uuidv7();
        await client.query('INSERT INTO support.notes(id,request_id,author_id,body,revision) VALUES($1,$2,$3,$4,$5)',[recordId,changed.id,actor,input.text,changed.revision]);return {row:changed,recordId};
      });
    },
    ownerEvidence(request:Request,k:unknown,requestId:unknown,body:unknown) {
      return mutate(request,'owner',k,requestId,'evidence',()=>{const b=supportObject(body,['expectedRevision','type','description','reference']);
        if(typeof b.type!=='string'||!p.evidenceTypes.includes(b.type))throw new Error('support_input_invalid');
        return {expectedRevision:integer(b.expectedRevision),type:b.type,description:supportText(b.description,p.limits.evidenceBytes),reference:b.reference===undefined?null:supportText(b.reference,p.limits.referenceBytes)};
      },async(client,actor,input,row)=>{const changed=await update(client,row!,row!.state,row!.member_message,Boolean(row!.closed_at),false),recordId=uuidv7();
        await client.query('INSERT INTO support.evidence(id,request_id,author_id,evidence_type,description,reference,revision) VALUES($1,$2,$3,$4,$5,$6,$7)',[recordId,changed.id,actor,input.type,input.description,input.reference,changed.revision]);return {row:changed,recordId};});
    },
    ownerDecision(request:Request,k:unknown,requestId:unknown,body:unknown) {
      return mutate(request,'owner',k,requestId,'decision',()=>{const b=supportObject(body,['expectedRevision','state','reason','memberMessage','evidenceIds']);
        const evidenceIds=supportArray(b.evidenceIds,p.limits.privateItems).map(id).sort();if(new Set(evidenceIds).size!==evidenceIds.length)throw new Error('support_input_invalid');
        return {expectedRevision:integer(b.expectedRevision),state:b.state,reason:b.reason,memberMessage:supportText(b.memberMessage,p.contract.limits.memberMessageBytes),evidenceIds};
      },async(client,actor,input,row)=>{
        const transition=p.transitions.find(t=>t.kind===row!.kind&&t.from===row!.state&&t.to===input.state&&t.reasons.includes(input.reason));
        if(!transition)throw new Error('support_transition_invalid');
        const evidence=await client.query('SELECT evidence_type FROM support.evidence WHERE request_id=$1 AND id=ANY($2::uuid[])',[row!.id,input.evidenceIds]);
        if(evidence.rowCount!==input.evidenceIds.length||transition.evidenceTypes.some(t=>!evidence.rows.some(e=>e.evidence_type===t)))throw new Error('support_evidence_required');
        const changed=await update(client,row!,transition.to,input.memberMessage,transition.terminal),recordId=uuidv7();
        await client.query(`INSERT INTO support.decisions(id,request_id,actor_id,from_state,to_state,reason_code,evidence_ids,policy_version,revision)
          VALUES($1,$2,$3,$4,$5,$6,$7::uuid[],$8,$9)`,[recordId,changed.id,actor,row!.state,transition.to,input.reason,input.evidenceIds,p.version,changed.revision]);
        await client.query('INSERT INTO support.messages(id,request_id,author_id,author_role,body,revision) VALUES($1,$2,$3,\'owner\',$4,$5)',[uuidv7(),changed.id,actor,input.memberMessage,changed.revision]);
        return {row:changed,recordId};
      });
    },
  });
}
