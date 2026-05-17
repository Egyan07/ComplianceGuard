import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { createTheme } from '@mui/material/styles';

const TYPOGRAPHY = {
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  h4: { fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.6px', lineHeight: 1.2 },
  h5: { fontWeight: 650, fontSize: '1.15rem', letterSpacing: '-0.4px', lineHeight: 1.3 },
  h6: { fontWeight: 600, fontSize: '0.95rem', letterSpacing: '-0.2px', lineHeight: 1.4 },
  body1: { fontSize: '0.875rem', lineHeight: 1.6 },
  body2: { fontSize: '0.8rem', lineHeight: 1.55 },
  caption: { fontSize: '0.7rem', letterSpacing: '0.15px', lineHeight: 1.4 },
  button: { fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1px', textTransform: 'none' as const },
  overline: { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px' },
};

function makeComponents(mode: 'light' | 'dark') {
  const light = mode === 'light';
  return {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundImage: 'none',
          ...(light
            ? { border: '1px solid #E2E8F0', boxShadow: 'none' }
            : { border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 1px 6px rgba(0,0,0,0.35)' }
          ),
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 8, transition: 'border-color 0.15s, box-shadow 0.15s' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          height: 34,
          fontSize: '0.8rem',
          fontWeight: 600,
          letterSpacing: '0.1px',
          textTransform: 'none' as const,
          minHeight: 34,
        },
        contained: {
          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
            boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
          },
        },
        outlined: {
          borderColor: light ? '#E2E8F0' : 'rgba(255,255,255,0.15)',
          '&:hover': {
            borderColor: light ? '#CBD5E1' : 'rgba(255,255,255,0.25)',
            backgroundColor: light ? '#F8FAFC' : 'rgba(255,255,255,0.04)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          fontSize: '0.875rem',
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
            boxShadow: 'none',
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: light ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
        },
      },
    },
  };
}

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary:    { main: '#2563EB', dark: '#1E40AF', light: '#3B82F6' },
    secondary:  { main: '#10B981', dark: '#059669' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text:       { primary: '#0F172A', secondary: '#64748B', disabled: '#94A3B8' },
    divider:    '#E2E8F0',
    success:    { main: '#10B981', light: '#D1FAE5', dark: '#065F46' },
    warning:    { main: '#F59E0B', light: '#FEF3C7', dark: '#92400E' },
    error:      { main: '#EF4444', light: '#FEE2E2', dark: '#991B1B' },
  },
  typography: TYPOGRAPHY,
  components: makeComponents('light'),
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#3B82F6', dark: '#2563EB', light: '#60A5FA' },
    secondary:  { main: '#10B981', dark: '#059669' },
    background: { default: '#0F1117', paper: '#1C1F2E' },
    text:       { primary: '#E2E8F0', secondary: '#94A3B8', disabled: '#475569' },
    divider:    'rgba(255,255,255,0.08)',
    success:    { main: '#10B981', light: '#064E3B', dark: '#6EE7B7' },
    warning:    { main: '#F59E0B', light: '#451A03', dark: '#FCD34D' },
    error:      { main: '#EF4444', light: '#450A0A', dark: '#FCA5A5' },
  },
  typography: TYPOGRAPHY,
  components: makeComponents('dark'),
});

export function getTheme(mode: 'light' | 'dark') {
  return mode === 'dark' ? darkTheme : lightTheme;
}
