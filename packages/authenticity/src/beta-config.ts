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
  caseReservationUsd: number;
  sourceHistoryHashes: string[];
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
    caseReservationUsd: typeof value.caseReservationUsd === 'number' && Number.isFinite(value.caseReservationUsd) && value.caseReservationUsd > 0 && value.caseReservationUsd <= 0.5 ? value.caseReservationUsd : 0.5,
    sourceHistoryHashes: Array.isArray(value.sourceHistoryHashes) ? value.sourceHistoryHashes.filter(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) : [],
  };
}
