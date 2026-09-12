import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ControlHeatmap from './ControlHeatmap';
import type { ControlResult } from '../services/api';

const theme = createTheme();
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

// Real 2017 TSC criteria. CC6.6 (external-threat protection) is automatable
// and failing -> "Fix script"; CC6.3 (access authorization) is guidance-only
// and failing -> "How to fix". control_title / control_category mirror what
// both canonical engines now stamp onto every result.
const mockControlResults: Record<string, ControlResult> = {
  'CC6.1': { status: 'compliant',     score: 90, gaps: [],                 available_evidence: ['firewall_configs'], control_id: 'CC6.1', control_title: 'Logical Access Security', control_category: 'CC' },
  'CC6.3': { status: 'non_compliant', score: 18, gaps: ['policy_document'],available_evidence: [], control_id: 'CC6.3', control_title: 'Access Authorization and Modification', control_category: 'CC' },
  'CC6.6': { status: 'non_compliant', score: 25, gaps: ['network_configs'],available_evidence: [], control_id: 'CC6.6', control_title: 'Protection Against External Threats', control_category: 'CC' },
  'CC3.1': { status: 'partial',       score: 55, gaps: ['policy_document'],available_evidence: ['audit_reports'], control_id: 'CC3.1', control_title: 'Objectives Specification', control_category: 'CC' },
  'A1.1':  { status: 'compliant',     score: 95, gaps: [],                 available_evidence: ['system_configs'], control_id: 'A1.1', control_title: 'Processing Capacity Management', control_category: 'A' },
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
    // getAllByText because both the filter chip and the status pill say "Partial"
    expect(screen.getAllByText('Partial').length).toBeGreaterThanOrEqual(1);
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

  it('filter chip Partial shows only partial controls', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    fireEvent.click(screen.getAllByText('Partial')[0]); // click the filter chip (first match)
    expect(screen.queryByText('CC6.1')).not.toBeInTheDocument(); // compliant — hidden
    expect(screen.queryByText('CC6.3')).not.toBeInTheDocument(); // non_compliant — hidden
    expect(screen.getByText('CC3.1')).toBeInTheDocument();       // partial — visible
  });

  it('shows upgrade prompt for free tier', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier={false} />);
    expect(screen.getByText(/per-control breakdown requires pro/i)).toBeInTheDocument();
  });

  it('shows Fix script button for automatable non-compliant control in Electron mode', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    // CC6.6 is non_compliant and automatable
    expect(screen.getAllByText('Fix script').length).toBeGreaterThan(0);
  });

  it('shows How to fix button for non-automatable non-compliant control', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    // CC6.3 is non_compliant but guidance-only under the real TSC
    expect(screen.getAllByText('How to fix').length).toBeGreaterThan(0);
  });

  it('shows How to fix for all failing controls in web mode (no download in web)', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={false} isProTier />);
    // In web mode no "Fix script" buttons — only "How to fix"
    expect(screen.queryByText('Fix script')).not.toBeInTheDocument();
    expect(screen.getAllByText('How to fix').length).toBeGreaterThan(0);
  });

  it('clicking Fix script expands the accordion and shows evidence gaps', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    const fixBtns = screen.getAllByText('Fix script');
    fireEvent.click(fixBtns[0]);
    expect(screen.getByText(/evidence gaps/i)).toBeInTheDocument();
  });

  it('clicking the same button again collapses the accordion', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    const fixBtns = screen.getAllByText('Fix script');
    fireEvent.click(fixBtns[0]);
    fireEvent.click(fixBtns[0]);
    expect(screen.queryByText(/evidence gaps/i)).not.toBeInTheDocument();
  });

  it('expanding a second row collapses the first', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    const fixBtns = screen.getAllByText('Fix script');
    const howBtns = screen.getAllByText('How to fix');
    fireEvent.click(fixBtns[0]);
    // now expand a different row
    fireEvent.click(howBtns[0]);
    // only one accordion should be open — only one "Evidence gaps" (if the how-to row has gaps)
    // use Reversible text which only appears in the footer of an expanded automatable row
    expect(screen.queryByText(/reversible/i)).not.toBeInTheDocument();
  });

  it('shows Reversible · Requires Admin in footer for automatable control', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    fireEvent.click(screen.getAllByText('Fix script')[0]);
    expect(screen.getByText(/reversible · requires admin/i)).toBeInTheDocument();
  });

  it('shows Download .ps1 button in expanded panel when onDownloadScript provided', () => {
    const onDownload = vi.fn().mockResolvedValue({ success: true, file_name: 'fix-CC6.3.ps1' });
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier onDownloadScript={onDownload} onRescan={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Fix script')[0]);
    expect(screen.getByText('Download .ps1')).toBeInTheDocument();
  });

  it('calls onDownloadScript when Download is clicked and shows re-scan button after', async () => {
    const onDownload = vi.fn().mockResolvedValue({ success: true, file_name: 'fix-CC6.3.ps1' });
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier onDownloadScript={onDownload} onRescan={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Fix script')[0]);
    fireEvent.click(screen.getByText('Download .ps1'));
    await screen.findByText('Re-scan now');
    expect(onDownload).toHaveBeenCalledWith(expect.stringMatching(/^CC/));
  });

  // ── Framework awareness (Phase B regression) ────────────────────────────
  const gdprResults: Record<string, ControlResult> = {
    'Art.5.1': { status: 'partial', score: 50, gaps: ['policy_document'], available_evidence: ['audit_reports'], control_id: 'Art.5.1', control_title: 'Lawful, Fair and Transparent Processing', control_category: '5' },
    'Art.15.1': { status: 'not_assessed', score: 0, gaps: ['policy_document'], available_evidence: [], control_id: 'Art.15.1', control_title: 'Right of Access', control_category: '15' },
    'Art.32.1': { status: 'compliant', score: 100, gaps: [], available_evidence: ['encryption_policies'], control_id: 'Art.32.1', control_title: 'Security of Processing', control_category: '32' },
  };

  it('renders the evaluated framework in the header, not hardcoded SOC 2', () => {
    wrap(<ControlHeatmap controlResults={gdprResults} isElectron={false} isProTier selectedFramework={4} />);
    expect(screen.getByText(/GDPR · 3 obligations/)).toBeInTheDocument();
  });

  it('renders GDPR article obligations with their own titles and Article groups', () => {
    wrap(<ControlHeatmap controlResults={gdprResults} isElectron={false} isProTier selectedFramework={4} />);
    expect(screen.getByText('Art.15.1')).toBeInTheDocument();
    expect(screen.getByText('Right of Access')).toBeInTheDocument();
    expect(screen.queryByText(/Common Criteria \(CC\)/)).not.toBeInTheDocument();
    expect(screen.getByText('Article 15')).toBeInTheDocument();
    expect(screen.getByText('Article 5')).toBeInTheDocument();
  });

  it('renders ISO 27001 A.5 groups when evaluating ISO', () => {
    const isoResults: Record<string, ControlResult> = {
      'A.5.1': { status: 'compliant', score: 100, gaps: [], available_evidence: ['policy_document'], control_id: 'A.5.1', control_title: 'Policies for Information Security', control_category: 'A.5' },
      'A.8.16': { status: 'non_compliant', score: 20, gaps: ['event_logs'], available_evidence: [], control_id: 'A.8.16', control_title: 'Monitoring Activities', control_category: 'A.8' },
    };
    wrap(<ControlHeatmap controlResults={isoResults} isElectron={false} isProTier selectedFramework={2} />);
    expect(screen.getByText(/ISO\/IEC 27001:2022 · 2 controls/)).toBeInTheDocument();
    expect(screen.getByText('A.5.1')).toBeInTheDocument();
    expect(screen.getByText(/Organizational Controls \(A\.5\)/)).toBeInTheDocument();
    expect(screen.queryByText('CC6.1')).not.toBeInTheDocument();
  });

  it('offers no Fix script for failing non-SOC2 controls (scripts are SOC2-mapped)', () => {
    wrap(<ControlHeatmap controlResults={gdprResults} isElectron={true} isProTier selectedFramework={4} />);
    expect(screen.queryByText('Fix script')).not.toBeInTheDocument();
  });

  it('falls back to framework name only when no evaluation has run', () => {
    wrap(<ControlHeatmap controlResults={null} isElectron={false} isProTier selectedFramework={4} />);
    expect(screen.getByText('GDPR')).toBeInTheDocument();
    expect(screen.queryByText(/SOC 2/)).not.toBeInTheDocument();
  });
});
