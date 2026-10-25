-- Unregistered proposal only. Not a migration; do not execute in this slice.
-- App-generated UUIDv7 IDs; no provider resources, grants or database defaults.
CREATE TABLE identity.account_action_verifications (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  refresh_family_id uuid NOT NULL REFERENCES identity.refresh_token_families(id) ON DELETE CASCADE,
  token_version integer NOT NULL CHECK (token_version >= 1),
  action text NOT NULL CHECK (action IN ('reward_claim', 'security_change', 'email_change', 'account_delete')),
  operation_hash bytea NOT NULL CHECK (octet_length(operation_hash) = 32),
  secret_hash bytea NOT NULL CHECK (octet_length(secret_hash) = 32),
  credential_id uuid NOT NULL REFERENCES identity.email_credentials(user_id) ON DELETE CASCADE,
  CHECK (credential_id = user_id),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at = verified_at + interval '5 minutes'),
  CHECK (consumed_at IS NULL OR consumed_at >= verified_at)
);
CREATE INDEX account_action_verifications_expiry ON identity.account_action_verifications (expires_at);

-- Private, append-only choices. Local preference observations cannot qualify as
-- credential protection evidence. Option-to-award mapping remains unapproved.
CREATE TABLE trust.member_security_choices (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  source_kind text NOT NULL CHECK (source_kind IN ('device_preference', 'account_credential')),
  option_key text NOT NULL,
  credential_id uuid,
  state text NOT NULL CHECK (state IN ('enabled', 'disabled', 'revoked')),
  effective_at timestamptz NOT NULL,
  CHECK (source_kind <> 'account_credential' OR (option_key = 'email_password' AND credential_id IS NOT NULL AND credential_id = subject_user_id)),
  CHECK (source_kind <> 'device_preference' OR credential_id IS NULL),
  UNIQUE (subject_user_id, revision)
);
