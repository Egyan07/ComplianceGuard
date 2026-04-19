import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import LoginPage from './LoginPage';
import { AuthProvider } from '../contexts/AuthContext';

const theme = createTheme();

const mockPost = vi.fn();
const mockGet = vi.fn().mockRejectedValue(new Error('no token'));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mockPost,
      get: mockGet,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    post: mockPost,
    get: mockGet,
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
    mockGet.mockRejectedValue(new Error('no token'));
  });

  it('renders the sign in form by default', () => {
    renderLogin();
    expect(screen.getByText('ComplianceGuard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
  });

  it('switches to create account tab', () => {
    renderLogin();
    fireEvent.click(screen.getByText('Create Account'));
    expect(screen.getByRole('textbox', { name: /first name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /last name/i })).toBeInTheDocument();
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

  it('shows tagline text', () => {
    renderLogin();
    expect(screen.getByText('SOC 2 Type II Compliance Automation')).toBeInTheDocument();
  });
});
