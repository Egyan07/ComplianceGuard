import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../theme';
import ContextSidebar from './ContextSidebar';

const renderAt = (path: string, selectedFramework = 1) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider theme={lightTheme}>
        <ContextSidebar selectedFramework={selectedFramework} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe('ContextSidebar', () => {
  it('always shows global navigation items', () => {
    renderAt('/');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Cloud')).toBeInTheDocument();
    expect(screen.getByText('Frameworks')).toBeInTheDocument();
  });

  it('shows framework selector on dashboard route', () => {
    renderAt('/');
    expect(screen.getByText('SOC 2')).toBeInTheDocument();
    expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    expect(screen.getByText('HIPAA')).toBeInTheDocument();
  });

  it('shows SETTINGS section on /settings route', () => {
    renderAt('/settings');
    expect(screen.getByText('License')).toBeInTheDocument();
    expect(screen.getByText('Auto Collection')).toBeInTheDocument();
  });

  it('shows FILTER section on /history route', () => {
    renderAt('/history');
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('shows BROWSE section on /frameworks route', () => {
    renderAt('/frameworks');
    expect(screen.getByText('SOC 2')).toBeInTheDocument();
    expect(screen.getByText('ISO 27001')).toBeInTheDocument();
  });

  it('shows cloud context section on /cloud route', () => {
    renderAt('/cloud');
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Machines')).toBeInTheDocument();
  });
});
