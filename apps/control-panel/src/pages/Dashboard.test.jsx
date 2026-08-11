import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard.jsx';
import { adminRequest, getAdminApiUrl } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({
  adminRequest: vi.fn(),
  getAbsoluteAdminApiUrl: vi.fn(() => 'https://admin-api.lythaus.co/api/admin'),
  getAdminApiUrl: vi.fn(() => '/api/admin'),
  setAdminApiUrl: vi.fn(),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    getAdminApiUrl.mockReturnValue('/api/admin');
  });

  it('loads only canonical admin Worker routes', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'health') return Promise.resolve({ status: 'ok', database: { database_time: '2026-08-10T00:00:00Z' } });
      if (path === 'moderation/cases') return Promise.resolve({ items: [{ state: 'open' }] });
      if (path === 'appeals/pending-adjudication') return Promise.resolve({ items: [{ appeal_id: 'a1' }] });
      if (path === 'audit') return Promise.resolve({ items: [{ id: 'e1' }] });
      return Promise.reject(new Error(`unexpected route ${path}`));
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument());
    expect(screen.getByText('Open moderation cases', { selector: 'span' }).nextSibling.textContent).toBe('1');
    expect(adminRequest).toHaveBeenCalledTimes(4);
    expect(adminRequest).not.toHaveBeenCalledWith(expect.stringContaining('_admin'), expect.anything());
  });
});
