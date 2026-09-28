import { query, transaction, type HyperdriveBinding } from './index.ts';

export type AlphaPurgeBucket = {
  delete(keys: string | string[]): Promise<void>;
};

export type AlphaPurgeState = 'not_requested' | 'pending' | 'completed' | 'blocked';
export type AlphaTerminalState = 'cancelled' | 'deleted' | 'expired';

type AlphaPurgeRow = {
  case_id: string;
  owner_id: string;
  state: string;
  object_id: string | null;
  upload_session_id: string | null;
  original_key: string | null;
  advice_reservation_id?: string | null;
  purge_state: AlphaPurgeState;
  deleted_at: Date | null;
};

function uniqueKeys(keys: Array<string | null | undefined>): string[] {
  return [...new Set(keys.filter((key): key is string => Boolean(key)))];
}

/**
 * Logically removes an alpha case and records a retryable physical purge.
 * Content payloads are scrubbed in the same transaction; object references
 * remain until purgeAlphaMedia confirms the provider deletion.
 */
export async function scheduleAlphaPurge(
  binding: HyperdriveBinding,
  ownerId: string,
  caseId: string,
  targetState: AlphaTerminalState,
): Promise<{ purgeState: AlphaPurgeState; keys: string[] }> {
  return transaction(binding, async (client) => {
    const locked = await client.query<AlphaPurgeRow>(
      `SELECT a.case_id,a.owner_id,a.state,a.object_id,a.upload_session_id,a.original_key,a.advice_reservation_id,a.purge_state,
              u.object_key AS upload_key
         FROM moderation.authenticity_alpha a
         LEFT JOIN media.upload_sessions u ON u.id=a.upload_session_id
        WHERE a.case_id=$1 AND a.owner_id=$2
        FOR UPDATE OF a`,
      [caseId, ownerId],
    );
    const row = locked.rows[0] as (AlphaPurgeRow & { upload_key?: string | null }) | undefined;
    if (!row) throw new Error('alpha_not_found');
    if (row.purge_state === 'completed') return { purgeState: 'completed', keys: uniqueKeys([row.original_key, row.upload_key]) };
    const hold = await client.query<{ active: boolean }>(`SELECT privacy.alpha_subject_has_hold($1) AS active`, [ownerId]);
    if (hold.rows[0]?.active === true) {
      await client.query(
        `UPDATE moderation.authenticity_alpha
            SET purge_state='blocked',purge_last_error='RETENTION_HOLD',updated_at=now()
          WHERE case_id=$1 AND owner_id=$2`,
        [caseId, ownerId],
      );
      throw new Error('alpha_retention_hold');
    }
    if (row.purge_state === 'blocked' && row.deleted_at) {
      await client.query(
        `UPDATE moderation.authenticity_alpha
            SET purge_state='pending',purge_last_error=NULL,purge_requested_at=coalesce(purge_requested_at,now()),updated_at=now()
          WHERE case_id=$1 AND owner_id=$2 AND purge_state='blocked'`,
        [caseId, ownerId],
      );
      row.purge_state = 'pending';
    }
    if (row.deleted_at || row.purge_state === 'pending') return { purgeState: row.purge_state, keys: uniqueKeys([row.original_key, row.upload_key]) };

    if (row.upload_session_id) {
      const upload = await client.query<{ expected_bytes: string; status: string }>(
        `SELECT expected_bytes,status FROM media.upload_sessions WHERE id=$1 FOR UPDATE`,
        [row.upload_session_id],
      );
      if (upload.rows[0]?.status === 'pending') {
        await client.query(
          `UPDATE media.storage_ledger
              SET bytes_reserved=greatest(0,bytes_reserved-$2),last_reconciled_at=now()
            WHERE user_id=$1`,
          [ownerId, Number(upload.rows[0].expected_bytes)],
        );
        await client.query(
          `UPDATE media.upload_sessions SET status=$2 WHERE id=$1 AND status='pending'`,
          [row.upload_session_id, targetState === 'expired' ? 'expired' : 'cancelled'],
        );
      } else {
        await client.query(
          `UPDATE media.upload_sessions SET status=$2 WHERE id=$1 AND status IN ('queued','approved')`,
          [row.upload_session_id, targetState === 'expired' ? 'expired' : 'cancelled'],
        );
      }
    }
    if (row.object_id) {
      await client.query(
        `UPDATE media.objects SET state='deleted',deleted_at=coalesce(deleted_at,now()) WHERE id=$1 AND owner_id=$2`,
        [row.object_id, ownerId],
      );
    }
    const attempts = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM moderation.authenticity_alpha_steps
        WHERE case_id=$1 AND state IN ('started','completed','ambiguous')`,
      [caseId],
    );
    if (Number(attempts.rows[0]?.count ?? 0) === 0) {
      await client.query(
        `UPDATE system.cost_budget_reservations
            SET status='released',updated_at=now()
          WHERE (correlation_id=$1 OR id=$2)
            AND operation IN ('authenticity_alpha_case','authenticity_alpha_advice')
            AND status IN ('reserved','committed') AND actual_cost_usd IS NULL`,
        [caseId, row.advice_reservation_id ?? null],
      );
    }
    await client.query(
      `UPDATE moderation.authenticity_alpha
          SET state=$3,revision=revision+1,deleted_at=coalesce(deleted_at,now()),result=NULL,text_body=NULL,
              components='{"deleted":true}'::jsonb,lease_token=NULL,lease_until=NULL,
              purge_state='pending',purge_requested_at=coalesce(purge_requested_at,now()),purge_last_error=NULL,updated_at=now()
        WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL`,
      [caseId, ownerId, targetState],
    );
    await client.query(
      `UPDATE moderation.authenticity_alpha_steps
          SET state=CASE WHEN state='started' THEN 'ambiguous' ELSE state END,
              output=NULL,usage=NULL,error_code='CASE_DELETED',completed_at=coalesce(completed_at,now())
        WHERE case_id=$1`,
      [caseId],
    );
    await client.query(`DELETE FROM moderation.authenticity_alpha_feedback WHERE case_id=$1`, [caseId]);
    await client.query(`UPDATE moderation.cases SET state='superseded',resolved_at=coalesce(resolved_at,now()) WHERE id=$1`, [caseId]);
    const keys = uniqueKeys([row.original_key, row.upload_key]);
    if (keys.length === 0) {
      await client.query(
        `UPDATE moderation.authenticity_alpha SET purge_state='completed',purged_at=now(),purge_completed_at=now(),updated_at=now() WHERE case_id=$1 AND owner_id=$2`,
        [caseId, ownerId],
      );
      await client.query(`SELECT privacy.remove_alpha_location($1,$2)`, [ownerId, caseId]);
      return { purgeState: 'completed', keys };
    }
    return { purgeState: 'pending', keys };
  });
}

/**
 * Delete pending alpha media and finalize the database tombstone only after
 * every referenced R2 key has been accepted by the provider. Failed deletes
 * remain pending and retain their references for the next retry.
 */
export async function purgeAlphaMedia(
  binding: HyperdriveBinding,
  bucket: AlphaPurgeBucket | undefined,
  caseId: string | null = null,
): Promise<{ pending: number; completed: number; failed: number }> {
  const rows = await query<AlphaPurgeRow & { upload_key: string | null; byte_size: string | null; storage_released_at: Date | null }>(
    binding,
    `SELECT a.case_id,a.owner_id,a.state,a.object_id,a.upload_session_id,a.original_key,a.purge_state,
            a.purge_attempts,a.storage_released_at,u.object_key AS upload_key,o.byte_size
       FROM moderation.authenticity_alpha a
       LEFT JOIN media.upload_sessions u ON u.id=a.upload_session_id
       LEFT JOIN media.objects o ON o.id=a.object_id
      WHERE a.deleted_at IS NOT NULL AND a.purge_state IN ('pending','blocked')
        AND ($1::uuid IS NULL OR a.case_id=$1)
      ORDER BY a.purge_requested_at NULLS FIRST,a.updated_at
      LIMIT 50`,
    [caseId],
  );
  let completed = 0;
  let failed = 0;
  for (const row of rows.rows) {
    if (row.purge_state === 'blocked') {
      const hold = await query<{ active: boolean }>(binding, `SELECT privacy.alpha_subject_has_hold($1) AS active`, [row.owner_id]);
      if (hold.rows[0]?.active === true) continue;
      await query(binding, `UPDATE moderation.authenticity_alpha SET purge_state='pending',purge_last_error=NULL,updated_at=now() WHERE case_id=$1 AND purge_state='blocked'`, [row.case_id]);
    }
    const keys = uniqueKeys([row.original_key, row.upload_key]);
    if (bucket && keys.length) {
      try {
        await bucket.delete(keys);
      } catch (error) {
        failed += 1;
        await query(
          binding,
          `UPDATE moderation.authenticity_alpha
              SET purge_attempts=purge_attempts+1,purge_last_error=$2,updated_at=now()
            WHERE case_id=$1 AND purge_state='pending'`,
          [row.case_id, error instanceof Error ? error.message.slice(0, 500) : 'R2_DELETE_FAILED'],
        );
        continue;
      }
    } else if (!bucket && keys.length) {
      failed += 1;
      await query(
        binding,
        `UPDATE moderation.authenticity_alpha
            SET purge_attempts=purge_attempts+1,purge_last_error='R2_BINDING_UNAVAILABLE',updated_at=now()
          WHERE case_id=$1 AND purge_state='pending'`,
        [row.case_id],
      );
      continue;
    }
    try {
      const finalized = await transaction(binding, async (client) => {
        const locked = await client.query<AlphaPurgeRow & { storage_released_at: Date | null; byte_size: string | null }>(
          `SELECT a.case_id,a.owner_id,a.state,a.object_id,a.upload_session_id,a.original_key,a.purge_state,
                  a.storage_released_at,o.byte_size
             FROM moderation.authenticity_alpha a
             LEFT JOIN media.objects o ON o.id=a.object_id
            WHERE a.case_id=$1 AND a.deleted_at IS NOT NULL AND a.purge_state='pending'
            FOR UPDATE OF a`,
          [row.case_id],
        );
        const current = locked.rows[0];
        if (!current) return false;
        const hold = await client.query<{ active: boolean }>(`SELECT privacy.alpha_subject_has_hold($1) AS active`, [current.owner_id]);
        if (hold.rows[0]?.active === true) {
          await client.query(`UPDATE moderation.authenticity_alpha SET purge_state='blocked',purge_last_error='RETENTION_HOLD',updated_at=now() WHERE case_id=$1`, [row.case_id]);
          return false;
        }
        if (current.object_id && !current.storage_released_at) {
          await client.query(
            `UPDATE media.storage_ledger
                SET bytes_approved=greatest(0,bytes_approved-$2),object_count=greatest(0,object_count-1),last_reconciled_at=now()
              WHERE user_id=$1`,
            [current.owner_id, Number(current.byte_size ?? 0)],
          );
        }
        await client.query(
          `UPDATE moderation.authenticity_alpha
              SET purge_state='completed',purged_at=now(),purge_completed_at=now(),storage_released_at=coalesce(storage_released_at,now()),purge_last_error=NULL,updated_at=now()
            WHERE case_id=$1 AND purge_state='pending'`,
          [row.case_id],
        );
        await client.query(`SELECT privacy.remove_alpha_location($1,$2)`, [current.owner_id, row.case_id]);
        return true;
      });
      if (finalized) completed += 1;
    } catch (error) {
      failed += 1;
      await query(
        binding,
        `UPDATE moderation.authenticity_alpha SET purge_attempts=purge_attempts+1,purge_last_error=$2,updated_at=now() WHERE case_id=$1 AND purge_state='pending'`,
        [row.case_id, error instanceof Error ? error.message.slice(0, 500) : 'PURGE_FINALIZE_FAILED'],
      );
    }
  }
  const pending = await query<{ count: string }>(binding, `SELECT count(*)::text AS count FROM moderation.authenticity_alpha WHERE deleted_at IS NOT NULL AND purge_state='pending'${caseId ? ' AND case_id=$1' : ''}`, caseId ? [caseId] : []);
  return { pending: Number(pending.rows[0]?.count ?? 0), completed, failed };
}
