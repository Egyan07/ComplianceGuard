const { ipcMain } = require('electron');

/**
 * License IPC handlers: info, activate, deactivate, feature checks.
 */
function registerLicenseHandlers(ctx) {
  const { licenseManager } = ctx;

  ipcMain.handle('get-license-info', async () => {
    return licenseManager.getLicenseInfo();
  });

  ipcMain.handle('activate-license', async (event, keyString) => {
    try {
      const result = await licenseManager.activateLicense(keyString);
      if (result.valid) {
        ctx.getMainWindow()?.webContents.send('license-changed', licenseManager.getLicenseInfo());
      }
      return result;
    } catch (error) {
      return { valid: false, error: error.message };
    }
  });

  ipcMain.handle('deactivate-license', async () => {
    await licenseManager.deactivateLicense();
    ctx.getMainWindow()?.webContents.send('license-changed', licenseManager.getLicenseInfo());
    return { success: true };
  });

  ipcMain.handle('check-feature', async (event, featureName) => {
    return licenseManager.isFeatureAllowed(featureName);
  });
}

module.exports = registerLicenseHandlers;
