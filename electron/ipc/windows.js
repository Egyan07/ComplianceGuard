const { ipcMain } = require('electron');
const log = require('../logger');
const { WindowsEvidenceCollector } = require('../system/windows');

// Matches the allowlist enforced in preload.js (windowsAPI.getEventLogs).
const ALLOWED_LOG_NAMES = ['Security', 'System', 'Application'];
const MAX_EVENT_LIMIT = 1000;

/**
 * Windows-only live-query IPC handlers backing the `windowsAPI` preload
 * surface (get-event-logs, get-services, get-firewall-status). These are
 * single-purpose OS queries for the renderer, distinct from the batch
 * evidence collection flow.
 *
 * Inputs are validated here in the main process too (allowlist + range) so
 * the boundary never trusts the renderer — even though preload also checks.
 */
function registerWindowsHandlers() {
  const collector = new WindowsEvidenceCollector();

  ipcMain.handle('get-event-logs', async (event, logName, limit = 100) => {
    if (!ALLOWED_LOG_NAMES.includes(logName)) {
      return { error: `Invalid log name. Allowed: ${ALLOWED_LOG_NAMES.join(', ')}` };
    }
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), MAX_EVENT_LIMIT);
    if (process.platform !== 'win32') {
      return { error: 'Event logs are only available on Windows.' };
    }
    try {
      return await collector.getEventLog(logName, safeLimit);
    } catch (error) {
      log.error(`get-event-logs failed (${logName}):`, error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-services', async () => {
    if (process.platform !== 'win32') {
      return { error: 'Services are only available on Windows.' };
    }
    try {
      return await collector.getServicesList();
    } catch (error) {
      log.error('get-services failed:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-firewall-status', async () => {
    if (process.platform !== 'win32') {
      return { error: 'Firewall status is only available on Windows.' };
    }
    try {
      return await collector.getFirewallStatus();
    } catch (error) {
      log.error('get-firewall-status failed:', error);
      return { error: error.message };
    }
  });
}

module.exports = registerWindowsHandlers;
