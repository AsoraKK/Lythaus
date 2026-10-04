import { query, type HyperdriveBinding } from './index.ts';
import { createSupportService, supportTransactions, type SupportTransaction } from './support-feedback.ts';
import { parseSupportServicePolicy } from './support-feedback-policy.ts';
import type { SupportAuthentication } from './support-feedback-auth.ts';

type Channel = 'member'|'owner';
type RuntimeService = ReturnType<typeof createSupportService>;

const MEMBER_ACCESS_SQL = `
  SELECT
    to_regclass('support.requests') IS NOT NULL AS requests,
    to_regclass('support.messages') IS NOT NULL AS messages,
    to_regclass('support.operation_refs') IS NOT NULL AS operation_refs,
    CASE WHEN to_regclass('support.requests') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.requests'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.requests'),'INSERT')
      AND has_table_privilege(current_user,to_regclass('support.requests'),'UPDATE') END AS request_access,
    CASE WHEN to_regclass('support.messages') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.messages'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.messages'),'INSERT') END AS message_access,
    CASE WHEN to_regclass('support.operation_refs') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.operation_refs'),'INSERT') END AS operation_ref_access`;

const OWNER_ACCESS_SQL = `
  SELECT
    to_regclass('support.requests') IS NOT NULL AS requests,
    to_regclass('support.messages') IS NOT NULL AS messages,
    to_regclass('support.notes') IS NOT NULL AS notes,
    to_regclass('support.evidence') IS NOT NULL AS evidence,
    to_regclass('support.decisions') IS NOT NULL AS decisions,
    to_regclass('support.operation_refs') IS NOT NULL AS operation_refs,
    CASE WHEN to_regclass('support.requests') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.requests'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.requests'),'UPDATE') END AS request_access,
    CASE WHEN to_regclass('support.messages') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.messages'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.messages'),'INSERT') END AS message_access,
    CASE WHEN to_regclass('support.notes') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.notes'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.notes'),'INSERT') END AS note_access,
    CASE WHEN to_regclass('support.evidence') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.evidence'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.evidence'),'INSERT') END AS evidence_access,
    CASE WHEN to_regclass('support.decisions') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.decisions'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.decisions'),'INSERT') END AS decision_access,
    CASE WHEN to_regclass('support.operation_refs') IS NULL THEN false ELSE has_table_privilege(current_user,to_regclass('support.operation_refs'),'INSERT') END AS operation_ref_access,
    COALESCE(has_function_privilege(current_user,to_regprocedure('support.lock_owner(bytea)'),'EXECUTE'),false) AS owner_lock,
    COALESCE(has_function_privilege(current_user,to_regprocedure('support.claim_owner_idempotency(uuid,text,text,text)'),'EXECUTE'),false) AS owner_idempotency_claim,
    COALESCE(has_function_privilege(current_user,to_regprocedure('support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid)'),'EXECUTE'),false) AS owner_idempotency_finish`;

function usable(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  return Object.values(row).every(value => value === true);
}

export async function supportFeedbackSchemaReady(binding: HyperdriveBinding, channel: Channel): Promise<boolean> {
  const result = await query<Record<string, unknown>>(binding,channel==='owner'?OWNER_ACCESS_SQL:MEMBER_ACCESS_SQL);
  return usable(result.rows[0]);
}

function decodedPolicy(value: unknown): unknown | null {
  if(typeof value!=='string'||value.length===0||new TextEncoder().encode(value).length>32*1024)return null;
  try {const parsed:unknown=JSON.parse(value);parseSupportServicePolicy(parsed);return parsed;} catch {return null;}
}

export async function createSupportFeedbackRuntime(input: {
  binding: HyperdriveBinding;
  policy: unknown;
  authentication: SupportAuthentication;
  channel: Channel;
  ready?: (binding: HyperdriveBinding,channel: Channel)=>Promise<boolean>;
}): Promise<RuntimeService|null> {
  const policy=decodedPolicy(input.policy);
  if(!policy)return null;
  try {
    const ready=await (input.ready??supportFeedbackSchemaReady)(input.binding,input.channel);
    if(!ready)return null;
    const runTransaction:SupportTransaction=supportTransactions(input.binding);
    return createSupportService({authentication:input.authentication,runTransaction,policy});
  } catch {return null;}
}
