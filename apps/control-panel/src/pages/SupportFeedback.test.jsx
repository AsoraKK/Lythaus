import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ControlPanelRoutes } from '../App.jsx';
import Nav from '../components/Nav.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({ adminRequest: vi.fn() }));

const options = {
  version: 'synthetic_support_v1',
  contract: {
    categories: { problem: ['display'], suggestion: ['navigation'] },
    states: { problem: ['submitted', 'investigating', 'resolved'], suggestion: ['submitted', 'accepted'] },
    limits: { titleBytes: 64, detailBytes: 128, stepsBytes: 64, contextBytes: 48, memberMessageBytes: 80 },
  },
  initial: { problem: 'submitted', suggestion: 'submitted' },
  transitions: [{ kind: 'problem', from: 'submitted', to: 'resolved', terminal: true, reasons: ['verified', 'verified_after_retest'], evidenceTypes: ['verification', 'member_confirmation'] }],
  evidenceTypes: ['verification', 'member_confirmation', 'usefulness'],
  limits: { page: 3, messages: 3, privateItems: 3, messageBytes: 64, noteBytes: 48, evidenceBytes: 72, referenceBytes: 30 },
};

const request = {
  id: '018f0000-0000-7000-8000-000000000003', kind: 'problem', category: 'display', title: 'Synthetic layout issue',
  state: 'submitted', revision: 4, createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T11:00:00Z',
  submitterId: '018f0000-0000-7000-8000-000000000004', memberMessage: null,
  actual: 'Synthetic overlap.', expected: 'Synthetic clean layout.', reproductionSteps: null,
};

const detail = {
  request,
  messages: [{ id: 'message-1', from: 'member', text: 'Synthetic report text.', revision: 2, createdAt: request.createdAt }],
  private: {
    notes: [{ id: 'note-1', text: 'Synthetic owner note.', revision: 3, createdAt: request.updatedAt }],
    evidence: [
      { id: 'evidence-1', type: 'verification', description: 'Synthetic test confirms fix.', reference: null, revision: 4, createdAt: request.updatedAt },
      { id: 'evidence-2', type: 'member_confirmation', description: 'Synthetic test confirms member confirmation.', reference: null, revision: 4, createdAt: request.updatedAt },
    ],
    decisions: [],
  },
};

function renderRoutes(path = '/support') {
  return render(<MemoryRouter initialEntries={[path]}><Nav /><ControlPanelRoutes /></MemoryRouter>);
}

describe('Support feedback control-panel route', () => {
  beforeEach(() => adminRequest.mockReset());

  it('opens the owner queues from navigation and keeps problem and suggestion histories separate', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'support/options') return Promise.resolve(options);
      if (path === 'support/problems') return Promise.resolve({ items: [request], nextCursor: null });
      if (path === 'support/suggestions') return Promise.resolve({ items: [], nextCursor: null });
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes('/');
    await user.click(await screen.findByRole('link', { name: 'Support' }));
    expect(await screen.findByRole('heading', { name: 'Problem reports' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Synthetic layout issue/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suggestions' }));
    expect(await screen.findByText('No suggestions in this queue.')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('support/suggestions', { query: { limit: 3, cursor: null } });
  });

  it('loads private detail and sends an audited, idempotent owner reply', async () => {
    let detailLoads = 0;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'support/options') return Promise.resolve(optionsFixture());
      if (path === 'support/problems') return Promise.resolve({ items: [request], nextCursor: null });
      if (path === `support/problems/${request.id}`) { detailLoads += 1; return Promise.resolve(detail); }
      if (path === `support/problems/${request.id}/messages`) return Promise.resolve({ request, recordId: 'message-2', replayed: false });
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes();
    await user.click(await screen.findByRole('button', { name: /Synthetic layout issue/ }));
    expect(await screen.findByText('Synthetic owner note.')).toBeInTheDocument();
    expect(screen.getByText(/Synthetic test confirms fix\./)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reply to member'), 'Synthetic owner response.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(
      `support/problems/${request.id}/messages`,
      expect.objectContaining({
        method: 'POST',
        body: { expectedRevision: 4, message: 'Synthetic owner response.' },
        headers: { 'Idempotency-Key': expect.stringMatching(/^support-/) },
      }),
    ));
    await waitFor(() => expect(detailLoads).toBeGreaterThan(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Reply saved.');
  });

  it('does not render synthetic queue data when the support runtime is unavailable', async () => {
    adminRequest.mockImplementation((path) => path === 'support/options'
      ? Promise.resolve(optionsFixture())
      : Promise.resolve({ items: 'invalid response' }));
    renderRoutes();
    expect(await screen.findByRole('alert')).toHaveTextContent('Support requests are currently unavailable.');
    expect(screen.queryByText('No problem reports in this queue.')).not.toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });

  it('uses configured limits and requires evidence for each type before saving the chosen reason', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'support/options') return Promise.resolve(optionsFixture());
      if (path === 'support/problems') return Promise.resolve({ items: [request], nextCursor: null });
      if (path === `support/problems/${request.id}`) return Promise.resolve(detail);
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes();
    await user.click(await screen.findByRole('button', { name: /Synthetic layout issue/ }));

    expect(screen.getByLabelText('Reply to member')).toHaveAttribute('maxLength', '64');
    expect(screen.getByLabelText('Internal note')).toHaveAttribute('maxLength', '48');
    expect(screen.getByLabelText('Evidence description')).toHaveAttribute('maxLength', '72');
    expect(screen.getByLabelText('Evidence reference (optional)')).toHaveAttribute('maxLength', '30');
    const decisionButton = screen.getByRole('button', { name: 'Save decision' });
    expect(decisionButton).toBeDisabled();
    const alternateReason = screen.getByRole('option', { name: 'resolved · verified after retest' }).value;
    await user.selectOptions(screen.getByLabelText('Allowed next step'), alternateReason);
    await user.type(screen.getByLabelText('Message shown to the member'), 'The fix was verified.');
    await user.click(screen.getByRole('checkbox', { name: /verification · Synthetic test confirms fix/ }));
    expect(decisionButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /member confirmation · Synthetic test confirms member confirmation/ }));
    expect(decisionButton).toBeEnabled();
    await user.click(decisionButton);

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(
      `support/problems/${request.id}/decision`,
      expect.objectContaining({
        method: 'POST',
        body: {
          expectedRevision: 4,
          state: 'resolved',
          reason: 'verified_after_retest',
          memberMessage: 'The fix was verified.',
          evidenceIds: ['evidence-1', 'evidence-2'],
        },
      }),
    ));
  });

  it('invalidates a pending detail response when switching queues', async () => {
    let releaseDetail;
    const pendingDetail = new Promise(resolve => { releaseDetail = resolve; });
    adminRequest.mockImplementation((path) => {
      if (path === 'support/options') return Promise.resolve(optionsFixture());
      if (path === 'support/problems') return Promise.resolve({ items: [request], nextCursor: null });
      if (path === 'support/suggestions') return Promise.resolve({ items: [], nextCursor: null });
      if (path === `support/problems/${request.id}`) return pendingDetail;
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes();
    await user.click(await screen.findByRole('button', { name: /Synthetic layout issue/ }));
    await user.click(screen.getByRole('button', { name: 'Suggestions' }));
    expect(await screen.findByText('No suggestions in this queue.')).toBeInTheDocument();
    releaseDetail(detail);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Synthetic layout issue' })).not.toBeInTheDocument());
    expect(screen.queryByText('Synthetic owner note.')).not.toBeInTheDocument();
  });

  it('blocks a UTF-8 over-limit owner reply before sending', async () => {
    adminRequest.mockImplementation((path) => {
      if (path === 'support/options') return Promise.resolve(optionsFixture());
      if (path === 'support/problems') return Promise.resolve({ items: [request], nextCursor: null });
      if (path === `support/problems/${request.id}`) return Promise.resolve(detail);
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes();
    await user.click(await screen.findByRole('button', { name: /Synthetic layout issue/ }));
    await user.type(screen.getByLabelText('Reply to member'), '漢'.repeat(22));
    expect(screen.getByText('66 / 64 UTF-8 bytes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    expect(adminRequest).not.toHaveBeenCalledWith(expect.stringMatching(/\/messages$/), expect.objectContaining({ method: 'POST' }));
  });

  it('keeps a newer selection when an earlier mutation finishes', async () => {
    const newerRequest = { ...request, id: '018f0000-0000-7000-8000-000000000005', title: 'Synthetic newer selection' };
    const newerDetail = { ...detail, request: newerRequest };
    let completeMutation;
    adminRequest.mockImplementation((path, options) => {
      if (path === 'support/options') return Promise.resolve(optionsFixture());
      if (path === 'support/problems') return Promise.resolve({ items: [request, newerRequest], nextCursor: null });
      if (path === `support/problems/${request.id}`) return Promise.resolve(detail);
      if (path === `support/problems/${newerRequest.id}`) return Promise.resolve(newerDetail);
      if (path === `support/problems/${request.id}/messages` && options?.method === 'POST') {
        return new Promise(resolve => { completeMutation = resolve; });
      }
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes();
    await user.click(await screen.findByRole('button', { name: /Synthetic layout issue/ }));
    await screen.findByText('Synthetic owner note.');
    await user.type(screen.getByLabelText('Reply to member'), 'A bounded synthetic reply.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await user.click(screen.getByRole('button', { name: /Synthetic newer selection/ }));
    expect(await screen.findByRole('heading', { name: 'Synthetic newer selection' })).toBeInTheDocument();
    completeMutation({ request, recordId: 'message-2', replayed: false });
    await screen.findByRole('status');
    expect(await screen.findByRole('heading', { name: 'Synthetic newer selection' })).toBeInTheDocument();
  });

  it('keeps the queue switcher locked until post-mutation detail and queue refreshes finish', async () => {
    let detailLoads = 0;
    let releaseRefresh;
    const pendingRefresh = new Promise(resolve => { releaseRefresh = resolve; });
    adminRequest.mockImplementation((path, requestOptions) => {
      if (path === 'support/options') return Promise.resolve(optionsFixture());
      if (path === 'support/problems') return Promise.resolve({ items: [request], nextCursor: null });
      if (path === 'support/suggestions') return Promise.resolve({ items: [], nextCursor: null });
      if (path === `support/problems/${request.id}`) {
        detailLoads += 1;
        return detailLoads === 1 ? Promise.resolve(detail) : pendingRefresh;
      }
      if (path === `support/problems/${request.id}/messages` && requestOptions?.method === 'POST') return Promise.resolve({ request, replayed: false });
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    renderRoutes();
    await user.click(await screen.findByRole('button', { name: /Synthetic layout issue/ }));
    await screen.findByText('Synthetic owner note.');
    await user.type(screen.getByLabelText('Reply to member'), 'Synthetic refresh guard.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(detailLoads).toBe(2));
    const suggestions = screen.getByRole('button', { name: 'Suggestions' });
    expect(suggestions).toBeDisabled();
    releaseRefresh(detail);
    await waitFor(() => expect(suggestions).toBeEnabled());
    await user.click(suggestions);
    expect(await screen.findByText('No suggestions in this queue.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Synthetic layout issue/ })).not.toBeInTheDocument();
  });
});

function optionsFixture() { return options; }
