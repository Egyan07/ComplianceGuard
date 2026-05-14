import { useState, useCallback } from 'react';

type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'cg-color-mode';

function getInitialMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useColorMode() {
  const [mode, setMode] = useState<ColorMode>(getInitialMode);

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  return { mode, toggle };
}
