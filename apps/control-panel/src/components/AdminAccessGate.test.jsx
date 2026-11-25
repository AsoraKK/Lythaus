import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminRequest } from '../api/adminApi.js';
import AdminAccessGate from './AdminAccessGate.jsx';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));
beforeEach(() => { adminRequest.mockReset(); });
const originalUrl = window.location.href;
afterEach(() => { globalThis.jsdom.reconfigure({ url: originalUrl }); });

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

const isolatedOrigin = 'https://admin-new-core-test.lythaus.co';
const reference = '01900000-0000-7000-8000-000000000042';
const privateDetail = 'private-provider-message';
const readFailure = {
  error: 'admin_request_failed', correlationId: reference,
  diagnostic: { stage: 'db_connect', category: 'pool_acquire_failed', detail: privateDetail },
};

it('shows the two reviewed error codes and request reference on the isolated panel', async () => {
  globalThis.jsdom.reconfigure({ url: isolatedOrigin + '/flags' });
  adminRequest.mockRejectedValue({ status: 500, payload: readFailure });
  render(<AdminAccessGate>Panel content</AdminAccessGate>);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/Request stage db_connect/);
  expect(alert).toHaveTextContent(/Failure category pool_acquire_failed/);
  expect(alert).toHaveTextContent(reference);
  expect(alert).not.toHaveTextContent(privateDetail);
  expect(screen.queryByText('Panel content')).not.toBeInTheDocument();
});

it.each([
  ['production host', 'https://admin.lythaus.co', 500, {}],
  ['final host', 'https://control.lythaus.co', 500, {}],
  ['alternate port', isolatedOrigin + ':8443', 500, {}],
  ['plaintext origin', 'http://admin-new-core-test.lythaus.co', 500, {}],
  ['different status', isolatedOrigin, 503, {}],
  ['different error', isolatedOrigin, 500, { error: privateDetail }],
  ['invalid reference', isolatedOrigin, 500, { correlationId: privateDetail }],
  ['unknown stage', isolatedOrigin, 500, { diagnostic: { stage: privateDetail, category: 'unclassified' } }],
  ['unknown category', isolatedOrigin, 500, { diagnostic: { stage: 'membership_query', category: privateDetail } }],
])('omits the diagnostic for %s', async (_name, origin, status, overrides) => {
  globalThis.jsdom.reconfigure({ url: origin + '/flags' });
  adminRequest.mockRejectedValue({ status, payload: { ...readFailure, ...overrides } });
  render(<AdminAccessGate>Panel content</AdminAccessGate>);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/could not verify access/i);
  expect(alert).not.toHaveTextContent(/Request stage|Failure category|private-provider-message/);
});
