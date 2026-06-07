import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../theme';
import Topbar from './Topbar';
import { useLicense } from '../../contexts/LicenseContext';

vi.mock('../../contexts/LicenseContext', () => ({
  useLicense: vi.fn(),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn(), loading: false }),
}));
vi.mock('../../constants', () => ({ VERSION: '3.1.0' }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
);

describe('Topbar', () => {
  beforeEach(() => {
    (useLicense as ReturnType<typeof vi.fn>).mockReturnValue({ tier: 'free' });
  });

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

  it('renders ENTERPRISE tier chip for enterprise tier', () => {
    (useLicense as ReturnType<typeof vi.fn>).mockReturnValue({ tier: 'enterprise' });
    render(<Topbar mode="light" onToggleMode={vi.fn()} />, { wrapper });
    expect(screen.getByText('ENTERPRISE')).toBeInTheDocument();
  });

  it('calls onToggleMode when dark mode button is clicked', () => {
    const onToggle = vi.fn();
    render(<Topbar mode="light" onToggleMode={onToggle} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /dark mode/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
