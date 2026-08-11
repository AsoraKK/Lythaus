import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Appeals from './Appeals.jsx';
import { adminRequest } from '../api/adminApi.js';

vi.mock('../api/adminApi.js', () => ({
  adminRequest: vi.fn(),
}));

describe('Appeals page', () => {
  beforeEach(() => {
    adminRequest.mockReset();
  });

  it('records an immutable trained adjudication through the canonical route', async () => {
    let listCalls = 0;
    adminRequest.mockImplementation((path) => {
      if (path === 'appeals/pending-adjudication') {
        listCalls += 1;
        return Promise.resolve({
          items: listCalls === 1 ? [{
            appeal_id: 'appeal-123',
            case_id: 'case-123',
            risk_class: 'standard',
            policy_version: 'appeals-v1.0.0',
            created_at: '2026-08-10T00:00:00Z',
            completed_reviewers: 5,
            total_weight: 5,
            winning_share: 0.8,
            reviewer_panel_decision: 'uphold',
            required_adjudicators: 1,
            completed_adjudicators: 0,
          }] : [],
        });
      }
      if (path === 'appeals/appeal-123/adjudications') {
        return Promise.resolve({ status: 'resolved', finalDecision: 'uphold' });
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    await act(async () => {
      render(<Appeals />);
    });

    const adjudicateButton = await screen.findByRole('button', { name: 'Adjudicate' });
    await act(async () => {
      await user.click(adjudicateButton);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Record adjudication' }));
    });

    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith(
        'appeals/appeal-123/adjudications',
        expect.objectContaining({
          method: 'POST',
          body: {
            decision: 'uphold',
            reasonCode: 'APPEAL.PANEL_CONFIRMED',
          },
        })
      )
    );
    expect(screen.getByText('There is no moderator override or time-based auto-resolution path.')).toBeInTheDocument();
    expect(adminRequest).not.toHaveBeenCalledWith(expect.stringContaining('_admin'), expect.anything());
  });
});
