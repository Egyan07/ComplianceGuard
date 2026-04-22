const log = require('../logger');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Per-command default. Individual call sites can still pass their own timeout.
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

function runCommand(command, opts = {}) {
  return execAsync(command, {
    encoding: 'utf8',
    timeout: DEFAULT_EXEC_TIMEOUT_MS,
    ...opts,
  });
}

class WindowsEvidenceCollector {
  constructor() {
    this.evidence = {
      timestamp: new Date().toISOString(),
      systemInfo: {},
      securitySettings: {},
      eventLogs: {},
      services: {},
      firewall: {},
      updates: {},
      users: {},
      network: {},
      software: {},
      files: {}
    };
  }

  async collectAllEvidence() {
    log.info('Starting Windows evidence collection...');

    // Each collector is independent and writes to a distinct slot on
    // this.evidence, so they can run concurrently. Promise.allSettled means a
    // slow command in one bucket (e.g. event logs) doesn't hold up the
    // others, and a thrown error in one doesn't abort the run — each
    // collector already stores its own error on this.evidence.<bucket>.error.
    const collectors = [
      ['systemInfo',        () => this.collectSystemInfo()],
      ['securitySettings',  () => this.collectSecuritySettings()],
      ['eventLogs',         () => this.collectEventLogs()],
      ['services',          () => this.collectServices()],
      ['firewall',          () => this.collectFirewallStatus()],
      ['updates',           () => this.collectUpdateStatus()],
      ['users',             () => this.collectUserAccounts()],
      ['network',           () => this.collectNetworkInfo()],
      ['software',          () => this.collectInstalledSoftware()],
      ['files',             () => this.collectFilePermissions()],
    ];

    const results = await Promise.allSettled(collectors.map(([, fn]) => fn()));

    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const [bucket] = collectors[idx];
        log.error(`Windows evidence collector "${bucket}" failed:`, result.reason);
        if (this.evidence[bucket] && typeof this.evidence[bucket] === 'object') {
          this.evidence[bucket].error = result.reason?.message || String(result.reason);
        }
      }
    });

    log.info('Windows evidence collection completed');
    return this.evidence;
  }

  async collectSystemInfo() {
    try {
      this.evidence.systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime()
      };

      const { stdout: systemInfo } = await runCommand('systeminfo');
      const lines = systemInfo.split('\n');

      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':').map(s => s.trim());
          switch (key) {
            case 'OS Name':
              this.evidence.systemInfo.osName = value;
              break;
            case 'OS Version':
              this.evidence.systemInfo.osVersion = value;
              break;
            case 'System Type':
              this.evidence.systemInfo.systemType = value;
              break;
            case 'Total Physical Memory':
              this.evidence.systemInfo.physicalMemory = value;
              break;
          }
        }
      });

    } catch (error) {
      log.error('System info collection failed:', error);
      this.evidence.systemInfo.error = error.message;
    }
  }

  async collectSecuritySettings() {
    try {
      const { stdout: passwordPolicy } = await runCommand('net accounts');
      this.evidence.securitySettings.passwordPolicy = this.parseNetAccounts(passwordPolicy);

      const { stdout: auditPolicy } = await runCommand('auditpol /get /category:*');
      this.evidence.securitySettings.auditPolicy = this.parseAuditPolicy(auditPolicy);

      const { stdout: userRights } = await runCommand('whoami /priv');
      this.evidence.securitySettings.userRights = userRights;

      const securityOptions = await this.getRegistryValue(
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'
      );
      this.evidence.securitySettings.registrySettings = securityOptions;

    } catch (error) {
      log.error('Security settings collection failed:', error);
      this.evidence.securitySettings.error = error.message;
    }
  }

  async collectEventLogs() {
    try {
      const logNames = ['Security', 'System', 'Application'];
      const maxEvents = 100;

      // Fetch all three logs concurrently — the wevtutil calls are
      // independent and this was the slowest serial step on Windows.
      const results = await Promise.allSettled(
        logNames.map(name =>
          runCommand(`wevtutil qe ${name} /c:${maxEvents} /f:text /rd:true`)
        )
      );

      logNames.forEach((name, idx) => {
        const result = results[idx];
        const key = name.toLowerCase();
        if (result.status === 'fulfilled') {
          this.evidence.eventLogs[key] = result.value.stdout;
        } else {
          log.error(`Failed to collect ${name} logs:`, result.reason);
          this.evidence.eventLogs[key] = { error: result.reason?.message || String(result.reason) };
        }
      });

    } catch (error) {
      log.error('Event logs collection failed:', error);
      this.evidence.eventLogs.error = error.message;
    }
  }

  async collectServices() {
    try {
      const { stdout: services } = await runCommand('sc query state= all');
      this.evidence.services.list = services;

      const criticalServices = [
        'WinDefend',
        'wuauserv',
        'BFE',
        'Dnscache',
        'EventLog'
      ];

      // Poll each critical service concurrently.
      const statuses = await Promise.allSettled(
        criticalServices.map(svc => runCommand(`sc query ${svc}`))
      );
      this.evidence.services.critical = Object.fromEntries(
        criticalServices.map((svc, idx) => {
          const r = statuses[idx];
          return [svc, r.status === 'fulfilled' && r.value.stdout.includes('RUNNING')];
        })
      );

    } catch (error) {
      log.error('Services collection failed:', error);
      this.evidence.services.error = error.message;
    }
  }

  async collectFirewallStatus() {
    try {
      const { stdout: firewallStatus } = await runCommand('netsh advfirewall show allprofiles');
      this.evidence.firewall.status = firewallStatus;

      this.evidence.firewall.profiles = {
        domain: firewallStatus.includes('Domain Profile') && firewallStatus.includes('State ON'),
        private: firewallStatus.includes('Private Profile') && firewallStatus.includes('State ON'),
        public: firewallStatus.includes('Public Profile') && firewallStatus.includes('State ON')
      };

    } catch (error) {
      log.error('Firewall status collection failed:', error);
      this.evidence.firewall.error = error.message;
    }
  }

  async collectUpdateStatus() {
    try {
      const { stdout: updateService } = await runCommand('sc query wuauserv');
      this.evidence.updates.serviceRunning = updateService.includes('RUNNING');

      const lastUpdateKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\Results\\Install';
      const lastUpdate = await this.getRegistryValue(lastUpdateKey);
      this.evidence.updates.lastInstallTime = lastUpdate?.LastSuccessTime || 'Unknown';

    } catch (error) {
      log.error('Update status collection failed:', error);
      this.evidence.updates.error = error.message;
    }
  }

  async collectUserAccounts() {
    try {
      const [usersResult, adminsResult] = await Promise.all([
        runCommand('net user'),
        runCommand('net localgroup administrators'),
      ]);
      this.evidence.users.list = usersResult.stdout;
      this.evidence.users.administrators = adminsResult.stdout;

    } catch (error) {
      log.error('User accounts collection failed:', error);
      this.evidence.users.error = error.message;
    }
  }

  async collectNetworkInfo() {
    try {
      const [interfaces, ports, routes] = await Promise.all([
        runCommand('ipconfig /all'),
        runCommand('netstat -an'),
        runCommand('route print'),
      ]);
      this.evidence.network.interfaces = interfaces.stdout;
      this.evidence.network.openPorts = ports.stdout;
      this.evidence.network.routes = routes.stdout;

    } catch (error) {
      log.error('Network info collection failed:', error);
      this.evidence.network.error = error.message;
    }
  }

  async collectInstalledSoftware() {
    try {
      const uninstallKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
      const software = await this.getRegistrySubKeys(uninstallKey);
      this.evidence.software.installed = software;

      const { stdout: processes } = await runCommand('tasklist');
      this.evidence.software.running = processes;

    } catch (error) {
      log.error('Software collection failed:', error);
      this.evidence.software.error = error.message;
    }
  }

  async collectFilePermissions() {
    try {
      const criticalPaths = [
        'C:\\Windows\\System32',
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        'C:\\Users'
      ];

      this.evidence.files.permissions = {};

      for (const filePath of criticalPaths) {
        try {
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const permissions = this.getFilePermissions(stats);
            this.evidence.files.permissions[filePath] = permissions;
          }
        } catch (fileError) {
          this.evidence.files.permissions[filePath] = { error: fileError.message };
        }
      }

    } catch (error) {
      log.error('File permissions collection failed:', error);
      this.evidence.files.error = error.message;
    }
  }

  // Helper methods
  parseNetAccounts(output) {
    const policy = {};
    const lines = output.split('\n');

    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':').map(s => s.trim());
        policy[key] = value;
      }
    });

    return policy;
  }

  parseAuditPolicy(output) {
    const policies = [];
    const lines = output.split('\n');

    lines.forEach(line => {
      if (line.includes('Success') || line.includes('Failure')) {
        policies.push(line.trim());
      }
    });

    return policies;
  }

  async getRegistryValue(keyPath) {
    try {
      const { stdout: result } = await runCommand(`reg query "${keyPath}"`);
      return result;
    } catch (error) {
      return null;
    }
  }

  async getRegistrySubKeys(keyPath) {
    try {
      const { stdout: result } = await runCommand(`reg query "${keyPath}"`);
      const subKeys = [];

      const lines = result.split('\n');
      lines.forEach(line => {
        if (line.includes('HKEY_') && line !== keyPath) {
          subKeys.push(line.trim());
        }
      });

      return subKeys.slice(0, 50);
    } catch (error) {
      return [];
    }
  }

  getFilePermissions(stats) {
    return {
      mode: stats.mode.toString(8),
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
      atime: stats.atime,
      mtime: stats.mtime,
      ctime: stats.ctime
    };
  }
}

async function collectWindowsEvidence() {
  const collector = new WindowsEvidenceCollector();
  return await collector.collectAllEvidence();
}

module.exports = {
  WindowsEvidenceCollector,
  collectWindowsEvidence
};
