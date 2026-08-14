import { test, expect } from '@playwright/test';

/**
 * Full-stack E2E — the frontend talks to the REAL FastAPI backend (started by
 * the webServer array in playwright.config.ts against an isolated SQLite DB).
 * These tests prove the browser tier and API tier integrate, which the old
 * backend-less auth.spec.ts never could.
 *
 * Each test uses a unique email so retries (Playwright retries: 1) and repeat
 * local runs don't collide with rows left by a previous run.
 */

const PASSWORD = 'E2e!pass1234'; // meets: >=8 chars, upper, lower, digit, special

function uniqueEmail(prefix: string): string {
  // example.com is the RFC 2606 reserved domain — valid for email validation
  // (the backend rejects special-use/reserved TLDs like .test).
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test.describe('Full-stack auth flow', () => {
  test('registers a new account and lands on the dashboard', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'Create Account' }).click();
    await page.getByLabel('First Name').fill('E2E');
    await page.getByLabel('Last Name').fill('Tester');
    await page.getByLabel('Email').fill(uniqueEmail('register'));
    await page.getByLabel('Password').fill(PASSWORD);

    await page.getByRole('button', { name: 'Create Account' }).click();

    // Registration hits the real backend; success navigates into the app shell.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Monitor your compliance status/)).toBeVisible();
  });

  test('logs in an existing account and sees dashboard data from the API', async ({ page }) => {
    // Seed a user through the real backend API first.
    const email = uniqueEmail('login');
    const registerRes = await page.request.post('http://127.0.0.1:8000/api/v1/auth/register', {
      data: {
        email,
        password: PASSWORD,
        first_name: 'E2E',
        last_name: 'Login',
      },
    });
    expect(registerRes.ok()).toBeTruthy();

    await page.goto('/');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  });

  test('rejects invalid credentials with an error', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill('nobody@e2e.test');
    await page.getByLabel('Password').fill('Wrong!pass1');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The real backend returns 401 with a specific detail message.
    await expect(page.getByText(/Incorrect email or password/)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Full-stack navigation', () => {
  test('registered user can navigate between authenticated pages', async ({ page }) => {
    const email = uniqueEmail('nav');
    const registerRes = await page.request.post('http://127.0.0.1:8000/api/v1/auth/register', {
      data: {
        email,
        password: PASSWORD,
        first_name: 'E2E',
        last_name: 'Nav',
      },
    });
    expect(registerRes.ok()).toBeTruthy();

    await page.goto('/');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Sidebar navigation between authenticated routes.
    await page.getByText('History', { exact: true }).click();
    await expect(page).toHaveURL(/#\/history/);

    await page.getByText('Settings', { exact: true }).click();
    await expect(page).toHaveURL(/#\/settings/);

    // Settings renders real backend-derived data (version constant).
    await expect(page.getByText('Version', { exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByText('Dashboard', { exact: true }).click();
    await expect(page).toHaveURL(/#\/$/);
  });
});
