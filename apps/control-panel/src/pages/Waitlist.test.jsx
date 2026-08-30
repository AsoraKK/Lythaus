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
  summary: { totalWaiting: 123, last7Days: 18 }
};

describe('Waitlist', () => {
  beforeEach(() => adminRequest.mockReset());

  it('shows loading before rendering any PII, then renders summary and table', async () => {
    let resolveRequest;
    adminRequest.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
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
    adminRequest.mockResolvedValue({ error: 'database stack detail' });
    render(<Waitlist />);
    expect(await screen.findByText('Waitlist data could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('database stack detail')).not.toBeInTheDocument();
  });

  it('uses the opaque next cursor and appends the next page', async () => {
    adminRequest
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        items: [{ id: 'second', email: 'second@example.com', status: 'waiting', source: 'lythaus.co', createdAt: '2026-08-13T07:00:00.000Z', retentionHold: false }],
        nextCursor: null,
        summary: firstPage.summary
      });
    render(<Waitlist />);
    await screen.findByText('person@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('second@example.com');
    expect(adminRequest).toHaveBeenLastCalledWith('waitlist', { query: { q: '', status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: 'next-page' } });
  });

  it('updates status and a retention hold without exposing implementation detail', async () => {
    adminRequest
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({ id: firstPage.items[0].id, status: 'invited' })
      .mockResolvedValueOnce({ id: firstPage.items[0].id, retentionHold: true });
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
    expect(adminRequest).toHaveBeenNthCalledWith(2, `waitlist/${firstPage.items[0].id}/status`, {
      method: 'POST', body: { status: 'invited', reasonCode: 'BETA_INVITE', confirmation: 'UPDATE WAITLIST STATUS' }
    });
    expect(adminRequest).toHaveBeenNthCalledWith(3, `waitlist/${firstPage.items[0].id}/retention-hold`, {
      method: 'POST', body: { active: true, reasonCode: 'RETENTION_REVIEW', confirmation: 'PLACE RETENTION HOLD' }
    });
  });
});
