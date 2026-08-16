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
    pool: 'forks',
    execArgv: ['--require', path.resolve(__dirname, 'vitest.electron.preload.cjs')],
    include: ['electron/**/*.test.js'],
    // Used only when --coverage is passed; the default suite run is unchanged.
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['electron/**'],
    },
  },
});
