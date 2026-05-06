const Module = require('module');
const path = require('path');
const mockFile = path.resolve(__dirname, '__mocks__/electron.js');
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return originalLoad.call(this, mockFile, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};
