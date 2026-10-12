import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityPilotSummary from './ActivityPilotSummary.jsx';
import { adminRequest } from '../api/adminApi.js';
import { pilotSnapshot } from './activity-pilot.fixtures.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });
const deferred = () => {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
};
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
  it('invalidates delayed replies across disable and re-enable', async () => {
    const oldReply = deferred(), currentReply = deferred();
    adminRequest.mockReturnValueOnce(oldReply.promise).mockReturnValueOnce(currentReply.promise);
    const view = render(<ActivityPilotSummary enabled />);
    expect(adminRequest).toHaveBeenCalledTimes(1);
    view.rerender(<ActivityPilotSummary enabled={false} />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    view.rerender(<ActivityPilotSummary enabled />);
    await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(2));
    const obsolete = pilotSnapshot(); obsolete.metrics.mau.value = 49;
    await act(async () => { oldReply.resolve(obsolete); await oldReply.promise; });
    expect(screen.queryByText('49', { selector: 'strong' })).not.toBeInTheDocument();
    await act(async () => { currentReply.resolve(pilotSnapshot(new Date().toISOString())); await currentReply.promise; });
    await waitFor(() => expect(screen.getByText('3', { selector: 'strong' })).toBeVisible());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('does not apply a delayed reply after unmount', async () => {
    const reply = deferred(); adminRequest.mockReturnValueOnce(reply.promise);
    const view = render(<ActivityPilotSummary enabled />);
    view.unmount();
    await act(async () => { reply.resolve(pilotSnapshot()); await reply.promise; });
    expect(view.container).toBeEmptyDOMElement();
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });
  it('expires a fresh count at the next UTC day boundary', async () => {
    vi.useFakeTimers();
    const sampledAt = Date.parse('2026-10-07T23:59:30.000Z');
    vi.setSystemTime(sampledAt);
    adminRequest.mockResolvedValue(pilotSnapshot(new Date(sampledAt).toISOString()));
    render(<ActivityPilotSummary enabled />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('3', { selector: 'strong' })).toBeVisible();
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });
  it.each(['visibilitychange', 'pageshow'])('rechecks freshness on %s after background suspension', async eventName => {
    vi.useFakeTimers();
    const sampledAt = Date.parse('2026-10-07T12:00:00.000Z');
    vi.setSystemTime(sampledAt + 1000);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    adminRequest.mockResolvedValue(pilotSnapshot(new Date(sampledAt).toISOString()));
    render(<ActivityPilotSummary enabled />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('3', { selector: 'strong' })).toBeVisible();
    visibility.mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    vi.setSystemTime(sampledAt + 60000);
    visibility.mockReturnValue('visible');
    await act(async () => {
      const target = eventName === 'pageshow' ? window : document;
      target.dispatchEvent(new Event(eventName));
    });
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });
  it('shows malformed-source failure and retries with a valid snapshot', async () => {
    const malformed = pilotSnapshot(new Date().toISOString()); malformed.contractVersion = 'unexpected';
    adminRequest.mockResolvedValueOnce(malformed).mockResolvedValueOnce(pilotSnapshot(new Date().toISOString()));
    render(<ActivityPilotSummary enabled />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pilot source is unavailable.'));
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh pilot' }));
    await waitFor(() => expect(screen.getByText('3', { selector: 'strong' })).toBeVisible());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });
});
