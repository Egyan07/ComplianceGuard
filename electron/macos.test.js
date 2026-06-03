import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process.exec so no real system calls happen
vi.mock('child_process', () => {
  const exec = vi.fn((cmd, opts, callback) => {
    // Handle both exec(cmd, callback) and exec(cmd, opts, callback)
    const cb = typeof opts === 'function' ? opts : callback;
    cb(null, { stdout: `mock: ${cmd}`.substring(0, 100), stderr: '' });
  });
  return { exec };
});

// Import after mock is registered
const { MacOSEvidenceCollector, collectMacOSEvidence } = await import('./system/macos.js');

describe('MacOSEvidenceCollector', () => {

  describe('collectAllEvidence — schema', () => {
    it('returns all 8 required bucket keys', async () => {
      const collector = new MacOSEvidenceCollector();
      const result = await collector.collectAllEvidence();
      const required = ['systemInfo', 'securitySettings', 'eventLogs', 'services',
                        'firewall', 'users', 'network', 'software', 'files'];
      for (const key of required) {
        expect(result).toHaveProperty(key);
      }
    });

    it('includes a timestamp', async () => {
      const collector = new MacOSEvidenceCollector();
      const result = await collector.collectAllEvidence();
      expect(result.timestamp).toBeTruthy();
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('isolates failures — one failed bucket does not affect others', async () => {
      const { exec } = await import('child_process');
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(new Error('command failed'));
      });
      const collector = new MacOSEvidenceCollector();
      const result = await collector.collectAllEvidence();
      // Should still have all keys (with error fields, not thrown)
      const dataKeys = Object.keys(result).filter(k => k !== 'timestamp');
      expect(dataKeys.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('collectSystemInfo', () => {
    beforeEach(() => {
      const { exec } = require('child_process');
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(null, { stdout: `mock: ${cmd}`, stderr: '' });
      });
    });

    it('calls sw_vers', async () => {
      const { exec } = await import('child_process');
      const collector = new MacOSEvidenceCollector();
      await collector.collectSystemInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('sw_vers'))).toBe(true);
    });

    it('calls uname -m for architecture', async () => {
      const { exec } = await import('child_process');
      const collector = new MacOSEvidenceCollector();
      await collector.collectSystemInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('uname -m'))).toBe(true);
    });
  });

  describe('collectSecuritySettings — SIP parsing', () => {
    it('parses enabled SIP correctly', async () => {
      const { exec } = await import('child_process');
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('csrutil')) {
          cb(null, { stdout: 'System Integrity Protection status: enabled.', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new MacOSEvidenceCollector();
      await collector.collectSecuritySettings();
      expect(collector.evidence.securitySettings.sipStatus).toBe('enabled');
    });

    it('parses disabled SIP correctly', async () => {
      const { exec } = await import('child_process');
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('csrutil')) {
          cb(null, { stdout: 'System Integrity Protection status: disabled.', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new MacOSEvidenceCollector();
      await collector.collectSecuritySettings();
      expect(collector.evidence.securitySettings.sipStatus).toBe('disabled');
    });

    it('returns unknown for VM or empty csrutil output', async () => {
      const { exec } = await import('child_process');
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('csrutil')) {
          cb(null, { stdout: 'unknown', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new MacOSEvidenceCollector();
      await collector.collectSecuritySettings();
      expect(collector.evidence.securitySettings.sipStatus).toBe('unknown');
    });

    it('stores warning (not error) when pwpolicy returns empty', async () => {
      const { exec } = await import('child_process');
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('pwpolicy')) {
          cb(null, { stdout: 'Getting global account policies\n', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new MacOSEvidenceCollector();
      await collector.collectSecuritySettings();
      expect(collector.evidence.securitySettings.passwordPolicy).toBe('unknown');
      expect(collector.evidence.securitySettings.warning).toContain('pwpolicy');
      expect(collector.evidence.securitySettings.error).toBeUndefined();
    });
  });

  describe('collectFirewallStatus', () => {
    it('calls socketfilterfw with full path — NOT bare command', async () => {
      const { exec } = await import('child_process');
      exec.mockClear();
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(null, { stdout: 'Firewall is enabled.', stderr: '' });
      });
      const collector = new MacOSEvidenceCollector();
      await collector.collectFirewallStatus();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd =>
        cmd.includes('/usr/libexec/ApplicationFirewall/socketfilterfw')
      )).toBe(true);
    });
  });

  describe('collectUserAccounts', () => {
    it('calls dscl to list human users', async () => {
      const { exec } = await import('child_process');
      exec.mockClear();
      const collector = new MacOSEvidenceCollector();
      await collector.collectUserAccounts();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('dscl') && cmd.includes('Users'))).toBe(true);
    });
  });

  describe('collectNetworkInfo', () => {
    it('calls ifconfig -a', async () => {
      const { exec } = await import('child_process');
      exec.mockClear();
      const collector = new MacOSEvidenceCollector();
      await collector.collectNetworkInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('ifconfig'))).toBe(true);
    });
  });

  describe('collectInstalledSoftware', () => {
    it('caps system_profiler at head -200', async () => {
      const { exec } = await import('child_process');
      exec.mockClear();
      const collector = new MacOSEvidenceCollector();
      await collector.collectInstalledSoftware();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd =>
        cmd.includes('system_profiler') && cmd.includes('head -200')
      )).toBe(true);
    });
  });

  describe('collectMacOSEvidence (module export)', () => {
    it('returns evidence with all required keys', async () => {
      const result = await collectMacOSEvidence();
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('systemInfo');
      expect(result).toHaveProperty('firewall');
    });
  });

});
