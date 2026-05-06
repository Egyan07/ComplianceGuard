// Stub for electron — resolved via Vite alias in vitest.config.electron.cjs.
// vi.mock('electron', factory) in tests will override this at runtime.
module.exports = {
  powerMonitor: { on: () => {} },
  Notification: class {
    constructor() {}
    show() {}
    static isSupported() { return false; }
  },
};
