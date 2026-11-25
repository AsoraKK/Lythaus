import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { adminRequest } from '../api/adminApi.js';
import AdminAccessGate from './AdminAccessGate.jsx';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));
beforeEach(() => { adminRequest.mockReset(); });

it('opens the panel after a successful Admin health response', async () => {
  adminRequest.mockResolvedValue({ status: 'ok' });
  render(<AdminAccessGate>Panel content</AdminAccessGate>);
  expect(await screen.findByText('Panel content')).toBeInTheDocument();
});

it.each([
  [{ status: 401 }, /sign in through/i],
  [{ status: 403, payload: { error: 'admin_role_required' } }, /no active administrator membership/i],
  [{ status: 500, payload: { error: 'admin_request_failed' } }, /service could not verify access/i],
  [new TypeError('network'), /service could not verify access/i],
])('keeps the panel closed and explains the health failure', async (failure, message) => {
  adminRequest.mockRejectedValue(failure);
  render(<AdminAccessGate>Panel content</AdminAccessGate>);
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByText('Panel content')).not.toBeInTheDocument();
});

it('shows only a valid request reference for an unavailable service', async () => {
  const correlationId = 'abcde123-1234-4567-89ab-123456789abc';
  adminRequest.mockRejectedValue({ status: 500, payload: { error: 'private detail', correlationId } });
  render(<AdminAccessGate>Panel content</AdminAccessGate>);
  expect(await screen.findByRole('alert')).toHaveTextContent(correlationId);
  expect(screen.queryByText(/private detail/)).not.toBeInTheDocument();
});

it('keeps the panel closed on a successful HTTP response with an unexpected body', async () => {
  adminRequest.mockResolvedValue({ message: '<html>Login</html>' });
  render(<AdminAccessGate>Panel content</AdminAccessGate>);
  expect(await screen.findByRole('alert')).toHaveTextContent(/service could not verify access/i);
  expect(screen.queryByText('Panel content')).not.toBeInTheDocument();
});
