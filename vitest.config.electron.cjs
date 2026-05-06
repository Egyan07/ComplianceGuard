const { defineConfig } = require('vitest/config');
const path = require('path');

module.exports = defineConfig({
  resolve: {
    alias: {
      electron: path.resolve(__dirname, '__mocks__/electron.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['electron/**/*.test.js'],
  },
});
