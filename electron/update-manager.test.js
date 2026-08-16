/**
 * Unit tests for the auto-update manager.
 *
 * The real electron-updater is mocked at module level (it can't run outside a
 * packaged Electron app); the tests inject a controllable fake updater to drive
 * the full event lifecycle. The packaged/dev branch is toggled via the
 * injectable `isPackaged` option (the electron app mock is shared/destructured,
 * so mutating it would not be visible to the module under test).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock electron-updater BEFORE importing the module under test.
vi.mock('electron-updater', () => ({ autoUpdater: {} }));

import UpdateManager from './update-manager.js';

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = null;
    this.autoInstallOnAppQuit = null;
    this.logger = null;
    this.checkCalls = 0;
  }
  async checkForUpdates() {
    this.checkCalls += 1;
    return { updateInfo: { version: '9.9.9' } };
  }
}

function makeManager(overrides = {}) {
  const updater = new FakeUpdater();
  const notify = vi.fn();
  const manager = new UpdateManager({
    updater,
    notify,
    isPackaged: true,
    checkDelayMs: 1000,
    checkIntervalMs: 60 * 1000,
    ...overrides,
  });
  return { manager, updater, notify };
}

describe('UpdateManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is disabled in dev (unpackaged) and never starts timers or checks', () => {
    const { manager, updater } = makeManager({ isPackaged: false });
    const started = manager.start();
    expect(started).toBe(false);
    expect(manager._enabled).toBe(false);
    expect(updater.checkCalls).toBe(0);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(updater.checkCalls).toBe(0);
  });

  it('enables and schedules a delayed first check plus periodic re-checks', async () => {
    const { manager, updater } = makeManager();
    expect(manager.start()).toBe(true);
    expect(manager._enabled).toBe(true);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.logger).toBeTruthy();

    vi.advanceTimersByTime(999);
    expect(updater.checkCalls).toBe(0);
    vi.advanceTimersByTime(1); // fires the delayed first check
    expect(updater.checkCalls).toBe(1);
    await Promise.resolve(); // let the async first check settle before advancing

    vi.advanceTimersByTime(60 * 1000); // periodic interval
    expect(updater.checkCalls).toBe(2);

    manager.stop();
  });

  it('downloads automatically and notifies on update-downloaded', async () => {
    const { manager, updater, notify } = makeManager();
    manager.start();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(updater.checkCalls).toBe(1);

    updater.emit('update-available', { version: '9.9.9' });
    updater.emit('update-downloaded', { version: '9.9.9' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain('Update Ready');
    manager.stop();
  });

  it('does not notify on a silent no-update periodic check', async () => {
    const { manager, updater, notify } = makeManager();
    manager.start();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    updater.emit('update-not-available', { version: '3.7.0' });
    expect(notify).not.toHaveBeenCalled();
    manager.stop();
  });

  it('clears the checking flag on updater errors and re-checks are possible', async () => {
    const { manager, updater } = makeManager();
    manager.start();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    updater.emit('error', new Error('offline'));
    expect(manager._checking).toBe(false);

    // A later manual check still works after an error.
    const result = await manager.checkForUpdates({ silent: true });
    expect(result.checking).toBe(false);
    expect(updater.checkCalls).toBe(2);
    manager.stop();
  });

  it('manual checkForUpdates returns a status object and never rejects', async () => {
    const { manager } = makeManager({ isPackaged: false });
    const devResult = await manager.checkForUpdates({ silent: true });
    expect(devResult).toEqual({ enabled: false, checking: false, message: expect.stringContaining('development') });

    // A manual check with no updater-enabled manager returns a status, not a throw.
    const { manager: enabled } = makeManager();
    enabled.start();
    const result = await enabled.checkForUpdates({ silent: true });
    expect(result.enabled).toBe(true);
    enabled.stop();
  });

  it('a non-silent failed check notifies the user and stays re-checkable', async () => {
    const { manager, updater, notify } = makeManager();
    updater.checkForUpdates = async () => {
      updater.checkCalls += 1;
      throw new Error('offline');
    };
    manager.start();

    const result = await manager.checkForUpdates({ silent: false });

    expect(result.message).toMatch(/failed/);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain('Update Check');
    // The failure must not wedge the manager: a subsequent check is allowed.
    const again = await manager.checkForUpdates({ silent: true });
    expect(again.checking).toBe(false);
    expect(updater.checkCalls).toBe(2);
    manager.stop();
  });

  it('start() is idempotent', () => {
    const { manager, updater } = makeManager();
    expect(manager.start()).toBe(true);
    expect(manager.start()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(updater.checkCalls).toBe(1); // scheduled only once
    manager.stop();
  });

  it('stop() cancels pending timers', () => {
    const { manager, updater } = makeManager();
    manager.start();
    manager.stop();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(updater.checkCalls).toBe(0);
  });
});
