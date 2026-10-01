import type { EnvBindings } from '../../cloudflare-env/src/index.ts';
export interface BetaConfig {
  enabled: boolean;
  expiresAt?: string;
  allowlist: string[];
  safeEnabled: boolean;
  adviserEnabled: boolean;
  rightsApproval: string | null;
  budgetApproval: string | null;
  runtimeApproval: string | null;
  runtimeDigest: string;
  preprocessingHash: string;
  caseReservationUsd: number | null;
  adviserReservationUsd: number | null;
  observerReservationUsd: number | null;
  budgetEvidenceSha256: string | null;
  budgetObservedAt?: string;
  budgetExpiresAt?: string;
  authenticitySubBudgetUsd: number | null;
  authenticityHeadroomUsd: number | null;
  sourceHistoryHashes: string[];
}

export interface MeasuredAlphaBudget {
  caseReservationUsd: number;
  observerReservationUsd: number;
  adviserReservationUsd: number;
  authenticityLimitUsd: number;
  budgetEvidenceSha256: string;
  budgetExpiresAt: string;
}

/**
 * Alpha admission is deliberately stricter than the general application
 * budget. A positive environment variable is not measurement or approval.
 */
export function measuredAlphaBudget(
  config: BetaConfig,
  requested: { observer: boolean; adviser: boolean } = { observer: false, adviser: false },
  now = Date.now(),
): MeasuredAlphaBudget {
  if (!config.budgetApproval || !config.budgetEvidenceSha256 || config.budgetApproval !== config.budgetEvidenceSha256) throw new Error('alpha_budget_evidence_required');
  const observed = Date.parse(config.budgetObservedAt ?? '');
  const expires = Date.parse(config.budgetExpiresAt ?? '');
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > now || now - observed > 60 * 60 * 1000 || expires <= now) throw new Error('alpha_budget_evidence_stale');
  if (config.authenticitySubBudgetUsd !== 2 || config.authenticityHeadroomUsd !== 0.4) throw new Error('alpha_budget_envelope_invalid');
  if (config.caseReservationUsd === null) throw new Error('alpha_case_measurement_required');
  if (requested.observer && config.observerReservationUsd === null) throw new Error('alpha_observer_measurement_required');
  if (requested.adviser && config.adviserReservationUsd === null) throw new Error('alpha_adviser_measurement_required');
  return {
    caseReservationUsd: config.caseReservationUsd + (requested.observer ? config.observerReservationUsd ?? 0 : 0),
    observerReservationUsd: config.observerReservationUsd ?? 0,
    adviserReservationUsd: config.adviserReservationUsd ?? 0,
    authenticityLimitUsd: config.authenticitySubBudgetUsd - config.authenticityHeadroomUsd,
    budgetEvidenceSha256: config.budgetEvidenceSha256,
    budgetExpiresAt: config.budgetExpiresAt!,
  };
}
export async function readBetaConfig(env: Pick<EnvBindings, 'LYTHAUS_CONFIG' | 'AUTHENTICITY_BETA_ENABLED'>): Promise<BetaConfig> {
  const raw = await env.LYTHAUS_CONFIG?.get('authenticity-beta-v1', 'json');
  const value = raw && typeof raw === 'object' ? raw as Partial<BetaConfig> : {};
  return {
    enabled: env.AUTHENTICITY_BETA_ENABLED === 'true' && value.enabled === true && typeof value.expiresAt === 'string' && Date.parse(value.expiresAt) > Date.now() && Date.parse(value.expiresAt) <= Date.now() + 7 * 86400000,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
    allowlist: Array.isArray(value.allowlist) ? value.allowlist.filter(id => typeof id === 'string') : [],
    safeEnabled: value.safeEnabled === true, adviserEnabled: value.adviserEnabled === true,
    rightsApproval: typeof value.rightsApproval === 'string' && /^[a-f0-9]{64}$/.test(value.rightsApproval) ? value.rightsApproval : null,
    budgetApproval: typeof value.budgetApproval === 'string' && /^[a-f0-9]{64}$/.test(value.budgetApproval) ? value.budgetApproval : null,
    runtimeApproval: typeof value.runtimeApproval === 'string' && /^[a-f0-9]{64}$/.test(value.runtimeApproval) ? value.runtimeApproval : null,
    runtimeDigest: typeof value.runtimeDigest === 'string' ? value.runtimeDigest : '',
    preprocessingHash: typeof value.preprocessingHash === 'string' ? value.preprocessingHash : '',
    caseReservationUsd: typeof value.caseReservationUsd === 'number' && Number.isFinite(value.caseReservationUsd) && value.caseReservationUsd > 0 && value.caseReservationUsd <= 1.6 ? value.caseReservationUsd : null,
    adviserReservationUsd: typeof value.adviserReservationUsd === 'number' && Number.isFinite(value.adviserReservationUsd) && value.adviserReservationUsd > 0 && value.adviserReservationUsd <= 1.6 ? value.adviserReservationUsd : null,
    observerReservationUsd: typeof value.observerReservationUsd === 'number' && Number.isFinite(value.observerReservationUsd) && value.observerReservationUsd > 0 && value.observerReservationUsd <= 1.6 ? value.observerReservationUsd : null,
    budgetEvidenceSha256: typeof value.budgetEvidenceSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.budgetEvidenceSha256) ? value.budgetEvidenceSha256 : null,
    budgetObservedAt: typeof value.budgetObservedAt === 'string' ? value.budgetObservedAt : undefined,
    budgetExpiresAt: typeof value.budgetExpiresAt === 'string' ? value.budgetExpiresAt : undefined,
    authenticitySubBudgetUsd: typeof value.authenticitySubBudgetUsd === 'number' && Number.isFinite(value.authenticitySubBudgetUsd) && value.authenticitySubBudgetUsd > 0 ? value.authenticitySubBudgetUsd : null,
    authenticityHeadroomUsd: typeof value.authenticityHeadroomUsd === 'number' && Number.isFinite(value.authenticityHeadroomUsd) && value.authenticityHeadroomUsd >= 0 ? value.authenticityHeadroomUsd : null,
    sourceHistoryHashes: Array.isArray(value.sourceHistoryHashes) ? value.sourceHistoryHashes.filter(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) : [],
  };
}
