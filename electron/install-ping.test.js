import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildPayload,
  getInstallId,
  isEnabled,
  maybePing,
  readState,
  send,
} from './install-ping.js';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ping-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const ENV = {
  CG_TELEMETRY_ENABLED: '1',
  CG_TELEMETRY_URL: 'https://example.test/install',
};

function okFetch() {
  return vi.fn(async () => ({ ok: true, status: 204 }));
}

describe('isEnabled', () => {
  it('is off unless the flag is exactly 1', () => {
    expect(isEnabled({})).toBe(false);
    expect(isEnabled({ CG_TELEMETRY_ENABLED: 'true', CG_TELEMETRY_URL: ENV.CG_TELEMETRY_URL })).toBe(false);
    expect(isEnabled({ CG_TELEMETRY_ENABLED: '1' })).toBe(false);
  });

  it('refuses a non-https endpoint rather than downgrading', () => {
    expect(isEnabled({ CG_TELEMETRY_ENABLED: '1', CG_TELEMETRY_URL: 'http://example.test/x' })).toBe(false);
    expect(isEnabled(ENV)).toBe(true);
  });
});

describe('install id', () => {
  it('is created once and reused', () => {
    const first = getInstallId(dir);
    const second = getInstallId(dir);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });

  it('lives in its own file and contains no machine identifiers', () => {
    const id = getInstallId(dir);
    const raw = fs.readFileSync(path.join(dir, 'install-id.json'), 'utf8');
    expect(raw).toContain(id);
    expect(raw).not.toContain(os.hostname());
    expect(raw).not.toContain(os.userInfo().username);
  });
});

describe('payload', () => {
  it('carries only the five agreed fields', () => {
    const payload = buildPayload({
      installId: 'abc',
      appVersion: '4.3.1',
      platform: 'win32',
      arch: 'x64',
      firstPing: true,
    });
    expect(Object.keys(payload).sort()).toEqual(
      ['appVersion', 'arch', 'firstPing', 'installId', 'platform'].sort()
    );
  });

  it('never includes hostname, username or paths', () => {
    const payload = JSON.stringify(
      buildPayload({ installId: 'abc', appVersion: '4.3.1', platform: 'linux', arch: 'arm64' })
    );
    expect(payload).not.toContain(os.hostname());
    expect(payload).not.toContain(os.userInfo().username);
    expect(payload).not.toContain(dir);
  });
});

describe('maybePing', () => {
  it('sends nothing when disabled, and never calls fetch', async () => {
    const fetchImpl = okFetch();
    const res = await maybePing({ dir, env: {}, fetchImpl, appVersion: '4.3.1' });
    expect(res).toEqual({ sent: false, reason: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends once, then throttles inside the interval', async () => {
    const fetchImpl = okFetch();
    const first = await maybePing({ dir, env: ENV, fetchImpl, appVersion: '4.3.1', now: () => 1000 });
    expect(first).toEqual({ sent: true, reason: 'sent' });

    const second = await maybePing({ dir, env: ENV, fetchImpl, appVersion: '4.3.1', now: () => 2000 });
    expect(second).toEqual({ sent: false, reason: 'throttled' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends again once the interval has passed', async () => {
    const fetchImpl = okFetch();
    await maybePing({ dir, env: ENV, fetchImpl, now: () => 0 });
    const later = await maybePing({ dir, env: ENV, fetchImpl, now: () => 25 * 60 * 60 * 1000 });
    expect(later.sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('marks the first ping as firstPing and later ones as not', async () => {
    const fetchImpl = okFetch();
    await maybePing({ dir, env: ENV, fetchImpl, now: () => 0 });
    const firstBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    await maybePing({ dir, env: ENV, fetchImpl, now: () => 25 * 60 * 60 * 1000 });
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(firstBody.firstPing).toBe(true);
    expect(secondBody.firstPing).toBe(false);
  });

  it('does not throw or record state when the send fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }));
    const res = await maybePing({ dir, env: ENV, fetchImpl, now: () => 1000 });
    expect(res).toEqual({ sent: false, reason: 'failed' });
    expect(readState(dir).count).toBe(0);
  });

  it('survives a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const res = await maybePing({ dir, env: ENV, fetchImpl });
    expect(res.sent).toBe(false);
  });
});

describe('send', () => {
  it('returns false on a rejection instead of propagating', async () => {
    const ok = await send({ a: 1 }, { endpoint: ENV.CG_TELEMETRY_URL, fetchImpl: async () => { throw new Error('nope'); } });
    expect(ok).toBe(false);
  });

  it('returns true on 2xx', async () => {
    const ok = await send({ a: 1 }, { endpoint: ENV.CG_TELEMETRY_URL, fetchImpl: async () => ({ ok: true }) });
    expect(ok).toBe(true);
  });
});
