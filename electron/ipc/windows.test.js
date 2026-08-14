import { describe, it, expect, beforeEach } from 'vitest';
import registerWindowsHandlers from './windows';

// Require the mock file directly — the preload interception (and the
// resolve.alias) hand the module under test this same CJS cache entry, so
// ipcMain here is the same object windows.js registers handlers on.
const { ipcMain } = require('../../__mocks__/electron.js');

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
    const handler = ipcMain.registeredHandlers['get-event-logs'];
    const huge = await handler(null, 'Security', 50000);
    const zero = await handler(null, 'System', 0);
    expect(huge.error).toMatch(/only available on Windows/);
    expect(zero.error).toMatch(/only available on Windows/);
  });

  it('returns a Windows-only error for services/firewall on non-Windows hosts', async () => {
    // The CI/local test host is linux; the handlers must fail gracefully there
    // rather than executing Windows-only shell commands.
    const services = await ipcMain.registeredHandlers['get-services']();
    const firewall = await ipcMain.registeredHandlers['get-firewall-status']();
    expect(services.error).toMatch(/only available on Windows/);
    expect(firewall.error).toMatch(/only available on Windows/);
  });
});
