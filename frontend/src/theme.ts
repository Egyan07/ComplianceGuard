import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { createTheme } from '@mui/material/styles';

const TYPOGRAPHY = {
  fontFamily: "'Inter', 'Segoe UI', 'Helvetica', 'Arial', sans-serif",
  h4: { fontWeight: 700, letterSpacing: '-0.5px' },
  h5: { fontWeight: 600, letterSpacing: '-0.3px' },
  h6: { fontWeight: 600, letterSpacing: '-0.3px' },
  button: { textTransform: 'none' as const },
};

const COMPONENT_OVERRIDES = {
  MuiPaper:  { styleOverrides: { root: { borderRadius: 10 } } },
  MuiButton: { styleOverrides: { root: { borderRadius: 8, textTransform: 'none' as const } } },
  MuiChip:   { styleOverrides: { root: { borderRadius: 6 } } },
};

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary:    { main: '#2563EB', dark: '#1E40AF', light: '#3B82F6' },
    secondary:  { main: '#10B981' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text:       { primary: '#111827', secondary: '#6B7280' },
    divider:    '#E5E7EB',
  },
  typography: TYPOGRAPHY,
  components: {
    ...COMPONENT_OVERRIDES,
    MuiCard: { styleOverrides: { root: { borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } } },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#3B82F6', dark: '#2563EB', light: '#60A5FA' },
    secondary:  { main: '#10B981' },
    background: { default: '#0F1117', paper: '#1A1D27' },
    text:       { primary: '#E5E7EB', secondary: '#9CA3AF' },
    divider:    '#374151',
  },
  typography: TYPOGRAPHY,
  components: {
    ...COMPONENT_OVERRIDES,
    MuiCard: { styleOverrides: { root: { borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' } } },
  },
});

export function getTheme(mode: 'light' | 'dark') {
  return mode === 'dark' ? darkTheme : lightTheme;
}
