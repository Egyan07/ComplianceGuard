import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import EvidenceList from './EvidenceList';
import { EvidenceItem } from '../services/api';

const theme = createTheme();

const mockItems: EvidenceItem[] = [
  {
    id: '1',
    type: 's3_encryption',
    status: 'compliant',
    data: { bucket: 'test-bucket', encryption: 'AES256' },
    timestamp: '2026-04-01T10:00:00Z',
    source: 'aws_s3',
  },
  {
    id: '2',
    type: 'iam_policy',
    status: 'warning',
    data: { policy: 'admin-access', risk: 'medium' },
    timestamp: '2026-04-01T09:00:00Z',
    source: 'aws_iam',
  },
  {
    id: '3',
    type: 'firewall_config',
    status: 'non_compliant',
    data: { profile: 'public', enabled: false },
    timestamp: '2026-04-01T08:00:00Z',
    source: 'local',
  },
];

const renderWithTheme = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('EvidenceList', () => {
  it('renders evidence list header', () => {
    renderWithTheme(<EvidenceList evidenceItems={mockItems} />);
    expect(screen.getByText('Evidence List')).toBeInTheDocument();
  });

  it('shows item count', () => {
    renderWithTheme(<EvidenceList evidenceItems={mockItems} />);
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    renderWithTheme(<EvidenceList evidenceItems={[]} loading />);
    expect(screen.getByText('Loading evidence data...')).toBeInTheDocument();
  });

  it('shows empty message when no items match filter', () => {
    renderWithTheme(<EvidenceList evidenceItems={[]} />);
    expect(
      screen.getByText('No evidence items found matching current filters.')
    ).toBeInTheDocument();
  });

  it('displays evidence type for each item', () => {
    renderWithTheme(<EvidenceList evidenceItems={mockItems} />);
    expect(screen.getByText('S3 ENCRYPTION')).toBeInTheDocument();
    expect(screen.getByText('IAM POLICY')).toBeInTheDocument();
    expect(screen.getByText('FIREWALL CONFIG')).toBeInTheDocument();
  });

  it('displays status chips', () => {
    renderWithTheme(<EvidenceList evidenceItems={mockItems} />);
    expect(screen.getByText('COMPLIANT')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText('NON-COMPLIANT')).toBeInTheDocument();
  });

  it('calls onItemClick when item is clicked', () => {
    const onClick = vi.fn();
    renderWithTheme(<EvidenceList evidenceItems={mockItems} onItemClick={onClick} />);

    fireEvent.click(screen.getByText('S3 ENCRYPTION'));
    expect(onClick).toHaveBeenCalledWith(mockItems[0]);
  });

  it('filters items by search term', () => {
    renderWithTheme(<EvidenceList evidenceItems={mockItems} />);

    const searchInput = screen.getByPlaceholderText('Search evidence...');
    fireEvent.change(searchInput, { target: { value: 'firewall', name: 'searchTerm' } });

    expect(screen.getByText('FIREWALL CONFIG')).toBeInTheDocument();
    expect(screen.queryByText('S3 ENCRYPTION')).not.toBeInTheDocument();
  });
});
