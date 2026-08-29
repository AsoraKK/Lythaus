import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Users from './Users.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

const user = {
  id: '01900000-0000-7000-8000-000000000001', email: 'person@example.com', displayName: 'Person', handle: 'person',
  status: 'active', verificationState: 'verified', currentSessionCount: 2, createdAt: '2026-08-14T07:00:00.000Z',
};

describe('Users', () => {
  beforeEach(() => {
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve({ items: [user], nextCursor: null }) : Promise.resolve({ user }));
  });

  it('loads the paginated user route and shows safe identity fields', async () => {
    render(<Users />);
    expect(await screen.findByText('person@example.com')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('users', { query: { q: '', status: '', source: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
  });

  it('requires typed confirmation before a status mutation', async () => {
    render(<Users />);
    await screen.findByText('person@example.com');
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
