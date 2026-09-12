/*
ColorModeContext — the SINGLE owner of the app's light/dark mode.

Bug this replaces: useColorMode was a local-useState hook, so every consumer
(App's theme, the Topbar moon button, the Settings toggle) held its own
private copy of the mode. The Settings toggle flipped its own copy and wrote
localStorage, but the theme never re-rendered — so the toggle visibly did
nothing. The mode now lives in one provider; every consumer reads and flips
the same state.
*/

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'cg-color-mode';

function getInitialMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* localStorage unavailable (private browsing) */ }
  try {
    // jsdom and some webviews don't implement matchMedia — default to light.
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch { /* ignore */ }
  return 'light';
}

interface ColorModeContextValue {
  mode: ColorMode;
  toggle: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export const ColorModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ColorMode>(getInitialMode);

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
};

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) {
    throw new Error('useColorMode must be used within <ColorModeProvider>');
  }
  return ctx;
}
