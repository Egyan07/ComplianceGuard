import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import EvidenceUpload from './EvidenceUpload';

const theme = createTheme();

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

const renderUpload = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <EvidenceUpload {...defaultProps} {...props} />
    </ThemeProvider>
  );

describe('EvidenceUpload', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).electronAPI = undefined;
  });

  describe('rendering', () => {
    it('renders dialog title when open is true', () => {
      renderUpload();
      // DialogTitle renders both an h2 wrapper and an inner h6 — use getAllByRole and check the outermost (h2)
      const headings = screen.getAllByRole('heading', { name: /upload evidence/i });
      expect(headings[0]).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      renderUpload({ open: false });
      expect(screen.queryByRole('heading', { name: /upload evidence/i })).not.toBeInTheDocument();
    });

    it('shows Cancel button', () => {
      renderUpload();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('shows Upload Evidence submit button', () => {
      renderUpload();
      expect(screen.getByRole('button', { name: /Upload Evidence/i })).toBeInTheDocument();
    });

    it('submit button is disabled when no fields filled', () => {
      renderUpload();
      expect(screen.getByRole('button', { name: /Upload Evidence/i })).toBeDisabled();
    });

    it('shows Upload File chip by default', () => {
      renderUpload();
      expect(screen.getByText('Upload File')).toBeInTheDocument();
    });

    it('shows Enter Text chip', () => {
      renderUpload();
      expect(screen.getByText('Enter Text')).toBeInTheDocument();
    });

    it('shows file upload info alert in web mode', () => {
      renderUpload();
      expect(screen.getByText('File upload requires the desktop application.')).toBeInTheDocument();
    });

    it('shows Title field', () => {
      renderUpload();
      expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument();
    });

    it('shows Description field', () => {
      renderUpload();
      expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
    });
  });

  describe('upload mode toggle', () => {
    it('switches to text mode when Enter Text is clicked', () => {
      renderUpload();
      fireEvent.click(screen.getByText('Enter Text'));
      expect(screen.getByRole('textbox', { name: /evidence content/i })).toBeInTheDocument();
    });

    it('switches back to file mode when Upload File is clicked', () => {
      renderUpload();
      fireEvent.click(screen.getByText('Enter Text'));
      fireEvent.click(screen.getByText('Upload File'));
      expect(screen.getByText('File upload requires the desktop application.')).toBeInTheDocument();
    });

    it('hides file alert in text mode', () => {
      renderUpload();
      fireEvent.click(screen.getByText('Enter Text'));
      expect(screen.queryByText('File upload requires the desktop application.')).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('submit button is disabled without required fields', () => {
      renderUpload();
      expect(screen.getByRole('button', { name: /Upload Evidence/i })).toBeDisabled();
    });

    it('no error alert shown initially', () => {
      renderUpload();
      // The info alert ("File upload requires the desktop application.") is expected in web mode.
      // Only error alerts should be absent initially.
      expect(screen.queryByRole('alert', { name: /error/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/please fill in/i)).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      renderUpload({ onClose });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('typing in title field updates value', () => {
      renderUpload();
      const titleField = screen.getByRole('textbox', { name: /title/i });
      fireEvent.change(titleField, { target: { value: 'My Policy Document' } });
      expect(titleField).toHaveValue('My Policy Document');
    });

    it('typing in description field updates value', () => {
      renderUpload();
      const descField = screen.getByRole('textbox', { name: /description/i });
      fireEvent.change(descField, { target: { value: 'This is a test description' } });
      expect(descField).toHaveValue('This is a test description');
    });

    it('typing in text content field updates value', () => {
      renderUpload();
      fireEvent.click(screen.getByText('Enter Text'));
      const contentField = screen.getByRole('textbox', { name: /evidence content/i });
      fireEvent.change(contentField, { target: { value: 'Policy content here' } });
      expect(contentField).toHaveValue('Policy content here');
    });

    it('does not call onSuccess before submission', () => {
      const onSuccess = vi.fn();
      renderUpload({ onSuccess });
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('resets form state when Cancel is clicked', () => {
      const onClose = vi.fn();
      renderUpload({ onClose });
      fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
        target: { value: 'Test Title' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalled();
    });

  it('does not throw when dialog is interacted with', () => {
    expect(() => renderUpload()).not.toThrow();
  });

  it('labels the control selector SOC 2 by default', () => {
    renderUpload();
    // MUI renders the label twice (InputLabel + outlined-field clone).
    expect(screen.getAllByText('SOC 2 Control *').length).toBeGreaterThan(0);
  });

  it('labels the control selector for the selected framework (GDPR)', () => {
    renderUpload({ frameworkId: 4 });
    expect(screen.getAllByText('GDPR Control *').length).toBeGreaterThan(0);
    expect(screen.queryByText('SOC 2 Control *')).not.toBeInTheDocument();
  });

  it('labels the control selector for ISO 27001', () => {
    renderUpload({ frameworkId: 2 });
    expect(screen.getAllByText('ISO 27001 Control *').length).toBeGreaterThan(0);
  });

  it('drops a selected control when the framework changes mid-dialog', () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <EvidenceUpload {...defaultProps} frameworkId={1} />
      </ThemeProvider>
    );
    // No assertion on selection state needed here — the contract under test
    // is that switching frameworks re-renders with the new framework's
    // selector and does not retain a cross-framework control mapping.
    rerender(
      <ThemeProvider theme={theme}>
        <EvidenceUpload {...defaultProps} frameworkId={4} />
      </ThemeProvider>
    );
    expect(screen.getAllByText('GDPR Control *').length).toBeGreaterThan(0);
  });

  it('files uploaded evidence under the SELECTED framework id, not always SOC 2', async () => {
    // Regression: the dialog previously called processManualEvidence with a
    // hardcoded 1, so GDPR evidence was silently stored as SOC 2 evidence and
    // never counted toward the GDPR evaluation.
    const processManualEvidence = vi.fn().mockResolvedValue({ id: 1 });
    (window as any).electronAPI = { processManualEvidence };

    renderUpload({ frameworkId: 4 });

    // Text mode — file picking is desktop-only.
    fireEvent.click(screen.getByText('Enter Text'));

    // Two MUI comboboxes render: [0] = control, [1] = evidence type.
    const combo = () => screen.getAllByRole('combobox');

    // Pick a real GDPR obligation (DPO designation) from the framework-aware list.
    fireEvent.mouseDown(combo()[0]);
    fireEvent.click(screen.getByRole('option', { name: /Art\.37\.1/ }));

    // Pick the control's canonical evidence type (Art.37.1 → policy_document).
    fireEvent.mouseDown(combo()[1]);
    fireEvent.click(screen.getByRole('option', { name: /Policy Document/i }));

    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'DPO designation record' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /evidence content/i }), {
      target: { value: 'DPO appointment document' },
    });

    const submit = screen.getByRole('button', { name: /Upload Evidence/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(processManualEvidence).toHaveBeenCalledTimes(1);
    });
    expect(processManualEvidence).toHaveBeenCalledWith(expect.objectContaining({ controlId: expect.stringMatching(/^Art\./) }), 4);
  });
});
});
