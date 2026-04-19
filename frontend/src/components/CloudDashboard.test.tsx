import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CloudDashboard from './CloudDashboard';
import * as api from '../services/api';
import { useLicense } from '../contexts/LicenseContext';

vi.mock('../services/api', () => ({
  getFleetStats: vi.fn(),
  getMachines: vi.fn(),
}));

vi.mock('../contexts/LicenseContext', () => ({
  useLicense: vi.fn(),
}));

const mockFleetStats: api.FleetStats = {
  total_machines: 3,
  compliant: 2,
  at_risk: 1,
  critical: 0,
  never_synced: 0,
  avg_score: 84.2,
  machine_limit: 10,
};

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86_400_000).toISOString();

const mockMachines: api.MachineRecord[] = [
  { id: 1, hostname: 'PC-001', last_score: 91.0, compliance_level: 'compliant', last_sync_at: now, os_version: 'Windows 11', evidence_count: 100, is_active: true, created_at: now },
  { id: 2, hostname: 'PC-002', last_score: 45.0, compliance_level: 'at_risk', last_sync_at: yesterday, os_version: 'Windows 10', evidence_count: 80, is_active: true, created_at: now },
  { id: 3, hostname: 'PC-003', last_score: null, compliance_level: null, last_sync_at: null, os_version: null, evidence_count: null, is_active: true, created_at: now },
];

describe('CloudDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useLicense as ReturnType<typeof vi.fn>).mockReturnValue({ tier: 'pro' });
    (api.getFleetStats as ReturnType<typeof vi.fn>).mockResolvedValue(mockFleetStats);
    (api.getMachines as ReturnType<typeof vi.fn>).mockResolvedValue(mockMachines);
  });

  it('renders fleet stats cards correctly', async () => {
    render(<CloudDashboard />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('84.2%')).toBeInTheDocument();
    });
  });

  it('renders machine list with correct status badges', async () => {
    render(<CloudDashboard />);
    await waitFor(() => {
      expect(screen.getByText('PC-001')).toBeInTheDocument();
      expect(screen.getByText('PC-002')).toBeInTheDocument();
      expect(screen.getByText('Compliant')).toBeInTheDocument();
      expect(screen.getByText('At Risk')).toBeInTheDocument();
    });
  });

  it('shows pro gate for free tier user', () => {
    (useLicense as ReturnType<typeof vi.fn>).mockReturnValue({ tier: 'free' });
    render(<CloudDashboard />);
    expect(screen.getByText(/Cloud Dashboard.*Pro Feature/i)).toBeInTheDocument();
  });

  it('shows dash for never-synced machine score', async () => {
    render(<CloudDashboard />);
    await waitFor(() => expect(screen.getByText('PC-003')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    const pc003Row = rows.find(r => r.textContent?.includes('PC-003'));
    expect(pc003Row?.textContent).toContain('—');
  });

  it('refresh button re-fetches data', async () => {
    render(<CloudDashboard />);
    // Wait for loading to finish and refresh button to appear
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(api.getFleetStats).toHaveBeenCalledTimes(2));
  });

  it('shows stale warning for machine not synced in 7+ days', async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    (api.getMachines as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...mockMachines[0], last_sync_at: staleDate, hostname: 'STALE-PC' },
    ]);
    render(<CloudDashboard />);
    await waitFor(() => expect(screen.getByText('STALE-PC')).toBeInTheDocument());
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
  });
});
