import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reset the E2E database before the suite runs so every CI/local run starts
 * from a clean slate (fresh user, no leftover data from a previous run).
 *
 * The backend is started by Playwright's webServer AFTER globalSetup runs,
 * so deleting the file here is safe — the backend recreates it (and runs
 * migrations) on startup.
 */
export default function globalSetup(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const dbPath = join(here, '..', '..', 'backend', 'e2e_test.db');
  try {
    rmSync(dbPath, { force: true });
  } catch {
    // File may not exist on a first run — nothing to do.
  }
}
