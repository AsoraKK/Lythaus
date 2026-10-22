import { query, type HyperdriveBinding } from '@lythaus/db';

export interface StandardMediaStatusRow {
  id: string;
  status: string;
  expires_at: string;
  unexpired: boolean;
}

export function presentStandardMediaStatus(row: StandardMediaStatusRow) {
  if (!['pending', 'queued', 'approved', 'rejected', 'expired', 'cancelled'].includes(row.status)) {
    return null;
  }
  const expired = ['pending', 'queued'].includes(row.status) && row.unexpired !== true;
  return {
    uploadSessionId: row.id,
    status: expired ? 'expired' : row.status === 'approved' ? 'review' : row.status,
    expiresAt: row.expires_at,
    processingComplete: row.status === 'approved',
    safety: { status: 'not_run' },
    authenticity: { status: 'not_run' },
    publication: { allowed: false },
    private: true,
  };
}

export async function readStandardMediaStatus(db: HyperdriveBinding, ownerId: string, sessionId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return null;
  const result = await query<StandardMediaStatusRow>(db,
    `SELECT s.id, s.status, s.expires_at, s.expires_at > clock_timestamp() AS unexpired
       FROM media.upload_sessions s
       JOIN identity.users u ON u.id = s.user_id AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE s.id = $1 AND s.user_id = $2 AND s.purpose = 'standard'`, [sessionId, ownerId]);
  return result.rows[0] ? presentStandardMediaStatus(result.rows[0]) : null;
}
