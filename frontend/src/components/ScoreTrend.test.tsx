import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ScoreTrend from './ScoreTrend';
import type { TrendPoint } from '../services/api';

const theme = createTheme();
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const mockPoints: TrendPoint[] = [
  { date: '2026-01-15T00:00:00', score: 58, status: 'non_compliant' },
  { date: '2026-02-12T00:00:00', score: 63, status: 'non_compliant' },
  { date: '2026-03-09T00:00:00', score: 69, status: 'partial' },
  { date: '2026-04-06T00:00:00', score: 74, status: 'partial' },
  { date: '2026-05-04T00:00:00', score: 78, status: 'compliant' },
  { date: '2026-06-01T00:00:00', score: 82, status: 'compliant' },
];

const noop = vi.fn();

describe('ScoreTrend', () => {
  it('renders current score as hero number', () => {
    wrap(<ScoreTrend evaluations={mockPoints} selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.getByText('82')).toBeInTheDocument();
  });

  it('shows improvement delta with 2+ evaluations', () => {
    wrap(<ScoreTrend evaluations={mockPoints} selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.getByText(/\+24/)).toBeInTheDocument();
  });

  it('hides delta with only 1 evaluation', () => {
    wrap(<ScoreTrend evaluations={[mockPoints[0]]} selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('shows empty state when no evaluations', () => {
    wrap(<ScoreTrend evaluations={[]} selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.getByText(/begin tracking compliance progression/i)).toBeInTheDocument();
  });

  it('shows evaluation count', () => {
    wrap(<ScoreTrend evaluations={mockPoints} selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders evaluation table rows matching data', () => {
    wrap(<ScoreTrend evaluations={mockPoints} selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.getAllByText(/Good Standing|On Track|Needs Attention/).length).toBe(6);
  });

  it('calls onFrameworkChange when tab clicked', () => {
    const onChange = vi.fn();
    wrap(<ScoreTrend evaluations={mockPoints} selectedFramework={1} onFrameworkChange={onChange} />);
    fireEvent.click(screen.getByText('ISO 27001'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('renders loading skeleton when loading=true', () => {
    wrap(<ScoreTrend evaluations={[]} loading selectedFramework={1} onFrameworkChange={noop} />);
    expect(screen.queryByText('82')).not.toBeInTheDocument();
  });
});
