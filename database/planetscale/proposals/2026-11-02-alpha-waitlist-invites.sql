-- Review-only proposal. Do not apply directly to any shared or production DB.
-- Implements invite delivery as an additive lifecycle on the existing
-- encrypted marketing waitlist and transactional email outbox.
-- Provision lythaus_waitlist_invite_function_owner as a NOLOGIN role before
-- rehearsal. Grant it to lythaus_migrations with SET only (no INHERIT/ADMIN),
-- and stage CREATE on marketing for that owner before this proposal runs. The
-- production migration runner currently applies roles.sql after migrations;
-- it needs an approved pre-grant step before this proposal can be activated.

DO $preflight$
BEGIN
  IF current_user <> 'lythaus_migrations' THEN
    RAISE EXCEPTION 'waitlist invite proposal requires lythaus_migrations';
  END IF;
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname = 'lythaus_waitlist_invite_function_owner'
        AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
        AND NOT rolreplication AND NOT rolbypassrls) <> 1
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
                WHERE r.rolname = 'lythaus_waitlist_invite_function_owner'
                  AND (SELECT rolname FROM pg_roles WHERE oid = m.member) <> 'lythaus_migrations')
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
                JOIN pg_roles member_role ON member_role.oid = m.member
                WHERE r.rolname = 'lythaus_waitlist_invite_function_owner'
                  AND (member_role.rolname <> 'lythaus_migrations' OR m.inherit_option
                       OR m.admin_option OR NOT m.set_option)) THEN
    RAISE EXCEPTION 'waitlist invite proposal requires an isolated NOLOGIN function owner';
  END IF;
  IF NOT has_schema_privilege('lythaus_waitlist_invite_function_owner', 'marketing', 'CREATE') THEN
    RAISE EXCEPTION 'waitlist invite proposal requires staged CREATE on marketing';
  END IF;
  IF NOT has_column_privilege('lythaus_migrations', 'marketing.waitlist_signups', 'id', 'REFERENCES')
     OR NOT has_column_privilege('lythaus_migrations', 'identity.users', 'id', 'REFERENCES')
     OR NOT has_column_privilege('lythaus_migrations', 'identity.email_verification_tokens', 'id', 'REFERENCES')
     OR NOT has_column_privilege('lythaus_migrations', 'system.transactional_email_outbox', 'id', 'REFERENCES')
     OR NOT has_table_privilege('lythaus_migrations', 'marketing.waitlist_signups', 'TRIGGER')
     OR NOT has_table_privilege('lythaus_migrations', 'identity.users', 'TRIGGER')
     OR NOT has_table_privilege('lythaus_migrations', 'system.transactional_email_outbox', 'TRIGGER') THEN
    RAISE EXCEPTION 'waitlist invite proposal requires its exact migration DDL privileges';
  END IF;
END;
$preflight$;

CREATE TABLE marketing.waitlist_invites (
  id uuid PRIMARY KEY,
  waitlist_id uuid REFERENCES marketing.waitlist_signups(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL UNIQUE REFERENCES identity.email_verification_tokens(id) ON DELETE CASCADE,
  outbox_id uuid NOT NULL UNIQUE REFERENCES system.transactional_email_outbox(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES identity.users(id),
  email_lookup_hmac bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  redeemed_at timestamptz,
  CONSTRAINT waitlist_invites_waitlist_unique UNIQUE (waitlist_id),
  CONSTRAINT waitlist_invites_user_unique UNIQUE (user_id)
);

CREATE INDEX waitlist_invites_pending_delivery_idx
  ON marketing.waitlist_invites(outbox_id) WHERE revoked_at IS NULL AND redeemed_at IS NULL;

REVOKE ALL ON marketing.waitlist_invites FROM PUBLIC;
GRANT SELECT (waitlist_id, created_at, revoked_at, redeemed_at)
  ON marketing.waitlist_invites TO lythaus_admin;
GRANT USAGE ON SCHEMA marketing TO lythaus_jobs;
CREATE OR REPLACE FUNCTION marketing.waitlist_invite_eligible(p_waitlist_id uuid, p_email_lookup_hmac bytea)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
  v_hold boolean;
  v_existing_user_id uuid;
  v_user_status text;
  v_existing record;
BEGIN
  -- Account deletion locks identity.users before deleting verification tokens
  -- (which cascade to this invite). Reissue takes the account lock first to
  -- avoid a user -> token -> invite / invite -> user deadlock.
  SELECT i.user_id INTO v_existing_user_id
    FROM marketing.waitlist_invites i
   WHERE i.waitlist_id = p_waitlist_id AND i.email_lookup_hmac = p_email_lookup_hmac;
  IF FOUND THEN
    SELECT u.status INTO v_user_status FROM identity.users u WHERE u.id = v_existing_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  SELECT w.status, w.retention_hold INTO v_status, v_hold
    FROM marketing.waitlist_signups w
   WHERE w.id = p_waitlist_id AND w.email_lookup_hmac = p_email_lookup_hmac
   FOR UPDATE;
  IF NOT FOUND OR v_hold OR v_status NOT IN ('waiting', 'invited') THEN RETURN false; END IF;

  SELECT encode(c.email_lookup_hmac, 'base64') AS credential_lookup,
         i.revoked_at, i.redeemed_at, t.expires_at, t.consumed_at, t.superseded_at,
         o.state AS outbox_state, o.provider_error_category
    INTO v_existing
    FROM marketing.waitlist_invites i
    JOIN identity.email_credentials c ON c.user_id = i.user_id
    JOIN identity.email_verification_tokens t ON t.id = i.challenge_id AND t.user_id = i.user_id
    JOIN system.transactional_email_outbox o ON o.id = i.outbox_id
   WHERE i.waitlist_id = p_waitlist_id AND i.email_lookup_hmac = p_email_lookup_hmac
     AND i.user_id = v_existing_user_id
   FOR UPDATE OF i, c, t, o;
  IF NOT FOUND THEN RETURN v_status = 'waiting'; END IF;
  RETURN v_user_status = 'relink_required' AND v_existing.credential_lookup = encode(p_email_lookup_hmac, 'base64')
    AND v_existing.revoked_at IS NULL AND v_existing.redeemed_at IS NULL
    AND v_existing.consumed_at IS NULL AND v_existing.superseded_at IS NULL
    AND v_existing.outbox_state NOT IN ('bounced', 'complained', 'rejected')
    AND ((v_existing.expires_at <= clock_timestamp() AND v_existing.outbox_state <> 'failed')
      OR (v_existing.outbox_state = 'failed' AND v_existing.provider_error_category = 'transient'));
END
$$;

CREATE OR REPLACE FUNCTION marketing.waitlist_invite_reissue_user(p_waitlist_id uuid, p_email_lookup_hmac bytea)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_user_status text;
BEGIN
  SELECT i.user_id INTO v_user_id
    FROM marketing.waitlist_invites i
   WHERE i.waitlist_id = p_waitlist_id AND i.email_lookup_hmac = p_email_lookup_hmac;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Match privacy deletion's identity.users -> token cascade lock order.
  SELECT u.status INTO v_user_status FROM identity.users u WHERE u.id = v_user_id FOR UPDATE;
  IF NOT FOUND OR v_user_status <> 'relink_required' THEN RETURN NULL; END IF;
  PERFORM 1 FROM marketing.waitlist_signups w
   WHERE w.id = p_waitlist_id AND w.email_lookup_hmac = p_email_lookup_hmac
     AND w.status IN ('waiting', 'invited') AND w.retention_hold = false
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT i.user_id INTO v_user_id
    FROM marketing.waitlist_invites i
    JOIN identity.email_credentials c ON c.user_id = i.user_id
      AND c.email_lookup_hmac = p_email_lookup_hmac
    JOIN identity.email_verification_tokens t ON t.id = i.challenge_id AND t.user_id = i.user_id
    JOIN system.transactional_email_outbox o ON o.id = i.outbox_id
   WHERE i.waitlist_id = p_waitlist_id AND i.email_lookup_hmac = p_email_lookup_hmac
     AND i.user_id = v_user_id
     AND i.revoked_at IS NULL AND i.redeemed_at IS NULL
     AND t.consumed_at IS NULL AND t.superseded_at IS NULL
     AND o.state NOT IN ('bounced', 'complained', 'rejected')
     AND ((t.expires_at <= clock_timestamp() AND o.state <> 'failed')
       OR (o.state = 'failed' AND o.provider_error_category = 'transient'))
   FOR UPDATE OF i, c, t, o;
  RETURN v_user_id;
END
$$;

CREATE OR REPLACE FUNCTION marketing.bind_waitlist_invite(
  p_waitlist_id uuid,
  p_user_id uuid,
  p_challenge_id uuid,
  p_outbox_id uuid,
  p_email_lookup_hmac bytea,
  p_actor_id uuid,
  p_invite_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_rows integer := 0;
  v_existing record;
BEGIN
  PERFORM 1 FROM identity.admin_memberships a
    JOIN identity.users u ON u.id = a.user_id
   WHERE a.user_id = p_actor_id AND a.active = true
     AND a.role IN ('administrator', 'owner') AND u.status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM marketing.waitlist_signups w
   WHERE w.id = p_waitlist_id AND w.email_lookup_hmac = p_email_lookup_hmac
     AND w.status IN ('waiting', 'invited') AND w.retention_hold = false
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT i.id, i.user_id, i.challenge_id, i.outbox_id, i.revoked_at, i.redeemed_at,
         t.expires_at, t.consumed_at, t.superseded_at, o.state AS outbox_state, o.provider_error_category
    INTO v_existing
    FROM marketing.waitlist_invites i
    JOIN identity.email_verification_tokens t ON t.id = i.challenge_id AND t.user_id = i.user_id
    JOIN system.transactional_email_outbox o ON o.id = i.outbox_id
   WHERE i.waitlist_id = p_waitlist_id AND i.email_lookup_hmac = p_email_lookup_hmac
   FOR UPDATE OF i, t, o;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id OR v_existing.revoked_at IS NOT NULL OR v_existing.redeemed_at IS NOT NULL
      OR v_existing.consumed_at IS NOT NULL OR v_existing.superseded_at IS NOT NULL
      OR v_existing.outbox_state IN ('bounced', 'complained', 'rejected')
      OR NOT ((v_existing.expires_at <= clock_timestamp() AND v_existing.outbox_state <> 'failed')
        OR (v_existing.outbox_state = 'failed' AND v_existing.provider_error_category = 'transient')) THEN
      RETURN false;
    END IF;
    UPDATE identity.email_verification_tokens SET superseded_at = clock_timestamp()
     WHERE id = v_existing.challenge_id AND consumed_at IS NULL AND superseded_at IS NULL;
    UPDATE system.transactional_email_outbox
       SET state = 'cancelled', terminal_at = COALESCE(terminal_at, now()), updated_at = now(),
           delivery_envelope_ciphertext = NULL, delivery_envelope_encryption_key_version = NULL
     WHERE id = v_existing.outbox_id AND state IN ('queued', 'processing', 'failed');
    UPDATE marketing.waitlist_invites
       SET challenge_id = p_challenge_id, outbox_id = p_outbox_id, actor_id = p_actor_id,
           email_lookup_hmac = p_email_lookup_hmac, created_at = clock_timestamp()
     WHERE id = v_existing.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows = 1;
  END IF;
  IF (SELECT status FROM marketing.waitlist_signups WHERE id = p_waitlist_id) <> 'waiting' THEN RETURN false; END IF;
  INSERT INTO marketing.waitlist_invites
    (id, waitlist_id, user_id, challenge_id, outbox_id, actor_id, email_lookup_hmac)
  VALUES (p_invite_id, p_waitlist_id, p_user_id, p_challenge_id, p_outbox_id, p_actor_id, p_email_lookup_hmac);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END
$$;

CREATE OR REPLACE FUNCTION marketing.lock_waitlist_invite_delivery(p_outbox_id uuid)
RETURNS TABLE(found boolean, deliverable boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_waitlist_id uuid;
  v_ok boolean := false;
BEGIN
  SELECT i.waitlist_id INTO v_waitlist_id
    FROM marketing.waitlist_invites i WHERE i.outbox_id = p_outbox_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, false; RETURN; END IF;

  -- All invite state transitions take locks in waitlist -> invite -> outbox order.
  PERFORM 1 FROM marketing.waitlist_signups w WHERE w.id = v_waitlist_id FOR UPDATE;
  SELECT (i.revoked_at IS NULL AND i.redeemed_at IS NULL
          AND w.status IN ('waiting', 'invited') AND w.retention_hold = false
          AND u.status = 'relink_required'
          AND t.expires_at > clock_timestamp() AND t.consumed_at IS NULL AND t.superseded_at IS NULL
          AND o.state = 'processing')
    INTO v_ok
    FROM marketing.waitlist_invites i
    JOIN marketing.waitlist_signups w ON w.id = i.waitlist_id
    JOIN identity.users u ON u.id = i.user_id
    JOIN identity.email_verification_tokens t ON t.id = i.challenge_id AND t.user_id = i.user_id
    JOIN system.transactional_email_outbox o ON o.id = i.outbox_id
   WHERE i.outbox_id = p_outbox_id
   FOR UPDATE OF i;
  RETURN QUERY SELECT true, COALESCE(v_ok, false);
END
$$;

CREATE OR REPLACE FUNCTION marketing.lock_waitlist_invite_for_verification(
  p_user_id uuid,
  p_challenge_id uuid,
  p_email_lookup_hmac bytea
)
RETURNS TABLE(found boolean, valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_waitlist_id uuid;
  v_valid boolean := false;
  v_user_status text;
BEGIN
  -- Look up without locking first, then lock identity.users before waitlist,
  -- invitation, and token rows to match privacy deletion's user-first order.
  SELECT i.waitlist_id INTO v_waitlist_id
    FROM marketing.waitlist_invites i
   WHERE i.user_id = p_user_id AND (p_challenge_id IS NULL OR i.challenge_id = p_challenge_id);
  IF NOT FOUND THEN RETURN QUERY SELECT false, false; RETURN; END IF;
  SELECT u.status INTO v_user_status FROM identity.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_user_status <> 'relink_required' THEN RETURN QUERY SELECT true, false; RETURN; END IF;

  -- Match delivery and restriction transitions: waitlist row, then invite row.
  PERFORM 1 FROM marketing.waitlist_signups w WHERE w.id = v_waitlist_id FOR UPDATE;
  SELECT i.revoked_at IS NULL AND i.redeemed_at IS NULL
         AND i.email_lookup_hmac = p_email_lookup_hmac
         AND w.email_lookup_hmac = p_email_lookup_hmac
         AND w.status IN ('waiting', 'invited') AND w.retention_hold = false
         AND u.status = 'relink_required'
         AND t.expires_at > clock_timestamp() AND t.consumed_at IS NULL AND t.superseded_at IS NULL
    INTO v_valid
    FROM marketing.waitlist_invites i
    JOIN marketing.waitlist_signups w ON w.id = i.waitlist_id
    JOIN identity.users u ON u.id = i.user_id
    JOIN identity.email_verification_tokens t ON t.id = i.challenge_id AND t.user_id = i.user_id
   WHERE i.user_id = p_user_id AND i.challenge_id = p_challenge_id
   FOR UPDATE OF i;
  RETURN QUERY SELECT true, COALESCE(v_valid, false);
END
$$;

CREATE OR REPLACE FUNCTION marketing.sync_waitlist_invite_outbox_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_waitlist_id uuid;
BEGIN
  IF NEW.state <> 'provider_accepted' OR OLD.state = 'provider_accepted' THEN RETURN NEW; END IF;
  SELECT i.waitlist_id INTO v_waitlist_id FROM marketing.waitlist_invites i
   WHERE i.outbox_id = NEW.id AND i.revoked_at IS NULL AND i.redeemed_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE marketing.waitlist_signups
     SET status = 'invited', invited_at = COALESCE(invited_at, NEW.accepted_at, clock_timestamp()), updated_at = now()
   WHERE id = v_waitlist_id AND status = 'waiting' AND retention_hold = false;
  RETURN NEW;
END
$$;

CREATE TRIGGER waitlist_invite_outbox_state_sync
AFTER UPDATE OF state ON system.transactional_email_outbox
FOR EACH ROW EXECUTE FUNCTION marketing.sync_waitlist_invite_outbox_state();

CREATE OR REPLACE FUNCTION marketing.sync_waitlist_invite_account_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    UPDATE marketing.waitlist_invites i
       SET redeemed_at = COALESCE(i.redeemed_at, clock_timestamp())
      FROM identity.email_verification_tokens t
     WHERE i.user_id = NEW.id AND t.id = i.challenge_id AND t.user_id = NEW.id
       AND t.consumed_at IS NOT NULL AND i.revoked_at IS NULL;
    UPDATE marketing.waitlist_signups w
       SET status = 'converted', converted_at = COALESCE(w.converted_at, clock_timestamp()),
           purge_after = LEAST(w.purge_after, now() + interval '30 days'), updated_at = now()
      FROM marketing.waitlist_invites i
     WHERE i.waitlist_id = w.id AND i.user_id = NEW.id AND i.redeemed_at IS NOT NULL
       AND w.status = 'invited';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER waitlist_invite_account_state_sync
AFTER UPDATE OF status ON identity.users
FOR EACH ROW EXECUTE FUNCTION marketing.sync_waitlist_invite_account_state();

CREATE OR REPLACE FUNCTION marketing.revoke_waitlist_invites(p_waitlist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE marketing.waitlist_invites SET revoked_at = COALESCE(revoked_at, clock_timestamp())
   WHERE waitlist_id = p_waitlist_id AND revoked_at IS NULL;
  UPDATE system.transactional_email_outbox o
     SET state = 'cancelled', terminal_at = COALESCE(terminal_at, now()), updated_at = now(),
         delivery_envelope_ciphertext = NULL, delivery_envelope_encryption_key_version = NULL
    FROM marketing.waitlist_invites i
   WHERE i.waitlist_id = p_waitlist_id AND o.id = i.outbox_id
     AND o.state IN ('queued', 'processing');
END
$$;

CREATE OR REPLACE FUNCTION marketing.on_waitlist_restriction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'unsubscribed' OR (NEW.retention_hold = true AND OLD.retention_hold = false) THEN
    PERFORM marketing.revoke_waitlist_invites(NEW.id);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER waitlist_invite_revoke_on_restriction
AFTER UPDATE OF status, retention_hold ON marketing.waitlist_signups
FOR EACH ROW EXECUTE FUNCTION marketing.on_waitlist_restriction();

CREATE OR REPLACE FUNCTION marketing.unsubscribe_waitlist_entry(p_waitlist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE marketing.waitlist_signups
     SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now()),
         purge_after = CASE WHEN retention_hold THEN purge_after ELSE LEAST(purge_after, now() + interval '30 days') END,
         updated_at = now()
   WHERE id = p_waitlist_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'waitlist_not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION marketing.cancel_waitlist_invite_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM marketing.revoke_waitlist_invites(OLD.id);
  UPDATE marketing.waitlist_invites
     SET email_lookup_hmac = NULL
   WHERE waitlist_id = OLD.id;
  RETURN OLD;
END
$$;

CREATE TRIGGER waitlist_invite_cancel_before_delete
BEFORE DELETE ON marketing.waitlist_signups
FOR EACH ROW EXECUTE FUNCTION marketing.cancel_waitlist_invite_before_delete();

REVOKE ALL ON FUNCTION
  marketing.waitlist_invite_eligible(uuid, bytea),
  marketing.waitlist_invite_reissue_user(uuid, bytea),
  marketing.bind_waitlist_invite(uuid, uuid, uuid, uuid, bytea, uuid, uuid),
  marketing.lock_waitlist_invite_delivery(uuid),
  marketing.lock_waitlist_invite_for_verification(uuid, uuid, bytea),
  marketing.sync_waitlist_invite_outbox_state(),
  marketing.sync_waitlist_invite_account_state(),
  marketing.revoke_waitlist_invites(uuid),
  marketing.on_waitlist_restriction(),
  marketing.unsubscribe_waitlist_entry(uuid),
  marketing.cancel_waitlist_invite_before_delete()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.waitlist_invite_eligible(uuid, bytea) TO lythaus_runtime;
GRANT EXECUTE ON FUNCTION marketing.waitlist_invite_reissue_user(uuid, bytea) TO lythaus_runtime;
GRANT EXECUTE ON FUNCTION marketing.bind_waitlist_invite(uuid, uuid, uuid, uuid, bytea, uuid, uuid) TO lythaus_runtime;
GRANT EXECUTE ON FUNCTION marketing.lock_waitlist_invite_delivery(uuid) TO lythaus_jobs;
GRANT EXECUTE ON FUNCTION marketing.lock_waitlist_invite_for_verification(uuid, uuid, bytea) TO lythaus_runtime;
GRANT EXECUTE ON FUNCTION marketing.unsubscribe_waitlist_entry(uuid) TO lythaus_admin;

-- The functions execute with a dedicated NOLOGIN owner, not the broad
-- migration login or an application role. Column ACLs supply only the fields
-- their lock, eligibility, and lifecycle code reads or updates.
GRANT SELECT, INSERT, UPDATE ON marketing.waitlist_invites TO lythaus_waitlist_invite_function_owner;

ALTER FUNCTION marketing.waitlist_invite_eligible(uuid, bytea) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.waitlist_invite_reissue_user(uuid, bytea) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.bind_waitlist_invite(uuid, uuid, uuid, uuid, bytea, uuid, uuid) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.lock_waitlist_invite_delivery(uuid) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.lock_waitlist_invite_for_verification(uuid, uuid, bytea) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.sync_waitlist_invite_outbox_state() OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.sync_waitlist_invite_account_state() OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.revoke_waitlist_invites(uuid) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.on_waitlist_restriction() OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.unsubscribe_waitlist_entry(uuid) OWNER TO lythaus_waitlist_invite_function_owner;
ALTER FUNCTION marketing.cancel_waitlist_invite_before_delete() OWNER TO lythaus_waitlist_invite_function_owner;
REVOKE CREATE ON SCHEMA marketing FROM lythaus_waitlist_invite_function_owner;
