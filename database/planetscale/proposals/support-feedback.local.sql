BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'lythaus_support_test%' THEN
    RAISE EXCEPTION 'support proposal is disposable-local-only';
  END IF;
END $$;

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
COMMIT;
