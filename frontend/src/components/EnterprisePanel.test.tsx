import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EnterprisePanel from './EnterprisePanel';
import * as LicenseContext from '../contexts/LicenseContext';

vi.mock('../contexts/LicenseContext');

describe('EnterprisePanel', () => {
  it('renders nothing for pro tier', () => {
    vi.mocked(LicenseContext.useLicense).mockReturnValue({ tier: 'pro' } as any);
    const { container } = render(<EnterprisePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for free tier', () => {
    vi.mocked(LicenseContext.useLicense).mockReturnValue({ tier: 'free' } as any);
    const { container } = render(<EnterprisePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders branding section for enterprise tier', () => {
    vi.mocked(LicenseContext.useLicense).mockReturnValue({ tier: 'enterprise' } as any);
    render(<EnterprisePanel />);
    expect(screen.getAllByText(/branding/i)[0]).toBeInTheDocument();
  });

  it('renders audit log section for enterprise tier', () => {
    vi.mocked(LicenseContext.useLicense).mockReturnValue({ tier: 'enterprise' } as any);
    render(<EnterprisePanel />);
    expect(screen.getAllByText(/audit log/i)[0]).toBeInTheDocument();
  });

  it('renders data export section for enterprise tier', () => {
    vi.mocked(LicenseContext.useLicense).mockReturnValue({ tier: 'enterprise' } as any);
    render(<EnterprisePanel />);
    expect(screen.getByText(/data export/i)).toBeInTheDocument();
  });
});
