import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Waitlist from './Waitlist.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

const firstPage = {
  items: [{
    id: '01900000-0000-7000-8000-000000000001',
    email: 'person@example.com',
    status: 'waiting',
    source: 'lythaus.co',
    createdAt: '2026-08-14T07:00:00.000Z',
    retentionHold: false,
  }],
  nextCursor: 'next-page',
  totalMatching: 245,
  summary: { totalWaiting: 123, last7Days: 18 }
};

describe('Waitlist', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true }) : Promise.resolve(firstPage));
  });

  it('shows loading before rendering any PII, then renders summary and table', async () => {
    let resolveRequest;
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true }) : new Promise((resolve) => { resolveRequest = resolve; }));
    render(<Waitlist />);
    expect(screen.getByText('Loading waitlist...')).toBeInTheDocument();
    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument();

    resolveRequest(firstPage);
    await waitFor(() => expect(screen.getByText('person@example.com')).toBeInTheDocument());
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Showing 1 loaded of 245 matching contacts.');
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    expect(screen.queryByText('01900000-0000-7000-8000-000000000001')).not.toBeInTheDocument();
  });

  it('renders the exact empty state', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true })
      : Promise.resolve({ items: [], nextCursor: null, totalMatching: 0, summary: { totalWaiting: 0, last7Days: 0 } }));
    render(<Waitlist />);
    expect(await screen.findByText('No waitlist signups yet')).toBeInTheDocument();
    expect(screen.getByText('New waitlist requests will appear here.')).toBeInTheDocument();
  });

  it('renders a safe API error state', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true }) : Promise.resolve({ error: 'database stack detail' }));
    render(<Waitlist />);
    expect(await screen.findByText('Waitlist data could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('database stack detail')).not.toBeInTheDocument();
  });

  it('uses the opaque next cursor and appends the next page', async () => {
    const secondPage = {
        items: [{ id: 'second', email: 'second@example.com', status: 'waiting', source: 'lythaus.co', createdAt: '2026-08-13T07:00:00.000Z', retentionHold: false }],
        nextCursor: null,
        totalMatching: 245,
        summary: firstPage.summary
    };
    adminRequest.mockImplementation((path, options) => path === 'account-support/access'
      ? Promise.resolve({ available: true })
      : options?.query?.cursor ? Promise.resolve(secondPage) : Promise.resolve(firstPage));
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('second@example.com');
    expect(adminRequest).toHaveBeenLastCalledWith('waitlist', { query: { status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: 'next-page' } });
  });

  it('sends exact-email search only in the bounded POST body', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true }) : Promise.resolve(firstPage));
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.change(screen.getByLabelText('Search exact email'), { target: { value: 'person@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(adminRequest).toHaveBeenLastCalledWith('waitlist/search', { method: 'POST', body: {
      q: 'person@example.com', status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null,
    } }));
  });

  it('checks account identity only through the audited owner lookup and never merges records', async () => {
    const linked = { id: '01900000-0000-7000-8000-000000000099', status: 'active' };
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true })
      : path === 'account-support/lookup'
        ? Promise.resolve({ state: 'found', account: linked }) : Promise.resolve(firstPage));
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.click(await screen.findByRole('button', { name: 'Check account' }));
    const openAccount = await screen.findByRole('link', { name: 'Open matched account' });
    expect(openAccount).toHaveAttribute('href', `/accounts/management?q=${linked.id}`);
    expect(adminRequest).toHaveBeenCalledWith('account-support/lookup', { method: 'POST', body: {
      email: 'person@example.com', reasonCode: 'WAITLIST_ACCOUNT_MATCH',
    } });
    expect(screen.getByText(/Waitlist signups collect email only\./)).toBeInTheDocument();
  });

  it('explains when an exact-email scan exceeds its explicit cap', async () => {
    const tooBroad = Object.assign(new Error('too broad'), { status: 400, payload: { error: 'waitlist_search_scope_too_large' } });
    adminRequest.mockImplementation((path, options) => path === 'account-support/access'
      ? Promise.resolve({ available: true })
      : options?.method === 'POST' ? Promise.reject(tooBroad) : Promise.resolve(firstPage));
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.change(screen.getByLabelText('Search exact email'), { target: { value: 'person@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByText(/more than 1,000 filtered signups/)).toBeInTheDocument();
  });

  it('updates status and a retention hold without exposing implementation detail', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access'
      ? Promise.resolve({ available: true })
      : path.endsWith('/status') ? Promise.resolve({ id: firstPage.items[0].id, status: 'invited' })
        : path.endsWith('/retention-hold') ? Promise.resolve({ id: firstPage.items[0].id, retentionHold: true })
          : Promise.resolve(firstPage));
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.change(screen.getByLabelText('Update waitlist status for person@example.com'), { target: { value: 'invited' } });
    fireEvent.change(screen.getByLabelText('Waitlist reason code'), { target: { value: 'BETA_INVITE' } });
    fireEvent.change(screen.getByLabelText('Waitlist confirmation'), { target: { value: 'UPDATE WAITLIST STATUS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('invited', { selector: 'span.waitlist-status' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    fireEvent.change(screen.getByLabelText('Waitlist reason code'), { target: { value: 'RETENTION_REVIEW' } });
    fireEvent.change(screen.getByLabelText('Waitlist confirmation'), { target: { value: 'PLACE RETENTION HOLD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Release hold' })).toBeInTheDocument());
    expect(adminRequest).toHaveBeenCalledWith(`waitlist/${firstPage.items[0].id}/status`, {
      method: 'POST', body: { status: 'invited', reasonCode: 'BETA_INVITE', confirmation: 'UPDATE WAITLIST STATUS' }
    });
    expect(adminRequest).toHaveBeenCalledWith(`waitlist/${firstPage.items[0].id}/retention-hold`, {
      method: 'POST', body: { active: true, reasonCode: 'RETENTION_REVIEW', confirmation: 'PLACE RETENTION HOLD' }
    });
  });
});
