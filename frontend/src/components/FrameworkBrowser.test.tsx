import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import FrameworkBrowser from './FrameworkBrowser';

const theme = createTheme();

const mockSoc2Data = {
  frameworkId: 1,
  name: 'SOC 2',
  controls: [
    {
      id: 'CC1.1',
      title: 'Control Environment',
      description: 'The entity demonstrates a commitment to integrity and ethical values.',
      category: 'CC',
      control_objective: 'Establish a control environment.',
      implementation_guidance: 'Implement policies and governance.',
      risk_level: 'high' as const,
    },
    {
      id: 'CC6.1',
      title: 'Logical Access Controls',
      description: 'The entity implements logical access security software.',
      category: 'CC',
      control_objective: 'Prevent unauthorized access.',
      implementation_guidance: 'Use MFA and access reviews.',
      risk_level: 'medium' as const,
    },
    {
      id: 'A1.1',
      title: 'Availability Policy',
      description: 'Policies for availability are established.',
      category: 'Availability',
      control_objective: 'Meet availability commitments.',
      implementation_guidance: 'Define RTO and RPO targets.',
      risk_level: 'low' as const,
    },
  ],
};

const mockIso27001Data = {
  frameworkId: 2,
  name: 'ISO 27001',
  controls: [
    {
      id: 'A.5.1.1',
      title: 'Policies for Information Security',
      description: 'A set of policies shall be defined and approved by management.',
      category: 'A.5',
      control_objective: 'Provide management direction.',
      implementation_guidance: 'Define an information security policy.',
      risk_level: 'high' as const,
    },
  ],
};

const mockHipaaData = {
  frameworkId: 3,
  name: 'HIPAA',
  controls: [
    {
      id: '164.308.a.1',
      title: 'Security Management Process',
      description: 'Implement policies to prevent security violations.',
      category: '164.308',
      control_objective: 'Manage security risks to ePHI.',
      implementation_guidance: 'Establish a formal security management program.',
      risk_level: 'high' as const,
      specification_type: 'required' as const,
    },
  ],
};

const makeMockApi = () => ({
  getFrameworkControls: vi.fn((frameworkId: number) => {
    if (frameworkId === 1) return Promise.resolve(mockSoc2Data);
    if (frameworkId === 2) return Promise.resolve(mockIso27001Data);
    if (frameworkId === 3) return Promise.resolve(mockHipaaData);
    return Promise.resolve({ error: 'Unknown framework' });
  }),
});

const renderBrowser = () =>
  render(
    <ThemeProvider theme={theme}>
      <FrameworkBrowser />
    </ThemeProvider>
  );

describe('FrameworkBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).electronAPI = makeMockApi();
  });

  it('renders all three framework tabs', () => {
    renderBrowser();
    expect(screen.getByRole('tab', { name: 'SOC 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ISO 27001' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'HIPAA' })).toBeInTheDocument();
  });

  it('calls getFrameworkControls with frameworkId 1 on mount', async () => {
    renderBrowser();
    await waitFor(() => {
      expect((window as any).electronAPI.getFrameworkControls).toHaveBeenCalledWith(1);
    });
  });

  it('displays controls grouped by category after load', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('CC (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('Availability (1)')).toBeInTheDocument();
  });

  it('filters controls by title when searching', async () => {
    renderBrowser();
    await waitFor(() => screen.getByText('CC (2)'));

    fireEvent.change(screen.getByPlaceholderText('Search controls...'), {
      target: { value: 'Logical Access' },
    });

    expect(screen.queryByText('Control Environment')).not.toBeInTheDocument();
    expect(screen.getByText('Logical Access Controls')).toBeInTheDocument();
    expect(screen.queryByText('Availability Policy')).not.toBeInTheDocument();
  });

  it('filters controls by description when searching', async () => {
    renderBrowser();
    await waitFor(() => screen.getByText('CC (2)'));

    fireEvent.change(screen.getByPlaceholderText('Search controls...'), {
      target: { value: 'commitment to integrity' },
    });

    expect(screen.getByText('Control Environment')).toBeInTheDocument();
    expect(screen.queryByText('Logical Access Controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Availability Policy')).not.toBeInTheDocument();
  });

  it('calls getFrameworkControls with frameworkId 2 when ISO 27001 tab is clicked', async () => {
    renderBrowser();
    await waitFor(() => screen.getByRole('tab', { name: 'ISO 27001' }));

    fireEvent.click(screen.getByRole('tab', { name: 'ISO 27001' }));

    await waitFor(() => {
      expect((window as any).electronAPI.getFrameworkControls).toHaveBeenCalledWith(2);
    });
  });

  it('calls getFrameworkControls with frameworkId 3 when HIPAA tab is clicked', async () => {
    renderBrowser();
    await waitFor(() => screen.getByRole('tab', { name: 'HIPAA' }));

    fireEvent.click(screen.getByRole('tab', { name: 'HIPAA' }));

    await waitFor(() => {
      expect((window as any).electronAPI.getFrameworkControls).toHaveBeenCalledWith(3);
    });
  });

  it('shows error Alert when IPC returns an error object', async () => {
    (window as any).electronAPI = {
      getFrameworkControls: vi.fn().mockResolvedValue({ error: 'YAML parse failed' }),
    };

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('YAML parse failed')).toBeInTheDocument();
    });
  });

  it('shows no-results message when filters match nothing', async () => {
    renderBrowser();
    await waitFor(() => screen.getByText('CC (2)'));

    fireEvent.change(screen.getByPlaceholderText('Search controls...'), {
      target: { value: 'zzz_no_match_zzz' },
    });

    expect(screen.getByText('No controls match your filters.')).toBeInTheDocument();
  });

  it('shows HIPAA specification_type chip in expanded control card', async () => {
    renderBrowser();
    await waitFor(() => screen.getByRole('tab', { name: 'HIPAA' }));

    fireEvent.click(screen.getByRole('tab', { name: 'HIPAA' }));

    await waitFor(() => screen.getByText('164.308 (1)'));

    fireEvent.click(screen.getByText('164.308 (1)'));

    await waitFor(() => screen.getByText('Security Management Process'));

    fireEvent.click(screen.getByText('Security Management Process'));

    await waitFor(() => {
      expect(screen.getByText('required')).toBeInTheDocument();
    });
  });
});
