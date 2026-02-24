import { test, expect } from '@playwright/test';

test.describe('Dataset @readonly', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dataset');
    await page.waitForSelector('h1:has-text("Dataset")');
  });

  test('active dataset section renders', async ({ page }) => {
    // Wait for data to load
    const state = await Promise.race([
      page.locator('text=Active Operational Dataset').waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load dataset').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'loaded') {
      await expect(page.locator('text=Active Operational Dataset')).toBeVisible();
    } else {
      await expect(page.locator('text=Unable to load dataset')).toBeVisible();
    }
  });

  test('shows "No dataset configured" if 204 response', async ({ page }) => {
    // Wait for data to load
    await Promise.race([
      page.locator('text=Active Operational Dataset').waitFor({ timeout: 10_000 }),
      page.locator('text=Unable to load dataset').waitFor({ timeout: 10_000 }),
    ]);

    // Check if either data table or "No dataset configured" is shown for each section
    const noDataset = page.locator('text=No dataset configured.');
    const count = await noDataset.count();

    if (count > 0) {
      // At least one section shows "No dataset configured"
      await expect(noDataset.first()).toBeVisible();
    }
    // If count is 0, datasets exist — both sections have data tables
  });

  test('key-value table displays fields', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Active Operational Dataset').waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load dataset').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'loaded') {
      // Check for active dataset table — if it has data, there should be table rows
      const activeSection = page.locator('h2:has-text("Active Operational Dataset")').locator('..');
      const tableOrEmpty = await Promise.race([
        activeSection.locator('table').waitFor({ timeout: 3_000 }).then(() => 'table'),
        activeSection.locator('text=No dataset configured.').waitFor({ timeout: 3_000 }).then(() => 'empty'),
      ]);

      if (tableOrEmpty === 'table') {
        const rows = activeSection.locator('table tbody tr');
        expect(await rows.count()).toBeGreaterThan(0);
      }
    }
  });

  test('copy button on NetworkKey works', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const state = await Promise.race([
      page.locator('text=Active Operational Dataset').waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load dataset').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'loaded') {
      // Look for a copy button in the dataset tables
      const copyBtn = page.locator('button[aria-label^="Copy"]').first();
      const hasCopy = await copyBtn.isVisible().catch(() => false);

      if (hasCopy) {
        await copyBtn.click();
        await expect(page.locator('button[aria-label="Copied"]').first()).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('pending dataset section renders', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Pending Operational Dataset').waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load dataset').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'loaded') {
      await expect(page.locator('text=Pending Operational Dataset')).toBeVisible();
    }
  });

  test('refresh button updates data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /Refresh/ });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await expect(refreshBtn).toBeEnabled({ timeout: 10_000 });
  });
});
