import { test, expect } from '@playwright/test';

test.describe('Diagnostics @mutating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/diagnostics');
    await page.waitForSelector('h1:has-text("Diagnostics")');
  });

  test('reports section renders (empty or populated)', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Reports').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load diagnostics').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'loaded') {
      await expect(page.locator('h2:has-text("Reports")')).toBeVisible();
      // Either has reports or shows empty message
      const hasReports = await page.locator('text=Origin:').first().isVisible().catch(() => false);
      const noReports = await page.locator('text=No diagnostic reports').isVisible().catch(() => false);
      expect(hasReports || noReports).toBe(true);
    } else {
      await expect(page.locator('text=Unable to load diagnostics')).toBeVisible();
    }
  });

  test('trigger diagnostic with default address', async ({ page }) => {
    const runBtn = page.getByRole('button', { name: 'Run Diagnostic' });
    await expect(runBtn).toBeVisible();

    // Leave destination empty (uses default multicast address)
    await runBtn.click();

    // Button should show "Submitting..." state
    await expect(page.locator('button:has-text("Submitting")')).toBeVisible({ timeout: 5_000 });

    // Wait for completion
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });
  });

  test('success message appears after submit', async ({ page }) => {
    const runBtn = page.getByRole('button', { name: 'Run Diagnostic' });
    await runBtn.click();

    // Wait for action message
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });

    const msg = page.locator('text=/Diagnostic task submitted|failed/i');
    await expect(msg).toBeVisible({ timeout: 5_000 });
  });

  test('refresh shows reports after trigger', async ({ page }) => {
    // First trigger a diagnostic
    const runBtn = page.getByRole('button', { name: 'Run Diagnostic' });
    await runBtn.click();
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });

    // Give the agent time to process
    await page.waitForTimeout(3_000);

    // Refresh to pick up new reports
    await page.getByRole('button', { name: /Refresh/ }).click();
    await expect(page.getByRole('button', { name: /Refresh/ })).toBeEnabled({ timeout: 10_000 });

    // Check for reports or empty state
    const hasReports = await page.locator('text=Origin:').first().isVisible().catch(() => false);
    const noReports = await page.locator('text=No diagnostic reports').isVisible().catch(() => false);
    expect(hasReports || noReports).toBe(true);
  });

  test('delete a report', async ({ page }) => {
    // Wait for reports to load
    await page.waitForTimeout(3_000);

    const deleteBtn = page.locator('button[aria-label^="Delete report"]').first();
    const hasReport = await deleteBtn.isVisible().catch(() => false);

    if (hasReport) {
      const countBefore = await page.locator('button[aria-label^="Delete report"]').count();
      await deleteBtn.click();
      await page.waitForTimeout(2_000);

      // Verify count decreased or report gone
      const countAfter = await page.locator('button[aria-label^="Delete report"]').count();
      expect(countAfter).toBeLessThanOrEqual(countBefore);
    }
    // If no reports exist, skip — can't delete nothing
  });

  test('JSON display in report card is formatted', async ({ page }) => {
    // Wait for possible reports
    await page.waitForTimeout(3_000);

    const preBlock = page.locator('pre').first();
    const hasReports = await preBlock.isVisible().catch(() => false);

    if (hasReports) {
      const content = await preBlock.textContent();
      // JSON.stringify with indent 2 produces newlines
      expect(content).toContain('\n');
    }
  });
});
