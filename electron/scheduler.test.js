import { describe, it, expect, vi, beforeEach } from 'vitest';

// electron is stubbed via preload (vitest.electron.preload.cjs) and resolve.alias,
// both pointing to __mocks__/electron.js — same CJS cache entry as scheduler.js uses.

vi.mock('./logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

// The scheduler runs the real platform collector on the host machine. These
// tests exercise scheduler logic (due-date handling, result persistence) — not
// collection — so mock the collector to keep checkAndRun hermetic and fast on
// every platform. The real Windows/macOS/Linux collectors have their own suites.
vi.mock('./system/collector', () => ({
  collectEvidence: vi.fn().mockResolvedValue({}),
}));

import { calcNextRunAt, checkAndRun, start } from './scheduler.js';

const makeDb = (overrides = {}) => ({
  ensureScheduleTask: vi.fn().mockResolvedValue(undefined),
  getScheduleTask: vi.fn().mockResolvedValue({
    task_name: 'auto_evidence_collection',
    schedule_config_json: JSON.stringify({ enabled: true, frequency: 'daily', time: '09:00' }),
    next_run_at: new Date(Date.now() - 1000).toISOString(),
    last_run_at: null,
    last_result_json: null,
  }),
  updateScheduleConfig: vi.fn().mockResolvedValue(undefined),
  updateScheduleResult: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('collector wiring (platform routing)', () => {
  it('uses the platform-aware collector, not the Windows-only collector', () => {
    // Regression: scheduler must collect via system/collector (which routes to
    // macOS/Windows), else scheduled macOS runs produce empty evidence.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
    expect(src).toMatch(/require\(['"]\.\/system\/collector['"]\)/);
    expect(src).not.toContain('collectWindowsEvidence');
  });
});

describe('calcNextRunAt', () => {
  it('returns a future time for daily frequency', () => {
    const result = calcNextRunAt({ frequency: 'daily', time: '09:00' });
    expect(new Date(result) > new Date()).toBe(true);
  });

  it('calculates correct hours and minutes for daily', () => {
    const result = calcNextRunAt({ frequency: 'daily', time: '14:30' });
    const next = new Date(result);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
  });

  it('returns next Monday for weekly frequency', () => {
    const result = calcNextRunAt({ frequency: 'weekly', time: '08:00' });
    const next = new Date(result);
    expect(next.getDay()).toBe(1);
    expect(next > new Date()).toBe(true);
  });

  it('returns an ISO string', () => {
    const result = calcNextRunAt({ frequency: 'daily', time: '09:00' });
    expect(typeof result).toBe('string');
    expect(() => new Date(result)).not.toThrow();
  });
});

describe('checkAndRun', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not run when enabled is false', async () => {
    const db = makeDb({
      getScheduleTask: vi.fn().mockResolvedValue({
        schedule_config_json: JSON.stringify({ enabled: false, frequency: 'daily', time: '09:00' }),
        next_run_at: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    const processor = { processWindowsEvidence: vi.fn().mockResolvedValue([]) };
    await start(db, processor);
    await checkAndRun();
    expect(db.updateScheduleResult).not.toHaveBeenCalled();
  });

  it('does not run when next_run_at is in the future', async () => {
    const db = makeDb({
      getScheduleTask: vi.fn().mockResolvedValue({
        schedule_config_json: JSON.stringify({ enabled: true, frequency: 'daily', time: '09:00' }),
        next_run_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    const processor = { processWindowsEvidence: vi.fn().mockResolvedValue([]) };
    await start(db, processor);
    await checkAndRun();
    expect(db.updateScheduleResult).not.toHaveBeenCalled();
  });

  it('calls updateScheduleResult with success:true when run is due', async () => {
    const processor = { processWindowsEvidence: vi.fn().mockResolvedValue([{}, {}]) };
    const db = makeDb();
    await start(db, processor);
    await checkAndRun();
    expect(db.updateScheduleResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ success: true }),
    );
  });

  it('calls updateScheduleResult with success:false when collection throws', async () => {
    const processor = {
      processWindowsEvidence: vi.fn().mockRejectedValue(new Error('WMI timeout')),
    };
    const db = makeDb();
    await start(db, processor);
    await checkAndRun();
    expect(db.updateScheduleResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ success: false, error: 'WMI timeout' }),
    );
  });
});

describe('start', () => {
  let onSpy;

  beforeEach(() => {
    const { powerMonitor } = require('../__mocks__/electron.js');
    onSpy = vi.spyOn(powerMonitor, 'on');
  });

  afterEach(() => vi.restoreAllMocks());

  it('calls ensureScheduleTask on startup', async () => {
    const db = makeDb();
    await start(db, { processWindowsEvidence: vi.fn() });
    expect(db.ensureScheduleTask).toHaveBeenCalled();
  });

  it('registers powerMonitor resume handler', async () => {
    const db = makeDb();
    await start(db, { processWindowsEvidence: vi.fn() });
    expect(onSpy).toHaveBeenCalledWith('resume', expect.any(Function));
  });
});
