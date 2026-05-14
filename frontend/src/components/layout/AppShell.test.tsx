import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './AppShell';

vi.mock('../../hooks/useColorMode', () => ({
  useColorMode: () => ({ mode: 'light', toggle: vi.fn() }),
}));
vi.mock('../../contexts/LicenseContext', () => ({
  useLicense: () => ({ tier: 'free' }),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn(), loading: false }),
}));
vi.mock('../../constants', () => ({ VERSION: '3.1.0' }));

describe('AppShell', () => {
  it('renders children', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>main content</div>
        </AppShell>
      </MemoryRouter>
    );
    expect(screen.getByText('main content')).toBeInTheDocument();
  });

  it('renders the topbar logo', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>content</div>
        </AppShell>
      </MemoryRouter>
    );
    expect(screen.getByText('CG')).toBeInTheDocument();
  });

  it('renders in dark mode without crashing', () => {
    localStorage.setItem('cg-color-mode', 'dark');
    render(
      <MemoryRouter>
        <AppShell>
          <div>dark content</div>
        </AppShell>
      </MemoryRouter>
    );
    expect(screen.getByText('dark content')).toBeInTheDocument();
    localStorage.clear();
  });
});
