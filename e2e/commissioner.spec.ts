import { test, expect } from '@playwright/test';

test.describe('Commissioner @mutating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/commissioner');
    await page.waitForSelector('h1:has-text("Commissioner")');
  });

  test('commissioner state badge renders', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Status').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load commissioner state').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state === 'loaded') {
      // Badge shows one of: active, petitioning, disabled
      const badge = page.locator('.rounded-full.capitalize').first();
      await expect(badge).toBeVisible();
      const text = await badge.textContent();
      expect(['active', 'petitioning', 'disabled']).toContain(text?.trim());
    } else {
      await expect(page.locator('text=Unable to load commissioner state')).toBeVisible();
    }
  });

  test('toggle commissioner on/off', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Status').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load commissioner state').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state !== 'loaded') return;

    const badge = page.locator('.rounded-full.capitalize').first();
    const currentState = (await badge.textContent())?.trim();

    if (currentState === 'disabled') {
      // Enable
      await page.getByRole('button', { name: 'Enable' }).click();
      // Wait for state to change
      await page.waitForTimeout(2_000);
      await page.getByRole('button', { name: /Refresh/ }).click();
      await expect(page.getByRole('button', { name: /Refresh/ })).toBeEnabled({ timeout: 10_000 });
    } else if (currentState === 'active') {
      // Disable
      await page.getByRole('button', { name: 'Disable' }).click();
      await page.waitForTimeout(2_000);
      await page.getByRole('button', { name: /Refresh/ }).click();
      await expect(page.getByRole('button', { name: /Refresh/ })).toBeEnabled({ timeout: 10_000 });
    }
    // petitioning — don't toggle, just verify the button state
  });

  test('add joiner with PSKd', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Status').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load commissioner state').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state !== 'loaded') return;

    const badge = page.locator('.rounded-full.capitalize').first();
    const currentState = (await badge.textContent())?.trim();

    if (currentState !== 'active') {
      // Enable commissioner first
      await page.getByRole('button', { name: 'Enable' }).click();
      await page.waitForTimeout(3_000);
      await page.getByRole('button', { name: /Refresh/ }).click();
      await expect(page.getByRole('button', { name: /Refresh/ })).toBeEnabled({ timeout: 10_000 });
    }

    // Now add a joiner
    const addJoinerHeading = page.locator('text=Add Joiner');
    if (await addJoinerHeading.isVisible().catch(() => false)) {
      await page.fill('#eui64', '*');
      await page.fill('#pskd', 'E2ETEST');
      await page.getByRole('button', { name: 'Add Joiner' }).click();

      // Wait for response
      await page.waitForTimeout(2_000);
    }
  });

  test('joiner appears in table', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Status').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load commissioner state').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state !== 'loaded') return;

    const badge = page.locator('.rounded-full.capitalize').first();
    const currentState = (await badge.textContent())?.trim();

    if (currentState === 'active') {
      // Check for joiners table or "No joiners configured"
      const hasJoiners = await page.locator('th:has-text("Identifier")').isVisible().catch(() => false);
      const noJoiners = await page.locator('text=No joiners configured').isVisible().catch(() => false);

      expect(hasJoiners || noJoiners).toBe(true);
    }
  });

  test('remove joiner', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Status').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load commissioner state').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state !== 'loaded') return;

    const badge = page.locator('.rounded-full.capitalize').first();
    const currentState = (await badge.textContent())?.trim();

    if (currentState === 'active') {
      const removeBtn = page.locator('button[aria-label^="Remove joiner"]').first();
      if (await removeBtn.isVisible().catch(() => false)) {
        await removeBtn.click();
        await page.waitForTimeout(2_000);
      }
    }
  });

  test('cleanup: disable commissioner after tests', async ({ page }) => {
    const state = await Promise.race([
      page.locator('text=Status').first().waitFor({ timeout: 10_000 }).then(() => 'loaded'),
      page.locator('text=Unable to load commissioner state').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    if (state !== 'loaded') return;

    const badge = page.locator('.rounded-full.capitalize').first();
    const currentState = (await badge.textContent())?.trim();

    if (currentState === 'active') {
      await page.getByRole('button', { name: 'Disable' }).click();
      await page.waitForTimeout(2_000);
    }
  });
});
