import type { DatabaseClient } from '@lythaus/db';

export const IMAGE_REVIEW_MEDIA_EXPORT_SQL = `SELECT m.id, m.object_key, m.content_type, m.byte_size, m.sha256,
  m.state, m.created_at, m.deleted_at,
  COALESCE((SELECT jsonb_agg(r.signal->'imageReview' ORDER BY r.created_at, r.id)
    FROM media.moderation_results r WHERE r.object_id = m.id
      AND r.signal->'imageReview'->>'schemaVersion' = 'lythaus-image-review-evidence-v1'), '[]'::jsonb) AS image_review
  FROM media.objects m WHERE m.owner_id = $1 ORDER BY m.created_at, m.id`;

export async function purgeImageReviewEvidence(client: DatabaseClient, ownerId: string, objectId: string | null = null): Promise<void> {
  await client.query(`UPDATE media.moderation_results r SET signal = r.signal - 'imageReview'
    FROM media.objects m WHERE m.id = r.object_id AND m.owner_id = $1
      AND ($2::uuid IS NULL OR m.id = $2::uuid) AND r.signal ? 'imageReview'`, [ownerId, objectId]);
}
