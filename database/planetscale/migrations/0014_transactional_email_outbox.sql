-- Transactional email intent is authoritative in the database. The public API
-- writes the identity mutation and this intent in one transaction; jobs owns
-- provider delivery and lifecycle reconciliation.
ALTER TABLE identity.email_verification_tokens
  ADD COLUMN superseded_at timestamptz;

ALTER TABLE identity.password_reset_tokens
  ADD COLUMN superseded_at timestamptz;

CREATE INDEX email_verification_tokens_current_idx
  ON identity.email_verification_tokens (user_id, created_at DESC)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE INDEX password_reset_tokens_current_idx
  ON identity.password_reset_tokens (user_id, created_at DESC)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE TABLE system.transactional_email_outbox (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  contact_email_user_id uuid REFERENCES identity.contact_emails(user_id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('verification', 'password_reset', 'invite', 'email_change')),
  challenge_id uuid,
  template_version text NOT NULL,
  secret_ciphertext text,
  secret_encryption_key_version text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'processing', 'provider_accepted', 'delivered', 'deferred', 'bounced', 'rejected', 'failed', 'cancelled', 'complained')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  provider_message_id text,
  provider_error_code text,
  provider_error_category text CHECK (provider_error_category IN ('transient', 'permanent', 'unknown')),
  correlation_id text NOT NULL,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (secret_ciphertext IS NULL OR secret_encryption_key_version IS NOT NULL),
  CHECK (state <> 'provider_accepted' OR provider_message_id IS NOT NULL),
  CHECK (state NOT IN ('queued', 'processing') OR terminal_at IS NULL)
);

CREATE INDEX transactional_email_outbox_claim_idx
  ON system.transactional_email_outbox (state, next_attempt_at, created_at)
  WHERE state IN ('queued', 'processing');

CREATE INDEX transactional_email_outbox_challenge_idx
  ON system.transactional_email_outbox (challenge_id)
  WHERE challenge_id IS NOT NULL;

CREATE UNIQUE INDEX transactional_email_outbox_provider_message_uidx
  ON system.transactional_email_outbox (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
