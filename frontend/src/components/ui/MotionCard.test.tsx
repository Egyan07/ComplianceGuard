import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../theme';
import MotionCard from './MotionCard';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
);

describe('MotionCard', () => {
  it('renders children', () => {
    render(<MotionCard><div>card content</div></MotionCard>, { wrapper });
    expect(screen.getByText('card content')).toBeInTheDocument();
  });

  it('renders without crashing with no children', () => {
    const { container } = render(<MotionCard />, { wrapper });
    expect(container.firstChild).toBeInTheDocument();
  });
});
