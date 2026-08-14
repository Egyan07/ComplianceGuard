// Loaded by vitest.electron.preload.cjs so all require('electron') calls in the
// worker see this stub. Tests spy on powerMonitor.on via the shared object
// reference. ipcMain.registeredHandlers lets IPC-module tests capture and
// invoke the handlers as if the renderer had called them.
module.exports = {
  powerMonitor: { on: () => {}, removeListener: () => {} },
  Notification: class {
    constructor() {}
    show() {}
    static isSupported() { return false; }
  },
  ipcMain: {
    registeredHandlers: {},
    handle(channel, handler) {
      this.registeredHandlers[channel] = handler;
    },
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: null }),
  },
  BrowserWindow: class {},
  // `name` present so electron-log takes the `app.name` branch instead of
  // calling app.getName() (which it would otherwise do for any app object).
  app: { getVersion: () => '0.0.0', name: 'complianceguard-test', getName: () => 'complianceguard-test' },
};
