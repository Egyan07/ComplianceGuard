/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into stable, cacheable chunks so the
        // shared shell (Topbar/Sidebar) doesn't force one giant bundle and a
        // single dep bump doesn't invalidate every route chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@mui/icons-material', '@mui/lab', '@emotion/react', '@emotion/styled'],
          framer: ['framer-motion'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // Floor measured at 77.4% (Aug 2026); keep new code from eroding it.
      thresholds: {
        statements: 75,
        lines: 75,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
    deps: {
      optimizer: {
        // Pre-bundle the @mui/icons-material barrel with esbuild. Importing
        // named icons from it otherwise makes Vitest transform all ~2,300
        // icon modules per test file (the production build pre-bundles it, so
        // only tests pay this cost) — this took the suite from ~5s to 9+ min.
        web: { enabled: true, include: ['@mui/icons-material'] },
      },
    },
  }
})
