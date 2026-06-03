import { describe, it, expect, vi } from 'vitest';

// Mock both platform collectors before importing collector
vi.mock('./system/windows.js', () => ({
  collectWindowsEvidence: vi.fn().mockResolvedValue({ platform: 'windows' }),
}));
vi.mock('./system/macos.js', () => ({
  collectMacOSEvidence: vi.fn().mockResolvedValue({ platform: 'macos' }),
}));

// Import after mocks are set up
const { collectEvidence } = await import('./system/collector.js');
const { collectWindowsEvidence } = await import('./system/windows.js');
const { collectMacOSEvidence } = await import('./system/macos.js');

describe('collector — platform dispatch', () => {
  it('calls collectMacOSEvidence on darwin', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    const result = await collectEvidence();
    expect(collectMacOSEvidence).toHaveBeenCalledOnce();
    expect(result.platform).toBe('macos');
    vi.unstubAllGlobals();
  });

  it('calls collectWindowsEvidence on win32', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    await collectEvidence();
    expect(collectWindowsEvidence).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('passes return value from active collector unchanged', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    const result = await collectEvidence();
    expect(result).toEqual({ platform: 'macos' });
    vi.unstubAllGlobals();
  });
});
