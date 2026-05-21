import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ControlHeatmap from './ControlHeatmap';
import type { ControlResult } from '../services/api';

vi.mock('../contexts/LicenseContext', () => ({
  useLicense: vi.fn(() => ({
    tier: 'pro',
    isFeatureAllowed: () => true,
    licenseInfo: {},
    activateLicense: vi.fn(),
    deactivateLicense: vi.fn(),
  })),
}));

const theme = createTheme();
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockControlResults: Record<string, ControlResult> = {
  'CC6.1': { status: 'compliant',     score: 90, gaps: [],                 available_evidence: ['firewall_configs'] },
  'CC6.3': { status: 'non_compliant', score: 18, gaps: ['event_logs'],     available_evidence: [] },
  'CC6.7': { status: 'non_compliant', score: 25, gaps: ['network_configs'],available_evidence: [] },
  'CC3.1': { status: 'partial',       score: 55, gaps: ['policy_document'],available_evidence: ['audit_reports'] },
  'A1.1':  { status: 'compliant',     score: 95, gaps: [],                 available_evidence: ['system_configs'] },
};

describe('ControlHeatmap', () => {
  it('renders all control IDs', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    expect(screen.getByText('CC6.1')).toBeInTheDocument();
    expect(screen.getByText('CC6.3')).toBeInTheDocument();
    expect(screen.getByText('A1.1')).toBeInTheDocument();
  });

  it('renders Pass status pills for compliant controls', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    expect(screen.getAllByText('Pass').length).toBeGreaterThan(0);
  });

  it('renders Fail status pills for non_compliant controls', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    expect(screen.getAllByText('Fail').length).toBeGreaterThan(0);
  });

  it('renders Partial status pill for partial controls', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('renders empty state when controlResults is null', () => {
    wrap(<ControlHeatmap controlResults={null} isElectron={false} isProTier />);
    expect(screen.getByText(/run an evaluation/i)).toBeInTheDocument();
  });

  it('filter chip Failing hides compliant controls', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    fireEvent.click(screen.getByText('Failing'));
    expect(screen.queryByText('CC6.1')).not.toBeInTheDocument();
    expect(screen.getByText('CC6.3')).toBeInTheDocument();
  });

  it('filter chip All restores all controls', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    fireEvent.click(screen.getByText('Failing'));
    fireEvent.click(screen.getByText('All'));
    expect(screen.getByText('CC6.1')).toBeInTheDocument();
  });

  it('shows upgrade prompt for free tier', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier={false} />);
    expect(screen.getByText(/per-control breakdown requires pro/i)).toBeInTheDocument();
  });
});
