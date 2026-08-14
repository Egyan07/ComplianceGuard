const { app, ipcMain } = require('electron');

/**
 * App-level IPC handlers: version, system info, notifications.
 */
function registerAppHandlers(ctx) {
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('show-notification', (event, title, body) => {
    ctx.showNotification(title, body);
  });

  ipcMain.handle('get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      electronVersion: process.versions.electron
    };
  });
}

module.exports = registerAppHandlers;
