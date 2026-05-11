import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  }),
}));

beforeEach(() => {
  mockSetSelectedFramework.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Dashboard — framework picker', () => {
  it('renders SOC 2 toggle button', () => {
    render(<Dashboard />);
    expect(screen.getByRole('button', { name: /SOC 2/i })).toBeInTheDocument();
  });

  it('renders ISO 27001 toggle button', () => {
    render(<Dashboard />);
    expect(screen.getByRole('button', { name: /ISO 27001/i })).toBeInTheDocument();
  });

  it('renders HIPAA toggle button', () => {
    render(<Dashboard />);
    expect(screen.getByRole('button', { name: /HIPAA/i })).toBeInTheDocument();
  });

  it('calls setSelectedFramework(2) when ISO 27001 is clicked', () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /ISO 27001/i }));
    expect(mockSetSelectedFramework).toHaveBeenCalledWith(2);
  });

  it('calls setSelectedFramework(3) when HIPAA is clicked', () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /HIPAA/i }));
    expect(mockSetSelectedFramework).toHaveBeenCalledWith(3);
  });
});
