CREATE TABLE system.cost_budget_periods (
  period_key text PRIMARY KEY,
  limit_usd numeric(12, 6) NOT NULL CHECK (limit_usd > 0),
  warning_usd numeric(12, 6) NOT NULL CHECK (warning_usd > 0 AND warning_usd < limit_usd),
  optional_analysis_usd numeric(12, 6) NOT NULL CHECK (optional_analysis_usd >= warning_usd AND optional_analysis_usd < limit_usd),
  essential_only_usd numeric(12, 6) NOT NULL CHECK (essential_only_usd >= optional_analysis_usd AND essential_only_usd < limit_usd),
  deep_scan_stop_usd numeric(12, 6) NOT NULL CHECK (deep_scan_stop_usd >= essential_only_usd AND deep_scan_stop_usd <= limit_usd),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'warning', 'critical', 'halted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE system.cost_budget_reservations (
  id uuid PRIMARY KEY,
  period_key text NOT NULL REFERENCES system.cost_budget_periods(period_key),
  idempotency_key text NOT NULL UNIQUE,
  operation text NOT NULL,
  operation_class text NOT NULL CHECK (operation_class IN ('essential', 'optional', 'experiment')),
  estimated_cost_usd numeric(12, 6) NOT NULL CHECK (estimated_cost_usd >= 0),
  actual_cost_usd numeric(12, 6) CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released', 'expired', 'rejected', 'reconciled')),
  correlation_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cost_budget_reservations_period_status_idx
  ON system.cost_budget_reservations (period_key, status);

CREATE INDEX cost_budget_reservations_expiry_idx
  ON system.cost_budget_reservations (expires_at)
  WHERE status = 'reserved';

CREATE TABLE system.cost_usage_events (
  id uuid PRIMARY KEY,
  period_key text NOT NULL REFERENCES system.cost_budget_periods(period_key),
  reservation_id uuid REFERENCES system.cost_budget_reservations(id),
  operation text NOT NULL,
  provider text NOT NULL,
  external_reference text NOT NULL UNIQUE,
  amount_usd numeric(12, 6) NOT NULL CHECK (amount_usd >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cost_usage_events_period_idx
  ON system.cost_usage_events (period_key, occurred_at DESC);

CREATE TABLE system.cost_kill_switches (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
