/*
ComplianceGuard design system — single source of truth.

Language principles
- One semantic color language: success / warning / error / info / neutral. A
  status means the same color everywhere (no #34c759 next to #66BB6A next to
  #16A34A meaning "green").
  Each tone is a triple:  main (accent / signal), light (tinted surface used
  behind chips/rows), dark (text that sits ON that surface).
- Radius system:  sm 6 (buttons, inputs, chips, control rows) / md 8 (cards,
  papers, panels) / lg 12 (large page panels, dialogs) / pill 999 (badges).
- Flat primary. Gradients are not the default UI treatment anywhere.
- Typography floor: real UI content is never below ~12px; micro-labels are an
  exception, not the default.

Components MUST consume these tokens via useTheme() / theme.palette. Hard-coded
hexes for semantic meaning are a regression.
*/

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { alpha, createTheme, Theme } from '@mui/material/styles';

// ---- Geometry -------------------------------------------------------------

export const RADIUS = {
  sm: '6px', // controls: buttons, inputs, chips, accordion summaries, control rows
  md: '8px', // cards / papers
  lg: '12px', // large page panels (history, heatmap, dialogs)
  pill: '999px',
} as const;

/**
 * NOTE: these MUST stay string values, not numbers. MUI's sx-prop path
 * multiplies numeric border-radius by theme.shape.borderRadius (default 4),
 * so sx={{ borderRadius: 12 }} silently renders 48px. Strings pass through
 * unchanged on both the sx path and styleOverrides.
 */

export const CONTROL_HEIGHT = 34;

// ---- Compliance score scale -------------------------------------------------
// One canonical 0-100 readiness scale for EVERY surface that renders a score
// band (hero status chip, trend chart zones, history list tones).
// These thresholds mirror the trend chart's zone bands (≥85 good, ≥70 on
// track, <70 attention) so a score means the same thing everywhere.

export const SCORE_BAND_GOOD = 85;
export const SCORE_BAND_ON_TRACK = 70;

export type ScoreBand = 'good' | 'on_track' | 'attention';

/** Classify a 0-100 score into the canonical readiness band. */
export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BAND_GOOD) return 'good';
  if (score >= SCORE_BAND_ON_TRACK) return 'on_track';
  return 'attention';
}

export const SCORE_BAND_TONE: Record<ScoreBand, Tone> = {
  good: 'success',
  on_track: 'warning',
  attention: 'error',
};

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  good: 'GOOD STANDING',
  on_track: 'ON TRACK',
  attention: 'NEEDS ATTENTION',
};

// ---- Semantic tones -------------------------------------------------------

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface ToneColors {
  /** Accent / signal color (bars, icons, numerals, active text). */
  main: string;
  /** Tinted surface for chip / row backgrounds. */
  surface: string;
  /** Text color that is legible on `surface`. */
  onSurface: string;
  /** Hairline border derived from the tone. */
  border: string;
}

/** Resolve a semantic tone to concrete colors for the active mode. */
export function toneColors(theme: Theme, tone: Tone): ToneColors {
  const p = theme.palette;
  if (tone === 'neutral') {
    const light = p.mode === 'light';
    return {
      main: p.text.secondary,
      surface: light ? '#F1F5F9' : 'rgba(255,255,255,0.06)',
      onSurface: p.text.secondary,
      border: p.divider,
    };
  }
  const c = p[tone];
  return {
    main: c.main,
    surface: c.light,
    onSurface: c.dark,
    border: alpha(c.main, p.mode === 'light' ? 0.35 : 0.45),
  };
}

// ---- Typography ------------------------------------------------------------

const TYPOGRAPHY = {
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  // Page titles — always used via component="h1" + PageHeader
  h1: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.25 },
  h2: { fontSize: '1.25rem', fontWeight: 650, letterSpacing: '-0.4px', lineHeight: 1.3 },
  h3: { fontSize: '1.125rem', fontWeight: 650, letterSpacing: '-0.3px', lineHeight: 1.35 },
  h4: { fontSize: '1rem', fontWeight: 650, letterSpacing: '-0.2px', lineHeight: 1.4 },
  h5: { fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.2px', lineHeight: 1.4 },
  h6: { fontSize: '0.9rem', fontWeight: 600, letterSpacing: '-0.1px', lineHeight: 1.45 },
  subtitle1: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.5 },
  subtitle2: { fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.5 },
  body1: { fontSize: '0.875rem', lineHeight: 1.6 },
  body2: { fontSize: '0.8125rem', lineHeight: 1.6 },
  caption: { fontSize: '0.75rem', lineHeight: 1.5 },
  button: { fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0px', textTransform: 'none' as const },
  overline: { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.8px' },
};

// ---- Component overrides ----------------------------------------------------

function makeComponents(mode: 'light' | 'dark') {
  const light = mode === 'light';
  const canvas = light ? '#F8FAFC' : '#0F1117';
  const divider = light ? '#E2E8F0' : 'rgba(255,255,255,0.08)';
  const border = light ? '#E2E8F0' : 'rgba(255,255,255,0.10)';

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: canvas },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          backgroundImage: 'none',
          border: `1px solid ${border}`,
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: RADIUS.md },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.sm,
          height: CONTROL_HEIGHT,
          minHeight: CONTROL_HEIGHT,
          fontSize: '0.8125rem',
          fontWeight: 600,
          letterSpacing: '0px',
          textTransform: 'none' as const,
        },
        // Flat, confident primary — the default is never a gradient.
        contained: {
          background: '#2563EB',
          boxShadow: 'none',
          '&:hover': {
            background: '#1D4ED8',
            boxShadow: light ? '0 1px 2px rgba(15,23,42,0.08)' : '0 1px 2px rgba(0,0,0,0.4)',
          },
          '&:active': { background: '#1E40AF' },
        },
        outlined: {
          borderColor: divider,
          '&:hover': {
            borderColor: light ? '#CBD5E1' : 'rgba(255,255,255,0.25)',
            backgroundColor: light ? '#F8FAFC' : 'rgba(255,255,255,0.04)',
          },
        },
        text: {
          '&:hover': { backgroundColor: light ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.06)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: RADIUS.sm, fontSize: '0.75rem', fontWeight: 600 },
        outlined: { borderColor: divider },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.sm,
          fontSize: '0.875rem',
          backgroundColor: light ? '#FFFFFF' : 'rgba(255,255,255,0.02)',
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
            boxShadow: 'none',
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontSize: '0.875rem' },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { fontSize: '0.875rem' },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: '0.875rem' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 600,
          fontSize: '0.85rem',
          letterSpacing: '0px',
          minHeight: 44,
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.sm,
          border: `1px solid ${divider}`,
          boxShadow: 'none',
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0, borderColor: light ? '#CBD5E1' : 'rgba(255,255,255,0.16)' },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: RADIUS.lg },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: RADIUS.md },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.pill,
          backgroundColor: light ? '#EEF2F7' : 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { borderRadius: RADIUS.pill },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: divider },
      },
    },
  };
}

// ---- Palettes ----------------------------------------------------------------

const lightPalette = {
  mode: 'light' as const,
  primary: { main: '#2563EB', dark: '#1E40AF' },
  success: { main: '#059669', light: '#D1FAE5', dark: '#065F46' },
  warning: { main: '#D97706', light: '#FEF3C7', dark: '#92400E' },
  error: { main: '#DC2626', light: '#FEE2E2', dark: '#991B1B' },
  info: { main: '#2563EB', light: '#EFF6FF', dark: '#1E40AF' },
  background: { default: '#F8FAFC', paper: '#FFFFFF' },
  text: { primary: '#0F172A', secondary: '#475569', disabled: '#94A3B8' },
  divider: '#E2E8F0',
};

const darkPalette = {
  mode: 'dark' as const,
  primary: { main: '#60A5FA', dark: '#2563EB' },
  success: { main: '#34D399', light: '#064E3B', dark: '#6EE7B7' },
  warning: { main: '#FBBF24', light: '#451A03', dark: '#FCD34D' },
  error: { main: '#F87171', light: '#450A0A', dark: '#FCA5A5' },
  info: { main: '#60A5FA', light: '#1E2A4A', dark: '#93C5FD' },
  background: { default: '#0F1117', paper: '#1C1F2E' },
  text: { primary: '#E2E8F0', secondary: '#94A3B8', disabled: '#64748B' },
  divider: 'rgba(255,255,255,0.08)',
};

export const lightTheme = createTheme({
  palette: lightPalette,
  typography: TYPOGRAPHY,
  components: makeComponents('light'),
});

export const darkTheme = createTheme({
  palette: darkPalette,
  typography: TYPOGRAPHY,
  components: makeComponents('dark'),
});

export function getTheme(mode: 'light' | 'dark') {
  return mode === 'dark' ? darkTheme : lightTheme;
}
