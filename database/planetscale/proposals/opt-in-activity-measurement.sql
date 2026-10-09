-- Local review proposal only. Do not apply to a provider or activate collection.
BEGIN;

-- Catalog-only installation marker survives destructive rollback until a
-- separately reviewed proof that this purpose has no residual consent data.
CREATE OR REPLACE FUNCTION privacy.activity_measurement_installation_marker() RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION privacy.activity_measurement_installation_marker() FROM PUBLIC, lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy;

CREATE TABLE privacy.activity_measurement_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  notice_version text NOT NULL CHECK (notice_version = 'activity-account-day-v1'),
  cutover_at timestamptz,
  retention_terms_approved boolean NOT NULL DEFAULT false
);
INSERT INTO privacy.activity_measurement_configuration (notice_version) VALUES ('activity-account-day-v1');

CREATE TABLE privacy.activity_measurement_consents (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id),
  consent_id uuid NOT NULL REFERENCES identity.consent_records(id),
  revision bigint NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
  granted boolean NOT NULL,
  continuous_since timestamptz,
  UNIQUE (user_id, consent_id),
  CHECK (granted = (continuous_since IS NOT NULL))
);

-- Preserve held facts across a withdrawal without making them part of a new
-- consent episode. The immutable ledger also enforces same-account ownership.
ALTER TABLE identity.consent_records ADD CONSTRAINT activity_consent_account_identity UNIQUE (user_id, id);
CREATE TABLE privacy.account_active_days (
  user_id uuid NOT NULL,
  active_day date NOT NULL,
  consent_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, active_day),
  FOREIGN KEY (user_id, consent_id) REFERENCES identity.consent_records(user_id, id),
  CHECK (expires_at = ((active_day + 61)::timestamp AT TIME ZONE 'UTC'))
);
CREATE INDEX activity_measurement_consents_granted ON privacy.activity_measurement_consents(user_id) WHERE granted;
CREATE INDEX activity_measurement_consents_withdrawn ON privacy.activity_measurement_consents(user_id) WHERE NOT granted;
CREATE INDEX account_active_days_expiry ON privacy.account_active_days(expires_at, user_id, active_day);

CREATE TABLE privacy.activity_measurement_coverage (
  coverage_day date PRIMARY KEY,
  complete boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL,
  CHECK (verified_at >= ((coverage_day + 1)::timestamp AT TIME ZONE 'UTC'))
);

INSERT INTO system.feature_flags (flag_key, enabled, policy_version)
VALUES ('analytics.account_daily_activity_pilot', false, 'activity-account-day-v1')
ON CONFLICT (flag_key) DO NOTHING;

REVOKE ALL ON privacy.activity_measurement_configuration, privacy.activity_measurement_consents,
  privacy.account_active_days, privacy.activity_measurement_coverage FROM PUBLIC, lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy;
ALTER TABLE privacy.activity_measurement_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy.account_active_days ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION privacy.reconcile_activity_measurement_locations(p_subject uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  DELETE FROM privacy.subject_data_locations WHERE subject_id = p_subject
    AND resource_reference IN ('privacy.activity_measurement_consents', 'privacy.account_active_days');
  INSERT INTO privacy.subject_data_locations(subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class, last_verified_at)
    SELECT p_subject, 'planetscale', 'privacy.activity_measurement_consents', 'activity_consent', p_subject, 'authoritative', 'privacy', statement_timestamp()
    WHERE EXISTS(SELECT 1 FROM privacy.activity_measurement_consents WHERE user_id = p_subject);
  INSERT INTO privacy.subject_data_locations(subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class, last_verified_at)
    SELECT p_subject, 'planetscale', 'privacy.account_active_days', 'account_active_days', p_subject, 'authoritative', 'privacy', statement_timestamp()
    WHERE EXISTS(SELECT 1 FROM privacy.account_active_days WHERE user_id = p_subject);
END;
$$;

CREATE FUNCTION privacy.activity_measurement_subject() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE subject uuid;
BEGIN
  BEGIN
    subject := nullif(current_setting('lythaus.activity_subject', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'activity_account_required';
  END;
  IF subject IS NULL OR NOT EXISTS (SELECT 1 FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'activity_account_required';
  END IF;
  RETURN subject;
END;
$$;

CREATE FUNCTION privacy.activity_measurement_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE((SELECT f.enabled AND f.policy_version = c.notice_version
    AND c.retention_terms_approved AND c.cutover_at IS NOT NULL AND c.cutover_at <= statement_timestamp()
    FROM system.feature_flags f CROSS JOIN privacy.activity_measurement_configuration c
    WHERE f.flag_key = 'analytics.account_daily_activity_pilot' AND c.singleton), false);
$$;

-- Every caller first locks identity.users FOR UPDATE. That fences new hold
-- inserts through the subject FK; locking *all* existing rows also fences an
-- inactive-to-active update. NOWAIT is retryable rather than a stale decision.
CREATE FUNCTION privacy.activity_measurement_lock_holds(p_subject uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM id FROM privacy.legal_holds WHERE subject_id = p_subject ORDER BY id FOR SHARE NOWAIT;
  RETURN EXISTS (SELECT 1 FROM privacy.legal_holds WHERE subject_id = p_subject AND active);
END;
$$;

CREATE FUNCTION privacy.activity_measurement_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE subject uuid := privacy.activity_measurement_subject(); consent privacy.activity_measurement_consents%ROWTYPE;
BEGIN
  SELECT * INTO consent FROM privacy.activity_measurement_consents WHERE user_id = subject;
  RETURN jsonb_build_object('pilotEnabled', privacy.activity_measurement_enabled(), 'granted', COALESCE(consent.granted, false),
    'revision', COALESCE(consent.revision, 0), 'epoch', consent.consent_id, 'continuousSince', to_char(consent.continuous_since AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END;
$$;

CREATE FUNCTION privacy.set_activity_measurement_consent(p_id uuid, p_granted boolean, p_revision bigint, p_epoch uuid, p_notice text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE subject uuid := privacy.activity_measurement_subject(); consent privacy.activity_measurement_consents%ROWTYPE; at_time timestamptz; held boolean;
BEGIN
  IF p_id IS NULL OR p_granted IS NULL OR p_revision IS NULL OR p_revision < 0 OR p_revision >= 9007199254740991
    OR p_notice IS DISTINCT FROM 'activity-account-day-v1' THEN RAISE EXCEPTION 'activity_invalid_request'; END IF;
  PERFORM id FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'activity_account_required'; END IF;
  held := privacy.activity_measurement_lock_holds(subject);
  SELECT * INTO consent FROM privacy.activity_measurement_consents WHERE user_id = subject FOR UPDATE;
  IF COALESCE(consent.revision, 0) <> p_revision OR consent.consent_id IS DISTINCT FROM p_epoch THEN
    RAISE EXCEPTION 'activity_consent_revision_conflict';
  END IF;
  IF p_granted AND (NOT privacy.activity_measurement_enabled() OR EXISTS (
    SELECT 1 FROM privacy.requests WHERE subject_id = subject AND request_type = 'delete' AND state NOT IN ('completed', 'failed', 'cancelled'))) THEN
    RAISE EXCEPTION 'activity_pilot_disabled';
  END IF;
  IF COALESCE(consent.granted, false) = p_granted THEN RETURN privacy.activity_measurement_status(); END IF;
  IF p_granted AND held THEN RAISE EXCEPTION 'activity_privacy_held'; END IF;
  at_time := clock_timestamp();
  IF NOT held THEN DELETE FROM privacy.account_active_days WHERE user_id = subject; END IF;
  INSERT INTO identity.consent_records(id, user_id, purpose, policy_version, granted, created_at)
    VALUES(p_id, subject, 'account_daily_activity', p_notice, p_granted, at_time);
  INSERT INTO privacy.activity_measurement_consents(user_id, consent_id, revision, granted, continuous_since)
    VALUES(subject, p_id, p_revision + 1, p_granted, CASE WHEN p_granted THEN at_time END)
    ON CONFLICT(user_id) DO UPDATE SET consent_id = EXCLUDED.consent_id, revision = EXCLUDED.revision,
      granted = EXCLUDED.granted, continuous_since = EXCLUDED.continuous_since;
  PERFORM privacy.reconcile_activity_measurement_locations(subject);
  RETURN privacy.activity_measurement_status();
END;
$$;

CREATE FUNCTION privacy.record_activity_measurement_day(p_revision bigint, p_epoch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE subject uuid := privacy.activity_measurement_subject(); consent privacy.activity_measurement_consents%ROWTYPE;
  at_time timestamptz; day date; inserted integer;
BEGIN
  PERFORM id FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'activity_account_required'; END IF;
  IF privacy.activity_measurement_lock_holds(subject) THEN RAISE EXCEPTION 'activity_privacy_held'; END IF;
  IF NOT privacy.activity_measurement_enabled() THEN RAISE EXCEPTION 'activity_pilot_disabled'; END IF;
  IF EXISTS (SELECT 1 FROM privacy.requests WHERE subject_id = subject AND request_type = 'delete'
    AND state NOT IN ('completed', 'failed', 'cancelled')) THEN RAISE EXCEPTION 'activity_consent_required'; END IF;
  SELECT * INTO consent FROM privacy.activity_measurement_consents WHERE user_id = subject FOR UPDATE;
  IF NOT COALESCE(consent.granted, false) OR consent.revision IS DISTINCT FROM p_revision OR consent.consent_id IS DISTINCT FROM p_epoch THEN
    RAISE EXCEPTION 'activity_consent_required';
  END IF;
  at_time := clock_timestamp(); day := (at_time AT TIME ZONE 'UTC')::date;
  DELETE FROM privacy.account_active_days WHERE user_id = subject AND expires_at <= at_time;
  INSERT INTO privacy.account_active_days(user_id, active_day, consent_id, expires_at)
    VALUES(subject, day, consent.consent_id, ((day + 61)::timestamp AT TIME ZONE 'UTC')) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 1 THEN PERFORM privacy.reconcile_activity_measurement_locations(subject); END IF;
  RETURN jsonb_build_object('activeDay', day, 'inserted', inserted = 1);
END;
$$;

CREATE FUNCTION privacy.activity_measurement_aggregate() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE subject uuid := privacy.activity_measurement_subject(); at_time timestamptz := statement_timestamp(); day date := (at_time AT TIME ZONE 'UTC')::date; result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM identity.admin_memberships WHERE user_id = subject AND role = 'owner' AND active) THEN
    RAISE EXCEPTION 'activity_owner_required'; END IF;
  IF NOT privacy.activity_measurement_enabled() THEN RETURN jsonb_build_object('enabled', false, 'sampledAt', to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')); END IF;
  IF (SELECT count(*) FROM (SELECT user_id FROM privacy.activity_measurement_consents WHERE granted ORDER BY user_id LIMIT 5001) bounded) > 5000 THEN
    RETURN jsonb_build_object('enabled', true, 'sampledAt', to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'accountRows', 5001);
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT user_id, continuous_since, consent_id FROM privacy.activity_measurement_consents
    WHERE granted ORDER BY user_id LIMIT 5001
  ), cohort AS MATERIALIZED (
    SELECT c.user_id, c.continuous_since, c.consent_id FROM candidates c
    JOIN identity.users u ON u.id = c.user_id
    WHERE u.status = 'active' AND u.deleted_at IS NULL AND NOT u.is_production_acceptance
      AND NOT EXISTS (SELECT 1 FROM privacy.legal_holds h WHERE h.subject_id = c.user_id AND h.active)
  ), activity AS MATERIALIZED (
    SELECT c.user_id, c.continuous_since, EXISTS(SELECT 1 FROM privacy.account_active_days a
      WHERE a.user_id = c.user_id AND a.consent_id = c.consent_id AND a.active_day = day - 1 AND a.expires_at > at_time) AS daily,
    EXISTS(SELECT 1 FROM privacy.account_active_days a WHERE a.user_id = c.user_id AND a.consent_id = c.consent_id
      AND a.active_day >= day - 7 AND a.active_day < day AND a.expires_at > at_time) AS weekly,
    EXISTS(SELECT 1 FROM privacy.account_active_days a WHERE a.user_id = c.user_id AND a.consent_id = c.consent_id
      AND a.active_day >= day - 30 AND a.active_day < day AND a.expires_at > at_time) AS monthly,
    EXISTS(SELECT 1 FROM privacy.account_active_days a WHERE a.user_id = c.user_id AND a.consent_id = c.consent_id
      AND a.active_day >= day - 60 AND a.active_day < day - 30 AND a.expires_at > at_time) AS previous
    FROM cohort c
  ), coverage AS MATERIALIZED (
    SELECT coverage_day FROM privacy.activity_measurement_coverage WHERE complete AND verified_at <= at_time
      AND coverage_day >= day - 60 AND coverage_day < day ORDER BY coverage_day LIMIT 60
  ), periods AS (SELECT span FROM (VALUES (1), (7), (30), (60)) windows(span))
  SELECT jsonb_build_object('enabled', true, 'sampledAt', to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'accountRows', (SELECT count(*) FROM candidates),
    'periods', (SELECT jsonb_object_agg(span::text, jsonb_build_object(
      'cohortSize', (SELECT count(*) FROM activity WHERE continuous_since <= ((day - span)::timestamp AT TIME ZONE 'UTC')),
      'observed', (SELECT count(*) FROM activity WHERE continuous_since <= ((day - span)::timestamp AT TIME ZONE 'UTC')
        AND CASE span WHEN 1 THEN daily WHEN 7 THEN weekly WHEN 30 THEN monthly ELSE previous AND NOT monthly END),
      'covered', (SELECT count(*) FROM coverage WHERE coverage_day >= day - span) = span
        AND (SELECT cutover_at <= ((day - span)::timestamp AT TIME ZONE 'UTC') FROM privacy.activity_measurement_configuration WHERE singleton))) FROM periods)) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION privacy.export_activity_measurement(p_request uuid, p_subject uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb; held boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM privacy.requests WHERE id = p_request AND subject_id = p_subject AND request_type = 'export'
    AND state NOT IN ('completed', 'failed', 'cancelled')) THEN RAISE EXCEPTION 'activity_privacy_request_invalid'; END IF;
  PERFORM id FROM identity.users WHERE id = p_subject FOR UPDATE;
  held := privacy.activity_measurement_lock_holds(p_subject);
  SELECT jsonb_build_object('retentionException', CASE WHEN held THEN 'legal_hold' END,
    'consent', (SELECT jsonb_build_object('purpose', 'account_daily_activity', 'noticeVersion', 'activity-account-day-v1',
      'granted', granted, 'revision', revision, 'continuousSince', to_char(continuous_since AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM privacy.activity_measurement_consents WHERE user_id = p_subject),
    'activeDates', COALESCE((SELECT jsonb_agg(active_day ORDER BY active_day) FROM privacy.account_active_days
      WHERE user_id = p_subject AND (held OR expires_at > statement_timestamp())), '[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION privacy.purge_activity_measurement(p_request uuid, p_subject uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE removed integer;
BEGIN
  PERFORM id FROM identity.users WHERE id = p_subject FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM privacy.requests WHERE id = p_request AND subject_id = p_subject AND request_type = 'delete'
    AND state NOT IN ('completed', 'failed', 'cancelled')) THEN RAISE EXCEPTION 'activity_privacy_request_invalid'; END IF;
  IF privacy.activity_measurement_lock_holds(p_subject) THEN RAISE EXCEPTION 'activity_privacy_held'; END IF;
  DELETE FROM privacy.account_active_days WHERE user_id = p_subject;
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM privacy.activity_measurement_consents WHERE user_id = p_subject;
  DELETE FROM privacy.subject_data_locations WHERE subject_id = p_subject AND resource_reference = 'identity.consent_records'
    AND entity_id IN (SELECT id FROM identity.consent_records WHERE user_id = p_subject AND purpose = 'account_daily_activity');
  DELETE FROM identity.consent_records WHERE user_id = p_subject AND purpose = 'account_daily_activity';
  PERFORM privacy.reconcile_activity_measurement_locations(p_subject);
  RETURN removed;
END;
$$;

CREATE FUNCTION privacy.expire_activity_measurement(p_limit integer DEFAULT 500) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE removed integer := 0; affected uuid; batch_removed integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN RAISE EXCEPTION 'activity_invalid_batch'; END IF;
  -- Accounts precede dates in every mutation's lock order. Candidate dates and
  -- total deletions are bounded; active holds are excluded and rechecked under
  -- locks. A racing activation raises 55P03 and rolls back the complete batch.
  FOR affected IN
    WITH expired_candidates AS MATERIALIZED (
      SELECT a.user_id, a.active_day, a.expires_at FROM privacy.account_active_days a
      WHERE a.expires_at <= statement_timestamp()
        AND NOT EXISTS (SELECT 1 FROM privacy.legal_holds h WHERE h.subject_id = a.user_id AND h.active)
      ORDER BY a.expires_at, a.user_id, a.active_day LIMIT p_limit
    ), withdrawn_candidates AS MATERIALIZED (
      SELECT a.user_id, a.active_day, a.expires_at FROM privacy.activity_measurement_consents c
      JOIN privacy.account_active_days a ON a.user_id = c.user_id
      WHERE NOT c.granted AND NOT EXISTS (SELECT 1 FROM privacy.legal_holds h WHERE h.subject_id = c.user_id AND h.active)
      ORDER BY c.user_id, a.active_day LIMIT p_limit
    ), candidates AS MATERIALIZED (
      SELECT user_id FROM (SELECT * FROM expired_candidates UNION SELECT * FROM withdrawn_candidates) pending
      ORDER BY expires_at, user_id, active_day LIMIT p_limit
    ) SELECT u.id FROM identity.users u
      WHERE u.id IN (SELECT user_id FROM candidates) ORDER BY u.id FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT privacy.activity_measurement_lock_holds(affected) THEN
      WITH expired AS (SELECT active_day FROM privacy.account_active_days
        WHERE user_id = affected AND (expires_at <= statement_timestamp()
          OR EXISTS (SELECT 1 FROM privacy.activity_measurement_consents c WHERE c.user_id = affected AND NOT c.granted))
        ORDER BY active_day LIMIT (p_limit - removed) FOR UPDATE SKIP LOCKED)
      DELETE FROM privacy.account_active_days a USING expired e WHERE a.user_id = affected AND a.active_day = e.active_day;
      GET DIAGNOSTICS batch_removed = ROW_COUNT;
      removed := removed + batch_removed;
      DELETE FROM privacy.subject_data_locations l
        WHERE l.subject_id = affected AND l.resource_reference = 'privacy.account_active_days'
          AND NOT EXISTS (SELECT 1 FROM privacy.account_active_days a WHERE a.user_id = affected);
    END IF;
    EXIT WHEN removed >= p_limit;
  END LOOP;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION privacy.activity_measurement_subject(), privacy.activity_measurement_enabled(), privacy.activity_measurement_status(),
  privacy.set_activity_measurement_consent(uuid,boolean,bigint,uuid,text), privacy.record_activity_measurement_day(bigint,uuid), privacy.activity_measurement_aggregate(),
  privacy.export_activity_measurement(uuid,uuid), privacy.purge_activity_measurement(uuid,uuid), privacy.expire_activity_measurement(integer),
  privacy.reconcile_activity_measurement_locations(uuid), privacy.activity_measurement_lock_holds(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA privacy TO lythaus_runtime, lythaus_admin, lythaus_privacy;
GRANT EXECUTE ON FUNCTION privacy.activity_measurement_status(), privacy.set_activity_measurement_consent(uuid,boolean,bigint,uuid,text),
  privacy.record_activity_measurement_day(bigint,uuid) TO lythaus_runtime;
GRANT EXECUTE ON FUNCTION privacy.activity_measurement_aggregate() TO lythaus_admin;
GRANT EXECUTE ON FUNCTION privacy.export_activity_measurement(uuid,uuid), privacy.purge_activity_measurement(uuid,uuid),
  privacy.expire_activity_measurement(integer), privacy.reconcile_activity_measurement_locations(uuid) TO lythaus_privacy;

COMMIT;
