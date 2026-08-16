import { describe, it, expect, beforeEach } from 'vitest';
import registerWindowsHandlers from './windows';

// Require the mock file directly — the preload interception (and the
// resolve.alias) hand the module under test this same CJS cache entry, so
// ipcMain here is the same object windows.js registers handlers on.
const { ipcMain } = require('../../__mocks__/electron.js');

// The platform guards in windows.js read process.platform at call time.
// These tests pin the NON-Windows branch, so force the platform for the
// duration of the call on every host (Windows and Linux alike) and restore it
// afterwards — otherwise the suite can only pass on non-Windows runners.
async function withNonWindowsPlatform(fn) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    return await fn();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
    else delete process.platform;
  }
}

describe('registerWindowsHandlers', () => {
  beforeEach(() => {
    ipcMain.registeredHandlers = {};
    registerWindowsHandlers();
  });

  it('registers all three windowsAPI channels', () => {
    expect(typeof ipcMain.registeredHandlers['get-event-logs']).toBe('function');
    expect(typeof ipcMain.registeredHandlers['get-services']).toBe('function');
    expect(typeof ipcMain.registeredHandlers['get-firewall-status']).toBe('function');
  });

  it('rejects event-log names outside the allowlist', async () => {
    const handler = ipcMain.registeredHandlers['get-event-logs'];
    const result = await handler(null, 'HKEY_LOCAL_MACHINE', 50);
    expect(result.error).toMatch(/Invalid log name/);
    expect(result.error).toContain('Security');
  });

  it('does not reject allowlisted log names even with out-of-range limits', async () => {
    // The limit is clamped to 1..1000, so neither a huge nor a zero limit
    // produces a validation error — the query proceeds to the platform guard.
    await withNonWindowsPlatform(async () => {
      const handler = ipcMain.registeredHandlers['get-event-logs'];
      const huge = await handler(null, 'Security', 50000);
      const zero = await handler(null, 'System', 0);
      expect(huge.error).toMatch(/only available on Windows/);
      expect(zero.error).toMatch(/only available on Windows/);
    });
  });

  it('returns a Windows-only error for services/firewall on non-Windows hosts', async () => {
    // The handlers must fail gracefully on non-Windows hosts rather than
    // executing Windows-only shell commands — pinned on every platform.
    await withNonWindowsPlatform(async () => {
      const services = await ipcMain.registeredHandlers['get-services']();
      const firewall = await ipcMain.registeredHandlers['get-firewall-status']();
      expect(services.error).toMatch(/only available on Windows/);
      expect(firewall.error).toMatch(/only available on Windows/);
    });
  });
});
