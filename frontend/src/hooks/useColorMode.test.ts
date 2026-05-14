import { renderHook, act } from '@testing-library/react';
import { useColorMode } from './useColorMode';

describe('useColorMode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  });

  afterEach(() => vi.restoreAllMocks());

  it('defaults to light when no stored pref and system is light', () => {
    const { result } = renderHook(() => useColorMode());
    expect(result.current.mode).toBe('light');
  });

  it('defaults to dark when system prefers dark and nothing stored', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { result } = renderHook(() => useColorMode());
    expect(result.current.mode).toBe('dark');
  });

  it('reads stored dark preference from localStorage', () => {
    localStorage.setItem('cg-color-mode', 'dark');
    const { result } = renderHook(() => useColorMode());
    expect(result.current.mode).toBe('dark');
  });

  it('reads stored light preference from localStorage', () => {
    localStorage.setItem('cg-color-mode', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { result } = renderHook(() => useColorMode());
    expect(result.current.mode).toBe('light');
  });

  it('toggle switches from light to dark', () => {
    localStorage.setItem('cg-color-mode', 'light');
    const { result } = renderHook(() => useColorMode());
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('dark');
  });

  it('toggle writes new value to localStorage', () => {
    localStorage.setItem('cg-color-mode', 'light');
    const { result } = renderHook(() => useColorMode());
    act(() => result.current.toggle());
    expect(localStorage.getItem('cg-color-mode')).toBe('dark');
  });
});
