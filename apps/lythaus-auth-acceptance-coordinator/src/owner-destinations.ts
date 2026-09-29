import { uuidv7 } from '@lythaus/security';
import { mailboxDomain } from './mailbox-provider.ts';

export type DestinationBinding = { id: string; release_sha: string; candidate_version: string };
export type OwnerDestination = {
  formatVersion: 'lythaus-owner-destination-v1';
  runId: string;
  releaseSha: string;
  candidateVersion: string;
  purpose: 'primary' | 'resend';
  reference: string;
  state: 'pending' | 'authorized';
  attempts: number;
  lastAttemptAt?: string;
  ownerSubject?: string;
  authorizedAt?: string;
  email?: string;
  productChecks?: { id: string; completedAt: string }[];
};

export function emptyDestination(run: DestinationBinding, purpose: OwnerDestination['purpose']): OwnerDestination {
  return { formatVersion: 'lythaus-owner-destination-v1', runId: run.id, releaseSha: run.release_sha,
    candidateVersion: run.candidate_version, purpose, reference: uuidv7(), state: 'pending', attempts: 0 };
}

export function destinationEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254
    || !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9.-]+$/i.test(value)
    || value.slice(0, value.indexOf('@')).length > 64) throw new Error('acceptance_mailbox_invalid');
  mailboxDomain(value);
  return value;
}

export function readDestination(raw: string, run: DestinationBinding, purpose: OwnerDestination['purpose']): OwnerDestination {
  let value: OwnerDestination;
  try { value = JSON.parse(raw) as OwnerDestination; } catch { throw new Error('acceptance_fresh_owner_run_required'); }
  if (!value || value.formatVersion !== 'lythaus-owner-destination-v1'
    || value.runId !== run.id || value.releaseSha !== run.release_sha || value.candidateVersion !== run.candidate_version
    || value.purpose !== purpose || !/^[0-9a-f-]{36}$/.test(value.reference)
    || !['pending', 'authorized'].includes(value.state) || !Number.isInteger(value.attempts) || value.attempts < 0 || value.attempts > 5) {
    throw new Error('acceptance_destination_binding_invalid');
  }
  if (value.state === 'authorized') {
    if (!value.ownerSubject || !value.authorizedAt || !Number.isFinite(Date.parse(value.authorizedAt))) throw new Error('acceptance_destination_binding_invalid');
    destinationEmail(value.email);
  } else if (value.email !== undefined || value.authorizedAt !== undefined) throw new Error('acceptance_destination_binding_invalid');
  return value;
}

export function requireDestinationOwner(value: OwnerDestination, subject: string): void {
  if (value.ownerSubject && value.ownerSubject !== subject) throw new Error('acceptance_owner_mismatch');
}

export function reserveDestinationAttempt(value: OwnerDestination, subject: string, now: number): OwnerDestination {
  requireDestinationOwner(value, subject);
  if (value.state !== 'pending') throw new Error('acceptance_destinations_locked');
  if (value.attempts >= 5 || (value.lastAttemptAt && now - Date.parse(value.lastAttemptAt) < 30_000)) throw new Error('acceptance_destination_rate_limited');
  return { ...value, ownerSubject: subject, attempts: value.attempts + 1, lastAttemptAt: new Date(now).toISOString() };
}

export function safeDestination(value: OwnerDestination) {
  return { reference: value.reference, status: value.state, ...(value.authorizedAt ? { authorizedAt: value.authorizedAt } : {}) };
}
