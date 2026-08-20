const Module = require('module');
const path = require('path');
const mockFile = path.resolve(__dirname, '__mocks__/electron.js');
const originalLoad = Module._load;

// Fake electron-updater module (not installed in CI/Linux environments)
const fakeElectronUpdater = { autoUpdater: {} };

Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return originalLoad.call(this, mockFile, parent, isMain);
  }
  if (request === 'electron-updater') {
    return fakeElectronUpdater;
  }
  return originalLoad.call(this, request, parent, isMain);
};
