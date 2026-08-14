CREATE SCHEMA marketing;

CREATE TABLE marketing.waitlist_signups (
  id uuid PRIMARY KEY,
  email_lookup_hmac bytea NOT NULL,
  email_ciphertext bytea NOT NULL,
  encryption_key_version text NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'invited', 'converted', 'unsubscribed')),
  source text NOT NULL DEFAULT 'lythaus.co'
    CHECK (length(source) BETWEEN 1 AND 120),
  consent_version text NOT NULL
    CHECK (length(consent_version) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invited_at timestamptz,
  converted_at timestamptz,
  unsubscribed_at timestamptz,
  purge_after timestamptz NOT NULL DEFAULT (now() + interval '24 months'),
  retention_hold boolean NOT NULL DEFAULT false,
  retention_hold_at timestamptz,
  retention_hold_released_at timestamptz,
  CONSTRAINT waitlist_signups_email_lookup_hmac_unique UNIQUE (email_lookup_hmac)
);

CREATE INDEX waitlist_signups_created_cursor_idx
  ON marketing.waitlist_signups (created_at DESC, id DESC);

CREATE INDEX waitlist_signups_due_purge_idx
  ON marketing.waitlist_signups (purge_after)
  WHERE retention_hold = false;

COMMENT ON TABLE marketing.waitlist_signups IS
  'Encrypted email addresses submitted for Lythaus private beta and launch communications.';

REVOKE ALL ON SCHEMA marketing FROM PUBLIC;
REVOKE ALL ON marketing.waitlist_signups FROM PUBLIC;
