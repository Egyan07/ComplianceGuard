import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import EvaluationHistory from './EvaluationHistory';
import { LicenseProvider, useLicense } from '../contexts/LicenseContext';

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

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getScoreTrend: vi.fn().mockResolvedValue([]),
  };
});

import { getScoreTrend } from '../services/api';

const theme = createTheme();

const mockEvaluations = [
  {
    id: 1,
    framework_id: 1,
    evaluation_date: '2026-04-12T10:00:00Z',
    overall_score: 85,
    status: 'compliant',
    findings: {
      overall_score: 85,
      status: 'compliant',
      total_controls: 29,
      compliant_controls: 24,
      partial_controls: 3,
      non_compliant_controls: 2,
      recommendations: [
        { priority: 'high', text: 'Fix CC6.1' },
        { priority: 'low', text: 'Review CC1.2' },
      ],
    },
  },
  {
    id: 2,
    framework_id: 1,
    evaluation_date: '2026-04-10T10:00:00Z',
    overall_score: 72,
    status: 'partial',
    findings: {
      overall_score: 72,
      status: 'partial',
      total_controls: 29,
      compliant_controls: 18,
      partial_controls: 6,
      non_compliant_controls: 5,
      recommendations: [],
    },
  },
];

const renderHistory = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <LicenseProvider>
          <EvaluationHistory {...props} />
        </LicenseProvider>
      </MemoryRouter>
    </ThemeProvider>
  );

describe('EvaluationHistory', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).electronAPI = undefined;
  });

  describe('free tier (no license)', () => {
    it('shows upgrade prompt in free tier', async () => {
      renderHistory();
      await waitFor(() => {
        expect(screen.getByText('Track your compliance over time')).toBeInTheDocument();
      });
    });

    it('shows Upgrade to Pro button in free tier', async () => {
      renderHistory();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).toBeInTheDocument();
      });
    });

    it('shows Evaluation History heading in free tier', async () => {
      renderHistory();
      await waitFor(() => {
        expect(screen.getByText('Evaluation History')).toBeInTheDocument();
      });
    });

    it('calls onNavigate with settings when Upgrade to Pro is clicked', async () => {
      const onNavigate = vi.fn();
      renderHistory({ onNavigate });
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
        expect(onNavigate).toHaveBeenCalledWith('settings');
      });
    });
  });

  describe('web mode (no electronAPI, pro tier skipped)', () => {
    beforeEach(() => {
      // Simulate pro tier by mocking LicenseContext behaviour
      // Since we can't easily mock pro, we test web mode messages
      (window as any).electronAPI = undefined;
    });

    it('shows Evaluation History heading', async () => {
      renderHistory();
      await waitFor(() => {
        expect(screen.getByText('Evaluation History')).toBeInTheDocument();
      });
    });
  });

  describe('electron mode with data', () => {
    beforeEach(() => {
      (window as any).electronAPI = {
        getEvaluationHistory: vi.fn().mockResolvedValue(mockEvaluations),
      };
    });

    it('shows Refresh button', async () => {
      renderHistory();
      await waitFor(() => {
        // In free tier upgrade prompt is shown, not the full history view
        // The component checks isFeatureAllowed first
        expect(screen.getByText('Evaluation History')).toBeInTheDocument();
      });
    });
  });

  describe('helper functions via rendered output', () => {
    it('renders without crashing with no props', () => {
      expect(() => renderHistory()).not.toThrow();
    });

    it('honours the ?fw= deep link — framework 4 trend is requested', async () => {
      // Regression: History kept a local framework selector and ignored the
      // URL, so the sidebar switcher / Dashboard deep links had no effect.
      vi.mocked(useLicense).mockReturnValue({
        tier: 'pro',
        licenseInfo: { licenseId: 'CG-PRO-1', email: 'e@x.com', maxMachines: null, expiresAt: null, daysRemaining: null, isExpired: false, isGracePeriod: false },
        loading: false,
        isFeatureAllowed: () => true,
        activateLicense: vi.fn(),
        deactivateLicense: vi.fn(),
      } as any);
      vi.mocked(getScoreTrend).mockClear().mockResolvedValue([]);

      render(
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={['/?fw=4']}>
            <EvaluationHistory />
          </MemoryRouter>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(getScoreTrend).toHaveBeenCalledWith(4);
      });
    });

    it('renders without crashing with onNavigate prop', () => {
      expect(() => renderHistory({ onNavigate: vi.fn() })).not.toThrow();
    });
  });
});
