import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import Settings from './Settings';

const theme = createTheme();

const renderWithTheme = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Settings', () => {
  it('renders the settings page title', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows about section', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('About ComplianceGuard')).toBeInTheDocument();
  });

  it('shows version info', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('2.9.0')).toBeInTheDocument();
  });

  it('shows database section', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Database Engine')).toBeInTheDocument();
    expect(screen.getByText('SQLite 3 (local file)')).toBeInTheDocument();
  });

  it('shows compliance frameworks section', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Compliance Frameworks')).toBeInTheDocument();
    expect(screen.getByText('SOC 2 Type II')).toBeInTheDocument();
    expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    expect(screen.getByText('HIPAA')).toBeInTheDocument();
    expect(screen.getByText('PCI DSS')).toBeInTheDocument();
  });

  it('shows SOC 2 as active framework', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows display section with dark mode toggle', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
  });

  it('detects web mode when electronAPI is not present', () => {
    renderWithTheme(<Settings />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Web Browser')).toBeInTheDocument();
  });
});
