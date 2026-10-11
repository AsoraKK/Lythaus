import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const keeper = () => within(screen.getByRole('heading', { name: 'Keeper actions' }).closest('.lyth-card'));

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
    fireEvent.click(screen.getByRole('button', { name: `Review account Person (${user.id})` }));
    expect(await screen.findByText('Profile editing is unavailable in this admin view. The canonical admin role does not have the social-profile write permission required to edit app profiles.')).toBeInTheDocument();
    expect(screen.getByText('Owner-only in Account support')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
  });

  it('keeps review labels unique when accounts share a display name', async () => {
    const duplicate = { ...user, id: '01900000-0000-7000-8000-000000000002' };
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page([user, duplicate])) : Promise.resolve({ user }));

    render(<Users />);
    expect(await screen.findAllByText('Person')).toHaveLength(2);
    expect(screen.getByRole('button', { name: `Review account Person (${user.id})` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Review account Person (${duplicate.id})` })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Load more registered accounts' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Load more registered accounts' }));
    fireEvent.change(screen.getByLabelText('Search registered accounts'), { target: { value: 'searched' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await act(async () => { resolveSearch(page([searchResult], 'search-next')); });
    expect(await screen.findByText('Search result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more registered accounts' })).toBeEnabled();

    await act(async () => { resolveNextPage(page([staleResult])); });
    expect(screen.queryByText('Stale page')).not.toBeInTheDocument();
    expect(screen.getByText('Search result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more registered accounts' })).toBeEnabled();
  });

  it('does not restore rows from a pending page after exact-email lookup is rejected', async () => {
    const staleUser = { ...user, id: '01900000-0000-7000-8000-000000000003', displayName: 'Stale page' };
    let resolveNextPage;
    adminRequest.mockImplementation((path, options) => {
      if (path !== 'users') return Promise.resolve({ user });
      if (options.query.cursor === 'users-next') return new Promise((resolve) => { resolveNextPage = resolve; });
      return Promise.resolve(page([user], 'users-next'));
    });

    render(<Users />);
    await screen.findByText('Person');
    fireEvent.click(screen.getByRole('button', { name: 'Load more registered accounts' }));
    fireEvent.change(screen.getByLabelText('Search registered accounts'), { target: { value: 'private@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Exact email lookup is available only in the owner-only Account support tab.');
    expect(screen.queryByText('Person')).not.toBeInTheDocument();

    await act(async () => { resolveNextPage(page([staleUser])); });
    expect(screen.queryByText('Stale page')).not.toBeInTheDocument();
    expect(screen.queryByText('Person')).not.toBeInTheDocument();
  });

  it('does not restore rows from a pending page after account detail access is denied', async () => {
    const staleUser = { ...user, id: '01900000-0000-7000-8000-000000000003', displayName: 'Stale page' };
    let resolveNextPage;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'users' && options.query.cursor === 'users-next') return new Promise((resolve) => { resolveNextPage = resolve; });
      if (path === 'users') return Promise.resolve(page([user], 'users-next'));
      return denied(403);
    });

    render(<Users />);
    await screen.findByText('Person');
    fireEvent.click(screen.getByRole('button', { name: 'Load more registered accounts' }));
    fireEvent.click(screen.getByRole('button', { name: `Review account Person (${user.id})` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required to review this account.');
    expect(screen.queryByText('Person')).not.toBeInTheDocument();

    await act(async () => { resolveNextPage(page([staleUser])); });
    expect(screen.queryByText('Stale page')).not.toBeInTheDocument();
    expect(screen.queryByText('Person')).not.toBeInTheDocument();
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
    await act(async () => {
      await keyboard.type(search, 'Keyboard');
      await keyboard.keyboard('{Enter}');
    });

    expect(await screen.findByText('Keyboard result')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenLastCalledWith('users', { query: { q: 'Keyboard', status: '', createdAfter: '', createdBefore: '', limit: 50, cursor: null } });
  });

  it('announces page loading and keeps keyboard focus through pagination', async () => {
    const keyboard = userEvent.setup();
    const second = { ...user, id: '01900000-0000-7000-8000-000000000004', displayName: 'Second page' };
    let resolveNextPage;
    adminRequest.mockImplementation((path, options) => {
      if (path !== 'users') return Promise.resolve({ user });
      if (options.query.cursor === 'users-next') return new Promise((resolve) => { resolveNextPage = resolve; });
      return Promise.resolve(page([user], 'users-next'));
    });

    render(<Users />);
    await screen.findByText('Person');
    const loadMore = screen.getByRole('button', { name: 'Load more registered accounts' });
    loadMore.focus();
    await act(async () => { await keyboard.keyboard('{Enter}'); });

    expect(loadMore).toHaveAttribute('aria-disabled', 'true');
    expect(loadMore).toBeEnabled();
    expect(document.activeElement).toBe(loadMore);
    expect(screen.getByRole('status')).toHaveTextContent('Loading more registered accounts...');
    expect(screen.getByRole('table', { name: 'Registered accounts' })).toHaveAttribute('aria-busy', 'true');

    await act(async () => { resolveNextPage(page([second])); });
    expect(await screen.findByText('Second page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more registered accounts' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('table', { name: 'Registered accounts' }));
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
    fireEvent.click(screen.getByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(`users/${user.id}/status`, {
      method: 'POST', body: { status: 'suspended', reasonCode: 'ABUSE_PATTERN', confirmation: 'SUSPEND ACCOUNT' },
    }));
  });

  it('keeps actions disabled until fresh details for the selected account arrive', async () => {
    let resolveDetail;
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page())
      : new Promise((resolve) => { resolveDetail = resolve; }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(keeper().getByRole('status')).toHaveTextContent('Loading account details...');
    expect(keeper().getAllByText('Unknown')).toHaveLength(4);

    await act(async () => { resolveDetail({ user: { ...user, currentSessionCount: 0 } }); });
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled();
    expect(keeper().getByText('0')).toBeInTheDocument();
  });

  it('ignores older account details after a newer account is selected', async () => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second', status: 'locked', currentSessionCount: 0 };
    let resolveFirst;
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page([user, second]))
      : path === `users/${user.id}` ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve({ user: second }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
    await waitFor(() => expect(keeper().getByText('locked')).toBeInTheDocument());

    await act(async () => { resolveFirst({ user }); });
    expect(keeper().getByText(second.id)).toBeInTheDocument();
    expect(keeper().getByText('locked')).toBeInTheDocument();
    expect(keeper().getByText('0')).toBeInTheDocument();
    expect(keeper().queryByText('active')).not.toBeInTheDocument();
  });

  it('clears prepared reasons and confirmations when switching accounts', async () => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second' };
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page([user, second]))
      : Promise.resolve({ user: path === `users/${user.id}` ? user : second }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Confirm action' })).not.toBeInTheDocument();
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    expect(screen.getByPlaceholderText('SECURITY_REMEDIATION')).toHaveValue('');
    expect(screen.getByLabelText('Type SUSPEND ACCOUNT')).toHaveValue('');
    expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('shows detail failure and requires a successful retry before enabling actions', async () => {
    let detailRequests = 0;
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page())
      : ++detailRequests === 1 ? Promise.reject(new Error('private database failure')) : Promise.resolve({ user }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    expect(await keeper().findByRole('alert')).toHaveTextContent('Account details could not be loaded.');
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(screen.queryByText('private database failure')).not.toBeInTheDocument();
    fireEvent.click(keeper().getByRole('button', { name: 'Retry account details' }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    expect(keeper().queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([null, {}, { user: { ...user, id: '01900000-0000-7000-8000-000000000002' } }, { user: { ...user, status: null } }])(
    'rejects missing, mismatched or invalid account details (%j)', async (response) => {
      adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page()) : Promise.resolve(response));
      render(<Users />);
      fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
      expect(await keeper().findByRole('alert')).toHaveTextContent('Account details could not be loaded.');
      expect(keeper().getByRole('button', { name: 'Delete' })).toBeDisabled();
      expect(keeper().getAllByText('Unknown')).toHaveLength(4);
    });

  it('ignores an older detail denial after a newer account is selected', async () => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second', status: 'locked' };
    let rejectFirst;
    adminRequest.mockImplementation((path) => path === 'users' ? Promise.resolve(page([user, second]))
      : path === `users/${user.id}` ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve({ user: second }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
    await waitFor(() => expect(keeper().getByText('locked')).toBeInTheDocument());

    await act(async () => { rejectFirst(Object.assign(new Error('denied'), { status: 403 })); });
    expect(keeper().getByText(second.id)).toBeInTheDocument();
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not restore pending details after a list access denial', async () => {
    let resolveDetail;
    let listRequests = 0;
    adminRequest.mockImplementation((path) => path === 'users'
      ? ++listRequests === 1 ? Promise.resolve(page()) : denied()
      : new Promise((resolve) => { resolveDetail = resolve; }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required to view registered accounts.');
    await act(async () => { resolveDetail({ user }); });
    expect(keeper().queryByText(user.id)).not.toBeInTheDocument();
    expect(keeper().queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
  });

  it('requires both a reason and confirmation before sending a correction', async () => {
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(keeper().getByRole('status')).toHaveTextContent('A stable policy reason code is required.');
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(keeper().getByRole('status')).toHaveTextContent('Type SUSPEND ACCOUNT to confirm this action.');
    expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('keeps correction completion bound to its original account and prevents duplicate submissions', async () => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second', status: 'locked' };
    let resolveAction;
    adminRequest.mockImplementation((path, options) => path === 'users' ? Promise.resolve(page([user, second]))
      : options?.method === 'POST' ? new Promise((resolve) => { resolveAction = resolve; })
        : Promise.resolve({ user: path === `users/${user.id}` ? user : second }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
    await waitFor(() => expect(keeper().getByText('locked')).toBeInTheDocument());
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();

    await act(async () => { resolveAction({ userId: user.id, status: 'suspended' }); });
    expect(keeper().getByText(second.id)).toBeInTheDocument();
    expect(keeper().getByText('locked')).toBeInTheDocument();
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled();
    expect(keeper().queryByText('Action recorded.')).not.toBeInTheDocument();
    expect(adminRequest.mock.calls.filter(([path]) => path === `users/${user.id}`)).toHaveLength(1);
  });

  it.each([401, 403])('clears account data and confirmation after correction permission denial (%s)', async (status) => {
    adminRequest.mockImplementation((path, options) => path === 'users' ? Promise.resolve(page())
      : options?.method === 'POST' ? denied(status) : Promise.resolve({ user }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 403
      ? 'Administrator access is required to change this account.' : 'Sign in through approved admin access to change this account.');
    expect(screen.queryByText(user.id)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm action' })).not.toBeInTheDocument();
  });

  it('requires fresh review after an uncertain correction error rather than immediately resubmitting', async () => {
    let detailRequests = 0;
    adminRequest.mockImplementation((path, options) => path === 'users' ? Promise.resolve(page())
      : options?.method === 'POST' ? Promise.reject(new Error('private database failure'))
        : Promise.resolve({ user: { ...user, status: ++detailRequests === 1 ? 'active' : 'suspended' } }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(await keeper().findByRole('alert')).toHaveTextContent('Account details need to be refreshed.');
    expect(keeper().getByRole('status')).toHaveTextContent('could not be confirmed');
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(screen.queryByText('private database failure')).not.toBeInTheDocument();
    fireEvent.click(keeper().getByRole('button', { name: 'Retry account details' }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    expect(keeper().getByText('suspended')).toBeInTheDocument();
    expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });

  it('retains confirmed completion while a failed detail refresh blocks another correction', async () => {
    let detailRequests = 0;
    adminRequest.mockImplementation((path, options) => path === 'users' ? Promise.resolve(page())
      : options?.method === 'POST' ? Promise.resolve({ userId: user.id, status: 'suspended' })
        : ++detailRequests === 1 ? Promise.resolve({ user }) : Promise.reject(new Error('refresh failed')));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(await keeper().findByRole('alert')).toHaveTextContent('Account details could not be loaded.');
    expect(keeper().getByRole('status')).toHaveTextContent('Action recorded.');
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(keeper().queryByText('suspended')).not.toBeInTheDocument();
  });

  it.each(['same account', 'A to B to A'])('requires a post-correction detail read after reviewing %s during a pending success', async (selection) => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second', status: 'locked' };
    let resolveAction;
    let resolveFreshDetail;
    let writeSettled = false;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'users') return Promise.resolve(page([user, second]));
      if (options?.method === 'POST') return new Promise((resolve) => { resolveAction = resolve; });
      if (path === `users/${second.id}`) return Promise.resolve({ user: second });
      if (writeSettled) return new Promise((resolve) => { resolveFreshDetail = resolve; });
      return Promise.resolve({ user });
    });
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    if (selection === 'A to B to A') {
      fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
      await waitFor(() => expect(keeper().getByText('locked')).toBeInTheDocument());
    }
    fireEvent.click(screen.getByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByText('active')).toBeInTheDocument());
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();

    await act(async () => { writeSettled = true; resolveAction({ userId: user.id, status: 'suspended' }); });
    await waitFor(() => expect(resolveFreshDetail).toBeTypeOf('function'));
    expect(keeper().getAllByText('Unknown')).toHaveLength(4);
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    await act(async () => { resolveFreshDetail({ user: { ...user, status: 'suspended', currentSessionCount: 0 } }); });
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    expect(keeper().getByText('suspended')).toBeInTheDocument();
    expect(keeper().getByText('0')).toBeInTheDocument();
    expect(keeper().getByText('Action recorded.')).toBeInTheDocument();
    expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });

  it.each([['same account', 'before'], ['same account', 'after'], ['A to B to A', 'before'], ['A to B to A', 'after']])(
    'invalidates details when reviewing %s and receiving the pre-correction read %s an uncertain error', async (selection, detailTiming) => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second', status: 'locked' };
    let rejectAction;
    let resolvePreCorrectionDetail;
    let resolveFreshDetail;
    let detailRequests = 0;
    let writeSettled = false;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'users') return Promise.resolve(page([user, second]));
      if (options?.method === 'POST') return new Promise((_, reject) => { rejectAction = reject; });
      if (path === `users/${second.id}`) return Promise.resolve({ user: second });
      if (writeSettled) return new Promise((resolve) => { resolveFreshDetail = resolve; });
      if (++detailRequests > 1) return new Promise((resolve) => { resolvePreCorrectionDetail = resolve; });
      return Promise.resolve({ user });
    });
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    if (selection === 'A to B to A') {
      fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
      await waitFor(() => expect(keeper().getByText('locked')).toBeInTheDocument());
    }
    fireEvent.click(screen.getByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(resolvePreCorrectionDetail).toBeTypeOf('function'));
    if (detailTiming === 'before') {
      await act(async () => { resolvePreCorrectionDetail({ user }); });
      expect(keeper().getByText('active')).toBeInTheDocument();
    }

    await act(async () => { writeSettled = true; rejectAction(new Error('uncertain correction outcome')); });
    expect(await keeper().findByRole('alert')).toHaveTextContent('Account details need to be refreshed.');
    if (detailTiming === 'after') await act(async () => { resolvePreCorrectionDetail({ user }); });
    expect(keeper().getAllByText('Unknown')).toHaveLength(4);
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    fireEvent.click(keeper().getByRole('button', { name: 'Retry account details' }));
    await waitFor(() => expect(resolveFreshDetail).toBeTypeOf('function'));
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    await act(async () => { resolveFreshDetail({ user: { ...user, status: 'suspended', currentSessionCount: 0 } }); });
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    expect(keeper().getByText('suspended')).toBeInTheDocument();
    expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });

  it('leaves B details intact when an uncertain correction for A settles', async () => {
    const second = { ...user, id: '01900000-0000-7000-8000-000000000002', displayName: 'Second', status: 'locked', currentSessionCount: 0 };
    let rejectAction;
    adminRequest.mockImplementation((path, options) => path === 'users' ? Promise.resolve(page([user, second]))
      : options?.method === 'POST' ? new Promise((_, reject) => { rejectAction = reject; })
        : Promise.resolve({ user: path === `users/${user.id}` ? user : second }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    fireEvent.click(screen.getByRole('button', { name: `Review account Second (${second.id})` }));
    await waitFor(() => expect(keeper().getByText('locked')).toBeInTheDocument());

    await act(async () => { rejectAction(new Error('uncertain A outcome')); });
    expect(keeper().getByText(second.id)).toBeInTheDocument();
    expect(keeper().getByText('locked')).toBeInTheDocument();
    expect(keeper().getByText('0')).toBeInTheDocument();
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled();
    expect(keeper().queryByRole('alert')).not.toBeInTheDocument();
    expect(adminRequest.mock.calls.filter(([path]) => path === `users/${user.id}`)).toHaveLength(1);
  });

  it('does not restore a cleared account selection after a pending correction succeeds', async () => {
    let resolveAction;
    let listRequests = 0;
    adminRequest.mockImplementation((path, options) => path === 'users'
      ? ++listRequests === 1 ? Promise.resolve(page()) : denied()
      : options?.method === 'POST' ? new Promise((resolve) => { resolveAction = resolve; }) : Promise.resolve({ user }));
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required to view registered accounts.');
    await act(async () => { resolveAction({ userId: user.id, status: 'suspended' }); });
    expect(keeper().queryByText(user.id)).not.toBeInTheDocument();
    expect(keeper().queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(adminRequest.mock.calls.filter(([path]) => path === `users/${user.id}`)).toHaveLength(1);
  });

  it.each(['success', 'permission denial'])('requires fresh A details without applying an old access context after %s', async (outcome) => {
    let settleAction;
    let resolveFreshDetail;
    let listRequests = 0;
    let writeSettled = false;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'users') return ++listRequests === 2 ? denied() : Promise.resolve(page());
      if (options?.method === 'POST') return new Promise((resolve, reject) => {
        settleAction = () => outcome === 'success' ? resolve({ userId: user.id, status: 'suspended' })
          : reject(Object.assign(new Error('old access denied'), { status: 403 }));
      });
      if (writeSettled) return new Promise((resolve) => { resolveFreshDetail = resolve; });
      return Promise.resolve({ user });
    });
    render(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    fireEvent.click(keeper().getByRole('button', { name: 'Suspend' }));
    fireEvent.change(screen.getByPlaceholderText('SECURITY_REMEDIATION'), { target: { value: 'ABUSE_PATTERN' } });
    fireEvent.change(screen.getByLabelText('Type SUSPEND ACCOUNT'), { target: { value: 'SUSPEND ACCOUNT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required to view registered accounts.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: `Review account Person (${user.id})` }));
    await waitFor(() => expect(keeper().getByText('active')).toBeInTheDocument());

    await act(async () => { writeSettled = true; settleAction(); });
    if (outcome === 'permission denial') {
      expect(await keeper().findByRole('alert')).toHaveTextContent('Account details need to be refreshed.');
      fireEvent.click(keeper().getByRole('button', { name: 'Retry account details' }));
    }
    await waitFor(() => expect(resolveFreshDetail).toBeTypeOf('function'));
    expect(keeper().getByText(user.id)).toBeInTheDocument();
    expect(keeper().getAllByText('Unknown')).toHaveLength(4);
    expect(keeper().getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(keeper().queryByText('Action recorded.')).not.toBeInTheDocument();
    expect(screen.queryByText('Administrator access is required to change this account.')).not.toBeInTheDocument();
    const freshUser = { ...user, status: outcome === 'success' ? 'suspended' : 'active' };
    await act(async () => { resolveFreshDetail({ user: freshUser }); });
    await waitFor(() => expect(keeper().getByRole('button', { name: 'Suspend' })).toBeEnabled());
    expect(keeper().getByText(freshUser.status)).toBeInTheDocument();
  });
});
