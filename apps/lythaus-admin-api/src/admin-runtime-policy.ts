import { pageRequest, type KeysetCursor } from '@lythaus/contracts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODE_PATTERN = /^[A-Z0-9_.:-]{2,80}$/;
const USER_STATUS_FILTERS = new Set([
  'verified', 'pending_verification', 'active', 'relink_required', 'suspended', 'locked', 'deleted',
]);

export type AdminUserStatusFilter =
  | 'verified'
  | 'pending_verification'
  | 'active'
  | 'relink_required'
  | 'suspended'
  | 'locked'
  | 'deleted';

export interface AdminUserPageRequest {
  limit: number;
  cursor: KeysetCursor | null;
  query: string;
  status: AdminUserStatusFilter | null;
  source: string | null;
  createdAfter: string | null;
  createdBefore: string | null;
}

export interface AdminWaitlistFilters {
  query: string;
  status: 'waiting' | 'invited' | 'converted' | 'unsubscribed' | null;
  source: string | null;
  createdAfter: string | null;
  createdBefore: string | null;
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_json');
  return input as Record<string, unknown>;
}

export function rejectUnknownFields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  const object = asObject(input);
  const allowedFields = new Set(allowed);
  if (Object.keys(object).some((field) => !allowedFields.has(field))) throw new Error('unknown_field');
  return object;
}

export function parseReasonCode(value: unknown): string {
  if (typeof value !== 'string') throw new Error('reason_code_required');
  const reasonCode = value.trim().toUpperCase();
  if (!REASON_CODE_PATTERN.test(reasonCode)) throw new Error('reason_code_required');
  return reasonCode;
}

export function requireConfirmation(value: unknown, expected: string): void {
  if (typeof value !== 'string' || value.trim() !== expected) throw new Error('confirmation_required');
}

export function parseAdminUserId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error('invalid_user_id');
  return value;
}

function parseDateFilter(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('invalid_date_filter');
  return new Date(value).toISOString();
}

export function adminUserPageRequest(url: URL): AdminUserPageRequest {
  const page = pageRequest(url, 100, 50);
  const statusValue = url.searchParams.get('status');
  const status = statusValue ? statusValue as AdminUserStatusFilter : null;
  if (status && !USER_STATUS_FILTERS.has(status)) throw new Error('invalid_user_status_filter');
  const source = url.searchParams.get('source')?.trim() || null;
  if (source && (source.length > 80 || !/^[a-z0-9_.:-]+$/i.test(source))) throw new Error('invalid_user_source_filter');
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length > 120) throw new Error('invalid_user_search');
  return {
    ...page,
    query,
    status,
    source,
    createdAfter: parseDateFilter(url.searchParams.get('createdAfter')),
    createdBefore: parseDateFilter(url.searchParams.get('createdBefore')),
  };
}

export function adminWaitlistFilters(url: URL): AdminWaitlistFilters {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length > 120) throw new Error('invalid_waitlist_search');
  const statusValue = url.searchParams.get('status');
  const statuses = new Set(['waiting', 'invited', 'converted', 'unsubscribed']);
  if (statusValue && !statuses.has(statusValue)) throw new Error('invalid_waitlist_status');
  const source = url.searchParams.get('source')?.trim() || null;
  if (source && (source.length > 120 || !/^[\w.:-]+$/u.test(source))) throw new Error('invalid_waitlist_source');
  return {
    query,
    status: statusValue as AdminWaitlistFilters['status'] ?? null,
    source,
    createdAfter: parseDateFilter(url.searchParams.get('createdAfter')),
    createdBefore: parseDateFilter(url.searchParams.get('createdBefore')),
  };
}

export function parseDisplayName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_display_name');
  const displayName = value.normalize('NFC').trim();
  if (displayName.length < 1 || displayName.length > 160) throw new Error('invalid_display_name');
  return displayName;
}

export function parseHandle(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_handle');
  const handle = value.normalize('NFC').trim();
  if (!/^[a-zA-Z0-9_]{2,40}$/u.test(handle)) throw new Error('invalid_handle');
  return handle;
}

export function parseSource(value: unknown, fallback = 'keeper'): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error('invalid_source');
  const source = value.trim();
  if (!source || source.length > 120) throw new Error('invalid_source');
  return source;
}
