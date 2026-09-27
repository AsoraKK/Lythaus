import { query, transaction, type HyperdriveBinding } from './index.ts';
import type { EnvBindings } from '../../cloudflare-env/src/index.ts';

export async function reconcileBetaCost(binding: HyperdriveBinding, input: {caseId:string;actorId:string;evidenceSha256:string;billedCostUsd:number;attemptIds:string[];allChargesFinal:boolean}): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(input.evidenceSha256) || !Number.isFinite(input.billedCostUsd) || input.billedCostUsd < 0 || input.billedCostUsd > 1_000_000 || input.allChargesFinal !== true || !Array.isArray(input.attemptIds) || new Set(input.attemptIds).size !== input.attemptIds.length) throw new Error('beta_billing_evidence_required');
  await transaction(binding,async client=>{
    const role=await client.query<{allowed:boolean}>(`SELECT current_user='lythaus_admin' AS allowed`);
    if (!role.rows[0]?.allowed) throw new Error('beta_billing_admin_required');
    const row=await client.query<{case_id:string}>(`SELECT case_id FROM moderation.authenticity_beta WHERE case_id=$1 AND state='deleted' AND purged_at IS NOT NULL AND lease_token IS NULL FOR UPDATE`,[input.caseId]);
    if (!row.rowCount) throw new Error('beta_billing_work_or_storage_pending');
    const steps=await client.query<{id:string;state:string}>(`SELECT id,state FROM moderation.authenticity_beta_steps WHERE case_id=$1 ORDER BY id`,[input.caseId]);
    if (steps.rows.some(step=>step.state==='started') || JSON.stringify(steps.rows.map(step=>step.id)) !== JSON.stringify([...input.attemptIds].sort())) throw new Error('beta_billing_attempts_unaccounted');
    const reservation=await client.query<{id:string;period_key:string;status:string;actual_cost_usd:string|null;measurement:Record<string,unknown>|null}>(`SELECT id,period_key,status,actual_cost_usd,measurement FROM system.cost_budget_reservations WHERE operation='authenticity_beta_case' AND correlation_id=$1 FOR UPDATE`,[input.caseId]);
    const budget=reservation.rows[0];
    if (!budget || !['committed','reconciled'].includes(budget.status)) throw new Error('beta_billing_reservation_missing');
    if (budget.actual_cost_usd !== null) {
      if (Number(budget.actual_cost_usd)!==input.billedCostUsd || budget.measurement?.billingEvidenceSha256!==input.evidenceSha256) throw new Error('beta_billing_receipt_conflict');
      return;
    }
    await client.query(`INSERT INTO system.cost_usage_events(id,period_key,reservation_id,operation,provider,external_reference,amount_usd) VALUES($1,$2,$3,'authenticity_beta_case','beta-attributable-services',$4,$5)`,[crypto.randomUUID(),budget.period_key,budget.id,`beta-bill:${input.caseId}:${input.evidenceSha256}`,input.billedCostUsd]);
    await client.query(`UPDATE system.cost_budget_reservations SET status='reconciled',actual_cost_usd=$2,billing_state='billed',measurement=coalesce(measurement,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE id=$1`,[budget.id,input.billedCostUsd,JSON.stringify({billingEvidenceSha256:input.evidenceSha256,accountedAttempts:input.attemptIds.length,allChargesFinal:true})]);
    await client.query(`INSERT INTO system.audit_events(id,actor_id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,$2,'authenticity.beta.billing.reconciled','authenticity_case',$3,'FINAL_PROVIDER_BILLING',$3::uuid::text,$4::jsonb)`,[crypto.randomUUID(),input.actorId,input.caseId,JSON.stringify({evidenceSha256:input.evidenceSha256,billedCostUsd:input.billedCostUsd})]);
  });
}

export async function tombstoneBetaCases(binding: HyperdriveBinding, ownerId: string, caseId: string | null = null, olderThan: string | null = null): Promise<void> {
  await transaction(binding,async client=>{
    const hold = await client.query<{active:boolean}>(`SELECT privacy.beta_subject_has_hold($1) AS active`,[ownerId]);
    if (hold.rows[0]?.active !== false) throw new Error('beta_retention_hold');
    const cases = await client.query<{case_id:string}>(`UPDATE moderation.authenticity_beta SET state='deleted',revision=revision+1,deleted_at=now(),result=NULL,safety=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND ($2::uuid IS NULL OR case_id=$2) AND ($3::interval IS NULL OR created_at<now()-$3::interval) AND deleted_at IS NULL RETURNING case_id`,[ownerId,caseId,olderThan]);
    for(const row of cases.rows){
      await client.query(`UPDATE moderation.authenticity_beta_steps SET output=NULL,usage=NULL WHERE case_id=$1`,[row.case_id]);
      await client.query(`DELETE FROM moderation.authenticity_beta_feedback WHERE case_id=$1`,[row.case_id]);
      await client.query(`UPDATE moderation.detector_runs SET signal='{"deleted":true}'::jsonb WHERE content_type='image' AND content_id=$1 AND provider='lythaus-safe-container'`,[row.case_id]);
      await client.query(`UPDATE media.upload_sessions SET status='expired' WHERE id=$1`,[row.case_id]);
      await client.query(`UPDATE media.objects SET state='deleted',deleted_at=now() WHERE id=$1`,[row.case_id]);
      await client.query(`UPDATE moderation.cases SET state='superseded',resolved_at=now() WHERE id=$1`,[row.case_id]);
    }
  });
}

export async function purgeBetaMedia(binding: HyperdriveBinding, bucket: EnvBindings['MEDIA_QUARANTINE'], ownerId: string | null = null): Promise<number> {
  if (!bucket) throw new Error('beta_purge_unavailable');
  const cases=await query<{case_id:string;owner_id:string;original_key:string;object_id:string|null;expected_bytes:string}>(binding,`SELECT b.case_id,b.owner_id,b.original_key,b.object_id,s.expected_bytes FROM moderation.authenticity_beta b JOIN media.upload_sessions s ON s.id=b.upload_session_id WHERE b.deleted_at IS NOT NULL AND b.purged_at IS NULL AND ($1::uuid IS NULL OR b.owner_id=$1) ORDER BY b.deleted_at LIMIT 50`,[ownerId]);
  for(const row of cases.rows){
    await bucket.delete([row.original_key,`quarantine/${row.owner_id}/${row.case_id}`,`beta-display/${row.owner_id}/${row.case_id}.png`]);
    await transaction(binding,async client=>{
      const changed=await client.query<{storage_reserved_bytes:string;display_bytes:string}>(`UPDATE moderation.authenticity_beta b SET purged_at=now() WHERE b.case_id=$1 AND b.purged_at IS NULL AND b.deleted_at<now()-interval '5 minutes' AND EXISTS(SELECT 1 FROM media.upload_sessions s WHERE s.id=b.upload_session_id AND s.expires_at<now()-interval '5 minutes') RETURNING storage_reserved_bytes,display_bytes`,[row.case_id]);
      if(changed.rowCount) {
        await client.query(`UPDATE media.storage_ledger SET bytes_reserved=greatest(0,bytes_reserved-$2),bytes_approved=greatest(0,bytes_approved-$3),object_count=greatest(0,object_count-$4),last_reconciled_at=now() WHERE user_id=$1`,[row.owner_id,Number(changed.rows[0].storage_reserved_bytes),Number(changed.rows[0].display_bytes)+(row.object_id?Number(row.expected_bytes):0),row.object_id?1:0]);
        await client.query(`SELECT privacy.remove_beta_location($1,$2)`,[row.owner_id,row.case_id]);
      }
    });
  }
  const pending=await query<{count:string}>(binding,`SELECT count(*)::text AS count FROM moderation.authenticity_beta WHERE deleted_at IS NOT NULL AND purged_at IS NULL AND ($1::uuid IS NULL OR owner_id=$1)`,[ownerId]);
  return Number(pending.rows[0].count);
}
