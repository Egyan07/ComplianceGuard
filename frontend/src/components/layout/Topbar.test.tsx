import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../theme';
import Topbar from './Topbar';

vi.mock('../../contexts/LicenseContext', () => ({
  useLicense: () => ({ tier: 'free' }),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn(), loading: false }),
}));
vi.mock('../../constants', () => ({ VERSION: '3.1.0' }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
);

describe('Topbar', () => {
  it('renders the ComplianceGuard wordmark', () => {
    render(<Topbar mode="light" onToggleMode={vi.fn()} />, { wrapper });
    expect(screen.getByText('ComplianceGuard')).toBeInTheDocument();
  });

  it('renders the CG logo mark', () => {
    render(<Topbar mode="light" onToggleMode={vi.fn()} />, { wrapper });
    expect(screen.getByText('CG')).toBeInTheDocument();
  });

  it('renders FREE tier chip', () => {
    render(<Topbar mode="light" onToggleMode={vi.fn()} />, { wrapper });
    expect(screen.getByText('FREE')).toBeInTheDocument();
  });

  it('calls onToggleMode when dark mode button is clicked', () => {
    const onToggle = vi.fn();
    render(<Topbar mode="light" onToggleMode={onToggle} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /dark mode/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
