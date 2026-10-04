import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlPanelRoutes } from './App.jsx';
import Nav from './components/Nav.jsx';

describe('support feedback owner routing', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does not advertise or resolve the support page by default', () => {
    vi.stubEnv('VITE_SUPPORT_FEEDBACK_ENABLED', '');
    render(<MemoryRouter><Nav /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Support' })).not.toBeInTheDocument();
    render(<MemoryRouter initialEntries={['/support']}><ControlPanelRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
