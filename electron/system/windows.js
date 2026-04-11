const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
      console.log('Starting Windows evidence collection...');

      // Collect system information
      await this.collectSystemInfo();

      // Collect security settings
      await this.collectSecuritySettings();

      // Collect event logs
      await this.collectEventLogs();

      // Collect services information
      await this.collectServices();

      // Collect firewall status
      await this.collectFirewallStatus();

      // Collect Windows update status
      await this.collectUpdateStatus();

      // Collect user accounts
      await this.collectUserAccounts();

      // Collect network configuration
      await this.collectNetworkInfo();

      // Collect installed software
      await this.collectInstalledSoftware();

      // Collect critical file permissions
      await this.collectFilePermissions();

      console.log('Windows evidence collection completed');
      return this.evidence;

    } catch (error) {
      console.error('Evidence collection failed:', error);
      throw error;
    }
  }

  async collectSystemInfo() {
    try {
      // Basic system information
      this.evidence.systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime()
      };

      // Windows-specific information using WMI
      const systemInfo = execSync('systeminfo', { encoding: 'utf8' });
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
      console.error('System info collection failed:', error);
      this.evidence.systemInfo.error = error.message;
    }
  }

  async collectSecuritySettings() {
    try {
      // Password policy
      const passwordPolicy = execSync('net accounts', { encoding: 'utf8' });
      this.evidence.securitySettings.passwordPolicy = this.parseNetAccounts(passwordPolicy);

      // Audit policy
      const auditPolicy = execSync('auditpol /get /category:*', { encoding: 'utf8' });
      this.evidence.securitySettings.auditPolicy = this.parseAuditPolicy(auditPolicy);

      // User rights assignment
      const userRights = execSync('whoami /priv', { encoding: 'utf8' });
      this.evidence.securitySettings.userRights = userRights;

      // Security options from registry
      const securityOptions = await this.getRegistryValue(
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'
      );
      this.evidence.securitySettings.registrySettings = securityOptions;

    } catch (error) {
      console.error('Security settings collection failed:', error);
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
          const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
          this.evidence.eventLogs[log.toLowerCase()] = result;
        } catch (logError) {
          console.error(`Failed to collect ${log} logs:`, logError);
          this.evidence.eventLogs[log.toLowerCase()] = { error: logError.message };
        }
      }

    } catch (error) {
      console.error('Event logs collection failed:', error);
      this.evidence.eventLogs.error = error.message;
    }
  }

  async collectServices() {
    try {
      const services = execSync('sc query state= all', { encoding: 'utf8' });
      this.evidence.services.list = services;

      // Get critical service status
      const criticalServices = [
        'WinDefend', // Windows Defender
        'wuauserv', // Windows Update
        'BFE', // Base Filtering Engine
        'Dnscache', // DNS Client
        'EventLog' // Windows Event Log
      ];

      this.evidence.services.critical = {};
      for (const service of criticalServices) {
        try {
          const status = execSync(`sc query ${service}`, { encoding: 'utf8' });
          this.evidence.services.critical[service] = status.includes('RUNNING');
        } catch (serviceError) {
          this.evidence.services.critical[service] = false;
        }
      }

    } catch (error) {
      console.error('Services collection failed:', error);
      this.evidence.services.error = error.message;
    }
  }

  async collectFirewallStatus() {
    try {
      const firewallStatus = execSync('netsh advfirewall show allprofiles', { encoding: 'utf8' });
      this.evidence.firewall.status = firewallStatus;

      // Parse firewall profiles
      this.evidence.firewall.profiles = {
        domain: firewallStatus.includes('Domain Profile') && firewallStatus.includes('State ON'),
        private: firewallStatus.includes('Private Profile') && firewallStatus.includes('State ON'),
        public: firewallStatus.includes('Public Profile') && firewallStatus.includes('State ON')
      };

    } catch (error) {
      console.error('Firewall status collection failed:', error);
      this.evidence.firewall.error = error.message;
    }
  }

  async collectUpdateStatus() {
    try {
      // Check Windows Update service
      const updateService = execSync('sc query wuauserv', { encoding: 'utf8' });
      this.evidence.updates.serviceRunning = updateService.includes('RUNNING');

      // Get last update time from registry
      const lastUpdateKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\Results\\Install';
      const lastUpdate = await this.getRegistryValue(lastUpdateKey);
      this.evidence.updates.lastInstallTime = lastUpdate?.LastSuccessTime || 'Unknown';

    } catch (error) {
      console.error('Update status collection failed:', error);
      this.evidence.updates.error = error.message;
    }
  }

  async collectUserAccounts() {
    try {
      const users = execSync('net user', { encoding: 'utf8' });
      this.evidence.users.list = users;

      // Get administrator accounts
      const admins = execSync('net localgroup administrators', { encoding: 'utf8' });
      this.evidence.users.administrators = admins;

    } catch (error) {
      console.error('User accounts collection failed:', error);
      this.evidence.users.error = error.message;
    }
  }

  async collectNetworkInfo() {
    try {
      // Network interfaces
      const interfaces = execSync('ipconfig /all', { encoding: 'utf8' });
      this.evidence.network.interfaces = interfaces;

      // Open ports
      const ports = execSync('netstat -an', { encoding: 'utf8' });
      this.evidence.network.openPorts = ports;

      // Routing table
      const routes = execSync('route print', { encoding: 'utf8' });
      this.evidence.network.routes = routes;

    } catch (error) {
      console.error('Network info collection failed:', error);
      this.evidence.network.error = error.message;
    }
  }

  async collectInstalledSoftware() {
    try {
      // Get installed programs from registry
      const uninstallKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
      const software = await this.getRegistrySubKeys(uninstallKey);
      this.evidence.software.installed = software;

      // Get running processes
      const processes = execSync('tasklist', { encoding: 'utf8' });
      this.evidence.software.running = processes;

    } catch (error) {
      console.error('Software collection failed:', error);
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
      console.error('File permissions collection failed:', error);
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
      const command = `reg query "${keyPath}"`;
      const result = execSync(command, { encoding: 'utf8' });
      return result;
    } catch (error) {
      return null;
    }
  }

  async getRegistrySubKeys(keyPath) {
    try {
      const command = `reg query "${keyPath}"`;
      const result = execSync(command, { encoding: 'utf8' });
      const subKeys = [];

      const lines = result.split('\n');
      lines.forEach(line => {
        if (line.includes('HKEY_') && line !== keyPath) {
          subKeys.push(line.trim());
        }
      });

      return subKeys.slice(0, 50); // Limit to first 50 for performance
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

// Export function for use in main process
async function collectWindowsEvidence() {
  const collector = new WindowsEvidenceCollector();
  return await collector.collectAllEvidence();
}

module.exports = {
  WindowsEvidenceCollector,
  collectWindowsEvidence
};