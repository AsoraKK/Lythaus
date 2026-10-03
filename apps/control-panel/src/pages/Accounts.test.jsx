import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlPanelRoutes } from '../App.jsx';
import Nav from '../components/Nav.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="Current route">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Back</button></>;
}

function mount(path) {
  return render(<MemoryRouter initialEntries={[path]}><Nav /><Location /><ControlPanelRoutes /></MemoryRouter>);
}

describe('Accounts workspace', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockImplementation(path => {
      if (path === 'account-support/access') return Promise.resolve({ available: true });
      if (path === 'users') return Promise.resolve({ items: [
        { id: 'registered-pending', status: 'active', verificationState: 'pending_verification', displayName: 'Unverified member' },
        { id: 'registered-suspended', status: 'suspended', displayName: 'Suspended member' },
        { id: 'registered-locked', status: 'locked', displayName: 'Locked member', currentSessionCount: 0 },
      ], nextCursor: null });
      return Promise.reject(new Error('Unexpected test route'));
    });
  });

  it('has one Accounts entry and keeps support separate from administration', async () => {
    mount('/accounts');
    await screen.findByRole('button', { name: 'Look up account' });
    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(adminRequest).not.toHaveBeenCalledWith('users', expect.anything());
    fireEvent.click(screen.getByRole('link', { name: 'Account administration' }));
    await screen.findByText('Unverified member');
    expect(screen.getByText('Suspended member')).toBeInTheDocument();
    expect(screen.getByText('Locked member')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('users', expect.objectContaining({ query: expect.objectContaining({ status: '' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('button', { name: 'Look up account' });
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/accounts');
  });

  it.each([['/users?source=email#review', '/accounts/management?source=email#review'], ['/account-support?case=example#history', '/accounts?case=example#history']])('retains the legacy alias %s', async (path, expected) => {
    mount(path);
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent(expected));
    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
  });

  it('does not mount a simulation at the retired Preview URL', () => {
    mount('/preview');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('does not turn workspace navigation into owner support access', async () => {
    adminRequest.mockRejectedValue(Object.assign(new Error('Denied'), { status: 403 }));
    mount('/accounts');
    expect(await screen.findByRole('alert')).toHaveTextContent('Active owner access is required');
    expect(screen.queryByLabelText('Exact email address')).not.toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });
});
