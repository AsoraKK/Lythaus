-- Operational rollback proposal: preserve support data and privacy capabilities.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
DO $$ BEGIN
  IF current_database() NOT LIKE 'lythaus_support_test%' THEN
    RAISE EXCEPTION 'support rollback proposal is disposable-local-only';
  END IF;
END $$;
REVOKE ALL ON support.requests,support.messages,support.notes,support.evidence,
  support.decisions,support.operation_refs FROM lythaus_runtime,lythaus_admin;
REVOKE EXECUTE ON FUNCTION support.lock_owner(bytea),
  support.claim_owner_idempotency(uuid,text,text,text),
  support.finish_owner_idempotency(uuid,text,text,text,uuid,integer,uuid)
  FROM lythaus_runtime,lythaus_admin;
REVOKE USAGE ON SCHEMA support FROM lythaus_runtime,lythaus_admin;
COMMIT;
