ALTER TABLE media.upload_sessions
  ADD COLUMN quarantine_deleted_at timestamptz;

CREATE INDEX media_upload_quarantine_cleanup_idx
  ON media.upload_sessions (expires_at, id)
  WHERE purpose = 'standard'
    AND status IN ('pending', 'queued', 'approved', 'rejected', 'expired', 'cancelled')
    AND quarantine_deleted_at IS NULL;
