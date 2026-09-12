/*
Tests for the shared color-mode store.

Regression context: useColorMode used to be a local-useState hook, so the
Settings dark-mode toggle held its own private copy of the mode — flipping it
updated localStorage but never the app theme. These tests pin the provider
contract, including the cross-surface sync that was broken.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook, act as hookAct } from '@testing-library/react';
import React from 'react';
import { ColorModeProvider, useColorMode } from '../contexts/ColorModeContext';

function renderWithProvider(ui: React.ReactElement) {
  return render(<ColorModeProvider>{ui}</ColorModeProvider>);
}

function ToggleProbe(): React.ReactElement {
  const { mode, toggle } = useColorMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button data-testid="flip" onClick={toggle}>flip</button>
    </div>
  );
}

describe('ColorModeProvider (shared light/dark mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  });

  afterEach(() => vi.restoreAllMocks());

  it('defaults to light when no stored pref and system is light', () => {
    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    expect(result.current.mode).toBe('light');
  });

  it('defaults to dark when system prefers dark and nothing stored', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    expect(result.current.mode).toBe('dark');
  });

  it('reads stored dark preference from localStorage', () => {
    localStorage.setItem('cg-color-mode', 'dark');
    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    expect(result.current.mode).toBe('dark');
  });

  it('reads stored light preference from localStorage', () => {
    localStorage.setItem('cg-color-mode', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    expect(result.current.mode).toBe('light');
  });

  it('toggle switches from light to dark', () => {
    localStorage.setItem('cg-color-mode', 'light');
    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    hookAct(() => result.current.toggle());
    expect(result.current.mode).toBe('dark');
  });

  it('toggle writes new value to localStorage', () => {
    localStorage.setItem('cg-color-mode', 'light');
    const { result } = renderHook(() => useColorMode(), { wrapper: ColorModeProvider });
    hookAct(() => result.current.toggle());
    expect(localStorage.getItem('cg-color-mode')).toBe('dark');
  });

  it('ALL consumers share one state — a toggle from one surface re-renders the others', () => {
    // The exact bug: two surfaces each held their own copy. Simulate the two
    // real surfaces (Topbar + Settings) with two consumers of the same store.
    renderWithProvider(
      <div>
        <ToggleProbe />
        <ToggleProbe />
      </div>
    );

    const modes = screen.getAllByTestId('mode');
    const buttons = screen.getAllByTestId('flip');
    expect(modes[0].textContent).toBe('light');
    expect(modes[1].textContent).toBe('light');

    act(() => {
      buttons[1].click(); // "Settings" surface flips
    });

    // The "Topbar" surface sees the change — same single state.
    expect(modes[0].textContent).toBe('dark');
    expect(modes[1].textContent).toBe('dark');
    expect(localStorage.getItem('cg-color-mode')).toBe('dark');
  });

  it('initializes once — a later localStorage write does not reset consumers', () => {
    localStorage.setItem('cg-color-mode', 'light');
    renderWithProvider(<ToggleProbe />);
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });
});
