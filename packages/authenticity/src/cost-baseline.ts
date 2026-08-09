export const WP002_MONTHLY_EXPERIMENTAL_CEILING_USD = 10;

export const WP002_PUBLISHED_RATES = Object.freeze({
  workersPaidBaseUsd: 5,
  queueIncludedOperations: 1_000_000,
  queueAdditionalUsdPerMillion: 0.4,
  r2IncludedStorageGbMonth: 10,
  r2IncludedClassAOperations: 1_000_000,
  r2IncludedClassBOperations: 10_000_000,
  r2StorageUsdPerGbMonth: 0.015,
  r2ClassAUsdPerMillion: 4.5,
  r2ClassBUsdPerMillion: 0.36,
  containerMemoryUsdPerGibSecond: 0.0000025,
  containerCpuUsdPerVcpuSecond: 0.00002,
  containerDiskUsdPerGbSecond: 0.00000007,
  containerIncludedMemoryGibHours: 25,
  containerIncludedCpuVcpuMinutes: 375,
  containerIncludedDiskGbHours: 200,
  workersAiFreeNeuronsPerDay: 10_000,
  workersAiUsdPerThousandNeurons: 0.011,
});

export interface ContainerBoundedEstimateInput {
  activeSeconds: number;
  instances?: number;
  provisionedVcpu?: number;
  provisionedMemoryGib?: number;
  provisionedDiskGb?: number;
}

export interface CostScenarioEstimate {
  containerGrossUsd: number;
  queueUsd: number;
  r2Usd: number;
  workersAiUsd: number;
  otherUsd: number;
  totalUsd: number;
  ceilingCompatible: boolean;
}

function nonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field}_invalid`);
  return value;
}

export function calculateContainerGrossEstimate(input: ContainerBoundedEstimateInput): number {
  const activeSeconds = nonNegativeFinite(input.activeSeconds, 'active_seconds');
  const instances = nonNegativeFinite(input.instances ?? 1, 'instances');
  const provisionedVcpu = nonNegativeFinite(input.provisionedVcpu ?? 1 / 16, 'provisioned_vcpu');
  const provisionedMemoryGib = nonNegativeFinite(input.provisionedMemoryGib ?? 0.25, 'provisioned_memory_gib');
  const provisionedDiskGb = nonNegativeFinite(input.provisionedDiskGb ?? 2, 'provisioned_disk_gb');
  return instances * activeSeconds * (
    provisionedMemoryGib * WP002_PUBLISHED_RATES.containerMemoryUsdPerGibSecond
    + provisionedVcpu * WP002_PUBLISHED_RATES.containerCpuUsdPerVcpuSecond
    + provisionedDiskGb * WP002_PUBLISHED_RATES.containerDiskUsdPerGbSecond
  );
}

export function calculateQueueEstimate(operationCount: number): number {
  const operations = nonNegativeFinite(operationCount, 'queue_operations');
  return Math.max(0, operations - WP002_PUBLISHED_RATES.queueIncludedOperations) / 1_000_000 * WP002_PUBLISHED_RATES.queueAdditionalUsdPerMillion;
}

export function calculateR2Estimate(input: { storageGbMonth: number; classAOperations: number; classBOperations: number }): number {
  const storage = nonNegativeFinite(input.storageGbMonth, 'r2_storage');
  const classA = nonNegativeFinite(input.classAOperations, 'r2_class_a_operations');
  const classB = nonNegativeFinite(input.classBOperations, 'r2_class_b_operations');
  return Math.max(0, storage - WP002_PUBLISHED_RATES.r2IncludedStorageGbMonth) * WP002_PUBLISHED_RATES.r2StorageUsdPerGbMonth
    + Math.max(0, classA - WP002_PUBLISHED_RATES.r2IncludedClassAOperations) / 1_000_000 * WP002_PUBLISHED_RATES.r2ClassAUsdPerMillion
    + Math.max(0, classB - WP002_PUBLISHED_RATES.r2IncludedClassBOperations) / 1_000_000 * WP002_PUBLISHED_RATES.r2ClassBUsdPerMillion;
}

export function calculateWorkersAiEstimate(input: { neurons: number; freeAllocationAlreadyConsumed?: boolean }): number {
  const neurons = nonNegativeFinite(input.neurons, 'workers_ai_neurons');
  const free = input.freeAllocationAlreadyConsumed === true ? 0 : WP002_PUBLISHED_RATES.workersAiFreeNeuronsPerDay;
  return Math.max(0, neurons - free) / 1_000 * WP002_PUBLISHED_RATES.workersAiUsdPerThousandNeurons;
}

export function calculateBoundedCostScenario(input: {
  container?: ContainerBoundedEstimateInput;
  queueOperations?: number;
  r2?: { storageGbMonth: number; classAOperations: number; classBOperations: number };
  workersAi?: { neurons: number; freeAllocationAlreadyConsumed?: boolean };
  otherUsd?: number;
}): CostScenarioEstimate {
  const containerGrossUsd = input.container ? calculateContainerGrossEstimate(input.container) : 0;
  const queueUsd = input.queueOperations === undefined ? 0 : calculateQueueEstimate(input.queueOperations);
  const r2Usd = input.r2 ? calculateR2Estimate(input.r2) : 0;
  const workersAiUsd = input.workersAi ? calculateWorkersAiEstimate(input.workersAi) : 0;
  const otherUsd = nonNegativeFinite(input.otherUsd ?? 0, 'other_cost');
  const totalUsd = containerGrossUsd + queueUsd + r2Usd + workersAiUsd + otherUsd;
  return { containerGrossUsd, queueUsd, r2Usd, workersAiUsd, otherUsd, totalUsd, ceilingCompatible: totalUsd <= WP002_MONTHLY_EXPERIMENTAL_CEILING_USD };
}

export function assertWp002CostCeiling(estimate: CostScenarioEstimate): void {
  if (!Number.isFinite(estimate.totalUsd) || estimate.totalUsd < 0) throw new Error('cost_estimate_invalid');
  if (estimate.totalUsd > WP002_MONTHLY_EXPERIMENTAL_CEILING_USD) throw new Error('wp002_experimental_ceiling_exceeded');
}
