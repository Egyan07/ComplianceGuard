import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import UpgradePrompt from './UpgradePrompt';

const theme = createTheme();

const defaultProps = {
  feature: 'PDF Reports',
  description: 'Export audit-ready PDF reports for your auditor.',
  open: true,
  onClose: vi.fn(),
  onGoToSettings: vi.fn(),
};

const renderPrompt = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <UpgradePrompt {...defaultProps} {...props} />
    </ThemeProvider>
  );

describe('UpgradePrompt', () => {

  describe('rendering', () => {
    it('renders when open is true', () => {
      renderPrompt();
      expect(screen.getByText('PDF Reports — Pro Feature')).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      renderPrompt({ open: false });
      expect(screen.queryByText('PDF Reports — Pro Feature')).not.toBeInTheDocument();
    });

    it('shows the feature name in the title', () => {
      renderPrompt({ feature: 'Evaluation History' });
      expect(screen.getByText('Evaluation History — Pro Feature')).toBeInTheDocument();
    });

    it('shows the description text', () => {
      renderPrompt();
      expect(screen.getByText('Export audit-ready PDF reports for your auditor.')).toBeInTheDocument();
    });

    it('shows the upgrade call to action text', () => {
      renderPrompt();
      expect(screen.getByText(/Upgrade to Pro to unlock/i)).toBeInTheDocument();
    });

    it('shows Maybe Later button', () => {
      renderPrompt();
      expect(screen.getByRole('button', { name: 'Maybe Later' })).toBeInTheDocument();
    });

    it('shows Enter License Key button', () => {
      renderPrompt();
      expect(screen.getByRole('button', { name: 'Enter License Key' })).toBeInTheDocument();
    });

    it('renders with different feature and description', () => {
      renderPrompt({
        feature: 'All Controls',
        description: 'Unlock all 29 SOC 2 controls.',
      });
      expect(screen.getByText('All Controls — Pro Feature')).toBeInTheDocument();
      expect(screen.getByText('Unlock all 29 SOC 2 controls.')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClose when Maybe Later is clicked', () => {
      const onClose = vi.fn();
      renderPrompt({ onClose });
      fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Enter License Key is clicked', () => {
      const onClose = vi.fn();
      renderPrompt({ onClose });
      fireEvent.click(screen.getByRole('button', { name: 'Enter License Key' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onGoToSettings when Enter License Key is clicked', () => {
      const onGoToSettings = vi.fn();
      renderPrompt({ onGoToSettings });
      fireEvent.click(screen.getByRole('button', { name: 'Enter License Key' }));
      expect(onGoToSettings).toHaveBeenCalledTimes(1);
    });

    it('does not throw if onGoToSettings is not provided', () => {
      renderPrompt({ onGoToSettings: undefined });
      expect(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Enter License Key' }))
      ).not.toThrow();
    });

    it('calls onClose when dialog backdrop is clicked', () => {
      const onClose = vi.fn();
      renderPrompt({ onClose });
      // MUI Dialog calls onClose when clicking outside
      const backdrop = document.querySelector('.MuiBackdrop-root');
      if (backdrop) fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
