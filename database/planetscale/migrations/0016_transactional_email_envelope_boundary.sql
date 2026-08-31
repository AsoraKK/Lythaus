-- This is deliberately a zero-data migration. Existing rows would require the
-- retired product-PII cipher and must never be silently re-encrypted here.
DO $$
BEGIN
  IF (SELECT count(*) FROM system.transactional_email_outbox) <> 0
     OR (SELECT count(*) FROM system.production_auth_acceptance_runs) <> 0 THEN
    RAISE EXCEPTION '0016 requires empty transactional-email and acceptance ledgers';
  END IF;
END $$;

ALTER TABLE system.transactional_email_outbox
  ADD COLUMN delivery_envelope_ciphertext text,
  ADD COLUMN delivery_envelope_encryption_key_version text,
  ADD CONSTRAINT transactional_email_outbox_delivery_envelope_key_check
    CHECK (delivery_envelope_ciphertext IS NULL OR delivery_envelope_encryption_key_version IS NOT NULL);
