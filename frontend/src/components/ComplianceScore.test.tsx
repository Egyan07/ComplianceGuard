import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ComplianceScore from './ComplianceScore';

const theme = createTheme();

const defaultMetrics = {
  s3_encryption_compliance: 85,
  iam_policy_compliance: 72,
  overall_compliance_score: 78,
};

const mockEvaluation = {
  framework_id: 1,
  framework_name: 'SOC 2 Type II',
  overall_score: 82.5,
  status: 'partial',
  total_controls: 29,
  compliant_controls: 18,
  non_compliant_controls: 3,
  partial_controls: 6,
  not_assessed_controls: 2,
  category_scores: {
    'Common Criteria (CC)': { score: 75, weight: 0.5, control_count: 17 },
    'Availability (A)': { score: 90, weight: 0.25, control_count: 4 },
  },
  control_results: {},
  recommendations: [],
};

const renderWithTheme = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ComplianceScore', () => {
  it('renders the component title', () => {
    renderWithTheme(<ComplianceScore metrics={defaultMetrics} />);
    expect(screen.getByText('Compliance Score')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderWithTheme(<ComplianceScore metrics={defaultMetrics} loading />);
    expect(screen.getByText('Loading compliance data...')).toBeInTheDocument();
  });

  it('displays metrics score when no evaluation', () => {
    renderWithTheme(<ComplianceScore metrics={defaultMetrics} />);
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByText('Overall Compliance')).toBeInTheDocument();
  });

  it('displays evaluation score when evaluation is provided', () => {
    renderWithTheme(
      <ComplianceScore metrics={defaultMetrics} evaluation={mockEvaluation} />
    );
    expect(screen.getByText('83%')).toBeInTheDocument(); // Math.round(82.5)
  });

  it('shows category breakdown from evaluation', () => {
    renderWithTheme(
      <ComplianceScore metrics={defaultMetrics} evaluation={mockEvaluation} />
    );
    expect(screen.getByText('Common Criteria (CC)')).toBeInTheDocument();
    expect(screen.getByText('Availability (A)')).toBeInTheDocument();
  });

  it('shows status chip with evaluation status', () => {
    renderWithTheme(
      <ComplianceScore metrics={defaultMetrics} evaluation={mockEvaluation} />
    );
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });

  it('shows placeholder metrics when no evaluation', () => {
    renderWithTheme(<ComplianceScore metrics={defaultMetrics} />);
    expect(screen.getByText('S3 Encryption Compliance')).toBeInTheDocument();
    expect(screen.getByText('IAM Policy Compliance')).toBeInTheDocument();
  });
});
