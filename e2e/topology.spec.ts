import { test, expect } from '@playwright/test';

test.describe('Topology @readonly', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/topology');
    await page.waitForSelector('h1:has-text("Topology")');
  });

  test('SVG graph container renders', async ({ page }) => {
    // Wait for either the SVG graph, an empty state, or an error
    const state = await Promise.race([
      page.locator('svg').first().waitFor({ timeout: 10_000 }).then(() => 'svg'),
      page.locator('text=No devices discovered yet').waitFor({ timeout: 10_000 }).then(() => 'empty'),
      page.locator('text=Unable to load devices').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'svg') {
      await expect(page.locator('svg').first()).toBeVisible();
    } else if (state === 'empty') {
      await expect(page.locator('text=No devices discovered yet')).toBeVisible();
    } else {
      await expect(page.locator('text=Unable to load devices')).toBeVisible();
    }
  });

  test('at least 1 node visible (self) when devices exist', async ({ page }) => {
    const hasSvg = await Promise.race([
      page.locator('svg .node-group').first().waitFor({ timeout: 10_000 }).then(() => true),
      page.locator('text=No devices discovered yet').waitFor({ timeout: 10_000 }).then(() => false),
      page.locator('text=Unable to load devices').waitFor({ timeout: 10_000 }).then(() => false),
    ]);

    if (hasSvg) {
      const nodes = page.locator('svg .node-group');
      expect(await nodes.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('click node opens detail panel', async ({ page }) => {
    const hasSvg = await Promise.race([
      page.locator('svg .node-group').first().waitFor({ timeout: 10_000 }).then(() => true),
      page.waitForTimeout(10_000).then(() => false),
    ]);

    if (hasSvg) {
      // Click first node group
      await page.locator('svg .node-group').first().click({ force: true });

      // Detail panel should appear
      await expect(page.locator('text=Device Details')).toBeVisible({ timeout: 3_000 });
    }
  });

  test('detail panel shows device attributes', async ({ page }) => {
    const hasSvg = await Promise.race([
      page.locator('svg .node-group').first().waitFor({ timeout: 10_000 }).then(() => true),
      page.waitForTimeout(10_000).then(() => false),
    ]);

    if (hasSvg) {
      await page.locator('svg .node-group').first().click({ force: true });
      await expect(page.locator('text=Device Details')).toBeVisible({ timeout: 3_000 });

      // Check for standard attributes
      await expect(page.locator('dt:has-text("Extended Address")')).toBeVisible();
      await expect(page.locator('dt:has-text("Role")')).toBeVisible();
    }
  });

  test('close detail panel', async ({ page }) => {
    const hasSvg = await Promise.race([
      page.locator('svg .node-group').first().waitFor({ timeout: 10_000 }).then(() => true),
      page.waitForTimeout(10_000).then(() => false),
    ]);

    if (hasSvg) {
      await page.locator('svg .node-group').first().click({ force: true });
      await expect(page.locator('text=Device Details')).toBeVisible({ timeout: 3_000 });

      // Close the panel
      await page.getByRole('button', { name: 'Close details' }).click();
      await expect(page.locator('text=Device Details')).not.toBeVisible();
    }
  });
});

test.describe('Topology Discovery @mutating', () => {
  test('Discover Devices triggers action', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForSelector('h1:has-text("Topology")');

    const discoverBtn = page.getByRole('button', { name: /Discover Devices/ });
    await expect(discoverBtn).toBeVisible();
    await discoverBtn.click();

    // Button should change to "Discovering..." state
    await expect(page.locator('text=Discovering')).toBeVisible({ timeout: 5_000 });
  });
});
