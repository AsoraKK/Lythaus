-- Installed only by the protected migration lane with separate exact-payload consent.
-- Installation leaves the capability disabled. Activation is a separate approval.
CREATE SCHEMA admin_recovery AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA admin_recovery
  FROM PUBLIC, lythaus_admin, lythaus_runtime, lythaus_jobs, lythaus_privacy;

CREATE TABLE admin_recovery.subject_rebind_control (
  id uuid PRIMARY KEY,
  singleton boolean NOT NULL UNIQUE CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740990),
  policy_text text NOT NULL DEFAULT 'DISABLED' CHECK (length(policy_text) BETWEEN 1 AND 16384),
  capability_sha256 text NOT NULL CHECK (capability_sha256 ~ '^[a-f0-9]{64}$'),
  disabled_from_policy_sha256 text CHECK (disabled_from_policy_sha256 ~ '^[a-f0-9]{64}$')
);
ALTER TABLE admin_recovery.subject_rebind_control OWNER TO postgres;
REVOKE ALL ON TABLE admin_recovery.subject_rebind_control
  FROM PUBLIC, lythaus_admin, lythaus_runtime, lythaus_jobs, lythaus_privacy;

CREATE FUNCTION identity.admin_subject_rebind_policy()
RETURNS TABLE (policy_text text, revision bigint, capability_sha256 text, disabled_from_policy_sha256 text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT control.policy_text, control.revision, control.capability_sha256, control.disabled_from_policy_sha256
    FROM admin_recovery.subject_rebind_control AS control WHERE control.singleton
$$;
ALTER FUNCTION identity.admin_subject_rebind_policy() OWNER TO postgres;
REVOKE ALL ON FUNCTION identity.admin_subject_rebind_policy()
  FROM PUBLIC, lythaus_runtime, lythaus_jobs, lythaus_privacy;
GRANT EXECUTE ON FUNCTION identity.admin_subject_rebind_policy() TO lythaus_admin;

CREATE FUNCTION identity.admin_subject_rebind_restore_state()
RETURNS TABLE (id uuid, disabled boolean, revision bigint, capability_sha256 text, disabled_from_policy_sha256 text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT control.id, true, control.revision, control.capability_sha256, control.disabled_from_policy_sha256
    FROM admin_recovery.subject_rebind_control AS control
   WHERE control.singleton AND control.policy_text = 'DISABLED'
$$;
ALTER FUNCTION identity.admin_subject_rebind_restore_state() OWNER TO postgres;
REVOKE ALL ON FUNCTION identity.admin_subject_rebind_restore_state()
  FROM PUBLIC, lythaus_admin, lythaus_runtime, lythaus_jobs, lythaus_privacy;
GRANT EXECUTE ON FUNCTION identity.admin_subject_rebind_restore_state() TO pscale_api_qodocjs6vgrb;

CREATE FUNCTION identity.rebind_control_plane_administrator(
  p_next_subject_hmac bytea,
  p_source_sha text,
  p_worker_version_id uuid,
  p_email_sha256 text,
  p_nonce bytea,
  p_expires_at bigint,
  p_audit_id uuid,
  p_correlation_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  policy_value text;
  control_revision bigint;
  capability_hash text;
  disabled_from_hash text;
  policy jsonb;
  binding_proof jsonb;
  checked_at bigint;
  not_before bigint;
  expires_at bigint;
  membership identity.admin_memberships%ROWTYPE;
  principal identity.users%ROWTYPE;
  commitment text;
BEGIN
  IF pg_catalog.pg_is_in_recovery()
     OR ('vqa2g2xc9wsl' = ANY(pg_catalog.regexp_split_to_array(
       pg_catalog.current_setting('cluster_name'), '[^a-z0-9]+'))) IS NOT TRUE THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'));
  PERFORM pg_advisory_xact_lock(hashtext('lythaus:first-admin-bootstrap:v1'));
  SELECT control.policy_text, control.revision, control.capability_sha256, control.disabled_from_policy_sha256
    INTO policy_value, control_revision, capability_hash, disabled_from_hash
    FROM admin_recovery.subject_rebind_control AS control WHERE control.singleton FOR UPDATE;
  IF NOT FOUND OR policy_value = 'DISABLED' OR control_revision < 1 OR disabled_from_hash IS NOT NULL THEN
    RETURN false;
  END IF;
  BEGIN
    policy := policy_value::jsonb;
    binding_proof := policy->'bindingProof';
    IF jsonb_typeof(policy) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['schemaVersion','mode','origin','accessIssuer','accessAudience',
                    'sourceSha','workerVersionId','emailSha256','nonceHex','commitmentSha256','reference']) AS key
                   WHERE jsonb_typeof(policy->key) IS DISTINCT FROM 'string')
       OR (SELECT string_agg(key, ',' ORDER BY key) FROM jsonb_object_keys(policy) AS key)
          IS DISTINCT FROM 'accessAudience,accessIssuer,bindingProof,capabilitySha256,commitmentSha256,controlRevision,databaseTarget,emailSha256,expiresAt,mode,nonceHex,notBefore,origin,reference,schemaVersion,sourceSha,workerVersionId'
       OR policy->>'schemaVersion' IS DISTINCT FROM 'lythaus-admin-subject-rebind-v3'
       OR policy->>'capabilitySha256' IS DISTINCT FROM capability_hash
       OR jsonb_typeof(policy->'controlRevision') IS DISTINCT FROM 'number'
       OR policy->'controlRevision' IS DISTINCT FROM to_jsonb(control_revision)
       OR policy->>'mode' IS DISTINCT FROM 'execute'
       OR policy->>'origin' IS DISTINCT FROM 'https://admin.lythaus.co'
       OR jsonb_typeof(policy->'notBefore') IS DISTINCT FROM 'number'
       OR jsonb_typeof(policy->'expiresAt') IS DISTINCT FROM 'number'
       OR NOT (policy->>'commitmentSha256' ~ '^[a-f0-9]{64}$')
       OR NOT (policy->>'emailSha256' ~ '^[a-f0-9]{64}$')
       OR NOT (policy->>'nonceHex' ~ '^[a-f0-9]{64}$')
       OR NOT (policy->>'sourceSha' ~ '^[a-f0-9]{40}$')
       OR NOT (policy->>'workerVersionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
       OR NOT (policy->>'accessAudience' ~ '^[A-Za-z0-9_-]{1,128}$')
       OR NOT (policy->>'accessIssuer' ~ '^https://[a-z0-9-]+[.]cloudflareaccess[.]com$')
       OR jsonb_typeof(policy->'reference') IS DISTINCT FROM 'string'
       OR length(policy->>'reference') NOT BETWEEN 1 AND 200
       OR jsonb_typeof(policy->'databaseTarget') IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['branchId','databaseName','originFingerprint','roleFingerprint']) AS key
                   WHERE jsonb_typeof(policy->'databaseTarget'->key) IS DISTINCT FROM 'string')
       OR (SELECT string_agg(key, ',' ORDER BY key) FROM jsonb_object_keys(policy->'databaseTarget') AS key)
          IS DISTINCT FROM 'branchId,databaseName,originFingerprint,roleFingerprint'
       OR policy->'databaseTarget'->>'branchId' IS DISTINCT FROM 'vqa2g2xc9wsl'
       OR policy->'databaseTarget'->>'databaseName' IS DISTINCT FROM current_database()
       OR current_database() <> 'postgres'
       OR NOT (policy->'databaseTarget'->>'originFingerprint' ~ '^[a-f0-9]{64}$')
       OR NOT (policy->'databaseTarget'->>'roleFingerprint' ~ '^[a-f0-9]{64}$') THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(binding_proof) IS DISTINCT FROM 'object'
       OR (SELECT string_agg(key, ',' ORDER BY key) FROM jsonb_object_keys(binding_proof) AS key)
          IS DISTINCT FROM 'binding,branchId,checkedAt,databaseName,expiresAt,hyperdriveId,originFingerprint,releaseRunId,roleFingerprint,schemaVersion,sourceSha,worker,workerVersionId'
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['schemaVersion','worker','binding','hyperdriveId','sourceSha',
                    'workerVersionId','releaseRunId','branchId','databaseName','originFingerprint','roleFingerprint']) AS key
                   WHERE jsonb_typeof(binding_proof->key) IS DISTINCT FROM 'string')
       OR binding_proof->>'schemaVersion' IS DISTINCT FROM 'lythaus-admin-rebind-binding-v1'
       OR binding_proof->>'worker' IS DISTINCT FROM 'lythaus-admin-api-development'
       OR binding_proof->>'binding' IS DISTINCT FROM 'DB_ADMIN_FRESH'
       OR binding_proof->>'hyperdriveId' IS DISTINCT FROM '6bfbb0eab42642e8ad294dbf59294ed3'
       OR binding_proof->>'sourceSha' IS DISTINCT FROM policy->>'sourceSha'
       OR binding_proof->>'workerVersionId' IS DISTINCT FROM policy->>'workerVersionId'
       OR NOT (binding_proof->>'releaseRunId' ~ '^[1-9][0-9]*$')
       OR policy->>'reference' IS DISTINCT FROM 'canonical-release:' || (binding_proof->>'releaseRunId') || ':admin-subject-rebind'
       OR binding_proof->>'branchId' IS DISTINCT FROM policy->'databaseTarget'->>'branchId'
       OR binding_proof->>'databaseName' IS DISTINCT FROM policy->'databaseTarget'->>'databaseName'
       OR binding_proof->>'originFingerprint' IS DISTINCT FROM policy->'databaseTarget'->>'originFingerprint'
       OR binding_proof->>'roleFingerprint' IS DISTINCT FROM policy->'databaseTarget'->>'roleFingerprint'
       OR jsonb_typeof(binding_proof->'checkedAt') IS DISTINCT FROM 'number'
       OR jsonb_typeof(binding_proof->'expiresAt') IS DISTINCT FROM 'number'
       OR NOT (binding_proof->>'checkedAt' ~ '^[0-9]+$')
       OR binding_proof->'expiresAt' IS DISTINCT FROM policy->'expiresAt' THEN
      RETURN false;
    END IF;
    checked_at := (binding_proof->>'checkedAt')::bigint;
    not_before := (policy->>'notBefore')::bigint;
    expires_at := (policy->>'expiresAt')::bigint;
    IF not_before NOT BETWEEN 0 AND 4102444800 OR expires_at NOT BETWEEN 0 AND 4102444800
       OR expires_at <= not_before OR expires_at - not_before > 900
       OR checked_at < not_before OR checked_at >= expires_at
       OR clock_timestamp() < to_timestamp(checked_at) THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
    RETURN false;
  END;

  IF p_source_sha IS DISTINCT FROM policy->>'sourceSha'
     OR p_worker_version_id::text IS DISTINCT FROM policy->>'workerVersionId'
     OR p_email_sha256 IS DISTINCT FROM policy->>'emailSha256'
     OR p_expires_at IS DISTINCT FROM expires_at
     OR p_next_subject_hmac IS NULL OR octet_length(p_next_subject_hmac) <> 32
     OR p_nonce IS NULL OR octet_length(p_nonce) <> 32
     OR p_nonce IS DISTINCT FROM decode(policy->>'nonceHex', 'hex')
     OR p_audit_id IS NULL OR p_correlation_id IS NULL
     OR length(p_correlation_id) NOT BETWEEN 1 AND 200 THEN
    RETURN false;
  END IF;

  LOCK TABLE identity.admin_memberships IN SHARE ROW EXCLUSIVE MODE;
  -- Recheck the deadline after waiting for any concurrent operation.
  IF clock_timestamp() < to_timestamp(not_before) OR clock_timestamp() >= to_timestamp(expires_at)
     OR (SELECT count(*) FROM identity.admin_memberships) <> 1
     OR NOT EXISTS (SELECT 1 FROM system.feature_flags
                    WHERE flag_key = 'identity.first_admin_bootstrap_consumed' AND enabled = true) THEN
    RETURN false;
  END IF;
  SELECT * INTO membership FROM identity.admin_memberships FOR UPDATE;
  SELECT * INTO principal FROM identity.users WHERE id = membership.user_id FOR UPDATE;
  IF NOT FOUND OR principal.status <> 'locked' OR principal.deleted_at IS NOT NULL
     OR principal.display_name <> 'Lythaus control-plane administrator'
     OR membership.role <> 'administrator' OR NOT membership.active OR membership.revoked_at IS NOT NULL
     OR octet_length(membership.access_subject_hmac) <> 32
     OR membership.access_subject_hmac = p_next_subject_hmac
     OR EXISTS (SELECT 1 FROM identity.email_credentials WHERE user_id = principal.id)
     OR EXISTS (SELECT 1 FROM identity.provider_links WHERE user_id = principal.id)
     OR EXISTS (SELECT 1 FROM identity.handles WHERE user_id = principal.id)
     OR EXISTS (SELECT 1 FROM social.profiles WHERE user_id = principal.id)
     OR (SELECT count(*) FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped') <> 1
     OR NOT EXISTS (SELECT 1 FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped'
                     AND actor_id = principal.id AND target_type = 'admin_membership' AND target_id = principal.id
                     AND metadata = '{"createdCount":1,"role":"administrator","principalType":"control_plane"}'::jsonb) THEN
    RETURN false;
  END IF;

  commitment := encode(sha256(
    convert_to('lythaus:admin-subject-rebind:v2', 'UTF8') || decode('00', 'hex')
    || uuid_send(principal.id) || membership.access_subject_hmac || p_next_subject_hmac
    || decode(p_source_sha, 'hex') || uuid_send(p_worker_version_id) || decode(p_email_sha256, 'hex')
    || p_nonce || int8send(p_expires_at) || int8send(control_revision) || decode(capability_hash, 'hex')), 'hex');
  IF commitment IS DISTINCT FROM policy->>'commitmentSha256' THEN
    RETURN false;
  END IF;

  IF clock_timestamp() < to_timestamp(not_before) OR clock_timestamp() >= to_timestamp(expires_at) THEN
    RETURN false;
  END IF;

  UPDATE identity.admin_memberships SET access_subject_hmac = p_next_subject_hmac
   WHERE user_id = principal.id AND access_subject_hmac = membership.access_subject_hmac;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin subject rebind state changed' USING ERRCODE = '40001'; END IF;
  INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
  VALUES (p_audit_id, principal.id, 'identity.admin_subject_rebound', 'admin_membership', principal.id,
    'OWNER_APPROVED_IDENTITY_MIGRATION', p_correlation_id,
    jsonb_build_object('changedCount', 1, 'role', 'administrator', 'principalType', 'control_plane',
      'sourceSha', p_source_sha, 'workerVersionId', p_worker_version_id,
      'approvalCommitmentSha256', commitment, 'approvalReference', policy->>'reference'));
  UPDATE admin_recovery.subject_rebind_control
     SET policy_text = 'DISABLED', revision = revision + 1,
         disabled_from_policy_sha256 = encode(sha256(convert_to(policy_value, 'UTF8')), 'hex')
   WHERE singleton AND revision = control_revision AND policy_text = policy_value;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin subject rebind policy changed' USING ERRCODE = '40001'; END IF;
  IF clock_timestamp() < to_timestamp(not_before) OR clock_timestamp() >= to_timestamp(expires_at) THEN
    RAISE EXCEPTION 'admin subject rebind approval expired during write' USING ERRCODE = '57014';
  END IF;
  RETURN true;
END;
$$;

ALTER FUNCTION identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)
  FROM PUBLIC, lythaus_runtime, lythaus_jobs, lythaus_privacy;
GRANT EXECUTE ON FUNCTION identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)
  TO lythaus_admin;
