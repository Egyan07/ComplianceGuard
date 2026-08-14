/**
 * Typed access to the Electron preload bridge (`window.electronAPI`).
 *
 * The bridge's narrow type surface is declared in `types/electron.d.ts`;
 * components should use `getElectronAPI()` here instead of casting
 * `window` to `any`, so the IPC boundary stays fully typed.
 */

import type { ElectronAPI } from '../types/electron';

/**
 * True when running inside the Electron desktop shell (the preload script
 * exposed the bridge). Evaluated at call time so test mocks that toggle
 * `window.electronAPI` mid-test keep working.
 */
export function isElectronMode(): boolean {
  return !!window.electronAPI;
}

/**
 * Returns the typed Electron preload bridge. Throws when not running in
 * Electron — callers must guard with `isElectronMode()` first.
 */
export function getElectronAPI(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error('Electron API not available — running in web mode?');
  }
  return window.electronAPI;
}
