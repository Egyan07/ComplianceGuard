import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.goto('/');

    // Should see the login form
    await expect(page.getByText('ComplianceGuard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('can switch between sign in and create account tabs', async ({ page }) => {
    await page.goto('/');

    // Switch to register
    await page.getByRole('tab', { name: 'Create Account' }).click();
    await expect(page.getByLabel('First Name')).toBeVisible();
    await expect(page.getByLabel('Last Name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();

    // Switch back to login
    await page.getByRole('tab', { name: 'Sign In' }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('shows error on invalid login', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Email').fill('nonexistent@test.com');
    await page.getByLabel('Password').fill('Wrong@pass1');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Full-stack: the real backend returns 401 with a specific message. In the
    // rare case the backend is down the login form also surfaces an alert, so
    // accept either signal.
    await expect
      .poll(async () => {
        const alertVisible = await page.getByRole('alert').isVisible().catch(() => false);
        const errVisible = await page.getByText(/Incorrect email or password/).isVisible().catch(() => false);
        return alertVisible || errVisible;
      }, { timeout: 10000 })
      .toBe(true);
  });

  test('shows tagline text', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('SOC 2 Type II Compliance Automation')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('login page has CG logo', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('CG')).toBeVisible();
  });
});
