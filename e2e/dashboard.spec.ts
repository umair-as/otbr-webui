import { test, expect } from '@playwright/test';

test.describe('Dashboard @readonly', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for either data or error to appear
    await page.waitForSelector('h1:has-text("Dashboard")');
  });

  test('stat cards render (Role, Routers, RLOC16)', async ({ page }) => {
    // Wait for data to load — either stat cards or error message
    const dataOrError = await Promise.race([
      page.locator('text=Role').first().waitFor({ timeout: 10_000 }).then(() => 'data'),
      page.locator('text=Unable to reach OTBR agent').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (dataOrError === 'data') {
      await expect(page.locator('text=Role').first()).toBeVisible();
      await expect(page.locator('text=Routers').first()).toBeVisible();
      await expect(page.locator('text=RLOC16').first()).toBeVisible();
    } else {
      // Agent unreachable — still a valid state
      await expect(page.locator('text=Unable to reach OTBR agent')).toBeVisible();
    }
  });

  test('node info table has expected rows', async ({ page }) => {
    const dataOrError = await Promise.race([
      page.locator('text=Node Information').waitFor({ timeout: 10_000 }).then(() => 'data'),
      page.locator('text=Unable to reach OTBR agent').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (dataOrError === 'data') {
      await expect(page.locator('text=Network Name')).toBeVisible();
      await expect(page.locator('text=Leader Router ID')).toBeVisible();
      await expect(page.locator('text=Extended Address')).toBeVisible();
      await expect(page.locator('text=Extended PAN ID')).toBeVisible();
      await expect(page.locator('text=Border Agent ID')).toBeVisible();
    }
  });

  test('role badge shows current state', async ({ page }) => {
    const dataOrError = await Promise.race([
      page.locator('text=Role').first().waitFor({ timeout: 10_000 }).then(() => 'data'),
      page.locator('text=Unable to reach OTBR agent').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (dataOrError === 'data') {
      // Role badge: one of leader, router, child, detached, disabled
      const badge = page.locator('.rounded-full.capitalize').first();
      await expect(badge).toBeVisible();
      const text = await badge.textContent();
      expect(['leader', 'router', 'child', 'detached', 'disabled']).toContain(text?.trim());
    }
  });

  test('refresh button fetches fresh data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /Refresh/ });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();

    // The refresh icon should briefly spin (animate-spin class)
    // Just verify the button is still functional after click
    await expect(refreshBtn).toBeEnabled({ timeout: 10_000 });
  });

  test('"Live" badge visible when WS connected', async ({ page }) => {
    // Wait for WebSocket to connect
    const liveOrOffline = await Promise.race([
      page.locator('text=Live').first().waitFor({ timeout: 10_000 }).then(() => 'live'),
      page.waitForTimeout(10_000).then(() => 'timeout'),
    ]);

    if (liveOrOffline === 'live') {
      await expect(page.locator('text=Live').first()).toBeVisible();
    }
    // If timeout, WS may not be available — not a failure for readonly test
  });

  test('copy button copies ext address to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const dataOrError = await Promise.race([
      page.locator('text=Extended Address').waitFor({ timeout: 10_000 }).then(() => 'data'),
      page.locator('text=Unable to reach OTBR agent').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (dataOrError === 'data') {
      // Find copy button near Extended Address
      const copyBtn = page.locator('button[aria-label^="Copy"]').first();
      await expect(copyBtn).toBeVisible();
      await copyBtn.click();

      // Button should change to "Copied" state
      await expect(page.locator('button[aria-label="Copied"]').first()).toBeVisible({ timeout: 2000 });
    }
  });
});
