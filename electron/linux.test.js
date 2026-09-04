import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

// Mock child_process.exec so no real system calls happen (sync factory —
// proven pattern from macos.test.js)
vi.mock('child_process', () => {
  const exec = vi.fn((cmd, opts, callback) => {
    // Handle both exec(cmd, callback) and exec(cmd, opts, callback)
    const cb = typeof opts === 'function' ? opts : callback;
    cb(null, { stdout: `mock: ${cmd}`.substring(0, 100), stderr: '' });
  });
  return { exec };
});
const { exec } = await import('child_process');

// fs: spy on the real readFileSync, stubbing only specific paths. Stubbing the
// whole module breaks electron-log (logger) at import; an async importOriginal
// factory never reaches static default imports (vitest interop quirk).
const REAL_READ = fs.readFileSync.bind(fs);
let fsStubs = {};
if (!fs.readFileSync.mock) {
  vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) =>
    Object.prototype.hasOwnProperty.call(fsStubs, p) ? fsStubs[p] : REAL_READ(p, ...args)
  );
} else {
  fs.readFileSync.mockImplementation((p, ...args) =>
    Object.prototype.hasOwnProperty.call(fsStubs, p) ? fsStubs[p] : REAL_READ(p, ...args)
  );
}

// Import after mocks are registered
const { LinuxEvidenceCollector, collectLinuxEvidence } = await import('./system/linux.js');

function stubFile(path, content) {
  fsStubs[path] = content;
}

describe('LinuxEvidenceCollector', () => {
  beforeEach(() => {
    fsStubs = {};
    exec.mockImplementation((cmd, opts, callback) => {
      const cb = typeof opts === 'function' ? opts : callback;
      cb(null, { stdout: `mock: ${cmd}`, stderr: '' });
    });
  });

  describe('collectAllEvidence — schema', () => {
    it('returns all 10 required bucket keys', async () => {
      const collector = new LinuxEvidenceCollector();
      const result = await collector.collectAllEvidence();
      const required = ['systemInfo', 'securitySettings', 'eventLogs', 'services',
                        'firewall', 'updates', 'users', 'network', 'software', 'files'];
      for (const key of required) {
        expect(result).toHaveProperty(key);
      }
    });

    it('includes a timestamp', async () => {
      const collector = new LinuxEvidenceCollector();
      const result = await collector.collectAllEvidence();
      expect(result.timestamp).toBeTruthy();
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('isolates failures — one failed bucket does not affect others', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(new Error('command failed'));
      });
      const collector = new LinuxEvidenceCollector();
      const result = await collector.collectAllEvidence();
      // Should still have all keys (with error fields, not thrown)
      const dataKeys = Object.keys(result).filter(k => k !== 'timestamp');
      expect(dataKeys.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('collectSystemInfo', () => {
    it('calls uname -m for architecture', async () => {
      const collector = new LinuxEvidenceCollector();
      await collector.collectSystemInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('uname -m'))).toBe(true);
    });

    it('calls uname -r for kernel version', async () => {
      const collector = new LinuxEvidenceCollector();
      await collector.collectSystemInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('uname -r'))).toBe(true);
    });

    it('reads /etc/os-release for distro info', async () => {
      stubFile('/etc/os-release', 'NAME="Ubuntu"\nVERSION="24.04 LTS"\nID=ubuntu\n');
      const collector = new LinuxEvidenceCollector();
      await collector.collectSystemInfo();
      expect(collector.evidence.systemInfo.osName).toBe('Ubuntu');
      expect(collector.evidence.systemInfo.osVersion).toBe('24.04 LTS');
      expect(collector.evidence.systemInfo.osId).toBe('ubuntu');
    });
  });

  describe('collectSecuritySettings', () => {
    it('reads PASS_MAX_DAYS from /etc/login.defs', async () => {
      stubFile('/etc/login.defs', 'PASS_MAX_DAYS   90\nPASS_MIN_DAYS   1\nPASS_WARN_AGE   7\n');
      const collector = new LinuxEvidenceCollector();
      await collector.collectSecuritySettings();
      expect(collector.evidence.securitySettings.passwordPolicy.PASS_MAX_DAYS).toBe('90');
      expect(collector.evidence.securitySettings.passwordPolicy.PASS_WARN_AGE).toBe('7');
    });

    it('calls cat on the PAM common-password file', async () => {
      const collector = new LinuxEvidenceCollector();
      await collector.collectSecuritySettings();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('common-password'))).toBe(true);
    });
  });

  describe('collectEventLogs', () => {
    it('calls journalctl for the last 24h', async () => {
      const collector = new LinuxEvidenceCollector();
      await collector.collectEventLogs();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('journalctl') && cmd.includes('24 hours ago'))).toBe(true);
    });

    it('caps journal output at 500 lines', async () => {
      const collector = new LinuxEvidenceCollector();
      await collector.collectEventLogs();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('journalctl') && cmd.includes('head -500'))).toBe(true);
    });
  });

  describe('collectServices', () => {
    it('calls systemctl to list running services', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectServices();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('systemctl list-units'))).toBe(true);
    });

    it('probes critical services via systemctl is-active', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('systemctl is-active')) {
          cb(null, { stdout: 'active', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new LinuxEvidenceCollector();
      await collector.collectServices();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('systemctl is-active ssh'))).toBe(true);
      // active services are recorded as true in the critical map
      expect(Object.values(collector.evidence.services.critical).length).toBeGreaterThan(0);
    });
  });

  describe('collectFirewallStatus', () => {
    it('calls ufw status verbose', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectFirewallStatus();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('ufw status verbose'))).toBe(true);
    });

    it('marks firewall enabled when ufw reports Status: active', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('ufw status')) {
          cb(null, { stdout: 'Status: active\nLogging: on (low)\nDefault: deny (incoming)', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new LinuxEvidenceCollector();
      await collector.collectFirewallStatus();
      expect(collector.evidence.firewall.enabled).toBe(true);
      expect(collector.evidence.firewall.public).toBe(true);
    });

    it('mirrors the domain/private/public profile fields for engine compatibility', async () => {
      exec.mockImplementation((cmd, opts, callback) => {
        const cb = typeof opts === 'function' ? opts : callback;
        if (cmd.includes('ufw status')) {
          cb(null, { stdout: 'Status: inactive', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });
      const collector = new LinuxEvidenceCollector();
      await collector.collectFirewallStatus();
      expect(collector.evidence.firewall.enabled).toBe(false);
      expect(collector.evidence.firewall.domain).toBe(false);
      expect(collector.evidence.firewall.private).toBe(false);
      expect(collector.evidence.firewall.public).toBe(false);
    });
  });

  describe('collectUpdateStatus', () => {
    it('reports reboot-required from /var/run/reboot-required', async () => {
      stubFile('/var/run/reboot-required', '*** System restart required ***\n');
      const collector = new LinuxEvidenceCollector();
      await collector.collectUpdateStatus();
      expect(collector.evidence.updates.rebootRequired).toBe(true);
    });

    it('calls apt list --upgradable for pending updates', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectUpdateStatus();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('apt list --upgradable'))).toBe(true);
    });
  });

  describe('collectUserAccounts', () => {
    it('parses human users (UID >= 1000) from /etc/passwd', async () => {
      stubFile('/etc/passwd',
        'root:x:0:0:root:/root:/bin/bash\n' +
        'alice:x:1000:1000:Alice:/home/alice:/bin/bash\n' +
        'bob:x:1001:1001::/home/bob:/bin/bash\n' +
        'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n');
      const collector = new LinuxEvidenceCollector();
      await collector.collectUserAccounts();
      expect(collector.evidence.users.humanUsers).toHaveLength(2);
      expect(collector.evidence.users.humanUsers[0].username).toBe('alice');
      expect(collector.evidence.users.humanUsers[1].uid).toBe(1001);
    });

    it('calls getent for sudo/wheel admin groups', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectUserAccounts();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('getent group sudo wheel'))).toBe(true);
    });
  });

  describe('collectNetworkInfo', () => {
    it('calls ip -brief addr for interfaces', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectNetworkInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('ip -brief addr'))).toBe(true);
    });

    it('calls ss -tuln for open ports', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectNetworkInfo();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('ss -tuln'))).toBe(true);
    });
  });

  describe('collectInstalledSoftware', () => {
    it('calls dpkg-query for the installed package inventory', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectInstalledSoftware();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('dpkg-query'))).toBe(true);
    });

    it('calls ps for running processes', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectInstalledSoftware();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('ps aux'))).toBe(true);
    });
  });

  describe('collectFilePermissions', () => {
    it('lists critical paths with ls -la', async () => {
      exec.mockClear();
      const collector = new LinuxEvidenceCollector();
      await collector.collectFilePermissions();
      const calls = exec.mock.calls.map(c => c[0]);
      expect(calls.some(cmd => cmd.includes('ls -la') && cmd.includes('/etc/shadow'))).toBe(true);
    });
  });

  describe('collectLinuxEvidence (module export)', () => {
    it('returns evidence with all required keys', async () => {
      const result = await collectLinuxEvidence();
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('systemInfo');
      expect(result).toHaveProperty('firewall');
    });
  });

});