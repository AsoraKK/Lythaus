-- Unnumbered proposal. Parent assigns a migration after reconciling other lanes.
-- Apply only to disposable local PostgreSQL until the production DDL gate passes.
CREATE TABLE identity.passkey_subjects (
  user_id uuid NOT NULL REFERENCES identity.email_credentials(user_id) ON DELETE CASCADE,
  rp_id text NOT NULL,
  user_handle text NOT NULL CHECK (length(user_handle) BETWEEN 32 AND 128),
  PRIMARY KEY (user_id, rp_id),
  UNIQUE (rp_id, user_handle)
);

CREATE TABLE identity.passkey_credentials (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  rp_id text NOT NULL,
  credential_id text NOT NULL CHECK (length(credential_id) BETWEEN 1 AND 1400),
  public_key bytea NOT NULL,
  sign_count bigint NOT NULL CHECK (sign_count BETWEEN 0 AND 4294967295),
  device_type text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up boolean NOT NULL,
  transports text[] NOT NULL DEFAULT '{}',
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_verified_at timestamptz,
  revoked_at timestamptz,
  FOREIGN KEY (user_id, rp_id) REFERENCES identity.passkey_subjects(user_id, rp_id) ON DELETE CASCADE,
  UNIQUE (rp_id, credential_id),
  CHECK (device_type = 'multiDevice' OR NOT backed_up)
);
CREATE INDEX passkey_credentials_owner_idx ON identity.passkey_credentials (user_id, rp_id);

CREATE TABLE identity.passkey_challenges (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES identity.email_credentials(user_id) ON DELETE CASCADE,
  token_version integer,
  purpose text NOT NULL CHECK (purpose IN ('register', 'login', 'maintenance')),
  challenge text NOT NULL,
  rp_id text NOT NULL,
  origin text NOT NULL,
  binding_hash text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  consumed_at timestamptz,
  CHECK ((purpose = 'login' AND user_id IS NULL AND token_version IS NULL)
    OR (purpose <> 'login' AND user_id IS NOT NULL AND token_version IS NOT NULL))
);
CREATE INDEX passkey_challenges_expiry_idx ON identity.passkey_challenges (expires_at);
CREATE UNIQUE INDEX strong_auth_evidence_source_idx ON identity.account_events
  (user_id, (metadata->>'policyVersion'), (metadata->>'sourceKey'))
  WHERE event_type = 'security.strong_auth_evidence';

REVOKE ALL ON identity.passkey_subjects, identity.passkey_credentials, identity.passkey_challenges FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON identity.passkey_subjects, identity.passkey_credentials, identity.passkey_challenges TO lythaus_runtime;
GRANT DELETE ON identity.passkey_subjects, identity.passkey_credentials, identity.passkey_challenges TO lythaus_privacy;
GRANT SELECT (user_id, rp_id) ON identity.passkey_subjects TO lythaus_privacy;
GRANT SELECT (id, user_id, rp_id, name, device_type, backed_up, transports, created_at, last_used_at, last_verified_at, revoked_at)
  ON identity.passkey_credentials TO lythaus_privacy;
GRANT SELECT (id, user_id, expires_at) ON identity.passkey_challenges TO lythaus_privacy;

CREATE FUNCTION identity.revoke_passkeys_after_password_recovery() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE identity.passkey_credentials SET revoked_at = now() WHERE user_id = NEW.user_id AND revoked_at IS NULL;
  UPDATE identity.passkey_challenges SET consumed_at = now() WHERE user_id = NEW.user_id AND consumed_at IS NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER password_recovery_revokes_passkeys
AFTER UPDATE OF consumed_at ON identity.password_reset_tokens
FOR EACH ROW WHEN (OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL)
EXECUTE FUNCTION identity.revoke_passkeys_after_password_recovery();
REVOKE ALL ON FUNCTION identity.revoke_passkeys_after_password_recovery() FROM PUBLIC;
