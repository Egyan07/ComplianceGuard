import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    // The E2E frontend talks to the real backend on :8000 — the default
    // VITE_API_BASE_URL already points there, so no per-test env is needed.
    extraHTTPHeaders: {},
  },
  // Start BOTH tiers: the FastAPI backend (isolated SQLite DB, rate limiting
  // disabled via ENVIRONMENT=testing so register/login don't trip the
  // per-minute limits) and the Vite dev server. This is the full-stack test
  // the old config was missing — it only ever started the frontend.
  webServer: [
    {
      command:
        'cd ../backend && ENVIRONMENT=testing DATABASE_NAME=e2e_test.db python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      url: 'http://127.0.0.1:8000/health',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
