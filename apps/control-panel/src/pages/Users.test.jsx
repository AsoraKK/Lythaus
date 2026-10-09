import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Users from './Users.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

const user = {
  id: '01900000-0000-7000-8000-000000000001', email: 'private@example.com', displayName: 'Person', handle: 'person',
  status: 'active', verificationState: 'verified', currentSessionCount: 2, createdAt: '2026-08-14T07:00:00.000Z',
};
const page = (items = [user], nextCursor = null) => ({ items, nextCursor });
const denied = (status = 403) => Promise.reject(Object.assign(new Error('denied'), { status }));

describe('Users', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page()) : Promise.resolve({ user }));
  });

  it('shows loading, then a private-data-minimal page with honest profile capabilities', async () => {
    let resolveUsers;
    adminRequest.mockImplementation((path) => path === 'users' ? new Promise((resolve) => { resolveUsers = resolve; }) : Promise.resolve({ user }));
    render(<Users />);
    expect(screen.getByText('Loading users...')).toBeInTheDocument();
    resolveUsers(page());
    expect(await screen.findByText('Person')).toBeInTheDocument();
    expect(screen.getByText(user.id)).toBeInTheDocument();
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('verified')).not.toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('users', { query: { q: '', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Review account Person' }));
    expect(await screen.findByText('Profile editing is unavailable in this admin view. The canonical admin role does not have the social-profile write permission required to edit app profiles.')).toBeInTheDocument();
    expect(screen.getByText('Owner-only in Account support')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
  });

  it('submits list filters and follows only the returned opaque cursor', async () => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second' };
    adminRequest.mockImplementation((path, options) => {
      if (path !== 'users') return Promise.resolve({ user });
      if (options?.query?.cursor === 'opaque-next') return Promise.resolve(page([second]));
      if (options?.query?.q === 'Person') return Promise.resolve(page([user], 'opaque-next'));
      return Promise.resolve(page());
    });
    render(<Users />);
    await screen.findByText('Person');
    fireEvent.change(screen.getByLabelText('Search registered accounts'), { target: { value: 'Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('users', { query: { q: 'Person', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('users', { query: { q: 'Person', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: 'opaque-next' } });
  });

  it('ignores an in-flight older page after a newer account search completes', async () => {
    const searchResult = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Search result' };
    const staleResult = { ...user, id: '01900000-0000-7000-8000-000000000003', displayName: 'Stale page' };
    let resolveNextPage;
    let resolveSearch;
    adminRequest.mockImplementation((path, options) => {
      if (path !== 'users') return Promise.resolve({ user });
      if (options.query.cursor === 'users-next') return new Promise((resolve) => { resolveNextPage = resolve; });
      if (options.query.q === 'searched') return new Promise((resolve) => { resolveSearch = resolve; });
      return Promise.resolve(page([user], 'users-next'));
    });

    render(<Users />);
    await screen.findByText('Person');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    fireEvent.change(screen.getByLabelText('Search registered accounts'), { target: { value: 'searched' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await act(async () => { resolveSearch(page([searchResult], 'search-next')); });
    expect(await screen.findByText('Search result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();

    await act(async () => { resolveNextPage(page([staleResult])); });
    expect(screen.queryByText('Stale page')).not.toBeInTheDocument();
    expect(screen.getByText('Search result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
  });

  it('submits the labelled account search from the keyboard', async () => {
    const keyboard = userEvent.setup();
    const result = { ...user, displayName: 'Keyboard result' };
    adminRequest.mockImplementation((path, options) => path === 'users'
      ? Promise.resolve(options.query.q ? page([result]) : page([]))
      : Promise.resolve({ user }));

    render(<Users />);
    await screen.findByText('No registered accounts match these filters.');
    const search = screen.getByRole('textbox', { name: 'Search registered accounts' });
    await keyboard.type(search, 'Keyboard');
    await keyboard.keyboard('{Enter}');

    expect(await screen.findByText('Keyboard result')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenLastCalledWith('users', { query: { q: 'Keyboard', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
  });

  it('distinguishes an empty result from API errors and authentication denial', async () => {
    adminRequest.mockResolvedValue(page([]));
    const { unmount } = render(<Users />);
    expect(await screen.findByText('No registered accounts match these filters.')).toBeInTheDocument();
    unmount();

    adminRequest.mockRejectedValue(new Error('database internals'));
    render(<Users />);
    expect(await screen.findByRole('alert')).toHaveTextContent('User data could not be loaded.');
    expect(screen.queryByText('database internals')).not.toBeInTheDocument();
  });

  it('offers a retry after a list error and replaces the error with authorized results', async () => {
    let requests = 0;
    adminRequest.mockImplementation((path) => {
      if (path !== 'users') return Promise.resolve({ user });
      requests += 1;
      return requests === 1 ? Promise.reject(new Error('temporary failure')) : Promise.resolve(page());
    });

    render(<Users />);
    expect(await screen.findByRole('alert')).toHaveTextContent('User data could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Person')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a clear 403 state and does not render account rows', async () => {
    adminRequest.mockRejectedValue(Object.assign(new Error('denied'), { status: 403 }));
    render(<Users />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required to view registered accounts.');
    expect(screen.queryByText('Person')).not.toBeInTheDocument();
  });

  it('shows the sign-in requirement for a 401 response', async () => {
    adminRequest.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
    render(<Users />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in through approved admin access to view registered accounts.');
  });

  it('routes email search to the owner-only support workspace', async () => {
    render(<Users />);
    await screen.findByText('Person');
    fireEvent.change(screen.getByLabelText('Search registered accounts'), { target: { value: 'private@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Exact email lookup is available only in the owner-only Account support tab.');
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });

  it('requires reason-coded confirmation for reversible account status actions', async () => {
    render(<Users />);
    await screen.findByText('Person');
    fireEvent.click(screen.getByRole('button', { name: 'Review account Person' }));
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
