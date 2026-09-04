import log from '../logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

// Per-command default timeout — matches windows.js/macos.js convention
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

function runCommand(command, opts = {}) {
  return execAsync(command, {
    encoding: 'utf8',
    timeout: DEFAULT_EXEC_TIMEOUT_MS,
    ...opts,
  });
}

/** Read a small config file, returning null when missing/unreadable. */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Parse /etc/os-release NAME="Ubuntu" style key=value lines. */
function parseOsRelease(content) {
  const parsed = {};
  for (const line of (content || '').split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    let value = line.substring(eqIdx + 1).trim();
    // Strip surrounding quotes ("Ubuntu" or 'Ubuntu')
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

/** Parse /etc/passwd into human (UID >= 1000) accounts. */
function parseHumanUsers(content) {
  const users = [];
  for (const line of (content || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split(':');
    if (parts.length < 3) continue;
    const uid = Number(parts[2]);
    if (Number.isInteger(uid) && uid >= 1000 && uid < 65534) {
      users.push({
        username: parts[0],
        uid,
        gid: Number(parts[3]),
        home: parts[5] || '',
        shell: parts[6] || '',
      });
    }
  }
  return users;
}

class LinuxEvidenceCollector {
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
    log.info('Starting Linux evidence collection...');

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
        log.error(`Linux evidence collector "${bucket}" failed:`, result.reason);
        if (this.evidence[bucket] && typeof this.evidence[bucket] === 'object') {
          this.evidence[bucket].error = result.reason?.message || String(result.reason);
        }
      }
    });

    log.info('Linux evidence collection completed');
    return this.evidence;
  }

  async collectSystemInfo() {
    try {
      const [uname, kernel] = await Promise.allSettled([
        runCommand('uname -m'),
        runCommand('uname -r'),
      ]);
      const osRelease = parseOsRelease(readFileSafe('/etc/os-release'));
      this.evidence.systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch:     uname.status === 'fulfilled' ? uname.value.stdout.trim() : os.arch(),
        kernel:   kernel.status === 'fulfilled' ? kernel.value.stdout.trim() : null,
        osName:   osRelease.NAME || null,
        osVersion: osRelease.VERSION || null,
        osId:     osRelease.ID || null,
        osVersionId: osRelease.VERSION_ID || null,
        prettyName: osRelease.PRETTY_NAME || null,
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
      };
    } catch (error) {
      this.evidence.systemInfo.error = error.message;
    }
  }

  async collectSecuritySettings() {
    try {
      // Password aging defaults (/etc/login.defs) — present on every distro
      const loginDefs = readFileSafe('/etc/login.defs') || '';
      const passwordPolicy = {};
      for (const key of ['PASS_MAX_DAYS', 'PASS_MIN_DAYS', 'PASS_WARN_AGE', 'UMASK']) {
        const match = loginDefs.match(new RegExp(`^\\s*${key}\\s+(\\S+)`, 'm'));
        if (match) passwordPolicy[key] = match[1];
      }

      // PAM password quality rules — distro-specific file, try both
      const [pamCommon, pamSystem, auditctl, auditdConf, sshdConf] = await Promise.allSettled([
        runCommand('cat /etc/pam.d/common-password 2>/dev/null | head -40', { shell: true }),
        runCommand('cat /etc/pam.d/system-auth 2>/dev/null | head -40', { shell: true }),
        // auditctl needs root; stored as null when unavailable
        runCommand('auditctl -l 2>/dev/null | head -20', { shell: true }),
        runCommand('cat /etc/audit/auditd.conf 2>/dev/null | head -40', { shell: true }),
        runCommand('cat /etc/ssh/sshd_config 2>/dev/null | grep -Ei "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)" | head -10', { shell: true }),
      ]);

      this.evidence.securitySettings = {
        passwordPolicy,
        pamCommonPassword: pamCommon.status === 'fulfilled' ? pamCommon.value.stdout.trim() : null,
        pamSystemAuth:     pamSystem.status === 'fulfilled' ? pamSystem.value.stdout.trim() : null,
        auditRules:        auditctl.status === 'fulfilled' ? auditctl.value.stdout.trim() : null,
        auditdConfig:      auditdConf.status === 'fulfilled' ? auditdConf.value.stdout.trim() : null,
        sshdPolicy:        sshdConf.status === 'fulfilled' ? sshdConf.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.securitySettings.error = error.message;
    }
  }

  async collectEventLogs() {
    try {
      const [journal, authLog, syslog] = await Promise.allSettled([
        runCommand('journalctl --since "24 hours ago" --no-pager 2>/dev/null | head -500', { shell: true }),
        runCommand('tail -n 200 /var/log/auth.log 2>/dev/null', { shell: true }),
        runCommand('tail -n 200 /var/log/syslog 2>/dev/null', { shell: true }),
      ]);
      this.evidence.eventLogs = {
        journal:   journal.status === 'fulfilled' && journal.value.stdout.trim() ? journal.value.stdout.trim() : null,
        authLog:   authLog.status === 'fulfilled' && authLog.value.stdout.trim() ? authLog.value.stdout.trim() : null,
        syslog:    syslog.status === 'fulfilled' && syslog.value.stdout.trim() ? syslog.value.stdout.trim() : null,
        source:    journal.status === 'fulfilled' && journal.value.stdout.trim() ? 'journalctl' : 'syslog-fallback',
        cap:       'journal: 500 lines last 24h; auth/syslog: 200 lines',
      };
    } catch (error) {
      this.evidence.eventLogs.error = error.message;
    }
  }

  async collectServices() {
    try {
      // Critical services — name variants across Debian/Ubuntu and RHEL families
      const criticalServices = [
        'ssh', 'sshd', 'cron', 'crond',
        'rsyslog', 'systemd-journald',
        'ufw', 'firewalld', 'unattended-upgrades',
      ];

      const [unitList, statuses, serviceFallback] = await Promise.allSettled([
        runCommand('systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null | head -60', { shell: true }),
        Promise.allSettled(
          criticalServices.map(svc => runCommand(`systemctl is-active ${svc} 2>/dev/null`, { shell: true }))
        ),
        runCommand('service --status-all 2>/dev/null | head -40', { shell: true }),
      ]);

      const statusMap = {};
      if (statuses.status === 'fulfilled') {
        criticalServices.forEach((svc, idx) => {
          const r = statuses.value[idx];
          statusMap[svc] = r.status === 'fulfilled' && r.value.stdout.trim() === 'active';
        });
      }

      this.evidence.services = {
        list:      unitList.status === 'fulfilled' && unitList.value.stdout.trim() ? unitList.value.stdout.trim() : null,
        critical:  statusMap,
        fallback:  serviceFallback.status === 'fulfilled' && serviceFallback.value.stdout.trim() ? serviceFallback.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.services.error = error.message;
    }
  }

  async collectFirewallStatus() {
    try {
      const [ufw, iptables, nft] = await Promise.allSettled([
        runCommand('ufw status verbose 2>/dev/null | head -40', { shell: true }),
        runCommand('iptables -L -n 2>/dev/null | head -40', { shell: true }),
        runCommand('nft list ruleset 2>/dev/null | head -40', { shell: true }),
      ]);

      const ufwOutput = ufw.status === 'fulfilled' ? ufw.value.stdout : '';
      // ufw reports "Status: active" when enabled; also treat iptables/nft
      // output with actual rules as an active firewall.
      const enabled = ufwOutput.includes('Status: active') ||
        (iptables.status === 'fulfilled' && /^Chain /.test(iptables.value.stdout)) ||
        (nft.status === 'fulfilled' && nft.value.stdout.trim().length > 0);

      this.evidence.firewall = {
        status:   ufwOutput.trim() || (iptables.status === 'fulfilled' ? iptables.value.stdout.trim() : null),
        ufw:      ufwOutput.trim() || null,
        iptables: iptables.status === 'fulfilled' ? iptables.value.stdout.trim() : null,
        nftables: nft.status === 'fulfilled' ? nft.value.stdout.trim() : null,
        // Mirror windows.js/macos.js field names for compliance engine compatibility
        enabled:  enabled,
        domain:   enabled,
        private:  enabled,
        public:   enabled,
      };
    } catch (error) {
      this.evidence.firewall.error = error.message;
    }
  }

  async collectUpdateStatus() {
    try {
      const rebootRequired = readFileSafe('/var/run/reboot-required');
      const [apt, dnf, pacman, unattended] = await Promise.allSettled([
        runCommand('apt list --upgradable 2>/dev/null | tail -n +2 | head -20', { shell: true }),
        runCommand('dnf check-update -q 2>/dev/null | head -20', { shell: true }),
        runCommand('pacman -Qu 2>/dev/null | head -20', { shell: true }),
        runCommand('systemctl is-active unattended-upgrades 2>/dev/null', { shell: true }),
      ]);

      const pendingLines = (r) => r.status === 'fulfilled' ? r.value.stdout.trim() : '';
      const aptOut = pendingLines(apt);
      const dnfOut = pendingLines(dnf);
      const pacmanOut = pendingLines(pacman);

      this.evidence.updates = {
        rebootRequired:  rebootRequired !== null,
        rebootReason:    rebootRequired !== null ? rebootRequired.trim().split('\n')[0] : null,
        pendingCount:    [aptOut, dnfOut, pacmanOut].filter(s => s).reduce((n, s) => n + s.split('\n').filter(Boolean).length, 0),
        aptUpgradable:   aptOut || null,
        dnfUpdates:      dnfOut || null,
        pacmanUpdates:   pacmanOut || null,
        unattendedActive: unattended.status === 'fulfilled' && unattended.value.stdout.trim() === 'active',
      };
    } catch (error) {
      this.evidence.updates.error = error.message;
    }
  }

  async collectUserAccounts() {
    try {
      const [adminGroups, lastLogins] = await Promise.allSettled([
        runCommand('getent group sudo wheel 2>/dev/null', { shell: true }),
        runCommand('last -n 10 2>/dev/null | head -10', { shell: true }),
      ]);
      this.evidence.users = {
        humanUsers:    parseHumanUsers(readFileSafe('/etc/passwd')),
        adminGroups:   adminGroups.status === 'fulfilled' ? adminGroups.value.stdout.trim() : null,
        lastLogins:    lastLogins.status === 'fulfilled' ? lastLogins.value.stdout.trim() : null,
      };
    } catch (error) {
      this.evidence.users.error = error.message;
    }
  }

  async collectNetworkInfo() {
    try {
      const [interfaces, ports, routes] = await Promise.allSettled([
        runCommand('ip -brief addr 2>/dev/null | head -30', { shell: true }),
        runCommand('ss -tuln 2>/dev/null | head -50', { shell: true }),
        runCommand('ip route 2>/dev/null | head -30', { shell: true }),
      ]);
      this.evidence.network = {
        interfaces:  interfaces.status === 'fulfilled' ? interfaces.value.stdout.trim() : null,
        openPorts:   ports.status === 'fulfilled' ? ports.value.stdout.trim() : null,
        routes:      routes.status === 'fulfilled' ? routes.value.stdout.trim() : null,
        source:      'iproute2 (ss/ip)',
      };
    } catch (error) {
      this.evidence.network.error = error.message;
    }
  }

  async collectInstalledSoftware() {
    try {
      const [dpkg, rpm, pacman, processes] = await Promise.allSettled([
        runCommand("dpkg-query -W -f='${Package} ${Version}\\n' 2>/dev/null | head -200", { shell: true }),
        runCommand('rpm -qa 2>/dev/null | head -200', { shell: true }),
        runCommand('pacman -Q 2>/dev/null | head -200', { shell: true }),
        runCommand('ps aux --no-headers 2>/dev/null | head -100', { shell: true }),
      ]);

      // Note: every candidate is piped through `head`, so a non-zero exit
      // (e.g. `dnf check-update` exits 100 when updates ARE available) does
      // not reject — the pipe's status is head's. Rejected = no data.
      const nonEmpty = (r) => (r.status === 'fulfilled' && r.value.stdout.trim() ? r.value.stdout.trim() : null);
      const dpkgOut = nonEmpty(dpkg);
      const rpmOut = nonEmpty(rpm);
      const pacmanOut = nonEmpty(pacman);
      this.evidence.software = {
        installed:  dpkgOut || rpmOut || pacmanOut,
        manager:    dpkgOut ? 'dpkg' : (rpmOut ? 'rpm' : (pacmanOut ? 'pacman' : null)),
        running:    nonEmpty(processes),
      };
    } catch (error) {
      this.evidence.software.error = error.message;
    }
  }

  async collectFilePermissions() {
    try {
      const { stdout } = await runCommand(
        'ls -la /etc/shadow /etc/sudoers /etc/sudoers.d/ /etc/ssh/sshd_config /etc/pam.d/ /etc/ssl/private/ 2>/dev/null | head -60',
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

async function collectLinuxEvidence() {
  const collector = new LinuxEvidenceCollector();
  return await collector.collectAllEvidence();
}

export { LinuxEvidenceCollector, collectLinuxEvidence };