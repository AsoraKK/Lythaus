export const ACCOUNT_SUPPORT_SOURCES = ['account', 'activity', 'audit'] as const;
export type AccountSupportSource = typeof ACCOUNT_SUPPORT_SOURCES[number];

export interface AccountSupportSnapshot {
  id: string;
  status: string;
  verificationState: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastSignInAt: string | null;
  activeSessionCount: number;
  subscriptionTier: string;
}

export const ACCOUNT_SUPPORT_HISTORY_NOTICE = 'This is partial recorded history. Events may never have been recorded or may have expired or been removed. An empty result does not prove that no activity occurred. Identity account events do not record correlation IDs.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function supportUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function supportTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error('invalid_date_filter');
  }
  return value.replace(/(?:\.(\d{1,6}))?Z$/, (_match, fraction: string | undefined) => `.${(fraction ?? '').padEnd(6, '0')}Z`);
}

export function safeSupportCode(value: unknown, maximum = 100): string | null {
  return typeof value === 'string' && value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) ? value : null;
}

export function accountSupportSnapshot(value: unknown): AccountSupportSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('account_support_unavailable');
  const row = value as Record<string, unknown>;
  if (!supportUuid(row.id) || !['active', 'suspended', 'locked', 'deleted', 'relink_required'].includes(String(row.status))
    || !['verified', 'pending_verification', 'credential_setup_required'].includes(String(row.verificationState))
    || !['free', 'premium', 'black'].includes(String(row.subscriptionTier))
    || !Number.isSafeInteger(row.activeSessionCount) || Number(row.activeSessionCount) < 0) throw new Error('account_support_unavailable');
  const optionalTime = (time: unknown): string | null => time === null ? null : supportTimestamp(time);
  try {
    return {
      id: row.id, status: String(row.status), verificationState: String(row.verificationState),
      verifiedAt: optionalTime(row.verifiedAt), createdAt: supportTimestamp(row.createdAt), updatedAt: supportTimestamp(row.updatedAt),
      deletedAt: optionalTime(row.deletedAt), lastSignInAt: optionalTime(row.lastSignInAt),
      activeSessionCount: Number(row.activeSessionCount), subscriptionTier: String(row.subscriptionTier),
    };
  } catch {
    throw new Error('account_support_unavailable');
  }
}
