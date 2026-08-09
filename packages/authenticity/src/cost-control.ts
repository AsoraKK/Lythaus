export const EXPERIMENTAL_MONTHLY_LIMIT_USD = 10;

export interface AuthenticityFeatureFlags {
  shadowMode: boolean;
  authenticityEnforcementEnabled: false;
  deepAuthenticityEnabled: boolean;
  modelInferenceEnabled: boolean;
  unattendedEcoTrainEnabled: false;
  emergencyDisabled: boolean;
}

export const DEFAULT_AUTHENTICITY_FEATURE_FLAGS: AuthenticityFeatureFlags = {
  shadowMode: true,
  authenticityEnforcementEnabled: false,
  deepAuthenticityEnabled: false,
  modelInferenceEnabled: false,
  unattendedEcoTrainEnabled: false,
  emergencyDisabled: false,
};

export interface CostControlConfig {
  monthlyLimitUsd: number;
  warningUsd: number;
  optionalAnalysisStopUsd: number;
  essentialOnlyUsd: number;
  deepScanStopUsd: number;
}

export const DEFAULT_COST_CONTROL_CONFIG: CostControlConfig = {
  monthlyLimitUsd: EXPERIMENTAL_MONTHLY_LIMIT_USD,
  warningUsd: 5,
  optionalAnalysisStopUsd: 7,
  essentialOnlyUsd: 8,
  deepScanStopUsd: 9,
};

export interface CostUsageCounter {
  period: string;
  reservedUsd: number;
  committedUsd: number;
  emergencyDisabled: boolean;
}

export interface CostCounterStore {
  read(period: string): Promise<CostUsageCounter>;
  reserve(period: string, amountUsd: number, limitUsd?: number): Promise<boolean>;
  commit(period: string, reservedUsd: number, actualUsd: number): Promise<void>;
  disable(period: string): Promise<void>;
}

export class InMemoryCostCounterStore implements CostCounterStore {
  private readonly counters = new Map<string, CostUsageCounter>();

  async read(period: string): Promise<CostUsageCounter> {
    const existing = this.counters.get(period);
    if (existing) return { ...existing };
    const created = { period, reservedUsd: 0, committedUsd: 0, emergencyDisabled: false };
    this.counters.set(period, created);
    return { ...created };
  }

  async reserve(period: string, amountUsd: number, limitUsd = Number.POSITIVE_INFINITY): Promise<boolean> {
    const counter = this.counters.get(period) ?? { period, reservedUsd: 0, committedUsd: 0, emergencyDisabled: false };
    if (counter.emergencyDisabled || !Number.isFinite(amountUsd) || amountUsd < 0) return false;
    if (counter.reservedUsd + counter.committedUsd + amountUsd >= limitUsd) return false;
    counter.reservedUsd += amountUsd;
    this.counters.set(period, counter);
    return true;
  }

  async commit(period: string, reservedUsd: number, actualUsd: number): Promise<void> {
    const counter = this.counters.get(period) ?? { period, reservedUsd: 0, committedUsd: 0, emergencyDisabled: false };
    counter.reservedUsd = Math.max(0, counter.reservedUsd - reservedUsd);
    counter.committedUsd += actualUsd;
    this.counters.set(period, counter);
  }

  async disable(period: string): Promise<void> {
    const counter = await this.read(period);
    counter.emergencyDisabled = true;
    this.counters.set(period, counter);
  }
}

export interface CostAdmission {
  admitted: boolean;
  projectedSpendUsd: number;
  reason: 'ADMITTED' | 'EMERGENCY_DISABLED' | 'HARD_STOP' | 'DEEP_SCAN_STOP' | 'ESSENTIAL_ONLY' | 'OPTIONAL_STOP' | 'EXPERIMENT_STOP' | 'INVALID_COST';
}

export class AuthenticityCostController {
  private readonly store: CostCounterStore;
  private readonly config: CostControlConfig;
  private readonly flags: AuthenticityFeatureFlags;

  constructor(store: CostCounterStore, config: CostControlConfig = DEFAULT_COST_CONTROL_CONFIG, flags: AuthenticityFeatureFlags = DEFAULT_AUTHENTICITY_FEATURE_FLAGS) {
    this.store = store;
    this.config = config;
    this.flags = flags;
    assertCostControlConfig(config);
    assertAuthenticityFeatureFlags(flags);
  }

  async admit(input: { period: string; operation: string; operationClass: 'essential' | 'optional' | 'experiment'; estimatedCostUsd: number }): Promise<CostAdmission> {
    if (!Number.isFinite(input.estimatedCostUsd) || input.estimatedCostUsd < 0) return { admitted: false, projectedSpendUsd: Number.NaN, reason: 'INVALID_COST' };
    const current = await this.store.read(input.period);
    const projectedSpendUsd = current.reservedUsd + current.committedUsd + input.estimatedCostUsd;
    if (current.emergencyDisabled || this.flags.emergencyDisabled) return { admitted: false, projectedSpendUsd, reason: 'EMERGENCY_DISABLED' };
    if (projectedSpendUsd >= this.config.monthlyLimitUsd) return { admitted: false, projectedSpendUsd, reason: 'HARD_STOP' };
    if (projectedSpendUsd >= this.config.deepScanStopUsd && /deep|image/i.test(input.operation)) return { admitted: false, projectedSpendUsd, reason: 'DEEP_SCAN_STOP' };
    if (projectedSpendUsd >= this.config.essentialOnlyUsd && input.operationClass !== 'essential') return { admitted: false, projectedSpendUsd, reason: 'ESSENTIAL_ONLY' };
    if (projectedSpendUsd >= this.config.optionalAnalysisStopUsd && input.operationClass === 'optional') return { admitted: false, projectedSpendUsd, reason: 'OPTIONAL_STOP' };
    if (projectedSpendUsd >= this.config.warningUsd && input.operationClass === 'experiment') return { admitted: false, projectedSpendUsd, reason: 'EXPERIMENT_STOP' };
    const reserved = await this.store.reserve(input.period, input.estimatedCostUsd, this.config.monthlyLimitUsd);
    return reserved
      ? { admitted: true, projectedSpendUsd, reason: 'ADMITTED' }
      : { admitted: false, projectedSpendUsd, reason: 'HARD_STOP' };
  }

  async settle(period: string, reservedUsd: number, actualUsd: number): Promise<void> {
    if (!Number.isFinite(reservedUsd) || reservedUsd < 0 || !Number.isFinite(actualUsd) || actualUsd < 0 || actualUsd > this.config.monthlyLimitUsd) throw new Error('actual_cost_invalid');
    await this.store.commit(period, reservedUsd, actualUsd);
  }

  async emergencyDisable(period: string): Promise<void> {
    await this.store.disable(period);
  }
}

export function assertCostControlConfig(config: CostControlConfig): void {
  if (config.monthlyLimitUsd > EXPERIMENTAL_MONTHLY_LIMIT_USD) throw new Error('experimental_budget_exceeded');
  if (!(config.warningUsd < config.optionalAnalysisStopUsd && config.optionalAnalysisStopUsd < config.essentialOnlyUsd && config.essentialOnlyUsd < config.deepScanStopUsd && config.deepScanStopUsd <= config.monthlyLimitUsd)) {
    throw new Error('cost_control_thresholds_invalid');
  }
}

export function assertAuthenticityFeatureFlags(flags: AuthenticityFeatureFlags): void {
  if (flags.authenticityEnforcementEnabled !== false) throw new Error('authenticity_enforcement_flag_must_remain_disabled');
  if (flags.unattendedEcoTrainEnabled !== false) throw new Error('unattended_eco_train_flag_must_remain_disabled');
}
