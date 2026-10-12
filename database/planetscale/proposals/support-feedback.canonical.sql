-- Review proposal only. Outside the canonical manifest; no production execution.
-- Promotion must assign a canonical version and approved real role mapping.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
DO $preflight$
BEGIN
  IF current_database() NOT LIKE 'lythaus_support_test%' THEN
    RAISE EXCEPTION 'support canonical proposal is disposable-local-only';
  END IF;
  IF to_regnamespace('support') IS NOT NULL
     OR to_regprocedure('privacy.reconcile_subject_data_locations_pre_support_feedback(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'support proposal requires absent schema; reconcile existing state through the migration ledger';
  END IF;
  IF to_regprocedure('privacy.reconcile_subject_data_locations(uuid)') IS NULL THEN
    RAISE EXCEPTION 'support proposal requires the current canonical privacy reconciler';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p
          WHERE p.oid='privacy.reconcile_subject_data_locations(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'support proposal requires reviewed SECURITY DEFINER delegation for the prior reconciler';
  END IF;
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname IN ('lythaus_support_function_owner','lythaus_support_locator_owner')
        AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
        AND NOT rolreplication AND NOT rolbypassrls) <> 2
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
                WHERE r.rolname IN ('lythaus_support_function_owner','lythaus_support_locator_owner'))
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
                JOIN pg_roles member_role ON member_role.oid=m.member
                WHERE r.rolname IN ('lythaus_support_function_owner','lythaus_support_locator_owner')
                  AND (member_role.rolname<>'lythaus_migrations' OR m.inherit_option
                       OR m.admin_option OR NOT m.set_option)) THEN
    RAISE EXCEPTION 'support proposal requires isolated NOLOGIN non-superuser function owners';
  END IF;
END;
$preflight$;

CREATE SCHEMA support;
REVOKE ALL ON SCHEMA support FROM PUBLIC;
CREATE TABLE support.requests (
  id uuid PRIMARY KEY,
  submitter_id uuid NOT NULL REFERENCES identity.users(id),
  kind text NOT NULL CHECK (kind IN ('problem','suggestion')),
  submission jsonb,
  revision integer NOT NULL CHECK (revision > 0),
  public_revision integer NOT NULL DEFAULT 1 CHECK (public_revision > 0 AND public_revision <= revision),
  state text NOT NULL CHECK (state ~ '^[a-z][a-z0-9_-]{0,63}$'),
  policy_version text NOT NULL,
  member_message text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  deleted_at timestamptz,
  CHECK (updated_at >= created_at),
  CHECK ((deleted_at IS NOT NULL AND submission IS NULL) OR
    (deleted_at IS NULL AND submission IS NOT NULL AND jsonb_typeof(submission) = 'object'
      AND submission ?& ARRAY['kind','category','title'] AND jsonb_typeof(submission->'kind') = 'string'
      AND jsonb_typeof(submission->'category') = 'string' AND jsonb_typeof(submission->'title') = 'string'
      AND submission->>'kind' = kind AND
      ((kind = 'problem' AND submission ?& ARRAY['actual','expected']
        AND jsonb_typeof(submission->'actual') = 'string' AND jsonb_typeof(submission->'expected') = 'string'
        AND (submission - ARRAY['kind','category','title','actual','expected','reproductionSteps','appVersion','platform']) = '{}'::jsonb
        AND (NOT submission ? 'reproductionSteps' OR jsonb_typeof(submission->'reproductionSteps') = 'string')
        AND (NOT submission ? 'appVersion' OR jsonb_typeof(submission->'appVersion') = 'string')
        AND (NOT submission ? 'platform' OR jsonb_typeof(submission->'platform') = 'string')) OR
       (kind = 'suggestion' AND submission ?& ARRAY['improvement','benefit']
        AND jsonb_typeof(submission->'improvement') = 'string' AND jsonb_typeof(submission->'benefit') = 'string'
        AND (submission - ARRAY['kind','category','title','improvement','benefit']) = '{}'::jsonb))))
);
CREATE INDEX support_member_cursor ON support.requests(submitter_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX support_export_cursor ON support.requests(submitter_id,id) WHERE deleted_at IS NULL;
CREATE INDEX support_queue_cursor ON support.requests(kind,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX support_retention_cursor ON support.requests(closed_at,id) WHERE deleted_at IS NULL AND closed_at IS NOT NULL;
CREATE TABLE support.messages (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support.requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity.users(id),
  author_role text NOT NULL CHECK (author_role IN ('member','owner')),
  body text NOT NULL,
  revision integer NOT NULL CHECK (revision > 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(request_id,revision)
);
CREATE TABLE support.notes (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support.requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity.users(id),
  body text NOT NULL,
  revision integer NOT NULL CHECK (revision > 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(request_id,revision)
);
CREATE TABLE support.evidence (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support.requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity.users(id),
  evidence_type text NOT NULL,
  description text NOT NULL,
  reference text,
  revision integer NOT NULL CHECK (revision > 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(request_id,revision)
);
CREATE INDEX support_messages_cursor ON support.messages(request_id,revision DESC);
CREATE INDEX support_notes_cursor ON support.notes(request_id,revision DESC);
CREATE INDEX support_evidence_cursor ON support.evidence(request_id,revision DESC);
CREATE TABLE support.decisions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support.requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES identity.users(id),
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason_code text NOT NULL,
  evidence_ids uuid[] NOT NULL,
  policy_version text NOT NULL,
  revision integer NOT NULL CHECK (revision > 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(request_id,revision)
);
CREATE INDEX support_decisions_cursor ON support.decisions(request_id,revision DESC);
CREATE TABLE support.operation_refs (
  audit_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support.requests(id) ON DELETE CASCADE,
  outbox_id uuid,
  idempotency_scope text,
  idempotency_key text,
  CHECK ((idempotency_scope IS NULL) = (idempotency_key IS NULL))
);
CREATE INDEX support_operation_refs_request ON support.operation_refs(request_id);

CREATE FUNCTION support.lock_owner(p_subject_hmac bytea) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT a.user_id FROM identity.admin_memberships a JOIN identity.users u ON u.id=a.user_id
  WHERE a.access_subject_hmac=p_subject_hmac AND a.role='owner' AND a.active AND u.status='active'
  FOR SHARE OF a,u $$;
REVOKE ALL ON FUNCTION support.lock_owner(bytea) FROM PUBLIC;

CREATE FUNCTION support.claim_owner_idempotency(p_actor uuid,p_operation text,p_key text,p_hash text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scoped text; stored jsonb;
BEGIN
  IF p_actor IS NULL OR p_operation IS NULL OR p_key IS NULL OR p_hash IS NULL OR p_operation NOT IN ('reply','note','evidence','decision') OR p_key !~ '^[A-Za-z0-9_-]{1,128}$' OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'support idempotency input invalid';
  END IF;
  PERFORM a.user_id FROM identity.admin_memberships a JOIN identity.users u ON u.id=a.user_id
    WHERE a.user_id=p_actor AND a.role='owner' AND a.active AND u.status='active' FOR SHARE OF a,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'support owner required'; END IF;
  scoped := 'support:owner:' || p_actor::text || ':' || p_operation;
  INSERT INTO system.idempotency_keys(scope,key,actor_id,response) VALUES(scoped,p_key,p_actor,jsonb_build_object('hash',p_hash)) ON CONFLICT DO NOTHING;
  SELECT response INTO stored FROM system.idempotency_keys WHERE scope=scoped AND key=p_key AND actor_id=p_actor FOR UPDATE;
  RETURN jsonb_build_object('hash',stored->'hash','requestId',stored->'requestId','recordId',stored->'recordId','revision',stored->'revision');
END $$;
CREATE FUNCTION support.finish_owner_idempotency(p_actor uuid,p_operation text,p_key text,p_hash text,p_request uuid,p_revision integer,p_record uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scoped text;
BEGIN
  IF p_actor IS NULL OR p_operation IS NULL OR p_key IS NULL OR p_hash IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_operation NOT IN ('reply','note','evidence','decision') OR p_key !~ '^[A-Za-z0-9_-]{1,128}$' OR p_hash !~ '^[0-9a-f]{64}$' OR p_revision<1 THEN
    RAISE EXCEPTION 'support idempotency input invalid';
  END IF;
  PERFORM a.user_id FROM identity.admin_memberships a JOIN identity.users u ON u.id=a.user_id
    WHERE a.user_id=p_actor AND a.role='owner' AND a.active AND u.status='active' FOR SHARE OF a,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'support owner required'; END IF;
  scoped := 'support:owner:' || p_actor::text || ':' || p_operation;
  UPDATE system.idempotency_keys SET response=jsonb_build_object('hash',p_hash,'requestId',p_request,'revision',p_revision,'recordId',p_record)
    WHERE scope=scoped AND key=p_key AND actor_id=p_actor AND response->>'hash'=p_hash AND response->>'requestId' IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'support idempotency conflict'; END IF;
END $$;
REVOKE ALL ON FUNCTION support.claim_owner_idempotency(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION support.lock_owner(bytea),
  support.claim_owner_idempotency(uuid,text,text,text),
  support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid)
  FROM PUBLIC,lythaus_runtime,lythaus_jobs,lythaus_privacy,lythaus_support_locator_owner;

-- BEGIN support intake grants
GRANT USAGE ON SCHEMA support TO lythaus_runtime,lythaus_admin,lythaus_privacy;
GRANT SELECT,INSERT,UPDATE ON support.requests TO lythaus_runtime,lythaus_admin;
GRANT SELECT,INSERT ON support.messages TO lythaus_runtime,lythaus_admin;
GRANT SELECT,INSERT ON support.notes,support.evidence,support.decisions TO lythaus_admin;
GRANT INSERT ON support.operation_refs TO lythaus_runtime,lythaus_admin;
GRANT SELECT,UPDATE,DELETE ON support.requests TO lythaus_privacy;
GRANT SELECT,DELETE ON support.messages,support.notes,support.evidence,support.decisions TO lythaus_privacy;
GRANT SELECT,DELETE ON support.operation_refs TO lythaus_privacy;
GRANT EXECUTE ON FUNCTION support.lock_owner(bytea) TO lythaus_admin;
GRANT EXECUTE ON FUNCTION support.claim_owner_idempotency(uuid,text,text,text),support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid) TO lythaus_admin;
-- END support intake grants

-- These roles are proposal labels, not observed PlanetScale role identities.
GRANT USAGE ON SCHEMA identity,system,support TO lythaus_support_function_owner;
GRANT SELECT,UPDATE(id) ON identity.users TO lythaus_support_function_owner;
GRANT SELECT,UPDATE(user_id) ON identity.admin_memberships TO lythaus_support_function_owner;
GRANT SELECT,INSERT,UPDATE ON system.idempotency_keys TO lythaus_support_function_owner;
GRANT CREATE ON SCHEMA support TO lythaus_support_function_owner;
ALTER FUNCTION support.lock_owner(bytea) OWNER TO lythaus_support_function_owner;
ALTER FUNCTION support.claim_owner_idempotency(uuid,text,text,text) OWNER TO lythaus_support_function_owner;
ALTER FUNCTION support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid) OWNER TO lythaus_support_function_owner;
REVOKE CREATE ON SCHEMA support FROM lythaus_support_function_owner;

-- Pending classification carries no retention duration or approved legal basis.
CREATE FUNCTION privacy.reconcile_support_subject_data_locations(p_subject_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $locator$
DECLARE subject_held boolean; observed_tables integer; valid_tables integer;
BEGIN
  IF p_subject_id IS NULL THEN RAISE EXCEPTION 'support locator subject required'; END IF;
  SELECT count(*),count(*) FILTER (WHERE c.relkind IN ('r','p'))
    INTO observed_tables,valid_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='support' AND c.relname IN
     ('requests','messages','notes','evidence','decisions','operation_refs');
  IF observed_tables=0 THEN RETURN 0; END IF;
  IF observed_tables<>6 OR valid_tables<>6 THEN
    RAISE EXCEPTION 'support privacy schema incomplete';
  END IF;
  PERFORM u.id FROM identity.users u WHERE u.id=p_subject_id FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT coalesce(bool_or(h.active),false) INTO subject_held
    FROM privacy.legal_holds h WHERE h.subject_id=p_subject_id;

  DELETE FROM privacy.subject_data_locations
   WHERE subject_id=p_subject_id AND store_type='planetscale'
     AND (resource_reference IN ('support.requests','support.messages','support.notes',
          'support.evidence','support.decisions','support.operation_refs')
          OR (resource_reference='system.audit_events' AND entity_type='support_audit')
          OR (resource_reference='system.outbox_events' AND entity_type='support_intent')
          OR (resource_reference='system.idempotency_keys' AND entity_type='support_idempotency'));

  INSERT INTO privacy.subject_data_locations
    (subject_id,store_type,resource_reference,entity_type,entity_id,authoritative_or_derived,
     retention_class,deletion_state,legal_hold_state,last_verified_at)
  SELECT p_subject_id,'planetscale',located.resource,located.entity,located.id,'authoritative',
         located.retention,located.state,CASE WHEN subject_held THEN 'active' ELSE 'none' END,now()
    FROM (
      SELECT 'support.requests' AS resource,'support_request' AS entity,r.id,
             CASE WHEN r.deleted_at IS NOT NULL AND r.submission IS NULL AND r.member_message IS NULL
                  THEN 'audit' ELSE 'support_pending_v1' END AS retention,
             CASE WHEN r.deleted_at IS NOT NULL AND r.submission IS NULL AND r.member_message IS NULL
                  THEN 'retained' ELSE 'present' END AS state
        FROM support.requests r WHERE r.submitter_id=p_subject_id
      UNION ALL
      SELECT 'support.messages','support_message',m.id,'support_pending_v1','present'
        FROM support.messages m JOIN support.requests r ON r.id=m.request_id
       WHERE r.submitter_id=p_subject_id OR m.author_id=p_subject_id
      UNION ALL
      SELECT 'support.notes','support_note',n.id,'support_pending_v1','present'
        FROM support.notes n JOIN support.requests r ON r.id=n.request_id
       WHERE r.submitter_id=p_subject_id OR n.author_id=p_subject_id
      UNION ALL
      SELECT 'support.evidence','support_evidence',e.id,'support_pending_v1','present'
        FROM support.evidence e JOIN support.requests r ON r.id=e.request_id
       WHERE r.submitter_id=p_subject_id OR e.author_id=p_subject_id
      UNION ALL
      SELECT 'support.decisions','support_decision',d.id,'support_pending_v1','present'
        FROM support.decisions d JOIN support.requests r ON r.id=d.request_id
       WHERE r.submitter_id=p_subject_id OR d.actor_id=p_subject_id
      UNION ALL
      SELECT 'support.operation_refs','support_operation_ref',o.audit_id,'support_pending_v1','present'
        FROM support.operation_refs o JOIN support.requests r ON r.id=o.request_id
        LEFT JOIN system.audit_events a ON a.id=o.audit_id AND a.action LIKE 'support.%'
          AND a.metadata->>'requestId'=r.id::text
       WHERE r.submitter_id=p_subject_id OR a.actor_id=p_subject_id
          OR a.metadata->>'actorId'=p_subject_id::text
      UNION ALL
      SELECT 'system.audit_events','support_audit',a.id,
             CASE WHEN r.deleted_at IS NULL THEN 'support_pending_v1' ELSE 'audit' END,
             CASE WHEN r.deleted_at IS NULL THEN 'present' ELSE 'retained' END
        FROM system.audit_events a JOIN support.requests r ON a.metadata->>'requestId'=r.id::text
       WHERE a.action LIKE 'support.%' AND (r.submitter_id=p_subject_id OR a.actor_id=p_subject_id
          OR a.metadata->>'actorId'=p_subject_id::text)
    ) located
  ON CONFLICT (subject_id,store_type,resource_reference,entity_type,entity_key)
  DO UPDATE SET retention_class=EXCLUDED.retention_class,deletion_state=EXCLUDED.deletion_state,
                legal_hold_state=EXCLUDED.legal_hold_state,
                last_verified_at=EXCLUDED.last_verified_at;

  INSERT INTO privacy.subject_data_locations
    (subject_id,store_type,resource_reference,entity_type,entity_id,authoritative_or_derived,
     retention_class,deletion_state,legal_hold_state,last_verified_at)
  SELECT DISTINCT p_subject_id,'planetscale',located.resource,located.entity,located.id,
                  'derived','support_pending_v1','present',CASE WHEN subject_held THEN 'active' ELSE 'none' END,now()
    FROM (
      SELECT 'system.outbox_events' AS resource,'support_intent' AS entity,e.id
        FROM support.operation_refs o JOIN support.requests r ON r.id=o.request_id
        JOIN system.outbox_events e ON e.id=o.outbox_id
       WHERE e.event_type='support.workflow.changed' AND e.aggregate_id=r.id
         AND (r.submitter_id=p_subject_id OR e.actor_id=p_subject_id)
      UNION ALL
      SELECT 'system.idempotency_keys','support_idempotency',r.id
        FROM support.operation_refs o JOIN support.requests r ON r.id=o.request_id
        JOIN system.idempotency_keys k ON k.scope=o.idempotency_scope AND k.key=o.idempotency_key
       WHERE k.scope LIKE 'support:%' AND k.response->>'requestId'=r.id::text
         AND (r.submitter_id=p_subject_id OR k.actor_id=p_subject_id)
    ) located
  ON CONFLICT (subject_id,store_type,resource_reference,entity_type,entity_key)
  DO UPDATE SET retention_class=EXCLUDED.retention_class,deletion_state=EXCLUDED.deletion_state,
                legal_hold_state=EXCLUDED.legal_hold_state,
                last_verified_at=EXCLUDED.last_verified_at;

  RETURN (SELECT count(*)::integer FROM privacy.subject_data_locations
           WHERE subject_id=p_subject_id AND store_type='planetscale'
             AND (resource_reference LIKE 'support.%' OR entity_type IN
                  ('support_audit','support_intent','support_idempotency')));
END;
$locator$;
REVOKE ALL ON FUNCTION privacy.reconcile_support_subject_data_locations(uuid)
  FROM PUBLIC,lythaus_runtime,lythaus_admin,lythaus_jobs,lythaus_support_function_owner;

-- Preserve the current reconciler, including any serialized profile additions.
ALTER FUNCTION privacy.reconcile_subject_data_locations(uuid)
  RENAME TO reconcile_subject_data_locations_pre_support_feedback;
CREATE FUNCTION privacy.reconcile_subject_data_locations(p_subject_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $wrapper$
BEGIN
  PERFORM privacy.reconcile_subject_data_locations_pre_support_feedback(p_subject_id);
  PERFORM privacy.reconcile_support_subject_data_locations(p_subject_id);
  RETURN (SELECT count(*)::integer FROM privacy.subject_data_locations WHERE subject_id=p_subject_id);
END;
$wrapper$;
REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations(uuid)
  FROM PUBLIC,lythaus_runtime,lythaus_admin,lythaus_jobs,lythaus_support_function_owner;
REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations_pre_support_feedback(uuid)
  FROM PUBLIC,lythaus_runtime,lythaus_admin,lythaus_jobs,lythaus_privacy;
GRANT EXECUTE ON FUNCTION privacy.reconcile_subject_data_locations_pre_support_feedback(uuid)
  TO lythaus_support_locator_owner;

GRANT USAGE ON SCHEMA privacy,identity,support,system TO lythaus_support_locator_owner;
GRANT SELECT,UPDATE(id) ON identity.users TO lythaus_support_locator_owner;
GRANT SELECT ON support.requests,support.messages,support.notes,support.evidence,
  support.decisions,support.operation_refs TO lythaus_support_locator_owner;
GRANT SELECT(id,actor_id,metadata,action) ON system.audit_events TO lythaus_support_locator_owner;
GRANT SELECT(id,event_type,aggregate_id,actor_id) ON system.outbox_events TO lythaus_support_locator_owner;
GRANT SELECT(scope,key,response,actor_id) ON system.idempotency_keys TO lythaus_support_locator_owner;
GRANT SELECT,INSERT,UPDATE,DELETE ON privacy.subject_data_locations TO lythaus_support_locator_owner;
GRANT SELECT(subject_id,active) ON privacy.legal_holds TO lythaus_support_locator_owner;
GRANT CREATE ON SCHEMA privacy TO lythaus_support_locator_owner;
ALTER FUNCTION privacy.reconcile_support_subject_data_locations(uuid) OWNER TO lythaus_support_locator_owner;
ALTER FUNCTION privacy.reconcile_subject_data_locations(uuid) OWNER TO lythaus_support_locator_owner;
REVOKE CREATE ON SCHEMA privacy FROM lythaus_support_locator_owner;
GRANT EXECUTE ON FUNCTION privacy.reconcile_subject_data_locations(uuid),
  privacy.reconcile_support_subject_data_locations(uuid) TO lythaus_privacy;

COMMIT;
