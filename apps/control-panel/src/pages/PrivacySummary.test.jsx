import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ControlPanelRoutes } from '../App.jsx';
import { adminRequest } from '../api/adminApi.js';
import { AdminRoleContext } from '../components/AdminAccessGate.jsx';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

function mount(role) {
  return render(<MemoryRouter><AdminRoleContext.Provider value={role}>
    <ControlPanelRoutes />
  </AdminRoleContext.Provider></MemoryRouter>);
}

beforeEach(() => {
  adminRequest.mockReset();
  adminRequest.mockImplementation(async path => {
    if (path === 'privacy/summary') return { sampledAt: '2026-11-28T00:00:00Z', privacyRequests: 0, activeLegalHolds: 4 };
    return { items: [] };
  });
});

it.each(['administrator', 'privacy_operator'])('shows %s the sampled counts on request and clears them after denial', async role => {
  mount(role);
  const check = screen.getByRole('button', { name: 'Check counts' });
  expect(adminRequest).not.toHaveBeenCalledWith('privacy/summary');
  fireEvent.click(check);
  expect((await screen.findByText('Total privacy requests')).nextElementSibling).toHaveTextContent('0');
  expect(screen.getByText('Active legal holds').nextElementSibling).toHaveTextContent('4');
  expect(adminRequest).not.toHaveBeenCalledWith('privacy/requests');
  expect(adminRequest).not.toHaveBeenCalledWith('privacy/legal-holds');
  if (role === 'privacy_operator') expect(adminRequest).toHaveBeenCalledTimes(1);
  adminRequest.mockRejectedValueOnce({ status: 403 });
  fireEvent.click(check);
  expect(await screen.findByText('Privacy access was denied.')).toBeInTheDocument();
  expect(screen.queryByText('Active legal holds')).not.toBeInTheDocument();
});

it.each(['owner', 'operations', 'moderator', 'editorial', null])('omits the privacy counts for %s', async role => {
  mount(role);
  await waitFor(() => expect(adminRequest).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Check counts' })).not.toBeInTheDocument();
  expect(adminRequest).not.toHaveBeenCalledWith('privacy/summary');
});
