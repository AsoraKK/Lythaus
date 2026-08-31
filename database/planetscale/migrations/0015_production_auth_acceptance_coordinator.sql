-- A short-lived, exact-candidate acceptance ledger. It is intentionally
-- separate from ordinary product analytics and never stores bearer tokens,
-- passwords, raw recipient addresses, or raw provider message identifiers.
ALTER TABLE identity.users
  ADD COLUMN is_production_acceptance boolean NOT NULL DEFAULT false;

CREATE TABLE system.production_auth_acceptance_runs (
  id uuid PRIMARY KEY,
  release_sha text NOT NULL CHECK (release_sha ~ '^[0-9a-f]{40}$'),
  candidate_worker text NOT NULL CHECK (candidate_worker ~ '^[a-z0-9-]{3,128}$'),
  candidate_version text NOT NULL CHECK (length(candidate_version) BETWEEN 8 AND 256),
  candidate_uploaded_at timestamptz NOT NULL,
  candidate_staged_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'blocked')),
  context_lookup_hmac bytea NOT NULL UNIQUE,
  context_ciphertext text NOT NULL,
  context_encryption_key_version text NOT NULL,
  primary_email_ciphertext text NOT NULL,
  primary_email_encryption_key_version text NOT NULL,
  primary_email_lookup_hmac bytea NOT NULL UNIQUE,
  resend_email_ciphertext text NOT NULL,
  resend_email_encryption_key_version text NOT NULL,
  resend_email_lookup_hmac bytea NOT NULL UNIQUE,
  primary_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  resend_fixture_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  initial_verification_challenge_id uuid,
  resend_previous_challenge_id uuid,
  resend_verification_challenge_id uuid,
  password_reset_challenge_id uuid,
  turnstile_verified_at timestamptz,
  turnstile_hostname text,
  turnstile_action text,
  -- Kept only as ciphertext from the pre-reset refresh proof until the
  -- candidate rejects it after reset; then cleared in the same control path.
  pre_reset_refresh_ciphertext text,
  pre_reset_refresh_encryption_key_version text,
  pre_reset_refresh_captured_at timestamptz,
  completed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (candidate_staged_at >= candidate_uploaded_at),
  CHECK ((turnstile_verified_at IS NULL AND turnstile_hostname IS NULL AND turnstile_action IS NULL)
    OR (turnstile_verified_at IS NOT NULL AND turnstile_hostname IS NOT NULL AND turnstile_action IS NOT NULL)),
  CHECK ((pre_reset_refresh_ciphertext IS NULL
      AND pre_reset_refresh_encryption_key_version IS NULL
      AND pre_reset_refresh_captured_at IS NULL)
    OR (pre_reset_refresh_ciphertext IS NOT NULL
      AND pre_reset_refresh_encryption_key_version IS NOT NULL
      AND pre_reset_refresh_captured_at IS NOT NULL))
);

CREATE UNIQUE INDEX production_auth_acceptance_active_candidate_uidx
  ON system.production_auth_acceptance_runs (release_sha, candidate_worker, candidate_version)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX production_auth_acceptance_runs_expiry_idx
  ON system.production_auth_acceptance_runs (expires_at)
  WHERE status IN ('pending', 'in_progress');

CREATE TABLE system.production_auth_acceptance_events (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES system.production_auth_acceptance_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'account_created', 'turnstile_verified', 'initial_verification_requested', 'initial_verification_completed',
    'initial_verification_replay_rejected', 'resend_fixture_created', 'resend_requested',
    'resend_verification_completed', 'resend_verification_replay_rejected', 'password_reset_requested',
    'password_reset_completed', 'password_reset_replay_rejected', 'password_reset_sessions_revoked',
    'password_reset_old_password_rejected', 'password_reset_new_password_accepted',
    'login_completed', 'refresh_completed', 'logout_completed'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, event_type)
);

CREATE INDEX production_auth_acceptance_events_run_idx
  ON system.production_auth_acceptance_events (run_id, occurred_at);

ALTER TABLE system.transactional_email_outbox
  ADD COLUMN acceptance_context_ciphertext text,
  ADD COLUMN acceptance_context_encryption_key_version text,
  ADD COLUMN acceptance_run_id uuid REFERENCES system.production_auth_acceptance_runs(id) ON DELETE SET NULL,
  ADD CONSTRAINT transactional_email_outbox_acceptance_context_key_check
    CHECK (acceptance_context_ciphertext IS NULL OR acceptance_context_encryption_key_version IS NOT NULL);

CREATE INDEX transactional_email_outbox_acceptance_run_idx
  ON system.transactional_email_outbox (acceptance_run_id, created_at)
  WHERE acceptance_run_id IS NOT NULL;
