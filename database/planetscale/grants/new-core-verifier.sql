REVOKE ALL ON TABLE identity.admin_memberships, system.feature_flags, system.audit_events,
  identity.users, identity.email_credentials, identity.provider_links, identity.handles, social.profiles
  FROM lythaus_verifier;
REVOKE ALL ON SCHEMA identity, system FROM lythaus_verifier;
REVOKE ALL ON SCHEMA social FROM lythaus_verifier;
GRANT USAGE ON SCHEMA identity, system TO lythaus_verifier;
GRANT USAGE ON SCHEMA social TO lythaus_verifier;
GRANT CONNECT ON DATABASE postgres TO lythaus_verifier;

CREATE OR REPLACE FUNCTION system.read_first_admin_bootstrap_state()
RETURNS TABLE (
  membership_count integer,
  active_admin_membership_count integer,
  active_non_admin_membership_count integer,
  bootstrap_latch_count integer,
  bootstrap_consumed boolean,
  completion_audit_count integer,
  bootstrap_control_plane_count integer,
  bootstrap_consumer_material_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, identity, system, social
SET row_security = off
AS $$
  SELECT
    (SELECT count(*)::integer FROM identity.admin_memberships),
    (SELECT count(*)::integer FROM identity.admin_memberships WHERE active = true AND role = 'administrator'),
    (SELECT count(*)::integer FROM identity.admin_memberships WHERE active = true AND role <> 'administrator'),
    (SELECT count(*)::integer FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed'),
    (SELECT coalesce(bool_or(enabled), false) FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed'),
    (SELECT count(*)::integer FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped'),
    (SELECT count(*)::integer
       FROM identity.users user_entry
       JOIN identity.admin_memberships membership ON membership.user_id = user_entry.id
      WHERE user_entry.status = 'locked'
        AND user_entry.display_name = 'Lythaus control-plane administrator'
        AND membership.role = 'administrator'
        AND membership.active = true),
    (SELECT (
       (SELECT count(*) FROM identity.email_credentials credential_entry
          JOIN identity.admin_memberships membership ON membership.user_id = credential_entry.user_id)
       + (SELECT count(*) FROM identity.provider_links provider_entry
            JOIN identity.admin_memberships membership ON membership.user_id = provider_entry.user_id)
       + (SELECT count(*) FROM identity.handles handle_entry
            JOIN identity.admin_memberships membership ON membership.user_id = handle_entry.user_id)
       + (SELECT count(*) FROM social.profiles profile_entry
            JOIN identity.admin_memberships membership ON membership.user_id = profile_entry.user_id)
     )::integer)
$$;

REVOKE ALL ON FUNCTION system.read_first_admin_bootstrap_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION system.read_first_admin_bootstrap_state() FROM lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy, lythaus_migrations;
GRANT EXECUTE ON FUNCTION system.read_first_admin_bootstrap_state() TO lythaus_verifier;
