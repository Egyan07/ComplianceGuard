import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../theme';
import ScoreHero from './ScoreHero';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const evaluation = {
  framework_id: 1,
  framework_name: 'SOC 2 Type II',
  evaluation_date: '2026-05-14T10:00:00Z',
  overall_score: 87,
  status: 'partial',
  total_controls: 29,
  compliant_controls: 25,
  non_compliant_controls: 2,
  partial_controls: 2,
  not_assessed_controls: 0,
  category_scores: null,
  control_results: null,
  recommendations: [],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
  </MemoryRouter>
);

describe('ScoreHero', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders skeleton when loading', () => {
    const { container } = render(
      <ScoreHero evaluation={null} loading={true} selectedFramework={1} />,
      { wrapper }
    );
    expect(container.querySelector('[class*="MuiSkeleton"]')).toBeInTheDocument();
  });

  it('renders empty state when no evaluation', () => {
    render(
      <ScoreHero evaluation={null} loading={false} selectedFramework={1} />,
      { wrapper }
    );
    expect(screen.getByText(/No evaluation yet/i)).toBeInTheDocument();
  });

  it('renders the framework name', () => {
    render(
      <ScoreHero evaluation={evaluation} loading={false} selectedFramework={1} />,
      { wrapper }
    );
    expect(screen.getByText('SOC 2 Type II')).toBeInTheDocument();
  });

  it('renders all three framework mini-cards', () => {
    render(
      <ScoreHero evaluation={evaluation} loading={false} selectedFramework={1} />,
      { wrapper }
    );
    expect(screen.getByText('SOC 2')).toBeInTheDocument();
    expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    expect(screen.getByText('HIPAA')).toBeInTheDocument();
  });

  it('clicking ISO 27001 card navigates to /?fw=2', () => {
    render(
      <ScoreHero evaluation={evaluation} loading={false} selectedFramework={1} />,
      { wrapper }
    );
    fireEvent.click(screen.getByText('ISO 27001').closest('[data-fw]')!);
    expect(mockNavigate).toHaveBeenCalledWith('/?fw=2');
  });
});
