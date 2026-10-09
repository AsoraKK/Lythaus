import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityPilotSummary from './ActivityPilotSummary.jsx';
import { adminRequest } from '../api/adminApi.js';
import { pilotSnapshot } from './activity-pilot.fixtures.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
describe('account activity pilot summary', () => {
  it('default-disabled component makes no request and has no pretend counts', () => {
    render(<ActivityPilotSummary />);
    expect(adminRequest).not.toHaveBeenCalled();
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
  });
  it('uses existing admin request and keeps separate population definitions', async () => {
    adminRequest.mockResolvedValue(pilotSnapshot(new Date().toISOString()));
    render(<ActivityPilotSummary enabled />);
    await waitFor(() => expect(screen.getByText('3', { selector: 'strong' })).toBeVisible());
    expect(adminRequest).toHaveBeenCalledWith('activity-measurement');
    expect(screen.getByText(/Public contributors use a separate source/)).toBeInTheDocument();
  });
  it('owner revocation clears the previous count before and after refresh failure', async () => {
    adminRequest.mockResolvedValueOnce(pilotSnapshot(new Date().toISOString())).mockRejectedValueOnce({ status: 403 });
    render(<ActivityPilotSummary enabled />);
    await waitFor(() => expect(screen.getByText('3', { selector: 'strong' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh pilot' }));
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Current owner access'));
  });
  it('expires counts without an automatic request', async () => {
    vi.useFakeTimers();
    const source = pilotSnapshot(new Date().toISOString()); adminRequest.mockResolvedValue(source);
    render(<ActivityPilotSummary enabled />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('3', { selector: 'strong' })).toBeVisible();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });
});
