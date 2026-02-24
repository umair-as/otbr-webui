import { test, expect } from '@playwright/test';

test.describe('Navigation @readonly', () => {
  test('page title is "Thread Border Router"', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Thread Border Router');
  });

  test('all 7 nav links are visible', async ({ page }) => {
    await page.goto('/');
    const navLabels = [
      'Dashboard',
      'Topology',
      'Diagnostics',
      'Commissioner',
      'Network',
      'Dataset',
      'Energy Scan',
    ];
    for (const label of navLabels) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('navigate to each page, heading renders', async ({ page }) => {
    const pages = [
      { label: 'Dashboard', path: '/', heading: 'Dashboard' },
      { label: 'Topology', path: '/topology', heading: 'Topology' },
      { label: 'Diagnostics', path: '/diagnostics', heading: 'Diagnostics' },
      { label: 'Commissioner', path: '/commissioner', heading: 'Commissioner' },
      { label: 'Network', path: '/network', heading: 'Network' },
      { label: 'Dataset', path: '/dataset', heading: 'Dataset' },
      { label: 'Energy Scan', path: '/energy', heading: 'Energy Scan' },
    ];

    await page.goto('/');
    for (const p of pages) {
      await page.getByRole('link', { name: p.label }).click();
      await expect(page.getByRole('heading', { name: p.heading, level: 1 })).toBeVisible();
    }
  });

  test('theme toggle cycles light, dark, system', async ({ page }) => {
    await page.goto('/');

    // Start by clicking the theme toggle button
    const themeBtn = page.getByRole('button', { name: /Switch to .* mode/ });
    await expect(themeBtn).toBeVisible();

    // Click through: light -> dark
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // dark -> system
    await page.getByRole('button', { name: 'Switch to system mode' }).click();

    // system -> light
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('sidebar collapses on narrow viewport', async ({ page }) => {
    await page.goto('/');

    // On wide viewport, nav links should have text visible
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    // Resize to mobile width
    await page.setViewportSize({ width: 375, height: 667 });

    // Menu toggle button should appear
    await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  });

  test('header shows connection status badge', async ({ page }) => {
    await page.goto('/');

    // Should show one of: Connected, Connecting, Offline
    const badge = page.locator('text=/Connected|Connecting|Offline/').first();
    await expect(badge).toBeVisible({ timeout: 10_000 });
  });
});
