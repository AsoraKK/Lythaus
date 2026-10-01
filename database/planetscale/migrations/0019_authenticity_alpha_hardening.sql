ALTER TABLE moderation.authenticity_alpha
  ADD COLUMN advice_reservation_id uuid REFERENCES system.cost_budget_reservations(id),
  ADD COLUMN purge_state text NOT NULL DEFAULT 'not_requested'
    CHECK (purge_state IN ('not_requested','pending','completed','blocked')),
  ADD COLUMN purge_attempts integer NOT NULL DEFAULT 0 CHECK (purge_attempts >= 0),
  ADD COLUMN purge_requested_at timestamptz,
  ADD COLUMN purge_completed_at timestamptz,
  ADD COLUMN purge_last_error text,
  ADD COLUMN storage_released_at timestamptz;

ALTER TABLE moderation.authenticity_alpha_steps
  ADD COLUMN reservation_id uuid REFERENCES system.cost_budget_reservations(id);

CREATE INDEX authenticity_alpha_purge_idx
  ON moderation.authenticity_alpha(purge_requested_at, updated_at)
  WHERE deleted_at IS NOT NULL AND purge_state = 'pending';

CREATE FUNCTION privacy.alpha_subject_has_hold(p_subject_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, privacy AS $$
  SELECT EXISTS(
    SELECT 1 FROM privacy.legal_holds
     WHERE subject_id = p_subject_id AND active
  );
$$;
REVOKE ALL ON FUNCTION privacy.alpha_subject_has_hold(uuid) FROM PUBLIC;
