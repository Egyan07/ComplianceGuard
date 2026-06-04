import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import Settings from './Settings';
import { useLicense } from '../contexts/LicenseContext';

vi.mock('../contexts/LicenseContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/LicenseContext')>();
  return {
    ...actual,
    useLicense: vi.fn(() => ({
      tier: 'free',
      licenseInfo: { licenseId: null, email: null, maxMachines: null, expiresAt: null, daysRemaining: null, isExpired: false, isGracePeriod: false },
      loading: false,
      isFeatureAllowed: () => false,
      activateLicense: vi.fn(),
      deactivateLicense: vi.fn(),
    })),
  };
});

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
    expect(screen.getByText('3.3.0')).toBeInTheDocument();
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
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(3);
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

  describe('Automatic Collection section (Electron mode)', () => {
    beforeEach(() => {
      (window as any).electronAPI = {
        getAppVersion: vi.fn().mockResolvedValue('3.3.0'),
        getSystemInfo: vi.fn().mockResolvedValue({ platform: 'win32', arch: 'x64', version: 'v20', electronVersion: '28' }),
        getUserSetting: vi.fn().mockResolvedValue('false'),
        cloudGetConfig: vi.fn().mockResolvedValue({ connected: false, serverUrl: null, email: null }),
        getSchedule: vi.fn().mockResolvedValue({
          config: { enabled: false, frequency: 'daily', time: '09:00' },
          last_run_at: null,
          next_run_at: null,
          last_result: null,
        }),
        setSchedule: vi.fn().mockResolvedValue({ config: { enabled: true, frequency: 'daily', time: '09:00' }, next_run_at: '2026-05-07T09:00:00.000Z' }),
        runCollectionNow: vi.fn().mockResolvedValue({ success: true, evidence_count: 42, ran_at: new Date().toISOString() }),
      };
    });

    afterEach(() => {
      (window as any).electronAPI = undefined;
    });

    it('renders Automatic Collection section in Electron mode', async () => {
      renderWithTheme(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Automatic Collection')).toBeInTheDocument();
      });
    });

    it('shows Never for last run when no prior run', async () => {
      renderWithTheme(<Settings />);
      await waitFor(() => {
        expect(screen.getByText(/Never/)).toBeInTheDocument();
      });
    });

    it('calls setSchedule when enable toggle is clicked', async () => {
      renderWithTheme(<Settings />);
      // Wait for schedule to load (toggle becomes enabled)
      await waitFor(() => {
        const toggle = screen.getByRole('switch', { name: /enable automatic collection/i });
        expect(toggle).not.toBeDisabled();
      });
      const toggle = screen.getByRole('switch', { name: /enable automatic collection/i });
      fireEvent.click(toggle);
      await waitFor(() => {
        expect((window as any).electronAPI.setSchedule).toHaveBeenCalledWith(
          expect.objectContaining({ enabled: true })
        );
      });
    });

    it('shows Run Now button and calls runCollectionNow when clicked', async () => {
      renderWithTheme(<Settings />);
      await waitFor(() => screen.getByText('Run Now'));
      fireEvent.click(screen.getByText('Run Now'));
      await waitFor(() => {
        expect((window as any).electronAPI.runCollectionNow).toHaveBeenCalled();
      });
    });

    it('shows last run result after successful collection', async () => {
      renderWithTheme(<Settings />);
      await waitFor(() => screen.getByText('Automatic Collection'));

      (window as any).electronAPI.getSchedule = vi.fn().mockResolvedValue({
        config: { enabled: true, frequency: 'daily', time: '09:00' },
        last_run_at: '2026-05-06T09:02:00.000Z',
        next_run_at: '2026-05-07T09:00:00.000Z',
        last_result: { success: true, evidence_count: 47, ran_at: '2026-05-06T09:02:00.000Z' },
      });

      renderWithTheme(<Settings />);
      await waitFor(() => {
        expect(screen.getAllByText(/47 items/)[0]).toBeInTheDocument();
      });
    });
  });

  it('renders ENTERPRISE chip when tier is enterprise', () => {
    vi.mocked(useLicense).mockReturnValue({
      tier: 'enterprise',
      licenseInfo: { licenseId: null, email: null, maxMachines: null, expiresAt: null, daysRemaining: null, isExpired: false, isGracePeriod: false },
      activateLicense: vi.fn(),
      deactivateLicense: vi.fn(),
    } as any);
    render(<Settings />);
    expect(screen.getAllByText('ENTERPRISE')[0]).toBeInTheDocument();
  });
});
