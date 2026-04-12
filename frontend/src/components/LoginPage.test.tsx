import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import LoginPage from './LoginPage';
import { AuthProvider } from '../contexts/AuthContext';

const theme = createTheme();

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn().mockRejectedValue(new Error('no token')),
  },
}));

const renderLogin = () =>
  render(
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </ThemeProvider>
  );

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the sign in form by default', () => {
    renderLogin();
    expect(screen.getByText('ComplianceGuard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email *')).toBeInTheDocument();
    expect(screen.getByLabelText('Password *')).toBeInTheDocument();
  });

  it('switches to create account tab', () => {
    renderLogin();
    fireEvent.click(screen.getByText('Create Account'));
    expect(screen.getByLabelText('First Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Last Name *')).toBeInTheDocument();
  });

  it('shows sign in button on login tab', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows create account button on register tab', () => {
    renderLogin();
    fireEvent.click(screen.getByText('Create Account'));
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    const axios = await import('axios');
    (axios.default.post as any).mockRejectedValueOnce({
      response: { data: { detail: 'Incorrect email or password' } },
    });

    renderLogin();
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'bad@test.com' } });
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect email or password')).toBeInTheDocument();
    });
  });

  it('shows tagline text', () => {
    renderLogin();
    expect(screen.getByText('SOC 2 Type II Compliance Automation')).toBeInTheDocument();
  });
});
