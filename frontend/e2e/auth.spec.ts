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

    // Should show an error alert (backend unreachable or auth failure)
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
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
