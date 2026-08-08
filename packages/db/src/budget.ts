import { transaction, type HyperdriveBinding } from './index.ts';
import type { Client } from 'pg';

export type BudgetOperationClass = 'essential' | 'optional' | 'experiment';
export const BUDGET_RESERVATION_STATUSES = ['reserved', 'committed', 'released', 'expired', 'rejected', 'reconciled'] as const;
export type BudgetReservationStatus = typeof BUDGET_RESERVATION_STATUSES[number];

export interface BudgetConfig {
  limitUsd: number;
  warningUsd: number;
  optionalAnalysisUsd: number;
  essentialOnlyUsd: number;
  deepScanStopUsd: number;
}

export interface ReserveBudgetInput {
  period: string;
  operation: string;
  operationClass: BudgetOperationClass;
  estimatedCostUsd: number;
  idempotencyKey: string;
  provider?: string;
  correlationId?: string;
  config: BudgetConfig;
}

export interface BudgetReservation {
  id: string;
  period: string;
  status: BudgetReservationStatus;
  estimatedCostUsd: number;
  projectedSpendUsd: number;
  reused: boolean;
}

export interface SettleBudgetInput {
  reservationId: string;
  actualCostUsd: number;
  provider: string;
  externalReference?: string;
}

export interface ReconcileBudgetInput extends SettleBudgetInput {
  reason: string;
}

function assertMoney(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error(`${name}_invalid`);
}

function assertConfig(config: BudgetConfig): void {
  assertMoney(config.limitUsd, 'budget_limit');
  assertMoney(config.warningUsd, 'budget_warning');
  assertMoney(config.optionalAnalysisUsd, 'budget_optional_threshold');
  assertMoney(config.essentialOnlyUsd, 'budget_essential_threshold');
  assertMoney(config.deepScanStopUsd, 'budget_deep_scan_threshold');
  if (!(config.warningUsd < config.optionalAnalysisUsd
    && config.optionalAnalysisUsd < config.essentialOnlyUsd
    && config.essentialOnlyUsd < config.deepScanStopUsd
    && config.deepScanStopUsd <= config.limitUsd)) throw new Error('budget_thresholds_invalid');
}

export function isBudgetOperationAdmitted(
  input: Pick<ReserveBudgetInput, 'operation' | 'operationClass' | 'config'>,
  projectedSpendUsd: number,
): boolean {
  if (projectedSpendUsd >= input.config.limitUsd) return false;
  if (projectedSpendUsd >= input.config.deepScanStopUsd
    && (input.operation.includes('deep_scan') || input.operation.includes('image_scan'))) return false;
  if (projectedSpendUsd >= input.config.essentialOnlyUsd && input.operationClass !== 'essential') return false;
  if (projectedSpendUsd >= input.config.optionalAnalysisUsd && input.operationClass !== 'essential') return false;
  if (projectedSpendUsd >= input.config.warningUsd && input.operationClass === 'experiment') return false;
  return true;
}

function reservationFromRow(row: { id: string; period_key: string; status: BudgetReservationStatus; estimated_cost_usd: string | number }, projectedSpendUsd: number): BudgetReservation {
  return {
    id: row.id,
    period: row.period_key,
    status: row.status,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    projectedSpendUsd,
    reused: true,
  };
}

export async function reserveBudget(binding: HyperdriveBinding, input: ReserveBudgetInput): Promise<BudgetReservation> {
  assertConfig(input.config);
  assertMoney(input.estimatedCostUsd, 'estimated_cost');
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new Error('budget_period_invalid');
  if (!input.operation || !input.idempotencyKey) throw new Error('budget_identity_required');
  return transaction(binding, async (client: Client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await client.query(
      `INSERT INTO system.cost_budget_periods
        (period_key, limit_usd, warning_usd, optional_analysis_usd, essential_only_usd, deep_scan_stop_usd)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (period_key) DO NOTHING`,
      [input.period, input.config.limitUsd, input.config.warningUsd, input.config.optionalAnalysisUsd, input.config.essentialOnlyUsd, input.config.deepScanStopUsd]
    );
    await client.query(`SELECT period_key FROM system.cost_budget_periods WHERE period_key = $1 FOR UPDATE`, [input.period]);
    const existing = await client.query<{ id: string; period_key: string; status: BudgetReservationStatus; estimated_cost_usd: string }>(
      `SELECT id, period_key, status, estimated_cost_usd
         FROM system.cost_budget_reservations
        WHERE idempotency_key = $1`, [input.idempotencyKey]
    );
    if (existing.rows[0]) return reservationFromRow(existing.rows[0], Number(existing.rows[0].estimated_cost_usd));
    await client.query(
      `UPDATE system.cost_budget_reservations
          SET status = 'expired', updated_at = now()
        WHERE period_key = $1 AND status = 'reserved' AND expires_at <= now()`,
      [input.period]
    );
    const switches = await client.query<{ key: string }>(
      `SELECT key FROM system.cost_kill_switches
        WHERE enabled = true AND key = ANY($1::text[])`, [[
          'global',
          'authenticity',
          `operation:${input.operation}`,
          ...(input.provider ? [`provider:${input.provider}`] : []),
        ]]
    );
    const committed = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_usd), 0)::text AS total
         FROM system.cost_usage_events WHERE period_key = $1`, [input.period]
    );
    const reserved = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS total
         FROM system.cost_budget_reservations
        WHERE period_key = $1 AND status = 'reserved' AND expires_at > now()`, [input.period]
    );
    const currentSpend = Number(committed.rows[0]?.total ?? 0) + Number(reserved.rows[0]?.total ?? 0);
    const projectedSpendUsd = currentSpend + input.estimatedCostUsd;
    const admitted = switches.rowCount === 0 && isBudgetOperationAdmitted(input, projectedSpendUsd);
    const id = crypto.randomUUID();
    const status: BudgetReservationStatus = admitted ? 'reserved' : 'rejected';
    await client.query(
      `INSERT INTO system.cost_budget_reservations
        (id, period_key, idempotency_key, operation, operation_class, estimated_cost_usd, status, correlation_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '15 minutes')`,
      [id, input.period, input.idempotencyKey, input.operation, input.operationClass, input.estimatedCostUsd, status, input.correlationId ?? null]
    );
    await client.query(
      `UPDATE system.cost_budget_periods
          SET state = CASE
            WHEN $2 >= limit_usd THEN 'halted'
            WHEN $2 >= deep_scan_stop_usd THEN 'critical'
            WHEN $2 >= warning_usd THEN 'warning'
            ELSE 'open'
          END,
          updated_at = now()
        WHERE period_key = $1`, [input.period, projectedSpendUsd]
    );
    return { id, period: input.period, status, estimatedCostUsd: input.estimatedCostUsd, projectedSpendUsd, reused: false };
  });
}

export async function settleBudgetReservation(binding: HyperdriveBinding, input: SettleBudgetInput): Promise<void> {
  assertMoney(input.actualCostUsd, 'actual_cost');
  if (!input.provider) throw new Error('budget_provider_required');
  await transaction(binding, async (client: Client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    const reservation = await client.query<{ id: string; period_key: string; operation: string; status: BudgetReservationStatus }>(
      `SELECT id, period_key, operation, status FROM system.cost_budget_reservations WHERE id = $1 FOR UPDATE`, [input.reservationId]
    );
    const row = reservation.rows[0];
    if (!row) throw new Error('budget_reservation_not_found');
    if (row.status === 'committed' || row.status === 'reconciled') return;
    if (row.status !== 'reserved') throw new Error('budget_reservation_not_reserved');
    const externalReference = input.externalReference ?? `reservation:${input.reservationId}`;
    await client.query(
      `INSERT INTO system.cost_usage_events
        (id, period_key, reservation_id, operation, provider, external_reference, amount_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (external_reference) DO NOTHING`,
      [crypto.randomUUID(), row.period_key, row.id, row.operation, input.provider, externalReference, input.actualCostUsd]
    );
    await client.query(
      `UPDATE system.cost_budget_reservations
          SET status = 'committed', actual_cost_usd = $2, updated_at = now()
        WHERE id = $1 AND status = 'reserved'`, [row.id, input.actualCostUsd]
    );
  });
}

export async function releaseBudgetReservation(binding: HyperdriveBinding, reservationId: string): Promise<void> {
  await queryBudgetMutation(binding, reservationId, 'released');
}

export async function expireBudgetReservations(binding: HyperdriveBinding, period?: string): Promise<number> {
  return transaction(binding, async (client: Client) => {
    const result = await client.query(
      `UPDATE system.cost_budget_reservations
          SET status = 'expired', updated_at = now()
        WHERE status = 'reserved' AND expires_at <= now()
          AND ($1::text IS NULL OR period_key = $1)`,
      [period ?? null]
    );
    return result.rowCount ?? 0;
  });
}

export async function reconcileBudgetReservation(binding: HyperdriveBinding, input: ReconcileBudgetInput): Promise<void> {
  assertMoney(input.actualCostUsd, 'actual_cost');
  if (!input.provider || !input.reason) throw new Error('budget_reconciliation_context_required');
  await transaction(binding, async (client: Client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    const reservation = await client.query<{ id: string; period_key: string; operation: string; status: BudgetReservationStatus }>(
      `SELECT id, period_key, operation, status FROM system.cost_budget_reservations WHERE id = $1 FOR UPDATE`, [input.reservationId]
    );
    const row = reservation.rows[0];
    if (!row) throw new Error('budget_reservation_not_found');
    if (row.status === 'reconciled' || row.status === 'committed') return;
    if (row.status !== 'reserved') throw new Error('budget_reservation_not_reserved');
    const externalReference = input.externalReference ?? `reconciled:${input.reservationId}`;
    await client.query(
      `INSERT INTO system.cost_usage_events
        (id, period_key, reservation_id, operation, provider, external_reference, amount_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (external_reference) DO NOTHING`,
      [crypto.randomUUID(), row.period_key, row.id, row.operation, input.provider, externalReference, input.actualCostUsd]
    );
    await client.query(
      `UPDATE system.cost_budget_reservations
          SET status = 'reconciled', actual_cost_usd = $2, correlation_id = COALESCE(correlation_id, $3), updated_at = now()
        WHERE id = $1 AND status = 'reserved'`,
      [row.id, input.actualCostUsd, input.reason]
    );
  });
}

async function queryBudgetMutation(binding: HyperdriveBinding, reservationId: string, status: 'released'): Promise<void> {
  await transaction(binding, async (client: Client) => {
    await client.query(
      `UPDATE system.cost_budget_reservations SET status = $2, updated_at = now() WHERE id = $1 AND status = 'reserved'`,
      [reservationId, status]
    );
  });
}
