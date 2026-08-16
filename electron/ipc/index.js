const registerAppHandlers = require('./app');
const registerCloudHandlers = require('./cloud');
const registerComplianceHandlers = require('./compliance');
const registerEnterpriseHandlers = require('./enterprise');
const registerEvidenceHandlers = require('./evidence');
const registerFrameworkHandlers = require('./frameworks');
const registerLicenseHandlers = require('./license');
const registerSettingsHandlers = require('./settings');
const registerWindowsHandlers = require('./windows');

/**
 * Register every IPC handler group with the shared context.
 *
 * @param {object} ctx
 * @param {object} ctx.database              ComplianceGuardDatabase instance
 * @param {object} ctx.evidenceProcessor     LocalEvidenceProcessor instance
 * @param {object} ctx.canonicalEngine       CanonicalEngine instance (scoring path)
 * @param {object} ctx.reportGenerator       ReportGenerator instance
 * @param {object} ctx.licenseManager        LicenseManager instance
 * @param {object} ctx.updateManager         UpdateManager instance (auto-update)
 * @param {Function} ctx.showNotification    (title, body) => void
 * @param {Function} ctx.getMainWindow       () => BrowserWindow | null
 */
function registerIpcHandlers(ctx) {
  registerAppHandlers(ctx);
  registerEvidenceHandlers(ctx);
  registerComplianceHandlers(ctx);
  registerLicenseHandlers(ctx);
  registerSettingsHandlers(ctx);
  registerCloudHandlers(ctx);
  registerFrameworkHandlers(ctx);
  registerEnterpriseHandlers(ctx);
  // No ctx needed — the Windows live-query handlers are platform-guarded inside.
  registerWindowsHandlers();
}

module.exports = registerIpcHandlers;
