/**
 * Narrow type surface for the Electron preload bridge exposed on
 * `window.electronAPI`. The preload script lives at electron/preload.js and
 * exposes a broader set of IPCs; this file types only the subset consumed
 * by the React code so that `any` casts stay out of the renderer.
 *
 * If you add a new IPC channel in preload.js that the renderer calls, add
 * its signature here too.
 */

import type { LicenseInfo } from '../contexts/LicenseContext';

export interface ElectronLicenseAPI {
  getLicenseInfo: () => Promise<LicenseInfo>;
  activateLicense: (key: string) => Promise<{
    valid: boolean;
    error?: string;
    payload?: LicenseInfo;
    tier?: 'free' | 'pro' | 'enterprise';
  }>;
  deactivateLicense: () => Promise<void>;
  onLicenseChanged?: (handler: (info: LicenseInfo) => void) => (() => void) | undefined;
}

export interface ElectronAPI extends ElectronLicenseAPI {
  // Other IPCs exposed by electron/preload.js. Declared as `unknown` so
  // consumers that need them have to cast with a narrow helper rather than
  // sprinkling `any` everywhere.
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
