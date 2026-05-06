// Loaded by vitest.electron.preload.cjs so all require('electron') calls in the
// worker see this stub. Tests spy on powerMonitor.on via the shared object reference.
module.exports = {
  powerMonitor: { on: () => {}, removeListener: () => {} },
  Notification: class {
    constructor() {}
    show() {}
    static isSupported() { return false; }
  },
};
