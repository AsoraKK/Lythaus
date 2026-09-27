import { query, transaction, type HyperdriveBinding } from './index.ts';
import type { EnvBindings } from '../../cloudflare-env/src/index.ts';

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
