import { pageRequest, type KeysetCursor } from '@lythaus/contracts';

export interface WaitlistPageRequest {
  limit: number;
  cursor: KeysetCursor | null;
}

export type WaitlistStatus = 'invited' | 'converted' | 'unsubscribed';

const WAITLIST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WAITLIST_STATUSES = new Set<WaitlistStatus>(['invited', 'converted', 'unsubscribed']);

export function assertWaitlistAdminRole(role: unknown): void {
  if (role !== 'administrator' && role !== 'owner') throw new Error('admin_role_required');
}

export function waitlistPageRequest(url: URL): WaitlistPageRequest {
  return pageRequest(url, 100, 50);
}

export function requireWaitlistEncryptionKey(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('waitlist_unavailable');
  return value;
}

export function parseWaitlistId(value: unknown): string {
  if (typeof value !== 'string' || !WAITLIST_ID_PATTERN.test(value)) throw new Error('invalid_waitlist_id');
  return value;
}

export function parseWaitlistStatusUpdate(input: unknown): WaitlistStatus {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_waitlist_status');
  const status = (input as { status?: unknown }).status;
  if (typeof status !== 'string' || !WAITLIST_STATUSES.has(status as WaitlistStatus)) throw new Error('invalid_waitlist_status');
  return status as WaitlistStatus;
}

export function assertWaitlistStatusTransition(current: unknown, next: WaitlistStatus): void {
  if (current === next) return;
  const allowed: Record<string, readonly WaitlistStatus[]> = {
    waiting: ['invited', 'converted', 'unsubscribed'],
    invited: ['converted', 'unsubscribed'],
    converted: [],
    unsubscribed: [],
  };
  if (typeof current !== 'string' || !allowed[current]?.includes(next)) throw new Error('waitlist_status_transition_invalid');
}

export function parseWaitlistRetentionHoldUpdate(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof (input as { active?: unknown }).active !== 'boolean') {
    throw new Error('invalid_waitlist_retention_hold');
  }
  return (input as { active: boolean }).active;
}

export function waitlistAuditMetadata(input: {
  returnedRowCount: number;
  requestedLimit: number;
  hasCursor: boolean;
  hasMore: boolean;
}): Record<string, number | boolean> {
  return {
    returnedRowCount: input.returnedRowCount,
    requestedLimit: input.requestedLimit,
    hasCursor: input.hasCursor,
    hasMore: input.hasMore,
  };
}
