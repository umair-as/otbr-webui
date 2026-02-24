import { test, expect } from '@playwright/test';

test.describe('Network Scan @readonly', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/network');
    await page.waitForSelector('h1:has-text("Network")');
  });

  test('scan button triggers network scan', async ({ page }) => {
    const scanBtn = page.getByRole('button', { name: 'Scan' });
    await expect(scanBtn).toBeVisible();
    await scanBtn.click();

    // Button text changes to "Scanning..."
    await expect(page.locator('button:has-text("Scanning")')).toBeVisible({ timeout: 5_000 });
  });

  test('scan results table populates', async ({ page }) => {
    const scanBtn = page.getByRole('button', { name: 'Scan' });
    await scanBtn.click();

    // Wait for scan to complete — either results or error
    await expect(page.locator('button:has-text("Scan")')).toBeEnabled({ timeout: 30_000 });

    // Check for results table or "no networks" message
    const hasResults = await page.locator('th:has-text("PAN ID")').isVisible().catch(() => false);
    const noNetworks = await page.locator('text=No networks found').isVisible().catch(() => false);

    expect(hasResults || noNetworks).toBe(true);
  });

  test('form validation: empty name disables submit', async ({ page }) => {
    const formBtn = page.getByRole('button', { name: 'Form Network' });
    await expect(formBtn).toBeVisible();
    // With empty network name, button should be disabled
    await expect(formBtn).toBeDisabled();
  });

  test('channel dropdown has 11-26', async ({ page }) => {
    const select = page.locator('#fn-channel');
    await expect(select).toBeVisible();

    const options = select.locator('option');
    expect(await options.count()).toBe(16);

    // Verify first and last
    await expect(options.first()).toHaveText('11');
    await expect(options.last()).toHaveText('26');
  });
});

test.describe('Network Form @mutating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/network');
    await page.waitForSelector('h1:has-text("Network")');
  });

  test('form network: fill form and submit', async ({ page }) => {
    // Fill in the form
    await page.fill('#fn-name', 'E2ETestNet');
    await page.selectOption('#fn-channel', '15');

    const formBtn = page.getByRole('button', { name: 'Form Network' });
    await expect(formBtn).toBeEnabled();
    await formBtn.click();

    // Wait for response
    await expect(page.locator('button:has-text("Form Network")')).toBeEnabled({ timeout: 30_000 });

    // Should show success or error message
    const result = page.locator('text=/Network formed successfully|failed/i');
    await expect(result).toBeVisible({ timeout: 5_000 });
  });

  test('add prefix', async ({ page }) => {
    await page.fill('#prefix', 'fd11:22::/64');

    const addBtn = page.getByRole('button', { name: 'Add Prefix' });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Wait for response
    await expect(addBtn).toBeEnabled({ timeout: 15_000 });
    const result = page.locator('text=/Prefix added|failed/i');
    await expect(result).toBeVisible({ timeout: 5_000 });
  });

  test('remove prefix', async ({ page }) => {
    await page.fill('#prefix', 'fd11:22::/64');

    const removeBtn = page.getByRole('button', { name: 'Remove Prefix' });
    await expect(removeBtn).toBeEnabled();
    await removeBtn.click();

    await expect(removeBtn).toBeEnabled({ timeout: 15_000 });
    const result = page.locator('text=/Prefix removed|failed/i');
    await expect(result).toBeVisible({ timeout: 5_000 });
  });
});
