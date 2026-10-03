import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));
const now = '2026-10-02T12:00:00.000Z';
const metric = (value, previous = null, unit = 'count') => ({ value, previous, changePercent: previous > 0 ? (value - previous) / previous * 100 : null,
  availability: value === null ? 'unavailable' : 'available', reason: value === null ? 'empty_or_unavailable_post_cohort' : null,
  source: 'Synthetic test source', definition: 'Synthetic test population definition', unit });
function community(period = 'today', overrides = {}) {
  return { contractVersion: 'overview-v1', timezone: 'UTC', sampledAt: now, period, cacheTtlSeconds: 60, rowLimit: 5000,
    current: { start: period === 'today' ? '2026-10-02T00:00:00.000Z' : period === 'mtd' ? '2026-10-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z', end: now }, previous: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-01T12:00:00.000Z' },
    comparable: true, coverage: 'retained_current_state',
    metrics: { posts: metric(2, 1), comments: metric(4, 0), commentsPerPost: metric(1.5, 0, 'ratio'), unansweredPosts: metric(1, 1),
      uniqueContributors: metric(3, 2), newRegistrations: metric(3, 1), subscriptionsFree: metric(2), subscriptionsPremium: metric(1), subscriptionsBlack: metric(1) },
    providers: { cloudflare: { enabled: false, status: 'unavailable', reason: 'Verified Cloudflare runtime binding required.' },
      planetscale: { enabled: false, status: 'unavailable', reason: 'Verified PlanetScale runtime binding required.' } },
    gaps: { retentionRate: 'No complete app activity cohort.' }, ...overrides };
}
function sources(path, options) {
  if (path === 'health') return { status: 'ok', database: { database_time: now } };
  if (path === 'auth/summary') return { accounts: { verified: 2, pendingVerification: 1, active: 3 }, waitlist: { totalWaiting: 4 } };
  if (path === 'email-health') return { status: 'ok', acceptedLast24Hours: 0, deliveredLast24Hours: 0, failuresLast24Hours: 0 };
  if (path === 'moderation/cases') return { items: [{ state: 'open' }] };
  if (path === 'appeals/pending-adjudication') return { items: [{ appeal_id: 'synthetic-appeal' }] };
  if (path === 'audit') return { items: [{ id: 'synthetic-audit' }] };
  if (path === 'overview') return community(options.query.period);
  throw new Error('Unexpected test route');
}
const show = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);
const card = label => screen.getByRole('heading', { name: label, level: 3 }).closest('article');
const value = label => card(label).querySelector('strong').textContent;
const operational = label => screen.getByText(label, { selector: 'span' }).nextSibling.textContent;

describe('Overview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now));
    adminRequest.mockReset(); adminRequest.mockImplementation((path, options) => Promise.resolve(sources(path, options)));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('loads canonical Worker sources with explicit UTC period and loaded-page labels', async () => {
    show();
    await waitFor(() => expect(value('Posts')).toBe('2'));
    expect(operational('Open moderation cases in loaded page')).toBe('1');
    expect(operational('Accounts with active status')).toBe('3');
    expect(value('Comments per new post')).toBe('1.5');
    expect(adminRequest).toHaveBeenCalledTimes(7);
    expect(adminRequest).toHaveBeenCalledWith('overview', { query: { period: 'today' } });
    expect(adminRequest).not.toHaveBeenCalledWith(expect.stringContaining('_admin'), expect.anything());
    expect(within(card('Posts')).getByText('Prior elapsed period: 1')).toBeInTheDocument();
    expect(within(card('Posts')).getByText('Change: 100.0%')).toBeInTheDocument();
    expect(within(card('Comments')).queryByText(/Change:/)).not.toBeInTheDocument();
    fireEvent.click(within(card('Posts')).getByText('Definition and source'));
    expect(within(card('Posts')).getByText('Synthetic test population definition')).toBeVisible();
  });

  it('distinguishes known zero, empty cohorts, missing fields and failed sources', async () => {
    adminRequest.mockImplementation((path, options) => {
      if (path === 'overview') return Promise.resolve(community('today', { metrics: { posts: metric(0, 0), commentsPerPost: metric(null, null, 'ratio') } }));
      if (path === 'audit') return Promise.reject(new Error('Synthetic unavailable source'));
      if (path === 'moderation/cases') return Promise.resolve({});
      if (path === 'appeals/pending-adjudication') return Promise.resolve({ items: [] });
      if (path === 'auth/summary') return Promise.resolve({});
      return Promise.resolve(sources(path, options));
    });
    show(); await waitFor(() => expect(value('Posts')).toBe('0'));
    expect(value('Comments')).toBe('Unavailable');
    expect(value('Comments per new post')).toBe('Unavailable');
    expect(operational('Pending adjudications in loaded page')).toBe('0');
    expect(operational('Open moderation cases in loaded page')).toBe('Unavailable');
    expect(operational('Recent audit entries in loaded page')).toBe('Unavailable');
    expect(operational('Verified accounts')).toBe('Unavailable');
    expect(operational('Email accepted, rows created last 24 hours')).toBe('0');
    expect(screen.getByRole('alert')).toHaveTextContent('Some operational sources are unavailable');
  });

  it('keeps current entitlements and provider gaps separate from payment and user activity claims', async () => {
    show(); await waitFor(() => expect(value('Free')).toBe('2'));
    expect(value('Cloudflare')).toBe('Unavailable'); expect(value('PlanetScale')).toBe('Unavailable');
    expect(screen.getByText('Verified Cloudflare runtime binding required.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tracking gaps and unavailable metrics'));
    expect(screen.getByText('No complete app activity cohort.')).toBeVisible();
    expect(screen.getByText(/Free, Premium and Black are current account entitlements/)).toBeInTheDocument();
    expect(screen.queryByText('0% retention')).not.toBeInTheDocument();
  });

  it.each([
    { sampledAt: '2026-10-02T11:58:00.000Z' },
    { sampledAt: '2026-10-02T12:01:00.000Z' },
    { cacheTtlSeconds: 600 },
  ])('withholds stale, future-clock or incompatible freshness samples: %j', async overrides => {
    adminRequest.mockImplementation((path, options) => Promise.resolve(path === 'overview' ? community('today', overrides) : sources(path, options)));
    show(); await waitFor(() => expect(operational('Admin API')).toBe('ok'));
    expect(value('Posts')).toBe('Unavailable'); expect(value('Premium')).toBe('Unavailable');
  });

  it('expires samples without polling or keeping old values on screen', async () => {
    vi.useFakeTimers();
    show(); await act(async () => {});
    expect(value('Posts')).toBe('2');
    await act(async () => { vi.advanceTimersByTime(65001); });
    expect(value('Posts')).toBe('Unavailable');
    expect(operational('Open moderation cases in loaded page')).toBe('Unavailable');
    expect(adminRequest).toHaveBeenCalledTimes(7);
  });

  it('selects month/year windows and suppresses unequal elapsed comparisons', async () => {
    adminRequest.mockImplementation((path, options) => Promise.resolve(path === 'overview'
      ? community(options.query.period, { comparable: options.query.period !== 'ytd' }) : sources(path, options)));
    show(); await waitFor(() => expect(value('Posts')).toBe('2'));
    const select = screen.getByLabelText('Reporting period (UTC)');
    fireEvent.change(select, { target: { value: 'mtd' } });
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('overview', { query: { period: 'mtd' } }));
    await waitFor(() => expect(value('Posts')).toBe('2'));
    fireEvent.change(select, { target: { value: 'ytd' } });
    await waitFor(() => expect(within(card('Posts')).getByText('No comparable prior value')).toBeInTheDocument());
    expect(within(card('Posts')).queryByText(/Change:/)).not.toBeInTheDocument();
  });

  it('does not renew operational freshness while waiting for a slow source', async () => {
    vi.useFakeTimers();
    let resolveAudit;
    adminRequest.mockImplementation((path, options) => path === 'audit' ? new Promise(resolve => { resolveAudit = resolve; }) : Promise.resolve(sources(path, options)));
    show(); await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(61000); resolveAudit({ items: [] }); });
    expect(operational('Verified accounts')).toBe('Unavailable');
    expect(screen.getByText(/Source requests started/)).toHaveTextContent('Stale or unavailable');
    expect(adminRequest).toHaveBeenCalledTimes(7);
  });

  it('withholds operational values after a backward clock change during requests', async () => {
    let resolveAudit;
    adminRequest.mockImplementation((path, options) => path === 'audit' ? new Promise(resolve => { resolveAudit = resolve; }) : Promise.resolve(sources(path, options)));
    show();
    await act(async () => { vi.setSystemTime(new Date(Date.parse(now) - 1000)); resolveAudit({ items: [] }); });
    expect(operational('Verified accounts')).toBe('Unavailable');
  });

  it.each([
    ['today', '2026-10-02T23:59:59.000Z', '2026-10-02T00:00:00.000Z'],
    ['mtd', '2026-10-31T23:59:59.000Z', '2026-10-01T00:00:00.000Z'],
    ['ytd', '2026-12-31T23:59:59.000Z', '2026-01-01T00:00:00.000Z'],
  ])('expires %s metrics at the UTC reporting boundary without polling', async (period, sampledAt, start) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(sampledAt));
    adminRequest.mockImplementation((path, options) => Promise.resolve(path === 'overview'
      ? community(options.query.period, { sampledAt, current: { start, end: sampledAt } }) : sources(path, options)));
    show(); await act(async () => {});
    if (period !== 'today') await act(async () => { fireEvent.change(screen.getByLabelText('Reporting period (UTC)'), { target: { value: period } }); });
    expect(value('Posts')).toBe('2');
    const calls = adminRequest.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(1001); });
    expect(value('Posts')).toBe('Unavailable');
    expect(adminRequest).toHaveBeenCalledTimes(calls);
  });

  it('discards a late earlier-period response', async () => {
    let resolveToday;
    adminRequest.mockImplementation((path, options) => path === 'overview' && options.query.period === 'today'
      ? new Promise(resolve => { resolveToday = resolve; }) : Promise.resolve(path === 'overview' ? community(options.query.period, { metrics: { posts: metric(8) } }) : sources(path, options)));
    show(); fireEvent.change(screen.getByLabelText('Reporting period (UTC)'), { target: { value: 'mtd' } });
    await waitFor(() => expect(value('Posts')).toBe('8'));
    await act(async () => { resolveToday(community()); });
    expect(value('Posts')).toBe('8');
  });

  it('shows owner denial without fabricating community totals', async () => {
    adminRequest.mockImplementation((path, options) => path === 'overview' ? Promise.reject({ status: 403 }) : Promise.resolve(sources(path, options)));
    show(); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Current active owner access'));
    expect(value('Posts')).toBe('Unavailable'); await waitFor(() => expect(operational('Admin API')).toBe('ok'));
  });

  it('clears the displayed snapshot after access expires during refresh', async () => {
    show(); await waitFor(() => expect(value('Posts')).toBe('2'));
    adminRequest.mockImplementation(() => Promise.reject({ status: 401 }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Administrator access must be checked again'));
    expect(value('Posts')).toBe('Unavailable'); expect(operational('Accounts with active status')).toBe('Unavailable');
  });

  it('rejects incompatible version or period data instead of relabeling it', async () => {
    adminRequest.mockImplementation((path, options) => Promise.resolve(path === 'overview' ? community('ytd', { contractVersion: 'wrong' }) : sources(path, options)));
    show(); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Community metrics are unavailable'));
    expect(value('Posts')).toBe('Unavailable');
  });
});
