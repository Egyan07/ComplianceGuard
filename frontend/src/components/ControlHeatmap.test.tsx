import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ControlHeatmap from './ControlHeatmap';
import type { ControlResult } from '../services/api';

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
    // CC6.3 is non_compliant and automatable
    expect(screen.getAllByText('Fix script').length).toBeGreaterThan(0);
  });

  it('shows How to fix button for non-automatable non-compliant control', () => {
    wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier />);
    // CC6.7 is non_compliant but guidance-only
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
    const { rerender } = wrap(<ControlHeatmap controlResults={mockControlResults} isElectron={true} isProTier onDownloadScript={onDownload} onRescan={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Fix script')[0]);
    fireEvent.click(screen.getByText('Download .ps1'));
    await screen.findByText('Re-scan now');
    expect(onDownload).toHaveBeenCalled();
  });
});
