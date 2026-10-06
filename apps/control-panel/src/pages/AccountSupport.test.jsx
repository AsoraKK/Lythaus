import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountSupport from './AccountSupport.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));
const ID = '01900000-0000-7000-8000-000000000001';
const OTHER = '01900000-0000-7000-8000-000000000002';
const account = { id: ID, status: 'active', verificationState: 'pending_verification', verifiedAt: null, createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z', deletedAt: null, lastSignInAt: null, activeSessionCount: 0, subscriptionTier: 'free' };
const profile = { displayName: 'Synthetic member', bio: 'Synthetic biography', userUpdatedAt: '2026-10-01T00:00:00.000001Z', profileUpdatedAt: '2026-10-01T00:00:00.000002Z', moderationState: 'allowed' };
const event = { id: ID, source: 'activity', eventType: 'account.registered', createdAt: '2026-10-01T00:00:00.000001Z', correlationId: 'synthetic-correlation', reasonCode: null, category: 'account', outcome: 'pending' };
const page = (items = [event], nextCursor = null) => ({ items, nextCursor, coverage: 'partial', correlationId: 'history-correlation' });
const fail = status => Object.assign(new Error('private-server-detail'), { status });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function lookup() {
  await screen.findByLabelText('Exact email address');
  fireEvent.change(screen.getByLabelText('Exact email address'), { target: { value: 'Synthetic@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Support reason code'), { target: { value: 'support_request' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up account' }));
}
async function loaded() { await lookup(); await screen.findByText('account.registered'); await screen.findByText(profile.displayName); }

describe('AccountSupport', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockImplementation(async (path, options) => {
      if (path === 'account-support/access') return { available: true, profileCorrectionsAvailable: true };
      if (path === 'account-support/lookup') return { state: 'found', account, correlationId: 'lookup-correlation' };
      if (path === `account-support/users/${ID}/profile`) return options?.method === 'PATCH'
        ? { profile: { ...profile, displayName: options.body.displayName, bio: options.body.bio, moderationState: 'under_review' } }
        : { profile };
      return page();
    });
  });

  it('checks owner access and waits for explicit email lookup', async () => {
    render(<AccountSupport />); await screen.findByLabelText('Exact email address');
    expect(adminRequest).toHaveBeenCalledTimes(1);
    expect(adminRequest).toHaveBeenCalledWith('account-support/access');
    expect(screen.queryByText('Account state')).not.toBeInTheDocument();
  });

  it('hides lookup and all account data when owner access is denied', async () => {
    adminRequest.mockRejectedValue(fail(403)); render(<AccountSupport />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Active owner access is required');
    expect(screen.queryByLabelText('Exact email address')).not.toBeInTheDocument();
  });

  it('shows unavailable access honestly without presenting a usable lookup form', async () => {
    adminRequest.mockRejectedValue(fail(503)); render(<AccountSupport />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Owner access could not be checked');
    expect(screen.queryByRole('button', { name: 'Look up account' })).not.toBeInTheDocument();
  });

  it('keeps profile fields unavailable when the current database role lacks reviewed-write access', async () => {
    adminRequest.mockImplementation(async (path, options) => {
      if (path === 'account-support/access') return { available: true, profileCorrectionsAvailable: false };
      if (path === 'account-support/lookup') return { state: 'found', account };
      return page();
    });
    render(<AccountSupport />); await lookup(); await screen.findByText(/No profile fields were read or changed/);
    expect(screen.getByText(/approved database access update/)).toBeInTheDocument();
    expect(adminRequest).not.toHaveBeenCalledWith(`account-support/users/${ID}/profile`, expect.anything());
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  it('rejects an unexpected access response', async () => {
    adminRequest.mockResolvedValue({}); render(<AccountSupport />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Owner access could not be checked');
  });

  it('posts exact email with a reason, displays minimal state and never offers mutation controls', async () => {
    render(<AccountSupport />); await loaded();
    expect(adminRequest).toHaveBeenCalledWith('account-support/lookup', { method: 'POST', body: { email: 'synthetic@example.invalid', reasonCode: 'SUPPORT_REQUEST' } });
    expect(adminRequest).toHaveBeenCalledWith(`account-support/users/${ID}/history`, { method: 'POST', body: {
      reasonCode: 'SUPPORT_REQUEST', source: null, eventType: null, correlationId: null, since: null, until: null, order: 'newest', limit: 25, cursor: null
    } });
    expect(screen.getByText(ID)).toBeInTheDocument(); expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(1);
    expect(screen.getByText(/partial recorded history/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete|Reset|Suspend|Revoke|Impersonate|Repair|Invite/ })).not.toBeInTheDocument();
  });

  it('loads the profile separately from account state and points post actions to the moderation queue', async () => {
    render(<AccountSupport />); await loaded();
    expect(adminRequest).toHaveBeenCalledWith(`account-support/users/${ID}/profile`, { method: 'POST', body: { reasonCode: 'SUPPORT_REQUEST' } });
    expect(screen.getByText('Synthetic member')).toBeInTheDocument();
    expect(screen.getByText('Synthetic biography')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open moderation queue' })).toHaveAttribute('href', '/moderation');
    expect(screen.getByText(/does not enumerate a member’s posts/)).toBeInTheDocument();
  });

  it('requires reason, review and typed confirmation before a profile correction is saved', async () => {
    render(<AccountSupport />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Corrected synthetic name' } });
    fireEvent.change(screen.getByLabelText('Correction reason code'), { target: { value: 'support_request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review correction' }));
    expect(await screen.findByText('Review before saving')).toBeInTheDocument();
    expect(adminRequest).not.toHaveBeenCalledWith(`account-support/users/${ID}/profile`, expect.objectContaining({ method: 'PATCH' }));
    const confirmation = screen.getByLabelText('Type UPDATE MEMBER PROFILE to confirm');
    fireEvent.change(confirmation, { target: { value: 'UPDATE' } });
    expect(screen.getByRole('button', { name: 'Save profile correction' })).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: 'UPDATE MEMBER PROFILE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile correction' }));
    await screen.findByText('Profile correction saved and queued for moderation review.');
    expect(adminRequest).toHaveBeenCalledWith(`account-support/users/${ID}/profile`, { method: 'PATCH', body: {
      displayName: 'Corrected synthetic name', bio: 'Synthetic biography', expectedUserUpdatedAt: profile.userUpdatedAt,
      expectedProfileUpdatedAt: profile.profileUpdatedAt, reasonCode: 'SUPPORT_REQUEST', confirmation: 'UPDATE MEMBER PROFILE',
    } });
  });

  it('preserves a reviewed correction after conflict and allows cancel without a write', async () => {
    render(<AccountSupport />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Corrected synthetic biography' } });
    fireEvent.change(screen.getByLabelText('Correction reason code'), { target: { value: 'SUPPORT_REQUEST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review correction' }));
    fireEvent.change(screen.getByLabelText('Type UPDATE MEMBER PROFILE to confirm'), { target: { value: 'UPDATE MEMBER PROFILE' } });
    adminRequest.mockRejectedValueOnce(fail(409));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed after it was loaded/);
    expect(screen.getByLabelText('Bio')).toHaveValue('Corrected synthetic biography');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Bio')).not.toBeInTheDocument();
    expect(screen.queryByText('private-server-detail')).not.toBeInTheDocument();
  });

  it.each(['not_found', 'ambiguous'])('reports %s with no account detail or history request', async state => {
    adminRequest.mockImplementation(async path => path === 'account-support/access' ? { available: true, profileCorrectionsAvailable: true } : { state, account: null });
    render(<AccountSupport />); await lookup();
    await screen.findByText(state === 'not_found' ? 'No account matched this exact email address.' : /conflicting account records/);
    expect(adminRequest).toHaveBeenCalledTimes(2); expect(screen.queryByText('Account state')).not.toBeInTheDocument();
  });

  it('requires a stable reason before calling lookup', async () => {
    render(<AccountSupport />); await screen.findByLabelText('Exact email address');
    fireEvent.change(screen.getByLabelText('Exact email address'), { target: { value: 'synthetic@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Support reason code'), { target: { value: 'private prose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up account' }));
    expect(await screen.findByText(/Enter a stable reason code/)).toBeInTheDocument(); expect(adminRequest).toHaveBeenCalledTimes(1);
  });

  it('shows safe failure text and discards earlier account data on replacement lookup', async () => {
    render(<AccountSupport />); await loaded();
    adminRequest.mockRejectedValue(fail(503)); fireEvent.click(screen.getByRole('button', { name: 'Look up account' }));
    await screen.findByText(/Account support could not be loaded/);
    expect(screen.queryByText(ID)).not.toBeInTheDocument(); expect(screen.queryByText('account.registered')).not.toBeInTheDocument();
    expect(screen.queryByText('private-server-detail')).not.toBeInTheDocument();
  });

  it('treats history failure as unavailable instead of an empty successful history', async () => {
    adminRequest.mockImplementation(async path => {
      if (path === 'account-support/access') return { available: true, profileCorrectionsAvailable: true };
      if (path === 'account-support/lookup') return { state: 'found', account };
      throw fail(503);
    });
    render(<AccountSupport />); await lookup(); await screen.findByText(/History could not be loaded/);
    expect(screen.getByText(ID)).toBeInTheDocument(); expect(screen.queryByText('No recorded events matched these filters.')).not.toBeInTheDocument();
  });

  it('reports an empty history as partial and preserves missing correlation honestly', async () => {
    adminRequest.mockImplementation(async (path, options) => path === 'account-support/access' ? { available: true, profileCorrectionsAvailable: true } : path === 'account-support/lookup' ? { state: 'found', account } : path.endsWith('/profile') ? { profile } : page([]));
    render(<AccountSupport />); await lookup(); await screen.findByText('No recorded events matched these filters.');
    expect(screen.getByText(/does not prove that no activity occurred/)).toBeInTheDocument();
    adminRequest.mockResolvedValue(page([{ ...event, correlationId: null }])); fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('Correlation: Not recorded')).toBeInTheDocument();
  });

  it('applies source, event, date and sort filters as UTC without changing account state', async () => {
    render(<AccountSupport />); await loaded();
    fireEvent.change(screen.getByLabelText('History source'), { target: { value: 'account' } });
    fireEvent.change(screen.getByLabelText('Event code'), { target: { value: 'email_login' } });
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'oldest' } });
    fireEvent.change(screen.getByLabelText('Since (local time, inclusive)'), { target: { value: '2026-10-01T00:00' } });
    fireEvent.change(screen.getByLabelText('Until (local time, exclusive)'), { target: { value: '2026-10-02T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(adminRequest).toHaveBeenLastCalledWith(`account-support/users/${ID}/history`, { method: 'POST', body: {
      reasonCode: 'SUPPORT_REQUEST', source: 'account', eventType: 'email_login', correlationId: null,
      since: new Date('2026-10-01T00:00').toISOString(), until: new Date('2026-10-02T00:00').toISOString(), order: 'oldest', limit: 25, cursor: null
    } }));
    expect(screen.getByText(ID)).toBeInTheDocument();
  });

  it('uses applied filters when paginating and appends unique source event rows', async () => {
    adminRequest.mockImplementation(async (path, options) => path === 'account-support/access' ? { available: true, profileCorrectionsAvailable: true } : path === 'account-support/lookup' ? { state: 'found', account } : path.endsWith('/profile') ? { profile } : page([event], 'next-page'));
    render(<AccountSupport />); await loaded();
    fireEvent.change(screen.getByLabelText('History source'), { target: { value: 'audit' } });
    adminRequest.mockResolvedValue(page([{ ...event, id: OTHER, source: 'account', eventType: 'email_login', correlationId: null }]));
    fireEvent.click(screen.getByRole('button', { name: 'Load more history' }));
    await screen.findByText('email_login'); expect(screen.getByText('account.registered')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenLastCalledWith(`account-support/users/${ID}/history`, { method: 'POST', body: {
      reasonCode: 'SUPPORT_REQUEST', source: null, eventType: null, correlationId: null, since: null, until: null, order: 'newest', limit: 25, cursor: 'next-page'
    } });
    expect(screen.queryByRole('button', { name: 'Load more history' })).not.toBeInTheDocument();
  });

  it('correlates across recorded sources using the selected correlation ID', async () => {
    render(<AccountSupport />); await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Filter correlation synthetic-correlation' }));
    await waitFor(() => expect(adminRequest).toHaveBeenLastCalledWith(`account-support/users/${ID}/history`, { method: 'POST', body: {
      reasonCode: 'SUPPORT_REQUEST', source: null, eventType: null, correlationId: 'synthetic-correlation', since: null, until: null, order: 'newest', limit: 25, cursor: null
    } }));
    expect(screen.getByLabelText('Correlation ID')).toHaveValue('synthetic-correlation');
  });

  it('preserves the previous page when load-more fails and offers retry', async () => {
    adminRequest.mockImplementation(async path => path === 'account-support/access' ? { available: true, profileCorrectionsAvailable: true } : path === 'account-support/lookup' ? { state: 'found', account } : path.endsWith('/profile') ? { profile } : page([event], 'next-page'));
    render(<AccountSupport />); await loaded(); adminRequest.mockRejectedValue(fail(503));
    fireEvent.click(screen.getByRole('button', { name: 'Load more history' }));
    await screen.findByText(/More history could not be loaded/);
    expect(screen.getByText('account.registered')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Load more history' })).toBeEnabled();
  });

  it('clears old history when applying filters fails', async () => {
    render(<AccountSupport />); await loaded(); adminRequest.mockRejectedValue(fail(400));
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' })); await screen.findByText(/History could not be loaded/);
    expect(screen.queryByText('account.registered')).not.toBeInTheDocument();
  });

  it.each([401, 403])('clears all account data on authorization loss (%s)', async status => {
    render(<AccountSupport />); await loaded(); adminRequest.mockRejectedValue(fail(status));
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' })); await screen.findByText(/Active owner access is required/);
    expect(screen.queryByText(ID)).not.toBeInTheDocument(); expect(screen.queryByLabelText('Exact email address')).not.toBeInTheDocument();
  });

  it('clears identity and history immediately when the email changes', async () => {
    render(<AccountSupport />); await loaded();
    fireEvent.change(screen.getByLabelText('Exact email address'), { target: { value: 'other@example.invalid' } });
    expect(screen.queryByText(ID)).not.toBeInTheDocument(); expect(screen.queryByText('account.registered')).not.toBeInTheDocument();
  });

  it('clear discards a late lookup response and removes the entered email', async () => {
    const pending = deferred();
    adminRequest.mockImplementation(path => path === 'account-support/access' ? Promise.resolve({ available: true, profileCorrectionsAvailable: true }) : pending.promise);
    render(<AccountSupport />); await lookup(); fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await act(async () => { pending.resolve({ state: 'found', account }); });
    expect(screen.getByLabelText('Exact email address')).toHaveValue(''); expect(screen.queryByText(ID)).not.toBeInTheDocument();
  });

  it('discards late history after a different account lookup begins', async () => {
    const pending = deferred(); let historyCalls = 0;
    adminRequest.mockImplementation(async path => {
      if (path === 'account-support/access') return { available: true, profileCorrectionsAvailable: true };
      if (path === 'account-support/lookup') return { state: 'found', account: { ...account, id: historyCalls ? OTHER : ID } };
      if (path.endsWith('/profile')) return { profile };
      historyCalls += 1; return historyCalls === 1 ? pending.promise : page([{ ...event, id: OTHER, eventType: 'account.email_verified' }]);
    });
    render(<AccountSupport />); await lookup(); await screen.findByText(ID);
    fireEvent.change(screen.getByLabelText('Exact email address'), { target: { value: 'other@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up account' })); await screen.findByText('account.email_verified');
    await act(async () => { pending.resolve(page()); });
    expect(screen.getByText(OTHER)).toBeInTheDocument(); expect(screen.queryByText('account.registered')).not.toBeInTheDocument();
  });

  it('rejects malformed history responses without describing them as complete', async () => {
    adminRequest.mockImplementation(async path => path === 'account-support/access' ? { available: true, profileCorrectionsAvailable: true } : path === 'account-support/lookup' ? { state: 'found', account } : { items: [], coverage: 'complete' });
    render(<AccountSupport />); await lookup(); await screen.findByText(/History could not be loaded/);
    expect(screen.queryByText('No recorded events matched these filters.')).not.toBeInTheDocument();
  });

  it('hides the form when lookup loses owner access', async () => {
    adminRequest.mockImplementation(async path => { if (path === 'account-support/access') return { available: true, profileCorrectionsAvailable: true }; throw fail(403); });
    render(<AccountSupport />); await lookup(); await screen.findByText(/Active owner access is required/);
    expect(screen.queryByLabelText('Exact email address')).not.toBeInTheDocument();
  });
});
