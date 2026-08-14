const { ipcMain } = require('electron');
const CloudSync = require('../cloud-sync');

/**
 * Cloud sync IPC handlers: connect, sync, config, disconnect.
 */
function registerCloudHandlers(ctx) {
  const { database } = ctx;

  ipcMain.handle('cloud-connect', async (event, serverUrl, email, password) => {
    return await CloudSync.cloudConnect(database, serverUrl, email, password);
  });

  ipcMain.handle('cloud-sync', async (event, syncData) => {
    return await CloudSync.cloudSync(database, syncData);
  });

  ipcMain.handle('cloud-get-config', async () => {
    return await CloudSync.getCloudConfig(database);
  });

  ipcMain.handle('cloud-disconnect', async () => {
    return await CloudSync.clearCloudConfig(database);
  });
}

module.exports = registerCloudHandlers;
