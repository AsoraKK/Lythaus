ALTER TABLE system.transactional_email_outbox
  DROP CONSTRAINT transactional_email_outbox_purpose_check,
  ADD CONSTRAINT transactional_email_outbox_purpose_check
    CHECK (purpose IN ('verification', 'password_reset', 'invite', 'email_change', 'password_changed'));
