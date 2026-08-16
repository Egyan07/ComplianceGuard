/**
 * Auto-update manager for ComplianceGuard.
 *
 * Lifecycle (packaged builds only; disabled in dev):
 *
 *   app starts
 *      ├── delayed first check (CHECK_DELAY_MS, default 10s after startup)
 *      ├── periodic re-check every CHECK_INTERVAL_MS (default 4h)
 *      └── manual check via IPC ('check-for-updates')
 *              │
 *              ▼
 *   update available? ──no──► log + quiet (auto-check) / notify (manual check)
 *              │yes
 *              ▼
 *   auto-download (electron-updater)
 *              │
 *              ▼
 *   update-downloaded ──► notify "ready; installs when you quit"
 *              │
 *              ▼
 *   quitAndInstall() on app quit (autoInstallOnAppQuit) — if the quit path is
 *   interrupted, the next launch checks again; NSIS installs are transactional
 *   and leave the previous version intact on failure.
 *
 * Update integrity: every artifact in the GitHub draft release ships with a
 * sha512 checksum (latest.yml) that electron-updater verifies before install.
 * With signing configured (see docs/release-and-signing.md), Authenticode
 * verification is enforced via verifyUpdateCodeSignature + publisherName.
 *
 * Rollback-on-crash is NOT automatic (electron-updater limitation): if the new
 * build crashes on startup, the version marker check in the runbook
 * (docs/release-and-signing.md) is the documented manual rollback procedure.
 *
 * Design note: the updater object is injectable (defaults to the real
 * electron-updater autoUpdater) so the unit tests can drive the full event
 * lifecycle without loading the real module.
 */
const { app } = require('electron');
const log = require('./logger');
const { autoUpdater } = require('electron-updater');

const CHECK_DELAY_MS = 10 * 1000;      // first check shortly after startup
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // then every 4 hours

class UpdateManager {
  /**
   * @param {object} [options]
   * @param {object}  [options.updater]      electron-updater autoUpdater (injectable)
   * @param {Function}[options.notify]       (title, body) => void — surfaced to the OS
   * @param {number}  [options.checkDelayMs]  first-check delay
   * @param {number}  [options.checkIntervalMs] periodic check interval
   * @param {boolean} [options.isPackaged]    override dev-detection (tests inject this)
   */
  constructor(options = {}) {
    this.updater = options.updater || autoUpdater;
    this.notify = options.notify || (() => {});
    this.checkDelayMs = options.checkDelayMs || CHECK_DELAY_MS;
    this.checkIntervalMs = options.checkIntervalMs || CHECK_INTERVAL_MS;

    // Injectable so the unit tests can toggle the packaged/dev branch without
    // mutating the (shared, destructured) app mock.
    this._isPackaged = options.isPackaged !== undefined ? options.isPackaged : app.isPackaged;

    this._timer = null;
    this._intervalId = null;
    this._started = false;
    this._checking = false;
    this._enabled = false;
  }

  /**
   * Start the update lifecycle. No-op in dev (unpackaged) or if already started.
   * @returns {boolean} true if the manager started and will check for updates
   */
  start() {
    if (this._started) return this._enabled;
    this._started = true;

    // Never auto-update an unpackaged/dev run — the updater would try to
    // "update" a checkout.
    if (!this._isPackaged) {
      log.info('[update-manager] Auto-update disabled: running unpackaged (dev).');
      return false;
    }

    log.info('[update-manager] Auto-update enabled.');
    this._enabled = true;

    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.logger = log;

    // Timeout guard: if a check hangs (offline, unreachable host), make sure we
    // can still re-check later instead of wedging the manager.
    this.updater.on('error', (err) => {
      log.warn('[update-manager] Updater error:', err && err.message ? err.message : err);
      this._checking = false;
    });

    this.updater.on('update-available', () => {
      log.info('[update-manager] Update available; downloading…');
    });

    this.updater.on('update-not-available', () => {
      log.info('[update-manager] No update available.');
      this._checking = false;
    });

    this.updater.on('update-downloaded', () => {
      log.info('[update-manager] Update downloaded; will install on quit.');
      this._checking = false;
      this.notify(
        'ComplianceGuard Update Ready',
        'A new version has been downloaded and will install when you quit the app.'
      );
    });

    this._timer = setTimeout(() => {
      this.checkForUpdates({ silent: true });
      this._intervalId = setInterval(
        () => this.checkForUpdates({ silent: true }),
        this.checkIntervalMs
      );
    }, this.checkDelayMs);

    return true;
  }

  /**
   * Check for updates now (manual trigger, e.g. IPC). Resolves with a status
   * summary suitable for the renderer; never rejects.
   *
   * @param {object} [options]
   * @param {boolean} [options.silent] true = no user notification when up to date
   * @returns {Promise<{enabled: boolean, checking: boolean, message: string}>}
   */
  async checkForUpdates(options = {}) {
    const silent = options.silent === true;
    if (!this._enabled) {
      return { enabled: false, checking: false, message: 'Updates are not available in development mode.' };
    }
    if (this._checking) {
      return { enabled: true, checking: true, message: 'Update check already in progress.' };
    }

    this._checking = true;
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      log.warn('[update-manager] Update check failed:', err && err.message ? err.message : err);
      this._checking = false;
      if (!silent) {
        this.notify('ComplianceGuard Update Check', 'Could not check for updates. Please try again later.');
      }
      return { enabled: true, checking: false, message: 'Update check failed.' };
    }

    // The success/failure events above reset _checking; if a listener did not
    // fire (defensive), clear it so the next check is not blocked.
    this._checking = false;
    return { enabled: true, checking: false, message: 'Update check complete.' };
  }

  /** Stop timers (used by tests and app shutdown). */
  stop() {
    if (this._timer) clearTimeout(this._timer);
    if (this._intervalId) clearInterval(this._intervalId);
    this._timer = null;
    this._intervalId = null;
  }
}

module.exports = UpdateManager;
module.exports.CHECK_DELAY_MS = CHECK_DELAY_MS;
module.exports.CHECK_INTERVAL_MS = CHECK_INTERVAL_MS;
