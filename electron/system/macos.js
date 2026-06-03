import log from '../logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// Per-command default timeout — matches windows.js convention
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

// Full path required — socketfilterfw is NOT on $PATH by default on macOS
const SOCKETFILTERFW = '/usr/libexec/ApplicationFirewall/socketfilterfw';

function runCommand(command, opts = {}) {
  return execAsync(command, {
    encoding: 'utf8',
    timeout: DEFAULT_EXEC_TIMEOUT_MS,
    ...opts,
  });
}

/**
 * Parse csrutil output into a structured status.
 * Returns "enabled", "disabled", or "unknown" (for VMs or parse failures).
 */
function parseSipStatus(output) {
  const lower = (output || '').toLowerCase();
  if (lower.includes('enabled')) return 'enabled';
  if (lower.includes('disabled')) return 'disabled';
  return 'unknown';
}

class MacOSEvidenceCollector {
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
      files: {},
    };
  }

  async collectAllEvidence() {
    log.info('Starting macOS evidence collection...');

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
        log.error(`macOS evidence collector "${bucket}" failed:`, result.reason);
        if (this.evidence[bucket] && typeof this.evidence[bucket] === 'object') {
          this.evidence[bucket].error = result.reason?.message || String(result.reason);
        }
      }
    });

    log.info('macOS evidence collection completed');
    return this.evidence;
  }

  async collectSystemInfo() {
    try {
      const [swVers, uname, memsize, cpu] = await Promise.allSettled([
        runCommand('sw_vers'),
        runCommand('uname -m'),
        runCommand('sysctl hw.memsize'),
        runCommand('sysctl machdep.cpu.brand_string'),
      ]);
      this.evidence.systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch:     uname.status === 'fulfilled' ? uname.value.stdout.trim() : os.arch(),
        swVers:   swVers.status === 'fulfilled' ? swVers.value.stdout.trim() : null,
        memsize:  memsize.status === 'fulfilled' ? memsize.value.stdout.trim() : null,
        cpu:      cpu.status === 'fulfilled' ? cpu.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.systemInfo.error = error.message;
    }
  }

  async collectSecuritySettings() {
    try {
      const [pwPolicyResult, fileVaultResult, sipResult] = await Promise.allSettled([
        runCommand('pwpolicy -getglobalpolicy'),
        runCommand('fdesetup status'),
        runCommand('csrutil status'),
      ]);

      // pwpolicy: empty output is a warning, not an error — other fields in bucket are still valid
      let passwordPolicy = 'unknown';
      let pwWarning = null;
      if (pwPolicyResult.status === 'fulfilled') {
        const lines = pwPolicyResult.value.stdout.trim().split('\n')
          .filter(l => l.includes('='));
        if (lines.length === 0) {
          pwWarning = 'pwpolicy returned no policy information';
        } else {
          const parsed = {};
          lines.forEach(line => {
            const eqIdx = line.indexOf('=');
            if (eqIdx !== -1) {
              parsed[line.substring(0, eqIdx).trim()] = line.substring(eqIdx + 1).trim();
            }
          });
          passwordPolicy = parsed;
        }
      }

      this.evidence.securitySettings = {
        passwordPolicy,
        ...(pwWarning && { warning: pwWarning }),
        fileVault: fileVaultResult.status === 'fulfilled' ? fileVaultResult.value.stdout.trim() : null,
        // sipStatus is always structured — never raw text
        sipStatus: parseSipStatus(
          sipResult.status === 'fulfilled' ? sipResult.value.stdout : ''
        ),
      };
    } catch (error) {
      this.evidence.securitySettings.error = error.message;
    }
  }

  async collectEventLogs() {
    try {
      // --style compact is faster; pipe requires shell:true; 500-line cap prevents timeout
      const { stdout } = await runCommand(
        "log show --style compact --last 24h --predicate 'category == \"security\"' 2>/dev/null | head -500",
        { shell: true }
      );
      this.evidence.eventLogs = {
        securityEvents: stdout.trim(),
        source: 'unified-log',
        cap: '500 lines, last 24h, security category',
      };
    } catch (error) {
      this.evidence.eventLogs.error = error.message;
    }
  }

  async collectServices() {
    try {
      const [gatekeeper, autoCheck, autoDownload, launchctl] = await Promise.allSettled([
        runCommand('spctl --status'),
        runCommand('defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled'),
        runCommand('defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload'),
        runCommand(
          "launchctl list | grep -E 'com.apple.(security|softwareupdate|malware)' 2>/dev/null",
          { shell: true }
        ),
      ]);
      this.evidence.services = {
        gatekeeper:            gatekeeper.status === 'fulfilled' ? gatekeeper.value.stdout.trim() : null,
        automaticCheckEnabled: autoCheck.status === 'fulfilled' ? autoCheck.value.stdout.trim() : null,
        automaticDownload:     autoDownload.status === 'fulfilled' ? autoDownload.value.stdout.trim() : null,
        securityDaemons:       launchctl.status === 'fulfilled' ? launchctl.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.services.error = error.message;
    }
  }

  async collectFirewallStatus() {
    try {
      // Full path required — socketfilterfw is NOT on $PATH by default
      const [globalState, stealthMode, pfRules] = await Promise.allSettled([
        runCommand(`${SOCKETFILTERFW} --getglobalstate`),
        runCommand(`${SOCKETFILTERFW} --getstealthmode`),
        runCommand('pfctl -s rules 2>/dev/null', { shell: true }),
      ]);
      const enabled = globalState.status === 'fulfilled' &&
        globalState.value.stdout.toLowerCase().includes('enabled');
      this.evidence.firewall = {
        globalState: globalState.status === 'fulfilled' ? globalState.value.stdout.trim() : null,
        stealthMode: stealthMode.status === 'fulfilled' ? stealthMode.value.stdout.trim() : null,
        pfRules:     pfRules.status === 'fulfilled' ? pfRules.value.stdout.trim() : null,
        // Mirror windows.js field names for compliance engine compatibility
        domain:  enabled,
        private: enabled,
        public:  enabled,
      };
    } catch (error) {
      this.evidence.firewall.error = error.message;
    }
  }

  async collectUpdateStatus() {
    try {
      const { stdout } = await runCommand(
        'softwareupdate --list 2>&1 | head -20',
        { shell: true }
      );
      this.evidence.updates = {
        pendingUpdates: stdout.trim(),
      };
    } catch (error) {
      this.evidence.updates.error = error.message;
    }
  }

  async collectUserAccounts() {
    try {
      const [humanUsers, adminGroup, wheelGroup] = await Promise.allSettled([
        // UID >= 500 = human accounts; system accounts use lower UIDs
        runCommand("dscl . -list /Users UniqueID | awk '$2 >= 500'", { shell: true }),
        runCommand('dscl . -read /Groups/admin GroupMembership'),
        runCommand('dscacheutil -q group -a name wheel'),
      ]);
      this.evidence.users = {
        humanUsers: humanUsers.status === 'fulfilled' ? humanUsers.value.stdout.trim() : null,
        adminGroup: adminGroup.status === 'fulfilled' ? adminGroup.value.stdout.trim() : null,
        wheelGroup: wheelGroup.status === 'fulfilled' ? wheelGroup.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.users.error = error.message;
    }
  }

  async collectNetworkInfo() {
    try {
      const [interfaces, connections, routes] = await Promise.allSettled([
        runCommand('ifconfig -a'),
        runCommand('netstat -an'),
        runCommand('netstat -rn'),
      ]);
      this.evidence.network = {
        interfaces:  interfaces.status === 'fulfilled' ? interfaces.value.stdout.trim() : null,
        connections: connections.status === 'fulfilled' ? connections.value.stdout.trim() : null,
        routes:      routes.status === 'fulfilled' ? routes.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.network.error = error.message;
    }
  }

  async collectInstalledSoftware() {
    try {
      const [sysApps, userApps, profiler] = await Promise.allSettled([
        runCommand('ls -la /Applications/*.app 2>/dev/null', { shell: true }),
        // ~ expansion requires shell:true — do NOT migrate to execFile()
        runCommand('ls -la ~/Applications/*.app 2>/dev/null', { shell: true }),
        // Capped at 200 lines — full output can be 5-10MB and take 30s
        runCommand(
          'system_profiler SPApplicationsDataType 2>/dev/null | head -200',
          { shell: true }
        ),
      ]);
      this.evidence.software = {
        systemApplications: sysApps.status === 'fulfilled' ? sysApps.value.stdout.trim() : null,
        userApplications:   userApps.status === 'fulfilled' ? userApps.value.stdout.trim() : null,
        applicationDetails: profiler.status === 'fulfilled' ? profiler.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.software.error = error.message;
    }
  }

  async collectFilePermissions() {
    try {
      const { stdout } = await runCommand(
        'ls -la /private/etc/sudoers /private/etc/ssh/sshd_config /private/etc/pam.d/ /Library/LaunchDaemons/ 2>/dev/null | head -60',
        { shell: true }
      );
      this.evidence.files = {
        criticalPaths: stdout.trim(),
      };
    } catch (error) {
      this.evidence.files.error = error.message;
    }
  }
}

async function collectMacOSEvidence() {
  const collector = new MacOSEvidenceCollector();
  return await collector.collectAllEvidence();
}

export { MacOSEvidenceCollector, collectMacOSEvidence };
