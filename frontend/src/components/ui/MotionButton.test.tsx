import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../theme';
import MotionButton from './MotionButton';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
);

describe('MotionButton', () => {
  it('renders children', () => {
    render(<MotionButton>Click me</MotionButton>, { wrapper });
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('forwards onClick', () => {
    const onClick = vi.fn();
    render(<MotionButton onClick={onClick}>Click me</MotionButton>, { wrapper });
    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
