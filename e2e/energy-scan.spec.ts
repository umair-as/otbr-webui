import { test, expect } from '@playwright/test';

test.describe('Energy Scan @mutating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/energy');
    await page.waitForSelector('h1:has-text("Energy Scan")');
  });

  test('channel toggle buttons render (11-26)', async ({ page }) => {
    for (let ch = 11; ch <= 26; ch++) {
      // Channel buttons are inside the Channels section
      const btn = page.locator(`button.rounded-lg.font-mono:has-text("${ch}")`).first();
      await expect(btn).toBeVisible();
    }
  });

  test('deselect all channels disables Start Scan', async ({ page }) => {
    // Deselect all channels (they start selected)
    for (let ch = 11; ch <= 26; ch++) {
      const btn = page.locator(`button.rounded-lg.font-mono:has-text("${ch}")`).first();
      // Only click if currently selected (has bg-accent class)
      const classes = await btn.getAttribute('class');
      if (classes?.includes('bg-accent')) {
        await btn.click();
      }
    }

    // Start Scan button should be disabled
    const startBtn = page.getByRole('button', { name: 'Start Scan' });
    await expect(startBtn).toBeDisabled();
  });

  test('start energy scan with selected channels', async ({ page }) => {
    // Keep only a few channels selected for faster scan
    // Deselect all first
    for (let ch = 11; ch <= 26; ch++) {
      const btn = page.locator(`button.rounded-lg.font-mono:has-text("${ch}")`).first();
      const classes = await btn.getAttribute('class');
      if (classes?.includes('bg-accent')) {
        await btn.click();
      }
    }

    // Select just channels 15 and 20
    await page.locator('button.rounded-lg.font-mono:has-text("15")').first().click();
    await page.locator('button.rounded-lg.font-mono:has-text("20")').first().click();

    // Set low sample count for speed
    await page.fill('#es-count', '2');
    await page.fill('#es-period', '100');

    const startBtn = page.getByRole('button', { name: 'Start Scan' });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    // Button should change to "Scanning..."
    await expect(page.locator('button:has-text("Scanning")')).toBeVisible({ timeout: 5_000 });

    // Wait for scan to complete
    await expect(startBtn).toBeEnabled({ timeout: 60_000 });
  });

  test('results table shows channel and RSSI data', async ({ page }) => {
    // Select a single channel for fast scan
    for (let ch = 11; ch <= 26; ch++) {
      const btn = page.locator(`button.rounded-lg.font-mono:has-text("${ch}")`).first();
      const classes = await btn.getAttribute('class');
      if (classes?.includes('bg-accent') && ch !== 15) {
        await btn.click();
      }
    }

    await page.fill('#es-count', '2');
    await page.fill('#es-period', '100');

    const startBtn = page.getByRole('button', { name: 'Start Scan' });
    await startBtn.click();
    await expect(startBtn).toBeEnabled({ timeout: 60_000 });

    // Check for results table or empty state
    const hasResults = await page.locator('th:has-text("Channel")').isVisible().catch(() => false);
    const noData = await page.locator('text=No energy scan data returned').isVisible().catch(() => false);

    expect(hasResults || noData).toBe(true);

    if (hasResults) {
      await expect(page.locator('th:has-text("Max RSSI (dBm)")')).toBeVisible();
    }
  });

  test('sample count and period inputs work', async ({ page }) => {
    const countInput = page.locator('#es-count');
    const periodInput = page.locator('#es-period');

    await expect(countInput).toBeVisible();
    await expect(periodInput).toBeVisible();

    await countInput.fill('5');
    await expect(countInput).toHaveValue('5');

    await periodInput.fill('500');
    await expect(periodInput).toHaveValue('500');
  });
});
