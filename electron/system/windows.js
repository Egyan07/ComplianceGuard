const log = require('../logger');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

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
    try {
      log.info('Starting Windows evidence collection...');

      await this.collectSystemInfo();
      await this.collectSecuritySettings();
      await this.collectEventLogs();
      await this.collectServices();
      await this.collectFirewallStatus();
      await this.collectUpdateStatus();
      await this.collectUserAccounts();
      await this.collectNetworkInfo();
      await this.collectInstalledSoftware();
      await this.collectFilePermissions();

      log.info('Windows evidence collection completed');
      return this.evidence;

    } catch (error) {
      log.error('Evidence collection failed:', error);
      throw error;
    }
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

      const { stdout: systemInfo } = await execAsync('systeminfo', { encoding: 'utf8' });
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
      const { stdout: passwordPolicy } = await execAsync('net accounts', { encoding: 'utf8' });
      this.evidence.securitySettings.passwordPolicy = this.parseNetAccounts(passwordPolicy);

      const { stdout: auditPolicy } = await execAsync('auditpol /get /category:*', { encoding: 'utf8' });
      this.evidence.securitySettings.auditPolicy = this.parseAuditPolicy(auditPolicy);

      const { stdout: userRights } = await execAsync('whoami /priv', { encoding: 'utf8' });
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
      const logs = ['Security', 'System', 'Application'];
      const maxEvents = 100;

      for (const log of logs) {
        try {
          const command = `wevtutil qe ${log} /c:${maxEvents} /f:text /rd:true`;
          const { stdout: result } = await execAsync(command, { encoding: 'utf8', timeout: 30000 });
          this.evidence.eventLogs[log.toLowerCase()] = result;
        } catch (logError) {
          log.error(`Failed to collect ${log} logs:`, logError);
          this.evidence.eventLogs[log.toLowerCase()] = { error: logError.message };
        }
      }

    } catch (error) {
      log.error('Event logs collection failed:', error);
      this.evidence.eventLogs.error = error.message;
    }
  }

  async collectServices() {
    try {
      const { stdout: services } = await execAsync('sc query state= all', { encoding: 'utf8' });
      this.evidence.services.list = services;

      const criticalServices = [
        'WinDefend',
        'wuauserv',
        'BFE',
        'Dnscache',
        'EventLog'
      ];

      this.evidence.services.critical = {};
      for (const service of criticalServices) {
        try {
          const { stdout: serviceStatus } = await execAsync(`sc query ${service}`, { encoding: 'utf8' });
          this.evidence.services.critical[service] = serviceStatus.includes('RUNNING');
        } catch (serviceError) {
          this.evidence.services.critical[service] = false;
        }
      }

    } catch (error) {
      log.error('Services collection failed:', error);
      this.evidence.services.error = error.message;
    }
  }

  async collectFirewallStatus() {
    try {
      const { stdout: firewallStatus } = await execAsync('netsh advfirewall show allprofiles', { encoding: 'utf8' });
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
      const { stdout: updateService } = await execAsync('sc query wuauserv', { encoding: 'utf8' });
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
      const { stdout: users } = await execAsync('net user', { encoding: 'utf8' });
      this.evidence.users.list = users;

      const { stdout: admins } = await execAsync('net localgroup administrators', { encoding: 'utf8' });
      this.evidence.users.administrators = admins;

    } catch (error) {
      log.error('User accounts collection failed:', error);
      this.evidence.users.error = error.message;
    }
  }

  async collectNetworkInfo() {
    try {
      const { stdout: interfaces } = await execAsync('ipconfig /all', { encoding: 'utf8' });
      this.evidence.network.interfaces = interfaces;

      const { stdout: ports } = await execAsync('netstat -an', { encoding: 'utf8' });
      this.evidence.network.openPorts = ports;

      const { stdout: routes } = await execAsync('route print', { encoding: 'utf8' });
      this.evidence.network.routes = routes;

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

      const { stdout: processes } = await execAsync('tasklist', { encoding: 'utf8' });
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
      const { stdout: result } = await execAsync(`reg query "${keyPath}"`, { encoding: 'utf8' });
      return result;
    } catch (error) {
      return null;
    }
  }

  async getRegistrySubKeys(keyPath) {
    try {
      const { stdout: result } = await execAsync(`reg query "${keyPath}"`, { encoding: 'utf8' });
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
