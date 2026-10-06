import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Users from './Users.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

const user = {
  id: '01900000-0000-7000-8000-000000000001', displayName: 'Person', handle: 'person',
  status: 'active', currentSessionCount: 2, createdAt: '2026-08-14T07:00:00.000Z',
};

describe('Users', () => {
  beforeEach(() => {
    adminRequest.mockImplementation((path) => ['users', 'users/search-by-email'].includes(path)
      ? Promise.resolve({ items: [user], totalMatching: 207, nextCursor: null }) : Promise.resolve({ user }));
  });

  it('loads the paginated user route and shows safe identity fields', async () => {
    render(<Users />);
    expect(await screen.findByText('Person')).toBeInTheDocument();
    expect(screen.getByText('@person · 01900000-0000-7000-8000-000000000001')).toBeInTheDocument();
    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 loaded of 207 matching accounts.')).toBeInTheDocument();
    expect(screen.getByText(/Exact email search is owner-only, audited, and sent in a private request body\./)).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('users', { query: { q: '', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
  });

  it('sends exact account email search only in the bounded POST body', async () => {
    render(<Users />);
    await screen.findByText('Person');
    fireEvent.change(screen.getByLabelText('Search registered accounts'), { target: { value: 'person@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(adminRequest).toHaveBeenLastCalledWith('users/search-by-email', { method: 'POST', body: {
      q: 'person@example.com', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null,
    } }));
  });

  it('requires typed confirmation before a status mutation', async () => {
    render(<Users />);
    await screen.findByText('Person');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByText('Keeper actions');
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(`users/${user.id}/status`, {
      method: 'POST', body: { status: 'suspended', reasonCode: 'ABUSE_PATTERN', confirmation: 'SUSPEND ACCOUNT' },
    }));
  });
});
