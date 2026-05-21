import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

const mockSetSelectedFramework = vi.fn();

vi.mock('../hooks/useDashboard', () => ({
  useDashboard: () => ({
    state: {
      summary: null,
      evidenceItems: [],
      evaluation: null,
      loading: false,
      error: null,
      successMessage: null,
    },
    collectingEvidence: false,
    evaluating: false,
    exportingPDF: false,
    syncingCloud: false,
    cloudConnected: false,
    selectedFramework: 1,
    setSelectedFramework: mockSetSelectedFramework,
    fetchDashboardData: vi.fn(),
    handleCollectEvidence: vi.fn(),
    handleEvaluateCompliance: vi.fn(),
    handleExportPDF: vi.fn(),
    handleSyncToCloud: vi.fn(),
    clearMessage: vi.fn(),
    handleRescan: vi.fn(),
  }),
}));

beforeEach(() => {
  mockSetSelectedFramework.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Dashboard — framework URL sync', () => {
  it('renders without framework toggle buttons', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /SOC 2/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ISO 27001/i })).toBeNull();
  });

  it('syncs fw=2 URL param to setSelectedFramework', () => {
    render(
      <MemoryRouter initialEntries={['/?fw=2']}>
        <Dashboard />
      </MemoryRouter>
    );
    expect(mockSetSelectedFramework).toHaveBeenCalledWith(2);
  });

  it('syncs fw=3 URL param to setSelectedFramework', () => {
    render(
      <MemoryRouter initialEntries={['/?fw=3']}>
        <Dashboard />
      </MemoryRouter>
    );
    expect(mockSetSelectedFramework).toHaveBeenCalledWith(3);
  });

  it('defaults to fw=1 when no param', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(mockSetSelectedFramework).toHaveBeenCalledWith(1);
  });

  it('ignores invalid fw param values', () => {
    render(
      <MemoryRouter initialEntries={['/?fw=99']}>
        <Dashboard />
      </MemoryRouter>
    );
    expect(mockSetSelectedFramework).not.toHaveBeenCalled();
  });
});
