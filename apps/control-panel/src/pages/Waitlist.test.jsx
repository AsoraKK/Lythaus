import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Waitlist from './Waitlist.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

const waitlistId = '01900000-0000-7000-8000-000000000001';

const firstPage = {
  items: [{
    id: waitlistId,
    email: 'person@example.com',
    status: 'waiting',
    source: 'lythaus.co',
    createdAt: '2026-08-14T07:00:00.000Z',
    retentionHold: false,
  }],
  nextCursor: 'next-page',
  summary: { totalWaiting: 123, last7Days: 18 }
};

function ownerDenied() {
  return Promise.reject(Object.assign(new Error('Denied'), { status: 403 }));
}

function emptyPage() {
  return { items: [], nextCursor: null, summary: { totalWaiting: 0, last7Days: 0, last24Hours: 0 } };
}

describe('Waitlist', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockImplementation((path) => path === 'account-support/access' ? ownerDenied() : Promise.resolve(emptyPage()));
  });

  it('shows loading before rendering any PII, then renders summary and table', async () => {
    let resolveRequest;
    adminRequest.mockImplementation((path) => path === 'account-support/access' ? ownerDenied() : new Promise((resolve) => { resolveRequest = resolve; }));
    render(<Waitlist />);
    expect(screen.getByText('Loading waitlist...')).toBeInTheDocument();
    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument();

    resolveRequest(firstPage);
    await waitFor(() => expect(screen.getByText('person@example.com')).toBeInTheDocument());
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    expect(screen.queryByText('01900000-0000-7000-8000-000000000001')).not.toBeInTheDocument();
  });

  it('renders the exact empty state', async () => {
    adminRequest.mockResolvedValue({ items: [], nextCursor: null, summary: { totalWaiting: 0, last7Days: 0 } });
    render(<Waitlist />);
    expect(await screen.findByText('No waitlist signups yet')).toBeInTheDocument();
    expect(screen.getByText('New waitlist requests will appear here.')).toBeInTheDocument();
  });

  it('renders a safe API error state', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access' ? ownerDenied() : Promise.resolve({ error: 'database stack detail' }));
    render(<Waitlist />);
    expect(await screen.findByText('Waitlist data could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('database stack detail')).not.toBeInTheDocument();
  });

  it('offers a retry after a list error and loads the authorized list', async () => {
    let requests = 0;
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      requests += 1;
      return requests === 1 ? Promise.reject(new Error('temporary failure')) : Promise.resolve(firstPage);
    });

    render(<Waitlist />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Waitlist data could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('person@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the opaque next cursor and appends the next page', async () => {
    let page = 0;
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path !== 'waitlist') return Promise.reject(new Error('Unexpected test route'));
      page += 1;
      return Promise.resolve(page === 1 ? firstPage : {
        items: [{ id: 'second', email: 'second@example.com', status: 'waiting', source: 'lythaus.co', createdAt: '2026-08-13T07:00:00.000Z', retentionHold: false }],
        nextCursor: null,
        summary: firstPage.summary
      });
    });
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('second@example.com');
    expect(adminRequest).toHaveBeenLastCalledWith('waitlist', { query: { q: '', status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: 'next-page' } });
  });

  it('ignores an in-flight older page after a newer waitlist search completes', async () => {
    const searchResult = { ...firstPage.items[0], id: 'search-result', email: 'search@example.invalid' };
    const staleResult = { ...firstPage.items[0], id: 'stale-result', email: 'stale@example.invalid' };
    let resolveNextPage;
    let resolveSearch;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path !== 'waitlist') return Promise.reject(new Error('Unexpected test route'));
      if (options.query.cursor === 'next-page') return new Promise((resolve) => { resolveNextPage = resolve; });
      if (options.query.q === 'search@example.invalid') return new Promise((resolve) => { resolveSearch = resolve; });
      return Promise.resolve(firstPage);
    });

    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    fireEvent.change(screen.getByLabelText('Search waitlist by exact email'), { target: { value: 'search@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    await act(async () => { resolveSearch({ items: [searchResult], nextCursor: 'search-next', summary: firstPage.summary }); });
    expect(await screen.findByText('search@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();

    await act(async () => { resolveNextPage({ items: [staleResult], nextCursor: null, summary: firstPage.summary }); });
    expect(screen.queryByText('stale@example.invalid')).not.toBeInTheDocument();
    expect(screen.getByText('search@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
  });

  it('submits the labelled exact-email search from the keyboard', async () => {
    const keyboard = userEvent.setup();
    const result = { ...firstPage.items[0], email: 'keyboard@example.invalid' };
    adminRequest.mockImplementation((path, options) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path !== 'waitlist') return Promise.reject(new Error('Unexpected test route'));
      return Promise.resolve(options.query.q ? { ...firstPage, items: [result], nextCursor: null } : emptyPage());
    });

    render(<Waitlist />);
    await screen.findByText('No waitlist signups yet');
    const search = screen.getByRole('textbox', { name: 'Search waitlist by exact email' });
    await keyboard.type(search, 'keyboard@example.invalid');
    await keyboard.keyboard('{Enter}');

    expect(await screen.findByText('keyboard@example.invalid')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenLastCalledWith('waitlist', { query: { q: 'keyboard@example.invalid', status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
  });

  it('updates status and a retention hold without exposing implementation detail', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path === 'waitlist') return Promise.resolve(firstPage);
      if (path.endsWith('/status')) return Promise.resolve({ id: firstPage.items[0].id, status: 'invited' });
      if (path.endsWith('/retention-hold')) return Promise.resolve({ id: firstPage.items[0].id, retentionHold: true });
      return Promise.reject(new Error('Unexpected test route'));
    });
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.change(screen.getByLabelText('Update waitlist status for person@example.com'), { target: { value: 'invited' } });
    expect(screen.getByRole('note')).toHaveTextContent('person@example.com');
    expect(screen.getByText('Change status from waiting to invited.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Waitlist reason code'), { target: { value: 'BETA_INVITE' } });
    fireEvent.change(screen.getByLabelText('Waitlist confirmation'), { target: { value: `UPDATE WAITLIST STATUS ${waitlistId} TO INVITED` } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('invited', { selector: 'span.waitlist-status' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    expect(screen.getByText('Place the retention hold for this contact.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Waitlist reason code'), { target: { value: 'RETENTION_REVIEW' } });
    fireEvent.change(screen.getByLabelText('Waitlist confirmation'), { target: { value: `PLACE RETENTION HOLD ${waitlistId}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Release hold' })).toBeInTheDocument());
    expect(adminRequest).toHaveBeenCalledWith(`waitlist/${firstPage.items[0].id}/status`, {
      method: 'POST', body: { status: 'invited', reasonCode: 'BETA_INVITE', confirmation: `UPDATE WAITLIST STATUS ${waitlistId} TO INVITED` }
    });
    expect(adminRequest).toHaveBeenCalledWith(`waitlist/${firstPage.items[0].id}/retention-hold`, {
      method: 'POST', body: { active: true, reasonCode: 'RETENTION_REVIEW', confirmation: `PLACE RETENTION HOLD ${waitlistId}` }
    });
  });

  it('cancels a pending action as soon as a filter changes', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access' ? ownerDenied() : Promise.resolve(firstPage));
    render(<Waitlist />);
    await screen.findByText('person@example.com');

    fireEvent.change(screen.getByLabelText('Update waitlist status for person@example.com'), { target: { value: 'invited' } });
    expect(screen.getByRole('heading', { name: 'Confirm waitlist action' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search waitlist by exact email'), { target: { value: 'other@example.com' } });

    expect(screen.queryByRole('heading', { name: 'Confirm waitlist action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('cancels a pending action on refresh and clears the contact if access is denied', async () => {
    let waitlistRequests = 0;
    let rejectRefresh;
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      waitlistRequests += 1;
      if (waitlistRequests === 1) return Promise.resolve(firstPage);
      return new Promise((_resolve, reject) => { rejectRefresh = reject; });
    });
    render(<Waitlist />);
    await screen.findByText('person@example.com');

    fireEvent.change(screen.getByLabelText('Update waitlist status for person@example.com'), { target: { value: 'invited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.queryByRole('heading', { name: 'Confirm waitlist action' })).not.toBeInTheDocument();

    await act(async () => {
      rejectRefresh(Object.assign(new Error('Denied'), { status: 403 }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required');
    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('clears a pending action and contact data when a mutation is denied', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path === 'waitlist') return Promise.resolve(firstPage);
      if (path.endsWith('/status')) return Promise.reject(Object.assign(new Error('Denied'), { status: 403 }));
      return Promise.reject(new Error('Unexpected test route'));
    });
    render(<Waitlist />);
    await screen.findByText('person@example.com');

    fireEvent.change(screen.getByLabelText('Update waitlist status for person@example.com'), { target: { value: 'invited' } });
    fireEvent.change(screen.getByLabelText('Waitlist reason code'), { target: { value: 'BETA_INVITE' } });
    fireEvent.change(screen.getByLabelText('Waitlist confirmation'), { target: { value: `UPDATE WAITLIST STATUS ${waitlistId} TO INVITED` } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required');
    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Confirm waitlist action' })).not.toBeInTheDocument();
  });

  it('searches an exact email through the bounded Worker filter', async () => {
    let call = 0;
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path !== 'waitlist') return Promise.reject(new Error('Unexpected test route'));
      call += 1;
      return Promise.resolve(call === 1 ? emptyPage() : firstPage);
    });
    render(<Waitlist />);
    await screen.findByText('No waitlist signups yet');
    fireEvent.change(screen.getByLabelText('Search waitlist by exact email'), { target: { value: 'person@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await screen.findByText('person@example.com');
    expect(adminRequest).toHaveBeenLastCalledWith('waitlist', { query: { q: 'person@example.com', status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
  });

  it('checks an existing account only through owner support and keeps the result read-only', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return Promise.resolve({ available: true });
      if (path === 'waitlist') return Promise.resolve(firstPage);
      if (path === 'account-support/lookup') return Promise.resolve({ state: 'found', account: { id: 'account-id', status: 'active' } });
      return Promise.reject(new Error('Unexpected test route'));
    });
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Check existing account for person@example.com' }));
    expect(await screen.findByText('Existing account · active')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('account-support/lookup', { method: 'POST', body: { email: 'person@example.com', reasonCode: 'SUPPORT_REQUEST' } });
    expect(screen.getAllByText(/never merge identities/i).length).toBeGreaterThan(0);
  });

  it('distinguishes an admin access denial from an empty waitlist', async () => {
    adminRequest.mockImplementation((path) => path === 'account-support/access' ? ownerDenied() : Promise.reject(Object.assign(new Error('Denied'), { status: 403 })));
    render(<Waitlist />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required');
    expect(screen.queryByText('No waitlist signups yet')).not.toBeInTheDocument();
    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument();
  });

  it('explains how to narrow an exact search that reaches the scan limit', async () => {
    let requests = 0;
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      requests += 1;
      return requests === 1 ? Promise.resolve(emptyPage()) : Promise.reject(Object.assign(new Error('limit'), { status: 422, payload: { error: 'waitlist_search_limit_exceeded' } }));
    });
    render(<Waitlist />);
    await screen.findByText('No waitlist signups yet');
    fireEvent.change(screen.getByLabelText('Search waitlist by exact email'), { target: { value: 'missing@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This exact-email search reached the 1,000-contact scan limit. Narrow the status, source, or date filters and try again.');
  });

  it('describes the delete route as a retention-aware unsubscribe request', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'account-support/access') return ownerDenied();
      if (path === 'waitlist') return Promise.resolve(firstPage);
      if (path === `waitlist/${waitlistId}`) return Promise.resolve({ purgeBlockedByRetentionHold: true });
      return Promise.reject(new Error('Unexpected test route'));
    });
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    expect(screen.queryByRole('option', { name: 'Unsubscribe and request purge' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe + request purge' }));
    expect(screen.getByRole('note')).toHaveTextContent('person@example.com');
    expect(screen.getByText(/Current status: waiting; resulting status: unsubscribed\. An active retention hold blocks purge; this action does not immediately delete the contact\./)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Waitlist reason code'), { target: { value: 'RETENTION_REVIEW' } });
    fireEvent.change(screen.getByLabelText('Waitlist confirmation'), { target: { value: `UNSUBSCRIBE AND REQUEST PURGE ${waitlistId}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Purge is blocked by the active retention hold');
    expect(adminRequest).toHaveBeenCalledWith(`waitlist/${waitlistId}`, expect.objectContaining({ method: 'DELETE', body: expect.objectContaining({ confirmation: `UNSUBSCRIBE AND REQUEST PURGE ${waitlistId}` }) }));
  });
});
