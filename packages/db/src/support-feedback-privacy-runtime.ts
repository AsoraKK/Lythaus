import { query, type HyperdriveBinding } from './index.ts';

const PRIVACY_ACCESS_SQL = `
  SELECT
    to_regclass('support.requests') IS NOT NULL AS requests,
    to_regclass('support.messages') IS NOT NULL AS messages,
    to_regclass('support.notes') IS NOT NULL AS notes,
    to_regclass('support.evidence') IS NOT NULL AS evidence,
    to_regclass('support.decisions') IS NOT NULL AS decisions,
    to_regclass('support.operation_refs') IS NOT NULL AS operation_refs,
    to_regclass('privacy.requests') IS NOT NULL AS privacy_requests,
    to_regclass('privacy.legal_holds') IS NOT NULL AS legal_holds,
    to_regclass('identity.users') IS NOT NULL AS identity_users,
    to_regclass('system.audit_events') IS NOT NULL AS audit_events,
    to_regclass('system.outbox_events') IS NOT NULL AS outbox_events,
    to_regclass('system.idempotency_keys') IS NOT NULL AS idempotency_keys,
    CASE WHEN to_regclass('support.requests') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.requests'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.requests'),'UPDATE')
      AND has_table_privilege(current_user,to_regclass('support.requests'),'DELETE') END AS request_access,
    CASE WHEN to_regclass('support.messages') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.messages'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.messages'),'DELETE') END AS message_access,
    CASE WHEN to_regclass('support.notes') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.notes'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.notes'),'DELETE') END AS note_access,
    CASE WHEN to_regclass('support.evidence') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.evidence'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.evidence'),'DELETE') END AS evidence_access,
    CASE WHEN to_regclass('support.decisions') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.decisions'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.decisions'),'DELETE') END AS decision_access,
    CASE WHEN to_regclass('support.operation_refs') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('support.operation_refs'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('support.operation_refs'),'DELETE') END AS operation_ref_access,
    CASE WHEN to_regclass('privacy.requests') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('privacy.requests'),'SELECT') END AS privacy_request_access,
    CASE WHEN to_regclass('privacy.legal_holds') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('privacy.legal_holds'),'SELECT') END AS legal_hold_access,
    CASE WHEN to_regclass('identity.users') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('identity.users'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('identity.users'),'UPDATE') END AS identity_user_lock_access,
    CASE WHEN to_regclass('system.audit_events') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('system.audit_events'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('system.audit_events'),'DELETE') END AS audit_delete_access,
    CASE WHEN to_regclass('system.outbox_events') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('system.outbox_events'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('system.outbox_events'),'DELETE') END AS outbox_delete_access,
    CASE WHEN to_regclass('system.idempotency_keys') IS NULL THEN false ELSE
      has_table_privilege(current_user,to_regclass('system.idempotency_keys'),'SELECT')
      AND has_table_privilege(current_user,to_regclass('system.idempotency_keys'),'DELETE') END AS idempotency_delete_access`;

export type SupportFeedbackPrivacySchemaState = 'absent' | 'ready' | 'incomplete' | 'unavailable';

export async function supportFeedbackPrivacySchemaState(binding: HyperdriveBinding): Promise<SupportFeedbackPrivacySchemaState> {
  try {
    const result = await query<Record<string, unknown>>(binding, PRIVACY_ACCESS_SQL);
    const row = result.rows[0];
    if (!row) return 'unavailable';
    const supportTables = [row.requests, row.messages, row.notes, row.evidence, row.decisions, row.operation_refs];
    if (supportTables.every(value => value === false)) return 'absent';
    return Object.values(row).every(value => value === true) ? 'ready' : 'incomplete';
  } catch {
    return 'unavailable';
  }
}

export async function supportFeedbackPrivacyIsReady(binding: HyperdriveBinding): Promise<boolean> {
  const state = await supportFeedbackPrivacySchemaState(binding);
  if (state === 'absent') return false;
  if (state !== 'ready') throw new Error('support_privacy_schema_unavailable');
  return true;
}
